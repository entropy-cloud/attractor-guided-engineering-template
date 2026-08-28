---
status: active
mission: multi-plugin-dsh
work-item: M1-WI1+WI2
group: "2026-08-28-0149"
verify: [test]
---

# 2026-08-28-0149-1 M1-WI1+WI2 多插件设计文档 doc-audit + 既有插件文档同源一致性收口

> Source: `docs/backlog/multi-plugin-dsh-roadmap.md` M1 WI1/WI2；设计 owner `docs/design/multi-plugin-dsh-architecture.md`
> Related: 后继 `2026-08-28-0149-2`（M2 迁移——消费本 plan 钉死的迁移面清单与零 diff 语义裁定）、`2026-08-28-0149-3`（M3 启动脚本——消费本 plan 钉死的 manifest 分期内容）

## Current Baseline

- `docs/design/multi-plugin-dsh-architecture.md` 已落（2026-08-27，头部 Status: DRAFT）——roadmap WI1 的 owner 交付物，含目录布局 / nop-* 命名约定 / isolate realm 协议 / manifest 格式 / load-plugins.sh 7 flag / nop-age 迁移面 / nop-route 4 路由 + 4 纯函数模块 / 概念映射 / 成功判据 8 条。roadmap 18 WI 全未勾（`grep -c "^- \[ \]"` = 18）。
- 起草期逐节对照 live 基线核验，已发现设计文档与实况的偏差（Phase 1 逐条处置，全部为 doc-audit 事实层）：
  1. **迁移面低估**：「pure mechanical migration（mv + 三文件 4-token 替换）」遗漏 bundle 外 live 功能引用——`tools/mission-driver/src/law-rules.mjs:1391` `LAW_PROTECTED_FAMILIES` prefix `"plugin/dsh/src/law/"`（:1367 注释同）、`missions/autonomy.policy.yml:124` gate match `{{projectRoot}}/plugin/dsh/src/law/**`、`tools/mission-driver/test/law-policy.test.js:86`（断言该 match）、`verify-age.sh`（:10/:16 注释、:42-46 `npm ci`/`npm test --prefix`、:73 真值表路径）、`.github/workflows/age-ci.yml:26/:36` 触发路径 `'plugin/dsh/**'`、`missions/age-autonomy-implementation.json:25` `verify-e2e` 命令 `pnpm --prefix plugin/dsh run verify:e2e`、`.githooks/pre-commit:28` 注释、owner docs（`tools/mission-driver/CONTEXT.md` 14 处、`docs/process/dsh-plugin-development-guide.md` 7 处、`docs/architecture/dsh-plugin-packaging.md` 17 处）。
  2. **「引擎零 diff」语义未裁定**：roadmap WI4「引擎零 diff」与上述 law-rules.mjs / policy / 引擎测试断言的路径字面更新互斥——不更新则迁移后 `plugin/nop-age/src/law/**` 脱离 P8 `law-self-protection` 保护集且引擎套件红；更新则 `tools/mission-driver/` 有 diff。
  3. **manifest 分期矛盾**：load script 预检「asserts every plugin path exists」与 manifest 示例同时声明 nop-age + nop-route 冲突——nop-route 至 M4 才存在，M3 落 manifest 即预检红；分期内容未成文。
  4. **测试面计数与命名不一致**：§Scope / 成功判据 3 写「三个 test 文件 / 三张真值表」，roadmap WI10-WI12 要求四张真值表（error-classifier / retry-policy / model-selector 各 ≥10 例）+ WI13 routing-core 编排 + WI16 e2e；目录树 `test/` 缺 `error-classifier.test.mjs` 与 e2e 入口；§nop-route 设计不变量段写 `test/nop-route-*.test.mjs`，与目录树 `routing-core.test.mjs` 等命名不一致。
  5. **技能名 carve-out 缺失**：设计文档未显式声明 `mission-control-run/draft/analyze` 三个技能 ID 在迁移后**保持原名**（roadmap M5-WI17 验证面明确要求「mission-control-* 三个技能仍完好」）——按 4-token 字面全局替换会破坏技能名，迁移 token map 必须带此 carve-out，设计文档应成文。
