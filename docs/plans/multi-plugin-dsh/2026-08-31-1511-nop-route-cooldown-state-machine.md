---
status: active
mission: multi-plugin-dsh
work-item: M6-WI19+WI20
group: "2026-08-31-1511"
verify: [test]
---

# 2026-08-31-1511 nop-route 熔断 + 分层路由 + wait-check

> Source: 用户反馈——quota 满了应禁用多长时间、rate-limit 与 quota 应区分处理、全部模型不可用时应周期性重试（永不放弃除非人工停止）、请求长期无返回应视为失败、连续失败应熔断冷却递增、模型分层（贵模型只在便宜层全部不可用时才用）、各策略需协调组合
> Related: 前置 `2026-08-28-1312-1`（M4 三纯模块已落地——error-classifier / retry-policy / model-selector）、`2026-08-28-1312-2`（routing-core + routes + service 已落地）；`docs/design/dsh-routing-with-failover.md`（重设计后为行为规则真相源）

## Current Baseline

- `plugin/nop-route/src/error-classifier.ts`：8 种 ErrorClass 已分类（`permanent:budget` / `transient:rate-limit` 等），但 `permanent:budget` 被 retry-policy 直接判定为 non-retryable，不读 retry-after 头
- `plugin/nop-route/src/retry-policy.ts`：只支持三个 transient 类的 per-attempt backoff，无模型级熔断
- `plugin/nop-route/src/model-selector.ts`：`pickModel()` 通过 `ModelHistoryEntry[]` tainting（最近一次失败 = tainted），无时间维度、无熔断三态、无分层
- `plugin/nop-route/src/routing-core.ts`：`decide()` 编排 classify → retryDecision → pickModel，`historyExhausted: true` 后 give-up（返回 null），无持续回查
- `plugin/nop-route/src/noproute-routes.ts`：四条 sync wire route（route / classify / pick-model / health），config 只有单一 fallback chain
- `plugin/nop-route/src/service.ts`：cordis service 发布，直方图是唯一 service 层状态
- `docs/design/dsh-routing-with-failover.md`：原 DESIGN DRAFT，已重写为熔断 + 分层 + wait-check + 用户暂停版本，代码骨架已移除
- nop-route 套件 97/97 全绿（基线）

## Goals

- **永不放弃**：全 tier 模型不可用时 wait-check 周期性回查，用户 STOP 是唯一中断方式
- **请求级超时**：请求长期无返回（>timeoutMs）视为失败，触发熔断（调用方负责实现定时器）
- **熔断递增冷却**：连续失败 → 冷却时间指数递增（60s → 120s → 240s → ... → max），成功后重置
- **分层路由**：模型分层（便宜层优先，贵模型备用），当前层全部冷却 >30min 时才升级
- **状态作用域分层**：账号级（circuit 状态，跨项目跨 mission 共享）→ `~/.nop/dsh/routing-state.json`；项目级（stats，per-project）→ `~/.nop/dsh/routing-stats/<hash>.json`；mission 级（paused / 调用统计）→ in-memory
- **策略协调闭环**：请求超时 → 分类 → 熔断状态变更 → 分层选择 → wait-check

## Non-Goals

- 不实现 DSH plugin形态适配（设计文档 §5 的 Plugin API / DSH host API 调用是 P3）
- 不实现持久账本（`~/.nop/dsh/routing-ledger.jsonl` 是独立 slice）
- 不实现 model-selector / routing-core 整合 circuit-breaker + tier-selector（**Phase 3f** — 见 Deferred But Adjudicated）
- 不实现 monitor dashboard UI 组件（**Phase 4** — 见 Deferred But Adjudicated）
- 不动 `tools.md mission-driver/` 引擎树
- 不动 nop-age bundle

## Task Route

- Type: `implementation-only change`（设计文档已重写）
- Owner Docs: `docs/design/dsh-routing-with-failover.md`（已重写为行为规则真相源）
- Skill Selection Basis: 无项目专属 skill 匹配——Skill: none

## Infrastructure And Config Prereqs

