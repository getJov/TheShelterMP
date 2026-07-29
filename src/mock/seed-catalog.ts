import {
  asId,
  DEFAULT_PARK_CENTROID,
  DEFAULT_PARK_ZOOM,
  PARK_FACTS,
  toCentavos,
  type Location,
  type PriceBookEntry,
  type ServiceCatalogItem,
  type Tier,
  type UserId,
} from '@/domain'
import { NOW } from './time'

const t = { createdAt: NOW, updatedAt: NOW }

// ── locations ────────────────────────────────────────────────────────
export const LOC_ILANGAY = asId<'Location'>('loc_ilg')
export const LOC_TOWNSITE = asId<'Location'>('loc_twn')

export function seedLocations(): Location[] {
  return [
    {
      id: LOC_ILANGAY,
      code: 'ILG',
      name: 'Ilangay Memorial Park',
      kind: 'park',
      address: PARK_FACTS.parkAddress,
      centroid: DEFAULT_PARK_CENTROID,
      defaultZoom: DEFAULT_PARK_ZOOM,
      bounds: null,
      active: true,
      ...t,
    },
    {
      id: LOC_TOWNSITE,
      code: 'TWN',
      name: 'Townsite Sales Office',
      kind: 'sales_office',
      address: PARK_FACTS.officeAddress,
      // ~2 km north-east of the park.
      centroid: [DEFAULT_PARK_CENTROID[0] + 0.018, DEFAULT_PARK_CENTROID[1] + 0.018],
      defaultZoom: 17,
      bounds: null,
      active: true,
      ...t,
    },
  ]
}

// ── tiers ────────────────────────────────────────────────────────────
export const TIER_LAWN_STD = asId<'Tier'>('tier_lawn_std')
export const TIER_LAWN_PLUS = asId<'Tier'>('tier_lawn_plus')
export const TIER_LAWN_PRIME = asId<'Tier'>('tier_lawn_prime')
export const TIER_FG_STD = asId<'Tier'>('tier_fg_std')
export const TIER_FG_PRIME = asId<'Tier'>('tier_fg_prime')
export const TIER_MAUSOLEUM = asId<'Tier'>('tier_mausoleum')

export function seedTiers(): Tier[] {
  return [
    {
      id: TIER_LAWN_STD,
      code: 'LAWN_STD',
      name: 'Lawn Standard',
      category: 'lawn',
      widthM: 1.0,
      lengthM: 2.44,
      capacity: 2,
      markerType: 'flat_marble',
      description: 'Underground interment with a flat marble marker.',
      appearance: {
        fillColor: '#e8dcc0',
        strokeColor: '#b9a87e',
        strokeWidth: 0.5,
        pattern: 'none',
        shortLabel: 'LS',
      },
      sortOrder: 1,
      active: true,
      ...t,
    },
    {
      id: TIER_LAWN_PLUS,
      code: 'LAWN_PLUS',
      name: 'Lawn Plus',
      category: 'lawn',
      widthM: 1.0,
      lengthM: 2.44,
      capacity: 2,
      markerType: 'flat_marble',
      description: 'Upgraded lawn position with a marble marker.',
      appearance: {
        fillColor: '#dccda4',
        strokeColor: '#ad9a6b',
        strokeWidth: 0.5,
        pattern: 'none',
        shortLabel: 'LP',
      },
      sortOrder: 2,
      active: true,
      ...t,
    },
    {
      id: TIER_LAWN_PRIME,
      code: 'LAWN_PRIME',
      name: 'Lawn Prime',
      category: 'lawn',
      widthM: 1.0,
      lengthM: 2.44,
      capacity: 2,
      markerType: 'flat_marble',
      description: 'Premium lawn placement along the main walks.',
      appearance: {
        fillColor: '#ccb884',
        strokeColor: '#9d8a58',
        strokeWidth: 0.6,
        pattern: 'diagonal',
        shortLabel: 'LPR',
      },
      sortOrder: 3,
      active: true,
      ...t,
    },
    {
      id: TIER_FG_STD,
      code: 'FG_STD',
      name: 'Family Garden Standard',
      category: 'family_garden',
      widthM: 2.0,
      lengthM: 4.88,
      capacity: 8,
      markerType: 'flat_marble',
      description: 'Four-lot family garden, up to eight interments, bench allowed.',
      appearance: {
        fillColor: '#cdd9c2',
        strokeColor: '#9db08f',
        strokeWidth: 0.6,
        pattern: 'none',
        shortLabel: 'FGS',
      },
      sortOrder: 4,
      active: true,
      ...t,
    },
    {
      id: TIER_FG_PRIME,
      code: 'FG_PRIME',
      name: 'Family Garden Prime',
      category: 'family_garden',
      widthM: 2.0,
      lengthM: 4.88,
      capacity: 8,
      markerType: 'flat_marble',
      description: 'Family garden on the drive frontage.',
      appearance: {
        fillColor: '#b3c8a6',
        strokeColor: '#849a77',
        strokeWidth: 0.7,
        pattern: 'diagonal',
        shortLabel: 'FGP',
      },
      sortOrder: 5,
      active: true,
      ...t,
    },
    {
      id: TIER_MAUSOLEUM,
      code: 'MAUSOLEUM',
      name: 'Mausoleum',
      category: 'mausoleum',
      // ASSUMED footprint — not on the client's price sheet.
      widthM: 2.5,
      lengthM: 3.0,
      capacity: 4,
      markerType: 'none',
      description: 'Above-ground entombment. Pricing not yet set.',
      appearance: {
        fillColor: '#d5c9d6',
        strokeColor: '#a598a7',
        strokeWidth: 0.7,
        pattern: 'cross',
        shortLabel: 'MAU',
      },
      sortOrder: 6,
      active: true,
      ...t,
    },
  ]
}

