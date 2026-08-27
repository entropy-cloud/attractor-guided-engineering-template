# DSH 智能路由 + 失败转移（In-Plugin Routing with Failover）

> **Status: DESIGN DRAFT.** 综合 `docs/analysis/dsh-plugins/` 9 份插件调研 + 用户需求（2026-08-27）整理出的插件设计。本文档定义**目标形态**与**关键算法**，实现细节见后续 WI 拆分。
>
> 编写依据：
> - 需求来源：用户关于"模型 5h 限额后能否自动切换"的扩展讨论
> - 调研来源：`docs/analysis/dsh-plugins/*.md`（9 份）+ `docs/design/dsh-plugin-integration.md`（双形态产品）
> - 服务对象：AGE 的 DSH 插件形态（Mission Control）

## 1. 背景与动机

### 1.1 问题陈述

当前所有 AI step 都 spawn 一个 driver 子进程（`opencode run` / `pi -p`），每个 step 只用**单一模型**。一旦该模型遇到四类失败，整个 mission 即卡死：

| 失败类型 | 频率 | 当前处理 |
| --- | --- | --- |
| 5 小时套餐限额（429 quota，账户级） | 高（套餐必触发） | mission-driver 无感知，step 失败 → mission 退出 |
| Provider 凭据无效（401/403 AUTH，单 provider 级） | 中（套餐切换/凭据过期） | 同上 — **应 failover 到别的 provider** |
| 临时网络/provider 故障（5xx / 连接超时，单 provider 级） | 中 | 同上 — **应 failover 到别的 provider** |
| 模型特定上下文窗口不足（per model 上下文不同） | 低 | 同上 — **应 failover 到 tier 内窗口更大的 model** |

DSH 插件形态下，in-process child agent 有机会在**调用前 / 失败后**做更智能的选择，但目前没有现成机制。

### 1.2 设计目标

- **不引入跨进程总线**（沿用 dsh-agent-relay 调研裁定：单进程内不适用）
- **与 dsh-model-router 同形但不绑 Cordis host API**——本插件可同时在 standalone 与 plugin 两种形态运行
- **mission 模式永不自动中断**：进入 wait-check 模式后必须等用户人工 stop
- **失败语义清晰**：quota-hit vs transient 是两类状态，冷却时长差异 > 100 倍

### 1.3 与 9 份调研的关系

| 调研发现 | 本设计采纳点 |
| --- | --- |
| dsh-model-router: 分级冷却方程 `cool(t, k)` | §6.2 失败状态机核心 |
| dsh-model-router: 健康度评分 5 维 | §6.3 健康度评分（简化版） |
| dsh-delegate-router: 任务"轻/重"分类 + 持久账本 | §4 tier 分类 + §7 账本 |
| dsh-routed-subagent: per-call override + precheck | §5 dispatcher 接口 |
| dsh-vision-router: content-type 触发 provider 改写 | §5 tier 选择可叠加 content-type 信号 |
| flash-godmode: complexity-dispatched 引导 | §4 tier 量化标定 |
| routing-suite (yjh051108): junction + 路由自愈 | §9 mission wait-check 步（自愈语义） |
| fork-to-preset: 路由 UI 完全委托 host | §5 dispatcher 接口的 UI seam |
| model-catalog: 探测 → 换算 → 配置生成 | §4.2 启动时拉 DSH 模型清单校验（在线版本，替代离线探测） |

## 2. 范围与非目标

### 2.1 In-Scope

- ✅ 模型 tier 分类定义与配置
- ✅ 主派发 agent 在派发任务时声明 tier
- ✅ 插件内部维护模型可用性状态（healthy / cooling_down / auth_blocked / quota_blocked）
- ✅ tier 内候选链自动 failover
- ✅ 失败语义识别（quota vs transient）
- ✅ mission 模式下的 wait-check 步（无任何模型可用时）
- ✅ 跨 mission 的状态持久化（避免每次重启都从头冷却）

### 2.2 Out-of-Scope（明确不做的）

- ❌ 跨 provider 的统一 ModelID 抽象（reject model-router 主形态——AGE 不绑 DSH-V4）
- ❌ prompt-level 路由（reject routing-suite-dragonbaba——边际效益低）
- ❌ runtime injector（reject routing-suite-yjh051108——Cordis 特有）
- ❌ 自己配置 provider（base_url / auth / 调用形态）—— DSH 已经托管
- ❌ 模型目录离线自动发现（reject model-catalog 主体）—— DSH Settings → Models 已是真实源
- ❌ "per-call override" 的强 UI（adapt routed-subagent，但只做 dispatch 注解，不做 user-facing UI）

