# 2026-08-23-1300-3 driver 白名单 + embed 门控 + P1 文档收口（dsh-plugin M1-WI3/WI4/WI5）

> Plan Status: completed
> Mission: dsh-plugin
> Work Item: M1-WI3 + M1-WI4 + M1-WI5
> Last Reviewed: 2026-08-23（draft review 4 轮，iteration 4 共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M1-WI3/WI4/WI5
> Related: `docs/architecture/dsh-plugin-packaging.md` §Execution Backend Seam（P1 hardening 1/2 owner）／§Scope and Boundary Impact／§Phased Delivery P1；前置 `2026-08-23-1300-1`、`2026-08-23-1300-2`
> Audit: required

## Current Baseline

**driver 无白名单；startup 诊断无条件执行；P1 文档两处待收口：**

- driver 解析自由取值：主分支 `driver = args.driver || MISSION_DRIVER_EXEC env || undefined`（`config.js:519`），`resolvedDriver = driver || mission.driver || "opencode"`（`config.js:667`）；draft（`config.js:558`）/ analyze（`config.js:598`）分支同构。无校验 → 拼错值（如 `opencod`）推迟到 spawn 时以 SPAWN ENOENT 中途失败（packaging doc §Execution Backend Seam P1 hardening 1 指认的缺陷）。
- CLI `--driver <exe>` 自由文本（`main.js:917` run 子命令 / `main.js:945`，help 文案已列 "opencode (默认) | pi | cline" 但不强制）。
- startup 诊断：`FlowEngine.run()` 对非 subflow 引擎无条件执行（`engine.js:1567-1590`）——`registerActiveRun`（`~/.mission-driver/active/`，runId+missionName 双 guard）+ `_sysMon("START:...")`（execSync 进程快照）+ `_warnOrphans()`（startup reaper，会 kill 匹配 `opencode run` + `[MISSION_DRIVER]` 命令行的 OS 进程）。插件宿主进程内三者都不可执行（packaging doc P1 hardening 2：Engine defect destabilizing the host 风险的缓解项）。
- executor 执行路径内还有心跳级 `sysSnapshot` + `touchActiveRun`（`executor.js:352-354`）——属 ProcessExecutor 内部，native 模式不选中该 backend，天然不触发（设计注记，非门控项）。
- 文档现状：`module-boundaries.md:9`（plan 1 已修订引擎行的前提下本 plan 复核）；`mission-driver-baseline.md:34` §Driver selection 写 "Supported values: `opencode` | `pi` | `cline`"、`:101` §Public Exports（plan 2 已更新 EXIT_MAP/编排导出的前提下本 plan 复核）；`dsh-plugin-packaging.md` §Phased Delivery P1 行待对照已落地交付物核对。
- roadmap `docs/backlog/dsh-plugin-roadmap.md` M1 五个 WI 中 WI1/WI2 由前置 plan 回写，本 plan 收 WI3/WI4/WI5。

## Goals

- resolve-time driver 白名单 `opencode | pi | cline | native`：未知值启动即清晰报错退出（非中途 SPAWN ENOENT）；`native` 仅插件宿主合法——standalone CLI 明确拒绝并给出专属错误文案；env / mission.json / base.json 来源的非法值同样在解析点拦截。
- embed 门控：`FlowEngine.run()` 的 startup 诊断（active-run 注册 / START sys-snapshot / orphan reaping）在 embed 标志开启时整体跳过；默认关闭，行为零变化。
- WI5 收口：module-boundaries / mission-driver-baseline 两 owner doc 与已落地行为最终一致；packaging doc P1 交付物逐项核对；roadmap M1 全部 WI 状态核对回写；P1 验证门禁（全量测试绿含 exit-map 钉住 + CLI 行为不变冒烟）整仓复核一遍。

## Non-Goals

- 不实现 NativeExecutor 与 native 模式的实际执行（M2-WI7）；M1 内 `native` 只作为"被 CLI 拒绝的白名单成员"存在。
- 不实现插件层 active-run guard（packaging doc §Service Surface 的 plugin-owned 注册，M2）。
- 不为 executor.js 心跳级诊断加门控（native 不走该路径，见基线注记）。
- 不改 pi/cline driver 既有默认值与行为（`config.js:43-49` resolveDriverFields 不动）。
- 不做 M2 起的 `@deepseek-ai/*` 依赖钉版（R2，M2 事项）。

