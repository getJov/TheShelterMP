import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ASSUMPTIONS,
  INSTALLMENT_TERM_OPTIONS,
  NEED_TYPE_LABEL,
  PAYMENT_MODE_LABEL,
  clientFullName,
  isPaymentModeAllowed,
  type ClientId,
  type ContractId,
  type LotId,
  type NeedType,
  type PaymentMode,
  type ServiceId,
} from '@/domain'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconAdd,
  IconChevronLeft,
  IconChevronRight,
  IconDelete,
  IconInfo,
  IconStar,
} from '@/components/ui-brand/icons'
import { useDataset, indexes } from '@/stores/dataset'
import { useSales } from '@/stores/sales'
import { useCurrentAgent, useCurrentUserOrNull } from '@/lib/permissions'
import { resolvePrice } from '@/lib/price-resolver'
import { buildSchedule } from '@/lib/amortization'
import { splitPreview } from '@/lib/commission'
import { formatPeso, parsePeso, pctOf } from '@/lib/money'
import { TODAY } from '@/mock'
import { fmtDate } from '@/lib/dates'
import { LotCombobox } from './LotCombobox'
import { ClientCombobox, type BuyerValue } from './ClientCombobox'
import { DateField } from './DateField'
import { PriceCard } from './PriceCard'
import { ScheduleTable } from './ScheduleTable'
import { CommissionSplit, TrustFundNote } from './CommissionSplit'
import { FieldRow } from './chips'
import { lotCodeById, tierNameOf } from '../lib'
import { cn } from '@/lib/utils'

const STEPS = ['Lot & buyer', 'Terms', 'Services', 'Review'] as const
const EASE = [0.22, 1, 0.36, 1] as const

interface LineDraft {
  key: string
  serviceId: ServiceId
  description: string
  quantity: number
  unitAmountCentavos: number
}

