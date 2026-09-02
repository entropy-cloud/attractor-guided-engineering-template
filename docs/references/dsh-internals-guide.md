# DSH 内部机制速查 — Web 客户端、slot 系统与插件体系

> **Status: 调研总结（2026-08，行号已对照源码复核）**。来源：对 `C:\can\ai\deepseek-harness` 源码的问答式调研。本文是 DSH 宿主侧的背景知识，服务于本仓库的 DSH 插件计划（见 `docs/architecture/dsh-plugin-packaging.md`）；引用的文件行号以调研时的工作区为准。

## 1. 总体分层（Web 客户端三层红线）

- **对象层**（`packages/client/runtime`，React-free）：`ConnectionController` → `SessionManager` → `Session` 拥有全部业务状态（事件窗口、流式累积、重连状态机）；snapshot-store 引擎（zustand/immer、`defineStore`）也在此层。零 React import（grep 可断言）。
- **渲染机械**（`ui-renderer`，动态插件）：所有 ctx↔React 集成——slot 渲染器/outlet、`SessionProvider`、uSES 适配器。所有 hook 在绑定点从裸源合成。
- **展示组件**（各插件包 `src/client/`，纯 props）：只消费四份额 props，可能被整批重写。

## 2. 统一命名空间模型：跨层冲突避免规则

DSH **没有统一注册中心**。每个能"注册一次"的层都是 `Map<namespace, value>`，value 的拓扑（单值 / 列表 / 链 / 开放词汇）由该层语义决定，冲突规则随之决定。跨命名空间的冲突通过三件套提前到编译期或加载期：fiber/scope 隔离、TypeScript declaration merging、版本围栏。

**全局图像（先读本段，再读小节）**——DSH 运行时是一个**分层坐标空间**：

- **一次寻址 = 三段路径**：`(组合层, 注册表, 键)`。例如 `agent-42 的 ctx → tools → 'bash'`、`浏览器 slot 账本 → 'conversation.chat.node' → entry 'review-job'`、`settings 文档 → 'shell' → 'timeoutMs'`。2.1 起的小节讲的都是**第三段（键）上的拓扑与冲突规则**；前两段在这里。
- **组合层（composition layer）是一个层栈**，每层产出于一个明确时刻：

```
L0 编译期    TS declaration merging —— SlotMap / ChatNodeDataMap / SessionEventMap
             （类型契约定型；运行时无登记表）
L1 启动组合   cordis.yml entries —— host composition（root ctx 的基础层）
L2 patch 层  profile 的有序 bundles（dsh.bundle.patch）—— 进程级，叠在 L1 上
L3 preset    agent.cordis.yml —— 每份 preset 一个 standing scope（进程内长驻、可多代际）
L4 agent     agents.create / setup(agentCtx) —— 每 agent 一层；子 agent 经 composeFrom
             绑定到父所在的 L3，再叠自己这层
L5 运行期    动态 slot 注册（slots.inject）、settings user 文档、session/goal/Context 实例、
             preset 代际更替（新会话进新层，已加入会话留旧层）
```

- **层是怎么合成的（L1+L2 的机制）**：L1 是 base cordis.yml 的**插件条目表**；L2 的每个 bundle 声明 `dsh.bundle.patch`，profile 按有序列表把 patch 叠加到条目表上（增/改/停用条目）——合成结果就是**最终要加载的插件清单**。之后 Loader 逐条加载插件；每个插件声明 `inject: ['服务名', ...]`，其 fiber **等到所列 service 可用才执行 `apply()`**——声明式依赖驱动激活，无手工排序。
- **层长在 ctx 树上，不在注册表里**：`tools` 这个 service 名全进程对应**一个** `ToolsService` 实例（路径第二段；service 代理在调用时把 `this.ctx` 绑定到调用方，方法内部用调用者 scope 决定读写哪一层）。层是它内部的 per-scope 分账——一个 eager 的 global 层 + 懒创建的 per-scope `ToolLayer`（preset standing scope 一份、agent scope 一份；某层首次 register 才建，空层自动回收；scope 父子关系即 dsh-scope 的 parent chain）。每个 `ToolLayer` 不是单张 Map，是小聚合：工具 `NamedEntries`（插入有序、层内重名 throw）+ `restrictions` + `guards` + presentation 声明。preset 挂载的插件跑在 preset scope 的 ctx 里，其 `ctx.tools.register` 写进 preset scope 的 layer。解析 `agent-42 的 ctx.tools` 时沿 scope 链合并出**有效视图**：global 起步、从最远祖先到最近层逐层覆盖同名（`ScopedLayers.merge`，`core/scope/src/store.ts:208`）——**同键就近赢，未遮蔽的外层键仍然可见**（既非"命中即停向上不找"，也非"只查本层"，而是并集 + 就近覆盖）。准确说法：**(组合层 × 注册表) 的每个交点持有该层对该注册表的贡献，跨层合并规则由该注册表的实现决定**——不是"每层里某些坐标点是 RegistryService"，而是"每个层在每个 RegistryService 上都可能留下贡献"。

- **一棵示例坐标树**（Host 平面；浏览器平面另有 slot 账本 + React 树，两平面经 RPC 与设置文档相连）：

```
root ctx（进程 = L1+L2 的合成结果）
├── 基础设施 service（单实例持状态）: shell / llm / agents / connection / loader
├── registry service（注册表 → 键）:
│   ├── tools        { bash, read, edit }              键规则: 单值 throw
│   ├── systemPrompt sections / variables / contexts    单值 throw + order
│   ├── skills       { memory }                        单值 + rank 覆盖
│   ├── settings     { shell, agent-presets }          注册 throw + 写 revision
│   └── events       { 'turn/start': [l1, l2] }        有序列表（prepend）
└── agent-42（L4，叠加层）
    ├── tools   { bash: 变体 }        ← 本层私有
    └── session s-9（L5 实例）: session id / goal id / Context(kind,id)
```

- **跨层解析规则按注册表而异**（"每个坐标有自己的合并策略"的准确含义——层内规则见小节，这里是跨层语义）：

| 坐标 | 跨层语义（子 → 父查找） |
| --- | --- |
| tools / prompt sections / skills | 合并视图 + 就近覆盖：有效视图 = global 起步、沿链远→近逐层覆盖同名；未遮蔽的外层键仍可见（`ScopedLayers.merge`，`core/scope/src/store.ts:208`）。tools 特有：`restrict` 只过滤继承面、永不 filter 本层注册，且跨链相交（`core/tools/src/index.ts:1137`） |
| events | 全层叠加：每层的监听器都收到（受 context filter 约束，`global: true` 豁免） |
| slot entries | 叠加共存：各层贡献都进账本，cell 规则防冲突 |
| settings 值 | 值层叠加：user 覆盖 base（内层优先），revision 串行化写入 |
| preset 代际 | 时间层：同 preset 新旧代际并存，会话绑死其加入的代际 |

- **术语澄清**：§1 的"三层"是浏览器渲染架构分层（对象层/渲染机械/展示组件）；本节的"层"是**组合层**——ctx/fiber 栈上的注册来源。同名不同物。

### 2.1 心智模型：namespace × cell 拓扑 × 冲突规则

| 拓扑 | 含义 | 冲突规则 |
| --- | --- | --- |
| 单值坐标 | 命名空间到单 value | throw-on-duplicate；或在优先级字段下静默覆盖 |
| 列表坐标 | 命名空间到有序 value 列表 | append 默认；`prepend` 调整；不冲突 |
| 链式坐标 | 命名空间到一组 value，都参与决策 | 全部参与选举，按 priority / 注册序 |
| 开放词汇 | 命名空间到 merge 注册的 type 行 | 编译期防重名，运行时无中心 |

### 2.2 逐层（单值 throw-on-duplicate）

多数层采用"硬 throw"——同 namespace 第二次注册直接拒绝。这是 DSH 的默认选择，因为它强制插件作者明确处理"我替换/我覆盖"的语义（本节路径省略 `packages/` 前缀，vendor/ 路径除外）：

