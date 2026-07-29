import {
  asId,
  HOLD_DURATION_DAYS,
  TRUST_FUND_RATE_PERCENT,
  type AgentProfile,
  type Block,
  type Client,
  type Contract,
  type Hold,
  type Installment,
  type Lot,
  type Payment,
  type PriceBookEntry,
  type ServiceCatalogItem,
  type ServiceLine,
  type TrustFundEntry,
  type User,
} from '@/domain'
import { resolvePrice } from '@/lib/price-resolver'
import { addDays, addMonths, diffDays, dowOf } from '@/lib/dates'
import type { Rng } from './rng'
import { atHour, HISTORY_START, TODAY } from './time'
import { CANCEL_REASONS, DISCOUNT_REASONS } from './names'

export interface SalesSeed {
  holds: Hold[]
  contracts: Contract[]
  serviceLines: ServiceLine[]
  installments: Installment[]
  payments: Payment[]
  trustFund: TrustFundEntry[]
}

const TARGET_SOLD = 200
const TARGET_HELD = 18

/**
 * Real parks sell front-to-back. A uniformly scattered map looks like
 * confetti and tells the client nothing, so sold lots are clustered towards
 * the front rows of B01 and thin out from there.
 */
function saleWeight(lot: Lot, block: Block | undefined): number {
  const cols = block?.grid?.cols ?? 18
  const row = Math.floor((lot.lotNumber - 1) / cols)
  const blockBias = block?.code === 'B01' ? 3 : block?.code === 'B02' ? 1.4 : 0.7
  return blockBias * Math.exp(-row / 5.5) + 0.04
}

function pickWeighted(rng: Rng, pool: Lot[], weights: Map<string, number>, n: number) {
  const chosen: Lot[] = []
  const remaining = [...pool]
  const w = remaining.map((l) => weights.get(l.id) ?? 0.01)
  for (let k = 0; k < n && remaining.length; k++) {
    const total = w.reduce((a, b) => a + b, 0)
    let r = rng.next() * total
    let idx = 0
    for (; idx < remaining.length; idx++) {
      r -= w[idx]!
      if (r <= 0) break
    }
    if (idx >= remaining.length) idx = remaining.length - 1
    chosen.push(remaining[idx]!)
    remaining.splice(idx, 1)
    w.splice(idx, 1)
  }
  return chosen
}

