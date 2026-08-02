import { useMemo, useState } from 'react'
import {
  MAX_BURIALS_PER_DAY,
  SLOT_LABEL,
  type BurialSlot,
  type Interment,
  type ISODate,
  type LocationId,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconChevronLeft,
  IconChevronRight,
  IconScheduleBurial,
} from '@/components/ui-brand/icons'
import { addDays, addMonths, fmtDate, fmtDateLong, fmtMonth, toDate } from '@/lib/dates'
import { dataset, useDataset } from '@/stores/dataset'
import { holdsSlot, nextAvailableSlot } from '@/stores/burials'
import { FIRST_INTERMENT, TODAY } from '@/mock'
import { MonthCalendar, type DayCell } from './MonthCalendar'
import { WeekView } from './WeekView'
import { DayView } from './DayView'
import { SlotDots } from './bits'

type View = 'month' | 'week' | 'day'

/** Monday on or before the given date. */
function weekStart(iso: ISODate): ISODate {
  const d = toDate(iso)
  return addDays(iso, -((d.getDay() + 6) % 7))
}

const monthStart = (iso: ISODate): ISODate => `${iso.slice(0, 7)}-01`

export function CalendarTab({
  locationId,
  canSchedule,
  canManageJobs,
  onOpenInterment,
  onSchedule,
}: {
  locationId: LocationId
  canSchedule: boolean
  canManageJobs: boolean
  onOpenInterment: (i: Interment) => void
  onSchedule: (date: ISODate | null, slot: BurialSlot | null) => void
}) {
  const version = useDataset((s) => s.version)
  const [view, setView] = useState<View>('month')
  const [anchor, setAnchor] = useState<ISODate>(TODAY)
  const [direction, setDirection] = useState(1)

  const range = useMemo((): [ISODate, ISODate] => {
    if (view === 'day') return [anchor, anchor]
    if (view === 'week') {
      const s = weekStart(anchor)
      return [s, addDays(s, 6)]
    }
    const s = monthStart(anchor)
    return [addDays(s, -7), addDays(addMonths(s, 1), 7)]
  }, [view, anchor])

  const cells = useMemo(() => {
    void version
    const m = new Map<ISODate, DayCell>()
    for (const i of dataset().interments) {
      if (i.locationId !== locationId) continue
      if (!holdsSlot(i)) continue
      if (i.scheduledDate < range[0] || i.scheduledDate > range[1]) continue
      const cur = m.get(i.scheduledDate) ?? { morning: null, afternoon: null }
      if (i.slot === 'morning') cur.morning = i
      else cur.afternoon = i
      m.set(i.scheduledDate, cur)
    }
    return m
  }, [locationId, range, version])

  const next = useMemo(() => {
    void version
    return nextAvailableSlot(TODAY, locationId)
  }, [locationId, version])

  const step = (dir: number) => {
    setDirection(dir)
    setAnchor((a) =>
      view === 'month'
        ? addMonths(monthStart(a), dir)
        : view === 'week'
          ? addDays(a, 7 * dir)
          : addDays(a, dir),
    )
  }

  const title =
    view === 'month'
      ? fmtMonth(anchor)
      : view === 'week'
        ? `${fmtDate(weekStart(anchor))} – ${fmtDate(addDays(weekStart(anchor), 6))}`
        : fmtDateLong(anchor)

  const weekDays = useMemo(() => {
    const s = weekStart(anchor)
    return Array.from({ length: 7 }, (_, n) => addDays(s, n))
  }, [anchor])

  const bookedInView = useMemo(() => {
    let n = 0
    for (const [date, c] of cells) {
      if (date < range[0] || date > range[1]) continue
      if (view === 'month' && date.slice(0, 7) !== anchor.slice(0, 7)) continue
      n += (c.morning ? 1 : 0) + (c.afternoon ? 1 : 0)
    }
    return n
  }, [cells, range, view, anchor])

  /** A real client fact, not a shrug. */
  const beforeFirstInterment =
    view === 'month'
      ? addDays(addMonths(monthStart(anchor), 1), -1) < FIRST_INTERMENT
      : range[1] < FIRST_INTERMENT

  return (
    <div className="space-y-3">
      {/* ── toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Previous ${view}`}
            onClick={() => step(-1)}
          >
            <Icon icon={IconChevronLeft} size={17} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Next ${view}`}
            onClick={() => step(1)}
          >
            <Icon icon={IconChevronRight} size={17} />
          </Button>
        </div>

        <h3 className="text-section-title font-display font-semibold text-ink" aria-live="polite">
          {title}
        </h3>

        <Button
          variant="ghost"
          size="sm"
          className="text-muted"
          onClick={() => {
            setDirection(anchor < TODAY ? 1 : -1)
            setAnchor(TODAY)
          }}
        >
          Today
        </Button>

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={view}
            onValueChange={(v) => v && setView(v as View)}
            aria-label="Calendar view"
          >
            <ToggleGroupItem value="month">
              Month
            </ToggleGroupItem>
            <ToggleGroupItem value="week">
              Week
            </ToggleGroupItem>
            <ToggleGroupItem value="day">
              Day
            </ToggleGroupItem>
          </ToggleGroup>

          {canSchedule && (
            <Button size="sm" className="gap-1.5" onClick={() => onSchedule(null, null)}>
              <Icon icon={IconScheduleBurial} size={15} />
              Schedule burial
            </Button>
          )}
        </div>
      </div>

      {/* ── legend + next available ─────────────────────────── */}
      <div className="text-caption flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-muted">
        <span className="inline-flex items-center gap-1.5">
          <SlotDots morning afternoon />
          Booked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SlotDots morning={false} afternoon={false} />
          Open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm border border-dashed border-gold bg-gold/10" />
          Requested
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm ring-2 ring-inset ring-gold" />
          Today
        </span>
        <span className="w-full sm:ml-auto sm:w-auto">
          Maximum {MAX_BURIALS_PER_DAY} services a day — one morning, one afternoon.
          {next && (
            <>
              {' · '}
              <span className="font-medium text-ink">Next available:</span>{' '}
              {fmtDate(next.date)}, {SLOT_LABEL[next.slot].toLowerCase()}
            </>
          )}
        </span>
      </div>

      {/* ── empty-state notices ─────────────────────────────── */}
      {beforeFirstInterment ? (
        <p className="text-body rounded-lg border border-line bg-surface px-3.5 py-2.5 text-muted" role="status">
          The park's first interment was{' '}
          <span className="font-medium text-ink">{fmtDate(FIRST_INTERMENT)}</span>. There is
          nothing before it.
        </p>
      ) : bookedInView === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5">
          <p className="text-body text-muted" role="status">
            No services scheduled {view === 'month' ? 'this month' : view === 'week' ? 'this week' : 'this day'}.
          </p>
          {canSchedule && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => onSchedule(view === 'day' ? anchor : null, null)}
            >
              Schedule a burial
            </Button>
          )}
        </div>
      ) : null}

      {/* ── the view ────────────────────────────────────────── */}
      {view === 'month' && (
        <MonthCalendar
          month={monthStart(anchor)}
          direction={direction}
          onMonthChange={(iso) => {
            setDirection(iso > anchor ? 1 : -1)
            setAnchor(iso)
          }}
          cells={cells}
          today={TODAY}
          canSchedule={canSchedule}
          onOpenSlot={(d, s) => onSchedule(d, s)}
          onOpenInterment={onOpenInterment}
        />
      )}

      {view === 'week' && (
        <WeekView
          days={weekDays}
          cells={cells}
          today={TODAY}
          canSchedule={canSchedule}
          onOpenSlot={(d, s) => onSchedule(d, s)}
          onOpenInterment={onOpenInterment}
        />
      )}

      {view === 'day' && (
        <DayView
          date={anchor}
          cell={cells.get(anchor)}
          locationId={locationId}
          canSchedule={canSchedule}
          canManageJobs={canManageJobs}
          onOpenSlot={(d, s) => onSchedule(d, s)}
          onOpenInterment={onOpenInterment}
        />
      )}
    </div>
  )
}
