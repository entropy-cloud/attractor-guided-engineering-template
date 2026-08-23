# 2026-08-23-1852-2 mdcontrol.draft/analyze 路由 + Mission Control skills 接线（dsh-plugin M3-WI12）

> Plan Status: completed
> Mission: dsh-plugin
> Work Item: M3-WI12
> Last Reviewed: 2026-08-23（draft review 3 轮，iteration 3 共识 `acceptable as-is`，见 Draft Review Record；closure audit PASS 见 Closure）
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

Status: completed
Targets: 决策记录于本 plan（doc 编辑统一归 Phase 4，不双记账）
Skill: none

- Item Types: `Decision`
- Prereqs: 无

- [x] `Decision`（含 Explore）**skills 执行机制**：读 `packages/skill/skill`（SkillDefinition/SkillRegistration 形状、`register()` 的 runtime 嵌入语义）+ `tool-skill`（模型调用面）+ 宿主会话内技能发现路径，裁定三技能的注册形状（`ctx.skills.register` runtime 行 vs filesystem provider）与"技能触发 → `mdcontrol.*` 路由调用"的落地机制（技能内容如何指引/驱动路由调用；若机制要求工具面配合，钉为条件项）。裁定必须回答：模型在会话中说 "run the onboarding mission" 时，从技能命中到路由调用的完整链路是什么。
  - Skill: none
  - **裁定记录（2026-08-23，host 源码只读核查 `~/ai/dsh-src/deepseek-harness`）**：注册形状 = **`ctx.skills.register()` runtime 行 ×3**（`SkillRegistration = { name, description, whenToUse?, content, resourceBase?, invocation?, provider? }`——纯 markdown 指令体，**无可执行 handler**；register 补默认 `invocation {modelInvocable:true,userInvocable:true}` + `provider:"runtime"`，rank 250，同名 first-wins；filesystem provider 否决——skills 内容与插件代码同源同版发布，runtime 行零文件布局依赖）。挂载时机 = service `apply()` 内经 **`ctx.inject(['skills'], cb)` 反应式注册**（cordis registry 公开 API："Run a callback once the requested services are available… unloaded and re-run whenever a required service changes"）——顺序无关（skills 服务晚于 mdcontrol 挂载也能触发）、服务替换自动卸载重注册（disposer 语义内建）；headless 组合无 skills → inject fiber 永不激活 = mount-log 降级行，**与 webServer 缺席同姿态，绝不阻塞主服务**（不用 plugin 级 `inject:` 声明——那会 pending 整个 mdcontrol fiber 直到 skills 出现，破坏降级语义）。
  - **完整链路（"run the onboarding mission"）**：① `tool-skill`（`@deepseek-ai/dsh-tool-skill`，模型调用面）在 `agent/pre-step` 快照 `ctx.skills` 渲染 catalog（`<available_skills>` name+description 行）注入 durable user 消息 → ② 模型按 description 命中 `mission-control-run`，调 `skill` tool `{name}` → ③ 工具返回 `<skill_content>` 指令体（`renderSkillContent` 单一真相渲染）→ ④ 指令体指示模型以会话内 **HTTP-capable 工具** `POST /mdcontrol/api/mdcontrol.run`（JSON body `{projectRoot, args:{mission:"onboarding"}, followup:{sessionId}}`，`{ok,value}` / `{ok,error}` 信封）→ ⑤ 路由立即返回 `{runId,status:'started'}`，指令体指示模型转达句柄并可用 `mdcontrol.status` 轮询 / 等待 followup 回执。**条件项（工具面配合）**：会话需具备 HTTP 能力工具（`web_fetch` 或 bash+curl 之类）——技能内容显式声明该调用机制；无此类工具的组合无法执行调用（注册本身无害）。
  - 残险：真宿主 isolate realm 内 `ctx.get('skills')` 可见性与 agents/webServer 同姿态（既有问题面，e2e 断言平面 = root-realm 组合）；真模型自然语言命中质量不入确定性门禁（Non-Goal，env 人工腿）。
