# 2026-08-23-1621-2 mdcontrol.run 异步作业契约 + 原生端到端 demo（dsh-plugin M2-WI10）

> Plan Status: completed
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

Status: completed
Targets: `plugin/dsh/src/service.ts`、`plugin/dsh/src/engine-bridge.ts`（或新增 route 模块，位置随 Decision 1 定）、`plugin/dsh/test/`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 无（单测域自足；Phase 2 依赖 1621-1）

- [x] `Decision`（含 Explore）路由暴露面：裁定 = **(a) better-sidebar 式自建 wire-method record + 自有 HTTP dispatcher**（双双落地，非 (c) 后补）。宿主源码依据（`~/ai/dsh-src/deepseek-harness` 只读核查，2026-08-23）：better-sidebar `src/index.ts` `buildApi()` = wire method 全名 record（`'sidechat.start': async (payload) => …`）+ `ctx.webServer.register({ kind:'prefix', path:'/sidebar/api', handler })` 自有 HTTP dispatcher（POST + JSON body，`{ok:true,value}`/`{ok:false,error:{code,message}}` 信封，`SidebarError` wire code）；宿主无第二处可复用的通用 RPC 注册面暴露给插件（api-proxy/api 为宿主内部面）。落地：`plugin/dsh/src/mdcontrol-routes.ts` = record 工厂 `createMdControlRoutes({ctx,logger})`（`mdcontrol.run`/`mdcontrol.status`/`mdcontrol.list`）+ `registerMdControlHttpDispatcher()`（`/mdcontrol/api/<method>` prefix，`ctx.get('webServer')` 解析——实测 cordis proxy 对未提供 service 的属性读返回 undefined 不 throw，`get()` 同义；缺 webServer = mount-log 降级不挂载）；`service.ts` apply() = record 构建 + cordis Service 发布（`super(ctx,'mdcontrol')`，AgentRegistry 同型）+ 可选 dispatcher 注册（better-sidebar `ctx.effect` disposer 形式）。`mdcontrol.*` wire method 全名 = `mdcontrol.run` / `mdcontrol.status` / `mdcontrol.list`；payload 形状：run = `{ projectRoot, args?（engine resolveConfig 透传：mission/runDir/driver…）, followup?: { sessionId } }`，status = `{ projectRoot, runId }`，list = `{ projectRoot }`。`service.ts` 头注台账已收窄（"run/status/list — M2-WI10；draft/analyze → M3〔WI12 前置〕"）。
  - Skill: none
- [x] `Decision` runId 语义与状态词汇（constrained by owner doc）：**runId = basename(engine runDir)** = `<projectRoot>/_tmp/<runId>/` 目录名——引擎自身已把同一值写进 `run-state.json.runId`（engine.js `this.runId = basename(cfg.runDir)`），路由 runId、run-state runId、monitor run 身份一个词汇表，status 读取 = `<runDir>/run-state.json` 透传（status/missionName/steps 原样返回，不发明第二状态机）；进行中但文件未写 = `{ found:true, live:true, runState:null, terminal:null }`，未知 runId = `{ found:false }`。`{ runId, status:'started', runDir, startedAt }` 返回形状定稿。同根并发（唯一时间戳 runDir 碰撞源）被守卫排除；e2e 双腿用 `args.runDir` 显式定名。
  - Skill: none
- [x] `Add` 异步启动：`engine-bridge.ts` 新增 `beginNativeMission({ctx,projectRoot,args})` → `{ runId, runDir, config, promise }`——bootstrap + executor 选择在任务 promise 诞生**前**完成（校验失败/agents 缺失 = plain throw → 路由 wire error，守卫未占用）；`orchestrateRun` 以不 await 的 in-host promise 悬挂运行；`promise` 永不 reject（错误捕获为 `{exitCode:1, error}`），finally 内单点 dispose（与 `runNativeMission` finally 同型，异步变体零新增 dispose 位点——单测钉住 disposed 恰好 1 次）。
  - Skill: none
