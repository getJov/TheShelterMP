import {
  asId,
  type Block,
  type BlockId,
  type LatLng,
  type LocationId,
  type Lot,
  type LotId,
  type Polygon,
  type Tier,
} from '@/domain'
import {
  areaSqm,
  generateGrid,
  metresToLat,
  metresToLng,
  offsetMetres,
  pointInPolygon,
  polygonCentroid,
  rectAt,
} from '@/lib/geo'

/**
 * The map editor's lot factory.
 *
 * All of the geometry maths lives in `@/mock/geo` (re-exported by `@/lib/geo`)
 * and is reached through `generateGrid` / `rectAt` / `offsetMetres`. Nothing
 * here re-derives a projection. What this module adds on top is the part the
 * seed never needed: block-local coordinates so a grid can be fitted to a
 * drawn boundary, code and number assignment that survives existing lots,
 * capacity snapshotting, clipping and overlap repair.
 */

export type Numbering = 'row_major' | 'col_major' | 'boustrophedon'

export const NUMBERING: { id: Numbering; label: string; hint: string }[] = [
  { id: 'row_major', label: 'Row-major', hint: 'Left to right, every row restarts at the left.' },
  { id: 'col_major', label: 'Column-major', hint: 'Top to bottom, every column restarts at the top.' },
  {
    id: 'boustrophedon',
    label: 'Serpentine',
    hint: 'Snakes left, then right — how markers are actually walked.',
  },
]

export const NUMBERING_LABEL: Record<Numbering, string> = {
  row_major: 'Row-major',
  col_major: 'Column-major',
  boustrophedon: 'Serpentine',
}

/** The 3×3 order each scheme produces — drives the diagrams in the UI. */
export function numberingPreview(scheme: Numbering, n = 3): number[][] {
  const out: number[][] = []
  for (let r = 0; r < n; r++) {
    const row: number[] = []
    for (let c = 0; c < n; c++) {
      if (scheme === 'row_major') row.push(r * n + c + 1)
      else if (scheme === 'col_major') row.push(c * n + r + 1)
      else row.push(r * n + (r % 2 === 0 ? c : n - 1 - c) + 1)
    }
    out.push(row)
  }
  return out
}

// ── the block-local metre frame ──────────────────────────────────────
// `generateGrid` walks outward from a NW corner in metres, rotated clockwise
// from north. To fit a grid inside a drawn boundary we need the inverse: a
// boundary vertex expressed in those same metres.

const M_PER_DEG_LAT = 1 / metresToLat(1)
const mPerDegLng = (lat: number) => 1 / metresToLng(1, lat)

function spin(e: number, n: number, deg: number) {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return { e: e * cos + n * sin, n: -e * sin + n * cos }
}

export interface LocalPoint {
  /** Metres along the grid's local east axis. */
  e: number
  /** Metres along the grid's local north axis. */
  n: number
}

/** World coordinate → metres in the grid's rotated frame, relative to `origin`. */
export function toLocal(origin: LatLng, p: LatLng, rotationDeg: number): LocalPoint {
  const east = (p[1] - origin[1]) * mPerDegLng(origin[0])
  const north = (p[0] - origin[0]) * M_PER_DEG_LAT
  return spin(east, north, -rotationDeg)
}

/** The exact inverse — the same composition `generateGrid` applies. */
export function fromLocal(origin: LatLng, e: number, n: number, rotationDeg: number): LatLng {
  const r = spin(e, n, rotationDeg)
  return offsetMetres(origin, r.e, r.n)
}

export interface LocalExtent {
  minE: number
  maxE: number
  minN: number
  maxN: number
  widthM: number
  lengthM: number
}

export function localExtent(
  polygon: Polygon,
  origin: LatLng,
  rotationDeg: number,
): LocalExtent {
  let minE = Infinity
  let maxE = -Infinity
  let minN = Infinity
  let maxN = -Infinity
  for (const p of polygon) {
    const l = toLocal(origin, p, rotationDeg)
    if (l.e < minE) minE = l.e
    if (l.e > maxE) maxE = l.e
    if (l.n < minN) minN = l.n
    if (l.n > maxN) maxN = l.n
  }
  return { minE, maxE, minN, maxN, widthM: maxE - minE, lengthM: maxN - minN }
}

