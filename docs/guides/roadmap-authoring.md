# Roadmap Authoring Guide

## Purpose

A roadmap under `docs/roadmaps/` is a milestone index and a work-item status surface. It is the planning layer between owner docs and plans: owner docs define what is true; the roadmap decides which work items remain, in what order, with which dependencies; plans execute the work items.

A roadmap is recommended for substantial goal-directed work; small low-risk tasks can stay direct. The task-oriented loop and completion-update procedure live in `roadmap-goal-execution.md`.

## Terminology

- **roadmap → milestone → work item**. Never call a roadmap unit a "phase" (phases belong to plans).
- A **milestone** (`### M<n> — <title>`) is an organizational container and never carries a status.
- A **work item** is the atomic markable unit: a column-0 checkbox line (`- [ ]` / `- [x]`). Only work items carry status.

## Execution Model (v2)

Every plan born from a roadmap is:

1. **Executed by an independent subagent** — the executor reads the plan and the owner docs, implements, verifies, and ticks phase items. It does not modify the roadmap.
2. **Audited by a different independent subagent** — the closure auditor re-checks behavior, proof, and doc alignment, then records the closure receipt. The auditor must not be the executor.
3. After the closure audit passes, the **roadmap checkbox is ticked** — by the auditor's pass (or by the coordinating session recording that pass). This is the only step that writes roadmap status.

Independent acceptance is required; reviewer unavailability leaves a plan open (see `docs/guides/plan-authoring-and-execution.md`).

## Work-Item Sizing And The Work-Item ↔ Plan Mapping

Size a work item so that it corresponds to **one plan with 2–6 phases**. The mapping rules:

| Situation | Allowed? | Rule |
| --- | --- | --- |
| One work item → one plan | Yes (the normal case) | default shape |
| Several work items → one plan | Yes | only when they share one result surface and one closure criteria set (e.g. three small fixes landing in the same module slice) |
| One work item → several plans | **No — forbidden** | if a work item needs multiple plans, it is too large: **split the work item in the roadmap**, then map the split items normally |

Signs a work item is oversized: its plan would need more than 6 phases; more than one independent closure criteria set; more than one deliverable pass to land.

Signs a work item is undersized: its plan would carry a single trivial edit with no independently verifiable result — bundle it into a neighboring work item or the next plan.

## Plans Directory

Each roadmap owns a plans subdirectory named after its slug:

```
docs/roadmaps/frontend-ui-roadmap.md
docs/plans/frontend-ui/2026-05-21-1530-user-list-plan.md
docs/plans/frontend-ui/2026-05-24-1010-form-validation-plan.md
```

Create the subdirectory when the roadmap is created. Plans of one roadmap never live in another roadmap's directory. This isolation prevents bookkeeping collisions between parallel roadmaps.

**Roadmap files carry no date prefix.** A roadmap is a living status surface, not a one-shot record: missions reference it by stable `roadmapPath`, plans carry its slug in `mission:` frontmatter, and routing tables link it by name. Its currency lives in the checkbox state; a date-stamped name would rot the references without adding information. (Plans, by contrast, are one-shot records — they get dated names.)

**Single-home execution.** One roadmap has one execution home and selector at a time. This avoids duplicate dispatch, not all shared-file conflicts. Pending human/AI edits follow the built-in-tool completion-update procedure in `roadmap-goal-execution.md`; worktree log naming follows `docs/guides/log-writing.md`.

## Roadmap Structure

A roadmap usually contains, in order (omit what does not apply):

1. Frontmatter — `audit-rounds` counter (see below)
2. Header — purpose, source docs
3. `## Work Item Status` — the only dynamic status block: milestone blocks with checkbox work items
4. `## Framework / Platform Reuse` — capabilities the stack already provides, so they are not rebuilt
5. `## Current Baseline` — short summary of what exists and the main gaps
6. `## Dependency Graph` — Mermaid, kept consistent with the milestone blocks (on conflict, milestone blocks win)
7. `## Cross-Cutting` — concerns spanning work items
8. `## Deep Audit Record` — append-only audit receipts (see below)

Canonical milestone fragment:

```md example
### M2 — Tech Selection

- [x] WI9 Time-series store selection (Owner: `docs/architecture/telemetry-storage-design.md`; deps: M1)
- [ ] WI10 Protocol adapter architecture confirmation (Owner: `docs/design/protocol-adapter-design.md`; deps: M1)
```

- Work-item id = first token after the checkbox, convention `WI<n>`, **numbers increment file-globally** (milestones do not reset the counter; duplicates are rejected by the structural check).
- Trailing parentheticals (`Owner:` / `Deliverable:` / `deps:` / evidence pointers) are the sanctioned metadata slots; they never replace the `WI<n> <short label>` head. `Owner:` points to an existing doc that will own the resulting truth; `Deliverable:` points to an artifact to be produced.
- Column-0 checkboxes outside milestone blocks are structural errors. Indented lines and code-fenced examples never count.

