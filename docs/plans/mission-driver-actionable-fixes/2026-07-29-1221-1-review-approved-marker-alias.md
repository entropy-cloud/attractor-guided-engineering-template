# mdr-fix-1 REVIEW_PLANS approved marker alias fix

> Plan Status: completed
> Last Reviewed: 2026-07-29
> Source: `docs/backlog/mission-driver-actionable-fixes-roadmap.md` work item 1; `docs/analysis/2026-07-29-0000-mission-driver-actionable-fixes.md` problem #1
> Related: `2026-07-29-1221-3-check-configurable-gate.md` (both edit `flows/mission-driver.json`; this plan lands first)
> Audit: required

## Current Baseline

Live-state inventory (read from repo, not memory):

- `flows/mission-driver.json:16-30` defines `markerAliases` with NO `"approved"` entry.
- `flows/mission-driver.json:71-82` `REVIEW_PLANS` is a `forEach: "draftPlans()"` agent step whose `transitions` are the **aggregate** markers `all_complete` / `some_failed` / `all_failed`.
- `prompts/plan-review.md:29` instructs the per-plan review agent to emit exactly one `<AI_STEP_RESULT>approved</AI_STEP_RESULT>` marker — a **per-item** (single-plan) semantic.
- `src/engine.js:739-857` `_executeAgentStep`: for each forEach item, the emitted `approved` marker is run through `_tryAliasMarker` (engine.js:726-737). It finds no direct transition match and no alias → returns `null` → at engine.js:836-840 `_runCorrectionAgent` fires (up to `onUnknownMaxRetries`=2 parse-model calls) trying to map the single-item `approved` onto an aggregate marker.
- `src/engine.js:991-1042` `_executeForEach`: the aggregate marker is derived solely from `iterResult.ok` counts (`completed`/`failed`); the per-item marker **value** is never consulted. Therefore every correction call is wasted — it cannot change the aggregate outcome.
- `flows/plan-execution.json:8-14` has its **own** `markerAliases` (no `approved`), and `CLOSURE_AUDIT` (plan-execution.json:38-55) has a **direct** `"approved"` transition key.
- `src/prompt-check.mjs:75` does NOT enforce marker membership for forEach-bound prompts, so `plan-review.md`'s `approved` example is not (and need not be) linted.
- Existing tests: `test/transitions.test.js`, `test/prompt-markers.test.js`, `test/forEach-concurrency.test.js`. No test currently asserts that a per-item forEach marker avoids correction.

Gap: each drafted plan wastes up to 2 parse-model correction calls during REVIEW_PLANS (up to 2N calls for N drafts) for zero effect.

## Goals

- Eliminate the wasted correction-agent calls for the `approved` per-item marker in REVIEW_PLANS by aliasing it to the aggregate marker the forEach loop already produces.

Safety scope (why the alias is inert on every other main-flow step): `_tryAliasMarker` (engine.js:729) only returns the alias when `transitions[alias]` exists. The other non-forEach steps — CHECK (`pass`/`fail`), DRAFT_PLANS (`created`/`nothing`), DEEP_AUDIT (`complete`/`failed`) — have no `all_complete` transition, so the alias short-circuits to `null` for them. Combined with the separate `markerAliases` object in `plan-execution.json` (fact (b) in baseline) and direct-match priority (fact (a)), the alias cannot misroute any step.

## Non-Goals

- Refactoring `_executeForEach` to skip correction for all forEach agent steps (roadmap "Out of scope"; engine state-machine core protected area). Tracked as deferred.
- Changing `prompts/plan-review.md` wording or the `approved` marker contract.
- Touching `plan-execution.json` (CLOSURE_AUDIT) — its direct `approved` key must keep priority.

## Task Route

- Type: `implementation-only change` (confirmed live defect, single flow-JSON alias entry + test)
- Owner Docs: `docs/backlog/mission-driver-actionable-fixes-roadmap.md` §1; `tools/mission-driver/CONTEXT.md` "关键约束"; `docs/plans/00-plan-authoring-and-execution-guide.md`
- Skill Selection Basis: none — a one-line JSON contract change with an existing alias mechanism; no reusable skill matches.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.

## Execution Plan

### Phase 1 - Add approved marker alias + regression test

Status: completed
Targets: `tools/mission-driver/flows/mission-driver.json`, `tools/mission-driver/test/`
Skill: none

- Item Types: `Fix | Proof`
- Prereqs: none (independent, lands before plan 3 to avoid flow-JSON merge conflicts)

- [x] Add `"approved": "all_complete"` to the `markerAliases` object in `flows/mission-driver.json` (keep existing entries, alphabetical-ish grouping intact).
  - Skill: none