- **Tool**（`packages/core/tools/src/index.ts:727`）：`tool "${name}" is already registered (for a per-agent variant, register through that agent's \`agent.ctx\` instead)` / `is already registered in this scope`
- **Prompt section**（`core/system-prompt/src/index.ts:317`）：`prompt section "${name}" is already registered`——同模式还有 `prompt context`（320）、`prompt variable`（323）。
- **Skill provider**（`skill/skill/src/index.ts:336/337`）：`a skill provider named "${name}" is already registered`（跨 agent 变体加 `in this scope` 后缀）
- **Settings namespace**（`settings/settings/src/index.ts:437`）：`settings namespace "${ns}" is already registered`
- **Theme**（`client/ui-theme/src/client/index.ts:252`）：`theme "${id}" is already registered`
- **Web provider**（`web/src/index.ts:120`）：`a web provider with id "${provider.id}" is already registered`，并使用 `WEB_DUPLICATE_PROVIDER` 错误码
- **Authorization flow**（`credentials/authorization/src/index.ts:206`）：`an authorization flow for "${key}" is already registered`，错误码 `DUPLICATE_FLOW`
- **LLM adapter / model discovery**（`llm/llm/src/index.ts:407/540`）：`an adapter for provider "${provider}" is already registered` / `model discovery for "${settingsNs}" is already registered`
- **LSP provider**（`lsp/src/index.ts:98`）：`an LSP provider with id "${id}" is already registered`，错误码 `LSP_CONFLICT`
- **Bash env contributor**（`shell/shell-env/src/index.ts:116`）：`bash env contributor "${contributor.name}" is already registered`
- **User-questions provider**（`interaction/user-questions/src/index.ts:67`）：`a user-questions provider is already registered`
- **Session-title provider**（`session/session-title/src/index.ts:438`）：`session-title provider "${provider.id}" is already registered`
- **Agent factory**（`core/agent/src/index.ts:374`，`agents.setFactory()`）：`an agent factory is already registered`——单槽位，无关命名；同名按 id 拒绝的是 live agent 注册（`agents.register`，:482）
- **Typert** 七个独立表：`endpoint`（typert/registry/src/service.ts:127）、`invocation id`（:130）、`Remote package`（:199）、`lookup`（:296）、`provider`（:421）、`package face`（:599）、`schema`（:616）——各自独立 Map，各自抛 `is already registered`
- **Session**（`core/session/src/index.ts:871/918/1083`）：`session "${id}" already exists`（create/enter/fork 三处）
- **Goal**（`goal/goal/src/index.ts:256`）：`goal "${id}" already exists with phase "${phase}"`，错误码 `GOAL_ALREADY_EXISTS`

错误信息普遍携带 `in this scope` 后缀（tool/prompt/skill），暗示作用域隔离是这些 throw 的有效出口：**同名不冲突，是因为属于不同 scope**——root 持全局层，每个 agent 在 `agents.create` 时获得自己的 Agent scope，注册同名"私有变体"在 agent scope 里合法。

### 2.3 单值坐标上的优先级覆盖（少见但存在）

少数层允许显式优先级静默覆盖，作为"我有意识替换同名前置"的语义通道：

- **Skill**（`skill/skill/src/index.ts:576`）：`skill "${skill.name}" from ${source} ignored because a higher-priority skill already exists`——候选带显式数值 `rank`（低者赢），同层同名后来者 warn+丢弃；跨层同名则是 scope 链遮蔽（与 tools 同规则，`src/index.ts:353`）。
- **Prompt section 的 `order`**：不解决同名冲突（throw），但解决拼接顺序（与 priority 不同语义）。
- **Tool 的 `toolOrder`**（`core/system-prompt/README.md`）：把 tool 顺序从注册顺序外提到系统提示层显式列表，因为这是模型可见信号，不能由加载顺序决定。

### 2.4 单值 + 版本围栏（拒绝"协议升级不兼容"）

- **SessionProjection**（`session/session-projection/src/index.ts:250`）：`session projection key "${key}" is already registered at stateVersion ${existing}; refusing to share it with stateVersion ${erased}`——同名 key 必须声明同一 `stateVersion`，否则视为不同协议，拒绝合并。这防的是"两个插件各自升级 state 形状但不互相知道"的隐性失配。
- **Settings namespace 写时围栏**：注册时 throw（§2.2），但**写入**不靠 throw，靠乐观锁——`scope.revision` 作为 `expectedRevision`，Host 拒绝时抛 `SettingsConflictError`（错误码 `SETTINGS_CONFLICT`，`settings/settings/src/index.ts:166`；消息 `settings namespace "${ns}" changed since it was read (expected revision X, now Y)`）。所以 settings 是**写时冲突**而不是注册时冲突——多个插件可共同编辑同一 namespace 不同字段路径，由 revision 序列化并发写入。

### 2.5 Cordis 服务值——单值、双门槛、可原位换值

Cordis service 是 ctx 代理上的 property（`vendor/cordis/src/reflect.ts`，set 陷阱在 :173）。与 §2.2 各层的注册 throw 不同，service 有**两个精准的门槛**而非"无检测"：

- **`provide()` 同名即 throw**（:289）：`service "${name}" has been registered at <fiber name>`——同一 isolate 内第二个提供者直接拒绝。框架假设每个 service 名由一个插件拥有，跨插件抢注不可能。
- **`set()` 只允许提供者自己的 fiber 覆盖**（:260）：`impl.fiber !== this.ctx.fiber` → `cannot set property "${name}" in multiple fibers`；从未提供过的名字 throw `cannot set property ... without provide`（:257）。

**同一插件提供多个 service 时，可以只原位换一个**：每个 service 名是 store 里独立的 `Impl` 条目，`ctx.A = newValue` 只改 A 的 `impl.value`，B 与该插件的其它注册完全不动。但 `set()` **不触发 `notify()`**——依赖方 apply 时把旧值存进闭包的拿的还是旧引用，只有动态读 `ctx.A` 的才看到新值。DSH 的 `source()` thunk 模式（§6 agent-loop 的 setSource）正是为此：service 实例稳定，值每次现读。

**跨插件的"替换"有三条正路**：

1. **isolate realm 平行共存**：store 按 `Symbol(name)` 分键（:209, :286），不同 realm 各持一份同名实现、互不可见（子 ctx 沿 fiber 链解析时要求 isolate 标签一致）。两个 preset 各自提供同名 service 不冲突——preset README："A preset that genuinely owns a service puts it behind an `isolate` realm"。不是替换，是隔离。
2. **卸载重挂**：provide 的 disposer 删 store 并 notify，依赖 fiber 会被刷新等待；但粒度是**整个插件 fiber**（该插件的所有 service 一起下线），不是单个 service。
3. **`internal/set` waterfall**（:191）：set 可被监听器否决/改写——框架级拦截点。

**典型场景：插件 A 提供 serviceA + serviceB，想只换 serviceA？**

| 谁来换 | 手段 | serviceB |
| --- | --- | --- |
| A 自己（或你改 A 的代码） | 自己 fiber 内 `ctx.serviceA = newImpl` 原位换值 | 完全无感 |
| 外部插件 | serviceA 是 registry service → `register` 新条目；只想改行为 → `ctx.intercept('serviceA', config)`（`context.ts:139`，子树内解析时合并配置） | 完全无感 |
| 外部插件 | 自己 isolate realm 里平行 provide 同名 serviceA | 无感，但只有跑进该 realm 的消费者看到新实现 |
| 外部插件 | 卸载 A 重挂 A' | **一起下线**：短暂 PENDING 后恢复，内存态丢失 |

外部的"直接换实例"（跨 fiber `set` 或同名 `provide`）两条路都 throw——框架刻意让"替换实现"要么由 owner 做、要么走隔离/重挂的显式通道。

跨 ctx 隔离靠 fiber/scope：子 ctx 的 setter 写的是自己 fiber 的 store 条目，不会污染父 ctx。

### 2.6 Service、Registry Service 与 Tool 的关系

§2.2 把 tool 列在 throw-on-duplicate 表里，§2.5 又把 Cordis service 描述为"无检测的 setter"——单读这两节会得到一个错觉：tool 和 service 是两个并列的注册表。事实上 tool **是**一个 service，service **是**一个 Cordis 概念。把这层澄清之后，"为什么 §2.2 的 throw 是可能的"才有依据。

**`service` 的一词两义**：

- **Cordis service**（基础设施层）：ctx 代理上的 property。任何 `ctx.foo` getter/setter 都是 Cordis service，包括 `ctx.tools`、`ctx.shell`、`ctx.agents`、自定义的 `ctx.permissionPresets`。Cordis service 用 setter 赋值（无检测、setter 恒赢），用 `ctx.inject([...], cb)` 等待依赖出现。
- **Registry service**（命名空间所有者）：Cordis service 的一种**模式**——service 内部持有一张 `Map<name, value>`，对外暴露 `register(name, def)` / `unregister` / `get` / `list`。DSH 大量 service 是这个模式：`ctx.tools`（工具）、`ctx.skills`、`ctx.settings`、`ctx.theme`、`ctx.web`、`ctx.authorization`、`ctx.llm`、`ctx.lsp`、`ctx.shellEnv`、`ctx.userQuestions`、`ctx.sessionTitle`、`ctx.agents`、`ctx.sessionProjections`、`ctx.typert`（七张独立子表）、`ctx.sessions`、`ctx.goal`。这些合起来构成 §2.10 大表里除 Cordis 事件、slot、kind 之外的全部行。

**Tool 是 Registry service 的一条 entry**——具体地：

- `ctx.tools.register(name, toolDef)` 在 `tools` service 内部的 `Map<name, ToolDef>` 写入一条
- `ctx.tools.execute(name, args)` / `ctx.tools.list()` 在同一张 Map 查表执行/枚举
- **冲突检测由 `tools` service 自己持有**——`packages/core/tools/src/index.ts:727` 的 throw 来自 `tools` 服务内部的查重逻辑，不是 Cordis 框架层；Cordis 本身只看到 `ctx.tools = ToolRegistryService` 这一次 setter，无从知道 service 内部有多少 namespace。

