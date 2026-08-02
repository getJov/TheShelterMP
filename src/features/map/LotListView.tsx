import { useEffect, useMemo, useState } from 'react'
import { PAYMENT_HEALTH_APPEARANCE, STATUS_APPEARANCE, type LotId } from '@/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { Icon } from '@/components/ui-brand/Icon'
import { IconMap, IconSearch } from '@/components/ui-brand/icons'
import { filtersActive, useMapStore } from '@/stores/map'
import { FilterPopover } from './MapControls'
import { lotMatches, type MapData, type MapLot } from './use-map-data'

const PAGE_SIZE = 25

function statusLabel(row: MapLot): string {
  if (row.visibility !== 'full' && row.lot.status !== 'available') return 'Unavailable'
  return STATUS_APPEARANCE[row.lot.status].label
}

export function LotListView({ data }: { data: MapData }) {
  const filters = useMapStore((state) => state.filters)
  const setQuery = useMapStore((state) => state.setQuery)
  const clearFilters = useMapStore((state) => state.clearFilters)
  const select = useMapStore((state) => state.select)
  const [page, setPage] = useState(1)

  const results = useMemo(
    () => data.lots.filter((row) => row.visibility !== 'hidden' && lotMatches(row, filters)),
    [data.lots, filters],
  )
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => setPage(1), [filters, data.lots])

  function viewLot(id: LotId) {
    select(id)
  }

  return (
    <section
      className="h-full overflow-y-auto bg-bg px-3 pb-8 pt-20 sm:px-5 lg:px-8"
      aria-labelledby="lot-list-title"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="lot-list-title" className="font-display text-page-title font-semibold text-ink">
              Lot list
            </h2>
            <p className="mt-1 max-w-3xl text-body leading-normal text-muted">
              Search and review the same lots shown on the map. Private owner and payment details appear only when your role allows them.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-2xl">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="lot-list-search" className="text-caption font-medium text-ink">
                Search lots
              </Label>
              <div className="relative">
                <Icon
                  icon={IconSearch}
                  size={18}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <Input
                  id="lot-list-search"
                  value={filters.query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Lot code, number, or authorized owner"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <FilterPopover data={data} />
              {(filtersActive(filters) || filters.query.trim()) && (
                <Button type="button" variant="ghost" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        <p className="py-4 text-body text-muted" aria-live="polite" aria-atomic="true">
          {results.length === 1 ? '1 lot found' : `${results.length} lots found`}
          {results.length > PAGE_SIZE ? `, page ${currentPage} of ${pageCount}` : ''}
        </p>

        {pageRows.length === 0 ? (
          <EmptyState
            icon={IconMap}
            title="No lots match these filters"
            body="Clear the current filters or try a different search."
            action={<Button onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <ul className="grid gap-3" aria-label="Lot results">
            {pageRows.map((row) => (
              <li key={row.lot.id}>
                <article className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 className="font-mono text-small-title font-semibold text-ink">{row.code}</h3>
                        <span className="text-caption font-medium text-muted">{statusLabel(row)}</span>
                      </div>
                      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Meta label="Block" value={row.blockCode || 'Not assigned'} />
                        <Meta label="Lot type" value={row.tier?.name ?? 'Not assigned'} />
                        {row.visibility === 'full' && row.health !== 'not_applicable' && (
                          <Meta label="Payment health" value={PAYMENT_HEALTH_APPEARANCE[row.health].label} />
                        )}
                        {row.ownerName && <Meta label="Owner" value={row.ownerName} />}
                      </dl>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      data-lot-list-action="true"
                      onClick={() => viewLot(row.lot.id)}
                    >
                      View lot <span className="sr-only">{row.code}</span>
                    </Button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}

        {pageCount > 1 && (
          <nav className="mt-6 flex flex-wrap items-center justify-center gap-3" aria-label="Lot list pages">
            <Button
              type="button"
              variant="outline"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <span className="text-body text-muted">
              Page {currentPage} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={currentPage === pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              Next
            </Button>
          </nav>
        )}
      </div>
    </section>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-body text-ink">{value}</dd>
    </div>
  )
}
