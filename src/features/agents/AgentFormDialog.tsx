import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  COMMISSION_LEVELS,
  type AgentId,
  type AgentProfile,
  type CommissionLevel,
  type LocationId,
} from '@/domain'
import { dataset, indexes } from '@/stores/dataset'
import { agentName, levelLabel, nextAgentCode, rateOf, useAgents } from '@/stores/agents'
import { useCurrentUser, useVisibleLocations } from '@/lib/permissions'
import { TODAY } from '@/mock'
import { formatPercent, parsePeso } from '@/lib/money'
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
import { cn } from '@/lib/utils'
import { DateField, RatesAssumed } from './shared'

const NONE = '__none__'

interface FormState {
  fullName: string
  email: string
  phone: string
  agentCode: string
  level: CommissionLevel
  teamLeaderId: string
  distributorId: string
  locationId: string
  hiredAt: string
  target: string
}

export function AgentFormDialog({
  open,
  onOpenChange,
  mode,
  agent,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'create' | 'edit'
  agent?: AgentProfile
}) {
  const user = useCurrentUser()
  const locations = useVisibleLocations()
  const createAgent = useAgents((s) => s.createAgent)
  const updateAgent = useAgents((s) => s.updateAgent)
  const reassignUpline = useAgents((s) => s.reassignUpline)

  const blank = (): FormState => {
    const u = agent ? indexes().usersById.get(agent.userId) : null
    return {
      fullName: u?.fullName ?? '',
      email: u?.email ?? '',
      phone: u?.phone ?? '',
      agentCode: agent?.agentCode ?? nextAgentCode(),
      level: agent?.level ?? 'associate',
      teamLeaderId: agent?.teamLeaderId ?? NONE,
      distributorId: agent?.distributorId ?? NONE,
      locationId: agent?.locationId ?? (locations[0]?.id ?? ''),
      hiredAt: agent?.hiredAt ?? TODAY,
      target:
        agent?.monthlyTargetCentavos != null
          ? String(agent.monthlyTargetCentavos / 100)
          : '',
    }
  }

  const [form, setForm] = useState<FormState>(blank)
  useEffect(() => {
    if (open) setForm(blank())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agent?.id])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }))

  const candidates = useMemo(() => {
    const all = dataset().agents.filter(
      (a) => a.status === 'active' && a.id !== agent?.id,
    )
    return {
      teamLeaders: all.filter((a) => a.level === 'team_leader'),
      distributors: all.filter((a) => a.level === 'distributor'),
    }
  }, [agent?.id])

  // Choosing a team leader resolves their distributor automatically.
  const pickTeamLeader = (v: string) => {
    if (v === NONE) {
      set('teamLeaderId', NONE)
      return
    }
    const tl = indexes().agentsById.get(v as AgentId)
    setForm((s) => ({
      ...s,
      teamLeaderId: v,
      distributorId: tl?.distributorId ?? s.distributorId,
    }))
  }

  const valid =
    form.fullName.trim().length > 2 &&
    form.email.includes('@') &&
    form.agentCode.trim().length > 0 &&
    form.locationId.length > 0

  const submit = () => {
    const target = form.target.trim() ? parsePeso(form.target) : null
    if (mode === 'create') {
      const created = createAgent(
        {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          agentCode: form.agentCode.trim(),
          level: form.level,
          teamLeaderId:
            form.teamLeaderId === NONE ? null : (form.teamLeaderId as AgentId),
          distributorId:
            form.distributorId === NONE ? null : (form.distributorId as AgentId),
          locationId: form.locationId as LocationId,
          hiredAt: form.hiredAt,
          monthlyTargetCentavos: target,
        },
        user.id,
      )
      toast.success(`${form.fullName} added`, {
        description: `${created.agentCode} · a login was created with the agent role, scoped to this location.`,
      })
    } else if (agent) {
      updateAgent(
        agent.id,
        {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          agentCode: form.agentCode.trim(),
          level: form.level,
          locationId: form.locationId as LocationId,
          hiredAt: form.hiredAt,
          monthlyTargetCentavos: target,
        },
        user.id,
      )
      reassignUpline(
        agent.id,
        {
          teamLeaderId:
            form.teamLeaderId === NONE ? null : (form.teamLeaderId as AgentId),
          distributorId:
            form.distributorId === NONE ? null : (form.distributorId as AgentId),
        },
        user.id,
      )
      toast.success('Agent updated', {
        description: 'Existing contracts keep the upline they were signed with.',
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New agent' : 'Edit agent'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Creates the agent profile and login.'
              : 'Future contracts use the updated upline. Past commissions are unchanged.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <Input
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                placeholder="Grace A. Delos Reyes"
              />
            </Field>
            <Field label="Agent code">
              <Input
                value={form.agentCode}
                onChange={(e) => set('agentCode', e.target.value)}
                className="font-mono"
              />
            </Field>
            <Field label="Email">
              <Input
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="name@sheltermemorialpark.ph"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="0917 000 0000"
              />
            </Field>
          </div>

          <div>
            <Label className="mb-2 flex items-center gap-2 text-caption text-muted">
              Level <RatesAssumed />
            </Label>
            <RadioGroup
              value={form.level}
              onValueChange={(v) => set('level', v as CommissionLevel)}
              className="grid gap-2 sm:grid-cols-3"
            >
              {COMMISSION_LEVELS.map((l) => (
                <label
                  key={l}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md border p-2.5 transition-colors',
                    form.level === l
                      ? 'border-gold/60 bg-gold/10'
                      : 'border-line hover:bg-surface-2',
                  )}
                >
                  <RadioGroupItem value={l} className="mt-0.5" />
                  <span>
                    <span className="block text-caption font-medium text-ink">
                      {levelLabel(l)}
                    </span>
                    <span className="block tabular text-caption text-muted">
                      {formatPercent(rateOf(l))} of every payment
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Team leader">
              <Select value={form.teamLeaderId} onValueChange={pickTeamLeader}>
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
            </Field>
            <Field label="Distributor">
              <Select
                value={form.distributorId}
                onValueChange={(v) => set('distributorId', v)}
              >
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
            </Field>
            <Field label="Location">
              <Select
                value={form.locationId}
                onValueChange={(v) => set('locationId', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id as string}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Hire date">
              <DateField
                value={form.hiredAt}
                onChange={(v) => set('hiredAt', v)}
                className="w-full justify-start"
              />
            </Field>
            <Field label="Monthly target (₱, optional)">
              <Input
                value={form.target}
                inputMode="decimal"
                onChange={(e) => set('target', e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="Leave blank for no target"
                className="tabular"
              />
            </Field>
          </div>

          <p className="text-caption leading-relaxed text-muted">
            The upline recorded here is copied onto every contract this agent signs
            from now on. Contracts already signed keep the upline they were signed
            with — an agent moving teams must not rewrite last year&rsquo;s payouts.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={submit}>
            {mode === 'create' ? 'Create agent' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-caption text-muted">{label}</Label>
      {children}
    </div>
  )
}
