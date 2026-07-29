import type {
  AgentId,
  Centavos,
  Contract,
  ContractId,
  Installment,
  ISODate,
  LocationId,
  Lot,
  Payment,
  PaymentHealth,
} from '@/domain'
import { indexes, dataset } from '@/stores/dataset'
import { TODAY } from '@/mock'
import { diffDays } from './dates'
import { nextDue, overdueInstallments } from './amortization'

/**
 * THE single source of truth for every money figure on screen.
 *
 * The map's payment-health colouring, the dashboard's receivables card, the
 * sales table and the lot drawer all import from here. Two implementations
 * of "amount outstanding" would diverge, and the client would find it.
 */

// ── balances ─────────────────────────────────────────────────────────
export interface Balance {
  totalCentavos: Centavos
  paidCentavos: Centavos
  outstandingCentavos: Centavos
  paidRatio: number
  installmentsPaid: number
  installmentsTotal: number
}

export function postedPaymentsOf(contractId: ContractId): Payment[] {
  return (indexes().paymentsByContract.get(contractId) ?? []).filter(
    (p) => p.status === 'posted',
  )
}

export function scheduleOf(contractId: ContractId): Installment[] {
  return [...(indexes().installmentsByContract.get(contractId) ?? [])].sort(
    (a, b) => a.installmentNo - b.installmentNo,
  )
}

export function balanceOf(contract: Contract): Balance {
  const paid = postedPaymentsOf(contract.id).reduce(
    (s, p) => s + p.amountCentavos,
    0,
  )
  const sched = scheduleOf(contract.id)
  const total = contract.contractPriceCentavos
  return {
    totalCentavos: total,
    paidCentavos: paid,
    outstandingCentavos: Math.max(0, total - paid),
    paidRatio: total > 0 ? Math.min(1, paid / total) : 0,
    installmentsPaid: sched.filter((i) => i.status === 'paid').length,
    installmentsTotal: sched.length,
  }
}

// ── payment health ───────────────────────────────────────────────────
/**
 * Thresholds, fixed here so nothing else may redefine them:
 *   fully paid → paid_in_full
 *   no overdue and next due > 7 days → current
 *   next due within 7 days → due_soon
 *   1–89 days past an unpaid due date → overdue
 *   90+ → severely_overdue
 */
export function paymentHealth(
  contract: Contract,
  asOf: ISODate = TODAY,
): PaymentHealth {
  if (contract.status === 'cancelled' || contract.status === 'pending_approval')
    return 'not_applicable'

  const bal = balanceOf(contract)
  if (bal.outstandingCentavos <= 0) return 'paid_in_full'
  if (contract.paymentMode === 'spot_cash') {
    // Unpaid spot cash is overdue the moment it is past the signing date.
    const days = diffDays(asOf, contract.signedAt)
    if (days >= 90) return 'severely_overdue'
    if (days >= 1) return 'overdue'
    return 'due_soon'
  }

  const sched = scheduleOf(contract.id)
  const overdue = overdueInstallments(sched, asOf)
  if (overdue.length > 0) {
    const oldest = overdue.reduce((a, b) => (a.dueDate < b.dueDate ? a : b))
    return diffDays(asOf, oldest.dueDate) >= 90 ? 'severely_overdue' : 'overdue'
  }

  const next = nextDue(sched)
  if (!next) return 'paid_in_full'
  return diffDays(next.dueDate, asOf) <= 7 ? 'due_soon' : 'current'
}

export function healthOfLot(lot: Lot, asOf: ISODate = TODAY): PaymentHealth {
  if (!lot.currentContractId) return 'not_applicable'
  const c = indexes().contractsById.get(lot.currentContractId)
  return c ? paymentHealth(c, asOf) : 'not_applicable'
}

export function contractForLot(lot: Lot): Contract | null {
  return lot.currentContractId
    ? (indexes().contractsById.get(lot.currentContractId) ?? null)
    : null
}

