---
status: active
mission: age-autonomy-implementation
work-item: M5-WI48
group: "2026-08-27-2122"
verify: [test]
---

# 2026-08-27-2122-2 M5-WI48 引擎形态 silent-completed 终态通道封堵：nothing-claim 判据扩 roadmap 未勾 + 引擎形态豁免成文 + G8 登记

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M5 findings 块 WI48（deep-audit R6 P1：`_shouldCompleteOnAuditQuota` 清洁短路与 maxAuditRounds 轮门终态发射 `completed` 均不读 roadmap 未勾状态，`openAudits()` 自 M2-WI22 退役恒 `[]`、law `nothing-claim-guard` 亦只读 ctx.plans——未勾 P1 WI × DRAFT_PLANS nothing → mission 静默 completed/exit 0，03 §8 R1「不得静默记 completed」引擎形态失守）
> Related: 2026-08-27-2122-1（WI47 同根族预算面先行裁定 + 06 G 缺口机制先例）、2026-08-26-1411-2（WI26 nothing→deep-audit 派发 + `roadmap.unchecked` 谓词既有面）、2026-08-26-1411-3（WI27 terminal-rules R1 未勾→partial 参照实现）、2026-08-25-0950-2（WI22 legacy 审计通道退役——`openAudits()` 判据退化前提）

## Current Baseline

- 引擎形态两条 `completed` 终态通道均不读 roadmap 未勾（R6 立案事实，行号在案）：
  - 清洁短路 `_shouldCompleteOnAuditQuota`（`engine.js:728-749`，调用点 :2154 audit-gate）：判据 = `max > 0 && round >= 1 && activePlans()==0 && openAudits()==0`——`openAudits()` 自 M2-WI22 删 flow-loader `openAudits` 注册键后恒 `[]`（engine 消费面 optional-chain 退化），判据实际退化为 plans-only；marker=nothing ∧ 短路成立 → `_result("completed")`。
  - maxAuditRounds 轮门终态（`engine.js:1668-1673`）：`round >= maxAuditRounds` → 直接 `_result("completed")`，同样不读 roadmap 未勾。
  - `roadmapAllDone` 全引擎唯一消费点在 `_reconcileTerminal`（`engine.js:696`），且只做 FAILISH→completed 降级、从不在 completed 方向校验（R6 注记）。
- law `nothing-claim-guard`（`tools/mission-driver/src/law-rules.mjs:578-626`）判据只读 `ctx.plans`（draftPlans/activePlans）：kind=nothing-to-draft ∧ draft/active>0 → deny；==0 → allow + `trigger: {dispatch: deep-audit}` 信号（M3/WI26 守夜人消费面，真值表钉住信号形状）；`ctx.roadmapText` 已是既有 ctx 注入面（gate-check/host-adapter/writer 三面注入、law-core 工作项注册守卫既有读面；`scanRoadmapLedger` 在 law-rules.mjs 已 import :35 供 roadmap-audit-binding/audit-rounds-overflow 既有消费）——扩未勾判据零新依赖、零引擎改动。
- 守夜人形态已有兜底（对照面）：trigger-eval mission 域 `roadmap.unchecked` 谓词 + terminal-rules R1「未勾 → partial、不得静默记 completed」（`plugin/dsh/src/supervisor/terminal-rules.ts`，03 §8）——缺陷仅在引擎形态。
- 契约 owner：03 §4.4 为 nothing→deep-audit trigger 语义 owner（roadmap WI48 修法方向②原文指向）；03 §8 R1 为终态真值契约；06 清单行 8（主流程编排，现判「队列/评审/审计腿已覆盖」）与行 9（终态与退出码面）——引擎形态终态真值缺口未列 G；G 清单现 G1–G6（2122-1 增补 G7 后为 G1–G7）。
- 真值表基线：`plugin/dsh/test/law-truth-table.test.mjs` 116 例（nothing-claim 矩阵在案：deny 面 / plans 未注入 unverified 面 / 触发信号形状钉住——既有用例 fixture 若携未勾 roadmap 文本，判据扩展后期望需同步为预期变化）。
- 验证基线（R6 复核在案）：引擎 969/969、插件 420/0、真值表 116/0、`./verify-age.sh` L1+L2+L2.5 GREEN。
- roadmap 计数域现状：3 未勾（WI47/WI48/WI49，2026-08-27-2122 批次三 plan 各持一项，grep 实测 3）；2122-1 勾 WI47 后余 2、本 plan 勾 WI48 后余 WI49 一行（2122-3 持有，非本 plan 结果面）。
- 双副本纪律：`law-rules.mjs` tools↔assets 经 `pnpm --prefix plugin/dsh run build`（build-bundle.mjs）同步，freshness 门绿为收口判据（0815 批次先例）。

