# dsh-model-catalog 调研报告（dsh-plugins）

> | 项 | 值 | 依据 |
> | --- | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-model-catalog/`（`/Users/abc/ai/dsh-plugins/dsh-model-catalog`） | 本地目录 |
> | 来源 repo | `https://github.com/JohnXu22786/model-catalog.git`，本地 HEAD `1.0.0`（"首个发布：模型目录自动发现插件"）；MIT | `package.json:1-9,42`；`CHANGELOG.md:26-37`；`LICENSE:1-21` |
> | stars | 任务未给；本任务未做 web 检索核实 | — |
> | 语言 | TypeScript（strict + noUncheckedIndexedAccess），ES2022 / NodeNext ESM；纯 Node（≥ 21），**零运行时依赖**（dev 仅 `typescript@^5.6` + `@types/node@^24`）；`src/` 共 26 个 .ts 文件，全部已读 | `package.json:32-52`；`tsconfig.json:1-19`；本报告 §2 |
> | license | MIT — Copyright (c) 2026 JohnXu22786 | `LICENSE:1-21` |
> | 版本/兼容 | v1.0.0（2026-08-16），dsh `>=0.1.0`；CLI `bin: model-catalog`；harness 入口 `dist/src/plugin.js`（`createPlugin` 工厂）+ Cordis bundle `dist/src/dsh.js`（`name/inject/apply`）；README 与源码均声称"插件可直接加载、bundle 可热重载" | `manifest.json:1-46`；`package.json:13-30`；`cordis.patch.yml:8-10`；`README.md:58-67,226-228` |
> | 测试/CI | `node --test` 12 个测试文件（`test/*.test.ts`，覆盖 unit conversion、classifier、collector、refiner、verifier、vault、settings、asker、cli-parse、emit、plugin、e2e）；`test/helpers/mock-host.ts` 提供可编程 HTTP 测试主机；无 GitHub Actions 脚本（仓内未见 `.github/`）；本次未运行 | `package.json:33`；`test/` 目录；`test/helpers/mock-host.ts:1-123` |
> | 宿主 API 面 | host 侧 factory `createPlugin()` → `register(ctx)`，ctx 字段 `config.get / events.emit / log / tools.register`（`src/plugin.ts:25-58,64-228`）；注册 5 个工具 `catalog.discover / list / refresh / select / probe`，2 个事件 `catalog.updated / catalog.failed`（`src/plugin.ts:114-224`）；bundle 适配器把同一份 handle 翻译成 dsh 的 `ToolDefinition` 形态并经 `ctx.effect` 卸载回收（`src/dsh.ts:129-194`）；manifest 配置键 `catalog.{baseUrl,apiKeyEnv,probe,externalUrl,outputDir,cacheDir}`（`manifest.json:24-35`） | `manifest.json:15-36`；`cordis.patch.yml:8-10`；`docs/integration.md:42-66,69-119` |
>
> 行号约定：以 `src/**/*.ts` 为准；数据/CLI/manifest/源码索引统一引用 .ts 行号。**未读部分**：`test/{classifier,domain,cli-parse,collect,refiner,settings,vault,emit}.test.ts`（仅读 `test/e2e.test.ts` 全 + `test/plugin.test.ts` 全 + `test/verifier.test.ts` 全 + `test/asker.test.ts` 全 + `test/helpers/mock-host.ts` 全）；CHANGELOG.md 中 `[Unreleased]` 段除首屏外的剩余细节；`docs/integration.md` 第 1.1 节之外的工具返回 schema 微小变更未逐字段核对。文中涉及这些文件的结论均基于源码引用/grep/转述并已标注。

## 1. 定位

一句话：**"模型目录自动发现 + 归一化"插件**——把"用户在 dsh 里配置了一个 OpenAI 兼容的 API 主机（官方/中转网关/本地推理服务）"这件事，从"手工逐模型填写"变成"自动探测 → 抓取 → 单位换算 → 多源补齐 → 探测缺失能力 → 输出可直接消费的模型配置"的端到端流水线（`README.md:3-13`，`src/main.ts:74-90`，`src/core/orchestrator.ts:112-181`）。

