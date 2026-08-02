import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  ACCESSIBILITY_SCHEMA_VERSION,
  ACCESSIBILITY_STORAGE_KEY,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  applyAccessibilityPreferences,
  getStoredAccessibilityPreferences,
  parseAccessibilityPreferences,
  type AccessibilityPreferences,
  type ContrastPreference,
  type MapPresentationPreference,
  type MotionPreference,
  type TextSizePreference,
} from '@/lib/accessibility-preferences'

interface AccessibilityPreferencesStore extends AccessibilityPreferences {
  setTextSize: (textSize: TextSizePreference) => void
  setContrast: (contrast: ContrastPreference) => void
  setMotion: (motion: MotionPreference) => void
  setMapPresentation: (mapPresentation: MapPresentationPreference) => void
  reset: () => void
}

function currentPreferences(state: AccessibilityPreferencesStore): AccessibilityPreferences {
  return {
    textSize: state.textSize,
    contrast: state.contrast,
    motion: state.motion,
    mapPresentation: state.mapPresentation,
  }
}

const initialPreferences = getStoredAccessibilityPreferences()

export const useAccessibilityPreferences = create<AccessibilityPreferencesStore>()(
  persist(
    (set) => ({
      ...initialPreferences,
      setTextSize: (textSize) =>
        set((state) => {
          applyAccessibilityPreferences({ ...currentPreferences(state), textSize })
          return { textSize }
        }),
      setContrast: (contrast) =>
        set((state) => {
          applyAccessibilityPreferences({ ...currentPreferences(state), contrast })
          return { contrast }
        }),
      setMotion: (motion) =>
        set((state) => {
          applyAccessibilityPreferences({ ...currentPreferences(state), motion })
          return { motion }
        }),
      setMapPresentation: (mapPresentation) => set({ mapPresentation }),
      reset: () => {
        applyAccessibilityPreferences(DEFAULT_ACCESSIBILITY_PREFERENCES)
        set({ ...DEFAULT_ACCESSIBILITY_PREFERENCES })
      },
    }),
    {
      name: ACCESSIBILITY_STORAGE_KEY,
      version: ACCESSIBILITY_SCHEMA_VERSION,
      partialize: (state) => currentPreferences(state),
      merge: (persisted, current) => ({
        ...current,
        ...parseAccessibilityPreferences(persisted),
      }),
    },
  ),
)
