import { RouterProvider } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/shell/ErrorBoundary'
import { router } from '@/routes'

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={140}>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </MotionConfig>
    </ErrorBoundary>
  )
}