**核心价值**（README 自述 + 源码印证）：
- **主机类型自动识别**：6 种 `HostKind`（`bare/augmented/quota/flag/ollama/vllm`），无需用户声明协议细节；识别失败时支持 `--kind` 强制指定（`README.md:18,98-104`；`src/core/classifier.ts:74-181`；`src/domain.ts:25-45`）。
- **全链路单位归一化**：每 token USD / 每百万 USD / 倍率 / 按次 4 种价格形态全部转换为 USD/1M 或 USD/call；支持 peak/off-peak 动态定价的 tiers 结构化表达（`README.md:96-105`；`src/domain.ts:52-90,190-259`）。
- **定价可溯源**：每个条目记录 `pricing.source: 'host'|'override'|'mirror'|'builtin'|'unknown'` + `capturedAt` + `sourceUrl` + `note`，`origin: 'api'|'builtin'|'override'|'mirror'|'probe'` 标注事实来源链（`README.md:106-116`；`src/core/refiner.ts:107-202`；`src/domain.ts:70-90,138-156`）。
- **能力缺失时轻量探测**：对元数据未声明的 `toolCalling/structuredOutput/streaming` 三个能力发最小化 `/v1/chat/completions` 请求实测，结果按 `(baseUrl, model, capability)` TTL 缓存（`README.md:129-141`；`src/probe/verifier.ts:99-200`）。
- **三产物输出**：`out/catalog.json`（完整目录 `model-catalog/v1`）、`out/dsh-models.json`（harness 可消费配置片段 `dsh/models/v1`）、`out/report.md`（人类可读报告）（`README.md:53-55,203-209`；`src/emit/{catalog,snippet,report}.ts`；`src/emit/index.ts:1-5`）。

**与宿主 DSH 的关系**：典型的"边界插件"——只**消费**网络与本地文件系统（`manifest.json:36-39` 声明 `network`/`fs:read`/`fs:write` 权限），**生产**可被宿主直接 import 的 dsh 配置片段，**不接触** LLM 调用面、不写宿主 settings 命名空间、不监听宿主事件流（与 `dsh-model-router` 形成对照——后者写宿主 settings、`dsh-model-router` 监听 `llm/stream`）。本插件的"宿主"角色止于 `ctx.tools.register` 的 5 个工具与 `ctx.events.emit` 的 2 个事件（`src/plugin.ts:114-224`；`docs/integration.md:69-122`）。

**与同仓其他 dsh-plugins 路由/委派类插件的关系**：完全不同的赛道——`dsh-model-router` 是"运行时路由（候选链 + 故障转移 + 健康度）"；`dsh-agent-relay/dsh-routed-subagent` 是"任务委派/产物递送"；本插件**根本不在运行时路径上**，只在配置生成阶段介入一次，输出 JSON 后即退场（`README.md:230-235`；`src/plugin.ts:114-124`）。

## 2. 架构与机制（源码级）

### 2.1 组件图（ASCII）

```
                      ┌─────────────────────────────────────────────┐
                      │  Entry 层                                     │
                      │  ┌───────────────────┐  ┌──────────────────┐  │
                      │  │ src/main.ts       │  │ src/dsh.ts       │  │
                      │  │  CLI: discover/   │  │  Cordis bundle:  │  │
                      │  │  pick/probe/cache │  │  name/inject/    │  │
                      │  │  /config          │  │  apply → 5 工具  │  │
                      │  └─────────┬─────────┘  └────────┬─────────┘  │
                      │            │ 共享 createPlugin()    │           │
                      │            └─────────┬─────────────┘           │
                      └──────────────────────┼─────────────────────────┘
                                             ▼
                      ┌─────────────────────────────────────────────┐
                      │  Plugin Handle (src/plugin.ts)                │
                      │  catalog.discover ─┐                         │
                      │  catalog.list      │                         │
                      │  catalog.refresh   ├─→ discover()            │
                      │  catalog.select ───┤                         │
                      │  catalog.probe ────┘                         │
                      │  events: catalog.updated | catalog.failed   │
                      └──────────────────────┬─────────────────────────┘
                                             ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  Orchestrator (src/core/orchestrator.ts:discover)                              │
   │                                                                                 │
   │   ① detect   classifyHost ─→ vault.read(detect::*, ttl=1h)                    │
   │            │                                                                   │
   │            ▼                                                                   │
   │   ② collect collectorFor(kind) ─→ RawModel[]                                  │
   │            │                                                                   │
   │            ▼                                                                   │
   │   ③ refine  refineModels ─→ 合并 host + overrides + mirror + builtin + aliases │
   │            │                                                                   │
   │            ▼                                                                   │
   │   ④ probe   verifyCapabilities ─→ 实测 3 个能力，按 (baseUrl,model,cap) 缓存  │
   │            │                                                                   │
   │            ▼                                                                   │
   │   ⑤ emit    writeCatalog  + writeSnippet  + writeReport   （withLock 内）      │
   └─────────────┬──────────────┬───────────────────┬───────────────┬─────────────┘
                 ▼              ▼                   ▼               ▼
       ┌────────────────┐ ┌──────────────┐ ┌────────────────┐ ┌──────────────────┐
       │ core/classifier│ │ core/refiner  │ │ probe/verifier │ │ emit/{catalog,   │
       │   探测 6 个端点 │ │ 归一化 + 多源 │ │  能力探测+缓存 │ │   snippet,report}│
       │   /models ...  │ │  优先级链     │ │  24h/30m TTL   │ │   三件产物写出   │
       └────────┬───────┘ └───────┬───────┘ └────────┬───────┘ └──────────────────┘
                ▼                 ▼                  ▼
       ┌────────────────────────────────────────────────────────────────────────┐
       │ collect/registry.ts → 5 个 Collector                                    │
       │   bare/vllm → standard.ts (/v1/models 最小字段)                       │
       │   augmented → augmented.ts (/models 含 context_length+pricing+params) │
       │   quota     → quota.ts (/v1/models + /api/pricing 数组/旧式 map)      │
       │   flag      → flag.ts (/model/info 能力布尔族 + per-token 价格)       │
       │   ollama    → ollama.ts (/api/tags + /api/show POST 并发 4)           │
       └────────────────────────────────────────────────────────────────────────┘
                ▼
       ┌────────────────────────────────────────────────────────────────────────┐
       │ Storage: storage/vault.ts                                              │
       │  单文件 var/vault.json，TTL + 跨进程 .lock（5min 接管 / 10s 超时）     │
       │  写入走 temp file + atomic rename                                      │
       └────────────────────────────────────────────────────────────────────────┘
                ▼
       ┌────────────────────────────────────────────────────────────────────────┐
       │ Util: util/http.ts (fetch + AbortSignal.timeout + 重试)                │
       │       util/fsx.ts (ensureDir + writeJsonAtomic + readJsonSafe)         │
       │       util/async.ts (mapLimit 并发受限的 map)                          │
       │       util/asker.ts (行缓冲 PromptLineReader，支持管道喂入)            │
       │       cli-parse.ts (parseFlags / parseSelection / coerceProbeMode)      │
       └────────────────────────────────────────────────────────────────────────┘
```

