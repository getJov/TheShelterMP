import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_PARK_ZOOM,
  type AgentId,
  type BlockId,
  type LotId,
  type LotStatus,
  type PaymentHealth,
  type MapViewMode,
  type TierId,
} from '@/domain'

export type BaseLayerId = 'satellite' | 'plain'

export interface MapFilters {
  statuses: Set<LotStatus>
  tierIds: Set<TierId>
  blockIds: Set<BlockId>
  agentIds: Set<AgentId>
  /**
   * Payment-health buckets. Set by the dashboard's Receivables drill-down
   * ("show 13 overdue accounts on the map"), which is the single most
   * persuasive interaction in the demo.
   */
  health: Set<PaymentHealth>
  /** Lot code or owner name. */
  query: string
}

const emptyFilters = (): MapFilters => ({
  statuses: new Set(),
  tierIds: new Set(),
  blockIds: new Set(),
  agentIds: new Set(),
  health: new Set(),
  query: '',
})

export const filtersActive = (f: MapFilters) =>
  f.statuses.size > 0 ||
  f.tierIds.size > 0 ||
  f.blockIds.size > 0 ||
  f.agentIds.size > 0 ||
  f.health.size > 0

export const filterCount = (f: MapFilters) =>
  f.statuses.size + f.tierIds.size + f.blockIds.size + f.agentIds.size + f.health.size

type SetKey = 'statuses' | 'tierIds' | 'blockIds' | 'agentIds' | 'health'

interface MapState {
  viewMode: MapViewMode
  baseLayer: BaseLayerId
  showOverlay: boolean
  /** 0–100. Written straight through to the image overlay. */
  overlayOpacity: number
  /** Lot numbers, only drawn at zoom ≥ ZOOM.labelsVisible. */
  showLabels: boolean
  legendCollapsed: boolean

  selectedLotId: LotId | null
  hoveredLotId: LotId | null
  /** Set by the editor (spec 10); core only reads it. */
  multiSelectedLotIds: Set<LotId>

  zoom: number
  /** True while the user is dragging — suppresses the hover tooltip. */
  dragging: boolean
  /**
   * Reserved for spec 07's dashboard panel. When true the map's fit and
   * selection pans keep DASHBOARD_PANEL_WIDTH of the viewport clear.
   */
  dashboardPanelOpen: boolean

  filters: MapFilters

  setViewMode: (m: MapViewMode) => void
  setBaseLayer: (b: BaseLayerId) => void
  setShowOverlay: (v: boolean) => void
  setOverlayOpacity: (v: number) => void
  setShowLabels: (v: boolean) => void
  setLegendCollapsed: (v: boolean) => void

  select: (id: LotId | null) => void
  hover: (id: LotId | null) => void
  setMultiSelected: (ids: Set<LotId>) => void

  setZoom: (z: number) => void
  setDragging: (v: boolean) => void
  setDashboardPanelOpen: (v: boolean) => void

  setQuery: (q: string) => void
  toggleFilter: (key: SetKey, value: string) => void
  /** Replace one filter set outright — used by the dashboard drill-downs. */
  setFilterMany: (key: SetKey, values: string[]) => void
  setFilterOnly: (key: SetKey, value: string) => void
  clearFilters: () => void
}

export const useMapStore = create<MapState>()(
  persist(
    (set, get) => ({
      viewMode: 'tier',
      baseLayer: 'satellite',
      showOverlay: false,
      overlayOpacity: 35,
      showLabels: false,
      legendCollapsed: false,

      selectedLotId: null,
      hoveredLotId: null,
      multiSelectedLotIds: new Set<LotId>(),

      zoom: DEFAULT_PARK_ZOOM,
      dragging: false,
      dashboardPanelOpen: false,

      filters: emptyFilters(),

      setViewMode: (viewMode) => set({ viewMode }),
      setBaseLayer: (baseLayer) => set({ baseLayer }),
      setShowOverlay: (showOverlay) => set({ showOverlay }),
      setOverlayOpacity: (overlayOpacity) => set({ overlayOpacity }),
      setShowLabels: (showLabels) => set({ showLabels }),
      setLegendCollapsed: (legendCollapsed) => set({ legendCollapsed }),

      select: (selectedLotId) => set({ selectedLotId }),
      hover: (hoveredLotId) => {
        if (get().hoveredLotId !== hoveredLotId) set({ hoveredLotId })
      },
      setMultiSelected: (multiSelectedLotIds) => set({ multiSelectedLotIds }),

      setZoom: (zoom) => {
        if (get().zoom !== zoom) set({ zoom })
      },
      setDragging: (dragging) => set({ dragging }),
      setDashboardPanelOpen: (dashboardPanelOpen) => set({ dashboardPanelOpen }),

      setQuery: (query) => set({ filters: { ...get().filters, query } }),

      toggleFilter: (key, value) => {
        const f = get().filters
        const next = new Set(f[key] as Set<string>)
        if (next.has(value)) next.delete(value)
        else next.add(value)
        set({ filters: { ...f, [key]: next } as MapFilters })
      },

      /**
       * Legend rows behave as "isolate this value" — clicking Available shows
       * only available lots, clicking it again clears.
       */
      setFilterOnly: (key, value) => {
        const f = get().filters
        const cur = f[key] as Set<string>
        const isolated = cur.size === 1 && cur.has(value)
        set({
          filters: {
            ...f,
            [key]: isolated ? new Set() : new Set([value]),
          } as MapFilters,
        })
      },

      setFilterMany: (key, values) =>
        set({
          filters: { ...get().filters, [key]: new Set(values) } as MapFilters,
        }),

      clearFilters: () => set({ filters: { ...emptyFilters(), query: '' } }),
    }),
    {
      name: 'shelter-map',
      // Selection and filters are deliberately NOT persisted — the client
      // should get a clean map each session.
      partialize: (s) => ({
        viewMode: s.viewMode,
        baseLayer: s.baseLayer,
        showOverlay: s.showOverlay,
        overlayOpacity: s.overlayOpacity,
        legendCollapsed: s.legendCollapsed,
      }),
    },
  ),
)
