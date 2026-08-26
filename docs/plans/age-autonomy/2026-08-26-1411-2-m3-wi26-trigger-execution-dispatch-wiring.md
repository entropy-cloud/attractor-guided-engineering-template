---
status: active
mission: age-autonomy-implementation
work-item: M3-WI26
group: "2026-08-26-1411"
verify: [test, verify-age]
---

# 2026-08-26-1411-2 M3 trigger 执行 + 派发面 + 机械验证机械化（age-autonomy M3-WI26）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M3 WI26（trigger 规则：从 `missions/autonomy.policy.yml` `triggers:` 段读取并执行 + 派发按 dispatch 映射解析具名 agent 并应用模型/组合 + plan frontmatter `agent:` 覆盖经守夜人路由 + claim TTL 续期信号）；显式移交收编：0925-1 Deferred「BUILD_VERIFY pass 行写入机械化」、0950-3 Deferred「gate 命令守夜人自动化执行（M3/WI26 mechanical-verification trigger 立项时收编）」、0815-2 WI14 残项「requireDistinctModel 派发时运行时强制」、0815-3 WI17 残项「Deep Audit 触发信号消费」、Follow-up P2「draft-from-roadmap.md step 4 自派评审与派发面冲突」
> Related: 前置 = `2026-08-26-1411-1`（WI25 supervisor 服务/decision-core 接口/meter writer/receipt 面/看门循环）；同批后继 = `2026-08-26-1411-3`（WI27 终态规则——消费本 plan 的 terminal 决策对象产出）

## Current Baseline

**policy `triggers:` 段 7 条规则只有语法零执行：parseTriggerWhen 钉住 14 谓词词表与解析树，无求值器、无派发通道、无模型组合解析；mechanical-verification 的执行体 verify-runner 已预登记但 unreachable；nothing-claim-guard 的 Deep Audit 触发信号无消费者；draft-from-roadmap.md 仍指示起草者自派评审后自行置 active（follow-up P2 在案，与守夜人派发面直接冲突）。**（live 核实 2026-08-26：`./verify-age.sh` L1+L2+L2.5 GREEN = 引擎 904 + 插件 223 + 真值表 113；1411-1 交付面以 plan 文字为准，Prereqs 保证执行序）

