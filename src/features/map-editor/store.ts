import { create } from 'zustand'
import {
  asId,
  type AuditAction,
  type Block,
  type BlockId,
  type Bounds,
  type LatLng,
  type LocationId,
  type Lot,
  type LotId,
  type LotStatus,
  type MapOverlay,
  type OverlayId,
  type Polygon,
  type Tier,
  type TierId,
  type UserId,
} from '@/domain'
import { NOW } from '@/mock'
import { dataset, useDataset } from '@/stores/dataset'
import { offsetMetres, pointInPolygon, polygonCentroid, rectAt } from '@/lib/geo'
import {
  buildLots,
  detectOverlaps,
  distanceM,
  fixOverlaps,
  fromLocal,
  isProtected,
  newBlockId,
  newOverlayId,
  planGrid,
  regenerate,
  rearrangeExistingLots,
  renumber,
  resizeLot,
  safeCapacity,
  toLocal,
  transformLotBetweenBlocks,
  type GridPlan,
  type Numbering,
  type RegenMode,
  type RegenResult,
  type RearrangeExistingLotsResult,
} from '@/lib/grid-generator'
import {
  alignmentFrame,
  applyAlignmentTransform,
  identityAlignmentTransform,
  nudgeTransformMeters,
  polygonRotationDeg,
  type AlignmentSelection,
  type AlignmentTarget,
  type AlignmentTransform,
} from './geometry-transform'

export type Tool =
  | 'select'
  | 'editBlock'
  | 'block'
  | 'blockFree'
  | 'grid'
  | 'draw'
  | 'lotRect'
  | 'overlay'
export type EditorMode = 'align' | 'inventory'
export type EditorLayerMode = 'baseMap' | 'sitePlan' | 'blocks' | 'lots' | 'tiers' | 'review'

/** Sidebar navigation for the flat Blocks > Lots manager. */
export type EditorView = { screen: 'home' } | { screen: 'block'; blockId: BlockId }

export type GenerateDirection = 'left' | 'right' | 'up' | 'down'

export const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  e: 'editBlock',
  b: 'block',
  g: 'grid',
  d: 'draw',
  o: 'overlay',
}

/** Nudge/rotate key-repeat bursts collapse into the gesture's first undo entry. */
const TRANSFORM_COALESCE_MS = 900

export interface DraftState {
  blocks: Block[]
  lots: Lot[]
  overlays: MapOverlay[]
}

interface Snapshot extends DraftState {
  selection: LotId[]
  activeBlockId: BlockId | null
}

export interface GridParams {
  tierId: TierId | null
  rows: number
  cols: number
  gutterM: number
  rowGutterM: number
  /** When false the row gutter follows the column gutter. */
  splitGutters: boolean
  exactCount: number | null
  rotationDeg: number
  numbering: Numbering
  startNumber: number
}

export interface LayerFlags {
  sitePlan: boolean
  blocks: boolean
  lots: boolean
  lotNumbers: boolean
}

/** Rectangle being dragged out by the Block tool, before it is confirmed. */
export interface PendingBlock {
  polygon: Polygon
  rotationDeg: number
  code: string
  name: string
  defaultTierId: TierId | null
}

export interface EditingBlock {
  id: BlockId
  originalPolygon: Polygon
  polygon: Polygon
  rotationDeg: number
  moveLots: boolean
}

export interface BlockEditResult {
  movedLots: number
  protectedLots: number
}

export interface AlignmentSession {
  selection: AlignmentSelection
  base: Snapshot
  transform: AlignmentTransform
  dirtyBefore: boolean
  label: string
}

export interface AlignmentCommitResult {
  label: string
  target: AlignmentTarget
  count: number
}

const UNDO_DEPTH = 50

/** Audit ids start well past the seed's so the two never collide. */
let auditSeq = 940_000

export interface PublishAudit {
  action: AuditAction
  entityType: string
  entityId: string
  label: string
  count: number
  codes: string[]
}

const clone = <T,>(v: T): T => structuredClone(v)

const emptyDraft = (): DraftState => ({ blocks: [], lots: [], overlays: [] })

function blockEditFrom(block: Block, moveLots = false): EditingBlock {
  return {
    id: block.id,
    originalPolygon: clone(block.polygon),
    polygon: clone(block.polygon),
    rotationDeg: block.grid?.rotationDeg ?? 0,
    moveLots,
  }
}

export const defaultGrid = (): GridParams => ({
  tierId: null,
  rows: 10,
  cols: 10,
  gutterM: 0.6,
  rowGutterM: 0.9,
  splitGutters: true,
  exactCount: null,
  rotationDeg: 12,
  numbering: 'boustrophedon',
  startNumber: 1,
})

/** Live drag of selected lots or a whole block — one undo entry per gesture. */
export interface DragSession {
  kind: 'lots' | 'block'
  lotIds: LotId[]
  blockId: BlockId | null
  base: Snapshot
  dirtyBefore: boolean
  moved: boolean
}

interface EditorState extends DraftState {
  locationId: LocationId | null
  /** Snapshot of the live data the drafts were forked from. Drives the diff. */
  baseline: DraftState
  /**
   * Dataset version the draft was forked from. A clean draft re-hydrates when
   * the live dataset moves past it, so the editor and the park map always
   * show the same published data. Dirty drafts keep priority until published
   * or discarded.
   */
  datasetVersion: number

  editorMode: EditorMode
  layerMode: EditorLayerMode
  tool: Tool
  alignmentTarget: AlignmentTarget
  alignmentSession: AlignmentSession | null
  selection: Set<LotId>
  activeBlockId: BlockId | null
  activeOverlayId: OverlayId | null
  pendingBlock: PendingBlock | null
  editingBlock: EditingBlock | null
  moveTargetBlockId: BlockId | null
  tierPaintTierId: TierId | null

  grid: GridParams
  /** The 45% preview is noise once the block already holds that grid. */
  showPreview: boolean
  layers: LayerFlags
  compare: boolean
  overlaps: Set<LotId>

  undoStack: Snapshot[]
  redoStack: Snapshot[]
  overlayEditBase: Snapshot | null
  dirty: boolean

  // manager navigation (flat Blocks > Lots sidebar)
  view: EditorView
  setView: (view: EditorView) => void
  dragSession: DragSession | null

  // lifecycle
  hydrate: (locationId: LocationId | null, force?: boolean) => void
  discard: () => void
  publish: (actorUserId: UserId, audit: PublishAudit[]) => void

  // manager actions
  /** Divide the block into rows × cols cells (≈86% fill), clipped to its shape. Replaces unprotected lots. */
  autofillBlock: (blockId: BlockId, rows: number, cols: number, tier: Tier) => number
  /** Clone the selection (tiled as one unit) toward a direction, clipped to its block. */
  generateFromSelection: (
    dir: GenerateDirection,
    count: number | 'fill',
    tiersById: Map<TierId, Tier>,
  ) => { created: number; requested: number | 'fill' }
  /** Grow/shrink each selected lot's footprint by metre deltas. Protected lots refused. */
  resizeLots: (ids: LotId[], dWidthM: number, dLengthM: number) => LotId[]
  /** Move/rotate a whole block WITH its lots (cartography move — protection does not apply). */
  transformBlock: (id: BlockId, t: { eastM?: number; northM?: number; rotateDeg?: number }) => void
  /**
   * Scale a block's footprint by metre deltas with the shrink guard: outcast
   * lots relocate to free interior space, unprotected leftovers are removed,
   * protected outcasts abort the resize.
   */
  resizeBlockGuarded: (
    id: BlockId,
    dWidthM: number,
    dLengthM: number,
  ) => { ok: boolean; relocated: number; removed: number; blockedBy: number }
  beginDrag: (kind: 'lots' | 'block', blockId?: BlockId) => boolean
  previewDrag: (deltaLat: number, deltaLng: number) => void
  endDrag: (commit: boolean) => void

  // chrome
  setEditorMode: (mode: EditorMode) => void
  setLayerMode: (mode: EditorLayerMode) => void
  setTool: (t: Tool) => void
  setAlignmentTarget: (target: AlignmentTarget) => void
  beginAlignment: () => boolean
  previewAlignment: (patch: Partial<AlignmentTransform>) => boolean
  translateAlignment: (delta: [number, number]) => boolean
  nudgeAlignmentMeters: (eastM: number, northM: number) => boolean
  cancelAlignment: () => void
  commitAlignment: () => AlignmentCommitResult | null
  setLayer: <K extends keyof LayerFlags>(k: K, v: LayerFlags[K]) => void
  setCompare: (v: boolean) => void
  setGrid: (patch: Partial<GridParams>) => void
  setActiveBlock: (id: BlockId | null) => void
  setActiveOverlay: (id: OverlayId | null) => void
  setMoveTargetBlock: (id: BlockId | null) => void
  setTierPaintTier: (id: TierId | null) => void

