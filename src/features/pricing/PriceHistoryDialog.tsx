import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  NEED_TYPE_LABEL,
  PAYMENT_MODE_LABEL,
  type ISODate,
  type NeedType,
  type PaymentMode,
  type PriceBookEntry,
  type Tier,
} from '@/domain'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Icon } from '@/components/ui-brand/Icon'
import { IconChevronRight, IconFlag } from '@/components/ui-brand/icons'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { IconHistory } from '@/components/ui-brand/icons'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { formatPeso } from '@/lib/money'
import { fmtDate, fmtDateTime } from '@/lib/dates'
import { resolvePrice } from '@/lib/price-resolver'
import { indexes } from '@/stores/dataset'
import { usePricing } from '@/stores/pricing'
import { TierSwatch } from './TierPreview'
import { cn } from '@/lib/utils'

export interface HistoryTarget {
  tier: Tier
  needType: NeedType
  paymentMode: PaymentMode
}

export function PriceHistoryDialog({
  target,
  asOf,
  onClose,
}: {
  target: HistoryTarget | null
  asOf: ISODate
  onClose: () => void
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        {target && <HistoryBody target={target} asOf={asOf} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function HistoryBody({
  target,
  asOf,
  onClose,
}: {
  target: HistoryTarget
  asOf: ISODate
  onClose: () => void
}) {
  const bookVersion = usePricing((s) => s.bookVersion)
  const history = usePricing((s) => s.priceHistory)
  const contractsAtPrice = usePricing((s) => s.contractsAtPrice)
  const prices = usePricing((s) => s.prices)
  const navigate = useNavigate()

  const entries = useMemo(
    () => history(target.tier.id, target.needType, target.paymentMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target.tier.id, target.needType, target.paymentMode, bookVersion, history],
  )

  const series = useMemo(() => {
    const book = prices()
    const bounds = new Set<ISODate>()
    for (const e of entries) {
      bounds.add(e.effectiveFrom)
      if (e.effectiveTo) bounds.add(e.effectiveTo)
    }
    if (bounds.size === 0) return []
    const sorted = [...bounds].sort()
    // Carry the open-ended row forward so the current generation has a run.
    const last = sorted[sorted.length - 1]!
    const tail = `${Number(last.slice(0, 4)) + 1}${last.slice(4)}`
    sorted.push(tail)
    return sorted.map((d) => {
      const r = resolvePrice(
        book,
        target.tier.id,
        target.needType,
        target.paymentMode,
        d,
      )
      return {
        date: d,
        pesos: r.amountCentavos === null ? null : r.amountCentavos / 100,
        isPromo: r.isPromo,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, bookVersion, target.tier.id, target.needType, target.paymentMode])

  const hasChart = series.some((p) => p.pesos !== null)
  const current = resolvePrice(
    prices(),
    target.tier.id,
    target.needType,
    target.paymentMode,
    asOf,
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <TierSwatch appearance={target.tier.appearance} size={13} />
          {target.tier.name}
        </DialogTitle>
        <DialogDescription>
          {NEED_TYPE_LABEL[target.needType]} ·{' '}
          {PAYMENT_MODE_LABEL[target.paymentMode]} · Newest first
        </DialogDescription>
      </DialogHeader>

      {hasChart ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-3">
          <p className="eyebrow mb-2 text-muted">Price over time</p>
          <div style={{ height: 168 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="var(--color-line)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => v.slice(0, 7)}
                  tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                  stroke="var(--color-line)"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                  stroke="var(--color-line)"
                  width={54}
                  tickFormatter={(v: number) => formatPeso(v * 100, { compact: true })}
                />
                <RTooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-line)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => fmtDate(String(v))}
                  formatter={(v: number | string) => [
                    formatPeso(Number(v) * 100),
                    'In force',
                  ]}
                />
                <Line
                  type="stepAfter"
                  dataKey="pesos"
                  stroke="var(--color-gold-deep)"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: 'var(--color-gold-deep)', strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface-2">
          <EmptyState
            compact
            icon={IconHistory}
            title="No amount on file"
            body="This combination has never carried a price. It resolves to “Contact for pricing”."
          />
        </div>
      )}

      <ScrollArea className="max-h-[320px]">
        <ul className="space-y-2 pr-3">
          {entries.map((e) => (
            <HistoryRow
              key={e.id}
              entry={e}
              inForce={current.entry?.id === e.id}
              contracts={contractsAtPrice(e.id)}
              onOpenContracts={() => {
                onClose()
                navigate(`/sales?priceEntry=${e.id}`)
              }}
            />
          ))}
          {entries.length === 0 && (
            <li className="py-6 text-center text-[13px] text-muted">
              No price book entries for this combination.
            </li>
          )}
        </ul>
      </ScrollArea>
    </>
  )
}

function HistoryRow({
  entry,
  inForce,
  contracts,
  onOpenContracts,
}: {
  entry: PriceBookEntry
  inForce: boolean
  contracts: number
  onOpenContracts: () => void
}) {
  const setter = indexes().usersById.get(entry.createdByUserId)

  return (
    <li
      className={cn(
        'rounded-[var(--radius-card)] border p-3 transition-colors',
        inForce
          ? 'border-gold/60 bg-gold/8'
          : 'border-line bg-surface opacity-80',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MoneyText
              centavos={entry.amountCentavos}
              className="font-display text-[19px] font-semibold"
            />
            {entry.amountCentavos === null && (
              <span className="text-[13px] text-muted">Contact for pricing</span>
            )}
            {entry.isPromo && (
              <Badge
                variant="outline"
                className="gap-1 border-gold/60 text-gold-deep dark:text-gold"
              >
                <Icon icon={IconFlag} size={11} />
                Promo
              </Badge>
            )}
            {inForce && (
              <Badge variant="outline" className="border-green/60 text-green">
                In force
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-ink">{entry.label ?? '—'}</p>
          <p className="tabular mt-1 text-[12px] text-muted">
            {fmtDate(entry.effectiveFrom)} →{' '}
            {entry.effectiveTo ? fmtDate(entry.effectiveTo) : 'open'}
          </p>
          {entry.note && (
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{entry.note}</p>
          )}
          <p className="mt-1 text-[11.5px] text-muted">
            Set by {setter?.fullName ?? 'system'} · {fmtDateTime(entry.createdAt)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="eyebrow text-muted">Contracts sold</p>
          <p className="tabular font-display text-[22px] leading-tight text-ink">
            {contracts}
          </p>
          {contracts > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-0.5 h-7 gap-1 px-1.5 text-[12px] text-gold-deep dark:text-gold"
              onClick={onOpenContracts}
            >
              View in sales
              <Icon icon={IconChevronRight} size={13} />
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}
