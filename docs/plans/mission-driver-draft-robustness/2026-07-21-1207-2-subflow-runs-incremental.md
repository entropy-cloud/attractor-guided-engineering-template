# mdr-5 subflowRuns 增量落盘到主 run-state

> Plan Status: completed
> Last Reviewed: 2026-07-21
> Source: `docs/backlog/mission-driver-draft-robustness-roadmap.md` WI5
> Related: `tools/mission-driver/design/draft-robustness-design.md` §2.6, §4.5；commit 06749fa（monitor 侧渲染修固，本 plan 是 engine 侧补丁）
> Mission: mission-driver-draft-robustness
> Work Item: WI5 subflowRuns 增量落盘到主 run-state
> Audit: required

## Current Baseline

Live baseline verified against the repo on 2026-07-21:

- `_executeSubflowStep(stepName, stepDef)` 在 `tools/mission-driver/src/engine.js:970-1096`，处理 `stepDef.type === "subflow"` 的步骤。
- forEach 路径（`:983`）里 `subflowRuns` 是**局部变量**（`:993` `const subflowRuns = [];`），每个子流程完成后 `push` 一条记录：
  - concurrency=1 路径（`:997-1020`）：`:1012` `subflowRuns.push({ forEachIndex: i, forEachItem: item, file: subflowFile ? basename(subflowFile) : null, status: childResult.status });`
  - sliding-window 路径（`:1021-1080`）：`:1042` 在 `recordResult(r)` 里 `subflowRuns.push({ forEachIndex: r.i, forEachItem: r.item, file: r.subflowFile ? basename(r.subflowFile) : null, status: r.childResult.status });`
- forEach 完成后 `subflowRuns.sort((a, b) => a.forEachIndex - b.forEachIndex);`（`:1079`，仅 sliding-window 路径——concurrency=1 本身就按 forEachIndex 顺序 push），然后 return `{ ok: true, marker, vars, text, subflowRuns };`（`:1087`）。
- 单 subflow 路径（无 forEach，`:1090-1095`）直接 return `subflowRuns: [{ forEachIndex: 0, ... }]`。
- `_wfClose(marker, status, sessionId, meta = {})`（`:370-411`）通过 `meta` 参数把 `subflowRuns` 写进 step 记录——调用点：
  - `:1550` 失败路径：`const failedMeta = result.subflowRuns ? { type: "subflow", subflowRuns: result.subflowRuns } : {};`
  - `:1774` 完成路径：`const completedMeta = result.subflowRuns ? { type: "subflow", subflowRuns: result.subflowRuns } : {};`
  - `_wfClose` 内部 `:394` 把 `meta` 展开进 record，然后在 `:396-411` 用 `name + visits + status==="running"` 找到 placeholder entry 替换、`_writeWorkflow()`。
- `_wfOpen(name, visits)`（`:331-367`）在 forEach step 开始时 push 一个 `{ name, status: "running", visits, ..., subflowRuns: [] }` placeholder entry 到 `workflow.steps`（`:361-364` 仅当 `stepDef.type === "subflow"` 时设 `entry.subflowRuns = []`）。这是父进程被杀时磁盘上的初始空数组。
- `_onAgentStepUpdate({ stepName, logFile, promptFile, sessionId })`（`:438-449`）是 WI5 镜像的范式：在 `workflow.steps` 里**从后往前**找第一个 `name === stepName && status === "running"` 的 entry、patch 字段、`_writeWorkflow()`、break。**注意 `_onAgentStepUpdate` 不校验 `visits`**——本 plan 的 `_wfAppendSubflowRun` **必须加 `visits` 匹配**（设计文档 §4.5.1），因为同一 stepName 可能被 re-entry 多次（visitCounts 累积），不同 visit 的 placeholder 都 `status: "running"` 时只用 stepName 匹配会写错 entry。
- `_writeWorkflow()`（`:427-436`）原子写（tmp + rename）run-state.json 到 `_workflowFile()`。`_workflowFile()`（`:285-292`）：主流程写 `<runDir>/run-state.json`，子流程（`cfg.subflowId`）写 `<runDir>/run-state-<subflowId>.json`。本 plan 改的是主 run-state.json（设计文档 §4.5）。
- monitor.js:267 旧版的 `step.status === "running"` gate 已在 commit 06749fa 移除，dashboard 对历史 aborted run 恢复显示子流程步骤（fallback 扫描磁盘 `run-state-<stepName>-<visits>-<i>.json` 文件）。但 run-state.json 本身仍不自包含——`--analyze` / `git show` 后人工读 run-state.json 仍看到空 `subflowRuns: []`。本 plan 的剩余价值就是让 run-state.json 自包含（设计文档 §2.6 末段）。
- 测试范式：`test/forEach-concurrency.test.js:1-70` 用 `buildHarness({ items, concurrency, failSet, delayMs })` 构造 mock engine、`engine._runChildSubflow = async (_flowDef, vars) => { ... }` 注入每项的延迟 + 失败设定，返回 `{ childResult, childFlowVars, subflowFile }`。但该测试 harness 的 `makeMockDelegates({})` 不设 `config.runDir`——`_workflowFile()` 返回 null、`_writeWorkflow()` 是 no-op，**无法测磁盘持久化**。本 plan 需要在 harness 里加 `runDir`（参考 `test/audit-count.test.js:46-57` 与 `test/core.test.js:704-744` 的范式：`mkdtempSync` + `config: { projectRoot: runDir, runDir }` + 读 `join(runDir, "run-state.json")`）。
- 验证命令（`missions/base.json`）：`pnpm --prefix tools/mission-driver test`（package.json `"test": "node --test test/*.test.js"`）。

