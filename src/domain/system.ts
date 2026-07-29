import type { ApprovalId, AuditId, LocationId, NotificationId, UserId } from './ids'
import type { ISODateTime } from './primitives'
import type { ApprovalKind, ApprovalStatus, NotificationKind } from './enums'

export interface ApprovalTask {
  id: ApprovalId
  kind: ApprovalKind
  /** Points at the Hold / Contract / PayoutRun / Transfer / Interment. */
  entityId: string
  locationId: LocationId
  title: string
  summary: string
  requestedByUserId: UserId
  requestedAt: ISODateTime
  status: ApprovalStatus
  decidedByUserId: UserId | null
  decidedAt: ISODateTime | null
  decisionNote: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Notification {
  id: NotificationId
  userId: UserId
  kind: NotificationKind
  title: string
  body: string
  entityRef: { type: string; id: string } | null
  /** Deep link the bell menu navigates to. */
  href: string | null
  readAt: ISODateTime | null
  createdAt: ISODateTime
}

export interface AuditEvent {
  id: AuditId
  actorUserId: UserId
  /** From AUDIT_ACTIONS. */
  action: string
  entityType: string
  entityId: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  at: ISODateTime
}

/** Fixed vocabulary so every feature logs the same strings. */
export const AUDIT_ACTIONS = [
  'lot.status_changed',
  'lot.tier_changed',
  'block.created',
  'overlay.published',
  'hold.requested',
  'hold.approved',
  'hold.rejected',
  'hold.expired',
  'contract.created',
  'contract.approved',
  'contract.cancelled',
  'payment.posted',
  'payment.voided',
  'certificate.issued',
  'price.updated',
  'tier.updated',
  'commission.rule_updated',
  'payout.approved',
  'payout.released',
  'agent.created',
  'agent.archived',
  'interment.scheduled',
  'interment.completed',
  'interment.cancelled',
  'transfer.approved',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]
