import { useEffect, useMemo, useState } from 'react'
import type { Block, Tier } from '@/domain'
import { fitToBlock, planGrid, type GridPlan } from '@/lib/grid-generator'
import { useEditor, type GridParams } from './store'
import { useTiers } from './helpers'

/** Warn before a generation this large — the client asked to be told. */
export const LARGE_GENERATION = 2000

export interface PlanResult {
  block: Block
  tier: Tier
  plan: GridPlan
  params: GridParams
}

/**
 * The grid the parameters currently describe. Debounced at 60 ms so dragging
 * the gutter slider does not re-plan a thousand polygons per frame, and shared
 * by the preview canvas and the numeric readout so the two cannot disagree.
 */
export function useGridPlan(): PlanResult | null {
  const grid = useEditor((s) => s.grid)
  const blocks = useEditor((s) => s.blocks)
  const activeBlockId = useEditor((s) => s.activeBlockId)
  const { byId } = useTiers()

  const [debounced, setDebounced] = useState(grid)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(grid), 60)
    return () => window.clearTimeout(t)
  }, [grid])

  return useMemo(() => {
    const block = blocks.find((b) => b.id === activeBlockId)
    const tier = debounced.tierId ? byId.get(debounced.tierId) : undefined
    if (!block || !tier) return null
    const rows = Math.max(0, Math.round(debounced.rows))
    const cols = Math.max(0, Math.round(debounced.cols))
    if (rows === 0 || cols === 0) return null
    const plan = planGrid({
      rows,
      cols,
      cellWidthM: tier.widthM,
      cellLengthM: tier.lengthM,
      gutterM: debounced.gutterM,
      rowGutterM: debounced.splitGutters ? debounced.rowGutterM : debounced.gutterM,
      rotationDeg: debounced.rotationDeg,
      numbering: debounced.numbering,
      startNumber: Math.max(1, Math.round(debounced.startNumber)),
      boundary: block.polygon,
    })
    return { block, tier, plan, params: debounced }
  }, [blocks, activeBlockId, debounced, byId])
}

/** Rows × cols that fill the active block at the current footprint. */
export function computeFit(block: Block, tier: Tier, params: GridParams) {
  return fitToBlock(
    block.polygon,
    params.rotationDeg,
    {
      cellWidthM: tier.widthM,
      cellLengthM: tier.lengthM,
      gutterM: params.gutterM,
      rowGutterM: params.splitGutters ? params.rowGutterM : params.gutterM,
    },
    0,
  )
}
