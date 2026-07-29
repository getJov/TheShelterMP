import { motion } from 'framer-motion'
import {
  clientFullName,
  deceasedFullName,
  SLOT_LABEL,
  type BurialSlot,
  type Interment,
  type ISODate,
  type LocationId,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui-brand/Icon'
import { IconAdd, IconPhone } from '@/components/ui-brand/icons'
import { indexes } from '@/stores/dataset'
import { fmtDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  IntermentStatusChip,
  IntermentTypeBadge,
  JobStatusChip,
  SlotIcon,
} from './bits'
import { LotThumb } from './LotThumb'
import { RequirementsChecklist } from './RequirementsChecklist'
import { AssignSelect, JobChecklist } from './job-parts'
import { EASE, lotCodeFor, ownerOf, tierName } from './helpers'
import { useBurials } from '@/stores/burials'
import type { DayCell } from './MonthCalendar'

/**
 * The screen the grounds team would have open: both slots, everything on one
 * page, nothing behind a click.
 */
export function DayView({
  date,
  cell,
  locationId,
  canSchedule,
  canManageJobs,
  onOpenSlot,
  onOpenInterment,
}: {
  date: ISODate
  cell: DayCell | undefined
  locationId: LocationId
  canSchedule: boolean
  canManageJobs: boolean
  onOpenSlot: (date: ISODate, slot: BurialSlot) => void
  onOpenInterment: (i: Interment) => void
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(['morning', 'afternoon'] as BurialSlot[]).map((slot, n) => {
        const i = slot === 'morning' ? (cell?.morning ?? null) : (cell?.afternoon ?? null)
        return (
          <motion.div
            key={slot}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE, delay: n * 0.04 }}
          >
            {i ? (
              <SlotCard
                interment={i}
                locationId={locationId}
                canManageJobs={canManageJobs}
                canSchedule={canSchedule}
                onOpen={() => onOpenInterment(i)}
              />
            ) : (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line bg-surface p-6 text-center">
                <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  <SlotIcon slot={slot} />
                  {SLOT_LABEL[slot]} slot open
                </span>
                <p className="max-w-[30ch] text-[12.5px] text-muted">
                  Nothing booked for this half of the day.
                </p>
                {canSchedule && (
                  <Button variant="outline" size="sm" onClick={() => onOpenSlot(date, slot)}>
                    <Icon icon={IconAdd} size={15} />
                    Schedule {SLOT_LABEL[slot].toLowerCase()}
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

function SlotCard({
  interment: i,
  locationId,
  canManageJobs,
  canSchedule,
  onOpen,
}: {
  interment: Interment
  locationId: LocationId
  canManageJobs: boolean
  canSchedule: boolean
  onOpen: () => void
}) {
  const burials = useBurials()
  const lot = indexes().lotsById.get(i.lotId) ?? null
  const job = i.groundsJobId ? (indexes().jobsById.get(i.groundsJobId) ?? null) : null
  const owner = lot ? ownerOf(lot) : null

  return (
    <div className="h-full rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[12px] text-muted">
            <SlotIcon slot={i.slot} size={13} />
            {SLOT_LABEL[i.slot]}
          </p>
          <button
            type="button"
            onClick={onOpen}
            className="mt-0.5 truncate text-left font-display text-[21px] font-semibold leading-tight text-ink hover:text-gold-deep dark:hover:text-gold"
          >
            {deceasedFullName(i)}
          </button>
          <p className="mt-0.5 text-[12px] text-muted">
            {i.dateOfBirth ? `${fmtDate(i.dateOfBirth)} — ` : 'Died '}
            {fmtDate(i.dateOfDeath)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <IntermentStatusChip status={i.status} />
          <IntermentTypeBadge type={i.type} />
        </div>
      </div>

      <div className="space-y-4 px-4 py-3.5">
        <div className="flex gap-3">
          {lot && <LotThumb lot={lot} size={78} />}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-mono text-[13.5px] font-medium text-ink">
              {lot ? lotCodeFor(lot) : '—'}
            </p>
            <p className="text-[12px] text-muted">{lot ? tierName(lot) : '—'}</p>
            {owner && (
              <>
                <p className="truncate text-[12.5px] text-ink">{clientFullName(owner)}</p>
                <p className="flex items-center gap-1.5 text-[12px] text-muted">
                  <Icon icon={IconPhone} size={12} />
                  {owner.phone}
                </p>
              </>
            )}
          </div>
        </div>

        <div>
          <p className="eyebrow mb-1.5 text-muted">Requirements</p>
          <RequirementsChecklist
            type={i.type}
            requirements={i.requirements}
            editable={canSchedule && i.status !== 'cancelled'}
            idPrefix={`day-${i.id}`}
            onToggle={(k, v) => burials.updateRequirements(i.id, { [k]: v })}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="eyebrow text-muted">Grounds job</p>
            {job && <JobStatusChip status={job.status} />}
          </div>
          {job ? (
            <div className={cn('space-y-2.5 rounded-lg border border-line p-3')}>
              <AssignSelect job={job} locationId={locationId} disabled={!canManageJobs} />
              <JobChecklist job={job} editable={canManageJobs} columns={2} />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-[12px] text-muted">
              Raised once the request is approved.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
