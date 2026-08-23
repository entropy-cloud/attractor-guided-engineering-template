# 2026-08-23-1621-2 mdcontrol.run 异步作业契约 + 原生端到端 demo（dsh-plugin M2-WI10）

> Plan Status: active
> Mission: dsh-plugin
> Work Item: M2-WI10
> Last Reviewed: 2026-08-23（draft review 2 轮，iteration 2 共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M2-WI10（"mdcontrol.run 异步作业契约：启动即返回 {runId, status}，引擎作为 detached 宿主任务继续；完成可选 followup 回执（先例 draft-job.mjs）；native 形式端到端跑通 demo mission，run-state 形状与 CLI 一致"）
> Related: `docs/architecture/dsh-plugin-packaging.md` §Service Surface（async 契约 / 守卫 / 单 run 语义 owner）；`docs/design/dsh-plugin-integration.md` §Feature Name/Running；`docs/analysis/2026-08-22-0003-verification-harness-design.md` §2 L4 行、§5；前置 `2026-08-23-1447-1`（§Deferred active-run guard 归属本 WI）、`2026-08-23-1621-1`（L3 harness + verify:native 基建）
> Audit: required

## Current Baseline

**service 骨架就绪、路由层与异步契约完全缺席；NativeExecutor/engine-bridge 已具备阻塞式全链：**

- `plugin/dsh/src/service.ts` = mount-log 骨架：`MdControlRoutes` placeholder（`never`），头注即台账——`mdcontrol.*` 路由 / async 契约 / 插件层 active-run 守卫均标注 M2-WI10，skills 标注 M3-WI12。
- `plugin/dsh/src/engine-bridge.ts`：`runNativeMission` 存在但**阻塞式**（`await orchestrateRun` 全程；finally dispose 已保证单次释放）；`bootstrapNativeConfig(projectRoot, args)` → config（含 `runDir`）。异步契约需要一个不等待终态的启动变体——引擎编排入口（`orchestrateRun`）本身可直接以未 await 的 promise 形式在宿主内启动，无需引擎改动。
- async 先例（packaging doc §Service Surface，owner 背书）：引擎 `draft-job.mjs` = detached OS 进程 + state file + monitor polling；**plugin form 的 `mdcontrol.run` = "detached in-host task"**（宿主进程内任务，非 OS 进程）——校验 config → 启动引擎循环 → 立即返回 `{ runId, status: 'started' }`；进度走 `mdcontrol.status`（读 run-state 文件）；终态可选一行摘要回执（`agent.followup`，opt-in）；session 生命周期解耦（关会话不停 run）。
- 守卫裁定（1447-1 §Deferred "插件层 active-run guard"，reopen trigger = 本 WI plan 启动）：**单 run per projectRoot + 宿主侧注册**；比引擎 CLI 宽松的并发语义（reaper 饶并行 run）更严格是有意为之；跨 root 独立。本 plan 必须实现并引用该裁定。
- 路由暴露面未钉：宿主内无现成 `mdcontrol` 暴露面。consumer 先例 `DSH-better-sidebar`（`src/sidechat-routes.ts`）= 自建 **wire method 全名 record → async handlers** + 自有 HTTP API dispatcher（`api[method]`）；缺失服务降级为 wire error（结构化 RPC error）——与 packaging doc "wire error" 词汇一致。本 plugin 的具体暴露面（自有 HTTP dispatcher / 宿主既有 RPC 面 / record 先行 dispatcher 后补）是 Phase 1 Decision（宿主源码只读核查 `~/ai/dsh-src/deepseek-harness`）。
- e2e 入口机制未定：skills 是 M3-WI12，WI10 的 native e2e 需要不经 skill 的路由调用路径（Phase 2 Decision）。
- 形状同一性基建可复用：`plugin/dsh/test/helpers/matrix-harness.mjs` 的 `normalizeRunState` / `normalizeStepRecord`（L2 已落地）；豁免词汇 = R3 §3（sessionId 值语义）+ packaging doc 台账 D1/D2/D3。
- P2 gate（packaging doc §Phased Delivery）："demo mission completes with identical run-state shape; markers parsed; correction-retry exercised once artificially" —— correction-retry 一次人为触发是 P2 收口证据的一部分。
- 红线：预期**零引擎 diff**（`tools/mission-driver/src/` 零改动、零 `@deepseek-ai` 进引擎目录）；`plugin/dsh/package.json` `dependencies` 不动；`verify-age.sh` / `age-ci.yml` 行为不变。
- 前置：`2026-08-23-1621-1`（e2e 腿复用其 verify:native 门禁形态与宿主启动知识；其 Phase 1 组合 Decision 是本 plan Phase 2 的输入）。

