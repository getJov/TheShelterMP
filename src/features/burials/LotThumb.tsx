import { useMemo } from 'react'
import type { Lot } from '@/domain'
import { indexes } from '@/stores/dataset'
import { cn } from '@/lib/utils'

/**
 * A block diagram, not a map. The crew needs to know which rectangle in the
 * block to walk to; a tile-server map at this size tells them nothing and
 * pulling Leaflet into a printable sheet would be worse than useless.
 */
export function LotThumb({
  lot,
  size = 96,
  className,
}: {
  lot: Lot
  size?: number
  className?: string
}) {
  const geom = useMemo(() => {
    const siblings = (indexes().lotsByBlock.get(lot.blockId as string) ?? []) as Lot[]
    const pts = siblings.flatMap((l) => l.polygon)
    if (pts.length === 0) return null
    const lats = pts.map((p) => p[0])
    const lngs = pts.map((p) => p[1])
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const w = Math.max(1e-9, maxLng - minLng)
    const h = Math.max(1e-9, maxLat - minLat)
    const project = (p: [number, number]) =>
      `${((p[1] - minLng) / w) * 100},${((maxLat - p[0]) / h) * 100}`
    return {
      aspect: w / h,
      shapes: siblings.map((l) => ({
        id: l.id,
        points: l.polygon.map(project).join(' '),
        mine: l.id === lot.id,
      })),
    }
  }, [lot])

  if (!geom) return null

  const height = Math.round(size / Math.max(0.35, Math.min(3, geom.aspect)))

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      width={size}
      height={Math.max(48, Math.min(size * 1.6, height))}
      className={cn(
        'shrink-0 rounded border border-line bg-surface-2',
        className,
      )}
      role="img"
      aria-label="Block diagram"
    >
      {geom.shapes.map((s) => (
        <polygon
          key={s.id}
          points={s.points}
          className={cn(
            s.mine
              ? 'fill-gold/70 stroke-gold-deep dark:stroke-gold'
              : 'fill-transparent stroke-line',
          )}
          strokeWidth={s.mine ? 1.6 : 0.7}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
