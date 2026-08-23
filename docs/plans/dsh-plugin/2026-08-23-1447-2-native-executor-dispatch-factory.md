# 2026-08-23-1447-2 NativeExecutor 原生派发后端 + backend 选择工厂（dsh-plugin M2-WI7）

> Plan Status: active
> Mission: dsh-plugin
> Work Item: M2-WI7
> Last Reviewed: 2026-08-23（draft review 3 轮，iteration 3 共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M2-WI7
> Related: `docs/architecture/dsh-plugin-packaging.md` §Native Dispatch API Chain／§Execution Backend Seam／§Behavioral differences；`docs/analysis/2026-08-22-0001-dsh-host-api-contract-verification.md`（R1 §1 agents 服务）；前置 `2026-08-23-1447-1`（脚手架）；后继 `2026-08-23-1447-3`（L2 矩阵）
> Audit: required

## Current Baseline

**StepExecutor 契约与注入点就绪；宿主 API 已核实；无任何 native 执行路径存在：**

- StepExecutor 契约定型（M1-WI1，`tools/mission-driver/src/step-executor.js` JSDoc）：三方法 `executeAgent(stepName, prompt, system, sessionId, modelOverride, opts)` / `executeParseAgent(stepName, prompt, system, sessionId)` / `executeTool(stepName, command, { timeout })`；`executeAgent` 返回 `{ text, logFile, promptFile, ok, sessionId, exitCode, errorTail, stderrTail }`。引擎只读 `delegates.executor.execute*`（`engine.js:852/:922/:987/:1011`），后端替换零引擎改动。
- 注入形态（M1 定稿，本 plan 必须遵守——deferred 移交条件）：`orchestrateRun({ config, executor })` 接受 executor（`orchestrator.js:554`）；CLI 由 `main.js` 注入 `ProcessExecutor(runner)` 单键；subflow 经 `parentExecutor` 包装链等价迁移（`engine.js:1325-1336`）。**Backend 选择工厂是 M1 plan 1 显式 deferred 项**（`driver=="native" → NativeExecutor` 映射，Successor Required: yes，"M2-WI7 NativeExecutor plan 必须引用本 plan 的接口契约与注入形态决策"）——本 plan 收编。
- 回调与超时契约（live 核实，本 plan 必须满足）：`executeAgent` opts 含 `onStepUpdate`（`step-executor.js:22`）；runner 约定先回调 `{stepName, logFile, promptFile}`（写盘后）再回调 `{stepName, sessionId}`（`runner.js:220-228`）；引擎 subflow 包装依赖该回调（`engine.js:1325-1336`），顶层实时更新经 `config.onStepUpdate = engine._onAgentStepUpdate` 接线——native 后端不实现同约定则 monitor 实时通道（progress channel 1）与 subflow 包装静默退化。步骤超时源：引擎把 `stepDef.timeoutMs` 装入 `agentOpts`（`engine.js:848`）传入 `executeAgent`——watchdog 应消费它，而非另设全局值。
- `executor.js:352-358` 心跳设计注记（M1-WI4）：工具/代理步骤执行路径内的 `sysSnapshot` + `touchActiveRun` 心跳**有意不 embed 门控**，理由是"native 模式永不选中该 backend"。M1 plan 1 deferred 项 2 的 reopen 条款："未来某 backend 与 native 模式共享 executor.js 心跳路径时重开"——本 plan 的 executeTool 决策直接触及该条款（见 Phase 1 Decision 3 与 Deferred 裁定）。
- 宿主 agents 服务 API 已核实（R1 §1，`packages/core/agent/src/index.ts` + `runtime-types.ts`；R2 已对 `dsh-agent@0.1.1-rc.2` 发布 typings 复核一致）：`AgentRegistry.create(options) → AgentHandle { agent, dispose() }` / `.resume({ resumeSessionId })`；`Agent.whenIdle()` 为完成原语（整体静默 promise）；`followup(message)` 排队普通回合；`cancel(cause)` 优雅取消，`dispose()` 停循环 + **删除 store 中的 session**（R1-A2 警告：handle 存活期 = 整个 run，步骤间复用活 handle，中途 dispose 毁掉可恢复性）。宿主自证先例：`dsh-headless` create → submit → quiescence → harvest last non-empty assistant text（R1 §4）。
- 插件层前置：**live 现状 `plugin/` 目录尚不存在**（`ls plugin` → not found）、`native` 执行路径零存在；前置 plan `2026-08-23-1447-1`（active，WI6，draft review 已共识）交付脚手架（`native-executor.ts`/`engine-bridge.ts` 占位、钉版依赖、`plugin/dsh` 测试入口）后，本 plan Phase 1 的 Prereqs 才成立——本 plan 基线以"今日 live + 1447-1 承诺物"双段表述，不把未落地物写成事实。
- 顶层回调接线时序（live 核实，决定回调注入形态）：`config.onStepUpdate = (payload) => engine._onAgentStepUpdate(payload)` 是在 `orchestrateRun` **内部**才赋值的（`orchestrator.js:644`），晚于 executor 构造与注入；且顶层 agent 步的 `agentOpts` 不含 `onStepUpdate`（`engine.js:848-852`），subflow 才经 `parentExecutor` 包装注入 opts 级回调（`engine.js:1325-1336`）。runner 的真实惯例是**调用期读 config**（`runner.js:204-206`），非构造期值捕获——构造期捕获 `config.onStepUpdate` 必然拿到 `undefined`（死通道），顶层步零回调、monitor 实时通道静默退化。
- `native` driver 已是白名单成员（M1-WI3）：`config.js:44` `SUPPORTED_DRIVERS` 含 `native`，仅内部 `allowNativeDriver: true` 放行（`config.js:46-51`，CLI 拒绝）；embed 标志 `cfg.embed === true` 存在且 native 模式应置位（`engine.js:1610` 门控 startup 诊断——M1-WI4 为 native 宿主进程内运行专门设计）。
- watchdog 差异契约（packaging doc §Behavioral differences）：硬超时序列 `agent.cancel(cause)` → grace → `dispose()`，无部分输出宽限。exit 合成契约：完成回合可解析 → `code: 0`；abort/error → `code: 1` + `errorTail`——保证 hoisted `EXIT_MAP` 终态映射与重试预算与 ProcessExecutor 行为一致（§Execution Backend Seam 契约保全规则 3）。
- run-state `steps[].sessionId` 语义差异已声明：opencode `ses_*` vs native childId，presence/type 规则一致即可（R3 §3 断言 3）。