## 3. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  Mission Flow (mission-driver.json 状态机)                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│  │  CHECK   │ → │  REVIEW  │ → │  EXEC    │ → │ DEEP_AUD │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘  │
│         ↓              ↓             ↓              ↓        │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  Step Executor (driver subprocess / in-proc agent)  │    │
│   │   ↑                                                  │    │
│   │   │ tier annotation                                  │    │
│   │   ↓                                                  │    │
│   ╔═══════════════════════════════════════════════════╗    │
│   ║  Routing Plugin (本文档)                           ║    │
│   ║  ┌───────────────┐  ┌──────────────────────────┐  ║    │
│   ║  │ Dispatcher    │  │ Model Registry           │  ║    │
│   ║  │ (tier → pick) │←→│ (state per model id)     │  ║    │
│   ║  └───────────────┘  │  ├─ healthy              │  ║    │
│   ║         ↓            │  ├─ cooling_down(t_cool)│  ║    │
│   ║  ┌───────────────┐  │  ├─ auth_blocked(t_auth) │  ║    │
│   ║  │ LLM Call      │  │  └─ quota_blocked(t_quot)│  ║    │
│   ║  │ Middleware    │           ↑                      ║    │
│   ║  └───────────────┘           │ failure event       ║    │
│   ║         ↓                    │                      ║    │
│   ║  ┌──────────────────────────────────────────────┐ ║    │
│   ║  │ Failure Classifier + State Mutator           │ ║    │
│   ║  └──────────────────────────────────────────────┘ ║    │
│   ║         ↓ quota_hit                              ║    │
│   ║  ┌──────────────────────────────────────────────┐ ║    │
│   ║  │ Mission Wait-Check Step (flow step kind)     │ ║    │
│   ║  │  当 registry 所有 tier 均无健康模型 → 触发    │ ║    │
│   ║  └──────────────────────────────────────────────┘ ║    │
│   ╚════════════════════════════════════════════════════╝    │
│                                                              │
│  On-disk state:                                              │
│    .age/routing-state.json                                   │
│      { models: { id: { state, until, last_error } } }        │
└─────────────────────────────────────────────────────────────┘
```

## 4. 模型 tier 分类

### 4.1 三档（默认）

| Tier | 适用任务 | 决策信号 | 默认候选示例 |
| --- | --- | --- | --- |
| **strong** | 复杂推理 / 代码生成 / 深度审计 / 多步规划 | DEEP_AUDIT / EXECUTE 关键步骤 / 跨 30+ 文件变更 | deepseek-reasoner, claude-opus-4, gpt-5, glm-z1 |
| **medium** | 普通写作 / 中等代码 / review / 元数据生成 | 普通 EXECUTE / REVIEW / DRAFT 主体 | deepseek-chat, claude-sonnet-4, gpt-4.1, glm-4-plus |
| **light** | 文本分类 / 短 Q&A / 格式校验 / 标题生成 | CHECK 步骤 / 短确认 / 命令解析 | deepseek-flash, claude-haiku, gpt-4.1-mini, glm-flash |

> 三档不是铁律：用户可在 `missions/base.json` 的 `routing.tiers` 字段自定义档位（任意 2-5 档）。

### 4.2 tier 候选列表配置

**关键简化**：候选身份用 `provider/model` 字符串（用户友好的配置写法），但内部解析为 DSH 原生 `{provider, model}` 元组——因为 DSH `GenerateOptions` 接受两个独立字段。我们不重新声明 provider 配置（base_url / auth / 调用形态）—— DSH 已经托管。

```jsonc
// missions/base.json (新增字段)
{
  "routing": {
    "tiers": {
      "strong": {
        "candidates": [
          "deepseek-official/deepseek-reasoner",  // 实际 provider id 是 'deepseek-official'（不是 'deepseek'）
          "anthropic/claude-opus-4-1",
          "openai/gpt-5"
        ]
      },
      "medium": {
        "candidates": [
          "deepseek-official/deepseek-chat",
          "anthropic/claude-sonnet-4-5",
          "openai/gpt-4.1"
        ]
      },
      "light": {
        "candidates": [
          "deepseek-official/deepseek-flash",
          "anthropic/claude-haiku-4-5",
          "openai/gpt-4.1-mini"
        ]
      }
    },
    "short_cooldown_seconds": 60,
    "quota_cooldown_seconds":  18000,    // 5h = 18000s
    "max_retries_per_step":    2,        // 单 step 内的 tier 内 failover 次数
    "wait_check_interval_seconds": 300   // mission wait-check 步的回查间隔（5min）
  }
}
```

**职责分离**（必须钉住）：

| 关注点 | 归属 |
| --- | --- |
| ModelID 列表（哪些模型可用） | DSH（用户在 `Settings → Models` 配） |
| Provider 连接配置（base_url / auth / 调用形态） | DSH（与 ModelID 绑定） |
| "这个 tier 用哪几个 model" | 本插件（`missions/base.json:routing.tiers`） |
| "当前哪个 model 处于什么状态" | 本插件（`.age/routing-state.json`） |

**DSH ModelID 形态**（必须钉住 — 来自 DSH 源码核对）：

| 来源 | 形态 |
| --- | --- |
| `GenerateOptions`（实际调用） | `{ provider: string, model: string }` 两个独立字段 |
| `ctx.llm.listModels(provider)` 返回 `LlmModelInfo` | `{ provider, id, name, description?, inputModalities? }` |
| Provider route id 示例（DSH 源码） | `anthropic` / `deepseek-official` / `openai` / `minimax-cn` |
| `ConfigurableProviderView.provider` 注释 | `('deepseek-official', 'openai', …)` |

> ⚠️ Provider route id 不一定是 `provider` 这种短名——`deepseek-official` 是真实存在的路由 id。Config 里写什么就用什么，**不**自动补全或转换。

**字符串解析约束**（必须钉住）：
- `candidates` 字符串只切**第一个 `/`** 作为 provider/model 分隔符
- provider 名约束**不含 `/`**
- model 名约束**不含 `/`**（HuggingFace 风格 provider 一律走 `hf:org/model` 等带 prefix 形式）
- 切完后的 provider 不在 `ctx.llm.listProviders()` 的 active 列表里 → 启动**报错**（fail-fast）
- 切完后的 model 在 `ctx.llm.listModels(provider)` 里不存在 → **warn 但不报错**（DSH README 明说"catalog membership is advisory"，调用未列出的 model 仍合法）

**启动校验代码骨架**：

```ts
async function validateCandidates(candidates: string[]): Promise<void> {
  const providers = new Map(ctx.llm.listProviders().map(p => [p.id, p]));
  const modelsByProvider = new Map<string, Set<string>>();
  for (const id of providers.keys()) {
    const models = await ctx.llm.listModels(id);
    modelsByProvider.set(id, new Set(models.map(m => m.id)));
  }
  for (const id of candidates) {
    const slash = id.indexOf('/');
    if (slash <= 0) throw new ConfigError(`bad candidate id (no '/' separator): ${id}`);
    const provider = id.slice(0, slash);
    const model    = id.slice(slash + 1);
    if (!providers.has(provider)) {
      throw new ConfigError(
        `candidate '${id}': provider '${provider}' not active in DSH. `
        + `Active providers: ${[...providers.keys()].join(', ')}`,
      );
    }
    if (!modelsByProvider.get(provider)!.has(model)) {
      logger.warn(`candidate '${id}': model not in DSH catalog (advisory — call may still work)`);
    }
  }
}
```

### 4.3 模型发现工具（CLI / UI）

方便用户填写 tier 时知道 DSH 当前有哪些 model：

```bash
# standalone 形态
mission-driver routing list-models
# 输出:
#   deepseek-official/deepseek-chat      healthy
#   deepseek-official/deepseek-reasoner  healthy
#   deepseek-official/deepseek-flash     cooling (58s left)
#   anthropic/claude-sonnet-4-5          healthy
#   openai/gpt-5                         quota_blocked (4h 23min left)
```

DSH plugin 形态下，UI 提供"Models" 面板 + 拖拽到 tier 的可视化配置。订阅 `llm/adapters-updated` 事件实时刷新。

**DSH 源码相关**（实现时引用）：
- `ctx.llm.listProviders()` → `LlmProviderInfo[]`（`packages/llm/llm/src/index.ts:446`）
- `ctx.llm.listModels(provider)` → `LlmModelInfo[]`（`packages/llm/llm/src/index.ts:608`）
- `ctx.llm.listConfigurableProviders()` → `LlmConfigurableProvider[]`（`packages/llm/llm/src/index.ts:517`，含 dormant provider）
- `ctx.llm.resolveModelInfo(provider, model)` → `LlmResolvedModelInfo`（`packages/llm/llm/src/index.ts:646`，含 contextWindow / maxTokens / reasoningEffort）
- 客户端 RPC：`ctx.remote.llm.providers()` / `.models()` / `.discoverModels()`（`packages/host/apiproxy/src/api/llm.ts`）

### 4.4 tier 选择标注

dispatcher（即 step executor 在派发任务给 driver 之前）从 flow step 的 `tier` 字段读取：

```jsonc
// flows/mission-driver.json 中 step 写法
{
  "step": "EXEC_main",
  "tier": "strong",            // ← 本 step 锁 strong tier
  "driver": "opencode run --model {{routing.selected_model}} ..."
}
```

> **fallback**：若 step 未指定 `tier`，按 `missions/base.json` 的 `routing.default_tier`（默认 `medium`）。这是从 `dsh-delegate-router` 的"按规则集分类"借鉴——但本设计是**显式标注**而非"运行时分类"，避免 silent 切模。

## 5. Dispatcher 接口（plugin ↔ step executor）

### 5.1 三条注入路径

| 路径 | 形态 | 说明 |
| --- | --- | --- |
| **CLI flag** | standalone | `mission-driver.sh --tier strong ...` 或 step JSON 内 `{{routing.selected_model}}` 占位（值为 DSH ModelID 字符串） |
| **Plugin API** | DSH plugin 形态 | 在 DSH 中暴露 `routing.select(tier) → ModelId` 与 `routing.report_failure(modelId, error)` 函数；model id 透传给 `ctx.llm.call({ model: id, ... })` |
| **Wire protocol** | 进程边界 | driver subprocess 启动时通过 `--model <ModelId>` 注入当前候选；driver 失败时通过 exit code 或 stderr 标记回传（沿用 mission-driver 现有 `<AI_STEP_RESULT>` 标记扩展） |

### 5.2 dispatcher 主流程

```
function dispatchStep(step):
  tier = step.tier ?? defaultTier
  for attempt in 1..max_retries_per_step + 1:
    pick = routing.select(tier, exclude=alreadyTriedThisStep)
    if pick is null:
      # 整个 tier 不可用
      if isMissionMode:
        return ScheduleWaitCheck(tier)
      else:
        raise NoModelAvailable(tier)
    try:
      result = runStep(step, pick)
      routing.report_success(pick)   // 重置健康度
      return result
    except LLMCallError as e:
      tried = tried ∪ { pick }
      routing.report_failure(pick, e)
      # 下一轮 attempt 重选
  # 达到 max_retries
  raise AllCandidatesFailed(tier, tried)
