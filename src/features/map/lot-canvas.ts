import L from 'leaflet'
import { STATUS_APPEARANCE, STATUS_BADGE, ZOOM, type LotId, type Polygon } from '@/domain'
import { pointInFlatPolygon, topLeftVertex } from '@/lib/geo'
import {
  badgeInk,
  badgeRing,
  hairline,
  labelInk,
  patternInk,
  themeColor,
  withAlpha,
} from './colors'
import type { LotPaint } from './paint'

/**
 * ONE canvas, 904 lots, zero React nodes.
 *
 * React's reconciler has nothing useful to do here — there is a single DOM
 * element. Keeping the draw loop outside the component tree means a filter
 * change does not cascade through 904 subtrees, and it makes the rAF
 * coalescing trivial. `LotCanvasLayer.tsx` is the thin React wrapper that
 * pushes props onto this object imperatively.
 */

export interface LotRecord {
  id: LotId
  polygon: Polygon
  centroid: [number, number]
  /** Lot number, drawn at zoom ≥ ZOOM.labelsVisible. */
  label: string
}

export interface CanvasFlags {
  dark: boolean
  showLabels: boolean
  selectedId: LotId | null
  hoveredId: LotId | null
  multiSelected: Set<LotId>
}

export interface LotCanvasHandlers {
  onPick?: (id: LotId | null, ev: L.LeafletMouseEvent) => void
  onHover?: (id: LotId | null, ev: L.LeafletMouseEvent | null) => void
  onStats?: (ms: number, lots: number) => void
}

const MAX_DPR = 2
const CULL_PAD = 0.2
const CROSSFADE_MS = 200

export class LotCanvas extends L.Layer {
  private _canvas: HTMLCanvasElement | null = null
  private _ctx: CanvasRenderingContext2D | null = null
  private _fade: HTMLCanvasElement | null = null
  private _fadeCtx: CanvasRenderingContext2D | null = null

  private _records: LotRecord[] = []
  private _paints: LotPaint[] = []
  private _flags: CanvasFlags = {
    dark: false,
    showLabels: false,
    selectedId: null,
    hoveredId: null,
    multiSelected: new Set(),
  }
  private _handlers: LotCanvasHandlers
  private _active = true

  // ── projection cache, keyed on zoom ───────────────────────────────
  private _projZoom = Number.NaN
  private _proj = new Float64Array(0)
  private _start = new Int32Array(0)
  private _count = new Int32Array(0)
  /** Absolute CRS-pixel bbox per lot: minX, minY, maxX, maxY. */
  private _bbox = new Float64Array(0)

  private _visible: Int32Array = new Int32Array(0)
  private _visibleCount = 0

  private _frame: number | null = null
  private _pendingFade = false
  private _fadeTimer: number | null = null
  private _hoverFrame: number | null = null
  private _lastHoverEvent: L.LeafletMouseEvent | null = null

  constructor(handlers: LotCanvasHandlers = {}) {
    super()
    this._handlers = handlers
  }

  // ── Leaflet lifecycle ─────────────────────────────────────────────

  override onAdd(map: L.Map): this {
    const canvas = L.DomUtil.create('canvas', 'shelter-lot-canvas leaflet-layer')
    const fade = L.DomUtil.create('canvas', 'shelter-lot-canvas shelter-lot-fade leaflet-layer')
    if (map.options.zoomAnimation && L.Browser.any3d) {
      canvas.classList.add('leaflet-zoom-animated')
      fade.classList.add('leaflet-zoom-animated')
    }
    this._canvas = canvas
    this._fade = fade
    this._ctx = canvas.getContext('2d')
    this._fadeCtx = fade.getContext('2d')

    const pane = map.getPanes().overlayPane
    pane.appendChild(fade)
    pane.appendChild(canvas)

    this._projZoom = Number.NaN
    this._reset()
    return this
  }

  override onRemove(map: L.Map): this {
    if (this._frame !== null) cancelAnimationFrame(this._frame)
    if (this._hoverFrame !== null) cancelAnimationFrame(this._hoverFrame)
    if (this._fadeTimer !== null) window.clearTimeout(this._fadeTimer)
    this._canvas?.remove()
    this._fade?.remove()
    this._canvas = null
    this._fade = null
    this._ctx = null
    this._fadeCtx = null
    void map
    return this
  }

