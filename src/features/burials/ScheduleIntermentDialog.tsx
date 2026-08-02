import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ASSUMPTIONS,
  AT_NEED_WINDOW_DAYS,
  INTERMENT_TYPE_LABEL,
  MAX_BURIALS_PER_DAY,
  SLOT_LABEL,
  type BurialSlot,
  type IntermentId,
  type IntermentRequirements,
  type IntermentType,
  type ISODate,
  type LocationId,
  type Lot,
  type LotId,
} from '@/domain'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconCalendar,
  IconCheck,
  IconLot,
  IconWarning,
} from '@/components/ui-brand/icons'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { cn } from '@/lib/utils'
import { fmtDate, fmtDateLong, toDate, toISODate } from '@/lib/dates'
import { useCurrentUser } from '@/lib/permissions'
import { dataset, useDataset } from '@/stores/dataset'
import {
  availableSlots,
  isDayFull,
  nextAvailableSlot,
  useBurials,
} from '@/stores/burials'
import { TODAY } from '@/mock'
import { CapacityMeter, SlotIcon } from './bits'
import { RequirementsChecklist } from './RequirementsChecklist'
import {
  EASE,
  INTERMENT_TYPE_HINT,
  isOutsideWindow,
  lotCodeFor,
  ownerName,
  tierName,
  windowEnd,
} from './helpers'

const STEPS = ['Lot', 'Deceased', 'Schedule'] as const

const EMPTY_REQUIREMENTS: IntermentRequirements = {
  deathCertificate: false,
  burialPermit: false,
  transferPermit: false,
  ownerConsent: false,
  feesSettled: false,
}

