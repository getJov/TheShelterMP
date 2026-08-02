import { useState } from 'react'
import type { ISODate } from '@/domain'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Icon } from '@/components/ui-brand/Icon'
import { IconBurials } from '@/components/ui-brand/icons'
import { fmtDate, toDate, toISODate } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** Calendar in a Popover — never a native date input. */
export function DateField({
  value,
  onChange,
  max,
  min,
  id,
  className,
  describedBy,
  invalid,
}: {
  value: ISODate
  onChange: (v: ISODate) => void
  max?: ISODate
  min?: ISODate
  id?: string
  className?: string
  describedBy?: string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn('w-full justify-start gap-2 font-normal', className)}
        >
          <Icon icon={IconBurials} size={15} className="opacity-70" />
          <span className="tabular">{fmtDate(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          defaultMonth={toDate(value)}
          selected={toDate(value)}
          onSelect={(d) => {
            if (!d) return
            onChange(toISODate(d))
            setOpen(false)
          }}
          disabled={[
            ...(max ? [{ after: toDate(max) }] : []),
            ...(min ? [{ before: toDate(min) }] : []),
          ]}
        />
      </PopoverContent>
    </Popover>
  )
}
