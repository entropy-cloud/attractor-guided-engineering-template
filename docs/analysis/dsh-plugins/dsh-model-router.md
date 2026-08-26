# dsh-model-router 调研报告（dsh-plugins）

> | 项 | 值 | 依据 |
> | --- | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-model-router/`（`/Users/abc/ai/dsh-plugins/dsh-model-router`） | 本地目录 |
> | 来源 repo | `https://github.com/welsione/dsh-model-router.git`（npm `@welsione/dsh-model-router`），本地 HEAD `0.0.7`（"all-failed 上报改代表错误 + 候选全冷却死循环修复 + reasoningEffortsFallback 持久化"） | `package.json:1-5`；`CHANGELOG.md:3-12` |
> | stars | 任务未给；本任务未做 web 检索核实。`docs/ecosystem-listing.md:8-13` 列出多个 awesome 目录收录 PR（含 0xsline/awesome-deepseek-harness PR #473 待评审、imsai-sh 1024Store PR #188 已合并），与本报告任务来源一致 | `docs/ecosystem-listing.md:8-13` |
> | 语言 | JavaScript（Node ≥ 22 ESM，`"type":"module"`） + React 18/19 浏览器端（UMD 风格 `window.__ModuleLoader__.load` factory）；零运行时依赖（仅 `@deepseek-ai/schemastery`，peer 钉 cordis / dsh-session / dsh-settings / dsh-client-ui-* / react） | `package.json:8-58` |
> | license | MIT | `LICENSE:1-21`；`package.json:43` |
> | 版本/兼容 | v0.0.7（2026-08-25）；peer 钉 DSH `0.1.0-rc.x` 全家桶（cordis ^4 <5；dsh-session / dsh-settings / dsh-client-ui-{primitives,settings} 均 `>=0.0.1-rc.1 <0.1.0 \|\| >=0.1.0-rc.1 <0.2.0-0`）+ react ^18/^19；README 自述最后验证 `DSH 0.1.0-rc.8`（README.en.md:51） | `package.json:3,52-58`；`README.en.md:51` |
> | 测试/CI | 30 用例 `node --test` 单测（`tests/core.test.mjs` 405 行，零依赖），GitHub Actions `ci.yml` 跨 ubuntu/windows/macos × Node 22 跑 `node --check` + `npm test` + `npm pack --dry-run`（`ci.yml:9-29`）；额外 `.github/workflows/npm-publish.yml` 推 `v*` tag 校验版本一致后自动 publish 到 npm；`docs/self-check.md:25-31` 自报最近一次 `check.mjs 93/100 (A)` + `test.mjs` 全 PASS。本次未运行任何测试 | `package.json:25-29`；`tests/core.test.mjs`；`.github/workflows/ci.yml`；`docs/self-check.md` |
> | 宿主 API 面 | host 侧 `apply(ctx)`（`lib/index.js:82-1098`），`inject: ['llm','webServer','settings','sessions']`（`lib/index.js:85`）；监听 `llm/stream` + `agent/request` 两个 cordis waterfall；注册 5 个 `webServer` exact path（state / save / model-capabilities / efforts / cooldowns/clear / tier）；mutate `KNOWN_SESSION_EVENT_TYPES` Set 加入 `model-router/route`（`lib/index.js:104-108`）；`installSettingsSection` 注册持久化 section；client 侧 `lib/client.js:1294-1500` 在 `ctx.inject(['slots','modelDirectories','sessions'])` 里注册 `settings.section`（模型路由卡片）+ `conversation.input.model`（套餐选择器，priority:-1 遮蔽原生）+ `conversation.input.left`（实时路由状态徽章）三个 slot | `lib/index.js:82-1098`；`lib/client.js:1444-1495`；`cordis.patch.yml:1-3` |
>
> 行号约定：以 `lib/*.js` / `lib/*.mjs` 为准（仓库无 TS 源码，发布产物即源）。**未读部分**：`lib/client.js` 的 90% UI 渲染细节（仅细读了 `Panel`/`PackageSelect`/`OverlayStatus` 入口与 462-820 段 CSS 行 + 1444-1500 的 slot 注册，`chainEditor` / `renderCapsBody` 等具体 JSX 装配仅 grep 未通读）；`test-model-reasoning.mjs`（实测脚本，未运行）；`docs/ecosystem-listing.md` 已读；`assets/` 图片二进制未读。文中涉及未读 UI 装配的结论均以"未细读"标注。

## 1. 定位（含与其他 dsh 路由类插件的关系判定）

一句话：**DSH 宿主侧的"统一模型路由"插件**——给 LLM 流一个**包装中间件**，把多个 provider 的同名（或同语义）模型聚成一个**逻辑 ModelID**，按"套餐"组织三档 `tier1/tier2/3` 候选链，对外暴露统一入口；对内做首 token 前的自动故障转移 + 分级冷却 + 健康度重排 + 上下文窗口感知跳过；宿主侧把同一组件接进 `agent/request` 水管以修正"信封模型 vs 实际首候选"不一致，并把运行时状态写到会话事件流、配套一个完全自动保存的管理面板（`README.md:5-12`、`lib/index.js:1-46`）。

