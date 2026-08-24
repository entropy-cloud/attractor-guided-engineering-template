# dsh-loop-dock 调研报告（dsh-plugin-survey）

> | 项 | 值 |
> | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-loop-dock/`（`/Users/abc/ai/dsh-plugins/dsh-loop-dock`） |
> | 来源 repo | `https://github.com/euuuuuuzer/dsh-loop-dock.git`，本地 HEAD `aa5a461`（"docs: add badges…"） |
> | stars | 未核实（本地克隆无此信息，本次未联网查证） |
> | 语言 | JavaScript（纯 ESM `.mjs`）；路由核心 6 文件零 npm 运行时依赖，peer 全部指向 DSH 宿主包 |
> | license | MIT（`package.json:51`；vendored 官方循环衍生品保留上游 MIT 并在 NOTICE 列修改清单） |
> | 版本/状态 | v0.1.0 未发布；自称 pre-alpha but runnable；peer 钉 DSH `0.1.0-rc.6` 全家桶 + Node ≥22.19 |
> | 测试 | `node --test`（双 driver 集成、mock adapter 真实 turn、可选 live API 2×2 矩阵）；本次未运行 |
> | 宿主 API 面 | `ctx.agents.setFactory(dock)`（独占唯一 AgentFactory 槽位）、`ctx.provide('agentLoopDock')`、`ctx.llm.registerAdapter`、`ctx.systemPrompt.variable`、`ctx.effect/inject/get`、settings 命名空间 + Typert Remote（`agentLoops.listDrivers/setDefaultDriver`）、`sessionPersistence.inspect/list`、KNOWN 会话事件 `agent-preset/selected` 携带 `data.agentLoopDock`、Web 端 client bundle 设置行 |

## 1. 定位

一句话：**不做任何 Agent Loop，只做让多个 Agent Loop 共存于一个宿主的"船坞"——注册（Register）、选择（Select）、绑定（Bind）、委托（Delegate）四件事**。口号 "One harness. Multiple agents. Different loops."：把 DSH 中"harness 全局共享一个 Loop"的全局绑定细化为"每个 Agent 各绑一个 Loop"的 agent 级属性。

README 自我定位非常清醒（§A brick, not the building）：路由本身是"周末就能写完的 boring 部分"，项目存在的真正理由是证明 AgentFactory 这个 seam 足以承载多 loop 生态——而作者观察到"还没有人写过第二个 agent loop"，槽位一直空着。所以它是接口先行、生态待验证的样本：**接口已验证（路由核心 + 双 driver 集成测试全绿），价值未验证（无第二个真实社区 loop）**。

与本项目的关系视角：mission-driver 的 FlowEngine 是"一种 loop 的具体实现"（CHECK→REVIEW_PLANS→EXEC_PLANS→DRAFT_PLANS→DEEP_AUDIT 固定状态机），loop-dock 的 provider-spec 则是目前所见最完整的"loop 可插拔接口层"生态样本。它把"换 loop 是什么意思"拆成两个 kind——复用引擎只换装配的 **strategy** / 自带引擎的 **driver**——并给出创建期身份、恢复一致性、持久化兼容三条工程纪律。DESIGN.md 是早期设计稿（Route A 插件级 PoC → Route B native named registry），其 §8 明确注明术语与配置形状已被 0.1.0 实现取代（map+factory → 数组 agents + loop/driver 字段），当前事实以 README 与 docs/ 为准。

## 2. 架构与机制

### 2.0 术语（README Terminology 表，理解 spec 的前提）

| 术语 | 含义 | 常见对应 |
| --- | --- | --- |
| **driver** | 拥有 `createAgent`/`resume` 契约、驱动 turn 的核心循环实现 | 官方称 agent loop / driver；别家 harness 常叫 engine |
| **loop** | 一个 agent 运行的完整循环，注册于 LoopRegistry 的槽位；loop 是整体，driver 只是它的引擎部分 | 社区口语的 "agent loop" |
| **strategy loop** | 复用既有 driver、只装 per-agent setup 的 loop（常见形态） | ≈ 一个 preset/profile + 引擎上的适配层 |
| **driver loop** | 本身就是完整 driver 的 loop（改控制流才需要） | ≈ 完整的引擎实现 |
| **preset** | DSH 的每会话组合物（工具+prompt 段），原生 picker 选择 | 注意日常口语"preset"有时指 loop，此处严格指工具/prompt 组合 |
| **binding** | 创建期记录到 session 的持久 `{loop, driver?}` 选择 | recorded selection / route binding |

