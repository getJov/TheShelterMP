import { useId, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Icon } from '@/components/ui-brand/Icon'
import { IconFilter, IconSearch } from '@/components/ui-brand/icons'
import { cn } from '@/lib/utils'

export const SALES_FILTER_ALL = '__all__'

export interface SalesFilterOption {
  value: string
  label: string
}

export interface SalesFilterRenderProps<Values extends object> {
  values: Values
  setValue: <Key extends keyof Values>(key: Key, value: Values[Key]) => void
  idPrefix: string
  layout: 'desktop' | 'mobile'
}

interface SalesFilterBarProps<Values extends object> {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  searchLabel?: string
  values: Values
  emptyValues: Values
  onApply: (values: Values) => void
  renderFilters: (props: SalesFilterRenderProps<Values>) => ReactNode
  title?: string
  description?: string
  className?: string
}

/**
 * Search remains live while secondary filters use a discardable mobile draft.
 * Desktop controls apply immediately; mobile controls commit only on Apply.
 */
export function SalesFilterBar<Values extends object>({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchLabel = 'Search sales records',
  values,
  emptyValues,
  onApply,
  renderFilters,
  title = 'Filters',
  description = 'Narrow the records shown without hiding search.',
  className,
}: SalesFilterBarProps<Values>) {
  const reactId = useId().replaceAll(':', '')
  const idPrefix = `sales-filter-${reactId}`
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Values>(() => ({ ...values }))

  const activeFilterCount = useMemo(
    () => countActiveFilters(values, emptyValues),
    [emptyValues, values],
  )
  const draftFilterCount = useMemo(
    () => countActiveFilters(draft, emptyValues),
    [draft, emptyValues],
  )

  const applyDesktopValue = <Key extends keyof Values>(
    key: Key,
    value: Values[Key],
  ) => {
    const next = { ...values }
    next[key] = value
    onApply(next)
  }

  const setDraftValue = <Key extends keyof Values>(key: Key, value: Values[Key]) => {
    setDraft((current) => {
      const next = { ...current }
      next[key] = value
      return next
    })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraft({ ...values })
    setOpen(nextOpen)
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="relative min-w-0 flex-1 lg:max-w-[300px]">
        <Icon
          icon={IconSearch}
          size={15}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <Input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className="h-11 pl-8 lg:h-9"
        />
      </div>

      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        {renderFilters({
          values,
          setValue: applyDesktopValue,
          idPrefix: `${idPrefix}-desktop`,
          layout: 'desktop',
        })}
        {activeFilterCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onApply({ ...emptyValues })}
          >
            Clear filters
          </Button>
        )}
      </div>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-1.5 px-3 lg:hidden"
            aria-label={
              activeFilterCount > 0
                ? `Filters, ${activeFilterCount} active`
                : 'Filters, none active'
            }
          >
            <Icon icon={IconFilter} size={16} />
            Filters
            {activeFilterCount > 0 && (
              <span
                aria-hidden="true"
                className="inline-flex min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-semibold leading-5 text-surface"
              >
                {activeFilterCount}
              </span>
            )}
          </Button>
        </SheetTrigger>

        <SheetContent className="w-full max-w-none gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b border-line px-4 pb-4 pt-5 pr-12 text-left">
            <SheetTitle className="font-display text-[24px] font-semibold text-ink">
              {title}
            </SheetTitle>
            <SheetDescription>
              {description}
              {draftFilterCount > 0 && (
                <span className="mt-1 block text-ink">
                  {draftFilterCount} active {draftFilterCount === 1 ? 'filter' : 'filters'}.
                </span>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
            <div className="grid gap-4">
              {renderFilters({
                values: draft,
                setValue: setDraftValue,
                idPrefix: `${idPrefix}-mobile`,
                layout: 'mobile',
              })}
            </div>
          </div>

          <SheetFooter className="border-t border-line px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              className="h-11 sm:mr-auto"
              onClick={() => setDraft({ ...emptyValues })}
              disabled={draftFilterCount === 0}
            >
              Clear filters
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-11"
              onClick={() => {
                onApply({ ...draft })
                setOpen(false)
              }}
            >
              Apply filters
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function SalesFilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  allLabel,
  allValue = SALES_FILTER_ALL,
  layout,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: SalesFilterOption[]
  allLabel?: string
  allValue?: string
  layout: 'desktop' | 'mobile'
  className?: string
}) {
  const mobile = layout === 'mobile'

  return (
    <div className={cn(mobile && 'grid gap-2', className)}>
      {mobile && (
        <Label htmlFor={id} className="text-[12.5px] text-muted">
          {label}
        </Label>
      )}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          aria-label={mobile ? undefined : `Filter by ${label.toLowerCase()}`}
          className={cn(
            'h-9 w-auto min-w-[132px]',
            mobile && 'h-11 w-full min-w-0',
          )}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent align="start" className="max-w-[calc(100vw-1rem)]">
          <SelectItem value={allValue}>{allLabel ?? `All ${label.toLowerCase()}`}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function countActiveFilters<Values extends object>(
  values: Values,
  emptyValues: Values,
) {
  return (Object.keys(values) as Array<keyof Values>).reduce(
    (count, key) => count + (values[key] === emptyValues[key] ? 0 : 1),
    0,
  )
}
