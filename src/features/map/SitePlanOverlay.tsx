import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { MapOverlay } from '@/domain'
import { toLatLngBounds } from '@/lib/geo'
import { useMapStore } from '@/stores/map'

const PANE = 'shelter-siteplan'

/**
 * The read side of the map editor's overlay manager (spec 10). Publishing an
 * overlay there makes it appear here with no further wiring — the client's
 * "manage it and have it render in the main dashboard".
 *
 * Its own pane sits at z-index 350, below Leaflet's overlay pane (400) where
 * the lot canvas lives, so lots always draw on top of the site plan.
 */
export function SitePlanOverlay({ overlays }: { overlays: MapOverlay[] }) {
  const map = useMap()
  const show = useMapStore((s) => s.showOverlay)
  const opacity = useMapStore((s) => s.overlayOpacity)
  const layersRef = useRef<L.ImageOverlay[]>([])

  useEffect(() => {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE)
      pane.style.zIndex = '350'
      pane.style.pointerEvents = 'none'
    }
  }, [map])

  useEffect(() => {
    for (const l of layersRef.current) l.remove()
    layersRef.current = []
    if (!show) return

    // `visible` is what the map editor PUBLISHES; the map's own "Show site
    // plan" switch is the per-session toggle. Both must be true to draw, so an
    // unpublished draft never leaks onto the main map.
    const visible = overlays
      .filter((o) => o.visible)
      .sort((a, b) => a.zIndex - b.zIndex)

    for (const o of visible) {
      const layer = L.imageOverlay(o.imageUrl, toLatLngBounds(o.bounds), {
        pane: PANE,
        opacity: opacity / 100,
        interactive: false,
        className: 'shelter-siteplan-image',
      }).addTo(map)
      // Leaflet has no native rotation — apply it to the <img> itself.
      const el = layer.getElement()
      if (el && o.rotationDeg) el.style.transform += ` rotate(${o.rotationDeg}deg)`
      layersRef.current.push(layer)
    }

    return () => {
      for (const l of layersRef.current) l.remove()
      layersRef.current = []
    }
  }, [map, overlays, show, opacity])

  useEffect(() => {
    for (const l of layersRef.current) l.setOpacity(opacity / 100)
  }, [opacity])

  return null
}