- **触发语法面（零执行语义）**：`missions/autonomy.policy.yml:131-146` 七条 trigger——mechanical-verification / closure-audit / plan-review / reclaim-claim（action）/ deep-audit（nothing→）/ draft-plans（findings=items→）/ terminal（partial/blocked）；文件头注「Execution semantics belong to M3/WI26 — schema-pinned syntax only」；TRIGGER_PREDICATES 14 谓词三形态（atom/cmp/call，law-policy.mjs:56-69）；parseTriggerWhen（law-policy.mjs:348）产出解析树——**求值面缺失**。
- **派发映射数据面（就绪未消费）**：`dispatch:` 六类型映射（plan-review→reviewer / closure-audit→auditor / deep-audit→auditor / mechanical-verification→executor / execute→executor / draft-plans→drafter，policy:170-176）；`agents:` 四具名（drafter/reviewer/auditor/executor，mode pooled/fresh + model 组合，policy:147-169）；auditor `requireDistinctModel: true` + `downgrade: single-model` 显式声明（policy:157-165）。
- **独立性运行时缺口**：checkDistinctModelSatisfiability（law-policy.mjs:509）只做静态可满足性；派发时实际模型对校验归本 plan（0815-2 WI14 残项注记：接口 = dispatch 行 `models=` 数据 + 本检查函数复用）。
- **机械验证执行体（预登记未接线）**：verify-runner.mjs 五导出（defaultVerifyKeys/resolveVerifyPlan/passLineFor/runVerifyCommand/runVerifyCommands，输出 passLine 按 01 §4.2 语法 + basisHash 同源）；build-bundle ALLOWED_MODULES unreachable-allowed 预登记（build-bundle.mjs:63-70/:221「M3 supervisor over verify-runner.mjs」）——零 import 改动即可接线；M2 消费面 = gate-check --verify（不写 plan 文件）；`## Verification` pass 行写盘唯一合法写者 = 守夜人/BUILD_VERIFY，守夜人接管归本 plan（0925-1/0950-3 Deferred 显式移交）。
- **触发信号无消费者**：nothing-claim-guard allow 结果携带 `trigger: {dispatch, when}` 信号（0815-3 交付，「M3 守夜人直连规则层消费」）；02 §4.4 守夜人派发 mission 级 Deep Audit 并自增 audit-rounds（01 §3.3）；预算闸 audit-rounds-overflow deny 超预算新 dispatch 行（max 双源 resolveMaxAuditRounds law-policy.mjs:483）——派发方须先读预算。
- **ModelSelection documented gap**：native-executor.ts:48「model / parseModel are explicitly ignored (documented gap, packaging doc §Behavioral differences)」；:207/:221-222 已有 agentProvider/agentModel 镜像通道——**reasoningEffort 与 policy agents.model 组合解析缺失**（WI26 字面「DSH 形态补 native-executor 的 ModelSelection documented gap」）；独立形态复用 config.js model/variant/agentFile 通道（WI26 字面）。
- **agent 覆盖面**：plan frontmatter `agent:` 可选引用 policy agents 名（01 §4.1 字段表——引用合法名，实际绑定由派发方解析，缺失时 dispatch: 默认）；守夜人路由归本 plan。
- **prompt 冲突面（follow-up P2 在案）**：`tools/mission-driver/prompts/draft-from-roadmap.md:34` step 4 指示起草者自派 sub-agent 评审 + 共识后自行置 active——引擎 REVIEW_PLANS 对已 active plan 空转，「评审独立性从流程结构保证退化为 prompt 纪律」；守夜人 plan-review trigger 落地后该指示与派发面双派发/写者错位冲突——本 plan Fix 收口。
- **claim 生命周期**：`claim-expired` 谓词（atom）→ `action: reclaim-claim`；回收写面 = claim-validity ④⑤（清除合法者 = holder ∨ dispatcher，law-rules 既有）；TTL 续期信号 = 活动信号（events/session 工具活动），「续期是否落账本于立项时定（终审 P2-1）」——本 plan Decision 裁定。
- **幂等键设计**：03 §5 occurrenceKey = `<planPath>#<occurrenceType>@<相关账本内容 hash8>`（账本派生值不另设 store）——派发面实现归本 plan；谓词面本身以账本回执为判据（review-dispatch-missing/closure-receipt-missing 等），天然幂等。
- **引擎协同面**：引擎 flow（CHECK→REVIEW_PLANS→EXEC→DRAFT→DEEP_AUDIT）是现行循环驱动（engine run 存续期 BUILD_VERIFY prompt 步保留——M2 过渡期写者裁定）；守夜人 trigger 以账本态为源，pass 行/回执已存在则谓词不命中（双驱动幂等协调）；竞态残险（引擎步与守夜人扫描同时派发）成文于 Phase 3。
- **WI25 交付面（Prereqs）**：decision-core 接口（dispatch 决策接入点）/ meter writer（audit-rounds/failures/claim 写函数 + law 自检）/ receipt 面 / 看门循环执行臂——本 plan 把 trigger 求值接进 decision-core、派发接进循环执行。
- **测试基线与 WI31 对齐**：引擎 904 / 插件 223 / 真值表 113；WI31 gate 字面要求 `plugin/dsh/test/supervisor-trigger.test.mjs` ≥20 用例（7 条 trigger 全覆盖）——本 plan 交付该文件并按 ≥20 起步。

## Goals

- trigger 求值核心：parseTriggerWhen 解析树 × 账本 snapshot × clock → 命中决策（14 谓词全实现；per-plan 与 mission 级双求值域钉住）。
- 派发面：dispatch 类型 → policy 映射 → 具名 agent → 绑定（DSH 形态 agentProvider/agentModel/reasoningEffort 三字段组合——补 documented gap；独立形态 config.js 通道纯解析 seam）；plan frontmatter `agent:` 覆盖路由；requireDistinctModel 派发点运行时强制（三态：满足/拒绝/显式降级 + models= lineage）；dispatch 行登记（账本 append-only 区，经 1411-1 writer）+ occurrenceKey 幂等。
- 七出口端到端（六执行 + 一转发）：mechanical-verification（awaitingClosure → verify-runner 直跑 → pass 行写盘 → 派发 closure-audit）/ plan-review（含 draft-from-roadmap.md step 4 Fix）/ reclaim-claim / nothing→deep-audit（信号消费 + audit-rounds 计量 + 预算闸尊重）/ draft-plans / closure-audit；terminal 出口产出决策对象转发 1411-3（声明边界）。
- claim TTL 续期：活动信号 → 续期；P2-1 裁定成文（rationale + 残险）。
- 文档同步 + roadmap WI26 回写。

