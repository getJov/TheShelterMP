import { useEffect, useMemo, useState } from 'react'
import {
  MAP_VIEW_MODES,
  can,
  formatLotCode,
  type AgentId,
  type Block,
  type Lot,
  type LotId,
  type LotStatus,
  type MapOverlay,
  type MapViewMode,
  type Tier,
  type Bounds,
  type PaymentHealth,
} from '@/domain'
import { useDataset } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import { healthOfLot } from '@/lib/finance'
import { lotVisibility, type LotVisibility } from '@/lib/permissions'
import { boundsOf, boundsUnion } from '@/lib/geo'
import { useMapStore, type MapFilters } from '@/stores/map'
import { resolveFill, type LotPaint } from './paint'
import type { LotRecord } from './lot-canvas'

export interface MapLot {
  lot: Lot
  code: string
  blockCode: string
  tier: Tier | undefined
  visibility: LotVisibility
  /** Display name of the owner, or null when the viewer may not see it. */
  ownerName: string | null
  agentId: AgentId | null
  /** Computed once here so filtering, painting and the legend all agree. */
  health: PaymentHealth
}

export interface MapData {
  lots: MapLot[]
  blocks: Block[]
  tiers: Tier[]
  overlays: MapOverlay[]
  bounds: Bounds | null
  byId: Map<LotId, MapLot>
  agentIndex: Map<AgentId, number>
}

/** Everything the map draws, scoped to the active location and the viewer. */
export function useMapData(): MapData {
  const data = useDataset((s) => s.data)
  // Subscribes this hook to the dataset's mutation counter; `idx` below is
  // what actually changes, so it does not belong in the memo deps.
  void useDataset((s) => s.version)
  const idx = useDataset((s) => s.idx)
  const user = useSession((s) => s.currentUser())
  const activeLocationId = useSession((s) => s.activeLocationId)

  return useMemo(() => {
    const inScope = <T extends { locationId: Block['locationId'] }>(rows: T[]) =>
      activeLocationId ? rows.filter((r) => r.locationId === activeLocationId) : rows

    const blocks = inScope(data.blocks).filter((b) => b.active)
    const blockIds = new Set(blocks.map((b) => b.id))
    const rawLots = data.lots.filter((l) => blockIds.has(l.blockId))

    const agentIndex = new Map<AgentId, number>()
    data.agents.forEach((a, i) => agentIndex.set(a.id, i))

    const blockCode = new Map(blocks.map((b) => [b.id, b.code]))
    const lots: MapLot[] = rawLots.map((lot) => {
      const visibility = lotVisibility(user, lot)
      const contract = lot.currentContractId
        ? idx.contractsById.get(lot.currentContractId)
        : undefined
      const owner = lot.currentOwnerClientId
        ? idx.clientsById.get(lot.currentOwnerClientId)
        : undefined
      const code = formatLotCode(blockCode.get(lot.blockId) ?? '', lot.lotNumber)
      return {
        lot,
        code,
        blockCode: blockCode.get(lot.blockId) ?? '',
        tier: idx.tiersById.get(lot.tierId),
        visibility,
        ownerName:
          visibility === 'full' && owner ? `${owner.firstName} ${owner.lastName}` : null,
        agentId: contract?.agentId ?? null,
        health: healthOfLot(lot),
      }
    })

    return {
      lots,
      blocks,
      tiers: data.tiers.filter((t) => t.active),
      overlays: inScope(data.overlays),
      bounds: boundsUnion(blocks.map((b) => boundsOf([b.polygon]))),
      byId: new Map(lots.map((l) => [l.lot.id, l])),
      agentIndex,
    }
    // `idx` is rebuilt by useDataset.touch(), so it carries the mutation
    // signal; `version` is read only to subscribe this hook to it.
  }, [data, idx, user, activeLocationId])
}

/** Geometry handed to the canvas layer. Stable while the lot set is. */
export function useLotRecords(lots: MapLot[]): LotRecord[] {
  return useMemo(
    () =>
      lots.map((l) => ({
        id: l.lot.id,
        polygon: l.lot.polygon,
        centroid: l.lot.centroid,
        label: String(l.lot.lotNumber),
      })),
    [lots],
  )
}

const norm = (s: string) => s.toLowerCase().replace(/[\s-]/g, '')

/** One predicate, so legend counts and canvas dimming cannot disagree. */
export function lotMatches(l: MapLot, f: MapFilters): boolean {
  if (f.statuses.size > 0 && !f.statuses.has(l.lot.status)) return false
  if (f.tierIds.size > 0 && !f.tierIds.has(l.lot.tierId)) return false
  if (f.blockIds.size > 0 && !f.blockIds.has(l.lot.blockId)) return false
  if (f.agentIds.size > 0 && (!l.agentId || !f.agentIds.has(l.agentId))) return false
  if (f.health.size > 0 && !f.health.has(l.health)) return false
  if (f.query.trim()) {
    const q = norm(f.query)
    const hit =
      norm(l.code).includes(q) ||
      String(l.lot.lotNumber) === f.query.trim() ||
      (l.ownerName ? norm(l.ownerName).includes(q) : false)
    if (!hit) return false
  }
  return true
}

export function useLotPaints(
  lots: MapLot[],
  mode: MapViewMode,
  filters: MapFilters,
  dark: boolean,
  tiers: Tier[],
  agentIndex: Map<AgentId, number>,
): { paints: LotPaint[]; matchCount: number } {
  return useMemo(() => {
    const tiersById = new Map(tiers.map((t) => [t.id, t]))
    let matchCount = 0
    const paints = lots.map((l) => {
      const matches = lotMatches(l, filters)
      if (matches) matchCount++
      return resolveFill(l.lot, mode, {
        tiersById,
        agentIndex,
        dark,
        visibility: l.visibility,
        matches,
      })
    })
    return { paints, matchCount }
  }, [lots, mode, filters, dark, tiers, agentIndex])
}

/** Live counts per status, honouring the other active facets. */
export function useStatusCounts(lots: MapLot[], filters: MapFilters) {
  return useMemo(() => {
    const out: Record<LotStatus, number> = {
      available: 0,
      held: 0,
      sold: 0,
      occupied: 0,
      not_for_sale: 0,
    }
    const withoutStatus: MapFilters = { ...filters, statuses: new Set() }
    for (const l of lots) if (lotMatches(l, withoutStatus)) out[l.lot.status]++
    return out
  }, [lots, filters])
}

export function useTierCounts(lots: MapLot[], filters: MapFilters) {
  return useMemo(() => {
    const out = new Map<string, number>()
    const withoutTier: MapFilters = { ...filters, tierIds: new Set() }
    for (const l of lots) {
      if (!lotMatches(l, withoutTier)) continue
      out.set(l.lot.tierId, (out.get(l.lot.tierId) ?? 0) + 1)
    }
    return out
  }, [lots, filters])
}

/** Modes this user may choose between — agents never see contract colours. */
export function useAllowedViewModes() {
  const user = useSession((s) => s.currentUser())
  const viewMode = useMapStore((s) => s.viewMode)
  const setViewMode = useMapStore((s) => s.setViewMode)

  const allowed = useMemo(() => {
    const full = user ? can(user.role, 'contract:view_all') : false
    return MAP_VIEW_MODES.filter((m) => full || m.restricted !== true)
  }, [user])

  // A role switch must never leave a restricted mode selected.
  useEffect(() => {
    if (!allowed.some((m) => m.id === viewMode)) setViewMode('tier')
  }, [allowed, viewMode, setViewMode])

  return allowed
}

/** Re-renders when the `dark` class flips on <html>. */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')))
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}
