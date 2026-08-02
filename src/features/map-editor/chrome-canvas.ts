import type { BlockId, LatLng, Polygon } from '@/domain'
import {
  containerPointToLatLng,
  latLngToContainerPoint,
} from '@/features/map/google/helpers'
import { PaneCanvas, type PaneCanvasView } from '@/features/map/google/pane-canvas'
import { themeColor, withAlpha } from '@/features/map/colors'

export interface ChromeBlock {
  id: BlockId
  code: string
  polygon: Polygon
  active: boolean
  target?: boolean
}

export interface ChromeState {
  dark: boolean
  showBlocks: boolean
  blocks: ChromeBlock[]
  preview: Polygon[]
  overlaps: Polygon[]
  pending: Polygon | null
  drawing: { points: LatLng[]; cursor: LatLng | null } | null
  band: { x0: number; y0: number; x1: number; y1: number; subtract: boolean } | null
  lasso: [number, number][] | null
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

/**
 * Two coordinate spaces, two surfaces:
 *
 * - World-anchored chrome (block outlines/labels, grid preview, overlap
 *   warnings, pending block, draw-in-progress) renders on a PaneCanvas so it
 *   rides Google's pane transforms — in sync during pans and the zoom
 *   animation, exactly like the lot canvas.
 * - Screen-anchored chrome (rubber band, lasso, cursor readout) stays on the
 *   fixed viewport canvas the surface owns; it only moves with the pointer.
 */
export class ChromeCanvas {
  private map: google.maps.Map
  private screen: HTMLCanvasElement
  private screenCtx: CanvasRenderingContext2D | null
  private world: PaneCanvas
  private state: ChromeState
  private frame: number | null = null
  private listeners: google.maps.MapsEventListener[] = []

  constructor(map: google.maps.Map, canvas: HTMLCanvasElement) {
    this.map = map
    this.screen = canvas
    this.screenCtx = canvas.getContext('2d')
    this.state = emptyChrome()
    this.world = new PaneCanvas({
      pane: 'floatPane',
      className: 'shelter-editor-chrome-canvas',
      maxDpr: MAX_DPR,
      render: (ctx, view) => this.drawWorld(ctx, view),
    })
    this.world.setMap(map)
    this.onView = this.onView.bind(this)
    this.listeners = [
      map.addListener('bounds_changed', this.onView),
      map.addListener('zoom_changed', this.onView),
    ]
    this.schedule()
  }

  destroy() {
    for (const l of this.listeners) l.remove()
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.world.setMap(null)
  }

  set(state: ChromeState) {
    this.state = state
    this.world.redraw()
    this.schedule()
  }

  private onView() {
    this.schedule()
  }

  /** Screen-layer repaint, rAF-coalesced. The world layer coalesces itself. */
  private schedule() {
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.drawScreen()
    })
  }

  private worldPath(
    ctx: CanvasRenderingContext2D,
    view: PaneCanvasView,
    poly: Polygon,
  ) {
    if (poly.length === 0) return
    const first = view.project(poly[0]!)
    ctx.moveTo(first.x, first.y)
    for (let i = 1; i < poly.length; i++) {
      const p = view.project(poly[i]!)
      ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
  }

  private drawWorld(ctx: CanvasRenderingContext2D, view: PaneCanvasView) {
    ctx.clearRect(0, 0, view.width, view.height)

    const s = this.state
    const gold = themeColor('--color-gold')
    const ink = themeColor('--color-ink')
    const danger = themeColor('--color-danger')
    const paper = themeColor('--color-surface')

    if (s.preview.length > 0) {
      ctx.globalAlpha = 0.45
      ctx.beginPath()
      for (const poly of s.preview) this.worldPath(ctx, view, poly)
      ctx.fillStyle = gold
      ctx.fill()
      ctx.strokeStyle = withAlpha(ink, 0.55)
      ctx.lineWidth = 0.6
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    if (s.overlaps.length > 0) {
      ctx.beginPath()
      for (const poly of s.overlaps) this.worldPath(ctx, view, poly)
      ctx.fillStyle = withAlpha(danger, 0.35)
      ctx.fill()
      ctx.strokeStyle = danger
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    if (s.showBlocks) {
      for (const b of s.blocks) {
        ctx.save()
        ctx.beginPath()
        this.worldPath(ctx, view, b.polygon)
        ctx.setLineDash(b.target ? [1, 3] : b.active ? [2, 3] : [6, 5])
        ctx.lineWidth = b.target ? 3 : b.active ? 2.5 : 2
        ctx.strokeStyle = b.active || b.target ? gold : withAlpha(ink, s.dark ? 0.55 : 0.45)
        ctx.stroke()
        if (b.active || b.target) {
          ctx.fillStyle = withAlpha(gold, b.target ? 0.12 : 0.06)
          ctx.fill()
        }
        ctx.restore()
        this.label(
          ctx,
          view,
          b.polygon,
          b.code,
          b.active || b.target ? gold : withAlpha(ink, 0.7),
          paper,
        )
      }
    }

    if (s.pending) {
      ctx.save()
      ctx.beginPath()
      this.worldPath(ctx, view, s.pending)
      ctx.fillStyle = withAlpha(gold, 0.16)
      ctx.fill()
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 2
      ctx.strokeStyle = gold
      ctx.stroke()
      ctx.restore()
    }

    if (s.drawing) {
      const pts = s.drawing.points.map((p) => view.project(p))
      if (s.drawing.cursor) pts.push(view.project(s.drawing.cursor))
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
        for (const p of s.drawing.points.map((x) => view.project(x))) {
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
  }

  private drawScreen() {
    const ctx = this.screenCtx
    if (!ctx) return
    const div = this.map.getDiv()
    const size = { x: div.offsetWidth, y: div.offsetHeight }
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    if (
      this.screen.width !== Math.round(size.x * dpr) ||
      this.screen.height !== Math.round(size.y * dpr)
    ) {
      this.screen.width = Math.round(size.x * dpr)
      this.screen.height = Math.round(size.y * dpr)
      this.screen.style.width = `${size.x}px`
      this.screen.style.height = `${size.y}px`
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)

    const s = this.state
    const gold = themeColor('--color-gold')
    const ink = themeColor('--color-ink')
    const danger = themeColor('--color-danger')
    const paper = themeColor('--color-surface')

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

  private label(
    ctx: CanvasRenderingContext2D,
    view: PaneCanvasView,
    poly: Polygon,
    text: string,
    color: string,
    plate: string,
  ) {
    let sx = 0
    let sy = 0
    for (const p of poly) {
      const q = view.project(p)
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

export { containerPointToLatLng, latLngToContainerPoint }
