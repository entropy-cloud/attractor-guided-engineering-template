# 2026-08-23-1852-3 tools/pre-execute plan-status 完成守门（dsh-plugin M3-WI13）

> Plan Status: active
> Mission: dsh-plugin
> Work Item: M3-WI13
> Last Reviewed: 2026-08-23（draft review 3 轮，iteration 3 共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M3-WI13（"tools/pre-execute 强化门:plan-status → completed 编辑在 run-state 无已闭合 CLOSURE_AUDIT 访问时 deny(R1 §2 deny 契约)"）
> Related: `docs/architecture/dsh-plugin-packaging.md` §Service Surface（Reinforcement gate (planned) 行）、§Dependency and Version Risk（dsh-goal/dsh-tools 加入条件）；`docs/analysis/2026-08-22-0001-dsh-host-api-contract-verification.md` §2（deny 契约 owner）；AGENTS.md（closure audit 强制规则——守门的规范依据）；本批执行顺序：`1852-1`（WI11）→ `1852-2`（WI12）→ 本 plan（N=3）
> Audit: required

## Current Baseline

**插件层无任何 tools 监听；deny 契约与宿主事件面已在 host 源码定位；roadmap 字面规则与真实流程语义存在已核实的误杀风险——证据规则是本 plan 的核心设计对象：**

