# 2026-07-29-0900 mission-driver Reaper 并行误杀修复 + 并行运行支持

> Plan Status: completed
> Last Reviewed: 2026-07-29
> Source: `docs/analysis/2026-07-29-0002-mission-driver-reaper-concurrent-runs.md`（误杀取证 + 方案分析）
> Related: 无既有 plan（本次为首发）；`run-reconcile.mjs` 是本 plan 复用的安全范式来源
> Audit: required

## Current Baseline

Live facts（已逐项核对源码 2026-07-29）:

**故障与根因（取证已确认，详见 analysis §1-§3）**:
- startup reaper `reapStartupOrphans`（`src/reap-orphans.mjs:148`）在每次顶层 engine `run()` 入口被调用（`engine.js:1463-1466` `_warnOrphans` → `:1470-1472`，子流程跳过）。
- Phase 1 杀进程判定（`reap-orphans.mjs:164-191`）用**全局标记** `/\[MISSION_DRIVER\]/` + `/opencode\s+run\b/` 匹配，唯一排除条件是 `p.ppid !== excludePpid`（`excludePpid = process.pid`，`engine.js:1465`）。
- 该排除**只能保护当前 run 自己 spawn 的 opencode**，对另一个并行 run 的 opencode 毫无防护 → 并发或时间重叠即误杀。`reap-orphans.mjs:135-138` 注释把"整机同一时刻只有一个 mission-driver"当成不变量，是根因。
- 标记注入点 `runner.js:166`：`const markedPrompt = \`[MISSION_DRIVER] ${prompt}\``。spawn 的 opencode 子进程 cmdline 携带此标记（Windows CIM 取完整 cmd；Unix `ps -eo ... command` 亦取完整 cmdline，`platform.mjs:80` 已确认）。

**runId 生成与身份事实（评审 B1/B2 纠正后核实）**:
- runId = `basename(runDir)`；runDir 生成（`config.js:649-657`）= `${YYYY-MM-DD-HHMMSS}-mission-driver` —— **仅秒级时间戳，无随机分量**。同秒启动两个 mission → **runId 碰撞**。draft/analyze 路径用 `Date.now()`（毫秒）命名（`config.js:493,529`），不碰撞；但主 mission 路径会。
- **driver（main.js）cmdline 不含 runId**：driver = `node .../src/main.js <missionName> ...`（`mission-driver.sh.example:25`、`config.js:558` missionName 为位置参数），runDir 在内部生成、非 CLI 参数。因此 `isAliveAndOurs(driverPid, runId, missionName, procs)` 的身份匹配**实际依赖 missionName**（cmdline 含 `main.js` + missionName）；runId 只用于"在登记中定位该 run 的 driverPid/missionName"。这是设计的关键约束。
- **draft/analyze 路径 `missionName: null`**（`config.js:500,534`）。若把这类 run 登记并让 reaper 对 null missionName 调 `isAliveAndOurs` → 身份匹配恒为 false → **误杀活跃 run**（正是本 plan 要消除的伤害）。故登记须加 missionName 守卫（见 Phase 1）。

**已有可复用的安全机制（唯独 reaper 没用）**:
- runId = `basename(runDir)`（`engine.js:1407` `this.runId = cfg.runDir ? basename(cfg.runDir) : null`）。已写入 events.jsonl / run-state.json。
- `isAliveAndOurs(pid, runId, missionName, procs)`（`run-reconcile.mjs:61`）：PID 复用安全的二段存活判定 —— `isAlive(pid)` 且 cmdline 含 `main\.js` + (runId 或 missionName)。cmdline 不可得时保守回退为 alive（R2，`:69-71`）。
- `reconcileStaleRuns(projectRoot, procs)`（`run-reconcile.mjs:131`）：扫 `_tmp/*/run-state.json`，**注释明确"protects coexisting active missions"**（`:10-12`）。判定范式 = 有 pid 且 `isAliveAndOurs` → 跳过（绝不伤害活跃 run）；死/复用 → 清理（`:162-168`）。reaper 应有却没有这个范式。

