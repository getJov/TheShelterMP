import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ASSUMPTIONS,
  OWNERSHIP_TRANSFER_FEE,
  type ClientId,
  type Contract,
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import { IconTransfer } from '@/components/ui-brand/icons'
import { useSales } from '@/stores/sales'
import { useCurrentUserOrNull } from '@/lib/permissions'
import { ClientCombobox } from './ClientCombobox'
import { clientNameOf, lotCodeById } from '../lib'

/**
 * The client called this "change in ownership code" and said it happens on
 * paper today. Showing it as a two-step approved workflow is the point.
 */
export function TransferOwnershipDialog({
  contract,
  open,
  onOpenChange,
}: {
  contract: Contract | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const user = useCurrentUserOrNull()
  const requestTransfer = useSales((s) => s.requestTransfer)
  const [to, setTo] = useState<ClientId | null>(null)
  const [reason, setReason] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTo(null)
    setReason('')
    setSubmitError(null)
  }, [open])

  function submit() {
    if (!contract || !user || !to) return
    const result = requestTransfer(
      { contractId: contract.id, toClientId: to, reason: reason.trim() },
      user,
    )
    if ('error' in result) {
      setSubmitError(result.error)
      toast.error(result.error)
      return
    }
    toast.success('Ownership transfer filed.', {
      description: 'An administrator must approve it before the record changes.',
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-section-title">
            Change of ownership
          </DialogTitle>
          <DialogDescription>
            {contract
              ? `${contract.contractNo} · ${lotCodeById(contract.lotId)}`
              : 'No contract selected.'}
          </DialogDescription>
        </DialogHeader>

        {contract && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="eyebrow text-muted">Current owner</p>
                <p className="whitespace-normal break-words text-body text-ink">
                  {clientNameOf(contract.clientId)}
                </p>
              </div>
              <Icon icon={IconTransfer} size={18} className="shrink-0 text-gold-deep dark:text-gold" />
              <div className="min-w-0 flex-1">
                <p className="eyebrow text-muted">New owner</p>
                <p className="whitespace-normal break-words text-body text-ink">
                  {to ? clientNameOf(to) : '—'}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tr-to" className="text-caption text-muted">
                Transfer to
              </Label>
              <ClientCombobox
                id="tr-to"
                value={to}
                onChange={(id) => {
                  setTo(id)
                  setSubmitError(null)
                }}
                exclude={contract.clientId}
                required
                describedBy="tr-to-help"
              />
              <p id="tr-to-help" className="text-caption text-muted">
                Select the person who will become the recorded owner after approval.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tr-reason" className="text-caption text-muted">
                Reason (required)
              </Label>
              <Textarea
                id="tr-reason"
                rows={2}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  setSubmitError(null)
                }}
                placeholder="Owner deceased — transferring to the eldest child."
                required
                aria-invalid={reason.length > 0 && reason.trim().length < 4}
                aria-describedby="tr-reason-help"
              />
              <p id="tr-reason-help" className="text-caption text-muted">
                Enter at least four characters for the approval record.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line px-3.5 py-2.5">
              <span className="flex flex-wrap items-center gap-1.5 text-caption text-muted">
                Transfer fee
                <AssumedChip why={ASSUMPTIONS.ownershipTransferFee.why} />
              </span>
              <MoneyText
                centavos={OWNERSHIP_TRANSFER_FEE}
                className="text-body font-medium text-ink"
              />
            </div>
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
          <Button
            onClick={submit}
            disabled={!to || reason.trim().length < 4}
          >
            File for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
