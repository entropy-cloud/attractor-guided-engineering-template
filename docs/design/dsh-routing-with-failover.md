# DSH 智能路由 + 失败转移（In-Plugin Routing with Failover）

> **Status: DESIGN.** 综合 `docs/analysis/dsh-plugins/` 9 份插件调研 + 用户需求整理出的插件设计。本文档定义**目标形态**与**策略组合规则**，技术细节唯一真相源为代码。
>
> 编写依据：
> - 需求来源：用户关于"模型 5h 限额 / rate-limit / 全部不可用时永不放弃 / 请求超时 / 连续失败熔断 / 分层升级"的扩展讨论
> - 调研来源：`docs/analysis/dsh-plugins/*.md`（9 份）+ `docs/design/dsh-plugin-integration.md`（双形态产品）
> - 服务对象：AGE 的 DSH 插件形态（Mission Control）

## 1. 背景与动机

### 1.1 问题陈述

当前所有 AI step 都 spawn 一个 driver 子进程（`opencode run` / `pi -p`），每个 step 只用**单一模型**。一旦该模型遇到多种失败，整个 mission 即卡死：

| 失败类型 | 频率 | 当前处理 |
| --- | --- | --- |
| 5 小时套餐限额（429 quota，账户级） | 高（套餐必触发） | mission-driver 无感知，step 失败 → mission 退出 |
| Provider 凭据无效（401/403 AUTH，单 provider 级） | 中 | 同上 — **应 failover 到别的 provider** |
| 临时网络/provider 故障（5xx / 连接超时，单 provider 级） | 中 | 同上 — **应 failover 到别的 provider** |
| 请求长期无返回（driver 进程挂死、idle watchdog 失效） | 低 | 同上 — **应超时视为失败并 failover** |
| 同一 provider 连续多次失败 | 中（弱 provider） | 同上 — **应熔断并冷却递增** |

DSH 插件形态下，in-process child agent 有机会在**调用前 / 失败后**做更智能的选择，但目前没有现成机制。

### 1.2 设计目标

- **永不自动中断**：全 tier 模型不可用时进入 wait-check 模式，必须等用户人工 stop
- **失败语义清晰**：quota-hit（5h）vs auth（30min）vs rate-limit/network/timeout（60s 起递增）冷却时长差异显著
- **分层路由**：便宜模型优先，贵模型只在便宜层全部不可用时升级
- **熔断递增**：同一模型连续失败应触发更长冷却（60s → 120s → ... → 封顶），成功后重置

### 1.3 与 9 份调研的关系

| 调研发现 | 本设计采纳点 |
| --- | --- |
| dsh-model-router: 分级冷却方程 | §6 冷却递增规则 |
| dsh-model-router: 健康度评分 5 维 | §6 简化为三态熔断 |
| dsh-delegate-router: 任务"轻/重"分类 + 持久账本 | §4 tier 分类 + §7 账本（Deferred） |
| dsh-routed-subagent: per-call override + precheck | §5 dispatcher 接口 |
| dsh-vision-router: content-type 触发 provider 改写 | §5 tier 选择可叠加 content-type 信号 |
| flash-godmode: complexity-dispatched 引导 | §4 tier 量化标定 |
| routing-suite (yjh051108): junction + 路由自愈 | §9 mission wait-check 步 |
| fork-to-preset: 路由 UI 完全委托 host | §5 dispatcher 接口的 UI seam |
| model-catalog: 探测 → 换算 → 配置生成 | §4.2 启动时拉 DSH 模型清单校验（Deferred） |

## 2. 范围与非目标

### 2.1 In-Scope

- ✅ 模型 tier 分层定义与配置（便宜层优先、贵模型备用）
- ✅ 主派发 agent 在派发任务时声明 tier
- ✅ 插件内部维护模型熔断状态（closed / open / half-open）
- ✅ 冷却时长按失败类型区分 + 连续失败指数递增
- ✅ tier 内候选链自动 failover，tier 间升级条件
- ✅ 请求级超时（超时视为失败）
- ✅ 全 tier 不可用时 wait-check 周期性回查（永不放弃除非用户 STOP）
- ✅ 状态持久化（避免每次重启都从头冷却）
- ✅ 用户暂停机制（UI STOP 按钮 → 彻底停止）

