import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ASSUMPTIONS, type Contract } from '@/domain'
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
import { Icon } from '@/components/ui-brand/Icon'
import { IconCheck, IconWarning } from '@/components/ui-brand/icons'
import { useDataset } from '@/stores/dataset'
import { cancelConsequences, useSales } from '@/stores/sales'
import { useCurrentUserOrNull } from '@/lib/permissions'
import { formatCount } from '@/lib/money'

/**
 * Cancellation is irreversible in effect, so the consequences are computed
 * live from the real data and shown BEFORE the confirm button — real counts,
 * not a generic warning.
 */
export function CancelContractDialog({
  contract,
  open,
  onOpenChange,
  onCancelled,
}: {
  contract: Contract | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onCancelled?: () => void
}) {
  const version = useDataset((s) => s.version)
  const user = useCurrentUserOrNull()
  const cancelContract = useSales((s) => s.cancelContract)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const c = useMemo(() => {
    void version
    return contract ? cancelConsequences(contract) : null
  }, [contract, version])

  function confirm() {
    if (!contract || !user) return
    cancelContract(contract.id, reason.trim(), user)
    toast.success(`Contract ${contract.contractNo} cancelled.`, {
      description: `${c?.lotCode ?? 'The lot'} has returned to available.`,
    })
    onOpenChange(false)
    onCancelled?.()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[560px] sm:rounded-lg">
        <AlertDialogHeader className="shrink-0 border-b border-line px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 text-left sm:px-6 sm:pt-6">
          <AlertDialogTitle className="font-display text-[21px]">
            Cancel contract {contract?.contractNo}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This writes an audit event and cannot be undone from the app.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {c && (
            <ul className="space-y-2 rounded-[var(--radius-card)] border border-line bg-surface-2 p-3.5 text-[12.5px]">
              <Consequence tone="warn">
                Lot <span className="font-mono text-ink">{c.lotCode}</span> returns to{' '}
                <span className="text-ink">available</span>.
              </Consequence>
              <Consequence tone="warn">
                <span className="text-ink">{formatCount(c.toVoid.count)}</span> commission{' '}
                {c.toVoid.count === 1 ? 'entry' : 'entries'} totalling{' '}
                <MoneyText centavos={c.toVoid.centavos} className="text-ink" /> will be{' '}
                <span className="text-ink">voided</span>.
              </Consequence>
              <Consequence tone="warn">
                <span className="text-ink">{formatCount(c.toClawback.count)}</span> released{' '}
                {c.toClawback.count === 1 ? 'entry' : 'entries'} totalling{' '}
                <MoneyText centavos={c.toClawback.centavos} className="text-ink" /> will be
                flagged <span className="text-ink">clawback pending</span>.
                <AssumedChip
                  className="ml-1.5"
                  why={ASSUMPTIONS.cancellationClawback.why}
                />
              </Consequence>
              <Consequence tone="ok">
                The trust-fund accrual of{' '}
                <MoneyText centavos={c.trustFundRetainedCentavos} className="text-ink" /> is{' '}
                <span className="text-ink">retained</span> — perpetual care is never reversed.
              </Consequence>
              <Consequence tone="warn">
                <MoneyText centavos={c.paidCentavos} className="text-ink" /> already collected
                stays on the ledger. Refunds are handled off-system.
              </Consequence>
            </ul>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cc-reason" className="text-[12.5px] text-muted">
              Reason (required)
            </Label>
            <Textarea
              id="cc-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Buyer requested cancellation after two missed installments."
            />
          </div>
        </div>

        <AlertDialogFooter className="shrink-0 border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <AlertDialogCancel className="min-h-11 sm:min-h-0">
            Keep contract
          </AlertDialogCancel>
          <Button
            variant="destructive"
            className="min-h-11 sm:min-h-0"
            disabled={reason.trim().length < 4}
            onClick={confirm}
          >
            Cancel contract
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Consequence({
  tone,
  children,
}: {
  tone: 'warn' | 'ok'
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-2 leading-snug text-muted">
      <Icon
        icon={tone === 'ok' ? IconCheck : IconWarning}
        size={14}
        className={tone === 'ok' ? 'mt-0.5 text-green' : 'mt-0.5 text-danger'}
      />
      <span className="min-w-0">{children}</span>
    </li>
  )
}
