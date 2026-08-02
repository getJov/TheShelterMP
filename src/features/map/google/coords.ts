import type { LatLng } from '@/domain'

export function latLngToGoogle(ll: LatLng): google.maps.LatLngLiteral {
  return { lat: ll[0], lng: ll[1] }
}

export function googleToLatLng(ll: google.maps.LatLng | google.maps.LatLngLiteral): LatLng {
  if (ll instanceof google.maps.LatLng) return [ll.lat(), ll.lng()]
  return [ll.lat, ll.lng]
}

export function latLngGoogle(ll: LatLng): google.maps.LatLng {
  return new google.maps.LatLng(ll[0], ll[1])
}
