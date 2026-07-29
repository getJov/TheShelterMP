import { useSession } from '@/stores/session'
import { useCurrentUserOrNull, useVisibleLocations } from '@/lib/permissions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icon } from '@/components/ui-brand/Icon'
import { IconLocation } from '@/components/ui-brand/icons'
import type { LocationId } from '@/domain'

const ALL = '__all__'

export function LocationSwitcher() {
  const user = useCurrentUserOrNull()
  const locations = useVisibleLocations()
  const activeId = useSession((s) => s.activeLocationId)
  const switchLocation = useSession((s) => s.switchLocation)

  if (!user) return null

  const canSwitch = user.role === 'owner' || user.role === 'admin'

  // A dropdown they cannot open is worse than plain text.
  if (!canSwitch) {
    const loc = locations[0]
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-muted">
        <Icon icon={IconLocation} size={14} />
        {loc?.name ?? '—'}
      </span>
    )
  }

  return (
    <Select
      value={activeId ?? ALL}
      onValueChange={(v) => switchLocation(v === ALL ? null : (v as LocationId))}
    >
      <SelectTrigger size="sm" className="h-8 w-[190px] text-[12.5px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All locations</SelectItem>
        {locations.map((l) => (
          <SelectItem key={l.id} value={l.id}>
            {l.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
