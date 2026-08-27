---
status: active
mission: age-autonomy-implementation
work-item: M4-WI36
group: "2026-08-27-0558"
verify: [test, verify-age]
---

# 2026-08-27-0558-3 M4 Verification Gate + M4 收口（age-autonomy M4-WI36）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` WI36
> Related: 2026-08-27-0433-2/3（WI32/WI33 已收口——门命令 1/2 的测试面）、2026-08-27-0558-1（WI34——门命令 3 测试面随其落地）、2026-08-27-0558-2（WI35——同组前置）、2026-08-27-0433-1（WI31 M3 门先例：括号语义如实记录）

## Current Baseline

- 门命令 1 `node plugin/dsh/test/pool-lifecycle.test.mjs`（≥10 例）：在库 **13 例**（M4-WI32，0 失败收口）——本门只要求真实复跑绿，不要求新增用例。
- 门命令 2 `node plugin/dsh/test/prompt-assembly.test.mjs`（≥12 例）：在库 **16 例**（M4-WI33，0 失败收口）——同上。
- 门命令 3 `node plugin/dsh/test/context-profile.test.mjs`（≥8 例）：**文件今日不存在**——随 0558-1（M4-WI34）Phase 3 落地（≥8 例下限已写入该 plan）；本 plan 前置 = 0558-1 与 0558-2 均收口（derived completed）。
- 观测项（终审 P2-4，roadmap 明示**不阻断**）：真实宿主连续模式跑 3 个 plan，FRESH vs CONTINUE token 差 >20% 视为达到设计目标；「机制落地即收口，收益待观测」为 roadmap 原句——缺宿主 env 时按 WI31 门命令 3 括号语义先例如实记录，不虚报。
- roadmap M4 区块状态：WI32/WI33 已 `[x]`；WI34/WI35 由本组 0558-1/0558-2 交付后勾选；WI36 = M4 收口门（勾选后 M4 区块 5/5 全勾）。
- 验证基建在库：`./verify-age.sh`（L1+L2+L2.5）、`pnpm --prefix tools/mission-driver test`、`node tools/mission-driver/src/roadmap-check.mjs`（roadmap 结构与进度）；基线计数：引擎 925 / 插件 407 / 真值表 116，verify-age GREEN（0558 组执行后计数只增不减）。
- 底线：本 plan 零代码交付预期（若门命令红 = 对应 WI 未收口，本门不勾——门纪律禁口头 close，不为过门修测试下限）。

## Goals

- 前置核验（0558-1/0558-2 derived completed）后，真实复跑 WI36 三条门命令并满足各自判据（例数 ≥ 门限 ∧ 0 失败）。
- 观测项按可用 env 如实记录（有宿主 env → 实跑记录 token 对比；无 → 记录缺 env 分支 +「收益待观测」原句，机制落地即收口）。
- 勾选 roadmap WI36 + M4 收口注记（M4 区块 5/5 核验）。

## Non-Goals

- 不新增效率层行为面（M4 行为面随 WI32–WI35 冻结；不为过门新增实现或下调门文本）。
- 不裁定 mission 是否完成（引擎按 audit 轮数决定，非本 plan 职责）；不启动 M5（WI37+ 归后续批次）。
- 零 `engine.js` diff、零新增 npm 依赖。

## Task Route

- Type: `verification or audit work`（纯验证 + 回写，无构建面）
- Owner Docs: `docs/backlog/age-autonomy-implementation-roadmap.md` WI36 与「自动验证纪律」节
- Skill Selection Basis: closure 类审计 prompt 供引擎 CLOSURE_AUDIT 步消费，非本步工作方法——Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.（观测项真实宿主分支需连续模式宿主 env；缺 env 按括号语义如实记录，不阻塞。）

## Phase 1 — M4 门实跑

Targets: 无代码 target（命令实跑 + 输出留档）
Skill: none

- Item Types: `Proof`
- Prereqs: 0558-1（M4-WI34）与 0558-2（M4-WI35）均 derived completed——执行时以 `gate-check <plan> --law` / plan-check 派生视图核验，未收口则本 plan 保持等待（不代偿）

- [ ] Proof: 门命令 1 `node plugin/dsh/test/pool-lifecycle.test.mjs` 真实复跑——≥10 例 0 失败 exit 0（在库 13 例基线，实测数记入证据）。
- [ ] Proof: 门命令 2 `node plugin/dsh/test/prompt-assembly.test.mjs` 真实复跑——≥12 例 0 失败 exit 0（在库 16 例基线，实测数记入证据）。
- [ ] Proof: 门命令 3 `node plugin/dsh/test/context-profile.test.mjs` 真实复跑——≥8 例 0 失败 exit 0（0558-1 交付面，实测数记入证据）。
- [ ] Proof: 观测项（不阻断）——有宿主 env 则真实宿主连续模式跑 3 个 plan 记录 FRESH vs CONTINUE token 对比（>20% 判达标）；无 env 则如实记录缺 env 分支并引用「机制落地即收口，收益待观测」原句——两分支输出均留档，不得虚报。

Exit Criteria:

- [ ] 三条门命令实际输出在案（例数 + exit code）；任何一条红 = WI36 不勾（门纪律）
- [ ] 观测项输出留档（实跑数据或缺 env 如实记录，二选一均有据）

## Phase 2 — 回写与 M4 收口核验

Targets: `docs/backlog/age-autonomy-implementation-roadmap.md`、`tools/mission-driver/CONTEXT.md`、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Proof | Add`
- Prereqs: Phase 1

- [ ] Proof: 收口核验——`node tools/mission-driver/src/roadmap-check.mjs` exit 0 且 M4 区块 5/5 全勾（WI32–WI36）；`./verify-age.sh` L1+L2+L2.5 GREEN；`pnpm --prefix tools/mission-driver test` 0 失败。
- [ ] Add: roadmap WI36 勾选 + 行内证据注记（三门实测输出摘要 + 观测项分支记录）；`> Last Updated` 头同步（M4 收口句）。
- [ ] Add: CONTEXT.md M4 收口注记（效率层四件套完成态一句）；`docs/logs/2026/08-27.md` 条目。

Exit Criteria:

- [ ] roadmap WI36 `[x]` + 证据注记；M4 区块 5/5 全勾
- [ ] roadmap-check / verify-age / 引擎测试三项全绿复核
- [ ] `docs/logs/` updated

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-27-0558-3-m4-wi36-verification-gate-1-e686cc4f to ses_reviewer_2026-08-27-0558-3
- 2026-08-27：iteration 1，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-27-0558-3-m4-wi36-verification-gate-1-e686cc4f（独立冷验证：三门命令与门限逐字对齐 roadmap、测试计数 13/16 在库与 context-profile 缺位属实、观测项括号语义与 WI31 先例一致、纯验证形态无构建面缺口、prereq 可执行；status 翻 active）

## Verification

## Closure

## Deferred But Adjudicated

### FRESH vs CONTINUE token 收益观测（终审 P2-4）

- Classification: `watch-only residual`
- Why Not Blocking Closure: roadmap WI36 行明示观测项不阻断——「机制落地即收口，收益待观测」；本 plan Phase 1 已按可用 env 如实留档
- Successor Required: no（重开条件：真实宿主连续模式长跑时随运营观测自然采集；若长期观测显示收益 <20%，经 04 §3 复评 CONTINUE 策略）
