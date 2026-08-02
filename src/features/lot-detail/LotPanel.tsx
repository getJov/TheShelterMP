import { useEffect, useMemo, useState, type UIEvent } from 'react'
import { motion } from 'framer-motion'
import { formatLotCode, type Lot } from '@/domain'
import { Accordion } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui-brand/Icon'
import { IconClose, IconUnavailable } from '@/components/ui-brand/icons'
import { useCan, useCurrentAgent, useLotVisibility } from '@/lib/permissions'
import { indexes, useDataset } from '@/stores/dataset'
import { useLotModel } from './model'
import { useLotDetailUi, type SectionId } from './store'
import { LotHeader } from './LotHeader'
import { IdentityBlock } from './IdentityBlock'
import { LotFooter } from './LotFooter'
import { LedgerPanel } from './LedgerPanel'
import {
  CommissionBody,
  ContractBody,
  DocumentsBody,
  HistoryBody,
  IntermentsBody,
  PaymentsBody,
  commissionSummary,
  paymentsSummary,
} from './sections'
import { EASE, Section } from './bits'
import { cn } from '@/lib/utils'

export type PanelVariant = 'drawer' | 'dialog'

/**
 * The visibility fork, made deliberately rather than as a fallthrough.
 *
 * Under `availability_only` a lot that is not available renders the
 * restricted panel and NOTHING else — the money model is never even built,
 * so there is no owner, no balance and no date to leak.
 */
export function LotPanel({
  lot,
  variant,
  focusSection,
  onClose,
  onToggleExpand,
}: {
  lot: Lot
  variant: PanelVariant
  /** From `/map?lot=…&drawer=payments` — opens straight to that section. */
  focusSection?: SectionId | null
  onClose: () => void
  onToggleExpand?: () => void
}) {
  const visibility = useLotVisibility(lot)

  if (visibility !== 'full' && lot.status !== 'available') {
    return <RestrictedPanel lot={lot} onClose={onClose} />
  }
  return (
    <FullPanel
      lot={lot}
      variant={variant}
      focusSection={focusSection}
      onClose={onClose}
      onToggleExpand={onToggleExpand}
    />
  )
}

// ── the agent's restricted drawer ────────────────────────────────────
function RestrictedPanel({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const version = useDataset((s) => s.version)
  const shell = useMemo(() => {
    void version
    const idx = indexes()
    const block = idx.blocksById.get(lot.blockId) ?? null
    const tier = idx.tiersById.get(lot.tierId) ?? null
    return {
      code: formatLotCode(block?.code ?? '??', lot.lotNumber),
      blockLabel: block?.name ?? `Block ${block?.code ?? '—'}`,
      tierName: tier?.name ?? 'Unassigned type',
      footprint: tier ? `${tier.widthM.toFixed(2)} × ${tier.lengthM.toFixed(2)} m` : '—',
    }
  }, [lot, version])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line px-5 pt-4 pb-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-display text-page-title font-semibold leading-none text-ink">
              {shell.code}
            </h2>
            <p className="mt-2 text-body text-ink">{shell.tierName}</p>
            <p className="mt-1 break-words text-caption text-muted">
              {shell.blockLabel} · {shell.footprint}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted"
            aria-label="Close lot detail"
            onClick={onClose}
          >
            <Icon icon={IconClose} size={16} />
          </Button>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: EASE }}
        className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center"
      >
        <span className="grid size-12 place-items-center rounded-full border border-line bg-surface-2 text-muted">
          <Icon icon={IconUnavailable} size={22} />
        </span>
        <p className="mt-4 font-display text-section-title text-ink">Unavailable</p>
        <p className="mt-1.5 max-w-[34ch] text-body leading-relaxed text-muted">
          This lot is not available for sale. Contact your manager for details.
        </p>
      </motion.div>
    </div>
  )
}

