# Roadmap Authoring Guide

## Purpose

This guide defines what `docs/backlog/implementation-roadmap.md` is, how to write it, and when to update it. The roadmap is optional. Use it only when a project is large enough that a flat backlog table no longer shows global progress.

## What a Roadmap Is

A roadmap is a coarse-grained phase index and global status surface. Its core use:

1. After reading the roadmap, an AI or maintainer knows which capabilities are not started (`todo`), already planned (`planned`), or completed (`done`), without re-walking every doc and the codebase.
2. It records each phase's dependencies, owner doc, and reusable framework/platform capabilities.
3. It is the entry point for choosing the next work item.

## Roadmap Role: Human–AI Alignment + AI Work Queue

A roadmap serves two audiences with different access patterns:

- **Humans** use it as the steering and observation surface: they decide which work items exist, their priority order, and the milestone shape. Humans read Phase Status to see where AI-driven development has reached. Humans do **not** review individual execution plans.
- **AI** uses it as the work queue: it reads Phase Status, takes the first `todo` work item in the planned order, drafts and executes the plan automatically, then writes back by moving the work item to `done`. AI does **not** re-arbitrate priority, skip ahead, or invent new work items — if the roadmap needs structural changes (new/removed/re-ordered items), AI flags them for human review.

Plans are AI-authored and AI-executed; humans do not review individual plans. Plan quality is enforced by closure audit, not human plan review. The roadmap is how humans steer and observe progress without reading every plan.

## Phase Granularity

The markable unit (a phase / work item) must be sized so that **one execution plan can complete it**. "Coarse-grained" means "no implementation steps inside the roadmap" — it does NOT mean "as large as possible."

A phase larger than one plan's delivery scope is a defect: when the plan finishes, the roadmap has nothing to update and the loop stalls. If a natural grouping (e.g. a "wave", "family", or "epic") is larger than one plan, split it into multiple work items. The grouping may remain as an organizational label, but **only work items carry `todo`/`planned`/`done` and appear in Phase Status**. A grouping/section header never has its own status.

## Closed Loop

The roadmap and plans form a closed development loop:

1. AI reads Phase Status and takes the first `todo` work item (in planned order).
2. AI drafts the plan for that work item (humans do not review it).
3. AI executes the plan.
4. On closure audit pass, AI writes back: the work item moves to `done`, and any per-component / source-of-truth status is synced.
5. AI returns to step 1 for the next `todo` work item.

A finished plan that updates nothing in the roadmap signals a granularity bug — the phase was larger than the plan. "Current work in progress" is found by scanning unfinished plans (`docs/plans/`), not by a field in `project-context.md`, so the loop resumes interrupted work before starting a new work item.

## What a Roadmap Is NOT

- Not an execution plan. No implementation steps, checkboxes, or closure criteria.
- Not a design doc. It references owner docs; it does not restate business rules.
- Not the backlog. The roadmap is the orchestration layer; backlog items reference roadmap phases.

## Status Tracking

Each phase has one status:

| Status | Meaning | Action |
| --- | --- | --- |
| `todo` | Not started, no plan | Candidate for the next plan |
| `planned` | Has an execution plan | Waiting for implementation |
| `done` | Completed and passed closure audit | Update owner docs and logs |

Status transitions are driven by the plan lifecycle (see `docs/plans/00-plan-authoring-and-execution-guide.md`):

- After draft review passes: `todo` -> `planned`
- After closure audit passes: `planned` -> `done`. Do NOT mark `done` before closure audit passes.

## Structure

A roadmap usually contains, in order:

1. Header — last-updated date, source docs
2. Purpose — what this file is (fixed text, referencing this guide)
3. Phase Status — the only dynamic status block
4. Framework / Platform Reuse — capabilities already provided by the stack, so the team does not rebuild them
5. Current Baseline — short summary of what exists and the main gaps
6. Phases table — global phase index (Phase / Status / Owner Doc / Dependencies / Reuse / Plan link)
7. Phase Details — short delivery scope per phase (no checkboxes)
8. Dependency Graph — Mermaid flow
9. Cross-Cutting — cross-phase concerns
10. Rule — authoring and update rules

Omit sections that do not apply (for example, an artifact/entity coverage map only when it adds value).

## Writing Rules

1. Keep it coarse-grained. Phase Details are short lists, not implementation steps.
2. Annotate framework/platform reuse explicitly to avoid rebuilding existing capabilities.
3. Keep status accurate. Stale status is worse than no status.
4. Keep dependencies consistent between the table and the graph; the table wins on conflict.
5. Do not duplicate owner-doc content. Phase Details list delivery scope only.

## Update Triggers

All status changes are driven by the plan lifecycle:

| Event | Update | Precondition |
| --- | --- | --- |
| Draft review passes | Phase `todo` -> `planned` | Plan passed independent draft review |
| Closure audit passes | Phase `planned` -> `done` | Must wait for closure audit to pass |
| Closure reveals new reuse opportunity | Update the Reuse section and the phase | Plan closed |
| New or adjusted owner doc | Check impact on Phase Details | — |

## Anti-Patterns

- Writing the roadmap as a detailed implementation plan
- Restating owner-doc business rules in the roadmap
- Letting status go stale
- Marking `done` before closure audit passes
- Not annotating existing framework/platform capabilities, causing redundant rebuilds
- Phasing coarser than a plan's delivery scope, so a finished plan updates nothing in the roadmap and the loop stalls
- Maintaining a per-item status column elsewhere in the roadmap (e.g. a coverage table with its own status), creating a second dynamic block that drifts out of sync with Phase Status
- AI re-arbitrating priority or inventing work items instead of executing the human-planned order
- Tracking "active plan / current blocker / AI autonomy" as fields in `project-context.md` — these are high-churn and go stale; read work-in-progress from unfinished plans instead
