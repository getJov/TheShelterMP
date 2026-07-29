import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SectionHeading({
  eyebrow,
  title,
  action,
  className,
  size = 'md',
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const fs = size === 'lg' ? 30 : size === 'sm' ? 17 : 22
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1 text-gold-deep dark:text-gold">{eyebrow}</p>}
        <h2 className="font-display font-semibold text-ink truncate" style={{ fontSize: fs }}>
          {title}
        </h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
