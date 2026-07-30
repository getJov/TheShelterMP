import { useCallback, useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
import { Icon } from '@/components/ui-brand/Icon'
import { IconDrawBlock, IconOverlay, IconPublish, IconRedo, IconUndo } from '@/components/ui-brand/icons'
import { useActiveLocation } from '@/lib/permissions'
import { useSession } from '@/stores/session'
import { EditorCanvas, type CanvasHandle } from './EditorCanvas'
import { Sidebar } from './Sidebar'
import { BulkActionsBar } from './BulkActionsBar'
import { PublishDialog } from './PublishDialog'
import { useChangeReport, useLayoutValidation } from './helpers'
import { TOOL_KEYS, useEditor, lotsOfBlock } from './store'

function layerTitle(layerMode: ReturnType<typeof useEditor.getState>['layerMode'], editorMode: ReturnType<typeof useEditor.getState>['editorMode']) {
  if (layerMode === 'baseMap') return 'Map reference'
  if (layerMode === 'sitePlan') return 'Site plan'
  if (layerMode === 'blocks') return 'Blocks'
  if (layerMode === 'lots') return 'Lots'
  if (layerMode === 'tiers') return 'Tiers'
  if (layerMode === 'review') return 'Review'
  return editorMode === 'align' ? 'Align Layout' : 'Advanced Inventory'
}

export default function MapEditorPage() {
  const activeLocationId = useSession((s) => s.activeLocationId)
  const location = useActiveLocation()

  const hydrate = useEditor((s) => s.hydrate)
  const dirty = useEditor((s) => s.dirty)
  const blocks = useEditor((s) => s.blocks)
  const editorMode = useEditor((s) => s.editorMode)
  const layerMode = useEditor((s) => s.layerMode)
  const undoDepth = useEditor((s) => s.undoStack.length)
  const redoDepth = useEditor((s) => s.redoStack.length)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const discard = useEditor((s) => s.discard)
  const setTool = useEditor((s) => s.setTool)
  const setLayerMode = useEditor((s) => s.setLayerMode)

  const [canvas, setCanvas] = useState<CanvasHandle | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const report = useChangeReport()
  const validation = useLayoutValidation()

  useEffect(() => {
    hydrate(activeLocationId)
  }, [hydrate, activeLocationId])

  // ── leaving with unsaved work ─────────────────────────────────────
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        dirty && currentLocation.pathname !== nextLocation.pathname,
      [dirty],
    ),
  )

  // ── keyboard ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
      ) {
        return
      }
      const mod = e.metaKey || e.ctrlKey
      const s = useEditor.getState()

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        s.setSelection(lotsOfBlock(s.lots, s.activeBlockId).map((l) => l.id))
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!validation.canPublish) {
          setLayerMode('review')
          return
        }
        if (report.total > 0) setPublishOpen(true)
        return
      }
      if (mod) return

      if (e.key === 'Escape') {
        s.clearSelection()
        s.setPendingBlock(null)
        s.cancelBlockEdit()
        s.cancelAlignment()
        return
      }
      if (s.editorMode === 'align' && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 1 : 0.25
        if (e.key === 'ArrowUp') s.nudgeAlignmentMeters(0, step)
        if (e.key === 'ArrowDown') s.nudgeAlignmentMeters(0, -step)
        if (e.key === 'ArrowLeft') s.nudgeAlignmentMeters(-step, 0)
        if (e.key === 'ArrowRight') s.nudgeAlignmentMeters(step, 0)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection.size > 0) {
        e.preventDefault()
        const ids = [...s.selection]
        const before = s.lots.length
        s.deleteLots(ids)
        const removed = before - useEditor.getState().lots.length
        if (removed < ids.length) {
          toast.warning(`${ids.length - removed} lots were kept`, {
            description: 'Sold or occupied lots cannot be deleted.',
          })
        }
        return
      }
      const tool = TOOL_KEYS[e.key.toLowerCase()]
      if (tool) setTool(tool)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, setTool, setLayerMode, validation.canPublish, report.total])

  const onReady = useCallback((h: CanvasHandle) => setCanvas(h), [])
  const empty = blocks.length === 0

  return (
    // `isolate` keeps the editor's z-index ladder (canvas 450 → chrome 640) in
    // its own stacking context, so portalled dialogs and menus stay on top.
    <div className="isolate flex h-full w-full overflow-hidden">
      <Sidebar canvas={canvas} />

      <div className="relative min-w-0 flex-1">
        <header className="absolute inset-x-0 top-0 z-[640] flex items-center justify-between gap-3 border-b border-line bg-surface/92 px-4 py-2.5 backdrop-blur">
          <div className="min-w-0">
            <p className="eyebrow text-gold-deep dark:text-gold">Map editor</p>
            <h1 className="truncate font-display text-[19px] font-semibold leading-tight text-ink">
              {location?.name ?? 'All locations'} ·{' '}
              {layerTitle(layerMode, editorMode)}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={undoDepth === 0}
                  onClick={undo}
                  aria-label="Undo"
                >
                  <Icon icon={IconUndo} size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Undo · ⌘Z · {undoDepth} steps</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={redoDepth === 0}
                  onClick={redo}
                  aria-label="Redo"
                >
                  <Icon icon={IconRedo} size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Redo · ⌘⇧Z</TooltipContent>
            </Tooltip>

            <Button
              variant="secondary"
              size="sm"
              className="h-8 text-[12.5px]"
              disabled={!dirty}
              onClick={() => setDiscardOpen(true)}
            >
              Discard
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-[12.5px]"
              disabled={validation.canPublish && report.total === 0}
              onClick={() => {
                if (!validation.canPublish) {
                  setLayerMode('review')
                  return
                }
                setPublishOpen(true)
              }}
            >
              <Icon icon={IconPublish} size={14} />
              {!validation.canPublish
                ? `Review ${validation.blockingCount} issue${validation.blockingCount === 1 ? '' : 's'}`
                : report.total === 0
                ? 'Nothing to publish'
                : `Publish ${report.total} change${report.total === 1 ? '' : 's'}`}
            </Button>
          </div>
        </header>

        <div className="absolute inset-0 top-[57px]">
          <EditorCanvas onReady={onReady} />
          {editorMode === 'inventory' && <BulkActionsBar />}

          {empty && (
            <div className="pointer-events-none absolute inset-0 z-[630] grid place-items-center">
              <div className="pointer-events-auto max-w-[420px] rounded-xl border border-line bg-surface/95 px-7 py-7 text-center shadow-xl backdrop-blur">
                <div className="mx-auto mb-4 grid size-11 place-items-center rounded-full border border-line bg-surface-2 text-muted">
                  <Icon icon={IconDrawBlock} size={19} />
                </div>
                <p className="font-display text-[21px] text-ink">No park layout yet</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  Start by drawing your first block. Its lots are generated inside it in the next
                  step.
                </p>
                <Button className="mt-5 gap-1.5" onClick={() => setTool('block')}>
                  <Icon icon={IconDrawBlock} size={15} />
                  Draw a block
                </Button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-muted">
                  <Icon icon={IconOverlay} size={13} />
                  A site plan can be placed underneath first — Overlay tool, or press O.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        report={report}
        validation={validation}
      />

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard {report.total} staged changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft reverts to what is on the live map right now. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                discard()
                toast.success('Draft discarded')
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(v) => {
          if (!v) blocker.reset?.()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unpublished changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {report.total} change{report.total === 1 ? '' : 's'} are staged and have not reached
              the live map. They are kept in this session, but publishing is what makes them real.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay here</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
