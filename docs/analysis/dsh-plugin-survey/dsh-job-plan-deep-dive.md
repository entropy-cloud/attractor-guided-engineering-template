# DSH Job 运行时 & Plan Mode — 源码级深度调研

> 调研日期：2026-08-30。方法：直接阅读 `~/ai/deepseek-harness` 源码（master @ `141eb6fe`），交叉参照子系统文档、API proxy schema、agent notes 和 package README。

| 项 | 值 |
|---|---|
| 范围 | DSH 两个独立子系统：**job 运行时**（`@deepseek-ai/dsh-jobs`）和 **plan mode**（`@deepseek-ai/dsh-plan-mode`） |
| job 相关包 | `packages/jobs/jobs/`（契约）、`packages/jobs/jobs-local/`（实现）、`packages/jobs/tool-jobs/`（模型侧工具）、`packages/host/apiproxy/src/api/jobs.ts`（浏览器安全视图） |
| plan 相关包 | `packages/plan/plan-mode/`（单包） |
| 关键文档 | `docs/subsystems/jobs.md`、`docs/subsystems/plan.md`、`.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md` |

---

## 1. Job 运行时

### 1.1 定位

**进程内、owner 隔离的后台任务注册表**（`ctx.jobs`）。它*不是*持久层、队列或工作流引擎——它是为长时间运行的生产者（shell 命令、子 agent、MCP 调用）提供共享 ID、owner 隔离、流式输出、取消和完成通知的接缝。

### 1.2 数据模型

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `JobId`（品牌字符串 `<kind>-N`） | kind 由生产者插件声明；计数器按 kind 按注册表递增 |
| `kind` | `JobKind`（通过声明合并的开放字符串） | 如 `"bash"`、`"subagent"`、`"pty"` |
| `label` | `string` | 人类可读；显示在 `job_list` 中 |
| `owner` | `Agent \| undefined` | session-id 作为访问围栏；`undefined` = 无主（对所有人可见） |
| `status` | `running \| stopping \| completed \| killed \| failed` | 终态不可变 |
| `detail` | `string \| undefined` | 可选原因/上下文（如 kill 原因） |
| `outputLimitBytes` | `number \| undefined` | 生产者拥有；控制器应用它，注册表不重写 |
| `startedAt` | `number` | epoch 毫秒 |
| `finishedAt` | `number \| undefined` | 结算时设置 |
| `reported` | `boolean` | 终态读取或 wait 结算标记为 true |

来源：`packages/jobs/jobs/src/types.ts:17-105`、`packages/host/apiproxy/src/api/jobs.schema.ts:19-33`。

### 1.3 服务契约（JobRegistry）

抽象 `JobRegistry`（`packages/jobs/jobs/src/index.ts:62-177`）声明：

| 方法 | 语义 |
|---|---|
| `start(spec)` | 预检 → 验证 owner 有 attached controller → 调用生产者 `run()` 一次 → 原子注册。抛异常 = 无 job id。返回 = 已提交。 |
| `get(id, caller?)` | 非消费快照。强制 owner 围栏。 |
| `list(caller?)` | 仅 caller 拥有 + 无主 job，按注册顺序。 |
| `read(id, caller?)` | 消费流式 job 的单一输出游标；终态输出幂等。标记 `reported = true`。 |
| `kill(id, caller?, reason?)` | 先调用生产者 `cancel()`；抛异常 = job 继续运行。成功 = `stopping` + `reported = true`。 |
| `wait(id, timeoutMs, caller?, signal?)` | 结算或超时解析。结算对迟到的 abort 优先。 |
| `onJobDone(listener)` | effect 作用域；每个终态记录每个 owner 触发一次。包含式，不 await。 |
| `onJobsChanged(listener)` | 注册/结算/移除时按 owner 触发。不是 `onJobDone` 的超集。 |
| `attachController(name)` | 声明 effect 生命周期内的 controller。`start()` 在无 controller 服务 owner 时拒绝工作。 |

