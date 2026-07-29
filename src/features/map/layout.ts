/**
 * Layout contract shared with spec 07 (dashboard panel) and spec 06 (lot
 * drawer). Both import these numbers rather than restating them, so the map's
 * fit padding and the panel's width can never drift apart.
 */

/** Width of the right-hand dashboard panel slot. Spec 07 fills it. */
export const DASHBOARD_PANEL_WIDTH = 420

/** Width of the lot detail drawer. Spec 06 replaces the placeholder. */
export const LOT_DRAWER_WIDTH = 420

/** Breathing room around the fitted park bounds. */
export const MAP_EDGE_PADDING = 40

/** Width of the dashboard panel's collapsed rail in its hidden state. */
export const DASHBOARD_RAIL_WIDTH = 36

/** Distance the floating map chrome keeps from the map's edges. */
export const MAP_CHROME_GAP = 16

/** The empty right-hand region the dashboard panel mounts into. */
export const DASHBOARD_SLOT_ID = 'map-dashboard-slot'
