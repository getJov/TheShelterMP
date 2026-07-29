import {
  PAYMENT_METHOD_LABEL,
  type Payment,
} from '@/domain'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import { IconInvoice } from '@/components/ui-brand/icons'
import { indexes } from '@/stores/dataset'
import { fmtDate } from '@/lib/dates'
import { METHOD_ICON } from '@/features/sales/lib'
import { ScheduleTable } from '@/features/sales/components/ScheduleTable'
import { useLotDetailUi, type LedgerTab } from './store'
import { Caption, HealthBar, Panel } from './bits'
import type { LotModel } from './model'
import { cn } from '@/lib/utils'

/**
 * The reason the drawer has an expand control: a payment ledger you can
 * actually read, and the amortization schedule beside it — the "installment
 * barrier at month 14" made legible at a glance.
 */
/** "Josefina R. Bacaltos" → "J. Bacaltos" — the ledger has no room for more. */
function shortName(full: string | undefined): string {
  if (!full) return '—'
  const parts = full.split(' ').filter(Boolean)
  if (parts.length < 2) return full
  return `${parts[0]![0]}. ${parts[parts.length - 1]}`
}

export function LedgerPanel({ model }: { model: LotModel }) {
  const tab = useLotDetailUi((s) => s.ledgerTab)
  const setTab = useLotDetailUi((s) => s.setLedgerTab)
  const c = model.contract
  const bal = model.balance

  if (!c || !bal) {
    return (
      <Panel className="py-3">
        <Caption>No contract</Caption>
        <p className="mt-1 text-[12.5px] text-muted">
          This lot has never been sold, so there is no ledger or schedule to show.
        </p>
      </Panel>
    )
  }

  const columns: Column<Payment>[] = [
    {
      key: 'or',
      header: 'OR no.',
      sortBy: (p) => p.orNo,
      cell: (p) => (
        <span className="block">
          <span
            className={cn('font-mono text-[12px]', p.status === 'void' && 'line-through')}
          >
            {p.orNo}
          </span>
          {p.referenceNo && (
            <span className="block font-mono text-[10.5px] text-muted">
              {p.referenceNo}
            </span>
          )}
          {p.status === 'void' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block cursor-help text-[10.5px] font-medium text-danger">
                  Voided
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-[12.5px]">
                {p.voidReason ?? 'No reason recorded.'}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortBy: (p) => p.paidAt,
      cell: (p) => <span className="tabular whitespace-nowrap">{fmtDate(p.paidAt)}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortBy: (p) => p.amountCentavos,
      cell: (p) => (
        <MoneyText
          centavos={p.amountCentavos}
          className={cn(p.status === 'void' && 'line-through')}
        />
      ),
    },
    {
      key: 'method',
      header: 'Method & receiver',
      cell: (p) => (
        <span className="block whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            <Icon icon={METHOD_ICON[p.method]} size={14} className="text-muted" />
            {PAYMENT_METHOD_LABEL[p.method]}
          </span>
          <span className="block text-[10.5px] text-muted">
            {shortName(indexes().usersById.get(p.receivedByUserId)?.fullName)}
          </span>
        </span>
      ),
    },
    {
      key: 'trust',
      header: 'Trust',
      align: 'right',
      sortBy: (p) => p.trustFundCentavos,
      cell: (p) => <MoneyText centavos={p.trustFundCentavos} className="text-green" />,
    },
  ]

  return (
    <div className="space-y-3">
      <Panel className="py-3">
        <div className="flex items-baseline justify-between gap-3 pb-2">
          <Caption>Collected on {c.contractNo}</Caption>
          <span className="text-[12.5px] text-muted">
            <MoneyText centavos={bal.paidCentavos} className="text-ink" /> of{' '}
            <MoneyText centavos={bal.totalCentavos} />
          </span>
        </div>
        <HealthBar ratio={bal.paidRatio} health={model.health} />
      </Panel>

      <Tabs value={tab} onValueChange={(v) => setTab(v as LedgerTab)}>
        <TabsList>
          <TabsTrigger value="ledger">
            Payment ledger · {model.ledger.length}
          </TabsTrigger>
          <TabsTrigger value="schedule">
            Amortization · {model.schedule.length || '—'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <DataTable
            rows={model.ledger}
            columns={columns}
            rowKey={(p) => p.id}
            dense
            emptyIcon={IconInvoice}
            empty={{
              title: 'No payment posted',
              body: 'Nothing has been collected against this contract yet.',
            }}
          />
        </TabsContent>

        <TabsContent value="schedule">
          {c.paymentMode === 'installment' ? (
            <ScheduleTable schedule={model.schedule} maxHeight={460} />
          ) : (
            <Panel className="py-3">
              <p className="text-[12.5px] text-muted">
                Spot-cash contract — one settled line, no schedule.
              </p>
            </Panel>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
