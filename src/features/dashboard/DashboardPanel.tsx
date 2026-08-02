import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconChevronLeft,
  IconChevronRight,
  IconDashboard,
  IconMap,
} from '@/components/ui-brand/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { NOW, TODAY } from '@/mock'
import { fmtDateLong } from '@/lib/dates'
import { useCurrentUserOrNull } from '@/lib/permissions'
import { useDataset } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import { usePanel, type PanelState } from '@/stores/panel'
import { useMapStore } from '@/stores/map'
import {
  DASHBOARD_MAP_STRIP_HEIGHT,
  DASHBOARD_PANEL_WIDTH,
  DASHBOARD_RAIL_WIDTH,
  PANEL_TRANSITION,
} from './constants'
import { CardGrid } from './CardGrid'
import { PeriodSelector } from './PeriodSelector'
import { selectAttentionCount } from './selectors'

export interface DashboardPanelProps {
  /**
   * Fired when a state transition finishes. Spec 05 passes
   * `() => map.invalidateSize()` — on animation complete, never on a timeout.
   */
  onStateSettled?: (state: PanelState) => void
  className?: string
}

/**
 * Three states over ONE persistent map.
 *
 * Nothing in here mounts or unmounts the map: `hidden` and `docked` change
 * this element's width in the same frame the map animates its own, and `full`
 * lifts the dashboard into an overlay that leaves the bottom strip of the
 * live map showing.
 */
