import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { DASHBOARD_PERIODS, usePanel, type DashboardPeriod } from '@/stores/panel'
import type { DashboardSurface } from './types'

/** Every card honours this. */
export function PeriodSelector({
  compact,
  className,
  surface,
}: {
  compact?: boolean
  className?: string
  surface: DashboardSurface
}) {
  const period = usePanel((s) => s.period)
  const setPeriod = usePanel((s) => s.setPeriod)
  const isStandalone = surface === 'standalone'

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={period}
      onValueChange={(v) => v && setPeriod(v as DashboardPeriod)}
      className={cn(
        isStandalone
          ? 'grid w-full min-w-0 shrink grid-cols-4 @min-[480px]/dashboard:flex @min-[480px]/dashboard:w-auto @min-[480px]/dashboard:flex-1 @min-[768px]/dashboard:flex-none'
          : 'shrink-0',
        className,
      )}
      aria-label="Reporting period"
    >
      {DASHBOARD_PERIODS.map((p) => (
        <ToggleGroupItem
          key={p.id}
          value={p.id}
          aria-label={p.label}
          className={cn(
            'text-caption data-[state=on]:bg-gold/14 data-[state=on]:text-gold-deep dark:data-[state=on]:text-gold',
            isStandalone
              ? 'w-full min-w-0 shrink px-1 @min-[480px]/dashboard:w-auto @min-[480px]/dashboard:flex-1 @min-[480px]/dashboard:px-2.5 @min-[768px]/dashboard:flex-none'
              : 'px-2.5',
          )}
        >
          {compact ? (
            p.short
          ) : isStandalone ? (
            <>
              <span className="@min-[480px]/dashboard:hidden">{p.short}</span>
              <span className="hidden @min-[480px]/dashboard:inline">{p.label}</span>
            </>
          ) : (
            p.label
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
