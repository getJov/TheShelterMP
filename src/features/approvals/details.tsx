import { useMemo, type ReactNode } from 'react'
import {
  ASSUMPTIONS,
  HOLD_DURATION_DAYS,
  INTERMENT_TYPE_LABEL,
  NEED_TYPE_LABEL,
  PAYMENT_MODE_LABEL,
  SLOT_LABEL,
  STATUS_APPEARANCE,
  blockingRequirements,
  deceasedFullName,
  type ApprovalTask,
  type Centavos,
} from '@/domain'
import { useDataset } from '@/stores/dataset'
import { useAgents } from '@/stores/agents'
import { requirementKeys } from '@/stores/burials'
import { resolvePrice } from '@/lib/price-resolver'
import { splitPreview } from '@/lib/commission'
import { balanceOf, scheduleOf } from '@/lib/finance'
import { formatPeso } from '@/lib/money'
import { addDays, diffDays, fmtDate, fmtDateTime } from '@/lib/dates'
import { TODAY } from '@/mock'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { StatusChip } from '@/components/ui-brand/StatusDot'
import { Icon } from '@/components/ui-brand/Icon'
import { IconCheck, IconMissing, IconWarning } from '@/components/ui-brand/icons'
import { LotThumb } from '@/features/burials/LotThumb'
import { cn } from '@/lib/utils'
import {
  REQUIREMENT_LABEL,
  agentDisplayName,
  clientName,
  contractOf,
  holdOf,
  intermentOf,
  lotCodeOf,
  lotOf,
  runOf,
  tierNameOf,
  transferOf,
  userName,
} from './lib'

/**
 * Everything an approver needs, at two depths.
 *
 * `SummaryFacts` is the collapsed card: what is being asked, by whom, for
 * what, and the two or three facts that decide it. Nobody should have to
 * leave the page to approve a hold.
 *
 * `ExpandedDetail` is the same task opened in place — the price resolution,
 * the full breakdown, the per-agent table, the requirements. It never
 * navigates away.
 */

// ── shared bits ──────────────────────────────────────────────────────

function Line({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] leading-relaxed text-muted">{children}</p>
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-ink">{children}</span>
}

export function Panel({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface-2 p-3.5',
        className,
      )}
    >
      <p className="eyebrow mb-2 text-gold-deep dark:text-gold">{title}</p>
      {children}
    </div>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: ReactNode
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <span className="text-[12px] text-muted">{label}</span>
      <span className={cn('text-[12.5px] tabular', strong ? 'font-medium text-ink' : 'text-ink')}>
        {value}
      </span>
    </div>
  )
}

function Missing({ what }: { what: string }) {
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-muted">
      <Icon icon={IconWarning} size={14} className="text-danger" />
      {what}
    </p>
  )
}

// ── summary ──────────────────────────────────────────────────────────

export function SummaryFacts({ task }: { task: ApprovalTask }) {
  useDataset((s) => s.version)
  switch (task.kind) {
    case 'hold':
      return <HoldSummary task={task} />
    case 'contract':
    case 'discount':
      return <ContractSummary task={task} />
    case 'interment':
      return <IntermentSummary task={task} />
    case 'payout_run':
      return <PayoutSummary task={task} />
    case 'ownership_transfer':
      return <TransferSummary task={task} />
    default:
      return <Line>{task.summary}</Line>
  }
}

export function ExpandedDetail({ task }: { task: ApprovalTask }) {
  useDataset((s) => s.version)
  switch (task.kind) {
    case 'hold':
      return <HoldDetail task={task} />
    case 'contract':
    case 'discount':
      return <ContractDetail task={task} />
    case 'interment':
      return <IntermentDetail task={task} />
    case 'payout_run':
      return <PayoutDetail task={task} />
    case 'ownership_transfer':
      return <TransferDetail task={task} />
    default:
      return null
  }
}

