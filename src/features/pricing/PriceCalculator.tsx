import { useEffect, useMemo, useState } from 'react'
import {
  ASSUMPTIONS,
  COMMISSION_LEVELS,
  INSTALLMENT_TERM_OPTIONS,
  isPaymentModeAllowed,
  NEED_TYPE_LABEL,
  PAYMENT_MODE_LABEL,
  TOTAL_COMMISSION_PERCENT,
  TRUST_FUND_RATE_PERCENT,
  type ISODate,
  type NeedType,
  type PaymentMode,
  type TierId,
} from '@/domain'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Icon } from '@/components/ui-brand/Icon'
import { IconCalculator, IconFlag } from '@/components/ui-brand/icons'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { buildSchedule } from '@/lib/amortization'
import { ruleFor } from '@/lib/commission'
import { formatPeso, formatPercent, pctOf } from '@/lib/money'
import { dataset } from '@/stores/dataset'
import { usePricing } from '@/stores/pricing'
import { TierSwatch } from './TierPreview'
import { cn } from '@/lib/utils'

/**
 * The panel the client reaches for in the meeting. Every figure here is
 * computed by the same layer the real contract uses — the commission split
 * and the trust-fund accrual are not restated here, they are imported.
 */
export function PriceCalculator({ asOf }: { asOf: ISODate }) {
  const tiers = usePricing((s) => s.tiers)()
  const bookVersion = usePricing((s) => s.bookVersion)
  const priceAt = usePricing((s) => s.priceAt)

  const [tierId, setTierId] = useState<TierId>(tiers[0]!.id)
  const [needType, setNeedType] = useState<NeedType>('pre_need')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('installment')
  const [term, setTerm] = useState<number>(24)

  useEffect(() => {
    if (!isPaymentModeAllowed(needType, paymentMode)) setPaymentMode('spot_cash')
  }, [needType, paymentMode])

  const resolved = useMemo(
    () => priceAt(tierId, needType, paymentMode, asOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tierId, needType, paymentMode, asOf, bookVersion],
  )

  const price = resolved.amountCentavos
  const isInstallment = paymentMode === 'installment'

  const schedule = useMemo(
    () =>
      price === null || !isInstallment
        ? []
        : buildSchedule({
            contractPriceCentavos: price,
            termMonths: term,
            signedAt: asOf,
          }),
    [price, isInstallment, term, asOf],
  )

  const monthly = schedule.length > 1 ? schedule[1]!.amountDueCentavos : null
  const firstPayment = schedule.length > 0 ? schedule[0]!.amountDueCentavos : null

  // 20% of every payment accrues to the trust fund, so across the life of
  // the contract it is 20% of the whole contract price.
  const trustFund = price === null ? null : pctOf(price, TRUST_FUND_RATE_PERCENT)

  const rules = dataset().commissionRules
  const commissionRows = COMMISSION_LEVELS.map((level) => {
    const rate = ruleFor(rules, level, asOf)?.ratePercent ?? 0
    return {
      level,
      label: ASSUMPTIONS.commissionLevelNames.value[level],
      rate,
      amount: price === null ? null : pctOf(price, rate),
    }
  })
  const commissionTotal =
    price === null ? null : pctOf(price, TOTAL_COMMISSION_PERCENT)

  return (
    <aside className="h-fit rounded-[var(--radius-card)] border border-line bg-surface xl:sticky xl:top-6">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Icon icon={IconCalculator} size={17} className="text-gold-deep dark:text-gold" />
        <div>
          <p className="text-[14px] font-semibold text-ink">Price calculator</p>
          <p className="text-[11.5px] text-muted">
            Resolved for {NEED_TYPE_LABEL[needType].toLowerCase()} as of the page date
          </p>
        </div>
      </header>

      <div className="space-y-3.5 p-4">
        <div>
          <Label className="eyebrow mb-1.5 block text-muted">Lot type</Label>
          <Select value={tierId} onValueChange={(v) => setTierId(v as TierId)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <TierSwatch appearance={t.appearance} size={11} />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="eyebrow mb-1.5 block text-muted">Need type</Label>
            <RadioGroup
              value={needType}
              onValueChange={(v) => setNeedType(v as NeedType)}
              className="gap-1.5"
            >
              {(['pre_need', 'at_need'] as NeedType[]).map((n) => (
                <label key={n} className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <RadioGroupItem value={n} />
                  {NEED_TYPE_LABEL[n]}
                </label>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label className="eyebrow mb-1.5 block text-muted">Payment</Label>
            <RadioGroup
              value={paymentMode}
              onValueChange={(v) => setPaymentMode(v as PaymentMode)}
              className="gap-1.5"
            >
              {(['spot_cash', 'installment'] as PaymentMode[]).map((m) => {
                const allowed = isPaymentModeAllowed(needType, m)
                return (
                  <label
                    key={m}
                    className={cn(
                      'flex items-center gap-2 text-[13px]',
                      allowed ? 'cursor-pointer' : 'cursor-not-allowed text-muted',
                    )}
                    title={allowed ? undefined : 'At-need is spot cash only.'}
                  >
                    <RadioGroupItem value={m} disabled={!allowed} />
                    {PAYMENT_MODE_LABEL[m]}
                  </label>
                )
              })}
            </RadioGroup>
          </div>
        </div>

        {isInstallment && (
          <div>
            <Label className="eyebrow mb-1.5 block text-muted">Term</Label>
            <Select value={String(term)} onValueChange={(v) => setTerm(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INSTALLMENT_TERM_OPTIONS.map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    {t} months
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Separator />

      <div className="p-4">
        {price === null ? (
          <div className="rounded-md border border-line bg-surface-2 px-3 py-4 text-center">
            <p className="text-[13.5px] italic text-muted">Contact for pricing</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              No entry matches this combination on {' '}
              {NEED_TYPE_LABEL[needType].toLowerCase()} ·{' '}
              {PAYMENT_MODE_LABEL[paymentMode].toLowerCase()}. Nothing is
              substituted from another tier or mode.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="eyebrow text-muted">Resolved price</span>
              <span className="flex items-baseline gap-1.5">
                {resolved.isPromo && (
                  <Icon
                    icon={IconFlag}
                    size={13}
                    className="translate-y-px text-gold-deep dark:text-gold"
                  />
                )}
                <MoneyText
                  centavos={price}
                  className={cn(
                    'font-display text-[26px] font-semibold leading-none',
                    resolved.isPromo && 'text-gold-deep dark:text-gold',
                  )}
                />
              </span>
            </div>
            {resolved.isPromo && resolved.listEntry?.amountCentavos != null && (
              <p className="tabular mt-1 text-right text-[12px] text-muted">
                <span className="line-through">
                  {formatPeso(resolved.listEntry.amountCentavos)}
                </span>{' '}
                list · saving{' '}
                <span className="font-medium text-green">
                  {formatPeso(resolved.savingCentavos)}
                </span>
              </p>
            )}

            <dl className="mt-3.5 space-y-1.5 text-[13px]">
              {isInstallment && monthly !== null && (
                <>
                  <Line
                    label={`Monthly × ${term}`}
                    value={<MoneyText centavos={monthly} />}
                  />
                  {firstPayment !== monthly && (
                    <Line
                      label="First installment"
                      value={<MoneyText centavos={firstPayment} />}
                      hint="Carries the rounding remainder"
                    />
                  )}
                </>
              )}
              <Line
                label="Contract total"
                value={<MoneyText centavos={price} className="font-medium" />}
              />
              {isInstallment && (
                <p className="flex items-center gap-1.5 pt-0.5 text-[11.5px] text-muted">
                  No interest or installment premium
                  <AssumedChip why={ASSUMPTIONS.interest.why} />
                </p>
              )}
            </dl>

            <Separator className="my-3.5" />

            <p className="eyebrow mb-2 text-muted">
              Trust fund · {formatPercent(TRUST_FUND_RATE_PERCENT, 0)} of every payment
            </p>
            <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[12.5px] text-muted">
                  Accrued across the contract's life
                </span>
                <MoneyText
                  centavos={trustFund}
                  className="font-display text-[18px] font-semibold text-green"
                />
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                Additive — it is not deducted from the contract or the
                commission basis.
              </p>
            </div>

            <Separator className="my-3.5" />

            <p className="eyebrow mb-2 flex items-center gap-1.5 text-muted">
              Commission · {formatPercent(TOTAL_COMMISSION_PERCENT, 0)} total
              <AssumedChip why={ASSUMPTIONS.commissionRates.why} />
            </p>
            <dl className="space-y-1.5 text-[13px]">
              {commissionRows.map((r) => (
                <Line
                  key={r.level}
                  label={`${r.label} · ${formatPercent(r.rate, 0)}`}
                  value={<MoneyText centavos={r.amount} />}
                />
              ))}
              <div className="flex items-baseline justify-between border-t border-line-soft pt-1.5">
                <dt className="text-[12.5px] text-muted">Total commission</dt>
                <dd>
                  <MoneyText centavos={commissionTotal} className="font-medium" />
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Commission is earned on collection, never at signing — these are
              the amounts released across the life of the contract.
            </p>
          </>
        )}
      </div>
    </aside>
  )
}

function Line({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12.5px] text-muted">
        {label}
        {hint && <span className="ml-1 text-[11px] opacity-80">({hint})</span>}
      </dt>
      <dd className="tabular">{value}</dd>
    </div>
  )
}
