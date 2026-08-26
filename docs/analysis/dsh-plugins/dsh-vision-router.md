# dsh-vision-router 调研报告（dsh-plugins）

> | 项 | 值 | 依据 |
> | --- | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-vision-router/`（`/Users/abc/ai/dsh-plugins/dsh-vision-router`） | 本地目录 |
> | 来源 repo | `https://github.com/ysr666/dsh-vision-router.git`，本地 HEAD `44039c9`（"Merge pull request #313 refactor/2x-p1-routingpairs-direct-consumption"，浅历史）；origin 同名；repo 创建于 2026-08-13、最后 push 2026-08-26（GitHub API） | `git remote -v` / `git log --oneline -1` / GitHub REST `repos/ysr666/dsh-vision-router` |
> | stars | GitHub REST `stargazers_count=992`、`forks=44`（2026-08-26 抓取）；题目给定"约 637★"系 2026-08 更早快照，与当前值同量级 | GitHub API |
> | 语言 | JavaScript（GitHub API `language:"JavaScript"`），`"type":"module"`；`index.js` 单文件 ~7862 行（核心），加上 `lib/*.js` 共 92 个 .js 文件；少量 TypeScript/JSX 仅在 `tests/` | `package.json:11`；目录列表；`index.js` wc -l 7862 |
> | license | MIT | `LICENSE` / `package.json:5` / GitHub API `license.name=MIT License` |
> | 版本/兼容 | v2.0.1（`package.json:3`）；release 徽章 v2.0.0；`engines: node ^22.19.0 \|\| >=24.0.0`（`package.json:35`）；peer `@deepseek-ai/dsh-anonymous-user-id ^0.1.0-rc.6 \|\| ^0.1.1-rc.1`、`@deepseek-ai/dsh-llm-deepseek ^0.1.0-rc.6 \|\| ^0.1.1-rc.1`、`sharp >=0.35.3 <1`（均 optional）；CI 矩阵真机打通 DSH 0.1.0-rc.6/rc.7/rc.8（`.github/workflows/ci.yml:36-44`） | `package.json:35,56-65`；`.github/workflows/ci.yml` |
> | 测试/CI | GitHub Actions：`ci.yml` 矩阵 Node 22/24 + `dsh-contract.yml` ×3 个 DSH rc + `dsh-latest-canary.yml` + `release.yml` + `resource-stress.yml` + `star-history.yml` + `native-multimodal-cold-resume.yml` + `p1-routing-parity.yml`；`pnpm test` 跑完整 `node --test` 套件（`package.json:72` 一行命令展开 ~150 个 .test.js）；仓库提供 8 个测试分组 script：`test:core`、`test:routing`、`test:session`、`test:resources`、`test:compat`、`test:web`、`test:contract`、`test:stress`；本地未运行 | `.github/workflows/`；`package.json:72-80` |
> | 宿主 API 面 | host side：`ctx.llm.registerAdapter([routes], adapter)` 注册 `vision-http` / `deepseek-vision`（wrapper）/ `vision-chain`（fallback）/ `deepseek-official-native`（stealth）/ `<provider>-vision`（twins for wrappedProviders）+ `registerConfigurableProviders` 注册 `llm-deepseek` namespace（`index.js:3333-3377、4611、4635`）；事件钩子：`ctx.on('agent/pre-step', …)` 做图片轮检测+rewrite（`index.js:5005-5277`）、`ctx.on('agent/request', …)` 做 legacy 整轮路由改 provider/model（`index.js:5282-5329`）；`ctx.inject(['settings'], …)` 注册 `vision-router` namespace 面板并触发 `syncRoutingMounts()`（`index.js:7538-7559`）；`ctx.inject(['webServer'], …)` 注册 `/vision-router-settings` 远程设置 RPC + 多个诊断 HTTP 路由（`lib/remote-settings-bridge.js:215-227`、`lib/file-logger.js:382`、`lib/live-model-discovery.js:565` 等）。client side：`lib/client.js:4431` exports `apply + inject: ['settingsScope','slots','locale','sessions','remote']`；`ctx.slots.inject('settings.section', …)` 注册 `id='vision-router'` 设置页（order=12）、`ctx.slots.inject('settings.plugin.item', …)` 注册 legacy 兼容卡（order=30）、`ctx.slots.inject('tool.call.toolview', …)` 注册 `vision_present` + 五个 artifact 工具卡（`lib/client.js:4379-4427`） | `index.js`；`entry.js`；`lib/*` |
> | 行号约定 | `index.js` / `entry.js` / `lib/*.js` 引用带 `.js`，其余直接给路径。**未读**：`lib/client.js` 全文 4466 行（仅 grep + 头尾 + settings IA）；`lib/vision-routing-settings-prelude.js` 全文 553 行（IIFE 主体）；`docs/architecture/*`、`docs/releases/*`；`tests/`（142 个 spec 全部只读 spec 名与 grep 摘要，未运行）；`CHANGELOG.md` 仅读摘要；v2 路由相关 6 个核心 lib 仅 `vision-capability-router.js` 全文 + `vision-routing-evidence.js` 全文 + `vision-routing-product.js` + `vision-routing-authority.js` 全文 + `vision-capability-shadow.js` 中段；`assets/*.svg/gif/png`、`lib/legacy-*`、`lib/structured-*`、`lib/pixel-diff-stream.js`、`lib/ollama-cold-start.js`、`lib/local-vision-stabilizer.js`、`lib/vision-resilience.js`、`lib/vision-tool-runtime-boundary.js`、`lib/vision-tool-runtime-boundary.js` 等运行时类只 grep 不读全文。 | |

## 1. 定位（含 routing 的判读）

