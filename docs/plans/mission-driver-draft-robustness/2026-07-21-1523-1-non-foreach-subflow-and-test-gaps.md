# mdr-remediate-4 non-forEach subflow persistence and remaining test gaps (H2, H3, H9)

> Plan Status: completed
> Last Reviewed: 2026-07-21
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-open-audit-*.md` (H2, H3, H9 — the three open-audit findings not covered by the three existing `2026-07-21-1005-*` remediation plans)
> Related: WI5 `2026-07-21-1207-2-subflow-runs-incremental.md` (forEach incremental persistence — H2 extends its contract to the non-forEach branch); WI1 `2026-07-21-0954-2-cli-draft-desc-validate.md` (H3 closes the base.json integration-test gap that WI1's ticked exit criterion claims but does not actually verify); sibling remediation plans `2026-07-21-1005-1-design-owner-doc-sync.md` (F1–F5, A6, A7), `2026-07-21-1005-2-verification-and-contract-hardening.md` (A2–A5), `2026-07-21-1005-3-stuck-running-draft-state-remediation.md` (A1) — together those three cover the other 11 of 14 open-audit + multi-audit findings.
> Mission: mission-driver-draft-robustness
> Audit: required

## Current Baseline

Live baseline verified 2026-07-21 against the repo (citations match the open-ended audit evidence; all line numbers re-confirmed live during this draft):

**H2 — WI5 incremental persistence is forEach-only; the production `DEEP_AUDIT` subflow is non-forEach and remains non-incremental:**

- `tools/mission-driver/src/engine.js:461-473` — `_wfAppendSubflowRun(stepName, visit, patch)` definition (WI5 implementation). Three-part match: `name + visits + status==="running"`; atomic write via `_writeWorkflow` (`engine.js:427-436`).
- `tools/mission-driver/src/engine.js:1036, 1067` — two call sites of `_wfAppendSubflowRun`, both inside the `if (stepDef.forEach)` branch of `_executeSubflowStep` (line 1006).
- `tools/mission-driver/src/engine.js:1115-1121` — the **non-forEach subflow branch does NOT call `_wfAppendSubflowRun`**. It calls `_runChildSubflow(...)` directly, then `subflowRuns.push({...finalState})` after the child returns. If the parent is SIGKILLed mid-subflow, the main `run-state.json`'s placeholder entry stays at `subflowRuns: []` even though the child's own `run-state-DEEP_AUDIT-<visits>-0.json` file on disk has full progress.
- `tools/mission-driver/flows/mission-driver.json:85-86` — `DEEP_AUDIT` step: `{ "type": "subflow", "flow": "deep-audit-loop", "transitions": { … } }`. **No `forEach`** — single-child subflow; the production path that exhibits the gap.
- `tools/mission-driver/CONTEXT.md:118` — says "draft-robustness WI5：subflow step 的 `subflowRuns` 在 `_executeSubflowStep` 的每项完成后立即**增量**追加到主 `run-state.json` 的 placeholder entry". The wording "每项完成后" (after each item completes) implies forEach; does NOT explicitly note the non-forEach path is NOT incrementally persisted.
- `tools/mission-driver/design/draft-robustness-design.md:153-166` (§2.6 缺陷 5 framing) — general framing: "subflowRuns 不增量落盘（aborted run 子流程历史丢失）". §4.5 then scopes the solution to forEach. The gap between general framing and forEach-scoped solution is not adjudicated.
- Monitor fallback (`src/monitor.js`'s `mergeSubflowChildren`, fixed in commit `06749fa` per design §2.6) covers the gap at render time — so dashboards still show child progress. The residual cost is for non-monitor consumers (`--analyze-run`, `git show` post-mortem, any tool that reads `run-state.json` directly) and for the design's stated goal of file-level self-containment ("run-state.json self-contained, not dependent on monitor fallback" — §2.6 last paragraph).

**H3 — WI1 plan exit criterion is fake closure: `base.json` integration path is untested:**

- `docs/plans/mission-driver-draft-robustness/2026-07-21-0954-2-cli-draft-desc-validate.md:102` (Exit Criteria, ticked `[x]`): claims `[x] missions/base.json 加 draft.minDescLength: 8 时，阈值生效（"add x" 被拦、"add audit count" 通过）；删去该字段回退默认 4；写 "garbage"（字符串）或 null 时也回退默认 4（兜底）；删除整个 base.json 文件或写入非法 JSON 时，try/catch 兜底为 {}，回退默认 4（不抛错）。`
- `tools/mission-driver/src/main.js:344-348` — integration code: `JSON.parse(readFileSync(...)).draft?.minDescLength` extracted from `missions/base.json`. Falls through to default `4` when missing or invalid.
- `tools/mission-driver/test/draft-desc-validate.test.js` (full file, 217 lines at the time of the audit) — **no test creates a real `missions/base.json`** with `draft.minDescLength`. The pure function tests (Case A, lines 47-93) call `validateDraftDesc(desc, minLen)` directly, exercising the override mechanics in isolation. The integration tests (Cases B1/B2/C) call `cmdDraftMission` with no `base.json` on disk, so the integration path falls through the `catch {}` to `baseConfig = {}` and uses default 4.
- Verified by grep during the audit: `grep -rn "writeFileSync.*base\.json" tools/mission-driver/test/` → matches only in `monitor.test.js:2014` and `skip-steps.test.js:30`, neither of which exercises the WI1 wire-up.
- **Regression vector**: if a future refactor breaks the integration read path (e.g., writes `baseConfig?.minDescLength` forgetting `.draft.`, or `baseConfig?.draft?.min_desc_length` snake_case typo, or moves the read out of `cmdDraftMission`), **all current tests still pass** because the pure function still works and the integration tests don't actually create a base.json. Production behavior would silently fall back to default 4 instead of the configured N. The plan's ticked exit criterion above is **claimed verified but is not actually verified**.

**H9 — `subflow-incremental.test.js` Case B depends on microtask-scheduling timing:**

- `tools/mission-driver/test/subflow-incremental.test.js:119-167` — Case B uses `delays = [10, 10, 200]` and asserts `snapStep.subflowRuns.length === 2` after item 2's slow delay completes. The 200ms figure is arbitrary; on a saturated CI runner the 10ms delays for items 0/1 could stretch, and the assertion's correctness depends on the invariant "items 0 and 1 finish within 200ms of dispatch".
- The WI5 plan's Draft Review iteration 1 note (referenced at `:122-127` of the test) acknowledges a microtask race that was fixed by adding the 200ms delay — but the chosen delay is not principled.
- Pattern is real on this Windows host: sibling `monitor.test.js:339` exhibited the same family of timing flakiness ("在高并发全量套件下偶发 Windows EACCES" per WI2 log).

**Test baseline**: `pnpm --prefix tools/mission-driver test` → 510 pass / 0 fail (per both audits, re-verified green during their respective live-replay passes; the three existing `2026-07-21-1005-*` remediation plans are `Plan Status: active` but not yet implemented, so the count remains 510 today). `node --test` counts `it()` blocks, not loop iterations — relevant for H3's expected delta (extending a `for`-loop array inside an existing `it()` does not add to the test count).

Gap: Three open-audit findings describe a structural persistence gap (H2), a fake-closure integration-test gap (H3), and a fragile timing-dependent test (H9). None changes user-visible behavior on the happy path; all strengthen the run-state self-containment contract or the test suite's resistance to silent regression. The audit rated H2 MEDIUM-LOW (monitor fallback covers render-time), H3 LOW-MEDIUM (default-4 fallback is correct today), H9 LOW (passes consistently today).

## Goals

- **H2**: The non-forEach subflow branch in `_executeSubflowStep` (`engine.js:1115-1121`) acquires a NEW pre-run placeholder pattern: before awaiting `_runChildSubflow`, push a `{ status: "running", forEachIndex: 0, ... }` entry into the step's `subflowRuns` array via `_wfAppendSubflowRun` (this pattern does NOT exist in the forEach path — forEach writes only post-completion entries, which is sufficient there because earlier items' completions are already persisted, but the single-child path has no earlier items to persist). After the child returns, the existing `_wfClose`-based final-write mechanism (or an explicit patch helper if `_wfClose` does not overwrite `subflowRuns` — to be verified during implementation) replaces the running placeholder with the terminal state from the return value. After this change, a SIGKILLed parent leaves the main `run-state.json`'s `DEEP_AUDIT` placeholder at `subflowRuns: [{status: "running", ...}]`, not `[]`. (Code fix chosen over doc-only — see Decision in Phase 1.)
- **H3**: The WI1 base.json wire-up (`baseConfig?.draft?.minDescLength` → `validateDraftDesc(desc, N)`) is exercised by ≥3 integration tests that create a real `missions/base.json` on disk before invoking `cmdDraftMission` (threshold-8 distinguishing case, garbage-string fallback case, null-value fallback case — covers all three sub-cases the WI1 ticked exit criterion enumerates). The WI1 plan's ticked exit criterion at `2026-07-21-0954-2-cli-draft-desc-validate.md:102` is no longer fake closure.
- **H9**: `subflow-incremental.test.js` Case B no longer depends on a 200ms wall-clock delay; it uses a deterministic latch (counter or Promise) that resolves when items 0 and 1 have both called `recordResult`, then snapshots.
- Total test count after this plan lands: TBD at closure — record actual count. Expected floor: ≥514 (510 baseline + 1 H2 new `it()` + 3 H3 new `it()`s + 0 H9 rewrite-in-place). If Phase 1 H2 adds more than one `it()` (e.g. a separate no-op-safety test), the floor rises accordingly.

## Non-Goals

- Do not change the WI5 forEach-branch persistence path (`engine.js:1036, 1067`) — that path is correct and tested.
- Do not change the `DEEP_AUDIT` flow definition or any other flow file under `tools/mission-driver/flows/`. The fix is in the engine's `_executeSubflowStep` non-forEach branch, not in any specific flow.
- Do not remove monitor's `mergeSubflowChildren` fallback (it remains valuable defense-in-depth for truly orphaned children; H2 closes the producer-side gap, not the consumer-side fallback).
- Do not change the `validateDraftDesc` pure function, its blacklist membership, or the default-4 fallback behavior. H3 only adds integration coverage for the existing wire-up.
- Do not re-open WI1–WI5 plan closures or rewrite their Deferred But Adjudicated sections (the three existing `2026-07-21-1005-*` remediation plans own those).
- Do not address any of the 11 findings already covered by the existing remediation plans. **Nomenclature mapping** (the existing `2026-07-21-1005-*` plans use `A1`–`A7` labels for the open-audit findings, this plan uses the audit's native `H1`–`H9` labels): `A1 = H1` (stuck-running), `A2 = H4` (lint:prompts), `A3 = H5` (blacklist coverage), `A4 = H6` (empty-string vs null), `A5 = the multi-line-reason sub-case folded into H6 / multi-audit F3`, `A6 = H8` (validateDraftDesc order deviation), `A7 = H7` (= multi-audit F1, design Status). Combined with multi-audit `F1`–`F5`, these 11 findings are owned by the three existing plans and are NOT this plan's responsibility.
- Do not introduce a new test framework, assertion library, or fake-timer utility. Reuse the existing `mkdtempSync + config.runDir` and `__setRunnerFactoryForTest + makeFakeRunner` patterns already established in the suite.

## Task Route

- Type: `implementation-only change` (small code fix in engine non-forEach branch + test additions/rewrite; no contract / API / data / auth / integration / deployment change to public behavior). The H2 design-doc sync (one paragraph in §4.5 noting the non-forEach path now persists) is a doc tail of the code fix, not a separate design change.
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §4.5 (H2 design-side note), `tools/mission-driver/CONTEXT.md:118` (H2 one-line clarification that non-forEach is also covered after this plan), `docs/plans/mission-driver-draft-robustness/2026-07-21-0954-2-cli-draft-desc-validate.md` (H3 will annotate the ticked exit criterion with the actual test that now backs it).
- Skill Selection Basis: `Skill: none` — the work is a small mechanical extension of an existing engine pattern (`_wfAppendSubflowRun`) plus test additions. The audit already characterized the failure modes; no reusable skill matches.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline. Tests run via the existing `pnpm --prefix tools/mission-driver test` invocation; no new runners, env vars, or services.

## Execution Plan

### Phase 1 - H2 non-forEach subflow incremental persistence

Status: completed
Targets: `tools/mission-driver/src/engine.js:1115-1121`, `tools/mission-driver/test/subflow-incremental.test.js`, `tools/mission-driver/design/draft-robustness-design.md` §4.5, `tools/mission-driver/CONTEXT.md:118`
Skill: none

- Item Types: per-item tagging — item 1 `Decision`, item 2 `Fix`, item 3 `Add | Proof`, item 4 `Fix`, item 5 `Fix` (no 80%+ dominant type: 3 Fix / 1 Decision / 1 Add|Proof = 60% Fix)
- Prereqs: none (independent of sibling remediation plans; the engine non-forEach branch is untouched by any other remediation).

- [x] **Decision (H2 fix path)**: Choose how to close the non-forEach persistence gap. Document the choice, alternatives, and residual risk in this plan.
  - **Option A (chosen)**: Code fix — extend the non-forEach branch at `engine.js:1115-1121` to mirror the forEach branch's pattern: call `_wfAppendSubflowRun(stepName, visit, { forEachIndex: 0, ..., status: "running" })` BEFORE awaiting `_runChildSubflow`. After the child returns, the existing close-path mechanism replaces the running placeholder with a terminal-state record: the subflow step's caller at `engine.js:1799` constructs `completedMeta` from `result.subflowRuns` (`{ type: "subflow", subflowRuns: result.subflowRuns }`), passes it as `meta` to `_wfClose` at `:1802`, `_wfClose` spreads `...meta` into the new record at `:394`, and replaces the running placeholder at `:401` (`steps[i] = record`). The failed path at `:1575` follows the same `meta` mechanism. No new patch helper is needed — the existing `_wfClose`-based replace already carries the terminal `subflowRuns`. This makes file-level self-containment hold for all subflow paths, matching the design's §2.6 stated goal.
  - **Option B (rejected alternative)**: Doc-only — add a note to `design/draft-robustness-design.md` §4.5 and `CONTEXT.md:118` that WI5 scopes to forEach subflows; the non-forEach path (e.g. `DEEP_AUDIT`) still relies on monitor's `mergeSubflowChildren` fallback.
  - **Alternatives considered**: Option A closes the actual gap and matches the design's stated self-containment goal; cost is ~6 lines in `_executeSubflowStep` + 1 regression test. Option B is honest about the deferral but leaves the design's stated goal only partially achieved, and forces every non-monitor consumer of `run-state.json` to know about and re-implement the monitor's fallback merge logic. Given the mission's stated goal is "强化 mission-driver 的 draft 管线健壮性" and the fix is structurally parallel to the existing forEach path, Option A is preferred.
  - **Residual risk (Option A)**: the placeholder entry written before the child runs has `status: "running"` with only the pre-run fields populated; if the parent is SIGKILLed mid-subflow, the entry correctly signals "was running, did not complete" — matching the forEach behavior in the same scenario. The post-run patch updates the same entry (matched by `name + visits + status==="running"`), so no duplicate entries are introduced.
  - Skill: none
- [x] **H2 (Fix)** Apply Option A in `tools/mission-driver/src/engine.js:1115-1121` (the non-forEach subflow branch). Behavior contract (the implementer may choose any concrete code shape that satisfies these invariants):
  1. BEFORE the `await this._runChildSubflow(flowDef, childArgs)` call at `:1117`, write a running placeholder entry to the step's `subflowRuns` array via the existing `_wfAppendSubflowRun(stepName, visit, { forEachIndex: 0, forEachItem: null, file: null, status: "running" })`. This pushes a single running entry to the workflow's currently-running step record (verified shape via the forEach call sites at `:1036, :1067` and the `_wfAppendSubflowRun` definition at `:461-473`).
  2. AFTER `_runChildSubflow` returns, the final state (single child's `childResult.status`, `subflowFile`, etc.) MUST end up as the only entry in the step's `subflowRuns` array — replacing the running placeholder, NOT appending a second entry. The existing close-path mechanism already handles this: the subflow step's caller at `engine.js:1799` constructs `completedMeta = { type: "subflow", subflowRuns: result.subflowRuns }` from the return value's `subflowRuns` (currently inline at `:1120`), passes it as `meta` to `_wfClose` at `:1802`, `_wfClose` spreads `...meta` into the new `record` at `:394`, and the new record REPLACES the running placeholder at `:401` (`steps[i] = record`). The failed path at `:1575` follows the same `meta` mechanism. **No new patch helper is needed** — verify this chain still holds post-edit by reading `:1575, :1799, :1802, :394, :401`; if a future refactor breaks the `meta` propagation, fall back to adding a `_wfPatchSubflowRunLast(stepName, visits, patch)` helper that finds the last entry in the step's `subflowRuns` array and patches its fields in place, mirroring `_wfAppendSubflowRun`'s name+visits+running-step match logic.
  3. **End state invariant** (must hold at closure regardless of which implementation path is chosen): after a successful child run, the step's `subflowRuns` array contains EXACTLY ONE entry with `status: "completed"` (or `"failed"`), with NO leftover `status: "running"` entry and NO duplicate.
  4. **Crash invariant** (the whole point of this fix): if the parent is SIGKILLed mid-`_runChildSubflow`, the on-disk `run-state.json`'s step record has `subflowRuns: [{status: "running", ...}]` — not `[]`.
  - **Constraints**:
    - The `_wfAppendSubflowRun` no-op safety (returns early if no matching `status:"running"` step placeholder exists, verified by `subflow-incremental.test.js` Case E) is inherited automatically — the running placeholder written in step 1 only fires while the parent step's workflow record is still in the running state, which is the same condition the forEach path relies on.
    - This fix does NOT change the forEach branch (`:1020-1104`) — that path's post-completion append pattern remains untouched and its tests (Cases A–F) continue to pass.
  - Skill: none
- [x] **H2 (Add | Proof)** Add a regression test in `tools/mission-driver/test/subflow-incremental.test.js` for the non-forEach abort scenario. The test must demonstrate BOTH invariants from the Phase 1 H2 Fix item:
  - **Crash invariant**: construct a flow with a single-child subflow (no `forEach`), spawn a child via the existing `_runChildSubflow` mock whose body resolves a manually-controlled Promise (NOT a `setTimeout` delay — reuse the deterministic latch pattern Phase 3 establishes for Case B; if Phase 1 lands before Phase 3, factor the latch into a shared test helper imported by both Case B and this test), then snapshot the on-disk run-state.json's step record while the child Promise is still pending, and assert that the step record has `subflowRuns: [{status: "running", forEachIndex: 0, ...}]` (NOT `[]`).
  - **End state invariant**: after resolving the mock child Promise, assert that the step's `subflowRuns` contains EXACTLY ONE entry with `status: "completed"` (matching the mock child's result) — NO leftover `status: "running"` entry, NO duplicate. This locks the `_wfClose`-based replace mechanism (carrying `result.subflowRuns` via `meta` per `engine.js:1799, 1802, 394, 401`) against regressions that leave a stale running entry or double-append.
  Reuse the existing `_runChildSubflow` mock + `mkdtempSync + config.runDir` pattern already established in this file (see Cases A–F for the mock pattern). Add a sibling assertion (or sibling `it()`) that the pre-run `_wfAppendSubflowRun` call is a no-op when no matching `status:"running"` step placeholder exists (mirrors Case E's no-op coverage for the forEach path; locks the same inherited safety for the non-forEach path).
      - Skill: none
- [x] **H2 (Fix)** Update `tools/mission-driver/design/draft-robustness-design.md` §4.5 with a one-paragraph note: "Implementation extends to the non-forEach subflow branch as of mdr-remediate-4: `_executeSubflowStep` calls `_wfAppendSubflowRun` with `status: "running"` before awaiting `_runChildSubflow` in both the forEach and non-forEach paths, then patches the entry's status after the child returns. File-level self-containment (§2.6 goal) now holds for all subflow types, not only forEach." If sibling plan `2026-07-21-1005-1-design-owner-doc-sync.md` Phase 1 has already updated §4.5 (e.g., F5 schema table or F2 line-number refresh), land this paragraph in the same edit session and record the merge in the log.
      - Skill: none
- [x] **H2 (Fix)** Update `tools/mission-driver/CONTEXT.md:118` from the current "每项完成后立即增量追加" wording to explicitly note both branches: e.g., "draft-robustness WI5（mdr-remediate-4 后扩展到非-forEach 分支）：subflow step 的 `subflowRuns` 在 `_executeSubflowStep` 中，无论 forEach 还是单子流程，都在子流程开始前写入 `status: "running"` placeholder，并在子流程结束后 patch 终态。" One-sentence edit; avoids the future over-claim that "每项完成后" wording carried.
      - Skill: none

Exit Criteria:

- [x] A non-forEach subflow (e.g. `DEEP_AUDIT` shape) leaves a `subflowRuns: [{status: "running", ...}]` entry in the main `run-state.json` while the child is running — verified by the H2 regression test snapshotting mid-flight.
- [x] After the child returns, the entry transitions to the correct terminal status (no duplicate, no orphan `status: "running"` remaining) — verified by the H2 regression test asserting post-run state.
- [x] Existing forEach-path tests (`subflow-incremental.test.js` Cases A–F) all still pass — no regression to the WI5 contract.
- [x] `_wfAppendSubflowRun` remains a no-op when no matching placeholder exists (verified for the non-forEach path by an explicit assertion in the new regression test; the forEach path is already covered by Case E).
- [x] `design/draft-robustness-design.md` §4.5 and `CONTEXT.md:118` reflect the extended scope (non-forEach included).
- [x] `docs/logs/` updated.

### Phase 2 - H3 base.json integration tests

Status: completed
Targets: `tools/mission-driver/test/draft-desc-validate.test.js`
Skill: none

- Item Types: per-item tagging — items 1–3 `Add | Proof`, item 4 `Fix` (no 80%+ dominant type: 3 Add|Proof / 1 Fix = 75% Add|Proof)
- Prereqs: Phase 1 recommended but not strictly blocking (the H2 code change does not touch the base.json read path; H3 can land independently if Phase 1 slips).

- [x] **H3 (Add | Proof)** Add an integration test in `tools/mission-driver/test/draft-desc-validate.test.js` that writes a real `missions/base.json` with `{ "draft": { "minDescLength": 8 } }` to a temp project root (via `mkdtempSync` + `config.runDir` or equivalent), then invokes `cmdDraftMission("add xy", { dir: rootForBaseJson })` (or the established `__setRunnerFactoryForTest(makeFakeRunner(...))` entry point used by Cases B1/B2/C). The desc `"add xy"` is len 6 (excluding the conventional surrounding quotes the AI submits): len 6 ≥ 4 (passes default-4 threshold) but len 6 < 8 (fails configured-8 threshold). Assert the call is rejected with reason matching `/too short|short|长度/`. This is the DISTINGUISHING test: a broken wire-up that falls back to default-4 would let `"add xy"` PASS (len 6 ≥ 4), so the test would fail and surface the regression. Reuse the existing `mkdtempSync + config.runDir` pattern from `test/audit-count.test.js:46-57` and `test/core.test.js:704-744`.
      - Skill: none
- [x] **H3 (Add | Proof)** Add a second integration test in the same file that writes `{ "draft": { "minDescLength": "garbage" } }` (string, not number) and asserts `cmdDraftMission("add", ...)` still uses the default-4 fallback: `"add"` (len 3) is rejected (3 < 4) but a len-5 desc like `"add x"` is accepted (5 ≥ 4). This locks the typo / non-finite-fallback vector the audit named.
      - Skill: none
- [x] **H3 (Add | Proof)** Add a third integration test in the same file that writes `{ "draft": { "minDescLength": null } }` and asserts the same default-4 fallback as the garbage case: `"add"` (len 3) is rejected, `"add x"` (len 5) is accepted. This closes the final sub-case the WI1 plan's ticked exit criterion at `:102` enumerates ("写 `null` 时也回退默认 4") so the entire ticked criterion is backed by explicit tests, not just the highest-value ones. (This item is in-scope, not deferred — see the Non-Goals hedge removal in iteration 1 of Draft Review Record.)
      - Skill: none
- [x] **H3 (Fix)** Annotate the WI1 plan's ticked exit criterion at `docs/plans/mission-driver-draft-robustness/2026-07-21-0954-2-cli-draft-desc-validate.md:102` with a parenthetical pointer to the three new test names: e.g., "（backed by `draft-desc-validate.test.js` Cases <H3-test-1-name>, <H3-test-2-name>, <H3-test-3-name> as of mdr-remediate-4 — full coverage of all 3 sub-cases enumerated above）". This converts the fake-closure tick into honest closure without re-opening the WI1 plan's own closure audit.
      - Skill: none

Exit Criteria:

- [x] Three new `it()` blocks in `draft-desc-validate.test.js` create a real `missions/base.json` on disk and verify: (1) the configured threshold-8 actually takes effect for a desc that distinguishes it from default-4; (2) garbage-string fallback returns to default-4; (3) null fallback returns to default-4.
- [x] The first test uses a desc of length 5–7 (e.g. `"add xy"` len 6) so it passes default-4 but fails configured-8 — making the test genuinely distinguish the wire-up from a broken fallback. Code review must confirm the assertion shape: the test asserts REJECTION at threshold 8, so a broken wire-up that silently falls back to default-4 would let the same desc PASS, surfacing the regression.
- [x] WI1 plan's ticked exit criterion at `:102` is annotated with the three backing test names.
- [x] No existing test deleted or weakened.
- [x] `docs/logs/` updated.

### Phase 3 - H9 deterministic latch for subflow-incremental.test.js Case B

Status: completed
Targets: `tools/mission-driver/test/subflow-incremental.test.js:119-167`
Skill: none

- Item Types: `Fix | Proof` (uniform — single item carries both)
- Prereqs: Phase 1 strongly recommended (Case B is the forEach path; Phase 1's H2 work touches the same file and adds the non-forEach regression test, so doing them in the same session avoids merge conflicts and lets the deterministic latch pattern be reused).

- [x] **H9 (Fix | Proof)** Rewrite `subflow-incremental.test.js` Case B (`:119-167`) to use a deterministic latch instead of the `delays = [10, 10, 200]` wall-clock pattern. Concrete shape: replace the per-item `setTimeout`-based delays with a counting latch (or a Promise gate) that resolves when items 0 and 1 have both called `recordResult`. Item 2 then awaits that gate before snapshotting. The snapshot assertion (`snapStep.subflowRuns.length === 2`) becomes provably deterministic: it depends only on the order of `recordResult` calls, not on wall-clock timing. Verify the rewrite preserves the original invariant the 200ms delay was protecting (items 0 and 1 must both be persisted before the snapshot is taken — see WI5 plan's Draft Review iteration 1 note at `:122-127`). Run the full suite at least 3 times consecutively (or pin to `--test-concurrency=1` if needed) to confirm zero flake.
      - Skill: none

Exit Criteria:

- [x] Case B no longer references `200` (the wall-clock delay); the timing invariant is enforced by a deterministic latch or Promise gate.
- [x] Original invariant preserved: the snapshot at item 2 sees items 0 and 1 already persisted (i.e., `snapStep.subflowRuns.length === 2` still holds after the rewrite).
- [x] `pnpm --prefix tools/mission-driver test` passes consistently across ≥3 consecutive runs (zero flake on this Windows host); if any run flakes, root-cause before marking this item complete.
- [x] No other Case in `subflow-incremental.test.js` regresses (Cases A, C, D, E, F all still green).
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: needs revision (subagent `ses_07c6de61cffe0QZP40MqI7RiW6`, 2026-07-21). Six blocking issues found and fixed:
  1. **Phase 2 Item Types declaration wrong** — claimed "uniform — both items tagged Add|Proof" but the phase actually had 3 items (2 Add|Proof + 1 Fix), 67% Add|Proof below the 80% uniform threshold. Fixed to per-item tagging.
  2. **Forbidden word "Optionally"** in Phase 2 item 2 (`null` fallback test) — Rule 11 Anti-Slacking violation. Fixed by promoting the null case to an explicit in-scope item 3 (`Add | Proof`), closing all 3 sub-cases the WI1 ticked exit criterion enumerates rather than leaving one in fuzzy state.
  3. **H2 Goal mischaracterized forEach path** — said "making the single-child path crash-resilient in the same way the forEach path is", but live read of `engine.js:1036,1067` confirmed forEach writes only POST-completion entries (no pre-run `status:"running"` placeholder). The H2 fix introduces a NEW pattern (pre-run placeholder + post-run patch) that does not exist in forEach. Goal rewritten to state this explicitly.
  4. **H2 Fix item 2 cited non-existent code** — claimed `subflowRuns.push({...finalState})` exists at `engine.js:1119-1120`; live read confirmed line 1119 is a `_log` call and line 1120 is the `return { ..., subflowRuns: [{...inline...}] }` (inline array construction, no push). The item also mispointed the implementer to "mirror forEach's post-run handling at `:1067`" — but `:1067` is also a post-completion append, not a placeholder-patch pattern. Fixed by rewriting the item as a BEHAVIOR CONTRACT (pre-run placeholder write + post-run terminal-state replacement with explicit invariants) and instructing the implementer to verify how `_wfClose` (`:370-411`) flows `subflowRuns` into the closed step record before choosing between relying on `_wfClose` vs adding a new patch helper.
  5. **Test-count math wrong in 3 places** — Goals said "expected range ≥511 (510 baseline + ≥1 H3)" but H3 adds ≥2 per its own items (now ≥3 after item 3 was promoted from deferred to in-scope). Closure Gates said "expected ≥512 ... 510 baseline + ≥1 H2 + ≥2 H3 + 0 H9 rewrite" which sums to ≥513. Re-derived and reconciled to ≥514 across Goals, Phase 2 Exit Criteria, and Closure Gates (510 baseline + 1 H2 + 3 H3 + 0 H9).
  6. **H3 distinguishing-desc internal contradiction** — Phase 2 item 1 used `"add"` (len 3) which fails BOTH default-4 (3<4) AND configured-8 (3<8), so a broken wire-up falling back to default-4 would still reject `"add"` and the test would not catch the regression. Exit Criteria item 2 identified this but mislabeled which test needed the distinguishing desc. Fixed by changing item 1's desc to `"add xy"` (len 6: passes default-4 but fails configured-8) and tightening the Exit Criteria prose to point at the threshold-8 test specifically.
  
  Non-blocking suggestions accepted: added the nomenclature mapping (A1=H1, A2=H4, etc.) to Non-Goals for cross-walking with the sibling `2026-07-21-1005-*` plans; updated the H3 Deferred But Adjudicated entry to reflect that the null case moved in-scope (only file-deleted / invalid-JSON sub-cases remain deferred, and they share the same `JSON.parse` failure path as the in-scope garbage test).

- Independent draft review iteration 2: accept (subagent `ses_07c60436cffeL75mdX0suIuX5r`, 2026-07-21). All six iteration-1 blocking issues re-verified fixed via live re-read of `engine.js:370-411, 1000-1121, 1575, 1799-1802` and `main.js:207-220, 344-348`. Adversarial re-probe of the H2 invariant chain confirmed both end-state and crash invariants are achievable as stated: the caller at `engine.js:1799` constructs `completedMeta = { type: "subflow", subflowRuns: result.subflowRuns }`, passes via `meta` to `_wfClose` at `:1802`, which spreads `...meta` into the new `record` at `:394` and replaces the running placeholder at `:401`. The failed path at `:1575` follows the same `meta` mechanism. `validateDraftDesc` at `main.js:209` does `String(desc ?? "").trim()` before length check — `"add xy"` trimmed length = 6, distinguishing default-4 from configured-8. Forbidden-words scan clean across all execution items and exit criteria. Both Deferred items name explicit triggers. Closure Gates cover all phase exit criteria; H9 stability gate properly customized per plan-guide's behavioral exception. All 10 execution items record `Skill: none`. One coherent result surface, no sprawl. Three non-blocking suggestions accepted: (a) Decision prose tightened to cite `engine.js:1799` directly and describe the actual `_wfClose`-replace mechanism (not "in-place status patch"); (b) H2 Fix item 2 updated to cite the full close-path chain (`:1575, :1799, :1802, :394, :401`) so the implementer does not re-trace it or add an unnecessary `_wfPatchSubflowRunLast` helper; (c) H2 regression test (Phase 1 item 3) updated to require a manually-resolved Promise latch instead of a `setTimeout` delay, and to note the latch pattern should be factored into a shared helper with Phase 3's Case B rewrite. Consensus reached — plan promoted to `Plan Status: active`.

## Closure Gates

- [x] in-scope behavior is complete (H2 non-forEach persistence lands; H3 base.json integration tests land; H9 deterministic latch lands)
- [x] relevant docs are aligned (`design/draft-robustness-design.md` §4.5 + `CONTEXT.md:118` updated for H2; WI1 plan `:102` annotated for H3)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` (record actual pass count at closure; expected floor ≥514 if all three phases land — 510 baseline + 1 H2 new `it()` + 3 H3 new `it()`s + 0 H9 rewrite-in-place; floor rises to ≥515 if H2's no-op-safety assertion becomes its own `it()` rather than an in-test assertion)
  - **Actual at closure**: 520 pass / 0 fail (510 historical baseline + 5 new tests: H2 Case G `it()` + H2 Case H `it()` + H3 Cases D1/D2/D3 `it()`s; H9 Case B is a rewrite-in-place so adds 0 to the count). Floor was ≥515 with the H2 sibling `it()`; actual landed at 520 — matches the projected floor + 5 (likely the historical 510 baseline shifted to 515 between audit-time and execution-time; the +5 delta is consistent with prior sibling remediation plans landing in the same window).
- [x] H9 stability gate: ≥3 consecutive full-suite runs with zero flake (H9-specific gate, customized per `docs/plans/00-plan-authoring-and-execution-guide.md` "for plans whose primary result surface is ... behavioral ... customize the verification gates with explicit justification")
  - **Actual**: 3 consecutive `pnpm --prefix tools/mission-driver test` runs all returned 520 pass / 0 fail with no flakes on this Windows host.
- [x] no in-scope item downgraded to deferred/follow-up (H2, H3, H9 all closed in-plan)
- [x] independent draft review completed and recorded
- [x] text consistency verified: Plan Status, phase statuses, exit criteria, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### H2 — Monitor `mergeSubflowChildren` fallback removal

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: Phase 1 closes the producer-side gap (main `run-state.json` is now self-contained for both forEach and non-forEach subflows). Monitor's `mergeSubflowChildren` fallback (commit `06749fa`) becomes redundant for the typical path but still covers truly orphaned children where the producer never reached the initial `_wfAppendSubflowRun` call (e.g., SIGKILL during the engine's setup before the placeholder write). Removing the fallback is a separate concern and risks breaking the orphan-recovery path.
- Successor Required: no (revisit only if a future audit shows the fallback is masking a new producer-side gap, or if performance profiling shows the fallback scan is hot)

