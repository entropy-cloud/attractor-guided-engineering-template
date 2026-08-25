---
status: active
mission: age-autonomy-implementation
work-item: M2-WI22
group: "2026-08-25-0950"
verify: [test, verify-age]
---

# 2026-08-25-0950-2 M2 证据面重建：run-state 去权威化 + plan-status-gate 迁移/退役 + legacy 审计通道退役（age-autonomy M2-WI22）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M2 WI22；契约 owner `docs/design/age-autonomy/02-rule-law.md` §2（信任模型/A1 裁定）/§4.1（CI 结构面强度）、`docs/design/age-autonomy/01-file-ledger.md` §5.2（完成派生——唯一证据面）；deep-audit Follow-up Backlog round-1 P2（duplicate-anchor 结构 error）与 0815-3 基线裁定（外部审计通道「退役余项归 WI22」）
> Related: 前置 `2026-08-25-0815-{2,3}`（closure-audit-binding/plan-completed 写时执法 + append-only 门禁——本 plan 撤除其前的 run-state 证据通道）；`2026-08-25-0925-1`（WI41 收口路由——引擎路由面已账本感知，本 plan 清偿插件侧同类）；`2026-08-25-0925-2`（WI42 读面接线——ledger 读 seam 一等公民化）；同批：`2026-08-25-0950-1`（N=1，WI21 P8 自护——本 plan 落点含 law 文件族与 policy，须走其「已批准立项」例外通道，故执行序在 N=1 后）；0925-1 Deferred（monitor 显示面 defaultVerifyKeys 注入——本 plan 裁定其归属）

## Current Baseline

**plan 完成态的证据仍有两条真相通道：插件侧 plan-status-gate 以 run-state 子流程文件为 allow/deny 依据（F1/F2/F3），引擎侧 deep-audit-loop 以 `docs/audits/` 外部审计文件的 open 状态为路由条件（openAudits()）——两者都与「plan frontmatter/closures 是唯一证据面」的设计相悖；且 scanPlanLedger/scanRoadmapLedger 对重复 append-only 锚点静默容忍，重复区回执从派生面消失。**（以下事实 2026-08-25 live 核实；0815/0925 批次尚未执行——其交付面以 plan 文字为准，本 plan 的 Prereqs 保证执行序）

