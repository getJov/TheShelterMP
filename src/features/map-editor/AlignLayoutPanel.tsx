import { useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconBlock,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconGrid,
  IconMapEditor,
  IconMove,
  IconOverlay,
  IconRotate,
  IconTarget,
} from '@/components/ui-brand/icons'
import { areaSqm } from '@/lib/geo'
import { alignmentFrame, type AlignmentTarget } from './geometry-transform'
import { PanelSection, Readout, WarnLine } from './bits'
import { useEditor } from './store'

const TARGETS: {
  id: AlignmentTarget
  label: string
  icon: typeof IconTarget
  hint: string
}[] = [
  {
    id: 'layout',
    label: 'Layout',
    icon: IconMapEditor,
    hint: 'Move or rotate the layout; lot sizes stay tied to tiers.',
  },
  {
    id: 'block',
    label: 'Block',
    icon: IconBlock,
    hint: 'Move, resize or rotate the active block; lot footprints do not stretch.',
  },
  {
    id: 'lots',
    label: 'Lots',
    icon: IconGrid,
    hint: 'Move or rotate selected lots inside their current block.',
  },
  {
    id: 'overlay',
    label: 'Site plan',
    icon: IconOverlay,
    hint: 'Move, scale or rotate the uploaded reference image.',
  },
]

