import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Permission } from '@/domain'
import { useCanAny, useCurrentUserOrNull } from '@/lib/permissions'
import { LogoMark } from '@/components/shell/Logo'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useCurrentUserOrNull()
  const loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

/**
 * A designed 403, not a silent redirect. A redirect makes the app feel
 * broken; an explicit page makes the role model legible — which is half the
 * point of demonstrating RBAC to the client.
 */
export function Forbidden() {
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <LogoMark size={44} className="text-gold-deep/40 dark:text-gold/40" />
      <h2 className="mt-6 font-display text-[26px] font-semibold text-ink">
        You don't have access to this area
      </h2>
      <p className="mt-2 max-w-[44ch] text-[13.5px] text-muted">
        Your role doesn't include this screen. If you think that's wrong, an
        administrator can adjust your access.
      </p>
      <Button className="mt-6" onClick={() => navigate('/map')}>
        Back to the park map
      </Button>
    </div>
  )
}

/**
 * `permission` may be a single key or a list.
 *
 * A list is an ANY-of check, and it is genuinely needed: no single key covers
 * Sales for all four roles — agents hold `contract:view_own` while managers
 * and the owner hold `contract:view_all`, and neither holds the other.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission | Permission[]
  children: ReactNode
}) {
  const list = Array.isArray(permission) ? permission : [permission]
  const ok = useCanAny(...list)
  if (!ok) return <Forbidden />
  return <>{children}</>
}
