# mdo-step-audit-5 events/日志/monitor 展示 audit 计数（含 WI2 deferred 项）

> Plan Status: completed
> Last Reviewed: 2026-07-21
> Source: `docs/backlog/mission-driver-step-audit-roadmap.md` WI5
> Related: `tools/mission-driver/design/step-execution-and-audit-count-design.md` §4.4；前置 plan `2026-07-20-1147-1-audit-count-persist.md`（WI1，auditRound 字段就绪）；承接 WI2 plan 的两个 deferred 项（形式 Deferred 项：`single_step_done` 监控展示；Phase 2 Decision 残留风险记录的 `_finalizeWorkflow` step 级 status 映射）。
> Mission: mission-driver-step-audit
> Work Item: WI5 events/日志/monitor 展示 audit 计数
> Audit: required

## Current Baseline

Live baseline verified against the repo on 2026-07-20（含 WI1/WI2/WI3 落地后的形态；WI4 假定同期或先期落地，但本 plan 与 WI4 在源文件层几乎不重叠，可并行）:

- WI1 已在 `_initWorkflow`（`engine.js:303-326`）写入 `auditRound: 0` + `maxAuditRounds: this.flow.maxAuditRounds ?? 0` 顶层字段，并在 `_wfOpen`（`:345-348`）主流程进入 auditEntry 时递增。run-state.json 已持久化这两字段。
- `_emitEvent("step_started", ...)`（`engine.js:1385-1391`）当前 payload：`{ step, visit, totalSteps, stepType, runDir }`——**无 auditRound**。WI5 须在此处（仅当步骤是 auditEntry 时）追加。
- `_log("[step N] X (visit #M)")`（`engine.js:1383`）当前**无 audit round 后缀**；WI5 须在 auditEntry 步骤时追加 `(audit round N/M)`。
- `monitor.js:332-345` 的 `summarizeRun` 返回 `{ runId, missionName, flowName, status, startedAt, updatedAt, endedAt, currentStep, stepCount, runDir }`——**无 auditRound / maxAuditRounds**。`handleGetRun`（`monitor.js:497-515`）返回 `{ run: state, events, stepLogs, config }`，其中 `state` 是 `readRunState` 的原始对象（已含 WI1 新增字段，但前端 TS 类型未声明）。
- 前端 `web/src/types/run.ts:27-43` 的 `Run` interface 与 `:46-59` 的 `RunSummary` interface **未声明** `auditRound` / `maxAuditRounds` 字段。
- 前端 `RunDetail.vue:1-100` 通过 `resolveRenderer(run?.flowName)` dispatch 到 `DefaultRunDetail.vue`（`web/src/components/run/detail/DefaultRunDetail.vue`）。DefaultRunDetail 当前布局：左侧 StepTimeline，右侧 MissionConfig + LogViewer + ResourceChart + PlansTable + RoadmapProgress——**顶部无 audit 计数展示**。
- `RunList.vue` 顶部 RunStatus tag 用 `statusTagType`（`:198-206`）映射到 Naive UI 的 `info/success/error/warning`；`single_step_done` 当前不在映射内，会落到 `'default'`（灰）——属 WI2 deferred 项。`AppHeader.vue:62-70` 有同名 `statusTagType`，其注释（`:60-61`）声明"mirrors the run status mapping used elsewhere"，与 RunList 必须保持同步，同样遗漏 `single_step_done`。
- `run-postmortem.md`（`prompts/run-postmortem.md:25-39`）的 `<run_skeleton>` 段由 `buildRunSkeleton`（`config.js:196+`）渲染——当前 skeleton 仅打印 Mission/Run/Status/Total top-steps/Wall，**无 auditRound**。postmortem agent 因此不知道 run 跑了几轮 audit。
- `_finalizeWorkflow`（`engine.js:413-420`）的 `_wfClose(null, status === "completed" ? "completed" : "failed")`：当 `single_step_done` 触发（WI2）时，会把那条单步 step 记录标成 `status: "failed"`，即使该步实际成功。WI2 plan 的 Deferred 段显式把"是否给 `_finalizeWorkflow` 加 `single_step_done → completed` 的 step 级映射"交给 WI5 评估。
- 验证命令：`npm --prefix tools/mission-driver test`、`npm --prefix tools/mission-driver/web run typecheck`、`npm --prefix tools/mission-driver/web run build`、`npm --prefix tools/mission-driver run lint:prompts`。

