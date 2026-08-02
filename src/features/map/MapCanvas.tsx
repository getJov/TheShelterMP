import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  DEFAULT_PARK_CENTROID,
  DEFAULT_PARK_ZOOM,
  ZOOM,
  type LatLng,
  type LotId,
} from '@/domain'
import { useGoogleMap, GoogleMapView } from '@/features/map/google/map-view'
import {
  containerPointToLatLng,
  distanceLatLng,
  fitMapBounds,
  flyMapTo,
  getMapCenter,
  getMapSize,
  getMapZoom,
  latLngToContainerPoint,
  stopMapEventPropagation,
} from '@/features/map/google/helpers'
import type { MapPointerEvent } from '@/features/map/google/types'
import { useMapStore } from '@/stores/map'
import { cn } from '@/lib/utils'
import { BaseLayer } from './BaseLayer'
import { BlockClusterLayer } from './BlockClusterLayer'
import { LotCanvasLayer } from './LotCanvasLayer'
import { SitePlanOverlay } from './SitePlanOverlay'
import { MapControls } from './MapControls'
import { MapLegend } from './MapLegend'
import { ZoomControls } from './ZoomControls'
import { LotTooltip, type TooltipTarget } from './LotTooltip'
import {
  DASHBOARD_PANEL_WIDTH,
  LOT_DRAWER_WIDTH,
  MAP_CHROME_GAP,
  MAP_EDGE_PADDING,
} from './layout'
import { useChromeInset, useChromeVisible } from './use-chrome-inset'
import { useIsDark, useLotPaints, useLotRecords, type MapData } from './use-map-data'
import './map.css'

const EASE = [0.22, 1, 0.36, 1] as const

export function MapCanvas({ data }: { data: MapData }) {
  const baseLayer = useMapStore((s) => s.baseLayer)

  return (
    <div className={cn('absolute inset-0', baseLayer === 'plain' && 'map-plain')}>
      <GoogleMapView
        center={DEFAULT_PARK_CENTROID}
        zoom={DEFAULT_PARK_ZOOM}
        minZoom={15}
        maxZoom={22}
        className="absolute inset-0 h-full w-full"
      >
        <Engine data={data} />
      </GoogleMapView>
    </div>
  )
}

