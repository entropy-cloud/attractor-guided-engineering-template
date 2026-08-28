---
status: active
mission: multi-plugin-dsh
work-item: M4-WI13+WI14+WI15
group: "2026-08-28-1312"
verify: [test]
---

# 2026-08-28-1312-2 M4-WI13+WI14+WI15 routing-core 编排 + noproute 路由面 + service 挂载 + manifest 增补（M3/M2 Deferred 收编）

> Source: `docs/backlog/multi-plugin-dsh-roadmap.md` M4 WI13/WI14/WI15；设计 owner `docs/design/multi-plugin-dsh-architecture.md` §nop-route Plugin（四路由表 / 设计 invariants / §Plugin Manifest 分期裁定）
> Related: 前置 `2026-08-28-1312-1`（WI9–WI12：三纯模块 + 类型导出在库）；`2026-08-28-0149-3`（M3——其 §Deferred「manifest 的 nop-route 条目增补」由本 plan 收编）；`2026-08-28-0149-2`（M2——其 §Deferred「owner docs 结构性改写」的 §nop-route 半边由本 plan 收编）；后继 `2026-08-28-1312-3`（WI16 e2e）、M5-WI17/WI18（联合挂载语义断言 + 全门收口）

## Current Baseline

- 前置状态（plan `2026-08-28-1312-1` 收口后成立——该 plan 现 `active` 未执行，`plugin/nop-route/` 当前不在库；本 plan 不得先于其执行，见 Phase 1 Prereqs）：`plugin/nop-route/` 骨架 + `error-classifier.ts` / `retry-policy.ts` / `model-selector.ts`（含 `ErrorClass` / `RetryAction` / `ModelSelection` 类型导出）与三真值表在库；`routing-core.ts` / `noproute-routes.ts` / `service.ts` 均不存在（现状与前置后均如此）。
- 接线先例（nop-age 在库实现）：`src/mdcontrol-routes.ts` = wire-method 全名 record → async handlers + `registerMdControlHttpDispatcher(ctx, logger?)` 经 `ctx.get('webServer')` 判缺席（缺席 = 降级 log 行，非挂载失败）+ `/mdcontrol/api/<method>` 前缀注册（better-sidebar `/sidebar/api` 先例）；`src/service.ts` = cordis `Service` 子类发布服务 + `ctx.inject(['webServer'], …)` 可选 HTTP 面 + headless 降级 + mount log。
- 四路由契约（设计 §nop-route 表，全 sync）：`noproute.route`（单次调用结果 → RoutingDecision + 适用时下一模型）、`noproute.classify`（error → ErrorClass）、`noproute.pick-model`（请求描述符 → ModelSelection）、`noproute.health`（版本 + 配置 fallback 链 + 复位以来错误直方图）。
- 状态归属边界：设计 invariant「纯决策函数」= routing-core 及以下三模块无状态；`health` 直方图是有状态计数 → 归 service 层持有（route/classify 调用点累加，`health` 读取，复位语义随 service），纯模块不引入状态。
- `plugin/plugin-manifest.yml` 现状：仅 nop-age 条目（M3 分期裁定）；**M3 plan §Deferred「manifest 的 nop-route 条目增补」重开触发已命中**（`plugin/nop-route/` 在库）——本 plan 收编：增补条目 + 复跑 M3 Phase 3 真宿主四腿（dual manifest 面，scratch profile）。
- 真宿主在场面（M3 实测沿用）：`dsh` CLI / `python3` / shellcheck 0.11.0 在场；起宿主 boot 腿受 bundle 无 `main`/`exports` import 缺口限制（M2-WI4 残险、独立后继项，本 plan 四腿限 mount/dump 面，与 M3-WI8 同 posture——dump 面不受缺口影响）。
- owner docs 现状：`docs/architecture/dsh-plugin-packaging.md` / `docs/design/dsh-plugin-integration.md` / `docs/process/dsh-plugin-development-guide.md` 均无 §nop-route 段——**M2 plan §Deferred「owner docs 结构性改写」的 nop-route 半边由本 plan 收编**（完整两 bundle 结构性改写仍归 M5-WI18）。
- L2 链（plan `2026-08-28-1312-1` 接线落地后——当前 L2 尚无此腿）：`verify-age.sh` L2 含 `npm --prefix plugin/nop-route test`；本 plan 新增测试经 `node --test test/*.test.mjs` glob 自动入链，无需再动 verify-age.sh。

## Goals

- `src/routing-core.ts` 纯编排 `decide(...)` → 4 类 `RoutingDecision`（Retry / Fallback / Transform / Give-up）+ 编排真值表（WI13）。
- `src/noproute-routes.ts` 四方法 wire record + `/noproute/api/*` HTTP dispatcher（headless 降级分支）+ 测试（WI14）。
- `src/service.ts` 挂载：发布 cordis service `noproute`（命名按设计 §Naming Convention：去 `nop-` 前缀 camelCase）+ headless 降级 + mount log + health 直方图状态（WI15）。
- **M3 Deferred 收编**：`plugin/plugin-manifest.yml` 增补 nop-route 条目（config 镜像 bundle patch service-row config）+ 真宿主四腿复跑（dry-run / 挂载 dump / 幂等 / unmount-all 重挂一致，dual manifest 面）。
- **M2 Deferred 收编（半边）**：三 owner docs 增 §nop-route Plugin 段（as-built）。
- roadmap WI13–WI15 勾选回写 + 日志。

