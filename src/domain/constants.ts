import type { LatLng } from './primitives'
import { toCentavos } from './primitives'
import type { NeedType, PaymentMode } from './enums'

// ── confirmed by the client ──────────────────────────────────────────
export const TRUST_FUND_RATE_PERCENT = 20
export const TOTAL_COMMISSION_PERCENT = 12
export const MAX_INSTALLMENT_MONTHS = 60
export const INSTALLMENT_TERM_OPTIONS = [6, 12, 24, 36, 48, 60] as const
export const MAX_BURIALS_PER_DAY = 2
export const BURIAL_SLOTS = ['morning', 'afternoon'] as const
export const AT_NEED_WINDOW_DAYS = 15
export const CURRENCY = 'PHP'
export const LOCALE = 'en-PH'
export const TIMEZONE = 'Asia/Manila'

/**
 * Payout period: Saturday(6) → Thursday(4), released Friday(5).
 * Sunday(0) is excluded from the earning window.
 */
export const PAYOUT_PERIOD = {
  startDow: 6,
  endDow: 4,
  releaseDow: 5,
  excludedDow: [0],
} as const

/** At-need is spot cash only — the client was explicit. */
export const isPaymentModeAllowed = (n: NeedType, m: PaymentMode) =>
  n === 'at_need' ? m === 'spot_cash' : true

/**
 * Placeholder park centroid — Brgy. Ilangay, Lupon, Davao Oriental.
 * SWAP THIS ONE CONSTANT when the survey arrives. Nothing else in the
 * codebase may hard-code a coordinate.
 */
export const DEFAULT_PARK_CENTROID: LatLng = [6.8985, 126.0102]
export const DEFAULT_PARK_ZOOM = 18

/** Facts stated by the client, used by the mock data and empty states. */
export const PARK_FACTS = {
  corporateName: 'The Shelter Memorial Park Corporation',
  shortName: 'The Shelter Memorial Park',
  tagline: 'A place where legacies and memories are preserved',
  founder: 'Judith Montero',
  ceo: 'Wendy M. Rabina',
  phone: '0930 293 4345',
  email: 'sheltermemorialpark.lupon@gmail.com',
  parkAddress: 'Purok Mabuhay, Brgy. Ilangay, Lupon, Davao Oriental',
  officeAddress: 'Block 4, Townsite, Poblacion, Lupon, Davao Oriental',
  firstIntermentDate: '2026-05-13',
  licensedToSellFrom: '2024-08-01',
  /** Total planned across all products, per the transcript. */
  plannedLotCount: 11400,
} as const

// ── ASSUMED — every one of these must surface an <AssumedChip /> ──────
export const ASSUMPTIONS = {
  commissionLevelNames: {
    value: {
      associate: 'Sales Associate',
      team_leader: 'Team Leader',
      distributor: 'Distributor',
    },
    why: 'The client confirmed the 6/4/2 split but not what each level is called.',
  },
  commissionRates: {
    value: { associate: 6, team_leader: 4, distributor: 2 },
    why: '12% total is confirmed; which level gets which slice is not. Editable on the Commission Rules screen.',
  },
  holdDurationDays: {
    value: 7,
    why: 'No hold expiry was stated. 7 days is a working default.',
  },
  ownershipTransferFee: {
    value: toCentavos(1500),
    why: '₱1,500 was mentioned once in the transcript and never confirmed.',
  },
  downpayment: {
    value: null,
    why: 'No downpayment rule was given. Schedules divide the contract price evenly across the term.',
  },
  interest: {
    value: null,
    why: 'No interest or installment premium was given. The installment price is simply the list price; the discount sits on spot cash.',
  },
  seniorCitizenDiscount: {
    value: null,
    why: 'The flag is captured on the client record but no computation rule has been defined.',
  },
  cancellationClawback: {
    value: 'void_unreleased_only',
    why: 'Unreleased commission is voided; released commission is flagged clawback_pending with no automatic recovery. No policy was given.',
  },
  mausoleumDimensions: {
    value: { widthM: 2.5, lengthM: 3.0 },
    why: 'Mausoleum is not on the price sheet. 2.5 × 3.0 m is a placeholder footprint for the map.',
  },
  serviceFees: {
    value: null,
    why: 'Opening & closing, maintenance and environmental fees are placeholder amounts. None came from the client.',
  },
} as const

export const HOLD_DURATION_DAYS = ASSUMPTIONS.holdDurationDays.value
export const OWNERSHIP_TRANSFER_FEE = ASSUMPTIONS.ownershipTransferFee.value
