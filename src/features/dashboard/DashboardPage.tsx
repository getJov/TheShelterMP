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
    <div className="h-full overflow-y-auto">
      <DashboardHeader
        action={
          <button
            type="button"
            onClick={() => navigate('/map')}
            className="flex min-h-10 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-control text-muted transition-colors hover:text-ink"
          >
            <Icon icon={IconMap} size={14} />
            Open the map
          </button>
        }
      />
      <div className="px-5 pb-8">
        <CardGrid layout="full" />
      </div>
    </div>
  )
}