- [x] `Decision`（含 Explore）**draft 执行形状（三维裁定空间）**：轴 1 执行位置（in-host detached task vs detached node spawn〔需 bundle 外 repo 路径，违背 bundle 自含性，预期否决〕）× 轴 2 AI 派发后端（process runner〔隐含宿主内 driver 二进制 PATH 依赖 + `loadDotenv` in-host 副作用，须如实评估〕vs native executor〔原生派发初衷〕）× 轴 3 引擎 seam 需求（零 vs draft 侧注入点〔`cmdDraftMission` 现无 executor 参，唯一覆盖位是 test seam——见 Current Baseline〕）。Explore 义务：核实 `__runnerFactory` 现实（orchestrator.js:36-47、:302 → runner.js:176）、宿主 PATH/driver 可用性对 process 腿的约束、`cmdDraftMission` 无 CLI 包装时的可调用性与 draft-state 写入行为。裁定必须给全三维取值 + 理由 + 残险；若取"native 派发 + 引擎 seam"，引用本 plan 红线段的预授权扩权条款；packaging doc "startDraftJob detached-node retained" 措辞随裁定在 Phase 4 对齐（CLI/monitor 路径不动）。
  - Skill: none
  - **裁定记录（2026-08-23，三维全取值）**：**轴 1 = in-host detached task**（`mdcontrol.run`/`beginNativeMission` 先例；detached node spawn 否决——`main.js`/`draft-job.mjs`/`spawner.mjs` 均在 NOT-bundled 清单，bundle 外 repo 路径违背自含性，正如 plan 预期）。**轴 2 = native executor**（process runner 否决——宿主内 driver 二进制 PATH 依赖 + spawn 语义与 native 派发初衷相悖，且破坏单测/e2e 的 hermetic fake-agents 域）。**轴 3 = 引擎 seam，走红线段预授权窄口**：`cmdDraftMission` 现实核实（orchestrator.js:36-47 `__runnerFactory` 模块级变量、:302 唯一消费点；`__setRunnerFactoryForTest` 显式 test seam，生产使用全局变异被否决）。seam 落地 = `cmdDraftMission(desc, opts)` 接受 `opts.executor`（StepExecutor，WI1 接口），模块内 `runnerFromExecutor(executor)` 适配为消费的 `{runAgent, close}` runner 形状；executor 缺席 → `__runnerFactory(resolved)` 原路径逐字节不变（CLI 零回归；`resolveConfig({...opts,...config})` 只读已知键，`executor` 键被忽略）。draft 路由：校验 payload → 路由先以引擎自有 `validateDraftDesc(desc, base.json draft.minDescLength)` fail-fast（thin wrapper + 使引擎 `process.exitCode=1` 校验分支在宿主内不可达）→ 创建 jobDir `_tmp/<jobId>`（jobId = `draft-<ts>-mission-draft`，同毫秒冲突加随机后缀，startDraftJob 词汇）并写初始 `draft-state.json`（`status:"running"`, `phase: brief|draft`——startDraftJob 逐字段词汇，无第二状态机）→ 占用与 run **共享的 ActiveRunGuard root 槽**（裁定：draft 与 run 互斥——draft 写 missions/docs 而 run 读之，保守姿态与 WI10 一致可后放宽；并发同根 draft = 同一 `run-in-progress` wire error；跨根独立）→ detached task 跑 `cmdDraftMission(desc,{dir,draftJobDir,flowHint,targetFile,skipBrief,driver:'native',allowNativeDriver:true,executor})` → 立即返回 `{jobId,status:'started',jobDir,startedAt}`；终态（completed/failed/blocked——引擎写 draft-state）释放守卫 + 可选 followup 回执。
  - 残险：`loadDotenv(projectRoot)` 在宿主内执行（cmdDraftMission 内部）——与 run 路由 `bootstrapNativeConfig` 副作用面一致，接受并记录；引擎内部二次 desc 校验（无害双检）；`startDraftJob` 本体不重构（Non-Goal），packaging doc 措辞 Phase 4 对齐。