**关键不变量：**
- 结算**首次胜出**：一个终态记录、一轮 listener 通知、释放 waiter。
- **Owner 相对作用域**：每个进程一个注册表；controller/listener 注册由组合上下文限定。不加载 controller 的作用域无法搭便车使用其他作用域的 controller。
- **可预测 ID**（`bash-1`、`subagent-1`）：访问围栏是 session-id 比较，而非保密。

### 1.4 生命周期状态机

```
start() ──→ running ──→ stopping ──→ killed
  │            │                       │
  │            ├──→ completed          │
  │            │                       │
  │            └──→ failed             │
  │                                    │
  └── (预检拒绝：无 job id)             │
                                       │
kill() ────────────────────────────────┘
```

- `running → stopping`：成功 `kill()` 时发生。
- `running → completed/killed/failed`：结算时发生。
- 终态记录不可变；`reported` 是交付标记，不是状态。

来源：`packages/jobs/jobs-local/src/index.ts:66-68`（isTerminal）、`docs/subsystems/jobs.md`。

### 1.5 实现（LocalJobRegistry）

`packages/jobs/jobs-local/src/index.ts:91-534` — 内存 `Map<JobId, TrackedTask>`。

关键实现细节：
- **每 owner 并发上限**（默认 10）：`maxConcurrentJobsPerOwner` 在 `start()` 时强制执行。
- **ScopedLayers**：controller、完成 listener 和变更 listener 按注册作用域分层。`list`/`get` 联合全局层与读者的作用域链——无需每 owner 表即可实现 owner 相对读取。
- **结算**：通过 `settled` promise 上的 `markSettled()` 解析器实现首次胜出。Waiter 同步通知；包含式 listener 通知是 fire-and-forget。
- **处置**：agent 处置取消活跃工作并 await 合规生产者；抛异常的 teardown cancel 强制失败记录并标记为 reported（孤儿）。
- **快照纪律**：`snapshot()` 返回新副本；活 `TrackedTask` 永不暴露给调用者。

### 1.6 插件如何消费 Job

**生产者插件**（如 `tool-terminal`、`subagents`）：
1. 调用 `ctx.jobs.start({ kind, label, owner, run: (signal) => ... })` 注册工作。
2. `run` 函数接收 `AbortSignal` 用于取消。
3. 流式输出需提供 `readOutput` 回调。

**消费工具**（`packages/jobs/tool-jobs/`）：
- `job_output(job_id, wait?, timeout_ms?)` → 读取流式增量或终态输出
- `job_list({})` → 列出 caller 拥有 + 无主 job
- `job_kill(job_id, reason?)` → 请求取消

**浏览器安全视图**（`packages/host/apiproxy/src/api/jobs.ts`）：
- `JobView` 携带 `{ id, kind, label, status, detail, startedAt, finishedAt }` — 无输出内容。
- `session/jobs` 帧在变更时向浏览器推送 `JobView` 快照。

### 1.7 DSH 中已验证的消费者

| 消费者 | 如何使用 job |
|---|---|
| `tool-terminal` | `terminal_send(run_in_background: true)` → `ctx.jobs.start()` + PTY 生产者；`job_output` / `job_kill` 用于收集/取消 |
| `agent-teams` | 不直接使用——它用 `ctx.subagents.startContinuable`，是独立子系统 |
| `subagents`（核心） | 通过 `ctx.jobs` 执行后台子 agent |
| `api-proxy` | 在 `session/jobs` 事件上向浏览器客户端广播 `JobView` 快照 |

---

## 2. Plan Mode

### 2.1 定位

**每会话、布尔型协作立场**，向提示注入部署拥有的指导，并将退出门控在审查过的计划工件之后。它*不是*工作流引擎、计划文档存储或任务管理器——它是带人类审查的提示模式开关。

### 2.2 数据模型

| 字段 | 类型 | 来源 |
|---|---|---|
| `plan/mode`（日志事件） | `{ active: boolean }` | 会话事件流 |
| `PlanUnitState` | `{ active: boolean, wanted: boolean \| null, running: { commandId, wanted } \| null }` | 会话投影 |
| `ctx.planMode.get(agent)` | `{ active: boolean, pending?: { active: boolean, narrate: boolean } }` | 服务查询 |

