import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { STATUS_APPEARANCE } from '@/domain'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusDot } from '@/components/ui-brand/StatusDot'
import { Icon } from '@/components/ui-brand/Icon'
import {
  IconClose,
  IconCollapse,
  IconCopy,
  IconEdit,
  IconExpand,
  IconLink,
  IconMore,
} from '@/components/ui-brand/icons'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import type { LotModel } from './model'
import { EASE } from './bits'

/**
 * Sticky header. Past 60px of scroll it condenses to a single line carrying
 * the code and the badge, the height animating via `layout`.
 */
export function LotHeader({
  model,
  condensed,
  restricted,
  expanded,
  onToggleExpand,
  onClose,
}: {
  model: LotModel
  condensed: boolean
  /** availability_only — no tier detail, no menu beyond copying the code. */
  restricted?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const canEdit = useCan('lot:edit')
  const appearance = STATUS_APPEARANCE[model.lot.status]

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text)
    toast.success(`${what} copied.`, { description: text })
  }

  const link = `${window.location.origin}/map?lot=${model.code}`

  return (
    <motion.header
      layout
      transition={{ duration: 0.28, ease: EASE }}
      className="sticky top-0 z-10 shrink-0 border-b border-line bg-surface/95 backdrop-blur"
    >
      <div className={cn('flex items-start gap-2 px-5', condensed ? 'py-2.5' : 'pt-4 pb-3.5')}>
        <motion.div layout="position" className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            {condensed && <StatusDot status={model.lot.status} size={16} />}
            <h2
              className={cn(
                'break-words font-display font-semibold leading-none text-ink',
                condensed ? 'text-small-title' : 'text-page-title',
              )}
            >
              {model.code}
            </h2>
            {condensed && (
              <span className="break-words text-caption text-muted">
                {restricted ? (model.tier?.name ?? '—') : appearance.label}
              </span>
            )}
          </div>

          {!condensed && (
            <>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-ink">
                {!restricted && (
                  <>
                    <StatusDot status={model.lot.status} size={16} />
                    <span style={{ color: appearance.color }} className="font-medium">
                      {appearance.label}
                    </span>
                    <span className="text-line">·</span>
                  </>
                )}
                <span>{model.tier?.name ?? 'Unassigned type'}</span>
              </p>
              <p className="mt-1 text-caption leading-snug text-muted">
                {model.block?.name ?? `Block ${model.block?.code ?? '—'}`}
                {' · '}
                {model.footprint}
                {!restricted && ` · ${model.intermentSummary}`}
              </p>
            </>
          )}
        </motion.div>

        <motion.div layout="position" className="flex shrink-0 items-center gap-0.5">
          {onToggleExpand && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted"
              aria-label={expanded ? 'Collapse to side panel' : 'Expand to full view'}
              onClick={onToggleExpand}
            >
              <Icon icon={expanded ? IconCollapse : IconExpand} size={16} />
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted"
                aria-label="Lot actions"
              >
                <Icon icon={IconMore} size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => copy(model.code, 'Lot code')}>
                <Icon icon={IconCopy} size={15} />
                Copy lot code
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => copy(link, 'Link')}>
                <Icon icon={IconLink} size={15} />
                Copy link
              </DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => navigate('/map-editor')}>
                    <Icon icon={IconEdit} size={15} />
                    Edit lot
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted"
            aria-label="Close lot detail"
            onClick={onClose}
          >
            <Icon icon={IconClose} size={16} />
          </Button>
        </motion.div>
      </div>
    </motion.header>
  )
}
