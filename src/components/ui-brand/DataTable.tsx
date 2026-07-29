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
                className={cn(
                  pad,
                  'eyebrow h-auto bg-surface-2 text-gold-deep dark:text-gold',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                  c.sortBy && 'cursor-pointer select-none hover:text-ink',
                  c.headClassName,
                )}
                onClick={
                  c.sortBy
                    ? () =>
                        setSort((s) =>
                          s?.key === c.key
                            ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
                            : { key: c.key, dir: 'asc' },
                        )
                    : undefined
                }
              >
                <span className="inline-flex items-center gap-1">
                  {c.header}
                  {sort?.key === c.key && (
                    <span aria-hidden className="text-[9px]">
                      {sort.dir === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-line-soft',
                onRowClick && 'cursor-pointer hover:bg-surface-2',
              )}
            >
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  className={cn(
                    pad,
                    'text-[13.5px]',
                    c.align === 'right' && 'text-right tabular',
                    c.align === 'center' && 'text-center',
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {footer && (
        <div className="border-t border-line bg-surface-2 px-3.5 py-2 text-[12.5px] text-muted">
          {footer}
        </div>
      )}
      {rows.length === 0 && !empty && (
        <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted">
          {emptyIcon && <Icon icon={emptyIcon} size={15} />} No records
        </div>
      )}
    </div>
  )
}
