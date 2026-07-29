import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentProfile, Location, LocationId, User, UserId } from '@/domain'
import { dataset } from './dataset'

interface SessionState {
  currentUserId: UserId | null
  /**
   * Which location the UI is looking at. Forced to their single bound
   * location for manager and agent; null means "all" for owner/admin.
   */
  activeLocationId: LocationId | null

  signIn: (userId: UserId) => boolean
  signOut: () => void
  switchUser: (userId: UserId) => void
  switchLocation: (id: LocationId | null) => void

  currentUser: () => User | null
  currentAgent: () => AgentProfile | null
  activeLocation: () => Location | null
  visibleLocations: () => Location[]
}

const EMPTY_LOCATIONS: Location[] = []

let visibleCache: {
  userId: UserId | null
  source: Location[] | null
  result: Location[]
} = { userId: null, source: null, result: EMPTY_LOCATIONS }

const parkFirst = (locs: Location[]) =>
  locs.find((l) => l.kind === 'park') ?? locs[0] ?? null

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      currentUserId: null,
      activeLocationId: null,

      signIn: (userId) => {
        const user = dataset().users.find((u) => u.id === userId)
        // An archived user is denied everything, regardless of role.
        if (!user || user.status !== 'active') return false
        set({
          currentUserId: userId,
          activeLocationId:
            user.locationIds.length > 0
              ? user.locationIds[0]!
              : (parkFirst(dataset().locations)?.id ?? null),
        })
        return true
      },

      signOut: () => set({ currentUserId: null, activeLocationId: null }),

      switchUser: (userId) => {
        get().signIn(userId)
      },

      switchLocation: (id) => {
        const u = get().currentUser()
        if (!u) return
        // manager and agent are bound to exactly one location.
        if (u.role !== 'owner' && u.role !== 'admin') return
        set({ activeLocationId: id })
      },

      currentUser: () => {
        const id = get().currentUserId
        if (!id) return null
        return dataset().users.find((u) => u.id === id) ?? null
      },

      currentAgent: () => {
        const u = get().currentUser()
        if (!u?.agentProfileId) return null
        return dataset().agents.find((a) => a.id === u.agentProfileId) ?? null
      },

      activeLocation: () => {
        const id = get().activeLocationId
        if (!id) return null
        return dataset().locations.find((l) => l.id === id) ?? null
      },

      /**
       * Cached by (user, locations). Returning a fresh array on every call
       * makes any zustand selector reading it loop forever — which crashed
       * every route for manager and agent sessions before this cache.
       */
      visibleLocations: () => {
        const u = get().currentUser()
        const all = dataset().locations
        if (!u) return EMPTY_LOCATIONS
        if (u.role === 'owner' || u.role === 'admin') return all
        if (visibleCache.userId === u.id && visibleCache.source === all) {
          return visibleCache.result
        }
        const result = all.filter((l) => u.locationIds.includes(l.id))
        visibleCache = { userId: u.id, source: all, result }
        return result
      },
    }),
    {
      name: 'shelter-session',
      partialize: (s) => ({
        currentUserId: s.currentUserId,
        activeLocationId: s.activeLocationId,
      }),
      onRehydrateStorage: () => (state) => {
        // Re-resolve on load; drop the session if the user vanished or was archived.
        if (!state?.currentUserId) return
        const u = dataset().users.find((x) => x.id === state.currentUserId)
        if (!u || u.status !== 'active') {
          state.currentUserId = null
          state.activeLocationId = null
        }
      },
    },
  ),
)
