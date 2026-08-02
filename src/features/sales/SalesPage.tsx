import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  CONTRACT_STATUS_LABEL,
  NEED_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_MODE_LABEL,
  PAYMENT_HEALTH_APPEARANCE,
  clientFullName,
  type ClientId,
  type Contract,
  type ContractId,
  type ContractStatus,
  type PaymentHealth,
  type PaymentMethod,
} from '@/domain'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { StatCard } from '@/components/ui-brand/StatCard'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconAdd,
  IconContract,
  IconHold,
  IconMail,
  IconPayment,
  IconSearch,
  IconStar,
  IconTrustFund,
} from '@/components/ui-brand/icons'
import { useDataset, indexes } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import { useNotifications } from '@/stores/notifications'
import { useSales } from '@/stores/sales'
import { useCan, useCurrentUserOrNull } from '@/lib/permissions'
import {
  collectionsBetween,
  monthBounds,
  receivablesBreakdown,
  trustFundBalance,
} from '@/lib/finance'
import { fmtDate } from '@/lib/dates'
import { formatCount, formatPeso } from '@/lib/money'
import { TODAY } from '@/mock'
import { ContractBuilder } from './components/ContractBuilder'
import { RequestHoldDialog } from './components/RequestHoldDialog'
import { ContractDetailSheet } from './components/ContractDetailSheet'
import { PostPaymentDialog } from './components/PostPaymentDialog'
import { ClientSheet } from './components/ClientSheet'
import { ContractStatusChip, HealthChip } from './components/chips'
import { DateField } from './components/DateField'
import {
  HEALTH_ORDER,
  METHOD_ICON,
  useVisibleContracts,
  type ContractRow,
} from './lib'
import { cn } from '@/lib/utils'

const EASE = [0.22, 1, 0.36, 1] as const
const ALL = '__all__'

