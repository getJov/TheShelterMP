import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ASSUMPTIONS,
  CONTRACT_STATUS_LABEL,
  INTERMENT_STATUS_LABEL,
  INTERMENT_TYPE_LABEL,
  NEED_TYPE_LABEL,
  PAYMENT_MODE_LABEL,
  SLOT_LABEL,
  STATUS_APPEARANCE,
  blockingRequirements,
  deceasedFullName,
  type Interment,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconArrowRight,
  IconCertificate,
  IconCheck,
  IconDocument,
  IconInterment,
  IconMissing,
  IconWarning,
} from '@/components/ui-brand/icons'
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/dates'
import { formatPeso, formatPercent } from '@/lib/money'
import { NOW } from '@/mock'
import { indexes } from '@/stores/dataset'
import { requirementsProgress } from '@/stores/burials'
import { levelLabel } from '@/stores/agents'
import { ContractStatusChip, HealthChip } from '@/features/sales/components/chips'
import { TrustFundNote } from '@/features/sales/components/CommissionSplit'
import { METHOD_ICON } from '@/features/sales/lib'
import { RequirementsChecklist } from '@/features/burials/RequirementsChecklist'
import { AgentAvatar } from '@/features/agents/shared'
import { cn } from '@/lib/utils'
import type { LotModel } from './model'
import { Caption, EASE, Field, HealthBar, Panel, TintedProgress } from './bits'

const noop = () => {}

// ── contract ─────────────────────────────────────────────────────────
export function ContractBody({ model }: { model: LotModel }) {
  const c = model.contract
  if (!c) return null
  const cancelled = c.status === 'cancelled'

  return (
    <div className="space-y-2.5">
      {cancelled && (
        <Panel tone="danger" className="flex items-start gap-2 py-2.5">
          <Icon icon={IconWarning} size={15} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-[12px] leading-snug text-ink">
            <span className="font-medium">Cancelled {fmtDate(c.cancelledAt)}.</span>{' '}
            {c.cancelReason ?? 'No reason recorded.'} The trust-fund accrual was retained.
          </p>
        </Panel>
      )}

      <Panel className="py-2.5">
        <div className="flex items-center justify-between gap-3 pb-1.5">
          <span
            className={cn('font-mono text-[13px] text-ink', cancelled && 'line-through')}
          >
            {c.contractNo}
          </span>
          <ContractStatusChip status={c.status} />
        </div>
        <Separator />
        <div className="pt-1">
          <Field label="Need type">{NEED_TYPE_LABEL[c.needType]}</Field>
          <Field label="Payment mode">
            {PAYMENT_MODE_LABEL[c.paymentMode]}
            {c.termMonths ? ` · ${c.termMonths} months` : ''}
          </Field>
          <Field label="Signed">{fmtDate(c.signedAt)}</Field>
          <Field label="Approved by">
            {c.approvedByUserId
              ? (indexes().usersById.get(c.approvedByUserId)?.fullName ?? '—')
              : 'Not yet approved'}
          </Field>
          <Field label="Status">{CONTRACT_STATUS_LABEL[c.status]}</Field>
        </div>
      </Panel>

      <Panel className="py-2.5">
        <Caption className="pb-1">Price breakdown</Caption>
        <Field label="List price">
          <MoneyText centavos={c.listPriceCentavos} />
        </Field>
        {c.discountCentavos > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <Field label="Less discount">
                  <MoneyText centavos={-c.discountCentavos} className="text-green" />
                </Field>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-[12.5px]">
              {c.discountReason ?? 'No reason was recorded for this discount.'}
            </TooltipContent>
          </Tooltip>
        )}
        {model.serviceLines.map((l) => (
          <Field key={l.id} label={`${l.description} × ${l.quantity}`}>
            <MoneyText centavos={l.totalCentavos} />
          </Field>
        ))}
        <div className="mt-1 border-t border-line pt-1.5">
          <Field label="Contract price">
            <MoneyText centavos={c.contractPriceCentavos} className="font-medium" />
          </Field>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Priced from entry <span className="font-mono">{c.priceBookEntryId}</span>, effective{' '}
          {fmtDate(c.signedAt)}. Future price changes do not alter this contract.
        </p>
      </Panel>

      <Panel className="flex items-start gap-2.5 py-2.5">
        <Icon
          icon={IconCertificate}
          size={16}
          className={cn('mt-0.5 shrink-0', c.certificateNo ? 'text-green' : 'text-muted')}
        />
        <div className="min-w-0 text-[12.5px]">
          {c.certificateNo ? (
            <p className="text-ink">
              Certificate <span className="font-mono">{c.certificateNo}</span> issued{' '}
              {fmtDate(c.certificateIssuedAt)}
            </p>
          ) : (
            <p className="text-muted">
              Issued on full payment
              {model.balance && model.balance.outstandingCentavos > 0 && (
                <>
                  {' — '}
                  <MoneyText
                    centavos={model.balance.outstandingCentavos}
                    className="text-ink"
                  />{' '}
                  to go
                </>
              )}
            </p>
          )}
        </div>
      </Panel>
    </div>
  )
}

