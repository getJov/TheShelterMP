import type { MapOverlay } from '@/domain'
import { latLngGoogle } from './coords'

/**
 * A bounds-pinned image, positioned like google.maps.GroundOverlay: the wrap
 * lives in an overlay pane and is placed in div-pixel space from draw(), so
 * pans and the zoom animation carry it via the pane's own transforms — no
 * per-event syncing, no lag.
 */
export interface ImageOverlayHandle {
  el: HTMLDivElement
  img: HTMLImageElement
  sync: () => void
  setOpacity: (opacity: number) => void
  setOutline: (active: boolean) => void
  view: google.maps.OverlayView
}

export function createImageOverlay(
  map: google.maps.Map,
  overlay: MapOverlay,
  options: {
    opacity: number
    zIndex: number
    className?: string
    /** floatPane renders above the lot canvas — used while aligning an overlay. */
    pane?: 'overlayLayer' | 'floatPane'
  },
): ImageOverlayHandle {
  const wrap = document.createElement('div')
  wrap.className = 'shelter-image-overlay-wrap'
  wrap.style.cssText = `position:absolute;pointer-events:none;z-index:${options.zIndex};overflow:visible;`
  const img = document.createElement('img')
  img.src = overlay.imageUrl
  img.alt = overlay.name
  img.draggable = false
  img.className = options.className ?? 'shelter-siteplan-image'
  img.style.cssText =
    'width:100%;height:100%;object-fit:fill;display:block;transform-origin:center center;'
  if (overlay.rotationDeg) img.style.transform = `rotate(${overlay.rotationDeg}deg)`
  wrap.appendChild(img)

  const view = new google.maps.OverlayView()
  view.onAdd = () => {
    view.getPanes()?.[options.pane ?? 'overlayLayer'].appendChild(wrap)
  }
  view.draw = () => {
    const proj = view.getProjection()
    if (!proj) return
    const sw = proj.fromLatLngToDivPixel(
      latLngGoogle([overlay.bounds[0][0], overlay.bounds[0][1]]),
    )
    const ne = proj.fromLatLngToDivPixel(
      latLngGoogle([overlay.bounds[1][0], overlay.bounds[1][1]]),
    )
    if (!sw || !ne) return
    wrap.style.left = `${Math.min(sw.x, ne.x)}px`
    wrap.style.top = `${Math.min(sw.y, ne.y)}px`
    wrap.style.width = `${Math.abs(ne.x - sw.x)}px`
    wrap.style.height = `${Math.abs(ne.y - sw.y)}px`
  }
  view.onRemove = () => wrap.remove()
  view.setMap(map)

  const setOpacity = (opacity: number) => {
    wrap.style.opacity = String(opacity)
  }
  setOpacity(options.opacity)

  const setOutline = (active: boolean) => {
    img.style.outline = active ? '2px dashed var(--color-gold)' : 'none'
    img.style.outlineOffset = '2px'
  }

  return { el: wrap, img, sync: () => view.draw(), setOpacity, setOutline, view }
}

export function removeImageOverlay(_map: google.maps.Map, handle: ImageOverlayHandle) {
  handle.view.setMap(null)
}
