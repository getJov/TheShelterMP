import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Icon } from '@/components/ui-brand/Icon'
import { IconSettings } from '@/components/ui-brand/icons'
import {
  applyAccessibilityPreferences,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  type ContrastPreference,
  type MotionPreference,
  type TextSizePreference,
} from '@/lib/accessibility-preferences'
import { useAccessibilityPreferences } from '@/stores/accessibility-preferences'
import { cn } from '@/lib/utils'

interface DisplaySettingsProps {
  trigger?: 'icon' | 'button'
  showTrigger?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface PreferenceOptionProps {
  id: string
  value: string
  label: string
  description: string
}

interface DisplayPreferences {
  textSize: TextSizePreference
  contrast: ContrastPreference
  motion: MotionPreference
}

function PreferenceOption({ id, value, label, description }: PreferenceOptionProps) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        'min-h-11 cursor-pointer items-start rounded-lg border border-line px-3 py-2.5',
        'text-left hover:bg-surface-2 has-data-[state=checked]:border-gold',
        'has-data-[state=checked]:bg-gold/8',
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span>
        <span className="block text-control font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-caption font-normal leading-normal text-muted">
          {description}
        </span>
      </span>
    </Label>
  )
}

export function DisplaySettings({
  trigger = 'icon',
  showTrigger = true,
  open,
  onOpenChange,
}: DisplaySettingsProps) {
  const id = useId()
  const [internalOpen, setInternalOpen] = useState(false)
  const textSize = useAccessibilityPreferences((state) => state.textSize)
  const contrast = useAccessibilityPreferences((state) => state.contrast)
  const motion = useAccessibilityPreferences((state) => state.motion)
  const mapPresentation = useAccessibilityPreferences((state) => state.mapPresentation)
  const setTextSize = useAccessibilityPreferences((state) => state.setTextSize)
  const setContrast = useAccessibilityPreferences((state) => state.setContrast)
  const setMotion = useAccessibilityPreferences((state) => state.setMotion)
  const dialogOpen = open ?? internalOpen
  const [draft, setDraft] = useState<DisplayPreferences>({ textSize, contrast, motion })
  const hasChanges =
    draft.textSize !== textSize || draft.contrast !== contrast || draft.motion !== motion

  useEffect(() => {
    if (dialogOpen) setDraft({ textSize, contrast, motion })
  }, [contrast, dialogOpen, motion, textSize])

  function preview(nextDraft: DisplayPreferences) {
    setDraft(nextDraft)
    applyAccessibilityPreferences({ ...nextDraft, mapPresentation })
  }

  function changeDialogOpen(nextOpen: boolean) {
    if (!nextOpen) {
      applyAccessibilityPreferences({ textSize, contrast, motion, mapPresentation })
    }
    if (open === undefined) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  function changeTextSize(value: string) {
    if (value === 'standard' || value === 'large' || value === 'extra-large') {
      preview({ ...draft, textSize: value })
    }
  }

  function changeContrast(value: string) {
    if (value === 'standard' || value === 'enhanced') preview({ ...draft, contrast: value })
  }

  function changeMotion(value: string) {
    if (value === 'system' || value === 'reduced') preview({ ...draft, motion: value })
  }

  function resetDraft() {
    preview({
      textSize: DEFAULT_ACCESSIBILITY_PREFERENCES.textSize,
      contrast: DEFAULT_ACCESSIBILITY_PREFERENCES.contrast,
      motion: DEFAULT_ACCESSIBILITY_PREFERENCES.motion,
    })
  }

  function save() {
    setTextSize(draft.textSize)
    setContrast(draft.contrast)
    setMotion(draft.motion)
    if (open === undefined) setInternalOpen(false)
    onOpenChange?.(false)
    toast.success('Display settings saved')
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={changeDialogOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button
            variant={trigger === 'icon' ? 'ghost' : 'secondary'}
            size={trigger === 'icon' ? 'icon' : 'default'}
            aria-label={trigger === 'icon' ? 'Display settings' : undefined}
            className={trigger === 'icon' ? 'text-muted hover:text-ink' : 'gap-2'}
          >
            <Icon icon={IconSettings} size={18} />
            {trigger === 'button' && 'Display settings'}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-h-[min(90dvh,760px)] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-display text-section-title">Display settings</DialogTitle>
          <DialogDescription className="text-body leading-normal">
            Preview your choices, then select Save changes. These settings stay on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <fieldset className="space-y-2">
            <legend className="text-small-title font-semibold text-ink">Text size</legend>
            <RadioGroup value={draft.textSize} onValueChange={changeTextSize} className="gap-2">
              <PreferenceOption id={`${id}-text-standard`} value="standard" label="Standard" description="Comfortable default text throughout the app." />
              <PreferenceOption id={`${id}-text-large`} value="large" label="Large" description="Makes every text role 12.5% larger." />
              <PreferenceOption id={`${id}-text-extra-large`} value="extra-large" label="Extra Large" description="Makes every text role 25% larger." />
            </RadioGroup>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-small-title font-semibold text-ink">Contrast</legend>
            <RadioGroup value={draft.contrast} onValueChange={changeContrast} className="gap-2 sm:grid-cols-2">
              <PreferenceOption id={`${id}-contrast-standard`} value="standard" label="Standard" description="Uses the repaired default color contrast." />
              <PreferenceOption id={`${id}-contrast-enhanced`} value="enhanced" label="Enhanced" description="Strengthens text, controls, and focus boundaries." />
            </RadioGroup>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-small-title font-semibold text-ink">Motion</legend>
            <RadioGroup value={draft.motion} onValueChange={changeMotion} className="gap-2 sm:grid-cols-2">
              <PreferenceOption id={`${id}-motion-system`} value="system" label="Follow device" description="Uses your device motion preference." />
              <PreferenceOption id={`${id}-motion-reduced`} value="reduced" label="Reduced" description="Removes non-essential movement in the app." />
            </RadioGroup>
          </fieldset>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={resetDraft}>
            Reset display settings
          </Button>
          <Button type="button" variant="ghost" onClick={() => changeDialogOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!hasChanges} onClick={save}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