**Registry service 的冲突规则由该 service 自己选**——§2.10 表的"冲突规则"列就是这个选择的结果：tool 表是单值 throw，skill 是单值+优先级覆盖，settings namespace 是单值 throw（写时再加 revision 围栏），theme 是单值 throw，event 监听器是列表 append 但 event 不是 registry service（它是 Cordis 框架内建）。

**Tool 的额外特殊性——它是模型可见的接口**：tool 名在 `tools` service 内部是一个普通 Map key，但 agent-loop 在每个 turn 把 `tools.list()` 序列化进系统提示喂给模型，模型返回的 tool_use 块又按同名查回 `tools.execute()`。这把 tool 名从"内部注册表 key"升格成 **model-facing API 标识符**，三个后果：

1. `toolOrder`（`core/system-prompt/README.md`）必须显式声明——模型认知的 tool 顺序是模型行为的输入，不能由插件加载顺序决定。
2. tool 名在 §2.10 大表里独占一行（与 settings namespace 等不同 namespace），虽然它们都是"registry service 的 entry"，但 tool 名还携带 model-facing 含义。
3. 错误信息里"for a per-agent variant, register through that agent's agent.ctx instead"（`core/tools/src/index.ts:727`）指出的正是 sanctioned 通道——同名 per-agent 变体挂到该 agent 的 `agent.ctx` 上：每个 agent 的请求只解析自己的 scope 视图，看到的仍是一份无歧义的 tool 列表；被禁止的只是全局层的第二次同名注册。

**Tool 的 fiber scope 隔离**：

- root ctx 的 `tools` 持有全局层的 tool 表
- 每个 agent 在 `agents.create` 时获得一个 Agent scope ctx；`tools` service 按 scope 记账——**每个 scope 一张私有 `ToolLayer`（自己的 `NamedEntries` Map，`core/tools/src/index.ts:714`）**，该 agent 的可见工具视图按 scope 链逐层归并（`agent → preset → global`，近层遮蔽远层），所以 agent scope 里注册同名 tool 合法、遮蔽全局版本且不影响其他 agent
- 这就是为什么 §2.2 throw 信息带 `in this scope` 后缀——同名不冲突，**靠的是 scope 层把"同名"搬到不同 Map**

**Service、Tool、Slot 的层次关系**：

```
Cordis ctx (代理层, setter 恒赢, fiber scope 隔离)
  └── Service (Cordis property)
        ├── 基础设施 service: ctx.shell / ctx.fs / ctx.llm / ctx.agents / ctx.connection
        │     └─ 持状态、暴露方法, 无 register API
        └── Registry service: ctx.tools / ctx.skills / ctx.settings / ctx.theme / ctx.web / ...
              └─ 内部 Map<name, value>, 暴露 register/get/list
                    └── Entry: tool def / skill def / settings namespace / theme id / ...
                          └── (可选) 暴露给另一个注册表:
                                - tool 是 system prompt 的 source
                                - settings namespace 是 settingsScope.bind 的 target
                                - kind (ConversationNodeDefinition) 是 keyed slot 的 entry key
```

Cordis event 和 slot 不属于 registry service——它们有各自的注册机制（事件名空间是数组 + `prepend`；slot 是声明合并 + cell 拓扑）。它们在 §2.10 表里单独列出。

**与本仓库插件的关联**：当 mission-driver 写一个 dsh 插件时：

- 选 **基础设施 service** 还是 **registry service** 取决于"我要不要按名字查多个变体"——只一个实例用基础设施 service；多个变体竞争（多个 provider、多种主题、多种实现）用 registry service 并明确选冲突规则（§2.10 大表）。
- 如果写工具：默认 throw（同名 = 错误）；若需要"我的版本替换内置"按 §2.3 优先级模式。
- **不要混用命名空间**：tool 名、service 名、slot 名、event 名、kind、settings namespace 各自是独立的 namespace——可同名不冲突，因为属于不同行；但代码里看起来一样的字符串可能在不同 namespace 里含义不同，按命名空间区分才安全。

### 2.7 slot 系统——四种 cell 拓扑

最丰富的语义层，§3 展开。摘要：

| kind | cell | 同 key 行为 | 顺序字段 |
| --- | --- | --- | --- |
| single | 整 slot 一个 cell | 同 priority throw；不同 priority 选举遮蔽（lowest renders） | `priority` |
| keyed | 每个 `key` 一 cell | 同 key 同 priority throw；多插件不同 key 天然叠加 | `priority`、`order` |
| list | 每个 `id` 一 cell | 同 id 同 priority throw | `priority`、`order`（显示序） |
| chain | 无 cell | 都参与选举 | `priority`（低先试）、平局用注册序 |

注意 slot **有数值 priority**——这是 DSH 唯一一个把数值优先级用作**排序**语义的注册层。Cordis 事件没有（只有 boolean prepend），tool 没有（外提到 `toolOrder`），skill 的显式 `rank` 语义是遮蔽（同名去重）而非排序。

### 2.8 Cordis 事件——有序列表（监听器永不冲突）

事件名 = 有序监听器列表（`vendor/cordis/src/events.ts`）：

```ts
hooks[name].push({ ctx, callback, ...options })
// prepend=true 时 unshift
```

**永远不冲突**，因为语义就是"同一个事件多方监听"。`options.prepend` 是唯一调整顺序的旋钮，**没有数值 priority**。

顺序只在某些派发模式下有语义：`emit`/`parallel` 顺序无关；`serial`/`bail` 先返回 bail 值者赢（`prepend: true` 抢先拦截）；`waterfall` 从外到内包裹 `next()` 链，不调 `next()` 即 veto。

**infrastructure-level 优先级真实存在但对你隐藏**：Cordis 内部把 `internal/update` 监听器注册为 `{ global: true, prepend: true }`（events.ts:155），保证框架自己的"配置应用链"永远最先执行，业务瀑布监听器只能在外面包业务逻辑。这是设计取舍：**给业务方 prepend 一种、二选一**——而不是数值 priority 这种小工具更容易滥用。

### 2.9 ConversationNodeDefinition.kind——类型开放词汇 + 运行时 Definition 注册

`ConversationViewNode.kind` 是 `string`，这条 namespace 实际有**两半**，冲突机制不同：

**类型半（编译期，无运行时表）**：每个 plugin 通过 TS declaration merging 往 `ChatNodeDataMap` / `SessionEventMap` 加自己的行：

```ts
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap { 'review-job': ReviewChatData }
}
```

引擎层不持有"已声明 kind 的类型清单"——`node.data` 的类型由编译期合并决定，运行时没有对照表。

**运行时半（Definition 对象注册，单值 throw）**：Definition 本身（`match`/`start`/`update`/`buildViewNode`，见 §4）是运行时注册的——`ctx.conversationEvents.register(definition)` 写入按 kind 键控的 Map，第二个同 kind 直接拒绝：`conversation Definition "${kind}" is already registered`（`client/runtime/src/client/conversation/event-registry.ts:24`）；view target 另有一张表，同 target 也 throw（`view-registry.ts:22`）。

**为什么两半都要**：TS 编译期防重名只在**同一个编译程序**内有效——两个独立发布的包各自声明同名 kind，各自编译都合法，链接进同一进程才撞名。运行时 throw 覆盖的正是跨程序组合这种情况；运行时唯一没有中心约束的是"类型行"本身（运行时无从对照，也不需要）。keyed slot 的 key 必须等于 Definition 的 kind，这条局部惯例把两半在 apply 里成对绑定（§4）。

### 2.10 大对照表