### 2.2 发现流程（5 步管线，`src/core/orchestrator.ts:112-181`）

`discover({baseUrl, apiKey, settings, vault})` 是唯一编排入口，串行 5 步、每步产 warnings、最终原子写出三产物：

1. **主机识别（detect）**：若 `settings.kindHint` 已指定则跳过；否则 `classifyHost` 依次探测 `/models`（augmented）、`/v1/models` + 次级 `/api/pricing`+`/version`+`/model/info`（quota/vllm/flag/bare）、`/api/tags`（ollama）；结果按 `detect::${baseUrl}::${auth|anon}` 缓存 1h（`src/core/classifier.ts:74-181`，`src/domain.ts:25-45`）。失败抛带"已探测端点"信息的可读错（`src/core/orchestrator.ts:127`）。
2. **采集（collect）**：`collectorFor(kind)` 查表 → 调对应 Collector；`RawModel[]` 输出（id / contextWindow / maxOutput / pricing / capabilities / sourceUrl / extra）；Ollama 唯一走 `mapLimit` 受限并发（默认 4）以避免 `/api/show` 阻塞（`src/collect/registry.ts:20-35`；`src/collect/ollama.ts:31-83`）。
3. **归一化（refine）**：对每个 raw 模型按"主机 > 覆盖 > 镜像 > 内置默认表"优先级合并字段；定价为"覆盖为字段级合并、其余仅填空"；能力按"覆盖字段级替换 + 其余按字段填空"；别名按 `aliases.json` 解析后再匹配补充来源；status 同理；`origin` 取首次命中的来源（`src/core/refiner.ts:86-238`）。
4. **能力探测（probe）**：仅对 `entry.capabilities[c]` 为 null 的 `c ∈ {toolCalling, structuredOutput, streaming}` 三个能力发送最小 `/v1/chat/completions` 请求（`buildProbeBody` 见 `src/probe/verifier.ts:47-81`）；结果按 `probe::${baseUrl}::${model}::${cap}` 缓存 24h、错误类 30min；401/403 中止全部探测并告警；`auto` 模式仅在带密钥或本地主机（KEYLESS_KINDS）时执行（`src/probe/verifier.ts:99-200`；`src/domain.ts:44-45`）。
5. **输出（emit）**：在 `vault.withLock` 内并发 `writeCatalog` + `writeSnippet` + `writeReport`（`src/core/orchestrator.ts:160-167`）。锁作用是避免并发 CLI 互相覆盖产物文件（`src/storage/vault.ts:101-109`）。

### 2.3 归一化算法（核心，单位换算）

所有按量价格最终统一到 **USD/1M**（`src/domain.ts:8-10`），按次价格标注为 **USD/call**（`src/domain.ts:73-74`）。三套换算函数在 `src/domain.ts:190-259`：

| 输入形态 | 换算公式 | 代码位置 |
|---|---|---|
| 每 token USD 字符串（`"0.00000056"`/`"$0.00003"`） | `×1e6` → roundUsd 6 位 | `src/domain.ts:190-200,210-212` |
| 每 token USD 数字（`1.5e-7`） | `×1e6` → roundUsd | `src/domain.ts:202-207` |
| 倍率（quota，`model_ratio`） | `input = ratio × 2.0 × gr`；`output = ratio × cr × 2.0 × gr`（cr/gr 缺省 1，gr 为 map 取 `default`） | `src/domain.ts:224-246` |
| 按次（`quota_type=1`） | `perCallUsd = modelPrice × gr`；`billing: "per-call"` | `src/domain.ts:249-259` |

