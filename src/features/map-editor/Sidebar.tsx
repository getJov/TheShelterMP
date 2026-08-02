import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Block, BlockId, TierId } from '@/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconDelete,
  IconDrawBlock,
  IconFitBounds,
  IconMap,
  IconPen,
  IconRotate,
  IconSatellite,
} from '@/components/ui-brand/icons'
import { NOW } from '@/mock'
import { useDataset } from '@/stores/dataset'
import { useMapStore } from '@/stores/map'
import { areaSqm } from '@/lib/geo'
import {
  NUMBERING,
  blockCodeError,
  distanceM,
  nextBlockCode,
  type Numbering,
} from '@/lib/grid-generator'
import { formatPeso } from '@/lib/money'
import { resolvePrice } from '@/lib/price-resolver'
import { cn } from '@/lib/utils'
import {
  DangerLine,
  Field,
  NumberField,
  NumberingDiagram,
  PanelSection,
  Readout,
  WarnLine,
} from './bits'
import { useEditor, type GenerateDirection } from './store'
import { STATUS_LABEL, protectedIn, useLayoutValidation, useTiers } from './helpers'
import { OverlayPanel } from './OverlayPanel'
import type { CanvasHandle } from './EditorCanvas'

/**
 * The flat Blocks > Lots manager. Two screens: the block list (home) and a
 * single block's workbench. No wizard steps — every control acts directly on
 * the draft.
 */
export function Sidebar({ canvas }: { canvas: CanvasHandle | null }) {
  const view = useEditor((s) => s.view)
  const blocks = useEditor((s) => s.blocks)

  return (
    <aside className="flex h-full w-[min(318px,44vw)] shrink-0 flex-col border-r border-line bg-surface">
      <ScrollArea className="min-h-0 flex-1">
        <NewBlockCard />
        {view.screen === 'block' && blocks.some((b) => b.id === view.blockId) ? (
          <BlockView blockId={view.blockId} canvas={canvas} />
        ) : (
          <HomeView canvas={canvas} />
        )}
      </ScrollArea>
    </aside>
  )
}

// ── shared bits ──────────────────────────────────────────────────────

/** Tier price labels, resolved once per tier and cached for the render. */
function useTierPriceLabel(): (tierId: TierId) => string {
  const prices = useDataset((s) => s.data.prices)
  const today = NOW.slice(0, 10)
  return useMemo(() => {
    const cache = new Map<TierId, string>()
    return (tierId: TierId) => {
      const hit = cache.get(tierId)
      if (hit) return hit
      const r = resolvePrice(prices, tierId, 'pre_need', 'spot_cash', today)
      const label =
        r.amountCentavos != null ? formatPeso(r.amountCentavos) : 'Contact for pricing'
      cache.set(tierId, label)
      return label
    }
  }, [prices, today])
}

function TierSelect({
  value,
  onChange,
  placeholder = 'Choose a tier',
}: {
  value: TierId | null
  onChange: (id: TierId) => void
  placeholder?: string
}) {
  const { tiers } = useTiers()
  const priceOf = useTierPriceLabel()
  return (
    <Select value={value ?? ''} onValueChange={(v) => v && onChange(v as TierId)}>
      <SelectTrigger className="w-full text-caption">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {tiers.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            <span className="flex w-full items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[2px] border border-line"
                style={{ background: t.appearance.fillColor }}
              />
              <span className="flex-1">{t.name}</span>
              <span className="font-mono text-caption text-muted">{priceOf(t.id)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: typeof IconDrawBlock
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      className={cn(
        'gap-1.5 border border-transparent text-caption',
        active && 'border-gold bg-gold/12 text-gold-deep dark:text-gold',
      )}
      onClick={onClick}
    >
      <Icon icon={icon} size={14} />
      {label}
    </Button>
  )
}

const NUDGE_STEPS = [0.05, 0.25, 1]

function StepCycler({ step, onChange }: { step: number; onChange: (v: number) => void }) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="size-10 shrink-0 p-0 font-mono text-micro tabular"
      title="Nudge step in metres — click to cycle 0.05 / 0.25 / 1"
      onClick={() => {
        const i = NUDGE_STEPS.indexOf(step)
        onChange(NUDGE_STEPS[(i + 1) % NUDGE_STEPS.length])
      }}
    >
      {step}m
    </Button>
  )
}