export function ContractBuilder({
  open,
  onOpenChange,
  lotId: initialLotId = null,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  lotId?: LotId | null
  onCreated?: (id: ContractId) => void
}) {
  const version = useDataset((s) => s.version)
  const prices = useDataset((s) => s.data.prices)
  const services = useDataset((s) => s.data.services)
  const agents = useDataset((s) => s.data.agents)
  const rules = useDataset((s) => s.data.commissionRules)
  const user = useCurrentUserOrNull()
  const myAgent = useCurrentAgent()
  const createContract = useSales((s) => s.createContract)

  const [step, setStep] = useState(0)
  const [lotId, setLotId] = useState<LotId | null>(initialLotId)
  const [buyer, setBuyer] = useState<BuyerValue>(null)
  const [coOwner, setCoOwner] = useState<BuyerValue>(null)
  const [agentId, setAgentId] = useState<string>('')
  const [needType, setNeedType] = useState<NeedType>('pre_need')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('spot_cash')
  const [termMonths, setTermMonths] = useState<number>(36)
  const [signedAt, setSignedAt] = useState(TODAY)
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount')
  const [discountInput, setDiscountInput] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [busy, setBusy] = useState(false)

  const activeAgents = useMemo(
    () => agents.filter((a) => a.status === 'active'),
    [agents],
  )

  // Reset each time the dialog opens so a cancelled draft never leaks forward.
  useEffect(() => {
    if (!open) return
    setStep(0)
    setLotId(initialLotId)
    setBuyer(null)
    setCoOwner(null)
    setAgentId(myAgent?.id ?? activeAgents[0]?.id ?? '')
    setNeedType('pre_need')
    setPaymentMode('spot_cash')
    setTermMonths(36)
    setSignedAt(TODAY)
    setDiscountMode('amount')
    setDiscountInput('')
    setDiscountReason('')
    setLines([])
    setBusy(false)
  }, [open, initialLotId, myAgent, activeAgents])

  // At-need is spot cash only — the option is REMOVED, not validated away.
  const allowedModes = (['spot_cash', 'installment'] as const).filter((m) =>
    isPaymentModeAllowed(needType, m),
  )
  useEffect(() => {
    if (!isPaymentModeAllowed(needType, paymentMode)) setPaymentMode('spot_cash')
  }, [needType, paymentMode])

  const lot = lotId ? indexes().lotsById.get(lotId) : null
  const tierName = lotId ? tierNameOf(lotId) : '—'

  const resolved = useMemo(() => {
    void version
    if (!lot) return null
    return resolvePrice(prices, lot.tierId, needType, paymentMode, signedAt)
  }, [lot, prices, needType, paymentMode, signedAt, version])

  const listPrice = resolved?.amountCentavos ?? 0

  const discountCentavos = useMemo(() => {
    const raw = discountInput.trim()
    if (!raw) return 0
    if (discountMode === 'percent') {
      const pct = Number(raw)
      if (!Number.isFinite(pct) || pct <= 0) return 0
      return pctOf(listPrice, Math.min(pct, 100))
    }
    const parsed = parsePeso(raw)
    return parsed && parsed > 0 ? Math.min(parsed, listPrice) : 0
  }, [discountInput, discountMode, listPrice])

  const servicesTotal = lines.reduce(
    (s, l) => s + l.unitAmountCentavos * l.quantity,
    0,
  )
  const contractPrice = Math.max(0, listPrice - discountCentavos + servicesTotal)

  const buyerClient =
    buyer?.kind === 'client' ? indexes().clientsById.get(buyer.clientId) : null

  const schedulePreview = useMemo(() => {
    if (paymentMode !== 'installment' || contractPrice <= 0) return []
    return buildSchedule({
      contractPriceCentavos: contractPrice,
      termMonths,
      signedAt,
    })
  }, [paymentMode, contractPrice, termMonths, signedAt])

  const selectedAgent = activeAgents.find((a) => a.id === agentId) ?? null
  const splitRows = useMemo(() => {
    void version
    if (!selectedAgent) return []
    return splitPreview(
      contractPrice,
      {
        agentId: selectedAgent.id,
        teamLeaderId: selectedAgent.teamLeaderId,
        distributorId: selectedAgent.distributorId,
      },
      rules,
      signedAt,
    )
  }, [selectedAgent, contractPrice, rules, signedAt, version])

  const step1Ok = Boolean(lotId && buyer?.kind === 'client' && agentId)
  const step2Ok =
    Boolean(resolved && resolved.amountCentavos !== null) &&
    (paymentMode === 'spot_cash' || termMonths > 0) &&
    (discountCentavos === 0 || discountReason.trim().length > 2)
  const canAdvance = step === 0 ? step1Ok : step === 1 ? step2Ok : true

  function submit() {
    if (!user || !lotId || !buyer || buyer.kind !== 'client' || !resolved?.entry) return
    setBusy(true)
    const id = createContract(
      {
        lotId,
        clientId: buyer.clientId,
        coOwnerClientId:
          coOwner?.kind === 'client' ? (coOwner.clientId as ClientId) : null,
        needType,
        paymentMode,
        termMonths: paymentMode === 'installment' ? termMonths : null,
        signedAt,
        agentId,
        priceBookEntryId: resolved.entry.id,
        listPriceCentavos: listPrice,
        discountCentavos,
        discountReason: discountCentavos > 0 ? discountReason.trim() : null,
        serviceLines: lines.map((l) => ({
          serviceId: l.serviceId,
          description: l.description,
          quantity: l.quantity,
          unitAmountCentavos: l.unitAmountCentavos,
        })),
      },
      user,
    )
    setBusy(false)

    const created = indexes().contractsById.get(id)
    toast.success(`Contract ${created?.contractNo ?? ''} created.`, {
      description:
        created?.status === 'pending_approval'
          ? 'Awaiting approval before payments can be posted.'
          : `${lotCodeById(lotId)} is now sold.`,
    })
    onOpenChange(false)
    onCreated?.(id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-4 sm:max-w-[880px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[22px]">New contract</DialogTitle>
          <DialogDescription>
            Price is snapshotted at signing — a later price change never restates this
            contract.
          </DialogDescription>
        </DialogHeader>

        <Stepper step={step} onStep={(n) => n < step && setStep(n)} />

        <ScrollArea className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.32, ease: EASE }}
              className="space-y-4 pb-1"
            >
              {step === 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cb-lot" className="text-[12.5px] text-muted">
                      Lot
                    </Label>
                    <LotCombobox id="cb-lot" value={lotId} onChange={setLotId} />
                    {lot && (
                      <p className="text-[11.5px] text-muted">
                        {tierName} · {lot.areaSqm.toFixed(1)} sqm · capacity {lot.capacity}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cb-agent" className="text-[12.5px] text-muted">
                      Selling agent
                    </Label>
                    <Select value={agentId} onValueChange={setAgentId}>
                      <SelectTrigger id="cb-agent" className="w-full">
                        <SelectValue placeholder="Select an agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeAgents.map((a) => {
                          const u = indexes().usersById.get(a.userId)
                          return (
                            <SelectItem key={a.id} value={a.id}>
                              {u?.fullName ?? a.agentCode}
                              <span className="ml-2 font-mono text-[11px] text-muted">
                                {a.agentCode}
                              </span>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-[11.5px] text-muted">
                      Archived agents are excluded — attribution is preserved on their
                      existing contracts.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cb-buyer" className="text-[12.5px] text-muted">
                      Buyer
                    </Label>
                    <ClientCombobox
                      id="cb-buyer"
                      value={buyer}
                      onChange={setBuyer}
                      allowProspect={false}
                      placeholder="Search the client book"
                    />
                    {buyerClient?.seniorCitizen && <SeniorHint />}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cb-coowner" className="text-[12.5px] text-muted">
                      Co-owner <span className="text-muted/70">(optional)</span>
                    </Label>
                    <ClientCombobox
                      id="cb-coowner"
                      value={coOwner}
                      onChange={setCoOwner}
                      allowProspect={false}
                      exclude={buyer?.kind === 'client' ? buyer.clientId : null}
                    />
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[12.5px] text-muted">Need type</Label>
                      <RadioGroup
                        value={needType}
                        onValueChange={(v) => setNeedType(v as NeedType)}
                        className="grid grid-cols-2 gap-2"
                      >
                        {(['pre_need', 'at_need'] as const).map((n) => (
                          <OptionCard
                            key={n}
                            value={n}
                            checked={needType === n}
                            label={NEED_TYPE_LABEL[n]}
                            hint={
                              n === 'at_need'
                                ? 'Immediate need — spot cash only'
                                : 'Bought ahead of need'
                            }
                          />
                        ))}
                      </RadioGroup>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[12.5px] text-muted">Payment mode</Label>
                      <RadioGroup
                        value={paymentMode}
                        onValueChange={(v) => setPaymentMode(v as PaymentMode)}
                        className="grid grid-cols-2 gap-2"
                      >
                        {allowedModes.map((m) => (
                          <OptionCard
                            key={m}
                            value={m}
                            checked={paymentMode === m}
                            label={PAYMENT_MODE_LABEL[m]}
                            hint={
                              m === 'spot_cash'
                                ? 'Settled in one payment'
                                : `Up to ${INSTALLMENT_TERM_OPTIONS.at(-1)} months`
                            }
                          />
                        ))}
                      </RadioGroup>
                      {needType === 'at_need' && (
                        <p className="flex items-start gap-1.5 text-[11.5px] text-muted">
                          <Icon icon={IconInfo} size={13} className="mt-0.5 shrink-0" />
                          At-need is spot cash only, so installment is not offered.
                        </p>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {paymentMode === 'installment' && (
                        <div className="space-y-1.5">
                          <Label htmlFor="cb-term" className="text-[12.5px] text-muted">
                            Term
                          </Label>
                          <Select
                            value={String(termMonths)}
                            onValueChange={(v) => setTermMonths(Number(v))}
                          >
                            <SelectTrigger id="cb-term" className="w-full">
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

                      <div className="space-y-1.5">
                        <Label htmlFor="cb-signed" className="text-[12.5px] text-muted">
                          Signed on
                        </Label>
                        <DateField
                          id="cb-signed"
                          value={signedAt}
                          onChange={setSignedAt}
                          max={TODAY}
                        />
                      </div>
                    </div>

                    <div className="rounded-[var(--radius-card)] border border-line p-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-[12.5px] text-muted">
                          Discount <span className="text-muted/70">(optional)</span>
                        </Label>
                        <div className="flex gap-1">
                          {(['amount', 'percent'] as const).map((m) => (
                            <Button
                              key={m}
                              type="button"
                              size="xs"
                              variant={discountMode === m ? 'secondary' : 'ghost'}
                              onClick={() => setDiscountMode(m)}
                            >
                              {m === 'amount' ? '₱' : '%'}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Input
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value)}
                          placeholder={discountMode === 'amount' ? '5,000' : '5'}
                          inputMode="decimal"
                        />
                        <Input
                          value={discountReason}
                          onChange={(e) => setDiscountReason(e.target.value)}
                          placeholder="Reason (required)"
                          aria-invalid={discountCentavos > 0 && discountReason.trim().length <= 2}
                        />
                      </div>
                      {discountCentavos > 0 && (
                        <p className="mt-2 text-[11.5px] text-muted">
                          −{formatPeso(discountCentavos)} · any discount routes the
                          contract to a manager for approval.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {resolved ? (
                      <PriceCard
                        resolved={resolved}
                        tierName={tierName}
                        needType={needType}
                        paymentMode={paymentMode}
                        asOf={signedAt}
                      />
                    ) : (
                      <p className="text-[13px] text-muted">Select a lot to see pricing.</p>
                    )}

                    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3.5">
                      <FieldRow label="List price">
                        <MoneyText centavos={listPrice} />
                      </FieldRow>
                      <FieldRow label="Discount">
                        <MoneyText centavos={-discountCentavos} muted={!discountCentavos} />
                      </FieldRow>
                      <FieldRow label="Services">
                        <MoneyText centavos={servicesTotal} muted={!servicesTotal} />
                      </FieldRow>
                      <div className="mt-1 border-t border-line pt-1.5">
                        <FieldRow label="Contract price">
                          <MoneyText centavos={contractPrice} className="font-medium" />
                        </FieldRow>
                      </div>
                      {paymentMode === 'installment' && contractPrice > 0 && (
                        <p className="mt-1.5 text-[11.5px] text-muted">
                          ≈ {formatPeso(Math.floor(contractPrice / termMonths))} × {termMonths}{' '}
                          months
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <ServiceStep
                  lines={lines}
                  setLines={setLines}
                  servicesTotal={servicesTotal}
                  catalog={services}
                />
              )}

              {step === 3 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3.5">
                      <p className="eyebrow mb-2 text-gold-deep dark:text-gold">Summary</p>
                      <FieldRow label="Lot">
                        <span className="font-mono">{lotId ? lotCodeById(lotId) : '—'}</span>
                      </FieldRow>
                      <FieldRow label="Tier">{tierName}</FieldRow>
                      <FieldRow label="Buyer">
                        {buyerClient ? clientFullName(buyerClient) : '—'}
                      </FieldRow>
                      <FieldRow label="Terms">
                        {NEED_TYPE_LABEL[needType]} · {PAYMENT_MODE_LABEL[paymentMode]}
                        {paymentMode === 'installment' ? ` · ${termMonths} mo` : ''}
                      </FieldRow>
                      <FieldRow label="Signed">{fmtDate(signedAt)}</FieldRow>
                      <div className="my-1.5 border-t border-line" />
                      <FieldRow label="List price">
                        <MoneyText centavos={listPrice} />
                      </FieldRow>
                      {discountCentavos > 0 && (
                        <FieldRow label={`Discount — ${discountReason || 'no reason'}`}>
                          <MoneyText centavos={-discountCentavos} className="text-green" />
                        </FieldRow>
                      )}
                      {lines.map((l) => (
                        <FieldRow key={l.key} label={`${l.description} × ${l.quantity}`}>
                          <MoneyText centavos={l.unitAmountCentavos * l.quantity} />
                        </FieldRow>
                      ))}
                      <div className="mt-1 border-t border-line pt-1.5">
                        <FieldRow label="Contract price">
                          <MoneyText
                            centavos={contractPrice}
                            className="font-display text-[19px] font-semibold"
                          />
                        </FieldRow>
                      </div>
                    </div>

                    <TrustFundNote />
                  </div>

                  <div className="space-y-3">
                    {paymentMode === 'installment' ? (
                      <ScheduleTable schedule={schedulePreview} maxHeight={230} />
                    ) : (
                      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3.5 text-[12.5px] text-muted">
                        <p className="eyebrow mb-1.5 text-gold-deep dark:text-gold">
                          Spot cash
                        </p>
                        One payment of{' '}
                        <MoneyText centavos={contractPrice} className="text-ink" /> settles
                        the contract. No amortization schedule is generated.
                      </div>
                    )}

                    <CommissionSplit
                      rows={splitRows}
                      basisCentavos={contractPrice}
                      basisLabel="If collected in full"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </ScrollArea>

        <DialogFooter className="border-t border-line pt-3 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
            className="gap-1.5"
          >
            {step > 0 && <Icon icon={IconChevronLeft} size={15} />}
            {step === 0 ? 'Cancel' : STEPS[step - 1]}
          </Button>

          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance}
              className="gap-1.5"
            >
              {STEPS[step + 1]}
              <Icon icon={IconChevronRight} size={15} />
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy || !step1Ok || !step2Ok}>
              Create contract
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stepper({ step, onStep }: { step: number; onStep: (n: number) => void }) {
  return (
    <ol className="flex items-center gap-1.5">
      {STEPS.map((label, i) => {
        const done = i < step
        const active = i === step
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onStep(i)}
              disabled={i >= step}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors',
                active
                  ? 'border-gold bg-gold/10'
                  : done
                    ? 'cursor-pointer border-line bg-surface-2 hover:border-gold/60'
                    : 'border-line-soft bg-transparent',
              )}
            >
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px]',
                  active || done
                    ? 'bg-ink text-surface'
                    : 'border border-line text-muted',
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  'truncate text-[12.5px]',
                  active ? 'font-medium text-ink' : 'text-muted',
                )}
              >
                {label}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function OptionCard({
  value,
  checked,
  label,
  hint,
}: {
  value: string
  checked: boolean
  label: string
  hint: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors',
        checked ? 'border-gold bg-gold/8' : 'border-line hover:bg-surface-2',
      )}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="block text-[11.5px] leading-snug text-muted">{hint}</span>
      </span>
    </label>
  )
}

function SeniorHint() {
  return (
    <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted">
      <Icon icon={IconStar} size={13} className="mt-0.5 shrink-0 text-gold-deep dark:text-gold" />
      <span>
        Buyer is a registered senior citizen.
        <span className="ml-1">No automatic discount rule is defined.</span>{' '}
        <AssumedChip why={ASSUMPTIONS.seniorCitizenDiscount.why} label="Undefined" />
      </span>
    </p>
  )
}

function ServiceStep({
  lines,
  setLines,
  servicesTotal,
  catalog,
}: {
  lines: LineDraft[]
  setLines: (v: LineDraft[]) => void
  servicesTotal: number
  catalog: { id: ServiceId; code: string; name: string; defaultAmountCentavos: number; active: boolean }[]
}) {
  const [pick, setPick] = useState('')

  function add(serviceId: string) {
    const svc = catalog.find((s) => s.id === serviceId)
    if (!svc) return
    setLines([
      ...lines,
      {
        key: `${svc.id}-${lines.length}-${Date.now()}`,
        serviceId: svc.id,
        description: svc.name,
        quantity: 1,
        unitAmountCentavos: svc.defaultAmountCentavos,
      },
    ])
    setPick('')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[260px] flex-1 space-y-1.5">
          <Label htmlFor="cb-service" className="text-[12.5px] text-muted">
            Add a service
          </Label>
          <Select value={pick} onValueChange={add}>
            <SelectTrigger id="cb-service" className="w-full">
              <SelectValue placeholder="Choose from the service catalog" />
            </SelectTrigger>
            <SelectContent>
              {catalog
                .filter((s) => s.active)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    <span className="ml-2 tabular text-[11px] text-muted">
                      {formatPeso(s.defaultAmountCentavos)}
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <p className="flex items-center gap-1.5 pb-2 text-[11.5px] text-muted">
          Catalog amounts are placeholders
          <AssumedChip why={ASSUMPTIONS.serviceFees.why} />
        </p>
      </div>

      {lines.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
          <Icon icon={IconAdd} size={18} className="mx-auto mb-2 opacity-60" />
          No services on this contract yet. The lot price alone is fine.
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface">
          <ul className="divide-y divide-line-soft">
            {lines.map((l, i) => (
              <li key={l.key} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                <span className="min-w-[180px] flex-1 text-[13px] text-ink">
                  {l.description}
                </span>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[11.5px] text-muted">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={l.quantity}
                    onChange={(e) => {
                      const q = Math.max(1, Number(e.target.value) || 1)
                      setLines(lines.map((x, j) => (j === i ? { ...x, quantity: q } : x)))
                    }}
                    className="h-8 w-16 tabular"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[11.5px] text-muted">Amount</Label>
                  <Input
                    value={formatPeso(l.unitAmountCentavos).replace('₱', '')}
                    onChange={(e) => {
                      const parsed = parsePeso(e.target.value)
                      setLines(
                        lines.map((x, j) =>
                          j === i
                            ? { ...x, unitAmountCentavos: parsed ?? x.unitAmountCentavos }
                            : x,
                        ),
                      )
                    }}
                    className="h-8 w-28 tabular"
                    inputMode="decimal"
                  />
                </div>
                <MoneyText
                  centavos={l.unitAmountCentavos * l.quantity}
                  className="w-24 text-right text-[13px]"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  aria-label={`Remove ${l.description}`}
                >
                  <Icon icon={IconDelete} size={15} className="text-muted" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line bg-surface-2 px-3.5 py-2 text-[12.5px]">
            <span className="text-muted">Services subtotal</span>
            <MoneyText centavos={servicesTotal} className="font-medium text-ink" />
          </div>
        </div>
      )}
    </div>
  )
}
