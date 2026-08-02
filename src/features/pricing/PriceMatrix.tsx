import { motion } from 'framer-motion'
import {
  NEED_TYPE_LABEL,
  PAYMENT_MODE_LABEL,
  type ISODate,
  type NeedType,
  type PaymentMode,
  type Tier,
} from '@/domain'
import type { ResolvedPrice } from '@/lib/price-resolver'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon } from '@/components/ui-brand/Icon'
import { IconEdit, IconFlag, IconHistory } from '@/components/ui-brand/icons'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { formatPeso } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { indexes } from '@/stores/dataset'
import { PRICE_COMBINATIONS, usePricing } from '@/stores/pricing'
import { TierSwatch } from './TierPreview'
import type { HistoryTarget } from './PriceHistoryDialog'
import type { SetPricePrefill } from './SetPriceDialog'
import { cn } from '@/lib/utils'

/**
 * The client's price sheet, as of one date. Three columns, because there are
 * exactly three products: pre-need spot cash, pre-need installment, at-need
 * spot cash. At-need installment is not a column — it does not exist.
 */
export function PriceMatrix({
  asOf,
  canManage,
  onOpenHistory,
  onEditPrice,
}: {
  asOf: ISODate
  canManage: boolean
  onOpenHistory: (t: HistoryTarget) => void
  onEditPrice: (p: SetPricePrefill) => void
}) {
  const bookVersion = usePricing((s) => s.bookVersion)
  const catalogVersion = usePricing((s) => s.catalogVersion)
  const matrix = usePricing((s) => s.currentPriceMatrix)(asOf)
  const tiers = usePricing((s) => s.tiers)()
  void bookVersion
  void catalogVersion

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
      <table className="w-full min-w-[620px] border-collapse">
        <thead>
          <tr className="border-b border-line bg-surface-2">
            <th rowSpan={2} className="eyebrow px-4 py-2 text-left align-bottom text-gold-deep dark:text-gold">
              Lot type
            </th>
            <th
              colSpan={2}
              className="eyebrow border-l border-line px-4 pb-1 pt-2 text-center text-gold-deep dark:text-gold"
            >
              {NEED_TYPE_LABEL.pre_need}
            </th>
            <th className="eyebrow border-l border-line px-4 pb-1 pt-2 text-center text-gold-deep dark:text-gold">
              {NEED_TYPE_LABEL.at_need}
            </th>
          </tr>
          <tr className="border-b border-line bg-surface-2">
            {PRICE_COMBINATIONS.map((c, i) => (
              <th
                key={c.key}
                className={cn(
                  'px-4 pb-2 text-center text-[11.5px] font-medium text-muted',
                  (i === 0 || i === 2) && 'border-l border-line',
                )}
              >
                {PAYMENT_MODE_LABEL[c.paymentMode]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, i) => {
            const row = matrix[tier.id] ?? {}
            const allNull = PRICE_COMBINATIONS.every(
              (c) => (row[c.key]?.amountCentavos ?? null) === null,
            )
            return (
              <motion.tr
                key={tier.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.32,
                  ease: [0.22, 1, 0.36, 1],
                  delay: Math.min(i, 12) * 0.04,
                }}
                className="border-b border-line-soft last:border-b-0"
              >
                <td className="px-4 py-3 align-top">
                  <TierIdentity tier={tier} />
                </td>

                {allNull ? (
                  <td
                    colSpan={3}
                    className="border-l border-line px-4 py-3 text-center align-middle"
                  >
                    <ContactForPricing tier={tier} />
                  </td>
                ) : (
                  PRICE_COMBINATIONS.map((c, ci) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-3 align-top',
                        (ci === 0 || ci === 2) && 'border-l border-line',
                      )}
                    >
                      <PriceCell
                        resolved={row[c.key]}
                        tier={tier}
                        needType={c.needType}
                        paymentMode={c.paymentMode}
                        canManage={canManage}
                        onOpenHistory={onOpenHistory}
                        onEditPrice={onEditPrice}
                      />
                    </td>
                  ))
                )}
              </motion.tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TierIdentity({ tier }: { tier: Tier }) {
  return (
    <div className="flex items-start gap-2.5">
      <TierSwatch appearance={tier.appearance} size={15} className="mt-0.5" />
      <div className="min-w-0">
        <p className="text-[14px] font-medium leading-tight text-ink">{tier.name}</p>
        <p className="tabular mt-0.5 text-[11.5px] text-muted">
          {tier.widthM.toFixed(2)} × {tier.lengthM.toFixed(2)} m
        </p>
        <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wide text-muted">
          {tier.code}
        </p>
      </div>
    </div>
  )
}

function ContactForPricing({ tier }: { tier: Tier }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help text-[13.5px] italic text-muted">
          Contact for pricing
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[300px] text-[12.5px] leading-relaxed">
        {tier.name} has no price for this combination.
      </TooltipContent>
    </Tooltip>
  )
}

function PriceCell({
  resolved,
  tier,
  needType,
  paymentMode,
  canManage,
  onOpenHistory,
  onEditPrice,
}: {
  resolved: ResolvedPrice | undefined
  tier: Tier
  needType: NeedType
  paymentMode: PaymentMode
  canManage: boolean
  onOpenHistory: (t: HistoryTarget) => void
  onEditPrice: (p: SetPricePrefill) => void
}) {
  const r = resolved

  const actions = (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/cell:opacity-100 focus-within:opacity-100">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted hover:text-ink"
            onClick={() => onOpenHistory({ tier, needType, paymentMode })}
            aria-label="Price history"
          >
            <Icon icon={IconHistory} size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Price history</TooltipContent>
      </Tooltip>
      {canManage && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted hover:text-ink"
              onClick={() => onEditPrice({ tierId: tier.id, needType, paymentMode })}
              aria-label="Set price"
            >
              <Icon icon={IconEdit} size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Set a new price</TooltipContent>
        </Tooltip>
      )}
    </div>
  )

  if (!r || r.amountCentavos === null) {
    return (
      <div className="group/cell flex items-start justify-between gap-1">
        <ContactForPricing tier={tier} />
        {actions}
      </div>
    )
  }

  const setter = r.entry ? indexes().usersById.get(r.entry.createdByUserId) : null

  return (
    <div className="group/cell flex items-start justify-between gap-1">
      <HoverCard openDelay={120}>
        <HoverCardTrigger asChild>
          <div className="cursor-help">
            <p className="flex items-baseline gap-1.5">
              <MoneyText
                centavos={r.amountCentavos}
                className={cn(
                  'font-display text-[21px] font-semibold leading-none',
                  r.isPromo && 'text-gold-deep dark:text-gold',
                )}
              />
              {r.isPromo && (
                <Icon
                  icon={IconFlag}
                  size={13}
                  className="translate-y-px text-gold-deep dark:text-gold"
                />
              )}
            </p>
            {r.isPromo && r.listEntry?.amountCentavos != null && (
              <p className="tabular mt-1 text-[12.5px] text-muted line-through">
                {formatPeso(r.listEntry.amountCentavos)}
              </p>
            )}
            {!r.isPromo && r.label && (
              <p className="mt-1 max-w-[13ch] truncate text-[11.5px] text-muted">
                {r.label}
              </p>
            )}
          </div>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-[290px]">
          <p className="text-[13px] font-semibold text-ink">
            {r.label ?? 'Unlabelled entry'}
          </p>
          <p className="tabular mt-1 text-[12px] text-muted">
            {fmtDate(r.entry!.effectiveFrom)} →{' '}
            {r.entry!.effectiveTo ? fmtDate(r.entry!.effectiveTo) : 'open'}
          </p>
          {r.isPromo && r.listEntry?.amountCentavos != null && (
            <p className="mt-2 text-[12.5px]">
              <span className="text-muted">List price </span>
              <span className="tabular line-through">
                {formatPeso(r.listEntry.amountCentavos)}
              </span>
              <span className="text-muted"> · saving </span>
              <span className="tabular font-medium text-green">
                {formatPeso(r.savingCentavos)}
              </span>
            </p>
          )}
          <p className="mt-2 border-t border-line-soft pt-2 text-[11.5px] text-muted">
            Set by {setter?.fullName ?? 'system'}
          </p>
          {r.entry?.note && (
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              {r.entry.note}
            </p>
          )}
        </HoverCardContent>
      </HoverCard>

      {actions}
    </div>
  )
}
