import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LotStatus, MapViewMode, PaymentHealth, TierId } from '@/domain'
import { useMapStore } from '@/stores/map'

/**
 * The dashboard's cross-links into the map.
 *
 * Two channels, deliberately:
 *  1. The map store, for everything spec 05 already models — view mode,
 *     status and tier filters. Applied before navigating so the map paints
 *     correctly on its first frame.
 *  2. The URL, which carries the intent in a readable form and is spec 05's
 *     existing deep-link contract for a single lot (`/map?lot=B01-L047`).
 */
export interface MapIntent {
  mode?: MapViewMode
  health?: PaymentHealth[]
  status?: LotStatus
  tierId?: TierId
  /** Human lot code — spec 05's deep link resolves by code, not id. */
  lotCode?: string
  drawer?: 'overview' | 'interments' | 'payments'
}

export function mapHref(intent: MapIntent): string {
  const p = new URLSearchParams()
  if (intent.mode) p.set('mode', intent.mode)
  if (intent.health?.length) p.set('health', intent.health.join(','))
  if (intent.status) p.set('status', intent.status)
  if (intent.tierId) p.set('tier', intent.tierId)
  if (intent.lotCode) p.set('lot', intent.lotCode)
  if (intent.drawer) p.set('drawer', intent.drawer)
  const q = p.toString()
  return q ? `/map?${q}` : '/map'
}

/** Applies the intent to the map store, then navigates. */
export function useMapDrill(): (intent: MapIntent) => void {
  const navigate = useNavigate()
  const setViewMode = useMapStore((s) => s.setViewMode)
  const setFilterOnly = useMapStore((s) => s.setFilterOnly)
  const clearFilters = useMapStore((s) => s.clearFilters)
  const setFilterMany = useMapStore((s) => s.setFilterMany)

  return useCallback(
    (intent: MapIntent) => {
      if (intent.mode) setViewMode(intent.mode)
      if (intent.status) {
        clearFilters()
        setFilterOnly('statuses', intent.status)
      }
      if (intent.tierId) {
        clearFilters()
        setFilterOnly('tierIds', intent.tierId)
      }
      if (intent.health?.length) {
        clearFilters()
        setFilterMany('health', intent.health)
      }
      navigate(mapHref(intent))
    },
    [navigate, setViewMode, setFilterOnly, setFilterMany, clearFilters],
  )
}
