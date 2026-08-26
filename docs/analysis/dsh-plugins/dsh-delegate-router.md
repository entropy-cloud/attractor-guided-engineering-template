# dsh-delegate-router 调研报告（dsh-plugins）

> | 项 | 值 | 依据 |
> | --- | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-delegate-router/`（`/Users/abc/ai/dsh-plugins/dsh-delegate-router`） | 本地目录 |
> | 来源 repo | `https://github.com/penguin-oo/dsh-delegate-router.git`，本地 HEAD `a6e0e17`（"0.4.0"，浅历史仅 1 commit）；作者 `penguin-oo`，copyright 2026 | `git remote -v` / `git log` / `LICENSE:3` |
> | stars | 任务给定约 65★（按本调研任务书 2026-08-24 数据）；本地无法访问 GitHub，stars 来自任务给定，未在 web 复核 | 任务书 |
> | 语言 | TypeScript（宿主零 .ts 源；唯一 .ts/.tsx 是 `src/client/index.jsx` —— JSX 经 esbuild 打包到 `lib/client.js` 14 701 行，含内联 zod 4.4）；运行时仅依赖 zod | `package.json:71-79`；`scripts/build-client.mjs:20-30`；`lib/client.js:14545-14559` |
> | license | MIT（Copyright (c) 2026 penguin-oo） | `LICENSE:3` / `package.json:15` |
> | 版本/兼容 | v0.4.0；peer 钉 `@deepseek-ai/cordis ^4.0.1` + `dsh-storage-domain ^0.1.0-rc.6` + `dsh-typert-protocol ^0.1.0-rc.6`；client inject 三个 web 端 runtime 包；不锁 dsh-plugin 版本号 | `package.json:66-70,53-65` |
> | 测试/CI | 无 GitHub Actions 配置（目录内无 `.github/`）；自托管脚本：`scripts/smoke.mjs`（plugin shape + Typert 校验）、`scripts/test-routing.mjs`（22 个规则断言）、`scripts/measure-savings.mjs`（zstd 解码会话日志算真实省钱）、`scripts/e2e-*.mjs`（13 个 Puppeteer 跑 headless Edge 验 3741 实例）；本次未运行 | `scripts/` 目录；`smoke.mjs:11-34`；`test-routing.mjs:24-67`；`measure-savings.mjs:8-118` |
> | 宿主 API 面 | 宿主 `apply(ctx, config)`；`inject = ["tools", "agents", "commands", "storageDomain"]`；patch 插入**两条 host 行**：`subagent-router`（router 主体，name=`dsh-delegate-router`）与 `delegate-router-stats`（stats sidecar，name=`dsh-delegate-router/stats`，必须为 host-plane 行才能被 API gateway 经 `ctx.get` 解析到）；注册 `/delegate` 命令；订阅 `agent/created`、`agent/disposed`、`tools/change`、`agent/request`；用 `AsyncLocalStorage` 跨 await 传递 `parent/target`；通过 `storageDomain.open` 持久化 `subagent_router.ledger` 表 | `lib/index.js:211-212,259-260,265-274,391-405,422-440,444-457`；`cordis.patch.yml:14-48` |
> | 客户端 API 面 | client `apply(ctx)`；`inject = ["slots", "remote", "sessions", "locale"]`；`ctx.remote.$mount(TYPERT_REMOTE)` 装载 Remote 客户端描述符；`ctx.slots.inject('shell.overlay')` 注入账本覆盖层（`order=20`、`id='delegate-router-ledger'`）、`ctx.slots.inject('sidebar.footer.action')` 注入 ⚡ 按钮（`order=30`、`id='delegate-router'`）；locale NS=`delegateRouter`；远程服务 key=`remote.delegateRouterStats` → `list(sessionId)` 拉账本 | `src/client/index.jsx:7,89-126`；`lib/typert.remote-client.js:7-36`；`lib/client.js:14661-14697` |
>
> 行号约定：以 `lib/index.js`（宿主）、`lib/stats-service.js`（stats sidecar）、`lib/typert.host.js` + `lib/typert.remote-client.js`（Typert 描述符）、`src/client/index.jsx`（client 唯一源，经 esbuild 打包到 `lib/client.js`）为准。**未读/不深读部分**：`lib/client.js` 中 zod 与 react-jsx-runtime 之间的中间代码（约 14 540–14 700 行）只 grep 不读；`scripts/measure-savings.mjs` 仅读源码、未在本地 `C:/Users/MECHREVO/.dsh/sessions` 复跑；`scripts/e2e-*.mjs` 13 个脚本仅抽样 2 个（`e2e-delegate.mjs`、`e2e-delegate-cmd.mjs`），其余仅确认存在；`cordis.patch.yml` 的第二个 insert 块（`delegate-router-stats` 行）只到第 48 行无 config 子键 —— 这与 README/stats-service 的注释一致（sidecar 不暴露用户配置），但**不能从补丁文件直接证明该行为**；`scripts/patch-gate.mjs`、`scripts/ab-*.mjs`、`scripts/decode-sessions.mjs` 仅确认存在。文中涉及这些部分的结论均基于 grep 或转述并已标注。

