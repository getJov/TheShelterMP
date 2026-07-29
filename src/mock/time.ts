import type { ISODate, ISODateTime } from '@/domain'

/**
 * The mockup's "today". Frozen so charts, overdue states and countdowns are
 * stable — the demo must look identical on the client's machine next month.
 *
 * NOTHING outside this file may read the system clock.
 */
export const TODAY: ISODate = '2026-07-29'
export const NOW: ISODateTime = '2026-07-29T09:00:00+08:00'

/** Licensed to sell — start of the generated trading history. */
export const HISTORY_START: ISODate = '2024-08-01'
/** Client-stated fact: the park's first interment. */
export const FIRST_INTERMENT: ISODate = '2026-05-13'

/** Build an ISO timestamp at a plausible working hour on a given date. */
export function atHour(date: ISODate, hour: number, minute = 0): ISODateTime {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${date}T${hh}:${mm}:00+08:00`
}