**Gap:** audit 计数虽落盘但不在 events / 日志 / monitor dashboard / postmortem 任何一条链路可见；`single_step_done` status 在前端显示为 unknown 灰；单步成功却标 failed。本 plan 是可观测性收尾。

## Goals

- `step_started` 事件 payload 在步骤是 auditEntry 时含 `auditRound`（与 run-state.json 同步）。
- `_log` 行在 audit 步骤时追加 `(audit round N/M)`。
- `monitor.js` `GET /api/runs/:id` 与 `GET /api/runs` 的 run payload 含 `auditRound` / `maxAuditRounds`。
- 前端 `Run` / `RunSummary` TS 类型声明这两字段；RunDetail 顶部展示 "Deep Audit: N / M"；RunList status tag 识别 `single_step_done` 为成功（绿/蓝）。
- postmortem skeleton 注入 `auditRound` / `maxAuditRounds`，让 `--analyze` 复盘 agent 知道跑了几轮 audit。
- 评估并修复 WI2 deferred 项：`_finalizeWorkflow` 对 `single_step_done` 终态的 step 记录错误标 `failed`。

## Non-Goals

- 不改前端图表（ResourceChart 不动；不新增 audit 趋势线）。
- 不做历史 run 的 audit 计数回填（旧 run-state.json 无字段，显示为 `0` / `—` 即可——设计文档 §4.4 与 WI5 Out of scope 明确）。
- 不改 audit-gate / DRAFT_PLANS 决策逻辑（WI4 范围；本 plan 仅展示，不参与决策）。
- 不改 `--step` / `--from-step` CLI（WI2/WI3 已落地）。
- 不改 events.jsonl 已有事件的 schema（只在 `step_started` payload 加字段，向后兼容；旧 reader 忽略新字段）。
- 不强制让所有 status 在前端都映射成 Naive UI 类型（只补 `single_step_done` 这一个已知遗漏；其他未知 status 仍走 default）。

## Task Route

- Type: `implementation-only change`（纯可观测性展示：在已有事件 / REST 端点 / 前端组件上加字段与 UI 元素；不改决策、不改契约语义）
- Owner Docs: `tools/mission-driver/design/step-execution-and-audit-count-design.md` §4.4；`CONTEXT.md` "Monitor Dashboard 前端" 段（API 端点与 UI 交互契约）
- Skill Selection Basis: `Skill: none` — 改动由设计文档 §4.4 逐条列出（events / run-state / monitor / postmortem / 日志五条），方法直白；前端用已有 Naive UI 组件（n-tag / n-statistic）。无匹配可复用 skill。

## Infrastructure And Config Prereqs

No infra prereqs beyond existing baseline. 引擎核心零 npm 依赖；前端 WI5 用已有 Naive UI 组件，不新增依赖（CONTEXT.md 关键约束）。

## Execution Plan

### Phase 1 - 引擎：step_started payload + 日志后缀

Status: completed
Targets: `tools/mission-driver/src/engine.js`（`run()` 循环 `:1382-1391`）
Skill: none

- Item Types: `Add`
- Prereqs: WI1 已落地（`workflow.auditRound` / `flow.maxAuditRounds` 字段就绪）

