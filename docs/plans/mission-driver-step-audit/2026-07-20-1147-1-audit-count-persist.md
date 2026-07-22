# mdo-step-audit-1 audit 计数落盘到 run-state.json

> Plan Status: completed
> Last Reviewed: 2026-07-20
> Source: `docs/backlog/mission-driver-step-audit-roadmap.md` WI1
> Related: `tools/mission-driver/design/step-execution-and-audit-count-design.md` §4.1, §5.2
> Mission: mission-driver-step-audit
> Work Item: WI1 audit 计数落盘到 run-state.json
> Audit: required

## Current Baseline

Live baseline verified against the repo on 2026-07-20:

- `_initWorkflow`（`tools/mission-driver/src/engine.js:303-323`）初始化的 `this.workflow` 对象**没有**任何 audit 计数字段。现有顶层字段：`missionName / flowName / runId / runDir / pid / status / startedAt / updatedAt / endedAt / currentStep / steps[]`。
- `_wfOpen`（`engine.js:325-350`）在步骤开始时写入 `currentStep` 并 push 一条 `steps[]` 记录，**不**区分主/子流程，**不**对 auditEntry 计数。
- maxAuditRounds 闸门（`engine.js:1344-1347`）当前读的是内存 `visits`（`this.visitCounts`），且**位于 `_wfOpen`（`:1351`）之前**：`if (maxAuditRounds > 0 && currentStep === auditEntry && visits > maxAuditRounds) → completed`。
- `maxAuditRounds` / `auditEntry` 已是 flow 顶层字段（`flows/mission-driver.json:7-8`，值 `3` / `"DEEP_AUDIT"`），engine 已在 `run()` 顶部读取（`engine.js:1281-1282`）。
- 子流程 child config 通过 `engine.js:1060` 设置 `isSubflow: true`；主流程不设。`_wfOpen` 内可通过 `(this.delegates.config || {}).isSubflow !== true` 判断"是否主流程"。
- `_writeWorkflow`（tmp + rename 原子写）已就绪，WI1 直接复用，无需改写机制。
- run-state 写盘由 `_initWorkflow`（初始）与 `_wfOpen` / `_wfClose`（每步开/关）触发；旧 run-state.json 无新字段时消费方需 `?? 0` 兜底。
- 现有测试 `test/run-state-pid.test.js` / `test/sessionid-persist.test.js` 已建立"字段落盘到 run-state.json"的测试范式，WI1 沿用。
- 验证命令：`npm --prefix tools/mission-driver test`（package.json `"test": "node --test test/*.test.js"`）。

**Gap:** `auditRound` 只活在内存 `visitCounts`，不落盘；monitor / 复盘 / 后续 WI4 决策都看不到权威计数。本 plan 补这个枢纽字段，是 WI4 与 WI5 的共同地基。

## Goals

- 在 run-state.json 中持久化本 run 已开始执行的 DEEP_AUDIT 轮次（`auditRound`）与上限（`maxAuditRounds`）。
- `_wfOpen` 在主流程进入 auditEntry 时递增并原子落盘；子流程步骤不计数。
- maxAuditRounds 闸门改读 `workflow.auditRound`，且不因递增/闸门先后顺序产生 off-by-one。
- 旧 run-state.json（无新字段）读出 `auditRound = 0`，行为等同"本 run 未跑过 audit"。

## Non-Goals

- 不改 DRAFT_PLANS 决策、不改 prompt、不加 audit-gate（WI4 范围）。
- 不在 monitor / events / 日志展示 audit 计数（WI5 范围）。
- 不做跨 run 的 audit 计数累计（设计文档 §6.1 已否决）。
- 不改子流程内部步骤的计数语义（一轮 audit = 一次主流程 DEEP_AUDIT 顶层步骤访问）。

## Task Route

- Type: `implementation-only change`
- Owner Docs: `tools/mission-driver/design/step-execution-and-audit-count-design.md` §4.1, §5.2
- Skill Selection Basis: `Skill: none` — 纯引擎字段落盘，方法直接由设计文档 §4.1 + §5.2 写法 2 指定，无匹配的可复用 skill。

## Infrastructure And Config Prereqs

No infra prereqs beyond existing baseline. 引擎核心零 npm 依赖（`CONTEXT.md` 关键约束），本 plan 不引入新依赖。

## Execution Plan

### Phase 1 - 字段初始化与递增落盘

