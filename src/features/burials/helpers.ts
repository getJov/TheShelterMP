import {
  AT_NEED_WINDOW_DAYS,
  clientFullName,
  formatLotCode,
  type BurialSlot,
  type Client,
  type Interment,
  type IntermentStatus,
  type IntermentType,
  type ISODate,
  type Lot,
  type LotId,
  type User,
} from '@/domain'
import { addDays } from '@/lib/dates'
import { indexes } from '@/stores/dataset'

/** The brand motion curve. Lives here so bits.tsx exports only components. */
export const EASE = [0.22, 1, 0.36, 1] as const

/** '13 Aug 2026' — the last day inside the at-need window. */
export const windowEnd = (dateOfDeath: ISODate): ISODate =>
  addDays(dateOfDeath, AT_NEED_WINDOW_DAYS)

export const isOutsideWindow = (dateOfDeath: ISODate, scheduled: ISODate) =>
  scheduled > windowEnd(dateOfDeath)

export function lotCode(lotId: LotId): string {
  const lot = indexes().lotsById.get(lotId)
  if (!lot) return '—'
  return formatLotCode(indexes().blocksById.get(lot.blockId)?.code ?? 'B??', lot.lotNumber)
}

export function lotCodeFor(lot: Lot): string {
  return formatLotCode(indexes().blocksById.get(lot.blockId)?.code ?? 'B??', lot.lotNumber)
}

export function ownerOf(lot: Lot): Client | null {
  if (lot.currentOwnerClientId)
    return indexes().clientsById.get(lot.currentOwnerClientId) ?? null
  const c = lot.currentContractId
    ? indexes().contractsById.get(lot.currentContractId)
    : null
  return c ? (indexes().clientsById.get(c.clientId) ?? null) : null
}

export const ownerName = (lot: Lot): string => {
  const c = ownerOf(lot)
  return c ? clientFullName(c) : 'No owner on file'
}

export const tierName = (lot: Lot): string =>
  indexes().tiersById.get(lot.tierId)?.name ?? '—'

export const userName = (id: string | null | undefined): string =>
  id ? (indexes().usersById.get(id as never)?.fullName ?? '—') : 'Unassigned'

/** Surname only — what a calendar cell has room for. */
export const surname = (i: Interment) => i.deceasedLastName

export const slotLabelShort: Record<BurialSlot, string> = {
  morning: 'AM',
  afternoon: 'PM',
}

/**
 * Tokens only — no hex literals in features. Status drives the chip and the
 * calendar entry's outline; `requested` is deliberately dashed everywhere.
 */
export const INTERMENT_STATUS_STYLE: Record<
  IntermentStatus,
  { chip: string; entry: string; dot: string }
> = {
  requested: {
    chip: 'border-gold/50 bg-gold/12 text-gold-deep dark:text-gold',
    entry: 'border border-dashed border-gold/70 bg-gold/10 text-gold-deep dark:text-gold',
    dot: 'bg-gold',
  },
  scheduled: {
    chip: 'border-info/50 bg-info/12 text-info',
    entry: 'border border-info/40 bg-info/12 text-ink',
    dot: 'bg-info',
  },
  completed: {
    chip: 'border-green/50 bg-green/12 text-green',
    entry: 'border border-green/35 bg-green/10 text-ink',
    dot: 'bg-green',
  },
  cancelled: {
    chip: 'border-danger/50 bg-danger/10 text-danger',
    entry: 'border border-dashed border-danger/50 bg-danger/8 text-danger line-through',
    dot: 'bg-danger',
  },
}

export const INTERMENT_TYPE_HINT: Record<IntermentType, string> = {
  permanent: 'A permanent interment in the lot.',
  temporary: 'Held for a fixed period, then exhumed or transferred.',
  cremation: 'Cremated remains placed in the lot.',
  bone_transfer: 'Remains moved in from elsewhere — needs a transfer permit.',
}

/** Users who can be sent to a grave: staff bound to this location. */
export function crewAt(locationId: string, users: User[]): User[] {
  return users.filter(
    (u) =>
      u.status === 'active' &&
      u.role !== 'agent' &&
      u.role !== 'owner' &&
      (u.locationIds.length === 0 || u.locationIds.includes(locationId as never)),
  )
}
