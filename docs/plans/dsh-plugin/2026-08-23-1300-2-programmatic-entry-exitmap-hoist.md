# 2026-08-23-1300-2 程序化编排入口 + EXIT_MAP 提升（dsh-plugin M1-WI2）

> Plan Status: completed
> Mission: dsh-plugin
> Work Item: M1-WI2
> Last Reviewed: 2026-08-23（draft review 4 轮，iteration 4 共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M1-WI2
> Related: `docs/architecture/dsh-plugin-packaging.md` §Packaging Layout（提取范围 owner）／§Phased Delivery P1；前置 `2026-08-23-1300-1`（WI1 seam）；后续 `2026-08-23-1300-3`
> Audit: required

## Current Baseline

**`main.js`（968 行）混合 CLI 壳与编排逻辑；EXIT_MAP 位于 CLI 入口模块：**

- `EXIT_MAP` 定义于 `main.js:46-52`，由 `cmdRunMission` 在 `main.js:777` 消费；`test/exit-map.test.js:37` `import { EXIT_MAP } from "../src/main.js"` 行级钉住（对照 `EXECUTION-PRINCIPLE.md §11`）。
- `cmdRunMission`（`main.js:554-792`）混合四类职责：(a) process 级——`reconcileStaleRuns`（:598）、SIGTERM/SIGINT 处理器（:610-628）、monitor 启停（:646-666/:789）、`unregisterActiveRun`（:786-788）；(b) 编排级——flow 创建（:669-679）、delegates.vars 组装含 memory index 读取（:683-719）、executor 接线（:720-722，WI1 后为 executor 单键）、`resetMockState()`（:759，来自 runner.js）、singleStep/entryOverride 处理（:727-757）、`engine.run` + EXIT_MAP 映射（:760-778）；(c) CLI 参数归一（:567-590）；(d) 人读输出（:630-644/:764-775）。
- **main.js 消费方全集（grep 核实）**：五个测试文件 import `../src/main.js`——`exit-map.test.js:37`（EXIT_MAP）、`draft-brief.test.js:6`、`brief-gate.test.js:7-11`、`draft-desc-validate.test.js:6-10`、`draft-path-consistency.test.js:7-11`（后四者消费 `cmdDraftMission` / `extractBriefGate` / `parseDraftArtifact` / `validateDraftDesc` 与 `__setRunnerFactoryForTest` 缝）。缝是模块级可变状态（`let __runnerFactory`，`main.js:29`，消费于 :313）——兼容层必须是同模块实例的 re-export，不能是捕获另一实例的包装函数。
- **VAR_PROVENANCE 漂移门读取 main.js 源文本**：`src/context-map.mjs:115-150` `extractVarsKeysFromMainJs` brace-scan main.js 字面 `vars: {` 块，`test/context-map.test.js:35-40` 断言提取键数 ≥20（`checkCmd` 等变量的漂移门，见 CONTEXT.md）。vars 组装（:683-719）迁出后该提取器扫 main.js 将得空集 → 测试硬失败。提取器与测试必须随迁指向编排模块。
- draft 管线：`cmdDraftMission` / `extractBriefGate` / `parseDraftArtifact` 在 main.js 且已 export（`mission-driver-baseline.md:101` §Public Exports 记录）；draft 主干调用 `validateDraftDesc`（`main.js:344`），其定义在 `draft-job.mjs`（该文件 import `spawner.mjs`，:27——两者均在打包排除集，见 Phase 2 Decision 的迁移裁决）；四个 draft 系测试按 `cmdDraftMission("goal", { dir, ... })` 原签名调用（`draft-brief.test.js:6,41+`、`brief-gate.test.js:7-11`、`draft-desc-validate.test.js:6-10`、`draft-path-consistency.test.js:7-11`），且 `cmdDraftMission` 今日自解析 config（`resolveConfig` + `__runnerFactory(resolved)`，`main.js:312-313`）——入口签名裁决见接口契约块；CLI-parity bootstrap `loadDotenv(projectRoot)` 先于 `resolveConfig`（`main.js:565`）；secret-resolver.js 在 src 内零 import（唯一源码引用 `env-loader.js:7` 注释；`test/secret-resolver.test.js:7` 单测引用除外）——"env-loader → secret-resolver" 链 dormant。
- analyze：`runPostmortem`（`postmortem.mjs`，导入 config/expression）；analyze 主干自建并关闭 runner（`main.js:539-549`）。
- packaging doc §Packaging Layout 规定 P1 提取后的编排模块 owns：flow loading（flow-loader → plan-check）、env-loader → secret-resolver bootstrap、draft 管线、Reflexion 分析、hoisted EXIT_MAP；**NOT bundled**：monitor.js、draft-job.mjs + spawner.mjs（CLI/monitor-only）、CLI commander wiring。
- gap：无程序化入口——M2 插件层 `engine-bridge` 无法不起 CLI 进程地 run/draft/analyze；EXIT_MAP 在 CLI 入口内，打包引擎纯模块时会把 vendor/commander、monitor、draft-job 全部拖进 import 图（R1 已核实该导入图）。

