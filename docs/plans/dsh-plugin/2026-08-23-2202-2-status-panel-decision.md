# 2026-08-23-2202-2 状态面板决策：RPC 直读 vs 复用 monitor（dsh-plugin M4-WI15）

> Plan Status: completed
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

Status: completed
Targets: 决策记录于本 plan（doc 编辑统一归 Phase 2/3 落地，不双记账）
Skill: none

- Item Types: `Decision`
- Prereqs: 无硬执行依赖；建议在 `2202-1`（WI14）收口后执行——裁定引用最终 as-built 会话面（AGE 模式落地形态）作价值差评估输入。若先行执行，Phase 1 价值差评估以 roadmap WI14 交付目标为准并在 Decision Record 注明。

- [x] `Decision`（含 Explore）**扩展面盘点**（起点具名，draft review it1 N2）：宿主 web-ui 插件可注册的面板/视图扩展 API——起点 = host `packages/extensions/ui-cordis`（`@deepseek-ai/dsh-client-ui-cordis`，`shell.overlay`/ui-layout 席位的浏览器半插件面）与 `apps/web`；**形态问题具名**：better-sidebar 用 `dsh.plugin.json` plugin 形态（`client.main` 入口），本仓插件是 `dsh.bundle.patch` bundle 形态——bundle 形态是否支持 client 侧注册是 material Explore 问题；pinned cohort 可达性（ui-cordis 不在已钉 cohort 内 → 除非免新 shipped dep 可达，准则 ② 倾向延期）；better-sidebar 先例的 UI 挂载消费面（同一 clone 的面板侧证据）；`mdcontrol.status`/`list` 对面板数据面的充分性（轮询可行性 / SSE 等价推送面是否存在；"swap data source, not schema" 约束的落地形状）。
  - Skill: none
- [x] `Decision` **主裁定：实现 vs 延期**。裁定准则（逐项显式评估并记录）：① owner-doc 既定姿态（future scope；加法面-only 授权边界）；② 扩展面在 pinned cohort 的存在性与稳定性（无稳定 API → 强延期信号；为此引入新 shipped dep → 违反红线即延期）；③ 用户价值增量 vs 既有通道 1–3（monitor 已全功能渲染双后端 run + in-chat status + 描述符行——面板解决的是 "DSH 内嵌呈现" 单点）；④ 维护成本与 version-risk（developer-preview cohort 上叠第二 UI 面）；⑤ P4 收口不受累（realm 组合 gate 归 WI14，本裁定不拖累其收口）。裁定无法收敛（含产品价值判断不可收敛）→ 按 AGENTS.md 升级 human review（unresolved product risk 不得静默裁定，plan 留 draft/挂起）。备选方案与残险记录于 Decision Record。
  - Skill: none
- [x] `Decision`（仅实现分支触发）**实现范围钉界**：read-only、数据经既有 `mdcontrol.*` 路由、零新 shipped dep、单测 + 组合验证域；任一约束不可满足 → 回退延期分支并记录回退原因（该回退是 Decision 记录的一部分，非降级）。**延期分支收口态（draft review it1 B1）**：主裁定为延期时，本项以『不适用——主裁定为延期』注记收口（Phase 1 Decision Record 引用），按 guide 规则 10 记为 decision-time 移出 scope 并写明理由——不算未完成项，不产生 `completed` phase 挂空 checkbox 的不一致。
  - Skill: none
  - **收口注记：不适用——主裁定为延期**（见 Phase 1 Decision Record D-MAIN；实现分支约束 read-only / `mdcontrol.*` 数据面 / 零新 shipped dep / 确定性测试域已作为 reopen trigger T3 的再裁定前置约束记录，非本轮 scope）。按 guide 规则 10 decision-time 移出 scope，理由：分支条件项的唯一触发条件（主裁定为实现）未成立，约束内容已随裁定落档可复用。

#### Phase 1 Decision Record（2026-08-23，host 源码只读核查 `~/ai/dsh-src/deepseek-harness` + 消费侧参照 `~/ai/dsh-plugins/DSH-better-sidebar`）