/** Rotate a coordinate clockwise about a pivot. */
export function rotateAbout(pivot: LatLng, p: LatLng, deg: number): LatLng {
  const l = toLocal(pivot, p, 0)
  return fromLocal(pivot, l.e, l.n, deg)
}

export const rotatePolygon = (poly: Polygon, pivot: LatLng, deg: number): Polygon =>
  poly.map((p) => rotateAbout(pivot, p, deg))

/** Metre distance between two coordinates, in the same flat approximation. */
export function distanceM(a: LatLng, b: LatLng): number {
  const e = (b[1] - a[1]) * mPerDegLng(a[0])
  const n = (b[0] - a[0]) * M_PER_DEG_LAT
  return Math.hypot(e, n)
}

// ── fit ──────────────────────────────────────────────────────────────

export interface Footprint {
  cellWidthM: number
  cellLengthM: number
  gutterM: number
  rowGutterM: number
}

export interface FitResult {
  rows: number
  cols: number
  /** NW corner of the fitted grid, centred inside the boundary. */
  origin: LatLng
  /** Boundary area in m². */
  blockAreaSqm: number
}

/**
 * The largest rows × cols that fits inside `polygon` at this footprint,
 * centred within the boundary. `insetM` keeps a verge around the edge.
 */
export function fitToBlock(
  polygon: Polygon,
  rotationDeg: number,
  fp: Footprint,
  insetM = 0,
): FitResult {
  const anchor = polygon[0] ?? [0, 0]
  const ext = localExtent(polygon, anchor, rotationDeg)
  const usableW = Math.max(0, ext.widthM - insetM * 2)
  const usableL = Math.max(0, ext.lengthM - insetM * 2)

  const pitchE = fp.cellWidthM + fp.gutterM
  const pitchN = fp.cellLengthM + fp.rowGutterM
  const cols = Math.max(0, Math.floor((usableW + fp.gutterM) / pitchE))
  const rows = Math.max(0, Math.floor((usableL + fp.rowGutterM) / pitchN))

  return {
    rows,
    cols,
    origin: originFor(polygon, rotationDeg, fp, rows, cols, insetM),
    blockAreaSqm: areaSqm(polygon),
  }
}

/** NW corner that centres an arbitrary rows × cols grid inside the boundary. */
export function originFor(
  polygon: Polygon,
  rotationDeg: number,
  fp: Footprint,
  rows: number,
  cols: number,
  insetM = 0,
): LatLng {
  const anchor = polygon[0] ?? [0, 0]
  const ext = localExtent(polygon, anchor, rotationDeg)
  const usableW = Math.max(0, ext.widthM - insetM * 2)
  const usableL = Math.max(0, ext.lengthM - insetM * 2)
  const usedW = cols > 0 ? cols * (fp.cellWidthM + fp.gutterM) - fp.gutterM : 0
  const usedL = rows > 0 ? rows * (fp.cellLengthM + fp.rowGutterM) - fp.rowGutterM : 0
  const originE = ext.minE + insetM + (usableW - usedW) / 2
  const originN = ext.maxN - insetM - (usableL - usedL) / 2
  return fromLocal(anchor, originE, originN, rotationDeg)
}

// ── planning a grid ──────────────────────────────────────────────────

export interface GridPlanInput extends Footprint {
  rows: number
  cols: number
  rotationDeg: number
  numbering: Numbering
  startNumber: number
  /** Boundary the cells are clipped to. Null skips clipping. */
  boundary: Polygon | null
  /** NW corner. When absent the grid is fitted to the boundary. */
  origin?: LatLng
  insetM?: number
}

export interface PlannedCell {
  lotNumber: number
  row: number
  col: number
  polygon: Polygon
  centroid: LatLng
}

export interface GridPlan {
  cells: PlannedCell[]
  /** Cells dropped because they fell outside the boundary. */
  clipped: number
  usedAreaSqm: number
  blockAreaSqm: number
}

