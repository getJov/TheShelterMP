import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ASSUMPTIONS,
  HOLD_DURATION_DAYS,
  STATUS_APPEARANCE,
  type LotId,
} from '@/domain'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { StatusChip } from '@/components/ui-brand/StatusDot'
import { Icon } from '@/components/ui-brand/Icon'
import { IconWarning } from '@/components/ui-brand/icons'
import { useDataset, indexes } from '@/stores/dataset'
import { useSales } from '@/stores/sales'
import { useCurrentUserOrNull } from '@/lib/permissions'
import { resolvePrice } from '@/lib/price-resolver'
import { addDays, fmtDate } from '@/lib/dates'
import { TODAY } from '@/mock'
import { ClientCombobox, type BuyerValue } from './ClientCombobox'
import { LotCombobox } from './LotCombobox'
import { PriceCard } from './PriceCard'
import { lotCodeOf } from '../lib'

/**
 * Opened from the lot drawer or the map. On submit it creates the hold,
 * raises an approval task and notifies the manager OF THAT LOT'S LOCATION —
 * the client's explicit requirement.
 */
export function RequestHoldDialog({
  lotId: presetLotId = null,
  open,
  onOpenChange,
}: {
  /** Preset when launched from the lot drawer; null shows a lot picker. */
  lotId?: LotId | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const version = useDataset((s) => s.version)
  const prices = useDataset((s) => s.data.prices)
  const user = useCurrentUserOrNull()
  const requestHold = useSales((s) => s.requestHold)

  const [buyer, setBuyer] = useState<BuyerValue>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [pickedLotId, setPickedLotId] = useState<LotId | null>(presetLotId)

  useEffect(() => {
    if (open) setPickedLotId(presetLotId)
  }, [open, presetLotId])

  const lotId = presetLotId ?? pickedLotId

  const lot = useMemo(() => {
    void version
    return lotId ? (indexes().lotsById.get(lotId) ?? null) : null
  }, [lotId, version])

  const tier = lot ? indexes().tiersById.get(lot.tierId) : null
  const resolved = useMemo(
    () =>
      lot
        ? resolvePrice(prices, lot.tierId, 'pre_need', 'spot_cash', TODAY)
        : null,
    [lot, prices, version],
  )

  const blocked = lot && lot.status !== 'available'

  function reset() {
    setBuyer(null)
    setNote('')
    setBusy(false)
    setPickedLotId(presetLotId)
  }

  function submit() {
    if (!lot || !user || !buyer) return
    setBusy(true)
    const result = requestHold({
      lotId: lot.id,
      clientId: buyer.kind === 'client' ? buyer.clientId : null,
      prospectName: buyer.kind === 'prospect' ? buyer.name : null,
      note: note.trim() || null,
      actor: user,
    })
    setBusy(false)

    if ('error' in result) {
      toast.error(result.error)
      return
    }
    const names = result.managers.map((m) => m.fullName)
    toast.success('Hold requested.', {
      description:
        names.length > 0
          ? `${names.join(' and ')} ${names.length > 1 ? 'have' : 'has'} been notified.`
          : 'An approver has been notified.',
    })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[22px]">Request a hold</DialogTitle>
          <DialogDescription>
            A hold reserves the lot while the family decides. A manager approves it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!presetLotId && (
            <div className="space-y-1.5">
              <Label htmlFor="hold-lot" className="text-[12.5px] text-muted">
                Lot
              </Label>
              <LotCombobox id="hold-lot" value={pickedLotId} onChange={setPickedLotId} />
            </div>
          )}
        </div>

        {!lot ? (
          <p className="text-[13px] text-muted">
            Pick an available lot to continue.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-[var(--radius-card)] border border-line bg-surface-2 px-3.5 py-3">
              <div className="min-w-0">
                <p className="font-mono text-[14px] text-ink">{lotCodeOf(lot)}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {tier?.name ?? '—'} · {lot.areaSqm.toFixed(1)} sqm · capacity{' '}
                  {lot.capacity}
                </p>
              </div>
              <StatusChip status={lot.status} />
            </div>

            {blocked ? (
              <div className="flex items-start gap-2 rounded-[var(--radius-card)] border border-danger/40 bg-danger/8 p-3 text-[12.5px] text-ink">
                <Icon icon={IconWarning} size={16} className="mt-0.5 text-danger" />
                <span>
                  This lot is{' '}
                  <span className="font-medium">
                    {STATUS_APPEARANCE[lot.status].label.toLowerCase()}
                  </span>
                  . {STATUS_APPEARANCE[lot.status].description}. Only available lots can
                  be held.
                </span>
              </div>
            ) : (
              <>
                {resolved && (
                  <PriceCard
                    resolved={resolved}
                    tierName={tier?.name ?? '—'}
                    needType="pre_need"
                    paymentMode="spot_cash"
                    asOf={TODAY}
                  />
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="hold-buyer" className="text-[12.5px] text-muted">
                    Client or prospect
                  </Label>
                  <ClientCombobox id="hold-buyer" value={buyer} onChange={setBuyer} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="hold-note" className="text-[12.5px] text-muted">
                    Note <span className="text-muted/70">(optional)</span>
                  </Label>
                  <Textarea
                    id="hold-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Family is deciding between this and the next row."
                  />
                </div>

                <p className="flex items-center gap-1.5 text-[12px] text-muted">
                  Hold expires in {HOLD_DURATION_DAYS} days —{' '}
                  {fmtDate(addDays(TODAY, HOLD_DURATION_DAYS))}
                  <AssumedChip why={ASSUMPTIONS.holdDurationDays.why} />
                </p>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!lot || !!blocked || !buyer || busy}>
            Request hold
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
