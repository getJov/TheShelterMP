import {
  formatLotCode,
  MAX_BURIALS_PER_DAY,
  PARK_FACTS,
  PAYMENT_HEALTH_APPEARANCE,
  STATUS_APPEARANCE,
  type AgentId,
  type BurialSlot,
  type Centavos,
  type ISODate,
  type IntermentId,
  type LocationId,
  type LotId,
  type LotStatus,
  type PayoutRun,
  type User,
} from '@/domain'
import { dataset, indexes } from '@/stores/dataset'
import { TODAY } from '@/mock'
import { addDays, diffDays, dowOf } from '@/lib/dates'
import { periodFor } from '@/lib/commission'
import {
  agentCollected,
  agentEarnings,
  balanceOf,
  collectionsBetween,
  inventorySummary,
  leaderboard,
  monthBounds,
  prevMonthBounds,
  receivablesBreakdown,
  trailingMonths,
  trustFundBalance,
  trustFundBetween,
} from '@/lib/finance'
import type { DashboardPeriod } from '@/stores/panel'

/**
 * One memoised selector per card, keyed on (dataset version, user, location,
 * period, agent).
 *
 * Without the memo the panel recomputes collections over ~775 payments on
 * every map hover, and that shows.
 */

// ── memo ─────────────────────────────────────────────────────────────
const CACHE_LIMIT = 24

function memoise<T>(fn: (k: SelectorKey) => T): (k: SelectorKey) => T {
  const cache = new Map<string, T>()
  return (k) => {
    const id = cacheKey(k)
    if (cache.has(id)) return cache.get(id)!
    const value = fn(k)
    cache.set(id, value)
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    return value
  }
}

export interface SelectorKey {
  version: number
  user: User
  locationId: LocationId | null
  period: DashboardPeriod
  agentId: AgentId | null
}

const cacheKey = (k: SelectorKey) =>
  `${k.version}|${k.user.id}|${k.locationId ?? 'all'}|${k.period}|${k.agentId ?? '-'}`

// ── period windows ───────────────────────────────────────────────────
export interface PeriodWindow {
  from: ISODate
  to: ISODate
  label: string
  prevFrom: ISODate
  prevTo: ISODate
  prevLabel: string
}

