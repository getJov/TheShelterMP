import type {
  AgentId,
  CommissionId,
  ContractId,
  LocationId,
  PaymentId,
  PayoutRunId,
  UserId,
} from './ids'
import type { Centavos, ISODate, ISODateTime, Percent } from './primitives'
import type { CommissionLevel, CommissionStatus, PayoutRunStatus } from './enums'

/**
 * Editable in the UI and effective-dated, so a rate change does not restate
 * history. Rates and labels are ASSUMED — see ASSUMPTIONS.
 */
export interface CommissionRule {
  id: string
  level: CommissionLevel
  /** Display name — the client has not confirmed these. */
  label: string
  ratePercent: Percent // 6 | 4 | 2
  effectiveFrom: ISODate
  effectiveTo: ISODate | null
  active: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/**
 * ONE ENTRY PER (payment × level). Commission is earned when money is
 * COLLECTED, never at signing. A ₱60,000 contract paid over 60 months
 * produces 60 × 3 = 180 entries.
 */
export interface CommissionEntry {
  id: CommissionId
  paymentId: PaymentId
  contractId: ContractId
  locationId: LocationId
  /** Resolved from the contract's snapshotted upline. */
  agentId: AgentId
  level: CommissionLevel
  /** Snapshotted from the rule in force on the payment date. */
  ratePercent: Percent
  /** The full posted payment. Trust fund is NOT deducted. */
  basisCentavos: Centavos
  amountCentavos: Centavos
  status: CommissionStatus
  payoutRunId: PayoutRunId | null
  /** = payment.postedAt */
  earnedAt: ISODateTime
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/**
 * Saturday → Thursday, released Friday. Sunday is excluded from the earning
 * window per the client's handwritten note.
 */
export interface PayoutRun {
  id: PayoutRunId
  /** null = all locations. */
  locationId: LocationId | null
  /** A Saturday. */
  periodStart: ISODate
  /** The following Thursday. */
  periodEnd: ISODate
  /** The following Friday. */
  releaseDate: ISODate
  status: PayoutRunStatus
  entryCount: number
  totalCentavos: Centavos
  approvedByUserId: UserId | null
  approvedAt: ISODateTime | null
  releasedAt: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