### 2.2 Out-of-Scope

- ❌ 跨 provider 的统一 ModelID 抽象（DSH 已托管 provider 配置）
- ❌ prompt-level 路由（边际效益低）
- ❌ runtime injector（DSH 特有）
- ❌ 自己配置 provider（DSH 已托管）
- ❌ 模型目录离线自动发现（DSH Settings → Models 已是真实源）
- ❌ 持久账本 `.nop/dsh/routing-ledger.jsonl`（独立 Deferred slice）

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
│   │   ↑ timeoutMs                                       │    │
│   │   ↓                                                  │    │
│   ╔═══════════════════════════════════════════════════╗    │
│   ║  Routing Plugin (本文档)                           ║    │
│   ║  ┌───────────────┐  ┌──────────────────────────┐  ║    │
│   ║  │ Tier Selector │  │ Circuit Breaker          │  ║    │
│   ║  │ (layered)     │←→│ (per model state)        │  ║    │
│   ║  └───────────────┘  │  ├─ closed (normal)      │  ║    │
│   ║         ↓            │  ├─ open (cooling)       │  ║    │
│   ║  ┌───────────────┐  │  └─ half-open (probing)  │  ║    │
│   ║  │ LLM Call      │  └──────────────────────────┘  ║    │
│   ║  │ Middleware    │           ↑                      ║    │
│   ║  └───────────────┘           │                      ║    │
│   ║         ↓ timeoutMs/failure │                      ║    │
│   ║  ┌──────────────────────────────────────────────┐ ║    │
│   ║  │ Error Classifier + Circuit Mutator           │ ║    │
│   ║  └──────────────────────────────────────────────┘ ║    │
│   ║         ↓ all tiers unavailable                   ║    │
│   ║  ┌──────────────────────────────────────────────┐ ║    │
│   ║  │ Wait-Check (periodic re-check, never gives up)║    │
│   ║  │  全 tier 不可用 → 周期性回查 → 用户 STOP 终止 ║    │
│   ║  └──────────────────────────────────────────────┘ ║    │
│   ╚════════════════════════════════════════════════════╝    │
│                                                              │
│  On-disk state:                                              │
│    ~/.nop/dsh/routing-state.json                              │
│      { models: { id: { state, until, consecutiveFailures,   │
│                        cooldownMs, lastErrorClass } } }      │
└─────────────────────────────────────────────────────────────┘
```

## 4. 模型 tier 分类

### 4.1 分层（默认）

| 层 | 适用任务 | 默认候选示例 | 备注 |
| --- | --- | --- | --- |
| **standard** | 普通推理 / 写作 / review | glm-5.2, deepseek-chat, gpt-4.1 | 默认层，优先使用 |
| **premium** | 复杂推理 / 深度审计 / 大上下文 | gpt-5, claude-opus-4 | 仅当 standard 层全部不可用且冷却 >30min 时升级 |

分层不是铁律：用户可在配置中自定义任意层数和候选。

### 4.2 tier 候选列表配置

**关键简化**：候选身份用 `provider/model` 字符串（用户友好的配置写法），内部不做解析转换——DSH 已托管 provider 配置。

**行为规则**：
- candidates 字符串只切**第一个 `/`** 作为 provider/model 分隔符
- 切完后的 provider 不在 DSH active 列表里 → 启动**报错**（fail-fast）
- 切完后的 model 在 DSH 列表里不存在 → **warn 但不报错**（DSH README 明说"catalog membership is advisory"）

### 4.3 分层配置 schema

```
routing:
  tiers:
    - name: standard
      candidates: [zhipuai/glm-5.2, deepseek/deepseek-chat]
      escalationThresholdMs: 1800000   # 当该层所有模型冷却都超过 30min 时升级
    - name: premium
      candidates: [openai/gpt-5, anthropic/claude-opus-4]
      escalationThresholdMs: null      # 最高层，不升级，进入 wait-check
  defaultTier: standard
  waitCheckIntervalMs: 300000         # 5min 回查间隔
  requestTimeoutMs: 600000             # 10min 请求超时