- **宿主 deny 契约（live 核实）**：`~/ai/dsh-src/deepseek-harness/packages/core/tools/src/index.ts` —— `'tools/pre-execute'` 事件（:152，`Scoped<ToolRuntime>` 签名 `(exec: ToolExecution, next: () => Promise<PreToolDecision>)`）；决策类型含 `{ kind: 'deny'; reason: string }`（:590，与 :1696-1720 审批 deny 同族）。R1 §2 结论："Our planned tools/pre-execute reinforcement gate is on solid ground." 本 plan 起草时 rg 复核行号仍实。
- **owner doc 契约**：packaging doc §Service Surface——"a `tools/pre-execute` listener denying plan-status `completed` edits while run-state shows no closed CLOSURE_AUDIT visit — hardens the flow contract at the host boundary; consumes `@deepseek-ai/dsh-goal`/`dsh-tools` typings when it lands"。§Dependency and Version Risk：dsh-goal/dsh-tools 已 exact 钉 `0.1.1-rc.2` 但 pinned-but-unconsumed——gate 落地即其消费时点。
- **run-state 证据面（draft review B2 修正后的真实拓扑）**：顶层 `run-state.json` 的 `steps[]` 记录 `name`/`status`/`visits`（engine.js :488-531 原子写），但 plan-execution 是 **subflow**——`CLOSURE_AUDIT` 等 plan-execution 步的 steps[] 记录落在 run dir 内的**每 subflow 文件** `run-state-<subflowId>.json`（engine.js :392）；顶层文件只记 `EXEC_PLANS` 步及其 `subflowRuns[] {forEachItem = PLAN_FILE, file, status}`（engine.js :1196、:1227）——**且 append 发生于 item 完成时**（`_wfAppendSubflowRun` 仅在 child 终态后调用；in-flight 期子文件在盘、顶层 `subflowRuns` 缺席——monitor.js :263-266 注记明示）。**按顶层文件查询审计证据或"当前目标"都查不到 → 永久误 deny**；正确查询路径 = run dir `run-state-*.json` disk 扫描（config.js :455-463 先例）读子文件——每个 forEach 子文件在 **child init 时**即持久化 `forEachItem`（plan 路径）与 `status: "running"`（engine.js :430-441，为 monitor 展示 in-flight plan 名而设计），编辑时刻可查询。
- **in-run 完成编辑事实（draft review B1 核实——naive 证据规则对每条 in-run 路径都误杀）**：`prompts/execute.md` step 4a 指示 EXECUTE agent **自己在 EXECUTE 步内**把 plan 的 `> Plan Status` 更新为 `completed`——早于本轮 `CLOSURE_SCRIPT_CHECK`/`CLOSURE_AUDIT`/`BUILD_VERIFY`（`prompts/closure-audit.md` :19 只是稍后重刷同一行）。故所有"审计后置"证据面（CLOSURE_AUDIT closed visit / BUILD_VERIFY pass / deep-audit-loop 完成）在 in-run 编辑时刻**尚未存在**——"零误杀"约束对纯事后证据面 by construction 不成立。证据规则必须包含 **in-flight-run 证据面**（如：run dir 内存在 `status: "running"` 的子文件且其 `forEachItem` 即该 PLAN_FILE → 属引擎自己的合法编辑——查询面 = 子文件 disk 扫描，见上条）。
- **"active" 判定的陈旧性风险（draft review iter2 N2）**：崩溃 run 在盘上遗留 `status: "running"`——活性应以 `pid` + 存活判定（run-reconcile 先例，engine.js :412-417 持久化主进程 pid 供 stale-run 裁决）或 in-process 注册定义；陈旧 "running" 的失败方向是**漏杀**（false-allow），归入证据规则的显式裁定面。
- **owner doc 字面措辞 stale-at-landing**：packaging doc §Service Surface Reinforcement gate 行的字面规则（"no closed CLOSURE_AUDIT visit 即 deny"）经上述两条核实已知会误杀——该行在 Phase 3 回写前不应被读作权威语义（本 plan Phase 1 裁定才是）。
- **流程语义风险（本 plan 起草时实测，naive 规则会误杀）**：`flows/plan-execution.json` 中 `CLOSURE_AUDIT` 是 `CLOSURE_SCRIPT_CHECK` fail 分支的条件步（:34），`BUILD_VERIFY` pass → `done: completed`（:62）的**快速路径不经过 CLOSURE_AUDIT**；顶层 `mission-driver.json` 另有 `auditEntry: DEEP_AUDIT` + `deep-audit-loop` 子流。字面规则"无已闭合 CLOSURE_AUDIT 访问即 deny"会阻断合法的快速路径收口。**证据规则必须对齐真实流程语义**（哪些步实际执行 `> Plan Status: draft|active → completed` 编辑、其前置 run-state 形状是什么），Phase 1 必须核实。
- **无 run-state 案例的产品风险**：从未跑过 mission 的消费者项目（AGENTS.md Reviewer-Availability Fallback 明确允许 solo cold-replay 收口）按字面规则会被永久阻断合法手工闭合——deny vs allow 属未决产品语义，Phase 1 裁定；无法收敛时按 AGENTS.md 升级 human review（unresolved product risk 不得静默裁定）。
- **宿主接线面未读**：plugin（cordis service）如何订阅 `'tools/pre-execute'`（事件订阅形态/scope 语义——isolate realm 内的监听是否覆盖宿主全部工具调用）、`ToolExecution` 的输入物化面（文件写工具的 path/content 在 pre-execute 阶段是否可见、哪些工具名算文件编辑）——Phase 1 Explore。
- **插件层现状**：`service.ts` 无任何 tools 监听；`plugin/dsh/package.json` `dependencies` 已含 dsh-goal/dsh-tools（unconsumed，消费即零 dependency 变化）。
- **红线**：零引擎 diff（gate 是纯插件层；run-state 读取是被动文件读）；`dependencies` 不动；不改 CLI/monitor 行为；守门对 standalone 形式零影响（无宿主即无此门——dual-form 语义不对称是 by-design，Phase 4 doc 注记）。

## Goals

- `tools/pre-execute` 强化门：拦截"将 `docs/plans/**` 的 `> Plan Status` 编辑为 `completed`"的工具调用，在 run-state 证据不足（Phase 1 裁定的证据规则）时以 R1 §2 deny 契约拒绝（结构化 reason 文案）。
- 证据规则与真实流程语义对齐：不误杀合法快速路径收口、不阻断无 mission 项目的合法手工闭合（或经裁定显式收紧并记录残险）。
- 单测域机器钉住 + 可行域集成验证 + packaging doc/roadmap 回写；dsh-goal/dsh-tools 钉版消费落地（如 Explore 裁定需要其 typings）。

