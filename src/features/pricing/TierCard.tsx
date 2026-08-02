import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ASSUMPTIONS,
  LOT_STATUSES,
  STATUS_APPEARANCE,
  type ISODate,
  type LotStatus,
  type Tier,
  type TierAppearance,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconAppearance,
  IconArchive,
  IconChevronRight,
  IconDragHandle,
  IconEdit,
  IconInventory,
  IconRuler,
  IconWarning,
} from '@/components/ui-brand/icons'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { StatusDot } from '@/components/ui-brand/StatusDot'
import { formatCount } from '@/lib/money'
import { useCurrentUser } from '@/lib/permissions'
import { PRICE_COMBINATIONS, usePricing } from '@/stores/pricing'
import { TierPreview } from './TierPreview'
import { checkFillAgainstBadges, FAMILY_HUES, isHexColor } from './contrast'
import { cn } from '@/lib/utils'

const PATTERNS: { value: TierAppearance['pattern']; label: string }[] = [
  { value: 'none', label: 'Plain' },
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'dots', label: 'Dots' },
  { value: 'cross', label: 'Cross' },
]

export function TierCard({
  tier,
  asOf,
  canManage,
  onEdit,
  onViewPrices,
  dragProps,
}: {
  tier: Tier
  asOf: ISODate
  canManage: boolean
  onEdit: () => void
  onViewPrices: () => void
  dragProps?: {
    onDragStart: () => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: () => void
    dragging: boolean
  }
}) {
  const user = useCurrentUser()
  const bookVersion = usePricing((s) => s.bookVersion)
  const priceAt = usePricing((s) => s.priceAt)
  const lotCountsForTier = usePricing((s) => s.lotCountsForTier)
  const updateTierAppearance = usePricing((s) => s.updateTierAppearance)
  const archiveTier = usePricing((s) => s.archiveTier)

  const [draft, setDraft] = useState<TierAppearance>(tier.appearance)
  const [previewStatus, setPreviewStatus] = useState<LotStatus>('available')
  const [editingAppearance, setEditingAppearance] = useState(false)

  const shown = editingAppearance ? draft : tier.appearance
  const dirty =
    editingAppearance &&
    JSON.stringify(draft) !== JSON.stringify(tier.appearance)

  const inventory = lotCountsForTier(tier.id)
  const warnings = useMemo(
    () => checkFillAgainstBadges(shown.fillColor),
    [shown.fillColor],
  )

  const prices = PRICE_COMBINATIONS.map((c) => ({
    ...c,
    resolved: priceAt(tier.id, c.needType, c.paymentMode, asOf),
  }))
  void bookVersion

  const areaSqm = tier.widthM * tier.lengthM

  function save() {
    if (!isHexColor(draft.fillColor) || !isHexColor(draft.strokeColor)) {
      toast.error('Fill and stroke must be hex colours, e.g. #cdd9c2.')
      return
    }
    updateTierAppearance(tier.id, draft, user.id)
    setEditingAppearance(false)
    toast.success(`${tier.name} appearance updated`, {
      description: 'The map picks this up on its next render — no reload needed.',
    })
  }

  function archive() {
    const ok = archiveTier(tier.id, user.id)
    if (ok) toast.success(`${tier.name} archived`)
  }

  return (
    <article
      draggable={!!dragProps && canManage}
      onDragStart={dragProps?.onDragStart}
      onDragOver={dragProps?.onDragOver}
      onDrop={dragProps?.onDrop}
      className={cn(
        'flex flex-col rounded-[var(--radius-card)] border border-line bg-surface transition-shadow',
        dragProps?.dragging && 'opacity-50 ring-1 ring-gold',
        !tier.active && 'opacity-60',
      )}
    >
      {/* ── header + preview ────────────────────────────────────── */}
      <header className="flex items-start gap-3 p-4">
        <div className="shrink-0">
          <TierPreview
            appearance={shown}
            widthM={tier.widthM}
            lengthM={tier.lengthM}
            status={previewStatus}
          />
          <div className="mt-1.5 flex items-center justify-center gap-1">
            {LOT_STATUSES.map((s) => (
              <Tooltip key={s}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setPreviewStatus(s)}
                    aria-label={`Preview ${STATUS_APPEARANCE[s].label} badge`}
                    className={cn(
                      'grid size-10 place-items-center rounded-full transition-opacity',
                      previewStatus === s
                        ? 'opacity-100 ring-1 ring-gold'
                        : 'opacity-45 hover:opacity-80',
                    )}
                  >
                    <StatusDot status={s} size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{STATUS_APPEARANCE[s].label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-small-title font-semibold leading-tight text-ink">
                {tier.name}
              </h3>
              <p className="mt-0.5 flex items-center gap-2">
                <span className="font-mono text-micro uppercase tracking-wide text-muted">
                  {tier.code}
                </span>
                <Badge variant="outline" className="text-micro capitalize">
                  {tier.category.replace('_', ' ')}
                </Badge>
                {!tier.active && (
                  <Badge variant="outline" className="text-micro text-muted">
                    Archived
                  </Badge>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {canManage && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 text-muted"
                        onClick={onEdit}
                        aria-label="Edit tier"
                      >
                        <Icon icon={IconEdit} size={15} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit identity & dimensions</TooltipContent>
                  </Tooltip>
                  {dragProps && (
                    <span className="cursor-grab p-1 text-muted" aria-hidden>
                      <Icon icon={IconDragHandle} size={15} />
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-caption leading-relaxed text-muted">
            {tier.description}
          </p>
        </div>
      </header>

      <Separator />

      {/* ── physical ────────────────────────────────────────────── */}
      <section className="px-4 py-3">
        <p className="eyebrow mb-2 flex items-center gap-1.5 text-muted">
          <Icon icon={IconRuler} size={13} />
          Physical
          {tier.category === 'mausoleum' && (
            <AssumedChip why={ASSUMPTIONS.mausoleumDimensions.why} />
          )}
        </p>
        <dl className="grid grid-cols-4 gap-2 text-caption">
          <Cell label="Width" value={`${tier.widthM.toFixed(2)} m`} />
          <Cell label="Length" value={`${tier.lengthM.toFixed(2)} m`} />
          <Cell label="Area" value={`${areaSqm.toFixed(2)} m²`} />
          <Cell label="Capacity" value={`${tier.capacity}`} />
        </dl>
        <p className="mt-2 text-caption leading-relaxed text-muted">
          Changing dimensions affects newly generated lots only. Existing lots
          keep their recorded capacity.
        </p>
      </section>

      <Separator />

      {/* ── pricing ─────────────────────────────────────────────── */}
      <section className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow text-muted">Current prices</p>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 px-1.5 text-control text-gold-deep dark:text-gold"
            onClick={onViewPrices}
          >
            Price book
            <Icon icon={IconChevronRight} size={12} />
          </Button>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          {prices.map((p) => (
            <div
              key={p.key}
              className="rounded-md border border-line bg-surface-2 px-2 py-1.5"
            >
              <dt className="text-micro leading-tight text-muted">
                {p.group}
                <br />
                {p.label}
              </dt>
              <dd className="mt-0.5">
                {p.resolved.amountCentavos === null ? (
                  <span className="text-caption italic text-muted">Contact</span>
                ) : (
                  <MoneyText
                    centavos={p.resolved.amountCentavos}
                    compact
                    className={cn(
                      'text-caption font-medium',
                      p.resolved.isPromo && 'text-gold-deep dark:text-gold',
                    )}
                  />
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <Separator />

      {/* ── inventory ───────────────────────────────────────────── */}
      <section className="px-4 py-3">
        <p className="eyebrow mb-2 flex items-center gap-1.5 text-muted">
          <Icon icon={IconInventory} size={13} />
          Inventory · {formatCount(inventory.total)} lots
        </p>
        {inventory.total === 0 ? (
          <p className="text-caption text-muted">No lots use this tier yet.</p>
        ) : (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
              {LOT_STATUSES.map((s) => {
                const n = inventory.byStatus[s]
                if (n === 0) return null
                return (
                  <Tooltip key={s}>
                    <TooltipTrigger asChild>
                      <span
                        style={{
                          width: `${(n / inventory.total) * 100}%`,
                          background: STATUS_APPEARANCE[s].color,
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {STATUS_APPEARANCE[s].label} · {formatCount(n)}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted">
              {LOT_STATUSES.filter((s) => inventory.byStatus[s] > 0).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <StatusDot status={s} size={11} withLetter={false} />
                  {STATUS_APPEARANCE[s].label}
                  <span className="tabular text-ink">
                    {formatCount(inventory.byStatus[s])}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Separator />

      {/* ── appearance ──────────────────────────────────────────── */}
      <section className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow flex items-center gap-1.5 text-muted">
            <Icon icon={IconAppearance} size={13} />
            Appearance
          </p>
          {canManage && !editingAppearance && (
            <Button
              variant="ghost"
              size="sm"
              className="px-1.5 text-control"
              onClick={() => {
                setDraft(tier.appearance)
                setEditingAppearance(true)
              }}
            >
              Edit
            </Button>
          )}
        </div>

        {!editingAppearance ? (
          <dl className="grid grid-cols-4 gap-2 text-caption">
            <Cell label="Fill" value={tier.appearance.fillColor} mono />
            <Cell label="Stroke" value={tier.appearance.strokeColor} mono />
            <Cell label="Pattern" value={tier.appearance.pattern} />
            <Cell label="Label" value={tier.appearance.shortLabel} mono />
          </dl>
        ) : (
          <div className="space-y-3">
            <ColorRow
              label="Fill colour"
              value={draft.fillColor}
              palette={FAMILY_HUES[tier.category] ?? FAMILY_HUES.lawn!}
              onChange={(v) => setDraft((d) => ({ ...d, fillColor: v }))}
            />
            <ColorRow
              label="Stroke colour"
              value={draft.strokeColor}
              palette={FAMILY_HUES[tier.category] ?? FAMILY_HUES.lawn!}
              onChange={(v) => setDraft((d) => ({ ...d, strokeColor: v }))}
            />

            <div>
              <Label className="eyebrow mb-1.5 flex items-center justify-between text-muted">
                <span>Stroke width</span>
                <span className="tabular text-ink">{draft.strokeWidth.toFixed(1)}</span>
              </Label>
              <Slider
                value={[draft.strokeWidth]}
                min={0.2}
                max={3}
                step={0.1}
                onValueChange={([v]) =>
                  setDraft((d) => ({ ...d, strokeWidth: v ?? d.strokeWidth }))
                }
              />
            </div>

            <div>
              <Label className="eyebrow mb-1.5 block text-muted">Pattern</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={draft.pattern}
                onValueChange={(v) =>
                  v && setDraft((d) => ({ ...d, pattern: v as TierAppearance['pattern'] }))
                }
                className="w-full"
              >
                {PATTERNS.map((p) => (
                  <ToggleGroupItem key={p.value} value={p.value} className="flex-1">
                    {p.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div>
              <Label className="eyebrow mb-1.5 block text-muted">Short label</Label>
              <Input
                value={draft.shortLabel}
                maxLength={4}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, shortLabel: e.target.value.toUpperCase() }))
                }
                className="w-28 font-mono uppercase"
              />
            </div>
          </div>
        )}

        <ContrastGuard warnings={warnings} />

        {editingAppearance && (
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(tier.appearance)
                setEditingAppearance(false)
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty}>
              Save appearance
            </Button>
          </div>
        )}
      </section>

      {/* ── archive ─────────────────────────────────────────────── */}
      {canManage && tier.active && (
        <>
          <Separator />
          <footer className="px-4 py-3">
            {inventory.total > 0 ? (
              <p className="flex items-start gap-2 text-caption leading-relaxed text-muted">
                <Icon icon={IconArchive} size={14} className="mt-0.5 shrink-0" />
                <span>
                  Cannot be archived —{' '}
                  <b className="text-ink">{formatCount(inventory.total)} lots</b> are
                  still on this tier. Move them to another tier first.
                </span>
              </p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-danger"
                onClick={archive}
              >
                <Icon icon={IconArchive} size={14} />
                Archive tier
              </Button>
            )}
          </footer>
        </>
      )}
    </article>
  )
}

export function ContrastGuard({
  warnings,
}: {
  warnings: ReturnType<typeof checkFillAgainstBadges>
}) {
  if (warnings.length === 0) return null
  return (
    <div className="mt-3 flex gap-2 rounded-md border border-danger/50 bg-danger/8 p-2.5">
      <Icon icon={IconWarning} size={15} className="mt-0.5 shrink-0 text-danger" />
      <div className="text-caption leading-relaxed">
        <p className="font-medium text-ink">
          This fill hides {warnings.length === 1 ? 'a status badge' : 'status badges'}
        </p>
        <p className="mt-0.5 text-muted">
          The badge sits directly on the fill, so{' '}
          {warnings.map((w, i) => (
            <span key={w.status}>
              {i > 0 && (i === warnings.length - 1 ? ' and ' : ', ')}
              <b className="text-ink">{w.label}</b>
            </span>
          ))}{' '}
          will be hard to pick out on the map. Choose a fill further from{' '}
          {warnings.length === 1 ? 'that badge colour' : 'those badge colours'}.
        </p>
      </div>
    </div>
  )
}

function Cell({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-2 py-1.5">
      <dt className="text-micro text-muted">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 text-caption capitalize text-ink',
          mono && 'font-mono text-caption normal-case',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function ColorRow({
  label,
  value,
  palette,
  onChange,
}: {
  label: string
  value: string
  palette: string[]
  onChange: (v: string) => void
}) {
  return (
    <div>
      <Label className="eyebrow mb-1.5 block text-muted">{label}</Label>
      <div className="flex items-center gap-2">
        <span
          className="size-8 shrink-0 rounded-md border border-line"
          style={{ background: isHexColor(value) ? value : undefined }}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 font-mono text-caption"
          spellCheck={false}
        />
        <div className="flex flex-wrap gap-1">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-label={`Use ${c}`}
              className={cn(
                'size-10 rounded border transition-transform hover:scale-105',
                value.toLowerCase() === c.toLowerCase()
                  ? 'border-gold ring-1 ring-gold'
                  : 'border-line',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
