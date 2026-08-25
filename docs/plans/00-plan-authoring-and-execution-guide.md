# Plan Authoring And Execution Guide

## Goal

`docs/plans/` is for non-trivial execution slices that need explicit scope, closure criteria, and proof.

## Format Authority

This guide is the single format authority for plans (contract: `docs/design/age-autonomy/01-file-ledger.md`; machine face: `tools/mission-driver/src/ledger-frontmatter.mjs` + `ledger-sections.mjs` + `ledger-dualread.mjs`). The current format is the **ledger format**: a YAML frontmatter block plus `## Phase <n>` body sections. Completion is **derived**, never written. Legacy plans (pre-migration, `> Plan Status:` header lines) remain readable by the engine's dual-read legacy channel but are historical — do not create new plans in the legacy format.

## When To Write A Plan

Write a plan when the task:

- changes API, database/model, auth, integration, deployment, or public contract behavior
- changes user-visible behavior across more than one feature surface
- touches multiple modules and changes shared behavior
- is expected to take more than one AI session
- modifies more than 5 total files or is likely to exceed roughly 200 changed lines
- needs staged implementation or explicit proof before closure

## Plan Decision Table

| Scope                                                                                                                               | Plan Level | Audit Rule                                                      | Examples                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Trivial local edit                                                                                                                  | No plan    | No draft review                                                 | typo/copy change, single style tweak, test-only cleanup                                |
| Non-trivial tracked work                                                                                                            | Full plan  | independent draft review and independent closure audit required | small UI polish with docs/test update, simple local bug fix with clear existing test   |
| Contract, data/model, API, auth, permission, integration, deployment, cross-surface, stale-doc conflict, or clearly high-risk scope | Full plan  | independent draft review and independent closure audit required | checkout flow, login behavior, data migration, external webhook, multi-module refactor |

If unsure, use a full plan.

## Minimum Rules

1. **Start from live baseline.** Read the repo first, then write `Current Baseline`. Do not rely on memory or old plans. For net-new features, the baseline must inventory all existing code the feature will touch or contradict — hardcoded values, missing hooks, incompatible patterns. An inventory is not optional.
2. **Write Goals and Non-Goals.** If either is unclear, the plan boundary is not ready.
3. **Use checkboxes for execution and closure.** Unchecked items mean unfinished work until closure. Checkboxes live ONLY inside `## Phase <n>` sections and `## Closure Findings` (counting domain, 01 §2.5) — column 0, never in code fences or other sections.
4. **One plan, one result surface.** If the plan needs multiple independent closure criteria, it is too wide. Split it. Multi-module extraction or migration that shares the same behavioral contract and closure criteria is still ONE result surface — do not over-split.
5. **Proof before closure.** Do not consider a plan closed until the repo contains verifiable proof for every exit criterion (mechanical verification pass lines + audit receipt, see the completion formula below).
6. **No code-design dumps.** The plan captures scope, proof, and closure logic, not low-level implementation detail. Exception: refactoring and extraction plans MUST include the interface contracts between extracted modules — these are structural boundary definitions, not implementation pseudocode.
7. **Tag items with types.** Each execution item must be `Fix`, `Add`, `Decision`, `Proof`, or `Follow-up`. `Fix` covers defect repairs; `Add` covers net-new code or config. An item may carry multiple types (e.g., `Decision | Add`); when it does, all implied obligations apply. A confirmed live defect or contract drift must be `Fix`, not `Follow-up`. When 80%+ of items in a phase share one type, declare the uniform type at the phase level instead of per-item (e.g., `Phase 1 — Fix-heavy (8/10 items tagged Fix)`).
8. **Record skill usage deliberately.** For each phase or item where a reusable skill matters, record `Skill: <name>` or `Skill: none`. Skills choose the work method, not the business truth. If a skill is named, its required inputs and expected output must already be clear from `docs/skills/README.md` and the referenced owner docs.
9. **Record Decisions with rationale.** Every `Decision` item must document the choice, the alternatives considered, and the residual risk if any. Write the rationale into the plan or a referenced doc. If a decision requires prototyping or exploration before committing, add a temporary `Explore` item that must conclude before the `Decision` resolves. Framework-forced or obvious choices (e.g. "must match existing framework pattern") can be noted as constrained without full alternatives analysis.
10. **Checklist integrity before closure.** Before closure, no in-scope checklist item may remain unchecked. Either complete it or explicitly move it out of scope with a written reason. Scope narrowing after plan approval is a scope change and must be recorded with rationale; silently removing items from scope is a violation.
11. **Completion is derived (01 §5.2).** A plan is closed iff: `status: active` ∧ every counting-domain checkbox is `[x]` ∧ every frontmatter `verify` key has a `## Verification` pass line whose `basisHash` equals the plan's current basis hash ∧ `## Closure` contains a dispatch line and a same-id accepted line. Nobody writes `completed` — there is no status text to keep consistent with the checkboxes; consistency between "declared done" and "actually done" is enforced by the formula and the M2 gates. Phase progress = that Phase's `[ ]` count (no per-Phase status lines exist).
12. **Independent review and closure audit (receipt-enforced).** A plan may only reach `active` via an independent draft review (receipt lines in `## Draft Review Record`: dispatch + date-iteration conclusion sharing one id) and may only close via an independent closure audit (dispatch + accepted pair in `## Closure`). Self-closing is structurally impossible — `completed` cannot be written. Protected areas, unresolved product risk, and source-of-truth conflicts still require human/subagent review or stay open, per `AGENTS.md`.
13. **Non-degradable items** cannot be downgraded to non-blocking follow-ups: confirmed live defects, confirmed contract drift, confirmed owner-doc drift, and CI/lint rules already fixed in the repo.

