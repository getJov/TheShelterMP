# TheShelter Changelog

All notable changes to TheShelter are documented here.

## [0.0.2] - August 2026

### Shared Responsive Shell Foundation

Added the shared responsive-shell contracts required by route-specific mobile refinements while preserving existing navigation, account controls, and desktop rail behavior.

**Key Changes:**

- Added a typed route-scoped top-bar action API with deterministic registration, replacement, cleanup, badge, tooltip, and focus behavior.
- Added shell-owned safe-area variables and geometry markers for authenticated route content, skip links, and portaled mobile navigation.
- Reserved shell navigation layers above route-owned surfaces so the mobile sidebar remains visible and pointer-operable over Map and Dashboard chrome.
- Preserved route state, Dashboard state, desktop rail persistence, existing shell controls, and feature-module ownership boundaries.
- Added focused shell browser acceptance across 320–2000px widths, Map/list presentation, Dashboard states, keyboard focus, dismissal paths, and route transitions.
- Verified 170 focused shell checks, 59 role-and-route checks, TypeScript, lint, production build, and mock-data validation.
- Recorded explicit finalization waivers for the zero-lot accessibility fixture and deferred real-device and assistive-technology checks.

**Commits:**

- Updated the authenticated shell, shared shell styles, and package scripts.
- Added the route top-bar action contract, focused QA fixture and runner, completed plan, and acceptance results.

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
