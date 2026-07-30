# Mission-Driver Reaper 误杀分析与并行运行支持方案

> 分析日期：2026-07-29
> 分析范围：mission-driver 启动期 reaper（`reap-orphans.mjs`）误杀并发 run 的 opencode 子进程问题
> 分析性质：纯分析文档，不含代码实现（实现由后续任务承接）
> 触发事件：build session `ses_0536a6b51ffekIITJRiCr7JUf0` 在执行 `pnpm test` 时被 `[reaper]` 强杀
> 目标诉求：**支持多个 mission-driver 并行运行**，而非当前隐含的"全局唯一 run"假设

## 概要

| 维度 | 结论 |
|------|------|
| 故障性质 | **非任务逻辑失败**：build agent 工作正确，被外部 reaper 进程中途强杀 |
| 直接原因 | 另一个 mission-driver run 启动时，其 startup reaper 把当前仍在跑的 opencode step 子进程当作"上次崩溃 run 的残留"杀掉 |
| 根因 | `reapStartupOrphans` Phase 1 用**全局标记 `[MISSION_DRIVER]` + `opencode run`** 匹配，排除条件仅 `p.ppid !== process.pid`，依赖"整机同一时刻只有一个 mission-driver"的假设 |
| 设计矛盾 | 同仓库已有 **runId 身份 + PID 复用安全的存活判定 `isAliveAndOurs` + `reconcileStaleRuns`**（明确"保护共存的活跃 mission"），唯独 reaper 没有复用，是唯一的例外 |
| 修复方向 | 给 spawn 的 opencode 打上 **runId 标记**，reaper 改为 **run 维度的孤儿判定**（复用 `isAliveAndOurs` + 活跃 run 登记），只清理"拥有进程已死"的 run，永不误杀活跃的并行 run |
| 并行支持 | 方案落地后支持 N 个 mission-driver 并行（同项目 / 跨项目均可） |

---

## 1. 故障现象（证据链）

被杀 session 的 DB 取证（opencode 本地库 `opencode.db`，只读）：

1. **最后一条助手消息异常**：`msg_fac97938d001`（14:37:22）token 全为 0、无 `finish`、无 `time.completed` —— 模型调用未正常结束。
2. **最后一个工具调用卡死**：`bash` 执行 `pnpm --prefix tools/mission-driver test`，`$.state.status = "running"`，有 `time.start` 但**无 `time.end`**。该 session 共 12 个工具调用，11 个 completed，唯独此 running。
3. **reaper 杀进程记录**（出现在该 bash 输出流中）：
   ```
   [sysmon] 7/29/2026, 14:38:10 load=0 free=12.7GB/12.7GB totalRSS=19.9GB oc=2915.5MB(5) node=2226.2MB(21) ...
   [reaper] killing PID 18616 RSS=8MB  ppid=23076 — descendant of mission-driver opencode PID 23076
   [reaper] killing PID 23148 RSS=12MB ppid=23076 — descendant of mission-driver opencode PID 23076
   [reaper] killing PID 6796  RSS=8MB  ppid=18616 — descendant of mission-driver opencode PID 23076
   [reaper] killing PID 34512 RSS=149MB ppid=18616 — descendant of mission-driver opencode PID 23076
   [reaper] killing PID 33576 RSS=8MB  ppid=23148 — descendant of mission-driver opencode PID 23076
   [reaper] killing PID 23076 RSS=638MB ppid=28500 — mission-driver opencode run (previous crashed run)
   ```

**时间线**：

| 时间 | 事件 |
|---|---|
| 14:35:11 | session 启动（build agent / glm-5.2，项目 `attractor-guided-engineering-template`） |
| 14:35–14:37 | 前 6 轮正常：`git status` / `git log` / `git diff` / 读 roadmap / 列 plans 目录，全部 completed |
| 14:37:22 | 第 7 轮发起 `pnpm --prefix tools/mission-driver test`（测试用例在通过中） |
| ~14:38:13 | bash 测试开始执行 |
| 14:38:10 | **另一个 mission-driver run 的 startup reaper 触发，强杀 PID 23076（本 session 的 opencode 宿主）及其全部后代** → session 终止 |

