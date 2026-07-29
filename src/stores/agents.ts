import { create } from 'zustand'
import {
  asId,
  COMMISSION_LEVELS,
  type AgentId,
  type AgentProfile,
  type AuditAction,
  type CommissionEntry,
  type CommissionId,
  type CommissionLevel,
  type CommissionRule,
  type Centavos,
  type ISODate,
  type LocationId,
  type PayoutRun,
  type PayoutRunId,
  type User,
  type UserId,
} from '@/domain'
import { dataset, indexes, useDataset } from './dataset'
import { useNotifications } from './notifications'
import { NOW, TODAY } from '@/mock'
import { periodFor } from '@/lib/commission'
import { formatPeso } from '@/lib/money'
import { fmtDate } from '@/lib/dates'

/**
 * Agents, commission rules and payout runs.
 *
 * Every mutation here follows the same shape: mutate the dataset in place,
 * `touch()` so indexes rebuild and selectors recompute, write an audit event,
 * then notify whoever is affected. Nothing in this file computes money — the
 * arithmetic lives in `@/lib/commission` and `@/lib/finance`.
 *
 * Commission ENTRIES are never created here. They are born in exactly one
 * place, `accrueCommission()`, called by the sales store when a payment is
 * posted. A second creation path would silently diverge from the ledger.
 */

let agentSeq = 900
let userSeq = 900
let ruleSeq = 0
let runSeq = 9000
let auditSeq = 900000

// ── plumbing ─────────────────────────────────────────────────────────
function audit(
  actorUserId: UserId,
  action: AuditAction,
  entityType: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  dataset().audit.unshift({
    id: asId<'Audit'>(`aud_${++auditSeq}`),
    actorUserId,
    action,
    entityType,
    entityId,
    before,
    after,
    at: NOW,
  })
}

const touch = () => useDataset.getState().touch()

/** The commission rules in force today, in level order. */
export function activeRules(rules = dataset().commissionRules): CommissionRule[] {
  return COMMISSION_LEVELS.map(
    (level) =>
      rules
        .filter(
          (r) =>
            r.level === level &&
            r.effectiveFrom <= TODAY &&
            (r.effectiveTo === null || TODAY < r.effectiveTo),
        )
        .reduce<CommissionRule | null>(
          (a, b) => (a === null || b.effectiveFrom > a.effectiveFrom ? b : a),
          null,
        ) ?? null,
  ).filter((r): r is CommissionRule => r !== null)
}

/** Display label for a level, taken from the rule in force. */
export function levelLabel(level: CommissionLevel): string {
  return activeRules().find((r) => r.level === level)?.label ?? level
}

export function rateOf(level: CommissionLevel): number {
  return activeRules().find((r) => r.level === level)?.ratePercent ?? 0
}

/** Rule generations for a level, newest first. */
export function ruleHistory(level?: CommissionLevel): CommissionRule[] {
  return dataset()
    .commissionRules.filter((r) => !level || r.level === level)
    .slice()
    .sort((a, b) =>
      a.effectiveFrom === b.effectiveFrom
        ? a.level.localeCompare(b.level)
        : a.effectiveFrom < b.effectiveFrom
          ? 1
          : -1,
    )
}

export const agentUser = (a: AgentProfile): User | null =>
  indexes().usersById.get(a.userId) ?? null

export const agentName = (id: AgentId | null | undefined): string => {
  if (!id) return '—'
  const a = indexes().agentsById.get(id)
  if (!a) return '—'
  return agentUser(a)?.fullName ?? a.agentCode
}

/** Next free AG-0nn, so the create dialog can suggest one. */
export function nextAgentCode(): string {
  const nums = dataset()
    .agents.map((a) => Number(a.agentCode.replace(/\D/g, '')))
    .filter((n) => Number.isFinite(n))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `AG-${String(next).padStart(3, '0')}`
}

// ── store ────────────────────────────────────────────────────────────
export interface CreateAgentInput {
  fullName: string
  email: string
  phone: string | null
  agentCode: string
  level: CommissionLevel
  teamLeaderId: AgentId | null
  distributorId: AgentId | null
  locationId: LocationId
  hiredAt: ISODate
  monthlyTargetCentavos: Centavos | null
}