**E1 扩展面盘点（Explore findings）**

- **E1-a 静态 client-plugin 机制存在且为产品面**：宿主 web-ui 的插件 UI 扩展面 = package.json `dsh.client` 声明（`platform: 'web'` + `inject[]` + 可选 `external[]`/`immediately`）+ `exports['./client']` 构建产物。node 半 = `@deepseek-ai/dsh-client-modules`（host `packages/client/modules/src/index.ts`：增量扫描 **loader entries**、服务 `/plugins/<id>/client.js`、组装 `window.__DSH_BOOT__`）；browser 半 = `cordis-client-runner` 求值器把每个 bundle 跑成 cordis client plugin，经 client `slots` 服务注册 UI（`ctx.slots.inject(<slotKey>, () => ctx.slots.register({...}))`，declare-merge 类型合同）、经 `connection`（browser wire client）或同源 fetch 取数。
- **E1-b 形态问题裁定：bundle 形态支持 client 侧注册——肯定闭合**。better-sidebar 同包同时携带 `dsh.bundle.patch` 与 `dsh.client`（其 `dsh.plugin.json` 之 `client.main` 在 host 源码零引用 = 死/平行形态，非机制入口）；client-modules 按 loader entry 包名扫描 package.json——本仓 patch 的 service 行 `name: dsh-mission-control` 使本包自身成为 loader entry，加 `dsh.client` 字段即被扫描。**无新 shipped npm dep 必要**：client `inject` 由宿主 module table 运行时供给（externalized closure factory），类型/构建仅需 devDeps（既有 27 个 exact-pinned devDeps 同姿态）。
- **E1-c 稳定性与文档面：rc + 面向外部作者零文档**。宿主 docs（`extension-cookbook.md`/`capability-seams.md`/`development.md`）只覆盖 node 侧扩展；client slots declare-merge 合同为 host 内部件；唯一外部先例（better-sidebar）系逆向 host 内部面写成。plan 起点具名的 `ui-cordis` 实为**动态 `cordis_define` 定义卡**（`cordis-host-runner` human-approved client activation 的运行时动态插件机制）——非静态插件面板路径，且不在已钉 cohort；静态路径只需 client 基线 inject，不需要 ui-cordis。
- **E1-d 数据面充分性**：`POST /mdcontrol/api/status|list`（`service.ts` 经 `ctx.get('webServer')` 注册，web 组合下与 web UI 同源）= thin run-state 透传 / disk 扫描 → **轮询可行、schema 恒等**（"swap data source, not schema" 成立）。**SSE 等价推送面不存在**：dispatcher 为无推送的 POST 面；monitor 的 SSE 在独立 monitor server（9300，`monitor.js` 在 bundle NOT-bundled 清单——插件形态不随附）→ RPC 直读面板 = 轮询、step 粒度、实时性严格弱于通道 1。
- **E1-e 价值差输入（as-built 会话面，WI14 已收口）**：插件形态下 DSH 内嵌可见性 = 通道 2（run 级描述符行）+ 通道 3（in-chat status）+ 通道 5（完成回执）；全功能 step 级视图（通道 1 monitor）需另起 standalone monitor 进程/标签页。面板唯一增量 = "DSH 内嵌 step 级呈现" 单点；无已记录用户需求信号（roadmap 行外无面板需求来源）。

**D-MAIN 主裁定：延期（deferred branch）**

五准则逐项评估：

