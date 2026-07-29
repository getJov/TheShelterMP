import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  isPaymentModeAllowed,
  NEED_TYPE_LABEL,
  PAYMENT_MODE_LABEL,
  type Centavos,
  type ISODate,
  type NeedType,
  type PaymentMode,
  type TierId,
} from '@/domain'
import { TODAY } from '@/mock'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Icon } from '@/components/ui-brand/Icon'
import { IconArrowRight, IconInfo, IconWarning } from '@/components/ui-brand/icons'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { formatPeso, parsePeso } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { useCurrentUser } from '@/lib/permissions'
import {
  PRICE_COMBINATIONS,
  usePricing,
  type PriceMutation,
  type SetPriceInput,
} from '@/stores/pricing'
import { DateField } from './DateField'
import { TierSwatch } from './TierPreview'
import { cn } from '@/lib/utils'

export interface SetPricePrefill {
  tierId: TierId
  needType: NeedType
  paymentMode: PaymentMode
}

export function SetPriceDialog({
  open,
  onOpenChange,
  asOf,
  prefill,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  asOf: ISODate
  prefill?: SetPricePrefill | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Set a price</DialogTitle>
          <DialogDescription>
            The price book is append-only. Confirming closes the entry in force
            and appends a new one — the old amount stays readable forever, and
            every contract already signed keeps the price it was sold at.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="single">
          <TabsList className="w-full">
            <TabsTrigger value="single" className="flex-1">
              One price
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex-1">
              Bulk adjustment
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="mt-4">
            <SingleForm
              asOf={asOf}
              prefill={prefill}
              open={open}
              onDone={() => onOpenChange(false)}
            />
          </TabsContent>

          <TabsContent value="bulk" className="mt-4">
            <BulkForm asOf={asOf} onDone={() => onOpenChange(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ── undo toast ───────────────────────────────────────────────────────
function toastWithUndo(message: string, description: string, undo: () => void) {
  toast.success(message, {
    description,
    duration: 10_000,
    action: {
      label: 'Undo',
      onClick: undo,
    },
  })
}

// ── single ───────────────────────────────────────────────────────────
function SingleForm({
  asOf,
  prefill,
  open,
  onDone,
}: {
  asOf: ISODate
  prefill?: SetPricePrefill | null
  open: boolean
  onDone: () => void
}) {
  const user = useCurrentUser()
  const tiers = usePricing((s) => s.tiers)()
  const bookVersion = usePricing((s) => s.bookVersion)
  const priceAt = usePricing((s) => s.priceAt)
  const setPrice = usePricing((s) => s.setPrice)
  const undoSetPrice = usePricing((s) => s.undoSetPrice)
  const lotCountsForTier = usePricing((s) => s.lotCountsForTier)
  const activeContractsForTier = usePricing((s) => s.activeContractsForTier)

  const [tierId, setTierId] = useState<TierId>(
    prefill?.tierId ?? (tiers[0]?.id as TierId),
  )
  const [needType, setNeedType] = useState<NeedType>(prefill?.needType ?? 'pre_need')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    prefill?.paymentMode ?? 'spot_cash',
  )
  const [amountText, setAmountText] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState<ISODate>(TODAY)
  const [label, setLabel] = useState('')
  const [isPromo, setIsPromo] = useState(false)
  const [promoEndsOn, setPromoEndsOn] = useState<ISODate | null>(null)

  // Re-seed when the dialog opens from a specific matrix cell.
  useEffect(() => {
    if (!open) return
    if (prefill) {
      setTierId(prefill.tierId)
      setNeedType(prefill.needType)
      setPaymentMode(prefill.paymentMode)
    }
    setAmountText('')
    setEffectiveFrom(TODAY)
    setLabel('')
    setIsPromo(false)
    setPromoEndsOn(null)
  }, [open, prefill])

  // At-need is spot cash only — the client was explicit.
  useEffect(() => {
    if (!isPaymentModeAllowed(needType, paymentMode)) setPaymentMode('spot_cash')
  }, [needType, paymentMode])

  const tier = tiers.find((t) => t.id === tierId)
  const amountCentavos = parsePeso(amountText)
  const amountValid = amountCentavos !== null && amountCentavos > 0

  const currentAtFrom = useMemo(
    () => priceAt(tierId, needType, paymentMode, effectiveFrom),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tierId, needType, paymentMode, effectiveFrom, bookVersion],
  )

  const inventory = lotCountsForTier(tierId)
  const contracts = activeContractsForTier(tierId, needType, paymentMode)
  const isPast = effectiveFrom < TODAY
  const promoEndInvalid = isPromo && promoEndsOn !== null && promoEndsOn <= effectiveFrom

  function submit() {
    if (!amountValid || !tier) return
    const input: SetPriceInput = {
      tierId,
      needType,
      paymentMode,
      amountCentavos,
      effectiveFrom,
      label: label || (isPromo ? 'Promotional price' : null),
      isPromo,
      promoEndsOn: isPromo ? promoEndsOn : null,
    }
    const mutation = setPrice(input, user.id)
    toastWithUndo(
      `${tier.name} — ${NEED_TYPE_LABEL[needType]} ${PAYMENT_MODE_LABEL[paymentMode].toLowerCase()} is now ${formatPeso(amountCentavos)}`,
      `Effective ${fmtDate(effectiveFrom)}. The superseded entry was closed, not edited.`,
      () => undoSetPrice([mutation]),
    )
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Lot type">
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
        </Field>

        <Field label="Amount">
          <Input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="₱60,000"
            inputMode="decimal"
            className="tabular"
          />
        </Field>

        <Field label="Need type">
          <RadioGroup
            value={needType}
            onValueChange={(v) => setNeedType(v as NeedType)}
            className="flex gap-4 pt-1"
          >
            {(['pre_need', 'at_need'] as NeedType[]).map((n) => (
              <label key={n} className="flex cursor-pointer items-center gap-2 text-[13.5px]">
                <RadioGroupItem value={n} />
                {NEED_TYPE_LABEL[n]}
              </label>
            ))}
          </RadioGroup>
        </Field>

        <Field label="Payment mode">
          <RadioGroup
            value={paymentMode}
            onValueChange={(v) => setPaymentMode(v as PaymentMode)}
            className="flex gap-4 pt-1"
          >
            {(['spot_cash', 'installment'] as PaymentMode[]).map((m) => {
              const allowed = isPaymentModeAllowed(needType, m)
              return (
                <label
                  key={m}
                  className={cn(
                    'flex items-center gap-2 text-[13.5px]',
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
        </Field>

        <Field label="Effective from">
          <DateField value={effectiveFrom} onChange={(v) => v && setEffectiveFrom(v)} />
        </Field>

        <Field label="Label (optional)">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="2027 List Price"
          />
        </Field>
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13.5px] font-medium text-ink">This is a promotion</p>
            <p className="text-[12px] text-muted">
              A promo layers over the list price instead of replacing it, so the
              list price keeps resolving for installment buyers.
            </p>
          </div>
          <Switch checked={isPromo} onCheckedChange={setIsPromo} />
        </div>
        {isPromo && (
          <div className="mt-3 max-w-[240px]">
            <Label className="eyebrow mb-1.5 block text-muted">Promo ends on</Label>
            <DateField
              value={promoEndsOn}
              onChange={setPromoEndsOn}
              clearable
              placeholder="No end date"
            />
            {promoEndInvalid && (
              <p className="mt-1 text-[12px] text-danger">
                The end date must fall after the start date.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── blast radius ─────────────────────────────────────────── */}
      <BeforeAfter
        currentCentavos={currentAtFrom.amountCentavos}
        nextCentavos={amountValid ? amountCentavos : null}
        effectiveFrom={effectiveFrom}
        contracts={contracts}
        availableLots={inventory.byStatus.available}
      />

      {isPast && (
        <Callout tone="warn">
          {fmtDate(effectiveFrom)} is in the past. Back-dating rewrites which
          entry resolves for that window — it does not change any contract
          already signed, but check that is what you meant.
        </Callout>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!amountValid || promoEndInvalid}>
          Append price entry
        </Button>
      </DialogFooter>
    </div>
  )
}

// ── bulk ─────────────────────────────────────────────────────────────
type AdjustKind = 'percent' | 'fixed'
type AdjustDir = 'increase' | 'decrease'

function BulkForm({ asOf, onDone }: { asOf: ISODate; onDone: () => void }) {
  const user = useCurrentUser()
  const tiers = usePricing((s) => s.tiers)()
  const bookVersion = usePricing((s) => s.bookVersion)
  const priceAt = usePricing((s) => s.priceAt)
  const setPriceBulk = usePricing((s) => s.setPriceBulk)
  const undoSetPrice = usePricing((s) => s.undoSetPrice)

  const [kind, setKind] = useState<AdjustKind>('percent')
  const [dir, setDir] = useState<AdjustDir>('increase')
  const [valueText, setValueText] = useState('8')
  const [selectedTiers, setSelectedTiers] = useState<TierId[]>(
    tiers.filter((t) => t.category !== 'mausoleum').map((t) => t.id),
  )
  const [selectedCombos, setSelectedCombos] = useState<string[]>(
    PRICE_COMBINATIONS.map((c) => c.key),
  )
  const [effectiveFrom, setEffectiveFrom] = useState<ISODate>('2027-01-01')
  const [label, setLabel] = useState('2027 List Price')

  const numeric = Number(valueText.replace(/[₱,\s%]/g, ''))
  const valid = Number.isFinite(numeric) && numeric > 0

  const preview = useMemo(() => {
    if (!valid) return []
    const rows: {
      tierId: TierId
      tierName: string
      comboKey: string
      comboLabel: string
      needType: NeedType
      paymentMode: PaymentMode
      current: Centavos | null
      next: Centavos | null
    }[] = []
    for (const t of tiers) {
      if (!selectedTiers.includes(t.id)) continue
      for (const c of PRICE_COMBINATIONS) {
        if (!selectedCombos.includes(c.key)) continue
        const r = priceAt(t.id, c.needType, c.paymentMode, effectiveFrom)
        // Never invent a price where none exists — a missing combination
        // stays missing rather than being back-filled from a neighbour.
        let next: Centavos | null = null
        if (r.amountCentavos !== null) {
          const sign = dir === 'increase' ? 1 : -1
          const raw =
            kind === 'percent'
              ? r.amountCentavos * (1 + (sign * numeric) / 100)
              : r.amountCentavos + sign * numeric * 100
          // Round to whole pesos — a price sheet never carries centavos.
          next = Math.max(0, Math.round(raw / 100) * 100)
        }
        rows.push({
          tierId: t.id,
          tierName: t.name,
          comboKey: c.key,
          comboLabel: `${c.group} · ${c.label}`,
          needType: c.needType,
          paymentMode: c.paymentMode,
          current: r.amountCentavos,
          next,
        })
      }
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tiers,
    selectedTiers,
    selectedCombos,
    kind,
    dir,
    numeric,
    valid,
    effectiveFrom,
    bookVersion,
  ])

  const applicable = preview.filter((r) => r.next !== null)

  function submit() {
    const inputs: SetPriceInput[] = applicable.map((r) => ({
      tierId: r.tierId,
      needType: r.needType,
      paymentMode: r.paymentMode,
      amountCentavos: r.next!,
      effectiveFrom,
      label: label || null,
      isPromo: false,
      note: `Bulk ${dir} of ${kind === 'percent' ? `${numeric}%` : formatPeso(numeric * 100)}.`,
    }))
    const mutations: PriceMutation[] = setPriceBulk(inputs, user.id)
    toastWithUndo(
      `${inputs.length} price entries appended`,
      `Effective ${fmtDate(effectiveFrom)}. Every superseded entry was closed, not edited.`,
      () => undoSetPrice(mutations),
    )
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[auto_auto_1fr] items-end gap-3">
        <Field label="Adjustment">
          <ToggleGroup
            type="single"
            variant="outline"
            value={kind}
            onValueChange={(v) => v && setKind(v as AdjustKind)}
          >
            <ToggleGroupItem value="percent">Percent</ToggleGroupItem>
            <ToggleGroupItem value="fixed">Fixed ₱</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field label="Direction">
          <ToggleGroup
            type="single"
            variant="outline"
            value={dir}
            onValueChange={(v) => v && setDir(v as AdjustDir)}
          >
            <ToggleGroupItem value="increase">Increase</ToggleGroupItem>
            <ToggleGroupItem value="decrease">Decrease</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field label={kind === 'percent' ? 'Percent' : 'Amount'}>
          <Input
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
            inputMode="decimal"
            className="tabular"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Effective from">
          <DateField value={effectiveFrom} onChange={(v) => v && setEffectiveFrom(v)} />
        </Field>
        <Field label="Label">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="eyebrow mb-2 text-muted">Lot types</p>
          <div className="space-y-1.5">
            {tiers.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 text-[13px]">
                <Checkbox
                  checked={selectedTiers.includes(t.id)}
                  onCheckedChange={(c) =>
                    setSelectedTiers((s) =>
                      c ? [...s, t.id] : s.filter((x) => x !== t.id),
                    )
                  }
                />
                <TierSwatch appearance={t.appearance} size={11} />
                {t.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow mb-2 text-muted">Combinations</p>
          <div className="space-y-1.5">
            {PRICE_COMBINATIONS.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center gap-2 text-[13px]">
                <Checkbox
                  checked={selectedCombos.includes(c.key)}
                  onCheckedChange={(v) =>
                    setSelectedCombos((s) =>
                      v ? [...s, c.key] : s.filter((x) => x !== c.key),
                    )
                  }
                />
                {c.group} · {c.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] border border-line">
        <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-2">
          <p className="eyebrow text-gold-deep dark:text-gold">Preview</p>
          <p className="text-[12px] text-muted">
            {applicable.length} of {preview.length} rows will be written
          </p>
        </div>
        <ScrollArea className="max-h-[200px]">
          <table className="w-full text-[13px]">
            <tbody>
              {preview.map((r) => (
                <tr key={`${r.tierId}:${r.comboKey}`} className="border-b border-line-soft">
                  <td className="px-3 py-1.5">{r.tierName}</td>
                  <td className="px-3 py-1.5 text-muted">{r.comboLabel}</td>
                  <td className="tabular px-3 py-1.5 text-right text-muted">
                    {formatPeso(r.current)}
                  </td>
                  <td className="px-1 py-1.5 text-center text-muted">
                    <Icon icon={IconArrowRight} size={13} />
                  </td>
                  <td className="tabular px-3 py-1.5 text-right font-medium">
                    {r.next === null ? (
                      <span className="text-[12px] font-normal text-muted">
                        no price on file — skipped
                      </span>
                    ) : (
                      formatPeso(r.next)
                    )}
                  </td>
                </tr>
              ))}
              {preview.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted" colSpan={5}>
                    Choose at least one lot type and one combination.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      <Callout tone="info">
        Contracts already signed are untouched — each one snapshotted its price
        at signing. Only lots still available will sell at the new figures.
      </Callout>

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={applicable.length === 0}>
          Append {applicable.length} entries
        </Button>
      </DialogFooter>
    </div>
  )
}

// ── shared bits ──────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="eyebrow mb-1.5 block text-muted">{label}</Label>
      {children}
    </div>
  )
}

export function BeforeAfter({
  currentCentavos,
  nextCentavos,
  effectiveFrom,
  contracts,
  availableLots,
}: {
  currentCentavos: Centavos | null
  nextCentavos: Centavos | null
  effectiveFrom: ISODate
  contracts: number
  availableLots: number
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-gold/45 bg-gold/8 p-3">
      <p className="eyebrow mb-2 text-gold-deep dark:text-gold">Before / after</p>
      <p className="flex flex-wrap items-baseline gap-2 text-[14px]">
        <span className="text-muted">Currently</span>
        <MoneyText
          centavos={currentCentavos}
          className="font-display text-[19px] font-semibold"
        />
        <Icon icon={IconArrowRight} size={15} className="translate-y-0.5 text-muted" />
        <span className="text-muted">will become</span>
        {nextCentavos === null ? (
          <span className="text-muted">—</span>
        ) : (
          <MoneyText
            centavos={nextCentavos}
            className="font-display text-[19px] font-semibold text-gold-deep dark:text-gold"
          />
        )}
        <span className="text-muted">from {fmtDate(effectiveFrom)}</span>
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-3 text-[12.5px]">
        <div className="rounded-md border border-line bg-surface px-2.5 py-1.5">
          <span className="tabular font-display text-[17px] text-ink">{contracts}</span>{' '}
          <span className="text-muted">
            active contracts — <span className="text-green">unaffected</span>, they keep
            their snapshotted price
          </span>
        </div>
        <div className="rounded-md border border-line bg-surface px-2.5 py-1.5">
          <span className="tabular font-display text-[17px] text-ink">
            {availableLots}
          </span>{' '}
          <span className="text-muted">
            available lots — <span className="text-gold-deep dark:text-gold">affected</span>{' '}
            from that date
          </span>
        </div>
      </div>
    </div>
  )
}

function Callout({
  tone,
  children,
}: {
  tone: 'warn' | 'info'
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex gap-2 rounded-[var(--radius-card)] border p-2.5 text-[12.5px] leading-relaxed',
        tone === 'warn'
          ? 'border-gold/50 bg-gold/10 text-ink'
          : 'border-line bg-surface-2 text-muted',
      )}
    >
      <Icon
        icon={tone === 'warn' ? IconWarning : IconInfo}
        size={15}
        className={cn('mt-0.5', tone === 'warn' && 'text-gold-deep dark:text-gold')}
      />
      <p>{children}</p>
    </div>
  )
}
