import { TRUST_FUND_RATE_PERCENT } from '@/domain'
import type { Dataset } from './index'

/**
 * Runs at the end of buildDataset(). THROWS on the first violation — a
 * silently inconsistent dataset produces a demo that contradicts itself in
 * front of the client, which is worse than a hard failure at boot.
 */
export function validateDataset(d: Dataset): void {
  const fail = (msg: string): never => {
    throw new Error(`[mock] invariant violated: ${msg}`)
  }

  const contractById = new Map(d.contracts.map((c) => [c.id, c]))
  const lotById = new Map(d.lots.map((l) => [l.id, l]))

  // 1 & 2 — lot status agrees with the truth beneath it
  for (const lot of d.lots) {
    if (lot.status === 'occupied' && lot.intermentCount === 0)
      fail(`lot ${lot.id} is occupied with zero interments`)
    if (lot.status === 'sold' && !lot.currentContractId)
      fail(`lot ${lot.id} is sold with no contract`)
    if (lot.status === 'held' && !lot.activeHoldId)
      fail(`lot ${lot.id} is held with no hold`)
    if (lot.status === 'not_for_sale' && !lot.notForSaleReason)
      fail(`lot ${lot.id} is not_for_sale with no reason`)
    // 3 — capacity
    if (lot.intermentCount > lot.capacity)
      fail(`lot ${lot.id} has ${lot.intermentCount} interments, capacity ${lot.capacity}`)
  }

  const actualInterments = new Map<string, number>()
  for (const i of d.interments) {
    if (i.status === 'cancelled') continue
    actualInterments.set(i.lotId, (actualInterments.get(i.lotId) ?? 0) + 1)
  }
  for (const [lotId, n] of actualInterments) {
    const lot = lotById.get(lotId as never)
    if (!lot) fail(`interment references unknown lot ${lotId}`)
    else if (lot.intermentCount !== n)
      fail(`lot ${lotId} intermentCount ${lot.intermentCount} ≠ actual ${n}`)
  }

  // 4 — contract arithmetic
  for (const c of d.contracts) {
    const expected =
      c.listPriceCentavos - c.discountCentavos + c.servicesTotalCentavos
    if (expected !== c.contractPriceCentavos)
      fail(
        `contract ${c.contractNo}: list − discount + services = ${expected}, stored ${c.contractPriceCentavos}`,
      )
  }

  // 5 — schedules sum to the contract price
  const schedByContract = new Map<string, number>()
  for (const ins of d.installments) {
    schedByContract.set(
      ins.contractId,
      (schedByContract.get(ins.contractId) ?? 0) + ins.amountDueCentavos,
    )
  }
  for (const [cid, sum] of schedByContract) {
    const c = contractById.get(cid as never)
    if (!c) fail(`installment references unknown contract ${cid}`)
    else if (sum !== c.contractPriceCentavos)
      fail(`contract ${c.contractNo}: schedule sums to ${sum}, price ${c.contractPriceCentavos}`)
  }

  // 6 & 7 — payments, status and certificates
  const paidByContract = new Map<string, number>()
  for (const p of d.payments) {
    if (p.status !== 'posted') continue
    paidByContract.set(
      p.contractId,
      (paidByContract.get(p.contractId) ?? 0) + p.amountCentavos,
    )
  }
  for (const c of d.contracts) {
    const paid = paidByContract.get(c.id) ?? 0
    if (c.status === 'fully_paid' && paid < c.contractPriceCentavos)
      fail(`contract ${c.contractNo} is fully_paid but only ${paid} collected`)
    const hasCert = c.certificateNo !== null
    if (hasCert && c.status !== 'fully_paid')
      fail(`contract ${c.contractNo} has a certificate but is ${c.status}`)
  }

  // 8 — trust fund at 20% of every posted payment, monotonic running balance
  const posted = d.payments.filter((p) => p.status === 'posted')
  if (d.trustFund.length !== posted.length)
    fail(`trust fund has ${d.trustFund.length} entries for ${posted.length} posted payments`)
  let running = 0
  for (const e of d.trustFund) {
    running += e.amountCentavos
    if (e.runningBalanceCentavos !== running)
      fail(`trust fund running balance drifted at ${e.id}`)
  }
  for (const p of posted) {
    const expected = Math.round((p.amountCentavos * TRUST_FUND_RATE_PERCENT) / 100)
    if (p.trustFundCentavos !== expected)
      fail(`payment ${p.orNo}: trust fund ${p.trustFundCentavos} ≠ 20% (${expected})`)
  }

  // 9 — commission entries
  const commByPayment = new Map<string, number>()
  for (const e of d.commissions) {
    commByPayment.set(e.paymentId, (commByPayment.get(e.paymentId) ?? 0) + 1)
    const expected = Math.round((e.basisCentavos * e.ratePercent) / 100)
    if (e.amountCentavos !== expected)
      fail(`commission ${e.id}: ${e.amountCentavos} ≠ basis×rate (${expected})`)
    const c = contractById.get(e.contractId as never)
    if (!c) fail(`commission ${e.id} references unknown contract`)
    else {
      const upline = [c.agentId, c.teamLeaderId, c.distributorId].filter(Boolean)
      if (!upline.includes(e.agentId))
        fail(`commission ${e.id} pays an agent outside the contract's upline`)
    }
  }
  for (const p of posted) {
    const n = commByPayment.get(p.id) ?? 0
    if (n < 1 || n > 3)
      fail(`payment ${p.orNo} produced ${n} commission entries (expected 1–3)`)
  }

  // 10 — burial slots
  const slotKey = new Set<string>()
  const perDay = new Map<string, number>()
  for (const i of d.interments) {
    if (i.status === 'cancelled') continue
    const k = `${i.locationId}|${i.scheduledDate}|${i.slot}`
    if (slotKey.has(k)) fail(`two interments share ${k}`)
    slotKey.add(k)
    const dk = `${i.locationId}|${i.scheduledDate}`
    const n = (perDay.get(dk) ?? 0) + 1
    if (n > 2) fail(`${dk} has ${n} interments (max 2)`)
    perDay.set(dk, n)
  }

  // 11 — OR numbers unique and increasing in paidAt order
  const ors = d.payments.map((p) => p.orNo)
  if (new Set(ors).size !== ors.length) fail('duplicate OR numbers')

  // 12 — referential integrity
  const lotIds = new Set(d.lots.map((l) => l.id))
  const clientIds = new Set(d.clients.map((c) => c.id))
  const agentIds = new Set(d.agents.map((a) => a.id))
  for (const c of d.contracts) {
    if (!lotIds.has(c.lotId)) fail(`contract ${c.contractNo} → unknown lot`)
    if (!clientIds.has(c.clientId)) fail(`contract ${c.contractNo} → unknown client`)
    if (!agentIds.has(c.agentId)) fail(`contract ${c.contractNo} → unknown agent`)
  }
}
