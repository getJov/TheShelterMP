import { useMemo, useState } from 'react'
import {
  ASSUMPTIONS,
  CONTRACT_STATUS_LABEL,
  NEED_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_MODE_LABEL,
  clientFullName,
  type CommissionEntry,
  type Contract,
  type ContractId,
  type Payment,
} from '@/domain'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconCertificate,
  IconCheck,
  IconDocument,
  IconInvoice,
  IconMissing,
  IconTransfer,
  IconWarning,
} from '@/components/ui-brand/icons'
import { useDataset, indexes } from '@/stores/dataset'
import { useSales } from '@/stores/sales'
import { useCan, useCurrentUserOrNull } from '@/lib/permissions'
import { balanceOf, paymentHealth, scheduleOf } from '@/lib/finance'
import { formatPercent, formatPeso } from '@/lib/money'
import { fmtDate, fmtDateTime } from '@/lib/dates'
import { TODAY } from '@/mock'
import { toast } from 'sonner'
import { ScheduleTable } from './ScheduleTable'
import { TrustFundNote } from './CommissionSplit'
import { ContractStatusChip, FieldRow, HealthChip } from './chips'
import { PostPaymentDialog } from './PostPaymentDialog'
import { CancelContractDialog } from './CancelContractDialog'
import { VoidPaymentDialog } from './VoidPaymentDialog'
import { InvoiceDialog } from './InvoiceDialog'
import { TransferOwnershipDialog } from './TransferOwnershipDialog'
import {
  METHOD_ICON,
  agentNameOf,
  clientNameOf,
  expectedDocuments,
  lotCodeById,
  tierNameOf,
} from '../lib'
import { cn } from '@/lib/utils'

const LEVEL_NAMES = ASSUMPTIONS.commissionLevelNames.value

/**
 * The wide right-hand sheet. Spec 06's lot drawer imports ContractDetailBody
 * rather than rebuilding any of this.
 */