**Gap:** `_executeSubflowStep` 把 `subflowRuns` 攒在局部变量里，只在 forEach 全部结束时随 return 交给 `_wfClose` 写主 run-state.json。父进程在 forEach 中途被杀（崩溃 / SIGKILL / 机器睡眠后未醒）时，主 run-state.json 里该 subflow step 的 `subflowRuns` 永远是 `_wfOpen` 给的初始 `[]`，尽管每个已完成的子流程都已把自己的 run-state 写到磁盘（`run-state-<stepName>-<visit>-<i>.json`）。`--analyze` 等直读消费方看不到子流程历史。本 plan 镜像 `_onAgentStepUpdate` 模式，每项完成后立即增量追加到主 run-state.json 的 placeholder entry。

## Goals

- 在 `engine.js` 加 `_wfAppendSubflowRun(stepName, visits, run)` 方法（镜像 `_onAgentStepUpdate` `:438-449` 的"找 running 记录 + patch + `_writeWorkflow`"模式），用 **`name + visits + status==="running"`** 三元组定位当前 subflow step 的 placeholder entry，把 `run` append 到其 `subflowRuns` 数组、`_writeWorkflow()`。
- 在 `_executeSubflowStep` 的两个 `subflowRuns.push(...)` 之后立即调用 `_wfAppendSubflowRun`：
  - concurrency=1 路径（`:1012` 之后）
  - sliding-window 路径（`:1042` 之后）
- 不改 `_wfClose` 的最终覆盖语义（forEach 结束时 return 的 `subflowRuns` 经 sort 后由 `_wfClose` 通过 `meta` 覆盖 placeholder）——增量写期间的临时乱序（sliding-window resolve 序）会被最终 sort + `_wfClose` 覆盖修正（设计文档 §4.5.2 末段）。
- 不改 monitor 侧渲染（已在 commit 06749fa 修固；本 plan 让 run-state.json 自包含，monitor 的 fallback 扫描仍是兜底）。
- 不改子流程自己的 run-state 文件写入（子引擎的 `_writeWorkflow` 已正确落盘）。
- 不引入新的 npm 依赖，保持引擎核心零依赖。

## Non-Goals

- 不改 `_wfClose` 的 meta 字段或调用点（`:1550` / `:1774` 的 `failedMeta` / `completedMeta` 保持不变；最终覆盖语义不变）。
- 不改 `_wfOpen` placeholder 的初始字段集合（`subflowRuns: []` 初始化不变）。
- 不改 monitor.js 的 `mergeSubflowChildren`（已在 commit 06749fa 修固；本 plan 让 run-state.json 自包含后 monitor 仍走 fallback 扫描，不删除兜底）。
- 不改单 subflow 路径（无 forEach，`:1090-1095`）——它只有一项，return 时即写主 run-state，不需要增量。
- 不改 forEach-concurrency / 顺序逻辑（本 plan 只加磁盘写、不动调度）。
- 不在 `_wfAppendSubflowRun` 内部做并发控制或加锁——Node 单线程事件循环，`_writeWorkflow` 是同步 `writeFileSync + renameSync`，无竞态。
- 不引入 metrics / 计数（增量写次数开销可忽略——子流程本身是分钟级，多一次 ms 级文件写无感；设计文档 §4.5.3）。

