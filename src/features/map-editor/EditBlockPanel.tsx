import { useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Icon } from '@/components/ui-brand/Icon'
import { IconBlock, IconMove } from '@/components/ui-brand/icons'
import { areaSqm } from '@/lib/geo'
import { distanceM, isProtected } from '@/lib/grid-generator'
import { PanelSection, Readout, WarnLine } from './bits'
import { useEditor } from './store'

const fmtM = (m: number) => `${m.toFixed(1)} m`

export function EditBlockPanel() {
  const blocks = useEditor((s) => s.blocks)
  const lots = useEditor((s) => s.lots)
  const activeBlockId = useEditor((s) => s.activeBlockId)
  const editing = useEditor((s) => s.editingBlock)
  const startBlockEdit = useEditor((s) => s.startBlockEdit)
  const patchEditingBlock = useEditor((s) => s.patchEditingBlock)
  const cancelBlockEdit = useEditor((s) => s.cancelBlockEdit)
  const commitBlockEdit = useEditor((s) => s.commitBlockEdit)

  const block = blocks.find((b) => b.id === (editing?.id ?? activeBlockId)) ?? null
  const inBlock = useMemo(
    () => (block ? lots.filter((l) => l.blockId === block.id) : []),
    [block, lots],
  )
  const protectedCount = inBlock.filter(isProtected).length
  const unsoldCount = inBlock.length - protectedCount

  if (!block) {
    return (
      <PanelSection title="Edit block">
        <p className="text-caption leading-relaxed text-muted">
          Choose a block from the block list or click a lot inside a block to show its move,
          resize and rotate handles.
        </p>
      </PanelSection>
    )
  }

  if (!editing) {
    return (
      <PanelSection title={`Edit block — ${block.code}`}>
        <div className="space-y-3">
          <p className="text-caption leading-relaxed text-muted">
            Start editing to drag the block, reshape its corners, or rotate it with a map handle.
          </p>
          <Button className="w-full gap-1.5" onClick={() => startBlockEdit(block.id)}>
            <Icon icon={IconBlock} size={14} />
            Edit {block.code}
          </Button>
        </div>
      </PanelSection>
    )
  }

  const widthM = distanceM(editing.polygon[0]!, editing.polygon[1]!)
  const lengthM = distanceM(editing.polygon[1]!, editing.polygon[2]!)

  return (
    <PanelSection title={`Edit block — ${block.code}`}>
      <div className="space-y-3.5">
        <Readout>
          {fmtM(widthM)} × {fmtM(lengthM)} · {Math.round(areaSqm(editing.polygon)).toLocaleString()}{' '}
          m² · {editing.rotationDeg.toFixed(0)}°
        </Readout>

        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-caption leading-relaxed text-muted">
          Drag inside the block to move it. Drag a corner to reshape it. Drag the round handle to
          rotate it. Save commits one undoable draft change; Publish still makes it live.
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2">
          <Label htmlFor="move-lots-with-block" className="text-caption font-medium text-ink">
            Move unsold lots with block
            <span className="mt-0.5 block text-micro font-normal leading-snug text-muted">
              {unsoldCount.toLocaleString()} unsold lot{unsoldCount === 1 ? '' : 's'} can follow
              this shape.
            </span>
          </Label>
          <Switch
            id="move-lots-with-block"
            checked={editing.moveLots}
            disabled={unsoldCount === 0}
            onCheckedChange={(moveLots) => patchEditingBlock({ moveLots })}
          />
        </div>

        {!editing.moveLots && inBlock.length > 0 && (
          <WarnLine>
            Only the block boundary changes. Existing lots stay exactly where they are.
          </WarnLine>
        )}

        {editing.moveLots && protectedCount > 0 && (
          <WarnLine>
            {protectedCount} sold or occupied lot{protectedCount === 1 ? '' : 's'} will stay fixed.
            They are never moved or reshaped from block editing.
          </WarnLine>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              cancelBlockEdit()
              toast.info(`Cancelled edit for ${block.code}`)
            }}
          >
            Cancel
          </Button>
          <Button
            className="gap-1.5"
            onClick={() => {
              const result = commitBlockEdit()
              if (!result) return
              const details = editing.moveLots
                ? [
                    `${result.movedLots.toLocaleString()} unsold lot${result.movedLots === 1 ? '' : 's'} moved`,
                    result.protectedLots > 0
                      ? `${result.protectedLots.toLocaleString()} protected lot${result.protectedLots === 1 ? '' : 's'} left fixed`
                      : null,
                  ].filter(Boolean)
                : ['Lots left in place']
              toast.success(`${block.code} updated in the draft`, {
                description: details.join(' · '),
              })
            }}
          >
            <Icon icon={IconMove} size={14} />
            Save changes
          </Button>
        </div>
      </div>
    </PanelSection>
  )
}
