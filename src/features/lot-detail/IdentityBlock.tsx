import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ASSUMPTIONS,
  INTERMENT_TYPE_LABEL,
  NEED_TYPE_LABEL,
  clientFullName,
  deceasedFullName,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconClock,
  IconHold,
  IconInterment,
  IconPhone,
  IconTransfer,
  IconUnavailable,
  IconUser,
} from '@/components/ui-brand/icons'
import { useCan, useCurrentUserOrNull } from '@/lib/permissions'
import { useSales } from '@/stores/sales'
import { fmtDate } from '@/lib/dates'
import { RequestHoldDialog } from '@/features/sales/components/RequestHoldDialog'
import { TransferOwnershipDialog } from '@/features/sales/components/TransferOwnershipDialog'
import { cn } from '@/lib/utils'
import type { LotModel } from './model'
import { Caption, EASE, Panel, maskPhone } from './bits'
import type { ResolvedPrice } from '@/lib/price-resolver'

/**
 * The first thing anyone reads. It is deliberately DIFFERENT per status —
 * an available lot is a price, a sold lot is a person, an occupied lot is a
 * name and a date. None of them falls through to a generic layout.
 */
export function IdentityBlock({ model }: { model: LotModel }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: EASE }}
      className="px-5 pt-4"
    >
      {model.lot.status === 'available' && <AvailableIdentity model={model} />}
      {model.lot.status === 'held' && <HeldIdentity model={model} />}
      {model.lot.status === 'sold' && <OwnerIdentity model={model} />}
      {model.lot.status === 'occupied' && <OccupiedIdentity model={model} />}
      {model.lot.status === 'not_for_sale' && <NotForSaleIdentity model={model} />}
    </motion.div>
  )
}

// ── available ────────────────────────────────────────────────────────
function PriceColumn({
  label,
  resolved,
}: {
  label: string
  resolved: ResolvedPrice
}) {
  if (resolved.amountCentavos === null) {
    return (
      <div className="min-w-0">
        <Caption>{label}</Caption>
        <div className="mt-0.5 h-[18px]" aria-hidden />
        <p className="text-body text-muted">Contact for pricing</p>
      </div>
    )
  }
  const promo = resolved.isPromo && resolved.listEntry?.amountCentavos != null
  return (
    <div className="min-w-0">
      <Caption>{label}</Caption>
      {/* Reserved whether or not a promo is live, so the two headline
          figures sit on the same baseline. */}
      <p className="mt-0.5 flex h-[18px] items-center gap-1.5">
        {promo && (
          <>
            <MoneyText
              centavos={resolved.listEntry!.amountCentavos}
              className="text-caption text-muted line-through"
            />
            <span className="rounded border border-gold/45 bg-gold/12 px-1.5 py-px text-micro font-semibold uppercase tracking-[0.06em] text-gold-deep dark:text-gold">
              Promo
            </span>
          </>
        )}
      </p>
      <MoneyText
        centavos={resolved.amountCentavos}
        className={cn(
          'mt-0.5 block font-display font-semibold leading-none text-ink',
          resolved.isPromo ? 'text-page-title text-green' : 'text-page-title',
        )}
      />
    </div>
  )
}

function AvailableIdentity({ model }: { model: LotModel }) {
  const canHold = useCan('hold:request')
  const [holdOpen, setHoldOpen] = useState(false)

  const promo = model.preNeed.isPromo ? model.preNeed : model.atNeed.isPromo ? model.atNeed : null

  return (
    <Panel tone={promo ? 'gold' : 'plain'} className="px-4 py-3.5">
      <div className="grid grid-cols-1 gap-4">
        <PriceColumn label={NEED_TYPE_LABEL.pre_need} resolved={model.preNeed} />
        <PriceColumn label={NEED_TYPE_LABEL.at_need} resolved={model.atNeed} />
      </div>

      {canHold && (
        <Button className="mt-3 w-full gap-1.5" onClick={() => setHoldOpen(true)}>
          <Icon icon={IconHold} size={15} />
          Request hold
        </Button>
      )}

      <RequestHoldDialog lotId={model.lot.id} open={holdOpen} onOpenChange={setHoldOpen} />
    </Panel>
  )
}