**augmented 字段映射**（`src/collect/augmented.ts:33-44`）：`prompt → input` / `completion → output` / `input_cache_read → cacheRead` / `input_cache_write → cacheWrite` / `internal_reasoning → internalReasoning`。

**关键设计：定价来源优先级链**（`src/core/refiner.ts:147-202`）：
```
1. raw.pricing 存在               → source='host', 全字段采用（含动态/按次）
2. override.pricing 或 tiers 存在  → source='override', 字段级合并（覆盖写在哪就只替换哪）
3. 上面都没有 + mirror 有          → source='mirror', 整段从 mirror 来
4. 上面都没有 + builtin 有         → source='builtin', 整段从 builtin 来（内置默认表 = DeepSeek 官方兜底）
5. 全无 → pricing=null, 告警 "模型 X 未找到任何定价来源"
```

**动态定价 tiers 结构**（`src/domain.ts:61-90, model-catalog 1.0.0 内置表 `data/builtin-table.json:15-25,42-52`）：`ModelPricing.tiers: PriceTier[]`，每个 tier 带 `label/amounts/windows?/minContext?`；`amounts` 始终是首档（off-peak 基准价），`tiers` 携带全部档位，`report.md` 单独列出（`src/emit/report.ts:58-67`）。这是本插件少数有"业务领域建模"味道的地方——为 DeepSeek 2026-08-16 起 peak/off-peak 分时计费而设计。

### 2.4 数据模型（Catalog 数据形状）

核心领域类型集中在 `src/domain.ts`：

```
HostKind                bare | augmented | quota | flag | ollama | vllm | unknown
PriceAmounts            { input, output, cacheRead, cacheWrite, internalReasoning } : number|null
PriceTier               { label, amounts, windows?: [[hh:mm,hh:mm]], minContext? }
ModelPricing            { billing: per-token|per-call, unit: usd/1M|usd/call, currency: USD,
                          amounts, tiers, dynamic, perCallUsd, source, capturedAt, sourceUrl, note }
PricingSourceKind       host | override | mirror | builtin | unknown
Capabilities            { toolCalling, structuredOutput, streaming, vision,
                          parallelToolCalls, reasoning, responsesApi } : boolean|null
ProbeableCap            toolCalling | structuredOutput | streaming    (可实测子集)
EntryStatus             active | deprecated | unknown
EntryOrigin             api | builtin | override | mirror | probe
ModelEntry              { id, provider, contextWindow, maxOutput, pricing: ModelPricing|null,
                          capabilities, aliases, status, origin, capturedAt, hostKind,
                          extra: Record<string,unknown> }     ← "目录条目"全量形态
RawModel                { id, name?, contextWindow?, maxOutput?, pricing?: Partial<PriceAmounts>,
                          billing?, perCallUsd?, tiers?, dynamic?, capabilities?, status?,
                          note?, sourceUrl?, extra? }         ← 采集器尚未归一化的产物
