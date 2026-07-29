import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { PayoutRun } from '@/domain'
import { dataset, indexes } from '@/stores/dataset'
import { useAgents } from '@/stores/agents'
import { useCan } from '@/lib/permissions'
import { TODAY } from '@/mock'
import { diffDays, fmtDate, fmtDateLong } from '@/lib/dates'
import { formatPeso } from '@/lib/money'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import { IconClock, IconPayout } from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import { RunStatusChip, SundayFootnote, useDatasetVersion } from './shared'
import { ClawbacksSection } from './ClawbacksSection'

export function PayoutsTab() {
  const version = useDatasetVersion()
  const navigate = useNavigate()
  const currentRun = useAgents((s) => s.currentRun)
  const openRun = useAgents((s) => s.openRun)
  const canApprove = useCan('payout:approve')
  const runEntries = useAgents((s) => s.runEntries)

  const { open, closed } = useMemo(() => {
    void version
    const runs = [...dataset().payoutRuns].sort((a, b) =>
      a.periodStart < b.periodStart ? 1 : -1,
    )
    const current = currentRun(null)
    return { open: current, closed: runs.filter((r) => r.id !== current?.id) }
  }, [version, currentRun])

  const openTotals = useMemo(() => {
    void version
    if (!open) return { count: 0, total: 0, agents: 0 }
    const entries = runEntries(open.id)
    return {
      count: entries.length,
      total: entries.reduce((s, e) => s + e.amountCentavos, 0),
      agents: new Set(entries.map((e) => e.agentId)).size,
    }
  }, [version, open, runEntries])

  const columns: Column<PayoutRun>[] = [
    {
      key: 'period',
      header: 'Period (Sat → Thu)',
      sortBy: (r) => r.periodStart,
      cell: (r) => (
        <span className="whitespace-nowrap font-medium text-ink">
          {fmtDate(r.periodStart)} → {fmtDate(r.periodEnd)}
        </span>
      ),
    },
    {
      key: 'release',
      header: 'Release (Fri)',
      sortBy: (r) => r.releaseDate,
      cell: (r) => (
        <span className="whitespace-nowrap text-[12.5px] text-muted">
          {fmtDate(r.releaseDate)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortBy: (r) => r.status,
      cell: (r) => <RunStatusChip status={r.status} />,
    },
    {
      key: 'entries',
      header: 'Entries',
      align: 'right',
      sortBy: (r) => r.entryCount,
      cell: (r) => <span className="tabular">{r.entryCount}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortBy: (r) => r.totalCentavos,
      cell: (r) => (
        <MoneyText
          centavos={r.totalCentavos}
          decimals={false}
          className="font-medium text-ink"
        />
      ),
    },
    {
      key: 'approver',
      header: 'Approved by',
      cell: (r) => (
        <span className="text-[12.5px] text-muted">
          {r.approvedByUserId
            ? (indexes().usersById.get(r.approvedByUserId)?.fullName ?? '—')
            : '—'}
        </span>
      ),
    },
  ]

  const daysToFriday = open ? diffDays(open.releaseDate, TODAY) : 0

  return (
    <div className="space-y-5">
      {open ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-[var(--radius-card)] border border-gold/55 bg-surface"
        >
          <div className="flex flex-wrap items-start gap-5 p-5">
            <div className="min-w-[240px] flex-1">
              <p className="eyebrow text-gold-deep dark:text-gold">Current open run</p>
              <h3 className="mt-1 font-display text-[22px] font-semibold text-ink">
                {fmtDateLong(open.periodStart)} → {fmtDateLong(open.periodEnd)}
              </h3>
              <p className="mt-0.5 text-[13px] text-muted">
                Releases {fmtDateLong(open.releaseDate)}
              </p>
              <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-gold/45 bg-gold/12 px-2.5 py-1 text-[12.5px] font-medium text-gold-deep dark:text-gold">
                <Icon icon={IconClock} size={14} />
                {daysToFriday > 0
                  ? `${daysToFriday} day${daysToFriday === 1 ? '' : 's'} to Friday`
                  : daysToFriday === 0
                    ? 'Releases today'
                    : 'Release date passed'}
              </p>
            </div>

            <div className="flex gap-8">
              <Figure label="Accruing" value={formatPeso(openTotals.total)} />
              <Figure label="Entries" value={String(openTotals.count)} />
              <Figure label="Agents" value={String(openTotals.agents)} />
            </div>

            <div className="flex items-center">
              <Button size="sm" onClick={() => navigate(`/agents/payouts/${open.id}`)}>
                Open run detail
              </Button>
            </div>
          </div>
          <div className="border-t border-line px-5 py-3">
            <SundayFootnote />
          </div>
        </motion.section>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface">
          <EmptyState
            icon={IconPayout}
            title="No open payout run"
            body="The current period opens Saturday. Commission accrued in the meantime attaches to it automatically."
            compact
            action={
              canApprove ? (
                <Button
                  size="sm"
                  onClick={() => {
                    const r = openRun()
                    toast.success('Run opened', {
                      description: `${fmtDate(r.periodStart)} → ${fmtDate(r.periodEnd)}, releasing ${fmtDate(r.releaseDate)}.`,
                    })
                  }}
                >
                  Open this week&rsquo;s run
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      <DataTable
        rows={closed}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/agents/payouts/${r.id}`)}
        emptyIcon={IconPayout}
        empty={{ title: 'No payout runs yet', body: 'Runs appear once a window closes.' }}
        initialSort={{ key: 'period', dir: 'desc' }}
        footer={
          <span>
            {closed.length} closed run{closed.length === 1 ? '' : 's'} ·{' '}
            {formatPeso(
              closed.reduce((s, r) => s + r.totalCentavos, 0),
              { decimals: false },
            )}{' '}
            released or pending
          </span>
        }
      />

      <ClawbacksSection />
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-[0.07em] text-muted">{label}</p>
      <p className="font-display text-[23px] font-semibold tabular text-ink">{value}</p>
    </div>
  )
}
