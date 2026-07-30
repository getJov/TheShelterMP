import type { Block, BlockId, Lot, LotId, Tier, TierId } from '@/domain'
import { pointInPolygon } from '@/lib/geo'
import { detectOverlaps, distanceM } from '@/lib/grid-generator'

const FOOTPRINT_TOLERANCE_M = 0.08

export type GeometryConflictKind = 'overlap' | 'outside_block' | 'tier_footprint'

export interface GeometryConflict {
  kind: GeometryConflictKind
  lotId: LotId
  blockId: BlockId | null
  message: string
}

export interface GeometryValidationReport {
  conflicts: GeometryConflict[]
  overlapLotIds: Set<LotId>
  outsideBlockLotIds: Set<LotId>
  tierMismatchLotIds: Set<LotId>
  conflictingLotIds: Set<LotId>
  blockingCount: number
  canPublish: boolean
}

export interface LotFootprint {
  widthM: number
  lengthM: number
}

export function lotFootprint(lot: Lot): LotFootprint {
  return {
    widthM: distanceM(lot.polygon[0] ?? lot.centroid, lot.polygon[1] ?? lot.centroid),
    lengthM: distanceM(lot.polygon[1] ?? lot.centroid, lot.polygon[2] ?? lot.centroid),
  }
}

export function doesLotMatchTierFootprint(lot: Lot, tier: Tier | undefined): boolean {
  if (!tier) return true
  const footprint = lotFootprint(lot)
  const direct =
    Math.abs(footprint.widthM - tier.widthM) <= FOOTPRINT_TOLERANCE_M &&
    Math.abs(footprint.lengthM - tier.lengthM) <= FOOTPRINT_TOLERANCE_M
  const rotated =
    Math.abs(footprint.widthM - tier.lengthM) <= FOOTPRINT_TOLERANCE_M &&
    Math.abs(footprint.lengthM - tier.widthM) <= FOOTPRINT_TOLERANCE_M
  return direct || rotated
}

export function validateLayoutGeometry(
  blocks: Block[],
  lots: Lot[],
  tiersById: Map<TierId, Tier>,
): GeometryValidationReport {
  const conflicts: GeometryConflict[] = []
  const overlapLotIds = detectOverlaps(lots)
  const outsideBlockLotIds = new Set<LotId>()
  const tierMismatchLotIds = new Set<LotId>()
  const blockById = new Map(blocks.map((block) => [block.id, block]))

  for (const id of overlapLotIds) {
    const lot = lots.find((candidate) => candidate.id === id)
    conflicts.push({
      kind: 'overlap',
      lotId: id,
      blockId: lot?.blockId ?? null,
      message: 'Overlaps another lot',
    })
  }

  for (const lot of lots) {
    const block = blockById.get(lot.blockId)
    if (!block || !isLotInsideBlock(lot, block)) {
      outsideBlockLotIds.add(lot.id)
      conflicts.push({
        kind: 'outside_block',
        lotId: lot.id,
        blockId: lot.blockId,
        message: block ? `Sits outside ${block.code}` : 'References a missing block',
      })
    }

    const tier = tiersById.get(lot.tierId)
    if (!doesLotMatchTierFootprint(lot, tier)) {
      tierMismatchLotIds.add(lot.id)
      conflicts.push({
        kind: 'tier_footprint',
        lotId: lot.id,
        blockId: lot.blockId,
        message: tier
          ? `Footprint does not match ${tier.widthM.toFixed(2)} x ${tier.lengthM.toFixed(2)} m`
          : 'References an inactive or missing tier',
      })
    }
  }

  const conflictingLotIds = new Set<LotId>([
    ...overlapLotIds,
    ...outsideBlockLotIds,
    ...tierMismatchLotIds,
  ])

  return {
    conflicts,
    overlapLotIds,
    outsideBlockLotIds,
    tierMismatchLotIds,
    conflictingLotIds,
    blockingCount: conflicts.length,
    canPublish: conflicts.length === 0,
  }
}

export function conflictSummary(report: GeometryValidationReport): string[] {
  const rows: string[] = []
  if (report.overlapLotIds.size > 0) {
    rows.push(`${report.overlapLotIds.size.toLocaleString()} overlapping lot${report.overlapLotIds.size === 1 ? '' : 's'}`)
  }
  if (report.outsideBlockLotIds.size > 0) {
    rows.push(`${report.outsideBlockLotIds.size.toLocaleString()} lot${report.outsideBlockLotIds.size === 1 ? '' : 's'} outside block`)
  }
  if (report.tierMismatchLotIds.size > 0) {
    rows.push(`${report.tierMismatchLotIds.size.toLocaleString()} tier-size mismatch${report.tierMismatchLotIds.size === 1 ? '' : 'es'}`)
  }
  return rows
}

function isLotInsideBlock(lot: Lot, block: Block): boolean {
  if (!pointInPolygon(lot.centroid, block.polygon)) return false
  return lot.polygon.every((point) => pointInPolygon(point, block.polygon))
}
