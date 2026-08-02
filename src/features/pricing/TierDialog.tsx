import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { MarkerType, Tier, TierAppearance, TierCategory } from '@/domain'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icon } from '@/components/ui-brand/Icon'
import { IconInfo } from '@/components/ui-brand/icons'
import { useCurrentUser } from '@/lib/permissions'
import { usePricing } from '@/stores/pricing'
import { TierPreview } from './TierPreview'
import { ContrastGuard } from './TierCard'
import { checkFillAgainstBadges, darken, isHexColor, suggestFill } from './contrast'

const CATEGORIES: { value: TierCategory; label: string }[] = [
  { value: 'lawn', label: 'Lawn' },
  { value: 'family_garden', label: 'Family garden' },
  { value: 'mausoleum', label: 'Mausoleum' },
]

const MARKERS: { value: MarkerType; label: string }[] = [
  { value: 'flat_marble', label: 'Flat marble' },
  { value: 'upright', label: 'Upright' },
  { value: 'none', label: 'None' },
]

const PATTERNS: TierAppearance['pattern'][] = ['none', 'diagonal', 'dots', 'cross']

interface Draft {
  name: string
  code: string
  category: TierCategory
  description: string
  widthM: string
  lengthM: string
  capacity: string
  markerType: MarkerType
  appearance: TierAppearance
}

function draftFrom(tier: Tier): Draft {
  return {
    name: tier.name,
    code: tier.code,
    category: tier.category,
    description: tier.description,
    widthM: String(tier.widthM),
    lengthM: String(tier.lengthM),
    capacity: String(tier.capacity),
    markerType: tier.markerType,
    appearance: { ...tier.appearance },
  }
}