- [x] `Add` active-run 守卫（1447-1 裁定收编）：`ActiveRunGuard`（mdcontrol-routes.ts）in-service 注册表 keyed by `resolve(projectRoot)`；`tryAcquire` 占用（占用期并发 run = `run-in-progress` 显式 wire error，报文含在跑 runId）；`release` owner-checked；成功/引擎失败/任务崩溃/启动异常四路径均清册（单测全覆盖）；跨 root 独立。裁定原文引用于 mdcontrol-routes.ts 头注（"单 run per projectRoot + 宿主侧注册；比引擎 CLI 宽松的并发语义更严格是有意为之；跨 root 独立"——1447-1 §Deferred）。
  - Skill: none
- [x] `Decision`（含 Explore）+ `Add` 终态回执（opt-in）：裁定 = **采纳 `AgentRegistry.get` 为第六宿主调用**。宿主源码只读核实（2026-08-23）：`packages/core/agent/src/index.ts:583` `get(id: SessionId): Agent | undefined`（"Look up a live agent … undefined when no live agent has that id"），返回 bare Agent（无 handle/dispose 能力，`followup` 为已核实的 Agent 层调用）；R1 §1 未核实该调用属实，故 packaging doc §Dependency and Version Risk 五调用清单须增补为六（Phase 3 条件触发，已接线）。实现：payload `followup: { sessionId }` opt-in；终态后 `agents.get(sessionId)` → live 则 `agent.followup(createUserMessage(一行纯文本摘要))`（`[mdcontrol] run <runId> finished: status=… exitCode=… [error=…]`，`createUserMessage` 复用 native-executor 同一 import 面）；session 不再 live（宿主重启/会话关闭）= warn 日志 + 跳过（运行终态已在盘，无损失）；followup 异常 = warn 不影响终态记录/守卫清册。
  - Skill: none
- [x] `Add` `status` / `list`：status = live 记录 + `<root>/_tmp/<runId>/run-state.json` 读取透传（三态：进行中/终态/缺失）；list = disk 扫描 `_tmp/<dir>/run-state.json`（monitor listRuns 先例）合并本实例 live 记录（live 行带 startedAt/terminal，disk 行带 status/missionName），零 AI dispatch。
  - Skill: none
- [x] `Proof` 单测 `plugin/dsh/test/mdcontrol-routes.test.mjs`（17 用例，fake HostContext + fake agents，路由直调 + fake webServer/req/res）：非阻塞机器断言（路由 <150ms 返回，250ms 剧本回合仍在飞、dispose 未发生）；守卫双跑拒绝（wire error 含在跑 runId）+ 终态清册 + 跨 root 独立 + bootstrap 失败/agents 缺失/任务崩溃三异常路径清册；session 解耦（回执目标消失 → run 照常终态 + warn-only 跳过）；回执 opt-in 双侧（触发 = 恰好一行经 `get`→`followup` 的纯文本；未 opt-in = get 零调用）；status 三态；list 空集/仅 running/含终态/混合（disk+live）/跨 root 可见性；dispose 恰一次；HTTP dispatcher 信封/405/404/400/坏 JSON/缺 webServer 降级；payload 校验（args/followup/projectRoot）不占守卫。`npm --prefix plugin/dsh test` **75/75 全绿**（58 存量 + 17 新增，含 manifest/tsc/bundle 新鲜度/smoke-import 全链）；`./verify-age.sh` **exit 0**（L1+L2 GREEN）；另 runtime 冒烟：`service.ts` apply() 于真实 cordis `new Context()` 上发布 `ctx.get('mdcontrol')` 成功（Phase 2 e2e 入口可行性证据）。引擎目录零 diff。
  - Skill: none

Exit Criteria:

- [x] run / status / list + 守卫 + 回执行为在单测域机器钉住（含非阻塞性与清册不变量）
- [x] Phase 1 各 Decision（暴露面/runId/回执）裁定与理由**记录于 plan 内**（doc 编辑统一归 Phase 3 收口项，不双记账）；Phase 1 无需提前落地的 doc 变更（packaging doc 六调用增补为 Phase 3 条件项，本 plan 已接线）
- [x] `docs/logs/` updated（`docs/logs/2026/08-23.md` Phase 1 条目）

### Phase 2 - 原生端到端：demo mission 真宿主跑通 + 双形式形状 diff

Status: completed
Targets: `plugin/dsh/`（e2e 驱动脚本/env 门禁）、`docs/testing/`（dated note）
Skill: none

- Item Types: `Decision | Proof`
- Prereqs: Phase 1 + `2026-08-23-1621-1` 全 Phase

