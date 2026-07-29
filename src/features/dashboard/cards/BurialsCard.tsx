import { useNavigate } from 'react-router-dom'
import { fmtDateShort } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { CardEmpty, CardShell } from '../CardShell'
import { mapHref } from '../map-links'
import { selectBurials } from '../selectors'
import type { CardProps } from '../types'

export function BurialsCard(props: CardProps) {
  const navigate = useNavigate()
  const d = selectBurials({
    version: props.version,
    user: props.user,
    locationId: props.locationId,
    period: props.period,
    agentId: null,
  })

  const next = d.rows[0]

  return (
    <CardShell
      card={props}
      value={
        next
          ? next.daysAway === 0
            ? 'Today'
            : next.daysAway === 1
              ? 'Tomorrow'
              : `${next.daysAway}d`
          : '—'
      }
      subtitle={next ? `Next interment · ${fmtDateShort(next.date)}` : 'Nothing scheduled'}
      detailsHref="/burials"
      detailsLabel="Open burials"
      footer={`${d.scheduledInPeriod} scheduled in this period.`}
    >
      {d.rows.length === 0 ? (
        <CardEmpty>No burials scheduled.</CardEmpty>
      ) : (
        <ul className="space-y-0.5">
          {d.rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  // Fly the map to that lot and open the drawer on Interments.
                  navigate(mapHref({ lotCode: r.lotCode, drawer: 'interments' }))
                }}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
              >
                <span className="w-[46px] shrink-0 text-[11.5px] tabular text-muted">
                  {fmtDateShort(r.date)}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded px-1 py-px text-[9.5px] font-semibold uppercase tracking-[0.06em]',
                    r.slot === 'morning'
                      ? 'bg-gold/16 text-gold-deep dark:text-gold'
                      : 'bg-status-occupied/16 text-status-occupied',
                  )}
                >
                  {r.slot === 'morning' ? 'AM' : 'PM'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                  {r.deceased}
                </span>
                {r.dayFull && (
                  <span className="shrink-0 rounded border border-line px-1 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                    Full
                  </span>
                )}
                <span className="shrink-0 font-mono text-[10.5px] text-muted">
                  {r.lotCode}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  )
}
