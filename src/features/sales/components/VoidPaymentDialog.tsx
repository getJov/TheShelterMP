import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ASSUMPTIONS, type Payment } from '@/domain'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { useSales } from '@/stores/sales'
import { useCurrentUserOrNull } from '@/lib/permissions'
import { fmtDate } from '@/lib/dates'

/** Admin only. The record is never deleted — it stays struck through. */
export function VoidPaymentDialog({
  payment,
  open,
  onOpenChange,
}: {
  payment: Payment | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const user = useCurrentUserOrNull()
  const voidPayment = useSales((s) => s.voidPayment)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  function confirm() {
    if (!payment || !user) return
    voidPayment(payment.id, reason.trim(), user)
    toast.success(`${payment.orNo} voided.`, {
      description:
        'Schedule, trust fund and unreleased commission reversed. The record stays in the ledger.',
    })
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[520px] sm:rounded-lg">
        <AlertDialogHeader className="shrink-0 border-b border-line px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 text-left sm:px-6 sm:pt-6">
          <AlertDialogTitle className="font-display text-[21px]">
            Void {payment?.orNo}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {payment && (
              <>
                <MoneyText centavos={payment.amountCentavos} className="text-ink" /> received{' '}
                {fmtDate(payment.paidAt)}.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <ul className="space-y-1.5 rounded-[var(--radius-card)] border border-line bg-surface-2 p-3.5 text-[12.5px] leading-snug text-muted">
            <li>The schedule is rebuilt from the payments that remain posted.</li>
            <li>
              The trust-fund entry of{' '}
              <MoneyText
                centavos={payment?.trustFundCentavos ?? 0}
                className="text-ink"
              />{' '}
              is reversed and the running balance restated.
            </li>
            <li className="flex flex-wrap items-center gap-1.5">
              Unreleased commission is voided; released commission becomes clawback pending.
              <AssumedChip why={ASSUMPTIONS.cancellationClawback.why} />
            </li>
            <li>
              If this payment completed the contract, the certificate is withdrawn and the
              contract returns to active.
            </li>
          </ul>

          <div className="space-y-1.5">
            <Label htmlFor="vp-reason" className="text-[12.5px] text-muted">
              Reason (required)
            </Label>
            <Textarea
              id="vp-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Duplicate posting — corrected receipt issued."
            />
          </div>
        </div>

        <AlertDialogFooter className="shrink-0 border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <AlertDialogCancel className="min-h-11 sm:min-h-0">
            Keep payment
          </AlertDialogCancel>
          <Button
            variant="destructive"
            className="min-h-11 sm:min-h-0"
            disabled={reason.trim().length < 4}
            onClick={confirm}
          >
            Void payment
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