- `install-age.sh` / `install-age.manifest` live 零 `plugin/dsh` 字面引用（起草期 grep 实测零命中）——设计 Scope 段「check it does not reference plugin/dsh literally」可注记为已核实。
- 既有插件文档族（WI2 对象）现状：`docs/design/dsh-plugin-integration.md`（零 `plugin/dsh` 字面命中）、`docs/architecture/dsh-plugin-packaging.md`、`docs/process/dsh-plugin-development-guide.md`、`docs/backlog/dsh-plugin-roadmap.md`（已收口 mission 的历史 roadmap）均仍描述单 bundle 形态，无 nop-* 前向引用。
- 前序 plans 的 Deferred 清单已筛查：dsh-plugin mission 全部 Deferred（native status panel T1-T3 触发未命中、真模型自然语言验证 env-gated、headless CLI driver 降级梯、active-run guard 已收编）与 age-autonomy mission Deferred 均无重开触发命中，无待收编项；设计文档自带 Deferred（cross-plugin composition / plugin marketplace / streaming routing）为显式 Non-Goal，不在本 mission 重开。

## Goals

- 设计文档与 live 基线零已知矛盾：五处偏差全部处置在案，成为 M2-M5 可机械执行的真锚点。
- 既有单插件文档族与多插件设计文档同源一致：交叉断言无矛盾，nop-age 继承声明 + nop-route 前向指针补齐（引用面增补）。
- roadmap WI1/WI2 勾选回写 + 行内证据。

## Non-Goals

- 不执行任何代码迁移或目录改名（M2 领地，plan `2026-08-28-0149-2`）。
- 不重写单插件文档族的 as-built 面（目标态未落地前，现状描述 `plugin/dsh` 保持真；仅增前向引用段）。
- 不改写历史工件（`docs/plans/dsh-plugin/`、`docs/analysis/`、`docs/discussions/`、`docs/logs/`、已收口 roadmap 的史实行——历史记录永不改写）。
- 不收编设计文档 Deferred 三项（cross-plugin composition 重开触发 = 已记录的跨插件需求或 `partial:marker` 真实频率；marketplace 无后继；streaming routing v2 无后继）。

## Task Route

- Type: `verification or audit work`（doc-audit + 一致性收口，零代码）
- Owner Docs: `docs/design/multi-plugin-dsh-architecture.md`（被审对象）；`docs/design/dsh-plugin-integration.md`、`docs/architecture/dsh-plugin-packaging.md`、`docs/process/dsh-plugin-development-guide.md`（WI2 一致性对象）
- Skill Selection Basis: `docs/skills/README.md` 无本项目专属 skill；doc-audit 方法由本 plan Phase 清单承载——Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（纯文档批次，无运行面）。

## Phase 1 — 设计文档 doc-audit 修正（WI1）

Targets: `docs/design/multi-plugin-dsh-architecture.md`
Skill: none

- Item Types: `Decision | Fix | Proof`
- Prereqs: 无

