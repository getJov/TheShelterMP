import { create } from 'zustand'
import { buildDataset, buildIndexes, type Dataset, type DatasetIndexes } from '@/mock'

/**
 * The single source of seeded data. Built once per page load; every feature
 * store reads from here rather than calling buildDataset() again.
 * No business logic lives in this file.
 */
interface DatasetStore {
  data: Dataset
  idx: DatasetIndexes
  /** Bumped by feature stores after a mutation so selectors recompute. */
  version: number
  touch: () => void
  reset: () => void
}

function load() {
  const data = buildDataset()
  return { data, idx: buildIndexes(data) }
}

export const useDataset = create<DatasetStore>((set, get) => ({
  ...load(),
  version: 0,
  touch: () => set({ version: get().version + 1, idx: buildIndexes(get().data) }),
  reset: () => set({ ...load(), version: 0 }),
}))

/** Non-reactive access, for stores and pure helpers. */
export const dataset = () => useDataset.getState().data
export const indexes = () => useDataset.getState().idx
