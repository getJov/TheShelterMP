import { AnimatePresence, motion } from 'framer-motion'
import type { ApprovalTask } from '@/domain'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui-brand/Icon'
import { IconCheck, IconChevronDown, IconClose } from '@/components/ui-brand/icons'
import { fmtRelative } from '@/lib/dates'
import { NOW } from '@/mock'
import { cn } from '@/lib/utils'
import { KIND_META } from './lib'
import { ExpandedDetail, SummaryFacts, taskHeadline } from './details'

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * One task, decidable where it sits.
 *
 * Clicking the card expands it IN PLACE — the decision buttons are pinned in
 * the header row so they stay reachable as the card grows, and the list
 * reflows with a layout animation instead of the page jumping.
 */
export function ApprovalCard({
  task,
  expanded,
  onToggle,
  selectable,
  selected,
  onSelectedChange,
  onApprove,
  onReject,
  busy,
}: {
  task: ApprovalTask
  expanded: boolean
  onToggle: () => void
  selectable: boolean
  selected: boolean
  onSelectedChange: (v: boolean) => void
  onApprove: () => void
  onReject: () => void
  busy: boolean
}) {
  const meta = KIND_META[task.kind]

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 28, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
      className={cn(
        'overflow-hidden rounded-[var(--radius-card)] border bg-surface',
        selected ? 'border-gold' : 'border-line',
      )}
    >
      <div className="flex flex-col items-stretch gap-3 p-3.5 sm:flex-row sm:items-start">
        {selectable && (
          <span className="pt-1" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => onSelectedChange(v === true)}
              aria-label={`Select ${taskHeadline(task)}`}
            />
          </span>
        )}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="min-h-11 min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-micro font-medium uppercase tracking-[0.06em]',
                meta.tone,
              )}
            >
              <Icon icon={meta.icon} size={12} />
              {meta.label}
            </span>
            <span className="min-w-0 break-words font-mono text-caption text-ink">
              {taskHeadline(task)}
            </span>
            <span className="ml-auto shrink-0 text-caption text-muted">
              {fmtRelative(task.requestedAt, NOW)}
            </span>
            <Icon
              icon={IconChevronDown}
              size={15}
              className={cn(
                'shrink-0 text-muted transition-transform duration-200',
                expanded && 'rotate-180',
              )}
            />
          </div>

          <div className="mt-1.5 space-y-0.5">
            <SummaryFacts task={task} />
          </div>
        </button>

        {/* Pinned: these stay in the same place whether the card is 92px or 600px. */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 pt-0.5">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onReject}
            className="gap-1.5 border-line text-muted hover:border-danger/50 hover:text-danger"
          >
            <Icon icon={IconClose} size={13} />
            Reject
          </Button>
          <Button size="sm" disabled={busy} onClick={onApprove} className="gap-1.5">
            <Icon icon={IconCheck} size={13} />
            Approve
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="overflow-hidden border-t border-line-soft"
          >
            <div className="p-3.5">
              <ExpandedDetail task={task} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}
