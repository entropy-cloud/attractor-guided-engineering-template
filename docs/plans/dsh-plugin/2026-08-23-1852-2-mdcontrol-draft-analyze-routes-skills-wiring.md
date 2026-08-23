# 2026-08-23-1852-2 mdcontrol.draft/analyze 路由 + Mission Control skills 接线（dsh-plugin M3-WI12）

> Plan Status: active
> Mission: dsh-plugin
> Work Item: M3-WI12
> Last Reviewed: 2026-08-23（draft review 3 轮，iteration 3 共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M3-WI12（"Mission Control skills(mission-control-run/draft/analyze)接线到路由"，行内注记：**完成前置** = `mdcontrol.draft`/`mdcontrol.analyze` 路由——WI10 plan §Deferred 裁定归属本 WI 收编，不另立 work item）
> Related: `docs/architecture/dsh-plugin-packaging.md` §Service Surface（skills 行 + "draft/analyze → M3" 注记 + "Thin wrappers over engine orchestration, never reimplementing engine logic" 规则）、§Build bundling（NOT-bundled 清单）；`docs/design/dsh-plugin-integration.md` §Feature Name（三技能定义）；前置 `2026-08-23-1621-2`（§Deferred But Adjudicated 后继 = 本 plan）；本批执行顺序：`1852-1`（WI11）→ 本 plan（N=2）→ `1852-3`（WI13）
> Audit: required

## Current Baseline

**run/status/list 路由已 live（异步契约 + 守卫 + 回执）；draft/analyze 路由与 skills 注册完全缺席；两处引擎/宿主接缝存在真实设计缺口：**

