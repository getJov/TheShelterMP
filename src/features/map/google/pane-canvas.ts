import type { LatLng } from '@/domain'
import { latLngGoogle } from './coords'

/**
 * A canvas that lives inside a Google Maps overlay pane and is re-anchored to
 * the viewport in DIV-pixel space on every draw.
 *
 * Why div-pixel space: pane children ride the pane's own transforms — Google
 * translates the panes while dragging and scales them during the zoom
 * animation — so content positioned this way tracks the ground on every frame
 * without a repaint. Container-pixel space is only valid at the instant of an
 * event, which is what made the previous layers lag and cut off.
 *
 * The canvas is oversized by `marginPx` on every side so pans between two
 * anchors never expose an unpainted edge. Repaints are rAF-coalesced and run
 * on every view signal (`bounds_changed`, `zoom_changed`, `idle`) plus every
 * API-driven `draw()` (re-anchor, resize).
 *
 * The render callback owns clearing — some layers snapshot the previous
 * bitmap first (crossfade).
 */

export interface PaneCanvasView {
  /** Canvas CSS size — viewport plus the bleed margin on every side. */
  width: number
  height: number
  /** Bleed in CSS px. Canvas-local (margin, margin) == container (0, 0) at anchor time. */
  margin: number
  zoom: number
  /** LatLng → canvas-local CSS px. Valid for this render pass only. */
  project: (ll: LatLng) => { x: number; y: number }
}

export interface PaneCanvasOptions {
  pane: 'overlayLayer' | 'overlayMouseTarget' | 'floatPane'
  className?: string
  marginPx?: number
  maxDpr?: number
  render: (ctx: CanvasRenderingContext2D, view: PaneCanvasView) => void
  /** The canvas is in the pane; wire element listeners / siblings here. */
  onAttach?: (canvas: HTMLCanvasElement, panes: google.maps.MapPanes) => void
  onDetach?: () => void
}

const DEFAULT_MARGIN = 200
const DEFAULT_MAX_DPR = 2

export class PaneCanvas {
  private _options: PaneCanvasOptions
  private _overlay: google.maps.OverlayView | null = null
  private _canvas: HTMLCanvasElement | null = null
  private _ctx: CanvasRenderingContext2D | null = null
  private _listeners: google.maps.MapsEventListener[] = []
  private _frame: number | null = null

  constructor(options: PaneCanvasOptions) {
    this._options = options
  }

  getMap(): google.maps.Map | null {
    const m = this._overlay?.getMap()
    return m && 'getDiv' in m ? (m as google.maps.Map) : null
  }

  getCanvas(): HTMLCanvasElement | null {
    return this._canvas
  }

  setMap(map: google.maps.Map | null) {
    if (map) {
      this._ensureOverlay()
      this._overlay!.setMap(map)
    } else {
      this._overlay?.setMap(null)
    }
  }

  /** Coalesced repaint request — safe to call at any frequency. */
  redraw() {
    if (this._frame !== null) return
    this._frame = requestAnimationFrame(() => {
      this._frame = null
      this._anchorAndRender()
    })
  }

  /** Immediate repaint — used from the API's own draw() so re-anchors never show stale pixels. */
  private _drawNow() {
    if (this._frame !== null) {
      cancelAnimationFrame(this._frame)
      this._frame = null
    }
    this._anchorAndRender()
  }

  private _ensureOverlay() {
    if (this._overlay) return
    const self = this
    this._overlay = new (class extends google.maps.OverlayView {
      override onAdd() {
        self._onAdd()
      }
      override draw() {
        self._drawNow()
      }
      override onRemove() {
        self._onRemove()
      }
    })()
  }

  private _onAdd() {
    const overlay = this._overlay!
    const panes = overlay.getPanes()
    const map = this.getMap()
    if (!panes || !map) return

    const canvas = document.createElement('canvas')
    if (this._options.className) canvas.className = this._options.className
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.top = '0'
    canvas.style.pointerEvents = 'none'
    panes[this._options.pane].appendChild(canvas)

    this._canvas = canvas
    this._ctx = canvas.getContext('2d')

    const bump = () => this.redraw()
    this._listeners = [
      map.addListener('bounds_changed', bump),
      map.addListener('zoom_changed', bump),
      map.addListener('idle', bump),
    ]

    this._options.onAttach?.(canvas, panes)
  }

  private _onRemove() {
    for (const l of this._listeners) l.remove()
    this._listeners = []
    if (this._frame !== null) {
      cancelAnimationFrame(this._frame)
      this._frame = null
    }
    this._options.onDetach?.()
    this._canvas?.remove()
    this._canvas = null
    this._ctx = null
  }

  private _anchorAndRender() {
    const overlay = this._overlay
    const canvas = this._canvas
    const ctx = this._ctx
    const map = this.getMap()
    if (!overlay || !canvas || !ctx || !map) return
    const projection = overlay.getProjection()
    if (!projection) return

    const div = map.getDiv()
    const margin = this._options.marginPx ?? DEFAULT_MARGIN
    const width = div.offsetWidth + margin * 2
    const height = div.offsetHeight + margin * 2
    if (width <= 0 || height <= 0) return

    const dpr = Math.min(window.devicePixelRatio || 1, this._options.maxDpr ?? DEFAULT_MAX_DPR)
    const bw = Math.round(width * dpr)
    const bh = Math.round(height * dpr)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
    }
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    // Glue the canvas top-left to container (-margin, -margin), expressed in
    // the pane's own coordinate space. The API exposes no direct
    // container→div conversion, so compose the two it does have.
    const anchorLl = projection.fromContainerPixelToLatLng(
      new google.maps.Point(-margin, -margin),
    )
    const origin = anchorLl ? projection.fromLatLngToDivPixel(anchorLl) : null
    if (!origin) return
    canvas.style.left = `${origin.x}px`
    canvas.style.top = `${origin.y}px`

    const project = (ll: LatLng) => {
      const p = projection.fromLatLngToDivPixel(latLngGoogle(ll))
      return { x: (p?.x ?? 0) - origin.x, y: (p?.y ?? 0) - origin.y }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this._options.render(ctx, {
      width,
      height,
      margin,
      zoom: map.getZoom() ?? 0,
      project,
    })
  }
}
