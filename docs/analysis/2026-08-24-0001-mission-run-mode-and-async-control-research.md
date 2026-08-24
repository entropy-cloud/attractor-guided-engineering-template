# Mission 运行模式与异步控制 — 调研分析报告（对照 DSH 插件生态）

> Status: research note（仅调研；结论供 mission loop 控制面立项讨论）
> Date: 2026-08-24
> 前篇：`docs/analysis/2026-08-24-0000-longrun-autonomy-agent-reuse-prompt-dsl-research.md`（agent 复用与 prompt DSL；本篇回答「loop 归谁驱动、如何启停续、要不要消息化」）
> Sources: 本仓库源码精读（`engine.js` `orchestrator.js` `config.js` `mdcontrol-routes.ts` `engine-bridge.ts`）+ 新克隆插件源码/设计文档 10 个（见 §1）
> 方法纪律：宿主行为引用沿用「实现时须复核」惯例；插件结论均注明出处文件。

## 1. 调研范围与新入库插件

GitHub `dsh-plugin` 生态自 2026-08-22 INDEX 后新增多个高相关项目。本次按「长时循环 / 异步编排 / 任务队列」相关性筛选并克隆至 `~/ai/dsh-plugins/`：

| 插件 | Stars | 与本议题的关系 | 关键读物 |
| --- | --- | --- | --- |
| **omdsh-dev/dsh_workflow** | ~98★ | **最直接相关**：可恢复 workflow 层（生成/保存/治理/观察/**恢复**），含 pause/resume/stop 完整实现 | `docs/ARCHITECTURE.md`、`lib/engine.js` |
| **titanwings/dsh-automation** | ~73★ | 定时任务调度器：持久意图 + 显式执行边界 + 可审计运行 | `docs/DESIGN.zh-CN.md` |
| not-big-dog/DSH-pipeline-kernel | ~36★ | 管线无关管理内核（任务板/台账/watchdog/部署） | README |
| tianji-qingtian/dsh-spec-loop | ~6★ | spec 驱动开发闭环（生成规格→批准→实现→验收→归档） | README |
| omdsh-dev/dsh-inspect | ~7★ | checkup→fix→review 对抗闭环 | README |
| PerryLink/dsh-background-agents | ~5★ | **可交互长时后台 agent**：durable continuable child + 进度反向通知 | `ARCHITECTURE.md` |
| euuuuuuzer/dsh-loop-dock | ~6★ | 异构 Agent Loop：每 agent 可选不同 loop 的 Register/Select/Bind/Delegate 接口 | `DESIGN.md` |
| Noelune/dsh-agent-relay | ~4★ | 纯消息路由总线（传输与编排解耦） | README |
| NanmiCoder/dsh-agent-teams | — | captain 建队 + durable 成员唤醒 + 依赖感知任务 + 安全接管 | README |

既有本地参考（INDEX.md 已收录、此前 R0/R1 分析已消化）：dsh-goal-quiescence、goal-acceptance、DSH-better-sidebar、dsh-anchored-standard 等。

## 2. 当前 mission 运行模式精读（逐问回答）

### Q1 谁负责持续执行？

**FlowEngine 自己——一个 detached in-host promise，不依赖任何外部驱动者。**

调用链（M2-WI10 落地形态）：`mission-control-run` skill → `POST /mdcontrol/api/run` → `beginNativeMission`（engine-bridge.ts:226）→ `engineOrchestrateRun({config, executor})` **不被 await**，成为挂在宿主事件循环上的 detached task；route 立即返回 `{runId, status:'started', runDir}`。

此后 loop 的每一步由 `FlowEngine.run()` 主循环自推（engine.js:1641 `while (totalSteps < maxTotalSteps …)`）：渲染 prompt → `executor.executeAgent(...)` → native 后端即 `agent.followup(prompt)` + `await agent.whenIdle()` → 收割 assistant 文本 → 解析 `<AI_STEP_RESULT>` marker → 按 flow JSON transitions 跳转 → 写 run-state。**启动它的那个 AI 会话在 start 返回后就与 loop 解耦了**——它不欠任何后续动作；这正是异步作业契约的设计意图（packaging doc §Service Surface：「a synchronous wait would hang the calling agent's turn until timeout」）。

所以答案是：**没有「谁来持续执行」的问题——引擎循环就是执行者本身**；它不是被消息逐拍驱动的，而是一个自包含的状态机协程。宿主进程存活 = loop 存活。

### Q2 mission loop 到底怎么执行？

- **步进**：每步一次 dispatch。AI 步 = followup + whenIdle + marker 解析；script 步（CLOSURE_SCRIPT_CHECK/BUILD_VERIFY）= 插件层短命子进程。
- **转移**：flow JSON 的 transitions 表 + markerAliases 归一；未知 marker 有 correction-retry（max 2 次）；预算护栏 = maxTotalSteps/maxCycleVisits/maxRetries/maxAuditRounds。
- **并发**：forEach subflow 支持有界并发（engine.js:1244 inflight 窗口）。
- **持久性**：每步原子写 run-state.json（崩溃后磁盘即真相）；plan 文件的 `[x]` checkbox 是工作进度的另一份持久记录。

### Q3 如何启动 / 暂停 / 继续？重跑同 mission 名 = 继续吗？

| 动作 | 现状 |
| --- | --- |
| 启动 | ✅ `mdcontrol.run`（route/skill/CLI 三入口同词汇） |
| **暂停** | ❌ **不存在**。无 route、无引擎概念。只有内部 watchdog（60min log-idle 或 per-step timeout → cancel→dispose） |
| 中途取消 | ❌ 无对外 route；abort 机制存在但仅 watchdog 内部使用 |
| 继续（机制级） | ⚠️ CLI 已有 `--from-step <step>` entry override + `--run-dir`（orchestrator.js:649、config.js:791）——定点重入同一 runDir 的指定步骤；**plugin 路由未暴露此能力** |
| 继续（工作级） | ✅ 以收敛方式存在：同 mission 名重跑 = **新 runDir、新 child agent、全新引擎循环**，但 execute.md 从磁盘读 plan，已 `[x]` 的 Phase 被跳过——「继续」是 **artifact 收敛的涌现语义，不是机制语义** |
| 崩溃残留 | ⚠️ 进程模式有 `reconcileStaleRuns`（main.js 启动时）；embed 模式关闭了启动诊断（M1-WI4），**in-host 孤儿 run 目前无人收尸**，仅 active-run guard 防止并发再启 |

因此对用户问题的精确回答：**给定 mission 名称重新执行，在工作层面等价于继续执行（未完成 Phase 会被接着做），但在机制层面是一次全新 run**——新的 runId、新的审计轮次预算（auditRound 是 per-run 的 run-state 字段）、新的 child session。「继续」之所以成立，是因为 AGE 把状态权威放在 git 文件（R1 §5.1 裁决）而不是进程内存。这带来两个隐含语义差，值得写进文档并决定是否接受：

1. **DEEP_AUDIT 预算按 run 重置**：上一 run 用掉 2/3 审计轮次，重跑后又是满额 3 轮；
2. **CHECK 重入**：每次重跑都从 health-check 开始（多数情况无害，但非严格断点续传）。

### Q4 AI 触发 tool 启动之后，怎么异步交互？

现状的四条单向观察通道 + 一条终态回执：

1. `mdcontrol.status`（run-state 透传，轮询）；
2. monitor dashboard（SSE 推送，端口 9300）；
3. subagents 拓扑 UI（run 级 descriptor 一行，WI11）;
4. 轨迹视图（child session log）；
5. opt-in 终态回执（`agents.get` → `followup` 回启动方会话，packaging doc 六调用账本第六项）。

**缺口：没有任何「反向通道」**——启动后无法向正在跑的 run 发 pause/stop/inject-message；也无法让 loop 主动把中间进展推给启动方会话（只能等终态）。用户直觉到的「怎么异步交互」痛点正在于此：**下行（观察）完备，上行（控制）与中途通知缺失**。

## 3. 核心判定：需要把 flow engine 改成消息系统吗？

**不需要。理由四条：**

1. **要解决的问题不因消息化而解**。pause/cancel 需要的是「dispatch 边界上的控制点」，这在现有架构里是一个 executor 层的 gate 就能拿到的东西（见 §4 裁定 2）；消息化的本质改变是「谁推动下一步」，而我们的答案已经是正确的——状态机自推。
2. **代价是重写整个冻结契约面**。`while` 主循环改为事件驱动意味着：653 个引擎测试重写、EXIT_MAP 逐行钉住的退出语义、run-state 形状（monitor 的消费面）、forEach 并发窗口、correction-retry 分类、reconcile 语义全部牵动。AGENTS.md 把 engine.js 中央路径列为 AI Block Condition 不是没有原因。
3. **生态对照一致**。dsh_workflow（98★，本议题最成熟的参照）的明确架构裁决：「native worker workflow 是有意为之的有界前台脚本 seam；durable handles、live messaging、process pause/resume 属于 ctx.subagents 之上的附加服务」——它**没有改宿主 agent loop**，而是在上面加 engine/store 两层。dsh-automation 更是把「Automation ≠ cron+prompt」的三分法写成宪法：Store/Clock/Executor 各司其职，没有一个把执行器做成消息订阅者。
4. **宿主先例同向**。goal-round-driver 用 queued prompt + pre-step listener 做「同 session 有界多轮」，但那是交互会话内的目标推进；packaging doc §Behavioral differences 已裁定 Flow DSL 因分支/marker 契约/预算握排序权。消息总线（relay 模式）解决的是**跨 harness 平级通信**，不是单引擎内部控制流——我们两样都不缺前者、后者不该有。

**真正缺的不是消息化引擎，而是控制面（control plane）**。下面给出对照生态后的落地裁定。

## 4. 设计裁定建议（六条）

> **§4.0 设计原则（human 裁定，2026-08-24 —— 最高约束，下述裁定凡与之冲突者以其为准）**
>
> 1. mission-driver 已将全部可复用状态外化为 roadmap 与 plan 文件，**不需要任何其他状态保持机制**。
> 2. **暂停就是直接中断**——不做挂起/恢复机器。中断后的继续 = 收敛式重跑（plan checkbox 接续）。
> 3. mission-driver 必须是**跨 session 的**：commit 后 checkout 到任何机器即可恢复现场，**插件中不持有任何记忆**。`_tmp/` 是本机 scratch，不是状态面。
> 4. 这是 AGE 的本质性设定，优先级高于本报告一切生态对照结论。

### 裁定 1：引擎保持自驱状态机；控制面加在 plugin 层

RunControl 作为 mission-control 服务的内存组件（与 ActiveRunGuard 同级），持 `{paused: boolean, stopRequested: boolean, waiters}`。零引擎 diff 的实现位点是现成的：**StepExecutor 是注入 seam**（M1-WI1 的全部意义）。

### 裁定 2：~~pause = dispatch 边界 gate~~ → **中断即暂停；不建 waiter-gate 机器**（§4.0 修订）

原建议（对照 dsh_workflow 引入 pauseWaiters/ControlGateExecutor）**按 §4.0 否决**——waiter 挂起是进程内状态保持，正是 AGE 排除的东西。修订后的完整语义：

- **中断 = 现有 watchdog 序列的对外暴露**（可选薄层 `mdcontrol.stop(runId)`）：`agent.cancel(cause)` → grace → dispose last resort。零新机制，只是把内部已有的 abort 路径开放给交互会话。
- 中断后 run-state 停在当步（`running` 或终态化 failed），**不做 paused 记账、不加 controlState 字段、不留任何待恢复句柄**。工作进度已由 plan checkbox 持久化，这正是恢复机制本身。
- 「继续」没有专属操作：重新 run 同 mission 即继续（收敛式）。插件不需要 resume route。
- 对照表修正：dsh_workflow 的任务边界 waiter-gate 与 background-agents 的协作式中断中，**只有后者（request interruption, never kills processes）被采纳**；前者作为反例存档——它是「workflow 引擎持有运行态」范式的产物，与「状态在文件」范式相反。

### 裁定 3：续跑语义两档显式化（原三档，B 降级）

| 档 | 语义 | 实现位 |
| --- | --- | --- |
| A 收敛续跑（**唯一产品面机制**） | 同名重跑 = 新 run，靠 plan checkbox 跳过完成 Phase；commit 后任何机器 checkout 均可如此恢复（§4.0.3） | 无需改动；文档写明审计预算按 run 重置是有意语义 |
| ~~B 定点续跑~~ | **降级为 CLI 本机便利，不进插件产品面**：`--from-step`+`--run-dir` 依赖本机 `_tmp/` scratch 与同进程 session 恢复，跨 checkout 不存在（§4.0.3） | 引擎能力保留现状，仅 CLI 文档化 |
| C 快照重跑 | 对照 dsh_workflow invariant 6：「run-id rerun 执行不可变快照；saved-name rerun 执行当前 catalog 条目」——我们的同名重跑天然是后者（live roadmap）。**接受此语义但成文**：AGE 的 roadmap 就是活文档，重跑读当前版正是「状态在文件」的体现 | 文档裁定即可，暂不实现 |

### 裁定 4：中途进展通知（可选增强）照抄 background-agents 双通道纪律

其数据流（ARCHITECTURE.md）：child turn 结束 → lifecycle observer（节流水印 throttle）→ `parent.inject()/followup()` 注入进度行（模型可见 ⟺ 已落 log，source 标 `{kind:'plugin'}`）；parent 忙时 FIFO-inbox 排队；空闲过久自动归档、`bg_message` 唤醒。映射：milestone 级事件（Phase 完成 / correction-retry 触发 / 预算告警）经节流后 followup 回启动方会话，替代纯轮询。**节流与里程碑阈值必须有**——每步一推会把启动方会话变成垃圾流。

### 裁定 5：连续自主队列的持久意图 = 仓库本身（§4.0 修订）

dsh-automation 的五条调度语义移植时按「插件零持久记忆」重新落位——**队列不需要独立 store，因为 durable intent 已经存在**：roadmap 的 todo 项 + `missions/*.json` 就是队列定义，`memory/_index.md`（git 内）就是跨 run Reflexion 载体。continuous 模式 = 一个扫描 roadmap 并逐个 run mission 的薄循环：

1. **幂等**：automation 的 occurrenceKey 思想对应到 AGE = plan 文件名/Work Item 标签天然去重（draft 过的计划不会重复拾取，plansDir 扫描已保证）——无需新键；
2. **Crash = 中断**：宿主重启后遗留的本机 run-state 残留在 `_tmp/`（scratch），不记账、不补跑；下一个 continuous 周期照常收敛式推进。automation 的「failed(interrupted) 不偷跑」精神保留为：**中断后不自动立即重跑同一 mission**（等下一触发点），避免副作用叠加；
3. **Overlap**：每 root 单活跃 guard（内存态）天然提供 skipped(overlap)——guard 是 in-memory 这一点在 §4.0 下恰是正确设计，重启即清空，无需持久化恢复；
4. **Misfire / catch-up**：不适用（无时间表语义；continuous 循环本身就是「最新状态推进」）；
5. **Queue ≠ authorization**：Review Hold 的 plan 保持 draft 不被执行拾取（现语义已是如此）；continuous 模式遇 Hold 即暂停循环并出回执。

孤儿收尸（前版开放问题 4）：在 §4.0 下答案自然浮现——`_tmp/` 残留是本机 cosmetic 问题，**不做启动收尸机制**；active-run guard 内存态重启即净，唯一动作是 continuous 循环每轮开始时对上一轮 mission 的终态做一次 run-state 终态化标记（写文件，符合外化原则）。

### 裁定 6：不引入独立消息总线

dsh-agent-relay 的价值在跨 harness（dsh↔Codex↔Claude Code 平级协作）、租约投递、TTL 队列——单进程内 cordis service 直调 + HTTP dispatcher 已覆盖我们全部需求。pipeline-kernel 的「管线 = 配置行」思想与 flow JSON 精神一致，无需引入。loop-dock 的异构 loop 接口（Register/Select/Bind/Delegate）留作远期参考：若未来 drafter/reviewer 池要求不同 loop 形态（前篇 S2），其 provider-spec 值得复读。

## 5. 生态模式速查表（供后续引用）

| 模式 | 出处 | 一句话 | AGE 是否采纳 |
| --- | --- | --- | --- |
| 任务边界 waiter-gate pause | dsh_workflow engine.js | pause 挂起于派发点，resume resolve waiters，stop reject | ❌ **§4.0 否决**（进程内状态保持，反范式；存档作对照） |
| 快照 vs 活目录 rerun 二分 | dsh_workflow invariant 6 | run-id rerun 用不可变快照；名字 rerun 用当前定义 | ✅ 成文接受后者（roadmap 是活文档） |
| 双通道事实纪律 | dsh-background-agents | 结构化 ignorable 事实事件 + 模型可见 notice 行 | ✅ 裁定 4（events.jsonl + followup，均为易逝通道不构成状态面） |
| 节流/水位生命周期 | dsh-background-agents | 首报不节流；忙则 FIFO 排队 | ✅ 裁定 4 变体（仅通知侧） |
| 协作式中断 | dsh-background-agents / 宿主 | stop = request interruption，永不杀进程 | ✅ 裁定 2（中断即暂停的唯一机制位） |
| occurrenceKey 至多一次派发 | dsh-automation | (id, revision, scheduledFor) 稳定键 | ◐ 精神保留：plan 文件名/Work Item 天然去重，无新键 |
| 崩溃 = interrupted 不偷跑 | dsh-automation | 遗留 queued/running → failed(interrupted) | ✅ 简化版：中断后等下一触发点，不立即重跑同 mission |
| Schedule ≠ authorization | dsh-automation | 意图不缓存批准；无人值守 fail-closed | ✅ Queue ≠ approval |
| nextRunAt 是 projection 非权威 | dsh-automation | 第二份时间永远只是投影 | ✅ 通用原则 |
| 依赖感知任务态 + 安全接管 | dsh-agent-teams | 依赖未完不可 claim；接管先 revoke 陈旧 attempt | ◐ 远期（池化接管场景） |
| 传输/编排解耦总线 | dsh-agent-relay | 只管可靠投递，不碰控制流 | ❌ 单进程不需要 |
| 每 agent 异构 loop | dsh-loop-dock | Register→Select→Bind→Delegate | ◐ 远期参考 |

## 6. 若坚持消息化的反事实代价（论证存档）

假设把 `FlowEngine.run()` 的 while 主循环改为事件订阅制（每步 transition 由控制消息触发）：① 653 个测试中所有直接驱动的用例重写；② EXIT_MAP 的「terminal-status → exit code」表失去同步触发点，CLI 冻结契约被迫改版；③ forEach 并发窗口从结构化代码退化为消息竞态，reconcile/replay 语义需重证；④ run-state 原子写的时序不变量（`_wfClose` 最终真相、placeholder 覆盖）要在乱序到达下重新证明；⑤ 换来的唯一新能力是「外部进程可驱动引擎」——而 native in-host 化恰恰已经消灭了这个需求（引擎与宿主同进程，控制面直调即可）。结论：负收益重构，不做。

## 7. 开放问题（按 §4.0 修订后剩余）

1. `mdcontrol.stop` 中断当步后，引擎循环保守路径会走 transient/correction 分类——stop 需要让引擎终态化为 failed 而非消耗 correction-retry 预算。候选：executor 抛出带标记的错误 + 引擎既有 onError 直达；具体分类面需对照 engine transient 表裁定。
2. 里程碑通知的默认阈值（哪些事件值得打扰启动方会话）需 product owner 定。
3. continuous 循环的触发沿定义（roadmap 扫描周期 / run 终态链式）与失败熔断上限——策略参数待定，机制已由 §4.0 封顶（无新状态面）。

## 8. 增补（2026-08-24，dsh-plugin-survey 交叉发现）

> 18 份插件调研见 `docs/analysis/dsh-plugin-survey/INDEX.md`；以下强化本报告裁定：

1. **裁定 5 队列语义的源码级背书**（`dsh-automation.md`）：occurrence claim 双重幂等（trigger+scheduledFor 查重 + sha256 确定性 runId）、激活边界、skip 审计记录、fresh-agent 快照冻结四项可直接移植为 roadmap-as-queue 的策略参数；其 KvTable store 明确 Reject（状态外化红线）——只取语义不取 store 的路线经源码核实可行。
2. **崩溃恢复的补充模式**（`DSH-pipeline-kernel.md`）：`routing:pending` + routeKey + parent 标签三件套是"中断后待办不丢"的标签法实现，与我们的收敛式重跑兼容，可作为 continuous 循环对上一轮 mission 终态标记的参考形状。
3. **「不引入总线」裁定成立并记录推翻条件**（`dsh-agent-relay.md`）：租约/TTL/幂等的靶子全是进程边界，同进程直调下无一适用；三个未来翻转场景入档——本机多 CLI 舰队 cross-review、Mission Control 拆独立进程、跨重启待办队列。
4. **stop 中断的对照确认**（`dsh-background-agents.md` / `dsh-turn-rewind.md`）：协作式中断（fire-and-return request interruption，永不杀进程）在两个独立插件中均为同一形态；快照回滚范式被判定为"有权威计划工件时即冗余"，反证 §4.0 收敛式恢复的充分性。
