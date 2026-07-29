import { useMemo } from 'react'
import {
  clientFullName,
  deceasedFullName,
  formatLotCode,
  type AgentProfile,
  type Block,
  type Centavos,
  type Client,
  type CommissionEntry,
  type CommissionLevel,
  type Contract,
  type Hold,
  type ISODateTime,
  type Installment,
  type Interment,
  type Lot,
  type LotId,
  type Payment,
  type PaymentHealth,
  type ServiceLine,
  type Tier,
  type User,
  type UserId,
} from '@/domain'
import { indexes, useDataset } from '@/stores/dataset'
import { balanceOf, contractForLot, paymentHealth, type Balance } from '@/lib/finance'
import { overdueInstallments } from '@/lib/amortization'
import { splitPreview } from '@/lib/commission'
import { resolvePrice, type ResolvedPrice } from '@/lib/price-resolver'
import { lotCapacityRemaining } from '@/stores/burials'
import { formatPeso, sumCentavos } from '@/lib/money'
import { diffDays } from '@/lib/dates'
import { buildRow, expectedDocuments, type ContractRow, type DocumentSlot } from '@/features/sales/lib'
import { TODAY } from '@/mock'

/**
 * The drawer's read model.
 *
 * Every money figure here is lifted from `@/lib/finance`, `@/lib/commission`
 * or `@/lib/price-resolver`. Nothing in this feature computes a balance, a
 * health state, a commission or a price — two implementations of "amount
 * outstanding" would diverge and the client would find it.
 */

export interface TimelineEvent {
  id: string
  at: ISODateTime
  label: string
  actor: string | null
  tone: 'gold' | 'green' | 'danger' | 'muted'
}

export interface UplineRow {
  level: CommissionLevel
  agent: AgentProfile | null
  name: string
  ratePercent: number
  earnedCentavos: Centavos
  toAccrueCentavos: Centavos
  archived: boolean
}

export interface LotModel {
  lot: Lot
  block: Block | null
  tier: Tier | null
  code: string
  footprint: string
  intermentSummary: string

  // ── contract & money — all imported ────────────────────────────────
  contract: Contract | null
  row: ContractRow | null
  balance: Balance | null
  health: PaymentHealth
  schedule: Installment[]
  ledger: Payment[]
  recentPayments: Payment[]
  overdue: Installment[]
  overdueCentavos: Centavos
  serviceLines: ServiceLine[]
  trustFundCentavos: Centavos

  client: Client | null
  coOwner: Client | null

  // ── attribution ───────────────────────────────────────────────────
  agent: AgentProfile | null
  agentUser: User | null
  upline: UplineRow[]
  commissionEntries: CommissionEntry[]
  commissionEarnedCentavos: Centavos

  // ── hold ──────────────────────────────────────────────────────────
  hold: Hold | null
  holdRequester: User | null
  holdFor: string
  holdDaysLeft: number

  // ── burials ───────────────────────────────────────────────────────
  interments: Interment[]
  capacityRemaining: number

  documents: DocumentSlot[]
  history: TimelineEvent[]

  // ── price, for available lots ──────────────────────────────────────
  preNeed: ResolvedPrice
  atNeed: ResolvedPrice
  preNeedInstallment: ResolvedPrice
}

const EMPTY_PRICE: ResolvedPrice = {
  amountCentavos: null,
  entry: null,
  listEntry: null,
  savingCentavos: 0,
  isPromo: false,
  label: null,
}

const userName = (id: UserId | null | undefined): string | null =>
  id ? (indexes().usersById.get(id)?.fullName ?? null) : null