  // undo
  undo: () => void
  redo: () => void

  // selection
  setSelection: (ids: Iterable<LotId>) => void
  addSelection: (ids: Iterable<LotId>) => void
  toggleSelection: (id: LotId) => void
  subtractSelection: (ids: Iterable<LotId>) => void
  clearSelection: () => void

  // blocks
  setPendingBlock: (p: PendingBlock | null) => void
  patchPendingBlock: (patch: Partial<PendingBlock>) => void
  commitPendingBlock: () => BlockId | null
  /** Create the pending block AND fill it with lots — one undo step. */
  commitPendingBlockWithLots: (
    tier: Tier,
    fill: { rows: number; cols: number; gutterM: number; rowGutterM: number },
  ) => { id: BlockId; count: number } | null
  startBlockEdit: (id: BlockId) => void
  patchEditingBlock: (patch: Partial<Pick<EditingBlock, 'polygon' | 'rotationDeg' | 'moveLots'>>) => void
  cancelBlockEdit: () => void
  commitBlockEdit: () => BlockEditResult | null
  updateBlock: (id: BlockId, patch: Partial<Block>) => void
  /** Returns 0 when deleted, or the count of protected lots that refused it. */
  deleteBlock: (id: BlockId) => number

  // lots
  generate: (mode: RegenMode, plan: GridPlan, tier: Tier) => RegenResult | null
  rearrangeExistingLots: (
    plan: GridPlan,
    tiersById: Map<TierId, Tier>,
  ) => RearrangeExistingLotsResult | null
  addFreeLot: (polygon: Polygon, tier: Tier) => void
  changeTier: (ids: LotId[], tier: Tier) => void
  syncTierFootprints: (ids: LotId[] | null, tiersById: Map<TierId, Tier>) => LotId[]
  changeStatus: (ids: LotId[], status: LotStatus, reason: string | null) => void
  renumberSelection: (ids: LotId[], scheme: Numbering, start: number) => void
  moveToBlock: (ids: LotId[], target: BlockId) => LotId[]
  resizeSelection: (ids: LotId[], widthM: number, lengthM: number) => LotId[]
  deleteLots: (ids: LotId[]) => void
  /**
   * One-shot move/rotate of specific lots (inventory mode's direct tools).
   * Protected lots are refused and returned so the UI can say why.
   */
  transformLots: (
    ids: LotId[],
    t: { eastM?: number; northM?: number; rotateDeg?: number },
  ) => LotId[]
  /** Clone lots one pitch along their own row direction; selection moves to the clones. */
  duplicateLots: (ids: LotId[], tiersById: Map<TierId, Tier>) => LotId[]
  repairOverlaps: () => void
  recheckOverlaps: () => void

  // overlays
  lockedOverlays: Set<OverlayId>
  toggleOverlayLock: (id: OverlayId) => void
  addOverlay: (o: MapOverlay) => void
  updateOverlay: (id: OverlayId, patch: Partial<MapOverlay>) => void
  removeOverlay: (id: OverlayId) => void
  /** Drag-in-progress: one undo entry for the whole gesture, not one per frame. */
  beginOverlayEdit: () => void
  overlayLive: (id: OverlayId, patch: Partial<MapOverlay>) => void
  commitOverlayEdit: () => void
}

/** Grid parameters seeded from a block: its own grid, then its tier mix. */
function gridFor(s: { blocks: Block[]; lots: Lot[]; grid: GridParams }, id: BlockId | null) {
  const b = s.blocks.find((x) => x.id === id)
  if (!b) return s.grid
  const inBlock = s.lots.filter((l) => l.blockId === b.id)
  const counts = new Map<TierId, number>()
  for (const l of inBlock) counts.set(l.tierId, (counts.get(l.tierId) ?? 0) + 1)
  const modal = [...counts.entries()].sort((a, c) => c[1] - a[1])[0]?.[0]
  const g = b.grid
  return {
    ...s.grid,
    tierId: b.defaultTierId ?? modal ?? s.grid.tierId,
    rows: g?.rows ?? s.grid.rows,
    cols: g?.cols ?? s.grid.cols,
    gutterM: g?.gutterM ?? s.grid.gutterM,
    rotationDeg: g?.rotationDeg ?? s.grid.rotationDeg,
    numbering: g?.numbering ?? s.grid.numbering,
    startNumber: 1,
  }
}

/** The block's grid bearing, falling back to the bearing of its first edge. */
function blockFrameRotation(b: Block): number {
  return b.grid?.rotationDeg ?? polygonRotationDeg(b.polygon)
}

interface LocalExtent {
  minE: number
  maxE: number
  minN: number
  maxN: number
}

function localExtentOf(polygon: Polygon, anchor: LatLng, rot: number): LocalExtent {
  let minE = Infinity
  let maxE = -Infinity
  let minN = Infinity
  let maxN = -Infinity
  for (const v of polygon) {
    const p = toLocal(anchor, v, rot)
    if (p.e < minE) minE = p.e
    if (p.e > maxE) maxE = p.e
    if (p.n < minN) minN = p.n
    if (p.n > maxN) maxN = p.n
  }
  return { minE, maxE, minN, maxN }
}

/** Persisted dirty draft — survives reloads until published or discarded. */
const DRAFT_KEY = 'shelter-editor-draft'

interface SavedDraft {
  locationId: LocationId | null
  datasetVersion: number
  baseline: DraftState
  blocks: Block[]
  lots: Lot[]
  overlays: MapOverlay[]
}

function readSavedDraft(): SavedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedDraft
    if (!Array.isArray(parsed.blocks) || !Array.isArray(parsed.lots)) return null
    return parsed
  } catch {
    return null
  }
}

function clearSavedDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* best-effort */
  }
}

