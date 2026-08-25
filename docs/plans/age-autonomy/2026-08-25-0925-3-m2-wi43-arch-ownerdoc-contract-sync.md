---
status: active
mission: age-autonomy-implementation
work-item: M2-WI43
group: "2026-08-25-0925"
verify: [test]
---

# 2026-08-25-0925-3 M2-WI43 架构 owner-doc 契约同步（age-autonomy M2-WI43）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M2 WI43（P1·deep-audit R1：M1 公共契约模块未登记 + 两架构文档伴生漂移）
> Related: 同批执行顺序：`2026-08-25-0925-1`（N=1，WI41）→ `2026-08-25-0925-2`（N=2，WI42+WI44）→ 本 plan（N=3，纯文档，无代码冲突，可与前两者并行）；M1 交付批次 `2026-08-25-0635-{1,2,3}`（被登记对象的实现来源）；`docs/context/source-of-truth-and-precedence.md`（architecture 文档 own 跨切面技术真相——本 plan 修复的对象即该职责的失守面）

## Current Baseline

**两个架构 owner-doc 停在 M1 之前的状态：M1 交付的三个公共契约模块在 `docs/architecture/mission-driver-baseline.md` 的 Public Exports 登记面零出现；`docs/architecture/dsh-plugin-packaging.md` 四处与 build-bundle/assets/plan-status-gate 实况漂移。**（以下事实 2026-08-25 live 核实）

- **baseline 登记面空缺**（WI43 主项）：`docs/architecture/mission-driver-baseline.md` `## Public Exports vs Test Seams`（:97 起）是公共导出契约的登记段；live grep `ledger` 全文 0 命中——`ledger-frontmatter.mjs`/`ledger-sections.mjs`/`ledger-dualread.mjs`（M1-WI1/WI3/WI7 交付，四引擎读面 + 插件 assets 通道 + 两 guide 声明的 machine face）未登记。该文件自述交付进度停在 2026-08-23（P4 complete），M1（2026-08-25）零回写——违反其自身 Update Rule（WI43 文字：「该文件最后更新停在 M1 之前，违反其自身 Update Rule」）。
- **packaging 文档漂移四处**（WI43 伴生项，`docs/architecture/dsh-plugin-packaging.md`）：
  - :119 "the 19 allowed modules land in `assets/src/`"——`plugin/dsh/scripts/build-bundle.mjs:42-52` `ALLOWED_MODULES` 实数 **22**（19 + ledger 三件，live 计数；注释自带 ledger 段说明）；
  - :108 目录树注释 `src/ # the engine pure-module closure (19 files)`——`plugin/dsh/assets/src/` 实数 **22**（含 ledger 三件，live 计数；与 :119 同族漂移但措辞为 files，计数断言须覆盖）；
  - :209 段落自述 `PLAN_STATUS_RE` "imported from the bundled `assets/src/plan-check.mjs`"——`plugin/dsh/src/plan-status-gate.ts:57` 实际 `import { PLAN_STATUS_RE } from '../assets/src/ledger-dualread.mjs'`（0635-3/WI7 接线后改道，文档未跟；:276 P3 交付表行存在同款旧源引用，live 复核）；
  - import-graph / 模块枚举缺 ledger 链（引擎读面 → ledger 模块的依赖边未进文档枚举面）。
- **职责依据**：`docs/context/source-of-truth-and-precedence.md`——`docs/architecture/` owns cross-cutting technical and module-boundary truth；公共契约模块的登记缺失使消费者（含模板消费者）无从发现 machine face 的权威入口，属 owner-doc 契约漂移（非-degradable，Confirmed owner-doc drift）。
- **无漂移面（限定口径）**：`tools/mission-driver/CONTEXT.md` 已有两段 ledger 库描述（frontmatter/sections——live 核实准确）；`ledger-dualread` 在 CONTEXT.md 无专段（非 WI43 点名面，本 plan 不扩）——「CONTEXT.md 无漂移」的准确口径为「既有两段无漂移」，而非「三模块全覆盖」。`docs/plans/00-plan-authoring-and-execution-guide.md`/`docs/backlog/00-roadmap-authoring-guide.md` 的 machine face 声明准确——均不在本 plan 目标内。
- **性质**：纯文档变更，零代码/零插件/零 CI 面；`verify: [test]` 仍适用（守护全绿基线不因文档批次的合并而回退）。

## Goals

- `docs/architecture/mission-driver-baseline.md` §Public Exports vs Test Seams 登记 M1 三模块（名称、契约 owner 分节、消费面、约束注记），并按该文件自身 Update Rule 的要求形态补更新。
- `docs/architecture/dsh-plugin-packaging.md` 四处漂移修复（:119 与 :108 计数、:209 与 :276 PLAN_STATUS_RE import 源、import-graph 补 ledger 链），并对两文档做 ledger 相关键的全量核对（漂移即修）。
- 全部修复以 rg 断言钉住（roadmap 核心纪律 2：每条 claim 配命令）；roadmap WI43 tick 回写。

## Non-Goals

