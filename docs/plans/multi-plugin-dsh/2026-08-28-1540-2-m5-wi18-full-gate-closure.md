---
status: active
mission: multi-plugin-dsh
work-item: M5-WI18
group: "2026-08-28-1540"
verify: [test]
---

# 2026-08-28-1540-2 M5-WI18 L1+L2+L2.5 全门收口 + e2e 显式复跑（Deferred 收编）+ M5 收口回写（owner docs 完整结构性改写收编）

> Source: `docs/backlog/multi-plugin-dsh-roadmap.md` M5 WI18（收口定义：`./verify-age.sh` + 引擎 `pnpm test` + 插件 `npm test` + 真值表全过 + M5 收口回写）
> Related: 前置 `2026-08-28-1540-1`（M5-WI17 联合挂载证据——本 plan 回写消费其结果）；`2026-08-28-1312-3`（M4-WI16——其 Phase 1 Decision 残险补偿「M5-WI18 收口时显式复跑 verify:e2e」由本 plan 收编）；`2026-08-28-1312-2`（M4-WI13–WI15——其 §Deferred「owner docs 完整两 bundle 结构性改写」重开触发在本 plan 命中，由本 plan 收编）

## Current Baseline

- 全门最近绿章：`2026-08-28-1312-3` closure（`./verify-age.sh` L1+L2+L2.5 全门 GREEN——引擎 990 + nop-age 423 + nop-route 97 + launcher 18 + 真值表 119）；`2026-08-28-1540-1`（WI17）为纯验证面（引擎树 / 两 bundle / launcher / manifest 零 diff 自证）——但 WI18 的收口定义要求**本工作项自有收口绿章**，不能引用前章。
- **Deferred 收编面 1**（`2026-08-28-1312-2` §Deferred「owner docs 完整两 bundle 结构性改写」，Successor = M5-WI18，重开触发 = WI17 四腿 + WI18 全门收口）：三 owner docs（`docs/architecture/dsh-plugin-packaging.md` / `docs/design/dsh-plugin-integration.md` / `docs/process/dsh-plugin-development-guide.md`）当前为 §nop-age 迁移注记 + §nop-route as-built 增量段并列形态；完整两 bundle 终态改写待落地——提前改写会预写未验证内容（联合挂载证据 + 全门 GREEN 是改写的输入）。
- **Deferred 收编面 2**（`2026-08-28-1312-3` Phase 1 Decision 残险补偿——「e2e 回归不会被 CI 拦截……M5-WI18 收口时显式复跑」）：`verify:e2e` 两腿显式复跑——nop-route `npm --prefix plugin/nop-route run verify:e2e`（环境无关：零模型调用零凭据）+ nop-age `npm --prefix plugin/nop-age run verify:e2e`（env-gated：凭据齐备 exit 0；缺失时按脚本既有 fail-fast 括号语义如实记录 verification scope limited + 残险评估，不冒充全绿——M2 plan 先例语义）。
- roadmap M5 仅剩 WI18 行未勾；Dependencies & Notes 钉 M5 关键面（dump grep / AGE preset 零服务行 / 三技能完好）证据归 WI17。
- 验证门拓扑（在库事实）：mission `test` key = `pnpm --prefix tools/mission-driver test`（= L1）；`./verify-age.sh` 非 mission command key，作为 body 级 Proof 命令执行；e2e 两腿不入 verify-age.sh L2 / CI（`2026-08-28-1312-3` Decision 家族对称裁定——本 plan 只做收口复跑，不改 CI 链，不重开该 Decision）。
- 已知边界（维持原裁定，触发未命中，非本 plan 回收）：两 bundle 无 `main`/`exports` 包入口缺口 → 真宿主 boot 腿缺席（M2-WI4 留档独立后继项，重开触发 = 包入口后继项收口）；HTTP dispatcher 真运行时 e2e 面（重开触发 = 真实消费方出现）。

## Goals

