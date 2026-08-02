import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from '@/components/ui-brand/Icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { canAny, type Permission } from '@/domain'
import { useCanAny } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useDataset } from '@/stores/dataset'
import { useNotifications } from '@/stores/notifications'
import { useSession } from '@/stores/session'
import { navItems, type NavItem } from './nav-items'

interface AppNavigationProps {
  expanded: boolean
  instance: 'rail' | 'mobile'
  ariaLabel: string
  className?: string
  onNavigate?: () => void
}

/**
 * The permission-aware application navigation shared by the desktop rail and
 * mobile sheet. Both surfaces deliberately read from the same nav definition
 * so role labels, badges, and route visibility cannot drift.
 */
export function AppNavigation({
  expanded,
  instance,
  ariaLabel,
  className,
  onNavigate,
}: AppNavigationProps) {
  const main = navItems.filter((item) => item.section !== 'manage')
  const manage = navItems.filter((item) => item.section === 'manage')

  return (
    <nav aria-label={ariaLabel} className={className}>
      <NavList
        items={main}
        expanded={expanded}
        instance={instance}
        onNavigate={onNavigate}
      />
      <ManageSection
        items={manage}
        expanded={expanded}
        instance={instance}
        onNavigate={onNavigate}
      />
    </nav>
  )
}

/**
 * Hidden entirely when the user holds none of its permissions — which is
 * exactly what an agent sees. A "Manage" heading over an empty list reads
 * as a broken screen.
 */
function ManageSection({
  items,
  expanded,
  instance,
  onNavigate,
}: {
  items: NavItem[]
  expanded: boolean
  instance: AppNavigationProps['instance']
  onNavigate?: () => void
}) {
  const user = useSession((state) => state.currentUser())
  if (!user) return null

  const anyVisible = items.some((item) => {
    const permissions = Array.isArray(item.permission)
      ? item.permission
      : [item.permission]
    return canAny(user.role, permissions as Permission[])
  })
  if (!anyVisible) return null

  return (
    <>
      <div className="my-3 border-t border-line-soft" />
      {expanded && <p className="eyebrow px-2.5 pb-1.5 text-muted">Manage</p>}
      <NavList
        items={items}
        expanded={expanded}
        instance={instance}
        onNavigate={onNavigate}
      />
    </>
  )
}

function NavList({
  items,
  expanded,
  instance,
  onNavigate,
}: {
  items: NavItem[]
  expanded: boolean
  instance: AppNavigationProps['instance']
  onNavigate?: () => void
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <NavRow
          key={item.to}
          item={item}
          expanded={expanded}
          instance={instance}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  )
}

function NavRow({
  item,
  expanded,
  instance,
  onNavigate,
}: {
  item: NavItem
  expanded: boolean
  instance: AppNavigationProps['instance']
  onNavigate?: () => void
}) {
  const permissions = (Array.isArray(item.permission)
    ? item.permission
    : [item.permission]) as Permission[]
  const allowed = useCanAny(...permissions)
  const user = useSession((state) => state.currentUser())

  // Both versions keep approval badges live when holds change or a role switch
  // changes which approval queue belongs to the current user.
  const notificationsVersion = useNotifications((state) => state.version)
  const datasetVersion = useDataset((state) => state.version)
  const approvalCounts = useNotifications((state) => state.approvalCounts)
  const badge = useMemo(() => {
    void notificationsVersion
    void datasetVersion
    return item.badge === 'approvals' && user ? approvalCounts(user).all : 0
  }, [item.badge, user, approvalCounts, notificationsVersion, datasetVersion])

  if (!allowed) return null

  const label =
    user?.role === 'agent' && item.agentLabel ? item.agentLabel : item.label

  const link = (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors',
          !expanded && 'justify-center',
          instance === 'mobile' && 'min-h-11',
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
              layoutId={`${instance}-nav-active`}
              className="absolute bottom-1.5 left-0 top-1.5 w-[2.5px] rounded-r bg-gold"
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            />
          )}
          <Icon icon={item.icon} size={18} />
          {badge > 0 && !expanded && (
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-gold" />
          )}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className={cn(
                  'flex-1',
                  instance === 'mobile'
                    ? 'min-w-0 break-words leading-tight'
                    : 'whitespace-nowrap',
                )}
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
          {expanded && badge > 0 && (
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

  if (expanded) return <li>{link}</li>

  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </li>
  )
}