// ── the full panel ───────────────────────────────────────────────────
function FullPanel({
  lot,
  variant,
  focusSection,
  onClose,
  onToggleExpand,
}: {
  lot: Lot
  variant: PanelVariant
  focusSection?: SectionId | null
  onClose: () => void
  onToggleExpand?: () => void
}) {
  const model = useLotModel(lot)
  const [condensed, setCondensed] = useState(false)

  const canViewAllCommission = useCan('commission:view_all')
  const myAgent = useCurrentAgent()
  const c = model.contract
  const mine =
    Boolean(myAgent && c) &&
    (c!.agentId === myAgent!.id ||
      c!.teamLeaderId === myAgent!.id ||
      c!.distributorId === myAgent!.id)
  const showCommission = Boolean(c) && (canViewAllCommission || mine)

  const openByStatus = useLotDetailUi((s) => s.openByStatus)
  const setOpen = useLotDetailUi((s) => s.setOpen)
  const openSection = useLotDetailUi((s) => s.openSection)
  const setExpanded = useLotDetailUi((s) => s.setExpanded)
  const setLedgerTab = useLotDetailUi((s) => s.setLedgerTab)
  const open = openByStatus[lot.status]

  const status = lot.status
  useEffect(() => {
    if (focusSection) openSection(status, focusSection)
  }, [focusSection, status, openSection])

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const next = e.currentTarget.scrollTop > 60
    if (next !== condensed) setCondensed(next)
  }

  const docsPresent = model.documents.filter((d) => d.present).length

  const sections = (
    <Accordion
      type="multiple"
      value={open}
      onValueChange={(v) => setOpen(lot.status, v as SectionId[])}
      className="w-full"
    >
      {c && (
        <Section value="contract" title="Contract" summary={c.contractNo}>
          <ContractBody model={model} />
        </Section>
      )}

      {c && variant === 'drawer' && (
        <Section value="payments" title="Payments" summary={paymentsSummary(model)}>
          <PaymentsBody
            model={model}
            onViewAll={() => {
              setLedgerTab('ledger')
              setExpanded(true)
            }}
          />
        </Section>
      )}

      {showCommission && (
        <Section
          value="commission"
          title="Agent & commission"
          summary={commissionSummary(model)}
        >
          <CommissionBody model={model} />
        </Section>
      )}

      <Section
        value="interments"
        title="Interments"
        summary={`${lot.intermentCount} of ${lot.capacity}`}
      >
        <IntermentsBody model={model} />
      </Section>

      {c && (
        <Section
          value="documents"
          title="Documents"
          summary={`${docsPresent} of ${model.documents.length} on file`}
        >
          <DocumentsBody model={model} />
        </Section>
      )}

      <Section
        value="history"
        title="History"
        summary={`${model.history.length} ${model.history.length === 1 ? 'event' : 'events'}`}
      >
        <HistoryBody model={model} />
      </Section>
    </Accordion>
  )

  const noAccordion = lot.status === 'not_for_sale'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LotHeader
        model={model}
        condensed={condensed && variant === 'drawer'}
        expanded={variant === 'dialog'}
        onToggleExpand={onToggleExpand}
        onClose={onClose}
      />

      {variant === 'drawer' ? (
        <div className="min-h-0 flex-1 overflow-y-auto" onScroll={onScroll}>
          <IdentityBlock model={model} />
          {!noAccordion && <div className="px-5 pb-5 pt-3">{sections}</div>}
          {noAccordion && <div className="pb-5" />}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,320px)_minmax(0,1fr)] overflow-hidden">
          <div className="min-h-0 overflow-y-auto border-r border-line">
            <IdentityBlock model={model} />
            {!noAccordion && <div className="px-5 pb-5 pt-3">{sections}</div>}
          </div>
          <div className={cn('min-h-0 overflow-y-auto p-5', noAccordion && 'hidden')}>
            <LedgerPanel model={model} />
          </div>
        </div>
      )}

      <LotFooter model={model} />
    </div>
  )
}