## Goals

- `mdcontrol.*` 路由层落地：**run**（异步契约：立即 `{runId, status:'started'}` + in-host detached 任务 + 终态可选回执 + session 解耦）、**status**（读 run-state，零 AI dispatch）、**list**（枚举 runs）。
- 插件层 active-run 守卫：单 run per projectRoot、宿主侧注册、终态/异常均清册、并发拒绝 = 显式 wire error（引用并闭环 1447-1 裁定）。
- demo mission native 端到端跑通（真实宿主）：run-state 归一化形状与 CLI 腿一致；marker 解析 + 一次人为 correction-retry（P2 gate 证据）；monitor 渲染核对（文件格式同一性，人工记录 `docs/testing/`）。
- 全部路由/契约/守卫逻辑在单测域钉住（fake HostContext + fake agents + 路由直调），CI 绿。

## Non-Goals

- skills 注册（M3-WI12）、subagent 描述符注册（M3-WI11）、onboarding 双形式对齐（M3-WI11）。
- `mdcontrol.draft` / `mdcontrol.analyze` 路由包装：显式移出本 plan（裁定见 §Deferred But Adjudicated，后继 = M3 与 WI12 skills 接线同域）。
- 不改引擎、不改 ProcessExecutor、不改 CLI 行为；不做 monitor 前端改动（渲染同一性 = 文件格式同一性 + 人工核对记录，monitor 消费面即 run-state 文件——packaging doc §Service Surface）。
- degradation ladder（`dsh` headless CLI driver）watch-only post-M2（1447-1 台账），不入本 plan。
- model/parseModel 映射 watch-only（1447-2 台账）。
- draft 作业 in-process 化（packaging doc：plugin form 初期保留 detached-node，显式 deferred by owner doc）。

## Task Route

- Type: `implementation-only change`（插件层新功能 + 验证）
- Owner Docs: `docs/architecture/dsh-plugin-packaging.md` §Service Surface（async 契约 / 守卫 / 回执 / session 解耦语义 owner）、§Phased Delivery（P2 gate）；`docs/design/dsh-plugin-integration.md`（§Feature Name、§Running——app-layer 行为面）；R3 §2 L4 行 / §5（e2e 验证策略）
- Skill Selection Basis: `Skill: none`——`docs/skills/README.md` 无匹配可复用方法；行为语义全部来自 owner docs，非技能性知识

## Infrastructure And Config Prereqs

- e2e 腿：模型凭据 + 网络（env 显式开启；复用/姊妹化 1621-1 的 `verify:native` 门禁形态——R3 §5）；宿主内挂载按 `docs/process/dsh-plugin-development-guide.md`（`dsh plugin --profile web add link:…` + restart；`--dump-config` 核对）。
- 单测域：纯 Node、零网络、零凭据（CI 可跑；fake HostContext/agents 注入）。
- 无引擎 env 变更；无数据迁移；run-state 写入沿用引擎既有 `_tmp/<runDir>/` 布局（无新路径契约）。

## Execution Plan

### Phase 1 - 路由层 + 异步 run 契约 + 守卫（单测域）

Status: planned
Targets: `plugin/dsh/src/service.ts`、`plugin/dsh/src/engine-bridge.ts`（或新增 route 模块，位置随 Decision 1 定）、`plugin/dsh/test/`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 无（单测域自足；Phase 2 依赖 1621-1）

