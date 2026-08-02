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
import { IconDrawBlock, IconPublish, IconRedo, IconUndo } from '@/components/ui-brand/icons'
import { useActiveLocation } from '@/lib/permissions'
import { useDataset } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import { EditorCanvas, type CanvasHandle } from './EditorCanvas'
import { Sidebar } from './Sidebar'
import { PublishDialog } from './PublishDialog'
import { useChangeReport, useLayoutValidation } from './helpers'
import { TOOL_KEYS, useEditor, lotsOfBlock } from './store'

declare global {
  interface Window {
    /** Devtools export: dumps the draft layout JSON (also copied to clipboard). */
    getpropsie?: () => string
  }
}

export default function MapEditorPage() {
  const activeLocationId = useSession((s) => s.activeLocationId)
  const datasetVersion = useDataset((s) => s.version)
  const location = useActiveLocation()

  const hydrate = useEditor((s) => s.hydrate)
  const dirty = useEditor((s) => s.dirty)
  const blocks = useEditor((s) => s.blocks)
  const undoDepth = useEditor((s) => s.undoStack.length)
  const redoDepth = useEditor((s) => s.redoStack.length)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const discard = useEditor((s) => s.discard)
  const setTool = useEditor((s) => s.setTool)
  const tool = useEditor((s) => s.tool)
  const pendingBlock = useEditor((s) => s.pendingBlock)

  const [canvas, setCanvas] = useState<CanvasHandle | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const report = useChangeReport()
  const validation = useLayoutValidation()

  useEffect(() => {
    // datasetVersion keeps a clean draft in step with the live dataset; the
    // store ignores this call while the draft is dirty.
    hydrate(activeLocationId)
  }, [hydrate, activeLocationId, datasetVersion])

  // Devtools export for hand-tuned layouts: paste the JSON back to seed the
  // demo default (see src/mock/park-layout.ts).
  useEffect(() => {
    window.getpropsie = () => {
      const s = useEditor.getState()
      const layout = {
        blocks: s.blocks,
        lots: s.lots.map((l) => ({
          ...l,
          // Geometry only — business state is reseeded deterministically.
          status: 'available' as const,
          activeHoldId: null,
          currentContractId: null,
          currentOwnerClientId: null,
          intermentCount: 0,
          notForSaleReason: null,
        })),
        overlays: s.overlays,
      }
      const json = JSON.stringify(layout, null, 2)
      console.log(json)
      navigator.clipboard?.writeText(json).catch(() => {})
      return `getpropsie: ${s.blocks.length} blocks · ${s.lots.length} lots — JSON logged above and copied to the clipboard`
    }
    return () => {
      delete window.getpropsie
    }
  }, [])

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
      // Direct per-lot positioning: arrows nudge, [ ] rotate the selection.
      if (
        s.editorMode === 'inventory' &&
        s.selection.size > 0 &&
        (e.key.startsWith('Arrow') || e.key === '[' || e.key === ']')
      ) {
        e.preventDefault()
        const ids = [...s.selection]
        if (e.key === '[' || e.key === ']') {
          const deg = (e.shiftKey ? 5 : 0.5) * (e.key === '[' ? -1 : 1)
          s.transformLots(ids, { rotateDeg: deg })
          return
        }
        const step = e.altKey ? 0.05 : e.shiftKey ? 1 : 0.25
        if (e.key === 'ArrowUp') s.transformLots(ids, { northM: step })
        if (e.key === 'ArrowDown') s.transformLots(ids, { northM: -step })
        if (e.key === 'ArrowLeft') s.transformLots(ids, { eastM: -step })
        if (e.key === 'ArrowRight') s.transformLots(ids, { eastM: step })
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
  }, [undo, redo, setTool, report.total])

  const onReady = useCallback((h: CanvasHandle) => setCanvas(h), [])
  const empty = blocks.length === 0

  return (
    // `isolate` keeps the editor's z-index ladder (canvas 450 → chrome 640) in
    // its own stacking context, so portalled dialogs and menus stay on top.
    <div className="isolate flex h-full w-full overflow-hidden">
      <Sidebar canvas={canvas} />

      <div className="relative min-w-0 flex-1">
        <header className="absolute inset-x-0 top-0 z-[640] flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface/92 px-4 py-2.5 backdrop-blur">
          <div className="min-w-0">
            <p className="eyebrow text-gold-deep dark:text-gold">Map editor</p>
            <h1 className="break-words font-display text-small-title font-semibold leading-tight text-ink">
              {location?.name ?? 'All locations'} · Blocks &amp; lots
            </h1>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-1.5 xl:w-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-10"
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
                  className="size-10"
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
              className="text-caption"
              disabled={!dirty}
              onClick={() => setDiscardOpen(true)}
            >
              Discard
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-caption"
              disabled={report.total === 0}
              onClick={() => setPublishOpen(true)}
            >
              <Icon icon={IconPublish} size={14} />
              {report.total === 0
                ? 'Nothing to publish'
                : `Publish ${report.total} change${report.total === 1 ? '' : 's'}${
                    validation.blockingCount > 0
                      ? ` · ${validation.blockingCount} warning${validation.blockingCount === 1 ? '' : 's'}`
                      : ''
                  }`}
            </Button>
          </div>
        </header>

        <div className="absolute inset-0 top-[120px] xl:top-[65px]">
          <EditorCanvas onReady={onReady} />

          {/* Slim, out-of-the-way hint — gone the moment a tool is armed or a
              shape is in progress, so it never blocks drawing on the map. */}
          {empty && tool === 'select' && !pendingBlock && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-[630] flex justify-center">
              <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-line bg-surface/95 py-1.5 pl-4 pr-1.5 shadow-lg backdrop-blur">
                <p className="text-caption text-muted">No layout yet</p>
                <Button
                  size="sm"
                  className="gap-1.5 rounded-full text-caption"
                  onClick={() => setTool('block')}
                >
                  <Icon icon={IconDrawBlock} size={13} />
                  Draw a block
                </Button>
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
