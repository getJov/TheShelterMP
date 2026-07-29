/** Builds the seeded dataset and reports its shape. Throws on any invariant. */
import { buildDataset } from '../src/mock'
import { formatPeso } from '../src/lib/money'

const t0 = performance.now()
const d = buildDataset()
const ms = Math.round(performance.now() - t0)
const by = (xs: { status: string }[]) =>
  xs.reduce<Record<string, number>>((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {})
const posted = d.payments.filter((p) => p.status === 'posted')

console.log(`built in ${ms}ms — all invariants passed\n`)
console.log('locations    ', d.locations.length, '  blocks', d.blocks.length, '  lots', d.lots.length)
console.log('lot status   ', by(d.lots))
console.log('tiers        ', d.tiers.length, '  prices', d.prices.length, '  services', d.services.length)
console.log('users        ', d.users.length, '  agents', d.agents.length, '  clients', d.clients.length)
console.log('contracts    ', d.contracts.length, by(d.contracts))
console.log('installments ', d.installments.length, '  payments', d.payments.length, `(${posted.length} posted)`)
console.log('trust fund   ', formatPeso(d.trustFund.at(-1)?.runningBalanceCentavos ?? 0))
console.log('commissions  ', d.commissions.length, by(d.commissions))
console.log('payout runs  ', d.payoutRuns.length, by(d.payoutRuns))
console.log('interments   ', d.interments.length, by(d.interments), '  jobs', d.jobs.length)
console.log('holds        ', d.holds.length, by(d.holds))
console.log('approvals    ', d.approvals.filter((a) => a.status === 'pending').length, 'pending')