**一句话：这是一只"按内容类型路由"插件——文本-only Agent 一旦输入含图片，就把那一轮（甚至那一轮的工具调用）从纯文本 DeepSeek 整流转写到"内置的免 Key 视觉后端"上。**同时内置一个 5 模型的免 Key OVH 链作为兜底链，第二层"按可获得性降级"。

定位三件套：
1. **能力探测器**（image detection）：识别"这一轮的 message.content 含 `type:'image'` 的 block"，含嵌套在 `tool-result.content` 内的图片（递归下降，`index.js:530-551`）。
2. **路由决策器**（vision routing）：image-turn 改写模型路由到 `vision-chain`（默认名）或第一个 vision 对，或在 `routing: false`（默认）的 tools-first 模式下保留原文本 provider、靠 14 个 vision 工具调用把"看图"变成普通 tool call（`index.js:5282-5329`、`index.js:5195-5257`）。
3. **多后端失败链**（provider fallback chain）：链上每个后端独立失败分类（auth/rate-limit/quota/network/timeout/region/tos）、circuit breaker 状态、429-aware cooldown——全部失败才返回 `VISION_BACKEND_UNAVAILABLE_THIS_TURN`（`lib/vision-resilience.js:191-472`、`index.js:4415-4479`）。

为什么归为"routing"而不是"tool"：与同仓的 `dsh-delegate-router`（把 prompt 切片→不同 LLM）、`dsh-routed-subagent`（任务→子 Agent）这种"按内容/任务把单次请求改写到不同执行单元"的模式同构——它改写的是 `agent/request` 水位线的 `config.provider/model`（`index.js:5282-5329`），把 provider 替换成视觉后端，并在 `provider/model` 字符串中携带 `vision-http` 通道 ID 与具体模型（`chainAdapter.stream` yield `provider: chainRoute(), id: 'provider/model'`，`index.js:4361-4373`）。即便默认模式 `routing:false` 不切 provider，工具链层 `vision_describe / vision_ground / vision_crop / …` 也形成第二层 routing——"在 DeepSeek 这条思维链里，由 Agent 自驱地把'看图'操作以 tool call 形式路由到视觉模型"。此外 `autoWrapProviders: true`（默认开）会按 Settings → Models 已启用的 provider/model 注册 `<provider>-vision` 的 twin 路由（`index.js:3778-…`、`index.js:4358-4373`），浏览器侧 stock picker 隐藏这套 twin、`👁 Vision` 按钮触发切换。

声明的"无 key 默认免费"在文件层面同样成立：`DEFAULT_HTTP_PROVIDERS` 内置了 5 个 OVHcloud 匿名端点（`apiKeyEnv: ''`），`httpProvidersOf` 默认返回这套内置链（`index.js:2016-2025`、`index.js:2196-2209`）。这本身就是一种"provider-side 路由"——按身份免 Key、按 order 试错。

## 2. 架构与机制（源码级）

### 2.1 组件图

```
┌────────────────── DSH Web profile (browser + node side) ──────────────────┐
│                                                                            │
│  host side (lib/public-entry.js → entry.js → index.js)                    │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │ apply(ctx, config) 入口（entry.js:153）                           │     │
│  │  ├─ contextWithDelegatedReplay (lib/replay-delegation.js)        │     │
│  │  ├─ installAdversarialHardening / LocalVisionStabilizer / Ollama│     │
│  │  ├─ installVisionRouterRemoteSettingsBridge                      │     │
│  │  ├─ installHostSettingsCompatibility                            │     │
│  │  ├─ installVisionToolRuntimeBoundary (lib/vision-tool-runtime)  │     │
│  │  ├─ installLegacyCoreVisionPolicyBridge                          │     │
│  │  ├─ installStructuredFlowHardening (lib/structured-flow)        │     │
│  │  ├─ installBackgroundCapabilityProfiling (lib/vision-background) │     │
│  │  ├─ installCapabilityShadowRuntime (lib/vision-capability-shadow)│     │
│  │  ├─ installLiveModelDiscovery / installVisionModelRegistry      │     │
│  │  ├─ installClientPresentationBoundary                            │     │
│  │  ├─ installWrapperScopeClientPrelude                            │     │
│  │  ├─ installVisionRoutingSettingsPrelude (UI 路由开关)           │     │
│  │  ├─ contextWithVisionExecutionPolicy / VisionRuntimePerformance  │     │
│  │  ├─ contextWithVisionBackendRuntimePolicy                       │     │
│  │  ├─ installCapabilityBenchmarkService                            │     │
│  │  └─ core.apply(ctx, config) (index.js:3061)                     │     │
│  │      ├─ ctx.llm.registerAdapter(['vision-http'], httpAdapter)    │     │
│  │      ├─ ctx.llm.registerAdapter(['deepseek-vision'], wrapperAd.) │     │
│  │      ├─ ctx.llm.registerAdapter(['vision-chain'], chainAdapter)  │     │
│  │      ├─ ctx.llm.registerAdapter(['deepseek-official-native'], …) │     │
│  │      ├─ ctx.llm.registerAdapter(['<provider>-vision'], twin) ×N │     │
│  │      ├─ ctx.on('agent/pre-step', …)  ← image 检测 + 注入提醒     │     │
│  │      ├─ ctx.on('agent/request', …)  ← image-turn 整轮改 provider │     │
│  │      ├─ ctx.effect(() => ctx.toolbox.register(...), 'vision_*')  │     │
│  │      │     14 个 vision_* 工具（tool/）                         │     │
│  │      ├─ ctx.inject(['settings'], …) → 'vision-router' namespace │     │
│  │      │     + syncRoutingMounts() (index.js:4600)                │     │
│  │      └─ ctx.inject(['webServer'], …) → diagnostic HTTP routes   │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                            │
│  client side (lib/client.js → window.__ModuleLoader__)                     │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │ exports.apply + inject: ['settingsScope','slots','locale',     │     │
│  │   'sessions','remote'] (lib/client.js:4431)                    │     │
│  │  ├─ installSettingsPersistence (lib/client.js:1406)             │     │
│  │  ├─ installStyles / installVisionSettingsGuide                 │     │
│  │  ├─ installOnboarding (first-run)                               │     │
│  │  ├─ ctx.slots.inject('settings.section', VisionRouterSettings,  │     │
│  │  │     id='vision-router', order=12)                            │     │
│  │  ├─ ctx.slots.inject('settings.plugin.item', legacy card)       │     │
│  │  └─ ctx.slots.inject('tool.call.toolview', vision_present, …)   │     │
│  └─────────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────────┘

                          vision routing 流（图片轮）

用户粘贴/上传 image ─► agent/pre-step (index.js:5005)
                          │
                          ├─ sanitizeToolResultImages (历史 tool-result 图片)
                          ├─ hasImage = messages.some(blocksHaveImage) (530-538)
                          ├─ scanSessionEventLog (回填 issue #72 事件日志里的图)
                          ├─ if hasImage && autoActivateOnImage (默认 true):
                          │    自动挂载 14 个 vision_* 工具 (activateDeepTools)
                          │    注入一条 '本轮消息包含图片，像素级视觉工具已自动挂载' user-message
                          │    若 routing: true → 注入到 wrapper 路由（adapter 在流里处理图片）
                          │    若 routing: false + 无 wrapper → 重写 messages
                          │        把 image 块换成 vision_describe 可用的附件标记
                          │    若 routing: false + 有 wrapper/twin → 原图保留在会话日志
                          └─ if !hasImage && 历史有图 → rewriteHistoryImages
                              替换为 imageMemory 缓存的描述（untrusted evidence）

                        ▼

agent/request (index.js:5282) ← DSH host 即将 stream 出请求
   next() → config0（最终 provider/model/reasoningEffort/maxTokens）
   ├─ if !routingEnabled() → return config0
   ├─ if state.hasImage && chainRoute() != null:
   │      switchRoute(config0, chainRoute(), `${pair.provider}/${pair.model}`)
   │      → 把这一轮交到 vision-chain 适配器
   ├─ else if state.hasImage:
   │      switchRoute(config0, routePairs[0].provider, routePairs[0].model)
   │      → 改写到第一个可用视觉后端
   └─ else (text turn):
        if reverseRoutingEnabled → reverseRouteTarget(...)
        返回 wrapperRoute / textProvider（让文本轮回到 DeepSeek）
```