function Engine({ data }: { data: MapData }) {
  const map = useGoogleMap()
  const dark = useIsDark()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const viewMode = useMapStore((s) => s.viewMode)
  const filters = useMapStore((s) => s.filters)
  const showLabels = useMapStore((s) => s.showLabels)
  const selectedLotId = useMapStore((s) => s.selectedLotId)
  const hoveredLotId = useMapStore((s) => s.hoveredLotId)
  const multiSelectedLotIds = useMapStore((s) => s.multiSelectedLotIds)
  const dashboardPanelOpen = useMapStore((s) => s.dashboardPanelOpen)
  const zoom = useMapStore((s) => s.zoom)
  const dragging = useMapStore((s) => s.dragging)
  const chromeInset = useChromeInset()
  const chromeVisible = useChromeVisible()
  const select = useMapStore((s) => s.select)
  const hover = useMapStore((s) => s.hover)
  const setZoom = useMapStore((s) => s.setZoom)
  const setDragging = useMapStore((s) => s.setDragging)

  const records = useLotRecords(data.lots)
  const { paints } = useLotPaints(
    data.lots,
    viewMode,
    filters,
    dark,
    data.tiers,
    data.agentIndex,
  )

  const flags = useMemo(
    () => ({
      dark,
      showLabels,
      selectedId: selectedLotId,
      hoveredId: hoveredLotId,
      multiSelected: multiSelectedLotIds,
    }),
    [dark, showLabels, selectedLotId, hoveredLotId, multiSelectedLotIds],
  )

  const [tooltip, setTooltip] = useState<TooltipTarget | null>(null)
  const [moved, setMoved] = useState(false)
  const [perf, setPerf] = useState<{ ms: number; n: number } | null>(null)
  const home = useRef<{ center: LatLng; zoom: number } | null>(null)
  const debugPerf = new URLSearchParams(location.search).get('debug') === 'perf'

  const fit = useCallback(
    (animate = true) => {
      if (!data.bounds) return
      const reserve = dashboardPanelOpen ? DASHBOARD_PANEL_WIDTH : 0
      fitMapBounds(map, data.bounds, {
        paddingTopLeft: [MAP_EDGE_PADDING, MAP_EDGE_PADDING],
        paddingBottomRight: [MAP_EDGE_PADDING + reserve, MAP_EDGE_PADDING],
        animate,
      })
      home.current = { center: getMapCenter(map), zoom: getMapZoom(map) }
      setMoved(false)
    },
    [map, data.bounds, dashboardPanelOpen],
  )

  const fittedOnce = useRef(false)
  useEffect(() => {
    if (fittedOnce.current) return
    fittedOnce.current = true
    fit(false)
    setZoom(getMapZoom(map))
  }, [fit, map, setZoom])

  useEffect(() => {
    const onMove = () => {
      setZoom(getMapZoom(map))
      const h = home.current
      if (!h) return
      setMoved(
        Math.abs(getMapZoom(map) - h.zoom) > 0.01 ||
          distanceLatLng(getMapCenter(map), h.center) > 6,
      )
    }
    const onDragStart = () => {
      setDragging(true)
      setTooltip(null)
    }
    const onDragEnd = () => setDragging(false)

    const moveListener = map.addListener('bounds_changed', onMove)
    const dragStartListener = map.addListener('dragstart', onDragStart)
    const dragEndListener = map.addListener('dragend', onDragEnd)
    return () => {
      moveListener.remove()
      dragStartListener.remove()
      dragEndListener.remove()
    }
  }, [map, setZoom, setDragging])

  useEffect(() => {
    const el = map.getDiv()
    const ro = new ResizeObserver(() => {
      google.maps.event.trigger(map, 'resize')
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])

  const goToLot = useCallback(
    (id: LotId) => {
      const m = data.byId.get(id)
      if (!m) return
      select(id)
      const targetZoom = Math.max(getMapZoom(map), ZOOM.lotsVisible + 1)
      const reserve = Math.min(LOT_DRAWER_WIDTH, getMapSize(map).x * 0.42)
      const p = latLngToContainerPoint(map, m.lot.centroid)
      const shifted = containerPointToLatLng(map, p.x + reserve / 2, p.y)
      flyMapTo(map, shifted, targetZoom, { duration: 0.7 })
    },
    [map, data.byId, select],
  )

  const onPick = useCallback(
    (id: LotId | null) => {
      if (id) goToLot(id)
      else select(null)
    },
    [goToLot, select],
  )

  const onHover = useCallback(
    (id: LotId | null, ev: MapPointerEvent | null) => {
      hover(id)
      if (!id || !ev || useMapStore.getState().dragging) {
        setTooltip(null)
        return
      }
      const m = data.byId.get(id)
      if (!m) return setTooltip(null)
      setTooltip({ lot: m, x: ev.containerPoint.x, y: ev.containerPoint.y })
    },
    [hover, data.byId],
  )

  useEffect(() => {
    if (dragging) setTooltip(null)
  }, [dragging])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  const deepLinked = useRef(false)
  useEffect(() => {
    if (deepLinked.current) return
    const code = searchParams.get('lot')
    if (!code) return
    const hit = data.lots.find(
      (l) => l.code.toLowerCase() === code.trim().toLowerCase(),
    )
    if (!hit) return
    deepLinked.current = true
    goToLot(hit.lot.id)
  }, [searchParams, data.lots, goToLot])

  useEffect(() => {
    if (!deepLinked.current) return
    if (!selectedLotId) {
      const next = new URLSearchParams(searchParams)
      if (next.has('lot')) {
        next.delete('lot')
        setSearchParams(next, { replace: true })
      }
    }
  }, [selectedLotId, searchParams, setSearchParams])

  const lotsActive = zoom >= ZOOM.lotsVisible

  return (
    <>
      <BaseLayer />
      <SitePlanOverlay overlays={data.overlays} />
      <LotCanvasLayer
        records={records}
        paints={paints}
        flags={flags}
        active={lotsActive}
        crossfadeKey={viewMode}
        onPick={onPick}
        onHover={onHover}
        onStats={debugPerf ? (ms, n) => setPerf({ ms, n }) : undefined}
      />
      <BlockClusterLayer blocks={data.blocks} lots={data.lots} />

      <Chrome>
        {chromeVisible && <MapControls data={data} onGoToLot={goToLot} />}

        {chromeVisible && (
          <motion.div
            className="pointer-events-none absolute bottom-4 z-[600] flex flex-col items-end gap-2"
            animate={{ right: chromeInset + MAP_CHROME_GAP }}
            transition={{ duration: 0.38, ease: EASE }}
          >
            <MapLegend data={data} dark={dark} />
            <ZoomControls moved={moved} onFit={() => fit(true)} />
            <div className="pointer-events-none rounded-full border border-line bg-surface/80 px-2.5 py-1 text-micro text-muted backdrop-blur">
              Illustrative layout — pending survey
            </div>
          </motion.div>
        )}
      </Chrome>

      {lotsActive && !dragging && <LotTooltip target={tooltip} />}

      {debugPerf && perf && (
        <div className="pointer-events-none absolute left-2 bottom-2 z-[610] rounded-md border border-line bg-surface/90 px-2 py-1 font-mono text-micro text-muted backdrop-blur">
          redraw {perf.ms.toFixed(2)} ms · {perf.n} lots
        </div>
      )}
    </>
  )
}

function Chrome({ children }: { children: React.ReactNode }) {
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    stopMapEventPropagation(el)
  }, [])
  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
