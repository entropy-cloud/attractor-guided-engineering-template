# 2026-08-23-1447-3 L2 契约测试：双后端行为矩阵（dsh-plugin M2-WI8）

> Plan Status: completed
> Mission: dsh-plugin
> Work Item: M2-WI8
> Last Reviewed: 2026-08-23（draft review 2 轮，iteration 2 共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M2-WI8
> Related: `docs/analysis/2026-08-22-0003-verification-harness-design.md`（R3 §2 L2 行、§3 矩阵、§5 CI 策略）；`docs/architecture/dsh-plugin-packaging.md` §Execution Backend Seam 契约保全规则；前置 `2026-08-23-1447-2`（NativeExecutor + fake agents service 雏形）
> Audit: required

## Current Baseline

**L2 矩阵已设计未实现；双后端实现与测试 seam 均已就绪：**

- R3 §3 定义六组矩阵断言（双后端可观察结果必须一致）：(1) marker 结果分类（pass/fail/unknown → 修正重试）；(2) 修正重试预算（`onUnknownMaxRetries`）+ transient-fault backoff 分类；(3) `run-state.json` 形状（`steps[]` 字段 `status/visits/marker/produced/sessionId/timing`——sessionId 值语义不同但 presence/type 规则一致）；(4) exit 合成 → `EXIT_MAP` 终态映射一致；(5) flow 预算（`maxTotalSteps`/`maxCycleVisits`）触发一致；(6) monitor 对两类 run 无特判渲染（文件格式同一性）。
- R3 §2 L2 机制：**同一份行为矩阵 spec 跑两遍**。**Seam 勘误（live 核实）**：R3 §2 引用的 `__setRunnerFactoryForTest`（`orchestrator.js:43`）live 仅被 draft 管线消费（`orchestrator.js:302` `cmdDraftMission`）——mission run 路径的真实注入点是 `orchestrateRun({ config, executor })`（`main.js` 182 建 runner → `main.js:258` 注入 `ProcessExecutor(runner)`）。R3 的 seam 引用早于 M1 落地、已过时；本 plan 的 ProcessExecutor 腿正确机制 = 注入 `new ProcessExecutor(duck-typed fake runner)`（`step-executor.js` 纯转发，`test/step-executor.test.js` / `test/helpers.js` 既有 fake-runner 惯例），NativeExecutor 腿用 fake in-process agents service（`{ create, resume, get, dispose }` 返回 scripted Agent doubles：`followup` → 罐装最终文本、`whenIdle()` → resolve）。真 spawn 腿留 L3/L4 不在单测 mock。Phase 3 给 R3 补勘误注记。
- 前置依赖：1447-2（draft，WI7）将交付 NativeExecutor 与 fake agents service 雏形——本 plan Prereqs 成立后在其上扩展为矩阵级基建；**今日 live：`plugin/` 目录尚不存在**，本 plan 不把未落地物写成事实。
- 测试基建现状：引擎 `node --test`（`tools/mission-driver/test/`，约 650 用例规模）；`prompt-check.mjs` 链入 `pnpm --prefix tools/mission-driver test`；1447-1 建立 `plugin/dsh` 本地测试入口（引擎测试链不依赖插件 node_modules 的边界保持）；CI 门禁 = L1/L2 纯 Node 可跑、merge-blocking（R3 §5），L3/L4 走本地脚本门禁（`npm run verify:native`、env 显式开启）不阻塞 CI。
- 跨层加载缺口：引擎测试是纯 JS，NativeExecutor 是插件层 TS（`plugin/dsh/src/native-executor.ts`）——矩阵双腿同 spec 的 harness 布局与 CI 接线形态未决（本 plan Phase 1 Decision）。
- 双后端行为差异中"值语义不同"的项已在 R3 §3 显式豁免（sessionId）；其余差异（权限/模型选择/watchdog 风格）属宿主环境差异，L2 层不可测也不应测（L3/L4 域）。

## Goals

