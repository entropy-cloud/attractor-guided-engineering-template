# 2026-07-22-1223-2 Exit-Code Map Flow-Error Statuses (O7)

> Plan Status: completed
> Last Reviewed: 2026-07-22
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-mission-driver-draft-robustness.md` (finding O7)
> Related: `docs/plans/mission-driver-draft-robustness/2026-07-22-1223-1-plan-check-cli-guard-cross-platform.md` (sibling plan, distinct closure surface — no execution dependency between the two)
> Audit: required

## Current Baseline

Live state at HEAD `217af6d` (audited 2026-07-22 07:55, O7 evidence re-verified during plan authoring):

- **The exit-code contract lives in `main.js:749`** (inside `cmdRunMission`):
  ```js
  const exitMap = { completed: 0, single_step_done: 0, failed: 1, max_cycles: 2, max_total_steps: 2, max_retries: 2 };
  const exitCode = exitMap[result.status];
  if (exitCode !== undefined) process.exitCode = exitCode;
  ```
  Engine terminal statuses also include `ping_pong`, `unknown_step`, `unknown_type`, `no_transition`, `invalid_transition`, `skipped` (all reachable via `_result(...)` in `engine.js` — verified at `engine.js:1466` `unknown_step`, `:1538` `ping_pong`, `:1602` `skipped`, `:1621` `unknown_type`, `:1892` `no_transition`, `:1972` `invalid_transition`). **None of these are in `exitMap`** → `exitCode === undefined` → `process.exitCode` is never set → Node exits **0 (success)**.
- **The owner doc contradicts the code**. `tools/mission-driver/EXECUTION-PRINCIPLE.md` §11 (line 584):
  ```
  | 未知 step / 类型 / 非法转换 | `unknown_step` 等 | 1 | 流程定义错误 |
  | 检测到两步 ping-pong        | `ping_pong`      | — | 死循环保护   |
  ```
  I.e. flow-definition errors (`unknown_step`, `unknown_type`, `no_transition`, `invalid_transition`) are **documented as exit 1** but the code makes them exit 0. (`ping_pong` is documented `—` — exiting 0 is consistent with the dash, though "death-loop masquerading as success" is questionable for scripted callers; the doc's `—` is itself ambiguous and needs an explicit decision.)
- **No test pins this**. `core.test.js:210` asserts `result.status === "unknown_step"`, `:355` asserts `"ping_pong"`, `transitions.test.js:389` asserts `"no_transition"` — these assert the **engine status**, never the `main.js` exit-code mapping (the engine does not compute exit codes; only `cmdRunMission` does, and that path is not exercised for these statuses). `single-step.test.js:6` notes `single_step_done → 0` in a comment but does not assert the mapping for the error statuses.
- **Production impact**: latent (validated flows rarely hit these), but a genuine code-vs-doc contract break with zero test coverage. Anyone scripting the driver (`./tools/mission-driver.sh X && next-step`, or a CI gate) treats a flow-definition error or a death-loop as **success** and proceeds. The tool is explicitly designed around a 0/1/2 exit-code contract (the `2` codes encode loop-guard trips), and the doc promises exit 1 for exactly this class.
- **Severity**: MEDIUM-LOW. Latent, but a documented-contract drift + a behavioral defect with zero test coverage.

## Goals

- Extend `main.js:749` `exitMap` so every documented terminal status maps to its documented exit code (closes O7's code defect for `unknown_step` / `unknown_type` / `no_transition` / `invalid_transition` → exit 1, per `EXECUTION-PRINCIPLE.md §11`).
- Decide (Decision) the exit code for `ping_pong` deliberately — the doc's `—` is ambiguous — and update both code and doc to match.
- Add a `cmdRunMission`-level test (or a focused exitMap unit test) asserting every documented terminal status maps to its documented exit code, so a future regression that drops a status from `exitMap` fails the suite.
- Sync `EXECUTION-PRINCIPLE.md §11` (and any other place that documents the exit-code contract) to whatever the code now does — close the doc-vs-code drift in both directions.

## Non-Goals

- Changing the engine's terminal-status set, the `_result(...)` call sites, or the conditions under which each status fires — those are correct; this plan only changes how `main.js` translates them to exit codes.
- Restructuring `cmdRunMission` or moving the exitMap elsewhere — the fix is the smallest possible (extend the map + decide `ping_pong`).
- Touching the `skipped` status's exit code unless the Decision explicitly adjudicates it (today it exits 0 via the same undefined-map path; `EXECUTION-PRINCIPLE.md §11` does not list `skipped`, so it is out of scope unless the Decision promotes it).
- Closing the O7 audit's "brittle code path covered by no test" broader observation beyond the exit-code map itself.

## Task Route

- Type: `bug investigation` (O7 is a confirmed live code-vs-doc contract drift) + `implementation-only change` (one map extension + one Decision + one test + one doc sync).
- Owner Docs: `tools/mission-driver/EXECUTION-PRINCIPLE.md` §11 (the controlling exit-code contract table); `tools/mission-driver/design/mission-design.md` (referenced for any higher-level exit-code discussion); `docs/architecture/mission-driver-baseline.md` (checked for any architecture-level exit-code claim — none found; the doc focuses on run-state shape, not exit codes).
- Skill Selection Basis: `Skill: none`. The work is a localized map extension + a Decision + a focused regression test + a doc sync; no reusable skill method applies beyond the standard verification discipline already encoded in AGENTS.md "Verification Baseline" + this plan's Phase 3 Proof items.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline. The full suite runs via `pnpm --prefix tools/mission-driver test` (already chained with `lint:prompts` per the F7 closure).

## Execution Plan

### Phase 1 - Extend `exitMap` and decide `ping_pong` (O7 code fix)

Status: completed
Targets: `tools/mission-driver/src/main.js` (around `:749`)
Skill: none

- Item Types: `Fix | Decision`
- Prereqs: none (builds on HEAD `217af6d` which is 533/533 green; this is an additive code correction)

- [x] `Decision` — Decide the exit code for `ping_pong` (the doc's `—` is ambiguous). Alternatives:
  1. **`ping_pong: 2`** — aligns with the other loop-guard codes (`max_cycles: 2`, `max_total_steps: 2`, `max_retries: 2`); a death-loop IS a loop-guard trip, so the contract is internally consistent. Scripted callers can distinguish "definition error" (1) from "loop guard" (2). Recommended.
  2. **`ping_pong: 1`** — treats it as a generic failure alongside `failed: 1`; loses the loop-guard signal.
  3. **`ping_pong: 0`** — preserves today's de-facto behavior (silent success); contradicts the tool's "0 = success" contract since a death-loop is not success. Reject unless there is a documented caller that relies on this.
  
  Record the choice + alternatives + residual risk in the Closure section. The recommended alternative is (1) `ping_pong: 2` for internal consistency with the existing loop-guard codes; the doc's `—` then becomes a concrete `2` with the same "死循环保护" meaning.
  - Skill: none
  - **Resolution**: chose alternative (1) `ping_pong: 2`. See Closure section for the recorded choice + alternatives + residual risk.
- [x] `Fix` — Extend `main.js:749` `exitMap` to map the four flow-definition error statuses to exit 1 and (per the Decision above) `ping_pong` to its chosen code:
  ```js
  const exitMap = {
    completed: 0, single_step_done: 0,
    failed: 1,
    unknown_step: 1, unknown_type: 1, no_transition: 1, invalid_transition: 1,
    max_cycles: 2, max_total_steps: 2, max_retries: 2,
    ping_pong: 2,  // per Phase 1 Decision (alternative 1) — loop-guard alignment
  };
  ```
  Add a one-line comment citing `EXECUTION-PRINCIPLE.md §11` so the next maintainer knows the map and the doc must stay in sync (the project's Rule 12 "rare comments on local constraints easy to misread" exception — this map and the doc table are easy to drift apart, as O7 itself demonstrates).
  - Skill: none
  - **Resolution**: implemented as top-level `export const EXIT_MAP` at `src/main.js:45-51` (additive refactor — also enables Phase 2's direct-import test). Consumer at `cmdRunMission` `:767` reads `EXIT_MAP[result.status]`. 10-line comment block at `:35-44` cites `EXECUTION-PRINCIPLE.md §11` + the `skipped`/dynamic-`done` carve-out.

Exit Criteria:

- [x] `main.js:749` (or its replacement) `exitMap` includes all four flow-definition error statuses (`unknown_step`, `unknown_type`, `no_transition`, `invalid_transition`) → exit 1, and `ping_pong` → its Decision-chosen code.
- [x] Decision recorded in the Closure section with chosen alternative, alternatives considered, and residual risk.
- [x] No owner-doc update required in this phase (`EXECUTION-PRINCIPLE.md §11` sync is owned by Phase 3 — the code and doc MUST land in the same commit per the Docs Maintenance rule, but the doc edit is scoped to Phase 3 to keep the commit unit coherent).

### Phase 2 - Add a focused exitMap regression test (O7 test coverage)

Status: completed
Targets: `tools/mission-driver/test/exit-map.test.js` (new) OR extend `tools/mission-driver/test/core.test.js` / `tools/mission-driver/test/single-step.test.js` (Decision in item)
Skill: none

- Item Types: `Add | Decision | Proof`
- Prereqs: Phase 1 complete (the test would assert the extended map)

- [x] `Decision` — Decide test placement. Alternatives:
  1. **New `test/exit-map.test.js`** — focused unit test that imports the exitMap (or `cmdRunMission` if the map is not exported) and asserts every documented terminal status → documented exit code. Cleanest separation; easy to extend when statuses are added.
  2. **Extend `core.test.js`** — add a block alongside the existing `unknown_step` / `ping_pong` status assertions, also asserting the exit-code mapping. Co-locates with the engine-status assertions; trades focus for proximity.
  
  Recommended: alternative (1) — a focused test makes the contract drift the audit flagged structurally impossible to reintroduce. If the map is not exported from `main.js`, export it (additive `export const EXIT_MAP = { ... }` referenced by `cmdRunMission`); this also makes the test not depend on spawning a full `cmdRunMission` process.
  - Skill: none
  - **Resolution**: chose alternative (1) — new `test/exit-map.test.js`. The map is exported (`EXIT_MAP`) per Phase 1's additive refactor, so the test imports it directly (no spawn).
- [x] `Add` — Implement the chosen test. Two mandatory assertion blocks:
  1. **Documented-status mapping block** — for each documented terminal status in `EXECUTION-PRINCIPLE.md §11` (`completed`, `failed`, `max_cycles`, `max_total_steps`, `max_retries`, `ping_pong`, `unknown_step`, `unknown_type`, `no_transition`, `invalid_transition`) AND `single_step_done` (documented in `single-step.test.js:6` comment), assert `exitMap[status]` equals the documented exit code. This is the row-by-row contract pin O7 names.
  2. **No-documented-status-maps-to-undefined sweep** — iterate the documented-status list from block 1 and assert none is `undefined` in `exitMap`. **Scope explicitly to the documented set** (the 11 statuses above): the engine emits additional statuses not in §11 (notably `skipped` at `engine.js:1602`, and dynamic `done` values like `onMaxRetries.done` at `:1357`) which are intentionally NOT in `exitMap` and therefore intentionally map to `undefined` (exit 0 by Node's default). Asserting "engine's full terminal-status set" would be self-contradictory with the `skipped` deferral below; the sweep's contract is "every status the doc promises an exit code for actually has one", which is the exact gap O7 names. (If a future flow promotes `skipped` to a documented terminal status, the deferred item below reopens and the sweep list expands.)
  
  If the map is not exported from `main.js`, export it (additive `export const EXIT_MAP = { ... }` referenced by `cmdRunMission`); this also makes the test not depend on spawning a full `cmdRunMission` process.
  - Skill: none
  - **Resolution**: implemented 11 mapping cases + 2 sweep cases (13 total). Single-source-of-truth `DOCUMENTED` table consumed by both blocks so a §11 row change is a one-place update.
- [x] `Proof` — Run `pnpm --prefix tools/mission-driver test` and confirm: (a) the new exit-map test cases all pass; (b) the full suite remains green (target: 533 baseline + N new cases); (c) the chained `prompt-check: OK` line still prints. Record the pass count + duration verbatim in the log entry.
  - Skill: none
  - **Resolution**: 551 pass / 0 fail (538 baseline + 13 new; duration 13.10s); `prompt-check: OK`. Regression-detection proof: simulated the pre-O7 broken map against the sweep logic → 5 documented statuses would be unmapped (5 cases would fail); live `EXIT_MAP` returns correct values.

Exit Criteria:

- [x] Every documented terminal status (the 11 listed above: `completed`, `failed`, `max_cycles`, `max_total_steps`, `max_retries`, `ping_pong`, `unknown_step`, `unknown_type`, `no_transition`, `invalid_transition`, `single_step_done`) has an explicit exit-code assertion.
- [x] The "no-documented-status-maps-to-undefined" sweep passes — scoped to the documented set, with the `skipped` + dynamic-`done` carve-out explicit (those are unmapped by design and owned by the `Deferred But Adjudicated` item below).
- [x] If `cmdRunMission`'s exitMap was not previously exported, the additive `export const EXIT_MAP` is now part of `main.js`'s public exports surface — flag this for the architecture-doc public-exports section (Phase 3 doc sync).
- [x] Full suite green: `pnpm --prefix tools/mission-driver test` → `pass <baseline+N> / fail 0` + `prompt-check: OK`.

### Phase 3 - Sync `EXECUTION-PRINCIPLE.md §11` to the code (O7 doc closure)

Status: completed
Targets: `tools/mission-driver/EXECUTION-PRINCIPLE.md` (§11 table around `:583-584`), `docs/architecture/mission-driver-baseline.md` (check for any exit-code mention — none found at plan authoring time, but re-verify before close)
Skill: none

- Item Types: `Fix`
- Prereqs: Phase 1 complete (so the doc matches the Decision-chosen code)

- [x] `Fix` — Update `EXECUTION-PRINCIPLE.md §11` to resolve the `ping_pong` `—` ambiguity: change `| ping_pong | — |` to `| ping_pong | 2 |` (or whichever code the Phase 1 Decision chose), keeping the "死循环保护" meaning. Verify the `unknown_step 等 | 1` row still matches the code's four explicit statuses; expand the `等` "etc." to name them explicitly (four statuses: `unknown_step`, `unknown_type`, `no_transition`, `invalid_transition`) so the doc and the code agree row-by-row without an ambiguous "etc.". Search the repo for any other place that documents the exit-code contract (`grep -rn "exit.*code\|exitMap\|process.exitCode" tools/mission-driver/ docs/` per the audit's residual-unknowns note; `CONTEXT.md` is a known sync target — it references `exitMap` / `single_step_done → 0` alignment in the WI5/step-audit section) and sync any other mention found.
  - Skill: none
  - **Resolution**: `EXECUTION-PRINCIPLE.md §11` `ping_pong` row changed `— → 2`; `等` expanded to name all four flow-definition statuses explicitly. `.opencode/skills/mission-driver/references/mission-config-schema.md:269` synced (added `no_transition` — the skill doc already had `ping_pong → 2` but was missing `no_transition`). `docs/architecture/mission-driver-baseline.md` Public Exports `src/main.js` row extended to name `EXIT_MAP`. Other grep hits (`CONTEXT.md:87`, `step-execution-and-audit-count-design.md:385`, `mission-driver-step-audit-roadmap.md:135`, `draft-robustness-design.md` WI1 reject) re-verified accurate and intentionally untouched (passing `single_step_done → 0` references or different code paths). Audit evidence quotes in `2026-07-22-0755-open-audit-*.md` left as historical evidence (must not edit audit history).

Exit Criteria:

- [x] `EXECUTION-PRINCIPLE.md §11` table's `ping_pong` row has a concrete exit code (no more `—`); the code's `exitMap` and the doc's table agree row-by-row for every documented status.
- [x] Any other repo mention of the exit-code contract (found via grep) is also synced, OR an explicit note is added citing `EXECUTION-PRINCIPLE.md §11` as the single source of truth.
- [x] `docs/architecture/mission-driver-baseline.md` re-checked for any exit-code mention; if the additive `export const EXIT_MAP` lands, decide whether to add a row to the Public Exports section (per the doc's "function-name-anchored" convention adopted in the A1-b closure).

### Phase 4 - Record green baseline + close

Status: completed
Targets: git index (commit), `docs/logs/2026/07-22.md`, `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-mission-driver-draft-robustness.md` (audit-status flip is owned by the mission-driver closure step, not this plan — see Closure)
Skill: none

- Item Types: `Proof`
- Prereqs: Phases 1–3 complete

- [x] `Proof` — Run the **full** verification suite against the working tree before commit: `pnpm --prefix tools/mission-driver test` must end in `pass <baseline+N> / fail 0` AND the final `prompt-check: OK` line.
  - Skill: none
  - **Resolution**: 551 pass / 0 fail + `prompt-check: OK`; typecheck clean; build success (14.30s, pre-existing chunk-size warning only); `lint:prompts` OK.
- [x] `Proof` — Commit the batch as one verify-then-committed unit: the Phase 1 exitMap extension + Phase 2 test (+ optional `export const EXIT_MAP`) + Phase 3 doc sync + the Phase 4 log entry from the item below. Use a commit message that names O7 and cites the green pass count. Per AGENTS.md Docs Maintenance, the verification-green status MUST appear in the log entry and the commit message (known-good baseline for future debugging).
  - Skill: none
- [x] `Proof` — Add a dated `docs/logs/2026/07-22.md` (top entry, reverse chronological) recording: the green pass count, the O7 fix (one-line summary + the Phase 1 `ping_pong` Decision outcome), and the doc sync. Cite this plan path.
  - Skill: none
  - **Resolution**: log entry added as top entry with all required details (green pass count, O7 summary, ping_pong Decision outcome, doc sync, regression-detection proof, scope proof, closure note).

Exit Criteria:

- [x] `git status --short` shows no uncommitted in-scope files from this plan (`main.js`, `EXECUTION-PRINCIPLE.md`, optionally `mission-driver-baseline.md`, the new test file, the log entry, this plan file).
- [x] `git log --oneline -1` shows the new commit; the commit message contains the green pass count and names O7.
- [x] `docs/logs/2026/07-22.md` top entry records the O7 fix with the verification-green status.

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (independent fresh session `ses_077e7b473ffewKlCvU4Msguq4K`, 2026-07-22) — three blocking issues: (1) Phase 2 sweep CONTRADICTED its own `skipped` deferral — the sweep item said "iterates the engine's full terminal-status set" including `:1602` (`skipped`), but `skipped` is unmapped (intentionally deferred) so the sweep as written could not pass. Reviewer traced `_result(...)` call sites live and found `skipped` plus dynamic `done` values (`onMaxRetries.done` at `:1357`) that are not statically enumerable. (2) Cross-reference error: "Phase 4" should be "Phase 3" at two places (doc-sync ownership). (3) Forbidden word "optional" in Phase 3 `Fix` item. Non-blocking notes acknowledged: `_reconcileTerminal` (`:568-596`) can downgrade `ping_pong`/`failed`/`max_*` → `completed` (the "death-loop masquerading as success" framing is weaker than stated but the fix is unchanged); `CONTEXT.md` is a known additional sync target (now named explicitly in Phase 3); `:20` §11 citation should be `:583-584` not `:584` (Phase 3 already correct).
- Independent draft review iteration 2: `acceptable-as-is` (independent fresh session `ses_077dfbabcffe5eyboPCgSHX5eX`, 2026-07-22) — all three iteration-1 blocking issues verified resolved; revisions introduce no self-contradictory or un-executable design. Reviewer traced the sweep re-scoping live: Phase 2 block 2 now scopes to "the documented set (the 11 statuses above)" with explicit `skipped` (`engine.js:1602`) + dynamic-`done` (`onMaxRetries.done` `:1357`) carve-out cross-referenced to `Deferred But Adjudicated`; sweep contract "every status the doc promises an exit code for actually has one" is now self-consistent with the `skipped` deferral and executable. "Phase 4"→"Phase 3" cross-references fixed at both sites (line 89 + line 151). Forbidden "optional" removed from Phase 3 `Fix`; `等` expansion is now required, naming exactly the four flow-definition-error `_result(...)` call sites verified live (`unknown_step`/`unknown_type`/`no_transition`/`invalid_transition` at `engine.js:1466/1621/1892/1972`). 11-status documented list cross-checked against `EXECUTION-PRINCIPLE.md §11` — complete. `CONTEXT.md` named explicitly as sync target (verified `CONTEXT.md:87` references `single_step_done` + `main.js exitMap`). Non-blocking notes (no change required): "optional" survives on two file-list lines (151, 158) describing conditionally-present files within mandatory `Proof` items gated by upstream Decisions — NOT in-scope items marked optional, so not an Anti-Slacking violation; `_reconcileTerminal` (`engine.js:568-596`, opt-in) can downgrade `ping_pong`/`failed`/`max_*` → `completed` before reaching exitMap when roadmap is 100% done, but the `ping_pong` Decision is still necessary for flows without the flag — plan framing accurate. Plan ready for `Plan Status: active`.

## Closure Gates

- [x] in-scope behavior is complete (exitMap covers all documented terminal statuses; Phase 1 `ping_pong` Decision resolved; doc synced)
- [x] relevant docs are aligned (`EXECUTION-PRINCIPLE.md §11` row-by-row matches `exitMap`; `docs/logs/2026/07-22.md` updated with green baseline + O7 fix + Decision outcome; `docs/architecture/mission-driver-baseline.md` Public Exports re-checked if `EXIT_MAP` was exported)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` → `pass <baseline+N> / fail 0` + `prompt-check: OK`
- [x] no in-scope item downgraded to deferred/follow-up (the Phase 1 `ping_pong` Decision and the Phase 2 test-placement Decision are both `Decision` items with explicit adjudication, not skips)
- [x] independent draft review completed and recorded (Draft Review Record above)
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent (separate subagent or fresh-session cold-replay per AGENTS.md Reviewer-Availability Fallback — this plan is non-protected and non-high-risk: source audit rated O7 MEDIUM-LOW latent code-vs-doc contract drift; the exit-code change is to a documented contract that the doc itself already promised, so callers scripting against the doc's exit-1 promise GAIN correctness; no contract/API/auth/data change beyond closing the doc-vs-code drift in the direction the doc already promised)
- [x] closure evidence exists in files (commit + log entry + the new exit-map test + the extended `exitMap` at `src/main.js` + the synced `EXECUTION-PRINCIPLE.md §11` ARE the evidence)

## Deferred But Adjudicated

### `skipped` status exit code

- Classification: `watch-only residual`
- Why Not Blocking Closure: `EXECUTION-PRINCIPLE.md §11` does not list `skipped`; today it exits 0 via the same undefined-map path. The audit (O7) explicitly scopes the code fix to `unknown_step` / `unknown_type` / `no_transition` / `invalid_transition` + the `ping_pong` Decision; `skipped` is not in the audit's recommended fix.
- Successor Required: `yes` — trigger condition: a future flow makes `skipped` a documented terminal status (i.e. it appears in `EXECUTION-PRINCIPLE.md §11` or a caller scripts against its exit code) → at that point add `skipped: 0` (or the chosen code) explicitly to `exitMap` and to the doc.

## Closure

Status Note: O7 closed. The code defect (exitMap omitting the four flow-definition error statuses + `ping_pong`) is corrected — `src/main.js` now exports `EXIT_MAP` covering all 11 documented terminal statuses, consumed by `cmdRunMission`. The Phase 1 `ping_pong` Decision resolved the doc's ambiguous `—`: chose alternative (1) `ping_pong: 2` for internal consistency with the other loop-guard codes (`max_cycles` / `max_total_steps` / `max_retries` all → 2); a death-loop IS a loop-guard trip, so the 0/1/2 contract stays coherent and scripted callers can distinguish "definition error" (1) from "loop guard" (2). Alternatives rejected: (2) `1` (loses the loop-guard signal, treats death-loop as generic failure); (3) `0` (contradicts "death-loop is not success", preserves today's de-facto silent-success behavior). Residual risk: scripted callers relying on today's de-facto exit 0 for `ping_pong` will now see exit 2 — but the doc's `—` was ambiguous, so any caller relying on undocumented behavior was already broken-by-design; the change closes the drift in the direction the doc already promised. Regression-pinned by `test/exit-map.test.js` (13 cases: 11 documented-status mapping + 2 sweep guards) — the pre-O7 broken map would fail 5 documented-status cases. Doc synced: `EXECUTION-PRINCIPLE.md §11` `ping_pong` row `— → 2` + `等` expanded to name all four flow-definition statuses explicitly; `.opencode/skills/mission-driver/references/mission-config-schema.md` `no_transition` added (was missing); `docs/architecture/mission-driver-baseline.md` Public Exports `EXIT_MAP` entry added. Green baseline committed (551 pass / 0 fail + `prompt-check: OK`).

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay pass (no second reviewer available; non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback). Independent draft review completed earlier (2 iterations, recorded in Draft Review Record above).
- Evidence: see `git log --oneline -1` for the verify-then-committed unit (commit message names O7 + cites the 551-pass green count). Concrete artifacts: the `export const EXIT_MAP` at `src/main.js:45-51` + consumer at `cmdRunMission` `:767`, the new `test/exit-map.test.js` (13 cases, regression-detection proof in log entry), the synced `EXECUTION-PRINCIPLE.md §11` table (`ping_pong` row + four-status `等` expansion), the synced `mission-config-schema.md:269` (`no_transition` added), the synced `docs/architecture/mission-driver-baseline.md` Public Exports row, and the top `docs/logs/2026/07-22.md` entry with green pass count + Decision outcome.