| 层 | 注册器 | 命名空间 | 拓扑 | 冲突规则 | 顺序字段 | 跨 ctx 隔离 |
| --- | --- | --- | --- | --- | --- | --- |
| Tool | `ctx.tools.register` | tool 名 | 单值（registry service entry） | throw | 系统提示 `toolOrder` 显式 | fiber scope |
| Prompt section / context / variable | `ctx.systemPrompt.section/context/variable` | 名 | 单值 | throw | section 的 `order` | fiber scope |
| Skill provider | `ctx.skills.registerProvider` | skill 名 | 单值 | 优先级覆盖（warn） | 显式 `rank`（遮蔽） | scope |
| SessionProjection | `ctx.sessionProjections.register` | key | 单值 | throw + stateVersion 围栏 | n/a | n/a |
| Settings namespace（注册） | `ctx.settings.register` | namespace | 单值 | throw | revision 围栏写 | n/a |
| Theme | `ctx.theme.register` | id | 单值 | throw | n/a | n/a |
| Web provider | `ctx.web.register` | id | 单值 | throw（`WEB_DUPLICATE_PROVIDER`） | n/a | n/a |
| Authorization flow | `ctx.authorization.registerFlow` | key | 单值 | throw（`DUPLICATE_FLOW`） | n/a | n/a |
| LLM adapter / discovery | `ctx.llm.registerAdapter/Discovery` | provider id | 单值 | throw（`DUPLICATE_ADAPTER`/`DUPLICATE_DISCOVERY`） | n/a | n/a |
| LSP provider | `ctx.lsp.register` | id | 单值 | throw（`LSP_CONFLICT`） | n/a | n/a |
| Bash env contributor | `ctx.shellEnv.registerContributor` | name | 单值 | throw | n/a | n/a |
| User-questions provider | `ctx.userQuestions.register` | name | 单值 | throw（`DUPLICATE_PROVIDER`） | n/a | n/a |
| Session-title provider | `ctx.sessionTitle.register` | provider id | 单值 | throw | n/a | n/a |
| Agent factory / live agent | `agents.setFactory`（单槽位）/ `agents.register`（按 id） | 槽位无命名；agent id | 单值 | throw | n/a | n/a |
| Goal | `goal.create` / 状态转移 | goal id | 单值 | throw（`GOAL_ALREADY_EXISTS`） | n/a | n/a |
| Session | `ctx.sessions.create/enter/fork` | session id | 单值 | throw（fork 为 `SESSION_ALREADY_EXISTS`；create/enter 抛普通 Error） | n/a | n/a |
| Typert 七张子表 | `ctx.typert.*` | 各自 id | 单值 | throw | n/a | n/a |
| **Slot** | `ctx.slots.register` | slot 名 × cell | 四种（single/keyed/list/chain） | 按 kind throw 或选举 | 数值 `priority` + `order` | root/session scope |
| **Slot entry** | 同上 | (slot 名, key/id) | 单 cell 内 | throw | 排序 | 同上 |
| **Cordis service**（基础设施层） | `ctx.provide(name, value)` / `ctx.<name> = ...` | service 名 | 单值 | 同名 provide throw；set 仅限提供者自己的 fiber（§2.5） | n/a | isolate realm 平行共存 |
| **Cordis event** | `ctx.on(name, listener)` | event 名 | 有序列表 | 不冲突 | `prepend` boolean | `global: true` 跨 ctx |
| **ConversationNodeDefinition** | `ctx.conversationEvents.register` | kind | 类型开放词汇（merge）+ 运行时单值 | 编译期防重名 + 运行时 throw | (kind, id) 是 Context 键 | n/a |

### 2.11 预定义层 vs 运行时层：namespace 的产生时机

§2.10 大表 22 行的命名空间不是同一类对象——有些在源码里写死，有些在运行时才出现。区分它们是理解"子 agent 怎么扩展系统"的前提。

**三类 namespace**：

| 类型 | namespace 本身何时确定 | 实例何时创建 | 例子 |
| --- | --- | --- | --- |
| 预定义型 | 编译期（TS 类型/接口） | 运行时注册/触发 | slot 名、ConversationNodeDefinition.kind、settings namespace（来自 Config）、prompt section |
| 运行时型 | 调用方传入字符串 | 每次调用创建新实例 | session id、goal id、message id、Context (kind, id) |
| 混合型 | 预定义 kind + 运行时 id | 每次出现创建新 Context/scope 实例 | `(kind, id)` 双键、`settingsScope.bind({ namespace })` |

**预定义层的载体是 TypeScript 类型，但运行时侧面因层而异**：

- `interface SlotMap { 'conversation.chat.node': ... }` 通过 `declare module '@deepseek-ai/dsh-client-ui-slots'` 在编译期合并所有包的声明——**类型半**编译后消失；但 slot 系统的**运行时账本**（声明表 + entry 表）真实存在：同一 slot 名的第二处声明 throw、向未声明 slot 注册 throw（`client/ui-slots/src/index.ts:790/829`）。
- `interface ChatNodeDataMap { 'review-job': ReviewChatData }` 同样编译期合并，运行时 `node.data` 的类型由它决定，但没有"类型清单表"；Definition 对象另有运行时注册表（§2.9）。
- `interface SessionEventMap` 是纯编译期类型——事件名运行时无任何登记（监听器就是数组）；`interface SessionProjectionMap` 相反，projection key 有运行时注册表（§2.4 的 stateVersion 围栏）。同为"预定义型"，运行时侧面从"无表"到"throw 围栏"连续分布。

**为什么有编译期合并还要运行时 throw**：TS 的 declaration merging 防重名只在**同一个编译程序**内有效——两个独立编译、独立发布的包各写一份同名 key，各自编译都通过，链接进同一进程才撞名。运行时 throw 覆盖的正是这种跨程序组合；"运行时 throw 冗余"的说法只在单程序内成立。这是对 §2.13 "前置冲突检测"的细化：编译期与运行时是**分工**，不是二选一。

**运行时型由调用方独占所有权**：

- `ctx.sessions.create(SessionId('s-123'))`——s-123 这个 namespace 是调用方命名的，DSH 编译期不知道。throw-on-duplicate 是必要的（防止两个 client 拿同一 id）。
- `ctx.goal.create({ id: '...' })`、MessageId、Context id——同模式。
- `ConversationMatch.id`——`match(event)` 返回的 id 是 Definition 自己的逻辑；同一 `kind` 的多个实例（多个 review job）用不同 id 区分。

**混合型的统一键**：

- `(kind, id)` 是 Context 的双键：`kind` 来自 Definition 常量（编译期可见），`id` 来自 `match()` 返回值（运行时产生）。同 kind 多实例天然区分，同 `(kind, id)` 的更新合并到同一 Context——这就是 §4 折叠机制的核心。
- `settingsScope.bind({ namespace })`：namespace 是预定义型（来自 Config schema），但 `bind` 在**调用方 fiber** 上创建一个 scope 实例——disposer 归调用方所有，多次 bind 同一 namespace 在不同 fiber 上得到不同 scope 实例。

**子 agent 如何"创建新层"**——其实**不能创建全新的 namespace 类型**，只能 fork 现有层或继承扩展：

1. **fork 现有 registry service**：子 agent 在 `agents.create` 时获得一个 Agent scope ctx（插件用 `ctx.inject(['agents'], cb)` 等待 agents 服务后在 factory 的 `setup(agentCtx)` 里组合），该 ctx 的 `tools`/`systemPrompt`/`skills`/`theme` 等 registry 各自是**私有 scope 层（独立 Map）**。子 agent 注册同名 tool 不冲突（throw 信息里的 `in this scope`），且父 agent 的同名 tool 不受影响——父继承由 scope 链归并提供，子覆盖由子 ctx 的私有层承担。
2. **继承父 ctx 的预定义层**：slot 名是 ctx 无关的字符串常量，子 agent 注册新 entry 进同一 slot 名就是给该 slot 加贡献，不影响父 ctx 的同名 slot 注册（slot 系统账本是 root 级的，不是 ctx 级的）。
3. **声明新的预定义层**：子 agent 包作为独立 TS 编译单元，可以用 `declare module` 给 `ChatNodeDataMap`/`SessionEventMap`/`SessionProjectionMap`/`SlotMap` 加自己的行——但这要求子 agent 包在**编译期**被消费方纳入（npm 依赖 / pnpm workspace），运行时动态加入做不到。这是预定义型的代价。
4. **声明新的运行时 namespace**：session id、goal id、MessageId、Context id——子 agent 自然获得，每次调用创建新的。这是子 agent 最常见的"新层"。
5. **混合型扩展**：`settingsScope.bind` 在子 ctx 上创建 scope 实例——子 agent 的偏好配置独立持久化，与父 agent 隔离。"我的偏好独立于父"的标准实现就是这个。

**Tools、ctx 与这些层的关系**：

- **`ctx` 是 fiber substrate**：所有 registry service、所有 fiber scope 隔离、所有 effect 生命周期都长在 ctx 上。预定义层不依赖 ctx（类型合并在编译期），运行时层必须依赖 ctx（register API 都在 ctx 上）。
- **`ctx.tools` 既是基础设施 service（持表）又是 registry service（暴露 register）**——具体地，`tools` 是 registry service，它的 entry 是 tool def（§2.6）。子 agent 创建 Agent scope 时 `tools` 为该 scope 添一层私有 Map——子 agent fork 或重写工具集不需要也无法"创建一种新的 tool 层"，tool 层是固定 registry service，新 scope 自带私有层。
- **`ctx.<registry service>` 的统一模式**：每个 registry service（tools/skills/settings/theme/web/llm/lsp/shellEnv/...）都是**预定义**的注册表机制，**但每个 ctx/scope 实例持各自的层**。子 agent 不能也无法创建新的 registry service（除非新增 Cordis service，那要在编译期）；只能在 Agent scope 里得到现有 registry service 的私有层。
- **子 agent 能创建的运行时层**：session id、goal id、MessageId、Context (kind, id)、scope 实例。**不能创建的**：新的 registry service（除非编译期新增）、新 slot 名（合并期常量）、新 kind 词汇（要 declare module，必须编译期）。

**与本仓库插件的关联**：mission-driver 写 dsh 插件时：