- [x] `Decision` e2e 入口机制：裁定 = **(c) 进程内 e2e——真实 cordis 运行时构造**。裁据与备选处置：(a) 宿主内挂载 + Creator-mode 运行时检查直调——需要交互式宿主 UI/会话，不可在 env 门禁脚本内复现，且 isolate realm 内发布的服务在 headless 组合下无外部暴露面，否决；(b) 经 1621-1 harness 间接触发——sdk-jsonrpc-server 的 wire 面仅 `initialize`/`session/prompt`/`shutdown`（sessions-only），无法调用 `mdcontrol.*` 路由，模型委派触发不确定性高，否决；(c) = `@deepseek-ai/dsh-app-boot` `boot()`（新增 exact `0.1.1-rc.2` devDep，cohort 一致）+ 自有 fixture `plugin/dsh/test/fixtures/e2e.cordis.yml`（16 行 = L3 16 行组合 − sdk-jsonrpc-server + **真实 mission-control service 行**：相对名 `../../src/service.ts` 按 app-boot "Relative entry names resolve against the config directory" 语义落 `plugin/dsh/src/service.ts`，**非 isolate 挂载**——e2e 驱动进程独占整树，`ctx.get('mdcontrol')` 根 realm 可达即入口本身）——真实 cordis + 真实 spine/agents/llm 栈 + 本地脚本化 OpenAI 兼容 SSE 模型端点（确定性 marker 序列，live LLM 无法保证，故 e2e 门禁 keyless/stub-only by design）。可复现性 = 单命令 `npm --prefix plugin/dsh run verify:e2e`（R3 §5 姿态：显式调用、永不接 CI）；M3 复用价值 = 组合 fixture 即 skills 时代集成测试基座。兜底梯合规：(c) 即 catch-all，无需重开。**Phase 2 途中两项真实宿主发现（均为插件层修复，零引擎 diff）**：① 真 cordis ctx 上未声明 `inject` 的 service 属性读抛 "cannot get property … without inject" → `resolveAgentsService()`（`ctx.get(name) ?? 属性读`，三消费点统一）；② 真宿主 agents turn 无 provider/model 即报错（"has no provider/model"）→ NativeExecutor create 增补 `agentOptions { provider, model }`（sdk-jsonrpc-server `createSession` + dsh-headless 双官方先例形态；provider 默认 `deepseek-official`，model 取 `config.nativeProvider/nativeModel` → 引擎 `config.model` → `DSH_MODEL`；parseModel 区分仍忽略——文档化 gap 不变）。
  - Skill: none
- [x] `Proof` CLI 腿基线：真实 standalone 引擎子进程（`tools/mission-driver/src/main.js demo --dir <scratch> --run-dir cli-e2e-mission-driver`，ProcessExecutor 后端），hermetic driver = PATH 前置可执行 `opencode` stub（WI3 白名单钉 driver 名；prompt 末位 argv 到达〔opencode promptMode "arg"〕；`session list` → `[]`）；策略与 native 腿共享 `scripts/e2e-policy.mjs`（STEP-TOKEN 纯函数，无共享状态）。腿内断言全绿：exit 0、run-state 落盘、引擎日志 `correction retry 1/2` + `"banana" not in transitions` 观察到。
  - Skill: none
- [x] `Proof` native 腿：boot 真实运行时 → `ctx.get('mdcontrol')` 直调路由——`mdcontrol.run` **~4ms** 返回 `{runId:'native-e2e-mission-driver', status:'started'}`（返回时 run 仍 live）→ `mdcontrol.status` 轮询至终态 `{exitCode:0, status:'completed'}` → `mdcontrol.list` 双腿 run 均在列；stub 模型恰好服务 4 请求（CHECK → REVIEW 破坏 → correction → DONE）。monitor dashboard 渲染核对（人工，REST 渲染数据 + dashboard HTML 服务核对，无浏览器交互——如实记录）：`GET /api/runs` 双 run 列出（completed/demo/demo）、`GET /api/runs/<id>` 四步全 completed + marker pass + 双后端各自 logFile 命名；**发现**（记录未修——引擎侧，超出本 plan 零引擎 diff 红线）：monitor step-log 端点为 `oc-` 前缀约定专用（`listStepLogs` monitor.js:461 + `handleGetLog` monitor.js:640/646），native 命名工件不进 run-detail log 面板且 `/logs/:step` 404——`docs/bugs/2026-08-23-monitor-native-log-naming.md` 立案 + WI7 "preserving monitor log viewing" 措辞由 Phase 3 修正；run-state 文件格式同一性（R3 §3 组 6）不受影响。
  - Skill: none