### Anti-Slacking Rule

Every in-scope item before closure must land in exactly one state: `landed`, `adjudicated as residual-risk-only`, `moved to explicit successor ownership`, or `removed from scope with recorded reason`.

The following words are forbidden for in-scope items: `optional`, `if time permits`, `consider`, `maybe`, `nice to have`, `as needed`. If an item is truly optional, move it out of scope explicitly rather than leaving it in a fuzzy state.

A `Follow-up` item must name the trigger condition that would promote it into scope (e.g. "when user count exceeds 10K"). A `Deferred But Adjudicated` item must name the event or decision that would reopen it (e.g. "if the new API is adopted, this work may become redundant").

## Plan Frontmatter Field Table

Format subset (hard boundary, 01 §2): flat scalar keys plus single-level flow arrays only; strings written as single-line quoted strings or bare single words; block scalars (`|` / `>`), nested objects, anchors, aliases, and duplicate keys are rejected by the parser — no tolerant fallback.

| Field | Type | Writer | Conditional rules |
| --- | --- | --- | --- |
| `status` | enum string: `draft \| active \| held \| cancelled \| superseded \| deferred` | per transition table (01 §5.1) | required; `completed` is a derived status and must never be written |
| `mission` | non-empty string | drafter at plan creation | required |
| `work-item` | non-empty string | drafter at plan creation | required; must hit a registered roadmap work item (cross-file check lands with M2) |
| `group` | non-empty string | drafter | optional batch tag; falls back to the filename timestamp prefix when absent |
| `failures` | non-negative integer | supervisor (failure attribution) | optional; reset to 0 in the same write that moves held to active |
| `verify` | single-level array of command keys | drafter | optional; defaults to the mission default when absent |
| `agent` | agent-name string | drafter / supervisor routing | optional; may only reference an agents-list name from `autonomy.policy.yml` (cross-file check lands with M2) |
| `hold` | non-empty string | reviewer / supervisor | required while `status: held`; forbidden in any other status |
| `claim` | string `attempt-<runId>-<holderSessionId>-<nonce8>` | supervisor only | only while `status: active`; must appear paired with `claim-expires` |
| `claim-expires` | ISO-8601 timestamp string | supervisor only | only while `status: active`; must appear paired with `claim` |

