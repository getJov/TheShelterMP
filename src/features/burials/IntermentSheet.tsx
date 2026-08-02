import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  blockingRequirements,
  deceasedFullName,
  SLOT_LABEL,
  type BurialSlot,
  type Interment,
  type IntermentId,
  type ISODate,
} from '@/domain'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconCheck,
  IconClose,
  IconGroundsJob,
  IconLot,
  IconMap,
  IconWarning,
} from '@/components/ui-brand/icons'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { StatusChip } from '@/components/ui-brand/StatusDot'
import { ASSUMPTIONS } from '@/domain'
import { cn } from '@/lib/utils'
import { fmtDate, fmtDateLong, fmtDateTime } from '@/lib/dates'
import { useCan, useCurrentUser } from '@/lib/permissions'
import { dataset, indexes, useDataset } from '@/stores/dataset'
import { availableSlots, useBurials } from '@/stores/burials'
import {
  CapacityMeter,
  IntermentStatusChip,
  IntermentTypeBadge,
  JobProgress,
  JobStatusChip,
  SlotIcon,
} from './bits'
import { LotThumb } from './LotThumb'
import { RequirementsChecklist } from './RequirementsChecklist'
import { DatePickerButton } from './ScheduleIntermentDialog'
import {
  EASE,
  isOutsideWindow,
  lotCodeFor,
  ownerName,
  tierName,
  windowEnd,
} from './helpers'