export function ContractDetailSheet({
  contractId,
  open,
  onOpenChange,
}: {
  contractId: ContractId | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const version = useDataset((s) => s.version)
  const contract = useMemo(() => {
    void version
    return contractId ? (indexes().contractsById.get(contractId) ?? null) : null
  }, [contractId, version])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[720px]">
        {contract ? (
          <>
            <SheetHeader className="gap-1 border-b border-line px-5 py-4">
              <SheetTitle className="flex flex-wrap items-center gap-2 font-display text-[22px]">
                <span className="font-mono text-[17px]">{contract.contractNo}</span>
                <ContractStatusChip status={contract.status} />
                <HealthChip health={paymentHealth(contract, TODAY)} />
              </SheetTitle>
              <SheetDescription>
                {clientNameOf(contract.clientId)} ·{' '}
                <span className="font-mono">{lotCodeById(contract.lotId)}</span> ·{' '}
                {tierNameOf(contract.lotId)}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1 overflow-y-auto">
              <ContractDetailBody contract={contract} onClose={() => onOpenChange(false)} />
            </ScrollArea>
          </>
        ) : (
          <div className="p-6 text-[13px] text-muted">No contract selected.</div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function ContractDetailBody({
  contract,
  onClose,
}: {
  contract: Contract
  onClose?: () => void
}) {
  const version = useDataset((s) => s.version)
  const user = useCurrentUserOrNull()
  const canPost = useCan('payment:post')
  const canApprove = useCan('contract:approve')
  const canCancel = useCan('contract:cancel')
  const canVoid = useCan('payment:void')
  const canTransfer = useCan('transfer:request')
  const approveContract = useSales((s) => s.approveContract)
  const issueCertificate = useSales((s) => s.issueCertificate)

  const [payOpen, setPayOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null)

  const model = useMemo(() => {
    void version
    const payments = (indexes().paymentsByContract.get(contract.id) ?? [])
      .slice()
      .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))
    const commissions = commissionsOf(contract.id)
    const lines = indexes().serviceLinesByContract.get(contract.id) ?? []
    const trust = trustFundOf(contract.id)
    return {
      balance: balanceOf(contract),
      schedule: scheduleOf(contract.id),
      payments,
      commissions,
      lines,
      trustFundCentavos: trust,
      history: historyOf(contract),
    }
  }, [contract, version])

  const cancelled = contract.status === 'cancelled'
  const eligibleForCertificate =
    !cancelled && model.balance.outstandingCentavos <= 0 && !contract.certificateNo

  return (
    <div className="space-y-5 p-5">
      {cancelled && (
        <div className="flex items-start gap-2 rounded-[var(--radius-card)] border border-danger/40 bg-danger/8 p-3 text-[12.5px] text-ink">
          <Icon icon={IconWarning} size={16} className="mt-0.5 text-danger" />
          <span>
            <span className="font-medium">
              Cancelled {fmtDate(contract.cancelledAt ?? undefined)}.
            </span>{' '}
            {contract.cancelReason} — this record is read-only. The trust-fund accrual was
            retained.
          </span>
        </div>
      )}

      {/* actions */}
      {!cancelled && (
        <div className="flex flex-wrap gap-2">
          {canPost && contract.status === 'active' && (
            <Button size="sm" onClick={() => setPayOpen(true)}>
              Post payment
            </Button>
          )}
          {canApprove && contract.status === 'pending_approval' && (
            <Button
              size="sm"
              onClick={() => {
                if (!user) return
                approveContract(contract.id, user)
                toast.success(`Contract ${contract.contractNo} approved.`)
              }}
            >
              Approve contract
            </Button>
          )}
          {eligibleForCertificate && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                if (!user) return
                const no = issueCertificate(contract.id, user)
                if (no) toast.success(`Certificate ${no} issued.`)
                else toast.error('A certificate is issued only on full payment.')
              }}
            >
              <Icon icon={IconCertificate} size={15} />
              Issue certificate
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setInvoiceOpen(true)}
          >
            <Icon icon={IconInvoice} size={15} />
            Preview invoice
          </Button>
          {canTransfer && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setTransferOpen(true)}
            >
              <Icon icon={IconTransfer} size={15} />
              Change owner
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={() => setCancelOpen(true)}
            >
              Cancel contract
            </Button>
          )}
        </div>
      )}

      {/* summary */}
      <Section title="Summary">
        <div className="grid gap-x-6 sm:grid-cols-2">
          <div>
            <FieldRow label="Buyer">{clientNameOf(contract.clientId)}</FieldRow>
            {contract.coOwnerClientId && (
              <FieldRow label="Co-owner">{clientNameOf(contract.coOwnerClientId)}</FieldRow>
            )}
            <FieldRow label="Lot">
              <span className="font-mono">{lotCodeById(contract.lotId)}</span>
            </FieldRow>
            <FieldRow label="Tier">{tierNameOf(contract.lotId)}</FieldRow>
            <FieldRow label="Selling agent">{agentNameOf(contract.agentId)}</FieldRow>
          </div>
          <div>
            <FieldRow label="Need type">{NEED_TYPE_LABEL[contract.needType]}</FieldRow>
            <FieldRow label="Payment mode">
              {PAYMENT_MODE_LABEL[contract.paymentMode]}
              {contract.termMonths ? ` · ${contract.termMonths} mo` : ''}
            </FieldRow>
            <FieldRow label="Signed">{fmtDate(contract.signedAt)}</FieldRow>
            <FieldRow label="Status">{CONTRACT_STATUS_LABEL[contract.status]}</FieldRow>
            <FieldRow label="Certificate">
              {contract.certificateNo ? (
                <span className="font-mono text-green">{contract.certificateNo}</span>
              ) : (
                <span className="text-muted">Issued only on full payment</span>
              )}
            </FieldRow>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Metric label="Contract price" centavos={model.balance.totalCentavos} />
          <Metric label="Paid" centavos={model.balance.paidCentavos} tone="green" />
          <Metric
            label="Outstanding"
            centavos={model.balance.outstandingCentavos}
            tone={model.balance.outstandingCentavos > 0 ? 'ink' : 'green'}
          />
        </div>
      </Section>

      {/* price breakdown */}
      <Section title="Price breakdown">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-2.5">
          <FieldRow label="List price at signing">
            <MoneyText centavos={contract.listPriceCentavos} />
          </FieldRow>
          {contract.discountCentavos > 0 && (
            <FieldRow label={`Discount — ${contract.discountReason ?? 'no reason given'}`}>
              <MoneyText centavos={-contract.discountCentavos} className="text-green" />
            </FieldRow>
          )}
          {model.lines.map((l) => (
            <FieldRow key={l.id} label={`${l.description} × ${l.quantity}`}>
              <MoneyText centavos={l.totalCentavos} />
            </FieldRow>
          ))}
          <div className="mt-1 border-t border-line pt-1.5">
            <FieldRow label="Contract price">
              <MoneyText
                centavos={contract.contractPriceCentavos}
                className="font-medium"
              />
            </FieldRow>
          </div>
          <p className="mt-2 text-[11.5px] leading-snug text-muted">
            Priced from entry{' '}
            <span className="font-mono">{contract.priceBookEntryId}</span> as of{' '}
            {fmtDate(contract.signedAt)}. Future price changes do not alter this contract.
          </p>
        </div>
        <TrustFundNote amountCentavos={model.trustFundCentavos} className="mt-2.5" compact />
      </Section>

      {/* schedule */}
      {contract.paymentMode === 'installment' ? (
        <Section title="Amortization schedule">
          <ScheduleTable schedule={model.schedule} maxHeight={260} />
        </Section>
      ) : (
        <Section title="Amortization schedule">
          <p className="rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-3 text-[12.5px] text-muted">
            Spot-cash contract — one settled line, no schedule.
          </p>
        </Section>
      )}

      {/* payment ledger */}
      <Section title={`Payment ledger · ${model.payments.length}`}>
        {model.payments.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-3 text-[12.5px] text-muted">
            No payment has been posted yet.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft rounded-[var(--radius-card)] border border-line bg-surface">
            {model.payments.map((p) => (
              <li
                key={p.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5',
                  p.status === 'void' && 'opacity-60',
                )}
              >
                <Icon icon={METHOD_ICON[p.method]} size={15} className="text-muted" />
                <span
                  className={cn(
                    'font-mono text-[12.5px] text-ink',
                    p.status === 'void' && 'line-through',
                  )}
                >
                  {p.orNo}
                </span>
                <span className="text-[12px] text-muted">{fmtDate(p.paidAt)}</span>
                <span className="text-[12px] text-muted">
                  {PAYMENT_METHOD_LABEL[p.method]}
                  {p.referenceNo ? ` · ${p.referenceNo}` : ''}
                </span>
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-[11.5px] text-muted">
                    trust <MoneyText centavos={p.trustFundCentavos} className="text-green" />
                  </span>
                  <MoneyText
                    centavos={p.amountCentavos}
                    className={cn(
                      'text-[13.5px] text-ink',
                      p.status === 'void' && 'line-through',
                    )}
                  />
                  {canVoid && p.status === 'posted' && (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-danger hover:text-danger"
                      onClick={() => setVoidTarget(p)}
                    >
                      Void
                    </Button>
                  )}
                </span>
                {p.status === 'void' && (
                  <span className="w-full text-[11.5px] text-danger">
                    Voided — {p.voidReason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* commission */}
      <Section title="Commission breakdown">
        {model.commissions.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-3 text-[12.5px] text-muted">
            No commission has accrued.
          </p>
        ) : (
          <CommissionByLevel entries={model.commissions} />
        )}
      </Section>

      {/* documents */}
      <Section title="Documents">
        <ul className="divide-y divide-line-soft rounded-[var(--radius-card)] border border-line bg-surface">
          {expectedDocuments(contract).map((d) => (
            <li key={d.key} className="flex items-center gap-2.5 px-3.5 py-2">
              <Icon
                icon={d.present ? IconCheck : IconMissing}
                size={15}
                className={d.present ? 'text-green' : 'text-muted'}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ink">{d.label}</span>
                <span className="block truncate text-[11.5px] text-muted">{d.detail}</span>
              </span>
              <span
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-wide',
                  d.present ? 'text-green' : 'text-muted',
                )}
              >
                {d.present ? 'Present' : 'Missing'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
          <Icon icon={IconDocument} size={13} />
          Files are tracked in the office checklist.
        </p>
      </Section>

      {/* history */}
      <Section title="History">
        <ul className="space-y-1.5">
          {model.history.map((h) => (
            <li key={h.id} className="flex gap-2.5 text-[12.5px]">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
              <span className="min-w-0">
                <span className="text-ink">{h.label}</span>
                <span className="ml-1.5 text-muted">{fmtDateTime(h.at)}</span>
              </span>
            </li>
          ))}
          {model.history.length === 0 && (
            <li className="text-[12.5px] text-muted">No recorded events.</li>
          )}
        </ul>
      </Section>

      <Separator />
      <p className="text-[11.5px] text-muted">
        Reference <span className="font-mono text-ink">{contract.contractNo}</span> · created{' '}
        {fmtDateTime(contract.createdAt)}
      </p>

      <PostPaymentDialog contract={contract} open={payOpen} onOpenChange={setPayOpen} />
      <CancelContractDialog
        contract={contract}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onCancelled={onClose}
      />
      <InvoiceDialog contract={contract} open={invoiceOpen} onOpenChange={setInvoiceOpen} />
      <TransferOwnershipDialog
        contract={contract}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
      <VoidPaymentDialog
        payment={voidTarget}
        open={Boolean(voidTarget)}
        onOpenChange={(v) => !v && setVoidTarget(null)}
      />
    </div>
  )
}

function CommissionByLevel({ entries }: { entries: CommissionEntry[] }) {
  const byLevel = new Map<string, CommissionEntry[]>()
  for (const e of entries) {
    const arr = byLevel.get(e.level)
    if (arr) arr.push(e)
    else byLevel.set(e.level, [e])
  }
  const basis = entries
    .filter((e) => e.level === 'associate')
    .reduce((s, e) => s + e.basisCentavos, 0)

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface">
      <ul className="divide-y divide-line-soft">
        {[...byLevel.entries()].map(([level, rows]) => {
          const total = rows.reduce((s, r) => s + r.amountCentavos, 0)
          const live = rows.filter((r) => r.status !== 'voided')
          return (
            <li key={level} className="flex items-center justify-between gap-3 px-3.5 py-2">
              <span className="min-w-0">
                <span className="block text-[13px] text-ink">
                  {agentNameOf(rows[0]!.agentId)}
                </span>
                <span className="block text-[11.5px] text-muted">
                  {LEVEL_NAMES[rows[0]!.level]} ·{' '}
                  {formatPercent(rows[0]!.ratePercent, 0)} · {live.length} of {rows.length}{' '}
                  entries live
                </span>
              </span>
              <MoneyText centavos={total} className="text-[13.5px] text-ink" />
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-line bg-surface-2 px-3.5 py-2 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5">
          Basis <MoneyText centavos={basis} className="text-ink" /> — the full collected
          amount
          <AssumedChip why={ASSUMPTIONS.commissionRates.why} label="Rates assumed" />
        </span>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-2 text-gold-deep dark:text-gold">{title}</h3>
      {children}
    </section>
  )
}

function Metric({
  label,
  centavos,
  tone = 'ink',
}: {
  label: string
  centavos: number
  tone?: 'ink' | 'green'
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-2.5">
      <p className="eyebrow text-muted">{label}</p>
      <MoneyText
        centavos={centavos}
        className={cn(
          'mt-0.5 block font-display text-[20px] font-semibold leading-none',
          tone === 'green' ? 'text-green' : 'text-ink',
        )}
      />
    </div>
  )
}

// ── small non-reactive readers, called inside a memo ─────────────────
function commissionsOf(contractId: ContractId): CommissionEntry[] {
  return useDataset
    .getState()
    .data.commissions.filter((c) => c.contractId === contractId)
}

function trustFundOf(contractId: ContractId): number {
  return useDataset
    .getState()
    .data.trustFund.filter((e) => e.contractId === contractId)
    .reduce((s, e) => s + e.amountCentavos, 0)
}

function historyOf(contract: Contract): { id: string; label: string; at: string }[] {
  const out: { id: string; label: string; at: string }[] = []
  const d = useDataset.getState().data

  out.push({
    id: `${contract.id}-signed`,
    label: `Contract signed by ${clientName(contract)}`,
    at: contract.createdAt,
  })
  if (contract.approvedAt)
    out.push({
      id: `${contract.id}-approved`,
      label: `Approved by ${d.users.find((u) => u.id === contract.approvedByUserId)?.fullName ?? 'a manager'}`,
      at: contract.approvedAt,
    })
  for (const p of d.payments.filter((p) => p.contractId === contract.id)) {
    out.push({
      id: `${p.id}-posted`,
      label: `${p.status === 'void' ? 'Voided payment' : 'Payment'} ${p.orNo} — ${formatPeso(p.amountCentavos)}`,
      at: p.postedAt,
    })
  }
  if (contract.certificateIssuedAt)
    out.push({
      id: `${contract.id}-cert`,
      label: `Certificate ${contract.certificateNo} issued`,
      at: `${contract.certificateIssuedAt}T09:00:00+08:00`,
    })
  if (contract.cancelledAt)
    out.push({
      id: `${contract.id}-cancelled`,
      label: `Cancelled — ${contract.cancelReason}`,
      at: contract.cancelledAt,
    })
  for (const t of d.transfers.filter((t) => t.contractId === contract.id)) {
    out.push({
      id: `${t.id}-transfer`,
      label: `Ownership transfer ${t.status}`,
      at: t.decidedAt ?? t.requestedAt,
    })
  }

  return out.sort((a, b) => (a.at < b.at ? 1 : -1))
}

function clientName(contract: Contract): string {
  const c = indexes().clientsById.get(contract.clientId)
  return c ? clientFullName(c) : '—'
}