- [ ] `Decision`（含 Explore）路由暴露面：只读核查宿主源码（`~/ai/dsh-src/deepseek-harness`，cordis 服务/RPC 注册面）+ better-sidebar 先例，裁定：(a) better-sidebar 式自建 wire-method record + 自有 HTTP dispatcher；(b) 复用宿主既有服务注册面（若源码证实存在且可用）；(c) record 先落 + dispatcher 随 Phase 2 e2e 入口联动后补。裁定含宿主源码依据；`mdcontrol.*` wire method 全名与 payload 形状定稿于本 item。落地时同步收窄 `service.ts` 头注台账（"routes — M2-WI10" → "run/status/list — M2-WI10；draft/analyze — M3"，与 §Deferred 裁定一致，防 in-code 台账漂移）。
  - Skill: none
- [ ] `Decision` runId 语义与状态词汇（**constrained by owner doc**——薄包装、不发明第二状态机为 §Service Surface 明文约束，无需全备选分析）：runId ↔ runDir / run-state 路径映射规则；`{ runId, status: 'started' }` 返回形状定稿；`mdcontrol.status` 读取口径（run-state 终态字段透传，不发明第二状态机）。
  - Skill: none
- [ ] `Add` 异步启动：`bootstrapNativeConfig` 校验失败 = fail-fast wire error（不启动任务、不占用守卫）；启动后任务 promise 悬挂运行（不 await）；终态/异常路径均：清守卫 + 记录终态；executor 释放核对——`runNativeMission` 内部 finally dispose 已单次释放，异步变体不得引入双重 dispose（以单测钉住）。
  - Skill: none
- [ ] `Add` active-run 守卫（1447-1 裁定收编）：in-service 注册表 keyed by resolved projectRoot；占用时并发 run = 显式 wire error；跨 root 独立；成功/异常/超时均清册（引用裁定原文于代码近旁或 plan 记录）。
  - Skill: none
- [ ] `Decision`（含 Explore）+ `Add` 终态回执（opt-in）：请求参数 opt-in 标志；**实现最小回执（一行纯文本摘要）为承诺项，不预设延后逃逸**。机制核查义务：R1 §1 在 Agent 层核实的是 `followup`；`AgentRegistry.get` **未经 R1 核实**（R1 §1 只核实 registry 级 `create`/`resume`），且 packaging doc §Dependency and Version Risk 钉死"插件恰好触及五个宿主调用（create/resume/followup/status/dispose）"——若采纳 `get` 即第六个调用，Decision 必须先对宿主源码（`~/ai/dsh-src/deepseek-harness` `packages/core/agent/`）只读核实其存在与语义，且 Decision 输出必须包含 packaging doc 五调用清单的增补修订；若不采纳 `get`，回执机制限定在已核实调用集内（如 run 启动期持有的 requesting-agent 引用透传）。
  - Skill: none
- [ ] `Add` `status` / `list`：run-state 文件读取 + runs 枚举；零 AI dispatch；文件缺失/进行中的明确返回形状。
  - Skill: none
- [ ] `Proof` 单测（fake HostContext + fake agents，路由直调）：启动即返回（非阻塞机器断言——短时窗内 resolve 且任务仍在推进）；守卫双跑拒绝 + 终态清册 + 异常路径清册；session 解耦（fake session 消失任务不中止）；回执路径触发/不触发（opt-in 双侧）；status 读取（进行中/终态/缺失三态）；**list 枚举用例**（空集 / 仅 running / 含终态 / 混合 + 跨 root 可见性各一）；`npm --prefix plugin/dsh test` 全绿 + `./verify-age.sh` 零回归。
  - Skill: none

Exit Criteria:

- [ ] run / status / list + 守卫 + 回执行为在单测域机器钉住（含非阻塞性与清册不变量）
- [ ] Phase 1 各 Decision（暴露面/runId/回执）裁定与理由**记录于 plan 内**（doc 编辑统一归 Phase 3 收口项，不双记账）；若存在 Phase 1 即需落地的 doc 变更，显式说明并移入对应 item
- [ ] `docs/logs/` updated

### Phase 2 - 原生端到端：demo mission 真宿主跑通 + 双形式形状 diff