- 一份共享、参数化的行为矩阵 spec（六组断言），对 ProcessExecutor（mock runner 注入）与 NativeExecutor（fake agents service）各执行一遍，全部断言双绿——把 packaging doc §Execution Backend Seam 三条契约保全规则从"文档承诺"升级为"机器钉住"。
- fake in-process agents service 从 1447-2 的单测雏形扩展为矩阵级可复用测试基建：scripted 剧本（按步骤返回指定最终文本/失败/超时）、可编程 `cancel`/`dispose` 记录、handle 存活断言。
- 矩阵进 CI merge-blocking 链（现有 `pnpm --prefix tools/mission-driver test` 或插件测试入口，按 Phase 1 布局决策接线），纯 Node、零网络、零模型凭据。

## Non-Goals

- 不做 L3 SDK 集成 harness（M2-WI9，含 R3 §6 未决项——宿主启动组合）与 L4 live smoke（demo mission 双形式 diff，M2 收口/P3）。
- 不做真 spawn 腿的 ProcessExecutor 覆盖（R3 §2 明示：`executor.js` 直接 spawn 无注入点，真 spawn 留 L3/L4）。
- 不改引擎行为、不改 NativeExecutor 行为——矩阵若发现双后端分歧，分歧修复归各实现方（引擎侧修复若触及状态机核心属 AI Block Condition，需独立处理）；本 plan 只交付测试与发现的分歧记录。
- 不做 monitor 前端改动，也不做 monitor 侧再验证——断言 6 收窄为"双后端 run-state 产物形状同一性（组 3 超集）+ 产物文件集存在性"；monitor 零特判的正当性引用 packaging doc §Service Surface（"Monitor: unchanged… invisible to it"——monitor 的消费面就是 run-state 文件本身，格式同一性由组 3 钉住后 monitor 侧不存在第二格式面）。
- 不覆盖 `dsh` headless driver（watch-only，post-M2）。

## Task Route

- Type: `verification or audit work`（新增契约测试基建，被测对象预期零改动）
- Owner Docs: `docs/architecture/dsh-plugin-packaging.md` §Execution Backend Seam（契约保全规则 1–3 为断言依据）；`docs/analysis/2026-08-22-0003-verification-harness-design.md`（R3，机制 owner）；`tools/mission-driver/src/exit-map.js`（EXIT_MAP 断言锚点）
- Skill Selection Basis: `Skill: none`——测试基建新增，无匹配可复用方法；矩阵断言依据全部来自 owner docs（R3 §3 逐条），非技能性知识

## Infrastructure And Config Prereqs

- 纯 Node/已装 devDeps，零网络、零模型凭据、零宿主（CI 可跑，R3 §5 merge-blocking 定位）。
- 无 secrets / env 前置；无数据迁移。

## Execution Plan

### Phase 1 - 布局/驱动层级决策 + fake agents service 矩阵化扩展

Status: completed
Targets: `plugin/dsh/test/`（矩阵 harness、fake agents service、共享 spec）
Skill: none

- Item Types: `Decision | Add`
- Prereqs: `2026-08-23-1447-2` 全 Phase

- [x] `Decision` harness 布局与 CI 接线形态：矩阵放 `plugin/dsh/test/` 沿用 1447-1 建立的插件测试入口（NativeExecutor 同仓 import；引擎纯 JS 模块如 `step-executor.js`/`exit-map.js` 经相对路径跨目录 import，零依赖可解析；引擎测试链保持不依赖插件 node_modules）。待定项收敛为 CI 接线形态：备选 A——根级聚合脚本一次跑两链（`pnpm --prefix tools/mission-driver test` + 插件入口）；备选 B——两命令并列都设 merge-blocking。裁据：CI 门禁单命令简单性 vs 各链独立演进；决策与理由定稿于本 item。
  - Skill: none
  - 执行记录：**定稿备选 A（聚合脚本一次执行）**——根级 `verify-age.sh`（L1 引擎链 + L2 插件链〔含矩阵〕，插件 devDeps 缺失时按需 `npm ci`，纯 Node 零网络）；`.github/workflows/age-ci.yml` 在 push/PR（路径限定 `tools/mission-driver/**` + `plugin/dsh/**` + 门禁自身）跑 `./verify-age.sh` 使其 merge-blocking。理由：单命令门禁最简单（本地/CI 同一入口，R3 §5 的 L1+L2 全绿过门形态）；各链独立演进性保留——聚合脚本只串联两链各自的 package.json test 入口，链内演进零协商成本。矩阵 spec = `plugin/dsh/test/backend-parity-matrix.test.mjs` + `plugin/dsh/test/helpers/matrix-harness.mjs`（共享 harness），经插件 `node --test test/*.test.mjs` 自动发现；引擎模块跨目录 import 实测零 npm 解析（`../../../../tools/mission-driver/src/{engine,step-executor,exit-map,runner}.js`），引擎测试链零新增 import（边界双向保持）。
