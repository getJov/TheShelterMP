import {
  AUDIT_ACTIONS,
  asId,
  clientFullName,
  deceasedFullName,
  formatLotCode,
  SLOT_LABEL,
  STATUS_APPEARANCE,
  type AuditEvent,
  type LotStatus,
  type UserId,
} from '@/domain'
import { NOW, type Dataset } from '@/mock'
import { dataset } from '@/stores/dataset'
import { formatPeso } from './money'
import { fmtDate } from './dates'

/**
 * The audit trail.
 *
 * Two jobs, and only two: append an event, and render one in plain language.
 * `describe()` is the ONLY place a raw action key is allowed to be read — if
 * a string like `hold.approved` ever reaches the screen it is a bug here, not
 * in the feature that logged it.
 *
 * Append-only. Nothing in this file edits or removes an event; an undone
 * decision writes a NEW event flagged `undone` rather than erasing the first.
 */

let seq = 0

export function record(
  actorUserId: UserId,
  action: string,
  entityType: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
): AuditEvent {
  const event: AuditEvent = {
    id: asId<'Audit'>(`aud_r${(++seq).toString(36)}${Date.now().toString(36)}`),
    actorUserId,
    action,
    entityType,
    entityId,
    before: (before ?? null) as Record<string, unknown> | null,
    after: (after ?? null) as Record<string, unknown> | null,
    at: NOW,
  }
  dataset().audit.unshift(event)
  return event
}

// ── vocabulary ───────────────────────────────────────────────────────

/** Short labels for the audit-log action filter. Never rendered as a sentence. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'lot.status_changed': 'Lot status changed',
  'lot.tier_changed': 'Lot tier changed',
  'block.created': 'Block created',
  'overlay.published': 'Overlay published',
  'hold.requested': 'Hold requested',
  'hold.approved': 'Hold approved',
  'hold.rejected': 'Hold rejected',
  'hold.expired': 'Hold expired',
  'contract.created': 'Contract created',
  'contract.approved': 'Contract approved',
  'contract.cancelled': 'Contract cancelled',
  'payment.posted': 'Payment posted',
  'payment.voided': 'Payment voided',
  'certificate.issued': 'Certificate issued',
  'price.updated': 'Price updated',
  'tier.updated': 'Tier updated',
  'commission.rule_updated': 'Commission rule updated',
  'payout.approved': 'Payout approved',
  'payout.released': 'Payout released',
  'agent.created': 'Agent record changed',
  'agent.archived': 'Agent archived',
  'interment.scheduled': 'Interment scheduled',
  'interment.completed': 'Interment completed',
  'interment.cancelled': 'Interment cancelled',
  'transfer.requested': 'Transfer requested',
  'transfer.approved': 'Transfer decided',
}

export const KNOWN_ACTIONS: string[] = [...AUDIT_ACTIONS, 'transfer.requested']

/** Display names for the `entityType` column. Matched case-insensitively. */
const ENTITY_LABEL: Record<string, string> = {
  lot: 'Lot',
  block: 'Block',
  mapoverlay: 'Overlay',
  overlay: 'Overlay',
  hold: 'Hold',
  contract: 'Contract',
  payment: 'Payment',
  price: 'Price',
  pricebookentry: 'Price',
  tier: 'Tier',
  commissionrule: 'Commission rule',
  commissionentry: 'Commission',
  payoutrun: 'Payout run',
  agentprofile: 'Agent',
  interment: 'Interment',
  transfer: 'Transfer',
  job: 'Grounds job',
}

export function entityTypeLabel(entityType: string): string {
  return ENTITY_LABEL[entityType.toLowerCase()] ?? sentence(entityType)
}

// ── small formatting helpers ─────────────────────────────────────────

const sentence = (s: string) =>
  s
    .replace(/[._]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())

const words = (v: unknown): string => String(v ?? '').replace(/_/g, ' ').trim()

const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s)

