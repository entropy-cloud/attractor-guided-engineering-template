# 2026-08-23-1447-3 L2 契约测试：双后端行为矩阵（dsh-plugin M2-WI8）

> Plan Status: active
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

Status: planned
Targets: `plugin/dsh/test/`（矩阵 harness、fake agents service、共享 spec）
Skill: none

- Item Types: `Decision | Add`
- Prereqs: `2026-08-23-1447-2` 全 Phase

- [ ] `Decision` harness 布局与 CI 接线形态：矩阵放 `plugin/dsh/test/` 沿用 1447-1 建立的插件测试入口（NativeExecutor 同仓 import；引擎纯 JS 模块如 `step-executor.js`/`exit-map.js` 经相对路径跨目录 import，零依赖可解析；引擎测试链保持不依赖插件 node_modules）。待定项收敛为 CI 接线形态：备选 A——根级聚合脚本一次跑两链（`pnpm --prefix tools/mission-driver test` + 插件入口）；备选 B——两命令并列都设 merge-blocking。裁据：CI 门禁单命令简单性 vs 各链独立演进；决策与理由定稿于本 item。
  - Skill: none
- [ ] `Decision` 驱动层级与 mission fixture：**驱动层级 = FlowEngine 直驱**（构造 `delegates.executor` 注入双腿，deterministic、不引入 config 解析链噪音）；EXIT_MAP 断言经直接 import `exit-map.js` 查表（纯函数，`orchestrateRun` 层的应用点已由既有 CLI 测试 + `exit-map.test.js` 覆盖）。**fixture = 沿用现有引擎测试的临时目录 mission 惯例（mkdtemp 惯例见各引擎测试文件如 `core.test.js`；`test/helpers.js` 提供 `makeMockDelegates`/`simpleFlow`），内联极小 flow**——含 agent 步、tool 步（含快速失败与超时剧本——钉 1447-2 Decision 3 残险：插件层 spawn 与 executor.js 的超时/输出 tail 行为对齐）、无 marker 步、预算触发点（`maxTotalSteps`/`maxCycleVisits` 各一）、correction 剧本位（连续 unknown marker）。备选：`orchestrateRun` 全链驱动——被否决，端到端已由 L4 与既有 CLI 测试覆盖，全链引入 config/flow 文件解析噪音；备选：`missions/demo.json` 真实 mission——被否决，剧本不可控（需精确编排 marker 序列/超时/预算耗尽路径）。残险：直驱层遗漏 `orchestrateRun` 层差异——以查表断言 + 既有测试补偿，L4 收口兜底。
  - Skill: none
- [ ] `Add` fake agents service 矩阵化：剧本驱动（per-step scripted 最终文本：marker pass / marker fail / 无 marker / 多 marker / 超时 / create 失败）、调用记录（`create/resume/followup/cancel/dispose` 全量 trace 供 handle 生命周期断言）、`whenIdle` 可编程延迟（**默认取近零值**，防真实计时器 flake，见 Phase 2 时序确定性约束）。保持 1447-2 单测兼容（不破坏既有用法）。
  - Skill: none

Exit Criteria:

- [ ] 两项 Decision 定稿且 harness 骨架在选定位置可被 CI 命令发现执行
- [ ] fake service 剧本/trace 能力就位；1447-2 既有插件测试不回归
- [ ] `docs/logs/` updated

### Phase 2 - 六组矩阵断言双后端参数化

Status: planned
Targets: 矩阵 spec 文件（Phase 1 决策位置）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [ ] `Add` 断言组 1+2——marker 分类与重试预算：同一剧本集双后端各跑：pass/fail/unknown 三分类的 step 终态与 `visits` 一致；`onUnknownMaxRetries` 耗尽路径一致（含 marker-correction re-prompt 次数 = max 2）；transient-fault backoff 分类（可重试错误 vs 终止错误）对 ProcessExecutor 的 `exitCode/errorTail` 与 NativeExecutor 的合成 code/errorTail 行为等价。
  - Skill: none