- **plan-status-gate 现状（run-state 证据面的活载体）**：`plugin/dsh/src/plan-status-gate.ts`（457 行，dsh-plugin M3-WI13 产物）——拦截 write/edit/str_replace_editor 写入 legacy `> Plan Status: completed` 行（matcher `PLAN_STATUS_RE` 自 assets/ledger-dualread 副本 import），证据面 = 祖先 `_tmp/<runId>` 下 `run-state-*.json` 子文件扫描（`scanSubflowMatches` :321-355）：F1 in-flight（status running）/ F2 CLOSURE_AUDIT completed step / F3 BUILD_VERIFY-or-subflow completed。挂载点 service.ts:106（`registerPlanStatusGate`）；fail-open try/catch；dual-form asymmetry 成文（独立 CLI 形态无 pre-execute 边界无门禁）。**对 frontmatter plan 完全盲视**（matcher 只认 legacy 状态行）——0815-2 的 `plan-completed` 规则才是 frontmatter 全勾过渡的执法面。测试 `plugin/dsh/test/plan-status-gate.test.mjs` 钉住其行为。
- **law 执法面就位后（Prereqs）的冗余度**：0815-2 交付 closure-audit-binding（回执配对+写者断言）+ plan-completed（全勾三岔）+ 终态冻结后，run-state 证据面（F1/F2/F3）与「AI 报告 = 文件写入本身」的零信任模型冲突——run-state 是引擎执行痕迹，不是账本回执；且其「in-flight 放行」面（F1）允许无回执的进行中写入，在账本语义下应由 claim（0815-3 claim-validity）承担。**迁移或退役是本 plan 的核心裁定**（roadmap WI22 字面）。
- **legacy 冻结面的保护缺口**：plan-status-gate 拦的是「legacy completed 行写入」；退役后该面须有承接（54 份 legacy completed plan——live 全树 `> Plan Status: completed` 头行计数，0635-1/2 收口后语料——是永驻终态语料，00-guide Changelog「stay legacy forever」；01 §5.1 终态 = 重新开工须新 plan）。承接选项：law 结构规则（legacy 行写 deny，例外同 P8/立项通道）或保留 gate 原 matcher 换证据面。
- **引擎侧 openAudits 通道现状**：`flow-loader.js:44` `AUDIT_STATUS_RE`（`> **Audit Status**: ...` 行）+ :96 `_scanOpenAuditsList(auditsDir)` + :347 导出（含 `_isMissionLevelAudit`）；消费面 = `flows/deep-audit-loop.json:24/:63` `when: "openAudits().length > 0"`（CHECK_OPEN_AUDITS / SCAN_NEW_RESULTS 两步的分支条件）；测试消费 = `test/audit-convergence.test.js`、`test/draft-plans-audit-gate.test.js`。M1-WI8 已把外部审计生命周期迁移内联（`> Last Reviewed`/`> Source Audits`/docs/audits 跨文件状态消解），0635-3 裁定该通道「保留为 legacy-only」、0815-3 基裁定「完整退役归 WI20+WI22 track——退役余项归 WI22」。
- **corpus 开放状态清点（live 实测 2026-08-25 评审期）**：全树 `> Audit Status` 行 6 条——**1 条 open**（mission 级：`docs/audits/mission-driver-step-audit/2026-07-21-0919-multi-audit-mission-driver-step-audit.md`，`> Audit Type: multi-dimensional`——`openAudits()` 今日计入）+ 5 条 `planned`（`normalizeLegacyStatus` ≠ open，不计入）。age-autonomy 自身 auditsDir（`docs/audits/age-autonomy/`）干净。**该 open 记录是另一 mission（mission-driver-step-audit）的审计文档**，其状态行必须在通道退役前机械关闭（否则 `openAudits()` 恒非空，流程语义与退役前提不符）——Phase 2 落为确定项。
- **duplicate-anchor 容忍（deep-audit round-1 P2 立案）**：`scanPlanLedger`/`scanRoadmapLedger` 对 append-only 锚点（`## Closure`/`## Verification`/`## Draft Review Record`/`## Deep Audit Record`）只扫首个区块（plan 面首锚定守卫 `!anchors.has()` 型 ~:277；roadmap 面 `deepAuditBlock === null` ~:360），重复锚点区块内的回执从派生面消失且无结构 error——证据完整性缺陷，正是本 plan 证据面主题的组成部分。Follow-up Backlog 字面：「建议补 duplicate-anchor 结构 error」。
- **引擎队列证据面（对照面，不在本 plan 动）**：主流程 `flows/mission-driver.json:50/:75` forEach `activePlans()`/`draftPlans()` 经 flow-loader `_scanPlansByStatus` 读 plan 文件（M1 双读 + 0925-1 defaultVerifyKeys 注入）——引擎队列权威已是 plan 文件；run-state 作为**引擎内部步骤机**（step 路由/subflow 执行/监控显示）的权威不在 WI22 字面内，不动。
- **monitor 显示面（0925-1 Deferred 的归属裁定）**：monitor.js:840 `planLedgerState(content)` 无 defaultVerifyKeys 注入；其 mission 读取为裸 JSON.parse 不走 extends 合并（deep-audit round-2 P2 已单列）。**裁定：不在本 plan 收编**——显示面无回执/路由后果，在未合并配置上注入默认键有显示误读风险（0925-1 Deferred 原裁定理由仍成立），归属 monitor-extends P2 修复时顺带（见 Deferred But Adjudicated）。
- **P8 例外通道前置**：本 plan 落点含 `plugin/dsh/src/law/**` 与 `missions/autonomy.policy.yml`（N=1 落地后 P8 保护）——本 plan 自身的 active 状态 + 本节声明构成「已批准立项」例外；执行序钉在 N=1 后。
- **测试基线**：`pnpm --prefix tools/mission-driver test` 813 green + `npm --prefix plugin/dsh test`（plan-status-gate.test.mjs 在列）（2026-08-25 评审期实测；执行时以当日实测为准且不得回退）。`ledger-sections.mjs`/`ledger-dualread.mjs` 改动后须重建 plugin assets。

