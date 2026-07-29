import {
  asId,
  PAYOUT_PERIOD,
  type AgentId,
  type CommissionEntry,
  type CommissionLevel,
  type CommissionRule,
  type Contract,
  type ISODate,
  type Payment,
} from '@/domain'
import { addDays, dowOf } from './dates'

let seq = 500000

/** Effective-dated rate lookup — a rate change must not restate history. */
export function ruleFor(
  rules: CommissionRule[],
  level: CommissionLevel,
  asOf: ISODate,
): CommissionRule | null {
  const candidates = rules.filter(
    (r) =>
      r.level === level &&
      r.effectiveFrom <= asOf &&
      (r.effectiveTo === null || asOf < r.effectiveTo),
  )
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (b.effectiveFrom > a.effectiveFrom ? b : a))
}

/**
 * Called by the sales store immediately after a payment is posted.
 * Pure — returns entries, does not write.
 *
 * Commission is earned ON COLLECTION, never at signing. The basis is the
 * FULL payment: the 20% trust-fund accrual is additive and is NOT deducted.
 */
export function accrueCommission(
  payment: Payment,
  contract: Contract,
  rules: CommissionRule[],
): CommissionEntry[] {
  const levels: { agentId: AgentId; level: CommissionLevel }[] = [
    { agentId: contract.agentId, level: 'associate' },
  ]
  if (contract.teamLeaderId)
    levels.push({ agentId: contract.teamLeaderId, level: 'team_leader' })
  if (contract.distributorId)
    levels.push({ agentId: contract.distributorId, level: 'distributor' })

  return levels.map((l) => {
    const rate = ruleFor(rules, l.level, payment.paidAt)?.ratePercent ?? 0
    return {
      id: asId<'Commission'>(`cme_${++seq}`),
      paymentId: payment.id,
      contractId: contract.id,
      locationId: contract.locationId,
      agentId: l.agentId,
      level: l.level,
      ratePercent: rate,
      basisCentavos: payment.amountCentavos,
      amountCentavos: Math.round((payment.amountCentavos * rate) / 100),
      status: 'accrued',
      payoutRunId: null,
      earnedAt: payment.postedAt,
      createdAt: payment.postedAt,
      updatedAt: payment.postedAt,
    }
  })
}

export interface PayoutPeriod {
  /** A Saturday. */
  start: ISODate
  /** The following Thursday. */
  end: ISODate
  /** The following Friday. */
  release: ISODate
}

/**
 * The window containing `date`: Saturday → Thursday, released Friday.
 *
 * Sunday is excluded from the earning window per the client's handwritten
 * note, so a Sunday payment accrues into the FOLLOWING window.
 */
/**
 * Offset from a given day-of-week back (or forward) to the Saturday that
 * opens its window.
 *
 *   Sat 6 →  0   the window opens today
 *   Sun 0 → −1   the office is closed, but the day sits inside Sat→Thu
 *   Mon 1 → −2
 *   Tue 2 → −3
 *   Wed 3 → −4
 *   Thu 4 → −5   the cutoff day, still inside the window
 *   Fri 5 → +1   past Thursday's cutoff — this is release day, so a payment
 *                taken on a Friday belongs to the window opening tomorrow
 */
const SATURDAY_OFFSET: Record<number, number> = {
  0: -1,
  1: -2,
  2: -3,
  3: -4,
  4: -5,
  5: 1,
  6: 0,
}

export function periodFor(date: ISODate): PayoutPeriod {
  const start = addDays(date, SATURDAY_OFFSET[dowOf(date)] ?? 0)
  return { start, end: addDays(start, 5), release: addDays(start, 6) }
}

/** Split entries into their payout windows. */
export function groupByPeriod(
  entries: CommissionEntry[],
): Map<ISODate, CommissionEntry[]> {
  const m = new Map<ISODate, CommissionEntry[]>()
  for (const e of entries) {
    const key = periodFor(e.earnedAt.slice(0, 10)).start
    const arr = m.get(key)
    if (arr) arr.push(e)
    else m.set(key, [e])
  }
  return m
}

/**
 * Cancellation handling, per ASSUMPTIONS.cancellationClawback:
 * unreleased commission is voided; released commission is flagged
 * clawback_pending with no automatic recovery.
 */
export function voidCommissionFor(entries: CommissionEntry[]): {
  voided: CommissionEntry[]
  clawbackPending: CommissionEntry[]
} {
  const voided: CommissionEntry[] = []
  const clawbackPending: CommissionEntry[] = []
  for (const e of entries) {
    if (e.status === 'released') {
      e.status = 'clawback_pending'
      clawbackPending.push(e)
    } else if (e.status !== 'voided' && e.status !== 'clawback_pending') {
      e.status = 'voided'
      voided.push(e)
    }
  }
  return { voided, clawbackPending }
}

/** Preview the split for a hypothetical amount — used by the contract builder. */
export function splitPreview(
  amountCentavos: number,
  contract: Pick<Contract, 'agentId' | 'teamLeaderId' | 'distributorId'>,
  rules: CommissionRule[],
  asOf: ISODate,
): { level: CommissionLevel; agentId: AgentId; ratePercent: number; amountCentavos: number }[] {
  const out: {
    level: CommissionLevel
    agentId: AgentId
    ratePercent: number
    amountCentavos: number
  }[] = []
  const push = (agentId: AgentId | null, level: CommissionLevel) => {
    if (!agentId) return
    const rate = ruleFor(rules, level, asOf)?.ratePercent ?? 0
    out.push({
      level,
      agentId,
      ratePercent: rate,
      amountCentavos: Math.round((amountCentavos * rate) / 100),
    })
  }
  push(contract.agentId, 'associate')
  push(contract.teamLeaderId, 'team_leader')
  push(contract.distributorId, 'distributor')
  return out
}