export function useLotModel(lot: Lot): LotModel {
  const version = useDataset((s) => s.version)
  const prices = useDataset((s) => s.data.prices)
  const rules = useDataset((s) => s.data.commissionRules)

  return useMemo(() => {
    void version
    const idx = indexes()
    const block = idx.blocksById.get(lot.blockId) ?? null
    const tier = idx.tiersById.get(lot.tierId) ?? null

    // ── contract ─────────────────────────────────────────────────────
    const contract = contractForLot(lot)
    const row = contract ? buildRow(contract) : null
    const balance = contract ? balanceOf(contract) : null
    const health = contract ? paymentHealth(contract, TODAY) : 'not_applicable'
    const schedule = contract
      ? [...(idx.installmentsByContract.get(contract.id) ?? [])].sort(
          (a, b) => a.installmentNo - b.installmentNo,
        )
      : []
    const ledger = contract
      ? [...(idx.paymentsByContract.get(contract.id) ?? [])].sort((a, b) =>
          a.paidAt === b.paidAt ? (a.orNo < b.orNo ? 1 : -1) : a.paidAt < b.paidAt ? 1 : -1,
        )
      : []
    const overdue = overdueInstallments(schedule, TODAY)
    const serviceLines = contract
      ? (idx.serviceLinesByContract.get(contract.id) ?? [])
      : []

    const client = contract ? (idx.clientsById.get(contract.clientId) ?? null) : null
    const coOwner =
      contract?.coOwnerClientId ? (idx.clientsById.get(contract.coOwnerClientId) ?? null) : null

    // ── attribution ──────────────────────────────────────────────────
    const agent = contract ? (idx.agentsById.get(contract.agentId) ?? null) : null
    const agentUser = agent ? (idx.usersById.get(agent.userId) ?? null) : null

    const commissionEntries = contract
      ? useDataset.getState().data.commissions.filter((c) => c.contractId === contract.id)
      : []

    // Rates and the split come from @/lib/commission — never restated here.
    const earnedSplit = contract && balance
      ? splitPreview(balance.paidCentavos, contract, rules, TODAY)
      : []
    const remainingSplit = contract && balance
      ? splitPreview(balance.outstandingCentavos, contract, rules, TODAY)
      : []

    const upline: UplineRow[] = earnedSplit.map((s) => {
      const a = idx.agentsById.get(s.agentId) ?? null
      const live = commissionEntries.filter(
        (e) => e.level === s.level && e.status !== 'voided',
      )
      return {
        level: s.level,
        agent: a,
        name: a ? (idx.usersById.get(a.userId)?.fullName ?? a.agentCode) : '—',
        ratePercent: s.ratePercent,
        // Posted entries are the truth; the preview covers levels with none yet.
        earnedCentavos: live.length
          ? sumCentavos(live.map((e) => e.amountCentavos))
          : s.amountCentavos,
        toAccrueCentavos:
          remainingSplit.find((r) => r.level === s.level)?.amountCentavos ?? 0,
        archived: a?.status === 'archived',
      }
    })

    // ── hold ─────────────────────────────────────────────────────────
    const hold = lot.activeHoldId ? (idx.holdsById.get(lot.activeHoldId) ?? null) : null
    const holdRequester = hold ? (idx.usersById.get(hold.requestedByUserId) ?? null) : null
    const holdClient = hold?.clientId ? idx.clientsById.get(hold.clientId) : null
    const holdFor = holdClient
      ? clientFullName(holdClient)
      : (hold?.prospectName ?? 'a walk-in prospect')

    // ── burials ──────────────────────────────────────────────────────
    const interments = [...(idx.intermentsByLot.get(lot.id as string) ?? [])]
      .filter((i) => i.status !== 'cancelled')
      .sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : 1))

    const trustFundCentavos = contract
      ? sumCentavos(
          useDataset
            .getState()
            .data.trustFund.filter((e) => e.contractId === contract.id)
            .map((e) => e.amountCentavos),
        )
      : 0

    return {
      lot,
      block,
      tier,
      code: formatLotCode(block?.code ?? '??', lot.lotNumber),
      footprint: tier ? `${tier.widthM.toFixed(2)} × ${tier.lengthM.toFixed(2)} m` : '—',
      intermentSummary: `${lot.intermentCount} of ${lot.capacity} interments`,

      contract,
      row,
      balance,
      health,
      schedule,
      ledger,
      recentPayments: ledger.filter((p) => p.status === 'posted').slice(0, 3),
      overdue,
      // Remaining on each past-due installment — the schedule's own stored
      // figures, summed with the money layer's helper.
      overdueCentavos: sumCentavos(
        overdue.map((i) => Math.max(0, i.amountDueCentavos - i.amountPaidCentavos)),
      ),
      serviceLines,
      trustFundCentavos,

      client,
      coOwner,

      agent,
      agentUser,
      upline,
      commissionEntries,
      commissionEarnedCentavos: sumCentavos(
        commissionEntries.filter((e) => e.status !== 'voided').map((e) => e.amountCentavos),
      ),

      hold,
      holdRequester,
      holdFor,
      holdDaysLeft: hold ? diffDays(hold.expiresAt.slice(0, 10), TODAY) : 0,

      interments,
      capacityRemaining: lotCapacityRemaining(lot.id),

      documents: contract ? documentChecklist(contract, lot, interments) : [],
      history: buildHistory(lot, contract, interments),

      preNeed: tier
        ? resolvePrice(prices, tier.id, 'pre_need', 'spot_cash', TODAY)
        : EMPTY_PRICE,
      atNeed: tier
        ? resolvePrice(prices, tier.id, 'at_need', 'spot_cash', TODAY)
        : EMPTY_PRICE,
      preNeedInstallment: tier
        ? resolvePrice(prices, tier.id, 'pre_need', 'installment', TODAY)
        : EMPTY_PRICE,
    }
  }, [lot, version, prices, rules])
}

