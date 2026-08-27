---
status: active
mission: age-autonomy-implementation
work-item: M5-WI37
group: "2026-08-27-1023"
verify: [test, verify-age]
---

# 2026-08-27-1023-1 M5-WI37 引擎退役判定清单（门禁+守夜人覆盖评估与累积 Deferred 裁定）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` WI37 与「marker 迁移纪律」节；`docs/design/age-autonomy/00-overview.md` §3/§7 P4；`03-supervisor.md` §10；`04-efficiency.md` §6 as-built 注记
> Related: 2026-08-27-0558-2（WI35——Deferred ①② 归本 plan 裁定）、2026-08-26-1954-1（WI28——Deferred ④⑥）、2026-08-26-1954-3（WI30——Deferred ⑤）、2026-08-26-1411-2（WI26——Deferred ③）、2026-08-27-1023-2（WI38——终态退出码面）、2026-08-27-1023-3（WI39——消费本清单收口 owner-doc 条目）

## Current Baseline

- M1–M4 全部收口（roadmap 四区块 5/5 ×4 全勾）：law 门禁族 18 gates 全 enforce（`tools/mission-driver/src/{law-core,law-policy,law-rules}.mjs` + `plugin/dsh/src/law/host-adapter.ts`）；守夜人 `plugin/dsh/src/supervisor/`（decision-core/watchdog/writer/receipt/service/trigger-eval/dispatch-resolve/exec-arm/terminal-rules/failures/recovery/stagnation）；效率层 `plugin/dsh/src/efficiency/`（agent-pool/prompt-assembler/context-profile）。零引擎核心 diff（`engine.js` 状态机未被改写；引擎侧改动 = M2-WI41 flow-loader 读面 + 测试只增）。
- 引擎今日职责面（as-built 清点起点）：transient 分类与退避（`executor.js` 心跳/超时/SIGTERM + `engine.js` correction retry + parse fallback）；循环防护（ping_pong / maxCycles / maxTotalSteps / maxRetries → EXIT_MAP 2）；预算（maxAuditRounds 计数与轮门）；reconcile 与孤儿回收（`run-reconcile.mjs` reconcileStaleRuns + `reap-orphans.mjs`）；子流程编排（`flows/plan-execution.json` EXECUTE→CLOSURE_SCRIPT→CLOSURE_AUDIT→BUILD_VERIFY）；draft 管线（`orchestrator.js`）；主流程编排（`flows/mission-driver.json` 五步循环）；run-state/monitor 面；marker 协议（`<AI_STEP_RESULT>`/`<FLOW_VARS>`，M1 后仅诊断/日志面）；L2 双后端 parity 矩阵（`verify-age.sh` L1/L2/L2.5，真值表 116 例）。
- 守夜人+门禁覆盖面（as-built）：机械验证+闭合链（exec-arm verify-runner → pass 行 → closure-audit 链式，双驱动幂等）；终态规则 R1–R4 + failures 三桶熔断；崩溃恢复扫描（resume-or-redispatch）；停滞指纹+往返检测；连续模式 opt-in（roadmap 即队列）；trigger 14 谓词 + 派发解析链；agent 池/PromptAssembler/上下文画像。已知休眠面：execute 池化声明（WI28 裁定沿袭——plan 执行仍是引擎 run 领地）。
- 累积指向 M5-WI37 的 Deferred 立案（清点自各收口 plan §Deferred But Adjudicated，7 项）：① 跨步 `--session` 续用二选一（守夜人接管独立形态派发 ∨ 引擎 threading）——0558-2/WI35；② reasoningEffort 独立形态 config.js 载体——0558-2/WI35；③ BUILD_VERIFY prompt 步物理退役时机——1411-2/WI26；④ 守夜人 initial-execute 派发终审（M4-WI33 PromptAssembler 前置已落地）——1954-1/WI28；⑤ TTL 未到期死会话 claim 提前回收（停滞指纹兜底已就位）——1954-3/WI30；⑥ 独立形态 cron 声明面——1954-1/WI28；⑦ marker 物理删除时机——roadmap「marker 迁移纪律」段明文归 M5。
- 缺口：职责覆盖与缺口无单一清单工件——P4 判定门（00 §7「门禁+supervisor 覆盖缺失机制后评估」）无可机械核对的判定面；7 项 Deferred 无裁定记录，WI39（1023-3）的 owner-doc 收口依赖本 plan 产出。