export default function SalesPage() {
  const init = useSales((s) => s.init)
  const user = useCurrentUserOrNull()
  const canViewAll = useCan('contract:view_all')
  const canCreate = useCan('contract:create')
  const canHold = useCan('hold:request')
  const navigate = useNavigate()

  // Stale holds lapse against TODAY, once, on entry.
  useEffect(() => init(), [init])

  const rows = useVisibleContracts()
  const [tab, setTab] = useState('contracts')
  const [builderOpen, setBuilderOpen] = useState(false)
  const [holdOpen, setHoldOpen] = useState(false)
  const [detailId, setDetailId] = useState<ContractId | null>(null)
  const [clientId, setClientId] = useState<ClientId | null>(null)
  const [payTarget, setPayTarget] = useState<Contract | null>(null)

  const isAgent = user?.role === 'agent'

  if (isAgent && rows.length === 0) {
    return (
      <div className="h-full overflow-y-auto p-4 sm:p-6">
        <EmptyState
          icon={IconContract}
          title="No contracts yet"
          body="Contracts you sell appear here with their schedule, collections and commission."
          action={
            <Button onClick={() => navigate('/map')} className="gap-1.5">
              <Icon icon={IconAdd} size={15} />
              Find available lots
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-gold-deep dark:text-gold">
              {isAgent ? 'My book' : 'Transactions'}
            </p>
            <h1 className="font-display text-page-title font-semibold text-ink">
              {isAgent ? 'My Sales' : 'Sales & Payments'}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {canHold && (
              <Button
                variant="outline"
                onClick={() => setHoldOpen(true)}
                className="gap-1.5"
              >
                <Icon icon={IconHold} size={15} />
                Request hold
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setBuilderOpen(true)} className="gap-1.5">
                <Icon icon={IconAdd} size={15} />
                New contract
              </Button>
            )}
          </div>
        </div>

        {canViewAll && <SummaryCards />}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="contracts">Contracts</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="receivables">Receivables</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
          </TabsList>

          <TabsContent value="contracts">
            <ContractsTab rows={rows} onOpen={setDetailId} />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentsTab rows={rows} onOpen={setDetailId} />
          </TabsContent>
          <TabsContent value="receivables">
            <ReceivablesTab rows={rows} onOpen={setDetailId} onPay={setPayTarget} />
          </TabsContent>
          <TabsContent value="clients">
            <ClientsTab rows={rows} onOpen={setClientId} />
          </TabsContent>
        </Tabs>
      </div>

      <RequestHoldDialog open={holdOpen} onOpenChange={setHoldOpen} />
      <ContractBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        onCreated={(id) => setDetailId(id)}
      />
      <ContractDetailSheet
        contractId={detailId}
        open={Boolean(detailId)}
        onOpenChange={(v) => !v && setDetailId(null)}
      />
      <ClientSheet
        clientId={clientId}
        open={Boolean(clientId)}
        onOpenChange={(v) => !v && setClientId(null)}
        onOpenContract={(id) => {
          setClientId(null)
          setDetailId(id)
        }}
      />
      <PostPaymentDialog
        contract={payTarget}
        open={Boolean(payTarget)}
        onOpenChange={(v) => !v && setPayTarget(null)}
      />
    </div>
  )
}

// ── summary ──────────────────────────────────────────────────────────
function SummaryCards() {
  const version = useDataset((s) => s.version)
  const locationId = useSession((s) => s.activeLocationId)
  const canSeeTrust = useCan('trustfund:view')

  const stats = useMemo(() => {
    void version
    const [from, to] = monthBounds(TODAY)
    return {
      collected: collectionsBetween(from, to, locationId),
      receivables: receivablesBreakdown(locationId, TODAY),
      trust: trustFundBalance(locationId, TODAY),
    }
  }, [locationId, version])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <StatCard
        label="Collected this month"
        value={formatPeso(stats.collected.totalCentavos, { compact: true })}
        hint={`${formatCount(stats.collected.count)} payments`}
      />
      <StatCard
        label="Receivables"
        value={formatPeso(stats.receivables.totalCentavos, { compact: true })}
        hint={`${formatCount(stats.receivables.buckets.severely_overdue.count)} at 90+ days`}
      />
      <StatCard
        label="90+ overdue"
        value={formatPeso(stats.receivables.buckets.severely_overdue.centavos, {
          compact: true,
        })}
        hint="The call sheet at the top of Receivables"
      />
      {canSeeTrust && (
        <StatCard
          label="Trust fund"
          value={formatPeso(stats.trust, { compact: true })}
          hint="20% of every posted payment, accrued"
          action={<Icon icon={IconTrustFund} size={16} className="text-green" />}
        />
      )}
    </motion.div>
  )
}