// ── payments ─────────────────────────────────────────────────────────
export function PaymentsBody({
  model,
  onViewAll,
}: {
  model: LotModel
  onViewAll?: () => void
}) {
  const c = model.contract
  const bal = model.balance
  if (!c || !bal) return null

  const spotCash = c.paymentMode === 'spot_cash'
  const postedCount = model.ledger.filter((p) => p.status === 'posted').length

  return (
    <div className="space-y-2.5">
      <Panel className="py-3">
        <div className="flex items-baseline justify-between gap-3 pb-2">
          <span className="flex items-center gap-2">
            <HealthChip health={model.health} dense />
          </span>
          <span className="text-[12px] text-muted">
            <MoneyText centavos={bal.paidCentavos} className="text-ink" /> of{' '}
            <MoneyText centavos={bal.totalCentavos} />
          </span>
        </div>

        <HealthBar ratio={bal.paidRatio} health={model.health} />

        <p className="mt-2 text-[12px]">
          {model.overdue.length > 0 ? (
            <span className="text-danger">
              {model.overdue.length}{' '}
              {model.overdue.length === 1 ? 'installment' : 'installments'} overdue ·{' '}
              <MoneyText centavos={model.overdueCentavos} className="font-medium" /> past due
            </span>
          ) : spotCash ? (
            <span className="text-muted">
              Spot cash —{' '}
              {bal.outstandingCentavos <= 0
                ? 'settled in full'
                : 'awaiting settlement in full'}
            </span>
          ) : (
            <span className="text-muted">
              {bal.installmentsPaid} of {bal.installmentsTotal} installments paid
              {model.row?.nextDueDate
                ? ` · next due ${fmtDate(model.row.nextDueDate)}`
                : ' · schedule complete'}
            </span>
          )}
        </p>
      </Panel>

      {model.recentPayments.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface">
          <ul className="divide-y divide-line-soft">
            <AnimatePresence initial={false}>
              {model.recentPayments.map((p, i) => (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, ease: EASE, delay: i * 0.04 }}
                  className="flex items-center gap-2.5 px-3.5 py-2"
                >
                  <Icon icon={METHOD_ICON[p.method]} size={14} className="text-muted" />
                  <span className="font-mono text-[12px] text-ink">{p.orNo}</span>
                  <span className="text-[11.5px] text-muted">{fmtDate(p.paidAt)}</span>
                  <MoneyText
                    centavos={p.amountCentavos}
                    className="ml-auto text-[12.5px] text-ink"
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {onViewAll && postedCount > model.recentPayments.length && (
            <button
              type="button"
              onClick={onViewAll}
              className="flex w-full items-center justify-end gap-1 border-t border-line px-3.5 py-2 text-[12px] font-medium text-gold-deep hover:underline dark:text-gold"
            >
              View all {postedCount}
              <Icon icon={IconArrowRight} size={13} />
            </button>
          )}
        </div>
      ) : (
        <Panel className="py-2.5">
          <p className="text-[12.5px] text-muted">No payment has been posted yet.</p>
        </Panel>
      )}

      <TrustFundNote amountCentavos={model.trustFundCentavos} compact />
    </div>
  )
}