## Goals

- `plugin/dsh/src/native-executor.ts` 完整实现 StepExecutor 三方法：`executeAgent`/`executeParseAgent` 走 create/resume → followup（prompt 带 `[MISSION_DRIVER:<runId>]` 边界前缀，native 下仅作日志/run-dir 可识别性）→ `whenIdle()` → 收割最终 assistant text 作为 `text`；`sessionId` = native childId；exit 合成按契约（完成+可解析 → 0；abort/error → 1 + errorTail）。
- Handle 生命周期 = 整个 run（R1-A2）：**per-run 构造 NativeExecutor（禁跨 run 单例）**，一个 run 一个 handle，步骤间复用活 handle，run 终态/abort 后 `dispose()`；handle 失效（宿主重启等）时 `agents.resume({ resumeSessionId })` 恢复。
- 回调契约对齐：NativeExecutor 镜像 runner 的 `onStepUpdate` 约定（写盘后 `{stepName, logFile, promptFile}`，create 后 `{stepName, sessionId}`）且**调用期解析 config**（runner 同款，防构造期死通道），保 subflow 包装与 monitor 实时通道在 native 模式不退化；watchdog 硬超时源 = 引擎线程的 `opts.timeoutMs`（`engine.js:848`）。
- 硬超时 watchdog：`cancel(cause)` → 有限 grace → `dispose()`，映射为 ProcessExecutor 语义的失败结果（供引擎 transient-fault 分类与重试预算消费）。
- Backend 选择工厂（M1 plan 1 deferred 收编）：`plugin/dsh/src/engine-bridge.ts` 内 `driver → executor` 映射——`native` → `NativeExecutor(ctx.agents)`，其余 → `ProcessExecutor(runner)`（复用 bundle 内 runner）；以 `allowNativeDriver: true` + `embed: true` 调 `resolveConfig`/编排入口。引擎核心零 diff、零 `@deepseek-ai/*` import（选择工厂在插件层，红线保持）。
- 单元测试（无宿主）：fake in-process agents service（Agent doubles：`followup` → scripted 最终文本，`whenIdle()` → resolve，`cancel`/`dispose` 可编程）驱动 NativeExecutor 全部行为分支；fake service 设计为可复用测试基建（WI8 L2 矩阵在其上扩展）。

