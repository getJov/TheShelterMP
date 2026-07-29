import type {
  AgentId,
  ClientId,
  ContractId,
  HoldId,
  LocationId,
  LotId,
  PaymentId,
  PriceId,
  ServiceId,
  TransferId,
  UserId,
} from './ids'
import type { Centavos, ISODate, ISODateTime } from './primitives'
import type {
  ApprovalStatus,
  ContractStatus,
  HoldStatus,
  InstallmentStatus,
  NeedType,
  PaymentMethod,
  PaymentMode,
  PaymentStatus,
} from './enums'

export interface Hold {
  id: HoldId
  lotId: LotId
  locationId: LocationId
  requestedByUserId: UserId
  /** May be a walk-in with no client record yet. */
  clientId: ClientId | null
  prospectName: string | null
  status: HoldStatus
  requestedAt: ISODateTime
  /** HOLD_DURATION_DAYS from constants. Auto-expires. */
  expiresAt: ISODateTime
  /** Manager or admin. */
  decidedByUserId: UserId | null
  decidedAt: ISODateTime | null
  decisionNote: string | null
  convertedContractId: ContractId | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/**
 * A great deal is SNAPSHOTTED onto this record rather than looked up live —
 * priceBookEntryId, listPrice, and the whole agent upline. A price change in
 * 2027 or an agent moving teams must never retroactively alter a 2026
 * contract or its commission split.
 */
export interface Contract {
  id: ContractId
  /** THE per-contract reference the client asked for. 'TSM-2026-00087'. */
  contractNo: string
  locationId: LocationId
  lotId: LotId
  clientId: ClientId
  coOwnerClientId: ClientId | null

  needType: NeedType
  paymentMode: PaymentMode
  /** null for spot_cash. Max 60. */
  termMonths: number | null

  // money, all snapshotted at signing
  priceBookEntryId: PriceId
  listPriceCentavos: Centavos
  discountCentavos: Centavos
  discountReason: string | null
  servicesTotalCentavos: Centavos
  /** listPrice − discount + servicesTotal. */
  contractPriceCentavos: Centavos

  status: ContractStatus

  // attribution, snapshotted
  agentId: AgentId
  teamLeaderId: AgentId | null
  distributorId: AgentId | null

  signedAt: ISODate
  approvedByUserId: UserId | null
  approvedAt: ISODateTime | null
  cancelledAt: ISODateTime | null
  cancelReason: string | null

  /** Issued only when fully paid — the client was explicit. */
  certificateNo: string | null
  certificateIssuedAt: ISODate | null

  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface ServiceLine {
  id: string
  contractId: ContractId
  serviceId: ServiceId
  description: string
  quantity: number
  unitAmountCentavos: Centavos
  totalCentavos: Centavos
  createdAt: ISODateTime
}

export interface Installment {
  id: string
  contractId: ContractId
  /** 1-based. */
  installmentNo: number
  dueDate: ISODate
  amountDueCentavos: Centavos
  amountPaidCentavos: Centavos
  status: InstallmentStatus
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Payment {
  id: PaymentId
  contractId: ContractId
  /** Official Receipt number. */
  orNo: string
  amountCentavos: Centavos
  method: PaymentMethod
  referenceNo: string | null
  paidAt: ISODate
  postedAt: ISODateTime
  receivedByUserId: UserId
  /** Which installments this payment settled, oldest first. */
  appliedInstallmentNos: number[]
  /**
   * 20% of amountCentavos, ADDED to the trust fund total. This is an accrual
   * figure — it is NOT deducted from the contract or the commission basis.
   */
  trustFundCentavos: Centavos
  status: PaymentStatus
  voidReason: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface TrustFundEntry {
  id: string
  paymentId: PaymentId
  contractId: ContractId
  locationId: LocationId
  amountCentavos: Centavos
  runningBalanceCentavos: Centavos
  postedAt: ISODateTime
}

export interface OwnershipTransfer {
  id: TransferId
  lotId: LotId
  contractId: ContractId
  fromClientId: ClientId
  toClientId: ClientId
  reason: string
  /** ₱1,500 heard once in the transcript, never confirmed. ASSUMED. */
  feeCentavos: Centavos
  status: ApprovalStatus
  requestedByUserId: UserId
  requestedAt: ISODateTime
  decidedByUserId: UserId | null
  decidedAt: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