- [x] `Decision` 驱动层级与 mission fixture：**驱动层级 = FlowEngine 直驱**（构造 `delegates.executor` 注入双腿，deterministic、不引入 config 解析链噪音）；EXIT_MAP 断言经直接 import `exit-map.js` 查表（纯函数，`orchestrateRun` 层的应用点已由既有 CLI 测试 + `exit-map.test.js` 覆盖）。**fixture = 沿用现有引擎测试的临时目录 mission 惯例（mkdtemp 惯例见各引擎测试文件如 `core.test.js`；`test/helpers.js` 提供 `makeMockDelegates`/`simpleFlow`），内联极小 flow**——含 agent 步、tool 步（含快速失败与超时剧本——钉 1447-2 Decision 3 残险：插件层 spawn 与 executor.js 的超时/输出 tail 行为对齐）、无 marker 步、预算触发点（`maxTotalSteps`/`maxCycleVisits` 各一）、correction 剧本位（连续 unknown marker）。备选：`orchestrateRun` 全链驱动——被否决，端到端已由 L4 与既有 CLI 测试覆盖，全链引入 config/flow 文件解析噪音；备选：`missions/demo.json` 真实 mission——被否决，剧本不可控（需精确编排 marker 序列/超时/预算耗尽路径）。残险：直驱层遗漏 `orchestrateRun` 层差异——以查表断言 + 既有测试补偿，L4 收口兜底。
  - Skill: none
  - 执行记录：按定稿落地。补充三点 harness 级裁定（记于 harness 头注）：(1) `config.onStepUpdate = engine._onAgentStepUpdate` 在 executor 构造**之后**接线，逐字镜像 `orchestrateRun` 生产注入点（`orchestrator.js:644`）——保双腿实时回调通道与生产同形；(2) 双腿统一 `embed: true`——M1-WI4 startup 诊断是 executor 无关的引擎行为，embed 化保矩阵 hermetic（无 `~/.mission-driver/` 写、无 ps 扫描），不引入后端相关变量；(3) 共享剧本词汇 = 扁平 per-turn 抽象结果序列（`{text}|{transient}|{hard}|{timeout}|{spawnFail}`），引擎 executor 调用序确定性保证两腿同槽消费（native followup 与 process runner 调用一一对应）。fixture 覆盖超出门表：另含 subflow 步（组 3 placeholder 行为）、`unknown_step`/`unknown_type`（组 4 终态覆盖）、`max_retries`（组 5 第三预算）。
- [x] `Add` fake agents service 矩阵化：剧本驱动（per-step scripted 最终文本：marker pass / marker fail / 无 marker / 多 marker / 超时 / create 失败）、调用记录（`create/resume/followup/cancel/dispose` 全量 trace 供 handle 生命周期断言）、`whenIdle` 可编程延迟（**默认取近零值**，防真实计时器 flake，见 Phase 2 时序确定性约束）。保持 1447-2 单测兼容（不破坏既有用法）。
  - Skill: none
  - 执行记录：`plugin/dsh/test/helpers/fake-agents.mjs` 纯增量扩展——新剧本项 `{ rejectIdle: Error }`（whenIdle 拒绝 → NativeExecutor errorTail → 引擎 transient 分类经 `stderrTail||errorTail` 等价消费）；`state.calls` 全序 trace（create/resume/followup/cancel/dispose 每调用一条，handle 生命周期断言用）；`turnDelayMs` 默认 1ms（近零，既有默认未动）；既有 per-kind 数组与语义零变化，1447-2 单测 24/24 复跑绿。

