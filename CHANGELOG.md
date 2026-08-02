# TheShelter Changelog

All notable changes to TheShelter are documented here.

## [0.0.2] - August 2026

### Standalone Dashboard Content Responsiveness

Made the standalone dashboard content responsive from a 320px available container through wide desktop while preserving role permissions and the map dashboard panel.

**Key Changes:**

- Added an explicit standalone dashboard surface context for shared dashboard components.
- Moved Needs Attention first for eligible roles without changing cross-device card order or permissions.
- Added container-aware header, period selector, hero-card, supporting-card, and bounded wide-screen layouts.
- Kept every authorized card and detail accessible with mobile-safe targets, visible card menus, and safe financial-value wrapping.
- Preserved the map panel's hidden, docked, and full geometry, ordering, state, and panel-only actions.
- Added automated role, breakpoint, touch, keyboard, large-text, long-value, and map regression coverage.

**Commits:**

- Updated the standalone dashboard route and shared dashboard presentation components.
- Added the focused responsive QA runner and its package script.
- Added the completed plan, acceptance viewer, recorded results, and visual evidence under `plans/08032026-standalone-dashboard-content-responsiveness/`.

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
