# goal-acceptance 调研报告（dsh-plugin-survey）

> | 项 | 值 |
> | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/goal-acceptance/`（pnpm monorepo，4 包） |
> | 来源 repo | `github.com/cckyros/goal-acceptance`（单 squash commit `2048352` 2026-08-20，push 2026-08-23；`dsh.plugin.json` v0.1.2，npm 文档口径 0.1.1） |
> | stars / 语言 / license | 2 stars（GitHub API，2026-08-24 查）/ TypeScript / MIT |
> | 宿主 API 面 | Cordis 包：`inject ['agents','tools','systemPrompt']`、SessionEventMap 五事件类型增广、`systemPrompt.section(order 115)`、`agent/turn-stopping` steering；invariant 伴侣包 `inject ['invariants']` + global `internal/dispatch`。另有 MCP stdio 与 OpenClaw 两个非 DSH 面 |
> | 与 R1 报告的关系 | R1 Pattern B 的源码级深化复核：事件类型/九工具名/set_task_plan 先锁标准——全部属实；两处需修正——工具注册表现返回 **13** 个（R1 漏多目标管理四件套），"invariant 校验跨会话唯一性"表述过强（见 §2） |

## 1. 定位

面向自主 agent 的验收标准驱动完成机制：开工前锁定不可变验收标准，执行中记录带证据的 pass/fail，标准可关联任务并声明依赖，最后阻止"必需标准未正式通过就宣布完成"。分层清晰：

| 包 | 角色 | 持久化 |
| --- | --- | --- |
| `goal-acceptance-core` | 零依赖状态机 + 类型 + 错误码（语义权威） | 无（Store 抽象） |
| `goal-acceptance`（DSH Cordis） | R1 所读对象；工具 + prompt + steering | session 事件流 / 内存 |
| `goal-acceptance-mcp` | MCP stdio server，跨 Claude/Cursor/Devin 等 | 每目标 JSON 文件 |
| `goal-acceptance-openclaw` | OpenClaw 原生插件，进程内注册工具 | （未读，见 §4） |

## 2. 架构与机制（全源码级）

### 2.1 事件 schema（5 类）

`core/src/types.ts:225-275`；append 时剥掉 type 键由 session 事件类型承载，validate 事件的 undefined evidence 被剥离（DSH store.ts:42-47）：

```text
goal-acceptance/set         { criteria[], lockedAt, role? }
goal-acceptance/validate    { criterionId, status, evidence?, validatedAt, evidenceType?, selfClaimed? }
goal-acceptance/task-update { taskId, taskStatus, updatedAt }
goal-acceptance/amend       { addedCriteria[], reason, amendedAt }
goal-acceptance/task-plan   { tasks[], plannedAt }
```

### 2.2 引擎不变量（core/engine.ts:206-666，applyEvent 幂等重放）

- set 一次性锁定（ALREADY_LOCKED）；id 唯一非空、描述非空。
- amend 仅锁后可用、reason 必填、新 id 不与现有冲突、打 `addedAfterLock/addedAt` 标——已有标准不可修改。
- validate：passed/failed 必带 evidence（EVIDENCE_REQUIRED）；role=agent（默认）时 passed ⇒ `selfClaimed=true`。
- confirm：仅限 selfClaimed 的 passed 条目；evidenceType 必须 ∈ {command,file,url}，text 拒收（LOW_CONFIDENCE_EVIDENCE）；落一条不带 selfClaimed 的 validate 事件即转正式通过。
- set_task_plan：必须先锁标准（:379-381，R1 引用点核实）、一次性锁定；校验含 id 唯一、**描述互不重复（歧义防护）**、deliverable 必填、依赖存在、禁自依赖、DFS 检环并报出环路路径（:136-166）。
- `canComplete()`（:557-578）：无锁定标准 → allowed；否则 allRequiredPassed 才放行；selfClaimed required > 0 且无其他未决 → 报 "awaiting reviewer confirmation"；否则报未决数。
- `summarize()`：formalPassed/selfClaimedPassed 分桶、readyToValidate（关联任务全 completed ∧ 依赖满足，拓扑序）、nextActionable（required 未决 ∧ 依赖满足，拓扑序）。

### 2.3 Cordis 服务层与持久化的必要限定

WeakMap per-agent 引擎；默认引擎绑 `agent.session`（SessionAcceptanceStore）。**必要限定**：`startGoal` 用 `InMemoryAcceptanceStore` 新建引擎并切 active（service.ts:61-69）——除首个目标外，后续目标在 Cordis 包里退化为内存态；每目标 JSON + current-goal.txt 重启恢复只在 MCP 包实现。R1 "authority is the session event stream" 仅对默认目标成立。

### 2.4 强制机制的真实形态——无 pre-execute 硬门禁

三层软强制（index.ts:43-150）：

1. system prompt 政策段（order 115）注入静态规则 + 实时摘要；
2. `agent/turn-stopping` 拦停转向：`autoSteerUncompleted` 默认 true、`maxSteeringTurns` 默认 5，按依赖优先级拼提醒（selfClaimed 找独立 reviewer confirm、任务进度 n/m、readyToValidate 点名、next priority、waiting-on-deps、无法验证标 blocked）；actionable 与 selfClaimedRequired 双空时放行关闭；
3. `can_complete_goal` 只是模型自愿调用的咨询工具。README 平台表自认：非 DSH 平台强制力 = "模型主动调用工具"，仅 DSH = steer 强制继续。

### 2.5 invariant 伴侣与工具面

invariant（invariant.ts）：安装时扫全部既有会话事件 + global 监听 session/event；校验**仅覆盖 goal-acceptance/set 的 criteria 数组非空这一条结构规则**。R1 "validates event structure and uniqueness across sessions" 中"跨会话扫描范围"属实、"uniqueness 校验"过强——查重是引擎运行时 validateSpecs 的职责。工具面（tools.ts:332）：13 个 = R1 列举的 9 个验收协议工具 + 4 个多目标管理（start_goal/list_goals/switch_goal/reset_goal）。

## 3. 对本项目的可用模式

- **Adopt — 协议词汇佐证 AGE 设计**：confirm_criterion 的"独立 reviewer + 高置信证据（command/file/url）、text 拒收" ↔ plan guide Rule 13（独立 closure audit，自审不得标记完成）+ conventions.md"未实际运行的命令不得报告验证成功"。amend-with-reason ↔ Rule 10 范围变更必须记录理由；blocked 状态 ↔ Why Not Blocking Closure 台账。同构无需引入代码，引用即可。
- **Adapt — evidenceType 四分类**：command/file/url/text 置信度分级值得吸收进 CLOSURE_AUDIT 审计工件 schema（若未来需要机器可查的证据枚举）；当前 AGE 审计记录为自由文本。
- **对照 WI13**：源码级确认"协议 + 提示 + 预算"路线的天花板——can_complete_goal 返回 allowed=false 后模型仍可无视继续说话；WI13 选 pre-execute deny 是宿主边界上对 write/edit 工具面真正不可绕的形态。两者不互替：acceptance 管判断内容，gate 管写入时序。
- **对照 frontmatter 改造后的完成派生**：selfClaimed/formal 两态分离正是改造提案要消灭的自陈通道——completed 从勾选派生、勾选被流程看守后，AGE 连 selfClaimed 概念都不需要存在。
- **Reject — 作为状态层与强制层**：session 事件流或 PLUGIN_DATA JSON 均非 git 内文件；steering-as-enforcement 是提示压力不是契约。R1 §6 Refuse 裁定经源码复核成立且更强（Cordis 包连硬门都没有）。

## 4. 风险与不适用面

1. **多目标持久化不一致**：首个目标 session 持久、start_goal 后续目标内存态——照搬必踩坑；MCP FileAcceptanceStore 整文件重写非原子 append。
2. **独立性仍是数据标志不是拓扑事实**：role='reviewer'/'dual' 只影响 selfClaimed 判定（engine.ts:290 仅判 role==='agent'），confirm 调用者身份未绑定到不同代理实例；evidence 只是字符串，真实性零机械验证——与 AGE"第二代理派发产生审计工件"有本质差距。
3. **预算耗尽静默放弃**：5 次 steering 用尽后不再提醒、无日志面——flow DSL 的降级是显式分类，这里没有。
4. rc 开发者预览 API；**诚实标注未读部分**：mcp-server.ts 读前 80/846 行、openclaw index.ts（503 行）、四个测试文件、英文 README 全文均未逐行读；34 tests 数目取自 AGENTS.md 自述。

## 5. 关键源码索引

| 内容 | 位置 |
| --- | --- |
| 事件 schema 五类型 | `packages/goal-acceptance-core/src/types.ts:225-275` |
| 引擎：锁定/amend/validate/confirm 不变量 | `packages/goal-acceptance-core/src/engine.ts:212-357` |
| 任务计划校验（查环 :136-166） | `packages/goal-acceptance-core/src/engine.ts:93-167` |
| canComplete 完成门禁 | `packages/goal-acceptance-core/src/engine.ts:557-578` |
| summarize 分桶与拓扑排序 | `packages/goal-acceptance-core/src/engine.ts:432-554` |
| SessionAcceptanceStore（session.append 适配） | `packages/goal-acceptance/src/store.ts:25-66` |
| 服务层 start_goal 内存态引擎 | `packages/goal-acceptance/src/service.ts:61-69` |
| 13 工具注册表 | `packages/goal-acceptance/src/tools.ts:332` |
| turn-stopping steering 循环（5 次预算） | `packages/goal-acceptance/src/index.ts:73-149` |
| invariant 伴侣（仅 set 结构校验） | `packages/goal-acceptance/src/invariant.ts:18-39` |
| FileAcceptanceStore（MCP 面） | `packages/goal-acceptance-mcp/src/store.ts:6-33` |
