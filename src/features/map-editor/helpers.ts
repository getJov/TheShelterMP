import { useMemo } from 'react'
import {
  formatLotCode,
  type AuditAction,
  type Block,
  type BlockId,
  type Lot,
  type LotId,
  type LotStatus,
  type MapOverlay,
  type Tier,
  type TierId,
} from '@/domain'
import { useDataset } from '@/stores/dataset'
import { resolveFill, type LotPaint } from '@/features/map/paint'
import type { LotRecord } from '@/features/map/lot-canvas'
import { isProtected } from '@/lib/grid-generator'
import { useEditor, type DraftState } from './store'
import { validateLayoutGeometry, type GeometryValidationReport } from './geometry-validation'

export const STATUS_LABEL: Record<LotStatus, string> = {
  available: 'Available',
  held: 'Held',
  sold: 'Sold',
  occupied: 'Occupied',
  not_for_sale: 'Not for sale',
}

/** Tiers are shared across locations and never edited here — read them live. */
export function useTiers(): { tiers: Tier[]; byId: Map<TierId, Tier> } {
  const data = useDataset((s) => s.data)
  return useMemo(() => {
    const tiers = data.tiers.filter((t) => t.active).sort((a, b) => a.sortOrder - b.sortOrder)
    return { tiers, byId: new Map(data.tiers.map((t) => [t.id, t])) }
  }, [data])
}

export const blockCodeMap = (blocks: Block[]) =>
  new Map<BlockId, string>(blocks.map((b) => [b.id, b.code]))

export const lotCode = (lot: Lot, codes: Map<BlockId, string>) =>
  formatLotCode(codes.get(lot.blockId) ?? '??', lot.lotNumber)

/**
 * Geometry for the shared canvas layer. Identity is stable while the lot
 * array is, which is what keeps the projection cache alive across paints.
 */
export function useDraftRecords(lots: Lot[]): LotRecord[] {
  return useMemo(
    () =>
      lots.map((l) => ({
        id: l.id,
        polygon: l.polygon,
        centroid: l.centroid,
        label: String(l.lotNumber),
      })),
    [lots],
  )
}

/**
 * Editor fills. Always tier mode — tier is the thing being edited — and the
 * status badge is stripped, because in here status is noise.
 */
export function useDraftPaints(
  lots: Lot[],
  tiersById: Map<TierId, Tier>,
  dark: boolean,
): LotPaint[] {
  return useMemo(
    () =>
      lots.map((lot) => ({
        ...resolveFill(lot, 'tier', {
          tiersById,
          agentIndex: new Map(),
          dark,
          visibility: 'full',
          matches: true,
        }),
        badge: null,
      })),
    [lots, tiersById, dark],
  )
}

export interface TierMix {
  tier: Tier | undefined
  count: number
}

export function tierMix(lots: Lot[], byId: Map<TierId, Tier>): TierMix[] {
  const counts = new Map<TierId, number>()
  for (const l of lots) counts.set(l.tierId, (counts.get(l.tierId) ?? 0) + 1)
  return [...counts.entries()]
    .map(([id, count]) => ({ tier: byId.get(id), count }))
    .sort((a, b) => b.count - a.count)
}

// ── the publish diff ─────────────────────────────────────────────────

export type ChangeSeverity = 'normal' | 'sold'

export interface ChangeGroup {
  id: string
  /** From AUDIT_ACTIONS — one audit event is written per group on publish. */
  action: AuditAction
  entityType: string
  entityId: string
  label: string
  detail?: string
  count: number
  codes: string[]
  severity: ChangeSeverity
}