- [ ] `Add` 断言组 3+6——run-state 形状与文件格式同一性：双后端各跑同一 fixture 后 `run-state.json` `steps[]` 字段全集、类型、`status` 序列一致（`sessionId` 按 R3 §3 豁免值语义，仅断言 presence/type；timing 字段只断言 presence/type/顺序，**不断言时长**）；`_wfClose` 终态覆盖、subflow placeholder 行为一致；产物文件集（logFile/promptFile 存在性，含 tool 步）一致。断言 6 收窄落地：形状同一性即 monitor 消费面同一性（Non-Goals 已引 packaging doc 正当性）。
  - Skill: none
- [ ] `Add` 断言组 4+5——EXIT_MAP 映射与 flow 预算：双后端合成 exit（含失败/超时剧本）→ 引擎分类终态 → import `exit-map.js` 查表，终态 → 退出码映射逐行一致（对照 `exit-map.js` 全键覆盖）。与既有 `exit-map.test.js` 的互补边界：既有套钉"表 ↔ EXECUTION-PRINCIPLE §11 行"，本矩阵钉"双后端合成 exit → 终态 → 查表"端到端一致——互补不重复。flow 预算：`maxTotalSteps`/`maxCycleVisits` 触发点与终止状态双后端一致。
  - Skill: none
- [ ] `Proof` 双腿全绿跑通：矩阵 spec 以 backend 为参数跑两遍全绿（时序确定性：剧本延迟近零、无真实计时器依赖）；命令固化进 Phase 1 决策的 CI 入口。发现的任何双后端分歧：逐条记录（症状/根因归属/裁定）；**裁定必须引 owner-doc 背书**（R3 §3 sessionId 豁免或 packaging doc §Behavioral differences 已声明差异），无背书的分歧即为缺陷须修复复跑，不得以"裁定"名义豁免。分歧台账为零（或全部有背书裁定）才允许本 Phase 收口；修复工作若超出测试范围按 Non-Goals 边界另立记录处理。
  - Skill: none

Exit Criteria:

- [ ] 六组断言双后端双绿；剧本覆盖含成功/失败/无 marker/超时/预算耗尽路径
- [ ] 分歧台账为空（或有逐条裁定记录）
- [ ] `docs/logs/` updated

### Phase 3 - CI 接线 + 文档同步 + roadmap 回写

