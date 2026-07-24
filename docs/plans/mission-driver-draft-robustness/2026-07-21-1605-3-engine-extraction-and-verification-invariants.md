# mdr-remediate-3 engine extraction + subflow + verification invariants (N1, F3, N3, F7, F14)

> Plan Status: completed
> Last Reviewed: 2026-07-22 (closed)
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-open-audit-*.md` (N1, N3) and `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-multi-audit-*.md` (F3, F7, F14)
> Related: consolidates / supersedes parts of `2026-07-21-1005-2-verification-and-contract-hardening.md` (A2 → F7 lives here) and `2026-07-21-1523-1-non-foreach-subflow-and-test-gaps.md` (F3 / F6 / F14; F6 lives in sibling plan `2026-07-21-1605-2`). N1 (ANSI stripping) and N3 (visits guard) were not covered by any existing remediation plan.
> Mission: mission-driver-draft-robustness
> Audit: required
> Execution Order: 3 of 3
>
> Review Note (2026-07-22): independent review re-read the live repo and found **F3, F7, and F14 ALREADY LANDED** in the baseline (F3 under `mdr-remediate-4 H2` at `engine.js:1117-1128` + test Cases F/G/H; F7 at `package.json:11` chaining `prompt-check.mjs` + `CONTEXT.md:93`; F14 as the deterministic-latch rewrite of Case B under `mdr-remediate-4 H9`). Only **N1** (extraction-site ANSI stripping) and **N3** (`_onAgentStepUpdate` visits guard) remain net-new implementation work. Phases 2 and 3 are retained as the closure vehicle for the already-landed findings (verify-only) so this plan still owns all five findings' closure; they are NOT re-implemented.

## Current Baseline

Live baseline re-verified 2026-07-22 against `tools/mission-driver/` (review pass; supersedes the 2026-07-21 draft baseline, which was stale for F3/F7/F14):

- `src/engine.js:705-712` strips ANSI BEFORE every marker extraction in the general agent-step pipeline; rationale explicitly cites "memory L009 SEV1" — *"Real CLI output is frequently log-colored (`\x1b[31m...\x1b[0m`) and those CSI bytes can sit inside a `<TAG>value</TAG>` capture, defeating the strict / tolerant `[^<]+` matchers (memory L009)."*
- `src/engine.js:82-93` `stripAnsiControl(text)` is exported, idempotent, zero-dependency; covers CSI / OSC / two-char ESC / stray C0 controls; preserves `\t\n\r`. Tested by `test/ansi-and-mixedcase-tag.test.js` (14 tests); Case at `:108` comments *"this is the failure mode `stripAnsiControl` exists to neutralize."* (N1 reuse target.)
- `src/main.js:184-189` `extractBriefGate`, `:160-164` `extractBriefPath`, `:236-272` `parseDraftArtifact` all run regex on raw `resultText` from `runner.realRun` (`src/runner.js:162-172` reads `readFileSync(result.logFile, "utf8").trim()` — raw bytes, no ANSI stripping at the runner layer). Zero `stripAnsiControl` calls across the three extraction sites. Cross-module grep: `stripAnsiControl` has 1 definition + 2 internal call sites in `engine.js`, 0 references in `src/main.js`. (N1.)
- Concrete failure mode: if the brief agent (or any upstream CLI / log formatter) emits ANSI-colored output around the gate marker — e.g. `\x1b[32m<BRIEF_GATE>pass</BRIEF_GATE>\x1b[0m`, or ANSI intermixed with tag characters `<BRIEF\x1b[0m_GATE>pass</BRIEF_GATE>` — the regex fails to match → `gate === null` → backward-compat path runs Stage 2 unconditionally, silently defeating WI2's gate contract. (N1.)
- `src/engine.js:461-473` `_wfAppendSubflowRun(stepName, visits, run)` matches `name + visits + status === "running"`; has THREE call sites now — `:1036` and `:1067` inside the `if (stepDef.forEach)` branch, and `:1124` in the non-forEach branch (added by `mdr-remediate-4 H2`). `test/subflow-incremental.test.js` Case F (grep anchor, `>= 4` occurrences) pins the call-site count.
- **F3 — ALREADY LANDED (verify-only).** `src/engine.js:1117-1128` non-forEach subflow branch now calls `_wfAppendSubflowRun(stepName, visit, { forEachIndex: 0, forEachItem: null, file: null, status: "running" })` at `:1124` BEFORE awaiting `_runChildSubflow` at `:1125`, per the `mdr-remediate-4 H2` comment block at `:1117-1123`. The pre-existing concrete failure mode (a `DEEP_AUDIT` run SIGKILLed mid-subflow leaving the main `run-state.json` placeholder at `subflowRuns: []`) is mitigated: the on-disk placeholder now reflects `"running"` mid-child, and `_wfClose` replaces it with the terminal record on completion. Pinned by `test/subflow-incremental.test.js` Case G (pre-run running placeholder + end-state replacement via deterministic Promise latch) and Case H (no-op safety for the non-forEach record shape).
- `src/engine.js:438-450` `_onAgentStepUpdate({ stepName, logFile, promptFile, sessionId })` matches `name + status === "running"` (no `visits` match). WI5 added the `visits` guard to `_wfAppendSubflowRun` one screen below but did not retrofit the existing method. `test/subflow-incremental.test.js:204-300` Case C pins the visits guard for `_wfAppendSubflowRun` specifically; no equivalent test pins `_onAgentStepUpdate` against re-entry. Production flows today have no self-looping agent step. (N3 — still OPEN.)
- **F7 — ALREADY LANDED (verify-only).** `tools/mission-driver/package.json:11` `"test"` script is now `"node --test test/*.test.js && node src/prompt-check.mjs"` — `pnpm test`/`npm test` chains `lint:prompts`. `tools/mission-driver/CONTEXT.md:93` already documents this ("同时跑 prompt-check.mjs 结构性校验，任一失败即整体失败"). No script change or CONTEXT.md edit remains.
- **F14 — ALREADY LANDED (verify-only).** `test/subflow-incremental.test.js:119-202` Case B has been rewritten (under `mdr-remediate-4 H9`) with a deterministic Promise-park latch (`park0`/`park1` + a single `Promise.resolve()` microtask yield for item 2); no `setTimeout`-based waits remain in Case B. The `delay(ms)` helper at `:29` still exists but is used only by Case D (resolve-order final-coverage), not Case B.
- Existing remediation plan `2026-07-21-1523-1-non-foreach-subflow-and-test-gaps.md` was recorded here as "active but NOT implemented"; review against live code shows its F3 and F14 portions DID land under `mdr-remediate-4` (H2/H9) with tests Cases F/G/H and the Case B latch. Its F6 portion lives in sibling plan `2026-07-21-1605-2`. N1 (ANSI stripping) + N3 (visits guard) remain uncovered by any other plan and are this plan's only net-new implementation work.

Gap: Five findings (N1, F3, N3, F7, F14) share one closure surface (extraction-site ANSI stripping, symmetric subflow/agent invariants, and a deterministic chained verification pipeline). Review against live code established that F3, F7, and F14 already landed under `mdr-remediate-4`; the remaining net-new work is N1 (extraction sites adopt `stripAnsiControl`) and N3 (retrofit or document the `_onAgentStepUpdate` visits guard). This plan still owns closure for all five: N1 + N3 are implemented, F3 + F7 + F14 are verified already-landed.

## Goals

- Extraction sites (`extractBriefGate`, `extractBriefPath`, `parseDraftArtifact`) call `stripAnsiControl` before regex match; ANSI-wrapped marker regression covered by tests. (N1 — net-new.)
- `_onAgentStepUpdate` either retrofits the `visits` guard OR documents the assumption explicitly (Decision). (N3 — net-new.)
- F3 / F7 / F14 verified already-landed against live code (non-forEach `_wfAppendSubflowRun` + Cases F/G/H; `package.json` chains `prompt-check.mjs` + `CONTEXT.md` citation; Case B deterministic latch) and recorded as such in closure — NOT re-implemented.
- All existing tests still pass; new N1/N3 tests added (count delta recorded at closure).

## Non-Goals

- Do not move `stripAnsiControl` to a separate `src/ansi.mjs` module (N1 structural Option B from audit); the call-site fix is sufficient and minimal. (Reopens per AGENTS.md Rule 15 if a third caller fails to adopt.)
- Do not change `runner.js` to pre-clean `result.text` (N1 Option C); preserve the engine layer's strip-at-extraction discipline.
- Do not refactor `_onAgentStepUpdate` and `_wfAppendSubflowRun` into a shared `_findRunningStep` helper (N3 structural Option B); only retrofit the guard or document the assumption.
- Do not change the WI5 design contract; the existing `_wfAppendSubflowRun` mechanism (already extended to the non-forEach branch under F3) is touched only for N3, and only within `_onAgentStepUpdate`.
- Do not touch design docs (Plan 1) or draft pipeline (Plan 2).

## Task Route

- Type: `implementation-only change` (extraction call-site hardening + engine invariant retrofit + verification pipeline guards; no API / data / auth / integration / deployment contract change — all changes are internal robustness).
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §4.5 (WI5 subflow persistence — non-forEach extension already landed; this plan only verifies), `tools/mission-driver/CONTEXT.md:93,118` (test-command citation at :93 already correct per F7; WI5 wording at :118 already reflects the non-forEach extension — verify-only, no edit expected), `docs/logs/2026/` (memory L009 reference). Code: `src/main.js` (N1 import + 3 call sites), `src/engine.js` (N3 `_onAgentStepUpdate`, if Option A), `test/brief-gate.test.js` (N1-A/B), `test/draft-path-consistency.test.js` (N1-C), `test/subflow-incremental.test.js` (N3 Case D if Option A; F3 Cases F/G/H + F14 Case B verified already present).
- Skill Selection Basis: `Skill: none` — internal-hardening fixes following existing patterns (`stripAnsiControl` discipline from engine layer; `_wfAppendSubflowRun` mechanism from WI5).

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.

## Execution Plan

### Phase 1 - Adopt stripAnsiControl at extraction call sites (N1)

Status: completed
Targets: `tools/mission-driver/src/main.js:160-164,184-189,236-272`, `tools/mission-driver/test/brief-gate.test.js`, `tools/mission-driver/test/draft-path-consistency.test.js`
Skill: none

- Item Types: `Fix | Add | Proof` (uniform — all items carry all three types)
- Prereqs: none

- [x] **N1 (Fix)** Import `stripAnsiControl` from `./engine.js` into `main.js` (one new import line; `engine.js` is already imported). In `extractBriefGate` (`:184-189`), `extractBriefPath` (`:160-164`), and `parseDraftArtifact` (`:236-272`), call `const clean = stripAnsiControl(resultText);` BEFORE the regex match; replace `resultText.match(...)` with `clean.match(...)`. Three call sites fixed. No new dependency (engine's `stripAnsiControl` is zero-dependency and idempotent).
      - Skill: none
- [x] **N1 (Add)** Add one regression test per call site that fakes an ANSI-wrapped marker:
  - Test N1-A in `brief-gate.test.js`: `extractBriefGate("\x1b[32m<BRIEF_GATE>pass</BRIEF_GATE>\x1b[0m\x1b[31m<BRIEF_GATE_REASON>blocked reason</BRIEF_GATE_REASON>\x1b[0m")` → `{gate: "pass", reason: "blocked reason"}`.
  - Test N1-B in `brief-gate.test.js`: ANSI intermixed INSIDE tag characters `<BRIEF\x1b[0m_GATE>pass</BRIEF_GATE>` → still matches (cross-reference `test/ansi-and-mixedcase-tag.test.js:108` comment for the failure mode).
  - Test N1-C in `draft-path-consistency.test.js`: `parseDraftArtifact` with ANSI-wrapped `<MISSION_FILE>` marker → still resolves `missionName` / `roadmapPath` / `targetFile`.
      - Skill: none
- [x] **N1 (Proof)** Run: `pnpm --prefix tools/mission-driver test` (already chains `prompt-check.mjs` per the landed F7 — no separate `lint:prompts` step needed).
      - Skill: none

Exit Criteria:

- [x] All three extraction call sites call `stripAnsiControl` before regex.
- [x] Three ANSI-wrapped marker tests pass (N1-A, N1-B, N1-C).
- [x] All existing tests still pass.
- [x] `docs/logs/` updated.

### Phase 2 - Agent invariant (N3) + F3 verify-already-landed

Status: completed
Targets: `tools/mission-driver/src/engine.js:438-450` (N3), `tools/mission-driver/src/engine.js:1117-1128` + `tools/mission-driver/test/subflow-incremental.test.js` (F3 verify)
Skill: none

- Item Types: `Decision | Fix | Add | Proof`
- Prereqs: none (parallel-safe with Phase 1)

- [x] **F3 (Proof — verify already-landed)** Confirm `src/engine.js:1124` calls `_wfAppendSubflowRun(stepName, visit, { forEachIndex: 0, forEachItem: null, file: null, status: "running" })` before `await this._runChildSubflow(...)` at `:1125` (per the `mdr-remediate-4 H2` comment block at `:1117-1123`). Confirm `test/subflow-incremental.test.js` Cases F (`>= 4` grep anchor), G (pre-run running placeholder + end-state replacement via deterministic Promise latch), and H (no-op safety for the non-forEach record shape) are present and green. No code or test change.
      - Skill: none
- [x] **Decision (N3)**: Choose how to resolve the visits-guard asymmetry between `_onAgentStepUpdate` and `_wfAppendSubflowRun`.
  - **Chosen: Option B (doc-only).** Comment added to `_onAgentStepUpdate` at `src/engine.js:438` documenting (a) the `name + status === "running"`-only match, (b) WHY it is safe — the run loop is strictly sequential, `_wfOpen` (`:332`) closes the prior `_wfCurrent` before pushing the next "running" entry, so at most ONE step record is ever "running" at a time and the match always uniquely resolves (mirrored by `_wfClose` at `:400` which also matches `name+visits+status`); (c) `_wfAppendSubflowRun` keeps the visits guard because forEach re-entry + the H2 pre-run placeholder sit closer to its failure surface; (d) retrofit path from `_wfAppendSubflowRun` if a future flow ever allows re-entrant / concurrent agent steps.
  - **Option A rejected because**: under the sequential lifecycle the visits guard is structurally redundant for `_onAgentStepUpdate` — no real-flow test can reproduce the bug (an agent step is always closed via `_wfClose` before its re-entry opens), so a guard plus an untestable-by-real-flow Case D would be over-engineering against AGENTS.md ("Prefer small complete slices over broad placeholder coverage"). Option B records the accurate assumption (lifecycle uniqueness guarantee) rather than pretending to fix a bug the architecture prevents.
  - **Option A (smallest code)**: Add a `visits` parameter to `_onAgentStepUpdate`; caller at `main.js:752` (or wherever the engine step-update event is wired) passes `engine._currentVisits(stepName)` (or equivalent); mirror the `name + visits + status === "running"` triple match.
  - **Option B (doc-only)**: Add a comment to `_onAgentStepUpdate` at `src/engine.js:438` explicitly noting "no visits guard — assumes non-re-entrant agent steps; if a future flow self-loops an agent step, retrofit the guard from `_wfAppendSubflowRun`".
  - **Alternatives considered**: Option A eliminates the invariant asymmetry; cost is one method change + one call-site change, plus a new Case D-style test pinning re-entry. Option B is lowest-cost and surfaces the assumption; cost is the residual latent bug for future re-entrant flows. The structural Option (shared `_findRunningStep` helper) is out per Non-Goals.
  - **Residual risk (Option A)**: behavioral risk if the visits lookup reads a stale value during a transition window; mitigated by re-using the same lookup `_wfAppendSubflowRun` already uses.
  - **Residual risk (Option B)**: future flow author adds a self-looping agent step and trips the race; mitigated by the doc comment + this audit's recurrence trail.
      - Skill: none
- [x] **N3 (Fix | Add)** Apply the chosen option. If Option A: change `_onAgentStepUpdate` signature + add re-entry Case D test that exercises a self-looping agent step with delayed `_wfClose` on visit 1 and asserts visit 2's metadata does not land in visit 1's placeholder. If Option B: add the comment only.
      - Skill: none — **Option B applied**: comment added at `engine.js:438` (no code/test change).
- [x] **F3 + N3 (Proof)** Run: `pnpm --prefix tools/mission-driver test`
      - Skill: none

Exit Criteria:

- [x] F3 verified already-landed: non-forEach branch calls `_wfAppendSubflowRun` before the child awaits (`:1124`); Cases F/G/H present and green.
- [x] N3 Decision recorded with rationale; chosen option applied (Option A: re-entry Case D green; Option B: comment present at `src/engine.js:438`).
- [x] All existing tests still pass.
- [x] `docs/logs/` updated.

### Phase 3 - Verification pipeline verify-already-landed (F7 + F14)

Status: completed
Targets: `tools/mission-driver/package.json:11`, `tools/mission-driver/test/subflow-incremental.test.js:119-202`, `tools/mission-driver/CONTEXT.md:93`
Skill: none

- Item Types: `Proof` (uniform — both findings already landed)
- Prereqs: none

- [x] **F7 (Proof — verify already-landed)** Confirm `tools/mission-driver/package.json:11` `"test"` is `"node --test test/*.test.js && node src/prompt-check.mjs"` (chains `lint:prompts`) and `CONTEXT.md:93` documents it. No script or doc change.
      - Skill: none — confirmed: `package.json:11` chains `prompt-check.mjs`; `CONTEXT.md` "构建与验证" section documents "同时跑 prompt-check.mjs 结构性校验，任一失败即整体失败"; `pnpm test` output shows both `527 pass` + `prompt-check: OK`.
- [x] **F14 (Proof — verify already-landed)** Confirm `test/subflow-incremental.test.js:119-202` Case B uses the deterministic Promise-park latch (`park0`/`park1` + one `Promise.resolve()` microtask yield; comment cites `mdr-remediate-4 H9`) and contains no `setTimeout`-based waits. The shared `delay()` helper may still exist for Case D. No test change.
      - Skill: none — confirmed: Case B (`:119-202`) uses `park0`/`park1` + `await Promise.resolve()` microtask yield, cites `mdr-remediate-4 H9`; no `setTimeout` in Case B; `delay()` helper at `:29` used only by Case D (`:317-318`).
- [x] **F7 + F14 (Proof)** Run: `pnpm --prefix tools/mission-driver test` (chains `lint:prompts`); confirm the run executes both the test suite and `prompt-check.mjs`.
      - Skill: none — confirmed: single `pnpm test` run executed both (527 pass + `prompt-check: OK`).

Exit Criteria:

- [x] F7 verified already-landed: `package.json:11` chains `prompt-check.mjs`; `CONTEXT.md:93` citation matches.
- [x] F14 verified already-landed: Case B is latch-based; no `setTimeout` waits in Case B.
- [x] All existing tests still pass.
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1 (2026-07-22): **needs revision → revised in place → acceptable for execution**. Review against live repo (`tools/mission-driver/`) found the 2026-07-21 draft baseline was stale for 3 of 5 findings: F3 already landed (`engine.js:1117-1128`, `mdr-remediate-4 H2`, pinned by Cases F/G/H), F7 already landed (`package.json:11` chains `prompt-check.mjs`, `CONTEXT.md:93`), F14 already landed (Case B rewritten with deterministic latch, `mdr-remediate-4 H9`). Only N1 (main.js has 0 `stripAnsiControl` references) and N3 (`engine.js:442` still `name+status` only) remain net-new. Baseline, Goals, Task Route, Phase 1 Proof note, Phase 2 (F3 → verify-only + N3 retained), Phase 3 (F7+F14 → verify-only), and Closure Gates rewritten to match live code (plan-guide Minimum Rule 1 / Anti-Slacking satisfied: every finding lands in exactly one state — N1/N3 implement, F3/F7/F14 verify-already-landed).

## Closure Gates

- [x] in-scope behavior is complete (N1 + N3 implemented; F3 + F7 + F14 verified already-landed)
- [x] relevant docs aligned (verify `CONTEXT.md:93` test-command citation and `:118` non-forEach WI5 wording already match the landed code — no edit expected; if N3 Option A changes `_onAgentStepUpdate` behavior, note it in the log) — verified: CONTEXT.md test-command citation + WI5 non-forEach wording already match; N3 chose Option B (doc-only comment at `engine.js:438`, no behavior change), recorded in log
- [x] verification: `pnpm --prefix tools/mission-driver test` green (includes `lint:prompts` per landed F7); test count delta recorded — 527 pass / 0 fail (baseline 524 + 3 N1 tests)
- [x] no in-scope item downgraded to deferred/follow-up (N3 Decision may choose doc-only Option B; F3/F7/F14 are verified-already-landed — both are adjudicated and recorded, not silent downgrades) — N3 Option B adjudicated with rationale; F3/F7/F14 verified-already-landed with evidence
- [x] independent draft review completed and recorded — Draft Review Record iteration 1 (2026-07-22) acceptable for execution
- [x] text consistency verified: Plan Status, phase statuses, exit criteria, gates, and log all agree — Plan Status: completed; all 3 Phases Status: completed with all items `[x]`; log entry at `docs/logs/2026/07-22.md`
- [x] closure audit was independent — solo cold-replay pass (no second reviewer available; non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback; source audit severity N1/N3 LOW)
- [x] closure evidence exists in files — `src/main.js` (N1 import + 3 call sites), `src/engine.js:438` (N3 Option B comment), `test/brief-gate.test.js` (N1-A/B), `test/draft-path-consistency.test.js` (N1-C), `docs/logs/2026/07-22.md`

## Deferred But Adjudicated

### N1 structural — move stripAnsiControl to src/ansi.mjs

- Classification: `optimization candidate`
- Why Not Blocking Closure: The call-site fix (Phase 1) closes the user-visible failure mode. The structural move reduces friction for future callers but is not required for closure.
- Successor Required: no (reopens if a third caller outside `engine.js` and `main.js` fails to adopt `stripAnsiControl`, per AGENTS.md Rule 15)

### N3 structural — shared `_findRunningStep` helper

- Classification: `optimization candidate`
- Why Not Blocking Closure: Option A (retrofit guard) or Option B (doc-only) closes the invariant gap. The shared-helper refactor is durable but not required.
- Successor Required: no (reopens if a third method needs the same `name + visits + status` match)

### N1 Option C — runner pre-cleans `result.text`

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: Engine's strip-at-extraction discipline is the project's documented choice (memory L009); reconsidering it is a larger refactor than this mission's scope.
- Successor Required: no (reopens if a fourth extraction caller forgets to strip)

## Closure

Status Note: Closed 2026-07-22. All 3 Phases completed; N1 implemented (3 extraction call sites + 3 regression tests), N3 adjudicated Option B (doc-only comment at `src/engine.js:438` with rationale), F3/F7/F14 verified already-landed against live code. Full verification green (527 pass / 0 fail + prompt-check OK + web typecheck/build clean).

Closure Audit Evidence:

- Auditor / Agent: opencode solo cold-replay pass (no second reviewer available; non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback; source audit severity N1/N3 LOW)
- Evidence:
  - N1: `src/main.js` import `stripAnsiControl` from `./engine.js` + `const clean = stripAnsiControl(resultText)` before regex in `extractBriefPath` / `extractBriefGate` / `parseDraftArtifact`; `test/brief-gate.test.js` N1-A/N1-B + `test/draft-path-consistency.test.js` N1-C all green.
  - N3 Option B: documenting comment at `src/engine.js:438` `_onAgentStepUpdate` (records the lifecycle-uniqueness guarantee + retrofit path); rationale recorded in Phase 2 Decision + `docs/logs/2026/07-22.md`.
  - F3 verify: `src/engine.js:1124` calls `_wfAppendSubflowRun` before `await this._runChildSubflow` (`:1125`); Cases F/G/H present and green.
  - F7 verify: `package.json:11` `"test"` chains `prompt-check.mjs`; `CONTEXT.md` documents it; `pnpm test` output shows both suite + prompt-check.
  - F14 verify: `subflow-incremental.test.js:119-202` Case B uses deterministic Promise-park latch (no setTimeout); cites `mdr-remediate-4 H9`.
  - Verification: `pnpm --prefix tools/mission-driver test` → 527 pass / 0 fail + `prompt-check: OK`; `pnpm --prefix tools/mission-driver/web run typecheck` clean; `pnpm --prefix tools/mission-driver/web run build` success; `pnpm --prefix tools/mission-driver run lint:prompts` OK. test-count delta +3.
  - Roadmap / backlog: no `> Work Item:` label (audit-sourced plan; WI1-WI5 already `done`); no ❌/✅ marker to flip in `docs/backlog/mission-driver-draft-robustness-roadmap.md` — this plan is post-WI audit cleanup, not a roadmap work item.
  - Source audits: no `> Source Audits:` line in front matter (uses `> Source:`); step omitted per instructions.

Follow-up:

- None expected.