## Goals

- plan-status-gate 迁移或退役裁定落地：run-state 证据面（F1/F2/F3）从 plan 完成态裁决面移除；legacy 冻结保护面有承接（结构规则或迁移后 gate）；service.ts 挂载面与测试同步。
- 引擎 legacy 审计通道退役：`_scanOpenAuditsList`/`AUDIT_STATUS_RE`/`_isMissionLevelAudit` 移除，deep-audit-loop 分支条件按裁定简化，消费测试迁移；退役前置 = docs/audits 开放状态清点为零（或先机械归一）。
- duplicate-append-only-anchor 结构 error：`scanPlanLedger`/`scanRoadmapLedger` 对重复锚点报结构错误（不再静默丢弃派生面）；存量 corpus 零重复锚点断言 + assets 重建。
- 证据面单一性成文：run-state 在 plan 完成态裁决中的残留消费面清点为零（grep 级证明）；CONTEXT.md 与架构 owner-doc 同步。

## Non-Goals

- 引擎 run-state 作为步骤机/监控显示面的权威（`subflowRuns`、stepLogs、monitor RunDetail 显示——非 plan 完成态证据，不动）。
- BUILD_VERIFY pass 行写入机械化与守夜人（0815-3 Phase 3 已交付 runner 面；执行者归 M3）。
- monitor extends 合并修复与其顺带的 defaultVerifyKeys 注入（deep-audit round-2 P2，另案——本 plan 只裁定归属，见 Deferred）。
- `prompts/draft-from-roadmap.md` step 4 的评审独立性问题（Follow-up round-2 P2——评审独立性的执法面已由 0815-2 writer-identity 交付，prompt 措辞面归 M2 收口批次评估，非本 plan 字面）。
- `<AI_STEP_RESULT>` marker 物理删除（M5 评估）。
- pre-commit hook / CI 接线（WI23 / 同批 N=3）。

## Task Route

- Type: `architecture change`（证据面重建：插件门禁证据源切换/移除 + 引擎 legacy 通道退役 + 账本结构加固）
- Owner Docs: `docs/design/age-autonomy/02-rule-law.md` §2/§4.1、`docs/design/age-autonomy/01-file-ledger.md` §5.2/§4.2、`tools/mission-driver/design/mission-driver-flow-design.md`（deep-audit-loop 子流程设计——退役改动的流程语义依据）、`docs/architecture/dsh-plugin-packaging.md`（插件结构 owner-doc，plan-status-gate 条目同步——0925-3/WI43 已把该文件契约同步立项，本 plan 的结构变更同步进其收口后的基线）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（同 0815/0925 批次裁定）→ Skill: none

## Infrastructure And Config Prereqs

- Prereqs: `2026-08-25-0815-{2,3}`（回执/完成/claim 执法面——退役 run-state 证据面的替代承受力）、`2026-08-25-0925-1`/`-2`（引擎路由与读面账本化）、`2026-08-25-0950-1`（P8 自护——本 plan 的 law/policy 写入走其例外通道）。
- No infra prereqs beyond existing baseline（不改 engine.js；deep-audit-loop.json 的 when 条件面变更属 flow 配置非状态机核心，且由本 plan 覆盖；不新增 npm 依赖）

## Phase 1 — plan-status-gate 迁移/退役裁定与 legacy 冻结承接

Targets: `plugin/dsh/src/plan-status-gate.ts`（退役则删除/迁移则重写证据面）、`plugin/dsh/src/service.ts`（挂载面）、law 内核（legacy 冻结承接规则）、`plugin/dsh/test/plan-status-gate.test.mjs`、`plugin/dsh/test/law-truth-table.test.mjs`、`missions/autonomy.policy.yml`
Skill: none

- Item Types: `Decision | Add | Fix | Proof`
- Prereqs: 0815-2/3（law 执法面就位）

