---
status: active
mission: age-autonomy-implementation
work-item: M3-WI31
group: "2026-08-27-0433"
verify: [test, verify-age]
---

# 2026-08-27-0433-1 M3 Verification Gate + gate-check --law 执法面（age-autonomy M3-WI31）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` WI31
> Related: 2026-08-26-1954-3（WI30 收口，M3 仅剩本门）、2026-08-25-0950-3（WI24 M2 门先例）

## Current Baseline

- M3 WI25–WI30 六片全部收口（derived completed、Closure 回执在册）；roadmap M3 区块仅剩 WI31 未勾。
- 门命令 1/2 测试面已超额在库：`plugin/dsh/test/supervisor-trigger.test.mjs` 43 例（门限 ≥20）、`plugin/dsh/test/supervisor-recovery.test.mjs` 18 例（门限 ≥8）——本门只要求真实复跑绿，不要求新增用例。
- 门命令 3 `pnpm --prefix plugin/dsh run verify:e2e:continuous`：npm script 在库（`plugin/dsh/scripts/e2e-continuous.mjs`）；缺宿主 env 时 fail-fast exit ≠ 0（roadmap WI31 行明示 CI opt-in 不阻塞）；WI28 收口时真实宿主三连跑 PASS 在案（plan `2026-08-26-1954-1` 证据）。
- 门命令 4 `node tools/mission-driver/src/gate-check.mjs <active-plan>.md --law`：**`--law` 旗标今日不存在**——gate-check.mjs 仅 `--policy` / 单文件结构面 / `--verify` 三模式（usage 与头注钉住），命令按字面不可执行，需先交付该面（本 plan Phase 1）。
- gate-check.mjs 属 P8 保护路径（law-self-protection 保护集含 `src/gate-check.mjs`）；例外三支之一 = 已批准立项——本 plan 自身 active 即合法消费者（0950-1「规则的第一个合法消费者 = 它自己的宿主 plan」自指先例）。
- 完成派生/默认 verify 键单一实现已在库：`plan-check.mjs missionDefaultVerifyKeys`（WI41）；`deriveCompleted`/completionReasons 经 `ledger-sections.mjs`；全量 policy 加载经 `law-policy.mjs loadPolicyFile`。
- 基线计数（runner-reported，静态 grep 口径见各测试文件）：引擎测试 910 / 插件 378 / 真值表 116；`./verify-age.sh` L1+L2+L2.5 GREEN。
- 交叉 plan 注记：WI28 plan DRR iteration 2 已把「`--law` 模式不存在」登记为 WI31 立项时裁定项，路由二选一 = 补 CLI 模式 ∨ 修 roadmap 门文本——本 plan 取**补模式**（roadmap 是门契约、自动验证纪律禁把门文本下调迁就不存在的工具面；修文本为否决备选）。

## Goals

- 交付 gate-check `--law` 模式：活态 plan 在 owning mission 真实 policy 下跑全量 gates + 完成派生视图，使 WI31 门命令 4 按字面可执行且真实绿。
- 真实复跑 WI31 四条门命令并全部满足其判据，勾选 roadmap WI31，M3 收口。

## Non-Goals

- 不新增 supervisor 行为、trigger、law 规则（M3 行为面已随 WI25–WI30 冻结）。
- 不改 `tools/mission-driver/src/engine.js`（零引擎 diff 保持）；不新增 npm 依赖。
- 不裁定 mission 是否完成（引擎按 audit 轮数决定，非本 plan 职责）。

## Task Route

- Type: `verification or audit work`（Phase 1 含一个 Add 交付使门命令字面可执行）
- Owner Docs: `docs/backlog/age-autonomy-implementation-roadmap.md` WI31；`docs/design/age-autonomy/02-rule-law.md` §6（独立形态 CLI 行）
- Skill Selection Basis: `docs/skills/` 均为审计 prompt 模板（供引擎 CLOSURE_AUDIT/DEEP_AUDIT 派发消费），非本阶段工作方法——Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.（门命令 3 的真实宿主分支需 `DSH_E2E_CONTINUOUS=1` + 宿主 env；缺 env 时按 roadmap 括号语义 fail-fast 记录，不阻塞。）

## Phase 1 — gate-check `--law` 执法面

Targets: `tools/mission-driver/src/gate-check.mjs`、`tools/mission-driver/test/`
Skill: none

- Item Types: `Add | Decision | Proof`
- Prereqs: 本 plan 处于 active（P8 已批准立项例外，gate-check.mjs 为保护路径）

