import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ASSUMPTIONS,
  COMMISSION_LEVELS,
  TOTAL_COMMISSION_PERCENT,
  type CommissionLevel,
  type ISODate,
} from '@/domain'
import { dataset } from '@/stores/dataset'
import { activeRules, ruleHistory, useAgents } from '@/stores/agents'
import { useCan, useCurrentUser } from '@/lib/permissions'
import { TODAY } from '@/mock'
import { fmtDate } from '@/lib/dates'
import { formatPeso, formatPercent } from '@/lib/money'
import { monthBounds } from '@/lib/finance'
import { addDays } from '@/lib/dates'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconCommission,
  IconInfo,
} from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { DateField, useDatasetVersion } from './shared'

interface Draft {
  level: CommissionLevel
  label: string
  rate: string
}

export function CommissionRulesPage() {
  const version = useDatasetVersion()
  const user = useCurrentUser()
  const canManage = useCan('commission:manage_rules')
  const setCommissionRule = useAgents((s) => s.setCommissionRule)

  const current = useMemo(() => {
    void version
    return activeRules()
  }, [version])

  const [draft, setDraft] = useState<Draft[]>(() =>
    COMMISSION_LEVELS.map((level) => {
      const r = activeRules().find((x) => x.level === level)
      return {
        level,
        label: r?.label ?? ASSUMPTIONS.commissionLevelNames.value[level],
        rate: String(r?.ratePercent ?? ASSUMPTIONS.commissionRates.value[level]),
      }
    }),
  )
  const [effectiveFrom, setEffectiveFrom] = useState<ISODate>(addDays(TODAY, 1))

  const rateOfDraft = (d: Draft) => {
    const n = Number(d.rate)
    return Number.isFinite(n) ? n : 0
  }
  const total = draft.reduce((s, d) => s + rateOfDraft(d), 0)
  const onTwelve = Math.abs(total - TOTAL_COMMISSION_PERCENT) < 0.001

  const dirty = draft.some((d) => {
    const r = current.find((x) => x.level === d.level)
    return !r || r.label !== d.label || r.ratePercent !== rateOfDraft(d)
  })

  // ── impact preview ──────────────────────────────────────────────
  const impact = useMemo(() => {
    void version
    const [from, to] = monthBounds(TODAY)
    let actual = 0
    let hypothetical = 0
    for (const e of dataset().commissions) {
      const d = e.earnedAt.slice(0, 10)
      if (d < from || d > to) continue
      if (e.status === 'voided') continue
      actual += e.amountCentavos
      const dr = draft.find((x) => x.level === e.level)
      hypothetical += Math.round((e.basisCentavos * (dr ? rateOfDraft(dr) : 0)) / 100)
    }
    return { actual, hypothetical, from, to }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, draft])

  const history = useMemo(() => {
    void version
    return ruleHistory()
  }, [version])

  const save = () => {
    for (const d of draft) {
      const r = current.find((x) => x.level === d.level)
      if (r && r.label === d.label && r.ratePercent === rateOfDraft(d)) continue
      setCommissionRule(d.level, rateOfDraft(d), d.label, effectiveFrom, user.id)
    }
    toast.success('Commission structure updated', {
      description: `Effective ${fmtDate(effectiveFrom)}. Existing entries keep the rate in force when they were earned.`,
    })
  }

  const reset = () =>
    setDraft(
      COMMISSION_LEVELS.map((level) => {
        const r = activeRules().find((x) => x.level === level)
        return {
          level,
          label: r?.label ?? ASSUMPTIONS.commissionLevelNames.value[level],
          rate: String(r?.ratePercent ?? 0),
        }
      }),
    )

  if (!canManage) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <EmptyState
          icon={IconCommission}
          title="Commission rules are administrator-only"
          body="You can see the rates in force on every commission screen, but editing them requires the commission:manage_rules permission."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/agents">Back to agents</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] space-y-5 px-6 py-6">
        <div>
          <Link
            to="/agents"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"
          >
            <Icon icon={IconChevronLeft} size={14} /> Agents
          </Link>
          <h2 className="mt-1.5 font-display text-[28px] font-semibold text-ink">
            Commission structure
          </h2>
          <p className="mt-0.5 max-w-[74ch] text-[13.5px] text-muted">
            The client confirmed twelve percent split three ways. Which level gets
            which slice, and what each level is called, are ours until they say
            otherwise — so both are editable here.
          </p>
        </div>

        {/* ── editor ─────────────────────────────────────────── */}
        <section className="rounded-[var(--radius-card)] border border-line bg-surface">
          <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
            <Icon icon={IconCommission} size={15} className="text-gold-deep dark:text-gold" />
            <p className="eyebrow text-gold-deep dark:text-gold">Levels &amp; rates</p>
            <TotalIndicator total={total} onTwelve={onTwelve} />
          </header>

          <div className="divide-y divide-line-soft">
            <div className="hidden gap-3 px-4 py-2 text-[10.5px] uppercase tracking-[0.08em] text-muted sm:grid sm:grid-cols-[130px_1fr_120px_auto]">
              <span>Level</span>
              <span>Label</span>
              <span className="text-right">Rate</span>
              <span />
            </div>

            {draft.map((d) => (
              <div
                key={d.level}
                className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[130px_1fr_120px_auto]"
              >
                <span className="font-mono text-[12px] text-muted">{d.level}</span>
                <Input
                  value={d.label}
                  aria-label={`${d.level} label`}
                  onChange={(e) =>
                    setDraft((s) =>
                      s.map((x) =>
                        x.level === d.level ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                  className="h-9 text-[13.5px]"
                />
                <div className="relative">
                  <Input
                    value={d.rate}
                    inputMode="decimal"
                    aria-label={`${d.level} rate percent`}
                    onChange={(e) =>
                      setDraft((s) =>
                        s.map((x) =>
                          x.level === d.level
                            ? { ...x, rate: e.target.value.replace(/[^\d.]/g, '') }
                            : x,
                        ),
                      )
                    }
                    className="h-9 pr-7 text-right tabular text-[13.5px]"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12.5px] text-muted">
                    %
                  </span>
                </div>
                <AssumedChip why={ASSUMPTIONS.commissionRates.why} />
              </div>
            ))}

            <div className="grid gap-3 px-4 py-3 sm:grid-cols-[130px_1fr_120px_auto]">
              <span />
              <span className="text-[13px] text-muted">Total</span>
              <span
                className={cn(
                  'text-right font-display text-[19px] font-semibold tabular',
                  onTwelve ? 'text-green' : 'text-gold-deep dark:text-gold',
                )}
              >
                {total.toFixed(1)}%
              </span>
              <span />
            </div>
          </div>

          <footer className="space-y-3 border-t border-line bg-surface-2 px-4 py-3.5">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label className="mb-1.5 block text-[12px] text-muted">
                  Effective from
                </Label>
                <DateField value={effectiveFrom} onChange={setEffectiveFrom} />
              </div>
              <p className="flex-1 min-w-[280px] text-[12px] leading-relaxed text-muted">
                <Icon icon={IconInfo} size={13} className="mr-1 inline align-[-2px]" />
                Existing commission entries keep the rate in force when they were
                earned. Saving appends a new generation and closes the old one —
                nothing is edited in place, so history is never restated.
              </p>
            </div>

            <ImpactPreview
              actual={impact.actual}
              hypothetical={impact.hypothetical}
              dirty={dirty}
            />

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={!dirty}>
                Save new generation
              </Button>
              <Button size="sm" variant="ghost" onClick={reset} disabled={!dirty}>
                Reset
              </Button>
              {!onTwelve && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] text-gold-deep dark:text-gold">
                  <Icon icon={IconAlert} size={14} />
                  Saving is still allowed — the client may confirm figures that do
                  not sum to twelve.
                </span>
              )}
            </div>
          </footer>
        </section>

        {/* ── history ────────────────────────────────────────── */}
        <section className="rounded-[var(--radius-card)] border border-line bg-surface">
          <header className="border-b border-line bg-surface-2 px-4 py-2.5">
            <p className="eyebrow text-gold-deep dark:text-gold">Rate generations</p>
          </header>
          <ul className="divide-y divide-line-soft">
            {history.map((r) => {
              const live = r.effectiveTo === null && r.effectiveFrom <= TODAY
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]"
                >
                  <span className="w-[150px] font-mono text-[11.5px] text-muted">
                    {r.level}
                  </span>
                  <span className="min-w-[150px] flex-1 text-ink">{r.label}</span>
                  <span className="tabular text-ink">{formatPercent(r.ratePercent)}</span>
                  <span className="w-[210px] text-right text-[12px] text-muted">
                    {fmtDate(r.effectiveFrom)} →{' '}
                    {r.effectiveTo ? fmtDate(r.effectiveTo) : 'present'}
                  </span>
                  <span className="w-[70px] text-right">
                    {live ? (
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-green">
                        <Icon icon={IconCheck} size={12} /> Live
                      </span>
                    ) : r.effectiveFrom > TODAY ? (
                      <span className="text-[11.5px] text-gold-deep dark:text-gold">
                        Pending
                      </span>
                    ) : (
                      <span className="text-[11.5px] text-muted">Closed</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}

function TotalIndicator({ total, onTwelve }: { total: number; onTwelve: boolean }) {
  return (
    <motion.span
      key={onTwelve ? 'ok' : 'warn'}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px] font-medium tabular',
        onTwelve
          ? 'border-green/45 bg-green/12 text-green'
          : 'border-gold/55 bg-gold/15 text-gold-deep dark:text-gold',
      )}
    >
      <Icon icon={onTwelve ? IconCheck : IconAlert} size={14} />
      Total {total.toFixed(1)}%
      {!onTwelve && (
        <span className="opacity-80">
          ({total > TOTAL_COMMISSION_PERCENT ? '+' : '−'}
          {Math.abs(total - TOTAL_COMMISSION_PERCENT).toFixed(1)} vs 12.0%)
        </span>
      )}
    </motion.span>
  )
}

function ImpactPreview({
  actual,
  hypothetical,
  dirty,
}: {
  actual: number
  hypothetical: number
  dirty: boolean
}) {
  if (!dirty) {
    return (
      <p className="text-[12.5px] text-muted">
        This month&rsquo;s accrued commission stands at{' '}
        <span className="font-medium text-ink">
          {formatPeso(actual, { decimals: false })}
        </span>
        . Change a rate to preview the impact.
      </p>
    )
  }
  const delta = hypothetical - actual
  return (
    <p className="text-[12.5px] text-muted">
      Impact —{' '}
      <span className="text-ink">
        this month&rsquo;s accrued commission would have been{' '}
        <span className="font-semibold">
          {formatPeso(hypothetical, { decimals: false })}
        </span>{' '}
        instead of{' '}
        <span className="font-semibold">{formatPeso(actual, { decimals: false })}</span>
      </span>
      <span
        className={cn(
          'ml-1.5 font-medium',
          delta > 0 ? 'text-danger' : delta < 0 ? 'text-green' : 'text-muted',
        )}
      >
        ({formatPeso(delta, { decimals: false, sign: true })})
      </span>
      . Existing entries are not restated — this is what the new rates would
      produce on the same collections.
    </p>
  )
}