Status: planned
Targets: `plugin/dsh/`（e2e 驱动脚本/env 门禁）、`docs/testing/`（dated note）
Skill: none

- Item Types: `Decision | Proof`
- Prereqs: Phase 1 + `2026-08-23-1621-1` 全 Phase

- [ ] `Decision` e2e 入口机制：候选 (a) 宿主内挂载本 plugin + 测试驱动服务/Creator-mode 运行时检查直调路由；(b) 经 1621-1 harness 所驱动的宿主会话间接触发（若暴露面允许）；(c) 进程内 e2e——真实 cordis 运行时构造（非 fake agents 的最小真宿主组合）。裁据：可复现性、env 门禁适配、对 M3 skills 落地的复用价值；**兜底梯**：(c) 为 catch-all（不依赖宿主 UI/暴露面），(a)/(b)/(c) 全部不可行时重开本 Decision 而非降级验证。定稿于本 item。
  - Skill: none
- [ ] `Proof` CLI 腿基线：standalone `run demo`（process 后端）跑通，run-state 采集（归一化前原始件 + 归一化件）。
  - Skill: none
- [ ] `Proof` native 腿：选定入口调 `mdcontrol.run`（demo mission）→ 断言立即返回 `{runId, status:'started'}` → `mdcontrol.status` 轮询至终态 → run-state 采集；monitor dashboard 渲染核对（人工，记录 `docs/testing/`）。
  - Skill: none
- [ ] `Proof` 双腿归一化 diff：`normalizeRunState` 词汇（matrix-harness 复用）断言形状一致；**markers parsed 显式断言**——双腿每个 AI 步的 `marker` 字段存在且值合法（P2 gate "markers parsed" 的直接证据，不以形状 diff 隐含代替）；分歧仅允许出现在台账 D1/D2/D3 + R3 §3 豁免域（sessionId 值、日志内容形状、tool timeout 漂移），超出即缺陷须修复复跑；**一次人为 marker 破坏 → correction-retry 成功路径观察记录**（P2 gate 证据）。
  - Skill: none

Exit Criteria:

- [ ] demo 双腿完成 + 归一化形状一致 + correction-retry 一次人为触发并恢复
- [ ] e2e 程序固化为可复跑脚本/命令（env 门禁内，R3 §5 形态）
- [ ] `docs/logs/` updated

### Phase 3 - 文档收口 + roadmap 回写

