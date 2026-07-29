import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  COMMISSION_LEVELS,
  type AgentId,
  type Centavos,
  type CommissionEntry,
  type CommissionLevel,
  type PayoutRunId,
} from '@/domain'
import { indexes } from '@/stores/dataset'
import { agentName, levelLabel, useAgents } from '@/stores/agents'
import { useCan, useCurrentUser } from '@/lib/permissions'
import { fmtDate, fmtDateLong } from '@/lib/dates'
import { formatPercent, formatPeso } from '@/lib/money'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { StatCard } from '@/components/ui-brand/StatCard'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconChevronLeft,
  IconPayout,
  IconPrint,
} from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  AgentIdentity,
  CommissionStatusChip,
  LevelBadge,
  RatesAssumed,
  RunStatusChip,
  SundayFootnote,
  useDatasetVersion,
} from './shared'
import { PayoutSheet } from './PayoutSheet'
import { ClawbacksSection } from './ClawbacksSection'

export interface AgentGroup {
  agentId: AgentId
  entries: CommissionEntry[]
  subtotalCentavos: Centavos
  byLevel: { level: CommissionLevel; count: number; centavos: Centavos }[]
}

export function groupEntriesByAgent(entries: CommissionEntry[]): AgentGroup[] {
  const m = new Map<AgentId, CommissionEntry[]>()
  for (const e of entries) {
    const arr = m.get(e.agentId)
    if (arr) arr.push(e)
    else m.set(e.agentId, [e])
  }
  return [...m.entries()]
    .map(([agentId, rows]) => ({
      agentId,
      entries: rows.sort((a, b) => (a.earnedAt < b.earnedAt ? -1 : 1)),
      subtotalCentavos: rows.reduce((s, e) => s + e.amountCentavos, 0),
      byLevel: COMMISSION_LEVELS.map((level) => {
        const at = rows.filter((e) => e.level === level)
        return {
          level,
          count: at.length,
          centavos: at.reduce((s, e) => s + e.amountCentavos, 0),
        }
      }).filter((x) => x.count > 0),
    }))
    .sort((a, b) => b.subtotalCentavos - a.subtotalCentavos)
}