```

`provider` 由 hostname 自动推断（`src/domain.ts:280-292`）：`localhost / 127.0.0.1 / 192.168.* / 10.* / ::1 → "local"`，否则取倒数第二段域名为 `providerSlug`。

**三个输出 schema**（`src/emit/{catalog,snippet,report}.ts`）：
- `catalog.json` schema `model-catalog/v1`（`src/emit/catalog.ts:1-28`）：`{ schema, generatedAt, host:{baseUrl,kind}, warnings, models: ModelEntry[] }` —— 全量条目 + 告警 + 主机信息。
- `dsh-models.json` schema `dsh/models/v1`（`src/emit/snippet.ts:1-89`）：harness 直接消费的扁平条目（每条带 `baseUrl + auth:{kind:"env",name} | null`，**永不包含明文密钥**），无 `extra`/`capturedAt`/`origin`/`hostKind`。
- `report.md` 人类可读（`src/emit/report.ts:1-84`）：Markdown 表格 + 未知定价清单 + 动态定价分档 + 告警列表。

### 2.5 关键算法/数据结构选型

- **缓存仓单文件 JSON + TTL + 文件锁**（`src/storage/vault.ts:38-182`）：放弃 SQLite 的复杂度，单 `var/vault.json` 装全部条目；写入走"写前合并磁盘快照 → 临时文件 → rename"的原子方案（解释见 `vault.ts:111-134`）；锁用 `openSync('wx')` 独占创建 + mtime 陈旧判定（5 分钟）+ `LockTimeoutError(10s)`；同步写而非异步以避免竞态（`vault.ts:112-113` 注释）。这是"够用就好"的工程取舍，但极端交错下整文件覆盖仍可能（注释自承，152 行）。
- **不锁整个 cache key，锁整个写批次**：用 `vault.withLock` 包裹三产物并发写（`orchestrator.ts:160-167`），单 key TTL 由读侧判定，零协调。
- **探测缓存分级 TTL**：成功 `24h`、错误 `30min`（`src/probe/verifier.ts:42-43,109-110`），错误重试窗口短防止反复打空——一条实用工程经验。
- **能力探测的 `auto` 模式分支**（`src/probe/verifier.ts:112-118`）：仅在 `mode==='always'` 或带密钥或 `KEYLESS_KINDS`（ollama/vllm）时执行；无密钥的标准主机跳过探测并告警"能力探测已跳过"。这把"密钥决定能不能探测"的策略硬化进代码。
- **401/403 中断全部探测**（`verifier.ts:163-168`）：用 `break outer` 双层跳出，避免后续模型浪费配额；这是个常被忽略的"快速失败"细节。
- **来源链覆盖语义差异**（`src/core/refiner.ts:113-202`）：上下文/最大输出是"替换"；能力是"字段级替换"；定价是"字段级合并"（同源只覆盖已配字段）——三种语义在不同字段上有意区分。
- **动态定价 tiers 用 UTC 时段**（`data/builtin-table.json:22,49`）：`windows: [["01:00","04:00"],["06:00","10:00"]]` 显式标注 UTC 时区，避免消费方歧义；空 `windows` 表示"全时段"。
- **CLI 的 `PromptLineReader` 自实现**（`src/util/asker.ts:16-80`）：放弃 `readline` 的不可预读行为，做行缓冲 + 管道喂入支持；`EOF` 时未满足的提问显式 `InputEndedError` 而非静默挂起。

### 2.6 加载契约（与宿主 DSH 的接缝）

**manifest 入口**（`manifest.json:10-14`）：`entry.module = ./dist/src/plugin.js`、`factory = createPlugin`、`cli = ./dist/src/main.js`。

**factory 注册路径**（`src/plugin.ts:64-228`）：
- `register(ctx)` 内组装 `resolveSettings(params)`：参数 > `ctx.config.get('catalog.*')` > `catalog.config.json` > `DEFAULT_SETTINGS`（`src/plugin.ts:72-101`，`src/config/settings.ts:9-103`）。
- 5 个工具：
  - `catalog.discover` → 调 `discover`，成功 emit `catalog.updated`，失败 emit `catalog.failed`（`plugin.ts:114-143`）。
  - `catalog.list` → 优先读 `out/catalog.json`（按 `catalogTtlSec` 判定新鲜度，默认 900s），过期/缺失则回退到 discover（`plugin.ts:162-173`，`162-168`）。
  - `catalog.refresh` → 强制 discover（`plugin.ts:175-182`）。
  - `catalog.select` → 按 ids 过滤后调 `writeSnippet`（`plugin.ts:184-203`）。
  - `catalog.probe` → 对单模型 `verifyCapabilities`（`plugin.ts:205-224`）。
- 密钥策略：仅经环境变量（`MODELCAT_API_KEY / DEEPSEEK_API_KEY / OPENAI_API_KEY` 自动检测，`config/settings.ts:83-91`）；产物文件**绝不**包含明文密钥（`emit/snippet.ts:55-57` 注释强调）。

**Cordis bundle 适配**（`src/dsh.ts:129-194`）：把 dsh 的 `HarnessContext.tools.register` 接收 `ToolDefinition` 而非 handler 名字符串的事实包装成"把 `createPlugin().register` 期望的 ctx 翻译成 dsh 的 ctx"；`inject: ['tools']` 声明依赖；`ctx.effect(dispose)` 支持热重载卸载（`dsh.ts:186-193`）。工具元数据（description + JSON Schema 形式 parameters）集中在 `TOOL_META`（`dsh.ts:44-106`）。

**未读小节备查**：`test/{classifier,domain,cli-parse,collect,refiner,settings,vault,emit}.test.ts` 仅在 §2 引用其覆盖范围，未逐行阅读；本报告关于行为细节的断言均可在源码（`src/**/*.ts`）直接定位。

## 3. 对本项目的可用模式（Adopt/Adapt/Reject）

先回应指定映射点：

- **"模型目录自动发现"对 AGE 的相关性**：本插件定位是"配置生成阶段的离线/一次性工具"，不进入运行时路径；AGE 的 mission driver 不需要动态发现 OpenAI 兼容主机，所以**整个发现管线本身对本项目是 Reject**——但管线内的若干原子机制可移植。
- **数据模型层面**：本插件的 `ModelEntry` 是高度领域化的"模型目录"形状，AGE 无对应的领域需求，故整体数据模型 Reject；只有"多源补齐 + 来源可溯源"这一思路在 AGE 的"配置 + 仓库事实"场景下可参考（详见 §3 表格 #3）。
- **消费方式**：本插件的"三产物"消费路径（catalog 全量 + dsh snippet 直接可用 + report 人类阅读）与 AGE 的"git 为唯一事实源 + 命令行报告"哲学不冲突，但**snippet 这一形态对 AGE 无意义**——AGE 不通过 JSON 配置驱动运行时（其执行入口是 CLI 子进程 + git 状态）；保留 catalog/report 的"全量 + 摘要"二元结构对 AGE 报告层有借鉴价值（#6）。

| # | 模式 | 判定 | 映射与理由 |
| --- | --- | --- | --- |
| 1 | **来源链优先级（host > override > mirror > builtin > unknown）** | **Adopt** | AGE 的"配置 + 仓库事实 + 远程镜像"组合可抽象为同形链条：CLI 参数 > 用户配置 > 工作区 `.age/` 事实 > 远程 mirror > 兜底默认。任何"自动发现 + 字段级补全"场景的通用模板。 |
| 2 | **能力探测结果的分级 TTL（成功 24h / 错误 30min）** | **Adopt** | AGE 的 mission driver 若做"实测 probe"（如验证某 hook 工具链可用性），错误短缓存可防止反复打空成功路径；同一 key 不同 TTL 是普适模式。 |
| 3 | **多源补充表的"字段级合并 vs 字段级替换 vs 仅填空"三语义** | **Adopt** | 与 #1 配合：上下文/最大输出用"替换"、能力用"替换"、定价用"合并"，这种**对不同字段类型施不同语义**是复杂数据归一化的标准技法，AGE 配置层做"用户配置覆盖默认值"时可直接借用。 |
| 4 | **`buildProbeBody` 能力探测的最小化+避坑技巧**（`verifier.ts:47-81`） | **Adapt** | 不携带 `temperature`（推理模型会拒绝）、JSON 探测消息必含 `json` 字样（避免 JSON 模式经典拒绝）、SSE 探测校验"含 `data:` 且 `[DONE]`"三条都是"踩过坑"的产物，AGE 若做 live probe 应直接照抄。 |
| 5 | **能力探测的判读决策树**（2xx 支持 / 400-422 不支持 / 401-403 中止 / 5xx-超时-限流保持未知） | **Adapt** | 与 #4 同源但更宏观：401 中断全部后续（`verifier.ts:163-168` 的 `break outer`）、429/408 等视作瞬态而非能力结论（`verifier.ts:170-173`）。 |
| 6 | **三产物输出（catalog 全量 + snippet 直接消费 + report 人类阅读）** | **Adapt-lite** | AGE 当前报告层只到"日志 + 命令行摘要"，缺一个"全量结构化快照 + 人类可读"二元对；如未来引入 `out/` 风格快照目录，可参考。但 snippet 这一形态对 AGE 无意义（无消费方）。 |
| 7 | **`PromptLineReader` 的行缓冲 + 管道喂入支持**（`src/util/asker.ts:16-80`） | **Adapt** | AGE 的 interactive CLI（如 `pick` 类命令）若要做管道自动化，行缓冲是必需品；`readline` 的"先问后读"语义在 CI/脚本场景下会挂起。该实现 80 行可整体移植。 |
| 8 | **`Vault` 单文件 JSON + 跨进程文件锁 + 原子 rename** | **Adapt-lite** | AGE 已用 git 作唯一事实源，不需要 vault 替代品；但其"陈旧锁接管（5 分钟） + 等待超时（10 秒） + 损坏自动重置"三件套是通用并发原语，可移植到 AGE 任意需要写锁的子命令。**不适合**用于高频写入场景（注释自承极端交错会丢，vault.ts:115-117）。 |
| 9 | **CLI `--kind` / `--probe` / `--external-url` 的"宽松校验，非法值静默回退"语义**（`cli-parse.ts:11-14`，`settings.ts:73`） | **Adopt** | AGE CLI 当前对未知枚举值倾向报错；对运维向工具更友好的是"非法值用 fallback + 静默告警"，可借鉴。但需配 CLI 的 `--strict` 兜底开关。 |
| 10 | **Cache key 含 `auth|anon` 区分鉴权态**（`classifier.ts:85`：`detect::${baseUrl}::${apiKey ? 'auth' : 'anon'}`） | **Adopt** | "同一 URL 因鉴权态不同而探测结果不同"的细节常被忽略；AGE 若做"按 git remote 配置探测"，同样的"env 状态 → cache key"思路适用。 |
| 11 | **`providerSlug` 的 hostname 启发式**（`domain.ts:280-292`） | **Reject** | 对 IPv6 / 本地地址的特殊处理可借鉴，但 `labels.length-2` 取域名的启发式对真实生产域名（如 `api.deepseek.com` → `deepseek`）刚好可用，对 CDN/cloudfront 域名会失真；AGE 的 provider 概念如需发现应走显式声明而非启发式。 |
| 12 | **其整个 `discover` 编排 + 6 种 HostKind 自动探测** | **Reject** | AGE mission driver 不发起 LLM 调用，不需要识别"OpenAI 兼容主机"；整个编排对本项目无业务意义，**不应移植**。 |
| 13 | **Cordis bundle 适配层 + ToolDefinition 元数据集中表**（`src/dsh.ts:44-106,129-194`） | **Reject-lite** | DSH-specific；AGE 用独立 CLI 风格不接 Cordis；但"工具元数据（description + JSON Schema 参数）集中常量"的工程做法本身可移植。 |
| 14 | **依赖注入 + factory pattern（`createPlugin()` → `register(ctx)`）** | **Reject** | AGE 不需要 plugin 化抽象；直接 composable function 即可。 |

## 4. 风险与不适用面

1. **DSH 强版本耦合**：`requires.dsh: ">=0.1.0"`（`manifest.json:7-9`）声明宽，但 host 侧 `DshContext` 接口是手写窄类型（`plugin.ts:47-58`），实际必须匹配宿主 `0.1.0` 主线而非"≥0.1.0"语义；任何 dsh 内部重构都可能使本插件 `register` 签名失配。借鉴其代码可，但直接 `npm install` 到 AGE 工程没有意义——AGE 不用 dsh。
2. **密钥仅经环境变量但 `--api-key` 仍接受**（`main.ts:94,118,162`）：CLI 命令行可临时传密钥，明文进入进程 argv；产物文件已严格不写明文（`emit/snippet.ts:55-57`），但需注意**进程审计日志可能捕获 argv**——这是工程实现细节而非数据层风险。
3. **`buildProbeBody` 的 1 token / 16 token 限制**（`verifier.ts:51,75`）：推理类模型对极小 `max_tokens` 可能拒绝（"参数形状问题"已被 `verifier.ts:172-173` 正则识别为非能力结论），但若推理模型改用 `max_completion_tokens` 而非 `max_tokens`，探测请求会被静默判为"未知"而非实测。**这是一条已知限制但路径未充分覆盖**。
4. **多源补充表的"`origin` 取首次命中"的简化**（`refiner.ts:108-111`）：一个模型可能同时存在于 mirror 和 builtin（且 mirror 比 builtin 新），仍按 `mirror → builtin` 顺序取——这是"fill-in-the-gap"语义的正确实现，但**没有新鲜度判定**；若 mirror 故意提供旧值反而被采纳，需要 `capturedAt` 字段做额外约束才严谨。
5. **`Vault` 极端交错仍可能丢缓存**（`vault.ts:115-117` 自承）：同步写 + 写前合并磁盘快照的"尽力而为"策略在多进程高频写时可能丢条目；对 AGE 而言**绝不应**用于持久化关键状态（AGE 的事实源是 git，规避此类问题）。
6. **未知镜像结构被静默忽略**（`orchestrator.ts:99-103`）：externalUrl 返回既非数组也非 `{models:[...]}` 时仅告警"已忽略"，不抛错——对一次性发现流程合适，但若 AGE 想把"镜像同步"做成常驻服务，需加 schema 校验。
7. **未读测试覆盖率未知细节**：`test/{classifier,domain,cli-parse,collect,refiner,settings,vault,emit}.test.ts` 共 8 个文件未细读，断言细节与边界条件可能漏判；从文件名推断覆盖了"单位换算、主机识别、各类型采集、归一化优先级链、能力探测判读与缓存、缓存仓（TTL/锁/损坏恢复）、输出产物、端到端流水线（本地 mock 主机）"（README:244），与本报告 §2 算法描述一致。
8. **PEFT/本地推理主机的能力探测仅 3 项**（`domain.ts:107-109`）：vision/parallelToolCalls/reasoning/responsesApi 只能从元数据推断（"无法低成本实测"——`verifier.ts:3-4`）；若 Ollama 升级加入某能力但未在 `/api/show` 暴露，目录会保持未知。这是能力探测的固有边界。
9. **本地浅克隆不可深挖**：`/Users/abc/ai/dsh-plugins/dsh-model-catalog/.git` 历史未检查；CHANGELOG.md 自述首版即 v1.0.0、`[Unreleased]` 仅含 bundle 接入与若干修正（CHANGELOG.md:4-25），迭代历史信息有限；任务未提供 stars 数据，仓库流行度未独立核实。
10. **本插件定位是离线配置工具，对 AGE 的正价值集中在"模式层"**：所有可借鉴项（§3 表格的 Adopt/Adapt 行）都是 ≤200 行的可移植代码片段或概念模式，**整个插件作为依赖引入没有任何理由**（dsh 生态外的 AGE 工程根本用不上其 26 个 .ts 中的 90%）。

## 5. 关键源码索引

| 主题 | 位置 |
| --- | --- |
| 数据模型（领域类型全集） | `src/domain.ts:25-292`（HostKind/PricingSourceKind/Capabilities/PriceTier/ModelPricing/ModelEntry/RawModel/换算函数） |
| 6 种 HostKind 标签与本地主机豁免集 | `src/domain.ts:34-45` |
| 编排入口 `discover()`（5 步管线 + withLock 写出） | `src/core/orchestrator.ts:112-181` |
| `pluginRoot()` 包根推导（4 层 dirname） | `src/core/orchestrator.ts:40-42` |
| 主机识别 `classifyHost`（端点探测 + 缓存键 auth\|anon） | `src/core/classifier.ts:74-181`（探测顺序 96-178） |
| 归一化 `refineModels`（来源链 + 字段级合并/替换） | `src/core/refiner.ts:86-238`（定价 147-202；origin 取首次命中 108-111） |
| 5 个 Collector 注册表 | `src/collect/registry.ts:20-35` |
| `bare/vllm` 最小字段采集 | `src/collect/standard.ts:6-26` |
| `augmented` 富元数据采集（字段映射） | `src/collect/augmented.ts:15-77`（33-44 字段映射；49-58 能力推导） |
| `quota` 倍率网关采集（数组/旧式 map 双形态） | `src/collect/quota.ts:78-140`（49-76 形态归一；99-134 按 quota_type 分支） |
| `flag` 能力标志代理采集 | `src/collect/flag.ts:29-89`（47-66 能力布尔映射） |
| `ollama` 列表+细节并发采集 | `src/collect/ollama.ts:31-83`（41-50 `mapLimit(4)`） |
| 能力探测 `verifyCapabilities` | `src/probe/verifier.ts:99-200` |
| 探测请求构造 + JSON/SSE 避坑 | `src/probe/verifier.ts:47-81` |
| 探测决策树（401 中止 / 4xx 拒绝 / 5xx 未知 / TTL 分级） | `src/probe/verifier.ts:109-118,162-200`（24h/30min TTL 见 42-43） |
| Vault 单文件缓存 + 跨进程锁 + 原子 rename | `src/storage/vault.ts:38-182`（持久化 111-134；锁 141-169；释放 171-181） |
| 三产物输出 schema | `src/emit/catalog.ts:1-28` / `src/emit/snippet.ts:1-89` / `src/emit/report.ts:1-84` |
| Plugin factory `createPlugin()` + 5 工具注册 | `src/plugin.ts:64-228` |
| `catalog.discover/list/refresh/select/probe` 各 handler | `src/plugin.ts:114-224` |
| 工具缓存命中策略（`catalogTtlSec` 判定新鲜度） | `src/plugin.ts:145-160` |
| Cordis bundle 适配层 `apply(ctx, rowConfig)` | `src/dsh.ts:129-194` |
| 工具元数据（description + JSON Schema） | `src/dsh.ts:44-106` |
| CLI 命令派发与 `pick`/`probe`/`cache`/`config` | `src/main.ts:92-263` |
| CLI 行缓冲提问器（支持管道） | `src/util/asker.ts:16-80` |
| 极简 HTTP 客户端（fetch + timeout + 1 retry + 宽容 `tryGetJson`） | `src/util/http.ts:28-94` |
| 原子写入工具 | `src/util/fsx.ts:9-28` |
| `parseFlags` / `parseSelection` / `coerceProbeMode` 纯函数 | `src/cli-parse.ts:11-69` |
| `loadSettingsFile` 宽松校验（非法值忽略） | `src/config/settings.ts:60-80` |
| `resolveApiKeyEnvName` 自动检测链 | `src/config/settings.ts:83-91`（`MODELCAT_API_KEY/DEEPSEEK_API_KEY/OPENAI_API_KEY`） |
| 内置默认表（DeepSeek 官方 + 动态定价 tiers） | `data/builtin-table.json:7-95`（peak/off-peak windows 见 22,49） |
| 用户覆盖/别名/镜像示例 | `data/overrides.example.json:1-24` / `data/aliases.example.json:1-9` / `data/mirror.example.json:1-26` |
| manifest 入口/工具/事件/配置键清单 | `manifest.json:10-35` |
| Cordis patch（仅一行 insert） | `cordis.patch.yml:8-10` |
| README 主机类型/单位换算/定价优先级/能力探测表格 | `README.md:95-141` |
| README dsh 接入（manifest 加载 + 工具签名 + 消费建议） | `README.md:226-228` + `docs/integration.md:42-174` |
| CHANGELOG（含 `[Unreleased]` 中的 Cordis bundle 与若干修复） | `CHANGELOG.md:4-37` |
| TS 严格配置（strict + noUncheckedIndexedAccess + NodeNext） | `tsconfig.json:1-19` |

未读备查：`test/{classifier,domain,cli-parse,collect,refiner,settings,vault,emit}.test.ts`（仅 grep 覆盖范围，未逐行）；`test/helpers/mock-host.ts:1-123` 已读；`docs/integration.md` 第 1.1 节之外的工具返回 schema 细节。本报告涉及上述文件的结论均基于源码引用或 grep 转述并已在文中标注。
