import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The dashboard panel's three states, owned here rather than in the panel
 * component so the map page can size itself in the SAME frame the panel
 * animates in — the map must never unmount, so both sides read one store.
 */
export type PanelState = 'hidden' | 'docked' | 'full'

/** Window every card honours. Selected in the full state, respected everywhere. */
export type DashboardPeriod = 'today' | 'week' | 'month' | 'quarter'

export const DASHBOARD_PERIODS: { id: DashboardPeriod; label: string; short: string }[] = [
  { id: 'today', label: 'Today', short: 'Today' },
  { id: 'week', label: 'This week', short: 'Week' },
  { id: 'month', label: 'This month', short: 'Month' },
  { id: 'quarter', label: 'This quarter', short: 'Quarter' },
]

interface PanelStore {
  state: PanelState
  /** Where 'full' returns to when collapsed. */
  lastDocked: 'docked' | 'hidden'
  period: DashboardPeriod
  /** Per-card collapse, so a user can fold away what they don't watch. */
  collapsedCards: Set<string>

  /** hidden → docked → full → docked */
  cycle: () => void
  set: (s: PanelState) => void
  /** Leave 'full' for whichever docked-or-hidden state we came from. */
  collapse: () => void
  setPeriod: (p: DashboardPeriod) => void
  toggleCard: (id: string) => void
}

export const usePanel = create<PanelStore>()(
  persist(
    (write, get) => ({
      state: 'docked',
      lastDocked: 'docked',
      period: 'month',
      collapsedCards: new Set<string>(),

      cycle: () => {
        const s = get().state
        const next: PanelState =
          s === 'hidden' ? 'docked' : s === 'docked' ? 'full' : 'docked'
        get().set(next)
      },

      set: (s) =>
        write((prev) => ({
          state: s,
          lastDocked: s === 'full' ? prev.lastDocked : s,
        })),

      collapse: () => get().set(get().lastDocked),

      setPeriod: (period) => write({ period }),

      toggleCard: (id) =>
        write((prev) => {
          const next = new Set(prev.collapsedCards)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return { collapsedCards: next }
        }),
    }),
    {
      name: 'shelter-panel',
      // A Set does not survive JSON. Flatten on the way out, rebuild on the way in.
      partialize: (s) => ({
        state: s.state,
        lastDocked: s.lastDocked,
        period: s.period,
        collapsedCards: [...s.collapsedCards],
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<
          Omit<PanelStore, 'collapsedCards'> & { collapsedCards: string[] }
        >
        return {
          ...current,
          state: p.state ?? current.state,
          lastDocked: p.lastDocked ?? current.lastDocked,
          period: p.period ?? current.period,
          collapsedCards: new Set(p.collapsedCards ?? []),
        }
      },
    },
  ),
)
