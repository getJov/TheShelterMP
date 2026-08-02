import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { ClientId, Contract, ContractId } from '@/domain'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { StatCard } from '@/components/ui-brand/StatCard'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconAdd,
  IconContract,
  IconHold,
  IconTrustFund,
} from '@/components/ui-brand/icons'
import { useDataset } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import { useSales } from '@/stores/sales'
import { useCan, useCurrentUserOrNull } from '@/lib/permissions'
import {
  collectionsBetween,
  monthBounds,
  receivablesBreakdown,
  trustFundBalance,
} from '@/lib/finance'
import { formatCount, formatPeso } from '@/lib/money'
import { TODAY } from '@/mock'
import { ContractBuilder } from './components/ContractBuilder'
import { RequestHoldDialog } from './components/RequestHoldDialog'
import { ContractDetailSheet } from './components/ContractDetailSheet'
import { PostPaymentDialog } from './components/PostPaymentDialog'
import { ClientSheet } from './components/ClientSheet'
import { useVisibleContracts } from './lib'
import { ContractsTab } from './ContractsTab'
import { PaymentsTab } from './PaymentsTab'
import { ReceivablesTab } from './ReceivablesTab'
import { ClientsTab } from './ClientsTab'

const EASE = [0.22, 1, 0.36, 1] as const

type SalesTab = 'contracts' | 'payments' | 'receivables' | 'clients'

export default function SalesPage() {
  const init = useSales((state) => state.init)
  const user = useCurrentUserOrNull()
  const canViewAll = useCan('contract:view_all')
  const canCreate = useCan('contract:create')
  const canHold = useCan('hold:request')
  const navigate = useNavigate()

  // Stale holds lapse against TODAY, once, on entry.
  useEffect(() => init(), [init])

  const rows = useVisibleContracts()
  const [tab, setTab] = useState<SalesTab>('contracts')
  const [builderOpen, setBuilderOpen] = useState(false)
  const [holdOpen, setHoldOpen] = useState(false)
  const [detailId, setDetailId] = useState<ContractId | null>(null)
  const [clientId, setClientId] = useState<ClientId | null>(null)
  const [payTarget, setPayTarget] = useState<Contract | null>(null)

  const isAgent = user?.role === 'agent'

  if (isAgent && rows.length === 0) {
    return (
      <div className="h-full overflow-y-auto px-3 py-4 sm:px-4 sm:py-5 md:p-6">
        <EmptyState
          icon={IconContract}
          title="No contracts yet"
          body="Contracts you sell appear here with their schedule, collections and commission."
          action={
            <Button onClick={() => navigate('/map')} className="h-11 gap-1.5 md:h-9">
              <Icon icon={IconAdd} size={15} />
              Find available lots
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="mx-auto max-w-[1400px] space-y-4 px-3 py-4 sm:px-4 sm:py-5 md:space-y-5 md:p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow text-gold-deep dark:text-gold">
              {isAgent ? 'My book' : 'Transactions'}
            </p>
            <h1 className="font-display text-[28px] font-semibold leading-tight text-ink md:text-[30px]">
              {isAgent ? 'My Sales' : 'Sales & Payments'}
            </h1>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:w-auto">
            {canHold && (
              <Button
                variant="outline"
                onClick={() => setHoldOpen(true)}
                className="h-11 gap-1.5 md:h-9"
              >
                <Icon icon={IconHold} size={15} />
                Request hold
              </Button>
            )}
            {canCreate && (
              <Button
                onClick={() => setBuilderOpen(true)}
                className="h-11 gap-1.5 md:h-9"
              >
                <Icon icon={IconAdd} size={15} />
                New contract
              </Button>
            )}
          </div>
        </header>

        {canViewAll && <SummaryCards />}

        <Tabs value={tab} onValueChange={(value) => setTab(value as SalesTab)}>
          <TabsList className="grid w-full grid-cols-2 grid-rows-2 items-stretch gap-1 group-data-[orientation=horizontal]/tabs:h-[95px] sm:inline-flex sm:w-fit sm:items-center sm:group-data-[orientation=horizontal]/tabs:h-9">
            <TabsTrigger className="h-11 sm:h-[calc(100%-1px)]" value="contracts">
              Contracts
            </TabsTrigger>
            <TabsTrigger className="h-11 sm:h-[calc(100%-1px)]" value="payments">
              Payments
            </TabsTrigger>
            <TabsTrigger className="h-11 sm:h-[calc(100%-1px)]" value="receivables">
              Receivables
            </TabsTrigger>
            <TabsTrigger className="h-11 sm:h-[calc(100%-1px)]" value="clients">
              Clients
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contracts">
            <ContractsTab rows={rows} onOpen={setDetailId} />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentsTab rows={rows} onOpen={setDetailId} />
          </TabsContent>
          <TabsContent value="receivables">
            <ReceivablesTab rows={rows} onOpen={setDetailId} onPay={setPayTarget} />
          </TabsContent>
          <TabsContent value="clients">
            <ClientsTab rows={rows} onOpen={setClientId} />
          </TabsContent>
        </Tabs>
      </div>

      <RequestHoldDialog open={holdOpen} onOpenChange={setHoldOpen} />
      <ContractBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        onCreated={(id) => setDetailId(id)}
      />
      <ContractDetailSheet
        contractId={detailId}
        open={Boolean(detailId)}
        onOpenChange={(open) => !open && setDetailId(null)}
      />
      <ClientSheet
        clientId={clientId}
        open={Boolean(clientId)}
        onOpenChange={(open) => !open && setClientId(null)}
        onOpenContract={(id) => {
          setClientId(null)
          setDetailId(id)
        }}
      />
      <PostPaymentDialog
        contract={payTarget}
        open={Boolean(payTarget)}
        onOpenChange={(open) => !open && setPayTarget(null)}
      />
    </div>
  )
}

function SummaryCards() {
  const version = useDataset((state) => state.version)
  const locationId = useSession((state) => state.activeLocationId)
  const canSeeTrust = useCan('trustfund:view')

  const stats = useMemo(() => {
    void version
    const [from, to] = monthBounds(TODAY)
    return {
      collected: collectionsBetween(from, to, locationId),
      receivables: receivablesBreakdown(locationId, TODAY),
      trust: trustFundBalance(locationId, TODAY),
    }
  }, [locationId, version])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
      className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
    >
      <StatCard
        label="Collected this month"
        value={formatPeso(stats.collected.totalCentavos, { compact: true })}
        hint={`${formatCount(stats.collected.count)} payments`}
        className="min-w-0 p-3 sm:p-4"
      />
      <StatCard
        label="Receivables"
        value={formatPeso(stats.receivables.totalCentavos, { compact: true })}
        hint={`${formatCount(stats.receivables.buckets.severely_overdue.count)} at 90+ days`}
        className="min-w-0 p-3 sm:p-4"
      />
      <StatCard
        label="90+ overdue"
        value={formatPeso(stats.receivables.buckets.severely_overdue.centavos, {
          compact: true,
        })}
        hint="The call sheet at the top of Receivables"
        className="min-w-0 p-3 sm:p-4"
      />
      {canSeeTrust && (
        <StatCard
          label="Trust fund"
          value={formatPeso(stats.trust, { compact: true })}
          hint="20% of every posted payment, accrued"
          action={<Icon icon={IconTrustFund} size={16} className="text-green" />}
          className="min-w-0 p-3 sm:p-4"
        />
      )}
    </motion.div>
  )
}