## Goals

- law `nothing-claim-guard` 判据扩 roadmap 未勾：kind=nothing-to-draft ∧ draftPlans()==0 ∧ activePlans()==0 且 `ctx.roadmapText` 在场时——未勾 >0 → allow 面触发信号携带 `roadmapUnchecked: N` 强化维度 + reason 成文「deep-audit 派发为强制沿：未勾存在时 nothing claim 永非清洁收口证据」；未勾 ==0 → 现行为逐字节不变；`ctx.roadmapText` 缺席 → 现行不可观测注记不变（02 §2 结构子集纪律）。
- 03 §4.4 trigger 语义同步（判据扩面 + 强制沿语义）；03 §8 R1 增引擎形态 as-built 豁免注记（引擎形态完成判据 = plans-only 清洁——完整 R1 语义由守夜人形态承载）。
- 06 清单行 9 增 **G8**（引擎形态终态真值不读全局未勾——retirement-gated，G7 同机制同族）；行 8 注记补 law 面未勾维度已扩。
- 02 §4.4 动作面判据句同步；真值表 +3 例钉住三分支；tools↔assets 双副本 in-sync。
- roadmap WI48 勾选回写 + 行内证据；勾选后 WI48 退出未勾计数域（grep 对账实测，余项为其他 plan 持有）。

## Non-Goals

- 零引擎 diff：`engine.js` 零触碰（route ① 清洁短路/轮门终态前增读 roadmap 未勾——立项时否决，理由成文 Phase 1；引擎读全局账本归 G8 retirement-gated，重开触发 = 06 清单退役执行期或独立形态后端替代立项）。
- 不改守夜人消费面（exec-arm/trigger-eval 已有 `roadmap.unchecked` 谓词与 R1 兜底——trigger payload 增量为 additive 字段，消费端零改动零新接线）。
- 不改 policy `triggers:` 段（terminal-claim trigger 的派发行为不变——扩面在 law 动作面的信号维度，非触发条件；law 数据面随 2122-1 修改后本 plan 零触碰）。
- 不处理 WI47（预算面，同组 plan 2122-1 交付）。
- 不清偿 R6 其余 P2 Follow-up（`_shouldCompleteOnAuditQuota`/`when` 求值 try 守卫 / tool-step timeout 死参数 / prompt 措辞两件 / module-boundaries 扩展名 / CLI 管道截断 / list-steps ghost 目录——均非本 plan 结果面；其中 try 守卫条与本缺陷同函数但属 fail-open 健壮性面、且涉 engine.js diff 需独立裁定，留待后续轮次）。
- 不裁定 mission 完成态（engine 按 audit 轮数决定；本 plan 只交付 WI48）。

## Task Route

- Type: `implementation-only change`（law 规则判据扩展 + 设计文档成文 + 真值表钉住 + roadmap 回写）
- Owner Docs: roadmap M5 findings 块 WI48、`docs/design/age-autonomy/03-supervisor.md` §4.4/§8、`docs/design/age-autonomy/02-rule-law.md` §4.4、`docs/design/age-autonomy/06-engine-retirement-checklist.md`（行 8/9 + G 清单）
- Skill Selection Basis: 无匹配 skill——判据扩展依据 = 02 §4.4/03 §4.4 契约 + R6 回执事实 + 守夜人参照实现；Skill: none（逐 Phase 标注）

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（验证命令全部在库）。

## Phase 1 — 裁定与落地：nothing-claim-guard 判据扩展 + 引擎形态豁免成文 + G8 登记

