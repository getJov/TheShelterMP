import { useEffect, useRef } from 'react'
import type { MapOverlay } from '@/domain'
import { useGoogleMap } from '@/features/map/google/map-view'
import {
  createImageOverlay,
  removeImageOverlay,
  type ImageOverlayHandle,
} from '@/features/map/google/image-overlay'
import { useMapStore } from '@/stores/map'

export function SitePlanOverlay({ overlays }: { overlays: MapOverlay[] }) {
  const map = useGoogleMap()
  const show = useMapStore((s) => s.showOverlay)
  const opacity = useMapStore((s) => s.overlayOpacity)
  const layersRef = useRef<ImageOverlayHandle[]>([])

  useEffect(() => {
    for (const h of layersRef.current) removeImageOverlay(map, h)
    layersRef.current = []
    if (!show) return

    const visible = overlays
      .filter((o) => o.visible)
      .sort((a, b) => a.zIndex - b.zIndex)

    for (const o of visible) {
      layersRef.current.push(
        createImageOverlay(map, o, {
          opacity: opacity / 100,
          zIndex: 350 + o.zIndex,
          className: 'shelter-siteplan-image',
        }),
      )
    }

    return () => {
      for (const h of layersRef.current) removeImageOverlay(map, h)
      layersRef.current = []
    }
  }, [map, overlays, show, opacity])

  useEffect(() => {
    for (const h of layersRef.current) h.setOpacity(opacity / 100)
  }, [opacity])

  return null
}
