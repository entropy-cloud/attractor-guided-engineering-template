# Roadmap Authoring Guide

## Terminology Note

The roadmap has two levels:

- A **milestone** is a coarse-grained capability grouping — an organizational container. A milestone **has no status**.
- A **work item** is the atomic markable unit inside a milestone. **Only work items carry status** — as a checkbox.

Vocabulary: **roadmap → milestone → work item**. Do not call a roadmap unit a "phase".

## Purpose

This guide defines what a roadmap under `docs/backlog/` is, how to write it, and when to update it. The roadmap is optional. Use it only when a project is large enough that a flat backlog table no longer shows global progress. It is the single format authority for roadmaps (contract: `docs/design/age-autonomy/01-file-ledger.md` §3; machine face: `tools/mission-driver/src/ledger-sections.mjs` `scanRoadmapLedger` + `ledger-frontmatter.mjs` `validateRoadmapFrontmatter`, read dual-mode via `roadmap-check.mjs`).

## What a Roadmap Is

A roadmap is a milestone index and a work-item status surface. Its core use:

1. After reading the roadmap, an AI or maintainer knows which work items are done and which remain, without re-walking every doc and the codebase — by checkbox (`grep -c "^- \[ \]"`), UI rendering, and machine counting, all through ONE channel.
2. It records each work item's dependencies, owner doc, and reusable framework/platform capabilities.
3. It is the entry point for choosing the next work item.

## Containment: Milestones And Work Items

- A **milestone** groups related work items (e.g. "Core Business Loop", "CRUD for 18 domains"). A milestone is a `### M<n> — <title>` section only — it **never carries a status field**. Its progress is read by scanning its work items.
- A **work item** is the atomic markable unit — a coherent, independently-deliverable slice. It is a column-0 checkbox line inside a milestone block (`- [ ]` = not done, `- [x]` = done). A work item that cannot be completed by a single delivery pass is too large and must be split.

## Roadmap Frontmatter And Audit Record

### frontmatter `audit-rounds`

```yaml
---
audit-rounds: 2          # 已消耗的 mission 级 Deep Audit 轮次（跨 run 跨 session 累计）
---
```

- `audit-rounds` counts only **mission-level Deep Audit rounds** (dispatches recorded under `## Deep Audit Record`), accumulated across runs; plan-level Closure Audits do not consume it. The limit (`maxAuditRounds`) stays in flow/mission config — only the counter lives in the ledger. Non-negative integer; the only allowed roadmap frontmatter field.
- Writers: the engine/audit steps increment it when a Deep Audit round is dispatched (M1 transition: the audit prompts instruct the incrementing write).

### `## Deep Audit Record` (optional; append-only)

```md
## Deep Audit Record
- dispatch audit #audit-2026-08-25-063133-mission-driver-age-roadmap-1-1a2b3c4d to ses_auditor_1
- accepted #audit-2026-08-25-063133-mission-driver-age-roadmap-1-1a2b3c4d findings=none：结论（该 auditorSessionId 写入）
```

The example above is fixture-isomorphic: it parses green under `scanRoadmapLedger` (concrete id shape).

- The accepted line MUST carry `findings=none|items` after the id (machine-readable verdict; distinct from the plan-Closure accepted form, which has no findings lexeme). Findings land as unchecked roadmap work items (or plan Closure Findings); closing them = ticking the checkbox.
- Same dispatch/conclusion pairing, session-id, and append-only rules as plan-level records (see `docs/plans/00-plan-authoring-and-execution-guide.md` § Plan Body Sections).

### Work Item block pure-checkbox discipline