export function IntermentSheet({
  intermentId,
  onOpenChange,
  onOpenJobs,
}: {
  intermentId: IntermentId | null
  onOpenChange: (v: boolean) => void
  onOpenJobs?: () => void
}) {
  const version = useDataset((s) => s.version)
  const interment = useMemo(() => {
    void version
    return intermentId ? (indexes().intermentsById.get(intermentId) ?? null) : null
  }, [intermentId, version])

  return (
    <Sheet open={intermentId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
        {interment ? (
          <Body key={interment.id} interment={interment} onOpenJobs={onOpenJobs} />
        ) : (
          <SheetHeader>
            <SheetTitle>Interment</SheetTitle>
            <SheetDescription>Not found.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Body({
  interment: i,
  onOpenJobs,
}: {
  interment: Interment
  onOpenJobs?: () => void
}) {
  const user = useCurrentUser()
  const canSchedule = useCan('interment:schedule')
  const canComplete = useCan('interment:complete')
  const canApprove = user.role === 'manager' || user.role === 'admin'
  const navigate = useNavigate()

  const burials = useBurials()
  const [mode, setMode] = useState<'view' | 'reschedule' | 'cancel'>('view')
  const [newDate, setNewDate] = useState<ISODate>(i.scheduledDate)
  const [newSlot, setNewSlot] = useState<BurialSlot>(i.slot)
  const [reason, setReason] = useState('')

  const lot = indexes().lotsById.get(i.lotId) ?? null
  const block = lot ? indexes().blocksById.get(lot.blockId) : null
  const contract = i.contractId ? indexes().contractsById.get(i.contractId) : null
  const job = i.groundsJobId ? indexes().jobsById.get(i.groundsJobId) : null
  const blocked = blockingRequirements(i)
  const outside = isOutsideWindow(i.dateOfDeath, i.scheduledDate)

  const history = useMemo(
    () =>
      dataset()
        .audit.filter((e) => e.entityType === 'Interment' && e.entityId === i.id)
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    [i.id],
  )

  const freeForMove = availableSlots(newDate, i.locationId, i.id)

  return (
    <>
      <SheetHeader className="gap-1.5 border-b border-line px-5 pb-4 pt-5">
        <div className="flex items-center gap-2">
          <IntermentStatusChip status={i.status} />
          <IntermentTypeBadge type={i.type} />
        </div>
        <SheetTitle className="text-section-title font-display font-semibold leading-tight">
          {deceasedFullName(i)}
        </SheetTitle>
        <SheetDescription className="text-body">
          {i.dateOfBirth ? `${fmtDate(i.dateOfBirth)} — ` : 'Died '}
          {fmtDate(i.dateOfDeath)}
          {i.dateOfBirth ? '' : ''}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-5 py-5">
        {/* ── lot ─────────────────────────────────────────────── */}
        <Section title="Lot">
          {lot ? (
            <div className="flex gap-3 rounded-lg border border-line bg-surface p-3">
              <LotThumb lot={lot} size={84} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Icon icon={IconLot} size={15} className="text-muted" />
                  <span className="text-body font-mono font-medium text-ink">
                    {lotCodeFor(lot)}
                  </span>
                  <StatusChip status={lot.status} className="ml-auto" />
                </div>
                <dl className="space-y-1.5">
                  <Row label="Block" value={block?.name ?? block?.code ?? '—'} />
                  <Row label="Tier" value={tierName(lot)} />
                  <Row label="Owner" value={ownerName(lot)} />
                </dl>
                <CapacityMeter used={lot.intermentCount} capacity={lot.capacity} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 gap-1.5 text-gold-deep dark:text-gold"
                  onClick={() => navigate(`/map?lot=${lot.id}`)}
                >
                  <Icon icon={IconMap} size={14} />
                  Show on map
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-body text-muted">Lot not found.</p>
          )}
        </Section>

        {/* ── schedule ────────────────────────────────────────── */}
        <Section title="Schedule">
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-small-title font-display text-ink">
                  {fmtDateLong(i.scheduledDate)}
                </p>
                <p className="text-caption mt-0.5 flex items-center gap-1.5 text-muted">
                  <SlotIcon slot={i.slot} />
                  {SLOT_LABEL[i.slot]}
                </p>
              </div>
              {canSchedule && i.status !== 'completed' && i.status !== 'cancelled' && (
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMode(mode === 'reschedule' ? 'view' : 'reschedule')}
                  >
                    Reschedule
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:text-danger"
                    onClick={() => setMode(mode === 'cancel' ? 'view' : 'cancel')}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {outside && (
              <p className="text-caption mt-2 flex items-start gap-1.5 rounded border border-gold/45 bg-gold/8 px-2 py-2 text-gold-deep dark:text-gold" role="status">
                <Icon icon={IconWarning} size={14} className="mt-px" />
                Scheduled beyond the 15-day window, which closed{' '}
                {fmtDate(windowEnd(i.dateOfDeath))}.
              </p>
            )}

            {mode === 'reschedule' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.28, ease: EASE }}
                className="mt-3 space-y-2.5 overflow-hidden border-t border-line-soft pt-3"
              >
                <Label htmlFor={`reschedule-date-${i.id}`}>New date</Label>
                <DatePickerButton
                  id={`reschedule-date-${i.id}`}
                  value={newDate}
                  onChange={setNewDate}
                  ariaLabel="New interment date"
                />
                <RadioGroup
                  value={newSlot}
                  onValueChange={(v) => setNewSlot(v as BurialSlot)}
                  className="gap-1.5"
                  aria-label="New burial slot"
                >
                  {(['morning', 'afternoon'] as BurialSlot[]).map((s) => {
                    const taken = !freeForMove.includes(s)
                    return (
                      <label
                        key={s}
                        className={cn(
                          'text-control flex min-h-11 items-center gap-2.5 rounded-lg border px-2.5 py-2',
                          taken
                            ? 'cursor-not-allowed border-line bg-surface-2 text-muted'
                            : 'cursor-pointer border-line hover:border-gold/45',
                        )}
                      >
                        <RadioGroupItem value={s} disabled={taken} />
                        <SlotIcon slot={s} />
                        <span className="flex-1">{SLOT_LABEL[s]}</span>
                        {taken && <span className="text-caption">Booked</span>}
                      </label>
                    )
                  })}
                </RadioGroup>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    disabled={!freeForMove.includes(newSlot)}
                    onClick={() => {
                      try {
                        burials.rescheduleInterment(i.id, newDate, newSlot, user.id)
                        toast.success('Interment moved', {
                          description: `${fmtDate(newDate)}, ${SLOT_LABEL[newSlot].toLowerCase()}.`,
                        })
                        setMode('view')
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : 'Could not reschedule',
                        )
                      }
                    }}
                  >
                    Move interment
                  </Button>
                </div>
              </motion.div>
            )}

            {mode === 'cancel' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.28, ease: EASE }}
                className="mt-3 space-y-2.5 overflow-hidden border-t border-line-soft pt-3"
              >
                <p className="text-body text-muted" id={`cancel-help-${i.id}`}>
                  Cancelling frees the slot and decrements the lot's count. If this
                  is the only interment, the lot reverts to sold.
                </p>
                <Label htmlFor={`cancel-reason-${i.id}`}>Reason for cancellation</Label>
                <Textarea
                  id={`cancel-reason-${i.id}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for cancellation (required)"
                  className="min-h-20"
                  required
                  aria-describedby={`cancel-help-${i.id}`}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
                    Keep it
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={reason.trim().length === 0}
                    onClick={() => {
                      try {
                        burials.cancelInterment(i.id, reason.trim(), user.id)
                        toast.success('Interment cancelled')
                        setMode('view')
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Could not cancel')
                      }
                    }}
                  >
                    <Icon icon={IconClose} size={15} />
                    Cancel interment
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </Section>

        {/* ── approval ────────────────────────────────────────── */}
        {i.status === 'requested' && canApprove && (
          <Section title="Approval">
            <div className="rounded-lg border border-gold/50 bg-gold/8 p-3">
              <p className="text-body text-gold-deep dark:text-gold">
                Requested by {indexes().usersById.get(i.requestedByUserId)?.fullName ?? '—'}.
                Approving confirms the slot and raises the grounds job.
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    burials.approveInterment(i.id, user.id)
                    toast.success('Interment approved')
                  }}
                >
                  <Icon icon={IconCheck} size={15} />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    burials.rejectInterment(i.id, user.id, 'Rejected from the interment record')
                    toast.success('Request rejected — the slot is free again')
                  }}
                >
                  Reject
                </Button>
              </div>
            </div>
          </Section>
        )}

        {/* ── requirements ────────────────────────────────────── */}
        <Section title="Requirements">
          <RequirementsChecklist
            type={i.type}
            requirements={i.requirements}
            editable={canSchedule && i.status !== 'cancelled'}
            idPrefix={`req-${i.id}`}
            onToggle={(k, v) => burials.updateRequirements(i.id, { [k]: v })}
          />
        </Section>

        {/* ── fees ────────────────────────────────────────────── */}
        <Section title="Fees">
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-center justify-between">
              <span className="text-body text-muted">Opening &amp; closing fee</span>
              <MoneyText
                centavos={i.openingClosingFeeCentavos}
                className="text-body font-medium"
              />
            </div>
            <p className="text-caption mt-1 flex flex-wrap items-center gap-1.5 text-muted">
              {contract
                ? `Service line on ${contract.contractNo}.`
                : 'No contract on file for this lot.'}
              <AssumedChip why={ASSUMPTIONS.serviceFees.why} />
            </p>
          </div>
        </Section>

        {/* ── grounds job ─────────────────────────────────────── */}
        <Section title="Grounds job">
          {job ? (
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body flex items-center gap-2 text-ink">
                  <Icon icon={IconGroundsJob} size={15} className="text-muted" />
                  {job.assignedToUserId
                    ? (indexes().usersById.get(job.assignedToUserId)?.fullName ?? '—')
                    : 'Unassigned'}
                </span>
                <JobStatusChip status={job.status} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <JobProgress job={job} />
                {onOpenJobs && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gold-deep dark:text-gold"
                    onClick={onOpenJobs}
                  >
                    Open jobs board
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-body rounded-lg border border-dashed border-line px-3 py-3 text-muted">
              {i.status === 'requested'
                ? 'The grounds job is raised when the request is approved.'
                : 'No grounds job on this interment.'}
            </p>
          )}
        </Section>

        {i.notes && (
          <Section title="Notes">
            <p className="text-body rounded-lg border border-line bg-surface-2 px-3 py-2.5 leading-relaxed text-muted">
              {i.notes}
            </p>
          </Section>
        )}

        {/* ── history ─────────────────────────────────────────── */}
        <Section title="History">
          {history.length === 0 ? (
            <p className="text-body text-muted">No recorded events yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((e) => (
                <li key={e.id} className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
                  <span className="min-w-0">
                    <span className="text-caption block break-words font-mono text-ink">
                      {e.action}
                    </span>
                    <span className="text-caption block text-muted">
                      {indexes().usersById.get(e.actorUserId)?.fullName ?? '—'} ·{' '}
                      {fmtDateTime(e.at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* ── footer ────────────────────────────────────────────── */}
      <div className="sticky bottom-0 border-t border-line bg-surface px-5 py-3.5">
        {i.status === 'completed' ? (
          <p className="text-body text-center text-green" role="status">
            Interment completed {fmtDate(i.scheduledDate)}.
          </p>
        ) : i.status === 'cancelled' ? (
          <p className="text-body text-center text-danger" role="status">This interment was cancelled.</p>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block">
                <Button
                  className="w-full gap-2"
                  disabled={!canComplete || blocked.length > 0 || i.status !== 'scheduled'}
                  onClick={() => {
                    try {
                      burials.completeInterment(i.id, user.id)
                      toast.success('Interment marked completed')
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Could not complete')
                    }
                  }}
                >
                  <Icon icon={IconCheck} size={16} />
                  Mark completed
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px]">
              {!canComplete
                ? 'Your role cannot complete an interment.'
                : i.status === 'requested'
                  ? 'The request must be approved first.'
                  : blocked.length > 0
                    ? `Blocked — outstanding: ${blocked.join(', ')}.`
                    : 'All blocking requirements are on file.'}
            </TooltipContent>
          </Tooltip>
        )}
        {blocked.length > 0 && i.status === 'scheduled' && (
          <p className="text-caption mt-2 text-center text-danger" role="alert">
            Outstanding: {blocked.join(', ')}
          </p>
        )}
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-caption mb-2 font-semibold uppercase text-gold-deep dark:text-gold">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-caption grid grid-cols-[auto_1fr] items-baseline gap-2">
      <dt className="min-w-14 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{value}</dd>
    </div>
  )
}