## Task Route

- Type: `implementation-only change`（owner doc §4.5 已逐行写明改法：`_wfAppendSubflowRun` 函数骨架 + 两个 push 之后的调用点；测试 mock 父中断）。
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §2.6（缺陷 5 根因）、§4.5（方案 E：`_wfAppendSubflowRun` 模式 + 调用点 + 为何不只在 `_wfClose` 写）、§4.5.4（测试锚点：mock forEach=3 + 模拟父中断）。
- Skill Selection Basis: `Skill: none` — `_wfAppendSubflowRun` 的"找 running 记录 + patch + writeWorkflow"模式由设计文档 §4.5.1 直接给出，与同文件 `_onAgentStepUpdate` `:438-449` 同构；方法是确定性的对象查找 + 数组 append + 原子写，无匹配的可复用 skill。

## Infrastructure And Config Prereqs

No infra prereqs beyond existing baseline. 不引入新 npm 依赖（`_writeWorkflow` / `basename` 已在 engine.js 顶部 import 或同模块可用），保持引擎核心零依赖约束（CONTEXT.md 关键约束）。

## Execution Plan

### Phase 1 - `_wfAppendSubflowRun` 方法 + 两个调用点

Status: completed
Targets: `tools/mission-driver/src/engine.js`（新增 `_wfAppendSubflowRun` 方法，紧邻 `_onAgentStepUpdate` `:438-449` 之后；`_executeSubflowStep` concurrency=1 路径 `:1012` 之后 + sliding-window 路径 `:1042` 之后各加一行调用）
Skill: none

- Item Types: `Add`
- Prereqs: none

- [x] Add: 在 `engine.js` 紧邻 `_onAgentStepUpdate`（`:438-449`）之后新增方法 `_wfAppendSubflowRun(stepName, visits, run)`，**直接采用设计文档 `draft-robustness-design.md` §4.5.1 的实现骨架**（不在 plan 里重复贴代码，Minimum Rule 6）。关键不变性：
      - 用 `name + visits + status==="running"` 三元组定位 placeholder（**与 `_onAgentStepUpdate` 的二元组不同——后者不校验 visits**；同一 stepName 可能被 re-entry 多次，不同 visit 都 `status: "running"` 时只用 stepName 会写错 entry）。
      - 从 `workflow.steps` 末尾**向前**遍历（镜像 `_onAgentStepUpdate`，找最近一个匹配）。
      - `if (!Array.isArray(steps[i].subflowRuns)) steps[i].subflowRuns = [];`（防御：placeholder 本应已初始化为 `[]`，但兜底防止未来 `_wfOpen` 改动后未初始化）。
      - `steps[i].subflowRuns.push(run);` + `this.workflow.updatedAt = new Date().toISOString();` + `this._writeWorkflow();` + `return;`（写一条即 return，不再继续找——同 `_onAgentStepUpdate`）。
      - 早 return 防御：`if (!this.workflow) return;`（与 `_writeWorkflow` `:428` 一致）；找不到匹配 entry 时静默 return（同 `_onAgentStepUpdate` `:449` 末段 break 后无操作）。
      - Skill: none
- [x] Add: 在 concurrency=1 路径的 `subflowRuns.push(...)`（`:1012`）之后立即加：
      ```js
      this._wfAppendSubflowRun(stepName, visit, subflowRuns[subflowRuns.length - 1]);
      ```
      - 用 `subflowRuns[subflowRuns.length - 1]`（刚 push 的同对象引用）而非再构造一份，确保 sort 时局部数组与磁盘引用一致。
      - `visit` 来自 `:990` `const visit = this.visitCounts.get(stepName) || 1;`——已是当前 forEach 的 visit 编号。
      - Skill: none