### 2.2 Vision routing 关键机制

**A. 图片检测（输入端"按内容路由"的开关）**

`blocksHaveImage(content)` 递归扫描 `content[]`，识别 `block.type === 'image'`（含嵌套在 `tool-result.content` 内的），`index.js:530-538`。`eventHasImage(event)` 把同一个判定套到 `event.data.content / event.data.message.content / event.data.inserted[i].content`，让 pre-step 既看 inbox-claim 流、又看历史事件流（`index.js:540-551`）。

pre-step 内部署：
- `sanitizeToolResultImages`（`index.js:722`）：把"工具产生的图片块"从 inbox claim 抹掉，否则传给文本模型会被原生适配器拒绝。
- `scanSessionEventLog`：在 pre-step 内对 `session.events` 增量扫描，补齐 `read_image` 持久化的 `tool/result` 图片块（issue #72，注释见 `index.js:5041-5043`）。
- `rewriteImageBlocks`/`collectImageBlocks`：原始 ref 抓取、写入 `visionState.memoryForSession(session)`，为后续文本轮 `rewriteHistoryImages` 提供缓存（`index.js:1087-1103`）。

**B. 路由决策（按图片改写 `agent/request` 的 provider/model）**

`agent/request` 钩子（`index.js:5282-5329`）逻辑：
1. 先 `next()` 拿到 host 解析出的 `config0 = { provider, model, reasoningEffort, ... }`；
2. `routingEnabled() === current().routing !== false`：默认 `false`，所以默认走 tools-first 路径——agent 用 vision 工具自己看图。
3. `turnState.get(session)` 记录 `turn/startIndex/hasImage`，若 `state.hasImage` 缺失就在 `[startIndex, events.length)` 内回扫补判（`index.js:5289-5296`）。
4. **若 hasImage + `chainRoute()` 存在**：`switchRoute(config0, chainRoute(), '${pair.provider}/${pair.model}')`——把整轮交给 `vision-chain` adapter，它会走完整的 fallback 链；
5. **若 hasImage + 无 chainRoute**：`switchRoute(config0, routePairs[0].provider, routePairs[0].model)`——直接落到第一个可用视觉后端；
6. **若 !hasImage + `reverseRoutingEnabled()`**：`reverseRouteTarget(...)` 把会话回到 wrapperRoute（`deepseek-vision`）或直接到 `textProvider`（默认 `deepseek-official/deepseek-v4-pro`）；确保"为通过 image-admission 而临时把 session 切到 vision-capable 路由后，文本轮不浪费视觉模型"（`index.js:5298-5314`）。

`reverseRouteTarget` / `switchRoute` 是纯函数（`index.js:1839-1861`），且 `switchRoute` 主动丢弃 `reasoningEffort`（注释见 `index.js:1855`：换 provider 时旧 effort 跨 provider 无意义，issue #1）。

**C. 双轨 tools-first（默认）vs whole-turn routing（legacy）**

