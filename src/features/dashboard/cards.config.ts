import { can, type User } from '@/domain'
import type { CardDef } from './types'
import { CollectionsCard } from './cards/CollectionsCard'
import { ReceivablesCard } from './cards/ReceivablesCard'
import { InventoryCard } from './cards/InventoryCard'
import { TrustFundCard } from './cards/TrustFundCard'
import { LeaderboardCard } from './cards/LeaderboardCard'
import { BurialsCard } from './cards/BurialsCard'
import { SalesActivityCard } from './cards/SalesActivityCard'
import { AttentionCard } from './cards/AttentionCard'
import { PayoutCard } from './cards/PayoutCard'

/**
 * THE card manifest.
 *
 * Sizes live here, never in JSX. Promoting a card the client points at in the
 * meeting is a one-word edit — 'small' → 'hero' — and both the docked and the
 * full layout follow, because both derive from `size` alone.
 */
export const CARDS: CardDef[] = [
  {
    id: 'collections',
    title: 'Collections',
    size: 'hero',
    order: 10,
    permission: 'dashboard:view_financial',
    agentVariant: 'hidden',
    component: CollectionsCard,
  },
  {
    id: 'receivables',
    title: 'Receivables',
    size: 'hero',
    order: 20,
    permission: 'dashboard:view_financial',
    agentVariant: 'hidden',
    component: ReceivablesCard,
  },
  {
    id: 'inventory',
    title: 'Inventory',
    size: 'hero',
    order: 30,
    permission: 'lot:view',
    component: InventoryCard,
  },
  {
    id: 'trust-fund',
    title: 'Trust Fund',
    size: 'small',
    order: 40,
    permission: 'trustfund:view',
    agentVariant: 'hidden',
    component: TrustFundCard,
  },
  {
    id: 'leaderboard',
    title: 'Top Agents',
    size: 'small',
    order: 50,
    permission: 'leaderboard:view',
    agentVariant: 'own',
    component: LeaderboardCard,
  },
  {
    id: 'burials',
    title: 'Upcoming Burials',
    size: 'small',
    order: 60,
    permission: 'interment:view',
    component: BurialsCard,
  },
  {
    id: 'sales-activity',
    title: 'Sales Activity',
    size: 'small',
    order: 70,
    permission: 'contract:view_all',
    agentVariant: 'own',
    agentPermission: 'contract:view_own',
    component: SalesActivityCard,
  },
  {
    id: 'attention',
    title: 'Needs Attention',
    size: 'small',
    order: 80,
    permission: 'hold:approve',
    /**
     * The owner does not approve holds but does approve payout runs, and the
     * to-do list is exactly their screen. Either route qualifies.
     */
    anyOf: ['hold:approve', 'payout:approve'],
    agentVariant: 'hidden',
    component: AttentionCard,
  },
  {
    id: 'payout',
    title: 'Commission Payout',
    size: 'small',
    order: 90,
    permission: 'commission:view_all',
    agentVariant: 'own',
    agentPermission: 'commission:view_own',
    component: PayoutCard,
  },
]

/**
 * An agent's dashboard is a purpose-built screen, not a redacted manager
 * screen: 'hidden' cards are absent entirely, the rest are scoped to them.
 */
export function visibleCards(user: User | null): CardDef[] {
  if (!user) return []
  return CARDS.filter((def) => {
    if (user.role === 'agent') {
      if (def.agentVariant === 'hidden') return false
      return can(user.role, def.agentPermission ?? def.permission)
    }
    if (def.anyOf) return def.anyOf.some((p) => can(user.role, p))
    return can(user.role, def.permission)
  }).sort((a, b) => a.order - b.order)
}