## Non-Goals

- 不做 e2e 驱动与 fixture（WI16 归 `2026-08-28-1312-3`）。
- 不做双插件联合语义断言（AGE preset 零服务行、技能三 ID 完好、mdcontrol 唯一挂载——M5-WI17；本 plan 四腿只证 mount/dump/idempotency 端态）。
- 不做 owner docs 完整两 bundle 结构性改写（M5-WI18）；不改 nop-age bundle 与引擎树（`tools/mission-driver/` 零 diff）。
- 不给两 bundle 补 `main`/`exports` 包入口（独立后继项维持原裁定）；不做跨插件组合（设计 Non-Goal）。

## Task Route

- Type: `implementation-only change`（路由/挂载形态由设计文档四路由表 + invariants 钉死；先例 = mdcontrol-routes/service 同形实现）
- Owner Docs: `docs/design/multi-plugin-dsh-architecture.md` §nop-route Plugin / §Plugin Manifest（分期裁定 + 条目形状）；`docs/architecture/dsh-plugin-packaging.md`（service 暴露面先例 + 本 plan 增补对象）；`docs/design/dsh-plugin-integration.md`、`docs/process/dsh-plugin-development-guide.md`（增补对象）
- Skill Selection Basis: 无项目专属 skill 匹配（repo 无 docs/skills 项目面）；真宿主腿方法承 M3-WI8 同 posture——Skill: none

## Infrastructure And Config Prereqs

- `dsh` CLI + `python3` 在场（M3 实测沿用）；scratch profile 名固定 `nop-route-audit`（四腿专用，验证毕清理；`web` profile 不触碰）。
- `PROJECT_ROOT` 环境变量须在四腿执行前 export（manifest `${VAR}` 未定义 = 预检报错，M3 语义）。
- 无凭据、无网络依赖（mount/dump 面不 boot 宿主）。

## Phase 1 — WI13 routing-core.ts 编排层

Targets: `plugin/nop-route/src/routing-core.ts`、`plugin/nop-route/test/routing-core.test.mjs`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: `2026-08-28-1312-1` 收口（三纯模块 + 类型在库）

- [ ] Add: `src/routing-core.ts`——pure `decide(...)` 编排：组合 `classify` / `retryDecision` / `pickModel` 三纯函数 → 4 类 `RoutingDecision`（Retry〔同模型退避重试〕/ Fallback〔换模型〕/ Transform〔不可重试错误的转换错误对象，如 partial 成功提取 `<AI_STEP_RESULT>` marker〕/ Give-up〔原样返回〕，语义逐字对齐设计 §nop-route）；纯组合不重复判别逻辑（判别归三模块，编排只做策略合成与优先级）；导出 `RoutingDecision` 类型；零状态、零墙钟、零随机。
- [ ] Add: `test/routing-core.test.mjs`——编排真值表：4 决策类各 ≥2 例 + 组合边界（可重试类但 attempt 达 `maxRetries` → 不 Retry 的走向、`partial:marker` → Transform、`permanent:*` → Transform/Give-up 分界、transient 类 × fallback 链在库/耗尽两分支）；同输入双跑 bit-identical 断言。
- [ ] Proof: `npm --prefix plugin/nop-route test` exit 0（四测试文件全链）；用例计数落 log。

Exit Criteria:

- [ ] 4 决策类全覆盖且合成优先级被真值表钉死；确定性合同成立（grep 清单落 log）
- [ ] 编排层零判别逻辑重复（模块职责边界：classify/retry/model 各自被独立调用过而非内联重写——code review 面）

## Phase 2 — WI14 noproute-routes.ts 路由层 + HTTP dispatcher

Targets: `plugin/nop-route/src/noproute-routes.ts`、`plugin/nop-route/test/noproute-routes.test.mjs`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [ ] Add: `src/noproute-routes.ts`——`createNopRouteRoutes(deps)` 返回 wire-method 全名 record（`noproute.route` / `noproute.classify` / `noproute.pick-model` / `noproute.health` 四 handler，全 sync 契约）+ `registerNopRouteHttpDispatcher(ctx, logger?)`（`ctx.get('webServer')` 缺席 = 降级 log 行非失败；在场 = `/noproute/api/<method>` 注册，mdcontrol-routes 同形）；参数校验错误以结构化 wire error 返回（mdcontrol 先例）。
- [ ] Add: `test/noproute-routes.test.mjs`——stub `ctx` / `logger` / `webServer`：四方法各正例 + 参数缺失/畸形 deny 形状 + HTTP dispatcher 注册分支（webServer 在场注册形状 / 缺席降级 log 断言）+ health 直方图读写面（经注入的直方图状态对象）。
- [ ] Proof: `npm --prefix plugin/nop-route test` exit 0；`./verify-age.sh` L1+L2+L2.5 全绿。

Exit Criteria:

