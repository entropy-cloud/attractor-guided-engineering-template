# 2026-08-23-1300-1 StepExecutor seam + ProcessExecutor（dsh-plugin M1-WI1）

> Plan Status: completed
> Mission: dsh-plugin
> Work Item: M1-WI1
> Last Reviewed: 2026-08-23（draft review 2 轮见 Draft Review Record；closure audit 独立复验通过，见 Closure）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M1-WI1
> Related: `docs/architecture/dsh-plugin-packaging.md` §Execution Backend Seam / §Phased Delivery P1；`docs/design/dsh-plugin-integration.md` §Dual-Form Product；后续 `2026-08-23-1300-2`（WI2）、`2026-08-23-1300-3`（WI3-WI5）
> Audit: required

## Current Baseline

**semm 已事实存在（duck-typed delegates 注入），本 plan 只将其形式化为命名接口：**

- `FlowEngine` 经 `delegates` 消费三个执行入口（构造于 `engine.js:307-310`）：
  - `delegates.runAgent(stepName, prompt, system, sessionId, modelOverride, opts)` — agent 步骤，`_executeAgentStep`（`engine.js:843`）；runner 返回 `{ text, logFile, promptFile, ok, sessionId, exitCode, errorTail, stderrTail }`（`runner.js:260`）
  - `delegates.runParseAgent(stepName, prompt, system, sessionId)` — 无 marker 解析回退（`engine.js:900/:909`）+ marker 修正重试（`engine.js:974`）；实现在 `runner.js:301-303`（路由 parseModel）
  - `delegates.runTool(stepName, command, { timeout })` — 工具步骤，`_executeToolStep`（`engine.js:998`）；返回 `{ ok, logFile, ... }`（`runner.js:274-292`）
- 接线点：`main.js:680-725`（`runAgent: runner.runAgent, runTool: runner.runTool, runParseAgent: runner.runParseAgent`）；runner 由 `createRunner(config)` 构造（`runner.js:294-310`），内部组合 `executor.js`（spawn / 心跳 / 60min 看门狗 / SIGTERM）。
- **subflow 包装链**：`_executeSubflowStep` 在子引擎 delegates 上包装 parent `runAgent`，让 in-flight 更新（logFile/sessionId via onSpawn）路由回父 run-state（`engine.js:1283-1317`）。seam 改造不得破坏该链。
- **第四个 delegate `runScript`**（`engine.js:1053-1071`，in-process script 覆盖钩子）今日无生产接线（main.js 与测试均未注入）——它不是 backend 执行入口，明确留在 StepExecutor seam 之外、现状不动。
- **测试缝**：`main.js:23-34` `__setRunnerFactoryForTest`（`draft-brief.test.js` 依赖）；`runner-routing.test.js` / `pi-driver-config.test.js` 已有 fake-executor 注入先例。
- gap：semm 为隐式约定，无命名接口、无文档化 backend 边界；`docs/architecture/module-boundaries.md:9` 仍写 engine core "in-process: not exported (engine runs as a process, not a library)"，与 packaging doc §Scope and Boundary Impact 的修订要求冲突。
- 现有验证基线：`pnpm --prefix tools/mission-driver test`（执行时先记录改前基线用例数与失败集）。

## Goals

- 命名接口 **StepExecutor** 落地，形式化现有三入口 seam；**ProcessExecutor** 包装现有 runner+executor 一对，**行为逐字节不变**（byte-for-byte，含 dry-run mock 路径；可观测判定以归一化意义下的 diff 为准，见 Phase 1 Exit Criteria）。
- engine 消费点等价改造后全量测试零回归；dry-run 冒烟输出与改前一致。
- `module-boundaries.md` 引擎核心行修订（库形式可用，CLI 仍默认）——WI5 中由本变更触发的切片，同变更落地。

## Non-Goals

- 不实现 NativeExecutor（M2-WI7，插件层）。
- 不引入 backend 选择工厂 / `native` driver 值（WI3 + M2-WI7；本 plan 不改 config 解析与校验行为）。
- 不改 marker 契约、run-state 形状、EXIT_MAP 位置（WI2）。
- 不动 monitor.js / draft-job.mjs / spawner.mjs / env-loader.js。
- 不改 CLI surface（flags、help、退出码）。

## Task Route

- Type: `architecture change`（引擎公共边界：进程内库化 + 模块边界文档修订）叠加行为保持的结构重构
- Owner Docs: `docs/architecture/dsh-plugin-packaging.md` §Execution Backend Seam（接口契约 owner）、`docs/architecture/module-boundaries.md`、`docs/architecture/mission-driver-baseline.md` §Public Exports
- Skill Selection Basis: 行为保持结构重构 → Phase 1 用 `code-refactor-prompt.md`（required inputs 齐备：target area = engine delegates seam、invariants = 行为逐字节不变、verification commands = 全量测试 + dry-run 冒烟）；Phase 2 为文档同步，`Skill: none`

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（零 DSH 依赖；引擎零 npm 依赖不变式保持——不新增任何 runtime import）。

