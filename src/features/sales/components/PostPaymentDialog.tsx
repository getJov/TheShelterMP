import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
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
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAmountInput('')
    setMethod('cash')
    setReference('')
    setPaidAt(TODAY)
    setOrNo(nextOrNo())
    setBusy(false)
    setSubmitError(null)
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
  const amountInvalid = amountInput.trim().length > 0 && amountCentavos <= 0
  const referenceInvalid =
    needsRef && reference.length > 0 && reference.trim().length <= 2
  const valid =
    Boolean(contract) &&
    amountCentavos > 0 &&
    paidAt <= TODAY &&
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
      setSubmitError(result.error)
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
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="font-display text-section-title">Post a payment</DialogTitle>
          <DialogDescription>
            {contract ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-mono text-ink">{contract.contractNo}</span>
                <span>·</span>
                <span>{clientNameOf(contract.clientId)}</span>
                <span>·</span>
                <span className="font-mono">{lotCodeById(contract.lotId)}</span>
              </span>
            ) : (
              'No contract selected.'
            )}
          </DialogDescription>
        </DialogHeader>

        {contract && balance && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 px-3.5 py-2.5">
              <span className="text-caption text-muted">Current balance</span>
              <MoneyText
                centavos={balance.outstandingCentavos}
                className="font-display text-section-title font-semibold text-ink"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="pp-amount" className="text-caption text-muted">
                  Amount
                </Label>
                <Input
                  id="pp-amount"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value)
                    setSubmitError(null)
                  }}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="tabular"
                  autoFocus
                  required
                  aria-invalid={amountInvalid}
                  aria-describedby="pp-amount-help"
                />
                <p
                  id="pp-amount-help"
                  className={cn('text-caption', amountInvalid ? 'text-danger' : 'text-muted')}
                  role={amountInvalid ? 'alert' : undefined}
                >
                  {amountInvalid
                    ? 'Enter a payment amount greater than zero.'
                    : 'Enter the amount received in Philippine pesos.'}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {nextDueCentavos != null && nextDueCentavos > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
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
                      onClick={() =>
                        setAmountInput(String(balance.outstandingCentavos / 100))
                      }
                    >
                      Settle balance ({formatPeso(balance.outstandingCentavos)})
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pp-date" className="text-caption text-muted">
                  Payment date
                </Label>
                <DateField id="pp-date" value={paidAt} onChange={setPaidAt} max={TODAY} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label id="pp-method-label" className="text-caption text-muted">
                Method
              </Label>
              <RadioGroup
                aria-labelledby="pp-method-label"
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                  <div
                    key={m}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 transition-colors',
                      method === m ? 'border-gold bg-gold/8' : 'border-line hover:bg-surface-2',
                    )}
                  >
                    <RadioGroupItem id={`payment-method-${m}`} value={m} />
                    <Icon icon={METHOD_ICON[m]} size={15} className="text-muted" />
                    <Label
                      htmlFor={`payment-method-${m}`}
                      className="min-w-0 flex-1 cursor-pointer whitespace-normal break-words text-body font-normal text-ink"
                    >
                      {PAYMENT_METHOD_LABEL[m]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {needsRef && (
                <div className="space-y-1.5">
                  <Label htmlFor="pp-ref" className="text-caption text-muted">
                    Reference number
                  </Label>
                  <Input
                    id="pp-ref"
                    value={reference}
                    onChange={(e) => {
                      setReference(e.target.value)
                      setSubmitError(null)
                    }}
                    placeholder={method === 'check' ? 'Check no.' : 'Transaction ref.'}
                    className="font-mono"
                    required
                    aria-invalid={referenceInvalid}
                    aria-describedby="pp-ref-help"
                  />
                  <p
                    id="pp-ref-help"
                    className={cn(
                      'text-caption',
                      referenceInvalid ? 'text-danger' : 'text-muted',
                    )}
                    role={referenceInvalid ? 'alert' : undefined}
                  >
                    {referenceInvalid
                      ? 'Enter at least three characters.'
                      : 'Use the check number or transaction reference.'}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="pp-or" className="text-caption text-muted">
                  OR number{' '}
                  {!canEditOr && <span className="text-muted/70">(auto-generated)</span>}
                </Label>
                <Input
                  id="pp-or"
                  value={orNo}
                  onChange={(e) => setOrNo(e.target.value)}
                  readOnly={!canEditOr}
                  className={cn('font-mono', !canEditOr && 'bg-surface-2 text-muted')}
                />
              </div>
            </div>

            <PreviewStrip preview={preview} contract={contract} />
          </div>
        )}

        {submitError && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/8 p-3 text-body text-danger">
            {submitError}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || busy}>
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
  if (!preview) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line px-3.5 py-3 text-body text-muted">
        <Icon icon={IconInfo} size={15} />
        Enter an amount to see what it settles, what accrues to the trust fund and what
        commission it generates.
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
      aria-live="polite"
      className="overflow-hidden rounded-[var(--radius-card)] border border-gold/50 bg-gold/6"
    >
      <div className="flex items-center justify-between gap-3 border-b border-gold/30 px-3.5 py-1.5">
        <span className="eyebrow text-gold-deep dark:text-gold">
          What this payment does
        </span>
        <span className="text-caption text-muted">
          <MoneyText centavos={preview.amountCentavos} className="text-ink" /> received
        </span>
      </div>

      <div className="grid gap-px bg-line/60 sm:grid-cols-3">
        <Cell label="Settles">
          {contract.paymentMode === 'spot_cash' ? (
            <span className="text-body text-ink">
              {preview.settlesContract ? 'The contract in full' : 'Part of the balance'}
            </span>
          ) : preview.appliedRows.length === 0 ? (
            <span className="text-body text-muted">Nothing outstanding</span>
          ) : (
            <span className="text-body text-ink">
              Installment{preview.appliedRows.length > 1 ? 's' : ''}{' '}
              <span className="font-mono">
                {preview.appliedRows.map((r) => r.installmentNo).join(', ')}
              </span>
              <span className="mt-0.5 block text-caption text-muted">
                due {fmtDate(preview.appliedRows[0]!.dueDate)}
                {preview.appliedRows.length > 1 &&
                  ` — ${fmtDate(preview.appliedRows.at(-1)!.dueDate)}`}
              </span>
            </span>
          )}
          {preview.overpaymentCentavos > 0 && (
            <span className="mt-1 block text-caption text-green">
              + {formatPeso(preview.overpaymentCentavos)} credit
            </span>
          )}
        </Cell>

        <Cell label="New balance">
          <span className="flex items-baseline gap-2">
            <MoneyText
              centavos={preview.previousOutstandingCentavos}
              className="text-caption text-muted line-through"
            />
            <MoneyText
              centavos={preview.newOutstandingCentavos}
              className="font-display text-small-title font-semibold text-ink"
            />
          </span>
          {preview.settlesContract && (
            <span className="mt-1 flex items-center gap-1 text-caption text-green">
              <Icon icon={IconCertificate} size={13} />
              Certificate will be issued
            </span>
          )}
        </Cell>

        <Cell label={`Trust fund +${TRUST_FUND_RATE_PERCENT}%`}>
          <span className="flex items-center gap-1.5">
            <Icon icon={IconTrustFund} size={15} className="text-green" />
            <MoneyText
              centavos={preview.trustFundCentavos}
              className="font-display text-small-title font-semibold text-green"
            />
          </span>
        </Cell>
      </div>

      <div className="border-t border-gold/30 px-3.5 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow text-gold-deep dark:text-gold">
            Commission generated
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-caption text-muted">
            on collection
            <AssumedChip why={ASSUMPTIONS.commissionRates.why} label="Rates assumed" />
          </span>
        </div>
        {preview.commissions.length === 0 ? (
          <p className="mt-1 text-body text-muted">No upline on this contract.</p>
        ) : (
          <ul className="mt-1.5 grid gap-1 sm:grid-cols-3">
            {preview.commissions.map((c) => (
              <li
                key={c.level}
                className="flex items-baseline justify-between gap-2 rounded border border-line bg-surface px-2.5 py-1.5"
              >
                <span className="min-w-0 text-caption text-muted">
                  {LEVEL_NAMES[c.level]}
                  <span className="ml-1 tabular">{formatPercent(c.ratePercent, 0)}</span>
                </span>
                <MoneyText centavos={c.amountCentavos} className="text-body text-ink" />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-caption text-muted">
          Total <MoneyText centavos={preview.commissionTotalCentavos} className="text-ink" />
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