Targets: `tools/mission-driver/src/law-rules.mjs`（nothing-claim-guard）、`plugin/dsh/assets/src/law-rules.mjs`（build-bundle 同步产物）、`plugin/dsh/test/law-truth-table.test.mjs`（+3 例）、`docs/design/age-autonomy/03-supervisor.md`（§4.4 + §8 + changelog）、`docs/design/age-autonomy/02-rule-law.md`（§4.4 判据句）、`docs/design/age-autonomy/06-engine-retirement-checklist.md`（行 8/9 + G8）
Skill: none

- Item Types: `Decision | Fix | Add | Proof`
- Prereqs: 同组 plan 2122-1（06 清单 G 缺口登记机制与行 3 改判先行成文，避免两 plan 同文件编辑冲突；无代码依赖）

- [ ] Decision: WI48 修法三选一裁定 = **② law `nothing-claim-guard` 判据扩 roadmap 未勾 + ③ 03/06 引擎形态豁免成文，②③ 并取**。理由：law 动作面是唯一可在零引擎 diff 前提下收紧终态真值的执法点（`ctx.roadmapText` 既有注入面 + `scanRoadmapLedger` 既有 import，扩面零新依赖），守夜人形态参照实现已证语义可行（`roadmap.unchecked` 谓词 + R1 未勾→partial）；引擎形态缺陷如实成文豁免（完成判据 = plans-only 清洁）并按 06 G 机制登记 G8（retirement-gated——与 2122-1 G7 同机制同根族）。备选否决：**① 引擎短路/轮门终态前增读 roadmap 未勾**——engine.js 语义 diff 破 age-autonomy 全程零引擎 diff 底线（R3–R6 每轮回执核验项），且引擎读全局账本正是 G 缺口机制管辖面（退役执行期统一裁定，G1/G7 同族）；**纯 ③（law 面不动只成文豁免）**——law 动作面对未勾视而不见，与 03 §4.4 trigger 语义（nothing → deep-audit 为发现浮出的强制沿）存在契约缝隙：守夜人派发消费 trigger 信号时缺未勾维度数据，DSH/gate-check 形态的终态判定面少一道可执法的真值输入。残险 = 引擎形态两条 completed 通道在豁免期内仍可静默收口（G8 在册 + 03 §8 as-built 成文——接受为已知缺口，重开触发 = 退役执行期或后端替代立项）。
- [ ] Fix: `law-rules.mjs` `nothingClaimGuardRule` 判据扩展：kind=nothing-to-draft ∧ draft/active==0 分支内，`ctx.roadmapText` 为非空字符串时经 `scanRoadmapLedger` 计数列 0 未勾 WI 行——`unchecked > 0` → allow + trigger payload 增 `roadmapUnchecked: N` 字段 + reason 增未勾存在与强制沿句（deep-audit dispatch is the mandatory path; a nothing claim is never clean-close evidence while unchecked items exist）；`unchecked == 0` → 现行 allow/trigger/reason 逐字节不变；`ctx.roadmapText` 缺席 → 现行「plan records not injected…」注记路径不变（结构子集纪律——roadmap 未注入 = 不可观测不冒充）。deny 面（draft/active>0）与 kind 非本门面零改动。
- [ ] Add: 真值表 `plugin/dsh/test/law-truth-table.test.mjs` +3 例——① roadmapText 携未勾 WI 的 roadmap 文本 + plans 空 → allow ∧ `trigger.roadmapUnchecked === N`；② roadmapText 全勾 → 现 trigger 形状逐字段不变（`roadmapUnchecked` 缺席）；③ roadmapText 缺席 → 现行 unverified-writer 注记逐字节回归。既有 nothing-claim 用例期望同步：fixture 携未勾 roadmap 文本者，期望更新为扩展后行为（判据扩展的预期变化，非误杀）。
- [ ] Add: `docs/design/age-autonomy/03-supervisor.md` §4.4 trigger 语义句扩面（terminal-claim=nothing-to-draft 判据面增 `roadmap.unchecked` 维度：未勾 >0 时信号携带 `roadmapUnchecked`、deep-audit 派发为强制沿；与 R1 partial 收口语义互指）+ §8 R1 增引擎形态 as-built 豁免注记（引擎形态完成判据 = plans-only 清洁——`_shouldCompleteOnAuditQuota`/轮门终态不读全局未勾，完整 R1 语义由守夜人形态承载，06 G8 指针）+ changelog 行（M5-WI48）。
- [ ] Fix: `docs/design/age-autonomy/02-rule-law.md` §4.4 nothing-claim 动作面判据句同步（`ctx.roadmapText` 注入时扩未勾维度 + 强制沿语义；缺席 = 不可观测注记——02 §2 纪律互指）。
- [ ] Fix: `docs/design/age-autonomy/06-engine-retirement-checklist.md` 行 9 增 **G8** 条目（引擎形态终态真值不读全局未勾：清洁短路 plans-only 判据 + 轮门终态 direct `completed`——retirement-gated；03 §8 as-built 豁免指针）；行 8 「队列/评审/审计腿已覆盖」注记补 nothing→deep-audit 未勾维度 law 面已扩（2122-2 交付注记）。
- [ ] Fix: `pnpm --prefix plugin/dsh run build` 同步 tools→assets 双副本（build-bundle freshness 门绿为收口判据，0815 批次先例）。
- [ ] Proof: `pnpm --prefix tools/mission-driver test` → 0 失败（相对 969 基线只增不减）+ `node --test plugin/dsh/test/law-truth-table.test.mjs` → 116+3 例 0 失败 + `node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/2026-08-27-2122-2-m5-wi48-engine-silent-completed-terminal.md --law` exit 0（自指 + 全 enforce gate allow + work-item M5-WI48 对账 ok）+ `git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff）+ `./verify-age.sh` L1+L2+L2.5 GREEN。

Exit Criteria:

- [ ] nothing-claim-guard 三分支行为钉住在库（未勾>0 强化信号 / ==0 逐字节不变 / 缺席注记不变）+ tools↔assets 双副本 in-sync（freshness 门绿）
- [ ] 03 §4.4/§8 + 02 §4.4 + 06 行 9/G8 在册；`git diff --stat tools/mission-driver/src/engine.js` 为空 + 零新增 npm 依赖
- [ ] `docs/logs/2026/08-27.md` updated

## Phase 2 — roadmap 回写与证明

Targets: `docs/backlog/age-autonomy-implementation-roadmap.md`（WI48 行 + `> Last Updated` 头）、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1 + 同组 plan 2122-1 已勾选 WI47

- [ ] Add: roadmap WI48 行 `[ ]`→`[x]` + 行内尾部证据注记（裁定 ②+③ 并取 + law 判据扩未勾 + 03 §8 引擎形态豁免成文 + G8 登记 + 指针本 plan）；`> Last Updated` 头同步本批事实。
- [ ] Add: `docs/logs/2026/08-27.md` 条目（裁定摘要 + 验证结果）。
- [ ] Proof: 勾选后 `grep -c "^- \[ \]" docs/backlog/age-autonomy-implementation-roadmap.md` 实测 = 勾选前值 −1（审查时基线 3：WI47/WI48/WI49 三 plan 各持一项；本 plan 勾 WI48 后 ≥1 在册——WI47 归 2122-1、WI49 归 2122-3，非本 plan 结果面不得代勾；两 plan 若已先行勾选则相应递减、允许 0）+ `grep "^- \[ \]" docs/backlog/age-autonomy-implementation-roadmap.md | grep -c "WI48"` → **0**（WI48 退出未勾计数域；Follow-up 缩进行不在计数域）+ `node tools/mission-driver/src/roadmap-check.mjs docs/backlog/age-autonomy-implementation-roadmap.md` exit 0。

Exit Criteria:

- [ ] WI48 `[x]` + 行内证据 + Last Updated 同步在册；勾选后 WI48 退出未勾计数域实测（未勾总数较勾选前恰 −1，余项均为他 plan 持有）
- [ ] `docs/logs/2026/08-27.md` updated

## Draft Review Record

- dispatch review #review-2026-08-27-220026-mission-driver-2026-08-27-2122-2-m5-wi48-engine-silent-completed-terminal-1-809468d3 to ses_reviewer_1
- 2026-08-28：iteration 1，共识 acceptable-after-fix #review-2026-08-27-220026-mission-driver-2026-08-27-2122-2-m5-wi48-engine-silent-completed-terminal-1-809468d3

## Verification

## Closure
