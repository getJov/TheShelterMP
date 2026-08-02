import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import App from '@/App'
import {
  applyAccessibilityPreferences,
  getStoredAccessibilityPreferences,
} from '@/lib/accessibility-preferences'

/**
 * ?demo=1 — start from a clean slate.
 *
 * All record mutations live in memory and are rebuilt from the seed on any
 * reload, so this only needs to clear the PERSISTED UI state: who you were
 * signed in as, the panel and rail positions, map preferences, and the theme.
 * Rehearsing the walkthrough five times should not leave the real run in a
 * half-collapsed dashboard as somebody else.
 */
if (new URLSearchParams(window.location.search).has('demo')) {
  for (const key of [
    'shelter-session',
    'shelter-panel',
    'shelter-map',
    'shelter-rail-open',
    'shelter-theme',
  ]) {
    localStorage.removeItem(key)
  }
  const url = new URL(window.location.href)
  url.searchParams.delete('demo')
  window.history.replaceState({}, '', url)
}

applyAccessibilityPreferences(getStoredAccessibilityPreferences())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