// ── aggregates ───────────────────────────────────────────────────────
const inScope = (locationId: LocationId | null) => (row: { locationId: LocationId }) =>
  locationId === null || row.locationId === locationId

export function collectionsBetween(
  from: ISODate,
  to: ISODate,
  locationId: LocationId | null = null,
): { totalCentavos: Centavos; count: number } {
  const d = dataset()
  const contractLoc = indexes().contractsById
  let total = 0
  let count = 0
  for (const p of d.payments) {
    if (p.status !== 'posted') continue
    if (p.paidAt < from || p.paidAt > to) continue
    const c = contractLoc.get(p.contractId)
    if (!c || !inScope(locationId)(c)) continue
    total += p.amountCentavos
    count++
  }
  return { totalCentavos: total, count }
}

export interface ReceivablesBreakdown {
  totalCentavos: Centavos
  buckets: Record<
    Exclude<PaymentHealth, 'not_applicable' | 'paid_in_full'>,
    { count: number; centavos: Centavos }
  >
  contracts: Contract[]
}

export function receivablesBreakdown(
  locationId: LocationId | null = null,
  asOf: ISODate = TODAY,
): ReceivablesBreakdown {
  const buckets = {
    current: { count: 0, centavos: 0 },
    due_soon: { count: 0, centavos: 0 },
    overdue: { count: 0, centavos: 0 },
    severely_overdue: { count: 0, centavos: 0 },
  }
  let total = 0
  const contracts: Contract[] = []

  for (const c of dataset().contracts) {
    if (c.status !== 'active') continue
    if (!inScope(locationId)(c)) continue
    const bal = balanceOf(c)
    if (bal.outstandingCentavos <= 0) continue
    const h = paymentHealth(c, asOf)
    if (h === 'not_applicable' || h === 'paid_in_full') continue
    buckets[h].count += 1
    buckets[h].centavos += bal.outstandingCentavos
    total += bal.outstandingCentavos
    contracts.push(c)
  }

  return { totalCentavos: total, buckets, contracts }
}

export function trustFundBalance(
  locationId: LocationId | null = null,
  asOf: ISODate = TODAY,
): Centavos {
  return dataset()
    .trustFund.filter(
      (e) => inScope(locationId)(e) && e.postedAt.slice(0, 10) <= asOf,
    )
    .reduce((s, e) => s + e.amountCentavos, 0)
}

export function trustFundBetween(
  from: ISODate,
  to: ISODate,
  locationId: LocationId | null = null,
): Centavos {
  return dataset()
    .trustFund.filter((e) => {
      const d = e.postedAt.slice(0, 10)
      return inScope(locationId)(e) && d >= from && d <= to
    })
    .reduce((s, e) => s + e.amountCentavos, 0)
}

// ── inventory ────────────────────────────────────────────────────────
export function inventorySummary(locationId: LocationId | null = null) {
  const lots = dataset().lots.filter(inScope(locationId))
  const byStatus = { available: 0, held: 0, sold: 0, occupied: 0, not_for_sale: 0 }
  const byTier = new Map<string, { total: number; available: number }>()

  for (const l of lots) {
    byStatus[l.status] += 1
    const t = byTier.get(l.tierId) ?? { total: 0, available: 0 }
    t.total += 1
    if (l.status === 'available') t.available += 1
    byTier.set(l.tierId, t)
  }

  return { total: lots.length, byStatus, byTier }
}

// ── agent aggregates ─────────────────────────────────────────────────
export function agentEarnings(
  agentId: AgentId,
  from?: ISODate,
  to?: ISODate,
): {
  accrued: Centavos
  inRun: Centavos
  approved: Centavos
  released: Centavos
  total: Centavos
} {
  const rows = (indexes().commissionsByAgent.get(agentId) ?? []).filter((e) => {
    const d = e.earnedAt.slice(0, 10)
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  })

  const sum = (s: string) =>
    rows.filter((r) => r.status === s).reduce((a, b) => a + b.amountCentavos, 0)

  const accrued = sum('accrued')
  const inRun = sum('in_run')
  const approved = sum('approved')
  const released = sum('released')

  return { accrued, inRun, approved, released, total: accrued + inRun + approved + released }
}

