import { useState } from 'react'
import type { ISODate } from '@/domain'
import { TODAY } from '@/mock'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui-brand/Icon'
import { IconAdd, IconInfo } from '@/components/ui-brand/icons'
import { SectionHeading } from '@/components/ui-brand/SectionHeading'
import { useCan } from '@/lib/permissions'
import { fmtDate } from '@/lib/dates'
import { PromoBanner } from './PromoBanner'
import { PriceMatrix } from './PriceMatrix'
import { PriceCalculator } from './PriceCalculator'
import { PriceHistoryDialog, type HistoryTarget } from './PriceHistoryDialog'
import { SetPriceDialog, type SetPricePrefill } from './SetPriceDialog'

export function PriceBookTab({ asOf }: { asOf: ISODate }) {
  const canManage = useCan('price:manage')
  const [history, setHistory] = useState<HistoryTarget | null>(null)
  const [setPriceOpen, setSetPriceOpen] = useState(false)
  const [prefill, setPrefill] = useState<SetPricePrefill | null>(null)

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_346px]">
      <div className="min-w-0 space-y-4">
        <SectionHeading
          eyebrow="Effective-dated price book"
          title="Price book"
          action={
            canManage ? (
              <Button
                onClick={() => {
                  setPrefill(null)
                  setSetPriceOpen(true)
                }}
                className="gap-1.5"
              >
                <Icon icon={IconAdd} size={15} />
                Set price
              </Button>
            ) : undefined
          }
        />

        {asOf !== TODAY && (
          <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-line bg-surface-2 px-3 py-2 text-caption leading-relaxed text-muted">
            <Icon icon={IconInfo} size={15} className="mt-0.5 shrink-0" />
            <span>
              Showing prices for <b>{fmtDate(asOf)}</b>.
            </span>
          </p>
        )}

        <PromoBanner asOf={asOf} />

        <PriceMatrix
          asOf={asOf}
          canManage={canManage}
          onOpenHistory={setHistory}
          onEditPrice={(p) => {
            setPrefill(p)
            setSetPriceOpen(true)
          }}
        />
      </div>

      <PriceCalculator asOf={asOf} />

      <PriceHistoryDialog
        target={history}
        asOf={asOf}
        onClose={() => setHistory(null)}
      />
      {canManage && (
        <SetPriceDialog
          open={setPriceOpen}
          onOpenChange={setSetPriceOpen}
          asOf={asOf}
          prefill={prefill}
        />
      )}
    </div>
  )
}