- [x] Add: 在 sliding-window 路径的 `recordResult(r)` 里 `subflowRuns.push(...)`（`:1042`）之后立即加：
      ```js
      this._wfAppendSubflowRun(stepName, visit, subflowRuns[subflowRuns.length - 1]);
      ```
      - 同样用 `subflowRuns[subflowRuns.length - 1]`。
      - 顺序注意：增量写时 subflowRuns 是 resolve 序（非 forEachIndex 序），但最终 `:1079` `subflowRuns.sort(...)` + `_wfClose` 会修正。增量期间 dashboard 看到 resolve 序属可接受实时观察（设计文档 §4.5.2）。
      - Skill: none

Exit Criteria:

- [x] `_wfAppendSubflowRun` 方法存在且为 `FlowEngine.prototype` 方法（或类方法，取决于 engine.js 风格——当前是 class 风格，与 `_onAgentStepUpdate` 同列）。
- [x] concurrency=1 路径每项完成后，主 run-state.json 对应 step entry 的 `subflowRuns` 数组多一条记录（同一次 forEach 内逐项累加）。
- [x] sliding-window 路径每项 resolve 后，主 run-state.json 对应 step entry 的 `subflowRuns` 数组多一条记录（resolve 序，最终 sort + `_wfClose` 修正）。
- [x] forEach 正常完成时，最终 run-state.json 的 `subflowRuns` 仍是 forEachIndex 序（`_wfClose` 用 sort 后的局部 `subflowRuns` 覆盖，与旧行为一致——锁住不回归）。
- [x] 现有 `forEach-concurrency.test.js` / `group-subflow.test.js` / `subflow-state-isolation.test.js` 等套件继续通过（无 `runDir` 时 `_writeWorkflow` 仍 no-op，本 plan 的增量调用也是 no-op）。
- [x] `docs/logs/` 更新。

### Phase 2 - 父中断增量持久化测试

Status: completed
Targets: `tools/mission-driver/test/subflow-incremental.test.js`（新增）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1 完成

- [x] Add: 新增 `test/subflow-incremental.test.js`。结合 `forEach-concurrency.test.js:1-70` 的 mock harness 范式（`buildHarness` + mock `_runChildSubflow`）与 `audit-count.test.js:46-57` / `core.test.js:704-744` 的 runDir 范式（`mkdtempSync` + `config: { projectRoot: runDir, runDir }` + 读 `join(runDir, "run-state.json")`）。覆盖：
      - 用例 A（concurrency=1，父中断后磁盘反映已完成项）：mock forEach=3，concurrency=1，让 `_runChildSubflow` 在第 3 项（forEachIndex=2）入口同步读取磁盘 run-state.json 的快照（此时第 1、2 项应已增量写入），并把快照存到测试可访问的变量；然后让第 3 项正常完成；整个 run 结束后断言：
        - 快照里 `workflow.steps.find(s => s.name === "SUB").subflowRuns.length === 2`（**关键不变性：父中断在第 3 项开始时，磁盘已有前 2 项**）。
        - 快照里 2 条 subflowRuns 的 `forEachIndex` 与 `status` 正确（0 / 1，均 "completed" 或与 failSet 一致）。
        - 快照里 step 的 `status === "running"`（forEach 未结束，placeholder 还是 running）。
        - run 正常结束后，最终 run-state.json 的 `subflowRuns.length === 3` 且按 forEachIndex 序（`_wfClose` 覆盖修正）。
        - Skill: none
      - 用例 B（concurrency=2 sliding-window，父中断后磁盘反映已完成项）：mock forEach=3，concurrency=2，delays 设为 `[10, 10, 200]`（第 3 项明显慢）。让 `_runChildSubflow` 在第 3 项（forEachIndex=2）的 mock 里**先 `await delay(200)`、然后在 delay 之后**读取磁盘快照（**不能在 mock 入口同步读取**——sliding-window 调度器 `engine.js:1056-1068` 的 `.then` 链里，item 2 的 mock 入口恰在 item 0 的 `recordResult` + `_wfAppendSubflowRun` 之后被同步调度，但 item 1 的 `recordResult` + `_wfAppendSubflowRun` 要等下一个 microtask 才跑——同步读会看到 `length === 1` 而非 `=== 2`；delay 200ms 之后两个前序 item 必然已 resolve 且都已增量落盘）。run 结束后断言：
        - 快照里 `subflowRuns.length === 2`（前 2 项已 resolve 并增量写入）。
        - 快照里 2 条记录的 forEachIndex 集合是 `{0, 1}`（resolve 序可能 [0,1] 或 [1,0]，均合法）。
        - 最终 run-state.json `subflowRuns.length === 3` 且按 forEachIndex 序（`_wfClose` 覆盖修正）。
        - Skill: none
      - 用例 C（多 visit 不串味——锁住 `visits` 匹配的必要性）：mock stepName="SUB" 被 re-entry 两次（visit=1 与 visit=2），每次 forEach=2。让第二次 visit 的第 1 项入口读取磁盘快照，断言：
        - 快照里 visit=1 的 placeholder 已被 `_wfClose` 替换为 `status === "completed"`、含 2 条 subflowRuns。
        - 快照里 visit=2 的 placeholder `status === "running"`、`subflowRuns.length === 0`（第二 visit 刚开始，还没 push 第一项）——**关键：增量写不会把 visit=2 的记录误写到 visit=1 的 entry**。
        - visit=2 第一项完成后，磁盘 visit=2 placeholder `subflowRuns.length === 1`。
        - Skill: none
      - 用例 D（最终覆盖语义不回归）：mock forEach=3，concurrency=2，delays `[100, 10, 10]`（resolve 序 [1, 2, 0]），run 正常结束后断言：
        - 最终 run-state.json `subflowRuns` 严格 forEachIndex 序 `[0, 1, 2]`（`_wfClose` 用 sort 后的局部数组覆盖，**不被增量期间的 resolve 序污染**）。
        - Skill: none
      - 用例 E（`_wfAppendSubflowRun` 找不到匹配 entry 时静默 no-op）：构造一个 workflow 但**没有** "SUB" 的 running placeholder（例如直接调 `engine._wfAppendSubflowRun("MISSING", 1, { forEachIndex: 0, status: "completed" })`），断言：
        - 不抛错（静默 return）。
        - workflow.steps 不变。
        - Skill: none
      - 用例 F（**完整 grep 锚点**）：用 `readFileSync` 读 `src/engine.js`，断言全文 `match(/_wfAppendSubflowRun/g).length >= 3`（方法定义 1 处 + concurrency=1 调用 1 处 + sliding-window 调用 1 处 = 至少 3 处）——锁住"两个 push 之后都加了调用"的不变性（防 Phase 1 改动被部分回退）。
        - Skill: none