  override getEvents(): { [k: string]: L.LeafletEventHandlerFn } {
    return {
      // Deliberately NOT 'move' — during a pan Leaflet translates the canvas
      // element with a CSS transform, which is free and looks correct.
      viewreset: this._reset as L.LeafletEventHandlerFn,
      zoomend: this._reset as L.LeafletEventHandlerFn,
      moveend: this._reset as L.LeafletEventHandlerFn,
      resize: this._reset as L.LeafletEventHandlerFn,
      zoomanim: this._animateZoom as L.LeafletEventHandlerFn,
      mousemove: this._onMouseMove as L.LeafletEventHandlerFn,
      mouseout: this._onMouseOut as L.LeafletEventHandlerFn,
      click: this._onClick as L.LeafletEventHandlerFn,
    }
  }

  // ── imperative props ──────────────────────────────────────────────

  setLots(records: LotRecord[], paints: LotPaint[]) {
    const structureChanged = records !== this._records
    this._records = records
    this._paints = paints
    if (structureChanged) this._projZoom = Number.NaN
    this.schedule()
  }

  setPaints(paints: LotPaint[], crossfade = false) {
    this._paints = paints
    if (crossfade) this._pendingFade = true
    this.schedule()
  }

  setFlags(flags: CanvasFlags) {
    this._flags = flags
    this.schedule()
  }

  setActive(active: boolean) {
    if (this._active === active) return
    this._active = active
    if (this._canvas) this._canvas.style.display = active ? '' : 'none'
    if (!active && this._fade) this._fade.style.display = 'none'
    if (active) this.schedule()
  }

  /** Coalesced — many state changes in one tick produce exactly one draw. */
  schedule() {
    if (this._frame !== null || !this._map) return
    this._frame = requestAnimationFrame(() => {
      this._frame = null
      this._draw()
    })
  }

  // ── positioning ───────────────────────────────────────────────────