/** D-pad + rotate + step cycler. Shared by the block and the selection. */
function MoveCluster({
  step,
  onStepChange,
  onNudge,
  onRotate,
}: {
  step: number
  onStepChange: (v: number) => void
  onNudge: (eastM: number, northM: number) => void
  onRotate: (dir: 1 | -1, fast: boolean) => void
}) {
  const cell = 'size-10 shrink-0'
  return (
    <div className="grid w-fit grid-cols-3 gap-1.5">
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className={cell}
        aria-label="Rotate counter-clockwise"
        title="Rotate 0.5° counter-clockwise — Shift for 5°"
        onClick={(e) => onRotate(-1, e.shiftKey)}
      >
        <Icon icon={IconRotate} size={14} className="-scale-x-100" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className={cell}
        aria-label="Nudge north"
        onClick={() => onNudge(0, step)}
      >
        <Icon icon={IconChevronUp} size={14} />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className={cell}
        aria-label="Rotate clockwise"
        title="Rotate 0.5° clockwise — Shift for 5°"
        onClick={(e) => onRotate(1, e.shiftKey)}
      >
        <Icon icon={IconRotate} size={14} />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className={cell}
        aria-label="Nudge west"
        onClick={() => onNudge(-step, 0)}
      >
        <Icon icon={IconChevronLeft} size={14} />
      </Button>
      <StepCycler step={step} onChange={onStepChange} />
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className={cell}
        aria-label="Nudge east"
        onClick={() => onNudge(step, 0)}
      >
        <Icon icon={IconChevronRight} size={14} />
      </Button>
      <span />
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className={cell}
        aria-label="Nudge south"
        onClick={() => onNudge(0, -step)}
      >
        <Icon icon={IconChevronDown} size={14} />
      </Button>
      <span />
    </div>
  )
}

// ── new block card (both screens) ────────────────────────────────────