- [x] `Proof` 双腿归一化 diff：`normalizeRunState`（matrix-harness 复用）**形状 diff 空**；**markers parsed 显式断言**——双腿每个 AI 步 marker 字段存在且 ∈ 该步 transitions（CHECK/REVIEW/EXEC/DONE 均 pass），REVIEW 破坏后恢复为 pass；**一次人为 marker 破坏 → correction-retry 成功路径观察**——REVIEW 首答 `banana`（非法值、标签完好 → 走 correction 而非 parse fallback），correction re-prompt 恰好 1 次（native 腿 = stub 请求日志 `is not valid` 签名；CLI 腿 = 引擎日志行），运行仍 completed（恢复路径）。分歧零超出豁免域（type-only 字段外无值分歧）。验证固化：`npm --prefix plugin/dsh run verify:e2e`（`scripts/e2e-demo.mjs`，`--keep` 保留 scratch + `e2e-report.json`；三连跑全绿）；记录 `docs/testing/2026/08-23.md`（命令/环境/逐项断言/monitor 发现）。
  - Skill: none

Exit Criteria:

- [x] demo 双腿完成 + 归一化形状一致 + correction-retry 一次人为触发并恢复
- [x] e2e 程序固化为可复跑脚本/命令（`npm --prefix plugin/dsh run verify:e2e`，显式本地调用、零凭据零外网、不接 `verify-age.sh`/`age-ci.yml`——R3 §5 姿态）
- [x] `docs/logs/` updated

### Phase 3 - 文档收口 + roadmap 回写

