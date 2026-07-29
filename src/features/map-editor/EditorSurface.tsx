import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Bounds, LatLng, Lot, LotId, Polygon } from '@/domain'
import { areaSqm, pointInPolygon, polygonCentroid } from '@/lib/geo'
import { distanceM, rotatePolygon } from '@/lib/grid-generator'
import { cn } from '@/lib/utils'
import { ChromeCanvas, emptyChrome, type ChromeState } from './chrome-canvas'
import { useEditor } from './store'
import { useGridPlan } from './use-grid-plan'
import { useTiers } from './helpers'

const CLICK_SLOP = 4
const SNAP_PX = 8

type Mode =
  | { k: 'idle' }
  | { k: 'band'; x0: number; y0: number; subtract: boolean }
  | { k: 'lasso' }
  | { k: 'block'; x0: number; y0: number }
  | { k: 'vertex'; index: number }
  | { k: 'overlayScale'; corner: number }
  | { k: 'rotate' }
  | { k: 'overlayMove' }
  | { k: 'overlayRotate' }

/**
 * Data that changes on every pointermove. It lives in a ref rather than in
 * `mode`, because `mode` is React state and the next render would overwrite an
 * in-place accumulation — which is exactly how a lasso ends up with one point.
 */
interface DragData {
  pts: [number, number][]
  /** Pointer angle when the rotation started — fixed for the whole gesture. */
  angle: number
  /** Rotation the object had when the gesture started. */
  base: number
  from: LatLng
}

/** Re-render whenever the viewport changes, so DOM handles track the map. */
function useMapTick(map: L.Map) {
  const [tick, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const fn = () => bump()
    map.on('move zoom viewreset resize', fn)
    return () => {
      map.off('move zoom viewreset resize', fn)
    }
  }, [map])
  return tick
}

const fmtM = (m: number) => `${m.toFixed(1)} m`
const fmtArea = (m2: number) =>
  m2 >= 10000
    ? `${(m2 / 10000).toFixed(2)} ha`
    : `${Math.round(m2).toLocaleString()} m²`

/**
 * Everything the pointer does in the editor.
 *
 * Leaflet's own handlers are suppressed on this element — so a drag on empty
 * ground is a rubber band, not a pan — while the wheel is deliberately left to
 * bubble, which keeps scroll-zoom working. Holding Space drops the surface out
 * of the hit path entirely, restoring the normal pan.
 */
