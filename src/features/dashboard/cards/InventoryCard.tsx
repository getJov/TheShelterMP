import type { TierId } from '@/domain'
import { formatCount } from '@/lib/money'
import { cn } from '@/lib/utils'
import { CardShell } from '../CardShell'
import { LegendRow, StackBar, StackLegend } from '../charts'
import { mapHref, useMapDrill } from '../map-links'
import { selectInventory } from '../selectors'
import type { CardProps } from '../types'

export function InventoryCard(props: CardProps) {
  const drillTo = useMapDrill()
  const d = selectInventory({
    version: props.version,
    user: props.user,
    locationId: props.locationId,
    period: props.period,
    agentId: null,
  })

  const pct = d.total > 0 ? Math.round((d.available / d.total) * 100) : 0

  return (
    <CardShell
      card={props}
      value={
        <>
          {formatCount(d.available)}
          <span className="ml-1 text-[0.5em] font-normal text-muted">
            / {formatCount(d.total)}
          </span>
        </>
      }
      delta={{ label: `${pct}% open`, tone: 'neutral' }}
      subtitle="Lots available for sale"
      detailsHref={mapHref({ mode: 'status', status: 'available' })}
      detailsLabel="Show on the map"
      footer={
        /* Honest about the rendered subset — spec 00 §9 requires this line. */
        <>
          {formatCount(d.mappedTotal)} lots mapped of ~
          {formatCount(d.plannedTotal)} planned across all products.
        </>
      }
    >
      <StackBar
        segments={d.statuses.map((s) => ({
          key: s.status,
          label: s.label,
          color: s.color,
          value: s.count,
          title: `${s.label} · ${formatCount(s.count)}`,
          onClick: () => drillTo({ mode: 'status', status: s.status }),
        }))}
      />

      <StackLegend>
        {d.statuses
          .filter((s) => s.count > 0)
          .map((s) => (
            <LegendRow
              key={s.status}
              color={s.color}
              label={s.label}
              count={s.count}
              onClick={() => drillTo({ mode: 'status', status: s.status })}
            />
          ))}
      </StackLegend>

      <div className="mt-3 border-t border-line-soft pt-2.5">
        <p className="eyebrow mb-1.5 text-muted">By product</p>
        <div className={cn('grid gap-x-4 gap-y-1', props.layout === 'full' ? 'grid-cols-2' : 'grid-cols-1')}>
          {d.tiers.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                drillTo({ mode: 'tier', tierId: t.id as TierId })
              }}
              className="flex min-h-10 items-baseline gap-2 rounded px-1 py-[3px] text-left text-caption transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1 break-words text-muted">{t.name}</span>
              <span className="shrink-0 tabular text-ink">{formatCount(t.available)}</span>
              <span className="shrink-0 tabular text-muted">/ {formatCount(t.total)}</span>
            </button>
          ))}
        </div>
      </div>
    </CardShell>
  )
}
