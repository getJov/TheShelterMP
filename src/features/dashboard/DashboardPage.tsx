import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/ui-brand/Icon'
import { IconMap } from '@/components/ui-brand/icons'
import { CardGrid } from './CardGrid'
import { DashboardHeader } from './DashboardPanel'

/**
 * The same content as the panel's full state, reachable at /dashboard for
 * anyone who prefers the dashboard as a destination rather than a companion
 * to the map.
 */
export default function DashboardPage() {
  const navigate = useNavigate()

  return (
    <div
      data-dashboard-surface="standalone"
      className="h-full min-w-0 overflow-y-auto"
    >
      <div
        data-dashboard-content
        className="@container/dashboard mx-auto w-full max-w-[1400px]"
      >
        <DashboardHeader
          surface="standalone"
          action={
            <button
              type="button"
              onClick={() => navigate('/map')}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3 py-2 text-control text-muted transition-colors hover:text-ink @min-[480px]/dashboard:w-auto"
            >
              <Icon icon={IconMap} size={14} />
              Open the map
            </button>
          }
        />
        <div className="px-4 pb-8 @min-[640px]/dashboard:px-6">
          <CardGrid layout="full" surface="standalone" />
        </div>
      </div>
    </div>
  )
}
