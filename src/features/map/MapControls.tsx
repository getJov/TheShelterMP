import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LOT_STATUSES,
  STATUS_APPEARANCE,
  ZOOM,
  type LotId,
  type MapViewMode,
} from '@/domain'
import { useMapStore, filterCount } from '@/stores/map'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconClose,
  IconFilter,
  IconLayers,
  IconOverlay,
  IconSatellite,
  IconSearch,
  IconSliders,
} from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAllowedViewModes, lotMatches, type MapData } from './use-map-data'

const EASE = [0.22, 1, 0.36, 1] as const

function useCompact() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 900,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const on = () => setCompact(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return compact
}

export function MapControls({
  data,
  onGoToLot,
}: {
  data: MapData
  onGoToLot: (id: LotId) => void
}) {
  const compact = useCompact()
  const [open, setOpen] = useState(!compact)
  useEffect(() => setOpen(!compact), [compact])

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-[600] flex flex-col items-start gap-2">
      {compact && (
        <Button
          size="icon"
          variant="secondary"
          className="pointer-events-auto size-9 border border-line bg-surface/90 shadow-md backdrop-blur"
          aria-label={open ? 'Hide map controls' : 'Show map controls'}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon icon={open ? IconClose : IconSliders} size={17} />
        </Button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="pointer-events-auto w-[288px] rounded-xl border border-line bg-surface/88 p-3 shadow-lg backdrop-blur-md"
          >
            <Panel data={data} onGoToLot={onGoToLot} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Panel({ data, onGoToLot }: { data: MapData; onGoToLot: (id: LotId) => void }) {
  const modes = useAllowedViewModes()
  const viewMode = useMapStore((s) => s.viewMode)
  const setViewMode = useMapStore((s) => s.setViewMode)
  const baseLayer = useMapStore((s) => s.baseLayer)
  const setBaseLayer = useMapStore((s) => s.setBaseLayer)
  const showOverlay = useMapStore((s) => s.showOverlay)
  const setShowOverlay = useMapStore((s) => s.setShowOverlay)
  const overlayOpacity = useMapStore((s) => s.overlayOpacity)
  const setOverlayOpacity = useMapStore((s) => s.setOverlayOpacity)
  const showLabels = useMapStore((s) => s.showLabels)
  const setShowLabels = useMapStore((s) => s.setShowLabels)
  const zoom = useMapStore((s) => s.zoom)

  const hasOverlay = data.overlays.length > 0
  const labelsAvailable = zoom >= ZOOM.labelsVisible

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="eyebrow text-muted">Colour by</Label>
        <Select
          value={viewMode}
          onValueChange={(v) => setViewMode(v as MapViewMode)}
        >
          <SelectTrigger
            aria-label="Colour by"
            className="h-auto min-h-9 w-full bg-surface py-2.5 text-[13px] *:data-[slot=select-value]:line-clamp-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modes.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="flex flex-col items-start">
                  <span>{m.label}</span>
                  <span className="text-[11px] text-muted">{m.hint}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="eyebrow text-muted">Base layer</Label>
        <ToggleGroup
          type="single"
          value={baseLayer}
          onValueChange={(v) => v && setBaseLayer(v as 'satellite' | 'plain')}
          className="w-full"
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="satellite" className="flex-1 gap-1.5 text-[12.5px]">
            <Icon icon={IconSatellite} size={15} />
            Satellite
          </ToggleGroupItem>
          <ToggleGroupItem value="plain" className="flex-1 gap-1.5 text-[12.5px]">
            <Icon icon={IconLayers} size={15} />
            Plain
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Separator />

      <SearchBox data={data} onGoToLot={onGoToLot} />

      <div className="space-y-2.5">
        <Row
          label="Show site plan"
          icon={IconOverlay}
          disabled={!hasOverlay}
          hint={hasOverlay ? undefined : 'No published overlay for this location'}
        >
          <Switch
            checked={showOverlay && hasOverlay}
            disabled={!hasOverlay}
            onCheckedChange={setShowOverlay}
            aria-label="Show site plan"
          />
        </Row>
        {showOverlay && hasOverlay && (
          <div className="flex items-center gap-2 pl-0.5">
            <Slider
              value={[overlayOpacity]}
              min={0}
              max={100}
              step={1}
              onValueChange={([v]) => setOverlayOpacity(v ?? 0)}
              aria-label="Site plan opacity"
              className="flex-1"
            />
            <span className="tabular w-9 text-right text-[11.5px] text-muted">
              {overlayOpacity}%
            </span>
          </div>
        )}

        <Row
          label="Show lot numbers"
          disabled={!labelsAvailable}
          hint={labelsAvailable ? undefined : `Available at zoom ${ZOOM.labelsVisible}+`}
        >
          <Switch
            checked={showLabels}
            disabled={!labelsAvailable}
            onCheckedChange={setShowLabels}
            aria-label="Show lot numbers"
          />
        </Row>
      </div>

      <Separator />
      <FilterPopover data={data} />
    </div>
  )
}

function Row({
  label,
  icon,
  hint,
  disabled,
  children,
}: {
  label: string
  icon?: React.ComponentProps<typeof Icon>['icon']
  hint?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  const body = (
    <div
      className={cn(
        'flex items-center justify-between gap-2',
        disabled && 'opacity-55',
      )}
    >
      <span className="flex items-center gap-1.5 text-[13px] text-ink">
        {icon && <Icon icon={icon} size={15} className="text-muted" />}
        {label}
      </span>
      {children}
    </div>
  )
  if (!hint) return body
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{body}</div>
      </TooltipTrigger>
      <TooltipContent side="right">{hint}</TooltipContent>
    </Tooltip>
  )
}

function SearchBox({
  data,
  onGoToLot,
}: {
  data: MapData
  onGoToLot: (id: LotId) => void
}) {
  const query = useMapStore((s) => s.filters.query)
  const setQuery = useMapStore((s) => s.setQuery)

  const results = useMemo(() => {
    const q = query.trim()
    if (q.length < 1) return []
    const f = {
      statuses: new Set<never>(),
      tierIds: new Set<never>(),
      blockIds: new Set<never>(),
      agentIds: new Set<never>(),
      query: q,
    }
    return data.lots.filter((l) => lotMatches(l, f as never)).slice(0, 8)
  }, [query, data.lots])

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Icon
          icon={IconSearch}
          size={15}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) onGoToLot(results[0].lot.id)
            if (e.key === 'Escape') setQuery('')
          }}
          placeholder="Find B01-L047 or 47"
          aria-label="Search lots"
          className="h-9 bg-surface pl-8 text-[13px]"
        />
      </div>
      {results.length > 0 && (
        <ScrollArea className="max-h-40 rounded-md border border-line-soft bg-surface">
          <ul className="p-1">
            {results.map((r) => (
              <li key={r.lot.id}>
                <button
                  onClick={() => onGoToLot(r.lot.id)}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] hover:bg-surface-2"
                >
                  <span className="font-mono text-ink">{r.code}</span>
                  <span
                    className="text-[11px]"
                    style={{ color: STATUS_APPEARANCE[r.lot.status].color }}
                  >
                    {STATUS_APPEARANCE[r.lot.status].label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}

function FilterPopover({ data }: { data: MapData }) {
  const filters = useMapStore((s) => s.filters)
  const toggleFilter = useMapStore((s) => s.toggleFilter)
  const clearFilters = useMapStore((s) => s.clearFilters)
  const n = filterCount(filters)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-full justify-start gap-2 bg-surface text-[13px]"
        >
          <Icon icon={IconFilter} size={15} />
          Filters
          {n > 0 && (
            <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[11px]">
              {n}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-64 p-0">
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 p-3">
            <Group title="Status">
              {LOT_STATUSES.map((s) => (
                <Check
                  key={s}
                  id={`f-status-${s}`}
                  checked={filters.statuses.has(s)}
                  onChange={() => toggleFilter('statuses', s)}
                  label={STATUS_APPEARANCE[s].label}
                  swatch={STATUS_APPEARANCE[s].color}
                />
              ))}
            </Group>
            <Separator />
            <Group title="Lot type">
              {data.tiers.map((t) => (
                <Check
                  key={t.id}
                  id={`f-tier-${t.id}`}
                  checked={filters.tierIds.has(t.id)}
                  onChange={() => toggleFilter('tierIds', t.id)}
                  label={t.name}
                  swatch={t.appearance.fillColor}
                />
              ))}
            </Group>
            <Separator />
            <Group title="Block">
              {data.blocks.map((b) => (
                <Check
                  key={b.id}
                  id={`f-block-${b.id}`}
                  checked={filters.blockIds.has(b.id)}
                  onChange={() => toggleFilter('blockIds', b.id)}
                  label={`${b.code} · ${b.name ?? ''}`}
                />
              ))}
            </Group>
          </div>
        </ScrollArea>
        <div className="border-t border-line p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-[12.5px]"
            onClick={clearFilters}
            disabled={n === 0}
          >
            Clear all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="eyebrow text-muted">{title}</p>
      {children}
    </div>
  )
}

function Check({
  id,
  checked,
  onChange,
  label,
  swatch,
}: {
  id: string
  checked: boolean
  onChange: () => void
  label: string
  swatch?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="flex flex-1 items-center gap-1.5 text-[12.5px] font-normal">
        {swatch && (
          <span
            className="size-2.5 shrink-0 rounded-full border border-line"
            style={{ background: swatch }}
          />
        )}
        <span className="truncate">{label}</span>
      </Label>
    </div>
  )
}
