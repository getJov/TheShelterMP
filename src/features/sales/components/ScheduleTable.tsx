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
    <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2">
        <span className="eyebrow text-gold-deep dark:text-gold">
          Amortization · {schedule.length} months
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
          No downpayment, no interest
          <AssumedChip why={ASSUMPTIONS.downpayment.why} />
          <AssumedChip why={ASSUMPTIONS.interest.why} />
        </span>
      </div>

      <ScrollArea style={{ maxHeight }} className="overflow-y-auto">
        <table className="w-full text-[12.5px]">
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

      <div className="flex items-center justify-between border-t border-line bg-surface-2 px-3.5 py-2 text-[12px]">
        <span className="text-muted">Schedule total</span>
        <span className="flex gap-4">
          <span className="text-muted">
            Paid <MoneyText centavos={paid} className="text-ink" />
          </span>
          <MoneyText centavos={total} className="font-medium text-ink" />
        </span>
      </div>
    </div>
  )
}
