import type { Centavos, Percent } from '@/domain'
import { LOCALE } from '@/domain'

/**
 * All money in the model is integer centavos. Formatting happens only here,
 * at the edge. Never build a peso string by hand.
 */
export function formatPeso(
  c: Centavos | null | undefined,
  opts: { decimals?: boolean; compact?: boolean; sign?: boolean } = {},
): string {
  if (c === null || c === undefined) return '—'
  const pesos = c / 100
  const showDecimals = opts.decimals ?? c % 100 !== 0

  if (opts.compact && Math.abs(pesos) >= 1_000_000) {
    return `${sign(pesos, opts.sign)}₱${(Math.abs(pesos) / 1_000_000).toFixed(1)}M`
  }
  if (opts.compact && Math.abs(pesos) >= 10_000) {
    return `${sign(pesos, opts.sign)}₱${Math.round(Math.abs(pesos) / 1_000)}k`
  }

  const body = Math.abs(pesos).toLocaleString(LOCALE, {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  })
  return `${sign(pesos, opts.sign)}₱${body}`
}

function sign(v: number, showPlus?: boolean) {
  if (v < 0) return '−'
  return showPlus ? '+' : ''
}

export function parsePeso(input: string): Centavos | null {
  const cleaned = input.replace(/[₱,\s]/g, '')
  if (!cleaned || !/^-?\d*\.?\d*$/.test(cleaned)) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export const sumCentavos = (xs: Centavos[]): Centavos =>
  xs.reduce((a, b) => a + b, 0)

/** Round once, at the point of computation. Never accumulate floats. */
export const pctOf = (c: Centavos, pct: Percent): Centavos =>
  Math.round((c * pct) / 100)

export const formatPercent = (p: Percent, decimals = 1): string =>
  `${p.toFixed(decimals).replace(/\.0$/, '')}%`

export const formatCount = (n: number): string => n.toLocaleString(LOCALE)
