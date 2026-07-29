# Deviations from spec

Anything a spec could not deliver as written is recorded here, with the reason.
An empty section means "delivered as specified".

## 00 — Master plan
- Dependency versions landed newer than the spec assumed: **Vite 8**, **TypeScript 6**, **@vitejs/plugin-react 6**. No functional impact.
- `lucide-react` is **not installed**. The client asked for Hugeicons Free after the specs were written. The ~9 lucide icons that shadcn/ui primitives import internally are shimmed by `src/components/ui/icons.tsx`, which re-exports Hugeicons under the lucide names. Application code uses `@/components/ui-brand/Icon` + the semantic registry in `@/components/ui-brand/icons.ts`.
- `baseUrl` was removed from both tsconfigs — deprecated in TypeScript 6. `paths` alone resolves `@/*`.
- Lot count is **904**, not the 908 estimated in the spec. B01 24×18=432 + B02 20×18=360 + B03 8×14=112 = 904. The spec's arithmetic was off by four; the generator is correct.

## 01 — Foundation & Design System
- `noUnusedLocals` / `noUnusedParameters` are **off** during parallel spec work so partially-wired imports do not break other agents' builds. Spec 14 should consider turning them back on.
- 36 shadcn primitives installed (the spec listed 32; `form` was dropped as unused, and shadcn pulled in `breadcrumb`, `pagination`, `hover-card`, `context-menu`, `toggle`, `toggle-group` as separate files).

## 02 — Domain Model & RBAC

## 03 — Mock Data Generators
- Payment/contract counts differ from the spec's estimates because the growth curve and payment-behaviour distributions are probabilistic. Actuals: 200 contracts, ~775 payments, ~4,060 installments, ~1,900 commission entries, 45 interments, 904 lots. All invariants pass.

## 04 — Auth, Session & RBAC Shell
- The command-palette shortcut for role switching (`⌘K → "switch to…"`) is deferred to spec 14, which owns the palette.

## 05 — Map Core
- Badge radius scales with lot size (clamped to `STATUS_BADGE.radiusPx`), and the letter draws once the circle can hold it (r ≥ 4.6px). At zoom 18 a lawn lot is ~2×5px on screen, so a fixed 7px badge would swallow the park. Full lettered badges appear from ~zoom 20.
- `maxNativeZoom={18}` on the Esri layer — imagery for Lupon tops out at z18 and z19+ returns a placeholder tile with HTTP 200, so `tileerror` never fires. Upscaling from 18 is blurry but honest.
- The "Show site plan" switch enables whenever an overlay exists and renders all of a location's overlays. The seeded overlay ships `visible: false`, so gating the control on that flag would have made it permanently dead; `visible` is spec 10's publish flag and the switch is the per-session override.
- Cluster markers get a six-pass screen-space de-collision at z15–16 (the park is only ~150m across, so all three cluster cards landed on top of each other). Geometry is untouched.
- Block outlines use `L.svg()` despite `preferCanvas`, so the CSS fade actually applies.
- Agents get **three** view modes (Lot Type, Status, Occupancy), not two — `MAP_VIEW_MODES` marks only `payment_health` and `agent` as restricted, and the domain data is the source of truth.
- Measured redraw: **7.2–11.6ms** for 904 lots with badges at fitted park view, against a 16ms budget. `?debug=perf` reports the last draw, not a rolling average.


## 06 — Lot Detail Drawer
- The building agent's process failed at the reporting step, after the work was complete. The feature is present and verified independently: 12 files / ~2,450 lines, typechecking clean, no stubs or TODOs, the restricted-visibility path implemented, and `MapPage` repointed from the placeholder (which was deleted).


## 07 — Dashboard Panel
- `Needs Attention` is gated `anyOf: ['hold:approve','payout:approve']` rather than `hold:approve` alone. The owner does not hold `hold:approve`, so the literal spec gate would have given the owner eight cards and contradicted "all nine render as Owner".
- Receivables drill-down switches the map into `payment_health` mode and passes `?health=overdue,severely_overdue`; `MapFilters` has no payment-health set, so narrowing to the exact lot list is a `TODO(14)`.
- No skeleton loading states — `buildDataset()` is synchronous at module load, so there is no loading window to shape one for. Zero-data states are designed sentences.
- The full-state map strip overlays the live map's bottom 240px rather than being a separately fitted mini-map.
- Hero/small grid column counts follow the number of cards the role actually has, so the agent's single hero runs full width instead of sitting beside two empty columns.

