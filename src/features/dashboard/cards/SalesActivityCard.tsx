import { useNavigate } from 'react-router-dom'
import { NEED_TYPE_LABEL } from '@/domain'
import { formatPeso } from '@/lib/money'
import { CardEmpty, CardShell } from '../CardShell'
import { LegendRow, StackBar, StackLegend } from '../charts'
import { useChartColors } from '../use-chart-colors'
import { selectSalesActivity } from '../selectors'
import type { CardProps } from '../types'

export function SalesActivityCard(props: CardProps) {
  const navigate = useNavigate()
  const c = useChartColors()
  const d = selectSalesActivity({
    version: props.version,
    user: props.user,
    locationId: props.locationId,
    period: props.period,
    // agentVariant 'own' — an agent sees their own contracts, not the park's.
    agentId: props.def.agentVariant === 'own' && props.agent ? props.agent.id : null,
  })

  const delta =
    d.deltaCount === 0
      ? { label: 'flat', tone: 'neutral' as const }
      : {
          label: `${d.deltaCount > 0 ? '+' : '−'}${Math.abs(d.deltaCount)}`,
          tone: d.deltaCount > 0 ? ('positive' as const) : ('negative' as const),
        }

  return (
    <CardShell
      card={props}
      value={String(d.count)}
      delta={delta}
      subtitle={`${d.scopedToAgent ? 'Your contracts' : 'Contracts'} · ${d.window.label.toLowerCase()}`}
      detailsHref="/sales"
      detailsLabel="Open sales"
      onOpen={() => navigate('/sales')}
      footer={
        <>
          Average contract{' '}
          <b className="font-semibold tabular text-ink">
            {formatPeso(d.averageCentavos, { compact: true })}
          </b>{' '}
          · {formatPeso(d.totalCentavos, { compact: true })} written
        </>
      }
    >
      {d.count === 0 ? (
        <CardEmpty>No contracts written {d.window.label.toLowerCase()}.</CardEmpty>
      ) : (
        <>
          <StackBar
            segments={[
              {
                key: 'pre_need',
                label: NEED_TYPE_LABEL.pre_need,
                color: c['color-green'],
                value: d.preNeed,
              },
              {
                key: 'at_need',
                label: NEED_TYPE_LABEL.at_need,
                color: c['color-gold'],
                value: d.atNeed,
              },
            ]}
          />
          <StackLegend>
            <LegendRow
              color={c['color-green']}
              label={NEED_TYPE_LABEL.pre_need}
              count={d.preNeed}
            />
            <LegendRow
              color={c['color-gold']}
              label={NEED_TYPE_LABEL.at_need}
              count={d.atNeed}
            />
          </StackLegend>
        </>
      )}
    </CardShell>
  )
}