Exit Criteria:

- [x] 两项 Decision 定稿且 harness 骨架在选定位置可被 CI 命令发现执行（`verify-age.sh` 实跑 exit 0：L1 654/654 + prompt-check 绿、L2 插件链 46/46 全绿含矩阵 22 用例；`age-ci.yml` 接线 `./verify-age.sh`）
- [x] fake service 剧本/trace 能力就位；1447-2 既有插件测试不回归（24/24 绿）
- [x] `docs/logs/` updated

### Phase 2 - 六组矩阵断言双后端参数化

Status: completed
Targets: 矩阵 spec 文件（Phase 1 决策位置）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [x] `Add` 断言组 1+2——marker 分类与重试预算：同一剧本集双后端各跑：pass/fail/unknown 三分类的 step 终态与 `visits` 一致；`onUnknownMaxRetries` 耗尽路径一致（含 marker-correction re-prompt 次数 = max 2）；transient-fault backoff 分类（可重试错误 vs 终止错误）对 ProcessExecutor 的 `exitCode/errorTail` 与 NativeExecutor 的合成 code/errorTail 行为等价。
  - Skill: none
  - 执行记录：`backend-parity-matrix.test.mjs` 组 1/2 场景——marker-pass / marker-fail / multi-marker（钉 extractTag last-wins 语义双后端一致）/ no-marker-parse-fallback-fails / unknown-marker-correction-recovers / correction-budget-exhausted-default-2（re-prompt 次数 = 2 经 `expectTurnRoles` 钉死）/ correction-budget-custom-1（`onUnknownMaxRetries:1` → 1 次）/ transient-retry-then-success（429 签名 ×2 后恢复：`transient_retry` 事件 2、`step_failed` 0）/ transient-budget-exhaustion-degrades（2 次后降级真失败）/ hard-failure-non-transient（无签名 → 零 transient 重试）/ agent-watchdog-timeout / backend-create-failure。每场景双腿断言：engine→executor 调用序列逐条 deepEqual（方法+stepName+角色）、终态/stepCount/events 计数一致、绝对 (status, EXIT_MAP[status]) 双腿各自钉住。
- [x] `Add` 断言组 3+6——run-state 形状与文件格式同一性：双后端各跑同一 fixture 后 `run-state.json` `steps[]` 字段全集、类型、`status` 序列一致（`sessionId` 按 R3 §3 豁免值语义，仅断言 presence/type；timing 字段只断言 presence/type/顺序，**不断言时长**）；`_wfClose` 终态覆盖、subflow placeholder 行为一致；产物文件集（logFile/promptFile 存在性，含 tool 步）一致。断言 6 收窄落地：形状同一性即 monitor 消费面同一性（Non-Goals 已引 packaging doc 正当性）。
  - Skill: none
  - 执行记录：`normalizeRunState`/`normalizeStepRecord`——逐 record 字段集（sorted keys）+ 稳定字段值（name/status/marker/visits/produced/transientSig/subflowRuns）+ 值豁免字段仅 presence/type（`sessionId/startedAt/endedAt/durationMs/error/logFile/promptFile/waitMs/suspendGapMs`）；subflow-single-child 场景钉 subflow placeholder（父记录 `type:subflow` + `subflowRuns` 终态覆盖 + 子 `run-state-SUB-1-0.json` 存在）；每场景断言终态无 `status:"running"` 残留（`_wfClose` 终态覆盖）；产物集 = 每个 steps[] 引用的 logFile/promptFile basename 在 runDir 存在（含 tool 步真 spawn 产物），双腿存在性 pattern 一致；组 6 收窄正当性引 packaging doc §Service Surface（monitor 消费面即 run-state 文件）。
