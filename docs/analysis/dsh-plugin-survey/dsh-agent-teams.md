# dsh-agent-teams 调研报告（dsh-plugin-survey）

> 调研日期：2026-08-24。方法：通读 `src/` 全部服务端 TS 源码（types/state/scheduler/members/tools/events/index/snapshot + command 头部），对照 README/package.json/git 元信息与 release-notes。client/ Web 面板内部仅浏览文件清单未逐行读，见 §4 末尾诚实标注。

| 项 | 值 |
|---|---|
| 本地路径 | `~/ai/dsh-plugins/dsh-agent-teams/`（origin=NanmiCoder/dsh-agent-teams，main@912aae5，v0.1.13） |
| 来源 repo | https://github.com/NanmiCoder/dsh-agent-teams |
| stars | 本地副本无法核实（README 仅 npm/license badge），未联网确认 |
| 语言 / 规模 | TypeScript；src 服务端 11 文件 ≈3900 行 + client/ React 面板 ≈1100 行 |
| license | MIT |
| 宿主 API 面 | cordis ctx；inject = `tools, llm, subagents, systemPrompt, agents`（index.ts:56）；可选懒注入 `commands` / webServer / workspaceRegistry（index.ts:153,167-168）；peer 全家桶 `@deepseek-ai/dsh-*@rc.6~8` |

### 1.1 宿主 API 面逐项（源码实测用法）

| 宿主 API | 用法位置 |
|---|---|
| `ctx.subagents.startContinuable`（durable 子 agent 创建） | members.ts:336-351 |
| `ctx.subagents.followup(parent, childId, content)`（续用/唤醒） | members.ts:381-384 |
| `ctx.subagents.interrupt(childId, {kind:'ancestor'})`（中断 turn） | members.ts:401 |
| `provider.prepareContinuable / capabilities.persona / capabilities.toolFilter` 能力探测 | members.ts:318-333 |
| `ctx.subagents.registerContinuableSetup`（child 同步 setup 注入模型路由） | members.ts:196 |
| `runtime.followup` effect 包裹（retired guard 拦截 resume） | members.ts:421-438 |
| `ctx.agents.get(sessionId)` + `agent.status` + `agent.whenIdle()` | scheduler.ts:64-76、tools.ts:181-196 |
| `captain.steer(msg)`（running 中注入最近模型边界） | tools.ts:206-217 |
| `ctx.tools.register(defineTool(...))` 十工具注册 | tools.ts:229-1099 |
| `ctx.systemPrompt.section({name,order,text})` usage 协议注入 | index.ts:134-138 |
| `ctx.on('agent/status')` idle 边缘订阅 | scheduler.ts:298-302 |
| `session.append(type,data)` 会话事件（受 KNOWN_SESSION_EVENT_TYPES 门控） | events.ts:45-59 |
| `webServer.register` + `workspaceRegistry.list()` 懒绑定路由 | index.ts:165-251 |
| `ctx.inject(['commands'], ...)` 懒挂 slash 命令 | index.ts:152-156 |

## 2. 架构与机制

### 2.0 定位补充

DeepSeek Harness 的 host-plane 插件：任一 session 用自然语言即可变成 captain 建队。提供 10 个 `agent_teams_*` 工具（tools.ts:229-1099）+ 系统提示 usage 协议段（index.ts:94-105）+ Web 活动面板（DAG 任务树 + 成员 roster）。核心卖点全部对应我们的在研线程：**durable continuable 成员**（跨 turn、跨 harness 重启的子 agent）、**依赖感知任务**（未完依赖不可 claim）、**自动认领调度**（idle 边缘事件驱动）、**安全接管**（attempt 代际 revoke）、**直接邮箱消息**（成员互通免 captain 中继）。注释多处自述对标 Claude Code AgentTeams mailbox 模型（state.ts:6、tools.ts:5-8、members.ts:363-365）。

## 2. 架构与机制

### 2.1 持久形态（一切机制的基座）

状态在 `<workspace>/.agent-teams/<teamId>/`：`team.json`（全量 TeamState）+ `inbox/<agentKey>.jsonl`（每 agent 一箱）+ `retired-members.json`（全局 deny-list）+ `archive/<teamId>/`（删除即归档不销毁，state.ts:761-801）。所有 mutation 经 `withTeamLock` 进程内 promise 链按 teamId 串行（state.ts:38-49）；写盘走 temp+rename 原子替换，Windows EPERM 时降级直写并 AggregateError 上抛（state.ts:560-614）。读回在 JSON 边界做全量 shape 校验 `isTeamState/isTeamTask/isTeamMessage`（state.ts:671-717），坏记录直接拒载而非静默修复。

### 2.2 成员生命周期

