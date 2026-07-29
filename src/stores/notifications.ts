import { create } from 'zustand'
import type {
  ApprovalKind,
  ApprovalStatus,
  ApprovalTask,
  LocationId,
  Notification,
  NotificationId,
  NotificationKind,
  User,
  UserId,
} from '@/domain'
import { asId, formatLotCode } from '@/domain'
import { dataset, indexes, useDataset } from './dataset'
import { NOW, TODAY } from '@/mock'
import { addDays, fmtDate } from '@/lib/dates'

let nSeq = 9000
let aSeq = 9000

/** A reference back to the thing a notification is about. */
export type EntityRef = { type: string; id: string } | null

interface NotificationStore {
  version: number
  markRead: (id: NotificationId) => void
  markAllRead: (userId: UserId) => void
  notify: (
    userIds: UserId[],
    kind: NotificationKind,
    title: string,
    body: string,
    href?: string | null,
    entityRef?: EntityRef,
  ) => void
  /** Resolves a role + location to actual user ids, then notifies them. */
  notifyRole: (
    role: User['role'],
    locationId: LocationId | null,
    kind: NotificationKind,
    title: string,
    body: string,
    href?: string | null,
    entityRef?: EntityRef,
  ) => void
  createApproval: (
    input: Omit<
      ApprovalTask,
      'id' | 'createdAt' | 'updatedAt' | 'status' | 'decidedByUserId' | 'decidedAt' | 'decisionNote'
    >,
  ) => ApprovalTask
  decideApproval: (
    id: string,
    decision: Exclude<ApprovalStatus, 'pending'>,
    deciderId: UserId,
    note?: string,
  ) => ApprovalTask | null
  approvalsFor: (user: User | null) => ApprovalTask[]
  approvalCounts: (user: User | null) => Record<ApprovalKind | 'all', number>

  // ── added by spec 13 ──
  /** Every notification addressed to a user, newest first. */
  notificationsFor: (userId: UserId | null) => Notification[]
  unreadFor: (userId: UserId | null) => Notification[]
  /** Decided tasks this user is entitled to see, newest decision first. */
  decidedFor: (user: User | null, limit?: number) => ApprovalTask[]
  /** Puts a decided task back in the queue. Undo only. */
  reopenApproval: (id: string) => ApprovalTask | null
  /** Removes notifications by id. Undo only — an undone decision should not
   *  leave "your hold was approved" sitting in someone's bell. */
  dropNotifications: (ids: string[]) => void
  /** Ids of every notification currently in the dataset, for undo snapshots. */
  notificationIds: () => string[]
  /**
   * Holds lapsing inside the window get one warning each, to the agent who
   * asked and to that location's manager. Idempotent — safe to call on every
   * mount, which is how it runs at all.
   *
   * The window is counted in DAYS, not clock hours: a hold expires at close of
   * business, and "expires tomorrow" is the sentence a manager acts on. An
   * hour-exact 24 would silently skip the seeded hold that lapses tomorrow
   * at 17:00 — the one case this mechanism exists to make visible.
   */
  surfaceExpiringHolds: (withinDays?: number) => number
}

/** Hold ids already warned about this session. */
const warned = new Set<string>()

/** Which approval kinds each role may decide. */
function decidableKinds(user: User): ApprovalKind[] {
  if (user.role === 'admin')
    return ['hold', 'contract', 'discount', 'payout_run', 'ownership_transfer', 'interment']
  if (user.role === 'manager') return ['hold', 'contract', 'interment']
  if (user.role === 'owner') return ['payout_run']
  return []
}