## Goals

- 抽出程序化编排入口模块（run/draft/analyze 三入口共享）；`main.js` 变薄 CLI 壳（commander 解析 + 调用入口 + process 生命周期）。
- EXIT_MAP 提升至引擎核心模块；`test/exit-map.test.js` 改 import 新家并继续行级钉住。
- CLI 行为不变：flags、help、stdout、退出码、信号处理语义全部保持。
- 编排模块 import 图 == packaging doc 允许集（node builtins + 引擎纯模块；无 vendor/commander、无 monitor.js、无 draft-job/spawner）——M2 打包边界的直接前置。

## Non-Goals

- 不实现 plugin/dsh 的 `engine-bridge.ts`（M2-WI6）。
- 不改 draft 两阶段管线语义 / `<BRIEF_GATE>` 契约 / draft-job detached 模式（packaging doc 明示保留 detached）。
- 不改 CLI surface 与 `EXECUTION-PRINCIPLE.md §11` 退出码表内容（只搬家，不改值）。
- 不动 monitor 启动逻辑本身（只从编排模块中排除）。

## Task Route

- Type: `architecture change`（引擎公共边界：程序化入口导出 + EXIT_MAP 归属变更）
- Owner Docs: `docs/architecture/dsh-plugin-packaging.md` §Packaging Layout、`docs/architecture/mission-driver-baseline.md` §Public Exports / §Exit code contract、`tools/mission-driver/EXECUTION-PRINCIPLE.md §11`
- Skill Selection Basis: 行为保持的结构提取 → Phase 1/2 用 `code-refactor-prompt.md`（invariants = CLI 行为不变 + import 图白名单；verification = 全量测试 + 冒烟 diff + import 图检查）；Phase 3 文档同步 `Skill: none`

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline。

## Execution Plan

### Phase 1 - EXIT_MAP 提升（小步先行，独立可验证）

Status: completed
Targets: `tools/mission-driver/src/`（新核心模块或编排模块；`main.js`）、`tools/mission-driver/test/exit-map.test.js`
Skill: code-refactor-prompt.md

- Item Types: `Decision | Add | Proof`
- Prereqs: 前置 plan `2026-08-23-1300-1` 已 active/completed（本 plan 不依赖 seam 也可先行，但同仓两改并进时以 WI1 先落地避免 main.js 接线冲突）

- [x] `Decision` EXIT_MAP 新家：独立小模块 `src/exit-map.js`（备选：并入 Phase 2 编排模块——被否决，编排模块体量大，测试与 monitor 侧未来消费只想拖退出码表这一个纯数据；独立模块零依赖、可被任何层 import）。值逐行不变（`completed: 0 ... ping_pong: 2`，与 `EXECUTION-PRINCIPLE.md §11` 继续逐行对齐）。
  - Skill: none