## Frontmatter And Audit Record

```yaml
---
audit-rounds: 0
---
```

- `audit-rounds` counts consumed mission-level deep-audit rounds, accumulated across runs; plan-level closure audits do not consume it. It is the only allowed roadmap frontmatter field. (Relevant when the mission-driver add-on is enabled; see `docs/guides/mission-driver-add-on.md`.)

```md
## Deep Audit Record
- dispatch audit #audit-2026-08-25-063133-mission-driver-age-roadmap-1-1a2b3c4d to ses_auditor_1
- accepted #audit-2026-08-25-063133-mission-driver-age-roadmap-1-1a2b3c4d findings=none: conclusion (written by that auditor)
```

- The accepted line MUST carry `findings=none|items` (distinct from plan-closure accepted lines, which carry no `findings=` lexeme). `findings=items` findings land as unchecked roadmap work items **in the same edit that records the receipt** — recording findings without landing carriers is a format violation (closure gate: findings without a carrier = 0, see `docs/guides/audit-execution.md` Finding Format And Disposition). Closing them = ticking the checkbox.
- Same dispatch/conclusion pairing and append-only rules as plan records (see `docs/guides/plan-authoring-and-execution.md`).

## Completion By Checkbox Search

Done/remaining is a search query, never a second status surface:

```bash
node tools/plan-status.mjs --roadmap docs/roadmaps/<slug>-roadmap.md   # verdict + remaining lines
```

Zero unchecked boxes = the roadmap is complete (then run the completion summary, section below). The same channel reads plans: a plan is complete iff its counting-domain boxes are all `[x]` plus its Verification/Closure receipts — never a written status.

## Two Audiences

- **Humans** steer: they decide which milestones and work items exist and in what order; they read checkboxes to see progress; they do not review individual implementation work.
- **AI** coordinates eligible work in order, preserving dependencies, and delivers through independent execution/audit. Pending research/audit/decision items may be added, split or reordered with evidence inside the approved objective/autonomy; changes to business scope, protected areas or acceptance authority need their original authority. In-flight scope remains fixed. See `roadmap-goal-execution.md` for ordinary completion updating and delivery before next selection.

## Writing Rules

1. Keep it coarse-grained: a work-item line must be clear enough to decide the delivering plan's scope, and short enough not to become a spec. Delivery scope detail lives in plans.
2. Annotate framework/platform reuse explicitly.
3. Keep status accurate: a ticked checkbox means the closure audit passed. Stale ticks are worse than no roadmap.
4. Do not duplicate owner-doc content; reference it.
5. Never add a second status channel (status table, per-item suffixes, icons, fields in `project-context.md`). Work-in-progress is read from active plans.

## Update Triggers

| Event | Update | Precondition |
| --- | --- | --- |
| Plan draft review passes | nothing on the roadmap | — |
| Closure audit passes | tick `- [ ]` → `- [x]` | audit receipt recorded in the plan |
| Closure reveals a reuse opportunity | update Reuse section + the work item | closure complete |
| New or adjusted owner doc | check impact on work items | — |
| A pending work item needs multiple plans | **split the work item** (this guide) | approved objective/autonomy preserved; in-flight scope changes reconciled explicitly |
| Roadmap completes (last work item ticked) | run the completion bugs/lessons summary (section below) | last work item closure audit passed |

## Completion: Bugs And Lessons Summary

When the last work item of a roadmap is ticked, close the roadmap with a completion summary pass over the whole delivery instead of just walking away:

1. **Summarize what needs recording.** Walk the delivered work items and decide whether they surfaced fixed non-obvious regressions, discovered-but-unfixed findings, or durable reusable lessons. Record fixed regressions per `docs/guides/bug-fix-note.md` (under `docs/bugs/`), register unfixed findings in the project's defect ledger, and record lessons under `docs/lessons/`.
2. **Record the items that meet the bar, without duplicating existing records.** Search existing `docs/bugs/` and `docs/lessons/` entries first and write only genuinely new ones; a recurrence of an already-recorded pattern is promoted via the skill/checklist route instead of a second note.
3. **State the outcome.** Record the summary conclusion — including "nothing new to record" when that is the honest result — in the dev-log entry for the roadmap closure.

## Anti-Patterns

- Writing the roadmap as an implementation specification
- Restating owner-doc business rules
- Ticking before closure audit passes; letting checkbox state go stale
- A work item larger than one delivery pass (loop stalls: implementation finishes, nothing updates)
- One work item spread across several plans instead of being split
- Plans of this roadmap living outside `docs/plans/<roadmap-slug>/`
- Any second status channel; dotted milestone headings (`M0.3`); per-milestone WI counter resets
- AI changing business scope/acceptance authority or breaking dependencies without approval
- Changelog sections or dated update entries inside the roadmap file (it is a status surface, not a history log — evidence pointers ride on the work-item line)