```

### 4.4 tier 选择规则

主派发 agent 从 flow step 的 `tier` 字段读取（缺省按 `defaultTier`）。这是**显式标注**而非运行时分类——避免 silent 切模。

## 5. 分层选择策略

### 5.1 选择函数语义

```
select(tier, now):
  在该 tier 的 candidates 中选第一个状态 = closed 或 half-open 的模型
  if 找到 → 返回该模型
  if 该 tier 全部状态 = open：
    计算最早可用时间 = min(所有模型的 until)
    if 最早可用时间 - now < escalationThresholdMs：
      等待到最早可用时间后重试该 tier（不升级）
    else：
      if 有更高 tier → 升级
      else → wait-check
  return null（触发 wait-check）
```

### 5.2 升级条件

当前 tier 所有模型的 `until - now > escalationThresholdMs`（即即使等最早的恢复也需超过阈值）时，才升级到下一层。

**为什么需要升级阈值**：
- 60s 短冷却时不应升级到贵模型
- 等 5min 就能恢复时不应升级
- 必须等 >30min 仍无恢复，才升级到贵模型（节省费用）

### 5.3 向后兼容

旧 config 格式 `{ defaultModel, fallbackModels }` 等价于单层 tier：`{ name: "default", candidates: [defaultModel, ...fallbackModels], escalationThresholdMs: 0 }`（立即升级，仅作为兼容 shim）。

## 6. 熔断器（Circuit Breaker）

### 6.1 三态状态机

```
          consecutiveFailures >= threshold
  closed ──────────────────────────────────→ open
    ↑                                          │
    │  cooldown 过期 + 试探成功                │
    │                                          │
    │    ←── cooldown 过期 → half-open ────────┘
    │         试探成功 → closed
    │         试探失败 → open（冷却重新计算）
    └──────────────────────────────────────────┘