- [x] `Add` `main.js` 顶部改 import 并 re-export `EXIT_MAP`（兼容 re-export，Decision 见 Phase 3 第 1 项裁决测试改引路径）。
  - Skill: none
- [x] `Proof` `test/exit-map.test.js` import 改为 `../src/exit-map.js`，全部用例不改断言继续绿（行级钉住持续有效）。
  - Skill: none

Exit Criteria:

- [x] `node --test test/exit-map.test.js` 从新家 import 全绿，断言零修改
- [x] `grep -n "EXIT_MAP" src/main.js` 仅剩 import/re-export 与 `cmdRunMission` 消费点，无重复定义
- [x] No owner-doc update required for Phase 1（EXIT_MAP 兼容 re-export 维持 `baseline.md:101` 既有记录有效；正式文档更新与日志由 Phase 3 聚合覆盖）

### Phase 2 - 编排模块提取（run / draft / analyze）

Status: completed
Targets: `tools/mission-driver/src/orchestrator.js`（新增，命名见 Decision）、`tools/mission-driver/src/main.js`
Skill: code-refactor-prompt.md

- Item Types: `Decision | Add | Proof`
- Prereqs: Phase 1；前置 plan `2026-08-23-1300-1`（`orchestrateRun({ config, executor })` 预设 WI1 的 executor 单键 seam；两 plan 均改 main.js 接线区，WI1 先落避免冲突）

**模块间接口契约（plan-guide Rule 6 强制项）：**

```
src/orchestrator.js 导出（程序化入口，供 CLI 壳与 M2 engine-bridge 共用；完备导出面）：
  bootstrap({ projectRoot, args }) → config
      拥有：loadDotenv 前置 + resolveConfig 调用。CLI-parity 链按现实定界：
      packaging doc :43 的 "env-loader → secret-resolver before resolveConfig" 今日
      dormant —— secret-resolver.js 在 src 内零 import（唯一源码引用是 env-loader.js:7
      注释；test/secret-resolver.test.js:7 的单测引用除外），实际链路只有 loadDotenv
      先于 resolveConfig；secret-resolver 不进允许集、不在本 plan 接线
      （owner doc 措辞由 plan 3 Phase 3 WI5 pass 按现实修正）
  orchestrateRun({ config, executor }) → { status, stepCount, elapsed, marker?, history, exitCode }
      拥有：flow 创建、delegates.vars 组装（含 memory index 读取）、
      resetMockState、singleStep/entryOverride 处理、FlowEngine 驱动、EXIT_MAP 映射
  cmdDraftMission(desc, opts) —— 原名原签名原语义整体迁入（iteration 3 B1 裁决）：
      内部 bootstrap 自解析 config + __runnerFactory(config) 构造 runner，两阶段
      brief→draft 主干逐行不动。CLI 与程序化（M2 engine-bridge）共用这一个入口；
      packaging doc :43 明文把 "cmdDraftMission, extractBriefGate, parseDraftArtifact"
      划给编排入口。不另造 orchestrateDraft({config}) 变体——四个消费测试按
      cmdDraftMission("goal", { dir, ... }) 原签名调用（draft-brief.test.js:6,41+ 等），
      变体入口会造成双入口漂移。
  parseDraftArtifact / extractBriefGate —— 纯函数随迁（draft 管线成员，打包归属同上）
  validateDraftDesc —— 定义自 draft-job.mjs 迁入（纯校验函数，零依赖；draft-job.mjs
      改为从 orchestrator.js import 并维持自身 re-export，monitor.js → draft-job.mjs
      引用链不变、无环：orchestrator 图不 import draft-job）
  __setRunnerFactoryForTest —— 测试缝随迁（模块级可变状态，与 cmdDraftMission 同文件）
  orchestrateAnalyze({ config }) → 现 analyze 主干等价返回（内部自建并关闭 runner，
      等价迁移 main.js:539-549；包装 runPostmortem）
不进编排模块（留在 CLI 壳 / 归属不变）：commander wiring、monitor 启停、
  SIGTERM/SIGINT 处理器、reconcileStaleRuns、unregisterActiveRun、人读 banner 输出
import 允许集 = packaging doc §Packaging Layout 打包集（node builtins + 引擎纯模块
  + runner.js——owner doc 明列 "Process backend path: runner.js (→ executor.js …)
  needed by ProcessExecutor"；编排模块因 resetMockState/__runnerFactory/draft·analyze
  自建 runner 而需要它）。排除：vendor/commander、monitor.js、draft-job.mjs/spawner.mjs
```

