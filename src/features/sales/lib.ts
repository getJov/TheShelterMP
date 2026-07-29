import { useMemo } from 'react'
import {
  clientFullName,
  formatLotCode,
  type Client,
  type Contract,
  type Lot,
  type PaymentHealth,
  type PaymentMethod,
  type User,
} from '@/domain'
import { indexes, useDataset } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import { useCan } from '@/lib/permissions'
import { balanceOf, paymentHealth, postedPaymentsOf, scheduleOf } from '@/lib/finance'
import { nextDue } from '@/lib/amortization'
import { TODAY } from '@/mock'
import { diffDays } from '@/lib/dates'
import {
  IconBank,
  IconCash,
  IconCheque,
  IconMobile,
  type IconSvgElement,
} from '@/components/ui-brand/icons'

/** 90+ first — the client reads this list top-down as a call sheet. */
export const HEALTH_ORDER: PaymentHealth[] = [
  'severely_overdue',
  'overdue',
  'due_soon',
  'current',
  'paid_in_full',
  'not_applicable',
]

export const METHOD_ICON: Record<PaymentMethod, IconSvgElement> = {
  cash: IconCash,
  bank_transfer: IconBank,
  gcash: IconMobile,
  check: IconCheque,
}

/** Methods that carry a reference number. */
export const METHOD_NEEDS_REFERENCE: PaymentMethod[] = ['gcash', 'bank_transfer', 'check']

export const lotCodeOf = (lot: Lot | undefined | null): string => {
  if (!lot) return '—'
  const block = indexes().blocksById.get(lot.blockId)
  return formatLotCode(block?.code ?? '??', lot.lotNumber)
}

export const lotCodeById = (lotId: Contract['lotId']): string =>
  lotCodeOf(indexes().lotsById.get(lotId))

export const clientNameOf = (id: Client['id'] | null | undefined): string => {
  if (!id) return '—'
  const c = indexes().clientsById.get(id)
  return c ? clientFullName(c) : '—'
}

export const agentNameOf = (id: Contract['agentId'] | null | undefined): string => {
  if (!id) return '—'
  const a = indexes().agentsById.get(id)
  if (!a) return '—'
  return indexes().usersById.get(a.userId)?.fullName ?? a.agentCode
}

export const tierNameOf = (lotId: Contract['lotId']): string => {
  const lot = indexes().lotsById.get(lotId)
  if (!lot) return '—'
  return indexes().tiersById.get(lot.tierId)?.name ?? '—'
}

// ── the row model every tab shares ───────────────────────────────────
export interface ContractRow {
  contract: Contract
  contractNo: string
  buyer: string
  lotCode: string
  tier: string
  agent: string
  totalCentavos: number
  paidCentavos: number
  outstandingCentavos: number
  health: PaymentHealth
  nextDueDate: string | null
  nextDueCentavos: number | null
  lastPaymentDate: string | null
  daysPastDue: number
}

export function buildRow(contract: Contract): ContractRow {
  const bal = balanceOf(contract)
  const sched = scheduleOf(contract.id)
  const next = nextDue(sched)
  const payments = postedPaymentsOf(contract.id)
  const last = payments.reduce<string | null>(
    (acc, p) => (acc === null || p.paidAt > acc ? p.paidAt : acc),
    null,
  )
  const overdue = sched.filter(
    (i) => i.amountPaidCentavos < i.amountDueCentavos && i.dueDate < TODAY,
  )
  const oldest = overdue.length
    ? overdue.reduce((a, b) => (a.dueDate < b.dueDate ? a : b))
    : null

  return {
    contract,
    contractNo: contract.contractNo,
    buyer: clientNameOf(contract.clientId),
    lotCode: lotCodeById(contract.lotId),
    tier: tierNameOf(contract.lotId),
    agent: agentNameOf(contract.agentId),
    totalCentavos: bal.totalCentavos,
    paidCentavos: bal.paidCentavos,
    outstandingCentavos: bal.outstandingCentavos,
    health: paymentHealth(contract, TODAY),
    nextDueDate: next?.dueDate ?? null,
    nextDueCentavos: next ? next.amountDueCentavos - next.amountPaidCentavos : null,
    lastPaymentDate: last,
    daysPastDue: oldest
      ? diffDays(TODAY, oldest.dueDate)
      : contract.paymentMode === 'spot_cash' && bal.outstandingCentavos > 0
        ? Math.max(0, diffDays(TODAY, contract.signedAt))
        : 0,
  }
}

