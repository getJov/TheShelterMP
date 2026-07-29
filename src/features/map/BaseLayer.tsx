import { useRef } from 'react'
import { TileLayer } from 'react-leaflet'
import { toast } from 'sonner'
import { useMapStore } from '@/stores/map'

/** Esri World Imagery — global coverage, no API key, attribution required. */
const ESRI_WORLD_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

/** Tolerate the odd dropped tile; three failures means the source is down. */
const FAILURE_THRESHOLD = 3

/**
 * Satellite by default. "Plain" renders no tiles at all — a flat parchment
 * ground (deep green in dark mode, via `.leaflet-container`'s surface token)
 * so the lot geometry reads cleanly for planning work.
 */
export function BaseLayer() {
  const baseLayer = useMapStore((s) => s.baseLayer)
  const setBaseLayer = useMapStore((s) => s.setBaseLayer)
  const failures = useRef(0)
  const warned = useRef(false)

  if (baseLayer === 'plain') return null

  return (
    <TileLayer
      url={ESRI_WORLD_IMAGERY}
      attribution="Tiles &copy; Esri"
      // Esri's imagery for Lupon tops out at z18; asking for 19+ returns a
      // "Map data not yet available" placeholder, so upscale from 18 instead.
      maxNativeZoom={18}
      maxZoom={22}
      minZoom={13}
      keepBuffer={3}
      eventHandlers={{
        tileerror: () => {
          failures.current += 1
          if (failures.current < FAILURE_THRESHOLD || warned.current) return
          warned.current = true
          // Never leave the client staring at grey squares mid-presentation.
          setBaseLayer('plain')
          toast.warning('Satellite imagery unavailable', {
            description: 'Switched to the plain base layer.',
          })
        },
      }}
    />
  )
}
