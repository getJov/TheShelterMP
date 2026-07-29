import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AGENT_PALETTE,
  LOT_STATUSES,
  PAYMENT_HEALTH_APPEARANCE,
  RESTRICTED_FILL,
  STATUS_APPEARANCE,
  type AgentId,
  type PaymentHealth,
} from '@/domain'
import { healthOfLot } from '@/lib/finance'
import { useDataset } from '@/stores/dataset'
import { formatCount } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui-brand/Icon'
import { IconChevronDown, IconLayers } from '@/components/ui-brand/icons'
import { StatusDot } from '@/components/ui-brand/StatusDot'
import { useMapStore } from '@/stores/map'
import { mix } from './colors'
import {
  lotMatches,
  useStatusCounts,
  useTierCounts,
  type MapData,
  type MapLot,
} from './use-map-data'

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * The fastest interaction in the demo: every row is a filter toggle with a
 * live count. Clicking "Available 684" isolates available lots; clicking
 * again clears.
 */
export function MapLegend({ data, dark }: { data: MapData; dark: boolean }) {
  const viewMode = useMapStore((s) => s.viewMode)
  const filters = useMapStore((s) => s.filters)
  const setFilterOnly = useMapStore((s) => s.setFilterOnly)
  const collapsed = useMapStore((s) => s.legendCollapsed)
  const setCollapsed = useMapStore((s) => s.setLegendCollapsed)

  const statusCounts = useStatusCounts(data.lots, filters)
  const tierCounts = useTierCounts(data.lots, filters)

  return (
    <div className="pointer-events-none flex flex-col items-end">
      <AnimatePresence initial={false} mode="wait">
        {collapsed ? (
          <motion.button
            key="chip"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.24, ease: EASE }}
            onClick={() => setCollapsed(false)}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 py-1.5 text-[12.5px] text-muted shadow-md backdrop-blur hover:text-ink"
          >
            <Icon icon={IconLayers} size={14} />
            Legend
          </motion.button>
        ) : (
          <motion.div
            key="card"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="pointer-events-auto w-[196px] rounded-xl border border-line bg-surface/88 shadow-lg backdrop-blur-md"
          >
            <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
              <p className="eyebrow text-muted">Legend</p>
              <button
                onClick={() => setCollapsed(true)}
                aria-label="Collapse legend"
                className="text-muted hover:text-ink"
              >
                <Icon icon={IconChevronDown} size={15} />
              </button>
            </div>

            <div className="max-h-[min(52vh,430px)] space-y-2.5 overflow-y-auto px-2.5 py-2">
              {(viewMode === 'tier' || viewMode === 'status') && (
                <Section title={viewMode === 'tier' ? 'Status badge' : 'Status'}>
                  {LOT_STATUSES.map((s) => (
                    <Row
                      key={s}
                      active={filters.statuses.has(s)}
                      onClick={() => setFilterOnly('statuses', s)}
                      count={statusCounts[s]}
                      swatch={<StatusDot status={s} size={15} />}
                      label={STATUS_APPEARANCE[s].label}
                    />
                  ))}
                </Section>
              )}

              {viewMode === 'tier' && (
                <Section title="Lot type — fill">
                  {data.tiers.map((t) => (
                    <Row
                      key={t.id}
                      active={filters.tierIds.has(t.id)}
                      onClick={() => setFilterOnly('tierIds', t.id)}
                      count={tierCounts.get(t.id) ?? 0}
                      swatch={<Swatch color={t.appearance.fillColor} />}
                      label={t.name}
                    />
                  ))}
                </Section>
              )}

              {viewMode === 'payment_health' && (
                <HealthSection data={data} />
              )}
              {viewMode === 'agent' && <AgentSection data={data} />}
              {viewMode === 'occupancy' && <OccupancySection data={data} dark={dark} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="eyebrow px-0.5 pb-1 text-muted">{title}</p>
      {children}
    </div>
  )
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="size-3.5 shrink-0 rounded-[3px] border border-line"
      style={{ background: color }}
    />
  )
}

function Row({
  active,
  onClick,
  count,
  swatch,
  label,
}: {
  active?: boolean
  onClick?: () => void
  count: number
  swatch: React.ReactNode
  label: string
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12.5px] transition-colors',
        onClick && 'hover:bg-surface-2',
        active && 'bg-gold/15 font-medium',
      )}
    >
      {swatch}
      <span className="min-w-0 flex-1 truncate text-ink">{label}</span>
      <span className="tabular text-[11.5px] text-muted">{formatCount(count)}</span>
    </Tag>
  )
}

