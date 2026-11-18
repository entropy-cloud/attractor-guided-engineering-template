# Plan Authoring And Execution Guide

## Goal

`docs/plans/<roadmap-slug>/` is for non-trivial execution slices that need explicit scope, closure criteria, and proof. This guide is the single format authority for plans.

## When To Write A Plan

Write a plan when the task:

- changes API, database/model, auth, integration, deployment, or public contract behavior
- changes user-visible behavior across more than one feature surface
- touches multiple modules and changes shared behavior
- is expected to take more than one AI session
- modifies more than 5 total files or is likely to exceed roughly 200 changed lines
- needs staged execution or explicit proof before closure

Skip a formal plan for low-risk edits: copy changes, small styling fixes, test-only cleanups, single-file behavior fixes with clear existing tests, and small multi-file edits (1–3 non-generated files, ~200 lines) touching no contract/data/auth/integration/deployment surface. Even without a plan, verify against the real diff and real commands, and record a log entry.

## Plan Size: 2–6 Phases

Both ends are bounded:

- **Too much**: more than 6 phases means the plan cannot be drafted, reviewed, and closed in one pass. Move the remainder into a successor plan via `## Deferred But Adjudicated` with a `Next plan:` pointer — and record on the roadmap that the work item needs splitting (one work item must never be spread across multiple plans; split the work item instead, see `docs/guides/roadmap-authoring.md`).
- **Too little**: a plan must carry at least one independently verifiable result. Bundle trivial edits into the next plan of the same roadmap instead of minting single-item plans.
- **One plan, one result surface**: if the plan needs multiple independent closure criteria sets, it is too wide — split it. A multi-module change sharing one behavioral contract is still one result surface; do not over-split.

## Cold-Start Continuity

Chat is disposable. An executor session may be a brand-new window with zero prior conversation — the plan plus the docs tree must be sufficient to start (and resume) work. Hard rules:

