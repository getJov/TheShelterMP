import L from 'leaflet'
import type { BlockId, LatLng, Polygon } from '@/domain'
import { themeColor, withAlpha } from '@/features/map/colors'

/**
 * Editor chrome — block outlines, the grid preview, overlap flags, the
 * rubber band and the shape being drawn.
 *
 * Deliberately NOT a second lot renderer. Real lots are always painted by
 * `LotCanvasLayer` from the map feature; this canvas sits above it and draws
 * only the affordances, in container pixels, so the render path underneath
 * stays exactly as spec 05 built it.
 */

export interface ChromeBlock {
  id: BlockId
  code: string
  polygon: Polygon
  active: boolean
}

export interface ChromeState {
  dark: boolean
  showBlocks: boolean
  blocks: ChromeBlock[]
  /** Cells the grid tool would create, drawn at 45%. */
  preview: Polygon[]
  /** Lots flagged as overlapping. */
  overlaps: Polygon[]
  /** Rectangle the block tool is dragging out, or the confirmed pending one. */
  pending: Polygon | null
  /** Free-hand lot in progress. */
  drawing: { points: LatLng[]; cursor: LatLng | null } | null
  /** Rubber band, in container pixels. */
  band: { x0: number; y0: number; x1: number; y1: number; subtract: boolean } | null
  /** Lasso path, in container pixels. */
  lasso: [number, number][] | null
  /** Floating measurement following the cursor. */
  readout: { x: number; y: number; lines: string[] } | null
}

const MAX_DPR = 2

export const emptyChrome = (dark = false): ChromeState => ({
  dark,
  showBlocks: true,
  blocks: [],
  preview: [],
  overlaps: [],
  pending: null,
  drawing: null,
  band: null,
  lasso: null,
  readout: null,
})

export class ChromeCanvas {
  private map: L.Map
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null
  private state: ChromeState
  private frame: number | null = null

  constructor(map: L.Map, canvas: HTMLCanvasElement) {
    this.map = map
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.state = emptyChrome()
    this.onView = this.onView.bind(this)
    map.on('move zoom viewreset resize moveend zoomend', this.onView)
    this.schedule()
  }

  destroy() {
    this.map.off('move zoom viewreset resize moveend zoomend', this.onView)
    if (this.frame !== null) cancelAnimationFrame(this.frame)
  }

  set(state: ChromeState) {
    this.state = state
    this.schedule()
  }

  private onView() {
    this.schedule()
  }

