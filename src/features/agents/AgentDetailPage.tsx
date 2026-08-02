import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ASSUMPTIONS,
  CONTRACT_STATUS_LABEL,
  type AgentId,
  type AgentProfile,
  type Contract,
} from '@/domain'
import { indexes } from '@/stores/dataset'
import { agentName, levelLabel, rateOf, useAgents } from '@/stores/agents'
import {
  agentCollected,
  agentEarnings,
  balanceOf,
  trailingMonths,
} from '@/lib/finance'
import { useCan, useCurrentUser } from '@/lib/permissions'
import { fmtDate } from '@/lib/dates'
import { formatPercent, formatPeso } from '@/lib/money'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { StatCard } from '@/components/ui-brand/StatCard'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconAgents,
  IconArchive,
  IconChevronLeft,
  IconEdit,
  IconIncentive,
  IconMail,
  IconPhone,
  IconUndo,
  IconUpline,
} from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  AgentAvatar,
  AgentIdentity,
  ArchivedChip,
  LevelBadge,
  RatesAssumed,
  TargetRing,
  useDatasetVersion,
} from './shared'
import { usePeriod } from './period'
import { AgentFormDialog } from './AgentFormDialog'
import { ArchiveAgentDialog } from './ArchiveAgentDialog'
import { ReassignUplineDialog } from './ReassignUplineDialog'
import { AgentCommissionsByRun } from './AgentCommissionsByRun'

