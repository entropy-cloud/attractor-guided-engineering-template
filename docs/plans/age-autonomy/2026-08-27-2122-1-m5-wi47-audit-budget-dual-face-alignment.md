---
status: active
mission: age-autonomy-implementation
work-item: M5-WI47
group: "2026-08-27-2122"
verify: [test]
---

# 2026-08-27-2122-1 M5-WI47 审计预算双面语义对齐：policy 全局预算校正 3→8 + 双域语义成文 + 06 清单行 3 改判部分覆盖

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M5 findings 块 WI47（deep-audit R5 P1：审计预算双面语义断裂——全局 `audit-rounds` 4→5 超权威预算 3，引擎形态轮门只读 per-run 计数、law `audit-rounds-overflow` 无引擎形态执法点、06 退役清单行 3「已覆盖/缺口=无」判定失实）；R6 回执注记（第三次超发，dispatch 时全局 5≥3，引擎形态无拦截面）；Follow-up Backlog「CONTEXT.md『:7 先例』事实错误」条目（R5 P2，随本 plan 一并清偿）
> Related: 2026-08-27-1023-1（WI37 06 清单 + G 缺口机制）、2026-08-26-1411-3（WI27 maxFailures 双源先例 + R1 预算硬门）、2026-08-25-0815-3（WI17/WI20 `audit-rounds-overflow` 门禁 + `resolveMaxAuditRounds` 双源裁定）、2026-08-27-2122-2（WI48 同根族终态真值面，同组后继）

## Current Baseline

- 预算双源现状：权威源 `missions/autonomy.policy.yml` `limits.maxAuditRounds: 3`（:26，头注 :9-10 声明「maxAuditRounds here matches flows/mission-driver.json (3)」）；回退源 `flows/mission-driver.json:7` `"maxAuditRounds": 3`。消费分工：law `audit-rounds-overflow`（`tools/mission-driver/src/law-rules.mjs` :630-739，max 双源经 `law-policy.mjs` `resolveMaxAuditRounds` :492 policy 权威解析）对 roadmap frontmatter **全局** `audit-rounds` 执法；引擎 maxAuditRounds 轮门（`engine.js:1668-1673`）只读 **per-run** 计数（`engine.js:427` 每次 run 置零，`flow.maxAuditRounds` 供值）。
- 超发事实（R5/R6 回执 + roadmap 头注在案）：全局 `audit-rounds` 现 **6**（R1–R6 六轮 dispatch/accepted 配对），R4（派发时 3≥3）/R5（4≥3）/R6（5≥3）三轮均属 02 §4.6「deny 进入新审计轮次」应拦的超预算派发；law 三执法面（DSH pre-execute / 守夜人 exec-arm 预算预检 / gate-check CLI）均不在引擎形态写回链——引擎形态零拦截面，超发持续发生且无任何报错。
- 每轮产出证据（预算校正的事实依据）：R3→WI45（P1）、R4→WI46（P1）、R5→WI47（P1）、R6→WI48（P1）——审计循环连续四轮产出 P1 级 roadmap work item，非空转；law deny 消息自带合法出口「raise the budget (policy limits.maxAuditRounds, mission flow fallback) or close the mission via R1」（`law-rules.mjs:730`）。
- 06 清单行 3 现判 **已覆盖 / 缺口=无**（`docs/design/age-autonomy/06-engine-retirement-checklist.md:30`）——「双面一个预算」仅在 DSH/守夜人形态成立，引擎形态全局预算无执法点，判定失实（R5 立案事实）；§总判定结论行 :91「门禁 + 守夜人已覆盖账本域全部职责（审计预算/…）」同源措辞需同步收窄；G 缺口清单现 G1–G6（:68 附近），本 plan 增补 G7 沿用同一机制。
- 钉住测试面：`tools/mission-driver/test/law-policy.test.js:59` 对 **live policy** 断言 `limits` deep-equal `{maxAuditRounds: 3, maxFailures: 3, stagnationRounds: 10}`——改值必须同步该断言；`test/draft-plans-audit-gate.test.js` 等引擎测试全部使用 fixture flow（`gateFlow({ maxAuditRounds: 3 })` 自带值），flows 文件零改动则引擎行为与测试零影响。
- Follow-up（R5 P2，本 plan 清偿）：`tools/mission-driver/CONTEXT.md` M3-WI27 段「顶层 `maxFailures: 3` 回退键（镜像 maxAuditRounds :7 先例、引擎惰性）」事实错误——`maxAuditRounds` 全史恒 3（`git log -S '"maxAuditRounds": 7'` 零命中；flows/mission-driver.json:7 现值 3；policy 头注 :10 亦写明 matches (3)），「:7 先例」无任何工件指称（R5 回执已核）。
- 验证基线（R6 复核在案）：引擎 969/969、插件 420/0、真值表 116/0、`./verify-age.sh` L1+L2+L2.5 GREEN、mission-check/roadmap-check/gate-check exit 0。
- roadmap 计数域现状：列 0 未勾恰 WI47/WI48/WI49 三行（`grep -c "^- \[ \]"` = 3，评审实测 :120/:125/:129——WI49 行与本 plan 同批起草落账，原稿「= 2/勾后 1」为起草时点旧值，评审已改判）；本 plan 勾选 WI47 后余 WI48/WI49 两行（grep = 2，归同组 plan 2122-2/2122-3 勾选）；Follow-up Backlog 未勾条目均缩进 2 格不在计数域（清偿编辑合法，1203-1 :22 先例）。
- P8 自护例外面：`missions/autonomy.policy.yml` 在 law-self-protection 保护集内，合法写通道 = 已批准立项——本 plan active 后即为 approved-project 引用（WI21 先例，policy 头注 :5-6「changes only through a plan's Add item」自证）。

