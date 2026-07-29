import type { ReactNode } from 'react'
import type { IconSvgElement } from '@hugeicons/react'
import { Icon } from './Icon'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  compact,
}: {
  icon?: IconSvgElement
  title: string
  body?: string
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4' : 'py-16 px-6',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 grid size-11 place-items-center rounded-full border border-line bg-surface-2 text-muted">
          <Icon icon={icon} size={19} />
        </div>
      )}
      <p className="font-display text-ink" style={{ fontSize: compact ? 17 : 20 }}>
        {title}
      </p>
      {body && (
        <p className="mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">{body}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
