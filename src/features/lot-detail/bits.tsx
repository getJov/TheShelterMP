import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { PAYMENT_HEALTH_APPEARANCE, type PaymentHealth } from '@/domain'
import { Progress } from '@/components/ui/progress'
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

export const EASE = [0.22, 1, 0.36, 1] as const
export const DURATION = 0.32

/** A labelled row in a definition grid. Right-aligned value, muted label. */
export function Field({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-[3px]', className)}>
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <span className="min-w-0 text-right text-[12.5px] text-ink">{children}</span>
    </div>
  )
}

/**
 * An accordion section whose header carries a summary on the right, so the
 * panel reads fully collapsed.
 */
export function Section({
  value,
  title,
  summary,
  children,
}: {
  value: string
  title: string
  summary?: ReactNode
  children: ReactNode
}) {
  return (
    <AccordionItem value={value} className="border-b border-line-soft last:border-b-0">
      <AccordionTrigger className="items-center py-3 no-underline hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2">
          <span className="eyebrow shrink-0 text-gold-deep dark:text-gold">{title}</span>
          {summary != null && (
            <span className="min-w-0 truncate text-right text-[12.5px] text-muted">
              {summary}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">{children}</AccordionContent>
    </AccordionItem>
  )
}

/** A bordered surface used for every card inside the drawer. */
export function Panel({
  children,
  className,
  tone = 'plain',
}: {
  children: ReactNode
  className?: string
  tone?: 'plain' | 'gold' | 'danger' | 'green'
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border px-3.5 py-3',
        tone === 'plain' && 'border-line bg-surface',
        tone === 'gold' && 'border-gold/45 bg-gold/8',
        tone === 'danger' && 'border-danger/40 bg-danger/8',
        tone === 'green' && 'border-green/40 bg-green/8',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * shadcn `Progress`, tinted through a CSS variable. The colour comes from the
 * domain appearance map, so the bar, the map fill and the sales table can
 * never disagree about what "overdue" looks like.
 */
export function TintedProgress({
  value,
  color,
  className,
}: {
  value: number
  color: string
  className?: string
}) {
  return (
    <Progress
      value={Math.max(0, Math.min(100, value))}
      className={cn(
        'h-2 bg-line-soft [&>[data-slot=progress-indicator]]:bg-[var(--bar)]',
        '[&>[data-slot=progress-indicator]]:transition-transform',
        '[&>[data-slot=progress-indicator]]:duration-500',
        className,
      )}
      style={{ '--bar': color } as CSSProperties}
    />
  )
}

/** The paid-share bar, tinted by the health value the finance layer returned. */
export function HealthBar({
  ratio,
  health,
  className,
}: {
  ratio: number
  health: PaymentHealth
  className?: string
}) {
  return (
    <TintedProgress
      value={Math.round(ratio * 100)}
      color={PAYMENT_HEALTH_APPEARANCE[health].color}
      className={className}
    />
  )
}

/** Small uppercase caption used above blocks inside a section. */
export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('eyebrow text-muted', className)}>{children}</p>
}

/** Masked so a shoulder-surfer at the counter cannot lift a client's number. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const trimmed = phone.trim()
  if (trimmed.length <= 4) return trimmed
  return `${trimmed.slice(0, Math.min(8, trimmed.length - 4))} ••• ${trimmed.slice(-4)}`
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}
