import { useMemo, useState, type ReactNode } from 'react'
import {
  PAYMENT_METHOD_LABEL,
  type ContractId,
  type ISODate,
  type PaymentMethod,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { Icon } from '@/components/ui-brand/Icon'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { IconPayment } from '@/components/ui-brand/icons'
import { indexes, useDataset } from '@/stores/dataset'
import { fmtDate } from '@/lib/dates'
import { formatCount } from '@/lib/money'
import { cn } from '@/lib/utils'
import { TODAY } from '@/mock'
import {
  SALES_FILTER_ALL,
  SalesFilterBar,
  SalesFilterSelect,
} from './components/SalesFilterBar'
import { DateField } from './components/DateField'
import { METHOD_ICON, type ContractRow } from './lib'

interface PaymentRow {
  id: string
  orNo: string
  paidAt: ISODate
  buyer: string
  contractNo: string
  contractId: ContractId
  amountCentavos: number
  method: PaymentMethod
  trustFundCentavos: number
  receivedBy: string
  status: 'posted' | 'void'
}

interface PaymentFilters {
  method: string
  status: string
  from: ISODate
  to: ISODate
}

const EMPTY_FILTERS: PaymentFilters = {
  method: SALES_FILTER_ALL,
  status: SALES_FILTER_ALL,
  from: '2024-08-01',
  to: TODAY,
}

export function PaymentsTab({
  rows,
  onOpen,
}: {
  rows: ContractRow[]
  onOpen: (id: ContractId) => void
}) {
  const version = useDataset((state) => state.version)
  const payments = useDataset((state) => state.data.payments)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<PaymentFilters>(EMPTY_FILTERS)

  const all = useMemo<PaymentRow[]>(() => {
    void version
    const byContract = new Map(rows.map((row) => [row.contract.id as string, row]))
    return payments
      .filter((payment) => byContract.has(payment.contractId))
      .map((payment) => {
        const row = byContract.get(payment.contractId)!
        return {
          id: payment.id,
          orNo: payment.orNo,
          paidAt: payment.paidAt,
          buyer: row.buyer,
          contractNo: row.contractNo,
          contractId: row.contract.id,
          amountCentavos: payment.amountCentavos,
          method: payment.method,
          trustFundCentavos: payment.trustFundCentavos,
          receivedBy:
            indexes().usersById.get(payment.receivedByUserId)?.fullName ?? '—',
          status: payment.status,
        }
      })
      .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))
  }, [payments, rows, version])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return all.filter((payment) => {
      if (
        needle &&
        !`${payment.orNo} ${payment.buyer} ${payment.contractNo}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false
      }
      if (
        filters.method !== SALES_FILTER_ALL &&
        payment.method !== filters.method
      ) {
        return false
      }
      if (
        filters.status !== SALES_FILTER_ALL &&
        payment.status !== filters.status
      ) {
        return false
      }
      if (payment.paidAt < filters.from || payment.paidAt > filters.to) return false
      return true
    })
  }, [all, filters, query])

  const totals = useMemo(() => {
    const posted = filtered.filter((payment) => payment.status === 'posted')
    return {
      amountCentavos: posted.reduce(
        (sum, payment) => sum + payment.amountCentavos,
        0,
      ),
      trustCentavos: posted.reduce(
        (sum, payment) => sum + payment.trustFundCentavos,
        0,
      ),
    }
  }, [filtered])

  const columns: Column<PaymentRow>[] = [
    {
      key: 'or',
      header: 'OR no.',
      cell: (payment) => (
        <span
          className={cn(
            'font-mono text-[12.5px]',
            payment.status === 'void' && 'line-through opacity-60',
          )}
        >
          {payment.orNo}
        </span>
      ),
      sortBy: (payment) => payment.orNo,
      width: '110px',
    },
    {
      key: 'date',
      header: 'Date',
      cell: (payment) => <span className="tabular">{fmtDate(payment.paidAt)}</span>,
      sortBy: (payment) => payment.paidAt,
      width: '108px',
    },
    {
      key: 'buyer',
      header: 'Buyer',
      cell: (payment) => payment.buyer,
      sortBy: (payment) => payment.buyer,
    },
    {
      key: 'contract',
      header: 'Contract',
      cell: (payment) => (
        <span className="font-mono text-[12.5px]">{payment.contractNo}</span>
      ),
      sortBy: (payment) => payment.contractNo,
      width: '132px',
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (payment) => (
        <MoneyText
          centavos={payment.amountCentavos}
          className={payment.status === 'void' ? 'line-through opacity-60' : undefined}
        />
      ),
      sortBy: (payment) => payment.amountCentavos,
    },
    {
      key: 'method',
      header: 'Method',
      cell: (payment) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted">
          <Icon icon={METHOD_ICON[payment.method]} size={14} />
          {PAYMENT_METHOD_LABEL[payment.method]}
        </span>
      ),
      sortBy: (payment) => payment.method,
    },
    {
      key: 'trust',
      header: 'Trust fund',
      align: 'right',
      cell: (payment) => (
        <MoneyText
          centavos={payment.trustFundCentavos}
          className={
            payment.status === 'void' ? 'text-muted line-through' : 'text-green'
          }
        />
      ),
      sortBy: (payment) => payment.trustFundCentavos,
    },
    {
      key: 'by',
      header: 'Received by',
      cell: (payment) => <span className="text-muted">{payment.receivedBy}</span>,
      sortBy: (payment) => payment.receivedBy,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (payment) => <PaymentStatus status={payment.status} />,
      sortBy: (payment) => payment.status,
    },
  ]

  return (
    <div className="min-w-0 space-y-3">
      <SalesFilterBar
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="OR no., buyer, contract"
        searchLabel="Search payments"
        values={filters}
        emptyValues={EMPTY_FILTERS}
        onApply={setFilters}
        title="Payment filters"
        description="Filter payments by method, posting status, or date range."
        renderFilters={({ values, setValue, idPrefix, layout }) => (
          <>
            <SalesFilterSelect
              id={`${idPrefix}-method`}
              label="Method"
              value={values.method}
              onChange={(value) => setValue('method', value)}
              options={Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({
                value,
                label,
              }))}
              layout={layout}
            />
            <SalesFilterSelect
              id={`${idPrefix}-status`}
              label="Status"
              value={values.status}
              onChange={(value) => setValue('status', value)}
              options={[
                { value: 'posted', label: 'Posted' },
                { value: 'void', label: 'Void' },
              ]}
              layout={layout}
            />
            <div
              className={cn(
                layout === 'mobile'
                  ? 'grid grid-cols-1 gap-4'
                  : 'flex flex-wrap items-center gap-1.5',
              )}
            >
              <div className={layout === 'mobile' ? 'grid gap-2' : 'contents'}>
                {layout === 'mobile' ? (
                  <Label htmlFor={`${idPrefix}-from`} className="text-[12.5px] text-muted">
                    From
                  </Label>
                ) : (
                  <span className="text-[11.5px] text-muted">From</span>
                )}
                <DateField
                  id={`${idPrefix}-from`}
                  value={values.from}
                  onChange={(value) => setValue('from', value)}
                  max={values.to}
                  label="Payments from date"
                  className={layout === 'mobile' ? 'h-11 w-full' : 'w-[148px]'}
                />
              </div>
              <div className={layout === 'mobile' ? 'grid gap-2' : 'contents'}>
                {layout === 'mobile' ? (
                  <Label htmlFor={`${idPrefix}-to`} className="text-[12.5px] text-muted">
                    To
                  </Label>
                ) : (
                  <span className="text-[11.5px] text-muted">to</span>
                )}
                <DateField
                  id={`${idPrefix}-to`}
                  value={values.to}
                  onChange={(value) => setValue('to', value)}
                  min={values.from}
                  max={TODAY}
                  label="Payments to date"
                  className={layout === 'mobile' ? 'h-11 w-full' : 'w-[148px]'}
                />
              </div>
            </div>
          </>
        )}
      />

      <div className="hidden lg:block">
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(payment) => payment.id}
          onRowClick={(payment) => onOpen(payment.contractId)}
          rowActionLabel={(payment) =>
            `Open contract ${payment.contractNo} for receipt ${payment.orNo}`
          }
          emptyIcon={IconPayment}
          empty={{
            title: 'No payments in range',
            body: 'Widen the date range or filters.',
          }}
          footer={<PaymentTotals count={filtered.length} totals={totals} />}
        />
      </div>

      <div className="lg:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface">
            <EmptyState
              compact
              icon={IconPayment}
              title="No payments in range"
              body="Widen the date range or filters."
            />
          </div>
        ) : (
          <>
            <ul
              aria-label="Payments"
              className="divide-y divide-line-soft overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface"
            >
              {filtered.map((payment) => (
                <li key={payment.id} className="space-y-3 px-3 py-3.5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'font-mono text-[13px] text-ink',
                          payment.status === 'void' && 'line-through opacity-60',
                        )}
                      >
                        {payment.orNo}
                      </p>
                      <p className="mt-0.5 break-words text-[14px] font-medium text-ink">
                        {payment.buyer}
                      </p>
                    </div>
                    <PaymentStatus status={payment.status} />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-line-soft py-2.5">
                    <PaymentFact label="Date">
                      <span className="tabular">{fmtDate(payment.paidAt)}</span>
                    </PaymentFact>
                    <PaymentFact label="Amount">
                      <MoneyText
                        centavos={payment.amountCentavos}
                        className={
                          payment.status === 'void'
                            ? 'line-through opacity-60'
                            : undefined
                        }
                      />
                    </PaymentFact>
                    <PaymentFact label="Contract">
                      <span className="font-mono">{payment.contractNo}</span>
                    </PaymentFact>
                    <PaymentFact label="Method">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon icon={METHOD_ICON[payment.method]} size={14} />
                        {PAYMENT_METHOD_LABEL[payment.method]}
                      </span>
                    </PaymentFact>
                    <PaymentFact label="Trust fund">
                      <MoneyText
                        centavos={payment.trustFundCentavos}
                        className={
                          payment.status === 'void'
                            ? 'text-muted line-through'
                            : 'text-green'
                        }
                      />
                    </PaymentFact>
                    <PaymentFact label="Received by">
                      <span className="break-words">{payment.receivedBy}</span>
                    </PaymentFact>
                  </dl>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    aria-label={`Open contract ${payment.contractNo} for receipt ${payment.orNo}`}
                    onClick={() => onOpen(payment.contractId)}
                  >
                    Open contract details
                  </Button>
                </li>
              ))}
            </ul>
            <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
              <PaymentTotals count={filtered.length} totals={totals} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PaymentStatus({ status }: { status: PaymentRow['status'] }) {
  return status === 'void' ? (
    <span className="shrink-0 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[12px] font-medium text-danger">
      Void
    </span>
  ) : (
    <span className="shrink-0 rounded-full border border-green/40 bg-green/10 px-2 py-0.5 text-[12px] font-medium text-green">
      Posted
    </span>
  )
}

function PaymentFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-[13px] text-ink">{children}</dd>
    </div>
  )
}

function PaymentTotals({
  count,
  totals,
}: {
  count: number
  totals: { amountCentavos: number; trustCentavos: number }
}) {
  return (
    <span className="flex flex-wrap gap-x-5 gap-y-1">
      <span>{formatCount(count)} payments</span>
      <span>
        Collected <MoneyText centavos={totals.amountCentavos} className="text-ink" />
      </span>
      <span>
        Trust fund accrued{' '}
        <MoneyText centavos={totals.trustCentavos} className="text-green" />
      </span>
    </span>
  )
}