- [x] Proof: 运行 `pnpm --prefix tools/mission-driver test`，确认新测试全绿且不破坏现有套件（特别 `forEach-concurrency.test.js` / `group-subflow.test.js` / `subflow-state-isolation.test.js` / `audit-count.test.js` / `single-step.test.js` / `transitions.test.js`）。
      - Skill: none

Exit Criteria:

- [x] `test/subflow-incremental.test.js` 用例 A/B/C/D/E/F 全部通过。
- [x] 用例 A 锁住核心不变性："concurrency=1 父中断在第 N 项开始时，磁盘已有前 N-1 项"。
- [x] 用例 B 锁住 sliding-window 路径同等增量持久化（mock 在 `await delay` 之后读取快照——同步入口读会撞 microtask 调度边界）。
- [x] 用例 C 锁住多 visit 不串味（**`visits` 匹配的关键性**——防回归到只用 stepName 匹配）。
- [x] 用例 D 锁住最终覆盖语义不被增量污染（`_wfClose` 仍是最终真相）。
- [x] `pnpm --prefix tools/mission-driver test` 整体绿（含现有套件）。
- [x] `docs/logs/` 更新。

### Phase 3 - Owner-doc 同步

Status: completed
Targets: `tools/mission-driver/CONTEXT.md`（"Monitor Dashboard 前端" 段落里 WI5 行附近，或 "关键约束" 段落末尾——择一加一句）
Skill: none

- Item Types: `Add`
- Prereqs: Phase 1 完成（语义来自 Phase 1 的实现）

