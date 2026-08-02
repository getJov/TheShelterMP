/** OverlayView shim so helpers can call fromLatLngToContainerPixel outside draw(). */
const bridges = new WeakMap<google.maps.Map, google.maps.OverlayView>()

export function getMapProjection(map: google.maps.Map): google.maps.MapCanvasProjection | null {
  let bridge = bridges.get(map)
  if (!bridge) {
    bridge = new google.maps.OverlayView()
    bridge.onAdd = () => {}
    bridge.draw = () => {}
    bridge.setMap(map)
    bridges.set(map, bridge)
  }
  return bridge.getProjection() ?? null
}

export function releaseProjectionBridge(map: google.maps.Map) {
  const bridge = bridges.get(map)
  bridge?.setMap(null)
  bridges.delete(map)
}