- [x] Add: `--law` 模式（`<plan.md> --law`）：`discoverOwningMission` 祖先走查 → 经 mission `autonomyPolicy`（回退 `missions/autonomy.policy.yml` 发现）`loadPolicyFile` 加载真实 policy → `evaluateGates` 跑 policy 全量 gates（match 域 `{{plansDir}}`/`{{projectRoot}}` 解析；ctx = plansRoots / roadmapPath / roadmapText / projectRoot / commands；保护面语料仅当求值目标命中保护路径时注入——镜像单文件面既有条件读 `runSingleFileMode`）→ stdout JSON：per-gate verdict、`deriveCompleted`/completionReasons（默认 verify 键复用 `plan-check.mjs missionDefaultVerifyKeys` 单一实现）、workItem 对账、plan 队列谓词（draftPlans/activePlans/awaitingClosure 等引擎侧读面）；exit 0 iff 全部 enforce gate allow。与单文件结构面的差异（结构面 = 无 actor 子集 + 合成 structural gates；`--law` = 真实 policy 全量面）成文于 usage 与头注。
- [x] Decision: 「trigger→closure 链路」覆盖拆分——trigger 派发腿由门命令 1 的 supervisor-trigger e2e（43 例全链 echo fixture：pass 行落盘 → deriveCompleted → closure-audit dispatch）承载，`--law` 承载 law 门 + 完成派生面；不在 gate-check 内复刻 plugin 侧 trigger 求值器（TS 模块引擎侧不可达 + assets 通道是 engine→plugin 单向，反哺 = 零第二实现纪律违反）。残险 = 无（两命令合并覆盖链路，roadmap WI31 四命令本就是合取门）。
- [x] Proof: 引擎测试新用例（进既有 gate-check 相关 test 文件或新文件）：`--law` 对合法 fixture allow exit 0 / enforce deny 面（如伪造回执 fixture）exit 1 / 无 owning mission、无 policy 字段的回退分支 / 队列谓词与派生视图输出钉住；`pnpm --prefix tools/mission-driver test` 全绿。（新文件 `tools/mission-driver/test/gate-check-law.test.js` 10 例：usage 面 / allow 面 + workItem 对账 + 派生视图 / 队列谓词钉住（draft/active/awaitingClosure/closed 成员 + 默认 verify 键注入）/ 伪造回执 enforce deny / P8 保护路径条件语料（corpus 注入分支非 fail-closed 分支）/ 无 owning mission / autonomyPolicy 回退发现 / 双缺 deny / legacy 域外放行）

Exit Criteria:

- [x] `node tools/mission-driver/src/gate-check.mjs --help`（bare 调用）usage 含 `--law` 行；对 frontmatter plan 与 legacy plan（域外放行注记）均可跑
- [x] 引擎测试全绿且总数不低于 910 + 新增用例数（实测 923 = 基线 913 + 新增 10，0 失败；web typecheck/build 绿、lint:prompts OK）
- [x] No owner-doc update required for 02 §6（`--law` 为 CLI 模式增量，承 `--verify` 先例：部署表不逐模式列行，machine face = gate-check.mjs 头注 + usage；CONTEXT.md 注记在 Phase 2 落地）
- [x] `git diff --stat tools/mission-driver/src/engine.js` 为空

## Phase 2 — M3 门实跑 + 回写

