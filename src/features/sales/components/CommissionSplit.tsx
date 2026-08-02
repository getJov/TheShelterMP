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
    <div
      className={cn(
        'min-w-0 rounded-[var(--radius-card)] border border-line bg-surface',
        className,
      )}
    >
      <div className="flex flex-col items-start gap-1.5 border-b border-line px-3.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="eyebrow break-words leading-relaxed text-gold-deep dark:text-gold">
          Commission split · {formatPercent(TOTAL_COMMISSION_PERCENT, 0)} total
        </span>
        <AssumedChip
          why={ASSUMPTIONS.commissionRates.why}
          label="Rates assumed"
          className="shrink-0"
        />
      </div>

      <div className="px-3.5 py-2">
        <dl className="pb-1.5 text-[12px] text-muted">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
            <dt className="min-w-0 break-words">{basisLabel}</dt>
            <dd className="m-0 text-right">
              <MoneyText
                centavos={basisCentavos}
                className="whitespace-nowrap text-ink"
              />
            </dd>
          </div>
        </dl>

        {rows.length === 0 ? (
          <p className="break-words py-2 text-[12.5px] text-muted">
            No upline on this contract — nothing to split.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft border-t border-line-soft">
            {rows.map((r) => (
              <li
                key={r.level}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-2 sm:items-center sm:py-1.5"
              >
                <span className="min-w-0">
                  <span className="block break-words text-[13px] text-ink sm:truncate">
                    {agentNameOf(r.agentId)}
                  </span>
                  <span className="block text-[11.5px] text-muted">
                    {LEVEL_NAMES[r.level]} · {formatPercent(r.ratePercent, 0)}
                  </span>
                </span>
                <MoneyText
                  centavos={r.amountCentavos}
                  className="whitespace-nowrap text-right text-[13px] text-ink"
                />
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-1.5 border-t border-line pt-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
            <dt className="min-w-0 break-words text-[12.5px] font-medium text-ink">
              Total commission
            </dt>
            <dd className="m-0 text-right">
              <MoneyText
                centavos={total}
                className="whitespace-nowrap text-[13.5px] font-medium text-ink"
              />
            </dd>
          </div>
        </dl>
        <p className="mt-1.5 break-words text-[11.5px] leading-snug text-muted">
          Earned as payments are collected, never at signing. The basis is the full
          payment — the trust-fund accrual is not deducted from it.
        </p>
      </div>
    </div>
  )
}

/** The 20% perpetual-care accrual. ADDITIVE — never taken off a balance. */
export function TrustFundNote({
  amountCentavos,
  className,
  compact,
}: {
  amountCentavos?: Centavos
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-start gap-2.5 rounded-[var(--radius-card)] border border-green/35 bg-green/8 p-3',
        className,
      )}
    >
      <Icon icon={IconTrustFund} size={17} className="mt-0.5 shrink-0 text-green" />
      <div className="min-w-0 break-words text-[12.5px] leading-snug text-ink">
        {amountCentavos !== undefined ? (
          <p>
            <MoneyText
              centavos={amountCentavos}
              className="whitespace-nowrap font-medium text-green"
            />{' '}
            accrues to the perpetual care fund.
          </p>
        ) : (
          <p>
            <span className="font-medium">{TRUST_FUND_RATE_PERCENT}% of each payment</span>{' '}
            will accrue to the perpetual care fund.
          </p>
        )}
        {!compact && (
          <p className="mt-0.5 text-muted">
            Added to a running total — it is not deducted from the balance, the contract
            price or the commission basis.
          </p>
        )}
      </div>
    </div>
  )
}