- [ ] `Decision` **迁移 vs 退役裁定**：选择 = **退役 + 保护收编**。plan-status-gate 的三面拆解：①「拦 legacy completed 行写入」的保护语义 → 收编为 law 结构规则 `legacy-plan-freeze`（plan 域内 .md 的 proposedContent 出现 legacy 终态状态行（`> Plan Status: completed|cancelled|superseded|deferred`）的写入/改写 → deny，例外 = human/CI/已批准立项——与 P8 同型例外通道，直接 enforce：终态冻结语义 0815-2 已获授权，本规则是其 legacy 面补全）；②「run-state 证据面 F1/F2/F3」→ 废弃（账本回执 + claim 是唯一证据面；run-state 是执行痕迹不是回执——01 §5.2 完成公式的合取项里没有它）；③「pre-execute 挂载与 fail-open 姿态」→ law 适配层已有（0815-1），gate 的独立挂载点撤销。备选 A：原地迁移（保留 gate 文件，把 scanSubflowMatches 换成 planLedgerState/deriveCompleted）——否决：与 law 内核 plan-completed 规则形成第二实现（01 §5.2「不得各自带正则」纪律），且 457 行中约七成是 run-state 扫描与路径形态处理，迁移后所剩无几；备选 B：纯删除不收编——否决：legacy 54 份 completed 语料（live 计数同 Current Baseline）失去写入防护，终态冻结在 legacy 面空转。残险：legacy 行的正则宽容度（bold/大小写/尾空格容错）须与 `PLAN_STATUS_RE` 等价承袭，防词形绕过——真值表钉住既有容错形态。
- [ ] `Add` `legacy-plan-freeze` 规则（law 内核）：matcher = plan 域（N=1 path-guardrail 同域）.md 写入；判定 = proposedContent 中 legacy 状态行值为终态集 ∨ currentFileState 有而 proposedContent 改写/删除该行（改写为非终态 = un-freeze 尝试，同 deny）；例外通道同 P8。注册 `mode: enforce`。
- [ ] `Fix` plan-status-gate 退役执行：删除 `plugin/dsh/src/plan-status-gate.ts` 与 `plugin/dsh/test/plan-status-gate.test.mjs`；service.ts 摘除 import 与挂载（:50/:103-107 一带，挂载日志摘要同步）；`docs/architecture/dsh-plugin-packaging.md` 的 plan-status-gate 条目与 import 图同步（若 0925-3/WI43 已收口该文件则在其基线上增量，否则本 plan 补该条目——两 plan 执行序保证无冲突）。
- [ ] `Proof` 真值表：legacy-freeze 正反例（legacy completed 行写入 deny / 援引 active plan allow / human allow；非 plan 域 .md 带 status 字样 allow；bold/大小写字形全矩阵）；`npm --prefix plugin/dsh test` 全绿（plan-status-gate 测试移除后套件数变化成文，closure/freshness/smoke-import 绿）；plugin 服务冒烟——law 适配层监听独立于被删 gate（0815-1 设计的并存面此时收敛为单监听器）。

Exit Criteria:

- [ ] `grep -rn "scanSubflowMatches\|registerPlanStatusGate" plugin/dsh/src/` 零命中（run-state 证据面从插件源面移除）
- [ ] legacy-freeze 承接规则真值表全绿（含 PLAN_STATUS_RE 等价字形容错矩阵）
- [ ] `npm --prefix plugin/dsh test` + `pnpm --prefix tools/mission-driver test` 全绿
- [ ] `docs/logs/` 更新

## Phase 2 — 引擎 legacy 审计通道退役与 duplicate-anchor 结构 error

Targets: `tools/mission-driver/src/flow-loader.js`、`tools/mission-driver/flows/deep-audit-loop.json`、`tools/mission-driver/src/ledger-sections.mjs`、`tools/mission-driver/test/audit-convergence.test.js`、`tools/mission-driver/test/draft-plans-audit-gate.test.js`、`plugin/dsh/scripts/build-bundle.mjs`（assets 重建）
Skill: none

- Item Types: `Decision | Add | Fix | Proof`
- Prereqs: Phase 1（退役先于通道清理，保持单 PR 面内聚）

