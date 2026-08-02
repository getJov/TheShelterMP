import type { Bounds, LatLng } from '@/domain'

/**
 * The map's geometry layer.
 *
 * Everything physical (metres → degrees, grid generation, centroids) already
 * lives in `@/mock/geo` because the seed needs it before the app boots. This
 * module re-exports that surface so features have one import, and adds the
 * screen-space helpers the canvas layer needs on top.
 */
export {
  generateGrid,
  rectAt,
  boundsOf,
  polygonCentroid,
  pointInPolygon,
  metresToLat,
  metresToLng,
  offsetMetres,
  areaSqm,
} from '@/mock/geo'
export type { GridCell, GridOptions } from '@/mock/geo'

// ── bounds ───────────────────────────────────────────────────────────

/** Union of several bounds tuples. Returns null when the list is empty. */
export function boundsUnion(list: Bounds[]): Bounds | null {
  if (list.length === 0) return null
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  for (const [[a, b], [c, d]] of list) {
    if (a < minLat) minLat = a
    if (b < minLng) minLng = b
    if (c > maxLat) maxLat = c
    if (d > maxLng) maxLng = d
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}

/** Grow a bounds tuple by `ratio` of its own span on every side. */
export function boundsPadded(b: Bounds, ratio: number): Bounds {
  const dLat = (b[1][0] - b[0][0]) * ratio
  const dLng = (b[1][1] - b[0][1]) * ratio
  return [
    [b[0][0] - dLat, b[0][1] - dLng],
    [b[1][0] + dLat, b[1][1] + dLng],
  ]
}

export function boundsContain(b: Bounds, pt: LatLng): boolean {
  return pt[0] >= b[0][0] && pt[0] <= b[1][0] && pt[1] >= b[0][1] && pt[1] <= b[1][1]
}

export function boundsCentre(b: Bounds): LatLng {
  return [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]
}

// ── projection ───────────────────────────────────────────────────────

/** Ray-cast hit test against a flat [x0,y0,x1,y1,…] point buffer. */
export function pointInFlatPolygon(
  x: number,
  y: number,
  pts: Float64Array | Float32Array,
  start: number,
  count: number,
): boolean {
  let inside = false
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = pts[start + i * 2]!
    const yi = pts[start + i * 2 + 1]!
    const xj = pts[start + j * 2]!
    const yj = pts[start + j * 2 + 1]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * The vertex a status badge anchors to — visually the polygon's top-left.
 * Screen space, so it stays correct whatever the park's bearing is.
 */
export function topLeftVertex(
  pts: Float64Array | Float32Array,
  start: number,
  count: number,
): { x: number; y: number } {
  let bx = pts[start]!
  let by = pts[start + 1]!
  let best = bx + by
  for (let i = 1; i < count; i++) {
    const x = pts[start + i * 2]!
    const y = pts[start + i * 2 + 1]!
    const s = x + y
    if (s < best) {
      best = s
      bx = x
      by = y
    }
  }
  return { x: bx, y: by }
}

/** Project a polygon at a fixed zoom for canvas caching. */
export { projectPolygon } from '@/features/map/google/projection'