`routing: false`（默认）下，pre-step 已经把 deep tools 全部挂上（`toolEnabled()`，`progressiveTools:false`），Agent 用普通文本调用 `vision_describe` / `vision_ground` / `vision_crop` 等完成"看图"。这是为什么 README 强调"14 个工具而不是一个一锤子 vision 模型调用"——多步 ground→crop→diff→fix 可循环（README:60-62）。

`routing: true`（legacy）下，`httpProviders` 不参与（README:283）；只用 `provider + fallbacks`，整轮把 model 替换成视觉模型，工具可不再挂。

**D. Provider fallback chain（视觉后端降级链）**

链的构造顺序（`routingPairs()`，`index.js:3456-3473`）：

1. **显式 configured pairs**（`provider != 'vision-http'`，如 `deepseek-official`、用户加的 `zhipu`）；
2. **本地后端**：`localProvidersOf(current())` 把 `localOllama`/`localLmStudio` 映射为 `vision-http/<name>/<model>` 形式（`index.js:2064-2118`，`lib/local-vision-stabilizer.js`、`lib/ollama-cold-start.js` 提供冷启动保活）；
3. **`vision-http` 已配置的 HTTP provider**：来自 `httpProviders()`（=`orderedHttpProviders(current())`，`index.js:2226-2244`）—dedupe 已覆盖的（`index.js:2250-2264`）；
4. **内置 OVH 匿名链（兜底）**：`DEFAULT_HTTP_PROVIDERS` 5 个 Qwen3.5-397B-A17B → Qwen2.5-VL-72B-Instruct → Qwen3.6-27B → Mistral-Small-3.2-24B-Instruct-2506 → Qwen3.5-9B，按 baseURL `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`，`apiKeyEnv: ''`（`index.js:2016-2025`）。

`httpAdapter.stream` 实现 OpenAI / Anthropic 双协议（`index.js:3578-3588`），base64 image_url + tool-result 内容都被翻译成可消费格式；`callLocalBackend` 走本地后端特殊路径（`index.js:2133-…`，可 OpenAI 或 Anthropic wire format）。

`chainAdapter.stream`（`index.js:4380-…`）是整轮路由的核心：按 `chainPairs` 顺序试每个后端，每次都查 `visionBreaker.inspect(backendKey, fingerprint, 'chain')`（circuit breaker，`lib/vision-resilience.js:191-…`），按 `routingPairWeight`（内置免费模型 weight=1、显式/本地 weight=`DEFAULT_HTTP_PROVIDERS.length=5`）做 budget 分配，`weightedFallbackBudget`（`index.js:2045-2057`）保证每个后端不饿死也不独占。失败分类映射到 `VISION_FAILURE_KINDS = AUTH/RATE_LIMIT/QUOTA/TIMEOUT/NETWORK/SERVER/INVALID_REQUEST/OTHER`（`lib/vision-resilience.js:26-40`），AIM 模型回写 advice（`index.js:579-600`）。

**E. Capability-aware Auto routing（v2.0.0+）**

`routingMode ∈ {'ordered', 'auto'}` + `routingPreference ∈ {'balanced', 'quality', 'speed', 'local'}` + `backgroundBenchmarking ∈ {'off', 'local-free', 'all'}`（`entry.js:102-113`，`lib/vision-routing-product.js:9-44`，`lib/vision-routing-authority.js:1-42`）。Auto 不靠模型名推断能力，全部走"同一 deployment identity + 当前 suite revision 下用真实 benchmark 才能进 planner"——`capabilityEvidenceFingerprint`（`lib/vision-capability-identity.js`，未读）+ `collectVisionRoutingEvidence`（`lib/vision-routing-evidence.js:339-366`）只收事实；`suggestVisionOrder`（`lib/vision-capability-router.js:363-413`）用 `intent ∈ {structured, ocr, document, grounding, detection, general, chart_diagram, code_screenshot, visual_compare}` 推断（`113-161`，`），`AUTO_REORDER_MIN_ADVANTAGE=0.08` 阈值（`34`，`）控制重排幅度；`AsyncLocalStorage`（`lib/vision-capability-shadow.js:27`）把临时的 Auto 顺序隔离在单次视觉工具调用里。

`installCapabilityShadowRuntime`（`lib/vision-capability-shadow.js:561`）通过 wrap settings service，让"settings-snapshot 在 vision-router 命名空间被读出"时临时叠加一层 auto execution config（`lib/vision-capability-shadow.js:170-228`），最终由 `vision-execution-order-apply.js` 把规划顺序压进 `routingPairs`（`applyVisionExecutionOrder`）。Auto 不修改 host 设置、不创建新路由——只是 process-local view（`docs/v2-capability-routing.md:11-30、59-86`）。

**F. Twin / wrapper / stealth 路由身份**

- **wrapper 路由**（默认 `deepseek-vision`）：`wrapperAdapter.listModels()` 镜像 DeepSeek 的 `WRAPPER_MODEL_IDS = ['deepseek-v4-pro', 'deepseek-v4-flash']`，给每条 mirror 加 `inputModalities: ['text', 'image']`，让 DSH image-admission 通过；stream 委托到 `textProviderRoute()`（`index.js:3643-3750`，`createWrapperStreamBody` 处理图片流/缓存替换，`index.js:2724`）。
- **stealth**（off by default）：注册 `deepseek-official-native` 隐藏 native 适配器 + 把 `deepseek-official` 替换成 stealth 适配器，要求宿主 `llm-deepseek` 行先被 `disabled: true`（`index.js:3322-3408`）。
- **wrappedProviders twins**：默认 `autoWrapProviders: true`，监听 `llm/adapters-updated` 事件，对每个 DSH 实际启用的 `<provider>` 注册 `<provider>-vision` twin，模型清单 1:1 镜像（`index.js:3753-…`，`lib/vision-model-registry.js:221`）。
- 浏览器侧 stock picker 隐藏规则：`installVisionModelVisibilityBoundary`（`lib/vision-model-visibility-boundary.js:21`）+ `createVisionToggleRootHardening`（`lib/vision-toggle-root-hardening.js:452`）通过 `window.__dshVisionRouterRootHardening` JS API 在 host model picker 里把"自信拥有"的 wrapper/twin 隐藏（"fail-open"：拿不准就显示，宁可多显示）。