- [x] `Add` 断言组 4+5——EXIT_MAP 映射与 flow 预算：双后端合成 exit（含失败/超时剧本）→ 引擎分类终态 → import `exit-map.js` 查表，终态 → 退出码映射逐行一致（对照 `exit-map.js` 全键覆盖）。与既有 `exit-map.test.js` 的互补边界：既有套钉"表 ↔ EXECUTION-PRINCIPLE §11 行"，本矩阵钉"双后端合成 exit → 终态 → 查表"端到端一致——互补不重复。flow 预算：`maxTotalSteps`/`maxCycleVisits` 触发点与终止状态双后端一致。
  - Skill: none
  - 执行记录：组 4 场景 unknown-step-goto（→ `unknown_step`/exit 1）+ unknown-step-type（→ `unknown_type`/exit 1）+ 覆盖性汇总用例（corpus 覆盖 8/10 EXIT_MAP 键：completed/failed/no_transition/unknown_step/unknown_type/max_cycles/max_total_steps/max_retries，逐键断言 live 查表值 = 钉住退出码；余 `single_step_done/ping_pong/invalid_transition` 为 executor 无关引擎路径，行级钉住归 `exit-map.test.js`——互补边界在 spec 头注 + 汇总用例注释显式声明）。组 5 场景 budget-max-total-steps（3 步耗尽 → `max_total_steps`/exit 2）/ budget-max-cycle-visits（visits 3 > 2 → `max_cycles`/exit 2）/ budget-max-retries（`fail:retry,maxRetries:1` 耗尽 → `max_retries`/exit 2），触发点（stepCount/visits/steps[] 记录数）双腿一致。
- [x] `Proof` 双腿全绿跑通：矩阵 spec 以 backend 为参数跑两遍全绿（时序确定性：剧本延迟近零、无真实计时器依赖）；命令固化进 Phase 1 决策的 CI 入口。发现的任何双后端分歧：逐条记录（症状/根因归属/裁定）；**裁定必须引 owner-doc 背书**（R3 §3 sessionId 豁免或 packaging doc §Behavioral differences 已声明差异），无背书的分歧即为缺陷须修复复跑，不得以"裁定"名义豁免。分歧台账为零（或全部有背书裁定）才允许本 Phase 收口；修复工作若超出测试范围按 Non-Goals 边界另立记录处理。
  - Skill: none
  - 执行记录：22/22 全绿 ×5 连跑零 flake（时序确定性：fake service turnDelayMs=1、transient backoff 1ms/2ms、无时长断言）。命令已固化：矩阵经插件链 `npm --prefix plugin/dsh test` 进入 `verify-age.sh` 聚合门禁（L1+L2 全绿才 exit 0，实测 654/654 + 46/46）。**分歧台账 = 3 条，全部有 owner-doc 背书**（录于 spec 头注 Divergence ledger）：D1 tool 步 timeout 漂移——process `runTool` 丢弃引擎 `timeout`（60min 默认 → 命令跑完 → pass）、native 以 ms 消费（100ms 击杀 → fail），场景 `tool-timeout-drift` 按文档现状**显式钉住双腿各自绝对结果**，背书 = packaging doc §Implementation state and boundaries（"Known residual drift … pinned by the WI8 L2 matrix's tool-step assertions"，1447-2 Decision 3 残险就此闭环）；D2 sessionId 值语义（ses_* vs native childId，presence/type 断言），背书 = R3 §3 断言 3 豁免；D3 产物/诊断内容形状（agent 日志命名 oc-* vs native-*、日志体、failedMeta.error 文本、pre-dispatch 失败时 promptFile 在盘 presence 不对称——process ENOENT 引路径不写文件、native create 前已写），背书 = packaging doc §Implementation state and boundaries（存在性/可读性即兼容契约，字节级内容形状不承诺；spawn-fail 场景产物比较限定 logFile）。无未背书分歧 → 收口条件满足。

Exit Criteria:

- [x] 六组断言双后端双绿；剧本覆盖含成功/失败/无 marker/超时/预算耗尽路径
- [x] 分歧台账为空（或有逐条裁定记录）（3 条，全部 owner-doc 背书，见 Phase 2 Proof 执行记录）
- [x] `docs/logs/` updated

