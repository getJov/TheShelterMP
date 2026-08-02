import { useState } from 'react'
import { toast } from 'sonner'
import type { AgentProfile } from '@/domain'
import { agentName, useAgents } from '@/stores/agents'
import { useCurrentUser } from '@/lib/permissions'
import { formatPeso } from '@/lib/money'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Icon } from '@/components/ui-brand/Icon'
import { IconCheck, IconWarning } from '@/components/ui-brand/icons'

/**
 * Archiving revokes access and preserves everything else. The consequences
 * are listed precisely rather than warned about vaguely, because the client
 * was explicit that history must survive.
 */
export function ArchiveAgentDialog({
  open,
  onOpenChange,
  agent,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  agent: AgentProfile
}) {
  const user = useCurrentUser()
  const archiveAgent = useAgents((s) => s.archiveAgent)
  const archiveImpact = useAgents((s) => s.archiveImpact)
  const [reason, setReason] = useState('')

  const impact = archiveImpact(agent.id)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[520px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {agentName(agent.id)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Access is revoked immediately. Everything they earned and everything
            attributed to them stays exactly where it is.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="space-y-2 rounded-md border border-line bg-surface-2 p-3.5 text-caption">
          <Consequence tone="warn">
            Their login is disabled immediately — they cannot sign in again until
            restored.
          </Consequence>
          <Consequence>
            <strong className="font-medium text-ink">
              {impact.activeContracts} active contract
              {impact.activeContracts === 1 ? '' : 's'}
            </strong>{' '}
            remain attributed to them. A &ldquo;Reassign selling agent&rdquo; action
            on the contract changes future attribution only.
          </Consequence>
          <Consequence>
            <strong className="font-medium text-ink">
              {formatPeso(impact.unreleasedCentavos)}
            </strong>{' '}
            of accrued and approved commission will still be released on its normal
            schedule.
          </Consequence>
          <Consequence>
            They remain in historical leaderboards, greyed with an
            &ldquo;Archived&rdquo; chip.
          </Consequence>
          {impact.downline > 0 && (
            <Consequence tone="warn">
              {impact.downline} agent{impact.downline === 1 ? '' : 's'} report to
              them. Reassign that downline separately — archiving does not move it.
            </Consequence>
          )}
        </ul>

        <div>
          <Label htmlFor="archive-agent-reason" className="mb-1.5 block text-caption text-muted">
            Reason (required)
          </Label>
          <Textarea
            id="archive-agent-reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Resigned, transferred, inactive…"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">Cancel</Button>
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 3}
            onClick={() => {
              archiveAgent(agent.id, reason.trim(), user.id)
              toast.success(`${agentName(agent.id)} archived`, {
                description: 'Access revoked. Attribution and commission preserved.',
              })
              setReason('')
              onOpenChange(false)
            }}
          >
            Archive agent
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Consequence({
  children,
  tone,
}: {
  children: React.ReactNode
  tone?: 'warn'
}) {
  return (
    <li className="flex gap-2.5 text-muted">
      <Icon
        icon={tone === 'warn' ? IconWarning : IconCheck}
        size={15}
        className={tone === 'warn' ? 'mt-0.5 text-danger' : 'mt-0.5 text-green'}
      />
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}
