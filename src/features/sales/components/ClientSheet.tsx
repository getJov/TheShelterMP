import { useMemo } from 'react'
import { clientFullName, type ClientId, type ContractId } from '@/domain'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { Icon } from '@/components/ui-brand/Icon'
import { IconMail, IconPhone, IconStar } from '@/components/ui-brand/icons'
import { ASSUMPTIONS } from '@/domain'
import { useDataset, indexes } from '@/stores/dataset'
import { fmtDate } from '@/lib/dates'
import { ContractStatusChip, FieldRow, HealthChip } from './chips'
import { buildRow } from '../lib'

/**
 * The "one record per person" view that complements the "one record per lot"
 * view on the map — every contract and lot this family owns.
 */
export function ClientSheet({
  clientId,
  open,
  onOpenChange,
  onOpenContract,
}: {
  clientId: ClientId | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onOpenContract?: (id: ContractId) => void
}) {
  const version = useDataset((s) => s.version)

  const model = useMemo(() => {
    void version
    if (!clientId) return null
    const client = indexes().clientsById.get(clientId)
    if (!client) return null
    const rows = (indexes().contractsByClient.get(clientId as string) ?? []).map(buildRow)
    return {
      client,
      rows,
      totalCentavos: rows.reduce((s, r) => s + r.totalCentavos, 0),
      outstandingCentavos: rows.reduce((s, r) => s + r.outstandingCentavos, 0),
    }
  }, [clientId, version])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        {model ? (
          <>
            <SheetHeader className="gap-1 border-b border-line px-5 py-4">
              <SheetTitle className="flex flex-wrap items-center gap-2 font-display text-section-title">
                {clientFullName(model.client)}
                {model.client.seniorCitizen && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-gold/45 bg-gold/12 px-2 py-0.5 text-micro font-semibold uppercase tracking-wide text-gold-deep dark:text-gold">
                    <Icon icon={IconStar} size={12} />
                    Senior
                  </span>
                )}
              </SheetTitle>
              <SheetDescription className="font-mono">
                {model.client.clientRef}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-5 p-5">
                <section className="rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-2.5">
                  <FieldRow label="Address">
                    {model.client.address}, {model.client.city}, {model.client.province}
                  </FieldRow>
                  <FieldRow label="Phone">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon icon={IconPhone} size={13} className="text-muted" />
                      {model.client.phone}
                    </span>
                  </FieldRow>
                  <FieldRow label="Email">
                    {model.client.email ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Icon icon={IconMail} size={13} className="text-muted" />
                        {model.client.email}
                      </span>
                    ) : (
                      <span className="text-muted">No email on record</span>
                    )}
                  </FieldRow>
                  <FieldRow label="ID">
                    {model.client.idType
                      ? `${model.client.idType} · ${model.client.idNumber}`
                      : '—'}
                  </FieldRow>
                  {model.client.seniorCitizen && (
                    <FieldRow label="Senior citizen">
                      <span className="inline-flex items-center gap-1.5">
                        {model.client.seniorCitizenId ?? 'ID not captured'}
                        <AssumedChip
                          why={ASSUMPTIONS.seniorCitizenDiscount.why}
                          label="No rule"
                        />
                      </span>
                    </FieldRow>
                  )}
                </section>

                <section className="grid gap-2 sm:grid-cols-3">
                  <Tile label="Contracts" value={String(model.rows.length)} />
                  <Tile label="Contracted" centavos={model.totalCentavos} />
                  <Tile label="Outstanding" centavos={model.outstandingCentavos} />
                </section>

                <section>
                  <h3 className="eyebrow mb-2 text-gold-deep dark:text-gold">
                    Contracts & lots
                  </h3>
                  {model.rows.length === 0 ? (
                    <p className="rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-3 text-body text-muted">
                      No contracts on record.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line-soft rounded-[var(--radius-card)] border border-line bg-surface">
                      {model.rows.map((r) => (
                        <li key={r.contract.id}>
                          <button
                            type="button"
                            onClick={() => onOpenContract?.(r.contract.id)}
                            className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-sm px-3.5 py-2.5 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="font-mono text-body text-ink">
                              {r.contractNo}
                            </span>
                            <span className="font-mono text-caption text-muted">
                              {r.lotCode}
                            </span>
                            <span className="text-caption text-muted">{r.tier}</span>
                            <span className="ml-auto flex items-center gap-2">
                              <ContractStatusChip status={r.contract.status} />
                              <HealthChip health={r.health} dense />
                              <MoneyText
                                centavos={r.outstandingCentavos}
                                className="w-28 text-right text-body text-ink"
                              />
                            </span>
                            <span className="w-full text-caption text-muted">
                              Signed {fmtDate(r.contract.signedAt)} · sold by {r.agent}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="p-6 text-body text-muted">No client selected.</div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Tile({
  label,
  value,
  centavos,
}: {
  label: string
  value?: string
  centavos?: number
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-2.5">
      <p className="eyebrow text-muted">{label}</p>
      {centavos !== undefined ? (
        <MoneyText
          centavos={centavos}
          className="mt-0.5 block font-display text-small-title font-semibold text-ink"
        />
      ) : (
        <p className="mt-0.5 font-display text-small-title font-semibold tabular text-ink">
          {value}
        </p>
      )}
    </div>
  )
}