## Goals

- 预算双面语义对齐成文：**全局预算域**（跨 run 累计的 `audit-rounds` × policy `limits.maxAuditRounds`，law 三执法面执法域）与 **per-run 瞬态域**（run 内轮计数 × flows `maxAuditRounds`，引擎轮门防护域）双域显式分离、各自权威值独立设定并成文，消除「同一个数字两个计数域」的语义断裂。
- policy `limits.maxAuditRounds` 3→**8**：全局预算校正至真实意图值（已消耗 6 + 两轮生产性余量），law 面对 R7/R8 dispatch 恢复合法判定通道；轮尽后 law 面诚实 deny、终态按 R1 语义收口（未勾存在 → partial）。
- 06 清单行 3 判定改「部分覆盖」+ 引擎形态缺口登记 **G7**（全局审计预算引擎形态无执法点——retirement-gated，G1–G6 同机制）；§结论 :91 措辞同步收窄。
- 02 §4.6 双域语义句 + policy 头注改写成文；CONTEXT.md「:7 先例」事实错误清偿（Follow-up R5 P2）。
- law-policy live 断言同步；roadmap WI47 勾选回写 + 行内证据；勾选后计数域 grep → 1。

## Non-Goals

- 零引擎 diff：`engine.js` 与 `flows/*.json` 零触碰（`git diff --stat` 为空）——route ①（引擎轮门播种/校验全局 audit-rounds）立项时否决，理由成文 Phase 1；引擎读全局账本归 06 G 缺口机制（retirement-gated），重开触发 = 06 清单退役执行期或独立形态后端替代立项（G7 同族裁定）。
- 不回退/改写全局 `audit-rounds` 计数与既有 DAR 回执（append-only；计数 = 已消耗轮次的事实记录，校正的是预算值不是消耗史）。
- 不处理 WI48（silent-completed 终态真值面——同根族不同缺陷面，同组 plan `2026-08-27-2122-2` 交付）。
- 不清偿 R4/R5/R6 其余 P2 Follow-up（baseline test-seams / packaging law 边登记债 / audits map dead keys / ghost run 目录族 / monitor readFileSync / 文档行级漂移 / prompt 措辞 / module-boundaries 扩展名 / CLI 管道截断——均非本 plan 结果面，留待后续轮次按族清偿）。
- 不裁定 mission 完成态（engine 按 audit 轮数决定；本 plan 只交付 WI47）。

## Task Route

- Type: `implementation-only change`（Decision 主导：预算校正裁定 + 配置值修改 + 设计文档改判 + 测试断言同步 + roadmap 回写）
- Owner Docs: roadmap M5 findings 块 WI47、`docs/design/age-autonomy/06-engine-retirement-checklist.md`（行 3 + G 清单 + 总判定结论）、`docs/design/age-autonomy/02-rule-law.md` §4.6（预算闸语义）、`missions/autonomy.policy.yml` 头注（law 数据面，经 plan Add item 通道修改）、`tools/mission-driver/CONTEXT.md`（M3-WI27 段事实修正）
- Skill Selection Basis: 无匹配 skill——预算语义裁定依据 = 02 §4.6 契约 + 06 清单机制 + R5/R6 回执事实，非审计方法面；Skill: none（逐 Phase 标注）

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（验证命令全部在库；policy 修改走 plan Add item 通道，无端口/env/外部服务依赖）。