- [x] Add: 在 `_emitEvent("step_started", ...)`（`engine.js:1385-1391`）的 payload 中，仅当 `currentStep === (this.flow.auditEntry || this.flow.entry) && (this.delegates.config || {}).isSubflow !== true` 时追加：
      - `auditRound: this.workflow?.auditRound ?? 0,`
      - `maxAuditRounds: this.flow.maxAuditRounds ?? 0,`
      - 守卫条件复用 `_wfOpen`（`:345-346`）的判断，确保只对主流程 auditEntry 步骤生效（子流程内部步骤不加）。
      - 注意：`_emitEvent` 在 `engine.js:1385`（`_wfOpen` `:1384` **之后**），故 `this.workflow.auditRound` 已是递增后的"当前是第 N 轮"值，直接读即可。
      - Skill: none
- [x] Add: 在 `_log("[step N] X (visit #M)")`（`engine.js:1383`）同行末尾，仅当 `currentStep === auditEntry && !isSubflow` 时追加 ` (audit round ${this.workflow?.auditRound ?? 0}/${maxAuditRounds})`。
      - 时序说明：`_log`（`:1383`）在 `_wfOpen`（`:1384`）**之前**调用，此时 `this.workflow.auditRound` 仍是"上一轮结束时的值"，对当前即将开始的 auditEntry 步骤需显示"第 N+1 轮进行中"语义。统一采用：把该 `_log` 行**移到 `_wfOpen` 之后**（紧挨 `_emitEvent` 之前），读已递增的 `this.workflow.auditRound`。这样 events / 日志 / run-state 三处的 `auditRound` 在 audit 步骤期间完全一致（都是"当前进行中的轮次"）。
      - Skill: none

Exit Criteria:

- [x] 主流程进入 DEEP_AUDIT 时，events.jsonl 的 `step_started` 事件 payload 含 `auditRound` 与 `maxAuditRounds`；子流程内部步骤的 `step_started` 不含这两字段。
- [x] 日志中 auditEntry 步骤的 `[step N]` 行末尾含 `(audit round N/M)`。
- [x] 非 auditEntry 步骤的事件与日志保持原样（零回归）。
- [x] `docs/logs/` 更新。

### Phase 2 - 监控 REST：GET /api/runs/:id 与 GET /api/runs 加字段

Status: completed
Targets: `tools/mission-driver/src/monitor.js`（`summarizeRun` `:332-345`、`handleGetRun` `:497-515`）
Skill: none

- Item Types: `Add`
- Prereqs: Phase 1 完成（事件 payload 已含字段，REST 端点同步暴露）

- [x] Add: 在 `summarizeRun`（`:332-345`）返回对象中加 `auditRound: state.auditRound ?? 0` 与 `maxAuditRounds: state.maxAuditRounds ?? 0`（兜底旧 run-state）。
      - Skill: none
- [x] Add: 确认 `handleGetRun`（`:497-515`）返回的 `{ run: state, ... }` 中 `state` 已天然含字段（来自 `readRunState`，已读 run-state.json 全量字段）；无须改动，但在 `synthesizeFromEvents`（`monitor.js:314-330`，由 events 恢复 state 的兜底路径）补默认值 `auditRound: 0, maxAuditRounds: 0`，避免旧 run 无 run-state.json 时前端 undefined。
      - Skill: none

Exit Criteria:

- [x] `GET /api/runs` 列表里每个 run summary 含 `auditRound` / `maxAuditRounds`（旧 run 为 0）。
- [x] `GET /api/runs/:id` 的 `run` 对象含同字段；由 events 合成的兜底 state 也有默认值。
- [x] `test/monitor.test.js`（已存在）若有 snapshot 断言，同步更新或确认未断言精确字段集合。
- [x] `docs/logs/` 更新。

### Phase 3 - 前端：类型声明 + RunDetail 顶部展示 + RunList/AppHeader status tag