- [x] `Decision`（含 Explore）**analyze 派发 seam**：(a) 插件层直调 `runPostmortem` + 薄适配 runner（`executeAgent` 包装；零引擎 diff；"thin wrapper" 合规性论证；**生命周期归属**：适配层自持 runner 的创建/关闭——`orchestrateAnalyze` 现自建自关（:522、:531），插件直调 `runPostmortem` 时须自持 create/close，防 double-close/泄漏）vs (b) 引擎 `orchestrateAnalyze` 增 executor 参（镜像 `orchestrateRun` WI1 seam；引擎 diff 钉死 analyze 入口 + CLI 零回归 + 单测）。裁定记录备选与残险；若选 (b)，本 plan 红线段已预授权该窄范围。
  - Skill: none
  - **裁定记录（2026-08-23）：选 (a) 插件层直调 `runPostmortem` + 薄适配 runner，零引擎 diff**。合规论证：postmortem 管线（skeleton 构建 / module 检测 / prompt 解析 / return-tag 解析）100% 留在引擎 `postmortem.mjs`；插件替换的仅是 `orchestrateAnalyze` 的 4 行 runner 建管 plumbing——适配器 `{ runAgent: (step,prompt,system,sessionId) => executor.executeAgent(step,prompt,system,sessionId,undefined,undefined) }`，字段映射与 orchestrateAnalyze 逐参同源（projectRoot/missionsDir/targetRunDir/targetRunId/runner/opts.moduleInfo 缺省自解析）。**生命周期归属（N3）**：适配层自持——per-call `NativeExecutor` 先建、`finally` 单点 `dispose?.()`（runPostmortem 从不 close runner → 无 double-close 面；镜像 `runNativeMission` finally 形态）。备选 (b) 虽预授权但不需要——被跳过的包装无逻辑可失；reopen trigger = `orchestrateAnalyze` 长出 runner plumbing 之外的真编排逻辑。**同步/异步裁定：同步路由**。论证：runPostmortem = 恰好一次 agent dispatch（无引擎循环），run 异步契约的动机（数十分钟级引擎循环挂起调用方）不适用；结果原样携带 `{postmortemFile, memoryUpdated, text}` + 目标身份——技能调用方一次拿到完整 debrief；异步形态需新增无既有消费面的 job 记账面，收益为负。残险：慢模型使 HTTP 调用长时间挂起（native watchdog 60min 默认上界；调用方 bash 工具 60s 超时属调用方工具属性——技能内容如实提示）；**analyze 不占 run 守卫**（读为主单轮，目标为已终态 run；互斥无必要——显式裁定记录）。reopen trigger = 真实使用出现需 fire-and-forget 的多分钟级 hold。

Exit Criteria:

- [x] 三项 Decision 连同依据/备选/残险记录于 plan 内（Phase 4 才落 owner docs，不双记账）
- [x] `docs/logs/` updated（Phase 1 决策条目）

### Phase 2 - mdcontrol.draft / mdcontrol.analyze 路由 + 单测

Status: completed
Targets: `plugin/dsh/src/mdcontrol-routes.ts`、`plugin/dsh/src/engine-bridge.ts`（如需 draft 启动变体）、`plugin/dsh/src/service.ts`（台账收窄）、`plugin/dsh/test/mdcontrol-routes.test.mjs`
Skill: none

- Item Types: `Add | Decision | Proof`
- Prereqs: Phase 1 三 Decision

- [x] `Add` `mdcontrol.draft`：payload `{ projectRoot, desc, flowHint?, targetFile?, skipBrief?, followup? }`——异步契约（立即返回作业句柄，生成继续为 detached 任务；两段 phase 词汇复用 draft-state.json）；守卫策略裁定（draft 与 run 是否互斥、并发 draft 语义——记录于 plan，不静默沿用 run 守卫）
  - Skill: none
  - 落地：`mdcontrol-routes.ts` `mdcontrol.draft`——引擎自有 `validateDraftDescription`（`validateDraftDesc` 直通 + base.json `draft.minDescLength` 读取镜像）fail-fast 在守卫前（垃圾 desc 不建 jobDir 不占槽，引擎 exitCode=1 分支宿主内不可达）；`beginNativeDraft`（engine-bridge）建 jobId/jobDir（startDraftJob 词汇 + 同毫秒冲突重试）+ 初始 draft-state.json（running + phase brief|draft）→ executor 先建（agents 缺失 = plain throw）→ detached task 跑 `cmdDraftMission(desc, { dir, draftJobDir, flowHint, targetFile, skipBrief, driver:'native', allowNativeDriver:true, executor })`；**守卫裁定 = 与 run 共享 ActiveRunGuard root 槽**（单引擎活动 per root；draft↔run 互斥 + 并发 draft 同一 `run-in-progress` 错误，错误措辞更新为 "run or draft … single engine activity per project root"；跨根独立）；runner 适配器内 single dispose（cmdDraftMission 全路径 close 保证，bridge 无第二 dispose 位点）；opt-in followup 回执（settleDraft 读 draft-state 终态 status + missionName）。
