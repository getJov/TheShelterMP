import { type ReactNode } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { useCan, useCurrentUser } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { PeriodPicker } from './shared'
import { usePeriod } from './period'
import { RosterTab } from './RosterTab'
import { LeaderboardTab } from './LeaderboardTab'
import { CommissionsTab } from './CommissionsTab'
import { PayoutsTab } from './PayoutsTab'
import { PayoutRunDetail } from './PayoutRunDetail'
import { CommissionRulesPage } from './CommissionRulesPage'
import { AgentDetailPage } from './AgentDetailPage'
import { MyEarningsPage } from './MyEarningsPage'

/**
 * Registered as `agents/*`, so the sub-routes are resolved here.
 *
 * An agent visiting /agents lands on My Earnings rather than the roster —
 * same route, a purpose-built screen.
 */
export default function AgentsPage() {
  return (
    <Routes>
      <Route index element={<IndexScreen />} />
      <Route
        path="leaderboard"
        element={
          <TabShell active="/agents/leaderboard">
            <LeaderboardTab />
          </TabShell>
        }
      />
      <Route
        path="commissions"
        element={
          <TabShell active="/agents/commissions">
            <CommissionsTab />
          </TabShell>
        }
      />
      <Route
        path="payouts"
        element={
          <TabShell active="/agents/payouts">
            <PayoutsTab />
          </TabShell>
        }
      />
      <Route path="payouts/:runId" element={<PayoutRunDetail />} />
      <Route path="rules" element={<CommissionRulesPage />} />
      <Route path=":agentId" element={<AgentDetailPage />} />
    </Routes>
  )
}

function IndexScreen() {
  const canRoster = useCan('agent:view')
  return (
    <TabShell active="/agents">
      {canRoster ? <RosterTab /> : <MyEarningsPage />}
    </TabShell>
  )
}

// ── the tabbed frame ─────────────────────────────────────────────────
interface TabDef {
  to: string
  label: string
  show: boolean
}

function TabShell({ active, children }: { active: string; children: ReactNode }) {
  const user = useCurrentUser()
  const period = usePeriod()
  const canRoster = useCan('agent:view')
  const canAll = useCan('commission:view_all')

  const canRules = useCan('commission:manage_rules')

  const tabs: TabDef[] = [
    { to: '/agents', label: canRoster ? 'Roster' : 'My earnings', show: true },
    { to: '/agents/leaderboard', label: 'Leaderboard', show: true },
    { to: '/agents/commissions', label: 'Commissions', show: canAll },
    { to: '/agents/payouts', label: 'Payouts', show: canAll },
    { to: '/agents/rules', label: 'Rules', show: canRules },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line bg-surface px-6 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-gold-deep dark:text-gold">
              {user.role === 'agent' ? 'My earnings' : 'Sales force'}
            </p>
            <h2 className="font-display text-[27px] font-semibold text-ink">
              Agents &amp; Commissions
            </h2>
            <p className="mt-0.5 max-w-[72ch] text-[13px] text-muted">
              Twelve percent, split three ways, earned as money arrives rather than
              when a contract is signed.
            </p>
          </div>
          <div className="pt-1">
            <PeriodPicker period={period} />
          </div>
        </div>

        <nav className="-mb-px mt-4 flex gap-1">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === '/agents'}
                className={cn(
                  'relative rounded-t-md px-3.5 py-2 text-[13.5px] transition-colors',
                  active === t.to
                    ? 'font-medium text-ink'
                    : 'text-muted hover:text-ink',
                )}
              >
                {t.label}
                {active === t.to && (
                  <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-gold" />
                )}
              </NavLink>
            ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
    </div>
  )
}
