# dsh-automation 调研报告（dsh-plugin-survey）

> 调研日期：2026-08-24。方法：源码级精读 `src/{domain,service,executor,recurrence,rpc,tools,index,types}.ts` 全文 + `docs/DESIGN.zh-CN.md` 全文比对 + 测试名清单核对；client 层仅结构级浏览（见 §4 末尾"未读部分"）。

| 元信息 | 值 |
|---|---|
| 本地路径 | `~/ai/dsh-plugins/dsh-automation/` |
| 来源 repo | https://github.com/titanwings/dsh-automation.git |
| 版本 / stars | v0.1.7（tag，HEAD 5ae28f2，2026-08-24）/ 约 73★（任务方提供，本地 git 无法核验） |
| 语言 / 运行时 | TypeScript（ESM，`.ts` 直接导入），Node ^22.19 或 ≥24；依赖仅 luxon + zod，peer react 可选 |
| License | MIT（Copyright 2026 dsh-automation contributors） |
| 宿主 API 面 | Cordis 插件：inject `storageDomain/agents/sessions/workspaceRegistry/agentDefaultModel/agentPresets/tools/connection`；executor 另用 `dsh-agent`(installModelSelection)、`dsh-llm`(createUserMessage+MessageSourceMap 扩展)、`dsh-sandbox-policy`(setSandboxMode)、`dsh-user-approval`(setApprovalPolicy)、`dsh-tools`(ToolExecution guard)；Web 端经 `connection.rpc.handle('/dsh-automation', …, {authority:'loopback'})` 与 slots 注入 |

## 1. 定位

DeepSeek Harness 的无人值守定时任务插件："在 fresh Agent 会话中按计划运行 coding task"。自我定义：**Automation = 持久意图 + 显式执行边界 + 可审计运行，而不是 cron + prompt**（DESIGN.zh-CN.md §1）。与宿主自带 `dsh-schedule`（同会话 reminder）、`dsh-loop`、`dsh-sentinel`（条件触发）明确划界；非目标包括 raw cron、full-access、DAG、跨 run 隐式记忆、exactly-once 外部副作用（§9）。双入口创建：Agent tools（6 个 `automation_*` 工具）与 Web UI（React client），执行权威统一收敛到 host-lifetime 单例 `AutomationService`。

## 2. 架构与机制

### 2.1 五组件分离的源码级验证

设计文档 §3.1 声称 Store/Clock/Executor/Tools/Web 分离，源码落点全部对上：

- **Store** = `domain.ts`（纯函数 + zod schema）声明两张 KvTable：`definitions`、`runs`（`automationDomainSpec`，version 1）。所有状态迁移是 immutable pure transform（`createDefinition/updateDefinition/setStatus/queuedRun`），每次 parse 全量校验，读旧记录时缺省字段规范化（如 reasoningEffort→null）。
- **Clock** = `recurrence.ts`（纯计算："哪个 occurrence 到期"，不碰 Agent）+ `service.ts` 的 pump/timer。pump 是单飞循环：`requestPump()` 用 `requested` 标志合并请求，经 `serialize()` 串行化后跑 `pumpOnce()`：claim 各 active 定义的最新 due → 启动 queued → `armNextTimer`。timer 延迟钳制在 `MAX_TIMER_DELAY_MS=2^31-1`（约 24.8 天，setTimeout 上限）；pump 失败退避重试 1–60s（`armRetryTimer`）。clock 在 Loader settle 后才 `start()`。
- **Executor** = `executor.ts`：只消费已持久化 claim 的 run，见 §2.4。
- **Tools** = `tools.ts`（agent-scoped，只调 service，不改表不设 timer）+ `index.ts` 挂载逻辑。
- **Web** = `rpc.ts`（loopback-only RPC adapter，手写参数校验）+ `src/client/*`（只读 snapshot + 显式 mutation，UI 不自算权威 due state）。
- **卸载对称性**（index.ts:73-134）：cleanup 逆序停 lifecycle 监听→removeRpc→逐 agent 卸载工具→service.dispose；dispose 内先清 timer，再 drain `operationTail`（防止已准入的 pump 卡在两次持久化写之间），然后 abort 全部 active run 并等 promise settle，最后关 domain——"不把已持久化规则假装成已执行"。

