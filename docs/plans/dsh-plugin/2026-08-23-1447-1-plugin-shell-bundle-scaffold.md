# 2026-08-23-1447-1 plugin/dsh 脚手架：bundle manifest + isolate realm 挂载 + 引擎纯模块打包（dsh-plugin M2-WI6）

> Plan Status: completed
> Mission: dsh-plugin
> Work Item: M2-WI6
> Last Reviewed: 2026-08-23（draft review 1 轮共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M2-WI6
> Related: `docs/architecture/dsh-plugin-packaging.md` §Packaging Layout／§Dependency and Version Risk／§Phased Delivery P2；`docs/analysis/2026-08-22-0002-npm-version-surface.md`（R2 钉版基线）；前置 M1 全部 plan（`2026-08-23-1300-1/-2/-3`，已 completed）；后继 `2026-08-23-1447-2`（NativeExecutor）、`2026-08-23-1447-3`（L2 矩阵）
> Audit: required

## Current Baseline

**`plugin/` 目录不存在；M1 seam 全部就绪；宿主侧依赖面与 manifest 形状已核实但未落地：**

- M1 已交付（roadmap M1 五个 WI 全 `done`）：StepExecutor seam（`tools/mission-driver/src/step-executor.js`，三方法 JSDoc 契约 + `ProcessExecutor` 纯转发）；程序化编排入口 `src/orchestrator.js`（`bootstrap` / `orchestrateRun({ config, executor })` / `orchestrateAnalyze`——`executor` 为注入参数，`orchestrator.js:554`）；`src/exit-map.js`；driver 白名单 `SUPPORTED_DRIVERS = ["opencode","pi","cline","native"]`（`config.js:44`，`native` 仅内部选项 `allowNativeDriver: true` 放行，`config.js:46-51`）；embed 门控（`engine.js:1610` `cfg.embed !== true` 时才执行 startup 诊断）。
- 本仓库当前无 `plugin/` 顶层目录（live 核实：`ls plugin` → 不存在）。roadmap WI6 要求的三件套——`DshBundleManifest` 清单（package.json `dsh.bundle.patch` 字段）+ `cordis.patch.yml`（isolate realm 挂载）+ 构建打包——全部缺失。
- Bundle manifest 形状已核实（R1 §5）：`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`（`DshBundleManifest { patch: string }`，`packages/boot/app-boot/src/profile.ts:5-16,38-45`）；组合顺序 = 各 bundle patch 行 → profile 自有 patch → launcher 层；两锚点解析（dsh 安装 → profile 目录）。插件侧仅需提供 manifest + patch 文件，挂载由宿主 boot 完成。
- 打包 import 图已核实并被 packaging doc §Packaging Layout 拥有：捆绑 `engine.js`→`expression/platform/sys-snapshot/reap-orphans(→run-reconcile)/active-run-registry/roadmap-check`、`config.js`（→`mission-check.mjs`）、`runner.js`（→`executor.js/platform`）、编排入口路径（`orchestrator.js` 及其依赖：`flow-loader.js`→`plan-check.mjs`、`env-loader.js`、`postmortem.mjs`、`exit-map.js`、`step-executor.js`）。**NOT bundled**：`monitor.js`、`draft-job.mjs` + `spawner.mjs`、CLI commander wiring（`main.js`）。路径解析用 `import.meta.url` 相对 bundle 位置（config.js 解析 pi persona `agentFile` 已用同法）。
- 依赖钉版基线（R2，2026-08-22）：四包 `@deepseek-ai/dsh-agent|dsh-goal|dsh-tools|dsh-subagent` next cohort `0.1.1-rc.2` + `@deepseek-ai/cordis` `4.0.1`；exact pin、无 range、一次 bump 一个 changelog 事件。R2 明示 **"Re-run this survey at P2 start"**（preview 阶段漂移预期）——本 plan Phase 1 执行。
- 不变式：引擎核心 `tools/mission-driver/src/` 零 npm 依赖、禁止任何 `@deepseek-ai/*` import（packaging doc §Scope and Boundary Impact）；`@deepseek-ai/*` 依赖只允许出现在插件层 `plugin/dsh/package.json`。
- 遗留 deferred 裁定（M1 plan 3）：「插件层 active-run guard（plugin-owned 单 run 守卫 + 宿主侧注册）」归属 "M2-WI6/WI10"。packaging doc §Service Surface 明确该 guard 由 `mdcontrol.*` 路由拥有（"One mission run at a time per project root — a NEW plugin-level guard owned by the `mdcontrol.*` routes"）——路由属 WI10，故本 plan 不实现 guard，见 Non-Goals 与 Deferred 再裁定。

