# Backlog

## Purpose

Use this file to list candidate work AI may inspect or execute.

The backlog is not a replacement for requirements, owner docs, or plans. It only helps select the next slice.

## Work Items

| Priority | Item            | Requirement                | Owner Doc            | Plan                        | Status              | AI Autonomy | Blocker                              | Last Checked   |
| -------- | --------------- | -------------------------- | -------------------- | --------------------------- | ------------------- | ----------- | ------------------------------------ | -------------- |
| P0       | (none currently open; scan `docs/plans/` for `Plan Status: active` or `draft`) | — | `tools/mission-driver/CONTEXT.md` | `docs/plans/2026-07-27-0000-template-realproject-split-plan.md` (closing) | `in-progress` | `implement` | `none` | 2026-07-27 |
| P1       | Per-mission roadmaps under `docs/backlog/mission-driver-*-roadmap.md` drive their own work items; cross-reference those instead of duplicating here | `docs/requirements/mission-driver-convergence-and-cost-optimization.md` | `docs/architecture/mission-driver-baseline.md` | per-roadmap | `ready` | `plan-first` | `none` | 2026-07-27 |

## Readiness Invariants

`ready` means all of these are true:

- requirement path exists and has testable acceptance criteria
- owner doc path exists and is not known stale for this slice
- verification commands in `docs/context/project-context.md` are real
- blocking open questions are absent or explicitly non-blocking
- protected areas are configured in `docs/context/ai-autonomy-policy.md`
- planning triggers were checked

`Plan: none` is valid only when the item clearly qualifies for the no-plan path in `docs/plans/00-plan-authoring-and-execution-guide.md`. If a plan is required, set AI autonomy to `plan-first` until the plan audit passes.

Agents may downgrade stale rows from `ready` to `needs-*` or `blocked` with evidence. Agents must not upgrade rows to `ready`, change autonomy to `implement`, or clear blockers without human confirmation or human-approved owner-doc evidence.

## Status Values

- `idea` - not ready for implementation
- `needs-requirement` - raw input exists but no implementation-ready requirement exists
- `needs-design` - requirement exists but owner doc is missing or stale
- `ready` - AI may proceed according to the autonomy label
- `in-progress` - currently being implemented or planned
- `blocked` - cannot proceed until the blocker is resolved
- `done` - completed and verified

## AI Autonomy Values

Use the values from `docs/context/ai-autonomy-policy.md`:

- `implement`
- `plan-first`
- `ask-first`
- `research-only`
- `blocked`

## Selection Rule

When asked to continue without a named task, choose the highest-priority `ready` item whose `AI Autonomy` is `implement` and whose `Blocker` is `none`.

Before implementation, confirm the linked requirement, owner doc, plan field, autonomy policy, and planning triggers are still valid. Do not infer readiness from chat alone.

If the table is stale, downgrade the row or ask before implementation.

## Project-Specific Note

For `mission-driver` engine work, per-mission roadmaps under `docs/backlog/mission-driver-*-roadmap.md` (e.g., `mission-driver-step-audit-roadmap.md`, `mission-driver-draft-robustness-roadmap.md`) are the primary work-item source — each row in those roadmaps is a work item with its own plan under `docs/plans/mission-driver-*/`. This file tracks only cross-cutting backlog that does not belong to a specific mission.
