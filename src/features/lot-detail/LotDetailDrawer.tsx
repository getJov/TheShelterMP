import { useEffect, useMemo, useRef } from 'react'
import { useNavigationType, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Dialog as SheetPrimitive } from 'radix-ui'
import { formatLotCode, type LotId } from '@/domain'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { indexes, useDataset } from '@/stores/dataset'
import { useCurrentUserOrNull } from '@/lib/permissions'
import { lotVisibility } from '@/lib/permissions'
import { LOT_DRAWER_WIDTH } from '@/features/map/layout'
import { LotPanel } from './LotPanel'
import { useLotDetailUi, type SectionId } from './store'
import { EASE, useMediaQuery } from './bits'
import { cn } from '@/lib/utils'
import './lot-detail.css'

const DURATION = 0.32
const SECTION_PARAM: Record<string, SectionId> = {
  overview: 'contract',
  payments: 'payments',
  interments: 'interments',
}

/**
 * Spec 06 · the lot detail drawer.
 *
 * Built on the same Radix Dialog primitives shadcn's Sheet uses, but
 * NON-MODAL and with no overlay: the map stays visible and clickable behind
 * it so the client can walk straight from one lot to the next. The shell
 * stays mounted while `lotId` changes — only the CONTENT is keyed, so
 * switching lots crossfades rather than sliding out and back in.
 */