- roadmap 自身格式清理（`## Status Values` 表与 `ready` 散文残留——deep-audit round 1 P2，归 roadmap 文件维护面，非 WI43 字面；0925 批次回写步只同步 `> Last Updated` 日期）。
- monitor extends 合并 P2、duplicate-anchor 结构 error 等 Follow-up Backlog 其余项（各有归属，本 plan 不收编）。
- 两架构文档中与 ledger 无关的历史陈述重写（只修 WI43 点名的漂移面 + ledger 相关键核对命中项，不做全文重构）。
- M2 0815 批次（law 层）交付后的登记——该批次的 Public Exports 登记随其自身 plan 的文档同步项落地。

## Task Route

- Type: `implementation-only change`（owner-doc 契约同步——Confirmed owner-doc drift 的修复，无行为面）
- Owner Docs: `docs/architecture/mission-driver-baseline.md`（修复对象 + 其自身 Update Rule）、`docs/architecture/dsh-plugin-packaging.md`（修复对象）、`docs/design/age-autonomy/01-file-ledger.md`（被登记模块的契约 owner——登记内容的事实来源）、`plugin/dsh/scripts/build-bundle.mjs`（ALLOWED_MODULES 实况）、`plugin/dsh/src/plan-status-gate.ts`（import 实况）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（文档同步无审计 prompt 之外的匹配面）→ Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（纯文档变更）

## Phase 1 — baseline 公共契约登记

Targets: `docs/architecture/mission-driver-baseline.md`
Skill: none

- Item Types: `Fix`
- Prereqs: 无（可与 0925-1/2 并行——不同文件）

- [x] `Fix` §Public Exports vs Test Seams 登记三模块：`ledger-frontmatter.mjs`（frontmatter 子集解析器 + plan/roadmap 字段集校验器，契约 01 §2/§3.1/§4.1/§5.1）、`ledger-sections.mjs`（计数域扫描 + 内联审计区结构校验 + basisHash/deriveCompleted + 扫描谓词族，契约 01 §2.5/§3.2/§3.3/§4.2/§4.4/§5.2）、`ledger-dualread.mjs`（双读 resolver + env 断路器 `MISSION_DRIVER_LEDGER`，01 §5.2 单实现纪律的落点）；各条注明消费面（plan-check/flow-loader/roadmap-check/monitor 四引擎读面 + plugin assets 复制通道 + `docs/plans/00-guide`/`docs/backlog/00-roadmap-guide` 声明的 machine face）与零 import/零 npm 约束。
- [x] `Fix` 按该文件自身 Update Rule 补更新：执行时先读其 Update Rule 字面条款，按其要求的形态（登记行/changelog/状态段）落地——不发明新形态；M1 交付进度自述段同步（2026-08-25 M1 ledger 基座已落地一句，含 0635 批次指针）。
- [x] `Fix` 全文 ledger 相关键核对：`rg -n "ledger|dualread|frontmatter" docs/architecture/mission-driver-baseline.md` 逐命中核对与实况一致性，漂移即修（bounded：仅 ledger 相关键，不做无关重构）。

Exit Criteria:

- [x] `rg -c "ledger-frontmatter" docs/architecture/mission-driver-baseline.md` ≥ 1 ∧ `rg -c "ledger-sections"` ≥ 1 ∧ `rg -c "ledger-dualread"` ≥ 1（三模块名逐个进入登记段——逐模块断言防单模块多次提及凑数）
- [x] 登记内容与 01 §契约分节、build-bundle ALLOWED_MODULES、四读面 import 实况一致（抽查指针可点）
- [x] Update Rule 要求的形态全部满足（执行时以规则字面为准）
- [x] `docs/logs/` 更新

## Phase 2 — packaging 文档漂移修复

Targets: `docs/architecture/dsh-plugin-packaging.md`
Skill: none

- Item Types: `Fix`
- Prereqs: 无

- [x] `Fix` 计数更正两处：:119 "the 19 allowed modules" → 22 并点名 ledger 三件（与 `build-bundle.mjs:42-52` ALLOWED_MODULES 实况一致，注明计数来源与 ledger 段注释）；:108 目录树注释 "(19 files)" → 22（与 `plugin/dsh/assets/src/` 实况一致）。
- [x] `Fix` PLAN_STATUS_RE import 源更正两处：:209 与 :276 的 `assets/src/plan-check.mjs` → `assets/src/ledger-dualread.mjs`（与 `plan-status-gate.ts:57` 实况一致；:209 段落如含「零 engine diff」等派生表述，一并核对语境不被更正破坏）。
- [x] `Fix` import-graph / 模块枚举补 ledger 链（精确边，live 核实的 import 实况）：`plan-check.mjs` → `ledger-dualread.mjs` + `ledger-sections.mjs`；`flow-loader.js` → `plan-check.mjs` + `ledger-dualread.mjs`；`roadmap-check.mjs` → `ledger-dualread.mjs` + `ledger-sections.mjs`；库内链 `ledger-sections.mjs` → `ledger-frontmatter.mjs`、`ledger-dualread.mjs` → `ledger-frontmatter.mjs` + `ledger-sections.mjs`。注意：`monitor.js → ledger-dualread.mjs` 边**不进** packaging 文档的 import-graph（该图是「allowed list 编码的 import 闭包」，monitor.js 属 NOT-bundled 面——边写进去反而制造新漂移；monitor 消费面归 Phase 1 baseline 登记的消费面清单表述）。按文档既有枚举形态增量，不发明新图形。
- [x] `Fix` 全文 ledger 相关键核对：`rg -n "ledger|allowed modules|ALLOWED|\b19\b" docs/architecture/dsh-plugin-packaging.md` 逐命中核对（`\b19\b` 覆盖 "19 files" 类措辞变体），漂移即修（同 Phase 1 边界——仅 ledger/模块计数相关命中，不做无关重构）。

