import { useMemo } from 'react'
import { PARK_FACTS, clientFullName, type Contract } from '@/domain'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Icon } from '@/components/ui-brand/Icon'
import { IconMail, IconPrint } from '@/components/ui-brand/icons'
import { LogoMark } from '@/components/shell/Logo'
import { useDataset, indexes } from '@/stores/dataset'
import { balanceOf, postedPaymentsOf, scheduleOf } from '@/lib/finance'
import { nextDue } from '@/lib/amortization'
import { formatPeso } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { TODAY } from '@/mock'
import { lotCodeById, tierNameOf } from '../lib'

/**
 * The client asked for automated invoicing by email with a unique reference
 * per contract. This builds the ARTIFACT, not the delivery: a printable
 * statement keyed on the contract number. There is deliberately no fake
 * "Send" button.
 */
export function InvoiceDialog({
  contract,
  open,
  onOpenChange,
}: {
  contract: Contract | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const version = useDataset((s) => s.version)

  const model = useMemo(() => {
    void version
    if (!contract) return null
    const client = indexes().clientsById.get(contract.clientId) ?? null
    const schedule = scheduleOf(contract.id)
    return {
      client,
      schedule,
      payments: postedPaymentsOf(contract.id),
      balance: balanceOf(contract),
      due: nextDue(schedule),
    }
  }, [contract, version])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[780px] sm:rounded-lg">
        <style>{PRINT_CSS}</style>

        <DialogHeader className="no-print shrink-0 border-b border-line px-4 pt-[max(1rem,env(safe-area-inset-top))] pr-12 pb-4 text-left sm:px-6 sm:pt-6 sm:pr-12">
          <DialogTitle className="font-display text-[22px]">Statement preview</DialogTitle>
          <DialogDescription>
            Prints on A4. The contract number is the reference the client asked for.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 overscroll-contain">
          {contract && model && (
            <div
              id="invoice-sheet"
              className="mx-auto w-full max-w-[720px] bg-surface p-4 text-ink sm:p-8"
            >
              {/* brand header */}
              <header className="flex flex-col items-start justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:gap-6">
                <div className="flex items-start gap-3">
                  <LogoMark size={40} className="text-gold-deep dark:text-gold" />
                  <div>
                    <p className="font-display text-[20px] font-semibold leading-tight">
                      {PARK_FACTS.corporateName}
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                      {PARK_FACTS.officeAddress}
                      <br />
                      {PARK_FACTS.phone} · {PARK_FACTS.email}
                    </p>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <p className="eyebrow text-gold-deep dark:text-gold">
                    Statement of account
                  </p>
                  <p className="mt-1 font-mono text-[15px]">{contract.contractNo}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    Issued {fmtDate(TODAY)}
                  </p>
                </div>
              </header>

              {/* buyer */}
              <section className="grid gap-6 py-5 sm:grid-cols-2">
                <div>
                  <p className="eyebrow mb-1.5 text-muted">Billed to</p>
                  <p className="text-[14px] font-medium">
                    {model.client ? clientFullName(model.client) : '—'}
                  </p>
                  {model.client && (
                    <p className="mt-0.5 text-[12px] leading-snug text-muted">
                      {model.client.address}
                      <br />
                      {model.client.city}, {model.client.province}
                      <br />
                      {model.client.phone}
                      <br />
                      {model.client.email ?? (
                        <span className="italic">No email on record</span>
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <p className="eyebrow mb-1.5 text-muted">Property</p>
                  <p className="font-mono text-[14px]">{lotCodeById(contract.lotId)}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted">
                    {tierNameOf(contract.lotId)}
                    <br />
                    Signed {fmtDate(contract.signedAt)}
                    <br />
                    {contract.paymentMode === 'installment'
                      ? `${contract.termMonths} monthly installments`
                      : 'Spot cash'}
                  </p>
                </div>
              </section>

              {/* totals */}
              <section className="grid grid-cols-1 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-3">
                <Box label="Contract price" value={formatPeso(model.balance.totalCentavos)} />
                <Box label="Paid to date" value={formatPeso(model.balance.paidCentavos)} />
                <Box
                  label="Outstanding"
                  value={formatPeso(model.balance.outstandingCentavos)}
                  strong
                />
              </section>

              {/* schedule */}
              {model.schedule.length > 0 ? (
                <section className="mt-6">
                  <p className="eyebrow mb-2 text-gold-deep dark:text-gold">
                    Amortization schedule
                  </p>
                  <table className="hidden w-full border-collapse text-[12px] sm:table print:table">
                    <thead>
                      <tr className="border-b border-line text-left text-muted">
                        <th className="py-1.5 pr-2 font-semibold">#</th>
                        <th className="py-1.5 pr-2 font-semibold">Due date</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">Amount</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">Paid</th>
                        <th className="py-1.5 text-right font-semibold">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.schedule.map((i) => (
                        <tr key={i.installmentNo} className="border-b border-line-soft">
                          <td className="py-1 pr-2 font-mono text-[11px] text-muted">
                            {String(i.installmentNo).padStart(2, '0')}
                          </td>
                          <td className="py-1 pr-2 tabular">{fmtDate(i.dueDate)}</td>
                          <td className="py-1 pr-2 text-right tabular">
                            {formatPeso(i.amountDueCentavos)}
                          </td>
                          <td className="py-1 pr-2 text-right tabular">
                            {i.amountPaidCentavos > 0 ? formatPeso(i.amountPaidCentavos) : '—'}
                          </td>
                          <td className="py-1 text-right tabular">
                            {formatPeso(
                              installmentBalance(
                                i.amountDueCentavos,
                                i.amountPaidCentavos,
                              ),
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ol className="divide-y divide-line-soft rounded border border-line sm:hidden print:hidden">
                    {model.schedule.map((i) => (
                      <li key={i.installmentNo} className="grid gap-2 px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-mono text-[11px] text-muted">
                            Installment {String(i.installmentNo).padStart(2, '0')}
                          </span>
                          <span className="text-[12px] tabular text-ink">
                            {fmtDate(i.dueDate)}
                          </span>
                        </div>
                        <dl className="grid grid-cols-3 gap-2 text-[11.5px]">
                          <div>
                            <dt className="text-muted">Amount</dt>
                            <dd className="mt-0.5 tabular text-ink">
                              {formatPeso(i.amountDueCentavos)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Paid</dt>
                            <dd className="mt-0.5 tabular text-ink">
                              {i.amountPaidCentavos > 0
                                ? formatPeso(i.amountPaidCentavos)
                                : '—'}
                            </dd>
                          </div>
                          <div className="text-right">
                            <dt className="text-muted">Balance</dt>
                            <dd className="mt-0.5 tabular text-ink">
                              {formatPeso(
                                installmentBalance(
                                  i.amountDueCentavos,
                                  i.amountPaidCentavos,
                                ),
                              )}
                            </dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : (
                <section className="mt-6 text-[12.5px] text-muted">
                  Spot-cash contract — settled in a single payment, no schedule.
                </section>
              )}

              {/* next due */}
              <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-surface-2 px-4 py-3">
                <div>
                  <p className="eyebrow text-muted">Next amount due</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {model.due
                      ? `Installment ${model.due.installmentNo} · ${fmtDate(model.due.dueDate)}`
                      : model.balance.outstandingCentavos > 0
                        ? 'Payable on receipt'
                        : 'Nothing further is due'}
                  </p>
                </div>
                <p className="font-display text-[24px] font-semibold tabular">
                  {formatPeso(
                    model.due
                      ? model.due.amountDueCentavos - model.due.amountPaidCentavos
                      : model.balance.outstandingCentavos,
                  )}
                </p>
              </section>

              {/* instructions */}
              <footer className="mt-6 border-t border-line pt-4 text-[11.5px] leading-relaxed text-muted">
                <p className="font-medium text-ink">Payment instructions</p>
                <p className="mt-1">
                  Quote reference{' '}
                  <span className="font-mono text-ink">{contract.contractNo}</span> on every
                  payment. Cash and GCash are accepted at {PARK_FACTS.officeAddress}. Bank
                  transfers and checks must be confirmed at the office before an official
                  receipt is issued.
                </p>
                <p className="mt-2">
                  {PARK_FACTS.corporateName} · {PARK_FACTS.phone} · {PARK_FACTS.email}
                </p>
              </footer>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="no-print shrink-0 border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 sm:justify-between">
          <span className="flex min-w-0 items-start gap-1.5 break-words text-left text-[12px] text-muted">
            <Icon icon={IconMail} size={14} />
            {model?.client?.email ? (
              <>
                On file: <span className="text-ink">{model.client.email}</span> — automated
                delivery is a later phase.
              </>
            ) : (
              'No email on record — this statement must be handed over or printed.'
            )}
          </span>
          <Button
            onClick={() => window.print()}
            className="min-h-11 w-full gap-1.5 sm:min-h-0 sm:w-auto"
          >
            <Icon icon={IconPrint} size={15} />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Box({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="bg-surface px-3.5 py-2.5">
      <p className="eyebrow text-muted">{label}</p>
      <p
        className={
          strong
            ? 'mt-0.5 font-display text-[19px] font-semibold tabular'
            : 'mt-0.5 text-[15px] tabular'
        }
      >
        {value}
      </p>
    </div>
  )
}

function installmentBalance(
  amountDueCentavos: number,
  amountPaidCentavos: number,
): number {
  return Math.max(0, amountDueCentavos - amountPaidCentavos)
}

/**
 * A real print stylesheet: everything but the statement is hidden, the sheet
 * is re-laid out at A4 width and colours are forced to ink on paper.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 14mm; }
  body * { visibility: hidden !important; }
  #invoice-sheet, #invoice-sheet * { visibility: visible !important; }
  #invoice-sheet {
    position: fixed !important;
    left: 0; top: 0; right: 0;
    margin: 0 !important;
    padding: 0 !important;
    max-width: 100% !important;
    width: 100% !important;
    background: #fff !important;
    color: #1c1a15 !important;
    box-shadow: none !important;
  }
  #invoice-sheet * { background: transparent !important; }
  #invoice-sheet table { page-break-inside: auto; }
  #invoice-sheet tr { page-break-inside: avoid; }
  #invoice-sheet section, #invoice-sheet footer { page-break-inside: avoid; }
  .no-print, [data-slot='dialog-close'], [data-slot='dialog-overlay'] {
    display: none !important;
  }
}
`
