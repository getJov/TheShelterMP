import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ASSUMPTIONS, type CommissionEntry, type CommissionId } from '@/domain'
import { dataset, indexes } from '@/stores/dataset'
import { agentName, useAgents } from '@/stores/agents'
import { useCan, useCurrentUser } from '@/lib/permissions'
import { fmtDate } from '@/lib/dates'
import { formatPeso } from '@/lib/money'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { Icon } from '@/components/ui-brand/Icon'
import { IconCheck, IconWarning } from '@/components/ui-brand/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LevelBadge, useDatasetVersion } from './shared'

/**
 * Released commission on a contract that was later cancelled. No recovery
 * policy has been defined — the section says so rather than inventing one.
 */
export function ClawbacksSection() {
  const version = useDatasetVersion()
  const canRelease = useCan('payout:release')
  const user = useCurrentUser()
  const recordClawback = useAgents((s) => s.recordClawback)
  const [target, setTarget] = useState<CommissionEntry | null>(null)
  const [note, setNote] = useState('')

  const rows = useMemo(() => {
    void version
    return dataset()
      .commissions.filter((e) => e.status === 'clawback_pending')
      .sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : -1))
  }, [version])

  const total = rows.reduce((s, e) => s + e.amountCentavos, 0)

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line bg-surface-2 px-4 py-2.5">
        <Icon icon={IconWarning} size={15} className="text-danger" />
        <p className="eyebrow text-gold-deep dark:text-gold">Clawbacks</p>
        <AssumedChip why={ASSUMPTIONS.cancellationClawback.why} />
        {rows.length > 0 && (
          <span className="ml-auto tabular text-[13px] text-danger">
            {rows.length} pending · {formatPeso(total, { decimals: false })}
          </span>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-muted">
          <Icon icon={IconCheck} size={15} className="text-green" />
          Nothing to recover. No released commission sits against a cancelled
          contract.
        </p>
      ) : (
        <>
          <p className="border-b border-line-soft px-4 py-2.5 text-[12.5px] leading-relaxed text-muted">
            These entries were released before their contract was cancelled.
            Unreleased commission on the same contracts was voided automatically.
            <strong className="font-medium text-ink">
              {' '}
              No recovery policy has been defined
            </strong>{' '}
            — recording one here marks the money as recovered by hand.
          </p>
          <ul className="divide-y divide-line-soft">
            {rows.map((e) => {
              const contract = indexes().contractsById.get(e.contractId)
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]"
                >
                  <span className="w-[110px] whitespace-nowrap text-[12.5px] text-muted">
                    {fmtDate(e.earnedAt.slice(0, 10))}
                  </span>
                  <Link
                    to={`/agents/${e.agentId}`}
                    className="min-w-[150px] flex-1 hover:underline"
                  >
                    {agentName(e.agentId)}
                  </Link>
                  <LevelBadge level={e.level} />
                  <span className="font-mono text-[11.5px] text-muted">
                    {contract?.contractNo ?? '—'}
                  </span>
                  <span className="w-[110px] text-right tabular font-medium text-danger">
                    {formatPeso(e.amountCentavos)}
                  </span>
                  {canRelease && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        setTarget(e)
                        setNote('')
                      }}
                    >
                      Record as recovered
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Dialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Record as recovered</DialogTitle>
            <DialogDescription>
              {target && (
                <>
                  {formatPeso(target.amountCentavos)} paid to{' '}
                  {agentName(target.agentId)}. There is no automated recovery —
                  this records that it was collected back by hand.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            placeholder="How was it recovered? (deducted from next payout, cash, …)"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={note.trim().length === 0}
              onClick={() => {
                if (!target) return
                recordClawback(target.id as CommissionId, note.trim(), user.id)
                toast.success('Clawback recorded', {
                  description: `${formatPeso(target.amountCentavos)} marked recovered.`,
                })
                setTarget(null)
              }}
            >
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