- **收编义务（硬前置）**：`2026-08-23-1621-2` §Deferred "mdcontrol.draft / mdcontrol.analyze 路由包装"（classification `out-of-scope improvement`，Successor Required: yes，reopen trigger = M3 对应 plan 启动——本 plan 即触发）。roadmap WI12 行内注记与 `plugin/dsh/src/service.ts` 头注台账（:23-25 "draft/analyze — M3 (WI12 completion precondition)"、"skills registration — M3-WI12"）均已钉死归属。
- **引擎面（bundle 内可用，`plugin/dsh/assets/src/`）**：`orchestrator.js` 导出 `cmdDraftMission`（:505，两段式 brief→draft 管线入口）、`validateDraftDesc`（:128）、`extractBriefGate`（:177）、`parseDraftArtifact`（:200）、`orchestrateAnalyze({ config })`（:521）；`postmortem.mjs` 导出 `runPostmortem({ projectRoot, missionsDir, targetRunDir, targetRunId, runner, opts })`（:37——`runner.runAgent` 必需，`opts.moduleInfo` 缺省时自解析）。
- **draft 派发 seam 缺口（与 analyze 同构但更隐蔽——draft review B1 核实）**：`cmdDraftMission` **无 executor 注入**——AI 步经 `__runnerFactory(resolved)`（默认 `createRunner` = process spawn；唯一覆盖位 `__setRunnerFactoryForTest` 是显式 test seam，orchestrator.js:36-47、:302 → runner.js:176）。`beginNativeMission` 能原生派发仅因 `orchestrateRun({config, executor})` 有 executor 参（:554）——draft 路径没有对应 seam。故"draft 执行形状"不是二元（in-host vs detached node），而是三维裁定空间：**执行位置（in-host task vs detached node）× AI 派发后端（process runner vs native executor）× 引擎 seam 需求（零 vs 需要 draft 侧 runner/executor 注入点）**。若裁定需要 native draft 派发，则隐含引擎 seam——**本 plan 红线段已把两处窄口（analyze 入口增参 + draft 侧注入 seam）纳入预授权**（受"零 CLI 行为变化 + 引擎全套绿"约束）。
- **引擎面（bundle 外，硬约束）**：`draft-job.mjs`（`startDraftJob` :77——detached node spawn `node main.js draft …` + `draft-state.json` 两段状态机）、`spawner.mjs`、`main.js` 均在 NOT-bundled 清单（packaging doc §Build bundling）。**张力**：packaging doc §Service Surface 写 "startDraftJob detached-node concurrency is retained in plugin form initially"，但 bundle 不含其入口（main.js）——plugin 形态的 draft 执行形状需 Decision 裁定，并把 owner 措辞与现实对齐。
- **analyze 派发 seam 缺口**：`orchestrateAnalyze` 内部 `createRunner(config)` 自建并关闭 runner——**无 executor 注入 seam**。native 模式下直接调用会在宿主内走 ProcessExecutor 式 spawn（违背 native 派发初衷）。备选：(a) 插件层直调 `runPostmortem` + 适配 runner（`{ runAgent: (…) => executor.executeAgent(…) }` 薄适配——是否满足 "thin wrapper, never reimplementing" 规则属裁定项）；(b) 引擎加 seam（`orchestrateAnalyze` 增 executor 参，镜像 `orchestrateRun` 的 WI1 形态——引擎 diff，需钉死范围与 CLI 零回归）。analyze 的 dispatch 语义（marker/`<ANALYZE_*>` 标签解析在 postmortem 内部）不受备选影响。
- **skills host 面（已初读 README，执行机制未读；e2e 组合面缺口——draft review B2 核实）**：host `packages/skill/`（`skill` = `ctx.skills` 注册表 / `skill-badge` / `skill-filesystem` / `tool-skill`）。`ctx.skills.register(skill)` 注册 runtime 内嵌技能（默认 `{ modelInvocable: true, userInvocable: true }`）、`registerProvider` 注册文件后端、`skills/change` 失效通知——**注册面清楚**；但"技能被会话内模型调用后如何落到 `mdcontrol.*` 路由"的执行机制（SkillDefinition 内容形状、是否携带可执行 handler、与 `tool-skill` 的关系、宿主会话内技能的发现路径）未读，Phase 1 Explore 裁定。**e2e 组合缺口**：`test/fixtures/e2e.cordis.yml` 无任何 skill 组合行且 agent-spine 配置 `skills: enabled: false`（fixture :58-59）——host 自有 base bundle 需 `skill`/`skill-filesystem`/`tool-skill` 组合行（`@deepseek-ai/dsh-skill` 等，`packages/bundle/base/cordis.patch.yml:237-248` 先例），当前 20 个 devDeps 均未含 → Phase 4 的 `ctx.skills.list()` 断言隐含 fixture 扩行 + 条件性新增 exact 钉 devDeps（钉版纪律 = 显式 changelog 事件，packaging doc §Version pins）。
- **design 契约**：三技能 `mission-control-run <mission>`（demo / onboarding / custom）、`mission-control-draft <description>`（两段式生成）、`mission-control-analyze [run]`（最近或指定 run 的 Reflexion postmortem）——自然语言入口，调用路由（design doc §Feature Name）。
- **e2e 基建可复用**：`test/fixtures/e2e.cordis.yml` 组合含真实 mission-control service 行（root realm 直达）；skills 的 e2e 断言受上条组合缺口约束（需 fixture 扩行后 `ctx.skills.list()` 才可达）；真模型自然语言调用不入确定性门禁（verify:native 姿态）。
- **异步契约先例**：`mdcontrol.run` = 立即返回 `{ runId, status:'started' }` + detached in-host task + status 透传 + 终态可选回执——draft/analyze 的作业语义对齐该形态（draft 尤甚：两段生成耗时同量级）；draft-state.json 词汇（`phase: brief|draft`、`jobId`、`status`）是 monitor/CLI 既有消费面，plugin 路由应复用而非发明第二状态机。
- **红线**：引擎若加 seam，diff 范围钉死 `orchestrator.js`（+其单测）且 CLI 行为零变化——**预授权范围 = analyze 入口增参（Phase 1 Decision 3 选项 b）与 draft 侧 runner/executor 注入 seam（Phase 1 Decision 2 若裁定 native draft 派发）两处窄口，同受"零 CLI 行为变化 + 引擎全套绿"约束；任何其他引擎文件改动即停线重议**；`plugin/dsh/package.json` `dependencies` 不动（skills 用 `ctx.skills` 宿主面；skill 组合行的 devDeps 增钉属 devDependencies 面，且每钉 = 显式 changelog 事件）；零 `@deepseek-ai` 进引擎目录。

## Goals

