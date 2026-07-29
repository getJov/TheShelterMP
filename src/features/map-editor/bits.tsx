import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icon } from '@/components/ui-brand/Icon'
import { IconWarning } from '@/components/ui-brand/icons'
import { cn } from '@/lib/utils'
import { numberingPreview, type Numbering } from '@/lib/grid-generator'

export function PanelSection({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('border-b border-line px-3.5 py-3.5 last:border-b-0', className)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="eyebrow text-gold-deep dark:text-gold">{title}</p>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[11.5px] font-medium text-muted">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  )
}

/** Number input with steppers. `type="number"` is not one of the banned controls. */
export function NumberField({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  suffix,
  id,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  id?: string
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className="flex items-stretch gap-1">
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="size-8 shrink-0"
        aria-label="Decrease"
        onClick={() => onChange(clamp(value - step))}
      >
        <span className="text-[15px] leading-none">−</span>
      </Button>
      <div className="relative min-w-0 flex-1">
        <Input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className={cn('h-8 tabular text-[13px]', suffix && 'pr-8')}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted">
            {suffix}
          </span>
        )}
      </div>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="size-8 shrink-0"
        aria-label="Increase"
        onClick={() => onChange(clamp(value + step))}
      >
        <span className="text-[15px] leading-none">+</span>
      </Button>
    </div>
  )
}

/**
 * The 3×3 order a numbering scheme produces. Reading the arrows takes about a
 * second; reading the word "boustrophedon" takes rather longer.
 */
export function NumberingDiagram({ scheme }: { scheme: Numbering }) {
  const grid = numberingPreview(scheme)
  return (
    <div className="grid shrink-0 grid-cols-3 gap-[1.5px] rounded border border-line bg-line/40 p-[1.5px]">
      {grid.flat().map((n, i) => (
        <span
          key={i}
          className="grid size-[13px] place-items-center rounded-[2px] bg-surface font-mono text-[8px] leading-none text-muted"
        >
          {n}
        </span>
      ))}
    </div>
  )
}

export function WarnLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-md border border-gold/45 bg-gold/10 px-2.5 py-2 text-[11.5px] leading-snug text-gold-deep dark:text-gold">
      <Icon icon={IconWarning} size={13} className="mt-px" />
      <span>{children}</span>
    </p>
  )
}

export function DangerLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-[11.5px] leading-snug text-danger">
      <Icon icon={IconWarning} size={13} className="mt-px" />
      <span>{children}</span>
    </p>
  )
}

export const Readout = ({ children }: { children: ReactNode }) => (
  <p className="rounded-md border border-line bg-surface-2 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink tabular">
    {children}
  </p>
)