## 1. 定位

一句话：**DSH 子代理模型成本的确定性分流插件**——主会话保持 Pro，子代理调用时按规则集分类"轻/重"，轻任务落到 Flash（¥/Mtok 为 Pro 的 1/3），重任务维持 Pro；不依赖模型自觉，每次分派写入持久账本供侧边栏 ⚡ 分派记录 面板查阅（README:5-12, README.zh:5-12）。

具体能力面：
- **三类规则源**：会话级模式 `/delegate auto | off | flash-all`、会话累计 token 预算 `budgetCapTokens`、任务文本（description+prompt）的关键词权重打分（README:34-44）。
- **三类降级面**：关键词 dominance 打分（heavy 在打平时胜出，但「明显偏轻」的任务能压过个别意外重词）；短任务阈值 `shortTaskMaxChars`；北京时间峰段（默认 9-12、14-18）+ 可选 `unknownToFlash` 激进模式（README:34-44）。
- **per-call override**：在 `subagent`/`subagent_fork` 工具上扩展 schema，新增可选 `provider`/`model` 两个字符串参数；调用方填了就直接用，触发 `manual` 决策并原样写账（lib/index.js:319-329, 336-339）。
- **持久账本**：用 `dsh-storage-domain` 打开 `subagent_router.ledger` 表，key=sessionId，value=`{decisions: [...]}`；每个 session 限 500 条（lib/index.js:42-46, 286-301）；客户端通过独立的 Remote service `delegateRouterStats.list(sessionId)` 拉取（lib/stats-service.js:43-64）。
- **host-plane correction 双保险**：工具 wrapper 在调用原 `subagent.execute` 之前分类并通过 `AsyncLocalStorage` 投递目标；`agent/request` 中间件再次校验子代理尚未发过 `request/header` 才覆写 `proposal.provider/model`，避免已被外部层重定过路由的子代理被误覆盖（lib/index.js:422-440）。

## 2. 架构与机制（源码级）

### 2.1 组件图（文字版）

