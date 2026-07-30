import type { Block, BlockId, Bounds, LatLng, Lot, LotId, MapOverlay, OverlayId, Polygon } from '@/domain'
import { areaSqm, boundsOf, offsetMetres, polygonCentroid } from '@/lib/geo'
import { fromLocal, toLocal } from '@/lib/grid-generator'

export type AlignmentTarget = 'layout' | 'block' | 'lots' | 'overlay'

export interface GeometryDraft {
  blocks: Block[]
  lots: Lot[]
  overlays: MapOverlay[]
}

export interface AlignmentSelection {
  target: AlignmentTarget
  blockId: BlockId | null
  lotIds: LotId[]
  overlayId: OverlayId | null
}

export interface AlignmentTransform {
  deltaLat: number
  deltaLng: number
  rotationDeg: number
  scale: number
  scaleX: number
  scaleY: number
}

export interface AlignmentFrame {
  polygon: Polygon
  pivot: LatLng
  label: string
  count: number
  rotationDeg: number
}

export const identityAlignmentTransform = (): AlignmentTransform => ({
  deltaLat: 0,
  deltaLng: 0,
  rotationDeg: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
})

export type AlignmentResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface AlignmentResizeDrag {
  handle: AlignmentResizeHandle
  baseFrame: AlignmentFrame
  baseHandle: LatLng
  baseAnchor: LatLng
  fixedAnchor: LatLng
  startTransform: AlignmentTransform
}

export function alignmentFrame(
  draft: GeometryDraft,
  selection: AlignmentSelection,
): AlignmentFrame | null {
  if (selection.target === 'layout') {
    const polygons = draft.blocks.map((b) => b.polygon)
    if (polygons.length === 0) return null
    const polygon = polygonFromBounds(boundsOf(polygons))
    return {
      polygon,
      pivot: polygonCentroid(polygon),
      label: 'Entire cemetery layout',
      count: draft.blocks.length,
      rotationDeg: 0,
    }
  }

  if (selection.target === 'block' && selection.blockId) {
    const block = draft.blocks.find((b) => b.id === selection.blockId)
    if (!block) return null
    return {
      polygon: block.polygon,
      pivot: polygonCentroid(block.polygon),
      label: `Block ${block.code}`,
      count: draft.lots.filter((l) => l.blockId === block.id).length,
      rotationDeg: polygonRotationDeg(block.polygon),
    }
  }

  if (selection.target === 'lots') {
    const ids = new Set(selection.lotIds)
    const lots = draft.lots.filter((l) => ids.has(l.id))
    if (lots.length === 0) return null
    const polygon = polygonFromBounds(boundsOf(lots.map((l) => l.polygon)))
    return {
      polygon,
      pivot: polygonCentroid(polygon),
      label: `${lots.length.toLocaleString()} selected lot${lots.length === 1 ? '' : 's'}`,
      count: lots.length,
      rotationDeg: 0,
    }
  }

  if (selection.target === 'overlay' && selection.overlayId) {
    const overlay = draft.overlays.find((o) => o.id === selection.overlayId)
    if (!overlay) return null
    const boundsPolygon = polygonFromBounds(overlay.bounds)
    const pivot = polygonCentroid(boundsPolygon)
    const polygon = boundsPolygon.map((point) =>
      transformPoint(point, pivot, {
        ...identityAlignmentTransform(),
        rotationDeg: overlay.rotationDeg,
      }),
    )
    return {
      polygon,
      pivot,
      label: `Site plan "${overlay.name}"`,
      count: 1,
      rotationDeg: overlay.rotationDeg,
    }
  }

  return null
}

export function applyAlignmentTransform(
  base: GeometryDraft,
  selection: AlignmentSelection,
  transform: AlignmentTransform,
  now: string,
): GeometryDraft {
  if (selection.target === 'overlay') {
    return alignOverlay(base, selection, transform, now)
  }

  const frame = alignmentFrame(base, selection)
  if (!frame) return base

  const lotIds = new Set(selection.lotIds)
  const shouldTransformBlock = (block: Block) => {
    if (selection.target === 'layout') return true
    return selection.target === 'block' && block.id === selection.blockId
  }
  const shouldTransformLot = (lot: Lot) => {
    if (selection.target === 'layout') return true
    if (selection.target === 'block') return lot.blockId === selection.blockId
    return selection.target === 'lots' && lotIds.has(lot.id)
  }

  return {
    blocks: base.blocks.map((block) =>
      shouldTransformBlock(block)
        ? transformBlockGeometry(block, frame.pivot, transform, now, frame.rotationDeg)
        : block,
    ),
    lots: base.lots.map((lot) =>
      shouldTransformLot(lot)
        ? transformLotGeometry(
            lot,
            frame.pivot,
            lotPreservingTransform(transform),
            now,
            frame.rotationDeg,
          )
        : lot,
    ),
    overlays: base.overlays,
  }
}

