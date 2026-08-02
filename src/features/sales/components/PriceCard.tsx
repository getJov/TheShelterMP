import {
  NEED_TYPE_LABEL,
  PAYMENT_MODE_LABEL,
  type ISODate,
  type NeedType,
  type PaymentMode,
} from '@/domain'
import type { ResolvedPrice } from '@/lib/price-resolver'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import { IconWarning } from '@/components/ui-brand/icons'
import { fmtDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

/**
 * "How do you make sure the right price is used?" was the client's own
 * question. The answer is this card: it names the price-book entry, the
 * effectivity date and the promo that won, live, while the terms are chosen.
 */
export function PriceCard({
  resolved,
  tierName,
  needType,
  paymentMode,
  asOf,
  className,
}: {
  resolved: ResolvedPrice
  tierName: string
  needType: NeedType
  paymentMode: PaymentMode
  asOf: ISODate
  className?: string
}) {
  const missing = resolved.amountCentavos === null

  return (
    <div
      className={cn(
        'min-w-0 rounded-[var(--radius-card)] border bg-surface-2 p-4',
        resolved.isPromo ? 'border-gold/55' : 'border-line',
        className,
      )}
    >
      <p className="eyebrow break-words leading-relaxed text-gold-deep dark:text-gold">
        {tierName} · {NEED_TYPE_LABEL[needType]} · {PAYMENT_MODE_LABEL[paymentMode]}
      </p>

      {missing ? (
        <div className="mt-3 flex items-start gap-2 text-body text-muted">
          <Icon icon={IconWarning} size={16} className="mt-0.5 shrink-0 text-danger" />
          <span className="min-w-0 break-words">
            <span className="font-medium text-ink">Contact for pricing.</span> No
            price-book entry covers this combination as of {fmtDate(asOf)}. The
            resolver never substitutes another tier or mode.
          </span>
        </div>
      ) : (
        <>
          <dl className="mt-3 space-y-1.5">
            {resolved.isPromo && resolved.listEntry?.amountCentavos != null && (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                  <dt className="min-w-0 break-words text-caption text-muted">
                    List price
                  </dt>
                  <dd className="m-0 text-right">
                    <MoneyText
                      centavos={resolved.listEntry.amountCentavos}
                      className="whitespace-nowrap text-body text-muted line-through"
                    />
                  </dd>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <dt className="flex min-w-0 flex-wrap items-center gap-1.5 text-caption text-muted">
                    {resolved.label}
                    <span className="rounded border border-gold/45 bg-gold/12 px-1.5 py-px text-micro font-semibold uppercase tracking-[0.06em] text-gold-deep dark:text-gold">
                      Promo
                    </span>
                  </dt>
                  <dd className="m-0 text-right">
                    <MoneyText
                      centavos={-resolved.savingCentavos}
                      className="whitespace-nowrap text-body text-green"
                    />
                  </dd>
                </div>
              </>
            )}

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-t border-line pt-2.5">
              <dt className="min-w-0 break-words text-caption font-medium text-ink">
                Lot price
              </dt>
              <dd className="m-0 min-w-0 text-right">
                <MoneyText
                  centavos={resolved.amountCentavos}
                  className="whitespace-nowrap font-display text-section-title font-semibold leading-none text-ink"
                />
              </dd>
            </div>
          </dl>

          <p className="mt-2.5 break-words text-caption leading-snug text-muted">
            Priced from{' '}
            <span className="text-ink">“{resolved.entry?.label ?? 'unlabelled entry'}”</span>
            , effective {fmtDate(resolved.entry?.effectiveFrom)}
            {resolved.entry?.effectiveTo
              ? ` until ${fmtDate(resolved.entry.effectiveTo)}`
              : ''}
            .{' '}
            <span className="break-all font-mono text-micro">
              {resolved.entry?.id}
            </span>
          </p>
          {resolved.entry?.note && (
            <p className="mt-1 break-words text-caption leading-snug text-muted">
              {resolved.entry.note}
            </p>
          )}
        </>
      )}
    </div>
  )
}