Status: completed
Targets: `tools/mission-driver/src/engine.js`（`_initWorkflow` :303、`_wfOpen` :325）
Skill: none

- Item Types: `Add`
- Prereqs: none

- [x] Add: 在 `_initWorkflow`（`engine.js:303-323`）的 `this.workflow` 初始化对象中新增两个顶层字段：
      - `auditRound: 0` — 本 run 已开始执行的 DEEP_AUDIT 轮次（1-based，递增后即"当前是第 N 轮"）。
      - `maxAuditRounds: this.flow.maxAuditRounds ?? 0` — 上限快照，便于消费方直接读，不重复 `?? 0`。
      - Skill: none
- [x] Add: 在 `_wfOpen`（`engine.js:325-350`）中，当 `this.workflow` 存在时，新增主流程 auditEntry 递增逻辑：
      - 条件：`(this.delegates.config || {}).isSubflow !== true && name === (this.flow.auditEntry || this.flow.entry)`。
      - 动作：`this.workflow.auditRound = (this.workflow.auditRound || 0) + 1;`（递增在 `_writeWorkflow()` 之前完成，确保"步骤开始即落盘"，audit 中途崩溃 run-state 也如实反映"第 N 轮进行中"）。
      - Skill: none

Exit Criteria:

- [x] 新建的 run，run-state.json 首次落盘即含 `auditRound: 0` 与 `maxAuditRounds` 两字段。
- [x] 主流程进入 auditEntry 步骤时 `auditRound` 在该步 `_wfOpen` 落盘的文件里已递增；子流程（`isSubflow: true`）步骤不触发递增。
- [x] `docs/logs/` 更新（按 AGENTS.md）。

### Phase 2 - 闸门改读落盘计数（避免 off-by-one）

Status: completed
Targets: `tools/mission-driver/src/engine.js`（`run()` :1278-1347）
Skill: none

- Item Types: `Fix | Decision`
- Prereqs: Phase 1 完成

- [x] Decision: 递增与闸门的先后顺序严格采用设计文档 §5.2 **写法 2**（推荐方案，已与设计文档原文核对），并在 plan 中固化理由与可观测边界：
      - 选择：保持 `_wfOpen` 内递增不变；**闸门位置不动**（仍在 `engine.js:1344`，即 `totalSteps++`（`:1349`）与 `_wfOpen`（`:1351`）**之前**），读"递增前的 `workflow.auditRound`"，判 `auditRound >= maxAuditRounds → completed`。
      - 与设计文档原文一致（`step-execution-and-audit-count-design.md:464`："保持 `_wfOpen` 递增不变，闸门读'递增前值'…然后 `_wfOpen` 才 `++`"）。
      - 计数时序（以 `maxAuditRounds = 3` 为例）：第 1 次进入 → 闸门读 `0 >= 3` 否 → `_wfOpen` 递增到 1 → 跑 audit；第 2 次 → `1 >= 3` 否 → 递增到 2 → 跑；第 3 次 → `2 >= 3` 否 → 递增到 3 → 跑；第 4 次 → `3 >= 3` 是 → 直接 `completed`，不再递增、不再 `_wfOpen`。最终 `auditRound === 3 === maxAuditRounds`（语义直观：跑满了额度）。
      - 备选（写法 1）：把递增挪到闸门之前。否决理由：递增属于 `_wfOpen` 的步骤开始语义（与 steps[] 记录 push、currentStep 更新同处），单独前置会割裂职责。
      - 备选（被否决的第三方案）：把闸门移到 `_wfOpen` 之后读"已递增值"用 `>`。否决理由：会让被中止的那次循环先 `totalSteps++`（engine.js:1349）、push 一条 step 记录、emit `step_started`（:1352），且 `auditRound` 最终为 `maxAuditRounds+1`——四处可观测副作用（events.jsonl / 日志编号 / stepCount / 计数语义）均劣于写法 2，且与设计文档不符。
      - 残留风险（写法 2 下已消除）：闸门在 `_wfOpen` 之前触发，被中止的迭代**不**调用 `_wfOpen`，故**无悬空 step 记录**、**无多余 `totalSteps++`**、**无多余 `step_started` 事件**。`_result("completed")`（engine.js:464-466）会调 `_finalizeWorkflow`，但因 `_wfCurrent` 此时为 null（上一轮已 close），`_finalizeWorkflow`（:397）的 `_wfClose` 分支不触发，仅写 `workflow.status/endedAt`。Phase 3 测试据此断言。
      - Skill: none