const HEALTH_ORDER: PaymentHealth[] = [
  'paid_in_full',
  'current',
  'due_soon',
  'overdue',
  'severely_overdue',
  'not_applicable',
]

function HealthSection({ data }: { data: MapData }) {
  const filters = useMapStore((s) => s.filters)
  const toggleFilter = useMapStore((s) => s.toggleFilter)
  // Counted with the health filter lifted, so a row still shows its own total
  // once you have isolated it — otherwise every other row reads zero.
  const counts = useMemo(() => {
    const withoutHealth = { ...filters, health: new Set<PaymentHealth>() }
    const out = new Map<PaymentHealth, number>()
    for (const l of data.lots) {
      if (!lotMatches(l, withoutHealth)) continue
      out.set(l.health, (out.get(l.health) ?? 0) + 1)
    }
    return out
  }, [data.lots, filters])

  return (
    <Section title="Payment health">
      {HEALTH_ORDER.map((h) => (
        <Row
          key={h}
          count={counts.get(h) ?? 0}
          active={filters.health.has(h)}
          onClick={() => toggleFilter('health', h)}
          swatch={<Swatch color={PAYMENT_HEALTH_APPEARANCE[h].color} />}
          label={
            h === 'not_applicable' ? 'No contract' : PAYMENT_HEALTH_APPEARANCE[h].label
          }
        />
      ))}
    </Section>
  )
}

function AgentSection({ data }: { data: MapData }) {
  const idx = useDataset((s) => s.idx)
  const filters = useMapStore((s) => s.filters)
  const setFilterOnly = useMapStore((s) => s.setFilterOnly)

  const rows = useMemo(() => {
    const counts = new Map<AgentId, number>()
    for (const l of data.lots) {
      if (!l.agentId || !lotMatches(l, filters)) continue
      counts.set(l.agentId, (counts.get(l.agentId) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([agentId, n]) => {
        const agent = idx.agentsById.get(agentId)
        const user = agent ? idx.usersById.get(agent.userId) : undefined
        return {
          agentId,
          n,
          name: user?.fullName ?? agent?.agentCode ?? '—',
          color:
            AGENT_PALETTE[(data.agentIndex.get(agentId) ?? 0) % AGENT_PALETTE.length]!,
        }
      })
  }, [data.lots, data.agentIndex, filters, idx])

  if (rows.length === 0) {
    return (
      <Section title="Agent">
        <p className="px-1.5 py-1 text-[12px] text-muted">No sold lots in view.</p>
      </Section>
    )
  }

  return (
    <Section title="Agent — top 8">
      {rows.map((r) => (
        <Row
          key={r.agentId}
          active={filters.agentIds.has(r.agentId)}
          onClick={() => setFilterOnly('agentIds', r.agentId)}
          count={r.n}
          swatch={<Swatch color={r.color} />}
          label={r.name}
        />
      ))}
    </Section>
  )
}

function OccupancySection({ data, dark }: { data: MapData; dark: boolean }) {
  const filters = useMapStore((s) => s.filters)
  const buckets = useMemo(() => {
    const out = [0, 0, 0]
    for (const l of data.lots) {
      if (!lotMatches(l, filters)) continue
      const t = l.lot.capacity > 0 ? l.lot.intermentCount / l.lot.capacity : 0
      out[t === 0 ? 0 : t < 1 ? 1 : 2]! += 1
    }
    return out
  }, [data.lots, filters])

  const empty = dark ? RESTRICTED_FILL.dark : RESTRICTED_FILL.light
  const half = mix(
    STATUS_APPEARANCE.available.color,
    STATUS_APPEARANCE.occupied.color,
    0.5,
  )
  const full = STATUS_APPEARANCE.occupied.color

  return (
    <Section title="Interments used">
      <Row count={buckets[0]!} swatch={<Swatch color={empty} />} label="None" />
      <Row count={buckets[1]!} swatch={<Swatch color={half} />} label="Partly used" />
      <Row count={buckets[2]!} swatch={<Swatch color={full} />} label="At capacity" />
    </Section>
  )
}

/** Only used to keep the MapLot type referenced by the module's exports. */
export type LegendLot = MapLot
