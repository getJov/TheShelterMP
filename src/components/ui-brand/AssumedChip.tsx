import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Marks a business value we assumed rather than had confirmed by the client.
 * Every entry in domain/constants ASSUMPTIONS must surface one of these.
 */
export function AssumedChip({
  why,
  className,
  label = 'Assumed',
}: {
  why: string
  className?: string
  label?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex cursor-help items-center rounded border px-1.5 py-px align-middle',
            'border-gold/45 bg-gold/12 text-gold-deep dark:text-gold',
            'text-micro font-semibold uppercase tracking-[0.06em]',
            className,
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[300px] text-caption leading-relaxed">
        <span className="font-semibold">Not confirmed by the client. </span>
        {why}
      </TooltipContent>
    </Tooltip>
  )
}
