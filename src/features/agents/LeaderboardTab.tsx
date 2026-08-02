import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { AgentId, LocationId } from '@/domain'
import { indexes } from '@/stores/dataset'
import { leaderboard, type LeaderboardRow } from '@/lib/finance'
import { formatCount, formatPeso } from '@/lib/money'
import { useCurrentAgent, useCurrentUser, useVisibleLocations } from '@/lib/permissions'
import { useSession } from '@/stores/session'
import { Icon } from '@/components/ui-brand/Icon'
import { IconLeaderboard, IconTrophy } from '@/components/ui-brand/icons'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  AgentAvatar,
  ArchivedChip,
  LevelBadge,
  MovementChip,
  RatesAssumed,
  useDatasetVersion,
} from './shared'
import { usePeriod } from './period'
import { agentName } from '@/stores/agents'

const ALL = '__all__'
const TOP_N = 10

type RankBy = 'collected' | 'contracts' | 'commission'

const RANK_OPTIONS: { id: RankBy; label: string }[] = [
  { id: 'collected', label: 'Collected value' },
  { id: 'contracts', label: 'Contracts written' },
  { id: 'commission', label: 'Commission earned' },
]

export function LeaderboardTab() {
  return <Leaderboard />
}

export function Leaderboard({ compact }: { compact?: boolean }) {
  const version = useDatasetVersion()
  const period = usePeriod()
  const user = useCurrentUser()
  const me = useCurrentAgent()
  const locations = useVisibleLocations()
  const activeLocationId = useSession((s) => s.activeLocationId)

  const [rankBy, setRankBy] = useState<RankBy>('collected')
  // A manager sees their own location; everyone else, including agents, sees
  // the whole sales force — a board you can only see a slice of is no board.
  const [locationId, setLocationId] = useState<string>(
    user.role === 'manager' ? (activeLocationId ?? ALL) : ALL,
  )
  const [showAll, setShowAll] = useState(false)

  const canPickLocation = user.role === 'owner' || user.role === 'admin'
  const scope = (locationId === ALL ? null : (locationId as LocationId)) as
    | LocationId
    | null

  const { rows, movement } = useMemo(() => {
    void version
    const current = leaderboard(period.from, period.to, scope, rankBy)
    const previous = leaderboard(period.prev.from, period.prev.to, scope, rankBy)
    const prevRank = new Map(previous.map((r) => [r.agentId, r.rank]))
    const move = new Map<AgentId, number | null>()
    for (const r of current) {
      const p = prevRank.get(r.agentId)
      move.set(r.agentId, p === undefined ? null : p - r.rank)
    }
    return { rows: current, movement: move }
  }, [version, period.from, period.to, period.prev.from, period.prev.to, scope, rankBy])

  // Agents with nothing at all in the window sit below the fold rather than
  // padding the board with zeroes.
  const active = rows.filter(
    (r) => r.collectedCentavos > 0 || r.contractCount > 0 || r.commissionCentavos > 0,
  )
  const shown = showAll ? active : active.slice(0, TOP_N)
  const myRow = me ? rows.find((r) => r.agentId === me.id) : undefined
  const pinMe = Boolean(myRow) && !shown.some((r) => r.agentId === myRow!.agentId)

  if (active.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        <EmptyState
          icon={IconLeaderboard}
          title="Nothing collected in this period"
          body="Payments posted in this period will appear here."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-muted">Rank by</span>
          <Select value={rankBy} onValueChange={(v) => setRankBy(v as RankBy)}>
            <SelectTrigger size="sm" className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANK_OPTIONS.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canPickLocation && (
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger size="sm" className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id as string}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <span className="ml-auto text-[12px] text-muted">
            Movement compared with {period.prev.label}
          </span>
        </div>
      )}

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {shown.map((row, i) => (
            <motion.div
              key={row.agentId}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.32,
                ease: [0.22, 1, 0.36, 1],
                delay: Math.min(i, 12) * 0.04,
              }}
            >
              <BoardRow
                row={row}
                rankBy={rankBy}
                movement={movement.get(row.agentId) ?? null}
                isMe={me?.id === row.agentId}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {pinMe && myRow && (
          <>
            <div className="flex items-center gap-3 px-1 py-1">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
                Your position
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <motion.div layout transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
              <BoardRow
                row={myRow}
                rankBy={rankBy}
                movement={movement.get(myRow.agentId) ?? null}
                isMe
              />
            </motion.div>
          </>
        )}
      </div>

      {active.length > TOP_N && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show top ten only' : `Show all ${active.length} agents`}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── a single row ─────────────────────────────────────────────────────
function BoardRow({
  row,
  rankBy,
  movement,
  isMe,
}: {
  row: LeaderboardRow
  rankBy: RankBy
  movement: number | null
  isMe: boolean
}) {
  const agent = indexes().agentsById.get(row.agentId)
  if (!agent) return null

  const archived = agent.status === 'archived'
  const top = row.rank <= 3
  const first = row.rank === 1
  const pct = row.targetRatio === null ? null : Math.round(row.targetRatio * 100)

  return (
    <div
      className={cn(
        'relative flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border bg-surface transition-colors',
        first ? 'px-5 py-4' : 'px-4 py-3',
        top ? 'border-gold/55' : 'border-line',
        first && 'shadow-[0_1px_0_0_var(--color-gold)]',
        archived && 'opacity-60',
        isMe && 'ring-1 ring-gold/50',
      )}
    >
      {top && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)] bg-gradient-to-r from-gold/10 to-transparent"
        />
      )}

      <span
        className={cn(
          'relative z-10 grid shrink-0 place-items-center rounded-full font-display font-semibold tabular',
          first ? 'size-11 text-[21px]' : 'size-9 text-[16px]',
          top
            ? 'border border-gold/60 bg-gold/15 text-gold-deep dark:text-gold'
            : 'border border-line bg-surface-2 text-muted',
        )}
      >
        {row.rank}
      </span>

      <AgentAvatar agentId={row.agentId} size={first ? 44 : 38} className="relative z-10" />

      <div className="relative z-10 min-w-[190px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/agents/${row.agentId}`}
            className={cn(
              'font-display font-semibold text-ink hover:underline',
              first ? 'text-[19px]' : 'text-[16.5px]',
            )}
          >
            {agentName(row.agentId)}
          </Link>
          <span className="font-mono text-[11px] text-muted">{agent.agentCode}</span>
          <LevelBadge level={agent.level} />
          {isMe && (
            <span className="rounded-full border border-gold/55 bg-gold/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-gold-deep dark:text-gold">
              You
            </span>
          )}
          <ArchivedChip agent={agent} />
        </div>

        <p className="mt-0.5 text-[13px] text-muted">
          <span className={cn(rankBy === 'collected' && 'font-medium text-ink')}>
            {formatPeso(row.collectedCentavos, { decimals: false })} collected
          </span>
          <span className="px-1.5 opacity-50">·</span>
          <span className={cn(rankBy === 'contracts' && 'font-medium text-ink')}>
            {formatCount(row.contractCount)} contract
            {row.contractCount === 1 ? '' : 's'}
          </span>
        </p>

        <div className="mt-1.5 flex items-center gap-2.5">
          {pct === null ? (
            <span className="text-[12px] text-muted">No target set</span>
          ) : (
            <>
              <span className="h-1.5 w-40 overflow-hidden rounded-full bg-line-soft">
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, pct)}%` }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'block h-full rounded-full',
                    pct >= 100 ? 'bg-green' : 'bg-gold',
                  )}
                />
              </span>
              <span className="tabular text-[12px] text-muted">
                {pct}% of {formatPeso(row.targetCentavos, { compact: true })} target
              </span>
            </>
          )}
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-5">
        <div className="text-right">
          <p className="text-[10.5px] uppercase tracking-[0.07em] text-muted">
            Commission <RatesAssumed className="ml-1" />
          </p>
          <p
            className={cn(
              'font-display font-semibold tabular text-gold-deep dark:text-gold',
              first ? 'text-[22px]' : 'text-[18px]',
            )}
          >
            {formatPeso(row.commissionCentavos, { decimals: false })}
          </p>
        </div>
        <div className="w-[52px] text-right">
          <MovementChip delta={movement} />
        </div>
      </div>

      {first && (
        <Icon
          icon={IconTrophy}
          size={16}
          className="absolute right-3 top-3 text-gold-deep/60 dark:text-gold/60"
        />
      )}
    </div>
  )
}
