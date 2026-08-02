import { useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Block, MapOverlay } from '@/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconBringFront,
  IconDelete,
  IconHidden,
  IconInfo,
  IconImageUpload,
  IconSendBehind,
  IconVisible,
} from '@/components/ui-brand/icons'
import { boundsOf } from '@/lib/geo'
import { cn } from '@/lib/utils'
import { Field, PanelSection, WarnLine } from './bits'
import { makeOverlay, useEditor } from './store'
import type { CanvasHandle } from './EditorCanvas'

const MAX_MB = 4
const ACCEPT = 'image/png,image/jpeg,image/jpg,image/svg+xml'

/**
 * Manual georeferencing. A scanned blueprint has no coordinates in it, so the
 * only honest way to place one is by eye — drop it on the map, scale, rotate,
 * then flick Compare to check the drawn lots against the plan underneath.
 */
export function OverlayPanel({ canvas }: { canvas: CanvasHandle | null }) {
  const overlays = useEditor((s) => s.overlays)
  const activeId = useEditor((s) => s.activeOverlayId)
  const setActive = useEditor((s) => s.setActiveOverlay)
  const addOverlay = useEditor((s) => s.addOverlay)
  const updateOverlay = useEditor((s) => s.updateOverlay)
  const removeOverlay = useEditor((s) => s.removeOverlay)
  const locked = useEditor((s) => s.lockedOverlays)
  const toggleLock = useEditor((s) => s.toggleOverlayLock)
  const compare = useEditor((s) => s.compare)
  const setCompare = useEditor((s) => s.setCompare)
  const blocks = useEditor((s) => s.blocks)
  const locationId = useEditor((s) => s.locationId)

  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const active = overlays.find((o) => o.id === activeId) ?? null

  const ingest = (file: File) => {
    if (!locationId) return
    if (!/^image\/(png|jpe?g|svg\+xml)$/.test(file.type)) {
      toast.error('Unsupported file', { description: 'Use a PNG, JPG or SVG.' })
      return
    }
    const mb = file.size / (1024 * 1024)
    if (mb > MAX_MB) {
      toast.warning(`${mb.toFixed(1)} MB is a large image`, {
        description: `Above ${MAX_MB} MB the map can feel sluggish. Placing it anyway.`,
      })
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      const bounds = canvas?.viewBounds() ?? boundsOf(blocks.map((b) => b.polygon))
      const z = overlays.reduce((m, o) => Math.max(m, o.zIndex), 0) + 1
      addOverlay(makeOverlay(locationId, file.name.replace(/\.[^.]+$/, ''), url, bounds, z))
      toast.success('Site plan placed', {
        description: 'Drag it into position, then scale with the corner handles.',
      })
    }
    reader.readAsDataURL(file)
  }

  return (
    <>
      <PanelSection title="Site plan">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files[0]
            if (f) ingest(f)
          }}
          className={cn(
            'rounded-lg border border-dashed px-3 py-5 text-center transition-colors',
            dragOver ? 'border-gold bg-gold/8' : 'border-line bg-surface-2',
          )}
        >
          <Icon icon={IconImageUpload} size={22} className="mx-auto mb-2 text-muted" />
          <p className="text-caption text-ink">Drop a site plan here</p>
          <p className="mt-0.5 text-micro text-muted">PNG, JPG or SVG · up to {MAX_MB} MB</p>
          <Button
            variant="secondary"
            className="mt-3 text-control"
            onClick={() => fileRef.current?.click()}
          >
            Choose a file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) ingest(f)
              e.target.value = ''
            }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <Label htmlFor="compare" className="text-caption font-medium text-ink">
            Compare
            <span className="mt-0.5 block text-micro font-normal leading-snug text-muted">
              Hide the lots to check them against the plan underneath.
            </span>
          </Label>
          <Switch id="compare" checked={compare} onCheckedChange={setCompare} />
        </div>
      </PanelSection>

      {overlays.length > 0 && (
        <PanelSection title={`Overlays · ${overlays.length}`}>
          <ul className="space-y-1">
            {overlays.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => setActive(o.id)}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                    o.id === activeId
                      ? 'border-gold bg-gold/8'
                      : 'border-transparent hover:bg-surface-2',
                  )}
                >
                  <img
                    src={o.imageUrl}
                    alt=""
                    className="size-7 shrink-0 rounded border border-line object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-caption text-ink">{o.name}</span>
                    <span className="block text-micro text-muted">
                      {Math.round(o.opacity * 100)}% ·{' '}
                      {o.visible ? 'on the main map' : 'hidden from the main map'}
                    </span>
                  </span>
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded text-muted hover:bg-surface-2 hover:text-ink"
                    role="button"
                    tabIndex={0}
                    aria-label={o.visible ? 'Hide from the main map' : 'Show on the main map'}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateOverlay(o.id, { visible: !o.visible })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') updateOverlay(o.id, { visible: !o.visible })
                    }}
                  >
                    <Icon icon={o.visible ? IconVisible : IconHidden} size={14} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}

      {active && (
        <OverlayProperties
          overlay={active}
          locked={locked.has(active.id)}
          onLock={() => toggleLock(active.id)}
          onPatch={(p) => updateOverlay(active.id, p)}
          onRemove={() => removeOverlay(active.id)}
          blocks={blocks}
        />
      )}
    </>
  )
}

