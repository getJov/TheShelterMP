import {
  addDays as fnsAddDays,
  addMonths as fnsAddMonths,
  differenceInCalendarDays,
  format,
  lastDayOfMonth,
  parseISO,
} from 'date-fns'
import type { ISODate, ISODateTime } from '@/domain'

/**
 * Everything in the model is an ISO string. These helpers take and return
 * strings so no Date object ever escapes into state.
 */
export const toDate = (iso: ISODate | ISODateTime): Date => parseISO(iso)
export const toISODate = (d: Date): ISODate => format(d, 'yyyy-MM-dd')

export const addDays = (iso: ISODate, n: number): ISODate =>
  toISODate(fnsAddDays(parseISO(iso), n))

/** Clamps day 29–31 to the month's last day. */
export const addMonths = (iso: ISODate, n: number): ISODate => {
  const base = parseISO(iso)
  const target = fnsAddMonths(base, n)
  const last = lastDayOfMonth(target)
  return toISODate(target > last ? last : target)
}

export const diffDays = (a: ISODate, b: ISODate): number =>
  differenceInCalendarDays(parseISO(a), parseISO(b))

export const isBefore = (a: ISODate, b: ISODate): boolean => a < b
export const isAfter = (a: ISODate, b: ISODate): boolean => a > b

/** 0 = Sunday … 6 = Saturday */
export const dowOf = (iso: ISODate): number => parseISO(iso).getDay()

// ── display ──────────────────────────────────────────────────────────
/** '29 Jul 2026' — the app-wide date format. */
export const fmtDate = (iso: ISODate | ISODateTime | null | undefined): string =>
  iso ? format(parseISO(iso), 'dd MMM yyyy') : '—'

/** '29 Jul' */
export const fmtDateShort = (iso: ISODate | ISODateTime): string =>
  format(parseISO(iso), 'dd MMM')

/** 'Wed 29 Jul 2026' */
export const fmtDateLong = (iso: ISODate | ISODateTime): string =>
  format(parseISO(iso), 'EEE dd MMM yyyy')

/** '29 Jul 2026, 9:00 AM' */
export const fmtDateTime = (iso: ISODateTime): string =>
  format(parseISO(iso), 'dd MMM yyyy, h:mm a')

export const fmtMonth = (iso: ISODate): string =>
  format(parseISO(iso), 'MMMM yyyy')

/** Relative time — used only in notifications and the audit log. */
export function fmtRelative(iso: ISODateTime, now: ISODateTime): string {
  const mins = Math.round(
    (parseISO(now).getTime() - parseISO(iso).getTime()) / 60000,
  )
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return fmtDate(iso)
}
