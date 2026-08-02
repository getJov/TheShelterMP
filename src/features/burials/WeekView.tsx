import { motion } from 'framer-motion'
import {
  blockingRequirements,
  deceasedFullName,
  SLOT_LABEL,
  type BurialSlot,
  type Interment,
  type ISODate,
} from '@/domain'
import { cn } from '@/lib/utils'
import { fmtDateShort, toDate } from '@/lib/dates'
import { Icon } from '@/components/ui-brand/Icon'
import { IconAdd, IconWarning } from '@/components/ui-brand/icons'
import {
  IntermentStatusChip,
  IntermentTypeBadge,
  RequirementsMeter,
  SlotIcon,
} from './bits'
import { EASE, lotCode } from './helpers'
import type { DayCell } from './MonthCalendar'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Seven columns, two rows. Enough room to actually read the week's work —
 * the month grid answers "is there space", this answers "what is it".
 */
export function WeekView({
  days,
  cells,
  today,
  canSchedule,
  onOpenSlot,
  onOpenInterment,
}: {
  days: ISODate[]
  cells: Map<ISODate, DayCell>
  today: ISODate
  canSchedule: boolean
  onOpenSlot: (date: ISODate, slot: BurialSlot) => void
  onOpenInterment: (i: Interment) => void
}) {
  return (
    <div
      className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface"
      role="region"
      aria-label="Week burial calendar"
      tabIndex={0}
    >
      <div className="min-w-[860px]">
        <div className="grid grid-cols-[76px_repeat(7,minmax(0,1fr))] border-b border-line bg-surface-2">
          <div />
          {days.map((d, n) => (
            <div
              key={d}
              className={cn(
                'border-l border-line px-2 py-2',
                d === today && 'bg-gold/10',
              )}
            >
              <p className="eyebrow text-muted">{DOW[n]}</p>
              <p
                className={cn(
                  'text-small-title font-display leading-tight',
                  d === today ? 'font-semibold text-gold-deep dark:text-gold' : 'text-ink',
                )}
              >
                {toDate(d).getDate()}
              </p>
            </div>
          ))}
        </div>

        {(['morning', 'afternoon'] as BurialSlot[]).map((slot) => (
          <div
            key={slot}
            className="grid grid-cols-[76px_repeat(7,minmax(0,1fr))] border-b border-line-soft last:border-b-0"
          >
            <div className="text-caption flex items-start gap-1.5 px-2 py-3 text-muted">
              <SlotIcon slot={slot} size={13} />
              <span className="leading-tight">{SLOT_LABEL[slot]}</span>
            </div>
            {days.map((d, n) => {
              const i = slot === 'morning' ? cells.get(d)?.morning : cells.get(d)?.afternoon
              return (
                <div
                  key={d}
                  className={cn(
                    'border-l border-line-soft p-1.5',
                    d === today && 'bg-gold/5',
                    d < today && 'bg-surface-2/40',
                  )}
                >
                  {i ? (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, ease: EASE, delay: n * 0.02 }}
                      onClick={() => onOpenInterment(i)}
                      aria-label={`View ${deceasedFullName(i)} on ${d}, ${slot}`}
                      className="w-full rounded-lg border border-line bg-surface p-2 text-left transition-colors hover:border-gold"
                    >
                      <p className="text-body font-display leading-tight text-ink">
                        {deceasedFullName(i)}
                      </p>
                      <p className="text-micro mt-0.5 font-mono text-muted">
                        {lotCode(i.lotId)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <IntermentTypeBadge type={i.type} />
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <RequirementsMeter interment={i} showCount={false} />
                        {blockingRequirements(i).length > 0 && (
                          <Icon
                            icon={IconWarning}
                            size={12}
                            className="text-gold-deep dark:text-gold"
                          />
                        )}
                      </div>
                      <div className="mt-1.5">
                        <IntermentStatusChip status={i.status} />
                      </div>
                    </motion.button>
                  ) : canSchedule && d >= today ? (
                    <button
                      type="button"
                      onClick={() => onOpenSlot(d, slot)}
                      aria-label={`Schedule ${slot} burial on ${d}`}
                      className="text-caption flex h-full min-h-16 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line text-muted transition-colors hover:border-gold hover:text-gold-deep dark:hover:text-gold"
                    >
                      <Icon icon={IconAdd} size={13} />
                      Open
                    </button>
                  ) : (
                    <div className="text-caption flex h-full min-h-16 items-center justify-center text-muted/60">
                      —
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="text-caption border-t border-line bg-surface-2 px-3 py-2 text-muted">
        {fmtDateShort(days[0]!)} – {fmtDateShort(days[6]!)} · two services a day, no more.
      </p>
    </div>
  )
}
