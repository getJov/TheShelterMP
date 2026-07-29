import { AnimatePresence, motion } from 'framer-motion'
import { useMap } from 'react-leaflet'
import { Icon } from '@/components/ui-brand/Icon'
import { IconFitBounds } from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Leaflet's own control is unstyleable enough to be a liability; this is the
 * same three actions in the brand's own chrome.
 */
export function ZoomControls({
  moved,
  onFit,
}: {
  moved: boolean
  onFit: () => void
}) {
  const map = useMap()

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
              className="pointer-events-auto h-8 gap-1.5 border border-line bg-surface/90 text-[12.5px] shadow-md backdrop-blur"
            >
              <Icon icon={IconFitBounds} size={14} />
              Reset view
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-line bg-surface/90 shadow-md backdrop-blur">
        <ZoomButton label="Zoom in" onClick={() => map.zoomIn()}>
          <span aria-hidden className="text-[17px] leading-none">
            +
          </span>
        </ZoomButton>
        <div className="h-px bg-line" />
        <ZoomButton label="Zoom out" onClick={() => map.zoomOut()}>
          <span aria-hidden className="text-[17px] leading-none">
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
          className="grid size-9 place-items-center text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}
