import { create } from 'zustand'
import {
  asId,
  type AuditEvent,
  type Centavos,
  type ISODate,
  type LotStatus,
  type NeedType,
  type PaymentMode,
  type PriceBookEntry,
  type PriceId,
  type ServiceCatalogItem,
  type ServiceId,
  type Tier,
  type TierAppearance,
  type TierId,
  type UserId,
} from '@/domain'
import { NOW } from '@/mock'
import {
  activePromos as activePromosOf,
  priceHistory as priceHistoryOf,
  resolvePrice,
  type ResolvedPrice,
} from '@/lib/price-resolver'
import { dataset, useDataset } from './dataset'

/**
 * The price book is APPEND-ONLY. Nothing in this file ever rewrites an
 * entry's amount. A repricing closes the superseded row's window and pushes
 * a new row, so a 2024 contract keeps resolving to its 2024 price forever.
 */

let priceSeq = 900
let tierSeq = 900
let serviceSeq = 900
let auditSeq = 900000

const nextPriceId = () => asId<'Price'>(`price_n${++priceSeq}`)

// ── the three combinations that actually exist ───────────────────────
/** At-need installment is not a product. It is not a column and never will be. */
export const PRICE_COMBINATIONS: {
  key: string
  needType: NeedType
  paymentMode: PaymentMode
  label: string
  group: 'Pre-need' | 'At-need'
}[] = [
  {
    key: 'pre_need:spot_cash',
    needType: 'pre_need',
    paymentMode: 'spot_cash',
    label: 'Spot cash',
    group: 'Pre-need',
  },
  {
    key: 'pre_need:installment',
    needType: 'pre_need',
    paymentMode: 'installment',
    label: 'Installment',
    group: 'Pre-need',
  },
  {
    key: 'at_need:spot_cash',
    needType: 'at_need',
    paymentMode: 'spot_cash',
    label: 'Spot cash',
    group: 'At-need',
  },
]

export const combinationKey = (n: NeedType, m: PaymentMode) => `${n}:${m}`

// ── mutation records, so an Undo can reverse both halves ─────────────
export interface PriceMutation {
  appendedId: PriceId
  supersededId: PriceId | null
  /** What the superseded row's effectiveTo was BEFORE we closed it. */
  supersededPrevEffectiveTo: ISODate | null
  auditIds: string[]
}

export interface PromoEndMutation {
  priceId: PriceId
  prevEffectiveTo: ISODate | null
  auditIds: string[]
}

export interface SetPriceInput {
  tierId: TierId
  needType: NeedType
  paymentMode: PaymentMode
  amountCentavos: Centavos | null
  effectiveFrom: ISODate
  label?: string | null
  isPromo?: boolean
  /** Only meaningful for a promo — the row closes itself on this date. */
  promoEndsOn?: ISODate | null
  note?: string | null
}

// ── window helpers ───────────────────────────────────────────────────
const inWindow = (e: PriceBookEntry, asOf: ISODate) =>
  e.effectiveFrom <= asOf && (e.effectiveTo === null || asOf < e.effectiveTo)

/**
 * The row a new entry supersedes: same combination, same promo-ness, in
 * force on the new entry's start date. A promo never closes the list price —
 * that is exactly how the July promo and the ₱60,000 list coexist.
 */
function rowInForce(
  book: PriceBookEntry[],
  tierId: TierId,
  needType: NeedType,
  paymentMode: PaymentMode,
  asOf: ISODate,
  isPromo: boolean,
): PriceBookEntry | null {
  const candidates = book.filter(
    (e) =>
      e.tierId === tierId &&
      e.needType === needType &&
      e.paymentMode === paymentMode &&
      e.isPromo === isPromo &&
      inWindow(e, asOf),
  )
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (b.effectiveFrom > a.effectiveFrom ? b : a))
}

