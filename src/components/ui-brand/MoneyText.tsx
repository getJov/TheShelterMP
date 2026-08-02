import type { Centavos } from '@/domain'
import { formatPeso } from '@/lib/money'
import { cn } from '@/lib/utils'

export function MoneyText({
  centavos,
  compact,
  decimals,
  sign,
  muted,
  className,
}: {
  centavos: Centavos | null | undefined
  compact?: boolean
  decimals?: boolean
  sign?: boolean
  muted?: boolean
  className?: string
}) {
  return (
    <span
      className={cn('tabular', muted && 'text-muted', className)}
    >
      {formatPeso(centavos, { compact, decimals, sign })}
    </span>
  )
}
