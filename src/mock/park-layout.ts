import type { Block, Lot, MapOverlay } from '@/domain'

/**
 * Hand-tuned demo layout, exported from the Map Editor.
 *
 * Workflow: arrange blocks and lots in the editor, run `getpropsie()` in the
 * browser devtools, and paste the JSON it copies as the value below. When set,
 * `seedPark` uses this geometry VERBATIM instead of the procedural layout, so
 * the tuned map survives reloads and becomes the demo default.
 *
 * Business state (statuses, contracts, burials) is NOT taken from here — the
 * deterministic seeds assign it on top of this geometry every load.
 */
export interface ParkLayout {
  blocks: Block[]
  lots: Lot[]
  overlays: MapOverlay[]
}

export const PARK_LAYOUT: ParkLayout | null = null