Status: completed
Targets: `docs/architecture/dsh-plugin-packaging.md`、`docs/design/dsh-plugin-integration.md`（如行为面对齐需要）、`docs/backlog/dsh-plugin-roadmap.md`、`docs/analysis/2026-08-22-0003-verification-harness-design.md`（L4 注记）
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Proof`
- Prereqs: Phase 2

- [x] `Proof` owner docs 对齐：packaging doc——状态标头 P2 PARTIALLY → **P2 DELIVERED**（前置条件显式核对：WI9 `done` ✓〔roadmap 实测〕+ 本 plan Phase 2 证据齐 ✓〔`docs/testing/2026/08-23.md` e2e 三连绿 + 归一化 diff 空 + markers parsed + correction-retry〕）；§Service Surface as-built（路由表实装范围 run/status/list + 暴露面裁定〔cordis Service 发布 + `/mdcontrol/api` HTTP dispatcher 双面〕+ 异步契约 as-built〔beginNativeMission/立即返回/status 透传/list〕+ 守卫落地 + 回执〔opt-in + session 解耦〕+ draft/analyze → M3 注记）；§Dependency and Version Risk 五调用清单增补为**六调用**（+`get`，附宿主源码核实引用——Phase 1 Decision 3 采纳 `get` 的条件项触发兑现）；§Native Dispatch API Chain create 行补 `agentOptions {provider, model}`（e2e 发现 + sdk-server/dsh-headless 双先例）+ Resolve service 行补 cordis inject 语义发现（`resolveAgentsService`）；§Implementation state and boundaries——model 行更新（单 model 流入 agentOptions、parseModel 区分仍忽略）+ **log viewing 措辞修正**（run-state 渲染不受影响；step-log 端点 `oc-` 前缀专用——`docs/bugs/2026-08-23-monitor-native-log-naming.md` 立案 + engine-side widening follow-up）；§Packaging Layout as-built 树（+mdcontrol-routes.ts/e2e-policy.mjs/e2e-demo.mjs/e2e.cordis.yml/mdcontrol-routes.test.mjs/service 转实装标注）；§Version pins +第 17 devDep（`dsh-app-boot`，survey Addendum 2 落档）；§Phased Delivery P2 行 → ✅ delivered + 证据指针（e2e-report/testing note/bug 立案）。design doc §Running 补 as-built 注记（路由层 live、skills 入口仍 M3-WI12、语义 owner 指向 packaging doc）。R3 §2 L4 行注记（实现落点/门禁 `verify:e2e`/绿跑记录/skills 入口归 M3 复用组合 + monitor 边界发现引用）+ §5 L4 门禁落地注记（e2e-report.json = 承诺的 run-state diff 输出；显式本地、不接 CI 实测）。roadmap WI10 `ready → done`（证据摘要内联）+ Last Updated 刷新（M2 全 done / P2 收口）+ M3 WI12 行补完成前置注记（draft/analyze 路由收编，不另立 work item——draft review iteration 2 条件项 ② 兑现）。
  - Skill: none
- [x] `Proof` 守卫裁定闭环：1447-1 §Deferred "插件层 active-run guard" 台账回写——新增"已收编"条目（实现落点 `plugin/dsh/src/mdcontrol-routes.ts` `ActiveRunGuard`、裁定原文引用位置、单测钉住、packaging doc as-built 同步；状态 = 已收编，台账闭环）。
  - Skill: none

Exit Criteria:

- [x] packaging doc / design doc / R3 / roadmap 与落地状态一致（含 P2 状态标注与证据指针）
- [x] `docs/logs/` updated（聚合条目，含双腿结果数字与 verification scope 声明）

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd244149cfferPTiWrWHWJ6eYM`，2026-08-23）——B1：回执 item 虚假引用（R1 §1 未核实 `AgentRegistry.get`——registry 级仅核实 create/resume；且 packaging doc 钉死"恰好五个宿主调用"，采纳 `get` 即第六调用须 doc 增补）。修订：引用更正 + 宿主源码只读核查义务入 Decision + Phase 3 条件性五调用清单增补接线。非阻塞 5 项全采纳：删除回执预设延后逃逸（承诺最小回执）、Phase 1/Phase 3 doc 记账分工（不双记账）、e2e 入口 Decision 兜底梯（(c) catch-all，不可行则重开 Decision 而非降级验证）、markers parsed 显式断言、runId Decision 标注 constrained by owner doc。
- Independent draft review iteration 2: `acceptable as-is`（独立 fresh session `ses_fd2403d03ffeQOXkL582M2uwPc`，2026-08-23）——B1/N1–N5 确认全部 resolved（含 live 核证 `AgentRegistry.get` 宿主源码存在但未经 R1 核实、better-sidebar dispatcher 表述、引擎/插件基线全对）；独立裁定两项关键 scope 议题：①`mdcontrol.draft/analyze` 延后裁定 **LEGITIMATE**（roadmap WI10 标签域仅 run+e2e；裁定显式含分类/后继/reopen；1447-1 先例；guide 规则 4 支持双结果面拆分；非 rule-14 材料）——条件 = Phase 3 两处 reconcile（roadmap M3 注记 + packaging doc §Service Surface as-built）必须落地；②本 plan 为 **ONE result surface**（routes+async+guard+e2e 共享同一行为契约与收口判据，e2e 是 P2 gate 验证而非第二结果面）。5 项新非阻塞建议全采纳：Draft Review Record 台账（本节即履约）、list 枚举用例（空/running/终态/混合/跨 root）、M3 后继钉为 WI12 完成前置（不新造 work item）、P2 DELIVERED 前置条件显式含 WI9 done、service.ts 头注台账同步收窄义务。

## Closure Gates

- [x] in-scope behavior is complete
- [x] relevant docs are aligned
- [x] verification has run（单测域：插件链 75/75 + 引擎 654/654 + `./verify-age.sh` 零回归；e2e 域：`npm --prefix plugin/dsh run verify:e2e` 四连绿 + 归一化 diff 空 + correction-retry 记录 `docs/testing/2026/08-23.md`；命令在各 Proof 项固化）
- [x] scoped verification is not conflated with full verification——"verification scope limited: e2e 为 env 门禁本地跑（scripted stub 模型域），非 CI merge-blocking；monitor 渲染为 REST 渲染数据 + HTML 服务核对（无浏览器交互）；真实模型凭据腿不适用于本门禁（确定性 marker 序列要求，by-design stub-only）"显式标注
- [x] no in-scope item downgraded to deferred/follow-up（`mdcontrol.draft/analyze` 为 draft 阶段显式 scope 裁定 + 后继归属，非执行中降级；monitor step-log `oc-` 前缀边界为 Phase 2 人工核对**新发现**的引擎侧缺陷立案 `docs/bugs/`，非本 plan scope 内条目的降级——run-state 文件格式同一性这一被验对象不受影响）
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### mdcontrol.draft / mdcontrol.analyze 路由包装