- [x] `Decision` 模块命名：`src/orchestrator.js`（备选 `engine-entry.js` / `run-core.js` 否决理由：packaging doc 用语是 "programmatic orchestration entry"，orchestrator 与 owner doc 词汇一致且不与 M2 插件层 `engine-bridge.ts` 撞名）。
  - Skill: none
- [x] `Decision` process 级职责归属：信号处理 / reconcile / monitor / unregister 留 CLI 壳。理由：插件宿主形态下这些 OS 进程动作多数不适用（unregister/registry 归宿主 guard，见 packaging doc §Service Surface）；编排模块保持纯编排，两形态才可共用。残险：CLI 壳与编排模块的职责清单需在 §Public Exports 文档化，防止后续回涨。
  - Skill: none
- [x] `Decision` runner.js 进 import 允许集：迁移段携带 `resetMockState()`（main.js:759 ← runner.js）与 `__runnerFactory` 缺省 `createRunner`，analyze 主干自建 runner——编排模块不可避免 import runner.js。这与 packaging doc §Packaging Layout 一致（"Process backend path: runner.js … needed by ProcessExecutor" 本就在打包集内），draft review iteration 1 B3 指出初稿"无 runner/executor"的允诺与迁移范围自相矛盾，予以纠正。备选：把三者全部改由调用方注入（CLI 壳传 resetMockState/factory/runner）——被否决，纯为缩短 import 列表而拆散内聚的编排职责，且 M2 engine-bridge 同样要传三件套。附注：packaging doc :43 将 `secret-resolver` 误写为 `.mjs`（实际 `src/secret-resolver.js`），且 "env-loader → secret-resolver" 链今日 dormant（零 import）——两处 owner doc 偏差均由 plan 3（其 Phase 3 即 WI5 文档收口）修正，本 plan 允许集按现实定界（见接口契约块 bootstrap 注）。
  - Skill: none
- [x] `Decision` `validateDraftDesc` 定义迁移（iteration 2 B1）：迁移后的 draft 主干调用它（main.js:344），而定义在 `draft-job.mjs`（该文件 import `spawner.mjs`，均在打包排除集）——orchestrator 若 import draft-job 会把 spawner 拖进 M2 打包图。决策：纯校验函数定义迁入 orchestrator.js，`draft-job.mjs` 改从 orchestrator import 并维持自身导出（`monitor.js → draft-job.mjs` 引用链零改动；无环：orchestrator 图不 import draft-job）。备选：orchestrator 直接 import draft-job.mjs——被否决（违反打包排除集）；备选：校验逻辑复制两份——被否决（双源漂移）。残险：`baseline.md:102` "defined in draft-job.mjs" 记录需在 Phase 3 更新真实定义处。
  - Skill: none
- [x] `Add` `orchestrateRun`：迁移 `main.js:669-778` 编排段（delegates.vars 组装逐字段搬移，含 `moduleContextFile` 的 `(不存在)` 兜底语义与 `moduleMemoryIndex` 的 selfMemory 排除规则——两处隐含契约见 CONTEXT.md Mission 配置系统段；`resetMockState` 调用随迁）。
  - Skill: none