## Goals

- `plugin/dsh/` 脚手架按 packaging doc §Packaging Layout 落地：`package.json`（dsh bundle manifest 字段 + exact-pin 依赖）、`cordis.patch.yml`（isolate realm 挂载 Mission Control service）、`src/service.ts`（最小可挂载骨架——证明 patch 挂载链路；`mdcontrol.*` 路由与非骨架内容归 WI10）、`src/native-executor.ts` / `src/engine-bridge.ts`（文件骨架 + 接口占位，实现归 WI7）、`assets/`（构建期产物目录）。
- 构建打包：一个 Node 构建脚本把 packaging doc §Packaging Layout 列出的引擎纯模块闭包复制进 plugin bundle，并复制 `flows/`、`prompts/`、`agents/` 资产到 `assets/`；脚本内置 import 图闭包断言（复制集的 import 传递闭包 ⊆ 允许集，且不含 monitor/draft-job/spawner/main），防未来引擎演进悄悄引入禁止模块。
- 版本钉版：Phase 1 重跑 R2 npm 调查（五包 dist-tags 复查）并把结论固化为 exact pins 写入 `plugin/dsh/package.json`；调查结果记入 `docs/analysis/` 增补或本 plan 记录。
- 构建产物可在无宿主机上独立 import 冒烟（bundle 入口 `node --input-type=module -e "import(...)"` 级别），真实宿主挂载冒烟归 WI9（L3）。

## Non-Goals

- 不实现 NativeExecutor 原生派发（M2-WI7，`src/native-executor.ts` 仅骨架）。
- 不实现 `mdcontrol.*` 路由、异步作业契约、skills 注册（M2-WI10、M3-WI12）。
- 不实现插件层 active-run guard / 单 run 守卫 / 宿主侧 active-run 注册——guard 属 `mdcontrol.*` 路由层（WI10），本 plan 的 service 骨架不注册任何 run 状态（Deferred 再裁定见下）。
- 不做 L2 双后端矩阵测试（M2-WI8）、L3 harness（M2-WI9）、L4 live smoke。
- 不做 subagent 描述符注册（M3-WI11）、AGE preset（M4-WI14）、状态面板（M4-WI15）。
- 不改 `tools/mission-driver/src/` 任何引擎行为（本 plan 对引擎目录预期零 diff；若打包暴露路径解析缺陷，以最小修 + 独立说明处理并记入 plan 记录——且任何此类修改受 AI Block Condition 约束：`engine.js` 状态机核心 `_result`/`_wfClose`/`_executeSubflowStep` 路径即触发 human stop，不允许以"打包需要"名义顺手修改）。
- 不将 `@deepseek-ai/*` 引入引擎核心（AI Block Condition 红线）。

## Task Route

- Type: `implementation-only change`（新增顶层目录与构建脚本，不改既有契约；import 图闭包断言是边界硬化**效果**，不构成第二任务路由）
- Owner Docs: `docs/architecture/dsh-plugin-packaging.md` §Packaging Layout／§Dependency and Version Risk／§Update Rule；`docs/design/dsh-plugin-integration.md` §Dual-Form Product
- Skill Selection Basis: `Skill: none`——净新增脚手架与构建脚本，无匹配的可复用方法（非重构、非审计、非 bug 修复）；Phase 3 文档核对用 `document-audit-prompt.md` 方法（required inputs：packaging doc + 实际落地 diff；expected output：findings，落在 plan 记录内）

## Infrastructure And Config Prereqs