/** Title line for the card head — the identifying code, not a sentence. */
export function taskHeadline(task: ApprovalTask): string {
  switch (task.kind) {
    case 'hold': {
      const hold = holdOf(task.entityId)
      const lot = lotOf(hold?.lotId)
      return lot ? `${lotCodeOf(lot)} · ${tierNameOf(lot)}` : task.title
    }
    case 'contract':
    case 'discount': {
      const c = contractOf(task.entityId)
      if (!c) return task.title
      return `${c.contractNo} · ${lotCodeOf(lotOf(c.lotId))} · ${formatPeso(c.contractPriceCentavos)}`
    }
    case 'interment': {
      const i = intermentOf(task.entityId)
      if (!i) return task.title
      return `${lotCodeOf(lotOf(i.lotId))} · ${deceasedFullName(i)}`
    }
    case 'payout_run': {
      const run = runOf(task.entityId)
      if (!run) return task.title
      return `${fmtDate(run.periodStart)} → ${fmtDate(run.periodEnd)}`
    }
    case 'ownership_transfer': {
      const t = transferOf(task.entityId)
      if (!t) return task.title
      return `${lotCodeOf(lotOf(t.lotId))} · change of ownership`
    }
    default:
      return task.title
  }
}

// ── holds ────────────────────────────────────────────────────────────

function useHoldPrice(tierId: string | undefined) {
  const prices = useDataset((s) => s.data.prices)
  return useMemo(() => {
    if (!tierId) return null
    return resolvePrice(
      prices,
      tierId as never,
      'pre_need',
      'spot_cash',
      TODAY,
    )
  }, [prices, tierId])
}

function HoldSummary({ task }: { task: ApprovalTask }) {
  const hold = holdOf(task.entityId)
  const lot = lotOf(hold?.lotId)
  const price = useHoldPrice(lot?.tierId)

  if (!hold) return <Missing what="This hold is no longer on file." />

  const who = clientName(hold.clientId) ?? hold.prospectName ?? 'a walk-in family'

  return (
    <>
      <Line>
        Requested by <Strong>{userName(hold.requestedByUserId)}</Strong> for{' '}
        <Strong>{who}</Strong>
      </Line>
      <Line>
        {/* The lot goes to `held` the instant the request is filed, so the
            useful fact is whether THIS request is the one holding it. */}
        {!lot ? (
          'Lot unknown'
        ) : lot.activeHoldId === hold.id ? (
          'Reserved by this request'
        ) : (
          <span className="text-danger">
            Lot is {STATUS_APPEARANCE[lot.status].label.toLowerCase()} — another claim
            got there first
          </span>
        )}
        {price?.amountCentavos != null && (
          <>
            {' · '}
            <Strong>{formatPeso(price.amountCentavos)}</Strong> spot cash
            {price.isPromo && price.label ? ` (${price.label})` : ''}
          </>
        )}
      </Line>
      <Line>Expires {fmtDate(hold.expiresAt)}</Line>
    </>
  )
}

