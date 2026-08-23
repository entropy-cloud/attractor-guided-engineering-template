# 2026-08-23-2202-2 状态面板决策：RPC 直读 vs 复用 monitor（dsh-plugin M4-WI15）

> Plan Status: active
> Mission: dsh-plugin
> Work Item: M4-WI15
> Last Reviewed: 2026-08-23（draft review 2 轮，iteration 2 共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M4-WI15（"状态面板决策:RPC 直读 vs 复用 monitor,产出实现或明确延期记录"）
> Related: `docs/design/dsh-plugin-integration.md` §User-visible capabilities 4（Monitor coexistence 语义 owner）、§Scope（Out of scope "replacing the monitor with a client-side panel"）；`docs/architecture/dsh-plugin-packaging.md` §Execution Model（五进度通道 + "Realtime leader is channel 1 (SSE pushes step-level events); an M4 RPC-direct panel would swap its data source, not its schema"）、§Service Surface（"Monitor: unchanged… future scope"）、§Phased Delivery P4；本批执行顺序：`2202-1`（WI14）→ 本 plan（N=2）
> Audit: required

## Current Baseline

**WI15 是决策型 work item——结果面 = 显式裁定记录（有界实现片或明确延期记录），非无条件实现承诺。owner docs 现状已预设 "future scope / 不替换 monitor" 姿势，但未做正式裁定与立案：**

- **roadmap 字面**："产出实现或明确延期记录"——两个合法终态，裁定过程与依据是本 plan 的主体。
- **owner docs 既定约束（裁定的规范输入，非可静默越改）**：
  - design doc §User-visible capabilities 4 "Monitor coexistence"：standalone monitor 对 run-state 文件持续可用；"A native Web UI panel reading the same files **may follow later; it is not part of the initial scope**"。
  - design doc §Scope Out of scope：本 feature 不做 "replacing the monitor with a client-side panel"——WI15 的任何实现分支必须是**加法面**（与 monitor 共存），替换/弃用 monitor 越出 owner doc 授权，需先改 owner doc 并升级 human review。
  - packaging doc §Service Surface："Monitor: unchanged… A native client panel reading the same files is future scope."；§Execution Model：五条进度通道全部读同一 run-state 面——monitor dashboard（通道 1，SSE 实时 leader）、DSH 子代理拓扑行（通道 2，WI11 后 run 级描述符健康）、in-chat `mdcontrol.status`（通道 3，已落地）、trajectory 视图（通道 4）、skill 回执（通道 5）；既定技术约束 "**an M4 RPC-direct panel would swap its data source, not its schema**"。
  - packaging doc §Phased Delivery P4 行含本决策（与 WI14 同相，但无执行依赖）。
- **live 能力面**：`mdcontrol.run/status/list/draft/analyze` 已落地（M2-WI10 + M3-WI12）；`mdcontrol.status` = thin `run-state.json` 透传（无第二状态机）、`mdcontrol.list` = disk 扫描枚举；monitor 自 WI11 起完整渲染 native run（step-log `oc-`/`native-` 双 label 修复，bug closed）；插件测试链 116 用例 + `verify:e2e` / `verify:e2e:gate` 既有门禁不含任何面板面。
- **未读面（Phase 1 Explore 的对象）**：宿主 web-ui 的**面板/视图扩展 API**——插件能否在 pinned `0.1.1-rc.2` cohort 上注册宿主 UI 面板、形状与稳定性如何（`~/ai/dsh-src/deepseek-harness` 客户端/UI 包面未读）；消费侧参照 = `~/ai/dsh-plugins/DSH-better-sidebar`（R1 时代引用其 sidecar 路由形状的同一 clone——它本身就是宿主 UI 面板插件先例，UI 挂载面可作消费侧证据）。
- **不存在的东西**：无任何面板代码 / fixture / 计划；`docs/analysis/` 无面板可行性研究；roadmap 之外无既定面板需求来源。
- **红线**：不改 monitor 与引擎（零引擎 diff；monitor 行为零变化）；shipped `dependencies` 不动（任何面板实现若需新宿主 UI 运行时依赖，该依赖/version-risk 评估本身就是裁定输入——packaging doc §Dependency and Version Risk 姿势）；P4 gate（WI14 的 realm 组合收口）不受本 plan 拖累；裁定不得以 "先实现后补依据" 方式跳过。