function OverlayProperties({
  overlay,
  locked,
  onLock,
  onPatch,
  onRemove,
  blocks,
}: {
  overlay: MapOverlay
  locked: boolean
  onLock: () => void
  onPatch: (p: Partial<MapOverlay>) => void
  onRemove: () => void
  blocks: Block[]
}) {
  const front = overlay.zIndex >= 100
  return (
    <PanelSection title="Overlay properties">
      <div className="space-y-3.5">
        <Field label="Name">
          <Input
            value={overlay.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            className="text-caption"
          />
        </Field>

        <Field label={`Opacity — ${Math.round(overlay.opacity * 100)}%`}>
          <Slider
            value={[Math.round(overlay.opacity * 100)]}
            min={5}
            max={100}
            step={5}
            onValueChange={([v]) => onPatch({ opacity: (v ?? 45) / 100 })}
          />
        </Field>

        <Field label={`Rotation — ${overlay.rotationDeg.toFixed(0)}°`}>
          <Slider
            value={[overlay.rotationDeg]}
            min={-45}
            max={45}
            step={1}
            onValueChange={([v]) => onPatch({ rotationDeg: v ?? 0 })}
          />
        </Field>

        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ovl-visible" className="text-caption font-medium text-muted">
            Show on the main map
          </Label>
          <Switch
            id="ovl-visible"
            checked={overlay.visible}
            onCheckedChange={(visible) => onPatch({ visible })}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ovl-lock" className="text-caption font-medium text-muted">
            Lock position
          </Label>
          <Switch id="ovl-lock" checked={locked} onCheckedChange={onLock} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="gap-1.5 text-caption"
            onClick={() => onPatch({ zIndex: front ? 1 : 100 })}
          >
            <Icon icon={front ? IconSendBehind : IconBringFront} size={14} />
            {front ? 'Send behind' : 'Bring in front'}
          </Button>
          <FitToBlock blocks={blocks} onFit={(bounds) => onPatch({ bounds })} />
        </div>

        {locked && <WarnLine>Locked — unlock it to drag, scale or rotate.</WarnLine>}

        <Button
          variant="ghost"
          className="w-full gap-1.5 text-caption text-danger hover:bg-danger/10 hover:text-danger"
          onClick={() => {
            onRemove()
            toast.success('Overlay removed from the draft')
          }}
        >
          <Icon icon={IconDelete} size={14} />
          Remove overlay
        </Button>

        <p className="flex items-start gap-1.5 text-micro leading-snug text-muted">
          <Icon icon={IconInfo} size={12} className="mt-px" />
          Nothing here reaches the main map until you publish.
        </p>
      </div>
    </PanelSection>
  )
}

function FitToBlock({
  blocks,
  onFit,
}: {
  blocks: Block[]
  onFit: (b: MapOverlay['bounds']) => void
}) {
  if (blocks.length === 0) {
    return (
      <Button variant="secondary" className="text-caption" disabled>
        Fit to block
      </Button>
    )
  }
  return (
    <Select
      value=""
      onValueChange={(id) => {
        const b = blocks.find((x) => x.id === id)
        if (b) onFit(boundsOf([b.polygon]))
      }}
    >
      <SelectTrigger className="w-full text-caption">
        <SelectValue placeholder="Fit to block" />
      </SelectTrigger>
      <SelectContent>
        {blocks.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
