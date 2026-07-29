import type { IconSvgElement } from '@hugeicons/react'
import {
  asId,
  clientFullName,
  formatLotCode,
  type ApprovalKind,
  type ClientId,
  type IntermentRequirements,
  type Lot,
  type LotId,
  type UserId,
} from '@/domain'
import { dataset, indexes } from '@/stores/dataset'
import {
  IconBurials,
  IconContract,
  IconHold,
  IconPayout,
  IconPromo,
  IconTransfer,
} from '@/components/ui-brand/icons'

/**
 * Shared vocabulary for the approvals queue. One place, so the tab label, the
 * card chip, the bell row and the history table can never drift apart.
 */
export interface KindMeta {
  /** Singular, for a chip. */
  label: string
  /** Plural, for a filter tab. */
  plural: string
  icon: IconSvgElement
  tone: string
  /** True only for the one kind that may be decided in bulk. */
  bulk: boolean
}

export const KIND_META: Record<ApprovalKind, KindMeta> = {
  hold: {
    label: 'Hold',
    plural: 'Holds',
    icon: IconHold,
    tone: 'border-gold/45 bg-gold/12 text-gold-deep dark:text-gold',
    bulk: true,
  },
  contract: {
    label: 'Contract',
    plural: 'Contracts',
    icon: IconContract,
    tone: 'border-info/45 bg-info/12 text-info',
    bulk: false,
  },
  discount: {
    label: 'Discount',
    plural: 'Discounts',
    icon: IconPromo,
    tone: 'border-danger/45 bg-danger/12 text-danger',
    bulk: false,
  },
  interment: {
    label: 'Interment',
    plural: 'Interments',
    icon: IconBurials,
    tone: 'border-green/45 bg-green/12 text-green',
    bulk: false,
  },
  payout_run: {
    label: 'Payout',
    plural: 'Payouts',
    icon: IconPayout,
    tone: 'border-ink/25 bg-ink/8 text-ink',
    bulk: false,
  },
  ownership_transfer: {
    label: 'Transfer',
    plural: 'Transfers',
    icon: IconTransfer,
    tone: 'border-line bg-surface-2 text-muted',
    bulk: false,
  },
}

/** Tab order — the cheap, frequent decisions first. */
export const KIND_ORDER: ApprovalKind[] = [
  'hold',
  'contract',
  'discount',
  'interment',
  'payout_run',
  'ownership_transfer',
]

// ── resolvers ────────────────────────────────────────────────────────

export const lotCodeOf = (lot: Lot | null | undefined): string =>
  lot
    ? formatLotCode(indexes().blocksById.get(lot.blockId)?.code ?? 'B??', lot.lotNumber)
    : '—'

export const lotOf = (lotId: LotId | null | undefined): Lot | null =>
  lotId ? (indexes().lotsById.get(lotId) ?? null) : null

export const lotCodeById = (lotId: LotId | null | undefined): string =>
  lotCodeOf(lotOf(lotId))

export const userName = (id: UserId | null | undefined): string => {
  if (!id) return 'Someone'
  return indexes().usersById.get(id)?.fullName ?? 'A former colleague'
}

export const clientName = (id: ClientId | null | undefined): string | null => {
  if (!id) return null
  const c = indexes().clientsById.get(id)
  return c ? clientFullName(c) : null
}

export const tierNameOf = (lot: Lot | null | undefined): string =>
  lot ? (indexes().tiersById.get(lot.tierId)?.name ?? '—') : '—'

/** Agent display name from an agent profile id. */
export const agentDisplayName = (agentId: string | null | undefined): string => {
  if (!agentId) return '—'
  const a = indexes().agentsById.get(asId<'Agent'>(agentId))
  if (!a) return '—'
  return indexes().usersById.get(a.userId)?.fullName ?? a.agentCode
}

export const contractOf = (id: string) =>
  indexes().contractsById.get(asId<'Contract'>(id)) ?? null

export const holdOf = (id: string) =>
  dataset().holds.find((h) => h.id === id) ?? null

export const intermentOf = (id: string) =>
  indexes().intermentsById.get(asId<'Interment'>(id)) ?? null

export const runOf = (id: string) =>
  indexes().payoutRunsById.get(asId<'PayoutRun'>(id)) ?? null

export const transferOf = (id: string) =>
  dataset().transfers.find((t) => t.id === id) ?? null

// ── interment requirements ───────────────────────────────────────────

export const REQUIREMENT_LABEL: Record<keyof IntermentRequirements, string> = {
  deathCertificate: 'Death certificate',
  burialPermit: 'Burial permit',
  transferPermit: 'Transfer permit',
  ownerConsent: 'Owner consent',
  feesSettled: 'Fees settled',
}