  private schedule() {
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.draw()
    })
  }

  private pt(ll: LatLng): L.Point {
    return this.map.latLngToContainerPoint(L.latLng(ll[0], ll[1]))
  }

  private path(ctx: CanvasRenderingContext2D, poly: Polygon) {
    if (poly.length === 0) return
    const first = this.pt(poly[0]!)
    ctx.moveTo(first.x, first.y)
    for (let i = 1; i < poly.length; i++) {
      const p = this.pt(poly[i]!)
      ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
  }

  private draw() {
    const ctx = this.ctx
    if (!ctx) return
    const size = this.map.getSize()
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    if (
      this.canvas.width !== Math.round(size.x * dpr) ||
      this.canvas.height !== Math.round(size.y * dpr)
    ) {
      this.canvas.width = Math.round(size.x * dpr)
      this.canvas.height = Math.round(size.y * dpr)
      this.canvas.style.width = `${size.x}px`
      this.canvas.style.height = `${size.y}px`
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)

    const s = this.state
    const gold = themeColor('--color-gold')
    const ink = themeColor('--color-ink')
    const danger = themeColor('--color-danger')
    const paper = themeColor('--color-surface')

    // ── grid preview ─────────────────────────────────────────────
    if (s.preview.length > 0) {
      ctx.globalAlpha = 0.45
      ctx.beginPath()
      for (const poly of s.preview) this.path(ctx, poly)
      ctx.fillStyle = gold
      ctx.fill()
      ctx.strokeStyle = withAlpha(ink, 0.55)
      ctx.lineWidth = 0.6
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // ── overlaps ─────────────────────────────────────────────────
    if (s.overlaps.length > 0) {
      ctx.beginPath()
      for (const poly of s.overlaps) this.path(ctx, poly)
      ctx.fillStyle = withAlpha(danger, 0.35)
      ctx.fill()
      ctx.strokeStyle = danger
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // ── block outlines ───────────────────────────────────────────
    if (s.showBlocks) {
      for (const b of s.blocks) {
        ctx.save()
        ctx.beginPath()
        this.path(ctx, b.polygon)
        ctx.setLineDash(b.active ? [2, 3] : [6, 5])
        ctx.lineWidth = b.active ? 2.5 : 2
        ctx.strokeStyle = b.active ? gold : withAlpha(ink, s.dark ? 0.55 : 0.45)
        ctx.stroke()
        if (b.active) {
          ctx.fillStyle = withAlpha(gold, 0.06)
          ctx.fill()
        }
        ctx.restore()
        this.label(ctx, b.polygon, b.code, b.active ? gold : withAlpha(ink, 0.7), paper)
      }
    }

    // ── pending block being drawn or reshaped ────────────────────
    if (s.pending) {
      ctx.save()
      ctx.beginPath()
      this.path(ctx, s.pending)
      ctx.fillStyle = withAlpha(gold, 0.16)
      ctx.fill()
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 2
      ctx.strokeStyle = gold
      ctx.stroke()
      ctx.restore()
    }

    // ── free-hand lot ────────────────────────────────────────────
    if (s.drawing) {
      const pts = s.drawing.points.map((p) => this.pt(p))
      if (s.drawing.cursor) pts.push(this.pt(s.drawing.cursor))
      if (pts.length > 0) {
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(pts[0]!.x, pts[0]!.y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y)
        if (pts.length > 2) {
          ctx.fillStyle = withAlpha(gold, 0.18)
          ctx.closePath()
          ctx.fill()
        }
        ctx.setLineDash([4, 3])
        ctx.lineWidth = 1.8
        ctx.strokeStyle = gold
        ctx.stroke()
        ctx.restore()
        for (const p of s.drawing.points.map((x) => this.pt(x))) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2)
          ctx.fillStyle = paper
          ctx.fill()
          ctx.lineWidth = 1.6
          ctx.strokeStyle = gold
          ctx.stroke()
        }
      }
    }

    // ── rubber band ──────────────────────────────────────────────
    if (s.band) {
      const x = Math.min(s.band.x0, s.band.x1)
      const y = Math.min(s.band.y0, s.band.y1)
      const w = Math.abs(s.band.x1 - s.band.x0)
      const h = Math.abs(s.band.y1 - s.band.y0)
      ctx.save()
      ctx.fillStyle = withAlpha(s.band.subtract ? danger : gold, 0.14)
      ctx.fillRect(x, y, w, h)
      ctx.setLineDash([4, 3])
      ctx.lineWidth = 1.4
      ctx.strokeStyle = s.band.subtract ? danger : gold
      ctx.strokeRect(x, y, w, h)
      ctx.restore()
    }

    // ── lasso ────────────────────────────────────────────────────
    if (s.lasso && s.lasso.length > 1) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(s.lasso[0]![0], s.lasso[0]![1])
      for (let i = 1; i < s.lasso.length; i++) ctx.lineTo(s.lasso[i]![0], s.lasso[i]![1])
      ctx.closePath()
      ctx.fillStyle = withAlpha(gold, 0.13)
      ctx.fill()
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 1.6
      ctx.strokeStyle = gold
      ctx.stroke()
      ctx.restore()
    }

    // ── readout following the cursor ─────────────────────────────
    if (s.readout && s.readout.lines.length > 0) {
      const pad = 7
      ctx.font = '600 11.5px var(--font-mono, monospace)'
      const widths = s.readout.lines.map((t) => ctx.measureText(t).width)
      const w = Math.max(...widths) + pad * 2
      const lh = 15
      const h = s.readout.lines.length * lh + pad * 2 - 3
      let x = s.readout.x + 14
      let y = s.readout.y + 14
      if (x + w > size.x - 6) x = s.readout.x - w - 14
      if (y + h > size.y - 6) y = s.readout.y - h - 14
      ctx.save()
      ctx.fillStyle = withAlpha(ink, 0.9)
      roundRect(ctx, x, y, w, h, 6)
      ctx.fill()
      ctx.fillStyle = paper
      ctx.textBaseline = 'top'
      s.readout.lines.forEach((t, i) => ctx.fillText(t, x + pad, y + pad + i * lh))
      ctx.restore()
    }
  }

  /** Block code stamped at the polygon's centre, on a soft plate. */
  private label(
    ctx: CanvasRenderingContext2D,
    poly: Polygon,
    text: string,
    color: string,
    plate: string,
  ) {
    let sx = 0
    let sy = 0
    for (const p of poly) {
      const q = this.pt(p)
      sx += q.x
      sy += q.y
    }
    const cx = sx / poly.length
    const cy = sy / poly.length
    ctx.save()
    ctx.font = '600 12px var(--font-mono, monospace)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const w = ctx.measureText(text).width + 12
    ctx.fillStyle = withAlpha(plate, 0.82)
    roundRect(ctx, cx - w / 2, cy - 9, w, 18, 5)
    ctx.fill()
    ctx.fillStyle = color
    ctx.fillText(text, cx, cy + 0.5)
    ctx.restore()
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