- [x] `Add` **VAR_PROVENANCE 漂移门随迁**：`src/context-map.mjs` 的 main.js 引用全量清扫改指 orchestrator.js——扫描目标（`extractVarsKeysFromMainJs`，:115-150）、`@param mainJsPath` 契约注释（:112）、头注释（:11-14）、VAR_PROVENANCE docstring 引用（:35/:42）、main.js 行锚注释（:71-99 区）；`test/context-map.test.js` 的 `MAIN_JS` 常量（:22）与 ≥20 键断言（:35-40）改读编排模块源文本。不迁则该测试硬失败（见 Current Baseline）。
  - Skill: none
- [x] `Add` `cmdDraftMission`（原名原签名整体迁入，见接口契约块 iteration 3 B1 裁决）+ `parseDraftArtifact` / `extractBriefGate` 纯函数随迁 + `bootstrap` + `orchestrateAnalyze`（analyze 自建/关闭 runner 等价迁移 `main.js:539-549`）。含 `validateDraftDesc` 定义迁移与 `draft-job.mjs` 改 import 的重接线（见前项 Decision，同属本 Phase）。
  - Skill: none
- [x] `Add` `main.js` 薄壳化：run / analyze 命令体 = bootstrap + orchestrate* 调用 + process 生命周期 + banner 输出；draft 命令体直接调 `cmdDraftMission`（其内部自解析，见契约块——外壳不再包 bootstrap）；输出字符串逐字节保持（含中文缩进对齐）。
  - Skill: none
- [x] `Proof` import 图检查：`node -e "import('<abs>/orchestrator.js').then(m=>console.log(Object.keys(m)))"` 成功，且 `grep -nE "^(import|export .* from)" src/orchestrator.js` 结果 ⊆ 允许集（接口契约块所列：node builtins + config.js / engine.js / flow-loader.js / expression.mjs / postmortem.mjs / env-loader.js / exit-map.js / runner.js / step-executor.js(若引用) / mission-check.mjs）——无 vendor/commander、无 monitor.js、无 draft-job.mjs/spawner.mjs。传递论证：允许集内每个模块的直接 import 已由 R1 核实闭合于打包集 ⇒ 全图 ⊆ 打包集（transitive closure 论断记入日志）。
  - Skill: none
- [x] `Proof` 全量 `pnpm --prefix tools/mission-driver test` 零回归（基线对比法，含 `draft-brief.test.js` 的 runner-factory 缝继续工作）。
  - Skill: none

Exit Criteria:

- [x] 归一化冒烟（同 plan 1 Phase 1 定义的归一化管线 + 改前/改后各用一个固定 runDir，如 `_tmp/o2-before` / `_tmp/o2-after`）：`node tools/mission-driver/src/main.js demo --step CHECK --dry-run --no-monitor --run-dir _tmp/o2-before` 改前/改后 stdout 归一化 diff 为空（stdout 含墙钟时间戳/`Elapsed:`/runDir token，裸 diff 恒不为空——已升为跨 plan 教训，见 plan 1 iteration 1 B1）；`from-step.test.js` 以子进程方式 spawn `node src/main.js`，为 CLI 行为保持提供免费补充覆盖（在冒烟理由中引用）
- [x] `node tools/mission-driver/src/main.js demo --dry-run --no-monitor`（全流程 dry-run）退出码与改前一致
- [x] import 图 Proof 通过并记录于日志（M2 打包清单的直接证据）
- [x] 全量测试零回归

### Phase 3 - 文档同步 + roadmap 回写 + 日志

Status: completed
Targets: `docs/architecture/mission-driver-baseline.md`、`tools/mission-driver/CONTEXT.md`（若目录结构段提及新模块）、`docs/backlog/dsh-plugin-roadmap.md`、`docs/logs/2026/08-23.md`
Skill: none

- Item Types: `Decision | Add`
- Prereqs: Phase 2