### 2.2 occurrence claim 的实现顺序（service.ts:383-409 `claimLatestDue`）

1. `latestDueOccurrence(schedule, now)` 取**最新一条** due occurrence（once 直接比较；interval 用 anchor 数学推导；daily 回看 2 天 / weekly 回看 8 天，limit 16——不物化 backlog）；
2. **激活边界**：`scheduledFor <= definition.updatedAt` 直接跳过（创建/编辑/resume 都推进 updatedAt，故恢复后只认未来 occurrence）；
3. 幂等查重①：related runs 中已存在同 `trigger==='schedule' && scheduledFor` 的记录则返回；
4. 构造 candidate：`occurrenceKey = automationId:definitionRevision:scheduledFor(规范化 ISO)`，`runId = 'run_' + sha256(key).slice(0,32)`（确定性 ID，domain.ts:200-210）；
5. 幂等查重②：`runs.get(candidate.id) !== undefined` 再挡一次（重启后重扫同一 occurrence 得到同一条 record）；
6. overlap/misfire 判定：若该自动化已有 queued/running（overlap）或 `age > misfireGraceMs`（misfire），写入 `skipped` 记录并带 `{code:'overlap'|'misfire', message}` 作为一等审计证据，然后做 retention 裁剪；否则 put queued。

即：**先持久化 queued claim，再启动 Agent**——这是 crash recovery 语义的前提。

### 2.3 RRULE 展开与时区处理（recurrence.ts）

关键发现：`rrule` 字段是**派生的展示/校验字符串，不是执行引擎**。`scheduleToRRule` 把 friendly form 编译为 RFC 5545 两行文本（DTSTART+RRULE），domain schema 读入时校验 `rrule === scheduleToRRule(schedule)`（防手改不一致）；但真正 due 计算 `occurrencesBetween` 是**自研 luxon 日扫描器**，逐本地日构造墙钟时刻再转 UTC。时区细节：

- 时区必须是显式 IANA 名（`IANAZone.isValidZone`）；instant 必须带显式 offset；
- spring-forward 不存在的墙钟时刻：`localCandidate` 校验 `value.hour===hour && value.minute===minute`，无效即返回 null **显式跳过不位移**（recurrence.ts:179-186，测试 "nonexistent spring-forward wall time is skipped, not shifted" 锚定）；
- fall-back 歧义时刻保持本地墙钟（luxon 默认取较早偏移，测试锚定 "keeps local wall time across fall-back DST"）；
- interval 是 UTC 毫秒固定速率算术，anchor 只定节奏不是一次 run，首次触发在整一个间隔之后；
- weekly weekdays 规范化为 MO→SU 序。

### 2.4 grace window 数值来源与 runs 有界 retention

- **grace window**：`index.ts:27` Config `misfireGraceMinutes` default **15**，范围 0–10080，`apply()` 中 ×60_000 转成 `AutomationConfig.misfireGraceMs`，仅两个消费点：claimLatestDue 的 age 判定、armRetryTimer 的回退基数。其余默认值：maxConcurrentRuns=2（1–32）、runTimeoutMinutes=60（1–1440）、historyLimit=200（1–5000）、archiveRunSessions=false。
- **有界 retention**（service.ts:581-596 `pruneWorkspaceHistory`）：按 workspace 分组后**每 automation 保留最新 historyLimit 条 terminal 记录**（queued/running 永不裁剪），在每个 run 到达终态写库后触发，另在 service open 时全量补裁（`pruneAllHistory`）。snapshot 展示层同样 slice(historyLimit)。删除 definition 保留 runs（`preserveRunHistory: true`）。
- **启动恢复顺序**（service.ts:110-124）：`recoverInterruptedRuns`（遗留 queued/running → failed + host_interrupted）→ `archiveTerminalRunSessions`（对所有仍带 sessionId 的 terminal 记录补试归档，先于任何裁剪，保证归档重试不因 retention 失去对象）→ `pruneAllHistory`。归档失败仅 warning，不改写已完成结果；无 unarchive API 时 client 把已归档结果显示为不可点击。