### 2.3 工具与产物（routing 的工具侧）

`toolEnabled()` → 注册 14 个默认深看工具（`index.js:5331-…`，含 `vision_describe/ground/detect/crop/present/pixel_diff/colors/ocr/trace/extract_foreground/html_screenshot/long_screenshot_ocr` 等），全部 built on sharp/potrace/tesseract/系统 Chrome（README:230-248）。每个工具的真实 provider 调用最终都走 `vision-http` + chain 的同一套 fallback：`chainAdapter` 和 `httpAdapter` 是两个独立 register，但都消费 `routingPairs()/httpEntries()` 同一组数据（`index.js:3414-3429`）。

`vision_bootstrap`（`structuredVisionBootstrap`）是"1+x 结构化预识别"——首轮强制 `vision_bootstrap`，再根据返回的 `visual_kind`（chat/document/ui/code/general/mixed）注入后续至少 1 次深挖引导（`index.js:5084-5161`，`lib/structured-bootstrap.js`、`lib/mixed-router.js`）。

工具结果会写 `imageMemory`（`visionState.descriptionFacade`，`session-scoped`，`index.js:3075-3083`、`lib/session-vision-state.js:206`）——所以下一次文本轮调用 `rewriteHistoryImages(messages, memory)`（`index.js:1160-…`）会用缓存的描述文本替换图片块，让纯文本模型"记得"之前看过什么。

### 2.4 设置 / 远程 / 调试面

- 主设置入口：`ctx.slots.inject('settings.section', VisionRouterSettingsSection, id='vision-router', order=12)`（`lib/client.js:4379-4394`）；React + settingsScope/connection remote 状态。
- 兼容入口：`ctx.slots.inject('settings.plugin.item', VisionRouterLegacyEntry, key='vision-router', order=30)`（`lib/client.js:4395-4411`）。
- 远程设置 RPC：`installVisionRouterRemoteSettingsBridge` 注册 `/vision-router-settings` 通道，允许 DSH 远程页面通过 `authorize` + `mutate` 改低风险设置（`lib/remote-settings-bridge.js:215-227`，白名单字段见 `16-47`），高风险字段（proxy、credential、本地后端、artifactsDir、desktopScreenshot、`llm-deepseek` 行）只允许 loopback 设置页改（`16-47` + `lib/local-remote-settings-permission.js`）。
- HTTP 诊断路由：file logger routes（`lib/file-logger.js:382、420`）、host-capabilities `/_dsh/vision-router/host-capabilities`（`lib/dsh-contract-compat.js:53-93`）、capability-runtime（`lib/vision-routing-settings-prelude.js:11`）、test-connection probe（`index.js:7564-…`）、capability-benchmark 服务（`lib/vision-capability-benchmark-service.js:923`）、background benchmark（`lib/vision-background-benchmark.js:1015`）。
- 离线 CLI：`bin: dsh-vision-router: ./lib/doctor-cli-p0.js`（`package.json:13-15`），提供 `npx dsh-vision-router repair --profile web` / `doctor` 修复 UTF-8 BOM / stale profile exemption 等（README:531-558）。

## 3. 对本项目（AGE）的可用模式

AGE 目前没有 vision routing 需求（`doc`/`mission` 全是纯文本 + git 文件），但 vision-routing 这条支线暴露的几个工程化范式可以抽象借用：