## Non-Goals

- 不做 L2 双后端全行为矩阵（M2-WI8——本 plan 单测只覆盖 NativeExecutor 单元行为，矩阵经引擎的端到端等价归后继）。
- 不做真实宿主集成与 L3 harness（M2-WI9）、L4 live smoke、demo mission 端到端（M2-WI10）。
- 不实现 `mdcontrol.*` 路由 / 异步作业契约 / 单 run 守卫（M2-WI10）。
- 不做 subagent 描述符注册 `snapshotSubagentDescriptor`（M3-WI11——R1 §7 明示 host source 未读，需先补读 `packages/subagent/`）。
- 不做 `mission.model` → DSH `ModelSelectionRef` 映射（packaging doc §Behavioral differences 已声明为 documented gap：early phases ignore `model`；保持显式忽略不静默伪装）。
- 不改 `tools/mission-driver/src/`（预期零 diff；若接口缝隙暴露，最小修 + 理由记录，且不得触碰 engine 状态机核心 `_result`/`_wfClose`/`_executeSubflowStep`——那属 AI Block Condition，需独立 plan）。
- 不评估 `dsh` headless CLI driver / 降级梯（watch-only residual，post-M2）。

## Task Route

- Type: `implementation-only change`（新后端实现 + 选择工厂接线，契约已由 owner docs 定死）
- Owner Docs: `docs/architecture/dsh-plugin-packaging.md` §Native Dispatch API Chain／§Execution Backend Seam（契约保全规则 1–3）／§Behavioral differences；`tools/mission-driver/src/step-executor.js`（接口契约）；`docs/design/dsh-plugin-integration.md` §Concept Mapping
- Skill Selection Basis: `Skill: none`——契约先行的新增实现，无匹配可复用方法（非重构提取、非审计）；Phase 3 文档核对用 `document-audit-prompt.md` 方法

## Infrastructure And Config Prereqs

- 无真实宿主、无模型凭据、无网络要求（单测全程 fake agents service，纯 Node/TS 编译）。
- `plugin/dsh` devDeps（TypeScript、`@deepseek-ai/dsh-agent` typings）按 1447-1 钉版安装；引擎测试链不依赖插件 node_modules。
- 无 secrets / env 前置；无数据迁移。

## Execution Plan

### Phase 1 - NativeExecutor 实现（dispatch 序列 + handle 生命周期 + watchdog + exit 合成）

Status: planned
Targets: `plugin/dsh/src/native-executor.ts`、`plugin/dsh/test/`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: `2026-08-23-1447-1` 全 Phase（脚手架 + bundle + 钉版 + `plugin/dsh` 测试入口）

- [ ] `Decision` 构造形态与回调注入：`new NativeExecutor({ agents, config })` per-run 构造（engine-bridge 工厂负责，handle 生命周期与 run 绑定）；**回调经 config 引用调用期解析**——每次 `executeAgent` 调用时取 `opts.onStepUpdate ?? config.onStepUpdate`（镜像 `runner.js:204-206` 的调用期读取；opts 级服务 subflow 包装，config 级服务顶层——`orchestrator.js:644` 在 `orchestrateRun` 内部才赋值 config.onStepUpdate，构造期捕获必为 undefined 死通道；实现期若要逐字镜像 runner 的 `typeof === "function"` 守卫形式，以 runner 实现为准——引擎现只产函数值或不设该键，两种形式现行为等价）；`runDir` 统一经 config 引用读取，避免双源。备选：无状态 executor + 每方法传全部上下文——被否决，opts 参数位由引擎契约固定（`step-executor.js:22`），onStepUpdate/runDir 不在参数表内；备选：构造期捕获 `config.onStepUpdate` 值——被否决，接线时序上必然拿到 undefined（见基线"顶层回调接线时序"）。残险：双通道优先级与 runner 行为不一致会双发/漏发回调——单测断言"每步恰好两组回调、顺序正确、opts 级优先"，Phase 2 加 `orchestrateRun` 全链回调到达断言防死通道回归。
  - Skill: none