### 2.5 withoutInitiator + setup mount 的 executor 组合（executor.ts:149-163）

```ts
ctx.agents.withoutInitiator(() => ctx.agents.create({
  sessionId,                       // 'dsh-automation-session-' + UUID（稳定前缀即持久身份）
  meta: { cwd: target.cwd, agentPreset },
  agentOptions: { provider, model },
  setup: async agentCtx => {
    await ctx.agentPresets.mount(agentCtx, target.agentPreset)
    installModelSelection(agentCtx, { current: selection, assembled: undefined })
    setSandboxMode(agent.session, target.permissionPreset)
    setApprovalPolicy(agent.session, 'never')
    agentCtx.tools.guard(unattendedToolGuardReason)
  },
}))
```

要点：(a) `withoutInitiator` 切断与来源会话的归属/继承；(b) policy 安装发生在 Agent 发布之前；(c) 创建→`whenIdle()`→attach workspace→记录 firstSeq→才发 promptSnapshot（source.kind='automation' 写进消息 provenance）；(d) 结果从 durable turn/end + 最后一条 assistant 文本派生（截断至 2000 字符），不把"消息已投递"当成功；(e) timeout/cancel 经 Promise.race 后仍等 idle 并 flush session 再判结果。

### 2.6 fail-closed approval policy 的落地形态

四层叠加，缺一不可：

1. **run 内**：`setApprovalPolicy(session,'never')`——无人值守不能永远等一个不存在的人，等待本身被禁止；
2. **工具白名单**：`UNATTENDED_TOOL_ALLOWLIST` 显式枚举约 18 个 coding/检索工具，guard 对未知工具最终拒绝（deny-by-default），且单独封死 `bash/pwsh run_in_background`（后台进程逃逸通道）；
3. **权限快照**：permissionPreset 只有 `read-only | workspace-write` 两档（MVP 禁 danger-full-access），随 targetSnapshot 冻结进每条 run；
4. **创建侧人工闸门**（index.ts:36-46 `needsHumanApproval` + `tools/pre-execute` 钩子）：Agent 调 create/update/run_now/delete 一律转 `ask`，唯一豁免是"仅把 status 改为 paused 且无其他字段"的 update——即**制造未来无人值守工作必须过人，暂停不必**。这是 Schedule≠authorization 最容易被忽略的另一半。

另有纵深防御：automation 自己创建的会话**根本不挂载管理工具**（`ownsSession` 三重判定：sessionId 前缀 / runs 表 / 消息 source.kind==='automation' 的 durable provenance，service.ts:138-147），杜绝递归自我调度；guard 只是最后防线。

### 2.7 设计文档声称 vs 源码实现偏差核对

总体高度一致（crash→failed+code host_interrupted、overlap skipped、15min grace、"只物化最新一条"、归档失败仅 warning 不改写成功结果、启动先补归档再裁剪——均逐条对上）。发现三处细微出入：

1. **client wire 契约宽于 Host 状态集**：`client/protocol.ts:12,82` 的 `AutomationRunStatus` 含 `'interrupted'`、trigger 含 `'catch-up'`，但 Host 从不产出这两个值（中断= failed + error.code 'host_interrupted'）。属防御性渲染兼容/遗留字段，非行为偏差，但说明文档"failed(interrupted)"表述易误读为独立状态。
2. **"RRULE 展开"实为自研扫描器**：若按字面理解"DST 由 timezone-aware recurrence 计算"为 RRULE 库行为会踩坑；rrule 仅存储校验，调度真相在 luxon 扫描。
3. **创建侧人工闸门在设计文档中着墨极少**（§3.3 只讲 run 时边界；§7 未提 needsHumanApproval），实际是 index.ts 里独立的一层拦截器，属"实现强于文档"。

## 3. 对本项目的可用模式

