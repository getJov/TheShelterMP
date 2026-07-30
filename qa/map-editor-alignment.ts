import assert from 'node:assert/strict'
import type { AuditEvent, Block, Lot, MapOverlay, Tier } from '@/domain'
import type { AlignmentSelection, GeometryDraft } from '@/features/map-editor/geometry-transform'

const windowStub = {
  requestAnimationFrame: (fn: FrameRequestCallback) => setTimeout(fn, 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  devicePixelRatio: 1,
  screen: { deviceXDPI: 1, logicalXDPI: 1 },
}
const documentStub = {
  documentElement: { style: {} },
  createElement: () => ({ style: {}, getContext: () => null }),
}

Object.assign(globalThis, {
  window: windowStub,
  document: documentStub,
  navigator: { userAgent: 'node', platform: 'linux' },
})

const now = '2026-07-30T00:00:00+08:00'

const { asId } = await import('@/domain')
const { describe } = await import('@/lib/audit')
const { pointInPolygon, polygonCentroid, rectAt } = await import('@/lib/geo')
const {
  fromLocal,
  toLocal,
  distanceM,
  resizeLot,
  planGrid,
  limitGridPlan,
  rearrangeExistingLots,
} = await import('@/lib/grid-generator')
const {
  alignmentFrame,
  applyAlignmentTransform,
  beginAlignmentResize,
  identityAlignmentTransform,
  resizeAlignmentTransform,
} = await import('@/features/map-editor/geometry-transform')
const {
  validateLayoutGeometry,
  doesLotMatchTierFootprint,
} = await import('@/features/map-editor/geometry-validation')

const tier: Tier = {
  id: asId<'Tier'>('tier_test'),
  code: 'TEST',
  name: 'Test Lawn',
  category: 'lawn',
  description: 'QA tier',
  widthM: 1,
  lengthM: 2,
  capacity: 1,
  markerType: 'flat_marble',
  appearance: {
    fillColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0.5,
    pattern: 'none',
    shortLabel: 'T',
  },
  sortOrder: 1,
  active: true,
  createdAt: now,
  updatedAt: now,
}

const largerTier: Tier = {
  ...tier,
  id: asId<'Tier'>('tier_large'),
  code: 'LARGE',
  name: 'Large Test',
  widthM: 2,
  lengthM: 3,
}

const blockPolygon = rectAt([7, 126], 8, 8, 0)
const block: Block = {
  id: asId<'Block'>('blk_test'),
  locationId: asId<'Location'>('loc_test'),
  code: 'BT',
  name: 'Baseline Test',
  polygon: blockPolygon,
  centroid: polygonCentroid(blockPolygon),
  grid: {
    rows: 1,
    cols: 2,
    rotationDeg: 0,
    gutterM: 0.5,
    numbering: 'row_major',
  },
  defaultTierId: tier.id,
  lotCount: 2,
  active: true,
  createdAt: now,
  updatedAt: now,
}

const availableLot = lot('lot_available', 1, 'available', null, rectAt([7.00001, 125.99999], 1, 2, 0))
const soldLot = lot('lot_sold', 2, 'sold', asId<'Contract'>('contract_test'), rectAt([7.00001, 126.00003], 1, 2, 0))

const overlay: MapOverlay = {
  id: asId<'Overlay'>('overlay_test'),
  locationId: block.locationId,
  name: 'Site plan',
  imageUrl: 'data:image/png;base64,test',
  bounds: [
    [6.9997, 125.9999],
    [7.0001, 126.0003],
  ],
  rotationDeg: 0,
  opacity: 0.45,
  visible: true,
  zIndex: 1,
  createdAt: now,
  updatedAt: now,
}

const baseline: GeometryDraft = {
  blocks: [block],
  lots: [availableLot, soldLot],
  overlays: [overlay],
}

const tiersById = new Map([
  [tier.id, tier],
  [largerTier.id, largerTier],
])

assert.equal(validateLayoutGeometry(baseline.blocks, baseline.lots, tiersById).canPublish, true)

const rawGridPlan = planGrid({
  rows: 3,
  cols: 3,
  cellWidthM: tier.widthM,
  cellLengthM: tier.lengthM,
  gutterM: 0.25,
  rowGutterM: 0.25,
  rotationDeg: 0,
  numbering: 'row_major',
  startNumber: 1,
  boundary: block.polygon,
})
const exactGridPlan = limitGridPlan(rawGridPlan, 5, tier.widthM * tier.lengthM)
assert.equal(exactGridPlan.cells.length, 5)
assert.equal(exactGridPlan.usedAreaSqm, 5 * tier.widthM * tier.lengthM)
assert.equal(limitGridPlan(rawGridPlan, null, tier.widthM * tier.lengthM), rawGridPlan)

const rearrangePlan = planGrid({
  rows: 2,
  cols: 1,
  cellWidthM: tier.widthM,
  cellLengthM: tier.lengthM,
  gutterM: 0.25,
  rowGutterM: 0.25,
  rotationDeg: 0,
  numbering: 'row_major',
  startNumber: 1,
  boundary: block.polygon,
})
const rearrangedExisting = rearrangeExistingLots({
  existing: [availableLot, soldLot],
  plan: rearrangePlan,
  tiersById,
  rotationDeg: 0,
  now,
})
assert.equal(rearrangedExisting.overflow, 0)
assert.equal(rearrangedExisting.moved, 2)
assert.equal(rearrangedExisting.lots.length, 2)

const rearrangedSoldLot = rearrangedExisting.lots.find((l) => l.id === soldLot.id)!
assert.notEqual(JSON.stringify(rearrangedSoldLot.polygon), JSON.stringify(soldLot.polygon))
assert.equal(rearrangedSoldLot.blockId, soldLot.blockId)
assert.equal(rearrangedSoldLot.lotNumber, soldLot.lotNumber)
assert.equal(rearrangedSoldLot.status, soldLot.status)
assert.equal(rearrangedSoldLot.currentContractId, soldLot.currentContractId)
assert.equal(rearrangedSoldLot.currentOwnerClientId, soldLot.currentOwnerClientId)
assert.equal(rearrangedSoldLot.notes, soldLot.notes)
assert.equal(rearrangedSoldLot.capacity, soldLot.capacity)
assert.ok(pointInPolygon(rearrangedSoldLot.centroid, block.polygon))
assert.ok(doesLotMatchTierFootprint(rearrangedSoldLot, tier))

const shortRearrangePlan = limitGridPlan(rearrangePlan, 1, tier.widthM * tier.lengthM)
const blockedRearrange = rearrangeExistingLots({
  existing: [availableLot, soldLot],
  plan: shortRearrangePlan,
  tiersById,
  rotationDeg: 0,
  now,
})
assert.equal(blockedRearrange.overflow, 1)
assert.equal(blockedRearrange.moved, 0)
assert.equal(JSON.stringify(blockedRearrange.lots), JSON.stringify([availableLot, soldLot]))

const overlayOnly = applyAlignmentTransform(
  baseline,
  { target: 'overlay', blockId: null, lotIds: [], overlayId: overlay.id },
  { deltaLat: 0.00002, deltaLng: -0.00001, rotationDeg: 9, scale: 1, scaleX: 1.15, scaleY: 0.85 },
  now,
)
const movedOverlay = overlayOnly.overlays.find((o) => o.id === overlay.id)!
assert.notEqual(JSON.stringify(movedOverlay.bounds), JSON.stringify(overlay.bounds))
assert.equal(movedOverlay.rotationDeg, 9)
assert.equal(JSON.stringify(overlayOnly.blocks), JSON.stringify(baseline.blocks))
assert.equal(JSON.stringify(overlayOnly.lots), JSON.stringify(baseline.lots))

const blockSelection: AlignmentSelection = {
  target: 'block',
  blockId: block.id,
  lotIds: [],
  overlayId: null,
}

const alignedBlock = applyAlignmentTransform(
  baseline,
  blockSelection,
  { deltaLat: 0.00004, deltaLng: -0.00003, rotationDeg: 12, scale: 1.08, scaleX: 1, scaleY: 1 },
  now,
)

const movedSoldLot = alignedBlock.lots.find((l) => l.id === soldLot.id)!
assert.notEqual(JSON.stringify(movedSoldLot.polygon), JSON.stringify(soldLot.polygon))
assert.equal(movedSoldLot.status, soldLot.status)
assert.equal(movedSoldLot.currentContractId, soldLot.currentContractId)
assert.equal(movedSoldLot.currentOwnerClientId, soldLot.currentOwnerClientId)
assert.equal(movedSoldLot.lotNumber, soldLot.lotNumber)
assert.equal(movedSoldLot.tierId, soldLot.tierId)
assert.ok(doesLotMatchTierFootprint(movedSoldLot, tier))

const movedAvailableLot = alignedBlock.lots.find((l) => l.id === availableLot.id)!
assert.notEqual(JSON.stringify(movedAvailableLot.polygon), JSON.stringify(availableLot.polygon))
assert.equal(movedAvailableLot.status, availableLot.status)
assert.equal(alignedBlock.blocks[0]!.grid?.rotationDeg, 12)
assert.ok(doesLotMatchTierFootprint(movedAvailableLot, tier))

const lotOnly = applyAlignmentTransform(
  baseline,
  { target: 'lots', blockId: null, lotIds: [availableLot.id], overlayId: null },
  { deltaLat: 0.00003, deltaLng: 0.00002, rotationDeg: 0, scale: 1, scaleX: 1, scaleY: 1 },
  now,
)
assert.notEqual(
  JSON.stringify(lotOnly.lots.find((l) => l.id === availableLot.id)!.polygon),
  JSON.stringify(availableLot.polygon),
)
assert.equal(
  JSON.stringify(lotOnly.lots.find((l) => l.id === soldLot.id)!.polygon),
  JSON.stringify(soldLot.polygon),
)

const baseFrame = alignmentFrame(baseline, blockSelection)!
const resizeDrag = beginAlignmentResize(
  baseFrame,
  baseFrame,
  identityAlignmentTransform(),
  'e',
)!
const baseVector = toLocal(resizeDrag.fixedAnchor, resizeDrag.baseHandle, baseFrame.rotationDeg)
const widerHandle = fromLocal(
  resizeDrag.fixedAnchor,
  baseVector.e * 1.25,
  baseVector.n,
  baseFrame.rotationDeg,
)
const resizeTransform = resizeAlignmentTransform(resizeDrag, widerHandle, false)!
assert.ok(resizeTransform.scaleX > 1.2)
assert.equal(Math.round(resizeTransform.scaleY * 100), 100)

const resizedBlock = applyAlignmentTransform(baseline, blockSelection, resizeTransform, now)
const resizedBlockPolygon = resizedBlock.blocks[0]!.polygon
for (const resizedLot of resizedBlock.lots) {
  assert.ok(pointInPolygon(resizedLot.centroid, resizedBlockPolygon))
  assert.ok(doesLotMatchTierFootprint(resizedLot, tier))
}
assert.equal(
  Math.round(distanceM(resizedBlock.lots[0]!.polygon[0]!, resizedBlock.lots[0]!.polygon[1]!) * 10),
  Math.round(distanceM(availableLot.polygon[0]!, availableLot.polygon[1]!) * 10),
)

const largeFootprintLot = { ...availableLot, tierId: largerTier.id }
const mismatchReport = validateLayoutGeometry(blocksOf(block), [largeFootprintLot], tiersById)
assert.equal(mismatchReport.canPublish, false)
assert.equal(mismatchReport.tierMismatchLotIds.has(largeFootprintLot.id), true)

const syncedLot = resizeLot(largeFootprintLot, largerTier.widthM, largerTier.lengthM, 0, now)
assert.equal(validateLayoutGeometry(blocksOf(block), [syncedLot], tiersById).canPublish, true)

const outsideLot = {
  ...availableLot,
  polygon: rectAt([7.001, 126.001], 1, 2, 0),
  centroid: [7.001, 126.001] as Lot['centroid'],
}
const outsideReport = validateLayoutGeometry(blocksOf(block), [outsideLot], tiersById)
assert.equal(outsideReport.canPublish, false)
assert.equal(outsideReport.outsideBlockLotIds.has(outsideLot.id), true)

const event: AuditEvent = {
  id: asId<'Audit'>('audit_test'),
  actorUserId: asId<'User'>('user_test'),
  action: 'block.created',
  entityType: 'Block',
  entityId: block.id,
  before: null,
  after: { summary: 'Block BT geometry aligned', count: 1 },
  at: now,
}
assert.equal(describe(event), 'Block BT geometry aligned')

console.log('map-editor-alignment-ok')

function blocksOf(oneBlock: Block): Block[] {
  return [oneBlock]
}

function lot(
  id: string,
  lotNumber: number,
  status: Lot['status'],
  currentContractId: Lot['currentContractId'],
  polygon: Lot['polygon'],
): Lot {
  return {
    id: asId<'Lot'>(id),
    locationId: block.locationId,
    blockId: block.id,
    lotNumber,
    tierId: tier.id,
    polygon,
    centroid: polygonCentroid(polygon),
    areaSqm: tier.widthM * tier.lengthM,
    status,
    capacity: 1,
    intermentCount: status === 'occupied' ? 1 : 0,
    activeHoldId: null,
    currentContractId,
    currentOwnerClientId: currentContractId ? asId<'Client'>('client_test') : null,
    notForSaleReason: null,
    notes: currentContractId ? 'Preserve me' : null,
    createdAt: now,
    updatedAt: now,
  }
}
