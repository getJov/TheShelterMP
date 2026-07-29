import { useNavigate } from 'react-router-dom'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { formatPeso } from '@/lib/money'
import { cn } from '@/lib/utils'
import { CardEmpty, CardShell } from '../CardShell'
import { selectLeaderboard } from '../selectors'
import type { CardProps } from '../types'

export function LeaderboardCard(props: CardProps) {
  const navigate = useNavigate()
  const d = selectLeaderboard({
    version: props.version,
    user: props.user,
    locationId: props.locationId,
    period: props.period,
    agentId: props.agent?.id ?? null,
  })

  const leader = d.rows[0]

  return (
    <CardShell
      card={props}
      value={leader ? formatPeso(leader.collectedCentavos, { compact: true }) : '—'}
      subtitle={leader ? `${leader.name} leads on collections` : 'No collections yet'}
      detailsHref="/agents"
      detailsLabel="Open agents"
      footer={
        d.selfPinned
          ? 'Your row is pinned below the top five.'
          : `${d.totalAgents} agents ranked by value collected.`
      }
    >
      {d.rows.length === 0 ? (
        <CardEmpty>No agent has collected in this period.</CardEmpty>
      ) : (
        <ul className="space-y-1.5">
          {d.rows.map((r) => (
            <li key={r.agentId}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/agents/${r.agentId}`)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2',
                  r.isSelf && 'bg-gold/10 ring-1 ring-gold/35 hover:bg-gold/14',
                )}
              >
                <span className="w-3.5 shrink-0 text-right text-[11px] font-semibold tabular text-muted">
                  {r.rank}
                </span>
                <Avatar className="size-6 shrink-0">
                  <AvatarFallback className="bg-gold/18 text-[9.5px] font-semibold text-gold-deep dark:text-gold">
                    {r.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                      {r.name}
                      {r.isSelf && (
                        <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-gold-deep dark:text-gold">
                          You
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[12px] font-semibold tabular text-ink">
                      {formatPeso(r.collectedCentavos, { compact: true })}
                    </span>
                  </span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <Progress
                      value={Math.min(100, Math.round((r.targetRatio ?? 0) * 100))}
                      className="h-1 bg-line-soft"
                    />
                    <span className="w-8 shrink-0 text-right text-[10px] tabular text-muted">
                      {r.targetRatio === null
                        ? '—'
                        : `${Math.round(r.targetRatio * 100)}%`}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  )
}
