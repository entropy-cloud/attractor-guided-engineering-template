# Roadmap Authoring Guide

## Terminology Note

The roadmap has two levels:

- A **milestone** is a coarse-grained capability grouping — an organizational container. A milestone **has no status**.
- A **work item** is the atomic markable unit inside a milestone. **Only work items carry status** (`todo` / `ready` / `done`).

Vocabulary: **roadmap → milestone → work item**. Do not call a roadmap unit a "phase".

## Purpose

This guide defines what `docs/backlog/implementation-roadmap.md` is, how to write it, and when to update it. The roadmap is optional. Use it only when a project is large enough that a flat backlog table no longer shows global progress.

## What a Roadmap Is

A roadmap is a milestone index and a work-item status surface. Its core use:

1. After reading the roadmap, an AI or maintainer knows which work items are not started (`todo`), ready for implementation (`ready`), or completed (`done`), without re-walking every doc and the codebase.
2. It records each work item's dependencies, owner doc, and reusable framework/platform capabilities.
3. It is the entry point for choosing the next work item.

## Containment: Milestones And Work Items

- A **milestone** groups related work items (e.g. "Core Business Loop", "CRUD for 18 domains"). A milestone may contain one or many work items. A milestone is a section/label only — it **never carries a status field**. Its progress is read by scanning its work items.
- A **work item** is the atomic markable unit — a coherent, independently-deliverable slice. It carries `todo` / `ready` / `done` and is the unit that appears in the status block. A work item that cannot be completed by a single delivery pass is too large and must be split.

## Roadmap Role: Human–AI Alignment + AI Work Queue

A roadmap serves two audiences with different access patterns:

- **Humans** use it as the steering and observation surface: they decide which milestones and work items exist and their priority order. Humans read Work Item Status to see where AI-driven development has reached. Humans do **not** review individual implementation work.
- **AI** uses it as the work queue: it reads Work Item Status, takes the first `todo` work item in the set order, implements it automatically, then writes back by moving the work item to `done`. AI does **not** re-arbitrate priority, skip ahead, or invent new work items — if the roadmap needs structural changes (new/removed/re-ordered milestones or work items), AI flags them for human review.

Implementation quality is enforced by closure audit, not human review. The roadmap is how humans steer and observe progress without reading every piece of implementation work.

## Closed Loop

The roadmap and execution form a closed development loop:

1. AI reads Work Item Status and takes the first `todo` work item (in set order).
2. AI implements that work item (humans do not review it).
3. On closure audit pass, AI writes back: the work item moves to `done`, and any per-component / source-of-truth status is synced.
4. AI returns to step 1 for the next `todo` work item.

If implementation finishes but no work item updates, the work item was larger than one delivery pass and must be split. "Current work in progress" is read from active work items, not from a field in `project-context.md`.

## What a Roadmap Is NOT

- Not an implementation specification. No implementation steps, checkboxes, or closure criteria.
- Not a design doc. It references owner docs; it does not restate business rules.
- Not the backlog. The roadmap is the orchestration layer; backlog items reference roadmap work items.

## Status Tracking

**Status lives on work items only.** A milestone never has a status field; do not add one.

| Status | Meaning | Action |
| --- | --- | --- |
| `todo` | Not started | Candidate for the next work |
| `ready` | Draft-reviewed, queued for implementation | Waiting to be implemented |
| `done` | Completed and passed closure audit | Update owner docs and logs |

Status transitions:

- After independent draft review passes: `todo` -> `ready`
- After independent closure audit passes: `ready` -> `done`. Do NOT mark `done` before closure audit passes.

## Structure

A roadmap usually contains, in order:

1. Header — last-updated date, source docs
2. Purpose — what this file is (fixed text, referencing this guide)
3. Work Item Status — the only dynamic status block (work items grouped by milestone)
4. Framework / Platform Reuse — capabilities already provided by the stack, so the team does not rebuild them
5. Current Baseline — short summary of what exists and the main gaps
6. Milestones — milestone index; each milestone lists its work items (Work Item / Status / Owner Doc / Dependencies / Reuse)
7. Work Item Details — short delivery scope per work item (no checkboxes)
8. Dependency Graph — Mermaid flow
9. Cross-Cutting — cross-work-item concerns
10. Rule — authoring and update rules

Omit sections that do not apply.

## Writing Rules

1. Keep it coarse-grained. Work Item Details are short lists, not implementation steps.
2. Annotate framework/platform reuse explicitly to avoid rebuilding existing capabilities.
3. Keep status accurate. Stale status is worse than no status.
4. Keep dependencies consistent between the table and the graph; the table wins on conflict.
5. Do not duplicate owner-doc content. Work Item Details list delivery scope only.
6. A milestone has no status. Track status on its work items only; do not add a status to a milestone header.

## Update Triggers

| Event | Update | Precondition |
| --- | --- | --- |
| Draft review passes | Work item `todo` -> `ready` | Draft review passed independently |
| Closure audit passes | Work item `ready` -> `done` | Must wait for closure audit to pass |
| Closure reveals new reuse opportunity | Update the Reuse section and the work item | Closure complete |
| New or adjusted owner doc | Check impact on Work Item Details | — |

## Multiple Roadmaps

If the project has multiple orthogonal dimensions with independent "done" definitions (e.g. core business logic vs. frontend UI vs. third-party integrations), create separate roadmap files under `docs/backlog/`. Name each file to reflect its dimension, for example `core-business-roadmap.md`, `frontend-ui-roadmap.md`. Each roadmap file follows the same structure as `implementation-roadmap.md` and loads its own GRIND notes independently.

When multiple roadmaps exist, list all of them in `docs/backlog/README.md` with a brief description of each roadmap's scope. The template does not prescribe when to split — scope is defined entirely by the user.

## Anti-Patterns

- Writing the roadmap as a detailed implementation specification
- Restating owner-doc business rules in the roadmap
- Letting status go stale
- Marking `done` before closure audit passes
- Not annotating existing framework/platform capabilities, causing redundant rebuilds
- A work item larger than one delivery pass, so finished implementation updates nothing and the loop stalls
- Putting a status on a milestone, or a second per-item status column elsewhere (e.g. a coverage table), creating a dynamic block that drifts out of sync with Work Item Status
- AI re-arbitrating priority or inventing work items instead of executing the human-set order
- Tracking "active work / current blocker / AI autonomy" as fields in `project-context.md` — these are high-churn and go stale; read work-in-progress from active work items instead
- Calling a roadmap unit a "phase"