- **不要尝试运行时发明新 namespace 类型**——slot 名、kind 名、event 名都必须编译期确定（TS 编译后类型消失，但字符串是工程常量）。运行时 namespace（session/goal/message/context id）才允许运行时产生。
- **子 agent 扩展策略**：要"每个子任务独立设置"用 `settingsScope.bind` 在子 ctx 创建私有 scope；要"每个子任务独立 tool 集"在子 ctx `tools` 上注册；要"每个子任务独立 kind"需要新增 npm 包并声明 module augmentation——做不到运行时动态发明 kind。
- **判断一个层是预定义还是运行时**：`grep -r "interface.*Map"` 看类型合并（预定义）；看 `ctx.<name>.create` / `register(...id...)` API（运行时）。

### 2.12 Preset、Profile、Bundle：跨层组合单元

§2.10 大表覆盖了所有命名空间和冲突规则，§2.11 区分了"namespace 何时产生"。但 DSH 还有一组"组合单元"——**不发明新 namespace，决定哪些现有 namespace 在某个会话/agent 上被填充哪些 entry**。理解它们就理解了"为什么同一个 root ctx 下能跑出配置完全不同的 agent"。

**三种组合单元的角色**：

| 单元 | 形态 | 何时激活 | 作用域 |
| --- | --- | --- | --- |
| **Bundle** | npm 包，manifest 声明 `dsh.bundle.patch` 指向 `cordis.patch.yml` | 进程启动时由 profile 装载 | 进程级（root ctx 的 patch 层） |
| **Profile** | `$DSH_HOME/profiles/<name>/package.json` 含 `dsh.profile.bundles`（有序）+ 用户 `cordis.patch.yml` | `dsh --profile <name>` 启动时选定 | 进程级 + 用户 home |
| **Preset** | 目录含一份 `agent.cordis.yml` | 进程内由 agent 创建触发（`ctx.agentPresets.composeFrom` / `mount`） | **standing scope**（持久 fiber 子树，所有加入的 agent 共享） |

**Preset 是核心抽象**（`packages/preset/agent-presets/README.md`）。它解决的精确问题是：*"一个进程里多个会话要跑不同配置的 agent，每个会话都要自己的 tools/prompt sections/projection units，但工具的 schema 只写一次"*。

**Preset 与 §2.10 各层的关系**：

- **不发明新 namespace**——preset 内的 plugin 行（tool / prompt section / slot entry / projection unit）注册到现有 registry service（`ctx.tools`、`ctx.systemPrompt`、`ctx.slots`、`ctx.sessionProjections`）。
- **不持跨 agent 状态**——尽管一个 preset 的所有 entry 在 root-level service 上**只注册一次**（standing scope 模式），但插件实例的 state **按 Session/Agent key**——同一 service 的同一 entry 在不同 session 看不同数据（这是 plugin 自身的 key 约定，不是 preset 强制的）。
- **承载 declaration merging**——preset 内 import 的包可以在编译期往 `ChatNodeDataMap` / `SessionEventMap` 加自己的行，所以 preset 可以"自带新 kind"。

**Preset 的 standing scope 是 DSH 中最长寿的 fiber 之一**：

- 由 roster 服务自己持有（`preset/agent-presets/src/index.ts:124`），**不挂在任何 agent 的 fiber 下**——因为从被追踪 ctx 派生的子树会经调用方的 shadow fiber 解析服务，破坏 entry 自己的 inject 语义。
- **比任何 agent 都长寿**，进程结束才卸载——即使没有 agent 在用它。
- 每次 preset 文件（`agent.cordis.yml`）的 stamp（mtime+size）变化触发**新代际**：所有后续加入的会话进新代际，已加入的会话留在旧代际（"the composition a running session joined outlives its file changing or disappearing underneath it"）。

**Preset 与 §2.11 三类 namespace 的关系**：

- **预定义型**：preset 内的 plugin 通过 `declare module` 加自己的 kind/slot/event 名——编译期工作。
- **运行时型**：preset 创建 session/agent 时自然产生 session id、Context (kind, id)、goal id 等。
- **混合型**：preset 内的 slot entry 是预定义 slot 名 + 运行时 entry；preset 内的 settings namespace 是预定义 schema + 运行时 scope 实例。

**Preset 的红线（preset 不能做的事）**：

1. **不能把 service 发布进 root realm**——preset 行若把 service 挂到 process-global，被 roster 拒绝（`preset/agent-presets/README.md:123`）。这避免第二个 preset 同名 service 与第一个碰撞。出口有二：service 放进 entry-local 的 `isolate` realm（两个 preset 的同名 service 互不可见），或放到 host composition。
2. **不能在已产出内容的 agent 上 recompose**——`recompose` 仅在 agent 尚未产出任何内容时有效；"是否已产出"由**调用方**检查（`preset/agent-presets/src/index.ts:440`："The CALLER owns that check"），roster 自己不读会话历史。产出后换 preset 会让已记录的工具调用无法在新组合下复现，守的是"model-visible ⟺ logged"。
3. **不能在子 agent 上独立 mount**——子 agent 通过 `composeFrom(agentCtx, parentCtx)` **绑定**到父 agent 的 standing composition（同步、无失败模式），绝不独立 mount。理由：mount 会读取当时 roster（可能与父不同代际），绑定保证子 agent 与父共享同一代际。

**Preset 的关键服务面**（`ctx.agentPresets`）：

- `composeFrom(agentCtx, parentCtx)` — 同步绑定，**子 agent 唯一接入方式**（唯一支持调用点是 factory 的 `setup(agentCtx)`）
- `mount(agentCtx, id?)` — 异步，把一份 preset 挂载为 standing scope（拒绝未 scoped 的目标 ctx）
- `recompose(agentCtx, id)` — 仅对**空白** agent，重新挂载
- `list()` / `resolve(id)` — **不记忆**，每次重读目录（运行中新增 preset 立即可见）
- `read(id)` / `copy(from, id, name?)` / `remove(id)` — authoring API（**copy 是唯一创作方式**，永不接受 composition 文本作为输入——避免构造器执行任意代码）
- 健康检查 = shape check（YAML 可解析 + 是命名 plugin 行列表），不检查模块解析或服务激活——一个引用不存在包的行仍会在首次会话创建时失败

**Preset 与 settings 的桥接**：`agent-presets` 注册一个 `agent-presets` settings namespace，把 settings 文档中用户选择的 default 预设名作为 composition base——settings 改动**只影响**后续创建的会话，已运行的会话保持原 preset（"value is read per resolution rather than snapshotted"）。

**Profile 与 Bundle**：

- **Profile** = 进程级组合入口：`dsh.profile.bundles` 是有序 bundle 名列表，`cordis.patch.yml` 是用户自己的 patch 层；`loadProfile` 双锚点解析（先 dsh 安装目录，再 profile 目录），用 `applyEntryPatches` 在空条目列表上叠加 patch 层（`app-boot/README.md:38`）。
- **Bundle** = npm 包，manifest 声明 `dsh.bundle.patch: "./cordis.patch.yml"` 指向自己的 patch 层文件；profile 装载 bundle 后把 patch 内容注入条目列表。
- Profile 与 preset 的核心区别：**profile 是进程级**（决定 root ctx 长什么样），**preset 是会话级**（决定某个 agent 的 ctx 长什么样）。两者通过不同机制把 patch 行应用到不同层级的 ctx。

**Tools/ctx 与 preset 的关系**：

- `ctx.tools` 是 registry service（§2.6）。Preset 内的 tool 注册行经 dsh-tools 的 scope 记账**落入 preset 的 standing scope 层**（不是 root 全局层；见 `preset/agent-presets/README.md:7`），所有加入该 preset 的 agent 经 scope 链（`agent → preset → global`，近层遮蔽远层）看到同一份 tool 表——但 tool 的 `execute(ctx, args)` 接收的是 agent 自己的 ctx，所以不同 agent 调用同名 tool 时拿到不同的 ctx（session 信息、当前用户、权限等），行为可能不同。这是"同一 entry，多实例行为"的典型。
- **preset 不创建新 registry service**——`ctx.tools` / `ctx.skills` / ... 都是预定义的；preset 只是选择**为某个 standing scope 加载哪些 entry**。
- **preset 不能改变 §2.10 表里其他层的冲突规则**——它只是往现有层加 entry，加的规则由该层决定（tool 行 throw、skill 行按 priority、settings 写时靠 revision）。

**Preset 与子 agent 创建的层**：回到 §2.11 子 agent"创建新层"清单：

- preset 给子 agent 提供的是"哪些 entry 进哪个 ctx"——子 agent 通过 `composeFrom` 共享父 preset 的 standing composition
- 子 agent 自己的 session id、goal id、Context id 是运行时型——preset 不管这些
- preset 不能让子 agent 发明新 kind——preset 包内的 declare module 仍然要编译期进入消费方

**与本仓库插件的关联**：mission-driver 写 dsh 插件时：

