import {
  asId,
  type ApprovalTask,
  type ContractId,
  type HoldId,
  type IntermentId,
  type PayoutRunId,
  type TransferId,
  type User,
} from '@/domain'
import { dataset, indexes, useDataset } from '@/stores/dataset'
import { useNotifications } from '@/stores/notifications'
import { useSales } from '@/stores/sales'
import { useBurials } from '@/stores/burials'
import { useAgents } from '@/stores/agents'
import { record } from '@/lib/audit'
import { formatPeso } from '@/lib/money'
import { NOW } from '@/mock'

/**
 * The bridge between the approvals queue and the stores that own the
 * transitions.
 *
 * NOTHING here reimplements a transition. Approving a hold calls spec 08's
 * `decideHold`; approving an interment calls spec 12's `approveInterment`;
 * approving a payout run calls spec 11's `approveRun`. If this file ever
 * grows its own copy of a state machine, the queue and the feature screens
 * will start disagreeing and the whole thing becomes untrustworthy.
 *
 * The one thing that IS implemented here is Undo — no store models a reversal,
 * and the reversal is deliberately narrow: restore exactly the fields the
 * decision moved, put the task back in the queue, retract the notifications
 * the decision fired, and append (never erase) an audit event marked `undone`.
 */

export interface DecisionOutcome {
  ok: boolean
  /** Toast title. One per user action. */
  message: string
  description?: string
  /** Present only when the decision can be fully reversed. */
  undo?: () => void
}

const notifications = () => useNotifications.getState()

const snapshot = (): Set<string> => new Set(notifications().notificationIds())

const since = (before: Set<string>): string[] =>
  notifications().notificationIds().filter((id) => !before.has(id))

const touch = () => useDataset.getState().touch()

function lotCodeOf(lotId: string | null | undefined): string {
  if (!lotId) return 'the lot'
  const lot = indexes().lotsById.get(asId<'Lot'>(lotId))
  if (!lot) return 'the lot'
  const block = indexes().blocksById.get(lot.blockId)
  return `${block?.code ?? 'B??'}-L${String(lot.lotNumber).padStart(3, '0')}`
}

/** Close a task the owning store did not close itself. Idempotent. */
function ensureClosed(
  task: ApprovalTask,
  decision: 'approved' | 'rejected',
  actor: User,
  note?: string,
) {
  const live = dataset().approvals.find((a) => a.id === task.id)
  if (live && live.status === 'pending') {
    notifications().decideApproval(task.id, decision, actor.id, note)
  }
}

/**
 * Decide one task. Returns the toast copy and, for reversible approvals,
 * the undo closure.
 */
export function decide(
  task: ApprovalTask,
  decision: 'approved' | 'rejected',
  actor: User,
  note?: string,
): DecisionOutcome {
  switch (task.kind) {
    case 'hold':
      return decideHoldTask(task, decision, actor, note)
    case 'contract':
    case 'discount':
      return decideContractTask(task, decision, actor, note)
    case 'interment':
      return decideIntermentTask(task, decision, actor, note)
    case 'payout_run':
      return decidePayoutTask(task, decision, actor, note)
    case 'ownership_transfer':
      return decideTransferTask(task, decision, actor, note)
    default:
      return { ok: false, message: 'Nothing to decide here.' }
  }
}

// ── holds ────────────────────────────────────────────────────────────
function decideHoldTask(
  task: ApprovalTask,
  decision: 'approved' | 'rejected',
  actor: User,
  note?: string,
): DecisionOutcome {
  const holdId = asId<'Hold'>(task.entityId) as HoldId
  const hold = dataset().holds.find((h) => h.id === holdId)
  if (!hold) return { ok: false, message: 'That hold no longer exists.' }
  if (hold.status !== 'pending')
    return { ok: false, message: 'That hold has already been decided.' }

  const lotId = hold.lotId
  const code = lotCodeOf(lotId)
  const lot = indexes().lotsById.get(lotId)
  const holdBefore = {
    status: hold.status,
    decidedByUserId: hold.decidedByUserId,
    decidedAt: hold.decidedAt,
    decisionNote: hold.decisionNote,
  }
  const lotBefore = lot ? { status: lot.status, activeHoldId: lot.activeHoldId } : null
  const before = snapshot()

  const result = useSales.getState().decideHold(holdId, decision, actor, note)
  if (!result) return { ok: false, message: 'That hold has already been decided.' }
  const fired = since(before)

  if (decision === 'rejected') {
    return {
      ok: true,
      message: `Hold on ${code} rejected`,
      description: 'The lot is available again and the agent has been told why.',
    }
  }

  return {
    ok: true,
    message: `Hold on ${code} approved`,
    description: 'The agent has been notified. The lot stays held until it converts.',
    undo: () => {
      const live = dataset().holds.find((h) => h.id === holdId)
      if (live) Object.assign(live, holdBefore, { updatedAt: NOW })
      const liveLot = indexes().lotsById.get(lotId)
      if (liveLot && lotBefore) Object.assign(liveLot, lotBefore, { updatedAt: NOW })
      notifications().reopenApproval(task.id)
      notifications().dropNotifications(fired)
      record(actor.id, 'hold.approved', 'Hold', task.entityId, { status: 'approved' }, {
        status: 'pending',
        undone: true,
      })
      touch()
    },
  }
}

