import type { LocationId } from './ids'
import type { Role } from './enums'
import type { User } from './people'

export type Permission =
  // map & inventory
  | 'lot:view'
  | 'lot:view_all_statuses'
  | 'lot:edit'
  | 'block:manage'
  | 'overlay:manage'
  // pricing
  | 'tier:view'
  | 'tier:manage'
  | 'price:view'
  | 'price:manage'
  | 'service:manage'
  // sales
  | 'hold:request'
  | 'hold:approve'
  | 'contract:view_own'
  | 'contract:view_all'
  | 'contract:create'
  | 'contract:approve'
  | 'contract:cancel'
  | 'payment:view'
  | 'payment:post'
  | 'payment:void'
  | 'client:view'
  | 'client:manage'
  | 'transfer:request'
  | 'transfer:approve'
  // commissions
  | 'commission:view_own'
  | 'commission:view_all'
  | 'commission:manage_rules'
  | 'payout:approve'
  | 'payout:release'
  | 'agent:view'
  | 'agent:manage'
  | 'leaderboard:view'
  // burials
  | 'interment:view'
  | 'interment:schedule'
  | 'interment:complete'
  | 'job:view'
  | 'job:manage'
  // oversight
  | 'dashboard:view'
  | 'dashboard:view_financial'
  | 'trustfund:view'
  | 'audit:view'
  | 'user:manage'

export const ALL_PERMISSIONS: Permission[] = [
  'lot:view',
  'lot:view_all_statuses',
  'lot:edit',
  'block:manage',
  'overlay:manage',
  'tier:view',
  'tier:manage',
  'price:view',
  'price:manage',
  'service:manage',
  'hold:request',
  'hold:approve',
  'contract:view_own',
  'contract:view_all',
  'contract:create',
  'contract:approve',
  'contract:cancel',
  'payment:view',
  'payment:post',
  'payment:void',
  'client:view',
  'client:manage',
  'transfer:request',
  'transfer:approve',
  'commission:view_own',
  'commission:view_all',
  'commission:manage_rules',
  'payout:approve',
  'payout:release',
  'agent:view',
  'agent:manage',
  'leaderboard:view',
  'interment:view',
  'interment:schedule',
  'interment:complete',
  'job:view',
  'job:manage',
  'dashboard:view',
  'dashboard:view_financial',
  'trustfund:view',
  'audit:view',
  'user:manage',
]

export const ROLE_POLICY: Record<Role, Permission[]> = {
  /**
   * Full read across every location plus governance. Deliberately NOT given
   * day-to-day write permissions — the owner oversees, the admin operates.
   */
  owner: [
    'lot:view',
    'lot:view_all_statuses',
    'tier:view',
    'price:view',
    'contract:view_all',
    'payment:view',
    'client:view',
    'commission:view_all',
    'payout:approve',
    'agent:view',
    'leaderboard:view',
    'interment:view',
    'job:view',
    'dashboard:view',
    'dashboard:view_financial',
    'trustfund:view',
    'audit:view',
  ],

  /** Everything, every location. Two people hold this. */
  admin: [...ALL_PERMISSIONS],

  /** Merged Manager + Customer Service Rep. Bound to ONE location. */
  manager: [
    'lot:view',
    'lot:view_all_statuses',
    'lot:edit',
    'tier:view',
    'price:view',
    'hold:request',
    'hold:approve',
    'contract:view_all',
    'contract:create',
    'contract:approve',
    'payment:view',
    'payment:post',
    'client:view',
    'client:manage',
    'transfer:request',
    'commission:view_all',
    'agent:view',
    'leaderboard:view',
    'interment:view',
    'interment:schedule',
    'interment:complete',
    'job:view',
    'job:manage',
    'dashboard:view',
    'dashboard:view_financial',
  ],

  /**
   * The client: "agents → maps only for available lots."
   * Everything else here is their OWN record.
   */
  agent: [
    'lot:view', // NOT lot:view_all_statuses
    'tier:view',
    'price:view',
    'hold:request', // NOT hold:approve
    'contract:view_own',
    'client:view',
    'commission:view_own',
    'leaderboard:view',
    'dashboard:view', // NOT dashboard:view_financial
  ],
}

export const can = (role: Role, p: Permission): boolean =>
  ROLE_POLICY[role].includes(p)

export const canAny = (role: Role, ps: Permission[]): boolean =>
  ps.some((p) => can(role, p))

export const canAll = (role: Role, ps: Permission[]): boolean =>
  ps.every((p) => can(role, p))

/**
 * Location scope. owner/admin see everything; manager and agent are bound to
 * exactly one location.
 */
export const hasLocationAccess = (u: User, loc: LocationId): boolean =>
  u.role === 'owner' || u.role === 'admin' ? true : u.locationIds.includes(loc)

/** An archived user is denied everything, regardless of role. */
export const isActive = (u: User): boolean => u.status === 'active'

// Compile-time guarantee that admin holds every permission.
type _AdminIsExhaustive = typeof ROLE_POLICY.admin extends Permission[] ? true : never
const _adminCheck: _AdminIsExhaustive = true
void _adminCheck
