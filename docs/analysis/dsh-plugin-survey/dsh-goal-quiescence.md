# dsh-goal-quiescence 调研报告（dsh-plugin-survey）

> | 项 | 值 |
> | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-goal-quiescence/` |
> | 来源 repo | `github.com/1052326311/dsh-goal-quiescence`（单 commit `660fff2`，push 2026-08-14） |
> | stars / 语言 / license | 1 star（GitHub API，2026-08-24 查）/ TypeScript / MIT |
> | 宿主 API 面 | cordis 事件 `subagent/start`、`subagent/end`、`tools/pre-execute`；服务注入 `agents/goals/subagents/tools`；peer 全套 `@deepseek-ai/*@0.1.0-rc.6`（开发者预览） |
> | 与 R1 报告的关系 | R1 Pattern A 的源码级深化复核：R1 引用逐条核实无误（见 §2 末核对表），补充 RunRecord 状态机细节与 ack 注入语义 |

## 1. 定位

解决 DeepSeek Harness Discussion #284 报告的 goal-mode 失败模式：父代理在后台 reviewer 子代理仍在运行时就调 `update_goal(action='complete')`，子代理结果到达时已无法影响已完成的 goal。本插件是一个**完成证据门**：goal 完成前，所有被观察到的子代理运行必须 (1) settle 且 (2) 其终态输出被显式回注到 goal 代理上下文。它不调度、不取消、不重试子运行，也不替代 goal mode——纯时序门禁，零产物。

## 2. 架构与机制（全源码级）

单文件 `src/index.ts` 195 行 + 一个真实宿主集成测试 150 行。无持久化，全部状态为两个进程内 Map。

### 2.1 RunRecord 状态机

R1 表述 "running → settled → acknowledged" 需要一处精化：`acknowledged` 不是第三个 phase 值，而是 settled 记录上的独立布尔位。完整记录（`src/index.ts:23-30`）：

```text
RunRecord = { rootId, goalId,          // 归属键 GoalKey
              runId, childId,           // 本次子运行标识
              phase: 'running' | 'settled',
              acknowledged: boolean,
              stopReason?, lastAssistantMessage?: ContentBlock[] }
```

- **归属键 GoalKey** = `{rootId: String(agent.id), goalId: String(goal.id)}`，由 `ctx.goals.get(agent)` 解析，且仅当 goal 存在且 `phase !== 'complete'`（:51-55）。
- **`subagent/start`**（:105-119）：`liveAgent(carrierKeyOf(this))` 校验事件载体确是注册表中的活代理 → `trackedGoal(parent)` 解析归属 = 自身活跃 goal ?? `childGoals.get(parent.id)` 兜底 → 建 running 记录并写 `childGoals[childId] = key`。该兜底使**子代理自己派生的孙运行也归因到祖父 goal**（一层传递归因）。
- **`subagent/end`**（:121-127）：按 runId 置 settled，抓取公开字段 `stopReason` 与 `lastAssistantMessage` 存入记录——这是插件唯一的数据采集点。

### 2.2 完成门禁

`tools/pre-execute` 监听器（:129-140）仅拦截同时满足三个条件的调用：

1. `exec.name === 'update_goal'`
2. `args.action === 'complete'`
3. `args.goal_id === 当前活跃 goalId`（goalKey 已解析且非 complete）

pending = running ∪ (settled ∧ 未确认)；非空即返回 `{ kind:'deny', reason:'GOAL_QUIESCENCE_PENDING: …' }`，reason 内点名恢复路径（先 status 查看 → 等 running settle → 对每个 settled 调 ack）。其他 update_goal 动作与直接服务调用不拦。README 明示边界自认：进程本地策略，覆盖插件加载后启动的运行与模型可见的工具路径；重启丢状态；端到端原子保证需要核心生命周期 permit。

### 2.3 两个有界工具与注入语义

- `goal_quiescence_status`（:142-167）：只读列 pending，上限 32 条 + omitted 计数，附 phase/acknowledged/stopReason。
- `goal_quiescence_ack(run_id)`（:169-193）：三重校验（记录存在 ∧ 属于当前 goal ∧ 非 running）后置 acknowledged=true。
- **注入语义的确切形态**：保存的 `lastAssistantMessage` 作为工具结果 JSON 返回，再经 render 函数拼成 `"Terminal subagent result:\n{JSON}"` 文本进入父代理上下文（render :66-75）。证据只经 ack 工具结果这一条通道回注——无后台推送、无落盘、无二次投递；不 ack 就永远不可见。

### 2.4 集成测试断言链

`test/harness.integration.test.ts:67-149` 挂载真实 ToolRuntime / GoalService / SubagentRuntime + deferred provider：

1. running 时 complete → isError 且内容含 GOAL_QUIESCENCE_PENDING，goal phase 仍 active；
2. settle 后未确认再 complete → 仍拒（"settled result" 文案分支）；
3. status 列出恰好 1 条 settled pending；
4. ack 工具结果含 CHILD_REVIEW_SENTINEL（子代理终态文本穿透到父上下文）；
5. 原 revision 不变地 complete 成功，goal phase → complete；
6. 另验证 carrierKeyOf(this) 作用域父即根代理（scopeParents 断言）。

### 2.5 R1 引用核对表

| R1 陈述 | 核实 |
| --- | --- |
| 195 行 | ✓ 恰好 195 |
| `inject: ['agents','goals','subagents','tools']` | ✓ :16 |
| 监听 subagent/start / end，内存 RunRecord map per goal | ✓（map 按 runId 键控，按 goal 过滤查询） |
| running → settled → acknowledged 三态 | △ acknowledged 是布尔位非第三 phase |
| deny reason `GOAL_QUIESCENCE_PENDING:` 前缀 | ✓ :138 逐字一致 |
| 双有界工具名 | ✓ status/ack 均在 |
| ack 把 settled 子代理终态消息回注 goal 代理上下文 | ✓ 经工具结果 render |

## 3. 对本项目的可用模式

- **Adopt — deny-until-condition + 结构化 reason 点名合法路径**：WI13 pre-execute plan-status 门禁的同族先例（R1 §6 "reinforcement, never replacement" 裁定经源码复核成立）。195 行做出完整闭环 + 真实管线测试，证明该模式实现成本极低；WI13 deny 文案"指引合法路径"的 UX 与之同构。
- **Adopt — 证据面消费纪律**：`SubagentRunEndInfo.lastAssistantMessage` 是 native-dispatch 结果文本的现成来源（R1 已裁复用）；本报告补其确切消费方式——只在裁判步显式读取一次（ack 工具结果），不做广播。对应 mission-driver 的 marker 提取应保持"由 CLOSURE_AUDIT 步显式取证"，而非事件广播。
- **Adapt — frontmatter 改造后的剩余价值**：讨论稿（`docs/discussions/2026-08-24-roadmap-plan-frontmatter-reform.md`）把 completed 变为纯派生后，"证据未 settle 就标记完成"从可伪造写入变成不可声称状态，quiescence 式拦截大幅收缩。可迁移残余是一条反向规则：DEEP_AUDIT/subflow 运行 unsettled 时 deny plan frontmatter 的 status 越权流转（WI13 新形态的可选 face，对应现 F1 in-flight face 的对偶）。但引擎 flow DSL 已时序化保证 EXECUTE→CLOSURE_AUDIT→BUILD_VERIFY，宿主侧门永远只是 reinforcement。
- **Reject — 作为独立性机制**：ack 由同一个 goal 代理自己调用、自己看证据、自己宣布完成。"gate ≠ reviewer"的教科书案例：门约束时序，评审产出独立判断工件；AGE 对应物是结构独立的 CLOSURE_AUDIT 第二代理派发 + 审计工件落盘。

## 4. 风险与不适用面

1. **进程内存状态**：重启失忆，对跨会话/跨天的 mission 执行完全不适用——不能当任务权威（R1 核心结论再次证实）。
2. **死锁面无逃逸**：子运行永不 settle 则 goal 永久 deny，无超时、无预算、无降级分类——flow DSL 的 maxRetries/maxTotalSteps 正是补这个缺口的。
3. **绕过面作者自认**：直接服务调用、插件加载前已启动的运行不可见；非原子核心事务。
4. **一层传递归因**：childGoals 只记 childId→parent key；测试只覆盖一层嵌套，更深层依赖每层 start 事件载体链正确。
5. 版本钉在 rc 开发者预览 API。诚实标注：tsconfig/.gitignore/pnpm-lock/pnpm-workspace 为样板/生成物未读；仓库不含 lib 构建产物（仅有 src/test）。

## 5. 关键源码索引

| 内容 | 位置 |
| --- | --- |
| inject 声明与插件名 | `src/index.ts:15-16` |
| RunRecord/GoalKey 定义 | `src/index.ts:18-30` |
| 归属解析 trackedGoal（含 childGoals 兜底） | `src/index.ts:88-90` |
| liveAgent 载体校验 | `src/index.ts:82-86` |
| subagent/start 记录 | `src/index.ts:105-119` |
| subagent/end 置 settled + 取证 | `src/index.ts:121-127` |
| pre-execute 完成门禁（GOAL_QUIESCENCE_PENDING） | `src/index.ts:129-140` |
| goal_quiescence_status（32 条上限） | `src/index.ts:142-167` |
| goal_quiescence_ack 三重校验 | `src/index.ts:176-193`（render :66-75） |
| 真实宿主集成测试全链 | `test/harness.integration.test.ts:67-149` |
| bundle patch 单行挂载 | `cordis.patch.yml` |
