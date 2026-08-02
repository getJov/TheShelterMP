import { useMemo, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { Contract, ContractId, PaymentHealth } from '@/domain'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { Icon } from '@/components/ui-brand/Icon'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { IconMail, IconPayment } from '@/components/ui-brand/icons'
import { indexes, useDataset } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import { useNotifications } from '@/stores/notifications'
import { useCan, useCurrentUserOrNull } from '@/lib/permissions'
import { receivablesBreakdown } from '@/lib/finance'
import { fmtDate } from '@/lib/dates'
import { formatCount, formatPeso } from '@/lib/money'
import { cn } from '@/lib/utils'
import { TODAY } from '@/mock'
import { HealthChip } from './components/chips'
import type { ContractRow } from './lib'

const RECEIVABLE_BUCKETS: PaymentHealth[] = [
  'severely_overdue',
  'overdue',
  'due_soon',
  'current',
]

export function ReceivablesTab({
  rows,
  onOpen,
  onPay,
}: {
  rows: ContractRow[]
  onOpen: (id: ContractId) => void
  onPay: (contract: Contract) => void
}) {
  const version = useDataset((state) => state.version)
  const locationId = useSession((state) => state.activeLocationId)
  const canPost = useCan('payment:post')
  const notify = useNotifications((state) => state.notify)
  const user = useCurrentUserOrNull()

  // Sourced from the same breakdown the dashboard card uses, so the two
  // totals cannot disagree.
  const breakdown = useMemo(() => {
    void version
    return receivablesBreakdown(locationId, TODAY)
  }, [locationId, version])

  const groups = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.contract.id as string, row]))
    const grouped = new Map<PaymentHealth, ContractRow[]>()
    for (const contract of breakdown.contracts) {
      const row = byId.get(contract.id)
      if (!row) continue
      const current = grouped.get(row.health)
      if (current) current.push(row)
      else grouped.set(row.health, [row])
    }
    for (const values of grouped.values()) {
      values.sort((a, b) => b.daysPastDue - a.daysPastDue)
    }
    return grouped
  }, [breakdown, rows])

  function remind(row: ContractRow) {
    if (!user) return
    const profile = indexes().agentsById.get(row.contract.agentId)
    const agentUser = profile ? indexes().usersById.get(profile.userId) : null
    if (agentUser) {
      notify(
        [agentUser.id],
        'installment_overdue',
        `Follow up — ${row.contractNo}`,
        `${row.buyer} is ${row.daysPastDue} days past due on ${formatPeso(row.outstandingCentavos)}.`,
        '/sales',
      )
    }
    toast.success(`Reminder logged for ${row.buyer}.`, {
      description: 'Email and SMS delivery are a later phase — the agent has been notified.',
    })
  }

  const shown = [...groups.values()].flat()
  const totalShownCentavos = shown.reduce(
    (sum, row) => sum + row.outstandingCentavos,
    0,
  )

  if (shown.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        <EmptyState
          icon={IconPayment}
          title="Nothing outstanding"
          body="Every active contract in view is paid up to date."
        />
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2.5 text-[12.5px] sm:px-3.5">
        <span className="text-muted">Total receivable</span>
        <MoneyText
          centavos={totalShownCentavos}
          className="text-[15px] font-medium text-ink"
        />
        <span className="w-full text-muted sm:ml-auto sm:w-auto">
          {canPost
            ? "The same figure as the dashboard's Receivables card."
            : 'Your own contracts only.'}
        </span>
      </div>

      {RECEIVABLE_BUCKETS.map((bucket) => {
        const bucketRows = groups.get(bucket) ?? []
        if (bucketRows.length === 0) return null
        const bucketTotalCentavos = bucketRows.reduce(
          (sum, row) => sum + row.outstandingCentavos,
          0,
        )

        return (
          <section key={bucket} aria-labelledby={`receivables-${bucket}`}>
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <span id={`receivables-${bucket}`}>
                <HealthChip health={bucket} />
              </span>
              <span className="text-[12.5px] text-muted">
                {formatCount(bucketRows.length)} contract
                {bucketRows.length === 1 ? '' : 's'}
              </span>
              <MoneyText
                centavos={bucketTotalCentavos}
                className="ml-auto text-[14px] font-medium text-ink"
              />
            </div>

            <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface lg:block">
              <ul className="divide-y divide-line-soft">
                {bucketRows.map((row) => (
                  <li
                    key={row.contract.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(row.contract.id)}
                      className="min-w-[220px] flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block text-[13.5px] text-ink">{row.buyer}</span>
                      <span className="block text-[11.5px] text-muted">
                        <span className="font-mono">{row.contractNo}</span> ·{' '}
                        <span className="font-mono">{row.lotCode}</span> · {row.agent}
                      </span>
                    </button>

                    <DesktopFact label="Outstanding">
                      <MoneyText
                        centavos={row.outstandingCentavos}
                        className="text-[13.5px] text-ink"
                      />
                    </DesktopFact>
                    <DesktopFact label="Past due" width={80}>
                      <span
                        className={cn(
                          'tabular text-[13px]',
                          row.daysPastDue > 0 ? 'text-danger' : 'text-muted',
                        )}
                      >
                        {row.daysPastDue > 0 ? `${row.daysPastDue}d` : '—'}
                      </span>
                    </DesktopFact>
                    <DesktopFact label="Last payment" width={104}>
                      <span className="tabular text-[12.5px] text-muted">
                        {row.lastPaymentDate ? fmtDate(row.lastPaymentDate) : '—'}
                      </span>
                    </DesktopFact>
                    <DesktopFact label="Next due" width={104}>
                      <span className="tabular text-[12.5px] text-muted">
                        {row.nextDueDate ? fmtDate(row.nextDueDate) : '—'}
                      </span>
                    </DesktopFact>

                    <ReceivableActions
                      row={row}
                      canPost={canPost}
                      onPay={onPay}
                      onRemind={remind}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <ul
              aria-label={`${bucket.replaceAll('_', ' ')} receivables`}
              className="divide-y divide-line-soft overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface lg:hidden"
            >
              {bucketRows.map((row) => (
                <li key={row.contract.id} className="space-y-3 px-3 py-3.5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-[14px] font-medium text-ink">
                        {row.buyer}
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] text-muted">
                        {row.contractNo} · {row.lotCode}
                      </p>
                    </div>
                    <HealthChip health={row.health} dense className="shrink-0" />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-line-soft py-2.5">
                    <MobileFact label="Outstanding">
                      <MoneyText
                        centavos={row.outstandingCentavos}
                        className="font-medium text-ink"
                      />
                    </MobileFact>
                    <MobileFact label="Past due">
                      <span
                        className={cn(
                          'tabular',
                          row.daysPastDue > 0 ? 'text-danger' : 'text-muted',
                        )}
                      >
                        {row.daysPastDue > 0 ? `${row.daysPastDue} days` : '—'}
                      </span>
                    </MobileFact>
                    <MobileFact label="Next due">
                      <span className="tabular">
                        {row.nextDueDate ? fmtDate(row.nextDueDate) : '—'}
                      </span>
                    </MobileFact>
                    <MobileFact label="Last payment">
                      <span className="tabular">
                        {row.lastPaymentDate ? fmtDate(row.lastPaymentDate) : '—'}
                      </span>
                    </MobileFact>
                  </dl>

                  <p className="break-words text-[12px] text-muted">Agent: {row.agent}</p>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    aria-label={`Open ${row.contractNo} details`}
                    onClick={() => onOpen(row.contract.id)}
                  >
                    Open contract details
                  </Button>
                  <ReceivableActions
                    row={row}
                    canPost={canPost}
                    mobile
                    onPay={onPay}
                    onRemind={remind}
                  />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function ReceivableActions({
  row,
  canPost,
  mobile,
  onPay,
  onRemind,
}: {
  row: ContractRow
  canPost: boolean
  mobile?: boolean
  onPay: (contract: Contract) => void
  onRemind: (row: ContractRow) => void
}) {
  return (
    <div
      className={cn(
        'flex gap-1.5',
        mobile && 'grid grid-cols-1',
        mobile && canPost && 'min-[360px]:grid-cols-2',
      )}
    >
      {canPost && (
        <Button
          type="button"
          size={mobile ? 'default' : 'xs'}
          className={mobile ? 'h-11 w-full' : undefined}
          onClick={() => onPay(row.contract)}
        >
          Post payment
        </Button>
      )}
      <Button
        type="button"
        size={mobile ? 'default' : 'xs'}
        variant="outline"
        className={cn('gap-1', mobile && 'h-11 w-full')}
        onClick={() => onRemind(row)}
      >
        <Icon icon={IconMail} size={13} />
        Send reminder
      </Button>
    </div>
  )
}

function DesktopFact({
  label,
  width,
  children,
}: {
  label: string
  width?: number
  children: ReactNode
}) {
  return (
    <div className="text-right" style={width ? { width } : undefined}>
      <span className="block text-[11px] uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  )
}

function MobileFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-[13px] text-ink">{children}</dd>
    </div>
  )
}