function HoldDetail({ task }: { task: ApprovalTask }) {
  const hold = holdOf(task.entityId)
  const lot = lotOf(hold?.lotId)
  const price = useHoldPrice(lot?.tierId)
  if (!hold || !lot) return null

  const daysLeft = diffDays(TODAY, hold.expiresAt.slice(0, 10))

  return (
    <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr]">
      <div className="flex flex-col items-start gap-2">
        <LotThumb lot={lot} size={104} />
        <StatusChip status={lot.status} />
      </div>

      <Panel title="The lot">
        <Row label="Code" value={<span className="font-mono">{lotCodeOf(lot)}</span>} />
        <Row label="Tier" value={tierNameOf(lot)} />
        <Row label="Area" value={`${lot.areaSqm.toFixed(1)} sqm`} />
        <Row label="Capacity" value={`${lot.intermentCount} of ${lot.capacity}`} />
      </Panel>

      <Panel title="Price resolution">
        {price?.amountCentavos == null ? (
          <Missing what="No price is published for this tier — contact for pricing." />
        ) : (
          <>
            {price.isPromo && price.listEntry?.amountCentavos != null && (
              <Row
                label="List price"
                value={
                  <span className="text-muted line-through">
                    {formatPeso(price.listEntry.amountCentavos)}
                  </span>
                }
              />
            )}
            <Row label="Pre-need, spot cash" value={formatPeso(price.amountCentavos)} strong />
            {price.isPromo && (
              <Row
                label={price.label ?? 'Promotion'}
                value={<span className="text-green">−{formatPeso(price.savingCentavos)}</span>}
              />
            )}
            <div className="mt-2 border-t border-line pt-2">
              <Row label="Resolved as of" value={fmtDate(TODAY)} />
            </div>
          </>
        )}
      </Panel>

      <Panel title="The request" className="md:col-span-3">
        <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
          <Row label="Requested by" value={userName(hold.requestedByUserId)} />
          <Row label="Requested" value={fmtDateTime(hold.requestedAt)} />
          <Row
            label="For"
            value={clientName(hold.clientId) ?? hold.prospectName ?? 'Walk-in prospect'}
          />
          <Row
            label="Expires"
            value={
              <span className={daysLeft <= 1 ? 'text-danger' : undefined}>
                {fmtDate(hold.expiresAt)} ({daysLeft <= 0 ? 'today' : `${daysLeft}d left`})
              </span>
            }
          />
        </div>
        {hold.decisionNote && (
          <p className="mt-2 border-t border-line pt-2 text-[12.5px] leading-relaxed text-muted">
            “{hold.decisionNote}”
          </p>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted">
          A hold runs {HOLD_DURATION_DAYS} days from approval —{' '}
          {fmtDate(addDays(TODAY, HOLD_DURATION_DAYS))}
          <AssumedChip why={ASSUMPTIONS.holdDurationDays.why} />
        </p>
      </Panel>
    </div>
  )
}

// ── contracts & discounts ────────────────────────────────────────────

function ContractSummary({ task }: { task: ApprovalTask }) {
  const c = contractOf(task.entityId)
  if (!c) return <Missing what="This contract is no longer on file." />

  return (
    <>
      <Line>
        {NEED_TYPE_LABEL[c.needType]} · {PAYMENT_MODE_LABEL[c.paymentMode]}
        {c.paymentMode === 'installment' && c.termMonths ? ` · ${c.termMonths} months` : ''} ·{' '}
        <Strong>{clientName(c.clientId) ?? 'Buyer'}</Strong>
      </Line>
      <Line>
        Created by <Strong>{agentDisplayName(c.agentId)}</Strong>
        {c.signedAt ? ` · signed ${fmtDate(c.signedAt)}` : ''}
      </Line>
      {c.discountCentavos > 0 && (
        <Line>
          <span className="text-danger">
            Discount {formatPeso(c.discountCentavos)}
          </span>
          {c.discountReason ? ` — ${c.discountReason}` : ''}
        </Line>
      )}
    </>
  )
}

function ContractDetail({ task }: { task: ApprovalTask }) {
  const c = contractOf(task.entityId)
  const rules = useDataset((s) => s.data.commissionRules)
  const schedule = useMemo(() => (c ? scheduleOf(c.id) : []), [c])
  const split = useMemo(
    () => (c ? splitPreview(c.contractPriceCentavos, c, rules, TODAY) : []),
    [c, rules],
  )
  if (!c) return null

  const balance = balanceOf(c)
  const commissionTotal = split.reduce((s, x) => s + x.amountCentavos, 0)

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Panel title="Breakdown">
        <Row label="List price" value={formatPeso(c.listPriceCentavos)} />
        {c.discountCentavos > 0 && (
          <Row
            label={c.discountReason ?? 'Discount'}
            value={<span className="text-danger">−{formatPeso(c.discountCentavos)}</span>}
          />
        )}
        {c.servicesTotalCentavos > 0 && (
          <Row label="Services" value={formatPeso(c.servicesTotalCentavos)} />
        )}
        <div className="mt-2 border-t border-line pt-2">
          <Row label="Contract price" value={formatPeso(c.contractPriceCentavos)} strong />
          <Row label="Collected" value={formatPeso(balance.paidCentavos)} />
          <Row label="Outstanding" value={formatPeso(balance.outstandingCentavos)} />
        </div>
      </Panel>

      <Panel title="Schedule">
        {c.paymentMode === 'spot_cash' ? (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Spot cash — the full {formatPeso(c.contractPriceCentavos)} is due on signing.
            No amortisation schedule is built.
          </p>
        ) : schedule.length === 0 ? (
          <p className="text-[12.5px] text-muted">No schedule has been built yet.</p>
        ) : (
          <>
            <Row label="Term" value={`${c.termMonths} months`} />
            <Row
              label="Monthly"
              value={formatPeso(schedule[0]?.amountDueCentavos ?? 0)}
              strong
            />
            <div className="mt-2 space-y-1 border-t border-line pt-2">
              {schedule.slice(0, 3).map((i) => (
                <div
                  key={i.installmentNo}
                  className="flex items-baseline justify-between gap-3 text-[12px]"
                >
                  <span className="text-muted">
                    #{i.installmentNo} · {fmtDate(i.dueDate)}
                  </span>
                  <MoneyText centavos={i.amountDueCentavos} className="text-ink" />
                </div>
              ))}
              {schedule.length > 3 && (
                <p className="pt-0.5 text-[11.5px] text-muted">
                  + {schedule.length - 3} more instalments
                </p>
              )}
            </div>
          </>
        )}
      </Panel>

      <Panel title="Commission if fully collected">
        {split.length === 0 ? (
          <p className="text-[12.5px] text-muted">No upline is attached to this contract.</p>
        ) : (
          <>
            {split.map((s) => (
              <Row
                key={`${s.level}-${s.agentId}`}
                label={`${agentDisplayName(s.agentId)} · ${s.ratePercent}%`}
                value={formatPeso(s.amountCentavos)}
              />
            ))}
            <div className="mt-2 border-t border-line pt-2">
              <Row label="Total" value={formatPeso(commissionTotal)} strong />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] leading-relaxed text-muted">
              Earned on collection, never at signing.
              <AssumedChip why={ASSUMPTIONS.commissionRates.why} />
            </p>
          </>
        )}
      </Panel>
    </div>
  )
}

