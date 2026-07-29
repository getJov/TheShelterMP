import { useEffect, useMemo, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  LOT_STATUSES,
  STATUS_APPEARANCE,
  ZOOM,
  type Block,
  type LotStatus,
} from '@/domain'
import { boundsOf, toLatLngBounds } from '@/lib/geo'
import { useMapStore } from '@/stores/map'
import type { MapLot } from './use-map-data'

/**
 * Clustering by BLOCK, not by proximity.
 *
 * `leaflet.markercluster` groups by screen distance, which would split
 * Garden of Peace down the middle at some zooms. The client's request was
 * "the small lots collapse into one block" — so blockId is the grouping key.
 */

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
  const map = useMap()
  const zoom = useMapStore((s) => s.zoom)
  const groupRef = useRef<L.LayerGroup | null>(null)

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
    const group = L.layerGroup().addTo(map)
    groupRef.current = group
    return () => {
      group.remove()
      groupRef.current = null
    }
  }, [map])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.clearLayers()
    if (zoom >= ZOOM.lotsVisible) return

    const flyTo = (block: Block) => {
      map.flyToBounds(toLatLngBounds(boundsOf([block.polygon])), {
        padding: [60, 60],
        duration: 0.8,
      })
    }

    if (zoom < ZOOM.clusterOnly) {
      // This park is only ~150 m across, so at zoom 15–16 three block cards
      // land on top of each other. Nudge them apart in screen space before
      // placing them; the geometry underneath is unaffected.
      const placed = deCollide(
        map,
        summaries.map((s) => ({
          latlng: L.latLng(s.block.centroid[0], s.block.centroid[1]),
          w: clusterWidth(s.count),
          h: 54,
        })),
      )
      for (const [i, s] of summaries.entries()) {
        const marker = L.marker(placed[i]!, {
          icon: L.divIcon({
            className: 'shelter-cluster-wrap',
            html: clusterHtml(s),
            iconSize: [clusterWidth(s.count), 52],
            iconAnchor: [clusterWidth(s.count) / 2, 26],
          }),
          keyboard: true,
          title: `${s.block.code} — ${s.count} lots`,
          riseOnHover: true,
        })
        marker.on('click', () => flyTo(s.block))
        group.addLayer(marker)
      }
    } else {
      // 17 – 17.99: block outlines tinted by dominant tier, count label only.
      for (const s of summaries) {
        const poly = L.polygon(s.block.polygon, {
          // MapContainer runs with preferCanvas; force SVG for these three so
          // the class-based fade in map.css actually applies.
          renderer: L.svg(),
          color: s.stroke,
          weight: 1.5,
          fillColor: s.fill,
          fillOpacity: 0.5,
          className: 'shelter-block-outline',
        })
        poly.on('click', () => flyTo(s.block))
        group.addLayer(poly)
        group.addLayer(
          L.marker(L.latLng(s.block.centroid[0], s.block.centroid[1]), {
            interactive: false,
            icon: L.divIcon({
              className: 'shelter-cluster-wrap',
              html: `<div class="shelter-block-label"><b>${esc(s.block.code)}</b><span>${s.count} lots</span></div>`,
              iconSize: [86, 34],
              iconAnchor: [43, 17],
            }),
          }),
        )
      }
    }

    // Entrance: a CSS scale-and-fade on the divIcon, not Framer Motion —
    // these nodes live inside Leaflet's marker pane.
    const raf = requestAnimationFrame(() => {
      for (const el of map
        .getPanes()
        .markerPane.querySelectorAll('.shelter-cluster, .shelter-block-label')) {
        el.classList.add('is-in')
      }
      for (const el of map
        .getPanes()
        .overlayPane.querySelectorAll('.shelter-block-outline')) {
        el.classList.add('is-in')
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [zoom, summaries, map])

  return null
}

const clusterWidth = (count: number) => Math.round(88 + Math.min(46, count / 9))

/** Iterative screen-space separation. Three markers, six passes — trivial. */
function deCollide(
  map: L.Map,
  items: { latlng: L.LatLng; w: number; h: number }[],
): L.LatLng[] {
  const pts = items.map((i) => map.latLngToContainerPoint(i.latlng))
  for (let pass = 0; pass < 6; pass++) {
    let moved = false
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        const minX = (items[a]!.w + items[b]!.w) / 2 + 8
        const minY = (items[a]!.h + items[b]!.h) / 2 + 8
        const dx = pts[b]!.x - pts[a]!.x
        const dy = pts[b]!.y - pts[a]!.y
        if (Math.abs(dx) >= minX || Math.abs(dy) >= minY) continue
        // Push along the axis needing the smaller correction.
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
  return pts.map((p) => map.containerPointToLatLng(p))
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  )
}

/**
 * Block code, lot count and a thin proportional status bar. That bar is what
 * makes the cluster informative rather than decorative — the client can read
 * a block's sales from across the room.
 */
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
