# mdc-1 审计收敛：P0/P1/P2 拟制闸门 + 干净短路 + 行号锚点护栏

> Plan Status: completed
> Last Reviewed: 2026-07-22 (closed — solo cold-replay, 556/556 green)
> Source: `docs/requirements/mission-driver-convergence-and-cost-optimization.md`（R1 + R2 + R3）
> Related: 回归来源 `docs/plans/mission-driver-step-audit/2026-07-20-1559-1-draft-plans-audit-gate.md`；本计划的成本/护栏后继项 R4/R5/R6 见 Deferred But Adjudicated
> Audit: required

## Current Baseline

现场基线（2026-07-22 对 `tools/mission-driver/` 实读，非记忆）：

- **审计无条件写 open 报告**：`prompts/multi-audit.md:5-11` 与 `prompts/open-audit.md:5-11` 把结果文件头**硬编码** `> Audit Status: open`，无论发现是 blocking / material 还是 LOW/doc-only。结尾 marker 只有 `issues` / `clean` 两值，且**该 marker 不被 flow 消费**（`flows/deep-audit-loop.json` 中 `clean` 与 `issues` 走同一条边）。
- **计划生成由 open 文件驱动**：`src/flow-loader.js:85-107` `_scanOpenAuditsList` 只把 `> Audit Status:` 头等于 `open`（`:93`）的 mission 级审计计入 `openAudits()`。`prompts/draft-from-audit.md:3` 读所有 `open` 文件起草 1-3 个修复计划，并把源审计头改为 `planned`（`:11`）。
- **无严重度阈值**：只要写了 open 文件，LOW/doc-only 也会变计划、进 `plan-execution`（EXECUTE + CLOSURE_SCRIPT_CHECK + CLOSURE_AUDIT + BUILD_VERIFY，全量 `npm test`）。
- **无干净短路**：`flows/mission-driver.json` 的 `DRAFT_PLANS` 只有 `created`/`nothing` 出口（`nothing → DEEP_AUDIT`），无旧版 `done → completed`。唯一收口靠 `src/engine.js:615-624` `_shouldCompleteOnAuditQuota`，条件 `round >= maxAuditRounds && openAudits==0 && activePlans==0`——即便某轮干净也要等额度耗尽（`maxAuditRounds=3`）。`auditRound` 在 `_wfOpen`（`engine.js:347`）自增，闸门在 `run()`（`:1489-1494`）读 pre-increment 值。
- **行号自激**：owner doc `docs/architecture/mission-driver-baseline.md` 曾用 `engine.js:NNN` 行号引用；引擎改动移动函数行号（`_writeWorkflow` 427→442）→ 下轮审计报"行号过期"→ 再起草 doc-sync 计划。`tools/check-doc-references.mjs` 已校验 `docs/architecture,docs/design,docs/references` 的反引号路径 + markdown 链接（`:10,:30-31`），但**不检查 `file:NNN` 行号引用**。该工具当前未链入 `tools/mission-driver` 的 `npm test`（`package.json:test = node --test test/*.test.js && node src/prompt-check.mjs`）。

**实测证据（run `_tmp/2026-07-22-075526-mission-driver`）**：roadmap 5 个 WI 启动即全 `done`；3 轮 DEEP_AUDIT 每轮 MULTI_AUDIT/OPEN_AUDIT 均 `issues` + 写 open 文件 + SCAN `created`；最后一轮审计自评 "passes, no blocking issue, 533 green"，仅 2 个 LOW/doc-only（B1/B2 行号漂移），却仍起草 `1223-3` 并付全量验证。总耗时 5h38m。

**Gap**：审计侧无优先级分级、拟制闸门不看优先级 → 每轮制造 LOW 发现并写 open 文件 → 泛滥计划（根因 A，本次已触发）；干净时也不早退（根因 B，本次未触发但潜在）；行号引用无护栏 → 自激循环（根因 A 载体）。

## Goals