> PID 23076 = 承载本 session 的 `opencode run` 进程，父进程 PID 28500（spawn 它的 mission-driver node 进程）。`[sysmon]` 行只是只读资源快照（`sys-snapshot.mjs`），不杀人；真正的杀手是紧随其后的 `[reaper]`。两者共用同一份 `getAllProcesses()` 快照，所以日志总是一起出现（`engine.js:1451`）。

---

## 2. Reaper 是什么 / 作用 / 谁启动（源码溯源）

**身份**：mission-driver 内部的进程清理模块 `src/reap-orphans.mjs`。不是独立守护进程，而是 engine 自带的安全逻辑。`[reaper]` 前缀来自该模块往 `process.stderr` 写的日志。

**两个导出函数**：

| 函数 | 触发点 | 作用 | 并行安全性 |
|---|---|---|---|
| `reapStartupOrphans` | 每次 engine `run()` 开头（`engine.js:1470-1473`） | 扫描全系统进程，杀"上次崩溃 run 残留"的 opencode / MCP / 构建工具 | **不安全（本次故障根因）** |
| `reapProcessGroup` | 每个 step 子进程退出后（`executor.js:397,420`） | 只杀该子进程自己遗留的后代（按 PID 树范围） | 安全（已按 child 树限定） |

**启动者**：`engine.js` 的 `_warnOrphans()` 在 `engine.run()` 入口调用 `reapStartupOrphans`，子流程跳过（`cfg.isSubflow !== true`）。即每个**顶层** mission-driver run 启动时都会跑一次。

---

## 3. 根因分析

### 3.1 杀进程的判定逻辑（`reap-orphans.mjs:164-191`）

```js
const ocPattern = /opencode\s+run\b/;
const missionDriverPattern = /\[MISSION_DRIVER\]/;
const ocProcs = allProcs.filter(
  (p) =>
    ocPattern.test(p.cmd) &&
    missionDriverPattern.test(p.cmd) &&
    p.ppid !== excludePpid          // excludePpid = process.pid（当前 run 自己）
);
// 对每个命中项：杀后代 + 杀自身，reason: "mission-driver opencode run (previous crashed run)"
```

mission-driver 每跑一个 step，由 `runner.js:166` 给 prompt 加 `[MISSION_DRIVER]` 标记后 spawn `opencode run ... [MISSION_DRIVER] <prompt>`，reaper 正是凭这个全局标记识别。

### 3.2 致命假设（`reap-orphans.mjs:133-138` 注释原文）

> *"Combined with the constraint that **only ONE mission-driver runs at a time**, any matching process at startup is definitively from a previous crashed run."*

代码把"整机同一时刻只有一个 mission-driver"当成不变量。排除保护 `p.ppid !== excludePpid`（`excludePpid = process.pid`，见 `engine.js:1465`）**只能保护当前 run 自己 spawn 的 opencode**，对另一个并行 run 的 opencode 毫无防护。

### 3.3 误杀还原

1. run-A（mission-driver node PID **28500**）spawn 了 `opencode run [MISSION_DRIVER] …` = **PID 23076**，跑本次 build session。
2. 23076 正在执行耗时的 `pnpm test`。
3. 此时 **run-B 启动**（新的 mission-driver node 进程，PID ≠ 28500）。
4. run-B 的 `engine.run()` 入口 → `_warnOrphans()` → 扫描进程，命中 23076：
   - cmd 含 `opencode run` + `[MISSION_DRIVER]` ✓
   - ppid `28500` ≠ run-B 的 `process.pid` ✓
   - → 判定为"上次崩溃 run 的残留"，SIGTERM → 5s 宽限 → SIGKILL，并连带杀后代（`pnpm test` 的 node 进程）。
5. 日志中 `killing PID 23076 … — mission-driver opencode run (previous crashed run)` 即此步（对应 `reap-orphans.mjs:190`）。

**本质**：reaper 无法区分"崩溃 run 的残留"与"另一个活跃 run 正在跑的合法 step"。时间重叠（并发或前一 run 的 step 尚未结束就启动下一个）即触发误杀。

