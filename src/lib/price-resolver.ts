import type {
  Centavos,
  ISODate,
  NeedType,
  PaymentMode,
  PriceBookEntry,
  TierId,
} from '@/domain'

export interface ResolvedPrice {
  amountCentavos: Centavos | null
  entry: PriceBookEntry | null
  /** The non-promo entry in force, when a promo won. */
  listEntry: PriceBookEntry | null
  savingCentavos: Centavos
  isPromo: boolean
  label: string | null
}

const EMPTY: ResolvedPrice = {
  amountCentavos: null,
  entry: null,
  listEntry: null,
  savingCentavos: 0,
  isPromo: false,
  label: null,
}

function inWindow(e: PriceBookEntry, asOf: ISODate) {
  return e.effectiveFrom <= asOf && (e.effectiveTo === null || asOf < e.effectiveTo)
}

function best(
  book: PriceBookEntry[],
  tierId: TierId,
  needType: NeedType,
  paymentMode: PaymentMode,
  asOf: ISODate,
  allowPromo: boolean,
): PriceBookEntry | null {
  const candidates = book.filter(
    (e) =>
      e.tierId === tierId &&
      e.needType === needType &&
      e.paymentMode === paymentMode &&
      (allowPromo || !e.isPromo) &&
      inWindow(e, asOf),
  )
  if (candidates.length === 0) return null

  // Latest effectiveFrom wins; ties break in favour of a promo.
  return candidates.reduce((a, b) => {
    if (b.effectiveFrom > a.effectiveFrom) return b
    if (b.effectiveFrom < a.effectiveFrom) return a
    return b.isPromo && !a.isPromo ? b : a
  })
}

/**
 * Resolve a price for (tier × need type × payment mode) as of a date.
 *
 * NEVER falls back across dimensions. If nothing matches, the caller shows
 * "Contact for pricing" — substituting a different tier or mode would put a
 * wrong number on a contract.
 */
export function resolvePrice(
  book: PriceBookEntry[],
  tierId: TierId,
  needType: NeedType,
  paymentMode: PaymentMode,
  asOf: ISODate,
): ResolvedPrice {
  const entry = best(book, tierId, needType, paymentMode, asOf, true)
  if (!entry) return EMPTY

  let listEntry: PriceBookEntry | null = null
  let saving = 0
  if (entry.isPromo) {
    listEntry = best(book, tierId, needType, paymentMode, asOf, false)
    if (listEntry?.amountCentavos != null && entry.amountCentavos != null) {
      saving = listEntry.amountCentavos - entry.amountCentavos
    }
  }

  return {
    amountCentavos: entry.amountCentavos,
    entry,
    listEntry,
    savingCentavos: saving,
    isPromo: entry.isPromo,
    label: entry.label,
  }
}

/** Every price generation for one combination, newest first. */
export function priceHistory(
  book: PriceBookEntry[],
  tierId: TierId,
  needType: NeedType,
  paymentMode: PaymentMode,
): PriceBookEntry[] {
  return book
    .filter(
      (e) =>
        e.tierId === tierId &&
        e.needType === needType &&
        e.paymentMode === paymentMode,
    )
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
}

export function activePromos(book: PriceBookEntry[], asOf: ISODate): PriceBookEntry[] {
  return book.filter((e) => e.isPromo && inWindow(e, asOf))
}
