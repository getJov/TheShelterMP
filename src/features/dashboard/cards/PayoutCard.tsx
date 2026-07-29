import { useNavigate } from 'react-router-dom'
import { ASSUMPTIONS, can } from '@/domain'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { Icon } from '@/components/ui-brand/Icon'
import { IconWarning } from '@/components/ui-brand/icons'
import { fmtDateShort } from '@/lib/dates'
import { formatPeso } from '@/lib/money'
import { CardShell } from '../CardShell'
import { selectPayout } from '../selectors'
import type { CardProps } from '../types'

export function PayoutCard(props: CardProps) {
  const navigate = useNavigate()
  const d = selectPayout({
    version: props.version,
    user: props.user,
    locationId: props.locationId,
    period: props.period,
    agentId: props.def.agentVariant === 'own' && props.agent ? props.agent.id : null,
  })

  const countdown =
    d.daysToRelease <= 0
      ? 'Releasing today'
      : d.daysToRelease === 1
        ? 'Releases tomorrow'
        : `Releases in ${d.daysToRelease} days`

  return (
    <CardShell
      card={props}
      value={formatPeso(d.accruedCentavos, { compact: true })}
      delta={{ label: countdown, tone: 'neutral' }}
      subtitle={`${fmtDateShort(d.periodStart)} – ${fmtDateShort(d.periodEnd)} · Sat → Thu`}
      detailsHref="/agents/payouts"
      detailsLabel="Open payout runs"
      onOpen={() => navigate('/agents/payouts')}
      footer={
        <span className="flex flex-wrap items-center gap-1.5">
          <span>
            {d.entryCount} entr{d.entryCount === 1 ? 'y' : 'ies'} accrued ·{' '}
            {d.scopedToAgent ? 'your share' : 'all agents'}
          </span>
          <AssumedChip why={ASSUMPTIONS.commissionRates.why} label="6/4/2 assumed" />
        </span>
      }
    >
      {/* Only offered to whoever can actually decide it. */}
      {d.awaitingApproval && can(props.user.role, 'payout:approve') && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            navigate('/approvals?kind=payout_run')
          }}
          className="flex w-full items-center gap-2 rounded-md border border-gold/45 bg-gold/12 px-2.5 py-2 text-left transition-colors hover:bg-gold/18"
        >
          <Icon icon={IconWarning} size={15} className="shrink-0 text-gold-deep dark:text-gold" />
          <span className="min-w-0 flex-1 text-[12px] leading-snug text-ink">
            Run {fmtDateShort(d.awaitingApproval.periodStart)}–
            {fmtDateShort(d.awaitingApproval.periodEnd)} awaiting approval ·{' '}
            {formatPeso(d.awaitingApproval.totalCentavos, { compact: true })}
          </span>
          <span className="shrink-0 text-[11.5px] font-semibold text-gold-deep dark:text-gold">
            Approve
          </span>
        </button>
      )}
    </CardShell>
  )
}
