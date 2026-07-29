import { TRUST_FUND_RATE_PERCENT } from '@/domain'
import { formatPeso } from '@/lib/money'
import { CHART_HEIGHT } from '../constants'
import { CardShell } from '../CardShell'
import { MoneyArea } from '../charts'
import { selectTrustFund } from '../selectors'
import type { CardProps } from '../types'

export function TrustFundCard(props: CardProps) {
  const d = selectTrustFund({
    version: props.version,
    user: props.user,
    locationId: props.locationId,
    period: props.period,
    agentId: null,
  })

  return (
    <CardShell
      card={props}
      value={formatPeso(d.balanceCentavos, { compact: true })}
      delta={
        d.periodAccrualCentavos > 0
          ? {
              label: formatPeso(d.periodAccrualCentavos, { compact: true, sign: true }),
              tone: 'positive',
            }
          : null
      }
      subtitle={`${TRUST_FUND_RATE_PERCENT}% of every payment collected`}
      detailsHref="/sales/trust-fund"
      detailsLabel="Open trust fund"
      footer="Perpetual-care balance, running total."
    >
      <MoneyArea data={d.series} height={CHART_HEIGHT[props.layout].small} />
    </CardShell>
  )
}