- **全门收口绿章**：`./verify-age.sh` L1+L2+L2.5 全门 GREEN（逐链计数落 log）+ mission `test` key 机械验证 pass。
- **e2e 显式复跑两腿**（Deferred 收编面 2）：nop-route `verify:e2e` exit 0 + nop-age `verify:e2e`（env-gated 诚实处理）。
- **M5 收口回写**（Deferred 收编面 1）：三 owner docs 完整两 bundle 结构性改写至 as-built 终态（目录形状 / realm 与服务名矩阵 / launcher + manifest 面 / 联合挂载证据指针（WI17 六腿）/ 验证门家族图谱 / 已知边界注记）；`docs/design/multi-plugin-dsh-architecture.md` 收口对账注记（Success Criteria 逐条证据指针 + Changelog 行）；roadmap WI18 `[x]` + 行内证据注记 + `> Last Updated` 头。
- `docs/logs/2026/08-28.md` 收口条目。

## Non-Goals

- 不加新功能、不改任何 src / 脚本 / CI 链（收口面；全门或 e2e 若暴露缺陷，回所属模块修复 + 独立处置 + log 记录，不在本 plan 就地打补丁绕过）。
- e2e 不入 verify-age.sh L2 / CI（维持 `2026-08-28-1312-3` Decision 家族对称裁定，不重开）。
- 不补包入口 `main`/`exports` / 真宿主 boot 腿（独立后继项维持原裁定）。
- 不宣布 mission 完成（引擎按 audit 轮数裁定；本 plan 只交付 WI18 工作面）。

## Task Route

- Type: `verification or audit work`（WI18 本质 = M5 验证收口 + 文档终态回写面）
- Owner Docs: `docs/backlog/multi-plugin-dsh-roadmap.md` M5；`docs/design/multi-plugin-dsh-architecture.md` §Success Criteria（对账对象）；三 owner docs（改写对象：`docs/architecture/dsh-plugin-packaging.md` / `docs/design/dsh-plugin-integration.md` / `docs/process/dsh-plugin-development-guide.md`）
- Skill Selection Basis: 无项目专属 skill 匹配（repo 无 docs/skills 项目面）；收口复跑方法承各前置 plan 先例——Skill: none

## Infrastructure And Config Prereqs

- 全门与 nop-route e2e：环境无关（零凭据零网络；devDeps 在库）。
- nop-age e2e：env-gated（模型凭据齐备则跑，缺失则如实记录 scope limited——不在 CI / 收口门内）。

## Phase 1 — 全门 GREEN 收口

Targets: 无代码 targets（验证执行面；证据落 `## Verification` + log）
Skill: none

- Item Types: `Proof`
- Prereqs: `2026-08-28-1540-1`（WI17）收口（联合挂载证据在册）

- [x] Proof: `./verify-age.sh` exit 0——L1（引擎 `pnpm --prefix tools/mission-driver test`，含 prompt-check）+ L2（nop-age 423 基线 / nop-route 97 基线 / launcher 18 基线）+ L2.5（gate-check policy + age-autonomy corpus + law 真值表 119 基线）逐链计数落 log（基线数字以实跑输出为准，只增不减）。（2026-08-28 实跑：exit 0 GREEN——引擎 992/992 + nop-age 423/423 + nop-route 97/97 + launcher 18/18 + policy ok + corpus 30 ok + 真值表 119/119，计数与 WI17 章一致〔引擎 992〕）
- [x] Proof: mission `test` key（`pnpm --prefix tools/mission-driver test`）exit 0——机械验证门（`## Verification` pass line 的命令面）。（2026-08-28 实跑：992/992 / 0 fail，exit 0）
- [x] Proof: 收口零 diff 自证——本 plan 不触任何 src / 脚本 / CI：`git diff --stat tools/mission-driver/src/ plugin/` 相对 WI17 收口点仅含文档路径（owner docs / roadmap / log 之外的零改动自证）。（2026-08-28 实测：输出为空 = 引擎 src 与 plugin/ 零改动；工作树唯一变更 = 本 plan 勾选）

Exit Criteria:

- [x] `./verify-age.sh` 全门 GREEN（逐链计数在册）
- [x] mission `test` key pass（exit 0）
- [x] 零代码 diff 自证在册

## Phase 2 — e2e 显式复跑（`2026-08-28-1312-3` Deferred 残险补偿收编）

Targets: 无代码 targets（验证执行面；证据落 log）
Skill: none

- Item Types: `Proof`
- Prereqs: Phase 1 全绿

