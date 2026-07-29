import { createPortal } from 'react-dom'
import {
  deceasedFullName,
  GROUNDS_CHECKLIST,
  INTERMENT_TYPE_LABEL,
  PARK_FACTS,
  SLOT_LABEL,
  type BurialSlot,
  type ISODate,
  type LocationId,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui-brand/Icon'
import { IconClose, IconPrint, IconSignature } from '@/components/ui-brand/icons'
import { fmtDate, fmtDateLong } from '@/lib/dates'
import { indexes } from '@/stores/dataset'
import { jobsForDate } from '@/stores/burials'
import { LotThumb } from './LotThumb'
import { lotCodeFor, ownerName } from './helpers'

/**
 * What actually goes out to the crew. One page per day, both slots whether
 * booked or not, lot codes with block diagrams, the checklist and a place to
 * sign it off.
 *
 * The print rules are injected here rather than living in the global sheet,
 * so nothing outside this component has to know the day sheet exists.
 */
const PRINT_CSS = `
@media print {
  body > *:not([data-day-sheet-root]) { display: none !important; }
  [data-day-sheet-root] { position: static !important; overflow: visible !important; }
  [data-day-sheet-page] { break-after: page; }
  [data-day-sheet-page]:last-child { break-after: auto; }
}
`

export function DaySheet({
  dates,
  locationId,
  onClose,
}: {
  dates: ISODate[]
  locationId: LocationId
  onClose: () => void
}) {
  if (dates.length === 0) return null

  return createPortal(
    <div
      data-day-sheet-root
      className="fixed inset-0 z-50 overflow-y-auto bg-bg print:bg-transparent"
    >
      <style>{PRINT_CSS}</style>

      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5 print:hidden">
        <span className="font-display text-[17px] font-semibold text-ink">
          Day sheet · {dates.length === 1 ? fmtDate(dates[0]!) : `${dates.length} days`}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Icon icon={IconPrint} size={15} />
            Print
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} className="gap-1.5">
            <Icon icon={IconClose} size={15} />
            Close
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[820px] px-6 py-6 print:max-w-none print:px-0 print:py-0">
        {dates.map((date) => (
          <Page key={date} date={date} locationId={locationId} />
        ))}
      </div>
    </div>,
    document.body,
  )
}

function Page({ date, locationId }: { date: ISODate; locationId: LocationId }) {
  const jobs = jobsForDate(date, locationId)
  const location = indexes().locationsById.get(locationId)

  return (
    <section
      data-day-sheet-page
      className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-8 print:mb-0 print:rounded-none print:border-0 print:p-6"
    >
      <header className="flex items-end justify-between gap-4 border-b border-ink pb-3">
        <div>
          <p className="eyebrow text-gold-deep dark:text-gold">Grounds day sheet</p>
          <h2 className="font-display text-[27px] font-semibold leading-tight text-ink">
            {fmtDateLong(date)}
          </h2>
        </div>
        <div className="text-right text-[11.5px] leading-snug text-muted">
          <p className="font-medium text-ink">{PARK_FACTS.shortName}</p>
          <p>{location?.name ?? ''}</p>
          <p>{PARK_FACTS.phone}</p>
        </div>
      </header>

      {(['morning', 'afternoon'] as BurialSlot[]).map((slot) => {
        const job = jobs.find((j) => j.slot === slot) ?? null
        const interment = job ? indexes().intermentsById.get(job.intermentId) : null
        const lot = job ? indexes().lotsById.get(job.lotId) : null

        return (
          <div key={slot} className="mt-5 border-b border-line-soft pb-5 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="eyebrow text-[12px] text-ink">{SLOT_LABEL[slot]}</h3>
              {interment && (
                <span className="text-[11.5px] text-muted">
                  {INTERMENT_TYPE_LABEL[interment.type]}
                </span>
              )}
            </div>

            {!job || !interment ? (
              <p className="mt-2 text-[13px] text-muted">
                No service booked for this slot.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-[92px_1fr] gap-4">
                {lot && <LotThumb lot={lot} size={92} />}
                <div className="min-w-0">
                  <p className="font-display text-[19px] font-semibold leading-tight text-ink">
                    {deceasedFullName(interment)}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    Lot{' '}
                    <span className="font-mono text-ink">
                      {lot ? lotCodeFor(lot) : '—'}
                    </span>
                    {lot ? ` · ${ownerName(lot)}` : ''}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    Crew:{' '}
                    <span className="text-ink">
                      {job.assignedToUserId
                        ? (indexes().usersById.get(job.assignedToUserId)?.fullName ?? '—')
                        : '________________________'}
                    </span>
                  </p>

                  <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
                    {GROUNDS_CHECKLIST.map((c) => {
                      const done = job.checklist.find((x) => x.key === c.key)?.done
                      return (
                        <li key={c.key} className="flex items-center gap-2 text-[12.5px]">
                          <span
                            aria-hidden
                            className="grid size-[13px] shrink-0 place-items-center rounded-[2px] border border-ink text-[10px] leading-none text-ink"
                          >
                            {done ? '✓' : ''}
                          </span>
                          <span className="text-ink">{c.label}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <footer className="mt-7 grid grid-cols-2 gap-8">
        {['Grounds crew signature', 'Verified by'].map((label) => (
          <div key={label}>
            <div className="h-8 border-b border-ink" />
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
              <Icon icon={IconSignature} size={12} />
              {label}
            </p>
          </div>
        ))}
      </footer>
    </section>
  )
}