### 3.4 设计矛盾：现成本可避免，却被绕过

同仓库已存在成熟的"run 身份 + 存活判定"机制，**唯独 reaper 没用**：

| 已有能力 | 位置 | 说明 |
|---|---|---|
| runId（= `basename(runDir)`） | `engine.js:1407`、`executor.js:186`、`monitor.js:1201` | 每个 run 的唯一身份，已写入事件与 run-state |
| `isAliveAndOurs(pid, runId, missionName, procs)` | `run-reconcile.mjs:61` | **PID 复用安全**的存活判定：`isAlive(pid)` 且 cmdline 含 `main.js` + (runId 或 missionName) |
| `reconcileStaleRuns(projectRoot, procs)` | `run-reconcile.mjs:131` | 扫 `_tmp/*/run-state.json`，**注释明确"protects coexisting active missions"**（`run-reconcile.mjs:10-12`） |

`reconcileStaleRuns` 的判定逻辑正是本次 reaper 应有却没有的：**有 pid 且 `isAliveAndOurs` 为真 → 跳过（绝不伤害活跃 run）；pid 死亡/被复用 → 才清理**（`run-reconcile.mjs:162-168`）。reaper 走的是更粗暴的全局标记匹配，与本模块的安全哲学直接冲突。

---

## 4. 解决方案：支持并行 mission-driver

### 4.1 设计目标

1. **N 个 mission-driver 可并行**（同项目多 run、跨项目多 run 均支持）。
2. reaper **只清理"拥有进程已确证死亡"的 run**，对任何活跃 run（含并行的兄弟 run）零伤害。
3. **PID 复用安全**（Windows 上 PID 回收是真实风险）——复用 `isAliveAndOurs`，不依赖裸 ppid。
4. **向后兼容**：旧标记 `[MISSION_DRIVER]`（无 runId）仍能被合理处理。
5. 复用既有 `runId` / `isAliveAndOurs` / `run-state.json` 基础设施，最小新增全局状态。

### 4.2 总体思路

把 reaper 从"**按全局标记**无差别清理"升级为"**按 run 维度**判孤儿"：

- 给每个 spawn 的 opencode **打上 runId 标记** → reaper 能从进程命令行直接读出它属于哪个 run。
- 维护一份**活跃 run 登记**（runId → 拥有进程 pid/missionName/心跳），reaper 据此判断该 run 是否还活着。
- 复用 `isAliveAndOurs` 做 PID 复用安全的存活判定；活跃 run 一律 spare，死 run 才 reap。
- 保留 `excludePpid = process.pid` 作为兜底自保护。

### 4.3 具体改动

| # | 文件 | 改动 | 说明 |
|---|------|------|------|
| 1 | `runner.js:166` | `[MISSION_DRIVER]` → `[MISSION_DRIVER:<runId>]`（runId 取 `basename(config.runDir)`；无 runDir 时回退无后缀旧标记） | 让 opencode 子进程的命令行携带 run 身份；`platform.mjs` Windows CIM 与 Unix `ps` 都能拿到完整 cmd，标记可被正则捕获 |
| 2 | `reap-orphans.mjs:148` `reapStartupOrphans` | 签名扩展：`reapStartupOrphans(runDir, excludePpid, procs, opts)`，`opts = { ownRunId, registryDir, projectRoot }` | 把当前 run 身份与活跃 run 登记传入 |
| 3 | `reap-orphans.mjs:164-191` Phase 1 | 匹配正则改为 `/\[MISSION_DRIVER(?::([^\]]+))?\]/`（捕获可选 runId）；逐进程做"该 run 是否活跃"判定（见 4.4 伪代码） | 杀之前先证明 run 已死；活跃则 spare |
| 4 | `engine.js:1463-1465` `_warnOrphans` | 传入 `ownRunId: this.runId` 与登记目录；在 `engine.run()` 成功收尾 / 异常退出时注销自身登记 | 与 run 生命周期绑定 |
| 5 | 新增（或复用）活跃 run 登记 | engine 启动写 `<registryDir>/active/<runId>.json` = `{ runId, driverPid: process.pid, missionName, projectRoot, startedAt, heartbeatTs }`；每 step 心跳更新 `heartbeatTs`；正常结束删除文件 | 登记是 run 维度判孤儿的依据；跨项目并行也可用（登记目录与项目无关） |