- 记录：`TeamMember{id(空直到 spawn), name, role, provider/model/reasoningEffort 快照, joinedAt, status: idle|working|removed}`（types.ts:54-69）。创建时解析并固化 LLM route（members.ts:124-185），冷恢复时用同步 `readTeamSync` 在 child setup 边界还原模型选择（members.ts:196-233、state.ts:206-220）。
- 创建：`spawnMember` → `ctx.subagents.startContinuable`，label=`agent-teams:<teamId>:<name>`，注入 persona（memberPersona 自包含系统提示，members.ts:264-281）+ toolFilter deny 六个 captain 专属工具（members.ts:26-33,304-354）。provider 能力探测 fail-loud 在首次 spawn 时而非 mount 时（members.ts:318-333）。
- 续用（唤醒）：唯一原语是 `deliverToMember` → `ctx.subagents.followup(captain, childId, text)`（members.ts:373-390）。每条消息=一个新 turn，turn 结束回到 idle 等 next followup——这正是我们说的 "followup 续用"。
- 中断：`interruptMember` → `ctx.subagents.interrupt`（members.ts:399-405），fire-and-forget。
- 移除：先锁内 revoke 其全部 open attempt 并 requeue（tools.ts:431-437），再写持久 retired deny-list（state.ts:250-262）、interrupt、`waitForMemberIdle` quiesce（tools.ts:445-449）。retired guard 用 effect 包裹 `followup`，使被退休成员在任何路径下都无法再被 resume（members.ts:419-439）。

### 2.3 任务依赖状态机

- 状态表：`pending→claimed→in_progress→completed/failed/cancelled`，白名单转移表 + terminal 无出边（state.ts:105-126）；terminal 结果不可变，重做必须走 reassign（tools.ts:785-798）。
- 依赖门：纯函数 `unsatisfiedDependencies` —— 任一依赖非 completed 即阻塞 claim（state.ts:96-99），claim 工具内硬检查（tools.ts:702-704），调度器选任务时同样过滤（scheduler.ts:83-89）。可视化 blocked/open/running/completed 四态由同源规则派生（state.ts:841-854）。
- 单任务原则：一个 member 同时只能持有一个 open task（`memberOpenTask`，claim/reassign 前均检查，tools.ts:175-179,711-714,576-579）。
- attempt 代际（关键）：`beginTaskAttempt` 递增 `attempt` 并发新 `attemptId`(UUID) 作为执行能力令牌；`invalidateTaskAttempt` 清空 attemptId、置新 `handoffId`、status 回 pending、可选 reassigning=true（state.ts:128-163）。member 更新必须携带当前 attempt_id，不匹配即 stale 拒绝（tools.ts:781-783）——旧 owner 的迟到写入被结构性挡住。

### 2.4 自动认领调度（事件驱动，无轮询 turn）

`scheduler.ts` 监听 `agent/status` idle 边缘（scheduler.ts:298-302）+ 各工具尾部 kickTeam/kickMember（如 tools.ts:396,530,822）。`kickMember` 序列化队列保证单 member 不并发派发（scheduler.ts:114-139）：先投递 mailbox fallback 邮件（优先于新任务，ack 后才标记已读，scheduler.ts:165-189），再在 team lock 内 fresh-read 选 ready task：pending + 非 reassigning + 依赖满足 + assignee 匹配自己或 unassigned（scheduler.ts:83-89）。派发 prompt 要求 member 重新调 `claim_task` 拿同一 attempt_id（scheduler.ts:91-102）。投递失败只回滚自己那次 exact attemptId，并发 handoff 已换代则胜出（scheduler.ts:244-260）。

### 2.5 安全接管与冷恢复

- **接管语义（两阶段 handoff）**：reassign_task 锁内 invalidate（旧能力即刻失效）→ 锁外 interrupt 旧 owner 并 `waitForMemberIdle` quiesce → 再锁内校验 handoffId 未变才落地新一代 attempt；captain 接管即 `assignee="captain"`（tools.ts:561-635）。`reassigning=true` 期间任务对 scheduler 和 claim 都不可见（scheduler.ts:84-85、tools.ts:670-672）。
- **parked vs cold-recovered（最精巧的区分）**：resident 成员 idle 时若仍持有 open attempt，其 attemptId 存入进程内 `parkedAttempts` map 并保持 parked——这是"用户暂停/等待指导"语义，自动重试会 revoke 合法等待中的工作（scheduler.ts:114-120,196-209 注释）。只有 attemptId **不在** parked map 的 owned open task 才恢复重试——进程重启后 parkedAttempts 为空，stranded attempt 自然被补跑（cold recovery）。即：**自动重试专属于"无人观测的持久能力"**。
- **崩溃面收敛**：retired deny-list 防 resume 已删成员；add_member 写 team.json 失败时回收孤儿 child（recordRetired + interrupt，tools.ts:367-378）。