Status: planned
Targets: `docs/architecture/dsh-plugin-packaging.md`、`docs/design/dsh-plugin-integration.md`（如行为面对齐需要）、`docs/backlog/dsh-plugin-roadmap.md`、`docs/analysis/2026-08-22-0003-verification-harness-design.md`（L4 注记）
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Proof`
- Prereqs: Phase 2

- [ ] `Proof` owner docs 对齐：packaging doc——§Service Surface as-built（路由表实装范围 + 暴露面/回执裁定 + 守卫落地）、§Dependency and Version Risk 五调用清单增补（**若** Phase 1 回执 Decision 采纳 `get` 为第六调用——见该 item 核查义务）、§Phased Delivery P2 状态更新（**前置条件显式**：WI9 `done` + 本 plan Phase 2 证据齐 → `P2 DELIVERED` 标注，附证据指针；WI9 未 done 不得标注）；R3 §2 L4 行注记（WI10 承接的双形式 diff 落点；skills 入口部分归 M3）；roadmap WI10 `todo → done` + M3 注记：`mdcontrol.draft/analyze` 路由为 **WI12 完成前置**（不新造 work item，挂在既有 WI12 语义下）。
  - Skill: none
- [ ] `Proof` 守卫裁定闭环：1447-1 §Deferred 台账回写（实现落点引用，状态 = 已收编）。
  - Skill: none

Exit Criteria:

- [ ] packaging doc / design doc / R3 / roadmap 与落地状态一致（含 P2 状态标注与证据指针）
- [ ] `docs/logs/` updated（聚合条目，含双腿结果数字与 verification scope 声明）

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd244149cfferPTiWrWHWJ6eYM`，2026-08-23）——B1：回执 item 虚假引用（R1 §1 未核实 `AgentRegistry.get`——registry 级仅核实 create/resume；且 packaging doc 钉死"恰好五个宿主调用"，采纳 `get` 即第六调用须 doc 增补）。修订：引用更正 + 宿主源码只读核查义务入 Decision + Phase 3 条件性五调用清单增补接线。非阻塞 5 项全采纳：删除回执预设延后逃逸（承诺最小回执）、Phase 1/Phase 3 doc 记账分工（不双记账）、e2e 入口 Decision 兜底梯（(c) catch-all，不可行则重开 Decision 而非降级验证）、markers parsed 显式断言、runId Decision 标注 constrained by owner doc。
- Independent draft review iteration 2: `acceptable as-is`（独立 fresh session `ses_fd2403d03ffeQOXkL582M2uwPc`，2026-08-23）——B1/N1–N5 确认全部 resolved（含 live 核证 `AgentRegistry.get` 宿主源码存在但未经 R1 核实、better-sidebar dispatcher 表述、引擎/插件基线全对）；独立裁定两项关键 scope 议题：①`mdcontrol.draft/analyze` 延后裁定 **LEGITIMATE**（roadmap WI10 标签域仅 run+e2e；裁定显式含分类/后继/reopen；1447-1 先例；guide 规则 4 支持双结果面拆分；非 rule-14 材料）——条件 = Phase 3 两处 reconcile（roadmap M3 注记 + packaging doc §Service Surface as-built）必须落地；②本 plan 为 **ONE result surface**（routes+async+guard+e2e 共享同一行为契约与收口判据，e2e 是 P2 gate 验证而非第二结果面）。5 项新非阻塞建议全采纳：Draft Review Record 台账（本节即履约）、list 枚举用例（空/running/终态/混合/跨 root）、M3 后继钉为 WI12 完成前置（不新造 work item）、P2 DELIVERED 前置条件显式含 WI9 done、service.ts 头注台账同步收窄义务。

## Closure Gates

- [ ] in-scope behavior is complete
- [ ] relevant docs are aligned
- [ ] verification has run（单测域：插件链 + `./verify-age.sh` 零回归；e2e 域：env 门禁内双腿绿 + 归一化 diff + correction-retry 记录；命令在各 Proof 项固化）
- [ ] scoped verification is not conflated with full verification——"verification scope limited: e2e 为 env 门禁本地跑，非 CI merge-blocking；monitor 渲染为人工核对记录"显式标注
- [ ] no in-scope item downgraded to deferred/follow-up（`mdcontrol.draft/analyze` 为 draft 阶段显式 scope 裁定 + 后继归属，非执行中降级）
- [ ] independent draft review completed and recorded
- [ ] text consistency verified: status, phases, gates, and log all agree
- [ ] closure audit was independent
- [ ] closure evidence exists in files

## Deferred But Adjudicated

### mdcontrol.draft / mdcontrol.analyze 路由包装

- Classification: `out-of-scope improvement`（后继：M3——与 WI12 skills 接线同域收编）
- Why Not Blocking Closure: roadmap WI10 标签域 = `mdcontrol.run` 异步契约 + native e2e（what/order 的 owner 是 roadmap）；draft（两段式生成 + detached-node 保留）与 analyze（postmortem 编排）各有独立作业语义与验证面，并入将使本 plan 出现第二结果面，违反 plan guide 规则 4（one plan, one result surface）。`service.ts` 头注的 "routes — M2-WI10" 归属经本裁定收窄为 "run/status/list — M2-WI10"（先例：1447-1 将 M1 plan 3 的 "M2-WI6/WI10" 双归属收窄为 WI10 单一归属）。
- Successor Required: `yes`（M3 对应 plan 必须收编 draft/analyze 路由；WI12 skills 接线依赖其存在——Phase 3 roadmap 注记将其钉为 WI12 完成前置）
- Reopen trigger: M3 对应 plan 启动时；或 draft review 认定收窄不成立时（本裁定在 draft review 中接受独立挑战）。

## Closure

Status Note: (open at draft)

Closure Audit Evidence:

- (pending)

Follow-up:

- (none at draft time)