- **G1（R1）**：审计报告**保持原状**（仍写文件、头仍 `> Audit Status: open`、结尾 marker 仍 `issues`/`clean`），但对**每一项发现分级 P0/P1/P2**。计划拟制的闸门改在 `draft-from-audit`：**只有 P0+P1 发现才拟制修复计划**；某审计若只含 P2，则把 P2 项落入 follow-up backlog、并把该审计头由 `open` 改为 `triaged`（已复核、无 P0/P1），使其退出 `openAudits()`。P0/P1 为必修（非降级）。
- **G2（R2）**：本轮 DEEP_AUDIT 后无 open audit、无 active plan 时，mission **立即 `completed`**，不再等 `round >= maxAuditRounds`。恢复旧版第 1 轮收口语义，但保持引擎强制。
- **G3（R3）**：`tools/check-doc-references.mjs` 增加对 owner/architecture doc 中 `file.ext:NNN` 行号引用的检查（报错），并纳入可运行的验证链，使"行号过期"不再成为审计发现。
- **G4（Proof）**：集成测试证明"仅 P2 发现的运行 ≤1 轮 DEEP_AUDIT 收口、零修复计划；P0/P1 发现正常起草；clean 轮触发早退"。

## Non-Goals

- 不改 mission-driver 状态机主干（CHECK → REVIEW → EXEC → DRAFT → DEEP_AUDIT 保留）。
- 不移除 DEEP_AUDIT 能力，不动 `--fast`/`fastSkipSteps`。
- 不实现 R4（doc-only 轻量执行路径）、R5（模板 stub 造重复 owner doc 护栏）、R6（空目标启动前置）——见 Deferred But Adjudicated（后继计划）。
- 不重写 god-file（`engine.js`/`monitor.js` 拆分）——独立架构跟进。
- 不回改已落地的 `1559-1` 契约本身（不恢复 prompt 的 `done` marker）；G2 用引擎侧短路实现等价早退。
- **不引入 `blocking|material|trivial` 严重度头或新的 `Audit Status` 取值体系**；分级只用 P0/P1/P2 写在报告发现条目内，审计文件头保持原状（新增的 `triaged` 仅用于"P2-only 已复核"的收口标记，语义等价现有 `planned` 家族）。

## Task Route

- Type: `architecture change`（改变 mission 退出条件 + 审计→计划的拟制闸门 + 验证链；涉及 flow JSON + 引擎 + prompt + flow-loader 协同，须同批发布）。
- Owner Docs: `tools/mission-driver/design/mission-driver-flow-design.md`（audit 收敛语义 + P0/P1/P2 拟制闸门）、`docs/requirements/mission-driver-convergence-and-cost-optimization.md`（R1/R2/R3）、`docs/architecture/mission-driver-baseline.md`（引用约定）。
- Skill Selection Basis: `Skill: none` — 决策与契约由需求文档 R1/R2/R3 直接指定；G2 复用 `_shouldCompleteOnAuditQuota` / `_reconcileTerminal` 已有范式，无匹配可复用 skill。

## Infrastructure And Config Prereqs

- 无新增 infra；引擎核心零 npm 依赖约束不破。flow JSON + prompt + engine + flow-loader **同批落地**（避免"prompt 标 P2 但 draft 侧仍起草"的半态）。
- 向后兼容：旧审计文件无 P0/P1/P2 分级时，`draft-from-audit` 退化为按现有"有 open 即起草"处理。

## 契约定义（结构边界，落地前锁定）

审计报告**头部保持原状**（`> Audit Status: open` / `> Audit Type: ...` / `> Mission: ...`，marker 仍 `issues`/`clean`）。变化只在两处：

1. **报告正文每项发现须标优先级** `[P0]` / `[P1]` / `[P2]`：
   - `P0` = 阻断性/契约/正确性缺陷（必修）。
   - `P1` = 实质问题，应修（必修）。
   - `P2` = 非阻断的琐碎项（doc 行号漂移、措辞、命名一致性等）——记录但不单独拟制计划。
2. **拟制闸门在 `draft-from-audit`**：跨所有 open 审计只就 **P0+P1** 发现拟制 1-3 个计划；
   - 某审计含 P0/P1 → 起草后按现有规则把其头 `open → planned`（含的 P2 残余写入 follow-up backlog）。
   - 某审计只含 P2 → 不起草，把 P2 写入 `{{backlogDir}}` follow-up，并把其头 `open → triaged`（已复核、无 P0/P1），使其退出 `openAudits()`、不再跨轮重触发。
   - 无 P0/P1 且无 P2（clean）→ 现有 clean 路径不变。

`_scanOpenAuditsList`（`flow-loader.js:85-107`）**保持只认 `open`**——`triaged`/`planned` 天然不计入，无需改判定逻辑；收敛靠 `draft-from-audit` 的状态翻转达成。

## Execution Plan