**spawn 契约现状（受保护区影响盘点）**:
- `[MISSION_DRIVER]` 标记**仅在两处源码被精确字符串/正则依赖**: (a) `reap-orphans.mjs:165` `missionDriverPattern`（本 plan 要改）；(b) `runner.js:166` 注入点（本 plan 要改）。grep 已确认**无其他源码硬编码该标记**。
- **owner doc 记录该标记（评审 B3 纠正）**: `tools/mission-driver/EXECUTION-PRINCIPLE.md:181`（序列图 `markedPrompt = "[MISSION_DRIVER] " + prompt`）+ `:312`（"加 `[MISSION_DRIVER]` 前缀"）记录了父→子 spawn 契约。tag 格式变更会使这两处漂移 → **必须同步更新**（纳入 Phase 1 doc target）。
- **测试硬编码影响（确认 in-scope）**: `test/prompt-cmdline-limit.test.js:47,50,82,83` 断言 `opts.stdin === "[MISSION_DRIVER] do the work"` 与 `[MISSION_DRIVER] ${bigPrompt}`。tag 格式变为带 runId 后，这两处断言会失败，**必须同步更新**（该测试用 `baseConfig(runDir)` 设了 `runDir`，runId = `basename(runDir)` 可计算）。
- `test/run-reconcile.test.js:58` 的 `ownProc` helper 构造 `cmd: ...[MISSION_DRIVER]` 是**驱动进程 main.js 的 cmdline mock**，不是 opencode 标记断言，不受影响（但本 plan 新增测试可复用其注入快照模式）。
- `ansi-and-mixedcase-tag.test.js` / `prompt-markers.test.js` 测的是 `<AI_STEP_RESULT>` 标签，**与本标记无关**，不受影响。

**engine.run() 生命周期（注销登记的落点盘点）**:
- `engine.run()`（`engine.js:1402`）内部有约 25 个 `return await this._result(...)` 终止点，**无包裹整个 run 的 try/finally**。
- 最外层 finally 在 `main.js:777`（`finally { monitor.close(); runner.close(); }`），`engine.run()` 在 `:760` 被 await。**这是注销登记的唯一主落点**（不把注销散布到 25 个返回点——那与非目标 #6"不重构 run() 多返回点"冲突，且易漏）。
- 关键安全性质：即使注销失败（进程崩溃），`isAliveAndOurs(driverPid,...)` 因 driverPid 已死而返回 false → reaper 下次启动正确回收。**注销是 best-effort 清理，非安全关键路径**；崩溃残留登记无害。

**进程枚举形状（跨平台）**: `platform.mjs:63` `getAllProcesses()` 返回 `{pid,ppid,pgid,rss_kb,name,cmd}`；Windows pgid=0 但 cmd 完整、可按 PPID 链走树；Unix cmd 完整。reaper 已有 `_getDescendants(rootPid, allProcs)`（`reap-orphans.mjs:111`）跨平台可用。

**既有测试范式**: `run-reconcile.test.js` 用注入 `processes` 快照 + `mkdtempSync` 临时目录，零外部依赖、纯函数测试。本 plan 新增 reaper 测试复用此模式。

Gap: reaper 是仓库里唯一未复用 runId + isAliveAndOurs 安全范式的进程清理路径；当前隐含"全局唯一 run"假设，并发即误杀活跃 session。

> 注：analysis §4.3 提议的登记文件名 `<runId>.json`（"无写竞争"断言）已被本 plan Decision 2 推翻——runId 仅秒级时间戳会碰撞，故文件名改为 `<runId>-<driverPid>.json`，并以多 entry lookup 容纳同 runId 并行 run。

## 设计决策

1. **给 spawn 的 opencode 打 runId 标记，格式 `[MISSION_DRIVER:<runId>]`，无 runDir 时回退旧标记**。
   - 备选 a（不改标记，仅靠父进程树判定）: 否决——跨项目并行时 reaper 无法从 opencode cmdline 得知 runId，回退到裸 ppid 判定会重新陷入"父进程存活=活跃"的弱判定，且 PID 复用场景不安全。
   - 备选 b（标记同时带 missionName）: 否决——missionName 已在 driver(main.js) cmdline 中，**runId 用于在登记中定位该 run 的 driverPid/missionName，missionName 用于 `isAliveAndOurs` 确认 driver 身份**（driver cmdline 不含 runId，身份匹配依赖 missionName，见 Baseline 身份事实）；标记只需 runId 即可定位登记项，多带字段无额外收益。
   - 选定: runId 是 run 级身份，最小信息量；正则向后兼容同时匹配新旧两种标记。
   - 残余风险: 无（标记仅作识别，向后兼容）。