```

| 状态 | 含义 | 行为 |
|------|------|------|
| `closed` | 正常或冷却过期已恢复 | 可被选中处理请求 |
| `open` | 冷却期内 | 不可被选中，等待 until 过期 |
| `half-open` | 冷却过期，试探中 | 允许一个请求试探；成功 → closed，失败 → open |

### 6.2 冷却时长（按 errorClass 分 base/max + 指数递增）

| errorClass | base | max | 含义 |
|-----------|------|-----|------|
| `transient:rate-limit` | 60s | 1800s (30min) | 限流，自动恢复 |
| `transient:network` | 60s | 1800s | 网络故障 |
| `transient:timeout` | 60s | 1800s | 超时 |
| `permanent:auth` | 1800s | 1800s | 凭据错误，固定 30min |
| `permanent:budget` | 18000s | 18000s | 配额耗尽，固定 5h |
| `permanent:invalid-input` | — | — | 不重试，不进熔断 |
| `partial:marker` | — | — | 不重试，不进熔断 |

**公式**：`cooldown = min(base × 2^(consecutiveFailures-1), max)`

`consecutiveFailures` 在 `recordSuccess()` 时重置为 0。

### 6.3 失败分类规则（关键）

**路由字段是 `error.code`，绝不解析 `error.message`**——DSH adapter 已把 provider 文本归一化为 code，路由只用 code。

| errorClass | 进入熔断 | 冷却 base/max |
|-----------|---------|--------------|
| `transient:rate-limit` | ✓ | 60s / 1800s |
| `transient:network` | ✓ | 60s / 1800s |
| `transient:timeout` | ✓ | 60s / 1800s |
| `permanent:auth` | ✓ | 1800s / 1800s |
| `permanent:budget`（无 retry-after） | ✓ | 18000s / 18000s |
| `permanent:budget`（有 retry-after） | 升级为 `transient:rate-limit` | 60s / 1800s |
| `permanent:invalid-input` | ✗ | — |
| `partial:marker` | ✗ | — |
| `unknown` | ✓ | 60s / 1800s（保守处理） |

### 6.4 简化设计原则

- **不维护滑窗 / TTL**：只维护当前状态 + until + consecutiveFailures + lastErrorClass
- **冷却过期即半开试探**：不记录历史失败次数的衰减
- **成功即重置**：recordSuccess() 把 consecutiveFailures 重置为 0

## 7. 请求级超时

每个请求有 `requestTimeoutMs`（默认 600000 = 10min）。超时视为该模型的一次失败，触发熔断状态变更。

**职责分离**：
- 路由插件（nop-route）：只提供 timeoutMs 配置，不管理定时器
- 调用方（mission-driver / step executor）：负责实现超时机制，到时取消请求并回传超时错误

## 8. Wait-Check（永不放弃）

### 8.1 触发条件

**所有 tier 全部不可用**时进入 wait-check。

### 8.2 行为定义

不是失败，不是退出。是 mission 状态机的**挂起状态**：

```
WAIT_CHECK(retryAtMs, tiers)
```

1. **不杀进程**：driver subprocess / agent runtime 全部 pause（保留状态）
2. **周期性回查**：每 `waitCheckIntervalMs`（默认 300000 = 5min）尝试一次 select
3. **恢复条件**：select 返回非 null（任一模型冷却过期）→ 自动恢复
4. **不可中断原则**：除非收到用户 STOP 信号，否则**永不退出** mission

### 8.3 wait-check 是默认行为

**wait-check 不是可禁用的扩展**——全 tier 不可用时的必经路径。调用方可通过 timeoutMs 控制单次等待上限，但不可跳过 wait-check。

## 9. 状态持久化

### 9.1 状态作用域分类

routing 相关状态按作用域分三类：

| 类别 | 作用域 | 持久化位置 | 例子 |
|---|---|---|---|
| **账号/凭证级** | per-user 全局（跨项目共享） | `~/.nop/dsh/routing-state.json` | 模型熔断状态（quota 耗尽、auth 失效是账号级别，跨项目都生效） |
| **mission 级** | per-mission 临时 | 不持久化 / mission 结束时落账本 | paused 标志、当前 mission 调用统计 |
| **配置级** | per-user 全局或 per-project | `~/.nop/dsh/routing-config.json` 或 `missions/base.json:routing` | tiers 定义、candidates 列表、cooldown 时长 |

**目录约定**：`~/.nop/` 是 nop 平台（age-autonomy / mission-driver / nop-* plugins）的用户级 home，所有平台级持久状态都集中在这里。`~/.nop/dsh/` 子目录专门承载 DSH 相关的路由/熔断/账本状态。类比：

| 平台 | home 目录 | 用途 |
|---|---|---|
| DSH | `~/.dsh/settings.yaml` | DSH 原生配置 |
| nop | `~/.nop/dsh/routing-state.json` | nop 路由状态 |
| nop | `~/.nop/dsh/routing-config.json` | nop 路由配置 |

**home 解析**：通过 `$NOP_HOME` 环境变量或 fallback 到 `~/.nop/`（参考 `@deepseek-ai/dsh-home-paths` 的 `resolveDshHome` 模式）。

### 9.2 持久化方案与现有模式对照

**采用 atomic write 模式**——直接借鉴 `plugin/nop-age/src/efficiency/context-profile.ts:91-99` 的 `fsProfileIo.writeTextAtomic` 12 行 tmp+rename 实现，**不引入** `@deepseek-ai/dsh-atomic-write`（mode 参数硬约束过强）、**不依赖** DSH host 集成（plan Decision 6）。

| 维度 | 决策 | 依据 |
|---|---|---|
| 写入方式 | tmp file + renameSync 原子替换 | 与 mission-driver `_writeWorkflow`、`context-profile.ts:91-99`、`active-run-registry.mjs:82-106` 一致 |
| 写入时机 | 状态变更即触发 + debounce 60s 兜底 flush | 设计文档 §9 + `context-profile.ts:531-555` "无变化不写"模式 |
| 账号级文件位置 | `~/.nop/dsh/routing-state.json` | routing 是账号/凭证级状态（quota 耗尽跨项目共享），不写项目根；类比 DSH settings 写 `~/.dsh/settings.yaml` |
| 配置级文件位置 | `~/.nop/dsh/routing-config.json`（per-user 全局默认）+ `missions/base.json:routing`（per-project 覆盖） | 类比 DSH settings 三层覆盖（home → project → env） |
| `.gitignore` | 不需要 | 在用户 home，不在项目内 |
| 跨进程锁 | 可选（多 nop-route 实例同时挂载时考虑） | 单实例通常不需要 |
| Schema version | 简化为 v1（无 version 字段） | plan 阶段最小化 |

### 9.3 schema（账号级 routing-state.json）

```
{
  "models": {
    "deepseek/deepseek-chat": {
      "state": "open",
      "until": 1756262400000,
      "consecutiveFailures": 3,
      "cooldownMs": 240000,
      "lastErrorClass": "transient:rate-limit",
      "lastErrorAt": 1756244400000
    }
  }
}
```

注意：`paused` 不在这里——paused 是 per-mission 状态，在 service 层内存即可（mission 结束自动清除）。

读取失败时保守返回空（circuit 全 closed），不破坏服务可用性。

### 9.4 schema（配置级 routing-config.json）

```
{
  "tiers": [
    {
      "name": "standard",
      "candidates": ["zhipuai/glm-5.2", "deepseek/deepseek-chat"],
      "escalationThresholdMs": 1800000
    },
    {
      "name": "premium",
      "candidates": ["openai/gpt-5", "anthropic/claude-opus-4"],
      "escalationThresholdMs": null
    }
  ],
  "defaultTier": "standard",
  "waitCheckIntervalMs": 300000,
  "requestTimeoutMs": 600000
}
```

加载顺序（后层覆盖前层）：
1. `~/.nop/dsh/routing-config.json`（per-user 默认）
2. `missions/base.json:routing`（per-project 覆盖）
3. `missions/base.local.json:routing`（个人本地覆盖，不入 git）
4. 环境变量 `AGE_ROUTING_*`（CI 覆盖）

### 9.5 职责分离

- **纯函数层（circuit-breaker / tier-selector）**：零 I/O，状态变更纯入参出参
- **service 层**：持有 circuit-breaker 闭包 + IO 接口（可注入测试），recordFailure/recordSuccess 后由 `schedulePersist(now)` debounce；启动时从 `~/.nop/dsh/routing-state.json` load，teardown 时 flush

## 10. 用户暂停

- **触发**：UI STOP 按钮（`POST /noproute/api/pause`）
- **效果**：该 mission 暂停标志，nop-route 所有 route 返回 `{ decision: "paused" }`
- **作用域**：per-mission（每个 mission-driver run 独立暂停状态）
- **状态**：service 层内存，**不持久化**——mission 结束即清零
- **恢复**：`POST /noproute/api/resume` 清除标志

## 11. 调用统计与监控

### 11.1 统计维度与作用域（三层）

| 层级 | 作用域 | 持久化 | 例子 |
|---|---|---|---|
| **账号级** | per-user 全局，跨项目跨 mission 共享 | `~/.nop/dsh/routing-state.json` | circuit 状态（quota 耗尽、auth 失效是账号级） |
| **项目级** | per-project 全局，跨 mission 共享 | `~/.nop/dsh/routing-stats/<project-hash>.json` | 某模型在某项目中的总调用次数、总 token、总耗时 |
| **mission 级** | per-mission 临时 | 不持久化（in-memory） | 当前 mission 的 paused 标志、本次 run 的累计统计 |

**为什么需要项目级**：circuit 状态是账号级（quota 是账号的），但**统计是项目级的**——
- 项目 A 用 deepseek-chat 100 次成功（100k tokens），项目 B 用 deepseek-chat 50 次失败（10k tokens）——合并显示没意义
- 用户需要看"我这个项目用了哪些模型、效果如何"
- 不同项目的成本/性能特征不同，不能合并

### 11.2 项目识别（project 维度）

**三种 project 标识来源**：

| 来源 | 形态 | 何时使用 |
|---|---|---|
| `projectRoot` 绝对路径 | `/Users/abc/projects/foo` | mission-driver 传入，最精确 |
| `projectId` | 显式 ID（可选） | 当 projectRoot 不可用时（如 HTTP 调用） |
| 缺省（fallback） | `"__global__"` | 无 project context 时（如 nop-route e2e 测试、HTTP 调用方未传） |

**projectRoot → hash**：`hash = sha256(projectRoot).slice(0, 16)`（避免路径中的 `/` 和长字符串污染文件名），文件名 `~/.nop/dsh/routing-stats/<hash>.json`。

**payload 字段**：调用 `noproute.route` 时新增 `projectRoot?: string` 字段：
- 提供 → 累加到该项目 stats
- 缺省 → 累加到 `__global__` stats

**调用方责任**：
- mission-driver / native-executor 调用 nop-route 时从 `config.projectRoot` 读取并传入 payload（**未来 slice——当前 mission-driver 不调用 nop-route**）
- HTTP 调用方（如外部脚本）需主动传 `projectRoot`；否则归入 global
- e2e 测试用 mock projectRoot 或 global

### 11.3 项目级统计字段

每个 `projectRoot × model` 维护：

| 维度 | 类型 | 来源 |
|---|---|---|
| `totalCalls` | counter | 每次 select 后 +1 |
| `totalSuccess` | counter | 每次 recordSuccess 后 +1 |
| `totalFailures` | counter | 每次 recordFailure 后 +1 |
| `totalDurationMs` | counter | 每次 recordCall 累加 `durationMs` |
| `totalTokensInput` | counter | 调用方传入（input tokens） |
| `totalTokensOutput` | counter | 调用方传入（output tokens） |
| `lastCallAt` | timestamp | 每次 select 后更新 |
| `firstCallAt` | timestamp | 首次 select 后设置 |

**注意**：circuit 状态（state / until / consecutiveFailures / lastErrorClass）是**账号级**——不在项目 stats 里。

### 11.4 持久化与内存

- **项目级 stats**：持久化到 `~/.nop/dsh/routing-stats/<project-hash>.json`，每次 recordCall 后 debounce 60s flush；项目结束（mission 全部完成）时强制 flush
- **mission 级**：纯 in-memory，service 卸载（cordis teardown）即清零
- **账号级 circuit**：见 §9

### 11.5 为什么不放 missions/base.json 或项目根

| 方案 | 缺点 |
|---|---|
| `<homeDir>/.nop/dsh/routing-stats/<hash>.json` | 与 circuit 状态分离，跨项目复制时项目根混乱 |
| `{projectRoot}/missions/routing-stats.json` | 会被 mission-check 扫描污染 |
| **`~/.nop/dsh/routing-stats/<hash>.json`** ✓ | 账号级 home 目录，与 circuit 状态同根，hash 文件名隔离项目 |

### 11.6 UI 外化（monitor dashboard）

**复用现有模式**——与 `monitor dashboard` RunList/RunDetail 保持一致的视觉风格：

| 组件 | 来源 | 复用方式 |
|---|---|---|
| 状态徽章 | `RunList.vue:201-210` `statusTagType()` | 新增 `circuitStateTagType()` 同模块 |
| 倒计时 | `useClock.ts:17-44` 1s interval | 直接复用，传入 `getUntil()` |
| per-item 列表 | `StepTimeline.vue` timeline + tag + footer | 新增 `<CircuitStateTimeline/>` |
| 总览条 | `RoadmapProgress.vue:12-18` `n-progress` | 可选，"N/M 模型可用" |
| 数据表 | `ResourceChart.vue:23-31` `n-data-table` | 可选，列：模型 / state / until / remainingMs / consecutiveFailures / lastErrorClass / totalCalls / totalTokens |

### 11.7 REST API（sync wire route）

**`POST /noproute/api/circuit-state`**——返回完整快照（账号级 + project 级 + mission 级合并）：

```
{
  "models": {
    "deepseek/deepseek-chat": {
      "state": "open",                              // 账号级（跨 project/mission 共享）
      "until": 1756262400000,
      "remainingMs": 120000,
      "consecutiveFailures": 3,                      // 账号级
      "cooldownMs": 240000,
      "lastErrorClass": "transient:rate-limit",     // 账号级
      "lastErrorAt": 1756244400000,
      "statsByProject": {                            // 项目级（per-project 持久化）
        "/Users/abc/projects/foo": {
          "totalCalls": 142,
          "totalSuccess": 139,
          "totalFailures": 3,
          "totalDurationMs": 325000,
          "totalTokensInput": 124567,
          "totalTokensOutput": 89342,
          "firstCallAt": 1756000000000,
          "lastCallAt": 1756262000000
        }
      },
      "statsGlobal": {                               // mission 级（无 projectRoot 时归入此）
        "totalCalls": 5,
        ...
      }
    }
  },
  "paused": false,                                  // mission 级（per-mission in-memory）
  "currentProjectRoot": "/Users/abc/projects/foo",  // 当前 mission 上下文
  "errorHistogram": { "transient:rate-limit": 3 }  // mission 级
}
```

**新增 `POST /noproute/api/project-stats` route**：

```
POST /noproute/api/project-stats
Body: { projectRoot?: string }  // 缺省返回所有项目

