import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  deceasedFullName,
  SLOT_LABEL,
  type GroundsJob,
  type Interment,
  type ISODate,
  type LocationId,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconCheck,
  IconFlag,
  IconGrounds,
  IconPrint,
} from '@/components/ui-brand/icons'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { StatCard } from '@/components/ui-brand/StatCard'
import { addDays, diffDays, fmtDate, fmtDateLong } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { indexes, useDataset } from '@/stores/dataset'
import {
  checklistProgress,
  isJobLateUnassigned,
  jobsInRange,
  useBurials,
} from '@/stores/burials'
import { TODAY } from '@/mock'
import { IntermentTypeBadge, JobProgress, JobStatusChip, SlotIcon } from './bits'
import { AssignSelect, JobChecklist, PhotoSlots } from './job-parts'
import { DaySheet } from './DaySheet'
import { EASE, lotCode } from './helpers'

const HORIZON_DAYS = 14

export function GroundsJobsTab({
  locationId,
  canManageJobs,
  onOpenInterment,
}: {
  locationId: LocationId
  canManageJobs: boolean
  onOpenInterment: (i: Interment) => void
}) {
  const version = useDataset((s) => s.version)
  const [sheetDates, setSheetDates] = useState<ISODate[] | null>(null)

  const jobs = useMemo(() => {
    void version
    return jobsInRange(TODAY, addDays(TODAY, HORIZON_DAYS), locationId)
  }, [locationId, version])

  const groups = useMemo(() => {
    const m = new Map<ISODate, GroundsJob[]>()
    for (const j of jobs) {
      const arr = m.get(j.scheduledFor)
      if (arr) arr.push(j)
      else m.set(j.scheduledFor, [j])
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  }, [jobs])

  const flagged = jobs.filter((j) => isJobLateUnassigned(j))
  const unfinished = jobs.filter((j) => j.status !== 'completed')

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Jobs in the next 14 days"
          value={jobs.length}
          hint={`From ${fmtDate(TODAY)} to ${fmtDate(addDays(TODAY, HORIZON_DAYS))}.`}
        />
        <StatCard
          label="Still to prepare"
          value={unfinished.length}
          hint="Anything not yet marked completed."
        />
        <StatCard
          label="Unassigned within 3 days"
          value={flagged.length}
          delta={flagged.length > 0 ? 'Needs a name' : 'All covered'}
          deltaTone={flagged.length > 0 ? 'warning' : 'positive'}
          hint="The crew hearing late is the failure this flag exists to catch."
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {groups.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => setSheetDates(groups.map(([d]) => d))}
          >
            <Icon icon={IconPrint} size={15} />
            Day sheets · all {groups.length} days
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface">
          <EmptyState
            icon={IconGrounds}
            title="Nothing to prepare in the next 14 days"
            body="Grounds jobs appear here the moment an interment is scheduled or a request is approved."
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([date, dayJobs], gi) => (
            <motion.section
              key={date}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: EASE, delay: Math.min(gi, 12) * 0.04 }}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2.5">
                <h3 className="text-small-title font-display font-semibold text-ink">
                  {fmtDateLong(date)}
                </h3>
                <span
                  className={cn(
                    'text-micro rounded-full border px-2 py-1 font-medium',
                    date === TODAY
                      ? 'border-gold bg-gold/12 text-gold-deep dark:text-gold'
                      : 'border-line bg-surface-2 text-muted',
                  )}
                >
                  {date === TODAY
                    ? 'Today'
                    : `in ${diffDays(date, TODAY)} day${diffDays(date, TODAY) === 1 ? '' : 's'}`}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted"
                  onClick={() => setSheetDates([date])}
                >
                  <Icon icon={IconPrint} size={14} />
                  Day sheet
                </Button>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {(['morning', 'afternoon'] as const).map((slot) => {
                  const job = dayJobs.find((j) => j.slot === slot) ?? null
                  if (!job)
                    return (
                      <div
                        key={slot}
                        className="text-body flex items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line bg-surface px-4 py-5 text-muted"
                      >
                        <SlotIcon slot={slot} size={14} />
                        {SLOT_LABEL[slot]} — nothing booked.
                      </div>
                    )
                  return (
                    <JobCard
                      key={job.id}
                      job={job}
                      locationId={locationId}
                      canManageJobs={canManageJobs}
                      onOpenInterment={onOpenInterment}
                    />
                  )
                })}
              </div>
            </motion.section>
          ))}
        </div>
      )}

      {sheetDates && (
        <DaySheet
          dates={sheetDates}
          locationId={locationId}
          onClose={() => setSheetDates(null)}
        />
      )}
    </div>
  )
}

function JobCard({
  job,
  locationId,
  canManageJobs,
  onOpenInterment,
}: {
  job: GroundsJob
  locationId: LocationId
  canManageJobs: boolean
  onOpenInterment: (i: Interment) => void
}) {
  const complete = useBurials((s) => s.completeJob)
  const interment = indexes().intermentsById.get(job.intermentId) ?? null
  const late = isJobLateUnassigned(job)
  const { done, total } = checklistProgress(job)

  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border bg-surface',
        late ? 'border-gold ring-1 ring-gold/40' : 'border-line',
      )}
    >
      {late && (
        <p className="text-caption flex items-center gap-1.5 rounded-t-[var(--radius-card)] border-b border-gold/40 bg-gold/12 px-3.5 py-2 font-medium text-gold-deep dark:text-gold" role="status">
          <Icon icon={IconFlag} size={13} />
          Unassigned and {diffDays(job.scheduledFor, TODAY) === 0
            ? 'happening today'
            : `only ${diffDays(job.scheduledFor, TODAY)} day${diffDays(job.scheduledFor, TODAY) === 1 ? '' : 's'} away`}
        </p>
      )}

      <div className="flex items-start justify-between gap-3 px-3.5 pb-2.5 pt-3">
        <div className="min-w-0">
          <p className="text-caption flex items-center gap-1.5 text-muted">
            <SlotIcon slot={job.slot} size={13} />
            {SLOT_LABEL[job.slot]} · {fmtDate(job.scheduledFor)}
          </p>
          {interment && (
            <button
              type="button"
              onClick={() => onOpenInterment(interment)}
              className="text-small-title mt-0.5 min-h-10 text-left font-display font-semibold leading-tight text-ink hover:text-gold-deep dark:hover:text-gold"
            >
              {deceasedFullName(interment)}
            </button>
          )}
          <p className="text-caption mt-0.5 font-mono text-muted">{lotCode(job.lotId)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <JobStatusChip status={job.status} />
          {interment && <IntermentTypeBadge type={interment.type} />}
        </div>
      </div>

      <div className="space-y-3 border-t border-line-soft px-3.5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AssignSelect job={job} locationId={locationId} disabled={!canManageJobs} />
          <JobProgress job={job} />
        </div>

        <JobChecklist job={job} editable={canManageJobs} columns={2} />

        <PhotoSlots compact />

        {canManageJobs && job.status !== 'completed' && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            disabled={done < total}
            onClick={() => complete(job.id)}
          >
            <Icon icon={IconCheck} size={15} />
            {done < total
              ? `${total - done} checklist item${total - done === 1 ? '' : 's'} left`
              : 'Mark job completed'}
          </Button>
        )}
      </div>
    </div>
  )
}
