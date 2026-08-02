import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Icon } from '@/components/ui-brand/Icon'
import { IconChevronDown, IconPublish, IconWarning } from '@/components/ui-brand/icons'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { IconCheck } from '@/components/ui-brand/icons'
import { useCurrentUser } from '@/lib/permissions'
import { useMapStore } from '@/stores/map'
import { cn } from '@/lib/utils'
import { useEditor, type PublishAudit } from './store'
import type { ChangeGroup, ChangeReport } from './helpers'
import { conflictSummary, type GeometryValidationReport } from './geometry-validation'

/**
 * The review. Every change in the client's own words, grouped, expandable to
 * the affected lot codes, with anything touching a sold or occupied lot pulled
 * out into its own prominent group.
 */
export function PublishDialog({
  open,
  onOpenChange,
  report,
  validation,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  report: ChangeReport
  validation: GeometryValidationReport
}) {
  const publish = useEditor((s) => s.publish)
  const overlays = useEditor((s) => s.overlays)
  const user = useCurrentUser()
  const navigate = useNavigate()

  const confirm = () => {
    const audit: PublishAudit[] = [...report.soldGroups, ...report.groups].map((g) => ({
      action: g.action,
      entityType: g.entityType,
      entityId: g.entityId,
      label: g.label,
      count: g.count,
      codes: g.codes,
    }))
    publish(user.id, audit)

    // A published site plan should be visible the moment the client looks.
    const shown = overlays.find((o) => o.visible)
    if (shown) {
      useMapStore.getState().setShowOverlay(true)
      useMapStore.getState().setOverlayOpacity(Math.round(shown.opacity * 100))
    }

    onOpenChange(false)
    toast.success('Published to the live map', {
      description: `${report.total} change${report.total === 1 ? '' : 's'} applied.`,
      action: { label: 'Open the map', onClick: () => navigate('/map') },
      duration: 8000,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Publish {report.total} changes</DialogTitle>
          <DialogDescription>
            Everything below is staged. Confirming writes it to the live map, records it in the
            audit trail and clears the undo history.
          </DialogDescription>
        </DialogHeader>

        {report.total === 0 ? (
          <EmptyState compact icon={IconCheck} title="Nothing to publish" body="The draft matches the live map." />
        ) : (
          <ScrollArea className="max-h-[46vh] pr-3">
            {validation.blockingCount > 0 && (
              <section className="mb-3 rounded-lg border border-gold/50 bg-gold/8 p-2.5">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-gold-deep dark:text-gold">
                  <Icon icon={IconWarning} size={14} />
                  {validation.blockingCount.toLocaleString()} layout warning
                  {validation.blockingCount === 1 ? '' : 's'} — publishing is still allowed
                </p>
                <ul className="space-y-1 text-[11.5px] text-gold-deep dark:text-gold">
                  {conflictSummary(validation).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            )}
            {report.soldGroups.length > 0 && (
              <section className="mb-3 rounded-lg border border-gold/50 bg-gold/8 p-2.5">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-gold-deep dark:text-gold">
                  <Icon icon={IconWarning} size={14} />
                  Touches sold or occupied lots · {report.soldTouched}
                </p>
                <div className="space-y-1">
                  {report.soldGroups.map((g) => (
                    <GroupRow key={g.id} group={g} />
                  ))}
                </div>
                <p className="mt-2 text-[11.5px] leading-snug text-gold-deep dark:text-gold">
                  Their contracts, prices and burials are untouched — a contract snapshots its price
                  when it is written.
                </p>
              </section>
            )}

            <div className="space-y-1">
              {report.groups.map((g) => (
                <GroupRow key={g.id} group={g} />
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Keep editing
          </Button>
          <Button className="gap-1.5" disabled={report.total === 0} onClick={confirm}>
            <Icon icon={IconPublish} size={15} />
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroupRow({ group }: { group: ChangeGroup }) {
  const [open, setOpen] = useState(false)
  const expandable = group.codes.length > 0
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        disabled={!expandable}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-2 text-left transition-colors',
          expandable && 'hover:bg-surface-2',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-ink">{group.label}</span>
          {group.detail && (
            <span className="block text-[11px] leading-snug text-muted">{group.detail}</span>
          )}
        </span>
        {expandable && (
          <>
            <span className="shrink-0 font-mono text-[10.5px] text-muted">
              {group.codes.length}
            </span>
            <Icon
              icon={IconChevronDown}
              size={14}
              className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
            />
          </>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 flex flex-wrap gap-1 rounded-md border border-line bg-surface-2 p-2">
          {group.codes.slice(0, 240).map((c) => (
            <span key={c} className="font-mono text-[10.5px] text-muted">
              {c}
            </span>
          ))}
          {group.codes.length > 240 && (
            <span className="text-[10.5px] text-muted">
              and {group.codes.length - 240} more
            </span>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