- [x] Proof: `npm --prefix plugin/nop-route run verify:e2e` exit 0——断言面摘要落 log（classify ErrorClass 覆盖 / route 四类 RoutingDecision 命中 / replay bit-identical / health 直方图对账 + 复位 / headless 降级 / 干净 shutdown——`2026-08-28-1312-3` 收口章同面复证）。（2026-08-28 实跑：exit 0 SUMMARY PASS——classify 8/8 ErrorClass 覆盖 / route 10 调用四类全命中〔fallback, give-up, retry, transform〕/ pick-model 三面 / replay 18/18 bit-identical / health 版本 0.1.0 + 链 glm-5.2→glm-4.6 + 直方图精确对账 + 复位 / headless mount log + 降级行〔3 noproute log rows〕服务可解析 / 干净 shutdown）
- [x] Proof: `npm --prefix plugin/nop-age run verify:e2e`（env-gated 诚实处理：凭据齐备 → exit 0 摘要落 log；缺失 → 按脚本 fail-fast 括号语义如实记录 verification scope limited + 残险评估，不冒充全绿——M2 plan 先例语义）。（2026-08-28 实跑：exit 0 SUMMARY PASS——脚本自带 stub 模型端点〔自置 `DEEPSEEK_API_KEY=e2e-stub-no-call` + 127.0.0.1 本地 base URL，零真凭据需求〕：demo 双腿 shape identity + markers parsed + correction-retry 恢复 1 次 / onboarding 双形式 parity / descriptor 5 行健康 / monitor 渲染绿〔oc- + native- 双标签〕/ WI12 三技能 + analyze 双腿 + draft 两阶段 terminal completed）

Exit Criteria:

- [x] nop-route e2e 复跑证据在册（exit 0 + 断言面摘要）
- [x] nop-age e2e 复跑证据在册（exit 0 或诚实 scope-limited 记录 + 残险评估）

## Phase 3 — M5 收口回写（`2026-08-28-1312-2` Deferred「owner docs 完整改写」收编）

Targets: `docs/architecture/dsh-plugin-packaging.md`、`docs/design/dsh-plugin-integration.md`、`docs/process/dsh-plugin-development-guide.md`、`docs/design/multi-plugin-dsh-architecture.md`、`docs/backlog/multi-plugin-dsh-roadmap.md`、`docs/logs/2026/08-28.md`
Skill: none

- Item Types: `Add`
- Prereqs: Phase 1 + Phase 2 全绿（as-built 终态的输入证据齐）

- [x] Add: 三 owner docs 完整两 bundle 结构性改写——从「§nop-age 迁移注记 + §nop-route 增量段」并列形态改为两 bundle as-built 终态：目录形状、realm（`nopAge`/`nopRoute`）与服务名（`mdcontrol`/`noproute`）矩阵、launcher + manifest 双条目面、联合挂载证据指针（WI17 六腿）、验证门家族图谱（L1/L2/L2.5 聚合门 + `verify:e2e` 本地腿 posture + `verify:e2e:preset`）、已知边界注记（包入口缺口独立后继项、e2e 不入 CI 裁定）。（2026-08-28 在库：packaging §Multi-Plugin Family As-Built〔目录形状/realm 服务矩阵/launcher+manifest/验证门六行图谱/已知边界三条〕+ §nop-route Bundle as-built 段 + Purpose/头部终态注记；integration §Multi-Plugin Family As-Built〔family shape/install face/verification posture/known boundaries〕+ §nop-route product surface；dev-guide §Two-Bundle Family〔bundle 矩阵表/挂载流/证据指针/验证门/边界〕——`Multi-Plugin Forward Reference` 标题与「remains M5-WI18」增量段措辞全库清零，仅史实行〔roadmap WI2/log 旧条目〕保留）
- [x] Add: `docs/design/multi-plugin-dsh-architecture.md` 收口对账——Success Criteria 逐条证据指针（各条指向对应 plan closure / log）+ Changelog 行（终态回写记录）。（2026-08-28 在库：Status 翻 AUDITED — DELIVERED（五里程碑）；§Success Criteria 新增 Reconciliation 小节八条逐条证据指针表；Changelog 增 M5〔WI17+WI18〕与 M4〔WI9–WI16〕两行）
- [x] Add: roadmap WI18 行 `[ ]`→`[x]` + 行内证据注记（全门逐链计数 + e2e 复跑摘要 + 回写面指针）；`> Last Updated` 头同步；roadmap-check exit 0。（2026-08-28 实测：`node tools/mission-driver/src/roadmap-check.mjs docs/backlog/multi-plugin-dsh-roadmap.md` exit 0——overallProgress 1、18/18 WI 全 done；`grep -c "^- \[ \]"` = 0；`> Last Updated` 头 = M5 WI18 done〔mission 全里程碑收口〕）
- [x] Add: `docs/logs/2026/08-28.md` 收口条目（三 Phase 证据 + M5 收口面对账）。（2026-08-28 在库：收口条目含 Phase 1 全门逐链计数 + Phase 2 两腿 e2e 摘要 + Phase 3 回写面对账 + 收口后引擎套件复跑 992/992 / 0 失败 + 零代码 diff 自证）