export interface UpdateAgentPatch {
  fullName?: string
  email?: string
  phone?: string | null
  agentCode?: string
  level?: CommissionLevel
  locationId?: LocationId
  hiredAt?: ISODate
  monthlyTargetCentavos?: Centavos | null
}

export interface ArchiveImpact {
  activeContracts: number
  unreleasedCentavos: Centavos
  downline: number
}

interface AgentsStore {
  version: number

  // ── agents ──
  createAgent: (input: CreateAgentInput, actorId: UserId) => AgentProfile
  updateAgent: (id: AgentId, patch: UpdateAgentPatch, actorId: UserId) => void
  archiveAgent: (id: AgentId, reason: string, actorId: UserId) => void
  restoreAgent: (id: AgentId, actorId: UserId) => void
  reassignUpline: (
    agentId: AgentId,
    upline: { teamLeaderId: AgentId | null; distributorId: AgentId | null },
    actorId: UserId,
  ) => void

  // ── rules ──
  setCommissionRule: (
    level: CommissionLevel,
    ratePercent: number,
    label: string,
    effectiveFrom: ISODate,
    actorId: UserId,
  ) => CommissionRule

  // ── payout runs ──
  openRun: (periodStart?: ISODate, locationId?: LocationId | null) => PayoutRun
  closeRun: (runId: PayoutRunId, actorId: UserId) => void
  approveRun: (runId: PayoutRunId, actorId: UserId) => void
  releaseRun: (runId: PayoutRunId, actorId: UserId) => void
  recordClawback: (commissionId: CommissionId, note: string, actorId: UserId) => void

  // ── selectors ──
  uplineOf: (agentId: AgentId) => {
    teamLeader: AgentProfile | null
    distributor: AgentProfile | null
  }
  downlineOf: (agentId: AgentId) => AgentProfile[]
  currentRun: (locationId?: LocationId | null) => PayoutRun | null
  runEntries: (runId: PayoutRunId) => CommissionEntry[]
  archiveImpact: (agentId: AgentId) => ArchiveImpact
}