- Phase 1 需要 npm registry 网络访问（`npm view` 五包 dist-tags、必要时 `npm pack` 复核 typings）——仅调查与 dev 期安装，不进 CI。
- CI/引擎测试不依赖 `plugin/dsh/node_modules` 存在（引擎测试链 `pnpm --prefix tools/mission-driver test` 不触插件目录）。
- 真实 DSH 宿主（Creator-mode 在线环、`dsh plugin add`）**非本 plan 交付门禁**——归 L3（R3 §5：本地脚本门禁、不阻塞 CI）。开发期宿主操作按 `docs/process/dsh-plugin-development-guide.md`。
- 无 secrets / env 前置；无数据迁移。

## Execution Plan

### Phase 1 - 依赖面决策 + manifest/patch 落地

Status: completed
Targets: `plugin/dsh/package.json`、`plugin/dsh/cordis.patch.yml`、`docs/analysis/`（调查记录）
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 无（M1 已并入 main）

- [x] `Decision` 重跑 R2 版本调查并钉版：`npm view @deepseek-ai/{cordis,dsh-agent,dsh-goal,dsh-tools,dsh-subagent}` dist-tags，对照 R2 表（next cohort `0.1.1-rc.2` / cordis `4.0.1`）。宿主 cohort 未漂移 → 按 R2 原建议 exact pin；已漂移 → 对 R1 五个调用点（create/resume/followup/status/dispose + descriptor）做 typing 复核后再定，结论与理由写入 `docs/analysis/2026-08-23-0001-p2-version-survey.md`（或并入 R2 增补节）。备选：直接照抄 R2 结论不复查——被否决，R2 明示 preview 漂移预期且复查成本一次性。残险：goal/tools 两包本期实际未消费（P3+ 才用），先钉不装（列 dependencies 但接受未使用警告）或后置加入——按"单 cohort 一致性"原则先行钉入。
  - Skill: none
- [x] `Add` `plugin/dsh/package.json`：`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` manifest 字段（R1 §5 核实形状，字段名/层级必须逐字匹配）；`dependencies` 按 Phase 1 决策 exact-pin；`devDependencies`（TypeScript 等）最小集；`scripts.build` 指向 Phase 2 构建脚本。
  - Skill: none
- [x] `Add` `plugin/dsh/cordis.patch.yml`：把 Mission Control service 挂载进 isolate realm（mount 形状参照 packaging doc 引用的 preset 先例 `dsh-anchored-standard/preset/agent.cordis.yml` 与 `docs/process/dsh-plugin-development-guide.md`；本 plan 只需挂载骨架成立，service 本体是 Phase 3 骨架）。
  - Skill: none
- [x] `Proof` manifest/patch 结构校验：`plugin/dsh/scripts/check-manifest.mjs`——`node -e` 解析 package.json 断言 `dsh.bundle.patch` 字段逐字匹配 R1 形状 + patch 文件存在；YAML 校验用 dev-dep `yaml` 解析器（插件层允许 devDeps，引擎零依赖不变式不受影响）解析 `cordis.patch.yml` 并断言挂载键结构。真实挂载冒烟归 WI9（L3），本 Proof 是结构级。命令与输出记录进日志。
  - Skill: none

Exit Criteria:

- [x] `plugin/dsh/package.json` 存在且 manifest 字段/钉版依赖与 Phase 1 决策一致；`cordis.patch.yml` 存在且结构校验通过
- [x] 版本调查结论与理由有文件落点（analysis 增补或新文件），含"与 R2 表的 diff（应为空或有据漂移）"
- [x] `docs/logs/` updated（或并随本 plan 其余 Phase 聚合一条，见执行规则 9）

### Phase 2 - 构建打包脚本 + import 图闭包断言

Status: completed
Targets: `plugin/dsh/scripts/`（构建脚本）、`plugin/dsh/assets/`（产物，gitignore 或提交按仓库惯例决策）、引擎目录（预期零 diff）
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: Phase 1（package.json scripts 就位）

- [x] `Decision` 打包机制：Node 构建脚本（纯 Node，复制式）把 packaging doc §Packaging Layout 允许集从 `tools/mission-driver/src/` 复制到 bundle 内，保持相对 import 结构不变（`import.meta.url` 相对解析随之自然成立）；资产 `flows/` `prompts/` `agents/` 复制到 `assets/`。备选：esbuild/rollup 单文件捆绑——被否决，引擎零依赖且模块数小，复制保源码可审计、路径解析语义与引擎现状一致；备选：symlink——被否决，DSH profile 安装形态下 symlink 不可移植。**产物入 git：定稿提交**（沿用 `web/dist` "clone 即跑 + freshness 检查" 先例；`assets/` 命名不落 `.gitignore` 的 `dist/` 规则，无需 gitignore 改动；新鲜度由重跑构建 → diff 为空的检查脚本钉住，CI 接线在 Phase 3）。
  - Skill: none
