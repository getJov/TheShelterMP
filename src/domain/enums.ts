// ── access ───────────────────────────────────────────────────────────
/**
 * NOTE: the Customer Service Rep role is MERGED into 'manager' per the
 * client's decision. Do not add a 'csr' member.
 */
export type Role = 'owner' | 'admin' | 'manager' | 'agent'
export const ROLES: Role[] = ['owner', 'admin', 'manager', 'agent']

export type UserStatus = 'active' | 'archived'

// ── park ─────────────────────────────────────────────────────────────
export type LocationKind = 'park' | 'sales_office'

export type LotStatus =
  | 'available' // badge A · open for sale
  | 'held' // badge H · reserved, pending approval or expiry
  | 'sold' // badge S · under contract, paid or on balance
  | 'occupied' // badge O · at least one interment recorded
  | 'not_for_sale' // badge X · road, chapel, easement, utility

export const LOT_STATUSES: LotStatus[] = [
  'available',
  'held',
  'sold',
  'occupied',
  'not_for_sale',
]

/** Derived, never stored. Powers the payment-health map view. */
export type PaymentHealth =
  | 'not_applicable'
  | 'paid_in_full'
  | 'current'
  | 'due_soon'
  | 'overdue'
  | 'severely_overdue'

export type TierCategory = 'lawn' | 'family_garden' | 'mausoleum'
export type MarkerType = 'flat_marble' | 'upright' | 'none'

// ── sales ────────────────────────────────────────────────────────────
export type NeedType = 'pre_need' | 'at_need'
/** RULE: at_need is spot_cash only — see isPaymentModeAllowed(). */
export type PaymentMode = 'spot_cash' | 'installment'

export type HoldStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'converted'

export type ContractStatus =
  | 'draft'
  | 'pending_approval'
  | 'active'
  | 'fully_paid'
  | 'cancelled'

export type InstallmentStatus = 'upcoming' | 'due' | 'partial' | 'paid' | 'overdue'

export type PaymentMethod = 'cash' | 'bank_transfer' | 'gcash' | 'check'
export type PaymentStatus = 'posted' | 'void'

export type ServiceCategory =
  | 'interment' // opening & closing
  | 'maintenance' // grounds upkeep
  | 'environmental' // cleaning / landscaping
  | 'transfer' // ownership change, bone transfer
  | 'other'

// ── commission ───────────────────────────────────────────────────────
/**
 * ASSUMED level names. The client confirmed the 6/4/2 split but not what
 * each level is called. Editable in the UI — see ASSUMPTIONS.
 */
export type CommissionLevel = 'associate' | 'team_leader' | 'distributor'
export const COMMISSION_LEVELS: CommissionLevel[] = [
  'associate',
  'team_leader',
  'distributor',
]

export type CommissionStatus =
  | 'accrued' // earned on a posted payment, not yet in a run
  | 'in_run' // attached to an open payout run
  | 'approved' // run approved, awaiting Friday release
  | 'released' // paid out
  | 'voided' // contract cancelled before release
  | 'clawback_pending' // released, then contract cancelled

export type PayoutRunStatus = 'open' | 'pending_approval' | 'approved' | 'released'

// ── burial ───────────────────────────────────────────────────────────
export type IntermentType = 'permanent' | 'temporary' | 'cremation' | 'bone_transfer'
export type BurialSlot = 'morning' | 'afternoon'
export type IntermentStatus = 'requested' | 'scheduled' | 'completed' | 'cancelled'
export type JobStatus = 'pending' | 'in_progress' | 'ready' | 'completed'

// ── system ───────────────────────────────────────────────────────────
export type ApprovalKind =
  | 'hold'
  | 'contract'
  | 'discount'
  | 'payout_run'
  | 'ownership_transfer'
  | 'interment'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export type NotificationKind =
  | 'hold_requested'
  | 'hold_decided'
  | 'hold_expiring'
  | 'payment_posted'
  | 'installment_overdue'
  | 'contract_approved'
  | 'payout_ready'
  | 'interment_scheduled'
  | 'job_assigned'

// ── display labels ───────────────────────────────────────────────────
export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  manager: 'Manager',
  agent: 'Agent',
}

export const NEED_TYPE_LABEL: Record<NeedType, string> = {
  pre_need: 'Pre-need',
  at_need: 'At-need',
}

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  spot_cash: 'Spot cash',
  installment: 'Installment',
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  gcash: 'GCash',
  check: 'Check',
}

export const INTERMENT_TYPE_LABEL: Record<IntermentType, string> = {
  permanent: 'Permanent',
  temporary: 'Temporary',
  cremation: 'Cremation',
  bone_transfer: 'Bone transfer',
}

export const SLOT_LABEL: Record<BurialSlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
}

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Awaiting approval',
  active: 'Active',
  fully_paid: 'Fully paid',
  cancelled: 'Cancelled',
}

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  accrued: 'Accrued',
  in_run: 'In run',
  approved: 'Approved',
  released: 'Released',
  voided: 'Voided',
  clawback_pending: 'Clawback pending',
}

export const PAYOUT_RUN_STATUS_LABEL: Record<PayoutRunStatus, string> = {
  open: 'Open',
  pending_approval: 'Awaiting approval',
  approved: 'Approved',
  released: 'Released',
}

export const INTERMENT_STATUS_LABEL: Record<IntermentStatus, string> = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
