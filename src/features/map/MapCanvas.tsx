import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { motion } from 'framer-motion'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  DEFAULT_PARK_CENTROID,
  DEFAULT_PARK_ZOOM,
  ZOOM,
  type LotId,
} from '@/domain'
import { toLatLngBounds } from '@/lib/geo'
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

const RESIZE_DEBOUNCE_MS = 120

export function MapCanvas({ data }: { data: MapData }) {
  const baseLayer = useMapStore((s) => s.baseLayer)

  return (
    <div className={cn('absolute inset-0', baseLayer === 'plain' && 'map-plain')}>
      <MapContainer
        center={DEFAULT_PARK_CENTROID}
        zoom={DEFAULT_PARK_ZOOM}
        minZoom={15}
        maxZoom={22}
        zoomControl={false}
        preferCanvas
        attributionControl
        className="absolute inset-0 h-full w-full"
      >
        <Engine data={data} />
      </MapContainer>
    </div>
  )
}

/**
 * Everything that needs the Leaflet instance. Kept in one component so the
 * imperative wiring — fit, resize, deep link, selection pan — reads top to
 * bottom instead of being scattered across five files.
 */
function Engine({ data }: { data: MapData }) {
  const map = useMap()
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
  // Keeps the right-hand chrome clear of the dashboard panel and lot drawer.
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
    () => ({ dark, showLabels, selectedId: selectedLotId, hoveredId: hoveredLotId, multiSelected: multiSelectedLotIds }),
    [dark, showLabels, selectedLotId, hoveredLotId, multiSelectedLotIds],
  )

  const [tooltip, setTooltip] = useState<TooltipTarget | null>(null)
  const [moved, setMoved] = useState(false)
  const [perf, setPerf] = useState<{ ms: number; n: number } | null>(null)
  const home = useRef<{ center: L.LatLng; zoom: number } | null>(null)
  const debugPerf = new URLSearchParams(location.search).get('debug') === 'perf'

  // ── fit ───────────────────────────────────────────────────────────
  const fit = useCallback(
    (animate = true) => {
      if (!data.bounds) return
      const reserve = dashboardPanelOpen ? DASHBOARD_PANEL_WIDTH : 0
      map.fitBounds(toLatLngBounds(data.bounds), {
        paddingTopLeft: [MAP_EDGE_PADDING, MAP_EDGE_PADDING],
        paddingBottomRight: [MAP_EDGE_PADDING + reserve, MAP_EDGE_PADDING],
        animate,
      })
      home.current = { center: map.getCenter(), zoom: map.getZoom() }
      setMoved(false)
    },
    [map, data.bounds, dashboardPanelOpen],
  )

  const fittedOnce = useRef(false)
  useEffect(() => {
    if (fittedOnce.current) return
    fittedOnce.current = true
    // The park fills the frame regardless of what DEFAULT_PARK_ZOOM says.
    fit(false)
    setZoom(map.getZoom())
  }, [fit, map, setZoom])

  // ── viewport events ───────────────────────────────────────────────
  useEffect(() => {
    const onMove = () => {
      setZoom(map.getZoom())
      const h = home.current
      if (!h) return
      setMoved(
        Math.abs(map.getZoom() - h.zoom) > 0.01 ||
          map.getCenter().distanceTo(h.center) > 6,
      )
    }
    const onDragStart = () => {
      setDragging(true)
      setTooltip(null)
    }
    const onDragEnd = () => setDragging(false)

    map.on('zoomend moveend', onMove)
    map.on('dragstart', onDragStart)
    map.on('dragend', onDragEnd)
    return () => {
      map.off('zoomend moveend', onMove)
      map.off('dragstart', onDragStart)
      map.off('dragend', onDragEnd)
    }
  }, [map, setZoom, setDragging])

  // ── invalidateSize discipline ─────────────────────────────────────
  // The single most common cause of a map that renders as grey rectangles
  // after a panel animation.
  useEffect(() => {
    const el = map.getContainer()
    let t: number | undefined
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t)
      t = window.setTimeout(() => map.invalidateSize({ animate: false }), RESIZE_DEBOUNCE_MS)
    })
    ro.observe(el)
    return () => {
      window.clearTimeout(t)
      ro.disconnect()
    }
  }, [map])

  // ── selection ─────────────────────────────────────────────────────
  const goToLot = useCallback(
    (id: LotId) => {
      const m = data.byId.get(id)
      if (!m) return
      select(id)
      const targetZoom = Math.max(map.getZoom(), ZOOM.lotsVisible + 1)
      // Pan so the lot lands LEFT of the drawer — centring naively would put
      // the selection behind the panel.
      const reserve = Math.min(LOT_DRAWER_WIDTH, map.getSize().x * 0.42)
      const p = map.project(L.latLng(m.lot.centroid[0], m.lot.centroid[1]), targetZoom)
      p.x += reserve / 2
      map.flyTo(map.unproject(p, targetZoom), targetZoom, { duration: 0.7 })
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
    (id: LotId | null, ev: L.LeafletMouseEvent | null) => {
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

  // ── deep link: /map?lot=B01-L047 ──────────────────────────────────
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

  // Keep the URL honest once the user starts clicking around.
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

        {/*
          One right-hand column, inset past whatever panel is open. The legend
          used to sit bottom-left, where a long tier list grew into the controls
          card above it; the zoom buttons and the survey badge used to sit under
          the dashboard panel, which made them unclickable.
        */}
        {chromeVisible && (
          <motion.div
            className="pointer-events-none absolute bottom-4 z-[600] flex flex-col items-end gap-2"
            animate={{ right: chromeInset + MAP_CHROME_GAP }}
            transition={{ duration: 0.38, ease: EASE }}
          >
            <MapLegend data={data} dark={dark} />
            <ZoomControls moved={moved} onFit={() => fit(true)} />
            <div className="pointer-events-none rounded-full border border-line bg-surface/80 px-2.5 py-1 text-[10.5px] text-muted backdrop-blur">
              Illustrative layout — pending survey
            </div>
          </motion.div>
        )}
      </Chrome>

      {lotsActive && !dragging && <LotTooltip target={tooltip} />}

      {debugPerf && perf && (
        <div className="pointer-events-none absolute left-2 bottom-2 z-[610] rounded-md border border-line bg-surface/90 px-2 py-1 font-mono text-[10.5px] text-muted backdrop-blur">
          redraw {perf.ms.toFixed(2)} ms · {perf.n} lots
        </div>
      )}
    </>
  )
}

/**
 * Floating HTML lives inside the Leaflet container so `useMap` works, which
 * means its clicks and wheel events would otherwise reach the map. This
 * wrapper is `display: contents`, so it changes no layout while still sitting
 * in the bubble path.
 */
function Chrome({ children }: { children: React.ReactNode }) {
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    L.DomEvent.disableClickPropagation(el)
    L.DomEvent.disableScrollPropagation(el)
    L.DomEvent.on(el, 'dblclick mousedown mousemove', L.DomEvent.stopPropagation)
  }, [])
  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