- [x] `Add` 构建脚本：输入 = 允许模块清单（源自 packaging doc，脚本内显式列出）+ 引擎源目录；输出 = bundle 模块集 + `assets/`；执行闭包断言——从入口（orchestrator.js / config.js / engine.js / runner.js / step-executor.js）出发的 import 传递闭包 ⊆ 允许集，命中 `monitor.js|draft-job.mjs|spawner.mjs|main.js` 或任何 npm 包名即 fail（node builtins 白名单除外）。断言把 packaging doc 的 NOT-bundled 规则变成机器门禁。
  - Skill: none
- [x] `Proof` 构建冒烟（无宿主）：(a) 脚本全绿跑通，产物清单与允许集一致；(b) bundle 入口（orchestrate 入口模块）从 `plugin/dsh/` 位置 `import` 成功（`node --input-type=module -e`），零 npm 解析；(c) 若产物入 git：CI/本地 freshness 检查（重跑构建 → diff 为空）。真实宿主挂载不在本 Proof 范围（WI9）。
  - Skill: none

Exit Criteria:

- [x] 构建脚本可重复执行、闭包断言对当前引擎全绿；人为移除一个允许模块或引入禁止模块时断言能红（负例自证，一次性手动验证记录进日志）
- [x] bundle 无宿主 import 冒烟通过；引擎目录 `git diff` 为空（或最小修有独立记录与理由）
- [x] `docs/logs/` updated

### Phase 3 - service/桥接骨架 + 文档收口 + roadmap 回写