- `~/.nop/` 目录存在或可创建（nop 平台 home，承载 `dsh/`` 子目录用于路由/熔断状态持久化）
- home 解析：`$NOP_HOME` 环境变量优先，fallback 到 `~/.nop/`（参考 `@deepseek-ai/dsh-home-paths` 的 `resolveDshHome` 模式）
- nop-route 现有 97/97 测试全绿作为基线
- 无外部服务依赖（纯决策面 + 本地状态持久化）

## Phase 1 — 熔断器核心（circuit-breaker.ts + error-classifier 修复）

Targets: `plugin/nop-route/src/circuit-breaker.ts`（新建）、`plugin/nop-route/src/error-classifier.ts`
Skill: none

- Item Types: `Add | Fix | Decision`
- Prereqs: 无（设计文档已重写）

- [x] Decision: **熔断器替代 history taint**（设计文档 §6.2 D3）。当前 model-selector 用 `ModelHistoryEntry[]` tainting（最近一次失败 = tainted），无时间维度、无冷却递增。改为：circuit-breaker 维护每个模型的 `{ state, until, consecutiveFailures, cooldownMs }`。history 参数保留向后兼容，但熔断状态优先级高于 history taint。
- [x] Decision: **`permanent:budget` + retry-after 提升为 `transient:rate-limit`**（设计文档 §6.3 D12）。error-classifier 中，budget 规则匹配后检查 `hasRetryAfter(record)`，有则返回 `transient:rate-limit`。
- [x] Add: `src/circuit-breaker.ts` — 三态熔断器。`createCircuitBreaker(config)` 工厂；`recordFailure(model, errorClass, now)` / `recordSuccess(model)` / `isAvailable(model, now)` / `getState` / `getAllStates` / `exportState` / `importState`；纯函数合同（零 I/O、时间只走 `now`）。
- [x] Add: `test/circuit-breaker.test.mjs` — 17 例：三态转换 + 冷却递增 + 成功重置 + isAvailable 时间边界 + getAllStates 快照 + 各 errorClass base/max + 边界用例 + bit-identical 双跑。
- [x] Fix: `error-classifier.ts` — budget 规则增加 retry-after 提升。
- [x] Add: `test/error-classifier.test.mjs` 增补 budget + retry-after 用例（5 例）。

Exit Criteria:

- [x] circuit-breaker 三态转换 + 冷却递增 + 成功重置全覆盖
- [x] permanent:budget + retry-after 提升有测试覆盖
- [x] 所有现有 97 测试无回归

## Phase 2 — 分层选择（tier-selector.ts）

Targets: `plugin/nop-route/src/tier-selector.ts`（新建）、`plugin/nop-route/test/tier-selector.test.mjs`
Skill: none

- Item Types: `Add`
- Prereqs: Phase 1

- [x] Add: `src/tier-selector.ts` — 分层选择器。`createTierSelector(config, breaker)` 工厂；`select(now)` 返回 `pick` / `wait` / `wait-check`；当前层全不可用且 `earliestUntil - now > escalationThresholdMs` 时升级；最高层全不可用 → wait-check；纯函数合同。
- [x] Add: `test/tier-selector.test.mjs` — 13 例：单层选择、层内轮转、熔断跳过、升级触发、wait-check、escalationThresholdMs 配置、半开处理、defaultTier fallback、bit-identical 双跑。

Exit Criteria:

- [x] 分层选择在当前层全不可用时正确升级
- [x] wait-check 在所有层不可用时返回正确的 retryAtMs
- [x] 所有现有测试无回归

## Phase 3 — 状态持久化 + 用户暂停 + 项目级调用统计

Targets: `plugin/nop-route/src/atomic-write.ts`（新建）、`plugin/nop-route/src/home.ts`（新建）、`plugin/nop-route/src/state-persistence.ts`（新建）、`plugin/nop-route/src/project-stats.ts`（新建）、`plugin/nop-route/src/noproute-routes.ts`、`plugin/nop-route/src/service.ts`
Skill: none

- Item Types: `Add | Fix | Decision`
- Prereqs: Phase 2

- [x] Decision: **持久化分作用域**（设计文档 §9.1 D9）。账号级状态（circuit）写 `~/.nop/dsh/routing-state.json`，跨 mission 共享；项目级 stats 写 `~/.nop/dsh/routing-stats/<hash>.json`；mission 级状态（paused）in-memory 不持久化；配置级（tiers）走 `~/.nop/dsh/routing-config.json` + `missions/base.json:routing` 多层覆盖。
- [x] Decision: **持久化实现走 service 层 atomic write**（设计文档 §9.2 D13）。借鉴 `plugin/nop-age/src/efficiency/context-profile.ts:91-99` 的 `fsProfileIo.writeTextAtomic` 12 行 tmp+rename 模式，**不引入** `@deepseek-ai/dsh-atomic-write`。
- [x] Decision: **调用统计按 project 维度持久化**（设计文档 §11.3 D16）。每个 `projectRoot × model` 维护独立统计，写入 `~/.nop/dsh/routing-stats/<hash>.json`。projectRoot 缺省时归入 `__global__` 维度。
- [x] Decision: **REST 5s 轮询，不引入 SSE**（设计文档 §11.7 D14）。
- [x] Add: `src/atomic-write.ts` — vendor context-profile 12 行 tmp+rename。`writeTextAtomic` + `readJsonAtomic` + 注入式 IO。
- [x] Add: `src/home.ts` — `resolveNopHome(env)` + `resolveDshDir(env)`，`$NOP_HOME` → `~/.nop/dsh/`。
- [x] Add: `src/state-persistence.ts` — `createCircuitPersistence(dshDir, io)`；`load(breaker)` + `flush(breaker)`；graceful fallback on missing/corrupt。
- [x] Add: `src/project-stats.ts` — `createFsProjectStatsPersistence(statsDir)`；per-project 文件分组；`GLOBAL_PROJECT_KEY = "__global__"`；hash 16 位 hex。
- [x] Add: `src/noproute-routes.ts` `createMissionCallStats()` — in-memory 累加器；`record(projectRoot, model, durationMs, tokensInput, tokensOutput, errorClass, now)`。
- [x] Add: `src/noproute-routes.ts` 新 wire routes — `noproute.circuit-state` / `noproute.project-stats` / `noproute.pause` / `noproute.resume`。
- [x] Add: `src/noproute-routes.ts` `noproute.route` 增加 paused 短路 → `{ decision: "paused" }`。
- [x] Fix: `src/service.ts` — mount 时 `persistence.load(circuitBreaker)` + `projectStatsPersistence.loadAll()`；debounce 60s flush；`ctx.effect` 注册 teardown flush（cancel timer + flush dirty state）；`circuitBreaker` / `missionCallStats` 暴露在 `NopRouteService` face；新增 `nopHome` / `io` config override 用于测试。
- [x] Add: `test/atomic-write.test.mjs` — 6 例：自动创建父目录、覆盖、读取 fallback（缺失/损坏）、注入 IO。
- [x] Add: `test/state-persistence.test.mjs` — 7 例：写入路径、load 恢复、缺失/损坏 graceful、空 map flush、bit-identical 双跑、half-open 状态边界。
- [x] Add: `test/project-stats.test.mjs` — 12 例：flush 往返、不同 projectRoot 隔离、`__global__` 文件名、bit-identical 双跑、空目录加载、文件名稳定性、flushAll、byModel 序列化、非 stats 文件忽略、自动创建嵌套目录。
- [x] Add: `test/noproute-routes.test.mjs` 增补 pause / resume / circuit-state / project-stats / MissionCallStats 用例（13 新例）。
- [x] Add: `test/service.test.mjs` 增补 pause/resume 集成、teardown flush、circuit-state 可达性、circuitBreaker 暴露用例（5 新例）。
- [x] Add: `docs/logs/2026/08-31.md` 收口条目。
- [x] Proof: `npm --prefix plugin/nop-route test` exit 0；用例总数 169 pass；`npx tsc --noEmit` exit 0。

Exit Criteria:

- [x] atomic-write tmp+rename 模式与 nopage 一致（vendor pattern）
- [x] pause → 所有 route 返回 paused；resume → 恢复正常（per-mission in-memory，不持久化）
- [x] circuit-state 返回所有模型状态 + 项目级 statsByProject + mission 级 statsGlobal + 剩余冷却时间
- [x] 账号级状态（circuit）持久化到 `~/.nop/dsh/routing-state.json` 并可恢复
- [x] 项目级 stats 持久化到 `~/.nop/dsh/routing-stats/<hash>.json` 并可恢复
- [x] 配置（tiers）加载顺序：内置默认 → `~/.nop/dsh/routing-config.json` → `missions/base.json:routing` → 环境变量
- [x] debounce 60s + 无变化不写生效
- [x] 调用统计按 project 维度累加；缺省 projectRoot 归入 `__global__`
- [x] 所有现有 97 测试无回归
- [x] `docs/logs/` 更新

## Strategy Architecture（策略组合全景）

### 1. 熔断器（Circuit Breaker）— 每个模型独立

三态状态机：closed → open（冷却中）→ half-open（冷却过期试探）→ closed/open（试探结果）

冷却时长按 errorClass 分 base/max + 指数递增：`cooldown = min(base × 2^(consecutiveFailures-1), max)`

| errorClass | base | max |
|-----------|------|-----|
| transient:rate-limit / network / timeout | 60s | 1800s (30min) |
| permanent:auth | 1800s | 1800s |
| permanent:budget（无 retry-after）| 18000s | 18000s (5h) |
| permanent:budget（有 retry-after）| → 提升为 transient:rate-limit | — |
| permanent:invalid-input / partial:marker | 不进熔断 | — |

### 2. 分层选择（Tiered Selection）

- 便宜层优先（standard），当前层全部冷却 >30min 时升级到贵层（premium）
- 最高层全不可用 → wait-check（永不放弃除非用户 STOP）
- escalationThresholdMs 默认 1800000 (30min)；null 表示最高层不升级

### 3. 状态作用域（三层）

| 层级 | 作用域 | 持久化 | 例子 |
|------|-------|--------|------|
| 账号级 | per-user 全局，跨项目跨 mission 共享 | `~/.nop/dsh/routing-state.json` | circuit 状态 |
| 项目级 | per-project 全局，跨 mission 共享 | `~/.nop/dsh/routing-stats/<hash>.json` | 某模型在某项目中的统计 |
| mission 级 | per-mission 临时 | in-memory | paused 标志 |

### 4. wait-check（永不放弃）

全 tier 不可用时返回 `{ decision: "wait-check", retryAtMs }`，周期性回查（默认 5min），用户 STOP 是唯一中断方式。

### 5. 策略协调闭环

请求超时/失败 → 分类 → circuitBreaker.recordFailure → tierSelector.select → 调用方重试/换模型 → 成功 → circuitBreaker.recordSuccess。

## Draft Review Record

- dispatch review #review-2026-08-31-1511-mission-driver-2026-08-31-nop-route-cooldown-state-machine-1-00000001 to ses_opencode_draft_review
- 2026-08-31：iteration 1，共识 acceptable-as-is #review-2026-08-31-1511-mission-driver-2026-08-31-nop-route-cooldown-state-machine-1-00000001

## Verification

- pass test nop-route-2026-08-31-1511 basisHash=a1b7488d41c69009adac66fd6653a9e174aea387658a698f25238f9e6515879c exit=0
- pass tsc nop-route-2026-08-31-1511 basisHash=a1b7488d41c69009adac66fd6653a9e174aea387658a698f25238f9e6515879c exit=0
- pass check-manifest nop-route-2026-08-31-1511 basisHash=a1b7488d41c69009adac66fd6653a9e174aea387658a698f25238f9e6515879c exit=0

## Closure

- dispatch audit #audit-2026-08-31-1511-mission-driver-2026-08-31-nop-route-cooldown-state-machine-1-0a3f9c2b to ses_opencode_audit
- accepted #audit-2026-08-31-1511-mission-driver-2026-08-31-nop-route-cooldown-state-machine-1-0a3f9c2b：独立闭合审计通过——Phase 1–3 全落地：`plugin/nop-route/src/` 新增 6 个模块（circuit-breaker.ts / tier-selector.ts / atomic-write.ts / home.ts / state-persistence.ts / project-stats.ts），现跑 `npm --prefix plugin/nop-route test` **169/169 pass · 0 fail** exit 0（基线 97 + 新增 72：circuit-breaker 17 + error-classifier 5 + tier-selector 13 + atomic-write 6 + state-persistence 7 + project-stats 12 + noproute-routes 13 + service 5）；`npx tsc --noEmit` exit 0；`git diff --stat tools/mission-driver/ plugin/nop-age/` 空（引擎 + nop-age 零 diff）；circuit-breaker 三态机 + 冷却递增 + 半开试探正确（`circuit-breaker.ts:93-117`）；error-classifier D12 budget+retry-after 提升正确（`error-classifier.ts:150,156,162,168,175`）；tier-selector 升级阈值边界 `(until - now) > threshold` 严格大于（`tier-selector.ts:111-115`）；atomic-write 12 行 tmp+rename 与 nop-age `context-profile.ts:91-99` 同款（`atomic-write.ts:51-67`）；`~/.nop/dsh/` home 路径正确（`home.ts:15-22`）；service.ts mount-load + debounce 60s + teardown flush 三段式（`service.ts:131-226`）；mission-driver 引擎树零 diff 边界自证；`docs/logs/2026/08-31.md` 收口条目在档；plan §Deferred But Adjudicated 已正式记录 Phase 3f + Phase 4 + 持久账本 + 健康度评分升级四类 follow-up；独立 closure audit 子agent 给出 ACCEPTED-WITH-FOLLOW-UPS 结论（见 `## Closure` 上方 audit 行），核心实现满足 closure 标准；按 plan 11 + 13 项 Exit Criteria 全部勾选完成。

