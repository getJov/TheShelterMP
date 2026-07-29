import { useState } from 'react'
import type { ISODate } from '@/domain'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Icon } from '@/components/ui-brand/Icon'
import { IconCalendar } from '@/components/ui-brand/icons'
import { fmtDate, toDate, toISODate } from '@/lib/dates'
import { cn } from '@/lib/utils'

/**
 * The only date entry point in this feature. Dates stay ISO strings on both
 * sides of it — no Date object reaches state.
 */
export function DateField({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
  clearable,
  align = 'start',
  className,
}: {
  value: ISODate | null
  onChange: (v: ISODate | null) => void
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start gap-2 font-normal',
            !value && 'text-muted',
            className,
          )}
        >
          <Icon icon={IconCalendar} size={15} />
          <span className="tabular">{value ? fmtDate(value) : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={new Date(2024, 0)}
          endMonth={new Date(2030, 11)}
          defaultMonth={value ? toDate(value) : undefined}
          selected={value ? toDate(value) : undefined}
          onSelect={(d) => {
            if (d) onChange(toISODate(d))
            setOpen(false)
          }}
        />
        {clearable && value && (
          <div className="border-t border-line p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