## 08 — Sales & Payments
- `RequestHoldDialog` takes `lotId` as **optional** and renders a lot picker when none is preset, plus a "Request hold" button on the Sales header. Without it the dialog was unreachable until spec 06 landed, and the client's headline requirement could not be demonstrated.
- Agents are scoped by `agentId` rather than `scopeToUser`. Every lot is at Ilangay while several agents are bound to Townsite, so location scoping would have hidden all of their own contracts. See the open data note below.
- `NotificationKind` has no `contract_created` / `transfer_requested` member, so those reuse the nearest existing kind with a body stating what actually happened. `transfer.requested` is logged as an audit action although `AUDIT_ACTIONS` only lists `transfer.approved`.
- "Send reminder" writes a real notification to the selling agent and states plainly that email/SMS delivery is a later phase — not a dead button.

## 09 — Pricing & Tier Management
- The tier preview uses a local `drawLot()` rather than the map's canvas code, marked `TODO(14): unify with map canvas`. It reads `STATUS_BADGE` geometry from `@/domain` so the badge cannot drift.
- The contrast guard uses redmean colour distance (< 58) OR WCAG ratio (< 1.12) rather than pure WCAG. Pure luminance fired a false warning on the seeded Lawn Prime fill against the held badge (ratio 1.15).
- Tier reordering uses native HTML5 drag on the card (a `draggable` article with a handle), not a drag library.
- The per-cell history icon stays visible to read-only roles; only the write affordances are gated on `price:manage`. History is pure read-only traceability and owners/managers need it.