// ── agent & commission ───────────────────────────────────────────────
export function CommissionBody({ model }: { model: LotModel }) {
  if (!model.contract || !model.agent) return null
  const archived = model.agent.status === 'archived'

  return (
    <div className="space-y-2.5">
      <Panel className="flex items-center gap-2.5 py-2.5">
        <AgentAvatar
          agentId={model.agent.id}
          size={34}
          className={cn(archived && 'opacity-45')}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-ink">
            {model.agentUser?.fullName ?? model.agent.agentCode}
          </p>
          <p className="truncate text-[11.5px] text-muted">
            <span className="font-mono">{model.agent.agentCode}</span> ·{' '}
            {levelLabel(model.agent.level)}
          </p>
        </div>
        {archived && (
          <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
            Archived
          </span>
        )}
      </Panel>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2">
          <span className="eyebrow text-gold-deep dark:text-gold">Upline & split</span>
          <AssumedChip why={ASSUMPTIONS.commissionRates.why} label="Rates assumed" />
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="eyebrow text-muted">
              <th className="px-3.5 py-1.5 text-left font-semibold">Level</th>
              <th className="px-3.5 py-1.5 text-right font-semibold">Rate</th>
              <th className="px-3.5 py-1.5 text-right font-semibold">Earned</th>
              <th className="px-3.5 py-1.5 text-right font-semibold">To accrue</th>
            </tr>
          </thead>
          <tbody>
            {model.upline.map((r) => (
              <tr key={r.level} className="border-t border-line-soft">
                <td className="px-3.5 py-1.5">
                  <span className="block truncate text-ink">{r.name}</span>
                  <span className="flex items-center gap-1 text-[10.5px] text-muted">
                    {levelLabel(r.level)}
                    <AssumedChip
                      why={ASSUMPTIONS.commissionLevelNames.why}
                      label="Name assumed"
                    />
                  </span>
                </td>
                <td className="px-3.5 py-1.5 text-right tabular text-muted">
                  {formatPercent(r.ratePercent, 0)}
                </td>
                <td className="px-3.5 py-1.5 text-right">
                  <MoneyText centavos={r.earnedCentavos} className="text-ink" />
                </td>
                <td className="px-3.5 py-1.5 text-right">
                  <MoneyText centavos={r.toAccrueCentavos} muted />
                </td>
              </tr>
            ))}
            {model.upline.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3.5 py-2.5 text-muted">
                  No upline on this contract — nothing to split.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-baseline justify-between gap-3 border-t border-line bg-surface-2 px-3.5 py-2">
          <span className="text-[12px] text-muted">Commission earned to date</span>
          <MoneyText
            centavos={model.commissionEarnedCentavos}
            className="text-[13.5px] font-medium text-ink"
          />
        </div>
      </div>

    </div>
  )
}

// ── interments ───────────────────────────────────────────────────────
function IntermentCard({ interment }: { interment: Interment }) {
  const job = indexes().jobsByInterment.get(interment.id)
  const blocking = blockingRequirements(interment)
  const progress = requirementsProgress(interment)
  const done = interment.status === 'completed'

  return (
    <Panel className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[17px] font-semibold leading-tight text-ink">
            {deceasedFullName(interment)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {interment.dateOfBirth ? fmtDate(interment.dateOfBirth) : '—'} –{' '}
            {fmtDate(interment.dateOfDeath)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
          {INTERMENT_TYPE_LABEL[interment.type]}
        </span>
      </div>

      <div className="mt-2 space-y-0.5 text-[12px] text-muted">
        <p>
          {fmtDate(interment.scheduledDate)} · {SLOT_LABEL[interment.slot]} ·{' '}
          <span className="text-ink">{INTERMENT_STATUS_LABEL[interment.status]}</span>
        </p>
        {done && job?.completedAt && (
          <p className="text-green">Grounds work completed {fmtDateTime(job.completedAt)}</p>
        )}
      </div>

      {!done && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between gap-3 pb-1.5">
            <Caption>
              Requirements · {progress.done} of {progress.total}
            </Caption>
            {blocking.length > 0 && (
              <span className="text-[11px] font-medium text-danger">
                {blocking.length} blocking outstanding
              </span>
            )}
          </div>
          <RequirementsChecklist
            type={interment.type}
            requirements={interment.requirements}
            editable={false}
            onToggle={noop}
            idPrefix={`lot-drawer-${interment.id}`}
          />
        </div>
      )}
    </Panel>
  )
}

export function IntermentsBody({ model }: { model: LotModel }) {
  const used = model.lot.capacity - model.capacityRemaining

  return (
    <div className="space-y-2.5">
      <Panel className="py-2.5">
        <div className="flex items-baseline justify-between gap-3 pb-1.5">
          <Caption>Capacity</Caption>
          <span className="text-[12px] text-muted">
            <span className="text-ink">{used}</span> of {model.lot.capacity} used
          </span>
        </div>
        <TintedProgress
          value={model.lot.capacity > 0 ? (used / model.lot.capacity) * 100 : 0}
          color={STATUS_APPEARANCE.occupied.color}
        />
      </Panel>

      {model.interments.map((i) => (
        <IntermentCard key={i.id} interment={i} />
      ))}

      {model.interments.length === 0 && (
        <Panel className="py-2.5">
          <p className="text-[12.5px] text-muted">No interment is recorded on this lot.</p>
        </Panel>
      )}

      {model.capacityRemaining === 0 && (
        <p className="flex items-center gap-1.5 text-[12px] text-muted">
          <Icon icon={IconInterment} size={14} />
          This lot is at full capacity.
        </p>
      )}
    </div>
  )
}

// ── documents ────────────────────────────────────────────────────────
export function DocumentsBody({ model }: { model: LotModel }) {
  if (model.documents.length === 0) {
    return (
      <Panel className="py-2.5">
        <p className="text-[12.5px] text-muted">
          No paperwork is expected until this lot is under contract.
        </p>
      </Panel>
    )
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line-soft rounded-[var(--radius-card)] border border-line bg-surface">
        {model.documents.map((d) => (
          <li key={d.key} className="flex items-center gap-2.5 px-3.5 py-2">
            <Icon
              icon={d.present ? IconCheck : IconMissing}
              size={15}
              className={d.present ? 'text-green' : 'text-muted'}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] text-ink">{d.label}</span>
              <span className="block truncate text-[11px] text-muted">
                {d.present ? d.detail : 'Not on file'}
              </span>
            </span>
            {d.present ? (
              <Button size="xs" variant="ghost" disabled className="text-muted">
                Download
              </Button>
            ) : (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Missing
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <Icon icon={IconDocument} size={13} />
        Files are tracked in the office checklist.
      </p>
    </div>
  )
}

// ── history ──────────────────────────────────────────────────────────
const TONE_CLASS = {
  gold: 'bg-gold',
  green: 'bg-green',
  danger: 'bg-danger',
  muted: 'bg-line',
} as const

export function HistoryBody({ model }: { model: LotModel }) {
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? model.history : model.history.slice(0, 5)

  if (model.history.length === 0) {
    return (
      <Panel className="py-2.5">
        <p className="text-[12.5px] text-muted">No recorded events for this lot.</p>
      </Panel>
    )
  }

  return (
    <div>
      <ol className="relative space-y-3 border-l border-line-soft pl-4">
        {rows.map((e, i) => (
          <motion.li
            key={e.id}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.24, ease: EASE, delay: Math.min(i, 12) * 0.03 }}
            className="relative"
          >
            <span
              className={cn(
                'absolute -left-[21px] top-[5px] size-[7px] rounded-full ring-2 ring-surface',
                TONE_CLASS[e.tone],
              )}
            />
            <p className="text-[12.5px] leading-snug text-ink">{e.label}</p>
            <p className="text-[11px] text-muted">
              {e.actor ? `${e.actor} · ` : ''}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">{fmtRelative(e.at, NOW)}</span>
                </TooltipTrigger>
                <TooltipContent className="text-[12px]">{fmtDateTime(e.at)}</TooltipContent>
              </Tooltip>
            </p>
          </motion.li>
        ))}
      </ol>
      {model.history.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2.5 text-[12px] font-medium text-gold-deep hover:underline dark:text-gold"
        >
          {showAll ? 'Show less' : `Show all ${model.history.length}`}
        </button>
      )}
    </div>
  )
}

// ── header summaries ─────────────────────────────────────────────────
export function paymentsSummary(model: LotModel): string {
  if (!model.balance) return '—'
  return `${formatPeso(model.balance.paidCentavos, { compact: true })} of ${formatPeso(
    model.balance.totalCentavos,
    { compact: true },
  )}`
}

export function commissionSummary(model: LotModel): string {
  return formatPeso(model.commissionEarnedCentavos, { compact: true })
}
