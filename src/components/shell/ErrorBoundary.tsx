import { Component, type ErrorInfo, type ReactNode } from 'react'
import { LogoMark } from './Logo'
import { Button } from '@/components/ui/button'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[shelter] render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
        <LogoMark size={44} className="text-gold-deep/50 dark:text-gold/50" />
        <div>
          <h1 className="font-display text-page-title font-semibold text-ink">
            Something went wrong
          </h1>
          <p className="mt-2 max-w-[48ch] text-body text-muted">
            {this.state.error.message}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      </div>
    )
  }
}