**与 DSH 内置能力的关系**：`ctx.llm.stream` 是宿主已经能调任意 provider 模型的 API；本插件的差异在于**在 stream 这一层之上引入了一个 selection/state 层**，并把 selection 的"边界决策"统一收纳到一个 schemastery-验证过的 settings section。把"用户调用了 `deepseek-v4-flash`"这个字符串先查表 → 选档 → 选候选 → 注入候选自带 `reasoningEffort` → 调底层 `ctx.llm.stream`，对宿主而言仍是普通流；但用户体感从"指定具体 provider/model"变成"指定套餐 + 档"。

**与其他 dsh-plugins 路由类插件的关系**：与 `dsh-agent-relay`（产物递送）、`dsh-agent-teams`（多 Agent 团队）、`dsh-routed-subagent`（子代理委派）完全不同赛道——后者关心的是**谁来跑**（agent preset 派发），本插件关心的是**跑在哪个 model 上**（provider 候选）。同仓库没有第二个 "model-router"；生态里有同名异主 `tianji-qingtian/dsh-model-router`、`superboy911/dsh-model-router`、`fonlan/dsh-model-router`、`thedeveloper256/dsh-model-router@0.6.2`（`docs/ecosystem-listing.md:31`），但本插件以 scoped npm 包 `@welsione/*` 标识，差异化在"统一逻辑 ModelID + 多供应商候选链 + 首 token 前故障转移 + 健康度择优 + 三档 + 思考级别 + 管理面板"（`docs/ecosystem-listing.md:32`）。

**与宿主 `llm-pi-ai` 的关系**：插件**读**宿主 `llm-pi-ai` 的 `resolveModelInfo` / `resolveCallConfig` / `listProviders` / `listModels` 拿模型目录与能力（`lib/index.js:326,694-704,712-731`）；**写**宿主 `llm-pi-ai` 的 `settings` 命名空间仅限 capability（`reasoningEfforts` / `contextWindow` / `maxTokens`）且**仅限自定义（hand-declared）供应商**——内置目录供应商的能力由宿主目录管理，插件拒绝（403）写回（`lib/index.js:1000-1003`）。这种"插件写宿主命名空间"是双向耦合，正面看是能力闭环（hand-declared 模型可即时声明推理档位），负面看是打破了"插件只读写自己 namespace"的边界。

## 2. 架构与机制（源码级）

### 2.1 组件图（ASCII）

```
                     DSH Web (browser, Cordis)
                     └─ lib/client.js  inject[slots, modelDirectories, sessions]
                          ├─ settings.section  → <Panel/>          (order:13 label=模型路由)
                          │     · 总开关 / 冷却 / 重试 / 健康度 / 上下文感知 / 兜底档位
                          │     · 每个套餐(tier1/2/3)的彩色胶囊档位名 + 候选链 + ↑↓删除
                          │     · 思考级别下拉（目录 verified / 兜底未验证）
                          │     · 自定义供应商能力卡片（写回 llm-pi-ai）
                          │     · 最近事件折叠表 + 冷却池展示
                          ├─ conversation.input.model  → <PackageSelect/>  (priority:-1)
                          │     · 套餐 + 档位（含 tierNames 自定义名）
                          │     · 手动选档 → POST /api/model-router/tier → settings.mutate
                          └─ conversation.input.left  → <OverlayStatus/>   (order:5)
                                · 订阅会话 model-router/route 事件（started/served/all-failed）
                                · 显示当前档位 + provider/model + reasoningEffort

                     DSH host (Node, Cordis)
                     └─ lib/index.js  inject[llm, webServer, settings, sessions]
                          ├─ settings section  → schemastery Config(...)
                          │     installSettingsSection(ctx, 'model-router', Config, ...)
                          ├─ ctx.on('llm/stream', waterfall)            lib/index.js:564-640
                          │     ├─ selectTierCore(options, route, manual)  core.mjs:208-218
                          │     ├─ pickChainCore(route, tierSlot)           core.mjs:221-228
                          │     │     (tier3→tier2→tier1 降档兜底)
                          │     ├─ rankChainByHealth(chain, health)        core.mjs:160-166
                          │     ├─ contextWindowsFor(chain) → filterChainByContext
                          │     └─ routeThrough(chain, options, cfg)       lib/index.js:357-559
                          │           · 单候选 retryOnThrottle 内循环
                          │           · 失败: markCooldown + markHealth + bump
                          │           · all-failed: pickRepresentativeFailure → finish{error}
                          ├─ ctx.on('agent/request', waterfall)          lib/index.js:659-688
                          │     └─ 把 config.provider/model 改写为「当前档位首可用候选」
                          │           （让轨迹/信封/原生选择器显示真实首候选）
                          ├─ webServer.register('exact', 5 paths)        lib/index.js:908-1083
                          │     /api/model-router/state | save | model-capabilities
                          │     /api/model-router/efforts | cooldowns/clear | tier
                          └─ KNOWN_SESSION_EVENT_TYPES.add('model-router/route')  lib/index.js:105
                                （让含该事件的会话通过 dsh-session-persistence 校验）

                     持久层
                     ├─ settings 'model-router' 段（routes / cooldownMs / healthRanking / manualTiers ...）
                     └─ settings 'llm-pi-ai' 段（自定义供应商能力写回，深合并）
```

