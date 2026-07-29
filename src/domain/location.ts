import type { BlockId, ClientId, ContractId, HoldId, LocationId, LotId, OverlayId, TierId } from './ids'
import type { Bounds, ISODateTime, LatLng, Polygon } from './primitives'
import type { LocationKind, LotStatus } from './enums'

export interface Location {
  id: LocationId
  code: string // 'ILG' | 'TWN'
  name: string
  kind: LocationKind
  address: string
  centroid: LatLng
  defaultZoom: number
  bounds: Bounds | null
  active: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Block {
  id: BlockId
  locationId: LocationId
  code: string // 'B04' — unique within a location
  name: string | null
  polygon: Polygon
  /** Derived, stored for cluster marker placement. */
  centroid: LatLng
  /** Grid parameters that generated this block's lots. Null if drawn free-hand. */
  grid: {
    rows: number
    cols: number
    /** Degrees clockwise from north. */
    rotationDeg: number
    /** Metres of walkway left between lot polygons. */
    gutterM: number
    numbering: 'row_major' | 'col_major' | 'boustrophedon'
  } | null
  defaultTierId: TierId | null
  /** Denormalised for the cluster marker. */
  lotCount: number
  active: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Lot {
  id: LotId
  locationId: LocationId
  blockId: BlockId
  /** Integer within the block. Human code is derived — see formatLotCode. */
  lotNumber: number
  tierId: TierId
  polygon: Polygon
  centroid: LatLng
  areaSqm: number
  status: LotStatus
  /**
   * Max interments. Snapshotted from the tier at creation so a later tier
   * change cannot silently invalidate existing burials.
   */
  capacity: number
  intermentCount: number
  /** Set while status is 'held'. */
  activeHoldId: HoldId | null
  /** Set while status is 'sold' or 'occupied'. */
  currentContractId: ContractId | null
  currentOwnerClientId: ClientId | null
  /** Required when status === 'not_for_sale'. */
  notForSaleReason: string | null
  notes: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/** Block + Lot only — the client explicitly ruled out a section level. */
export const formatLotCode = (blockCode: string, lotNumber: number) =>
  `${blockCode}-L${String(lotNumber).padStart(3, '0')}`

/**
 * A georeferenced image laid under the lots — a site plan or survey scan
 * the admin positions by hand in the map editor.
 */
export interface MapOverlay {
  id: OverlayId
  locationId: LocationId
  name: string
  /** data: URL in the mockup. */
  imageUrl: string
  /** SW / NE corners the image is stretched to. */
  bounds: Bounds
  rotationDeg: number
  /** 0–1 */
  opacity: number
  /**
   * Rendered beneath lots when true. The setting is global, so publishing
   * here makes it appear on the main dashboard map.
   */
  visible: boolean
  zIndex: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