- [x] `Add` `mdcontrol.analyze`：payload `{ projectRoot, runId? }`（缺省 = 最近 run，枚举先例复用 `mdcontrol.list` 的 disk 扫描）——postmortem 经 Phase 1 裁定的 seam 执行；同步 vs 异步契约随执行时长评估裁定并记录（analyze 单轮 postmortem，预期可与 run 异步契约同形但需论证）
  - Skill: none
  - 落地：目标解析复用 `listDiskRuns`（run-state.json 存在 = run 身份；显式 runId 查找 / 缺省 mtime 最新 / 空 → `not-found`）；`runNativeAnalyze`（engine-bridge，Decision 3 选项 (a)）同步直调 `runPostmortem` + 薄适配 runner（per-call NativeExecutor、finally 单点 dispose）；jobDir = `_tmp/analyze-run-<ts>`（CLI 词汇 + 冲突重试）；结果原样携带 `{ targetRunId, targetRunDir, jobDir, postmortemFile, memoryUpdated, text }`；不占 run 守卫（Phase 1 显式裁定）。
- [x] `Add` `service.ts` 头注台账收窄（draft/analyze 落地归属本 WI；skills 行保留至 Phase 3 完成后收口）+ HTTP dispatcher 自动获得新方法（record 驱动，无需改 dispatcher）
  - Skill: none
  - 落地：台账 draft/analyze → LANDED (M3-WI12)，mount log 路由行 + phase + guard 措辞更新；dispatcher record 驱动零改动（单测经 `mdcontrol.nope` 重钉 404 分支——原用例以 `mdcontrol.draft` 为 unknown method，新路由落地后改针）。
- [x] `Proof` 单测扩展（fake HostContext + fake agents/runner 直调）：draft 两段状态推进 + 异步非阻塞 + 守卫语义；analyze 目标解析（指定 runId / 最近 run / 缺 run-state 三态）+ seam 路径分派 + 结果形状；payload 校验；`npm --prefix plugin/dsh test` 全绿 + `./verify-age.sh` exit 0 零回归；若走引擎 seam（analyze 选项 b 或 draft native seam），另跑 `pnpm --prefix tools/mission-driver test` 全绿 + CLI 冒烟零回归
  - Skill: none
  - 证据：引擎 seam 走了 draft 窄口 → 全套义务履行——`tools/mission-driver/test/draft-executor-seam.test.js` 4 用例（executor 分派/dispose 恰一次、gate-blocked、失败路径、无 dispose 容忍）；`mdcontrol-routes.test.mjs` 17→28 用例（draft：非阻塞 + 两段状态推进 + 词汇钉住 / 共享槽互斥 + 终态释放 / fail-fast 三态 / gate-blocked / 回执 / agents 缺失；analyze：显式目标 + seam 分派 + tag 原样解析 + 单 dispose / mtime 最新 / 三态 not-found / 失败派发空结果不崩 / agents 缺失）；引擎全套 **660/660**（656+4）+ prompt-check OK；插件链 `npm --prefix plugin/dsh test` **87/87** + manifest + tsc + bundle 新鲜度 36 文件 + smoke-import；`./verify-age.sh` exit 0（L1+L2 GREEN）；CLI 冒烟 `node src/main.js dsh-plugin --step CHECK --dry-run --no-monitor --dir <repo>` exit 0 / marker pass（零回归）；`web typecheck`/`build`/`lint:prompts` 绿（web/src 零改动 → dist 还原 HEAD 0 diff，先例）。

Exit Criteria:

- [x] draft/analyze 行为在单测域机器钉住（含异步契约与守卫语义）
- [x] 1621-2 §Deferred 收编在代码面完成（service 台账同步）
- [x] `docs/logs/` updated

### Phase 3 - Mission Control skills 注册 + 接线

