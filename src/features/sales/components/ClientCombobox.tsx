import { useMemo, useState } from 'react'
import { clientFullName, type Client, type ClientId } from '@/domain'
import { useDataset } from '@/stores/dataset'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Icon } from '@/components/ui-brand/Icon'
import { IconSelectorDown, IconStar, IconUser } from '@/components/ui-brand/icons'
import { cn } from '@/lib/utils'

export type BuyerValue =
  | { kind: 'client'; clientId: ClientId }
  | { kind: 'prospect'; name: string }
  | null

/**
 * Real sales start with a name and nothing else. The combobox searches the
 * client book by name, reference or phone, and always offers
 * "New prospect — {typed name}" so an agent is never forced to open a full
 * client record before they can hold a lot.
 */
export function ClientCombobox({
  value,
  onChange,
  allowProspect = true,
  placeholder = 'Search clients by name, reference or phone',
  exclude,
  id,
}: {
  value: BuyerValue
  onChange: (v: BuyerValue) => void
  allowProspect?: boolean
  placeholder?: string
  exclude?: ClientId | null
  id?: string
}) {
  const clients = useDataset((s) => s.data.clients)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = exclude ? clients.filter((c) => c.id !== exclude) : clients
    if (!q) return pool.slice(0, 40)
    return pool
      .filter((c) => {
        const hay = `${clientFullName(c)} ${c.clientRef} ${c.phone} ${c.city}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 40)
  }, [clients, query, exclude])

  const label = useMemo(() => {
    if (!value) return null
    if (value.kind === 'prospect') return `${value.name} · new prospect`
    const c = clients.find((x) => x.id === value.clientId)
    return c ? clientFullName(c) : null
  }, [value, clients])

  const trimmed = query.trim()
  const showProspect =
    allowProspect &&
    trimmed.length >= 2 &&
    !matches.some((c) => clientFullName(c).toLowerCase() === trimmed.toLowerCase())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !label && 'text-muted')}>
            {label ?? 'Select a buyer'}
          </span>
          <Icon icon={IconSelectorDown} size={15} className="opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[300px]">
            {matches.length === 0 && !showProspect && (
              <CommandEmpty>No client matches “{trimmed}”.</CommandEmpty>
            )}

            {showProspect && (
              <CommandGroup heading="Walk-in">
                <CommandItem
                  value={`prospect-${trimmed}`}
                  onSelect={() => {
                    onChange({ kind: 'prospect', name: trimmed })
                    setOpen(false)
                  }}
                  className="gap-2"
                >
                  <Icon icon={IconStar} size={15} className="text-gold-deep dark:text-gold" />
                  <span className="text-[13px]">
                    New prospect — <span className="font-medium text-ink">{trimmed}</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {matches.length > 0 && (
              <CommandGroup heading={`Clients (${matches.length})`}>
                {matches.map((c) => (
                  <ClientOption
                    key={c.id}
                    client={c}
                    selected={value?.kind === 'client' && value.clientId === c.id}
                    onSelect={() => {
                      onChange({ kind: 'client', clientId: c.id })
                      setOpen(false)
                    }}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ClientOption({
  client,
  selected,
  onSelect,
}: {
  client: Client
  selected: boolean
  onSelect: () => void
}) {
  return (
    <CommandItem value={client.id} onSelect={onSelect} className="gap-2">
      <Icon
        icon={IconUser}
        size={15}
        className={cn(selected ? 'text-gold-deep dark:text-gold' : 'text-muted')}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">
          {clientFullName(client)}
          {client.seniorCitizen && (
            <span className="ml-1.5 text-[10.5px] uppercase tracking-wide text-gold-deep dark:text-gold">
              senior
            </span>
          )}
        </span>
        <span className="block truncate font-mono text-[11px] text-muted">
          {client.clientRef} · {client.phone}
        </span>
      </span>
    </CommandItem>
  )
}