## Non-Goals

- WI11/WI12 内容（plans `1852-1`/`1852-2`）；M4（WI14/WI15）。
- 不改引擎（零引擎 diff 红线：run-state 只读；流程/状态机/monitor 零改动）。
- 不做 AGE 规范本身的修订（守门是 AGE 既有 closure-audit 强制规则的宿主边界硬化，规范依据 = AGENTS.md + 00-guide，不在本 plan 内改写规范）。
- 不拦截 `completed → draft/active` 的反向编辑、非 plan 文件的编辑、以及 `> Plan Status` 行以外的 plan 内容编辑（匹配范围本身是 Phase 1 Decision，但扩面超出 roadmap 标签域需 draft review 认可）。
- 不提供绕过 UI/白名单机制（deny reason 指引合法路径：先完成 closure audit；如需人为逃生门，属产品裁定项而非默认实现）。

## Task Route

- Type: `implementation-only change`（插件层新功能 + 验证；含一处产品语义裁定）
- Owner Docs: `docs/architecture/dsh-plugin-packaging.md` §Service Surface（Reinforcement gate 语义 owner）、§Dependency and Version Risk（deps 消费时点）；`docs/analysis/2026-08-22-0001-dsh-host-api-contract-verification.md` §2（deny 契约）；roadmap WI13。
- Skill Selection Basis: `Skill: none`——`docs/skills/README.md` 无匹配可复用方法。

## Infrastructure And Config Prereqs

- 单测域：纯 Node、零网络、零凭据（fake ToolExecution + 临时目录 run-state fixtures）。
- 集成域（Phase 3 随裁定）：若走 in-process e2e 真实工具调用，复用 `e2e.cordis.yml` 组合形态（stub 模型域）；零凭据。
- host 源码只读核查：`~/ai/dsh-src/deepseek-harness`（tools 事件面 + fs 工具面——Phase 1 Explore）。
- 无新 env/端口/迁移；gate 默认随 service 挂载生效（无 opt-in env——若裁定需要灰度开关，记录于 plan）。

## Execution Plan

### Phase 1 - Explore + 证据规则/接线面/产品语义 Decision

Status: planned
Targets: 决策记录于本 plan（doc 编辑统一归 Phase 3 收口，不双记账）
Skill: none

- Item Types: `Decision`
- Prereqs: 无（与 `1852-1`/`1852-2` 无执行依赖）

- [ ] `Decision`（含 Explore）**宿主接线面**：读 `packages/core/tools/src/index.ts` 事件订阅形态与 scope 语义（isolate realm 内 service 的 `'tools/pre-execute'` 监听覆盖面）、`ToolExecution` 输入物化（文件写工具识别、path 与 proposed content 的 pre-execute 可见性、diff/整文形态）；裁定匹配范围（哪些工具算"plan-status 编辑"、`> Plan Status:` 行变更如何从 proposed 内容中判定——**matcher 锚定引擎权威解析器 `PLAN_STATUS_RE`（plan-check.mjs :30，大小写/加粗变体已容错；plan-check.mjs 已在 bundle 闭包内，复用零依赖零引擎 diff，draft review N1）**；方向性 draft|active → completed；**create-with-completed**〔新建文件内容即含 completed 状态行〕显式纳入 matcher Decision 与 Phase 2 真值表；rename 不改状态行 → 不触发）
  - Skill: none
