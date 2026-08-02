import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from '@/components/ui-brand/Icon'
import { IconFitBounds } from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGoogleMap } from '@/features/map/google/map-view'
import { zoomMapIn, zoomMapOut } from '@/features/map/google/helpers'

const EASE = [0.22, 1, 0.36, 1] as const

export function ZoomControls({
  moved,
  onFit,
}: {
  moved: boolean
  onFit: () => void
}) {
  const map = useGoogleMap()

  return (
    <div className="pointer-events-none flex flex-col items-end gap-2">
      <AnimatePresence>
        {moved && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={onFit}
              className="pointer-events-auto gap-1.5 border border-line bg-surface/90 text-control shadow-md backdrop-blur"
            >
              <Icon icon={IconFitBounds} size={14} />
              Reset view
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-line bg-surface/90 shadow-md backdrop-blur">
        <ZoomButton label="Zoom in" onClick={() => zoomMapIn(map)}>
          <span aria-hidden className="text-small-title leading-none">
            +
          </span>
        </ZoomButton>
        <div className="h-px bg-line" />
        <ZoomButton label="Zoom out" onClick={() => zoomMapOut(map)}>
          <span aria-hidden className="text-small-title leading-none">
            −
          </span>
        </ZoomButton>
        <div className="h-px bg-line" />
        <ZoomButton label="Fit the whole park" onClick={onFit}>
          <Icon icon={IconFitBounds} size={15} />
        </ZoomButton>
      </div>
    </div>
  )
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className="grid size-11 place-items-center text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}