- [x] Fix: 调整 `engine.js:1344-1347` 的 maxAuditRounds 闸门（位置不动，仅改判断依据与比较符）：
      - 当前：`if (maxAuditRounds > 0 && currentStep === auditEntry && visits > maxAuditRounds) { ... return completed; }`。
      - 改为：`if (maxAuditRounds > 0 && currentStep === auditEntry) { const round = (this.workflow && this.workflow.auditRound) || 0; if (round >= maxAuditRounds) { this._log(...); return await this._result("completed", totalSteps); } }`。
      - 闸门块保持在 `totalSteps++`（:1349）与 `_wfOpen`（:1351）**之前**（即原位，不移动）。
      - 删除原 `visits > maxAuditRounds` 判断中与 audit 相关的部分；`visits` 仍保留用于上方 `maxCycleVisits` 闸门（:1333），不动。
      - Skill: none
- [x] Fix: 兜底旧 run-state.json（无 `auditRound` 字段）—— 所有读 `workflow.auditRound` 的地方统一 `?? 0` / `|| 0`，确保行为等同"本 run 未跑过 audit"。Phase 1 的初始化只对新 run 生效； resumed/旧文件靠兜底。
      - Skill: none

Exit Criteria:

- [x] 一个跑满 `maxAuditRounds` 的 run（以 `maxAuditRounds = 3` 为例），在第 4 次进入 auditEntry 时以 `completed` 结束；run-state.json 的 `auditRound` 最终值为 `3 === maxAuditRounds`（写法 2：闸门读递增前值，被中止的迭代不递增）。
- [x] 被中止的第 4 次迭代**不**产生 DEEP_AUDIT 的 step 记录（闸门在 `_wfOpen` 之前触发）、**不**多计 `totalSteps`、**不**emit `step_started` 事件（与上一轮相比 events.jsonl 不新增 audit step 事件）。
- [x] 未跑过 audit 的 run，`auditRound` 落盘为 `0`；跑过 N 轮（N ≤ maxAuditRounds）的 run 落盘为 `N`。
- [x] 旧 run-state.json（手动删去 `auditRound` 字段）被引擎加载后不报错，行为等同 `auditRound = 0`。
- [x] `docs/logs/` 更新。

### Phase 3 - 单元测试

Status: completed
Targets: `tools/mission-driver/test/audit-count.test.js`（新增）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1、Phase 2 完成

- [x] Add: 新增 `test/audit-count.test.js`，沿用 `test/run-state-pid.test.js` / `sessionid-persist.test.js` 的 mock-flow + 临时 runDir 范式，覆盖：
      - 用例 A：mock flow `auditEntry` 命中、`maxAuditRounds = 2`，驱动进入 auditEntry 2 次 → 断言 run-state.json `auditRound === 2`、`maxAuditRounds === 2`。
      - 用例 B（写法 2 闸门边界）：`maxAuditRounds = 2`，驱动进入第 3 次 auditEntry → 断言 run 以 `completed` 结束、`auditRound === 2`（**不**为 3，闸门读递增前值用 `>=`）、被中止的第 3 次迭代未在 `workflow.steps[]` 留下 DEEP_AUDIT 记录（步骤数不增）、`result.stepCount` 未因此次中止多 +1。
      - 用例 C：mock flow 含一个 `isSubflow: true` 子流程步骤且其步骤名恰等于 auditEntry → 断言进入该子流程步骤**不**递增主流程 `auditRound`（验证主/子流程区分）。
      - 用例 D：读一个手工构造的旧 run-state.json（无 `auditRound` 字段）→ 断言引擎读出 `0` 且不抛错。
      - Skill: none
- [x] Proof: 运行 `npm --prefix tools/mission-driver test`，确认新测试全绿且不破坏 `core.test.js` / `transitions.test.js` / `skip-steps.test.js` 等现有套件。
      - Skill: none

Exit Criteria:

