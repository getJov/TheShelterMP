import { create } from 'zustand'
import {
  asId,
  blockingRequirements,
  BURIAL_SLOTS,
  deceasedFullName,
  formatLotCode,
  GROUNDS_CHECKLIST,
  MAX_BURIALS_PER_DAY,
  type BurialSlot,
  type ContractId,
  type DaySchedule,
  type GroundsJob,
  type Interment,
  type IntermentId,
  type IntermentRequirements,
  type IntermentType,
  type ISODate,
  type JobId,
  type LocationId,
  type LotId,
  type UserId,
} from '@/domain'
import { addDays, fmtDate } from '@/lib/dates'
import { dataset, indexes, useDataset } from './dataset'
import { useNotifications } from './notifications'
import { NOW, TODAY } from '@/mock'

/**
 * The burial book.
 *
 * Two hard constraints live here rather than in the UI, because a
 * double-booked grave is the exact failure this system exists to prevent:
 *
 *   1. MAX_BURIALS_PER_DAY — one morning, one afternoon, never more.
 *   2. lot.intermentCount may never exceed lot.capacity.
 *
 * Both throw. Callers check availability first; the throw is a backstop,
 * not a UX.
 */

let iSeq = 9000
let jSeq = 9000
let aSeq = 9000

// ── helpers ──────────────────────────────────────────────────────────

/** Cancelled interments release their slot; everything else holds it. */
export const holdsSlot = (i: Interment) => i.status !== 'cancelled'

const lotOf = (lotId: LotId) => indexes().lotsById.get(lotId) ?? null

export function lotCodeOf(lotId: LotId): string {
  const lot = lotOf(lotId)
  if (!lot) return '—'
  const block = indexes().blocksById.get(lot.blockId)
  return formatLotCode(block?.code ?? 'B??', lot.lotNumber)
}

function pushAudit(
  actorUserId: UserId,
  action: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  dataset().audit.push({
    id: asId<'Audit'>(`aud_${String(++aSeq).padStart(5, '0')}`),
    actorUserId,
    action,
    entityType: 'Interment',
    entityId,
    before,
    after,
    at: NOW,
  })
}

