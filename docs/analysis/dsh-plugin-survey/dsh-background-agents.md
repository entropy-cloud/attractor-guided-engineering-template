# dsh-background-agents 调研报告（dsh-plugin-survey）

> 调研日期：2026-08-24。方法：通读 `src/` 全部核心 TS 源码（index/lifecycle/tools/facts/audit/events/vocabulary/projection/projection-schema + client 三件套），对照 README/package.json/git 元信息。**未逐行阅读部分见 §4 末尾诚实标注。**

## 元信息

| 项 | 值 |
|---|---|
| 本地路径 | `~/ai/dsh-plugins/dsh-background-agents/`（浅克隆，main@1cc6c8e） |
| 来源 repo | https://github.com/PerryLink/dsh-background-agents |
| stars | ≈5（web 搜索快照，本地无法证实） |
| 版本 / 语言 | v0.5.6；TypeScript（node 半边 + React client 半边），编译产物 `lib/index.js`(7321 行)/`lib/client.js`(5406 行) 直接入库——`src/` 才是真源码，下文引用均指 `src/` |
| license | Apache-2.0 |
| 宿主要求 | DeepSeek Harness peer `>=0.1.0-rc.8 <0.2.0`，Node `^22.19 \|\| >=24`；权限声明 `session:append`/`subagent:spawn`/`tools:register` |

宿主 API 面逐项（源码实测用法）：

| 宿主 API | 用法位置 |
|---|---|
| `ctx.subagents.getProvider(name)` + `provider.prepareContinuable` 能力探测 | index.ts:240-248（加载期 fail-loud）、tools.ts:309-315 |
| `ctx.subagents.startContinuable({provider,label,request:{prompt,parent,toolFilter,persona,maxDepth,agentOptions},signal})` → `{childId,messageId}` | tools.ts:348 |
| `ctx.subagents.followup(parent, childId, blocks, {source:{kind:'coordinator',form:'relay',senderSessionId}, signal})` → messageId（冷子会话由此复活） | tools.ts:427；lifecycle.ts:232（wakeup 投递走 `Agent.followup(message)`） |
| `ctx.subagents.interrupt(childId, {kind:'ancestor', agent:parent})`——同步 fire-and-return，不 await 拆除 | tools.ts:756；lifecycle.ts:284 |
| `ctx.subagents.listChildren(id, signal)` / `listDescendants(id, signal)`（后者行含 `parentId`/`depth`） | tools.ts:553/576/660/746；lifecycle.ts:356 |
| `Session.append(type, data, {ignorable:true})` → 返回信封用于探测 | facts.ts:52 |
| `Agent.inject(message)`（quiet：并入父下一次模型请求）/ `.status`（`running`…） | lifecycle.ts:234/261；tools.ts:198-203 |
| `ctx.on('session/event', (session,event))` 观察子会话事件流 | index.ts:290 |
| `sessionProjections.register(def)` + `registry.snapshot(session).values.backgroundAgents` | index.ts:310；projection.ts:114 |
| `sessionPersistence.load(id)`（settled 子会话离场后读持久日志） | tools.ts:674 |
| `systemPrompt.section({name,order,text})`（反轮询指令注入） | index.ts:318-337 |
| cordis：`inject[]`/`effect(fn,name)`/`get()`；client 侧 `slots.inject('sidebar.footer.action'\|'settings.section')`、`sessions.list/binding().projections.faceOf()/openSubagent/refreshSubagents`、`api.subagents.{interrupt,prompt,history}`、`remote.commands.execute('/room …')` | index.ts:51/271/305；client/index.ts:52/157/176/193/211/238 |

## 1. 定位

把宿主的 fire-and-forget 后台作业升级为**交互式长时会话后台 agent**：(1) 五个驾驶工具（`background_agent`/`bg_message`/`bg_list`/`bg_result`/`bg_stop`），全部是官方 subagent seam 的薄适配器；(2) 自动进度回报 + 空闲归档生命周期；(3) `backgroundAgents` 会话投影 + Web 侧栏面板；(4) v0.5+ 团队房间（存储域持久多 agent 房间）。明确不做调度（schedule seam 归别家）、跨机 agent、改动官方激活契约。所有状态经宿主自有通道持久化——**插件自身只有内存缓存，无第二事实源**（lifecycle.ts:2-7），与本仓库「状态只外化、插件零持久记忆」同构。

## 2. 架构与机制（源码级）

### 2.1 双通道纪律（结构化 fact ⟷ 模型可见 notice）

每次生命周期动作同时写两条互为冗余的通道：

