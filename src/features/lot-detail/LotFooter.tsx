import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconContract,
  IconHold,
  IconPayment,
  IconScheduleBurial,
} from '@/components/ui-brand/icons'
import { useCan, useCurrentUserOrNull } from '@/lib/permissions'
import { useSales } from '@/stores/sales'
import { ContractBuilder } from '@/features/sales/components/ContractBuilder'
import { PostPaymentDialog } from '@/features/sales/components/PostPaymentDialog'
import { RequestHoldDialog } from '@/features/sales/components/RequestHoldDialog'
import { ScheduleIntermentDialog } from '@/features/burials/ScheduleIntermentDialog'
import type { LotModel } from './model'

/**
 * At most TWO primary actions, permission-gated and status-contextual. A wall
 * of buttons reads as an unfinished admin panel; when the user holds none of
 * the permissions the bar is not rendered at all.
 */
export function LotFooter({ model }: { model: LotModel }) {
  const user = useCurrentUserOrNull()
  const canHold = useCan('hold:request')
  const canApproveHold = useCan('hold:approve')
  const canCreate = useCan('contract:create')
  const canPost = useCan('payment:post')
  const canSchedule = useCan('interment:schedule')
  const decideHold = useSales((s) => s.decideHold)
  const releaseHold = useSales((s) => s.releaseHold)

  const [holdOpen, setHoldOpen] = useState(false)
  const [contractOpen, setContractOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [burialOpen, setBurialOpen] = useState(false)

  const status = model.lot.status
  const contract = model.contract
  const hasBalance = (model.balance?.outstandingCentavos ?? 0) > 0
  const payable = Boolean(contract) && contract!.status === 'active' && hasBalance
  const schedulable = model.capacityRemaining > 0

  const actions: React.ReactNode[] = []

  if (status === 'available') {
    // The primary Request hold sits under the price; the footer carries the
    // step beyond it so the two never duplicate each other.
    if (canCreate)
      actions.push(
        <Button key="create" className="flex-1 gap-1.5" onClick={() => setContractOpen(true)}>
          <Icon icon={IconContract} size={15} />
          Create contract
        </Button>,
      )
    else if (canHold)
      actions.push(
        <Button key="hold" className="flex-1 gap-1.5" onClick={() => setHoldOpen(true)}>
          <Icon icon={IconHold} size={15} />
          Request hold
        </Button>,
      )
  }

  if (status === 'held' && model.hold) {
    const hold = model.hold
    if (hold.status === 'pending' && canApproveHold) {
      actions.push(
        <Button
          key="approve"
          className="flex-1"
          onClick={() => {
            if (!user) return
            decideHold(hold.id, 'approved', user)
            toast.success(`Hold on ${model.code} approved.`)
          }}
        >
          Approve hold
        </Button>,
        <Button
          key="reject"
          variant="outline"
          className="flex-1 text-danger hover:text-danger"
          onClick={() => {
            if (!user) return
            decideHold(hold.id, 'rejected', user)
            toast.success(`Hold on ${model.code} rejected.`)
          }}
        >
          Reject
        </Button>,
      )
    } else {
      if (canCreate)
        actions.push(
          <Button
            key="convert"
            className="flex-1 gap-1.5"
            onClick={() => setContractOpen(true)}
          >
            <Icon icon={IconContract} size={15} />
            Convert to sale
          </Button>,
        )
      if (canApproveHold)
        actions.push(
          <Button
            key="release"
            variant="outline"
            className="flex-1"
            onClick={() => {
              if (!user) return
              releaseHold(hold.id, user, 'Released from the lot drawer')
              toast.success(`Hold on ${model.code} released — the lot is available again.`)
            }}
          >
            Release hold
          </Button>,
        )
    }
  }

  if (status === 'sold' || status === 'occupied') {
    if (canPost && payable)
      actions.push(
        <Button key="pay" className="flex-1 gap-1.5" onClick={() => setPayOpen(true)}>
          <Icon icon={IconPayment} size={15} />
          Post payment
        </Button>,
      )
    if (canSchedule && schedulable)
      actions.push(
        <Button
          key="burial"
          variant={actions.length ? 'outline' : 'default'}
          className="flex-1 gap-1.5"
          onClick={() => setBurialOpen(true)}
        >
          <Icon icon={IconScheduleBurial} size={15} />
          Schedule burial
        </Button>,
      )
  }

  if (actions.length === 0) return null

  return (
    <>
      <div className="shrink-0 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">
        <div className="flex gap-2">{actions.slice(0, 2)}</div>
      </div>

      <RequestHoldDialog lotId={model.lot.id} open={holdOpen} onOpenChange={setHoldOpen} />
      <ContractBuilder
        lotId={model.lot.id}
        open={contractOpen}
        onOpenChange={setContractOpen}
      />
      <PostPaymentDialog contract={contract} open={payOpen} onOpenChange={setPayOpen} />
      <ScheduleIntermentDialog
        open={burialOpen}
        onOpenChange={setBurialOpen}
        locationId={model.lot.locationId}
        presetLotId={model.lot.id}
      />
    </>
  )
}
