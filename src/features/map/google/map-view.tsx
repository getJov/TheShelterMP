import { APIProvider, Map as GoogleMap, useMap } from '@vis.gl/react-google-maps'
import type { LatLng } from '@/domain'
import { cn } from '@/lib/utils'
import { googleMapsApiKey } from './helpers'

export interface GoogleMapViewProps {
  center: LatLng
  zoom: number
  minZoom?: number
  maxZoom?: number
  doubleClickZoom?: boolean
  className?: string
  children?: React.ReactNode
}

function MapReady({ children }: { children: React.ReactNode }) {
  const map = useMap()
  if (!map) return null
  return <>{children}</>
}

/**
 * Google Maps host — children use useMap() from @vis.gl/react-google-maps
 * once the map instance is ready (inside MapReady).
 */
export function GoogleMapView({
  center,
  zoom,
  minZoom = 0,
  maxZoom = 22,
  doubleClickZoom = true,
  className,
  children,
}: GoogleMapViewProps) {
  const apiKey = googleMapsApiKey()

  if (!apiKey) {
    return (
      <div
        className={cn(
          'shelter-map absolute inset-0 grid place-items-center bg-surface-2 p-6 text-center',
          className,
        )}
      >
        <div className="max-w-sm space-y-2 text-sm text-muted">
          <p className="font-display text-lg text-ink">Google Maps API key required</p>
          <p>
            Add <code className="font-mono text-ink">VITE_GOOGLE_MAPS_API_KEY</code> to a{' '}
            <code className="font-mono text-ink">.env</code> file in the project root, then restart
            the dev server.
          </p>
        </div>
      </div>
    )
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['geometry']}>
      <div className={cn('shelter-map absolute inset-0 h-full w-full', className)}>
        <GoogleMap
          defaultCenter={{ lat: center[0], lng: center[1] }}
          defaultZoom={zoom}
          minZoom={minZoom}
          maxZoom={maxZoom}
          disableDefaultUI
          clickableIcons={false}
          gestureHandling="greedy"
          mapTypeId="satellite"
          disableDoubleClickZoom={!doubleClickZoom}
          style={{ width: '100%', height: '100%' }}
        >
          <MapReady>{children}</MapReady>
        </GoogleMap>
      </div>
    </APIProvider>
  )
}

export { useMap as useVisGlMap } from '@vis.gl/react-google-maps'

/** Map instance — only valid inside GoogleMapView after MapReady mounts children. */
export function useGoogleMap(): google.maps.Map {
  const map = useMap()
  if (!map) {
    throw new Error('useGoogleMap must be used inside GoogleMapView after the map is ready')
  }
  return map
}