// ── price book ───────────────────────────────────────────────────────
/**
 * Three effectivity generations, so the versioning UI has real history and
 * the July promo can coexist with the list price — which is exactly the
 * ₱45,000-vs-₱60,000 distinction the client drew.
 */
export function seedPrices(adminId: UserId): PriceBookEntry[] {
  const out: PriceBookEntry[] = []
  let n = 0
  const add = (e: Omit<PriceBookEntry, 'id' | 'createdByUserId' | 'createdAt'>) => {
    out.push({
      ...e,
      id: asId<'Price'>(`price_${String(++n).padStart(3, '0')}`),
      createdByUserId: adminId,
      createdAt: NOW,
    })
  }

  // Current list prices — straight off the client's official price sheet.
  const LIST: [ReturnType<typeof asId<'Tier'>>, number][] = [
    [TIER_LAWN_STD, 60_000],
    [TIER_LAWN_PLUS, 66_000],
    [TIER_LAWN_PRIME, 72_000],
    [TIER_FG_STD, 264_000],
    [TIER_FG_PRIME, 288_000],
  ]

  // Generation 1 — launch pricing, ~15% below current.
  for (const [tierId, pesos] of LIST) {
    const launch = Math.round((pesos * 0.85) / 1000) * 1000
    for (const mode of ['spot_cash', 'installment'] as const) {
      add({
        tierId,
        needType: 'pre_need',
        paymentMode: mode,
        amountCentavos: toCentavos(launch),
        effectiveFrom: '2024-08-01',
        effectiveTo: '2026-01-01',
        label: 'Launch pricing',
        isPromo: false,
        note: null,
      })
    }
    add({
      tierId,
      needType: 'at_need',
      paymentMode: 'spot_cash',
      amountCentavos: toCentavos(launch * 2),
      effectiveFrom: '2024-08-01',
      effectiveTo: '2026-01-01',
      label: 'Launch pricing',
      isPromo: false,
      note: null,
    })
  }

  // Generation 2 — the current official list. At-need is exactly 2×.
  // Pre-need spot cash and installment carry the SAME amount: there is no
  // installment premium (see ASSUMPTIONS.interest).
  for (const [tierId, pesos] of LIST) {
    for (const mode of ['spot_cash', 'installment'] as const) {
      add({
        tierId,
        needType: 'pre_need',
        paymentMode: mode,
        amountCentavos: toCentavos(pesos),
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        label: '2026 List Price',
        isPromo: false,
        note:
          mode === 'installment'
            ? 'No interest or installment premium has been defined by the client.'
            : null,
      })
    }
    add({
      tierId,
      needType: 'at_need',
      paymentMode: 'spot_cash',
      amountCentavos: toCentavos(pesos * 2),
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      label: '2026 List Price',
      isPromo: false,
      note: null,
    })
  }

  // Generation 3 — the July 2026 spot-cash promo, lawn tiers only.
  const PROMO: [ReturnType<typeof asId<'Tier'>>, number][] = [
    [TIER_LAWN_STD, 45_000],
    [TIER_LAWN_PLUS, 48_000],
    [TIER_LAWN_PRIME, 50_000],
  ]
  for (const [tierId, pesos] of PROMO) {
    add({
      tierId,
      needType: 'pre_need',
      paymentMode: 'spot_cash',
      amountCentavos: toCentavos(pesos),
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-08-01',
      label: 'July 2026 Spot Cash Promo',
      isPromo: true,
      note: 'Spot cash only. Installment stays at list price.',
    })
  }

  // Mausoleum — no price on file anywhere.
  for (const needType of ['pre_need', 'at_need'] as const) {
    add({
      tierId: TIER_MAUSOLEUM,
      needType,
      paymentMode: 'spot_cash',
      amountCentavos: null,
      effectiveFrom: '2024-08-01',
      effectiveTo: null,
      label: null,
      isPromo: false,
      note: 'Not on the client price sheet — contact for pricing.',
    })
  }

  return out
}

// ── services ─────────────────────────────────────────────────────────
const ASSUMED_FEE = 'Placeholder amount — not supplied by the client.'

export function seedServices(): ServiceCatalogItem[] {
  const mk = (
    code: string,
    name: string,
    category: ServiceCatalogItem['category'],
    pesos: number,
    billing: ServiceCatalogItem['billing'],
  ): ServiceCatalogItem => ({
    id: asId<'Service'>(`svc_${code.toLowerCase()}`),
    code,
    name,
    category,
    defaultAmountCentavos: toCentavos(pesos),
    billing,
    active: true,
    note: ASSUMED_FEE,
    ...t,
  })

  return [
    mk('OPEN_CLOSE', 'Opening & Closing Fee', 'interment', 8_000, 'per_interment'),
    mk('OPEN_CLOSE_CHILD', 'Opening & Closing — Child', 'interment', 5_000, 'per_interment'),
    mk('MEM_CARE', 'Annual Memorial Care', 'maintenance', 1_200, 'recurring_annual'),
    mk('ENV_CLEAN', 'Environmental & Cleaning Service', 'environmental', 2_500, 'per_contract'),
    mk('BONE_TRANSFER', 'Bone Transfer Handling', 'transfer', 6_000, 'per_interment'),
    mk('OWNER_TRANSFER', 'Change of Ownership', 'transfer', 1_500, 'per_contract'),
  ]
}
