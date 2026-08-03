import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import type { IconSvgElement } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon } from '@/components/ui-brand/Icon'

export interface RouteTopBarActionDescriptor {
  id: string
  label: string
  icon: IconSvgElement
  onActivate: () => void
  disabled?: boolean
  badge?: {
    count: number
    label: string
  }
}

type RegistrationToken = symbol

interface ActiveRegistration {
  token: RegistrationToken
  routeKey: string
  descriptor: RouteTopBarActionDescriptor
}

type RegistryAction =
  | {
      type: 'register'
      token: RegistrationToken
      routeKey: string
      descriptor: RouteTopBarActionDescriptor
    }
  | {
      type: 'update'
      token: RegistrationToken
      descriptor: RouteTopBarActionDescriptor
    }
  | {
      type: 'unregister'
      token: RegistrationToken
    }

interface RegistrationControls {
  register: (
    token: RegistrationToken,
    routeKey: string,
    descriptor: RouteTopBarActionDescriptor,
  ) => void
  update: (
    token: RegistrationToken,
    descriptor: RouteTopBarActionDescriptor,
  ) => void
  unregister: (token: RegistrationToken) => void
}

const RegistrationContext = createContext<RegistrationControls | null>(null)
const SlotStateContext = createContext<ActiveRegistration | null>(null)

function registrationReducer(
  active: ActiveRegistration | null,
  action: RegistryAction,
): ActiveRegistration | null {
  switch (action.type) {
    case 'register':
      return {
        token: action.token,
        routeKey: action.routeKey,
        descriptor: action.descriptor,
      }
    case 'update':
      if (active?.token !== action.token) return active
      return { ...active, descriptor: action.descriptor }
    case 'unregister':
      return active?.token === action.token ? null : active
  }
}

export function RouteTopBarActionProvider({ children }: { children: ReactNode }) {
  const [active, dispatch] = useReducer(registrationReducer, null)
  const controls = useMemo<RegistrationControls>(
    () => ({
      register: (token, routeKey, descriptor) => {
        dispatch({ type: 'register', token, routeKey, descriptor })
      },
      update: (token, descriptor) => {
        dispatch({ type: 'update', token, descriptor })
      },
      unregister: (token) => {
        dispatch({ type: 'unregister', token })
      },
    }),
    [],
  )

  return (
    <RegistrationContext.Provider value={controls}>
      <SlotStateContext.Provider value={active}>
        {children}
      </SlotStateContext.Provider>
    </RegistrationContext.Provider>
  )
}

/**
 * Publish one action into the authenticated shell's compact top bar.
 *
 * Call this hook unconditionally. Pass null whenever the current route state
 * should not expose an action.
 */
export function useRouteTopBarAction(
  action: RouteTopBarActionDescriptor | null,
): void {
  const controls = useContext(RegistrationContext)
  const location = useLocation()
  const tokenRef = useRef<RegistrationToken>(Symbol('route-top-bar-action'))
  const descriptorRef = useRef(action)
  descriptorRef.current = action

  if (!controls) {
    throw new Error(
      'useRouteTopBarAction must be used inside RouteTopBarActionProvider',
    )
  }

  const isRegistered = action !== null

  useLayoutEffect(() => {
    if (!isRegistered) return

    const descriptor = descriptorRef.current
    if (!descriptor) return

    const token = tokenRef.current
    controls.register(token, location.key, descriptor)

    return () => {
      controls.unregister(token)
    }
  }, [controls, isRegistered, location.key])

  useLayoutEffect(() => {
    if (action) {
      controls.update(tokenRef.current, action)
    }
  }, [action, controls])
}

export function RouteTopBarActionSlot() {
  const active = useContext(SlotStateContext)
  const location = useLocation()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const focusedOwnerTokenRef = useRef<RegistrationToken | null>(null)
  const pathnameRef = useRef(location.pathname)
  pathnameRef.current = location.pathname

  const isVisible = active?.routeKey === location.key
  const descriptor = isVisible ? active.descriptor : null
  const ownerToken = isVisible ? active.token : null

  useLayoutEffect(() => {
    const ownedButton = buttonRef.current
    const ownerPathname = location.pathname
    const ownedToken = ownerToken

    return () => {
      const didOwnFocus =
        ownedButton?.contains(document.activeElement) ||
        focusedOwnerTokenRef.current === ownedToken
      if (!didOwnFocus) return
      if (pathnameRef.current !== ownerPathname) return

      window.requestAnimationFrame(() => {
        if (pathnameRef.current !== ownerPathname) return

        const focusedElement = document.activeElement
        if (
          focusedElement &&
          focusedElement !== document.body &&
          focusedElement !== document.documentElement &&
          focusedElement.isConnected
        ) {
          return
        }

        document
          .getElementById('main-content')
          ?.focus({ preventScroll: true })
      })
    }
  }, [location.pathname, ownerToken])

  if (!descriptor) return null

  const hasBadge =
    descriptor.badge !== undefined &&
    Number.isFinite(descriptor.badge.count) &&
    descriptor.badge.count > 0
  const badgeText = hasBadge
    ? descriptor.badge!.count > 99
      ? '99+'
      : String(descriptor.badge!.count)
    : null
  const accessibleName = hasBadge
    ? `${descriptor.label}, ${descriptor.badge!.label}`
    : descriptor.label

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={buttonRef}
          type="button"
          variant="ghost"
          size="icon"
          disabled={descriptor.disabled}
          onClick={descriptor.onActivate}
          onFocus={() => {
            focusedOwnerTokenRef.current = ownerToken
          }}
          onBlur={(event) => {
            if (event.relatedTarget instanceof Node && event.relatedTarget.isConnected) {
              focusedOwnerTokenRef.current = null
            }
          }}
          aria-label={accessibleName}
          className="relative shrink-0 text-muted hover:text-ink"
          data-shell-route-action
          data-route-action-id={descriptor.id}
        >
          <Icon icon={descriptor.icon} size={18} />
          {badgeText && (
            <span
              aria-hidden="true"
              data-shell-route-action-badge
              className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-micro font-bold leading-5 text-white"
            >
              {badgeText}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{descriptor.label}</TooltipContent>
    </Tooltip>
  )
}
