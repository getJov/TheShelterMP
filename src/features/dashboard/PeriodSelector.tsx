import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { DASHBOARD_PERIODS, usePanel, type DashboardPeriod } from '@/stores/panel'

/** Every card honours this. */
export function PeriodSelector({
  compact,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const period = usePanel((s) => s.period)
  const setPeriod = usePanel((s) => s.setPeriod)

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={period}
      onValueChange={(v) => v && setPeriod(v as DashboardPeriod)}
      className={cn('shrink-0', className)}
      aria-label="Reporting period"
    >
      {DASHBOARD_PERIODS.map((p) => (
        <ToggleGroupItem
          key={p.id}
          value={p.id}
          className="h-7 px-2.5 text-[12px] data-[state=on]:bg-gold/14 data-[state=on]:text-gold-deep dark:data-[state=on]:text-gold"
        >
          {compact ? p.short : p.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