本项目原则：状态只外化 roadmap/plan git 文件、插件零持久记忆、中断即暂停；在研线程为"roadmap 即队列"的连续自主队列。

### Adopt（直接采纳的语义/形态）

- **确定性 occurrence key → 稳定 ID**（§2.2 第 4-5 步）：roadmap-as-queue 需要 exactly-once 认领语义。可移植为 plan 条目键 `mission-id:revision:scheduled-marker` 的哈希，认领前后两次查重 + 确定性 ID，使"引擎重启重扫队列"天然幂等——且我们无需 store，键写回 plan/日志文件即可。
- **激活边界（updatedAt 排除过去）**：对应我们"中断即暂停后恢复，不回放错过的事项"。dsh-automation 把它做成 `scheduledFor <= updatedAt 即跳过`；我们的对应物是恢复时只认队头当前状态，不为停机期间"应发生而未发生"的事项补建记录。
- **skipped(overlap/misfire) 作为一等审计记录**：不隐式并发、不静默丢弃，跳过也要留 code+message。映射到 plan 文件：条目被并发跳过/超窗作废时写一行结构化 skip 记录，而非只改状态。
- **fresh-agent-per-run 组合**与我们 per-run child 完全同构：无 initiator 继承、policy 先装后发布、prompt 自包含快照（promptSnapshot+targetSnapshot 冻结）。值得采纳其"快照冻结"思想：plan 条目进入执行时冻结当时的指令段，后续 roadmap 修订不影响在途 child。
- **Queue≠approval**：三层移植——(a) 入队（roadmap 写入）≠ 允许自主执行，plan 条目加 approval 字段（required/auto），连续自主队列只消费 auto；(b) per-run child 工具面显式白名单、deny-by-default；(c) 无人值守路径 approval policy 为 never/fail-closed，绝不挂起等人。
- **小而硬的工程件**：乐观并发 expectedRevision（Web 编辑冲突提示）、RPC envelope fail-closed 解包（unwrapRpcResult）、unread 注意力标记、runNow 单飞拒绝（已有 queued/running 时报错而非排队）、timeout/cancel 后仍 drain 至 idle 再判结果、序列化单飞 pump + requested 合并标志。

### Adapt（需改造后使用）

- **grace window / historyLimit / maxConcurrent / timeout 参数化**：数值本身不可移植，但"difference 全部收口为具名 Config 且 zod 定界"的形态值得照搬为 mission-driver 策略参数（如 queue-misfire-grace、per-run-timeout、max-concurrent-children）。
- **"只物化最新一条 overdue"**：他们场景下合理（coding task 有副作用）；我们的队列项多为文档产出，可考虑放宽为"按序各认领一次"，但至少保留队头优先与上限。
- **crash 语义差异**：他们把中断终态化为 failed(host_interrupted) 且永不自动重跑；我们是中断即暂停、恢复续跑。根源是他们任务副作用重。可借鉴其**错误码枚举**（host_interrupted/persistence_error/definition_deleted/workspace_unavailable/timeout/executor_error…）作为我们 run 结果的分类词汇表。
- **有界 retention 思想**：我们不持久化运行历史（git log 即审计），但 plan 文件内的运行记录段应有"保留最近 N 条终态"的约定，防止文件无限膨胀——对应他们 historyLimit=200。

### Reject（因状态外化原则不需要）

- **KvTable durable store（definitions/runs 双表）**：插件拥有持久记忆，直接违反零持久记忆原则。我们的 definitions≈roadmap git 文件、runs≈plan 状态段+dev log，权威在 git，引擎内存态可随意丢弃（比他们的 timer disposable 更彻底）。
- **archiveRunSessions / Session 归档机制**：宿主概念，无对应物；但其"归档失败只 warning、不改写已完成结果"的边界纪律值得记取。
- **workspace 作用域模型与整个 Web client 层**（slots/RPC/locales/styles）：Mission Control 若复刻 UI，应基于本仓库自己的 Vue monitor，不引 React client。
- **消息 provenance 机制（MessageSourceMap 扩展）**：依赖宿主 dsh-llm 类型扩展点，我们没有等价注入面；审计靠 plan 文件记录即可。