Example (minimal valid set):

```yaml
---
status: active
mission: age-autonomy-implementation
work-item: M1-WI3
group: "2026-08-25-0635"
failures: 0
verify: [test]
---
```

Retired legacy header lines and their migration mapping (codemod contract, executed 2026-08-25):

| Legacy line | New home |
| --- | --- |
| `> Plan Status: <v>` | frontmatter `status` |
| `> Review Hold: <reason>` | `status: held` + `hold: "<reason>"` |
| `> Mission:` / `> Work Item:` | frontmatter `mission` / `work-item` |
| `> Last Reviewed:` | deleted — review facts live in `## Draft Review Record` |
| `> Audit: required` | deleted — audit receipt lives in `## Closure` |
| `> Source:` / `> Related:` | kept as prose blockquote under the title (machine does not parse them) |
| per-Phase `Status:` lines | deleted — phase progress = the Phase's `[ ]` count |
| `## Closure Gates` | dissolved — executable items merged into the last Phase; consistency/verification/independence guarantees are derived (01 §4.3) |

## Plan Body Sections

Body blocks, in document order. `## Phase <n>` is an h2 heading that may carry a trailing name (`## Phase 1 — <name>` or `## Phase 1 - <name>`); the section runs until the next h2:

```md
# <title>

> Source: <requirement / bug / analysis / request>
> Related: <related plans, optional>

## Current Baseline
## Goals
## Non-Goals
## Phase 1 — <name>
- [ ] 实施项（含 Proof：测试命令）
## Phase 2
- [ ] ...
## Draft Review Record
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0900-demo-plan-1-9f8e7d6c to ses_reviewer_1
- 2026-08-25：iteration 1，共识 acceptable-as-is #review-2026-08-25-063133-mission-driver-2026-08-25-0900-demo-plan-1-9f8e7d6c
## Closure Findings
## Verification
- pass test 2026-08-25-063133-mission-driver basisHash=3f2a9c1b8e7d4f60a5c2e1b9d8f7a3c6e5b4d2f1a9c8e7b6d5f4a3c2e1b9d8f7 exit=0
## Closure
- dispatch audit #audit-2026-08-25-063133-mission-driver-2026-08-25-0900-demo-plan-1-a1b2c3d4 to ses_auditor_1
- accepted #audit-2026-08-25-063133-mission-driver-2026-08-25-0900-demo-plan-1-a1b2c3d4：审计结论与证据
```

The example above is fixture-isomorphic: it parses green under `scanPlanLedger` (concrete id/hash shapes; `<title>` and `<name>` are free prose). Block roles: `## Draft Review Record` / `## Verification` / `## Closure` are append-only (conclusion lines are only appended after the dispatch line; see rules below); `## Closure Findings` is optional and is a counting domain (rework items appended by an audit rejection); `## Phase <n>` sections are the execution checklist.

### Three conclusion-line forms (must not be mixed)

| Context | Line form | Notes |
| --- | --- | --- |
| plan `## Closure` | `- accepted #<id>：结论与证据` | NO `findings=` lexeme |
| roadmap `## Deep Audit Record` | `- accepted #<id> findings=none\|items：结论` | `findings=` required |
| plan `## Draft Review Record` | `- <date>：iteration <n>，共识 <verdict> #<id>` | pairs with the review dispatch, not with accepted lines |

- Dispatch lines: `- dispatch (review|audit) #<id> to <sessionId>`, written before dispatch; reviewers/auditors may only append conclusion lines after it.
- ids: `#review-<runId>-<plan>-<iter>-<nonce8>` / `#audit-<runId>-<plan>-<round>-<nonce8>`; `<plan>` is the filename stem (without `.md`); `<nonce8>` is 8 hex chars (prevents pre-forged receipts). Parsed tail-anchored, so hyphen-rich stems are safe.
- pass lines: `- pass <commandKey> <runId> basisHash=<sha256hex> exit=<code>`; a pass line satisfies mechanical verification only when `exit=0` and its `basisHash` equals the plan's current basis hash (`computeBasisHash` over the frontmatter + all Phase sections + `## Closure Findings`).
- A dispatch line without a same-id conclusion line is a derived-state fact (feeds `awaitingClosure` / the completion formula), not a syntax error.