| # | 模式 | 判定 | 映射与理由 |
| | --- | --- | --- |
| 1 | **按输入内容分流**（image block → vision provider；其余 → text provider） | **Adapt** | AGE 若未来要把 devlog/plan markdown 中的 `<image>` 或 base64 附件切给本地视觉模型、其余给 LLM，完全同构。本质是 `agent/pre-step` 看消息 content 决定"本次 step 是否走旁路"。 |
| 2 | **`agent/request` 改 provider/model 的纯函数 switch**（`switchRoute`/`reverseRouteTarget` 在 `index.js:1839-1861`） | **Adopt** | age-monitor 的 mission/step audit 若需"给某些 step 类型走额外的 audit 模型"，可借用这套"无副作用 + 丢弃 reasoning effort + 同 ctx 改造"的写法；纯函数便于单测。 |
| 3 | **provider fallback chain + 失败码分级（auth/rate-limit/quota/timeout/network）**（`lib/vision-resilience.js:26-200`） | **Adopt** | AGE 调用 Claude/OpenAI 跑 audit/LLM 时同样需要；尤其 `429` 立刻切下一个 + Retry-After-aware cooldown 而不是 sleep，符合"工程化 LLM 调用"最小要求。建议 `mission-driver` 抽出独立 `lib/lm-fallback.js` 而不是塞进 vision-router 同名模块。 |
| 4 | **`routingPairs()` 三段式：native → local → http → 内置免费兜底**（`index.js:3456-3473`） | **Adopt** | 三段正交（声明式 + 显式本地 + 兜底云）适合 driver 选 LLM 时复用：先 user-configured rows、再本地 ollama/lmstudio、最后 cloud 兜底；不要把内置兜底写死在 tool 路径上。 |
| 5 | **`blocksHaveImage` 递归扫描 + `eventHasImage` 跨事件流补扫**（`index.js:530-551`） | **Adapt-lite** | age-monitor 若解析 devlog/mission JSON，提取 `<asset>`、`<task>`、`<step>` 的递归下降算法可借鉴；但 AGE 的事实源是 git-tracked 文件不是 event log，只需要文件级 parse。 |
| 6 | **`agent/pre-step` 在模型调用前注入 reminder**（`index.js:5084-5241`：结构化 bootstrap + 自动挂载提示） | **Reject for AGE** | 这是为 LLM 添加 system-级行为约束的"软注入"。AGE 强调"driver 不替 LLM 决策"，且 mission 是 git 文件而非 in-context 提示，reminder 模型在此不适用——但"对 driver 暴露哪些 step 上下文"的"边界提醒"概念可借鉴。 |
| 7 | **Capability-aware Auto routing（仅事实/不修改 host 设置）**（`lib/vision-routing-{product,authority,capability-router,evidence,shadow}.js`） | **Adapt** | 对 driver 的 LLM 选择同样适用："根据实测 runtime latency / error rate / 任务 intent 选 provider"，但 driver 应输出到 logs/metrics 而不是 host setting。`AUTO_REORDER_MIN_ADVANTAGE=0.08` 阈值、`AsyncLocalStorage` 隔离、`capabilityEvidenceFingerprint` 与 suite revision 绑定等纪律值得直接搬。 |
| 8 | **Twin route + wrapper route + stealth takeover**（`index.js:3322-3408、3643-3750、3775-…`） | **Reject** | DSH 特有的"image-admission 必须声明 `input:[image]` 才接受消息"限制需要 wrapper/twin；AGE 没有这个 admission gate，且我们的执行器进程完全 driver-owned，不需要伪装 provider。 |
| 9 | **远程 RPC 设置面板 + 白名单字段 + 本地 loopback 兜底**（`lib/remote-settings-bridge.js:9-49`、`lib/local-remote-settings-permission.js`） | **Adapt** | AGE 若提供 Web 设置面板，"高敏感字段（credential、proxy、host URL）只允许 loopback 写" + "远程 RPC 必须先 `authorize` 通过 explicit acceptedRisk=true" 的两层 gate 是好模板。注意我们若做 age-monitor Web 设置面板，应保持"loopback-only for sensitive fields"纪律。 |
| 10 | **Vision HTTP 双协议适配器（OpenAI + Anthropic）**（`index.js:2267-2312`） | **Reject for now** | AGE 不调 VLM；若未来加，可复用 `callLocalBackend` 抽象，但 vision-router 的 Anthropic 适配只覆盖 image+text 两个 block type，不通用。 |
| 11 | **`AsyncLocalStorage` 单次视觉工具调用隔离临时 Auto order**（`lib/vision-capability-shadow.js:27`） | **Adopt** | 这是把"瞬态规划"安全注入到运行时而不污染并发/历史的通用模式：driver 给某一 mission run 临时提升某个 provider 优先级而不影响其他 run，可同款封装。 |
| 12 | **`syncRoutingMounts()` reactive 挂载/卸载**（`index.js:4600-4656`）+ settings `scope.watch` 触发（`index.js:7553-7559`） | **Adopt** | "settings 文档变 → 路由/工具注册即时收敛"对 driver 同样合适：我们可让 monitor/devlog 路径在 `.age/missions.yaml` 改变时即时重挂审计 listener，无需重启。 |

## 4. 风险与不适用面

1. **DSH 版本耦合深**：peer 直接 import `@deepseek-ai/dsh-anonymous-user-id` / `@deepseek-ai/dsh-llm-deepseek`，`Settings > Models` / `wrapperRoute / chainRoute / stealth` 等机制都是 DSH 私有面；CI 矩阵打通 rc.6/rc.7/rc.8 三个宿主版本（`.github/workflows/ci.yml:36-44`），但任何 RC 改 API 都可能让本插件跌穿。借模式不借实现。
2. **复杂度爆炸**：`index.js` 单文件 7862 行，`lib/*.js` 共 92 个；插件默认挂载十几条 `ctx.effect/inject/on`、注册 5 类 llm adapter、14 个工具、1 个 twin-system，调试门槛高。AGE 不需要照搬这种密度；选 Adopt 的模式应单文件 ≤ 500 行可读。
3. **强默认假设**：默认 `autoActivateOnImage=true` + `autoWrapProviders=true` + `routing=false` + `freeFallback=true` + `stealth=false` 一组合起来会"偷偷改写所有 DSH image-message 流"。任何"以小博大"模式搬过来都要明确 AGE 的等效默认。
4. **匿名兜底链的合规性**：`DEFAULT_HTTP_PROVIDERS` 5 个 OVHcloud 端点是匿名/免 key，README 178-190 提示"自由 tier 政策可能变动"。AGE 若引入同样兜底，应明确**走自己提供的 proxy + 明确审计字段**而不是匿名端点。
5. **adapter 重复保护**：注册链有 `DUPLICATE_ADAPTER` 容错（`index.js:4614-4623、4636-4643`），但链本身缺乏"是否真的能跑模型"的硬保证——`adapterAvailable(ctx.llm, provider)` 在每步做探测（`index.js:1049-1057`），仍然可能在网络下游失败。`vision-image-input-verdict.js` 只持久化"unsupported"事实而非"supported"。
6. **未读覆盖面**：`lib/client.js` 4466 行（仅 grep + 头尾 + 关键 settings IA 段）、`lib/vision-routing-settings-prelude.js` IIFE 全文、`lib/vision-capability-shadow.js` 中段以外、`docs/architecture/*` 全部、`docs/releases/*` 全部、`tests/*`（142 spec，未运行）、`CHANGELOG.md` 仅头部总结；任何涉及上述未读区域的结论均基于 README/grep/转述并已标注。
7. **本地路径 / 远程混合写入**：`ctx.inject(['settings','connection'], …)` 既读 host settings，又通过 `connection.rpc.handle('/vision-router-settings', …)` 暴露给远程页面（`lib/remote-settings-bridge.js:215-227`）。同一字段可能被多处写（本地设置页 / 远程页面 / CLI repair），用 `expectedRevision` 乐观锁收敛（`lib/remote-settings-bridge.js:99-105`）。这种"多入口同 namespace"在 AGE 若做 Web 设置面板需提前规约。
8. **`routing: false` 是默认但不代表零路由**——deep tools 在 `toolEnabled()`（默认 true）+ `progressiveTools:false`（默认）下从 session-start 全注册，`tool.schema` 长度影响 provider KV/prefix cache 命中率。README:33-203 与 `cordis.patch.yml:11-15` 解释"为什么不默认 progressive"。若 AGE 借鉴此"tool 注册成本 vs cache 命中"的取舍，应落到 dev log 而非产品决策。