### 2.2 路由决策（`llm/stream` 中间件，源码级）

**入口**：`lib/index.js:564` 的 `ctx.on('llm/stream', (options, next) => {...})`，每次 `ctx.llm.stream` 调用都会先过这道闸。判 5 项短路：

1. `options[RESOLVED]` 已设 → 直接 `next()`（`lib/index.js:565`，防重入；`RESOLVED` 是 `Symbol('dshModelRouterResolved')`，`core.mjs:11`）；
2. `cfg.enabled === false` → `next()`（`lib/index.js:567`）；
3. `cfg.routes[options.model]` 与 `findByCandidate(cfg.routes, options.model)` 均未命中 → `next()`（`lib/index.js:569`，核心路径：只有已声明的 ModelID 才接管，旁路透明）；
4. `pickChainCore(route, tierSlot)` 返回 null → `next()`（`lib/index.js:574`，意味着当前 tier 链为空，连降档兜底都没有）；
5. 否则接管。

**选档**（`core.mjs:208-218`）：显式 `options.tier` ∈ {1,2,3} → 直接映射；`options.purpose === 'compaction' || 'session-title'` → `tier1`；会话级手动档（`manualTiers.get(sessionId)`）若该档非空 → 取手动档；否则 `tier2`。这是一个**"purpose 优先 → 手动档覆盖 → 默认"**的三层回退。

**选链**（`core.mjs:221-228`）：从选中的 `tierSlot` 开始往前回溯——`tier3` 选 `tier3` 空则降 `tier2` 仍空则降 `tier1`；`tier2` 选 `tier2` 空则 `tier1`；`tier1` 只看 `tier1`。三档是**有意义的语义层**（轻量/标准/强大，对标 Claude Haiku/Sonnet/Opus），但路由层面是「一个有序数组 + 降级」。

**健康度重排**（`core.mjs:160-166`，`lib/index.js:579`）：可选 `cfg.healthRanking`，对候选链按 `candidateHealthScore` 打分，**稳定排序**（`Array.prototype.sort` + 原始 index tie-breaker），同分保持配置顺序。评分细节见 §2.4。

**上下文窗口预过滤**（`core.mjs:331-345`，`lib/index.js:370-397`）：用 `estimateRequestTokens(options)` 估算请求体量（`core.mjs:307-322`：每个 message 走 `estimateContentTokens` 按 type 分支，CHARS_PER_TOKEN=4、BLOCK_OVERHEAD=4、ROLE_OVERHEAD=4，与宿主 token-meter 同标尺）；从 `ctx.llm.resolveModelInfo` 拉窗口（`lib/index.js:317-332`，缓存到 `contextWindowCache`，目录未声明则 256K 兜底）；`need > window * margin` 即跳过（默认 margin=0.9，reserve=8192）。**被跳过的候选不算失败**——它的健康档案不被污染，对小请求仍可用。**全被跳过则回退原链**继续 failover，宁可浪费一次 failover 也不能误杀可用候选（`lib/index.js:392-396`）。

**冷却过滤**（`lib/index.js:581`）：`chain.filter((c) => !isCoolingDown(c))`，按 `cooldownKey(c) = ${provider}/${model}`（`core.mjs:19`）查 `cooldowns` Map。若可用候选**为空**，进入 `lib/index.js:582-632` 的二段决策：

- 若**原请求目标**（`${options.provider}/${options.model}`）**就在被冷却的链上**——这就是"刚失败的坏候选"，passthrough 直连必然再次失败 → 宿主 `dsh-llm-retry` 会进入死循环；此处改为**直接 all-failed**，错误码取冷却记录里的代表错误（`pickRepresentativeFailure` + 冷却记录重算）。
- 否则 passthrough 原路径（`withSanitizedReplayState` 剥掉跨 provider 的 `replayState`，防历史消息污染）。

**真正尝试链**（`routeThrough`，`lib/index.js:357-559`）：每个 candidate 一次进单候选循环 `attempt ∈ [0, maxAttempts)`，`maxAttempts = retryOnThrottle ? (1 + maxRetriesPerCandidate) : 1`（默认 3）。对每个 attempt：`ctx.llm.stream({...options, [RESOLVED]: true, provider, model, reasoningEffort})` 拉流，**所有 chunk 原样 yield 透传**（已输出后失败也透传，不重试不切换，避免重复内容），仅在两种情况判定 attempt 失败：

- 流正常收到 `finish` chunk 但 `reason.kind === 'error' || 'aborted'` 且 `!sawContent` 且 `isRetryableFailure(reason.failure)` → `attemptFailed = true`（`lib/index.js:439-446`）；
- 抛错且 `!sawContent` → 同上（`lib/index.js:466-474`）。

