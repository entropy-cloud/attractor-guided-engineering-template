# mdr-fix-3 CHECK configurable check command + prompt rewrite

> Plan Status: active
> Last Reviewed: 2026-07-29
> Source: `docs/backlog/mission-driver-actionable-fixes-roadmap.md` work item 3; `docs/analysis/2026-07-29-0000-mission-driver-actionable-fixes.md` problem #3
> Related: `2026-07-29-1221-1-review-approved-marker-alias.md` (both edit `flows/mission-driver.json`; plan 1 lands first)
> Audit: required

## Current Baseline

Live-state inventory (read from repo, not memory):

- `flows/mission-driver.json:33-43` CHECK is `type:"agent"`, `promptPath:"prompts/health-check.md"`, transitions `pass → REVIEW_PLANS`, `fail → { done: "failed" }`, `onMaxRetries:{done:"failed"}`, `onError:{done:"failed"}`. CHECK is the flow `entry` and no transition returns to it.
- `prompts/health-check.md` is explicitly framed as a **lightweight** gate: title "Perform a lightweight health gate"; line 3 "CHECK is a fast gate, NOT a full build … does NOT auto-repair anything"; line 14 "Do NOT run the mission's build or test commands here … CHECK never modifies the repo"; emits only `<AI_STEP_RESULT>pass</AI_STEP_RESULT>` / `<AI_STEP_RESULT>fail</AI_STEP_RESULT>`.
- `missions/base.json:9-14` `commands` has `test/build/lint/typecheck` — NO `check`.
- `src/main.js:689-692` injects delegate vars `testCmd`/`buildCmd`/`lintCmd`/`typecheckCmd` from `g.commands.*` — no `checkCmd`.
- `src/prompt-check.mjs:75` enforces that NON-forEach prompt result-tag examples use a valid transition marker or top-level `markerAlias` for the step. CHECK is non-forEach, so any marker value shown in `health-check.md` MUST be a CHECK transition key or a `markerAliases` entry, or the lint fails.
- **MATERIAL CONFLICT** — `test/check-lightweight.test.js` (the "OPT-4" suite) explicitly pins the OPPOSITE of the roadmap's prescribed change:
  - `check-lightweight.test.js:26-32` asserts `CHECK.fail` is terminal `{done:"failed"}` and explicitly rejects `fail.retry:"CHECK"` ("no retry-CHECK death-loop").
  - `:34-46` asserts `CHECK.onError` and `CHECK.onMaxRetries` are terminal `{done:"failed"}`.
  - `:52-95` behavioral tests assert a `fail` marker (and a subprocess error) end the run as `failed` with CHECK invoked **exactly once**.
  - The suite's header comment (lines 7-12) documents that CHECK was *deliberately demoted* to a lightweight gate specifically to kill a "repair death-loop". The roadmap's item-3 deliverable (`fail → {retry:"CHECK",maxRetries:2}`) directly re-introduces that death-loop and breaks every assertion in this file.
- This plan touches the Flow JSON contract — a `ask-first` protected area. The `ask-first` status comes from the roadmap's own rule (`docs/backlog/mission-driver-actionable-fixes-roadmap.md` "Item 3 modifies Flow JSON contract (`ask-first` protected area) — its plan must include subagent review") and the plan-authoring-guide Decision Table contract row. (Note: `docs/context/project-context.md` "AI Block Conditions" does not literally enumerate `flows/*.json`; it lists the engine.js core, the zero-dep invariant, `web/dist`, `memory/_index.md`, `install-age.sh`, and the no-owner-doc gate. The ask-first obligation here is therefore carried by the roadmap rule + the contract row, not by the AI Block Conditions list.)

Gaps (two coupled):
1. CHECK cannot run a configurable `commands.check` (e.g. `mvn clean compile`, `pnpm build`) to guarantee the mission starts from a deterministic known-good state.
2. `health-check.md`'s "lightweight / do NOT run build / never repair" framing contradicts the user requirement that CHECK be a deterministic-state gate that auto-fixes on failure when a check command is configured.

## Goals