- **是否需要 bundle**：若插件的 cordis.yml 想进 root ctx（如注册全局 service），用 bundle 的 `dsh.bundle.patch`。若只想给特定 agent 用，进 preset 的 `agent.cordis.yml`。
- **是否需要 preset**（为 mission-driver 自己？）：当前 preset 设计是 per-session agent composition 工具；如果 mission-driver 想给 agent 提供一组"task tools"作为一个可选 preset 暴露给用户，需要包成 npm + 提供 `agent.cordis.yml` + 用户在 home 复制。这就是 §2.13 取舍的具体应用——**默认 throw（host composition 不接受未声明行）+ 显式独立通道（preset 目录挂载）**。
- **子 agent 决策**：mission-driver 用 `agents.create` 创建子 agent（已有原生路径），不要自己实现 mount——按 §2.11，子 agent 通过 `composeFrom` 共享父的 standing composition 自动获得父的工具集。

### 2.13 设计取舍小结

- **显式 > 隐式**：靠顺序解决的问题不发明 priority，避免优先级数字成为参数化微型语言。slot 的数值 priority 是**唯一例外**（因为 UI 组合里有"低优先级渲染"的稳定语义需求）。
- **throw > 静默覆盖**：默认拒绝冲突，少数层（skill、toolOrder）显式选择覆盖语义并要求作者声明意图。
- **前置冲突检测**：用 fiber scope 把"同名"搬到不同 Map、用 declaration merging 把类型重名前置到编译期（运行时注册表兜住跨程序组合，§2.11）、用版本围栏把"协议升级"前置到加载期——运行时只剩 throw 或覆盖两种结局，**没有"看上下文判断要不要冲突"的灰色地带**。
- **跨层组合单元（bundle/profile/preset）补足"什么 entry 在哪个 ctx"的问题**——它们不发明 namespace，只为现有 namespace 选择 entry；红线（不能挂 root realm、不能 recompose 已产出会话、子 agent 必须 composeFrom）防止跨 preset 状态泄漏与"换 preset 后历史不可重放"两个隐性失配。

## 3. slot 系统（UI 组合唯一 API）

**register 是唯一注册入口**：`ctx.slots.register({ name, children?, store?, inject?, key?/id?/order?/label?/select?/locale?/priority? }, Component)`（选项全集见 `client/runtime/src/client/slots.ts:68` 的 `ErasedRegisterOptions`）。宿主只渲染 `'root'`；每个 slot 名镜像组合路径（`<domain>.<entry>.<hole>`，如 `conversation.chat.node`、`settings.plugin.item`）。四种 kind 冲突语义见 §2.7。

**`slots.inject(key, callback)` 解决跨插件声明时序**（`runtime/src/client/slots.ts:143`）：目标 slot 由别的插件在自己 register 的 `children` 里声明，而插件 apply 顺序不保证。inject 等声明出现（已存在则同步执行）；声明方 collapse 时撤走 callback 安装的贡献；redeclare 时重跑；调用方 fiber 卸载时取消等待。callback 可返回单个 disposer 或 generator（多个贡献原子安装、逆序回滚）。裸 register 到未声明 slot 直接 throw。

**顺序确定性**：多次 inject 的执行顺序 = 插件激活顺序（对同一份 cordis.yml 确定）。渲染结果刻意不依赖注册顺序——keyed 各占 cell、single/list 靠显式 `priority`/`order`；唯一残留顺序敏感点是 chain slot 同 priority 平局。

**组件 props = 四份额，全部派生**：`PropsRuntime<K>`（owner 参数 + `useSession` 等）+ `PropsRenderSlots<S>`（children 键）+ `PropsStore<H>`（store 工厂）+ inject face。组件永不接触 ctx、永不自造订阅机械。

## 4. 会话节点管线（conversation node，事件溯源式）

```
会话事件流（持久日志，seq 全序，单写者）
  → match(event)            身份提取：→ (kind,id) Context，role = start|update
  → start / update          折叠：事件 → State（纯 reducer，不可变更新）
  → publication             节拍：'none'|'animation-frame'|'immediate'（progress 高频合帧）
  → buildViewNode(context)  发布：State → ChatNode{kind,data,...}（renderer-ready 数据）
  → snapshot.chat.nodes     引擎写入快照
  → ChatNodeSeat 订阅单 node → renderSlot(entryKey: node.kind) → 注册组件
```

要点：

- **`match` 是路由器不是折叠器**：只读当前事件，返回 `{id, role}` 或 null。kind 不在返回值里——它是 Definition 级常量，`(kind,id)` 键由 `(definition.kind, id)` 拼出。热路径契约：每事件 × 每 Definition 跑一次，必须便宜。
- **role 只有 start/update，没有 end**："结束"是 State 里的普通字段（如 `status: 'completed'`），由你的 update 折出来；Context 不终结，节点留在聊天流。
- **ViewNode 信封是全局契约**：`ConversationViewNode{key,kind,id,target,data}`（`runtime/src/client/contract/conversation.ts:105`），chat 目标扩展 `ChatConversationViewNode`。kind 词汇表靠声明合并开放，Definition 本身运行时注册（§2.9）。
- **kind↔entryKey 是 chat node slot 的局部惯例**：注册 key 必须 === Definition 的 kind，二者在 apply 里成对出现。
- **数据/视图分界**：`buildViewNode` 产出纯数据；组件是 `node.data` 的纯函数。判断"是否渲染"发生在数据面（`buildViewNode` 返回 null = 不发布；`visibility: 'hidden'` = 暂时隐去但 key 稳定）。

**三条摄入路径**（`runtime/src/client/sessions/conversation-assembler.ts`，调用点在 `session.ts`）：

| 路径 | 触发 | 语义 |
| --- | --- | --- |
| `replaceWindow` | 首次 open / 断线 resync / 基线与 live 流有 seq 洞 | 清空全部 Context，对整个窗口从零重放；重建的是引擎状态，React 靠 node key 稳定避免整树重绘 |
| `prepend` | 用户向上翻页（`loadOlder`） | 只 match 新增旧事件，归并进现有 Context，受影响者重放；已渲染 key 不变；悬挂的 pending update 被激活 |
| `append` | 正常 live 推送 | 幂等去重（已知 seq no-op），增量 upsert |

**seq 为什么会"乱序"到达**：不是事件生产并发（日志单写者全序），而是读取路径——尾部优先分页（旧页后到，pending 悬挂的根源）、断线补洞、历史基线与 live 流竞态。引擎把三种到达形状归一为"按 seq 升序重放"，fold 结果与到达路径无关（cookbook 验证项：完整 replace == 初始历史+live 追加 == 先 update 后补 start）。

**设计先例**：各层均有成熟先例，dsh 的贡献是装配——Event Sourcing/CQRS（append-only log + aggregate fold + read model，"state 永远计算、绝不入日志"）、Redux/Elm 确定性 reducer、LLM 聊天 UI 的 stream accumulator（Vercel AI SDK/assistant-ui）、VS Code contribution points（kind 注册表 + generic fallback）、TS declaration merging 开放注册表。注意**没有真正的 CRDT**——没有多写者并发合并；最接近的是 host 投影层客户端值仓的 higher-seq-wins（LWW-register 语义）。

## 5. Cordis 事件系统（对比 slot 与统一模型）

监听器存于数组，**无数值 priority，只有布尔 `prepend`**（`vendor/cordis/src/events.ts`）。顺序语义取决于派发模式：

- `emit`/`parallel`：顺序无关（后者全并发）。
- `serial`/`bail`：按数组序执行，先返回 bail 值（非 null/false/undefined）者赢。
- `waterfall`：监听器从外到内包裹 `next()` 链；不调 `next()` 即否决整条链。

与 `slots.inject` 的本质区别：事件监听器是"每次事件发生都调用"的流；inject 是"每个声明生命周期跑一次"的 effect（epoch 制），且 inject 有失败永久 retire、collapse 撤贡献等生命周期语义。

放在 §2 的统一模型看，事件 = 有序列表坐标，slot = 单 cell 内的多 kind 拓扑；两者的 cell/priority 复杂度不可类比。

## 6. 设置体系（Host 持久文档 ↔ 浏览器 scope）

**`ctx.settingsScope.bind({ namespace })`**（ui-settings 提供）：从共享镜像**派生**出单命名空间 scope——浏览器中只有 ui-settings 一个 `settings.describe` 读方，持有全量应答镜像并在 `settings/document-updated` 事件与重连时刷新。bind 不新增网络读取；scope 快照含解析值（composition base 叠 user 覆盖）、原始 user 层、revision、可写性。字段出现在 user 层即视为覆盖（即使值等于 base）。写入单字段路径 + revision 乐观锁（`expectedRevision`）。

**`installSettingsSection(ctx, ns, schema, entry, hooks)`**（`settings/settings/src/index.ts:863`）——Host 侧插件接入可选设置服务的标准布线：

- `setSource(current)`：框架把"当前权威配置读取器"（thunk）交给消费方保管。**恰好在两个时刻调用**：settings 服务挂载时 `setSource(() => scope.get())`（:875）；settings 服务消失（provider 重载/卸载）时回退 `setSource(() => entry)`（:884）。消费方自身 unload 时**两者都不调**（`isUnloading` 守卫，:883）——teardown 中重建派生物有害。用户改设置**不重调 setSource**——值时效由 thunk 承担，变更只触发 `onChange`。
- `onChange()`：在 attach、detach、每次已提交变更后调用，消费方在其中调 `source()` 重建派生物。