export function ScheduleIntermentDialog({
  open,
  onOpenChange,
  locationId,
  presetLotId = null,
  presetDate = null,
  presetSlot = null,
  onScheduled,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  locationId: LocationId
  presetLotId?: LotId | null
  presetDate?: ISODate | null
  presetSlot?: BurialSlot | null
  onScheduled?: (id: IntermentId) => void
}) {
  const user = useCurrentUser()
  const version = useDataset((s) => s.version)
  const schedule = useBurials((s) => s.scheduleInterment)

  const [step, setStep] = useState(0)
  const [lotId, setLotId] = useState<LotId | null>(presetLotId)
  const [first, setFirst] = useState('')
  const [middle, setMiddle] = useState('')
  const [last, setLast] = useState('')
  const [dob, setDob] = useState<ISODate | null>(null)
  const [dod, setDod] = useState<ISODate | null>(null)
  const [type, setType] = useState<IntermentType>('permanent')
  const [date, setDate] = useState<ISODate | null>(presetDate)
  const [slot, setSlot] = useState<BurialSlot | null>(presetSlot)
  const [requirements, setRequirements] = useState<IntermentRequirements>(EMPTY_REQUIREMENTS)
  const [override, setOverride] = useState('')
  const [notes, setNotes] = useState('')
  const [validationMessage, setValidationMessage] = useState('')

  // Reset every time the dialog is opened, so a preset never leaks between uses.
  useEffect(() => {
    if (!open) return
    setStep(presetLotId ? 1 : 0)
    setLotId(presetLotId)
    setFirst('')
    setMiddle('')
    setLast('')
    setDob(null)
    setDod(null)
    setType('permanent')
    setDate(presetDate)
    setSlot(presetSlot)
    setRequirements(EMPTY_REQUIREMENTS)
    setOverride('')
    setNotes('')
    setValidationMessage('')
  }, [open, presetLotId, presetDate, presetSlot])

  const openClose = useMemo(
    () => dataset().services.find((s) => s.code === 'OPEN_CLOSE') ?? null,
    [],
  )

  /** Lots at capacity are excluded here rather than shown and rejected. */
  const eligibleLots = useMemo(() => {
    void version
    return dataset()
      .lots.filter(
        (l) =>
          l.locationId === locationId &&
          l.currentContractId !== null &&
          l.intermentCount < l.capacity,
      )
      .sort((a, b) => (lotCodeFor(a) < lotCodeFor(b) ? -1 : 1))
  }, [locationId, version])

  const lot = useMemo(
    () => (lotId ? (eligibleLots.find((l) => l.id === lotId) ?? null) : null),
    [lotId, eligibleLots],
  )

  const free = useMemo(() => {
    void version
    return date ? availableSlots(date, locationId) : []
  }, [date, locationId, version])

  const next = useMemo(() => {
    void version
    return nextAvailableSlot(TODAY, locationId)
  }, [locationId, version])

  const outside = dod && date ? isOutsideWindow(dod, date) : false

  const stepValid = [
    lot !== null,
    first.trim().length > 0 && last.trim().length > 0 && dod !== null,
    date !== null && slot !== null && free.includes(slot) && (!outside || override.trim().length > 0),
  ]

  const invalidMessage = [
    'Choose a lot with available capacity.',
    'Enter the required first name, last name, and date of death.',
    outside && override.trim().length === 0
      ? 'Enter a reason for scheduling outside the interment window.'
      : 'Choose an available date and burial slot.',
  ]

  const goToNextStep = () => {
    if (!stepValid[step]) {
      setValidationMessage(invalidMessage[step] ?? 'Complete the required information.')
      return
    }
    setValidationMessage('')
    setStep(step + 1)
  }

  const submit = () => {
    if (!stepValid[2] || !lot || !dod || !date || !slot || !openClose) {
      setValidationMessage(invalidMessage[2] ?? 'Complete the required schedule information.')
      return
    }
    try {
      const id = schedule({
        lotId: lot.id,
        deceasedFirstName: first,
        deceasedMiddleName: middle || null,
        deceasedLastName: last,
        dateOfBirth: dob,
        dateOfDeath: dod,
        type,
        scheduledDate: date,
        slot,
        requirements,
        openingClosingFeeCentavos: openClose.defaultAmountCentavos,
        notes: notes.trim() || null,
        windowOverrideReason: outside ? override.trim() : null,
        actor: { id: user.id, role: user.role },
      })
      toast.success(
        user.role === 'agent' ? 'Interment requested' : 'Interment scheduled',
        {
          description: `${first} ${last} · ${lotCodeFor(lot)} · ${fmtDate(date)}, ${SLOT_LABEL[slot].toLowerCase()}.`,
        },
      )
      onOpenChange(false)
      onScheduled?.(id)
    } catch (e) {
      setValidationMessage(e instanceof Error ? e.message : 'Could not schedule the interment.')
      toast.error('Could not schedule', {
        description: e instanceof Error ? e.message : 'Unknown error',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]">
        <DialogHeader className="shrink-0 border-b border-line px-5 pb-4 pt-5">
          <DialogTitle className="text-section-title font-display font-semibold">
            Schedule a burial
          </DialogTitle>
          <DialogDescription className="text-body">
            {user.role === 'agent'
              ? 'Your request goes to the manager for approval before the slot is confirmed.'
              : `A day holds ${MAX_BURIALS_PER_DAY} services — one morning, one afternoon.`}
          </DialogDescription>
          <Stepper
            step={step}
            onStep={(nextStep) => {
              setValidationMessage('')
              setStep(nextStep)
            }}
            valid={stepValid}
          />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p
            id="schedule-interment-error"
            className={cn(
              'text-body mb-4 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-danger',
              !validationMessage && 'sr-only',
            )}
            role="alert"
          >
            {validationMessage}
          </p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.24, ease: EASE }}
            >
              {step === 0 && (
                <LotStep lots={eligibleLots} selected={lot} onSelect={setLotId} />
              )}

              {step === 1 && (
                <DeceasedStep
                  first={first}
                  middle={middle}
                  last={last}
                  dob={dob}
                  dod={dod}
                  type={type}
                  onFirst={setFirst}
                  onMiddle={setMiddle}
                  onLast={setLast}
                  onDob={setDob}
                  onDod={setDod}
                  onType={(t) => {
                    setType(t)
                    // Selecting bone_transfer adds the transfer-permit requirement.
                    setRequirements((r) => ({ ...r, transferPermit: t !== 'bone_transfer' ? true : false }))
                  }}
                  showErrors={Boolean(validationMessage)}
                />
              )}

              {step === 2 && (
                <ScheduleStep
                  locationId={locationId}
                  date={date}
                  slot={slot}
                  dod={dod}
                  free={free}
                  next={next}
                  outside={outside}
                  override={override}
                  notes={notes}
                  type={type}
                  requirements={requirements}
                  feeCentavos={openClose?.defaultAmountCentavos ?? 0}
                  onDate={(d) => {
                    setDate(d)
                    setSlot(null)
                  }}
                  onSlot={setSlot}
                  onOverride={setOverride}
                  onNotes={setNotes}
                  onToggleRequirement={(k, v) =>
                    setRequirements((r) => ({ ...r, [k]: v }))
                  }
                  showErrors={Boolean(validationMessage)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <DialogFooter className="shrink-0 items-center gap-2 border-t border-line bg-surface-2 px-5 py-3.5 sm:justify-between">
          <span className="text-caption text-muted">
            Step {step + 1} of 3 · {STEPS[step]}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setValidationMessage('')
                if (step === 0) onOpenChange(false)
                else setStep(step - 1)
              }}
            >
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < 2 ? (
              <Button onClick={goToNextStep} aria-describedby="schedule-interment-error">
                Next
              </Button>
            ) : (
              <Button
                onClick={submit}
                className="gap-2"
                aria-describedby="schedule-interment-error"
              >
                <Icon icon={IconCheck} size={16} />
                {user.role === 'agent' ? 'Request interment' : 'Schedule interment'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stepper({
  step,
  onStep,
  valid,
}: {
  step: number
  onStep: (n: number) => void
  valid: boolean[]
}) {
  return (
    <ol className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
      {STEPS.map((label, n) => {
        const reachable = n === 0 || valid.slice(0, n).every(Boolean)
        return (
          <li key={label}>
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onStep(n)}
              aria-current={n === step ? 'step' : undefined}
              className={cn(
                'text-control flex min-h-10 w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                n === step
                  ? 'border-gold bg-gold/12 font-medium text-gold-deep dark:text-gold'
                  : 'border-line text-muted hover:border-gold/50',
                !reachable && 'cursor-not-allowed opacity-50',
              )}
            >
              <span
                className={cn(
                  'text-micro grid size-6 shrink-0 place-items-center rounded-full font-mono',
                  n === step
                    ? 'bg-gold-deep text-white dark:bg-gold dark:text-black'
                    : valid[n]
                      ? 'bg-green/20 text-green'
                      : 'bg-surface-2 text-muted',
                )}
              >
                {valid[n] && n !== step ? '✓' : n + 1}
              </span>
              {label}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// ── step 1 · lot ─────────────────────────────────────────────────────

function LotStep({
  lots,
  selected,
  onSelect,
}: {
  lots: Lot[]
  selected: Lot | null
  onSelect: (id: LotId) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-body text-muted">
        Only lots with remaining capacity appear here. A lot at capacity is not
        listed at all — there is nothing to reject.
      </p>

      {selected && (
        <div className="rounded-lg border border-gold/50 bg-gold/8 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-body font-mono font-medium text-ink">
                {lotCodeFor(selected)}
              </p>
              <p className="text-caption mt-0.5 break-words text-muted">
                {ownerName(selected)} · {tierName(selected)}
              </p>
            </div>
            <CapacityMeter
              used={selected.intermentCount}
              capacity={selected.capacity}
              className="shrink-0"
            />
          </div>
        </div>
      )}

      <Command className="rounded-lg border border-line bg-surface">
        <CommandInput placeholder="Search lot code or owner…" />
        <CommandList className="max-h-[240px]">
          <CommandEmpty className="text-body py-6 text-center text-muted">
            No lot with remaining capacity matches.
          </CommandEmpty>
          {lots.slice(0, 200).map((l) => (
            <CommandItem
              key={l.id}
              value={`${lotCodeFor(l)} ${ownerName(l)} ${tierName(l)}`}
              onSelect={() => onSelect(l.id)}
              className="flex items-center gap-3"
            >
              <Icon icon={IconLot} size={15} className="text-muted" />
              <span className="text-caption font-mono text-ink">{lotCodeFor(l)}</span>
              <span className="text-caption min-w-0 flex-1 break-words text-muted">
                {ownerName(l)}
              </span>
              <span className="text-caption tabular shrink-0 text-muted">
                {l.intermentCount} of {l.capacity} used
              </span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
      {lots.length > 200 && (
        <p className="text-caption text-muted" role="status">
          Showing the first 200 of {lots.length} eligible lots — narrow the search.
        </p>
      )}
    </div>
  )
}

// ── step 2 · deceased ────────────────────────────────────────────────

function DeceasedStep({
  first,
  middle,
  last,
  dob,
  dod,
  type,
  onFirst,
  onMiddle,
  onLast,
  onDob,
  onDod,
  onType,
  showErrors,
}: {
  first: string
  middle: string
  last: string
  dob: ISODate | null
  dod: ISODate | null
  type: IntermentType
  onFirst: (v: string) => void
  onMiddle: (v: string) => void
  onLast: (v: string) => void
  onDob: (v: ISODate | null) => void
  onDod: (v: ISODate | null) => void
  onType: (v: IntermentType) => void
  showErrors: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="First name" htmlFor="interment-first-name" required>
          <Input
            id="interment-first-name"
            value={first}
            onChange={(e) => onFirst(e.target.value)}
            required
            aria-invalid={showErrors && first.trim().length === 0}
          />
        </Field>
        <Field label="Middle name" htmlFor="interment-middle-name">
          <Input id="interment-middle-name" value={middle} onChange={(e) => onMiddle(e.target.value)} />
        </Field>
        <Field label="Last name" htmlFor="interment-last-name" required>
          <Input
            id="interment-last-name"
            value={last}
            onChange={(e) => onLast(e.target.value)}
            required
            aria-invalid={showErrors && last.trim().length === 0}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date of birth" htmlFor="interment-date-of-birth">
          <DatePickerButton
            id="interment-date-of-birth"
            value={dob}
            onChange={onDob}
            placeholder="Optional"
            captionLayout="dropdown"
            startMonth={new Date(1920, 0)}
            endMonth={toDate(TODAY)}
          />
        </Field>
        <Field label="Date of death" htmlFor="interment-date-of-death" required>
          <DatePickerButton
            id="interment-date-of-death"
            value={dod}
            onChange={onDod}
            placeholder="Required"
            captionLayout="dropdown"
            startMonth={new Date(2024, 0)}
            endMonth={toDate(TODAY)}
            ariaInvalid={showErrors && dod === null}
          />
        </Field>
      </div>

      {dod && (
        <div className="text-body rounded-lg border border-gold/45 bg-gold/8 px-3 py-2.5 text-gold-deep dark:text-gold" role="status">
          <span className="font-medium">Interment window:</span> on or before{' '}
          <span className="font-medium">{fmtDate(windowEnd(dod))}</span> (
          {AT_NEED_WINDOW_DAYS} days).
        </div>
      )}

      <div>
        <p className="eyebrow mb-2 text-muted">Interment type</p>
        <RadioGroup
          value={type}
          onValueChange={(v) => onType(v as IntermentType)}
          className="gap-2"
          aria-label="Interment type"
        >
          {(Object.keys(INTERMENT_TYPE_LABEL) as IntermentType[]).map((t) => (
            <label
              key={t}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition-colors',
                type === t ? 'border-gold bg-gold/8' : 'border-line hover:border-gold/45',
              )}
            >
              <RadioGroupItem value={t} className="mt-0.5" />
              <span className="min-w-0">
                <span className="text-body block font-medium text-ink">
                  {INTERMENT_TYPE_LABEL[t]}
                </span>
                <span className="text-caption block leading-snug text-muted">
                  {INTERMENT_TYPE_HINT[t]}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>
    </div>
  )
}

// ── step 3 · schedule ────────────────────────────────────────────────

function ScheduleStep({
  locationId,
  date,
  slot,
  dod,
  free,
  next,
  outside,
  override,
  notes,
  type,
  requirements,
  feeCentavos,
  onDate,
  onSlot,
  onOverride,
  onNotes,
  onToggleRequirement,
  showErrors,
}: {
  locationId: LocationId
  date: ISODate | null
  slot: BurialSlot | null
  dod: ISODate | null
  free: BurialSlot[]
  next: { date: ISODate; slot: BurialSlot } | null
  outside: boolean
  override: string
  notes: string
  type: IntermentType
  requirements: IntermentRequirements
  feeCentavos: number
  onDate: (v: ISODate) => void
  onSlot: (v: BurialSlot) => void
  onOverride: (v: string) => void
  onNotes: (v: string) => void
  onToggleRequirement: (k: keyof IntermentRequirements, v: boolean) => void
  showErrors: boolean
}) {
  const limit = dod && dod > TODAY ? dod : TODAY

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="rounded-lg border border-line bg-surface p-1">
          <Calendar
            aria-label="Burial date"
            mode="single"
            selected={date ? toDate(date) : undefined}
            onSelect={(d) => d && onDate(toISODate(d))}
            defaultMonth={date ? toDate(date) : toDate(TODAY)}
            weekStartsOn={1}
            className="bg-transparent"
            disabled={[
              { before: toDate(limit) },
              // Full days are disabled outright, not rejected on submit.
              (d: Date) => isDayFull(toISODate(d), locationId),
            ]}
            modifiers={
              dod
                ? { outsideWindow: (d: Date) => toISODate(d) > windowEnd(dod) }
                : undefined
            }
            modifiersClassNames={{
              outsideWindow: 'text-gold-deep dark:text-gold font-medium',
            }}
          />
        </div>

        <div className="space-y-3">
          {next && (
            <p className="text-body text-muted" role="status">
              <span className="font-medium text-ink">Next available:</span>{' '}
              {fmtDateLong(next.date)}, {SLOT_LABEL[next.slot].toLowerCase()}
            </p>
          )}

          {dod && (
            <p className="text-caption text-muted">
              Interment window: on or before{' '}
              <span className="font-medium text-ink">{fmtDate(windowEnd(dod))}</span> (
              {AT_NEED_WINDOW_DAYS} days from the date of death).
            </p>
          )}

          <div>
            <p className="eyebrow mb-1.5 text-muted">Slot</p>
            {!date ? (
              <p className="text-body text-muted">Pick a date first.</p>
            ) : (
              <RadioGroup
                value={slot ?? ''}
                onValueChange={(v) => onSlot(v as BurialSlot)}
                className="gap-1.5"
                aria-label="Burial slot"
              >
                {(['morning', 'afternoon'] as BurialSlot[]).map((s) => {
                  const taken = !free.includes(s)
                  return (
                    <label
                      key={s}
                      className={cn(
                        'text-control flex min-h-11 items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors',
                        taken
                          ? 'cursor-not-allowed border-line bg-surface-2 text-muted'
                          : slot === s
                            ? 'cursor-pointer border-gold bg-gold/8 text-ink'
                            : 'cursor-pointer border-line hover:border-gold/45',
                      )}
                    >
                      <RadioGroupItem value={s} disabled={taken} />
                      <SlotIcon slot={s} />
                      <span className="flex-1">{SLOT_LABEL[s]}</span>
                      {taken && <span className="text-caption">Already booked</span>}
                    </label>
                  )
                })}
              </RadioGroup>
            )}
          </div>

          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-body text-muted">Opening &amp; closing fee</span>
              <MoneyText centavos={feeCentavos} className="text-body font-medium" />
            </div>
            <p className="text-caption mt-1 flex flex-wrap items-center gap-1.5 text-muted">
              Billed as a service line on the contract.
              <AssumedChip why={ASSUMPTIONS.serviceFees.why} />
            </p>
          </div>
        </div>
      </div>

      {outside && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: EASE }}
          className="rounded-lg border border-gold bg-gold/10 p-3"
        >
          <p className="text-body flex items-start gap-2 font-medium text-gold-deep dark:text-gold" id="window-override-help">
            <Icon icon={IconWarning} size={16} className="mt-px" />
            {date && dod
              ? `${fmtDate(date)} falls outside the ${AT_NEED_WINDOW_DAYS}-day window, which closes ${fmtDate(windowEnd(dod))}.`
              : 'Outside the interment window.'}
          </p>
          <p className="text-caption mt-1 leading-snug text-muted">
            The rule is the client's. The override exists because reality has
            exceptions and a system that simply refuses gets worked around on paper.
          </p>
          <Label htmlFor="window-override-reason">Override reason</Label>
          <Textarea
            id="window-override-reason"
            value={override}
            onChange={(e) => onOverride(e.target.value)}
            placeholder="Reason for scheduling outside the window (required)"
            className="mt-2 min-h-20 bg-surface"
            required
            aria-invalid={showErrors && override.trim().length === 0}
            aria-describedby="window-override-help"
          />
        </motion.div>
      )}

      <div>
        <p className="eyebrow mb-1.5 text-muted">Requirements</p>
        <RequirementsChecklist
          type={type}
          requirements={requirements}
          editable
          idPrefix="new-interment"
          onToggle={onToggleRequirement}
        />
        <p className="text-caption mt-1.5 text-muted">
          Outstanding items do not block scheduling — the permit usually arrives
          after the date is set — but they do block completion.
        </p>
      </div>

      <Field label="Notes" htmlFor="interment-notes">
        <Textarea
          id="interment-notes"
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Anything the office or the grounds crew should know"
          className="min-h-20"
        />
      </Field>
    </div>
  )
}

// ── small parts ──────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-caption font-semibold text-muted">
        {label}
        {required && (
          <>
            <span className="ml-1 text-danger" aria-hidden>*</span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </Label>
      {children}
    </div>
  )
}

/** A Calendar in a Popover. Never a native date input. */
export function DatePickerButton({
  id,
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
  captionLayout,
  startMonth,
  endMonth,
  className,
  ariaLabel,
  ariaInvalid,
  ariaDescribedBy,
}: {
  id?: string
  value: ISODate | null
  onChange: (v: ISODate) => void
  placeholder?: string
  disabled?: React.ComponentProps<typeof Calendar>['disabled']
  captionLayout?: React.ComponentProps<typeof Calendar>['captionLayout']
  startMonth?: Date
  endMonth?: Date
  className?: string
  ariaLabel?: string
  ariaInvalid?: boolean
  ariaDescribedBy?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn(
            'w-full justify-start gap-2 font-normal',
            !value && 'text-muted',
            className,
          )}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
        >
          <Icon icon={IconCalendar} size={15} />
          {value ? fmtDate(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? toDate(value) : undefined}
          defaultMonth={value ? toDate(value) : endMonth}
          onSelect={(d) => {
            if (!d) return
            onChange(toISODate(d))
            setOpen(false)
          }}
          weekStartsOn={1}
          disabled={disabled}
          captionLayout={captionLayout}
          startMonth={startMonth}
          endMonth={endMonth}
        />
      </PopoverContent>
    </Popover>
  )
}
