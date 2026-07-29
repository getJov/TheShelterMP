import { createContext, useContext, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { DayProps } from 'react-day-picker'
import {
  blockingRequirements,
  MAX_BURIALS_PER_DAY,
  type BurialSlot,
  type Interment,
  type ISODate,
} from '@/domain'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import { diffDays, toDate } from '@/lib/dates'
import { SlotDots } from './bits'
import { EASE, INTERMENT_STATUS_STYLE, slotLabelShort, surname } from './helpers'

export interface DayCell {
  morning: Interment | null
  afternoon: Interment | null
}

interface MonthCtx {
  cells: Map<ISODate, DayCell>
  today: ISODate
  gridStart: ISODate
  canSchedule: boolean
  onOpenSlot: (date: ISODate, slot: BurialSlot) => void
  onOpenInterment: (i: Interment) => void
}

const MonthContext = createContext<MonthCtx | null>(null)

/**
 * The month grid. Built on the shadcn `Calendar` primitive with the day cell
 * swapped for our own content — never a hand-rolled date grid, because the
 * week rollover, leap years and the Monday start are somebody else's solved
 * problem.
 */
export function MonthCalendar({
  month,
  onMonthChange,
  direction,
  cells,
  today,
  canSchedule,
  onOpenSlot,
  onOpenInterment,
}: {
  /** First day of the displayed month, ISO. */
  month: ISODate
  onMonthChange: (iso: ISODate) => void
  /** +1 forward, −1 back — drives the horizontal slide. */
  direction: number
  cells: Map<ISODate, DayCell>
  today: ISODate
  canSchedule: boolean
  onOpenSlot: (date: ISODate, slot: BurialSlot) => void
  onOpenInterment: (i: Interment) => void
}) {
  const monthDate = useMemo(() => toDate(month), [month])

  // The visible grid starts on the Monday on or before the 1st.
  const gridStart = useMemo(() => {
    const d = toDate(month)
    const dow = (d.getDay() + 6) % 7
    const start = new Date(d)
    start.setDate(d.getDate() - dow)
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  }, [month])

  const ctx: MonthCtx = {
    cells,
    today,
    gridStart,
    canSchedule,
    onOpenSlot,
    onOpenInterment,
  }

  return (
    <MonthContext.Provider value={ctx}>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={month}
            custom={direction}
            initial={{ opacity: 0, x: direction >= 0 ? 26 : -26 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction >= 0 ? -26 : 26 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <Calendar
              month={monthDate}
              onMonthChange={(d) =>
                onMonthChange(
                  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
                )
              }
              weekStartsOn={1}
              showOutsideDays
              className="w-full bg-transparent p-0"
              classNames={{
                root: 'w-full',
                months: 'w-full',
                month: 'flex w-full flex-col gap-0',
                nav: 'hidden',
                month_caption: 'hidden',
                month_grid: 'w-full border-collapse',
                weekdays: 'flex w-full border-b border-line bg-surface-2',
                weekday:
                  'eyebrow flex-1 px-2 py-2 text-left text-muted',
                week: 'flex w-full',
                day: 'min-w-0 flex-1 p-0 align-top',
              }}
              components={{ Day: MonthDay }}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </MonthContext.Provider>
  )
}

function MonthDay({ day, modifiers, className, ...tdProps }: DayProps) {
  const ctx = useContext(MonthContext)
  if (!ctx) return <td {...tdProps} className={className} />

  const date = day.isoDate
  const cell = ctx.cells.get(date)
  const morning = cell?.morning ?? null
  const afternoon = cell?.afternoon ?? null
  const booked = [morning, afternoon].filter(Boolean).length
  const full = booked >= MAX_BURIALS_PER_DAY
  const isToday = date === ctx.today
  const isPast = date < ctx.today
  const outside = day.outside === true

  const idx = Math.max(0, Math.min(41, diffDays(date, ctx.gridStart)))

  return (
    <td {...tdProps} className={cn('p-0 align-top', className)}>
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: EASE, delay: idx * 0.015 }}
        className={cn(
          'group/cell flex h-full min-h-[112px] flex-col gap-1 border-b border-r border-line-soft px-1.5 pb-1.5 pt-1',
          full && 'bg-gold/8',
          outside && 'bg-surface-2/60',
          isPast && !full && 'bg-surface-2/40',
          isToday && 'relative z-10 ring-2 ring-inset ring-gold',
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span
            className={cn(
              'tabular font-display text-[15px] leading-none',
              outside || isPast ? 'text-muted' : 'text-ink',
              isToday && 'font-semibold text-gold-deep dark:text-gold',
            )}
          >
            {day.date.getDate()}
          </span>
          <SlotDots morning={!!morning} afternoon={!!afternoon} />
        </div>

        {full && (
          <span className="eyebrow text-[9.5px] leading-none text-gold-deep dark:text-gold">
            Full
          </span>
        )}

        <div className="flex min-h-0 flex-col gap-[3px]">
          {(['morning', 'afternoon'] as BurialSlot[]).map((slot) => {
            const i = slot === 'morning' ? morning : afternoon
            if (i) {
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => ctx.onOpenInterment(i)}
                  title={`${slotLabelShort[slot]} · ${surname(i)}`}
                  className={cn(
                    'truncate rounded px-1.5 py-[3px] text-left text-[11.5px] leading-tight transition-opacity hover:opacity-80',
                    INTERMENT_STATUS_STYLE[i.status].entry,
                  )}
                >
                  <span className="font-mono text-[10px] font-medium">
                    {slotLabelShort[slot]}
                  </span>{' '}
                  {surname(i)}
                  {blockingRequirements(i).length > 0 && (
                    <span
                      title={`Outstanding: ${blockingRequirements(i).join(', ')}`}
                      className="ml-1 inline-block size-1.5 rounded-full bg-danger align-middle"
                    />
                  )}
                </button>
              )
            }
            if (!ctx.canSchedule || outside || isPast) return null
            return (
              <button
                key={slot}
                type="button"
                onClick={() => ctx.onOpenSlot(date, slot)}
                className="truncate rounded border border-dashed border-line px-1.5 py-[3px] text-left text-[11px] leading-tight text-muted opacity-0 transition-opacity hover:border-gold hover:text-gold-deep focus-visible:opacity-100 group-hover/cell:opacity-100 dark:hover:text-gold"
              >
                + {slotLabelShort[slot]}
              </button>
            )
          })}
        </div>
        {void modifiers}
      </motion.div>
    </td>
  )
}