## Phase 1 — 裁定与落地：预算双域分离 + policy 校正 + 06 行 3 改判 + Follow-up 事实修正

Targets: `missions/autonomy.policy.yml`（limits 值 + 头注）、`docs/design/age-autonomy/06-engine-retirement-checklist.md`（行 3 + G 清单 + 结论 :91）、`docs/design/age-autonomy/02-rule-law.md`（§4.6 双域句 + changelog）、`tools/mission-driver/CONTEXT.md`（M3-WI27 段）、`tools/mission-driver/test/law-policy.test.js`（live 断言）
Skill: none

- Item Types: `Decision | Fix | Proof`
- Prereqs: 无（M5 findings WI 无阶段依赖；同组 plan 2122-2 与本 plan 无代码依赖，仅 06 清单编辑先后序）

- [x] Decision: WI47 修法三选一裁定 = **② policy 预算校正至真实意图值 + ③ 双域语义/引擎形态执法域成文，②③ 并取**。理由：审计循环生产性有连续四轮 P1 产出实证（R3→WI45/R4→WI46/R5→WI47/R6→WI48），预算 3 早被现实超越且 law deny 消息自带 raise-the-budget 合法出口；全局已耗 6 + 两轮生产性余量 = 8，轮尽后 law 面诚实 deny、按 R1 语义（未勾存在 → partial）收口，无静默通道。备选否决：**① 引擎轮门播种/校验全局 audit-rounds**——engine.js 语义 diff，破 age-autonomy 全程零引擎 diff 底线（R3–R6 每轮回执核验项），且 per-run 瞬态防护有独立价值（run 内轮次防护不应耦合全局账本读）；引擎读全局账本正是 06 G 缺口机制管辖面（retirement-gated，G1–G6 同族先例）。**纯 ③（预算不动只成文豁免）**——预算 3 < 已消耗 6 意味着此后每次 dispatch 在 law 面恒 deny-worthy 而引擎形态照发，账本永久处于「违规但无拦截面」的不诚实状态，R7 即使生产性也被 law 面拒。残险 = 预算 8 耗尽后若审计仍持续产出 P1 → 按设计走 R1 partial 诚实收口（人工裁定再加预算或接受 partial），非静默通道；生产性判断随轮复核，每轮回执即复核面。
- [x] Decision: 双域数值分工裁定 = policy `limits.maxAuditRounds` 3→**8**（全局权威域），flows `maxAuditRounds` **维持 3 不动**（per-run 瞬态域，`engine.js:1668` 轮门供值源零改动）——两值刻意分离并各自成文，替代旧头注「matches (3) so the two channels agree」。理由：全局预算与 per-run 防护本就是两个计数域（跨 run 累计 vs run 内置零），旧头注「两通道 agree」的表述正是把两个域误当一个域的根源（R5 断裂的文档侧成因）；分离后 law 面（`resolveMaxAuditRounds` policy 优先）与引擎轮门各读各域权威值。备选否决：双值同步抬 8（flows 变更无必要——per-run 3 轮防护现状无缺陷实证，且 flows 变更引入引擎侧行为复核面）；双值维持 3/3（= 纯 ③ 已否决）。
- [x] Fix: `missions/autonomy.policy.yml` `limits.maxAuditRounds: 3` → `8` + 头注 :9-10 改写为双域语义句（policy = 全局跨 run 预算权威，law 消费面对 roadmap `audit-rounds` 执法；flows = per-run 瞬态防护回退域，引擎轮门供值——两域刻意不同值，2122-1 裁定指针）；P8 例外 = 本 plan active 自指（WI21 先例沿袭）。
- [x] Fix: `docs/design/age-autonomy/06-engine-retirement-checklist.md` 行 3：判定 **已覆盖** → **部分覆盖**；缺口列「无」→ **G7**（引擎形态无全局 audit-rounds 执法点：轮门只读 per-run 计数从不读 roadmap frontmatter 全局计数，law 三执法面不在引擎写回链——retirement-gated，G1–G6 同机制增补 G7 条目）；§总判定结论 :91「（审计预算/…）」清单同步收窄（审计预算 → 部分覆盖 + G7 指针）。
- [x] Fix: `docs/design/age-autonomy/02-rule-law.md` §4.6 增补双域语义句（预算闸执法域 = law 消费面 × 全局 `audit-rounds` × policy 权威值；引擎形态轮门 = per-run 瞬态防护域，不读全局计数、非本闸执法面——06 G7 指针）+ changelog 行（M5-WI47）。
- [x] Fix: `tools/mission-driver/CONTEXT.md` M3-WI27 段「镜像 maxAuditRounds :7 先例、引擎惰性」→「镜像 maxAuditRounds: 3 通道、引擎惰性」（Follow-up R5 P2 清偿——全史恒 3、`git log -S '"maxAuditRounds": 7'` 零命中事实注记随句）。
- [x] Fix: `tools/mission-driver/test/law-policy.test.js:59` live 断言 `maxAuditRounds: 3` → `8`（live policy 校验面同步；其余 fixture 断言零触碰——fixture 面不读 live 值）。
- [x] Proof: `pnpm --prefix tools/mission-driver test` → 0 失败（相对 969 基线只增不减）+ `node tools/mission-driver/src/gate-check.mjs --policy missions/autonomy.policy.yml` exit 0（改值后 schema 校验仍绿）+ `node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0 + `git diff --stat tools/mission-driver/src/engine.js tools/mission-driver/flows/` 为空（零引擎 diff）+ `node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/2026-08-27-2122-1-m5-wi47-audit-budget-dual-face-alignment.md` exit 0（自指一致 + work-item M5-WI47 对账 ok）。

Exit Criteria:

- [x] policy `limits.maxAuditRounds: 8` + 双域头注句在册；06 行 3 = 部分覆盖 + G7 条目在册 + 结论收窄；02 §4.6 双域句 + changelog 在册；CONTEXT.md 事实修正在册；law-policy live 断言同步
- [x] `git diff --stat tools/mission-driver/src/engine.js tools/mission-driver/flows/` 为空 + 零新增 npm 依赖
- [x] `docs/logs/2026/08-27.md` updated

## Phase 2 — roadmap / Follow-up 回写与证明

Targets: `docs/backlog/age-autonomy-implementation-roadmap.md`（WI47 行 + Follow-up「:7 先例」条目 + `> Last Updated` 头）、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [x] Add: Follow-up Backlog「CONTEXT.md M3-WI27 段『maxAuditRounds :7 先例』事实错误」条目清偿——`[ ]`→`[x]` + 已清偿注记（指针本 plan Phase 1；:182-189 先例形态）。
- [x] Add: roadmap WI47 行 `[ ]`→`[x]` + 行内尾部证据注记（裁定 ②+③ 并取 + policy 3→8 全局域/flows 3 per-run 域分离 + 06 行 3 部分覆盖/G7 登记 + 指针本 plan）；`> Last Updated` 头同步本批事实。
- [x] Add: `docs/logs/2026/08-27.md` 条目（裁定摘要 + 验证结果）。
- [x] Proof: 勾选后 `grep -c "^- \[ \]" docs/backlog/age-autonomy-implementation-roadmap.md` → **2** 实测（余 WI48/WI49 两行，归同组 plan 2122-2/2122-3 勾选）+ `node tools/mission-driver/src/roadmap-check.mjs docs/backlog/age-autonomy-implementation-roadmap.md` exit 0。

Exit Criteria:

- [x] WI47 `[x]` + 行内证据 + Follow-up 条目清偿 + Last Updated 同步在册；勾选后 grep → 2 实测
- [x] `docs/logs/2026/08-27.md` updated

## Draft Review Record

- dispatch review #review-2026-08-27-220026-mission-driver-2026-08-27-2122-1-m5-wi47-audit-budget-dual-face-alignment-1-020b3e51 to ses_reviewer_2026-08-27-2122
- 2026-08-28：iteration 1，共识 acceptable-after-fix #review-2026-08-27-220026-mission-driver-2026-08-27-2122-1-m5-wi47-audit-budget-dual-face-alignment-1-020b3e51（独立冷验证：policy :26 maxAuditRounds=3 + 头注 :9-10、flows :7 同值、law-rules.mjs :630-739 deny 消息 raise-the-budget/R1 出口逐字、engine.js :427 per-run 置零 + :1668-1673 轮门只读 per-run 计数、roadmap frontmatter audit-rounds=6、06 行 3 已覆盖/缺口=无 + 结论 :91 + G 清单恰 G1–G6、law-policy.test.js:59 live 断言、CONTEXT.md :90「:7 先例」措辞、`git log -S '"maxAuditRounds": 7'` 零命中、Follow-up :201 缩进 2 格计数域外——baseline 事实全数实测相符；裁定 ②+③ 并取理由/否决备选/残险齐备、零引擎 diff 底线与 P8 例外（plan active 自指、WI21 先例）成立；格式合规（checkbox 仅 Phase 区列 0、Item Types 与实际项吻合、无禁用词、完成态派生无写 completed 指令）；评审修正一处事实错误——roadmap 列 0 未勾实为 WI47/WI48/WI49 三行（grep=3，:120/:125/:129），原稿「= 2/勾后 → 1」已改「= 3/勾后 → 2」（WI49 行 2122-3 同批落账），Current Baseline/Phase 2 Proof/Exit Criteria 三处同步；status 翻 active）

## Verification

- pass test gate-check-20260827T163318 basisHash=b4b1eaeb46264128f20dbd6d8c33a7a01a2f664e86a80b6161cb955b1c12d3ec exit=0
- pass test 2026-08-27-220026-mission-driver basisHash=b4b1eaeb46264128f20dbd6d8c33a7a01a2f664e86a80b6161cb955b1c12d3ec exit=0

## Closure

- dispatch audit #audit-2026-08-27-220026-mission-driver-2026-08-27-2122-1-m5-wi47-audit-budget-dual-face-alignment-1-a8961d11 to ses_auditor_2026-08-27-220026 models={exec:zhipuai/glm-5.2,aud:zhipuai/glm-5.2}
- accepted #audit-2026-08-27-220026-mission-driver-2026-08-27-2122-1-m5-wi47-audit-budget-dual-face-alignment-1-a8961d11：独立收口审计（ses_auditor_2026-08-27-220026，单模型部署 lineage 声明 = policy 02 §4.9 downgrade: single-model）通过——17 项计数域全勾与 live 工作区逐项对账：① policy `missions/autonomy.policy.yml` :33 `maxAuditRounds: 8` + 头注 :10-17 双域语义句（全局跨 run 权威 / flows 3 per-run 瞬态域刻意分离）在册；② 06 清单行 3 判定**部分覆盖** + 缺口 **G7**（:30）+ §4 结论收窄（:91）+ G 表 G7 条目（:103）在册；③ 02 §4.6 双域语义句（:151）+ changelog M5-WI47 行（:213）在册；④ CONTEXT.md M3-WI27 段「maxAuditRounds: 3 通道」修正 + `git log -S '"maxAuditRounds": 7'` 零命中注记在册（R5 P2 Follow-up 清偿，roadmap :201 删除线 + 指针核对一致）；⑤ `test/law-policy.test.js` :62 live 断言 `maxAuditRounds: 8`（fixture 面零触碰）；⑥ roadmap WI47 行 `[x]` + 行内证据（:120）+ `> Last Updated` 头同步（:7）+ 勾选后 `grep -c "^- \[ \]"` = **2** 实测（余 WI48/WI49 归同组 2122-2/2122-3）；⑦ 不变量：`git diff --stat tools/mission-driver/src/engine.js tools/mission-driver/flows/` 为空（零引擎 diff）、flows/mission-driver.json:7 恒 3、零新增 npm 依赖；⑧ docs sync：`docs/logs/2026/08-27.md` 两 Phase 条目（:5/:7）在册。审计者独立复跑机械验证全绿：`gate-check <本 plan> --verify` → `pnpm --prefix tools/mission-driver test` **973/973 / 0 失败 + prompt-check OK** exit 0（969 基线只增不减）+ `gate-check --policy missions/autonomy.policy.yml` exit 0 + `mission-check missions/age-autonomy-implementation.json .` exit 0 + `roadmap-check docs/backlog/age-autonomy-implementation-roadmap.md` exit 0。结论：17/17 计数域全勾 + test pass 行 basisHash=b4b1eaeb…c12d3ec 与当次 basis 绑定 + 本回执对满足 01 §5.2 完成派生公式。