四者关系：preset 定义工具与 prompt 段，driver 执行 turn，loop 是 agent 跑的完整循环（strategy = driver+setup；driver loop = 自成 driver），model route 决定哪个 LLM 应答。会话选 preset → dock 经映射导出 loop → loop（或 settings）选 driver → 请求用 model route。**loop 与 driver 是两个独立坐标**，`create({loop:'strategy3', driver:'loop2'})` 支持任意 strategy × driver 组合。

### 2.1 Register（src/registry.mjs）

Provider 形状二选一，id 必须匹配 `/^[a-z0-9][a-z0-9._-]*$/` 且坞内唯一：

- **strategy loop**：`{ id, kind:'strategy', label?, description?, driver?, async setup(agentCtx) }`。setup 遵循宿主 `AgentSetup` 契约：拿到未发布的 `agent.ctx`，可返回 `{commit()}` 参与发布期校验事务，throw 即整体回滚 agent 创建。允许做：mount preset（`agentCtx.get('agentPresets').mount`）、注册 scoped 工具/prompt 段/变量、`tools.restrict(...)`、安装 scoped 事件监听（`agent/pre-step`、`agent/request`、`system-prompt/assemble`）。禁止做：更换 turn/step driver、替换工具执行或模型流本身、在 setup 内再创建 agent。可变状态必须按 Session/Agent 键控，禁止 process-global。
- **driver loop**：`{ id, kind:'driver', async createAgent(ownerCtx,options), async resume(ownerCtx,options) }`。完整实现 AgentFactory 契约并自管整条回滚覆盖的发布事务（prepare session → construct → setup → registries → announce → drive）；官方 `@deepseek-ai/dsh-agent-loop` 是参考实现。

`register()` 校验后存 Map 并返回幂等 disposer；重复注册抛 `DuplicateLoopError`。`defineStrategyLoop/defineDriverLoop` 只是补默认 kind 的薄壳。driver 单独注册：`registerDriver(driver)` 占名 `'default'`，`registerDriver('loop2', d)` 注册具名 driver，同样要求 `createAgent`+`resume` 双方法；同名重复抛 `DuplicateDriverError`。同一策略要在多个 driver 上表达时用复合 slot id（如 `loop2.strategy3`）+ `driver:'loop2'`。

### 2.2 Select（src/selection.mjs）

创建期两个维度独立解析（`resolveCreateLoopId`:160）：loop 维度按 `options.loop（或 options.agentOptions.loop）> sessionLoops 精确会话路由 > presetLoops 预设路由（meta.agentPreset 映射）> defaultLoop` 取值并记录来源（explicit/route/preset/default）；driver 维度同构且独立：`options.driver > 路由 driver > 预设 driver > strategy 声明的 driver 字段 > settings defaultDriver（每次 create 经 `_defaultDriver()` 实时读）> config defaultDriver`。

恢复期（`resolveResumeLoopId`:198）：先读持久化绑定，再以 `SessionHeader.agentPreset` 经 presetLoops 映射兜底，最后套用显式选项与路由；**任一维度的显式/路由选择与持久身份不一致直接抛 `LOOP_SWITCH`**——loop 选择是创建期身份，非空白会话禁止切换，镜像 DSH 预设只能空白会话切换的既有规则。

### 2.3 Bind（durable 身份，src/selection.mjs:90-152）

关键工程决策：绑定写进 **DSH 已知事件类型** `agent-preset/selected` 的 `data.agentLoopDock` 字段，而非发明自定义事件——因为宿主持久化读取路径拒绝 `KNOWN_SESSION_EVENT_TYPES` 之外的事件（除非标记 ignorable），而 `Session.append` 无公开途径做此标记，自定义事件会把触碰过的每个 session 变砖。同一事件同时携带 effective preset，宿主读取行为完全不变。写入时机是 compose 进 agent options 的 `loopSelectionSetup`，在发布事务内落盘；已有绑定不覆盖（除非 force）。恢复经 `_inspectPersisted`（hub.mjs:345）倒序扫描事件日志取最新绑定，坏记录静默跳过不阻塞 resume。上游 `SessionHeader.agentFactory` 被明确记为远期干净解法（里程碑 M4 的提案内容之一）。

### 2.4 Delegate（src/hub.mjs）