## Task Route

- Type: `implementation-only change`（校验 + 门控，不改公共契约语义）+ `verification or audit work`（Phase 3 文档收口与 P1 门禁复核）
- Owner Docs: `docs/architecture/dsh-plugin-packaging.md` §Execution Backend Seam、`docs/architecture/mission-driver-baseline.md` §Driver selection / §Public Exports、`docs/architecture/module-boundaries.md`
- Skill Selection Basis: Phase 1/2 为带契约的小型行为新增，`Skill: none`（无匹配可复用方法——非重构、非审计）；Phase 3 文档一致性收口用 `document-audit-prompt.md` 的方法（required inputs：两个 owner doc 路径 + 已落地 diff；expected output：findings + revision targets，落在 plan 内）

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（embed 测试用临时 `HOME`/registry 目录隔离，不触真实 `~/.mission-driver/`）。

## Execution Plan

### Phase 1 - WI3 driver 白名单（resolve-time 校验 + CLI 拒绝 native）

Status: completed
Targets: `tools/mission-driver/src/config.js`、`tools/mission-driver/src/main.js`、`tools/mission-driver/test/`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 前置 plan 1（seam 落地后 driver→backend 语义清晰）；与 plan 2 无执行顺序耦合，但按文件名序号在 plan 2 后执行

- [x] `Decision` 校验落点与 native 放行机制：`config.js` `resolveConfig` 三个返回点（主/draft/analyze，解析点 `config.js:667/:558/:598`）在 resolvedDriver 定稿后统一校验，白名单 `SUPPORTED_DRIVERS = ["opencode","pi","cline","native"]` 导出常量；`native` 仅当调用方传内部选项 `allowNativeDriver: true` 时放行（非 CLI flag、非 mission 字段、非 env——M1 内只有测试传它，M2 宿主 engine-bridge 传它）。备选：校验放 main.js CLI 层——被否决，env/mission/base 来源的值不经 CLI flag，CLI 层校验漏路径。备选：校验放 runner/executor spawn 前——被否决，那只是把 ENOENT 换成自定义错误，仍中途失败。残险：`SUPPORTED_DRIVERS` 与 CLI help 文案、baseline §Driver selection 三处需同步（Phase 3 收口检查项）。
  - Skill: none
- [x] `Decision` 错误契约：非法 driver → stderr 单行清晰错误，列出合法值与用户实际传入值及来源提示（CLI flag / env `MISSION_DRIVER_EXEC` / mission 或 base 配置——视命令而定，draft/analyze 返回点无 mission 来源），进程退出码 1。文案语言定稿：config 层错误用英文（与 config.js 现有错误风格一致，如 `mission name is required: ...` 在 `config.js:631-635`），CLI 层 native 拒绝沿用仓库 CLI 中英混合惯例，草案定稿为 `ERROR: driver "native" 仅在 DSH 插件宿主内可用 (requires the DSH plugin host); standalone CLI 不支持`。抛错传播方式：沿用现状——main.js 无顶层 catch，`resolveConfig` throw 未捕获直通（stack trace + exit 1，与今日其它 resolve 期错误同路径，见 iteration 2 建议 3），Proof 断言按"退出 1 + stderr 含文案"表述，不承诺无 stack。合法值路径零输出变化。
  - Skill: none
- [x] `Add` `config.js` 校验实现。CLI 面：main.js 恰好两处 `--driver` 声明（`main.js:917` run 子命令 / `main.js:945` 主命令，grep 全仓核实无第三处）；draft/analyze 子命令不暴露该 flag，其 driver 经 env / base.json 进入 `resolveConfig`，已被 config 层校验覆盖——CLI 层只保证 resolve 抛错信息透传到 stderr 且退出码 1，不加第二套校验。
  - Skill: none