function NewBlockCard() {
  const pending = useEditor((s) => s.pendingBlock)
  const patch = useEditor((s) => s.patchPendingBlock)
  const setPending = useEditor((s) => s.setPendingBlock)
  const commit = useEditor((s) => s.commitPendingBlock)
  const autofillBlock = useEditor((s) => s.autofillBlock)
  const setView = useEditor((s) => s.setView)
  const blocks = useEditor((s) => s.blocks)
  const { byId } = useTiers()
  const [rows, setRows] = useState(10)
  const [cols, setCols] = useState(10)

  const suggested = useMemo(() => nextBlockCode(blocks), [blocks])

  useEffect(() => {
    if (pending && pending.code === '') patch({ code: suggested })
  }, [pending, suggested, patch])

  // Closing a shape (Enter / double-click) must land the eye here — the
  // clear-and-fill card is the next step, wherever the sidebar was.
  const cardRef = useRef<HTMLDivElement>(null)
  const hasPending = pending != null
  useEffect(() => {
    if (hasPending) cardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [hasPending])

  if (!pending) return null

  const err = blockCodeError(pending.code, blocks)
  const tier = pending.defaultTierId ? byId.get(pending.defaultTierId) : undefined
  const w = distanceM(pending.polygon[0]!, pending.polygon[1]!)
  const l = distanceM(pending.polygon[1]!, pending.polygon[2]!)

  const createEmpty = () => {
    const id = commit()
    if (id) {
      setView({ screen: 'block', blockId: id })
      toast.success('Block created — draw lots inside it')
    }
  }

  const createFilled = () => {
    if (!tier) return
    const id = commit()
    if (id) {
      const n = autofillBlock(id, rows, cols, tier)
      setView({ screen: 'block', blockId: id })
      toast.success(`Block created with ${n} lots`)
    }
  }

  return (
    <div ref={cardRef}>
      <PanelSection title="New block">
      <div className="space-y-3">
        <Readout>
          {w.toFixed(1)} × {l.toFixed(1)} m ·{' '}
          {Math.round(areaSqm(pending.polygon)).toLocaleString()} m²
        </Readout>

        <div className="grid grid-cols-[96px_1fr] gap-2">
          <Field label="Code">
            <Input
              value={pending.code}
              onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
              className="font-mono text-caption"
              placeholder={suggested}
            />
          </Field>
          <Field label="Name (optional)">
            <Input
              value={pending.name}
              onChange={(e) => patch({ name: e.target.value })}
              className="text-caption"
              placeholder="Garden of…"
            />
          </Field>
        </div>
        {err && <DangerLine>{err}</DangerLine>}

        <Field label="Lot tier" hint="Sets the lot footprint and the price shown.">
          <TierSelect
            value={pending.defaultTierId}
            onChange={(id) => patch({ defaultTierId: id })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Rows">
            <NumberField value={rows} onChange={setRows} min={1} max={400} />
          </Field>
          <Field label="Cols">
            <NumberField value={cols} onChange={setCols} min={1} max={400} />
          </Field>
        </div>

        <div className="space-y-2">
          <Button
            className="w-full gap-1.5"
            disabled={!!err || !tier}
            title={tier ? undefined : 'Choose a tier first'}
            onClick={createFilled}
          >
            <Icon icon={IconDrawBlock} size={14} />
            Autofill {rows} × {cols}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 text-caption"
              disabled={!!err}
              onClick={createEmpty}
            >
              Create free-form (empty)
            </Button>
            <Button
              variant="secondary"
              className="flex-1 text-caption"
              onClick={() => setPending(null)}
            >
              Discard
            </Button>
          </div>
        </div>
      </div>
      </PanelSection>
    </div>
  )
}

// ── screen A: home ───────────────────────────────────────────────────

function HomeView({ canvas }: { canvas: CanvasHandle | null }) {
  const blocks = useEditor((s) => s.blocks)
  const lots = useEditor((s) => s.lots)
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const setView = useEditor((s) => s.setView)
  const { byId } = useTiers()
  const validation = useLayoutValidation()

  return (
    <>
      <PanelSection title="Blocks">
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-caption font-medium text-muted">Add block</p>
            <div className="grid grid-cols-2 gap-2">
              <ToolButton
                icon={IconDrawBlock}
                label="Rect block"
                active={tool === 'block'}
                onClick={() => setTool('block')}
              />
              <ToolButton
                icon={IconPen}
                label="Free-form block"
                active={tool === 'blockFree'}
                onClick={() => setTool('blockFree')}
              />
            </div>
            <p className="mt-1.5 text-caption leading-snug text-muted">
              Draw on the map — Shift constrains, Alt draws from centre.
            </p>
          </div>

          {blocks.length === 0 ? (
            <p className="text-caption leading-relaxed text-muted">
              No blocks yet — draw your first.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5">
              {blocks.map((b) => (
                <BlockListRow
                  key={b.id}
                  block={b}
                  count={lots.filter((lot) => lot.blockId === b.id).length}
                  color={
                    b.defaultTierId ? byId.get(b.defaultTierId)?.appearance.fillColor : undefined
                  }
                  onOpen={() => {
                    setView({ screen: 'block', blockId: b.id })
                    canvas?.zoomToBlock(b.id)
                  }}
                />
              ))}
            </div>
          )}

          {validation.blockingCount > 0 && (
            <WarnLine>
              {validation.blockingCount.toLocaleString()} layout warning
              {validation.blockingCount === 1 ? '' : 's'} — publishing is still allowed.
            </WarnLine>
          )}
        </div>
      </PanelSection>

      <OverlayPanel canvas={canvas} />

      <BaseMapPanel canvas={canvas} />
    </>
  )
}

function BlockListRow({
  block,
  count,
  color,
  onOpen,
}: {
  block: Block
  count: number
  color: string | undefined
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-line px-2.5 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-[2px] border border-line"
          style={{ background: color }}
        />
        <span className="min-w-0">
          <span className="block font-mono text-caption font-semibold text-ink">
            {block.code}
          </span>
          <span className="block break-words text-caption text-muted">
            {block.name ?? 'Unnamed block'}
          </span>
        </span>
      </span>
      <span className="shrink-0 font-mono text-micro text-muted tabular">
        {count.toLocaleString()} lots
      </span>
    </button>
  )
}

/** Salvaged base-map controls: Satellite/Default plus reset north and fit. */
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
            <span className="text-caption">Satellite</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="plain"
            aria-label="Default base"
            className="h-10 justify-start gap-2 rounded-md border border-line px-2.5 data-[state=on]:border-gold data-[state=on]:bg-gold/12 data-[state=on]:text-gold-deep dark:data-[state=on]:text-gold"
          >
            <Icon icon={IconMap} size={15} />
            <span className="text-caption">Default</span>
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="secondary"
          className="w-full gap-1.5 text-caption"
          onClick={() => canvas?.fit()}
        >
          <Icon icon={IconFitBounds} size={14} />
          Reset north and fit layout
        </Button>
      </div>
    </PanelSection>
  )
}