- [ ] `Proof` **退役前置清点复核**（先证后拆）：live 复核 `docs/audits/**` 的 `AUDIT_STATUS_RE` 命中与开放状态，与 Current Baseline 2026-08-25 评审期计数（6 命中 / 1 open mission 级 / 5 planned）对账——数目漂移则更新清点记录并按下项处置新增 open 记录后继续。复核结果记入收口证据。
- [ ] `Add` **开放记录机械关闭**（确定项，非 contingency）：`docs/audits/mission-driver-step-audit/2026-07-21-0919-multi-audit-mission-driver-step-audit.md` 的状态行改写为关闭态（closed/resolved + 一行处置注记指向其 findings 的实际去向；该记录属 mission-driver-step-audit mission 的 auditsDir，跨 mission 文档的机械状态归一——本 plan 只改状态行与注记，不重写内容）。处置理由：该 open 态使 `openAudits()` 恒非空，通道退役的流程等价前提（零开放记录）不成立；关闭是账本语义下「外部状态行不再是证据面」的对应机械动作。
- [ ] `Decision` **deep-audit-loop 形态裁定（step 节点删除入范围）**：选择 = 删除 `CHECK_OPEN_AUDITS` 与 `SCAN_NEW_RESULTS` 两个 step 节点——`entry` 改 `"MULTI_AUDIT"`；`MULTI_AUDIT` 的 transitions `clean/issues → OPEN_AUDIT`、`onError → OPEN_AUDIT` 保持；`OPEN_AUDIT` 的**otherwise / transitions / onError 三处**从 `→ SCAN_NEW_RESULTS` 全部改为终态 `{done: "completed"}`（三处全改——只改 transitions/onError 会留下 `otherwise` 悬空 goto；`loadFlowFile` 对 step 引用零校验（flow-loader.js:291-296，live 核实只做 JSON.parse + prompt/script 解析），悬空 goto 加载绿、运行期才以 `unknown_step` 终态爆（engine.js ~:1645，`openAuditPrompt == ''` 的 otherwise 分支恰是测试不常走的路径）——故 Proof 须含「无悬空引用」守护断言，见下）。**语义等价依据（钉住引擎 when 语义）**：engine `when` 缺省 = 条件块跳过、步**执行**（engine.js ~:1753-1756，无 pass-through 步类型）——零开放记录时 CHECK_OPEN_AUDITS 走 `otherwise → MULTI_AUDIT`、SCAN_NEW_RESULTS 走 `otherwise → {done: completed}`，节点删除后的 entry/终态直连与该行为逐分支等价（开放记录非零的前置清点保证等价前提成立）。`prompts/draft-from-audit.md` 随两节点删除而不再被 flow 引用——prompt-check 对未被 flow 引用的 prompts 只 lint 不验 marker（live 核实的既定行为），文件**删除**（mission config 的 prompts 映射不含 draftFromAudit，无悬空引用面）。备选：节点保留 + 字面 `when: "false"`（expression.mjs 求值 false 已验证可行）——否决：留下永假分支与死代码，「退役」名不副实，且 expression 函数注册表的死键污染 M3/WI26 trigger DSL 迁移面；备选 B：只删函数留 `when` 引用——否决：flow 加载即 broken。残险：flow 形状变更影响 DEEP_AUDIT 子流程行为——等价性由上述逐分支对照 + 前置清点钉住；`maxTotalSteps`/`maxCycleVisits`/`pingPongWindow` 计量随节点减少只松不紧；`test/helpers.js` 的私有 self-contained deep-audit-loop fixture（entry: CHECK_OPEN_AUDITS，subflow-state-isolation.test.js 消费）不加载真实 flow JSON 不受破坏，但其拓扑描述已过时——Phase 2 Fix 项同步注明（改注释/夹具拓扑或标注 legacy，以实际消费面为准）。
- [ ] `Fix` 通道移除：flow-loader.js 删 `AUDIT_STATUS_RE`/`_scanOpenAuditsList`/`_isMissionLevelAudit`（:44/:96/:347 一带）及表达式函数注册表的 `openAudits` 键；`flows/deep-audit-loop.json` 按 Phase 2 Decision 执行 step 节点删除与重接线；`prompts/draft-from-audit.md` 删除（Decision 裁定面）；`test/audit-convergence.test.js` 与 `test/draft-plans-audit-gate.test.js` 迁移——断言面改为「通道已移除」的守护用例（如 flow JSON 无 openAudits 引用、flow-loader 无该导出）或删除并注明（测试删除理由：被测对象退役，非断言漂移）。
- [ ] `Fix` duplicate-append-only-anchor 结构 error（deep-audit round-1 P2 清偿）：`scanPlanLedger`/`scanRoadmapLedger`（ledger-sections.mjs）对重复 append-only 锚点报结构 error（首锚定语义保留——首块仍是派生面，后续重复块触发 error 进 scan.errors，deny 面/读面均可见）；存量 corpus 零重复锚点断言（`docs/plans/` 全量 + 本 roadmap）；改后 `node plugin/dsh/scripts/build-bundle.mjs` 重建 assets（freshness check 前置）。
- [ ] `Proof` 回归：deep-audit-loop 加载与表达式求值绿（flow-loader 测试面）+ **无悬空引用守护断言**（遍历简化后 flow JSON 的全部 goto/done/otherwise 目标均命中现存 step 节点——`loadFlowFile` 无此校验（live 核实），守护断言落进本 plan 新增/迁移的测试面，防「加载绿、运行期 unknown_step」的静默断裂）；duplicate-anchor 正反例（构造重复 `## Closure` fixture → error；正常单锚 → 0 error）；`pnpm --prefix tools/mission-driver test` 全绿（813 基线随测试迁移的数目变化成文）。