`createAgent/resume(ownerCtx, options)` 流水线：校验 options → 解析选择 → `registry.require(loopId)` → `_assertStrategyDriverOnly`（driver loop 不接受 driver 维度选择）→ `_materialize` → `_decorateOptions` → 委托胜出 provider。

- `_materialize`:210：driver loop 原样返回；strategy loop 用 `wrapStrategyLoop(strategy, driver)` 包装成 driver 形 provider，按 `${driver}:${loop.id}` 缓存（同一策略可跑在多个 driver 上），driver 缺失抛 `MissingDriverError`。
- `_decorateOptions`:263 组合 setup，顺序为 spec 明文规定：**caller setup（保住 DSH Web/subagent 已 mount 的 preset 可见）→ 绑定记录 setup → routeFollow setup → strategy setup**；各 setup 返回的 commit 按序收集、同事务提交。若 loop 注册时声明了 `provider/model` pin，则覆写调用方 agentOptions 的模型路由（并丢弃继承的 reasoningEffort）。
- `routeFollowSetup`:51 给每个 agent 安装最外层（prepend）`agent/request` 监听：每次请求按会话**当前** effective preset 重估模型 pin，实现 Web hero-chip 切预设时模型路由跟随而不重建 agent；无 pin 时释放可能残留的陈旧 pin 回落到创建期路由。
- 声明式 `config.agents` 数组由 `startConfiguredAgents/_flushConfiguredAgents`:372 启动：依赖就绪才起（driver loop 只等自身注册；strategy 还要等对应 driver 行激活），失败仅 warn 不炸进程；注册新 loop/driver 时自动 flush 等待中的声明项。

### 2.5 默认 driver 决策（docs/default-driver.md）

官方 `@deepseek-ai/dsh-agent-loop` 构造函数内 `ctx.effect(() => ctx.agents.setFactory(this))` 自占唯一工厂槽、自动启动 config.agents、自注册 settings 段与 prompt 变量——无法与 dock 共存。解法分三层：

1. `scripts/vendor-headless-loop.mjs` 从已安装的 rc.6 生成 vendored 衍生品 `vendor/dsh-agent-loop-headless/index.js`；
2. 改动清单八条：去 Service 基类与 setFactory、手动存 ctx、settings/prompt 变量上移 dock 单次注册、去 auto-start（dock 接管 startConfiguredAgents）、保留 `FactoryOwnership/setupAndPublish/createAgent/resume/resumeWith` 行为不动；
3. 适配器 `createHeadlessDriverAdapter` 以 `agents: []` 实例化后暴露 `createAgent/resume/dispose`（无公开 dispose 时经 `ownership.dispose()` 兜底）。

安装走 `cordis.patch.yml` bundle patch：disable 官方 `agent-loop` 行，插入 dock 行（defaultLoop: standard、presetLoops 把四个官方预设全映射到 standard、agents: []）与 headless-driver 行（maxParallelToolCalls: 10、fakeDriver: true 再挂第二个具名 `fake-driver`）。文档同时给出"headless fork 独立包"首选形态与"pnpm patch"备选形态及 MIT 衍生品合规要求（保留版权/版本/修改清单，禁用官方 scope 发布）。

### 2.6 兼容矩阵与里程碑

docs/compatibility.md 按"创建路径 × 如何到达 dock × 选择来源"列表：Web 会话 ✅、声明式 agents ✅、程序化 create ✅、`subagent/subagent_fork` 透明继承父 preset（内建策略 loop 用 `composedPreset(agentCtx)` 探测防双挂载，Web/subagent 的 caller setup 先于 dock setup 执行是防双挂载的关键前提）✅、workflow/ralph 子代预期透明但 live E2E 未跑、自然语言建队 ❌（子代理工具 schema 不暴露 loop/driver 字段）。发布前 E2E checklist 覆盖：重启后按持久绑定恢复、subagent 无双挂载报错、声明式 agent 断点续跑。

路线图 M0-M4：M0 路由核心✅、M1 headless 默认 driver✅（含 mock adapter 真实 turn 与具名 driver 双实例测试）、M2 官方槽接线+社区槽（进行中）、M3 社区 SDK（`define*` 已有，缺面向 loop 作者的独立测试 harness）、M4 上游提案 `registerFactory(name, factory, {default})` + `SessionHeader.agentFactory`，届时 dock API 退化为原生注册表之上的兼容 shim——即它承认自己可能是过渡层。测试阶梯刻意先 fake 后真：FakeFactory 双选 → default+fake 双 loop → 两个真 provider → live API 2×2（两 driver × 两策略四轮真实模型 turn，需 API key opt-in），把架构问题与模型行为问题完全分开（DESIGN.md §9）。