export const useNotifications = create<NotificationStore>((set, get) => ({
  version: 0,

  markRead: (id) => {
    const n = dataset().notifications.find((x) => x.id === id)
    if (n && !n.readAt) {
      n.readAt = NOW
      set({ version: get().version + 1 })
    }
  },

  markAllRead: (userId) => {
    for (const n of dataset().notifications) {
      if (n.userId === userId && !n.readAt) n.readAt = NOW
    }
    set({ version: get().version + 1 })
  },

  notify: (userIds, kind, title, body, href = null, entityRef = null) => {
    for (const userId of userIds) {
      dataset().notifications.unshift({
        id: asId<'Notification'>(`ntf_${++nSeq}`),
        userId,
        kind,
        title,
        body,
        entityRef,
        href,
        readAt: null,
        createdAt: NOW,
      })
    }
    set({ version: get().version + 1 })
  },

  notifyRole: (role, locationId, kind, title, body, href = null, entityRef = null) => {
    const targets = dataset()
      .users.filter(
        (u) =>
          u.role === role &&
          u.status === 'active' &&
          (locationId === null ||
            u.locationIds.length === 0 ||
            u.locationIds.includes(locationId)),
      )
      .map((u) => u.id)
    get().notify(targets, kind, title, body, href, entityRef)
  },

  createApproval: (input) => {
    const task: ApprovalTask = {
      ...input,
      id: asId<'Approval'>(`apr_${++aSeq}`),
      status: 'pending',
      decidedByUserId: null,
      decidedAt: null,
      decisionNote: null,
      createdAt: NOW,
      updatedAt: NOW,
    }
    dataset().approvals.unshift(task)
    set({ version: get().version + 1 })
    return task
  },

  decideApproval: (id, decision, deciderId, note) => {
    const task = dataset().approvals.find((a) => a.id === id)
    if (!task || task.status !== 'pending') return null
    task.status = decision
    task.decidedByUserId = deciderId
    task.decidedAt = NOW
    task.decisionNote = note ?? null
    task.updatedAt = NOW
    useDataset.getState().touch()
    set({ version: get().version + 1 })
    return task
  },

  approvalsFor: (user) => {
    void get().version
    if (!user) return []
    const kinds = decidableKinds(user)
    if (kinds.length === 0) return []
    return dataset()
      .approvals.filter(
        (a) =>
          a.status === 'pending' &&
          kinds.includes(a.kind) &&
          (user.role === 'admin' ||
            user.role === 'owner' ||
            user.locationIds.includes(a.locationId)),
      )
      .sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : 1))
  },

  approvalCounts: (user) => {
    const rows = get().approvalsFor(user)
    const out = {
      all: rows.length,
      hold: 0,
      contract: 0,
      discount: 0,
      payout_run: 0,
      ownership_transfer: 0,
      interment: 0,
    } as Record<ApprovalKind | 'all', number>
    for (const r of rows) out[r.kind] += 1
    return out
  },

  // ── spec 13 additions ──────────────────────────────────────────────
  notificationsFor: (userId) => {
    void get().version
    if (!userId) return []
    return dataset()
      .notifications.filter((n) => n.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },

  unreadFor: (userId) => get().notificationsFor(userId).filter((n) => !n.readAt),

  decidedFor: (user, limit = 50) => {
    void get().version
    if (!user) return []
    const kinds = decidableKinds(user)
    if (kinds.length === 0) return []
    return dataset()
      .approvals.filter(
        (a) =>
          a.status !== 'pending' &&
          kinds.includes(a.kind) &&
          (user.role === 'admin' ||
            user.role === 'owner' ||
            user.locationIds.includes(a.locationId)),
      )
      .sort((a, b) => ((a.decidedAt ?? a.updatedAt) < (b.decidedAt ?? b.updatedAt) ? 1 : -1))
      .slice(0, limit)
  },

  reopenApproval: (id) => {
    const task = dataset().approvals.find((a) => a.id === id)
    if (!task) return null
    task.status = 'pending'
    task.decidedByUserId = null
    task.decidedAt = null
    task.decisionNote = null
    task.updatedAt = NOW
    useDataset.getState().touch()
    set({ version: get().version + 1 })
    return task
  },

  notificationIds: () => dataset().notifications.map((n) => n.id as string),

  dropNotifications: (ids) => {
    if (ids.length === 0) return
    const drop = new Set(ids)
    const rows = dataset().notifications
    for (let i = rows.length - 1; i >= 0; i--) {
      if (drop.has(rows[i]!.id as string)) rows.splice(i, 1)
    }
    set({ version: get().version + 1 })
  },

  surfaceExpiringHolds: (withinDays = 1) => {
    const d = dataset()
    const idx = indexes()
    const horizon = addDays(TODAY, withinDays)
    let raised = 0

    for (const hold of d.holds) {
      if (hold.status !== 'pending' && hold.status !== 'approved') continue
      if (warned.has(hold.id as string)) continue
      const day = hold.expiresAt.slice(0, 10)
      // Already lapsed is expireStaleHolds' business, not a warning.
      if (day < TODAY || day > horizon) continue

      warned.add(hold.id as string)
      const lot = idx.lotsById.get(hold.lotId)
      const block = lot ? idx.blocksById.get(lot.blockId) : null
      const code = lot ? formatLotCode(block?.code ?? 'B??', lot.lotNumber) : 'a lot'

      // The agent who asked, and the manager of THAT location — nobody else.
      const managers = d.users
        .filter(
          (u) =>
            u.role === 'manager' &&
            u.status === 'active' &&
            (u.locationIds.length === 0 || u.locationIds.includes(hold.locationId)),
        )
        .map((u) => u.id)

      const when = day === TODAY ? 'today' : day === addDays(TODAY, 1) ? 'tomorrow' : fmtDate(day)
      get().notify(
        [hold.requestedByUserId, ...managers.filter((m) => m !== hold.requestedByUserId)],
        'hold_expiring',
        `Hold on ${code} expires ${when}`,
        `${fmtDate(hold.expiresAt)}, close of business. Convert it to a contract or the lot returns to available.`,
        `/map?lot=${code}`,
        { type: 'Hold', id: hold.id as string },
      )
      raised++
    }
    return raised
  },
}))
