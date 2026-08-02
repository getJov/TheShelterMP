import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/ui-brand/Icon'
import { IconArrowRight } from '@/components/ui-brand/icons'
import { cn } from '@/lib/utils'
import { CardEmpty, CardShell } from '../CardShell'
import { selectAttention } from '../selectors'
import type { CardProps } from '../types'

const TONE: Record<'neutral' | 'warning' | 'danger', string> = {
  neutral: 'bg-surface-2 text-muted',
  warning: 'bg-gold/16 text-gold-deep dark:text-gold',
  danger: 'bg-danger/14 text-danger',
}

/** The card that turns the dashboard from a report into a to-do list. */
export function AttentionCard(props: CardProps) {
  const navigate = useNavigate()
  const d = selectAttention({
    version: props.version,
    user: props.user,
    locationId: props.locationId,
    period: props.period,
    agentId: null,
  })

  return (
    <CardShell
      card={props}
      value={String(d.total)}
      subtitle={d.total === 0 ? 'Nothing waiting on you' : 'Items waiting on a decision'}
      detailsHref="/approvals"
      detailsLabel="Open approvals"
      footer={d.total > 0 ? 'Each row opens the screen that clears it.' : undefined}
    >
      {d.rows.length === 0 ? (
        <CardEmpty>Nothing needs attention right now.</CardEmpty>
      ) : (
        <ul className="space-y-0.5">
          {d.rows.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(r.href)
                }}
                className="group/row flex min-h-10 w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
              >
                <span
                  className={cn(
                    'grid h-5 min-w-5 shrink-0 place-items-center rounded px-1 text-micro font-semibold tabular',
                    TONE[r.tone],
                  )}
                >
                  {r.count}
                </span>
                <span className="min-w-0 flex-1 break-words text-caption text-ink">
                  {r.label}
                </span>
                <Icon
                  icon={IconArrowRight}
                  size={13}
                  className="shrink-0 text-muted opacity-0 transition-opacity group-hover/row:opacity-100"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  )
}