- [ ] 四路由 handler + HTTP 前缀 + headless 降级分支全部被测试钉死
- [ ] `git diff --stat tools/mission-driver/` 为空（引擎零 diff 自证）

## Phase 3 — WI15 service 挂载 + manifest 增补 + 真宿主四腿 + owner docs

Targets: `plugin/nop-route/src/service.ts`、`plugin/nop-route/test/`（service 挂载测试）、`plugin/plugin-manifest.yml`、三 owner docs、`docs/backlog/multi-plugin-dsh-roadmap.md`、`docs/logs/2026/08-28.md`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 2

- [ ] Add: `src/service.ts`——`apply(ctx, config)`：cordis `Service` 子类发布 **`noproute`**（注册名去前缀 camelCase，设计 §Naming Convention）；wire record 接线（Phase 2 工厂）；`ctx.inject(['webServer'], …)` 可选 HTTP 面 + headless 降级（`ctx.get('webServer')` 缺席 = mount-log 行，非挂载失败）；mount log 落 `nop-route` 包名与 realm；health 错误直方图为 service 层状态（route/classify 调用点累加、`health` 读取、复位语义在 service）；不使用 `ctx.inject(['agents'], …)`（设计钉死：零 dispatch）。
- [ ] Add: service 挂载测试——stub ctx 直调 `apply`（发布形状 + mount log + headless 降级 + 直方图累加/复位三面；具体挂点形态按 nop-age 测试先例在实现期定，断言面如上钉死）。
- [ ] Add: **M3 Deferred 收编**——`plugin/plugin-manifest.yml` 增补 nop-route 条目（`path: ./nop-route`、`realm: nopRoute`、config 镜像 bundle patch service-row config：`defaultModel` / `maxRetries` / `fallbackModels`——drift 面由四腿 dump 对照钉住）；分期注记更新（manifest 现声明全部在库 bundle）。
- [ ] Proof: **真宿主四腿复跑（M3 Phase 3 同姿势，dual manifest 面，scratch profile `nop-route-audit`）**：① `./plugin/load-plugins.sh --dry-run`（需 `PROJECT_ROOT` export）计划命令含两条 add 且零执行；② `--no-start --profile nop-route-audit` 挂载后 `dsh web --no-open --profile nop-route-audit --dump-config | grep nop-` 同时命中 `# == nop-age`（`isolate: { nopAge: true }`）与 `# == nop-route`（`isolate: { nopRoute: true }` / `id: nop-route-service`）；③ 二次执行全 already-present（幂等）；④ `--unmount-all` → 重挂 dump 与首挂 `diff` 为空；验毕清理（`dsh plugin --profile nop-route-audit list` 空 + profile 目录删除）。
- [ ] Add: **M2 Deferred 收编（nop-route 半边）**——`docs/architecture/dsh-plugin-packaging.md` / `docs/design/dsh-plugin-integration.md` / `docs/process/dsh-plugin-development-guide.md` 各增 §nop-route Plugin 段（as-built：目录形状、realm `nopRoute`、服务名 `noproute`、四路由、零宿主调用纪律、headless 降级；完整两 bundle 结构性改写注记归 M5-WI18）。
- [ ] Add: roadmap WI13 / WI14 / WI15 行 `[ ]`→`[x]` + 行内证据注记（编排真值表、路由面测试、挂载 + 四腿证据摘要 + 两 Deferred 收编指针）；`> Last Updated` 头同步；roadmap-check exit 0。
- [ ] Add: `docs/logs/2026/08-28.md` 收口条目（三 Phase 证据 + 四腿输出摘要 + scratch profile 清理证明）。

Exit Criteria:

- [ ] `npm --prefix plugin/nop-route test` 全绿（含 service 挂载测试）；`./verify-age.sh` 全门 GREEN
- [ ] 四腿证据在 log：dual dump 两 realm 并存、幂等、端态一致、profile 清理
- [ ] manifest nop-route 条目在库且 config 与 bundle patch 零漂移；三 owner docs §nop-route 段在库
- [ ] roadmap WI13–WI15 `[x]` + 证据在册；roadmap-check exit 0

## Draft Review Record

- dispatch review #review-2026-08-28-104553-mission-driver-2026-08-28-1312-2-m4-wi13-wi15-noproute-wiring-mount-1-3222a9fd to ses_opencode_draft_review
- 2026-08-28：iteration 1，共识 acceptable-after-fix #review-2026-08-28-104553-mission-driver-2026-08-28-1312-2-m4-wi13-wi15-noproute-wiring-mount-1-3222a9fd

## Verification

## Closure

## Deferred But Adjudicated

### owner docs 完整两 bundle 结构性改写

- Classification: `out-of-scope improvement`（M2 plan §Deferred 的剩余半边——本 plan 仅落 §nop-route 增量段）
- Why Not Blocking Closure: M5-WI18 收口时同步回写设计/架构 doc 才能写出完整 as-built 终态（联合挂载证据 + 全门 GREEN）；提前改写会预写未验证内容。
- Successor Required: yes（M5-WI18）
- 重开触发：M5-WI17 四腿 + WI18 全门收口完成。