// ── contracts & discounts ────────────────────────────────────────────
function decideContractTask(
  task: ApprovalTask,
  decision: 'approved' | 'rejected',
  actor: User,
  note?: string,
): DecisionOutcome {
  const contractId = asId<'Contract'>(task.entityId) as ContractId
  const contract = indexes().contractsById.get(contractId)
  if (!contract) return { ok: false, message: 'That contract no longer exists.' }
  if (contract.status !== 'pending_approval')
    return { ok: false, message: `Contract ${contract.contractNo} is no longer awaiting approval.` }

  const contractNo = contract.contractNo
  const before = snapshot()

  if (decision === 'rejected') {
    // Rejecting a contract cancels it — commissions void, the lot frees.
    // Deliberately NOT undoable: too much moves for an eight-second window.
    useSales.getState().cancelContract(contractId, note ?? 'Rejected on approval', actor)
    ensureClosed(task, 'rejected', actor, note)
    return {
      ok: true,
      message: `Contract ${contractNo} rejected`,
      description: 'Cancelled, commissions voided and the lot returned to available.',
    }
  }

  const contractBefore = {
    status: contract.status,
    approvedByUserId: contract.approvedByUserId,
    approvedAt: contract.approvedAt,
  }
  useSales.getState().approveContract(contractId, actor)
  const fired = since(before)

  return {
    ok: true,
    message: `Contract ${contractNo} approved`,
    description: `${formatPeso(contract.contractPriceCentavos)} · the selling agent has been notified.`,
    undo: () => {
      const live = indexes().contractsById.get(contractId)
      if (live) Object.assign(live, contractBefore, { updatedAt: NOW })
      notifications().reopenApproval(task.id)
      notifications().dropNotifications(fired)
      record(actor.id, 'contract.approved', 'Contract', task.entityId, { status: 'active' }, {
        status: 'pending_approval',
        undone: true,
      })
      touch()
    },
  }
}

// ── interments ───────────────────────────────────────────────────────
function decideIntermentTask(
  task: ApprovalTask,
  decision: 'approved' | 'rejected',
  actor: User,
  note?: string,
): DecisionOutcome {
  const id = asId<'Interment'>(task.entityId) as IntermentId
  const interment = indexes().intermentsById.get(id)
  if (!interment) return { ok: false, message: 'That interment request no longer exists.' }
  if (interment.status !== 'requested')
    return { ok: false, message: 'That interment request has already been decided.' }

  const who = [interment.deceasedFirstName, interment.deceasedLastName]
    .filter(Boolean)
    .join(' ')
  const before = snapshot()

  if (decision === 'rejected') {
    useBurials.getState().rejectInterment(id, actor.id, note ?? 'Request rejected')
    ensureClosed(task, 'rejected', actor, note)
    return {
      ok: true,
      message: `Interment request for ${who} rejected`,
      description: 'The slot is free again and the requester has been told why.',
    }
  }

  const hadJobId = interment.groundsJobId
  useBurials.getState().approveInterment(id, actor.id)
  ensureClosed(task, 'approved', actor, note)
  const fired = since(before)

  return {
    ok: true,
    message: `Interment for ${who} approved`,
    description: 'Booked, and a grounds job has been raised.',
    undo: () => {
      const live = indexes().intermentsById.get(id)
      if (live) {
        // The approval created a grounds job; the reversal removes exactly that one.
        if (!hadJobId && live.groundsJobId) {
          const jobs = dataset().jobs
          const at = jobs.findIndex((j) => j.id === live.groundsJobId)
          if (at >= 0) jobs.splice(at, 1)
        }
        live.groundsJobId = hadJobId
        live.status = 'requested'
        live.updatedAt = NOW
      }
      notifications().reopenApproval(task.id)
      notifications().dropNotifications(fired)
      record(actor.id, 'interment.scheduled', 'Interment', task.entityId, {
        status: 'requested',
      }, { status: 'scheduled', undone: true })
      touch()
    },
  }
}