Exit Criteria:

- [ ] `grep -n "openAudits\|AUDIT_STATUS_RE\|_scanOpenAuditsList" tools/mission-driver/src/*.js tools/mission-driver/flows/*.json` 零命中（测试守护用例除外——其断言的是零命中本身）
- [ ] docs/audits 开放状态清点证据记录在案；flow 简化后 deep-audit 子流程加载/求值绿
- [ ] duplicate-anchor 结构 error 落地且存量 corpus 零误伤；assets freshness 绿
- [ ] `git diff --stat tools/mission-driver/src/engine.js` 为空
- [ ] `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` 全绿；`docs/logs/` 更新

## Phase 3 — 证据面单一性证明与文档回写

Targets: `tools/mission-driver/CONTEXT.md`、`docs/architecture/dsh-plugin-packaging.md`（若 0925-3 未覆盖本条目）、`tools/mission-driver/design/mission-driver-flow-design.md`（deep-audit 子流程段）、`tools/mission-driver/design/step-execution-and-audit-count-design.md` 与 `flow-engine-design.md`（退役通道/prompt 树的提及面）、roadmap tick 回写
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1/2

- [ ] `Proof` **run-state 残留消费面清点**（证据面单一性的收口证明）：`grep -rn "run-state" plugin/dsh/src/` 零命中（或仅注释/历史注记）；引擎侧 plan 完成态判定路径（closureScriptCheck/`_scanPlansByStatus`/monitor plans API）经 0925-1/2 已账本化——引用其收口证据，不重复断言；monitor RunDetail 的 run-state 显示面（步骤机/监控语义）标注为非证据面消费。
- [ ] `Add` 文档同步与回写：CONTEXT.md——plan-status-gate 行改写为 legacy-freeze 规则 + 通道退役记录；`dsh-plugin-packaging.md` plan-status-gate 条目与 import 图同步（若 0925-3 已收口该文件则增量）；设计文档提及面同步——`mission-driver-flow-design.md` deep-audit 段、`step-execution-and-audit-count-design.md` 与 `flow-engine-design.md` 中 openAudits 通道 / draft-from-audit prompt 树条目的退役注记（小面积 prose 同步，防 WI43 型 owner-doc 漂移复萌；改动逐条列出）；roadmap WI22 tick + 证据指针（清点结果 + grep 证明 + 测试迁移说明）；Follow-up Backlog 的 duplicate-anchor 条目移除或标注已清偿（round-1 P2 来源注记）；`docs/logs/` 收口条目。

Exit Criteria:

- [ ] 证据面单一性 grep 证明记录在案（run-state 在 plan 完成态裁决面零消费）
- [ ] roadmap WI22 `[x]` + 证据指针；Follow-up Backlog duplicate-anchor 条目清偿注记；`docs/logs/` 收口条目
- [ ] `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` + `./verify-age.sh` L1+L2 全绿

## Draft Review Record

- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0950-2-m2-wi22-evidence-face-rebuild-1-8a50a03e to ses_reviewer_5
- 2026-08-25：iteration 1，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0950-2-m2-wi22-evidence-face-rebuild-1-8a50a03e（独立评审 ses_reviewer_5：baseline 主体实证（plan-status-gate 结构/flow-loader 通道/duplicate-anchor 容忍/monitor 延后裁定/P8 自满足）；阻塞项 = ①Phase 2 Decision 建立在引擎 when 语义的错误前提上（when 缺省 = 步执行，engine.js ~:1753-1756 无 pass-through 步类型；删 when 键会产生无条件 agent 步，等价性声称被证伪；诚实退役 = 删节点重接线）②「预期开放状态为零」与 live 清点矛盾（全树 6 命中 / 1 open mission 级 / 5 planned，age-autonomy auditsDir 干净）；已修：①节点删除入范围 + 具体 JSON 改法 + 等价性钉住 when 语义 + draft-from-audit.md 处置定案（删除，prompt-check 对未引用 prompts 只 lint 已核实）②live 计数进 baseline + 2026-07-21 open 记录机械关闭升为确定项；非阻塞 5 项——legacy 计数 52→54、Phase 1 Item Types 补 Fix、ledger-sections 行号修正（plan 面 ~:277 / roadmap 面 ~:360）、prompt 处置即刻可定、设计文档同步面（后并入 Phase 3 targets）——均已修）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0950-2-m2-wi22-evidence-face-rebuild-2-60aa75bb to ses_reviewer_5
- 2026-08-25：iteration 2，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0950-2-m2-wi22-evidence-face-rebuild-2-60aa75bb（独立复核：两项阻塞修复落地且 sound（节点删除拓扑逐分支等价 + when 语义钉住；live 计数 + 开放记录机械关闭确定项 + 5 条 planned 隔离 Deferred）；残留 = OPEN_AUDIT 的 otherwise 键未列入改接线（三处引用只改两处会留悬空 goto——loadFlowFile 零 step 引用校验（flow-loader.js:291-296 live 核实），加载绿运行期 unknown_step（engine.js ~:1645））；已修：otherwise/transitions/onError 三处全改 + 「无悬空引用守护断言」进 Proof；非阻塞 4 项——行 64 legacy 计数残留 52→54、helpers.js 私有夹具过时注记、设计文档同步面落 Phase 3 targets、回执行回填——均已修/已回填)
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0950-2-m2-wi22-evidence-face-rebuild-3-f6d075dc to ses_reviewer_5
- 2026-08-25：iteration 3，共识 acceptable-as-is #review-2026-08-25-063133-mission-driver-2026-08-25-0950-2-m2-wi22-evidence-face-rebuild-3-f6d075dc（独立复核：三处改接线与实际 JSON 缺陷位精确对应（otherwise :51 / transitions :56-57 / onError :59）；loadFlowFile 与 unknown_step 表述复核准确；等价性论证钉在已验证 when 语义上；54 计数交叉引用落地；Phase 3 设计文档同步面三项枚举落地。非阻塞 2 项留执行期裁量：helpers.js 夹具同步在 Fix 项 targets 的枚举面、守护断言 walk 含 entry 键——不阻塞）

## Verification

## Closure

## Deferred But Adjudicated

### monitor 显示面 defaultVerifyKeys 注入（0925-1 Deferred 归属重申）

- Classification: `watch-only residual`
- Why Not Blocking Closure: 显示面无回执/路由后果；monitor mission 读取未走 extends 合并（deep-audit round-2 P2 另案），裸 JSON.parse 面上注入默认键有显示误读风险——0925-1 原裁定理由经本 plan 复核仍成立。
- Successor Required: yes（monitor extends 合并 P2 修复时顺带；重开条件 = dashboard 用户实际依赖 verify 派生态显示）

### 其余 5 条 `planned` 状态行的归一

- Classification: `watch-only residual`
- Why Not Blocking Closure: `planned` 不被 `openAudits()` 计入（`normalizeLegacyStatus` ≠ open），通道退役不受阻；这些记录的 findings 未开放、无路由后果，机械改写无收益。
- Successor Required: no（条件触发：其所属 mission 下次结构性维护时顺带归一或随 M5 文档收口清理）
