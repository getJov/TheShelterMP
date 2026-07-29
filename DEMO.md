# The Shelter Memorial Park — walkthrough script

About twelve minutes. Built from the client's own questions, in roughly the order
they asked them. Every lot code, name and figure below is real: it comes from the
seeded dataset, which is deterministic and identical on every machine.

**Before you start**

```bash
cd interactive-mockup/app
npm run dev          # http://localhost:5173
```

The mockup's "today" is frozen at **29 July 2026** so the July promo is live, the
overdue accounts stay overdue, and the numbers never drift between rehearsal and
the real thing. Add `?demo=1` to any URL to reset the data to its seeded state.

Sign in with any password — the demo account picker on the login screen selects
who you are.

---

## 1 · Sign in — 30s

Login screen carries their brand and tagline. Pick **Owner — Wendy M. Rabina**.

You land straight on **the map**, not a dashboard. Say why: *the park is the
business, so the park is the first thing you see.*

## 2 · The park — 90s

Zoomed out you see **three block cards**, each with its lot count and a thin bar
showing the sales mix. Click **B01 — Garden of Peace**; it flies in and 432 lots
appear.

Point out the two-part visual language:
- **Fill colour = the lot type** (Lawn Standard / Plus / Prime / Family Garden)
- **The small lettered circle = the status** — **A**vailable, **H**eld, **S**old,
  **O**ccupied, **X** not for sale

684 of 904 lots are available. Answers: *"a live map of the park."*

## 3 · One lot, everything about it — 2m

Click a sold lot — **B01-L022** is a good one, contract **TSM-2024-00008**, ₱56,000,
with **19 payments** behind it.

The drawer shows the owner, the contract, the full payment ledger, the selling
agent and their commission, the burial, and the document checklist. Say:

> *This is the single lot record you asked for. One place, instead of thirty
> pieces of paper across three folders.*

Then click three neighbouring lots in a row — the panel flips card-to-card
without closing.

## 4 · The installment problem — 90s

Still in that drawer, open **Payments**. The progress bar, "paid of total", the
next due date and anything overdue are all there.

Now switch the map's **Colour by** to **Payments**. The overdue accounts light up
red across the park.

Answers their own words: *"an installment buyer reaches month 14 and the balance
is spread across records."*

## 5 · Pricing that moves — 90s

Open **Pricing & Tiers**. The matrix is their own price sheet: 60 / 66 / 72 /
264 / 288 pre-need, at-need exactly double.

Point at Lawn Plus, pre-need, spot cash: **₱48,000**, with **₱66,000** struck
through and a promo flag — that is their July spot-cash promo. The installment
column for the same tier still reads **₱66,000**.

> *Both of your numbers are true at the same time, and the system knows which
> one applies.*

Now change **"Showing prices as of"** at the top to **1 August 2026** — the promo
disappears. Set it to 2025 and the launch generation appears.

Answers: *"we can set the price at any given time"* and *"making sure the right
price is used."*

## 6 · Two people, one system — 2m

Switch to **Agent — Grace A. Delos Reyes** (avatar menu, top right).

The map goes quiet: sold and occupied lots turn flat grey with no badges, no
owners, no money. The Colour-by switcher drops to three options. The nav shrinks
to Map, Dashboard, My Sales, My Earnings and a read-only Price List.

Find **B01-L003** (available, Lawn Plus, ₱48,000) and **Request hold** for a
walk-in family. A toast confirms the Ilangay manager was notified.

Switch to **Manager — Josefina R. Bacaltos**. Her bell already shows it. Open the
bell and **approve it from the row** — without opening another screen.

Switch back to Grace: her bell shows the approval, and B01-L003 is now **H** on
the map.

Answers: *"two people promising the same lot"* and *"what agents see versus what
managers see."*

## 7 · One sale, start to finish — 2m

As Manager, open B01-L003 and **convert the hold to a sale**. Pre-need, spot cash.

The price card shows **₱48,000**, names the promo it came from, and shows the
effective date. The review step shows the **6 / 4 / 2** commission split against
Grace's upline and the trust-fund note.

**Post the payment in full.** Before you confirm, read the preview strip aloud —
from one amount it shows: which installments it settles, the new balance,
**₱9,600 accruing to the perpetual care trust fund** (20%), and **₱5,760 of
commission** across three levels.