export function EditorSurface({ dark }: { dark: boolean }) {
  const map = useMap()
  const tick = useMapTick(map)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chromeRef = useRef<ChromeCanvas | null>(null)

  const tool = useEditor((s) => s.tool)
  const lots = useEditor((s) => s.lots)
  const blocks = useEditor((s) => s.blocks)
  const overlays = useEditor((s) => s.overlays)
  const selection = useEditor((s) => s.selection)
  const activeBlockId = useEditor((s) => s.activeBlockId)
  const activeOverlayId = useEditor((s) => s.activeOverlayId)
  const pendingBlock = useEditor((s) => s.pendingBlock)
  const showBlocks = useEditor((s) => s.layers.blocks)
  const overlaps = useEditor((s) => s.overlaps)
  const locked = useEditor((s) => s.lockedOverlays)
  const showPreview = useEditor((s) => s.showPreview)

  const planned = useGridPlan()
  const { byId: tiersById } = useTiers()

  const [mode, setMode] = useState<Mode>({ k: 'idle' })
  const [panMode, setPanMode] = useState(false)
  const [drawPts, setDrawPts] = useState<LatLng[]>([])
  const [cursorLL, setCursorLL] = useState<LatLng | null>(null)
  const [readout, setReadout] = useState<ChromeState['readout']>(null)
  const [band, setBand] = useState<ChromeState['band']>(null)
  const [lasso, setLasso] = useState<[number, number][] | null>(null)
  const [draftRect, setDraftRect] = useState<Polygon | null>(null)

  const lassoArmed = useRef(false)
  const lastPicked = useRef<LotId | null>(null)
  const modeRef = useRef<Mode>(mode)
  modeRef.current = mode
  const drag = useRef<DragData>({ pts: [], angle: 0, base: 0, from: [0, 0] })
  const draftRectRef = useRef<Polygon | null>(draftRect)
  draftRectRef.current = draftRect

  // ── projection helpers ────────────────────────────────────────────
  const toLL = useCallback(
    (x: number, y: number): LatLng => {
      const ll = map.containerPointToLatLng(L.point(x, y))
      return [ll.lat, ll.lng]
    },
    [map],
  )
  const toPt = useCallback(
    (ll: LatLng) => map.latLngToContainerPoint(L.latLng(ll[0], ll[1])),
    [map],
  )

  // ── lot hit testing, against the draft ────────────────────────────
  const lotsRef = useRef<Lot[]>(lots)
  lotsRef.current = lots

  const hitTest = useCallback(
    (x: number, y: number): Lot | null => {
      const ll = toLL(x, y)
      for (let i = lotsRef.current.length - 1; i >= 0; i--) {
        const lot = lotsRef.current[i]!
        if (Math.abs(lot.centroid[0] - ll[0]) > 0.0005) continue
        if (Math.abs(lot.centroid[1] - ll[1]) > 0.0005) continue
        if (pointInPolygon(ll, lot.polygon)) return lot
      }
      return null
    },
    [toLL],
  )

  const inBox = useCallback(
    (x0: number, y0: number, x1: number, y1: number): LotId[] => {
      const a = toLL(Math.min(x0, x1), Math.min(y0, y1))
      const b = toLL(Math.max(x0, x1), Math.max(y0, y1))
      const minLat = Math.min(a[0], b[0])
      const maxLat = Math.max(a[0], b[0])
      const minLng = Math.min(a[1], b[1])
      const maxLng = Math.max(a[1], b[1])
      return lotsRef.current
        .filter(
          (l) =>
            l.centroid[0] >= minLat &&
            l.centroid[0] <= maxLat &&
            l.centroid[1] >= minLng &&
            l.centroid[1] <= maxLng,
        )
        .map((l) => l.id)
    },
    [toLL],
  )

  const inLasso = useCallback(
    (path: [number, number][]): LotId[] => {
      if (path.length < 3) return []
      const poly: Polygon = path.map(([x, y]) => toLL(x, y))
      return lotsRef.current.filter((l) => pointInPolygon(l.centroid, poly)).map((l) => l.id)
    },
    [toLL],
  )

  /** Nearest lot corner within 8 px — keeps hand-drawn lots flush. */
  const snap = useCallback(
    (x: number, y: number): LatLng => {
      let best: LatLng | null = null
      let bestD = SNAP_PX
      const near = toLL(x, y)
      for (const lot of lotsRef.current) {
        if (Math.abs(lot.centroid[0] - near[0]) > 0.0006) continue
        for (const v of lot.polygon) {
          const p = toPt(v)
          const d = Math.hypot(p.x - x, p.y - y)
          if (d < bestD) {
            bestD = d
            best = v
          }
        }
      }
      return best ?? near
    },
    [toLL, toPt],
  )
  const snapRef = useRef(snap)
  snapRef.current = snap

  // ── chrome canvas ─────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return
    const c = new ChromeCanvas(map, canvasRef.current)
    chromeRef.current = c
    return () => {
      c.destroy()
      chromeRef.current = null
    }
  }, [map])

  const previewPolys = useMemo(
    () =>
      tool !== 'grid' || !planned || !showPreview
        ? []
        : planned.plan.cells.map((c) => c.polygon),
    [tool, planned, showPreview],
  )

  const overlapPolys = useMemo(
    () =>
      overlaps.size === 0 ? [] : lots.filter((l) => overlaps.has(l.id)).map((l) => l.polygon),
    [overlaps, lots],
  )

  useEffect(() => {
    chromeRef.current?.set({
      ...emptyChrome(dark),
      showBlocks,
      blocks: blocks.map((b) => ({
        id: b.id,
        code: b.code,
        polygon: b.polygon,
        active: b.id === activeBlockId,
      })),
      preview: previewPolys,
      overlaps: overlapPolys,
      pending: draftRect ?? pendingBlock?.polygon ?? null,
      drawing:
        tool === 'draw' && drawPts.length > 0 ? { points: drawPts, cursor: cursorLL } : null,
      band,
      lasso,
      readout,
    })
  }, [
    dark,
    showBlocks,
    blocks,
    activeBlockId,
    previewPolys,
    overlapPolys,
    draftRect,
    pendingBlock,
    tool,
    drawPts,
    cursorLL,
    band,
    lasso,
    readout,
  ])

  // ── Space pans, L arms the lasso ──────────────────────────────────
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
    const down = (e: KeyboardEvent) => {
      if (isField(e.target)) return
      if (e.code === 'Space') {
        e.preventDefault()
        setPanMode(true)
      }
      if (e.key === 'l' || e.key === 'L') lassoArmed.current = true
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setPanMode(false)
      if (e.key === 'l' || e.key === 'L') lassoArmed.current = false
    }
    const blur = () => {
      setPanMode(false)
      lassoArmed.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // ── selection by click ────────────────────────────────────────────
  const pick = useCallback(
    (x: number, y: number, e: MouseEvent) => {
      const s = useEditor.getState()
      const hit = hitTest(x, y)
      if (!hit) {
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) s.clearSelection()
        return
      }
      s.setActiveBlock(hit.blockId)
      if (e.metaKey || e.ctrlKey) {
        s.toggleSelection(hit.id)
      } else if (e.shiftKey && lastPicked.current) {
        const anchor = s.lots.find((l) => l.id === lastPicked.current)
        if (anchor && anchor.blockId === hit.blockId) {
          const lo = Math.min(anchor.lotNumber, hit.lotNumber)
          const hi = Math.max(anchor.lotNumber, hit.lotNumber)
          s.addSelection(
            s.lots
              .filter(
                (l) => l.blockId === hit.blockId && l.lotNumber >= lo && l.lotNumber <= hi,
              )
              .map((l) => l.id),
          )
        } else {
          s.addSelection([hit.id])
        }
      } else {
        s.setSelection([hit.id])
      }
      lastPicked.current = hit.id
    },
    [hitTest],
  )

  // ── pointer handling ──────────────────────────────────────────────
  const startRef = useRef({ x: 0, y: 0, moved: false })

  const onDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest('[data-editor-handle]')) return
      const p = map.mouseEventToContainerPoint(e)
      startRef.current = { x: p.x, y: p.y, moved: false }

      if (tool === 'block') {
        setMode({ k: 'block', x0: p.x, y0: p.y })
        return
      }
      if (tool === 'draw') return
      if (tool === 'overlay') {
        const s = useEditor.getState()
        const active = s.overlays.find((o) => o.id === s.activeOverlayId)
        if (active && !s.lockedOverlays.has(active.id) && insideOverlay(active.bounds, p, toPt)) {
          s.beginOverlayEdit()
          drag.current.from = toLL(p.x, p.y)
          setMode({ k: 'overlayMove' })
        }
        return
      }

      if (lassoArmed.current) {
        drag.current.pts = [[p.x, p.y]]
        setMode({ k: 'lasso' })
        setLasso([[p.x, p.y]])
        return
      }
      if (hitTest(p.x, p.y)) return // resolved on pointerup as a click
      setMode({ k: 'band', x0: p.x, y0: p.y, subtract: e.altKey })
    },
    [map, tool, toPt, toLL, hitTest],
  )

  const onMove = useCallback(
    (e: PointerEvent) => {
      const p = map.mouseEventToContainerPoint(e)
      const m = modeRef.current
      if (Math.hypot(p.x - startRef.current.x, p.y - startRef.current.y) > CLICK_SLOP) {
        startRef.current.moved = true
      }

      if (tool === 'draw' && m.k === 'idle') {
        setCursorLL(snapRef.current(p.x, p.y))
        return
      }

      const s = useEditor.getState()
      switch (m.k) {
        case 'band':
          setBand({ x0: m.x0, y0: m.y0, x1: p.x, y1: p.y, subtract: m.subtract })
          break

        case 'lasso': {
          drag.current.pts = [...drag.current.pts, [p.x, p.y]]
          setLasso(drag.current.pts)
          break
        }

        case 'block': {
          const rect = rectFromDrag(m.x0, m.y0, p.x, p.y, e.shiftKey, e.altKey, toLL)
          setDraftRect(rect)
          setReadout({
            x: p.x,
            y: p.y,
            lines: [
              `${fmtM(distanceM(rect[0]!, rect[1]!))} × ${fmtM(distanceM(rect[1]!, rect[2]!))}`,
              fmtArea(areaSqm(rect)),
            ],
          })
          break
        }

        case 'vertex': {
          const pb = s.pendingBlock
          if (!pb) break
          const poly = pb.polygon.map((v, i) => (i === m.index ? toLL(p.x, p.y) : v))
          s.setPendingBlock({ ...pb, polygon: poly })
          setReadout({
            x: p.x,
            y: p.y,
            lines: [
              `${fmtM(distanceM(poly[0]!, poly[1]!))} × ${fmtM(distanceM(poly[1]!, poly[2]!))}`,
              fmtArea(areaSqm(poly)),
            ],
          })
          break
        }

        case 'rotate': {
          const pb = s.pendingBlock
          if (!pb) break
          const centre = polygonCentroid(pb.polygon)
          const c = toPt(centre)
          // Measured from where the gesture began, not from the last frame —
          // snapping an incremental delta would swallow every small step.
          const raw = angleAt(c, p)
          const snapped = snapAngle(drag.current.base + (raw - drag.current.angle))
          const delta = snapped - pb.rotationDeg
          if (Math.abs(delta) >= 0.001) {
            s.setPendingBlock({
              ...pb,
              rotationDeg: snapped,
              polygon: rotatePolygon(pb.polygon, centre, delta),
            })
          }
          setReadout({ x: p.x, y: p.y, lines: [`${snapped.toFixed(0)}°`] })
          break
        }

        case 'overlayMove': {
          const o = s.overlays.find((x) => x.id === s.activeOverlayId)
          if (!o) break
          const now = toLL(p.x, p.y)
          const dLat = now[0] - drag.current.from[0]
          const dLng = now[1] - drag.current.from[1]
          s.overlayLive(o.id, {
            bounds: [
              [o.bounds[0][0] + dLat, o.bounds[0][1] + dLng],
              [o.bounds[1][0] + dLat, o.bounds[1][1] + dLng],
            ],
          })
          drag.current.from = now
          break
        }

        case 'overlayScale': {
          const o = s.overlays.find((x) => x.id === s.activeOverlayId)
          if (!o) break
          s.overlayLive(o.id, {
            bounds: scaleBounds(o.bounds, m.corner, toLL(p.x, p.y), e.shiftKey),
          })
          break
        }

        case 'overlayRotate': {
          const o = s.overlays.find((x) => x.id === s.activeOverlayId)
          if (!o) break
          const c = toPt(boundsCentre(o.bounds))
          const raw = angleAt(c, p)
          const next = snapAngle(drag.current.base + (raw - drag.current.angle))
          s.overlayLive(o.id, { rotationDeg: next })
          setReadout({ x: p.x, y: p.y, lines: [`${next.toFixed(0)}°`] })
          break
        }

        default:
          break
      }
    },
    [map, tool, toLL, toPt],
  )

  const onUp = useCallback(
    (e: PointerEvent) => {
      const p = map.mouseEventToContainerPoint(e)
      const m = modeRef.current
      const s = useEditor.getState()
      const moved = startRef.current.moved

      if (m.k === 'band') {
        if (moved) {
          const ids = inBox(m.x0, m.y0, p.x, p.y)
          if (m.subtract) s.subtractSelection(ids)
          else if (e.shiftKey || e.metaKey || e.ctrlKey) s.addSelection(ids)
          else s.setSelection(ids)
        } else {
          pick(p.x, p.y, e)
        }
      } else if (m.k === 'lasso') {
        if (drag.current.pts.length > 2) {
          const ids = inLasso(drag.current.pts)
          if (e.altKey) s.subtractSelection(ids)
          else if (e.shiftKey || e.metaKey || e.ctrlKey) s.addSelection(ids)
          else s.setSelection(ids)
        }
      } else if (m.k === 'block') {
        const rect = draftRectRef.current
        if (moved && rect) {
          s.setPendingBlock({
            polygon: rect,
            rotationDeg: 0,
            code: '',
            name: '',
            defaultTierId: s.grid.tierId,
          })
        }
      } else if (m.k === 'idle') {
        if (!moved && (tool === 'select' || tool === 'grid')) pick(p.x, p.y, e)
      } else if (
        m.k === 'overlayMove' ||
        m.k === 'overlayScale' ||
        m.k === 'overlayRotate'
      ) {
        s.commitOverlayEdit()
      }

      setMode({ k: 'idle' })
      setBand(null)
      setLasso(null)
      setDraftRect(null)
      setReadout(null)
    },
    [map, inBox, inLasso, pick, tool],
  )

  // ── free-hand drawing ─────────────────────────────────────────────
  const closeShape = useCallback(() => {
    const s = useEditor.getState()
    if (drawPts.length < 3) return
    const tier = s.grid.tierId ? tiersById.get(s.grid.tierId) : undefined
    if (tier) s.addFreeLot(drawPts, tier)
    setDrawPts([])
  }, [drawPts, tiersById])

  useEffect(() => {
    if (tool !== 'draw') setDrawPts([])
  }, [tool])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tool !== 'draw') return
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return
      if (e.key === 'Enter') closeShape()
      if (e.key === 'Backspace') {
        e.preventDefault()
        setDrawPts((v) => v.slice(0, -1))
      }
      if (e.key === 'Escape') setDrawPts([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, closeShape])

  // ── native listener wiring ────────────────────────────────────────
  const h = useRef({ onDown, onMove, onUp, tool, closeShape })
  h.current = { onDown, onMove, onUp, tool, closeShape }

  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const down = (e: PointerEvent) => h.current.onDown(e)
    const move = (e: PointerEvent) => h.current.onMove(e)
    const up = (e: PointerEvent) => h.current.onUp(e)
    const click = (e: MouseEvent) => {
      if (h.current.tool !== 'draw') return
      const p = map.mouseEventToContainerPoint(e)
      setDrawPts((v) => {
        const next = snapRef.current(p.x, p.y)
        const last = v[v.length - 1]
        if (last && Math.abs(last[0] - next[0]) < 1e-9 && Math.abs(last[1] - next[1]) < 1e-9) {
          return v
        }
        return [...v, next]
      })
    }
    const dbl = (e: MouseEvent) => {
      e.preventDefault()
      if (h.current.tool === 'draw') h.current.closeShape()
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('click', click)
    el.addEventListener('dblclick', dbl)
    L.DomEvent.disableClickPropagation(el)
    L.DomEvent.on(el, 'pointerdown mousemove', L.DomEvent.stopPropagation)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('click', click)
      el.removeEventListener('dblclick', dbl)
    }
  }, [map])

  // ── DOM handles ───────────────────────────────────────────────────
  void tick
  const activeOverlay = overlays.find((o) => o.id === activeOverlayId)
  const overlayCorners =
    tool === 'overlay' && activeOverlay && !locked.has(activeOverlay.id)
      ? cornerPoints(activeOverlay.bounds, activeOverlay.rotationDeg, toPt)
      : null

  const selectionChip = useMemo(() => {
    if (selection.size === 0) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    for (const l of lots) {
      if (!selection.has(l.id)) continue
      const p = toPt(l.centroid)
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
    }
    if (!Number.isFinite(minX)) return null
    return { x: (minX + maxX) / 2, y: minY - 14 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, lots, toPt, tick])

  const cursor = panMode
    ? 'grab'
    : tool === 'block' || tool === 'draw'
      ? 'crosshair'
      : tool === 'overlay'
        ? 'move'
        : 'default'

  const startRotate = (e: PointerEvent, centre: L.Point, base: number, next: () => Mode) => {
    const p = map.mouseEventToContainerPoint(e)
    drag.current.angle = angleAt(centre, p)
    drag.current.base = base
    setMode(next())
  }

  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[450]" aria-hidden />
      <div
        ref={surfaceRef}
        className={cn('absolute inset-0 z-[460]', panMode && 'pointer-events-none')}
        style={{ cursor, touchAction: 'none' }}
      >
        {tool === 'block' &&
          pendingBlock &&
          pendingBlock.polygon.map((v, i) => {
            const p = toPt(v)
            return (
              <Handle
                key={i}
                x={p.x}
                y={p.y}
                title="Drag to reshape this corner"
                onDown={() => setMode({ k: 'vertex', index: i })}
              />
            )
          })}
        {tool === 'block' && pendingBlock && (
          <RotationHandle
            anchor={edgeAnchor(pendingBlock.polygon, toPt)}
            onDown={(e, centre) =>
              startRotate(e, centre, pendingBlock.rotationDeg, () => ({ k: 'rotate' }))
            }
          />
        )}

        {overlayCorners?.map((p, i) => (
          <Handle
            key={`ov${i}`}
            x={p.x}
            y={p.y}
            title="Drag to scale — Shift keeps the aspect ratio"
            onDown={() => {
              useEditor.getState().beginOverlayEdit()
              setMode({ k: 'overlayScale', corner: i })
            }}
          />
        ))}
        {overlayCorners && (
          <RotationHandle
            anchor={{
              x: (overlayCorners[0]!.x + overlayCorners[1]!.x) / 2,
              y: (overlayCorners[0]!.y + overlayCorners[1]!.y) / 2,
              cx: (overlayCorners[0]!.x + overlayCorners[2]!.x) / 2,
              cy: (overlayCorners[0]!.y + overlayCorners[2]!.y) / 2,
            }}
            onDown={(e, centre) => {
              useEditor.getState().beginOverlayEdit()
              startRotate(e, centre, activeOverlay?.rotationDeg ?? 0, () => ({
                k: 'overlayRotate',
              }))
            }}
          />
        )}

        {selectionChip && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-full border border-gold bg-surface/95 px-2.5 py-1 font-mono text-[11px] font-semibold text-gold-deep shadow-md backdrop-blur dark:text-gold"
            style={{ left: selectionChip.x, top: selectionChip.y }}
          >
            {selection.size.toLocaleString()} selected
          </div>
        )}

        {tool === 'draw' && drawPts.length > 0 && (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-line bg-surface/92 px-3 py-1 text-[11.5px] text-muted shadow-sm backdrop-blur">
            {drawPts.length} point{drawPts.length === 1 ? '' : 's'} · double-click or Enter to
            close · Backspace removes the last
          </div>
        )}

        {panMode && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface/92 px-3 py-1 text-[11.5px] text-muted shadow-sm backdrop-blur">
            Pan mode — release Space to return to the tool
          </div>
        )}
      </div>
    </>
  )
}

