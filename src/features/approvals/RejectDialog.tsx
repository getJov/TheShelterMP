import { useEffect, useState } from 'react'
import type { ApprovalTask } from '@/domain'
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
import { Icon } from '@/components/ui-brand/Icon'
import { IconWarning } from '@/components/ui-brand/icons'
import { KIND_META } from './lib'
import { taskHeadline } from './details'

/** What a rejection actually does, stated rather than implied. */
const CONSEQUENCE: Record<ApprovalTask['kind'], string> = {
  hold: 'The lot returns to available immediately and the requesting agent is told why.',
  contract:
    'The contract is cancelled, unreleased commission is voided, released commission is flagged for clawback, and the lot returns to available.',
  discount:
    'The contract is cancelled, unreleased commission is voided and the lot returns to available. Re-draw it without the discount if the sale should stand.',
  interment:
    'The booking is cancelled and the slot is released back to the calendar.',
  payout_run:
    'The run goes back for revision. Nothing is released and no entry changes status.',
  ownership_transfer: 'Ownership is left exactly as it is.',
}

/**
 * A reason is mandatory. A rejection with no reason forces a phone call,
 * which is the thing this system exists to remove.
 */
export function RejectDialog({
  task,
  onOpenChange,
  onConfirm,
}: {
  task: ApprovalTask | null
  onOpenChange: (open: boolean) => void
  onConfirm: (task: ApprovalTask, reason: string) => void
}) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (task) setReason('')
  }, [task])

  if (!task) return null
  const meta = KIND_META[task.kind]

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[22px]">
            Reject this {meta.label.toLowerCase()}?
          </DialogTitle>
          <DialogDescription>{taskHeadline(task)}</DialogDescription>
        </DialogHeader>

        <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-danger/40 bg-danger/8 p-3 text-[12.5px] leading-relaxed text-ink">
          <Icon icon={IconWarning} size={15} className="mt-0.5 shrink-0 text-danger" />
          {CONSEQUENCE[task.kind]}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="reject-reason" className="text-[12.5px] text-muted">
            Reason (required)
          </Label>
          <Textarea
            id="reject-reason"
            rows={3}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="The family already reserved the adjacent lot…"
          />
          <p className="text-[11.5px] text-muted">
            The person who asked sees this reason, and it goes onto the audit trail.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 3}
            onClick={() => onConfirm(task, reason.trim())}
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
