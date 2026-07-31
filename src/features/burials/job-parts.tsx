import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { GroundsJob, LocationId } from '@/domain'
import { asId } from '@/domain'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icon } from '@/components/ui-brand/Icon'
import { IconAssign, IconPhoto } from '@/components/ui-brand/icons'
import { cn } from '@/lib/utils'
import { dataset, useDataset } from '@/stores/dataset'
import { useBurials } from '@/stores/burials'
import { crewAt, EASE } from './helpers'

const UNASSIGNED = '__unassigned__'

/** The seven items the crew actually works through, tickable inline. */
export function JobChecklist({
  job,
  editable,
  columns = 1,
  className,
}: {
  job: GroundsJob
  editable: boolean
  columns?: 1 | 2
  className?: string
}) {
  const update = useBurials((s) => s.updateChecklist)
  return (
    <ul
      className={cn(
        'gap-x-4 gap-y-1',
        columns === 2 ? 'grid grid-cols-1 sm:grid-cols-2' : 'flex flex-col',
        className,
      )}
    >
      {job.checklist.map((item, n) => {
        const id = `${job.id}-${item.key}`
        return (
          <motion.li
            key={item.key}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.28, ease: EASE, delay: Math.min(n, 12) * 0.02 }}
            className="flex items-center gap-2.5 py-0.5"
          >
            <Checkbox
              id={id}
              checked={item.done}
              disabled={!editable}
              onCheckedChange={(v) => update(job.id, item.key, v === true)}
            />
            <Label
              htmlFor={id}
              className={cn(
                'text-[12.5px] font-normal',
                item.done ? 'text-muted line-through' : 'text-ink',
                !editable && 'cursor-default',
              )}
            >
              {item.label}
            </Label>
          </motion.li>
        )
      })}
    </ul>
  )
}

export function AssignSelect({
  job,
  locationId,
  disabled,
}: {
  job: GroundsJob
  locationId: LocationId
  disabled?: boolean
}) {
  const version = useDataset((s) => s.version)
  const assign = useBurials((s) => s.assignJob)
  const crew = useMemo(() => {
    void version
    return crewAt(locationId, dataset().users)
  }, [locationId, version])

  return (
    <Select
      disabled={disabled}
      value={job.assignedToUserId ?? UNASSIGNED}
      onValueChange={(v) => {
        const id = v === UNASSIGNED ? null : asId<'User'>(v)
        assign(job.id, id)
        if (id)
          toast.success('Job assigned', {
            description: `${crew.find((c) => c.id === id)?.fullName ?? 'Crew'} has been notified.`,
          })
      }}
    >
      <SelectTrigger size="sm" className="w-[190px] text-[12.5px]">
        <Icon icon={IconAssign} size={14} className="text-muted" />
        <SelectValue placeholder="Assign crew" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {crew.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.fullName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * The client mentioned field photos. Showing where they would live is honest
 * and costs nothing; pretending we capture them would not be.
 */
export function PhotoSlots({ compact }: { compact?: boolean }) {
  return (
    <div>
      <p className="eyebrow mb-1.5 flex items-center gap-1.5 text-muted">
        <Icon icon={IconPhoto} size={13} />
        Photos
      </p>
      <div className="flex gap-2">
        {['Before', 'After'].map((label) => (
          <div
            key={label}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-surface-2 text-muted',
              compact ? 'h-16' : 'h-24',
            )}
          >
            <Icon icon={IconPhoto} size={compact ? 15 : 18} />
            <span className="text-[11px] font-medium">{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">Photo capture unavailable.</p>
    </div>
  )
}