/**
 * `generateGrid` does the layout; this adds clipping to the boundary and the
 * area arithmetic the readout needs. A cell is kept when its centroid is
 * inside the boundary — the honest test for "does this lot belong here".
 */
export function planGrid(input: GridPlanInput): GridPlan {
  const origin =
    input.origin ??
    (input.boundary
      ? originFor(
          input.boundary,
          input.rotationDeg,
          input,
          Math.max(0, Math.round(input.rows)),
          Math.max(0, Math.round(input.cols)),
          input.insetM ?? 0,
        )
      : [0, 0])

  const raw = generateGrid({
    origin,
    rows: Math.max(0, Math.round(input.rows)),
    cols: Math.max(0, Math.round(input.cols)),
    cellWidthM: input.cellWidthM,
    cellLengthM: input.cellLengthM,
    gutterM: input.gutterM,
    rowGutterM: input.rowGutterM,
    rotationDeg: input.rotationDeg,
    numbering: input.numbering,
    startNumber: input.startNumber,
  })

  const kept: PlannedCell[] = []
  let clipped = 0
  for (const cell of raw) {
    if (input.boundary && !pointInPolygon(cell.centroid, input.boundary)) {
      clipped++
      continue
    }
    kept.push({
      lotNumber: cell.lotNumber,
      row: cell.row,
      col: cell.col,
      polygon: cell.polygon,
      centroid: cell.centroid,
    })
  }

  return {
    cells: kept,
    clipped,
    usedAreaSqm: kept.length * input.cellWidthM * input.cellLengthM,
    blockAreaSqm: input.boundary ? areaSqm(input.boundary) : 0,
  }
}

// ── lot construction ─────────────────────────────────────────────────

let lotSeq = 500_000
let blockSeq = 500
let overlaySeq = 500

export const newLotId = () => asId<'Lot'>(`lot_e${++lotSeq}`)
export const newBlockId = () => asId<'Block'>(`blk_e${++blockSeq}`)
export const newOverlayId = () => asId<'Overlay'>(`ovl_e${++overlaySeq}`)

/**
 * A lot that cannot be deleted, moved or shrunk. Contract or interment — the
 * two things a mockup must never pretend it can undo.
 */
export const isProtected = (l: Lot) =>
  l.status === 'sold' ||
  l.status === 'occupied' ||
  l.currentContractId !== null ||
  l.intermentCount > 0

export interface BuildArgs {
  cells: PlannedCell[]
  blockId: BlockId
  locationId: LocationId
  tier: Tier
  now: string
  /** Numbers already taken in this block; generated lots step around them. */
  used?: Set<number>
}

/** Turns planned cells into lots — code, tier and a capacity snapshot. */
export function buildLots({
  cells,
  blockId,
  locationId,
  tier,
  now,
  used,
}: BuildArgs): Lot[] {
  const taken = new Set(used ?? [])
  const out: Lot[] = []
  for (const cell of cells) {
    let n = cell.lotNumber
    while (taken.has(n)) n++
    taken.add(n)
    out.push({
      id: newLotId(),
      locationId,
      blockId,
      lotNumber: n,
      tierId: tier.id,
      polygon: cell.polygon,
      centroid: cell.centroid,
      areaSqm: Math.round(areaSqm(cell.polygon) * 100) / 100,
      status: 'available',
      capacity: tier.capacity,
      intermentCount: 0,
      activeHoldId: null,
      currentContractId: null,
      currentOwnerClientId: null,
      notForSaleReason: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })
  }
  return out.sort((a, b) => a.lotNumber - b.lotNumber)
}

/** Re-lay a lot on a new footprint around its own centroid. */
export function resizeLot(lot: Lot, widthM: number, lengthM: number, rotationDeg: number, now: string): Lot {
  const polygon = rectAt(lot.centroid, widthM, lengthM, rotationDeg)
  return {
    ...lot,
    polygon,
    areaSqm: Math.round(areaSqm(polygon) * 100) / 100,
    updatedAt: now,
  }
}

