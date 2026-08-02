import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CONTRACT_STATUS_LABEL, type Contract } from '@/domain'
import { indexes } from '@/stores/dataset'
import { useCurrentAgent } from '@/lib/permissions'
import { TODAY } from '@/mock'
import {
  agentCollected,
  agentEarnings,
  balanceOf,
  leaderboard,
  monthBounds,
} from '@/lib/finance'
import { fmtDate } from '@/lib/dates'
import { formatPeso } from '@/lib/money'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { StatCard } from '@/components/ui-brand/StatCard'
import { Icon } from '@/components/ui-brand/Icon'
import { IconAgents, IconLeaderboard, IconLot } from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import {
  LevelBadge,
  RatesAssumed,
  SundayFootnote,
  TargetRing,
  useDatasetVersion,
} from './shared'
import { usePeriod } from './period'
import { AgentCommissionsByRun } from './AgentCommissionsByRun'

/**
 * An agent visiting /agents lands here rather than on the roster. Same route,
 * a purpose-built screen — and the roster and rules tabs are simply absent.
 */
export function MyEarningsPage() {
  const version = useDatasetVersion()
  const me = useCurrentAgent()
  const period = usePeriod()

  const data = useMemo(() => {
    void version
    if (!me) return null
    const [monthFrom, monthTo] = monthBounds(TODAY)
    const year = TODAY.slice(0, 4)
    const inPeriod = agentEarnings(me.id, period.from, period.to)
    const thisMonth = agentEarnings(me.id, monthFrom, monthTo)
    const thisYear = agentEarnings(me.id, `${year}-01-01`, `${year}-12-31`)
    const col = agentCollected(me.id, period.from, period.to)
    const board = leaderboard(period.from, period.to, me.locationId, 'collected')
    const myRow = board.find((r) => r.agentId === me.id)
    const contracts = (indexes().contractsByAgent.get(me.id) ?? []).slice()
    return { inPeriod, thisMonth, thisYear, col, board, myRow, contracts }
  }, [version, me, period.from, period.to])

  if (!me || !data) {
    return (
      <EmptyState
        icon={IconAgents}
        title="No agent profile"
        body="This account is not linked to an agent record, so there are no earnings to show."
      />
    )
  }

  const awaiting = data.inPeriod.inRun + data.inPeriod.approved

  const columns: Column<Contract>[] = [
    {
      key: 'no',
      header: 'Contract',
      sortBy: (c) => c.contractNo,
      cell: (c) => <span className="font-mono text-[11.5px]">{c.contractNo}</span>,
    },
    {
      key: 'signed',
      header: 'Signed',
      sortBy: (c) => c.signedAt,
      cell: (c) => (
        <span className="whitespace-nowrap text-[12.5px] text-muted">
          {fmtDate(c.signedAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortBy: (c) => c.status,
      cell: (c) => (
        <span className="text-[12.5px]">{CONTRACT_STATUS_LABEL[c.status]}</span>
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
      cell: (c) => <MoneyText centavos={balanceOf(c).paidCentavos} decimals={false} />,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      sortBy: (c) => balanceOf(c).outstandingCentavos,
      cell: (c) => (
        <MoneyText centavos={balanceOf(c).outstandingCentavos} decimals={false} muted />
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          label={`Accrued · ${period.label}`}
          value={formatPeso(data.inPeriod.accrued, { decimals: false })}
          size="hero"
          hint={
            <span className="inline-flex items-center gap-1.5">
              Commission rates <RatesAssumed />
            </span>
          }
        />
        <StatCard
          label="Awaiting release"
          value={formatPeso(awaiting, { decimals: false })}
          hint="In a closed or approved run, paid out on its Friday"
        />
        <StatCard
          label="Released this month"
          value={formatPeso(data.thisMonth.released, { decimals: false })}
        />
        <StatCard
          label="Released this year"
          value={formatPeso(data.thisYear.released, { decimals: false })}
        />
      </motion.div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex items-center gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <TargetRing
            collected={data.col.centavos}
            target={me.monthlyTargetCentavos}
            size={120}
          />
          <div className="min-w-0">
            <p className="eyebrow text-muted">Target progress</p>
            <p className="mt-1 font-display text-[24px] font-semibold tabular text-ink">
              {formatPeso(data.col.centavos, { decimals: false })}
            </p>
            <p className="text-[12.5px] text-muted">
              collected {period.label}
              {me.monthlyTargetCentavos
                ? ` of ${formatPeso(me.monthlyTargetCentavos, { decimals: false })}`
                : ' · no target set'}
            </p>
            <p className="mt-2 flex items-center gap-2">
              <LevelBadge level={me.level} withRate />
              <span className="font-mono text-[11.5px] text-muted">{me.agentCode}</span>
            </p>
          </div>
        </section>

        <section className="flex items-center gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <span className="grid size-[84px] shrink-0 place-items-center rounded-full border border-gold/55 bg-gold/12">
            <span className="font-display text-[30px] font-semibold tabular text-gold-deep dark:text-gold">
              {data.myRow ? data.myRow.rank : '—'}
            </span>
          </span>
          <div className="min-w-0">
            <p className="eyebrow text-muted">Leaderboard position</p>
            <p className="mt-1 text-[13.5px] text-ink">
              {data.myRow
                ? `Rank ${data.myRow.rank} of ${data.board.length} at your location`
                : 'Not ranked in this period yet'}
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {data.myRow?.contractCount ?? 0} contract
              {data.myRow?.contractCount === 1 ? '' : 's'} paid into ·{' '}
              {formatPeso(data.inPeriod.total, { decimals: false })} commission
            </p>
            <Button asChild size="sm" variant="outline" className="mt-2.5 gap-1.5">
              <Link to="/agents/leaderboard">
                <Icon icon={IconLeaderboard} size={15} /> See the board
              </Link>
            </Button>
          </div>
        </section>
      </div>

      <AgentCommissionsByRun agentId={me.id} />

      <section className="space-y-2">
        <p className="eyebrow text-gold-deep dark:text-gold">My contracts</p>
        <DataTable
          rows={data.contracts}
          columns={columns}
          rowKey={(c) => c.id}
          dense
          emptyIcon={IconLot}
          empty={{
            title: 'No sales yet',
            body: 'Your first contract starts here.',
            action: (
              <Button asChild size="sm">
                <Link to="/map">Browse available lots</Link>
              </Button>
            ),
          }}
          initialSort={{ key: 'signed', dir: 'desc' }}
        />
      </section>

      <SundayFootnote />
    </div>
  )
}
