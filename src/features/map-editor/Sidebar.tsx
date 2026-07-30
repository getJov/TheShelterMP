import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Block, BlockId, LotStatus, TierId } from '@/domain'
import { LOT_STATUSES } from '@/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconBlock,
  IconChevronDown,
  IconChevronRight,
  IconDelete,
  IconDrawBlock,
  IconEdit,
  IconFitBounds,
  IconGrid,
  IconLayers,
  IconMap,
  IconMore,
  IconOverlay,
  IconPen,
  IconRepair,
  IconRuler,
  IconSatellite,
  IconSelect,
  IconSettings,
} from '@/components/ui-brand/icons'
import { useMapStore } from '@/stores/map'
import { spatialIndex } from '@/lib/grid-generator'
import { cn } from '@/lib/utils'
import { DangerLine, Field, PanelSection, Readout, WarnLine } from './bits'
import { useEditor, lotsOfBlock, type Tool } from './store'
import { STATUS_LABEL, tierMix, useLayoutValidation, useChangeReport, useTiers } from './helpers'
import { conflictSummary } from './geometry-validation'
import { AlignLayoutPanel } from './AlignLayoutPanel'
import { BlockPanel } from './BlockPanel'
import { EditBlockPanel } from './EditBlockPanel'
import { GuidedWorkflowPanel } from './GuidedWorkflowPanel'
import { GridPanel } from './GridPanel'
import { OverlayPanel } from './OverlayPanel'
import type { CanvasHandle } from './EditorCanvas'

const TOOLS: { id: Tool; label: string; key: string; icon: typeof IconSelect; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: IconSelect, hint: 'Click, rubber-band, lasso' },
  { id: 'editBlock', label: 'Edit block', key: 'E', icon: IconEdit, hint: 'Move, resize, rotate' },
  { id: 'block', label: 'Block', key: 'B', icon: IconDrawBlock, hint: 'Drag out a boundary' },
  { id: 'grid', label: 'Grid', key: 'G', icon: IconGrid, hint: 'Generate lots inside a block' },
  { id: 'draw', label: 'Draw lot', key: 'D', icon: IconPen, hint: 'Free-hand, for irregular edges' },
  { id: 'overlay', label: 'Overlay', key: 'O', icon: IconOverlay, hint: 'Place a site plan' },
]

export function Sidebar({ canvas }: { canvas: CanvasHandle | null }) {
  const editorMode = useEditor((s) => s.editorMode)
  const layerMode = useEditor((s) => s.layerMode)
  const tool = useEditor((s) => s.tool)
  const alignmentTarget = useEditor((s) => s.alignmentTarget)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const showOverlayPanel = layerMode === 'sitePlan' || (editorMode === 'align' && alignmentTarget === 'overlay')
  const showAlignmentPanel =
    editorMode === 'align' &&
    layerMode !== 'baseMap' &&
    layerMode !== 'review' &&
    layerMode !== 'tiers'

  return (
    <aside className="flex h-full w-[318px] shrink-0 flex-col border-r border-line bg-surface">
      <GuidedWorkflowPanel />

      <ScrollArea className="min-h-0 flex-1">
        {layerMode === 'baseMap' && <BaseMapPanel canvas={canvas} />}
        {layerMode === 'sitePlan' && (
          <>
            <StepBrief
              title="Place the site plan"
              body="Use the plan as a transparent guide over the map. Lock it once it lines up."
            />
            {showOverlayPanel && <OverlayPanel canvas={canvas} />}
            {showAlignmentPanel && <AlignLayoutPanel showTargetPicker={false} />}
          </>
        )}
        {layerMode === 'blocks' && (
          <>
            <StepBrief
              title="Adjust one block at a time"
              body="Choose a block, then move, resize, rotate, or rearrange its lot layout."
            />
            <BlockChooserPanel canvas={canvas} />
            {showAlignmentPanel && <AlignLayoutPanel showTargetPicker={false} />}
            <BlockLayerPanel />
            {tool === 'block' && <BlockPanel />}
            {tool === 'editBlock' && <EditBlockPanel />}
            {tool === 'grid' && <GridPanel />}
          </>
        )}
        {layerMode === 'lots' && (
          <>
            <StepBrief
              title="Arrange lots inside the block"
              body="Click a lot to select it, use Select by for groups, then drag selected lots into place."
            />
            <BlockChooserPanel canvas={canvas} />
            <LotLayerPanel />
            <SelectionPanel />
            {showAlignmentPanel && <AlignLayoutPanel showTargetPicker={false} />}
            {tool === 'draw' && <DrawPanel />}
          </>
        )}
        {layerMode === 'tiers' && (
          <>
            <StepBrief
              title="Assign lot tiers"
              body="Choose a tier, then click lots on the map or apply it to the current selection."
            />
            <BlockChooserPanel canvas={canvas} />
            <TierPaintPanel />
            <SelectionPanel />
          </>
        )}
        {layerMode === 'review' && <ReviewPanel />}

        <AdvancedEditorPanel
          canvas={canvas}
          tool={tool}
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
        />
      </ScrollArea>
    </aside>
  )
}