- **① owner-doc 既定姿态**：design doc capability 4（"may follow later; it is not part of the initial scope"）+ packaging doc §Service Surface（"future scope"）均预设后续域；无需求信号下先行实现 = 以实现倒逼依据，正是红线禁止的 "先实现后补依据" 姿势。**→ 延期**。
- **② pinned cohort 存在性与稳定性**：机制存在（E1-a/b，dual-form 先例同 cohort 族）→ 无硬阻塞、无红线违反（免新 shipped dep 可达）；但 API 为 rc + host 内部件 + 外部作者零文档（E1-c）→ 按准则字面（"无稳定 API → 强延期信号"）**→ 延期（强信号）**。
- **③ 价值增量 vs 通道 1–3**：面板增量 = DSH 内嵌呈现单点（E1-e），且轮询形态实时性弱于通道 1（E1-d）；功能覆盖已备（monitor 全功能 + in-chat status + 描述符行）。窄价值、零已记录需求。**→ 延期**。
- **④ 维护成本与 version-risk**：浏览器构建工具链（tsdown client bundle + 提交产物 + 新鲜度门 + React 类型面）+ 第二 UI 面钉在最不稳定 host API 族；真实浏览器渲染不可入确定性门禁（本 plan Non-Goal 亦排除），UI 质量证据天花板 = 人工腿。**→ 延期**。
- **⑤ P4 收口**：WI14 已 `done`，两分支均不拖累收口（非差异化输入）。

**裁定收敛性**：①②③④ 同向延期、⑤ 中性——收敛成立，无不可收敛的产品价值判断，不触发 AGENTS.md human review 升级线。

**备选方案（已评估否决）**：(a) 有界实现片（read-only 轮询面板，数据经 `/mdcontrol/api`）——否决：无需求下前跑 ① recorded posture、骑 ② 未文档 rc API、③ 价值窄、④ 新浏览器工具链 + 门禁不可验证渲染；(b) 不立案观望——否决：roadmap 字面要求显式裁定记录；(c) 经动态 `cordis_define`/ui-cordis 路径——否决：机制错位（运行时动态插件 + human approval，非 shipped 面板路径）且 ui-cordis 不在已钉 cohort。

**残险（延期分支接受）**：远端/受限部署用户（不便开第二端口/标签页触达 standalone monitor）在 reopen 前仅剩通道 2/3/5 内嵌可见性。接受依据：通道 1 功能覆盖完整且不受插件形态影响（同一 run-state 文件面）。

**Reopen triggers（具名，任一触发即再裁定）**：
- **T1** 宿主后续 cohort 发布稳定且面向外部作者文档化的 client-plugin/面板扩展 API；
- **T2** 出现已记录用户需求：DSH 内嵌 step 级状态可见性成为硬需求且 standalone monitor 不可达/不可接受；
- **T3** monitor 嵌入 DSH UI 被裁定不可行而内嵌可见性需求成立（design doc capability 4 reopen 注记形）。
再裁定的实现分支前置约束（本 plan 范围钉界项的约束内容，随裁定落档）：read-only、数据经既有 `mdcontrol.*` 路由、零新 shipped dep、确定性测试域钉住。

Exit Criteria:

- [x] 扩展面盘点 + 主裁定（+ 实现分支的范围钉界，如触发）连同依据 / 备选 / 残险记录于 plan（Phase 1 Decision Record）
- [x] `docs/logs/` updated（Phase 1 决策条目）

### Phase 2 - 落地工件（按裁定分支执行其一）

Status: completed
Targets: 实现分支：`plugin/dsh/src/`（面板工件，位置随钉界）、`plugin/dsh/test/`、`plugin/dsh/cordis.patch.yml`（如挂载行需扩展）；延期分支：`docs/design/dsh-plugin-integration.md`、`docs/architecture/dsh-plugin-packaging.md`、本 plan §Deferred But Adjudicated
Skill: none

- Item Types: `Add | Proof`（实现分支）或 `Proof`（延期分支——文档即工件）
- Prereqs: Phase 1 裁定

- [x] `Proof`（延期分支执行）owner docs 回写：design doc capability 4 as-adjudicated 措辞（**deferred, not abandoned** + 依据摘要 + 三 reopen trigger 概要 + reopen 前观看面归属——monitor 主 + in-chat status 内嵌通道）；packaging doc §Service Surface 面板句回写为裁定后语义（可达性/零新 shipped dep 依据 + rc 未文档 + poll-only 数据面〔无 SSE 等价推送〕+ 零需求 + trigger 指向本 plan §Deferred But Adjudicated）、§Execution Model 通道尾注回写（"would swap its data source" 虚拟式收口为裁定语义 + 该发现转为 reopen 时实现约束）；本 plan `Deferred But Adjudicated` 立案（classification `watch-only residual` + D-MAIN 依据摘要 + T1/T2/T3 具名 + re-adjudication constraints + Why Not Blocking + Successor Required: no）。实现分支 `Add` 面板工件项按裁定分支未触发——Phase 2 单或-checkbox 的 or-语义由本 Proof 项的延期分支腿满足（同 Phase 1 item 3 的 B1 收口姿态，decision-time 分支选择记录于 Decision Record）。
  - Skill: none
