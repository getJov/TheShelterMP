import { useNavigate } from 'react-router-dom'
import { formatPeso } from '@/lib/money'
import { CHART_HEIGHT } from '../constants'
import { CardShell } from '../CardShell'
import { MoneyBars } from '../charts'
import { selectCollections } from '../selectors'
import type { CardProps } from '../types'

/**
 * The client said money coming in is what drives them. This is that card, and
 * it is deliberately first in the config.
 */
export function CollectionsCard(props: CardProps) {
  const navigate = useNavigate()
  const d = selectCollections({
    version: props.version,
    user: props.user,
    locationId: props.locationId,
    period: props.period,
    agentId: null,
  })

  const delta =
    d.deltaPercent === null
      ? d.prevCentavos === 0 && d.totalCentavos > 0
        ? { label: 'new', tone: 'positive' as const }
        : null
      : {
          label: `${d.deltaPercent >= 0 ? '+' : '−'}${Math.abs(d.deltaPercent).toFixed(0)}%`,
          tone: d.deltaPercent >= 0 ? ('positive' as const) : ('negative' as const),
        }

  return (
    <CardShell
      card={props}
      value={formatPeso(d.totalCentavos, { decimals: false })}
      delta={delta}
      subtitle={`${d.window.label} · ${d.count} payment${d.count === 1 ? '' : 's'} posted`}
      detailsHref="/sales/payments"
      detailsLabel="Open payments"
      onOpen={() => navigate('/sales/payments')}
      footer={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            Today{' '}
            <b className="font-semibold tabular text-ink">
              {formatPeso(d.todayCentavos, { decimals: false })}
            </b>
          </span>
          <span>
            This week{' '}
            <b className="font-semibold tabular text-ink">
              {formatPeso(d.weekCentavos, { decimals: false })}
            </b>
          </span>
          <span className="text-muted">
            vs {formatPeso(d.prevCentavos, { compact: true })} {d.window.prevLabel}
          </span>
        </span>
      }
    >
      <MoneyBars data={d.series} height={CHART_HEIGHT[props.layout].hero} />
    </CardShell>
  )
}
