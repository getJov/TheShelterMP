import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell, RouteFallback } from '@/components/shell/AppShell'
import { RequireAuth, RequirePermission } from '@/features/auth/RequireAuth'
import LoginPage from '@/features/auth/LoginPage'
import type { Permission } from '@/domain'

const MapPage = lazy(() => import('@/features/map/MapPage'))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const SalesPage = lazy(() => import('@/features/sales/SalesPage'))
const BurialsPage = lazy(() => import('@/features/burials/BurialsPage'))
const AgentsPage = lazy(() => import('@/features/agents/AgentsPage'))
const ApprovalsPage = lazy(() => import('@/features/approvals/ApprovalsPage'))
const PricingPage = lazy(() => import('@/features/pricing/PricingPage'))
const MapEditorPage = lazy(() => import('@/features/map-editor/MapEditorPage'))
const AuditPage = lazy(() => import('@/features/audit/AuditPage'))

/**
 * ANY-of when given a list. Required, not cosmetic: no single permission
 * covers Sales for all four roles (agents hold `contract:view_own`; managers
 * and the owner hold `contract:view_all`; neither holds the other), and the
 * owner reaches Approvals through `payout:approve` rather than `hold:approve`.
 * Narrowing either of these back to a single key 403s a real role.
 */
function guard(permission: Permission | Permission[], node: ReactNode) {
  return (
    <RequirePermission permission={permission}>
      <Suspense fallback={<RouteFallback />}>{node}</Suspense>
    </RequirePermission>
  )
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/map" replace /> },
      { path: 'map', element: guard('lot:view', <MapPage />) },
      { path: 'dashboard', element: guard('dashboard:view', <DashboardPage />) },
      { path: 'sales/*', element: guard(['contract:view_own', 'contract:view_all'], <SalesPage />) },
      { path: 'burials/*', element: guard('interment:view', <BurialsPage />) },
      { path: 'agents/*', element: guard('leaderboard:view', <AgentsPage />) },
      { path: 'approvals', element: guard(['hold:approve', 'payout:approve'], <ApprovalsPage />) },
      { path: 'pricing/*', element: guard('price:view', <PricingPage />) },
      { path: 'map-editor', element: guard('block:manage', <MapEditorPage />) },
      { path: 'audit', element: guard('audit:view', <AuditPage />) },
      // <<< ROUTES — insert new route objects directly above this line
      { path: '*', element: <Navigate to="/map" replace /> },
    ],
  },
])