```
DSH Host (Cordis)
 ├─ cordis.patch.yml insert [subagent-router, delegate-router-stats] (cordis.patch.yml:14-48)
 │
 ├─ subagent-router row  (lib/index.js)
 │   ├─ loadConfigFile() ── ~/.dsh/dsh-delegate-router.json (lib/index.js:200-209)
 │   ├─ env override ── DSH_DELEGATE_ROUTER_*_PROVIDER/MODEL (lib/index.js:230-247)
 │   ├─ decideRoute({text, config, sessionTokens, now}) ← 纯函数 (lib/index.js:155-195)
 │   │     ├─ mode 门控       off | flash-all
 │   │     ├─ 预算门控        budgetCapTokens > sessionTokens
 │   │     ├─ 关键词 dominance heavy wins ties; light > heavy → auto-light/-heavy
 │   │     ├─ 短任务门控      text.length ≤ shortTaskMaxChars → auto-short
 │   │     ├─ 峰时降级        beijingHour(now) ∈ peakHours + peakDemoteUnknown → peak
 │   │     └─ 未知兜底        unknownToFlash → auto-unknown
 │   ├─ keywordMatcher(keywords) ← ASCII→\b…\b 正则; CJK ≥2 → 子串 (lib/index.js:72-85)
 │   ├─ AsyncLocalStorage targetContext ── 跨 await 投递 {parent, target} (lib/index.js:259)
 │   ├─ wrapDefinition(original) ← 重注册 subagent/subagent_fork，扩展 schema (lib/index.js:310-352)
 │   ├─ syncAgent / syncAll ── 监听 agent/created+tools/change 套用包装 (lib/index.js:354-389)
 │   ├─ ctx.on('agent/request', next) waterfall ── 覆写子代理首条请求 (lib/index.js:422-440)
 │   ├─ ctx.on('agent/created') ── 从 AsyncLocalStorage 取 target 写入 targetByAgent (lib/index.js:391-398)
 │   ├─ ctx.commands.register({name:'delegate'}) ── 写 sessionModes (lib/index.js:444-457)
 │   └─ storageDomain.open('subagent_router').table('ledger') ── 持久账本 (lib/index.js:42-46,265-274)
 │
 └─ delegate-router-stats row (lib/stats-service.js)
     ├─ StatsService extends TypertRemoteService('delegateRouterStats') (lib/stats-service.js:35-39)
     ├─ list({sessionId}) ── ctx.storageDomain.get → 倒序 at → 冻结返回 (lib/stats-service.js:43-64)
     └─ Re-export domainSpec ── 与主行共享同一 storageDomain（避免 "already-open"）(lib/index.js:21, 267)

DSH Client (browser, Cordis)  ── src/client/index.jsx → bundled lib/client.js
 ├─ apply(ctx)
 │   ├─ ctx.locale.register('delegateRouter', {zh, en}) (src/client/index.jsx:90)
 │   ├─ ctx.remote.$mount(TYPERT_REMOTE) (src/client/index.jsx:91)
 │   ├─ slots.inject('shell.overlay', order=20, id='delegate-router-ledger') (src/client/index.jsx:99-113)
 │   │     └─ <LedgerHost> → remote.list({sessionId}) → subscribe(sessions.list) (src/client/index.jsx:68-87)
 │   └─ slots.inject('sidebar.footer.action', order=30, id='delegate-router') (src/client/index.jsx:115-125)
 │         └─ ⚡ 分派记录 按钮 → open=true → notify listeners 触发 overlay (src/client/index.jsx:117-122)
 └─ TRIGGER_LABEL 字典：8 类 trigger 的中英映射 (src/client/index.jsx:9-18)
```

### 2.2 路由判定深读（核心机制）

判定函数 `decideRoute` 是**纯函数**：除 `now` 外所有输入在参数里传入，无副作用，便于 `scripts/test-routing.mjs` 直接覆盖 22 个断言（test-routing.mjs:24-67）。规则按以下顺序短路评估（lib/index.js:155-195）：

1. **模式门控**：先看 `mode`。`off` → `undefined`（继承父模型，wrapDefinition 仍会记录 `manual` 之外的"未命中"，由 record 留痕，lib/index.js:336-348）；`flash-all` → 直接返回 `{route: flash, trigger:'flash-all'}`（lib/index.js:157-160）。
2. **预算门控**：`budgetCapTokens > 0 && sessionTokens > budgetCapTokens` → `{trigger:'budget'}`（lib/index.js:161-164）。`sessionTokensOf` 遍历父 agent 的 `session.events`，仅累加 `type==='assistant/message'` 事件的 `usage.inputTokens+outputTokens`（lib/index.js:124-135），纯线性扫描无缓存。
3. **关键词 dominance**：heavy `>0` 且 `heavy>=light` → `auto-heavy`；light `>heavy`（注意是严格大于）→ `auto-light`（lib/index.js:166-180）。打平 heavy 胜出是 README 标注"heavy wins ties"的来源；之所以 README 又说"明显偏轻的任务能压过个例意外重词"——是因为 light>heavy 严格大于允许 1 heavy vs 2+ light 的反超，但 1 heavy vs 1 light 时 heavy 留下（test-routing.mjs:33-38）。
4. **短任务门控**：`text.length <= shortTaskMaxChars && flash!==undefined` → `auto-short`（lib/index.js:181-183）。`shortTaskMaxChars=0` 关闭此规则（lib/index.js:216）。
5. **峰时降级**：`peakDemoteUnknown===true && isPeakHour(beijingHour(now), peakHours)` → `peak`（lib/index.js:184-190）。`beijingHour` 用 `Intl.DateTimeFormat('en-US', {timeZone:'Asia/Shanghai', hour:'2-digit', hour12:false})` 取小时，与宿主时区无关（lib/index.js:107-115）；`isPeakHour` 半开区间 `[start, end)`（lib/index.js:117-121），test-routing.mjs:55 验证 `12:00` 已不在峰段。
6. **未知兜底**：`unknownToFlash===true` → `auto-unknown`（lib/index.js:191-193）。默认 `false`，README 警告"aggressive"（README:43, 90）。
7. **继承父模型**：`undefined`（lib/index.js:194）。WrapDefinition 收到 `undefined` 后直接执行原工具，不写账（lib/index.js:346）。