```

### 5.3 选模函数

```ts
// pseudocode（参考 dsh-model-router §2.2 与 dsh-delegate-router decideRoute）
function select(tier: string, exclude: Set<ModelId>): ModelId | null {
  const tierDef = tiers[tier];
  const now = Date.now();
  for (const id of tierDef.candidates) {       // id 是 DSH ModelID 字符串
    if (exclude.has(id)) continue;
    const state = registry.get(id);
    if (!state) {
      // 未观测过 → 默认健康
      return id;
    }
    if (state.status === 'healthy') return id;
    if (state.until > now) continue;            // 仍在冷却/quota 期内
    return id;                                  // 冷却过期 → 重新尝试
  }
  return null;                                  // 整档不可用
}
```

> candidates 字符串就是 DSH ModelID，**不做解析/转换**，整体作为 `ctx.models.call(modelId, ...)` 的入参传给 DSH。Provider 归属、auth、base_url 全部由 DSH 处理。

## 6. 模型 registry 与失败语义

### 6.1 状态机

```
                    success
        ┌──────────────────────────────────┐
        ↓                                  │
   ┌─────────┐    success      ┌────────────────┐
   │ healthy │←────────────────│ auth_block     │
   └─────────┘                 │  (30min 凭据冷却)│
        │                      └────────────────┘
        │ transient/cooldown 过期↑    │ auth 错误
        │ ←─────────────────────┘    │
        ↓
   ┌──────────────┐  冷却过期重试   ┌──────────────┐
   │ cooling_down │────────────────│  (下一轮)     │
   │  (60s 短冷却) │                └──────────────┘
   └──────────────┘
        ↑   │
        │   │ transient 错误
        │   ↓
        │
   ┌──────────────┐  quota 错误
   │ quota_block  │
   │  (5h 配额)    │
   └──────────────┘