function writeAudit(
  actorUserId: UserId,
  action: string,
  entityType: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string {
  const ev: AuditEvent = {
    id: asId<'Audit'>(`aud_${++auditSeq}`),
    actorUserId,
    action,
    entityType,
    entityId,
    before,
    after,
    at: NOW,
  }
  dataset().audit.unshift(ev)
  return ev.id
}

function dropAudit(ids: string[]) {
  const audit = dataset().audit
  for (const id of ids) {
    const i = audit.findIndex((a) => a.id === id)
    if (i >= 0) audit.splice(i, 1)
  }
}

// ── matrix memo ──────────────────────────────────────────────────────
export type PriceMatrix = Record<string, Record<string, ResolvedPrice>>

let matrixMemo: { key: string; value: PriceMatrix } | null = null

interface PricingStore {
  /** Bumped on every price-book write; selectors memoise against it. */
  bookVersion: number
  /** Bumped on tier / service writes. */
  catalogVersion: number

  // ── price book ─────────────────────────────────────────────────
  setPrice: (input: SetPriceInput, actorUserId: UserId) => PriceMutation
  setPriceBulk: (inputs: SetPriceInput[], actorUserId: UserId) => PriceMutation[]
  undoSetPrice: (mutations: PriceMutation[]) => void
  endPromo: (
    priceId: PriceId,
    effectiveTo: ISODate,
    actorUserId: UserId,
  ) => PromoEndMutation | null
  undoEndPromo: (m: PromoEndMutation) => void

  // ── tiers ──────────────────────────────────────────────────────
  createTier: (
    input: Omit<Tier, 'id' | 'createdAt' | 'updatedAt' | 'active'>,
    actorUserId: UserId,
  ) => Tier
  updateTier: (
    id: TierId,
    patch: Partial<Omit<Tier, 'id' | 'createdAt'>>,
    actorUserId: UserId,
  ) => void
  updateTierAppearance: (
    id: TierId,
    appearance: TierAppearance,
    actorUserId: UserId,
  ) => void
  archiveTier: (id: TierId, actorUserId: UserId) => boolean
  reorderTiers: (orderedIds: TierId[], actorUserId: UserId) => void

  // ── services ───────────────────────────────────────────────────
  createService: (
    input: Omit<ServiceCatalogItem, 'id' | 'createdAt' | 'updatedAt'>,
  ) => ServiceCatalogItem
  updateService: (
    id: ServiceId,
    patch: Partial<Omit<ServiceCatalogItem, 'id' | 'createdAt'>>,
  ) => void
  archiveService: (id: ServiceId) => void

  // ── selectors ──────────────────────────────────────────────────
  tiers: () => Tier[]
  prices: () => PriceBookEntry[]
  services: () => ServiceCatalogItem[]
  currentPriceMatrix: (asOf: ISODate) => PriceMatrix
  priceAt: (
    tierId: TierId,
    needType: NeedType,
    paymentMode: PaymentMode,
    asOf: ISODate,
  ) => ResolvedPrice
  priceHistory: (
    tierId: TierId,
    needType: NeedType,
    paymentMode: PaymentMode,
  ) => PriceBookEntry[]
  priceHistoryOfTier: (tierId: TierId) => PriceBookEntry[]
  activePromos: (asOf: ISODate) => PriceBookEntry[]
  lotCountsForTier: (tierId: TierId) => {
    total: number
    byStatus: Record<LotStatus, number>
  }
  contractsAtPrice: (priceId: PriceId) => number
  activeContractsForTier: (
    tierId: TierId,
    needType?: NeedType,
    paymentMode?: PaymentMode,
  ) => number
  serviceUsage: (serviceId: ServiceId) => number
}

export const usePricing = create<PricingStore>((set, get) => ({
  bookVersion: 0,
  catalogVersion: 0,

  // ── price book ─────────────────────────────────────────────────
  setPrice: (input, actorUserId) => {
    const book = dataset().prices
    const isPromo = input.isPromo ?? false

    const superseded = rowInForce(
      book,
      input.tierId,
      input.needType,
      input.paymentMode,
      input.effectiveFrom,
      isPromo,
    )

    const auditIds: string[] = []
    let supersededPrevEffectiveTo: ISODate | null = null

    // Close the outgoing window. This is the ONLY field we ever touch on an
    // existing row — the amount stays exactly as it was sold.
    if (
      superseded &&
      (superseded.effectiveTo === null || superseded.effectiveTo > input.effectiveFrom)
    ) {
      supersededPrevEffectiveTo = superseded.effectiveTo
      superseded.effectiveTo = input.effectiveFrom
    }

    const entry: PriceBookEntry = {
      id: nextPriceId(),
      tierId: input.tierId,
      needType: input.needType,
      paymentMode: input.paymentMode,
      amountCentavos: input.amountCentavos,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: isPromo ? (input.promoEndsOn ?? null) : null,
      label: input.label?.trim() ? input.label.trim() : null,
      isPromo,
      note: input.note ?? null,
      createdByUserId: actorUserId,
      createdAt: NOW,
    }
    book.push(entry)

    auditIds.push(
      writeAudit(
        actorUserId,
        'price.updated',
        'price',
        entry.id,
        superseded
          ? {
              priceId: superseded.id,
              amountCentavos: superseded.amountCentavos,
              effectiveTo: supersededPrevEffectiveTo,
            }
          : null,
        {
          priceId: entry.id,
          tierId: entry.tierId,
          needType: entry.needType,
          paymentMode: entry.paymentMode,
          amountCentavos: entry.amountCentavos,
          effectiveFrom: entry.effectiveFrom,
          effectiveTo: entry.effectiveTo,
          isPromo: entry.isPromo,
          label: entry.label,
        },
      ),
    )

    set({ bookVersion: get().bookVersion + 1 })
    useDataset.getState().touch()

    return {
      appendedId: entry.id,
      supersededId: superseded?.id ?? null,
      supersededPrevEffectiveTo,
      auditIds,
    }
  },

  setPriceBulk: (inputs, actorUserId) =>
    inputs.map((i) => get().setPrice(i, actorUserId)),

  undoSetPrice: (mutations) => {
    const book = dataset().prices
    // Reverse order so a chain of supersessions unwinds cleanly.
    for (const m of [...mutations].reverse()) {
      const i = book.findIndex((e) => e.id === m.appendedId)
      if (i >= 0) book.splice(i, 1)
      if (m.supersededId) {
        const prev = book.find((e) => e.id === m.supersededId)
        if (prev) prev.effectiveTo = m.supersededPrevEffectiveTo
      }
      dropAudit(m.auditIds)
    }
    set({ bookVersion: get().bookVersion + 1 })
    useDataset.getState().touch()
  },

  endPromo: (priceId, effectiveTo, actorUserId) => {
    const entry = dataset().prices.find((e) => e.id === priceId)
    if (!entry) return null
    const prev = entry.effectiveTo
    entry.effectiveTo = effectiveTo
    const auditIds = [
      writeAudit(
        actorUserId,
        'price.updated',
        'price',
        entry.id,
        { effectiveTo: prev },
        { effectiveTo, endedEarly: true },
      ),
    ]
    set({ bookVersion: get().bookVersion + 1 })
    useDataset.getState().touch()
    return { priceId, prevEffectiveTo: prev, auditIds }
  },

  undoEndPromo: (m) => {
    const entry = dataset().prices.find((e) => e.id === m.priceId)
    if (entry) entry.effectiveTo = m.prevEffectiveTo
    dropAudit(m.auditIds)
    set({ bookVersion: get().bookVersion + 1 })
    useDataset.getState().touch()
  },

  // ── tiers ──────────────────────────────────────────────────────
  createTier: (input, actorUserId) => {
    const tier: Tier = {
      ...input,
      id: asId<'Tier'>(`tier_n${++tierSeq}`),
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    }
    dataset().tiers.push(tier)
    writeAudit(actorUserId, 'tier.updated', 'tier', tier.id, null, {
      created: true,
      name: tier.name,
      code: tier.code,
    })
    set({ catalogVersion: get().catalogVersion + 1 })
    useDataset.getState().touch()
    return tier
  },

  updateTier: (id, patch, actorUserId) => {
    const tier = dataset().tiers.find((t) => t.id === id)
    if (!tier) return
    const before = {
      name: tier.name,
      widthM: tier.widthM,
      lengthM: tier.lengthM,
      capacity: tier.capacity,
      appearance: { ...tier.appearance },
    }
    // Capacity and dimensions live on the tier only. Existing lots keep the
    // capacity they were generated with — it is snapshotted on the lot.
    Object.assign(tier, patch, { updatedAt: NOW })
    writeAudit(actorUserId, 'tier.updated', 'tier', tier.id, before, {
      name: tier.name,
      widthM: tier.widthM,
      lengthM: tier.lengthM,
      capacity: tier.capacity,
      appearance: { ...tier.appearance },
    })
    set({ catalogVersion: get().catalogVersion + 1 })
    useDataset.getState().touch()
  },

  updateTierAppearance: (id, appearance, actorUserId) => {
    get().updateTier(id, { appearance }, actorUserId)
  },

  archiveTier: (id, actorUserId) => {
    // A tier still painting lots on the map cannot be archived.
    if (get().lotCountsForTier(id).total > 0) return false
    const tier = dataset().tiers.find((t) => t.id === id)
    if (!tier) return false
    tier.active = false
    tier.updatedAt = NOW
    writeAudit(
      actorUserId,
      'tier.updated',
      'tier',
      tier.id,
      { active: true },
      { active: false },
    )
    set({ catalogVersion: get().catalogVersion + 1 })
    useDataset.getState().touch()
    return true
  },

  reorderTiers: (orderedIds, actorUserId) => {
    const tiers = dataset().tiers
    orderedIds.forEach((id, i) => {
      const t = tiers.find((x) => x.id === id)
      if (t) {
        t.sortOrder = i + 1
        t.updatedAt = NOW
      }
    })
    writeAudit(actorUserId, 'tier.updated', 'tier', 'order', null, {
      order: orderedIds,
    })
    set({ catalogVersion: get().catalogVersion + 1 })
    useDataset.getState().touch()
  },

  // ── services ───────────────────────────────────────────────────
  createService: (input) => {
    const svc: ServiceCatalogItem = {
      ...input,
      id: asId<'Service'>(`svc_n${++serviceSeq}`),
      createdAt: NOW,
      updatedAt: NOW,
    }
    dataset().services.push(svc)
    set({ catalogVersion: get().catalogVersion + 1 })
    useDataset.getState().touch()
    return svc
  },

  updateService: (id, patch) => {
    const svc = dataset().services.find((s) => s.id === id)
    if (!svc) return
    Object.assign(svc, patch, { updatedAt: NOW })
    set({ catalogVersion: get().catalogVersion + 1 })
    useDataset.getState().touch()
  },

  archiveService: (id) => {
    // Historical service lines keep their own snapshotted amounts.
    get().updateService(id, { active: false })
  },

  // ── selectors ──────────────────────────────────────────────────
  tiers: () => [...dataset().tiers].sort((a, b) => a.sortOrder - b.sortOrder),
  prices: () => dataset().prices,
  services: () => dataset().services,

  currentPriceMatrix: (asOf) => {
    const key = `${asOf}|${get().bookVersion}|${get().catalogVersion}`
    if (matrixMemo?.key === key) return matrixMemo.value

    const book = dataset().prices
    const out: PriceMatrix = {}
    for (const tier of get().tiers()) {
      const row: Record<string, ResolvedPrice> = {}
      for (const c of PRICE_COMBINATIONS) {
        row[c.key] = resolvePrice(book, tier.id, c.needType, c.paymentMode, asOf)
      }
      out[tier.id] = row
    }
    matrixMemo = { key, value: out }
    return out
  },

  priceAt: (tierId, needType, paymentMode, asOf) =>
    resolvePrice(dataset().prices, tierId, needType, paymentMode, asOf),

  priceHistory: (tierId, needType, paymentMode) =>
    priceHistoryOf(dataset().prices, tierId, needType, paymentMode),

  priceHistoryOfTier: (tierId) =>
    dataset()
      .prices.filter((e) => e.tierId === tierId)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)),

  activePromos: (asOf) => activePromosOf(dataset().prices, asOf),

  lotCountsForTier: (tierId) => {
    const byStatus: Record<LotStatus, number> = {
      available: 0,
      held: 0,
      sold: 0,
      occupied: 0,
      not_for_sale: 0,
    }
    let total = 0
    for (const l of dataset().lots) {
      if (l.tierId !== tierId) continue
      total += 1
      byStatus[l.status] += 1
    }
    return { total, byStatus }
  },

  contractsAtPrice: (priceId) =>
    dataset().contracts.filter(
      (c) => c.priceBookEntryId === priceId && c.status !== 'cancelled',
    ).length,

  activeContractsForTier: (tierId, needType, paymentMode) => {
    const lotIds = new Set(
      dataset()
        .lots.filter((l) => l.tierId === tierId)
        .map((l) => l.id),
    )
    return dataset().contracts.filter(
      (c) =>
        lotIds.has(c.lotId) &&
        (c.status === 'active' || c.status === 'fully_paid') &&
        (needType === undefined || c.needType === needType) &&
        (paymentMode === undefined || c.paymentMode === paymentMode),
    ).length
  },

  serviceUsage: (serviceId) =>
    dataset().serviceLines.filter((l) => l.serviceId === serviceId).length,
}))