// ── interments ───────────────────────────────────────────────────────

function IntermentSummary({ task }: { task: ApprovalTask }) {
  const i = intermentOf(task.entityId)
  if (!i) return <Missing what="This interment request is no longer on file." />

  const keys = requirementKeys(i.type)
  const done = keys.filter((k) => i.requirements[k]).length
  const blocked = blockingRequirements(i)

  return (
    <>
      <Line>
        {INTERMENT_TYPE_LABEL[i.type]} · <Strong>{fmtDate(i.scheduledDate)}</Strong>,{' '}
        {SLOT_LABEL[i.slot].toLowerCase()}
      </Line>
      <Line>
        Requested by <Strong>{userName(i.requestedByUserId)}</Strong> · died{' '}
        {fmtDate(i.dateOfDeath)}
      </Line>
      <Line>
        Requirements {done} of {keys.length}
        {blocked.length > 0 && (
          <span className="text-danger"> · outstanding: {blocked.join(', ')}</span>
        )}
      </Line>
    </>
  )
}

function IntermentDetail({ task }: { task: ApprovalTask }) {
  const i = intermentOf(task.entityId)
  const lot = lotOf(i?.lotId)
  if (!i) return null

  const keys = requirementKeys(i.type)
  const blocking = new Set(blockingRequirements(i))

  return (
    <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr]">
      {lot && (
        <div className="flex flex-col items-start gap-2">
          <LotThumb lot={lot} size={104} />
          <StatusChip status={lot.status} />
        </div>
      )}

      <Panel title="The deceased">
        <Row label="Name" value={deceasedFullName(i)} />
        <Row label="Born" value={i.dateOfBirth ? fmtDate(i.dateOfBirth) : 'Not recorded'} />
        <Row label="Died" value={fmtDate(i.dateOfDeath)} />
        <Row label="Type" value={INTERMENT_TYPE_LABEL[i.type]} />
      </Panel>

      <Panel title="The grave & the slot">
        <Row label="Lot" value={<span className="font-mono">{lotCodeOf(lot)}</span>} />
        <Row
          label="Capacity"
          value={lot ? `${lot.intermentCount} of ${lot.capacity}` : '—'}
        />
        <Row label="Date" value={fmtDate(i.scheduledDate)} />
        <Row label="Slot" value={SLOT_LABEL[i.slot]} />
        <Row
          label="Opening & closing"
          value={formatPeso(i.openingClosingFeeCentavos as Centavos)}
        />
      </Panel>

      <Panel title="Requirements" className="md:col-span-3">
        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {keys.map((k) => {
            const ok = i.requirements[k]
            const blocks = blocking.has(REQUIREMENT_LABEL[k])
            return (
              <li key={k} className="flex items-center gap-2 text-[12.5px]">
                <Icon
                  icon={ok ? IconCheck : IconMissing}
                  size={14}
                  className={ok ? 'text-green' : blocks ? 'text-danger' : 'text-muted'}
                />
                <span className={ok ? 'text-ink' : 'text-muted'}>
                  {REQUIREMENT_LABEL[k]}
                </span>
                {!ok && blocks && (
                  <span className="text-[11px] uppercase tracking-[0.06em] text-danger">
                    blocks completion
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        {i.notes && (
          <p className="mt-2.5 border-t border-line pt-2 text-[12.5px] leading-relaxed text-muted">
            {i.notes}
          </p>
        )}
      </Panel>
    </div>
  )
}

// ── payout runs ──────────────────────────────────────────────────────

function usePayoutRows(runId: string) {
  const version = useDataset((s) => s.version)
  return useMemo(() => {
    void version
    const run = runOf(runId)
    if (!run) return []
    const entries = useAgents.getState().runEntries(run.id)
    const byAgent = new Map<string, { agentId: string; count: number; centavos: number }>()
    for (const e of entries) {
      const key = e.agentId as string
      const row = byAgent.get(key) ?? { agentId: key, count: 0, centavos: 0 }
      row.count += 1
      row.centavos += e.amountCentavos
      byAgent.set(key, row)
    }
    return [...byAgent.values()].sort((a, b) => b.centavos - a.centavos)
  }, [runId, version])
}

function PayoutSummary({ task }: { task: ApprovalTask }) {
  const run = runOf(task.entityId)
  const rows = usePayoutRows(task.entityId)
  if (!run) return <Missing what="This payout run is no longer on file." />

  return (
    <>
      <Line>
        <Strong>{run.entryCount}</Strong> entries · <Strong>{rows.length}</Strong> agents ·{' '}
        <Strong>{formatPeso(run.totalCentavos)}</Strong>
      </Line>
      <Line>Release {fmtDate(run.releaseDate)}</Line>
      <Line>
        Closed by {userName(task.requestedByUserId)} · once approved it cannot be reopened
        from here.
      </Line>
    </>
  )
}

function PayoutDetail({ task }: { task: ApprovalTask }) {
  const run = runOf(task.entityId)
  const rows = usePayoutRows(task.entityId)
  if (!run) return null

  return (
    <div className="grid gap-3 md:grid-cols-[300px_1fr]">
      <Panel title="The run">
        <Row label="Period" value={`${fmtDate(run.periodStart)} → ${fmtDate(run.periodEnd)}`} />
        <Row label="Release" value={fmtDate(run.releaseDate)} />
        <Row label="Entries" value={String(run.entryCount)} />
        <Row label="Agents" value={String(rows.length)} />
        <div className="mt-2 border-t border-line pt-2">
          <Row label="Total" value={formatPeso(run.totalCentavos)} strong />
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          Windows run Saturday → Thursday and release on Friday. Sunday is excluded
          from the earning window.
        </p>
      </Panel>

      <Panel title="Per agent">
        <div className="max-h-[260px] overflow-y-auto">
          <table className="w-full">
            <tbody>
              {rows.map((r) => (
                <tr key={r.agentId} className="border-b border-line-soft last:border-0">
                  <td className="py-1.5 text-[12.5px] text-ink">
                    {agentDisplayName(r.agentId)}
                  </td>
                  <td className="py-1.5 text-right text-[12px] tabular text-muted">
                    {r.count} {r.count === 1 ? 'entry' : 'entries'}
                  </td>
                  <td className="py-1.5 text-right text-[12.5px] tabular font-medium text-ink">
                    {formatPeso(r.centavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

// ── ownership transfers ──────────────────────────────────────────────

function TransferSummary({ task }: { task: ApprovalTask }) {
  const t = transferOf(task.entityId)
  if (!t) return <Missing what="This transfer is no longer on file." />
  return (
    <>
      <Line>
        <Strong>{clientName(t.fromClientId) ?? 'Current owner'}</Strong> →{' '}
        <Strong>{clientName(t.toClientId) ?? 'New owner'}</Strong>
      </Line>
      <Line>
        {contractOf(t.contractId)?.contractNo ?? 'Contract'} · fee{' '}
        {formatPeso(t.feeCentavos)}
      </Line>
      <Line>{t.reason}</Line>
    </>
  )
}

function TransferDetail({ task }: { task: ApprovalTask }) {
  const t = transferOf(task.entityId)
  const lot = lotOf(t?.lotId)
  if (!t) return null
  const contract = contractOf(t.contractId)

  return (
    <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr]">
      {lot && (
        <div className="flex flex-col items-start gap-2">
          <LotThumb lot={lot} size={104} />
          <StatusChip status={lot.status} />
        </div>
      )}
      <Panel title="Ownership">
        <Row label="From" value={clientName(t.fromClientId) ?? '—'} />
        <Row label="To" value={clientName(t.toClientId) ?? '—'} />
        <Row label="Lot" value={<span className="font-mono">{lotCodeOf(lot)}</span>} />
        <Row label="Contract" value={contract?.contractNo ?? '—'} />
      </Panel>
      <Panel title="The request">
        <Row label="Requested by" value={userName(t.requestedByUserId)} />
        <Row label="Requested" value={fmtDateTime(t.requestedAt)} />
        <Row label="Transfer fee" value={formatPeso(t.feeCentavos)} strong />
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted">
          Heard once, never confirmed.
          <AssumedChip why={ASSUMPTIONS.ownershipTransferFee.why} />
        </p>
        <p className="mt-2 border-t border-line pt-2 text-[12.5px] leading-relaxed text-muted">
          {t.reason}
        </p>
      </Panel>
    </div>
  )
}

/** Guard so a task pointing at a deleted entity never renders a blank card. */
export function taskIsResolvable(task: ApprovalTask): boolean {
  switch (task.kind) {
    case 'hold':
      return holdOf(task.entityId) !== null
    case 'contract':
    case 'discount':
      return contractOf(task.entityId) !== null
    case 'interment':
      return intermentOf(task.entityId) !== null
    case 'payout_run':
      return runOf(task.entityId) !== null
    case 'ownership_transfer':
      return transferOf(task.entityId) !== null
    default:
      return true
  }
}
