import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { MapOverlay, OverlayId } from '@/domain'
import { toLatLngBounds } from '@/lib/geo'

const BEHIND = 'editor-overlay-behind'
const FRONT = 'editor-overlay-front'

/**
 * The staged overlays, drawn with their own per-overlay opacity.
 *
 * The main map's `SitePlanOverlay` renders published overlays at one shared
 * opacity from the map store; in here each overlay is being positioned
 * individually, so it needs its own. Two panes — 350 sits under the lot
 * canvas (400), 450 sits over it — give "send behind / bring in front"
 * without touching the lot renderer.
 */
export function DraftOverlayLayer({
  overlays,
  show,
  activeId,
}: {
  overlays: MapOverlay[]
  show: boolean
  activeId: OverlayId | null
}) {
  const map = useMap()
  const layers = useRef<L.ImageOverlay[]>([])

  useEffect(() => {
    for (const [name, z] of [
      [BEHIND, '350'],
      [FRONT, '450'],
    ] as const) {
      if (!map.getPane(name)) {
        const pane = map.createPane(name)
        pane.style.zIndex = z
        pane.style.pointerEvents = 'none'
      }
    }
  }, [map])

  useEffect(() => {
    for (const l of layers.current) l.remove()
    layers.current = []
    if (!show) return

    const ordered = [...overlays].sort((a, b) => a.zIndex - b.zIndex)
    for (const o of ordered) {
      const layer = L.imageOverlay(o.imageUrl, toLatLngBounds(o.bounds), {
        pane: o.zIndex >= 100 ? FRONT : BEHIND,
        opacity: o.opacity,
        interactive: false,
        className: 'shelter-editor-overlay',
      }).addTo(map)
      const el = layer.getElement()
      if (el) {
        if (o.rotationDeg) el.style.transform += ` rotate(${o.rotationDeg}deg)`
        el.style.outline =
          o.id === activeId ? '2px dashed var(--color-gold)' : 'none'
        el.style.outlineOffset = '2px'
      }
      layers.current.push(layer)
    }

    return () => {
      for (const l of layers.current) l.remove()
      layers.current = []
    }
  }, [map, overlays, show, activeId])

  return null
}