/**
 * Capacity may be snapshotted from a new tier, but never below the burials
 * already recorded in the lot. This is the rule the whole editor turns on.
 */
export const safeCapacity = (lot: Lot, tier: Tier) =>
  Math.max(tier.capacity, lot.intermentCount)

// ── codes ────────────────────────────────────────────────────────────

/** Next free `B0n` for a location. */
export function nextBlockCode(blocks: Block[]): string {
  let max = 0
  for (const b of blocks) {
    const m = /^B(\d+)$/i.exec(b.code.trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `B${String(max + 1).padStart(2, '0')}`
}

export function blockCodeError(
  code: string,
  blocks: Block[],
  ignoreId?: BlockId | null,
): string | null {
  const v = code.trim()
  if (!v) return 'A block code is required.'
  if (!/^[A-Za-z0-9-]{2,8}$/.test(v)) return 'Use 2–8 letters, digits or hyphens.'
  const clash = blocks.some(
    (b) => b.id !== ignoreId && b.code.trim().toLowerCase() === v.toLowerCase(),
  )
  return clash ? `${v} is already used at this location.` : null
}

export const nextLotNumber = (lots: Lot[]) =>
  lots.reduce((m, l) => Math.max(m, l.lotNumber), 0) + 1

// ── spatial index: rows and columns of an existing block ─────────────

export interface RowCol {
  row: number
  col: number
}

/**
 * Rows and columns inferred from geometry, not stored. Free-hand lots and
 * generated ones therefore both answer "select this row" correctly.
 *
 * Cell size comes from each lot's own footprint in the block's frame, so the
 * clustering threshold adapts to lawn lots and family gardens alike.
 */
export function spatialIndex(lots: Lot[], rotationDeg: number): Map<LotId, RowCol> {
  const out = new Map<LotId, RowCol>()
  if (lots.length === 0) return out
  const anchor = lots[0]!.centroid

  const es: number[] = []
  const ns: number[] = []
  const widths: number[] = []
  const lengths: number[] = []
  for (const l of lots) {
    const c = toLocal(anchor, l.centroid, rotationDeg)
    es.push(c.e)
    ns.push(c.n)
    const ext = localExtent(l.polygon, anchor, rotationDeg)
    widths.push(ext.widthM)
    lengths.push(ext.lengthM)
  }

  const cellW = median(widths) || 1
  const cellL = median(lengths) || 1
  const colBands = cluster(es, cellW * 0.6, 'asc')
  const rowBands = cluster(ns, cellL * 0.6, 'desc')

  lots.forEach((l, i) => {
    out.set(l.id, {
      row: bandOf(rowBands, ns[i]!),
      col: bandOf(colBands, es[i]!),
    })
  })
  return out
}

function median(v: number[]): number {
  if (v.length === 0) return 0
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}

/** Band centres, ordered. A new band starts when the gap exceeds `threshold`. */
function cluster(values: number[], threshold: number, dir: 'asc' | 'desc'): number[] {
  const s = [...values].sort((a, b) => (dir === 'asc' ? a - b : b - a))
  const bands: number[] = []
  let sum = 0
  let count = 0
  let last = Number.NaN
  for (const v of s) {
    if (count > 0 && Math.abs(v - last) > threshold) {
      bands.push(sum / count)
      sum = 0
      count = 0
    }
    sum += v
    count++
    last = v
  }
  if (count > 0) bands.push(sum / count)
  return bands
}

function bandOf(bands: number[], v: number): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < bands.length; i++) {
    const d = Math.abs(bands[i]! - v)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

// ── overlaps ─────────────────────────────────────────────────────────

const cellKey = (p: LatLng, size: number) =>
  `${Math.floor(p[0] / size)}:${Math.floor(p[1] / size)}`

/**
 * Every lot whose polygon intersects another's. Bucketed by centroid so this
 * stays linear at a few thousand lots instead of quadratic.
 */
export function detectOverlaps(lots: Lot[]): Set<LotId> {
  const hit = new Set<LotId>()
  if (lots.length < 2) return hit
  const size = metresToLat(6)
  const buckets = new Map<string, number[]>()
  lots.forEach((l, i) => {
    const k = cellKey(l.centroid, size)
    const b = buckets.get(k)
    if (b) b.push(i)
    else buckets.set(k, [i])
  })

  const near = (i: number): number[] => {
    const l = lots[i]!
    const r = Math.floor(l.centroid[0] / size)
    const c = Math.floor(l.centroid[1] / size)
    const out: number[] = []
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const b = buckets.get(`${r + dr}:${c + dc}`)
        if (b) out.push(...b)
      }
    }
    return out
  }

  for (let i = 0; i < lots.length; i++) {
    for (const j of near(i)) {
      if (j <= i) continue
      if (polygonsIntersect(lots[i]!.polygon, lots[j]!.polygon)) {
        hit.add(lots[i]!.id)
        hit.add(lots[j]!.id)
      }
    }
  }
  return hit
}

