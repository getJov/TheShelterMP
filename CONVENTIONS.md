# Build conventions — read before writing any code

App root: `/Users/rirooiissee/Desktop/interactive-mockup/app`
Dev: `npm run dev` (port 5173) · Typecheck: `npx tsc --noEmit -p tsconfig.app.json`

## Already built — import, never reimplement

| Path | What it gives you |
|---|---|
| `@/domain` | Every entity, enum, label map, `ROLE_POLICY`, `can()`, `STATUS_APPEARANCE`, `MAP_VIEW_MODES`, `PAYMENT_HEALTH_APPEARANCE`, `AGENT_PALETTE`, `STATUS_BADGE`, `ZOOM`, `ASSUMPTIONS`, all business constants. **Frozen — do not edit.** |
| `@/mock` | `buildDataset()`, `buildIndexes()`, `TODAY`, `NOW`, `FIRST_INTERMENT`. 904 lots, 200 contracts, ~775 payments, 45 interments. |
| `@/stores/dataset` | `useDataset()` hook, `dataset()` and `indexes()` for non-reactive access. Call `useDataset.getState().touch()` after mutating. |
| `@/stores/session` | `useSession()` — current user, active location, role switching. |
| `@/stores/notifications` | `useNotifications()` — `notify`, `notifyRole`, `createApproval`, `decideApproval`, `approvalsFor`, `approvalCounts`. |
| `@/lib/permissions` | `useCan`, `useCanAny`, `useCurrentUser`, `useCurrentAgent`, `useActiveLocation`, `Gate`, `scopeToUser`, **`lotVisibility` / `useLotVisibility`**. |
| `@/lib/finance` | **THE money layer.** `balanceOf`, `paymentHealth`, `healthOfLot`, `contractForLot`, `scheduleOf`, `postedPaymentsOf`, `collectionsBetween`, `receivablesBreakdown`, `trustFundBalance`, `inventorySummary`, `agentEarnings`, `agentCollected`, `leaderboard`, `monthBounds`, `trailingMonths`. |
| `@/lib/commission` | `accrueCommission`, `periodFor`, `groupByPeriod`, `voidCommissionFor`, `splitPreview`, `ruleFor`. |
| `@/lib/amortization` | `buildSchedule`, `applyPayment`, `refreshScheduleStatuses`, `nextDue`, `overdueInstallments`. |
| `@/lib/price-resolver` | `resolvePrice`, `priceHistory`, `activePromos`. |
| `@/lib/money` | `formatPeso`, `parsePeso`, `pctOf`, `sumCentavos`, `formatPercent`, `formatCount`. |
| `@/lib/dates` | `fmtDate`, `fmtDateShort`, `fmtDateLong`, `fmtDateTime`, `fmtRelative`, `addDays`, `addMonths`, `diffDays`, `dowOf`. |
| `@/lib/geo` *(spec 05 creates)* | re-exports from `@/mock/geo`: `generateGrid`, `rectAt`, `boundsOf`, `pointInPolygon`, `metresToLat/Lng`, `offsetMetres`, `areaSqm`. |

## Components

- `@/components/ui/*` — 36 shadcn primitives, already installed. **Never add native form controls.**
- `@/components/ui-brand/` — `Icon`, `icons` (semantic Hugeicons), `StatCard`, `SectionHeading`, `EmptyState`, `AssumedChip`, `StatusDot`, `StatusChip`, `MoneyText`, `DataTable`.

## Icons — Hugeicons Free only

```tsx
import { Icon } from '@/components/ui-brand/Icon'
import { IconMap, IconPayment } from '@/components/ui-brand/icons'
<Icon icon={IconMap} size={18} />
```
`lucide-react` is NOT installed. If you need a glyph that is not yet exported from
`@/components/ui-brand/icons`, add it there — verify the name exists first:
`grep -E "declare const YourIcon:" node_modules/@hugeicons/core-free-icons/dist/types/index.d.ts`

## Hard rules

1. **No native form controls.** No `<select>`, `type="checkbox"`, `type="radio"`, `type="date"`, `<progress>`, `<input type="range">`. Use shadcn `Select`, `Checkbox`, `RadioGroup`, `Calendar` in a `Popover`, `Progress`, `Slider`.
2. **Money is integer centavos**, formatted only via `formatPeso`. Field names end in `Centavos`.
3. **Dates are ISO strings.** Never a `Date` in state. `TODAY` from `@/mock` is "now" — never read the system clock.
4. **No hex colour literals** in features. Import from `@/domain` appearance maps or use Tailwind theme tokens (`text-ink`, `bg-surface`, `border-line`, `text-gold-deep`, `text-muted`, `bg-surface-2`, `text-danger`, `text-green`).
5. **Recompute nothing the finance layer already computes.** Import it.
6. **Respect `lotVisibility()`** everywhere a lot's detail could leak — fill, badge, tooltip, table cell, drawer.
7. **Every ASSUMPTIONS value shown on screen needs an `<AssumedChip why={...} />`.**
8. Motion: framer-motion, ease `[0.22, 1, 0.36, 1]`, duration 0.32s, list stagger 0.04s capped at 12. **Never wrap Google Maps overlays in framer-motion.**
9. Routes and nav entries are **already registered** in `src/routes.tsx` and `src/components/shell/nav-items.ts`. Replace your page component in place; do not edit those two files.
10. Finish with `npx tsc --noEmit -p tsconfig.app.json` passing clean, and `npm run build` succeeding.

## Typography
Cormorant Garamond (`font-display`) on headings and stat values. DM Sans on body. JetBrains Mono (`font-mono`) on codes, IDs, OR/contract numbers. Add `tabular` to any column of figures.