> 登记目录建议复用工具既有 data root（若无，可用 `~/.local/share/mission-driver/active/<runId>.json`）。每个 run 只写自己的文件，无写竞争；读取目录列表安全。心跳可复用 executor 既有的 heartbeat 机制（`executor.js:305-361`）顺手刷新 `heartbeatTs`。

### 4.4 新 Phase 1 判定伪代码

```js
const TAG_RE = /\[MISSION_DRIVER(?::([^\]]+))?\]/;
const OC_RE  = /opencode\s+run\b/;

// 一次性构建 runId -> 登记项 映射（来自 active/ 目录）
const active = loadActiveRunIndex(opts.registryDir);   // { runId -> {driverPid, missionName, ...} }

for (const p of allProcs) {
  if (!OC_RE.test(p.cmd)) continue;
  const m = p.cmd.match(TAG_RE);
  if (!m) continue;
  const procRunId = m[1] || null;                        // 旧标记 → null

  // (a) 自身保护
  if (procRunId && procRunId === opts.ownRunId) continue;
  if (p.ppid === excludePpid) continue;

  // (b) 判定该 run 是否活跃
  let alive = false;
  if (procRunId && active[procRunId]) {
    const { driverPid, missionName } = active[procRunId];
    alive = isAliveAndOurs(driverPid, procRunId, missionName, allProcs);  // PID 复用安全
  } else if (procRunId) {
    // 有 runId 但无登记 → 可能正常收尾已注销，或登记丢失；回退到"父进程是否存活且是本工具 main.js"
    alive = _parentIsAliveDriver(p, allProcs);
  } else {
    // 旧式无 runId 标记：保守按父进程存活判定
    alive = _parentIsAliveDriver(p, allProcs);
  }

  if (alive) {
    log(`[reaper] sparing PID ${p.pid} — active concurrent run ${procRunId || "<legacy>"}`);
    continue;                                            // ★ 活跃 run，绝不杀
  }

  // (c) 确证死亡 → 杀后代 + 杀自身（沿用现有 _killOne / _getDescendants）
  killTree(p, allProcs, `orphaned mission-driver opencode (dead run ${procRunId || "<legacy>"})`);
}
```

`_parentIsAliveDriver(p, procs)` 回退逻辑：查 `p.ppid` 是否存活、cmdline 是否含 `main.js` + runId/missionName；**无法判定时一律 spare**（与 `isAliveAndOurs` 的 R2 保守回退一致：宁可漏杀孤儿，绝不误杀活跃 run，见 `run-reconcile.mjs:69-71`）。

### 4.5 并行安全性论证

- **两个活跃 run 并存**：run-B 启动时，run-A 的 opencode 标记为 `[MISSION_DRIVER:<runIdA>]`；run-B 在 active 登记里找到 runIdA 且 `isAliveAndOurs(driverPidA,…)` 为真 → spare。run-A 对 run-B 同理。互不伤害。
- **run 崩溃后**：登记文件残留，但 `isAliveAndOurs` 因 driverPid 已死（或被复用、cmdline 不匹配）返回 false → 判为孤儿 → 清理。下一次任意 run 启动都会回收。
- **PID 复用**：`isAliveAndOurs` 二段校验（存活 + cmdline 含 `main.js` + runId/missionName），复用 PID 的无关进程不匹配 → 判死 → 安全清理（`run-reconcile.mjs:42-46`）。
- **登记丢失/旧标记**：回退到父进程存活判定，且"无法证明死亡则 spare"，保证不误杀。
- **跨项目并行**：登记目录与 projectRoot 无关，全局唯一索引 runId，天然支持。

### 4.6 向后兼容

