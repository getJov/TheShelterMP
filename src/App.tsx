import type { ReactNode } from 'react'
import { RouterProvider } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/shell/ErrorBoundary'
import { router } from '@/routes'
import { useAccessibilityPreferences } from '@/stores/accessibility-preferences'

function AccessibilityMotionConfig({ children }: { children: ReactNode }) {
  const motion = useAccessibilityPreferences((state) => state.motion)
  return (
    <MotionConfig reducedMotion={motion === 'reduced' ? 'always' : 'user'}>
      {children}
    </MotionConfig>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AccessibilityMotionConfig>
        <TooltipProvider delayDuration={140}>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </AccessibilityMotionConfig>
    </ErrorBoundary>
  )
}