// ── small pieces ─────────────────────────────────────────────────────

/**
 * The surface stops pointerdown natively to keep Leaflet's pan out of the way,
 * which also stops React's delegated listener at the root from ever seeing it.
 * Handles therefore bind natively too.
 */
function useHandleDown(fn: (e: PointerEvent) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const cb = useRef(fn)
  cb.current = fn
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = (e: PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      cb.current(e)
    }
    el.addEventListener('pointerdown', h)
    return () => el.removeEventListener('pointerdown', h)
  }, [])
  return ref
}

function Handle({
  x,
  y,
  title,
  onDown,
}: {
  x: number
  y: number
  title: string
  onDown: () => void
}) {
  const ref = useHandleDown(() => onDown())
  return (
    <div
      ref={ref}
      data-editor-handle
      title={title}
      className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-[3px] border-2 border-gold bg-surface shadow-sm"
      style={{ left: x, top: y }}
    />
  )
}

interface Anchor {
  x: number
  y: number
  cx: number
  cy: number
}

function RotationHandle({
  anchor,
  onDown,
}: {
  anchor: Anchor
  onDown: (e: PointerEvent, centre: L.Point) => void
}) {
  const dx = anchor.x - anchor.cx
  const dy = anchor.y - anchor.cy
  const len = Math.hypot(dx, dy) || 1
  const hx = anchor.x + (dx / len) * 26
  const hy = anchor.y + (dy / len) * 26
  const ref = useHandleDown((e) => onDown(e, L.point(anchor.cx, anchor.cy)))
  return (
    <>
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
        <line
          x1={anchor.x}
          y1={anchor.y}
          x2={hx}
          y2={hy}
          stroke="var(--color-gold)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      </svg>
      <div
        ref={ref}
        data-editor-handle
        title="Drag to rotate — snaps to 1°, and to 0/45/90"
        className="absolute size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-gold bg-surface shadow-sm"
        style={{ left: hx, top: hy }}
      />
    </>
  )
}

