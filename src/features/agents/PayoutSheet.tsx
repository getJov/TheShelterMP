import { createPortal } from 'react-dom'
import { PARK_FACTS, type PayoutRun } from '@/domain'
import { indexes } from '@/stores/dataset'
import { agentName, levelLabel } from '@/stores/agents'
import { fmtDateLong } from '@/lib/dates'
import { formatPeso } from '@/lib/money'
import { Icon } from '@/components/ui-brand/Icon'
import { IconClose, IconPrint } from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import type { AgentGroup } from './PayoutRunDetail'

/**
 * The artifact that actually gets handed to whoever pays: one line per agent,
 * a total, and a column to sign in. Rendered into a body-level portal so the
 * print stylesheet can hide the application chrome around it.
 */
export function PayoutSheet({
  run,
  groups,
  onClose,
}: {
  run: PayoutRun
  groups: AgentGroup[]
  onClose: () => void
}) {
  const total = groups.reduce((s, g) => s + g.subtotalCentavos, 0)
  const entryCount = groups.reduce((s, g) => s + g.entries.length, 0)

  return createPortal(
    <div
      data-print-sheet
      className="fixed inset-0 z-[60] overflow-y-auto bg-bg print:static print:overflow-visible print:bg-white"
    >
      <style>{`@media print {
        body > #root { display: none !important; }
        [data-print-sheet] { position: static !important; background: #fff !important; color: #000 !important; }
        [data-print-sheet] table { page-break-inside: auto; }
        [data-print-sheet] tr { page-break-inside: avoid; }
      }`}</style>

      <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-5 py-2.5">
        <p className="text-[13px] font-medium text-ink">Payout sheet</p>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Icon icon={IconPrint} size={15} /> Print
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onClose}>
            <Icon icon={IconClose} size={15} /> Close
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[860px] px-8 py-8 print:max-w-none print:px-0 print:py-0">
        <header className="border-b border-line pb-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-gold-deep">
            {PARK_FACTS.corporateName}
          </p>
          <h1 className="mt-1 font-display text-[26px] font-semibold text-ink">
            Commission payout sheet
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Period {fmtDateLong(run.periodStart)} → {fmtDateLong(run.periodEnd)} ·
            Release {fmtDateLong(run.releaseDate)}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            Saturday to Thursday window; Sunday excluded from the earning window.
            {run.locationId
              ? ` ${indexes().locationsById.get(run.locationId)?.name ?? ''}`
              : ' All locations'}
          </p>
        </header>

        <table className="mt-5 w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-3 text-[10.5px] uppercase tracking-[0.08em] text-muted">
                #
              </th>
              <th className="py-2 pr-3 text-[10.5px] uppercase tracking-[0.08em] text-muted">
                Agent
              </th>
              <th className="py-2 pr-3 text-[10.5px] uppercase tracking-[0.08em] text-muted">
                Code
              </th>
              <th className="py-2 pr-3 text-[10.5px] uppercase tracking-[0.08em] text-muted">
                Level
              </th>
              <th className="py-2 pr-3 text-right text-[10.5px] uppercase tracking-[0.08em] text-muted">
                Entries
              </th>
              <th className="py-2 pr-3 text-right text-[10.5px] uppercase tracking-[0.08em] text-muted">
                Amount
              </th>
              <th className="w-[190px] py-2 text-[10.5px] uppercase tracking-[0.08em] text-muted">
                Signature &amp; date
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => {
              const agent = indexes().agentsById.get(g.agentId)
              return (
                <tr key={g.agentId} className="border-b border-line-soft">
                  <td className="py-2.5 pr-3 tabular text-muted">{i + 1}</td>
                  <td className="py-2.5 pr-3 font-medium text-ink">
                    {agentName(g.agentId)}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[11.5px] text-muted">
                    {agent?.agentCode ?? '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-[12.5px] text-muted">
                    {agent ? levelLabel(agent.level) : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular">{g.entries.length}</td>
                  <td className="py-2.5 pr-3 text-right tabular font-medium text-ink">
                    {formatPeso(g.subtotalCentavos)}
                  </td>
                  <td className="py-2.5">
                    <span className="block h-6 border-b border-dashed border-line" />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line">
              <td colSpan={4} className="py-3 font-medium text-ink">
                Total — {groups.length} agent{groups.length === 1 ? '' : 's'}
              </td>
              <td className="py-3 pr-3 text-right tabular">{entryCount}</td>
              <td className="py-3 pr-3 text-right font-display text-[19px] font-semibold tabular text-ink">
                {formatPeso(total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>

        <div className="mt-10 grid grid-cols-2 gap-10 text-[12.5px]">
          <div>
            <span className="block h-8 border-b border-line" />
            <p className="mt-1 text-muted">Prepared by</p>
          </div>
          <div>
            <span className="block h-8 border-b border-line" />
            <p className="mt-1 text-muted">Approved by</p>
          </div>
        </div>

        <p className="mt-8 text-[11.5px] leading-relaxed text-muted">
          Commission is earned on collection, never at signing. Each line is the
          sum of one agent&rsquo;s entries for this window; the basis of every
          entry is the full posted payment, with no trust-fund deduction.
        </p>
      </div>
    </div>,
    document.body,
  )
}
