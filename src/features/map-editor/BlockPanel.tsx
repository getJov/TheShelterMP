import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icon } from '@/components/ui-brand/Icon'
import { IconDrawBlock } from '@/components/ui-brand/icons'
import { areaSqm } from '@/lib/geo'
import { blockCodeError, distanceM, nextBlockCode } from '@/lib/grid-generator'
import { DangerLine, Field, PanelSection, Readout } from './bits'
import { useEditor } from './store'
import { useTiers } from './helpers'

/** The Block tool's side form. Confirm hands straight over to the Grid tool. */
export function BlockPanel() {
  const pending = useEditor((s) => s.pendingBlock)
  const patch = useEditor((s) => s.patchPendingBlock)
  const setPending = useEditor((s) => s.setPendingBlock)
  const commit = useEditor((s) => s.commitPendingBlock)
  const blocks = useEditor((s) => s.blocks)
  const { tiers } = useTiers()

  const suggested = useMemo(() => nextBlockCode(blocks), [blocks])

  useEffect(() => {
    if (pending && pending.code === '') patch({ code: suggested })
  }, [pending, suggested, patch])

  if (!pending) {
    return (
      <PanelSection title="Block tool">
        <div className="space-y-2.5 text-[12.5px] leading-relaxed text-muted">
          <p>
            Drag a rectangle on the map to mark the block's boundary. Metre dimensions and area
            follow the cursor as you draw.
          </p>
          <ul className="space-y-1 text-[11.5px]">
            <li>
              <span className="font-mono text-ink">Shift</span> constrains to a square
            </li>
            <li>
              <span className="font-mono text-ink">Alt</span> draws out from the centre
            </li>
            <li>Release, then drag any corner to reshape or the handle above to rotate</li>
          </ul>
        </div>
      </PanelSection>
    )
  }

  const err = blockCodeError(pending.code, blocks)
  const w = distanceM(pending.polygon[0]!, pending.polygon[1]!)
  const h = distanceM(pending.polygon[1]!, pending.polygon[2]!)

  return (
    <PanelSection title="New block">
      <div className="space-y-3.5">
        <Readout>
          {w.toFixed(1)} × {h.toFixed(1)} m · {Math.round(areaSqm(pending.polygon)).toLocaleString()}{' '}
          m² · {pending.rotationDeg.toFixed(0)}°
        </Readout>

        <Field label="Block code" hint={`Suggested: ${suggested}. Must be unique at this location.`}>
          <Input
            value={pending.code}
            onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
            className="h-8 font-mono text-[13px]"
            placeholder={suggested}
          />
        </Field>
        {err && <DangerLine>{err}</DangerLine>}

        <Field label="Name (optional)">
          <Input
            value={pending.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="h-8 text-[13px]"
            placeholder="Garden of…"
          />
        </Field>

        <Field label="Default tier" hint="Pre-selects the grid's footprint on the next step.">
          <Select
            value={pending.defaultTierId ?? ''}
            onValueChange={(v) => patch({ defaultTierId: v as typeof pending.defaultTierId })}
          >
            <SelectTrigger className="h-8 w-full text-[13px]">
              <SelectValue placeholder="Choose a tier" />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setPending(null)}>
            Discard
          </Button>
          <Button
            className="flex-1 gap-1.5"
            disabled={!!err}
            onClick={() => {
              const id = commit()
              if (id) {
                toast.success(`Block ${pending.code} drafted`, {
                  description: 'Switched to the Grid tool — generate its lots next.',
                })
              }
            }}
          >
            <Icon icon={IconDrawBlock} size={14} />
            Create block
          </Button>
        </div>
        <p className="text-[11px] leading-snug text-muted">
          Creating the block switches straight to the Grid tool with it selected — drawing the
          boundary and filling it are one intention.
        </p>
      </div>
    </PanelSection>
  )
}