- [x] `Proof` 两分支共同：`npm --prefix plugin/dsh test` + `./verify-age.sh` exit 0 零回归（延期分支为纯文档时 = 既有门禁全绿实测 + 零引擎 diff 实测）——实测：插件链 **133/133**（含 manifest closure + `tsc --noEmit` + bundle 新鲜度 36 文件 + smoke-import 五入口）exit 0；`./verify-age.sh` **L1+L2 gate: GREEN** exit 0；`git status --porcelain tools/mission-driver plugin/dsh` 空 = **零引擎 diff + 零插件 diff**（纯文档 change-set）；引擎全量 `pnpm --prefix tools/mission-driver test` 660/660 fail 0 + prompt-check OK（Phase 1 后协议复跑）。
  - Skill: none

Exit Criteria:

- [x] 裁定分支的工件落地且被验证（延期分支：owner docs 措辞与裁定一致 + Deferred 立案闭环）——design doc capability 4 / packaging doc §Service Surface + §Execution Model 三站点回写完成且语义与 D-MAIN 一致；§Deferred But Adjudicated 立案闭环（T1/T2/T3 具名）
- [x] `docs/logs/` updated

### Phase 3 - 收口（roadmap 回写 + 一致性核对）

Status: completed
Targets: roadmap、`docs/logs/`
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Proof`
- Prereqs: Phase 2

- [x] `Proof` roadmap WI15 `todo → done`（证据摘要内联，**显式标注裁定结果 = 明确延期记录**——E1 五发现 + D-MAIN 五准则延期 + 三站点回写 + T1/T2/T3 立案 + 纯文档 change-set 门禁全绿，与 roadmap "产出实现或明确延期记录" 字面延期终态闭环 + P4 收口注记）；Last Updated 行同步（M4-WI15 done + P4 里程碑收口 + roadmap 全量完成）；owner docs 一致性 document-audit 对照——实测 grep 全域：design doc capability 4 / packaging doc §Service Surface 面板句 / §Execution Model 通道尾注三站点均为 as-adjudicated 语义，packaging doc 状态标头 + §Phased Delivery P4 行同步 P4 complete，无残留 "future scope / may follow later / remains planned" 旧姿态句（design doc §Scope "replacing the monitor with a client-side panel" 排除项保持正确——延期不改变替换禁令）；`docs/logs/` 聚合收口条目（顶部聚合 + Phase 1/2 provisional 两条）。
  - Skill: none

Exit Criteria:

- [x] roadmap / owner docs 与裁定终态一致
- [x] `docs/logs/` updated

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd105475bffeCjHmvzd4nciBCG`，2026-08-23）——**B1（阻塞）**：Phase 1 第 3 项（实现范围钉界）为分支条件项（"仅实现分支触发"），但 plan 未定义其在延期分支下的收口态——主裁定为延期时该 checkbox 保持 `[ ]` 而 Phase 1 `Status` 翻 `completed`，正是 Anti-Slacking Rule（guide :65/:39 规则 10）与规则 12（:41，状态/checkbox 不一致可致 EXECUTE/VERIFY 循环）禁止的模糊态；Closure Gates 只在分支层 reconciled、漏了条目层机制。修订：该 item 增补延期分支收口态条款（『不适用——主裁定为延期』注记 + Decision Record 引用 + guide 规则 10 decision-time 移出 scope）。非阻塞 3 项全采纳：N1 措辞消歧（"dependencies 段 diff 为空"——diff 为空非段为空）；N2 扩展面盘点起点具名（host `packages/extensions/ui-cordis`〔`@deepseek-ai/dsh-client-ui-cordis`，不在已钉 cohort〕+ `apps/web` + better-sidebar `dsh.plugin.json` plugin 形态 vs 本仓 bundle 形态的 client 侧注册支持问题——material Explore 问题 + 准则 ② 倾向注记）；N3 实现分支 Targets 补 `cordis.patch.yml`。fact-check：roadmap/design/packaging owner-doc 引文逐条核实、五路由 live 核实（mdcontrol-routes.ts :137 status 透传）、monitor 修复 bug closed 证据、116 用例链、无面板面存在的全域搜索、两 clone 在位——全匹配。
- Independent draft review iteration 2: `acceptable as-is`（独立 fresh session `ses_fd0f96b1effeEIGxaS2lYetztU`，2026-08-23）——**B1 复核 resolved**：延期分支收口条款（『不适用——主裁定为延期』注记 + Decision Record 引用 + guide 规则 10 decision-time 移出 scope）机制核验通过（规则 10 :39 明文授权 "move it out of scope with a written reason"；Anti-Slacking :65 的 "removed from scope with recorded reason" 终态枚举覆盖；显式排除规则 12 的 completed-phase-空-checkbox 陷阱；Phase 1 exit criterion 的 "如触发" 为单一可勾选项内的 void-when-untriggered 子句，两层均无悬挂态）。N1/N2/N3 采纳核实到位。fresh-eyes 复查：baseline 引文逐条 live 核实（roadmap :40 / design :50+:96 / packaging :201+:224-232+:251 / mdcontrol-routes 五路由 + :137 透传 / 无面板面全域搜索 / ui-cordis 不在已钉 cohort）；分支结构完整性（Phase 1 唯一终态、Phase 2 单或-checkbox 执行、Closure Gate 5 :123 分支层 reconciled、无违禁模糊词）；五准则 + AGENTS.md 升级线正确；与 `2202-1`（已 active）批次排序注记双向一致。非阻塞 2 条（Related 行引文省略语已按 live 文本补全；checkbox 字面动作释义无需编辑）。共识达成，Plan Status → active。