## Non-Goals

- R1–R4 终态规则执行与 terminal 出口接线（WI27 / 1411-3——本 plan 求值器产出 terminal 决策对象即止）。
- WI21 残项「已批准立项例外判据精确化」（activePlanReferencing 结构近似——守夜人派发登记面落地后具备精确化条件，归后续 plan / M5-WI39 收口，本 plan 不改 law 规则）。
- agent 池化与 PromptAssembler（M4 WI32/WI33——本 plan 派发按 policy `mode` 字段透传，池生命周期不实现）。
- 崩溃恢复 resume-or-redispatch 完整语义（WI29——dispatch 行无结论时恢复策略；本 plan 只交付 occurrenceKey 幂等面）。
- 引擎 flow 步与 engine.js 改动（零引擎 diff——BUILD_VERIFY prompt 步保留，守夜人 pass 行写入与其经谓词幂等共存；物理退役随 M5 引擎判定门）。
- monitor 前端展示面。

## Task Route

- Type: `architecture change`（守夜人执行臂接线：trigger 求值 + 派发 + 机械验证写盘——跨 law/policy/ledger/supervisor 四面结构新增）
- Owner Docs: `docs/design/age-autonomy/02-rule-law.md` §3（triggers 语义）/§4.1（dispatch 行 + models= lineage）/§4.4（nothing→deep-audit 派发与计量）/§4.5（claim 生命周期）/§4.9（agents/dispatch 部署面 + requireDistinctModel）/§5（BUILD_VERIFY 机械化）；`docs/design/age-autonomy/03-supervisor.md` §3（trigger 与门禁同源）/§5（幂等）；`docs/design/age-autonomy/01-file-ledger.md` §3.3（audit-rounds）/§4.2（pass 行语法）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（同批次裁定）→ Skill: none

## Infrastructure And Config Prereqs

- Prereqs: `2026-08-26-1411-1` 收口（decision-core 接口 / meter writer / receipt 面 / 看门循环）。
- No infra prereqs beyond existing baseline（派发经 DSH native-executor 既有宿主面；verify-runner 经既有 assets 通道；零新增 npm 依赖）。

## Phase 1 — trigger 求值核心（纯函数）

Targets: `plugin/dsh/src/supervisor/`（求值模块，落点随 1411-1 目录结构）、`plugin/dsh/test/supervisor-trigger.test.mjs`（新——WI31 gate 命名面对齐）
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 1411-1

- [x] `Decision` **求值域模型**：per-plan trigger（`plan.*` 谓词按 plan record 逐一求值——plan-review/reclaim-claim/mechanical-verification/closure-audit 类）与 mission 级 trigger（draftPlans()/activePlans()/roadmap.*/deep-audit.*/terminal-claim 类）双域钉住；`terminal-claim` 谓词读动作记录面（`_tmp/<runDir>/terminal-claim.json`——nothing-claim-guard 拦截面同源）；cmp/call 形态类型校验（非数比较/非数算子 = 求值错误进观察日志非崩溃——fail-soft，守夜人不因畸形数据停摆）。备选：全部 mission 级求值——否决，`plan.*` 谓词语义按定义 per-plan（02 §3 示例「plan.status=draft」逐 plan 判定）。残险：双域判定漏配——真值表按七 trigger × 双域钉住。
- [x] `Add` 求值器：14 谓词实现（atom/cmp/call 三形态 × and/or/not 树求值）over snapshot——ledger 谓词族（draftPlans/activePlans/heldPlans）+ roadmap scan（roadmap.unchecked/roadmap.all-done）+ verify pass 行判定（mechanical-verification-missing/pass——basisHash 失配视 missing）+ 回执区判定（closure-receipt-missing/review-dispatch-missing = dispatch 行与同 id 结论行配对态）+ claim-expires × clock 注入 + deep-audit.accepted-findings（roadmap DAR 最近 accepted 行 findings 词法）；命中产出决策对象（dispatch <type> | action reclaim-claim | terminal <value> + 目标 plan/上下文/occurrenceKey 材料）。
- [x] `Proof` trigger 求值真值表：`node --test plugin/dsh/test/supervisor-trigger.test.mjs` ≥20 用例（WI31 gate 字面下限起步）——七条 policy trigger 全覆盖正反例 + 谓词形态矩阵（cmp 畸形值/call 比较算子 =0/>0）+ per-plan/mission 双域 + 时钟注入边界（claim-expired < = >）+ basisHash stale 视 missing。命令：`node --test plugin/dsh/test/supervisor-trigger.test.mjs`（经 `./verify-age.sh` L2 同跑）。