## Goals

- 产出 `docs/design/age-autonomy/06-engine-retirement-checklist.md`：引擎职责 → 门禁+守夜人覆盖 → 迁移证据（模块/测试/plan 指针）→ 缺口 → 判定三态（已覆盖 ∨ 缺口阻塞 ∨ 引擎留任面）的覆盖矩阵，并在 00-overview §7 P4 行与 §8 文档地图登记。
- 对 7 项累积 Deferred 逐项裁定（verdict + 理由 + 重开触发，三要素齐备），成文于清单「裁定记录」节——供 1023-3（WI39）收口 owner-doc 对应条目消费。
- 给出总判定（引擎留任主后端 ∨ 可退役 ∨ 条件退役）与缺口前置清单，作为 M5 收口与后继 mission 的判定基线。

## Non-Goals

- 不执行引擎退役（不删不改任何引擎文件与行为）；不接线守夜人 initial-execute 派发——裁定归本 plan，实施归裁定结论指定的后继立项。
- 不改 EXIT_MAP / EXECUTION-PRINCIPLE §11（M5-WI38 独立立项 = 本组 1023-2）。
- 不修 monitor extends 合并 P2（roadmap Follow-up Backlog 未勾项——代码修复独立结果面，显式留后继 slice；本 plan 仅在矩阵登记其存在与归属）。
- 零 `engine.js` diff、零新增 npm 依赖、零 `plugin/dsh/src/` 行为变更（纯评估与文档工件）。

## Task Route

- Type: `verification or audit work`（评估门：覆盖矩阵 + 裁定记录，零行为变更）
- Owner Docs: `docs/design/age-autonomy/{00-overview,03-supervisor,04-efficiency}.md`、roadmap M5 段与「marker 迁移纪律」节、`docs/architecture/mission-driver-baseline.md`（证据取材面）
- Skill Selection Basis: `docs/skills/` 默认审计 prompt 面向 closure/deep-audit 派发，非清单起草工作方法——Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（纯文档工件；验证走既有命令）。

## Phase 1 — 清单工件与覆盖矩阵

Targets: `docs/design/age-autonomy/06-engine-retirement-checklist.md`（新建）、`docs/design/age-autonomy/00-overview.md`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: none

- [x] Decision: 清单落点 = `docs/design/age-autonomy/06-engine-retirement-checklist.md` 并登记 00-overview §8 文档地图 + §7 P4 行指针。备选否决：`docs/analysis/` 一次性分析件（P4 判定门工件是设计程序长命判定面，须随基线目录维护并被 00 地图索引）；mission 配置内嵌（非 mission 数据，且 mission scanner 面会污染）。清单头注 Status 标「living decision-gate artifact」非 supported baseline 契约。
- [x] Add: 覆盖矩阵 ≥12 行——transient 分类与退避 / 循环防护（ping-pong·max*）/ 审计预算（audit-rounds 轮门）/ 失败预算与熔断（maxRetries vs 三桶 maxFailures）/ reconcile·孤儿回收 / 子流程编排（plan-execution 四步链）/ draft 管线 / 主流程编排与 execute 腿 / 终态与退出码面（含 1023-2 增补后的 EXIT_MAP）/ monitor·run-state 面 / marker 协议 / L2 parity 证据——每行 = 引擎职责 → 覆盖面 → 证据指针（能举证处模块+测试+plan 三类）→ 缺口 → 判定三态。
- [x] Add: 「裁定记录」节骨架——7 项 Deferred（D1–D7，见 Phase 2）逐项 verdict/理由/重开触发空位表 + 总判定位。
- [x] Proof: 矩阵完整性断言——`rg -c "判定" docs/design/age-autonomy/06-engine-retirement-checklist.md` ≥13（12 行 + 总判定）且 `rg -c "重开触发" ` ≥7（裁定空位齐备）；00-overview 登记 `rg "06-engine-retirement-checklist" docs/design/age-autonomy/00-overview.md` ≥2 命中（§7 + §8）。

