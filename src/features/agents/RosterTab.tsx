import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  COMMISSION_LEVELS,
  type AgentProfile,
  type CommissionLevel,
} from '@/domain'
import { dataset, indexes } from '@/stores/dataset'
import { levelLabel } from '@/stores/agents'
import { agentCollected, agentEarnings } from '@/lib/finance'
import { fmtDate } from '@/lib/dates'
import { useCan, useCurrentUser, useVisibleLocations } from '@/lib/permissions'
import { useSession } from '@/stores/session'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconAddAgent,
  IconAgents,
  IconCommission,
  IconHierarchy,
  IconListView,
  IconSearch,
} from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  AgentIdentity,
  ArchivedChip,
  LevelBadge,
  RatesAssumed,
  TargetBar,
  useDatasetVersion,
} from './shared'
import { usePeriod } from './period'
import { HierarchyTree } from './HierarchyTree'
import { AgentFormDialog } from './AgentFormDialog'

const ALL = '__all__'

export interface RosterRow {
  agent: AgentProfile
  collectedCentavos: number
  commissionCentavos: number
  activeContracts: number
}

export function useRosterRows(): RosterRow[] {
  const version = useDatasetVersion()
  const period = usePeriod()
  return useMemo(() => {
    void version
    const idx = indexes()
    return dataset().agents.map((agent) => {
      const col = agentCollected(agent.id, period.from, period.to)
      const earn = agentEarnings(agent.id, period.from, period.to)
      const contracts = idx.contractsByAgent.get(agent.id) ?? []
      return {
        agent,
        collectedCentavos: col.centavos,
        commissionCentavos: earn.total,
        activeContracts: contracts.filter((c) => c.status === 'active').length,
      }
    })
  }, [version, period.from, period.to])
}

