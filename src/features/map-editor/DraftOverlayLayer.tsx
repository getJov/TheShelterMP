import { useEffect, useRef } from 'react'
import type { MapOverlay, OverlayId } from '@/domain'
import { useGoogleMap } from '@/features/map/google/map-view'
import {
  createImageOverlay,
  removeImageOverlay,
  type ImageOverlayHandle,
} from '@/features/map/google/image-overlay'

export function DraftOverlayLayer({
  overlays,
  show,
  activeId,
}: {
  overlays: MapOverlay[]
  show: boolean
  activeId: OverlayId | null
}) {
  const map = useGoogleMap()
  const layers = useRef<ImageOverlayHandle[]>([])

  useEffect(() => {
    for (const h of layers.current) removeImageOverlay(map, h)
    layers.current = []
    if (!show) return

    const ordered = [...overlays].sort((a, b) => a.zIndex - b.zIndex)
    for (const o of ordered) {
      const handle = createImageOverlay(map, o, {
        opacity: o.opacity,
        zIndex: o.zIndex >= 100 ? 450 : 350,
        className: 'shelter-editor-overlay',
        // A boosted overlay (being placed/aligned) must stay above the lot
        // canvas, which lives in the overlayMouseTarget pane.
        pane: o.zIndex >= 100 ? 'floatPane' : 'overlayLayer',
      })
      handle.setOutline(o.id === activeId)
      layers.current.push(handle)
    }

    return () => {
      for (const h of layers.current) removeImageOverlay(map, h)
      layers.current = []
    }
  }, [map, overlays, show, activeId])

  return null
}