Status: planned
Targets: CI/测试链入口（Phase 1 决策位置）、`docs/architecture/dsh-plugin-packaging.md`、`docs/backlog/dsh-plugin-roadmap.md`、R3 状态注记
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Proof`
- Prereqs: Phase 1、Phase 2

- [ ] `Proof` CI merge-blocking 接线：矩阵进入 Phase 1 决策的 CI 形态（聚合脚本一次执行，或两命令并列皆 merge-blocking——按 Decision 1 定稿执行，两种形态下 L1+L2 都必须全绿才算过门）；确认纯 Node 环境可跑（无网络假设）；R3 §2 L2 行补两条注记：已实现落点引用 + **seam 勘误**（`__setRunnerFactoryForTest` 为 draft 管线 seam 的 live 事实，ProcessExecutor 腿实际用 `orchestrateRun` executor 注入 + fake runner，见本 plan 基线）。
  - Skill: none
- [ ] `Proof` 文档收口：packaging doc §Execution Backend Seam 契约保全规则标注"由 L2 矩阵钉住（test 文件引用）"；roadmap WI8 `todo → done`；R3 文档补一行实现落点引用。baseline 预计 `No owner-doc update required`——显式核对记录。
  - Skill: none

Exit Criteria:

- [ ] CI 门禁按 Phase 1 决策形态接线（聚合一次执行或并列皆 blocking），L1+L2 全绿过门；R3/packaging doc/roadmap 与实现一致
- [ ] `docs/logs/` updated（聚合条目，含双后端双腿结果数字）

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd29c8cbaffe6LGqescXw7rP2V`，2026-08-23）——2 阻塞项：B1 ProcessExecutor 腿 seam 引用失实（`__setRunnerFactoryForTest` live 仅被 draft 管线消费 `orchestrator.js:302`，mission run 路径真实注入点是 `orchestrateRun({config, executor})`；R3 §2 引用早于 M1 已过时，plan 不应继承）——正确机制 = 注入 `new ProcessExecutor(fake runner)`；B2 fixture 来源与驱动层级未定（FlowEngine 直驱 vs orchestrateRun 全链、内联 fixture vs missions/demo——直接决定组 3/4/6 断言的物理含义）。6 项非阻塞：1447-2 交付物条件化表述、断言 6 收窄（monitor 消费面即 run-state 文件）、分歧台账须 owner-doc 背书、与 `exit-map.test.js` 互补边界、时序确定性（近零延迟/只断 presence-type-顺序）、"653 用例"改约数。修订：B1 基线补 seam 勘误段 + Phase 3 给 R3 补勘误注记；B2 新增 Phase 1 Decision 2（直驱 + `test/helpers.js` 临时目录内联 fixture，备选与否决理由 + 残险补偿）；非阻塞 6 项全采纳（断言 6 收窄为决定性表述、组 3 补 timing 确定性约束、组 4 补互补边界句、CI 决策收敛为接线形态二选一）。
- Independent draft review iteration 2: `acceptable as-is`（独立 fresh session `ses_fd294da3cffeY6lLHEKAlmSYV`，2026-08-23）——B1（seam 勘误 + fake-runner 注入机制，行号 live 抽核全对）、B2（直驱 + 具名 fixture + 备选否决 + 残险补偿）确认 resolved；iteration 1 的 6 项非阻塞确认全部落实；无新阻塞项。3 项新非阻塞建议全部采纳：①Closure Gates/Phase 3 的"单命令"措辞改为按 Phase 1 决策形态分支中立（聚合或并列皆可满足）；②fixture 惯例指针修正（mkdtemp 惯例在 `core.test.js` 等测试文件，`helpers.js` 只提供 `makeMockDelegates`/`simpleFlow`）；③fixture tool 步补显式快速失败 + 超时剧本（兑现 1447-2 Decision 3 的残险钉住承诺）。

## Closure Gates

- [ ] in-scope behavior is complete
- [ ] relevant docs are aligned
- [ ] verification has run（L1+L2 按 Phase 1 决策形态全绿 + 引擎全量零回归；命令在 Phase Proof 项固化）
- [ ] scoped verification is not conflated with full verification——"verification scope limited: L2 mock/scripted 域，真 spawn 与真宿主归 L3/L4"显式标注
- [ ] no in-scope item downgraded to deferred/follow-up
- [ ] independent draft review completed and recorded
- [ ] text consistency verified: status, phases, gates, and log all agree
- [ ] closure audit was independent
- [ ] closure evidence exists in files

## Deferred But Adjudicated

### 真 spawn 腿 ProcessExecutor 矩阵覆盖

- Classification: `out-of-scope improvement`（归 L3/L4——R3 §2 明示 executor.js 无注入点）
- Why Not Blocking Closure: L2 定位即 mock/scripted 域；真 spawn 覆盖由 L3 harness（WI9）与 L4 smoke（WI10）承接。
- Successor Required: `no`（L3/L4 天然覆盖）
- Reopen trigger: L3/L4 落地后若发现 mock 腿与真 spawn 行为分歧时。

### monitor 前端对双后端 run 的渲染验证深化

- Classification: `watch-only residual`
- Why Not Blocking Closure: 断言 6 已收窄为文件格式同一性（组 3 超集 + 产物文件集存在性），monitor 消费面即 run-state 文件（packaging doc §Service Surface "invisible to it"），无第二格式面；前端无后端感知，无特判风险面。
- Successor Required: `no`
- Reopen trigger: L4 smoke 发现渲染差异时。

## Closure

Status Note: pending

Closure Audit Evidence:

- Auditor / Agent: pending
- Evidence: pending

Follow-up:

- (none at draft time)