function lotPreservingTransform(transform: AlignmentTransform): AlignmentTransform {
  return {
    ...transform,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
  }
}

export function nudgeTransformMeters(
  transform: AlignmentTransform,
  pivot: LatLng,
  eastM: number,
  northM: number,
): AlignmentTransform {
  const nudged = offsetMetres(pivot, eastM, northM)
  return {
    ...transform,
    deltaLat: transform.deltaLat + nudged[0] - pivot[0],
    deltaLng: transform.deltaLng + nudged[1] - pivot[1],
  }
}

function alignOverlay(
  base: GeometryDraft,
  selection: AlignmentSelection,
  transform: AlignmentTransform,
  now: string,
): GeometryDraft {
  const overlayId = selection.overlayId
  if (!overlayId) return base

  return {
    blocks: base.blocks,
    lots: base.lots,
    overlays: base.overlays.map((overlay) => {
      if (overlay.id !== overlayId) return overlay
      const pivot = polygonCentroid(polygonFromBounds(overlay.bounds))
      const polygon = polygonFromBounds(overlay.bounds).map((point) =>
        transformPoint(point, pivot, {
          deltaLat: transform.deltaLat,
          deltaLng: transform.deltaLng,
          rotationDeg: 0,
          scale: transform.scale,
          scaleX: transform.scaleX,
          scaleY: transform.scaleY,
        }),
      )
      return {
        ...overlay,
        bounds: boundsOf([polygon]),
        rotationDeg: overlay.rotationDeg + transform.rotationDeg,
        updatedAt: now,
      }
    }),
  }
}

function transformBlockGeometry(
  block: Block,
  pivot: LatLng,
  transform: AlignmentTransform,
  now: string,
  axisRotationDeg: number,
): Block {
  const polygon = block.polygon.map((point) =>
    transformPoint(point, pivot, transform, axisRotationDeg),
  )
  return {
    ...block,
    polygon,
    centroid: polygonCentroid(polygon),
    grid: block.grid
      ? { ...block.grid, rotationDeg: block.grid.rotationDeg + transform.rotationDeg }
      : block.grid,
    updatedAt: now,
  }
}

function transformLotGeometry(
  lot: Lot,
  pivot: LatLng,
  transform: AlignmentTransform,
  now: string,
  axisRotationDeg: number,
): Lot {
  const polygon = lot.polygon.map((point) =>
    transformPoint(point, pivot, transform, axisRotationDeg),
  )
  return {
    ...lot,
    polygon,
    centroid: polygonCentroid(polygon),
    areaSqm: Math.round(areaSqm(polygon) * 100) / 100,
    updatedAt: now,
  }
}

function transformPoint(
  point: LatLng,
  pivot: LatLng,
  transform: AlignmentTransform,
  axisRotationDeg = 0,
): LatLng {
  const local = toLocal(pivot, point, axisRotationDeg)
  const scaledE = local.e * transform.scale * transform.scaleX
  const scaledN = local.n * transform.scale * transform.scaleY
  const spun = fromLocal(
    pivot,
    scaledE,
    scaledN,
    axisRotationDeg + transform.rotationDeg,
  )
  return [spun[0] + transform.deltaLat, spun[1] + transform.deltaLng]
}

export function beginAlignmentResize(
  baseFrame: AlignmentFrame,
  currentFrame: AlignmentFrame,
  startTransform: AlignmentTransform,
  handle: AlignmentResizeHandle,
): AlignmentResizeDrag | null {
  const basePoints = resizePoints(baseFrame.polygon)
  const currentPoints = resizePoints(currentFrame.polygon)
  const baseHandle = basePoints[handle]
  const baseAnchor = basePoints[oppositeResizeHandle(handle)]
  const fixedAnchor = currentPoints[oppositeResizeHandle(handle)]
  if (!baseHandle || !baseAnchor || !fixedAnchor) return null
  return { handle, baseFrame, baseHandle, baseAnchor, fixedAnchor, startTransform }
}