// ── held ─────────────────────────────────────────────────────────────
function HeldIdentity({ model }: { model: LotModel }) {
  const user = useCurrentUserOrNull()
  const canApprove = useCan('hold:approve')
  const decideHold = useSales((s) => s.decideHold)
  const hold = model.hold

  if (!hold) {
    return (
      <Panel>
        <p className="text-body text-muted">
          This lot is marked held but the hold record is no longer on file.
        </p>
      </Panel>
    )
  }

  const pending = hold.status === 'pending'
  const expired = model.holdDaysLeft < 0

  const decide = (decision: 'approved' | 'rejected') => {
    if (!user) return
    decideHold(hold.id, decision, user)
    toast.success(
      decision === 'approved'
        ? `Hold on ${model.code} approved.`
        : `Hold on ${model.code} rejected — the lot is available again.`,
    )
  }

  return (
    <div className="space-y-2.5">
      <Panel>
        <Caption>Held for</Caption>
        <p className="mt-0.5 font-display text-section-title font-semibold leading-tight text-ink">
          {model.holdFor}
        </p>
        <div className="mt-2 space-y-0.5 text-body text-muted">
          <p>
            Requested by{' '}
            <span className="text-ink">{model.holdRequester?.fullName ?? 'staff'}</span> on{' '}
            {fmtDate(hold.requestedAt)}
          </p>
          <p className="flex items-center gap-1.5">
            <Icon icon={IconClock} size={14} />
            {expired ? (
              <span className="text-danger">Expired {fmtDate(hold.expiresAt)}</span>
            ) : (
              <span>
                Expires in{' '}
                <span className="font-medium text-ink">
                  {model.holdDaysLeft} {model.holdDaysLeft === 1 ? 'day' : 'days'}
                </span>{' '}
                · {fmtDate(hold.expiresAt)}
              </span>
            )}
            <AssumedChip why={ASSUMPTIONS.holdDurationDays.why} />
          </p>
        </div>
      </Panel>

      {pending && (
        <Panel tone="gold" className="py-2.5">
          <div className="flex items-center gap-2.5">
            <Icon icon={IconClock} size={16} className="text-gold-deep dark:text-gold" />
            <span className="min-w-0 flex-1 text-body text-ink">
              Awaiting approval
            </span>
            {canApprove && (
              <span className="flex shrink-0 gap-1.5">
                <Button size="sm" onClick={() => decide('approved')}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:text-danger"
                  onClick={() => decide('rejected')}
                >
                  Reject
                </Button>
              </span>
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}

// ── sold / occupied ──────────────────────────────────────────────────
function OwnerCard({ model }: { model: LotModel }) {
  const canTransfer = useCan('transfer:request')
  const [transferOpen, setTransferOpen] = useState(false)
  const client = model.client

  if (!client) {
    return (
      <Panel>
        <p className="text-body text-muted">
          No client record is attached to this lot's contract.
        </p>
      </Panel>
    )
  }

  return (
    <Panel>
      <div className="flex items-start gap-2.5">
        <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-muted">
          <Icon icon={IconUser} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <Caption>Owner</Caption>
          <p className="mt-0.5 break-words font-display text-section-title font-semibold leading-tight text-ink">
            {clientFullName(client)}
          </p>
          <p className="mt-1 break-words text-caption text-muted">
            <span className="font-mono">{client.clientRef}</span> · {client.city},{' '}
            {client.province}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
            <Icon icon={IconPhone} size={13} />
            <span className="tabular">{maskPhone(client.phone)}</span>
          </p>
          {model.coOwner && (
            <p className="mt-1.5 border-t border-line-soft pt-1.5 text-caption text-muted">
              Co-owner <span className="text-ink">{clientFullName(model.coOwner)}</span>
            </p>
          )}
        </div>
      </div>

      {canTransfer && model.contract && (
        <>
          <Separator className="my-2.5" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTransferOpen(true)}
            className="gap-1.5 px-0 text-control font-medium text-gold-deep hover:underline dark:text-gold"
          >
            <Icon icon={IconTransfer} size={14} />
            Transfer ownership
          </Button>
          <TransferOwnershipDialog
            contract={model.contract}
            open={transferOpen}
            onOpenChange={setTransferOpen}
          />
        </>
      )}
    </Panel>
  )
}

function OwnerIdentity({ model }: { model: LotModel }) {
  return <OwnerCard model={model} />
}

function OccupiedIdentity({ model }: { model: LotModel }) {
  return (
    <div className="space-y-2.5">
      <OwnerCard model={model} />
      <Panel className="py-2.5">
        <Caption>Interred here</Caption>
        <ul className="mt-1.5 space-y-2">
          {model.interments.map((i) => (
            <li key={i.id} className="flex items-start gap-2.5">
              <Icon icon={IconInterment} size={15} className="mt-1 shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="block break-words font-display text-small-title font-semibold text-ink">
                  {deceasedFullName(i)}
                </span>
                <span className="block text-caption text-muted">
                  {i.dateOfBirth ? fmtDate(i.dateOfBirth) : '—'} – {fmtDate(i.dateOfDeath)}
                  {' · '}
                  {INTERMENT_TYPE_LABEL[i.type]} · interred {fmtDate(i.scheduledDate)}
                </span>
              </span>
            </li>
          ))}
          {model.interments.length === 0 && (
            <li className="text-body text-muted">
              No interment record is on file for this lot.
            </li>
          )}
        </ul>
      </Panel>
    </div>
  )
}

// ── not for sale ─────────────────────────────────────────────────────
function NotForSaleIdentity({ model }: { model: LotModel }) {
  return (
    <Panel className="flex items-start gap-2.5">
      <Icon icon={IconUnavailable} size={17} className="mt-0.5 shrink-0 text-muted" />
      <p className="text-body leading-relaxed text-muted">
        {model.lot.notForSaleReason ??
          'This lot is not for sale. No reason was recorded.'}
      </p>
    </Panel>
  )
}