### 2.6 Mailbox 持久形态与三态投递

消息 `{from,to,content,ts,deliveryClaimedAt,deliveredAt,readAt}`（types.ts:72-86）append 到接收者 JSONL。投递三态：captain 在线且 running → `steer()` 注入最近模型边界（'live'）；member 收件人 → followup 唤醒（'wake'）；否则仅落盘（'mailbox'）（tools.ts:843,894-935）。60s delivery lease 防崩溃投递与后续投递竞态，超时自动可重试（state.ts:24-25,411-422）。坏行跳过保整箱可读（state.ts:385-400）。注意 appendMailbox 实为整读重写而非 OS append（state.ts:346-364），靠 team lock 保序。

### 2.7 Web 面板数据面

`/plugins/dsh-agent-teams/state` 读磁盘 truth + `ctx.agents` live activity enrich（index.ts:175-195、snapshot.ts:92-164）——模型漏调 update_task 时面板仍正确，因为磁盘才是权威（snapshot.ts:4-8 注释明说）。团队级 mutation 同时向 captain session append 事件供前端 conversation node 折叠（events.ts:33-60，harness 不识别的类型优雅降级跳过并去重日志）。归档团队走 `?archived=1` 独立投影：includeRemoved + historic，保留被移除成员与全部任务史（snapshot.ts:209-232）。激活面有两条确定性入口：闭命名空间 `/agent-teams` host 命令 + `agent/pre-step` 手势边界识别用户消息首 token（command.ts:1-27），仅扫 `source.kind==='user'` 防注入伪造。

## 3. 对本项目的可用模式

对照线程：drafter/reviewer 角色池（create-on-first-use、followup 续用、idle TTL dispose、崩溃 resume、组内轮换防 anchoring）+ 我们插件的零持久记忆红线。

**Adopt（直接采纳语义）**

- **attempt 代际 capability**（§2.3）：takeover 必须先 revoke 旧 attemptId 再开新一代，迟到写入被令牌失配结构性拒绝——比布尔标志严格得多，是我们 takeover-revoke-stale-attempt 的直接实现范本。mission-driver 的 EXEC/DEEP_AUDIT 重试可引入同样的 `attempt++ + attemptId` 双字段。
- **parked vs cold-recovered 分界**（§2.5）：resident idle ≠ 死亡，不应自动抢走其 open 工作；只有进程重启后"无人认领的持久 attempt"才自动恢复。这正好回答我们"followup 续用 vs 崩溃 resume"的分界线问题——判据是**能否观测到该能力的 resident 持有者**，而不是时间戳。注意其 parked 记录本身是进程内存（scheduler.ts:118-120 注释自述"A cold process starts with an empty map, so durable open attempts are still recovered after restart"），我们若要等价语义需把 parked 标记放进引擎自己的会话内状态。
- **依赖门作为 claim 前置纯函数** + 白名单转移表：小而完备，可直接搬进任务状态机设计；`taskVisualState/taskDepthsById`（state.ts:841-882）演示了同一规则如何派生出 DAG 泳道可视化，对 Mission Control 面板的 roadmap 依赖展示同样适用。
- **retired deny-list**：dispose 后永久禁止 resume 的持久边界，防"僵尸成员复活"。我们 idle TTL dispose 后若 session id 可能被复用，需要等价物（可降级为引擎内存中的 retired set）。
- **JSON 边界 shape 校验**（§2.1）：坏记录拒载不静默修复，适合任何持久/半持久状态的读取口；mailbox 读还带 malformed-line 回调让面板可告警（tools.ts:982-1009）。

**Adapt（改造后用）**

- **idle-edge 事件驱动调度**：agent-teams 用 status hook 替代 Claude Code 的轮询 turn（scheduler.ts:1-13 注释明说）。Mission Control 可用同类边缘触发驱动 drafter/reviewer 池，省掉常驻 poll turn。其派发 prompt 模板（scheduler.ts:91-102）也值得抄：要求 worker 重新 claim 拿同一 attempt_id、声明 stale 即停手、"只做本任务然后 idle"，把协议写进提示词而非依赖模型自觉。
- **两阶段 handoff**（invalidate → quiesce → commit 新代）：我们的组内轮换防 anchoring 可复用此骨架，但 agent-teams 本身**没有自动轮换**——reassign 永远是 captain 决策，且目标 member 忙时直接拒绝（tools.ts:576-579）。轮换策略（何时换人、换给谁）需我们自研，只借它的换代协议。
- **mailbox lease 三态**（claimedAt/deliveredAt/readAt + TTL）：若 Mission Control 未来需要跨 turn 交接记录，这套租约语义比裸队列稳；但须降级为内存形态。"先落盘后投递、ack 才算送达、失败释放租约"的顺序在内存里同样成立（先入引擎队列再 followup）。
- **锁内 fresh-read**（每次操作重新 readTeam 而非信任调用方缓存，tools.ts:126-155）：多 agent 并发写的最小正确性保障，适配我们引擎内共享池状态；配套的"授权检查先于幂等返回"注释（tools.ts:688-690）是并发 claim 不误报成功的关键细节。
- **create-on-failure 回收**（tools.ts:367-378）：子 agent 已 spawn 但状态写失败时立即 retire+interrupt 孤儿——我们 create-on-first-use 池成员的失败路径需要同款补偿逻辑。

