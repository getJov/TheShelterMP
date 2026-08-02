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

  useEffect(() => {
    if (!open) return
    setTo(null)
    setReason('')
  }, [open])

  function submit() {
    if (!contract || !user || !to) return
    const result = requestTransfer(
      { contractId: contract.id, toClientId: to, reason: reason.trim() },
      user,
    )
    if ('error' in result) {
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
      <DialogContent className="flex max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[520px] sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b border-line px-4 pt-[max(1rem,env(safe-area-inset-top))] pr-12 pb-4 text-left sm:px-6 sm:pt-6 sm:pr-12">
          <DialogTitle className="font-display text-[22px]">
            Change of ownership
          </DialogTitle>
          <DialogDescription>
            {contract
              ? `${contract.contractNo} · ${lotCodeById(contract.lotId)}`
              : 'No contract selected.'}
          </DialogDescription>
        </DialogHeader>

        {contract && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <div className="flex flex-col items-stretch gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 px-3.5 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="eyebrow text-muted">Current owner</p>
                <p className="break-words text-[13.5px] text-ink sm:truncate">
                  {clientNameOf(contract.clientId)}
                </p>
              </div>
              <Icon
                icon={IconTransfer}
                size={18}
                className="shrink-0 self-center text-gold-deep dark:text-gold"
              />
              <div className="min-w-0 flex-1">
                <p className="eyebrow text-muted">New owner</p>
                <p className="break-words text-[13.5px] text-ink sm:truncate">
                  {to ? clientNameOf(to) : '—'}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tr-to" className="text-[12.5px] text-muted">
                Transfer to
              </Label>
              <ClientCombobox
                id="tr-to"
                value={to}
                onChange={setTo}
                exclude={contract.clientId}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tr-reason" className="text-[12.5px] text-muted">
                Reason (required)
              </Label>
              <Textarea
                id="tr-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Owner deceased — transferring to the eldest child."
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line px-3.5 py-2.5">
              <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                Transfer fee
                <AssumedChip why={ASSUMPTIONS.ownershipTransferFee.why} />
              </span>
              <MoneyText
                centavos={OWNERSHIP_TRANSFER_FEE}
                className="text-[14px] font-medium text-ink"
              />
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <Button
            variant="ghost"
            className="min-h-11 sm:min-h-0"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="min-h-11 sm:min-h-0"
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