export function RosterTab() {
  const navigate = useNavigate()
  const rows = useRosterRows()
  const period = usePeriod()
  const user = useCurrentUser()
  const canManage = useCan('agent:manage')
  const locations = useVisibleLocations()
  const activeLocationId = useSession((s) => s.activeLocationId)

  const [view, setView] = useState<'table' | 'tree'>('table')
  const [level, setLevel] = useState<string>(ALL)
  const [locationId, setLocationId] = useState<string>(activeLocationId ?? ALL)
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>('active')
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const canPickLocation = user.role === 'owner' || user.role === 'admin'

  const filtered = useMemo(() => {
    const idx = indexes()
    const needle = q.trim().toLowerCase()
    return rows.filter(({ agent }) => {
      if (level !== ALL && agent.level !== level) return false
      if (locationId !== ALL && agent.locationId !== locationId) return false
      if (status !== 'all' && agent.status !== status) return false
      if (!needle) return true
      const name = idx.usersById.get(agent.userId)?.fullName ?? ''
      return (
        name.toLowerCase().includes(needle) ||
        agent.agentCode.toLowerCase().includes(needle)
      )
    })
  }, [rows, level, locationId, status, q])

  const columns: Column<RosterRow>[] = [
    {
      key: 'agent',
      header: 'Agent',
      width: '230px',
      sortBy: (r) => indexes().usersById.get(r.agent.userId)?.fullName ?? '',
      cell: (r) => (
        <span className="flex items-center gap-2">
          <AgentIdentity agentId={r.agent.id} link={false} />
          <ArchivedChip agent={r.agent} />
        </span>
      ),
    },
    {
      key: 'level',
      header: (
        <span className="inline-flex items-center gap-1.5">
          Level <RatesAssumed />
        </span>
      ),
      sortBy: (r) => r.agent.level,
      cell: (r) => <LevelBadge level={r.agent.level} withRate />,
    },
    {
      key: 'upline',
      header: 'Upline',
      cell: (r) => <UplineCell agent={r.agent} />,
    },
    {
      key: 'location',
      header: 'Location',
      sortBy: (r) => r.agent.locationId,
      cell: (r) => (
        <span className="text-[12.5px] text-muted">
          {indexes().locationsById.get(r.agent.locationId)?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'hired',
      header: 'Hired',
      align: 'right',
      sortBy: (r) => r.agent.hiredAt,
      cell: (r) => (
        <span className="text-[12.5px] text-muted">{fmtDate(r.agent.hiredAt)}</span>
      ),
    },
    {
      key: 'contracts',
      header: 'Active',
      align: 'right',
      sortBy: (r) => r.activeContracts,
      cell: (r) => <span className="tabular">{r.activeContracts}</span>,
    },
    {
      key: 'collected',
      header: 'Collected',
      align: 'right',
      sortBy: (r) => r.collectedCentavos,
      cell: (r) => <MoneyText centavos={r.collectedCentavos} decimals={false} />,
    },
    {
      key: 'commission',
      header: 'Commission',
      align: 'right',
      sortBy: (r) => r.commissionCentavos,
      cell: (r) => (
        <MoneyText
          centavos={r.commissionCentavos}
          decimals={false}
          className="text-gold-deep dark:text-gold"
        />
      ),
    },
    {
      key: 'target',
      header: 'Target',
      width: '150px',
      sortBy: (r) =>
        r.agent.monthlyTargetCentavos
          ? r.collectedCentavos / r.agent.monthlyTargetCentavos
          : -1,
      cell: (r) => (
        <TargetBar
          collected={r.collectedCentavos}
          target={r.agent.monthlyTargetCentavos}
        />
      ),
    },
  ]

  const totals = filtered.reduce(
    (a, r) => ({
      collected: a.collected + r.collectedCentavos,
      commission: a.commission + r.commissionCentavos,
    }),
    { collected: 0, commission: 0 },
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Icon
            icon={IconSearch}
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or code"
            className="h-8 w-[210px] pl-8 text-[13px]"
          />
        </div>

        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger size="sm" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All levels</SelectItem>
            {COMMISSION_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {levelLabel(l as CommissionLevel)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canPickLocation && (
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger size="sm" className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id as string}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger size="sm" className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={view}
            onValueChange={(v) => v && setView(v as typeof view)}
          >
            <ToggleGroupItem value="table" aria-label="Table view" className="gap-1.5">
              <Icon icon={IconListView} size={15} /> Table
            </ToggleGroupItem>
            <ToggleGroupItem value="tree" aria-label="Hierarchy view" className="gap-1.5">
              <Icon icon={IconHierarchy} size={15} /> Hierarchy
            </ToggleGroupItem>
          </ToggleGroup>

          {canManage && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Icon icon={IconAddAgent} size={15} /> New agent
            </Button>
          )}
        </div>
      </div>

      <motion.div
        key={view}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {view === 'table' ? (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.agent.id}
            onRowClick={(r) => navigate(`/agents/${r.agent.id}`)}
            emptyIcon={IconAgents}
            empty={{
              title: 'No agents match',
              body: 'Widen the filters — archived agents are hidden by default.',
            }}
            initialSort={{ key: 'collected', dir: 'desc' }}
            footer={
              <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span>
                  {filtered.length} agent{filtered.length === 1 ? '' : 's'}
                </span>
                <span>
                  Collected {period.label}:{' '}
                  <MoneyText
                    centavos={totals.collected}
                    decimals={false}
                    className="font-medium text-ink"
                  />
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon icon={IconCommission} size={13} />
                  Commission:{' '}
                  <MoneyText
                    centavos={totals.commission}
                    decimals={false}
                    className="font-medium text-ink"
                  />
                </span>
              </span>
            }
          />
        ) : (
          <HierarchyTree rows={filtered} />
        )}
      </motion.div>

      {canManage && (
        <AgentFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      )}
    </div>
  )
}

function UplineCell({ agent }: { agent: AgentProfile }) {
  const idx = indexes()
  const tl = agent.teamLeaderId ? idx.agentsById.get(agent.teamLeaderId) : null
  const dist = agent.distributorId ? idx.agentsById.get(agent.distributorId) : null
  const names = [tl, dist]
    .filter((a): a is AgentProfile => Boolean(a))
    .map((a) => idx.usersById.get(a.userId)?.fullName ?? a.agentCode)
  if (names.length === 0)
    return <span className="text-[12.5px] text-muted">Top of tree</span>
  return (
    <span className="text-[12.5px] text-muted">
      {names.map((n, i) => (
        <span key={n}>
          {i > 0 && <span className="px-1 opacity-50">›</span>}
          {n}
        </span>
      ))}
    </span>
  )
}