来源：`packages/plan/plan-mode/src/types.ts`、`packages/plan/plan-mode/src/index.ts:248-274`。

**计划工件**：以 `# heading` 开头的 markdown 字符串，作为 `exit_plan_mode` 的 `plan` 参数传递。它*不*持久存储——它就是工具参数本身，审查后丢弃。

### 2.3 状态转换

```
inactive ──(/plan 或 /plan <msg>)──→ active
   ↑                                    │
   │                                    │
   └──(/plan off 或 approved exit)──────┘
```

- `/plan` → active（裸）或 active + steer 消息（带文本）
- `/plan off` → inactive（直接，无模型输入）
- `exit_plan_mode(plan)` → 用户审查 → approve → inactive；reject → 保持 active
- 待定选择在下一个接受的 in-turn pre-step 刷新

来源：`.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md:17-29`。

### 2.4 服务架构（PlanModeController）

`packages/plan/plan-mode/src/index.ts:188-379` — Cordis `Service`，三个注册面：

| 面 | 机制 |
|---|---|
| **提示注入** | `ctx.systemPrompt.section({ name: 'plan:policy', order: 50 })` — active 时贡献部署指导文本；inactive 时无内容 |
| **Slash 命令** | `/plan [off\|message]` — 仅在命令注册表组合时注册 |
| **退出工具** | `exit_plan_mode` — 始终注册（稳定 schema）；inactive 时抛异常 |

**Pre-step 钩子**（`agent/pre-step`）：刷新待定选择、追加 `plan/mode` 事件、可选叙述转换。追加失败将意图保留到后续边界。

**会话投影**（`session-projections`）：纯事件折叠，供 UI 消费。`wanted: null` = 无待定选择；`running: { commandId, wanted }` = 命令进行中。

### 2.5 退出审查协议

`exit_plan_mode(plan)`：

1. 守卫：必须在 active plan mode 中。
2. 守卫：`plan` 必须是非空 markdown，以 `# heading` 开头。
3. 查找 `userQuestions` 交互通道。
4. 向用户提问："批准此计划并离开 plan mode？"，计划作为 detail。
5. 两个选项：**Approve**（离开 plan mode）或 **Keep planning**（留下，返回反馈）。
6. 仅一个无自定义文本的 `Approve` = 同意。任何其他回答 = 纠正性反馈给模型。
7. 批准的退出成为静默待定选择：计划指导在当前工具批次剩余时间内保持 active，在下一个请求前移除。

来源：`packages/plan/plan-mode/src/index.ts:325-379`、`.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md:31-35`。

### 2.6 与 Goal / Workflow 系统的关系

- **Goal 系统**：plan mode *不*读写 goal 状态。它与 goal 轮次、静默或验收正交。
- **Workflow 引擎**：源码中未发现交互。Plan mode 在会话/提示层运作；workflow 在执行层运作。
- **Agent teams**：无直接交互。Plan mode 是每 captain 的会话立场。
- **ralph-loop**：住在 `ouroboros` 插件（进化循环）中，不在 plan mode 中。它调用 `evolve_step` MCP 原语——完全独立。

**Plan mode 是 UI 层提示开关，不是计划文档系统。**

---

## 3. Job 与 Plan Mode 的关系

两个子系统**正交**：

| 维度 | Job 运行时 | Plan Mode |
|---|---|---|
| 层 | 执行（后台任务） | 提示/协作（立场开关） |
| 状态 | 每任务：`running → stopping → terminal` | 每会话：`active: boolean` |
| 持久化 | 内存；进程退出即丢失 | 记录在会话事件流中；可重建 |
| 人类交互 | 无（启动/收集/取消） | 审查门控（approve/reject 计划） |
| 消费者 | 生产者插件、tool-jobs、api-proxy | 系统提示、/plan 命令、退出工具 |

它们可以组合：plan mode 会话可以启动后台 job，job 完成可以在 plan mode 中被观察。但它们不共享数据、生命周期或 API 表面。

---

## 4. 对 age-autonomy 的 Adopt / Adapt / Reject

### Job 运行时