/**
 * Vertex containment both ways. Exact for the convex quads the generator
 * produces, and cheap enough to run after every generation.
 */
export function polygonsIntersect(a: Polygon, b: Polygon): boolean {
  for (const p of a) if (pointInPolygon(p, b)) return true
  for (const p of b) if (pointInPolygon(p, a)) return true
  return false
}

/**
 * Push overlapping lots apart along the line between their centroids.
 * Protected lots stay put — the neighbour is the one that moves.
 */
export function fixOverlaps(lots: Lot[], now: string): { lots: Lot[]; moved: number } {
  let working = lots.map((l) => ({ ...l }))
  let moved = 0

  for (let pass = 0; pass < 4; pass++) {
    const bad = detectOverlaps(working)
    if (bad.size === 0) break
    const index = new Map(working.map((l, i) => [l.id, i]))
    const shifted = new Set<LotId>()

    for (const id of bad) {
      const i = index.get(id)!
      const lot = working[i]!
      if (isProtected(lot)) continue
      // Nudge away from the mean centroid of everything it collides with.
      let sumLat = 0
      let sumLng = 0
      let n = 0
      for (const other of working) {
        if (other.id === lot.id) continue
        if (distanceM(other.centroid, lot.centroid) > 8) continue
        if (!polygonsIntersect(other.polygon, lot.polygon)) continue
        sumLat += other.centroid[0]
        sumLng += other.centroid[1]
        n++
      }
      if (n === 0) continue
      const dLat = lot.centroid[0] - sumLat / n
      const dLng = lot.centroid[1] - sumLng / n
      const len = Math.hypot(dLat, dLng) || 1
      const step = metresToLat(0.35)
      const shift: [number, number] = [(dLat / len) * step, (dLng / len) * step]
      working[i] = translateLot(lot, shift, now)
      shifted.add(lot.id)
    }
    if (shifted.size === 0) break
    moved += shifted.size
    working = [...working]
  }

  return { lots: working, moved }
}

export function translateLot(lot: Lot, delta: [number, number], now: string): Lot {
  return {
    ...lot,
    polygon: lot.polygon.map(([la, ln]) => [la + delta[0], ln + delta[1]] as LatLng),
    centroid: [lot.centroid[0] + delta[0], lot.centroid[1] + delta[1]],
    updatedAt: now,
  }
}

export function transformLotBetweenBlocks(
  lot: Lot,
  fromBlock: Polygon,
  toBlock: Polygon,
  now: string,
): Lot {
  const polygon = lot.polygon.map((p) => transformPointBetweenBlocks(p, fromBlock, toBlock))
  return {
    ...lot,
    polygon,
    centroid: polygonCentroid(polygon),
    areaSqm: Math.round(areaSqm(polygon) * 100) / 100,
    updatedAt: now,
  }
}

