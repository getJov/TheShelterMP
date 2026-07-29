import { usePanel } from '@/stores/panel'
import { useMapStore } from '@/stores/map'
import {
  DASHBOARD_PANEL_WIDTH,
  DASHBOARD_RAIL_WIDTH,
  LOT_DRAWER_WIDTH,
} from './layout'

/**
 * How far the right-anchored map chrome must sit from the map's right edge.
 *
 * The dashboard panel and the lot drawer both occupy that edge, and either can
 * be open. Without this, the zoom controls, Reset view and the survey badge end
 * up underneath them and become unclickable.
 */
/**
 * Whether the map's floating chrome should render at all.
 *
 * In the dashboard's `full` state the map is reduced to a strip you click to
 * return — not an operable map. Leaving the legend, zoom controls and survey
 * badge rendering there put them half-behind the dashboard overlay and on top
 * of the "Click the map to return" pill, where they were unreadable and
 * unclickable.
 */
export function useChromeVisible(): boolean {
  return usePanel((s) => s.state) !== 'full'
}

export function useChromeInset(): number {
  const panelState = usePanel((s) => s.state)
  const selectedLotId = useMapStore((s) => s.selectedLotId)

  const dashboard =
    panelState === 'docked'
      ? DASHBOARD_PANEL_WIDTH
      : panelState === 'hidden'
        ? DASHBOARD_RAIL_WIDTH
        : // 'full' — the chrome is not rendered at all. See useChromeVisible().
          0

  const drawer = selectedLotId ? LOT_DRAWER_WIDTH : 0

  // They overlay the same edge rather than stacking, so the wider one wins.
  return Math.max(dashboard, drawer)
}
