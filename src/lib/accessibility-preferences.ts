export type TextSizePreference = 'standard' | 'large' | 'extra-large'
export type ContrastPreference = 'standard' | 'enhanced'
export type MotionPreference = 'system' | 'reduced'
export type MapPresentationPreference = 'map' | 'list'

export interface AccessibilityPreferences {
  textSize: TextSizePreference
  contrast: ContrastPreference
  motion: MotionPreference
  mapPresentation: MapPresentationPreference
}

export const ACCESSIBILITY_STORAGE_KEY = 'shelter-accessibility'
export const ACCESSIBILITY_SCHEMA_VERSION = 1

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  textSize: 'standard',
  contrast: 'standard',
  motion: 'system',
  mapPresentation: 'map',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseAccessibilityPreferences(value: unknown): AccessibilityPreferences {
  const record = isRecord(value) && isRecord(value.state) ? value.state : value
  if (!isRecord(record)) return { ...DEFAULT_ACCESSIBILITY_PREFERENCES }

  return {
    textSize:
      record.textSize === 'large' || record.textSize === 'extra-large'
        ? record.textSize
        : 'standard',
    contrast: record.contrast === 'enhanced' ? 'enhanced' : 'standard',
    motion: record.motion === 'reduced' ? 'reduced' : 'system',
    mapPresentation: record.mapPresentation === 'list' ? 'list' : 'map',
  }
}

export function getStoredAccessibilityPreferences(): AccessibilityPreferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_ACCESSIBILITY_PREFERENCES }

  try {
    const stored = localStorage.getItem(ACCESSIBILITY_STORAGE_KEY)
    return stored ? parseAccessibilityPreferences(JSON.parse(stored)) : { ...DEFAULT_ACCESSIBILITY_PREFERENCES }
  } catch {
    // Corrupt or unavailable storage must not prevent the app from starting.
    return { ...DEFAULT_ACCESSIBILITY_PREFERENCES }
  }
}

export function applyAccessibilityPreferences(preferences: AccessibilityPreferences) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.dataset.textSize = preferences.textSize
  root.dataset.contrast = preferences.contrast
  root.dataset.motion = preferences.motion
}