2. **新增"活跃 run 登记"作为 run 维度判孤儿的依据，目录与 projectRoot 无关（全局），文件名含 driverPid 防碰撞**。
   - 备选 a（复用 `_tmp/*/run-state.json` 扫描，不新建登记）: 否决——`_tmp/` 在 projectRoot 下，**跨项目并行 run 各有不同 projectRoot → 互不可见**，无法满足 analysis 目标 #1"跨项目并行均支持"。
   - 备选 b（登记放 `<projectRoot>/.mission-driver/active/`）: 否决——同备选 a 的跨项目不可见问题。
   - 选定（全局，per-user）: 登记目录用 `join(os.homedir(), ".mission-driver", "active")`，**文件名 `<runId>-<driverPid>.json`**（含 driverPid 防同秒 runId 碰撞——runId 仅秒级时间戳无随机，见 Baseline；加 driverPid 后文件永不互相覆盖）。`os.homedir()` 跨平台、跨 reboot 持久。`loadActiveRunIndex` 返回 `runId → [entries]`（同 runId 可能多条），reaper 对某 runId 只要有**任一** entry 的 `isAliveAndOurs` 为真即 spare。
   - 残余风险: homedir 不可写（极端只读环境）→ 登记写失败，reaper 回退到 `_parentIsAliveDriver` 父进程判定（见决策 4），仍保守 spare，不误杀。

3. **reaper 改为"按 run 维度判孤儿"，复用 `isAliveAndOurs`，活跃一律 spare，死才 reap**。
   - 匹配正则升级为 `/\[MISSION_DRIVER(?::([^\]]+))?\]/`（捕获可选 runId）；逐 opencode 进程判定其所属 run 是否活跃：有登记 → `isAliveAndOurs(driverPid, runId, missionName, allProcs)`；无登记/旧标记 → 父进程存活回退判定。
   - 与 `reconcileStaleRuns` 的安全哲学对齐（"无法证明死亡则 spare"，R2 保守回退）。analysis §4.4 伪代码为该逻辑的参考实现。
   - 残余风险: 改变"杀/不杀"语义 → 必须由独立 subagent review + 单测覆盖全部并行场景（受保护区 + 中风险）。

4. **回退判定 `_parentIsAliveDriver`：无法证明死亡则 spare**。
   - 当登记丢失/旧标记无 runId 时，查 opencode 的 ppid 链向上找 driver（cmdline 含 `main.js`），driver 存活 → spare；找不到或无法判定 → spare（保守，镜像 R2）。
   - 选定保守而非激进: reaper 的故障模式里，**误杀活跃 run 的代价（毁掉一次完整 build session）远高于漏杀孤儿**（孤儿占内存，下次 reaper 仍会回收，且 OS 最终会回收）。这与 `isAliveAndOurs` R2 回退一致。
   - 残余风险: 极端情况下漏杀的真孤儿会残留到下一次 run 启动回收（可接受）。

## Goals

- **N 个 mission-driver 可并行**（同项目多 run、跨项目多 run 均支持），任一 run 的 startup reaper 永不误杀另一个活跃 run 正在执行的 opencode 子进程。
- reaper 只清理"拥有进程已确证死亡"的 run 残留；PID 复用安全（复用 `isAliveAndOurs`）。
- 向后兼容：旧标记 `[MISSION_DRIVER]`（无 runId）仍被合理处理（走父进程回退）。
- 复用既有 `runId` / `isAliveAndOurs` 基础设施，最小新增全局状态（仅 active-run 登记文件）。

## Non-Goals

- 不改 `reapProcessGroup`（`executor.js:397,420`，step 退出后的后代清理）——已按 child 树限定，并行安全，无需改动。
- 不改 reaper Phase 2/3（孤儿 MCP server、孤儿 build/test tooling 清理）——它们的判定基于"父进程已死"（ppid=1 或不在进程列表），与本次 run 维度判定无关，且本身已保守。
- 不引入新 npm 依赖（保持引擎零依赖不变式）。
- 不改 `run-reconcile.mjs`（它是被复用的安全范式来源，本身正确）。
- 不改 monitor / 前端 / mission 配置 schema。
- 不重构 `engine.run()` 的多返回点结构（注销走 best-effort + isAliveAndOurs 兜底，无需把 run() 改成单 try/finally）。

## Task Route