Status: completed
Targets: `plugin/dsh/src/mdcontrol-skills.ts`（新模块，Phase 1 Decision 1 裁定落点）、`plugin/dsh/src/service.ts`、`plugin/dsh/test/mdcontrol-skills.test.mjs`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 2（技能调用的是已落地路由）

- [x] `Add` 三技能注册（`mission-control-run` / `mission-control-draft` / `mission-control-analyze`，design doc §Feature Name 的参数语义）——按 Phase 1 裁定的机制接线到 `mdcontrol.*` 路由；描述文案与 invocation policy 显式设定并记录
  - Skill: none
  - 落地：`plugin/dsh/src/mdcontrol-skills.ts`——`MISSION_CONTROL_SKILLS` 三行（name/description/whenToUse/content/`invocation {modelInvocable:true, userInvocable:true}` 显式设定；provider 缺省 runtime——register() 补默认）；指令体 = 自含调用文档（目标 wire method + fenced ```json 载荷示例 + `{ok,value}` 信封 + HTTP-capable 工具条件项〔curl/web_fetch〕+ 响应解读 + 轮询/回执指引：run→status/list、draft→draft-state 词汇与 blocked 语义、analyze→同步结果字段）；`registerMissionControlSkills(skills, logger)` 纯函数（composite disposer；registry 缺席 → null + warn，webServer 同姿态）。`service.ts` 接线 = `ctx.inject(['skills'], cb)` 反应式注册（Phase 1 Decision 1 裁定形态：顺序无关、服务替换自动卸载重注册、headless 无 skills = fiber 永不激活不阻塞主服务；callback 内 `skillsCtx.get('skills')` 结构面解析 + 返回 disposer 作 fiber teardown）。
- [x] `Proof` 单测：注册形状（名称/描述/invocation policy）、路由调用接线（fake 路由断言参数透传：mission 名 → `mdcontrol.run`、description → `mdcontrol.draft`、run 选择 → `mdcontrol.analyze`）、dispose 注销；service.ts 台账收口（skills 行 → 落地）
  - Skill: none
  - 证据：`test/mdcontrol-skills.test.mjs` 6 用例——注册形状（三名 + 显式 invocation + whenToUse/content 在场 + 注册后 active）；**接线钉法（双层）**：① 每技能 content 引用其 `/mdcontrol/api/<route>` + fenced JSON 示例可解析且键形正确（mission 名 → `args.mission`、描述 → `desc`、run 选择 → `runId`）；② 示例对**真实路由**通过（run/draft = 验证序证明：无 agents ctx 下示例载荷越过 payload 校验、止步于 agents wire error，守卫不留占；analyze = 全同步直通 fake agents，postmortem tag 解析 + 单次 native 分派）；契约违例示例（空 desc）→ bad-request 不路由。dispose：composite disposer 三行全注销；registry 缺席 → null + warn 不 throw。service.ts 台账 skills 行已在 Phase 2 编辑中同步收口（LANDED (M3-WI12)）。验证：`npm --prefix plugin/dsh test` **93/93**（87+6，含 manifest + tsc + bundle 新鲜度 + smoke-import）；引擎全套 **660/660**（Phase 3 零引擎 diff 复核）；`web typecheck`/`build`/`lint:prompts` 绿（web/src 零改动 → dist 还原 HEAD 0 diff，先例）。

Exit Criteria:

- [x] 三技能在会话注册面存在且入口参数正确落到对应路由（单测域）
- [x] `docs/logs/` updated

### Phase 4 - e2e 扩展 + docs/roadmap/台账回写

Status: completed
Targets: `plugin/dsh/scripts/e2e-demo.mjs`（裁定：扩展现有 `verify:e2e` 单命令入口，不新增姊妹 script——WI11 Phase 3 Decision 4 先例延续，or-态在此收口）、`plugin/dsh/test/fixtures/e2e.cordis.yml`（skills 组合行扩展经 agent-spine `skills.enabled` 实现，**devDeps 钉版条件项不触发**——见下）、`docs/testing/2026/`、owner docs、roadmap、`docs/plans/dsh-plugin/2026-08-23-1621-2-mdcontrol-run-async-contract-e2e.md`
Skill: `document-audit-prompt.md`（owner-doc 对齐项；输入/输出见 docs/skills/README.md）

- Item Types: `Proof`
- Prereqs: Phase 2 + Phase 3

- [x] `Proof` e2e 扩展（stub 域，复用 e2e 组合）：analyze 腿——对 e2e 产生的 demo run 路由直调 postmortem（stub 剧本服务 analyze 步的 return-tag 序列）；draft 腿——`mdcontrol.draft` 两段剧本（`<BRIEF_GATE>` 标签先例在 e2e-policy 可编程）；skills 注册面——fixture 扩 skill 组合行后 boot 断言 `ctx.skills.list()` 三技能在列（组合行扩展与 devDeps 钉版为前置条件项，缺一则该断言降级为显式记录的 scope limitation）；全部固化为可复跑命令（落点随裁定：扩展 `verify:e2e` 或新增姊妹 script——不接 CI）；记录 `docs/testing/2026/`
  - Skill: none
  - 落地与证据：`e2e-policy.mjs` 增 WI12 路由（真实 prompt 开场白：mission-brief "Generate a concise mission brief" / mission-draft "Generate a mission config file for the mission driver" / run-postmortem "Reliability Engineer"）+ 专用 return-tag 响应；`e2e-demo.mjs` 三腿（skills 注册面 poll 断言 `ctx.skills.list()` 三名在列；analyze 显式 runId + 最新 mtime 双腿——tag 透传 + 目标解析 + 每调用恰一次分派；draft 异步两段——立即返回 + draft-state 终态 completed/completed + briefGate/briefPath/missionName 解析〔stub 不可写文件，MISSION_FILE tag 指向预置 mission，机制面 = tag 解析 + missionsDir 扫描回退〕）；WI12 stub 序列 `WI12-ANALYZE×2 → WI12-BRIEF → WI12-DRAFT` 机器断言。**组合行/devDeps 条件项落定：均不需要**——fixture 经 agent-spine `skills: enabled: true`（其自带 SkillRegistry/SkillFileSystem/toolSkill 依赖树，base-bundle 形态），skill 包为已钉 `@deepseek-ai/dsh-agent-spine-demo` 的传递依赖、fixture 不直接命名 → exact 钉版纪律触发条件不成立（`dependencies`/`devDependencies` 零变化）；`DSH_HOME` 指向 scratch root 保证发现 hermetic。执行中两个真发现（均已修）：① skills 启用后 tool-skill 的 `<system-reminder>` catalog 消息成为 last-user-message，stub 选文失配 → `lastNonReminderUserTextOfChatBody`（倒序跳过 reminder 体）；② draft/analyze executor config 未带 model → 每回合 "has no provider/model"（M2-WI10 既有发现在新 seam 复现）→ `baseAgentConfigOf` 轻量 base.json 读取（无 env 副作用，任务内 resolveConfig 仍为权威解析）。**`verify:e2e` 三连跑全绿**（WI10/WI11 断言零回归），证据 `docs/testing/2026/08-23.md` WI12 note。
- [x] `Proof` owner docs + 台账：packaging doc §Service Surface as-built（draft/analyze 路由 + draft 执行形状裁定措辞对齐 + skills as-built）；design doc §Feature Name as-built 注记（skills 落地、入口链路）；R3 注记（如 L4 面扩展）；roadmap WI12 `todo → done`（证据摘要内联，完成前置注记随收编兑现）；1621-2 plan §Deferred 台账回写（已收编闭环）
  - Skill: `document-audit-prompt.md`（与 Phase 级声明一致）
  - 落地：packaging doc——状态标头 P3 second slice delivered（WI12）、§Execution Backend Seam 增 draft 侧 executor seam 段（本 plan 唯一引擎 diff + analyze 零 seam 理由）、§Service Surface 三段 as-built（路由行五方法 + 异步契约段增 draft/analyze 语义 + skills 段落地链路 + 守卫段 run+draft 共享槽 + "Draft jobs" 段 as-built split：CLI/monitor 路径不动 vs plugin 路由 in-host + executor seam，措辞与 Phase 1 D2 裁定对齐）、§Packaging Layout 树增 mdcontrol-skills.ts/测试行 + WI12 注记、§Phased Delivery P3 行 WI12 证据。design doc §Feature Name 技能条 as-built 注记（链路 + 真模型腿姿态）。roadmap WI12 `ready → done`（证据摘要内联）+ Last Updated（M3 剩 WI13）。1621-2 §Deferred 台账回写"已收编闭环"（实现落点 + 证据 + 闭环链）。R3（`docs/analysis/2026-08-22-0003-verification-harness-design.md`）L4 面注记：**裁定不加**——本 plan 未改 L4 门禁形态（同一 `verify:e2e` 单命令、stub-only 姿态不变，仅扩腿），R3 §2 L4 行的 owner 面无语义变化，加注反而双记账；如后续 skills 断言面成为独立 L4 关切再补。document-audit 对照：目标 owner docs（packaging §Service Surface/§Execution Backend Seam、design §Feature Name、roadmap、1621-2 台账）与落地状态逐段核对一致，未发现 as-built 漂移（审计发现 = 0 blocking；R3 不加注即本项显式裁定记录）。
- [x] `Proof` `docs/logs/` 聚合收口条目（含 verification scope 声明）
  - Skill: none
  - 落地：`docs/logs/2026/08-23.md` Phase 4 聚合条目（含 verification scope limited 声明：e2e 为 stub 域显式本地门禁〔真模型自然语言技能调用 = env 人工腿〕；monitor 渲染为 REST 数据断言；单测域 fake-agents；引擎全套 + CLI 冒烟覆盖 seam 零回归）。

Exit Criteria:

- [x] e2e 可行域断言全绿且固化
- [x] owner docs / roadmap / 1621-2 台账与落地状态一致
- [x] `docs/logs/` updated

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd1b92812ffeylGJf5DG7MvuAC`，2026-08-23）——B1：draft 执行形状 Decision 基于假类比（`cmdDraftMission` 无 executor 注入，`__runnerFactory` 默认 process spawn、唯一覆盖位是 test seam——"镜像 beginNativeMission" 不成立；三维裁定空间缺失；native draft 派发隐含的引擎 seam 未被红线预授权或显式重议）。修订：Baseline 增 draft seam 缺口条目、Decision 2 重写为三维空间（执行位置 × 派发后端 × seam 需求）+ Explore 义务、红线段扩权为 analyze + draft 两处窄口预授权。B2：skills e2e 断言的基线错误（e2e fixture 无 skill 组合行且 `skills: enabled: false`；host base bundle 需 skill 行；devDeps 未含）——修订：Baseline 记缺口、Infra prereqs 增条件性 devDeps 增钉、Phase 4 Targets 增 fixture 扩行 + 降级路径。非阻塞 3 项全采纳：N1 Phase 2 Item Types 增 `Decision`；N2 Proof 命令具名 + or-态收紧；N3 analyze 选项 (a) 生命周期归属（适配层自持 create/close 防 double-close）。fact-check 其余全过（引擎导出/NOT-bundled/skills 注册面/deps 钉版/1621-2 后继链/单一结果面裁定 defensible）。
- Independent draft review iteration 2: `needs revision`（独立 fresh session `ses_fd1b3d269ffefWWjX8V9tnIMIf`，2026-08-23）——B1（传播不全）：两处窄口预授权只落在红线段，Non-Goals 仍写"analyze 入口（+单测）"、Closure Gates 仍只条件于"seam (b)"、Baseline 残留修订前措辞"当前红线只预授权 analyze 入口"——引擎 diff 边界是本 plan 最安全攸关的约束，三处必须一致。修订：Non-Goals 改两处预授权窄口、Closure Gates 改"若走任一预授权引擎 seam（analyze 选项 b 或 draft native seam）"、Baseline 措辞直陈扩权。非阻塞 3 项采纳：N1 先例路径补 `packages/` 段（两处）；N2 Phase 4 Skill 行自相矛盾修正——`document-audit-prompt.md` 是 `docs/skills/README.md:43` 在列技能，Phase 4 改记 `Skill: document-audit-prompt.md` 且 Task Route 基础同步（实现阶段 none / 文档对齐阶段具名）；N3 seam 引用区间 :36-47。iteration 1 的 B1 判"substance resolved, propagation incomplete"（本轮补齐）、B2/N1–N3 全部 resolved。
- Independent draft review iteration 3: `acceptable as-is`（独立 fresh session `ses_fd1af9ac9ffeaQpSOnGmsiMcvP`，2026-08-23）——iteration 2 B1/N1–N3 复核全部 resolved（两处窄口预授权在 Baseline/红线/Non-Goals/Closure Gates/Phase 2 Proof 五处一致；路径含 `packages/` 段；Skill 行修正经 README:43 核实；seam 区间 :36-47 live 核实）；无 unowned decision、无 anti-slacking 违例、无 phase/exit 错配、无 owner-doc 矛盾。非阻塞 2 项采纳收紧：N1 Phase 4 owner-docs 条目级 Skill 行与 Phase 级声明对齐（`document-audit-prompt.md`）；N2 Phase 1 Decision 2 seam 区间统一 :36-47。共识达成，Plan Status → active。