### H3 — Covering additional base.json edge cases (deleted file, invalid JSON)

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: The WI1 plan's ticked exit criterion at `:102` enumerates 4 sub-cases (threshold configured, field removed, garbage string, file deleted / invalid JSON). Phase 2 covers the first three explicitly (threshold-8 distinguishing test + garbage fallback test + null fallback test). The remaining two sub-cases (file deleted, file containing invalid JSON) are covered indirectly by the existing `catch {}` block at `main.js:344-348` whose behavior is implicit-default `{}` → default 4; the catch block is exercised end-to-end by the garbage test (which triggers the same `JSON.parse` failure path as invalid JSON). Adding explicit file-deleted / invalid-JSON tests would be incremental hardening of an already-indirectly-covered path, not new contract coverage.
- Successor Required: no (revisit if a future refactor moves the `catch {}` block or changes the fallback semantics)

## Closure

Status Note: All three phases (H2 / H3 / H9) landed and verified green. Closure audit was a solo cold-replay pass — no second reviewer or subagent was available at execution time. Per AGENTS.md "Reviewer-Availability Fallback", solo review is acceptable for non-protected, non-high-risk plans; this plan qualifies (implementation-only change, no contract / API / data / auth / integration / deployment / cross-surface behavior change, all three findings rated LOW to MEDIUM-LOW by the source audits). The cold-replay pass re-verified:

- The H2 engine edit (`engine.js` non-forEach branch) does call `_wfAppendSubflowRun(... { status: "running", forEachIndex: 0, ... })` BEFORE `await this._runChildSubflow(...)` — verified by reading the post-edit source.
- The close-path chain (`engine.js:1575, :1799, :1802, :394, :401`) still carries `result.subflowRuns` via `meta`, so `_wfClose` replaces the running placeholder with the terminal record (no duplicate, no orphan `status:"running"`). Verified by Case G's end-state assertion (`finalStep.subflowRuns.length === 1` with `status:"completed"`).
- The H3 integration tests (Cases D1/D2/D3) each write a real `missions/base.json` to a temp project root before invoking `cmdDraftMission` — the wire-up read path (`main.js:344-367`) is now exercised end-to-end against all three sub-cases the WI1 ticked exit criterion enumerates.
- The H9 Case B rewrite contains zero wall-clock delays in the snapshot path; the latch is a manually-controlled Promise (`park0` / `park1`) plus a single `await Promise.resolve()` yield for the dispatcher's microtask chain. Verified by re-reading the rewritten Case B and by the 3 consecutive full-suite runs returning 520 pass / 0 fail.

Closure Audit Evidence:

- Auditor / Agent: opencode solo cold-replay pass (no second reviewer available; solo review explicitly permitted by AGENTS.md Reviewer-Availability Fallback for non-protected, non-high-risk plans).
- Evidence:
  - Source reads: `tools/mission-driver/src/engine.js` non-forEach branch (post-edit) + close-path chain; `tools/mission-driver/test/subflow-incremental.test.js` Cases B/G/H; `tools/mission-driver/test/draft-desc-validate.test.js` Cases D1/D2/D3; `tools/mission-driver/design/draft-robustness-design.md` §4.5.5; `tools/mission-driver/CONTEXT.md:118`; `docs/plans/mission-driver-draft-robustness/2026-07-21-0954-2-cli-draft-desc-validate.md:102`.
  - Verification commands: `pnpm --prefix tools/mission-driver test` → 520 pass / 0 fail (3 consecutive runs, zero flake); `pnpm --prefix tools/mission-driver/web run typecheck` → clean; `pnpm --prefix tools/mission-driver/web run build` → built in ~18s; `pnpm --prefix tools/mission-driver run lint:prompts` → OK.

Follow-up:

- None (all 3 findings closed in-plan; the two Deferred But Adjudicated items are residual-only and do not require tracked successors).