- Type: `bug investigation` → `implementation-only change`（根因已由 analysis 确证，本 plan 是修复 + 并行能力增强）
- Owner Docs: `tools/mission-driver/CONTEXT.md`（"关键约束"零依赖 + 故障排查段）、`tools/mission-driver/EXECUTION-PRINCIPLE.md`（如涉及退出码语义——本次不改退出码）
- Skill Selection Basis: 进程清理核心逻辑修复 → `none`（无匹配的可复用 skill；测试复用 `run-reconcile.test.js` 的注入快照模式，非 skill）
- Autonomy: 触及受保护区 `engine.js`（ask-first）+ 进程清理核心逻辑（中风险）→ 必须 plan + 独立 subagent review。**本 plan 仅编写与评审，不含实现授权**；实现须待 plan 升 `active` 后另行执行。

## Infrastructure And Config Prereqs

- 无新端口、无新外部服务、无 secrets、无 .env 改动。
- 登记 homedir 目录在运行时按需 `mkdirSync(recursive:true)`，无需预置。
- 回滚: Phase 1 还原 `runner.js:166` 标记 + 删除 registry 模块 + 还原 engine/main 调用；Phase 2 还原 `reap-orphans.mjs` Phase 1 匹配逻辑；Phase 3 删除新增测试、还原 `prompt-cmdline-limit.test.js`。git revert 即可。

## Execution Plan

### Phase 1 - runId 标记注入 + 活跃 run 登记基础设施

Status: completed
Targets: `src/runner.js:166`（标记格式）、`src/active-run-registry.mjs`（新增，零依赖）、`src/engine.js`（`run()` 入口注册登记）、`src/main.js:777`（finally 注销登记，唯一主落点）、`src/executor.js:351`（heartbeat touch）、`tools/mission-driver/EXECUTION-PRINCIPLE.md:181,182,312`（同步标记格式变更）
Skill: `none`

- Item Types: `Add | Decision | Fix`
- Prereqs: 无

- [x] `Decision`: 确认登记目录 = `join(os.homedir(), ".mission-driver", "active")`（决策 2 已定；homedir 可写，不可写则登记静默失败且不影响 run——由 `active-run-registry.test.js` "swallows unwritable dir failures" 覆盖）。
- [x] `Add`: 新增 `src/active-run-registry.mjs`（零 npm 依赖，仅 `node:fs`/`node:path`/`node:os`），导出：
      - `registerActiveRun({ runId, driverPid, missionName, projectRoot, dir })` → 写 `<dir>/<runId>-<driverPid>.json`（**文件名含 driverPid 防同秒 runId 碰撞**；原子写 tmp+rename + EPERM/EBUSY 重试，镜像 `run-reconcile._renameWithRetry`）
      - `touchActiveRun(runId, driverPid, dir)` → 更新该文件 `heartbeatTs`（best-effort，失败静默；用 driverPid 定位文件以区分同 runId 的并行 run）
      - `unregisterActiveRun(runId, driverPid, dir)` → 删除该文件（best-effort，ENOENT 静默，保证可重复调用幂等）
      - `loadActiveRunIndex(dir?)` → 返回 `Map<runId, ActiveRunEntry[]>`（读目录列表，损坏文件跳过；同 runId 可能多条）
      - 文件形状（结构边界）: `{ runId, driverPid, missionName, projectRoot, startedAt, heartbeatTs }`
- [x] `Add`: `runner.js:166` 标记格式改为 `[MISSION_DRIVER:<runId>]`（runId = `config.runDir ? basename(config.runDir) : null`；无 runDir 时回退无后缀 `[MISSION_DRIVER]`）。`markedPrompt` 与 stdin 都用新标记（runner 现有逻辑只此一处构造 markedPrompt，下游自动跟随）。
- [x] `Add`: `engine.js` `run()` 入口（subflow 守卫内）注册登记：`registerActiveRun({ runId: this.runId, driverPid: process.pid, missionName: this.missionName, projectRoot })`；**仅当 `this.runId && this.missionName` 均非 null 且非 subflow**（missionName 守卫——draft/analyze 路径 missionName=null 不登记，避免 reaper 对 null missionName 调 isAliveAndOurs 误杀，见 Baseline 身份事实）。
- [x] `Add`: 注销登记 **唯一主落点** = `main.js:777` finally 中 `unregisterActiveRun(basename(config.runDir), process.pid)`（best-effort，捕获 ENOENT）。**不**把注销散布到 engine.run() 的 25 个 `_result` 返回点（与非目标 #6 冲突且易漏）；崩溃残留由 `isAliveAndOurs` 兜底回收（安全性质已论证）。
- [x] `Decision`: 心跳刷新落点 —— executor heartbeat（`executor.js:351` sysSnapshot 邻近）`touchActiveRun(basename(config.runDir), process.pid)`，与既有 5min 心跳同频；config 在 executor 可见 runId；备选（每 step 开始刷新）否决因 executor 已有心跳节流。
- [x] `Fix(doc)`: `tools/mission-driver/EXECUTION-PRINCIPLE.md:181,182`（序列图 markedPrompt/args）+ `:312`（"加 `[MISSION_DRIVER]` 前缀"）同步为 `[MISSION_DRIVER:<runId>]` 形式，附注 tag 现携带 run 身份用于并行安全。