- [ ] `Decision`（含 Explore）**证据规则（核心）**：核实流程语义（`plan-execution.json` 全步序 + mission-driver 顶层 + `prompts/execute.md` step 4a / `prompts/closure-audit.md` :19 的编辑时序——见 Current Baseline），裁定"合法编辑"的可判定定义。候选证据面（iter2 修正后）：① **in-flight-run 面**：run dir `run-state-*.json` disk 扫描（config.js :455-463 先例）发现 `status: "running"` 子文件且其 init 期持久化的 `forEachItem`（engine.js :430-441）即该 PLAN_FILE → 引擎自己的合法编辑，allow——**查询面是子文件本体而非顶层 `subflowRuns[]`**（in-flight 期顶层缺席，见 Baseline）；"running" 的活性判定（pid + 存活 / in-process 注册 / 接受陈旧 running 的漏杀残险）随本项一并裁定并记录失败方向；② subflow 文件内 CLOSURE_AUDIT 步 closed visit（同 disk 扫描路径，post-hoc 面）；③ BUILD_VERIFY pass 快速路径证据；④ deep-audit-loop 完成记录；⑤ 组合（**注**：非 forEach 单 child 分支的 pre-start placeholder 携带 `forEachItem: null`〔engine.js :1285〕——当前仓库 flow 为 forEach，面 ① 对未来单 child 部署不识别 plan，Phase 1 记录为已知边界而非静默假设）。规则必须对每条合法收口路径（含 in-run 编辑与快速路径）给出编辑时刻已可查询的证据，零误杀；漏杀面（gate 实际还能拦什么，含陈旧 running 的 false-allow）随之显式收缩并记录——该收缩是 product-risk 级裁定，与无 run-state 案例同层级对待。备选与误杀/漏杀分析记录于 plan。
  - Skill: none
- [ ] `Decision`（含 Explore）**无 run-state / 手工闭合案例**：deny（字面规则）vs allow（gate 仅在存在 run-state 且证据不足时 deny）vs 折中（无 run-state 时 allow + 观察日志）。裁定含产品理由与残险；若 Phase 1 裁定无法收敛（含证据规则收缩语义无法收敛），按 AGENTS.md 升级 human review（unresolved product risk 不得静默裁定，plan 留 draft/挂起）
  - Skill: none
- [ ] `Decision` **deps 消费**：dsh-goal/dsh-tools typings 是否需要 import（vs 内联类型直用 `ctx.on('tools/pre-execute')` 形态）；消费即兑现 packaging doc "join when the gate lands" 注记（Phase 3 回写）
  - Skill: none

Exit Criteria:

- [ ] 四项 Decision 连同依据/备选/残险记录于 plan 内
- [ ] `docs/logs/` updated（Phase 1 决策条目）

### Phase 2 - gate 模块 + 订阅接线 + 单测

Status: planned
Targets: `plugin/dsh/src/`（gate 模块，位置随 Phase 1 Decision）、`plugin/dsh/src/service.ts`（挂载接线）、`plugin/dsh/test/`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1 四 Decision

- [ ] `Add` gate 纯函数核心：plan-status 变更检测（matcher 锚定 `PLAN_STATUS_RE`；方向性：→ `completed` 才触发；含 create-with-completed；**路径形态归一化**——`forEachItem` 是 repo 相对 plan 路径，`ToolExecution` 侧多为绝对路径，比较前归一（same-resolve），归一用例入真值表）+ run-state 证据查询（按裁定的证据规则；查询路径 subflow-aware——**in-flight 面仅走 run dir 子文件扫描；顶层 `subflowRuns[]` per-plan 映射仅适用于已完成的 post-hoc 面**，见 Current Baseline）+ deny reason 文案（结构化、指引合法路径）
  - Skill: none
- [ ] `Add` `'tools/pre-execute'` 订阅接线（service 挂载时注册、dispose 注销；按 Phase 1 裁定的 scope 语义）+ 非 plan 文件/非匹配编辑的零开销直通（allow 路径不读盘）
  - Skill: none
