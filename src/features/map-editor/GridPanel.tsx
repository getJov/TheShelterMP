import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Icon } from '@/components/ui-brand/Icon'
import { IconAutoFit, IconGrid, IconWarning } from '@/components/ui-brand/icons'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { isProtected, NUMBERING, type RegenMode } from '@/lib/grid-generator'
import { cn } from '@/lib/utils'
import { DangerLine, Field, NumberField, NumberingDiagram, PanelSection, Readout, WarnLine } from './bits'
import { useEditor } from './store'
import { useTiers } from './helpers'
import { computeFit, useGridPlan, LARGE_GENERATION } from './use-grid-plan'

const fmt = (n: number) => n.toLocaleString()
const fmtArea = (n: number) => `${Math.round(n).toLocaleString()} m²`

export function GridPanel() {
  const grid = useEditor((s) => s.grid)
  const setGrid = useEditor((s) => s.setGrid)
  const blocks = useEditor((s) => s.blocks)
  const lots = useEditor((s) => s.lots)
  const activeBlockId = useEditor((s) => s.activeBlockId)
  const generate = useEditor((s) => s.generate)
  const { tiers, byId } = useTiers()
  const planned = useGridPlan()

  const [modeOpen, setModeOpen] = useState(false)
  const [mode, setMode] = useState<RegenMode>('replace_unsold')

  const block = blocks.find((b) => b.id === activeBlockId)
  const existing = useMemo(
    () => lots.filter((l) => l.blockId === activeBlockId),
    [lots, activeBlockId],
  )
  const soldCount = existing.filter(isProtected).length
  const tier = grid.tierId ? byId.get(grid.tierId) : undefined

  if (!block) {
    return (
      <EmptyState
        compact
        icon={IconGrid}
        title="No block selected"
        body="Pick a block in the list, or draw one with the Block tool. The grid is generated inside a block's boundary."
      />
    )
  }

  const run = (m: RegenMode) => {
    if (!planned || !tier) return
    const result = generate(m, planned.plan, tier)
    setModeOpen(false)
    if (!result) return
    const bits = [`${grid.rows} × ${grid.cols} at ${tier.name}`]
    if (result.preserved > 0) {
      bits.push(
        `${result.preserved} existing lot${result.preserved === 1 ? '' : 's'} kept in place`,
      )
    }
    if (result.skipped > 0) bits.push(`${result.skipped} cells skipped around them`)
    if (result.removed > 0) bits.push(`${result.removed} unsold lots replaced`)
    toast.success(`${fmt(result.created)} lots laid out in ${block.code}`, {
      description: `${bits.join(' · ')}. Nothing is live until you publish.`,
    })
  }

  const onGenerate = () => {
    if (!planned || !tier) return
    if (planned.plan.cells.length > LARGE_GENERATION) {
      toast.warning(`${fmt(planned.plan.cells.length)} lots is a large generation`, {
        description: 'The canvas will redraw more slowly. Generate anyway from the dialog.',
      })
    }
    if (existing.length > 0) {
      setMode(soldCount > 0 ? 'replace_unsold' : 'replace_all')
      setModeOpen(true)
      return
    }
    run('replace_all')
  }

  const fitNow = () => {
    if (!tier) {
      toast.error('Pick a tier first — its footprint is what the fit is computed from.')
      return
    }
    const fit = computeFit(block, tier, grid)
    setGrid({ rows: fit.rows, cols: fit.cols })
    toast.success(`Fitted ${fit.rows} × ${fit.cols} into ${block.code}`, {
      description: `${fmt(fit.rows * fit.cols)} lots at ${tier.widthM} × ${tier.lengthM} m with a ${grid.gutterM} m gutter.`,
    })
  }

  const cells = planned?.plan.cells.length ?? 0
  const clipped = planned?.plan.clipped ?? 0

  return (
    <>
      <PanelSection title={`Grid — ${block.code}`}>
        <div className="space-y-3.5">
          <Field label="Tier" hint="The tier's width × length is the cell footprint.">
            <Select
              value={grid.tierId ?? ''}
              onValueChange={(v) => setGrid({ tierId: v as typeof grid.tierId })}
            >
              <SelectTrigger className="h-8 w-full text-[13px]">
                <SelectValue placeholder="Choose a tier" />
              </SelectTrigger>
              <SelectContent>
                {tiers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-[2px] border border-line"
                        style={{ background: t.appearance.fillColor }}
                      />
                      {t.name}
                      <span className="font-mono text-[10.5px] text-muted">
                        {t.widthM} × {t.lengthM} m
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Rows">
              <NumberField value={grid.rows} min={1} max={200} onChange={(rows) => setGrid({ rows })} />
            </Field>
            <Field label="Columns">
              <NumberField value={grid.cols} min={1} max={200} onChange={(cols) => setGrid({ cols })} />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="exact-lot-count" className="text-[11.5px] font-medium text-muted">
              Use exact lot count
            </Label>
            <Switch
              id="exact-lot-count"
              checked={grid.exactCount !== null}
              onCheckedChange={(checked) =>
                setGrid({ exactCount: checked ? Math.max(1, Math.round(grid.rows * grid.cols)) : null })
              }
            />
          </div>

          {grid.exactCount !== null && (
            <Field
              label="Exact count"
              hint="Rows and columns still shape the layout; the count caps how many available placeholders are created."
            >
              <NumberField
                value={grid.exactCount}
                min={1}
                max={Math.max(1, Math.round(grid.rows * grid.cols))}
                onChange={(exactCount) => setGrid({ exactCount })}
              />
            </Field>
          )}

          <Button variant="secondary" className="h-8 w-full gap-1.5 text-[12.5px]" onClick={fitNow}>
            <Icon icon={IconAutoFit} size={14} />
            Fit to block
          </Button>

          <Field label={`Gutter — ${grid.gutterM.toFixed(1)} m`}>
            <Slider
              value={[grid.gutterM]}
              min={0}
              max={3}
              step={0.1}
              onValueChange={([v]) => setGrid({ gutterM: v ?? 0 })}
            />
          </Field>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="split-gutters" className="text-[11.5px] font-medium text-muted">
              Different gutter by axis
            </Label>
            <Switch
              id="split-gutters"
              checked={grid.splitGutters}
              onCheckedChange={(splitGutters) => setGrid({ splitGutters })}
            />
          </div>

          {grid.splitGutters && (
            <Field
              label={`Row gutter — ${grid.rowGutterM.toFixed(1)} m`}
              hint="Paths between rows are usually wider than between columns."
            >
              <Slider
                value={[grid.rowGutterM]}
                min={0}
                max={3}
                step={0.1}
                onValueChange={([v]) => setGrid({ rowGutterM: v ?? 0 })}
              />
            </Field>
          )}

          <Field label="Rotation" hint="Inherited from the block; adjust for a grid sitting at an angle.">
            <NumberField
              value={grid.rotationDeg}
              min={-180}
              max={180}
              suffix="°"
              onChange={(rotationDeg) => setGrid({ rotationDeg })}
            />
          </Field>

          <Field label="Numbering">
            <RadioGroup
              value={grid.numbering}
              onValueChange={(v) => setGrid({ numbering: v as typeof grid.numbering })}
              className="gap-1.5"
            >
              {NUMBERING.map((n) => (
                <label
                  key={n.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
                    grid.numbering === n.id
                      ? 'border-gold bg-gold/8'
                      : 'border-line hover:bg-surface-2',
                  )}
                >
                  <RadioGroupItem value={n.id} className="shrink-0" />
                  <NumberingDiagram scheme={n.id} />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-ink">{n.label}</span>
                    <span className="block text-[10.5px] leading-snug text-muted">{n.hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </Field>

          <Field label="Start number">
            <NumberField
              value={grid.startNumber}
              min={1}
              max={99999}
              onChange={(startNumber) => setGrid({ startNumber })}
            />
          </Field>

          {planned && tier ? (
            <Readout>
              {grid.rows} × {grid.cols} = {fmt(cells)} lots · {tier.widthM.toFixed(2)} ×{' '}
              {tier.lengthM.toFixed(2)} m each · {grid.gutterM.toFixed(1)} m gutter ·{' '}
              {fmtArea(planned.plan.usedAreaSqm)} of {fmtArea(planned.plan.blockAreaSqm)} used
              {clipped > 0 && ` · ${clipped} clipped to the boundary`}
            </Readout>
          ) : (
            <p className="text-[11.5px] text-muted">Choose a tier to see the preview.</p>
          )}

          {cells > LARGE_GENERATION && (
            <WarnLine>
              {fmt(cells)} lots is above the {fmt(LARGE_GENERATION)} guideline. The canvas will
              redraw more slowly at this size.
            </WarnLine>
          )}

          <Button className="w-full gap-1.5" disabled={!planned || !tier} onClick={onGenerate}>
            <Icon icon={IconGrid} size={15} />
            Generate {cells > 0 ? `${fmt(cells)} lots` : 'lots'}
          </Button>

          {existing.length > 0 && (
            <p className="text-[11px] leading-snug text-muted">
              {block.code} already holds {fmt(existing.length)} lots
              {soldCount > 0 && `, ${soldCount} of them sold or occupied`}. You will be asked how
              to handle them.
            </p>
          )}
        </div>
      </PanelSection>

      <Dialog open={modeOpen} onOpenChange={setModeOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{block.code} already has lots</DialogTitle>
            <DialogDescription>
              {fmt(existing.length)} lots stand in this block. Choose what happens to them before{' '}
              {fmt(cells)} new lots are laid out.
            </DialogDescription>
          </DialogHeader>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as RegenMode)} className="gap-2">
            <ModeOption
              value="replace_unsold"
              current={mode}
              title="Replace unsold only"
              body={
                soldCount > 0
                  ? `The ${soldCount} sold or occupied lot${soldCount === 1 ? '' : 's'} stay exactly where they are, keeping their number, tier and capacity. The grid is laid around them.`
                  : 'Regenerates everything, but would preserve any sold lot in place. None here are sold.'
              }
            />
            <ModeOption
              value="append"
              current={mode}
              title="Add alongside"
              body="Keeps every existing lot, continues the numbering, and skips any cell that would land on one."
            />
            <ModeOption
              value="replace_all"
              current={mode}
              title="Replace all"
              disabled={soldCount > 0}
              body={
                soldCount > 0
                  ? `Blocked — ${soldCount} lot${soldCount === 1 ? ' is' : 's are'} sold or occupied and cannot be deleted.`
                  : 'Deletes all existing lots in this block and lays out a fresh grid.'
              }
            />
          </RadioGroup>

          {soldCount > 0 && mode === 'replace_unsold' && (
            <p className="flex items-start gap-1.5 text-[12px] leading-snug text-muted">
              <Icon icon={IconWarning} size={13} className="mt-px text-gold-deep dark:text-gold" />
              Sold history is never destroyed. Those lots keep their contract, their code and their
              exact position.
            </p>
          )}
          {soldCount > 0 && mode === 'replace_all' && (
            <DangerLine>Replace all is unavailable while sold or occupied lots exist here.</DangerLine>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setModeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={mode === 'replace_all' && soldCount > 0}
              onClick={() => run(mode)}
            >
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ModeOption({
  value,
  current,
  title,
  body,
  disabled,
}: {
  value: RegenMode
  current: RegenMode
  title: string
  body: string
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
        disabled && 'cursor-not-allowed opacity-55',
        current === value ? 'border-gold bg-gold/8' : 'border-line hover:bg-surface-2',
      )}
    >
      <RadioGroupItem value={value} disabled={disabled} className="mt-0.5 shrink-0" />
      <span>
        <span className="block text-[13.5px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted">{body}</span>
      </span>
    </label>
  )
}