### Phase 1 - P0/P1/P2 分级 + 拟制闸门（R1 / G1）

Status: completed
Targets: `tools/mission-driver/prompts/multi-audit.md`、`prompts/open-audit.md`、`prompts/draft-from-audit.md`
Skill: none

- Item Types: `Fix | Add | Decision`
- Prereqs: 上方"契约定义"锁定

- [x] **(Decision)** 分级用 **P0/P1/P2** 三档，写在报告发现条目内（不引入 `Audit Status`/severity 新头体系）。拟制闸门只认 **P0+P1**。备选（在文件头加 severity 枚举）被否：改动契约面更大、且用户明确要求报告保持原状。残余风险：P1/P2 边界由 prompt 判定 → Phase 4 测试兜底，且 P2 误判只影响"是否本轮修"，P0/P1 必修不受影响。
      - Skill: none
- [x] **(Fix)** `multi-audit.md` / `open-audit.md`：报告头与结尾 marker **保持原状**；新增要求——每项发现必须前缀 `[P0]`/`[P1]`/`[P2]` 并给分级依据一句话。附 P0/P1/P2 判定说明（P0 阻断/契约/正确性；P1 实质应修；P2 琐碎非阻断如 doc 行号/措辞/命名）。
      - Skill: none
      - Applied: 两个 prompt 均加"Priority every finding"段，头/marker 未动（prompt-check 仍 OK）。
- [x] **(Fix)** `prompts/draft-from-audit.md`：改为**只就 open 审计里的 P0+P1 发现**拟制 1-3 个计划；含 P0/P1 的审计起草后头 `open→planned`（P2 残余入 `{{backlogDir}}` follow-up）；**只含 P2 的审计不起草**，把 P2 写入 follow-up 并把头 `open→triaged`；全 clean 走现有 `nothing` 路径。P0/P1 为必修，计划项须标 `Fix`（非降级）。
      - Skill: none
      - Applied: 新增"Drafting gate"段 + Rule 3 三分支（planned/triaged/clean）。
- [x] **(Add)** `src/flow-loader.js`：确认 `_scanOpenAuditsList` 对 `triaged` 头**不计入** `openAudits()`（当前只精确匹配 `open`，天然满足；加一条测试固定该行为，防未来放宽匹配时回归）。
      - Skill: none
      - Applied: `test/audit-convergence.test.js` 固定 open 计入、triaged/planned 不计入。

Exit Criteria:

- [x] 只含 P2 的审计经 `draft-from-audit` 后不产生计划、其头变为 `triaged`、`openAudits()` 不再命中（单测 `audit-convergence.test.js`）。
- [x] 含 P0/P1 的审计仍正常起草并标 `Fix`、头变 `planned`（prompt 契约 + 回归绿）。
- [x] 审计报告头/marker 与改动前一致（无新增 `Audit Severity` 头；prompt-check OK）。
- [x] Owner doc `mission-driver-flow-design.md` 记录 P0/P1/P2 拟制闸门（§6 + changelog）。
- [x] `docs/logs/` updated。

### Phase 2 - 干净短路早退（R2 / G2）

Status: completed
Targets: `tools/mission-driver/src/engine.js`（`_shouldCompleteOnAuditQuota`、audit-gate transition 段）、`test/draft-plans-audit-gate.test.js`
Skill: none

- Item Types: `Fix | Decision`
- Prereqs: Phase 1（P0/P1 拟制闸门决定"本轮是否留下 open audit / active plan"的输入）

- [x] **(Decision)** 早退实现方式：**扩展 `_shouldCompleteOnAuditQuota`**——当 `DRAFT_PLANS` 出 `nothing` 且 `activePlans()==0` 且 `openAudits()==0` 且**DEEP_AUDIT 至少跑过 1 轮**（`auditRound >= 1`）时，返回 `completed`，**不再要求 `round >= maxAuditRounds`**。备选（deep-audit-loop 加 `clean` 出口 + 主 flow 新边）被否：改动面更大且与现有 gate 语义重叠。残余风险：需确保"DEEP_AUDIT 至少跑过一次"才早退（避免 cold-start 未审计就退），用 `auditRound >= 1` 判定。
      - Skill: none
- [x] **(Fix)** 修改 `_shouldCompleteOnAuditQuota`：`max>0 && auditRound>=1 && ap.length===0 && oa.length===0 → true`（去掉 `round>=max` 硬条件，保留 `round>=max` 作为**兜底**上限仍在 `run()` 入口闸门生效）。同步更新 audit-gate 日志文案（"quota exhausted"→"clean short-circuit"）。
      - Skill: none