/**
 * Scope. Managers and admins see every contract at the location they are
 * looking at. An agent sees only the contracts they sold — attribution, not
 * location, because agents are attached to the sales office while every lot
 * sits at the park.
 */
export function useVisibleContracts(): ContractRow[] {
  const version = useDataset((s) => s.version)
  const data = useDataset((s) => s.data)
  const user = useSession((s) => s.currentUser())
  const activeLocationId = useSession((s) => s.activeLocationId)
  const agent = useSession((s) => s.currentAgent())
  const viewAll = useCan('contract:view_all')

  return useMemo(() => {
    void version
    if (!user) return []
    const rows = viewAll
      ? data.contracts.filter(
          (c) => !activeLocationId || c.locationId === activeLocationId,
        )
      : data.contracts.filter((c) => agent && c.agentId === agent.id)
    return rows.map(buildRow).sort((a, b) => (a.contract.signedAt < b.contract.signedAt ? 1 : -1))
  }, [data.contracts, user, activeLocationId, agent, viewAll, version])
}

export function useSalesUser(): User | null {
  return useSession((s) => s.currentUser())
}

// ── document checklist ───────────────────────────────────────────────
export interface DocumentSlot {
  key: string
  label: string
  present: boolean
  detail: string
}

/**
 * The expected document set for a contract, with present/missing derived from
 * data we actually hold. File storage itself is a later phase — this is the
 * checklist the office keeps in a folder today.
 */
export function expectedDocuments(contract: Contract): DocumentSlot[] {
  const client = indexes().clientsById.get(contract.clientId)
  const payments = postedPaymentsOf(contract.id)
  const out: DocumentSlot[] = [
    {
      key: 'contract',
      label: 'Signed Contract of Sale',
      present: contract.status !== 'draft',
      detail: contract.contractNo,
    },
    {
      key: 'buyer_id',
      label: 'Buyer government ID',
      present: Boolean(client?.idNumber),
      detail: client?.idType ? `${client.idType} on record` : 'No ID captured',
    },
  ]

  if (client?.seniorCitizen) {
    out.push({
      key: 'senior_id',
      label: 'Senior citizen ID',
      present: Boolean(client.seniorCitizenId),
      detail: client.seniorCitizenId ?? 'Flagged senior, ID not captured',
    })
  }

  if (contract.paymentMode === 'installment') {
    out.push({
      key: 'schedule',
      label: 'Amortization schedule acknowledgement',
      present: scheduleOf(contract.id).length > 0,
      detail: `${contract.termMonths ?? 0} months`,
    })
  }

  out.push({
    key: 'receipts',
    label: 'Official receipts',
    present: payments.length > 0,
    detail: payments.length
      ? `${payments.length} on file (${payments[0]!.orNo}…)`
      : 'No payment posted yet',
  })

  if (contract.needType === 'at_need') {
    out.push({
      key: 'interment',
      label: 'Interment authorization',
      present: (indexes().intermentsByLot.get(contract.lotId as string) ?? []).length > 0,
      detail: 'Required before opening the lot',
    })
  }

  out.push({
    key: 'certificate',
    label: 'Certificate of Ownership',
    present: Boolean(contract.certificateNo),
    detail: contract.certificateNo ?? 'Issued only on full payment',
  })

  return out
}
