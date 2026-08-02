/** Container pixel — screen space inside the map viewport. */
export interface MapPoint {
  x: number
  y: number
}

/** Pointer event surfaced from map layers. */
export interface MapPointerEvent {
  originalEvent: MouseEvent
  containerPoint: MapPoint
}

export function mapPoint(x: number, y: number): MapPoint {
  return { x, y }
}
