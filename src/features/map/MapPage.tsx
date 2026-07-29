import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { Icon } from '@/components/ui-brand/Icon'
import { IconFilter, IconMap } from '@/components/ui-brand/icons'
import { useCan } from '@/lib/permissions'
import { useMapStore, filtersActive } from '@/stores/map'
import { MapCanvas } from './MapCanvas'
import { DASHBOARD_SLOT_ID } from './layout'
import { DashboardPanel } from '@/features/dashboard/DashboardPanel'
import { LotDetailDrawer } from '@/features/lot-detail'
import { useIsDark, useLotPaints, useMapData } from './use-map-data'

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Full-bleed map with a reserved right-hand slot for spec 07's dashboard
 * panel and spec 06's lot drawer. Both read their width from `./layout`.
 */
export default function MapPage() {
  const data = useMapData()
  const dark = useIsDark()
  const navigate = useNavigate()
  const canEdit = useCan('block:manage')

  const viewMode = useMapStore((s) => s.viewMode)
  const filters = useMapStore((s) => s.filters)
  const selectedLotId = useMapStore((s) => s.selectedLotId)
  const select = useMapStore((s) => s.select)
  const clearFilters = useMapStore((s) => s.clearFilters)

  const { matchCount } = useLotPaints(
    data.lots,
    viewMode,
    filters,
    dark,
    data.tiers,
    data.agentIndex,
  )

  // A location switch must not leave a selection from the other park behind.
  useEffect(() => {
    if (selectedLotId && !data.byId.has(selectedLotId)) select(null)
  }, [data.byId, selectedLotId, select])

  const empty = data.blocks.length === 0
  const noMatches =
    !empty &&
    matchCount === 0 &&
    (filtersActive(filters) || filters.query.trim().length > 0)

  return (
    <div className="relative h-full w-full overflow-hidden">
      {empty ? (
        <div className="map-plain absolute inset-0 grid place-items-center bg-surface-2">
          <EmptyState
            icon={IconMap}
            title="No park layout for this location"
            body="This location has no blocks or lots yet. Draw a block in the map editor to get started."
            action={
              canEdit ? (
                <Button onClick={() => navigate('/map-editor')}>Go to map editor</Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <MapCanvas data={data} />
      )}

      {noMatches && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="absolute left-1/2 top-5 z-[640] flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-surface/92 py-1.5 pl-4 pr-1.5 shadow-lg backdrop-blur"
        >
          <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <Icon icon={IconFilter} size={14} />
            No lots match the current filters
          </span>
          <Button size="sm" variant="secondary" className="h-7 text-[12px]" onClick={clearFilters}>
            Clear filters
          </Button>
        </motion.div>
      )}

      {/*
        Spec 07's panel. The slot spans the whole map and right-aligns the
        panel, rather than being a zero-width anchor pinned to the right edge:
        the full-state dashboard positions itself with `inset-x-0` against this
        element, and against a zero-width box that pushed the whole overlay —
        and its centred "click to return" pill — off the right of the screen.

        pointer-events-none so the map stays draggable underneath; the panel
        re-enables them on itself.
      */}
      <div
        id={DASHBOARD_SLOT_ID}
        className="pointer-events-none absolute inset-0 z-[630] flex justify-end"
      >
        <DashboardPanel />
      </div>

      <LotDetailDrawer lotId={selectedLotId} onClose={() => select(null)} />
    </div>
  )
}