Exit Criteria:

- [x] `[MISSION_DRIVER:<runId>]` 标记出现在 spawn 的 opencode cmdline；无 runDir 时回退 `[MISSION_DRIVER]`（runner.js + prompt-cmdline-limit.test.js 验证）。
- [x] active-run 登记文件在 run 启动时创建（仅 runId+missionName 均非 null）、收尾时删除；崩溃残留可被 `isAliveAndOurs` 识别为死 run（reap-orphans.test.js 场景 3）。
- [x] 登记文件名含 driverPid，同秒启动两个 mission 不互相覆盖文件（active-run-registry.test.js "driverPid suffix prevents same-runId file collision"）。
- [x] 零 npm 依赖不变式保持（`active-run-registry.mjs` 仅 import `node:fs`/`node:path`/`node:os`）。
- [x] `EXECUTION-PRINCIPLE.md:181,182,312` 标记格式与新实现一致。
- [x] `prompt-cmdline-limit.test.js` 同步更新，不回归（Phase 3 全绿）。
- [x] `docs/logs/` 更新。

### Phase 2 - Reaper Phase 1 改为 run 维度孤儿判定（核心安全修复）

Status: completed
Targets: `src/reap-orphans.mjs`（`reapStartupOrphans` 签名扩展 + Phase 1 判定重写 + `_parentIsAliveDriver`）、`src/engine.js:1465`（`_warnOrphans` 传 ownRunId）
Skill: `none`

- Item Types: `Fix | Decision`
- Prereqs: Phase 1（标记带 runId + 登记可读，reaper 才有判定依据）

- [x] `Fix`: `reapStartupOrphans` 签名扩展为 `reapStartupOrphans(runDir, excludePpid, procs, opts)`，`opts = { ownRunId, registryDir, projectRoot }`，全部参数带默认值（旧 CLI 调用 `reap-orphans.mjs --startup` 不传 opts 仍可跑，走父进程回退）。导入 `isAliveAndOurs` + `loadActiveRunIndex`。
- [x] `Fix`: Phase 1 判定重写:
      - 匹配正则 → `/\[MISSION_DRIVER(?::([^\]]+))?\]/` + `/opencode\s+run\b/`，捕获可选 runId。
      - 自身保护: `procRunId === opts.ownRunId` 或 `p.ppid === excludePpid` → 跳过。
      - 活跃判定: 登记中查 `runId`（可能多条）→ 对**任一** entry 调 `isAliveAndOurs(entry.driverPid, runId, entry.missionName, allProcs)`，**任一为真即 spare**（注：身份匹配依赖 entry.missionName，因 driver cmdline 不含 runId，见 Baseline）；有 runId 但登记无 entry → `_parentIsAliveDriver(p, allProcs)`；旧标记无 runId → `_parentIsAliveDriver(p, allProcs)`。
      - 活跃 → `process.stderr.write` 记 `sparing … active concurrent run <runId|legacy>` 并跳过；确证死亡 → 沿用 `_getDescendants`/group-kill 杀后代 + 杀自身，reason 改 `orphaned mission-driver opencode (dead run <runId|legacy>)`。
- [x] `Add`: `_parentIsAliveDriver(p, procs)` 内部 helper —— 沿 ppid 链向上找 cmdline 含 `main.js` 的 driver，存在且存活 → true；祖先死亡/init 收养/链耗尽 → false；存活但 cmdline 不可得 → true（保守 spare，R2）。此回退覆盖：登记丢失、homedir 不可写、旧标记、missionName=null 未登记的 run。
- [x] `Fix`: `engine.js` `_warnOrphans` 传入 `ownRunId: this.runId`（registryDir 走 `loadActiveRunIndex` 默认 homedir 常量，无需显式传）。
- [x] `Decision`: Phase 2/3（MCP server / build tooling 孤儿清理）不改 —— 它们判定基于"父进程已死"，与 run 维度正交，且已保守。理由：避免 scope 蔓延 + 不引入新风险。

Exit Criteria:

- [x] 两个活跃 run 并存：后启动 run 的 reaper spare 先启动 run 的 opencode（日志出现 `sparing … active concurrent run <runIdA>`）—— reap-orphans.test.js 场景 2 验证（stderr 断言 `sparing PID … runA`）。
- [x] 崩溃 run 残留（**登记已 seed 的场景**）：新 run 的 reaper 回收其 opencode + 后代（reason 含 `dead run`）—— 场景 3 验证。
- [x] PID 复用：`isAliveAndOurs` 因 cmdline 不匹配返回 false → 按孤儿处理，且不误判无关进程为"我们的"—— 场景 4 验证（断言测试进程 process.pid 未被杀）。
- [x] 旧标记无 runId：走父进程回退，父存活则 spare —— 场景 5 验证。
- [x] `reap-orphans.mjs --startup` CLI 模式（无 opts）不崩溃，走回退分支 —— CLI 回归 exit=0 + 场景 "CLI mode" 验证。
- [x] `docs/logs/` 更新。

### Phase 3 - 测试 + 受影响测试更新 + 验证

Status: completed
Targets: `test/reap-orphans.test.js`（新增）、`test/active-run-registry.test.js`（新增）、`test/prompt-cmdline-limit.test.js`（更新断言）
Skill: `none`

- Item Types: `Add | Fix | Proof`
- Prereqs: Phase 1 + Phase 2

- [x] `Add`: `test/active-run-registry.test.js`（`node --test`，注入临时 homedir，镜像 `run-reconcile.test.js` 的 `withProjectRoot` 模式）—— register/unregister/touch/loadActiveRunIndex、原子写、损坏文件跳过、homedir 不可写静默失败、driverPid 防碰撞、ENOENT 幂等（18 用例全绿）。
- [x] `Add`: `test/reap-orphans.test.js`（注入 `processes` 快照 + 临时 registryDir）—— 覆盖 analysis §5 全部 6 场景 + CLI 回退。**driver cmdline mock 写实**：missionName 出现、runId **不出现**（镜像真实 `node main.js <missionName> ...`，runId 在内部生成）—— 否则 isAliveAndOurs 会因错误原因通过、掩盖 missionName 依赖（评审 C2）。
      1. 单 run 无孤儿 → 不杀 ✓
      2. 两 run 并行（A 长步在跑，B 后启动）→ B spare A（`sparing` 日志 + A 标记进程存活）✓
      3. run 崩溃后新 run 启动（**登记已 seed**）→ 回收崩溃 run 的 opencode（`dead run` reason）✓
      4. PID 复用（driverPid 被无关进程占用，cmdline 不含 main.js/missionName）→ `isAliveAndOurs` false → 按孤儿处理 ✓
      5. 旧式无 runId 标记 → 父进程回退，父存活则 spare；父死则 reap ✓
      6. 无登记/登记丢失 → 父进程判定，无法证明死亡则 spare；父死则 reap ✓
- [x] `Fix`: `test/prompt-cmdline-limit.test.js:47,50,82,83` —— 断言改为显式算 `basename(runDir)` 拼 `[MISSION_DRIVER:<runId>]`（两处 stdin 断言 + 长度断言同步）。
- [x] `Proof`: `pnpm --prefix tools/mission-driver test` —— **全绿 593 pass / 0 fail**（基线 07-27 记录的 5 个 PRE-EXISTING 环境相关 fail 在当前环境已为 0；无新增回归）+ `node tools/mission-driver/src/reap-orphans.mjs --startup _tmp <PID>` CLI exit=0 不崩溃。
- [x] `Proof`: 手动并行实跑验证 —— **verification scope limited**：以 reap-orphans.test.js 场景 2 的注入快照单测为代理证据（断言 `sparing PID … active concurrent run runA` + killed=0）；同项目双 mission 实跑留待人工（环境需同时启两个长 step mission，单测已等价覆盖判定逻辑）。

Exit Criteria:

- [x] 新增两测试文件全绿，覆盖 analysis §5 全部 6 场景。
- [x] `prompt-cmdline-limit.test.js` 断言与新标记格式一致，不回归。
- [x] `pnpm --prefix tools/mission-driver test` 无新增 fail（593 pass / 0 fail；基线 5 个 PRE-EXISTING fail 在当前环境已消除）。
- [x] CLI `--startup` 模式回归通过（exit=0）。
- [x] `docs/logs/` 更新。

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（independent fresh subagent `ses_0532d756cffeIZKtTmRML3mEP5`，2026-07-29）—— 3 个 blocker + 1 个矛盾全部已修订:
  1. **B1 runId 全局唯一性失实**: runDir 生成（`config.js:649-657`）仅秒级时间戳无随机，同秒启动 runId 碰撞 → 原"无写竞争"断言错误。**已改**: 登记文件名改为 `<runId>-<driverPid>.json`（含 driverPid 防覆盖）；`loadActiveRunIndex` 返回 `runId -> [entries]`，reaper 对同 runId 任一 entry alive 即 spare；Baseline 补 runId 生成事实。
  2. **B2 missionName=null 误杀（核心安全洞）**: driver cmdline 不含 runId，`isAliveAndOurs` 身份匹配实际依赖 missionName；draft/analyze 路径 `missionName: null`（`config.js:500,534`）若登记则 reaper 对 null 调 isAliveAndOurs 恒 false → 误杀活跃 run（正是本 plan 要消除的伤害）。**已改**: Phase 1 注册加 `this.runId && this.missionName` 均非 null 守卫；draft/analyze 落到 `_parentIsAliveDriver` 保守回退；Baseline 补身份事实；Decision 1 备选 b 理由更正（runId 定位登记项，missionName 确认 driver 身份）。
  3. **B3 EXECUTION-PRINCIPLE.md 标记契约漂移**: `:181,182,312` 记录 `[MISSION_DRIVER]` spawn 契约，tag 变更会漂移，原 doc-alignment scope 漏。**已改**: Phase 1 Targets 加 `EXECUTION-PRINCIPLE.md:181,182,312` + `Fix(doc)` item；Closure Gates 同步。
  - 矛盾 C1（engine 注销散布 25 返回点 vs 非目标 #6）: **已改** —— 注销唯一主落点 = `main.js:777` finally，不散布到 engine；崩溃由 isAliveAndOurs 兜底。
  - 非阻塞 C2（测试 driver cmdline 须写实）已并入 Phase 3；C3（崩溃 reap 须 seed 登记）已并入 Exit Criteria 措辞。
  - Baseline 纠正 BC1（注释行 135-138）已采纳。
  - 待 iteration 2 复核修订后是否引入新矛盾（尤其 missionName 守卫 + 多 entry lookup 的正确性）。
- Independent draft review iteration 2: `accept`（independent fresh subagent `ses_05324ce22ffeX8ANmQBycUvSYJ`，2026-07-29）—— B1/B2/B3/C1 全部确认 `resolved`（逐项对源码核实：`config.js:649-657` 时间戳 runId、`config.js:500/534/558` + `run-reconcile.mjs:73-77` null-missionName 误杀路径与守卫修复、`EXECUTION-PRINCIPLE.md:181/182/312` doc target、`main.js:777` 单一注销点）。新矛盾检查全空：多 entry lookup 唯一边界是"同秒碰撞 + 中途崩溃"的瞬态漏杀（leak 非误杀，自愈，与 Decision 4 一致，已并入 Deferred But Adjudicated）；missionName 守卫与幂等注销安全交互；touchActiveRun(runId,driverPid) 签名 executor 可满足；Decision/Phase/Exit/Closure 文本一致无残留旧措辞。Anti-slacking、Rule 14（确认缺陷未降级）、文本/checkbox 一致性均干净。Plan 升 `active`。

## Closure Gates

- [x] in-scope behavior is complete（三 Phase 全部 Exit Criteria 勾选）
- [x] relevant docs are aligned（`tools/mission-driver/CONTEXT.md` 故障排查段加并行安全说明；`tools/mission-driver/EXECUTION-PRINCIPLE.md:181,182,312` spawn 标记格式同步；analysis §6 建议"独立 plan + subagent review"已落实）
- [x] verification has run: `pnpm --prefix tools/mission-driver test` → 593 pass / 0 fail + `prompt-check: OK`；新增 reaper/registry 单测全绿；`node src/reap-orphans.mjs --startup _tmp <PID>` exit=0
- [x] scoped verification is not conflated with full verification —— 手动双 mission 并行实跑 = `verification scope limited`，以 `reap-orphans.test.js` 场景 2 注入快照（断言 `sparing PID … active concurrent run runA` + killed=0）为代理证据；其余为完整 `pnpm test`
- [x] no in-scope item downgraded to deferred/follow-up（本 plan 是确认的 live defect 修复，Rule 14 不可降级）
- [x] independent draft review completed and recorded（iter 1 `ses_0532d756…` needs revision → 3 blocker 全修；iter 2 `ses_05324ce2…` accept）
- [x] text consistency verified: status, phases, gates, and log all agree（closure audit 初判唯一矛盾 = 日志缺实现条目，已补 `docs/logs/2026/07-29.md` 修复）
- [x] closure audit was independent（`ses_05316f5fcffeOEDwJ3quOmSpC5`，非 solo fallback——触及受保护区 engine.js + 进程清理核心）
- [x] closure evidence exists in files（test 输出 593/0 + CLI exit=0 + `docs/logs/2026/07-29.md` 实现条目 + closure audit task 记录）