Exit Criteria:

- [x] 清单文件在库且 00-overview §7/§8 双登记可 grep（≥2 命中实测）
- [x] 矩阵 ≥12 行且无空判定行（rg 断言实测）；裁定空位表 7 项齐备
- [x] 本 Phase 即 owner-doc 变更（00-overview 增量），无需额外 doc-update 步

## Phase 2 — Deferred 裁定 + 总判定 + 回写

Targets: `docs/design/age-autonomy/06-engine-retirement-checklist.md`、`docs/design/age-autonomy/03-supervisor.md`（§10 指针注记）、`tools/mission-driver/CONTEXT.md`、roadmap、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: Phase 1；1023-2（WI38）收口 preferred（终态退出码面行引用其结果；未收口则该行按「增补中」如实登记，不阻塞）

- [x] Decision: D1 跨步 `--session` 续用二选一（0558-2 后继）——守夜人接管独立形态派发 ∨ 引擎 threading ∨ 维持 as-built 不交付；按 live 证据（execute 腿休眠现状 + 零引擎 diff 底线 + `PoolAgentsFace` DSH 独有事实）裁定，成文 verdict/理由/重开触发。
- [x] Decision: D2 reasoningEffort 独立形态载体（0558-2 后继）——config.js 增字段 = 引擎 diff 与底线关系；裁定载体归属（维持无载体注记 ∨ 随退役路径一并裁定）。
- [x] Decision: D3 BUILD_VERIFY prompt 步物理退役时机（1411-2 后继）——双驱动幂等已落地（引擎已写 pass 行则 trigger 不触发）；裁定保留 ∨ 退役路径一并处理。
- [x] Decision: D4 守夜人 initial-execute 派发终审（1954-1 后继，PromptAssembler 前置已备）——接线 = 行为变化需独立立项 + 真宿主长跑证据（token 观测项同族缺 env）；裁定接线与否与前置条件。
- [x] Decision: D5 TTL 未到期死会话 claim 提前回收（1954-3 后继）——停滞指纹+活动信号兜底已就位（死会话无活动信号不续期、TTL 自然到期回收）；裁定不立项成文 ∨ 立项（误杀/滞留案例出现时）。
- [x] Decision: D6 独立形态 cron 声明面（1954-1 后继）——05 §3.1 已列 cron/launchd/GHA 定时；裁定文档 seam 完备性（模板/install-age.sh 侧样例归模板产品面，不在本 mission）。
- [x] Decision: D7 marker 物理删除时机（roadmap「marker 迁移纪律」明文归 M5）——与引擎退役判定联动：存续期保留诊断/日志面，物理删除 = 退役执行期动作；成文触发条件。
- [x] Decision: 总判定——引擎留任主后端 ∨ 可退役 ∨ 条件退役，附缺口前置清单（每缺口一行指针：缺口描述 → 补齐路径 → 归属）。
- [x] Add: 03-supervisor.md §10 注记指针（判定清单在库——事实性增补 + changelog 行）；CONTEXT.md 增量段（M5-WI37 清单工件一句）。
- [x] Proof: `pnpm --prefix tools/mission-driver test` 0 失败 + `./verify-age.sh` L1+L2+L2.5 GREEN（零代码变更回归钉住，计数只增不减）。
- [x] Add: roadmap WI37 勾选 + 行内证据注记（清单路径 + 矩阵行数 + 7 裁定 + 总判定结论）+ `> Last Updated` 头同步；`docs/logs/2026/08-27.md` 条目。

