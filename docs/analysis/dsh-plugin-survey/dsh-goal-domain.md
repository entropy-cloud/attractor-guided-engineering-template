# DSH 内置 Goal 系统 — 源码级调研报告

> 调研日期：2026-08-30。方法：通读 `~/ai/deepseek-harness/packages/goal/` 四包全部 README、核心源码 types/runtime/domain/index、agent notes、`docs/subsystems/goal.md`。

| 项 | 值 |
|---|---|
| 本地路径 | `~/ai/deepseek-harness/packages/goal/`（master @ `141eb6fe`） |
| 包组成 | `goal`（核心服务）+ `tool-goal`（模型工具）+ `goal-round-driver`（自动续跑驱动）+ `command-goal`（/goal 命令） |
| 宿主 API 面 | `ctx.goals`（GoalService）；inject = `agents, sessions, tools`（goal）；`tools, systemPrompt, agents`（tool-goal）；`agents, sessions`（goal-round-driver）；`commands, goals`（command-goal） |
| 关键设计文档 | `.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.md`、`2026-07-19-same-session-goal-round-driver.md`、`2026-07-19-model-facing-goal-tools.md`、`2026-07-19-human-goal-command.md` |
| 与社区插件的关系 | scaffold/quiescence/acceptance 均为**社区第三方插件**，扩展或包装此核心系统，不是 DSH 内置 |

---

## 1. 定位

DSH 内置的 **同会话（same-session）目标状态机**：在一个 agent 的现有会话中保留一个当前完成目标，通过事件溯源持久化到会话日志，提供生命周期管理（create/edit/pause/resume/complete/block/clear）和自动续跑轮次驱动。

**核心设计原则：**
- **状态 ≠ 调度**：goal 域只记录状态和许可，不决定何时启动模型轮次
- **持久化 ≠ 自动执行**：activation（armed/disarmed）是进程本地的，重启后必须由人类显式 resume
- **会话日志是唯一权威**：所有 goal/change 事件追加到 session log，无独立数据库
- **最多一个当前目标**：不支持并行目标

---

## 2. 数据模型

### 2.1 核心类型（`packages/goal/goal/src/types.ts`）

| 类型 | 字段 | 说明 |
|---|---|---|
| `GoalId` | branded string | 跨修订的稳定目标标识 |
| `GoalRef` | `{ id: GoalId, revision: number }` | CAS（compare-and-set）身份；每次持久变更递增 revision |
| `GoalSnapshot` | extends GoalRef + `{ objective, phase, blockedReason?, maxGoalRounds }` | 每次非 clear 变更写入的完整快照 |
| `GoalView` | extends GoalSnapshot + `{ roundsStarted, createdAt, updatedAt, activation }` | 含投影计数和进程本地激活状态的完整视图 |
| `GoalPhase` | `'active' \| 'paused' \| 'blocked' \| 'complete'` | 持久生命周期阶段 |
| `GoalActivation` | `'armed' \| 'disarmed'` | 进程本地续跑许可；**永不持久化** |
| `GoalBlockReason` | `{ code: string, message: string }` | 机器路由码（lower-kebab）+ 人类可读说明 |
| `GoalMessageSource` | `{ kind: 'goal', goalId, revision, round }` | 续跑轮次的消息归属标记 |

### 2.2 持久事件

| 事件类型 | 载荷 | 说明 |
|---|---|---|
| `goal/change`（非 clear） | `{ version: 1, operation, goal: GoalSnapshot, roundsStarted, createdAt, updatedAt }` | 完整快照，last-wins 折叠 |
| `goal/change`（clear） | `{ version: 1, operation: 'clear', cleared: GoalRef, clearedAt }` | 墓碑 |
| `user/message`（goal 归属） | GoalMessageSource | 仅正序 admitted round 推进 roundsStarted |

### 2.3 会话投影

```ts
goal: GoalProjection | null  // null = 无目标或已 clear
```

纯事件折叠，last-wins。激活状态故意不在投影中（永不持久化）。

来源：`packages/goal/goal/src/types.ts:1-112`、`docs/subsystems/goal.md:1-277`。

