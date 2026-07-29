/** Integer centavos. ₱60,000 === 6_000_000. Never a float. */
export type Centavos = number
/** '2026-07-29' */
export type ISODate = string
/** '2026-07-29T08:14:00+08:00' */
export type ISODateTime = string
/** 6 means 6%, not 0.06 */
export type Percent = number

/** [lat, lng] — matches Leaflet's LatLngTuple exactly. */
export type LatLng = [number, number]
/** Closed implicitly — do not repeat the first point. */
export type Polygon = LatLng[]
/** [southWest, northEast] */
export type Bounds = [LatLng, LatLng]

export const PESO = 100

export const toCentavos = (pesos: number): Centavos => Math.round(pesos * PESO)
export const toPesos = (c: Centavos): number => c / PESO
