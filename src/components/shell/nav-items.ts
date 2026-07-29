import type { IconSvgElement } from '@hugeicons/react'
import {
  IconAgents,
  IconApprovals,
  IconAudit,
  IconBurials,
  IconDashboard,
  IconMap,
  IconMapEditor,
  IconPricing,
  IconSales,
} from '@/components/ui-brand/icons'

export interface NavItem {
  to: string
  label: string
  /** Label shown when the current user is an agent, if different. */
  agentLabel?: string
  icon: IconSvgElement
  /** Permission key(s) from @/domain. An array is an ANY-of check. */
  permission: string | string[]
  section?: 'main' | 'manage'
  /** When set, the shell renders a live count badge from this source. */
  badge?: 'approvals'
}

export const navItems: NavItem[] = [
  { to: '/map', label: 'Park Map', icon: IconMap, permission: 'lot:view', section: 'main' },
  { to: '/dashboard', label: 'Dashboard', icon: IconDashboard, permission: 'dashboard:view', section: 'main' },
  { to: '/sales', label: 'Sales & Payments', agentLabel: 'My Sales', icon: IconSales, permission: ['contract:view_own', 'contract:view_all'], section: 'main' },
  { to: '/burials', label: 'Burials', icon: IconBurials, permission: 'interment:view', section: 'main' },
  { to: '/agents', label: 'Agents', agentLabel: 'My Earnings', icon: IconAgents, permission: 'leaderboard:view', section: 'main' },
  { to: '/approvals', label: 'Approvals', icon: IconApprovals, permission: ['hold:approve', 'payout:approve'], section: 'main', badge: 'approvals' },
  { to: '/pricing', label: 'Pricing & Tiers', agentLabel: 'Price List', icon: IconPricing, permission: 'price:view', section: 'main' },
  { to: '/map-editor', label: 'Map Editor', icon: IconMapEditor, permission: 'block:manage', section: 'manage' },
  { to: '/audit', label: 'Audit Log', icon: IconAudit, permission: 'audit:view', section: 'manage' },
  // <<< NAV — insert new nav items directly above this line
]