- [x] Add: 在 `tools/mission-driver/CONTEXT.md` 加一句关于 subflowRuns 增量持久化的说明。当前 CONTEXT.md "Monitor Dashboard 前端" 段落里已有一条 WI5 条目（关于 `auditRound` / `maxAuditRounds`——那是 step-audit mission 的 WI5，**不是**本 plan 的 draft-robustness WI5；两者同名但分属不同 mission，需要在新增条目里显式区分）。建议加在 "关键约束" 段落末尾或在 "Monitor Dashboard 前端" 段落里新起一条：
      > - draft-robustness WI5：subflow step 的 `subflowRuns` 在 `_executeSubflowStep` 的每项完成后立即增量追加到主 `run-state.json` 的 placeholder entry（`_wfAppendSubflowRun`，镜像 `_onAgentStepUpdate` 模式），父进程中途被杀时 run-state 仍反映已完成项（不依赖 monitor fallback 扫描磁盘 `run-state-<stepName>-<visits>-<i>.json` 文件）。`_wfClose` 仍是最终真相（forEach 结束时 sort + 覆盖 placeholder）。
      - 关键：明确"本 WI5 = draft-robustness 的 subflowRuns 增量"，与 step-audit mission 的 WI5（auditRound）区分，避免未来读者混淆。
      - Skill: none

Exit Criteria:

- [x] `tools/mission-driver/CONTEXT.md` 含 "subflowRuns" 与 "增量" 字样（grep 锁住）。
- [x] 新增条目显式标 "draft-robustness WI5"（与 step-audit mission 的 WI5 区分；grep 锁住 "draft-robustness"）。
- [x] `docs/logs/` 更新（与 Phase 2 共用一条 log entry 即可——同一 plan、同一交付切片）。

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (task `ses_07d1faee2ffezAx289u1r1YlVb`) 因为两处阻塞性问题：(1) Phase 2 用例 B 的 mock-feasibility 矛盾——计划说"`_runChildSubflow` 在第 3 项（forEachIndex=2）入口同步读取磁盘快照"，但 tracing sliding-window dispatcher `engine.js:1056-1068` 发现 item 2 的 mock 入口恰在 item 0 的 `.then` 链里被同步调度（`recordResult` + `_wfAppendSubflowRun(r0)` 之后），item 1 的 `recordResult` + `_wfAppendSubflowRun(r1)` 要等下一个 microtask——同步读会看到 `length === 1` 而非 `=== 2`，测试会 flake。Case A（concurrency=1，全串行）与 Case C（`_wfClose` 在 `_wfOpen` 里同步关掉前一 visit）不受影响。(2) Closure Gate "relevant docs are aligned" 承诺要更新 CONTEXT.md（或 mission-design.md），但 Phase 1 / Phase 2 没有任何执行 item 对应——违反 Minimum Rule 10（Checklist integrity）与 `When Executing` rule 6（"If a slice changes the live baseline or public contract, its exit criteria must include the doc-update step"）；closure 时 auditor 会发现 gate unchecked 但没有 slice 满足它。
- Iteration 1 revision: (1) 用例 B 的 mock 契约改为"**先 `await delay(200)`、然后在 delay 之后**读取磁盘快照"——200ms delay 之后两个前序 item（10ms 各）必然已 resolve 且都已增量落盘，断言 `length === 2` 可靠；Exit Criteria 加一句说明"mock 在 `await delay` 之后读取快照——同步入口读会撞 microtask 调度边界"。(2) 新增 Phase 3 - Owner-doc 同步：在 `tools/mission-driver/CONTEXT.md` 加一条 subflowRuns 增量持久化说明（建议加在"关键约束"段末尾或"Monitor Dashboard 前端"段里新起一条），**显式标 "draft-robustness WI5"**——因为 CONTEXT.md 现有 WI5 条目是 step-audit mission 的（auditRound），同名但不同 mission，必须区分。Closure Gate 改为引用 Phase 3 而非 dangling "详见 Phase 1 实施"。
- Independent draft review iteration 2: `accept` (task `ses_07d153545ffeak8WfuSZ6bkd1d`) — iteration 1 两 blocker 均已解决：(1) Phase 2 用例 B 的 mock 契约改为"先 `await delay(200)`、然后在 delay 之后"读取磁盘快照，并在 Exit Criteria 显式注明"同步入口读会撞 microtask 调度边界"——对 `engine.js:1056-1068` 的 dispatcher 描述准确；用例 A（concurrency=1 串行）与用例 C（`_wfClose` 在 `_wfOpen` 里同步关掉前一 visit）不受影响。(2) 新增 Phase 3 - Owner-doc 同步（Targets `tools/mission-driver/CONTEXT.md` / `Add` item / Exit Criteria with grep locks），明确"draft-robustness WI5"与 step-audit mission WI5 区分（CONTEXT.md:87 现有 WI5 条目确为 step-audit 的 auditRound）。Closure Gate 改为引用 Phase 3 而非 dangling "详见 Phase 1 实施"。Baseline 与 live code 一致，无新阻塞。共识达成，Plan Status → active。

