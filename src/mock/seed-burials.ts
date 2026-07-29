import {
  asId,
  GROUNDS_CHECKLIST,
  type BurialSlot,
  type Contract,
  type GroundsJob,
  type Interment,
  type IntermentType,
  type Lot,
  type ServiceCatalogItem,
  type UserId,
} from '@/domain'
import { addDays } from '@/lib/dates'
import type { Rng } from './rng'
import { atHour, FIRST_INTERMENT, TODAY } from './time'
import { FEMALE_FIRST, MALE_FIRST, MIDDLE_INITIALS, SURNAMES } from './names'

export interface BurialSeed {
  interments: Interment[]
  jobs: GroundsJob[]
}

const SLOTS: BurialSlot[] = ['morning', 'afternoon']

/**
 * Max two services a day — one morning, one afternoon. The client was
 * unambiguous, so the generator books into a slot map and can physically
 * never exceed it.
 */
export function seedBurials(
  rng: Rng,
  ctx: {
    lots: Lot[]
    contracts: Contract[]
    services: ServiceCatalogItem[]
    crewIds: UserId[]
    managerId: UserId
  },
): BurialSeed {
  const openClose = ctx.services.find((s) => s.code === 'OPEN_CLOSE')!
  const taken = new Map<string, Set<BurialSlot>>()

  const book = (date: string, preferred?: BurialSlot): BurialSlot | null => {
    const used = taken.get(date) ?? new Set<BurialSlot>()
    const order = preferred ? [preferred, ...SLOTS.filter((s) => s !== preferred)] : SLOTS
    for (const s of order) {
      if (!used.has(s)) {
        used.add(s)
        taken.set(date, used)
        return s
      }
    }
    return null
  }

  // Candidate lots: sold, with capacity, contract not cancelled.
  const soldLots = ctx.lots.filter(
    (l) => l.status === 'sold' && l.currentContractId !== null,
  )
  const contractById = new Map(ctx.contracts.map((c) => [c.id, c]))

  // At-need contracts must be interred within 15 days — take those first.
  const atNeedLots = soldLots.filter(
    (l) => contractById.get(l.currentContractId!)?.needType === 'at_need',
  )
  const preNeedLots = soldLots.filter(
    (l) => contractById.get(l.currentContractId!)?.needType === 'pre_need',
  )

  const pool = [
    ...rng.shuffle(atNeedLots).slice(0, 26),
    ...rng.shuffle(preNeedLots).slice(0, 18),
  ]

  const interments: Interment[] = []
  const jobs: GroundsJob[] = []
  let seq = 0

  // 30 completed (past), 9 scheduled, 3 requested, 2 cancelled = 44
  const plan: { status: Interment['status']; count: number }[] = [
    { status: 'completed', count: 30 },
    { status: 'scheduled', count: 9 },
    { status: 'requested', count: 3 },
    { status: 'cancelled', count: 2 },
  ]

  let poolIdx = 0
  // Days we deliberately fill completely, so the calendar shows its ceiling.
  const fullDays = [addDays(TODAY, 3), addDays(TODAY, 8), addDays(TODAY, 14)]
  const fullDayQueue = [...fullDays, ...fullDays]

  for (const step of plan) {
    for (let k = 0; k < step.count; k++) {
      const lot = pool[poolIdx++ % pool.length]
      if (!lot) continue
      if (lot.intermentCount >= lot.capacity) continue

      const contract = lot.currentContractId
        ? contractById.get(lot.currentContractId)
        : undefined

      const type: IntermentType = rng.weighted([
        ['permanent', 70],
        ['cremation', 14],
        ['temporary', 9],
        ['bone_transfer', 7],
      ] as const)

      // Dates
      let scheduledDate: string
      if (step.status === 'completed') {
        // Between the park's first interment and today.
        const span = Math.max(1, daysBetween(FIRST_INTERMENT, TODAY) - 2)
        scheduledDate = addDays(FIRST_INTERMENT, rng.int(0, span))
      } else if (step.status === 'scheduled') {
        scheduledDate = fullDayQueue.length
          ? fullDayQueue.shift()!
          : addDays(TODAY, rng.int(1, 21))
      } else if (step.status === 'requested') {
        scheduledDate = addDays(TODAY, rng.int(4, 18))
      } else {
        scheduledDate = addDays(TODAY, rng.int(-30, -5))
      }

      const slot = book(scheduledDate, rng.pick(SLOTS))
      if (!slot) continue

      // At-need: date of death within the 15-day window before interment.
      const dateOfDeath =
        contract?.needType === 'at_need'
          ? addDays(scheduledDate, -rng.int(3, 14))
          : addDays(scheduledDate, -rng.int(2, 10))

      const female = rng.bool(0.5)
      const complete = step.status === 'completed'
      const gapItem = step.status === 'scheduled' && k < 3

      const id = asId<'Interment'>(`int_${String(++seq).padStart(4, '0')}`)
      const jobId = asId<'Job'>(`job_${String(seq).padStart(4, '0')}`)

      interments.push({
        id,
        lotId: lot.id,
        locationId: lot.locationId,
        contractId: lot.currentContractId,
        deceasedFirstName: rng.pick(female ? FEMALE_FIRST : MALE_FIRST),
        deceasedMiddleName: rng.pick(MIDDLE_INITIALS) + '.',
        deceasedLastName: rng.pick(SURNAMES),
        dateOfBirth: `19${rng.int(30, 70)}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
        dateOfDeath,
        type,
        scheduledDate,
        slot,
        status: step.status,
        requirements: {
          deathCertificate: complete || !gapItem,
          burialPermit: complete || (!gapItem && rng.bool(0.85)),
          transferPermit: type === 'bone_transfer' ? complete || rng.bool(0.5) : true,
          ownerConsent: complete || rng.bool(0.8),
          feesSettled: complete || rng.bool(0.7),
        },
        openingClosingFeeCentavos: openClose.defaultAmountCentavos,
        groundsJobId: step.status === 'cancelled' ? null : jobId,
        requestedByUserId: ctx.managerId,
        notes: null,
        createdAt: atHour(addDays(scheduledDate, -7), 11),
        updatedAt: atHour(addDays(scheduledDate, -7), 11),
      })

      if (step.status === 'completed' || step.status === 'scheduled') {
        const done = step.status === 'completed'
        jobs.push({
          id: jobId,
          intermentId: id,
          lotId: lot.id,
          locationId: lot.locationId,
          scheduledFor: scheduledDate,
          slot,
          // A couple of upcoming jobs are deliberately unassigned so the
          // "grounds team hears late" flag has something to catch.
          assignedToUserId: done
            ? rng.pick(ctx.crewIds)
            : rng.bool(0.7)
              ? rng.pick(ctx.crewIds)
              : null,
          status: done ? 'completed' : rng.bool(0.4) ? 'in_progress' : 'pending',
          checklist: GROUNDS_CHECKLIST.map((c, ci) => ({
            ...c,
            done: done ? true : ci < rng.int(0, 4),
          })),
          photoUrls: [],
          completedAt: done ? atHour(scheduledDate, 16) : null,
          notes: null,
          createdAt: atHour(addDays(scheduledDate, -6), 9),
          updatedAt: atHour(addDays(scheduledDate, -1), 9),
        })
      }

      if (step.status !== 'cancelled') {
        lot.intermentCount += 1
        lot.status = 'occupied'
      }
    }
  }

  // ── second interments ────────────────────────────────────────────
  // A lawn lot holding 2 of 2, and a family garden partway through its 8,
  // so the capacity meter has something real to show.
  const repeatTargets = [
    ...ctx.lots.filter((l) => l.capacity === 2 && l.intermentCount === 1).slice(0, 2),
    ...ctx.lots.filter((l) => l.capacity === 8 && l.intermentCount === 1).slice(0, 1),
  ]
  for (const lot of repeatTargets) {
    const extra = lot.capacity === 8 ? 2 : 1
    for (let e = 0; e < extra; e++) {
      const date = addDays(TODAY, -rng.int(6, 50))
      const slot = book(date, rng.pick(SLOTS))
      if (!slot) continue
      const id = asId<'Interment'>(`int_${String(++seq).padStart(4, '0')}`)
      const jobId = asId<'Job'>(`job_${String(seq).padStart(4, '0')}`)
      const female = rng.bool(0.5)

      interments.push({
        id,
        lotId: lot.id,
        locationId: lot.locationId,
        contractId: lot.currentContractId,
        deceasedFirstName: rng.pick(female ? FEMALE_FIRST : MALE_FIRST),
        deceasedMiddleName: rng.pick(MIDDLE_INITIALS) + '.',
        deceasedLastName: rng.pick(SURNAMES),
        dateOfBirth: `19${rng.int(30, 60)}-0${rng.int(1, 9)}-1${rng.int(0, 9)}`,
        dateOfDeath: addDays(date, -rng.int(3, 9)),
        type: 'permanent',
        scheduledDate: date,
        slot,
        status: 'completed',
        requirements: {
          deathCertificate: true,
          burialPermit: true,
          transferPermit: true,
          ownerConsent: true,
          feesSettled: true,
        },
        openingClosingFeeCentavos: openClose.defaultAmountCentavos,
        groundsJobId: jobId,
        requestedByUserId: ctx.managerId,
        notes: null,
        createdAt: atHour(addDays(date, -7), 11),
        updatedAt: atHour(date, 17),
      })

      jobs.push({
        id: jobId,
        intermentId: id,
        lotId: lot.id,
        locationId: lot.locationId,
        scheduledFor: date,
        slot,
        assignedToUserId: rng.pick(ctx.crewIds),
        status: 'completed',
        checklist: GROUNDS_CHECKLIST.map((c) => ({ ...c, done: true })),
        photoUrls: [],
        completedAt: atHour(date, 16),
        notes: null,
        createdAt: atHour(addDays(date, -6), 9),
        updatedAt: atHour(date, 16),
      })

      lot.intermentCount += 1
    }
  }

  return { interments, jobs }
}

function daysBetween(a: string, b: string) {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86400000,
  )
}