attempt 失败后**先按失败类型分流**（`lib/index.js:491-506`）：

- `transient = isTransientFailure(attemptFailure)` 且 `attempt + 1 < maxAttempts` → 线性退避 `wait = retryBackoffMs * (attempt + 1)` ms 后**重试同一候选**（不停在该候选上，再给一次机会）；
- 否则（持久性错误如 AUTH / UNKNOWN_MODEL / 重试耗尽）→ `markCooldown(candidate, attemptFailure)` + `markHealth(candidate, false, attemptFailure)` + `bump(options.model, 'failovers')`，**切下一个候选**。

`maxSwitchesPerStep` 兜底：累计切换次数超阈值则提前 break（`lib/index.js:536`）。**all-failed** 时调 `pickRepresentativeFailure(allFailures)`（`core.mjs:59-63`）：优先挑**非瞬时（持久性）错误**——AUTH / UNKNOWN_MODEL / INVALID_ARGUMENT 等宿主层不会整链盲目重试的代码；全瞬时时才报链首（`lib/index.js:543-558`）。这是 0.0.7 修复的核心点（CHANGELOG.md:5）。

**`agent/request` 改写**（`lib/index.js:659-688`）：在 `agent/request` waterfall 里，把 `config.provider/model` 改写为「**当前档位首可用候选**」（冷却过滤 + 健康排序后的第一位）。动机：宿主会把 `agent/request` 返回的 config 写进 `request/header`（轨迹/原生模型显示的数据源），但这发生在 `llm/stream` 中间件改写**之前**——会话默认模型是套餐 key（如 `穷鬼套餐`）时，轨迹显示的是「套餐名」而非实际首发候选，严重误导；改写后轨迹/信封/prepareCall 的 contextWindow 都一致（`lib/index.js:643-657` 长注释）。**这两个 waterfall 不双路由**：改写后的 config 命中同样的 `routes`，走同样的 `llm/stream` 选档逻辑，二者天然一致。

### 2.3 故障转移分级冷却（feature: cooldown-grading）

**核心方程**（`core.mjs:80-92`）：

```
duration = baseMs × factor × backoff^streak  ，封顶 cooldownMaxMs
factor = RATE_LIMIT / QUOTA / EMPTY_RESPONSE → 0.2
       = SERVER / TIMEOUT / TRANSPORT / 5xx   → 0.5
       = AUTH / UNKNOWN_MODEL / 其他          → 1.0
backoff = cooldownBackoff (默认 2)
streak  = 连续失败次数（成功清零，core.mjs 在 markHealth 里维护，core.mjs:295、index.js:295）
```

`markCooldown`（`lib/index.js:264-279`）写入 `{until, durationMs, code, status, streak}` 到 `cooldowns` Map，`isCoolingDown`（`lib/index.js:303-309`）按 `until <= now` 惰性清理（顺手 `delete`）。**意图**：限流/配额是「候选活着只是被限」，60 秒就够了；服务端/网络抖动可能自愈，给 150 秒（base=300000 × 0.5）；AUTH/UNKNOWN_MODEL 是配置问题不重试不期待自愈，封顶 30 分钟（`cooldownMaxMs` 默认 1800000，CHANGELOG.md:26）。指数退避让"反复失败的候选"越来越被冷落，与健康度评分同方向但独立加权（健康度按滑动窗口时间衰减，冷却按确定性时长）。

### 2.4 健康度择优（feature: health-ranking）

**数据结构**（`lib/index.js:285-301`）：每个 `provider/model` 在 `health` Map 里维护 `{ok, fail, total, buf: [{ok, ts, code, status}], streak}`。`buf` 是**带时间戳的滑动窗口**，按 `healthWindowSize`（默认 8）裁剪。

**评分**（`core.mjs:142-158`）：逐记录**指数时间衰减**（`HEALTH_HALF_LIFE_MS = 5*60_000`）+ **错误码加权**：

- 成功：`+decay`（decay = `exp(-age / halfLife)`）
- 失败：`-decay × failureWeight(code, status)`，`failureWeight`（`core.mjs:67-72`）：SERVER/TRANSPORT/TIMEOUT/5xx → -3，RATE_LIMIT/QUOTA/429 → -1，其余（含 AUTH/UNKNOWN_MODEL）→ -2

排序用 `Array.prototype.sort`（稳定），同分保持原配置顺序（`core.mjs:164`：`(b.score - a.score) || (a.i - b.i)`）。

**与冷却的分工**：冷却是**硬墙**（直接跳过该候选），健康度是**软偏好**（仅在重排时生效）。两者都吃同一条 `markHealth` 输入（`lib/index.js:512,449,480`），数据源一致但用途不同——健康度给"还能用的候选里谁最稳"，冷却给"这个候选暂时别碰"。

### 2.5 三档 auto-by-purpose

`selectTier`（`core.mjs:208-218`）的判断序列：

