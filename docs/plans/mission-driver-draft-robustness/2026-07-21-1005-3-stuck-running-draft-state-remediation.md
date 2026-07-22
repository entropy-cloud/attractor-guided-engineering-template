# mdr-remediate-3 stuck-running draft-state.json failure mode remediation (A1)

> Plan Status: completed
> Last Reviewed: 2026-07-21
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-open-audit-*.md` (A1)
> Related: WI1 `2026-07-21-0954-2-cli-draft-desc-validate.md` (deferred "monitor draft-job UI 在 draft desc 校验失败时的状态机对齐 — Successor Required: yes" was never tracked); sibling remediation plan `2026-07-21-1005-1-design-owner-doc-sync.md` (F5 documents the `draft-state.json` schema this fix relies on).
> Mission: mission-driver-draft-robustness
> Audit: required

## Current Baseline

Live baseline verified 2026-07-21 against the repo (citations match the open-ended audit evidence):

- `tools/mission-driver/src/draft-job.mjs:74-86` — `startDraftJob` writes initial `draft-state.json` with `{status: "running", phase: "brief", desc: <raw>, ...}` BEFORE spawning the child.
- `tools/mission-driver/src/draft-job.mjs:99-104` — spawn uses `stdio: "ignore"`, `detached: true`, `child.unref()`. No parent observes the child's exit code; the child's stderr is discarded.
- `tools/mission-driver/src/main.js:348-355` — WI1 validation reject branch: on `!v.ok`, `console.error("[DRAFT VALIDATION] …")` to stderr, `process.exitCode = 1`, `await runner.close()`, `return`. **No `writeDraftState` call** (by WI1 plan's stated reason "avoid persisting rejected desc" — but `desc` is already in the file from `startDraftJob`).
- `tools/mission-driver/src/main.js:362-372` — `stateFile` (derived from `resolved.runDir`) and `writeDraftState(patch)` closure are declared here. The closure takes ONE argument (`patch`), self-guards via `if (!stateFile) return;`, and **already does a merge**: `JSON.stringify({ ...JSON.parse(readFileSync(stateFile, "utf8")) || {}, ...patch }, null, 2)`. All 7 existing call sites (`:374, :417, :436, :452, :460, :482, :497`) call `writeDraftState({ ...patch })` with no `await` (the closure body uses synchronous `readFileSync`/`writeFileSync`). **Critical for A1 fix**: the closure is declared at `:363` AFTER the reject branch at `:348-355` — referencing it from the reject branch causes a TDZ `ReferenceError`. The fix must move `stateFile` + `writeDraftState` definitions above the `validateDraftDesc` call at `:348`, OR inline the merge at the reject branch. Existing `if (opts.draftJobDir)` guards at `:373, :416, :432, :451, :459, :481, :495` confirm the variable is `opts.draftJobDir` (not a bare `draftJobDir` local).
- `tools/mission-driver/src/run-reconcile.mjs:34,148-156` — `MAIN_FILE = "run-state.json"`; `reconcileStaleRuns` only reconciles dirs whose main file is `run-state.json`. **`draft-state.json` is never reconciled.**
- `tools/mission-driver/src/draft-job.mjs:130-200` — `readDraftJob` / `listDraftJobs` consumer path: `readDraftJob` returns the full `state` object (including any `error` field); `listDraftJobs` (`:194-200`) only reads `status`/`startedAt`/`desc` for the list view. The monitor UI list view will not show the failure reason textually, but `readDraftJob` detail view will — relevant to the UI-rendering follow-up.
- WI1 plan `docs/plans/mission-driver-draft-robustness/2026-07-21-0954-2-cli-draft-desc-validate.md` Deferred But Adjudicated section promises `Successor Required: yes` for "monitor draft-job UI 在 draft desc 校验失败时的状态机对齐". No successor exists in `docs/backlog/`. Roadmap `docs/backlog/mission-driver-draft-robustness-roadmap.md:3` declares the mission complete.

**Concrete failure mode (from audit A1 repro):**
1. Monitor UI submits `draft "d"` → `startDraftJob({desc: "d"})`.
2. `startDraftJob` writes `_tmp/draft-…/draft-state.json` = `{status: "running", phase: "brief", desc: "d", …}` and spawns `node main.js draft d --draft-job-dir <jobDir>` with `stdio: "ignore"`.
3. Child `cmdDraftMission("d", …)` runs `validateDraftDesc("d")` → `{ok: false, reason: "too short"}`.
4. Child writes `[DRAFT VALIDATION] too short` to its stderr — which is `stdio: "ignore"`-discarded by the parent.
5. Child sets `process.exitCode = 1`, calls `runner.close()`, returns. No `writeDraftState` call.
6. `draft-state.json` remains `{status: "running", phase: "brief", desc: "d"}` forever — no reconciler touches it, parent never observed child exit.
7. Monitor UI shows the draft job as `running` indefinitely. User has no visible signal of failure.

Gap: When the monitor UI submits a draft desc that WI1 rejects (too short / placeholder / length), `draft-state.json` is left in `{status: "running"}` forever. The child's stderr (containing the rejection reason) is `stdio: "ignore"`-discarded by the parent. The user sees the draft job as `running` indefinitely with no visible failure signal. `run-reconcile.mjs` does not cover `draft-state.json`, so no cleanup occurs. The deferred successor promised in WI1's plan was never tracked — silent residual.

## Goals

- When WI1 rejects a draft desc in the `--draft-job-dir` path, `draft-state.json` transitions to a terminal state (`failed` / `phase: "rejected"`) with the rejection reason recorded in the `error` field, before the child process exits.
- The WI1 plan's `Successor Required: yes` deferred item has an explicit resolution: closed by this plan's code fix at the state-machine level (UI rendering of the failure remains a separate, smaller follow-up).
- No regression to the WI1 file-pollution goal: no junk `*-brief.md` / `*-roadmap.md` / `*.json` mission artifacts created on rejection.

## Non-Goals

- Do not change `startDraftJob`'s spawn contract (`stdio: "ignore"`, `detached: true`, `child.unref()`). The child's stdout/stderr are intentionally discarded; the failure signal belongs in `draft-state.json`, not in the parent's pipe.
- Do not extend `run-reconcile.mjs` to cover `draft-state.json` (alternative fix path acknowledged in audit A1 but not chosen — see Deferred But Adjudicated). Reconciler is for crashed/abandoned run-state; explicit failure-state writes belong in the producer.
- Do not change monitor draft-job UI rendering of `failed` / `rejected` status. UI display of the `error` field is a separate (smaller) follow-up, tracked in Deferred But Adjudicated.
- Do not change WI2's gate-blocked path (`main.js:448-456`) — that path already writes `status: "blocked"` correctly.
- Do not introduce new `draft-state.json` fields beyond what sibling plan F5 schema documents (`status`, `phase`, `error`, `endedAt` are all already in the producing code at other call sites).

## Task Route

- Type: `bug investigation` (root cause confirmed during audit; the fix is small but the failure mode is user-visible). Implementation changes one code branch + adds regression test coverage.
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §4.1 (WI1 validation contract — to be cross-referenced from this plan's Phase 1 doc update; sibling plan F5 documents the full schema), `tools/mission-driver/design/mission-design.md` §9 (high-level draft flow — sibling plan Phase 2 updates).
- Skill Selection Basis: `Skill: none` — the fix is a small `writeDraftState` call with an existing schema; the failure-mode repro and reconciliation gap are already characterized in the audit. No matching reusable skill.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline. Tests run via the existing `pnpm --prefix tools/mission-driver test` invocation; mock the spawn path with the existing `__setRunnerFactoryForTest` + `makeFakeRunner` pattern.

## Execution Plan

### Phase 1 - Reject-branch state write + regression test

Status: completed
Targets: `tools/mission-driver/src/main.js:348-355`, `tools/mission-driver/test/draft-desc-validate.test.js` (or new `test/draft-job-reject.test.js`), `tools/mission-driver/design/draft-robustness-design.md` §4.1
Skill: none

- Item Types: per-item tagging — item 1 `Fix`, item 2 `Add | Proof`, item 3 `Fix` (no 80%+ dominant type: 2 Fix / 1 Add = 67% Fix)
- Prereqs: sibling plan `2026-07-21-1005-1-design-owner-doc-sync.md` Phase 1 F5 (schema doc) recommended but not strictly blocking — the `error` / `endedAt` / `phase` fields are already produced at other `writeDraftState` call sites (`:417-422, :482-487`), so the field names are established even without the schema doc.

- [x] **A1 (Fix)** In `tools/mission-driver/src/main.js`, apply three coupled edits:
  1. **Move** the `const stateFile = ...` (`:362`) and `const writeDraftState = (patch) => { ... }` (`:363-372`) definitions to BEFORE the `validateDraftDesc` call at `:348`. This resolves the TDZ `ReferenceError` that would otherwise occur when the reject branch references the closure. The existing call site at `:373-381` (re-affirm running state) continues to work because the closure is still in scope.
  2. **Insert** a `writeDraftState` call in the reject branch at `:349-354` BEFORE `await runner.close(); return`. Target shape (single-arg patch object, no `await`, `opts.draftJobDir` guard matching existing pattern):
     ```js
     if (!v.ok) {
       console.error(`[DRAFT VALIDATION] ${v.reason}`);
       console.error(`Hint: draft 需要一句描述目标的话；示例：draft '为 mission-driver 增加 audit 计数'`);
       if (opts.draftJobDir) {
         writeDraftState({
           status: "failed",
           phase: "rejected",
           endedAt: new Date().toISOString(),
           error: v.reason,
         });
       }
       process.exitCode = 1;
       await runner.close();
       return;
     }
     ```
  3. **No merge-with-prev concern**: `writeDraftState` already merges (`{ ...prev, ...patch }` at `:368`), so the initial `desc` written by `startDraftJob` is preserved automatically. No re-read or special handling needed.
  Constraints:
  - The `phase: "rejected"` value is net-new. Existing failed-path writes use `phase: "brief"` or `phase: "draft"` (the phase at which the runtime error occurred). WI1 validation rejection is semantically distinct (pre-Stage-1 input rejection, not a brief-agent runtime failure), so `"rejected"` is chosen as a new terminal phase rather than reusing `"brief"`. Document this distinction in the Phase 1 doc update (item 3) so future readers understand why the failed-path convention was extended rather than followed.
  - Conditioning on `opts.draftJobDir` preserves the non-draft-job CLI path (direct `node main.js draft <desc>` without `--draft-job-dir` still exits 1 without writing any state file — the WI1 contract for the direct CLI path is unchanged). The `writeDraftState` closure also self-guards via `if (!stateFile) return;`, so the outer conditional is redundant for correctness but kept for parity with the existing failed-path writes at `:416-423, :481-487`.
  - Sibling plan F5 schema table will enumerate `phase: "rejected"`; if both plans land together, ensure the schema doc lists it.
      - Skill: none
- [x] **A1 (Add | Proof)** Add a regression test in `tools/mission-driver/test/draft-desc-validate.test.js` (or a new `test/draft-job-reject.test.js` if the existing file is pure-function only): construct a temp `draftJobDir` via `mkdtempSync`, invoke `cmdDraftMission("d", { draftJobDir })` (or equivalent entry) with a fake runner via `__setRunnerFactoryForTest(makeFakeRunner(...))`, then assert:
  - The resulting `draft-state.json` contains `{status: "failed", phase: "rejected", error: /too short|placeholder/, desc: "d"}` (verifies terminal state + preserved `desc` + error reason).
  - `_tmp/draft-*` contains only `draft-state.json` (no junk `*-brief.md`, `*-roadmap.md`, `*.json` mission artifacts — verifies WI1 file-pollution goal intact).
  - `readDraftJob(draftJobDir)` (the monitor's read path at `draft-job.mjs:130-165`) returns the full state with `error` field populated (verifies the UI detail view can show the failure reason).
  Reuse the `mkdtempSync + config.runDir` pattern from `test/audit-count.test.js:46-57`. Add a sibling test asserting the direct CLI path (no `--draft-job-dir`) still exits 1 without writing any state file.
      - Skill: none
- [x] **A1 (Fix)** Update `tools/mission-driver/design/draft-robustness-design.md` §4.1 to document the reject-branch state write (one paragraph: "When invoked with `--draft-job-dir`, the WI1 reject branch writes `{status: "failed", phase: "rejected", endedAt, error: <reason>}` to `draft-state.json` before exit; the initial `desc` written by `startDraftJob` is preserved by `writeDraftState`'s merge semantics. `phase: "rejected"` is a new terminal phase, distinct from existing `phase: "brief"` / `"draft"` runtime-failure phases, because WI1 input rejection is pre-Stage-1."). If sibling plan F5 has already added the schema table, this paragraph cross-references it. (This item may be merged into sibling plan Phase 1 F5 if both land in the same session — record the merge decision in the log.)
      - Skill: none

Exit Criteria:

- [x] Live repro from audit A1 (submit `draft "d"` via `startDraftJob`) now produces a terminal `draft-state.json` with `status: "failed"` and `error` set (verified via the regression test).
- [x] Test count grows by 1+ (current 510 baseline + sibling remediation-2 additions + 1 here); all green via `pnpm --prefix tools/mission-driver test` (unconditional — works whether or not sibling remediation-2 Phase 1 A2 has landed; record the actual pass count at closure).
- [x] No regression to WI1 file-pollution goal: `_tmp/draft-*` contains only `draft-state.json` (no `*-brief.md`, `*-roadmap.md`, `*.json` mission artifacts) after a reject — verified by the regression test asserting directory contents.
- [x] Direct CLI path (no `--draft-job-dir`) still exits 1 without writing any state file — verified by a sibling regression test.
- [x] `readDraftJob` detail-view read path returns `error` field (regression test asserts this).
- [x] `docs/logs/` updated.

### Phase 2 - Deferred successor resolution

Status: completed
Targets: `docs/plans/mission-driver-draft-robustness/2026-07-21-0954-2-cli-draft-desc-validate.md` (WI1 plan Deferred But Adjudicated section), `docs/backlog/` (optional new row)
Skill: none

- Item Types: `Decision | Fix`
- Prereqs: Phase 1 complete.

- [x] **Decision (A1 successor)**: Choose how to resolve the WI1 plan's `Successor Required: yes` deferred item.
  - **Option A (recommended)**: Phase 1's code fix eliminates the underlying failure mode (stuck-running state is no longer possible). The remaining follow-up is purely UI rendering of the new `failed` / `rejected` status. Update WI1 plan's Deferred But Adjudicated section: change `Successor Required: yes` to `Successor Required: no — underlying gap closed by mdr-remediate-3; UI rendering of failed/rejected status is watch-only residual`. Add a tracked backlog row to `docs/backlog/` for the UI rendering work with explicit priority and acceptance criterion (trigger for promotion into scope: any user feedback indicating the `failed` text is misread as `running` due to lack of visual distinction).
  - **Option B**: Keep `Successor Required: yes` and create a tracked backlog row in `docs/backlog/` for "monitor draft-job UI rendering of `failed` / `rejected` status" with explicit priority and acceptance criterion.
  - **Alternatives considered**: Option A is honest about the gap being closed at the state-machine level; Option B preserves the UI work as a tracked follow-up but adds a backlog row for a small rendering tweak.
  - **Residual risk (Option A)**: monitor draft-job UI may not visually distinguish `failed` from `running` until the UI is updated — user sees `failed` text but no special styling.
  - **Residual risk (Option B)**: small backlog overhead.
  - **Chosen**: Option A. Phase 1's writeDraftState call makes the state file honest (`status: "failed"`, `phase: "rejected"`, `error` populated); the remaining UI styling is cosmetic and tracked explicitly in the mission roadmap's new "Follow-up Backlog" section with promotion trigger documented. Audit grep confirms no other plan carries an unresolved `Successor Required: yes` for THIS mission's state-machine gap (WI4's `--fix`/`--strict` successor and WI2's prompt-stability successor are unrelated concerns, different mission areas).
  - Skill: none
- [x] **A1 (Fix)** Apply the chosen option. If Option A: edit WI1 plan Deferred section + optionally add backlog row. If Option B: add backlog row only. Verify no other plan or roadmap row carries an unresolved `Successor Required: yes` for this mission (grep-verified).
  - Applied: `docs/plans/mission-driver-draft-robustness/2026-07-21-0954-2-cli-draft-desc-validate.md` Deferred section's `Successor Required: yes` → `Successor Required: no — underlying gap closed by mdr-remediate-3 …`. Added new "Follow-up Backlog" section to `docs/backlog/mission-driver-draft-robustness-roadmap.md` with one row (priority `P3` cosmetic; trigger = user feedback that `failed` text is misread as `running`; acceptance = RunList/RunDetail visually distinguishes failed/rejected from running). Roadmap `Last Updated` header refreshed.
  - Grep-verified: `grep -rn "Successor Required: yes" docs/plans/mission-driver-draft-robustness/ docs/backlog/mission-driver-draft-robustness-roadmap.md` shows only (a) WI4 `mission-check-cli-cross-platform.md:143` (`--fix` / `--strict` CLI capabilities — unrelated), (b) this plan's own narrative quoting the pre-resolution state, and (c) WI2 `brief-gate-marker.md:249` (AI marker output stability — unrelated). No remaining unresolved successor for the draft-job state-machine gap.
      - Skill: none

Exit Criteria:

- [x] Decision recorded with rationale and alternatives in this plan.
- [x] WI1 plan Deferred section no longer carries an unresolved `Successor Required: yes` for the state-machine gap (UI rendering follow-up is allowed to remain if Option B).
- [x] If a backlog row is added, it has explicit priority and a one-line acceptance criterion.
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: needs revision (subagent `ses_07c99279fffetKTVcz7WJuwRo3`, 2026-07-21). Five blocking issues found and fixed, all in the Phase 1 A1 Fix item: (1) `writeDraftState(draftJobDir, {...})` was wrong arity — actual closure is `writeDraftState(patch)` (one arg, captures `stateFile` via closure); (2) TDZ `ReferenceError` — the closure is declared at `main.js:363` AFTER the reject branch at `:348-355`, so the fix must move the `stateFile`/`writeDraftState` definitions above `validateDraftDesc`; (3) bare `draftJobDir` was not in scope — should be `opts.draftJobDir` matching the 6 existing call sites; (4) `await` on a synchronous `writeFileSync`-based closure was misleading and inconsistent with existing call sites — removed; (5) "Constraints" hedge ("if `writeDraftState` is a full-replace writer, re-read the existing file") revealed the author had not verified the actual merge semantics — `writeDraftState` already merges (`{...prev, ...patch}` at `:368`), so `desc` is preserved automatically; hedge removed. Current Baseline now cites `writeDraftState`'s definition location (`:362-372`) and merge semantics explicitly. Phase 1 item types changed to per-item tagging (67% Fix, below 80% threshold). Regression test now also asserts `readDraftJob` detail-view path returns `error` field (per reviewer non-blocking suggestion). Closure gate verification count made unconditional with explicit expected ranges.
- Independent draft review iteration 2: accept (subagent `ses_07c924611ffekZjA3iTwo4UFg1`, 2026-07-21). All five iteration-1 blocking issues re-verified fixed via live re-read of `tools/mission-driver/src/main.js:340-380`: closure signature is single-arg `writeDraftState(patch)`; Phase 1 A1 Fix specifies moving `stateFile`/`writeDraftState` definitions above `validateDraftDesc`; uses `opts.draftJobDir`; no `await`; merge semantics preserve `desc` with no hedge. Full re-checklist passes — coverage of A1 complete including successor tracking, Minimum Rule 13 (non-degradable) honored, closure gates match template. Non-blocking suggestions accepted: reconciled call-site count (6 → 7 to match the 7 line numbers cited); removed forbidden word "Optionally" from Phase 2 Option A and Follow-up section (replaced with explicit backlog row + promotion trigger); Constraints note flagged for live verification of `phase: "brief"` / `"draft"` claim at `:417-422` / `:482-487` during implementation. Consensus reached — plan promoted to `Plan Status: active`.

## Closure Gates

- [x] in-scope behavior is complete (A1 stuck-running failure mode eliminated + successor tracked or closed)
- [x] relevant docs are aligned (`draft-robustness-design.md` §4.1 reject-branch behavior documented; WI1 plan Deferred section updated; sibling plan F5 schema includes `phase: "rejected"` if both land together)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` (unconditional — record actual pass count at closure; expected ≥511 if landing alone, ≥513 if sibling remediation-2 has landed)
- [x] no in-scope item downgraded to deferred/follow-up (the underlying A1 gap is closed; only UI rendering may be deferred with explicit rationale)
- [x] independent draft review completed and recorded
- [x] text consistency verified: Plan Status, phase statuses, exit criteria, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### monitor draft-job UI rendering of failed / rejected status

