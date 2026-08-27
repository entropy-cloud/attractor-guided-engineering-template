---
status: active
mission: age-autonomy-implementation
work-item: M5-WI39
group: "2026-08-27-1023"
verify: [test, verify-age]
---

# 2026-08-27-1023-3 M5-WI39 design+architecture owner-doc 一致性收口（Deferred 立案条目关闭）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` WI39；2026-08-25-0950-1（WI21）Deferred「02 §4.7 保护清单与 0815-1 放置裁定的 owner-doc 同步——归 M5 WI39」
> Related: 2026-08-27-1023-1（WI37 清单与 7 项裁定——本 plan 消费其结论收口 owner-doc 条目）、2026-08-27-1023-2（WI38 §11 契约变更——本 plan 复核其同步完整性）；`docs/architecture/dsh-plugin-packaging.md` §Update Rule、`docs/architecture/mission-driver-baseline.md` §Update Rule

## Current Baseline

- 设计基线 `docs/design/age-autonomy/{00–05}.md`（2026-08-24 human 批准）+ M1–M4 落地期增量（各 doc changelog 注记制）；架构面 `docs/architecture/mission-driver-baseline.md`（上次结构性更新 M2-WI43）与 `docs/architecture/dsh-plugin-packaging.md`（M4-WI34 增量在册）各带 Update Rule（supported behavior 变更须同 change 更新本 doc 与受影响 owner doc）。
- 已知未收口条目（清点起点，非穷尽——Phase 1 全量清点为准）：
  - 02 §4.7 P8 保护清单 vs 0815-1 放置裁定：law 内核三模块落引擎侧（`tools/mission-driver/src/{law-core,law-policy,law-rules}.mjs`，零 npm 放置裁定），而 P8 路径集（`law-self-protection` `isLawProtectedPath`）字面只列 `plugin/dsh/src/law/**` + `missions/autonomy.policy.yml` + 两执法 CLI——引擎侧内核不在 P8 集的事实与理由（引擎 import 闭包消费 + build-bundle 复制通道 + CI/立项纪律替代保护）未在 02 §4.7 成文。
  - 05 §2.2 `mdcontrol.unlock` 行标「（目标能力）」——WI28 已落地（05 §4 池化对照行已同步 as-built、§2.2 行未同步）。
  - 00 §7 迁移路径表 P0–P3 已落地、P4 判定门由 1023-1 交付清单——表内无落地状态注记（基线是目标形态契约，落地注记是事实性增补，不改契约语义）。
  - dsh-plugin-packaging.md native client panel deferral（reopen triggers T1/T2/T3）与 run-guard adjudicated 条目——需按 as-built 复核仍准确。
  - mission-driver-baseline.md 的 M3/M4 交付面（supervisor/efficiency 相关 Public Exports 或状态面）是否需按其 Update Rule 增量登记——Phase 1 判定。
- 结论落点纪律（AGENTS.md）：审计结论 inline 记录在被审计文件（changelog/注记），不产外部审计件；已收口 plan 的 basis 域终态冻结——收口落 owner-doc，不回写旧 plan。

## Goals

- 全量清点 `docs/design/age-autonomy/*.md` + `docs/architecture/{mission-driver-baseline,dsh-plugin-packaging}.md` 的 Deferred/裁定/「目标能力」条目与 as-built 漂移；每条落三态：closed-by-evidence（注记收口）/ still-deferred（触发条件复核刷新）/ superseded（指向后继）。
- 修复确认漂移：02 §4.7 引擎侧 law 内核放置与保护姿态注记、05 §2.2 unlock/continuous 落地注记、00 §7 P0–P4 落地状态注记（P4 指向 06 清单）、两架构 doc 按 Update Rule 的增量判定及其余矩阵命中项。
- roadmap WI39 回写 + 证据指针。

## Non-Goals

- 不修 monitor extends 合并 P2（roadmap Follow-up Backlog 未勾项——代码修复独立结果面，留后继 slice；其附挂 deferral（display-only verify 派生态显示，0925-1/0950-2 登记）随该修复收口，本 plan 仅注记归属）。
- 不改契约语义——一致性收口 = 事实性增补/状态注记/条目三态处置；任何契约变更仍需独立立项。
- 不做 M5-WI40 最终关门（独立 Verification Gate，后继 plan）。
- 不编辑已收口 plan 的冻结区（终态 basis 冻结；收口落 owner-doc）；零代码 diff、零新增 npm 依赖。

## Task Route

- Type: `verification or audit work`（owner-doc 一致性审计与收口——零行为变更）
- Owner Docs: 被审计面即 Targets（设计基线 + 两架构 doc）
- Skill Selection Basis: `docs/skills/` 默认审计 prompt 面向 mission/work 审计派发，非 doc sweep 工作方法；结构化清点矩阵 + rg 断言即方法——Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline。