export function resizeAlignmentTransform(
  drag: AlignmentResizeDrag,
  to: LatLng,
  keepRatio: boolean,
): AlignmentTransform | null {
  const axisRotationDeg = drag.baseFrame.rotationDeg + drag.startTransform.rotationDeg
  const baseVector = toLocal(drag.baseAnchor, drag.baseHandle, drag.baseFrame.rotationDeg)
  const nextVector = toLocal(drag.fixedAnchor, to, axisRotationDeg)
  const controlsWidth = resizeControlsWidth(drag.handle)
  const controlsHeight = resizeControlsHeight(drag.handle)
  const startScaleX = drag.startTransform.scale * drag.startTransform.scaleX
  const startScaleY = drag.startTransform.scale * drag.startTransform.scaleY
  let nextScaleX = startScaleX
  let nextScaleY = startScaleY

  if (controlsWidth) nextScaleX = resizeRatio(nextVector.e, baseVector.e, startScaleX)
  if (controlsHeight) nextScaleY = resizeRatio(nextVector.n, baseVector.n, startScaleY)

  if (keepRatio && (controlsWidth || controlsHeight)) {
    const ratioX = controlsWidth ? nextScaleX / startScaleX : nextScaleY / startScaleY
    const ratioY = controlsHeight ? nextScaleY / startScaleY : nextScaleX / startScaleX
    const ratio = Math.abs(ratioX - 1) >= Math.abs(ratioY - 1) ? ratioX : ratioY
    nextScaleX = startScaleX * ratio
    nextScaleY = startScaleY * ratio
  }

  const next: AlignmentTransform = {
    ...drag.startTransform,
    scaleX: nextScaleX / drag.startTransform.scale,
    scaleY: nextScaleY / drag.startTransform.scale,
  }
  const anchorWithoutTranslation = transformPoint(drag.baseAnchor, drag.baseFrame.pivot, {
    ...next,
    deltaLat: 0,
    deltaLng: 0,
  }, drag.baseFrame.rotationDeg)
  return {
    ...next,
    deltaLat: drag.fixedAnchor[0] - anchorWithoutTranslation[0],
    deltaLng: drag.fixedAnchor[1] - anchorWithoutTranslation[1],
  }
}

function polygonFromBounds(bounds: Bounds | null): Polygon {
  if (!bounds) return []
  const south = bounds[0][0]
  const west = bounds[0][1]
  const north = bounds[1][0]
  const east = bounds[1][1]
  return [
    [north, west],
    [north, east],
    [south, east],
    [south, west],
  ]
}

function polygonRotationDeg(polygon: Polygon): number {
  if (polygon.length < 2) return 0
  const local = toLocal(polygon[0]!, polygon[1]!, 0)
  return normalizeDeg((Math.atan2(-local.n, local.e) * 180) / Math.PI)
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

function resizePoints(polygon: Polygon): Record<AlignmentResizeHandle, LatLng | null> {
  const nw = polygon[0] ?? null
  const ne = polygon[1] ?? null
  const se = polygon[2] ?? null
  const sw = polygon[3] ?? null
  return {
    nw,
    n: midpoint(nw, ne),
    ne,
    e: midpoint(ne, se),
    se,
    s: midpoint(se, sw),
    sw,
    w: midpoint(sw, nw),
  }
}

function midpoint(a: LatLng | null, b: LatLng | null): LatLng | null {
  if (!a || !b) return null
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

function oppositeResizeHandle(handle: AlignmentResizeHandle): AlignmentResizeHandle {
  if (handle === 'nw') return 'se'
  if (handle === 'n') return 's'
  if (handle === 'ne') return 'sw'
  if (handle === 'e') return 'w'
  if (handle === 'se') return 'nw'
  if (handle === 's') return 'n'
  if (handle === 'sw') return 'ne'
  return 'e'
}

function resizeControlsWidth(handle: AlignmentResizeHandle): boolean {
  return handle.includes('e') || handle.includes('w')
}

function resizeControlsHeight(handle: AlignmentResizeHandle): boolean {
  return handle.includes('n') || handle.includes('s')
}

function resizeRatio(next: number, base: number, fallback: number): number {
  if (Math.abs(base) < 0.001) return fallback
  return Math.max(0.08, next / base)
}