## Closure Gates

- [x] in-scope behavior is complete（裁定 + 所选分支工件双双落地——D-MAIN 延期裁定 + 三站点 owner-doc 回写 + §Deferred But Adjudicated 立案）
- [x] relevant docs are aligned（design doc capability 4 / packaging doc §Service Surface + §Execution Model + 状态标头 + §Phased Delivery P4 / roadmap WI15 + Last Updated；stale 短语全域 grep 零命中——closure audit 复核）
- [x] verification has run（延期分支口径 = 既有门禁全绿 + 文档一致性核对：插件链 133/133 + verify-age.sh L1+L2 GREEN exit 0 + 引擎 660/660 fail 0 + prompt-check OK + 零引擎/零插件 diff 实测——closure audit 会话独立复跑同结果）
- [x] scoped verification is not conflated with full verification——真浏览器/真宿主交互不在延期分支验证域（无代码面）；plan Non-Goal 姿势一致，log 条目显式标注
- [x] no in-scope item downgraded to deferred/follow-up（主裁定的 "延期" 终态是 roadmap 授权的两个合法结果之一，经 Decision 记录，非条目降级；范围钉界项经 B1 条款『不适用』注记收口 = guide 规则 10 decision-time 移出 scope 并记录理由——closure audit 判定非降级）
- [x] independent draft review completed and recorded（两轮 iteration 见 Draft Review Record）
- [x] text consistency verified: status, phases, gates, and log all agree（closure audit 复核：rule 12 grep 干净，三 phase 全 completed 全 [x]）
- [x] closure audit was independent（fresh-session subagent 冷回放，见 Closure Audit Evidence）
- [x] closure evidence exists in files（plan Decision Record / §Deferred But Adjudicated / owner docs / roadmap / docs/logs/2026/08-23.md 三条目）

## Deferred But Adjudicated

### Native status panel（RPC 直读 vs 复用 monitor）— DEFERRED（M4-WI15 主裁定）

