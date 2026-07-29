import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { LogoLockup, LogoMark } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { CommandPalette } from './CommandPalette'
import { navItems, type NavItem } from './nav-items'
import { Icon } from '@/components/ui-brand/Icon'
import { IconSidebar } from '@/components/ui-brand/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCanAny } from '@/lib/permissions'
import { canAny, type Permission } from '@/domain'
import { UserMenu } from '@/features/auth/UserMenu'
import { LocationSwitcher } from '@/features/auth/LocationSwitcher'
import { NotificationBell } from '@/features/approvals/NotificationBell'
import { useSession } from '@/stores/session'
import { useNotifications } from '@/stores/notifications'
import { useDataset } from '@/stores/dataset'

const RAIL_KEY = 'shelter-rail-open'

export function AppShell() {
  const [railOpen, setRailOpen] = useState(
    () => localStorage.getItem(RAIL_KEY) !== '0',
  )
  useEffect(() => {
    localStorage.setItem(RAIL_KEY, railOpen ? '1' : '0')
  }, [railOpen])

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg">
      <Rail open={railOpen} onToggle={() => setRailOpen((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}

function Rail({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const user = useSession((s) => s.currentUser())
  const main = navItems.filter((i) => i.section !== 'manage')
  const manage = navItems.filter((i) => i.section === 'manage')

  return (
    <motion.aside
      layout
      initial={false}
      animate={{ width: open ? 232 : 68 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="z-30 flex shrink-0 flex-col border-r border-line bg-surface"
    >
      <div
        className={cn(
          'flex h-14 items-center border-b border-line',
          open ? 'px-4' : 'justify-center px-0',
        )}
      >
        {open ? (
          <LogoLockup variant="compact" />
        ) : (
          <LogoMark size={24} className="text-gold-deep dark:text-gold" />
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        <NavList items={main} open={open} />
        <ManageSection items={manage} open={open} />
      </nav>

      <div className="border-t border-line p-2.5">
        {user && <UserMenu compact={!open} />}
        <button
          onClick={onToggle}
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          className={cn(
            'mt-1.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px]',
            'text-muted transition-colors hover:bg-surface-2 hover:text-ink',
            !open && 'justify-center',
          )}
        >
          <Icon icon={IconSidebar} size={17} className={cn(!open && 'rotate-180')} />
          <AnimatePresence initial={false}>
            {open && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="whitespace-nowrap"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  )
}

/**
 * Hidden entirely when the user holds none of its permissions — which is
 * exactly what an agent sees. A "Manage" heading over an empty list reads
 * as a broken screen.
 */
function ManageSection({ items, open }: { items: NavItem[]; open: boolean }) {
  const user = useSession((s) => s.currentUser())
  if (!user) return null

  const anyVisible = items.some((i) => {
    const perms = Array.isArray(i.permission) ? i.permission : [i.permission]
    return canAny(user.role, perms as Permission[])
  })
  if (!anyVisible) return null

  return (
    <>
      <div className="my-3 border-t border-line-soft" />
      {open && <p className="eyebrow px-2.5 pb-1.5 text-muted">Manage</p>}
      <NavList items={items} open={open} />
    </>
  )
}

function NavList({ items, open }: { items: NavItem[]; open: boolean }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <NavRow key={item.to} item={item} open={open} />
      ))}
    </ul>
  )
}

function NavRow({ item, open }: { item: NavItem; open: boolean }) {
  const perms = (Array.isArray(item.permission) ? item.permission : [item.permission]) as never[]
  const allowed = useCanAny(...perms)
  const user = useSession((s) => s.currentUser())

  // Live pending count for any nav item that declares a badge. Subscribing to
  // both versions is what makes the count move the instant a hold is raised or
  // decided — including when the role switcher changes who "you" are.
  const notificationsVersion = useNotifications((s) => s.version)
  const datasetVersion = useDataset((s) => s.version)
  const approvalCounts = useNotifications((s) => s.approvalCounts)
  const badge = useMemo(
    () => (item.badge === 'approvals' && user ? approvalCounts(user).all : 0),
    [item.badge, user, approvalCounts, notificationsVersion, datasetVersion],
  )

  if (!allowed) return null

  const label =
    user?.role === 'agent' && item.agentLabel ? item.agentLabel : item.label

  const link = (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors',
          !open && 'justify-center',
          isActive
            ? 'bg-gold/12 font-medium text-gold-deep dark:text-gold'
            : 'text-muted hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-gold"
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            />
          )}
          <Icon icon={item.icon} size={18} />
          {badge > 0 && !open && (
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-gold" />
          )}
          <AnimatePresence initial={false}>
            {open && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="flex-1 whitespace-nowrap"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
          {open && badge > 0 && (
            <motion.span
              key={badge}
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 18 }}
              className="grid min-w-[18px] shrink-0 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold leading-[18px] text-black"
            >
              {badge}
            </motion.span>
          )}
        </>
      )}
    </NavLink>
  )

  if (open) return <li>{link}</li>
  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </li>
  )
}

function TopBar() {
  const { pathname } = useLocation()
  // Longest prefix wins — otherwise '/map' shadows '/map-editor'.
  const current = navItems
    .filter((i) => pathname === i.to || pathname.startsWith(`${i.to}/`) || pathname.startsWith(i.to))
    .sort((a, b) => b.to.length - a.to.length)[0]
  const user = useSession((s) => s.currentUser())

  return (
    <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <h1 className="font-display text-[19px] font-semibold text-ink">
        {current?.label ?? 'The Shelter'}
      </h1>

      <div className="ml-auto flex items-center gap-2">
        {user && (
          <span className="hidden rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] text-muted md:inline-flex">
            Viewing as{' '}
            <span className="ml-1 font-medium text-ink">{user.fullName}</span>
          </span>
        )}
        <LocationSwitcher />
        <NotificationBell />
        <ThemeToggle />
        <UserMenu trigger="avatar" />
      </div>
    </header>
  )
}

export function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Button variant="ghost" disabled className="gap-2 text-muted">
        Loading…
      </Button>
    </div>
  )
}