export const useEditor = create<EditorState>((set, get) => {
  /** Push the current state onto the undo stack, then apply a mutation. */
  const mutate = (fn: (s: EditorState) => Partial<EditorState>) => {
    const s = get()
    const snap: Snapshot = {
      blocks: clone(s.blocks),
      lots: clone(s.lots),
      overlays: clone(s.overlays),
      selection: [...s.selection],
      activeBlockId: s.activeBlockId,
    }
    const stack = [...s.undoStack, snap]
    if (stack.length > UNDO_DEPTH) stack.shift()
    set({ ...fn(s), undoStack: stack, redoStack: [], dirty: true })
  }

  const restore = (snap: Snapshot): Partial<EditorState> => ({
    blocks: snap.blocks,
    lots: snap.lots,
    overlays: snap.overlays,
    selection: new Set(snap.selection),
    activeBlockId: snap.activeBlockId,
  })

  const snapshotOf = (s: EditorState): Snapshot => ({
    blocks: clone(s.blocks),
    lots: clone(s.lots),
    overlays: clone(s.overlays),
    selection: [...s.selection],
    activeBlockId: s.activeBlockId,
  })

  const pushUndo = (snap: Snapshot, s: EditorState) => {
    const stack = [...s.undoStack, snap]
    if (stack.length > UNDO_DEPTH) stack.shift()
    return stack
  }

  // transformLots coalescing — same selection within the window = same gesture.
  let lastTransformKey = ''
  let lastTransformAt = 0

  const resolveAlignmentSelection = (s: EditorState): AlignmentSelection | null => {
    if (s.alignmentTarget === 'layout') {
      return s.blocks.length > 0
        ? { target: 'layout', blockId: null, lotIds: [], overlayId: null }
        : null
    }

    if (s.alignmentTarget === 'block') {
      const blockId = s.activeBlockId
      return blockId && s.blocks.some((b) => b.id === blockId)
        ? { target: 'block', blockId, lotIds: [], overlayId: null }
        : null
    }

    if (s.alignmentTarget === 'lots') {
      const lotIds = [...s.selection]
      return lotIds.length > 0
        ? { target: 'lots', blockId: null, lotIds, overlayId: null }
        : null
    }

    const overlayId = s.activeOverlayId
    return overlayId &&
      s.overlays.some((o) => o.id === overlayId) &&
      !s.lockedOverlays.has(overlayId)
      ? { target: 'overlay', blockId: null, lotIds: [], overlayId }
      : null
  }

  const ensureAlignmentSession = (s: EditorState): AlignmentSession | null => {
    if (s.alignmentSession) return s.alignmentSession
    const selection = resolveAlignmentSelection(s)
    if (!selection) return null
    const base = snapshotOf(s)
    const frame = alignmentFrame(base, selection)
    if (!frame) return null
    return {
      selection,
      base,
      transform: identityAlignmentTransform(),
      dirtyBefore: s.dirty,
      label: frame.label,
    }
  }

  const previewAlignmentFrom = (
    s: EditorState,
    session: AlignmentSession,
    transform: AlignmentTransform,
  ): Partial<EditorState> => {
    const next = applyAlignmentTransform(session.base, session.selection, transform, NOW)
    return {
      ...next,
      alignmentSession: { ...session, transform },
      dirty: true,
      overlaps: detectOverlaps(next.lots),
    }
  }

  return {
    locationId: null,
    datasetVersion: -1,
    baseline: emptyDraft(),
    ...emptyDraft(),
    view: { screen: 'home' } as EditorView,
    dragSession: null,

    // The flat manager never leaves inventory/lots — the old wizard modes
    // stay only as pinned vestiges for untouched internals.
    editorMode: 'inventory',
    layerMode: 'lots',
    tool: 'select',
    alignmentTarget: 'layout',
    alignmentSession: null,
    selection: new Set<LotId>(),
    activeBlockId: null,
    activeOverlayId: null,
    pendingBlock: null,
    editingBlock: null,
    moveTargetBlockId: null,
    tierPaintTierId: null,

    grid: defaultGrid(),
    showPreview: true,
    layers: {
      sitePlan: true,
      blocks: true,
      lots: true,
      lotNumbers: false,
    },
    compare: false,
    overlaps: new Set<LotId>(),

    undoStack: [],
    redoStack: [],
    overlayEditBase: null,
    dirty: false,

    // ── lifecycle ───────────────────────────────────────────────────
    hydrate: (locationId, force = false) => {
      const s = get()
      const version = useDataset.getState().version
      if (!force && s.locationId === locationId) {
        // A dirty draft is the user's work in progress — never clobber it.
        if (s.dirty) return
        // A clean draft is only kept while the live dataset hasn't moved.
        if (s.blocks.length > 0 && s.datasetVersion === version) return
      }
      if (force) clearSavedDraft()
      if (!force) {
        // A dirty draft saved by a previous session takes over from the seed.
        const saved = readSavedDraft()
        if (
          saved &&
          saved.locationId === locationId &&
          saved.datasetVersion === version
        ) {
          set({
            locationId,
            datasetVersion: version,
            baseline: saved.baseline,
            blocks: saved.blocks,
            lots: saved.lots,
            overlays: saved.overlays,
            grid: gridFor(
              { blocks: saved.blocks, lots: saved.lots, grid: defaultGrid() },
              saved.blocks[0]?.id ?? null,
            ),
            selection: new Set(),
            activeBlockId: saved.blocks[0]?.id ?? null,
            activeOverlayId: null,
            view: { screen: 'home' },
            dragSession: null,
            pendingBlock: null,
            editingBlock: null,
            alignmentSession: null,
            moveTargetBlockId: null,
            undoStack: [],
            redoStack: [],
            overlayEditBase: null,
            lockedOverlays: new Set(),
            dirty: true,
            overlaps: detectOverlaps(saved.lots),
            compare: false,
            editorMode: 'inventory',
            layerMode: 'lots',
            tool: 'select',
            tierPaintTierId: null,
          })
          return
        }
      }
      const live = dataset()
      const blocks = live.blocks.filter(
        (b) => b.active && (!locationId || b.locationId === locationId),
      )
      const ids = new Set(blocks.map((b) => b.id))
      const lots = live.lots.filter((l) => ids.has(l.blockId))
      const overlays = live.overlays.filter(
        (o) => !locationId || o.locationId === locationId,
      )
      const draft: DraftState = {
        blocks: clone(blocks),
        lots: clone(lots),
        overlays: clone(overlays),
      }
      const first = blocks[0]?.id ?? null
      set({
        locationId,
        datasetVersion: version,
        view: { screen: 'home' },
        dragSession: null,
        baseline: clone(draft),
        ...draft,
        grid: gridFor({ ...draft, grid: defaultGrid() }, first),
        selection: new Set(),
        activeBlockId: first,
        activeOverlayId: null,
        pendingBlock: null,
        editingBlock: null,
        alignmentSession: null,
        moveTargetBlockId: null,
        undoStack: [],
        redoStack: [],
        overlayEditBase: null,
        lockedOverlays: new Set(),
        dirty: false,
        overlaps: new Set(),
        compare: false,
        editorMode: 'inventory',
        layerMode: 'lots',
        tool: 'select',
        tierPaintTierId: null,
      })
    },

    discard: () => get().hydrate(get().locationId, true),

    // ── manager navigation + tools ──────────────────────────────────
    setView: (view) =>
      set((s) =>
        view.screen === 'block'
          ? {
              view,
              activeBlockId: view.blockId,
              grid: gridFor(s, view.blockId),
              selection: new Set<LotId>(),
              editorMode: 'inventory',
              layerMode: 'lots',
              tool: 'select',
              pendingBlock: null,
              editingBlock: null,
            }
          : {
              view,
              selection: new Set<LotId>(),
              tool: 'select',
              pendingBlock: null,
              editingBlock: null,
            },
      ),

    autofillBlock: (blockId, rows, cols, tier) => {
      const s = get()
      const block = s.blocks.find((b) => b.id === blockId)
      if (!block || !s.locationId || rows < 1 || cols < 1) return 0
      const rot = blockFrameRotation(block)
      const anchor = block.polygon[0]!
      const ext = localExtentOf(block.polygon, anchor, rot)
      const pitchE = (ext.maxE - ext.minE) / cols
      const pitchN = (ext.maxN - ext.minN) / rows
      if (pitchE <= 0.05 || pitchN <= 0.05) return 0

      const keep = s.lots.filter((l) => l.blockId === blockId && isProtected(l))
      const used = new Set(keep.map((l) => l.lotNumber))
      const cells = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const e = ext.minE + c * pitchE + pitchE / 2
          const n = ext.maxN - (r * pitchN + pitchN / 2)
          const centroid = fromLocal(anchor, e, n, rot)
          // Free-form blocks: only cells whose centre is truly inside.
          if (!pointInPolygon(centroid, block.polygon)) continue
          const inRow = r % 2 === 0 ? c : cols - 1 - c
          cells.push({
            lotNumber: r * cols + inRow + 1,
            row: r,
            col: c,
            polygon: rectAt(centroid, pitchE * 0.86, pitchN * 0.86, rot),
            centroid,
          })
        }
      }
      if (cells.length === 0) return 0
      const lots = buildLots({ cells, blockId, locationId: s.locationId, tier, now: NOW, used })
      mutate((st) => {
        const others = st.lots.filter((l) => l.blockId !== blockId || isProtected(l))
        const all = [...others, ...lots]
        return {
          lots: all,
          blocks: st.blocks.map((b) =>
            b.id === blockId
              ? {
                  ...b,
                  lotCount: all.filter((l) => l.blockId === blockId).length,
                  defaultTierId: tier.id,
                  grid: {
                    rows,
                    cols,
                    rotationDeg: rot,
                    gutterM: Math.round(pitchE * 0.14 * 100) / 100,
                    numbering: 'boustrophedon' as const,
                  },
                  updatedAt: NOW,
                }
              : b,
          ),
          selection: new Set<LotId>(),
          overlaps: detectOverlaps(all),
        }
      })
      return lots.length
    },

    generateFromSelection: (dir, count, tiersById) => {
      const s = get()
      const requested = count
      const blockId = s.activeBlockId
      const block = s.blocks.find((b) => b.id === blockId)
      if (!block || !blockId || !s.locationId) return { created: 0, requested }
      const sel = s.lots.filter((l) => s.selection.has(l.id) && l.blockId === blockId)
      if (sel.length === 0) return { created: 0, requested }

      const rot = blockFrameRotation(block)
      const anchor = block.polygon[0]!
      let minE = Infinity
      let maxE = -Infinity
      let minN = Infinity
      let maxN = -Infinity
      let sumW = 0
      let sumL = 0
      for (const l of sel) {
        sumW += distanceM(l.polygon[0]!, l.polygon[1]!)
        sumL += distanceM(l.polygon[1]!, l.polygon[2] ?? l.polygon[1]!)
        for (const v of l.polygon) {
          const p = toLocal(anchor, v, rot)
          if (p.e < minE) minE = p.e
          if (p.e > maxE) maxE = p.e
          if (p.n < minN) minN = p.n
          if (p.n > maxN) maxN = p.n
        }
      }
      const gapE = Math.max(0.05, (sumW / sel.length) * 0.14)
      const gapN = Math.max(0.05, (sumL / sel.length) * 0.14)
      const stepE = dir === 'left' ? -(maxE - minE + gapE) : dir === 'right' ? maxE - minE + gapE : 0
      const stepN = dir === 'down' ? -(maxN - minN + gapN) : dir === 'up' ? maxN - minN + gapN : 0
      if (stepE === 0 && stepN === 0) return { created: 0, requested }

      let nextNumber = s.lots
        .filter((l) => l.blockId === blockId)
        .reduce((m, l) => Math.max(m, l.lotNumber), 0)
      const usedNumbers = new Set(
        s.lots.filter((l) => l.blockId === blockId).map((l) => l.lotNumber),
      )
      const maxCopies = count === 'fill' ? 1000 : Math.max(0, Math.floor(count))
      interface GenCell {
        lotNumber: number
        row: number
        col: number
        polygon: Polygon
        centroid: LatLng
      }
      const groups = new Map<TierId, { tier: Tier; cells: GenCell[] }>()

      for (let k = 1; k <= maxCopies; k++) {
        let keptThisCopy = 0
        for (const l of sel) {
          const tier = tiersById.get(l.tierId)
          if (!tier) continue
          const polygon = l.polygon.map((v) => {
            const p = toLocal(anchor, v, rot)
            return fromLocal(anchor, p.e + stepE * k, p.n + stepN * k, rot)
          })
          const centroid = polygonCentroid(polygon)
          // Bounded by the block: copies whose centre leaves it are dropped.
          if (!pointInPolygon(centroid, block.polygon)) continue
          keptThisCopy++
          const g = groups.get(l.tierId) ?? { tier, cells: [] }
          g.cells.push({ lotNumber: ++nextNumber, row: 0, col: 0, polygon, centroid })
          groups.set(l.tierId, g)
        }
        if (keptThisCopy === 0) break
      }

      const created: Lot[] = []
      for (const g of groups.values()) {
        created.push(
          ...buildLots({
            cells: g.cells,
            blockId,
            locationId: s.locationId,
            tier: g.tier,
            now: NOW,
            used: usedNumbers,
          }),
        )
        for (const c of g.cells) usedNumbers.add(c.lotNumber)
      }
      if (created.length === 0) return { created: 0, requested }

      mutate((st) => {
        const lots = [...st.lots, ...created]
        return {
          lots,
          selection: new Set(created.map((c) => c.id)),
          overlaps: detectOverlaps(lots),
          blocks: st.blocks.map((b) =>
            b.id === blockId ? { ...b, lotCount: b.lotCount + created.length, updatedAt: NOW } : b,
          ),
        }
      })
      return { created: created.length, requested }
    },

    resizeLots: (ids, dWidthM, dLengthM) => {
      const s = get()
      const refused: LotId[] = []
      const idSet = new Set(ids)
      const lots = s.lots.map((l) => {
        if (!idSet.has(l.id)) return l
        if (isProtected(l)) {
          refused.push(l.id)
          return l
        }
        const block = s.blocks.find((b) => b.id === l.blockId)
        const rot = block ? blockFrameRotation(block) : s.grid.rotationDeg
        const w = Math.max(0.3, distanceM(l.polygon[0]!, l.polygon[1]!) + dWidthM)
        const len = Math.max(
          0.3,
          distanceM(l.polygon[1]!, l.polygon[2] ?? l.polygon[1]!) + dLengthM,
        )
        return resizeLot(l, Math.round(w * 100) / 100, Math.round(len * 100) / 100, rot, NOW)
      })
      if (refused.length === ids.length) return refused
      mutate(() => ({ lots, overlaps: detectOverlaps(lots) }))
      return refused
    },

    transformBlock: (id, t) => {
      const s = get()
      const selection: AlignmentSelection = {
        target: 'block',
        blockId: id,
        lotIds: [],
        overlayId: null,
      }
      const draft = { blocks: s.blocks, lots: s.lots, overlays: s.overlays }
      const frame = alignmentFrame(draft, selection)
      if (!frame) return
      let transform = identityAlignmentTransform()
      if (t.rotateDeg) transform = { ...transform, rotationDeg: t.rotateDeg }
      if (t.eastM || t.northM) {
        transform = nudgeTransformMeters(transform, frame.pivot, t.eastM ?? 0, t.northM ?? 0)
      }
      const next = applyAlignmentTransform(draft, selection, transform, NOW)
      const key = `block:${id}`
      const at = Date.now()
      if (key === lastTransformKey && at - lastTransformAt < TRANSFORM_COALESCE_MS) {
        set({ blocks: next.blocks, lots: next.lots, overlaps: detectOverlaps(next.lots), dirty: true })
      } else {
        mutate(() => ({ blocks: next.blocks, lots: next.lots, overlaps: detectOverlaps(next.lots) }))
      }
      lastTransformKey = key
      lastTransformAt = at
    },

    resizeBlockGuarded: (id, dWidthM, dLengthM) => {
      const s = get()
      const block = s.blocks.find((b) => b.id === id)
      if (!block) return { ok: false, relocated: 0, removed: 0, blockedBy: 0 }
      const rot = blockFrameRotation(block)
      const centre = block.centroid
      const ext0 = localExtentOf(block.polygon, centre, rot)
      const w0 = ext0.maxE - ext0.minE
      const l0 = ext0.maxN - ext0.minN
      if (w0 <= 0 || l0 <= 0) return { ok: false, relocated: 0, removed: 0, blockedBy: 0 }
      const fx = Math.max(1, w0 + dWidthM) / w0
      const fy = Math.max(1, l0 + dLengthM) / l0
      const newPolygon = block.polygon.map((v) => {
        const p = toLocal(centre, v, rot)
        return fromLocal(centre, p.e * fx, p.n * fy, rot)
      })

      const inBlock = s.lots.filter((l) => l.blockId === id)
      const stay: Lot[] = []
      const outcasts: Lot[] = []
      for (const l of inBlock) {
        if (l.polygon.every((v) => pointInPolygon(v, newPolygon))) stay.push(l)
        else outcasts.push(l)
      }
      const shrinking = dWidthM < 0 || dLengthM < 0
      const blockedBy = outcasts.filter(isProtected).length
      if (blockedBy > 0 && shrinking) {
        // Protected lots define the hard minimum — refuse the whole resize.
        return { ok: false, relocated: 0, removed: 0, blockedBy }
      }

      const bboxOf = (poly: Polygon): LocalExtent => localExtentOf(poly, centre, rot)
      const occupied = stay.map((l) => bboxOf(l.polygon))
      const extNew = localExtentOf(newPolygon, centre, rot)
      const overlaps2 = (a: LocalExtent, b: LocalExtent) =>
        a.minE < b.maxE && a.maxE > b.minE && a.minN < b.maxN && a.maxN > b.minN

      const relocations = new Map<LotId, Lot>()
      const removed: LotId[] = []
      let relocatedCount = 0
      for (const l of outcasts) {
        if (isProtected(l)) continue // only reachable while growing — keep as-is
        const bb = bboxOf(l.polygon)
        const w = bb.maxE - bb.minE
        const h = bb.maxN - bb.minN
        const stepE = w * 1.06
        const stepN = h * 1.06
        let placed: { e: number; n: number } | null = null
        scan: for (let n = extNew.maxN - h / 2 - 0.02; n >= extNew.minN + h / 2; n -= stepN) {
          for (let e = extNew.minE + w / 2 + 0.02; e <= extNew.maxE - w / 2; e += stepE) {
            const cand: LocalExtent = {
              minE: e - w / 2,
              maxE: e + w / 2,
              minN: n - h / 2,
              maxN: n + h / 2,
            }
            if (!pointInPolygon(fromLocal(centre, e, n, rot), newPolygon)) continue
            if (occupied.some((o) => overlaps2(o, cand))) continue
            placed = { e, n }
            occupied.push(cand)
            break scan
          }
        }
        if (!placed) {
          removed.push(l.id)
          continue
        }
        const dE = placed.e - (bb.minE + bb.maxE) / 2
        const dN = placed.n - (bb.minN + bb.maxN) / 2
        const polygon = l.polygon.map((v) => {
          const p = toLocal(centre, v, rot)
          return fromLocal(centre, p.e + dE, p.n + dN, rot)
        })
        relocations.set(l.id, {
          ...l,
          polygon,
          centroid: polygonCentroid(polygon),
          updatedAt: NOW,
        })
        relocatedCount++
      }

      const removedSet = new Set(removed)
      mutate((st) => {
        const lots = st.lots
          .filter((l) => !(l.blockId === id && removedSet.has(l.id)))
          .map((l) => relocations.get(l.id) ?? l)
        return {
          blocks: st.blocks.map((b) =>
            b.id === id
              ? {
                  ...b,
                  polygon: newPolygon,
                  centroid: polygonCentroid(newPolygon),
                  lotCount: lots.filter((l) => l.blockId === id).length,
                  updatedAt: NOW,
                }
              : b,
          ),
          lots,
          overlaps: detectOverlaps(lots),
        }
      })
      return { ok: true, relocated: relocatedCount, removed: removed.length, blockedBy: 0 }
    },

    beginDrag: (kind, blockId) => {
      const s = get()
      if (s.dragSession) return false
      if (kind === 'lots') {
        const lotIds = [...s.selection].filter((lid) => {
          const l = s.lots.find((x) => x.id === lid)
          return !!l && !isProtected(l)
        })
        if (lotIds.length === 0) return false
        set({
          dragSession: {
            kind,
            lotIds,
            blockId: null,
            base: snapshotOf(s),
            dirtyBefore: s.dirty,
            moved: false,
          },
        })
        return true
      }
      if (!blockId) return false
      set({
        dragSession: {
          kind,
          lotIds: [],
          blockId,
          base: snapshotOf(s),
          dirtyBefore: s.dirty,
          moved: false,
        },
      })
      return true
    },

    previewDrag: (deltaLat, deltaLng) => {
      const s = get()
      const d = s.dragSession
      if (!d) return
      const selection: AlignmentSelection =
        d.kind === 'lots'
          ? { target: 'lots', blockId: null, lotIds: d.lotIds, overlayId: null }
          : { target: 'block', blockId: d.blockId, lotIds: [], overlayId: null }
      const base = { blocks: d.base.blocks, lots: d.base.lots, overlays: d.base.overlays }
      const next = applyAlignmentTransform(
        base,
        selection,
        { ...identityAlignmentTransform(), deltaLat, deltaLng },
        NOW,
      )
      set({
        blocks: next.blocks,
        lots: next.lots,
        overlaps: detectOverlaps(next.lots),
        dirty: true,
        dragSession: { ...d, moved: true },
      })
    },

    endDrag: (commit) => {
      const s = get()
      const d = s.dragSession
      if (!d) return
      if (!commit || !d.moved) {
        set({
          ...restore(d.base),
          dragSession: null,
          dirty: d.dirtyBefore,
          overlaps: detectOverlaps(d.base.lots),
        })
        return
      }
      set({ undoStack: pushUndo(d.base, s), redoStack: [], dragSession: null, dirty: true })
    },

    publish: (actorUserId, auditGroups) => {
      const s = get()
      const live = dataset()
      const locationId = s.locationId

      const scopeBlockIds = new Set<BlockId>([
        ...s.baseline.blocks.map((b) => b.id),
        ...s.blocks.map((b) => b.id),
      ])

      // Blocks: everything in scope is replaced wholesale by the draft.
      live.blocks = [
        ...live.blocks.filter((b) => !scopeBlockIds.has(b.id)),
        ...clone(s.blocks).map((b) => ({
          ...b,
          lotCount: s.lots.filter((l) => l.blockId === b.id).length,
        })),
      ]
      live.lots = [
        ...live.lots.filter((l) => !scopeBlockIds.has(l.blockId)),
        ...clone(s.lots),
      ]
      // Overlays are published whole. `visible` is the flag the main map's
      // "Show site plan" switch reads, so publishing one with it set makes it
      // appear there with no further wiring.
      live.overlays = [
        ...live.overlays.filter((o) => !locationId || o.locationId !== locationId),
        ...clone(s.overlays),
      ]

      // One audit event per change group — the review dialog and the audit
      // trail therefore tell exactly the same story.
      for (const g of auditGroups) {
        live.audit.unshift({
          id: asId<'Audit'>(`aud_${++auditSeq}`),
          actorUserId,
          action: g.action,
          entityType: g.entityType,
          entityId: g.entityId,
          before: null,
          after: { summary: g.label, count: g.count, lots: g.codes.slice(0, 40) },
          at: NOW,
        })
      }

      useDataset.getState().touch()

      set({
        // The draft now equals the data it just published — record the
        // post-publish version so the clean draft is not re-hydrated away.
        datasetVersion: useDataset.getState().version,
        baseline: {
          blocks: clone(s.blocks),
          lots: clone(s.lots),
          overlays: clone(s.overlays),
        },
        undoStack: [],
        redoStack: [],
        overlayEditBase: null,
        editingBlock: null,
        alignmentSession: null,
        moveTargetBlockId: null,
        dirty: false,
      })
    },

    // ── chrome ──────────────────────────────────────────────────────
    setEditorMode: (editorMode) =>
      set((s) => {
        const restoreBase = s.alignmentSession ? restore(s.alignmentSession.base) : {}
        return {
          ...restoreBase,
          editorMode,
          layerMode: editorMode === 'align' ? s.layerMode : 'lots',
          tool: editorMode === 'align' ? 'select' : s.tool,
          pendingBlock: editorMode === 'align' ? null : s.pendingBlock,
          editingBlock: editorMode === 'align' ? null : s.editingBlock,
          alignmentSession: null,
          moveTargetBlockId: editorMode === 'align' ? null : s.moveTargetBlockId,
          dirty: s.alignmentSession ? s.alignmentSession.dirtyBefore : s.dirty,
          overlaps: s.alignmentSession ? detectOverlaps(s.alignmentSession.base.lots) : s.overlaps,
        }
      }),
    setLayerMode: (layerMode) =>
      set((s) => {
        const restoreBase = s.alignmentSession ? restore(s.alignmentSession.base) : {}
        const alignTarget: AlignmentTarget =
          layerMode === 'sitePlan'
            ? 'overlay'
            : layerMode === 'blocks'
              ? 'block'
              : layerMode === 'lots'
                ? 'lots'
                : 'layout'
        const inventoryTool: Tool =
          layerMode === 'blocks'
            ? 'block'
            : layerMode === 'tiers' || layerMode === 'lots'
              ? 'select'
              : 'select'
        const shouldUseInventory = layerMode === 'tiers'
        return {
          ...restoreBase,
          layerMode,
          editorMode: shouldUseInventory ? 'inventory' : 'align',
          alignmentTarget: alignTarget,
          tool: shouldUseInventory ? inventoryTool : 'select',
          layers: layerMode === 'sitePlan' ? { ...s.layers, sitePlan: true } : s.layers,
          pendingBlock: null,
          editingBlock: null,
          alignmentSession: null,
          moveTargetBlockId: null,
          tierPaintTierId: layerMode === 'tiers' ? s.tierPaintTierId : null,
          dirty: s.alignmentSession ? s.alignmentSession.dirtyBefore : s.dirty,
          overlaps: s.alignmentSession ? detectOverlaps(s.alignmentSession.base.lots) : s.overlaps,
        }
      }),
    setTool: (tool) =>
      set((s) => ({
        ...(s.alignmentSession ? restore(s.alignmentSession.base) : {}),
        editorMode: 'inventory',
        layerMode:
          tool === 'overlay'
            ? 'sitePlan'
            : tool === 'block' || tool === 'blockFree' || tool === 'editBlock' || tool === 'grid'
              ? 'blocks'
              : tool === 'select' || tool === 'draw' || tool === 'lotRect'
                ? 'lots'
                : s.layerMode,
        tool,
        alignmentSession: null,
        dirty: s.alignmentSession ? s.alignmentSession.dirtyBefore : s.dirty,
        overlaps: s.alignmentSession ? detectOverlaps(s.alignmentSession.base.lots) : s.overlaps,
        pendingBlock: tool === 'block' || tool === 'blockFree' ? s.pendingBlock : null,
        editingBlock:
          tool === 'editBlock'
            ? s.editingBlock ??
              (s.activeBlockId
                ? (() => {
                    const block = s.blocks.find((b) => b.id === s.activeBlockId)
                    return block ? blockEditFrom(block) : null
                  })()
                : null)
            : null,
      })),
    setAlignmentTarget: (alignmentTarget) =>
      set((s) => {
        const restoreBase = s.alignmentSession ? restore(s.alignmentSession.base) : {}
        return {
          ...restoreBase,
          alignmentTarget,
          layerMode:
            alignmentTarget === 'overlay'
              ? 'sitePlan'
              : alignmentTarget === 'block'
                ? 'blocks'
                : alignmentTarget === 'lots'
                  ? 'lots'
                  : s.layerMode,
          alignmentSession: null,
          editorMode: 'align',
          tool: 'select',
          pendingBlock: null,
          editingBlock: null,
          moveTargetBlockId: null,
          dirty: s.alignmentSession ? s.alignmentSession.dirtyBefore : s.dirty,
          overlaps: s.alignmentSession ? detectOverlaps(s.alignmentSession.base.lots) : s.overlaps,
        }
      }),
    beginAlignment: () => {
      const s = get()
      const session = ensureAlignmentSession(s)
      if (!session) return false
      set({ alignmentSession: session, editorMode: 'align', tool: 'select' })
      return true
    },
    previewAlignment: (patch) => {
      const s = get()
      const session = ensureAlignmentSession(s)
      if (!session) return false
      const transform = { ...session.transform, ...patch }
      set(previewAlignmentFrom(s, session, transform))
      return true
    },
    translateAlignment: ([deltaLat, deltaLng]) => {
      const s = get()
      const session = ensureAlignmentSession(s)
      if (!session) return false
      const transform = {
        ...session.transform,
        deltaLat: session.transform.deltaLat + deltaLat,
        deltaLng: session.transform.deltaLng + deltaLng,
      }
      set(previewAlignmentFrom(s, session, transform))
      return true
    },
    nudgeAlignmentMeters: (eastM, northM) => {
      const s = get()
      const session = ensureAlignmentSession(s)
      if (!session) return false
      const frame = alignmentFrame(session.base, session.selection)
      if (!frame) return false
      const transform = nudgeTransformMeters(session.transform, frame.pivot, eastM, northM)
      set(previewAlignmentFrom(s, session, transform))
      return true
    },
    cancelAlignment: () => {
      const s = get()
      const session = s.alignmentSession
      if (!session) return
      set({
        ...restore(session.base),
        alignmentSession: null,
        dirty: session.dirtyBefore,
        overlaps: detectOverlaps(session.base.lots),
      })
    },
    commitAlignment: () => {
      const s = get()
      const session = s.alignmentSession
      if (!session) return null
      const frame = alignmentFrame({ blocks: s.blocks, lots: s.lots, overlays: s.overlays }, session.selection)
      set({
        undoStack: pushUndo(session.base, s),
        redoStack: [],
        alignmentSession: null,
        dirty: true,
      })
      return {
        label: session.label,
        target: session.selection.target,
        count: frame?.count ?? 1,
      }
    },
    setLayer: (k, v) => set((s) => ({ layers: { ...s.layers, [k]: v } })),
    setCompare: (compare) => set({ compare }),
    setGrid: (patch) =>
      set((s) => {
        const grid = { ...s.grid, ...patch }
        if (!grid.splitGutters) grid.rowGutterM = grid.gutterM
        return { grid, showPreview: true }
      }),
    /**
     * Selecting a block loads the parameters that built it, so the Grid tool
     * opens on the block's own grid rather than on a stale one.
     */
    setActiveBlock: (activeBlockId) =>
      set((s) =>
        s.activeBlockId === activeBlockId
          ? {}
          : {
              activeBlockId,
              showPreview: true,
              grid: gridFor(s, activeBlockId),
              editingBlock:
                s.tool === 'editBlock' && activeBlockId
                  ? (() => {
                      const block = s.blocks.find((b) => b.id === activeBlockId)
                      return block ? blockEditFrom(block, s.editingBlock?.moveLots ?? false) : null
                    })()
                  : s.editingBlock,
            },
      ),
    setActiveOverlay: (activeOverlayId) => set({ activeOverlayId }),
    setMoveTargetBlock: (moveTargetBlockId) => set({ moveTargetBlockId }),
    setTierPaintTier: (tierPaintTierId) => set({ tierPaintTierId, layerMode: 'tiers' }),

    // ── undo ────────────────────────────────────────────────────────
    undo: () => {
      const s = get()
      if (s.alignmentSession) {
        set({
          ...restore(s.alignmentSession.base),
          alignmentSession: null,
          dirty: s.alignmentSession.dirtyBefore,
          overlaps: detectOverlaps(s.alignmentSession.base.lots),
        })
        return
      }
      const prev = s.undoStack[s.undoStack.length - 1]
      if (!prev) return
      set({
        ...restore(prev),
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, snapshotOf(s)],
        editingBlock: null,
        alignmentSession: null,
        moveTargetBlockId: null,
        dirty: true,
      })
      get().recheckOverlaps()
    },

    redo: () => {
      const s = get()
      if (s.alignmentSession) {
        set({
          ...restore(s.alignmentSession.base),
          alignmentSession: null,
          dirty: s.alignmentSession.dirtyBefore,
          overlaps: detectOverlaps(s.alignmentSession.base.lots),
        })
        return
      }
      const next = s.redoStack[s.redoStack.length - 1]
      if (!next) return
      set({
        ...restore(next),
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snapshotOf(s)],
        editingBlock: null,
        alignmentSession: null,
        moveTargetBlockId: null,
        dirty: true,
      })
      get().recheckOverlaps()
    },

    // ── selection ───────────────────────────────────────────────────
    setSelection: (ids) => set({ selection: new Set(ids) }),
    addSelection: (ids) =>
      set((s) => {
        const next = new Set(s.selection)
        for (const id of ids) next.add(id)
        return { selection: next }
      }),
    toggleSelection: (id) =>
      set((s) => {
        const next = new Set(s.selection)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { selection: next }
      }),
    subtractSelection: (ids) =>
      set((s) => {
        const next = new Set(s.selection)
        for (const id of ids) next.delete(id)
        return { selection: next }
      }),
    clearSelection: () => set({ selection: new Set() }),

    // ── blocks ──────────────────────────────────────────────────────
    setPendingBlock: (pendingBlock) => set({ pendingBlock }),
    patchPendingBlock: (patch) =>
      set((s) => (s.pendingBlock ? { pendingBlock: { ...s.pendingBlock, ...patch } } : {})),

    commitPendingBlock: () => {
      const s = get()
      const p = s.pendingBlock
      if (!p || !s.locationId) return null
      const id = newBlockId()
      const block: Block = {
        id,
        locationId: s.locationId,
        code: p.code.trim(),
        name: p.name.trim() || null,
        polygon: p.polygon,
        centroid: polygonCentroid(p.polygon),
        grid: null,
        defaultTierId: p.defaultTierId,
        lotCount: 0,
        active: true,
        createdAt: NOW,
        updatedAt: NOW,
      }
      mutate((st) => ({
        blocks: [...st.blocks, block],
        activeBlockId: id,
        pendingBlock: null,
        editorMode: 'inventory',
        tool: 'select',
        grid: {
          ...st.grid,
          tierId: p.defaultTierId ?? st.grid.tierId,
          rotationDeg: p.rotationDeg,
          startNumber: 1,
        },
      }))
      return id
    },

    commitPendingBlockWithLots: (tier, fill) => {
      const s = get()
      const p = s.pendingBlock
      if (!p || !s.locationId) return null
      const rows = Math.max(1, Math.round(fill.rows))
      const cols = Math.max(1, Math.round(fill.cols))
      const plan = planGrid({
        rows,
        cols,
        cellWidthM: tier.widthM,
        cellLengthM: tier.lengthM,
        gutterM: fill.gutterM,
        rowGutterM: fill.rowGutterM,
        rotationDeg: p.rotationDeg,
        numbering: 'boustrophedon',
        startNumber: 1,
        boundary: p.polygon,
      })
      const id = newBlockId()
      const lots = buildLots({
        cells: plan.cells,
        blockId: id,
        locationId: s.locationId,
        tier,
        now: NOW,
      })
      const block: Block = {
        id,
        locationId: s.locationId,
        code: p.code.trim(),
        name: p.name.trim() || null,
        polygon: p.polygon,
        centroid: polygonCentroid(p.polygon),
        grid: {
          rows,
          cols,
          rotationDeg: p.rotationDeg,
          gutterM: fill.gutterM,
          numbering: 'boustrophedon',
        },
        defaultTierId: tier.id,
        lotCount: lots.length,
        active: true,
        createdAt: NOW,
        updatedAt: NOW,
      }
      mutate((st) => {
        const all = [...st.lots, ...lots]
        return {
          blocks: [...st.blocks, block],
          lots: all,
          activeBlockId: id,
          pendingBlock: null,
          editorMode: 'inventory',
          tool: 'select',
          layerMode: 'lots',
          selection: new Set<LotId>(),
          overlaps: detectOverlaps(all),
          showPreview: false,
          grid: {
            ...st.grid,
            tierId: tier.id,
            rows,
            cols,
            gutterM: fill.gutterM,
            rowGutterM: fill.rowGutterM,
            splitGutters: fill.rowGutterM !== fill.gutterM,
            rotationDeg: p.rotationDeg,
            startNumber: 1,
          },
        }
      })
      return { id, count: lots.length }
    },

    startBlockEdit: (id) => {
      const s = get()
      const block = s.blocks.find((b) => b.id === id)
      if (!block) return
      set({
        editorMode: 'inventory',
        tool: 'editBlock',
        activeBlockId: id,
        editingBlock: blockEditFrom(block, s.editingBlock?.moveLots ?? false),
        pendingBlock: null,
        selection: new Set(),
      })
    },

    patchEditingBlock: (patch) =>
      set((s) =>
        s.editingBlock ? { editingBlock: { ...s.editingBlock, ...patch } } : {},
      ),

    cancelBlockEdit: () => set({ editingBlock: null }),

    commitBlockEdit: () => {
      const s = get()
      const edit = s.editingBlock
      const block = edit ? s.blocks.find((b) => b.id === edit.id) : null
      if (!edit || !block) return null

      const inBlock = s.lots.filter((l) => l.blockId === edit.id)
      const protectedLots = inBlock.filter(isProtected).length
      let movedLots = 0
      const moved = edit.moveLots
        ? s.lots.map((l) => {
            if (l.blockId !== edit.id || isProtected(l)) return l
            movedLots++
            return transformLotBetweenBlocks(l, edit.originalPolygon, edit.polygon, NOW)
          })
        : s.lots
      const editedBlock: Block = {
        ...block,
        polygon: edit.polygon,
        centroid: polygonCentroid(edit.polygon),
        grid: block.grid ? { ...block.grid, rotationDeg: edit.rotationDeg } : block.grid,
        updatedAt: NOW,
      }

      mutate((st) => ({
        blocks: st.blocks.map((b) => (b.id === edit.id ? editedBlock : b)),
        lots: moved,
        activeBlockId: edit.id,
        editingBlock: blockEditFrom(editedBlock, edit.moveLots),
        overlaps: detectOverlaps(moved),
      }))
      return { movedLots, protectedLots }
    },

    updateBlock: (id, patch) =>
      mutate((s) => ({
        blocks: s.blocks.map((b) =>
          b.id === id
            ? {
                ...b,
                ...patch,
                centroid: patch.polygon ? polygonCentroid(patch.polygon) : b.centroid,
                updatedAt: NOW,
              }
            : b,
        ),
      })),

    deleteBlock: (id) => {
      const s = get()
      // A block holding sold/occupied/interred lots can never be deleted.
      const protectedCount = s.lots.filter((l) => l.blockId === id && isProtected(l)).length
      if (protectedCount > 0) return protectedCount
      mutate((st) => ({
        blocks: st.blocks.filter((b) => b.id !== id),
        lots: st.lots.filter((l) => l.blockId !== id),
        activeBlockId: st.activeBlockId === id ? null : st.activeBlockId,
        view: { screen: 'home' } as EditorView,
        selection: new Set(
          [...st.selection].filter((lid) => st.lots.find((l) => l.id === lid)?.blockId !== id),
        ),
      }))
      return 0
    },

    // ── lots ────────────────────────────────────────────────────────
    generate: (mode, plan, tier) => {
      const s = get()
      const blockId = s.activeBlockId
      if (!blockId || !s.locationId) return null
      const existing = s.lots.filter((l) => l.blockId === blockId)
      const result = regenerate({
        mode,
        existing,
        plan,
        blockId,
        locationId: s.locationId,
        tier,
        now: NOW,
      })
      const others = s.lots.filter((l) => l.blockId !== blockId)
      const lots = [...others, ...result.lots]
      mutate((st) => ({
        lots,
        blocks: st.blocks.map((b) =>
          b.id === blockId
            ? {
                ...b,
                lotCount: result.lots.length,
                defaultTierId: b.defaultTierId ?? tier.id,
                grid: {
                  rows: Math.round(st.grid.rows),
                  cols: Math.round(st.grid.cols),
                  rotationDeg: st.grid.rotationDeg,
                  gutterM: st.grid.gutterM,
                  numbering: st.grid.numbering,
                },
                updatedAt: NOW,
              }
            : b,
        ),
        selection: new Set<LotId>(),
        overlaps: detectOverlaps(lots),
        showPreview: false,
      }))
      return result
    },

    rearrangeExistingLots: (plan, tiersById) => {
      const s = get()
      const blockId = s.activeBlockId
      if (!blockId) return null
      const existing = s.lots.filter((lot) => lot.blockId === blockId)
      if (existing.length === 0) return null

      const result = rearrangeExistingLots({
        existing,
        plan,
        tiersById,
        rotationDeg: s.grid.rotationDeg,
        now: NOW,
      })
      if (result.overflow > 0) return result

      const rearrangedById = new Map(result.lots.map((lot) => [lot.id, lot]))
      const lots = s.lots.map((lot) => rearrangedById.get(lot.id) ?? lot)
      mutate((st) => ({
        lots,
        blocks: st.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                lotCount: result.lots.length,
                grid: {
                  rows: Math.round(st.grid.rows),
                  cols: Math.round(st.grid.cols),
                  rotationDeg: st.grid.rotationDeg,
                  gutterM: st.grid.gutterM,
                  numbering: st.grid.numbering,
                },
                updatedAt: NOW,
              }
            : block,
        ),
        overlaps: detectOverlaps(lots),
        showPreview: false,
      }))
      return result
    },

    addFreeLot: (polygon, tier) => {
      const s = get()
      const blockId = s.activeBlockId
      if (!blockId || !s.locationId) return
      const inBlock = s.lots.filter((l) => l.blockId === blockId)
      const [lot] = buildLots({
        cells: [
          {
            lotNumber: inBlock.reduce((m, l) => Math.max(m, l.lotNumber), 0) + 1,
            row: 0,
            col: 0,
            polygon,
            centroid: polygonCentroid(polygon),
          },
        ],
        blockId,
        locationId: s.locationId,
        tier,
        now: NOW,
      })
      if (!lot) return
      mutate((st) => ({ lots: [...st.lots, lot], selection: new Set([lot.id]) }))
    },

    changeTier: (ids, tier) => {
      const set0 = new Set(ids)
      mutate((s) => ({
        lots: s.lots.map((l) => {
          if (!set0.has(l.id)) return l
          const block = s.blocks.find((b) => b.id === l.blockId)
          const resized = resizeLot(l, tier.widthM, tier.lengthM, block?.grid?.rotationDeg ?? s.grid.rotationDeg, NOW)
          return { ...resized, tierId: tier.id, capacity: safeCapacity(l, tier), updatedAt: NOW }
        }),
      }))
      get().recheckOverlaps()
    },

    syncTierFootprints: (ids, tiersById) => {
      const s = get()
      const targetIds = ids ? new Set(ids) : null
      const changed: LotId[] = []
      const lots = s.lots.map((lot) => {
        if (targetIds && !targetIds.has(lot.id)) return lot
        const tier = tiersById.get(lot.tierId)
        if (!tier) return lot
        const block = s.blocks.find((b) => b.id === lot.blockId)
        const resized = resizeLot(
          lot,
          tier.widthM,
          tier.lengthM,
          block?.grid?.rotationDeg ?? s.grid.rotationDeg,
          NOW,
        )
        if (JSON.stringify(resized.polygon) !== JSON.stringify(lot.polygon)) changed.push(lot.id)
        return resized
      })
      if (changed.length > 0) {
        mutate(() => ({ lots, overlaps: detectOverlaps(lots) }))
      }
      return changed
    },

    changeStatus: (ids, status, reason) => {
      const set0 = new Set(ids)
      mutate((s) => ({
        lots: s.lots.map((l) =>
          set0.has(l.id) && !isProtected(l) && l.status !== 'held'
            ? {
                ...l,
                status,
                notForSaleReason: status === 'not_for_sale' ? reason : null,
                updatedAt: NOW,
              }
            : l,
        ),
      }))
    },

    renumberSelection: (ids, scheme, start) => {
      const s = get()
      const set0 = new Set(ids)
      const target = s.lots.filter((l) => set0.has(l.id))
      if (target.length === 0) return
      const block = s.blocks.find((b) => b.id === target[0]!.blockId)
      const renumbered = renumber(
        target,
        block?.grid?.rotationDeg ?? s.grid.rotationDeg,
        scheme,
        start,
        NOW,
      )
      const byId = new Map(renumbered.map((l) => [l.id, l]))
      mutate((st) => ({ lots: st.lots.map((l) => byId.get(l.id) ?? l) }))
    },

    moveToBlock: (ids, target) => {
      const s = get()
      const set0 = new Set(ids)
      const refused: LotId[] = []
      const moving = s.lots.filter((l) => {
        if (!set0.has(l.id)) return false
        if (isProtected(l)) {
          refused.push(l.id)
          return false
        }
        return true
      })
      if (moving.length === 0) return refused
      let next = s.lots
        .filter((l) => l.blockId === target)
        .reduce((m, l) => Math.max(m, l.lotNumber), 0)
      const movedIds = new Set(moving.map((l) => l.id))
      const lots = s.lots.map((l) =>
        movedIds.has(l.id)
          ? { ...l, blockId: target, lotNumber: ++next, updatedAt: NOW }
          : l,
      )
      mutate(() => ({ lots, overlaps: detectOverlaps(lots) }))
      return refused
    },

    resizeSelection: (ids, widthM, lengthM) => {
      const s = get()
      const set0 = new Set(ids)
      const refused: LotId[] = []
      const rot = s.grid.rotationDeg
      const lots = s.lots.map((l) => {
        if (!set0.has(l.id)) return l
        if (isProtected(l)) {
          refused.push(l.id)
          return l
        }
        const block = s.blocks.find((b) => b.id === l.blockId)
        return resizeLot(l, widthM, lengthM, block?.grid?.rotationDeg ?? rot, NOW)
      })
      mutate(() => ({ lots, overlaps: detectOverlaps(lots) }))
      return refused
    },

    transformLots: (ids, t) => {
      const s = get()
      const refused: LotId[] = []
      const byId = new Map(s.lots.map((l) => [l.id, l]))
      const movable: LotId[] = []
      for (const id of ids) {
        const lot = byId.get(id)
        if (!lot) continue
        if (isProtected(lot)) refused.push(id)
        else movable.push(id)
      }
      if (movable.length === 0) return refused

      const selection = {
        target: 'lots' as const,
        blockId: null,
        lotIds: movable,
        overlayId: null,
      }
      const draft = { blocks: s.blocks, lots: s.lots, overlays: s.overlays }
      const frame = alignmentFrame(draft, selection)
      if (!frame) return refused

      let transform = identityAlignmentTransform()
      if (t.rotateDeg) transform = { ...transform, rotationDeg: t.rotateDeg }
      if (t.eastM || t.northM) {
        transform = nudgeTransformMeters(transform, frame.pivot, t.eastM ?? 0, t.northM ?? 0)
      }
      const next = applyAlignmentTransform(draft, selection, transform, NOW)

      const key = [...movable].sort().join('|')
      const at = Date.now()
      if (key === lastTransformKey && at - lastTransformAt < TRANSFORM_COALESCE_MS) {
        set({ lots: next.lots, overlaps: detectOverlaps(next.lots), dirty: true })
      } else {
        mutate(() => ({ lots: next.lots, overlaps: detectOverlaps(next.lots) }))
      }
      lastTransformKey = key
      lastTransformAt = at
      return refused
    },

    duplicateLots: (ids, tiersById) => {
      const s = get()
      if (!s.locationId) return []
      const locationId = s.locationId
      const idSet = new Set(ids)
      const src = s.lots.filter((l) => idSet.has(l.id))
      if (src.length === 0) return []

      // Group by block × tier so buildLots mints ids and numbers per batch.
      const groups = new Map<string, Lot[]>()
      for (const l of src) {
        const key = `${l.blockId}|${l.tierId}`
        const g = groups.get(key)
        if (g) g.push(l)
        else groups.set(key, [l])
      }

      const created: Lot[] = []
      for (const group of groups.values()) {
        const first = group[0]!
        const tier = tiersById.get(first.tierId)
        if (!tier) continue
        const block = s.blocks.find((b) => b.id === first.blockId)
        const gutter = block?.grid?.gutterM ?? s.grid.gutterM
        const used = [
          ...s.lots.filter((l) => l.blockId === first.blockId).map((l) => l.lotNumber),
          ...created.filter((c) => c.blockId === first.blockId).map((c) => c.lotNumber),
        ]
        let nextNumber = used.reduce((m, n) => Math.max(m, n), 0)
        const cells = group.map((l) => {
          // One pitch along the lot's own top edge — its row direction — so
          // chained duplicates stamp out a row even on rotated, messy grids.
          const p0 = l.polygon[0]!
          const p1 = l.polygon[1] ?? p0
          const edge = toLocal(p0, p1, 0)
          const len = Math.hypot(edge.e, edge.n)
          const f = len > 0.01 ? (len + gutter) / len : 1
          const polygon = l.polygon.map((v) => offsetMetres(v, edge.e * f, edge.n * f))
          return {
            lotNumber: ++nextNumber,
            row: 0,
            col: 0,
            polygon,
            centroid: polygonCentroid(polygon),
          }
        })
        created.push(
          ...buildLots({
            cells,
            blockId: first.blockId,
            locationId,
            tier,
            now: NOW,
            used: new Set(used),
          }),
        )
      }
      if (created.length === 0) return []

      mutate((st) => {
        const lots = [...st.lots, ...created]
        return {
          lots,
          selection: new Set(created.map((c) => c.id)),
          overlaps: detectOverlaps(lots),
          blocks: st.blocks.map((b) => {
            const added = created.filter((c) => c.blockId === b.id).length
            return added > 0 ? { ...b, lotCount: b.lotCount + added, updatedAt: NOW } : b
          }),
        }
      })
      return created.map((c) => c.id)
    },

    deleteLots: (ids) => {
      const set0 = new Set(ids)
      mutate((s) => {
        const lots = s.lots.filter((l) => !(set0.has(l.id) && !isProtected(l)))
        return {
          lots,
          selection: new Set<LotId>(),
          overlaps: detectOverlaps(lots),
        }
      })
    },

    repairOverlaps: () => {
      const s = get()
      const { lots } = fixOverlaps(s.lots, NOW)
      mutate(() => ({ lots, overlaps: detectOverlaps(lots) }))
    },

    recheckOverlaps: () => set((s) => ({ overlaps: detectOverlaps(s.lots) })),

    // ── overlays ────────────────────────────────────────────────────
    lockedOverlays: new Set<OverlayId>(),

    toggleOverlayLock: (id) =>
      set((s) => {
        const next = new Set(s.lockedOverlays)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { lockedOverlays: next }
      }),

    addOverlay: (o) =>
      mutate((s) => ({ overlays: [...s.overlays, o], activeOverlayId: o.id })),

    updateOverlay: (id, patch) =>
      mutate((s) => ({
        overlays: s.overlays.map((o) =>
          o.id === id ? { ...o, ...patch, updatedAt: NOW } : o,
        ),
      })),

    removeOverlay: (id) =>
      mutate((s) => ({
        overlays: s.overlays.filter((o) => o.id !== id),
        activeOverlayId: s.activeOverlayId === id ? null : s.activeOverlayId,
      })),

    beginOverlayEdit: () => set({ overlayEditBase: snapshotOf(get()) }),

    overlayLive: (id, patch) =>
      set((s) => ({
        overlays: s.overlays.map((o) =>
          o.id === id ? { ...o, ...patch, updatedAt: NOW } : o,
        ),
        dirty: true,
      })),

    commitOverlayEdit: () => {
      const s = get()
      if (!s.overlayEditBase) return
      const stack = [...s.undoStack, s.overlayEditBase]
      if (stack.length > UNDO_DEPTH) stack.shift()
      set({ undoStack: stack, redoStack: [], overlayEditBase: null, dirty: true })
    },
  }
})

