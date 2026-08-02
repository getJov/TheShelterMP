import { useEffect, useRef } from 'react'
import type { LotId } from '@/domain'
import { useGoogleMap } from '@/features/map/google/map-view'
import type { MapPointerEvent } from '@/features/map/google/types'
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
  crossfadeKey: string
  onPick: (id: LotId | null, ev: MapPointerEvent) => void
  onHover: (id: LotId | null, ev: MapPointerEvent | null) => void
  onStats?: (ms: number, lots: number) => void
}) {
  const map = useGoogleMap()
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