- 正则 `/\[MISSION_DRIVER(?::([^\]]+))?\]/` 同时匹配新旧标记；旧 `[MISSION_DRIVER]` 走父进程回退分支。
- `reapStartupOrphans` 新增参数均带默认值，旧调用方（含 `reap-orphans.mjs` CLI 模式）不受影响。
- `reapProcessGroup`（`executor.js`）已按 child 树限定，**无需改动**。

---

## 5. 测试方案

| 场景 | 期望 |
|---|---|
| 单 run 正常运行 | reaper 启动时无孤儿，不杀任何进程 |
| 两个 run 并行（A 先启动长 step，B 后启动） | B 的 reaper spare A 的 opencode（日志出现 `sparing … active concurrent run <runIdA>`）；A 正常完成 |
| run 崩溃后启动新 run | 新 run 的 reaper 回收崩溃 run 的 opencode + 后代（reason 含 `dead run`） |
| PID 复用（模拟 driverPid 被无关进程占用） | `isAliveAndOurs` 返回 false → 按孤儿处理；且不误判无关进程为"我们的" |
| 旧式无 runId 标记 | 走父进程回退，父存活则 spare |
| 无 run-state / 登记丢失 | 回退到父进程判定；无法证明死亡则 spare（保守） |

> 优先复用 `run-reconcile.mjs` 的测试模式（注入 `processes` 快照、注入临时目录），保持单测零外部依赖。新增 `reap-orphans` 的活跃 run 登记 / spare 逻辑单测。

---

## 6. 受保护区影响

| 改动 | 受保护区 | 风险 | 处置 |
|---|---|---|---|
| `runner.js` 标记格式 | spawn 契约（标记进入 opencode prompt/cmd） | 低 | 标记向后兼容；需确认下游没有任何地方硬编码精确字符串 `[MISSION_DRIVER]`（grep 已确认仅 reaper 匹配） |
| `reap-orphans.mjs` Phase 1 | 进程清理核心逻辑 | 中 | 改变"杀/不杀"语义，需 plan + review + 单测覆盖并行场景 |
| `engine.js` `_warnOrphans` 调用 | engine 入口 | 低 | 仅传参，行为由 reaper 内部决定 |
| 活跃 run 登记 | 新增全局状态 | 低-中 | 需定义目录、生命周期（写/心跳/删）、异常退出兜底（靠 `isAliveAndOurs` + 心跳超时回收） |

建议作为独立 plan 推进，含 subagent review（触及进程清理与 spawn 契约两个受保护区）。

---

## 7. 附录：关键代码引用

| 主题 | 文件:行号 | 说明 |
|---|---|---|
| 标记注入点 | `runner.js:166` | `[MISSION_DRIVER] ${prompt}`，待改为带 runId |
| reaper 启动调用 | `engine.js:1463-1473` | `_warnOrphans()` → `reapStartupOrphans(_runDir, process.pid, …)` |
| 致命假设（注释） | `reap-orphans.mjs:133-138` | "only ONE mission-driver runs at a time" |
| Phase 1 匹配+排除 | `reap-orphans.mjs:164-191` | 全局标记匹配，仅 `p.ppid !== excludePpid` |
| 杀进程 reason 字符串 | `reap-orphans.mjs:190` | 与故障日志完全一致的 "previous crashed run" |
| runId 定义 | `engine.js:1407` / `executor.js:186` / `monitor.js:1201` | `runId = basename(runDir)` |
| PID 复用安全判定 | `run-reconcile.mjs:61` `isAliveAndOurs` | 存活 + cmdline 含 main.js + runId/missionName |
| 并行安全清理范式 | `run-reconcile.mjs:10-12, 162-168` | "protects coexisting active missions"；有 pid 且 alive → 跳过 |
| sysmon 只读快照 | `sys-snapshot.mjs:248-254` | `[sysmon]` 仅日志，不杀人；与 reaper 共享 `getAllProcesses()` |
| 进程枚举形状 | `platform.mjs:63` | `{pid,ppid,pgid,rss_kb,name,cmd}`；Windows cmd 为完整命令行 |
| step 后代清理（无需改） | `executor.js:397,420` `reapProcessGroup` | 已按 child 树限定，并行安全 |
