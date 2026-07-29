import { create } from 'zustand'
import type { ISODate } from '@/domain'
import { TODAY } from '@/mock'
import { addDays, diffDays, fmtDate, fmtDateShort } from '@/lib/dates'
import { monthBounds, prevMonthBounds } from '@/lib/finance'
import { periodFor } from '@/lib/commission'

export type PeriodKind = 'week' | 'month' | 'quarter' | 'year' | 'custom'

export const PERIOD_OPTIONS: { id: PeriodKind; label: string }[] = [
  { id: 'week', label: 'This payout week' },
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'year', label: 'This year' },
  { id: 'custom', label: 'Custom range' },
]

export interface ResolvedPeriod {
  kind: PeriodKind
  from: ISODate
  to: ISODate
  label: string
  /** The comparable window immediately before, for rank movement. */
  prev: { from: ISODate; to: ISODate; label: string }
}

const monthName = (iso: ISODate) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  })

function quarterBounds(asOf: ISODate, shift = 0): [ISODate, ISODate, string] {
  const [y, m] = asOf.split('-').map(Number)
  let q = Math.floor((m! - 1) / 3) + shift
  let year = y!
  while (q < 0) {
    q += 4
    year -= 1
  }
  while (q > 3) {
    q -= 4
    year += 1
  }
  const startMonth = q * 3 + 1
  const endMonth = startMonth + 2
  const last = new Date(year, endMonth, 0).getDate()
  return [
    `${year}-${String(startMonth).padStart(2, '0')}-01`,
    `${year}-${String(endMonth).padStart(2, '0')}-${last}`,
    `Q${q + 1} ${year}`,
  ]
}

export function resolvePeriod(
  kind: PeriodKind,
  customFrom: ISODate,
  customTo: ISODate,
  asOf: ISODate = TODAY,
): ResolvedPeriod {
  switch (kind) {
    case 'week': {
      const p = periodFor(asOf)
      const prev = periodFor(addDays(p.start, -2))
      return {
        kind,
        from: p.start,
        to: p.end,
        label: `${fmtDateShort(p.start)} → ${fmtDateShort(p.end)}`,
        prev: {
          from: prev.start,
          to: prev.end,
          label: `${fmtDateShort(prev.start)} → ${fmtDateShort(prev.end)}`,
        },
      }
    }
    case 'quarter': {
      const [from, to, label] = quarterBounds(asOf, 0)
      const [pf, pt, pl] = quarterBounds(asOf, -1)
      return { kind, from, to, label, prev: { from: pf, to: pt, label: pl } }
    }
    case 'year': {
      const y = Number(asOf.slice(0, 4))
      return {
        kind,
        from: `${y}-01-01`,
        to: `${y}-12-31`,
        label: String(y),
        prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) },
      }
    }
    case 'custom': {
      const span = Math.max(0, diffDays(customTo, customFrom))
      const pf = addDays(customFrom, -(span + 1))
      const pt = addDays(customFrom, -1)
      return {
        kind,
        from: customFrom,
        to: customTo,
        label: `${fmtDate(customFrom)} → ${fmtDate(customTo)}`,
        prev: {
          from: pf,
          to: pt,
          label: `${fmtDateShort(pf)} → ${fmtDateShort(pt)}`,
        },
      }
    }
    case 'month':
    default: {
      const [from, to] = monthBounds(asOf)
      const [pf, pt] = prevMonthBounds(asOf)
      return {
        kind: 'month',
        from,
        to,
        label: monthName(from),
        prev: { from: pf, to: pt, label: monthName(pf) },
      }
    }
  }
}

interface PeriodStore {
  kind: PeriodKind
  customFrom: ISODate
  customTo: ISODate
  setKind: (k: PeriodKind) => void
  setCustom: (from: ISODate, to: ISODate) => void
  resolved: () => ResolvedPeriod
}

/** Shared by all four tabs, the agent detail and My Earnings. */
export const usePeriodStore = create<PeriodStore>((set, get) => ({
  kind: 'month',
  customFrom: addDays(TODAY, -30),
  customTo: TODAY,
  setKind: (kind) => set({ kind }),
  setCustom: (customFrom, customTo) => set({ customFrom, customTo, kind: 'custom' }),
  resolved: () => resolvePeriod(get().kind, get().customFrom, get().customTo),
}))

export function usePeriod(): ResolvedPeriod {
  const kind = usePeriodStore((s) => s.kind)
  const from = usePeriodStore((s) => s.customFrom)
  const to = usePeriodStore((s) => s.customTo)
  return resolvePeriod(kind, from, to)
}