## 10 — Map & Overlay Editor
- Publish writes **all** draft overlays rather than only `visible: true` ones. Resolved during integration — see below.
- Overlay opacity is per-overlay in the editor; the main map applies one shared opacity, seeded from the published plan.
- Bulk Resize **skips** sold/occupied lots (naming them) rather than reshaping them, extending "never move a sold lot" to geometry.
- The base-layer toggle drives the shared `useMapStore.baseLayer` so spec 05's `BaseLayer` could be reused unmodified.
- Two non-obvious bugs found and fixed while driving it: React synthetic handlers never fired on the drag handles (the surface's native `stopPropagation` kills the event before React's root listener sees it — handles now bind natively), and rotation snapping applied to per-frame deltas swallowed every small step (now measured from the gesture's start angle).


## 11 — Agents, Commissions & Leaderboard
- The leaderboard defaults to the whole sales force for everyone except managers (who stay location-scoped). Each location has at most nine agents, so a location-scoped board could never push a viewer past rank ten and the "pinned You row" would be unreachable.
- "Close run" is gated on `payout:approve` — the spec named permissions for Approve and Release but not Close.
- `recordClawback` moves the entry to `voided`; the status enum has no `clawback_recovered` member.
- `accrueCommission` has exactly one call site (`src/stores/sales.ts`), verified by grep — commission entries are never created anywhere else.


## 12 — Burials & Grounds
- Added a third tab route `/burials/interments` — the spec named three routes but described three tabs.
- The day sheet injects its own scoped `@media print` rules from inside the component rather than editing `globals.css`.
- The lot mini-map is a self-contained SVG block diagram rather than a Leaflet thumbnail, so it also works on the printed day sheet.
- Agents cannot reach `/burials` at all: `ROLE_POLICY.agent` lacks `interment:view`. The agent path (`requested` + approval task + manager notification) is fully implemented in the store and reachable from the lot drawer; it simply has no nav entry. This matches the client's stated role model.


## 13 — Approvals, Notifications & Audit
- The audit table uses shadcn `Table` primitives rather than `DataTable`, which has no row-expansion hook. Header and cell styling match it exactly; the decided-history tab does use `DataTable`.
- Hold expiry is counted in **days**, not clock hours. The seeded hold expires tomorrow at 17:00 — 32h from the frozen `NOW` of 09:00 — so a strict 24h test silently skipped the one case the mechanism exists to demonstrate.
- Bell → approval linkage matches on the lot code embedded in the notification title, because `requestHold` passes `entityRef: null`.
- Undo covers approvals only; rejections require a typed reason and are deliberate. Undo reopens the task, retracts the notifications the decision fired, and **appends** an audit event flagged `undone` rather than editing or deleting anything.
- Payout-run rejection has no owning-store action (there is no `rejectRun`), so it closes the task with a reason and the run stays `pending_approval` for revision.


## 14 — Polish, QA & Demo Script

---

## Open items for the polish pass
### Resolved during integration
- **Agent/lot location mismatch — FIXED.** Five of fourteen agents were bound to Townsite while all 904 lots are at Ilangay, so `lotVisibility()` returned `hidden` and those agents opened a completely blank map. All selling agents are now bound to the park. Location scoping is still demonstrated by the two managers (Josefina at the park, Eduardo at Townsite, whose map correctly shows the "no park layout" empty state).
- **Demo agent — FIXED.** The login screen now prefers an active `associate` (Grace A. Delos Reyes) rather than whichever agent came first in array order, which was a distributor.
- **`MapPage` now mounts `<DashboardPanel />`.**
- **`visibleLocations()` render loop — FIXED.** It returned a fresh array on every call, so any zustand selector reading it looped forever and crashed *every* route for manager and agent sessions. Now cached by (user, locations).
- **Route/nav guards — FIXED.** No single permission covers Sales for all four roles (agents hold `contract:view_own`, managers and the owner hold `contract:view_all`, neither holds the other), so the guard would have 403'd one side or the other. `RequirePermission` and `NavItem.permission` now accept an any-of list. Approvals likewise now accepts `hold:approve` OR `payout:approve`, so the owner — who approves payout runs but not holds — can reach it.
- **`periodFor()` window mapping — FIXED.** Friday payments were being filed into the window that had already closed, and Sunday payments opened a spurious Sunday-anchored window, producing stray one-entry payout runs. Saturday–Thursday now all map to the containing window and Friday rolls to the next; the seed imports the same function so the two can never disagree.

### Resolved in the polish pass (spec 14)
- **Approvals nav badge** now renders a live pending count, subscribed to both the notification and dataset version counters so it moves the instant a hold is raised or decided.
- **Receivables drill-down now actually filters.** `MapFilters` gained a `health` set, `MapLot` carries a precomputed `health` so filtering, painting and the legend cannot disagree, and the payment-health legend rows became filter toggles like every other legend row.
- **Site-plan overlay honours the published flag.** `SitePlanOverlay` was rendering every overlay regardless of `visible`, so an unpublished draft would have leaked onto the main map. It now requires both `visible` (what the editor publishes) and the map's own "Show site plan" switch (the per-session toggle). The seeded plan was marked `visible: true`, which is what it is.
- **`?demo=1` reset implemented.** Record mutations already rebuild from the seed on reload; the flag clears the *persisted* UI state (session, panel, rail, map preferences, theme) so a rehearsal does not leave the real run half-collapsed as somebody else.
- **Command palette (⌘K)** built — routes, lots by code, clients, role switching, theme. Spec 04 deferred it here.
- **Pricing moved out of the "Manage" nav section.** An agent holds `price:view`, so they were seeing a *Manage* heading over a screen they can only read. It is now a main-section entry, labelled "Price List" for agents.
- **Nav header longest-prefix match** — `/map` was shadowing `/map-editor`, so the editor's header read "Park Map".

### Map chrome layout (post-review fixes)
Both reported from a real 1440×900 session:
- **The legend overlapped the controls card.** Both were left-anchored — controls top-left, legend bottom-left — and a long tier list grew up into the controls. The legend moved to a right-hand column, narrowed 230px → 196px, with tighter rows. It is now horizontally clear of the controls card, so it can also grow taller without colliding and all eleven rows fit without scrolling.
- **Zoom controls, Reset view and the survey badge were unclickable**, sitting underneath the dashboard panel / lot drawer. Added `useChromeInset()`, a single hook returning how far the right-anchored chrome must clear whichever panel is open (docked dashboard 420px, hidden rail 36px, lot drawer 420px, whichever is wider; zero in the full-dashboard state, where the map is hidden anyway). The legend, zoom controls and badge now sit in one bottom-right column that animates its offset as panels open and close.
- Verified clear with no overlap at 1000×700, 1180×760, 1280×800, 1440×900, 1512×860, 1680×1050 and 2000×972 — across hidden / docked / full panel states, drawer open and closed.
- **The hover tooltip was positioned at `cursor + 12` with no clamping**, so hovering a lot near the right edge slid it underneath the dashboard panel or the lot drawer, and hovering near the bottom pushed it off-screen. It now measures itself and flips to the other side of the cursor when it would cross the map's usable edge — the right edge being wherever the open panel begins. Measured: hovering 24px from a panel starting at x=700 previously put the tooltip at 883, i.e. 183px under the panel; it now lands at 690.

- **The full-state dashboard overflowed off the right of the screen.** `#map-dashboard-slot` was `absolute right-0` with no width, so the full-state overlay's `inset-x-0` resolved against a zero-width box pinned to the right edge — pushing the whole dashboard and its centred "Click the map to return" pill off-screen, where the pill was clipped and unclickable. The slot now spans the map (`inset-0 flex justify-end`, pointer-events-none) and right-aligns the panel, so all three states share one correct positioning context.
- **The map's floating chrome no longer renders in the full state at all.** The legend, zoom controls and survey badge were poking into the 240px return strip, half-behind the dashboard overlay and on top of the return pill. In that state the map is a strip you click to go back, not an operable map — `useChromeVisible()` now hides them.

### Known limitations
- The tier preview in Pricing still duplicates a small amount of the map's polygon draw code (`TODO(14)` retained). It reads `STATUS_BADGE` geometry from `@/domain`, so the badge cannot drift, but the fill/pattern path is a second implementation.
- `?debug=perf` on the map reports the last redraw, not a rolling average.
- Esri satellite imagery for Lupon tops out at zoom 18; beyond that it upscales.
