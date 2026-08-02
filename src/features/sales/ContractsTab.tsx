import { useMemo, useState, type ReactNode } from 'react'
import {
  CONTRACT_STATUS_LABEL,
  NEED_TYPE_LABEL,
  PAYMENT_HEALTH_APPEARANCE,
  PAYMENT_MODE_LABEL,
  type ContractId,
  type ContractStatus,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { IconContract } from '@/components/ui-brand/icons'
import { fmtDate } from '@/lib/dates'
import { formatCount } from '@/lib/money'
import {
  SALES_FILTER_ALL,
  SalesFilterBar,
  SalesFilterSelect,
} from './components/SalesFilterBar'
import { ContractStatusChip, HealthChip } from './components/chips'
import { HEALTH_ORDER, type ContractRow } from './lib'

interface ContractFilters {
  status: string
  need: string
  mode: string
  health: string
  agent: string
}

const EMPTY_FILTERS: ContractFilters = {
  status: SALES_FILTER_ALL,
  need: SALES_FILTER_ALL,
  mode: SALES_FILTER_ALL,
  health: SALES_FILTER_ALL,
  agent: SALES_FILTER_ALL,
}

export function ContractsTab({
  rows,
  onOpen,
}: {
  rows: ContractRow[]
  onOpen: (id: ContractId) => void
}) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<ContractFilters>(EMPTY_FILTERS)

  const agents = useMemo(() => {
    const values = new Map<string, string>()
    for (const row of rows) values.set(row.contract.agentId, row.agent)
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (
        needle &&
        !`${row.contractNo} ${row.buyer} ${row.lotCode} ${row.tier}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false
      }
      if (
        filters.status !== SALES_FILTER_ALL &&
        row.contract.status !== filters.status
      ) {
        return false
      }
      if (filters.need !== SALES_FILTER_ALL && row.contract.needType !== filters.need) {
        return false
      }
      if (filters.mode !== SALES_FILTER_ALL && row.contract.paymentMode !== filters.mode) {
        return false
      }
      if (filters.health !== SALES_FILTER_ALL && row.health !== filters.health) {
        return false
      }
      if (filters.agent !== SALES_FILTER_ALL && row.contract.agentId !== filters.agent) {
        return false
      }
      return true
    })
  }, [filters, query, rows])

  const outstandingCentavos = filtered.reduce(
    (sum, row) => sum + row.outstandingCentavos,
    0,
  )

  const columns: Column<ContractRow>[] = [
    {
      key: 'no',
      header: 'Contract',
      cell: (row) => <span className="font-mono text-[12.5px]">{row.contractNo}</span>,
      sortBy: (row) => row.contractNo,
      width: '132px',
    },
    {
      key: 'buyer',
      header: 'Buyer',
      cell: (row) => row.buyer,
      sortBy: (row) => row.buyer,
    },
    {
      key: 'lot',
      header: 'Lot',
      cell: (row) => <span className="font-mono text-[12.5px]">{row.lotCode}</span>,
      sortBy: (row) => row.lotCode,
      width: '96px',
    },
    {
      key: 'tier',
      header: 'Tier',
      cell: (row) => <span className="text-muted">{row.tier}</span>,
      sortBy: (row) => row.tier,
    },
    {
      key: 'terms',
      header: 'Terms',
      cell: (row) => (
        <span className="whitespace-nowrap text-muted">
          {NEED_TYPE_LABEL[row.contract.needType]} ·{' '}
          {PAYMENT_MODE_LABEL[row.contract.paymentMode]}
          {row.contract.termMonths ? ` ${row.contract.termMonths}mo` : ''}
        </span>
      ),
      sortBy: (row) => row.contract.paymentMode,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      cell: (row) => <MoneyText centavos={row.totalCentavos} />,
      sortBy: (row) => row.totalCentavos,
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      cell: (row) => (
        <MoneyText centavos={row.paidCentavos} muted={row.paidCentavos === 0} />
      ),
      sortBy: (row) => row.paidCentavos,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (row) => (
        <MoneyText
          centavos={row.outstandingCentavos}
          className={row.outstandingCentavos === 0 ? 'text-green' : 'text-ink'}
        />
      ),
      sortBy: (row) => row.outstandingCentavos,
    },
    {
      key: 'health',
      header: 'Health',
      cell: (row) => <HealthChip health={row.health} dense />,
      sortBy: (row) => HEALTH_ORDER.indexOf(row.health),
    },
    {
      key: 'agent',
      header: 'Agent',
      cell: (row) => <span className="text-muted">{row.agent}</span>,
      sortBy: (row) => row.agent,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <ContractStatusChip status={row.contract.status} />,
      sortBy: (row) => row.contract.status,
    },
    {
      key: 'signed',
      header: 'Signed',
      cell: (row) => (
        <span className="tabular text-muted">{fmtDate(row.contract.signedAt)}</span>
      ),
      sortBy: (row) => row.contract.signedAt,
      width: '108px',
    },
  ]

  return (
    <div className="min-w-0 space-y-3">
      <SalesFilterBar
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Contract no., buyer, lot"
        searchLabel="Search contracts"
        values={filters}
        emptyValues={EMPTY_FILTERS}
        onApply={setFilters}
        title="Contract filters"
        description="Filter contracts by status, terms, payment health, or agent."
        renderFilters={({ values, setValue, idPrefix, layout }) => (
          <>
            <SalesFilterSelect
              id={`${idPrefix}-status`}
              label="Status"
              value={values.status}
              onChange={(value) => setValue('status', value)}
              options={(Object.keys(CONTRACT_STATUS_LABEL) as ContractStatus[]).map(
                (status) => ({ value: status, label: CONTRACT_STATUS_LABEL[status] }),
              )}
              layout={layout}
            />
            <SalesFilterSelect
              id={`${idPrefix}-need`}
              label="Need"
              value={values.need}
              onChange={(value) => setValue('need', value)}
              options={Object.entries(NEED_TYPE_LABEL).map(([value, label]) => ({
                value,
                label,
              }))}
              layout={layout}
            />
            <SalesFilterSelect
              id={`${idPrefix}-mode`}
              label="Mode"
              value={values.mode}
              onChange={(value) => setValue('mode', value)}
              options={Object.entries(PAYMENT_MODE_LABEL).map(([value, label]) => ({
                value,
                label,
              }))}
              layout={layout}
            />
            <SalesFilterSelect
              id={`${idPrefix}-health`}
              label="Health"
              value={values.health}
              onChange={(value) => setValue('health', value)}
              options={HEALTH_ORDER.map((health) => ({
                value: health,
                label: PAYMENT_HEALTH_APPEARANCE[health].label,
              }))}
              layout={layout}
            />
            <SalesFilterSelect
              id={`${idPrefix}-agent`}
              label="Agent"
              value={values.agent}
              onChange={(value) => setValue('agent', value)}
              options={agents.map(([value, label]) => ({ value, label }))}
              layout={layout}
            />
          </>
        )}
      />

      <div className="hidden lg:block">
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(row) => row.contract.id}
          onRowClick={(row) => onOpen(row.contract.id)}
          emptyIcon={IconContract}
          empty={{
            title: 'No contracts match',
            body: 'Adjust the filters to widen the search.',
          }}
          footer={
            <span>
              {formatCount(filtered.length)} of {formatCount(rows.length)} contracts ·
              outstanding{' '}
              <MoneyText centavos={outstandingCentavos} className="text-ink" />
            </span>
          }
        />
      </div>

      <div className="lg:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface">
            <EmptyState
              compact
              icon={IconContract}
              title="No contracts match"
              body="Adjust the filters to widen the search."
            />
          </div>
        ) : (
          <>
            <ul
              aria-label="Contracts"
              className="divide-y divide-line-soft overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface"
            >
              {filtered.map((row) => (
                <li key={row.contract.id} className="space-y-3 px-3 py-3.5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-[14px] font-medium text-ink">
                        {row.buyer}
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] text-muted">
                        {row.contractNo}
                      </p>
                    </div>
                    <ContractStatusChip status={row.contract.status} className="shrink-0" />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                    <span className="font-mono text-ink">{row.lotCode}</span>
                    <span aria-hidden="true">·</span>
                    <span>{row.tier}</span>
                    <HealthChip health={row.health} dense className="ml-auto" />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-line-soft py-2.5">
                    <ContractFact label="Contract value">
                      <MoneyText centavos={row.totalCentavos} />
                    </ContractFact>
                    <ContractFact label="Paid">
                      <MoneyText
                        centavos={row.paidCentavos}
                        muted={row.paidCentavos === 0}
                      />
                    </ContractFact>
                    <ContractFact label="Balance">
                      <MoneyText
                        centavos={row.outstandingCentavos}
                        className={
                          row.outstandingCentavos === 0 ? 'text-green' : 'text-ink'
                        }
                      />
                    </ContractFact>
                    <ContractFact label="Signed">
                      <span className="tabular">{fmtDate(row.contract.signedAt)}</span>
                    </ContractFact>
                  </dl>

                  <p className="break-words text-[12px] leading-relaxed text-muted">
                    {NEED_TYPE_LABEL[row.contract.needType]} ·{' '}
                    {PAYMENT_MODE_LABEL[row.contract.paymentMode]}
                    {row.contract.termMonths ? ` ${row.contract.termMonths}mo` : ''} ·{' '}
                    {row.agent}
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    aria-label={`Open ${row.contractNo} details`}
                    onClick={() => onOpen(row.contract.id)}
                  >
                    Open contract details
                  </Button>
                </li>
              ))}
            </ul>
            <p className="rounded-[var(--radius-card)] border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
              {formatCount(filtered.length)} of {formatCount(rows.length)} contracts ·
              outstanding{' '}
              <MoneyText centavos={outstandingCentavos} className="text-ink" />
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function ContractFact({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-[13px] text-ink">{children}</dd>
    </div>
  )
}
