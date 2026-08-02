import { useEffect, useReducer } from 'react'
import type { ShelterMap } from './helpers'

/** Subscribe to viewport changes so DOM handles track the map. */
export function useMapTick(map: ShelterMap) {
  const [tick, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const listeners = [
      map.addListener('bounds_changed', bump),
      map.addListener('zoom_changed', bump),
      map.addListener('center_changed', bump),
    ]
    return () => listeners.forEach((l) => l.remove())
  }, [map])
  return tick
}