- [ ] `Decision` 日志/产物落盘策略：ProcessExecutor 的 `logFile`/`promptFile` 是 run-dir 内可查看产物（monitor 与人读）。NativeExecutor 须写等价 run-dir 文件（dispatch 的 prompt 存 `promptFile`，收割 text + 轮次摘要存 `logFile`）以保持 run-state/monitor 兼容——写盘由插件层做，文件命名沿用引擎 run-dir 约定。返回 shape 其余字段合成定稿：`ok = (exitCode === 0)`；`stderrTail` native 下恒 `null`（无子进程 stderr 面，errorTail 已承载错误文本）。备选：`logFile/promptFile` 返回 null（接口允许）——被否决，monitor 日志查看与事后审计退化为无据可查。残险：native 轮次事件与子进程 stdout 格式不同，日志文件内容形状不等价（文件存在性/可读性等价，内容形状不承诺逐字节一致）。
  - Skill: none
- [ ] `Decision` `executeTool` 在 native 模式的实现：**插件层自有最小 spawn 路径**——`child_process` spawn + 超时 + exit code + 输出 tail 捕获，**零诊断**（不跑 sysSnapshot、不触 `~/.mission-driver/active/`）。备选：复用 bundle 内 `executor.js` 工具路径——被否决：其内部心跳 `sysSnapshot` + `touchActiveRun`（`executor.js:352-358`）设计注记明言"native 模式永不选中该 backend"，复用即在 DSH 宿主进程内跑 execSync 快照 + active-run registry 触碰（长工具步如 BUILD_VERIFY 可跨多个心跳周期），正是 M1-WI4 embed 门控要防的宿主侵扰，且直接触发 M1 plan 1 deferred 项 2 的 reopen 条款；备选：给 `executor.js` 心跳对加 embed 门控——被否决：引擎 diff 违背零改动预期、触及 ProcessExecutor 共享路径需全量回归 CLI 行为，收益仅省约 50 行插件层 spawn 逻辑。残险：插件层 spawn 与 executor.js 行为漂移（超时语义/输出 tail 形状）——由 1447-3 L2 矩阵的 tool 步剧本断言钉住。裁定落地后 M1 deferred 项 2 正式收口（见 Deferred 段）。
  - Skill: none
- [ ] `Add` dispatch 序列：`create(options)`（`sessionId` 生成 childId、`meta { cwd, origin: 'subagent', delegationDepth, agentPreset }`、`signal` = `opts.timeoutMs` 换算的硬超时）→ prompt 组装（`[MISSION_DRIVER:<runId>]` 边界前缀 + 模板输出）经 `followup(createUserMessage(...))` → `await whenIdle()` → 从 `agent.session.events` 收割最终非空 assistant text；`onStepUpdate` 双点回调（写盘后 `{stepName, logFile, promptFile}`、create 后 `{stepName, sessionId}`，镜像 `runner.js:220-228`）；`executeParseAgent` 同链路（cheap parse model 差异按 documented gap 处理——native 下 `parseModel` 同样忽略，Phase 3 文档同步）。
  - Skill: none
- [ ] `Add` handle 生命周期管理：per-run handle 持有（步骤间复用不 dispose）；run 终态/abort → `dispose()`；`dispose` 前置校验防双重释放；handle 冷却（`followup` 抛失效错误）→ `agents.resume({ resumeSessionId })` 重建。cancel 路径：硬超时（源 = `opts.timeoutMs`）`cancel(cause)` → 有限 grace → `dispose()`，产出 `code: 1` + `errorTail` 结果对象（`ok=false`、`stderrTail=null`）。
  - Skill: none