Exit Criteria:

- [x] 14 谓词全实现 + 三形态语法消费；七 trigger 正反例全绿；求值器纯函数（clock/snapshot 注入零 IO）
- [x] `pnpm --prefix tools/mission-driver test` 全绿（回归确认，基线 ≥904 只增）
- [x] `docs/logs/` 更新

## Phase 2 — 派发面与模型组合

Targets: `plugin/dsh/src/supervisor/`（派发解析链）、`plugin/dsh/src/native-executor.ts`（ModelSelection 组合消费面）、`plugin/dsh/test/supervisor-dispatch.test.mjs`（新）
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: Phase 1

- [x] `Decision` **requireDistinctModel 运行时强制形态**（0815-2 WI14 残项收口）：派发点校验 auditor 绑定模型对 ≠ 执行者绑定模型对（provider/model 二元组——比对逻辑从 checkDistinctModelSatisfiability 抽出共用纯函数，零第二实现）；不满足且无降级声明 → 拒绝该次派发 + 观察日志显式记录；policy `downgrade: single-model` 在场 → 不拒绝，按 0815-2 先例在 dispatch 行写诚实 `models=` lineage（exec/aud 同型如实记录）。
- [x] `Add` 派发解析链：dispatch 类型 → policy `dispatch:` 映射 → 具名 agent def → 绑定产出——DSH 形态 model 组合 → `agentProvider`/`agentModel`/`reasoningEffort` 三字段（补 native-executor documented gap :48；:207/:221-222 既有镜像通道扩展）；独立形态 = config.js model/variant/agentFile 通道复用（纯解析层 + 文档 seam，CLI runner 不交付——1411-1 形态裁定）；plan frontmatter `agent:` 覆盖路由（合法名 → 覆盖默认映射；缺失/未定义名 → dispatch: 默认并注记）。
- [x] `Add` dispatch 行登记 + occurrenceKey 幂等：派发时经 1411-1 writer 在目标账本 append-only 区写 dispatch 行（评审进 `## Draft Review Record`、审计进 `## Closure`/roadmap `## Deep Audit Record`，含 `models=` lineage 后缀——01 §4.2 语法）；幂等键 = `<planPath>#<occurrenceType>@<相关账本内容 hash8>`（03 §5 账本派生——重启重扫账本即答「已派/已完/被谁持有」，不另设 store；同 occurrence 二派拒绝）。
- [x] `Proof` 派发面测试：`node --test plugin/dsh/test/supervisor-dispatch.test.mjs`——映射解析矩阵（六 dispatch 类型 × agent: 覆盖/默认/未定义名三态）+ ModelSelection 三字段产出（含 reasoningEffort）+ requireDistinctModel 三态（满足/拒绝/降级声明 + lineage 写入）+ occurrenceKey 幂等 + dispatch 行写入经 law 自检（append-only/closure-audit-binding allow 面）。

Exit Criteria:

- [x] 六 dispatch 类型解析全通；agent: 覆盖路由正确；模型组合三字段落地（native-executor gap 注记同步更新）
- [x] requireDistinctModel 三态行为正确；models= lineage 写入与 0815-2 静态面同源
- [x] `git diff --stat tools/mission-driver/src/engine.js` 为空；零新增 npm 依赖
- [x] `docs/logs/` 更新

## Phase 3 — 七出口端到端接线 + claim 生命周期 + prompt 对齐