export interface ChangeReport {
  groups: ChangeGroup[]
  soldGroups: ChangeGroup[]
  total: number
  /** Distinct sold or occupied lots touched by anything in this publish. */
  soldTouched: number
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Every difference between the drafts and the data they were forked from,
 * in the language the client would use to describe it. Computed by diffing
 * rather than by logging commands — a log can drift from the truth, a diff
 * cannot.
 */
export function diffChanges(
  baseline: DraftState,
  draft: DraftState,
  tiersById: Map<TierId, Tier>,
): ChangeReport {
  const groups: ChangeGroup[] = []
  const soldIds = new Set<LotId>()

  const codes = blockCodeMap([...baseline.blocks, ...draft.blocks])
  const code = (l: Lot) => lotCode(l, codes)

  const baseBlocks = new Map(baseline.blocks.map((b) => [b.id, b]))
  const draftBlocks = new Map(draft.blocks.map((b) => [b.id, b]))
  const baseLots = new Map(baseline.lots.map((l) => [l.id, l]))
  const draftLots = new Map(draft.lots.map((l) => [l.id, l]))

  const push = (
    id: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    label: string,
    lots: Lot[],
    detail?: string,
  ) => {
    if (lots.length === 0) return
    const sold = lots.filter(isProtected)
    for (const l of sold) soldIds.add(l.id)
    groups.push({
      id,
      action,
      entityType,
      entityId,
      label,
      detail,
      count: lots.length,
      codes: lots.map(code).sort(),
      severity: sold.length > 0 ? 'sold' : 'normal',
    })
  }

  // ── blocks ──────────────────────────────────────────────────────
  for (const b of draft.blocks) {
    if (baseBlocks.has(b.id)) continue
    groups.push({
      id: `block-new-${b.id}`,
      action: 'block.created',
      entityType: 'Block',
      entityId: b.id,
      label: `Block ${b.code} created`,
      detail: b.name ?? undefined,
      count: 1,
      codes: [b.code],
      severity: 'normal',
    })
  }
  for (const b of baseline.blocks) {
    if (draftBlocks.has(b.id)) continue
    const lost = baseline.lots.filter((l) => l.blockId === b.id)
    for (const l of lost.filter(isProtected)) soldIds.add(l.id)
    groups.push({
      id: `block-del-${b.id}`,
      action: 'block.created',
      entityType: 'Block',
      entityId: b.id,
      label: `Block ${b.code} deleted`,
      detail: lost.length > 0 ? `${plural(lost.length, 'lot')} removed with it` : undefined,
      count: 1,
      codes: lost.map(code).sort(),
      severity: lost.some(isProtected) ? 'sold' : 'normal',
    })
  }
  for (const b of draft.blocks) {
    const before = baseBlocks.get(b.id)
    if (!before) continue
    const bits: string[] = []
    if (before.code !== b.code) bits.push(`code ${before.code} → ${b.code}`)
    if ((before.name ?? '') !== (b.name ?? '')) bits.push('name')
    const geometryChanged = JSON.stringify(before.polygon) !== JSON.stringify(b.polygon)
    if (geometryChanged) bits.push('geometry aligned')
    if (before.defaultTierId !== b.defaultTierId) bits.push('default tier')
    if (bits.length === 0) continue
    groups.push({
      id: `block-edit-${b.id}`,
      action: 'block.created',
      entityType: 'Block',
      entityId: b.id,
      label:
        geometryChanged && bits.length === 1
          ? `Block ${b.code} geometry aligned`
          : `Block ${b.code} edited`,
      detail: bits.join(', '),
      count: 1,
      codes: [b.code],
      severity: 'normal',
    })
  }

  // ── lots added / removed ────────────────────────────────────────
  const addedByBlock = new Map<BlockId, Lot[]>()
  for (const l of draft.lots) {
    if (baseLots.has(l.id)) continue
    const arr = addedByBlock.get(l.blockId)
    if (arr) arr.push(l)
    else addedByBlock.set(l.blockId, [l])
  }
  for (const [blockId, lots] of addedByBlock) {
    const bc = codes.get(blockId) ?? '??'
    push(
      `lots-add-${blockId}`,
      'block.created',
      'Block',
      blockId,
      `${plural(lots.length, 'lot')} generated in ${bc}`,
      lots,
    )
  }

  const removedByBlock = new Map<BlockId, Lot[]>()
  for (const l of baseline.lots) {
    if (draftLots.has(l.id)) continue
    if (!draftBlocks.has(l.blockId)) continue // already reported as a block deletion
    const arr = removedByBlock.get(l.blockId)
    if (arr) arr.push(l)
    else removedByBlock.set(l.blockId, [l])
  }
  for (const [blockId, lots] of removedByBlock) {
    const bc = codes.get(blockId) ?? '??'
    push(
      `lots-del-${blockId}`,
      'block.created',
      'Block',
      blockId,
      `${plural(lots.length, 'lot')} deleted from ${bc}`,
      lots,
    )
  }

  // ── lots changed ────────────────────────────────────────────────
  const retier = new Map<string, Lot[]>()
  const restatus = new Map<string, Lot[]>()
  const moved = new Map<string, Lot[]>()
  const renumbered = new Map<BlockId, Lot[]>()
  const reshaped = new Map<BlockId, Lot[]>()
  const footprintSynced = new Map<BlockId, Lot[]>()

  const bump = <K,>(m: Map<K, Lot[]>, k: K, l: Lot) => {
    const a = m.get(k)
    if (a) a.push(l)
    else m.set(k, [l])
  }

  for (const l of draft.lots) {
    const before = baseLots.get(l.id)
    if (!before) continue
    if (before.tierId !== l.tierId) bump(retier, `${before.tierId}>${l.tierId}`, l)
    if (before.status !== l.status) bump(restatus, `${before.status}>${l.status}`, l)
    if (before.blockId !== l.blockId) bump(moved, `${before.blockId}>${l.blockId}`, l)
    else if (before.lotNumber !== l.lotNumber) bump(renumbered, l.blockId, l)
    if (
      before.blockId === l.blockId &&
      JSON.stringify(before.polygon) !== JSON.stringify(l.polygon)
    ) {
      if (Math.abs(before.areaSqm - l.areaSqm) > 0.05) bump(footprintSynced, l.blockId, l)
      else bump(reshaped, l.blockId, l)
    }
  }

  for (const [key, lots] of retier) {
    const [from, to] = key.split('>') as [TierId, TierId]
    const fromName = tiersById.get(from)?.name ?? 'a tier'
    const toName = tiersById.get(to)?.name ?? 'a tier'
    push(
      `retier-${key}`,
      'lot.tier_changed',
      'Lot',
      to,
      `${plural(lots.length, 'lot')} changed from ${fromName} to ${toName}`,
      lots,
    )
  }
  for (const [key, lots] of restatus) {
    const [from, to] = key.split('>') as [LotStatus, LotStatus]
    push(
      `status-${key}`,
      'lot.status_changed',
      'Lot',
      to,
      `${plural(lots.length, 'lot')} set to ${STATUS_LABEL[to]}`,
      lots,
      `previously ${STATUS_LABEL[from]}`,
    )
  }
  for (const [key, lots] of moved) {
    const [from, to] = key.split('>') as [BlockId, BlockId]
    push(
      `move-${key}`,
      'block.created',
      'Block',
      to,
      `${plural(lots.length, 'lot')} moved from ${codes.get(from) ?? '??'} to ${codes.get(to) ?? '??'}`,
      lots,
    )
  }
  for (const [blockId, lots] of renumbered) {
    push(
      `renum-${blockId}`,
      'block.created',
      'Block',
      blockId,
      `${plural(lots.length, 'lot')} renumbered in ${codes.get(blockId) ?? '??'}`,
      lots,
    )
  }
  for (const [blockId, lots] of reshaped) {
    push(
      `geometry-${blockId}`,
      'block.created',
      'Block',
      blockId,
      `${plural(lots.length, 'lot')} geometry aligned in ${codes.get(blockId) ?? '??'}`,
      lots,
      'Only polygons, centroids and measured area changed',
    )
  }
  for (const [blockId, lots] of footprintSynced) {
    push(
      `footprint-${blockId}`,
      'block.created',
      'Block',
      blockId,
      `${plural(lots.length, 'lot')} footprint synced to tier size in ${codes.get(blockId) ?? '??'}`,
      lots,
      'Tier width and length changed the visual lot geometry',
    )
  }

  // ── overlays ────────────────────────────────────────────────────
  const baseOverlays = new Map(baseline.overlays.map((o) => [o.id, o]))
  const draftOverlays = new Map(draft.overlays.map((o) => [o.id, o]))
  for (const o of draft.overlays) {
    const before = baseOverlays.get(o.id)
    if (!before) {
      groups.push({
        id: `ovl-new-${o.id}`,
        action: 'overlay.published',
        entityType: 'MapOverlay',
        entityId: o.id,
        label: `Site plan overlay "${o.name}" added`,
        detail: o.visible
          ? `Visible on the main map at ${Math.round(o.opacity * 100)}% opacity`
          : 'Staged but hidden from the main map',
        count: 1,
        codes: [],
        severity: 'normal',
      })
      continue
    }
    const bits = overlayDelta(before, o)
    if (bits.length > 0) {
      groups.push({
        id: `ovl-edit-${o.id}`,
        action: 'overlay.published',
        entityType: 'MapOverlay',
        entityId: o.id,
        label: `Site plan overlay "${o.name}" updated`,
        detail: bits.join(', '),
        count: 1,
        codes: [],
        severity: 'normal',
      })
    }
  }
  for (const o of baseline.overlays) {
    if (draftOverlays.has(o.id)) continue
    groups.push({
      id: `ovl-del-${o.id}`,
      action: 'overlay.published',
      entityType: 'MapOverlay',
      entityId: o.id,
      label: `Site plan overlay "${o.name}" removed`,
      count: 1,
      codes: [],
      severity: 'normal',
    })
  }

  const soldGroups = groups.filter((g) => g.severity === 'sold')
  return {
    groups: groups.filter((g) => g.severity === 'normal'),
    soldGroups,
    total: groups.length,
    soldTouched: soldIds.size,
  }
}

function overlayDelta(a: MapOverlay, b: MapOverlay): string[] {
  const bits: string[] = []
  if (a.name !== b.name) bits.push('renamed')
  if (a.imageUrl !== b.imageUrl) bits.push('image replaced')
  if (JSON.stringify(a.bounds) !== JSON.stringify(b.bounds)) bits.push('repositioned')
  if (a.rotationDeg !== b.rotationDeg) bits.push('rotated')
  if (Math.abs(a.opacity - b.opacity) > 0.005) {
    bits.push(`opacity ${Math.round(b.opacity * 100)}%`)
  }
  if (a.visible !== b.visible) bits.push(b.visible ? 'shown on main map' : 'hidden from main map')
  if (a.zIndex !== b.zIndex) bits.push('reordered')
  return bits
}

/** The live diff between the drafts and the data they were forked from. */
export function useChangeReport(): ChangeReport {
  const baseline = useEditor((s) => s.baseline)
  const blocks = useEditor((s) => s.blocks)
  const lots = useEditor((s) => s.lots)
  const overlays = useEditor((s) => s.overlays)
  const { byId } = useTiers()
  return useMemo(
    () => diffChanges(baseline, { blocks, lots, overlays }, byId),
    [baseline, blocks, lots, overlays, byId],
  )
}

export function useLayoutValidation(): GeometryValidationReport {
  const blocks = useEditor((s) => s.blocks)
  const lots = useEditor((s) => s.lots)
  const { byId } = useTiers()
  return useMemo(
    () => validateLayoutGeometry(blocks, lots, byId),
    [blocks, lots, byId],
  )
}

/** Sold / occupied lots inside a selection — the bulk bar's warning line. */
export function protectedIn(lots: Lot[], ids: Set<LotId>) {
  const hits = lots.filter((l) => ids.has(l.id) && isProtected(l))
  return { count: hits.length, lots: hits }
}