- [x] `test/audit-count.test.js` 四个用例（A/B/C/D）全部通过。
- [x] `npm --prefix tools/mission-driver test` 整体绿（含现有套件）。
- [x] `docs/logs/` 更新。

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (task `ses_08257e2efffeq24dOBLiGh62Xi`) because Phase 2 Decision contained a factual error about `_result("completed")` / `_wfClose` (claimed a "status=running 悬空 step 记录" — actually `_result`→`_finalizeWorkflow`→`_wfClose` closes the step, engine.js:464-466/395-402), and mislabeled the choice as "写法 2" while actually deviating from the design doc's 写法 2 (which reads pre-increment value with `>=`, gate before `_wfOpen`). Unrecorded `totalSteps` off-by-one side effect.
- Iteration 1 revision: rewrote Phase 2 Decision to strictly implement the design doc's 写法 2 (gate stays at engine.js:1344 before `_wfOpen`, reads pre-increment `workflow.auditRound` with `>=`, no phantom step record, no extra `totalSteps`). Updated Phase 2 Exit Criteria (`auditRound` final value is `maxAuditRounds`, not `+1`) and Phase 3 test case B accordingly.
- Independent draft review iteration 2: `accept` (task `ses_0824d34a1ffe7WInYlW9YsuJmG`) — 写法 2 trace 经 live code 核查准确（gate 在 engine.js:1344、`_wfClose` 设 `_wfCurrent=null`、`_finalizeWorkflow` 仅在 `_wfCurrent` 真值时调 `_wfClose`），3 轮计数算术验证通过，无新阻塞问题。共识达成，Plan Status → active。

## Closure Gates

- [x] in-scope behavior is complete（字段初始化 + 主流程递增落盘 + 闸门改读落盘计数 + 旧文件兜底）
- [x] relevant docs are aligned（设计文档 §4.1/§5.2 已是 owner doc；run-state schema 若有独立文档需补字段说明，否则 No owner-doc update required 并在设计文档备注实现已落地）
- [x] verification has run（`npm --prefix tools/mission-driver test`）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### `_scanOpenAuditsList` 按 audit type 区分（设计文档 §5.4 推荐后续）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: WI1 只负责计数落盘；区分 audit type 属于 WI4 决策引擎化的精度优化，且设计文档明确"方案 B 已把决策权从 AI 拿走，即使扫描宽泛，引擎也能据 `auditRound` 正确退出"。
- Successor Required: yes — 由 WI4 承接评估。

## Closure

Status Note: WI1 closed — `auditRound` / `maxAuditRounds` persisted in run-state.json (engine.js `_initWorkflow` / `_wfOpen`); maxAuditRounds gate now reads the pre-increment `workflow.auditRound` with `>=` per design §5.2 写法 2 (no phantom step record / no extra stepCount / no extra step_started on the gate-stopped iteration); legacy run-state without the field reads as 0 via `|| 0`. Four new test cases A/B/C/D in `test/audit-count.test.js` all green; full suite 446/446 green (`pnpm --prefix tools/mission-driver test`); `web typecheck` / `web build` / `lint:prompts` all green.

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay closure pass (no second reviewer/subagent available). Per AGENTS.md Reviewer-Availability Fallback, this plan is non-protected (no API/DB/auth/integration/deployment contract change; engine-internal field addition) and non-high-risk, so solo review is acceptable. Limitation noted: a future round of `OPEN_AUDIT` will re-discover any insufficient fix as a fresh `open` finding.
- Evidence:
  - `tools/mission-driver/src/engine.js` `_initWorkflow` (~:313) — `auditRound: 0` + `maxAuditRounds: this.flow.maxAuditRounds ?? 0` added.
  - `tools/mission-driver/src/engine.js` `_wfOpen` (~:329) — main-flow auditEntry increment guarded by `(this.delegates.config || {}).isSubflow !== true && name === (this.flow.auditEntry || this.flow.entry)`, applied before `_writeWorkflow`.
  - `tools/mission-driver/src/engine.js` `run()` maxAuditRounds gate (~:1344) — rewritten to read pre-increment `(this.workflow && this.workflow.auditRound) || 0` with `>=`; position unchanged (still before `totalSteps++` / `_wfOpen`).
  - `tools/mission-driver/test/audit-count.test.js` — new file, cases A/B/C/D all pass.
  - Verification: `pnpm --prefix tools/mission-driver test` → 446 pass / 0 fail; `pnpm --prefix tools/mission-driver/web run typecheck` → clean; `pnpm --prefix tools/mission-driver/web run build` → built; `pnpm --prefix tools/mission-driver run lint:prompts` → OK.
  - Roadmap: `docs/backlog/mission-driver-step-audit-roadmap.md` WI1 → `done`.
  - Dev log: `docs/logs/2026/07-20.md`.
