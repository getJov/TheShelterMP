import { LOT_STATUSES, STATUS_APPEARANCE, type LotStatus } from '@/domain'

/**
 * The contrast guard.
 *
 * The client's whole visual design is "tier drives the polygon fill, status
 * drives a lettered badge on top". An enthusiastic colour pick for a tier
 * fill can quietly make one of the five badges disappear into it, and that
 * failure is invisible until someone misreads the map. So we check every
 * badge against every candidate fill before the change is saved.
 */

function toRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

export const isHexColor = (v: string) => toRgb(v) !== null

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 → identical, 21 → black on white. */
export function contrastRatio(a: string, b: string): number {
  const ra = toRgb(a)
  const rb = toRgb(b)
  if (!ra || !rb) return 21
  const la = relativeLuminance(ra)
  const lb = relativeLuminance(rb)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * "Redmean" colour distance — cheap, and unlike pure luminance it notices
 * when two colours share a lightness but differ only slightly in hue, which
 * is precisely the gold-badge-on-gold-fill failure.
 */
export function colorDistance(a: string, b: string): number {
  const ra = toRgb(a)
  const rb = toRgb(b)
  if (!ra || !rb) return 999
  const rm = (ra[0] + rb[0]) / 2
  const dr = ra[0] - rb[0]
  const dg = ra[1] - rb[1]
  const db = ra[2] - rb[2]
  return Math.sqrt(
    (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db,
  )
}

/** Below this the badge stops reading as a separate object on the fill. */
const MIN_DISTANCE = 58
const MIN_RATIO = 1.12

export interface ContrastWarning {
  status: LotStatus
  label: string
  color: string
  distance: number
  ratio: number
}

/** Every status badge that would be hard to read on this fill. */
export function checkFillAgainstBadges(fillColor: string): ContrastWarning[] {
  if (!isHexColor(fillColor)) return []
  return LOT_STATUSES.map((status) => {
    const a = STATUS_APPEARANCE[status]
    return {
      status,
      label: a.label,
      color: a.color,
      distance: colorDistance(fillColor, a.color),
      ratio: contrastRatio(fillColor, a.color),
    }
  }).filter((w) => w.distance < MIN_DISTANCE || w.ratio < MIN_RATIO)
}

/**
 * A fill for a new tier, taken from the family's unused hues rather than a
 * random colour — the palette has to stay coherent on the map.
 */
export const FAMILY_HUES: Record<string, string[]> = {
  lawn: ['#e8dcc0', '#dccda4', '#ccb884', '#e0d3b3', '#d3c294', '#f0e7d2'],
  family_garden: ['#cdd9c2', '#b3c8a6', '#c2d1b4', '#a8bf9c', '#dae3d0'],
  mausoleum: ['#d5c9d6', '#c6b7c8', '#e0d6e1', '#bbaabd'],
}

export function suggestFill(category: string, taken: string[]): string {
  const pool = FAMILY_HUES[category] ?? FAMILY_HUES.lawn!
  const used = new Set(taken.map((c) => c.toLowerCase()))
  return pool.find((c) => !used.has(c.toLowerCase())) ?? pool[pool.length - 1]!
}

/** A darker relative of the fill, so the stroke stays in the same family. */
export function darken(hex: string, amount = 0.22): string {
  const rgb = toRgb(hex)
  if (!rgb) return hex
  const out = rgb.map((v) => Math.max(0, Math.round(v * (1 - amount))))
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