export function LotDetailDrawer({
  lotId,
  onClose,
}: {
  lotId: LotId | null
  onClose: () => void
}) {
  const version = useDataset((s) => s.version)
  const user = useCurrentUserOrNull()
  const [searchParams, setSearchParams] = useSearchParams()
  const expanded = useLotDetailUi((s) => s.expanded)
  const setExpanded = useLotDetailUi((s) => s.setExpanded)
  const listReturnFocus = useRef<HTMLElement | null>(null)

  const narrow = useMediaQuery('(max-width: 899px)')

  function closeAndRestoreListFocus() {
    const returnTarget = listReturnFocus.current
    onClose()
    if (!returnTarget) return
    window.requestAnimationFrame(() => {
      if (returnTarget.isConnected) returnTarget.focus()
      listReturnFocus.current = null
    })
  }

  const lot = useMemo(() => {
    void version
    return lotId ? (indexes().lotsById.get(lotId) ?? null) : null
  }, [lotId, version])

  const code = useMemo(() => {
    if (!lot) return null
    const block = indexes().blocksById.get(lot.blockId)
    return formatLotCode(block?.code ?? '??', lot.lotNumber)
  }, [lot])

  // A lot the user may not see at all must not open a panel.
  const visible = lot ? lotVisibility(user, lot) !== 'hidden' : false
  const open = Boolean(lot) && visible

  const focusSection = SECTION_PARAM[searchParams.get('drawer') ?? ''] ?? null

  // ── URL sync ───────────────────────────────────────────────────────
  // Opening pushes `?lot=B01-L047` so Back closes the drawer; switching lots
  // REPLACES, so a row of clicks does not bury the map under history.
  const urlLot = searchParams.get('lot')
  // Only ever clears a param this drawer wrote. A `?lot=` present on first
  // paint belongs to the map's deep link, which mounts a beat later inside
  // Leaflet — clearing it here would silently break every shared link.
  const owned = useRef(false)
  const prevUrlLot = useRef<string | null>(urlLot)

  useEffect(() => {
    if (open && code) {
      if ((urlLot ?? '').toLowerCase() !== code.toLowerCase()) {
        const next = new URLSearchParams(searchParams)
        next.set('lot', code)
        setSearchParams(next, { replace: owned.current })
      }
      owned.current = true
    } else {
      if (owned.current && urlLot !== null) {
        const next = new URLSearchParams(searchParams)
        next.delete('lot')
        setSearchParams(next, { replace: true })
      }
      owned.current = false
    }
  }, [open, code, urlLot, searchParams, setSearchParams])

  // Back button. Gated on a POP specifically: the map replaces `?lot=` while
  // it resolves a deep link, and a replace is not the user going back.
  const navigationType = useNavigationType()
  useEffect(() => {
    const prev = prevUrlLot.current
    prevUrlLot.current = urlLot
    if (open && navigationType === 'POP' && prev !== null && urlLot === null) onClose()
  }, [urlLot, open, navigationType, onClose])

  // Collapsing the expanded view when the drawer closes keeps the next open
  // predictable — nobody expects a dialog to greet them on the next click.
  useEffect(() => {
    if (!open && expanded) setExpanded(false)
  }, [open, expanded, setExpanded])

  const content = lot && (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={lot.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: EASE }}
        className="flex h-full min-h-0 flex-col"
      >
        <LotPanel
          lot={lot}
          variant={expanded ? 'dialog' : 'drawer'}
          focusSection={focusSection}
          onClose={closeAndRestoreListFocus}
          onToggleExpand={narrow ? undefined : () => setExpanded(!expanded)}
        />
      </motion.div>
    </AnimatePresence>
  )

  return (
    <>
      <SheetPrimitive.Root
        open={open && !expanded}
        onOpenChange={(v) => {
          if (!v) closeAndRestoreListFocus()
        }}
        modal={false}
      >
        <AnimatePresence>
          {open && !expanded && (
            <SheetPrimitive.Content
              asChild
              forceMount
              aria-describedby={undefined}
              // The map must keep taking clicks — an outside pointer down is
              // the user picking the NEXT lot, never a request to close.
              onOpenAutoFocus={(event) => {
                const active = document.activeElement
                if (active instanceof HTMLElement && active.dataset.lotListAction === 'true') {
                  listReturnFocus.current = active
                  return
                }
                event.preventDefault()
              }}
              onCloseAutoFocus={(event) => {
                if (!listReturnFocus.current) return
                event.preventDefault()
                if (listReturnFocus.current.isConnected) listReturnFocus.current.focus()
                listReturnFocus.current = null
              }}
              onPointerDownOutside={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
              onFocusOutside={(e) => e.preventDefault()}
            >
              <motion.aside
                key="lot-drawer"
                initial={narrow ? { y: 32, opacity: 0 } : { x: 32, opacity: 0 }}
                animate={narrow ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
                exit={narrow ? { y: 32, opacity: 0 } : { x: 32, opacity: 0 }}
                transition={{ duration: DURATION, ease: EASE }}
                style={narrow ? undefined : { width: LOT_DRAWER_WIDTH }}
                className={cn(
                  'absolute z-[650] flex flex-col overflow-hidden bg-surface shadow-2xl',
                  narrow
                    ? 'inset-x-0 bottom-0 h-[85vh] rounded-t-2xl border-t border-line'
                    : 'right-0 top-0 h-full border-l border-line',
                )}
              >
                <SheetPrimitive.Title className="sr-only">
                  {code ? `Lot ${code} detail` : 'Lot detail'}
                </SheetPrimitive.Title>

                {narrow && (
                  <div className="flex shrink-0 justify-center pt-2 pb-1">
                    <span className="h-1 w-10 rounded-full bg-line" />
                  </div>
                )}

                {content}
              </motion.aside>
            </SheetPrimitive.Content>
          )}
        </AnimatePresence>
      </SheetPrimitive.Root>

      {/* The expand control promotes the same content to a centred dialog. */}
      <Dialog open={open && expanded} onOpenChange={(v) => setExpanded(v)}>
        <DialogContent
          showCloseButton={false}
          className="h-[86vh] max-w-[900px] gap-0 overflow-hidden p-0 sm:max-w-[900px]"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {code ? `Lot ${code} detail` : 'Lot detail'}
          </DialogTitle>
          {content}
        </DialogContent>
      </Dialog>
    </>
  )
}
