import {
  asId,
  DEFAULT_PARK_CENTROID,
  type Block,
  type Lot,
  type MapOverlay,
  type Tier,
  type TierId,
} from '@/domain'
import type { Rng } from './rng'
import { NOW } from './time'
import { NOT_FOR_SALE_REASONS } from './names'
import {
  areaSqm,
  boundsOf,
  generateGrid,
  offsetMetres,
  offsetMetresRotated,
  rectAt,
} from './geo'
import {
  LOC_ILANGAY,
  TIER_FG_PRIME,
  TIER_FG_STD,
  TIER_LAWN_PLUS,
  TIER_LAWN_PRIME,
  TIER_LAWN_STD,
} from './seed-catalog'
import { PARK_LAYOUT } from './park-layout'

const t = { createdAt: NOW, updatedAt: NOW }

/** The whole park sits at this bearing, so blocks read as one site. */
const ROT = 12

interface BlockSpec {
  code: string
  name: string
  rows: number
  cols: number
  gutterM: number
  rowGutterM: number
  baseTier: TierId
  /** East / north offset of the block's NW corner from the park centroid. */
  originE: number
  originN: number
  /** Returns an override tier for a given (row, col), or null. */
  tierOverride?: (row: number, col: number) => TierId | null
}

const BLOCKS: BlockSpec[] = [
  {
    code: 'B01',
    name: 'Garden of Peace',
    rows: 24,
    cols: 18,
    gutterM: 0.6,
    rowGutterM: 0.9,
    baseTier: TIER_LAWN_STD,
    originE: -62,
    originN: 46,
    // The four rows nearest the chapel walk are upgraded.
    tierOverride: (r) => (r < 4 ? TIER_LAWN_PLUS : null),
  },
  {
    code: 'B02',
    name: 'Garden of Serenity',
    rows: 20,
    cols: 18,
    gutterM: 0.6,
    rowGutterM: 0.9,
    baseTier: TIER_LAWN_STD,
    originE: 12,
    originN: 46,
    // The perimeter column carries the premium position.
    tierOverride: (_r, c) => (c === 17 ? TIER_LAWN_PRIME : null),
  },
  {
    code: 'B03',
    name: 'Family Gardens',
    rows: 8,
    cols: 14,
    gutterM: 1.2,
    rowGutterM: 1.6,
    baseTier: TIER_FG_STD,
    originE: -50,
    originN: -34,
    // The two rows nearest the drive are prime.
    tierOverride: (r) => (r < 2 ? TIER_FG_PRIME : null),
  },
]

export interface ParkSeed {
  blocks: Block[]
  lots: Lot[]
  overlays: MapOverlay[]
}

export function seedPark(_rng: Rng, _tiers: Tier[]): ParkSeed {
  // A hand-tuned layout (pasted from the editor's getpropsie()) wins over the
  // procedural one. Geometry only — business state is normalised so the
  // deterministic sales/burial seeds layer on cleanly.
  if (PARK_LAYOUT) {
    const blocks = PARK_LAYOUT.blocks.map((b) => ({ ...b, ...t }))
    const lots = PARK_LAYOUT.lots.map((l) => ({
      ...l,
      status: 'available' as const,
      activeHoldId: null,
      currentContractId: null,
      currentOwnerClientId: null,
      intermentCount: 0,
      notForSaleReason: null,
      ...t,
    }))
    const overlays = PARK_LAYOUT.overlays.map((o) => ({ ...o, ...t }))
    return { blocks, lots, overlays }
  }
  // No hand-tuned layout yet: the park boots EMPTY (user decision
  // 2026-07-31). Geometry now comes from the Map Editor; once its
  // getpropsie() JSON is pasted into park-layout.ts, the deterministic
  // sales/agent/burial seeds light up on top of it with the same
  // distributions they use today — they all scale to the lots that exist.
  return { blocks: [], lots: [], overlays: [] }
}

/**
 * The previous generated demo layout, kept for reference. Not called while
 * the park boots empty; wire it back in seedPark if a synthetic layout is
 * ever wanted again.
 */
