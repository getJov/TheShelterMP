import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { AuditEvent } from '@/domain'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SectionHeading } from '@/components/ui-brand/SectionHeading'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconAudit,
  IconCalendar,
  IconChevronDown,
  IconLink,
  IconRefresh,
  IconSearch,
} from '@/components/ui-brand/icons'
import { useCan } from '@/lib/permissions'
import { useDataset } from '@/stores/dataset'
import {
  AUDIT_ACTION_LABEL,
  actorNameOf,
  describe,
  diffFields,
  entityHref,
  entityTypeLabel,
} from '@/lib/audit'
import { addDays, fmtDate, fmtDateTime, toDate, toISODate } from '@/lib/dates'
import { TODAY } from '@/mock'
import { cn } from '@/lib/utils'

const EASE = [0.22, 1, 0.36, 1] as const
const ALL = '__all__'
const PAGE = 60

interface Row {
  event: AuditEvent
  actor: string
  description: string
  entityLabel: string
  href: string | null
}

export default function AuditPage() {
  const allowed = useCan('audit:view')
  const data = useDataset((s) => s.data)
  const version = useDataset((s) => s.version)

  const [actor, setActor] = useState(ALL)
  const [action, setAction] = useState(ALL)
  const [entity, setEntity] = useState(ALL)
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [openId, setOpenId] = useState<string | null>(null)

  /**
   * Every event, rendered once — describe() is the only reader of raw keys.
   * Sorted here rather than trusting array order: some stores unshift and
   * some push, so position in the array is not chronology.
   */
  const rows = useMemo<Row[]>(() => {
    void version
    return [...data.audit]
      .sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1))
      .map((event) => ({
        event,
        actor: actorNameOf(data, event.actorUserId),
        description: describe(event, data),
        entityLabel: entityTypeLabel(event.entityType),
        href: entityHref(event, data),
      }))
  }, [data, version])

  const actors = useMemo(() => {
    const ids = new Set(rows.map((r) => r.event.actorUserId as string))
    return data.users
      .filter((u) => ids.has(u.id as string))
      .map((u) => ({ id: u.id as string, name: u.fullName }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, data.users])

  const actions = useMemo(() => {
    const set = new Set(rows.map((r) => r.event.action))
    return [...set]
      .map((a) => ({ value: a, label: AUDIT_ACTION_LABEL[a] ?? entityTypeLabel(a) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])

  const entities = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) map.set(r.event.entityType, r.entityLabel)
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (actor !== ALL && (r.event.actorUserId as string) !== actor) return false
      if (action !== ALL && r.event.action !== action) return false
      if (entity !== ALL && r.event.entityType !== entity) return false
      const day = r.event.at.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      if (q && !r.description.toLowerCase().includes(q) && !r.actor.toLowerCase().includes(q))
        return false
      return true
    })
  }, [rows, actor, action, entity, from, to, query])

  const dirty = actor !== ALL || action !== ALL || entity !== ALL || !!from || !!to || !!query

  if (!allowed) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <EmptyState
          icon={IconAudit}
          title="The audit log is not yours to read"
          body="Only the owner and administrators can see who changed what. Your own actions are still recorded."
        />
      </div>
    )
  }

  function reset() {
    setActor(ALL)
    setAction(ALL)
    setEntity(ALL)
    setFrom(null)
    setTo(null)
    setQuery('')
    setLimit(PAGE)
  }

  const visible = filtered.slice(0, limit)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1320px] space-y-4 p-4 sm:p-6">
        <SectionHeading
          eyebrow="Oversight"
          title="Audit Log"
          size="lg"
          action={
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-caption text-muted">
              <span className="font-display text-small-title font-semibold tabular text-ink">
                {filtered.length}
              </span>
              {filtered.length === 1 ? 'event' : 'events'}
            </span>
          }
        />

        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
          <div className="relative min-w-0 flex-[1_1_220px]">
            <Icon
              icon={IconSearch}
              size={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search descriptions…"
              className="pl-8"
            />
          </div>

          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger size="sm" className="w-full sm:w-[190px]">
              <SelectValue placeholder="Anyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Anyone</SelectItem>
              {actors.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={action} onValueChange={setAction}>
            <SelectTrigger size="sm" className="w-full sm:w-[200px]">
              <SelectValue placeholder="Any action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any action</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger size="sm" className="w-full sm:w-[160px]">
              <SelectValue placeholder="Any record" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any record</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateField
            value={from}
            placeholder="From"
            onChange={(v) => setFrom(v)}
          />
          <span className="text-caption text-muted">→</span>
          <DateField value={to} placeholder="To" onChange={(v) => setTo(v)} />

          {dirty && (
            <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
              <Icon icon={IconRefresh} size={14} />
              Reset
            </Button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={IconAudit}
            title="Nothing matches those filters"
            body="Widen the date range or clear the filters."
            action={
              dirty ? (
                <Button variant="outline" onClick={reset}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="border-line hover:bg-transparent">
                  <Head className="w-[170px]">When</Head>
                  <Head className="w-[210px]">Actor</Head>
                  <Head>What happened</Head>
                  <Head className="w-[150px]">Record</Head>
                  <Head className="w-[44px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => {
                  const open = openId === r.event.id
                  return [
                    <TableRow key={r.event.id} className="border-line-soft hover:bg-surface-2">
                      <TableCell className="px-3.5 py-2.5 text-caption tabular text-muted">
                        {fmtDateTime(r.event.at)}
                      </TableCell>
                      <TableCell className="px-3.5 py-2.5">
                        <span className="flex items-center gap-2">
                          <ActorAvatar name={r.actor} />
                          <span className="break-words text-caption text-ink">{r.actor}</span>
                        </span>
                      </TableCell>
                      <TableCell className="px-3.5 py-2.5 text-caption text-ink">
                        {r.description}
                      </TableCell>
                      <TableCell className="px-3.5 py-2.5">
                        {r.href ? (
                          <Link
                            to={r.href}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-caption text-gold-deep hover:underline dark:text-gold"
                          >
                            <Icon icon={IconLink} size={13} />
                            {r.entityLabel}
                          </Link>
                        ) : (
                          <span className="text-caption text-muted">{r.entityLabel}</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3.5 py-2.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${open ? 'Collapse' : 'Expand'} audit details for ${r.description}`}
                          aria-expanded={open}
                          onClick={() => setOpenId(open ? null : (r.event.id as string))}
                        >
                          <Icon
                            icon={IconChevronDown}
                            size={15}
                            className={cn(
                              'text-muted transition-transform duration-200',
                              open && 'rotate-180',
                            )}
                          />
                        </Button>
                      </TableCell>
                    </TableRow>,

                    <TableRow key={`${r.event.id}-detail`} className="border-0 hover:bg-transparent">
                      <TableCell colSpan={5} className="p-0">
                        <AnimatePresence initial={false}>
                          {open && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.32, ease: EASE }}
                              className="overflow-hidden border-b border-line-soft bg-surface-2"
                            >
                              <Diff event={r.event} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </TableCell>
                    </TableRow>,
                  ]
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-3.5 py-2 text-caption text-muted">
              <span>
                Showing {visible.length} of {filtered.length}
              </span>
              {visible.length < filtered.length && (
                <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                  Load {Math.min(PAGE, filtered.length - visible.length)} more
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Head({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <TableHead
      className={cn(
        'eyebrow h-auto bg-surface-2 px-3.5 py-2.5 text-gold-deep dark:text-gold',
        className,
      )}
    >
      {children}
    </TableHead>
  )
}

function ActorAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .filter((p) => p.length > 1)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-micro font-semibold text-muted"
    >
      {initials || '—'}
    </span>
  )
}

/** Two columns, with the fields that actually moved called out. */
function Diff({ event }: { event: AuditEvent }) {
  const fields = diffFields(event)

  if (fields.length === 0) {
    return (
      <p className="px-4 py-4 text-caption text-muted">
        No field-level detail was recorded for this event.
      </p>
    )
  }

  return (
    <div className="px-4 py-3.5">
      <div className="grid grid-cols-[minmax(120px,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] gap-x-4">
        <p className="eyebrow pb-1.5 text-muted">Field</p>
        <p className="eyebrow pb-1.5 text-muted">Before</p>
        <p className="eyebrow pb-1.5 text-muted">After</p>

        {fields.map((f) => (
          <div key={f.key} className="contents">
            <p
              className={cn(
                'border-t border-line py-1.5 text-caption',
                f.changed ? 'font-medium text-ink' : 'text-muted',
              )}
            >
              {f.label}
            </p>
            <p
              className={cn(
                'border-t border-line py-1.5 text-caption tabular',
                f.changed ? 'text-danger' : 'text-muted',
              )}
            >
              {f.before ?? <span className="text-muted">—</span>}
            </p>
            <p
              className={cn(
                'border-t border-line py-1.5 text-caption tabular',
                f.changed ? 'font-medium text-green' : 'text-muted',
              )}
            >
              {f.after ?? <span className="text-muted">—</span>}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2.5 border-t border-line pt-2 text-caption text-muted">
        Recorded {fmtDateTime(event.at)} · Read-only.
      </p>
    </div>
  )
}

function DateField({
  value,
  placeholder,
  onChange,
}: {
  value: string | null
  placeholder: string
  onChange: (v: string | null) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-9 gap-2 font-normal tabular', !value && 'text-muted')}
        >
          <Icon icon={IconCalendar} size={14} />
          {value ? fmtDate(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? toDate(value) : undefined}
          defaultMonth={toDate(value ?? addDays(TODAY, -30))}
          onSelect={(d) => onChange(d ? toISODate(d) : null)}
        />
        {value && (
          <div className="border-t border-line p-2">
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