- **结构化通道**：`background-agents/fact` 以 `Session.append(type, data, {ignorable:true})` 追加到**父会话日志**（log-only，不进模型上下文）。闭联联合五种 `kind`：`registered{agentId,label}`/`message{agentId,messageId}`/`stop{agentId}`/`progress{agentId,text}`/`archived{agentId}`（events.ts:26-57）。
- **模型可见通道**：`createUserMessage` 注入 `user/message`，`source:{kind:'plugin',plugin:'dsh-background-agents',form:'notice'}`，正文用规范前缀 `` [background-agent <id>] progress|archived: <text> ``（vocabulary.ts:28-59 的 `noticeLine`/`parseNotice` 往返）。
- **legacy 通道**（兼容 v≤0.2 日志）：`tool/result.presentationMeta` 携带 `{plugin,action,agentId,…}`（vocabulary.ts:107 `isBackgroundAgentsMeta` 运行时守卫）。
- **官方 settled 通知**：`source.kind==='subagent-settled'` 折叠为 `inactive` 行，只折本插件跟踪过的孩子（projection.ts:241-259）。

投影折叠时按行记 `source:'legacy'|'event'` 溯源列：一旦结构化事件拥有该行，legacy 折叠短路跳过（projection.ts:176/219），双写不重复计数；`stateVersion:2` 变更即弃旧缓存重放（projection.ts:281）。折叠只读宿主已知事件类型，**重开即可全量重建，无独立数据库**。

### 2.2 生命周期策略：cap / throttle / archive

- **cap**：`maxBackgroundAgents=4`（每父会话非归档数）。计数以 `listChildren` 持久目录为准，减去投影中 `activity==='archived'` 的 id；目录抛 `SubagentError` 时退化为内存注册表计数（lifecycle.ts:348-369）。注意这是含内建 `subagent` 工具所启 continuable 子会话的**共享预算**。
- **per-parent gate**：`startGates Map<parentSessionId, Promise>` 把「count→cap 检查→start」临界区串行化，两个并发 `background_agent` 不能都通过 cap=1；finally 释放且尾键自清理（tools.ts:223/317-372）。
- **throttle 水印**：每个 `TrackedChild` 带 `lastActivityAt`（任意子会话事件经 `touch()` 刷新的空闲水印）与 `lastReportAt`（上报水印，哨兵 `-1`=从未上报，**首报永不被节流**，lifecycle.ts:92-93）。`turn/end` 时 `reportProgress` 判 `lastReportAt>=0 && now-lastReportAt<15s` 则跳过（lifecycle.ts:215）；投递分两档：`quiet`→`parent.inject`（并入下次请求）、`wakeup`→`parent.followup`（空闲起父回合、忙时排队）。进度文本取子会话最后 assistant 文本（**不回落 reasoning**），压平截断至 300 字符。成功后 `noteReport` 推水印 + 写 `progress` fact。
- **archive**：60s 扫描一遍，静默 ≥120min 且**不在 running**（长时间工具调用不发事件、会被误判空闲——live `status==='running'` 先行豁免，lifecycle.ts:261）则归档：注入 archived notice → 对驻留激活发 `interrupt`（try/catch 包住，fire-and-return）→ 写 `archived` fact → `lifecycle.archive`；下一轮扫描删缓存条目（lifecycle.ts:312-314）。单子失败不阻断兄弟（逐个 contain）。

### 2.3 数据流与五个工具面各自封装的宿主调用

```
background_agent ─ getProvider→prepareContinuable 校验 → 过 gate → 计数cap → 参数校验(tool_filter只减不增/
                  allowedChildTools 白名单、max_depth≤配置顶、label 截120) → startContinuable → register+registered fact
bg_message      ─ followup(父授权 relay) → 冷子复活并重新 register(label=''保留投影旧标) → message fact（归档行折回 running）
bg_list         ─ listChildren|listDescendants × 投影 facts 合并行；activityOf：archived>running(live)>idle(live)>
                  settled(fact inactive)>ready；坏行出 diagnostics(corrupt/unsupported/unavailable)；目录挂→显式 unrecoverable，绝不伪造空表
bg_result       ─ 归属判定(facts 优先,listChildren 兜底) → 活会话或 persistence.load 读日志 → finalAssistantOutput 取文本，
                  reasoning 回落打 textSource 标 → resultMaxChars=4000 截断打 truncated 标
bg_stop         ─ 目录仅做发现不做权威（SubagentError 吞掉不禁用 stop）→ interrupt(ancestor=精确活父) → stop fact →
                  {outcome:'interrupt-requested'|'not-found'}；只停当前回合，已排队消息留收件箱
```

中断全程**请求而非击杀**：teardown 属 continuation manager（tools.ts:697-703 描述即契约）。

### 2.4 投影行状态机（折叠视角）

`backgroundAgents` 每行的 `activity` 由折叠事件单向推进，UI 与 `bg_list` 共用同一词汇：