function transformPointBetweenBlocks(p: LatLng, fromBlock: Polygon, toBlock: Polygon): LatLng {
  if (fromBlock.length < 4 || toBlock.length < 4) {
    const from = polygonCentroid(fromBlock)
    const to = polygonCentroid(toBlock)
    return [p[0] + to[0] - from[0], p[1] + to[1] - from[1]]
  }

  const origin = fromBlock[0]!
  const east = toLocal(origin, fromBlock[1]!, 0)
  const south = toLocal(origin, fromBlock[3]!, 0)
  const point = toLocal(origin, p, 0)
  const det = east.e * south.n - east.n * south.e
  if (Math.abs(det) < 1e-9) {
    const from = polygonCentroid(fromBlock)
    const to = polygonCentroid(toBlock)
    return [p[0] + to[0] - from[0], p[1] + to[1] - from[1]]
  }

  const u = (point.e * south.n - point.n * south.e) / det
  const v = (east.e * point.n - east.n * point.e) / det
  const top = lerpLatLng(toBlock[0]!, toBlock[1]!, u)
  const bottom = lerpLatLng(toBlock[3]!, toBlock[2]!, u)
  return lerpLatLng(top, bottom, v)
}

function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

// ── regeneration modes ───────────────────────────────────────────────

export type RegenMode = 'replace_all' | 'append' | 'replace_unsold'

export interface RegenInput {
  mode: RegenMode
  existing: Lot[]
  plan: GridPlan
  blockId: BlockId
  locationId: LocationId
  tier: Tier
  now: string
}

export interface RegenResult {
  lots: Lot[]
  created: number
  removed: number
  preserved: number
  /** Cells dropped because a preserved lot already stood there. */
  skipped: number
}

/**
 * The three answers to "this block already has lots".
 *
 * `replace_unsold` is the one that matters: every protected lot keeps its
 * exact polygon, number, tier and capacity, and the new grid is laid around
 * it — cells that would land on top of one are simply not created.
 */
export function regenerate(input: RegenInput): RegenResult {
  const { mode, existing, plan, blockId, locationId, tier, now } = input

  if (mode === 'replace_all') {
    const lots = buildLots({ cells: plan.cells, blockId, locationId, tier, now })
    return { lots, created: lots.length, removed: existing.length, preserved: 0, skipped: 0 }
  }

  const keep = mode === 'append' ? existing : existing.filter(isProtected)
  const removed = existing.length - keep.length

  // A cell is dropped when its footprint touches a preserved lot at all —
  // testing the polygons rather than the centroids is what stops the
  // regenerated grid from being laid on top of a sold lot.
  const cells: PlannedCell[] = []
  let skipped = 0
  for (const cell of plan.cells) {
    const clash = keep.some(
      (l) =>
        distanceM(l.centroid, cell.centroid) < 12 &&
        polygonsIntersect(l.polygon, cell.polygon),
    )
    if (clash) skipped++
    else cells.push(cell)
  }

  const used = new Set(keep.map((l) => l.lotNumber))
  const fresh = buildLots({ cells, blockId, locationId, tier, now, used })
  const lots = [...keep, ...fresh].sort((a, b) => a.lotNumber - b.lotNumber)
  return { lots, created: fresh.length, removed, preserved: keep.length, skipped }
}

// ── renumbering ──────────────────────────────────────────────────────

/**
 * Reassign numbers across a selection, walking it in the chosen order.
 * Row and column come from `spatialIndex`, so the result matches what the
 * numbering diagrams promise.
 */
export function renumber(
  lots: Lot[],
  rotationDeg: number,
  scheme: Numbering,
  start: number,
  now: string,
): Lot[] {
  const rc = spatialIndex(lots, rotationDeg)
  const maxCol = Math.max(0, ...lots.map((l) => rc.get(l.id)?.col ?? 0))
  const ordered = [...lots].sort((a, b) => {
    const A = rc.get(a.id)!
    const B = rc.get(b.id)!
    if (scheme === 'col_major') return A.col - B.col || A.row - B.row
    if (scheme === 'boustrophedon') {
      const ka = A.row % 2 === 0 ? A.col : maxCol - A.col
      const kb = B.row % 2 === 0 ? B.col : maxCol - B.col
      return A.row - B.row || ka - kb
    }
    return A.row - B.row || A.col - B.col
  })
  return ordered.map((l, i) => ({ ...l, lotNumber: start + i, updatedAt: now }))
}
