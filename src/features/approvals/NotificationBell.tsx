import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import type { IconSvgElement } from '@hugeicons/react'
import type { ApprovalTask, Notification, NotificationKind } from '@/domain'
import { useDataset } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import { useNotifications } from '@/stores/notifications'
import { useSales } from '@/stores/sales'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconBell,
  IconBurials,
  IconCheck,
  IconClock,
  IconClose,
  IconContract,
  IconGroundsJob,
  IconHold,
  IconPayment,
  IconPayout,
  IconWarning,
} from '@/components/ui-brand/icons'
import { LogoMark } from '@/components/shell/Logo'
import { fmtRelative } from '@/lib/dates'
import { NOW, TODAY } from '@/mock'
import { cn } from '@/lib/utils'
import { decide, type DecisionOutcome } from './decide'
import { RejectDialog } from './RejectDialog'

const KIND_ICON: Record<NotificationKind, IconSvgElement> = {
  hold_requested: IconHold,
  hold_decided: IconCheck,
  hold_expiring: IconClock,
  payment_posted: IconPayment,
  installment_overdue: IconWarning,
  contract_approved: IconContract,
  payout_ready: IconPayout,
  interment_scheduled: IconBurials,
  job_assigned: IconGroundsJob,
}

const yesterday = (() => {
  const d = new Date(`${TODAY}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
})()

type Bucket = 'Today' | 'Yesterday' | 'Earlier'

const bucketOf = (n: Notification): Bucket => {
  const day = n.createdAt.slice(0, 10)
  if (day >= TODAY) return 'Today'
  if (day === yesterday) return 'Yesterday'
  return 'Earlier'
}

const BUCKETS: Bucket[] = ['Today', 'Yesterday', 'Earlier']

/** The lot code carried in a notification title, e.g. "Hold requested on B01-L112". */
const lotCodeIn = (s: string): string | null => /\b(B\d{2,}-L\d{2,})\b/.exec(s)?.[1] ?? null

/**
 * The bell.
 *
 * The most common decision in the system — approving a hold — is one click
 * from anywhere, because it lives in the row rather than behind a navigation.
 * Everything else is a read: click to mark read and follow the deep link.
 */
export function NotificationBell() {
  const user = useSession((s) => s.currentUser())
  const data = useDataset((s) => s.data)
  const dataVersion = useDataset((s) => s.version)
  const version = useNotifications((s) => s.version)
  const markRead = useNotifications((s) => s.markRead)
  const markAllRead = useNotifications((s) => s.markAllRead)
  const approvalsFor = useNotifications((s) => s.approvalsFor)
  const surfaceExpiringHolds = useNotifications((s) => s.surfaceExpiringHolds)
  const initSales = useSales((s) => s.init)
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [rejecting, setRejecting] = useState<ApprovalTask | null>(null)

  // Hold expiry runs wherever the shell is mounted, not only on /sales — the
  // seeded hold expiring tomorrow has to be visible without hunting for it.
  useEffect(() => {
    initSales()
    surfaceExpiringHolds()
  }, [initSales, surfaceExpiringHolds])

  const mine = useMemo(() => {
    void version
    void dataVersion
    if (!user) return []
    return data.notifications
      .filter((n) => n.userId === user.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [data.notifications, user, version, dataVersion])

  /** Pending hold tasks this user may decide, keyed by lot code. */
  const decidableHolds = useMemo(() => {
    void version
    void dataVersion
    const map = new Map<string, ApprovalTask>()
    for (const task of approvalsFor(user)) {
      if (task.kind !== 'hold') continue
      const code = lotCodeIn(task.title)
      if (code && !map.has(code)) map.set(code, task)
    }
    return map
  }, [approvalsFor, user, version, dataVersion])

  const unread = mine.filter((n) => !n.readAt).length
  const prevUnread = useRef(unread)
  const grew = unread > prevUnread.current
  useEffect(() => {
    prevUnread.current = unread
  }, [unread])

  const grouped = useMemo(() => {
    const out: { bucket: Bucket; rows: Notification[] }[] = []
    for (const b of BUCKETS) {
      const rows = mine.filter((n) => bucketOf(n) === b)
      if (rows.length > 0) out.push({ bucket: b, rows: rows.slice(0, 20) })
    }
    return out
  }, [mine])

  if (!user) return null

  function announce(outcome: DecisionOutcome) {
    if (!outcome.ok) {
      toast.error(outcome.message, { description: outcome.description, duration: 8000 })
      return
    }
    toast.success(outcome.message, {
      description: outcome.description,
      duration: outcome.undo ? 8000 : 4000,
      action: outcome.undo
        ? {
            label: 'Undo',
            onClick: () => {
              outcome.undo!()
              toast.success('Decision reversed', {
                description: 'It is back in the queue, and the reversal is on the audit trail.',
              })
            },
          }
        : undefined,
    })
  }

  function openRow(n: Notification) {
    markRead(n.id)
    if (n.href) {
      setOpen(false)
      navigate(n.href)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 text-muted hover:text-ink"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          >
            <Icon icon={IconBell} size={17} />
            {unread > 0 && (
              <motion.span
                key={grew ? `up-${unread}` : `n-${unread}`}
                initial={grew ? { scale: 0.5 } : false}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 18 }}
                className="absolute -right-0.5 -top-0.5 grid min-w-[15px] place-items-center rounded-full bg-danger px-1 text-[9.5px] font-bold leading-[15px] text-white"
              >
                {unread}
              </motion.span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-[380px] p-0">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <span className="text-[13px] font-medium text-ink">
              Notifications
              {unread > 0 && <span className="ml-1.5 text-muted">{unread} unread</span>}
            </span>
            {unread > 0 && (
              <button
                onClick={() => markAllRead(user.id)}
                className="text-[11.5px] text-gold-deep hover:underline dark:text-gold"
              >
                Mark all read
              </button>
            )}
          </div>

          {mine.length === 0 ? (
            <CaughtUp />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {grouped.map((group) => (
                <div key={group.bucket}>
                  <p className="eyebrow sticky top-0 z-10 border-b border-line-soft bg-surface-2 px-3.5 py-1 text-muted">
                    {group.bucket}
                  </p>
                  <ul>
                    <AnimatePresence initial={false}>
                      {group.rows.map((n) => {
                        const code = n.kind === 'hold_requested' ? lotCodeIn(n.title) : null
                        const task = code ? decidableHolds.get(code) : undefined
                        return (
                          <motion.li
                            key={n.id}
                            layout
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                            className={cn(
                              'border-b border-line-soft last:border-0',
                              !n.readAt && 'bg-gold/5',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => openRow(n)}
                              className="flex w-full gap-2.5 px-3.5 pt-2.5 pb-2 text-left transition-colors hover:bg-surface-2"
                            >
                              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted">
                                <Icon icon={KIND_ICON[n.kind]} size={13} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-start gap-2">
                                  <span className="block flex-1 text-[12.5px] font-medium text-ink">
                                    {n.title}
                                  </span>
                                  {!n.readAt && (
                                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
                                  )}
                                </span>
                                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                                  {n.body}
                                </span>
                                <span className="mt-1 block text-[10.5px] text-muted">
                                  {fmtRelative(n.createdAt, NOW)}
                                </span>
                              </span>
                            </button>

                            {/* The most common decision in the system, in the row. */}
                            {task && (
                              <div className="flex items-center gap-1.5 pb-2.5 pl-[46px] pr-3.5">
                                <Button
                                  size="sm"
                                  className="h-7 gap-1 px-2.5 text-[11.5px]"
                                  onClick={() => {
                                    markRead(n.id)
                                    announce(decide(task, 'approved', user))
                                  }}
                                >
                                  <Icon icon={IconCheck} size={12} />
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 border-line px-2.5 text-[11.5px] text-muted hover:border-danger/50 hover:text-danger"
                                  onClick={() => {
                                    markRead(n.id)
                                    setOpen(false)
                                    setRejecting(task)
                                  }}
                                >
                                  <Icon icon={IconClose} size={12} />
                                  Reject
                                </Button>
                              </div>
                            )}
                          </motion.li>
                        )
                      })}
                    </AnimatePresence>
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-line px-3.5 py-2">
            <button
              onClick={() => {
                setOpen(false)
                navigate('/approvals')
              }}
              className="text-[11.5px] text-gold-deep hover:underline dark:text-gold"
            >
              Open the approvals queue
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <RejectDialog
        task={rejecting}
        onOpenChange={(v) => {
          if (!v) setRejecting(null)
        }}
        onConfirm={(task, reason) => {
          setRejecting(null)
          announce(decide(task, 'rejected', user, reason))
        }}
      />
    </>
  )
}

/** Designed, not a generic empty row — this is a good outcome, not a gap. */
function CaughtUp() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <LogoMark size={30} className="text-gold-deep dark:text-gold" />
      <p className="mt-3.5 font-display text-[18px] text-ink">You&rsquo;re all caught up</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        Nothing needs your attention. New requests arrive here the moment
        somebody raises one.
      </p>
    </div>
  )
}