| 事件 | activity 转移 | 备注 |
|---|---|---|
| `registered` | → running | 开行，messageCount=1（首个 task 即一条投递） |
| `message` | → running | messageCount+1；**archived 行由此折回 running**（bg_message 唤醒的持久面） |
| `progress` | → running | 刷新 lastMessage |
| `stop` | 不变 | 仅记 stopRequestedAt 时间戳 |
| 官方 settled notice | → inactive | lastMessage=settled summary |
| `archived` | → archived | 记 archivedAt |
| live 注册表叠加 | running/idle | 只在展示层（presenter/bg_list）叠加，不进折叠态 |

### 2.5 Web UI 零 RPC 行来源

面板行**不经任何自定义 RPC**：`useSessions(snapshot => buildAgentRows(snapshot))` 纯函数从会话列表快照读各父会话的 `projectionValues.backgroundAgents`（运行时 zod 守卫），叠加快照里子会话 `running` 位得四态展示（presenter.ts:62-98；组件 BackgroundAgentsAction.tsx:174）。四个动作走官方 wire RPC：跳转=`refreshSubagents+openSubagent`、停=`subagents.interrupt`、发消息=`subagents.prompt`、结果偷看=`subagents.history(maxMessages:4)` 只读转录、**从不激活子 Agent**（client/index.ts:163-224）。团队房面板则全部写操作经 `remote.commands.execute('/room …')` 保宿主命令生命周期（client/index.ts:234-245）。

## 3. 对本项目的可用模式（Adopt / Adapt / Reject）

服务对象：DSH 插件 "Mission Control"（`mdcontrol.run` 异步作业契约：启动即返句柄、引擎 detached in-host 自驱、终态可选 followup 回执）；在研线程：里程碑进展反向通知。

**Adopt**
1. **双通道纪律 → 里程碑通知骨架**：里程碑事件写结构化 ignorable fact（UI/审计折叠用）+ 模型可见 notice（`[mission <runId>] milestone: …` 规范前缀往返解析）。我们的优势是状态已外化 roadmap/plan，fact 只需承载「指针+摘要」，比它的五 kind 更瘦。
2. **节流水印三件套**：per-run `lastReportAt=-1` 哨兵（首里程碑必达）、任意活动刷新 `lastActivityAt`、报告成功才推水印；`quiet/wakeup` 两档投递直接映射「followup 回执可选性」。
3. **协作中断语义**：stop=请求中断、outcome 枚举、目录只发现不权威（目录故障不禁用 stop）、「只停当前回合不动队列」——与本项目「协作式中断永不杀进程」逐字同构，可直接抄契约措辞与实现分层。
4. **FactAppender 探测**（详见 §4）。
5. **UI 零 RPC 行来源**：run descriptor 行从宿主会话投影折叠，动作走官方控制面 RPC——正是「插件零持久记忆」的 UI 形态，Mission Control 面板照此形态设计。
6. **反轮询 systemPrompt 注入**（index.ts:318-326）：「完成会通知你，不要忙轮询」应随 mdcontrol 工具一起下发。
7. **DEFAULTS 单源默认值纪律**（index.ts:138-159）：Schemastery schema 与直接 `apply()` 兜底共用同一常量，两处永不漂移；mdcontrol 的作业策略参数（throttle、回执开关）照此收敛。
8. 落到具体设计：mdcontrol 里程碑 fact 可裁成三 kind——`started{runId,roadmapRef}`/`milestone{runId,text}`/`finished{runId,outcome}`，notice 前缀 `[mission <runId>] milestone: …`；finished 即「终态可选 followup 回执」的结构化对偶，quiet/wakeup 决定回执是否打扰主对话。

**Adapt**
1. `wakeup` 投递：mission-driver 引擎自驱、无需父会话唤醒执行，但「里程碑通知进主对话」若要做，busy 时入 inbox FIFO + idle 才起 turn 的语义需配大 throttle（README 明示 pairing）。
2. 投影 `stateVersion` 弃缓存机制：Mission Control 投影字段演进时防旧快照垃圾重放。
3. `unrecoverable` 显式标记纪律：run 状态面查询失败时报错不造假空表。
4. 「内存注册表只是 cache、丢了只损失 throttle/timer」的定位声明：mdcontrol 的 run 表同样应声明可全量从 roadmap/log 重建。

**Reject**
1. team rooms 整个半边（存储域/消息总线/任务板/approval handoff，~2900 行）超出本次需要。
2. `tool_filter`/`persona`/`max_depth`/`childProvider` 子 agent 定制面：mission-driver 用 roadmap/plan 外化约束，不裁剪子工具面。
3. idle-archive sweep：detached in-host 任务无「静默子会话」概念，暂无对应物。
4. 其 scheduling 边界之外的任何调度想象——它自己也不做调度，边界声明与我们一致，无需引入。

## 4. 风险与不适用面