- [ ] `Proof` 单测（fake ToolExecution + 临时目录 fixtures）：触发面（各文件写工具形态 × 命中/不命中 plan-status 行 × 方向性 × create-with-completed）；证据规则真值表（每条合法收口路径的 run-state fixture → allow——**含 in-flight-run fixture〔run dir 内 `status:"running"` 子文件 + init 期 `forEachItem` = 该 PLAN_FILE，镜像 engine.js :430-441 init 写形状〕与 subflow 文件内 CLOSURE_AUDIT closed-visit fixture**；证据不足 → deny 含 reason）；无 run-state 案例（按裁定）；**fixture 真实性守则（iter2 N1）**：真值表 run-state fixtures 须镜像真实引擎产物（自真实/dry run 捕获，或按 `_initWorkflow`/`_wfAppendSubflowRun` 写形状断言），禁止手绘 JSON 与引擎静默漂移；零引擎 diff 核对（`git status tools/mission-driver` 全净）；`npm --prefix plugin/dsh test` 全绿 + `./verify-age.sh` exit 0 零回归
  - Skill: none

Exit Criteria:

- [ ] gate 行为在单测域机器钉住（含证据规则真值表全覆盖）
- [ ] 引擎目录零 diff 实测
- [ ] `docs/logs/` updated

### Phase 3 - 集成验证 + docs/roadmap 回写

