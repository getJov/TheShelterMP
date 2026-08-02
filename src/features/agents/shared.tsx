import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AGENT_PALETTE,
  ASSUMPTIONS,
  COMMISSION_STATUS_LABEL,
  PAYOUT_RUN_STATUS_LABEL,
  type AgentId,
  type AgentProfile,
  type Centavos,
  type CommissionLevel,
  type CommissionStatus,
  type PayoutRunStatus,
} from '@/domain'
import { dataset, indexes, useDataset } from '@/stores/dataset'
import { agentName, levelLabel, rateOf } from '@/stores/agents'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { Icon } from '@/components/ui-brand/Icon'
import { IconCalendar } from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { fmtDate, toDate, toISODate } from '@/lib/dates'
import { formatPercent } from '@/lib/money'
import { cn } from '@/lib/utils'
import { PERIOD_OPTIONS, usePeriodStore, type ResolvedPeriod } from './period'

/** Subscribes the caller to dataset mutations so selectors recompute. */
export function useDatasetVersion(): number {
  return useDataset((s) => s.version)
}

// ── the assumed-rates chip, used on every screen that shows 6/4/2 ────
export function RatesAssumed({ className }: { className?: string }) {
  return <AssumedChip why={ASSUMPTIONS.commissionRates.why} className={className} />
}

export function LevelNamesAssumed({ className }: { className?: string }) {
  return (
    <AssumedChip why={ASSUMPTIONS.commissionLevelNames.why} className={className} />
  )
}

// ── people ───────────────────────────────────────────────────────────
const initialsOf = (name: string) =>
  name
    .split(' ')
    .filter((p) => p.length > 1)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

export function AgentAvatar({
  agentId,
  size = 32,
  className,
}: {
  agentId: AgentId
  size?: number
  className?: string
}) {
  const idx = useMemo(
    () => dataset().agents.findIndex((a) => a.id === agentId),
    [agentId],
  )
  const color = AGENT_PALETTE[(idx < 0 ? 0 : idx) % AGENT_PALETTE.length]!
  const name = agentName(agentId)
  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold text-white',
        size >= 48 ? 'text-caption' : 'text-micro',
        className,
      )}
      style={{ width: size, height: size, background: color }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  )
}

export function AgentIdentity({
  agentId,
  link = true,
  size = 30,
  sub,
}: {
  agentId: AgentId
  link?: boolean
  size?: number
  sub?: ReactNode
}) {
  const agent = indexes().agentsById.get(agentId)
  const archived = agent?.status === 'archived'
  const body = (
    <span className="flex min-w-0 items-center gap-2.5">
      <AgentAvatar agentId={agentId} size={size} className={cn(archived && 'opacity-45')} />
      <span className="min-w-0">
        <span
          className={cn(
            'block break-words text-caption font-medium',
            archived ? 'text-muted' : 'text-ink',
          )}
        >
          {agentName(agentId)}
        </span>
        <span className="block break-all font-mono text-micro text-muted">
          {sub ?? agent?.agentCode ?? '—'}
        </span>
      </span>
    </span>
  )
  if (!link) return body
  return (
    <Link to={`/agents/${agentId}`} className="hover:underline">
      {body}
    </Link>
  )
}

export function ArchivedChip({ agent }: { agent: AgentProfile }) {
  if (agent.status !== 'archived') return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center rounded border border-line bg-surface-2 px-1.5 py-px text-micro font-semibold uppercase tracking-[0.06em] text-muted">
          Archived
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-caption leading-relaxed">
        <span className="font-semibold">Access revoked {fmtDate(agent.archivedAt)}. </span>
        {agent.archiveReason ?? 'No reason recorded.'} Attribution and past
        commission are preserved.
      </TooltipContent>
    </Tooltip>
  )
}

// ── level ────────────────────────────────────────────────────────────
const LEVEL_TONE: Record<CommissionLevel, string> = {
  distributor: 'border-gold/45 bg-gold/12 text-gold-deep dark:text-gold',
  team_leader: 'border-info/45 bg-info/12 text-info',
  associate: 'border-green/45 bg-green/12 text-green',
}

export function LevelBadge({
  level,
  withRate,
  className,
}: {
  level: CommissionLevel
  withRate?: boolean
  className?: string
}) {
  useDatasetVersion()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption font-medium whitespace-nowrap',
        LEVEL_TONE[level],
        className,
      )}
    >
      {levelLabel(level)}
      {withRate && (
        <span className="tabular opacity-80">{formatPercent(rateOf(level))}</span>
      )}
    </span>
  )
}

