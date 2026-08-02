import { useState } from 'react'
import { toast } from 'sonner'
import type { ISODate, Tier, TierId } from '@/domain'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui-brand/Icon'
import { IconAdd, IconInfo } from '@/components/ui-brand/icons'
import { SectionHeading } from '@/components/ui-brand/SectionHeading'
import { useCan, useCurrentUser } from '@/lib/permissions'
import { usePricing } from '@/stores/pricing'
import { TierCard } from './TierCard'
import { TierDialog } from './TierDialog'

export function LotTiersTab({
  asOf,
  onViewPrices,
}: {
  asOf: ISODate
  onViewPrices: () => void
}) {
  const user = useCurrentUser()
  const canManage = useCan('tier:manage')
  const catalogVersion = usePricing((s) => s.catalogVersion)
  const tiers = usePricing((s) => s.tiers)()
  const reorderTiers = usePricing((s) => s.reorderTiers)
  void catalogVersion

  const [editing, setEditing] = useState<Tier | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dragId, setDragId] = useState<TierId | null>(null)

  function drop(targetId: TierId) {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      return
    }
    const ids = tiers.map((t) => t.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0]!)
    reorderTiers(ids, user.id)
    setDragId(null)
    toast.success('Order updated', {
      description: 'This drives the legend and price-book order everywhere.',
    })
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Products & map appearance"
        title="Lot types"
        action={
          canManage ? (
            <Button
              className="gap-1.5"
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Icon icon={IconAdd} size={15} />
              New lot type
            </Button>
          ) : undefined
        }
      />

      <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-line bg-surface-2 px-3 py-2 text-caption leading-relaxed text-muted">
        <Icon icon={IconInfo} size={15} className="mt-0.5 shrink-0" />
        <span>
          The tier drives the polygon fill; lot status draws a lettered badge on
          top. The preview shows that exact pair — click a badge under any
          preview to check it against the fill{canManage ? ', and drag a card to reorder the legend' : ''}.
        </span>
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {tiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            asOf={asOf}
            canManage={canManage}
            onEdit={() => {
              setEditing(tier)
              setDialogOpen(true)
            }}
            onViewPrices={onViewPrices}
            dragProps={
              canManage
                ? {
                    onDragStart: () => setDragId(tier.id),
                    onDragOver: (e) => e.preventDefault(),
                    onDrop: () => drop(tier.id),
                    dragging: dragId === tier.id,
                  }
                : undefined
            }
          />
        ))}
      </div>

      {canManage && (
        <TierDialog open={dialogOpen} onOpenChange={setDialogOpen} tier={editing} />
      )}
    </div>
  )
}