/** Value COLLECTED against an agent's contracts in a window. */
export function agentCollected(
  agentId: AgentId,
  from?: ISODate,
  to?: ISODate,
): { centavos: Centavos; contracts: number } {
  const idx = indexes()
  const contracts = (idx.contractsByAgent.get(agentId) ?? []).filter(
    (c) => c.status !== 'cancelled',
  )
  let centavos = 0
  let n = 0
  for (const c of contracts) {
    const ps = postedPaymentsOf(c.id).filter((p) => {
      if (from && p.paidAt < from) return false
      if (to && p.paidAt > to) return false
      return true
    })
    if (ps.length > 0) n++
    centavos += ps.reduce((s, p) => s + p.amountCentavos, 0)
  }
  return { centavos, contracts: n }
}

export interface LeaderboardRow {
  agentId: AgentId
  collectedCentavos: Centavos
  commissionCentavos: Centavos
  contractCount: number
  targetCentavos: Centavos | null
  targetRatio: number | null
  rank: number
}

export function leaderboard(
  from: ISODate,
  to: ISODate,
  locationId: LocationId | null = null,
  rankBy: 'collected' | 'contracts' | 'commission' = 'collected',
): LeaderboardRow[] {
  const rows = dataset()
    .agents.filter((a) => locationId === null || a.locationId === locationId)
    .map((a) => {
      const col = agentCollected(a.id, from, to)
      const earn = agentEarnings(a.id, from, to)
      return {
        agentId: a.id,
        collectedCentavos: col.centavos,
        commissionCentavos: earn.total,
        contractCount: col.contracts,
        targetCentavos: a.monthlyTargetCentavos,
        targetRatio: a.monthlyTargetCentavos
          ? col.centavos / a.monthlyTargetCentavos
          : null,
        rank: 0,
      }
    })

  const key =
    rankBy === 'contracts'
      ? (r: LeaderboardRow) => r.contractCount
      : rankBy === 'commission'
        ? (r: LeaderboardRow) => r.commissionCentavos
        : (r: LeaderboardRow) => r.collectedCentavos

  rows.sort((a, b) => key(b) - key(a))
  rows.forEach((r, i) => (r.rank = i + 1))
  return rows
}

// ── period helpers ───────────────────────────────────────────────────
export function monthBounds(asOf: ISODate = TODAY): [ISODate, ISODate] {
  const [y, m] = asOf.split('-')
  const last = new Date(Number(y), Number(m), 0).getDate()
  return [`${y}-${m}-01`, `${y}-${m}-${String(last).padStart(2, '0')}`]
}

export function prevMonthBounds(asOf: ISODate = TODAY): [ISODate, ISODate] {
  const [y, m] = asOf.split('-').map(Number)
  const py = m === 1 ? y! - 1 : y!
  const pm = m === 1 ? 12 : m! - 1
  const last = new Date(py, pm, 0).getDate()
  const mm = String(pm).padStart(2, '0')
  return [`${py}-${mm}-01`, `${py}-${mm}-${String(last).padStart(2, '0')}`]
}

/** Trailing n months as [from, to, label] for sparklines. */
export function trailingMonths(
  n: number,
  asOf: ISODate = TODAY,
): { from: ISODate; to: ISODate; label: string }[] {
  const out: { from: ISODate; to: ISODate; label: string }[] = []
  const [y, m] = asOf.split('-').map(Number)
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y!, m! - 1 - i, 1)
    const yy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const last = new Date(yy, d.getMonth() + 1, 0).getDate()
    out.push({
      from: `${yy}-${mm}-01`,
      to: `${yy}-${mm}-${String(last).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-PH', { month: 'short' }),
    })
  }
  return out
}
