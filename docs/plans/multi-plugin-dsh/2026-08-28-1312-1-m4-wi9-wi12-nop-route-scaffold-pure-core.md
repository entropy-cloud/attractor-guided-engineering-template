---
status: active
mission: multi-plugin-dsh
work-item: M4-WI9+WI10+WI11+WI12
group: "2026-08-28-1312"
verify: [test]
---

# 2026-08-28-1312-1 M4-WI9+WI10+WI11+WI12 nop-route 脚手架 + 纯决策核心三模块（error-classifier / retry-policy / model-selector）

> Source: `docs/backlog/multi-plugin-dsh-roadmap.md` M4 WI9/WI10/WI11/WI12；设计 owner `docs/design/multi-plugin-dsh-architecture.md` §nop-route Plugin（§Directory Layout / §Naming Convention / §Isolate Realm Convention；纯函数纪律与 module-named 真值表命名由 M1 doc-audit 钉死）
> Related: 前置 `2026-08-28-0149-2`（M2 迁移——plugin/nop-age/ 在库，为脚手架先例）、`2026-08-28-0149-3`（M3——plugin-manifest.yml 分期仅 nop-age、L2 接线先例）；后继 `2026-08-28-1312-2`（WI13+WI14+WI15 接线挂载面）、`2026-08-28-1312-3`（WI16 e2e）

## Current Baseline

- `plugin/nop-route/` 不存在——M4 全部 WI 的对象目录空白；`plugin/` 现状 = `load-plugins.sh` + `plugin-manifest.yml`（M3 分期裁定：仅声明 nop-age 一条）+ `nop-age/` + `test/load-plugins.test.mjs`（18 例，已接 verify-age.sh L2）。
- 脚手架先例 = nop-age bundle：`package.json`（`private` / `type: module` / `engines: "^22.19 || >=24"`〔Node 原生 TS type-stripping 供 test 直 import `src/*.ts`〕/ `dsh.bundle.patch: "./cordis.patch.yml"` / scripts 链 `check:manifest` → `node --test test/*.test.mjs` → `tsc --noEmit` → `build-bundle --check` → `smoke-import`）；`tsconfig.json`（strict / allowImportingTsExtensions / allowJs）；`scripts/check-manifest.mjs`（三段结构校验：`dsh.bundle.patch` 字段名逐字 → patch YAML 可解析〔devDep `yaml`〕→ `insert` → `cordis:group` + `isolate` truthy key → service row 字符串 id/name）；`test/bundle-scaffold.test.mjs`（骨架结构断言先例）。
- nop-route 与 nop-age 的面差异（设计钉死）：无 `assets/`/law 面 → 无 `build-bundle` / `smoke-import` 腿；无 `preset/`（nop-route 不注册 agent preset）；零宿主调用纪律（设计 §nop-route invariants：不 dispatch child agents，仅暴露决策服务）→ 依赖面可远小于 nop-age 全量 dsh-* deps。
- ErrorClass 口径：roadmap WI10 记「7 种 ErrorClass」，设计 §nop-route 路由表列 8 值 = 7 分类（`transient:network` / `transient:rate-limit` / `transient:timeout` / `permanent:auth` / `permanent:invalid-input` / `permanent:budget` / `partial:marker`）+ `unknown` 兜底——本 plan 按设计口径执行（7 分类 + unknown），回写时注记口径对齐。
- 真值表测试先例与命名（M1 doc-audit 裁定）：module-named `error-classifier.test.mjs` / `retry-policy.test.mjs` / `model-selector.test.mjs`（`routing-core.test.mjs` 归 WI13 后继 plan）；`node --test`；确定性合同 = 纯函数不读墙钟/不掷随机（时间与历史全走入参，fake clock 在测试侧）+ 同输入 bit-identical 输出。
- CI/L2 现链：`verify-age.sh` L2 = `npm ci --prefix plugin/nop-age`（on demand）+ `npm --prefix plugin/nop-age test` + `node --test plugin/test/load-plugins.test.mjs`；`.github/workflows/age-ci.yml` 触发路径含 `plugin/nop-age/**` 但无 `plugin/nop-route/**`——新 bundle 不触发 CI 也不被 L2 覆盖，本 plan 接线（两文件均为仓库基础设施面，非引擎代码——设计 face (b) 裁定，引擎树零 diff 不受影响）。
- 前序 plans Deferred 筛查：M3 plan「manifest 的 nop-route 条目增补」重开触发 = `plugin/nop-route/` 在库——Phase 1 落目录后触发命中，但收编归属已裁定为 M4-WI15 挂载面 plan（本 plan 不动 manifest，见 Non-Goals）；M2 plan「owner docs 结构性改写」同归 M4-WI15/M5-WI18。无本 plan 须收编项。
- 基础设施在场面（M3 实测沿用）：`dsh` CLI、`python3`、shellcheck 0.11.0 均在场；本 plan 不需要真宿主腿。