1. `options.tier` 显式 `{1,2,3}` → 直接映射（最高优先级，**全链路显式覆盖**）；
2. `options.purpose === 'compaction' || 'session-title'` → `tier1`（**轻量请求强制走最便宜档**，避免压缩/标题消耗昂贵模型）；
3. 手动档 `manualTiers.get(sessionId)` 若该档链非空 → 取手动档；
4. 否则 `tier2`（**主对话默认档**）。

**`agent/request` 改写不参与自动选档**（`lib/index.js:669` 强制传 `purpose: 'main'`），因为它只在主循环触发，compaction / session-title 绕过它——这条边界在长注释里写明（`lib/index.js:657-659`）。手动档持久化到 `settings.manualTiers[sessionId]`（`lib/index.js:218-229` 走 `settings.mutate` 路径级 `set/unset`，不替换整段——这是 0.0.5 修复"自动保存清空手动档"的关键，CHANGELOG.md:20）。

### 2.6 思考级别（reasoning effort）

**候选级** `reasoningEffort`（`core.mjs:182-205`）：每个候选可声明，`effortsForCandidate` 描述候选池规则——目录已标注 `verified=true`，未标注从 `reasoningEffortsFallback`（默认 `['low','medium','high']`）选 `verified=false`，兜底空则**拒绝一切手动档位**。但这只是候选池；真正决定哪些档位可用是**保存时的实际请求预检**——`validateSection`（`lib/index.js:807-820`）对每个候选的 `reasoningEffort` 调 `ctx.llm.resolveCallConfig({provider, model, reasoningEffort})`，宿主在 provider I/O 之前拒绝不支持的 effort（`UNSUPPORTED_REASONING_EFFORT`）。**不在保存时通过的档位直接 400 报错**——这是 "1.2.0 预检（实际请求）" 引入的策略，把运行时错误提前到配置时（CHANGELOG.md:110）。

**模型能力写回**（`lib/index.js:967-1022` + `lib/index.js:843-906`）：面板可以编辑 `reasoningEfforts` / `contextWindow` / `maxTokens`，**深合并**写回宿主 `llm-pi-ai` 命名空间；只对 `declared === true` 的自定义供应商开放（内置目录供应商被 403 拒绝，`lib/index.js:1000-1003`）。`llm-pi-ai` 的 `onChange` 会热重载 adapter，**即时生效**——这是闭环"hand-declared 模型此前不声明 reasoningEfforts 时宿主判定 `reasoning: false` 拒一切 effort"的解法（CHANGELOG.md:103）。

### 2.7 会话安全

**replayState 跨 provider 清洗**（`core.mjs:236-251`）：在每次 `ctx.llm.stream` 之前，对 `options.messages` 里 `source.kind === 'model'` 的 assistant 消息检查 `source.replayState`——若其 `provider/model` 与当前候选及消息自身 `source.provider/model` 不全等，**剥离 replayState**（内容不动）。这是 0.0.1 之前的修复保留项：跨 provider 路由（opencode-go mimo-v2.5 → volcengine deepseek-v4-flash）会带着上一家的 replay token 串到下一家，导致 INVALID_REPLAY_STATE。

**`KNOWN_SESSION_EVENT_TYPES` 突变**（`lib/index.js:104-108`）：插件要往 session 日志里 `append('model-router/route', ...)`（`lib/index.js:241-254`），但这个 type 不在宿主白名单内，`dsh-session-persistence.assertEventsSupported` 会拒绝恢复含该事件的会话。插件直接把 type add 到 `KNOWN_SESSION_EVENT_TYPES`（共享模块实例，realpath 同源）——这是个**对宿主"out-of-repo 插件事件注册面"的使用**，注释里写明该 Set 是生成文件 + 启动时 mutate 的 runtime 产物（`lib/index.js:97-103`）。

### 2.8 面板 API（webServer 同源 fetch）

`lib/index.js:908-1083` 注册 6 个 exact path：

- `GET  /api/model-router/state` —— 配置 + 目录 + 思考档位 + 冷却 + 历史 + 统计 + 健康度（`lib/index.js:911-946`）
- `POST /api/model-router/save` —— 整段保存，含 `validateSection` 校验模型存在与思考档位（`lib/index.js:950-963`，`validateSection` 在 `lib/index.js:769-830`）
- `GET/POST /api/model-router/model-capabilities` —— 读/写宿主 `llm-pi-ai` 命名空间（`lib/index.js:967-1022`）
- `GET  /api/model-router/efforts?provider=&model=` —— 单候选档位实测（未保存候选惰性查询，`lib/index.js:1026-1045`）
- `POST /api/model-router/cooldowns/clear` —— 清空冷却池（`lib/index.js:1047-1056`）
- `POST /api/model-router/tier` —— 设置/清除会话手动档（`lib/index.js:1059-1083`）

**自动保存循环防回写**（`lib/client.js:121-219`）：前端用「本地草稿 vs 服务端基线」的**规范形**（`canonicalCfg` 排序 keys + dict）比对，避免保存成功后基线更新→草稿又被认为脏→再次保存的死循环；保存期间新修改会在完成后自动补存。

