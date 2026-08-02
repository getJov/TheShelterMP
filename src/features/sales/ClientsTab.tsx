import { useMemo, useState, type ReactNode } from 'react'
import { clientFullName, type ClientId } from '@/domain'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { Icon } from '@/components/ui-brand/Icon'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { IconContract, IconStar } from '@/components/ui-brand/icons'
import { useDataset } from '@/stores/dataset'
import { formatCount } from '@/lib/money'
import {
  SALES_FILTER_ALL,
  SalesFilterBar,
  SalesFilterSelect,
} from './components/SalesFilterBar'
import type { ContractRow } from './lib'

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

interface ClientFilters {
  only: string
}

const EMPTY_FILTERS: ClientFilters = { only: SALES_FILTER_ALL }

export function ClientsTab({
  rows,
  onOpen,
}: {
  rows: ContractRow[]
  onOpen: (id: ClientId) => void
}) {
  const version = useDataset((state) => state.version)
  const clients = useDataset((state) => state.data.clients)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<ClientFilters>(EMPTY_FILTERS)

  const all = useMemo<ClientRow[]>(() => {
    void version
    const stats = new Map<
      string,
      { contracts: number; totalCentavos: number; outstandingCentavos: number }
    >()
    for (const row of rows) {
      if (row.contract.status === 'cancelled') continue
      const current = stats.get(row.contract.clientId) ?? {
        contracts: 0,
        totalCentavos: 0,
        outstandingCentavos: 0,
      }
      current.contracts += 1
      current.totalCentavos += row.totalCentavos
      current.outstandingCentavos += row.outstandingCentavos
      stats.set(row.contract.clientId, current)
    }
    return clients.map((client) => {
      const values = stats.get(client.id) ?? {
        contracts: 0,
        totalCentavos: 0,
        outstandingCentavos: 0,
      }
      return {
        id: client.id,
        name: clientFullName(client),
        ref: client.clientRef,
        city: client.city,
        senior: client.seniorCitizen,
        ...values,
      }
    })
  }, [clients, rows, version])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return all.filter((client) => {
      if (
        needle &&
        !`${client.name} ${client.ref} ${client.city}`.toLowerCase().includes(needle)
      ) {
        return false
      }
      if (filters.only === 'senior' && !client.senior) return false
      if (filters.only === 'buyers' && client.contracts === 0) return false
      if (filters.only === 'outstanding' && client.outstandingCentavos === 0) {
        return false
      }
      return true
    })
  }, [all, filters.only, query])

  const columns: Column<ClientRow>[] = [
    {
      key: 'name',
      header: 'Client',
      cell: (client) => client.name,
      sortBy: (client) => client.name,
    },
    {
      key: 'ref',
      header: 'Reference',
      cell: (client) => (
        <span className="font-mono text-[12.5px] text-muted">{client.ref}</span>
      ),
      sortBy: (client) => client.ref,
      width: '128px',
    },
    {
      key: 'city',
      header: 'City',
      cell: (client) => <span className="text-muted">{client.city}</span>,
      sortBy: (client) => client.city,
    },
    {
      key: 'senior',
      header: 'Senior',
      align: 'center',
      cell: (client) =>
        client.senior ? (
          <span className="inline-flex items-center justify-center">
            <Icon
              icon={IconStar}
              size={14}
              className="text-gold-deep dark:text-gold"
            />
            <span className="sr-only">Senior citizen</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
      sortBy: (client) => (client.senior ? 0 : 1),
      width: '76px',
    },
    {
      key: 'n',
      header: 'Contracts',
      align: 'right',
      cell: (client) => <span className="tabular">{client.contracts || '—'}</span>,
      sortBy: (client) => client.contracts,
      width: '96px',
    },
    {
      key: 'total',
      header: 'Contracted',
      align: 'right',
      cell: (client) => (
        <MoneyText centavos={client.totalCentavos} muted={!client.totalCentavos} />
      ),
      sortBy: (client) => client.totalCentavos,
    },
    {
      key: 'out',
      header: 'Outstanding',
      align: 'right',
      cell: (client) => (
        <MoneyText
          centavos={client.outstandingCentavos}
          className={client.outstandingCentavos > 0 ? 'text-ink' : 'text-muted'}
        />
      ),
      sortBy: (client) => client.outstandingCentavos,
    },
  ]

  return (
    <div className="min-w-0 space-y-3">
      <SalesFilterBar
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Name, reference, city"
        searchLabel="Search clients"
        values={filters}
        emptyValues={EMPTY_FILTERS}
        onApply={setFilters}
        title="Client filters"
        description="Show clients by contract, balance, or senior status."
        renderFilters={({ values, setValue, idPrefix, layout }) => (
          <SalesFilterSelect
            id={`${idPrefix}-show`}
            label="Show"
            value={values.only}
            onChange={(value) => setValue('only', value)}
            allLabel="Everyone"
            options={[
              { value: 'buyers', label: 'With contracts' },
              { value: 'outstanding', label: 'With a balance' },
              { value: 'senior', label: 'Senior citizens' },
            ]}
            layout={layout}
          />
        )}
      />

      <div className="hidden lg:block">
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(client) => client.id}
          onRowClick={(client) => onOpen(client.id)}
          rowActionLabel={(client) => `Open ${client.name} details`}
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

      <div className="lg:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface">
            <EmptyState
              compact
              icon={IconContract}
              title="No clients match"
              body="Adjust the search or filter."
            />
          </div>
        ) : (
          <>
            <ul
              aria-label="Clients"
              className="divide-y divide-line-soft overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface"
            >
              {filtered.map((client) => (
                <li key={client.id} className="space-y-3 px-3 py-3.5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-[14px] font-medium text-ink">
                        {client.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] text-muted">
                        {client.ref}
                      </p>
                    </div>
                    {client.senior && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gold/45 bg-gold/12 px-2 py-0.5 text-[12px] font-medium text-gold-deep dark:text-gold">
                        <Icon icon={IconStar} size={13} />
                        Senior
                      </span>
                    )}
                  </div>

                  <p className="break-words text-[12.5px] text-muted">{client.city}</p>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-line-soft py-2.5">
                    <ClientFact label="Outstanding">
                      <MoneyText
                        centavos={client.outstandingCentavos}
                        className={
                          client.outstandingCentavos > 0 ? 'text-ink' : 'text-muted'
                        }
                      />
                    </ClientFact>
                    <ClientFact label="Contracts">
                      <span className="tabular">{client.contracts || '—'}</span>
                    </ClientFact>
                    <ClientFact label="Total contracted">
                      <MoneyText
                        centavos={client.totalCentavos}
                        muted={!client.totalCentavos}
                      />
                    </ClientFact>
                    <ClientFact label="Senior status">
                      {client.senior ? 'Senior citizen' : 'Not marked senior'}
                    </ClientFact>
                  </dl>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    aria-label={`Open ${client.name} details`}
                    onClick={() => onOpen(client.id)}
                  >
                    Open client details
                  </Button>
                </li>
              ))}
            </ul>
            <p className="rounded-[var(--radius-card)] border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
              {formatCount(filtered.length)} of {formatCount(all.length)} clients
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function ClientFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-[13px] text-ink">{children}</dd>
    </div>
  )
}