**关键词匹配的精度**：ASCII 纯字母用词边界正则 `\bkeyword\b`，CJK ≥2 字走 `lower.includes` 子串，<2 字 CJK 静默丢弃（lib/index.js:72-85）。test-routing.mjs:40-46 三连断言：`list` 不误中 `specialist`、`design` 不误中 `designer`、单字 `行` 不命中 `银行开户`。

**会话级模式覆盖**：`/delegate` 命令 handler 把字符串 trim+lower 校验后写入 `sessionModes: Map<sessionId, mode>`，wrappers 在每次执行时调 `modeFor(parent)` 取父 agent 的 `agent.id`（注意是 agent id 而非 sessionId；同一 session 内有 root agent + 子 agent，但子代理不会自己跑 `/delegate`，因此这条假定安全，lib/index.js:303, 444-457）。`modeFor` 的回退是 `effective.mode`（即 patch+file+env 三层合流，lib/index.js:236-238）。

**per-call override 优先**：wrapDefinition.execute 第一行 `explicit = explicitTargetOf(args)`，若用户填了 `provider`/`model` 就直接返回 `original.execute(base, exec)`（在 `targetContext.run({parent, target:explicit}, …)` 里），记录 `manual` 并跳过分流（lib/index.js:331-339, 142-145）。

**工具 wrapper 重入防护**：每个被包装的 definition 挂 `WRAPPER_MARK = Symbol`，`syncAgent` 跳过已标记的（lib/index.js:28, 311, 367）；`syncAll` 是幂等的，由 `tools/change` 事件触发（lib/index.js:378-389, 405）。

### 2.3 host-plane correction 与 AsyncLocalStorage 协同

DSH 工具 wrapper 的 execute 是异步的，但子代理的 `agent/created` 在 `subagent.execute` 内部很早就触发 —— 父进程注册工具 → 调用方 await tool.execute → 工具内部派子 agent → 子 agent.created → 子 agent 发首条 request。如果只在工具 wrapper 里"建议"路由，路由可能被子 agent 的默认逻辑覆盖。

本插件用两层协同兜底：

- **第一层**：工具 wrapper 读决定 → 在 `targetContext.run({parent, target}, () => original.execute(base, exec))` 中投递（lib/index.js:338, 348）；子 agent `agent/created` 回调里 `targetContext.getStore()` 取出 pending，若 `agent.session.header.parentSession === pending.parent.id` 且 `isSubagent(agent)` 则把 target 写入 `targetByAgent: WeakMap<agent, target>`（lib/index.js:391-398, 54-57）。
- **第二层**：`agent/request` waterfall 在 proposal 出来后，检查子代理的 `session.events` 还没有越过 `seedLength` 边界的 `request/header` 才覆写 `proposal.provider/model`（lib/index.js:422-440）。`isSubagent` 判定依赖 `session.header.origin==='subagent'` 或 `delegationDepth>0`（lib/index.js:54-57），即依赖宿主在子会话的 header 里留下的元数据；这一假设的可靠性在 README/插件文档中未声明。

注释特别指出**该 waterfall 不影响已有 durable route 的子代理**——通过反向扫描 `session.events` 找最新一条 `event.seq >= header.seedLength` 的 `request/header`，找到就直接放行（lib/index.js:427-434）。

### 2.4 账本：写多读少的 storage-domain 单表

- **写**：每次 wrapDefinition.execute 命中任意规则（含 `manual`）都 `record(sessionId, task, route, trigger)`，内部把 write 串到 `decisionTail = decisionTail.then(write, write)`，失败被吞以"ledger failures never break delegation"（lib/index.js:282-301）；按 `slice(-500)` 限长（lib/index.js:295）。
- **读**：独立的 host-plane row `delegate-router-stats` 暴露 Remote service（lib/stats-service.js:35-39）；读时把 `decisions` 倒序（`b.at - a.at`）、冻结返回（lib/stats-service.js:50-59）；读失败也吞 `EMPTY`（lib/stats-service.js:60-63）。
- **共享 domain**：stats-service 与 router 各自 `defineDomain` 同一 `name='subagent_router', version=0`（lib/index.js:42-46, lib/stats-service.js:27-31），但通过 `ctx.storageDomain.open/get` 复用同一份打开的 domain（注释：`opening it a second time would throw 'already-open'`）。stats-service 是 `let StatsService = class ...` 后再 `export`，`Remote('list')(void 0, {...})` 是 Typert 装饰器形态（lib/stats-service.js:67-74）。
- **客户端**：覆盖层 `LedgerHost` 每次 mount 时 `ctx.remote.delegateRouterStats.list({sessionId})`（src/client/index.jsx:73-76），并 `subscribe(ctx.sessions.list)` 在切会话时刷新（src/client/index.jsx:84-85）；返回 `null` 走 `setDecisions([])` 兜底（src/client/index.jsx:77-80）。