- [x] Decision: **「引擎零 diff」语义裁定** = 引擎**行为**零 diff；`tools/mission-driver/` 允许且仅允许路径字面更新（`law-rules.mjs` `LAW_PROTECTED_FAMILIES` prefix + 头注、`law-core.mjs:8` 注释、`test/law-policy.test.js:86` 断言）——理由：P8 保护集与 policy gate match 随 bundle 目录走是迁移本体，不更新即保护空转 + 套件红。备选①字面零 diff（保护集留旧路径）——否决：`plugin/nop-age/src/law/**` 无保护，且 WI4 验证面（引擎套件绿）自相矛盾；备选②保护集双前缀过渡（旧新并存）——否决：旧前缀指向已删目录，死条目无消费者。残险：引擎面 diff 边界须在 M2 plan 以 grep 清单钉死（law 三模块之外引擎零触碰），裁定句写入设计文档 nop-age 迁移段 + Behavioral Differences 段。
- [x] Fix: **迁移面清单入档**——设计文档 nop-age 段「三文件 4-token」改写为完整迁移面清单：bundle 内 token 面（package.json / package-lock.json name、cordis.patch.yml isolate 键 + service row name + config row id + insert row id、src/service.ts mount log、preset/age/ 文件、scripts 注释与报错串、test fixtures 内路径）+ bundle 外功能引用面（Current Baseline 偏差 1 所列 7 处）+ owner docs 路径同步面；并成文技能名 carve-out（`mission-control-run/draft/analyze` 技能 ID 与 `/mdcontrol/api` 前缀、cordis 服务注册名 `mdcontrol` 迁移后不变）。
- [x] Fix: **manifest 分期裁定成文**——M3 交付的 `plugin/plugin-manifest.yml` 仅声明 nop-age；nop-route 条目随 M4 挂载面（WI15）落地时增补；UX 段示例标注「M4 后终态形态」；预检存在性断言与分期语义一致。
- [x] Fix: **测试面计数与命名统一**——nop-route test 面改写为四张真值表（error-classifier / retry-policy / model-selector 各 ≥10 例 + routing-core 编排测试）+ e2e 入口；目录树 `test/` 清单补全；`nop-route-*.test.mjs` vs 目录树命名二选一钉死（含理由）。
- [x] Fix: **install-age 零引用事实注记**——Scope 段该项标注 live 已核实（grep 零命中，M2 复测）。
- [x] Fix: 头部 Status 行更新——DRAFT → audited（注记 doc-audit 日期与本 plan 指针；实现仍未开始，M2-M5 落地后按里程碑增量注记）。
- [x] Proof: 修正后逐节复核——文中引用的路径 / 行号 / 计数与 live 一致（复核命令：Current Baseline 偏差 1 的 grep 清单重跑，与文档清单零漂移）；roadmap WI1 六个设计面（nop-* 命名约定、isolate realm 协议、manifest 格式、load-plugins.sh 形态、nop-route 范围、4 路由 + 4 纯函数模块）全部有落点且互相一致。

Exit Criteria:

- [x] 五处偏差全部处置在册（Decision 裁定含理由 / 否决备选 / 残险；Fix 落文档）
- [x] 设计文档成为 M2/M3 plan 可直接引用的机械执行锚点（迁移面清单 + 分期裁定 + 零 diff 语义三件齐备）
- [x] `docs/logs/` 更新

## Phase 2 — 既有文档同源一致性 + 引用面增补 + 回写（WI2）

Targets: `docs/design/dsh-plugin-integration.md`、`docs/architecture/dsh-plugin-packaging.md`、`docs/process/dsh-plugin-development-guide.md`、`docs/backlog/dsh-plugin-roadmap.md`、`docs/backlog/multi-plugin-dsh-roadmap.md`、`docs/logs/2026/08-28.md`
Skill: none

- Item Types: `Add | Decision | Proof`
- Prereqs: Phase 1（一致性核对以修正后的设计文档为基准）

- [x] Add: 三份 live owner docs 各增补前向引用段——nop-age 继承声明（单 bundle 文档族 = nop-age 的 as-built 文档；目录 / 包名 / realm 键映射指针 → `multi-plugin-dsh-architecture.md`）+ nop-route 前向指针（完整 §nop-route 随 M4/M5 落档，per 设计文档 Concept Mapping 行）。
- [x] Decision: `docs/backlog/dsh-plugin-roadmap.md` 处置裁定——已收口 mission 的历史 roadmap 不改写史实；仅当其头部 / 导语作 live-baseline 声明（描述当前目录形态为现行事实）时追加一行日期前向注记。裁定 + live 形态核实结果记入本 plan（不新建文件）。
  - 裁定记录（2026-08-28 执行时落）：live 核实——头部 `> Last Updated: 2026-08-23（…roadmap 全量完成…）` 行与 `## Purpose` 段（"Drive the implementation of…"）均为已收口 mission 的史实记录 / 任务域声明，**无**「当前目录形态为现行事实」的 live-baseline 断言；全部 6 处 `plugin/dsh` 字面均位于 per-WI 历史证据行与 Status 注记内（Non-Goals 不改写史实）。裁定 = **零触碰**（不追加前向注记；多插件 mission 的 roadmap 状态面由 `docs/backlog/multi-plugin-dsh-roadmap.md` 独立承载，无重复所有权）。
