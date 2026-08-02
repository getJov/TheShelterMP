import { Icon } from '@/components/ui-brand/Icon'
import {
  IconBlock,
  IconCheck,
  IconGrid,
  IconMap,
  IconOverlay,
  IconRuler,
} from '@/components/ui-brand/icons'
import { cn } from '@/lib/utils'
import { useChangeReport, useLayoutValidation } from './helpers'
import { useEditor, type EditorLayerMode } from './store'

const STEPS: {
  id: EditorLayerMode
  label: string
  plainAction: string
  hint: string
  icon: typeof IconMap
}[] = [
  {
    id: 'baseMap',
    label: 'Map reference',
    plainAction: 'Choose the background map',
    hint: 'Pan, zoom, and compare the cemetery layout against the base map.',
    icon: IconMap,
  },
  {
    id: 'sitePlan',
    label: 'Site plan',
    plainAction: 'Place the uploaded plan',
    hint: 'Upload or select the reference image, then move, resize, and rotate it.',
    icon: IconOverlay,
  },
  {
    id: 'blocks',
    label: 'Blocks',
    plainAction: 'Adjust cemetery sections',
    hint: 'Pick one block at a time, then move, resize, rotate, or rearrange lots.',
    icon: IconBlock,
  },
  {
    id: 'lots',
    label: 'Lots',
    plainAction: 'Arrange lot positions',
    hint: 'Select lots inside the current block and place them where they belong.',
    icon: IconGrid,
  },
  {
    id: 'tiers',
    label: 'Tiers',
    plainAction: 'Set lot types',
    hint: 'Paint or apply lot tiers. Tier size controls the visual lot footprint.',
    icon: IconRuler,
  },
  {
    id: 'review',
    label: 'Review',
    plainAction: 'Fix issues and publish',
    hint: 'Check layout issues, review staged changes, then publish when valid.',
    icon: IconCheck,
  },
]

export function GuidedWorkflowPanel() {
  const layerMode = useEditor((s) => s.layerMode)
  const setLayerMode = useEditor((s) => s.setLayerMode)
  const blocks = useEditor((s) => s.blocks)
  const lots = useEditor((s) => s.lots)
  const overlays = useEditor((s) => s.overlays)
  const tierPaintTierId = useEditor((s) => s.tierPaintTierId)
  const validation = useLayoutValidation()
  const report = useChangeReport()

  return (
    <section className="border-b border-line px-3.5 py-3.5">
      <div className="mb-3">
        <p className="text-caption font-semibold text-ink">Layout setup</p>
        <p className="mt-0.5 text-caption leading-snug text-muted">
          Work from top to bottom. Use Advanced only when the normal step does not cover the job.
        </p>
      </div>

      <ol className="space-y-1.5">
        {STEPS.map((step, index) => {
          const active = step.id === layerMode
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => setLayerMode(step.id)}
                aria-label={`Open ${step.label} step`}
                className={cn(
                  'flex min-h-10 w-full items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'border-gold bg-gold/10 text-ink'
                    : 'border-line bg-surface hover:bg-surface-2',
                )}
                aria-current={active ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border font-mono text-micro font-semibold tabular',
                    active
                      ? 'border-gold bg-gold text-black'
                      : 'border-line bg-surface-2 text-muted',
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-caption font-semibold text-ink">
                    <Icon icon={step.icon} size={13} className="text-muted" />
                    {step.label}
                  </span>
                  <span className="mt-0.5 block text-micro leading-snug text-muted">
                    {active ? step.hint : step.plainAction}
                  </span>
                </span>
                <span className="mt-0.5 shrink-0 text-right font-mono text-micro text-muted">
                  {stepStatus(step.id, {
                    blocks: blocks.length,
                    lots: lots.length,
                    overlays: overlays.length,
                    tierPaintTierId,
                    blockingCount: validation.blockingCount,
                    canPublish: validation.canPublish,
                    changes: report.total,
                  })}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function stepStatus(
  id: EditorLayerMode,
  state: {
    blocks: number
    lots: number
    overlays: number
    tierPaintTierId: unknown
    blockingCount: number
    canPublish: boolean
    changes: number
  },
) {
  if (id === 'baseMap') return 'view'
  if (id === 'sitePlan') return state.overlays > 0 ? `${state.overlays}` : 'optional'
  if (id === 'blocks') return state.blocks.toLocaleString()
  if (id === 'lots') return state.lots.toLocaleString()
  if (id === 'tiers') return state.tierPaintTierId ? 'paint' : 'choose'
  if (!state.canPublish) return `${state.blockingCount.toLocaleString()} issues`
  return state.changes > 0 ? `${state.changes.toLocaleString()} changes` : 'ready'
}