- [x] `Proof` 新增 `test/driver-whitelist.test.js`（node:test），来源矩阵按返回点实际存在的来源构造（draft/analyze 返回点 `mission: null`，第三来源是 base.json 而非 mission）：(a) 主返回点：未知值 × flag / env / mission.json 三来源 → 抛错且信息含合法值列表；draft/analyze 返回点：未知值 × env / base.json 两来源（程序化 args 传入视同 flag 来源）→ 同样抛错；(b) `native` 无 `allowNativeDriver` → 三返回点均拒绝、文案含宿主提示；带 `allowNativeDriver: true` → 通过；(c) `opencode`（默认/显式）/`pi`/`cline` 三合法值三返回点 → 配置对象 driver 字段与改前逐字段一致（回归）；(d) CLI 级：`node src/main.js demo --driver native --dry-run --no-monitor` 退出 1 + 专属文案；`--driver opencod` 退出 1 + 白名单文案。
  - Skill: none
- [x] `Proof` 全量 `pnpm --prefix tools/mission-driver test` 零回归（`pi-driver-config.test.js` 与 `cline-driver-config.test.js` 既有合法值用例全绿）。
  - Skill: none

Exit Criteria:

- [x] 非法 driver 在 resolve 阶段失败（不再到达 spawn），错误信息含合法值清单
- [x] CLI 拒绝 `native` 的退出码与文案符合 Decision 契约
- [x] 合法值三来源回归零变化
- [x] `docs/logs/` 暂记（plan 级聚合日志见 Phase 3）

### Phase 2 - WI4 embed 门控（startup 诊断）

Status: completed
Targets: `tools/mission-driver/src/engine.js`（`engine.js:1567-1590` 区）、`tools/mission-driver/test/`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: Phase 1（执行顺序便利，无硬依赖：两 Phase 改不同文件，仅共用全量测试套件）

- [x] `Decision` embed 标志形状：`cfg.embed === true`（`delegates.config` 既有通道，与 `cfg.isSubflow` 同层）。备选：FlowEngine 构造参数——被否决，config 是引擎唯一既有配置面，构造参数引入第二配置通道。默认 `undefined`/`false` → 门控不触发，行为零变化。M2 宿主经 config 注入 `embed: true`（+ `allowNativeDriver`，Phase 1 机制）。
  - Skill: none
- [x] `Decision` reaper/诊断可观测机制（iteration 2 B1）：`node:test mock.module` 需要 `--experimental-test-module-mocks` flag（本机 Node 25.3 实测：无 flag 时 `mock.module is not a function`），而仓库 test script 是裸 `node --test test/*.test.js` 且引擎承诺 Node ≥ 18——改 test script 加 flag 会把测试路径的 Node 下限抬到 22.3+，否决。决策：**engine 侧最小注入缝**——`FlowEngine.run()` 内三个 startup 诊断调用点（registerActiveRun / `_sysMon` 的 sysSnapshot / `_warnOrphans` 的 reapStartupOrphans；`_sysMon`/`_warnOrphans` 是 run() 作用域闭包 `engine.js:1555/1560`，故 `_diag` 表在 run() 内构造，缺省值 = 真实调用形态——`sysMon` 项缺省为接 label 的 `_sysMon` 包装而非裸 `sysSnapshot(runDir,label,procs)`）经 `this._diag` 表分发，`delegates.diagnosticHooks` 可整体覆盖（与既有 delegates 注入风格同构；`active-run-registry.mjs:28` 的 `ACTIVE_RUNS_DIR` 是 import 时顶层常量，注入缝同时规避了"先改 HOME 再 import"的顺序陷阱）。门控逻辑作用于 `_diag` 调用点本身，与作用于真实函数完全同路径。备选：test script 加 experimental flag——被否决（Node 下限回归 + 试验性 API 进标准验证路径）；备选：隔离目录法证 reaper——被否决（iteration 1 B3 已证无证明力）。残险：`_diag` 缝是测试可观测面而非公共 API，须在 `mission-driver-baseline.md` §Public Exports vs Test Seams（:97 区）登记——owning item 见 Phase 3 第 2 项枚举。
  - Skill: none
- [x] `Add` `engine.js` 门控：`cfg.isSubflow !== true` 分支整体再套 `cfg.embed !== true` 条件——embed 时跳过 `this._diag.registerActiveRun`、`this._diag.sysMon("START:...")`、`this._diag.warnOrphans()` 三者；`_getProcs` 惰性快照保持（跳过后无人调用即零成本）。`unregisterActiveRun`（`main.js:786-788`，CLI 壳）无需门控：embed 模式不经 CLI 壳，且该调用幂等 best-effort。
  - Skill: none