**Reject（违反红线或不适配）**

- **全量磁盘持久化**（team.json/inbox/archive/retired-list）：正面撞上我们插件零持久记忆红线。agent-teams 敢把一切落盘是因为它自我定位为"host-plane state，插件拥有这份 bookkeeping"（state.ts:10-12）；Mission Control 的定位相反——池状态应留在 mission-driver 引擎进程/会话内，最多借用其 schema 形状。
- **captain 中心授权 + 每 tool 全量校验**：对我们过重；但"锁内重新推导 caller 身份"的思想保留。
- **Web 面板直读磁盘**：无独立持久层时无意义；面板数据源应是引擎内存快照接口。

## 4. 风险与不适用面

- **强绑定私有宿主 API**：cordis effect/inject、`startContinuable/followup/interrupt/steer`、`registerContinuableSetup` 同步 setup 边界均为 DeepSeek Harness rc 版 API，代码零移植价值，只有语义可移植。
- **单进程假设**：withTeamLock、parkedAttempts、memberQueues 全是进程内结构；两个 harness 实例共享 workspace 会绕过全部互斥，parked 判定也会互相失真（对方进程 restart 即误判 cold）。我们若多进程跑 mission-driver，不能照搬。
- **性能天花板**：appendMailbox 与 mutateMailbox 整文件重写 O(邮箱大小)；findTeamByCaptain/Participant 每次 O(team 数) 全目录扫描（state.ts:270-332）。小团队场景够用，长生命周期高频消息会退化。
- **quiesce 无超时上限**：waitForMemberIdle 只受 caller signal 约束（tools.ts:181-196），卡死的 member 会挂住 reassign/delete。
- **诚实标注未读部分**：`src/client/` 七个文件（activity-monitor/activity-model/panel-geometry/locales/card-definition/artwork/session-navigation）仅知职责清单未逐行读；command.ts 尾部 gesture 正则细节、event-types.ts 全文、scripts/verify*.mjs、skills/dsh-plugin-development、docs/*.md 均未展开。本报告结论不覆盖这些区域。

## 5. 关键源码索引

| 主题 | file:line |
|---|---|
| TeamState/TeamTask/TeamMember/TeamMessage 类型与 attempt/handoff 字段 | src/types.ts:24-104 |
| 任务状态白名单转移表 | src/state.ts:105-126 |
| attempt 代际 activate/begin/invalidate | src/state.ts:128-163 |
| withTeamLock 进程内串行队列 | src/state.ts:38-49 |
| unsatisfiedDependencies 依赖门 | src/state.ts:96-99 |
| retired deny-list 读写 | src/state.ts:232-262 |
| mailbox append/read/lease/ack（60s lease） | src/state.ts:346-501 |
| 原子写 + Windows EPERM 降级 | src/state.ts:560-614 |
| 归档不删数据 archiveTeamDir | src/state.ts:761-801 |
| JSON 边界校验 isTeamState 等 | src/state.ts:632-717 |
| 成员 persona / denied tools / spawnMember(startContinuable) | src/members.ts:26-33,264-281,304-354 |
| followup 续用 deliverToMember / interrupt | src/members.ts:373-405 |
| 冷恢复模型路由 readTeamSync + registerContinuableSetup | src/members.ts:196-233、state.ts:206-220 |
| retired guard 包裹 followup | src/members.ts:419-439 |
| 调度器 parkedAttempts / kickMember / 失败精确回滚 | src/scheduler.ts:114-120,154-262 |
| idle 边缘订阅 syncMemberStatus | src/scheduler.ts:265-302 |
| reassign 两阶段 handoff / captain 接管 | src/tools.ts:561-635 |
| claim_task 依赖门 + 单任务检查 | src/tools.ts:662-731 |
| update_task stale attempt 拒绝 + terminal 不可变 | src/tools.ts:764-825 |
| send_message 三态投递 live/wake/mailbox | src/tools.ts:851-936 |
| remove_member 安全移除流程 | src/tools.ts:422-457 |
| delete 归档化收尾 | src/tools.ts:1057-1099 |
| 面板快照磁盘 truth + live enrich | src/snapshot.ts:92-164 |
| 事件 append 到 captain session | src/events.ts:33-60 |