**设置卡片的完整模式**（ui-settings-plugins）：

```
apply 世界:  new XxxCardController(ctx.settingsScope.bind({ namespace }))
              ↳ 订阅 scope、维护 staged 草稿（save 才落盘）、暴露动作
注册:        slots.inject('settings.plugin.item', () => slots.register({
                name, key: <namespace>, locale, inject: () => card.inject() }, Card))
card.inject() 返回注入面: { hooks: { xxxCard: SnapshotStore<State> }, edit/resetField/save/discard }
渲染器:      hooks 仓成员 xxxCard → 绑定成 useXxxCard 注入 props（源永不进组件）
组件:        props.useXxxCard(s => s.field.text) + props.edit(...) —— 纯 props
```

- `key` = 卡片编辑的 settings 命名空间——标签页目录由 Host 已注册命名空间 ∩ 浏览器已注册卡片配对得出，仓库外插件可自动出现。
- **inject face 的 `hooks` 是保留仓**：裸 observable 源必须放这里（组件只见绑定出的 `use<Name>` selector hook）；其余成员限纯数据+回调。绑定实现 `observableHook`（session-provider.tsx:58）按**源身份缓存** hook（uSES 要求 subscribe 引用稳定），selector 相等（`Object.is`）短路重渲。
- staged 表单模型：每次设置写都是 revision 围栏的持久文档变更，故草稿暂存、save 才写入（card-form.ts）。

## 7. 包清单约定（package.json）

客户端插件是"一个包、两个世界"：

```jsonc
{
  "exports": {
    ".":      { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },   // Node 半（Host 加载）
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" } // 浏览器半（动态 bundle）
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings-plugins"] } }
}
```

- `exports` 是标准字段，承载双构建面 + 类型载体（`import type` 与声明合并经 `/client` 子路径找到类型）。
- `dsh.*` 是**自定义命名空间属性**，npm 原样保留，由 dsh 工具链分环节读取：dev 脚本扫描（`scripts/dev-web.ts`）、web 插件表服务（组成浏览器启动清单与 bundle 路由）、tsdown preset（读 `external` 决定共享模块表请求）、静态门 `verify-client-packages.ts`（校验合法性、查环）。
- `dsh.client.inject` 列**包名**且**纯信息性**（预检展示、HMR diff）——不排序、不等待。真正的顺序由 Cordis fiber 对**服务名**的 inject（代码里 `export const inject = ['slots', ...]`）和 slot 系统对**声明**的等待（`slots.inject`）决定。包名清单 ≠ 服务名清单。
- 兄弟字段：`dsh.profile.bundles`（profile 清单）、`dsh.bundle.patch`（组合包声明 patch 层）。

## 8. 对本仓库（mission-driver 插件）的关联

- 插件打包与原生派发链见 `docs/architecture/dsh-plugin-packaging.md`（`ctx.get('agents')` → `agents.create` → `followup` → `dispose`）。
- §2 的统一模型告诉插件作者"在 DSH 里写一个服务/注册器时该选哪种拓扑"：默认 throw-on-duplicate；若需要被多个 owner 共同声明（如 skill），走显式优先级；若需要运行时语义合并（如 chain），声明 kind 标识。
- §2.12 提示组合层选择：进 root ctx 用 bundle（`dsh.bundle.patch`），进 agent 用 preset（`agent.cordis.yml`）；不要尝试运行时发明新 namespace。
- §3 提示未来 Web 面板应走 slot 注册（`slots.inject` 等声明 + 数值 `priority` 解决歧义）而非自造挂载点。
- §6 提示设置项应走 `settingsScope.bind` 而非私有存储，写入靠 revision 围栏序列化并发。
- §7 是工具链入口：插件 manifest 必须声明 `dsh.client.platform/inject/external`，被 `verify-client-packages` 静态门检查。

## 9. 本文未展开的插件相关子系统（速查指针）

本文聚焦注册/冲突模型与三个 UI 侧机制。写 mission-driver 插件还会碰到以下子系统，各自的服务面已核对，细节以 DSH 仓库对应包 README 为准：

| 子系统 | 服务面 | 一句话角色 |
| --- | --- | --- |
| Agent loop | `core/agent-loop` | turn 循环、工具调用执行、scope 生命周期；插件行为应挂在文档化扩展点，不改 loop 本身 |
| 子 agent 委派 | `ctx.agents.create()` / `ctx.subagents`（provider 注册，同名 throw `DUPLICATE_PROVIDER`） | in-process 子 agent 用 `agents.create()` + `AgentHandle` teardown；后台收集走 `ctx.jobs` + `dsh-tool-subagent` |
| 命令 | `ctx.commands`（`interaction/commands`） | slash 命令注册；同名 throw，变体挂 agent ctx（§2.2 同模式） |
| 模型选择 | `ctx.llm` + agent-scoped selection（`core/agent/src/model-selection.ts`） | provider/model 在 `agent/request` waterfall 里按 agent 解析 |
| 审批/权限 | `ctx.approval`（`interaction/user-approval`） | 审批请求、取消、审计与 per-session policy |
| 会话持久化 | `session/session-persistence*` | append-only 日志、单写者、seq 全序——§4 管线的上游契约 |
| 宿主↔客户端 RPC | `ctx.typert`（§2.2 七张子表） | 远程调用的 endpoint/invocation/schema 类型图与注册 |
| 压缩 | `ctx.compaction` + `compaction-basic`（`ctx.tokenMeter` 计压） | 历史过长时折叠旧区间；`/compact` 命令走 `ctx.commands` |
| 写一个 `dsh-tool-*` 包 | `ctx.tools.register`（§2.6） | tool def + schema + UI render intent；DSH 仓库 `docs/cookbook/adding-a-tool.md` 是权威步骤 |

权威全景见 DSH 仓库 `docs/architecture.md` 与各包 README；本文不复制其内容。

## 10. 实际插件架构模式、inject 语义与类型共享

### 10.1 一个 service = 一个插件是常态

由于同层同名 throw（§2.1），一个 fiber 内无法两次 `ctx.provide('web', ...)`。DSH 仓库的实际做法是**每个插件提供一个 service（或往一个已有 service 的注册表里注入条目）**：

| 插件类型 | 实例 | 做了什么 |
| --- | --- | --- |
| 基础 service 提供者 | `web` → `ctx.web`、`llm` → `ctx.llm`、`shell` → `ctx.shell` | 提供注册表容器（`Map<id, Provider>`） |
| Provider 注入者 | `llm-deepseek` → `ctx.llm.registerAdapter(...)`、`web-search-deepseek` → `ctx.web.registerSearchProvider(...)` | 往已有 service 的注册表里加条目 |
| Tool 注入者 | `tool-todo` → `ctx.tools.register(...)`、`tool-fs` → `ctx.tools.register(...)` | 往共享 `ctx.tools` 注册表里加 tool 条目 |
| 独立 service 提供者 | `permission-presets` → `PermissionPresetService`、`agent-default-model` | 提供不依赖注册表的独立 service |

能力的拆分靠的是 **service 内部的注册表**（`Map<id, Entry>`），不是靠多个插件提供同一个 service。

### 10.2 inject 不是细化依赖粒度，是建立类型化 API 边界

`inject: ['llm']` 不是说"我只依赖 llm service 的某一个 model"——它依赖的是**整个 service 的 API**。相比旧模型的"依赖另一个 plugin"，变化是：

| | 旧模型（Pi 等） | DSH |
| --- | --- | --- |
| 依赖对象 | 另一个 plugin（整个闭包） | 一个 service（typed API） |
| 能做什么 | 调用 plugin 暴露的任意方法 | 调用 service 声明的方法（`ctx.llm.generate()`、`ctx.llm.registerAdapter()`） |
| 粒度 | 不细化（plugin 是黑盒） | **API 级**（知道能调哪些方法），但不是**条目级**（不能声明"我只依赖 llm 里的 deepseek adapter"） |

inject 解决的是**类型安全和解耦**（消费者知道调什么、不知道谁实现），不是依赖粒度的细化。消费者仍然依赖整个 service 的注册表——无法声明"我只依赖某个具体条目"。这正是 §11 对比表中 DSH 差量粒度止步于 entry 级的又一体现。

### 10.3 类型共享：service 包是协调枢纽

consumer 和 provider 通过 **npm 包**共享类型定义，service 包是枢纽：

```
消费者 (tool-fs)                    服务包 (@deepseek-ai/dsh-shell)               实现者 (bash-local)
    │                                          │                                        │
    │ inject: ['shell']                        │ 导出 ShellRuntime                      │
    │ 调用 ctx.shell.execute()                 │ 导出 ShellProvider 接口                 │
    │                                          │ declare module 声明 ctx.shell 类型       │
    │ ← import { ShellRuntime } from 'dsh-shell' │                                     │
    │                                          │ ← import { ShellProvider } from 'dsh-shell'
    │                                          │ → class BashLocalProvider implements ShellProvider
    │                                          │ → ctx.shell.registerProvider(provider)  │
```

