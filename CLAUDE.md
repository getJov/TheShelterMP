# TheShelter — Claude Code Instructions

The repo-local operating notes for this project live in [`AGENTS.md`](AGENTS.md) — build conventions pointers, deviations, local runtime, and the Engineering Control Agent workflow (injected from `~/.claude/CLAUDE.md` for Cursor). Read and follow them:

@AGENTS.md

## Global Workflow Commands

The global command contract in `~/.claude/CLAUDE.md` applies here:

- `--start` / `-s` creates a new linked worktree from the current branch's committed `HEAD` before planning, unless the user explicitly passes `--no-worktree`.
- `--test-worktree` / `-tw` runs contained acceptance only from a verified secondary linked worktree and only through a repository-owned safe adapter.

`-tw` must refuse safely until a repository-owned runtime adapter is present.

## Project conventions

Before writing application code, read [`CONVENTIONS.md`](CONVENTIONS.md). For intentional departures from the baseline, read [`DEVIATIONS.md`](DEVIATIONS.md).
