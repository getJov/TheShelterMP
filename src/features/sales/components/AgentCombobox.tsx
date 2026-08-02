import { useMemo, useState } from 'react'
import type { AgentId, AgentProfile } from '@/domain'
import { useDataset, indexes } from '@/stores/dataset'
import { levelLabel } from '@/stores/agents'
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
import { IconSelectorDown, IconUser } from '@/components/ui-brand/icons'
import { cn } from '@/lib/utils'

/** Active agents only — archived stay attributable on existing contracts. */
export function AgentCombobox({
  value,
  onChange,
  id,
  required = false,
  describedBy,
  invalid,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  required?: boolean
  describedBy?: string
  invalid?: boolean
}) {
  const version = useDataset((s) => s.version)
  const agents = useDataset((s) => s.data.agents)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const pool = useMemo(() => {
    void version
    return agents
      .filter((a) => a.status === 'active')
      .map((a) => ({
        agent: a,
        name: indexes().usersById.get(a.userId)?.fullName ?? a.agentCode,
      }))
  }, [agents, version])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pool.slice(0, 40)
    return pool
      .filter(({ agent, name }) =>
        `${name} ${agent.agentCode} ${levelLabel(agent.level)}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 40)
  }, [pool, query])

  const selected = value
    ? (pool.find((r) => r.agent.id === value) ?? null)
    : null

  return (
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
          <span className={cn('flex min-w-0 items-center gap-2', !selected && 'text-muted')}>
            {selected ? (
              <>
                <span className="whitespace-normal break-words text-body">{selected.name}</span>
                <span className="shrink-0 font-mono text-caption text-muted">
                  {selected.agent.agentCode}
                </span>
              </>
            ) : (
              'Select an agent'
            )}
          </span>
          <Icon icon={IconSelectorDown} size={15} className="opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        collisionPadding={8}
        className="w-[var(--radix-popover-trigger-width)] min-w-0 max-w-[calc(100vw-1rem)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or agent code"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {matches.length === 0 && (
              <CommandEmpty>No agent matches “{query.trim()}”.</CommandEmpty>
            )}
            {matches.length > 0 && (
              <CommandGroup heading={`Active agents (${matches.length})`}>
                {matches.map(({ agent, name }) => (
                  <AgentOption
                    key={agent.id}
                    agent={agent}
                    name={name}
                    selected={agent.id === value}
                    onSelect={() => {
                      onChange(agent.id)
                      setOpen(false)
                      setQuery('')
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

function AgentOption({
  agent,
  name,
  selected,
  onSelect,
}: {
  agent: AgentProfile
  name: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <CommandItem
      value={agent.id as AgentId}
      onSelect={onSelect}
      className="min-h-11 gap-2 py-2 sm:min-h-0 sm:py-1.5"
    >
      <Icon
        icon={IconUser}
        size={15}
        className={cn(selected ? 'text-gold-deep dark:text-gold' : 'text-muted')}
      />
      <span className="min-w-0 flex-1">
        <span className="block whitespace-normal break-words text-body text-ink">{name}</span>
        <span className="block whitespace-normal break-words font-mono text-caption text-muted">
          {agent.agentCode} · {levelLabel(agent.level)}
        </span>
      </span>
    </CommandItem>
  )
}