Status: completed
Targets: `plugin/dsh/src/service.ts`、`plugin/dsh/src/native-executor.ts`、`plugin/dsh/src/engine-bridge.ts`、`docs/architecture/dsh-plugin-packaging.md`、`docs/backlog/dsh-plugin-roadmap.md`
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Add | Proof`
- Prereqs: Phase 1、Phase 2

- [x] `Add` `src/service.ts` 最小骨架：cordis service 定义 + 挂载即一条结构化日志/空路由占位（证明 patch → service 挂载链路的类型与形状成立；不注册 `mdcontrol.*`、不触 active-run guard——WI10 范围）。`src/native-executor.ts` / `src/engine-bridge.ts`：接口占位（引用 step-executor.js JSDoc 契约三方法签名注释），实现留 WI7。TypeScript 编译配置就位（`tsc --noEmit` 过）。
  - Skill: none
- [x] `Proof` 插件层静态门禁：`tsc --noEmit`（或等价 typecheck）通过；**本 plan 建立 `plugin/dsh` 本地测试入口**（`plugin/dsh/package.json` `scripts.test`，`node --test` 或 tsc+node 组合按实现定）——后续 plan（1447-2 单测、1447-3 矩阵）沿用该入口；引擎全量 `pnpm --prefix tools/mission-driver test` 零回归（本 plan 全程未改引擎，应为纯基线复跑）。
  - Skill: none
- [x] `Proof` 文档收口：packaging doc §Packaging Layout 由蓝图更新为已落地事实（目录树、构建脚本、产物策略、钉版结论）；§Phased Delivery P2 行标注部分交付边界（WI6 done、WI7/WI8/WI9/WI10 未动）；roadmap WI6 `todo → done` 回写；本 plan Deferred 段完成对 active-run guard 的再裁定记录。verification scope 显式注明：无真实宿主，结构级 + 无宿主 import 冒烟域。
  - Skill: none

Exit Criteria:

- [x] 三个 src 文件骨架落地且 typecheck 绿；service 骨架不含路由/guard 实现（范围纪律）
- [x] packaging doc / roadmap 与落地一致；deferred 再裁定有记录
- [x] `docs/logs/` updated（本 plan 聚合一条，含 verification scope limited 声明）

## Draft Review Record

- Independent draft review iteration 1: `acceptable as-is`（独立 fresh session `ses_fd29cd41fffeTWTxifJVg3irYH`，2026-08-23）——七个判定维度全过（guide 合规 / 基线逐条 live 抽核含 import 图逐边验证 / WI6 范围贴合 / 可执行性 / 受保护区 / 依赖链 / 风险面），无阻塞项。5 项非阻塞建议全部采纳：①Phase 2 产物入 git 决策预先定稿（提交 + freshness 检查，`assets/` 命名不受 `.gitignore` `dist/` 规则影响）；②Phase 1 YAML 校验机制定稿（dev-dep `yaml` 解析器，不悬置）；③两处"（或 test）／（若有）"选择模糊定稿（`scripts/check-manifest.mjs` + `plugin/dsh` 测试入口本 plan 建立，后继 plan 沿用）；④Task Route 收敛为单一 `implementation-only change`（闭包断言为效果非路由）；⑤引擎逃生口补 AI Block Condition 注记（状态机核心路径即 human stop）。

## Closure Gates

- [x] in-scope behavior is complete
- [x] relevant docs are aligned（packaging doc §Packaging Layout 状态转事实、roadmap WI6 回写）
- [x] verification has run（`pnpm --prefix tools/mission-driver test` 全量零回归；构建脚本 + 闭包断言 + 无宿主 import 冒烟；typecheck；命令在 Phase Proof 项固化）
- [x] scoped verification is not conflated with full verification——本 plan 无真实宿主挂载验证，"verification scope limited: 无宿主（L3 归 WI9）"已显式标注
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### 插件层 active-run guard（自 M1 plan 3 移交，再裁定）

- Classification: `out-of-scope improvement`（归属 M2-WI10）
- Why Not Blocking Closure: guard 由 `mdcontrol.*` 路由拥有（packaging doc §Service Surface），路由在 WI10 才落地；WI6 的 service 骨架无路由无 run 启动，无 guard 可挂。M1 plan 3 原归属 "M2-WI6/WI10" 中的 WI6 半边经本裁定收窄为 WI10 单一归属。
- Successor Required: `yes`（M2-WI10 plan 必须实现：单 run 守卫 + 宿主侧注册，并引用本裁定）
- Reopen trigger: M2-WI10 plan 启动时。

### `dsh` headless CLI driver 值与降级梯（自 M1 plan 2/3 移交，watch-only）

- Classification: `watch-only residual`（post-M2 候选）
- Why Not Blocking Closure: packaging doc §Native Dispatch 末段明示 post-M2 候选；native 耦合不稳才触发降级梯评估。
- Successor Required: `no`
- Reopen trigger: M2 收口后评估 `dsh` one-shot CLI driver 时，或 native 耦合证明不稳时。

## Closure

Status Note: completed（2026-08-23）

Closure Audit Evidence:

- Auditor / Agent: independent subagent（general agent session `ses_fd2823749ffeiij14q44aXiSOk`，2026-08-23）——VERDICT: **accept**，六维度全 PASS（checklist integrity / deliverables exist / scope discipline / verification reproduces / docs aligned / text consistency），独立复跑了 `plugin/dsh npm test` 全链、`build-bundle.mjs --check`、引擎全量 653/653（首跑 652/653 唯一失败为文档化预存 flaky `monitor.test.js` draft-listing，复跑绿）、`lint:prompts`。
- Evidence: 本 plan 全 item `[x]`；`plugin/dsh/` 落地树（manifest/patch/scripts/test/src/assets 36 文件）；`docs/analysis/2026-08-23-0001-p2-version-survey.md`；packaging doc P2 PARTIALLY DELIVERED + §Packaging Layout as-built；roadmap WI6 `done`；`docs/logs/2026/08-23.md` M2-WI6 聚合条目（含 verification scope limited 声明与负例自证四例记录）。
- Auditor non-blocking notes: 产物待 commit（closure-then-commit 流程）；闭包断言负例为一次性手动证明（后续可硬化为机器负例测试）；monitor draft-listing flaky 已跨 4 条日志复现——再复现即按 AGENTS.md 规则 15 评估升格为可执行修复。

Follow-up:

- (none at draft time；auditor notes 已记录，无阻塞项)