```

**状态语义**：

| 状态 | 含义 | 进入条件 | 退出条件 |
| --- | --- | --- | --- |
| `healthy` | 未观测过或最近一次调用成功 | 启动 / success | 任何 failure |
| `cooling_down` | 短暂冷却（瞬时错误 / 上下文超限） | transient 类错误 | `until < now` 或 success |
| `auth_blocked` | 凭据错误冷却（AUTH / INVALID_CREDENTIAL） | auth 类错误 | `until < now` 或 success |
| `quota_blocked` | 账户配额耗尽 | `QUOTA` 类错误 | `until < now` 或 success |

**为什么分三档冷却**：user-fixable vs system-recoverable vs transient —— 修复期望时长差异 100 倍级。
- 60s：网络/provider 瞬时问题，自动恢复
- 1800s：用户需要时间修复凭据
- 18000s：账户配额等系统周期恢复（典型 5h package）

### 6.2 失败分类（关键算法）

**不要自己写字符串匹配！** DSH 已实现稳定的失败分类器：

| 来源 | API | 用途 |
| --- | --- | --- |
| `packages/llm/llm/src/error.ts:28` | `QUOTA_EXCEEDED_CODE = 'QUOTA'` | 标准常量 |
| `packages/llm/llm/src/error.ts:94` | `isQuotaExceededError(detail: string): boolean` | 5 个正则模式匹配 provider 文本 |
| `packages/llm/llm/src/error.ts:80` | `isContextWindowExceededError(detail: string): boolean` | 4 个正则模式 |
| `packages/llm/llm-deepseek/src/adapter.ts:333` | `httpErrorCode(status, error): string` | HTTP status → harness code 映射 |
| `packages/llm/llm/src/error.ts:14` | `HarnessError.code` | **路由字段，不要解析 message** |

**DSH adapter 已分类的 `LlmError.code` 集合**：

| Adapter code | 含义 | 跨 provider 是否独立？ | 本插件处理 |
| --- | --- | --- | --- |
| `QUOTA` | 账户配额/余额耗尽（终端性） | ❌ 账户绑定，同 provider 下其他 model 也不行 | `quota_blocked` → 长冷却（默认 5h） |
| `RATE_LIMIT` | 429 但非配额耗尽（瞬时限流） | ✅ 不同 provider 独立 quota pool | `cooling_down` → 短冷却（默认 60s） |
| `SERVER` | provider 5xx | ✅ | `cooling_down` → 短冷却 |
| `TIMEOUT` | 读超时（idle watchdog） | ✅ | `cooling_down` → 短冷却 |
| `TRANSPORT` | fetch failed / 连接错误 | ✅ | `cooling_down` → 短冷却 |
| `EMPTY_RESPONSE` | 正常完成但无内容 | ✅ | `cooling_down` → 短冷却（DSH 自述"safe to retry"） |
| `AUTH` | 401/403（认证失败） | ✅ **每个 provider 独立凭据**（`ConfigurableProviderView.apiKeyEnv` 按 provider 分开） | `auth_blocked` → 中冷却（默认 1800s = 30min） |
| `INVALID_CREDENTIAL` | 凭据格式错 | ✅ 同上 | `auth_blocked` → 中冷却 |
| `CONTEXT_WINDOW_EXCEEDED` | prompt 超 model 上下文 | ✅ **不同 model 窗口不同**（claude-opus 200k / deepseek-chat 8k / gpt-4.1 1M） | `cooling_down` → 短冷却（下次选 tier 内窗口更大的 model） |
| `INVALID_REQUEST` | 400 通用 / 413 | ⚠️ 多数是调用方 bug（换 provider 也失败），但 413 可能是 provider-specific limit | 不计入（保守） |
| `ABORTED` | 调用方中止 | n/a | 不计入（用户主动取消） |
| 其他 `HTTP_<status>` | 未识别 | — | 保守处理：`cooling_down` 短冷却 + 写账本警示 |

**新增 `auth_blocked` 状态的原因**：AUTH 失败介于 transient 与 quota 之间——
- 60s 太短：用户还没改完凭据就触发重试
- 5h 太长：用户改完凭据要等 5h 才能验证

30min 是经验值：够长避免 spam、够短让"修了凭据 → 30min 后自动恢复"成立。

**路由失败分类的代码骨架**：

```ts
import { HarnessError, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';

type FailureKind = 'quota' | 'transient' | 'auth' | 'non_retryable' | 'aborted';

function classify(error: unknown): FailureKind {
  if (error instanceof HarnessError) {
    switch (error.code) {
      case QUOTA_EXCEEDED_CODE:                      return 'quota';
      case 'AUTH':
      case 'INVALID_CREDENTIAL':                     return 'auth';
      case 'RATE_LIMIT':
      case 'SERVER':
      case 'TIMEOUT':
      case 'TRANSPORT':
      case 'EMPTY_RESPONSE':
      case 'CONTEXT_WINDOW_EXCEEDED':                return 'transient';
      case 'ABORTED':                                return 'aborted';
      // INVALID_REQUEST / 其他 HTTP_xxx
      default:                                       return 'non_retryable';
    }
  }
  // 非 HarnessError（如 driver subprocess 退出码异常）：
  // 保守当 transient，等账本分析后再调
  return 'transient';
}

function onFailure(model: ModelId, error: unknown): void {
  const kind = classify(error);
  const now = Date.now();
  switch (kind) {
    case 'quota':
      registry.set(model, {
        status: 'quota_blocked',
        until: now + quotaCooldownMs,
        last_error_kind: 'quota',
        last_error_at: now,
      });
      break;
    case 'auth':
      registry.set(model, {
        status: 'auth_blocked',
        until: now + authCooldownMs,
        last_error_kind: 'auth',
        last_error_at: now,
      });
      break;
    case 'transient':
      registry.set(model, {
        status: 'cooling_down',
        until: now + shortCooldownMs,
        last_error_kind: 'transient',
        last_error_at: now,
      });
      break;
    case 'non_retryable':
    case 'aborted':
      ledger.append({ kind: 'non_retryable', model, error: String(error) });
      break;
  }
}
```

> 关键：路由字段是 `error.code`，**绝不**解析 `error.message` 文本。DSH adapter 已把 provider 文本归一化为 code，本插件只用 code 即可。

**配置文件同步新增 `auth_cooldown_seconds`**：

```jsonc
{
  "routing": {
    "short_cooldown_seconds":  60,
    "auth_cooldown_seconds":   1800,   // ← 新增：AUTH / INVALID_CREDENTIAL 中冷却
    "quota_cooldown_seconds":  18000,  // 5h = 18000s
    "max_retries_per_step":    2,
    "wait_check_interval_seconds": 300
  }
}
```

### 6.3 健康度评分（轻量版）

dsh-model-router 用了 5 维加权；本设计用更简单的**四态状态机**（healthy / cooling_down / auth_blocked / quota_blocked）。如果未来需要更细粒度（比如"半健康"），再升级。

简化设计：
- 不维护滑窗 / TTL
- 只维护 `state` + `until` + `last_error_kind` + `last_failure_at`
- 冷却过期即重置为 healthy（不记录历史失败次数）

### 6.4 状态持久化

文件位置：`{projectRoot}/.age/routing-state.json`

```jsonc
{
  "version": 1,
  "models": {
    "deepseek/deepseek-chat": {
      "status": "quota_blocked",
      "until": 1756262400000,    // epoch ms
      "last_error_kind": "quota",
      "last_error_at": 1756244400000,
      "last_error_excerpt": "rate_limit_exceeded: 5h package quota"
    },
    "anthropic/claude-sonnet-4": {
      "status": "healthy",
      "until": 0,
      "last_error_kind": null,
      "last_error_at": 0
    }
  }
}
```

> registry key 与 candidates 字符串一致；monitor / 账本 / 日志统一使用 `provider/model` 格式。

写入时机：每次状态变更 + mission 结束 + 每 60s 一次 flush（防进程被杀丢状态）。

## 7. 持久账本（参考 dsh-delegate-router）

为了监控与审计，**所有 failover 事件**写一份账本：

`.age/routing-ledger.jsonl`（append-only）

```jsonl
{"ts":1756244400000,"kind":"select","tier":"strong","picked":"deepseek/deepseek-chat"}
{"ts":1756244401000,"kind":"failure","model":"deepseek/deepseek-chat","error":"quota","cooldown_s":18000}
{"ts":1756244401005,"kind":"select","tier":"strong","picked":"anthropic/claude-sonnet-4"}
{"ts":1756244402000,"kind":"success","model":"anthropic/claude-sonnet-4"}
```

monitor / dashboard 可读这份账本做：
- "过去 24h 各 tier 用了哪个模型"
- "quota 触发频次 → 套餐选择建议"
- "某个 provider 失败率" → 健康度面板

## 8. Mission 模式 wait-check 步

### 8.1 触发条件

当 dispatcher 在某 step 尝试 `max_retries_per_step + 1` 次后**所有候选仍不可用**，且当前 mission 未收到 STOP 信号：

```
"NoModelAvailable(tier)" 触发 wait-check 步
```

### 8.2 wait-check 步语义

不是失败，不是退出。是一个**挂起状态**，mission 状态机转入：

```
WAIT_CHECK(tier=X, next_check_at=T, attempt_count=N)
```

行为：
1. **不杀进程**：driver subprocess / agent runtime 全部 pause（保留状态）
2. **周期性回查**：每 `wait_check_interval_seconds`（默认 300s = 5min）尝试一次 `select(tier)`
3. **恢复条件**：select 返回非 null → 自动恢复 mission 继续
4. **不可中断原则**：除非收到用户 STOP 信号，否则**永不退出** mission

### 8.3 flow JSON 扩展

```jsonc
// flows/mission-driver.json 新增 step kind
{
  "step": "WAIT_CHECK_AFTER_EXEC",
  "kind": "wait_check",
  "tier": "strong",
  "interval_seconds": 300,             // 可覆盖全局默认
  "max_attempts": null,                // null = 无限（除非 STOP）
  "on_recover": "resume_previous_step"
}
```

> `on_recover: resume_previous_step` 是关键——从挂起点恢复 mission，不是从头重跑。

### 8.4 wait-check 步与状态外化的关系

wait-check 期间**必须**把 mission 状态持久化（不仅是 in-memory）：
- 当前 step 标记为 `paused`
- 队列里的后续 step 标记为 `pending`
- 重启 mission-driver 进程也能从 wait-check 恢复

这与 mission-driver 现有的"持久 run-state + reconcile"形态一致，沿用即可。

### 8.5 用户可见的 wait-check UI

monitor dashboard 增加：
- mission 卡片显示 `⏸ WAIT_CHECK（strong tier, 5min 后回查, 已 23min）`
- 每个 model 行显示状态徽章：🟢 healthy / 🟡 cooling / 🟠 auth_blocked / 🔴 quota_blocked
- 提供"立即回查"按钮（手动触发一次 select）
- 提供"STOP mission"按钮（唯一中断方式）

## 9. 配置文件 schema 与加载顺序

```
1. 内置默认（在 routing 插件代码里 hardcode 三档默认候选 + 默认冷却）
2. {projectRoot}/missions/base.json:routing.{tiers, default_tier, ...}
3. {projectRoot}/missions/base.local.json:routing.* （个人本地覆盖，不入 git）
4. 环境变量 AGE_ROUTING_* （CI 覆盖）
```

加载时按 1→2→3→4 顺序合并；后层覆盖前层。这样：
- 默认开箱可用
- 项目级 mission 可定制
- 个人 dev 可临时换模型
- CI 可注入特定候选

## 10. 关键决策记录

| # | 决策 | 备选 | 结论理由 |
| --- | --- | --- | --- |
| D1 | 三档默认（strong/medium/light），可自定义 2-5 档 | 固定三档 / 五档 / 单一档 | 用户需求说"复杂度不同"——三档足以覆盖，强约束来自 dsh-delegate-router 的轻/重二分与 flash-godmode 的复杂度量化 |
| D2 | tier 由 flow step 显式标注，不做运行时分类 | LLM 自觉分类 / 正则分类 | 避免 silent 切模（delegate-router 的风险）；让 mission 设计者掌握每个 step 的成本意图 |
| D3 | quota 错误 = 长冷却（5h），其他 = 短冷却（默认 60s） | 统一冷却 / 自适应 | 用户明确提出"5h 限额"与"短冷却"两类语义，差 100 倍以上必须分开 |
| D4 | mission wait-check 默认 5min 回查，可配置 | 固定 1min / 固定 10min | 5min 平衡响应速度与 provider 配额恢复时间（5h 限额通常在整点刷新） |
| D5 | wait-check 永不超时（除非用户 STOP） | 24h 后强制退出 / N 次后放弃 | 用户明确"确保整体绝对不会中断，除非人工要求停止" |
| D6 | 健康度用二元状态机，不维护滑窗 | 5 维加权评分（dsh-model-router） | mission-driver 不需要毫秒级健康度感知；二元状态机足够，复杂度低一个数量级 |
| D7 | 失败分类基于错误字符串匹配 | 错误码精确匹配 / 模型自报 | provider 错误码不一致；字符串匹配是 dsh-model-router 验证可行的折中 |
| D8 | 状态持久化到 `.age/routing-state.json` | mission-driver run-state 内嵌 / SQLite | 沿用 mission-driver 的"git + JSON"事实源原则；单独文件便于跨 mission 共享状态 |
| D9 | 状态变更写账本 `.age/routing-ledger.jsonl` | 不写 / 写 SQLite | append-only JSONL 与 mission-driver memory 目录同形；monitor 读它做面板 |
| D10 | 不实现 prompt-level routing | 实现 / 部分实现 | routing-suite-dragonbaba 调研结论：边际效益低，README 自承"不改模型/不换工具/不多发调用"——影响仅 1 句引导 |
| D11 | 配置 candidate 时直接使用 DSH 的 ModelID 字符串，不自管 provider / auth / base_url | 自管 provider 段 | DSH 已托管这些；自管是重复造轮子且会与 DSH 配置漂移 |
| D12 | candidates 用 DSH 原生 ModelID 字符串（沿用 DSH 格式，可能是 `provider/model` 或纯 model name） | 强制某种格式 / 自定义格式 | 与 DSH 100% 一致；registry key / 账本 / monitor 全部用同一字符串，不做转换 |
| D13 | 启动时校验：candidate 的 provider 必须在 DSH active provider 列表里；model 不存在只 warn（DSH README 明说 catalog advisory） | 严格白名单 / 完全不校验 | DSH 的语义是"未列出的 model 仍可能可用"——严格白名单会误伤 |
| D14 | AUTH / INVALID_CREDENTIAL 触发 failover，并新增 `auth_blocked` 状态（默认 30min 冷却） | 不 failover / 用 quota 冷却（5h） | DSH 每个 provider 凭据独立；failover 是正确动作；30min 是 user-fixable 的合理窗口（短于 quota 长于 transient） |
| D15 | `CONTEXT_WINDOW_EXCEEDED` 也触发 failover（短冷却），让选模函数下次选 tier 内窗口更大的 model | 不 failover / 永久屏蔽 model | tier 内不同 model 上下文窗口差异显著（8k vs 1M），failover 经常能救 |

## 11. 待澄清问题（实现前必须回答）

| # | 问题 | 候选答案 | 影响 | 状态 |
| --- | --- | --- | --- | --- |
| Q1 | "5 小时限额"的字符串匹配规则是什么？需要逐 provider 验证 | deepseek / anthropic / openai / zhipu 各自的 429 文本 | §6.2 分类正确率 | **已答** — DSH `isQuotaExceededError()` + `QUOTA_EXCEEDED_CODE` 已覆盖 |
| Q2 | driver subprocess 失败时如何回传错误细节？现有 `<AI_STEP_RESULT>` 够不够？ | 扩展 schema 加 `error_kind` 字段 | §5.1 wire protocol | 待答 |
| Q3 | mission 模式下挂起的 driver 进程是否能"真正 pause"（vs kill+restart）？ | pause-by-suspend-signal / kill-and-recreate | §8.4 恢复语义 | 待答 |
| Q4 | wait-check 期间 monitor 是否仍可用？SSE 心跳如何兼容？ | 独立心跳通道 / 共用 SSE | §8.5 UI 形态 | 待答 |
| Q5 | 跨 mission 的状态共享边界在哪？ | 全局 / per-project / per-user | §6.4 持久化 | 待答 |
| Q6 | tier 选择失败时（flow step 标的 tier 不存在），fallback 到哪？ | default_tier / 报错 | §4.4 fallback | 待答 |
| Q7 | "max_retries_per_step" 的语义是"尝试 N 个不同模型"还是"尝试 N 次同一模型"？ | 不同模型 | §5.2 | 待答 |
| Q8 | DSH 原生 ModelID 的格式到底是什么？纯 model name / `provider/model` / UUID？影响 candidates 字符串写法 | 需要查 DSH 模型清单 API 实际返回 | §4.2 / §4.3 / D12 | **已答** — `{provider, model}` 元组；config 用 `provider/model` 字符串，运行时 split |
| Q9 | DSH 是否暴露模型清单 API（如 `ctx.models.list()`）？如果不暴露，是否需要从 `Settings → Models` UI 反向解析？ | 需要 DSH host API 调研 | §4.2 校验 / §4.3 发现工具 | **已答** — `ctx.llm.listProviders()` / `.listModels(provider)` / `.listConfigurableProviders()` / `.resolveModelInfo(provider, model)`；客户端 RPC `ctx.remote.llm.{providers,models,discoverModels}`；事件 `llm/adapters-updated` |

## 12. 采纳计划（与 AGE WI 对齐）

| Phase | 内容 | 关联 WI |
| --- | --- | --- |
| P0 | 本设计文档落地 → WI 拆分 | M5-WI1（待开） |
| P1 | 离线实现：routing-state.json + dispatch 函数 + select 算法 + 失败分类（standalone 形态，先不带 mission wait-check） | M5-WI2 |
| P2 | mission wait-check 步 + monitor 面板 | M5-WI3 |
| P3 | DSH plugin 形态适配（Plugin API + UI seam） | M5-WI4（依赖 `dsh-plugin-integration.md` M4-WI14） |
| P4 | 多 provider 错误字符串实测标定 + 健康度升级（如未来需要） | M5-WI5 |

## 13. 对 9 份调研的最终映射

| 调研报告 | 本设计中的角色 | 章节 |
| --- | --- | --- |
| dsh-model-router | 冷却方程思想 + 候选链遍历（不直接抄——DSH 已分类错误，不重复正则） | §5.3 + §6.2 |
| dsh-delegate-router | tier 二元分类灵感 + 持久账本形态 | §4.1 + §7 |
| dsh-vision-router | content-type 触发 provider 改写（可叠加） | §5.3 扩展点 |
| dsh-routed-subagent | per-call override + precheck | §5.2 dispatcher 接口 |
| dsh-fork-to-preset | UI 完全委托 host 的 seam 设计参考 | §5.1 |
| dsh-flash-godmode | complexity dispatch 的"显式标注"反例（避免 silent 切模） | §4.4 + D2 |
| dsh-model-catalog | 在线版替代：拉 DSH `ctx.llm.listProviders()` / `listModels()` 作为真实源，不再做离线探测 | §4.2 / §4.3 + §11 Q9 |
| dsh-routing-suite (yjh051108) | 自愈语义 + junction 思路（吸收为 wait-check 步的自愈循环） | §8 |
| dsh-routing-suite-dragonbaba | prompt-level 路由的负价值证据（reject） | §10 D10 |

## 14. DSH host API 参考（实现时直接 import）

| 需求 | 导入 | 文件 |
| --- | --- | --- |
| Provider/model 列表 | `ctx.llm.listProviders()` / `.listModels(provider)` | `packages/llm/llm/src/index.ts:446,608` |
| Configurable providers（含 dormant） | `ctx.llm.listConfigurableProviders()` | `packages/llm/llm/src/index.ts:517` |
| Route 精确元数据（context/maxTokens/reasoning） | `ctx.llm.resolveModelInfo(provider, model)` | `packages/llm/llm/src/index.ts:646` |
| 模型目录变化事件 | `ctx.on('llm/adapters-updated', ...)` | `packages/llm/llm/src/types.ts:19` |
| 失败分类常量 | `QUOTA_EXCEEDED_CODE` / `CONTEXT_WINDOW_EXCEEDED_CODE` / `EMPTY_RESPONSE_CODE` / `INVALID_CREDENTIAL_CODE` | `packages/llm/llm/src/error.ts:25-48` |
| 失败分类函数 | `isQuotaExceededError(detail)` / `isContextWindowExceededError(detail)` | `packages/llm/llm/src/error.ts:80,94` |
| 错误基类（路由 code 字段） | `HarnessError.code` | `packages/llm/llm/src/error.ts:14` |
| 客户端 RPC（standalone 走 RPC） | `ctx.remote.llm.providers()` / `.models()` / `.discoverModels()` | `packages/host/apiproxy/src/api/llm.ts` |

**未直接 import 但可参考**：
- `packages/llm/llm-deepseek/src/adapter.ts:333` 的 `httpErrorCode()` 函数 — 已知 DeepSeek adapter 已映射的 status→code 表
- `packages/client/ui-settings-models/src/client/store.ts:70` 的 `deriveKeyRef(provider)` — provider id → env var 名（`${PROVIDER}_API_KEY`）

---

> **本设计是 ACTION-ORIENTED**：所有"调研中有价值但本设计未采纳"的模式列在 §10 决策表与 §13 映射表，避免下次重启时再走一遍调研。
