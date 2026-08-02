import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_PARK_CENTROID,
  DEFAULT_PARK_ZOOM,
  type BlockId,
  type Bounds,
  type LatLng,
} from '@/domain'
import { boundsOf, boundsPadded, boundsUnion } from '@/lib/geo'
import { BaseLayer } from '@/features/map/BaseLayer'
import { LotCanvasLayer } from '@/features/map/LotCanvasLayer'
import { ZoomControls } from '@/features/map/ZoomControls'
import { MAP_EDGE_PADDING } from '@/features/map/layout'
import { useIsDark } from '@/features/map/use-map-data'
import { useGoogleMap, GoogleMapView } from '@/features/map/google/map-view'
import {
  distanceLatLng,
  fitMapBounds,
  flyMapToBounds,
  getMapCenter,
  getMapZoom,
  getViewBounds,
  stopMapEventPropagation,
} from '@/features/map/google/helpers'
import '@/features/map/map.css'
import { DraftOverlayLayer } from './DraftOverlayLayer'
import { EditorSurface } from './EditorSurface'
import { useEditor } from './store'
import { useDraftPaints, useDraftRecords, useTiers } from './helpers'

export interface CanvasHandle {
  zoomToBlock: (id: BlockId) => void
  fit: () => void
  viewBounds: () => Bounds
}

export function EditorCanvas({ onReady }: { onReady: (h: CanvasHandle) => void }) {
  return (
    <div className="absolute inset-0">
      <GoogleMapView
        center={DEFAULT_PARK_CENTROID}
        zoom={DEFAULT_PARK_ZOOM}
        minZoom={15}
        maxZoom={22}
        doubleClickZoom={false}
        className="absolute inset-0 h-full w-full"
      >
        <Engine onReady={onReady} />
      </GoogleMapView>
    </div>
  )
}

function Engine({ onReady }: { onReady: (h: CanvasHandle) => void }) {
  const map = useGoogleMap()
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
  const home = useRef<{ center: LatLng; zoom: number } | null>(null)

  const fit = useCallback(
    (animate = true) => {
      if (!bounds) return
      fitMapBounds(map, bounds, {
        padding: [MAP_EDGE_PADDING, MAP_EDGE_PADDING],
        animate,
      })
      home.current = { center: getMapCenter(map), zoom: getMapZoom(map) }
      setMoved(false)
    },
    [map, bounds],
  )

  const zoomToBlock = useCallback(
    (id: BlockId) => {
      const block = useEditor.getState().blocks.find((b) => b.id === id)
      if (!block) return
      flyMapToBounds(map, boundsPadded(boundsOf([block.polygon]), 0.12), {
        padding: [MAP_EDGE_PADDING, MAP_EDGE_PADDING],
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

  const viewBounds = useCallback((): Bounds => getViewBounds(map, 0.22), [map])

  useEffect(() => {
    onReady({ zoomToBlock, fit: () => fit(true), viewBounds })
  }, [onReady, zoomToBlock, fit, viewBounds])

  useEffect(() => {
    const onMove = () => {
      const h = home.current
      if (!h) return
      setMoved(
        Math.abs(getMapZoom(map) - h.zoom) > 0.01 ||
          distanceLatLng(getMapCenter(map), h.center) > 6,
      )
    }
    const listener = map.addListener('bounds_changed', onMove)
    return () => listener.remove()
  }, [map])

  useEffect(() => {
    const el = map.getDiv()
    const ro = new ResizeObserver(() => google.maps.event.trigger(map, 'resize'))
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])

  const noop = useCallback(() => {}, [])

  return (
    <>
      <BaseLayer plain="roadmap" />
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
        <div className="pointer-events-none absolute bottom-4 right-4 z-[600]">
          <ZoomControls moved={moved} onFit={() => fit(true)} />
        </div>
      </Chrome>
    </>
  )
}

function Chrome({ children }: { children: React.ReactNode }) {
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    stopMapEventPropagation(el)
  }, [])
  return (
    <div ref={ref} className="relative z-[600]" style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