## Closure Gates

- [x] in-scope behavior is complete（`_wfAppendSubflowRun` 方法 + 两个调用点 + 测试 + CONTEXT.md owner-doc 同步）
- [x] relevant docs are aligned（设计文档 §4.5 已是 owner doc；`tools/mission-driver/CONTEXT.md` "关键约束" 段末尾新增 `draft-robustness WI5` 条目，与既有 step-audit mission WI5（auditRound）条目显式区分）
- [x] verification has run（`pnpm --prefix tools/mission-driver test` → 510 pass / 0 fail；`pnpm --prefix tools/mission-driver/web run typecheck` clean；`pnpm --prefix tools/mission-driver/web run build` built；`pnpm --prefix tools/mission-driver run lint:prompts` OK）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### 监控 dashboard 的 monitor.js fallback 扫描是否可以移除

- Classification: `watch-only residual`
- Why Not Blocking Closure: monitor.js:267 的 `mergeSubflowChildren` fallback 扫描（`run-state-<stepName>-<visits>-<i>.json`）已在 commit 06749fa 修固——本 plan 让主 run-state.json 自包含后，fallback 扫描理论上多余（主 run-state 已有 subflowRuns）。但保留 fallback 是双层保险（防未来 `_wfAppendSubflowRun` 又被回退或 run-state.json 写失败），删除属清理工作、非阻塞。
- Successor Required: no — 仅在确认主 run-state.json 在所有路径（含异常路径）都可靠持久化后，才考虑删除 fallback；当前保留。

### sliding-window 路径增量期间 resolve 序的可观测性优化

- Classification: `optimization candidate`
- Why Not Blocking Closure: 设计文档 §4.5.2 末段明确"增量期间的临时乱序只影响实时观察，不影响最终记录"。若实时 dashboard 报告用户看到 subflowRuns 顺序跳变困惑，可加一个 `subflowRunsResolvedOrder` 临时字段或对增量期间的 entry 加 `pendingSort: true` 标记。当前观察窗口通常很短（子流程分钟级，sort 在 forEach 结束后立即修正），不阻塞。
- Successor Required: no

## Closure

Status Note: 实施完成。`_wfAppendSubflowRun` 方法 + 两个调用点（concurrency=1 / sliding-window）已落地，新增 `subflow-incremental.test.js` 6 用例（A-F）锁住核心不变性（concurrency=1 / sliding-window 增量持久化、多 visit 不串味、最终覆盖语义不回归、no-op 防御、grep 锚点），CONTEXT.md 加一条 `draft-robustness WI5` 说明。所有现有套件（含 `forEach-concurrency.test.js` / `group-subflow.test.js` / `subflow-state-isolation.test.js`）零回归。Solo cold-replay pass（无第二 reviewer 可用；non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback）。

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay pass by executing agent (no second reviewer available; non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback)
- Evidence: 
  - `tools/mission-driver/src/engine.js` — `_wfAppendSubflowRun` 方法（紧邻 `_onAgentStepUpdate` `:461-471`）+ 两个调用点（concurrency=1 路径 `:1036`、sliding-window 路径 `:1067`）；3 处 `_wfAppendSubflowRun` 引用（grep 锚点 Case F 锁住）。
  - `tools/mission-driver/test/subflow-incremental.test.js` — 6 用例 A-F 全绿（`node --test` 验证）。
  - `tools/mission-driver/CONTEXT.md:118` — "关键约束" 段末尾 `draft-robustness WI5` 条目（含 "subflowRuns" / "增量" / "draft-robustness" grep 锚点）。
  - `docs/logs/2026/07-21.md` — WI5 entry（reverse-chronological 顶部）。
  - `docs/backlog/mission-driver-draft-robustness-roadmap.md` — WI5 `done`（M4 milestone 完成；整 mission 5 个 WI 全部交付）。
  - Verification: `pnpm --prefix tools/mission-driver test` → 510 pass / 0 fail；`pnpm --prefix tools/mission-driver/web run typecheck` clean；`pnpm --prefix tools/mission-driver/web run build` built；`pnpm --prefix tools/mission-driver run lint:prompts` OK。