Exit Criteria:

- [x] `rg -n "19 (allowed|files)" docs/architecture/dsh-plugin-packaging.md` 0 命中
- [x] `rg -n "assets/src/plan-check.mjs" docs/architecture/dsh-plugin-packaging.md` 0 命中（PLAN_STATUS_RE 语境的旧源引用清除——live 复核修前命中恰为 :209 与 :276 两处，机械零命中即达标）
- [x] 文档模块计数与 `ALLOWED_MODULES` 及 `assets/src/` 实测清单一致（22，逐名可对）
- [x] `docs/logs/` 更新

## Phase 3 — 回写与收口断言

Targets: `docs/backlog/age-autonomy-implementation-roadmap.md`、`docs/logs/`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1/2 完成

- [x] `Add` roadmap 回写：WI43 `[x]` + 证据指针（两文档 diff 摘要 + Phase 1/2 的 rg 断言输出）；头部 `> Last Updated` 日期同步（回写步固有动作）。WI24 不勾（M2 收口门归后续批次）。
- [x] `Proof` 收口断言链：逐模块 `rg -c "ledger-<name>" docs/architecture/mission-driver-baseline.md` ≥ 1（×3）；`rg -n "19 (allowed|files)" docs/architecture/dsh-plugin-packaging.md` 零命中；`rg -n "assets/src/plan-check.mjs" docs/architecture/dsh-plugin-packaging.md` 零命中（PLAN_STATUS_RE 语境）；`pnpm --prefix tools/mission-driver test` 全绿（纯文档批次守护基线）；`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0。

Exit Criteria:

- [x] roadmap WI43 `[x]` + 证据指针 + Last Updated 同步；WI24 仍未勾
- [x] Phase 1/2 全部 rg 断言绿
- [x] `pnpm --prefix tools/mission-driver test` 全绿
- [x] `docs/logs/` 收口条目

## Draft Review Record

- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0925-3-m2-wi43-arch-ownerdoc-contract-sync-1-0160fedd to ses_reviewer_9
- 2026-08-25：iteration 1，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0925-3-m2-wi43-arch-ownerdoc-contract-sync-1-0160fedd（独立评审 ses_reviewer_9：baseline 全表实证——ledger 零命中、Public Exports :97、19/22 计数、PLAN_STATUS_RE 源、Update Rule :132；阻塞 1 项 = :108 "(19 files)" 同族漂移逃逸全部 item/sweep/exit——已并入（四处漂移口径 + `\b19\b` sweep + `19 (allowed|files)` exit）；非阻塞 4 项：:276 枚举、CONTEXT.md 口径精确化、逐模块 rg 断言、精确 import 边——均已修）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0925-3-m2-wi43-arch-ownerdoc-contract-sync-2-86a6eba5 to ses_reviewer_10
- 2026-08-25：iteration 2，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0925-3-m2-wi43-arch-ownerdoc-contract-sync-2-86a6eba5（独立复核：五项修复落地；剩余 2 项边表精度 = 缺库内边 dualread→sections、monitor 边误入 packaging 图（monitor 属 NOT-bundled 面，写入即制造新漂移）——已修；另 plan-check.mjs grep exit 收紧为机械零命中 + 修前计数 2 钉住）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0925-3-m2-wi43-arch-ownerdoc-contract-sync-3-cf1e32b3 to ses_reviewer_11
- 2026-08-25：iteration 3，共识 acceptable-as-is #review-2026-08-25-063133-mission-driver-2026-08-25-0925-3-m2-wi43-arch-ownerdoc-contract-sync-3-cf1e32b3（独立复核：三处编辑全部落地；边表对 live import 逐边精确匹配且穷尽（repo-wide importer 集合核对，monitor 按 NOT-bundled 排除理由成立——FORBIDDEN_MODULES 实证）；全文件格式扫描无回归。可转 active）

## Verification

## Closure

## Deferred But Adjudicated

### roadmap 退役格式段清理（## Status Values 表 + ready 散文）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: deep-audit round 1 P2，归 roadmap 文件自身维护面而非 WI43 字面（WI43 = 两架构 owner-doc 契约同步）；00-roadmap-authoring-guide changelog 已退役该格式，roadmap 消息面不受其影响
- Successor Required: no（条件触发：下一次 roadmap 结构性维护或 M2 收口批次顺带）
