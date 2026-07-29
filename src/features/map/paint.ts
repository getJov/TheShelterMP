import {
  AGENT_PALETTE,
  PAYMENT_HEALTH_APPEARANCE,
  RESTRICTED_FILL,
  STATUS_APPEARANCE,
  type AgentId,
  type Lot,
  type LotStatus,
  type MapViewMode,
  type Tier,
  type TierAppearance,
  type TierId,
} from '@/domain'
import { healthOfLot } from '@/lib/finance'
import { indexes } from '@/stores/dataset'
import type { LotVisibility } from '@/lib/permissions'
import { mix, withAlpha } from './colors'

export type Pattern = TierAppearance['pattern']

export interface FillContext {
  tiersById: Map<TierId, Tier>
  /** Stable index per agent, so the categorical palette does not reshuffle. */
  agentIndex: Map<AgentId, number>
  dark: boolean
  /** Pre-resolved so the resolver never touches the session store per lot. */
  visibility: LotVisibility
  /** null when no filter is active — everything renders at full strength. */
  matches: boolean
}

export interface LotPaint {
  fill: string
  pattern: Pattern
  dimmed: boolean
  /** null means "draw no badge" — the agent restriction. */
  badge: LotStatus | null
  restricted: boolean
}

/** Statuses an agent may not see the detail of. */
const CONCEALED: LotStatus[] = ['sold', 'occupied', 'not_for_sale']

export const isRestricted = (lot: Lot, v: LotVisibility) =>
  v === 'availability_only' && CONCEALED.includes(lot.status)

/**
 * The single fill authority. Map, legend and drawer all read this function,
 * so the three can never disagree about what a colour means.
 */
export function resolveFill(lot: Lot, mode: MapViewMode, ctx: FillContext): LotPaint {
  const dimmed = !ctx.matches

  if (isRestricted(lot, ctx.visibility)) {
    return {
      fill: ctx.dark ? RESTRICTED_FILL.dark : RESTRICTED_FILL.light,
      pattern: 'none',
      dimmed,
      badge: null,
      restricted: true,
    }
  }

  const tier = ctx.tiersById.get(lot.tierId)
  const neutral = ctx.dark ? RESTRICTED_FILL.dark : RESTRICTED_FILL.light
  let fill = tier?.appearance.fillColor ?? neutral
  let pattern: Pattern = tier?.appearance.pattern ?? 'none'

  switch (mode) {
    case 'tier':
      break

    case 'status':
      // 70% so the lettered badge stays readable on top of it.
      fill = withAlpha(STATUS_APPEARANCE[lot.status].color, 0.7)
      pattern = 'none'
      break

    case 'payment_health': {
      fill = PAYMENT_HEALTH_APPEARANCE[healthOfLot(lot)].color
      pattern = 'none'
      break
    }

    case 'agent': {
      const contract = lot.currentContractId
        ? indexes().contractsById.get(lot.currentContractId)
        : undefined
      if (contract) {
        const i = ctx.agentIndex.get(contract.agentId) ?? 0
        fill = AGENT_PALETTE[i % AGENT_PALETTE.length]!
      } else {
        fill = neutral
      }
      pattern = 'none'
      break
    }

    case 'occupancy': {
      const t = lot.capacity > 0 ? lot.intermentCount / lot.capacity : 0
      fill =
        t <= 0
          ? neutral
          : mix(STATUS_APPEARANCE.available.color, STATUS_APPEARANCE.occupied.color, t)
      pattern = 'none'
      break
    }
  }

  return { fill, pattern, dimmed, badge: lot.status, restricted: false }
}

/** Legend swatch for a mode's rows — same resolver, no lot required. */
export function agentSwatch(index: number) {
  return AGENT_PALETTE[index % AGENT_PALETTE.length]!
}
