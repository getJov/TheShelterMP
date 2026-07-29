import type { Bounds, LatLng, Polygon } from '@/domain'

/**
 * Lots are specified physically (1.00 × 2.44 m) but rendered geographically.
 * This is the bridge. The map editor's grid generator reuses it.
 */

/** At the equator, 1° of latitude ≈ 110,574 m. */
export const metresToLat = (m: number) => m / 110574
/** Longitude degrees shrink with latitude. */
export const metresToLng = (m: number, atLat: number) =>
  m / (111320 * Math.cos((atLat * Math.PI) / 180))

/** Rotate a local (east, north) metre offset clockwise from north. */
function rotate(eastM: number, northM: number, deg: number) {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return {
    e: eastM * cos + northM * sin,
    n: -eastM * sin + northM * cos,
  }
}

export function offsetMetres(origin: LatLng, eastM: number, northM: number): LatLng {
  return [origin[0] + metresToLat(northM), origin[1] + metresToLng(eastM, origin[0])]
}

/**
 * A rectangle of w × l metres centred on `origin`, rotated clockwise from
 * north. Returns four LatLng in clockwise order starting at the NW corner.
 */
export function rectAt(
  origin: LatLng,
  widthM: number,
  lengthM: number,
  rotationDeg: number,
): Polygon {
  const hw = widthM / 2
  const hl = lengthM / 2
  const corners: [number, number][] = [
    [-hw, hl], // NW
    [hw, hl], // NE
    [hw, -hl], // SE
    [-hw, -hl], // SW
  ]
  return corners.map(([e, n]) => {
    const r = rotate(e, n, rotationDeg)
    return offsetMetres(origin, r.e, r.n)
  })
}

export interface GridCell {
  lotNumber: number
  row: number
  col: number
  polygon: Polygon
  centroid: LatLng
}

export interface GridOptions {
  /** NW corner of the grid. */
  origin: LatLng
  rows: number
  cols: number
  cellWidthM: number
  cellLengthM: number
  gutterM: number
  /** Optional separate gutter between rows. Defaults to gutterM. */
  rowGutterM?: number
  rotationDeg: number
  numbering: 'row_major' | 'col_major' | 'boustrophedon'
  startNumber?: number
}

/**
 * Lay out rows × cols rectangles anchored at the grid's NW corner.
 * `boustrophedon` snakes left-to-right then right-to-left, which is how
 * physical markers are actually walked and numbered.
 */
export function generateGrid(o: GridOptions): GridCell[] {
  const rowGutter = o.rowGutterM ?? o.gutterM
  const pitchE = o.cellWidthM + o.gutterM
  const pitchN = o.cellLengthM + rowGutter
  const start = o.startNumber ?? 1
  const cells: GridCell[] = []

  for (let r = 0; r < o.rows; r++) {
    for (let c = 0; c < o.cols; c++) {
      // Local offset of this cell's centre from the grid origin.
      const eastM = c * pitchE + o.cellWidthM / 2
      const northM = -(r * pitchN + o.cellLengthM / 2)
      const rot = rotate(eastM, northM, o.rotationDeg)
      const centroid = offsetMetres(o.origin, rot.e, rot.n)

      let index: number
      if (o.numbering === 'row_major') {
        index = r * o.cols + c
      } else if (o.numbering === 'col_major') {
        index = c * o.rows + r
      } else {
        const inRow = r % 2 === 0 ? c : o.cols - 1 - c
        index = r * o.cols + inRow
      }

      cells.push({
        lotNumber: start + index,
        row: r,
        col: c,
        polygon: rectAt(centroid, o.cellWidthM, o.cellLengthM, o.rotationDeg),
        centroid,
      })
    }
  }

  return cells.sort((a, b) => a.lotNumber - b.lotNumber)
}

export function polygonCentroid(p: Polygon): LatLng {
  let lat = 0
  let lng = 0
  for (const [a, b] of p) {
    lat += a
    lng += b
  }
  return [lat / p.length, lng / p.length]
}

export function boundsOf(polygons: Polygon[]): Bounds {
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  for (const poly of polygons) {
    for (const [la, ln] of poly) {
      if (la < minLat) minLat = la
      if (la > maxLat) maxLat = la
      if (ln < minLng) minLng = ln
      if (ln > maxLng) maxLng = ln
    }
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}

/** Approximate area of a small polygon in square metres. */
export function areaSqm(p: Polygon): number {
  if (p.length < 3) return 0
  const lat0 = p[0]![0]
  const pts = p.map(([la, ln]) => [
    (ln * 111320 * Math.cos((lat0 * Math.PI) / 180)),
    la * 110574,
  ])
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!
    const [x2, y2] = pts[(i + 1) % pts.length]!
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum / 2)
}

/** Ray-cast point-in-polygon, used for canvas hit-testing and selection. */
export function pointInPolygon(pt: LatLng, poly: Polygon): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]!
    const [yj, xj] = poly[j]!
    const intersect =
      yi > pt[0] !== yj > pt[0] &&
      pt[1] < ((xj - xi) * (pt[0] - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}
