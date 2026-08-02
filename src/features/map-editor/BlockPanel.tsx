import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import type { TierId } from '@/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icon } from '@/components/ui-brand/Icon'
import { IconDrawBlock } from '@/components/ui-brand/icons'
import { NOW } from '@/mock'
import { useDataset } from '@/stores/dataset'
import { areaSqm } from '@/lib/geo'
import { blockCodeError, distanceM, fitToBlock, nextBlockCode } from '@/lib/grid-generator'
import { formatPeso } from '@/lib/money'
import { resolvePrice } from '@/lib/price-resolver'
import { DangerLine, Field, PanelSection, Readout } from './bits'
import { useEditor } from './store'
import { useTiers } from './helpers'

/** Auto-fill defaults; the Grid tool stays the place to fine-tune gutters. */
const FILL_GUTTER_M = 0.6
const FILL_ROW_GUTTER_M = 0.9

/**
 * The Block tool's side form. One card, one intention: draw a boundary,
 * pick a tier (price in view), and create the block already filled with
 * lots — one undo step. Creating it empty remains the secondary path.
 */
export function BlockPanel() {
  const pending = useEditor((s) => s.pendingBlock)
  const patch = useEditor((s) => s.patchPendingBlock)
  const setPending = useEditor((s) => s.setPendingBlock)
  const commit = useEditor((s) => s.commitPendingBlock)
  const commitWithLots = useEditor((s) => s.commitPendingBlockWithLots)
  const blocks = useEditor((s) => s.blocks)
  const { tiers, byId } = useTiers()
  const prices = useDataset((s) => s.data.prices)

  const suggested = useMemo(() => nextBlockCode(blocks), [blocks])
  const today = NOW.slice(0, 10)

  const priceOf = useMemo(() => {
    const cache = new Map<string, string>()
    return (tierId: string) => {
      const hit = cache.get(tierId)
      if (hit) return hit
      const r = resolvePrice(prices, tierId as TierId, 'pre_need', 'spot_cash', today)
      const label =
        r.amountCentavos != null ? formatPeso(r.amountCentavos) : 'Contact for pricing'
      cache.set(tierId, label)
      return label
    }
  }, [prices, today])

  useEffect(() => {
    if (pending && pending.code === '') patch({ code: suggested })
  }, [pending, suggested, patch])

  const tier = pending?.defaultTierId ? byId.get(pending.defaultTierId) : undefined

  const fill = useMemo(() => {
    if (!pending || !tier) return null
    const fit = fitToBlock(pending.polygon, pending.rotationDeg, {
      cellWidthM: tier.widthM,
      cellLengthM: tier.lengthM,
      gutterM: FILL_GUTTER_M,
      rowGutterM: FILL_ROW_GUTTER_M,
    })
    const count = fit.rows * fit.cols
    if (count === 0) return { rows: fit.rows, cols: fit.cols, count, value: null }
    const r = resolvePrice(prices, tier.id, 'pre_need', 'spot_cash', today)
    return {
      rows: fit.rows,
      cols: fit.cols,
      count,
      value: r.amountCentavos != null ? r.amountCentavos * count : null,
    }
  }, [pending, tier, prices, today])

  if (!pending) {
    return (
      <PanelSection title="Block tool">
        <div className="space-y-2.5 text-[12.5px] leading-relaxed text-muted">
          <p>
            Drag a rectangle on the map to mark the block's boundary. Metre dimensions and area
            follow the cursor as you draw.
          </p>
          <ul className="space-y-1 text-[11.5px]">
            <li>
              <span className="font-mono text-ink">Shift</span> constrains to a square
            </li>
            <li>
              <span className="font-mono text-ink">Alt</span> draws out from the centre
            </li>
            <li>Release, then drag any corner to reshape or the handle above to rotate</li>
          </ul>
        </div>
      </PanelSection>
    )
  }

  const err = blockCodeError(pending.code, blocks)
  const w = distanceM(pending.polygon[0]!, pending.polygon[1]!)
  const h = distanceM(pending.polygon[1]!, pending.polygon[2]!)

  return (
    <PanelSection title="New block">
      <div className="space-y-3.5">
        <Readout>
          {w.toFixed(1)} × {h.toFixed(1)} m · {Math.round(areaSqm(pending.polygon)).toLocaleString()}{' '}
          m² · {pending.rotationDeg.toFixed(0)}°
        </Readout>

        <Field label="Block code" hint={`Suggested: ${suggested}. Must be unique at this location.`}>
          <Input
            value={pending.code}
            onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
            className="h-8 font-mono text-[13px]"
            placeholder={suggested}
          />
        </Field>
        {err && <DangerLine>{err}</DangerLine>}

        <Field label="Name (optional)">
          <Input
            value={pending.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="h-8 text-[13px]"
            placeholder="Garden of…"
          />
        </Field>

        <Field label="Lot tier" hint="Sets the lot footprint and the price below.">
          <Select
            value={pending.defaultTierId ?? ''}
            onValueChange={(v) => patch({ defaultTierId: v as typeof pending.defaultTierId })}
          >
            <SelectTrigger className="h-8 w-full text-[13px]">
              <SelectValue placeholder="Choose a tier" />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex w-full items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-[2px] border border-line"
                      style={{ background: t.appearance.fillColor }}
                    />
                    <span className="flex-1">{t.name}</span>
                    <span className="font-mono text-[11.5px] text-muted">{priceOf(t.id)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {tier && fill && (
          <Readout>
            {fill.count > 0 ? (
              <>
                Auto-fill: {fill.rows} × {fill.cols} ≈ {fill.count.toLocaleString()} lots
                {fill.value != null && (
                  <>
                    {' '}
                    · est. <span className="font-semibold">{formatPeso(fill.value)}</span>
                  </>
                )}
              </>
            ) : (
              <>Too small for a {tier.name} lot — draw a larger boundary or create it empty.</>
            )}
          </Readout>
        )}

        <div className="space-y-2">
          <Button
            className="w-full gap-1.5"
            disabled={!!err || !tier || !fill || fill.count === 0}
            onClick={() => {
              if (!tier || !fill) return
              const res = commitWithLots(tier, {
                rows: fill.rows,
                cols: fill.cols,
                gutterM: FILL_GUTTER_M,
                rowGutterM: FILL_ROW_GUTTER_M,
              })
              if (res) {
                toast.success(`Block ${pending.code} created with ${res.count} lots`, {
                  description:
                    'Select any lots to nudge, rotate, duplicate, or retier them. One undo reverses all of it.',
                })
              }
            }}
          >
            <Icon icon={IconDrawBlock} size={14} />
            Create block{fill && fill.count > 0 ? ` + fill ${fill.count.toLocaleString()} lots` : ''}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setPending(null)}>
              Discard
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={!!err}
              onClick={() => {
                const id = commit()
                if (id) {
                  toast.success(`Block ${pending.code} drafted empty`, {
                    description: 'Switched to the Grid tool — generate its lots your way.',
                  })
                }
              }}
            >
              Create empty
            </Button>
          </div>
        </div>
        <p className="text-[11px] leading-snug text-muted">
          Filling uses {FILL_GUTTER_M} m / {FILL_ROW_GUTTER_M} m gutters and clips to the boundary.
          The Grid tool reopens on these exact settings if you want to rework them.
        </p>
      </div>
    </PanelSection>
  )
}