### 2.5 配置三层合流

`apply()` 在构造 `effective` 时按优先级 `env > file > patch`，但只对字符串型（provider/model）用 `||`，数值/布尔/列表/二维数组分别用 `numOr/boolOr/listOr/windowsOr`（lib/index.js:230-257）。`mode` 用白名单兜底，未识别的值退回 `'auto'`（lib/index.js:236-238）。`windowsOr` 在两侧皆非合法 `[[start,end]…]` 数组时回退到 `DEFAULT_PEAK_HOURS = [[9,12],[14,18]]`（lib/index.js:219-227, 104）。

### 2.6 客户端 UI 极简

唯一源 128 行 `src/client/index.jsx`：一个按钮（`sidebar.footer.action`，order=30，id=`delegate-router`，className `dshdr_toggle`）+ 一个 overlay 覆盖层（`shell.overlay`，order=20，id=`delegate-router-ledger`，className `dshdr_veil/dshdr_panel`）。`open` 是 `apply` 闭包内 `let`，用 `listeners: Set` 手动通知两处注册的下游 hook 强制 rerender（src/client/index.jsx:93-113）—— 这是个轻量的"组件外状态"hack，无 Redux/Zustand。CSS 全部内联在 `<style>` 字符串里（src/client/index.jsx:49-62），经 esbuild 打包后嵌进 `lib/client.js:14626-14639`；`zh/en` 两个 locale 字典是空对象（src/client/index.jsx:20-21），仅 NS 字符串生效。

### 2.7 与 dsh-routing-suite 的关系

README 与 README.zh 自述本插件负责"child-model cost layer"，而 `yjh051108/dsh-routing-suite` 负责"thinking-mode / persona layer"，二者叠加：本插件把轻子代理送到 Flash，routing-suite 用 flash-specific weak persona 运行（README:51-60, README.zh:46-52）。这是一种**正交协作**而非竞争：同一调用在不同轴上做决策。`scripts/` 中无任何 routing-suite 相关代码，本插件不依赖、不感知。

## 3. 对本项目（AGE）的可用模式（Adopt/Adapt/Reject）

AGE 自身没有 DSH 的 subagent 工具，但存在 flow-engine 执行器、Step 与子任务、session 概念；下列模式中标注 AGE 可直接借鉴的部分：

