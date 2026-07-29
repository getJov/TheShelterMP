import { create } from 'zustand'
import type { LotStatus } from '@/domain'

export type SectionId =
  | 'contract'
  | 'payments'
  | 'commission'
  | 'interments'
  | 'documents'
  | 'history'

/**
 * Which sections stand open, remembered PER STATUS rather than per lot —
 * someone auditing payments across a row of sold lots should not have to
 * re-expand on every click.
 */
const DEFAULT_OPEN: Record<LotStatus, SectionId[]> = {
  available: [],
  held: [],
  sold: ['payments'],
  occupied: ['interments'],
  not_for_sale: [],
}

export type LedgerTab = 'ledger' | 'schedule'

interface LotDetailUi {
  openByStatus: Record<LotStatus, SectionId[]>
  expanded: boolean
  ledgerTab: LedgerTab
  setOpen: (status: LotStatus, ids: SectionId[]) => void
  openSection: (status: LotStatus, id: SectionId) => void
  setExpanded: (v: boolean) => void
  setLedgerTab: (t: LedgerTab) => void
}

export const useLotDetailUi = create<LotDetailUi>((set, get) => ({
  openByStatus: { ...DEFAULT_OPEN },
  expanded: false,
  ledgerTab: 'ledger',

  setOpen: (status, ids) =>
    set({ openByStatus: { ...get().openByStatus, [status]: ids } }),

  openSection: (status, id) => {
    const cur = get().openByStatus[status]
    if (cur.includes(id)) return
    set({ openByStatus: { ...get().openByStatus, [status]: [...cur, id] } })
  },

  setExpanded: (expanded) => set({ expanded }),
  setLedgerTab: (ledgerTab) => set({ ledgerTab }),
}))
