import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconArrowRight,
  IconChevronDown,
  IconDeltaDown,
  IconDeltaUp,
  IconExpand,
  IconMore,
} from '@/components/ui-brand/icons'
import { cn } from '@/lib/utils'
import { usePanel } from '@/stores/panel'
import type { CardProps } from './types'

export type DeltaTone = 'positive' | 'negative' | 'neutral'

/**
 * Shared card chrome. Title in 11px uppercase at 0.08em, value in Cormorant
 * with tabular numerals, optional delta chip, optional footer line, and the
 * overflow menu the spec asks for on every card.
 */
export function CardShell({
  card,
  value,
  delta,
  subtitle,
  footer,
  onOpen,
  detailsHref,
  detailsLabel = 'View details',
  children,
  className,
}: {
  card: CardProps
  value?: ReactNode
  delta?: { label: string; tone: DeltaTone } | null
  subtitle?: ReactNode
  footer?: ReactNode
  /** Makes the whole card a click target. */
  onOpen?: () => void
  detailsHref?: string
  detailsLabel?: string
  children?: ReactNode
  className?: string
}) {
  const { def, layout, collapsed } = card
  const navigate = useNavigate()
  const toggleCard = usePanel((s) => s.toggleCard)
  const setPanel = usePanel((s) => s.set)

  const hero = def.size === 'hero'
  const valueSize = hero ? (layout === 'full' ? 40 : 34) : 23

  return (
    <section
      onClick={onOpen}
      className={cn(
        'group relative flex flex-col rounded-[var(--radius-card)] border border-line bg-surface',
        'transition-[transform,border-color,box-shadow] duration-200 ease-[var(--ease-brand)]',
        'hover:-translate-y-px hover:border-line/100 hover:shadow-[0_2px_10px_-6px_rgba(0,0,0,0.35)]',
        hero ? 'p-4.5' : 'p-4',
        onOpen && 'cursor-pointer',
        className,
      )}
    >
      {/* Faint gold left edge marks a card that goes somewhere. */}
      {onOpen && (
        <span className="pointer-events-none absolute inset-y-2 left-0 w-[2px] rounded-r bg-gold opacity-0 transition-opacity duration-200 group-hover:opacity-70" />
      )}

      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="eyebrow truncate text-muted">{def.title}</h3>
          {subtitle && (
            <p className="mt-1 text-[11.5px] leading-snug text-muted">{subtitle}</p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              aria-label={`${def.title} options`}
              className="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center rounded text-muted opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Icon icon={IconMore} size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => toggleCard(def.id)}>
              <Icon icon={IconChevronDown} size={15} />
              {collapsed ? 'Expand' : 'Collapse'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPanel('full')}>
              <Icon icon={IconExpand} size={15} />
              Open full screen
            </DropdownMenuItem>
            {detailsHref && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(detailsHref)}>
                  <Icon icon={IconArrowRight} size={15} />
                  {detailsLabel}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {value !== undefined && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span
            className="font-display font-semibold leading-none tabular text-ink"
            style={{ fontSize: valueSize }}
          >
            {value}
          </span>
          {delta && <DeltaChip {...delta} />}
        </div>
      )}

      {/* Collapsed cards keep their header and value, dropping the chart. */}
      {!collapsed && children && (
        <div className={cn('min-w-0', hero ? 'mt-3.5' : 'mt-3')}>{children}</div>
      )}

      {!collapsed && footer && (
        <div className="mt-3 border-t border-line-soft pt-2.5 text-[11.5px] leading-snug text-muted">
          {footer}
        </div>
      )}
    </section>
  )
}

export function DeltaChip({ label, tone }: { label: string; tone: DeltaTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular',
        tone === 'positive' && 'bg-green/12 text-green',
        tone === 'negative' && 'bg-danger/12 text-danger',
        tone === 'neutral' && 'bg-surface-2 text-muted',
      )}
    >
      {tone !== 'neutral' && (
        <Icon icon={tone === 'positive' ? IconDeltaUp : IconDeltaDown} size={12} />
      )}
      {label}
    </span>
  )
}

/** Zero-data line — a designed sentence, never an empty chart frame. */
export function CardEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-line-soft px-3 py-3 text-center text-[12px] leading-snug text-muted">
      {children}
    </p>
  )
}

/** A labelled row that links somewhere. Used by Attention and Burials. */
export function CardRow({
  onClick,
  children,
  className,
}: {
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      disabled={!onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors',
        onClick && 'hover:bg-surface-2',
        !onClick && 'cursor-default',
        className,
      )}
    >
      {children}
    </button>
  )
}
