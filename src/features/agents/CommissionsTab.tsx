import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  COMMISSION_LEVELS,
  COMMISSION_STATUS_LABEL,
  type CommissionEntry,
  type CommissionStatus,
} from '@/domain'
import { dataset, indexes } from '@/stores/dataset'
import { agentName, levelLabel } from '@/stores/agents'
import { fmtDate } from '@/lib/dates'
import { formatPercent, formatPeso } from '@/lib/money'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import { IconCommission, IconSearch } from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CommissionStatusChip,
  LevelBadge,
  RatesAssumed,
  SundayFootnote,
  useDatasetVersion,
} from './shared'
import { usePeriod } from './period'

const ALL = '__all__'
const PAGE = 60

const STATUSES: CommissionStatus[] = [
  'accrued',
  'in_run',
  'approved',
  'released',
  'voided',
  'clawback_pending',
]

export function CommissionsTab() {
  const version = useDatasetVersion()
  const period = usePeriod()

  const [level, setLevel] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [runId, setRunId] = useState(ALL)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  const runs = useMemo(() => {
    void version
    return dataset().payoutRuns
  }, [version])

  const rows = useMemo(() => {
    void version
    const idx = indexes()
    const needle = q.trim().toLowerCase()
    return dataset()
      .commissions.filter((e) => {
        const d = e.earnedAt.slice(0, 10)
        if (d < period.from || d > period.to) return false
        if (level !== ALL && e.level !== level) return false
        if (status !== ALL && e.status !== status) return false
        if (runId !== ALL && e.payoutRunId !== runId) return false
        if (!needle) return true
        const contract = idx.contractsById.get(e.contractId)
        const payment = idx.paymentsById.get(e.paymentId)
        return (
          agentName(e.agentId).toLowerCase().includes(needle) ||
          (contract?.contractNo ?? '').toLowerCase().includes(needle) ||
          (payment?.orNo ?? '').toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : -1))
  }, [version, period.from, period.to, level, status, runId, q])

  const totals = useMemo(() => {
    const byStatus = new Map<CommissionStatus, number>()
    let all = 0
    for (const e of rows) {
      byStatus.set(e.status, (byStatus.get(e.status) ?? 0) + e.amountCentavos)
      all += e.amountCentavos
    }
    return { byStatus, all }
  }, [rows])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE))
  const safePage = Math.min(page, pageCount - 1)
  const slice = rows.slice(safePage * PAGE, safePage * PAGE + PAGE)

  const columns: Column<CommissionEntry>[] = [
    {
      key: 'earned',
      header: 'Earned',
      sortBy: (e) => e.earnedAt,
      cell: (e) => (
        <span className="whitespace-nowrap text-caption">
          {fmtDate(e.earnedAt.slice(0, 10))}
        </span>
      ),
    },
    {
      key: 'agent',
      header: 'Agent',
      sortBy: (e) => agentName(e.agentId),
      cell: (e) => (
        <Link to={`/agents/${e.agentId}`} className="hover:underline">
          {agentName(e.agentId)}
        </Link>
      ),
    },
    {
      key: 'level',
      header: (
        <span className="inline-flex items-center gap-1.5">
          Level <RatesAssumed />
        </span>
      ),
      sortBy: (e) => e.level,
      cell: (e) => <LevelBadge level={e.level} />,
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      sortBy: (e) => e.ratePercent,
      cell: (e) => <span className="tabular">{formatPercent(e.ratePercent)}</span>,
    },
    {
      key: 'contract',
      header: 'Contract',
      cell: (e) => (
        <span className="font-mono text-caption text-muted">
          {indexes().contractsById.get(e.contractId)?.contractNo ?? '—'}
        </span>
      ),
    },
    {
      key: 'or',
      header: 'OR no.',
      cell: (e) => (
        <span className="font-mono text-caption text-muted">
          {indexes().paymentsById.get(e.paymentId)?.orNo ?? '—'}
        </span>
      ),
    },
    {
      key: 'basis',
      header: 'Basis',
      align: 'right',
      sortBy: (e) => e.basisCentavos,
      cell: (e) => <MoneyText centavos={e.basisCentavos} muted />,
    },
    {
      key: 'amount',
      header: 'Commission',
      align: 'right',
      sortBy: (e) => e.amountCentavos,
      cell: (e) => (
        <MoneyText
          centavos={e.amountCentavos}
          className="font-medium text-gold-deep dark:text-gold"
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortBy: (e) => e.status,
      cell: (e) => <CommissionStatusChip status={e.status} />,
    },
    {
      key: 'run',
      header: 'Payout run',
      cell: (e) =>
        e.payoutRunId ? (
          <Link
            to={`/agents/payouts/${e.payoutRunId}`}
            className="font-mono text-caption text-muted hover:text-ink hover:underline"
          >
            {indexes().payoutRunsById.get(e.payoutRunId)
              ? fmtDate(indexes().payoutRunsById.get(e.payoutRunId)!.periodStart)
              : e.payoutRunId}
          </Link>
        ) : (
          <span className="text-caption text-muted">Unassigned</span>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_230px]">
          <Icon
            icon={IconSearch}
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
            placeholder="Agent, contract or OR no."
            className="w-full pl-8 text-caption"
          />
        </div>

        <Select
          value={level}
          onValueChange={(v) => {
            setLevel(v)
            setPage(0)
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All levels</SelectItem>
            {COMMISSION_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {levelLabel(l)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v)
            setPage(0)
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {COMMISSION_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={runId}
          onValueChange={(v) => {
            setRunId(v)
            setPage(0)
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-[210px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All payout runs</SelectItem>
            {runs.slice(0, 24).map((r) => (
              <SelectItem key={r.id} value={r.id as string}>
                {fmtDate(r.periodStart)} → {fmtDate(r.periodEnd)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-caption text-muted">{period.label}</span>
      </div>

      <DataTable
        rows={slice}
        columns={columns}
        rowKey={(e) => e.id}
        dense
        emptyIcon={IconCommission}
        empty={{
          title: 'No commission entries in this period',
          body: 'Posted payments in this period will appear here.',
        }}
        footer={
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="font-medium text-ink">
                {rows.length.toLocaleString()} entries ·{' '}
                {formatPeso(totals.all, { decimals: false })}
              </span>
              {STATUSES.filter((s) => totals.byStatus.get(s)).map((s) => (
                <span key={s}>
                  {COMMISSION_STATUS_LABEL[s]}{' '}
                  <span className="tabular text-ink">
                    {formatPeso(totals.byStatus.get(s) ?? 0, { decimals: false })}
                  </span>
                </span>
              ))}
            </div>
            <p className="text-caption text-muted">
              Rows are based on posted payments and the contract upline recorded
              at signing.
            </p>
          </div>
        }
      />

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <span className="tabular text-caption text-muted">
            Page {safePage + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </Button>
        </div>
      )}

      <SundayFootnote />
    </div>
  )
}