export function AgentDetailPage() {
  const version = useDatasetVersion()
  const { agentId } = useParams<{ agentId: string }>()
  const period = usePeriod()
  const canManage = useCan('agent:manage')
  const currentUser = useCurrentUser()
  const restoreAgent = useAgents((s) => s.restoreAgent)
  const downlineOf = useAgents((s) => s.downlineOf)

  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [uplineOpen, setUplineOpen] = useState(false)

  const agent = useMemo(() => {
    void version
    return agentId ? (indexes().agentsById.get(agentId as AgentId) ?? null) : null
  }, [version, agentId])

  const stats = useMemo(() => {
    void version
    if (!agent) return null
    const col = agentCollected(agent.id, period.from, period.to)
    const earn = agentEarnings(agent.id, period.from, period.to)
    const contracts = (indexes().contractsByAgent.get(agent.id) ?? []).slice()
    const written = contracts.filter(
      (c) => c.signedAt >= period.from && c.signedAt <= period.to,
    ).length
    return { col, earn, contracts, written }
  }, [version, agent, period.from, period.to])

  const series = useMemo(() => {
    void version
    if (!agent) return []
    return trailingMonths(12).map((m) => ({
      label: m.label,
      collected: agentCollected(agent.id, m.from, m.to).centavos / 100,
      commission: agentEarnings(agent.id, m.from, m.to).total / 100,
    }))
  }, [version, agent])

  if (!agent || !stats) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <EmptyState
          icon={IconAgents}
          title="Agent not found"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/agents">Back to roster</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const user = indexes().usersById.get(agent.userId)
  const archived = agent.status === 'archived'
  const downline = downlineOf(agent.id)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1120px] space-y-5 px-4 py-6 sm:px-6">
        {/* ── header ─────────────────────────────────────────── */}
        <div>
          <Link
            to="/agents"
            className="inline-flex items-center gap-1.5 text-caption text-muted hover:text-ink"
          >
            <Icon icon={IconChevronLeft} size={14} /> Roster
          </Link>

          <div className="mt-2 flex flex-wrap items-start gap-4">
            <AgentAvatar agentId={agent.id} size={58} />
            <div className="min-w-0 flex-[1_1_240px]">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-display text-page-title font-semibold leading-tight text-ink">
                  {agentName(agent.id)}
                </h2>
                <LevelBadge level={agent.level} withRate />
                <RatesAssumed />
                <ArchivedChip agent={agent} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted">
                <span className="font-mono">{agent.agentCode}</span>
                <span>
                  {indexes().locationsById.get(agent.locationId)?.name ?? '—'}
                </span>
                <span>Hired {fmtDate(agent.hiredAt)}</span>
                {user?.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon icon={IconMail} size={13} /> {user.email}
                  </span>
                )}
                {user?.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon icon={IconPhone} size={13} /> {user.phone}
                  </span>
                )}
              </p>
            </div>

            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setEditOpen(true)}
                >
                  <Icon icon={IconEdit} size={15} /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setUplineOpen(true)}
                >
                  <Icon icon={IconUpline} size={15} /> Reassign upline
                </Button>
                {archived ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => restoreAgent(agent.id, currentUser.id)}
                  >
                    <Icon icon={IconUndo} size={15} /> Restore
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-danger"
                    onClick={() => setArchiveOpen(true)}
                  >
                    <Icon icon={IconArchive} size={15} /> Archive
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── stats ──────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={`Contracts written · ${period.label}`}
            value={String(stats.written)}
            hint={`${stats.contracts.filter((c) => c.status === 'active').length} active in total`}
          />
          <StatCard
            label="Value collected"
            value={formatPeso(stats.col.centavos, { decimals: false })}
            hint={`${stats.col.contracts} contract${stats.col.contracts === 1 ? '' : 's'} paid into`}
          />
          <StatCard
            label="Commission earned"
            value={formatPeso(stats.earn.total, { decimals: false })}
            hint={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                Accrued {formatPeso(stats.earn.accrued, { decimals: false })} · Released{' '}
                {formatPeso(stats.earn.released, { decimals: false })}
                <RatesAssumed />
              </span>
            }
          />
          <div className="flex items-center justify-center rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <TargetRing
              collected={stats.col.centavos}
              target={agent.monthlyTargetCentavos}
            />
            <div className="ml-4">
              <p className="eyebrow text-muted">Target</p>
              <p className="mt-1 text-caption text-ink">
                {agent.monthlyTargetCentavos
                  ? formatPeso(agent.monthlyTargetCentavos, { decimals: false })
                  : 'Not set'}
              </p>
              <p className="text-caption text-muted">monthly</p>
            </div>
          </div>
        </div>

        {/* ── hierarchy ──────────────────────────────────────── */}
        <UplineDiagram agent={agent} downline={downline} />

        {/* ── performance ────────────────────────────────────── */}
        <section className="rounded-[var(--radius-card)] border border-line bg-surface">
          <header className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
            <p className="eyebrow text-gold-deep dark:text-gold">
              Twelve months — collected value with commission overlaid
            </p>
          </header>
          <div className="h-[240px] px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid
                  stroke="var(--color-line-soft)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 'var(--type-caption)', fill: 'var(--color-muted)' }}
                  axisLine={{ stroke: 'var(--color-line)' }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 'var(--type-caption)', fill: 'var(--color-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                  tickFormatter={(v: number) => formatPeso(v * 100, { compact: true })}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 'var(--type-caption)', fill: 'var(--color-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                  tickFormatter={(v: number) => formatPeso(v * 100, { compact: true })}
                />
                <RTooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-line)',
                    borderRadius: 8,
                    fontSize: 'var(--type-caption)',
                  }}
                  formatter={(v: number, name: string) => [
                    formatPeso(v * 100, { decimals: false }),
                    name === 'collected' ? 'Collected' : 'Commission',
                  ]}
                />
                <Bar
                  yAxisId="left"
                  dataKey="collected"
                  fill="var(--color-gold)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="commission"
                  stroke="var(--color-green)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ── sales ──────────────────────────────────────────── */}
        <ContractsSection contracts={stats.contracts} />

        {/* ── commissions ────────────────────────────────────── */}
        <AgentCommissionsByRun agentId={agent.id} />

        {/* ── incentives ─────────────────────────────────────── */}
        <IncentivesSection />
      </div>

      {canManage && (
        <>
          <AgentFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            mode="edit"
            agent={agent}
          />
          <ArchiveAgentDialog
            open={archiveOpen}
            onOpenChange={setArchiveOpen}
            agent={agent}
          />
          <ReassignUplineDialog
            open={uplineOpen}
            onOpenChange={setUplineOpen}
            agent={agent}
          />
        </>
      )}
    </div>
  )
}

// ── upline / downline ────────────────────────────────────────────────
function UplineDiagram({
  agent,
  downline,
}: {
  agent: AgentProfile
  downline: AgentProfile[]
}) {
  const idx = indexes()
  const tl = agent.teamLeaderId ? idx.agentsById.get(agent.teamLeaderId) : null
  const dist = agent.distributorId ? idx.agentsById.get(agent.distributorId) : null

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
        <Icon icon={IconUpline} size={15} className="text-gold-deep dark:text-gold" />
        <p className="eyebrow text-gold-deep dark:text-gold">Upline &amp; downline</p>
        <RatesAssumed />
        <p className="ml-auto text-caption text-muted">
          Each edge carries the rate that level earns on every payment collected
          below it.
        </p>
      </header>

      <div className="space-y-1 p-4">
        {dist && <Node agent={dist} depth={0} />}
        {dist && tl && <Edge from={dist} rate={rateOf('distributor')} />}
        {tl && <Node agent={tl} depth={dist ? 1 : 0} />}
        {(tl || dist) && (
          <Edge
            from={tl ?? dist!}
            rate={rateOf(tl ? 'team_leader' : 'distributor')}
          />
        )}
        <Node agent={agent} depth={(dist ? 1 : 0) + (tl ? 1 : 0)} self />

        {downline.length > 0 && (
          <>
            <p className="pl-2 pt-2 text-caption text-muted">
              {downline.length} reporting to {agent.agentCode} — {agent.agentCode}{' '}
              earns{' '}
              <span className="font-medium text-gold-deep dark:text-gold">
                {formatPercent(rateOf(agent.level))}
              </span>{' '}
              of everything they collect
            </p>
            {downline.map((d) => (
              <Node
                key={d.id}
                agent={d}
                depth={(dist ? 1 : 0) + (tl ? 1 : 0) + 1}
              />
            ))}
          </>
        )}

        {!dist && !tl && downline.length === 0 && (
          <p className="text-caption text-muted">
            No upline and no downline — this agent sits alone in the tree, so every
            payment they collect produces a single commission entry.
          </p>
        )}
      </div>
    </section>
  )
}

