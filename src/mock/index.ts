import type {
  AgentProfile,
  ApprovalTask,
  AuditEvent,
  Block,
  Client,
  CommissionEntry,
  CommissionRule,
  Contract,
  GroundsJob,
  Hold,
  Installment,
  Interment,
  Location,
  Lot,
  MapOverlay,
  Notification,
  OwnershipTransfer,
  Payment,
  PayoutRun,
  PriceBookEntry,
  ServiceCatalogItem,
  ServiceLine,
  Tier,
  TrustFundEntry,
  User,
} from '@/domain'
import { createRng, SEED } from './rng'
import { seedLocations, seedPrices, seedServices, seedTiers } from './seed-catalog'
import { seedPeople } from './seed-people'
import { seedPark } from './seed-park'
import { seedSales } from './seed-sales'
import { seedCommissionRules, seedCommissions } from './seed-commissions'
import { seedBurials } from './seed-burials'
import { seedSystem } from './seed-system'
import { validateDataset } from './validate'

export interface Dataset {
  locations: Location[]
  blocks: Block[]
  lots: Lot[]
  overlays: MapOverlay[]
  tiers: Tier[]
  prices: PriceBookEntry[]
  services: ServiceCatalogItem[]
  users: User[]
  agents: AgentProfile[]
  clients: Client[]
  holds: Hold[]
  contracts: Contract[]
  serviceLines: ServiceLine[]
  installments: Installment[]
  payments: Payment[]
  trustFund: TrustFundEntry[]
  transfers: OwnershipTransfer[]
  commissionRules: CommissionRule[]
  commissions: CommissionEntry[]
  payoutRuns: PayoutRun[]
  interments: Interment[]
  jobs: GroundsJob[]
  approvals: ApprovalTask[]
  notifications: Notification[]
  audit: AuditEvent[]
}

let cached: Dataset | null = null

/** Built once, memoised. Stores call this; nothing else does. */
export function buildDataset(seed = SEED): Dataset {
  if (cached && seed === SEED) return cached

  const rng = createRng(seed)

  const locations = seedLocations()
  const tiers = seedTiers()
  const services = seedServices()
  const people = seedPeople(rng)
  const prices = seedPrices(people.adminId)

  const park = seedPark(rng, tiers)

  const sales = seedSales(rng, {
    lots: park.lots,
    blocks: park.blocks,
    clients: people.clients,
    agents: people.agents,
    users: people.users,
    prices,
    services,
    managerId: people.managerIlangayId,
    adminId: people.adminId,
  })

  const burials = seedBurials(rng, {
    lots: park.lots,
    contracts: sales.contracts,
    services,
    crewIds: people.crewIds,
    managerId: people.managerIlangayId,
  })

  const rules = seedCommissionRules()
  const comm = seedCommissions(
    sales.payments,
    sales.contracts,
    rules,
    people.ownerId,
  )

  const system = seedSystem(rng, {
    users: people.users,
    lots: park.lots,
    blocks: park.blocks,
    clients: people.clients,
    holds: sales.holds,
    contracts: sales.contracts,
    interments: burials.interments,
    payoutRuns: comm.payoutRuns,
  })

  const dataset: Dataset = {
    locations,
    blocks: park.blocks,
    lots: park.lots,
    overlays: park.overlays,
    tiers,
    prices,
    services,
    users: people.users,
    agents: people.agents,
    clients: people.clients,
    holds: sales.holds,
    contracts: sales.contracts,
    serviceLines: sales.serviceLines,
    installments: sales.installments,
    payments: sales.payments,
    trustFund: sales.trustFund,
    transfers: [],
    commissionRules: comm.commissionRules,
    commissions: comm.commissions,
    payoutRuns: comm.payoutRuns,
    interments: burials.interments,
    jobs: burials.jobs,
    approvals: system.approvals,
    notifications: system.notifications,
    audit: system.audit,
  }

  validateDataset(dataset)

  if (seed === SEED) cached = dataset
  return dataset
}

/** Lookup maps built once, so features never write their own O(n) scans. */
export function buildIndexes(d: Dataset) {
  const group = <T, K extends string>(rows: T[], key: (r: T) => K) => {
    const m = new Map<K, T[]>()
    for (const r of rows) {
      const k = key(r)
      const arr = m.get(k)
      if (arr) arr.push(r)
      else m.set(k, [r])
    }
    return m
  }

  return {
    locationsById: new Map(d.locations.map((x) => [x.id, x])),
    blocksById: new Map(d.blocks.map((x) => [x.id, x])),
    lotsById: new Map(d.lots.map((x) => [x.id, x])),
    tiersById: new Map(d.tiers.map((x) => [x.id, x])),
    usersById: new Map(d.users.map((x) => [x.id, x])),
    agentsById: new Map(d.agents.map((x) => [x.id, x])),
    clientsById: new Map(d.clients.map((x) => [x.id, x])),
    contractsById: new Map(d.contracts.map((x) => [x.id, x])),
    paymentsById: new Map(d.payments.map((x) => [x.id, x])),
    intermentsById: new Map(d.interments.map((x) => [x.id, x])),
    holdsById: new Map(d.holds.map((x) => [x.id, x])),
    jobsById: new Map(d.jobs.map((x) => [x.id, x])),
    payoutRunsById: new Map(d.payoutRuns.map((x) => [x.id, x])),

    lotsByBlock: group(d.lots, (l) => l.blockId as string),
    contractsByLot: new Map(
      d.contracts.filter((c) => c.status !== 'cancelled').map((c) => [c.lotId, c]),
    ),
    contractsByClient: group(d.contracts, (c) => c.clientId as string),
    contractsByAgent: group(d.contracts, (c) => c.agentId as string),
    paymentsByContract: group(d.payments, (p) => p.contractId as string),
    installmentsByContract: group(d.installments, (i) => i.contractId as string),
    serviceLinesByContract: group(d.serviceLines, (s) => s.contractId as string),
    commissionsByAgent: group(d.commissions, (c) => c.agentId as string),
    commissionsByRun: group(
      d.commissions.filter((c) => c.payoutRunId),
      (c) => c.payoutRunId as string,
    ),
    intermentsByLot: group(d.interments, (i) => i.lotId as string),
    jobsByInterment: new Map(d.jobs.map((j) => [j.intermentId, j])),
    notificationsByUser: group(d.notifications, (n) => n.userId as string),
    agentsByUser: new Map(d.agents.map((a) => [a.userId, a])),
  }
}

export type DatasetIndexes = ReturnType<typeof buildIndexes>

export { SEED, createRng } from './rng'
export { NOW, TODAY, FIRST_INTERMENT, HISTORY_START } from './time'