- Classification: `watch-only residual`
- Adjudication: Phase 1 Decision Record D-MAIN（2026-08-23）——主裁定 = 延期。依据摘要：机制可达（静态 client-plugin 面，bundle 形态支持 client 侧注册，零新 shipped dep 可达）但 rc + 外部作者零文档；唯一增量价值 = DSH 内嵌 step 级呈现（轮询形态、无 SSE 等价推送、实时性弱于通道 1）且零已记录需求；浏览器渲染不可入确定性门禁。
- Reopen triggers（任一触发即再裁定，详 Phase 1 Decision Record）：
  - **T1** 宿主后续 cohort 发布稳定且面向外部作者文档化的 client-plugin/面板扩展 API；
  - **T2** 已记录用户需求：DSH 内嵌 step 级状态可见性成为硬需求且 standalone monitor 不可达/不可接受；
  - **T3** monitor 嵌入 DSH UI 被裁定不可行而内嵌可见性需求成立。
- Re-adjudication constraints（范围钉界项约束内容，随裁定落档）：read-only 面板、数据经既有 `mdcontrol.*` 路由（swap data source, not schema）、零新 shipped dependency、确定性测试域钉住。
- Why Not Blocking Closure: 延期本身即 M4-WI15 的裁定交付物（roadmap 字面授权 "产出实现或明确延期记录" 两终态之一）；通道 1/2/3/5 已功能覆盖观看需求。
- Successor Required: `no`（trigger 驱动 reopen，无常设后继 work item）。

## Closure

Status Note: M4-WI15 决策型 work item 以**延期终态**收口——Phase 1 Explore 五发现 + D-MAIN 五准则同向裁定（收敛、无 human review 升级触发），Phase 2 延期分支工件（owner docs 三站点 as-adjudicated 回写 + §Deferred But Adjudicated 立案 T1/T2/T3）落地并被既有门禁全绿验证（纯文档 change-set，零引擎/零插件 diff），Phase 3 roadmap/一致性收口。roadmap 字面 "产出实现或明确延期记录" 以延期终态闭环；P4 里程碑收口（M4 全 done，roadmap 全量完成）。范围钉界项按 B1 条款『不适用——主裁定为延期』收口（约束内容随裁定落档为 reopen 时前置约束）。

Closure Audit Evidence:

- Auditor / Agent: 独立 fresh-session subagent `ses_fd0c2c5dcffeomBqKUE4kLFY6m`（冷回放：自 plan 顶部通读、逐文件核证、独立复跑全部验证命令）
- Verdict: **PASS**（无阻塞项）
- Evidence: 八项 checklist 全过——① rule 12 grep 干净（无 completed phase 挂空 checkbox；范围钉界项 B1 注记收口核实）；② Decision Record 实质性核证（host `packages/client/modules/src/index.ts` `dsh.client` 扫描/`/plugins/<id>/client.js` 路由 Claim A 逐行核验属实；better-sidebar dual-form + `dsh.plugin.json` `client.main` host 零引用 Claim B 核验属实，且 `dsh.plugin.json` 本体在 host 源码亦零代码引用——强化 E1-b）；③ 三站点回写 + stale 短语 grep 零命中；④ roadmap WI15 done + 裁定结果显式标注 + 全量完成核证；⑤ log 三条目在位；⑥ 独立复跑：插件链 133/133 exit 0 + verify-age.sh L1+L2 GREEN exit 0 + scoped porcelain 空 + 全仓 porcelain 恰 5 个 docs 文件（纯文档 change-set）；⑦ 九 Closure Gates 逐项判定可支撑；⑧ 红线全净（引擎/插件/monitor 零改动，无面板骨架代码）
- 非阻塞观察：§Closure 占位为 audit 前预期状态（本节即其回写）

Follow-up:

- 无阻塞 follow-up。reopen 由 §Deferred But Adjudicated T1/T2/T3 trigger 驱动（无常设后继 work item，Successor Required: no）；触发后的再裁定前置约束已随裁定落档（read-only / `mdcontrol.*` 数据面 / 零新 shipped dep / 确定性测试域）。
