import type { TierId } from './ids'
import type { ISODateTime } from './primitives'
import type { MarkerType, TierCategory } from './enums'

/**
 * How a tier paints on the map. Client decision: TIER drives the polygon
 * FILL; status is a separate lettered badge drawn on top.
 */
export interface TierAppearance {
  fillColor: string
  strokeColor: string
  strokeWidth: number
  /** Optional hatch for premium products, drawn on the canvas layer. */
  pattern: 'none' | 'diagonal' | 'dots' | 'cross'
  /** Short label stamped inside large polygons at high zoom. */
  shortLabel: string
}

export interface Tier {
  id: TierId
  code: string // 'LAWN_STD'
  name: string // 'Lawn Standard'
  category: TierCategory
  /** Physical footprint in metres — authoritative, drives the grid generator. */
  widthM: number
  lengthM: number
  /** Max interments. Lawn = 2, four-lot family garden = 8. */
  capacity: number
  markerType: MarkerType
  description: string
  appearance: TierAppearance
  sortOrder: number
  active: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
