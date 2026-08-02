import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ASSUMPTIONS,
  HOLD_DURATION_DAYS,
  STATUS_APPEARANCE,
  type ClientId,
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
import { ClientCombobox } from './ClientCombobox'
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

  const [buyer, setBuyer] = useState<ClientId | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [pickedLotId, setPickedLotId] = useState<LotId | null>(presetLotId)
  const [submitError, setSubmitError] = useState<string | null>(null)

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
    () => {
      void version
      return lot
        ? resolvePrice(prices, lot.tierId, 'pre_need', 'spot_cash', TODAY)
        : null
    },
    [lot, prices, version],
  )

  const blocked = lot && lot.status !== 'available'

  function reset() {
    setBuyer(null)
    setNote('')
    setBusy(false)
    setPickedLotId(presetLotId)
    setSubmitError(null)
  }

  function submit() {
    if (!lot || !user || !buyer) return
    setBusy(true)
    const result = requestHold({
      lotId: lot.id,
      clientId: buyer,
      prospectName: null,
      note: note.trim() || null,
      actor: user,
    })
    setBusy(false)

    if ('error' in result) {
      setSubmitError(result.error)
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
      <DialogContent className="max-h-[calc(100dvh-1rem)] !w-[calc(100%-1rem)] !max-w-[520px] grid-rows-[auto_minmax(0,1fr)_auto] !gap-0 !overflow-hidden !p-0 sm:max-h-[calc(100dvh-2rem)] [&>[data-slot=dialog-close]]:right-2 [&>[data-slot=dialog-close]]:top-2 [&>[data-slot=dialog-close]]:grid [&>[data-slot=dialog-close]]:size-11 [&>[data-slot=dialog-close]]:place-items-center">
        <DialogHeader className="shrink-0 px-4 pb-3 pt-4 pr-14 text-left sm:px-6 sm:pt-6 sm:pr-16">
          <DialogTitle className="font-display text-section-title">Request a hold</DialogTitle>
          <DialogDescription>
            A hold reserves the lot while the family decides. A manager approves it.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain border-t border-line-soft px-4 py-4 scroll-pb-24 sm:px-6">
          <div className="space-y-4">
            {!presetLotId && (
              <div className="space-y-1.5">
                <Label htmlFor="hold-lot" className="text-caption text-muted">
                  Lot
                </Label>
                <LotCombobox
                  id="hold-lot"
                  value={pickedLotId}
                  onChange={(id) => {
                    setPickedLotId(id)
                    setSubmitError(null)
                  }}
                  required
                  describedBy="hold-lot-help"
                />
                <p id="hold-lot-help" className="text-caption text-muted">
                  Only available or held lots in the active location are listed.
                </p>
              </div>
            )}

            {!lot ? (
              <p className="text-body text-muted" role="status">
                Pick an available lot to continue.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-body text-ink">
                      {lotCodeOf(lot)}
                    </p>
                    <p className="mt-0.5 break-words text-caption text-muted">
                      {tier?.name ?? '—'} · {lot.areaSqm.toFixed(1)} sqm · capacity{' '}
                      {lot.capacity}
                    </p>
                  </div>
                  <StatusChip status={lot.status} />
                </div>

                {blocked ? (
                  <div
                    className="flex items-start gap-2 rounded-[var(--radius-card)] border border-danger/40 bg-danger/8 p-3 text-body text-ink"
                    role="alert"
                  >
                    <Icon
                      icon={IconWarning}
                      size={16}
                      className="mt-0.5 shrink-0 text-danger"
                    />
                    <span className="min-w-0 break-words">
                      This lot is{' '}
                      <span className="font-medium">
                        {STATUS_APPEARANCE[lot.status].label.toLowerCase()}
                      </span>
                      . {STATUS_APPEARANCE[lot.status].description}. Only available lots
                      can be held.
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

                    <div
                      className="space-y-1.5"
                      role="group"
                      aria-describedby={!buyer ? 'hold-buyer-help' : undefined}
                    >
                      <Label htmlFor="hold-buyer" className="text-caption text-muted">
                        Buyer
                      </Label>
                      <ClientCombobox
                        id="hold-buyer"
                        value={buyer}
                        onChange={(id) => {
                          setBuyer(id)
                          setSubmitError(null)
                        }}
                        required
                        describedBy="hold-buyer-help"
                      />
                      <p id="hold-buyer-help" className="text-caption text-muted">
                        Select the family member requesting the hold.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="hold-note" className="text-caption text-muted">
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

                    <p className="flex flex-wrap items-center gap-1.5 text-caption text-muted">
                      <span>
                        Hold expires in {HOLD_DURATION_DAYS} days —{' '}
                        {fmtDate(addDays(TODAY, HOLD_DURATION_DAYS))}
                      </span>
                      <AssumedChip why={ASSUMPTIONS.holdDurationDays.why} />
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {submitError && (
          <p role="alert" className="mx-4 rounded-md border border-danger/40 bg-danger/8 p-3 text-body text-danger sm:mx-6">
            {submitError}
          </p>
        )}

        <DialogFooter className="shrink-0 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <Button
            variant="ghost"
            className="min-h-11 w-full sm:min-h-9 sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="min-h-11 w-full sm:min-h-9 sm:w-auto"
            onClick={submit}
            disabled={!lot || !!blocked || !buyer || busy}
          >
            Request hold
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
