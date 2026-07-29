import { useEffect, useState } from 'react'

/**
 * Charts read their colours from the CSS custom properties rather than
 * importing hex literals, and re-read them when the theme class flips.
 *
 * The values are passed to Recharts as PROPS, so a theme change re-renders
 * the series without remounting the chart — no flash, no lost animation.
 */
const TOKENS = [
  'color-green',
  'color-green-light',
  'color-gold',
  'color-gold-soft',
  'color-gold-deep',
  'color-danger',
  'color-ink',
  'color-muted',
  'color-line',
  'color-line-soft',
  'color-surface',
  'color-surface-2',
  'color-info',
] as const

export type ChartColorToken = (typeof TOKENS)[number]
export type ChartColors = Record<ChartColorToken, string>

const FALLBACK: ChartColors = {
  'color-green': '#4a7c59',
  'color-green-light': '#6fa87d',
  'color-gold': '#c9a962',
  'color-gold-soft': '#a98f52',
  'color-gold-deep': '#8a6d34',
  'color-danger': '#a8443a',
  'color-ink': '#1c1a15',
  'color-muted': '#6b665c',
  'color-line': '#e2d9c4',
  'color-line-soft': '#efe8d8',
  'color-surface': '#fffdf8',
  'color-surface-2': '#faf6ec',
  'color-info': '#5b8fd4',
}

function read(): ChartColors {
  if (typeof window === 'undefined') return FALLBACK
  const style = getComputedStyle(document.documentElement)
  const out = {} as ChartColors
  for (const t of TOKENS) {
    const v = style.getPropertyValue(`--${t}`).trim()
    out[t] = v || FALLBACK[t]
  }
  return out
}

/**
 * Watches the `dark` class on <html> — the app's theme switch is a class
 * toggle, not a media query, so a MutationObserver is the honest signal.
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(read)

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setColors(read()))
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] })
    // One read after mount, in case fonts/vars settled late.
    setColors(read())
    return () => observer.disconnect()
  }, [])

  return colors
}

/** Translucent variant of a token, for area fills and hover washes. */
export function alpha(color: string, amount: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(amount * 100)}%, transparent)`
}