---

## 3. 生命周期状态机

```
                    ┌─────────────────────────────────┐
                    │                                 │
create() ──→ active ──→ paused ──→ resume ──→ active │
   │            │                                 │
   │            ├──→ blocked ──→ resume ──→ active  │
   │            │                                 │
   │            └──→ complete                      │
   │                                                │
   └── (completed 可被 create 替换)                 │
                                                    │
clear() ──→ 墓碑（retained history）                │
                                                    │
disarm() ──→ active + disarmed（进程本地）          │
            不改变持久 phase/revision                │
```

**关键转换规则：**
- `create`：需要当前无 non-complete 目标；completed 可被替换
- `resume`：接受 paused/blocked 或 disarmed active；需有剩余 round 容量
- `edit`：保留 phase、blockedReason、activation
- `block`：记录 policy-owned code + message
- `disarm`：仅移除进程本地 activation，不写事件、不改 revision
- 每次 mutation 递增 revision，CAS 校验防旧引用

来源：`packages/goal/goal/src/runtime.ts`、`.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.md:17-31`。

---

## 4. 四包架构

### 4.1 `goal`（核心服务）— `ctx.goals`

纯状态机 + 事件溯源。**不做调度、不做续跑、不注入模型上下文**。

| 方法 | 语义 |
|---|---|
| `get(agent)` | 返回 GoalView 或 undefined |
| `create(agent, request)` | 创建并 armed；resolved defaultMaxGoalRounds |
| `edit(agent, ref, request)` | 编辑 objective/maxGoalRounds，保留 phase |
| `pause(agent, ref)` | 暂停 + disarm |
| `resume(agent, ref)` | 恢复 + armed（需有剩余容量） |
| `complete(agent, ref)` | 标记完成 + disarm |
| `block(agent, ref, reason)` | 标记阻塞 + disarm |
| `clear(agent, ref)` | 清除 + 墓碑 |
| `disarm(agent)` | 仅移除进程本地 activation |

**不变量：**
- 严格重放仅从 `goal/change` 派生状态
- 拒绝格式错误、revision 不连续、非法生命周期转换、非单调时间戳
- 增量重放游标停在第一个损坏事件
- 目标轮次仅从正序 admitted `user/message` 推进

来源：`packages/goal/goal/src/index.ts`、`docs/subsystems/goal.md:155-250`。

### 4.2 `tool-goal`（模型工具）

三个工具注入模型：

| 工具 | 功能 |
|---|---|
| `get_goal()` | 返回当前 goal + CAS ref + activation |
| `create_goal(objective, max_goal_rounds?)` | 从直接人类消息创建目标；拒绝非人类 turn |
| `update_goal(goal_id, revision, action, ...)` | 支持 edit/pause/resume/complete/blocked 五种 action |

**权限模型：**
- 所有调用需要 exact live `exec.agent` + running status + open turn
- create/edit/pause/resume 额外需要当前 turn 含 accepted `{ kind: 'user' }` 消息
- complete/blocked 也可由 goal-sourced user/message（当前轮次）触发
- `blockedAfterConsecutiveRounds: 3`（默认）：模型自阻需连续 3 轮相同条件

**提示注入：** 固定 goal policy 文本（order 在 system prompt 中），说明何时创建、CAS 读取规则、resume 语义、complete/blocked 标准。

来源：`packages/goal/tool-goal/README.md`、`packages/plan/tool-goal/src/index.ts`。

### 4.3 `goal-round-driver`（自动续跑驱动）

**将 active + armed 目标转化为顺序轮次**。每轮 = 一个 goal-sourced `user/message` turn。

| 机制 | 语义 |
|---|---|
| **空闲检查点** | agent idle + active armed goal + 有剩余容量 → 预订下一轮 |
| **预订** | 保留 `{ goalId, revision, round: roundsStarted+1 }` + 渲染提示 → `Agent.followup()` |
| **pre-step 围栏** | 入口和出口双重校验：目标仍 active/armed、revision 未变、round 仍是下一个 |
| **人机竞争** | 人类消息到达 → 自动工作让行；混合批次拒绝自动提案 |
| **结算分类** | complete → 继续；cancel/aborted → pause+disarm；RATE_LIMIT/QUOTA → block(usage-limited)；error → block(turn-error)；max-tokens → block(max-tokens) |
| **无自动重试** | 所有异常停止后需人类显式 resume |

