import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AgentId, CommissionEntry, PayoutRunId } from '@/domain'
import { indexes } from '@/stores/dataset'
import { fmtDate } from '@/lib/dates'
import { formatPercent, formatPeso } from '@/lib/money'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { Icon } from '@/components/ui-brand/Icon'
import { IconChevronDown, IconChevronRight, IconCommission } from '@/components/ui-brand/icons'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  CommissionStatusChip,
  LevelBadge,
  RatesAssumed,
  RunStatusChip,
  SundayFootnote,
  useDatasetVersion,
} from './shared'

interface RunGroup {
  runId: PayoutRunId | null
  entries: CommissionEntry[]
  totalCentavos: number
}

/** Every entry for one agent, grouped by the payout run it belongs to. */
export function AgentCommissionsByRun({ agentId }: { agentId: AgentId }) {
  const version = useDatasetVersion()

  const groups = useMemo((): RunGroup[] => {
    void version
    const rows = indexes().commissionsByAgent.get(agentId) ?? []
    const m = new Map<string, CommissionEntry[]>()
    for (const e of rows) {
      const key = e.payoutRunId ?? '__none__'
      const arr = m.get(key)
      if (arr) arr.push(e)
      else m.set(key, [e])
    }
    return [...m.entries()]
      .map(([key, entries]) => ({
        runId: key === '__none__' ? null : (key as PayoutRunId),
        entries: entries.sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : -1)),
        totalCentavos: entries.reduce((s, e) => s + e.amountCentavos, 0),
      }))
      .sort((a, b) => {
        const ra = a.runId ? indexes().payoutRunsById.get(a.runId)?.periodStart : 'zzzz'
        const rb = b.runId ? indexes().payoutRunsById.get(b.runId)?.periodStart : 'zzzz'
        return (rb ?? '') < (ra ?? '') ? -1 : 1
      })
  }, [version, agentId])

  const total = groups.reduce((s, g) => s + g.totalCentavos, 0)

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="eyebrow text-gold-deep dark:text-gold">Commission entries</p>
        <RatesAssumed />
        <span className="ml-auto text-[12.5px] text-muted">
          {groups.reduce((s, g) => s + g.entries.length, 0)} entries ·{' '}
          <span className="tabular font-medium text-ink">
            {formatPeso(total, { decimals: false })}
          </span>{' '}
          lifetime
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface">
          <EmptyState
            icon={IconCommission}
            title="No commission yet"
            body="Posted payments will appear here."
            compact
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          {groups.map((g, i) => (
            <RunGroupCard key={g.runId ?? 'none'} group={g} defaultOpen={i === 0} />
          ))}
        </div>
      )}

      <SundayFootnote className="pt-1" />
    </section>
  )
}

function RunGroupCard({
  group,
  defaultOpen,
}: {
  group: RunGroup
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const run = group.runId ? indexes().payoutRunsById.get(group.runId) : null

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-[var(--radius-card)] border border-line bg-surface"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
        >
          <Icon
            icon={open ? IconChevronDown : IconChevronRight}
            size={14}
            className="text-muted"
          />
          {run ? (
            <>
              <span className="text-[13.5px] font-medium text-ink">
                {fmtDate(run.periodStart)} → {fmtDate(run.periodEnd)}
              </span>
              <RunStatusChip status={run.status} />
              <Link
                to={`/agents/payouts/${run.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[12px] text-muted hover:text-ink hover:underline"
              >
                open run
              </Link>
            </>
          ) : (
            <span className="text-[13.5px] font-medium text-ink">
              Not yet in a payout run
            </span>
          )}
          <span className="ml-auto text-[12.5px] text-muted">
            {group.entries.length} entries
          </span>
          <span className="w-[110px] text-right font-display text-[17px] font-semibold tabular text-ink">
            {formatPeso(group.totalCentavos)}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="overflow-x-auto border-t border-line-soft">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-surface-2 text-left">
                {['Earned', 'Contract', 'OR no.', 'Level', 'Rate', 'Basis', 'Commission', 'Status'].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={cn(
                        'px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gold-deep dark:text-gold',
                        i >= 4 && i <= 6 && 'text-right',
                      )}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {group.entries.map((e) => (
                <tr key={e.id} className="border-t border-line-soft">
                  <td className="px-3.5 py-1.5 whitespace-nowrap">
                    {fmtDate(e.earnedAt.slice(0, 10))}
                  </td>
                  <td className="px-3.5 py-1.5 font-mono text-[11.5px] text-muted">
                    {indexes().contractsById.get(e.contractId)?.contractNo ?? '—'}
                  </td>
                  <td className="px-3.5 py-1.5 font-mono text-[11.5px] text-muted">
                    {indexes().paymentsById.get(e.paymentId)?.orNo ?? '—'}
                  </td>
                  <td className="px-3.5 py-1.5">
                    <LevelBadge level={e.level} />
                  </td>
                  <td className="px-3.5 py-1.5 text-right tabular">
                    {formatPercent(e.ratePercent)}
                  </td>
                  <td className="px-3.5 py-1.5 text-right tabular text-muted">
                    {formatPeso(e.basisCentavos)}
                  </td>
                  <td className="px-3.5 py-1.5 text-right tabular font-medium text-gold-deep dark:text-gold">
                    {formatPeso(e.amountCentavos)}
                  </td>
                  <td className="px-3.5 py-1.5">
                    <CommissionStatusChip status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