## 3. 对本项目的可用模式（Adopt/Adapt/Reject）

AGE 是 Attractor-Guided Engineering：把 mission/plan 当 attractor，driver/flow 当轨迹。插件是路由决策而非 attractor 求解，但有几条模式值得借鉴。

| # | 模式 | 判定 | 映射与理由 |
| | --- | --- | --- |
| 1 | 纯函数核心 + 接线层 + UI 层三段分仓（`core.mjs` 346 行零依赖 / `index.js` 1098 行 host wiring / `client.js` 1505 行 React） | **Adopt** | mission-driver 的 mission 解析 / plan 选择 / 证据聚合都该独立成 `core.ts` 纯函数；driver 只做 IO 接线；UI 只做投影。`core.mjs` 单元测试零依赖（仅 `node:test`），易于在 driver 的 git 文件事实源上做等价单测 |
| 2 | `Symbol(RESOLVED)` 防重入 + `next()` 透明 passthrough（`core.mjs:11`、`index.js:565,603`） | **Adopt** | mission-driver 的 `on('flow/*')` 中间件若也包了一层（attractor 求值 → plan 选 → step 执行），需要同样的"已解析则不再解析"防递归 symbol + 命中 passthrough；保持"未命中即透明"是中间件不抢戏的关键 |
| 3 | 双 waterfall 协同（`llm/stream` 选档执行 + `agent/request` 改信封），二者在同一 selection 表上做不同投影 | **Adapt** | mission-driver 可以在 `flow/start` 选 plan，在 `flow/header`（轨迹/信封写入点）改写 plan→step 投影，避免"轨迹显示的是 plan ID 而非真实首 step"；二者选档源必须共享，但入口分别挂 |
| 4 | 分级冷却 + 指数退避（`cooldownMs × factor × backoff^streak`，封顶） | **Adapt** | AGE 不接 LLM provider，但若 driver 在多 git remote / 多 cache 后端间选源，遇到 429/5xx 一样适用"分级退避"——限流短、IO 中、配额长；本质是把"错误码 → 时长"的工程语义外推到任何带外资源访问 |
| 5 | 滑动窗口时间衰减评分 + 稳定排序 tie-breaker | **Adapt-lite** | mission-driver 若要按"最近 N 个 mission 的健康度"选 attractor 邻域，半衰期衰减比纯计数更鲁棒；稳定排序保证显式优先级不被偶然重排破坏 |
| 6 | 候选池预检（保存时 `resolveCallConfig` 实测 → 不支持即 400） | **Adapt** | plan 落地前对 step 做 capability 预检（如 tool 是否在 catalog、path 是否可写、token 预算是否够），失败在 `validate` 阶段就拒，不让 runtime 失败污染进度。零外部资源的安全预检比运行时 try/catch 廉价得多 |
| 7 | 上下文窗口感知跳过（`estimateRequestTokens` → `filterChainByContext`） | **Adapt** | mission 上下文（plan/SPEC/docs 的总大小）超过某 attractor 的承载窗口时跳过——与"用 token 估算挑模型"同构；标尺与宿主一致是关键（与 token-meter 同源，避免两套估算打架，core.mjs:262-264 注释） |
| 8 | `KNOWN_SESSION_EVENT_TYPES.add` 突变共享 Set + session.append 写自定义事件 | **Reject**（对 AGE 而言） | AGE 不与 DSH session event store 耦合，没有等价的"事件白名单"机制；模式本身可借鉴（"插件可向宿主事件系统注入自定义类型"），但 AGE 的事件总线是自建的，不存在复用面 |
| 9 | 写宿主另一个插件命名空间（`llm-pi-ai` settings 深合并） | **Reject** | 双向耦合代价高：宿主版本变更/命名空间迁移会破坏插件；AGE 原则是"插件只写自己的 namespace"，跨插件能力写回应通过显式 API（事件/RPC）而非 settings 偷渡 |
| 10 | `webServer.register('exact', ...)` 面板 API + 浏览器同源 fetch | **Adapt** | mission-driver 若有 settings CLI/TUI 之外的 Web UI，复用 webServer 是天然选择；`ctx.effect(() => webServer.register(...))` 让卸载时自动反注册，是正确姿势 |
| 11 | 自动保存 + 规范形去重（`canonicalCfg` + `doAutoSave` 去抖 600ms） | **Adapt** | mission-driver 的 plan 编辑若走 Web UI，同源"任何改动去抖 N ms 后落盘 + 比对基线防回写循环"是正确形态；但 AGE 大概率不需要 Web UI，这条优先度低 |

## 4. 风险与不适用面