- [x] `Add` 设计注记落码（一行注释级）：executor 心跳级 `sysSnapshot`/`touchActiveRun`（`executor.js:352-358`）不门控的理由——仅在 ProcessExecutor 路径执行，native 模式不选中。
  - Skill: none
- [x] `Proof` 新增 `test/embed-gating.test.js`：以最小 flow + fake executor 跑 `engine.run()`，`delegates.diagnosticHooks` 注入三 spy：(a) `embed: true` → 三 spy 均零调用（注入缝直接断言调用与否，无"调用了没找到"歧义；夹具 `config` 需同时给 `runDir`（`engine.js:1504` 由其 basename 派生 `runId`，勿另造 runId 键）与 `missionName`，否则误入 `engine.js:1578` 既有守卫的 skip 分支造成假绿）；(b) 默认（无 embed）→ registerActiveRun spy 收到含 `{runId, missionName}` 的 payload（子集断言——实际 payload 另含 `driverPid`/`projectRoot`，`engine.js:1580-1585`，不逐一钉死）、sysMon spy 收到 `START:` 前缀 label、warnOrphans spy 恰被调用一次（回归；夹具同样必须设 `missionName`，见 iteration 2 建议 2）；(c) `embed: true` 且 `isSubflow` 子引擎 → 与现状一致不受影响。隔离目录断言（registry 文件 / `sys-snapshot.log` START 行）作为 (b) 的补充证据保留——真实缺省函数路径落盘验证（runDir 用临时目录）。
  - Skill: none
- [x] `Proof` 全量测试零回归。
  - Skill: none

Exit Criteria:

- [x] embed=true 时三类 startup 诊断均不执行（测试证据）
- [x] 默认路径与 subflow 路径行为零变化（回归证据）
- [x] `docs/logs/` 暂记

### Phase 3 - WI5 文档收口 + P1 门禁复核 + roadmap 回写

Status: completed
Targets: `docs/architecture/module-boundaries.md`、`docs/architecture/mission-driver-baseline.md`、`docs/architecture/dsh-plugin-packaging.md`、`docs/backlog/dsh-plugin-roadmap.md`、`docs/logs/2026/08-23.md`
Skill: document-audit-prompt.md

- Item Types: `Add | Proof`
- Prereqs: Phase 1、Phase 2，且前置 plan 1/plan 2 均已闭合（文档收口描述的是全部已落地现实）

- [x] `Add` `mission-driver-baseline.md` §Driver selection（:34 区）更新：Supported values 增 `native`（附"仅插件宿主，CLI 拒绝"限定）+ resolve-time 校验行为 + `embed` 标志一句说明（指向 packaging doc 详述）。
  - Skill: none
- [x] `Add` `mission-driver-baseline.md` §Public Exports 终态复核（WI5 明文范围）：逐项核对 §Public Exports（:97-113 区）与已落地导出一致——EXIT_MAP 新家（plan 2）、orchestrator.js 导出面（plan 2）、seam 模块导出（plan 1）、`SUPPORTED_DRIVERS`（本 plan）；**并登记本 plan 新增的 `delegates.diagnosticHooks` 注入缝**到 §Public Exports vs Test Seams（:97 区"Consumers must not depend on `__`-prefixed exports outside of `test/`"约定段——Phase 2 Decision 残险项的 owning item）；不一致处修齐。此为 Phase 3 Exit Criteria "§Public Exports 为 plan 2 终态复核" 的 owning item。
  - Skill: none
- [x] `Add` `module-boundaries.md` 复核：引擎核心行（plan 1 已改）与 §Test Seams 段（该文件 :26-30 区，补 seam/白名单/embed 三个新测试文件名）；需要则补，不需要则显式记录 "复核无需变更"。（注意：`_diag` 缝登记在 baseline 的 §Public Exports vs Test Seams 段——module-boundaries 的 §Test Seams 只列测试入口，两者不重复。）
  - Skill: none
