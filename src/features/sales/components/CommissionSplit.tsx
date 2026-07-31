import {
  ASSUMPTIONS,
  TOTAL_COMMISSION_PERCENT,
  TRUST_FUND_RATE_PERCENT,
  type AgentId,
  type Centavos,
  type CommissionLevel,
} from '@/domain'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import { IconTrustFund } from '@/components/ui-brand/icons'
import { formatPercent, sumCentavos } from '@/lib/money'
import { agentNameOf } from '../lib'
import { cn } from '@/lib/utils'

export interface SplitRow {
  level: CommissionLevel
  agentId: AgentId
  ratePercent: number
  amountCentavos: Centavos
}

const LEVEL_NAMES = ASSUMPTIONS.commissionLevelNames.value

/**
 * The 6/4/2 split against the contract's snapshotted upline. Earned as
 * payments are collected — signing a contract creates nothing.
 */
export function CommissionSplit({
  rows,
  basisCentavos,
  basisLabel = 'Basis',
  className,
}: {
  rows: SplitRow[]
  basisCentavos: Centavos
  basisLabel?: string
  className?: string
}) {
  const total = sumCentavos(rows.map((r) => r.amountCentavos))

  return (
    <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2">
        <span className="eyebrow text-gold-deep dark:text-gold">
          Commission split · {formatPercent(TOTAL_COMMISSION_PERCENT, 0)} total
        </span>
        <AssumedChip
          why={ASSUMPTIONS.commissionRates.why}
          label="Rates assumed"
        />
      </div>

      <div className="px-3.5 py-2">
        <div className="flex items-baseline justify-between gap-4 pb-1.5 text-[12px] text-muted">
          <span>{basisLabel}</span>
          <MoneyText centavos={basisCentavos} className="text-ink" />
        </div>

        {rows.length === 0 ? (
          <p className="py-2 text-[12.5px] text-muted">
            No upline on this contract — nothing to split.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft border-t border-line-soft">
            {rows.map((r) => (
              <li key={r.level} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-ink">
                    {agentNameOf(r.agentId)}
                  </span>
                  <span className="block text-[11.5px] text-muted">
                    {LEVEL_NAMES[r.level]} · {formatPercent(r.ratePercent, 0)}
                  </span>
                </span>
                <MoneyText centavos={r.amountCentavos} className="text-[13px] text-ink" />
              </li>
            ))}
          </ul>
        )}

        <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t border-line pt-1.5">
          <span className="text-[12.5px] font-medium text-ink">Total commission</span>
          <MoneyText centavos={total} className="text-[13.5px] font-medium text-ink" />
        </div>
      </div>
    </div>
  )
}

/** The 20% perpetual-care accrual. ADDITIVE — never taken off a balance. */
export function TrustFundNote({
  amountCentavos,
  className,
}: {
  amountCentavos?: Centavos
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-[var(--radius-card)] border border-green/35 bg-green/8 p-3',
        className,
      )}
    >
      <Icon icon={IconTrustFund} size={17} className="mt-0.5 text-green" />
      <div className="min-w-0 text-[12.5px] leading-snug text-ink">
        {amountCentavos !== undefined ? (
          <p>
            <MoneyText centavos={amountCentavos} className="font-medium text-green" /> accrues
            to the perpetual care fund.
          </p>
        ) : (
          <p>
            <span className="font-medium">{TRUST_FUND_RATE_PERCENT}% of each payment</span>{' '}
            will accrue to the perpetual care fund.
          </p>
        )}
      </div>
    </div>
  )
}