export function DashboardPanel({ onStateSettled, className }: DashboardPanelProps) {
  const state = usePanel((s) => s.state)
  const cycle = usePanel((s) => s.cycle)
  const setState = usePanel((s) => s.set)
  const reduced = useReducedMotion()

  useKeyboardCycle(cycle)
  useReserveMapWidth(state)

  const transition = reduced
    ? { duration: 0 }
    : { duration: PANEL_TRANSITION.duration, ease: PANEL_TRANSITION.ease }

  const width =
    state === 'hidden'
      ? DASHBOARD_RAIL_WIDTH
      : state === 'docked'
        ? DASHBOARD_PANEL_WIDTH
        : 0

  return (
    <>
      <motion.aside
        layout
        initial={false}
        animate={{ width }}
        transition={transition}
        // 'full' settles when the overlay lands, not when this rail collapses.
        onAnimationComplete={() => state !== 'full' && onStateSettled?.(state)}
        className={cn(
          'pointer-events-auto relative z-20 flex h-full shrink-0 flex-col overflow-hidden border-l border-line bg-surface',
          state === 'full' && 'border-l-0',
          className,
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {state === 'hidden' && (
            <motion.div
              key="rail"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.18 }}
              className="h-full"
            >
              <PanelRail onOpen={() => setState('docked')} />
            </motion.div>
          )}
          {state === 'docked' && (
            <motion.div
              key="docked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.06 }}
              className="flex h-full flex-col"
              style={{ width: DASHBOARD_PANEL_WIDTH }}
            >
              <DockedPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>

      <AnimatePresence>
        {state === 'full' && (
          <FullDashboard
            key="full"
            reduced={!!reduced}
            onSettled={() => onStateSettled?.('full')}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ── keyboard ─────────────────────────────────────────────────────────
function useKeyboardCycle(cycle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      if (e.key.toLowerCase() !== 'd') return
      e.preventDefault()
      cycle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycle])
}

/**
 * The map keeps DASHBOARD_PANEL_WIDTH of the viewport clear when the panel is
 * docked, so a fitted park is never half-hidden behind it. Spec 05 exposes
 * the flag; we own keeping it true.
 */
function useReserveMapWidth(state: PanelState) {
  const setOpen = useMapStore((s) => s.setDashboardPanelOpen)
  useEffect(() => {
    setOpen(state === 'docked')
    return () => setOpen(false)
  }, [state, setOpen])
}

// ── attention count ──────────────────────────────────────────────────
function useAttentionCount(): number {
  const user = useCurrentUserOrNull()
  const locationId = useSession((s) => s.activeLocationId)
  const version = useDataset((s) => s.version)
  const period = usePanel((s) => s.period)
  if (!user) return 0
  return selectAttentionCount({ version, user, locationId, period, agentId: null })
}

// ── hidden state — the rail ──────────────────────────────────────────
/**
 * The dot is what makes anyone open the panel again; without it, hidden
 * means forgotten.
 */
function PanelRail({ onOpen }: { onOpen: () => void }) {
  const count = useAttentionCount()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open dashboard"
          className="group flex h-full w-9 flex-col items-center gap-3 py-3 transition-colors hover:bg-surface-2"
        >
          <span className="relative grid size-6 place-items-center text-muted transition-colors group-hover:text-ink">
            <Icon icon={IconDashboard} size={17} />
            {count > 0 && (
              <span
                className="absolute -right-1 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-danger px-[3px] text-micro font-bold leading-none text-white tabular"
                aria-label={`${count} items need attention`}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </span>

          <span
            className="eyebrow flex-1 text-muted transition-colors group-hover:text-ink"
            style={{ writingMode: 'vertical-rl' }}
          >
            Dashboard
          </span>

          <Icon
            icon={IconChevronLeft}
            size={15}
            className="text-muted transition-colors group-hover:text-ink"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        Open dashboard <kbd className="ml-1 font-mono text-micro">⌘D</kbd>
      </TooltipContent>
    </Tooltip>
  )
}

// ── docked state ─────────────────────────────────────────────────────
function DockedPanel() {
  const cycle = usePanel((s) => s.cycle)
  const setState = usePanel((s) => s.set)
  const period = usePanel((s) => s.period)
  const scope = useLocationScopeLabel()

  return (
    <>
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-line px-3.5 py-2">
        <button
          type="button"
          onClick={() => setState('hidden')}
          aria-label="Hide dashboard"
          className="grid size-10 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Icon icon={IconChevronRight} size={16} />
        </button>

        <div className="min-w-0 flex-1">
          <h2 className="font-display text-small-title font-semibold leading-tight text-ink">
            Dashboard
          </h2>
          {/* An unlabelled scoped number is how a manager's report becomes
              the whole business in the retelling. Name the scope. */}
          <p className="text-caption leading-tight text-muted">
            {scope} · {periodLabel(period)}
          </p>
        </div>

        <button
          type="button"
          onClick={cycle}
          aria-label="Expand dashboard"
          className="min-h-10 shrink-0 rounded px-2 py-1 text-control font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Expand
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <CardGrid layout="docked" />
      </div>
    </>
  )
}

// ── full state ───────────────────────────────────────────────────────
function FullDashboard({
  reduced,
  onSettled,
}: {
  reduced: boolean
  onSettled: () => void
}) {
  const setState = usePanel((s) => s.set)
  const collapse = usePanel((s) => s.collapse)

  return (
    <>
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
        transition={{
          duration: reduced ? 0 : PANEL_TRANSITION.duration,
          ease: PANEL_TRANSITION.ease,
        }}
        onAnimationComplete={onSettled}
        className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex flex-col bg-bg"
        style={{ bottom: DASHBOARD_MAP_STRIP_HEIGHT }}
      >
        <DashboardHeader
          action={
            <button
              type="button"
              onClick={collapse}
              className="flex min-h-10 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-control text-muted transition-colors hover:text-ink"
            >
              <Icon icon={IconChevronRight} size={14} />
              Back to the map
            </button>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <CardGrid layout="full" />
        </div>
      </motion.div>

      {/* The map does not unmount — it is right underneath, still live.
          Clicking the strip returns to docked. */}
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0 : 0.24 }}
        onClick={() => setState('docked')}
        aria-label="Return to the map"
        className="group pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex items-end justify-center border-t border-line pb-3"
        style={{ height: DASHBOARD_MAP_STRIP_HEIGHT }}
      >
        <span className="pointer-events-none flex items-center gap-1.5 rounded-full border border-line bg-surface/92 px-3 py-1.5 text-caption text-muted shadow-[0_2px_12px_-6px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-colors group-hover:text-ink">
          <Icon icon={IconMap} size={14} />
          Click the map to return
        </span>
      </motion.button>
    </>
  )
}

/** Shared by the full state and the standalone /dashboard route. */
export function DashboardHeader({ action }: { action?: ReactNode }) {
  const user = useCurrentUserOrNull()
  const scope = useLocationScopeLabel()
  const first = user?.fullName.split(' ')[0] ?? ''

  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-5 pb-4 pt-5">
      <div className="min-w-0">
        <h1 className="font-display text-page-title font-semibold leading-tight text-ink">
          {greeting()}, {first}
        </h1>
        <p className="mt-0.5 text-caption text-muted">
          {fmtDateLong(TODAY)} · <span className="text-ink">{scope}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PeriodSelector />
        {action}
      </div>
    </header>
  )
}

// ── helpers ──────────────────────────────────────────────────────────
function greeting(): string {
  // NOW is the mockup's frozen clock. Nothing here reads the system clock.
  const hour = Number(NOW.slice(11, 13))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function periodLabel(p: string): string {
  return p === 'today'
    ? 'Today'
    : p === 'week'
      ? 'This week'
      : p === 'quarter'
        ? 'This quarter'
        : 'This month'
}

/**
 * The panel header names the location every figure is scoped to. A manager
 * bound to Ilangay must never hand the owner an unlabelled number.
 */
export function useLocationScopeLabel(): string {
  const location = useSession((s) => s.activeLocation())
  return location?.name ?? 'All locations'
}
