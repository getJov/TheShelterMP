import { cn } from '@/lib/utils'

/**
 * The Shelter mark — five upright bars of stepped height with an angled
 * cut across the tops, on a narrow base rule. Redrawn as SVG from the
 * printed letterhead (brand/logo-shelter.png).
 *
 * Uses currentColor so it inherits the theme.
 */
export function LogoMark({
  size = 28,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <g fill="currentColor">
        {/* bars, ascending to a peak then stepping down — tops cut on a slant */}
        <path d="M4 40V22.5L10 17.5V40H4Z" opacity="0.72" />
        <path d="M11.5 40V15L17.5 9V40h-6Z" opacity="0.84" />
        <path d="M19 40V7.5L25 2v38h-6Z" />
        <path d="M26.5 40V12l6 5.5V40h-6Z" opacity="0.84" />
        <path d="M34 40V20l6 5.5V40h-6Z" opacity="0.72" />
      </g>
      <rect x="2" y="42" width="40" height="2.4" rx="0.6" fill="currentColor" />
    </svg>
  )
}

export function LogoLockup({
  variant = 'full',
  className,
}: {
  variant?: 'full' | 'compact' | 'mark'
  className?: string
}) {
  if (variant === 'mark') return <LogoMark className={className} />

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={variant === 'compact' ? 24 : 30} className="text-gold-deep dark:text-gold" />
      <div className="leading-none">
        <div
          className="font-display font-semibold text-ink"
          style={{
            fontSize: variant === 'compact' ? 15 : 18,
            letterSpacing: '0.12em',
          }}
        >
          THE SHELTER
        </div>
        {variant === 'full' && (
          <div
            className="text-muted mt-1"
            style={{ fontSize: 8.5, letterSpacing: '0.26em' }}
          >
            MEMORIAL PARK
          </div>
        )}
      </div>
    </div>
  )
}
