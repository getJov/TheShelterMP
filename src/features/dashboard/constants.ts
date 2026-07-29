/**
 * Panel geometry.
 *
 * The panel width is spec 05's number — the map's fit padding reserves
 * exactly this much on the right, so the two must never drift. Import it,
 * never restate it.
 */
import { DASHBOARD_PANEL_WIDTH } from '@/features/map/layout'
export { DASHBOARD_PANEL_WIDTH }

/** The hidden state's right-edge rail. */
export const DASHBOARD_RAIL_WIDTH = 36

/** The live map strip pinned at the bottom of the full state. */
export const DASHBOARD_MAP_STRIP_HEIGHT = 240

/**
 * 380 ms, brand ease. Long enough to read as deliberate, short enough that
 * nobody waits on it.
 */
export const PANEL_TRANSITION = {
  duration: 0.38,
  ease: [0.22, 1, 0.36, 1],
} as const

/** List stagger, capped at 12 items per spec 00 §motion. */
export const CARD_STAGGER = 0.04
export const CARD_STAGGER_CAP = 12

/** Chart heights, by layout and card size. */
export const CHART_HEIGHT = {
  docked: { hero: 60, small: 48 },
  full: { hero: 160, small: 64 },
} as const

/** How wide the panel occupies for a given state. */
export function panelWidthFor(state: 'hidden' | 'docked' | 'full'): number {
  if (state === 'hidden') return DASHBOARD_RAIL_WIDTH
  if (state === 'docked') return DASHBOARD_PANEL_WIDTH
  return 0 // 'full' lifts out of flow into an overlay
}
