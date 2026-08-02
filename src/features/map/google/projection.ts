import type { LatLng, Polygon } from '@/domain'
import { latLngGoogle } from './coords'

function worldScale(zoom: number): number {
  return 2 ** zoom
}

/** World pixel at a fixed zoom — safe to cache across pans. */
export function latLngToWorldPixel(
  map: google.maps.Map,
  ll: LatLng,
  zoom: number,
): google.maps.Point | null {
  const proj = map.getProjection()
  if (!proj) return null
  const pt = proj.fromLatLngToPoint(latLngGoogle(ll))
  if (!pt) return null
  const scale = worldScale(zoom)
  return new google.maps.Point(pt.x * scale, pt.y * scale)
}

export function projectPolygon(
  map: google.maps.Map,
  poly: Polygon,
  zoom: number,
): Float64Array {
  const out = new Float64Array(poly.length * 2)
  for (let i = 0; i < poly.length; i++) {
    const p = latLngToWorldPixel(map, poly[i]!, zoom)
    out[i * 2] = p?.x ?? 0
    out[i * 2 + 1] = p?.y ?? 0
  }
  return out
}