export function seedProceduralPark(rng: Rng, tiers: Tier[]): ParkSeed {
  const tierById = new Map(tiers.map((x) => [x.id, x]))
  const blocks: Block[] = []
  const lots: Lot[] = []
  let lotSeq = 0

  for (const spec of BLOCKS) {
    const baseTier = tierById.get(spec.baseTier)!
    const origin = offsetMetres(DEFAULT_PARK_CENTROID, spec.originE, spec.originN)

    const cells = generateGrid({
      origin,
      rows: spec.rows,
      cols: spec.cols,
      cellWidthM: baseTier.widthM,
      cellLengthM: baseTier.lengthM,
      gutterM: spec.gutterM,
      rowGutterM: spec.rowGutterM,
      rotationDeg: ROT,
      numbering: 'boustrophedon',
    })

    const blockId = asId<'Block'>(`blk_${spec.code.toLowerCase()}`)

    // Block outline: the grid extent plus a 2 m verge. The centre offset
    // lives in the grid's ROTATED frame — the lots are placed with rotated
    // offsets, so an axis-aligned offset here would shear the outline off
    // its own lots (the pre-fix 8-metre drift).
    const widthM = spec.cols * (baseTier.widthM + spec.gutterM) + 4
    const lengthM = spec.rows * (baseTier.lengthM + spec.rowGutterM) + 4
    const blockCentre = offsetMetresRotated(
      origin,
      widthM / 2 - 2,
      -(lengthM / 2 - 2),
      ROT,
    )
    const polygon = rectAt(blockCentre, widthM, lengthM, ROT)

    for (const cell of cells) {
      const tierId = spec.tierOverride?.(cell.row, cell.col) ?? spec.baseTier
      const tier = tierById.get(tierId)!
      lotSeq++
      lots.push({
        id: asId<'Lot'>(`lot_${String(lotSeq).padStart(5, '0')}`),
        locationId: LOC_ILANGAY,
        blockId,
        lotNumber: cell.lotNumber,
        tierId,
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
        ...t,
      })
    }

    blocks.push({
      id: blockId,
      locationId: LOC_ILANGAY,
      code: spec.code,
      name: spec.name,
      polygon,
      centroid: blockCentre,
      grid: {
        rows: spec.rows,
        cols: spec.cols,
        rotationDeg: ROT,
        gutterM: spec.gutterM,
        numbering: 'boustrophedon',
      },
      defaultTierId: spec.baseTier,
      lotCount: cells.length,
      active: true,
      ...t,
    })
  }

  // ── not-for-sale features ────────────────────────────────────────
  // Carved out so the map reads as a real site rather than a spreadsheet.
  const nfsTargets = [
    { block: 'B01', numbers: [1, 2, 19, 20] },
    { block: 'B02', numbers: [1, 18] },
  ]
  for (const target of nfsTargets) {
    const blockId = asId<'Block'>(`blk_${target.block.toLowerCase()}`)
    for (const n of target.numbers) {
      const lot = lots.find((l) => l.blockId === blockId && l.lotNumber === n)
      if (lot) {
        lot.status = 'not_for_sale'
        lot.notForSaleReason = rng.pick(NOT_FOR_SALE_REASONS)
      }
    }
  }

  const overlays: MapOverlay[] = [
    {
      id: asId<'Overlay'>('ovl_siteplan'),
      locationId: LOC_ILANGAY,
      name: 'Site Development Plan (draft)',
      imageUrl: sitePlanDataUrl(),
      bounds: boundsOf(blocks.map((b) => b.polygon)),
      rotationDeg: 0,
      opacity: 0.35,
      // Published. The map's own "Show site plan" switch (default off) is
      // the per-session toggle; this flag is what spec 10 publishes.
      visible: true,
      zIndex: 1,
      ...t,
    },
  ]

  return { blocks, lots, overlays }
}

/**
 * A procedurally drawn "site development plan" so the overlay toggle and the
 * map editor's Compare control have something real to switch on.
 */
function sitePlanDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
    <rect width="800" height="800" fill="#fffdf8"/>
    <g stroke="#8a6d34" fill="none" stroke-width="2.5">
      <rect x="60" y="60" width="300" height="330"/>
      <rect x="420" y="60" width="300" height="278"/>
      <rect x="110" y="470" width="420" height="230"/>
      <path d="M60 420 H720" stroke-width="14" stroke-opacity="0.18"/>
      <path d="M385 60 V740" stroke-width="14" stroke-opacity="0.18"/>
      <circle cx="600" cy="560" r="58"/>
      <path d="M572 560 h56 M600 532 v56"/>
    </g>
    <g fill="#8a6d34" font-family="serif" font-size="19" opacity="0.75">
      <text x="70" y="50">BLOCK 01 — GARDEN OF PEACE</text>
      <text x="430" y="50">BLOCK 02 — GARDEN OF SERENITY</text>
      <text x="120" y="460">BLOCK 03 — FAMILY GARDENS</text>
      <text x="556" y="642">CHAPEL</text>
    </g>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
