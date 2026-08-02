import { ASSUMPTIONS, type Installment, type InstallmentStatus } from '@/domain'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fmtDate } from '@/lib/dates'
import { sumCentavos } from '@/lib/money'
import { cn } from '@/lib/utils'

const STATUS_TONE: Record<InstallmentStatus, string> = {
  upcoming: 'text-muted',
  due: 'text-gold-deep dark:text-gold',
  partial: 'text-gold-deep dark:text-gold',
  paid: 'text-green',
  overdue: 'text-danger',
}

const STATUS_LABEL: Record<InstallmentStatus, string> = {
  upcoming: 'Upcoming',
  due: 'Due',
  partial: 'Partial',
  paid: 'Paid',
  overdue: 'Overdue',
}

/**
 * The amortization schedule. Even division with the remainder on installment
 * one, so the column always ties out to the contract price exactly.
 */
export function ScheduleTable({
  schedule,
  highlight,
  maxHeight = 260,
  className,
}: {
  schedule: Pick<
    Installment,
    'installmentNo' | 'dueDate' | 'amountDueCentavos' | 'amountPaidCentavos' | 'status'
  >[]
  /** Installment numbers a pending payment would settle. */
  highlight?: number[]
  maxHeight?: number
  className?: string
}) {
  const total = sumCentavos(schedule.map((i) => i.amountDueCentavos))
  const paid = sumCentavos(schedule.map((i) => i.amountPaidCentavos))

  return (
    <div
      className={cn(
        'min-w-0 rounded-[var(--radius-card)] border border-line bg-surface',
        className,
      )}
    >
      <div className="flex flex-col items-start gap-1.5 border-b border-line px-3.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="eyebrow break-words leading-relaxed text-gold-deep dark:text-gold">
          Amortization · {schedule.length} months
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
          <span>No downpayment, no interest</span>
          <AssumedChip why={ASSUMPTIONS.downpayment.why} />
          <AssumedChip why={ASSUMPTIONS.interest.why} />
        </span>
      </div>

      <ScrollArea style={{ maxHeight }} className="overflow-y-auto">
        <ul aria-label="Amortization schedule" className="divide-y divide-line-soft md:hidden">
          {schedule.map((i) => {
            const lit = highlight?.includes(i.installmentNo)
            return (
              <li
                key={i.installmentNo}
                className={cn('px-3.5 py-2.5', lit && 'bg-gold/10')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-ink">
                      Installment{' '}
                      <span className="font-mono text-[11.5px] text-muted">
                        {String(i.installmentNo).padStart(2, '0')}
                      </span>
                    </p>
                    <p className="mt-0.5 tabular text-[12px] text-muted">
                      Due {fmtDate(i.dueDate)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-right text-[12px] font-medium',
                      STATUS_TONE[i.status],
                    )}
                  >
                    {lit ? 'Settles now' : STATUS_LABEL[i.status]}
                  </span>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-3 border-t border-line-soft pt-2">
                  <div className="min-w-0">
                    <dt className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                      Amount due
                    </dt>
                    <dd className="m-0 mt-0.5 text-[12.5px] text-ink">
                      <MoneyText
                        centavos={i.amountDueCentavos}
                        className="whitespace-nowrap"
                      />
                    </dd>
                  </div>
                  <div className="min-w-0 text-right">
                    <dt className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                      Paid
                    </dt>
                    <dd className="m-0 mt-0.5 text-[12.5px] text-ink">
                      <MoneyText
                        centavos={i.amountPaidCentavos}
                        muted={i.amountPaidCentavos === 0}
                        className="whitespace-nowrap"
                      />
                    </dd>
                  </div>
                </dl>
              </li>
            )
          })}
        </ul>

        <table className="hidden w-full text-[12.5px] md:table">
          <caption className="sr-only">Amortization schedule</caption>
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr className="eyebrow text-gold-deep dark:text-gold">
              <th className="px-3.5 py-1.5 text-left font-semibold">#</th>
              <th className="px-3.5 py-1.5 text-left font-semibold">Due</th>
              <th className="px-3.5 py-1.5 text-right font-semibold">Amount</th>
              <th className="px-3.5 py-1.5 text-right font-semibold">Paid</th>
              <th className="px-3.5 py-1.5 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((i) => {
              const lit = highlight?.includes(i.installmentNo)
              return (
                <tr
                  key={i.installmentNo}
                  className={cn(
                    'border-b border-line-soft last:border-0',
                    lit && 'bg-gold/10',
                  )}
                >
                  <td className="px-3.5 py-1.5 font-mono text-[11.5px] text-muted">
                    {String(i.installmentNo).padStart(2, '0')}
                  </td>
                  <td className="px-3.5 py-1.5 tabular text-ink">{fmtDate(i.dueDate)}</td>
                  <td className="px-3.5 py-1.5 text-right">
                    <MoneyText centavos={i.amountDueCentavos} />
                  </td>
                  <td className="px-3.5 py-1.5 text-right">
                    <MoneyText
                      centavos={i.amountPaidCentavos}
                      muted={i.amountPaidCentavos === 0}
                    />
                  </td>
                  <td
                    className={cn(
                      'px-3.5 py-1.5 text-right font-medium',
                      STATUS_TONE[i.status],
                    )}
                  >
                    {lit ? 'Settles now' : STATUS_LABEL[i.status]}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollArea>

      <dl className="grid gap-1 border-t border-line bg-surface-2 px-3.5 py-2 text-[12px] sm:hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
          <dt className="text-muted">Schedule total</dt>
          <dd className="m-0 text-right">
            <MoneyText
              centavos={total}
              className="whitespace-nowrap font-medium text-ink"
            />
          </dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
          <dt className="text-muted">Paid</dt>
          <dd className="m-0 text-right">
            <MoneyText centavos={paid} className="whitespace-nowrap text-ink" />
          </dd>
        </div>
      </dl>

      <div className="hidden items-center justify-between border-t border-line bg-surface-2 px-3.5 py-2 text-[12px] sm:flex">
        <span className="text-muted">Schedule total</span>
        <span className="flex gap-4">
          <span className="text-muted">
            Paid <MoneyText centavos={paid} className="whitespace-nowrap text-ink" />
          </span>
          <MoneyText
            centavos={total}
            className="whitespace-nowrap font-medium text-ink"
          />
        </span>
      </div>
    </div>
  )
}