## Goals

- WI15 裁定落档：RPC 直读 vs 复用 monitor 的显式 `Decision`（含依据 / 备选 / 残险 / reopen trigger），产出且仅产出二者之一：
  - **实现分支**：有界实现片——read-only 状态面，数据经既有 `mdcontrol.*` 路由（换数据源不换 schema），零新 shipped dependency，测试域钉住；或
  - **延期分支**：明确延期记录——design doc capability 4 与 packaging doc 相关段落的 as-adjudicated 回写 + 本 plan `Deferred But Adjudicated` 立案（reopen trigger 具名）。
- 裁定依据可复核：决策输入（扩展面可达性 / 通道价值差 / 维护与版本风险 / owner-doc 授权边界）记录于 plan Decision Record 或引用的分析文档。

## Non-Goals

- 不替换 monitor、不修改 monitor/引擎行为（owner doc 冻结约束；越界需先改 owner doc + human review，不在本 plan 内）。
- 不做多项目/跨 root 聚合面板、不做写操作面（面板决策限于只读状态呈现）。
- 延期分支下不预写面板代码骨架（避免无裁定支撑的死代码）。
- 不裁定 AGE UI 的其他候选面（可视化 backlog 等非本 roadmap 域项）。
- 不做真模型/真实浏览器交互验证（沿用既有 REST/注册面机器断言 + 人工腿记录姿态）。

## Task Route

- Type: `app-layer design change`（产品面裁定 + 条件性有界实现）
- Owner Docs: `docs/design/dsh-plugin-integration.md`（§User-visible capabilities 4 / §Scope——共存语义 owner）、`docs/architecture/dsh-plugin-packaging.md`（§Execution Model / §Service Surface / §Phased Delivery P4 / §Dependency and Version Risk）、roadmap WI15
- Skill Selection Basis: `Skill: none`——`docs/skills/README.md` 无匹配可复用方法（文档核对沿用 `document-audit-prompt.md`，非 skill）。

## Infrastructure And Config Prereqs

- 裁定域（Phase 1）：纯只读研究（host 源码 + better-sidebar clone + 既有 e2e 面），零网络零凭据。
- 实现分支（如裁定成立）：复用宿主 webServer / 既有 HTTP dispatcher 面；零新端口/env；零迁移。
- 宿主源码只读核查：`~/ai/dsh-src/deepseek-harness`（客户端/web-ui 扩展面）；消费侧参照 `~/ai/dsh-plugins/DSH-better-sidebar`。
- 无回滚需求（延期分支 = 纯文档；实现分支回滚 = 撤工件 + 门禁用例）。

## Execution Plan

### Phase 1 - Explore + 裁定（主 Decision + 范围钉界）

Status: planned
Targets: 决策记录于本 plan（doc 编辑统一归 Phase 2/3 落地，不双记账）
Skill: none

- Item Types: `Decision`
- Prereqs: 无硬执行依赖；建议在 `2202-1`（WI14）收口后执行——裁定引用最终 as-built 会话面（AGE 模式落地形态）作价值差评估输入。若先行执行，Phase 1 价值差评估以 roadmap WI14 交付目标为准并在 Decision Record 注明。

- [ ] `Decision`（含 Explore）**扩展面盘点**（起点具名，draft review it1 N2）：宿主 web-ui 插件可注册的面板/视图扩展 API——起点 = host `packages/extensions/ui-cordis`（`@deepseek-ai/dsh-client-ui-cordis`，`shell.overlay`/ui-layout 席位的浏览器半插件面）与 `apps/web`；**形态问题具名**：better-sidebar 用 `dsh.plugin.json` plugin 形态（`client.main` 入口），本仓插件是 `dsh.bundle.patch` bundle 形态——bundle 形态是否支持 client 侧注册是 material Explore 问题；pinned cohort 可达性（ui-cordis 不在已钉 cohort 内 → 除非免新 shipped dep 可达，准则 ② 倾向延期）；better-sidebar 先例的 UI 挂载消费面（同一 clone 的面板侧证据）；`mdcontrol.status`/`list` 对面板数据面的充分性（轮询可行性 / SSE 等价推送面是否存在；"swap data source, not schema" 约束的落地形状）。
  - Skill: none