Exit Criteria:

- [x] 三 owner docs 终态改写在库（增量段并列形态消除，两 bundle 结构性叙述一致）
- [x] 设计 doc Success Criteria 对账注记 + Changelog 在册
- [x] roadmap WI18 `[x]` + 证据在册；roadmap-check exit 0；log 收口条目在案

## Draft Review Record

- dispatch review #review-2026-08-28-104553-mission-driver-2026-08-28-1540-2-m5-wi18-full-gate-closure-1-af528775 to ses_opencode_draft_review
- 2026-08-28：iteration 1，共识 acceptable-as-is #review-2026-08-28-104553-mission-driver-2026-08-28-1540-2-m5-wi18-full-gate-closure-1-af528775

## Verification

- pass test 2026-08-28-104553-mission-driver basisHash=1120c1919cc7f595051e1835c97309f03cdf1cd11f593effd528531c378d22ea exit=0

## Closure

- dispatch audit #audit-2026-08-28-104553-mission-driver-2026-08-28-1540-2-m5-wi18-full-gate-closure-1-6a602ade to ses_opencode_closure_audit models={exec:opencode/zhipuai-coding-plan/glm-5.2,aud:opencode/zhipuai-coding-plan/glm-5.2}
- accepted #audit-2026-08-28-104553-mission-driver-2026-08-28-1540-2-m5-wi18-full-gate-closure-1-6a602ade：审计通过——收口面独立复核成立：17 项全勾与在库证据逐面对账（Phase 1/2 证据随 `docs/logs/2026/08-28.md` 收口条目在册——`./verify-age.sh` 全门 GREEN〔引擎 992 + nop-age 423 + nop-route 97 + launcher 18 + 真值表 119 + policy/corpus ok〕+ e2e 两腿显式复跑 exit 0〔nop-route 四类 RoutingDecision 全命中 + replay 18/18 bit-identical；nop-age 自置 stub 端点零真凭据〕；Phase 3 回写在库——三 owner docs §Multi-Plugin Family As-Built / §Two-Bundle Family 终态结构性改写 + `docs/design/multi-plugin-dsh-architecture.md` Status AUDITED — DELIVERED + §Success Criteria Reconciliation 八条 + Changelog M4/M5 + roadmap WI18 `[x]` 行内证据 + `> Last Updated` 头〔M5 全收口〕）。独立复跑：`pnpm --prefix tools/mission-driver test` exit 0〔992/992 fail 0 + prompt-check OK，basisHash=1120c191…d22ea 与 pass 行绑定〕；`node tools/mission-driver/src/roadmap-check.mjs docs/backlog/multi-plugin-dsh-roadmap.md` exit 0〔overallProgress 1，18/18 done〕；`git diff --stat tools/mission-driver/src/ plugin/` 为空〔零代码 diff 自证——工作树仅本 plan 目标文档面〕。Deferred 筛查：`1312-2` §Deferred「owner docs 完整改写」与 `1312-3` Phase 1 Decision 残险补偿两项重开触发均已命中并由本 plan 收编落地，无藏匿缺陷；已知边界（包入口缺口独立后继项 / e2e 不入 CI 裁定维持）如实注记非 Deferred 藏匿。models 对为同模型（single-model downgrade，如实记录）。