Status: completed
Targets: `tools/mission-driver/web/src/types/run.ts`；`tools/mission-driver/web/src/components/run/detail/DefaultRunDetail.vue`；`tools/mission-driver/web/src/views/RunList.vue`（`statusTagType` `:198-206`）；`tools/mission-driver/web/src/components/layout/AppHeader.vue`（`statusTagType` `:62-70`，与 RunList 保持同步——见 `AppHeader.vue:60-61` 的"mirrors the run status mapping used elsewhere"注释）
Skill: none

- Item Types: `Add | Fix`
- Prereqs: Phase 2 完成（REST 端点暴露字段）

- [x] Add: 在 `web/src/types/run.ts` 的 `Run`（`:27-43`）与 `RunSummary`（`:46-59`）interface 中加 `auditRound?: number` 与 `maxAuditRounds?: number`（用 TS `?:` 可选修饰符，旧 run 兜底为 0；字段本身是必加的）。
      - Skill: none
- [x] Add: 在 `DefaultRunDetail.vue` 右侧 content 区顶部（MissionConfig card 之前）新增一个轻量 audit 计数展示：
      - 仅当 `run?.maxAuditRounds` 真值（>0）时渲染；否则不显示（避免对无 audit 概念的 flow 强加 UI）。
      - 采用 `<n-tag size="small" :type="...">Deep Audit: {{ run.auditRound ?? 0 }} / {{ run.maxAuditRounds }}</n-tag>`（与 RunList 的 status tag 风格一致）。
      - 当 `auditRound >= maxAuditRounds` 时 tag type 用 `success`（额度用完）；否则 `info`。
      - **依赖前置**：`DefaultRunDetail.vue:57-66` 当前未 import `NTag`，需在 `naive-ui` import 段追加 `NTag`。
      - Skill: none
- [x] Fix: `single_step_done` 在两处 status→tag 映射都要识别为成功（WI2 deferred 项的完整修复——RunList 与 AppHeader 必须同步，否则 RunDetail 顶部 header 与 RunList 列表显示不一致）：
      - `RunList.vue:198-206` 的 `statusTagType`：加 `if (status === 'single_step_done') return 'success'`。
      - `AppHeader.vue:62-70` 的 `statusTagType`：加同样的 `if (s === 'single_step_done') return 'success'` 分支。
      - 两处语义对齐：`single_step_done` 在 `engine.js:1831-1833` 与 `main.js:643` exitMap 已映射到 exit code 0（视同成功完成），UI 必须一致展示为 success 绿色。
      - Skill: none

Exit Criteria:

- [x] `npm --prefix tools/mission-driver/web run typecheck` 通过（新字段在类型层合法；无未声明使用）。
- [x] `npm --prefix tools/mission-driver/web run build` 通过。
- [x] 手动启动 monitor（`node tools/mission-driver/src/main.js --monitor`）+ 一个有真实 audit 计数的 run-state.json → RunDetail 顶部展示 "Deep Audit: N / M"；RunList **与 RunDetail header（AppHeader）** 的 `single_step_done` run 同时显示为 success 绿色 tag。
- [x] 旧 run（无 auditRound 字段）→ RunDetail 不展示 audit tag（`maxAuditRounds` 兜底 0 时整段隐藏）；RunList/AppHeader 不报错。
- [x] `docs/logs/` 更新。

### Phase 4 - postmortem skeleton 注入 auditRound

Status: completed
Targets: `tools/mission-driver/src/config.js`（`buildRunSkeleton` `:196+`）；`tools/mission-driver/prompts/run-postmortem.md`（skeleton 段消费提示）
Skill: none

- Item Types: `Add`
- Prereqs: Phase 1-3 完成

- [x] Add: 在 `buildRunSkeleton`（`config.js:196`）的 state 段（打印 Mission/Run/Status/Total top-steps/Wall 那段，约 `:205-216`）末尾追加一行：
      - 仅当 `state.maxAuditRounds > 0` 时打印：`Audit rounds: ${state.auditRound ?? 0}/${state.maxAuditRounds}`。
      - 旧 run 无字段时 `?? 0` 兜底，行为等同"未跑 audit"。
      - Skill: none