export function TierDialog({
  open,
  onOpenChange,
  tier,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** null → create. */
  tier: Tier | null
}) {
  const user = useCurrentUser()
  const tiers = usePricing((s) => s.tiers)()
  const createTier = usePricing((s) => s.createTier)
  const updateTier = usePricing((s) => s.updateTier)

  const blank = useMemo<Draft>(() => {
    const fill = suggestFill(
      'lawn',
      tiers.map((t) => t.appearance.fillColor),
    )
    return {
      name: '',
      code: '',
      category: 'lawn',
      description: '',
      widthM: '1.00',
      lengthM: '2.44',
      capacity: '2',
      markerType: 'flat_marble',
      appearance: {
        fillColor: fill,
        strokeColor: darken(fill),
        strokeWidth: 0.5,
        pattern: 'none',
        shortLabel: '',
      },
    }
  }, [tiers])

  const [draft, setDraft] = useState<Draft>(blank)

  useEffect(() => {
    if (!open) return
    setDraft(tier ? draftFrom(tier) : blank)
  }, [open, tier, blank])

  const warnings = checkFillAgainstBadges(draft.appearance.fillColor)
  const widthM = Number(draft.widthM)
  const lengthM = Number(draft.lengthM)
  const capacity = Number(draft.capacity)

  const valid =
    draft.name.trim().length > 0 &&
    draft.code.trim().length > 0 &&
    Number.isFinite(widthM) &&
    widthM > 0 &&
    Number.isFinite(lengthM) &&
    lengthM > 0 &&
    Number.isFinite(capacity) &&
    capacity > 0 &&
    isHexColor(draft.appearance.fillColor) &&
    isHexColor(draft.appearance.strokeColor)

  function submit() {
    if (!valid) return
    const shared = {
      name: draft.name.trim(),
      code: draft.code.trim().toUpperCase(),
      category: draft.category,
      description: draft.description.trim(),
      widthM,
      lengthM,
      capacity,
      markerType: draft.markerType,
      appearance: {
        ...draft.appearance,
        shortLabel:
          draft.appearance.shortLabel.trim() ||
          draft.code.trim().slice(0, 3).toUpperCase(),
      },
    }
    if (tier) {
      updateTier(tier.id, shared, user.id)
      toast.success(`${shared.name} updated`, {
        description:
          'Appearance is live on the map. Existing lot geometry is reviewed and synced from the map editor.',
      })
    } else {
      createTier(
        { ...shared, sortOrder: tiers.length + 1 },
        user.id,
      )
      toast.success(`${shared.name} created`, {
        description: 'Set a price for it before it can be sold.',
      })
    }
    onOpenChange(false)
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))
  const setApp = <K extends keyof TierAppearance>(k: K, v: TierAppearance[K]) =>
    setDraft((d) => ({ ...d, appearance: { ...d.appearance, [k]: v } }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{tier ? `Edit ${tier.name}` : 'New lot type'}</DialogTitle>
          <DialogDescription>
            A tier controls both what a product costs and what it looks like on
            the map. Appearance changes take effect immediately; existing lot
            geometry is reviewed and synced safely from the map editor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_auto] gap-5">
          <div className="min-w-0 space-y-3.5">
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Field label="Name">
                <Input
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Lawn Premium"
                />
              </Field>
              <Field label="Code">
                <Input
                  value={draft.code}
                  onChange={(e) => set('code', e.target.value.toUpperCase())}
                  placeholder="LAWN_PREM"
                  className="font-mono text-caption"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select
                  value={draft.category}
                  onValueChange={(v) => {
                    const category = v as TierCategory
                    setDraft((d) => {
                      const fill = suggestFill(
                        category,
                        tiers.map((t) => t.appearance.fillColor),
                      )
                      return tier
                        ? { ...d, category }
                        : {
                            ...d,
                            category,
                            appearance: {
                              ...d.appearance,
                              fillColor: fill,
                              strokeColor: darken(fill),
                            },
                          }
                    })
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Marker">
                <Select
                  value={draft.markerType}
                  onValueChange={(v) => set('markerType', v as MarkerType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKERS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Description">
              <Textarea
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                rows={2}
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Width (m)">
                <Input
                  value={draft.widthM}
                  onChange={(e) => set('widthM', e.target.value)}
                  inputMode="decimal"
                  className="tabular"
                />
              </Field>
              <Field label="Length (m)">
                <Input
                  value={draft.lengthM}
                  onChange={(e) => set('lengthM', e.target.value)}
                  inputMode="decimal"
                  className="tabular"
                />
              </Field>
              <Field label="Capacity">
                <Input
                  value={draft.capacity}
                  onChange={(e) => set('capacity', e.target.value)}
                  inputMode="numeric"
                  className="tabular"
                />
              </Field>
            </div>

            <p className="flex items-start gap-2 text-caption leading-relaxed text-muted">
              <Icon icon={IconInfo} size={14} className="mt-0.5 shrink-0" />
              Sync dimension changes to existing lots in the map editor. Resolve overlaps or
              outside-block conflicts before publishing. Existing lots keep their recorded
              capacity.
            </p>
          </div>

          <div className="shrink-0 space-y-3">
            <TierPreview
              appearance={draft.appearance}
              widthM={Number.isFinite(widthM) && widthM > 0 ? widthM : 1}
              lengthM={Number.isFinite(lengthM) && lengthM > 0 ? lengthM : 2.44}
              status="available"
            />
            <Field label="Fill">
              <Input
                value={draft.appearance.fillColor}
                onChange={(e) => setApp('fillColor', e.target.value)}
                className="w-[132px] font-mono text-caption"
                spellCheck={false}
              />
            </Field>
            <Field label="Stroke">
              <Input
                value={draft.appearance.strokeColor}
                onChange={(e) => setApp('strokeColor', e.target.value)}
                className="w-[132px] font-mono text-caption"
                spellCheck={false}
              />
            </Field>
            <Field label={`Stroke width · ${draft.appearance.strokeWidth.toFixed(1)}`}>
              <Slider
                value={[draft.appearance.strokeWidth]}
                min={0.2}
                max={3}
                step={0.1}
                className="w-[132px]"
                onValueChange={([v]) => setApp('strokeWidth', v ?? 0.5)}
              />
            </Field>
            <Field label="Pattern">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={draft.appearance.pattern}
                onValueChange={(v) => v && setApp('pattern', v as TierAppearance['pattern'])}
                className="w-[132px] flex-wrap"
              >
                {PATTERNS.map((p) => (
                  <ToggleGroupItem key={p} value={p} className="text-micro capitalize">
                    {p}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field label="Short label">
              <Input
                value={draft.appearance.shortLabel}
                maxLength={4}
                onChange={(e) => setApp('shortLabel', e.target.value.toUpperCase())}
                className="w-[132px] font-mono uppercase"
              />
            </Field>
          </div>
        </div>

        <ContrastGuard warnings={warnings} />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {tier ? 'Save changes' : 'Create lot type'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="eyebrow mb-1.5 block text-muted">{label}</Label>
      {children}
    </div>
  )
}
