import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import type { ApprovalKind, ApprovalTask } from '@/domain'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SectionHeading } from '@/components/ui-brand/SectionHeading'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { Icon } from '@/components/ui-brand/Icon'
import { IconApprovals, IconCheck, IconClose } from '@/components/ui-brand/icons'
import { LogoMark } from '@/components/shell/Logo'
import { useCurrentUserOrNull } from '@/lib/permissions'
import { useDataset } from '@/stores/dataset'
import { useNotifications } from '@/stores/notifications'
import { useSales } from '@/stores/sales'
import { fmtDateLong, fmtDateTime, fmtRelative } from '@/lib/dates'
import { NOW, TODAY } from '@/mock'
import { cn } from '@/lib/utils'
import { KIND_META, KIND_ORDER, userName } from './lib'
import { ApprovalCard } from './ApprovalCard'
import { RejectDialog } from './RejectDialog'
import { taskHeadline, taskIsResolvable } from './details'
import { approveMany, decide, type DecisionOutcome } from './decide'

const EASE = [0.22, 1, 0.36, 1] as const
const UNDO_MS = 8000

type Tab = ApprovalKind | 'all' | 'decided'

export default function ApprovalsPage() {
  const user = useCurrentUserOrNull()
  const version = useNotifications((s) => s.version)
  const dataVersion = useDataset((s) => s.version)
  const approvalsFor = useNotifications((s) => s.approvalsFor)
  const approvalCounts = useNotifications((s) => s.approvalCounts)
  const decidedFor = useNotifications((s) => s.decidedFor)
  const surfaceExpiringHolds = useNotifications((s) => s.surfaceExpiringHolds)
  const initSales = useSales((s) => s.init)

  const [tab, setTab] = useState<Tab>('all')
  const [sort, setSort] = useState<'oldest' | 'newest'>('oldest')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rejecting, setRejecting] = useState<ApprovalTask | null>(null)
  const [busy, setBusy] = useState(false)

  // Stale holds lapse against TODAY and the ones about to lapse get a warning.
  useEffect(() => {
    initSales()
    surfaceExpiringHolds()
  }, [initSales, surfaceExpiringHolds])

  const pending = useMemo(() => {
    void version
    void dataVersion
    return approvalsFor(user).filter(taskIsResolvable)
  }, [approvalsFor, user, version, dataVersion])

  const counts = useMemo(() => {
    void version
    void dataVersion
    return approvalCounts(user)
  }, [approvalCounts, user, version, dataVersion])

  const decided = useMemo(() => {
    void version
    void dataVersion
    return decidedFor(user, 50)
  }, [decidedFor, user, version, dataVersion])

  /** Only the kinds this user is actually able to decide get a tab. */
  const kinds = useMemo(() => {
    const seen = new Set<ApprovalKind>()
    for (const t of pending) seen.add(t.kind)
    for (const t of decided) seen.add(t.kind)
    return KIND_ORDER.filter((k) => seen.has(k))
  }, [pending, decided])

  const rows = useMemo(() => {
    const base = tab === 'all' || tab === 'decided' ? pending : pending.filter((t) => t.kind === tab)
    // approvalsFor already hands them over oldest-first; newest is the flip.
    return sort === 'oldest' ? base : [...base].reverse()
  }, [pending, tab, sort])

  const selectedHolds = useMemo(
    () => rows.filter((t) => t.kind === 'hold' && selected.has(t.id)),
    [rows, selected],
  )

  useEffect(() => {
    setSelected(new Set())
    setExpandedId(null)
  }, [tab])

  if (!user) return null

  function announce(outcome: DecisionOutcome) {
    if (!outcome.ok) {
      toast.error(outcome.message, { description: outcome.description, duration: 8000 })
      return
    }
    // One toast per USER ACTION — never one per side effect.
    toast.success(outcome.message, {
      description: outcome.description,
      duration: outcome.undo ? UNDO_MS : 4000,
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

  function runDecision(task: ApprovalTask, decision: 'approved' | 'rejected', note?: string) {
    if (!user) return
    setBusy(true)
    const outcome = decide(task, decision, user, note)
    setBusy(false)
    setExpandedId((id) => (id === task.id ? null : id))
    setSelected((s) => {
      const next = new Set(s)
      next.delete(task.id)
      return next
    })
    announce(outcome)
  }

  function runBulk() {
    if (!user || selectedHolds.length === 0) return
    setBusy(true)
    const outcome = approveMany(selectedHolds, user)
    setBusy(false)
    setSelected(new Set())
    announce(outcome)
  }

  const total = counts.all

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] space-y-4 p-4 sm:p-6">
        <SectionHeading
          eyebrow={fmtDateLong(TODAY)}
          title="Approvals"
          size="lg"
          action={
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-caption text-muted">
              <span className="font-display text-small-title font-semibold tabular text-ink">
                {total}
              </span>
              pending
            </span>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-w-0">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="all">
                All
                <Count n={counts.all} />
              </TabsTrigger>
              {kinds.map((k) => (
                <TabsTrigger key={k} value={k}>
                  {KIND_META[k].plural}
                  <Count n={counts[k]} />
                </TabsTrigger>
              ))}
              <TabsTrigger value="decided">Decided</TabsTrigger>
            </TabsList>
          </Tabs>

          {tab !== 'decided' && total > 0 && (
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger size="sm" className="w-full sm:w-[168px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oldest">Oldest waiting first</SelectItem>
                <SelectItem value="newest">Newest first</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {tab === 'decided' ? (
          <DecidedTable rows={decided} />
        ) : rows.length === 0 ? (
          total === 0 ? (
            <AllClear />
          ) : (
            <EmptyState
              icon={IconApprovals}
              title={`No ${tab === 'all' ? '' : KIND_META[tab as ApprovalKind].plural.toLowerCase()} waiting`.replace(
                '  ',
                ' ',
              )}
              body="Nothing of this kind is in your queue. The other tabs still have work."
            />
          )
        ) : (
          <>
            <AnimatePresence initial={false}>
              {selectedHolds.length > 0 && (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.24, ease: EASE }}
                  className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-gold/50 bg-gold/8 px-3.5 py-2.5"
                >
                  <span className="text-caption text-ink">
                    {selectedHolds.length} hold
                    {selectedHolds.length === 1 ? '' : 's'} selected
                  </span>
                  <span className="text-caption text-muted">
                    Bulk approval is for holds only — contracts, payouts and interments
                    carry money or a grave.
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelected(new Set())}
                    >
                      Clear
                    </Button>
                    <Button size="sm" disabled={busy} onClick={runBulk} className="gap-1.5">
                      <Icon icon={IconCheck} size={14} />
                      Approve {selectedHolds.length} selected
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.ul layout className="space-y-2.5">
              <AnimatePresence initial={false} mode="popLayout">
                {rows.map((task) => (
                  <ApprovalCard
                    key={task.id}
                    task={task}
                    expanded={expandedId === task.id}
                    onToggle={() =>
                      setExpandedId((id) => (id === task.id ? null : task.id))
                    }
                    selectable={task.kind === 'hold'}
                    selected={selected.has(task.id)}
                    onSelectedChange={(v) =>
                      setSelected((s) => {
                        const next = new Set(s)
                        if (v) next.add(task.id)
                        else next.delete(task.id)
                        return next
                      })
                    }
                    busy={busy}
                    onApprove={() => runDecision(task, 'approved')}
                    onReject={() => setRejecting(task)}
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          </>
        )}
      </div>

      <RejectDialog
        task={rejecting}
        onOpenChange={(open) => {
          if (!open) setRejecting(null)
        }}
        onConfirm={(task, reason) => {
          setRejecting(null)
          runDecision(task, 'rejected', reason)
        }}
      />
    </div>
  )
}

function Count({ n }: { n: number }) {
  if (!n) return null
  return (
    <span className="ml-1.5 grid min-w-[17px] place-items-center rounded-full bg-gold px-1 text-micro font-bold leading-[17px] text-black">
      {n}
    </span>
  )
}

/** Designed, not a generic empty table — people will see this often. */
function AllClear() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
      className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-line bg-surface px-6 py-20 text-center"
    >
      <LogoMark size={44} className="text-gold-deep dark:text-gold" />
      <p className="mt-5 font-display text-page-title font-semibold text-ink">
        Nothing waiting on you
      </p>
      <p className="mt-1.5 text-caption text-muted">{fmtDateLong(TODAY)}</p>
      <p className="mt-4 max-w-[44ch] text-caption leading-relaxed text-muted">
        Every hold, contract, interment and payout at your location has been decided.
        New requests land here the moment they are raised.
      </p>
    </motion.div>
  )
}

function DecidedTable({ rows }: { rows: ApprovalTask[] }) {
  const columns: Column<ApprovalTask>[] = [
    {
      key: 'kind',
      header: 'Kind',
      width: '116px',
      cell: (r) => {
        const meta = KIND_META[r.kind]
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-micro font-medium uppercase tracking-[0.06em]',
              meta.tone,
            )}
          >
            <Icon icon={meta.icon} size={12} />
            {meta.label}
          </span>
        )
      },
    },
    {
      key: 'what',
      header: 'What',
      cell: (r) => (
        <div className="min-w-0">
          <p className="break-words font-mono text-caption text-ink">{taskHeadline(r)}</p>
          <p className="break-words text-caption text-muted">{r.summary}</p>
        </div>
      ),
      sortBy: (r) => r.title,
    },
    {
      key: 'decision',
      header: 'Decision',
      width: '116px',
      cell: (r) => (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-caption font-medium',
            r.status === 'approved' ? 'text-green' : 'text-danger',
          )}
        >
          <Icon icon={r.status === 'approved' ? IconCheck : IconClose} size={13} />
          {r.status === 'approved' ? 'Approved' : 'Rejected'}
        </span>
      ),
      sortBy: (r) => r.status,
    },
    {
      key: 'by',
      header: 'Decided by',
      width: '180px',
      cell: (r) => (
        <span className="text-caption text-ink">{userName(r.decidedByUserId)}</span>
      ),
      sortBy: (r) => userName(r.decidedByUserId),
    },
    {
      key: 'when',
      header: 'When',
      width: '170px',
      cell: (r) => (
        <span className="text-caption text-muted" title={fmtDateTime(r.decidedAt ?? r.updatedAt)}>
          {fmtRelative(r.decidedAt ?? r.updatedAt, NOW)}
        </span>
      ),
      sortBy: (r) => r.decidedAt ?? r.updatedAt,
    },
  ]

  return (
    <div className="space-y-2">
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        initialSort={{ key: 'when', dir: 'desc' }}
        emptyIcon={IconApprovals}
        empty={{
          title: 'No decisions yet',
          body: 'Once you approve or reject something, the last fifty decisions live here.',
        }}
        footer={
          rows.length > 0
            ? `Last ${rows.length} decision${rows.length === 1 ? '' : 's'}, newest first.`
            : undefined
        }
      />
      {rows.some((r) => r.decisionNote) && (
        <ul className="space-y-1.5">
          {rows
            .filter((r) => r.decisionNote)
            .slice(0, 6)
            .map((r) => (
              <li key={`${r.id}-note`} className="text-caption leading-relaxed text-muted">
                <span className="font-mono text-ink">{taskHeadline(r)}</span> —{' '}
                {r.decisionNote}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