**层次：** Goal → Goal Round → Turn → Step。一轮 = 一个 policy 迭代 = 一个 session turn = 任意多 model/tool steps。

来源：`packages/goal/goal-round-driver/README.md`、`.agents/notes/implemented/feature/2026-07-19-same-session-goal-round-driver.md`。

### 4.4 `command-goal`（/goal 命令）

人类侧控制面：

| 命令 | 功能 |
|---|---|
| `/goal` | 显示当前目标状态 |
| `/goal <objective>` | 创建目标或替换已完成目标 |
| `/goal edit <objective>` | 编辑当前目标 |
| `/goal pause` | 暂停 + disarm |
| `/goal resume` | 恢复 + armed |
| `/goal clear` | 清除当前目标 |

命令输入不进入模型请求；mutation 通过 `goal/change` 事件持久化。支持图片附件作为目标参考图。

来源：`packages/goal/command-goal/README.md`。

---

## 5. 与社区 goal 插件的关系

| 社区插件 | 与内置 goal 的关系 |
|---|---|
| `dsh-goal-scaffold` | 在 pre-step 拦截大需求，nudge 用户先规划再 create_goal；**不修改 goal 域本身** |
| `dsh-goal-quiescence` | 在 `update_goal(complete)` 前检查子 agent 运行是否 settle+ack；**依赖内置 goal 的 complete 门禁** |
| `goal-acceptance` | 独立的验收标准引擎，通过自己的事件和工具工作；**不依赖内置 goal 域**（有自己的 start_goal/list_goals） |

---

## 6. 对 age-autonomy 的 Adopt / Adapt / Reject

### 6.1 Adopt

| 项目 | 理由 |
|---|---|
| **事件溯源 = 唯一权威** | goal 状态完全从 `goal/change` 会话事件折叠，无独立数据库。我们的 `events.jsonl` 已是同一世界观——goal 域的 last-wins 全快照折叠可直接参照 |
| **持久 phase ≠ 进程 activation 分离** | armed/disarmed 永不持久化，重启后必须人类显式 resume。这正是我们 mission-driver 应遵循的安全原则：mission 状态持久但自动执行权不持久 |
| **CAS revision 防旧引用** | 每次 mutation 递增 revision，调用者必须传当前 ref。防止并发/重启后的过时操作 |
| **严格重放 + 增量游标** | 格式错误/revision 不连续/非法转换直接拒绝，游标停在损坏处。我们 events.jsonl 的重放可参照此纪律 |
| **blocked 统一原因码** | 一个 `GoalBlockReason { code, message }` 覆盖所有停止原因（限额/配额/执行错误/人类输入依赖），不膨胀生命周期状态。简洁且可扩展 |

### 6.2 Adapt

| 项目 | 理由 |
|---|---|
| **轮次预算（maxGoalRounds）** | DSH 默认 256，按轮计。我们的 mission 应按 phase 计（plan 阶段数），语义不同但"有界续跑"原则可迁移 |
| **round-driver 的空闲检查点 + pre-step 双重校验** | 我们的 goal-loop 可参照"入口+出口双重校验"模式，防止异步 listener 在检查点后改变目标状态 |
| **结算分类表** | cancel→pause、RATE_LIMIT→block(usage-limited)、error→block(turn-error) 等分类是清晰的异常映射模板 |
| **/goal 命令不进模型** | 人类直接操作不消耗模型 token，mutation 通过事件持久化。我们 Mission Control 的直接操作也应遵循此原则 |

### 6.3 Reject

