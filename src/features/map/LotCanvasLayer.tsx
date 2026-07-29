import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type L from 'leaflet'
import type { LotId } from '@/domain'
import { LotCanvas, type CanvasFlags, type LotRecord } from './lot-canvas'
import type { LotPaint } from './paint'

/**
 * The thin React shell around `LotCanvas`. It creates the layer once and
 * pushes props onto it imperatively — no reconciliation, no per-lot nodes.
 */
export function LotCanvasLayer({
  records,
  paints,
  flags,
  active,
  crossfadeKey,
  onPick,
  onHover,
  onStats,
}: {
  records: LotRecord[]
  paints: LotPaint[]
  flags: CanvasFlags
  active: boolean
  /** Change this value to crossfade the canvas instead of snapping. */
  crossfadeKey: string
  onPick: (id: LotId | null, ev: L.LeafletMouseEvent) => void
  onHover: (id: LotId | null, ev: L.LeafletMouseEvent | null) => void
  onStats?: (ms: number, lots: number) => void
}) {
  const map = useMap()
  const layerRef = useRef<LotCanvas | null>(null)

  const pick = useRef(onPick)
  const hover = useRef(onHover)
  const stats = useRef(onStats)
  pick.current = onPick
  hover.current = onHover
  stats.current = onStats

  useEffect(() => {
    const layer = new LotCanvas({
      onPick: (id, ev) => pick.current(id, ev),
      onHover: (id, ev) => hover.current(id, ev),
      onStats: (ms, n) => stats.current?.(ms, n),
    })
    layerRef.current = layer
    layer.addTo(map)
    return () => {
      layer.remove()
      layerRef.current = null
    }
  }, [map])

  useEffect(() => {
    layerRef.current?.setLots(records, paints)
    // paints has its own effect; this one exists for geometry changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records])

  const prevKey = useRef(crossfadeKey)
  useEffect(() => {
    const changed = prevKey.current !== crossfadeKey
    prevKey.current = crossfadeKey
    layerRef.current?.setPaints(paints, changed)
  }, [paints, crossfadeKey])

  useEffect(() => {
    layerRef.current?.setFlags(flags)
  }, [flags])

  useEffect(() => {
    layerRef.current?.setActive(active)
  }, [active])

  return null
}
