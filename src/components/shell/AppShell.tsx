import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { LogoLockup, LogoMark } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { CommandPalette } from './CommandPalette'
import { AppNavigation } from './AppNavigation'
import { DisplaySettings } from './DisplaySettings'
import { RouteAccessibility, routeTitleFor } from './RouteAccessibility'
import { Icon } from '@/components/ui-brand/Icon'
import { IconClose, IconMenu, IconSidebar } from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { UserMenu } from '@/features/auth/UserMenu'
import { LocationSwitcher } from '@/features/auth/LocationSwitcher'
import { NotificationBell } from '@/features/approvals/NotificationBell'
import { useSession } from '@/stores/session'

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
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-md bg-ink px-4 py-3 text-control font-semibold text-bg shadow-lg transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <Rail open={railOpen} onToggle={() => setRailOpen((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          id="main-content"
          tabIndex={-1}
          className="relative min-h-0 flex-1 overflow-hidden outline-none"
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <RouteAccessibility />
    </div>
  )
}

function Rail({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const user = useSession((s) => s.currentUser())

  return (
    <motion.aside
      layout
      initial={false}
      animate={{ width: open ? 232 : 68 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="z-30 hidden shrink-0 flex-col border-r border-line bg-surface lg:flex"
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

      <AppNavigation
        expanded={open}
        instance="rail"
        ariaLabel="Primary navigation"
        className="flex-1 overflow-y-auto px-2.5 py-3"
      />

      <div className="border-t border-line p-2.5">
        {user && <UserMenu compact={!open} />}
        <Button
          type="button"
          variant="ghost"
          onClick={onToggle}
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          className={cn(
            'mt-1.5 w-full gap-2.5 px-2.5 text-control text-muted',
            'hover:bg-surface-2 hover:text-ink',
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
        </Button>
      </div>
    </motion.aside>
  )
}

function TopBar() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { pathname } = useLocation()
  const title = routeTitleFor(pathname)
  const user = useSession((s) => s.currentUser())

  useEffect(() => {
    const desktopViewport = window.matchMedia('(min-width: 1024px)')
    const closeMobileNavigation = () => {
      if (desktopViewport.matches) setMobileNavOpen(false)
    }

    closeMobileNavigation()
    desktopViewport.addEventListener('change', closeMobileNavigation)
    return () => desktopViewport.removeEventListener('change', closeMobileNavigation)
  }, [])

  return (
    <header className="z-20 flex h-14 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-2.5 sm:gap-3 sm:px-4">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted hover:text-ink lg:hidden"
            aria-label="Open navigation"
          >
            <Icon icon={IconMenu} size={19} />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[min(90vw,360px)] max-w-none gap-0 border-line bg-surface p-0 sm:max-w-none lg:hidden"
        >
          <SheetHeader className="relative h-14 justify-center border-b border-line px-3 py-0 pr-14 text-left">
            <SheetTitle className="sr-only">Application navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Choose a section of The Shelter application.
            </SheetDescription>
            <div className="flex min-w-0 items-center gap-2.5">
              <LogoMark size={24} className="text-gold-deep dark:text-gold" />
              <span className="truncate font-display text-[15px] font-semibold tracking-[0.12em] text-ink">
                THE SHELTER
              </span>
            </div>
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1.5 top-1.5 size-11 text-muted hover:text-ink"
                aria-label="Close navigation"
              >
                <Icon icon={IconClose} size={18} />
              </Button>
            </SheetClose>
          </SheetHeader>

          <AppNavigation
            expanded
            instance="mobile"
            ariaLabel="Mobile navigation"
            className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3"
            onNavigate={() => setMobileNavOpen(false)}
          />

          <div className="space-y-2 border-t border-line px-2.5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <div className="min-w-0 overflow-hidden [&>span]:w-full [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap [&_[data-slot=select-trigger]]:w-full">
              <LocationSwitcher />
            </div>
            <div className="flex min-h-11 items-center justify-between rounded-md px-2 text-[13px] text-muted">
              <span>Display</span>
              <DisplaySettings trigger="button" />
            </div>
            <div className="flex min-h-11 items-center justify-between rounded-md px-2 text-[13px] text-muted">
              <span>Appearance</span>
              <ThemeToggle />
            </div>
            {user && <UserMenu />}
          </div>
        </SheetContent>
      </Sheet>

      <h1 className="min-w-0 flex-1 truncate font-display text-small-title font-semibold text-ink">
        {title}
      </h1>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
        {user && (
          <span className="hidden rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] text-muted xl:inline-flex">
            Viewing as{' '}
            <span className="ml-1 font-medium text-ink">{user.fullName}</span>
          </span>
        )}
        <div className="hidden lg:block">
          <LocationSwitcher />
        </div>
        <NotificationBell />
        <div className="hidden lg:block">
          <DisplaySettings />
        </div>
        <div className="hidden lg:block">
          <ThemeToggle />
        </div>
        <div className="hidden sm:block">
          <UserMenu trigger="avatar" />
        </div>
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
