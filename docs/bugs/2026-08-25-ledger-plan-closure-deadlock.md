# Ledger-format plans invisible to a running engine + closure receipt writer unreachable (EXEC_PLANS no-op death loop)

> Discovered: 2026-08-25 (age-autonomy run `2026-08-25-063133-mission-driver`, DRAFT_PLANS visit 3)
> Status: **D2 fixed** (2026-08-25, plan `docs/plans/age-autonomy/2026-08-25-0925-1-m2-wi41-closure-routing-deadlock.md` M2-WI41, commit `00aeb9c`) — regression net `tools/mission-driver/test/closure-routing.test.js`（三态 fixture + legacy 钉住 + 0635-3 live 双向断言）；D1 维持 restart 裁定（零代码修，不变）
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
- **D2 (FIXED 2026-08-25, M2-WI41, commit `00aeb9c`)**: `closureScriptCheck`（`tools/mission-driver/src/flow-loader.js`）新增回执感知 fail 条件——`format === "frontmatter" ∧ 计数域全勾 ∧ deriveCompleted 不成立` → fail，derived.reasons 逐条（`no-audit-receipt` / `missing-pass:<key>` / `basis-hash-mismatch:<key>`）进 fail text 与 `SCRIPT_CHECK_DETAILS`（CLOSURE_AUDIT 反馈面）；`flows/plan-execution.json` 既有 `fail → CLOSURE_AUDIT` 路由即设计意图，零改动，`engine.js` 零 diff。同时落地引擎读面 `defaultVerifyKeys = ["test"]` 注入（`plan-check.mjs` `missionDefaultVerifyKeys` 单一实现——flow-loader 谓词族 + closureScriptCheck + plan-check CLI 三面同源），清偿 verify-省略版死锁（Follow-up P2）。`inspectPlan` 增量输出 `derivedCompleted`/`completionReasons`/`verifyKeys`/`verifyKeysSource`。
- **0635-3 recovery（引擎运行期事件，非代码可代跑）**: 修复落地后的下一次引擎 run 会对 0635-3 重跑 plan-execution subflow：closureScriptCheck 现对当前态（全勾 43 项、缺 pass 行、缺回执）fail 并携带 `missing-pass:test` + `no-audit-receipt` → 路由 CLOSURE_AUDIT 补 dispatch/accepted 回执 → BUILD_VERIFY 补 `## Verification` pass 行（basisHash 当次计算）→ 五合取成立 → 派生 completed 离开 activePlans。恢复通路由 `closure-routing.test.js` ⑥「路由决策镜像派生态」双向钉住（补齐回执后该测试仍绿）。永不手造回执。

## 5. Tests

Landed with the D2 fix (commit `00aeb9c`, M2-WI41): `tools/mission-driver/test/closure-routing.test.js` — ① all-ticked ledger fixture lacking receipts + pass lines → `closureScriptCheck` fail with `no-audit-receipt` + `missing-pass:test`; ② receipt added still fails on the pass line; ③ basisHash-matching pass line passes; ④ Closure-Findings rework (stale basisHash) fails; ⑤ legacy fixtures byte-identical behavior; ⑥ 0635-3 live corpus assertion — routing decision mirrors `deriveCompleted` in both directions (fails pre-recovery, passes once re-run receipts exist). Suite: `pnpm --prefix tools/mission-driver test` 876/0 (baseline 863).
