import { motion } from 'framer-motion'
import {
  INTERMENT_STATUS_LABEL,
  INTERMENT_TYPE_LABEL,
  SLOT_LABEL,
  type BurialSlot,
  type GroundsJob,
  type Interment,
  type IntermentStatus,
  type IntermentType,
  type JobStatus,
} from '@/domain'
import { Icon } from '@/components/ui-brand/Icon'
import { IconAfternoon, IconMorning } from '@/components/ui-brand/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { checklistProgress, requirementsProgress } from '@/stores/burials'
import { EASE, INTERMENT_STATUS_STYLE } from './helpers'

// ── slots ────────────────────────────────────────────────────────────

export function SlotIcon({ slot, size = 14 }: { slot: BurialSlot; size?: number }) {
  return <Icon icon={slot === 'morning' ? IconMorning : IconAfternoon} size={size} />
}

/**
 * Two dots per day — filled when booked, hollow when open. This is the whole
 * capacity model, readable at a glance across a month.
 */
export function SlotDots({
  morning,
  afternoon,
  size = 7,
  className,
}: {
  morning: boolean
  afternoon: boolean
  size?: number
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-hidden>
      {[morning, afternoon].map((booked, n) => (
        <span
          key={n}
          className={cn(
            'inline-block rounded-full border',
            booked
              ? 'border-gold-deep bg-gold-deep dark:border-gold dark:bg-gold'
              : 'border-line bg-transparent',
          )}
          style={{ width: size, height: size }}
        />
      ))}
    </span>
  )
}

export function SlotLabel({ slot }: { slot: BurialSlot }) {
  return (
    <span className="text-caption inline-flex items-center gap-1.5 text-muted">
      <SlotIcon slot={slot} />
      {SLOT_LABEL[slot]}
    </span>
  )
}

// ── badges ───────────────────────────────────────────────────────────

export function IntermentStatusChip({
  status,
  className,
}: {
  status: IntermentStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        'text-micro inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-medium',
        INTERMENT_STATUS_STYLE[status].chip,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', INTERMENT_STATUS_STYLE[status].dot)}
      />
      {INTERMENT_STATUS_LABEL[status]}
    </span>
  )
}

export function IntermentTypeBadge({
  type,
  className,
}: {
  type: IntermentType
  className?: string
}) {
  return (
    <span
      className={cn(
        'text-micro inline-flex items-center rounded border border-line bg-surface-2 px-1.5 py-1 font-medium text-muted',
        type === 'bone_transfer' && 'border-gold/50 text-gold-deep dark:text-gold',
        className,
      )}
    >
      {INTERMENT_TYPE_LABEL[type]}
    </span>
  )
}

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  ready: 'Ready',
  completed: 'Completed',
}

const JOB_STATUS_STYLE: Record<JobStatus, string> = {
  pending: 'border-line bg-surface-2 text-muted',
  in_progress: 'border-info/45 bg-info/12 text-info',
  ready: 'border-green/45 bg-green/12 text-green',
  completed: 'border-green/45 bg-green/12 text-green',
}

export function JobStatusChip({ status }: { status: JobStatus }) {
  return (
    <span
      className={cn(
        'text-micro inline-flex items-center rounded-full border px-2 py-1 font-medium',
        JOB_STATUS_STYLE[status],
      )}
    >
      {JOB_STATUS_LABEL[status]}
    </span>
  )
}

// ── meters ───────────────────────────────────────────────────────────

/**
 * A segmented meter rather than a bar: at five or seven items you can read
 * "two outstanding" without doing arithmetic on a percentage.
 */
export function SegmentMeter({
  done,
  total,
  tone = 'gold',
  className,
  width = 7,
}: {
  done: number
  total: number
  tone?: 'gold' | 'green'
  className?: string
  width?: number
}) {
  return (
    <span className={cn('inline-flex items-center gap-[2px]', className)} aria-hidden>
      {Array.from({ length: total }, (_, n) => (
        <motion.span
          key={n}
          initial={false}
          animate={{ opacity: n < done ? 1 : 0.28 }}
          transition={{ duration: 0.32, ease: EASE }}
          className={cn(
            'block h-[5px] rounded-full',
            n < done
              ? tone === 'green'
                ? 'bg-green'
                : 'bg-gold-deep dark:bg-gold'
              : 'bg-line',
          )}
          style={{ width }}
        />
      ))}
    </span>
  )
}

export function RequirementsMeter({
  interment,
  showCount = true,
}: {
  interment: Interment
  showCount?: boolean
}) {
  const { done, total } = requirementsProgress(interment)
  const complete = done === total
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center gap-2">
          <SegmentMeter done={done} total={total} tone={complete ? 'green' : 'gold'} />
          {showCount && (
            <span className="text-caption tabular text-muted">
              {done}/{total}
            </span>
          )}
          <span className="sr-only">
            {done} of {total} requirements complete
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {complete
          ? 'All requirements on file'
          : `${total - done} requirement${total - done === 1 ? '' : 's'} outstanding`}
      </TooltipContent>
    </Tooltip>
  )
}

export function JobProgress({ job }: { job: GroundsJob }) {
  const { done, total } = checklistProgress(job)
  return (
    <span className="inline-flex items-center gap-2">
      <SegmentMeter done={done} total={total} tone={done === total ? 'green' : 'gold'} width={6} />
      <span className="text-caption tabular text-muted">
        {done}/{total}
      </span>
    </span>
  )
}

/** "1 of 2 interments used". */
export function CapacityMeter({
  used,
  capacity,
  className,
}: {
  used: number
  capacity: number
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <SegmentMeter
        done={used}
        total={capacity}
        tone={used >= capacity ? 'green' : 'gold'}
        width={capacity > 4 ? 5 : 9}
      />
      <span className="text-caption text-muted">
        <span className="tabular">
          {used} of {capacity}
        </span>{' '}
        interment{capacity === 1 ? '' : 's'} used
      </span>
    </span>
  )
}