// ── payout runs ──────────────────────────────────────────────────────
function decidePayoutTask(
  task: ApprovalTask,
  decision: 'approved' | 'rejected',
  actor: User,
  note?: string,
): DecisionOutcome {
  const runId = asId<'PayoutRun'>(task.entityId) as PayoutRunId
  const run = indexes().payoutRunsById.get(runId)
  if (!run) return { ok: false, message: 'That payout run no longer exists.' }

  if (decision === 'rejected') {
    // No store models a rejected run — it goes back to the desk that closed
    // it, with the reason on the record.
    notifications().decideApproval(task.id, 'rejected', actor.id, note)
    record(actor.id, 'payout.approved', 'PayoutRun', task.entityId, { status: run.status }, {
      decision: 'rejected',
      reason: note ?? null,
      totalCentavos: run.totalCentavos,
    })
    touch()
    return {
      ok: true,
      message: 'Payout run sent back',
      description: `${formatPeso(run.totalCentavos)} held for revision.`,
    }
  }

  if (run.status !== 'pending_approval')
    return { ok: false, message: 'That payout run is no longer awaiting approval.' }

  const entries = useAgents.getState().runEntries(runId)
  const entryIds = entries.filter((e) => e.status === 'in_run').map((e) => e.id)
  const before = snapshot()

  useAgents.getState().approveRun(runId, actor.id)
  ensureClosed(task, 'approved', actor, note)
  const fired = since(before)

  return {
    ok: true,
    message: 'Payout run approved',
    description: `${formatPeso(run.totalCentavos)} cleared for release.`,
    undo: () => {
      const live = indexes().payoutRunsById.get(runId)
      if (live) {
        live.status = 'pending_approval'
        live.approvedByUserId = null
        live.approvedAt = null
        live.updatedAt = NOW
      }
      const ids = new Set<string>(entryIds as unknown as string[])
      for (const e of dataset().commissions) {
        if (ids.has(e.id as string) && e.status === 'approved') {
          e.status = 'in_run'
          e.updatedAt = NOW
        }
      }
      notifications().reopenApproval(task.id)
      notifications().dropNotifications(fired)
      record(actor.id, 'payout.approved', 'PayoutRun', task.entityId, {
        status: 'approved',
      }, { status: 'pending_approval', undone: true })
      touch()
    },
  }
}

// ── ownership transfers ──────────────────────────────────────────────
function decideTransferTask(
  task: ApprovalTask,
  decision: 'approved' | 'rejected',
  actor: User,
  note?: string,
): DecisionOutcome {
  const id = asId<'Transfer'>(task.entityId) as TransferId
  const transfer = dataset().transfers.find((t) => t.id === id)
  if (!transfer) return { ok: false, message: 'That transfer no longer exists.' }
  if (transfer.status !== 'pending')
    return { ok: false, message: 'That transfer has already been decided.' }

  const code = lotCodeOf(transfer.lotId)
  const contract = indexes().contractsById.get(transfer.contractId)
  const lot = indexes().lotsById.get(transfer.lotId)
  const ownerBefore = {
    contractClientId: contract?.clientId ?? null,
    lotOwnerClientId: lot?.currentOwnerClientId ?? null,
  }
  const before = snapshot()

  useSales.getState().decideTransfer(id, decision, actor, note)
  const fired = since(before)

  if (decision === 'rejected') {
    return {
      ok: true,
      message: `Transfer on ${code} rejected`,
      description: 'Ownership is unchanged and the requester has been told why.',
    }
  }

  return {
    ok: true,
    message: `Transfer on ${code} approved`,
    description: 'The lot and the contract now show the new owner.',
    undo: () => {
      const liveTransfer = dataset().transfers.find((t) => t.id === id)
      if (liveTransfer) {
        liveTransfer.status = 'pending'
        liveTransfer.decidedByUserId = null
        liveTransfer.decidedAt = null
        liveTransfer.updatedAt = NOW
      }
      const liveContract = indexes().contractsById.get(transfer.contractId)
      if (liveContract && ownerBefore.contractClientId) {
        liveContract.clientId = ownerBefore.contractClientId
        liveContract.updatedAt = NOW
      }
      const liveLot = indexes().lotsById.get(transfer.lotId)
      if (liveLot) {
        liveLot.currentOwnerClientId = ownerBefore.lotOwnerClientId
        liveLot.updatedAt = NOW
      }
      notifications().reopenApproval(task.id)
      notifications().dropNotifications(fired)
      record(actor.id, 'transfer.approved', 'Transfer', task.entityId, null, {
        decision: 'approved',
        undone: true,
      })
      touch()
    },
  }
}

/**
 * Bulk approve — holds only. Contracts, payout runs and interments carry
 * money or a grave and are always decided one at a time.
 */
export function approveMany(tasks: ApprovalTask[], actor: User): DecisionOutcome {
  const undos: (() => void)[] = []
  let done = 0
  let failed = 0

  for (const task of tasks) {
    if (task.kind !== 'hold') {
      failed++
      continue
    }
    const outcome = decide(task, 'approved', actor)
    if (outcome.ok) {
      done++
      if (outcome.undo) undos.push(outcome.undo)
    } else {
      failed++
    }
  }

  if (done === 0) {
    return { ok: false, message: 'Nothing was approved.', description: 'Those holds have already been decided.' }
  }

  return {
    ok: true,
    message: `${done} hold${done === 1 ? '' : 's'} approved`,
    description:
      failed > 0
        ? `${failed} could not be approved — they had already been decided.`
        : 'Every requesting agent has been notified.',
    undo:
      undos.length > 0
        ? () => {
            for (const u of undos) u()
          }
        : undefined,
  }
}