  private _reset = () => {
    const map = this._map
    if (!map || !this._canvas || !this._fade) return

    const size = map.getSize()
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    for (const c of [this._canvas, this._fade]) {
      if (c.width !== Math.round(size.x * dpr) || c.height !== Math.round(size.y * dpr)) {
        c.width = Math.round(size.x * dpr)
        c.height = Math.round(size.y * dpr)
      }
      c.style.width = `${size.x}px`
      c.style.height = `${size.y}px`
      // setPosition rewrites the transform, clearing any zoom-animation scale.
      L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]))
    }
    this._draw()
  }

  private _animateZoom = (e: L.ZoomAnimEvent) => {
    const map = this._map as unknown as {
      _latLngToNewLayerPoint: (ll: L.LatLng, zoom: number, center: L.LatLng) => L.Point
    }
    if (!this._map || !this._canvas) return
    const scale = this._map.getZoomScale(e.zoom, this._map.getZoom())
    const offset = map._latLngToNewLayerPoint(
      this._map.getBounds().getNorthWest(),
      e.zoom,
      e.center,
    )
    L.DomUtil.setTransform(this._canvas, offset, scale)
    if (this._fade) L.DomUtil.setTransform(this._fade, offset, scale)
  }

  // ── projection cache ──────────────────────────────────────────────

  private _project(zoom: number) {
    const map = this._map
    if (!map) return
    let total = 0
    for (const r of this._records) total += r.polygon.length
    if (this._proj.length !== total * 2) {
      this._proj = new Float64Array(total * 2)
      this._start = new Int32Array(this._records.length)
      this._count = new Int32Array(this._records.length)
      this._bbox = new Float64Array(this._records.length * 4)
      this._visible = new Int32Array(this._records.length)
    }

    let w = 0
    for (let i = 0; i < this._records.length; i++) {
      const poly = this._records[i]!.polygon
      this._start[i] = w
      this._count[i] = poly.length
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (let k = 0; k < poly.length; k++) {
        const p = map.project(L.latLng(poly[k]![0], poly[k]![1]), zoom)
        this._proj[w++] = p.x
        this._proj[w++] = p.y
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
      }
      this._bbox[i * 4] = minX
      this._bbox[i * 4 + 1] = minY
      this._bbox[i * 4 + 2] = maxX
      this._bbox[i * 4 + 3] = maxY
    }
    this._projZoom = zoom
  }

  /** Canvas top-left in absolute CRS pixels. */
  private _origin(): { ox: number; oy: number } {
    const map = this._map!
    const tl = map.containerPointToLayerPoint([0, 0])
    const po = map.getPixelOrigin()
    return { ox: tl.x + po.x, oy: tl.y + po.y }
  }

  // ── the render pass ───────────────────────────────────────────────

  private _draw() {
    const map = this._map
    const ctx = this._ctx
    const canvas = this._canvas
    if (!map || !ctx || !canvas || !this._active) return

    const t0 = performance.now()
    const zoom = map.getZoom()
    if (zoom !== this._projZoom) this._project(zoom)

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const size = map.getSize()

    // Crossfade: snapshot the current frame before overwriting it.
    if (this._pendingFade) this._snapshotForFade()

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)

    const { ox, oy } = this._origin()

    // 1 ── cull to the viewport padded by 20%
    const padX = size.x * CULL_PAD
    const padY = size.y * CULL_PAD
    const vMinX = ox - padX
    const vMinY = oy - padY
    const vMaxX = ox + size.x + padX
    const vMaxY = oy + size.y + padY

    let n = 0
    for (let i = 0; i < this._records.length; i++) {
      const b = i * 4
      if (
        this._bbox[b]! <= vMaxX &&
        this._bbox[b + 2]! >= vMinX &&
        this._bbox[b + 1]! <= vMaxY &&
        this._bbox[b + 3]! >= vMinY
      ) {
        this._visible[n++] = i
      }
    }
    this._visibleCount = n

    // 2 ── batch by colour: ~904 state changes collapse to ~8
    const groups = new Map<string, number[]>()
    for (let k = 0; k < n; k++) {
      const i = this._visible[k]!
      const p = this._paints[i]
      if (!p) continue
      const key = p.dimmed ? `d|${p.fill}` : `f|${p.fill}`
      const g = groups.get(key)
      if (g) g.push(i)
      else groups.set(key, [i])
    }

    // 3 ── fill
    for (const [key, list] of groups) {
      ctx.globalAlpha = key.charCodeAt(0) === 100 /* 'd' */ ? 0.25 : 1
      ctx.fillStyle = key.slice(2)
      ctx.beginPath()
      for (const i of list) this._path(ctx, i, ox, oy)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // 4 ── hairline stroke. Below zoom 19 strokes turn to mud and cost most.
    if (zoom >= 19) {
      ctx.strokeStyle = hairline(this._flags.dark)
      ctx.lineWidth = 0.5
      ctx.beginPath()
      for (let k = 0; k < n; k++) this._path(ctx, this._visible[k]!, ox, oy)
      ctx.stroke()

      // 5 ── tier patterns
      this._drawPatterns(ctx, n, ox, oy)
    }

    // 6 ── status badges: the client's explicit design
    if (zoom >= STATUS_BADGE.minZoom) this._drawBadges(ctx, n, ox, oy)

    // 7 ── lot numbers
    if (this._flags.showLabels && zoom >= ZOOM.labelsVisible) {
      this._drawLabels(ctx, n, ox, oy)
    }

    // 8 ── selection, multi-selection and hover
    this._drawEmphasis(ctx, ox, oy, zoom)

    if (this._pendingFade) {
      this._pendingFade = false
      this._runFade()
    }

    this._handlers.onStats?.(performance.now() - t0, n)
  }

  private _path(ctx: CanvasRenderingContext2D, i: number, ox: number, oy: number) {
    const s = this._start[i]!
    const c = this._count[i]!
    ctx.moveTo(this._proj[s]! - ox, this._proj[s + 1]! - oy)
    for (let k = 1; k < c; k++) {
      ctx.lineTo(this._proj[s + k * 2]! - ox, this._proj[s + k * 2 + 1]! - oy)
    }
    ctx.closePath()
  }

  private _drawPatterns(
    ctx: CanvasRenderingContext2D,
    n: number,
    ox: number,
    oy: number,
  ) {
    ctx.strokeStyle = patternInk(this._flags.dark)
    ctx.lineWidth = 0.7
    for (let k = 0; k < n; k++) {
      const i = this._visible[k]!
      const p = this._paints[i]
      if (!p || p.pattern === 'none' || p.dimmed) continue
      const b = i * 4
      const x0 = this._bbox[b]! - ox
      const y0 = this._bbox[b + 1]! - oy
      const x1 = this._bbox[b + 2]! - ox
      const y1 = this._bbox[b + 3]! - oy
      ctx.save()
      ctx.beginPath()
      this._path(ctx, i, ox, oy)
      ctx.clip()
      ctx.beginPath()
      if (p.pattern === 'dots') {
        for (let x = x0; x < x1; x += 4) {
          for (let y = y0; y < y1; y += 4) {
            ctx.moveTo(x, y)
            ctx.lineTo(x + 0.8, y)
          }
        }
      } else {
        const step = 4
        for (let d = -(y1 - y0); d < x1 - x0; d += step) {
          ctx.moveTo(x0 + d, y0)
          ctx.lineTo(x0 + d + (y1 - y0), y1)
        }
        if (p.pattern === 'cross') {
          for (let d = 0; d < x1 - x0 + (y1 - y0); d += step) {
            ctx.moveTo(x0 + d, y0)
            ctx.lineTo(x0 + d - (y1 - y0), y1)
          }
        }
      }
      ctx.stroke()
      ctx.restore()
    }
  }

  /**
   * A filled circle in the status colour with a white ring and the status
   * letter, anchored to the polygon's top-left vertex in SCREEN space.
   *
   * The radius tracks the lot's on-screen size, clamped to
   * STATUS_BADGE.radiusPx. At zoom 18 a lawn lot is roughly 2×5 px, so a
   * fixed 7 px badge would swallow the park; the letter appears as soon as
   * the circle is large enough to hold it.
   */
  private _drawBadges(
    ctx: CanvasRenderingContext2D,
    n: number,
    ox: number,
    oy: number,
  ) {
    const ring = badgeRing(this._flags.dark)
    const ink = badgeInk(this._flags.dark)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let k = 0; k < n; k++) {
      const i = this._visible[k]!
      const p = this._paints[i]
      if (!p?.badge) continue // null badge === the agent restriction

      const b = i * 4
      const w = this._bbox[b + 2]! - this._bbox[b]!
      const h = this._bbox[b + 3]! - this._bbox[b + 1]!
      const r = Math.min(STATUS_BADGE.radiusPx, Math.max(2, Math.min(w, h) * 0.38))

      const v = topLeftVertex(this._proj, this._start[i]!, this._count[i]!)
      const scale = r / STATUS_BADGE.radiusPx
      const cx = v.x - ox + STATUS_BADGE.offset.x * scale
      const cy = v.y - oy + STATUS_BADGE.offset.y * scale

      const appearance = STATUS_APPEARANCE[p.badge]
      ctx.globalAlpha = p.dimmed ? 0.25 : 1
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = appearance.color
      ctx.fill()
      if (r >= 3.5) {
        ctx.lineWidth = 1
        ctx.strokeStyle = ring
        ctx.stroke()
      }
      if (r >= 4.6) {
        ctx.fillStyle = ink
        ctx.font = `700 ${Math.round(STATUS_BADGE.fontPx * scale)}px var(--font-sans, sans-serif)`
        ctx.fillText(appearance.letter, cx, cy + 0.5)
      }
    }
    ctx.globalAlpha = 1
  }

  private _drawLabels(
    ctx: CanvasRenderingContext2D,
    n: number,
    ox: number,
    oy: number,
  ) {
    const map = this._map!
    ctx.fillStyle = labelInk(this._flags.dark)
    ctx.font = '9px var(--font-sans, sans-serif)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let k = 0; k < n; k++) {
      const i = this._visible[k]!
      const rec = this._records[i]!
      const c = map.project(L.latLng(rec.centroid[0], rec.centroid[1]), map.getZoom())
      ctx.fillText(rec.label, c.x - ox, c.y - oy)
    }
  }

  private _drawEmphasis(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    zoom: number,
  ) {
    if (zoom < ZOOM.lotsVisible) return
    const gold = themeColor('--color-gold')
    const ink = themeColor('--color-ink')
    const index = new Map<LotId, number>()
    for (let k = 0; k < this._visibleCount; k++) {
      const i = this._visible[k]!
      index.set(this._records[i]!.id, i)
    }

    // multi-selection (spec 10) — translucent gold wash under a gold stroke
    if (this._flags.multiSelected.size > 0) {
      ctx.beginPath()
      for (const id of this._flags.multiSelected) {
        const i = index.get(id)
        if (i !== undefined) this._path(ctx, i, ox, oy)
      }
      ctx.fillStyle = withAlpha(gold, 0.28)
      ctx.fill()
      ctx.strokeStyle = gold
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const hovered = this._flags.hoveredId ? index.get(this._flags.hoveredId) : undefined
    if (hovered !== undefined && this._flags.hoveredId !== this._flags.selectedId) {
      ctx.beginPath()
      this._path(ctx, hovered, ox, oy)
      ctx.strokeStyle = ink
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    const selected = this._flags.selectedId ? index.get(this._flags.selectedId) : undefined
    if (selected !== undefined) {
      ctx.save()
      ctx.beginPath()
      this._path(ctx, selected, ox, oy)
      ctx.shadowColor = withAlpha(gold, 0.85)
      ctx.shadowBlur = 12
      ctx.strokeStyle = gold
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.stroke()
      ctx.restore()
    }
  }

  // ── crossfade ─────────────────────────────────────────────────────

  private _snapshotForFade() {
    const fade = this._fade
    const fadeCtx = this._fadeCtx
    const canvas = this._canvas
    if (!fade || !fadeCtx || !canvas) return
    fadeCtx.setTransform(1, 0, 0, 1, 0, 0)
    fadeCtx.clearRect(0, 0, fade.width, fade.height)
    fadeCtx.drawImage(canvas, 0, 0)
    fade.style.transition = 'none'
    fade.style.opacity = '1'
    fade.style.display = ''
  }

  private _runFade() {
    const fade = this._fade
    if (!fade) return
    if (this._fadeTimer !== null) window.clearTimeout(this._fadeTimer)
    requestAnimationFrame(() => {
      fade.style.transition = `opacity ${CROSSFADE_MS}ms linear`
      fade.style.opacity = '0'
    })
    this._fadeTimer = window.setTimeout(() => {
      fade.style.display = 'none'
      fade.style.transition = 'none'
      this._fadeTimer = null
    }, CROSSFADE_MS + 30)
  }

  // ── hit testing ───────────────────────────────────────────────────

  hitTest(containerPoint: L.Point): LotId | null {
    const map = this._map
    if (!map || !this._active) return null
    const lp = map.containerPointToLayerPoint(containerPoint)
    const po = map.getPixelOrigin()
    const x = lp.x + po.x
    const y = lp.y + po.y

    // Only the culled set — never all 904 on every mouse move.
    for (let k = this._visibleCount - 1; k >= 0; k--) {
      const i = this._visible[k]!
      const b = i * 4
      if (
        x < this._bbox[b]! ||
        x > this._bbox[b + 2]! ||
        y < this._bbox[b + 1]! ||
        y > this._bbox[b + 3]!
      ) {
        continue
      }
      if (pointInFlatPolygon(x, y, this._proj, this._start[i]!, this._count[i]!)) {
        return this._records[i]!.id
      }
    }
    return null
  }

  private _onMouseMove = (e: L.LeafletMouseEvent) => {
    this._lastHoverEvent = e
    if (this._hoverFrame !== null) return
    this._hoverFrame = requestAnimationFrame(() => {
      this._hoverFrame = null
      const ev = this._lastHoverEvent
      if (!ev) return
      const id = this.hitTest(ev.containerPoint)
      this._handlers.onHover?.(id, ev)
    })
  }

  private _onMouseOut = () => {
    this._handlers.onHover?.(null, null)
  }

  private _onClick = (e: L.LeafletMouseEvent) => {
    this._handlers.onPick?.(this.hitTest(e.containerPoint), e)
  }
}