| # | 模式 | 判定 | 映射与理由 |
| | --- | --- | --- |
| 1 | 纯函数分类器 `decideRoute({text, config, sessionTokens, now})` | **Adopt** | AGE flow 的 step 选择器、模型路由策略都应保持纯函数形态；副作用（读文件、写账）外移到 caller。当前已有 vitest，但确保"决策函数零 IO"这条纪律没明文。 |
| 2 | 关键词 dominance 打分：heavy wins ties，但 light>heavy 严格大于允许反超 | **Adopt-lite** | 用在 "task 描述→模型族选择" 上很合适；权重可替换为 embedding 相似度或 LLM 分类，但骨架可以照搬（短路顺序：explicit > 模式 > 预算 > 关键词 > 兜底）。 |
| 3 | 工具 schema 扩展 + per-call override（`provider`/`model` 字段） | **Adapt** | DSH subagent 工具名耦合过深不能直接照搬，但"把可选的覆写字段加进 schema 而不破坏原协议"的模式可借鉴。AGE Step 调用可考虑加 `model_hint?: string` 类似的字段，executer 接收后做策略协商。 |
| 4 | host-plane 双保险（AsyncLocalStorage 投递 + waterfall 覆写首请求） | **Adapt** | 模式上可借鉴：在 dispatch 层"建议"路由，在执行层"强制覆写"还没下发的第一帧配置；AGE 若未来在 driver 层做调度+executer 层做首次派单，需类似的双层协议。 |
| 5 | 账本结构 `{sessionId, at, task, route, trigger}[]` 限长 500 | **Adopt** | AGE 现已有 mission-driver 的 dev log 与 mission JSON，但缺"每次决策的可读审计"；可仿照建一张轻量 `delegation_ledger.jsonl` 落 dev log 旁，避免回写 mission 文件本身。 |
| 6 | 失败吞掉不影响主流程（`/* ledger failures never break delegation */`） | **Adopt** | AGE 的观察/审计通道必须满足 "永远不让事实记录失败阻塞业务路径"；本插件在 write 与 read 两端都吞异常，符合 mission-driver 的"监视可坏、流程不许坏"原则。 |
| 7 | Remote service 独立 host-plane row（避免 API gateway 解析不到） | **Reject** | 这是 DSH bundle 拓扑的特定约束，与 AGE driver 的 Node CLI 进程模型无关；记下做约束了解即可。 |
| 8 | 北京时间峰段 + 定价 1/3 比例（Flash=Pro/3） | **Reject** | 与 DeepSeek V4 价格表深度耦合，AGE 不应背任何单家厂商的计费表；若要做成本优化，应接入 OpenRouter/自托管/多 provider 通用抽象，本插件不是参考实现。 |
| 9 | 会话级 `/delegate` 命令 | **Adapt** | "/session-mode" 命令的形态（`/delegate auto | off | flash-all` → 写内存 map）值得 AGE mission-driver 的 plan/resume 模式借鉴，但语义应改为 mission-scoped 而非 session-scoped。 |
| 10 | 配置三层合流（env > file > patch） | **Adopt** | AGE 现仅 .env + YAML，可仿照引入 `~/.<name>.json` 文件兜底层；`numOr/boolOr/listOr/windowsOr` 的"默认白名单+回退"模式比简单 `??` 更稳健。 |
| 11 | 客户端覆盖层（overlay + sidebar button） | **Reject** | 与 DSH 浏览器核 + slots seam 强耦合；AGE 是 CLI/编辑器场景，UI 不在此处。 |

## 4. 风险与不适用面

1. **强宿主耦合**：`subagent`/`subagent_fork` 工具名、`session.header.origin='subagent'`、`session.header.delegationDepth`、`agent/created`、`agent/request` waterfall、`tools/change` 等都是 DSH 私有事件面（lib/index.js:54-57, 391-440）。任何借鉴点都要换宿主 API 翻译，**实现层一行不抄**。
2. **单厂商计费表假设**：README:26-29、README.zh:23-27 全篇围绕"Flash=Pro/3"这一 2026-08-17 定价；模型名 `deepseek-v4-pro/flash` 写在默认 config 与测试里（cordis.patch.yml:18-22, test-routing.mjs:5-6），任何上游调价或换模型都需重写脚本（measure-savings.mjs:13-16）。
3. **host-plane correction 假设了子会话 header 元数据**：`isSubagent` 同时依赖 `origin==='subagent'` 和 `delegationDepth>0`（lib/index.js:54-57）；若 DSH 未来 header schema 改字段名，本插件的 waterfall 会"放行所有子代理的覆写"，表现为路由被绕过而无任何报错。建议复测时确认这两个 header key 仍然存在。
4. **客户端 bundle 体积**：`lib/client.js` 14 701 行，几乎一半是内联的 zod 4.4 + react-jsx-runtime 适配（约 1–14 540 行均非本插件代码）；本插件有效代码约 130 行（src/client/index.jsx）+ 几行 Typert 描述符（lib/client.js:14549-14592）。如果借鉴客户端模式，体积优化的可借鉴面有限（zod 外部化已在 build-client.mjs:25 做了 `external`，但浏览器侧仍被打包进 lib/client.js，未走 NPM tree-shaking）。
5. **本地浅克隆**：仅 1 commit（`a6e0e17 "0.4.0"`），无法核实 v0.1 → v0.4 的演进史；stars/外部反馈均来自任务书给定的二手数据。docs/README 自述 4 routed runs 156K tokens 的省钱数字（README:30, README.zh:26-28）来自脚本作者的本地 `C:/Users/MECHREVO/.dsh/sessions`，**未在第三方复测**。
6. **measure-savings.mjs 不可直接复跑**：硬编码 `C:/Users/MECHREVO/.dsh/sessions` 路径（measure-savings.mjs:12），且 zstd 帧头 `0xfd2fb528` 的扫描是字节级 byte-walk（measure-savings.mjs:33-43），仅限该作者的会话格式；若 AGE 借鉴思路，需重写路径/解析层。
7. **没有 token-cost accounting**：README:16、lib/index.js:16-17 明示"token-cost accounting arrives with the stats phase"——目前账本只记 trigger + route，**没有价格换算**。measure-savings.mjs 是离线脚本，不在插件运行时内做实时节省统计。
8. **价格假设会被覆盖**：`unknownToFlash: true` 是 README 标注的"aggressive — leave false unless you are sure"（README:43, 90），意味着作者自己也认为该开关默认不应开；rule 链中越是后置的兜底越激进，AGE 若照抄规则链，需重写兜底策略的合理化说明。