## 5. 关键源码索引

| 主题 | 位置 |
| --- | --- |
| 路由总入口（apply） | `entry.js:153` → `index.js:3061 apply(ctx, config)` |
| 输入图片检测 | `index.js:530-538 blocksHaveImage`、`index.js:540-551 eventHasImage`、`index.js:1078-1103 stripImageBlocks/collectImageBlocks` |
| tool-result 内嵌图清理 | `index.js:722-735 sanitizeToolResultImages`、`index.js:786-858 planToolResultImageShadows/planGuardStopShadows`、`index.js:859-893 rewriteImageBlocks` |
| 跨事件流图片补扫（#72） | `index.js:4930-5000 scanSessionEventLog` |
| agent/pre-step 注入 | `index.js:5005-5277`（含 hasImage 判断 / structured bootstrap / reverse routing 判断 / `rewriteHistoryImages` 调用） |
| agent/request 整轮改 provider | `index.js:5282-5329`（legacy routing=true 路径） |
| route 切换纯函数 | `index.js:1839-1851 reverseRouteTarget`、`index.js:1858-1861 switchRoute` |
| 默认 provider 链（OVH 5 模型） | `index.js:2016-2025 DEFAULT_HTTP_PROVIDERS` |
| http provider 列表与排序 | `index.js:2196-2244 httpProvidersOf/orderedHttpProviders`、`index.js:2250-2264 dedupeHttpProviders` |
| 本地 Ollama / LM Studio 接入 | `index.js:2064-2118 localOllamaProvidersOf/localLmStudioProvidersOf/localProvidersOf`、`index.js:2133-2194 callLocalBackend` |
| 双协议 wire（OpenAI + Anthropic） | `index.js:2267-2312 toOpenAIContent/toAnthropicContent` |
| http vision adapter（vision-http 路由） | `index.js:3414-3628 httpRouteProviders/httpAdapter.stream` |
| 视觉链 adapter（vision-chain 路由） | `index.js:4347-4575 chainAdapter.listModels/resolveModel/stream`（含 `routingPairWeight`、`weightedFallbackBudget`、`visionBreaker.inspect`、`resolveVisionBackendCapability`） |
| 失败分类 + circuit breaker + turn memory | `lib/vision-resilience.js:26-200 VISION_FAILURE_KINDS/classifyVisionFailure`、`191-373 createVisionCircuitBreaker`、`375-470 createVisionTurnMemory`、`472-508 buildVisionFailure` |
| fallback 链构造 | `index.js:3456-3473 routingPairs()` |
| wrapper 路由（deepseek-vision） | `index.js:3106-3126 wrapperRoute/wrapperRegistered`、`index.js:3643-3750 wrapperAdapter` |
| stealth takeover（deepseek-official 接管） | `index.js:3322-3408 attemptTakeover/maybeTakeover`、`index.js:3346-3365 nativeAdapter` |
| wrappedProviders twins | `index.js:3753-… wrappedProviders/autoWrappedProviders`、`index.js:4358-4373 listModels 内合并 chain entries` |
| syncRoutingMounts 响应式挂载 | `index.js:4600-4656`、`index.js:7538-7559 settings.scope.watch + syncRoutingMounts` |
| settings namespace 注入 | `index.js:7538-7559 ctx.inject(['settings'], …)` |
| Capability v2 产品语义 | `entry.js:102-113`（Config schema）、`lib/vision-routing-product.js:1-44`、`lib/vision-routing-authority.js:1-42` |
| Auto planner（intent / score / reorder） | `lib/vision-capability-router.js:8-413`（VISION_INTENTS、BENCHMARK_AXES、DIRECT_TASK_AXIS、inferToolVisionIntent、`scoreVisionCandidate`、`suggestVisionOrder`） |
| Auto 证据收集 | `lib/vision-routing-evidence.js:1-366`（`collectVisionRoutingEvidence/candidates/health`） |
| AsyncLocalStorage 隔离 + shadow runtime | `lib/vision-capability-shadow.js:27、170-228、438-560` |
| Capability Benchmark service + client | `lib/vision-capability-benchmark-service.js:923`（webServer.register）、`lib/vision-capability-benchmark-client.js`、`lib/vision-background-benchmark.js:1015` |
| 14 个 vision_* 工具注册 | `index.js:5331-… visionDescribeTool`（其他工具紧邻其后；`vision_bootstrap` 在 `lib/structured-bootstrap.js`、`lib/structured-flow-hardening.js`、`lib/vision-tool-runtime-boundary.js`） |
| 图片历史改写（缓存描述） | `index.js:1126-1158 replaceImageBlocksWithMemory`、`index.js:1160-1189 rewriteHistoryImages` |
| session-scoped 状态 | `lib/session-vision-state.js:113-206 createState/createSessionVisionStateStore`、`index.js:3075-3083` |
| image input verdict cache | `lib/vision-image-input-verdict.js:37-122 imageInputVerdictCachePath/createImageInputVerdictStore` |
| settings IA client prelude | `lib/settings-ia-client-prelude.js`（492 行 IIFE，含 vision backend group 过滤；仅 grep 关键段）；`lib/vision-routing-settings-prelude.js:1-553`（UI 路由开关） |
| 客户端主入口 + slots.inject | `lib/client.js:4379-4427 settings.section / settings.plugin.item / tool.call.toolview`、`lib/client.js:4431 inject: [...]`、`lib/client.js:4361 installStyles/inVisionSettingsGuide/installOnboarding` |
| 远程设置 RPC + 白名单 | `lib/remote-settings-bridge.js:1-227`（`REMOTE_SETTINGS_*`、`REMOTE_SETTINGS_READABLE_FIELDS`、`createVisionRouterRemoteSettingsHandler/installVisionRouterRemoteSettingsBridge`） |
| 本地 loopback 设置权限 | `lib/local-remote-settings-permission.js:141-446`（`createVisionRouterLocalPermissionHttpHandler/installLocalRemoteSettingsPermissionBridge`） |
| DSH 兼容性矩阵 | `lib/dsh-contract-compat.js:1-353`（`installDshHostCapabilityDiagnostics/installSettingsSectionCompat/installHostSettingsCompatibility/installVisionAttachmentAdmissionPolicy/protectHostProviderOwnership/hasBatchAttachmentContract/attachmentContextForContract`） |
| bundle patch | `cordis.patch.yml:1-44`（`insert: vision-router` + `attachment-local` 行覆盖） |
| 包装 stealth native 适配器 | `index.js:2481-2525 createNativeDeepSeekAdapter`、`index.js:2847-… createStealthAdapter` |
| 全局 fetch patcher（视觉端点代理） | `index.js:4678-… patchedFetch / agentFor / currentProxyUrl / currentProxyHosts` |
| doctor CLI + repair | `lib/doctor-cli-p0.js`（`bin:`）、`lib/doctor.js`、`lib/doctor-cli.js`、`lib/doctor-v2.js`、`lib/doctor-runtime.js`（未读全文） |
| 包元数据 / 安装声明 | `package.json:1-98`（`type:module`、`main: lib/public-entry.js`、`bin: dsh-vision-router`、`dsh.client.inject`、`dsh.bundle.patch`、`engines: node ^22.19.0 \|\| >=24.0.0`） |
| 设计原理（v2 capability routing） | `docs/v2-capability-routing.md:1-191` |
| 兼容性矩阵 | `docs/architecture/dsh-compatibility-matrix.md:26`（adapter registration 行），`docs/architecture/runtime-boundaries.md` |
| 与同类对比 | `README.md:66-91`、`README.zh.md:66-90` |

