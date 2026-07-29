import type { LotStatus, PaymentHealth } from './enums'

export interface StatusAppearance {
  letter: string
  color: string
  label: string
  description: string
}

/**
 * The client's design: tier drives the polygon FILL, status drives a
 * lettered circle badge at the polygon's top-left corner.
 */
export const STATUS_APPEARANCE: Record<LotStatus, StatusAppearance> = {
  available: {
    letter: 'A',
    color: '#4a7c59',
    label: 'Available',
    description: 'Open for sale',
  },
  held: {
    letter: 'H',
    color: '#c9a962',
    label: 'On Hold',
    description: 'Reserved for a family',
  },
  sold: {
    letter: 'S',
    color: '#9a7b4f',
    label: 'Sold',
    description: 'Under contract',
  },
  occupied: {
    letter: 'O',
    color: '#6b5b7a',
    label: 'Occupied',
    description: 'Interment recorded',
  },
  not_for_sale: {
    letter: 'X',
    color: '#9a978e',
    label: 'Not for Sale',
    description: 'Road, chapel or easement',
  },
}

/** What the map colours polygons by. The client asked for a switcher. */
export type MapViewMode = 'tier' | 'status' | 'payment_health' | 'agent' | 'occupancy'

export const MAP_VIEW_MODES: {
  id: MapViewMode
  label: string
  hint: string
  /** Modes an agent may not use — they expose contract data. */
  restricted?: boolean
}[] = [
  { id: 'tier', label: 'Lot Type', hint: 'Colour by product tier' },
  { id: 'status', label: 'Status', hint: 'Colour by availability' },
  {
    id: 'payment_health',
    label: 'Payments',
    hint: 'Colour by collection state',
    restricted: true,
  },
  { id: 'agent', label: 'Agent', hint: 'Colour by who sold it', restricted: true },
  { id: 'occupancy', label: 'Occupancy', hint: 'Colour by interments used' },
]

export const PAYMENT_HEALTH_APPEARANCE: Record<
  PaymentHealth,
  { color: string; label: string }
> = {
  not_applicable: { color: '#d8d3c6', label: '—' },
  paid_in_full: { color: '#4a7c59', label: 'Paid in full' },
  current: { color: '#6fa87d', label: 'Current' },
  due_soon: { color: '#c9a962', label: 'Due soon' },
  overdue: { color: '#c07a3e', label: 'Overdue' },
  severely_overdue: { color: '#a8443a', label: '90+ days overdue' },
}

/**
 * Categorical palette for the 'agent' view mode, cycled by index.
 * Muted on purpose so the status badge stays legible on top.
 */
export const AGENT_PALETTE = [
  '#8ba888',
  '#c9a962',
  '#8fa9c4',
  '#c49a8f',
  '#a89bbf',
  '#9fb8a4',
  '#d0b48a',
  '#7fa3a8',
  '#bfa0a8',
  '#9aa87f',
]

/**
 * Badge geometry, shared by the map canvas and StatusDot so the two
 * renderings cannot drift apart.
 */
export const STATUS_BADGE = {
  radiusPx: 7,
  fontPx: 9,
  /** Offset from the polygon's top-left vertex, in pixels. */
  offset: { x: 7, y: 7 },
  /** Below this zoom the badge is hidden and the cluster takes over. */
  minZoom: 18,
} as const

/** Neutral fill used for lots an agent may not see the detail of. */
export const RESTRICTED_FILL = { light: '#d8d3c6', dark: '#1e2a24' } as const

/** Zoom thresholds for the cluster ↔ lot transition. */
export const ZOOM = {
  clusterOnly: 17,
  lotsVisible: 18,
  labelsVisible: 20,
} as const