Targets: `plugin/dsh/src/supervisor/`（执行臂）、verify-runner 接线（build-bundle closure 登记）、`tools/mission-driver/prompts/draft-from-roadmap.md`（step 4 Fix）
Skill: none

- Item Types: `Add | Fix | Decision | Proof`
- Prereqs: Phase 2

- [x] `Add` mechanical-verification 端到端（0925-1/0950-3 Deferred 收编）：decision-core 接入 trigger 求值 → 命中 → `resolveVerifyPlan` + `runVerifyCommands`（verify-runner；build-bundle 从 unreachable-allowed 转 closure 登记）→ 全过 → writer 写 `## Verification` pass 行（basisHash 同源绑定全勾内容）→ 派发 closure-audit；有失败 → 不写 pass 行 + 回执（failures 归因计量归 1411-3，本 plan 只回执）。幂等：`mechanical-verification-pass` 谓词读 pass 行——引擎 BUILD_VERIFY 步已写则不重跑（双驱动共存协调成文：谓词面读账本，不读意图 store）。
- [x] `Fix` plan-review 出口 + draft-from-roadmap.md step 4 对齐：trigger 命中（`plan.status=draft ∧ review-dispatch-missing`）→ 派发 reviewer（dispatch 行进 Draft Review Record）；step 4 文字改为「起草后保持 draft；评审由守夜人/引擎 REVIEW_PLANS 派发独立 reviewer；起草者不得自派评审、不得自行置 active」（follow-up P2 收口——评审独立性从 prompt 纪律回到流程结构；改动后 `pnpm --prefix tools/mission-driver run lint:prompts` 须绿）。
- [x] `Add` nothing→deep-audit + draft-plans + closure-audit 出口：nothing-claim-guard 触发信号消费（规则 allow 结果携带 `trigger: {dispatch, when}`——守夜人直连规则层读取）→ 派发 mission 级 Deep Audit + meter 自增 audit-rounds（1411-1 writer，01 §3.3）+ 预算闸尊重（派发前 `audit-rounds < maxAuditRounds`，resolveMaxAuditRounds 同源——与 audit-rounds-overflow deny 面对齐）；`deep-audit.accepted-findings=items` → 派发 draft-plans；closure-audit 派发（mechanical-verification 后续 + `full-tick ∧ pass ∧ closure-receipt-missing` 直达两路）。
- [x] `Add` reclaim-claim + claim TTL 续期（P2-1 裁定）：`plan.status=active ∧ claim-expired` 命中 → writer 回收（清除/替换 claim per claim-validity ④⑤——dispatcher 清除合法面）+ 重派执行；活动信号（events/session 工具活动）→ 续期。**P2-1 裁定**：续期**写账本**（claim-expires 顺延经 writer，bounded 上限——续期不越过单次执行总墙钟，03 §7 停滞熔断兜底）；理由：TTL 语义完整（claim-validity「未过期」面可执法），仅观察日志会使合法执行中途被判过期回收；残险：活动信号伪造使 claim 无限续期——bounded 上限 + 停滞指纹（WI30）双兜底，成文接受。
- [x] `Proof` 端到端：supervisor-trigger 扩展回归（出口接线后七 trigger 全绿）+ 构造 fixture 全链（full-tick plan → mechanical-verification 直跑注入安全 fixture 命令（echo 类，不触真实 test 面）→ pass 行落盘合法（plan-check/deriveCompleted 视角断言）→ closure-audit dispatch 行在位）+ reclaim/续期时钟边界（< = > + bounded 上限）+ 双驱动幂等（pass 行已存在不重跑）。命令：`node --test plugin/dsh/test/supervisor-trigger.test.mjs` + `node --test plugin/dsh/test/supervisor-dispatch.test.mjs` + `pnpm --prefix tools/mission-driver run lint:prompts`。

Exit Criteria:

- [x] 七出口中六出口端到端可测；terminal 出口产出决策对象转发 1411-3（声明边界成文于测试注记）
- [x] verify-runner 从 unreachable-allowed 转 closure 登记（build-bundle --check 输出面 + packaging doc 计数如有变动同步）
- [x] draft-from-roadmap.md step 4 与派发面对齐；lint:prompts 绿；prompt-check 经 test 链绿
- [x] `pnpm --prefix tools/mission-driver test` + `./verify-age.sh` 全绿（引擎 ≥904 / 插件 ≥223 / 真值表 ≥113 只增；supervisor-trigger ≥20）
- [x] `docs/logs/` 更新