- Make CHECK a configurable deterministic-state gate: when `commands.check` is configured, run `{{checkCmd}}`; on failure, give the agent an auto-fix+re-run path; fall back to the current git conflict-marker gate when `commands.check` is unconfigured.
- Rewrite `health-check.md` framing from "lightweight, never build/repair" to "deterministic-state gate program" while preserving the git-status fallback.
- Reconcile the new behavior with the OPT-4 protected design+tests (see Decision) rather than silently deleting them.

## Non-Goals

- Making CHECK run the full test suite (that stays BUILD_VERIFY's job — CHECK runs `commands.check`, not `commands.test`).
- A new `gate-check.md` prompt file (roadmap "Out of scope": reuse `health-check.md` with conditional logic).
- Config-driven runtime transition selection in the engine core (would be a larger protected-core change — see Decision option C).

## Task Route

- Type: `architecture change` (Flow JSON contract + step semantics on a protected area)
- Owner Docs: `tools/mission-driver/CONTEXT.md` "关键约束" + Monitor/flow notes; `docs/backlog/mission-driver-actionable-fixes-roadmap.md` §3 + Cross-cutting concerns; `docs/plans/00-plan-authoring-and-execution-guide.md`
- Skill Selection Basis: none — engine/flow contract change; no reusable skill matches. Subagent review is REQUIRED (protected area).

## Infrastructure And Config Prereqs

- No external infra. Backward-compat gate: CHECK must remain a git-status gate (current behavior) when `commands.check` is empty/missing.

## Execution Plan

### Phase 1 - Decide the retry-vs-OPT-4 reconciliation (Explore → Decision)

Status: completed
Targets: this plan (Decision recorded here); no code yet
Skill: none

- Item Types: `Explore | Decision`
- Prereqs: plan 1 landed (both edit `flows/mission-driver.json`)

- [x] Explore: confirm the exact set of OPT-4 assertions in `test/check-lightweight.test.js` that any new CHECK transition shape must satisfy or explicitly supersede, and confirm CHECK's `onMaxRetries`/`onError` current shapes.
  - Skill: none
  - Confirmed against live code: `check-lightweight.test.js:26-32` pins `fail` terminal (no `retry`, no `goto`, `done:"failed"`); `:34-41` pins `onError` terminal; `:43-46` pins `onMaxRetries == {done:"failed"}`; behavioral `:52-95` asserts a `fail` marker (and `ok:false`) ends the run `failed` with CHECK invoked exactly once. Current `flows/mission-driver.json:34-44` CHECK matches: `pass→REVIEW_PLANS`, `fail→{done:"failed"}`, `onMaxRetries:{done:"failed"}`, `onError:{done:"failed"}`. Plan 1 verified landed (`markerAliases.approved == "all_complete"` at `:30`).
- [x] Decision: reconcile the roadmap's "fail → retry" prescription with OPT-4's "fail must be terminal" guarantee. Options:
  - (A) Roadmap literal: `fail → { retry:"CHECK", maxRetries:2 }` and rewrite/remove the OPT-4 tests. Rejected as default — it reopens the repair death-loop OPT-4 was written to prevent, and makes an *unconfigured* (git-status-only) mission also retry CHECK, contradicting OPT-4's rationale and the backward-compat gate.
  - (B) **Recommended** — distinct auto-fix marker. Keep `fail` terminal `{done:"failed"}` (OPT-4 preserved for the unconfigured path AND for exhausted fixes). Add a new transition key (e.g. `needs_fix`) → `{ retry:"CHECK", maxRetries:2 }` with the existing `onMaxRetries:{done:"failed"}`. The rewritten `health-check.md` emits `needs_fix` ONLY when `{{checkCmd}}` is configured and the failure looks auto-fixable (re-run after fix); it emits `fail` when fixes are exhausted or when `checkCmd` is unconfigured and git conflict markers are unresolvable. Net: a git-status-only mission never triggers retry (CHECK still invoked once on real failure); a configured-gate mission gets up to `maxRetries` fix attempts. Residual risk: a model may emit `fail` prematurely instead of `needs_fix` — bounded by `onUnknownMaxRetries` + the prompt's explicit decision tree.
  - (C) Engine reads whether `commands.check` is configured and selects CHECK transitions at runtime. Rejected — the engine has no config-driven transition-selection mechanism today; this is a larger state-machine-core change outside this work item.
  - Chosen: (B). Requires subagent review (protected area). Alternatives + residual risk recorded above. Residual-risk bound precision: `needs_fix` is a KNOWN transition (added in Phase 2), so `onUnknownMaxRetries` does NOT bound it — the actual bound is the transition's own `maxRetries:2` plus the step-level `onMaxRetries:{done:"failed"}` (kept in Phase 2), the same `retry`+`maxRetries`+`onMaxRetries` contract already used by `EXECUTE` in `plan-execution.json`. There is no infinite-loop hole.
  - Skill: none

Exit Criteria:

- [x] Decision recorded with chosen option, rejected alternatives, and residual risk; reviewed by an independent subagent before Phase 2 implementation.

### Phase 2 - Add commands.check + delegate var + flow transition

Status: planned
Targets: `missions/base.json`, `tools/mission-driver/src/main.js`, `tools/mission-driver/flows/mission-driver.json`
Skill: none

- Item Types: `Add | Fix`
- Prereqs: Phase 1 Decision accepted

- [ ] `missions/base.json`: add optional `"check": ""` to `commands` (empty default = unconfigured → git-status fallback). Do NOT add `check` to `mission-check.mjs` `REQUIRED_COMMANDS`.
  - Skill: none
- [ ] `src/main.js`: add `checkCmd: g.commands.check || ""` to `delegates.vars` (parallel to `testCmd`/`buildCmd`).
  - Skill: none
- [ ] `flows/mission-driver.json` CHECK: per Decision (B), keep `fail → {done:"failed"}`; add `needs_fix → { retry:"CHECK", maxRetries:2 }`; keep `onMaxRetries:{done:"failed"}` and `onError:{done:"failed"}`. Do NOT remove or weaken any terminal guarantee OPT-4 relies on.
  - Skill: none

Exit Criteria:

- [ ] `commands.check` flows from base.json → config → `{{checkCmd}}` delegate var (empty when unconfigured).
- [ ] CHECK flow transitions match the chosen Decision; the unconfigured path still terminates on `fail`/`onError`/`onMaxRetries` (no death-loop).
- [ ] `pnpm --prefix tools/mission-driver test` — note: the existing OPT-4 suite (`check-lightweight.test.js`) assertions about `fail` being terminal MUST stay green under Decision (B); only the `needs_fix` path is new. If any OPT-4 assertion must change, that change is recorded here as an in-scope `Fix` with rationale BEFORE editing the test (anti-slacking: no silent removal).

### Phase 3 - Rewrite health-check.md as a deterministic-state gate

Status: planned
Targets: `tools/mission-driver/prompts/health-check.md`
Skill: none

- Item Types: `Fix | Proof`
- Prereqs: Phase 2

- [ ] Rewrite `health-check.md`: reposition CHECK as a deterministic-state gate program. Remove "lightweight / NOT a full build / do NOT run build or test / never modifies the repo" framing. New logic:
  - If `{{checkCmd}}` is non-empty: run it; on success → `pass`; on failure that looks auto-fixable → diagnose+fix+re-run and emit `needs_fix`; only emit `fail` when the issue cannot be auto-fixed (terminal).
  - If `{{checkCmd}}` is empty: fall back to current git conflict-marker detection (clean/dirty → `pass`; unresolved conflict markers → `fail`).
  - Keep CHECK out of BUILD_VERIFY's lane (do not run `commands.test`).
  - Skill: none
- [ ] Proof: `prompt-check.mjs` MUST stay green — every `<AI_STEP_RESULT>value</AI_STEP_RESULT>` example in the rewritten `health-check.md` must use a value that is a CHECK transition key (`pass`,`fail`,`needs_fix`) or a `markerAliases` entry. If a new example marker is introduced, ensure it is either a transition key or add it to `markerAliases` (Decision-aware).
  - Skill: none

Exit Criteria:

- [ ] Rewritten prompt runs `{{checkCmd}}` when configured, auto-fixes via the `needs_fix` retry path, and falls back to git conflict-marker detection when unconfigured.
- [ ] `pnpm --prefix tools/mission-driver test` green (includes `prompt-check.mjs`).
- [ ] Owner-doc update: `tools/mission-driver/CONTEXT.md` notes CHECK is now a configurable deterministic-state gate (commands.check) with git-status fallback; note the `needs_fix` retry semantics.
- [ ] `docs/logs/` updated.

### Phase 4 - Test the configurable gate behavior

Status: planned
Targets: `tools/mission-driver/test/`
Skill: none

- Item Types: `Proof`
- Prereqs: Phase 3

- [ ] Add/update tests covering: (1) unconfigured `checkCmd` → CHECK stays terminal on `fail` (preserve/extend `check-lightweight.test.js` rather than deleting — any deletion is an explicit in-scope `Fix` with rationale); (2) configured `checkCmd` failing once then passing via `needs_fix` → run reaches REVIEW_PLANS within `maxRetries`; (3) configured `checkCmd` failing past `maxRetries` → run ends `failed` (onMaxRetries terminal). Use mock `runAgent`/`runTool` per the existing test helpers (`test/helpers.js`).
  - Skill: none

Exit Criteria:

- [ ] All three behaviors asserted with the real built-in flow via `createMissionDriverFlow`.
- [ ] `pnpm --prefix tools/mission-driver test` green; `node tools/mission-driver/src/mission-check.mjs missions/<name>.json .` validates.
- [ ] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: accept-after-minor-revision (general subagent ses_053e1d4acffeIcJUvk797T5OCz) because the material OPT-4 conflict (facts (a)-(e)) and Decision-B soundness were verified against real code; no blocking issues (Rules 13/14 non-degradation satisfied). Non-blocking accuracy notes: (1) residual-risk bound mis-cited `onUnknownMaxRetries` — `needs_fix` is a KNOWN transition, so the real bound is the transition `maxRetries:2` + step `onMaxRetries`, corrected; (2) the protected-area citation over-claimed `project-context.md` AI Block Conditions lists `flows/*.json` (it does not) — ask-first status actually comes from the roadmap rule + the contract row, corrected. Both folded in.
- Consensus reached: no blocking issues after iteration 1 corrections → promoted to active. Subagent review requirement (protected area) fulfilled by this independent review pass; closure audit must also be independent.

## Closure Gates

- [ ] in-scope behavior complete: configurable `commands.check` gate with auto-fix retry; git-status fallback when unconfigured
- [ ] OPT-4 reconciliation is explicit: the unconfigured `fail` path stays terminal; any change to `check-lightweight.test.js` is recorded with rationale (no silent deletion)
- [ ] relevant docs aligned (CONTEXT.md updated)
- [ ] verification: `pnpm --prefix tools/mission-driver test` + `node tools/mission-driver/src/mission-check.mjs missions/<name>.json .`
- [ ] scoped verification is not conflated with full verification (full suite + a real mission-check — no scope limitation)
- [ ] no in-scope item downgraded to deferred/follow-up
- [ ] independent draft review completed and recorded (subagent — protected area)
- [ ] text consistency verified
- [ ] closure audit was independent (subagent — protected area)
- [ ] closure evidence exists in files

## Deferred But Adjudicated

### Engine config-driven transition selection (Decision option C)

- Classification: `optimization candidate`
- Why Not Blocking Closure: requires new engine state-machine-core capability (runtime transition selection from config) — a protected-area change larger than this work item; Decision (B) delivers the required behavior without it.
- Successor Required: yes — reopen if a future step needs its transition *shape* to depend on runtime config (not just which marker the prompt emits).

## Closure

Status Note: (filled at closure)

Closure Audit Evidence:

- Auditor / Agent: <independent subagent — protected area>
- Evidence: <task id / log link / walkthrough record>

Follow-up:

- (none blocking)