- [ ] `Decision` **主裁定：实现 vs 延期**。裁定准则（逐项显式评估并记录）：① owner-doc 既定姿态（future scope；加法面-only 授权边界）；② 扩展面在 pinned cohort 的存在性与稳定性（无稳定 API → 强延期信号；为此引入新 shipped dep → 违反红线即延期）；③ 用户价值增量 vs 既有通道 1–3（monitor 已全功能渲染双后端 run + in-chat status + 描述符行——面板解决的是 "DSH 内嵌呈现" 单点）；④ 维护成本与 version-risk（developer-preview cohort 上叠第二 UI 面）；⑤ P4 收口不受累（realm 组合 gate 归 WI14，本裁定不拖累其收口）。裁定无法收敛（含产品价值判断不可收敛）→ 按 AGENTS.md 升级 human review（unresolved product risk 不得静默裁定，plan 留 draft/挂起）。备选方案与残险记录于 Decision Record。
  - Skill: none
- [ ] `Decision`（仅实现分支触发）**实现范围钉界**：read-only、数据经既有 `mdcontrol.*` 路由、零新 shipped dep、单测 + 组合验证域；任一约束不可满足 → 回退延期分支并记录回退原因（该回退是 Decision 记录的一部分，非降级）。**延期分支收口态（draft review it1 B1）**：主裁定为延期时，本项以『不适用——主裁定为延期』注记收口（Phase 1 Decision Record 引用），按 guide 规则 10 记为 decision-time 移出 scope 并写明理由——不算未完成项，不产生 `completed` phase 挂空 checkbox 的不一致。
  - Skill: none

Exit Criteria:

- [ ] 扩展面盘点 + 主裁定（+ 实现分支的范围钉界，如触发）连同依据 / 备选 / 残险记录于 plan（Phase 1 Decision Record）
- [ ] `docs/logs/` updated（Phase 1 决策条目）

### Phase 2 - 落地工件（按裁定分支执行其一）

Status: planned
Targets: 实现分支：`plugin/dsh/src/`（面板工件，位置随钉界）、`plugin/dsh/test/`、`plugin/dsh/cordis.patch.yml`（如挂载行需扩展）；延期分支：`docs/design/dsh-plugin-integration.md`、`docs/architecture/dsh-plugin-packaging.md`、本 plan §Deferred But Adjudicated
Skill: none

- Item Types: `Add | Proof`（实现分支）或 `Proof`（延期分支——文档即工件）
- Prereqs: Phase 1 裁定

- [ ] `Add`（实现分支）面板工件 + 单测钉住（fake 面数据 + 既有路由面；组合域验证按钉界）；**或** `Proof`（延期分支）owner docs 回写：design doc capability 4 as-adjudicated 措辞（延期 + 依据 + reopen trigger）、packaging doc §Execution Model 通道注记 / §Service Surface 面板句回写为裁定后语义、本 plan `Deferred But Adjudicated` 立案（reopen trigger 具名，如：宿主后续 cohort 提供稳定面板扩展 API 且 monitor 无法嵌入 DSH UI 时）。
  - Skill: none
- [ ] `Proof` 两分支共同：`npm --prefix plugin/dsh test` + `./verify-age.sh` exit 0 零回归（延期分支为纯文档时 = 既有门禁全绿实测 + 零引擎 diff 实测）；实现分支另含零新 shipped dep 实测（`git diff plugin/dsh/package.json` 的 dependencies 段 diff 为空）。
  - Skill: none

Exit Criteria:

- [ ] 裁定分支的工件落地且被验证（实现分支：测试钉住 + 组合验证；延期分支：owner docs 措辞与裁定一致 + Deferred 立案闭环）
- [ ] `docs/logs/` updated

### Phase 3 - 收口（roadmap 回写 + 一致性核对）