function AdvancedToolPanel({ tool }: { tool: Tool }) {
  const setTool = useEditor((s) => s.setTool)

  return (
    <PanelSection title="Advanced Inventory">
      <ToggleGroup
        type="single"
        value={tool}
        onValueChange={(v) => v && setTool(v as Tool)}
        className="w-full justify-start gap-1"
      >
        {TOOLS.map((t) => (
          <Tooltip key={t.id}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={t.id}
                aria-label={t.label}
                className="size-10 rounded-md border border-line data-[state=on]:border-gold data-[state=on]:bg-gold/12 data-[state=on]:text-gold-deep dark:data-[state=on]:text-gold"
              >
                <Icon icon={t.icon} size={17} />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[12px]">
              <span className="font-medium">{t.label}</span>
              <span className="ml-1.5 font-mono text-[10.5px] opacity-70">{t.key}</span>
              <span className="mt-0.5 block opacity-80">{t.hint}</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </PanelSection>
  )
}

function StepBrief({ title, body }: { title: string; body: string }) {
  return (
    <section className="border-b border-line px-3.5 py-3.5">
      <p className="text-[13px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">{body}</p>
    </section>
  )
}

function AdvancedEditorPanel({
  canvas,
  tool,
  open,
  onOpenChange,
}: {
  canvas: CanvasHandle | null
  tool: Tool
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <section className="border-b border-line px-3.5 py-3.5 last:border-b-0">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            className="h-8 w-full justify-between gap-2 text-[12.5px]"
          >
            <span className="flex items-center gap-1.5">
              <Icon icon={IconSettings} size={14} />
              Advanced tools
            </span>
            <Icon icon={open ? IconChevronDown : IconChevronRight} size={14} />
          </Button>
        </CollapsibleTrigger>
        <p className="mt-2 text-[11.5px] leading-snug text-muted">
          Visibility switches, full block actions, and old inventory tools stay here for power
          users.
        </p>
      </section>
      <CollapsibleContent>
        <AdvancedToolPanel tool={tool} />
        <LayersPanel />
        <BlocksPanel canvas={canvas} />
      </CollapsibleContent>
    </Collapsible>
  )
}

function BlockChooserPanel({ canvas }: { canvas: CanvasHandle | null }) {
  const blocks = useEditor((s) => s.blocks)
  const lots = useEditor((s) => s.lots)
  const activeBlockId = useEditor((s) => s.activeBlockId)
  const setActiveBlock = useEditor((s) => s.setActiveBlock)

  return (
    <PanelSection title="Choose block">
      {blocks.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-muted">
          No blocks yet. Go to Blocks and draw the first cemetery section.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5">
          {blocks.map((block) => {
            const count = lots.filter((lot) => lot.blockId === block.id).length
            const active = block.id === activeBlockId
            return (
              <button
                key={block.id}
                type="button"
                onClick={() => {
                  setActiveBlock(block.id)
                  canvas?.zoomToBlock(block.id)
                }}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
                  active ? 'border-gold bg-gold/8' : 'border-line hover:bg-surface-2',
                )}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[12.5px] font-semibold text-ink">
                    {block.code}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted">
                    {block.name ?? 'Unnamed block'}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-muted tabular">
                  {count.toLocaleString()} lots
                </span>
              </button>
            )
          })}
        </div>
      )}
    </PanelSection>
  )
}

