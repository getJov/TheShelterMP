# TheShelter Changelog

All notable changes to TheShelter are documented here.

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
