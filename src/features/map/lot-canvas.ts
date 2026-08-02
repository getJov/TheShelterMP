import { STATUS_APPEARANCE, STATUS_BADGE, ZOOM, type LotId, type Polygon } from '@/domain'
import { pointInFlatPolygon, topLeftVertex } from '@/lib/geo'
import { PaneCanvas, type PaneCanvasView } from '@/features/map/google/pane-canvas'
import type { MapPointerEvent } from '@/features/map/google/types'
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
 * Rides a PaneCanvas: pane transforms carry the bitmap between repaints, so
 * pan and the zoom animation track the base map; every view signal repaints.
 */

export interface LotRecord {
  id: LotId
  polygon: Polygon
  centroid: [number, number]
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
  onPick?: (id: LotId | null, ev: MapPointerEvent) => void
  onHover?: (id: LotId | null, ev: MapPointerEvent | null) => void
  onStats?: (ms: number, lots: number) => void
}

const MAX_DPR = 2
const MARGIN_PX = 200
const CULL_PAD = 8
const CROSSFADE_MS = 200

export class LotCanvas {
  private _pane: PaneCanvas
  private _canvas: HTMLCanvasElement | null = null
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

  private _proj = new Float64Array(0)
  private _start = new Int32Array(0)
  private _count = new Int32Array(0)
  private _bbox = new Float64Array(0)
  private _visible: Int32Array = new Int32Array(0)
  private _visibleCount = 0

  private _pendingFade = false
  private _fadeTimer: number | null = null
  private _hoverFrame: number | null = null
  private _lastHover: { ev: MapPointerEvent; x: number; y: number } | null = null

  private _onMouseMove = (e: MouseEvent) => this._handleMouseMove(e)
  private _onMouseOut = () => this._handlers.onHover?.(null, null)
  private _onClick = (e: MouseEvent) => this._handleClick(e)

  constructor(handlers: LotCanvasHandlers = {}) {
    this._handlers = handlers
    this._pane = new PaneCanvas({
      pane: 'overlayMouseTarget',
      className: 'shelter-lot-canvas',
      marginPx: MARGIN_PX,
      maxDpr: MAX_DPR,
      render: (ctx, view) => this._render(ctx, view),
      onAttach: (canvas) => this._attach(canvas),
      onDetach: () => this._detach(),
    })
  }

  addTo(map: google.maps.Map) {
    this._pane.setMap(map)
  }

  remove() {
    this._pane.setMap(null)
  }

  private _attach(canvas: HTMLCanvasElement) {
    this._canvas = canvas
    canvas.style.pointerEvents = 'auto'
    canvas.style.display = this._active ? '' : 'none'

    const fade = document.createElement('canvas')
    fade.className = 'shelter-lot-canvas shelter-lot-fade'
    fade.style.position = 'absolute'
    fade.style.pointerEvents = 'none'
    fade.style.display = 'none'
    canvas.parentElement?.insertBefore(fade, canvas)
    this._fade = fade
    this._fadeCtx = fade.getContext('2d')

    canvas.addEventListener('mousemove', this._onMouseMove)
    canvas.addEventListener('mouseout', this._onMouseOut)
    canvas.addEventListener('click', this._onClick)
  }

  private _detach() {
    this._canvas?.removeEventListener('mousemove', this._onMouseMove)
    this._canvas?.removeEventListener('mouseout', this._onMouseOut)
    this._canvas?.removeEventListener('click', this._onClick)
    if (this._fadeTimer !== null) window.clearTimeout(this._fadeTimer)
    if (this._hoverFrame !== null) cancelAnimationFrame(this._hoverFrame)
    this._hoverFrame = null
    this._fade?.remove()
    this._canvas = null
    this._fade = null
    this._fadeCtx = null
  }