- `mdcontrol.draft` 路由：两段式 brief→draft 生成（1621-2 deferred 收编），异步契约对齐 `mdcontrol.run` 形态，draft-state 词汇复用引擎既有消费面。
- `mdcontrol.analyze` 路由：对指定/最近 run 的 Reflexion postmortem，native 派发 seam 经 Phase 1 裁定后落地。
- Mission Control 三技能（run/draft/analyze）注册进 DSH 会话并接线到路由——roadmap WI12 主标签。
- 全部路由/技能行为在单测域钉住 + e2e 可行域断言 + docs/roadmap/台账回写（1621-2 deferred 闭环）。

## Non-Goals

- onboarding 双形式对齐与描述符注册（M3-WI11，plan `1852-1`）；`tools/pre-execute` 守门（M3-WI13，plan `1852-3`）；M4（WI14/WI15）。
- 不改 flow DSL / 引擎状态机 / CLI 行为；引擎 diff 若发生，范围钉死 `orchestrator.js` 的**两处预授权窄口**（analyze 入口增参 + draft 侧 runner/executor 注入 seam，见红线段），每处附单测且 CLI 行为零变化；任何其他引擎文件改动即停线重议。
- 不重构 `startDraftJob` 本身（owner-doc 已显式 deferred "moving it in-process is deferred"——本 plan 只裁定 **plugin 路由**的执行形状并回写 owner 措辞，不动引擎 CLI/monitor 的 draft-job 路径）。
- 真模型端到端自然语言技能调用验证（env 人工腿，记录性质，不进确定性门禁）。

## Task Route

- Type: `implementation-only change`（插件层新功能 + 可能的窄引擎 seam + 验证）
- Owner Docs: `docs/architecture/dsh-plugin-packaging.md` §Service Surface（路由/skills/draft-job 语义 owner）、§Build bundling、§Execution Backend Seam（analyze seam 若走引擎增参时的对齐面）；`docs/design/dsh-plugin-integration.md` §Feature Name（三技能行为面）；roadmap WI12。
- Skill Selection Basis: 实现阶段 `Skill: none`（无匹配可复用方法）；Phase 4 文档对齐阶段 `Skill: document-audit-prompt.md`（输入 = 本 plan 目标 owner docs + 相关输入，输出 = 审计发现与修订目标——见 `docs/skills/README.md` 该行）

## Infrastructure And Config Prereqs

- 单测域：纯 Node、零网络、零凭据（CI 可跑；fake HostContext/agents 注入）。
- e2e 域：零凭据零网络（scripted stub 模型）；复用 `e2e.cordis.yml` 组合。
- host 源码只读核查：`~/ai/dsh-src/deepseek-harness`（skills 执行机制 + base bundle skill 组合行先例 `packages/bundle/base/cordis.patch.yml:237-248`——Phase 1 Explore）。
- **条件性 devDeps 增钉（B2 预告）**：若 Phase 1 裁定 skills e2e 断言需要 skill 组合行，`plugin/dsh/package.json` devDependencies 按 survey 同源纪律 exact 钉 `@deepseek-ai/dsh-skill`（及组合所需同族包）于 `0.1.1-rc.2`——devDependencies 面（shipped `dependencies` 零变化），每钉 = 显式 changelog 事件（packaging doc §Version pins）。
- 无新 env/端口/迁移；draft-state/run-state 写入沿用 `_tmp/` 布局。

## Execution Plan

### Phase 1 - Explore + 三项 Decision（skills 执行机制 / draft 执行形状 / analyze 派发 seam）

Status: planned
Targets: 决策记录于本 plan（doc 编辑统一归 Phase 4，不双记账）
Skill: none

- Item Types: `Decision`
- Prereqs: 无

- [ ] `Decision`（含 Explore）**skills 执行机制**：读 `packages/skill/skill`（SkillDefinition/SkillRegistration 形状、`register()` 的 runtime 嵌入语义）+ `tool-skill`（模型调用面）+ 宿主会话内技能发现路径，裁定三技能的注册形状（`ctx.skills.register` runtime 行 vs filesystem provider）与"技能触发 → `mdcontrol.*` 路由调用"的落地机制（技能内容如何指引/驱动路由调用；若机制要求工具面配合，钉为条件项）。裁定必须回答：模型在会话中说 "run the onboarding mission" 时，从技能命中到路由调用的完整链路是什么。
  - Skill: none