Response:
{
  "projects": {
    "/Users/abc/projects/foo": {
      "firstSeenAt": 1756000000000,
      "totalCalls": 147,
      "byModel": {
        "deepseek/deepseek-chat": { "calls": 142, "success": 139, "failures": 3, "tokens": 213909 },
        "zhipuai/glm-5.2": { "calls": 5, "success": 5, "failures": 0, "tokens": 12340 }
      }
    }
  }
}
```

**刷新节奏**：REST 轮询 5s（与 `RunList.vue:374` 同节奏），circuit 状态变化低频无需 SSE。

## 12. 配置文件 schema 与加载顺序

1. 内置默认（路由插件代码里 hardcode）
2. `~/.nop/dsh/routing-config.json`（per-user 全局配置默认）
3. `{projectRoot}/missions/base.json:routing`（per-project 覆盖）
4. `{projectRoot}/missions/base.local.json:routing`（个人本地覆盖，不入 git）
5. 环境变量 `AGE_ROUTING_*`（CI 覆盖）

加载时按 1→2→3→4→5 顺序合并；后层覆盖前层。

## 13. 关键决策记录

| # | 决策 | 备选 | 结论理由 |
| --- | --- | --- | --- |
| D1 | 分层默认（standard/premium），可自定义 2-N 层 | 固定两层 / 单一层 | 用户明确提出"贵模型备用"——分层足以覆盖 |
| D2 | tier 由 flow step 显式标注，不做运行时分类 | LLM 自觉分类 / 正则分类 | 避免 silent 切模；让 mission 设计者掌握成本意图 |
| D3 | 熔断冷却按 errorClass 分 base/max + 指数递增 | 统一冷却 / 固定冷却 | quota（5h）vs rate-limit（60s）差 100 倍必须分开；连续失败应递增 |
| D4 | 升级条件 = 当前 tier 全部冷却 > 30min | 全部不可用即升级 / 无升级 | 短冷却时不应浪费贵模型；30min 是经验阈值 |
| D5 | wait-check 永不超时（除非用户 STOP） | 24h 后强制退出 | 用户明确"确保整体绝对不会中断" |
| D6 | 熔断三态（closed/open/half-open），不维护滑窗 | 5 维加权评分 | mission-driver 不需要毫秒级健康度感知；三态足够 |
| D7 | 请求超时（>10min）视为失败 | 不设超时 | 防止 driver 挂死后永远占用资源 |
| D8 | 失败分类基于 error.code，不解析 message | 字符串匹配 | DSH adapter 已归一化；字符串匹配是冗余且易漂移 |
| D9 | 状态持久化分作用域：账号级（circuit 状态）→ `~/.nop/dsh/routing-state.json`；mission 级（paused / stats）→ 内存；配置级（tiers）→ `~/.nop/dsh/routing-config.json` + `missions/base.json:routing` | 项目根目录 / SQLite | routing 是账号级状态，跨项目共享；不同作用域用不同位置 |
| D10 | 旧 config 格式（defaultModel + fallbackModels）向后兼容为单层 tier | 强制迁移 | 不破坏已使用 nop-route 的 mission |
| D11 | wait-check 是默认行为，不可禁用 | 提供 disable 开关 | 全不可用时永不放弃是核心承诺 |
| D12 | permanent:budget + retry-after 提升为 transient:rate-limit | 始终 permanent | provider 返回重试时间说明配额将刷新 |
| D13 | 持久化走 service 层 atomic write（vendor context-profile 12 行模式） | `@deepseek-ai/dsh-atomic-write` / DSH settings | mission-driver 零依赖原则 + 不依赖 DSH host 集成 |
| D14 | circuit 状态 REST 5s 轮询，**不引入 SSE** | SSE 推送 | 状态变化低频（每次 recordFailure/Success），REST 轮询足够 |
| D15 | UI 复用 monitor dashboard 模式（statusTagType / useClock / StepTimeline） | 独立 UI 体系 / slot 注入 | 与 RunList/RunDetail 视觉一致，复用现有 Vue 组件 |
| D16 | 调用统计按 project 维度持久化（`~/.nop/dsh/routing-stats/<hash>.json`），circuit 状态账号级，paused 标志 mission 级 | 全局单维度统计 / 项目级内存不持久化 | 不同项目的成本/性能特征不同；统计需要按项目聚合分析 |
| D17 | token 消耗由调用方传入 `recordCall(model, durationMs, tokensInput, tokensOutput, projectRoot?)` | 路由插件自己统计 | 路由插件无 LLM 调用语义，由调用方提供 |
| D18 | projectRoot 缺省 → 归入 `__global__` 维度 | 强制要求调用方传入 | 兼容 HTTP 调用方和 e2e 测试；调用方有 projectRoot 时应主动传 |
| D19 | mission-driver 当前不调用 nop-route，projectRoot 传入是未来 slice 的责任 | 当前就要 mission-driver 集成 | nop-route 是 programmatic-only 决策服务，集成是 mission-driver 改造的一部分（cross-plugin composition，Deferred） |

## 14. 待澄清问题

| # | 问题 | 状态 |
| --- | --- | --- |
| Q1 | 半开试探（half-open）允许多少并发请求？ | 1 个，超出仍走 closed 模型 |
| Q2 | mission 重启后如何从 wait-check 恢复？ | 沿用 mission-driver run-state 持久化 |
| Q3 | wait-check 期间 monitor 是否仍可用？SSE 心跳如何兼容？ | 沿用现有 SSE，wait-check 状态作为新事件类型 |
| Q4 | 跨 mission 的状态共享边界在哪？ | 全局，routing-state.json 跨 mission 共享 |
| Q5 | "max_retries_per_step" 的语义？ | "尝试 N 个不同模型" |

## 15. Changelog

- 2026-08-31 — **重设计**：加入熔断三态 + 冷却指数递增、分层路由、请求超时、wait-check 永不放弃、用户暂停；移除所有代码骨架和实现伪码（技术细节唯一真相源为代码）
- 2026-08-31 — **追加**：持久化对齐 nop-age context-profile atomic write 模式；UI 复用 monitor dashboard statusTagType/useClock/StepTimeline；调用统计 in-memory 累加（counter + gauge + token 消耗）
- 2026-08-27 — Initial design