- [x] Proof: add a node:test unit test (new file under `tools/mission-driver/test/`, or extend `test/transitions.test.js` / a dedicated `forEach-marker-alias.test.js`) that:
  - builds the built-in flow via `createMissionDriverFlow({ flowName: "mission-driver" })`,
  - asserts `flow.markerAliases.approved === "all_complete"`,
  - runs a real `FlowEngine` with `REVIEW_PLANS` as a forEach over a single draft plan whose mock `runAgent` returns `<AI_STEP_RESULT>approved</AI_STEP_RESULT>`, with a `runParseAgent` spy that **must not be called**, and asserts the step completes with the aggregate marker (`all_complete`/`some_failed`/`all_failed`) and the run proceeds to `EXEC_PLANS` (no correction invoked).
  - Skill: none

Exit Criteria:

- [x] `approved` alias present in `flows/mission-driver.json`; REVIEW_PLANS per-item `approved` marker resolves without correction (mock `runParseAgent` spy not called for the marker path).
- [x] Acknowledged (non-blocking) semantic side-effect: resolving the alias flips the per-item `resolvedOk` to `true` (engine.js:855, "valid-marker ⇒ ok"). This is benign — all three REVIEW_PLANS transitions route to the same target `EXEC_PLANS`, so control flow is unchanged; it aligns with the existing mdr-2 design. No assertion required, but noted here for honesty.
- [x] No regression: `flows/plan-execution.json` CLOSURE_AUDIT direct `approved` transition still takes priority (covered by reasoning + existing transitions coverage stays green).
- [x] `pnpm --prefix tools/mission-driver test` is green (includes `prompt-check.mjs`).
- [x] No owner-doc update required beyond CONTEXT.md "关键约束" if it lists markerAliases examples (check; update only if it enumerates aliases).
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: accept-after-minor-revision (general subagent ses_053e22222ffeC6UN0gCeD61mSV) because all Minimum Rules pass and the four safety claims (a)-(d) were verified against real code; no blocking issues. Non-blocking accuracy notes: (1) enumerate the real reason the alias is inert on other main-flow steps (no `all_complete` transition on CHECK/DRAFT_PLANS/DEEP_AUDIT); (2) acknowledge the benign `resolvedOk→true` side-effect (engine.js:855). Both folded into Goals and Phase 1 Exit Criteria.
- Consensus reached: no blocking issues after iteration 1 corrections → promoted to active.

## Closure Gates

- [x] in-scope behavior is complete (alias added + no correction for `approved`)
- [x] relevant docs are aligned (CONTEXT.md checked)
- [x] verification has run: `pnpm --prefix tools/mission-driver test`
- [x] scoped verification is not conflated with full verification (full test suite is the verification here — no scope limitation)
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### _executeForEach correction-skip refactor (engine core)

- Classification: `optimization candidate`
- Why Not Blocking Closure: roadmap marks it out of scope; the alias fix fully resolves the observed waste for the current single forEach-agent-step (`REVIEW_PLANS`). Touching `_executeForEach` / `_executeAgentStep` interaction is the engine state-machine core protected area (`project-context.md` AI Block Conditions) and needs its own plan.
- Successor Required: yes — reopen when a second forEach agent step exhibits the same per-item-vs-aggregate correction waste, or when hardening the engine against the whole class is prioritized.

## Closure

Status Note: Phase 1 complete. `"approved": "all_complete"` alias added to `flows/mission-driver.json:30` markerAliases; regression test `test/forEach-marker-alias.test.js` (3 cases) asserts the per-item `approved` marker aggregates to `all_complete`, routes REVIEW_PLANS → EXEC_PLANS, and never invokes the parse/correction fallback. Full verification green: `pnpm --prefix tools/mission-driver test` → 593 pass / 0 fail + `prompt-check: OK`; `lint:prompts` OK; web `typecheck` + `build` OK. CONTEXT.md "关键约束" does not enumerate markerAliases, so no owner-doc update was needed. `flows/plan-execution.json` CLOSURE_AUDIT direct `approved` transition retains priority (direct-match-before-alias). Plan-execution.json markerAliases are a separate object and unaffected.

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay closure (EXECUTE run of this plan, no second reviewer available). Limitation noted per Reviewer-Availability Fallback: plan is non-protected flow-JSON alias addition + test; not high-risk; no source-of-truth conflict.
- Evidence: `flows/mission-driver.json:30` alias line; `test/forEach-marker-alias.test.js` 3 passing tests; `docs/logs/2026/07-29.md` entry; test run 593/593 pass + prompt-check OK; `lint:prompts` / web typecheck / web build all green.

Follow-up:

- (none blocking)