- [ ] `Decision`（含 Explore）**draft 执行形状（三维裁定空间）**：轴 1 执行位置（in-host detached task vs detached node spawn〔需 bundle 外 repo 路径，违背 bundle 自含性，预期否决〕）× 轴 2 AI 派发后端（process runner〔隐含宿主内 driver 二进制 PATH 依赖 + `loadDotenv` in-host 副作用，须如实评估〕vs native executor〔原生派发初衷〕）× 轴 3 引擎 seam 需求（零 vs draft 侧注入点〔`cmdDraftMission` 现无 executor 参，唯一覆盖位是 test seam——见 Current Baseline〕）。Explore 义务：核实 `__runnerFactory` 现实（orchestrator.js:36-47、:302 → runner.js:176）、宿主 PATH/driver 可用性对 process 腿的约束、`cmdDraftMission` 无 CLI 包装时的可调用性与 draft-state 写入行为。裁定必须给全三维取值 + 理由 + 残险；若取"native 派发 + 引擎 seam"，引用本 plan 红线段的预授权扩权条款；packaging doc "startDraftJob detached-node retained" 措辞随裁定在 Phase 4 对齐（CLI/monitor 路径不动）。
  - Skill: none
- [ ] `Decision`（含 Explore）**analyze 派发 seam**：(a) 插件层直调 `runPostmortem` + 薄适配 runner（`executeAgent` 包装；零引擎 diff；"thin wrapper" 合规性论证；**生命周期归属**：适配层自持 runner 的创建/关闭——`orchestrateAnalyze` 现自建自关（:522、:531），插件直调 `runPostmortem` 时须自持 create/close，防 double-close/泄漏）vs (b) 引擎 `orchestrateAnalyze` 增 executor 参（镜像 `orchestrateRun` WI1 seam；引擎 diff 钉死 analyze 入口 + CLI 零回归 + 单测）。裁定记录备选与残险；若选 (b)，本 plan 红线段已预授权该窄范围。
  - Skill: none

Exit Criteria:

- [ ] 三项 Decision 连同依据/备选/残险记录于 plan 内（Phase 4 才落 owner docs，不双记账）
- [ ] `docs/logs/` updated（Phase 1 决策条目）

### Phase 2 - mdcontrol.draft / mdcontrol.analyze 路由 + 单测

Status: planned
Targets: `plugin/dsh/src/mdcontrol-routes.ts`、`plugin/dsh/src/engine-bridge.ts`（如需 draft 启动变体）、`plugin/dsh/src/service.ts`（台账收窄）、`plugin/dsh/test/mdcontrol-routes.test.mjs`
Skill: none

- Item Types: `Add | Decision | Proof`
- Prereqs: Phase 1 三 Decision

- [ ] `Add` `mdcontrol.draft`：payload `{ projectRoot, desc, flowHint?, targetFile?, skipBrief?, followup? }`——异步契约（立即返回作业句柄，生成继续为 detached 任务；两段 phase 词汇复用 draft-state.json）；守卫策略裁定（draft 与 run 是否互斥、并发 draft 语义——记录于 plan，不静默沿用 run 守卫）
  - Skill: none
- [ ] `Add` `mdcontrol.analyze`：payload `{ projectRoot, runId? }`（缺省 = 最近 run，枚举先例复用 `mdcontrol.list` 的 disk 扫描）——postmortem 经 Phase 1 裁定的 seam 执行；同步 vs 异步契约随执行时长评估裁定并记录（analyze 单轮 postmortem，预期可与 run 异步契约同形但需论证）
  - Skill: none
- [ ] `Add` `service.ts` 头注台账收窄（draft/analyze 落地归属本 WI；skills 行保留至 Phase 3 完成后收口）+ HTTP dispatcher 自动获得新方法（record 驱动，无需改 dispatcher）
  - Skill: none
- [ ] `Proof` 单测扩展（fake HostContext + fake agents/runner 直调）：draft 两段状态推进 + 异步非阻塞 + 守卫语义；analyze 目标解析（指定 runId / 最近 run / 缺 run-state 三态）+ seam 路径分派 + 结果形状；payload 校验；`npm --prefix plugin/dsh test` 全绿 + `./verify-age.sh` exit 0 零回归；若走引擎 seam（analyze 选项 b 或 draft native seam），另跑 `pnpm --prefix tools/mission-driver test` 全绿 + CLI 冒烟零回归
  - Skill: none