辅助设施：`loop-ping` 本地无模型 LLM adapter（配合 loop 声明 `provider:'loop-ping'` pin 即可零成本验证路由）；`fake-driver` 具名驱动让"路由是否正确"在无 API key 时一分钟内可视化；settings 命名空间经 Typert Remote 服务写穿 web settings API 的命名空间白名单限制。

## 3. 对本项目的可用模式

先回答提纲核心问题：**StepExecutor seam 与 provider-spec 不是等价物，差一层**。本项目的 `StepExecutor`（step-executor.js，executeAgent/executeParseAgent/executeTool 三方法）是"步骤由哪个后端进程执行"的执行器 seam——M2 NativeExecutor 注入不同对象即可换后端，引擎零改动；provider-spec 是"整个循环形态是什么"的循环 seam——strategy ≈ 同引擎换装配，driver ≈ 另一个引擎。两者都验证了"命名 seam + 单一替换单元"的价值，但不可互相替代。据此对"未来 drafter/reviewer/executor 角色需要不同 loop 形态"这一命题给出判断框架：

- **Adopt**
  - 两 kind 分类法作为需求分析工具：角色异构诉求应先拆层——只需不同 prompt/系统提示词/工具纪律/预算/模型 → strategy 层，用现有 mission 配置、per-role promptsDir、StepExecutor 参数即可满足，无需新接口；只有状态机控制流本身要变（比如 reviewer 要"审计→修复→复审"小循环而非单步执行）才值得谈第二个 flow。避免为伪需求造 dock。
  - 选择优先级 + 恢复一致性三件套（explicit > route > preset > default；创建期身份持久化；resume 不一致拒绝而非静默漂移）。若未来 mission.json 出现 per-role executor/flow 绑定，这套语义可直接照抄，包括"绑定是创建期身份、运行中不换"的原则。
  - "骑已知持久化格式而非发明新格式"的兼容纪律 ↔ 我们对 run-state.json/schema 的向后兼容要求，同一条原则的两种表现。
  - vendored 上游衍生品 + 编号改动清单 + NOTICE 合规的做法 ↔ 我们 vendor commander 的既有实践互为印证；其"先 fake driver 验证路由再接真引擎"的测试阶梯也适配我们引入任何新 seam 时的验证顺序。
- **Adapt**
  - 若角色池真要异构 loop，可借用 spec 形状但不能整体照搬：它的 delegate 目标是宿主 AgentFactory 契约（session 级创建/恢复身份），FlowEngine 的消费面是 StepExecutor 三方法 + 步骤级进程（opencode 有 sessionId 连续性，pi 无）。可行形态是在 mission 配置加 role→flow（或 role→executor）映射 + 一个小型命名 flow registry（对应它的 LoopRegistry+selection），语义抄 §2.2/§2.3 的优先级与拒绝规则；代码层面最多借鉴 `wrapStrategyLoop` 的"策略×引擎组合缓存"与 `defineStrategyLoop/defineDriverLoop` 极薄 helper 风格。
  - 它的"内置 baseline 槽 + 社区槽"结构对应我们的"默认主流程 + mission 自定义子流程/提示集"：内置槽保证零配置可用，扩展槽走显式注册——这个分层值得在任何 plugin 化改造中保留。
- **Reject**
  - cordis/bundle patch、Web Settings 行、Typert Remote、client bundle 全套宿主机制——DSH 平台专属，与 Node CLI 引擎无关。
  - routeFollow 的运行中模型路由实时重估——我们没有"运行中切预设"场景，属过度设计。
  - 直接把 dock 当库引入——它是宿主插件，路由核心虽零依赖但概念词汇（AgentFactory/session/preset）与我们不通；引入只增加间接层。

**与宿主 goal-round-driver 的关系**：两者占不同的层、不冲突。goal-round-driver 是宿主核心的"同 session 有界多轮推进"服务（armed goal + 剩余额度时经 `GoalMessageSource` 排队 `<goal_round>` prompt，由 `agent/pre-step` 监听门控；见本项目 docs/analysis/2026-08-22-0001 宿主 API 核实记录）——它不碰 `ctx.agents.setFactory` 工厂槽，只骑在"已运行的 agent"之上用事件钩子续轮。loop-dock 恰好相反：独占工厂槽决定 agent 由谁构造、turn 由哪个引擎驱动。所以三者可叠放：dock 选引擎（driver 维度）→ strategy setup 装配（preset/工具/钩子，spec 明文允许装 `agent/pre-step` 监听）→ goal-round-driver 在其上做目标推进。对我们的启示同构：FlowEngine 握排序权（分支/marker/预算），若未来要 per-role 异构，缺的是"dock 式"的选择绑定层而非另一个 goal-round——后者语义已被我们的 cycle budget + CHECK 重试门覆盖。