// ── statuses ─────────────────────────────────────────────────────────
const COMMISSION_TONE: Record<CommissionStatus, string> = {
  accrued: 'border-line bg-surface-2 text-muted',
  in_run: 'border-gold/45 bg-gold/12 text-gold-deep dark:text-gold',
  approved: 'border-info/45 bg-info/12 text-info',
  released: 'border-green/45 bg-green/12 text-green',
  voided: 'border-line bg-surface-2 text-muted line-through',
  clawback_pending: 'border-danger/45 bg-danger/12 text-danger',
}

export function CommissionStatusChip({ status }: { status: CommissionStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-caption font-medium whitespace-nowrap',
        COMMISSION_TONE[status],
      )}
    >
      {COMMISSION_STATUS_LABEL[status]}
    </span>
  )
}

const RUN_TONE: Record<PayoutRunStatus, string> = {
  open: 'border-gold/45 bg-gold/12 text-gold-deep dark:text-gold',
  pending_approval: 'border-info/45 bg-info/12 text-info',
  approved: 'border-green/45 bg-green/12 text-green',
  released: 'border-line bg-surface-2 text-muted',
}

export function RunStatusChip({ status }: { status: PayoutRunStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-caption font-medium whitespace-nowrap',
        RUN_TONE[status],
      )}
    >
      {PAYOUT_RUN_STATUS_LABEL[status]}
    </span>
  )
}

// ── targets ──────────────────────────────────────────────────────────
export function TargetBar({
  collected,
  target,
  className,
}: {
  collected: Centavos
  target: Centavos | null
  className?: string
}) {
  if (!target) {
    return <span className={cn('text-caption text-muted', className)}>No target set</span>
  }
  const pct = Math.min(100, Math.round((collected / target) * 100))
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line-soft">
        <span
          className={cn(
            'block h-full rounded-full transition-[width] duration-500',
            pct >= 100 ? 'bg-green' : 'bg-gold',
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular text-caption text-muted">{pct}%</span>
    </span>
  )
}

export function TargetRing({
  collected,
  target,
  size = 108,
}: {
  collected: Centavos
  target: Centavos | null
  size?: number
}) {
  const r = size / 2 - 8
  const circ = 2 * Math.PI * r
  const ratio = target ? Math.min(1, collected / target) : 0
  const pct = target ? Math.round((collected / target) * 100) : null
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={7}
          className="stroke-line-soft"
        />
        {target && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - ratio)}
            className={ratio >= 1 ? 'stroke-green' : 'stroke-gold'}
            style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)' }}
          />
        )}
      </svg>
      <div className="absolute grid place-items-center text-center">
        {pct === null ? (
          <span className="text-caption leading-tight text-muted">No target<br />set</span>
        ) : (
          <>
            <span className="font-display text-section-title font-semibold tabular text-ink leading-none">
              {pct}%
            </span>
            <span className="mt-1 text-micro uppercase tracking-[0.08em] text-muted">
              of target
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ── rank movement ────────────────────────────────────────────────────
export function MovementChip({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help text-caption font-semibold text-muted">★</span>
        </TooltipTrigger>
        <TooltipContent>New this period</TooltipContent>
      </Tooltip>
    )
  }
  if (delta === 0) {
    return (
      <span className="tabular text-caption font-semibold text-muted" title="No change">
        ▬
      </span>
    )
  }
  const up = delta > 0
  return (
    <span
      className={cn('tabular text-caption font-semibold', up ? 'text-green' : 'text-danger')}
      title={`${up ? 'Up' : 'Down'} ${Math.abs(delta)} place${Math.abs(delta) === 1 ? '' : 's'}`}
    >
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  )
}

// ── period picker ────────────────────────────────────────────────────
export function PeriodPicker({ period }: { period: ResolvedPeriod }) {
  const { kind, customFrom, customTo, setKind, setCustom } = usePeriodStore()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
        <SelectTrigger size="sm" className="w-full sm:w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {kind === 'custom' ? (
        <>
          <DateField value={customFrom} onChange={(v) => setCustom(v, customTo)} />
          <span className="text-caption text-muted">→</span>
          <DateField value={customTo} onChange={(v) => setCustom(customFrom, v)} />
        </>
      ) : (
        <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-caption text-muted">
          {period.label}
        </span>
      )}
    </div>
  )
}

export function DateField({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-2 font-normal tabular', className)}
        >
          <Icon icon={IconCalendar} size={15} />
          {fmtDate(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={toDate(value)}
          defaultMonth={toDate(value)}
          onSelect={(d) => d && onChange(toISODate(d))}
        />
      </PopoverContent>
    </Popover>
  )
}

// ── the Sunday rule, stated rather than hidden ───────────────────────
export function SundayFootnote({ className }: { className?: string }) {
  return (
    <p className={cn('text-caption leading-relaxed text-muted', className)}>
      Payout windows run <strong className="font-medium text-ink">Saturday → Thursday</strong>{' '}
      and are released on Friday. Sunday is excluded from the earning window, so a
      payment posted on a Sunday accrues into the <em>following</em> window.
    </p>
  )
}