### Counting-domain and append-only rules

- Checkboxes are counted only at **column 0** inside `## Phase <n>` sections and `## Closure Findings`. Indented lines (e.g. indented gate-command sub-items) are outside the machine face.
- A column-0 checkbox anywhere else is a structural error (counting-domain discipline).
- Lines inside code fences never participate in counting or syntax matching — template examples written in fences do not pollute.
- `## Draft Review Record` / `## Verification` / `## Closure` are append-only regions: lines hitting a known prefix (`dispatch` / `accepted` / `pass` / the date-iteration form) must match the pinned grammar strictly; unknown lines are tolerated as prose (legacy migration corpus keeps old notes). Write-time interception is M2 law.
- Bounded inline review (01 §5.3): a normal review round records 2–3 consensus lines; when a dispute history exceeds ~20 lines, keep the conclusion inline and move the process to a discussion draft.

## Plan Status Flow

Writable statuses (frontmatter `status`): `draft | active | held | cancelled | superseded | deferred`. `completed` is derived (01 §5.2) and `cancelled | superseded | deferred` are writable terminal states — a terminal plan never revives; restarting the work = a new plan.

Recommended default flow for created plans:

1. create the first honest draft as `status: draft`
2. run independent draft review until the draft is acceptable (each round appends receipt lines to `## Draft Review Record`)
3. the reviewer flips `status: draft` → `status: active` on accept
4. execute: tick Phase checkboxes as slices land (ticks are the only per-phase signal)
5. the BUILD_VERIFY step records `## Verification` pass lines; the CLOSURE_AUDIT step records the `## Closure` dispatch/accepted receipt — completion derives from them (never written)

## When Executing

1. Before implementation, revise the plan directly until independent draft review finds no blocking issue; the review receipts live in `## Draft Review Record`.
2. When you start a slice, execute it fully; when it lands, tick its items and its Phase's Exit Criteria `[x]`.
3. Before executing a phase, confirm the listed `Skill` still matches the task and available inputs. If not, update the plan before proceeding.
4. If a slice changes the live baseline or public contract, its exit criteria must include the doc-update step. If no doc update is needed, write `No owner-doc update required` explicitly.
5. Do not mark a slice complete because the function signature exists. Verify that the behavior, error handling, and test coverage land too.
6. If an item cannot be completed, move it to `Deferred But Adjudicated` with classification and reason. Do not leave it unchecked in the execution list.
7. Keep `docs/logs/` in sync with plan progress. A single aggregate log entry at plan closure is sufficient when all phases cover the same feature in one sprint; individual phase entries are required only when a phase spans a different day or a distinct deliverable.

## When Closing

Closing is derived, but a responsible closer still verifies, before the last tick, all of the following:

1. Check every Phase `Exit Criteria` — every one must be `[x]`.
2. Distinguish "interface exists" from "behavior is complete". Verify the actual runtime behavior with a test or demo, not just the type signature.
3. Run the real verification commands for the repo (they become the `## Verification` pass lines). For plans whose primary result surface is visual, behavioral, or UX-driven, customize the verification gates with explicit justification in the plan.
4. **Scoped verification is not full verification.** If a scoped command (e.g. affected-modules-only build) was used instead of the full verification suite, note "verification scope limited" explicitly in the plan and evaluate residual risk. A scoped pass cannot be reported as full green.
5. The closure audit is performed by an independent subagent or reviewer, whose dispatch/accepted receipt in `## Closure` is the machine-checked evidence.
6. If the plan used a solo cold-replay fallback (see `AGENTS.md` Reviewer-Availability Fallback), the closure record MUST state it was used and confirm the cold-replay self-check was performed against the plan, affected docs, the actual diff, and real verification commands.
7. For full closure (multi-session, multi-module, or high-risk plans): re-read the entire plan from the top, not just the most recent slice.

