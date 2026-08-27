---
status: active
mission: age-autonomy-implementation
work-item: M5-WI38
group: "2026-08-27-1023"
verify: [test, verify-age]
---

# 2026-08-27-1023-2 M5-WI38 EXIT_MAP 显式增补 partial/blocked（冻结契约的独立立项变更）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` WI38；`docs/design/age-autonomy/03-supervisor.md` §8 终态映射纪律；2026-08-26-1411-3（WI27）Deferred「独立形态终态退出码 → M5-WI38」
> Related: `tools/mission-driver/EXECUTION-PRINCIPLE.md` §11（控制契约表）、`tools/mission-driver/src/exit-map.js`、`tools/mission-driver/test/exit-map.test.js`、2026-08-27-1023-1（WI37 清单「终态与退出码面」行引用本 plan 结果）

## Current Baseline

- `src/exit-map.js` EXIT_MAP 现行 11 键：`completed`/`single_step_done`→0；`failed`→1；`unknown_step`/`unknown_type`/`no_transition`/`invalid_transition`→1；`max_cycles`/`max_total_steps`/`max_retries`/`ping_pong`→2。`skipped` 与动态 done 词有意不映射（fall through Node 默认 exit 0，头注钉住——O7 审计教训要求与 EXECUTION-PRINCIPLE §11 逐行同步）。
- 守夜人终态词 `partial`/`blocked`（03 §8 R1–R4 求值核心 `terminal-rules.ts`，M3-WI27 落地）只在插件面消费：run-terminal 回执（A8 尽力投递）+ `mdcontrol.status` 透出（`statusFace().terminal`）+ 循环停派；不经引擎 `_result`，EXIT_MAP 无对应行——若未来独立形态（CLI 包装 / 守夜人 CLI / 退役路径执行后端）暴露这两个终态词，将落入「未映射动态词 → exit 0」通道，与「不得因预算耗尽把未完成 roadmap 静默记为 completed」纪律（03 §8 R1）冲突。
- 03 §8 终态映射纪律成文：DSH 形态走回执不依赖退出码；**独立形态若由引擎/守夜人 CLI 暴露这两个终态，必须先作为独立立项修改冻结的 EXIT_MAP 契约并同步 EXECUTION-PRINCIPLE §11，不得在引擎存续期内静默增改**。roadmap M5-WI38（「保护契约变更走独立立项 + 测 `exit-map.test.js`」）即该立项——本 plan 是增补的合法路径，先于任何暴露面存在。
- 消费面现状：`main.js`/`orchestrator.js` 在进程退出时查表；monitor web RunList `statusTagType` 识别引擎词（`single_step_done` 等）——supervisor 终态词不经 run-state，前端面无触碰必要。测试 `test/exit-map.test.js` 在库钉住现行契约。

## Goals

- EXIT_MAP 显式增补 `partial`/`blocked` 两行（提案映射 exit 3——新退出码类「终态非完成、需人工处置」），同步 `EXECUTION-PRINCIPLE.md` §11 表与语义行、`exit-map.js` 头注。
- `exit-map.test.js` 钉住：新行映射 + 既有 11 键逐行不变 + `skipped`/未映射动态词 fall-through 语义注记一致。
- 零引擎行为变更：`engine.js` 零 diff、不新增发射面（数据行增补非行为变更）；既有全部终态退出码逐字节不变；零新增 npm 依赖。

## Non-Goals

- 不改 `engine.js` `_result` / 不使引擎发射 `partial`/`blocked`（词属守夜人终态域，03 §8）。
- 不实现独立形态守夜人 CLI 或任何 supervisor 终态词的 CLI 暴露面（03 §8 所述暴露归退役路径后继——WI37 D1 裁定链）。
- 不改 monitor web 前端（supervisor 终态词显示走 `mdcontrol.status` 既有面）。
- 不动 `skipped`/动态词 fall-through 既有语义（头注裁定维持）。

## Task Route

- Type: `architecture change`（冻结公共契约 EXIT_MAP / EXECUTION-PRINCIPLE §11 的显式变更——03 §8 规定的独立立项；数据行级、零行为面）
- Owner Docs: `tools/mission-driver/EXECUTION-PRINCIPLE.md` §11（控制契约）、`docs/design/age-autonomy/03-supervisor.md` §8（changelog 注记）
- Skill Selection Basis: 契约表同步 + 测试钉住的机械面，无匹配技能——Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline。

