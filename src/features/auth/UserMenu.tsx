import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROLE_LABEL, type Role, type User } from '@/domain'
import { useDataset } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Icon } from '@/components/ui-brand/Icon'
import { IconLogout, IconSettings, IconUser } from '@/components/ui-brand/icons'
import { cn } from '@/lib/utils'
import { DisplaySettings } from '@/components/shell/DisplaySettings'

const ROLE_ORDER: Role[] = ['owner', 'admin', 'manager', 'agent']

function initials(name: string) {
  const parts = name.split(' ').filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
}

/**
 * Doubles as the demo's role switcher — the single most useful control in the
 * whole walkthrough. Switching re-renders the shell under a new permission
 * set with no logout and no reload.
 */
export function UserMenu({
  compact,
  trigger = 'row',
}: {
  compact?: boolean
  trigger?: 'row' | 'avatar'
}) {
  const data = useDataset((s) => s.data)
  const user = useSession((s) => s.currentUser())
  const switchUser = useSession((s) => s.switchUser)
  const signOut = useSession((s) => s.signOut)
  const navigate = useNavigate()
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false)

  if (!user) return null

  const locName = (u: User) =>
    u.locationIds.length === 0
      ? 'All locations'
      : (data.locations.find((l) => l.id === u.locationIds[0])?.name ?? '—')

  const byRole = ROLE_ORDER.map((role) => ({
    role,
    users: data.users.filter((u) => u.role === role && u.status === 'active'),
  })).filter((g) => g.users.length > 0)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger === 'avatar' ? (
            <button
              className="grid size-11 place-items-center rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Account and role"
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-gold/18 text-micro font-semibold text-gold-deep dark:text-gold">
                  {initials(user.fullName)}
                </AvatarFallback>
              </Avatar>
            </button>
          ) : (
            <button
              className={cn(
                'flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2',
                compact && 'justify-center px-0',
              )}
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-gold/18 text-micro font-semibold text-gold-deep dark:text-gold">
                  {initials(user.fullName)}
                </AvatarFallback>
              </Avatar>
              {!compact && (
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium text-ink">
                    {user.fullName}
                  </span>
                  <span className="block text-caption text-muted">
                    {ROLE_LABEL[user.role]} · {locName(user)}
                  </span>
                </span>
              )}
            </button>
          )}
        </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[min(320px,calc(100vw-16px))]">
        <DropdownMenuLabel className="flex items-center gap-2 py-2">
          <Icon icon={IconUser} size={15} />
          <span className="min-w-0">
            <span className="block text-body">{user.fullName}</span>
            <span className="block break-all text-caption font-normal text-muted">
              {user.email}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuLabel className="eyebrow text-muted">
          Switch role — demo
        </DropdownMenuLabel>
        <div className="max-h-[320px] overflow-y-auto">
          {byRole.map((g) => (
            <DropdownMenuGroup key={g.role}>
              <DropdownMenuLabel className="py-1 text-micro font-semibold uppercase tracking-wider text-muted">
                {ROLE_LABEL[g.role]}
              </DropdownMenuLabel>
              {g.users.slice(0, g.role === 'agent' ? 6 : 4).map((u) => (
                <DropdownMenuItem
                  key={u.id}
                  onSelect={() => switchUser(u.id)}
                  className={cn('items-start', u.id === user.id && 'bg-gold/12 font-medium')}
                >
                  <span className="min-w-0 flex-1 break-words">{u.fullName}</span>
                  <span className="ml-2 shrink-0 text-micro text-muted">
                    {u.locationIds.length === 0 ? 'All' : locName(u).split(' ')[0]}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setDisplaySettingsOpen(true)}>
          <Icon icon={IconSettings} size={15} />
          Display settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            signOut()
            navigate('/login', { replace: true })
          }}
        >
          <Icon icon={IconLogout} size={15} />
          Sign out
        </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DisplaySettings
        showTrigger={false}
        open={displaySettingsOpen}
        onOpenChange={setDisplaySettingsOpen}
      />
    </>
  )
}