Exit Criteria:

- [x] P2-only（或 clean）场景在**第 1 轮** DEEP_AUDIT 后即 `completed`（`draft-plans-audit-gate.test.js` Case B 改写：断言 `auditRound===1`）。
- [x] 有 P0/P1 的场景仍按 open audit 继续起草、直到 P0/P1 清空或撞 `maxAuditRounds` 兜底（Case A/C 回归绿）。
- [x] `_reconcileTerminal` 不与早退冲突（gate 触发时 ap/oa 均空；全套测试绿）。
- [x] Owner doc 记录早退语义（`mission-driver-flow-design.md` changelog + §3）。
- [x] `docs/logs/` updated。

### Phase 3 - 行号锚点护栏（R3 / G3）

Status: completed
Targets: `tools/check-doc-references.mjs`、`docs/architecture/mission-driver-baseline.md`、`tools/mission-driver/test/doc-line-refs.test.js`
Skill: none

- Item Types: `Add | Fix | Decision`
- Prereqs: 无（与 Phase 1/2 独立）

- [x] **(Add)** `check-doc-references.mjs` 增加 `file.ext:NNN`（含 `NNN-MMM` 区间）行号引用检测，导出 `findLineRefs` + CLI guard，命中即 `exit 1` 并列出文件+行；逃逸 `AGE_ALLOW_LINE_REFS=1`。限定已知代码/文档扩展名以避免 URL/端口误报。
      - Skill: none
- [x] **(Fix)** 清理 `docs/architecture/mission-driver-baseline.md` 残余行号引用（`mission-check.mjs:13/14/24-50`）为函数名锚点（`REQUIRED_FIELDS`/`REQUIRED_COMMANDS`/`resolveExtends` in `src/mission-check.mjs`）。
      - Skill: none
- [x] **(Decision)** 验证链落点：R3 交付 = **行号护栏**。以 `test/doc-line-refs.test.js`（已链入 `npm --prefix tools/mission-driver test`）作为 R3 的可运行验证，断言检测器行为 + `docs/architecture/` 零行号引用。**未**把整仓 `check-doc-references.mjs` 设为硬门——它含既存的 `[backtick]` 路径存在性告警（`src/x` 简写、示例 bug 文件名），属独立既存缺陷、与收敛无关，纳入会超范围。残余风险：那些 `[backtick]` 告警仍在，记为范围外。
      - Skill: none

Exit Criteria:

- [x] 新增测试：`foo.js:42` / `engine.js:427-436` 被检出；anchor 形式不误报（`doc-line-refs.test.js`）。
- [x] `mission-driver-baseline.md` 全文无 `file:NNN` 行号引用（`node tools/check-doc-references.mjs` 行号段零命中 + 测试断言）。
- [x] 检查已链入实际会运行的验证命令（`doc-line-refs.test.js` ∈ npm test）。
- [x] `docs/logs/` updated。

### Phase 4 - 收敛证明（G4 / Proof）

Status: completed
Targets: `tools/mission-driver/test/audit-convergence.test.js`、`test/doc-line-refs.test.js`、`test/draft-plans-audit-gate.test.js`
Skill: none

- Item Types: `Proof`
- Prereqs: Phase 1 + Phase 2 + Phase 3

- [x] **(Proof)** 集成/单元测试（`node --test`）：
      - Case A（P2-only 收口）：`audit-convergence.test.js` — triaged 审计不被 `openAudits()` 计入 + 引擎短路（`draft-plans-audit-gate.test.js` Case B：auditRound 停在 1）。
      - Case B（P0/P1 正常起草 / 回归）：`draft-plans-audit-gate.test.js` Case A/C/D/E/F/G 全绿。
      - Case C（撞 `maxAuditRounds` 兜底）：`audit-count.test.js` 入口闸门未改，仍绿。
      - 验证命令：`npm --prefix tools/mission-driver test`。
      - Skill: none

Exit Criteria:

- [x] 三例覆盖通过（audit-convergence 3 例 + doc-line-refs 3 例 + gate Case B 改写）。
- [x] `npm --prefix tools/mission-driver test` 全绿（**556 pass / 0 fail**，含 `prompt-check: OK`）。
- [x] `docs/logs/` updated。

## Draft Review Record