Exit Criteria:

- [x] D1–D7 + 总判定均成文且三要素齐备（verdict/理由/重开触发——rg「重开触发」≥7 实测、无空位）
- [x] 03 §10 指针注记 + CONTEXT.md 增量 + roadmap WI37 `[x]` + 证据指针 + 头部日期同步在册
- [x] 双验证命令实测绿（test 0 失败 / verify-age 三段 GREEN）
- [x] `docs/logs/` updated

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-27-1023-1-m5-wi37-engine-retirement-decision-checklist-1-3f8a1c92 to ses_reviewer_2026-08-27-1023
- 2026-08-27：iteration 1，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-27-1023-1-m5-wi37-engine-retirement-decision-checklist-1-3f8a1c92（独立冷验证：D1–D7 七项 Deferred 逐一对上 live 源（0558-2 ①② / 1411-2 ③ / 1954-1 ④⑥ / 1954-3 ⑤ / roadmap「marker 迁移纪律」⑦）；守夜人 12 模块、效率层 3 模块、policy 18 gates enforce、M1–M4 全勾、06- 文件不存在均实测属实；矩阵 12 行覆盖 WI37 字面 transient 退避/pingPong/reconcile/L2 parity 且 Proof rg 断言可机械执行，06 落点的 living decision-gate 裁定与 00 §7/§8 双登记不冲突 supported baseline 纪律；Non-Goals 正确隔离 WI38/WI40/monitor extends P2；status 翻 active）

## Verification

- pass test 2026-08-26-130203-mission-driver basisHash=a41e145986af9596db4b95dae34703ff47b68f07b928f2f9a0c21c08937bb945 exit=0
- pass verify-age 2026-08-26-130203-mission-driver basisHash=a41e145986af9596db4b95dae34703ff47b68f07b928f2f9a0c21c08937bb945 exit=0

## Closure

- dispatch audit #audit-2026-08-26-130203-mission-driver-2026-08-27-1023-1-m5-wi37-engine-retirement-decision-checklist-1-7c3d9e42 to ses_auditor_2026-08-27-1023
- accepted #audit-2026-08-26-130203-mission-driver-2026-08-27-1023-1-m5-wi37-engine-retirement-decision-checklist-1-7c3d9e42：独立闭合审计通过（冷复核非信任勾选）。逐项实测：清单工件 `docs/design/age-autonomy/06-engine-retirement-checklist.md` 在库且 rg「判定」=29（≥13 断言）/「重开触发」=11（≥7 断言）；00-overview §7/§8 双登记 rg =2 命中；矩阵 12 行覆盖 transient 退避/ping-pong·max*/审计预算/失败熔断/reconcile/子流程编排/draft 管线/主流程 execute 腿/终态退出码（WI38 增补中如实登记）/monitor·run-state/marker/L2 parity，每行证据指针（模块+测试+plan）可溯；D1–D7 裁定三要素齐备（D1 维持不交付/D2 无载体注记/D3 保留至退役执行期/D4 本轮不接线/D5 不立项/D6 文档 seam 完备/D7 删除归退役执行期）+ 总判定「引擎留任主后端（条件退役）」+ 缺口前置 G1–G6 在册；03-supervisor §10 指针 + changelog、CONTEXT.md 增量段、roadmap WI37 `[x]` + 行内证据 + Last Updated 头、`docs/logs/2026/08-27.md` 条目均在册；Non-Goals 守住（零代码变更：`git diff --stat` engine/插件 src 为空、零新依赖）。双验证本审计独立复跑实测绿：`pnpm --prefix tools/mission-driver test` 947/947 0 失败 exit=0 + `./verify-age.sh` L1+L2+L2.5 GREEN（引擎 947 · 插件 420 · 真值表 116，计数只增不减）。完成公式五合取满足（status active ∧ 22 项全勾 ∧ verify 两键 pass 行 basisHash 与当前基一致 ∧ Closure dispatch/accepted 同 id 配对）。
