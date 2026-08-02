import {
  CONTRACT_STATUS_LABEL,
  PAYMENT_HEALTH_APPEARANCE,
  type ContractStatus,
  type PaymentHealth,
} from '@/domain'
import { cn } from '@/lib/utils'

/**
 * Health and status chips. Colours come from the domain appearance maps so
 * the sales tables, the map legend and the dashboard cannot drift apart.
 */
export function HealthChip({
  health,
  className,
  dense,
}: {
  health: PaymentHealth
  className?: string
  dense?: boolean
}) {
  const a = PAYMENT_HEALTH_APPEARANCE[health]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        dense ? 'px-1.5 py-px text-micro' : 'px-2 py-0.5 text-caption',
        className,
      )}
      style={{
        borderColor: `${a.color}55`,
        background: `${a.color}14`,
        color: a.color,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: a.color }} />
      {a.label}
    </span>
  )
}

const STATUS_TONE: Record<ContractStatus, string> = {
  draft: 'border-line bg-surface-2 text-muted',
  pending_approval: 'border-gold/45 bg-gold/12 text-gold-deep dark:text-gold',
  active: 'border-line bg-surface-2 text-ink',
  fully_paid: 'border-green/45 bg-green/12 text-green',
  cancelled: 'border-danger/40 bg-danger/10 text-danger',
}

export function ContractStatusChip({
  status,
  className,
}: {
  status: ContractStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-caption font-medium whitespace-nowrap',
        STATUS_TONE[status],
        className,
      )}
    >
      {CONTRACT_STATUS_LABEL[status]}
    </span>
  )
}

export function FieldRow({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1', className)}>
      <span className="text-caption text-muted">{label}</span>
      <span className="text-right text-body text-ink">{children}</span>
    </div>
  )
}