// ── documents ────────────────────────────────────────────────────────
/**
 * The contract checklist from spec 08, extended with the two papers that
 * belong to the LOT rather than the contract — the reservation form and the
 * burial permits. No uploads: file storage is a later phase.
 */
function documentChecklist(
  contract: Contract,
  lot: Lot,
  interments: Interment[],
): DocumentSlot[] {
  const idx = indexes()
  const holds = useDataset
    .getState()
    .data.holds.filter((h) => h.lotId === lot.id)
  const transfers = useDataset
    .getState()
    .data.transfers.filter((t) => t.contractId === contract.id)

  const reservation: DocumentSlot = {
    key: 'reservation',
    label: 'Reservation form',
    present: holds.length > 0,
    detail: holds.length
      ? `Hold filed by ${idx.usersById.get(holds[0]!.requestedByUserId)?.fullName ?? 'staff'}`
      : 'Lot was contracted without a recorded hold',
  }

  const permits: DocumentSlot[] = interments.map((i) => ({
    key: `permit-${i.id}`,
    label: `Burial permit — ${deceasedFullName(i)}`,
    present: i.requirements.burialPermit,
    detail: i.requirements.burialPermit ? 'On file' : 'Not on file',
  }))

  const transfer: DocumentSlot[] = transfers.length
    ? [
        {
          key: 'transfer',
          label: 'Transfer of ownership',
          present: transfers.some((t) => t.status === 'approved'),
          detail: `${transfers.length} filed · latest ${transfers[0]!.status}`,
        },
      ]
    : []

  return [reservation, ...expectedDocuments(contract), ...permits, ...transfer]
}

// ── history ──────────────────────────────────────────────────────────
/**
 * The lot's story, newest first. Built from the records themselves plus any
 * audit rows that describe something the records do not — a status or tier
 * change made in the map editor, for instance.
 */
const DERIVED_ACTIONS = new Set([
  'contract.created',
  'contract.approved',
  'contract.cancelled',
  'certificate.issued',
  'payment.posted',
  'payment.voided',
  'hold.requested',
  'hold.approved',
  'hold.rejected',
  'hold.expired',
  'interment.scheduled',
  'interment.completed',
  'transfer.approved',
])

const AUDIT_LABEL: Record<string, string> = {
  'lot.status_changed': 'Lot status changed',
  'lot.tier_changed': 'Lot type changed',
  'block.created': 'Block created',
  'overlay.published': 'Site plan published',
  'price.updated': 'Price book updated',
  'tier.updated': 'Lot type updated',
}