- [x] Proof: 同源一致性核对矩阵落 `docs/logs/2026/08-28.md`——两文档族交叉断言（isolate realm 键、服务注册名 `mdcontrol`、preset 零服务行、六宿主调用面、目录形态、`mission-control-*` 技能名）逐项核对；发现的矛盾逐条修正（修正原则：单插件文档 as-built 面描述 live 现状 `plugin/dsh` 保持真；目标态断言只存在于多插件设计文档）。（矩阵六维全过；矛盾修正 C1-C3：integration doc 头部 PLANNED 过期声明 → SUPPORTED BASELINE delivered、双形式表/Concept Mapping 列/Installing 段 Planned → as-built、dev guide 头部 forward-looking → operational）
- [x] Add: roadmap 回写——WI1 / WI2 行 `[ ]`→`[x]` + 行内尾部证据注记（doc-audit 五偏差处置指针 + 一致性矩阵指针）；`> Last Updated` 头同步。
- [x] Proof: `grep -c "^- \[ \]" docs/backlog/multi-plugin-dsh-roadmap.md` = 16 实测；`node tools/mission-driver/src/roadmap-check.mjs docs/backlog/multi-plugin-dsh-roadmap.md` exit 0。
- [x] Add: `docs/logs/2026/08-28.md` 收口条目（两 Phase）。

Exit Criteria:

- [x] WI1/WI2 `[x]` + 行内证据在册；grep = 16 与 roadmap-check exit 0 实测
- [x] 单插件文档族与多插件设计文档零同源矛盾（核对矩阵在 log 在案，矛盾修正清单完整）
- [x] 历史工件零改写（`git diff` 无 docs/plans/dsh-plugin/、docs/analysis/、docs/discussions/、docs/logs/ 既有行变更——本 plan 新增 log 行除外）（实测：git diff --stat 仅 docs/logs/2026/08-28.md +14 行纯新增，其余三目录零 diff）

## Draft Review Record

- dispatch review #review-2026-08-28-104553-mission-driver-2026-08-28-0149-1-m1-wi1-wi2-design-doc-audit-consistency-1-537d8923 to ses_opencode_review
- 2026-08-28：iteration 1，共识 acceptable-as-is #review-2026-08-28-104553-mission-driver-2026-08-28-0149-1-m1-wi1-wi2-design-doc-audit-consistency-1-537d8923

## Verification

- pass test 2026-08-28-104553-mission-driver basisHash=ba46100244be8c8897e22295aa1b58510811957b03f64bf57db5b8e6ab51e4df exit=0

## Closure

- dispatch audit #audit-2026-08-28-104553-mission-driver-2026-08-28-0149-1-m1-wi1-wi2-design-doc-audit-consistency-1-c0542dfa to ses_opencode_audit_2026-08-28-104553 models={exec:zhipuai-coding-plan/glm-5.2,aud:zhipuai-coding-plan/glm-5.2}
- accepted #audit-2026-08-28-104553-mission-driver-2026-08-28-0149-1-m1-wi1-wi2-design-doc-audit-consistency-1-c0542dfa：审计通过——19/19 勾选项逐条与 live 对账一致（设计文档 Status AUDITED + 五偏差处置全落档〔迁移面三清单/carve-out/manifest 分期/四真值表+e2e/install-age 注记〕、三 owner docs §Multi-Plugin Forward Reference 在册、roadmap WI1/WI2 勾选+行内证据、日志 08-28.md 两 Phase 条目在案）；关键验证：pnpm --prefix tools/mission-driver test 987/987 0 失败 exit 0 + roadmap-check exit 0 + grep -c "^- \[ \]" = 16 + basisHash 现算一致（纯文档批次零代码回归）