1. **强版本耦合**：`peerDependencies` 钉 `dsh-session` / `dsh-settings` / `dsh-client-ui-*` 三组 `>=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.2.0-0`（`package.json:53-56`），README 明示最后验证 `DSH 0.1.0-rc.8`；插件的 0.0.3-0.0.7 全部是 DSH 宿主 RC 间的适配修复（CHANGELOG.md:30-32,34-36），升 RC 几乎一定要跟装新版。
2. **篡改宿主事件白名单**：`KNOWN_SESSION_EVENT_TYPES.add('model-router/route')`（`lib/index.js:105`）依赖"宿主未把 Set 升级为不可变 / 未换实例"——0.0.x 期间一旦宿主改成 frozen Set 或换模块实例，插件会在事件恢复上静默失败（注释自述"harness 注释里为 out-of-repo 插件事件保留的注册面"，`lib/index.js:97-103`）。该注册面是**未公开契约**，可移植性差。
3. **写宿主 llm-pi-ai settings**：`settings.update('llm-pi-ai', { providers: ... })`（`lib/index.js:1012`）深合并 patch 的字段是 `contextWindow` / `maxTokens` / `reasoningEfforts`，但**实际契约依赖宿主 llm-pi-ai 的 schema 解析与 onChange 热重载**：宿主若改了字段命名/嵌套结构，PATCH 会被默默丢弃或部分覆盖。**建议替代**：通过宿主 `llm.registerProviderCapability()` 之类显式 API（若有）。
4. **中间件黑盒副作用**：`llm/stream` 中间件修改 `options.provider / model / reasoningEffort` + 跨 provider 清洗 `replayState` + 在流中提前 yield finish（`lib/index.js:555-558`），这些对调用方**可见但未声明**。若上层有"路由层做了什么"的断言（如同一条消息的 provider 字段必须 == 当前 selection 表），会与本插件冲突。
5. **健康度 + 冷却状态在内存**：`cooldowns` / `health` / `stats` / `manualTiers` 全是 `Map`/`[]`（`lib/index.js:171-178`），重启即丢；`manualTiers` 显式持久化到 settings（`lib/index.js:218-229`），其余不持久。重启后冷却归零，**首次请求全部重新打**——这对短跑测试无感，长会话/容器重启会有"重启后第一波请求全部走候选链首项"的尖峰。
6. **`contextWindowsFor` 的目录解析**：`ctx.llm.resolveModelInfo` 的结果缓存到 `contextWindowCache`（`lib/index.js:316`），**目录变更后不失效**——若宿主目录运行时更新（新增模型/改窗口），插件继续用旧缓存直至进程重启。
7. **本地浅克隆 + npm 包名变更**：`0.0.1 → 0.0.7` 共 7 个版本（CHANGELOG.md:3-126），本地 git 历史浅（按 survey 模板惯例），且 `0.0.1` 因包名冲突 + YAML bug 主动作废重发（CHANGELOG.md:34-40）；任何引用早期版本号的资料都不可靠。
8. **UI 形态不适用**：1505 行 React + Cordis client seam 对 AGE mission-driver（Node CLI）**无代码级复用路径**；价值全在 `core.mjs` 纯逻辑（§2.2-2.7），不在 `client.js` 装配。
9. **包裹链边界**：插件在 `agent/request` 与 `llm/stream` 两处都改了模型字段（`lib/index.js:679,431-433`），但**没有接管 `prepareCall`/`tools.guard`/`subagents`**——若宿主其它中间件先于本插件改过同一字段，结果可能与设计意图不一致（无证据但有风险面）。
10. **选档不可观测**：`selectTier` 是纯函数（`core.mjs:208-218`），但**为什么不选 tier3 / 手动档如何被覆盖**这类决策**没有事件落到 history**（history 只记 `started / served / failover / all-failed / manual-tier / skipped-context / passthrough`，`lib/index.js:402-526`），运营/调优时难以回溯。

## 5. 关键源码索引

