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
import { IconAdd, IconSelectorDown, IconUser } from '@/components/ui-brand/icons'
import { cn } from '@/lib/utils'
import { CreateClientDialog } from './CreateClientDialog'

/**
 * Buyer picker for holds, contracts and transfers. Searches the client book
 * and always offers client creation so walk-ins can move straight into a sale.
 */
export function ClientCombobox({
  value,
  onChange,
  placeholder = 'Search clients by name, reference or phone',
  exclude,
  id,
  required = false,
  describedBy,
  invalid,
}: {
  value: ClientId | null
  onChange: (v: ClientId | null) => void
  placeholder?: string
  exclude?: ClientId | null
  id?: string
  required?: boolean
  describedBy?: string
  invalid?: boolean
}) {
  const clients = useDataset((s) => s.data.clients)
  const version = useDataset((s) => s.version)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const matches = useMemo(() => {
    void version
    const q = query.trim().toLowerCase()
    const pool = exclude ? clients.filter((client) => client.id !== exclude) : clients
    if (!q) return pool.slice(0, 40)
    return pool
      .filter((client) => {
        const hay =
          `${clientFullName(client)} ${client.clientRef} ${client.phone} ${client.city}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 40)
  }, [clients, query, exclude, version])

  const selected = useMemo(() => {
    void version
    return value ? (clients.find((client) => client.id === value) ?? null) : null
  }, [clients, value, version])

  const label = selected ? clientFullName(selected) : null
  const trimmed = query.trim()

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-required={required || undefined}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="w-full justify-between font-normal"
          >
            <span
              className={cn(
                'min-w-0 whitespace-normal break-words text-left',
                !label && 'text-muted',
              )}
            >
              {label ?? 'Select a buyer'}
            </span>
            <Icon icon={IconSelectorDown} size={15} className="opacity-60" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] min-w-[min(320px,calc(100vw-2rem))] p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={placeholder}
              value={query}
              onValueChange={setQuery}
            />
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-body font-medium text-ink outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setOpen(false)
                setCreateOpen(true)
              }}
            >
              <Icon icon={IconAdd} size={15} className="text-gold-deep dark:text-gold" />
              Create new client
            </button>
            <CommandList className="max-h-[260px]">
              {matches.length === 0 && (
                <CommandEmpty>
                  {trimmed ? `No client matches "${trimmed}".` : 'No clients yet.'}
                </CommandEmpty>
              )}

              {matches.length > 0 && (
                <CommandGroup heading={`Clients (${matches.length})`}>
                  {matches.map((client) => (
                    <ClientOption
                      key={client.id}
                      client={client}
                      selected={value === client.id}
                      onSelect={() => {
                        onChange(client.id)
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

      <CreateClientDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialName={trimmed}
        onCreated={(clientId) => {
          onChange(clientId)
          setQuery('')
        }}
      />
    </>
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
        <span className="block whitespace-normal break-words text-body text-ink">
          {clientFullName(client)}
          {client.seniorCitizen && (
            <span className="ml-1.5 text-micro uppercase tracking-wide text-gold-deep dark:text-gold">
              senior
            </span>
          )}
        </span>
        <span className="block whitespace-normal break-words font-mono text-caption text-muted">
          {client.clientRef} · {client.phone}
        </span>
      </span>
    </CommandItem>
  )
}
