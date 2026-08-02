import type { Bounds, LatLng } from '@/domain'
import type { MapPoint } from './types'
import { googleToLatLng, latLngGoogle, latLngToGoogle } from './coords'
import { getMapProjection } from './projection-bridge'
import { latLngToWorldPixel } from './projection'

export type ShelterMap = google.maps.Map

export function asShelterMap(
  map: google.maps.Map | google.maps.StreetViewPanorama | null | undefined,
): ShelterMap | null {
  if (!map) return null
  return 'fitBounds' in map ? (map as ShelterMap) : null
}

export { googleToLatLng, latLngGoogle, latLngToGoogle } from './coords'

export function boundsToGoogle(b: Bounds): google.maps.LatLngBoundsLiteral {
  return { south: b[0][0], west: b[0][1], north: b[1][0], east: b[1][1] }
}

export function boundsFromGoogle(b: google.maps.LatLngBounds): Bounds {
  const sw = b.getSouthWest()
  const ne = b.getNorthEast()
  return [
    [sw.lat(), sw.lng()],
    [ne.lat(), ne.lng()],
  ]
}

export function getMapZoom(map: google.maps.Map): number {
  return map.getZoom() ?? 0
}

export function getMapCenter(map: google.maps.Map): LatLng {
  const c = map.getCenter()
  if (!c) return [0, 0]
  return googleToLatLng(c)
}

export function getMapSize(map: google.maps.Map): MapPoint {
  const div = map.getDiv()
  return { x: div.offsetWidth, y: div.offsetHeight }
}

export function latLngToContainerPoint(map: google.maps.Map, ll: LatLng): MapPoint {
  const proj = getMapProjection(map)
  if (!proj) return { x: 0, y: 0 }
  const p = proj.fromLatLngToContainerPixel(latLngGoogle(ll))
  return { x: p?.x ?? 0, y: p?.y ?? 0 }
}

export function containerPointToLatLng(map: google.maps.Map, x: number, y: number): LatLng {
  const proj = getMapProjection(map)
  if (!proj) return [0, 0]
  const ll = proj.fromContainerPixelToLatLng(new google.maps.Point(x, y))
  if (!ll) return [0, 0]
  return googleToLatLng(ll)
}

export function distanceLatLng(a: LatLng, b: LatLng): number {
  return google.maps.geometry.spherical.computeDistanceBetween(
    latLngGoogle(a),
    latLngGoogle(b),
  )
}

export function viewportOrigin(map: google.maps.Map, zoom: number): { ox: number; oy: number } {
  const proj = map.getProjection()
  const bounds = map.getBounds()
  if (!proj || !bounds) return { ox: 0, oy: 0 }
  const nw = new google.maps.LatLng(bounds.getNorthEast().lat(), bounds.getSouthWest().lng())
  const pt = proj.fromLatLngToPoint(nw)
  if (!pt) return { ox: 0, oy: 0 }
  const scale = 2 ** zoom
  return { ox: pt.x * scale, oy: pt.y * scale }
}

export interface FitBoundsOptions {
  padding?: [number, number]
  paddingTopLeft?: [number, number]
  paddingBottomRight?: [number, number]
  animate?: boolean
}

export function fitMapBounds(map: google.maps.Map, bounds: Bounds, options: FitBoundsOptions = {}) {
  const literal = boundsToGoogle(bounds)
  let padding: number | google.maps.Padding | undefined
  if (options.padding) {
    padding = options.padding[0]
  }
  if (options.paddingTopLeft || options.paddingBottomRight) {
    padding = {
      top: options.paddingTopLeft?.[1] ?? 0,
      left: options.paddingTopLeft?.[0] ?? 0,
      bottom: options.paddingBottomRight?.[1] ?? 0,
      right: options.paddingBottomRight?.[0] ?? 0,
    }
  }
  map.fitBounds(literal, padding)
}

export function flyMapToBounds(
  map: google.maps.Map,
  bounds: Bounds,
  options: { padding?: [number, number] } = {},
) {
  fitMapBounds(map, bounds, { padding: options.padding })
}

export function flyMapTo(
  map: google.maps.Map,
  center: LatLng,
  zoom: number,
  _options: { duration?: number } = {},
) {
  map.panTo(latLngToGoogle(center))
  const current = map.getZoom()
  if (current !== zoom) map.setZoom(zoom)
}

export function zoomMapIn(map: google.maps.Map) {
  const z = map.getZoom() ?? 0
  map.setZoom(z + 1)
}

export function zoomMapOut(map: google.maps.Map) {
  const z = map.getZoom() ?? 0
  map.setZoom(z - 1)
}

export function getViewBounds(map: google.maps.Map, insetRatio = 0): Bounds {
  const b = map.getBounds()
  if (!b) return [[0, 0], [0, 0]]
  if (insetRatio <= 0) return boundsFromGoogle(b)
  const sw = b.getSouthWest()
  const ne = b.getNorthEast()
  const dLat = (ne.lat() - sw.lat()) * insetRatio
  const dLng = (ne.lng() - sw.lng()) * insetRatio
  return [
    [sw.lat() + dLat, sw.lng() + dLng],
    [ne.lat() - dLat, ne.lng() - dLng],
  ]
}

export function stopMapEventPropagation(el: HTMLElement) {
  const stop = (e: Event) => e.stopPropagation()
  for (const type of ['click', 'dblclick', 'mousedown', 'mousemove', 'pointerdown'] as const) {
    el.addEventListener(type, stop)
  }
  el.addEventListener('wheel', stop, { passive: false })
}

export function mouseEventToContainerPoint(map: google.maps.Map, e: MouseEvent | PointerEvent): MapPoint {
  const rect = map.getDiv().getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

export function pointerToWorldPixel(
  map: google.maps.Map,
  x: number,
  y: number,
  zoom: number,
): [number, number] {
  const ll = containerPointToLatLng(map, x, y)
  const p = latLngToWorldPixel(map, ll, zoom)
  return [p?.x ?? 0, p?.y ?? 0]
}

export function googleMapsApiKey(): string | undefined {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  return typeof key === 'string' && key.length > 0 ? key : undefined
}