## Closure Gates

- [x] in-scope behavior is complete
- [x] relevant docs are aligned
- [x] verification has run（单测域插件链 + verify-age.sh 零回归〔+引擎全套与 CLI 冒烟，若走任一预授权引擎 seam——analyze 选项 b 或 draft native seam〕；e2e 扩展腿；命令在各 Proof 项固化）
- [x] scoped verification is not conflated with full verification——skills 的真模型自然语言调用不入确定性门禁（env 人工腿或显式缺失，如实标注）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### 真模型自然语言技能调用验证（env 人工腿未跑，按 plan 预告立案）

- Classification: `watch-only residual`
- Why Not Blocking Closure: 技能执行机制的确定性面已机器钉住（注册形状/接线/内容契约单测 6 用例 + e2e `ctx.skills.list()` 注册面断言）；"模型在真会话中经 catalog 命中技能并正确构造路由调用"属模型行为质量，按 plan Non-Goal + R3 §5 姿态不入确定性门禁（与 verify:native 同为 env 人工腿）。
- Successor Required: `no`（watch-only）
- Reopen trigger: 真实凭据腿可用时（`verify:native` 同域）；或真宿主使用中暴露技能命中/调用质量问题。

（draft 时点无新增；本条为 plan 预告的条件立案兑现。）

