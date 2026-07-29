import type { PriceId, ServiceId, TierId, UserId } from './ids'
import type { Centavos, ISODate, ISODateTime } from './primitives'
import type { NeedType, PaymentMode, ServiceCategory } from './enums'

/**
 * The price book is APPEND-ONLY and effective-dated. Changing a price never
 * edits a row — it closes the current row's effectiveTo and inserts a new
 * one. Historical contracts must resolve to what they were actually sold at.
 */
export interface PriceBookEntry {
  id: PriceId
  tierId: TierId
  needType: NeedType
  paymentMode: PaymentMode
  /** null → 'Contact for pricing'. Never fall back to another tier or mode. */
  amountCentavos: Centavos | null
  /** Inclusive. */
  effectiveFrom: ISODate
  /** Exclusive. null = still in force. */
  effectiveTo: ISODate | null
  /** Shown on the price chip: 'July 2026 Spot Cash Promo'. */
  label: string | null
  isPromo: boolean
  note: string | null
  createdByUserId: UserId
  createdAt: ISODateTime
}

export interface ServiceCatalogItem {
  id: ServiceId
  code: string // 'OPEN_CLOSE'
  name: string // 'Opening & Closing Fee'
  category: ServiceCategory
  defaultAmountCentavos: Centavos
  billing: 'per_contract' | 'per_interment' | 'recurring_annual'
  active: boolean
  /** Set when the amount is our assumption rather than the client's figure. */
  note: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
