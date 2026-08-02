import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { STATUS_APPEARANCE } from '@/domain'
import { TODAY } from '@/mock'
import { useDataset } from '@/stores/dataset'
import { resolvePrice } from '@/lib/price-resolver'
import { formatPeso } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { StatusDot } from '@/components/ui-brand/StatusDot'
import type { MapLot } from './use-map-data'
import { useChromeInset } from './use-chrome-inset'

const HOVER_DELAY_MS = 120
/** Gap between the cursor and the tooltip, on whichever side it lands. */
const CURSOR_GAP = 12
/** Keep this much clear of the map's usable edges. */
const EDGE_MARGIN = 8

export interface TooltipTarget {
  lot: MapLot
  x: number
  y: number
}

/**
 * Availability-only viewers get the lot code, the tier and either a price or
 * the single word "Unavailable". No owner, no money, no dates — not even in
 * a tooltip that flashes for 200 ms.
 */
export function LotTooltip({ target }: { target: TooltipTarget | null }) {
  const [shown, setShown] = useState<TooltipTarget | null>(null)
  const data = useDataset((s) => s.data)
  const idx = useDataset((s) => s.idx)
  const ref = useRef<HTMLDivElement>(null)
  const chromeInset = useChromeInset()
  const [pos, setPos] = useState({ left: 0, top: 0 })

  /**
   * Flip rather than overflow.
   *
   * The tooltip used to sit at cursor + 12 unconditionally, so hovering a lot
   * near the right edge slid it underneath the dashboard panel or the lot
   * drawer, where it was clipped and unreadable. It now measures itself and
   * flips to the other side of the cursor when it would cross the map's
   * usable edge — the right edge being wherever the open panel begins.
   */
  useLayoutEffect(() => {
    if (!shown) return
    const el = ref.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return

    const w = el.offsetWidth
    const h = el.offsetHeight
    const usableRight = parent.clientWidth - chromeInset - EDGE_MARGIN
    const usableBottom = parent.clientHeight - EDGE_MARGIN

    let left = shown.x + CURSOR_GAP
    if (left + w > usableRight) left = shown.x - CURSOR_GAP - w
    left = Math.max(EDGE_MARGIN, Math.min(left, usableRight - w))

    let top = shown.y + CURSOR_GAP
    if (top + h > usableBottom) top = shown.y - CURSOR_GAP - h
    top = Math.max(EDGE_MARGIN, Math.min(top, usableBottom - h))

    setPos({ left, top })
  }, [shown, chromeInset])

  useEffect(() => {
    if (!target) {
      setShown(null)
      return
    }
    if (shown && shown.lot.lot.id === target.lot.lot.id) {
      setShown(target)
      return
    }
    const t = window.setTimeout(() => setShown(target), HOVER_DELAY_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const lines = useMemo(() => {
    if (!shown) return null
    const m = shown.lot
    const lot = m.lot
    const restricted = m.visibility !== 'full'

    const price = () => {
      const p = resolvePrice(data.prices, lot.tierId, 'pre_need', 'spot_cash', TODAY)
      return p.amountCentavos == null
        ? 'Contact for pricing'
        : `${formatPeso(p.amountCentavos)} · spot cash`
    }

    if (restricted) {
      return lot.status === 'available' ? price() : 'Unavailable'
    }

    switch (lot.status) {
      case 'available':
        return price()
      case 'held': {
        const hold = lot.activeHoldId ? idx.holdsById.get(lot.activeHoldId) : undefined
        const who =
          hold?.prospectName ??
          (hold?.clientId
            ? (() => {
                const c = idx.clientsById.get(hold.clientId!)
                return c ? `${c.firstName} ${c.lastName}` : 'a family'
              })()
            : 'a family')
        return hold
          ? `Held for ${who}, expires ${fmtDate(hold.expiresAt)}`
          : 'On hold'
      }
      case 'sold':
        return m.ownerName ? `Owner: ${m.ownerName}` : 'Under contract'
      case 'occupied':
        return `${lot.intermentCount} of ${lot.capacity} interments`
      case 'not_for_sale':
        return lot.notForSaleReason ?? 'Not for sale'
    }
  }, [shown, data.prices, idx])

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key="lot-tooltip"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          ref={ref}
          className="pointer-events-none absolute z-[620] max-w-[260px] rounded-lg border border-line bg-surface/95 px-3 py-2 shadow-lg backdrop-blur-sm"
          style={{ left: pos.left, top: pos.top }}
        >
          <div className="flex items-center gap-2">
            {shown.lot.visibility === 'full' ||
            shown.lot.lot.status === 'available' ? (
              <StatusDot status={shown.lot.lot.status} size={15} />
            ) : null}
            <span className="font-mono text-body font-medium text-ink">
              {shown.lot.code}
            </span>
            <span className="text-caption text-muted">
              {shown.lot.tier?.name ?? '—'}
            </span>
          </div>
          {(shown.lot.visibility === 'full' ||
            shown.lot.lot.status === 'available') && (
            <p className="mt-0.5 text-caption text-muted">
              {STATUS_APPEARANCE[shown.lot.lot.status].label}
            </p>
          )}
          <p className="mt-1 text-body leading-snug text-ink">{lines}</p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