### Phase 3 - CI 接线 + 文档同步 + roadmap 回写

Status: completed
Targets: CI/测试链入口（Phase 1 决策位置）、`docs/architecture/dsh-plugin-packaging.md`、`docs/backlog/dsh-plugin-roadmap.md`、R3 状态注记
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Proof`
- Prereqs: Phase 1、Phase 2

- [x] `Proof` CI merge-blocking 接线：矩阵进入 Phase 1 决策的 CI 形态（聚合脚本一次执行，或两命令并列皆 merge-blocking——按 Decision 1 定稿执行，两种形态下 L1+L2 都必须全绿才算过门）；确认纯 Node 环境可跑（无网络假设）；R3 §2 L2 行补两条注记：已实现落点引用 + **seam 勘误**（`__setRunnerFactoryForTest` 为 draft 管线 seam 的 live 事实，ProcessExecutor 腿实际用 `orchestrateRun` executor 注入 + fake runner，见本 plan 基线）。
  - Skill: none
  - 执行记录：聚合形态（Decision 1 备选 A）落地——`verify-age.sh`（exec bit 已置）+ `.github/workflows/age-ci.yml`（push/PR 路径限定 `tools/mission-driver/**`+`plugin/dsh/**`+门禁自身，Node 24 满足插件 engines `^22.19||>=24` 的 TS type-strip 需求，跑 `./verify-age.sh`）。纯 Node 确认：矩阵/引擎链测试体零网络（CI 中仅 devDeps `npm ci` 为环境安装，非测试假设）；本地实跑 `./verify-age.sh` exit 0（L1 654/654 + prompt-check、L2 46/46）。R3 §2 补两条注记（`docs/analysis/2026-08-22-0003-verification-harness-design.md` §2 表后 blockquote）：实现落点引用（测试文件 + harness + verify-age.sh/age-ci.yml + 台账指针）与 seam 勘误（`__setRunnerFactoryForTest` live 仅被 draft 管线消费〔orchestrator.js:302〕；mission run 真注入点 = `orchestrateRun({config, executor})`，矩阵 ProcessExecutor 腿 = `new ProcessExecutor(fake runner)`，真 driver spawn 留 L3/L4；标注源自本 plan draft review B1）。
- [x] `Proof` 文档收口：packaging doc §Execution Backend Seam 契约保全规则标注"由 L2 矩阵钉住（test 文件引用）"；roadmap WI8 `todo → done`；R3 文档补一行实现落点引用。baseline 预计 `No owner-doc update required`——显式核对记录。
  - Skill: none
  - 执行记录：packaging doc——状态标头 P2 部分交付范围 +WI8、§Packaging Layout as-built 树（test/ 补 matrix 文件 + helpers/matrix-harness.mjs，标题标注 extended WI8）、§Execution Backend Seam 契约保全规则 1–3 逐条标注"由 L2 矩阵钉住（`plugin/dsh/test/backend-parity-matrix.test.mjs` + verify-age.sh/age-ci.yml + 台账指针）"并附各组矩阵映射、§Implementation state and boundaries tool 漂移行补场景名落点（`tool-timeout-drift`，台账 D1）、§Phased Delivery P2 行 WI8 交付标注；roadmap WI8 `done` + Last Updated 刷新；R3 §2 实现落点引用（随勘误注记一并）。baseline 显式核对：**No owner-doc update required**——矩阵为纯测试新增，引擎目录零 diff（`git status tools/mission-driver/src` 干净）、零 standalone（CLI）行为变化、EXIT_MAP/StepExecutor seam 等 baseline 所载引擎侧事实全部未动且矩阵以 live import 消费之（若 baseline 行漂移，矩阵跨目录 import 直接红）。文档核对方法：document-audit-prompt 维度走查（状态一致性/行号引用豁免——doc-line-refs 对 `docs/architecture/*.md` 的 file:NNN 禁令经全量测试绿证实未被新文案触犯）。

Exit Criteria:

- [x] CI 门禁按 Phase 1 决策形态接线（聚合一次执行），L1+L2 全绿过门；R3/packaging doc/roadmap 与实现一致
- [x] `docs/logs/` updated（聚合条目，含双后端双腿结果数字）

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd29c8cbaffe6LGqescXw7rP2V`，2026-08-23）——2 阻塞项：B1 ProcessExecutor 腿 seam 引用失实（`__setRunnerFactoryForTest` live 仅被 draft 管线消费 `orchestrator.js:302`，mission run 路径真实注入点是 `orchestrateRun({config, executor})`；R3 §2 引用早于 M1 已过时，plan 不应继承）——正确机制 = 注入 `new ProcessExecutor(fake runner)`；B2 fixture 来源与驱动层级未定（FlowEngine 直驱 vs orchestrateRun 全链、内联 fixture vs missions/demo——直接决定组 3/4/6 断言的物理含义）。6 项非阻塞：1447-2 交付物条件化表述、断言 6 收窄（monitor 消费面即 run-state 文件）、分歧台账须 owner-doc 背书、与 `exit-map.test.js` 互补边界、时序确定性（近零延迟/只断 presence-type-顺序）、"653 用例"改约数。修订：B1 基线补 seam 勘误段 + Phase 3 给 R3 补勘误注记；B2 新增 Phase 1 Decision 2（直驱 + `test/helpers.js` 临时目录内联 fixture，备选与否决理由 + 残险补偿）；非阻塞 6 项全采纳（断言 6 收窄为决定性表述、组 3 补 timing 确定性约束、组 4 补互补边界句、CI 决策收敛为接线形态二选一）。
- Independent draft review iteration 2: `acceptable as-is`（独立 fresh session `ses_fd294da3cffeY6lLHEKAlmSYV`，2026-08-23）——B1（seam 勘误 + fake-runner 注入机制，行号 live 抽核全对）、B2（直驱 + 具名 fixture + 备选否决 + 残险补偿）确认 resolved；iteration 1 的 6 项非阻塞确认全部落实；无新阻塞项。3 项新非阻塞建议全部采纳：①Closure Gates/Phase 3 的"单命令"措辞改为按 Phase 1 决策形态分支中立（聚合或并列皆可满足）；②fixture 惯例指针修正（mkdtemp 惯例在 `core.test.js` 等测试文件，`helpers.js` 只提供 `makeMockDelegates`/`simpleFlow`）；③fixture tool 步补显式快速失败 + 超时剧本（兑现 1447-2 Decision 3 的残险钉住承诺）。

## Closure Gates

- [x] in-scope behavior is complete
- [x] relevant docs are aligned
- [x] verification has run（L1+L2 按 Phase 1 决策形态全绿 + 引擎全量零回归；命令在 Phase Proof 项固化——`./verify-age.sh` exit 0：L1 654/654 + prompt-check OK、L2 46/46〔矩阵 22 + WI6/WI7 24〕+ manifest + tsc + bundle 新鲜度 + smoke-import；另 `web run typecheck` 绿、`lint:prompts` 绿、`web run build` 绿且 web/src 零改动 → dist 还原 HEAD 0 diff）
- [x] scoped verification is not conflated with full verification——"verification scope limited: L2 mock/scripted 域，真 spawn 与真宿主归 L3/L4"显式标注（plan 基线/Non-Goals、packaging doc §Phased Delivery、log 三处声明；矩阵内真 spawn 仅 tool 步短命令〔D1 钉住域〕，driver 真 spawn 归 L3/WI9，native 端到端归 L4/WI10）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded（draft 2 轮共识 `acceptable as-is`，见 Draft Review Record）
- [x] text consistency verified: status, phases, gates, and log all agree（三 Phase 全 completed + 全 item/exit criteria [x]；roadmap WI8 done；packaging doc/R3 注记与实现一致）
- [x] closure audit was independent（独立 fresh-session subagent 冷回放审计，session `ses_fd250f2f1ffetLa0TfabYTFMve`，2026-08-23，VERDICT: PASS——见 Closure Audit Evidence）
- [x] closure evidence exists in files（审计报告全量结论 + 本会话与审计会话双重复跑验证数字；证据锚点 = 测试文件/harness/门禁脚本/workflow/doc 注记/log 条目）

## Deferred But Adjudicated

### 真 spawn 腿 ProcessExecutor 矩阵覆盖

- Classification: `out-of-scope improvement`（归 L3/L4——R3 §2 明示 executor.js 无注入点）
- Why Not Blocking Closure: L2 定位即 mock/scripted 域；真 spawn 覆盖由 L3 harness（WI9）与 L4 smoke（WI10）承接。
- Successor Required: `no`（L3/L4 天然覆盖）
- Reopen trigger: L3/L4 落地后若发现 mock 腿与真 spawn 行为分歧时。

### monitor 前端对双后端 run 的渲染验证深化

- Classification: `watch-only residual` → **reopen trigger HIT and CLOSED 2026-08-23**（WI10 L4 render check 发现渲染差异——step-log 端点 `oc-` 前缀边界，bug 立案 `docs/bugs/2026-08-23-monitor-native-log-naming.md`；收编闭环于 M3-WI11 plan `2026-08-23-1852-1`：引擎侧三站点双 label 修复 + monitor 单测双命名形用例 + `verify:e2e` 机器断言固化〔`assertMonitorRender`：四 run × stepLogs 非空 + `/logs/:step` 200 + node-detail `logTail` 非空〕，证据 `docs/testing/2026/08-23.md` WI11 note）
- Why Not Blocking Closure: 断言 6 已收窄为文件格式同一性（组 3 超集 + 产物文件集存在性），monitor 消费面即 run-state 文件（packaging doc §Service Surface "invisible to it"），无第二格式面；前端无后端感知，无特判风险面。
- Successor Required: `no`
- Reopen trigger: L4 smoke 发现渲染差异时。

## Closure

Status Note: completed 2026-08-23 — all 3 phases executed and ticked; roadmap WI8 `done`; independent fresh-session closure audit PASS (see evidence). 分歧台账 3 条全部 owner-doc 背书（D1 tool timeout 漂移——1447-2 Decision 3 残险就此闭环；D2 sessionId 值语义；D3 产物内容形状），无未背书分歧。

Closure Audit Evidence:

- Auditor / Agent: independent fresh-session subagent (cold-replay, no prior session state), session `ses_fd250f2f1ffetLa0TfabYTFMve`, 2026-08-23
- Evidence: audit verdict **PASS** — deliverables verified present and contract-faithful（harness 双腿机制 live 核验：fake runner `runTool` 转真 `createRunner().runTool`、`config.onStepUpdate` 接线逐字镜像 `orchestrator.js:643-644`；22 用例覆盖六组；台账 D1/D2/D3 引用核验；`tool-timeout-drift` 断言方向与 owner doc 漂移方向一致）；审计会话独立冷跑验证全绿：`./verify-age.sh` exit 0（L1 654/654 + prompt-check OK、L2 46/46 + manifest + tsc + 36 文件新鲜度 + smoke-import 五入口）、`web run typecheck` 绿、`lint:prompts` 绿、矩阵单文件加跑 ×2 均 22/22；红线保持：`git status tools/mission-driver` 全净（引擎目录/web/dist 零 diff）、`plugin/dsh/package.json` 零 diff（钉版依赖无新增）；roadmap/packaging doc/R3 注记/log 与落地状态一致；rule-12 grep（completed phase 下无 [ ]）为空。非阻塞观察 5 条（未提交属 commit-then-push 时序、waiter 内部表示 `{resolve,reject}` 为行为等价实现细节、historical ×5 连跑不可重放以审计 3 次绿为准、provisional log 条目内容已覆盖 Phase 3）——均不影响收口。审计唯一待办 = 本节收口动作本身（gates 勾选 + 证据记录 + Plan Status → completed），已随本节完成。

Follow-up:

- (none at draft time)
