import { useEffect, useMemo, useRef } from 'react'
import {
  LOT_STATUSES,
  STATUS_APPEARANCE,
  ZOOM,
  type Block,
  type LotStatus,
} from '@/domain'
import { boundsOf } from '@/lib/geo'
import { useGoogleMap } from '@/features/map/google/map-view'
import {
  containerPointToLatLng,
  flyMapToBounds,
  latLngToContainerPoint,
  latLngToGoogle,
} from '@/features/map/google/helpers'
import { useMapStore } from '@/stores/map'
import type { MapLot } from './use-map-data'

interface BlockSummary {
  block: Block
  count: number
  mix: { status: LotStatus; n: number }[]
  fill: string
  stroke: string
}

export function BlockClusterLayer({
  blocks,
  lots,
}: {
  blocks: Block[]
  lots: MapLot[]
}) {
  const map = useGoogleMap()
  const zoom = useMapStore((s) => s.zoom)
  const polygonsRef = useRef<google.maps.Polygon[]>([])
  const overlaysRef = useRef<google.maps.OverlayView[]>([])

  const summaries = useMemo<BlockSummary[]>(() => {
    const byBlock = new Map<string, MapLot[]>()
    for (const l of lots) {
      const arr = byBlock.get(l.lot.blockId)
      if (arr) arr.push(l)
      else byBlock.set(l.lot.blockId, [l])
    }
    return blocks.map((block) => {
      const list = byBlock.get(block.id) ?? []
      const counts = new Map<LotStatus, number>()
      const tierCount = new Map<string, number>()
      for (const l of list) {
        counts.set(l.lot.status, (counts.get(l.lot.status) ?? 0) + 1)
        tierCount.set(l.lot.tierId, (tierCount.get(l.lot.tierId) ?? 0) + 1)
      }
      let dominant: MapLot['tier'] | undefined
      let best = -1
      for (const l of list) {
        const n = tierCount.get(l.lot.tierId) ?? 0
        if (n > best) {
          best = n
          dominant = l.tier
        }
      }
      return {
        block,
        count: list.length,
        mix: LOT_STATUSES.map((status) => ({ status, n: counts.get(status) ?? 0 })).filter(
          (m) => m.n > 0,
        ),
        fill: dominant?.appearance.fillColor ?? STATUS_APPEARANCE.not_for_sale.color,
        stroke: dominant?.appearance.strokeColor ?? STATUS_APPEARANCE.not_for_sale.color,
      }
    })
  }, [blocks, lots])

  useEffect(() => {
    for (const p of polygonsRef.current) p.setMap(null)
    for (const o of overlaysRef.current) o.setMap(null)
    polygonsRef.current = []
    overlaysRef.current = []

    if (zoom >= ZOOM.lotsVisible) return

    const flyTo = (block: Block) => {
      flyMapToBounds(map, boundsOf([block.polygon]), { padding: [60, 60] })
    }

    if (zoom < ZOOM.clusterOnly) {
      const placed = deCollide(
        map,
        summaries.map((s) => ({
          ll: s.block.centroid,
          w: clusterWidth(s.count),
          h: 54,
        })),
      )
      for (const [i, s] of summaries.entries()) {
        overlaysRef.current.push(
          htmlOverlay(map, placed[i]!, clusterHtml(s), () => flyTo(s.block)),
        )
      }
    } else {
      for (const s of summaries) {
        polygonsRef.current.push(
          new google.maps.Polygon({
            map,
            paths: s.block.polygon.map((p) => latLngToGoogle(p)),
            strokeColor: s.stroke,
            strokeWeight: 1.5,
            fillColor: s.fill,
            fillOpacity: 0.5,
            clickable: true,
          }),
        )
        polygonsRef.current.at(-1)!.addListener('click', () => flyTo(s.block))
        overlaysRef.current.push(
          htmlOverlay(
            map,
            s.block.centroid,
            `<div class="shelter-block-label"><b>${esc(s.block.code)}</b><span>${s.count} lots</span></div>`,
            () => flyTo(s.block),
          ),
        )
      }
    }

    const raf = requestAnimationFrame(() => {
      for (const el of map.getDiv().querySelectorAll('.shelter-cluster, .shelter-block-label')) {
        el.classList.add('is-in')
      }
    })

    return () => {
      cancelAnimationFrame(raf)
      for (const p of polygonsRef.current) p.setMap(null)
      for (const o of overlaysRef.current) o.setMap(null)
      polygonsRef.current = []
      overlaysRef.current = []
    }
  }, [zoom, summaries, map])

  return null
}

