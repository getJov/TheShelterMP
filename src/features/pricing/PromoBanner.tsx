import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { ISODate, PriceBookEntry } from '@/domain'
import { TODAY } from '@/mock'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui-brand/Icon'
import { IconFlag, IconClock } from '@/components/ui-brand/icons'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { fmtDate, diffDays } from '@/lib/dates'
import { formatPeso } from '@/lib/money'
import { useCan, useCurrentUser } from '@/lib/permissions'
import { indexes } from '@/stores/dataset'
import { usePricing } from '@/stores/pricing'
import { TierSwatch } from './TierPreview'

/**
 * The promo banner. It exists so the ₱45,000-vs-₱60,000 distinction is
 * legible before anyone reads a single cell of the matrix.
 */
export function PromoBanner({ asOf }: { asOf: ISODate }) {
  const bookVersion = usePricing((s) => s.bookVersion)
  const activePromos = usePricing((s) => s.activePromos)
  const canManage = useCan('price:manage')

  void bookVersion
  const promos = activePromos(asOf)
  if (promos.length === 0) return null

  // One banner per campaign, not per row.
  const groups = new Map<string, PriceBookEntry[]>()
  for (const p of promos) {
    const key = `${p.label ?? 'Promotion'}|${p.effectiveFrom}|${p.effectiveTo ?? ''}`
    const arr = groups.get(key)
    if (arr) arr.push(p)
    else groups.set(key, [p])
  }

  return (
    <div className="space-y-2">
      {[...groups.entries()].map(([key, entries]) => (
        <PromoRow key={key} entries={entries} asOf={asOf} canManage={canManage} />
      ))}
    </div>
  )
}

function PromoRow({
  entries,
  asOf,
  canManage,
}: {
  entries: PriceBookEntry[]
  asOf: ISODate
  canManage: boolean
}) {
  const endPromo = usePricing((s) => s.endPromo)
  const undoEndPromo = usePricing((s) => s.undoEndPromo)
  const user = useCurrentUser()
  const [confirming, setConfirming] = useState(false)

  const first = entries[0]!
  const tiersById = indexes().tiersById
  const endsIn = first.effectiveTo ? diffDays(first.effectiveTo, asOf) : null

  function end() {
    const stop = asOf > TODAY ? asOf : TODAY
    const mutations = entries
      .map((e) => endPromo(e.id, stop, user.id))
      .filter((m): m is NonNullable<typeof m> => m !== null)
    setConfirming(false)
    toast.success(`${first.label ?? 'Promotion'} ended`, {
      description: `Closed on ${fmtDate(stop)}. List prices resolve again from that date.`,
      duration: 10_000,
      action: {
        label: 'Undo',
        onClick: () => mutations.forEach(undoEndPromo),
      },
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[var(--radius-card)] border border-gold/55 bg-gold/10 px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
            <Icon icon={IconFlag} size={15} className="text-gold-deep dark:text-gold" />
            {first.label ?? 'Promotion'}
          </p>
          <p className="tabular mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
            <span>
              {fmtDate(first.effectiveFrom)} →{' '}
              {first.effectiveTo ? fmtDate(first.effectiveTo) : 'open-ended'}
            </span>
            {endsIn !== null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-surface px-2 py-px text-gold-deep dark:text-gold">
                <Icon icon={IconClock} size={11} />
                {endsIn <= 0
                  ? 'ends today'
                  : `ends in ${endsIn} day${endsIn === 1 ? '' : 's'}`}
              </span>
            )}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            {entries.map((e) => {
              const tier = tiersById.get(e.tierId)
              return (
                <li key={e.id} className="flex items-center gap-1.5">
                  {tier && <TierSwatch appearance={tier.appearance} size={11} />}
                  <span className="text-muted">{tier?.name ?? e.tierId}</span>
                  <MoneyText
                    centavos={e.amountCentavos}
                    className="font-medium text-ink"
                  />
                </li>
              )
            })}
          </ul>
          {first.note && (
            <p className="mt-1.5 text-[12px] text-muted">{first.note}</p>
          )}
        </div>

        {canManage && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-gold/60 bg-surface"
            onClick={() => setConfirming(true)}
          >
            End promo
          </Button>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End “{first.label ?? 'Promotion'}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This closes {entries.length} promo{' '}
              {entries.length === 1 ? 'entry' : 'entries'} on{' '}
              {fmtDate(asOf > TODAY ? asOf : TODAY)}. The entries are not deleted —
              contracts sold at {formatPeso(first.amountCentavos)} keep resolving to
              it, and the list price takes over from the closing date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it running</AlertDialogCancel>
            <AlertDialogAction onClick={end}>End promo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