## Execution Plan

### Phase 1 - StepExecutor 接口 + ProcessExecutor 包装 + engine 消费点等价改造

Status: completed
Targets: `tools/mission-driver/src/`（新增 seam 模块；`engine.js` 消费点；`main.js` 接线）、`tools/mission-driver/test/`（新增 seam 契约测试）
Skill: code-refactor-prompt.md

- Item Types: `Add | Decision | Proof`
- Prereqs: 无（本 mission 首个 plan）

**接口契约（plan-guide Rule 6 对重构/提取 plan 的强制项）：**

```
StepExecutor（JSDoc 命名接口，三能力方法，签名与现 delegates 逐参一致）
  executeAgent(stepName, prompt, system, sessionId, modelOverride, opts)
    → { text, logFile, promptFile, ok, sessionId, exitCode, errorTail, stderrTail }
  executeParseAgent(stepName, prompt, system, sessionId) → 同上返回形状
  executeTool(stepName, command, { timeout }) → { ok, logFile, ... }（透传 executor 结果）
ProcessExecutor implements StepExecutor：持有一个 runner 实例，三方法一对一转发，零行为逻辑
注入形态：delegates.executor（单键对象）替代现三键；engine 内三处消费点改读 executor 方法
其余 delegates 键（vars/config/expressionFuncs/loadSubFlow/logFile/callLog 等）原样保留不动；
engine.js:900 的 `if (!marker && this.delegates.runParseAgent)` 存在性守卫在命名接口下恒真
（等价：main.js 今日总是注入三键，守卫从未为假）
```

- [x] `Decision` 接口形状：packaging doc 草图为单 `execute(stepCtx) → { code, text, errorTail, sessionId }`，现实是三个语义不同的入口（agent / parse-agent / tool，返回形状各异）。决策：三方法命名接口（参数与返回逐字段同现状）。备选：强推单 execute(stepCtx) 归一形状——被否决，因归一化 runTool 的 `{ok, logFile}` 与 agent 的 `{text, exitCode, ...}` 会改变消费端行为，违反"逐字节不变"。残险：M2 NativeExecutor 实现三方法而非单方法；packaging doc 草图句在 WI5 文档收口时加一句"接口以三能力方法落地"的锚注。若 draft review 判定必须回改 packaging doc 草图为准，在本 plan 内重新裁决并同步 owner doc。
  - Skill: none
- [x] `Decision` 注入形态：`delegates.executor`（单键）vs 保留 `runAgent/runParseAgent/runTool` 三键由 main.js 从 executor 展开。决策：单键 executor——backend 是一个整体替换单元（M2 NativeExecutor 整对象注入），三键展开会让"换 backend"变成三处替换。约束：subflow 包装链（`engine.js:1284-1312` 包装 parent runAgent）与 `__setRunnerFactoryForTest` 缝必须等价保留（包装对象改包 `parentExecutor.executeAgent`）。
  - Skill: none
- [x] `Add` 新 seam 模块（文件名 Decision：`src/step-executor.js`；备选并入 runner.js 被否决——runner 是 opencode 进程管理实现，接口契约应独立于任一实现，M2 打包清单需要稳定引用点）：StepExecutor JSDoc 接口 + ProcessExecutor 类。
  - Skill: none
- [x] `Add` `engine.js` 三处消费点等价改读 `this.delegates.executor.executeAgent / executeParseAgent / executeTool`；`_executeSubflowStep` 子引擎 delegates 的 parent 包装等价迁移；不触碰任何 marker 提取 / 重试 / 退避逻辑。
  - Skill: none
- [x] `Add` `main.js` 接线：`createRunner(config)` 产物包进 `new ProcessExecutor(runner)` 注入 `delegates.executor`；dry-run mock 路径经 ProcessExecutor 原样转发（mock 语义不变）。
  - Skill: none
- [x] `Proof` 新增 seam 契约测试（`test/step-executor.test.js`，node:test，fake-runner 模式复用 `pi-driver-config.test.js` 先例）：(a) ProcessExecutor 三方法对 runner 的参数转发逐参一致；(b) 返回对象逐字段透传（含 `promptFile`/`stderrTail` 等次要字段）；(c) engine 经 `delegates.executor` 跑一个最小 flow（复用既有最小 flow 夹具），agent/tool 步骤结果与改前逐字段一致——对比基线 = 改前同夹具运行的字段捕获（git-stash 法，与全量 Proof 项同一基线流程）。
  - Skill: none
