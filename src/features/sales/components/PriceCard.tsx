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
        'rounded-[var(--radius-card)] border bg-surface-2 p-4',
        resolved.isPromo ? 'border-gold/55' : 'border-line',
        className,
      )}
    >
      <p className="eyebrow text-gold-deep dark:text-gold">
        {tierName} · {NEED_TYPE_LABEL[needType]} · {PAYMENT_MODE_LABEL[paymentMode]}
      </p>

      {missing ? (
        <div className="mt-3 flex items-start gap-2 text-body text-muted">
          <Icon icon={IconWarning} size={16} className="mt-0.5 text-danger" />
          <span>
            <span className="font-medium text-ink">Contact for pricing.</span> No
            price-book entry covers this combination as of {fmtDate(asOf)}. The
            resolver never substitutes another tier or mode.
          </span>
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-1.5">
            {resolved.isPromo && resolved.listEntry?.amountCentavos != null && (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-caption text-muted">List price</span>
                  <MoneyText
                    centavos={resolved.listEntry.amountCentavos}
                    className="text-body text-muted line-through"
                  />
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-caption text-muted">
                    {resolved.label}
                    <span className="rounded border border-gold/45 bg-gold/12 px-1.5 py-px text-micro font-semibold uppercase tracking-[0.06em] text-gold-deep dark:text-gold">
                      Promo
                    </span>
                  </span>
                  <MoneyText
                    centavos={-resolved.savingCentavos}
                    className="text-body text-green"
                  />
                </div>
              </>
            )}
          </div>

          <div className="mt-2.5 flex items-baseline justify-between gap-4 border-t border-line pt-2.5">
            <span className="text-caption font-medium text-ink">Lot price</span>
            <MoneyText
              centavos={resolved.amountCentavos}
              className="font-display text-section-title font-semibold text-ink"
            />
          </div>

          <p className="mt-2.5 text-caption text-muted">
            Priced from{' '}
            <span className="text-ink">“{resolved.entry?.label ?? 'unlabelled entry'}”</span>
            , effective {fmtDate(resolved.entry?.effectiveFrom)}
            {resolved.entry?.effectiveTo
              ? ` until ${fmtDate(resolved.entry.effectiveTo)}`
              : ''}
            . <span className="font-mono text-micro">{resolved.entry?.id}</span>
          </p>
          {resolved.entry?.note && (
            <p className="mt-1 text-caption text-muted">
              {resolved.entry.note}
            </p>
          )}
        </>
      )}
    </div>
  )
}