export const useAgents = create<AgentsStore>((set, get) => ({
  version: 0,

  // ── agents ─────────────────────────────────────────────────────────
  createAgent: (input, actorId) => {
    const d = dataset()
    const userId = asId<'User'>(`usr_${++userSeq}`)
    const agentId = asId<'Agent'>(`agt_${++agentSeq}`)

    // A person who cannot log in is not an agent — the User comes with them.
    const user: User = {
      id: userId,
      fullName: input.fullName,
      email: input.email,
      role: 'agent',
      status: 'active',
      locationIds: [input.locationId],
      agentProfileId: agentId,
      avatarUrl: null,
      phone: input.phone,
      lastLoginAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    }

    const profile: AgentProfile = {
      id: agentId,
      userId,
      agentCode: input.agentCode,
      level: input.level,
      teamLeaderId: input.teamLeaderId,
      distributorId: input.distributorId,
      locationId: input.locationId,
      hiredAt: input.hiredAt,
      status: 'active',
      archivedAt: null,
      archiveReason: null,
      monthlyTargetCentavos: input.monthlyTargetCentavos,
      createdAt: NOW,
      updatedAt: NOW,
    }

    d.users.push(user)
    d.agents.push(profile)
    touch()

    audit(actorId, 'agent.created', 'AgentProfile', agentId, null, {
      agentCode: profile.agentCode,
      level: profile.level,
      fullName: user.fullName,
    })

    set({ version: get().version + 1 })
    return profile
  },

  updateAgent: (id, patch, actorId) => {
    const a = indexes().agentsById.get(id)
    if (!a) return
    const u = agentUser(a)
    const before = {
      level: a.level,
      agentCode: a.agentCode,
      locationId: a.locationId,
      monthlyTargetCentavos: a.monthlyTargetCentavos,
      fullName: u?.fullName,
    }

    if (patch.agentCode !== undefined) a.agentCode = patch.agentCode
    if (patch.level !== undefined) a.level = patch.level
    if (patch.locationId !== undefined) a.locationId = patch.locationId
    if (patch.hiredAt !== undefined) a.hiredAt = patch.hiredAt
    if (patch.monthlyTargetCentavos !== undefined)
      a.monthlyTargetCentavos = patch.monthlyTargetCentavos
    a.updatedAt = NOW

    if (u) {
      if (patch.fullName !== undefined) u.fullName = patch.fullName
      if (patch.email !== undefined) u.email = patch.email
      if (patch.phone !== undefined) u.phone = patch.phone
      if (patch.locationId !== undefined) u.locationIds = [patch.locationId]
      u.updatedAt = NOW
    }

    touch()
    audit(actorId, 'agent.created', 'AgentProfile', id, before, {
      level: a.level,
      agentCode: a.agentCode,
      locationId: a.locationId,
      monthlyTargetCentavos: a.monthlyTargetCentavos,
      fullName: u?.fullName,
    })
    set({ version: get().version + 1 })
  },

  /**
   * Access is revoked. Attribution, past commission and historical
   * leaderboard placings are all preserved — the client was explicit.
   */
  archiveAgent: (id, reason, actorId) => {
    const a = indexes().agentsById.get(id)
    if (!a || a.status === 'archived') return
    const impact = get().archiveImpact(id)

    a.status = 'archived'
    a.archivedAt = NOW
    a.archiveReason = reason
    a.updatedAt = NOW

    const u = agentUser(a)
    if (u) {
      u.status = 'archived'
      u.updatedAt = NOW
    }

    touch()
    audit(actorId, 'agent.archived', 'AgentProfile', id, { status: 'active' }, {
      status: 'archived',
      reason,
      activeContracts: impact.activeContracts,
      unreleasedCentavos: impact.unreleasedCentavos,
    })
    set({ version: get().version + 1 })
  },

  restoreAgent: (id, actorId) => {
    const a = indexes().agentsById.get(id)
    if (!a || a.status !== 'archived') return
    a.status = 'active'
    a.archivedAt = null
    a.archiveReason = null
    a.updatedAt = NOW
    const u = agentUser(a)
    if (u) {
      u.status = 'active'
      u.updatedAt = NOW
    }
    touch()
    audit(actorId, 'agent.created', 'AgentProfile', id, { status: 'archived' }, {
      status: 'active',
      restored: true,
    })
    set({ version: get().version + 1 })
  },

  /**
   * Changes FUTURE attribution only. Existing contracts snapshotted their
   * upline at signing and are deliberately left alone.
   */
  reassignUpline: (agentId, upline, actorId) => {
    const a = indexes().agentsById.get(agentId)
    if (!a) return
    const before = { teamLeaderId: a.teamLeaderId, distributorId: a.distributorId }
    a.teamLeaderId = upline.teamLeaderId
    a.distributorId = upline.distributorId
    a.updatedAt = NOW
    touch()
    audit(actorId, 'agent.created', 'AgentProfile', agentId, before, {
      teamLeaderId: a.teamLeaderId,
      distributorId: a.distributorId,
      note: 'upline reassigned — future contracts only',
    })
    set({ version: get().version + 1 })
  },

  // ── rules ──────────────────────────────────────────────────────────
  /**
   * Appends a new generation and closes the old one. Never edits in place:
   * existing entries keep the rate that was in force when they were earned.
   */
  setCommissionRule: (level, ratePercent, label, effectiveFrom, actorId) => {
    const d = dataset()
    const current = activeRules(d.commissionRules).find((r) => r.level === level)

    if (current) {
      current.effectiveTo = effectiveFrom
      current.active = false
      current.updatedAt = NOW
    }

    const rule: CommissionRule = {
      id: `crl_${level}_${++ruleSeq}_${effectiveFrom}`,
      level,
      label,
      ratePercent,
      effectiveFrom,
      effectiveTo: null,
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    }
    d.commissionRules.push(rule)
    touch()

    audit(
      actorId,
      'commission.rule_updated',
      'CommissionRule',
      rule.id,
      current
        ? { label: current.label, ratePercent: current.ratePercent }
        : null,
      { level, label, ratePercent, effectiveFrom },
    )
    set({ version: get().version + 1 })
    return rule
  },

  // ── payout runs ────────────────────────────────────────────────────
  openRun: (periodStart, locationId = null) => {
    const d = dataset()
    const p = periodFor(periodStart ?? TODAY)
    const existing = d.payoutRuns.find(
      (r) => r.periodStart === p.start && r.locationId === locationId,
    )
    if (existing) return existing

    const run: PayoutRun = {
      id: asId<'PayoutRun'>(`run_${++runSeq}`),
      locationId,
      periodStart: p.start,
      periodEnd: p.end,
      releaseDate: p.release,
      status: 'open',
      entryCount: 0,
      totalCentavos: 0,
      approvedByUserId: null,
      approvedAt: null,
      releasedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    }

    // Attach every accrued entry whose earning date falls in this window.
    const claimed = d.commissions.filter(
      (e) =>
        e.payoutRunId === null &&
        e.status === 'accrued' &&
        periodFor(e.earnedAt.slice(0, 10)).start === p.start,
    )
    for (const e of claimed) {
      e.payoutRunId = run.id
      e.updatedAt = NOW
    }
    run.entryCount = claimed.length
    run.totalCentavos = claimed.reduce((s, e) => s + e.amountCentavos, 0)

    d.payoutRuns.unshift(run)
    touch()
    set({ version: get().version + 1 })
    return run
  },

  closeRun: (runId, actorId) => {
    const run = indexes().payoutRunsById.get(runId)
    if (!run || run.status !== 'open') return
    const entries = get().runEntries(runId)

    run.status = 'pending_approval'
    run.entryCount = entries.length
    run.totalCentavos = entries.reduce((s, e) => s + e.amountCentavos, 0)
    run.updatedAt = NOW
    for (const e of entries) {
      if (e.status === 'accrued') {
        e.status = 'in_run'
        e.updatedAt = NOW
      }
    }
    touch()

    audit(actorId, 'payout.approved', 'PayoutRun', runId, { status: 'open' }, {
      status: 'pending_approval',
      entryCount: run.entryCount,
      totalCentavos: run.totalCentavos,
    })

    const n = useNotifications.getState()
    n.createApproval({
      kind: 'payout_run',
      entityId: runId,
      locationId:
        run.locationId ?? (dataset().locations[0]?.id as LocationId),
      title: `Payout run ${fmtDate(run.periodStart)} → ${fmtDate(run.periodEnd)}`,
      summary: `${run.entryCount} entries · ${formatPeso(run.totalCentavos)} · release ${fmtDate(run.releaseDate)}`,
      requestedByUserId: actorId,
      requestedAt: NOW,
    })
    n.notifyRole(
      'owner',
      run.locationId,
      'payout_ready',
      'Payout run awaiting approval',
      `${run.entryCount} entries totalling ${formatPeso(run.totalCentavos)} for ${fmtDate(run.periodStart)} → ${fmtDate(run.periodEnd)}.`,
      `/agents/payouts/${runId}`,
    )

    set({ version: get().version + 1 })
  },

  approveRun: (runId, actorId) => {
    const run = indexes().payoutRunsById.get(runId)
    if (!run || run.status !== 'pending_approval') return

    run.status = 'approved'
    run.approvedByUserId = actorId
    run.approvedAt = NOW
    run.updatedAt = NOW
    for (const e of get().runEntries(runId)) {
      if (e.status === 'in_run') {
        e.status = 'approved'
        e.updatedAt = NOW
      }
    }
    touch()

    audit(
      actorId,
      'payout.approved',
      'PayoutRun',
      runId,
      { status: 'pending_approval' },
      { status: 'approved', approvedByUserId: actorId },
    )
    useNotifications
      .getState()
      .notifyRole(
        'admin',
        run.locationId,
        'payout_ready',
        'Payout run approved',
        `${formatPeso(run.totalCentavos)} approved for release on ${fmtDate(run.releaseDate)}.`,
        `/agents/payouts/${runId}`,
      )
    set({ version: get().version + 1 })
  },

  releaseRun: (runId, actorId) => {
    const run = indexes().payoutRunsById.get(runId)
    if (!run || run.status !== 'approved') return
    const entries = get().runEntries(runId)

    run.status = 'released'
    run.releasedAt = NOW
    run.updatedAt = NOW

    const perAgent = new Map<AgentId, Centavos>()
    for (const e of entries) {
      if (e.status === 'approved' || e.status === 'in_run') {
        e.status = 'released'
        e.updatedAt = NOW
      }
      perAgent.set(e.agentId, (perAgent.get(e.agentId) ?? 0) + e.amountCentavos)
    }
    touch()

    audit(actorId, 'payout.released', 'PayoutRun', runId, { status: 'approved' }, {
      status: 'released',
      totalCentavos: run.totalCentavos,
      agents: perAgent.size,
    })

    const n = useNotifications.getState()
    const idx = indexes()
    for (const [agentId, centavos] of perAgent) {
      const profile = idx.agentsById.get(agentId)
      if (!profile) continue
      n.notify(
        [profile.userId],
        'payout_ready',
        'Commission released',
        `${formatPeso(centavos)} released for the period ${fmtDate(run.periodStart)} → ${fmtDate(run.periodEnd)}.`,
        `/agents/payouts/${runId}`,
      )
    }
    set({ version: get().version + 1 })
  },

  /**
   * No recovery policy exists — see ASSUMPTIONS.cancellationClawback. This
   * records that the money was recovered by hand and closes the entry out.
   */
  recordClawback: (commissionId, note, actorId) => {
    const entry = dataset().commissions.find((c) => c.id === commissionId)
    if (!entry || entry.status !== 'clawback_pending') return
    entry.status = 'voided'
    entry.updatedAt = NOW
    touch()
    audit(
      actorId,
      'payout.released',
      'CommissionEntry',
      commissionId,
      { status: 'clawback_pending' },
      { status: 'voided', recoveredNote: note, amountCentavos: entry.amountCentavos },
    )
    set({ version: get().version + 1 })
  },

  // ── selectors ──────────────────────────────────────────────────────
  uplineOf: (agentId) => {
    void get().version
    const idx = indexes()
    const a = idx.agentsById.get(agentId)
    if (!a) return { teamLeader: null, distributor: null }
    return {
      teamLeader: a.teamLeaderId ? (idx.agentsById.get(a.teamLeaderId) ?? null) : null,
      distributor: a.distributorId
        ? (idx.agentsById.get(a.distributorId) ?? null)
        : null,
    }
  },

  downlineOf: (agentId) => {
    void get().version
    const a = indexes().agentsById.get(agentId)
    if (!a) return []
    return dataset().agents.filter((x) =>
      a.level === 'distributor'
        ? x.distributorId === agentId && x.id !== agentId
        : x.teamLeaderId === agentId && x.id !== agentId,
    )
  },

  currentRun: (locationId = null) => {
    void get().version
    return (
      dataset().payoutRuns.find(
        (r) =>
          r.status === 'open' &&
          (locationId === null ||
            r.locationId === null ||
            r.locationId === locationId),
      ) ?? null
    )
  },

  runEntries: (runId) => {
    void get().version
    return indexes().commissionsByRun.get(runId) ?? []
  },

  archiveImpact: (agentId) => {
    void get().version
    const idx = indexes()
    const contracts = (idx.contractsByAgent.get(agentId) ?? []).filter(
      (c) => c.status === 'active' || c.status === 'pending_approval',
    )
    const unreleased = (idx.commissionsByAgent.get(agentId) ?? [])
      .filter(
        (e) =>
          e.status === 'accrued' || e.status === 'in_run' || e.status === 'approved',
      )
      .reduce((s, e) => s + e.amountCentavos, 0)
    return {
      activeContracts: contracts.length,
      unreleasedCentavos: unreleased,
      downline: get().downlineOf(agentId).length,
    }
  },
}))
