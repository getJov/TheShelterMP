import { useId, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatPeso } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useChartColors } from './use-chart-colors'

/**
 * Deliberately spare charts: no gridlines, no axis lines, no legends.
 * Recharts' default tooltip does not match the brand and must not ship, so
 * every chart here passes a custom one.
 */

interface TooltipPayloadItem {
  payload?: Record<string, unknown>
  value?: number | string
}

export function BrandTooltip({
  active,
  payload,
  label,
  format,
  suffix,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string | number
  format?: (v: number) => string
  suffix?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const raw = payload[0]?.value
  const value = typeof raw === 'number' ? (format ? format(raw) : String(raw)) : String(raw ?? '')

  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-1.5 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.45)]">
      {label !== undefined && (
        <p className="eyebrow mb-0.5 text-muted">{String(label)}</p>
      )}
      <p className="text-caption font-semibold tabular text-ink">
        {value}
        {suffix && <span className="ml-1 font-normal text-muted">{suffix}</span>}
      </p>
    </div>
  )
}

/** 12-month bar sparkline. A shape, not a chart. */
export function MoneyBars({
  data,
  height,
  highlightLast = true,
}: {
  data: { label: string; centavos: number }[]
  height: number
  highlightLast?: boolean
}) {
  const c = useChartColors()
  const last = data.length - 1

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
          <XAxis dataKey="label" hide />
          <YAxis hide domain={[0, 'dataMax']} />
          <Tooltip
            cursor={{ fill: c['color-surface-2'] }}
            content={
              <BrandTooltip format={(v) => formatPeso(v, { compact: true })} />
            }
          />
          <Bar dataKey="centavos" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={
                  highlightLast && i === last
                    ? c['color-green']
                    : `color-mix(in srgb, ${c['color-green']} 34%, transparent)`
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Thin area sparkline — the trust fund's running balance. */
export function MoneyArea({
  data,
  height,
}: {
  data: { label: string; centavos: number }[]
  height: number
}) {
  const c = useChartColors()
  const gradientId = useId().replace(/:/g, '')

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c['color-gold']} stopOpacity={0.42} />
              <stop offset="100%" stopColor={c['color-gold']} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip
            cursor={{ stroke: c['color-line'], strokeWidth: 1 }}
            content={
              <BrandTooltip format={(v) => formatPeso(v, { compact: true })} />
            }
          />
          <Area
            type="monotone"
            dataKey="centavos"
            stroke={c['color-gold']}
            strokeWidth={1.6}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 2.6, fill: c['color-gold'], stroke: c['color-surface'] }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface StackSegment {
  key: string
  label: string
  color: string
  value: number
  onClick?: () => void
  title?: string
}

/**
 * A horizontal stacked bar built from divs rather than Recharts — at 8px
 * tall with click targets on individual segments, SVG buys nothing and
 * costs pointer precision.
 */
export function StackBar({
  segments,
  height = 9,
  className,
}: {
  segments: StackSegment[]
  height?: number
  className?: string
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  if (total <= 0) {
    return (
      <div
        className={cn('w-full rounded-full bg-surface-2', className)}
        style={{ height }}
      />
    )
  }

  return (
    <div
      className={cn('flex w-full overflow-hidden rounded-full bg-surface-2', className)}
      style={{ height }}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <button
            key={s.key}
            type="button"
            title={s.title ?? s.label}
            disabled={!s.onClick}
            onClick={(e) => {
              e.stopPropagation()
              s.onClick?.()
            }}
            className={cn(
              'h-full transition-[filter,opacity] duration-200',
              s.onClick
                ? 'cursor-pointer hover:brightness-110 focus-visible:outline-none focus-visible:brightness-125'
                : 'cursor-default',
            )}
            style={{
              width: `${(s.value / total) * 100}%`,
              background: s.color,
            }}
            aria-label={`${s.label}: ${s.value}`}
          />
        ))}
    </div>
  )
}

/** Legend row beneath a stack bar. */
export function StackLegend({ children }: { children: ReactNode }) {
  return <div className="mt-2.5 space-y-1">{children}</div>
}

export function LegendRow({
  color,
  label,
  count,
  amount,
  onClick,
  emphasise,
}: {
  color: string
  label: string
  count?: number
  amount?: number
  onClick?: () => void
  emphasise?: boolean
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        'flex min-h-10 w-full items-center gap-2 rounded px-1 py-[3px] text-left text-caption transition-colors',
        onClick ? 'cursor-pointer hover:bg-surface-2' : 'cursor-default',
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span className={cn('min-w-0 flex-1 break-words', emphasise ? 'text-ink' : 'text-muted')}>
        {label}
      </span>
      {count !== undefined && (
        <span className="shrink-0 tabular text-muted">{count}</span>
      )}
      {amount !== undefined && (
        <span className="w-[74px] shrink-0 text-right tabular text-ink">
          {formatPeso(amount, { compact: true })}
        </span>
      )}
    </button>
  )
}