- [x] `Decision` main.js 兼容 re-export 的去留（含测试缝裁决）：**五个**导出以 `export { … } from "./orchestrator.js"` 形式 re-export——`cmdDraftMission` / `parseDraftArtifact` / `extractBriefGate` / `validateDraftDesc` / `__setRunnerFactoryForTest`（五者经 Phase 2 迁移后定义处均在 orchestrator.js，与接口契约块完备导出面一致）；`EXIT_MAP` 的 re-export **保持自 `./exit-map.js`**（Phase 1 已定型，不进 from-orchestrator 列表，避免双源）。消费方：Phase 1 已将 `exit-map.test.js` 改指新家，剩余四个测试文件（`draft-brief` / `brief-gate` / `draft-desc-validate` / `draft-path-consistency`）经 main.js 兼容层不改 import、不改调用签名（`cmdDraftMission(desc, opts)` 原名原签名迁移使这成为零改动等价）。关键约束：缝是模块级可变状态，`export … from` 形式的 re-export 引用原模块同一实例（非捕获副本），四测试不改 import 继续绿是硬验收。备选全量改引被否决：改动面扩大无行为收益；备选包装函数转发被否决：破坏模块状态同一性。§Public Exports 改标真实定义处（orchestrator.js / exit-map.js），main.js 标注为兼容 re-export 层。
  - Skill: none
- [x] `Add` `mission-driver-baseline.md` §Public Exports 更新：EXIT_MAP 新家、orchestrator.js 导出面、main.js 兼容 re-export 标注。
  - Skill: none
- [x] `Add` `tools/mission-driver/CONTEXT.md` 目录结构段补 `orchestrator.js` / `exit-map.js` / `step-executor.js`（一行职责级，不展开）。
  - Skill: none
- [x] `Add` roadmap M1-WI2 状态回写 `ready → done`（起草阶段已随 draft review 通过置 `ready`）。
  - Skill: none
- [x] `Add` `docs/logs/2026/08-23.md` 追加本 plan 聚合条目（覆盖 Phase 1-3）。
  - Skill: none

Exit Criteria:

- [x] baseline §Public Exports 与实际 export 逐项一致（grep 佐证）
- [x] roadmap 仅 M1-WI2 行变更
- [x] `docs/logs/` 条目符合 `00-log-writing-guide.md`

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd2fd8690ffe2VmkzyHGILs41B`，2026-08-23）—— 三项阻塞：B1 VAR_PROVENANCE 漂移门漏盘——`src/context-map.mjs:115-150` brace-scan main.js `vars: {` 块、`test/context-map.test.js:35-40` 断言 ≥20 键，vars 迁出后该门硬失败；已修：基线补全 + Phase 2 新增"漂移门随迁"item（提取器/测试/行锚注释改指 orchestrator.js）。B2 消费方欠枚举 + 测试缝裁决悬空——实际五个测试文件 import main.js（非初稿两个），`__setRunnerFactoryForTest` 为模块级可变状态、re-export 必须同模块实例；已修：基线补全集、Phase 3 Decision 扩为显式裁决六导出（含缝）以 `export … from` 形式 re-export、四缝消费测试不改 import 全绿为硬验收。B3 import 允许集与迁移范围自相矛盾——`resetMockState`（:759）/`__runnerFactory` 缺省 / analyze 自建 runner（:539-549）都需要 runner.js，而 owner doc 打包集本就含 runner.js（§Packaging Layout "Process backend path"）；已修：新增 Decision"runner.js 进允许集"（备选注入法被否决 + 理由），接口契约与 Proof 允许集同步。非阻塞采纳 6 项：`cmdRunMission` 起点 :554；`secret-resolver.js` 实名（owner doc :43 笔误移交 plan 3 修）；Proof grep 覆盖 `export … from` + 传递论证；`--no-monitor` 残域（monitor 行/信号/reconcile 不在 diff 域）记入 Closure Gates；`bootstrap` 签名定为 `{projectRoot, args} → config`（loadDotenv+resolveConfig 一站式）；Phase 2 Prereqs 显式含 plan 1。One-result-surface 判定 PASS（packaging doc 视入口+EXIT_MAP 为单一 P1 交付物）。
- Independent draft review iteration 2: `needs revision`（独立 fresh session `ses_fd2f33895ffe28jQMBqh7LDo7u`，2026-08-23）—— 四项阻塞（均为修订引入或初稿漏盘，已全修）：B1 `validateDraftDesc` 依赖未裁决——draft 主干调用它（main.js:344）而定义在 draft-job.mjs（import spawner.mjs，:29），与打包排除集矛盾；已修：新增 Decision"定义迁入 orchestrator.js，draft-job.mjs 改 import 并维持导出（monitor.js 引用链零改动、无环）"，契约块与基线同步。B2 Phase 2 冒烟"裸 diff 为空"不可达成（时间戳/Elapsed/runDir，plan 1 iteration 1 B1 同款教训）；已修：Phase 2 Exit Criteria 与 Closure Gates 改用 plan 1 归一化管线 + 不同固定 runDir。B3 bootstrap 契约误述 secret-resolver——live 全仓零 import（唯一引用 env-loader.js:7 注释），"env-loader → secret-resolver" 链 dormant；已修：契约块按现实定界（bootstrap = loadDotenv + resolveConfig；secret-resolver 不进允许集不接线；owner doc 偏差移交 plan 3 Phase 3 修正）。B4 Phase 1/3 的 EXIT_MAP re-export 双源矛盾（from exit-map.js vs from orchestrator.js）；已修：Phase 3 Decision 改为五导出 from orchestrator + EXIT_MAP 保持 from exit-map.js，消费方数改"剩余四个测试"（Phase 1 已改指 exit-map.test.js）。非阻塞采纳 4 项：context-map 清扫扩至全文件 main.js 引用（头注释 :11-14 / docstring :35/:42 / test `MAIN_JS` 常量 :22）；"plan 3 WI5"引用补注（其 Phase 3 即 WI5 收口）；Phase 1 第三条 exit criterion 改为显式 "No owner-doc update required"（聚合日志归 Phase 3）；CONTEXT.md `step-executor.js` 记账与 plan 1 无冲突（plan 1 只改 module-boundaries/baseline 两处，CONTEXT.md 目录段独属本 plan）。
- Independent draft review iteration 3: `needs revision`（独立 fresh session `ses_fd2eaf444ffePB4Qf0zOndL02e`，2026-08-23）—— 一项阻塞：B1 导出面三方不可调和——Phase 3 硬验收要求 from-orchestrator re-export `cmdDraftMission`/`parseDraftArtifact`/`extractBriefGate`，但契约块未列后三者、无 item 迁移它们，且测试按 `cmdDraftMission(desc, opts)` 原签名（自解析 config，main.js:313-314）调用而契约的 `orchestrateDraft({config})` 形状不兼容。已修：契约块升级为**完备导出面**——`cmdDraftMission` 原名原签名原语义整体迁入（CLI 与程序化共用单入口，packaging doc :43 明文划归；否决 orchestrateDraft 变体防双入口漂移），`parseDraftArtifact`/`extractBriefGate` 纯函数随迁，Phase 2 Add item 与 Phase 3 Decision 同步（五导出定义处均在 orchestrator.js）。非阻塞采纳 4 项：spawner import 行锚 :27；secret-resolver 表述收窄为"src 内零 import（test/secret-resolver.test.js:7 单测引用除外）"；冒烟 runDir 对显式 `_tmp/o2-before`/`_tmp/o2-after`；冒烟理由引用 `from-step.test.js` 子进程覆盖。审查确认：迁移图无环（allowlist 全成员 import 闭包追踪）、剩余四个 main.js 测试消费方属实、plan 1 归一化管线存在、plan 3 Phase 3=WI5 委托属实。
- Independent draft review iteration 4: `acceptable as-is`（独立 fresh session `ses_fd2e562cdffeiz7dhiVmrwtebj`，2026-08-23）—— iteration 3 修复全量核实：契约块为完备导出面、全 plan 仅 2 处 `orchestrateDraft` 残留且均为裁决理由/历史记录（Goals/items/exit criteria/gates 干净）、Phase 3 re-export 五名与契约面及 live main.js 六符号一一对应、bootstrap 分工无双重解析矛盾；live 抽查全过（draft-brief 调用形状 / packaging doc :43 划归 / secret-resolver 收窄表述 / context-map 锚点 / 违禁词零命中）。非阻塞 3 项已顺手采纳：`:313-314`→`:312-313` 行锚；薄壳化 item 区分 run/analyze（bootstrap+orchestrate*）与 draft（直调 cmdDraftMission）；Add item 补 validateDraftDesc 重接线交叉引用。**共识达成，plan 具备升 active 条件。**

## Closure Gates

- [x] in-scope behavior is complete（三入口程序化可用；CLI 行为不变；EXIT_MAP 新家钉住）
- [x] relevant docs are aligned（baseline §Public Exports / CONTEXT.md / roadmap WI2）
- [x] verification has run：`pnpm --prefix tools/mission-driver test` 零回归 + 归一化 dry-run 冒烟 diff 为空 + orchestrator import 图白名单检查
- [x] scoped verification is not conflated with full verification —— 验证域同 plan 1（引擎套件 + dry-run，纯本地；真实模型 run 不在 M1 验证域，如执行日单独跑了则在日志标注）；冒烟用 `--no-monitor`，monitor 启动行 / 信号处理器 / reconcile 路径不在 diff 域——三者留在 CLI 壳未迁移，残险为"壳内代码未被本 plan 触碰"（以 git diff 路径清单佐证壳内仅剩接线改动）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### `dsh` ProcessExecutor driver 值与 headless CLI 降级梯（packaging doc §Native Dispatch API Chain 末段）

- Classification: `out-of-scope improvement`（post-M2 候选，packaging doc 明示 intentionally absent）
- Why Not Blocking Closure: WI3 白名单也不含 `dsh`；降级梯是 M2 耦合不稳时的退路，非 M1 交付物。
- Successor Required: `no`
- Reopen trigger: M2 收口后评估 `dsh` 一-shot CLI driver 时。

## Closure

Status Note: 三个 Phase 全部落地并通过独立闭包审计：Phase 1 EXIT_MAP 新家 `src/exit-map.js`（main.js 兼容 re-export、exit-map.test.js 改引新家断言零修改）；Phase 2 `src/orchestrator.js` 完备导出面 + main.js 薄壳化 + VAR_PROVENANCE 漂移门随迁；Phase 3 baseline §Public Exports / CONTEXT.md / roadmap WI2 → done / `docs/logs/2026/08-23.md` 聚合条目全部就位。闭包审计 live 复核全量测试（631/628/3，失败集 = 文档记录的预存集，零回归）、import 图 ⊆ 允许集、draft-job.mjs → orchestrator re-export 无环、context-map.mjs/test 全量改指 orchestrator.js、roadmap 与日志回写均在。

Closure Audit Evidence:

- Auditor / Agent: independent closure auditor（mission-driver closure-audit step，2026-08-23，独立于执行 session）
- Evidence: 闭包审计逐项 live 核验——`grep` 佐证 main.js 仅剩 `export { … } from "./orchestrator.js"`（五导出）+ `export { EXIT_MAP } from "./exit-map.js"`；orchestrator.js import 列表 = node builtins + config/engine/flow-loader/expression/postmortem/env-loader/exit-map/runner（⊆ 允许集，无 commander/monitor/draft-job/spawner）；`test/context-map.test.js` `ORCHESTRATOR_JS` 常量 + ≥20 键断言指向编排模块；`docs/logs/2026/08-23.md` 记录全量测试基线对比（HEAD 941c155 基线 631/627/4 → 改后 631/628/3，失败集 ⊆ 基线集）与 import 图传递闭包论证；闭包审计本次复跑 `node --test test/*.test.js` = 631 tests / 628 pass / 3 fail，与日志记录一致；roadmap `dsh-plugin-roadmap.md:18` WI2 = `done`；本文件 `plan-check.mjs --strict` PASS。

Follow-up:

- (none)
