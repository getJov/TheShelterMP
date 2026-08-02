import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { navItems } from './nav-items'

export function routeTitleFor(pathname: string) {
  return (
    navItems
      .filter(
        (item) =>
          pathname === item.to ||
          pathname.startsWith(`${item.to}/`) ||
          pathname.startsWith(item.to),
      )
      .sort((a, b) => b.to.length - a.to.length)[0]?.label ?? 'The Shelter'
  )
}

export function RouteAccessibility() {
  const { pathname } = useLocation()
  const title = useMemo(() => routeTitleFor(pathname), [pathname])
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    document.title = `${title} | The Shelter`
    setAnnouncement('')

    const frame = window.requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true })
      setAnnouncement(`${title} loaded`)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [pathname, title])

  return (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </span>
  )
}
