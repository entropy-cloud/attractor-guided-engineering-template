# Backlog

## Purpose

Use this file to list candidate work AI may inspect or execute.

The backlog is not a replacement for requirements, owner docs, or plans. It only helps select the next slice.

## Work Items

| Priority | Item            | Requirement                | Owner Doc            | Plan                        | Status              | AI Autonomy | Blocker                              | Last Checked   |
| -------- | --------------- | -------------------------- | -------------------- | --------------------------- | ------------------- | ----------- | ------------------------------------ | -------------- |
| P0       | `<first slice>` | `docs/requirements/<path>` | `docs/design/<path>` | `docs/plans/<path-or-none>` | `needs-requirement` | `blocked`   | `template placeholders not replaced` | `<YYYY-MM-DD>` |

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

Example ready row after setup:

```md
| P0 | User Management first slice | `docs/requirements/2026-05-21-0900-user-management.md` | `docs/design/app-overview.md` | `docs/plans/2026-05-21-1000-user-management-plan.md` | `ready` | `plan-first` | `none` | `2026-05-21` |
```

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
