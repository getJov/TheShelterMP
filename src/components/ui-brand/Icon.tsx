import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { cn } from '@/lib/utils'

export interface IconProps {
  icon: IconSvgElement
  /** px. Default 18 — the app-wide default. */
  size?: number
  /** Default 1.6 so weights stay consistent everywhere. */
  strokeWidth?: number
  className?: string
  'aria-label'?: string
}

/**
 * The only icon entry point in the application.
 * Import the glyph from `@/components/ui-brand/icons` and render it here.
 */
export function Icon({
  icon,
  size = 18,
  strokeWidth = 1.6,
  className,
  ...rest
}: IconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      className={cn('shrink-0', className)}
      aria-hidden={rest['aria-label'] ? undefined : true}
      {...rest}
    />
  )
}
