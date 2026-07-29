import type { PaymentHealth } from '@/domain'
import { formatPeso } from '@/lib/money'
import { CardEmpty, CardShell } from '../CardShell'
import { LegendRow, StackBar, StackLegend } from '../charts'
import { useMapDrill } from '../map-links'
import { selectReceivables } from '../selectors'
import type { CardProps } from '../types'

/**
 * The overdue segments drive the map into payment_health mode filtered to
 * those lots — the single most persuasive interaction in the demo.
 */
export function ReceivablesCard(props: CardProps) {
  const drillTo = useMapDrill()
  const d = selectReceivables({
    version: props.version,
    user: props.user,
    locationId: props.locationId,
    period: props.period,
    agentId: null,
  })

  const drill = (health: PaymentHealth[]) =>
    drillTo({ mode: 'payment_health', health })

  if (d.totalCentavos === 0) {
    return (
      <CardShell card={props} value="₱0" subtitle="Nothing outstanding">
        <CardEmpty>Every active contract is paid up to date.</CardEmpty>
      </CardShell>
    )
  }

  return (
    <CardShell
      card={props}
      value={formatPeso(d.totalCentavos, { decimals: false })}
      subtitle={`Outstanding across ${d.contractCount} active contract${d.contractCount === 1 ? '' : 's'}`}
      detailsHref="/sales/receivables"
      detailsLabel="Open receivables"
      footer={
        d.overdueCount > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              drill(['overdue', 'severely_overdue'])
            }}
            className="font-medium text-gold-deep underline-offset-2 hover:underline dark:text-gold"
          >
            Show {d.overdueCount} overdue account{d.overdueCount === 1 ? '' : 's'} on the map →
          </button>
        ) : (
          'No overdue accounts.'
        )
      }
    >
      <StackBar
        segments={d.segments.map((s) => ({
          key: s.key,
          label: s.label,
          color: s.color,
          value: s.centavos,
          title: `${s.label} · ${s.count} · ${formatPeso(s.centavos, { compact: true })}`,
          onClick: s.drillable ? () => drill([s.key]) : undefined,
        }))}
      />

      <StackLegend>
        {d.segments.map((s) => (
          <LegendRow
            key={s.key}
            color={s.color}
            label={s.label}
            count={s.count}
            amount={s.centavos}
            emphasise={s.drillable && s.count > 0}
            onClick={s.drillable && s.count > 0 ? () => drill([s.key]) : undefined}
          />
        ))}
      </StackLegend>
    </CardShell>
  )
}