const clusterWidth = (count: number) => Math.round(88 + Math.min(46, count / 9))

function htmlOverlay(
  map: google.maps.Map,
  ll: [number, number],
  html: string,
  onClick: () => void,
): google.maps.OverlayView {
  const overlay = new google.maps.OverlayView()
  let el: HTMLDivElement | null = null
  overlay.onAdd = () => {
    el = document.createElement('div')
    el.className = 'shelter-cluster-wrap'
    el.innerHTML = html
    el.style.cursor = 'pointer'
    el.style.position = 'absolute'
    el.addEventListener('click', onClick)
    overlay.getPanes()?.overlayMouseTarget.appendChild(el)
  }
  overlay.draw = function draw() {
    if (!el) return
    const proj = overlay.getProjection()
    if (!proj) return
    // Div-pixel space: pane children must be placed in the pane's own
    // coordinates so drags carry them without waiting for the next draw().
    const p = proj.fromLatLngToDivPixel(latLngToGoogle(ll))
    if (!p) return
    el.style.left = `${p.x}px`
    el.style.top = `${p.y}px`
    el.style.transform = 'translate(-50%, -50%)'
  }
  overlay.onRemove = () => el?.remove()
  overlay.setMap(map)
  return overlay
}

function deCollide(
  map: google.maps.Map,
  items: { ll: [number, number]; w: number; h: number }[],
): [number, number][] {
  const pts = items.map((i) => latLngToContainerPoint(map, i.ll))
  for (let pass = 0; pass < 6; pass++) {
    let moved = false
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        const minX = (items[a]!.w + items[b]!.w) / 2 + 8
        const minY = (items[a]!.h + items[b]!.h) / 2 + 8
        const dx = pts[b]!.x - pts[a]!.x
        const dy = pts[b]!.y - pts[a]!.y
        if (Math.abs(dx) >= minX || Math.abs(dy) >= minY) continue
        const pushX = minX - Math.abs(dx)
        const pushY = minY - Math.abs(dy)
        if (pushY <= pushX) {
          const s = (dy >= 0 ? 1 : -1) * (pushY / 2)
          pts[a]!.y -= s
          pts[b]!.y += s
        } else {
          const s = (dx >= 0 ? 1 : -1) * (pushX / 2)
          pts[a]!.x -= s
          pts[b]!.x += s
        }
        moved = true
      }
    }
    if (!moved) break
  }
  return pts.map((p) => containerPointToLatLng(map, p.x, p.y))
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  )
}

function clusterHtml(s: BlockSummary): string {
  const total = s.mix.reduce((a, b) => a + b.n, 0) || 1
  const bar = s.mix
    .map(
      (m) =>
        `<i style="width:${((m.n / total) * 100).toFixed(2)}%;background:${
          STATUS_APPEARANCE[m.status].color
        }" title="${STATUS_APPEARANCE[m.status].label}: ${m.n}"></i>`,
    )
    .join('')
  return `<div class="shelter-cluster" style="width:${clusterWidth(s.count)}px">
    <span class="shelter-cluster-code">${esc(s.block.code)}</span>
    <span class="shelter-cluster-count">${s.count} lots</span>
    <span class="shelter-cluster-bar">${bar}</span>
  </div>`
}