| 主题 | 位置 |
| --- | --- |
| 入口与 cordis inject 声明 | `lib/index.js:82-85` |
| 篡改宿主事件白名单（KNOWN_SESSION_EVENT_TYPES） | `lib/index.js:104-108`（解释见 88-103） |
| schemastery Config schema（含 cooldownMs/healthRanking/contextAware/manualTiers 等全部字段） | `lib/index.js:113-165` |
| installSettingsSection 装载 + 手动档位恢复 | `lib/index.js:182-198` |
| 运行时状态容器（cooldowns / history / stats / health / manualTiers） | `lib/index.js:171-178` |
| 手动档位 set/unset + settings.mutate 路径级持久化 | `lib/index.js:200-229` |
| record/emitRouteEvent 事件落地（panel history + session event） | `lib/index.js:231-254` |
| markCooldown（分级冷却 + 指数退避 + 封顶） | `lib/index.js:264-279`（公式在 `lib/core.mjs:80-92`） |
| markHealth（滑动窗口 + streak 维护） | `lib/index.js:285-301` |
| resolveContextWindow / contextWindowsFor（目录缓存） | `lib/index.js:315-337` |
| `routeThrough` 单请求全链路（context 过滤 + 候选循环 + 重试 + 切换 + 失败上报） | `lib/index.js:357-559` |
| `llm/stream` waterfall 入口（短路条件 + 选档 + 健康排序 + 上下文过滤 + passthrough 决策） | `lib/index.js:564-640` |
| `agent/request` waterfall（信封模型改写为当前档位首可用候选） | `lib/index.js:659-688`（动机解释 643-657） |
| buildCatalog / buildEfforts / resolveEffortsFor（目录与档位发现） | `lib/index.js:693-766` |
| `validateSection`（保存时校验模型存在 + 实际请求预检 reasoningEffort） | `lib/index.js:769-830` |
| 写宿主 llm-pi-ai（GET/POST model-capabilities，限制自定义供应商） | `lib/index.js:843-906,967-1022` |
| `/api/model-router/state \| save \| efforts \| cooldowns/clear \| tier` 5 个 exact path | `lib/index.js:908-1083` |
| 纯逻辑核心：TIER_SLOTS / RETRYABLE_CODES / cooldownKey | `lib/core.mjs:7-19` |
| `isRetryableFailure` vs `isTransientFailure`（可转移 vs 可重试分离） | `lib/core.mjs:25-50` |
| `pickRepresentativeFailure`（all-failed 报代表错误，0.0.7 修复核心） | `lib/core.mjs:59-63` |
| `failureWeight` / `cooldownDurationMs`（健康度扣分权重 + 冷却方程） | `lib/core.mjs:67-92` |
| `normalizeRoute`（兼容旧 simple/complex）+ `findByCandidate`（按候选反查路由） | `lib/core.mjs:95-122` |
| `candidateHealthScore` / `rankChainByHealth`（时间衰减 + 错误码加权 + 稳定排序） | `lib/core.mjs:140-166` |
| `effortsForCandidate` / `validateReasoningEffort`（思考档位候选池 + 校验） | `lib/core.mjs:182-205` |
| `selectTier` / `pickChain`（purpose/手动档/默认三段选档 + tier3→tier2→tier1 降档） | `lib/core.mjs:208-228` |
| `withSanitizedReplayState`（跨 provider 防污染 replay token） | `lib/core.mjs:236-251` |
| `estimateRequestTokens` / `filterChainByContext`（CHARS_PER_TOKEN=4 启发式估算 + 窗口过滤） | `lib/core.mjs:266-345` |
| 客户端入口：UMD factory + CSS 注入 + ctx.inject slots | `lib/client.js:7-13,1294-1500` |
| `<Panel/>`（设置面板，30+ state hooks：cfg/load/save/auto-save/cooldowns/caps/draft） | `lib/client.js:28-826`（仅 65-219 细读，余 grep） |
| `<PackageSelect/>`（套餐选择器，订阅 modelDirectories.directoryFor） | `lib/client.js:858-1062`（仅 858-878 入口与目录订阅细读） |
| `<OverlayStatus/>`（实时路由状态徽章，双源：session event 订阅 + state 轮询） | `lib/client.js:1063-1292`（关键算法 deriveFromSession 1080-1105 + cfgInfo 反查 1153-1186 细读） |
| THINKING_LEVELS / TIER_ORDER 常量（与宿主 THINKING_LEVELS 同构） | `lib/client.js:273,462,820` |
| settings.section 注册（label=模型路由, order=13） | `lib/client.js:1447-1452` |
| conversation.input.model 注册（priority:-1 遮蔽原生 model 选择器） | `lib/client.js:1458-1480` |
| conversation.input.left 注册（实时路由状态徽章 order=5） | `lib/client.js:1483-1494` |
| 单元测试（30 用例 node:test 零依赖） | `tests/core.test.mjs`（全文 405 行） |
| CI：三 OS × Node 22 → node --check + npm test + npm pack --dry-run | `.github/workflows/ci.yml:9-29` |
| npm 自动发布：v* tag → 版本校验 → npm publish | `.github/workflows/npm-publish.yml`（仅文件名引用，未读全文） |
| 配置表（cooldownMs/healthRanking/contextAware/manualTiers 等） | `docs/usage.md:36-53` |
| 模型能力写回说明（仅自定义供应商可写） | `docs/usage.md:56-61` |
| 面板 API 表（6 个 endpoint） | `docs/usage.md:63-73` |
| 故障排查清单 | `docs/usage.md:74-82` |
| 自检报告（check.mjs 93/100 + test.mjs PASS） | `docs/self-check.md:25-41` |
| 生态收录 PR 状态（0xsline/awesome-deepseek-harness PR #473 待评审） | `docs/ecosystem-listing.md:8-13` |

未读备查：`lib/client.js` 的 `chainEditor` / `renderCapsBody` / `doAutoSave` 的具体 JSX 装配细节（约 482-826 行，仅 grep 与片段）；`test-model-reasoning.mjs` 实测脚本（仅文件名引用）；`.github/workflows/npm-publish.yml` 全文；`assets/readme/*.png/svg` 二进制；`lib/client.js:1298-1439` 的 CSS 细节（与功能无关）。本报告涉及未读部分均以"未细读 / 仅 grep"标注。