Exit Criteria:

- [ ] draft/analyze 行为在单测域机器钉住（含异步契约与守卫语义）
- [ ] 1621-2 §Deferred 收编在代码面完成（service 台账同步）
- [ ] `docs/logs/` updated

### Phase 3 - Mission Control skills 注册 + 接线

Status: planned
Targets: `plugin/dsh/src/`（skills 注册模块，位置随 Phase 1 Decision）、`plugin/dsh/src/service.ts`、`plugin/dsh/test/`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 2（技能调用的是已落地路由）

- [ ] `Add` 三技能注册（`mission-control-run` / `mission-control-draft` / `mission-control-analyze`，design doc §Feature Name 的参数语义）——按 Phase 1 裁定的机制接线到 `mdcontrol.*` 路由；描述文案与 invocation policy 显式设定并记录
  - Skill: none
- [ ] `Proof` 单测：注册形状（名称/描述/invocation policy）、路由调用接线（fake 路由断言参数透传：mission 名 → `mdcontrol.run`、description → `mdcontrol.draft`、run 选择 → `mdcontrol.analyze`）、dispose 注销；service.ts 台账收口（skills 行 → 落地）
  - Skill: none

Exit Criteria:

- [ ] 三技能在会话注册面存在且入口参数正确落到对应路由（单测域）
- [ ] `docs/logs/` updated

### Phase 4 - e2e 扩展 + docs/roadmap/台账回写

Status: planned
Targets: `plugin/dsh/scripts/e2e-demo.mjs`（或姊妹脚本，随 Phase 1/3 落点裁定——二选一在 plan 内记录，不留 or-态）、`plugin/dsh/test/fixtures/e2e.cordis.yml`（条件性 skill 组合行扩展 + 对应 devDeps 钉版，见 Infra prereqs）、`plugin/dsh/package.json`（devDependencies 条件项）、`docs/testing/2026/`、owner docs、roadmap、`docs/plans/dsh-plugin/2026-08-23-1621-2-mdcontrol-run-async-contract-e2e.md`
Skill: `document-audit-prompt.md`（owner-doc 对齐项；输入/输出见 docs/skills/README.md）

- Item Types: `Proof`
- Prereqs: Phase 2 + Phase 3

- [ ] `Proof` e2e 扩展（stub 域，复用 e2e 组合）：analyze 腿——对 e2e 产生的 demo run 路由直调 postmortem（stub 剧本服务 analyze 步的 return-tag 序列）；draft 腿——`mdcontrol.draft` 两段剧本（`<BRIEF_GATE>` 标签先例在 e2e-policy 可编程）；skills 注册面——fixture 扩 skill 组合行后 boot 断言 `ctx.skills.list()` 三技能在列（组合行扩展与 devDeps 钉版为前置条件项，缺一则该断言降级为显式记录的 scope limitation）；全部固化为可复跑命令（落点随裁定：扩展 `verify:e2e` 或新增姊妹 script——不接 CI）；记录 `docs/testing/2026/`
  - Skill: none
- [ ] `Proof` owner docs + 台账：packaging doc §Service Surface as-built（draft/analyze 路由 + draft 执行形状裁定措辞对齐 + skills as-built）；design doc §Feature Name as-built 注记（skills 落地、入口链路）；R3 注记（如 L4 面扩展）；roadmap WI12 `todo → done`（证据摘要内联，完成前置注记随收编兑现）；1621-2 plan §Deferred 台账回写（已收编闭环）
  - Skill: `document-audit-prompt.md`（与 Phase 级声明一致）
- [ ] `Proof` `docs/logs/` 聚合收口条目（含 verification scope 声明）
  - Skill: none

Exit Criteria:

- [ ] e2e 可行域断言全绿且固化
- [ ] owner docs / roadmap / 1621-2 台账与落地状态一致
- [ ] `docs/logs/` updated

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd1b92812ffeylGJf5DG7MvuAC`，2026-08-23）——B1：draft 执行形状 Decision 基于假类比（`cmdDraftMission` 无 executor 注入，`__runnerFactory` 默认 process spawn、唯一覆盖位是 test seam——"镜像 beginNativeMission" 不成立；三维裁定空间缺失；native draft 派发隐含的引擎 seam 未被红线预授权或显式重议）。修订：Baseline 增 draft seam 缺口条目、Decision 2 重写为三维空间（执行位置 × 派发后端 × seam 需求）+ Explore 义务、红线段扩权为 analyze + draft 两处窄口预授权。B2：skills e2e 断言的基线错误（e2e fixture 无 skill 组合行且 `skills: enabled: false`；host base bundle 需 skill 行；devDeps 未含）——修订：Baseline 记缺口、Infra prereqs 增条件性 devDeps 增钉、Phase 4 Targets 增 fixture 扩行 + 降级路径。非阻塞 3 项全采纳：N1 Phase 2 Item Types 增 `Decision`；N2 Proof 命令具名 + or-态收紧；N3 analyze 选项 (a) 生命周期归属（适配层自持 create/close 防 double-close）。fact-check 其余全过（引擎导出/NOT-bundled/skills 注册面/deps 钉版/1621-2 后继链/单一结果面裁定 defensible）。
- Independent draft review iteration 2: `needs revision`（独立 fresh session `ses_fd1b3d269ffefWWjX8V9tnIMIf`，2026-08-23）——B1（传播不全）：两处窄口预授权只落在红线段，Non-Goals 仍写"analyze 入口（+单测）"、Closure Gates 仍只条件于"seam (b)"、Baseline 残留修订前措辞"当前红线只预授权 analyze 入口"——引擎 diff 边界是本 plan 最安全攸关的约束，三处必须一致。修订：Non-Goals 改两处预授权窄口、Closure Gates 改"若走任一预授权引擎 seam（analyze 选项 b 或 draft native seam）"、Baseline 措辞直陈扩权。非阻塞 3 项采纳：N1 先例路径补 `packages/` 段（两处）；N2 Phase 4 Skill 行自相矛盾修正——`document-audit-prompt.md` 是 `docs/skills/README.md:43` 在列技能，Phase 4 改记 `Skill: document-audit-prompt.md` 且 Task Route 基础同步（实现阶段 none / 文档对齐阶段具名）；N3 seam 引用区间 :36-47。iteration 1 的 B1 判"substance resolved, propagation incomplete"（本轮补齐）、B2/N1–N3 全部 resolved。
- Independent draft review iteration 3: `acceptable as-is`（独立 fresh session `ses_fd1af9ac9ffeaQpSOnGmsiMcvP`，2026-08-23）——iteration 2 B1/N1–N3 复核全部 resolved（两处窄口预授权在 Baseline/红线/Non-Goals/Closure Gates/Phase 2 Proof 五处一致；路径含 `packages/` 段；Skill 行修正经 README:43 核实；seam 区间 :36-47 live 核实）；无 unowned decision、无 anti-slacking 违例、无 phase/exit 错配、无 owner-doc 矛盾。非阻塞 2 项采纳收紧：N1 Phase 4 owner-docs 条目级 Skill 行与 Phase 级声明对齐（`document-audit-prompt.md`）；N2 Phase 1 Decision 2 seam 区间统一 :36-47。共识达成，Plan Status → active。

## Closure Gates

- [ ] in-scope behavior is complete
- [ ] relevant docs are aligned
- [ ] verification has run（单测域插件链 + verify-age.sh 零回归〔+引擎全套与 CLI 冒烟，若走任一预授权引擎 seam——analyze 选项 b 或 draft native seam〕；e2e 扩展腿；命令在各 Proof 项固化）
- [ ] scoped verification is not conflated with full verification——skills 的真模型自然语言调用不入确定性门禁（env 人工腿或显式缺失，如实标注）
- [ ] no in-scope item downgraded to deferred/follow-up
- [ ] independent draft review completed and recorded
- [ ] text consistency verified: status, phases, gates, and log all agree
- [ ] closure audit was independent
- [ ] closure evidence exists in files

## Deferred But Adjudicated

（draft 时点无新增；真模型自然语言技能调用验证若 Phase 4 未以 env 人工腿覆盖，按格式立案：classification `watch-only residual`、reopen trigger = 真实凭据腿可用时。）

## Closure

Status Note: （open — draft，未执行。）

Closure Audit Evidence:

- （待收口。）

Follow-up:

- （待收口；confirmed defects 不得出现在此。）
