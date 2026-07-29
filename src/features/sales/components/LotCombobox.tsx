import { useMemo, useState } from 'react'
import type { LotId } from '@/domain'
import { useDataset, indexes } from '@/stores/dataset'
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
import { StatusDot } from '@/components/ui-brand/StatusDot'
import { Icon } from '@/components/ui-brand/Icon'
import { IconSelectorDown } from '@/components/ui-brand/icons'
import { useSession } from '@/stores/session'
import { lotCodeOf } from '../lib'
import { cn } from '@/lib/utils'

/** Available and held lots only — a sold lot cannot start a new contract. */
export function LotCombobox({
  value,
  onChange,
  id,
}: {
  value: LotId | null
  onChange: (v: LotId) => void
  id?: string
}) {
  const version = useDataset((s) => s.version)
  const lots = useDataset((s) => s.data.lots)
  const activeLocationId = useSession((s) => s.activeLocationId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const pool = useMemo(() => {
    void version
    return lots.filter(
      (l) =>
        (l.status === 'available' || l.status === 'held') &&
        (!activeLocationId || l.locationId === activeLocationId),
    )
  }, [lots, activeLocationId, version])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const withCodes = pool.map((l) => ({
      lot: l,
      code: lotCodeOf(l),
      tier: indexes().tiersById.get(l.tierId)?.name ?? '—',
    }))
    if (!q) return withCodes.slice(0, 40)
    return withCodes
      .filter((r) => `${r.code} ${r.tier}`.toLowerCase().includes(q))
      .slice(0, 40)
  }, [pool, query])

  const selected = value ? indexes().lotsById.get(value) : null

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
          <span className={cn('flex min-w-0 items-center gap-2', !selected && 'text-muted')}>
            {selected && <StatusDot status={selected.status} size={15} />}
            <span className="truncate font-mono text-[13px]">
              {selected ? lotCodeOf(selected) : 'Select a lot'}
            </span>
            {selected && (
              <span className="truncate font-sans text-[12px] text-muted">
                {indexes().tiersById.get(selected.tierId)?.name}
              </span>
            )}
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
            placeholder="Search by lot code or tier"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[300px]">
            {matches.length === 0 && <CommandEmpty>No available lot matches.</CommandEmpty>}
            {matches.length > 0 && (
              <CommandGroup heading={`Available & held (${matches.length})`}>
                {matches.map((r) => (
                  <CommandItem
                    key={r.lot.id}
                    value={r.lot.id}
                    onSelect={() => {
                      onChange(r.lot.id)
                      setOpen(false)
                    }}
                    className="gap-2"
                  >
                    <StatusDot status={r.lot.status} size={15} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12.5px] text-ink">
                        {r.code}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted">
                        {r.tier}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