// ── geometry used only by the pointer layer ──────────────────────────

const angleAt = (centre: L.Point, p: L.Point) =>
  (Math.atan2(p.x - centre.x, centre.y - p.y) * 180) / Math.PI

function edgeAnchor(poly: Polygon, toPt: (ll: LatLng) => L.Point): Anchor {
  const a = toPt(poly[0]!)
  const b = toPt(poly[1]!)
  const c = toPt(polygonCentroid(poly))
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, cx: c.x, cy: c.y }
}

function rectFromDrag(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  square: boolean,
  fromCentre: boolean,
  toLL: (x: number, y: number) => LatLng,
): Polygon {
  let dx = x1 - x0
  let dy = y1 - y0
  if (square) {
    const s = Math.max(Math.abs(dx), Math.abs(dy))
    dx = (dx < 0 ? -1 : 1) * s
    dy = (dy < 0 ? -1 : 1) * s
  }
  const ax = fromCentre ? x0 - dx : x0
  const ay = fromCentre ? y0 - dy : y0
  const left = Math.min(ax, x0 + dx)
  const right = Math.max(ax, x0 + dx)
  const top = Math.min(ay, y0 + dy)
  const bottom = Math.max(ay, y0 + dy)
  return [toLL(left, top), toLL(right, top), toLL(right, bottom), toLL(left, bottom)]
}

