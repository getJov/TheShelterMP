import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type StatTone = 'neutral' | 'positive' | 'warning' | 'danger'

const toneText: Record<StatTone, string> = {
  neutral: 'text-muted',
  positive: 'text-green',
  warning: 'text-gold-deep dark:text-gold',
  danger: 'text-danger',
}

export function StatCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  hint,
  size = 'sm',
  action,
  children,
  onClick,
  className,
}: {
  label: string
  value: ReactNode
  delta?: string
  deltaTone?: StatTone
  hint?: ReactNode
  size?: 'hero' | 'sm'
  action?: ReactNode
  /** Chart / sparkline slot. */
  children?: ReactNode
  onClick?: () => void
  className?: string
}) {
  const hero = size === 'hero'
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface transition-colors',
        'flex flex-col',
        hero ? 'p-5' : 'p-4',
        onClick && 'cursor-pointer hover:border-gold/60',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow text-muted">{label}</p>
        {action}
      </div>

      <div className="mt-2 flex items-baseline gap-2.5">
        <span
          className="font-display font-semibold tabular text-ink leading-none"
          style={{ fontSize: hero ? 34 : 23 }}
        >
          {value}
        </span>
        {delta && (
          <span className={cn('text-[12px] font-semibold tabular', toneText[deltaTone])}>
            {delta}
          </span>
        )}
      </div>

      {children && <div className={cn(hero ? 'mt-4' : 'mt-3')}>{children}</div>}

      {hint && <div className="mt-2.5 text-[12px] leading-snug text-muted">{hint}</div>}
    </div>
  )
}
