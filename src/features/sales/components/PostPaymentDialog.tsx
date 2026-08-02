import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ASSUMPTIONS,
  PAYMENT_METHOD_LABEL,
  TRUST_FUND_RATE_PERCENT,
  type Contract,
  type PaymentMethod,
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
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import { IconCertificate, IconInfo, IconTrustFund } from '@/components/ui-brand/icons'
import { useDataset } from '@/stores/dataset'
import { nextOrNo, previewPayment, useSales } from '@/stores/sales'
import { useCan, useCurrentUserOrNull } from '@/lib/permissions'
import { balanceOf, scheduleOf } from '@/lib/finance'
import { nextDue } from '@/lib/amortization'
import { formatPeso, formatPercent, parsePeso } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { TODAY } from '@/mock'
import { DateField } from './DateField'
import { METHOD_ICON, METHOD_NEEDS_REFERENCE, clientNameOf, lotCodeById } from '../lib'
import { cn } from '@/lib/utils'

const LEVEL_NAMES = ASSUMPTIONS.commissionLevelNames.value
const EASE = [0.22, 1, 0.36, 1] as const

/**
 * The single most persuasive screen in the demo: one amount, and the balance,
 * the 20% trust-fund accrual and the 6/4/2 commission all move at once,
 * before anything is committed.
 */