Status: planned
Targets: `plugin/dsh/scripts/`（集成腿，随裁定）、`docs/testing/2026/`、`docs/architecture/dsh-plugin-packaging.md`、roadmap
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Decision | Proof`
- Prereqs: Phase 2

- [ ] `Decision` 集成验证域：in-process e2e（复用 e2e 组合，真实 host 工具栈上一次被 deny 的 plan-status 编辑 + 一次经证据 allow 的编辑）vs gate 模块级集成测试（真实 run-state fixtures + fake 事件面）——按 Explore 到的订阅/工具面可达性裁定；不可行域如实记录 verification scope limited
  - Skill: none
- [ ] `Proof` 集成腿跑通并记录 `docs/testing/2026/`（命令/环境/断言/scope 声明）；固化为可复跑命令（不接 CI 或接插件链，随裁定记录）
  - Skill: none
- [ ] `Proof` owner docs + roadmap：packaging doc §Service Surface Reinforcement gate 行 as-built（证据规则/deny 文案/接线面/dual-form 不对称注记；**该行字面规则已知误杀，回写为裁定后的语义**）+ §Dependency and Version Risk（dsh-goal/dsh-tools 消费状态随 Phase 1 裁定回写）；roadmap WI13 `todo → done`（证据摘要内联；若裁定语义与 roadmap 字面规则有出入，差异与理由在 roadmap 行注记）；`docs/logs/` 聚合收口条目
  - Skill: none

Exit Criteria:

- [ ] 集成验证按裁定的域跑通并固化
- [ ] owner docs / roadmap 与落地状态一致
- [ ] `docs/logs/` updated

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd1b90a14ffepMUckIAUepEbTq`，2026-08-23）——B1：误杀分析不完整——`prompts/execute.md` step 4a 指示 EXECUTE agent 在 EXECUTE 步**内**即更新 Plan Status 为 completed（早于 CLOSURE_SCRIPT_CHECK/CLOSURE_AUDIT/BUILD_VERIFY；closure-audit.md :19 只是重刷），故所有后置证据面对**每条 in-run 完成编辑**都误杀，零误杀约束 by construction 不成立；候选证据面缺 in-flight-run 面。修订：Baseline 增 in-run 编辑事实条目、Decision 2 候选面增 ①（active run + 当前 subflow 目标 = PLAN_FILE → allow）、漏杀面收缩升为 product-risk 级裁定、Phase 2 真值表增 in-flight-run fixture。B2：Baseline 证据面拓扑错误——plan-execution 是 subflow，CLOSURE_AUDIT steps[] 落 `run-state-<subflowId>.json`（engine.js :392），顶层只记 `subflowRuns[] {forEachItem=PLAN_FILE, file, status}`（:1196、:1227），按顶层查询 = 永久误 deny。修订：Baseline 重写为 subflow-aware 拓扑 + 查询路径 + config.js :455-463 先例。非阻塞 3 项全采纳：N1 matcher 锚定 `PLAN_STATUS_RE`（plan-check.mjs :30，bundle 闭包内零依赖复用）+ create-with-completed 入真值表；N2 Decision 3 措辞改"若 Phase 1 裁定无法收敛"；N3 Baseline 增 owner doc 字面措辞 stale-at-landing 注记。fact-check 其余全过（deny 契约行号/流程步序/engine steps 记录/deps 钉版/roadmap todo）。
- Independent draft review iteration 2: `needs revision`（独立 fresh session `ses_fd1b3baf2ffeTosaofxSEQHqQS`，2026-08-23）——B1（查询面不可查询）：iteration-2 修正后的 in-flight 证据面误引顶层 `subflowRuns[].forEachItem`——forEach 分支 append 仅发生于 item 完成时（engine.js :1196-1197、:1227-1228；monitor.js :263-266 注记明示"in-flight 期子文件在盘、顶层缺席"），编辑时刻查顶层对每条 in-run 编辑误 deny（与 iter1-B1 同类错误）；且 Phase 2 in-flight fixture 若手绘含顶层 running 条目，会用错误 fixture 给错误 gate 绿灯。修订：证据面 ① 查询面改为 run dir `run-state-*.json` 子文件 disk 扫描（init 期即持久化 `forEachItem` + `status:"running"`，engine.js :430-441 live 核实）；Baseline 拓扑条补 append-on-completion 语义；Phase 2 in-flight fixture 改为镜像 init 写形状。非阻塞 2 项采纳：N1 fixture 真实性守则（镜像真实引擎产物 / 按 `_initWorkflow`/`_wfAppendSubflowRun` 写形状断言，禁手绘）；N2 "active" 判定陈旧性风险入 Baseline 与裁定面（pid + 存活 / in-process 注册；陈旧 running 失败方向 = 漏杀，显式记录）。iteration 1 的 B2/N1–N3 复核 resolved；B1 判"substance landed, query path unsound"（本轮补齐）。
- Independent draft review iteration 3: `acceptable as-is`（独立 fresh session `ses_fd1af89adffeMKv0FXhJx9OyG2`，2026-08-23）——iteration 2 B1/N1/N2 复核全部 resolved（append-on-completion 链 live 全核：engine.js :1196-1197/:1227-1228 + monitor.js :263-266 + 子文件 init 期 `forEachItem`/`status:"running"` 持久化 :430-441 + 原子写 :560-562；in-flight 面编辑时刻可查询 by construction；陈旧 running 残洞已记录并归裁定面）。最终挑战无 blocking 缺陷。非阻塞 3 项采纳收紧：N1 Phase 2 gate 核心条目消歧（in-flight 面仅子文件扫描；顶层映射限 post-hoc 面）；N2 路径形态归一化（forEachItem 相对路径 vs ToolExecution 绝对路径）入 matcher 与真值表；N3 非 forEach 单 child 分支 `forEachItem: null`（engine.js :1285）记为已知边界。共识达成，Plan Status → active。

## Closure Gates

- [ ] in-scope behavior is complete
- [ ] relevant docs are aligned
- [ ] verification has run（单测域插件链 + verify-age.sh 零回归 + 集成腿；命令在各 Proof 项固化）
- [ ] scoped verification is not conflated with full verification——若集成域降级为模块级，"verification scope limited" 显式标注并评估残险
- [ ] no in-scope item downgraded to deferred/follow-up
- [ ] independent draft review completed and recorded（无 run-state 案例裁定若仍存产品风险，须有 human/subagent review 结论）
- [ ] text consistency verified: status, phases, gates, and log all agree
- [ ] closure audit was independent
- [ ] closure evidence exists in files

## Deferred But Adjudicated

（draft 时点无新增；若 Phase 1 裁定收紧范围〔如匹配面缩窄〕，被移出项按格式立案并给 reopen trigger。）

## Closure

Status Note: （open — draft，未执行。）

Closure Audit Evidence:

- （待收口。）

Follow-up:

- （待收口；confirmed defects 不得出现在此。）
