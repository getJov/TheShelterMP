import { create } from 'zustand'
import {
  asId,
  HOLD_DURATION_DAYS,
  OWNERSHIP_TRANSFER_FEE,
  TRUST_FUND_RATE_PERCENT,
  clientFullName,
  formatLotCode,
  type ApprovalStatus,
  type Centavos,
  type ClientId,
  type CommissionEntry,
  type Contract,
  type ContractId,
  type Hold,
  type HoldId,
  type Installment,
  type ISODate,
  type ISODateTime,
  type LotId,
  type NeedType,
  type OwnershipTransfer,
  type Payment,
  type PaymentId,
  type PaymentMethod,
  type PaymentMode,
  type PriceId,
  type ServiceId,
  type ServiceLine,
  type TransferId,
  type TrustFundEntry,
  type User,
  type UserId,
} from '@/domain'
import { dataset, indexes, useDataset } from './dataset'
import { useNotifications } from './notifications'
import { NOW, TODAY } from '@/mock'
import { addDays } from '@/lib/dates'
import { pctOf } from '@/lib/money'
import { balanceOf, postedPaymentsOf, scheduleOf } from '@/lib/finance'
import { applyPayment, buildSchedule, refreshScheduleStatuses } from '@/lib/amortization'
import { accrueCommission, splitPreview, voidCommissionFor } from '@/lib/commission'

/**
 * Sales & payments transactions.
 *
 * Every action mutates the dataset arrays in one pass, calls
 * `useDataset.getState().touch()`, writes an AuditEvent and emits the
 * notifications the client asked for. Nothing here recomputes money — the
 * finance, amortization, commission and price-resolver layers own that.
 */