- Classification: `out-of-scope improvement`（后继：M3——与 WI12 skills 接线同域收编）
- Why Not Blocking Closure: roadmap WI10 标签域 = `mdcontrol.run` 异步契约 + native e2e（what/order 的 owner 是 roadmap）；draft（两段式生成 + detached-node 保留）与 analyze（postmortem 编排）各有独立作业语义与验证面，并入将使本 plan 出现第二结果面，违反 plan guide 规则 4（one plan, one result surface）。`service.ts` 头注的 "routes — M2-WI10" 归属经本裁定收窄为 "run/status/list — M2-WI10"（先例：1447-1 将 M1 plan 3 的 "M2-WI6/WI10" 双归属收窄为 WI10 单一归属）。
- Successor Required: `yes`（M3 对应 plan 必须收编 draft/analyze 路由；WI12 skills 接线依赖其存在——Phase 3 roadmap 注记将其钉为 WI12 完成前置）
- Reopen trigger: M3 对应 plan 启动时；或 draft review 认定收窄不成立时（本裁定在 draft review 中接受独立挑战）。

## Closure

Status Note: closed 2026-08-23. All three phases executed and verified; M2 milestone complete (P2 DELIVERED). Verification scope limited: e2e 为 env 门禁本地跑（`npm --prefix plugin/dsh run verify:e2e`，scripted stub 模型域——确定性 marker 序列要求使其 by-design keyless-only；真实凭据腿不适用），非 CI merge-blocking（`verify-age.sh`/`age-ci.yml` 零接线、无 env 仍绿实测）；monitor 渲染为 REST 渲染数据 + dashboard HTML 服务核对（无浏览器交互，如实记录于 testing note）。Phase 2 人工核对新发现的引擎侧 monitor step-log `oc-` 前缀边界立案 `docs/bugs/2026-08-23-monitor-native-log-naming.md`（引擎侧修复超出本 plan 零引擎 diff 红线，follow-up 形式记录；run-state 文件格式同一性不受影响，P2 gate 不受阻）。1447-1 §Deferred guard 台账已收编闭环；`mdcontrol.draft/analyze` 后继钉在 M3-WI12（完成前置注记已落 roadmap）。

Closure Audit Evidence:

- Independent closure audit (fresh-session subagent cold replay, session `ses_fd1c67687ffePNysxmxKXIUgG1`, 2026-08-23): **PASS** — deliverables 逐项核验（mdcontrol-routes.ts 路由/守卫/回执/dispatcher、beginNativeMission detached 语义〔guard 先占后启/bootstrap 失败即释/promise 永不 reject/finally 单点 dispose/settle 内 release 先于 postReceipt〕、service.ts 发布 + 台账收窄、17 单测、e2e 三件套 + verify:e2e 接线）；红线四项全净（引擎目录零 diff、引擎 src 零 @deepseek-ai、shipped dependencies 零变化、CI 门禁零接线）；审计会话独立复跑全绿（引擎 654/654 + prompt-check、插件 75/75 含 manifest/tsc/bundle 新鲜度/smoke-import、e2e SUMMARY PASS〔5ms started 返回/4 stub 请求/banana 破坏-恢复/归一化 diff 空〕、verify-age.sh GREEN）；owner docs 六处一致性核验（packaging P2 DELIVERED + 六调用 + as-built 树、roadmap WI10 done + WI12 前置、R3 双注记、testing note、bug 立案、log 三条目含 scope 声明）。非阻塞观察 3 条：①closure gates 未预勾（审计→翻转两步时序，本节即履约后置翻转）；②e2e fixture 行数 prose "15 行" 实为 16 行（off-by-one，已修正 plan 与 log）；③开发期一次 653/654（doc-line-refs 抓行号引用，即时改锚点复跑全绿，非引擎回归）。

Follow-up:

- monitor step-log `oc-` 前缀边界（引擎侧 widening）：`docs/bugs/2026-08-23-monitor-native-log-naming.md`（非本 plan scope 内降级；引擎侧独立小修，含建议修法与验证方式）。
- M3-WI12 收编 `mdcontrol.draft`/`mdcontrol.analyze` 路由（完成前置注记已落 roadmap）。