## Closure

Status Note: closed 2026-08-23. All four phases executed and verified; 1621-2 §Deferred draft/analyze adjudication collected end-to-end (routes + service ledger + successor-plan writeback); roadmap WI12 done. The pre-authorized draft-side engine seam landed exactly as scoped (`orchestrator.js` + its unit tests — the plan's ONLY engine diff; CLI path byte-identical, backed by the 660-case engine suite + CLI smoke); the analyze side landed with ZERO engine diff (option (a)). Verification scope limited (as adjudicated): e2e is the stub-domain explicit local `verify:e2e` gate (never CI merge-blocking; mechanism-plane assertions — the stub cannot write files, so the draft leg gates tag-parse + missionsDir-scan fallback); true-model natural-language skill invocation is an env/manual leg filed as the §Deferred watch-only residual; single-test domains use fake HostContext/agents. Skills e2e composition achieved with ZERO new devDeps (agent-spine transitive dependency tree — the exact-pin discipline trigger did not fire, recorded in Phase 4).

Closure Audit Evidence:

- Auditor / Agent: independent fresh-session subagent (cold replay, session `ses_fd14e4d27ffexa7lUTHwxo7Skl`, 2026-08-23)
- Evidence: **CLOSURE AUDIT: PASS** — all 8 gates PASS with per-gate evidence (routes/seam file:line walkthrough incl. bundle-copy identity diff; docs alignment across packaging/design/roadmap/1621-2; independently re-run engine 660/660 + plugin 93/93 chain + `verify:e2e` SUMMARY PASS; red lines all clean — engine diff scoped to orchestrator.js + seam test, package.json zero diff, zero `@deepseek-ai` in engine src, verify-age.sh/age-ci.yml zero diff, web/dist clean; text consistency empty-inconsistency grep). Non-blocking observations: stale draft-stage Closure wording (fixed by this closure edit); verify-age.sh not re-run inside the audit session but both L1/L2 components independently reproduced green (aggregate re-run recorded in the log).

Follow-up:

- 真模型自然语言技能调用验证（§Deferred But Adjudicated，watch-only residual；reopen = 真实凭据腿可用时）。
- 无 confirmed defects。