- [x] Add: 在 `prompts/run-postmortem.md` 的 `<run_skeleton>` 段附近（`:25-39`）加一句提示性说明：
      - "`Audit rounds: N/M` 表示此 run 已执行 N 轮 DEEP_AUDIT（上限 M）。若 N === M 且 status 是 completed，可能由 audit-gate 或 maxAuditRounds 闸门触发——请检查 events.jsonl 中 `via: "audit_gate"` 或 `limitType: "max_audit_rounds"` 事件以区分。"
      - Skill: none

Exit Criteria:

- [x] `test/postmortem.test.js` / `test/analyze-run.test.js`（已存在）若有 skeleton 断言，同步更新；运行通过。
- [x] 一个含 audit 计数的 run-state.json 经 `buildRunSkeleton` 输出含 `Audit rounds: N/M` 行。
- [x] `npm --prefix tools/mission-driver run lint:prompts` 通过。
- [x] `docs/logs/` 更新。

### Phase 5 - WI2 deferred 项：`_finalizeWorkflow` 对 `single_step_done` 的 step 级 status 映射

Status: completed
Targets: `tools/mission-driver/src/engine.js`（`_finalizeWorkflow` `:413-420`）
Skill: none

- Item Types: `Decision | Fix`
- Prereqs: Phase 1-4 完成

- [x] Decision: `_finalizeWorkflow` 对 `single_step_done` 终态的 step 记录标 `failed` 是否修正：
      - **Decision pinned: 选择 A（修正）** — 与 `main.js:643` exitMap 的 exit code 0 语义对齐；events.jsonl 顶层 status 字段保留 `single_step_done`，故事件层契约不变，仅 step 级 status 从 `failed` 改为 `completed`。
      - 现状：`_wfClose(null, status === "completed" ? "completed" : "failed")`——`single_step_done` 走 `failed` 分支，即使该步实际成功执行（WI2 plan 的 Phase 2 Decision 关联副作用段已记录）。
      - 选择 A（修正）：扩展判定为 `_wfClose(null, (status === "completed" || status === "single_step_done") ? "completed" : "failed")`。理由：`single_step_done` 在 `main.js:643` exitMap 已映射到 exit code 0（视同成功），step 记录的 status 应与之一致。
      - 选择 B（保持现状）：单步调试不属于"mission 正常完成"，step 记录标 failed 反映"未走完正常出口"。理由弱，且与 exitMap 0 矛盾。
      - 默认倾向：**选择 A**——与 exitMap 语义对齐，避免 monitor / 复盘看到"成功单步却标 failed"的混淆。
      - 残留风险（选择 A）：若有外部消费方依赖"single_step_done → step.status === failed"信号，会改变行为。缓解：在 events.jsonl 仍保留 `single_step_done` 顶层 status 字段；step 级 status 改成 completed 不影响事件层。
      - Skill: none
- [x] Fix（仅当 Decision 落在 A）：把 `_finalizeWorkflow:415` 的三元改为 `(status === "completed" || status === "single_step_done") ? "completed" : "failed"`。
      - Skill: none
- [x] Add（仅当 Decision 落在 A）：扩展 `test/single-step.test.js`（已存在），断言 `single_step_done` 终态下 run-state.json 中那条单步 step 记录的 `status === "completed"`（而非 failed）。
      - Skill: none

Exit Criteria:

- [x] Decision 段落明确写出选择 A 或 B，并附理由。
- [x] 若选 A：`single_step_done` 终态下 step 记录标 `completed`；新增测试覆盖；`single-step.test.js` 现有断言若依赖旧 `failed` 行为同步更新。
- [x] 若选 B：本 plan 的 Deferred But Adjudicated 段记录该项的延后理由与重新开启触发条件。
- [x] `npm --prefix tools/mission-driver test` 整体绿。
- [x] `docs/logs/` 更新。