1. **Self-contained entry contract.** The plan must name everything a fresh session needs: owner-doc paths (Task Route), affected paths (each Phase's `Targets:`), exact verification commands (frontmatter `verify` + Proof items), and the current baseline. A reader with no chat history must be able to classify, locate, and verify — anything less forces reliance on chat memory and breaks continuation.
2. **No decisions living only in chat.** If a decision was made in conversation, it lands in the plan body, the discussion note, or the owner doc before execution proceeds. Unwritten decisions do not exist.
3. **Progress is readable from files only.** Which phases are done = the plan's checkboxes; which work items remain = the roadmap's checkboxes; what happened and why = logs. A new session reconstructs full state by reading files — never by asking "where were we".
4. **Resume = re-read, not recall.** A session resuming a half-done plan re-reads the whole plan (plus owner docs) before its first tick; it does not continue from remembered context.

Draft review checks this property explicitly: "could a cold session execute this plan with chat closed?" is a blocking review question.

## Independent Execution And Independent Audit

For every plan created under this guide:

1. **Execution is performed by an independent subagent.** The executor session reads the plan + owner docs, implements the phases, runs verification, and ticks checkboxes. It does not self-approve.
2. **Closure audit is performed by a different independent subagent** (not the executor, not the drafter where avoidable). The auditor checks behavior, proof, and doc alignment, then appends the closure receipt.
3. Draft review before activation is likewise independent (a subagent or human reviewer distinct from the drafter).

Receipts carry actual coordinator-dispatched sessions (`to <sessionId>`); execution is recorded in `## Execution` as `- Executor: <sessionId>`. `node tools/plan-status.mjs --check <plan>` checks latest paired acceptance and declared reviewer/auditor/executor independence. The ids are portable evidence, not authentication. Current-payload Git delivery is specified once in `roadmap-goal-execution.md`.

If an independent reviewer/executor/auditor is unavailable, keep the plan open and report the blocker. Cold replay is useful preparation, not independent acceptance.

## Format

The format is the **ledger format**: a YAML frontmatter block plus `## Phase <n>` body sections. Completion is **derived**, never written — there is no `completed` status text to keep consistent with the checkboxes.

The standalone `tools/plan-status.mjs --check <plan>` checks receipt integrity; consumer `deliveryReady` also checks counting domains and verification. With the optional engine, `node tools/mission-driver/src/gate-check.mjs <plan>` provides engine-specific structural checks; hook/CI wiring is explicit, not implied by installation. Do not pass an unsupported `--strict` flag to gate-check. Compatibility boundaries are in `roadmap-goal-execution.md`.

### Frontmatter Field Table

Format subset (hard boundary): flat scalar keys plus single-level flow arrays; single-line quoted strings or bare words; no block scalars, nested objects, anchors, or duplicate keys.

| Field | Type | Writer | Rules |
| --- | --- | --- | --- |
| `status` | `draft \| active \| held \| cancelled \| superseded \| deferred` | per transitions | required; `completed` is derived and must never be written |
| `mission` | non-empty string | drafter | required; roadmap slug, or `standalone` for a local consumer task |
| `work-item` | non-empty string | drafter | required; roadmap label `M<n>-WI<a>`, or `local:<task-id>` for standalone use |
| `group` | string | drafter | optional review-batch id; omit for independent plans |
| `failures` | non-negative int | supervisor | optional; attribution only |
| `verify` | flow array of command keys | drafter | explicit nonempty keys for consumer delivery; bind each to real commands in prerequisites/context (engine defaults are not consumer proof) |
| `hold` | string | reviewer | required while `status: held`, forbidden otherwise |

Example:

```yaml
---
status: draft
mission: frontend-ui
work-item: M1-WI3
verify: [test]
---
```

### Body Sections

```md
# <plan-id> <title>

> Source: <requirement / bug / analysis / request>
> Related: <related plans, optional>

## Current Baseline
## Goals
## Non-Goals
## Task Route
## Infrastructure And Config Prereqs
## Phase 1 — <name>
## Phase 2 — <name>
## Draft Review Record
## Closure Findings
## Verification
## Closure
## Deferred But Adjudicated
```

(See the Template section at the end for the full skeleton.)

- `## Phase <n>` sections are the execution checklist: column-0 checkboxes only, each item typed `Fix | Add | Decision | Proof | Follow-up`, with per-item `Skill:` lines where a reusable skill matters.
- `## Draft Review Record` / `## Verification` / `## Closure` are **append-only** receipt regions.
- `## Closure Findings` is an optional counting domain for audit-rejection rework items.
- Checkboxes live only at column 0 inside `## Phase <n>` and `## Closure Findings`. A column-0 checkbox anywhere else is a structural error. Code fences never count.

### Receipt Lines (must not be mixed)

| Context | Line form |
| --- | --- |
| plan `## Closure` | `- accepted #<id>: conclusion and evidence` (no `findings=`) |
| roadmap `## Deep Audit Record` | `- accepted #<id> findings=none\|items: conclusion` (`findings=` required) |
| plan `## Draft Review Record` | `- <date>：iteration <n>，共识 <verdict> #<id>` (`共识` is a pinned grammar token — do not translate) |

- Dispatch lines: `- dispatch (review|audit) #<id> to <sessionId>`, written before dispatch.
- ids: `#review-<runId>-<plan>-<iter>-<nonce8>` / `#audit-<runId>-<plan>-<round>-<nonce8>`; `<plan>` is the filename stem; `<nonce8>` is 8 hex chars.
- Pass lines: `- pass <commandKey> <runId> exit=<code>`; satisfies mechanical verification when the key is required by the plan and `exit=0`.
- Consumer commit delivery adds a payload suffix and ownership evidence to verification/closure; see `roadmap-goal-execution.md` for the exact command sequence and finalization metadata.

## Minimum Rules

1. **Start from live baseline.** Read the repo first, then write `Current Baseline`. For net-new features, inventory all existing code the feature touches or contradicts — not optional.
2. **Write Goals and Non-Goals.** If either is unclear, the boundary is not ready.
3. **Use checkboxes** for execution and closure; unchecked means unfinished.
4. **Size honestly: 2–6 phases, one result surface, one deliverable pass.**
5. **Proof before closure.** Every exit criterion has verifiable proof in the repo.
6. **No code-design dumps.** Scope, proof, closure logic. Exception: refactor plans must state extracted-module interface contracts.
7. **Tag item types** (`Fix | Add | Decision | Proof | Follow-up`). A confirmed live defect or contract drift must be `Fix`, not `Follow-up`.
8. **Record skill usage** (`Skill: <name>` / `Skill: none`) where a reusable skill matters; skills choose the method, not the business truth.
9. **Record Decisions with rationale** — choice, alternatives, residual risk; constrained/obvious choices can be noted as such.
10. **Checklist integrity**: no in-scope item unchecked at closure; scope narrowing after approval is a recorded scope change, never silent deletion.
11. **Completion is derived**: `status: active` ∧ all counting-domain checkboxes `[x]` ∧ every required `verify` key has a passing `## Verification` line ∧ `## Closure` has a dispatch + same-id accepted line. Nobody writes `completed`.
12. **Independent acceptance**: activation requires paired draft-review acceptance; closure requires paired audit acceptance by a different actor from executor and draft reviewer. Check actual dispatch provenance as well as recorded ids.
13. **Non-degradable items** (confirmed defects, contract drift, owner-doc drift, fixed CI rules) cannot be downgraded to fuzzy follow-ups.
14. **Validate the draft before hand-off.** Engine mode: run `node tools/mission-driver/src/gate-check.mjs <plan>` until clean. Without the engine: self-check against this guide's checklist and let independent draft review confirm; use the standalone receipt check after recording its result.

### Anti-Slacking Rule

Every in-scope item lands in exactly one state: `landed`, `adjudicated as residual-risk-only`, `moved to explicit successor ownership`, or `removed from scope with recorded reason`. Forbidden words for in-scope items: `optional`, `if time permits`, `consider`, `maybe`, `nice to have`, `as needed`. A `Follow-up` item must name its promotion trigger; a deferred item must name its reopening event.

## Status Flow

1. Draft honestly (`status: draft`)
2. Independent draft review until acceptable (receipts in `## Draft Review Record`); the reviewer flips to `active` on accept
3. Execute: independent executor subagent ticks Phase items as slices land
4. Verification pass lines are recorded in `## Verification`
5. Independent closure auditor records `## Closure` receipts — completion derives

AI reads and updates plan content/status with built-in Read/Edit/Write tools. Activation follows independent draft acceptance; `held` requires a reason, and terminal states do not revive. The legacy human-facing setter retains admission checks but is not an AI document-editing channel. Read-only queries:

```bash
node tools/plan-status.mjs --check docs/plans/<slug>/<plan>.md
node tools/plan-status.mjs --list
node tools/plan-status.mjs --unfinished
```

Terminal states (`cancelled | superseded | deferred`) never revive; restarting = a new plan.

## When Executing

1. Revise the plan until independent draft review finds no blocking issue, before implementation.
2. Execute a slice fully; tick its items and Phase exit criteria when landed.
3. Re-confirm the listed `Skill` still matches before each phase.
4. If a slice changes the live baseline or public contract, its exit criteria include the doc-update step — or state `No owner-doc update required` explicitly.
5. Do not mark complete because the signature exists; verify behavior, error handling, coverage.
6. Uncompletable items move to `Deferred But Adjudicated` with classification — never left fuzzy-unchecked.
7. Keep `docs/logs/` in sync with the decision/adjustment policy (`docs/guides/log-writing.md`): user rulings, major AI decisions, and repeats/oscillations get log entries; **plan progress and verification detail stay in the plan** and are not restated in the log. One aggregate closure entry when phases share one feature/sprint; per-day entries when phases span days or a distinct decision lands.

## When Closing

1. Every Phase exit criterion `[x]`.
2. Distinguish "interface exists" from "behavior is complete" — verify runtime behavior, not types.
3. Run the real verification commands (they become `## Verification` lines). Visual/UX result surfaces customize gates with explicit justification in the plan.
4. **Scoped verification is not full verification**: note "verification scope limited" and evaluate residual risk; a scoped pass is never reported as full green.
5. The closure audit is independent (subagent/human ≠ executor); its receipt is the machine-checked evidence.
6. If independent acceptance is unavailable, leave closure open; cold replay does not substitute for it.
7. Full closure (multi-session/multi-module/high-risk): re-read the entire plan from the top.
8. On pass, tick the roadmap work-item checkbox (the only roadmap write).

## Template

```md
---
status: draft
mission: <roadmap-slug>
work-item: <M n - WI a>
verify: [test]
---

# <plan-id> <title>

> Source: <requirement / bug / analysis / request>
> Related: <related plans, optional>

## Current Baseline

- <what is true today>
- <what gap remains>

## Goals

- <result to achieve>

## Non-Goals

- <explicitly excluded work>

## Task Route

- Type: `<requirement clarification | app-layer design change | architecture change | implementation-only change | bug investigation | verification or audit work>`
- Owner Docs: `<paths>`
- Skill Selection Basis: `<why these skills or none apply>`

## Infrastructure And Config Prereqs

- <ports, env, secrets, external services; or "No infra prereqs beyond existing baseline">
- <data-migration plans: rollback strategy or script path>

## Phase 1 — <name>

Targets: `<paths>`
Skill: `<skill-name | none>`

- [ ] <implementation item (Fix | Add | Decision | Proof | Follow-up)>
- [ ] <Proof: test strategy and exact verification commands>

Exit Criteria:

- [ ] <behavior lands — success and failure modes>
- [ ] <relevant docs updated, or "No owner-doc update required">
- [ ] `docs/logs/` updated — satisfied by decision-bearing entries only; if nothing needs the log, state "No log entry required" rather than writing filler.

## Phase 2 — <name>

<...>

## Draft Review Record

## Verification

## Closure

## Deferred But Adjudicated

### <item name>

- Classification: `watch-only residual | optimization candidate | out-of-scope improvement`
- Why Not Blocking Closure: <reason>
- Successor Required: `yes | no`
```

`## Verification` and `## Closure` start empty and are append-only. No `## Closure Gates` section, no per-Phase status lines, no legacy `> Plan Status:` headers.