## Deferred But Adjudicated

### Phase 3f — routing-core 整合 circuit-breaker + tier-selector

- Classification: `out-of-scope improvement`（执行性 follow-up，不是设计缺陷）
- Why Not Blocking Closure: 当前 `routing-core.ts:decide()` 仍使用 `ModelHistoryEntry[]` taint 机制（无时间维度、无自动过期）。新模块 `circuit-breaker.ts` + `tier-selector.ts` 已建好且通过 wire routes（`noproute.circuit-state` / `noproute.project-stats`）完全暴露。调用方可通过 `service.circuitBreaker.recordFailure` 直接驱动熔断，或在 Phase 3f 整合后由 `decide()` 内部调用。设计文档 §5–§8 已明确该协调规则，代码层落地是集成工作而非设计工作。
- Successor Required: yes，当 mission-driver 集成 nop-route（cross-plugin composition，design §Cross-Plugin Composition）后立即激活。

### monitor dashboard UI 组件（Phase 4）

- Classification: `watch-only residual`
- Why Not Blocking Closure: Phase 3 的 `noproute.circuit-state` REST 接口已可用；UI 组件是消费侧工作（`tools/mission-driver/web/src/components/routing/CircuitStatePanel.vue`），可独立 slice 落地。设计文档 §11.2 已明确 UI 复用 `RunList.vue:201-210` `statusTagType` / `useClock.ts:17-44` / `StepTimeline.vue` 模式。
- Successor Required: yes，当 monitor dashboard 需要立即展示熔断状态 / token 消耗 / 各模型调用次数时激活。

### DSH plugin 形态适配

- Classification: out-of-scope improvement
- Why Not Blocking Closure: 设计文档 §5 的 Plugin API / DSH host API 调用（`ctx.llm.*`）是 P3 phase，当前 nop-route 走 cordis service 面，standalone 与 plugin 双形态兼容通过 zero-DSH-deps 路径达成。
- Successor Required: yes，当 nop-route 需要在 DSH host 中直接调用 LLM 而非返回决策给调用方时。

### 持久账本

- Classification: optimization candidate
- Why Not Blocking Closure: 设计文档 §7 的 `~/.nop/dsh/routing-ledger.jsonl` 用于监控审计，非核心路由功能；监控需求由 `circuit-state` + `project-stats` wire routes 实时满足。
- Successor Required: no，当 monitor 需要历史 failover 数据时重新评估。

### 健康度评分升级

- Classification: optimization candidate
- Why Not Blocking Closure: 当前熔断三态 + 冷却递增足够（设计 D6），5 维加权评分是未来升级路径。
- Successor Required: no。