# Ledger-format plans invisible to a running engine + closure receipt writer unreachable (EXEC_PLANS no-op death loop)

> Discovered: 2026-08-25 (age-autonomy run `2026-08-25-063133-mission-driver`, DRAFT_PLANS visit 3)
> Status: **open** — D1 clears on engine restart (zero code diff); D2 has no fix yet and blocks closure of every ledger-format plan, including the whole active 0815 batch
> Related: `docs/backlog/age-autonomy-implementation-roadmap.md` M2 WI14/WI16/WI19（回执绑定 / 完成派生 / 机械验证写者——D2 是它们的引擎侧前置缺口）; plan `docs/plans/age-autonomy/2026-08-25-0635-3`（0635-3 为首个受害者）; `docs/plans/00-plan-authoring-and-execution-guide.md` § Plan Body Sections（回执语法权威）

## 1. Problem

Two stacked defects, one transient and one structural:

- **D1 (transient)**: The running engine (pid at run start 06:31:33) no-ops `EXEC_PLANS`/`REVIEW_PLANS` — both forEach predicates (`activePlans()`/`draftPlans()`) resolve to 0 items while the repo holds 3 active + 0 draft plans. Engine log: `EXEC_PLANS: forEach "activePlans()" resolved to empty list → all_complete` at 08:33:55.
- **D2 (structural)**: A ledger-format plan that reaches all-checkboxes-ticked can **never** derive `completed`: the only `## Closure` receipt writer (CLOSURE_AUDIT step) is unreachable for it, and the `## Verification` pass-line writer (BUILD_VERIFY) is prompt-enforced only and already failed once in practice. Live proof: `2026-08-25-0635-3` — all 60+ items ticked, subflow ended `completed` at 08:13:47, yet `deriveCompleted` reports `missing-pass:test` + `no-audit-receipt` → it stays in `activePlans()` and re-feeds on every future run.

Impact: with D1, the mission ping-pongs DRAFT_PLANS↔DEEP_AUDIT until `maxCycleVisits`/`maxAuditRounds` kill the run without executing anything. With D2, even a restarted engine re-executes 0635-3 (and later every 0815 plan) in an infinite re-feed loop — no ledger plan can ever close.

## Reproduction

D1: start an engine process, then land a change to `flow-loader.js` scan logic mid-run (as commit `f06ddac` 08:01:06 did, 90 min after engine start 06:31:33), then flip plans to frontmatter-only format. The engine's ESM-cached pre-dual-read scanner sees no `> Plan Status:` lines → 0 plans in every predicate. Contrast: a fresh node process on current HEAD returns 4 active plans (`createExpressionFunctions({projectRoot, mission:{plansDir:'docs/plans/age-autonomy'}}).activePlans()`).

D2: run the `plan-execution` subflow on any all-ticked ledger plan: EXECUTE(pass) → `closureScriptCheck` sees `totalUnchecked === 0` and `planStatus !== 'completed'` → PASS → flow JSON routes `pass → BUILD_VERIFY`, skipping CLOSURE_AUDIT. BUILD_VERIFY may or may not append pass lines (prompt duty, `prompts/build-verify.md:72-92`); even when it does, `auditReceipt` conjunct stays false (no dispatch/accepted pair exists — its only writer was skipped). `deriveCompleted` (01 §5.2) can never return true.

## 2. Diagnostic Method

Entry symptom: DRAFT_PLANS visit 3 invoked while the three 0815 plans showed `status: active` with 0 ticks — i.e. EXEC_PLANS visit 3 had just no-op'd.

- Inspected `run-state.json` step history: EXEC_PLANS v3 `durationMs: 1`, no `subflowRuns` — forEach resolved empty at 08:33:55, although plan files were active on disk since 08:33:36 (stat mtimes).
- Hypothesis 1 (rejected): plans-dir/config mismatch or `MISSION_DRIVER_LEDGER=legacy` env in the engine — mission json `plansDir` correct; `ps eww` shows no LEDGER env.
- Hypothesis 2 (confirmed for D1): repro with current HEAD code returned 4 active plans → code at HEAD is correct → the discrepancy must be process age. `git log --format=%ci` put the dual-read wiring commit `f06ddac` at 08:01:06, after engine start 06:31:33 → engine holds the pre-dual-read scanner in its ESM module cache. (Consistency check: EXEC_PLANS v2 at 23:01Z found the 0635 batch because those plans were still legacy-format at forEach time; the codemod migrated them mid-execution after the item list was captured.)
- For D2: engine log showed item subflows run EXECUTE → CLOSURE_SCRIPT_CHECK → BUILD_VERIFY with no CLOSURE_AUDIT visit; `flows/plan-execution.json` routes `CLOSURE_SCRIPT_CHECK.pass → BUILD_VERIFY` (audit only on fail); `closureScriptCheck` (flow-loader.js:218-225) only fails on unchecked items or legacy-completed-missing-evidence — both receipt-blind conditions for a ledger plan. `ledger-dualread.mjs` on 0635-3 confirmed `missing-pass:test`, `no-audit-receipt`.

## 3. Root Cause

- **D1**: mid-run deploy of scanner semantics vs process-lifetime ESM module cache — engine state (in-memory flow loader) silently diverged from repo HEAD; no reload/invalidation mechanism exists.
- **D2**: the ledger redesign (M1) moved closure evidence inline (pass lines + dispatch/accepted receipt as the completion conjuncts) and rewrote prompts (216e19e), but the `plan-execution` flow's routing gate `closureScriptCheck` was left receipt-blind. The receipt writer step is therefore unreachable exactly when it is needed (all-ticked plan), and the pass-line writer has no mechanical enforcement — `deriveCompleted`'s conjuncts can never all hold.

## 4. Fix

- **D1**: restart the engine process (resume/reconcile path exists: `--step` resume / run-state reconcile). No code change — HEAD is correct.
- **D2 (planned work, not yet landed)**: make the closure path ledger-aware — for a frontmatter-format plan, `closureScriptCheck` must fail (routing to CLOSURE_AUDIT) when the plan is all-ticked but lacks `## Verification` pass lines matching its `verify` keys or lacks a paired dispatch/accepted receipt. This is an engine-side seam change (flow-loader.js script step / plan-execution routing), in-scope only under a covering plan per project-context AI Block Conditions; it is the engine-side prerequisite the M2 law items (WI14 receipt binding, WI16 completion-derivation gate, WI19 mechanical-verification writer) will enforce from the plugin side.
- **0635-3 recovery**: never hand-forge receipts — after D2 lands, let the subflow re-run complete BUILD_VERIFY pass lines + CLOSURE_AUDIT receipt on it.

## 5. Tests

None yet (defect open). Regression coverage to land with the D2 fix: a `plan-execution` routing test asserting `closureScriptCheck` fails for an all-ticked ledger fixture lacking receipts (unit, node --test against a fixture plan), plus a corpus assertion that 0635-3 derives completed only after the re-run receipts exist.