const fmtDeg = (n: number) => `${n.toFixed(0)} deg`
const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`

export function AlignLayoutPanel({ showTargetPicker = true }: { showTargetPicker?: boolean }) {
  const blocks = useEditor((s) => s.blocks)
  const lots = useEditor((s) => s.lots)
  const overlays = useEditor((s) => s.overlays)
  const selection = useEditor((s) => s.selection)
  const activeBlockId = useEditor((s) => s.activeBlockId)
  const activeOverlayId = useEditor((s) => s.activeOverlayId)
  const lockedOverlays = useEditor((s) => s.lockedOverlays)
  const target = useEditor((s) => s.alignmentTarget)
  const session = useEditor((s) => s.alignmentSession)
  const setTarget = useEditor((s) => s.setAlignmentTarget)
  const beginAlignment = useEditor((s) => s.beginAlignment)
  const previewAlignment = useEditor((s) => s.previewAlignment)
  const commitAlignment = useEditor((s) => s.commitAlignment)
  const cancelAlignment = useEditor((s) => s.cancelAlignment)
  const nudgeAlignmentMeters = useEditor((s) => s.nudgeAlignmentMeters)

  const draft = useMemo(() => ({ blocks, lots, overlays }), [blocks, lots, overlays])
  const currentSelection = useMemo(
    () => ({
      target,
      blockId: target === 'block' ? activeBlockId : null,
      lotIds: target === 'lots' ? [...selection] : [],
      overlayId: target === 'overlay' ? activeOverlayId : null,
    }),
    [activeBlockId, activeOverlayId, selection, target],
  )
  const frame = alignmentFrame(draft, session?.selection ?? currentSelection)
  const activeOverlay = overlays.find((o) => o.id === activeOverlayId) ?? null
  const hasLockedOverlay = target === 'overlay' && !!activeOverlay && lockedOverlays.has(activeOverlay.id)
  const canAlign = !!frame && !hasLockedOverlay

  const start = () => {
    if (beginAlignment()) return
    toast.error('Pick something to align first', {
      description: targetHelp(target, activeBlockId, selection.size, activeOverlay, hasLockedOverlay),
    })
  }

  const nudge = (eastM: number, northM: number) => {
    if (!nudgeAlignmentMeters(eastM, northM)) start()
  }

  const rotate = (degrees: number) => {
    if (!beginAlignment()) {
      start()
      return
    }
    const activeSession = useEditor.getState().alignmentSession
    if (!activeSession) {
      start()
      return
    }
    if (!previewAlignment({ rotationDeg: activeSession.transform.rotationDeg + degrees })) {
      start()
    }
  }

  return (
    <>
      <PanelSection title={alignmentPanelTitle(target)}>
        <div className="space-y-3.5">
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
            <span className="font-semibold text-ink">Business records stay unchanged.</span> This
            only moves the drawing on the map. Lot numbers, clients, contracts, burials, prices and
            statuses stay as they are.
          </div>

          {showTargetPicker && (
            <ToggleGroup
              type="single"
              value={target}
              onValueChange={(value) => value && setTarget(value as AlignmentTarget)}
              className="grid grid-cols-2 gap-2"
            >
              {TARGETS.map((item) => (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem
                      value={item.id}
                      aria-label={item.label}
                      className="h-12 justify-start gap-2 rounded-md border border-line px-2.5 data-[state=on]:border-gold data-[state=on]:bg-gold/12 data-[state=on]:text-gold-deep dark:data-[state=on]:text-gold"
                    >
                      <Icon icon={item.icon} size={16} />
                      <span className="text-[12.5px]">{item.label}</span>
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px] text-[12px]">
                    {item.hint}
                  </TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
          )}

          {frame ? (
            <Readout>
              {frame.label} · {Math.round(areaSqm(frame.polygon)).toLocaleString()} m2
              {session &&
                ` · moved ${session.transform.deltaLat || session.transform.deltaLng ? 'yes' : 'no'} · ${fmtDeg(session.transform.rotationDeg)} · W ${fmtPct(session.transform.scale * session.transform.scaleX)} · H ${fmtPct(session.transform.scale * session.transform.scaleY)}`}
            </Readout>
          ) : (
            <WarnLine>{targetHelp(target, activeBlockId, selection.size, activeOverlay, hasLockedOverlay)}</WarnLine>
          )}

          <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5">
            <span />
            <NudgeButton label="Nudge up" icon={IconChevronUp} onClick={() => nudge(0, 0.25)} />
            <span />
            <NudgeButton label="Nudge left" icon={IconChevronLeft} onClick={() => nudge(-0.25, 0)} />
            <Button
              variant="secondary"
              className="h-8 gap-1.5 text-[12px]"
              disabled={!canAlign}
              onClick={start}
            >
              <Icon icon={IconMove} size={14} />
              Move
            </Button>
            <NudgeButton label="Nudge right" icon={IconChevronRight} onClick={() => nudge(0.25, 0)} />
            <span />
            <NudgeButton label="Nudge down" icon={IconChevronDown} onClick={() => nudge(0, -0.25)} />
            <span />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-8 gap-1.5 text-[12px]"
              disabled={!canAlign}
              onClick={() => rotate(-1)}
            >
              <Icon icon={IconRotate} size={14} />
              Rotate left
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-8 gap-1.5 text-[12px]"
              disabled={!canAlign}
              onClick={() => rotate(1)}
            >
              <Icon icon={IconRotate} size={14} />
              Rotate right
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={!session}
              onClick={() => {
                cancelAlignment()
                toast.info('Alignment cancelled')
              }}
            >
              Cancel
            </Button>
            <Button
              className="gap-1.5"
              disabled={!session}
              onClick={() => {
                const result = commitAlignment()
                if (!result) return
                toast.success(`${result.label} saved to the draft`, {
                  description: 'Publish still controls what reaches the live map.',
                })
              }}
            >
              <Icon icon={IconRotate} size={14} />
              Save step
            </Button>
          </div>

          <p className="text-[11px] leading-snug text-muted">
            Drag the selected shape to move it. Use square handles for size and the round handle
            for rotation. Lots keep the size set by their tier.
          </p>
        </div>
      </PanelSection>
    </>
  )
}

function NudgeButton({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: typeof IconChevronUp
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="size-8"
          aria-label={label}
          onClick={onClick}
        >
          <Icon icon={icon} size={14} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function targetHelp(
  target: AlignmentTarget,
  activeBlockId: unknown,
  selectedLots: number,
  activeOverlay: { name: string } | null,
  hasLockedOverlay: boolean,
): string {
  if (target === 'layout') return 'Create at least one block before aligning the layout.'
  if (target === 'block' && !activeBlockId) return 'Choose a block from the list or click one on the map.'
  if (target === 'lots' && selectedLots === 0) return 'Select lots on the map, then choose Lots again.'
  if (target === 'overlay' && !activeOverlay) return 'Upload or select a site-plan overlay first.'
  if (target === 'overlay' && hasLockedOverlay) return 'Unlock the active site-plan overlay before aligning it.'
  return 'Pick a valid target to align.'
}

function alignmentPanelTitle(target: AlignmentTarget) {
  if (target === 'overlay') return 'Position site plan'
  if (target === 'block') return 'Position block'
  if (target === 'lots') return 'Position lots'
  return 'Position layout'
}
