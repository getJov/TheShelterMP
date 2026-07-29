import { STATUS_APPEARANCE, type LotStatus } from '@/domain'
import { cn } from '@/lib/utils'

/**
 * The circle-plus-letter status badge. Shared by the map canvas, tables and
 * the lot drawer so the three renderings can never drift apart.
 */
export function StatusDot({
  status,
  withLetter = true,
  size = 16,
  className,
}: {
  status: LotStatus
  withLetter?: boolean
  size?: number
  className?: string
}) {
  const a = STATUS_APPEARANCE[status]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        'font-sans font-bold leading-none text-white',
        'ring-1 ring-white/70 dark:ring-black/30',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: a.color,
        fontSize: Math.round(size * 0.56),
      }}
      title={a.label}
    >
      {withLetter ? a.letter : ''}
    </span>
  )
}

export function StatusChip({
  status,
  className,
}: {
  status: LotStatus
  className?: string
}) {
  const a = STATUS_APPEARANCE[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-[12px] font-medium',
        className,
      )}
      style={{
        borderColor: `${a.color}55`,
        background: `${a.color}14`,
        color: a.color,
      }}
    >
      <StatusDot status={status} size={15} />
      {a.label}
    </span>
  )
}