If any of these fail, the plan stays open (its unchecked items keep it open automatically).

## Template

```md
---
status: draft
mission: <mission-name>
work-item: <roadmap-work-item-label>
group: "{YYYY-MM-DD-HHmm}"
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

- <ports, env vars, CORS, secrets, .env, external services this feature depends on>
- <if none, write "No infra prereqs beyond existing baseline">
- <for data-migration plans: include rollback strategy or script path>

## Phase 1 — <name>

Targets: `<paths>`
Skill: `<skill-name | none>`

- Item Types: `Fix | Decision | Proof | Follow-up`
- Prereqs: <phases or external dependencies that must complete first>

- [ ] <implementation item>
      - Skill: `<skill-name | none>`
- [ ] <Decision: record rationale and alternatives in the item or a referenced doc>
  - Skill: `<skill-name | none>`
- [ ] <Proof: specify test strategy (unit/integration/e2e) and exact verification commands>
  - Skill: `<skill-name | none>`

Exit Criteria:

- [ ] <behavior lands — specify success and failure modes>
- [ ] <relevant docs updated, or No owner-doc update required>
- [ ] `docs/logs/` updated

## Draft Review Record

## Verification

## Closure

## Deferred But Adjudicated

### <item name>

- Classification: `watch-only residual | optimization candidate | out-of-scope improvement`
- Why Not Blocking Closure: <reason>
- Successor Required: `yes | no`
```

`## Verification` and `## Closure` start empty — the BUILD_VERIFY / CLOSURE_AUDIT steps fill them (append-only). Do not add a `## Closure Gates` section (retired — derivation covers it) or any per-Phase `Status:` lines.

## Changelog

- 2026-08-25 — **Full switch to the ledger format** (age-autonomy M1-WI9, plan `2026-08-25-0635-3`): template replaced with the frontmatter + `## Phase <n>` skeleton; rules 11 (text consistency) / 12 (status-vs-checkbox consistency) retired and replaced by the completion-derivation formula reference (01 §5.2); the former rule 13 is reformulated as receipt-enforced independent review/closure (dispatch + same-id conclusion lines); `> Last Reviewed:` / `> Audit:` / per-Phase `Status:` / `## Closure Gates` retired with migration mappings recorded; the two M1 additive sections (frontmatter field table, plan body sections) are merged in as the main format sections. Legacy `> Plan Status:` plans remain readable via the engine's dual-read legacy channel (migration: 52 completed plans stay legacy forever).
- 2026-08-25 — Added `## Plan Body Sections (M1 Additive Format)` (age-autonomy 01-file-ledger §4.2/§4.4, plan `2026-08-25-0635-2` M1-WI3/WI5/WI6): canonical new-format body-block example (Phase / Draft Review Record / Closure Findings / Verification / Closure), the three pinned conclusion-line forms (plan accepted without findings / roadmap accepted with `findings=none|items` / review date-iteration line), id + pass-line grammars, counting-domain rules (column-0 discipline, fence skipping), append-only shape policy, and bounded inline review. Machine face: `tools/mission-driver/src/ledger-sections.mjs`. Additive only; examples live inside code fences so counting stays unpolluted.
- 2026-08-25 — Added `## Plan Frontmatter Field Table (M1 Additive Format)` (age-autonomy 01-file-ledger §4.1/§7): new plan frontmatter field set `status/mission/work-item/group/failures/verify/agent/hold/claim/claim-expires` with parser-subset hard boundary and legacy-line migration mapping. Additive only: legacy `> Plan Status:` format stays valid during the transition; rules 11/12/13 retirement and template replacement are planned follow-up work.
