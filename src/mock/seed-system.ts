import {
  asId,
  clientFullName,
  deceasedFullName,
  formatLotCode,
  type ApprovalTask,
  type AuditEvent,
  type Block,
  type Client,
  type Contract,
  type Hold,
  type Interment,
  type Lot,
  type Notification,
  type PayoutRun,
  type User,
} from '@/domain'
import { formatPeso } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import type { Rng } from './rng'
import { atHour, NOW, TODAY } from './time'
import { addDays } from '@/lib/dates'

export interface SystemSeed {
  approvals: ApprovalTask[]
  notifications: Notification[]
  audit: AuditEvent[]
}

export function seedSystem(
  rng: Rng,
  ctx: {
    users: User[]
    lots: Lot[]
    blocks: Block[]
    clients: Client[]
    holds: Hold[]
    contracts: Contract[]
    interments: Interment[]
    payoutRuns: PayoutRun[]
  },
): SystemSeed {
  const approvals: ApprovalTask[] = []
  const notifications: Notification[] = []
  const audit: AuditEvent[] = []

  const blockById = new Map(ctx.blocks.map((b) => [b.id, b]))
  const lotById = new Map(ctx.lots.map((l) => [l.id, l]))
  const clientById = new Map(ctx.clients.map((c) => [c.id, c]))
  const admins = ctx.users.filter((u) => u.role === 'admin')
  const owner = ctx.users.find((u) => u.role === 'owner')!

  const lotCode = (lotId: string) => {
    const lot = lotById.get(lotId as never)
    if (!lot) return '—'
    return formatLotCode(blockById.get(lot.blockId)?.code ?? 'B??', lot.lotNumber)
  }

  const managerFor = (locationId: string) =>
    ctx.users.find(
      (u) => u.role === 'manager' && u.locationIds.includes(locationId as never),
    )

  let aSeq = 0
  let nSeq = 0
  let auSeq = 0

  const addApproval = (a: Omit<ApprovalTask, 'id' | 'createdAt' | 'updatedAt'>) => {
    approvals.push({
      ...a,
      id: asId<'Approval'>(`apr_${String(++aSeq).padStart(4, '0')}`),
      createdAt: a.requestedAt,
      updatedAt: a.requestedAt,
    })
  }

  const notify = (
    userId: User['id'],
    kind: Notification['kind'],
    title: string,
    body: string,
    href: string | null,
    createdAt: string,
    read: boolean,
  ) => {
    notifications.push({
      id: asId<'Notification'>(`ntf_${String(++nSeq).padStart(4, '0')}`),
      userId,
      kind,
      title,
      body,
      entityRef: null,
      href,
      readAt: read ? NOW : null,
      createdAt,
    })
  }

  // ── approvals: pending holds ─────────────────────────────────────
  for (const h of ctx.holds.filter((x) => x.status === 'pending')) {
    const who =
      h.prospectName ??
      (h.clientId ? clientFullName(clientById.get(h.clientId)!) : 'a walk-in family')
    const requester = ctx.users.find((u) => u.id === h.requestedByUserId)

    addApproval({
      kind: 'hold',
      entityId: h.id,
      locationId: h.locationId,
      title: `Hold on ${lotCode(h.lotId)}`,
      summary: `Requested by ${requester?.fullName ?? 'an agent'} for ${who}. Expires ${fmtDate(h.expiresAt)}.`,
      requestedByUserId: h.requestedByUserId,
      requestedAt: h.requestedAt,
      status: 'pending',
      decidedByUserId: null,
      decidedAt: null,
      decisionNote: null,
    })

    // Targeted: the manager of THAT lot's location, plus admins.
    const mgr = managerFor(h.locationId)
    if (mgr) {
      notify(
        mgr.id,
        'hold_requested',
        `Hold requested on ${lotCode(h.lotId)}`,
        `${requester?.fullName ?? 'An agent'} requested a hold for ${who}.`,
        '/approvals',
        h.requestedAt,
        false,
      )
    }
    for (const a of admins) {
      notify(
        a.id,
        'hold_requested',
        `Hold requested on ${lotCode(h.lotId)}`,
        `${requester?.fullName ?? 'An agent'} requested a hold for ${who}.`,
        '/approvals',
        h.requestedAt,
        rng.bool(0.6),
      )
    }
  }

  // ── approvals: contracts awaiting approval ───────────────────────
  for (const c of ctx.contracts.filter((x) => x.status === 'pending_approval')) {
    const client = clientById.get(c.clientId)
    addApproval({
      kind: 'contract',
      entityId: c.id,
      locationId: c.locationId,
      title: `${c.contractNo} · ${lotCode(c.lotId)}`,
      summary: `${client ? clientFullName(client) : 'Buyer'} · ${formatPeso(c.contractPriceCentavos)} · ${c.needType === 'at_need' ? 'At-need' : 'Pre-need'}, ${c.paymentMode === 'spot_cash' ? 'spot cash' : `${c.termMonths} months`}.`,
      requestedByUserId: ctx.users.find((u) => u.role === 'agent')!.id,
      requestedAt: atHour(c.signedAt, 11),
      status: 'pending',
      decidedByUserId: null,
      decidedAt: null,
      decisionNote: null,
    })
  }

  // ── approvals: requested interments ──────────────────────────────
  for (const i of ctx.interments.filter((x) => x.status === 'requested')) {
    addApproval({
      kind: 'interment',
      entityId: i.id,
      locationId: i.locationId,
      title: `Interment · ${lotCode(i.lotId)}`,
      summary: `${deceasedFullName(i)} · ${fmtDate(i.scheduledDate)}, ${i.slot}.`,
      requestedByUserId: i.requestedByUserId,
      requestedAt: i.createdAt,
      status: 'pending',
      decidedByUserId: null,
      decidedAt: null,
      decisionNote: null,
    })
  }

  // ── approvals: the payout run awaiting approval ──────────────────
  for (const r of ctx.payoutRuns.filter((x) => x.status === 'pending_approval')) {
    addApproval({
      kind: 'payout_run',
      entityId: r.id,
      locationId: ctx.holds[0]?.locationId ?? ('loc_ilg' as never),
      title: `Payout run · ${fmtDate(r.periodStart)} → ${fmtDate(r.periodEnd)}`,
      summary: `${r.entryCount} entries · ${formatPeso(r.totalCentavos)} · release ${fmtDate(r.releaseDate)}.`,
      requestedByUserId: admins[0]!.id,
      requestedAt: atHour(r.periodEnd, 17),
      status: 'pending',
      decidedByUserId: null,
      decidedAt: null,
      decisionNote: null,
    })
    notify(
      owner.id,
      'payout_ready',
      'Payout run ready for approval',
      `${r.entryCount} entries totalling ${formatPeso(r.totalCentavos)}.`,
      '/agents/payouts',
      atHour(r.periodEnd, 17),
      false,
    )
  }

  // ── a few agent-facing notifications ─────────────────────────────
  const agentUsers = ctx.users.filter(
    (u) => u.role === 'agent' && u.status === 'active',
  )
  for (const a of agentUsers.slice(0, 5)) {
    notify(
      a.id,
      'payout_ready',
      'Commission released',
      'Your commission for last week has been released.',
      '/agents',
      atHour(addDays(TODAY, -3), 15),
      rng.bool(0.7),
    )
  }

  // ── audit ────────────────────────────────────────────────────────
  const recentContracts = ctx.contracts.slice(-20)
  for (const c of recentContracts) {
    audit.push({
      id: asId<'Audit'>(`aud_${String(++auSeq).padStart(5, '0')}`),
      actorUserId: c.approvedByUserId ?? admins[0]!.id,
      action: 'contract.created',
      entityType: 'Contract',
      entityId: c.id,
      before: null,
      after: { contractNo: c.contractNo, amount: c.contractPriceCentavos },
      at: atHour(c.signedAt, 10),
    })
    if (c.certificateNo) {
      audit.push({
        id: asId<'Audit'>(`aud_${String(++auSeq).padStart(5, '0')}`),
        actorUserId: admins[0]!.id,
        action: 'certificate.issued',
        entityType: 'Contract',
        entityId: c.id,
        before: null,
        after: { certificateNo: c.certificateNo },
        at: atHour(c.certificateIssuedAt!, 11),
      })
    }
  }

  for (const h of ctx.holds.filter((x) => x.status === 'approved').slice(0, 8)) {
    audit.push({
      id: asId<'Audit'>(`aud_${String(++auSeq).padStart(5, '0')}`),
      actorUserId: h.decidedByUserId ?? admins[0]!.id,
      action: 'hold.approved',
      entityType: 'Hold',
      entityId: h.id,
      before: { status: 'pending' },
      after: { status: 'approved' },
      at: h.decidedAt ?? h.requestedAt,
    })
  }

  for (const i of ctx.interments.filter((x) => x.status === 'completed').slice(0, 12)) {
    audit.push({
      id: asId<'Audit'>(`aud_${String(++auSeq).padStart(5, '0')}`),
      actorUserId: i.requestedByUserId,
      action: 'interment.completed',
      entityType: 'Interment',
      entityId: i.id,
      before: null,
      after: { deceased: deceasedFullName(i), date: i.scheduledDate },
      at: atHour(i.scheduledDate, 17),
    })
  }

  audit.push({
    id: asId<'Audit'>(`aud_${String(++auSeq).padStart(5, '0')}`),
    actorUserId: admins[0]!.id,
    action: 'price.updated',
    entityType: 'PriceBookEntry',
    entityId: 'price_031',
    before: { amount: 6_600_000 },
    after: { amount: 4_800_000, label: 'July 2026 Spot Cash Promo' },
    at: '2026-07-01T08:30:00+08:00',
  })

  audit.sort((a, b) => (a.at < b.at ? 1 : -1))

  return { approvals, notifications, audit }
}
