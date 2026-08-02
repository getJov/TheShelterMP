import { motion, useReducedMotion } from 'framer-motion'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { IconDashboard } from '@/components/ui-brand/icons'
import { cn } from '@/lib/utils'
import { useDataset } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import { usePanel } from '@/stores/panel'
import { useCurrentUserOrNull } from '@/lib/permissions'
import { CARD_STAGGER, CARD_STAGGER_CAP, PANEL_TRANSITION } from './constants'
import { visibleCards } from './cards.config'
import type { CardDef, DashboardLayout } from './types'

/**
 * Both grids derive from `size` alone, so changing one word in cards.config
 * moves a card correctly in docked AND full with no other edit.
 */
export function CardGrid({
  layout,
  className,
}: {
  layout: DashboardLayout
  className?: string
}) {
  const user = useCurrentUserOrNull()
  const agent = useSession((s) => s.currentAgent())
  const locationId = useSession((s) => s.activeLocationId)
  const version = useDataset((s) => s.version)
  const period = usePanel((s) => s.period)
  const collapsedCards = usePanel((s) => s.collapsedCards)
  const reduced = useReducedMotion()

  if (!user) return null
  const cards = visibleCards(user)

  if (cards.length === 0) {
    return (
      <EmptyState
        compact
        icon={IconDashboard}
        title="Nothing to show"
        body="Your role does not include any dashboard cards."
      />
    )
  }

  const heroes = cards.filter((c) => c.size === 'hero')
  const smalls = cards.filter((c) => c.size === 'small')

  let index = -1
  const render = (def: CardDef) => {
    index += 1
    const i = Math.min(index, CARD_STAGGER_CAP)
    const Component = def.component
    return (
      <motion.div
        key={def.id}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reduced ? 0.14 : PANEL_TRANSITION.duration,
          ease: PANEL_TRANSITION.ease,
          delay: reduced ? 0 : i * CARD_STAGGER,
        }}
        className="min-w-0 [&>section]:h-full"
      >
        <Component
          def={def}
          layout={layout}
          period={period}
          user={user}
          agent={agent}
          locationId={locationId}
          version={version}
          collapsed={collapsedCards.has(def.id)}
        />
      </motion.div>
    )
  }

  if (layout === 'docked') {
    return (
      <div className={cn('space-y-3', className)}>
        {/* Heroes run full width; smalls pair up. */}
        {heroes.map(render)}
        {smalls.length > 0 && (
          <div className="grid grid-cols-1 gap-3">{smalls.map(render)}</div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {heroes.length > 0 && (
        <div className={cn('grid gap-4', HERO_COLS[Math.min(heroes.length, 3)])}>
          {heroes.map(render)}
        </div>
      )}
      {smalls.length > 0 && (
        <div className={cn('grid gap-4', SMALL_COLS[Math.min(smalls.length, 5)])}>
          {smalls.map(render)}
        </div>
      )}
    </div>
  )
}

/**
 * Column counts follow the number of cards the ROLE actually has, so an
 * agent's single hero does not sit in a third of the screen with two empty
 * columns beside it.
 */
const HERO_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-2 xl:grid-cols-3',
}

const SMALL_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5',
}
