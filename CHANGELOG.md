# TheShelter Changelog

All notable changes to TheShelter are documented here.

## [0.0.2] - August 2026

### Sales Screen Responsiveness

Made `/sales` usable from 320px phones through large desktops while keeping desktop density and existing sales behavior intact.

**Key Changes:**

- Added permission-aware mobile navigation below 1024px while preserving the desktop application rail.
- Reworked Contracts, Payments, Receivables, and Clients into prioritized mobile record layouts with immediate search and compact secondary filters.
- Refit contract details, contract and client creation, holds, payments, invoices, transfers, cancellation, void-payment, schedules, pricing, and commission surfaces for narrow viewports and on-screen keyboards.
- Preserved semantic sorting, focus return, visible validation, reduced-motion behavior, readable type tokens, and comfortable touch targets through the latest accessibility foundation.
- Verified the empty baseline and a populated sales fixture across owner, admin, manager, and agent roles at 320, 360, 390, 768, 1024, and 1440px plus phone landscape and 200% zoom.

**Commits:**

- Split the sales route into focused responsive tab and filter components.
- Added sales-local mobile presentations and viewport-safe transactional surfaces.
- Added focused browser QA and completed plan, evidence, and acceptance artifacts under `plans/08032026-sales-screen-responsiveness/`.

## [0.0.1] - July 2026

### App Copy Cleanup

Removed redundant and implementation-facing interface copy across the app while preserving the guidance users need to complete operational workflows.

**Key Changes:**

- Removed redundant route introductions from burials, agents, commission rules, approvals, pricing, and audit pages.
- Tightened helper copy across pricing, sales, lot details, agents, burials, approvals, audit, and map-editor workflows.
- Removed prototype, later-phase, resolver, and placeholder language from visible product surfaces.
- Preserved labels, validation, accessibility names, assumption disclosures, destructive confirmations, and financial safeguards.
- Reconciled the cleanup with the current map-editor workflow from `origin/main` without changing behavior or layout.
- Verified TypeScript, lint, production build, map-editor tests, and browser routes for owner, admin, manager, and agent roles.

**Commits:**

- Updated visible copy in 38 existing feature files.
- Added the completed plan, acceptance checklist, and recorded acceptance results under `plans/07312026-app-copy-cleanup/`.