// ── screen B: one block ──────────────────────────────────────────────

function BlockView({ blockId, canvas }: { blockId: BlockId; canvas: CanvasHandle | null }) {
  const blocks = useEditor((s) => s.blocks)
  const setView = useEditor((s) => s.setView)
  const updateBlock = useEditor((s) => s.updateBlock)
  const transformBlock = useEditor((s) => s.transformBlock)
  const resizeBlockGuarded = useEditor((s) => s.resizeBlockGuarded)
  const deleteBlock = useEditor((s) => s.deleteBlock)
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const [step, setStep] = useState(0.25)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const block = blocks.find((b) => b.id === blockId)
  if (!block) return null

  const resize = (dWidthM: number, dLengthM: number) => {
    const r = resizeBlockGuarded(block.id, dWidthM, dLengthM)
    if (!r.ok) {
      toast.warning(`Can't shrink — ${r.blockedBy} occupied/sold lots in the way`)
      return
    }
    if (r.relocated > 0 || r.removed > 0) {
      toast.success(`Resized — ${r.relocated} lots tucked in, ${r.removed} removed`)
    }
  }

  return (
    <>
      <div className="border-b border-line px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-1.5 text-caption text-muted hover:text-ink"
          onClick={() => setView({ screen: 'home' })}
        >
          <Icon icon={IconChevronLeft} size={14} />
          All blocks
        </Button>
      </div>

      <PanelSection title={`Block ${block.code}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <Field label="Code">
              <Input
                value={block.code}
                onChange={(e) => updateBlock(block.id, { code: e.target.value.toUpperCase() })}
                className="font-mono text-caption"
              />
            </Field>
            <Field label="Name">
              <Input
                value={block.name ?? ''}
                onChange={(e) => updateBlock(block.id, { name: e.target.value || null })}
                className="text-caption"
                placeholder="Unnamed block"
              />
            </Field>
          </div>
          <Field label="Default tier" hint="New lots drawn in this block take this tier.">
            <TierSelect
              value={block.defaultTierId}
              onChange={(id) => updateBlock(block.id, { defaultTierId: id })}
            />
          </Field>
          <Button
            variant="secondary"
            className="w-full gap-1.5 text-caption"
            onClick={() => canvas?.zoomToBlock(block.id)}
          >
            <Icon icon={IconFitBounds} size={14} />
            Zoom to block
          </Button>
        </div>
      </PanelSection>

      <PanelSection title="Block position">
        <MoveCluster
          step={step}
          onStepChange={setStep}
          onNudge={(eastM, northM) => transformBlock(block.id, { eastM, northM })}
          onRotate={(dir, fast) =>
            transformBlock(block.id, { rotateDeg: dir * (fast ? 5 : 0.5) })
          }
        />
        <p className="mt-2 text-caption leading-snug text-muted">
          Moves the block WITH its lots. Shift-click rotate for 5°.
        </p>
      </PanelSection>

      <PanelSection title="Block size">
        <div className="grid grid-cols-4 gap-1.5">
          <Button
            variant="secondary"
            className="font-mono text-caption"
            title="Shrink width"
            onClick={() => resize(-step, 0)}
          >
            W−
          </Button>
          <Button
            variant="secondary"
            className="font-mono text-caption"
            title="Grow width"
            onClick={() => resize(step, 0)}
          >
            W+
          </Button>
          <Button
            variant="secondary"
            className="font-mono text-caption"
            title="Shrink length"
            onClick={() => resize(0, -step)}
          >
            L−
          </Button>
          <Button
            variant="secondary"
            className="font-mono text-caption"
            title="Grow length"
            onClick={() => resize(0, step)}
          >
            L+
          </Button>
        </div>
        <p className="mt-1.5 text-caption leading-snug text-muted">
          Steps follow the {step} m cycler above. Shrinking tucks lots in; sold or occupied lots
          refuse.
        </p>
      </PanelSection>

      <PanelSection title="Danger zone">
        <Button
          type="button"
          variant="ghost"
          className="w-full gap-1.5 text-caption text-danger hover:bg-danger/10 hover:text-danger"
          onClick={() => setConfirmDelete(true)}
        >
          <Icon icon={IconDelete} size={14} />
          Delete block
        </Button>
      </PanelSection>

      <PanelSection title="Draw lots">
        <div className="grid grid-cols-2 gap-2">
          <ToolButton
            icon={IconDrawBlock}
            label="Rect lot"
            active={tool === 'lotRect'}
            onClick={() => setTool('lotRect')}
          />
          <ToolButton
            icon={IconPen}
            label="Free-form lot"
            active={tool === 'draw'}
            onClick={() => setTool('draw')}
          />
        </div>
        <p className="mt-1.5 text-caption leading-snug text-muted">Draw inside the block.</p>
      </PanelSection>

      <GenerateSection />

      <SelectionSection />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete block {block.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the block and its lots from the draft. Sold or occupied lots refuse
              deletion and keep the block in place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const refused = deleteBlock(block.id)
                if (refused > 0) {
                  toast.warning(`${refused} sold or occupied lots — block kept`)
                } else {
                  toast.success('Block deleted')
                  setView({ screen: 'home' })
                }
              }}
            >
              Delete block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ── generate from selection ──────────────────────────────────────────

const DIRECTIONS: { id: GenerateDirection; icon: typeof IconChevronLeft; label: string }[] = [
  { id: 'left', icon: IconChevronLeft, label: 'Left' },
  { id: 'right', icon: IconChevronRight, label: 'Right' },
  { id: 'up', icon: IconChevronUp, label: 'Up' },
  { id: 'down', icon: IconChevronDown, label: 'Down' },
]

function GenerateSection() {
  const selection = useEditor((s) => s.selection)
  const generateFromSelection = useEditor((s) => s.generateFromSelection)
  const { byId } = useTiers()
  const [dir, setDir] = useState<GenerateDirection>('right')

  const run = (count: number | 'fill') => {
    const { created } = generateFromSelection(dir, count, byId)
    if (created === 0) {
      toast.warning('No room in that direction')
      return
    }
    const clipped = count !== 'fill' && created < count
    toast.success(`${created} lots generated${clipped ? ' — block edge reached' : ''}`)
  }

  return (
    <PanelSection title="Generate">
      {selection.size === 0 ? (
        <p className="text-caption leading-snug text-muted">
          Select a lot or group first — generation copies the selection.
        </p>
      ) : (
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <div className="grid w-fit grid-cols-2 content-start gap-1.5">
            {DIRECTIONS.map((d) => (
              <Button
                key={d.id}
                type="button"
                size="icon"
                variant="secondary"
                aria-label={`Generate toward ${d.label.toLowerCase()}`}
                className={cn(
                  'size-10 border border-transparent',
                  dir === d.id && 'border-gold bg-gold/12 text-gold-deep dark:text-gold',
                )}
                onClick={() => setDir(d.id)}
              >
                <Icon icon={d.icon} size={14} />
              </Button>
            ))}
          </div>
          <div className="grid content-start gap-1.5">
            <Button variant="secondary" className="text-caption" onClick={() => run(10)}>
              ×10
            </Button>
            <Button variant="secondary" className="text-caption" onClick={() => run(100)}>
              ×100
            </Button>
            <Button variant="secondary" className="text-caption" onClick={() => run('fill')}>
              Fill
            </Button>
          </div>
        </div>
      )}
    </PanelSection>
  )
}

// ── selection tools ──────────────────────────────────────────────────

function SelectionSection() {
  const selection = useEditor((s) => s.selection)
  const lots = useEditor((s) => s.lots)
  const transformLots = useEditor((s) => s.transformLots)
  const resizeLots = useEditor((s) => s.resizeLots)
  const changeTier = useEditor((s) => s.changeTier)
  const changeStatus = useEditor((s) => s.changeStatus)
  const renumberSelection = useEditor((s) => s.renumberSelection)
  const deleteLots = useEditor((s) => s.deleteLots)
  const { byId } = useTiers()

  const [step, setStep] = useState(0.25)
  const [tierChoice, setTierChoice] = useState<TierId | null>(null)
  const [scheme, setScheme] = useState<Numbering>('boustrophedon')
  const [start, setStart] = useState(1)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const ids = useMemo(() => [...selection], [selection])
  const prot = useMemo(() => protectedIn(lots, selection), [lots, selection])

  if (selection.size === 0) return null

  const allProtected = prot.count === selection.size
  const tier = tierChoice ? byId.get(tierChoice) : undefined

  return (
    <PanelSection title={`Selection (${selection.size.toLocaleString()})`}>
      <div className="space-y-3">
        <MoveCluster
          step={step}
          onStepChange={setStep}
          onNudge={(eastM, northM) => transformLots(ids, { eastM, northM })}
          onRotate={(dir, fast) => transformLots(ids, { rotateDeg: dir * (fast ? 5 : 0.5) })}
        />

        <div className="space-y-1.5">
          <SizeStepRow
            label="Width ±"
            onMinus={() => resizeLots(ids, -0.05, 0)}
            onPlus={() => resizeLots(ids, 0.05, 0)}
          />
          <SizeStepRow
            label="Length ±"
            onMinus={() => resizeLots(ids, 0, -0.05)}
            onPlus={() => resizeLots(ids, 0, 0.05)}
          />
          <p className="text-caption leading-snug text-muted">0.05 m per press.</p>
        </div>

        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <TierSelect value={tierChoice} onChange={setTierChoice} placeholder="Change tier…" />
          </div>
          <Button
            variant="secondary"
            className="shrink-0 text-caption"
            disabled={!tier}
            onClick={() => {
              if (!tier) return
              changeTier(ids, tier)
              toast.success(`${ids.length} lots changed to ${tier.name}`, {
                description: 'Tier size was applied to the selected lot geometry.',
              })
            }}
          >
            Apply
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="text-caption"
            onClick={() => {
              changeStatus(ids, 'available', null)
              toast.success(`Status set to ${STATUS_LABEL.available}`)
            }}
          >
            Available
          </Button>
          <Button
            variant="secondary"
            className="text-caption"
            onClick={() => {
              changeStatus(ids, 'not_for_sale', 'Set aside from the editor')
              toast.success(`Status set to ${STATUS_LABEL.not_for_sale}`)
            }}
          >
            Not for sale
          </Button>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start at">
              <NumberField value={start} onChange={setStart} min={1} max={9999} />
            </Field>
            <Field label="Numbering">
              <Select value={scheme} onValueChange={(v) => setScheme(v as Numbering)}>
                <SelectTrigger className="w-full text-caption">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NUMBERING.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <NumberingDiagram scheme={scheme} />
            <Button
              variant="secondary"
              className="flex-1 text-caption"
              onClick={() => {
                renumberSelection(ids, scheme, start)
                toast.success(`${ids.length} lots renumbered from ${start}`)
              }}
            >
              Apply numbering
            </Button>
          </div>
        </div>

        {prot.count > 0 && (
          <WarnLine>
            {prot.count} protected (sold/occupied) — they are never deleted or moved.
          </WarnLine>
        )}
        <Button
          type="button"
          variant="ghost"
          className="w-full gap-1.5 text-caption text-danger hover:bg-danger/10 hover:text-danger"
          disabled={allProtected}
          title={
            allProtected
              ? 'Every selected lot is sold or occupied — protected lots are never deleted.'
              : undefined
          }
          onClick={() => setConfirmDelete(true)}
        >
          <Icon icon={IconDelete} size={14} />
          Delete selected
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {(ids.length - prot.count).toLocaleString()} lot
              {ids.length - prot.count === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {prot.count > 0
                ? `${prot.count} sold or occupied lots in the selection are protected and stay exactly where they are.`
                : 'Removes the selected lots from the draft. Undo reverses it.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteLots(ids)
                toast.success(
                  `${(ids.length - prot.count).toLocaleString()} lots deleted from the draft`,
                )
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelSection>
  )
}

function SizeStepRow({
  label,
  onMinus,
  onPlus,
}: {
  label: string
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-caption text-muted">{label}</span>
      <div className="flex gap-1">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="size-10"
          aria-label={`${label} decrease`}
          onClick={onMinus}
        >
          <span className="text-caption leading-none">−</span>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="size-10"
          aria-label={`${label} increase`}
          onClick={onPlus}
        >
          <span className="text-caption leading-none">+</span>
        </Button>
      </div>
    </div>
  )
}