export function PostPaymentDialog({
  contract,
  open,
  onOpenChange,
}: {
  contract: Contract | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const version = useDataset((s) => s.version)
  const user = useCurrentUserOrNull()
  const canEditOr = useCan('payment:void') // admin-only, same gate as OR editing
  const postPayment = useSales((s) => s.postPayment)

  const [amountInput, setAmountInput] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState(TODAY)
  const [orNo, setOrNo] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setAmountInput('')
    setMethod('cash')
    setReference('')
    setPaidAt(TODAY)
    setOrNo(nextOrNo())
    setBusy(false)
  }, [open])

  const balance = useMemo(() => {
    void version
    return contract ? balanceOf(contract) : null
  }, [contract, version])

  const due = useMemo(() => {
    void version
    if (!contract) return null
    return nextDue(scheduleOf(contract.id))
  }, [contract, version])

  const nextDueCentavos = due ? due.amountDueCentavos - due.amountPaidCentavos : null

  const amountCentavos = parsePeso(amountInput) ?? 0
  const preview = useMemo(() => {
    void version
    if (!contract || amountCentavos <= 0) return null
    return previewPayment(contract, amountCentavos, paidAt)
  }, [contract, amountCentavos, paidAt, version])

  const needsRef = METHOD_NEEDS_REFERENCE.includes(method)
  const amountIsInvalid = amountInput.trim().length > 0 && amountCentavos <= 0
  const referenceIsInvalid =
    needsRef && reference.trim().length > 0 && reference.trim().length <= 2
  const paymentDateIsInvalid = paidAt > TODAY
  const valid =
    Boolean(contract) &&
    amountCentavos > 0 &&
    !paymentDateIsInvalid &&
    (!needsRef || reference.trim().length > 2)

  function submit() {
    if (!contract || !user) return
    setBusy(true)
    const result = postPayment(
      {
        contractId: contract.id,
        amountCentavos,
        method,
        referenceNo: needsRef ? reference.trim() : null,
        paidAt,
        orNo: canEditOr ? orNo : undefined,
      },
      user,
    )
    setBusy(false)

    if ('error' in result) {
      toast.error(result.error)
      return
    }
    if (result.certificateNo) {
      toast.success(`Contract fully paid. Certificate ${result.certificateNo} issued.`, {
        description: `${formatPeso(result.trustFundCentavos)} accrued to the perpetual care fund.`,
        duration: 7000,
      })
    } else {
      toast.success(`Payment posted — ${result.orNo}`, {
        description: `${formatPeso(result.trustFundCentavos)} to trust fund · ${result.commissions.length} commission ${result.commissions.length === 1 ? 'entry' : 'entries'} accrued.`,
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] !w-[calc(100%-1rem)] !max-w-[680px] grid-rows-[auto_minmax(0,1fr)_auto] !gap-0 !overflow-hidden !p-0 sm:max-h-[calc(100dvh-2rem)] [&>[data-slot=dialog-close]]:right-2 [&>[data-slot=dialog-close]]:top-2 [&>[data-slot=dialog-close]]:grid [&>[data-slot=dialog-close]]:size-11 [&>[data-slot=dialog-close]]:place-items-center">
        <DialogHeader className="shrink-0 px-4 pb-3 pt-4 pr-14 text-left sm:px-6 sm:pt-6 sm:pr-16">
          <DialogTitle className="font-display text-[22px]">Post a payment</DialogTitle>
          <DialogDescription>
            {contract ? (
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="break-all font-mono text-ink">
                  {contract.contractNo}
                </span>
                <span>·</span>
                <span className="break-words">{clientNameOf(contract.clientId)}</span>
                <span>·</span>
                <span className="break-all font-mono">
                  {lotCodeById(contract.lotId)}
                </span>
              </span>
            ) : (
              'No contract selected.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div
          className="min-h-0 overflow-y-auto overscroll-contain border-t border-line-soft px-4 py-4 scroll-pb-24 sm:px-6"
          aria-busy={busy}
        >
          {contract && balance ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 px-3.5 py-2.5">
                <span className="text-[12.5px] text-muted">Current balance</span>
                <MoneyText
                  centavos={balance.outstandingCentavos}
                  className="whitespace-nowrap font-display text-[24px] font-semibold leading-none text-ink"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="pp-amount" className="text-[12.5px] text-muted">
                    Amount
                  </Label>
                  <Input
                    id="pp-amount"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                    required
                    aria-invalid={amountIsInvalid}
                    aria-describedby="pp-amount-help"
                    className="min-h-11 tabular text-[15px] sm:min-h-9"
                    autoFocus
                  />
                  <p
                    id="pp-amount-help"
                    className={cn(
                      'text-[11.5px]',
                      amountIsInvalid ? 'text-danger' : 'text-muted',
                    )}
                    aria-live="polite"
                  >
                    {amountIsInvalid
                      ? 'Enter a payment amount greater than zero.'
                      : 'Enter the amount received, or use a shortcut below.'}
                  </p>
                  <div className="grid gap-2 pt-0.5 sm:flex sm:flex-wrap sm:gap-1.5">
                    {nextDueCentavos != null && nextDueCentavos > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="!h-auto min-h-11 w-full !whitespace-normal py-2 text-left leading-tight sm:min-h-8 sm:w-auto sm:!whitespace-nowrap"
                        onClick={() => setAmountInput(String(nextDueCentavos / 100))}
                      >
                        Pay next installment ({formatPeso(nextDueCentavos)})
                      </Button>
                    )}
                    {balance.outstandingCentavos > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="!h-auto min-h-11 w-full !whitespace-normal py-2 text-left leading-tight sm:min-h-8 sm:w-auto sm:!whitespace-nowrap"
                        onClick={() =>
                          setAmountInput(String(balance.outstandingCentavos / 100))
                        }
                      >
                        Settle balance ({formatPeso(balance.outstandingCentavos)})
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 sm:min-w-40">
                  <Label htmlFor="pp-date" className="text-[12.5px] text-muted">
                    Payment date
                  </Label>
                  <DateField
                    id="pp-date"
                    value={paidAt}
                    onChange={setPaidAt}
                    max={TODAY}
                    label="Payment date"
                    className="min-h-11 sm:min-h-9"
                  />
                  {paymentDateIsInvalid && (
                    <p className="text-[11.5px] text-danger" role="alert">
                      Payment date cannot be in the future.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label id="pp-method-label" className="text-[12.5px] text-muted">
                  Method
                </Label>
                <RadioGroup
                  value={method}
                  onValueChange={(v) => setMethod(v as PaymentMethod)}
                  aria-labelledby="pp-method-label"
                  className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-4"
                >
                  {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                    <label
                      key={m}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 transition-colors',
                        method === m
                          ? 'border-gold bg-gold/8'
                          : 'border-line hover:bg-surface-2',
                      )}
                    >
                      <RadioGroupItem value={m} />
                      <Icon icon={METHOD_ICON[m]} size={15} className="text-muted" />
                      <span className="min-w-0 break-words text-[12.5px] text-ink">
                        {PAYMENT_METHOD_LABEL[m]}
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {needsRef && (
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="pp-ref" className="text-[12.5px] text-muted">
                      Reference number
                    </Label>
                    <Input
                      id="pp-ref"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder={method === 'check' ? 'Check no.' : 'Transaction ref.'}
                      required
                      aria-invalid={referenceIsInvalid}
                      aria-describedby="pp-ref-help"
                      className="min-h-11 font-mono sm:min-h-9"
                    />
                    <p
                      id="pp-ref-help"
                      className={cn(
                        'text-[11.5px]',
                        referenceIsInvalid ? 'text-danger' : 'text-muted',
                      )}
                      aria-live="polite"
                    >
                      {referenceIsInvalid
                        ? 'Enter at least three characters.'
                        : `${PAYMENT_METHOD_LABEL[method]} requires a reference number.`}
                    </p>
                  </div>
                )}
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="pp-or" className="text-[12.5px] text-muted">
                    OR number{' '}
                    {!canEditOr && <span className="text-muted/70">(auto-generated)</span>}
                  </Label>
                  <Input
                    id="pp-or"
                    value={orNo}
                    onChange={(e) => setOrNo(e.target.value)}
                    readOnly={!canEditOr}
                    className={cn(
                      'min-h-11 font-mono sm:min-h-9',
                      !canEditOr && 'bg-surface-2 text-muted',
                    )}
                  />
                </div>
              </div>

              <PreviewStrip preview={preview} contract={contract} />
            </div>
          ) : (
            <p className="text-[13px] text-muted" role="status">
              Select a contract before posting a payment.
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <Button
            variant="ghost"
            className="min-h-11 w-full sm:min-h-9 sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="min-h-11 w-full !whitespace-normal px-3 text-center leading-tight sm:min-h-9 sm:w-auto sm:!whitespace-nowrap"
            onClick={submit}
            disabled={!valid || busy}
          >
            {preview?.settlesContract ? 'Post payment & issue certificate' : 'Post payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewStrip({
  preview,
  contract,
}: {
  preview: ReturnType<typeof previewPayment> | null
  contract: Contract
}) {
  const shouldReduceMotion = useReducedMotion()

  if (!preview) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line px-3.5 py-3 text-[12.5px] text-muted">
        <Icon icon={IconInfo} size={15} className="shrink-0" />
        <span className="min-w-0 break-words">
          Enter an amount to see what it settles, what accrues to the trust fund and
          what commission it generates.
        </span>
      </div>
    )
  }

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.32, ease: EASE }}
      className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-gold/50 bg-gold/6"
    >
      <div className="flex flex-col items-start gap-1 border-b border-gold/30 px-3.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-1.5">
        <span className="eyebrow text-gold-deep dark:text-gold">
          What this payment does
        </span>
        <span className="break-words text-[11.5px] text-muted">
          <MoneyText centavos={preview.amountCentavos} className="text-ink" /> received
        </span>
      </div>

      <div className="grid gap-px bg-line/60 sm:grid-cols-3">
        <Cell label="Settles">
          {contract.paymentMode === 'spot_cash' ? (
            <span className="text-[13px] text-ink">
              {preview.settlesContract ? 'The contract in full' : 'Part of the balance'}
            </span>
          ) : preview.appliedRows.length === 0 ? (
            <span className="text-[13px] text-muted">Nothing outstanding</span>
          ) : (
            <span className="text-[13px] text-ink">
              Installment{preview.appliedRows.length > 1 ? 's' : ''}{' '}
              <span className="font-mono">
                {preview.appliedRows.map((r) => r.installmentNo).join(', ')}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-muted">
                due {fmtDate(preview.appliedRows[0]!.dueDate)}
                {preview.appliedRows.length > 1 &&
                  ` — ${fmtDate(preview.appliedRows.at(-1)!.dueDate)}`}
              </span>
            </span>
          )}
          {preview.overpaymentCentavos > 0 && (
            <span className="mt-1 block text-[11.5px] text-green">
              + {formatPeso(preview.overpaymentCentavos)} credit
            </span>
          )}
        </Cell>

        <Cell label="New balance">
          <span className="flex flex-wrap items-baseline gap-2">
            <MoneyText
              centavos={preview.previousOutstandingCentavos}
              className="whitespace-nowrap text-[12px] text-muted line-through"
            />
            <MoneyText
              centavos={preview.newOutstandingCentavos}
              className="whitespace-nowrap font-display text-[20px] font-semibold leading-none text-ink"
            />
          </span>
          {preview.settlesContract && (
            <span className="mt-1 flex items-start gap-1 text-[11.5px] text-green">
              <Icon icon={IconCertificate} size={13} className="mt-0.5 shrink-0" />
              <span className="break-words">Certificate will be issued</span>
            </span>
          )}
        </Cell>

        <Cell label={`Trust fund +${TRUST_FUND_RATE_PERCENT}%`}>
          <span className="flex flex-wrap items-center gap-1.5">
            <Icon icon={IconTrustFund} size={15} className="shrink-0 text-green" />
            <MoneyText
              centavos={preview.trustFundCentavos}
              className="whitespace-nowrap font-display text-[20px] font-semibold leading-none text-green"
            />
          </span>
          <span className="mt-1 block text-[11.5px] text-muted">
            Added to perpetual care — not deducted from the balance.
          </span>
        </Cell>
      </div>

      <div className="border-t border-gold/30 px-3.5 py-2.5">
        <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span className="eyebrow text-gold-deep dark:text-gold">
            Commission generated
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
            <span>on collection</span>
            <AssumedChip why={ASSUMPTIONS.commissionRates.why} label="Rates assumed" />
          </span>
        </div>
        {preview.commissions.length === 0 ? (
          <p className="mt-1 text-[12.5px] text-muted">No upline on this contract.</p>
        ) : (
          <ul className="mt-1.5 grid gap-1 sm:grid-cols-3">
            {preview.commissions.map((c) => (
              <li
                key={c.level}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 rounded border border-line bg-surface px-2.5 py-1.5"
              >
                <span className="min-w-0 break-words text-[11.5px] text-muted">
                  {LEVEL_NAMES[c.level]}
                  <span className="ml-1 tabular">{formatPercent(c.ratePercent, 0)}</span>
                </span>
                <MoneyText
                  centavos={c.amountCentavos}
                  className="whitespace-nowrap text-[13px] text-ink"
                />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[11.5px] text-muted">
          Total{' '}
          <MoneyText centavos={preview.commissionTotalCentavos} className="text-ink" /> —
          the basis is the full payment; the trust-fund accrual is not deducted from it.
        </p>
      </div>
    </motion.div>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-3.5 py-2.5">
      <p className="eyebrow mb-1 text-muted">{label}</p>
      {children}
    </div>
  )
}
