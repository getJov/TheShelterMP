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
  type GridPlan,
  type Numbering,
  type RegenMode,
  type RegenResult,
} from '@/lib/grid-generator'

export type Tool = 'select' | 'block' | 'grid' | 'draw' | 'overlay'

export const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
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

export const defaultGrid = (): GridParams => ({
  tierId: null,
  rows: 10,
  cols: 10,
  gutterM: 0.6,
  rowGutterM: 0.9,
  splitGutters: true,
  rotationDeg: 12,
  numbering: 'boustrophedon',
  startNumber: 1,
})

interface EditorState extends DraftState {
  locationId: LocationId | null
  /** Snapshot of the live data the drafts were forked from. Drives the diff. */
  baseline: DraftState

  tool: Tool
  selection: Set<LotId>
  activeBlockId: BlockId | null
  activeOverlayId: OverlayId | null
  pendingBlock: PendingBlock | null

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
  setTool: (t: Tool) => void
  setLayer: <K extends keyof LayerFlags>(k: K, v: LayerFlags[K]) => void
  setCompare: (v: boolean) => void
  setGrid: (patch: Partial<GridParams>) => void
  setActiveBlock: (id: BlockId | null) => void
  setActiveOverlay: (id: OverlayId | null) => void

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
  updateBlock: (id: BlockId, patch: Partial<Block>) => void
  deleteBlock: (id: BlockId) => void

  // lots
  generate: (mode: RegenMode, plan: GridPlan, tier: Tier) => RegenResult | null
  addFreeLot: (polygon: Polygon, tier: Tier) => void
  changeTier: (ids: LotId[], tier: Tier) => void
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

  return {
    locationId: null,
    baseline: emptyDraft(),
    ...emptyDraft(),

    tool: 'select',
    selection: new Set<LotId>(),
    activeBlockId: null,
    activeOverlayId: null,
    pendingBlock: null,

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
        undoStack: [],
        redoStack: [],
        overlayEditBase: null,
        lockedOverlays: new Set(),
        dirty: false,
        overlaps: new Set(),
        compare: false,
        tool: 'select',
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
        dirty: false,
      })
    },

    // ── chrome ──────────────────────────────────────────────────────
    setTool: (tool) =>
      set((s) => ({
        tool,
        pendingBlock: tool === 'block' ? s.pendingBlock : null,
      })),
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
          : { activeBlockId, showPreview: true, grid: gridFor(s, activeBlockId) },
      ),
    setActiveOverlay: (activeOverlayId) => set({ activeOverlayId }),

    // ── undo ────────────────────────────────────────────────────────
    undo: () => {
      const s = get()
      const prev = s.undoStack[s.undoStack.length - 1]
      if (!prev) return
      set({
        ...restore(prev),
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, snapshotOf(s)],
        dirty: true,
      })
      get().recheckOverlaps()
    },

    redo: () => {
      const s = get()
      const next = s.redoStack[s.redoStack.length - 1]
      if (!next) return
      set({
        ...restore(next),
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snapshotOf(s)],
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
        lots: s.lots.map((l) =>
          set0.has(l.id)
            ? { ...l, tierId: tier.id, capacity: safeCapacity(l, tier), updatedAt: NOW }
            : l,
        ),
      }))
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