## Phase 1 — 全量清点矩阵

Targets: `docs/design/age-autonomy/`、`docs/architecture/`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: 2026-08-27-1023-1（WI37）与 2026-08-27-1023-2（WI38）均收口（derived completed）——裁定记录与 §11 契约变更先行落库，本 plan 收口面才完整；执行时以派生视图核验，未收口则保持等待（不代偿）

- [ ] Add: 清点矩阵（条目 × 所在文档 × as-built 现状 × 三态判定 × 处置动作）——矩阵本体随执行记录落 `docs/logs/2026/08-27.md` 条目，处置动作落各 owner-doc changelog/注记（inline 纪律）。
- [ ] Proof: 清点命令留痕——`rg -n "目标能力|[Dd]eferred|归 M5|reopen|Reopen" docs/design/age-autonomy/ docs/architecture/mission-driver-baseline.md docs/architecture/dsh-plugin-packaging.md` 全量命中清单，命中数与矩阵行数对账（零遗漏声明 + 逐行三态判定）。

Exit Criteria:

- [ ] 矩阵覆盖两目录全部命中条目（命令输出行数与矩阵行对账一致，含「已核无需动作」行）
- [ ] 每命中条目有三态判定（无「未判定」残留）

## Phase 2 — 处置落地

Targets: Phase 1 矩阵命中的各 owner doc
Skill: none

- Item Types: `Fix | Add`
- Prereqs: Phase 1

- [ ] Fix: 02 §4.7 保护清单 as-built 注记——引擎侧 law 内核三模块放置裁定（0815-1）+ 不入 P8 路径集的理由与替代保护面（引擎 import 闭包消费 / build-bundle 复制通道 / CI + 立项纪律）成文，收口 0950-1 WI21 Deferred。
- [ ] Fix: 05 §2.2 `mdcontrol.unlock` 行落地注记（「目标能力」→ 已落地指针 M3-WI28，含 continuous 行复核）。
- [ ] Fix: 00 §7 迁移路径表 P0–P4 落地状态注记（事实性增补；P4 行指向 `06-engine-retirement-checklist.md` 与 WI37 总判定）。
- [ ] Fix: 其余矩阵命中项逐条处置——closed-by-evidence 注记 / still-deferred 触发条件刷新 / superseded 后继指针（含 packaging doc native-panel T1–T3 与 run-guard 条目复核、baseline.md Update Rule 增量判定：需更新则同 change 登记，无需更新则矩阵记「已核无需动作」）。

Exit Criteria:

- [ ] 上述 Fix 项落地且矩阵零「未处置」
- [ ] 处置均为事实性增补（diff 自查无契约语义变更）

## Phase 3 — Proof + 回写

Targets: roadmap、`tools/mission-driver/CONTEXT.md`、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Proof | Add`
- Prereqs: Phase 2

- [ ] Proof: `./verify-age.sh` L1+L2+L2.5 GREEN（doc 变更零行为回归）+ `node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/2026-08-27-1023-3-m5-wi39-ownerdoc-consistency-closure.md` exit 0（自指一致——本 plan 是 02 §4.7 所载门禁的合法消费者）。
- [ ] Add: roadmap WI39 勾选 + 行内证据注记（矩阵规模 + 三态分布 + 四 Fix 项指针）+ `> Last Updated` 头同步；CONTEXT.md 增量句；`docs/logs/2026/08-27.md` 条目（含清点矩阵本体）。

Exit Criteria:

- [ ] verify-age 三段 GREEN + gate-check 自指 exit 0 实测在案
- [ ] roadmap WI39 `[x]` + 证据指针在册
- [ ] `docs/logs/` updated

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-27-1023-3-m5-wi39-ownerdoc-consistency-closure-1-c95a18f3 to ses_reviewer_2026-08-27-1023
- 2026-08-27：iteration 1，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-27-1023-3-m5-wi39-ownerdoc-consistency-closure-1-c95a18f3（独立冷验证：02 §4.7 P8 字面集（plugin/law/** + policy + 两 CLI）vs 引擎侧 law 内核三模块的放置错位、05 §2.2 unlock 行「目标能力」滞留而 §4 池化行已同步 as-built、packaging doc native-panel T1–T3 与 run-guard 裁定条目、两架构 doc Update Rule 节均实测在册；清点 rg 命令 + 矩阵对账 + 三态判定 exit criteria 可机械执行，gate-check 自指消费合法；prereq 链（1023-1/2 derived completed 先行、不代偿等待）与组内执行序一致，冻结区不回写成文；Non-Goals 正确隔离 monitor extends P2 代码修复与 WI40；status 翻 active）

## Verification

## Closure