## Goals

- `plugin/nop-route/` bundle 骨架落地（WI9）：package.json + package-lock.json + cordis.patch.yml + scripts/check-manifest.mjs + tsconfig.json + test 入口 + bundle-scaffold 结构测试，并接入 verify-age.sh L2 与 age-ci.yml 触发面。
- 三个纯决策模块 + module-named 真值表各 ≥10 例全绿（WI10/WI11/WI12）：`src/error-classifier.ts`、`src/retry-policy.ts`、`src/model-selector.ts`——确定性合同成立（零墙钟、零随机、同输入 bit-identical）。
- roadmap WI9–WI12 勾选回写 + 日志。

## Non-Goals

- 不动 `plugin/plugin-manifest.yml`（nop-route 条目增补 = M3 Deferred，归 M4-WI15 挂载面 plan `2026-08-28-1312-2`）。
- 不实现 `routing-core.ts` / `noproute-routes.ts` / `service.ts`（WI13/WI14/WI15 归后继 plan）。
- 不做 e2e（WI16 归 `2026-08-28-1312-3`）。
- 不改 `plugin/nop-age/` 与引擎树（`tools/mission-driver/` 零 diff；verify-age.sh / age-ci.yml 增腿是仓库基础设施面，M3 先例）。
- 不给 package.json 声明 `main`/`exports`（见 Phase 1 Decision——真宿主 boot import 缺口是已留档的独立后继项，不在本 plan 引入未实测的入口语义）。

## Task Route

- Type: `implementation-only change`（模块形态、命名、测试门槛均已由设计文档 + M1 doc-audit + roadmap 钉死）
- Owner Docs: `docs/design/multi-plugin-dsh-architecture.md` §nop-route Plugin / §Directory Layout / §Naming Convention / §Isolate Realm Convention；`docs/architecture/dsh-plugin-packaging.md`（bundle 骨架结构先例）
- Skill Selection Basis: 无项目专属 skill 匹配纯函数交付与 bundle 脚手架（repo 无 docs/skills 项目面）；验证方法由本 plan Proof 项承载——Skill: none

## Infrastructure And Config Prereqs

- npm registry 网络可达（一次性：生成 `plugin/nop-route/package-lock.json` 并安装 devDeps；后续 CI/本地走 `npm ci`）。
- Node ≥ 23.6 type-stripping 由 engines pin `^22.19 || >=24` 表达（与 nop-age 一致）。
- 无凭据、无真宿主、无外部服务依赖（纯决策面）。

## Phase 1 — WI9 bundle 脚手架 + L2/CI 接线

Targets: `plugin/nop-route/`（package.json、package-lock.json、cordis.patch.yml、tsconfig.json、scripts/check-manifest.mjs、test/bundle-scaffold.test.mjs）、`verify-age.sh`、`.github/workflows/age-ci.yml`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 无（M1–M3 已收口；`plugin/nop-age/` 在库为先例）