## 4. 风险与不适用面

- **单进程一致性假设**：storage-domain 是单进程边界，多 Host 争抢同一 store 不支持（DESIGN §11）。我们若做多实例跑 mission-driver，"roadmap 即队列"必须自己解决跨进程认领（git 原子提交可作为锁的替代，但这是 dsh-automation 未回答的问题）。
- **Host 进程必须存活**：非 OS daemon；时钟是一次性 setTimeout 网，最长 24.8 天需重臂。长周期 mission 不宜依赖进程内 timer，应以外部触发/手动恢复为主。
- **sandbox 边界有限**：DSH sandbox 主要约束文件 effects，network/process 取决于 preset 工具面（§11）——照搬白名单时须重新评估我们 child 的工具面，不能假设同名工具同等安全。
- **zod 手写校验重复三份**：rpc.ts/tools.ts/domain.ts 各有一套近似但不相同的输入校验（modelFields/validateModelSelector/superRefine），维护成本可见；我们做同类分层时应单点化。
- **护栏数值是经验值**：interval 最短 5 分钟、once 必须未来时刻（create/update 双处校验）、summary 截断 2000 字符——移植时按我们 child 的真实节奏重新定界，不要照抄。
- **未读部分（诚实标注）**：`src/client/AutomationView.tsx`（713 行）、`helpers.ts`、`locales.ts`、`runtime.ts`、`navigation.ts`、`contracts.ts` 仅经 grep/入口文件了解结构与上述引用点，未逐行精读；`tests/*.test.ts` 仅通读测试名清单（未读断言体）；`lib/` 构建产物未读；README.md 未读全文；GitHub 端 issues/stars 无法从本地核验。client 层结论（含 §2.7 偏差 1）基于 protocol.ts/index.ts 全文与定向 grep，置信度中等。

## 5. 关键源码索引

| 主题 | 位置 |
|---|---|
| occurrenceKey / 确定性 runId | `src/domain.ts:200-228`（key 拼接、sha256 截断、manual nonce） |
| claim 顺序 + overlap/misfire | `src/service.ts:383-409`（claimLatestDue）；幂等查重两道闸 390/392 |
| 激活边界（updatedAt） | `src/service.ts:386-387` |
| latest-due 不物化 backlog | `src/recurrence.ts:72-98`（daily 2 天/weekly 8 天回看） |
| RRULE 派生与校验 | `src/recurrence.ts:44-64`；`src/domain.ts:85-87`（rrule 必须等于派生值） |
| DST 跳过/歧义处理 | `src/recurrence.ts:179-186`（localCandidate）；测试 recurrence.test.ts:51-69 |
| grace window 数值来源 | `src/index.ts:27`（default 15min）→ `src/index.ts:62`（×60_000）→ `src/service.ts:394-398` |
| 有界 retention | `src/service.ts:581-603`（pruneWorkspaceHistory/pruneAllHistory）；snapshot slice 175 |
| crash→failed(interrupted) | `src/service.ts:547-562`（recoverInterruptedRuns，code host_interrupted） |
| withoutInitiator + setup mount | `src/executor.ts:148-163`；prompt provenance 167-175；timeout/cancel race 177-202 |
| fail-closed approval 四层 | `src/executor.ts:22-42`（白名单+后台封禁）、159-160（sandbox+never）；`src/index.ts:32-52`（创建侧人工闸门） |
| ownsSession 反递归 | `src/service.ts:138-147`；工具挂载过滤 `src/index.ts:96-99` |
| 串行化泵与时钟 | `src/service.ts:347-381`（requestPump/pumpOnce）、502-527（timer 钳制与退避）、535-545（operationTail） |
| loopback RPC + expectedRevision | `src/rpc.ts:195-282`（authority:'loopback'）；乐观并发 `src/service.ts:260-263` |
| retention/归档启动序 | `src/service.ts:110-124`（open：recover→archive 补偿→prune） |