On confirm, the contract goes fully paid and the certificate issues. The lot
turns **S** on the map behind you.

## 8 · Commissions and Friday — 90s

Open **Agents → Payouts**. The open run reads **Sat 25 Jul → Thu 30 Jul, release
Fri 31 Jul**.

Open the **Leaderboard**, switch the period, watch the rows reorder.

Then open **Commission Rules** and change 6 / 4 / 2 live.

> *These three numbers are our assumption, not your policy. Tell us the real
> split and it takes ten seconds.*

Answers: *"how does commission work here"* and the leaderboard they asked for
by name.

## 9 · Burials — 90s

Open **Burials**. Every day carries **two slot dots** — that is the whole capacity
model at a glance. **1, 6 and 12 August are already full** and marked so.

Schedule one. Enter a date of death and the **15-day interment window** appears.
Taken slots are disabled; full days can't be picked at all. The requirements
checklist gates completion, and a grounds job is created automatically.

Answers: *"only one service at a time, morning and afternoon"* and *"the grounds
team hears about it late."*

## 10 · Growing the park — 90s

Switch to **Admin — Judith C. Montero** and open **Map Editor**.

Draw a block beside B02 → **Fit to block** → generate the lots in one action.
Rubber-band two rows and change their tier — the fill updates immediately, and a
line tells you how many of the selection are already sold and that their contract
prices are unaffected.

Drop a site plan image underneath, line it up, use **Compare** to check it, then
**Publish**. Go back to the map: the new block and the overlay are both there.

Answers: *"as you grow — more agents, Mati, new team leaders."*

## 11 · The owner's morning — 60s

Back as **Owner**. Expand the dashboard to full (**⌘D** cycles hidden → docked →
full).

Collections, receivables, inventory, trust fund (**₱2,580,975**), the agent
leaderboard, upcoming burials, and a Needs-Attention list with **12 pending
approvals**.

> *You told us money coming in is what you check first — so that's the first
> card. Tell us the three you want biggest and we move them.*

## 12 · What we still need from you — 60s

Point at the amber **ASSUMED** chips scattered through the app. Say it plainly:

> *These are our best guess, not your policy. Every one of them is editable.*

The ten open items:

| # | Assumption | What we need |
|---|---|---|
| 1 | Commission level names | What do you call the three levels? |
| 2 | Commission rates 6 / 4 / 2 | Which level gets which slice? |
| 3 | Hold duration — 7 days | How long does a hold last? |
| 4 | Ownership transfer fee — ₱1,500 | Heard once, never confirmed |
| 5 | Downpayment | Is one required on installments? |
| 6 | Interest / installment premium | None assumed — correct? |
| 7 | Senior-citizen discount | Flag captured, no rule defined |
| 8 | Cancellation clawback | What happens to commission already paid? |
| 9 | Mausoleum &amp; Single Lawn pricing | Not on the price sheet |
| 10 | Service fees | Opening &amp; closing, maintenance, environmental |

Close on that. It turns the demo into a working session, which is what the next
meeting needs to be.

---

## Useful during the demo

| Action | How |
|---|---|
| Command palette | **⌘K** — go anywhere, find any lot by code, switch role |
| Cycle the dashboard | **⌘D** |
| Switch role | Avatar, top right — no logout, no reload |
| Jump to a lot | **⌘K** then type `B01-L003` |
| Deep link a lot | `/map?lot=B01-L022` |
| Map redraw timing | append `?debug=perf` |
| Reset the demo data | append `?demo=1` |

## Demo accounts

| Role | Name | Scope |
|---|---|---|
| Owner | Wendy M. Rabina | All locations, read-only oversight |
| Admin | Judith C. Montero | Everything, including Map Editor |
| Manager | Josefina R. Bacaltos | Ilangay park only |
| Manager | Eduardo P. Gempesaw | Townsite office only — shows scoping |
| Agent | Grace A. Delos Reyes | Available lots + her own records |
| Archived | Virgilio A. Lacaba | Demonstrates the lockout path |

## What is deliberately not built

Merchandise inventory and the client portal — both ruled out of scope by the
client. Document *storage* is not built either; the drawer shows the expected
document checklist and says plainly that file storage is a later phase.