- [ ] `Proof` 单元测试（fake agents service，`plugin/dsh` 测试入口，1447-1 建立）：正常回合（scripted text 收割 + childId 回传 + run-dir 文件写出 + 双点回调各一次且顺序正确）；**回调调用期解析**（构造后变更 `config.onStepUpdate`，回调仍到达——钉死通道风险）；opts 级优先于 config 级（subflow 形态）；无 marker 文本原样透传（marker 解析留在引擎，契约保全规则 1）；cancel/dispose 序列与双重 dispose 防护；create 失败（服务缺失 → 结构化 wire error 透传）；resume 恢复分支；`executeTool` 插件层 spawn 路径（含超时与失败 tail）。全绿。
  - Skill: none

Exit Criteria:

- [ ] 三方法行为分支全绿；exit 合成契约（0/1 + errorTail）与 handle 生命周期（无中途 dispose、终态必释放）有断言钉住
- [ ] 日志落盘决策及其边界（内容形状不等价声明）在 plan/文档定稿
- [ ] `docs/logs/` updated

### Phase 2 - engine-bridge 选择工厂 + native config 接线

Status: planned
Targets: `plugin/dsh/src/engine-bridge.ts`、`plugin/dsh/test/`
Skill: none

- Item Types: `Add | Decision | Proof`
- Prereqs: Phase 1

- [ ] `Add` 选择工厂：`resolveExecutor({ driver, ctx, config })`——`driver === "native"` → **per-run 构造** `new NativeExecutor({ agents: ctx.get('agents'), config })`（禁跨 run 单例——handle 生命周期 = 一个 run；服务缺失降级为清晰 wire error，不静默回退 ProcessExecutor）；其余 → `new ProcessExecutor(createRunner(...))`（复用 bundle 内 runner）。工厂在插件层 `engine-bridge.ts`，引擎核心不感知（M1 deferred 项收编：映射规则落地，引用 M1 接口契约与 `orchestrateRun({ config, executor })` 注入形态）。`service.ts` 本 plan 不触（路由属 WI10）。
  - Skill: none
- [ ] `Add` native config 接线：engine-bridge 以 `allowNativeDriver: true` 走 `resolveConfig`（放行 `native`）+ `embed: true`（关 startup 诊断，M1-WI4 门控消费）+ `driver: "native"` 默认；编排调用复用 bundle 内 `orchestrateRun`。CLI 路径零改动（`main.js` 不触）。
  - Skill: none
- [ ] `Decision` 不静默回退原则：`ctx.get('agents')` 缺失或 native create 失败时，错误面向调用方显式抛出（wire error），不做 ProcessExecutor 降级——降级梯（`dsh` headless CLI driver）是显式独立决策（watch-only residual），不由异常路径隐式触发。
  - Skill: none
- [ ] `Proof` 工厂单测：三 driver 值（opencode/pi/cline → ProcessExecutor；native → NativeExecutor）+ agents 服务缺失 → 显式错误；`resolveConfig` 在 `allowNativeDriver: true` + `embed: true` 下产出预期 config 形状（复用引擎 config 测试惯例）；**`orchestrateRun` 全链冒烟（native 腿 + fake agents service）**：顶层 agent 步的 `{stepName, logFile, promptFile}` 与 `{stepName, sessionId}` 回调经 `config.onStepUpdate` 通道到达 engine `_onAgentStepUpdate`（run-state `steps[]` 收到更新）——钉死构造期死通道类回归。CLI 侧 `native` 拒绝行为回归（M1 既有 `driver-whitelist.test.js` 复跑）。
  - Skill: none

Exit Criteria:

- [ ] 工厂映射 + config 接线落地且单测绿；CLI 行为零变化（白名单测试复跑绿）
- [ ] 引擎目录 `git diff` 为空（或最小修有记录）；`@deepseek-ai/*` 零进入 `tools/mission-driver/src/`
- [ ] `docs/logs/` updated

### Phase 3 - 文档同步 + roadmap 回写