/** Grounds job for a scheduled interment. One job per interment, always. */
function createJob(i: Interment): GroundsJob {
  const job: GroundsJob = {
    id: asId<'Job'>(`job_${String(++jSeq).padStart(4, '0')}`),
    intermentId: i.id,
    lotId: i.lotId,
    locationId: i.locationId,
    scheduledFor: i.scheduledDate,
    slot: i.slot,
    assignedToUserId: null,
    status: 'pending',
    checklist: GROUNDS_CHECKLIST.map((c) => ({ ...c, done: false })),
    photoUrls: [],
    completedAt: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
  dataset().jobs.push(job)
  i.groundsJobId = job.id
  return job
}

// ── selectors ────────────────────────────────────────────────────────

/**
 * Every interment holding a slot on a date at a location.
 * Cancelled ones are excluded — a cancellation frees the slot.
 */
export function intermentsOn(date: ISODate, locationId: LocationId | null): Interment[] {
  return dataset().interments.filter(
    (i) =>
      i.scheduledDate === date &&
      holdsSlot(i) &&
      (locationId === null || i.locationId === locationId),
  )
}

/**
 * Slots still free on a date. `exceptId` lets a reschedule ignore its own
 * current booking, so Tuesday PM → Tuesday AM works.
 */
export function availableSlots(
  date: ISODate,
  locationId: LocationId | null,
  exceptId?: IntermentId | null,
): BurialSlot[] {
  const taken = new Set(
    intermentsOn(date, locationId)
      .filter((i) => i.id !== exceptId)
      .map((i) => i.slot),
  )
  return BURIAL_SLOTS.filter((s) => !taken.has(s))
}

export function isDayFull(date: ISODate, locationId: LocationId | null): boolean {
  return availableSlots(date, locationId).length === 0
}

/**
 * "When can you do it?" — one call, because that is the question a family
 * asks and nobody should answer it by scanning a calendar by hand.
 */
export function nextAvailableSlot(
  from: ISODate,
  locationId: LocationId | null,
  horizonDays = 365,
): { date: ISODate; slot: BurialSlot } | null {
  for (let d = 0; d <= horizonDays; d++) {
    const date = addDays(from, d)
    const free = availableSlots(date, locationId)
    if (free.length > 0) return { date, slot: free[0]! }
  }
  return null
}

/** One DaySchedule per calendar day in [from, to], inclusive. */
export function scheduleForRange(
  from: ISODate,
  to: ISODate,
  locationId: LocationId | null,
): DaySchedule[] {
  const byDate = new Map<ISODate, Interment[]>()
  for (const i of dataset().interments) {
    if (!holdsSlot(i)) continue
    if (locationId !== null && i.locationId !== locationId) continue
    if (i.scheduledDate < from || i.scheduledDate > to) continue
    const arr = byDate.get(i.scheduledDate)
    if (arr) arr.push(i)
    else byDate.set(i.scheduledDate, [i])
  }

  const out: DaySchedule[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const rows = byDate.get(date) ?? []
    const morning = rows.find((r) => r.slot === 'morning') ?? null
    const afternoon = rows.find((r) => r.slot === 'afternoon') ?? null
    out.push({
      date,
      morning: morning?.id ?? null,
      afternoon: afternoon?.id ?? null,
      full: rows.length >= MAX_BURIALS_PER_DAY,
    })
  }
  return out
}

export function lotCapacityRemaining(lotId: LotId): number {
  const lot = lotOf(lotId)
  if (!lot) return 0
  return Math.max(0, lot.capacity - lot.intermentCount)
}

export function upcomingInterments(
  days: number,
  locationId: LocationId | null,
  from: ISODate = TODAY,
): Interment[] {
  const to = addDays(from, days)
  return dataset()
    .interments.filter(
      (i) =>
        holdsSlot(i) &&
        i.status !== 'completed' &&
        i.scheduledDate >= from &&
        i.scheduledDate <= to &&
        (locationId === null || i.locationId === locationId),
    )
    .sort((a, b) =>
      a.scheduledDate === b.scheduledDate
        ? a.slot === 'morning'
          ? -1
          : 1
        : a.scheduledDate < b.scheduledDate
          ? -1
          : 1,
    )
}

export function jobsForDate(
  date: ISODate,
  locationId: LocationId | null,
): GroundsJob[] {
  return dataset()
    .jobs.filter(
      (j) =>
        j.scheduledFor === date &&
        (locationId === null || j.locationId === locationId),
    )
    .sort((a) => (a.slot === 'morning' ? -1 : 1))
}

export function jobsInRange(
  from: ISODate,
  to: ISODate,
  locationId: LocationId | null,
): GroundsJob[] {
  return dataset()
    .jobs.filter(
      (j) =>
        j.scheduledFor >= from &&
        j.scheduledFor <= to &&
        (locationId === null || j.locationId === locationId),
    )
    .sort((a, b) =>
      a.scheduledFor === b.scheduledFor
        ? a.slot === 'morning'
          ? -1
          : 1
        : a.scheduledFor < b.scheduledFor
          ? -1
          : 1,
    )
}

export const checklistProgress = (job: GroundsJob) => ({
  done: job.checklist.filter((c) => c.done).length,
  total: job.checklist.length,
})

/**
 * The client's complaint, encoded: the grounds team hears late. A job inside
 * three days with nobody's name on it is the thing to shout about.
 */
export function isJobLateUnassigned(job: GroundsJob, asOf: ISODate = TODAY): boolean {
  if (job.assignedToUserId) return false
  if (job.status === 'completed') return false
  return job.scheduledFor >= asOf && job.scheduledFor <= addDays(asOf, 3)
}

export function lateUnassignedJobs(
  locationId: LocationId | null,
  asOf: ISODate = TODAY,
): GroundsJob[] {
  return dataset().jobs.filter(
    (j) =>
      isJobLateUnassigned(j, asOf) &&
      (locationId === null || j.locationId === locationId),
  )
}

/** Requirements that only warn — they never block completion. */
export function advisoryRequirements(i: Interment): string[] {
  const out: string[] = []
  if (!i.requirements.ownerConsent) out.push('Owner consent')
  if (!i.requirements.feesSettled) out.push('Fees settled')
  return out
}

/** Which requirement rows apply to an interment — transfer permit is conditional. */
export function requirementKeys(
  type: IntermentType,
): (keyof IntermentRequirements)[] {
  const base: (keyof IntermentRequirements)[] = ['deathCertificate', 'burialPermit']
  if (type === 'bone_transfer') base.push('transferPermit')
  return [...base, 'ownerConsent', 'feesSettled']
}

export function requirementsProgress(i: Interment) {
  const keys = requirementKeys(i.type)
  return { done: keys.filter((k) => i.requirements[k]).length, total: keys.length }
}

// ── store ────────────────────────────────────────────────────────────

export interface ScheduleIntermentInput {
  lotId: LotId
  deceasedFirstName: string
  deceasedMiddleName: string | null
  deceasedLastName: string
  dateOfBirth: ISODate | null
  dateOfDeath: ISODate
  type: IntermentType
  scheduledDate: ISODate
  slot: BurialSlot
  requirements?: Partial<IntermentRequirements>
  openingClosingFeeCentavos: number
  notes: string | null
  /** Beyond AT_NEED_WINDOW_DAYS the caller must say why. */
  windowOverrideReason?: string | null
  /** Who is booking. Agents land as `requested` and raise an approval. */
  actor: { id: UserId; role: 'owner' | 'admin' | 'manager' | 'agent' }
}

interface BurialsStore {
  version: number
  scheduleInterment: (input: ScheduleIntermentInput) => IntermentId
  rescheduleInterment: (
    id: IntermentId,
    date: ISODate,
    slot: BurialSlot,
    actorId: UserId,
  ) => void
  cancelInterment: (id: IntermentId, reason: string, actorId: UserId) => void
  completeInterment: (id: IntermentId, actorId: UserId) => void
  updateRequirements: (
    id: IntermentId,
    patch: Partial<IntermentRequirements>,
  ) => void
  approveInterment: (id: IntermentId, actorId: UserId) => void
  rejectInterment: (id: IntermentId, actorId: UserId, note: string) => void
  assignJob: (jobId: JobId, userId: UserId | null) => void
  updateChecklist: (jobId: JobId, key: string, done: boolean) => void
  completeJob: (jobId: JobId) => void
  setJobNotes: (jobId: JobId, notes: string) => void
}

export const useBurials = create<BurialsStore>((set, get) => {
  const bump = () => {
    set({ version: get().version + 1 })
    // The map must reflect an interment with no reload.
    useDataset.getState().touch()
  }

  return {
    version: 0,

    scheduleInterment: (input) => {
      const lot = lotOf(input.lotId)
      if (!lot) throw new Error(`Unknown lot ${input.lotId}`)

      const location = indexes().locationsById.get(lot.locationId)
      if (location && location.kind !== 'park')
        throw new Error('Interments are held at the park.')

      if (lot.intermentCount >= lot.capacity)
        throw new Error(
          `${lotCodeOf(lot.id)} is at full capacity (${lot.intermentCount} of ${lot.capacity}).`,
        )

      const free = availableSlots(input.scheduledDate, lot.locationId)
      if (!free.includes(input.slot))
        throw new Error(
          `${fmtDate(input.scheduledDate)} ${input.slot} is already booked. A day holds ${MAX_BURIALS_PER_DAY} services.`,
        )

      const isAgent = input.actor.role === 'agent'
      const id = asId<'Interment'>(`int_${String(++iSeq).padStart(4, '0')}`)

      const interment: Interment = {
        id,
        lotId: lot.id,
        locationId: lot.locationId,
        contractId: (lot.currentContractId ?? null) as ContractId | null,
        deceasedFirstName: input.deceasedFirstName.trim(),
        deceasedMiddleName: input.deceasedMiddleName?.trim() || null,
        deceasedLastName: input.deceasedLastName.trim(),
        dateOfBirth: input.dateOfBirth,
        dateOfDeath: input.dateOfDeath,
        type: input.type,
        scheduledDate: input.scheduledDate,
        slot: input.slot,
        status: isAgent ? 'requested' : 'scheduled',
        requirements: {
          deathCertificate: false,
          burialPermit: false,
          // Not applicable unless this is a bone transfer.
          transferPermit: input.type !== 'bone_transfer',
          ownerConsent: false,
          feesSettled: false,
          ...input.requirements,
        },
        openingClosingFeeCentavos: input.openingClosingFeeCentavos,
        groundsJobId: null,
        requestedByUserId: input.actor.id,
        notes: input.windowOverrideReason
          ? [input.notes, `Window override: ${input.windowOverrideReason}`]
              .filter(Boolean)
              .join(' · ')
          : input.notes,
        createdAt: NOW,
        updatedAt: NOW,
      }

      dataset().interments.push(interment)

      // Same transaction: the lot is occupied and its count moves.
      lot.intermentCount += 1
      lot.status = 'occupied'
      lot.updatedAt = NOW

      if (!isAgent) createJob(interment)

      pushAudit(input.actor.id, 'interment.scheduled', id, null, {
        deceased: deceasedFullName(interment),
        lot: lotCodeOf(lot.id),
        date: interment.scheduledDate,
        slot: interment.slot,
        status: interment.status,
      })

      const n = useNotifications.getState()
      if (isAgent) {
        n.createApproval({
          kind: 'interment',
          entityId: id,
          locationId: lot.locationId,
          title: `Interment · ${lotCodeOf(lot.id)}`,
          summary: `${deceasedFullName(interment)} · ${fmtDate(interment.scheduledDate)}, ${interment.slot}.`,
          requestedByUserId: input.actor.id,
          requestedAt: NOW,
        })
        n.notifyRole(
          'manager',
          lot.locationId,
          'interment_scheduled',
          'Interment requested',
          `${deceasedFullName(interment)} · ${lotCodeOf(lot.id)} · ${fmtDate(interment.scheduledDate)}.`,
          `/burials/${id}`,
        )
      } else {
        n.notifyRole(
          'manager',
          lot.locationId,
          'interment_scheduled',
          'Interment scheduled',
          `${deceasedFullName(interment)} · ${lotCodeOf(lot.id)} · ${fmtDate(interment.scheduledDate)}, ${interment.slot}.`,
          `/burials/${id}`,
        )
      }

      bump()
      return id
    },

    rescheduleInterment: (id, date, slot, actorId) => {
      const i = indexes().intermentsById.get(id)
      if (!i) throw new Error(`Unknown interment ${id}`)
      if (i.status === 'cancelled' || i.status === 'completed')
        throw new Error('Only a requested or scheduled interment can be moved.')

      // Its own current booking is excluded, so PM → AM on the same day works.
      const free = availableSlots(date, i.locationId, i.id)
      if (!free.includes(slot))
        throw new Error(
          `${fmtDate(date)} ${slot} is already booked. A day holds ${MAX_BURIALS_PER_DAY} services.`,
        )

      const before = { date: i.scheduledDate, slot: i.slot }
      i.scheduledDate = date
      i.slot = slot
      i.updatedAt = NOW

      const job = i.groundsJobId ? indexes().jobsById.get(i.groundsJobId) : null
      if (job) {
        job.scheduledFor = date
        job.slot = slot
        job.updatedAt = NOW
      }

      pushAudit(actorId, 'interment.scheduled', id, before, { date, slot })
      if (job?.assignedToUserId) {
        useNotifications
          .getState()
          .notify(
            [job.assignedToUserId],
            'job_assigned',
            'Interment moved',
            `${deceasedFullName(i)} · ${lotCodeOf(i.lotId)} is now ${fmtDate(date)}, ${slot}.`,
            `/burials/jobs`,
          )
      }
      bump()
    },

    cancelInterment: (id, reason, actorId) => {
      const i = indexes().intermentsById.get(id)
      if (!i) throw new Error(`Unknown interment ${id}`)
      if (i.status === 'cancelled') return
      if (i.status === 'completed')
        throw new Error('A completed interment cannot be cancelled.')

      const before = { status: i.status }
      i.status = 'cancelled'
      i.notes = [i.notes, `Cancelled: ${reason}`].filter(Boolean).join(' · ')
      i.updatedAt = NOW

      const lot = lotOf(i.lotId)
      if (lot) {
        lot.intermentCount = Math.max(0, lot.intermentCount - 1)
        // A lot must never sit 'occupied' with nobody in it.
        if (lot.intermentCount === 0)
          lot.status = lot.currentContractId ? 'sold' : 'available'
        lot.updatedAt = NOW
      }

      // The grounds job goes with it.
      if (i.groundsJobId) {
        const jobs = dataset().jobs
        const at = jobs.findIndex((j) => j.id === i.groundsJobId)
        if (at >= 0) jobs.splice(at, 1)
        i.groundsJobId = null
      }

      pushAudit(actorId, 'interment.cancelled', id, before, {
        status: 'cancelled',
        reason,
      })
      useNotifications
        .getState()
        .notifyRole(
          'manager',
          i.locationId,
          'interment_scheduled',
          'Interment cancelled',
          `${deceasedFullName(i)} · ${lotCodeOf(i.lotId)} · ${reason}`,
          `/burials/${id}`,
        )
      bump()
    },

    completeInterment: (id, actorId) => {
      const i = indexes().intermentsById.get(id)
      if (!i) throw new Error(`Unknown interment ${id}`)
      const blocked = blockingRequirements(i)
      if (blocked.length > 0)
        throw new Error(`Outstanding: ${blocked.join(', ')}.`)
      if (i.status !== 'scheduled')
        throw new Error('Only a scheduled interment can be completed.')

      i.status = 'completed'
      i.updatedAt = NOW

      const job = i.groundsJobId ? indexes().jobsById.get(i.groundsJobId) : null
      if (job) {
        job.status = 'completed'
        job.completedAt = NOW
        job.updatedAt = NOW
      }

      pushAudit(actorId, 'interment.completed', id, { status: 'scheduled' }, {
        status: 'completed',
        deceased: deceasedFullName(i),
      })
      bump()
    },

    updateRequirements: (id, patch) => {
      const i = indexes().intermentsById.get(id)
      if (!i) return
      i.requirements = { ...i.requirements, ...patch }
      i.updatedAt = NOW
      bump()
    },

    approveInterment: (id, actorId) => {
      const i = indexes().intermentsById.get(id)
      if (!i || i.status !== 'requested') return
      i.status = 'scheduled'
      i.updatedAt = NOW
      if (!i.groundsJobId) createJob(i)

      const n = useNotifications.getState()
      const task = dataset().approvals.find(
        (a) => a.kind === 'interment' && a.entityId === id && a.status === 'pending',
      )
      if (task) n.decideApproval(task.id, 'approved', actorId)
      n.notify(
        [i.requestedByUserId],
        'interment_scheduled',
        'Interment approved',
        `${deceasedFullName(i)} · ${fmtDate(i.scheduledDate)}, ${i.slot}.`,
        `/burials/${id}`,
      )
      pushAudit(actorId, 'interment.scheduled', id, { status: 'requested' }, {
        status: 'scheduled',
      })
      bump()
    },

    rejectInterment: (id, actorId, note) => {
      const i = indexes().intermentsById.get(id)
      if (!i || i.status !== 'requested') return
      // Rejection frees the slot — go through the same path as a cancellation.
      const task = dataset().approvals.find(
        (a) => a.kind === 'interment' && a.entityId === id && a.status === 'pending',
      )
      if (task) useNotifications.getState().decideApproval(task.id, 'rejected', actorId, note)
      get().cancelInterment(id, note || 'Request rejected', actorId)
      useNotifications
        .getState()
        .notify(
          [i.requestedByUserId],
          'interment_scheduled',
          'Interment request rejected',
          `${deceasedFullName(i)} · ${note || 'No reason given'}`,
          `/burials`,
        )
    },

    assignJob: (jobId, userId) => {
      const job = indexes().jobsById.get(jobId)
      if (!job) return
      job.assignedToUserId = userId
      job.updatedAt = NOW
      if (userId) {
        const i = indexes().intermentsById.get(job.intermentId)
        useNotifications
          .getState()
          .notify(
            [userId],
            'job_assigned',
            'Grounds job assigned',
            `${lotCodeOf(job.lotId)} · ${fmtDate(job.scheduledFor)}, ${job.slot}${
              i ? ` · ${deceasedFullName(i)}` : ''
            }.`,
            '/burials/jobs',
          )
      }
      bump()
    },

    updateChecklist: (jobId, key, done) => {
      const job = indexes().jobsById.get(jobId)
      if (!job) return
      const item = job.checklist.find((c) => c.key === key)
      if (!item) return
      item.done = done
      job.updatedAt = NOW
      if (job.status !== 'completed') {
        const n = job.checklist.filter((c) => c.done).length
        job.status = n === 0 ? 'pending' : n === job.checklist.length ? 'ready' : 'in_progress'
      }
      bump()
    },

    completeJob: (jobId) => {
      const job = indexes().jobsById.get(jobId)
      if (!job) return
      job.status = 'completed'
      job.completedAt = NOW
      job.updatedAt = NOW
      bump()
    },

    setJobNotes: (jobId, notes) => {
      const job = indexes().jobsById.get(jobId)
      if (!job) return
      job.notes = notes || null
      job.updatedAt = NOW
      bump()
    },
  }
})