Targets: `docs/backlog/age-autonomy-implementation-roadmap.md`、`tools/mission-driver/CONTEXT.md`、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Proof | Add`
- Prereqs: Phase 1

- [x] Proof: 门命令 1 `node plugin/dsh/test/supervisor-trigger.test.mjs` 真实复跑，≥20 例 0 失败。（实测 43 tests / 0 fail，exit 0）
- [x] Proof: 门命令 2 `node plugin/dsh/test/supervisor-recovery.test.mjs` 真实复跑，≥8 例 0 失败。（实测 18 tests / 0 fail，exit 0）
- [x] Proof: 门命令 3 `pnpm --prefix plugin/dsh run verify:e2e:continuous`：有宿主 env（`DSH_E2E_CONTINUOUS=1`）则三连跑必须全绿；无 env 则按 roadmap 括号语义记录 fail-fast exit ≠ 0 并引 WI28 真实宿主 PASS 回执为 standing evidence——两分支均如实记录实际输出，不得虚报。（实测：`DSH_E2E_CONTINUOUS` 未设 → fail-fast **exit 1**，stderr 明示「refuses to run without the host-env marker…CI never sets the marker」——括号语义分支如实记录；真实宿主三连跑 PASS standing evidence = WI28 plan `2026-08-26-1954-1` 实跑回执）
- [x] Proof: 门命令 4 `node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/2026-08-27-0433-1-m3-wi31-verification-gate-law-cli.md --law` → exit 0（本 plan 自身 = active plan，自指先例）。（实测 exit 0：9 个命中 enforce gate 全 allow（plan-structure / closure-audit-binding / writer-identity / plan-completed / claim-validity / verify-keys / record-append-only / path-guardrail / legacy-plan-freeze）+ workItem M3-WI31 对账 ok + derivedCompletion（active、未全勾、missing-pass 逐项可解释）+ queuePredicates（activePlans 3 / closedPlans 16 / awaitingClosure 0））
- [x] Add: roadmap WI31 勾选 + 行内证据注记（四命令实跑输出摘要）；`> Last Updated` 头同步（M3 收口句）。
- [x] Add: `tools/mission-driver/CONTEXT.md` gate-check 面 `--law` 模式注记（构建与验证段或 law 段增量）；`docs/logs/2026/08-27.md` 收口条目（reverse chronological）。

Exit Criteria:

- [x] 四条门命令实际输出在案；任何一条红 = WI31 不勾（门纪律，不允许口头 close）
- [x] roadmap WI31 `[x]` + 证据注记；M3 区块全勾（M3 区块 7/7：WI25–WI31 全 `[x]`；roadmap-check exit 0，overallProgress 0.8）
- [x] `docs/logs/` updated

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-27-0433-1-m3-wi31-verification-gate-law-cli-1-7f3a9c2e to ses_fc0357e51ffeN7fxLTQ9UNBdr5
- 2026-08-27：iteration 1，共识 acceptable-with-changes #review-2026-08-26-130203-mission-driver-2026-08-27-0433-1-m3-wi31-verification-gate-law-cli-1-7f3a9c2e（基线全数 live 证实含 --law 缺失/测试计数 43·18/P8 例外链；四项修订：WI28 交叉注记补模式裁定、按需注入改显式条件、02 §6 显式 No-update、计数 runner-reported 口径）
- 2026-08-27：iteration 2，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-27-0433-1-m3-wi31-verification-gate-law-cli-1-7f3a9c2e（四项修订逐条确认落地，无新议题；status 翻 active）

## Verification

- pass test 2026-08-26-130203-mission-driver basisHash=c96f75741a35641fa08463daab3e97f145b3b1b5d0c3ca7d3e8b58e4d0dc7ce0 exit=0
- pass verify-age 2026-08-26-130203-mission-driver basisHash=c96f75741a35641fa08463daab3e97f145b3b1b5d0c3ca7d3e8b58e4d0dc7ce0 exit=0

## Closure

- dispatch audit #audit-2026-08-26-130203-mission-driver-2026-08-27-0433-1-m3-wi31-verification-gate-law-cli-1-137db353 to ses_auditor_2026-08-27-0433
- accepted #audit-2026-08-26-130203-mission-driver-2026-08-27-0433-1-m3-wi31-verification-gate-law-cli-1-137db353：独立收口审计（ses_auditor_2026-08-27-0433）通过——16 项全勾与 live 工作区逐项对账：① Phase 1 工件与可达性：`--law` 第四 CLI 模式 live（gate-check.mjs :437 起实现、:120 usage 行；`discoverOwningMission` 祖先走查 → mission `autonomyPolicy`（回退 `missions/autonomy.policy.yml` 发现）→ `loadPolicyFile` 真实 policy → `evaluateGates` 全量 gates；默认 verify 键复用 `plan-check.mjs missionDefaultVerifyKeys` 单一实现；P8 保护面语料条件注入镜像单文件面）；新引擎测试 `tools/mission-driver/test/gate-check-law.test.js` 10 例在库非空壳（923 基线内含）。② Phase 2 四门命令审计者独立复跑：supervisor-trigger **43/43** exit 0 · supervisor-recovery **18/18** exit 0 · `verify:e2e:continuous` 无宿主 env **fail-fast exit 1**（stderr 明示 opt-in gate 拒跑——roadmap 括号语义分支如实记录非虚报；WI28 plan `2026-08-26-1954-1` 真实宿主三连跑 PASS standing evidence 引用属实）· `gate-check <本 plan> --law` **exit 0**（自指先例）。③ 机械验证独立复跑：`pnpm --prefix tools/mission-driver test` **923/923 pass + prompt-check OK** exit 0；`./verify-age.sh` **L1+L2+L2.5 GREEN** exit 0。④ 不变量：`git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff）；零新增 npm 依赖；web/ 零改动（前端面无触碰 → 无需重建 dist）。⑤ 文档同步实证：roadmap WI31 `[x]` + 行内四门证据注记 + Last Updated「M3 收口」句（M3 区块 7/7：WI25–WI31 全勾）；CONTEXT.md gate-check `--law` 模式注记；`docs/logs/2026/08-27.md` 收口条目。结论：16/16 计数域全勾 + 双 pass 行 basisHash=c96f7574…d7ce0 与当次 basis 绑定 + 本回执对满足 01 §5.2 完成派生公式。
