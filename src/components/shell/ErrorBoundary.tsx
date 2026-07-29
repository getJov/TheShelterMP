import { Component, type ErrorInfo, type ReactNode } from 'react'
import { LogoMark } from './Logo'

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
          <h1 className="font-display text-[26px] font-semibold text-ink">
            Something went wrong
          </h1>
          <p className="mt-2 max-w-[48ch] text-[13.5px] text-muted">
            {this.state.error.message}
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-gold-deep px-4 py-2 text-[13px] font-medium text-white dark:bg-gold dark:text-[#070d0b]"
        >
          Reload
        </button>
      </div>
    )
  }
}
