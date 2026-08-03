import {
  Component,
  StrictMode,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import {
  RouteTopBarActionProvider,
  RouteTopBarActionSlot,
  useRouteTopBarAction,
} from '@/components/shell/RouteTopBarAction'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { IconDashboard, IconMap } from '@/components/ui-brand/icons'
import '@/styles/globals.css'

interface ProviderErrorBoundaryState {
  message: string | null
}

class ProviderErrorBoundary extends Component<
  { children: ReactNode },
  ProviderErrorBoundaryState
> {
  state: ProviderErrorBoundaryState = { message: null }

  static getDerivedStateFromError(error: unknown): ProviderErrorBoundaryState {
    return {
      message: error instanceof Error ? error.message : String(error),
    }
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    // The expected developer error is rendered below for the browser contract.
  }

  render() {
    if (this.state.message) {
      return (
        <output data-provider-error={this.state.message}>
          {this.state.message}
        </output>
      )
    }

    return this.props.children
  }
}

function MissingProviderProbe() {
  useRouteTopBarAction(null)
  return null
}

interface RegistrationProps {
  id: 'action-a' | 'action-b'
  label: string
  count: number
  disabled: boolean
  callbackVersion: number
  onActivate: (value: string) => void
}

function Registration({
  id,
  label,
  count,
  disabled,
  callbackVersion,
  onActivate,
}: RegistrationProps) {
  useRouteTopBarAction({
    id,
    label,
    icon: id === 'action-a' ? IconDashboard : IconMap,
    disabled,
    badge: {
      count,
      label: `${count} items need attention`,
    },
    onActivate: () => onActivate(`${id}-v${callbackVersion}`),
  })

  return null
}

function ActionHarness() {
  const location = useLocation()
  const navigate = useNavigate()
  const [showA, setShowA] = useState(true)
  const [showB, setShowB] = useState(false)
  const [count, setCount] = useState(5)
  const [label, setLabel] = useState('Open dashboard')
  const [disabled, setDisabled] = useState(false)
  const [callbackVersion, setCallbackVersion] = useState(1)
  const [activation, setActivation] = useState('none')
  const canRegister = location.pathname === '/one'

  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden bg-bg text-ink">
      <header
        className="flex min-h-14 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 sm:gap-2 sm:px-4"
        data-fixture-top-bar
      >
        <Button type="button" variant="ghost" size="icon" aria-label="Open navigation">
          <span aria-hidden="true">N</span>
        </Button>
        <h1 className="min-w-0 flex-1 overflow-hidden font-display text-small-title font-semibold [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] sm:block sm:truncate">
          Sales &amp; Payments responsive contract fixture
        </h1>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2" data-fixture-slot>
          <RouteTopBarActionSlot />
          <Button type="button" variant="ghost" size="icon" aria-label="Notifications">
            <span aria-hidden="true">B</span>
          </Button>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-auto p-3 outline-none"
      >
        <p data-harness-path>{location.pathname}</p>
        <output data-activation>{activation}</output>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={() => setShowA((value) => !value)} data-toggle-a>
            Toggle A
          </Button>
          <Button type="button" onClick={() => setShowB((value) => !value)} data-toggle-b>
            Toggle B
          </Button>
          <Button type="button" onClick={() => setCount(8)} data-count-eight>
            Count 8
          </Button>
          <Button type="button" onClick={() => setCount(120)} data-count-cap>
            Count 120
          </Button>
          <Button type="button" onClick={() => setCount(0)} data-count-zero>
            Count 0
          </Button>
          <Button type="button" onClick={() => setCount(-2)} data-count-negative>
            Count negative
          </Button>
          <Button
            type="button"
            onClick={() => setLabel('Open attention dashboard')}
            data-update-label
          >
            Update label
          </Button>
          <Button type="button" onClick={() => setDisabled((value) => !value)} data-toggle-disabled>
            Toggle disabled
          </Button>
          <Button
            type="button"
            onClick={() => setCallbackVersion((value) => value + 1)}
            data-update-callback
          >
            Update callback
          </Button>
          <Button type="button" onClick={() => navigate('/two')} data-go-two>
            Go to route two
          </Button>
          <Button type="button" onClick={() => navigate('/one')} data-go-one>
            Go to route one
          </Button>
        </div>
      </main>

      {canRegister && showA && (
        <Registration
          id="action-a"
          label={label}
          count={count}
          disabled={disabled}
          callbackVersion={callbackVersion}
          onActivate={setActivation}
        />
      )}
      {canRegister && showB && (
        <Registration
          id="action-b"
          label="Open map"
          count={2}
          disabled={false}
          callbackVersion={callbackVersion}
          onActivate={setActivation}
        />
      )}
    </div>
  )
}

function NavigationLayerHarness() {
  const [blockerActivations, setBlockerActivations] = useState(0)

  return (
    <div className="h-dvh overflow-hidden bg-bg text-ink" data-navigation-layer-fixture>
      <header className="fixed inset-x-0 top-0 z-[999] flex h-14 items-center border-b border-line bg-surface px-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Open navigation layer fixture"
            >
              <span aria-hidden="true">N</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="shell-mobile-navigation flex w-[min(90vw,360px)] flex-col p-0"
            data-shell-mobile-navigation
          >
            <SheetHeader className="border-b border-line px-4 py-4 text-left">
              <SheetTitle>Navigation layer fixture</SheetTitle>
              <SheetDescription>
                Verifies the shell layer contract above route-owned surfaces.
              </SheetDescription>
            </SheetHeader>
            <nav className="flex flex-col gap-2 p-4" aria-label="Fixture navigation">
              <Button type="button" data-fixture-navigation-first>
                First navigation choice
              </Button>
              <Button type="button" variant="secondary" data-fixture-navigation-last>
                Last navigation choice
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
        <span className="ml-3 font-semibold">Route layer ceiling</span>
      </header>

      <button
        type="button"
        className="fixed inset-x-0 bottom-0 top-14 z-[999] bg-surface-2"
        data-route-layer-blocker
        onClick={() => setBlockerActivations((value) => value + 1)}
      >
        Route-owned surface at layer 999
      </button>
      <output className="sr-only" data-route-layer-blocker-activations>
        {blockerActivations}
      </output>
    </div>
  )
}

const navigationLayerFixture = new URLSearchParams(window.location.search).has(
  'navigation-layer',
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/one']}>
      <TooltipProvider>
        <RouteTopBarActionProvider>
          {navigationLayerFixture ? <NavigationLayerHarness /> : <ActionHarness />}
        </RouteTopBarActionProvider>
        <ProviderErrorBoundary>
          <MissingProviderProbe />
        </ProviderErrorBoundary>
      </TooltipProvider>
    </MemoryRouter>
  </StrictMode>,
)
