import { useEffect } from 'react'
import { useGoogleMap } from '@/features/map/google/map-view'
import { useMapStore } from '@/stores/map'

const PLAIN_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'all', elementType: 'all', stylers: [{ visibility: 'off' }] },
]

/**
 * Satellite by default. The non-satellite layer has two flavours:
 * - `parchment` (Park Map "Plain") hides all map features so the parchment
 *   ground from `.map-plain` / `.shelter-map` shows through.
 * - `roadmap` (Map Editor "Default") shows the standard street map, so the
 *   editor keeps roads and buildings as a tracing reference.
 */
export function BaseLayer({ plain = 'parchment' }: { plain?: 'parchment' | 'roadmap' }) {
  const map = useGoogleMap()
  const baseLayer = useMapStore((s) => s.baseLayer)

  useEffect(() => {
    if (baseLayer === 'plain') {
      if (plain === 'roadmap') {
        map.setOptions({ mapTypeId: 'roadmap', styles: [] })
      } else {
        map.setOptions({ mapTypeId: 'roadmap', styles: PLAIN_STYLES })
      }
    } else {
      map.setOptions({ mapTypeId: 'satellite', styles: [] })
    }
  }, [map, baseLayer, plain])

  return null
}