Status: planned
Targets: `docs/architecture/dsh-plugin-packaging.md`、`docs/backlog/dsh-plugin-roadmap.md`、（如契约有补充）`docs/architecture/mission-driver-baseline.md`
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Proof`
- Prereqs: Phase 1、Phase 2

- [ ] `Proof` 文档收口：packaging doc §Native Dispatch API Chain 由设计转"已实现（P2 部分）"并记录实现边界（model + parseModel gap、日志内容形状边界、executeTool 插件层最小 spawn 决策、不静默回退原则）；§Behavioral differences "Model selection" gap 行扩展为显式覆盖 `mission.model` 与 `parseModel`（cheap-parse 区分 native 下同样忽略）；§Execution Backend Seam 的选择工厂句更新为已落地；roadmap WI7 `todo → done`。baseline（standalone 行为 owner）预计无需改动——显式核对并记录结论（`No owner-doc update required` 或最小更新）。
  - Skill: none
- [ ] `Proof` 全量验证：引擎 `pnpm --prefix tools/mission-driver test` 零回归 + 插件测试入口全绿 + typecheck 绿。verification scope 显式注明：无真实宿主（L3 归 WI9），native 端到端（demo mission）归 WI10。
  - Skill: none

Exit Criteria:

- [ ] packaging doc / roadmap 与实现一致；baseline 核对结论有记录
- [ ] 全量验证绿且 scope 声明在案
- [ ] `docs/logs/` updated（聚合条目）

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd29cb0a1ffeNgSd1bpRNym4UJ`，2026-08-23）——4 阻塞项：B1 基线把 1447-1 未交付物写成事实（`plugin/` live 不存在，"占位骨架"表述失实）；B2 executeTool 决策复用 executor.js 工具路径直接抵触 `executor.js:352-355` 设计注记并触发 M1 plan 1 deferred 项 2 reopen 条款未裁定，且"（或其最小等价）"违禁模糊；B3 `onStepUpdate`/`runDir` 注入缺口（runner.js:220-228 双点回调约定、subflow 包装依赖、构造形态未定）；B4 测试位置 Target 与 Proof 内部矛盾且无 Decision 裁定。6 项非阻塞：subflow 包装行号漂移（→`engine.js:1325-1336`）、`ok/stderrTail` 合成未述、parseModel gap 行扩展、service.ts"如需"模糊、watchdog 超时源（`opts.timeoutMs`，`engine.js:848`）、工厂须 per-run 构造防单例陷阱。修订：B1 基线改双段表述并恢复被并入挤掉的白名单 bullet；B2 决策定稿插件层最小 spawn（零诊断）+ Deferred 段正式收口 M1 deferred 项 2；B3 新增 Phase 1 Decision 1（构造形态 `{agents, runDir, onStepUpdate}` + 双点回调 + 优先级残险断言）；B4 测试位置定稿 `plugin/dsh/test/`（1447-1 建立入口）。非阻塞 6 项全采纳。
- Independent draft review iteration 2: `needs revision`（独立 fresh session `ses_fd294f5d2ffewzBZE5AIuyFDWn`，2026-08-23）——B1–B4 全部确认 resolved（基线双段表述/白名单 bullet 恢复、executeTool 定稿 + M1 deferred 项 2 收口忠实、构造形态 + 双点回调镜像 runner.js:220-228、测试位置一致且衔接 1447-1 入口）。新阻塞 1 项 N1：Phase 1 Decision 1 的构造期捕获 `config.onStepUpdate` 是死通道——`config.onStepUpdate` 在 `orchestrateRun` **内部**才赋值（`orchestrator.js:644`），晚于 executor 构造；顶层 agent 步 `agentOpts` 不含 `onStepUpdate`（`engine.js:848-852`）→ 顶层零回调、monitor 实时通道静默退化，恰违本 plan 自己的 Goal 与基线要求；runner 真实惯例是调用期读 config（`runner.js:204-206`）；且 Phase 1/2 proof 均未覆盖全链，缺陷不可被现有证明捕捉。3 项非阻塞：基线对 1447-1 的状态引用过时（draft→active）、基线 "Decision 2" 应为 Decision 3、Phase 2 Targets 漏 `plugin/dsh/test/`。修订 N1：构造形态改 `new NativeExecutor({ agents, config })`，回调 `opts.onStepUpdate ?? config.onStepUpdate` 调用期解析（镜像 runner），基线新增"顶层回调接线时序"bullet；Phase 1 Proof 加"构造后变更 config.onStepUpdate 回调仍到达 + opts 级优先"断言；Phase 2 Proof 加 `orchestrateRun` 全链回调到达冒烟（钉死通道回归）；非阻塞 3 项全采纳。
- Independent draft review iteration 3: `acceptable as-is`（独立 fresh session `ses_fd2911badffeSrHMPMt2B6EG92`，2026-08-23）——N1 确认 resolved（构造形态 `{agents, config}` + 调用期解析逐点核验：Decision 1 / 基线接线时序 bullet / Phase 1 变更后回调到达与 opts 优先断言 / Phase 2 orchestrateRun 全链冒烟 / 工厂与 Decision 1 形状一致，行号 live 抽核全对）；round-2 三项非阻塞确认全部落实；无新阻塞项；Goals/Phases/Exit Criteria/Closure Gates 一致性、item types、Status/Targets/Skill/Prereqs、无模糊措辞全过。1 项微观察采纳：`??` 形式与 runner 的 `typeof === "function"` 守卫在"引擎永不产非函数真值"前提下行为等价——Decision 1 补注"实现期以 runner 实现为准"保持镜像声明精确。共识达成，plan 转 active。