function buildHistory(
  lot: Lot,
  contract: Contract | null,
  interments: Interment[],
): TimelineEvent[] {
  const d = useDataset.getState().data
  const out: TimelineEvent[] = []
  const push = (
    id: string,
    at: ISODateTime | null | undefined,
    label: string,
    actor: string | null,
    tone: TimelineEvent['tone'],
  ) => {
    if (!at) return
    out.push({ id, at, label, actor, tone })
  }

  for (const h of d.holds.filter((x) => x.lotId === lot.id)) {
    push(
      `${h.id}-req`,
      h.requestedAt,
      'Hold requested',
      userName(h.requestedByUserId),
      'gold',
    )
    if (h.decidedAt)
      push(
        `${h.id}-dec`,
        h.decidedAt,
        h.status === 'approved' ? 'Hold approved' : `Hold ${h.status}`,
        userName(h.decidedByUserId),
        h.status === 'approved' ? 'green' : 'muted',
      )
  }

  if (contract) {
    push(
      `${contract.id}-created`,
      contract.createdAt,
      `Contract ${contract.contractNo} signed`,
      userName(contract.approvedByUserId),
      'gold',
    )
    push(
      `${contract.id}-approved`,
      contract.approvedAt,
      'Contract approved',
      userName(contract.approvedByUserId),
      'green',
    )
    for (const p of d.payments.filter((p) => p.contractId === contract.id)) {
      push(
        `${p.id}-posted`,
        p.postedAt,
        p.status === 'void'
          ? `Payment ${p.orNo} voided`
          : `Payment posted · ${formatPeso(p.amountCentavos)}`,
        userName(p.receivedByUserId),
        p.status === 'void' ? 'danger' : 'green',
      )
    }
    if (contract.certificateIssuedAt)
      push(
        `${contract.id}-cert`,
        `${contract.certificateIssuedAt}T09:00:00+08:00`,
        `Certificate ${contract.certificateNo} issued`,
        null,
        'green',
      )
    push(
      `${contract.id}-cancelled`,
      contract.cancelledAt,
      `Contract cancelled — ${contract.cancelReason ?? 'no reason given'}`,
      null,
      'danger',
    )
    for (const t of d.transfers.filter((t) => t.contractId === contract.id)) {
      push(
        `${t.id}-transfer`,
        t.decidedAt ?? t.requestedAt,
        `Ownership transfer ${t.status}`,
        userName(t.requestedByUserId),
        t.status === 'approved' ? 'green' : 'gold',
      )
    }
  }

  for (const i of interments) {
    push(
      `${i.id}-sched`,
      i.createdAt,
      `Interment scheduled — ${deceasedFullName(i)}`,
      userName(i.requestedByUserId),
      'gold',
    )
    const job = indexes().jobsByInterment.get(i.id)
    if (job?.completedAt)
      push(
        `${i.id}-done`,
        job.completedAt,
        `Interment completed — ${deceasedFullName(i)}`,
        userName(job.assignedToUserId),
        'green',
      )
  }

  const scoped = new Set<string>([lot.id as string])
  if (contract) scoped.add(contract.id as string)
  for (const h of d.holds.filter((x) => x.lotId === lot.id)) scoped.add(h.id as string)
  for (const i of interments) scoped.add(i.id as string)

  for (const a of d.audit) {
    if (!scoped.has(a.entityId)) continue
    if (DERIVED_ACTIONS.has(a.action)) continue
    push(
      a.id as string,
      a.at,
      AUDIT_LABEL[a.action] ?? a.action.replace(/[._]/g, ' '),
      userName(a.actorUserId),
      'muted',
    )
  }

  return out.sort((a, b) => (a.at < b.at ? 1 : -1))
}

/** Non-reactive lot lookup for the shell, which must render in one frame. */
export function lotById(id: LotId | null): Lot | null {
  return id ? (indexes().lotsById.get(id) ?? null) : null
}
