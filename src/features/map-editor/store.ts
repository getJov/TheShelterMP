import { create } from 'zustand'
import {
  asId,
  type AuditAction,
  type Block,
  type BlockId,
  type Bounds,
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
import { polygonCentroid } from '@/lib/geo'
import {
  buildLots,
  detectOverlaps,
  fixOverlaps,
  isProtected,
  newBlockId,
  newOverlayId,
  regenerate,
  renumber,
  resizeLot,
  safeCapacity,
  transformLotBetweenBlocks,
  type GridPlan,
  type Numbering,
  type RegenMode,
  type RegenResult,
} from '@/lib/grid-generator'
import {
  alignmentFrame,
  applyAlignmentTransform,
  identityAlignmentTransform,
  nudgeTransformMeters,
  type AlignmentSelection,
  type AlignmentTarget,
  type AlignmentTransform,
} from './geometry-transform'

export type Tool = 'select' | 'editBlock' | 'block' | 'grid' | 'draw' | 'overlay'
export type EditorMode = 'align' | 'inventory'
export type EditorLayerMode = 'baseMap' | 'sitePlan' | 'blocks' | 'lots' | 'tiers' | 'review'

export const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  e: 'editBlock',
  b: 'block',
  g: 'grid',
  d: 'draw',
  o: 'overlay',
}

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

interface EditorState extends DraftState {
  locationId: LocationId | null
  /** Snapshot of the live data the drafts were forked from. Drives the diff. */
  baseline: DraftState

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

  // lifecycle
  hydrate: (locationId: LocationId | null, force?: boolean) => void
  discard: () => void
  publish: (actorUserId: UserId, audit: PublishAudit[]) => void

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
  startBlockEdit: (id: BlockId) => void
  patchEditingBlock: (patch: Partial<Pick<EditingBlock, 'polygon' | 'rotationDeg' | 'moveLots'>>) => void
  cancelBlockEdit: () => void
  commitBlockEdit: () => BlockEditResult | null
  updateBlock: (id: BlockId, patch: Partial<Block>) => void
  deleteBlock: (id: BlockId) => void

  // lots
  generate: (mode: RegenMode, plan: GridPlan, tier: Tier) => RegenResult | null
  addFreeLot: (polygon: Polygon, tier: Tier) => void
  changeTier: (ids: LotId[], tier: Tier) => void
  syncTierFootprints: (ids: LotId[] | null, tiersById: Map<TierId, Tier>) => LotId[]
  changeStatus: (ids: LotId[], status: LotStatus, reason: string | null) => void
  renumberSelection: (ids: LotId[], scheme: Numbering, start: number) => void
  moveToBlock: (ids: LotId[], target: BlockId) => LotId[]
  resizeSelection: (ids: LotId[], widthM: number, lengthM: number) => LotId[]
  deleteLots: (ids: LotId[]) => void
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
    baseline: emptyDraft(),
    ...emptyDraft(),

    editorMode: 'align',
    layerMode: 'baseMap',
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
      if (!force && s.locationId === locationId && (s.dirty || s.blocks.length > 0)) return
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
        editorMode: 'align',
        layerMode: 'baseMap',
        tool: 'select',
        tierPaintTierId: null,
      })
    },

    discard: () => get().hydrate(get().locationId, true),

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
            : tool === 'block' || tool === 'editBlock' || tool === 'grid'
              ? 'blocks'
              : tool === 'select' || tool === 'draw'
                ? 'lots'
                : s.layerMode,
        tool,
        alignmentSession: null,
        dirty: s.alignmentSession ? s.alignmentSession.dirtyBefore : s.dirty,
        overlaps: s.alignmentSession ? detectOverlaps(s.alignmentSession.base.lots) : s.overlaps,
        pendingBlock: tool === 'block' ? s.pendingBlock : null,
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
        tool: 'grid',
        grid: {
          ...st.grid,
          tierId: p.defaultTierId ?? st.grid.tierId,
          rotationDeg: p.rotationDeg,
          startNumber: 1,
        },
      }))
      return id
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

    deleteBlock: (id) =>
      mutate((s) => ({
        blocks: s.blocks.filter((b) => b.id !== id),
        lots: s.lots.filter((l) => l.blockId !== id),
        activeBlockId: s.activeBlockId === id ? null : s.activeBlockId,
        selection: new Set(
          [...s.selection].filter((lid) => s.lots.find((l) => l.id === lid)?.blockId !== id),
        ),
      })),

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
