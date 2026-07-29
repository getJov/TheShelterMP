/**
 * Colour arithmetic for the canvas layer.
 *
 * Every input colour arrives from `@/domain` appearance maps or from a CSS
 * custom property — this module only mixes them. There is not a single colour
 * literal in the map feature, by design.
 */

function parseHex(hex: string): [number, number, number] {
  let h = hex.trim()
  if (h.startsWith('#')) h = h.slice(1)
  if (h.length === 3) h = h[0]! + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = Number.parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color
  const [r, g, b] = parseHex(color)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Linear mix in sRGB. Good enough for a five-stop ramp, and fast. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a)
  const [r2, g2, b2] = parseHex(b)
  const k = Math.max(0, Math.min(1, t))
  const r = Math.round(r1 + (r2 - r1) * k)
  const g = Math.round(g1 + (g2 - g1) * k)
  const bl = Math.round(b1 + (b2 - b1) * k)
  return `rgb(${r},${g},${bl})`
}

/**
 * Read a theme token off the document root. Lets the canvas use the same gold
 * and ink the HTML chrome uses without hard-coding either.
 */
const varCache = new Map<string, string>()
export function themeColor(name: string): string {
  const key = `${document.documentElement.classList.contains('dark') ? 'd' : 'l'}:${name}`
  const hit = varCache.get(key)
  if (hit) return hit
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const out = v || 'currentColor'
  varCache.set(key, out)
  return out
}

export function clearThemeColorCache() {
  varCache.clear()
}

/** Hairline stroke over satellite imagery — light ink, dark paper. */
export const hairline = (dark: boolean) =>
  dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.18)'

export const labelInk = (dark: boolean) =>
  dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.5)'

export const badgeRing = (dark: boolean) =>
  dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.9)'

export const badgeInk = (dark: boolean) =>
  dark ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.98)'

export const patternInk = (dark: boolean) =>
  dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)'