  setLots(records: LotRecord[], paints: LotPaint[]) {
    const structureChanged = records !== this._records
    this._records = records
    this._paints = paints
    if (structureChanged) this._start = new Int32Array(0)
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

  schedule() {
    this._pane.redraw()
  }

  private _project(view: PaneCanvasView) {
    let total = 0
    for (const r of this._records) total += r.polygon.length
    if (this._proj.length !== total * 2 || this._start.length !== this._records.length) {
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
        const p = view.project(poly[k]!)
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
  }

  private _render(ctx: CanvasRenderingContext2D, view: PaneCanvasView) {
    const canvas = this._canvas
    if (!canvas) return
    if (!this._active) {
      ctx.clearRect(0, 0, view.width, view.height)
      return
    }

    const t0 = performance.now()
    this._syncFadeGeometry(canvas)
    if (this._pendingFade) this._snapshotForFade()

    ctx.clearRect(0, 0, view.width, view.height)
    this._project(view)

    const vMinX = -CULL_PAD
    const vMinY = -CULL_PAD
    const vMaxX = view.width + CULL_PAD
    const vMaxY = view.height + CULL_PAD

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

    const zoom = view.zoom
    const groups = new globalThis.Map<string, number[]>()
    for (let k = 0; k < n; k++) {
      const i = this._visible[k]!
      const p = this._paints[i]
      if (!p) continue
      const key = p.dimmed ? `d|${p.fill}` : `f|${p.fill}`
      const g = groups.get(key)
      if (g) g.push(i)
      else groups.set(key, [i])
    }

    for (const [key, list] of groups) {
      ctx.globalAlpha = key.charCodeAt(0) === 100 ? 0.25 : 1
      ctx.fillStyle = key.slice(2)
      ctx.beginPath()
      for (const i of list) this._path(ctx, i)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    if (zoom >= 19) {
      ctx.strokeStyle = hairline(this._flags.dark)
      ctx.lineWidth = 0.5
      ctx.beginPath()
      for (let k = 0; k < n; k++) this._path(ctx, this._visible[k]!)
      ctx.stroke()
      this._drawPatterns(ctx, n)
    }

    if (zoom >= STATUS_BADGE.minZoom) this._drawBadges(ctx, n)
    if (this._flags.showLabels && zoom >= ZOOM.labelsVisible) this._drawLabels(ctx, n, view)
    this._drawEmphasis(ctx, zoom)

    if (this._pendingFade) {
      this._pendingFade = false
      this._runFade()
    }

    this._handlers.onStats?.(performance.now() - t0, n)
  }

  /** The fade canvas mirrors the main one so snapshots land pixel-for-pixel. */
  private _syncFadeGeometry(canvas: HTMLCanvasElement) {
    const fade = this._fade
    if (!fade) return
    if (fade.width !== canvas.width || fade.height !== canvas.height) {
      fade.width = canvas.width
      fade.height = canvas.height
    }
    fade.style.width = canvas.style.width
    fade.style.height = canvas.style.height
    fade.style.left = canvas.style.left
    fade.style.top = canvas.style.top
  }

  private _path(ctx: CanvasRenderingContext2D, i: number) {
    const s = this._start[i]!
    const c = this._count[i]!
    ctx.moveTo(this._proj[s]!, this._proj[s + 1]!)
    for (let k = 1; k < c; k++) {
      ctx.lineTo(this._proj[s + k * 2]!, this._proj[s + k * 2 + 1]!)
    }
    ctx.closePath()
  }

  private _drawPatterns(ctx: CanvasRenderingContext2D, n: number) {
    ctx.strokeStyle = patternInk(this._flags.dark)
    ctx.lineWidth = 0.7
    for (let k = 0; k < n; k++) {
      const i = this._visible[k]!
      const p = this._paints[i]
      if (!p || p.pattern === 'none' || p.dimmed) continue
      const b = i * 4
      const x0 = this._bbox[b]!
      const y0 = this._bbox[b + 1]!
      const x1 = this._bbox[b + 2]!
      const y1 = this._bbox[b + 3]!
      ctx.save()
      ctx.beginPath()
      this._path(ctx, i)
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

  private _drawBadges(ctx: CanvasRenderingContext2D, n: number) {
    const ring = badgeRing(this._flags.dark)
    const ink = badgeInk(this._flags.dark)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let k = 0; k < n; k++) {
      const i = this._visible[k]!
      const p = this._paints[i]
      if (!p?.badge) continue

      const b = i * 4
      const w = this._bbox[b + 2]! - this._bbox[b]!
      const h = this._bbox[b + 3]! - this._bbox[b + 1]!
      const r = Math.min(STATUS_BADGE.radiusPx, Math.max(2, Math.min(w, h) * 0.38))

      const v = topLeftVertex(this._proj, this._start[i]!, this._count[i]!)
      const scale = r / STATUS_BADGE.radiusPx
      const cx = v.x + STATUS_BADGE.offset.x * scale
      const cy = v.y + STATUS_BADGE.offset.y * scale

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

  private _drawLabels(ctx: CanvasRenderingContext2D, n: number, view: PaneCanvasView) {
    ctx.fillStyle = labelInk(this._flags.dark)
    ctx.font = '9px var(--font-sans, sans-serif)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let k = 0; k < n; k++) {
      const i = this._visible[k]!
      const rec = this._records[i]!
      const c = view.project(rec.centroid)
      ctx.fillText(rec.label, c.x, c.y)
    }
  }

  private _drawEmphasis(ctx: CanvasRenderingContext2D, zoom: number) {
    if (zoom < ZOOM.lotsVisible) return
    const gold = themeColor('--color-gold')
    const ink = themeColor('--color-ink')
    const index = new globalThis.Map<LotId, number>()
    for (let k = 0; k < this._visibleCount; k++) {
      const i = this._visible[k]!
      index.set(this._records[i]!.id, i)
    }

    if (this._flags.multiSelected.size > 0) {
      ctx.beginPath()
      for (const id of this._flags.multiSelected) {
        const i = index.get(id)
        if (i !== undefined) this._path(ctx, i)
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
      this._path(ctx, hovered)
      ctx.strokeStyle = ink
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    const selected = this._flags.selectedId ? index.get(this._flags.selectedId) : undefined
    if (selected !== undefined) {
      ctx.save()
      ctx.beginPath()
      this._path(ctx, selected)
      ctx.shadowColor = withAlpha(gold, 0.85)
      ctx.shadowBlur = 12
      ctx.strokeStyle = gold
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.stroke()
      ctx.restore()
    }
  }

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

  /** Hit test in canvas-local CSS px (what `_localPoint` returns). */
  hitTest(x: number, y: number): LotId | null {
    if (!this._active) return null
    for (let k = this._visibleCount - 1; k >= 0; k--) {
      const i = this._visible[k]!
      const b = i * 4
      if (x < this._bbox[b]! || x > this._bbox[b + 2]! || y < this._bbox[b + 1]! || y > this._bbox[b + 3]!) {
        continue
      }
      if (pointInFlatPolygon(x, y, this._proj, this._start[i]!, this._count[i]!)) {
        return this._records[i]!.id
      }
    }
    return null
  }

  /**
   * Mouse → canvas-local CSS px. The rect reflects any live pane transform
   * (drag translate, zoom-animation scale), so dividing it back out keeps the
   * coordinates aligned with what was last drawn.
   */
  private _localPoint(e: MouseEvent): { x: number; y: number } {
    const canvas = this._canvas!
    const rect = canvas.getBoundingClientRect()
    const sx = rect.width > 0 ? canvas.clientWidth / rect.width : 1
    const sy = rect.height > 0 ? canvas.clientHeight / rect.height : 1
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }

  /** Pointer payload for consumers — containerPoint is map-viewport-relative. */
  private _eventFromMouse(e: MouseEvent): MapPointerEvent {
    const div = this._pane.getMap()?.getDiv()
    const rect = div?.getBoundingClientRect()
    return {
      originalEvent: e,
      containerPoint: rect
        ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
        : { x: e.clientX, y: e.clientY },
    }
  }

  private _handleMouseMove(e: MouseEvent) {
    const local = this._localPoint(e)
    this._lastHover = { ev: this._eventFromMouse(e), x: local.x, y: local.y }
    if (this._hoverFrame !== null) return
    this._hoverFrame = requestAnimationFrame(() => {
      this._hoverFrame = null
      const last = this._lastHover
      if (!last) return
      this._handlers.onHover?.(this.hitTest(last.x, last.y), last.ev)
    })
  }

  private _handleClick(e: MouseEvent) {
    const local = this._localPoint(e)
    this._handlers.onPick?.(this.hitTest(local.x, local.y), this._eventFromMouse(e))
  }
}