function BaseMapPanel({ canvas }: { canvas: CanvasHandle | null }) {
  const baseLayer = useMapStore((s) => s.baseLayer)
  const setBaseLayer = useMapStore((s) => s.setBaseLayer)

  return (
    <PanelSection title="Base Map">
      <div className="space-y-3">
        <Readout>
          View only · pan and zoom the map underneath the cemetery layout. Reset north does not
          change cemetery geometry.
        </Readout>
        <ToggleGroup
          type="single"
          value={baseLayer}
          onValueChange={(value) => value && setBaseLayer(value as typeof baseLayer)}
          className="grid grid-cols-2 gap-2"
        >
          <ToggleGroupItem
            value="satellite"
            aria-label="Satellite base"
            className="h-10 justify-start gap-2 rounded-md border border-line px-2.5 data-[state=on]:border-gold data-[state=on]:bg-gold/12 data-[state=on]:text-gold-deep dark:data-[state=on]:text-gold"
          >
            <Icon icon={IconSatellite} size={15} />
            <span className="text-[12px]">Satellite</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="plain"
            aria-label="Default base"
            className="h-10 justify-start gap-2 rounded-md border border-line px-2.5 data-[state=on]:border-gold data-[state=on]:bg-gold/12 data-[state=on]:text-gold-deep dark:data-[state=on]:text-gold"
          >
            <Icon icon={IconMap} size={15} />
            <span className="text-[12px]">Default</span>
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="secondary"
          className="h-8 w-full gap-1.5 text-[12px]"
          onClick={() => canvas?.fit()}
        >
          <Icon icon={IconFitBounds} size={14} />
          Reset north and fit layout
        </Button>
      </div>
    </PanelSection>
  )
}

