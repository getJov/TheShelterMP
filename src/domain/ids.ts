/**
 * Branded ids. A LotId can never be passed where a ContractId is expected —
 * the cheapest structural safety available, and it pays for itself the moment
 * features start joining across entities.
 */
type Brand<K extends string> = string & { readonly __brand: K }

export type LocationId = Brand<'Location'>
export type BlockId = Brand<'Block'>
export type LotId = Brand<'Lot'>
export type OverlayId = Brand<'Overlay'>
export type TierId = Brand<'Tier'>
export type PriceId = Brand<'Price'>
export type ServiceId = Brand<'Service'>
export type UserId = Brand<'User'>
export type AgentId = Brand<'Agent'>
export type ClientId = Brand<'Client'>
export type HoldId = Brand<'Hold'>
export type ContractId = Brand<'Contract'>
export type PaymentId = Brand<'Payment'>
export type CommissionId = Brand<'Commission'>
export type PayoutRunId = Brand<'PayoutRun'>
export type IntermentId = Brand<'Interment'>
export type JobId = Brand<'Job'>
export type TransferId = Brand<'Transfer'>
export type ApprovalId = Brand<'Approval'>
export type NotificationId = Brand<'Notification'>
export type AuditId = Brand<'Audit'>

/** Cast helper. Mock data and forms use this; nothing else should. */
export const asId = <T extends string>(v: string) => v as Brand<T>
