import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import type { BlockId, LotStatus, TierId } from '@/domain'
import { Button } from '@/components/ui/button'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconClose,
  IconDelete,
  IconMove,
  IconNumbering,
  IconResize,
  IconWarning,
} from '@/components/ui-brand/icons'
import { NUMBERING, type Numbering } from '@/lib/grid-generator'
import { cn } from '@/lib/utils'
import { DangerLine, Field, NumberField, NumberingDiagram, WarnLine } from './bits'
import { useEditor } from './store'
import { protectedIn, STATUS_LABEL, useTiers } from './helpers'

const EASE = [0.22, 1, 0.36, 1] as const

type Sheet = null | 'status' | 'renumber' | 'move' | 'syncSize'

/**
 * Slides up the moment anything is selected. Change tier is the headline —
 * it is the half of the client's request that grid generation does not cover.
 */
export function BulkActionsBar() {
  const selection = useEditor((s) => s.selection)
  const lots = useEditor((s) => s.lots)
  const blocks = useEditor((s) => s.blocks)
  const clear = useEditor((s) => s.clearSelection)
  const changeTier = useEditor((s) => s.changeTier)
  const changeStatus = useEditor((s) => s.changeStatus)
  const renumberSelection = useEditor((s) => s.renumberSelection)
  const moveToBlock = useEditor((s) => s.moveToBlock)
  const setMoveTargetBlock = useEditor((s) => s.setMoveTargetBlock)
  const syncTierFootprints = useEditor((s) => s.syncTierFootprints)
  const deleteLots = useEditor((s) => s.deleteLots)
  const { tiers, byId } = useTiers()

  const [tierId, setTierId] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // status sheet
  const [status, setStatus] = useState<LotStatus>('not_for_sale')
  const [reason, setReason] = useState('')
  // renumber sheet
  const [scheme, setScheme] = useState<Numbering>('boustrophedon')
  const [start, setStart] = useState(1)
  // move sheet
  const [target, setTarget] = useState('')
  const ids = useMemo(() => [...selection], [selection])
  const guarded = protectedIn(lots, selection)
  const open = selection.size > 0

  useEffect(() => {
    setMoveTargetBlock(sheet === 'move' && target ? (target as BlockId) : null)
    return () => setMoveTargetBlock(null)
  }, [sheet, target, setMoveTargetBlock])

  const apply = () => {
    const tier = byId.get(tierId as TierId)
    if (!tier) return
    changeTier(ids, tier)
    toast.success(`${ids.length} lots changed to ${tier.name}`, {
      description:
        guarded.count > 0
          ? `${guarded.count} sold or occupied lots included — their contract prices are unaffected.`
          : 'Fill updated. Nothing is live until you publish.',
    })
  }

  const blockOf = (id: string) => blocks.find((b) => b.id === id)

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="pointer-events-auto absolute bottom-4 left-1/2 z-[620] w-[min(880px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-line bg-surface/95 shadow-xl backdrop-blur"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              <p className="font-display text-[17px] text-ink">
                {selection.size.toLocaleString()} lot{selection.size === 1 ? '' : 's'} selected
              </p>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Clear selection"
                onClick={clear}
              >
                <Icon icon={IconClose} size={15} />
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-3 px-4 py-3">
              <div className="min-w-[220px] flex-1">
                <Field label="Change tier">
                  <div className="flex gap-2">
                    <Select value={tierId} onValueChange={setTierId}>
                      <SelectTrigger className="h-9 flex-1 text-[13px]">
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
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button disabled={!tierId} onClick={apply}>
                      Apply to {selection.size.toLocaleString()}
                    </Button>
                  </div>
                </Field>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9 gap-1.5 text-[12.5px]"
                  onClick={() => setSheet('status')}
                >
                  Set status
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9 gap-1.5 text-[12.5px]"
                  onClick={() => setSheet('renumber')}
                >
                  <Icon icon={IconNumbering} size={14} />
                  Renumber
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9 gap-1.5 text-[12.5px]"
                  onClick={() => setSheet('move')}
                >
                  <Icon icon={IconMove} size={14} />
                  Move to block
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9 gap-1.5 text-[12.5px]"
                  onClick={() => setSheet('syncSize')}
                >
                  <Icon icon={IconResize} size={14} />
                  Sync size
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 gap-1.5 text-[12.5px] text-danger hover:bg-danger/10 hover:text-danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Icon icon={IconDelete} size={14} />
                  Delete
                </Button>
              </div>
            </div>

            {guarded.count > 0 && (
              <p className="flex items-start gap-1.5 border-t border-line bg-gold/8 px-4 py-2 text-[12px] leading-snug text-gold-deep dark:text-gold">
                <Icon icon={IconWarning} size={13} className="mt-px shrink-0" />
                <span>
                  {guarded.count} of these {guarded.count === 1 ? 'is' : 'are'} sold or occupied.
                  The tier will change; the price on their existing contracts will not — contracts
                  snapshot their price when they are written.
                </span>
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Set status ──────────────────────────────────────────── */}
      <Dialog open={sheet === 'status'} onOpenChange={(v) => !v && setSheet(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Set status on {selection.size} lots</DialogTitle>
            <DialogDescription>
              Only <em>Available</em> and <em>Not for sale</em> are reachable here. Sold and
              Occupied come from contracts and burials, never from a bulk edit.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={status}
            onValueChange={(v) => setStatus(v as LotStatus)}
            className="gap-2"
          >
            {(['available', 'not_for_sale'] as LotStatus[]).map((s) => (
              <label
                key={s}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5',
                  status === s ? 'border-gold bg-gold/8' : 'border-line hover:bg-surface-2',
                )}
              >
                <RadioGroupItem value={s} />
                <span className="text-[13.5px] text-ink">{STATUS_LABEL[s]}</span>
              </label>
            ))}
          </RadioGroup>
          {status === 'not_for_sale' && (
            <Field label="Reason" hint="Applied to every lot in the selection.">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Chapel easement, service road…"
                className="min-h-16 text-[13px]"
              />
            </Field>
          )}
          {guarded.count > 0 && (
            <WarnLine>
              {guarded.count} sold or occupied {guarded.count === 1 ? 'lot' : 'lots'} in the
              selection will be skipped — their status comes from a contract.
            </WarnLine>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSheet(null)}>
              Cancel
            </Button>
            <Button
              disabled={status === 'not_for_sale' && reason.trim().length === 0}
              onClick={() => {
                changeStatus(ids, status, status === 'not_for_sale' ? reason.trim() : null)
                setSheet(null)
                toast.success(`Status set to ${STATUS_LABEL[status]}`)
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Renumber ────────────────────────────────────────────── */}
      <Dialog open={sheet === 'renumber'} onOpenChange={(v) => !v && setSheet(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Renumber {selection.size} lots</DialogTitle>
            <DialogDescription>
              Numbers are reassigned by walking the selection in the chosen order.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={scheme}
            onValueChange={(v) => setScheme(v as Numbering)}
            className="gap-1.5"
          >
            {NUMBERING.map((n) => (
              <label
                key={n.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2',
                  scheme === n.id ? 'border-gold bg-gold/8' : 'border-line hover:bg-surface-2',
                )}
              >
                <RadioGroupItem value={n.id} />
                <NumberingDiagram scheme={n.id} />
                <span className="text-[13px] text-ink">{n.label}</span>
              </label>
            ))}
          </RadioGroup>
          <Field label="Start number">
            <NumberField value={start} min={1} max={99999} onChange={setStart} />
          </Field>
          <p className="font-mono text-[11.5px] text-muted tabular">
            {start} · {start + 1} · {start + 2} … {start + Math.max(0, selection.size - 1)}
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSheet(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                renumberSelection(ids, scheme, start)
                setSheet(null)
                toast.success(`${ids.length} lots renumbered from ${start}`)
              }}
            >
              Renumber
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Move to block ───────────────────────────────────────── */}
      <Dialog open={sheet === 'move'} onOpenChange={(v) => !v && setSheet(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Move {selection.size} lots</DialogTitle>
            <DialogDescription>
              The lots keep their position on the ground and are recoded into the target block's
              sequence.
            </DialogDescription>
          </DialogHeader>
          <Field label="Target block">
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="h-9 w-full text-[13px]">
                <SelectValue placeholder="Choose a block" />
              </SelectTrigger>
              <SelectContent>
                {blocks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.code}
                    {b.name ? ` · ${b.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {guarded.count > 0 && (
            <DangerLine>
              {guarded.count} sold or occupied {guarded.count === 1 ? 'lot' : 'lots'} cannot be
              moved and will be left where they are.
            </DangerLine>
          )}
          {target && (
            <WarnLine>
              The target block is highlighted on the map. Dropping sold or occupied lots into a
              different block is still blocked.
            </WarnLine>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSheet(null)}>
              Cancel
            </Button>
            <Button
              disabled={!target}
              onClick={() => {
                const refused = moveToBlock(ids, target as BlockId)
                setSheet(null)
                toast.success(
                  `${ids.length - refused.length} lots moved to ${blockOf(target)?.code ?? ''}`,
                  refused.length > 0
                    ? { description: `${refused.length} sold or occupied lots were left in place.` }
                    : undefined,
                )
              }}
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sync tier footprint ─────────────────────────────────── */}
      <Dialog open={sheet === 'syncSize'} onOpenChange={(v) => !v && setSheet(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Sync {selection.size} lot footprints</DialogTitle>
            <DialogDescription>
              Each selected lot is re-laid around its existing centre using the width and length
              from its current tier.
            </DialogDescription>
          </DialogHeader>
          {guarded.count > 0 && (
            <WarnLine>
              {guarded.count} sold or occupied {guarded.count === 1 ? 'lot' : 'lots'} will be
              resized visually only. Contracts, owners, burials and lot numbers stay unchanged.
            </WarnLine>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSheet(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const changed = syncTierFootprints(ids, byId)
                setSheet(null)
                toast.success(`${changed.length.toLocaleString()} lot footprints synced`, {
                  description: 'Publish will stay blocked if the sync created geometry conflicts.',
                })
              }}
            >
              Sync size
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete ──────────────────────────────────────────────── */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {guarded.count > 0
                ? 'Some of these lots cannot be deleted'
                : `Delete ${selection.size} lots?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {guarded.count > 0 ? (
                <>
                  {guarded.count} of the {selection.size} selected {guarded.count === 1 ? 'lot is' : 'lots are'}{' '}
                  sold or occupied and hold history that must not be destroyed:{' '}
                  <span className="font-mono">
                    {guarded.lots
                      .slice(0, 6)
                      .map((l) => `${blockOf(l.blockId)?.code ?? ''}-L${String(l.lotNumber).padStart(3, '0')}`)
                      .join(', ')}
                    {guarded.count > 6 && ` and ${guarded.count - 6} more`}
                  </span>
                  . Deselect them and try again.
                </>
              ) : (
                <>
                  This removes {selection.size} lots from the draft. Publish is what makes it real,
                  and undo will bring them back until then.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {guarded.count === 0 && (
              <AlertDialogAction
                onClick={() => {
                  deleteLots(ids)
                  toast.success(`${ids.length} lots deleted from the draft`)
                }}
              >
                Delete {selection.size} lots
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  )
}