## Deferred But Adjudicated

### 同秒 runId 碰撞的瞬态漏杀（leak，非误杀）

- Classification: `watch-only residual`
- Why Not Blocking Closure: 仅当"同秒启动两个 mission（runId 碰撞）+ 其中一个在 step 中途崩溃 + 另一个仍活跃"三重罕见条件同时成立时，reaper 因"同 runId 任一 entry alive 即 spare"会暂时漏杀崩溃 run 的孤儿 opencode。这是**漏杀（leak）非误杀（mis-kill）**，不违反本 plan Goal"永不误杀活跃 run"；且自愈——另一 run 退出后下次 reaper 见两 entry 均死即回收。与 Decision 4"误杀代价远高于漏杀"一致。
- Successor Required: `no` —— 若未来 runId 生成加入随机分量消除碰撞，此 leak 自然消失。

### 跨 reboot 的登记清理 / GC

- Classification: `optimization candidate`
- Why Not Blocking Closure: 崩溃 run 的残留登记文件无害——下次任一 run 启动时，reaper 对该登记项调 `isAliveAndOurs(driverPid,...)`，driverPid 已死（或被复用、cmdline 不匹配）→ 判死 → 回收，登记文件可由 reaper 顺手删除或保留忽略。不构成正确性风险。
- Successor Required: `no` —— 仅当登记目录积累到数百文件影响 readdir 性能时才需 GC；触发条件 unlikely（每 run 一文件，正常退出即删）。

### Phase 2/3（MCP / build tooling 孤儿清理）的 run 维度统一

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 它们判定基于"父进程已死（ppid=1 或不在进程列表）"，与 run 维度正交，且已保守（不会误杀活跃 run 的子进程，因为活跃 run 的 MCP/tooling 父进程仍存活）。本次修复的核心误杀路径是 Phase 1。
- Successor Required: `no` —— 仅当未来发现 Phase 2/3 也产生并行误杀时才重新评估。

## Closure

Status Note: 三 Phase 全部实现并经独立 closure audit。核心安全修复（reaper 永不误杀活跃并行 run）落地——spawn opencode 带 runId 标记 + 全局 active-run 登记 + `isAliveAndOurs` 判活 + 保守父进程回退。复用既有 `runId`/`isAliveAndOurs`/`reconcileStaleRuns` 安全范式，最小新增全局状态。受保护区 `engine.js` 改动仅限 run() 入口注册 + `_warnOrphans` 传参（未碰 `_result`/`_wfClose`/`_executeSubflowStep` 核心）；零 npm 依赖不变式保持。closure audit 初判唯一阻塞 = 日志缺实现条目，已修复后闭环。

Closure Audit Evidence:

- Auditor / Agent: independent subagent `ses_05316f5fcffeOEDwJ3quOmSpC5`（2026-07-29）
- Evidence: 行为完整性 5/5 PASS（runner 标记 / reaper spare / `_parentIsAliveDriver` 保守回退 / missionName 守卫 / 单一注销点幂等——均 diff + 测试核实）；退出标准除日志条目外全部 PASS（日志条目已补，现在全 PASS）；受保护区 + 零依赖不变式 + spawn 契约向后兼容均 HELD；rule-12 grep 不变量 clean；grep `MISSION_DRIVER` 无遗漏硬编码源（唯一 bare-tag 字面量是 runner.js 故意保留的 legacy 回退）；`pnpm --prefix tools/mission-driver test` 实跑 593 pass / 0 fail + `prompt-check: OK`；CLI `--startup` exit=0。初判 `do-not-close`（日志 rule-11 不一致），补日志条目后 `close`。

Follow-up:

- 手动双 mission 并行实跑（同项目 A 跑长 step + B 后启动，确认 B 日志 `sparing … active concurrent run <runIdA>` 且 A 正常完成）——当前以注入快照单测为代理，留待人工环境实跑确认（非阻塞，单测已等价覆盖判定逻辑）。