export function PayoutRunDetail() {
  const version = useDatasetVersion()
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const canApprove = useCan('payout:approve')
  const canRelease = useCan('payout:release')

  const { closeRun, approveRun, releaseRun, runEntries } = useAgents()
  const [sheetOpen, setSheetOpen] = useState(false)

  const run = useMemo(() => {
    void version
    return runId ? (indexes().payoutRunsById.get(runId as PayoutRunId) ?? null) : null
  }, [version, runId])

  const groups = useMemo(() => {
    void version
    if (!run) return []
    return groupEntriesByAgent(runEntries(run.id))
  }, [version, run, runEntries])

  if (!run) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <EmptyState
          icon={IconPayout}
          title="Payout run not found"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/agents/payouts">Back to payouts</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const total = groups.reduce((s, g) => s + g.subtotalCentavos, 0)
  const entryCount = groups.reduce((s, g) => s + g.entries.length, 0)

  const levelTotals = COMMISSION_LEVELS.map((level) => {
    const rows = groups.flatMap((g) => g.entries).filter((e) => e.level === level)
    return {
      level,
      count: rows.length,
      centavos: rows.reduce((s, e) => s + e.amountCentavos, 0),
    }
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1080px] space-y-5 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to="/agents/payouts"
              className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"
            >
              <Icon icon={IconChevronLeft} size={14} /> Payout runs
            </Link>
            <h2 className="mt-1.5 font-display text-[27px] font-semibold leading-tight text-ink">
              {fmtDateLong(run.periodStart)} → {fmtDateLong(run.periodEnd)}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2.5 text-[13.5px] text-muted">
              Release {fmtDateLong(run.releaseDate)}
              <RunStatusChip status={run.status} />
              {run.approvedByUserId && (
                <span className="text-[12.5px]">
                  Approved by{' '}
                  {indexes().usersById.get(run.approvedByUserId)?.fullName ?? '—'}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setSheetOpen(true)}
            >
              <Icon icon={IconPrint} size={15} /> Payout sheet
            </Button>

            {run.status === 'open' && canApprove && (
              <Button
                size="sm"
                onClick={() => {
                  closeRun(run.id, user.id)
                  toast.success('Run closed', {
                    description: 'Entries locked and sent for approval.',
                  })
                }}
              >
                Close run
              </Button>
            )}
            {run.status === 'pending_approval' && canApprove && (
              <Button
                size="sm"
                onClick={() => {
                  approveRun(run.id, user.id)
                  toast.success('Run approved', {
                    description: `Awaiting release on ${fmtDate(run.releaseDate)}.`,
                  })
                }}
              >
                Approve
              </Button>
            )}
            {run.status === 'approved' && canRelease && (
              <Button
                size="sm"
                onClick={() => {
                  releaseRun(run.id, user.id)
                  toast.success('Run released', {
                    description: `${formatPeso(total)} released to ${groups.length} agents.`,
                  })
                }}
              >
                Release
              </Button>
            )}
            {run.status === 'released' && (
              <Button size="sm" variant="ghost" disabled>
                Released {fmtDate(run.releasedAt?.slice(0, 10) ?? run.releaseDate)}
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 px-4 py-3">
          <SundayFootnote />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Grand total" value={formatPeso(total)} size="hero" />
          <StatCard label="Entries" value={String(entryCount)} />
          <StatCard label="Agents" value={String(groups.length)} />
          <StatCard
            label="Per level"
            value={
              <span className="text-[16px]">
                {levelTotals
                  .filter((l) => l.count > 0)
                  .map((l) => formatPeso(l.centavos, { compact: true }))
                  .join(' · ')}
              </span>
            }
            hint={
              <span className="inline-flex items-center gap-1.5">
                {levelTotals
                  .filter((l) => l.count > 0)
                  .map((l) => levelLabel(l.level))
                  .join(' · ')}
                <RatesAssumed />
              </span>
            }
          />
        </div>

        {groups.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface">
            <EmptyState
              icon={IconPayout}
              title="Nothing accrued in this window yet"
              body="Commission is earned when money is collected. As payments are posted they attach to this run."
              compact
            />
          </div>
        ) : (
          <section className="space-y-2">
            <p className="eyebrow text-gold-deep dark:text-gold">By agent</p>
            {groups.map((g, i) => (
              <motion.div
                key={g.agentId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.32,
                  ease: [0.22, 1, 0.36, 1],
                  delay: Math.min(i, 12) * 0.04,
                }}
              >
                <AgentGroupCard group={g} />
              </motion.div>
            ))}
          </section>
        )}

        <ClawbacksSection />
      </div>

      {sheetOpen && (
        <PayoutSheet run={run} groups={groups} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  )
}

function AgentGroupCard({ group }: { group: AgentGroup }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-[var(--radius-card)] border border-line bg-surface"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full flex-wrap items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-2"
        >
          <AgentIdentity agentId={group.agentId} link={false} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {group.byLevel.map((l) => (
              <span
                key={l.level}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11.5px] text-muted"
              >
                <LevelBadge level={l.level} />
                <span className="tabular">
                  {l.count} × · {formatPeso(l.centavos)}
                </span>
              </span>
            ))}
          </div>
          <span className="w-[120px] text-right font-display text-[19px] font-semibold tabular text-ink">
            {formatPeso(group.subtotalCentavos)}
          </span>
          <span
            className={cn(
              'text-[11px] text-muted transition-transform',
              open && 'rotate-90',
            )}
          >
            ›
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="overflow-x-auto border-t border-line-soft">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-surface-2 text-left">
                <Th>Earned</Th>
                <Th>Contract</Th>
                <Th>OR no.</Th>
                <Th>Level</Th>
                <Th right>Rate</Th>
                <Th right>Basis</Th>
                <Th right>Commission</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {group.entries.map((e) => (
                <tr key={e.id} className="border-t border-line-soft">
                  <Td>{fmtDate(e.earnedAt.slice(0, 10))}</Td>
                  <Td mono>
                    {indexes().contractsById.get(e.contractId)?.contractNo ?? '—'}
                  </Td>
                  <Td mono>{indexes().paymentsById.get(e.paymentId)?.orNo ?? '—'}</Td>
                  <Td>
                    <LevelBadge level={e.level} />
                  </Td>
                  <Td right>{formatPercent(e.ratePercent)}</Td>
                  <Td right muted>
                    {formatPeso(e.basisCentavos)}
                  </Td>
                  <Td right strong>
                    {formatPeso(e.amountCentavos)}
                  </Td>
                  <Td>
                    <CommissionStatusChip status={e.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        'px-3.5 py-2 text-[10.5px] uppercase tracking-[0.08em] font-semibold text-gold-deep dark:text-gold',
        right && 'text-right',
      )}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  right,
  mono,
  muted,
  strong,
}: {
  children: React.ReactNode
  right?: boolean
  mono?: boolean
  muted?: boolean
  strong?: boolean
}) {
  return (
    <td
      className={cn(
        'px-3.5 py-1.5',
        right && 'text-right tabular',
        mono && 'font-mono text-[11.5px] text-muted',
        muted && 'text-muted',
        strong && 'font-medium text-gold-deep dark:text-gold',
      )}
    >
      {children}
    </td>
  )
}