- [x] `Proof` 全量 `pnpm --prefix tools/mission-driver test`：改前先跑一次记录基线（用例数 + 失败集），改后 no new failures（预存失败按 pi-driver plan 的 git-stash baseline 法甄别）。
  - Skill: none

Exit Criteria:

- [x] 行为不变（归一化后逐字节一致）：`node tools/mission-driver/src/main.js demo --step CHECK --dry-run --no-monitor --run-dir <固定临时目录>` 改前/改后 stdout，经固定归一化管线（剥离行首 `[HH:MM:SS]` 时间戳前缀、剔除 `Elapsed:` 行、`Log:` 行的 runDir 路径 token 归一）后 diff 为空。归一化管线本身以 3-4 行 sed 脚本形式固化进日志（stdout 含墙钟时间戳与运行时长，裸 diff 恒不为空——见 draft review iteration 1 B1）。改前/改后各用**不同的固定 runDir**（如 `_tmp/diff-before` / `_tmp/diff-after`，token 归一已覆盖），保持基线工件互不污染。
- [x] 全量测试零回归（基线对比法，结果记入日志）
- [x] subflow 路径既有用例全绿（`_executeSubflowStep` 包装链等价迁移的直接证据）
- [x] `docs/architecture/module-boundaries.md` 引擎核心行修订：in-process 边界从 "not exported" 改为 "importable as a library behind the injected StepExecutor seam；CLI 仍是默认形态"；`docs/architecture/mission-driver-baseline.md` §Public Exports 增补 seam 模块导出
- [x] `docs/logs/` 更新

### Phase 2 - roadmap 回写 + 日志

Status: completed
Targets: `docs/backlog/dsh-plugin-roadmap.md`、`docs/logs/2026/08-23.md`
Skill: none

- Item Types: `Add`
- Prereqs: Phase 1 全部 exit criteria 达成

- [x] `Add` roadmap M1-WI1 状态回写 `ready → done`（起草阶段已随 draft review 通过置 `ready`；引用本 plan 与日志为证据）。
  - Skill: none

Exit Criteria:

- [x] roadmap 仅 M1-WI1 行变更，其余 WI 状态不动
- [x] `docs/logs/2026/08-23.md` 按 `00-log-writing-guide.md` 格式追加本 plan 条目

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd2fdabbfffemX5118H6PvqvhO`，2026-08-23）—— B1（阻塞）：Phase 1 Exit Criteria "dry-run stdout 裸 diff 为空" 不可达成——stdout 含墙钟时间戳（`engine.js:330-333` `_log` 前缀）、`Elapsed:` 行（`main.js:768`）、时间戳 runDir（`config.js:735-737`），实现再完美也 diff 非空。已修：Exit Criteria 改为固定 `--run-dir` + 归一化管线（剥 `[HH:MM:SS]` 前缀 / 剔 `Elapsed:` 行 / runDir token 归一，sed 脚本固化进日志）。非阻塞采纳 5 项：基线补第四个 delegate `runScript`（`engine.js:1053-1071`，无接线，明确留在 seam 外）；行距收紧（subflow 包装 `1283-1317`、`runner.js:294-310`）；接口契约补"其余 delegates 键不动 + `engine.js:900` 守卫恒真等价"两句；Deferred 第 2 项补 Reopen trigger；Proof (c) 对比基线用 git-stash 捕获法坐实。其余检查项全过（one result surface / Rule 9 三 Decision / 无违禁词 / 受保护区覆盖充分 / 与 -2 -3 排序一致）。
- Independent draft review iteration 2: `acceptable as-is`（独立 fresh session `ses_fd2f35b8dffefqOYH36tLg3F80`，2026-08-23）—— iteration 1 B1 确认解决并经 live code 逐项核实：归一化覆盖完备（`localTimeStr()` 仅 `engine.js:331` 一处产 `[HH:MM:SS]` 前缀、history 回放同源；`Elapsed` 唯一 stdout 消费点 `main.js:768`；`--run-dir` 于 `main.js:916/:944` 两处声明、`missions/demo.json` 存在、mock 框输出走 stderr 不入 stdout 域）；无残留非确定性；应用项复核全过。采纳两条非阻塞措辞建议：Goals 补"归一化意义下"限定；改前/改后使用不同固定 runDir 保持基线工件互不污染。**共识达成，plan 具备升 active 条件。**
- Independent draft review iteration 3: 不需要（iteration 2 已 acceptable；两条措辞微调为 reviewer 建议原文采纳，无实质变更）。

## Closure Gates

- [x] in-scope behavior is complete（seam 接口 + ProcessExecutor 落地，CLI 行为逐字节不变）
- [x] relevant docs are aligned（module-boundaries.md / baseline §Public Exports / roadmap WI1）
- [x] verification has run：`pnpm --prefix tools/mission-driver test`（基线对比零回归）+ 归一化 dry-run 冒烟 diff 为空 + seam 契约测试绿
- [x] scoped verification is not conflated with full verification —— 本 plan 验证域为引擎测试套件 + dry-run 冒烟，不含真实模型 run（M1 为零 DSH 依赖纯本地验证域，符合 roadmap 注记）；若执行日有凭据且跑了真实 demo run，在日志单独标注
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### Backend 选择工厂（`driver=="native" → NativeExecutor` 映射）

- Classification: `out-of-scope improvement`（归属 M2-WI7）
- Why Not Blocking Closure: M1 只有一个 backend 实现，无第二实现时选择工厂是空转抽象；packaging doc 的选择规则由 M2 落地。
- Successor Required: `yes`（M2-WI7 NativeExecutor plan 必须引用本 plan 的接口契约与注入形态决策）
- Reopen trigger: M2-WI6/WI7 启动时。

### executor.js 心跳级 sysSnapshot / touchActiveRun（`executor.js:352-358`）的 embed 门控

- Classification: `watch-only residual`（移交 `2026-08-23-1300-3` WI4 裁决）
- Why Not Blocking Closure: 心跳诊断在 ProcessExecutor 执行路径内部，native 模式根本不选中该 backend，无需门控；startup 级门控才是 WI4 范围。
- Successor Required: `no`（plan 3 以设计注记收口）
- Reopen trigger: 未来某 backend 与 native 模式共享 executor.js 心跳路径时重开。

## Closure

Status Note: all Phase 1 / Phase 2 exit criteria landed and were independently re-verified against the live working tree (code, tests, docs, log, roadmap). The 9 Closure Gates above are ticked on audit-verified evidence, not executor self-report. Plan can close.

Closure Audit Evidence:

- Auditor / Agent: independent closure auditor（mission-driver dsh-plugin CLOSURE_AUDIT step，fresh session，2026-08-23；非执行者自评）
- Evidence:
  - **代码落地核实**：`src/step-executor.js` 存在（StepExecutor JSDoc 三方法 + `ProcessExecutor` 纯 1:1 转发，零 npm import，零依赖不变式保持）；`engine.js` 四处消费点改读 `delegates.executor.execute*`（`:846/:916/:981/:1005`，`:907` 存在性守卫等价迁移）；subflow parent 包装链等价迁移（`engine.js:1319-1330` 包 `parentExecutor`）；`main.js:8/:721` 接线 `new ProcessExecutor(runner)` 单键注入；`runScript` 第四 delegate 留在 seam 外现状不动（`engine.js:1061`）；`test/helpers.js` makeMockDelegates 产 mock executor 并翻译 legacy 三键 override。
  - **独立复跑验证（审计者本机，非采信日志）**：(1) 全量 `node --test test/*.test.js` 改前/改后各跑一次（git-stash 基线法）——失败集逐条相同（Windows 路径平台 2 用例 + 其父 suite、doc 行号引用用例、Monitor draft / null-marker 预存失败），无任何新增失败 → 零回归成立；新增 `test/step-executor.test.js`（3 suite）全绿。(2) dry-run 冒烟改前/改后独立复跑（`--run-dir _tmp/audit-before|-after`），按日志固化 sed 归一化管线处理后 diff 为空 → 行为不变成立。
  - **文档/日志/roadmap 核实**：`module-boundaries.md:9` 引擎核心行已改 "importable as a library behind the injected StepExecutor seam"；`mission-driver-baseline.md` §Public Exports 增补 `src/step-executor.js` 条目；`docs/logs/2026/08-23.md` 含本 plan 完整证据条目；roadmap 仅 WI1 行 `ready → done`，WI2–WI5 状态未动。
  - **非功能门核实**：`main.js` delegates.vars 零变更（context-map EXPECTED_VARS 不受影响）；flows/*.json 未触碰；无新增 npm 依赖；前端零改动（web/dist 无需重建）。
  - 审计观察（非阻塞，不属本 plan 范围）：本机预存失败集中 Monitor draft 与 null-marker 用例未列入执行日志的基线枚举（环境相关预存失败，git-stash 法证实与 seam 变更无关）；日志中 "175 ✔" 计数口径与审计复跑的顶层条目数不一致，但载荷性结论（失败集逐条相同 → 零回归）经独立复跑证实为真。

Follow-up:

- (none — confirmed defects must not appear here; see Deferred But Adjudicated for successor-owned items)
