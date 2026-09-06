# Roadmap Authoring Guide

## Terminology Note

The roadmap has two levels:

- A **milestone** is a coarse-grained capability grouping — an organizational container. A milestone **has no status**.
- A **work item** is the atomic markable unit inside a milestone. **Only work items carry status** — as a checkbox.

Vocabulary: **roadmap → milestone → work item**. Do not call a roadmap unit a "phase".

## Purpose

This guide defines what a roadmap under `docs/backlog/` is, how to write it, and when to update it. The roadmap is optional. Use it only when a project is large enough that a flat backlog table no longer shows global progress. It is the single format authority for roadmaps (contract: `docs/design/age-autonomy/01-file-ledger.md` §3; machine face: `$MISSION_DRIVER_HOME/src/ledger-sections.mjs` `scanRoadmapLedger` + `ledger-frontmatter.mjs` `validateRoadmapFrontmatter`, read dual-mode via `roadmap-check.mjs`).

## What a Roadmap Is

A roadmap is a milestone index and a work-item status surface. Its core use:

1. After reading the roadmap, an AI or maintainer knows which work items are done and which remain, without re-walking every doc and the codebase — by checkbox (`grep -c "^- \[ \]"`), UI rendering, and machine counting, all through ONE channel.
2. It records each work item's dependencies, owner doc, and reusable framework/platform capabilities.
3. It is the entry point for choosing the next work item.

### Role In The Document Hierarchy

The roadmap is the planning layer between owner docs and plans. Detailed design information lives in owner docs (`docs/design/`, `docs/architecture/`, `docs/analysis/`, ...); the roadmap plans the NEXT ACTIONS over those docs — which work items remain, in what order, with which dependencies. Plans are drafted FROM the roadmap: the engine's DRAFT_PLANS step reads the roadmap, takes the first unchecked work items, and drafts one plan per item. The per-item action contract — purpose, deliverables, verification — is pinned in the drafted plan, not in the roadmap line. A work item whose plan was never drafted has no action contract; the roadmap only decides that the action is still owed, not how to perform it.

## Containment: Milestones And Work Items

- A **milestone** groups related work items (e.g. "Core Business Loop", "CRUD for 18 domains"). A milestone is a `### M<n> — <title>` section only — it **never carries a status field**. Its progress is read by scanning its work items.
- A **work item** is the atomic markable unit — a coherent, independently-deliverable slice. It is a column-0 checkbox line inside a milestone block (`- [ ]` = not done, `- [x]` = done). A work item that cannot be completed by a single delivery pass is too large and must be split. Size a work item so it roughly corresponds to ONE plan: the engine drafts one plan per work item, and the line must carry enough clarity to decide that plan's scope — a work item whose plan would need multiple independent result surfaces is oversized and must be split.

## Roadmap Frontmatter And Audit Record

### frontmatter `audit-rounds`

```yaml
---
audit-rounds: 2          # consumed mission-level Deep Audit rounds (accumulated across runs/sessions)
---
```

- `audit-rounds` counts only **mission-level Deep Audit rounds** (dispatches recorded under `## Deep Audit Record`), accumulated across runs; plan-level Closure Audits do not consume it. The limit (`maxAuditRounds`) stays in flow/mission config — only the counter lives in the ledger. Non-negative integer; the only allowed roadmap frontmatter field.
- Writers: the engine/audit steps increment it when a Deep Audit round is dispatched (M1 transition: the audit prompts instruct the incrementing write).

### `## Deep Audit Record` (optional; append-only)

```md
## Deep Audit Record
- dispatch audit #audit-2026-08-25-063133-mission-driver-age-roadmap-1-1a2b3c4d to ses_auditor_1
- accepted #audit-2026-08-25-063133-mission-driver-age-roadmap-1-1a2b3c4d findings=none: conclusion (written by that auditorSessionId)
```

The example above is fixture-isomorphic: it parses green under `scanRoadmapLedger` (concrete id shape).

- The accepted line MUST carry `findings=none|items` after the id (machine-readable verdict; distinct from the plan-Closure accepted form, which has no findings lexeme). Findings land as unchecked roadmap work items (or plan Closure Findings); closing them = ticking the checkbox.
- Same dispatch/conclusion pairing, session-id, and append-only rules as plan-level records (see `docs/plans/00-plan-authoring-and-execution-guide.md` § Plan Body Sections).

### Work Item block pure-checkbox discipline

- Work Item status lives ONLY inside `### M<n> — <title>` milestone blocks, as column-0 checkboxes (`- [ ]` / `- [x]`). todo/done counting, reconciliation, and UI rendering share this single grep channel (`grep -c "^- \[ \]"`).
- **Work-item id = the first token after the checkbox** (`WI_ID_RE` takes the first `\S+` token); the naming convention is `WI<n>` with **globally incrementing numbers across the whole file** — ids must be unique file-wide (milestones do NOT reset the counter; `scanRoadmapLedger` reports `duplicate-work-item-id` otherwise). Plans reference a work item cross-file via the composite label `work-item: M<n>-WI<a>`. Milestone numbers are integers (`M(\d+)`) — dotted ids like `M0.3` are not milestone headings.
- Canonical milestone + work-item fragment (inside a fence so it never pollutes counting):

  ```md
  ### M2 — Tech Selection

  - [x] WI9 Time-series store selection (Owner: `docs/architecture/telemetry-storage-design.md`; deps: M1)
  - [ ] WI10 Protocol adapter architecture confirmation (Owner: `docs/design/protocol-adapter-design.md`; deps: M1)
  ```

  Trailing parentheticals (Owner / deps / evidence / plan pointers) are the sanctioned place for extra metadata — they ride AFTER the `WI<n> <short label>` head and never replace it. Use `Owner:` for an existing doc that owns the work item's resulting truth; for research or production items whose target artifact does not exist yet, use `Deliverable:` pointing to the artifact to be produced (e.g. the report path) — a pre-existing input document is never evidence of completion.
- **The legacy status-suffix form is retired**: `- WI1 …: `done`` suffixes and `## Work Item Status` status tables give way to column-0 checkboxes (pre-migration roadmaps remain readable via the engine's dual-read suffix/table fallback). The old `ready` value no longer exists on roadmaps — "draft-reviewed and queued" is carried by the delivering plan's frontmatter `status` (a `ready`-grade work item is simply an unchecked one whose plan is past review).
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

1. Keep it coarse-grained. A work item line must be clear enough to decide the delivering plan's scope and content, but stay short — detailed information must be supported by external docs (design docs, research reports). Delivery scope detail lives in plans.
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
- Resetting `WI<n>` numbers per milestone, or duplicating work-item ids anywhere in the file (ids are file-global; the machine face rejects duplicates)
- Dotted milestone headings (`### M0.3 — …`) — the heading grammar is `M` + integer only
- AI re-arbitrating priority or inventing work items instead of executing the human-set order
- Tracking "active work / current blocker / AI autonomy" as fields in `project-context.md` — these are high-churn and go stale; read work-in-progress from active plans instead
- Calling a roadmap unit a "phase"