- Independent draft review: **solo cold-replay**（用户直接指示"直接开始实现，直到完整所有修改"，无第二 reviewer/subagent 可用）。按 AGENTS.md Reviewer-Availability Fallback：本计划为 tooling 改动（flows/prompts/engine/doc-check + 测试）、非 protected 区、非 high-risk，且有 556/556 测试兜底，solo cold-replay 可接受，限制在此记录。计划边界在实现中与用户就"P0/P1/P2 取代 severity 头""P2-only 是否仍跑满 3 轮"两点确认收敛。

## Closure Gates

- [x] in-scope 行为完整（G1–G4 落地）
- [x] 相关 owner doc 对齐（`mission-driver-flow-design.md` P0/P1/P2 拟制闸门 + 早退语义；`mission-driver-baseline.md` 行号引用已清）
- [x] 验证已运行：`npm --prefix tools/mission-driver test`（556 pass）+ `node tools/check-doc-references.mjs`（行号段零命中）
- [x] 无 in-scope 项被降级为 deferred/follow-up（R4/R5/R6 从一开始即声明为后继，非中途降级）
- [x] 独立 draft review 完成并记录（solo cold-replay，限制已记录）
- [x] 文本一致性：顶部 status、各 phase status、exit criteria、closure gates、log 一致
- [x] closure audit：solo cold-replay（Reviewer-Availability Fallback，限制已记录）
- [x] closure 证据落文件（测试输出 + 本计划 + `docs/logs/2026/07-22.md`）

## Deferred But Adjudicated

### R4 — doc-only/nitpick 轻量执行路径（不付全量 BUILD_VERIFY）

- Classification: `optimization candidate`
- Why Not Blocking Closure: Phase 1 的 P0/P1/P2 闸门已让 P2 不再生成计划，nitpick 的全量验证成本主因已消除；R4 是"P0/P1 但纯文档类轻量修复"的进一步优化。
- Successor Required: `yes`（触发：P0/P1 但纯文档类修复仍频繁触发全量 `npm test` 时）

### R5 — 审计据模板空 stub 造重复 owner doc 的护栏

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 与收敛主结果面不同（属审计 prompt 的"发现质量"治理）；本次由 `mission-driver-baseline.md` 案例暴露，但独立成面。
- Successor Required: `yes`（触发：再次出现审计据 `docs/architecture/` 空 stub 起草"新建 owner doc"计划）

### R6 — 空目标启动前置校验（roadmap 无 todo 时不默认进纯审计）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 属 CLI/启动 UX；收敛修复后即便进纯审计也能 1 轮收口，紧迫性下降。
- Successor Required: `yes`（触发：用户仍误在空 roadmap 上长跑）

## Closure

Status Note: R1（P0/P1/P2 拟制闸门）+ R2（干净短路）+ R3（行号护栏）全部落地并有测试兜底。审计报告契约保持原状（头/marker 未动），分级写在正文；P2-only 审计经 `draft-from-audit` 标 `triaged` → `openAudits()==0` → 引擎 `auditRound>=1` 短路收口。可关闭。

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay（AGENTS.md Reviewer-Availability Fallback；无第二 reviewer；非 protected / 非 high-risk tooling 改动，限制已记录）。
- Evidence:
  - `npm --prefix tools/mission-driver test` → **556 pass / 0 fail**，末行 `prompt-check: OK`。
  - `node tools/check-doc-references.mjs` 行号引用段零命中（`docs/architecture/` 已清）。
  - 触及文件：`prompts/multi-audit.md`、`prompts/open-audit.md`、`prompts/draft-from-audit.md`、`src/engine.js`（`_shouldCompleteOnAuditQuota` + audit-gate 文案）、`tools/check-doc-references.mjs`、`docs/architecture/mission-driver-baseline.md`、`design/mission-driver-flow-design.md`、`test/audit-convergence.test.js`(new)、`test/doc-line-refs.test.js`(new)、`test/draft-plans-audit-gate.test.js`(Case B)、`docs/logs/2026/07-22.md`、本计划。

Follow-up:

- R4 / R5 / R6 后继计划（见 Deferred But Adjudicated）。
- 范围外既存缺陷：`check-doc-references.mjs` 的 `[backtick]` 路径存在性告警（`mission-driver-baseline.md` `src/x` 简写、`document-naming-and-timeliness.md` 示例文件名）——与收敛无关，可另开 doc-hygiene 计划处理。