// ── helpers the panels reach for ─────────────────────────────────────

export function makeOverlay(
  locationId: LocationId,
  name: string,
  imageUrl: string,
  bounds: Bounds,
  zIndex: number,
): MapOverlay {
  return {
    id: newOverlayId(),
    locationId,
    name,
    imageUrl,
    bounds,
    rotationDeg: 0,
    opacity: 0.45,
    visible: true,
    zIndex,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

/** Lots of a block, in numbering order. */
export const lotsOfBlock = (lots: Lot[], id: BlockId | null) =>
  id ? lots.filter((l) => l.blockId === id).sort((a, b) => a.lotNumber - b.lotNumber) : []

// ── draft persistence ─────────────────────────────────────────────────
// Dirty drafts auto-save (debounced) so a reload never loses tuning work;
// publish/discard turn `dirty` off, which clears the saved copy.
let draftSaveTimer: number | null = null
useEditor.subscribe(() => {
  if (typeof window === 'undefined') return
  if (draftSaveTimer !== null) window.clearTimeout(draftSaveTimer)
  draftSaveTimer = window.setTimeout(() => {
    draftSaveTimer = null
    const s = useEditor.getState()
    try {
      if (!s.dirty) {
        localStorage.removeItem(DRAFT_KEY)
      } else if (!s.dragSession) {
        const saved: SavedDraft = {
          locationId: s.locationId,
          datasetVersion: s.datasetVersion,
          baseline: s.baseline,
          blocks: s.blocks,
          lots: s.lots,
          overlays: s.overlays,
        }
        localStorage.setItem(DRAFT_KEY, JSON.stringify(saved))
      }
    } catch {
      /* storage unavailable/full — persistence is best-effort */
    }
  }, 600)
})