- [x] Decision: **依赖集最小化**——`dependencies` 仅 `@deepseek-ai/cordis`（@4.0.1，对齐 nop-age pin；Service/Context 为 service.ts 唯一运行时需求）；`devDependencies` 仅 `typescript` / `@types/node` / `yaml`（check-manifest 解析用；版本对齐 nop-age pin）。备选（照抄 nop-age 全量 dsh-* deps）否决：nop-route 零宿主调用纪律下多余依赖徒增 lockfile 面与攻击面；后续确需（如 WI16 e2e 的 `@deepseek-ai/dsh-app-boot`）由后继 plan 增补。残险：无——依赖只增不减，增补点在后续 plan 内显式化。
- [x] Decision: **package.json 不声明 `main`/`exports`**——镜像 nop-age 现状。真宿主 boot 的 bundle import 缺口（`Cannot find package …/index.js`，M2-WI4 留档、M3-WI8 复命中）是跨两 bundle 的独立后继项，本 plan 不单方面引入未实测的入口语义；in-process 面（测试、WI16 e2e）走 fixture 相对路径直指 `src/service.ts`（nop-age e2e 先例），不依赖包入口。
- [x] Decision: **test script 链** = `node scripts/check-manifest.mjs && node --test test/*.test.mjs && tsc --noEmit`——无 `build-bundle --check` / `smoke-import` 腿（nop-route 无 assets 面，两腿语义不适用）。
- [x] Add: `plugin/nop-route/package.json` 落档（Decision 固化内容 + scripts 链 + engines pin + `dsh.bundle.patch`）+ `npm install` 生成并提交 `package-lock.json`。
- [x] Add: `plugin/nop-route/cordis.patch.yml`——镜像 nop-age 形状：`- insert:` → `id: nop-route` + `name: cordis:group` + `group: true` + `isolate: { nopRoute: true }`（realm key 命名按设计 §Isolate Realm Convention）→ config row `id: nop-route-service` + `name: nop-route` + config `{ defaultModel, maxRetries, fallbackModels }`（值对齐设计 §Plugin Manifest 例：`zhipuai-coding-plan/glm-5.2` / `3` / `[zhipuai-coding-plan/glm-4.6]`）；头注指向设计文档与本 plan。
- [x] Add: `plugin/nop-route/tsconfig.json`（对齐 nop-age：strict / noEmit / allowImportingTsExtensions / allowJs / include `src/**/*.ts` + `test` 面按 nop-age 先例覆盖）。
- [x] Add: `plugin/nop-route/scripts/check-manifest.mjs`——从 nop-age 适配：三段结构校验原样，isolate key 期待值改为 truthy `nopRoute`，service row id/name 期待 `nop-route-service` / `nop-route`；头注改指 nop-route。
- [x] Add: `plugin/nop-route/test/bundle-scaffold.test.mjs`——骨架结构断言（nop-age 同名先例适配：package.json 关键字段、patch 形状、tsconfig 在库、scripts 链完整性）。
- [x] Add: `verify-age.sh` L2 增腿——`npm ci --prefix plugin/nop-route`（on demand，镜像 nop-age 段）+ `npm --prefix plugin/nop-route test`；`.github/workflows/age-ci.yml` push/pull_request 两处 paths 增 `'plugin/nop-route/**'`。
- [x] Proof: `npm --prefix plugin/nop-route test` exit 0（check-manifest + bundle-scaffold + tsc 三面）；`./verify-age.sh` L1+L2+L2.5 全绿（nop-route 腿并入后整链无回归）；`git diff --stat tools/mission-driver/` 为空（引擎零 diff 边界自证）。

Exit Criteria:

- [x] bundle 骨架六件套在库且 `npm --prefix plugin/nop-route test` 绿；`npm ci --prefix plugin/nop-route` 可从 lockfile 干净重装
- [x] verify-age.sh L2 含 nop-route 腿后全门 GREEN；age-ci.yml 触发面含 `plugin/nop-route/**`
- [x] 引擎树零 diff；`plugin/nop-age/` 零触碰

## Phase 2 — WI10 error-classifier.ts + 真值表

Targets: `plugin/nop-route/src/error-classifier.ts`、`plugin/nop-route/test/error-classifier.test.mjs`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [x] Add: `src/error-classifier.ts`——pure `classify(error): ErrorClass`；导出 `ErrorClass` 类型（7 分类 + `unknown` 兜底，值集逐字对齐设计 §nop-route 路由表）；判别输入面 = 传入 error 对象的结构字段（code / status / message 形状 / retry-after 头等），具体判别规则在模块内成文并由真值表钉死；零墙钟、零随机、零外部 I/O。
- [x] Add: `test/error-classifier.test.mjs`——真值表 ≥10 例：7 分类各 ≥1 正例 + 边界用例（空对象 / 缺字段 / 未知 code / 同形冲突字段优先级 / `unknown` 兜底命中）；同输入双跑 bit-identical 断言。
- [x] Proof: `npm --prefix plugin/nop-route test` exit 0；用例计数实测落 log（`node --test` 报告数 ≥10）。

Exit Criteria:

- [x] 7 分类 + unknown 全覆盖且每类至少一例断言通过；用例数 ≥10 实测
- [x] 确定性合同成立（无 `Date.now` / `Math.random` / 文件与网络 I/O——grep 自证清单落 log）

## Phase 3 — WI11 retry-policy.ts + 真值表

Targets: `plugin/nop-route/src/retry-policy.ts`、`plugin/nop-route/test/retry-policy.test.mjs`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 2

- [x] Add: `src/retry-policy.ts`——pure `retryDecision(error, attempt, config, now?): RetryAction`（导出 `RetryAction` 类型）：`maxRetries` 边界（达到即不给 retry）、退避曲线计算、`retry-after` 头优先于曲线退避、不可重试 ErrorClass 短路；时间全走入参（默认参数亦不读墙钟——fake clock 在测试侧注入）。
- [x] Add: `test/retry-policy.test.mjs`——真值表 ≥10 例：`maxRetries` 边界（0 / 中位 / 达到）、退避曲线采样点、`retry-after` 覆盖与缺省两分支、不可重试类短路、attempt 单调递增面。
- [x] Proof: `npm --prefix plugin/nop-route test` exit 0；用例计数 ≥10 实测落 log。

Exit Criteria:

- [x] maxRetries / backoff / retry-after-header 三面各至少 2 例断言通过；用例数 ≥10 实测
- [x] 确定性合同成立（同 Phase 2 口径）

## Phase 4 — WI12 model-selector.ts + 真值表 + 回写

Targets: `plugin/nop-route/src/model-selector.ts`、`plugin/nop-route/test/model-selector.test.mjs`、`docs/backlog/multi-plugin-dsh-roadmap.md`、`docs/logs/2026/08-28.md`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 3

- [x] Add: `src/model-selector.ts`——pure `pickModel(request, history, config): ModelSelection`（导出 `ModelSelection` 类型：model id + reasoningEffort override + expected token budget，面对齐设计 §nop-route 路由表）：默认模型选取 / fallback 链轮转 / 历史感知（近期失败模型跳过）；零墙钟、零随机（历史信息全走 `history` 入参）。
- [x] Add: `test/model-selector.test.mjs`——真值表 ≥10 例：默认选取、fallback 链各序位、历史命中跳过、链尾耗尽、空历史 / 空链边界。
- [x] Proof: `./verify-age.sh` L1+L2+L2.5 全绿（收口整链：三真值表 + bundle 链 + 引擎 + law 门全过）；三真值表用例计数（各 ≥10）实测落 log。
- [x] Add: roadmap WI9 / WI10 / WI11 / WI12 行 `[ ]`→`[x]` + 行内尾部证据注记（脚手架文件清单 + L2 接线、三模块 + 各自用例计数）；`> Last Updated` 头同步；`node tools/mission-driver/src/roadmap-check.mjs docs/backlog/multi-plugin-dsh-roadmap.md` exit 0。
- [x] Add: `docs/logs/2026/08-28.md` 收口条目（四 Phase 证据摘要 + 确定性 grep 清单 + ErrorClass 口径对齐注记）。

Exit Criteria:

- [x] 三真值表全绿且各 ≥10 例实测；`./verify-age.sh` 全门 GREEN
- [x] roadmap WI9–WI12 `[x]` + 证据在册；roadmap-check exit 0；`docs/logs/` 收口条目在案

## Draft Review Record

- dispatch review #review-2026-08-28-104553-mission-driver-2026-08-28-1312-1-m4-wi9-wi12-nop-route-scaffold-pure-core-1-04349648 to ses_opencode_draft_review
- 2026-08-28：iteration 1，共识 acceptable-as-is #review-2026-08-28-104553-mission-driver-2026-08-28-1312-1-m4-wi9-wi12-nop-route-scaffold-pure-core-1-04349648

## Verification

- pass test gate-check-20260828T060258 basisHash=d96bb668e8179f71af09cd7a49fa63a0f6668c71b2bee4956f20a898caa283dd exit=0
- pass test verify-2026-08-28-104553-mission-driver basisHash=d96bb668e8179f71af09cd7a49fa63a0f6668c71b2bee4956f20a898caa283dd exit=0

## Closure

- dispatch audit #audit-2026-08-28-104553-mission-driver-2026-08-28-1312-1-m4-wi9-wi12-nop-route-scaffold-pure-core-1-f0d73793 to ses_opencode_audit models={exec:zhipuai-coding-plan/glm-5.2,aud:zhipuai-coding-plan/glm-5.2}
- accepted #audit-2026-08-28-104553-mission-driver-2026-08-28-1312-1-m4-wi9-wi12-nop-route-scaffold-pure-core-1-f0d73793：独立闭合审计通过——四 Phase 真落地：`plugin/nop-route/` 六件套 + 三纯决策模块在库（src/error-classifier.ts · retry-policy.ts · model-selector.ts），现跑 `npm --prefix plugin/nop-route test` **55/55 pass · 0 fail** exit 0（scaffold 5 + error-classifier 20 + retry-policy 16 + model-selector 14，三真值表各 ≥10）；机械验证现跑 `node tools/mission-driver/src/gate-check.mjs <plan> --verify` → `pnpm --prefix tools/mission-driver test` **990/990 pass · 0 fail** + prompt-check OK exit 0，basisHash d96bb668…283dd 现算与 `## Verification` pass 行一致；确定性合同 grep `Date.now|Math.random` 于 src/ 零命中；L2/CI 接线在库（verify-age.sh:54-59 nop-route 增腿 + age-ci.yml 两处 `'plugin/nop-route/**'`）；`git status --porcelain tools/mission-driver/` 为空（引擎零 diff）；roadmap WI9–WI12 `[x]` + 证据注记 + `> Last Updated` 同步，roadmap-check exit 0；docs/logs/2026/08-28.md 收口条目在档（单模型诚实降级：exec 与 aud 同为 zhipuai-coding-plan/glm-5.2）。