- [x] `Add` `dsh-plugin-packaging.md` P1 交付核对：§Phased Delivery P1 行六项交付物（seam/ProcessExecutor/程序化入口+EXIT_MAP/driver 校验/embed 门控/module-boundaries 更新）逐项对照已合并代码打钩记录于本 plan Closure 段；§Execution Backend Seam 接口草图句加"以三能力方法落地"锚注（兑现 plan 1 Decision 的残险项）；同 pass 修正 :43 两处与现实偏差——`secret-resolver.mjs` → `secret-resolver.js` 文件名笔误（plan 2 Decision 附注指认）与 "env-loader → secret-resolver before resolveConfig" 链路句按现实标注（secret-resolver 今日全仓零 import、链路 dormant，实际链是 loadDotenv 先于 resolveConfig；plan 2 iteration 2 B3 指认）。状态标头维持 PLANNED→按 Update Rule 措辞更新为 P1 已交付（P2-P4 仍 planned）。
  - Skill: none
- [x] `Proof` P1 验证门禁整仓复核（packaging doc P1 gate 原文：full engine test suite green (incl. exit-map pinning); CLI behavior unchanged (run demo smoke test)）：`pnpm --prefix tools/mission-driver test` 全绿 + `node --test test/exit-map.test.js` + `node src/main.js demo --step CHECK --dry-run --no-monitor` 冒烟。真实模型 `run demo`（非 dry-run）在凭据可用时补跑并在日志标注；不可用则明确记录 "verification scope limited: dry-run 域"。
  - Skill: none
- [x] `Add` roadmap 回写：M1-WI3/WI4/WI5 → `done`（起草阶段已随 draft review 通过置 `ready`），并核对 WI1/WI2 已由前置 plan 回写为 `done`；M1 里程碑无遗留。
  - Skill: none
- [x] `Add` `docs/logs/2026/08-23.md` 追加本 plan 聚合条目（覆盖 Phase 1-3 + P1 门禁结果）。
  - Skill: none

Exit Criteria:

- [x] 两个 owner doc 与实际行为逐项一致（§Driver selection 含 native/embed；§Public Exports 为 plan 2 终态复核）
- [x] packaging doc P1 行核对记录在案，Update Rule 履行
- [x] roadmap M1 五个 WI 全 `done`
- [x] P1 门禁复核结果（含 scoped 与否标注）记入日志

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd2fd5eecffeF2bu45WIzS3gRy`，2026-08-23）—— 四项阻塞：B1 CLI 面事实错误——"三个带 --driver 的入口（run 及 draft/analyze 如暴露）"不成立，全仓恰两处声明（`main.js:917/:945`），draft/analyze 无该 flag 且经 env/base.json 已被 config 层覆盖；已修：Add item 改述 + CLI 层职责定为"错误透传 + 退出码 1"。B2 Proof 矩阵含不可执行格子——draft/analyze 返回点 `mission: null`，第三来源是 base.json 非 mission；已修：按返回点分列来源（主 = flag/env/mission；draft/analyze = env/base + 程序化 args 视同 flag）。B3 reaper 断言证明力缺口——无孤儿可杀时 `reapStartupOrphans` 不落任何工件（仅 `_killOne` 内写，reap-orphans.mjs:212-220），隔离目录法无法区分"调用了没找到"与"没调用"；已修：(a)(b) 的 reaper 断言强制 `node:test mock.module` spy（engine.js:4 静态 import），隔离目录法仅用于 registry 文件与 sys-snapshot.log 断言。B4 §Public Exports 终态复核 exit criterion 无 owning item；已修：Phase 3 显式新增复核 item。非阻塞采纳 5 项：引用统一到解析点 :667/:558/:598；executor 心跳范围 :352-358；Phase 2 Prereqs 改"执行顺序便利，无硬依赖"；Proof 补 `cline-driver-config.test.js`；错误文案语言在 Decision 内定稿（config 层英文、CLI 层混合，含草案）。
- Independent draft review iteration 2: `needs revision`（独立 fresh session `ses_fd2f31307ffeTCFimcvwPFfJWx`，2026-08-23）—— 一项阻塞：B1 `node:test mock.module` 在仓库实际 test 调用方式下不可执行——本机 Node 25.3 实测该 API 仅在 `--experimental-test-module-mocks` flag 后存在，而 test script 是裸 `node --test test/*.test.js` 且引擎承诺 Node ≥ 18（加 flag 会把测试路径下限抬到 22.3+；CI 两 workflow 均不跑后端套件，无从兜底）；另有 import 顺序陷阱（mock 须先于 `import engine.js` 注册；`ACTIVE_RUNS_DIR` 是 import 时顶层常量）。已修：新增 Decision"engine 侧最小注入缝 `this._diag`（缺省真实函数，`delegates.diagnosticHooks` 覆盖）"，Proof (a)(b) 改为 spy 直证调用与否 + 夹具补 `missionName` 防 `engine.js:1578` 守卫假绿；隔离目录断言降级为 (b) 补充证据（真实缺省路径落盘）。非阻塞采纳 4 项：`mission name is required` 引用改 `config.js:631-635`；错误契约显式接受 stack 直通现状（断言按"退出 1 + stderr 含文案"）；来源提示改"mission 或 base 配置——视命令而定"；其余全部复核项过（两处 --driver 声明 / draft-analyze mission:null / §Public Exports owning item / P1 六项 / roadmap 映射）。
- Independent draft review iteration 3: `needs revision`（独立 fresh session `ses_fd2ead63effeCFkOAX7Lmbnh5o`，2026-08-23）—— 一项阻塞：B1 Phase 2 Decision 承诺的 `_diag` Test-Seams 登记无 owning item（Phase 3 item 2 枚举四个核对对象不含它；item 3 误把 §Test Seams 段安到 module-boundaries.md——该段实在 `mission-driver-baseline.md:97`）。已修：Phase 3 item 2 枚举显式加"`delegates.diagnosticHooks` 注入缝登记到 baseline §Public Exports vs Test Seams"；item 3 改指 module-boundaries 自身的 §Test Seams（:26-30 区，仅列测试入口）并注明两处不重复。非阻塞采纳 3 项：Decision 措辞补"`_sysMon`/`_warnOrphans` 是 run() 作用域闭包（engine.js:1555/1560）故 `_diag` 表在 run() 内构造"+"`sysMon` 缺省为接 label 的包装"；Proof 夹具改"runDir（engine.js:1504 派生 runId）+ missionName，勿另造 runId 键"；registerActiveRun 断言改子集匹配（payload 另含 driverPid/projectRoot，engine.js:1580-1585）。审查同时确认注入缝方案本体健全：三调用点全文件单点（:1580/:1588/:1589）、delegates 为既有注入通道（ctor :309，约 25 处使用）、Node 论据正确（package.json:11 裸 test script / README:26 Node ≥ 18）。
- Independent draft review iteration 4: `acceptable as-is`（独立 fresh session `ses_fd2e5488affeWvF55zscBZuYfR`，2026-08-23）—— iteration 3 修复核实：Phase 3 item 2 显式拥有 `_diag` 缝登记（baseline §Public Exports vs Test Seams :97 区）并自认 "§Public Exports 终态复核" exit criterion 的 owning item；item 3 引用的 module-boundaries `## Test Seams (Public)` 实在 :26-30 且只列测试入口、不重复注记成立；`_diag` Decision 可执行性全链核实（:1555/:1560 闭包、:1580/:1588/:1589 单点调用、:1504 runId 派生、:1578 守卫、payload 字段 :1580-1585、delegates 通道 :309）；Phase 1/2/3 其余项与 live 一致（两处 --driver 声明、mission:null、P1 六项交付物逐项、gate 文本逐字、roadmap 映射、document-audit skill 注册）。非阻塞 3 项：header Last Reviewed 升 active 时更新（已照办）、item 3 措辞微瑕由既有 hedge 兜底、iteration-3 记录"约 25 处"实为 21（记录性近似）。**共识达成，plan 具备升 active 条件。**

## Closure Gates

- [x] in-scope behavior is complete（白名单三返回点三来源生效；embed 门控三类诊断跳过；默认零变化）
- [x] relevant docs are aligned（baseline §Driver selection / module-boundaries / packaging doc P1 / roadmap M1 全量）
- [x] verification has run：`pnpm --prefix tools/mission-driver test` + driver-whitelist / embed-gating 新测试 + dry-run 冒烟（+ 真实 demo run 如凭据可用）
- [x] scoped verification is not conflated with full verification —— dry-run 域结论不表述为全绿；真实 run 缺失时明确标注
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### 插件层 active-run guard（plugin-owned 单 run 守卫 + 宿主侧注册）

- Classification: `out-of-scope improvement`（M2-WI6/WI10 归属）
- Why Not Blocking Closure: embed 模式下引擎侧注册被本 plan 关闭后，宿主侧 guard 是 M2 §Service Surface 的明确交付物；M1 无宿主可挂。
- Successor Required: `yes`（M2 plugin shell plan）
- Reopen trigger: M2-WI6 启动时。

### `dsh` headless CLI driver 值（降级梯后备）

- Classification: `watch-only residual`
- Why Not Blocking Closure: packaging doc 明示 post-M2 候选且 intentionally absent from WI3 whitelist。
- Successor Required: `no`
- Reopen trigger: M2 收口后 native 耦合不稳触发降级梯评估时。

## Closure

Status Note: 三个 Phase 全部落地：Phase 1 driver 白名单（`config.js` `SUPPORTED_DRIVERS` 导出 + `assertSupportedDriver` 于三返回点 `config.js:591/:639/:716` 校验；CLI 零第二套校验，抛错直通 exit 1 实测；`main.js` 两处 `--driver` help + env help 同步）；Phase 2 embed 门控（`engine.js` run() 内 `_diag` 分发表 + `cfg.embed !== true` 门控；`executor.js` 设计注记）；Phase 3 文档收口 + P1 门禁复核 + roadmap 回写。真实模型 run 未跑，验证域 = 引擎全量套件 + dry-run（已在日志明确标注 "verification scope limited: dry-run 域"）。

P1 六项交付物逐项对照（packaging doc §Phased Delivery P1 行）：

- [x] StepExecutor seam（`src/step-executor.js`，plan 1；live 证据：`class ProcessExecutor` 定义在该文件，engine 消费 `delegates.executor`）
- [x] ProcessExecutor wrapper（同文件，三方法对 runner 1:1 转发，plan 1）
- [x] 程序化编排入口 + EXIT_MAP 提升（`src/orchestrator.js` `bootstrap`/`orchestrateRun`/`orchestrateAnalyze` + `src/exit-map.js`，plan 2；`test/exit-map.test.js` 13/13 钉住）
- [x] driver validation（本 plan Phase 1；`test/driver-whitelist.test.js` 18 用例）
- [x] embed-mode gating of startup diagnostics（本 plan Phase 2；`test/embed-gating.test.js` 4 用例）
- [x] module-boundaries.md update（plan 1 引擎行 + 本 plan §Test Seams 三新测试文件）

Closure Audit Evidence:

- Auditor / Agent: independent closure auditor（独立 subagent cold-replay audit，2026-08-23，独立于执行 session）
- Evidence: 见下方 Closure Audit Record 段（audit 后回填）。

Follow-up:

- (none at draft time)

## Closure Audit Record

- Independent closure auditor: 独立 subagent cold-replay audit（task `ses_fd2aa62f3ffeSQpmMzscuZe8R9`，2026-08-23，独立于执行 session，read-only）。
- Verdict: **PASS**（6 组检查全过）——(1) plan 完整性：三 Phase `completed`、全部执行项/Exit Criteria/Closure Gates `[x]`；(2) 代码现实：`SUPPORTED_DRIVERS` 精确四值、`assertSupportedDriver` 三落点（`config.js:591/:639/:716`）来源链各自正确、native 需 `args.allowNativeDriver===true`、main.js 仅 help 文案无第二套校验；`engine.js:1589-1594` `_diag` 表（裸 registerActiveRun / label 包装 sysMon / warnOrphans 包装 + diagnosticHooks spread）、`:1604` 组合门控、三调用点 `:1615/:1623/:1624`；`executor.js:352-355` 设计注记在位；worktree 变更集 = 预期集（4 src + 2 新测试 + 5 docs + plan 自身），`web/dist` 零改动、package.json diff 空；(3) 测试现实：driver-whitelist 18/18、embed-gating 4/4、exit-map 13/13、prompt-check OK、全量 653/651/2 且失败集恰为 2 个预存 Windows 平台用例（无其它失败）(4) 文档现实：baseline/packaging/module-boundaries/roadmap/log 五处逐项核实（packaging doc 无行号引用残留）；(5) 文本一致性：`grep -B5 "\- \[ \]" | grep "Status: completed"` 为空；(6) 范围纪律：flows/memory/dist/package.json 均未触碰。
- 非阻塞注记：聚合日志行同时记载 653/651/2 与 monitor flake 预存集——flake 在执行期 runs 出现（git-stash 基线法证实 HEAD 复现、日志有据）、audit 当次 run 未现，数字与 audit live 结果内部一致。
