import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  DEFAULT_PARK_CENTROID,
  DEFAULT_PARK_ZOOM,
  type BlockId,
  type Bounds,
} from '@/domain'
import { boundsOf, boundsPadded, boundsUnion, toLatLngBounds } from '@/lib/geo'
import { cn } from '@/lib/utils'
import { useMapStore } from '@/stores/map'
import { BaseLayer } from '@/features/map/BaseLayer'
import { LotCanvasLayer } from '@/features/map/LotCanvasLayer'
import { ZoomControls } from '@/features/map/ZoomControls'
import { MAP_EDGE_PADDING } from '@/features/map/layout'
import { useIsDark } from '@/features/map/use-map-data'
import '@/features/map/map.css'
import { DraftOverlayLayer } from './DraftOverlayLayer'
import { EditorSurface } from './EditorSurface'
import { useEditor } from './store'
import { useDraftPaints, useDraftRecords, useTiers } from './helpers'

/** Imperative hook the sidebar uses to zoom to a block. */
export interface CanvasHandle {
  zoomToBlock: (id: BlockId) => void
  fit: () => void
  /** Current viewport, inset a little — where a new overlay drops. */
  viewBounds: () => Bounds
}

export function EditorCanvas({ onReady }: { onReady: (h: CanvasHandle) => void }) {
  const baseLayer = useMapStore((s) => s.baseLayer)
  return (
    <div className={cn('absolute inset-0', baseLayer === 'plain' && 'map-plain')}>
      <MapContainer
        center={DEFAULT_PARK_CENTROID}
        zoom={DEFAULT_PARK_ZOOM}
        minZoom={15}
        maxZoom={22}
        zoomControl={false}
        doubleClickZoom={false}
        preferCanvas
        attributionControl
        className="absolute inset-0 h-full w-full"
      >
        <Engine onReady={onReady} />
      </MapContainer>
    </div>
  )
}

function Engine({ onReady }: { onReady: (h: CanvasHandle) => void }) {
  const map = useMap()
  const dark = useIsDark()

  const lots = useEditor((s) => s.lots)
  const blocks = useEditor((s) => s.blocks)
  const overlays = useEditor((s) => s.overlays)
  const selection = useEditor((s) => s.selection)
  const layers = useEditor((s) => s.layers)
  const compare = useEditor((s) => s.compare)
  const activeOverlayId = useEditor((s) => s.activeOverlayId)

  const { byId: tiersById } = useTiers()
  const records = useDraftRecords(lots)
  const paints = useDraftPaints(lots, tiersById, dark)

  const flags = useMemo(
    () => ({
      dark,
      showLabels: layers.lotNumbers,
      selectedId: null,
      hoveredId: null,
      multiSelected: selection,
    }),
    [dark, layers.lotNumbers, selection],
  )

  const bounds = useMemo(
    () => boundsUnion(blocks.map((b) => boundsOf([b.polygon]))),
    [blocks],
  )

  const [moved, setMoved] = useState(false)
  const home = useRef<{ center: L.LatLng; zoom: number } | null>(null)

  const fit = useCallback(
    (animate = true) => {
      if (!bounds) return
      map.fitBounds(toLatLngBounds(bounds), {
        padding: [MAP_EDGE_PADDING, MAP_EDGE_PADDING],
        animate,
      })
      home.current = { center: map.getCenter(), zoom: map.getZoom() }
      setMoved(false)
    },
    [map, bounds],
  )

  const zoomToBlock = useCallback(
    (id: BlockId) => {
      const block = useEditor.getState().blocks.find((b) => b.id === id)
      if (!block) return
      map.flyToBounds(toLatLngBounds(boundsPadded(boundsOf([block.polygon]), 0.12)), {
        duration: 0.6,
      })
    },
    [map],
  )

  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !bounds) return
    fitted.current = true
    fit(false)
  }, [bounds, fit])

  const viewBounds = useCallback((): Bounds => {
    const b = map.getBounds().pad(-0.22)
    return [
      [b.getSouth(), b.getWest()],
      [b.getNorth(), b.getEast()],
    ]
  }, [map])

  useEffect(() => {
    onReady({ zoomToBlock, fit: () => fit(true), viewBounds })
  }, [onReady, zoomToBlock, fit, viewBounds])

  useEffect(() => {
    const onMove = () => {
      const h = home.current
      if (!h) return
      setMoved(
        Math.abs(map.getZoom() - h.zoom) > 0.01 || map.getCenter().distanceTo(h.center) > 6,
      )
    }
    map.on('zoomend moveend', onMove)
    return () => {
      map.off('zoomend moveend', onMove)
    }
  }, [map])

  // The editor's own resize discipline — panels open and close beside it.
  useEffect(() => {
    const el = map.getContainer()
    let t: number | undefined
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t)
      t = window.setTimeout(() => map.invalidateSize({ animate: false }), 120)
    })
    ro.observe(el)
    return () => {
      window.clearTimeout(t)
      ro.disconnect()
    }
  }, [map])

  const noop = useCallback(() => {}, [])

  return (
    <>
      <BaseLayer />
      <DraftOverlayLayer
        overlays={overlays}
        show={layers.sitePlan}
        activeId={activeOverlayId}
      />
      <LotCanvasLayer
        records={records}
        paints={paints}
        flags={flags}
        active={layers.lots && !compare}
        crossfadeKey="tier"
        onPick={noop}
        onHover={noop}
      />
      <EditorSurface dark={dark} />
      <Chrome>
        <ZoomControls moved={moved} onFit={() => fit(true)} />
      </Chrome>
    </>
  )
}

/** Floating HTML inside the Leaflet container must not leak events into it. */
function Chrome({ children }: { children: React.ReactNode }) {
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    L.DomEvent.disableClickPropagation(el)
    L.DomEvent.disableScrollPropagation(el)
    L.DomEvent.on(el, 'dblclick mousedown mousemove pointerdown', L.DomEvent.stopPropagation)
  }, [])
  return (
    <div ref={ref} className="relative z-[600]" style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