// ── local id sequences ───────────────────────────────────────────────
let seq = 0
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(++seq).toString(36)}`

/** Build an ISO timestamp on a given date, at the frozen clock's time of day. */
const at = (date: ISODate): ISODateTime => `${date}T${NOW.slice(11)}`

function nextContractNo(year: string) {
  const nums = dataset()
    .contracts.filter((c) => c.contractNo.startsWith(`TSM-${year}-`))
    .map((c) => Number(c.contractNo.slice(-5)))
    .filter(Number.isFinite)
  const n = (nums.length ? Math.max(...nums) : 0) + 1
  return {
    contractNo: `TSM-${year}-${String(n).padStart(5, '0')}`,
    id: asId<'Contract'>(`ctr_${year}_${String(n).padStart(5, '0')}`),
  }
}

export function nextOrNo(): string {
  const nums = dataset()
    .payments.map((p) => Number(p.orNo.replace(/\D/g, '')))
    .filter(Number.isFinite)
  return `OR-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(6, '0')}`
}

function nextCertificateNo(year: string) {
  const nums = dataset()
    .contracts.filter((c) => c.certificateNo?.startsWith(`COO-${year}-`))
    .map((c) => Number(c.certificateNo!.slice(-4)))
    .filter(Number.isFinite)
  return `COO-${year}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`
}

function audit(
  actorUserId: UserId,
  action: string,
  entityType: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  dataset().audit.unshift({
    id: asId<'Audit'>(uid('aud')),
    actorUserId,
    action,
    entityType,
    entityId,
    before,
    after,
    at: NOW,
  })
}

const notifications = () => useNotifications.getState()

/** Managers bound to a lot's location — the people a hold request must reach. */
export function managersOfLocation(locationId: string): User[] {
  return dataset().users.filter(
    (u) =>
      u.role === 'manager' &&
      u.status === 'active' &&
      (u.locationIds.length === 0 || u.locationIds.includes(locationId as never)),
  )
}

const lotLabel = (lotId: LotId): string => {
  const lot = indexes().lotsById.get(lotId)
  if (!lot) return '—'
  const block = indexes().blocksById.get(lot.blockId)
  return formatLotCode(block?.code ?? '??', lot.lotNumber)
}

const clientLabel = (clientId: ClientId | null, prospectName: string | null): string => {
  if (clientId) {
    const c = indexes().clientsById.get(clientId)
    if (c) return clientFullName(c)
  }
  return prospectName ?? 'Walk-in prospect'
}

const userOfAgent = (agentId: string | null): User | null => {
  if (!agentId) return null
  const a = indexes().agentsById.get(agentId as never)
  if (!a) return null
  return indexes().usersById.get(a.userId) ?? null
}

/** Close any pending approval task pointing at an entity. */
function closeApprovals(
  entityId: string,
  decision: Exclude<ApprovalStatus, 'pending'>,
  deciderId: UserId,
  note: string | null,
) {
  for (const task of dataset().approvals) {
    if (task.entityId !== entityId || task.status !== 'pending') continue
    task.status = decision
    task.decidedByUserId = deciderId
    task.decidedAt = NOW
    task.decisionNote = note
    task.updatedAt = NOW
  }
}

// ── pure previews, shared with the dialogs ───────────────────────────
export interface PaymentPreview {
  amountCentavos: Centavos
  appliedNos: number[]
  appliedRows: { installmentNo: number; dueDate: ISODate; appliedCentavos: Centavos }[]
  overpaymentCentavos: Centavos
  previousOutstandingCentavos: Centavos
  newOutstandingCentavos: Centavos
  trustFundCentavos: Centavos
  commissions: ReturnType<typeof splitPreview>
  commissionTotalCentavos: Centavos
  settlesContract: boolean
}

/** Non-mutating dry run of postPayment — powers the live preview strip. */
export function previewPayment(
  contract: Contract,
  amountCentavos: Centavos,
  paidAt: ISODate,
): PaymentPreview {
  const before = scheduleOf(contract.id)
  const clone: Installment[] = before.map((i) => ({ ...i }))
  const { appliedNos } = applyPayment(clone, amountCentavos, paidAt)

  const appliedRows = appliedNos.map((no) => {
    const b = before.find((i) => i.installmentNo === no)!
    const a = clone.find((i) => i.installmentNo === no)!
    return {
      installmentNo: no,
      dueDate: a.dueDate,
      appliedCentavos: a.amountPaidCentavos - b.amountPaidCentavos,
    }
  })

  const bal = balanceOf(contract)
  const newOutstanding = Math.max(0, bal.outstandingCentavos - amountCentavos)
  const commissions = splitPreview(
    amountCentavos,
    contract,
    dataset().commissionRules,
    paidAt,
  )

  return {
    amountCentavos,
    appliedNos,
    appliedRows,
    // A credit only exists against the CONTRACT balance — a spot-cash
    // contract has no schedule, so the schedule's leftover is meaningless.
    overpaymentCentavos: Math.max(0, amountCentavos - bal.outstandingCentavos),
    previousOutstandingCentavos: bal.outstandingCentavos,
    newOutstandingCentavos: newOutstanding,
    // ADDITIVE accrual — never deducted from the balance or the basis.
    trustFundCentavos: pctOf(amountCentavos, TRUST_FUND_RATE_PERCENT),
    commissions,
    commissionTotalCentavos: commissions.reduce((s, c) => s + c.amountCentavos, 0),
    settlesContract: newOutstanding <= 0 && amountCentavos > 0,
  }
}

export interface CancelConsequences {
  lotCode: string
  toVoid: { count: number; centavos: Centavos }
  toClawback: { count: number; centavos: Centavos }
  trustFundRetainedCentavos: Centavos
  paidCentavos: Centavos
}

/** Real counts, computed live before the confirm button is pressed. */
export function cancelConsequences(contract: Contract): CancelConsequences {
  const entries = dataset().commissions.filter((c) => c.contractId === contract.id)
  const released = entries.filter((c) => c.status === 'released')
  const unreleased = entries.filter(
    (c) => c.status !== 'released' && c.status !== 'voided' && c.status !== 'clawback_pending',
  )
  const trust = dataset()
    .trustFund.filter((e) => e.contractId === contract.id)
    .reduce((s, e) => s + e.amountCentavos, 0)

  return {
    lotCode: lotLabel(contract.lotId),
    toVoid: {
      count: unreleased.length,
      centavos: unreleased.reduce((s, c) => s + c.amountCentavos, 0),
    },
    toClawback: {
      count: released.length,
      centavos: released.reduce((s, c) => s + c.amountCentavos, 0),
    },
    trustFundRetainedCentavos: trust,
    paidCentavos: balanceOf(contract).paidCentavos,
  }
}

// ── store ────────────────────────────────────────────────────────────
export interface ContractDraft {
  lotId: LotId
  clientId: ClientId
  coOwnerClientId: ClientId | null
  needType: NeedType
  paymentMode: PaymentMode
  termMonths: number | null
  signedAt: ISODate
  agentId: string
  priceBookEntryId: PriceId
  listPriceCentavos: Centavos
  discountCentavos: Centavos
  discountReason: string | null
  serviceLines: {
    serviceId: ServiceId
    description: string
    quantity: number
    unitAmountCentavos: Centavos
  }[]
}

export interface PostPaymentInput {
  contractId: ContractId
  amountCentavos: Centavos
  method: PaymentMethod
  referenceNo: string | null
  paidAt: ISODate
  orNo?: string
}

export interface PostPaymentResult {
  paymentId: PaymentId
  orNo: string
  trustFundCentavos: Centavos
  commissions: CommissionEntry[]
  certificateNo: string | null
}

interface SalesStore {
  version: number
  ready: boolean
  init: () => void

  requestHold: (input: {
    lotId: LotId
    clientId: ClientId | null
    prospectName: string | null
    note: string | null
    actor: User
  }) => { hold: Hold; managers: User[] } | { error: string }

  decideHold: (
    holdId: HoldId,
    decision: 'approved' | 'rejected',
    actor: User,
    note?: string,
  ) => Hold | null

  releaseHold: (holdId: HoldId, actor: User, reason?: string) => void
  expireStaleHolds: (asOf?: ISODate) => number

  createContract: (draft: ContractDraft, actor: User) => ContractId
  approveContract: (contractId: ContractId, actor: User) => void
  cancelContract: (contractId: ContractId, reason: string, actor: User) => void

  postPayment: (input: PostPaymentInput, actor: User) => PostPaymentResult | { error: string }
  voidPayment: (paymentId: PaymentId, reason: string, actor: User) => void
  issueCertificate: (contractId: ContractId, actor: User) => string | null

  requestTransfer: (
    input: { contractId: ContractId; toClientId: ClientId; reason: string },
    actor: User,
  ) => OwnershipTransfer | { error: string }
  decideTransfer: (
    id: TransferId,
    decision: 'approved' | 'rejected',
    actor: User,
    note?: string,
  ) => void
}

export const useSales = create<SalesStore>((set, get) => ({
  version: 0,
  ready: false,

  init: () => {
    if (get().ready) return
    get().expireStaleHolds(TODAY)
    set({ ready: true })
  },

  // ── holds ──────────────────────────────────────────────────────────
  requestHold: ({ lotId, clientId, prospectName, note, actor }) => {
    const lot = indexes().lotsById.get(lotId)
    if (!lot) return { error: 'That lot no longer exists.' }
    if (lot.status !== 'available') {
      return {
        error: `This lot is ${lot.status.replace(/_/g, ' ')} — only available lots can be held.`,
      }
    }

    const hold: Hold = {
      id: asId<'Hold'>(uid('hld')),
      lotId,
      locationId: lot.locationId,
      requestedByUserId: actor.id,
      clientId,
      prospectName,
      status: 'pending',
      requestedAt: NOW,
      expiresAt: at(addDays(TODAY, HOLD_DURATION_DAYS)),
      decidedByUserId: null,
      decidedAt: null,
      decisionNote: note ?? null,
      convertedContractId: null,
      createdAt: NOW,
      updatedAt: NOW,
    }

    dataset().holds.unshift(hold)
    lot.status = 'held'
    lot.activeHoldId = hold.id
    lot.updatedAt = NOW

    const who = clientLabel(clientId, prospectName)
    const code = lotLabel(lotId)

    notifications().createApproval({
      kind: 'hold',
      entityId: hold.id,
      locationId: lot.locationId,
      title: `Hold on ${code}`,
      summary: `${actor.fullName} is holding ${code} for ${who}.`,
      requestedByUserId: actor.id,
      requestedAt: NOW,
    })

    // The client's explicit requirement: the manager of THAT lot's location.
    notifications().notifyRole(
      'manager',
      lot.locationId,
      'hold_requested',
      `Hold requested on ${code}`,
      `${actor.fullName} requested a ${HOLD_DURATION_DAYS}-day hold for ${who}.`,
      '/approvals',
    )

    audit(actor.id, 'hold.requested', 'Hold', hold.id, null, {
      lotId,
      clientId,
      prospectName,
    })
    useDataset.getState().touch()
    set({ version: get().version + 1 })

    return { hold, managers: managersOfLocation(lot.locationId) }
  },

  decideHold: (holdId, decision, actor, note) => {
    const hold = dataset().holds.find((h) => h.id === holdId)
    if (!hold || hold.status !== 'pending') return null
    const before = { status: hold.status }

    hold.status = decision
    hold.decidedByUserId = actor.id
    hold.decidedAt = NOW
    hold.decisionNote = note ?? null
    hold.updatedAt = NOW

    const lot = indexes().lotsById.get(hold.lotId)
    if (lot && decision === 'rejected' && lot.activeHoldId === hold.id) {
      lot.status = 'available'
      lot.activeHoldId = null
      lot.updatedAt = NOW
    }

    closeApprovals(hold.id, decision, actor.id, note ?? null)

    const code = lotLabel(hold.lotId)
    notifications().notify(
      [hold.requestedByUserId],
      'hold_decided',
      `Hold ${decision} — ${code}`,
      `${actor.fullName} ${decision} your hold request on ${code}.`,
      '/sales',
    )

    audit(
      actor.id,
      decision === 'approved' ? 'hold.approved' : 'hold.rejected',
      'Hold',
      hold.id,
      before,
      { status: hold.status },
    )
    useDataset.getState().touch()
    set({ version: get().version + 1 })
    return hold
  },

  releaseHold: (holdId, actor, reason) => {
    const hold = dataset().holds.find((h) => h.id === holdId)
    if (!hold || (hold.status !== 'pending' && hold.status !== 'approved')) return
    const before = { status: hold.status }

    hold.status = 'expired'
    hold.decisionNote = reason ?? 'Released manually'
    hold.updatedAt = NOW

    const lot = indexes().lotsById.get(hold.lotId)
    if (lot && lot.activeHoldId === hold.id) {
      lot.status = 'available'
      lot.activeHoldId = null
      lot.updatedAt = NOW
    }

    closeApprovals(hold.id, 'rejected', actor.id, 'Hold released')
    notifications().notify(
      [hold.requestedByUserId],
      'hold_decided',
      `Hold released — ${lotLabel(hold.lotId)}`,
      `${actor.fullName} released the hold. The lot is available again.`,
      '/sales',
    )

    audit(actor.id, 'hold.expired', 'Hold', hold.id, before, { status: 'expired' })
    useDataset.getState().touch()
    set({ version: get().version + 1 })
  },

  expireStaleHolds: (asOf = TODAY) => {
    let n = 0
    for (const hold of dataset().holds) {
      if (hold.status !== 'pending' && hold.status !== 'approved') continue
      if (hold.expiresAt.slice(0, 10) > asOf) continue

      hold.status = 'expired'
      hold.updatedAt = NOW
      const lot = indexes().lotsById.get(hold.lotId)
      if (lot && lot.activeHoldId === hold.id) {
        lot.status = 'available'
        lot.activeHoldId = null
        lot.updatedAt = NOW
      }
      for (const task of dataset().approvals) {
        if (task.entityId === hold.id && task.status === 'pending') {
          task.status = 'rejected'
          task.decisionNote = 'Hold expired before a decision was made.'
          task.decidedAt = NOW
          task.updatedAt = NOW
        }
      }
      notifications().notify(
        [hold.requestedByUserId],
        'hold_expiring',
        `Hold expired — ${lotLabel(hold.lotId)}`,
        'The hold lapsed and the lot has returned to available.',
        '/map',
      )
      audit(hold.requestedByUserId, 'hold.expired', 'Hold', hold.id, null, {
        status: 'expired',
      })
      n++
    }
    if (n > 0) {
      useDataset.getState().touch()
      set({ version: get().version + 1 })
    }
    return n
  },

  // ── contracts ──────────────────────────────────────────────────────
  createContract: (draft, actor) => {
    const d = dataset()
    const lot = indexes().lotsById.get(draft.lotId)!
    const agent = indexes().agentsById.get(draft.agentId as never)
    const year = draft.signedAt.slice(0, 4)
    const { contractNo, id } = nextContractNo(year)

    const servicesTotal = draft.serviceLines.reduce(
      (s, l) => s + l.unitAmountCentavos * l.quantity,
      0,
    )
    const contractPrice =
      draft.listPriceCentavos - draft.discountCentavos + servicesTotal

    // An agent's own paperwork, and ANY discount, needs a manager's signature.
    const needsApproval = actor.role === 'agent' || draft.discountCentavos > 0

    const contract: Contract = {
      id,
      contractNo,
      locationId: lot.locationId,
      lotId: draft.lotId,
      clientId: draft.clientId,
      coOwnerClientId: draft.coOwnerClientId,
      needType: draft.needType,
      paymentMode: draft.paymentMode,
      termMonths: draft.paymentMode === 'installment' ? draft.termMonths : null,
      priceBookEntryId: draft.priceBookEntryId,
      listPriceCentavos: draft.listPriceCentavos,
      discountCentavos: draft.discountCentavos,
      discountReason: draft.discountReason,
      servicesTotalCentavos: servicesTotal,
      contractPriceCentavos: contractPrice,
      status: needsApproval ? 'pending_approval' : 'active',
      agentId: asId<'Agent'>(draft.agentId),
      teamLeaderId: agent?.teamLeaderId ?? null,
      distributorId: agent?.distributorId ?? null,
      signedAt: draft.signedAt,
      approvedByUserId: needsApproval ? null : actor.id,
      approvedAt: needsApproval ? null : NOW,
      cancelledAt: null,
      cancelReason: null,
      certificateNo: null,
      certificateIssuedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    }
    d.contracts.push(contract)

    for (const line of draft.serviceLines) {
      const row: ServiceLine = {
        id: uid('svl'),
        contractId: id,
        serviceId: line.serviceId,
        description: line.description,
        quantity: line.quantity,
        unitAmountCentavos: line.unitAmountCentavos,
        totalCentavos: line.unitAmountCentavos * line.quantity,
        createdAt: NOW,
      }
      d.serviceLines.push(row)
    }

    if (contract.paymentMode === 'installment' && contract.termMonths) {
      const rows = buildSchedule({
        contractPriceCentavos: contractPrice,
        termMonths: contract.termMonths,
        signedAt: contract.signedAt,
      })
      for (const r of rows) {
        d.installments.push({
          ...r,
          id: `ins_${id}_${r.installmentNo}`,
          contractId: id,
          createdAt: NOW,
          updatedAt: NOW,
        })
      }
    }

    // Convert the hold that led here.
    if (lot.activeHoldId) {
      const hold = d.holds.find((h) => h.id === lot.activeHoldId)
      if (hold) {
        hold.status = 'converted'
        hold.convertedContractId = id
        hold.updatedAt = NOW
        closeApprovals(hold.id, 'approved', actor.id, `Converted to ${contractNo}`)
      }
    }
    lot.status = 'sold'
    lot.activeHoldId = null
    lot.currentContractId = id
    lot.currentOwnerClientId = draft.clientId
    lot.updatedAt = NOW

    const code = lotLabel(draft.lotId)
    if (needsApproval) {
      notifications().createApproval({
        kind: draft.discountCentavos > 0 ? 'discount' : 'contract',
        entityId: id,
        locationId: lot.locationId,
        title:
          draft.discountCentavos > 0
            ? `Discount on ${contractNo}`
            : `Contract ${contractNo}`,
        summary:
          draft.discountCentavos > 0
            ? `${draft.discountReason ?? 'Discount'} — requires approval before the contract activates.`
            : `${actor.fullName} drew up a contract on ${code}.`,
        requestedByUserId: actor.id,
        requestedAt: NOW,
      })
      notifications().notifyRole(
        'manager',
        lot.locationId,
        'contract_approved',
        `Contract ${contractNo} needs approval`,
        `${actor.fullName} created a contract on ${code}.`,
        '/approvals',
      )
    }

    audit(actor.id, 'contract.created', 'Contract', id, null, {
      contractNo,
      contractPriceCentavos: contractPrice,
      status: contract.status,
    })
    useDataset.getState().touch()
    set({ version: get().version + 1 })
    return id
  },

  approveContract: (contractId, actor) => {
    const contract = indexes().contractsById.get(contractId)
    if (!contract || contract.status !== 'pending_approval') return
    const before = { status: contract.status }

    contract.status = 'active'
    contract.approvedByUserId = actor.id
    contract.approvedAt = NOW
    contract.updatedAt = NOW

    closeApprovals(contract.id, 'approved', actor.id, null)

    const agentUser = userOfAgent(contract.agentId)
    if (agentUser) {
      notifications().notify(
        [agentUser.id],
        'contract_approved',
        `Contract ${contract.contractNo} approved`,
        `${actor.fullName} approved the contract on ${lotLabel(contract.lotId)}.`,
        '/sales',
      )
    }

    audit(actor.id, 'contract.approved', 'Contract', contract.id, before, {
      status: 'active',
    })
    useDataset.getState().touch()
    set({ version: get().version + 1 })
  },

  cancelContract: (contractId, reason, actor) => {
    const contract = indexes().contractsById.get(contractId)
    if (!contract || contract.status === 'cancelled') return
    const before = { status: contract.status }

    contract.status = 'cancelled'
    contract.cancelledAt = NOW
    contract.cancelReason = reason
    contract.updatedAt = NOW

    // Unreleased is voided; released becomes clawback_pending. ASSUMED policy.
    const entries = dataset().commissions.filter((c) => c.contractId === contract.id)
    const { voided, clawbackPending } = voidCommissionFor(entries)

    const lot = indexes().lotsById.get(contract.lotId)
    if (lot && lot.currentContractId === contract.id) {
      lot.status = 'available'
      lot.currentContractId = null
      lot.currentOwnerClientId = null
      lot.activeHoldId = null
      lot.updatedAt = NOW
    }

    closeApprovals(contract.id, 'rejected', actor.id, `Contract cancelled: ${reason}`)

    const agentUser = userOfAgent(contract.agentId)
    if (agentUser) {
      notifications().notify(
        [agentUser.id],
        'contract_approved',
        `Contract ${contract.contractNo} cancelled`,
        `${voided.length} commission ${voided.length === 1 ? 'entry' : 'entries'} voided, ${clawbackPending.length} flagged for clawback.`,
        '/sales',
      )
    }

    // The trust-fund accrual is RETAINED — never reversed on cancellation.
    audit(actor.id, 'contract.cancelled', 'Contract', contract.id, before, {
      status: 'cancelled',
      reason,
      commissionsVoided: voided.length,
      commissionsClawback: clawbackPending.length,
    })
    useDataset.getState().touch()
    set({ version: get().version + 1 })
  },

  // ── payments ───────────────────────────────────────────────────────
  postPayment: (input, actor) => {
    const contract = indexes().contractsById.get(input.contractId)
    if (!contract) return { error: 'Contract not found.' }
    if (contract.status === 'cancelled')
      return { error: 'This contract is cancelled — no payment can be posted.' }
    if (contract.status === 'pending_approval')
      return { error: 'Approve the contract before posting a payment.' }
    if (input.amountCentavos <= 0) return { error: 'Enter an amount greater than zero.' }
    if (input.paidAt > TODAY) return { error: 'A payment cannot be dated in the future.' }

    const d = dataset()
    const schedule = scheduleOf(contract.id)
    const { appliedNos } = applyPayment(schedule, input.amountCentavos, input.paidAt)
    refreshScheduleStatuses(schedule, TODAY)
    for (const inst of schedule) inst.updatedAt = NOW

    const payment: Payment = {
      id: asId<'Payment'>(uid('pay')),
      contractId: contract.id,
      orNo: input.orNo?.trim() || nextOrNo(),
      amountCentavos: input.amountCentavos,
      method: input.method,
      referenceNo: input.referenceNo,
      paidAt: input.paidAt,
      postedAt: at(input.paidAt),
      receivedByUserId: actor.id,
      appliedInstallmentNos: appliedNos,
      // ADDITIVE: 20% accrues to perpetual care. Nothing is deducted.
      trustFundCentavos: pctOf(input.amountCentavos, TRUST_FUND_RATE_PERCENT),
      status: 'posted',
      voidReason: null,
      createdAt: NOW,
      updatedAt: NOW,
    }
    d.payments.push(payment)

    const running =
      d.trustFund.reduce((s, e) => s + e.amountCentavos, 0) + payment.trustFundCentavos
    const tfe: TrustFundEntry = {
      id: `tfe_${payment.id}`,
      paymentId: payment.id,
      contractId: contract.id,
      locationId: contract.locationId,
      amountCentavos: payment.trustFundCentavos,
      runningBalanceCentavos: running,
      postedAt: payment.postedAt,
    }
    d.trustFund.push(tfe)

    // Commission is earned ON COLLECTION — never at signing.
    const entries = accrueCommission(payment, contract, d.commissionRules)
    d.commissions.push(...entries)

    contract.updatedAt = NOW
    useDataset.getState().touch()

    // Certificate is issued ONLY when the balance reaches zero.
    let certificateNo: string | null = null
    if (balanceOf(contract).outstandingCentavos <= 0) {
      contract.status = 'fully_paid'
      certificateNo = get().issueCertificate(contract.id, actor)
    }

    notifications().notifyRole(
      'manager',
      contract.locationId,
      'payment_posted',
      `Payment posted — ${contract.contractNo}`,
      `${payment.orNo} · ${lotLabel(contract.lotId)}${certificateNo ? ' · contract fully paid' : ''}`,
      '/sales',
    )
    const agentUser = userOfAgent(contract.agentId)
    if (agentUser && agentUser.id !== actor.id) {
      notifications().notify(
        [agentUser.id],
        'payment_posted',
        `Payment on ${contract.contractNo}`,
        `Commission accrued on ${payment.orNo}.`,
        '/sales',
      )
    }

    audit(actor.id, 'payment.posted', 'Payment', payment.id, null, {
      orNo: payment.orNo,
      amountCentavos: payment.amountCentavos,
      trustFundCentavos: payment.trustFundCentavos,
      commissionEntries: entries.length,
    })
    useDataset.getState().touch()
    set({ version: get().version + 1 })

    return {
      paymentId: payment.id,
      orNo: payment.orNo,
      trustFundCentavos: payment.trustFundCentavos,
      commissions: entries,
      certificateNo,
    }
  },

  voidPayment: (paymentId, reason, actor) => {
    const payment = indexes().paymentsById.get(paymentId)
    if (!payment || payment.status === 'void') return
    const contract = indexes().contractsById.get(payment.contractId)
    if (!contract) return

    payment.status = 'void'
    payment.voidReason = reason
    payment.updatedAt = NOW

    // Rebuild the schedule from the payments that remain posted.
    const schedule = scheduleOf(contract.id)
    for (const inst of schedule) {
      inst.amountPaidCentavos = 0
      inst.status = 'upcoming'
      inst.updatedAt = NOW
    }
    const remaining = postedPaymentsOf(contract.id)
      .slice()
      .sort((a, b) => (a.paidAt === b.paidAt ? (a.id < b.id ? -1 : 1) : a.paidAt < b.paidAt ? -1 : 1))
    for (const p of remaining) {
      const { appliedNos } = applyPayment(schedule, p.amountCentavos, p.paidAt)
      p.appliedInstallmentNos = appliedNos
    }
    refreshScheduleStatuses(schedule, TODAY)

    // Reverse the trust-fund entry and restate the running balances.
    const d = dataset()
    d.trustFund = d.trustFund.filter((e) => e.paymentId !== payment.id)
    let running = 0
    for (const e of [...d.trustFund].sort((a, b) => (a.postedAt < b.postedAt ? -1 : 1))) {
      running += e.amountCentavos
      e.runningBalanceCentavos = running
    }

    // Unreleased commission is voided; released is flagged for clawback.
    const entries = d.commissions.filter((c) => c.paymentId === payment.id)
    const { voided, clawbackPending } = voidCommissionFor(entries)

    if (contract.status === 'fully_paid') {
      contract.status = 'active'
      contract.certificateNo = null
      contract.certificateIssuedAt = null
      contract.updatedAt = NOW
    }

    audit(actor.id, 'payment.voided', 'Payment', payment.id, { status: 'posted' }, {
      status: 'void',
      reason,
      commissionsVoided: voided.length,
      commissionsClawback: clawbackPending.length,
    })
    useDataset.getState().touch()
    set({ version: get().version + 1 })
  },

  issueCertificate: (contractId, actor) => {
    const contract = indexes().contractsById.get(contractId)
    if (!contract) return null
    // No override: a certificate exists only on a zero balance.
    if (balanceOf(contract).outstandingCentavos > 0) return null
    if (contract.certificateNo) return contract.certificateNo

    contract.status = 'fully_paid'
    contract.certificateIssuedAt = TODAY
    contract.certificateNo = nextCertificateNo(TODAY.slice(0, 4))
    contract.updatedAt = NOW

    audit(actor.id, 'certificate.issued', 'Contract', contract.id, null, {
      certificateNo: contract.certificateNo,
    })
    useDataset.getState().touch()
    set({ version: get().version + 1 })
    return contract.certificateNo
  },

  // ── ownership transfer ─────────────────────────────────────────────
  requestTransfer: ({ contractId, toClientId, reason }, actor) => {
    const contract = indexes().contractsById.get(contractId)
    if (!contract) return { error: 'Contract not found.' }
    if (contract.status === 'cancelled')
      return { error: 'A cancelled contract cannot be transferred.' }
    if (contract.clientId === toClientId)
      return { error: 'The new owner must be different from the current owner.' }

    const transfer: OwnershipTransfer = {
      id: asId<'Transfer'>(uid('trf')),
      lotId: contract.lotId,
      contractId: contract.id,
      fromClientId: contract.clientId,
      toClientId,
      reason,
      feeCentavos: OWNERSHIP_TRANSFER_FEE,
      status: 'pending',
      requestedByUserId: actor.id,
      requestedAt: NOW,
      decidedByUserId: null,
      decidedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    }
    dataset().transfers.unshift(transfer)

    const code = lotLabel(contract.lotId)
    notifications().createApproval({
      kind: 'ownership_transfer',
      entityId: transfer.id,
      locationId: contract.locationId,
      title: `Ownership transfer — ${code}`,
      summary: `${clientLabel(contract.clientId, null)} → ${clientLabel(toClientId, null)}. ${reason}`,
      requestedByUserId: actor.id,
      requestedAt: NOW,
    })
    notifications().notifyRole(
      'admin',
      null,
      'hold_requested',
      `Ownership transfer requested — ${code}`,
      `${actor.fullName} filed a change of ownership on ${contract.contractNo}.`,
      '/approvals',
    )

    audit(actor.id, 'transfer.requested', 'Transfer', transfer.id, null, {
      from: contract.clientId,
      to: toClientId,
    })
    useDataset.getState().touch()
    set({ version: get().version + 1 })
    return transfer
  },

  decideTransfer: (id, decision, actor, note) => {
    const transfer = dataset().transfers.find((t) => t.id === id)
    if (!transfer || transfer.status !== 'pending') return

    transfer.status = decision
    transfer.decidedByUserId = actor.id
    transfer.decidedAt = NOW
    transfer.updatedAt = NOW

    if (decision === 'approved') {
      const contract = indexes().contractsById.get(transfer.contractId)
      const lot = indexes().lotsById.get(transfer.lotId)
      if (contract) {
        contract.clientId = transfer.toClientId
        contract.updatedAt = NOW
      }
      if (lot) {
        lot.currentOwnerClientId = transfer.toClientId
        lot.updatedAt = NOW
      }
    }

    closeApprovals(transfer.id, decision, actor.id, note ?? null)
    notifications().notify(
      [transfer.requestedByUserId],
      'hold_decided',
      `Ownership transfer ${decision}`,
      `${lotLabel(transfer.lotId)} — ${actor.fullName} ${decision} the request.`,
      '/sales',
    )

    audit(actor.id, 'transfer.approved', 'Transfer', transfer.id, null, { decision })
    useDataset.getState().touch()
    set({ version: get().version + 1 })
  },
}))
