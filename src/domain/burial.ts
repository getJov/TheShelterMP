import type { ContractId, IntermentId, JobId, LocationId, LotId, UserId } from './ids'
import type { Centavos, ISODate, ISODateTime } from './primitives'
import type { BurialSlot, IntermentStatus, IntermentType, JobStatus } from './enums'

export interface IntermentRequirements {
  deathCertificate: boolean
  burialPermit: boolean
  /** Only for bone_transfer. */
  transferPermit: boolean
  ownerConsent: boolean
  feesSettled: boolean
}

export interface Interment {
  id: IntermentId
  lotId: LotId
  locationId: LocationId
  /** Null for a burial in a lot with no contract on file yet. */
  contractId: ContractId | null

  deceasedFirstName: string
  deceasedMiddleName: string | null
  deceasedLastName: string
  dateOfBirth: ISODate | null
  dateOfDeath: ISODate

  type: IntermentType
  scheduledDate: ISODate
  slot: BurialSlot
  status: IntermentStatus

  requirements: IntermentRequirements

  /** Billed as a ServiceLine on the contract. */
  openingClosingFeeCentavos: Centavos
  groundsJobId: JobId | null
  requestedByUserId: UserId
  notes: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface ChecklistItem {
  key: string
  label: string
  done: boolean
}

export interface GroundsJob {
  id: JobId
  intermentId: IntermentId
  lotId: LotId
  locationId: LocationId
  scheduledFor: ISODate
  slot: BurialSlot
  assignedToUserId: UserId | null
  status: JobStatus
  checklist: ChecklistItem[]
  photoUrls: string[]
  completedAt: ISODateTime | null
  notes: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/** Derived, not stored — the calendar builds it per day. */
export interface DaySchedule {
  date: ISODate
  morning: IntermentId | null
  afternoon: IntermentId | null
  /** true when both slots are taken. */
  full: boolean
}

export const GROUNDS_CHECKLIST: { key: string; label: string }[] = [
  { key: 'site_marked', label: 'Site marked' },
  { key: 'excavation', label: 'Excavation' },
  { key: 'vault_set', label: 'Vault set' },
  { key: 'tent_chairs', label: 'Tent & chairs' },
  { key: 'marker_ready', label: 'Marker ready' },
  { key: 'backfill', label: 'Backfill' },
  { key: 'turf_restored', label: 'Turf restored' },
]

export const deceasedFullName = (i: Interment) =>
  [i.deceasedFirstName, i.deceasedMiddleName, i.deceasedLastName]
    .filter(Boolean)
    .join(' ')

/** Requirements that block marking an interment complete. */
export function blockingRequirements(i: Interment): string[] {
  const out: string[] = []
  if (!i.requirements.deathCertificate) out.push('Death certificate')
  if (!i.requirements.burialPermit) out.push('Burial permit')
  if (i.type === 'bone_transfer' && !i.requirements.transferPermit)
    out.push('Transfer permit')
  return out
}
