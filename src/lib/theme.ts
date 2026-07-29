export type Theme = 'light' | 'dark'

const KEY = 'shelter-theme'

/** Default is light. We deliberately do NOT read prefers-color-scheme
 *  for the initial value — the client asked for light by default. */
export function getStoredTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'light'
  const v = localStorage.getItem(KEY)
  return v === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  localStorage.setItem(KEY, theme)
}

export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}