// ── contracts ────────────────────────────────────────────────────────
function ContractsTab({
  rows,
  onOpen,
}: {
  rows: ContractRow[]
  onOpen: (id: ContractId) => void
}) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string>(ALL)
  const [need, setNeed] = useState<string>(ALL)
  const [mode, setMode] = useState<string>(ALL)
  const [health, setHealth] = useState<string>(ALL)
  const [agent, setAgent] = useState<string>(ALL)

  const agents = useMemo(() => {
    const set = new Map<string, string>()
    for (const r of rows) set.set(r.contract.agentId, r.agent)
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (
        needle &&
        !`${r.contractNo} ${r.buyer} ${r.lotCode} ${r.tier}`.toLowerCase().includes(needle)
      )
        return false
      if (status !== ALL && r.contract.status !== status) return false
      if (need !== ALL && r.contract.needType !== need) return false
      if (mode !== ALL && r.contract.paymentMode !== mode) return false
      if (health !== ALL && r.health !== health) return false
      if (agent !== ALL && r.contract.agentId !== agent) return false
      return true
    })
  }, [rows, q, status, need, mode, health, agent])

  const columns: Column<ContractRow>[] = [
    {
      key: 'no',
      header: 'Contract',
      cell: (r) => <span className="font-mono">{r.contractNo}</span>,
      sortBy: (r) => r.contractNo,
      width: '132px',
    },
    { key: 'buyer', header: 'Buyer', cell: (r) => r.buyer, sortBy: (r) => r.buyer },
    {
      key: 'lot',
      header: 'Lot',
      cell: (r) => <span className="font-mono">{r.lotCode}</span>,
      sortBy: (r) => r.lotCode,
      width: '96px',
    },
    {
      key: 'tier',
      header: 'Tier',
      cell: (r) => <span className="text-muted">{r.tier}</span>,
      sortBy: (r) => r.tier,
    },
    {
      key: 'terms',
      header: 'Terms',
      cell: (r) => (
        <span className="whitespace-nowrap text-muted">
          {NEED_TYPE_LABEL[r.contract.needType]} ·{' '}
          {PAYMENT_MODE_LABEL[r.contract.paymentMode]}
          {r.contract.termMonths ? ` ${r.contract.termMonths}mo` : ''}
        </span>
      ),
      sortBy: (r) => r.contract.paymentMode,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      cell: (r) => <MoneyText centavos={r.totalCentavos} />,
      sortBy: (r) => r.totalCentavos,
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      cell: (r) => <MoneyText centavos={r.paidCentavos} muted={r.paidCentavos === 0} />,
      sortBy: (r) => r.paidCentavos,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (r) => (
        <MoneyText
          centavos={r.outstandingCentavos}
          className={r.outstandingCentavos === 0 ? 'text-green' : 'text-ink'}
        />
      ),
      sortBy: (r) => r.outstandingCentavos,
    },
    {
      key: 'health',
      header: 'Health',
      cell: (r) => <HealthChip health={r.health} dense />,
      sortBy: (r) => HEALTH_ORDER.indexOf(r.health),
    },
    {
      key: 'agent',
      header: 'Agent',
      cell: (r) => <span className="text-muted">{r.agent}</span>,
      sortBy: (r) => r.agent,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <ContractStatusChip status={r.contract.status} />,
      sortBy: (r) => r.contract.status,
    },
    {
      key: 'signed',
      header: 'Signed',
      cell: (r) => (
        <span className="tabular text-muted">{fmtDate(r.contract.signedAt)}</span>
      ),
      sortBy: (r) => r.contract.signedAt,
      width: '108px',
    },
  ]

  return (
    <div className="space-y-3">
      <FilterBar>
        <SearchBox value={q} onChange={setQ} placeholder="Contract no., buyer, lot" />
        <FilterSelect
          value={status}
          onChange={setStatus}
          label="Status"
          options={(Object.keys(CONTRACT_STATUS_LABEL) as ContractStatus[]).map((s) => ({
            value: s,
            label: CONTRACT_STATUS_LABEL[s],
          }))}
        />
        <FilterSelect
          value={need}
          onChange={setNeed}
          label="Need"
          options={Object.entries(NEED_TYPE_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <FilterSelect
          value={mode}
          onChange={setMode}
          label="Mode"
          options={Object.entries(PAYMENT_MODE_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <FilterSelect
          value={health}
          onChange={setHealth}
          label="Health"
          options={HEALTH_ORDER.map((h) => ({
            value: h,
            label: PAYMENT_HEALTH_APPEARANCE[h].label,
          }))}
        />
        <FilterSelect
          value={agent}
          onChange={setAgent}
          label="Agent"
          options={agents.map(([value, label]) => ({ value, label }))}
        />
      </FilterBar>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.contract.id}
        onRowClick={(r) => onOpen(r.contract.id)}
        rowActionLabel={(r) => `View contract ${r.contractNo}`}
        emptyIcon={IconContract}
        empty={{
          title: 'No contracts match',
          body: 'Adjust the filters to widen the search.',
        }}
        footer={
          <span>
            {formatCount(filtered.length)} of {formatCount(rows.length)} contracts ·
            outstanding{' '}
            <MoneyText
              centavos={filtered.reduce((s, r) => s + r.outstandingCentavos, 0)}
              className="text-ink"
            />
          </span>
        }
      />
    </div>
  )
}

// ── payments ─────────────────────────────────────────────────────────
interface PaymentRow {
  id: string
  orNo: string
  paidAt: string
  buyer: string
  contractNo: string
  contractId: ContractId
  amountCentavos: number
  method: PaymentMethod
  trustFundCentavos: number
  receivedBy: string
  status: 'posted' | 'void'
}

function PaymentsTab({
  rows,
  onOpen,
}: {
  rows: ContractRow[]
  onOpen: (id: ContractId) => void
}) {
  const version = useDataset((s) => s.version)
  const payments = useDataset((s) => s.data.payments)
  const [q, setQ] = useState('')
  const [method, setMethod] = useState<string>(ALL)
  const [status, setStatus] = useState<string>(ALL)
  const [from, setFrom] = useState('2024-08-01')
  const [to, setTo] = useState(TODAY)

  const all = useMemo<PaymentRow[]>(() => {
    void version
    const byContract = new Map(rows.map((r) => [r.contract.id as string, r]))
    return payments
      .filter((p) => byContract.has(p.contractId))
      .map((p) => {
        const r = byContract.get(p.contractId)!
        return {
          id: p.id,
          orNo: p.orNo,
          paidAt: p.paidAt,
          buyer: r.buyer,
          contractNo: r.contractNo,
          contractId: r.contract.id,
          amountCentavos: p.amountCentavos,
          method: p.method,
          trustFundCentavos: p.trustFundCentavos,
          receivedBy: indexes().usersById.get(p.receivedByUserId)?.fullName ?? '—',
          status: p.status,
        }
      })
      .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))
  }, [payments, rows, version])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter((p) => {
      if (needle && !`${p.orNo} ${p.buyer} ${p.contractNo}`.toLowerCase().includes(needle))
        return false
      if (method !== ALL && p.method !== method) return false
      if (status !== ALL && p.status !== status) return false
      if (p.paidAt < from || p.paidAt > to) return false
      return true
    })
  }, [all, q, method, status, from, to])

  const totals = useMemo(() => {
    const posted = filtered.filter((p) => p.status === 'posted')
    return {
      amount: posted.reduce((s, p) => s + p.amountCentavos, 0),
      trust: posted.reduce((s, p) => s + p.trustFundCentavos, 0),
    }
  }, [filtered])

  const columns: Column<PaymentRow>[] = [
    {
      key: 'or',
      header: 'OR no.',
      cell: (p) => (
        <span
          className={cn(
            'font-mono',
            p.status === 'void' && 'line-through opacity-60',
          )}
        >
          {p.orNo}
        </span>
      ),
      sortBy: (p) => p.orNo,
      width: '110px',
    },
    {
      key: 'date',
      header: 'Date',
      cell: (p) => <span className="tabular">{fmtDate(p.paidAt)}</span>,
      sortBy: (p) => p.paidAt,
      width: '108px',
    },
    { key: 'buyer', header: 'Buyer', cell: (p) => p.buyer, sortBy: (p) => p.buyer },
    {
      key: 'contract',
      header: 'Contract',
      cell: (p) => <span className="font-mono">{p.contractNo}</span>,
      sortBy: (p) => p.contractNo,
      width: '132px',
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (p) => (
        <MoneyText
          centavos={p.amountCentavos}
          className={p.status === 'void' ? 'line-through opacity-60' : undefined}
        />
      ),
      sortBy: (p) => p.amountCentavos,
    },
    {
      key: 'method',
      header: 'Method',
      cell: (p) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted">
          <Icon icon={METHOD_ICON[p.method]} size={14} />
          {PAYMENT_METHOD_LABEL[p.method]}
        </span>
      ),
      sortBy: (p) => p.method,
    },
    {
      key: 'trust',
      header: 'Trust fund',
      align: 'right',
      cell: (p) => (
        <MoneyText
          centavos={p.trustFundCentavos}
          className={p.status === 'void' ? 'text-muted line-through' : 'text-green'}
        />
      ),
      sortBy: (p) => p.trustFundCentavos,
    },
    {
      key: 'by',
      header: 'Received by',
      cell: (p) => <span className="text-muted">{p.receivedBy}</span>,
      sortBy: (p) => p.receivedBy,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (p) =>
        p.status === 'void' ? (
          <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-caption font-medium text-danger">
            Void
          </span>
        ) : (
          <span className="rounded-full border border-green/40 bg-green/10 px-2 py-0.5 text-caption font-medium text-green">
            Posted
          </span>
        ),
      sortBy: (p) => p.status,
    },
  ]

  return (
    <div className="space-y-3">
      <FilterBar>
        <SearchBox value={q} onChange={setQ} placeholder="OR no., buyer, contract" />
        <FilterSelect
          value={method}
          onChange={setMethod}
          label="Method"
          options={Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          label="Status"
          options={[
            { value: 'posted', label: 'Posted' },
            { value: 'void', label: 'Void' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="payments-from" className="text-caption text-muted">From</Label>
          <DateField
            id="payments-from"
            value={from}
            onChange={setFrom}
            max={to}
            className="w-full sm:w-auto"
          />
          <Label htmlFor="payments-to" className="text-caption text-muted">to</Label>
          <DateField
            id="payments-to"
            value={to}
            onChange={setTo}
            min={from}
            max={TODAY}
            className="w-full sm:w-auto"
          />
        </div>
      </FilterBar>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(p) => p.id}
        onRowClick={(p) => onOpen(p.contractId)}
        rowActionLabel={(p) => `View contract ${p.contractNo} for payment ${p.orNo}`}
        emptyIcon={IconPayment}
        empty={{ title: 'No payments in range', body: 'Widen the date range or filters.' }}
        footer={
          <span className="flex flex-wrap gap-x-5">
            <span>{formatCount(filtered.length)} payments</span>
            <span>
              Collected <MoneyText centavos={totals.amount} className="text-ink" />
            </span>
            <span>
              Trust fund accrued{' '}
              <MoneyText centavos={totals.trust} className="text-green" />
            </span>
          </span>
        }
      />
    </div>
  )
}

// ── receivables ──────────────────────────────────────────────────────
const RECEIVABLE_BUCKETS: PaymentHealth[] = [
  'severely_overdue',
  'overdue',
  'due_soon',
  'current',
]

function ReceivablesTab({
  rows,
  onOpen,
  onPay,
}: {
  rows: ContractRow[]
  onOpen: (id: ContractId) => void
  onPay: (c: Contract) => void
}) {
  const version = useDataset((s) => s.version)
  const locationId = useSession((s) => s.activeLocationId)
  const canPost = useCan('payment:post')
  const notify = useNotifications((s) => s.notify)
  const user = useCurrentUserOrNull()

  // Sourced from the same breakdown the dashboard card uses, so the two
  // totals cannot disagree.
  const breakdown = useMemo(() => {
    void version
    return receivablesBreakdown(locationId, TODAY)
  }, [locationId, version])

  const groups = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.contract.id as string, r]))
    const out = new Map<PaymentHealth, ContractRow[]>()
    for (const c of breakdown.contracts) {
      const row = byId.get(c.id)
      if (!row) continue
      const arr = out.get(row.health)
      if (arr) arr.push(row)
      else out.set(row.health, [row])
    }
    for (const arr of out.values()) arr.sort((a, b) => b.daysPastDue - a.daysPastDue)
    return out
  }, [breakdown, rows])

  function remind(r: ContractRow) {
    if (!user) return
    const profile = indexes().agentsById.get(r.contract.agentId)
    const agentUser = profile ? indexes().usersById.get(profile.userId) : null
    if (agentUser) {
      notify(
        [agentUser.id],
        'installment_overdue',
        `Follow up — ${r.contractNo}`,
        `${r.buyer} is ${r.daysPastDue} days past due on ${formatPeso(r.outstandingCentavos)}.`,
        '/sales',
      )
    }
    toast.success(`Reminder logged for ${r.buyer}.`, {
      description: 'The agent has been notified in-app.',
    })
  }

  const shown = [...groups.values()].flat()
  const totalShown = shown.reduce((s, r) => s + r.outstandingCentavos, 0)

  if (shown.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        <EmptyState
          icon={IconPayment}
          title="Nothing outstanding"
          body="Every active contract in view is paid up to date."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-2.5 text-body">
        <span className="text-muted">Total receivable</span>
        <MoneyText centavos={totalShown} className="text-small-title font-medium text-ink" />
        <span className="ml-auto text-muted">
          {canPost
            ? "The same figure as the dashboard's Receivables card."
            : 'Your own contracts only.'}
        </span>
      </div>

      {RECEIVABLE_BUCKETS.map((bucket) => {
        const rowsIn = groups.get(bucket) ?? []
        if (rowsIn.length === 0) return null
        const total = rowsIn.reduce((s, r) => s + r.outstandingCentavos, 0)

        return (
          <section key={bucket}>
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <HealthChip health={bucket} />
              <span className="text-caption text-muted">
                {formatCount(rowsIn.length)} contract{rowsIn.length === 1 ? '' : 's'}
              </span>
              <MoneyText
                centavos={total}
                className="ml-auto text-body font-medium text-ink"
              />
            </div>

            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <ul className="divide-y divide-line-soft">
                {rowsIn.map((r) => (
                  <li
                    key={r.contract.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(r.contract.id)}
                      className="min-h-11 min-w-[min(220px,100%)] flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block whitespace-normal break-words text-body text-ink">{r.buyer}</span>
                      <span className="block whitespace-normal break-words text-caption text-muted">
                        <span className="font-mono">{r.contractNo}</span> ·{' '}
                        <span className="font-mono">{r.lotCode}</span> · {r.agent}
                      </span>
                    </button>

                    <Cell label="Outstanding">
                      <MoneyText
                        centavos={r.outstandingCentavos}
                        className="text-body text-ink"
                      />
                    </Cell>
                    <Cell label="Past due" width={80}>
                      <span
                        className={cn(
                          'tabular text-body',
                          r.daysPastDue > 0 ? 'text-danger' : 'text-muted',
                        )}
                      >
                        {r.daysPastDue > 0 ? `${r.daysPastDue}d` : '—'}
                      </span>
                    </Cell>
                    <Cell label="Last payment" width={104}>
                      <span className="tabular text-caption text-muted">
                        {r.lastPaymentDate ? fmtDate(r.lastPaymentDate) : '—'}
                      </span>
                    </Cell>
                    <Cell label="Next due" width={104}>
                      <span className="tabular text-caption text-muted">
                        {r.nextDueDate ? fmtDate(r.nextDueDate) : '—'}
                      </span>
                    </Cell>

                    <div className="flex gap-1.5">
                      {canPost && (
                        <Button size="sm" onClick={() => onPay(r.contract)}>
                          Post payment
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => remind(r)}
                      >
                        <Icon icon={IconMail} size={13} />
                        Send reminder
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Cell({
  label,
  width,
  children,
}: {
  label: string
  width?: number
  children: React.ReactNode
}) {
  return (
    <div className="text-right" style={width ? { width } : undefined}>
      <span className="block text-micro uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  )
}

// ── clients ──────────────────────────────────────────────────────────
interface ClientRow {
  id: ClientId
  name: string
  ref: string
  city: string
  senior: boolean
  contracts: number
  totalCentavos: number
  outstandingCentavos: number
}

function ClientsTab({
  rows,
  onOpen,
}: {
  rows: ContractRow[]
  onOpen: (id: ClientId) => void
}) {
  const version = useDataset((s) => s.version)
  const clients = useDataset((s) => s.data.clients)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<string>(ALL)

  const all = useMemo<ClientRow[]>(() => {
    void version
    const stats = new Map<string, { n: number; total: number; out: number }>()
    for (const r of rows) {
      if (r.contract.status === 'cancelled') continue
      const s = stats.get(r.contract.clientId) ?? { n: 0, total: 0, out: 0 }
      s.n += 1
      s.total += r.totalCentavos
      s.out += r.outstandingCentavos
      stats.set(r.contract.clientId, s)
    }
    return clients.map((c) => {
      const s = stats.get(c.id) ?? { n: 0, total: 0, out: 0 }
      return {
        id: c.id,
        name: clientFullName(c),
        ref: c.clientRef,
        city: c.city,
        senior: c.seniorCitizen,
        contracts: s.n,
        totalCentavos: s.total,
        outstandingCentavos: s.out,
      }
    })
  }, [clients, rows, version])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter((c) => {
      if (needle && !`${c.name} ${c.ref} ${c.city}`.toLowerCase().includes(needle))
        return false
      if (only === 'senior' && !c.senior) return false
      if (only === 'buyers' && c.contracts === 0) return false
      if (only === 'outstanding' && c.outstandingCentavos === 0) return false
      return true
    })
  }, [all, q, only])

  const columns: Column<ClientRow>[] = [
    { key: 'name', header: 'Client', cell: (c) => c.name, sortBy: (c) => c.name },
    {
      key: 'ref',
      header: 'Reference',
      cell: (c) => <span className="font-mono text-muted">{c.ref}</span>,
      sortBy: (c) => c.ref,
      width: '128px',
    },
    {
      key: 'city',
      header: 'City',
      cell: (c) => <span className="text-muted">{c.city}</span>,
      sortBy: (c) => c.city,
    },
    {
      key: 'senior',
      header: 'Senior',
      align: 'center',
      cell: (c) =>
        c.senior ? (
          <span>
            <Icon
              icon={IconStar}
              size={14}
              className="mx-auto text-gold-deep dark:text-gold"
            />
            <span className="sr-only">Senior citizen</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
      sortBy: (c) => (c.senior ? 0 : 1),
      width: '76px',
    },
    {
      key: 'n',
      header: 'Contracts',
      align: 'right',
      cell: (c) => <span className="tabular">{c.contracts || '—'}</span>,
      sortBy: (c) => c.contracts,
      width: '96px',
    },
    {
      key: 'total',
      header: 'Contracted',
      align: 'right',
      cell: (c) => <MoneyText centavos={c.totalCentavos} muted={!c.totalCentavos} />,
      sortBy: (c) => c.totalCentavos,
    },
    {
      key: 'out',
      header: 'Outstanding',
      align: 'right',
      cell: (c) => (
        <MoneyText
          centavos={c.outstandingCentavos}
          className={c.outstandingCentavos > 0 ? 'text-ink' : 'text-muted'}
        />
      ),
      sortBy: (c) => c.outstandingCentavos,
    },
  ]

  return (
    <div className="space-y-3">
      <FilterBar>
        <SearchBox value={q} onChange={setQ} placeholder="Name, reference, city" />
        <FilterSelect
          value={only}
          onChange={setOnly}
          label="Show"
          allLabel="Everyone"
          options={[
            { value: 'buyers', label: 'With contracts' },
            { value: 'outstanding', label: 'With a balance' },
            { value: 'senior', label: 'Senior citizens' },
          ]}
        />
      </FilterBar>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(c) => c.id}
        onRowClick={(c) => onOpen(c.id)}
        rowActionLabel={(c) => `View client ${c.name}`}
        initialSort={{ key: 'out', dir: 'desc' }}
        emptyIcon={IconContract}
        empty={{ title: 'No clients match', body: 'Adjust the search or filter.' }}
        footer={
          <span>
            {formatCount(filtered.length)} of {formatCount(all.length)} clients
          </span>
        }
      />
    </div>
  )
}

// ── filter chrome ────────────────────────────────────────────────────
function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative min-w-[220px] flex-1 sm:max-w-[300px]">
      <Icon
        icon={IconSearch}
        size={15}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label="Search sales records"
      />
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
  allLabel,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  options: { value: string; label: string }[]
  allLabel?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full min-w-[min(132px,100%)] sm:w-auto" aria-label={`Filter by ${label}`}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel ?? `All ${label.toLowerCase()}`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
