import type { ReactNode } from 'react'
import {
  can,
  canAll,
  canAny,
  hasLocationAccess,
  type AgentProfile,
  type Location,
  type Lot,
  type Permission,
  type User,
} from '@/domain'
import { useSession } from '@/stores/session'
import { indexes } from '@/stores/dataset'

export function useCurrentUserOrNull(): User | null {
  return useSession((s) => s.currentUser())
}

export function useCurrentUser(): User {
  const u = useCurrentUserOrNull()
  if (!u) throw new Error('useCurrentUser called without a session')
  return u
}

export function useCurrentAgent(): AgentProfile | null {
  return useSession((s) => s.currentAgent())
}

export function useCan(p: Permission): boolean {
  const u = useCurrentUserOrNull()
  return u ? can(u.role, p) : false
}

export function useCanAny(...ps: Permission[]): boolean {
  const u = useCurrentUserOrNull()
  return u ? canAny(u.role, ps) : false
}

export function useCanAll(...ps: Permission[]): boolean {
  const u = useCurrentUserOrNull()
  return u ? canAll(u.role, ps) : false
}

export function useActiveLocation(): Location | null {
  return useSession((s) => s.activeLocation())
}

export function useVisibleLocations(): Location[] {
  return useSession((s) => s.visibleLocations())
}

/**
 * Declarative gate. Renders NOTHING when denied — a greyed-out control the
 * user cannot use invites the question "why can't I click that?".
 */
export function Gate({
  permission,
  mode = 'all',
  fallback = null,
  children,
}: {
  permission: Permission | Permission[]
  mode?: 'all' | 'any'
  fallback?: ReactNode
  children: ReactNode
}): ReactNode {
  const u = useCurrentUserOrNull()
  const ps = Array.isArray(permission) ? permission : [permission]
  const ok = u ? (mode === 'any' ? canAny(u.role, ps) : canAll(u.role, ps)) : false
  return ok ? children : fallback
}

/** The single scoping primitive. Feature selectors pipe through this. */
export function scopeToUser<T extends { locationId: Location['id'] }>(
  rows: T[],
  user: User | null,
  activeLocationId?: Location['id'] | null,
): T[] {
  if (!user) return []
  let out = rows
  if (user.role !== 'owner' && user.role !== 'admin') {
    out = out.filter((r) => hasLocationAccess(user, r.locationId))
  }
  if (activeLocationId) out = out.filter((r) => r.locationId === activeLocationId)
  return out
}

// ── lot visibility — the rule the client was most specific about ──────
export type LotVisibility = 'full' | 'availability_only' | 'hidden'

/**
 * "Agents → maps only for available lots."
 *
 * One predicate, used by the map, every table and the lot drawer, so the
 * rule can never be applied inconsistently.
 */
export function lotVisibility(user: User | null, lot: Lot): LotVisibility {
  if (!user) return 'hidden'
  if (!hasLocationAccess(user, lot.locationId)) return 'hidden'
  if (can(user.role, 'lot:view_all_statuses')) return 'full'

  // Agents service their own clients — a lot they sold is fully visible.
  if (user.agentProfileId && lot.currentContractId) {
    const contract = indexes().contractsById.get(lot.currentContractId)
    if (contract?.agentId === user.agentProfileId) return 'full'
  }

  return 'availability_only'
}

export function useLotVisibility(lot: Lot): LotVisibility {
  const u = useCurrentUserOrNull()
  return lotVisibility(u, lot)
}

/** True when this user may see money, owners and dates for the lot. */
export function canSeeLotDetail(user: User | null, lot: Lot): boolean {
  return lotVisibility(user, lot) === 'full'
}