| 项目 | 理由 |
|---|---|
| **同会话限制** | DSH goal 故意不做 fresh-agent、不做会话前缀 fork、不做跨会话存储。我们的 mission 需要跨会话 resume + 可能的 fresh-agent 执行 |
| **单目标限制** | 我们的 roadmap 可含多个并行或嵌套 plan，单目标不适用 |
| **无独立评估器** | DSH 明确 defer 了"完成证据独立验证"。我们需要 CLOSURE_AUDIT 作为结构独立的第二代理 |
| **无调度/无重试** | DSH 把调度留给 policy 插件且不自动重试。我们的 mission-driver 需要内置的 flow DSL 调度和 maxRetries |
| **blockedAfterConsecutiveRounds 的模型自判** | 连续 3 轮相同条件由模型自己判断，无机械验证。我们应寻求更可靠的停止判据（如 DEEP_AUDIT findings_hash 平台期检测） |

---

## 7. 与现有调研文档的交叉

| 现有文档 | 与本报告的关系 |
|---|---|
| `dsh-goal-scaffold.md` | scaffold 是 nudge 层，引导用户走 create_goal 路径；不修改 goal 域 |
| `dsh-goal-quiescence.md` | quiescence 挂在 `tools/pre-execute` 拦截 `update_goal(complete)`；是 goal complete 的强化层 |
| `goal-acceptance.md` | acceptance 有独立的 goal 概念（`start_goal`），不依赖 `ctx.goals`；两套目标系统并存 |
| `dsh-goal-scaffold.md` §3 | "plan.md 模板活在提示串里、maxGoalRounds 靠模型自觉"——现在知道 maxGoalRounds 是由 `dsh-goal` 内部解析并持久化的，scaffold 的提示只是建议值 |

---

## 8. 风险与开放问题

1. **进程本地 activation 不持久**：重启后必须人类 resume。这对安全是优点，但对长时间 mission 的自动恢复是限制——需要在 mission-driver 层自己实现 resume 逻辑。

2. **单目标限制是设计选择**：DSH 明确说"parallel objectives intentionally absent"。如果 mission-driver 需要并行 plan，不能照搬。

3. **无独立评估器**：DSH 把"完成证据是否充分"留给模型判断（tool-goal 的提示策略）。我们的 CLOSURE_AUDIT 正是补这一层。

4. **round-driver 与 goal 域的紧耦合**：driver 通过 `Agent.followup()` + `GoalMessageSource` 注入轮次，pre-step 双重校验绑定目标 revision。迁移时需抽象为通用的 "续跑驱动 + 身份校验" 模式。

5. **blocked reason code 是 policy-owned**：DSH 留给 policy 插件定义 code（如 `round-limit`、`usage-limited`、`turn-error`）。我们应建立自己的 code 枚举。

---

## 源码索引

| 文件 | 行 | 内容 |
|---|---|---|
| `packages/goal/goal/src/types.ts` | 1-112 | GoalId/GoalRef/GoalSnapshot/GoalView/GoalPhase/GoalBlockReason/GoalMessageSource |
| `packages/goal/goal/src/runtime.ts` | 全文 | GoalService 实现（严格重放、CAS mutation、activation 管理） |
| `packages/goal/goal/src/domain.ts` | 全文 | goal/changed 事件定义、fold 函数 |
| `packages/goal/goal/src/index.ts` | ~183+ | GoalService Cordis 服务（ctx.goals） |
| `packages/goal/tool-goal/src/index.ts` | 全文 | get_goal/create_goal/update_goal 工具注册 |
| `packages/goal/tool-goal/src/authority.ts` | 全文 | 权限校验（exact live agent + user message attestation） |
| `packages/goal/goal-round-driver/src/index.ts` | 全文 | 空闲检查点、预订、pre-step 双重校验、结算分类 |
| `packages/goal/goal-round-driver/src/prompt.ts` | 全文 | 轮次提示渲染（JSON-quote objective） |
| `packages/goal/command-goal/src/index.ts` | 全文 | /goal 命令注册与分发 |
| `docs/subsystems/goal.md` | 全文 | Goal 子系统文档 |
| `.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.md` | 全文 | 设计决策文档 |
| `.agents/notes/implemented/feature/2026-07-19-same-session-goal-round-driver.md` | 全文 | Round driver 设计决策文档 |