## Closure Gates

- [ ] in-scope behavior is complete
- [ ] relevant docs are aligned
- [ ] verification has run（引擎全量测试零回归；插件单测 + typecheck；命令在 Phase Proof 项固化）
- [ ] scoped verification is not conflated with full verification——"verification scope limited: fake-agents 单元域，无真实宿主/无 L4"显式标注
- [ ] no in-scope item downgraded to deferred/follow-up
- [ ] independent draft review completed and recorded
- [ ] text consistency verified: status, phases, gates, and log all agree
- [ ] closure audit was independent
- [ ] closure evidence exists in files

## Deferred But Adjudicated

### Backend 选择工厂（自 M1 plan 1 移交——本 plan 收编，收编后不再是 deferred）

- Classification: 已收编入 Phase 2（记录以闭环 M1 deferred 台账）
- Why Not Blocking Closure: n/a（本 plan 交付）
- Successor Required: `no`（由本 plan Phase 2 落地）
- Reopen trigger: n/a

### executor.js 心跳级 sysSnapshot / touchActiveRun 的 embed 门控（自 M1 plan 1 deferred 项 2 移交——reopen 条款被本 plan 触发，正式裁定）

- Classification: `watch-only residual`（维持关闭，且经本 plan 裁定后 native 路径与 executor.js 心跳**确认不共享**）
- Why Not Blocking Closure: Phase 1 Decision 3 定稿插件层自有最小 spawn 路径（零诊断），executor.js 心跳路径在 native 模式下保持不可达——M1 plan 1 的 reopen 前提"某 backend 与 native 模式共享 executor.js 心跳路径"经评估后**不成立**，原 watch-only 裁定维持，无需引擎改动。
- Successor Required: `no`
- Reopen trigger: 未来若插件层 spawn 路径被替换为复用 `executor.js`（或任何 native 后端开始共享该心跳路径）时，必须先重开本条并给心跳对加 embed 门控。

### model / parseModel → DSH ModelSelectionRef 映射

- Classification: `watch-only residual`（packaging doc §Behavioral differences 声明的 documented gap，本 plan 扩展覆盖 parseModel）
- Why Not Blocking Closure: early phases 显式忽略 `mission.model` 与 `parseModel` 是 owner doc 已接受的行为；映射属后期 phase。
- Successor Required: `no`（后续 phase 自然收编）
- Reopen trigger: DSH `ModelSelectionRef` 稳定且 plugin 用户提出 model 选择需求时。

## Closure

Status Note: pending

Closure Audit Evidence:

- Auditor / Agent: pending
- Evidence: pending

Follow-up:

- (none at draft time)