function Node({
  agent,
  depth,
  self,
}: {
  agent: AgentProfile
  depth: number
  self?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5',
        self && 'bg-gold/10 ring-1 ring-gold/40',
      )}
      style={{ marginLeft: depth * 26 }}
    >
      <AgentIdentity agentId={agent.id} link={!self} />
      <LevelBadge level={agent.level} withRate />
      {self && (
        <span className="text-micro uppercase tracking-[0.08em] text-gold-deep dark:text-gold">
          This agent
        </span>
      )}
    </div>
  )
}

function Edge({ from, rate }: { from: AgentProfile; rate: number }) {
  return (
    <p className="pl-6 text-caption text-muted">
      <span className="opacity-60">│</span>{' '}
      <span className="font-medium text-gold-deep dark:text-gold">
        {formatPercent(rate)}
      </span>{' '}
      to {from.agentCode} ({levelLabel(from.level)})
    </p>
  )
}

// ── contracts ────────────────────────────────────────────────────────
function ContractsSection({ contracts }: { contracts: Contract[] }) {
  const columns: Column<Contract>[] = [
    {
      key: 'no',
      header: 'Contract',
      sortBy: (c) => c.contractNo,
      cell: (c) => <span className="font-mono text-caption">{c.contractNo}</span>,
    },
    {
      key: 'signed',
      header: 'Signed',
      sortBy: (c) => c.signedAt,
      cell: (c) => (
        <span className="whitespace-nowrap text-caption text-muted">
          {fmtDate(c.signedAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortBy: (c) => c.status,
      cell: (c) => (
        <span className="text-caption">{CONTRACT_STATUS_LABEL[c.status]}</span>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      sortBy: (c) => c.contractPriceCentavos,
      cell: (c) => <MoneyText centavos={c.contractPriceCentavos} decimals={false} />,
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      sortBy: (c) => balanceOf(c).paidCentavos,
      cell: (c) => (
        <MoneyText centavos={balanceOf(c).paidCentavos} decimals={false} />
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      sortBy: (c) => balanceOf(c).outstandingCentavos,
      cell: (c) => (
        <MoneyText
          centavos={balanceOf(c).outstandingCentavos}
          decimals={false}
          muted
        />
      ),
    },
  ]

  return (
    <section className="space-y-2">
      <p className="eyebrow text-gold-deep dark:text-gold">Sales</p>
      <DataTable
        rows={contracts}
        columns={columns}
        rowKey={(c) => c.id}
        dense
        emptyIcon={IconAgents}
        empty={{
          title: 'No contracts yet',
          body: 'Nothing sold so far — the commission ledger fills in only once money is collected.',
          action: (
            <Button asChild size="sm" variant="outline">
              <Link to="/map">Browse available lots</Link>
            </Button>
          ),
        }}
        initialSort={{ key: 'signed', dir: 'desc' }}
      />
    </section>
  )
}

// ── incentives ───────────────────────────────────────────────────────
export function IncentivesSection() {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
        <Icon icon={IconIncentive} size={15} className="text-gold-deep dark:text-gold" />
        <p className="eyebrow text-gold-deep dark:text-gold">Incentives</p>
        <AssumedChip
          label="Open question"
          why="The client mentioned a rice allowance (bugas) and annual incentives but gave no rules, amounts or qualifying criteria. Nothing has been invented here."
        />
      </header>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="px-4 py-5"
      >
        <p className="text-caption text-muted">No incentive rules defined yet.</p>
        <ul className="mt-1.5 space-y-1 text-caption text-muted">
          <li>· Rice allowance (<em>bugas</em>) — cadence, quantity and eligibility unknown.</li>
          <li>· Annual incentives — basis, threshold and amount unknown.</li>
        </ul>
      </motion.div>
    </section>
  )
}