具体代码流：

```ts
// ① 服务包（@deepseek-ai/dsh-llm）导出接口
export abstract class LlmAdapter { ... }          // provider 实现的接口
export class LlmRuntime extends Service {          // service 本体
  registerAdapter(providers: string[], adapter: LlmAdapter) { ... }
}
declare module '@deepseek-ai/cordis' {
  interface Context { llm: LlmRuntime }            // 声明合并：ctx.llm 的类型
}

// ② 实现者（llm-deepseek）实现接口并注册
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
class DeepSeekAdapter extends LlmAdapter { ... }  // implements LlmAdapter
ctx.llm.registerAdapter(['deepseek'], new DeepSeekAdapter(...))

// ③ 消费者（agent-loop）注入 service 并调用 API
export const inject = ['llm']
ctx.llm.generate({ model: 'deepseek-chat', messages })  // 类型安全
// 不知道也不关心 adapter 是谁实现的
```

**消费者不知道 provider 是谁，provider 不知道消费者是谁，service 包定义它们之间的类型契约。** 这与 Nop 的 Service Definition 角色相同——差别在 Nop 的契约是 DSL 声明（可在 delta 中修改），DSH 的契约是 TypeScript 类接口（编译期固定）。

### 10.4 差量定制的实际粒度（修正）

"止步于 entry 级"是不准确的。DSH 的差量定制实际分布在三层：

**第一层：config 对象（结构化数据，有坐标）**

Plugin 的 `apply(ctx, config)` 接受 config 对象——这是**有坐标的结构化数据**（字段名就是坐标）。理论上 config 字段可以支持深合并/覆盖，类似 Nop 的 `x:extends`。但当前 `applyEntryPatches`（`vendor/include/src/index.ts:121-124`）实现的是**浅属性替换**：

```ts
// patch: { id: 'foo', config: { newField: 'x' } }
// target.config 原本: { a: 1, b: 2 }
// 结果: target.config = { newField: 'x' }  ← b 丢失了
target[key] = value  // 整个 config 被覆盖，不是深合并
```

对比 Nop 的 `x:extends`：节点级合并，子节点覆盖、未覆盖的保留回退。DSH 的 config 合并语义更弱——想改一个字段，必须把整个 config 对象重写。

**第二层：注册表条目（entry 级）**

Tool/command/provider 等注册表条目。同层同名 throw（§2.1），跨层 shadow（§2.6），可卸旧加新。粒度比 config 粗——不能只改一个 tool 的某个字段，只能整体替换或遮蔽。

**第三层：service 实例（插件级）**

整个 service 的实现逻辑。闭包内部无坐标，只能 fork/重挂。最粗的粒度。

| 定制层级 | 坐标 | 合并语义 | 当前能力 |
| --- | --- | --- | --- |
| config 字段 | 字段名 | 浅替换（整个 config 覆盖） | 可以但笨拙——改一个字段要重写整个 config |
| 注册表条目 | entry id | 同层 throw / 跨层 shadow | 加、删、遮蔽，不能原地改 |
| service 实例 | 服务名 | 整值遮蔽 | fork / 重挂 |

**与 Spring Boot 演进的类比**：

你的类比非常精准。DSH 当前状态类似 **Spring 1.0 时代**——一切配置在最终文件中指定，每次有变化都要重新配置。具体表现：

| Spring 1.0 | Spring Boot | DSH 当前 | DSH 可改进方向 |
| --- | --- | --- | --- |
| XML bean 全量定义 | properties 外化 + auto-configuration | preset 静态列表（每个 plugin 行都要写） | config 外化到 settings（已有，但未充分联动） |
| 每个 bean 手动注入 | 条件化注入（`@Conditional`） | preset 无条件激活——要么全装要么全不装 | 插件声明 `when` 条件，运行时按条件激活 |
| 每个 property 手动指定 | `application.yml` 层级覆盖 + profile 特化 | `applyEntryPatches` 浅替换，没有深合并 | config 字段级深合并（`x:extends` 语义） |
| 无动态装配 | `@Profile` 按环境激活不同 bean 集 | preset = 静态组合，无"场景"概念 | preset 支持条件化组合（场景 A 加载这些插件，场景 B 加载那些） |

**"动态改造"的具体方向**：

1. **config 深合并**：`applyEntryPatches` 改为节点级合并（保留未覆盖字段），或引入 `x:extends` 语义——这最接近 Nop 的 delta，且改动最小（只改合并算法）
2. **条件化激活**：preset/plugin 声明 `when` 条件（环境变量、settings 值、已加载 service），运行时按条件决定是否激活——Spring Boot `@Conditional` 的 DSH 版本
3. **config 外化**：plugin config 字段与 settings namespace 联动（`installSettingsSection` 已有雏形），用户改 settings 自动生效——类似 Spring Boot 的 `application.yml`
4. **场景化组合**：preset 不再是"固定列表"，而是"条件规则集"——不同 agent 类型 / 用户角色 / 部署环境自动组装不同 plugin 集

§11 对比表中的"差量粒度"列应修正为：**config 字段级（有坐标但合并语义弱）→ entry 级（同层 throw / 跨层 shadow）→ 插件级（fork）**，三者并存，不是"止步于 entry 级"。

## 11. 与 Nop 差量定制的对比：两个结构空间，两种粒度

本节面向 Nop 背景（可逆计算）的读者，回答"DSH 是否达到了不修改基础代码、纯差量定制的目标"。依据：`nop-entropy/ai-dev/articles/dsh-architecture-from-reversible-computation.md`（§4.4、§4.6）。

**直接回答：DSH 有三层差量定制能力，但每一层都比 Nop 弱。** config 对象是有坐标的结构化数据（字段名即坐标），理论上可支持字段级 delta——但当前 `applyEntryPatches` 只做浅替换（整个 config 覆盖），不是深合并。注册表条目可增删遮蔽但同层 throw。service 实例内部闭包无坐标，只能 fork。三层并存，不是"止步于 entry 级"——但 config 合并语义弱（无 `x:extends` 节点级深合并），注册表条目不可原地改（同层 throw），service 实例不可差量化（闭包无坐标）。Nop 视角的分析承认了 service 层的限制（§4.4 "插件内部没有坐标"），但未充分讨论 config 层作为"弱 delta 载体"的可能性。

**但"目标"不是失败，是被拆分了**——可逆计算理论的命题"可逆并不要求全量"：不要求在相空间（编译期 × 运行时两个结构空间）每一层都可逆。

| 维度 | Nop（编译期结构空间） | DSH/Cordis（运行时结构空间） |
| --- | --- | --- |
| 差量载体 | DSL 文件（DeltaLoader 统一拦截） | 插件 apply 产生的 effect（注册即应用，配对撤销函数） |
| 差量粒度 | 模型字段/节点级（`x:extends` 节点合并、属性覆盖，保留未覆盖部分） | **config 字段级**（有坐标但浅替换，改一个字段要重写整个 config）→ **entry 级**（同层 throw / 跨层 shadow / 卸旧加新）→ **插件级**（fork），三者并存 |
| 负元素 | 有：`x:override="remove"`、`x-diff` 逆向提取、`Delta = (+A, -B)` | 无独立负元素（单写者 + 累加；只能撤自己 effect 的逆，删不了别人的贡献） |
| 合并时机 | 加载期统一完成，运行时解释展开结果 | 运行期随时；卸载/HMR/依赖失效触发 reconciliation |
| 合并语义 | 节点级：保留父实现未覆盖部分 | 整值遮蔽："两个闭包无法合并，只能替换"（§3.2 的对比） |
| 强项 | 任意模型字段级定制；静态可校验；dump 可溯源到 delta 层 | per-agent scope / per-session preset / HMR / 依赖失效自动治理 |
| 盲区 | 运行期动态合成（结构加载后基本不变） | service 实例内部逻辑（闭包无坐标 → 只能整体替换插件或 fork） |

**分界线是认识论的（§4.6）："注册内容何时可知"。** 编译期可知的定制（改一个 action、删一个字段）应进结构空间——Nop 的领地；运行期才可知的（这个 agent 是谁、scope 在哪、per-session 用哪份 preset）只能进运行时——DSH 的领地，且 Nop 目前缺少对应机制。

**实务降维**：DSH 把大多数 service 设计成 registry（§2.6），效果是把"想换 serviceA"的真实需求降维成"往 serviceA 的注册表里加/换条目"——粒度从 service 级降到 entry 级，回到 DSH 可定制的范围。真正无法降维的只剩 service 实例的整体行为逻辑，此时选项是 §2.5 的③④（isolate 平行 / 卸载重挂）。

**理想形态**（文章结语）：结构空间负责"注册什么"的差量代数（Nop 已形式化），运行时结构空间负责"结构如何激活/卸载"的可逆管理（DSH/Cordis 已形式化）——两者互补而非同一目标的成败两例。对 mission-driver 插件的实操含义：**能用注册条目表达的定制就不要指望换 service 实现**；把自己插件的贡献面设计成 registry 条目，才能被下游差量定制。