function TierPaintPanel() {
  const selection = useEditor((s) => s.selection)
  const tierPaintTierId = useEditor((s) => s.tierPaintTierId)
  const setTierPaintTier = useEditor((s) => s.setTierPaintTier)
  const changeTier = useEditor((s) => s.changeTier)
  const syncTierFootprints = useEditor((s) => s.syncTierFootprints)
  const { tiers, byId } = useTiers()
  const validation = useLayoutValidation()
  const ids = useMemo(() => [...selection], [selection])
  const paintTier = tierPaintTierId ? byId.get(tierPaintTierId) : undefined

  return (
    <PanelSection title="Tier Paint">
      <div className="space-y-3">
        <Field label="Paint tier" hint="Click a lot on the map to assign this tier and resize its footprint.">
          <Select
            value={tierPaintTierId ?? ''}
            onValueChange={(value) => setTierPaintTier(value ? (value as TierId) : null)}
          >
            <SelectTrigger className="h-9 w-full text-[13px]">
              <SelectValue placeholder="Choose tier to paint" />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((tier) => (
                <SelectItem key={tier.id} value={tier.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-[2px] border border-line"
                      style={{ background: tier.appearance.fillColor }}
                    />
                    {tier.name}
                    <span className="font-mono text-[10.5px] text-muted">
                      {tier.widthM.toFixed(2)} x {tier.lengthM.toFixed(2)} m
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="h-8 text-[12px]"
            disabled={!paintTier || ids.length === 0}
            onClick={() => {
              if (!paintTier) return
              changeTier(ids, paintTier)
              toast.success(`${ids.length.toLocaleString()} lots changed to ${paintTier.name}`, {
                description: 'Tier size was applied to the selected lot geometry.',
              })
            }}
          >
            Apply to selected
          </Button>
          <Button
            variant="secondary"
            className="h-8 text-[12px]"
            disabled={validation.tierMismatchLotIds.size === 0}
            onClick={() => {
              const changed = syncTierFootprints([...validation.tierMismatchLotIds], byId)
              toast.success(`${changed.length.toLocaleString()} lot footprints synced`, {
                description: 'Publish is still blocked if the sync created overlaps or outside-block conflicts.',
              })
            }}
          >
            Match tier sizes
          </Button>
        </div>

        {paintTier ? (
          <Readout>
            Painting {paintTier.name} · {paintTier.widthM.toFixed(2)} x{' '}
            {paintTier.lengthM.toFixed(2)} m
          </Readout>
        ) : (
          <WarnLine>Choose a tier before painting lots on the map.</WarnLine>
        )}
      </div>
    </PanelSection>
  )
}

function BlockLayerPanel() {
  const setTool = useEditor((s) => s.setTool)
  const activeBlockId = useEditor((s) => s.activeBlockId)

  return (
    <PanelSection title="Block Actions">
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          className="h-8 gap-1.5 text-[12px]"
          onClick={() => setTool('block')}
        >
          <Icon icon={IconDrawBlock} size={14} />
          Draw block
        </Button>
        <Button
          variant="secondary"
          className="h-8 gap-1.5 text-[12px]"
          disabled={!activeBlockId}
          onClick={() => setTool('grid')}
        >
          <Icon icon={IconGrid} size={14} />
          Lot layout
        </Button>
      </div>
    </PanelSection>
  )
}

function LotLayerPanel() {
  const setLayerMode = useEditor((s) => s.setLayerMode)
  const selection = useEditor((s) => s.selection)

  return (
    <PanelSection title="Lot Actions">
      <div className="space-y-2">
        <Readout>
          Click a lot to select it. Use Select by for rows, columns, whole blocks, tiers, or
          statuses. Drag selected lots on the map to move them.
        </Readout>
        <Button
          variant="secondary"
          className="h-8 w-full gap-1.5 text-[12px]"
          onClick={() => setLayerMode('tiers')}
        >
          <Icon icon={IconRuler} size={14} />
          Paint tiers
        </Button>
        {selection.size > 0 && (
          <p className="text-[11.5px] text-muted">
            {selection.size.toLocaleString()} selected. Go to Tiers to apply lot types.
          </p>
        )}
      </div>
    </PanelSection>
  )
}

function ReviewPanel() {
  const validation = useLayoutValidation()
  const report = useChangeReport()
  const setSelection = useEditor((s) => s.setSelection)
  const summary = conflictSummary(validation)

  return (
    <PanelSection title="Review">
      <div className="space-y-3">
        {validation.canPublish ? (
          <Readout>
            No geometry blockers · {report.total.toLocaleString()} staged change
            {report.total === 1 ? '' : 's'} ready for publish review.
          </Readout>
        ) : (
          <>
            <DangerLine>
              Publish is blocked by {validation.blockingCount.toLocaleString()} layout issue
              {validation.blockingCount === 1 ? '' : 's'}.
            </DangerLine>
            <ul className="space-y-1">
              {summary.map((line) => (
                <li key={line} className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12px] text-muted">
                  {line}
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              className="h-8 w-full text-[12px]"
              onClick={() => setSelection(validation.conflictingLotIds)}
            >
              Select lots with issues
            </Button>
          </>
        )}
        {report.soldTouched > 0 && (
          <WarnLine>
            {report.soldTouched.toLocaleString()} sold or occupied lot
            {report.soldTouched === 1 ? '' : 's'} have visual geometry changes staged.
          </WarnLine>
        )}
      </div>
    </PanelSection>
  )
}

// ── selection ────────────────────────────────────────────────────────

function SelectionPanel() {
  const selection = useEditor((s) => s.selection)
  const lots = useEditor((s) => s.lots)
  const { byId } = useTiers()

  const summary = useMemo(() => {
    const sel = lots.filter((l) => selection.has(l.id))
    return { sel, mix: tierMix(sel, byId) }
  }, [lots, selection, byId])

  return (
    <PanelSection title="Selection" action={<SelectByMenu />}>
      {selection.size === 0 ? (
        <div className="space-y-2 text-[12px] leading-relaxed text-muted">
          <p>Click a lot to select it. Then:</p>
          <ul className="space-y-1 text-[11.5px]">
            <li>
              <span className="font-mono text-ink">Shift</span>+click extends a range along the
              numbering
            </li>
            <li>
              <span className="font-mono text-ink">⌘</span>+click toggles one
            </li>
            <li>Drag on empty ground for a rubber band, Alt to subtract</li>
            <li>
              Hold <span className="font-mono text-ink">L</span> and drag for a lasso
            </li>
            <li>
              <span className="font-mono text-ink">⌘A</span> selects the whole active block
            </li>
          </ul>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="font-display text-[22px] leading-none text-ink tabular">
            {selection.size.toLocaleString()}
            <span className="ml-1.5 font-sans text-[12px] text-muted">selected</span>
          </p>
          <ul className="space-y-1">
            {summary.mix.map((m) => (
              <li key={m.tier?.id ?? 'none'} className="flex items-center gap-2 text-[12px]">
                <span
                  className="size-2.5 shrink-0 rounded-[2px] border border-line"
                  style={{ background: m.tier?.appearance.fillColor }}
                />
                <span className="min-w-0 flex-1 truncate text-ink">{m.tier?.name ?? 'Unknown tier'}</span>
                <span className="font-mono text-muted tabular">{m.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PanelSection>
  )
}

/** Reaches a useful selection faster than any amount of dragging. */
export function SelectByMenu() {
  const lots = useEditor((s) => s.lots)
  const blocks = useEditor((s) => s.blocks)
  const activeBlockId = useEditor((s) => s.activeBlockId)
  const selection = useEditor((s) => s.selection)
  const setSelection = useEditor((s) => s.setSelection)
  const { tiers } = useTiers()

  const block = blocks.find((b) => b.id === activeBlockId)
  const inBlock = useMemo(() => lotsOfBlock(lots, activeBlockId), [lots, activeBlockId])
  const rot = block?.grid?.rotationDeg ?? 12
  const rc = useMemo(() => spatialIndex(inBlock, rot), [inBlock, rot])

  const anchor = inBlock.find((l) => selection.has(l.id))

  const pickRow = () => {
    if (!anchor) return
    const row = rc.get(anchor.id)?.row
    setSelection(inBlock.filter((l) => rc.get(l.id)?.row === row).map((l) => l.id))
  }
  const pickCol = () => {
    if (!anchor) return
    const col = rc.get(anchor.id)?.col
    setSelection(inBlock.filter((l) => rc.get(l.id)?.col === col).map((l) => l.id))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" className="h-7 gap-1 text-[11.5px]">
          Select by
          <Icon icon={IconMore} size={13} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px]">Within {block?.code ?? 'the block'}</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!block}
          onSelect={() => setSelection(inBlock.map((l) => l.id))}
        >
          Whole block
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!anchor} onSelect={pickRow}>
          Entire row of the selected lot
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!anchor} onSelect={pickCol}>
          Entire column of the selected lot
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>All of a tier</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {tiers.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onSelect={() =>
                  setSelection(lots.filter((l) => l.tierId === (t.id as TierId)).map((l) => l.id))
                }
              >
                {t.name}
                <span className="ml-auto font-mono text-[10.5px] text-muted">
                  {lots.filter((l) => l.tierId === t.id).length}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>All of a status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {LOT_STATUSES.map((s: LotStatus) => (
              <DropdownMenuItem
                key={s}
                onSelect={() => setSelection(lots.filter((l) => l.status === s).map((l) => l.id))}
              >
                {STATUS_LABEL[s]}
                <span className="ml-auto font-mono text-[10.5px] text-muted">
                  {lots.filter((l) => l.status === s).length}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => setSelection(lots.filter((l) => !selection.has(l.id)).map((l) => l.id))}
        >
          Inverse
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setSelection([])}>Clear</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DrawPanel() {
  const grid = useEditor((s) => s.grid)
  const { byId } = useTiers()
  const tier = grid.tierId ? byId.get(grid.tierId) : undefined
  return (
    <PanelSection title="Draw lot">
      <div className="space-y-2.5 text-[12.5px] leading-relaxed text-muted">
        <p>
          The escape hatch for the irregular edges a grid cannot follow. Most sessions never need
          it.
        </p>
        <ul className="space-y-1 text-[11.5px]">
          <li>Click to place each vertex — it snaps to a nearby lot corner within 8 px</li>
          <li>Double-click or Enter closes the shape</li>
          <li>Backspace removes the last vertex, Esc abandons it</li>
        </ul>
        <p className="text-[11.5px]">
          New lots take the tier chosen on the Grid tool
          {tier ? (
            <>
              {' '}
              — currently <span className="font-medium text-ink">{tier.name}</span>.
            </>
          ) : (
            <> — pick one there first.</>
          )}
        </p>
      </div>
    </PanelSection>
  )
}

// ── layers ───────────────────────────────────────────────────────────

function LayersPanel() {
  const layers = useEditor((s) => s.layers)
  const setLayer = useEditor((s) => s.setLayer)
  const repairOverlaps = useEditor((s) => s.repairOverlaps)
  const overlays = useEditor((s) => s.overlays)
  const activeOverlayId = useEditor((s) => s.activeOverlayId)
  const updateOverlay = useEditor((s) => s.updateOverlay)
  const baseLayer = useMapStore((s) => s.baseLayer)
  const setBaseLayer = useMapStore((s) => s.setBaseLayer)
  const validation = useLayoutValidation()

  // The slider follows whichever plan is being worked on, so several plans can
  // be dimmed independently rather than sharing one global figure.
  const plan =
    overlays.find((o) => o.id === activeOverlayId) ?? overlays[overlays.length - 1] ?? null

  return (
    <PanelSection title="Layers">
      <div className="space-y-2.5">
        <Row
          id="lyr-siteplan"
          label="Site plan"
          checked={layers.sitePlan}
          onChange={(v) => setLayer('sitePlan', v)}
          icon={IconOverlay}
        />
        {layers.sitePlan && plan && (
          <div className="-mt-0.5 flex items-center gap-2 pl-6">
            <Slider
              value={[Math.round(plan.opacity * 100)]}
              min={5}
              max={100}
              step={5}
              aria-label={`${plan.name} opacity`}
              onValueChange={([v]) => updateOverlay(plan.id, { opacity: (v ?? 45) / 100 })}
              className="flex-1"
            />
            <span className="w-8 shrink-0 text-right font-mono text-[10.5px] text-muted tabular">
              {Math.round(plan.opacity * 100)}%
            </span>
          </div>
        )}
        <Row
          id="lyr-blocks"
          label="Block outlines"
          checked={layers.blocks}
          onChange={(v) => setLayer('blocks', v)}
          icon={IconBlock}
        />
        <Row
          id="lyr-lots"
          label="Lots"
          checked={layers.lots}
          onChange={(v) => setLayer('lots', v)}
          icon={IconGrid}
        />
        <Row
          id="lyr-numbers"
          label="Lot numbers"
          checked={layers.lotNumbers}
          onChange={(v) => setLayer('lotNumbers', v)}
          icon={IconLayers}
        />
        <Row
          id="lyr-base"
          label="Satellite base"
          checked={baseLayer === 'satellite'}
          onChange={(v) => setBaseLayer(v ? 'satellite' : 'plain')}
          icon={IconSatellite}
        />

        {!validation.canPublish && (
          <div className="space-y-2 pt-1">
            <DangerLine>
              {validation.blockingCount.toLocaleString()} layout issue
              {validation.blockingCount === 1 ? '' : 's'} block publishing.
            </DangerLine>
            <ul className="space-y-1">
              {conflictSummary(validation).map((line) => (
                <li key={line} className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[11.5px] text-muted">
                  {line}
                </li>
              ))}
            </ul>
            {validation.overlapLotIds.size > 0 && (
              <Button
                variant="secondary"
                className="h-8 w-full gap-1.5 text-[12px]"
                onClick={() => {
                  repairOverlaps()
                  toast.success('Overlapping lots nudged apart', {
                    description: 'Sold and occupied lots were left exactly where they were.',
                  })
                }}
              >
                <Icon icon={IconRepair} size={14} />
                Fix overlaps
              </Button>
            )}
          </div>
        )}
      </div>
    </PanelSection>
  )
}

function Row({
  id,
  label,
  checked,
  onChange,
  icon,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  icon: typeof IconLayers
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="flex items-center gap-2 text-[12.5px] font-normal text-ink">
        <Icon icon={icon} size={14} className="text-muted" />
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

// ── blocks ───────────────────────────────────────────────────────────

function BlocksPanel({ canvas }: { canvas: CanvasHandle | null }) {
  const blocks = useEditor((s) => s.blocks)
  const lots = useEditor((s) => s.lots)
  const tool = useEditor((s) => s.tool)
  const activeBlockId = useEditor((s) => s.activeBlockId)
  const setActiveBlock = useEditor((s) => s.setActiveBlock)
  const setTool = useEditor((s) => s.setTool)
  const setSelection = useEditor((s) => s.setSelection)
  const startBlockEdit = useEditor((s) => s.startBlockEdit)
  const { byId } = useTiers()
  const [renaming, setRenaming] = useState<Block | null>(null)
  const [deleting, setDeleting] = useState<Block | null>(null)

  return (
    <>
      <PanelSection title={`Blocks · ${blocks.length}`}>
        {blocks.length === 0 ? (
          <p className="text-[12px] text-muted">
            No blocks yet. Draw one with the Block tool to get started.
          </p>
        ) : (
          <ul className="space-y-1">
            {blocks.map((b) => {
              const inBlock = lots.filter((l) => l.blockId === b.id)
              const mix = tierMix(inBlock, byId).slice(0, 4)
              return (
                <li key={b.id}>
                  <div
                    className={cn(
                      'group flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors',
                      b.id === activeBlockId
                        ? 'border-gold bg-gold/8'
                        : 'border-transparent hover:bg-surface-2',
                    )}
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setActiveBlock(b.id)
                        if (tool === 'editBlock') startBlockEdit(b.id)
                        canvas?.zoomToBlock(b.id)
                      }}
                    >
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[12.5px] font-semibold text-ink">
                          {b.code}
                        </span>
                        <span className="min-w-0 truncate text-[11.5px] text-muted">{b.name}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <span className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
                          {mix.map((m) => (
                            <span
                              key={m.tier?.id ?? 'x'}
                              style={{
                                background: m.tier?.appearance.fillColor,
                                width: `${(m.count / Math.max(1, inBlock.length)) * 100}%`,
                              }}
                            />
                          ))}
                        </span>
                        <span className="shrink-0 font-mono text-[10.5px] text-muted tabular">
                          {inBlock.length.toLocaleString()} lots
                        </span>
                      </span>
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 shrink-0 opacity-60 hover:opacity-100"
                          aria-label={`Actions for ${b.code}`}
                        >
                          <Icon icon={IconMore} size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onSelect={() => {
                            startBlockEdit(b.id)
                            canvas?.zoomToBlock(b.id)
                          }}
                        >
                          <Icon icon={IconEdit} size={14} />
                          Edit shape
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setRenaming(b)}>
                          <Icon icon={IconEdit} size={14} />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setActiveBlock(b.id)
                            setTool('grid')
                          }}
                        >
                          <Icon icon={IconGrid} size={14} />
                          Regenerate lots
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setActiveBlock(b.id)
                            setSelection(inBlock.map((l) => l.id))
                            setTool('select')
                          }}
                        >
                          <Icon icon={IconSelect} size={14} />
                          Select all its lots
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleting(b)}
                        >
                          <Icon icon={IconDelete} size={14} />
                          Delete block
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </PanelSection>

      <RenameDialog block={renaming} onClose={() => setRenaming(null)} />
      <DeleteBlockDialog block={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}

function RenameDialog({ block, onClose }: { block: Block | null; onClose: () => void }) {
  const updateBlock = useEditor((s) => s.updateBlock)
  const [name, setName] = useState('')

  return (
    <AlertDialog
      open={!!block}
      onOpenChange={(v) => {
        if (!v) onClose()
        else setName(block?.name ?? '')
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rename {block?.code}</AlertDialogTitle>
          <AlertDialogDescription>
            The block code stays the same, so no lot code changes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={block?.name ?? 'Block name'}
          autoFocus
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={() => {
              if (block) updateBlock(block.id, { name: name.trim() || null })
              onClose()
            }}
          >
            Rename
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteBlockDialog({ block, onClose }: { block: Block | null; onClose: () => void }) {
  const lots = useEditor((s) => s.lots)
  const deleteBlock = useEditor((s) => s.deleteBlock)
  const [typed, setTyped] = useState('')

  const inBlock = block ? lots.filter((l) => l.blockId === block.id) : []
  const guarded = inBlock.filter(
    (l) => l.status === 'sold' || l.status === 'occupied' || l.currentContractId || l.intermentCount,
  )
  const ok = block ? typed.trim().toUpperCase() === block.code.toUpperCase() : false

  return (
    <AlertDialog
      open={!!block}
      onOpenChange={(v) => {
        if (!v) onClose()
        setTyped('')
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {guarded.length > 0 ? `${block?.code} cannot be deleted` : `Delete block ${block?.code}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {guarded.length > 0 ? (
              <>
                {guarded.length} of its {inBlock.length} lots are sold or occupied. Sold history is
                never destroyed — move or release those contracts first.
              </>
            ) : (
              <>
                This removes the block and its {inBlock.length.toLocaleString()} lots from the
                draft. Type <span className="font-mono font-semibold">{block?.code}</span> to
                confirm.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {guarded.length === 0 && (
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={block?.code}
            className="font-mono"
            autoFocus
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {guarded.length === 0 && (
            <Button
              variant="destructive"
              disabled={!ok}
              onClick={() => {
                if (block) {
                  deleteBlock(block.id as BlockId)
                  toast.success(`Block ${block.code} removed from the draft`)
                }
                onClose()
              }}
            >
              Delete block
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
