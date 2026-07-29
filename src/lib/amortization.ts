import type { Centavos, Installment, ISODate } from '@/domain'
import { addMonths, diffDays } from './dates'

export type ScheduleDraft = Pick<
  Installment,
  'installmentNo' | 'dueDate' | 'amountDueCentavos' | 'amountPaidCentavos' | 'status'
>

/**
 * Even division with the remainder on installment 1 — one line, always ties
 * out, and it is how a real ledger handles it.
 *
 * No downpayment and no interest: both are undefined by the client. See
 * ASSUMPTIONS.downpayment / ASSUMPTIONS.interest.
 */
export function buildSchedule(opts: {
  contractPriceCentavos: Centavos
  termMonths: number
  signedAt: ISODate
}): ScheduleDraft[] {
  const { contractPriceCentavos: price, termMonths: term, signedAt } = opts
  const base = Math.floor(price / term)
  const remainder = price - base * term

  return Array.from({ length: term }, (_, i) => {
    const n = i + 1
    return {
      installmentNo: n,
      dueDate: addMonths(signedAt, n),
      amountDueCentavos: n === 1 ? base + remainder : base,
      amountPaidCentavos: 0,
      status: 'upcoming' as const,
    }
  })
}

/** Applies a payment oldest-unpaid-first, splitting across installments. */
export function applyPayment(
  schedule: Installment[],
  amount: Centavos,
  asOf: ISODate,
): { appliedNos: number[]; overpayment: Centavos } {
  let remaining = amount
  const appliedNos: number[] = []

  const ordered = [...schedule].sort((a, b) => a.installmentNo - b.installmentNo)
  for (const inst of ordered) {
    if (remaining <= 0) break
    const owed = inst.amountDueCentavos - inst.amountPaidCentavos
    if (owed <= 0) continue
    const pay = Math.min(owed, remaining)
    inst.amountPaidCentavos += pay
    remaining -= pay
    appliedNos.push(inst.installmentNo)
    inst.status =
      inst.amountPaidCentavos >= inst.amountDueCentavos
        ? 'paid'
        : inst.dueDate < asOf
          ? 'overdue'
          : 'partial'
  }

  return { appliedNos, overpayment: Math.max(0, remaining) }
}

/** Recompute statuses against a reference date. */
export function refreshScheduleStatuses(schedule: Installment[], asOf: ISODate) {
  for (const inst of schedule) {
    if (inst.amountPaidCentavos >= inst.amountDueCentavos) {
      inst.status = 'paid'
    } else if (inst.dueDate < asOf) {
      inst.status = 'overdue'
    } else if (inst.amountPaidCentavos > 0) {
      inst.status = 'partial'
    } else if (diffDays(inst.dueDate, asOf) <= 7) {
      inst.status = 'due'
    } else {
      inst.status = 'upcoming'
    }
  }
}

export const nextDue = (schedule: Installment[]): Installment | null =>
  schedule
    .filter((i) => i.amountPaidCentavos < i.amountDueCentavos)
    .sort((a, b) => a.installmentNo - b.installmentNo)[0] ?? null

export const overdueInstallments = (
  schedule: Installment[],
  asOf: ISODate,
): Installment[] =>
  schedule.filter(
    (i) => i.amountPaidCentavos < i.amountDueCentavos && i.dueDate < asOf,
  )