### Phase 6 - owner-doc 同步

Status: completed
Targets: `tools/mission-driver/CONTEXT.md`（"Monitor Dashboard 前端" 段或"API 端点"段）
Skill: none

- Item Types: `Fix`
- Prereqs: Phase 1-5 完成

- [x] Fix: 在 `CONTEXT.md` 的 "API 端点" 或 "关键 UI 交互" 段加一条：
      - "`GET /api/runs/:id` 返回的 `run` 含 `auditRound` / `maxAuditRounds`（WI5）；RunDetail 顶部展示 'Deep Audit: N / M'（仅当 maxAuditRounds > 0）。"
      - Skill: none

Exit Criteria:

- [x] `CONTEXT.md` 与新 REST / UI 行为一致。
- [x] `docs/logs/` 更新。

> 注：设计文档 `step-execution-and-audit-count-design.md` 的"Status"字段（现为 `proposal`）是否同步标注"§4.4 已落地"由 WI4/WI5 closure 时统一处理，**不**强制在本 plan 范围；若超期未同步，作为 follow-up 跟踪。

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (task `ses_08172fa44ffeYzNchwyYrsi5kH`) because Phase 3 only patched `RunList.vue:statusTagType` but missed `AppHeader.vue:statusTagType` (`:62-70`) — the latter is rendered on `RunDetail.vue` via `<AppHeader :status="...">` and its own comment (`AppHeader.vue:60-61`) states the mapping intentionally mirrors RunList; the plan's "视同成功完成" goal would be violated by an inconsistent gray tag in the RunDetail header. Non-blocking notes: Phase 1 inline snippet contradicted its own note on pre/post-increment timing; Phase 3 missed `NTag` import requirement for DefaultRunDetail; Phase 6 Targets contained forbidden word "可选"; minor citation drift (`synthesizeFromEvents:314-330`, `RunList statusTagType:198-206`).
- Iteration 1 revision: extended Phase 3 Targets to include `AppHeader.vue:62-70` and split the Fix item into explicit two-place patch (RunList + AppHeader) with shared rationale; rewrote Phase 1 Add #2 to commit to moving `_log` after `_wfOpen` (single resolution, no contradiction); added `NTag` import dependency note to Phase 3 Add #2; corrected citation `synthesizeFromEvents` to `:314-330` and `RunList.vue:statusTagType` to `:198-206`; moved "可选" annotation out of Phase 6 Targets into a non-blocking note; tightened the "two deferred items" wording in Related to distinguish formal Deferred section vs Phase 2 Decision residual-risk note.
- Independent draft review iteration 2: `accept` (task `ses_081650f62ffeZ9rgfPEYE9lfh7`) — all iteration-1 blocking issues verified RESOLVED; AppHeader.vue two-place patch verified (RunDetail.vue:3-9 passes status into AppHeader, AppHeader's own mirror comment confirms intent); Phase 1 "move _log after _wfOpen" verified safe (no reads of mutated state, maxAuditRounds gate at :1374-1380 unaffected). Non-blocking cleanups applied: stale `:198-207` citation in Current Baseline corrected to `:198-206`; tightened TS-syntax "可选" wording in Phase 3 Add #1. Consensus reached, Plan Status → active.

## Closure Gates

- [x] in-scope behavior is complete（事件 payload + 日志后缀 + REST 字段 + 前端类型/UI + postmortem skeleton + WI2 deferred 项决策与（可能的）修复）
- [x] relevant docs are aligned（`CONTEXT.md` Monitor 段更新）
- [x] verification has run（`npm --prefix tools/mission-driver test`；`web run typecheck`；`web run build`；`lint:prompts`）
- [x] no in-scope item downgraded to deferred/follow-up（Phase 5 若选 B，须在 Deferred 段写明理由与触发条件）
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### `_finalizeWorkflow` 对 `single_step_done` 的 step 级 status 映射（若 Phase 5 Decision 落在选择 B）

- Classification: `watch-only residual`
- Why Not Blocking Closure: WI2 plan 已记录该 quirk 并明确"不影响引擎正确性与 exit code"；前端 WI5 已通过 RunList status tag 展示为 success（顶层 status 而非 step 级）。
- Successor Required: yes — 重新开启条件：当 monitor / 复盘场景出现"成功单步却标 failed"造成的实际误读时，重新评估。

### 历史 run 的 audit 计数回填（设计文档 §4.4 Out of scope）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 旧 run-state.json 无字段，回填需扫描 events.jsonl 推断；ROI 低（旧 run 通常已结案）。前端 WI5 已兜底显示为 0 / 隐藏 tag。
- Successor Required: no — 重新开启条件：若出现"必须复盘某旧 run 的 audit 轮次"的硬需求，重新评估（届时可写 `tools/mission-driver/src/backfill-audit-round.mjs` 扫 events.jsonl 的 step_started 事件计数）。

## Closure

Status Note: WI5 closed. All 6 Phases complete. Phase 5 Decision pinned to 选择 A (`_finalizeWorkflow` step-level status `single_step_done → completed`), so the Deferred But Adjudicated entry for that quirk does NOT apply (it is the fallback for 选择 B). The only remaining deferred item is the design-doc `Status: proposal` sync, explicitly noted as out-of-scope per the Phase 6 注. Verification full green: `pnpm --prefix tools/mission-driver test` → 470 pass / 0 fail; `pnpm --prefix tools/mission-driver/web run typecheck` clean; `pnpm --prefix tools/mission-driver/web run build` built; `pnpm --prefix tools/mission-driver run lint:prompts` OK.

Closure Audit Evidence:

- Auditor / Agent: opencode solo cold-replay pass (no second reviewer available; non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback).
- Evidence:
  - Phase 1: `tools/mission-driver/src/engine.js:1411-1432` — `_log` moved after `_wfOpen`; `isMainAuditEntry` guard gates the `(audit round N/M)` suffix and the spread `auditRound` / `maxAuditRounds` fields in the `step_started` payload. Subflow (`isSubflow:true`) skips both.
  - Phase 2: `tools/mission-driver/src/monitor.js:337-354` (`summarizeRun`) and `:314-335` (`synthesizeFromEvents`) both emit `auditRound` / `maxAuditRounds` with `?? 0` fallback. `handleGetRun` (:506-524) unchanged — `state` is the raw `readRunState` object.
  - Phase 3: `web/src/types/run.ts:41-45,64-67` (Run + RunSummary); `web/src/components/run/detail/DefaultRunDetail.vue:25-32` (NTag audit row + `:74` import); `web/src/views/RunList.vue:198-210` and `web/src/components/layout/AppHeader.vue:60-73` both map `single_step_done → 'success'`.
  - Phase 4: `tools/mission-driver/src/config.js:217-223` (`Audit rounds: N/M` line in `buildRunSkeleton`, gated on `maxAuditRounds > 0`); `tools/mission-driver/prompts/run-postmortem.md:31-35` (WI5 note explaining audit-gate vs max_audit_rounds disambiguation). `test/analyze-run.test.js:331-365` pins three WI5 cases.
  - Phase 5: `tools/mission-driver/src/engine.js:413-425` (`_finalizeWorkflow` ternary accepts `single_step_done`); `tools/mission-driver/test/single-step.test.js:83-90` asserts step-level `completed` + workflow-level `single_step_done`.
  - Phase 6: `tools/mission-driver/CONTEXT.md:86` (Monitor Dashboard 前端 / 关键 UI 交互 — WI5 bullet).
  - Roadmap: `docs/backlog/mission-driver-step-audit-roadmap.md` WI5 → `done`; Last Updated 2026-07-21.
  - Daily log: `docs/logs/2026/07-21.md`.