export function seedSales(
  rng: Rng,
  ctx: {
    lots: Lot[]
    blocks: Block[]
    clients: Client[]
    agents: AgentProfile[]
    users: User[]
    prices: PriceBookEntry[]
    services: ServiceCatalogItem[]
    managerId: ReturnType<typeof asId<'User'>>
    adminId: ReturnType<typeof asId<'User'>>
  },
): SalesSeed {
  const blockById = new Map(ctx.blocks.map((b) => [b.id, b]))
  const sellable = ctx.lots.filter((l) => l.status === 'available')
  const weights = new Map(
    sellable.map((l) => [l.id as string, saleWeight(l, blockById.get(l.blockId))]),
  )

  const soldLots = pickWeighted(rng, sellable, weights, TARGET_SOLD)
  const soldIds = new Set(soldLots.map((l) => l.id))
  const heldPool = sellable.filter((l) => !soldIds.has(l.id))
  const heldLots = pickWeighted(rng, heldPool, weights, TARGET_HELD)

  const activeAgents = ctx.agents.filter((a) => a.status === 'active')
  const allAgents = ctx.agents
  const contracts: Contract[] = []
  const serviceLines: ServiceLine[] = []
  const installments: Installment[] = []
  const rawPayments: Omit<Payment, 'orNo'>[] = []
  const holds: Hold[] = []

  const openClose = ctx.services.find((s) => s.code === 'OPEN_CLOSE')!
  const memCare = ctx.services.find((s) => s.code === 'MEM_CARE')!
  const envClean = ctx.services.find((s) => s.code === 'ENV_CLEAN')!

  // ── contracts ────────────────────────────────────────────────────
  // Volume grows over time: ~4/month in late 2024 rising to ~14/month now.
  const totalDays = diffDays(TODAY, HISTORY_START)
  const signDates = soldLots
    .map(() => {
      // Bias towards recent: sqrt pushes mass to the upper end.
      const f = Math.sqrt(rng.next())
      return addDays(HISTORY_START, Math.floor(f * (totalDays - 4)))
    })
    .sort()

  let contractSeq = 0
  let certSeq = 0
  let paymentSeq = 0
  const clientPool = rng.shuffle(ctx.clients)

  soldLots.forEach((lot, i) => {
    const signedAt = signDates[i]!
    const needType = rng.bool(0.18) ? 'at_need' : 'pre_need'
    const paymentMode =
      needType === 'at_need'
        ? 'spot_cash'
        : rng.bool(0.3)
          ? 'spot_cash'
          : 'installment'
    const termMonths =
      paymentMode === 'installment'
        ? rng.weighted([
            [36, 5],
            [60, 4],
            [24, 3],
            [48, 2],
            [12, 1],
            [6, 1],
          ] as const)
        : null

    const resolved = resolvePrice(
      ctx.prices,
      lot.tierId,
      needType,
      paymentMode,
      signedAt,
    )
    // Every seeded lot's tier has a price; mausoleum is not placed on the map.
    const listPrice = resolved.amountCentavos ?? 6_000_000

    const client = clientPool[i % clientPool.length]!
    const agent = rng.pick(rng.bool(0.9) ? activeAgents : allAgents)

    const contractId = asId<'Contract'>(
      `ctr_${signedAt.slice(0, 4)}_${String(++contractSeq).padStart(5, '0')}`,
    )

    // services
    let servicesTotal = 0
    const addLine = (svc: ServiceCatalogItem, qty = 1) => {
      const total = svc.defaultAmountCentavos * qty
      servicesTotal += total
      serviceLines.push({
        id: `svl_${contractId}_${svc.code}`,
        contractId,
        serviceId: svc.id,
        description: svc.name,
        quantity: qty,
        unitAmountCentavos: svc.defaultAmountCentavos,
        totalCentavos: total,
        createdAt: atHour(signedAt, 10),
      })
    }
    if (rng.bool(0.4)) addLine(rng.bool(0.6) ? memCare : envClean)
    if (needType === 'at_need') addLine(openClose)

    const hasDiscount = rng.bool(0.08)
    const discount = hasDiscount ? Math.round(listPrice * rng.float(0.03, 0.1)) : 0
    const contractPrice = listPrice - discount + servicesTotal

    // Four cancelled contracts, deliberately spread across time: three old
    // (their commission is already released → clawback) and one recent
    // (unreleased → voided), so both cancellation paths have data.
    const cancelled = i < 3 || i === soldLots.length - 2
    const pendingApproval = i >= 3 && i < 6 // exactly 3 awaiting approval

    const contract: Contract = {
      id: contractId,
      contractNo: `TSM-${signedAt.slice(0, 4)}-${String(contractSeq).padStart(5, '0')}`,
      locationId: lot.locationId,
      lotId: lot.id,
      clientId: client.id,
      coOwnerClientId: rng.bool(0.12)
        ? clientPool[(i + 37) % clientPool.length]!.id
        : null,
      needType,
      paymentMode,
      termMonths,
      priceBookEntryId: resolved.entry?.id ?? ctx.prices[0]!.id,
      listPriceCentavos: listPrice,
      discountCentavos: discount,
      discountReason: hasDiscount ? rng.pick(DISCOUNT_REASONS) : null,
      servicesTotalCentavos: servicesTotal,
      contractPriceCentavos: contractPrice,
      status: cancelled ? 'cancelled' : pendingApproval ? 'pending_approval' : 'active',
      agentId: agent.id,
      teamLeaderId: agent.teamLeaderId,
      distributorId: agent.distributorId,
      signedAt,
      approvedByUserId: pendingApproval ? null : ctx.managerId,
      approvedAt: pendingApproval ? null : atHour(addDays(signedAt, 1), 9),
      cancelledAt: cancelled ? atHour(addDays(signedAt, 90), 14) : null,
      cancelReason: cancelled ? rng.pick(CANCEL_REASONS) : null,
      certificateNo: null,
      certificateIssuedAt: null,
      createdAt: atHour(signedAt, 10),
      updatedAt: atHour(signedAt, 10),
    }
    contracts.push(contract)

    // ── schedule ───────────────────────────────────────────────────
    const schedule: Installment[] = []
    if (paymentMode === 'installment' && termMonths) {
      const base = Math.floor(contractPrice / termMonths)
      const remainder = contractPrice - base * termMonths
      for (let n = 1; n <= termMonths; n++) {
        schedule.push({
          id: `ins_${contractId}_${n}`,
          contractId,
          installmentNo: n,
          dueDate: addMonths(signedAt, n),
          amountDueCentavos: n === 1 ? base + remainder : base,
          amountPaidCentavos: 0,
          status: 'upcoming',
          createdAt: atHour(signedAt, 10),
          updatedAt: atHour(signedAt, 10),
        })
      }
    }

    // ── payments ───────────────────────────────────────────────────
    const method = () =>
      rng.weighted([
        ['cash', 55],
        ['gcash', 25],
        ['bank_transfer', 15],
        ['check', 5],
      ] as const)

    const post = (amount: number, paidAt: ISODateLike, applied: number[]) => {
      const id = asId<'Payment'>(`pay_${String(++paymentSeq).padStart(6, '0')}`)
      const m = method()
      rawPayments.push({
        id,
        contractId,
        amountCentavos: amount,
        method: m,
        referenceNo:
          m === 'cash' ? null : `${m.toUpperCase().slice(0, 3)}-${rng.int(100000, 999999)}`,
        paidAt,
        postedAt: atHour(paidAt, rng.int(9, 16), rng.pick([0, 15, 30, 45])),
        receivedByUserId: rng.bool(0.7) ? ctx.managerId : ctx.adminId,
        appliedInstallmentNos: applied,
        trustFundCentavos: Math.round((amount * TRUST_FUND_RATE_PERCENT) / 100),
        status: 'posted',
        voidReason: null,
        createdAt: atHour(paidAt, 12),
        updatedAt: atHour(paidAt, 12),
      })
    }

    if (cancelled) {
      // A few payments before cancellation, then nothing.
      const n = rng.int(1, 4)
      for (let k = 0; k < n; k++) {
        const d = shiftToWorkday(addMonths(signedAt, k), rng)
        if (d <= TODAY) post(schedule[k]?.amountDueCentavos ?? contractPrice, d, [k + 1])
      }
    } else if (pendingApproval) {
      // Not yet approved — no money in.
    } else if (paymentMode === 'spot_cash') {
      post(contractPrice, signedAt, [])
    } else if (termMonths) {
      const behaviour = rng.weighted([
        ['current', 65],
        ['lumpy', 20],
        ['overdue', 10],
        ['severe', 5],
      ] as const)

      const monthsElapsed = Math.min(
        termMonths,
        Math.max(0, Math.floor(diffDays(TODAY, signedAt) / 30)),
      )
      let payUpTo = monthsElapsed
      if (behaviour === 'overdue') payUpTo = Math.max(0, monthsElapsed - rng.int(1, 3))
      if (behaviour === 'severe') payUpTo = Math.max(0, monthsElapsed - rng.int(4, 7))

      let n = 1
      while (n <= payUpTo && n <= termMonths) {
        const lump = behaviour === 'lumpy' && rng.bool(0.25) ? 2 : 1
        const nums: number[] = []
        let amount = 0
        for (let k = 0; k < lump && n + k <= termMonths; k++) {
          const inst = schedule[n + k - 1]
          if (!inst) break
          amount += inst.amountDueCentavos
          nums.push(inst.installmentNo)
        }
        if (amount > 0) {
          const due = schedule[n - 1]!.dueDate
          const paidAt = shiftToWorkday(
            addDays(due, behaviour === 'current' ? rng.int(-4, 3) : rng.int(0, 9)),
            rng,
          )
          if (paidAt <= TODAY) post(amount, paidAt, nums)
        }
        n += lump
      }
    }

    installments.push(...schedule)
  })

  // ── apply payments to schedules, set contract status ─────────────
  const paymentsByContract = new Map<string, Omit<Payment, 'orNo'>[]>()
  for (const p of rawPayments) {
    const arr = paymentsByContract.get(p.contractId) ?? []
    arr.push(p)
    paymentsByContract.set(p.contractId, arr)
  }

  const instByContract = new Map<string, Installment[]>()
  for (const ins of installments) {
    const arr = instByContract.get(ins.contractId) ?? []
    arr.push(ins)
    instByContract.set(ins.contractId, arr)
  }

  for (const c of contracts) {
    const ps = paymentsByContract.get(c.id) ?? []
    const paid = ps.reduce((s, p) => s + p.amountCentavos, 0)
    const sched = instByContract.get(c.id) ?? []

    for (const p of ps) {
      for (const no of p.appliedInstallmentNos) {
        const inst = sched.find((s) => s.installmentNo === no)
        if (inst) {
          inst.amountPaidCentavos = inst.amountDueCentavos
          inst.status = 'paid'
        }
      }
    }
    for (const inst of sched) {
      if (inst.status === 'paid') continue
      inst.status = inst.dueDate < TODAY ? 'overdue' : 'upcoming'
    }

    if (c.status === 'active' && paid >= c.contractPriceCentavos && paid > 0) {
      c.status = 'fully_paid'
      const last = ps.reduce((a, b) => (a.paidAt > b.paidAt ? a : b))
      c.certificateIssuedAt = addDays(last.paidAt, rng.int(5, 20))
      c.certificateNo = `COO-${c.certificateIssuedAt.slice(0, 4)}-${String(++certSeq).padStart(4, '0')}`
    }
  }

  // ── OR numbers, strictly sequential in paidAt order ──────────────
  const payments: Payment[] = rawPayments
    .slice()
    .sort((a, b) => (a.paidAt === b.paidAt ? (a.id < b.id ? -1 : 1) : a.paidAt < b.paidAt ? -1 : 1))
    .map((p, i) => ({ ...p, orNo: `OR-${String(i + 1).padStart(6, '0')}` }))

  // Two voided payments, from contracts that remain active.
  const voidable = payments.filter(
    (p) => contracts.find((c) => c.id === p.contractId)?.status === 'active',
  )
  for (const p of voidable.slice(-2)) {
    p.status = 'void'
    p.voidReason = 'Duplicate posting — corrected receipt issued'
  }

  // ── trust fund ledger ────────────────────────────────────────────
  const trustFund: TrustFundEntry[] = []
  let running = 0
  const posted = payments
    .filter((p) => p.status === 'posted')
    .sort((a, b) => (a.postedAt < b.postedAt ? -1 : 1))
  for (const p of posted) {
    running += p.trustFundCentavos
    const c = contracts.find((x) => x.id === p.contractId)!
    trustFund.push({
      id: `tfe_${p.id}`,
      paymentId: p.id,
      contractId: p.contractId,
      locationId: c.locationId,
      amountCentavos: p.trustFundCentavos,
      runningBalanceCentavos: running,
      postedAt: p.postedAt,
    })
  }

  // ── lot status ───────────────────────────────────────────────────
  for (const c of contracts) {
    if (c.status === 'cancelled') continue
    const lot = ctx.lots.find((l) => l.id === c.lotId)!
    lot.status = 'sold'
    lot.currentContractId = c.id
    lot.currentOwnerClientId = c.clientId
  }

  // ── holds ────────────────────────────────────────────────────────
  heldLots.forEach((lot, i) => {
    const pending = i < 6 // 6 pending, so the approvals queue is populated
    const requestedAt = atHour(addDays(TODAY, -rng.int(0, 5)), rng.int(9, 16))
    const agent = rng.pick(activeAgents.filter((a) => a.locationId === lot.locationId))
    const agentUser = ctx.users.find((u) => u.agentProfileId === agent.id)!
    const id = asId<'Hold'>(`hld_${String(i + 1).padStart(3, '0')}`)

    // One hold deliberately expires tomorrow so the expiry path is visible.
    const expiresAt =
      i === 6
        ? atHour(addDays(TODAY, 1), 17)
        : atHour(addDays(requestedAt.slice(0, 10), HOLD_DURATION_DAYS), 17)

    holds.push({
      id,
      lotId: lot.id,
      locationId: lot.locationId,
      requestedByUserId: agentUser.id,
      clientId: rng.bool(0.5) ? rng.pick(ctx.clients).id : null,
      prospectName: rng.bool(0.5)
        ? `Familia ${rng.pick(ctx.clients).lastName}`
        : null,
      status: pending ? 'pending' : 'approved',
      requestedAt,
      expiresAt,
      decidedByUserId: pending ? null : ctx.managerId,
      decidedAt: pending ? null : atHour(addDays(requestedAt.slice(0, 10), 1), 9),
      decisionNote: null,
      convertedContractId: null,
      createdAt: requestedAt,
      updatedAt: requestedAt,
    })

    lot.status = 'held'
    lot.activeHoldId = id
  })

  return { holds, contracts, serviceLines, installments, payments, trustFund }
}

type ISODateLike = string

/** Payments cluster on weekdays and avoid Sundays. */
function shiftToWorkday(iso: string, rng: Rng): string {
  let d = iso
  let guard = 0
  while (dowOf(d) === 0 && guard++ < 3) d = addDays(d, 1)
  if (rng.bool(0.15)) d = addDays(d, rng.int(1, 3))
  while (dowOf(d) === 0 && guard++ < 6) d = addDays(d, 1)
  return d
}
