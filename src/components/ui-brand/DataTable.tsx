import { useMemo, useState, type ReactNode } from 'react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from './EmptyState'
import { Icon } from './Icon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: ReactNode
  /** Cell renderer. */
  cell: (row: T) => ReactNode
  /** Return a comparable value to enable sorting on this column. */
  sortBy?: (row: T) => string | number
  align?: 'left' | 'right' | 'center'
  width?: string
  className?: string
  headClassName?: string
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  empty,
  emptyIcon,
  initialSort,
  className,
  dense,
  footer,
  rowActionLabel,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  empty?: { title: string; body?: string; action?: ReactNode }
  emptyIcon?: IconSvgElement
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  className?: string
  dense?: boolean
  footer?: ReactNode
  rowActionLabel?: (row: T) => string
}) {
  const [sort, setSort] = useState(initialSort ?? null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortBy) return rows
    const by = col.sortBy
    return [...rows].sort((a, b) => {
      const av = by(a)
      const bv = by(b)
      const r = av < bv ? -1 : av > bv ? 1 : 0
      return sort.dir === 'asc' ? r : -r
    })
  }, [rows, sort, columns])

  if (rows.length === 0 && empty) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        <EmptyState
          icon={emptyIcon}
          title={empty.title}
          body={empty.body}
          action={empty.action}
        />
      </div>
    )
  }

  const pad = dense ? 'px-3 py-1.5' : 'px-3.5 py-2.5'

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface',
        className,
      )}
    >
      <Table>
        <TableHeader>
          <TableRow className="border-line hover:bg-transparent">
            {columns.map((c) => (
              <TableHead
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                aria-sort={
                  c.sortBy
                    ? sort?.key === c.key
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined
                }
                className={cn(
                  'h-auto bg-surface-2 text-caption font-semibold text-gold-deep dark:text-gold',
                  c.sortBy ? 'p-0' : pad,
                  !c.sortBy && c.align === 'right' && 'text-right',
                  !c.sortBy && c.align === 'center' && 'text-center',
                  c.headClassName,
                )}
              >
                {c.sortBy ? (
                  <button
                    type="button"
                    onClick={() =>
                      setSort((current) =>
                        current?.key === c.key
                          ? {
                              key: c.key,
                              dir: current.dir === 'asc' ? 'desc' : 'asc',
                            }
                          : { key: c.key, dir: 'asc' },
                      )
                    }
                    className={cn(
                      pad,
                      'inline-flex min-h-10 w-full cursor-pointer select-none items-center gap-1 rounded-sm text-inherit outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      c.align === 'right' && 'justify-end text-right',
                      c.align === 'center' && 'justify-center text-center',
                    )}
                  >
                    {c.header}
                    {sort?.key === c.key && (
                      <span aria-hidden className="text-micro">
                        {sort.dir === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1">{c.header}</span>
                )}
              </TableHead>
            ))}
            {onRowClick && (
              <TableHead className={cn(pad, 'h-auto bg-surface-2 text-caption')}>
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow
              key={rowKey(row)}
              className="border-line-soft"
            >
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  className={cn(
                    pad,
                    'text-body',
                    c.align === 'right' && 'text-right tabular',
                    c.align === 'center' && 'text-center',
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </TableCell>
              ))}
              {onRowClick && (
                <TableCell className={cn(pad, 'text-right')}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={rowActionLabel?.(row) ?? 'View details'}
                    onClick={() => onRowClick(row)}
                  >
                    View
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {footer && (
        <div className="border-t border-line bg-surface-2 px-3.5 py-2 text-caption text-muted">
          {footer}
        </div>
      )}
      {rows.length === 0 && !empty && (
        <div className="flex items-center justify-center gap-2 py-8 text-body text-muted">
          {emptyIcon && <Icon icon={emptyIcon} size={15} />} No records
        </div>
      )}
    </div>
  )
}