## 4. 风险与不适用面

- **成熟度风险**：pre-alpha、v0.1.0 未发布、单作者社区项目；作者自述生态为空（还没有第二个 loop），即接口已验证、生态价值未验证。参考其设计时应把它当作"接口语义样本"而非"生产依赖候选"。
- **上游脆弱性**：peer 钉死 rc.6；vendored 衍生品基于官方包私有内部实现，官方升级即断（其 Risks 一节自己承认）。持久化方案骑 preset 事件是自认的临时 hack，正确解法等待上游 `SessionHeader.agentFactory` 落地——这提醒我们：当 seam 归宿主所有时，插件侧的一切 hack 都是租来的稳定性。
- **strategy 能力天花板**：strategy loop 不能改 turn/step 控制流。对我们的推论：靠配置/prompt 层做的角色异构有硬边界，跨过边界的代价是整引擎 fork（driver kind = 完整 createAgent/resume/发布事务所有权）。评估异构需求时要先算这笔账。
- **多代理传递局限**：子代理继承的是父 preset 映射出的 loop，schema 层无 loop/driver 字段；说明"per-role 异构"在该生态里也要靠配置声明或额外工具层，运行时动态指派并未解决。
- **不适用面总结**：它解决"宿主要同时托管 N 个第三方 loop"的平台问题；mission-driver 是单一产品引擎，角色是内部概念、没有第三方 loop 作者生态。真正可取物是接口形状与选择/绑定语义，不是代码。
- **未读部分（诚实标注）**：`test/` 全部测试文件、`src/errors.mjs`、`src/fake-driver.mjs`、`src/ping-adapter.mjs`、`src/driver-settings.mjs` 正文（仅从 index/architecture 引述了解行为）、根目录 `client.js`、`scripts/*`、`vendor/dsh-agent-loop-headless/index.js` 内容、`examples/fake-two-*.mjs` 与 loop-author-template 测试、`docs/usage.md`、`docs/faq*.md`、`README.zh-CN.md`、CHANGELOG 后半部。§2.5 的 vendor 改动清单引自 docs/default-driver.md 文档，未逐一对照 vendored 产物源码核实。

## 5. 关键源码索引

| 主题 | 文件:位置 |
| --- | --- |
| 四步总控（create/resume/materialize/decorate/配置 agents 启动） | `src/hub.mjs:103-452`（`_decorateOptions`:263；`routeFollowSetup`:51；`startConfiguredAgents`:372；`_inspectPersisted`:345） |
| 选择优先级 + LOOP_SWITCH + 持久绑定读写 | `src/selection.mjs`（`resolveCreateLoopId`:160；`resolveResumeLoopId`:198；`recordDockBinding`:90；`LOOP_DOCK_BINDING_EVENT`:20） |
| Provider 协议校验、id 语法、幂等 disposer | `src/registry.mjs:21-136`（`validateLoopDefinition`:42） |
| strategy×driver 包装、setup 组合与 commit 收集 | `src/provider.mjs:40-84`（`composeSetups`:40；`wrapStrategyLoop`:65） |
| 插件入口（setFactory/内置 standard 槽/ping adapter/prompt 变量） | `src/index.mjs:70-114`（`apply`） |
| 默认 driver 适配器与接入行 | `src/default-driver.mjs:12-47`；`src/headless-driver-plugin.mjs:17-43`；改动清单 `docs/default-driver.md` |
| 配置归一（defaultLoop/presetLoops/sessionLoops/agents 校验） | `src/config.mjs:110-142` |
| 兼容矩阵与发布前 E2E 清单 | `docs/compatibility.md` |
| provider-spec 接口全文（strategy/driver 形状、setup 能做/不能做、示例） | `docs/loop-provider-spec.md` |
| 早期设计动机与路线取舍（Replaceability→Multiplicity） | `DESIGN.md`（§5；§8 已注明术语被现实现取代） |
| 路线图 M0-M4 与已知风险 | `docs/architecture.md:116-159` |