| 判定 | 项目 | 理由 |
|---|---|---|
| **Adopt** | 通过 session-id 在可预测 ID 上的 owner 隔离访问围栏 | 我们的 mission-driver 有类似的每 mission 隔离需求；此模式简单且正确 |
| **Adopt** | 生产者插件模式（start + kind + run 回调 + readOutput） | shell/子 agent/MCP 后台工作的清晰抽象 |
| **Adopt** | 结算首次胜出 + 包含式 listener 通知 | 避免双 delivery 缺陷 |
| **Adapt** | ScopedLayers 用于 owner 相对读取 | 我们的 agent 组合作用域不同（每 plan），但分层模式可迁移 |
| **Adapt** | 浏览器安全 JobView（无输出内容）用于 monitor SSE | 匹配我们 monitor 只读投影纪律 |
| **Reject** | 纯内存存储 | 我们需要 `events.jsonl` 持久性用于 mission resume；纯内存注册表无法存活重启 |
| **Reject** | 每 owner 并发上限（10） | 我们的并发模型是每 plan，不是每 owner；默认值错误 |

### Plan Mode

| 判定 | 项目 | 理由 |
|---|---|---|
| **Reject（原样）** | Plan-as-prompt-toggle | 我们的计划系统是基于文件的执行工作流（`docs/plans/`），不是会话语义立场。语义不匹配是根本性的。 |
| **Adopt（原则）** | 通过 user-questions 的审查退出门控 | "模型提议、人类批准"模式对非平凡转换直接有用，可用于 `CLOSURE_AUDIT` 人类签收 |
| **Adopt（原则）** | 模式转换期间的稳定 tool schema | `exit_plan_mode` 即使 inactive 也保持注册——避免 schema 抖动。我们应将此应用于条件相关的审计/计划工具。 |
| **Adapt** | 会话投影作为纯事件折叠 | 我们的 monitor 面板可使用类似模式从 `events.jsonl` 投影计划执行状态 |
| **Reject** | 计划工件作为工具参数（不持久化） | 我们的计划是带 owner 文档、版本控制和审计轨迹的持久文件。退出时丢弃计划不兼容。 |

---

## 5. 风险与开放问题

1. **Job 注册表不持久**：DSH 的 `LocalJobRegistry` 是内存的。对 mission-driver 而言，后台 job 状态必须在进程重启后存活。我们需要：（a）将 job 事件记录到 `events.jsonl`，或（b）接受后台 job 在重启后丢失（如 DSH 所做）。

2. **Plan mode 不是计划系统**：DSH 的"plan"是协作立场，不是计划文档。不要与我们的 `docs/plans/` 工作流混淆。唯一可迁移的模式是转换的人类审查门控。

3. **ralph-loop 不是通用机制**：它是 ouroboros 特定的进化循环。不能推广到 mission-driver 的 goal 循环。

---

## 源码索引

| 文件 | 行 | 内容 |
|---|---|---|
| `packages/jobs/jobs/src/types.ts` | 1-260 | 核心类型：JobStatus、JobStart、JobSnapshot、JobRead、JobKindMap |
| `packages/jobs/jobs/src/index.ts` | 62-177 | 抽象 JobRegistry 服务 |
| `packages/jobs/jobs-local/src/index.ts` | 91-534 | LocalJobRegistry 实现 |
| `packages/jobs/tool-jobs/README.md` | 1-18 | job_output / job_list / job_kill 工具规格 |
| `packages/host/apiproxy/src/api/jobs.ts` | 1-120 | 浏览器安全 JobView + session/jobs 帧 |
| `packages/host/apiproxy/src/api/jobs.schema.ts` | 1-33 | 线路 JobView 的 Zod schema |
| `packages/plan/plan-mode/src/index.ts` | 188-379 | PlanModeController 服务 |
| `packages/plan/plan-mode/src/types.ts` | 1-40 | PlanModeConfig、PlanUnitState |
| `packages/plan/plan-mode/README.md` | 1-300 | Plan mode 文档 |
| `docs/subsystems/jobs.md` | 全文 | Job 子系统文档 |
| `docs/subsystems/plan.md` | 全文 | Plan 子系统文档 |
| `.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md` | 1-71 | Plan 专用简化决策 |
