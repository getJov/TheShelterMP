import { useState } from 'react'
import type { ISODate } from '@/domain'
import { TODAY } from '@/mock'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Icon } from '@/components/ui-brand/Icon'
import { IconCalendar, IconChevronDown, IconRefresh } from '@/components/ui-brand/icons'
import { fmtDate, toDate, toISODate } from '@/lib/dates'
import { cn } from '@/lib/utils'

/**
 * The single control that retimes the whole page. One click moves the price
 * book to any date and every figure on screen follows — which is the
 * clearest demonstration of effective dating available in a meeting.
 */

const PRESETS: { label: string; hint: string; date: ISODate }[] = [
  { label: 'Today', hint: 'July promo is live', date: TODAY },
  { label: '01 Aug 2026', hint: 'The day the promo lapses', date: '2026-08-01' },
  { label: '15 Jun 2026', hint: 'List prices, no promo', date: '2026-06-15' },
  { label: '15 Jun 2025', hint: 'Launch generation', date: '2025-06-15' },
]

export function AsOfControl({
  value,
  onChange,
  className,
}: {
  value: ISODate
  onChange: (v: ISODate) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const isToday = value === TODAY

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'gap-2 border-line bg-surface font-normal',
              !isToday && 'border-gold/70 bg-gold/10',
            )}
          >
            <Icon icon={IconCalendar} size={15} />
            <span className="text-muted">Showing prices as of</span>
            <span className="tabular font-medium text-ink">{fmtDate(value)}</span>
            <Icon icon={IconChevronDown} size={14} className="text-muted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <div className="p-2">
            <p className="eyebrow px-1.5 pb-1.5 text-muted">Jump to</p>
            <div className="grid gap-0.5">
              {PRESETS.map((p) => (
                <button
                  key={p.date}
                  type="button"
                  onClick={() => {
                    onChange(p.date)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex items-baseline justify-between gap-4 rounded-md px-2 py-1.5 text-left text-[13px]',
                    'transition-colors hover:bg-surface-2',
                    value === p.date && 'bg-gold/12 text-gold-deep dark:text-gold',
                  )}
                >
                  <span className="font-medium">{p.label}</span>
                  <span className="text-[11.5px] text-muted">{p.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <Separator />
          <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={new Date(2024, 0)}
            endMonth={new Date(2030, 11)}
            defaultMonth={toDate(value)}
            selected={toDate(value)}
            onSelect={(d) => {
              if (d) onChange(toISODate(d))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      {!isToday && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted"
          onClick={() => onChange(TODAY)}
        >
          <Icon icon={IconRefresh} size={14} />
          Back to today
        </Button>
      )}
    </div>
  )
}
