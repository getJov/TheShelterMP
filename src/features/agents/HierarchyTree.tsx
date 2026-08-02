import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { AgentProfile, Centavos } from '@/domain'
import { dataset } from '@/stores/dataset'
import { rateOf } from '@/stores/agents'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { Icon } from '@/components/ui-brand/Icon'
import { IconChevronDown, IconChevronRight, IconHierarchy } from '@/components/ui-brand/icons'
import { formatPercent } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  AgentIdentity,
  ArchivedChip,
  LevelBadge,
  RatesAssumed,
  useDatasetVersion,
} from './shared'
import type { RosterRow } from './RosterTab'

interface Node {
  agent: AgentProfile
  own: { collected: Centavos; commission: Centavos; contracts: number }
  children: Node[]
  /** Own + everything beneath. */
  roll: { collected: Centavos; commission: Centavos; contracts: number }
}

/**
 * Distributors at the root, team leaders beneath, associates beneath them.
 * Each row carries its own totals and its downline's, which is the clearest
 * answer to "does a team leader earn a share of their team's sales" — the
 * money visibly flows up the tree.
 */
export function HierarchyTree({ rows }: { rows: RosterRow[] }) {
  const version = useDatasetVersion()

  const tree = useMemo(() => {
    void version
    const byId = new Map(rows.map((r) => [r.agent.id, r]))
    const all = dataset().agents
    const visible = new Set(rows.map((r) => r.agent.id))

    const make = (agent: AgentProfile): Node => {
      const r = byId.get(agent.id)
      const own = {
        collected: r?.collectedCentavos ?? 0,
        commission: r?.commissionCentavos ?? 0,
        contracts: r?.activeContracts ?? 0,
      }
      // A distributor's children are whoever reports straight to them; a
      // team leader's children are their associates. Anyone with a team
      // leader hangs off the team leader, never off the distributor twice.
      const isChild = (x: AgentProfile) =>
        x.id !== agent.id &&
        (agent.level === 'distributor'
          ? x.distributorId === agent.id && x.teamLeaderId === null
          : agent.level === 'team_leader'
            ? x.teamLeaderId === agent.id
            : false)

      const kids = all
        .filter(isChild)
        .map(make)
        .filter((n) => visible.has(n.agent.id) || n.children.length > 0)

      const roll = kids.reduce(
        (a, k) => ({
          collected: a.collected + k.roll.collected,
          commission: a.commission + k.roll.commission,
          contracts: a.contracts + k.roll.contracts,
        }),
        { ...own },
      )
      return { agent, own, children: kids, roll }
    }

    const roots = all.filter((a) => a.level === 'distributor')
    const orphans = all.filter(
      (a) => a.level !== 'distributor' && a.distributorId === null && a.teamLeaderId === null,
    )
    return [...roots, ...orphans]
      .map(make)
      .filter((n) => visible.has(n.agent.id) || n.children.length > 0)
  }, [rows, version])

  if (tree.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        <EmptyState
          icon={IconHierarchy}
          title="No hierarchy to show"
          body="No distributors match the current filters."
        />
      </div>
    )
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
        <Icon icon={IconHierarchy} size={15} className="text-gold-deep dark:text-gold" />
        <p className="eyebrow text-gold-deep dark:text-gold">
          Distributor → Team leader → Associate
        </p>
        <RatesAssumed className="ml-1" />
        <p className="ml-auto text-caption text-muted">
          Each edge is labelled with the rate that level earns on every payment
          collected beneath it.
        </p>
      </div>
      <div className="divide-y divide-line-soft">
        {tree.map((n) => (
          <TreeRow key={n.agent.id} node={n} depth={0} />
        ))}
      </div>
    </div>
  )
}

function TreeRow({ node, depth }: { node: Node; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const hasKids = node.children.length > 0

  return (
    <div>
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2',
          depth > 0 && 'border-l-2 border-line-soft',
        )}
        style={{ paddingLeft: 16 + depth * 26 }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!hasKids}
          aria-label={open ? 'Collapse' : 'Expand'}
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded text-muted',
            hasKids ? 'hover:bg-line-soft hover:text-ink' : 'opacity-0',
          )}
        >
          <Icon icon={open ? IconChevronDown : IconChevronRight} size={14} />
        </button>

        <div className="min-w-[210px] flex-1">
          <span className="flex items-center gap-2">
            <AgentIdentity agentId={node.agent.id} />
            <ArchivedChip agent={node.agent} />
          </span>
        </div>

        <LevelBadge level={node.agent.level} withRate />

        <div className="ml-auto flex items-center gap-6 text-right">
          <Metric
            label="Own collected"
            value={node.own.collected}
            sub={`${node.own.contracts} active`}
          />
          <Metric
            label="Own commission"
            value={node.own.commission}
            tone="gold"
          />
          {hasKids && (
            <Metric
              label={`Team of ${countDescendants(node)}`}
              value={node.roll.collected}
              sub="incl. downline"
              strong
            />
          )}
        </div>
      </div>

      {open && hasKids && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          {node.children.map((k) => (
            <div key={k.agent.id} className="border-t border-line-soft">
              <EdgeLabel parent={node} child={k} depth={depth} />
              <TreeRow node={k} depth={depth + 1} />
            </div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

function EdgeLabel({
  parent,
  child,
  depth,
}: {
  parent: Node
  child: Node
  depth: number
}) {
  const rate = rateOf(parent.agent.level)
  return (
    <p
      className="py-1 text-micro text-muted"
      style={{ paddingLeft: 16 + (depth + 1) * 26 + 26 }}
    >
      <span className="opacity-60">└─</span>{' '}
      <Link to={`/agents/${parent.agent.id}`} className="hover:underline">
        {parent.agent.agentCode}
      </Link>{' '}
      earns{' '}
      <span className="font-medium text-gold-deep dark:text-gold">
        {formatPercent(rate)}
      </span>{' '}
      of every payment {child.agent.agentCode} collects
    </p>
  )
}

function countDescendants(n: Node): number {
  return n.children.reduce((a, k) => a + 1 + countDescendants(k), 0)
}

function Metric({
  label,
  value,
  sub,
  tone,
  strong,
}: {
  label: string
  value: Centavos
  sub?: string
  tone?: 'gold'
  strong?: boolean
}) {
  return (
    <div className="min-w-[104px]">
      <p className="text-micro uppercase tracking-[0.07em] text-muted">{label}</p>
      <MoneyText
        centavos={value}
        decimals={false}
        className={cn(
          'block text-caption',
          tone === 'gold' && 'text-gold-deep dark:text-gold',
          strong && 'font-semibold',
        )}
      />
      {sub && <p className="text-micro text-muted">{sub}</p>}
    </div>
  )
}