## Phase 1 — 契约变更决策 + 实现

Targets: `tools/mission-driver/src/exit-map.js`、`tools/mission-driver/EXECUTION-PRINCIPLE.md`
Skill: none

- Item Types: `Decision | Add`
- Prereqs: none

- [ ] Decision: 退出码选型——提案 `partial: 3, blocked: 3`（同一「终态非完成、需人工处置」类，补救路径同为 unlock/dispose 等人工裁定）。备选否决：复用 2（预算/上限保护族语义与补救路径不同——重跑 vs 人工处置，混淆 CI 判读）；分离 3/4（今日零消费面区分，monitor/status 显示终态词本身）；映射 1（非不可恢复失败，CI 语义误报）；维持 fall-through exit 0（违反 03 §8「不得静默」纪律）。残险：未来需区分两码时须再走一次独立立项——重开触发 = 出现按退出码分支的真实消费者。
- [ ] Add: `exit-map.js` 增两行 + 头注更新（supervisor 终态词入表理由 = 前瞻防护独立形态暴露面；`skipped`/动态词 fall-through 语义不动）。
- [ ] Add: `EXECUTION-PRINCIPLE.md` §11 表增两行（触发 = 守夜人终态词经独立形态暴露 / 状态 = `partial`|`blocked` / exit code = 3 / 含义 = 终态非完成需人工处置）+ 表首或表尾语义句（词源守夜人 R1–R4，引擎存续期不发射）。

Exit Criteria:

- [ ] EXIT_MAP 新 13 键与 §11 表逐行一致（人工对照 + Phase 2 测试钉住双面）
- [ ] `git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎行为 diff）
- [ ] EXECUTION-PRINCIPLE §11 已更新（本 Phase Targets，owner-doc 同 change 落地）

## Phase 2 — 测试钉住 + 回写

Targets: `tools/mission-driver/test/exit-map.test.js`、`docs/design/age-autonomy/03-supervisor.md`、`tools/mission-driver/CONTEXT.md`、roadmap、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [ ] Add: `exit-map.test.js` 增用例 ≥4——`partial`→3 / `blocked`→3 / 既有 11 键逐行回归（含 `single_step_done`→0 与四类 2 码族）/ `skipped` 与未映射动态词 fall-through exit 0 语义注记与头注一致性断言。
- [ ] Proof: `pnpm --prefix tools/mission-driver test` 0 失败（944 基线只增不减）+ `./verify-age.sh` L1+L2+L2.5 GREEN（引擎契约变更零插件面破坏）。
- [ ] Add: 03-supervisor.md §8 changelog 注记（映射纪律的独立立项兑现——M5-WI38，exit 3 选型与理由一句）；CONTEXT.md「构建与验证」或关键约束面增量句；roadmap WI38 勾选 + 行内证据注记 + `> Last Updated` 头同步；`docs/logs/2026/08-27.md` 条目。

Exit Criteria:

- [ ] `exit-map.test.js` 新用例全绿且覆盖四断言面（新行/逐行回归/fall-through/头注一致）
- [ ] roadmap WI38 `[x]` + 证据指针在册；03 §8 changelog + CONTEXT.md 增量在册
- [ ] 双验证命令实测绿（test 0 失败 / verify-age 三段 GREEN）
- [ ] `docs/logs/` updated

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-27-1023-2-m5-wi38-exit-map-partial-blocked-1-7b2d4e60 to ses_reviewer_2026-08-27-1023
- 2026-08-27：iteration 1，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-27-1023-2-m5-wi38-exit-map-partial-blocked-1-7b2d4e60（独立冷验证：EXIT_MAP 现行 11 键与 exit-map.js 逐键一致、skipped/动态词 fall-through 头注在册；03 §8 终态映射纪律引文逐字核实——独立立项前置即本 plan 自身；§11 表 0/1/2 现状 + exit 3 无既有消费者分支（引擎不发射两词 = 零行为变更），备选否决与重开触发齐备；exit-map.test.js DOCUMENTED 表与「exactly 11」drift guard 在库，增补后须同步翻 13——由 0 失败 Proof 门机械强制，非阻塞；status 翻 active）

## Verification

## Closure