- Work Item status lives ONLY inside `### M<n> — <title>` milestone blocks, as column-0 checkboxes (`- [ ]` / `- [x]`). todo/done counting, reconciliation, and UI rendering share this single grep channel (`grep -c "^- \[ \]"`).
- **The legacy status-suffix form is retired**: `- WI1 …: `done`` and the `## Work Item Status` status table migrated to checkboxes on 2026-08-25 (pre-migration roadmaps remain readable via the engine's dual-read suffix/table fallback). The old `ready` value no longer exists on roadmaps — "draft-reviewed and queued" is carried by the delivering plan's frontmatter `status` (a `ready`-grade work item is simply an unchecked one whose plan is past review).
- Indented lines (e.g. verification-gate command sub-items) are outside the machine face and are not counted. Column-0 checkboxes outside milestone blocks are structural errors. Examples inside code fences never count.

## Roadmap Role: Human–AI Alignment + AI Work Queue

A roadmap serves two audiences with different access patterns:

- **Humans** use it as the steering and observation surface: they decide which milestones and work items exist and their priority order. Humans read the checkboxes to see where AI-driven development has reached. Humans do **not** review individual implementation work.
- **AI** uses it as the work queue: it reads the work items, takes the first unchecked item in the set order, implements it automatically, then writes back by ticking the checkbox. AI does **not** re-arbitrate priority, skip ahead, or invent new work items — if the roadmap needs structural changes (new/removed/re-ordered milestones or work items), AI flags them for human review.

Implementation quality is enforced by closure audit, not human review. The roadmap is how humans steer and observe progress without reading every piece of implementation work.

## Closed Loop

The roadmap and execution form a closed development loop:

1. AI reads the work items and takes the first unchecked item (in set order).
2. AI implements that work item (humans do not review it).
3. On closure audit pass, AI writes back: the work item checkbox is ticked, and any per-component / source-of-truth status is synced.
4. AI returns to step 1 for the next unchecked item.

If implementation finishes but no checkbox updates, the work item was larger than one delivery pass and must be split. "Current work in progress" is read from active plans, not from a field in `project-context.md`.

## What a Roadmap Is NOT

- Not an implementation specification. No implementation steps or closure criteria (those live in plans).
- Not a design doc. It references owner docs; it does not restate business rules.
- Not the backlog. The roadmap is the orchestration layer; backlog items reference roadmap work items.
- Not a second status surface: no status table, no per-item status suffixes, no ❌/✅ icons — the checkbox is the only status carrier.

## Structure

A roadmap usually contains, in order:

1. Frontmatter — `audit-rounds` counter
2. Header — last-updated date, source docs
3. Purpose — what this file is (fixed text, referencing this guide)
4. Work Item Status — the only dynamic status block: milestone blocks (`### M<n> — <title>`) with checkbox work items
5. Framework / Platform Reuse — capabilities already provided by the stack, so the team does not rebuild them
6. Current Baseline — short summary of what exists and the main gaps
7. Dependency Graph — Mermaid flow
8. Cross-Cutting — cross-work-item concerns
9. Rule — authoring and update rules

Omit sections that do not apply.

## Writing Rules

1. Keep it coarse-grained. Work item lines are short; delivery scope detail lives in plans.
2. Annotate framework/platform reuse explicitly to avoid rebuilding existing capabilities.
3. Keep status accurate. A ticked checkbox means the closure audit passed; stale ticks are worse than no roadmap.
4. Keep dependencies consistent between sections; on conflict the milestone blocks win.
5. Do not duplicate owner-doc content.
6. A milestone has no status. Track status on its work items only; do not add a status to a milestone header.

## Update Triggers

| Event | Update | Precondition |
| --- | --- | --- |
| Draft review passes for a work item's plan | Nothing on the roadmap — the plan's frontmatter `status: active` carries it | Draft review passed independently |
| Closure audit passes | Tick the work item `- [ ]` → `- [x]` | Must wait for closure audit to pass |
| Closure reveals new reuse opportunity | Update the Reuse section and the work item | Closure complete |
| New or adjusted owner doc | Check impact on work items | — |

## Multiple Roadmaps

If the project has multiple orthogonal dimensions with independent "done" definitions (e.g. core business logic vs. frontend UI vs. third-party integrations), create separate roadmap files under `docs/backlog/`. Name each file to reflect its dimension, for example `core-business-roadmap.md`, `frontend-ui-roadmap.md`. Each roadmap file follows the same structure and loads its own GRIND notes independently.

When multiple roadmaps exist, list all of them in `docs/backlog/README.md` with a brief description of each roadmap's scope. The template does not prescribe when to split — scope is defined entirely by the user.

## Anti-Patterns

- Writing the roadmap as a detailed implementation specification
- Restating owner-doc business rules in the roadmap
- Letting checkbox state go stale
- Ticking a work item before its closure audit passes
- Not annotating existing framework/platform capabilities, causing redundant rebuilds
- A work item larger than one delivery pass, so finished implementation updates nothing and the loop stalls
- Putting a status on a milestone, a status table, per-item status suffixes, or ❌/✅ icons — any second status channel drifts out of sync with the checkboxes
- AI re-arbitrating priority or inventing work items instead of executing the human-set order
- Tracking "active work / current blocker / AI autonomy" as fields in `project-context.md` — these are high-churn and go stale; read work-in-progress from active plans instead
- Calling a roadmap unit a "phase"

## Changelog

- 2026-08-25 — **Full switch to the checkbox ledger format** (age-autonomy M1-WI9, plan `2026-08-25-0635-3`): work-item status suffixes and the status table are retired (migrated to pure checkboxes; pre-migration roadmaps stay readable via the dual-read fallback); `ready` retires as a roadmap value — plan-side frontmatter `status` carries it; `audit-rounds` frontmatter and `## Deep Audit Record` move from the additive section into the main format; the Status Values table is retired (done = checked, not done = unchecked, everything else derived). Machine face: `scanRoadmapLedger` + dual-read `roadmap-check.mjs`.
- 2026-08-25 — Added `## Roadmap Frontmatter And Audit Record (M1 Additive Format)` (age-autonomy 01-file-ledger §3.1/§3.2/§3.3, plan `2026-08-25-0635-2` M1-WI6): roadmap frontmatter `audit-rounds` semantics, `## Deep Audit Record` dispatch/accepted format with required `findings=none|items`, and the Work Item block pure-checkbox counting discipline. Additive only; examples live inside code fences so counting stays unpolluted.