- Classification: `watch-only residual`
- Why Not Blocking Closure: Phase 1 closes the underlying state-machine gap (the `draft-state.json` no longer lies about being `running`). The UI already renders the `status` field textually; lack of dedicated styling for `failed` is cosmetic, not a correctness gap.
- Successor Required: no (Option A — chosen in Phase 2). UI rendering work tracked explicitly in `docs/backlog/mission-driver-draft-robustness-roadmap.md` "Follow-up Backlog" with promotion trigger (user feedback that `failed` text is misread as `running`).

### Alternative fix path — extend run-reconcile.mjs to cover draft-state.json

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: The audit lists extending `run-reconcile` to scan `_tmp/draft-*/draft-state.json` as an alternative fix path. This plan chooses the producer-side fix (write `failed` in the reject branch) because it gives the user immediate feedback (the state file is correct as soon as the child exits, no 90-min fallback wait). The reconciler extension is still valuable as defense-in-depth (catches truly orphaned children where the producer never reached the write call), but is a separate concern.
- Successor Required: no (defense-in-depth; revisit if a real orphan case appears)

## Closure

Status Note: A1 stuck-running failure mode closed at the state-machine level. Phase 1 hoisted `stateFile` + `writeDraftState` above `validateDraftDesc` (resolving the TDZ that had previously made the reject-branch state write impossible) and inserted an `if (opts.draftJobDir) writeDraftState({ status: "failed", phase: "rejected", endedAt, error: v.reason })` call before `runner.close(); return`. The merge semantics preserve `desc` written by `startDraftJob`. `phase: "rejected"` is a net-new terminal phase, semantically distinct from runtime-failure phases (`"brief"` / `"draft"`) because WI1 input rejection happens before Stage 1. Phase 2 chose Option A — the WI1 plan's `Successor Required: yes` is flipped to `no` (underlying gap closed by this plan), and the residual UI rendering work is tracked explicitly in the mission roadmap's new "Follow-up Backlog" section with a documented promotion trigger. The direct CLI path (no `--draft-job-dir`) still exits 1 without writing any state file — the WI1 contract for direct CLI invocation is unchanged.

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay closure pass (no second reviewer / subagent available). Non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback: no API / DB / auth / integration / deployment contract change; one local code branch + 2 regression tests + 1 design-doc paragraph + 1 schema-table update + 1 plan-cross-reference edit.
- Cold-replay self-check:
  - Plan-side: all `[x]` Phase items + Closure Gates agree with code/test/doc diff; Plan Status / Phase Status / Exit Criteria / Closure Note all read `completed`; Deferred items (UI rendering, reconciler extension) explicitly adjudicated with `Successor Required: no` and tracked in `docs/backlog/mission-driver-draft-robustness-roadmap.md` Follow-up Backlog.
  - Code-side: `tools/mission-driver/src/main.js:344-405` — stateFile/writeDraftState definitions hoisted above `validateDraftDesc`; reject branch (`:367-389`) writes `{status:"failed", phase:"rejected", endedAt, error}` guarded by `if (opts.draftJobDir)`; existing 7 call sites unchanged in semantics; comment explains TDZ rationale + phase semantics.
  - Test-side: `tools/mission-driver/test/draft-desc-validate.test.js` — Case B1 extended with no-state-file walk assertion (direct CLI path); Case B2 replaced with failed/rejected state assertions + readDraftJob consumer-path assertion + no-junk-files assertion; Case B2 describe gained a new placeholder-rejection `it()` block. Net +1 test count.
  - Doc-side: `tools/mission-driver/design/draft-robustness-design.md` §4.1 callout documents the reject-branch state write; §1.4 schema table updated to include `phase: "rejected"` value + new patch-point citations + refreshed line numbers (post-hoist shift).
  - Cross-reference: WI1 plan `2026-07-21-0954-2-cli-draft-desc-validate.md` Deferred section's `Successor Required: yes` → `no — underlying gap closed by mdr-remediate-3`. Mission roadmap `docs/backlog/mission-driver-draft-robustness-roadmap.md` gained "Follow-up Backlog (post-mission residuals)" section with the UI-rendering row.
  - Verification: `pnpm --prefix tools/mission-driver test` → 515 pass / 0 fail (baseline 514 + 1 placeholder rejection test); `pnpm --prefix tools/mission-driver/web run typecheck` clean; `pnpm --prefix tools/mission-driver/web run build` built; `pnpm --prefix tools/mission-driver run lint:prompts` OK. Live end-to-end probe: `_tmp/draft-live-test/draft-state.json` pre-populated with running state → `node tools/mission-driver/src/main.js draft "d" --draft-job-dir _tmp/draft-live-test` → exit 1 + resulting state `{status:"failed", desc:"d" (preserved), phase:"rejected", endedAt, error}` + jobDir contains only `draft-state.json`. Direct CLI path `node ... draft "d" --dir _tmp/direct-cli-test` → exit 1 + no `draft-state.json` written.
- Evidence: this plan (Plan Status: completed / Phase 1+2 [x] / Closure Gates [x]), `main.js:344-405`, `test/draft-desc-validate.test.js` (Case B1 extension + Case B2 replacement + new placeholder `it()`), `design/draft-robustness-design.md` §1.4 + §4.1, `docs/plans/mission-driver-draft-robustness/2026-07-21-0954-2-cli-draft-desc-validate.md` Deferred section, `docs/backlog/mission-driver-draft-robustness-roadmap.md` Follow-up Backlog, `docs/logs/2026/07-21.md` mdr-remediate-3 entry.

Follow-up:

- Tracked backlog row for UI rendering of `failed` / `rejected` draft-job status (per Phase 2 Decision; trigger for promotion into scope documented above).
