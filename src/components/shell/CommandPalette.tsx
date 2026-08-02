import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconLot,
  IconMoon,
  IconSun,
  IconUser,
} from '@/components/ui-brand/icons'
import { navItems } from './nav-items'
import { canAny, clientFullName, formatLotCode, ROLE_LABEL, type Permission } from '@/domain'
import { useDataset } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import { getStoredTheme, applyTheme } from '@/lib/theme'

/**
 * ⌘K. Makes the demo fast to drive — every route, every lot by code, every
 * client and agent by name, and the role switcher, one keystroke away.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const data = useDataset((s) => s.data)
  const user = useSession((s) => s.currentUser())
  const switchUser = useSession((s) => s.switchUser)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const blockByLot = useMemo(
    () => new Map(data.blocks.map((b) => [b.id, b.code])),
    [data.blocks],
  )

  const routes = useMemo(
    () =>
      user
        ? navItems.filter((i) => {
            const ps = (Array.isArray(i.permission) ? i.permission : [i.permission]) as Permission[]
            return canAny(user.role, ps)
          })
        : [],
    [user],
  )

  // Lot search only runs on a real query — 904 rows is too many to list idle.
  const lots = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (q.length < 2) return []
    return data.lots
      .filter((l) => {
        const code = formatLotCode(blockByLot.get(l.blockId) ?? '', l.lotNumber)
        return code.includes(q) || String(l.lotNumber) === q
      })
      .slice(0, 6)
      .map((l) => ({ lot: l, code: formatLotCode(blockByLot.get(l.blockId) ?? '', l.lotNumber) }))
  }, [query, data.lots, blockByLot])

  const people = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return data.clients
      .filter((c) => clientFullName(c).toLowerCase().includes(q) || c.clientRef.toLowerCase().includes(q))
      .slice(0, 5)
  }, [query, data.clients])

  const go = (to: string) => {
    setOpen(false)
    setQuery('')
    navigate(to)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Go to a screen, find a lot, a client, or switch role…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        <CommandGroup heading="Go to">
          {routes.map((r) => (
            <CommandItem key={r.to} value={`go ${r.label}`} onSelect={() => go(r.to)}>
              <Icon icon={r.icon} size={16} />
              {user?.role === 'agent' && r.agentLabel ? r.agentLabel : r.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {lots.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Lots">
              {lots.map(({ lot, code }) => (
                <CommandItem
                  key={lot.id}
                  value={`lot ${code}`}
                  onSelect={() => go(`/map?lot=${code}`)}
                >
                  <Icon icon={IconLot} size={16} />
                  <span className="font-mono">{code}</span>
                  <span className="ml-auto text-caption text-muted">
                    {data.tiers.find((t) => t.id === lot.tierId)?.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {people.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clients">
              {people.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`client ${clientFullName(c)}`}
                  onSelect={() => go(`/sales?client=${c.id}`)}
                >
                  <Icon icon={IconUser} size={16} />
                  {clientFullName(c)}
                  <span className="ml-auto font-mono text-caption text-muted">{c.clientRef}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Switch to…">
          {data.users
            .filter((u) => u.status === 'active' && u.id !== user?.id)
            .slice(0, 8)
            .map((u) => (
              <CommandItem
                key={u.id}
                value={`switch ${u.fullName} ${u.role}`}
                onSelect={() => {
                  switchUser(u.id)
                  setOpen(false)
                  setQuery('')
                }}
              >
                <Icon icon={IconUser} size={16} />
                {u.fullName}
                <span className="ml-auto text-caption text-muted">{ROLE_LABEL[u.role]}</span>
              </CommandItem>
            ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Display">
          <CommandItem
            value="toggle theme dark light"
            onSelect={() => {
              applyTheme(getStoredTheme() === 'dark' ? 'light' : 'dark')
              setOpen(false)
            }}
          >
            <Icon icon={getStoredTheme() === 'dark' ? IconSun : IconMoon} size={16} />
            Toggle {getStoredTheme() === 'dark' ? 'light' : 'dark'} mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
