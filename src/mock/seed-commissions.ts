import {
  ASSUMPTIONS,
  asId,
  type CommissionEntry,
  type CommissionLevel,
  type CommissionRule,
  type Contract,
  type Payment,
  type PayoutRun,
  type UserId,
} from '@/domain'
import { addDays } from '@/lib/dates'
import { periodFor } from '@/lib/commission'
import { atHour, TODAY } from './time'

export interface CommissionSeed {
  commissionRules: CommissionRule[]
  commissions: CommissionEntry[]
  payoutRuns: PayoutRun[]
}

export function seedCommissionRules(): CommissionRule[] {
  const labels = ASSUMPTIONS.commissionLevelNames.value
  const rates = ASSUMPTIONS.commissionRates.value
  return (['associate', 'team_leader', 'distributor'] as CommissionLevel[]).map(
    (level, i) => ({
      id: `crl_${level}`,
      level,
      label: labels[level],
      ratePercent: rates[level],
      effectiveFrom: '2024-08-01',
      effectiveTo: null,
      active: true,
      createdAt: '2024-08-01T09:00:00+08:00',
      updatedAt: '2024-08-01T09:00:00+08:00',
      _order: i,
    }),
  ) as CommissionRule[]
}

/**
 * Commission is EARNED ON COLLECTION. Walk every posted payment and emit one
 * entry per level present on the contract's snapshotted upline. The basis is
 * the full payment — the 20% trust fund is additive and is NOT deducted.
 */
export function seedCommissions(
  payments: Payment[],
  contracts: Contract[],
  rules: CommissionRule[],
  approverId: UserId,
): CommissionSeed {
  const contractById = new Map(contracts.map((c) => [c.id, c]))
  const rateOf = (level: CommissionLevel) =>
    rules.find((r) => r.level === level)?.ratePercent ?? 0

  const entries: CommissionEntry[] = []
  let seq = 0

  const posted = payments
    .filter((p) => p.status === 'posted')
    .sort((a, b) => (a.postedAt < b.postedAt ? -1 : 1))

  for (const p of posted) {
    const c = contractById.get(p.contractId)
    if (!c) continue

    const levels: { agentId: CommissionEntry['agentId']; level: CommissionLevel }[] = [
      { agentId: c.agentId, level: 'associate' },
    ]
    if (c.teamLeaderId) levels.push({ agentId: c.teamLeaderId, level: 'team_leader' })
    if (c.distributorId) levels.push({ agentId: c.distributorId, level: 'distributor' })

    for (const l of levels) {
      const rate = rateOf(l.level)
      entries.push({
        id: asId<'Commission'>(`cme_${String(++seq).padStart(6, '0')}`),
        paymentId: p.id,
        contractId: c.id,
        locationId: c.locationId,
        agentId: l.agentId,
        level: l.level,
        ratePercent: rate,
        basisCentavos: p.amountCentavos,
        amountCentavos: Math.round((p.amountCentavos * rate) / 100),
        status: 'accrued',
        payoutRunId: null,
        earnedAt: p.postedAt,
        createdAt: p.postedAt,
        updatedAt: p.postedAt,
      })
    }
  }

  // ── payout runs: Saturday → Thursday, released Friday ────────────
  const runs: PayoutRun[] = []
  const byRun = new Map<string, CommissionEntry[]>()

  for (const e of entries) {
    const key = periodStartFor(e.earnedAt.slice(0, 10))
    const arr = byRun.get(key) ?? []
    arr.push(e)
    byRun.set(key, arr)
  }

  const currentPeriod = periodStartFor(TODAY)
  const sortedKeys = [...byRun.keys()].sort()
  let runSeq = 0

  for (const periodStart of sortedKeys) {
    const list = byRun.get(periodStart)!
    const periodEnd = addDays(periodStart, 5) // Sat → Thu
    const releaseDate = addDays(periodStart, 6) // Friday
    const id = asId<'PayoutRun'>(`run_${String(++runSeq).padStart(4, '0')}`)

    const weeksAgo = Math.floor(
      (new Date(TODAY).getTime() - new Date(periodStart).getTime()) /
        (7 * 86400000),
    )

    let status: PayoutRun['status']
    let entryStatus: CommissionEntry['status']
    if (periodStart === currentPeriod) {
      status = 'open'
      entryStatus = 'accrued'
    } else if (weeksAgo === 1) {
      status = 'pending_approval'
      entryStatus = 'in_run'
    } else if (weeksAgo === 2) {
      status = 'approved'
      entryStatus = 'approved'
    } else {
      status = 'released'
      entryStatus = 'released'
    }

    for (const e of list) {
      e.status = entryStatus
      e.payoutRunId = id
    }

    runs.push({
      id,
      locationId: null,
      periodStart,
      periodEnd,
      releaseDate,
      status,
      entryCount: list.length,
      totalCentavos: list.reduce((s, x) => s + x.amountCentavos, 0),
      approvedByUserId: status === 'approved' || status === 'released' ? approverId : null,
      approvedAt:
        status === 'approved' || status === 'released'
          ? atHour(releaseDate, 8)
          : null,
      releasedAt: status === 'released' ? atHour(releaseDate, 15) : null,
      createdAt: atHour(periodStart, 8),
      updatedAt: atHour(releaseDate, 15),
    })
  }

  // ── cancellation handling ────────────────────────────────────────
  // Unreleased → voided. Already released → clawback_pending.
  const cancelled = new Set(
    contracts.filter((c) => c.status === 'cancelled').map((c) => c.id),
  )
  for (const e of entries) {
    if (!cancelled.has(e.contractId)) continue
    e.status = e.status === 'released' ? 'clawback_pending' : 'voided'
  }

  return { commissionRules: rules, commissions: entries, payoutRuns: runs.reverse() }
}

/**
 * The Saturday that opens the payout window containing `date`.
 * Delegates to lib/commission so the seed and the live engine can never
 * disagree about which run a payment belongs to.
 */
export function periodStartFor(date: string): string {
  return periodFor(date).start
}