const statusWords = (v: unknown): string => {
  const key = String(v ?? '') as LotStatus
  const a = STATUS_APPEARANCE[key]
  return a ? a.label.toLowerCase() : words(v) || 'unknown'
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

const money = (v: unknown): string | null => {
  const n = num(v)
  return n === null ? null : formatPeso(n)
}

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/** First present, non-empty value across a set of candidate keys. */
function pick(bag: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = bag[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

// ── entity resolvers ─────────────────────────────────────────────────

function lotCodeOf(ctx: Dataset, lotId: unknown): string | null {
  const id = str(lotId)
  if (!id) return null
  const lot = ctx.lots.find((l) => l.id === id)
  if (!lot) return null
  const block = ctx.blocks.find((b) => b.id === lot.blockId)
  return formatLotCode(block?.code ?? 'B??', lot.lotNumber)
}

function tierNameOf(ctx: Dataset, tierId: unknown): string | null {
  const id = str(tierId)
  if (!id) return null
  return ctx.tiers.find((t) => t.id === id)?.name ?? null
}

function clientNameOf(ctx: Dataset, clientId: unknown): string | null {
  const id = str(clientId)
  if (!id) return null
  const c = ctx.clients.find((x) => x.id === id)
  return c ? clientFullName(c) : null
}

function agentNameOf(ctx: Dataset, agentId: unknown): string | null {
  const id = str(agentId)
  if (!id) return null
  const a = ctx.agents.find((x) => x.id === id)
  if (!a) return null
  return ctx.users.find((u) => u.id === a.userId)?.fullName ?? a.agentCode
}

export function actorNameOf(ctx: Dataset, userId: unknown): string {
  const id = str(userId)
  if (!id) return 'Someone'
  return ctx.users.find((u) => u.id === id)?.fullName ?? 'A former user'
}

/** The lot a Hold event refers to — its entityId is the hold, not the lot. */
function holdLotCode(ctx: Dataset, e: AuditEvent): string | null {
  const fromAfter = lotCodeOf(ctx, (e.after ?? {}).lotId)
  if (fromAfter) return fromAfter
  const hold = ctx.holds.find((h) => h.id === e.entityId)
  return hold ? lotCodeOf(ctx, hold.lotId) : null
}

function contractNoOf(ctx: Dataset, contractId: unknown): string | null {
  const id = str(contractId)
  if (!id) return null
  return ctx.contracts.find((c) => c.id === id)?.contractNo ?? null
}

function paymentContractNo(ctx: Dataset, e: AuditEvent): string | null {
  const payment = ctx.payments.find((p) => p.id === e.entityId)
  return payment ? contractNoOf(ctx, payment.contractId) : null
}

function intermentOf(ctx: Dataset, e: AuditEvent) {
  return ctx.interments.find((i) => i.id === e.entityId) ?? null
}

function runOf(ctx: Dataset, e: AuditEvent) {
  return ctx.payoutRuns.find((r) => r.id === e.entityId) ?? null
}

const runPeriod = (ctx: Dataset, e: AuditEvent): string => {
  const run = runOf(ctx, e)
  return run ? `${fmtDate(run.periodStart)} → ${fmtDate(run.periodEnd)}` : 'the current period'
}

// ── the one switch ───────────────────────────────────────────────────

/**
 * Plain-language rendering of an audit event. Falls back to a humanised form
 * of the action key so an event logged by a future spec still reads as a
 * sentence rather than as a machine token.
 */
export function describe(e: AuditEvent, ctx: Dataset = dataset()): string {
  const after = e.after ?? {}
  if (after.undone === true) {
    const { undone: _drop, ...rest } = after
    void _drop
    return `Reversed — ${lowerFirst(
      describeAction({ ...e, after: rest as Record<string, unknown> }, ctx),
    )}`
  }
  return describeAction(e, ctx)
}

function describeAction(e: AuditEvent, ctx: Dataset): string {
  const a = e.after ?? {}
  const b = e.before ?? {}

  switch (e.action) {
    // ── inventory ──
    case 'lot.status_changed': {
      const lot = lotCodeOf(ctx, e.entityId) ?? 'a lot'
      return `Changed ${lot} from ${statusWords(b.status)} to ${statusWords(a.status)}`
    }
    case 'lot.tier_changed': {
      const lot = lotCodeOf(ctx, e.entityId) ?? 'a lot'
      const tier = tierNameOf(ctx, pick(a, 'tierId', 'tier')) ?? words(pick(a, 'tier'))
      return tier ? `Moved ${lot} to the ${tier} tier` : `Changed the tier on ${lot}`
    }
    case 'block.created':
      return `Created block ${str(pick(a, 'code', 'name')) ?? e.entityId}`
    case 'overlay.published': {
      const name = str(pick(a, 'name', 'label'))
      return name ? `Published the map overlay “${name}”` : 'Published a map overlay'
    }

    // ── holds ──
    case 'hold.requested': {
      const lot = holdLotCode(ctx, e) ?? 'a lot'
      const who = clientNameOf(ctx, a.clientId) ?? str(a.prospectName)
      return who
        ? `Requested a hold on ${lot} for ${who}`
        : `Requested a hold on ${lot}`
    }
    case 'hold.approved':
      return `Approved the hold on ${holdLotCode(ctx, e) ?? 'a lot'}`
    case 'hold.rejected':
      return `Rejected the hold on ${holdLotCode(ctx, e) ?? 'a lot'}`
    case 'hold.expired':
      return `The hold on ${holdLotCode(ctx, e) ?? 'a lot'} lapsed — the lot returned to available`

    // ── contracts ──
    case 'contract.created': {
      const no = str(a.contractNo) ?? contractNoOf(ctx, e.entityId) ?? 'a contract'
      const amount = money(pick(a, 'contractPriceCentavos', 'amount', 'amountCentavos'))
      return amount ? `Drew up contract ${no} for ${amount}` : `Drew up contract ${no}`
    }
    case 'contract.approved':
      return `Approved contract ${contractNoOf(ctx, e.entityId) ?? e.entityId}`
    case 'contract.cancelled': {
      const no = contractNoOf(ctx, e.entityId) ?? e.entityId
      const reason = str(pick(a, 'reason', 'cancelReason'))
      return reason ? `Cancelled contract ${no} — ${reason}` : `Cancelled contract ${no}`
    }
    case 'certificate.issued': {
      const no = contractNoOf(ctx, e.entityId) ?? e.entityId
      const cert = str(a.certificateNo)
      return cert
        ? `Issued certificate of ownership ${cert} on ${no}`
        : `Issued the certificate of ownership on ${no}`
    }

    // ── payments ──
    case 'payment.posted': {
      const amount = money(pick(a, 'amountCentavos', 'amount')) ?? 'a payment'
      const no = paymentContractNo(ctx, e) ?? str(a.contractNo)
      return no
        ? `Posted a payment of ${amount} on ${no}`
        : `Posted a payment of ${amount}`
    }
    case 'payment.voided': {
      const or = str(pick(a, 'orNo')) ?? null
      const no = paymentContractNo(ctx, e)
      const reason = str(a.reason)
      const what = or ? `receipt ${or}` : 'a payment'
      return [
        `Voided ${what}${no ? ` on ${no}` : ''}`,
        reason ? ` — ${reason}` : '',
      ].join('')
    }

    // ── pricing ──
    case 'price.updated': {
      const tier =
        tierNameOf(ctx, pick(a, 'tierId')) ??
        str(pick(a, 'label')) ??
        'a price'
      const from = money(pick(b, 'amountCentavos', 'amount'))
      const to = money(pick(a, 'amountCentavos', 'amount'))
      if (a.endedEarly === true) return `Ended the ${tier} price early`
      if (from && to) return `Changed the ${tier} price from ${from} to ${to}`
      if (to) return `Set the ${tier} price to ${to}`
      return `Updated the ${tier} price`
    }
    case 'tier.updated': {
      if (a.order) return 'Reordered the tiers'
      const tier = tierNameOf(ctx, e.entityId) ?? str(pick(a, 'name')) ?? 'a tier'
      if (a.created === true) return `Created the ${tier} tier`
      if (a.active === false) return `Retired the ${tier} tier`
      return `Updated the ${tier} tier`
    }

    // ── commissions & payouts ──
    case 'commission.rule_updated': {
      const level = words(pick(a, 'label', 'level')) || 'a'
      const rate = num(a.ratePercent)
      const was = num(b.ratePercent)
      if (rate !== null && was !== null)
        return `Changed the ${level} commission rate from ${was}% to ${rate}%`
      if (rate !== null) return `Set the ${level} commission rate to ${rate}%`
      return `Updated the ${level} commission rule`
    }
    case 'payout.approved': {
      const period = runPeriod(ctx, e)
      const total = money(pick(a, 'totalCentavos'))
      if (a.decision === 'rejected') {
        const reason = str(a.reason)
        return `Sent the payout run for ${period} back for revision${
          reason ? ` — ${reason}` : ''
        }`
      }
      if (a.status === 'pending_approval') {
        const n = num(a.entryCount)
        return `Closed the payout run for ${period}${
          n !== null ? ` — ${n} ${n === 1 ? 'entry' : 'entries'}` : ''
        }${total ? `, ${total}` : ''}`
      }
      return `Approved the payout run for ${period}${total ? ` (${total})` : ''}`
    }
    case 'payout.released': {
      // Also used when a clawback is recovered by hand against one entry.
      if (e.entityType === 'CommissionEntry') {
        const amount = money(pick(a, 'amountCentavos'))
        const note = str(a.recoveredNote)
        return `Recorded a clawback recovery${amount ? ` of ${amount}` : ''}${
          note ? ` — ${note}` : ''
        }`
      }
      const total = money(pick(a, 'totalCentavos'))
      const agents = num(a.agents)
      return `Released ${total ?? 'the payout run'} to ${
        agents !== null ? `${agents} agent${agents === 1 ? '' : 's'}` : 'the agents'
      } for ${runPeriod(ctx, e)}`
    }

    // ── agents ──
    case 'agent.created': {
      const name =
        str(pick(a, 'fullName')) ?? agentNameOf(ctx, e.entityId) ?? 'an agent'
      if (a.restored === true) return `Restored ${name}'s access`
      if (a.note === 'upline reassigned — future contracts only')
        return `Reassigned ${name}'s upline — future contracts only`
      if (e.before === null) return `Added ${name} to the roster`
      return `Updated ${name}'s agent record`
    }
    case 'agent.archived': {
      const name = agentNameOf(ctx, e.entityId) ?? 'an agent'
      const reason = str(a.reason)
      return reason ? `Archived ${name} — ${reason}` : `Archived ${name}`
    }

    // ── burials ──
    case 'interment.scheduled': {
      const i = intermentOf(ctx, e)
      const who = str(pick(a, 'deceased')) ?? (i ? deceasedFullName(i) : 'the deceased')
      const lot = lotCodeOf(ctx, i?.lotId) ?? str(pick(a, 'lot'))
      if (b.status === 'requested')
        return `Approved the interment of ${who}${lot ? ` at ${lot}` : ''}`
      if (b.date || b.slot) {
        const date = str(pick(a, 'date')) ?? i?.scheduledDate ?? null
        const slot = String(pick(a, 'slot') ?? i?.slot ?? '') as keyof typeof SLOT_LABEL
        return `Moved the interment of ${who} to ${date ? fmtDate(date) : 'a new date'}${
          SLOT_LABEL[slot] ? `, ${SLOT_LABEL[slot].toLowerCase()}` : ''
        }`
      }
      const date = str(pick(a, 'date')) ?? i?.scheduledDate ?? null
      const slot = String(pick(a, 'slot') ?? i?.slot ?? '') as keyof typeof SLOT_LABEL
      const requested = a.status === 'requested'
      return `${requested ? 'Requested' : 'Booked'} the interment of ${who}${
        lot ? ` at ${lot}` : ''
      }${date ? ` on ${fmtDate(date)}` : ''}${
        SLOT_LABEL[slot] ? `, ${SLOT_LABEL[slot].toLowerCase()}` : ''
      }`
    }
    case 'interment.completed': {
      const i = intermentOf(ctx, e)
      const who = str(pick(a, 'deceased')) ?? (i ? deceasedFullName(i) : 'the deceased')
      const lot = lotCodeOf(ctx, i?.lotId)
      return `Completed the interment of ${who}${lot ? ` at ${lot}` : ''}`
    }
    case 'interment.cancelled': {
      const i = intermentOf(ctx, e)
      const who = i ? deceasedFullName(i) : 'the deceased'
      const reason = str(a.reason)
      return `Cancelled the interment of ${who}${reason ? ` — ${reason}` : ''}`
    }

    // ── ownership ──
    case 'transfer.requested': {
      const t = ctx.transfers.find((x) => x.id === e.entityId)
      const lot = lotCodeOf(ctx, t?.lotId)
      const to = clientNameOf(ctx, pick(a, 'to')) ?? clientNameOf(ctx, t?.toClientId)
      return `Filed a change of ownership${lot ? ` on ${lot}` : ''}${
        to ? ` to ${to}` : ''
      }`
    }
    case 'transfer.approved': {
      const t = ctx.transfers.find((x) => x.id === e.entityId)
      const lot = lotCodeOf(ctx, t?.lotId)
      const to = clientNameOf(ctx, t?.toClientId)
      const rejected = str(a.decision) === 'rejected'
      return `${rejected ? 'Rejected' : 'Approved'} the change of ownership${
        lot ? ` on ${lot}` : ''
      }${!rejected && to ? ` to ${to}` : ''}`
    }

    default:
      // A key from a spec that has not taught describe() its wording yet —
      // still a sentence, never a token.
      return `${sentence(e.action)} on ${entityTypeLabel(e.entityType).toLowerCase()} ${e.entityId}`
  }
}

// ── links out of the log ─────────────────────────────────────────────

/** Where the entity column points. Null when nothing sensible exists. */
export function entityHref(e: AuditEvent, ctx: Dataset = dataset()): string | null {
  const type = e.entityType.toLowerCase()
  switch (type) {
    case 'lot': {
      const code = lotCodeOf(ctx, e.entityId)
      return code ? `/map?lot=${code}` : '/map'
    }
    case 'hold': {
      const code = holdLotCode(ctx, e)
      return code ? `/map?lot=${code}` : '/map'
    }
    case 'contract':
    case 'payment':
    case 'transfer':
      return '/sales'
    case 'interment':
      return `/burials/${e.entityId}`
    case 'payoutrun':
      return `/agents/payouts/${e.entityId}`
    case 'commissionentry':
      return '/agents/commissions'
    case 'commissionrule':
      return '/agents/rules'
    case 'agentprofile':
      return `/agents/${e.entityId}`
    case 'price':
    case 'pricebookentry':
    case 'tier':
      return '/pricing'
    case 'block':
    case 'mapoverlay':
    case 'overlay':
      return '/map-editor'
    default:
      return null
  }
}

// ── before / after diff ──────────────────────────────────────────────

export interface DiffRow {
  key: string
  label: string
  before: string | null
  after: string | null
  changed: boolean
}

const HIDDEN_KEYS = new Set(['undone', 'undoneBy'])

function formatValue(key: string, v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.length ? v.map((x) => formatValue(key, x) ?? '—').join(', ') : 'None'
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
    return entries.length
      ? entries.map(([k, x]) => `${sentence(k)}: ${formatValue(k, x) ?? '—'}`).join(' · ')
      : 'None'
  }
  if (typeof v === 'number') {
    if (/centavos$/i.test(key)) return formatPeso(v)
    if (/percent$/i.test(key)) return `${v}%`
    return String(v)
  }
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return fmtDate(s)
  if (/status|level|mode|type|slot|decision/i.test(key)) return sentence(words(s))
  return s
}

/**
 * Union of the keys on both sides, in a stable order, with the changed ones
 * flagged so the diff can highlight exactly what moved.
 */
export function diffFields(e: AuditEvent): DiffRow[] {
  const before = e.before ?? {}
  const after = e.after ?? {}
  const keys: string[] = []
  for (const k of [...Object.keys(before), ...Object.keys(after)]) {
    if (!HIDDEN_KEYS.has(k) && !keys.includes(k)) keys.push(k)
  }
  return keys.map((k) => {
    const bv = formatValue(k, before[k])
    const av = formatValue(k, after[k])
    return {
      key: k,
      label: sentence(k),
      before: bv,
      after: av,
      changed: bv !== av,
    }
  })
}