function quarterBounds(asOf: ISODate, back = 0): [ISODate, ISODate] {
  const [y, m] = asOf.split('-').map(Number)
  const qIndex = Math.floor((m! - 1) / 3) - back
  const year = y! + Math.floor(qIndex / 4)
  const q = ((qIndex % 4) + 4) % 4
  const startMonth = q * 3 + 1
  const endMonth = startMonth + 2
  const last = new Date(year, endMonth, 0).getDate()
  return [
    `${year}-${String(startMonth).padStart(2, '0')}-01`,
    `${year}-${String(endMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  ]
}

/** Monday-based week containing `asOf`. */
export function weekBounds(asOf: ISODate = TODAY): [ISODate, ISODate] {
  const offset = (dowOf(asOf) + 6) % 7
  const from = addDays(asOf, -offset)
  return [from, addDays(from, 6)]
}

export function periodWindow(
  period: DashboardPeriod,
  asOf: ISODate = TODAY,
): PeriodWindow {
  switch (period) {
    case 'today':
      return {
        from: asOf,
        to: asOf,
        label: 'Today',
        prevFrom: addDays(asOf, -1),
        prevTo: addDays(asOf, -1),
        prevLabel: 'yesterday',
      }
    case 'week': {
      const [from, to] = weekBounds(asOf)
      return {
        from,
        to,
        label: 'This week',
        prevFrom: addDays(from, -7),
        prevTo: addDays(from, -1),
        prevLabel: 'last week',
      }
    }
    case 'quarter': {
      const [from, to] = quarterBounds(asOf)
      const [pf, pt] = quarterBounds(asOf, 1)
      return {
        from,
        to,
        label: 'This quarter',
        prevFrom: pf,
        prevTo: pt,
        prevLabel: 'last quarter',
      }
    }
    case 'month':
    default: {
      const [from, to] = monthBounds(asOf)
      const [pf, pt] = prevMonthBounds(asOf)
      return {
        from,
        to,
        label: 'This month',
        prevFrom: pf,
        prevTo: pt,
        prevLabel: 'last month',
      }
    }
  }
}

const deltaPercent = (now: number, prev: number): number | null =>
  prev === 0 ? null : ((now - prev) / prev) * 100

// ── 1 · collections ──────────────────────────────────────────────────
export interface CollectionsData {
  window: PeriodWindow
  totalCentavos: Centavos
  count: number
  prevCentavos: Centavos
  deltaPercent: number | null
  series: { label: string; centavos: Centavos }[]
  todayCentavos: Centavos
  weekCentavos: Centavos
}

export const selectCollections = memoise<CollectionsData>((k) => {
  const window = periodWindow(k.period)
  const now = collectionsBetween(window.from, window.to, k.locationId)
  const prev = collectionsBetween(window.prevFrom, window.prevTo, k.locationId)
  const [weekFrom] = weekBounds()

  return {
    window,
    totalCentavos: now.totalCentavos,
    count: now.count,
    prevCentavos: prev.totalCentavos,
    deltaPercent: deltaPercent(now.totalCentavos, prev.totalCentavos),
    series: trailingMonths(12).map((m) => ({
      label: m.label,
      centavos: collectionsBetween(m.from, m.to, k.locationId).totalCentavos,
    })),
    todayCentavos: collectionsBetween(TODAY, TODAY, k.locationId).totalCentavos,
    weekCentavos: collectionsBetween(weekFrom, TODAY, k.locationId).totalCentavos,
  }
})

// ── 2 · receivables ──────────────────────────────────────────────────
export type ReceivableBucket = 'current' | 'due_soon' | 'overdue' | 'severely_overdue'

export interface ReceivablesSegment {
  key: ReceivableBucket
  label: string
  color: string
  count: number
  centavos: Centavos
  ratio: number
  /** Overdue buckets drive the map into payment_health mode. */
  drillable: boolean
}

export interface ReceivablesData {
  totalCentavos: Centavos
  contractCount: number
  segments: ReceivablesSegment[]
  overdueCount: number
}

const BUCKET_ORDER: ReceivableBucket[] = [
  'current',
  'due_soon',
  'overdue',
  'severely_overdue',
]

export const selectReceivables = memoise<ReceivablesData>((k) => {
  const r = receivablesBreakdown(k.locationId)
  const segments = BUCKET_ORDER.map((key) => {
    const b = r.buckets[key]
    return {
      key,
      label: PAYMENT_HEALTH_APPEARANCE[key].label,
      color: PAYMENT_HEALTH_APPEARANCE[key].color,
      count: b.count,
      centavos: b.centavos,
      ratio: r.totalCentavos > 0 ? b.centavos / r.totalCentavos : 0,
      drillable: key === 'overdue' || key === 'severely_overdue',
    }
  })

  return {
    totalCentavos: r.totalCentavos,
    contractCount: r.contracts.length,
    segments,
    overdueCount:
      r.buckets.overdue.count + r.buckets.severely_overdue.count,
  }
})

// ── 3 · inventory ────────────────────────────────────────────────────
export interface InventoryData {
  total: number
  available: number
  statuses: { status: LotStatus; label: string; color: string; count: number; ratio: number }[]
  tiers: { id: string; name: string; total: number; available: number }[]
  /** Every lot rendered across the whole park, ignoring location scope. */
  mappedTotal: number
  plannedTotal: number
}

const LOT_STATUS_ORDER: LotStatus[] = [
  'available',
  'held',
  'sold',
  'occupied',
  'not_for_sale',
]

export const selectInventory = memoise<InventoryData>((k) => {
  const s = inventorySummary(k.locationId)
  const tiersById = indexes().tiersById
  const total = s.total || 1

  return {
    total: s.total,
    available: s.byStatus.available,
    statuses: LOT_STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_APPEARANCE[status].label,
      color: STATUS_APPEARANCE[status].color,
      count: s.byStatus[status],
      ratio: s.byStatus[status] / total,
    })),
    tiers: [...s.byTier.entries()]
      .map(([id, v]) => ({
        id,
        name: tiersById.get(id as never)?.name ?? id,
        total: v.total,
        available: v.available,
      }))
      .sort((a, b) => b.total - a.total),
    mappedTotal: inventorySummary(null).total,
    plannedTotal: PARK_FACTS.plannedLotCount,
  }
})

// ── 4 · trust fund ───────────────────────────────────────────────────
export interface TrustFundData {
  balanceCentavos: Centavos
  periodAccrualCentavos: Centavos
  series: { label: string; centavos: Centavos }[]
}

export const selectTrustFund = memoise<TrustFundData>((k) => {
  const window = periodWindow(k.period)
  return {
    balanceCentavos: trustFundBalance(k.locationId),
    periodAccrualCentavos: trustFundBetween(window.from, window.to, k.locationId),
    series: trailingMonths(12).map((m) => ({
      label: m.label,
      // Running balance at each month end — an area, not a bar chart.
      centavos: trustFundBalance(k.locationId, m.to),
    })),
  }
})

// ── 5 · leaderboard ──────────────────────────────────────────────────
export interface LeaderRow {
  agentId: AgentId
  name: string
  initials: string
  agentCode: string
  rank: number
  collectedCentavos: Centavos
  targetCentavos: Centavos | null
  targetRatio: number | null
  isSelf: boolean
}

export interface LeaderboardData {
  rows: LeaderRow[]
  /** True when the viewer's own row was appended from outside the top five. */
  selfPinned: boolean
  totalAgents: number
}

const initialsOf = (name: string) => {
  const parts = name.split(' ').filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
}

export const selectLeaderboard = memoise<LeaderboardData>((k) => {
  const window = periodWindow(k.period)
  const all = leaderboard(window.from, window.to, k.locationId)
  const idx = indexes()

  const decorate = (r: (typeof all)[number]): LeaderRow => {
    const agent = idx.agentsById.get(r.agentId)
    const user = agent ? idx.usersById.get(agent.userId) : undefined
    const name = user?.fullName ?? agent?.agentCode ?? '—'
    return {
      agentId: r.agentId,
      name,
      initials: initialsOf(name),
      agentCode: agent?.agentCode ?? '—',
      rank: r.rank,
      collectedCentavos: r.collectedCentavos,
      targetCentavos: r.targetCentavos,
      targetRatio: r.targetRatio,
      isSelf: k.agentId !== null && r.agentId === k.agentId,
    }
  }

  const top = all.slice(0, 5).map(decorate)
  let selfPinned = false

  if (k.agentId && !top.some((r) => r.isSelf)) {
    const mine = all.find((r) => r.agentId === k.agentId)
    // A leaderboard that hides you is discouraging; pin the viewer's row.
    if (mine) {
      top.push(decorate(mine))
      selfPinned = true
    }
  }

  return { rows: top, selfPinned, totalAgents: all.length }
})

// ── 6 · upcoming burials ─────────────────────────────────────────────
export interface BurialRow {
  id: IntermentId
  lotId: LotId
  lotCode: string
  date: ISODate
  slot: BurialSlot
  deceased: string
  /** Both slots taken that day. */
  dayFull: boolean
  daysAway: number
}

export const selectBurials = memoise<{ rows: BurialRow[]; scheduledInPeriod: number }>(
  (k) => {
    const idx = indexes()
    const rows = dataset()
      .interments.filter(
        (i) =>
          (k.locationId === null || i.locationId === k.locationId) &&
          (i.status === 'scheduled' || i.status === 'requested') &&
          i.scheduledDate >= TODAY,
      )
      .sort((a, b) =>
        a.scheduledDate === b.scheduledDate
          ? a.slot === b.slot
            ? 0
            : a.slot === 'morning'
              ? -1
              : 1
          : a.scheduledDate < b.scheduledDate
            ? -1
            : 1,
      )

    const perDay = new Map<ISODate, number>()
    for (const i of rows) perDay.set(i.scheduledDate, (perDay.get(i.scheduledDate) ?? 0) + 1)

    const window = periodWindow(k.period)

    return {
      scheduledInPeriod: rows.filter(
        (i) => i.scheduledDate >= window.from && i.scheduledDate <= window.to,
      ).length,
      rows: rows.slice(0, 5).map((i) => {
        const lot = idx.lotsById.get(i.lotId)
        const block = lot ? idx.blocksById.get(lot.blockId) : undefined
        return {
          id: i.id,
          lotId: i.lotId,
          lotCode:
            lot && block ? formatLotCode(block.code, lot.lotNumber) : '—',
          date: i.scheduledDate,
          slot: i.slot,
          deceased: [i.deceasedFirstName, i.deceasedLastName].filter(Boolean).join(' '),
          dayFull: (perDay.get(i.scheduledDate) ?? 0) >= MAX_BURIALS_PER_DAY,
          daysAway: diffDays(i.scheduledDate, TODAY),
        }
      }),
    }
  },
)

// ── 7 · sales activity ───────────────────────────────────────────────
export interface SalesActivityData {
  window: PeriodWindow
  count: number
  prevCount: number
  deltaCount: number
  preNeed: number
  atNeed: number
  totalCentavos: Centavos
  averageCentavos: Centavos
  /** True when the figures are the viewing agent's own. */
  scopedToAgent: boolean
}

export const selectSalesActivity = memoise<SalesActivityData>((k) => {
  const window = periodWindow(k.period)
  const idx = indexes()

  const pool = k.agentId
    ? (idx.contractsByAgent.get(k.agentId as unknown as string) ?? [])
    : dataset().contracts

  const inScope = pool.filter(
    (c) =>
      c.status !== 'cancelled' &&
      (k.locationId === null || c.locationId === k.locationId),
  )

  const written = inScope.filter(
    (c) => c.signedAt >= window.from && c.signedAt <= window.to,
  )
  const prev = inScope.filter(
    (c) => c.signedAt >= window.prevFrom && c.signedAt <= window.prevTo,
  )

  const total = written.reduce((s, c) => s + c.contractPriceCentavos, 0)

  return {
    window,
    count: written.length,
    prevCount: prev.length,
    deltaCount: written.length - prev.length,
    preNeed: written.filter((c) => c.needType === 'pre_need').length,
    atNeed: written.filter((c) => c.needType === 'at_need').length,
    totalCentavos: total,
    averageCentavos: written.length > 0 ? Math.round(total / written.length) : 0,
    scopedToAgent: k.agentId !== null,
  }
})

// ── 8 · needs attention ──────────────────────────────────────────────
export interface AttentionRow {
  key: string
  count: number
  label: string
  href: string
  tone: 'neutral' | 'warning' | 'danger'
}

export interface AttentionData {
  rows: AttentionRow[]
  total: number
}

export const selectAttention = memoise<AttentionData>((k) => {
  const d = dataset()
  const loc = k.locationId
  const scoped = <T extends { locationId: LocationId }>(rows: T[]) =>
    loc === null ? rows : rows.filter((r) => r.locationId === loc)

  const holds = scoped(d.holds).filter((h) => h.status === 'pending').length
  const contracts = scoped(d.contracts).filter(
    (c) => c.status === 'pending_approval',
  ).length
  const interments = scoped(d.interments).filter((i) => i.status === 'requested').length
  const payoutRuns = d.payoutRuns.filter((r) => r.status === 'pending_approval').length
  const severely = receivablesBreakdown(loc).buckets.severely_overdue.count

  const all: AttentionRow[] = [
    {
      key: 'hold',
      count: holds,
      label: holds === 1 ? 'hold awaiting approval' : 'holds awaiting approval',
      href: '/approvals?kind=hold',
      tone: 'warning',
    },
    {
      key: 'contract',
      count: contracts,
      label: contracts === 1 ? 'contract to approve' : 'contracts to approve',
      href: '/approvals?kind=contract',
      tone: 'warning',
    },
    {
      key: 'interment',
      count: interments,
      label: interments === 1 ? 'interment to confirm' : 'interments to confirm',
      href: '/approvals?kind=interment',
      tone: 'neutral',
    },
    {
      key: 'payout_run',
      count: payoutRuns,
      label: payoutRuns === 1 ? 'payout run to approve' : 'payout runs to approve',
      href: '/approvals?kind=payout_run',
      tone: 'warning',
    },
    {
      key: 'overdue',
      count: severely,
      label: severely === 1 ? 'account 90+ days overdue' : 'accounts 90+ days overdue',
      href: '/sales/receivables?health=severely_overdue',
      tone: 'danger',
    },
  ]

  const rows = all.filter((r) => r.count > 0)
  return { rows, total: rows.reduce((s, r) => s + r.count, 0) }
})

/**
 * The number on the hidden rail's dot. Overdue receivables plus pending
 * approvals — without it, hidden means forgotten.
 */
export const selectAttentionCount = memoise<number>((k) => {
  const rec = receivablesBreakdown(k.locationId)
  const overdue = rec.buckets.overdue.count + rec.buckets.severely_overdue.count
  const pending = dataset().approvals.filter(
    (a) =>
      a.status === 'pending' &&
      (k.locationId === null || a.locationId === k.locationId),
  ).length
  return overdue + pending
})

// ── 9 · commission payout ────────────────────────────────────────────
export interface PayoutData {
  periodStart: ISODate
  periodEnd: ISODate
  releaseDate: ISODate
  daysToRelease: number
  openRun: PayoutRun | null
  awaitingApproval: PayoutRun | null
  accruedCentavos: Centavos
  entryCount: number
  scopedToAgent: boolean
}

export const selectPayout = memoise<PayoutData>((k) => {
  const d = dataset()
  const window = periodFor(TODAY)

  const openRun =
    d.payoutRuns.find((r) => r.status === 'open' && r.periodStart === window.start) ??
    d.payoutRuns.find((r) => r.status === 'open') ??
    null
  const awaiting = d.payoutRuns.find((r) => r.status === 'pending_approval') ?? null

  if (k.agentId) {
    const own = agentEarnings(k.agentId, window.start, window.end)
    return {
      periodStart: window.start,
      periodEnd: window.end,
      releaseDate: window.release,
      daysToRelease: diffDays(window.release, TODAY),
      openRun,
      awaitingApproval: awaiting,
      accruedCentavos: own.accrued + own.inRun,
      entryCount: (indexes().commissionsByAgent.get(k.agentId as unknown as string) ?? [])
        .filter((e) => {
          const day = e.earnedAt.slice(0, 10)
          return day >= window.start && day <= window.end
        }).length,
      scopedToAgent: true,
    }
  }

  const entries = d.commissions.filter((e) => {
    const day = e.earnedAt.slice(0, 10)
    if (day < window.start || day > window.end) return false
    if (k.locationId !== null && e.locationId !== k.locationId) return false
    return e.status === 'accrued' || e.status === 'in_run'
  })

  return {
    periodStart: window.start,
    periodEnd: window.end,
    releaseDate: window.release,
    daysToRelease: diffDays(window.release, TODAY),
    openRun,
    awaitingApproval: awaiting,
    accruedCentavos: entries.reduce((s, e) => s + e.amountCentavos, 0),
    entryCount: entries.length,
    scopedToAgent: false,
  }
})

// ── shared: the viewer's own collected value, for the agent header ───
export const selectAgentSummary = memoise<{
  collectedCentavos: Centavos
  contracts: number
} | null>((k) => {
  if (!k.agentId) return null
  const window = periodWindow(k.period)
  const c = agentCollected(k.agentId, window.from, window.to)
  return { collectedCentavos: c.centavos, contracts: c.contracts }
})

/** Outstanding balance on one contract — used by the receivables drill-down. */
export const outstandingOf = (contractId: string): Centavos => {
  const c = indexes().contractsById.get(contractId as never)
  return c ? balanceOf(c).outstandingCentavos : 0
}