## Phase 4 — 文档同步与回写

Targets: `tools/mission-driver/CONTEXT.md`、`docs/architecture/dsh-plugin-packaging.md`、roadmap、`docs/logs/`
Skill: none

- Item Types: `Add`
- Prereqs: Phase 3

- [x] `Add` 文档同步与回写：CONTEXT.md 增 trigger 执行段（求值器/派发链/P2-1 裁定/双驱动幂等协调）；packaging doc（native-executor ModelSelection gap 注记更新 + supervisor 执行臂条目 + verify-runner closure 登记）；roadmap WI26 tick + 证据指针（求值器 + 派发链 + 测试计数 + 三 Deferred 收编注记 + WI14 残项收口注记）+ Last Updated 同步；Follow-up P2「draft-from-roadmap step 4」行 absorbed-by 注记；`docs/logs/` 收口条目。

Exit Criteria:

- [x] roadmap WI26 `[x]` + 证据指针；Last Updated 同步；Follow-up 对应行 absorbed-by 指针在册
- [x] CONTEXT.md / packaging doc 增量在位；`docs/logs/` 收口条目
- [x] `./verify-age.sh` 全绿（L2.5 corpus 覆盖本 plan）

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-26-1411-2-m3-wi26-trigger-execution-dispatch-wiring-1-b7d24e15 to ses_reviewer_2026-08-26-1411-2
- 2026-08-26：iteration 1，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-26-1411-2-m3-wi26-trigger-execution-dispatch-wiring-1-b7d24e15（独立评审 ses_reviewer_2026-08-26-1411-2：零阻塞项——baseline 全实证（policy :131-146/:147-169/:170-176、law-policy :56/:348/:483/:509、verify-runner 五函数导出、build-bundle :63-70/:221、native-executor :48/:207/:221-222、draft-from-roadmap.md:34、0925-1/0950-3 Deferred + WI14/WI17 残项 + Follow-up P2 逐条核对属实）；WI26 字面全覆盖（七出口六执行一转发 + dispatch 映射解析具名 agent + ModelSelection 三字段补 gap + config.js 通道 + agent: 路由 + TTL 续期/P2-1 裁定含 rationale+残险）；draft-from-roadmap step 4 正确 typing 为 Fix（live 缺陷非 Follow-up）；gate-check 结构面 allow exit 0。非阻塞 4 项——① 1411-1「sustain 实现归 1411-2」与 Deferred「claim 生产发放（execute 派发签发）归 1411-2 派发面」在本 plan 无显式落点：reclaim 重派（Phase 3 第 4 项）交付 writer 换发面，初始 execute 派发按 0815-3 过渡裁定仍归引擎 EXECUTE prompt 供给——建议执行期以 baseline 句或 Deferred 条目显式 disposition，防批次冷读悬空；② Current Baseline「law-policy.mjs:56-69」实际数组跨 :56-71；③「verify-runner.mjs 五导出」措辞——命名五函数属实，另有 4 常量导出；④ engine.js 零 diff 判据仅 Phase 2 出口在册，Phase 3/4 收口冷放时建议同项复核）

## Verification

- pass test gate-check-20260826T110231 basisHash=d91753eae95c11b2d3b453ee621cb262107f6410d17392d03a843a5a0105137a exit=0
- pass verify-age gate-check-20260826T110231 basisHash=d91753eae95c11b2d3b453ee621cb262107f6410d17392d03a843a5a0105137a exit=0

## Closure