/** 1° increments, with 0/45/90 grabbing anything within 3°. */
function snapAngle(deg: number): number {
  const a = Math.round(((deg % 360) + 360) % 360)
  for (const cardinal of [0, 45, 90, 135, 180, 225, 270, 315, 360]) {
    if (Math.abs(a - cardinal) <= 3) return cardinal % 360
  }
  return a
}

const boundsCentre = (b: Bounds): LatLng => [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]

function cornerPoints(b: Bounds, rotationDeg: number, toPt: (ll: LatLng) => L.Point): L.Point[] {
  const nw = toPt([b[1][0], b[0][1]])
  const ne = toPt([b[1][0], b[1][1]])
  const se = toPt([b[0][0], b[1][1]])
  const sw = toPt([b[0][0], b[0][1]])
  const c = toPt(boundsCentre(b))
  const r = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [nw, ne, se, sw].map((p) => {
    const dx = p.x - c.x
    const dy = p.y - c.y
    return L.point(c.x + dx * cos - dy * sin, c.y + dx * sin + dy * cos)
  })
}

function insideOverlay(b: Bounds, p: L.Point, toPt: (ll: LatLng) => L.Point): boolean {
  const nw = toPt([b[1][0], b[0][1]])
  const se = toPt([b[0][0], b[1][1]])
  return (
    p.x >= Math.min(nw.x, se.x) &&
    p.x <= Math.max(nw.x, se.x) &&
    p.y >= Math.min(nw.y, se.y) &&
    p.y <= Math.max(nw.y, se.y)
  )
}

/** Corner order matches `cornerPoints`: NW, NE, SE, SW. */
function scaleBounds(b: Bounds, corner: number, to: LatLng, keepRatio: boolean): Bounds {
  let sLat = b[0][0]
  let wLng = b[0][1]
  let nLat = b[1][0]
  let eLng = b[1][1]
  const ratio = (nLat - sLat) / (eLng - wLng || 1)
  if (corner === 0) {
    nLat = to[0]
    wLng = to[1]
  } else if (corner === 1) {
    nLat = to[0]
    eLng = to[1]
  } else if (corner === 2) {
    sLat = to[0]
    eLng = to[1]
  } else {
    sLat = to[0]
    wLng = to[1]
  }
  if (keepRatio) {
    const height = ratio * (eLng - wLng)
    if (corner === 0 || corner === 1) nLat = sLat + height
    else sLat = nLat - height
  }
  return [
    [Math.min(sLat, nLat), Math.min(wLng, eLng)],
    [Math.max(sLat, nLat), Math.max(wLng, eLng)],
  ]
}