## 5. 关键源码索引

| 主题 | 位置 |
| | --- |
| 路由判定纯函数（8 级短路顺序） | lib/index.js:155-195 |
| 模式门控 `off`/`flash-all` 早返回 | lib/index.js:156-160 |
| 预算门控 `budgetCapTokens` | lib/index.js:161-164 |
| 关键词 dominance 打分（heavy wins ties） | lib/index.js:166-180 |
| 短任务门控 `shortTaskMaxChars` | lib/index.js:181-183 |
| 峰时降级 `peakDemoteUnknown` + `beijingHour` | lib/index.js:184-190, 107-115 |
| 未知兜底 `unknownToFlash` | lib/index.js:191-193 |
| 关键词匹配器（ASCII 词边界 + CJK ≥2 字） | lib/index.js:72-95 |
| 任务文本 = `description + prompt` | lib/index.js:59-65 |
| 子代理识别 `isSubagent`（依赖 session.header） | lib/index.js:54-57 |
| 父会话累计 token `sessionTokensOf` | lib/index.js:124-135 |
| 工具 wrapper `wrapDefinition` + per-call override 字段 | lib/index.js:310-352（schema 扩展 319-329） |
| `WRAPPER_MARK` 重入防护 + `syncAgent/syncAll` | lib/index.js:28, 354-389 |
| AsyncLocalStorage `targetContext` 跨 await 投递 | lib/index.js:259, 338, 348, 392-396 |
| host-plane `agent/request` waterfall 覆写首请求 | lib/index.js:422-440 |
| `/delegate` 命令注册与会话模式 map | lib/index.js:444-457, 261, 303 |
| 持久账本 `subagent_router.ledger` 表 | lib/index.js:32-46, 265-274, 282-301 |
| 三层配置合流 env > file > patch | lib/index.js:229-257, 200-209 |
| 注入声明（宿主 + 客户端） | lib/index.js:211；src/client/index.jsx:7 |
| stats sidecar 独立 host-plane row | cordis.patch.yml:46-48；lib/stats-service.js:1-12, 35-39 |
| Typert Remote `list(sessionId)` | lib/stats-service.js:43-64 |
| Typert host manifest 描述符 | lib/typert.host.js:8-62 |
| Typert client Remote 描述符 | lib/typert.remote-client.js:7-36 |
| 共用 zod schema | lib/schemas.js:6-22 |
| client LedgerPanel + LedgerHost | src/client/index.jsx:23-87 |
| client slots 注入（sidebar.button + overlay） | src/client/index.jsx:99-125 |
| 客户端 bundle 构建（esbuild → window.__ModuleLoader__） | scripts/build-client.mjs:20-37 |
| 确定性规则单测 22 例 | scripts/test-routing.mjs:24-67 |
| 离线省钱测算脚本 | scripts/measure-savings.mjs:8-118（路径硬编码 :12） |
| 插件 shape + Typert 校验 | scripts/smoke.mjs:11-34 |

未读备查：`lib/client.js:1-14540`（zod + react-jsx 适配，只 grep 不读）、`scripts/measure-savings.mjs` 未实跑、`scripts/e2e-*.mjs` 13 个脚本仅抽样 2 个（`e2e-delegate.mjs`、`e2e-delegate-cmd.mjs`）、`scripts/patch-gate.mjs`、`scripts/ab-*.mjs`、`scripts/decode-sessions.mjs`、`cordis.patch.yml` 第二 insert 块的 config 字段（文件中未显式给出，但与 lib/stats-service.js:1-12 的注释"sidecar 无用户配置"一致）。本报告涉及上述文件的结论均只基于 grep/README 转述并已在文中标注。