- dispatch audit #audit-2026-08-26-130203-mission-driver-2026-08-26-1411-2-m3-wi26-trigger-execution-dispatch-wiring-1-8c13b443 to ses_auditor_2026-08-26-1411-2 models={exec:zhipuai/glm-5.2,aud:zhipuai/glm-5.2}
- accepted #audit-2026-08-26-130203-mission-driver-2026-08-26-1411-2-m3-wi26-trigger-execution-dispatch-wiring-1-8c13b443：approved——独立收口审计通过（2026-08-26，ses_auditor_2026-08-26-1411-2 独立 session；单模型 exec/aud 同型按 policy `downgrade: single-model` 声明如实记录，承 1411-1/0950-1 先例）。① 计数域 28/28 全勾（Phase 1 三项+三 Exit、Phase 2 四项+四 Exit、Phase 3 五项+五 Exit、Phase 4 一项+三 Exit）、无 `- [ ]` 残留、Draft Review Record iteration 1 回执在册（acceptable-as-is，四非阻塞项均已在执行期处置或注记）。② 工件实证（live 抽查）：`plugin/dsh/src/supervisor/` 八文件在库，三新件齐——`trigger-eval.ts`（14 谓词双域 fail-soft 纯函数 + occurrenceKey 材料）、`dispatch-resolve.ts`（映射→具名 agent→三字段绑定；`agent:` 三态路由；requireDistinctModel 三态，比对共用 `src/law-policy.mjs:505` `sameModelPair` 零第二实现）、`exec-arm.ts`（七出口执行臂：verify-runner 经 assets 副本 import `:50` 直跑写 pass 行 + 派发登记 + 预算/计量同写 + `renewClaim:630` bounded 续期 + terminal 转发注记）；反空转实证：watchdog `:62` import executeTriggerHit 路由命中（运行时可达）、`decide()` triggers 段在场切 execute posture（decision-core `:302-321`）、`noteActivity:407` 活动信号面接 `renewClaim:246`；native-executor ModelSelection documented gap 收口（`nativeModelSelection` 三字段 override + `installModelSelection`，头注 :48 更新）；build-bundle verify-runner 注记转「M3/WI26 已消费」（插件侧 live 消费方，引擎闭包不可达属设计）；`prompts/draft-from-roadmap.md` step 4 重写为守夜人/引擎派发（Follow-up P2 收口）+ assets 副本同步。③ 命令复跑：`gate-check <plan> --verify` 机械产出双 pass 行 exit=0——test 引擎 907/907 + prompt-check OK、verify-age L1+L2+L2.5 GREEN（真值表 113/113），basisHash=d91753ea…5137a 与当次 plan basis 一致；supervisor-trigger 43 / supervisor-dispatch 22 / supervisor-core 23 零改动（L2 链内）。④ 不变量实证：`git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff）、`tools/mission-driver/package.json` 无 diff（零新增 npm 依赖）、flows/*.json 零改动。⑤ 回写实证：roadmap WI26 `[x]` 全证据指针 + 头部 Last Updated 同步 + Follow-up round-2 P2 absorbed-by 指针在册；CONTEXT.md「守夜人 trigger 执行 + 派发面」段在位；`docs/architecture/dsh-plugin-packaging.md` WI26 增量（状态头/src 树三件/Copy 计数注记/Behavioral differences/Service Surface）在位；`docs/logs/2026/08-26.md` 四 Phase 收口条目在册。⑥ Deferred 诚实性：两项（terminal 出口执行 → 1411-3/WI27；BUILD_VERIFY prompt 步物理退役 → M5/WI37）均与 Non-Goals 对应、Successor Required: yes 已登记，0925-1/0950-3/WI17/WI14 残项四收编注记在 roadmap 在册，无 in-scope 缺陷藏匿 Deferred。结论：28/28 计数域全勾 + 双 pass 行 basisHash 绑定 + 本回执对满足 01 §5.2 完成派生公式。

## Deferred But Adjudicated

### terminal 出口执行

- Classification: `watch-only residual`
- Why Not Blocking Closure: 本 plan 交付 terminal 决策对象产出与转发接口；R1–R4 序贯求值/终态回执/循环停派 = 1411-3（WI27），边界经测试注记钉住。
- Successor Required: yes（1411-3 / M3-WI27）

### BUILD_VERIFY prompt 步物理退役

- Classification: `watch-only residual`
- Why Not Blocking Closure: 引擎 run 存续期 BUILD_VERIFY 保留（M2 过渡期写者裁定 + 双驱动幂等协调：谓词面读 pass 行防双写）；守夜人接管写入面后 prompt 步成为冗余但无害。
- Successor Required: yes（M5/WI37 引擎退役判定门评估删除时机）
