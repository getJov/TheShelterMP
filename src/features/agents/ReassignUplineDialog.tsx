import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { AgentId, AgentProfile } from '@/domain'
import { dataset, indexes } from '@/stores/dataset'
import { agentName, useAgents } from '@/stores/agents'
import { useCurrentUser } from '@/lib/permissions'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icon } from '@/components/ui-brand/Icon'
import { IconInfo } from '@/components/ui-brand/icons'

const NONE = '__none__'

export function ReassignUplineDialog({
  open,
  onOpenChange,
  agent,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  agent: AgentProfile
}) {
  const user = useCurrentUser()
  const reassignUpline = useAgents((s) => s.reassignUpline)
  const [teamLeaderId, setTeamLeaderId] = useState(agent.teamLeaderId ?? NONE)
  const [distributorId, setDistributorId] = useState(agent.distributorId ?? NONE)

  useEffect(() => {
    if (open) {
      setTeamLeaderId(agent.teamLeaderId ?? NONE)
      setDistributorId(agent.distributorId ?? NONE)
    }
  }, [open, agent.teamLeaderId, agent.distributorId])

  const candidates = useMemo(() => {
    const all = dataset().agents.filter(
      (a) => a.status === 'active' && a.id !== agent.id,
    )
    return {
      teamLeaders: all.filter((a) => a.level === 'team_leader'),
      distributors: all.filter((a) => a.level === 'distributor'),
    }
  }, [agent.id])

  const contracts = (indexes().contractsByAgent.get(agent.id) ?? []).length

  const pickTeamLeader = (v: string) => {
    setTeamLeaderId(v)
    if (v !== NONE) {
      const tl = indexes().agentsById.get(v as AgentId)
      if (tl?.distributorId) setDistributorId(tl.distributorId)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Reassign upline</DialogTitle>
          <DialogDescription>
            Who {agentName(agent.id)} reports to from now on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-[12px] text-muted">Team leader</Label>
            <Select value={teamLeaderId} onValueChange={pickTeamLeader}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {candidates.teamLeaders.map((a) => (
                  <SelectItem key={a.id} value={a.id as string}>
                    {agentName(a.id)} · {a.agentCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block text-[12px] text-muted">Distributor</Label>
            <Select value={distributorId} onValueChange={setDistributorId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {candidates.distributors.map((a) => (
                  <SelectItem key={a.id} value={a.id as string}>
                    {agentName(a.id)} · {a.agentCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="flex gap-2 rounded-md border border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed text-muted">
            <Icon icon={IconInfo} size={15} className="mt-0.5 shrink-0" />
            <span>
              This changes future attribution only. The{' '}
              <strong className="font-medium text-ink">{contracts}</strong> contract
              {contracts === 1 ? '' : 's'} already signed keep their recorded
              upline, so past commission entries do not move.
            </span>
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              reassignUpline(
                agent.id,
                {
                  teamLeaderId:
                    teamLeaderId === NONE ? null : (teamLeaderId as AgentId),
                  distributorId:
                    distributorId === NONE ? null : (distributorId as AgentId),
                },
                user.id,
              )
              toast.success('Upline reassigned', {
                description: 'Future contracts only — history is untouched.',
              })
              onOpenChange(false)
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