Status: planned
Targets: roadmap、`docs/logs/`
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Proof`
- Prereqs: Phase 2

- [ ] `Proof` roadmap WI15 `todo → done`（证据摘要内联，**显式标注裁定结果**——实现片落地或明确延期记录，与 roadmap "产出实现或明确延期记录" 字面闭环）；owner docs 一致性 document-audit 对照；`docs/logs/` 聚合收口条目。
  - Skill: none

Exit Criteria:

- [ ] roadmap / owner docs 与裁定终态一致
- [ ] `docs/logs/` updated

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd105475bffeCjHmvzd4nciBCG`，2026-08-23）——**B1（阻塞）**：Phase 1 第 3 项（实现范围钉界）为分支条件项（"仅实现分支触发"），但 plan 未定义其在延期分支下的收口态——主裁定为延期时该 checkbox 保持 `[ ]` 而 Phase 1 `Status` 翻 `completed`，正是 Anti-Slacking Rule（guide :65/:39 规则 10）与规则 12（:41，状态/checkbox 不一致可致 EXECUTE/VERIFY 循环）禁止的模糊态；Closure Gates 只在分支层 reconciled、漏了条目层机制。修订：该 item 增补延期分支收口态条款（『不适用——主裁定为延期』注记 + Decision Record 引用 + guide 规则 10 decision-time 移出 scope）。非阻塞 3 项全采纳：N1 措辞消歧（"dependencies 段 diff 为空"——diff 为空非段为空）；N2 扩展面盘点起点具名（host `packages/extensions/ui-cordis`〔`@deepseek-ai/dsh-client-ui-cordis`，不在已钉 cohort〕+ `apps/web` + better-sidebar `dsh.plugin.json` plugin 形态 vs 本仓 bundle 形态的 client 侧注册支持问题——material Explore 问题 + 准则 ② 倾向注记）；N3 实现分支 Targets 补 `cordis.patch.yml`。fact-check：roadmap/design/packaging owner-doc 引文逐条核实、五路由 live 核实（mdcontrol-routes.ts :137 status 透传）、monitor 修复 bug closed 证据、116 用例链、无面板面存在的全域搜索、两 clone 在位——全匹配。
- Independent draft review iteration 2: `acceptable as-is`（独立 fresh session `ses_fd0f96b1effeEIGxaS2lYetztU`，2026-08-23）——**B1 复核 resolved**：延期分支收口条款（『不适用——主裁定为延期』注记 + Decision Record 引用 + guide 规则 10 decision-time 移出 scope）机制核验通过（规则 10 :39 明文授权 "move it out of scope with a written reason"；Anti-Slacking :65 的 "removed from scope with recorded reason" 终态枚举覆盖；显式排除规则 12 的 completed-phase-空-checkbox 陷阱；Phase 1 exit criterion 的 "如触发" 为单一可勾选项内的 void-when-untriggered 子句，两层均无悬挂态）。N1/N2/N3 采纳核实到位。fresh-eyes 复查：baseline 引文逐条 live 核实（roadmap :40 / design :50+:96 / packaging :201+:224-232+:251 / mdcontrol-routes 五路由 + :137 透传 / 无面板面全域搜索 / ui-cordis 不在已钉 cohort）；分支结构完整性（Phase 1 唯一终态、Phase 2 单或-checkbox 执行、Closure Gate 5 :123 分支层 reconciled、无违禁模糊词）；五准则 + AGENTS.md 升级线正确；与 `2202-1`（已 active）批次排序注记双向一致。非阻塞 2 条（Related 行引文省略语已按 live 文本补全；checkbox 字面动作释义无需编辑）。共识达成，Plan Status → active。

## Closure Gates

- [ ] in-scope behavior is complete（裁定 + 所选分支工件双双落地）
- [ ] relevant docs are aligned
- [ ] verification has run（延期分支口径 = 既有门禁全绿 + 文档一致性核对；实现分支口径 = 测试 + 组合验证；命令在各 Proof 项固化）
- [ ] scoped verification is not conflated with full verification——真浏览器/真宿主交互（如涉及）按 env/人工腿姿态如实标注
- [ ] no in-scope item downgraded to deferred/follow-up（主裁定的 "延期" 终态是 roadmap 授权的两个合法结果之一，经 Decision 记录，非条目降级；范围钉界回退同理是 Decision 记录）
- [ ] independent draft review completed and recorded
- [ ] text consistency verified: status, phases, gates, and log all agree
- [ ] closure audit was independent
- [ ] closure evidence exists in files

## Deferred But Adjudicated

-（draft 时点无预立案；延期分支成立时，主裁定在本节立案并具名 reopen trigger）

## Closure

Status Note:（收口时回写）

Closure Audit Evidence:

-（收口时回写）

Follow-up:

-（收口时回写；confirmed defect 不得出现在此）
