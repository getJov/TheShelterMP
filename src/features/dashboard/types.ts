import type { ComponentType } from 'react'
import type { AgentProfile, LocationId, Permission, User } from '@/domain'
import type { DashboardPeriod } from '@/stores/panel'

/** Which of the two grids a card is rendering into. */
export type DashboardLayout = 'docked' | 'full'

/** Which product surface owns the dashboard presentation. */
export type DashboardSurface = 'map-panel' | 'standalone'

export interface CardProps {
  def: CardDef
  layout: DashboardLayout
  surface: DashboardSurface
  period: DashboardPeriod
  user: User
  /** Non-null only when the viewer is an agent. */
  agent: AgentProfile | null
  locationId: LocationId | null
  /** Dataset version — every selector key includes it. */
  version: number
  /** True when the user folded this card away; drop the chart, keep the value. */
  collapsed: boolean
}

export interface CardDef {
  id: string
  title: string
  /** ← the client changes THIS word to promote or demote a card. */
  size: 'hero' | 'small'
  order: number
  permission: Permission
  /**
   * Some cards are legitimately held by more than one route to the same
   * responsibility (the owner approves payouts, the manager approves holds).
   * When present this replaces `permission` as an any-of test.
   */
  anyOf?: Permission[]
  /** Agents see a version scoped to themselves, or nothing at all. */
  agentVariant?: 'own' | 'hidden'
  /** The permission an agent needs for the scoped variant. */
  agentPermission?: Permission
  component: ComponentType<CardProps>
}