未读备查：`lib/client.js` 全文 4466 行（仅 grep + 头尾 + settings-IA 关键段 + slots 注入段），`lib/vision-routing-settings-prelude.js` 全文 IIFE（仅读头 + style + state + lifecycle 摘要），`lib/vision-capability-shadow.js` 中段以外（160-228、320-560），`lib/vision-tool-runtime-boundary.js` / `lib/structured-flow-hardening.js` / `lib/structured-bootstrap.js` / `lib/mixed-router.js` / `lib/legacy-session-repair.js` / `lib/legacy-core-vision-policy-bridge.js` / `lib/native-image-coexistence.js` / `lib/vision-execution-policy.js` / `lib/vision-backend-runtime-policy.js` / `lib/vision-runtime-performance.js` / `lib/vision-resilience.js` 全文（仅 grep 关键 export），`lib/ollama-cold-start.js` / `lib/local-vision-stabilizer.js` / `lib/file-logger.js` / `lib/adversarial-hardening.js` / `lib/android-attachment-compat.js` / `lib/tesseract-exec-compat.js` / `lib/screenshot-source-boundary.js` / `lib/web-capability-boundary.js` / `lib/catalog-corrections.js` / `lib/pi-ai-bridge-wire-compat.js` / `lib/wrapper-directory.js` 等运行时细节，`lib/vision-capability-identity.js`、`lib/vision-capability-probe.js`、`lib/vision-capability-reference.js`、`lib/vision-background-stop-store.js`、`lib/vision-background-failure-policy.js`、`lib/vision-breaker-observer.js`、`lib/vision-breaker-shadow-health.js`、`lib/vision-capability-benchmark.js`、`lib/vision-capability-benchmark-hardening.js`、`lib/vision-execution-order*.js`、`lib/dsh-host-capabilities.js`、`lib/replay-delegation.js`、`lib/replay-envelope-v2-compat.js`、`lib/runtime-config-normalizer.js`、`lib/string-normalization.js`、`lib/settings-migration.js`、`lib/turn-budget-context.js`、`lib/repetition-guard.js`、`lib/trusted-vision-hints.js`、`lib/image-resource-governor.js`、`lib/large-image-resource-integration` 等等，`lib/self-update.js`、`lib/update-check.js`、`lib/legacy-core-vision-policy-bridge.js`、`lib/native-image-coexistence.js`、`lib/vision-execution-policy.js`、`lib/structured-flow-hardening.js` 等；`docs/architecture/*`（除 dssh-compatibility-matrix.md 与 runtime-boundaries.md 标题）、`docs/releases/*` 全部，`tests/`（142 个 spec，未运行），`scripts/dsh-host-contract-smoke.mjs`、`scripts/image-resource-stress.mjs`，`assets/*` 二进制 / SVG / GIF / PNG。本报告涉及上述文件的结论均只基于 README / grep / 转述并已在文中标注。