1. **ignorable append 兼容坑（最重要）**：`Session.append(type,data,{ignorable:true})` 在已发布 rc.1–rc.8 全线**静默丢弃 options bag**，fact 事件落地为 unmarked，更严格宿主 resume 时抛 `SessionFormatUnsupportedError`——日志永久污染（audit.ts:5-9）。其防御值得整段抄：
   - 三态 `unknown/supported/unsupported` 单实例门闸（facts.ts:32）；
   - 先 `createRequire('@deepseek-ai/dsh-session/package.json')` 解析 peer 版本预检（正则 rc.N≤8 判 unsupported，audit.ts:49-53）；
   - 版本不可解时**首次 append 后探针返回信封**是否带 `ignorable===true`，一次定性（facts.ts:75-83）；
   - 判负后一次性告警 + 永久跳过 fact 追加，durable store/notice/工具照常工作，投影退化为空 fold；
   - `allowUnmarkedFacts` 显式危险逃生口默认 false；append 异常逐次 contain、绝不打扰主操作（facts.ts:51-56）。
   - 对我们的映射：若 DSH 宿主 mdcontrol 需要 append 结构化回执，必须复制这套「预检+探针+降级不阻塞」组合；且污染后修复靠外部脚本（dsh-permission-rules 的 repair-session-logs.mjs）——**宁可少写不可写坏**。
2. `maxBackgroundAgents` 是含内建 `subagent` 工具启动者的共享预算，跨工具计数易误伤——mdcontrol 若设并发 run 上限需明确统计口径。
3. `bg_result` 对 settled 子依赖 `sessionPersistence.load`，宿主缺该面时只能读活会话；我们若做 result 回读需确认 DSH 持久化面存在。
4. throttle 水印纯内存：进程重启后 `-1` 重置，重启后首个子 turn 必再报一次（可接受但须知）。
5. 进度行取最后 assistant 文本截 300 字符——对「思考多、文本少」的模型信息量低（progress 不回落 reasoning 是刻意选择）。
6. 未适用面：团队房间全部、`tool_filter` 白名单治理、跨机/调度（其明确 out of scope）。
7. **未读部分诚实标注**：`src/room/hub.ts`(1022 行)、`room/{tools,commands,projection,schema,domain,events}.ts` 仅扫过文件头注释未逐行读；`client/TeamRoomsSection.tsx`、全部 `tests/*`、`OPTIMIZATION_PLAN.md`、`scripts/*`、`lib/*.js` 编译产物（假定与 `src/` 一致）未核对；stars 为 web 快照值。

## 5. 关键源码索引

| 主题 | 位置 |
|---|---|
| 插件装配/observer 挂载/sweep effect/systemPrompt | src/index.ts:202（observer :290，sweep :305，投影注册 :309，prompt :318） |
| 内存注册表与 -1 水印哨兵 | src/lifecycle.ts:77（register :81，touch :99，noteReport :106） |
| 进度上报：节流判断 + quiet/wakeup 分支 + fact 双写 | src/lifecycle.ts:205（判 :215，分支 :231-235，fact :238） |
| 归档：running 豁免 / notice+interrupt+fact / 缓存回收 | src/lifecycle.ts:251（:261/:284/:293），sweepIdle :302 |
| cap 计数（目录权威+投影剔除+内存兜底） | src/lifecycle.ts:348 |
| per-parent gate 串行化 | src/tools.ts:223（进入 :317-325，尾键清理 :371） |
| background_agent 参数校验与 startContinuable | src/tools.ts:303（filter :116，depth :145，start :348） |
| bg_message 复活冷子 + message fact | src/tools.ts:416（followup :427，register :438） |
| bg_list 合并与 unrecoverable | src/tools.ts:444（execute :541，activityOf :193） |
| bg_result reasoning 回落 + persistence 兜底 | src/tools.ts:596（execute :646） |
| bg_stop fire-and-return 中断 | src/tools.ts:696（execute :737，interrupt :756） |
| FactAppender 门闸/探针 | src/facts.ts:31（append :49，mayAppend :60，probe :75） |
| 版本预检与信封判定 | src/audit.ts:32/:49/:60 |
| fact 事件类型与五 kind | src/events.ts:23 |
| notice 规范前缀往返 / replay meta 守卫 | src/vocabulary.ts:28/:49/:107 |
| 投影折叠（溯源列防双计/stateVersion） | src/projection.ts:114（apply :118，legacy :171，settled :241，wire :267） |
| 投影 wire schema | src/projection-schema.ts:13 |
| client 槽位与四个官方 RPC 动作 | src/client/index.ts:149（slot :157，interrupt :178，prompt :193，history :211） |
| 纯 presenter（快照→行） | src/client/presenter.ts:75（rowStatus :62） |
| 面板组件绑定 | src/client/BackgroundAgentsAction.tsx:155（快照行 :174） |
