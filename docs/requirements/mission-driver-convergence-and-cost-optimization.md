# Requirement — mission-driver 收敛性与成本优化

> Status: draft (implementation-ready pending human review)
> Source inputs:
> - Run log `_tmp/2026-07-22-075526-mission-driver/`（`run-state.json` / `events.jsonl` / `oc-*.log`——运行自身日志，非事后推断）
> - 分支 `draft-robustness` 最新提交 `4094a33`（46 commit squash）
> - 对照旧版本 `C:\Work\cardlite-acq\tools\mission-driver`（未 squash、逐提交，未出现"必满 3 轮"）
> - Owner docs: `tools/mission-driver/design/mission-driver-flow-design.md`、`flows/*.json`、`src/engine.js`、`src/flow-loader.js`
> Verification command: `npm --prefix tools/mission-driver test`（当前基线 533/533 green）

## Purpose / 目标

一次进入"纯审计-修复模式"（roadmap 已无 `todo`）的 mission 运行耗时 **5h38m**、跑满 3 轮 DEEP_AUDIT，最终审计结论却是"passes, no blocking issue, 533 green"，仅剩 2 个 LOW/doc-only 发现。本需求要让这类运行：

1. 在无 **material**（实质）缺陷时**提前干净收口**，而不是把 `maxAuditRounds` 当成正常退出条件跑满。
2. 不再为 **LOW / doc-only nitpick** 支付完整的 EXECUTE + CLOSURE + BUILD_VERIFY（全量测试）成本。
3. 打破"修文档 → 引擎行号漂移 → 下一轮审计又报行号过期"的**自激反馈循环**。
4. 不让 DEEP_AUDIT 依据**模板空 stub** 凭空造出"覆盖缺口"，进而生成重复 owner doc。

---

## 一、上一次运行的事实（证据）

启动时 `docs/backlog/mission-driver-draft-robustness-roadmap.md` 的 5 个 work item（WI1–WI5）**已全部 `done`**。因此第一轮 `DRAFT_PLANS` 立即返回 `nothing`，整段 5h38m 本质是**在一个已完成目标上做自我审计-修复**。

### 时间分布（`run-state.json` 各步 `durationMs`）

| 阶段 | 累计 | 占比 | 说明 |
| --- | --- | --- | --- |
| EXEC_PLANS（×3） | ~3h20m | ~59% | 共 **11 个** plan-execution 子流程，每个 = EXECUTE + CLOSURE_SCRIPT_CHECK + CLOSURE_AUDIT + BUILD_VERIFY（4 个 opencode 子进程 + 一次全量 `npm test`） |
| DEEP_AUDIT（×3） | ~1h49m | ~32% | 每轮 = MULTI_AUDIT + OPEN_AUDIT + draft-from-audit，对全量代码库重型审计 |
| REVIEW_PLANS | ~17m | ~5% | 主要在第 1 轮 |
| DRAFT_PLANS（×4） | ~11m | ~3% | 每次都 `nothing`（roadmap 无 `todo`） |

- 耗时**不是** stall / 崩溃 / 重试造成：`events.jsonl` 仅 3 次 marker 修正，其余为正常 heartbeat。时间几乎全是**真实 agent 工作**。
- 11 个执行计划里只有 **3 个**是遗留的 roadmap 草稿计划（`2026-07-21-1605-*`），其余 **8 个是审计自生成的修复计划**（`0814-*` / `1106-*` / `1223-*`）——**~73% 的执行成本花在自审计修复上**。

### 3 轮 DEEP_AUDIT 每一步的 marker（运行自身日志）

| 轮次 | MULTI_AUDIT | OPEN_AUDIT | SCAN_NEW_RESULTS | 产出计划 |
| --- | --- | --- | --- | --- |
| 第 1 轮 | `issues` | `issues` | `created` | 0814-1/2/3（3 个） |
| 第 2 轮 | `issues` | `issues` | `created` | 1106-1/2（2 个） |
| 第 3 轮 | `issues` | `issues` | `created` | 1223-1/2/3（3 个） |

**关键事实：本次 3 轮是"每轮都真生成了 `Audit Status: open` 审计文件并起草了计划"导致的，不是"计数器写死必满 3 轮"导致的。** 三轮全部 `issues` + `created`，从未出现"某轮干净"的情况。

### 发现的实质：全是 LOW / doc-only nitpick

最后一轮 `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-multi-audit-*.md` 明确结论 **"passes multi-dimensional audit — there is no blocking issue"、533/533 green**，仅 2 个 **LOW / doc-only** 发现：

- **B1**：`docs/architecture/mission-driver-baseline.md:63` 引用 `_writeWorkflow, engine.js:427-436`，但 `_writeWorkflow` 实际已漂到 `engine.js:442`（`427-440` 现在是 `_finalizeWorkflow`）。
- **B2**：`mission-driver-baseline.md:79` 把 `subflowRuns` 排序不变量归到 `_wfClose`，实际在 `engine.js:1134` 的 `_executeSubflowStep` 内。

却仍被起草成修复计划 `1223-3-run-state-section-doc-anchors`，**又消耗一整轮 EXECUTE + 全量 BUILD_VERIFY**。

---

## 二、根因分析（区分"本次实测触发"与"潜在未触发"）

### 机制前提：计划生成由 `openAudits()` 驱动，与 `clean`/`issues` marker 无关

`src/flow-loader.js:85-107` 的 `_scanOpenAuditsList`：一个审计文件只有当 `> Audit Status:` 头**等于 `open`**（`:93`）才计入 `openAudits()`。`deep-audit-loop.json` 的 `SCAN_NEW_RESULTS` / `CHECK_OPEN_AUDITS` 靠 `openAudits().length > 0` 决定是否 `draft-from-audit`。

因此 `MULTI_AUDIT`/`OPEN_AUDIT` 的 `clean` 与 `issues` 走同一条边**本身不是缺陷**——真正的开关是"有没有一份 `Audit Status: open` 的报告落盘"。

### 根因 A（本次元凶·已触发）— 审计无严重度阈值 + 行号漂移自激

引擎对"写了 open 审计文件"**不设严重度门槛**：只要审计写了 open 报告，哪怕全是 LOW/doc-only，也会被起草成计划、进 EXEC、付全量 BUILD_VERIFY。

叠加**自激循环**（审计报告 B1 的 "Why this recurs" 自己点破，`:45`）：
1. 某轮修复往 `engine.js` 前部插代码（WI5 `_wfAppendSubflowRun`、mdr-remediate 决策注释等），把后面的函数整体下推（`_writeWorkflow` 从 ~427 → 442）。
2. owner doc `mission-driver-baseline.md` 用**行号引用** `engine.js:NNN` → 引用立即过期。
3. 下一轮审计交叉核对 → 报"行号过期" → 又起草 doc-sync 修复计划 → 又付一轮 EXEC+BUILD_VERIFY。
4. 修复动作本身（改文档/改引擎）再次移动行号 → 制造下一轮发现。

"the same defect class the mission already paid to close twice"——同一类缺陷被反复付费关闭。**每轮都能"挣到"审计文件，不是计数器逼的，是自己不断制造琐碎发现喂的。**

### 根因 B（潜在回归·本次未触发）— 删除了旧版"干净即提前收口"路径

`mission-driver-step-audit` 的 WI1 计划 `docs/plans/mission-driver-step-audit/2026-07-20-1559-1-draft-plans-audit-gate.md` 做了：

- 删除 `DRAFT_PLANS.transitions.done → completed` 与 `markerAliases["done"]`（Phase 1，`:68/:73`）；
- 新增引擎闸门 `_shouldCompleteOnAuditQuota`（`engine.js:615-624`），条件 `round >= maxAuditRounds && openAudits==0 && activePlans==0`；
- 提示词 `draft-from-roadmap.md` 删 `done` 分支。

**后果**：旧版（cardlite-acq）DRAFT_PLANS 能在"roadmap 完成 + DEEP_AUDIT 已跑过 + found nothing actionable"时发 `done` marker **第 1 轮直接收工**（旧 `draft-from-roadmap.md:62`；旧 `visits > maxAuditRounds` 只是安全上限）。新版把这条早退路径删了，**唯一收口靠 `round >= maxAuditRounds`**——把"上限"误当成"正常退出条件"。

**归因边界（重要，避免归错账）**：`1559-1` 只改**终止判断**，其 Non-Goals（`:40`）明确不动 `deep-audit-loop` / `multi-audit.md` / `open-audit.md`。它**不是**本次"3 轮都发现问题"的原因。且在本次"每轮都找到 LOW 发现"的场景下，旧版 `done` 同样因"found actionable"而发不出 → **新旧版本都会跑满 3 轮**。`1559-1` 的差异**只在"某轮真正干净"时**才显现（旧版第 1 轮停、新版仍满 3 轮），而该场景本次从未出现。故列为潜在回归，需一并修，但非本次元凶。

### 根因 C（同类模式的又一实例）— 审计据模板空 stub 造重复 owner doc

`docs/architecture/mission-driver-baseline.md` 并非人类需求，而是 DEEP_AUDIT 发现 **F4/N1-arch** 后由计划 `2026-07-21-1605-1-design-and-architecture-doc-sync`（创建提交 web 分支 `ed3afbb`）自动新建。该发现的依据（计划 `:20`）是：`docs/architecture/system-baseline.md` 是模板占位、`grep` mission-driver 契约在 `docs/architecture/` 零命中。即**拿仓库比对 AGENTS.md 模板脚手架的空 stub**，判为"覆盖缺口"。计划本给了低成本选项（README 加 deferral + backlog 记一行），agent 却选择**新建 125 行、重复 `design/*.md` 与 `CONTEXT.md` 既有契约描述**的文档——而这份新文档随后正是根因 A 行号漂移循环的载体。

---

## 三、架构审计（分支 `draft-robustness`，非阻塞）

当前 533/533 green、功能正确，以下为独立跟进项：

| 观察 | 证据 | 风险 | 建议 |
| --- | --- | --- | --- |
| 巨型 squash 提交 | `4094a33` 单提交 **37,521 insertions / 195 files**，混合 engine + web + docs + tests | 无法 bisect / review / 定位回归 | 后续按主题拆分提交；已在 log 保留原始 46 commit 清单 |
| god-file | `engine.js` 1992 行、`monitor.js` 1846 行、`main.js` 944 行 | 每轮审计需重读全文件，**直接推高 DEEP_AUDIT 单轮 30–40min 成本**；改动面大 | 按职责拆分（状态持久化 / transition 解析 / subflow 执行分离；monitor 前后端 API 分层） |
| owner doc 行号引用 | `mission-driver-baseline.md` Run-State 段（B1/B2） | 自激审计-修复循环的载体 | 见 R3 |
| owner doc 重复 | `mission-driver-baseline.md` 重述 `design/*.md`+`CONTEXT.md` 契约 | 多处同真相、易漂移 | 架构层优先"引用"既有 design/CONTEXT，而非重写 |

`engine.js` 拆分会**同时降低 DEEP_AUDIT 单轮成本**，与 R1/R2 收益叠加，建议排入后续 roadmap。

---

## Scope / 范围

设计细节归属 `tools/mission-driver/design/mission-driver-flow-design.md`，本文件定义 what 与验收。

### R1 — 审计严重度阈值（引擎强制，治根因 A）

- 审计结果契约区分 **blocking / material / trivial(LOW·doc-only)** 三档，结构化输出于 marker。
- 只有 **material 及以上**的发现才允许写 `Audit Status: open` 报告、才允许 `draft-from-audit` 起草修复计划。
- **trivial** 发现降级为 follow-up backlog（保留来源审计引用），不写 open 报告、不进本轮 EXEC。
- 阈值判定由 agent 依 prompt 产出，但**闸门在引擎侧强制**（不能只靠 prompt 自觉——与 brief-gate 同一原则）。

### R2 — 收敛短路：无 material 发现即提前完成（治根因 B）

- 恢复"本轮 DEEP_AUDIT 无 material 发现 ⇒ 立即完成"的语义，**不再等 `round >= maxAuditRounds`**。
- 实现方向（设计文档裁决）：`deep-audit-loop` 增加真正的 `clean`/`no-remediation` 出口 marker，主流程对该 marker 走提前完成；或扩展 `_shouldCompleteOnAuditQuota`，当本轮 auditEntry 子流程返回 clean 且无 open audit / active plan 时即 `completed`。
- 保留"引擎强制终止"的优点，同时找回旧版第 1 轮收口的行为。

### R3 — 打破 doc 行号自激循环（治根因 A 的载体）

- owner / architecture doc **禁用 `file.ext:NNN` 行号引用，改用函数名 / anchor**（`mission-driver-baseline.md` 的 Public Exports 段已采用，Run-State 段已由 `1223-3` 补齐——需固化为约定）。
- 增加纳入 `npm test` 链的**轻量静态检查**：对 owner/architecture doc 中新增的 `file:NNN` 行号引用报错。使"行号过期"不再成为审计发现。

### R4 — 成本护栏：nitpick 不付全量验证（治根因 A 的成本面）

- LOW / doc-only 修复不触发完整 `plan-execution`（EXECUTE + CLOSURE_AUDIT + 全量 BUILD_VERIFY）。选项（设计裁决）：doc-only 走轻量执行路径（跳过或仅跑受影响的快速校验）；或 trivial 批量合并为单个 follow-up 人工择期处理。

### R5 — 审计据模板 stub 造重复文档的护栏（治根因 C）

- DEEP_AUDIT 不得仅因 `docs/architecture/` 的**模板空 stub**（`system-baseline.md`/`module-boundaries.md`/`project-vision.md`）就判"覆盖缺口"并起草新建 owner doc。
- 此类模板债降级为 backlog（现已有 template-debt 行），触发条件满足前不进 EXEC。
- 新建架构 owner doc 前须先确认既有 `design/*.md` / `CONTEXT.md` 未覆盖，优先"引用"而非"重写"。

### R6 — 启动前置校验：避免"空目标"长跑

- 启动时若 roadmap **无任何 `todo`/`ready` 且无遗留 active/draft plan**，引擎给出明确提示且**默认不进入纯审计模式**（纯审计需显式 `--audit-only`）。

---

## Non-Goals / 非目标

- 不改 mission-driver 整体状态机主干（CHECK → REVIEW → EXEC → DRAFT → DEEP_AUDIT 保留）。
- 不移除 DEEP_AUDIT 能力。现有 `--fast`（`fastSkipSteps` 默认整体跳过 DEEP_AUDIT，`config.js:557`）是钝器；本需求提供"运行审计但能收敛"的中间档，两者互补。
- 不在本需求内重写 god-file（列为独立架构跟进）。
- 不调整 opencode 子进程 / 模型本身速度。

## Business Rules / 关键规则

- 收敛**不得以掩盖真实缺陷为代价**：material 及以上发现必须能报告并阻塞收口（truth-table 原则：open 的 material 审计永不静默丢弃）。
- trivial 降级必须**可追溯**：写入 follow-up backlog，保留来源审计引用。
- 严重度分级由 prompt 产出，**闸门逻辑在引擎侧强制**。

## Edge Cases / 已知边界

- 旧审计报告无严重度 marker → 退化为现有行为（`issues` 全量修复），向后兼容。
- 同一发现被 multi-audit 与 open-audit 同时命中（如本次 B1/B2）→ 去重到单一 closure surface。
- 一轮内 material 与 trivial 混合 → material 走修复、trivial 降级，互不阻塞。
- 真·clean 轮次 → R2 短路，不再空转到 maxAuditRounds。

## Acceptance Criteria / 验收标准

- [ ] 测试：审计返回"无 material 发现"时，DEEP_AUDIT 走 clean 短路，mission 在**未跑满** `maxAuditRounds` 时 `completed`（覆盖根因 B 回归）。
- [ ] 测试：仅 LOW/doc-only 发现时，**不**写 `Audit Status: open` 报告、**不**生成进入 EXEC + BUILD_VERIFY 的修复计划（覆盖根因 A）。
- [ ] owner/architecture doc 的行号引用检查纳入 `npm test`，对新增 `file:NNN` 报错（覆盖根因 A 载体）。
- [ ] 测试：`docs/architecture/` 仅有模板 stub 时，审计不据此起草"新建 owner doc"计划（覆盖根因 C）。
- [ ] roadmap 无 `todo` 且无遗留计划时，启动给出明确提示且不默认进入满额自审计（R6）。
- [ ] 回归基线：`npm --prefix tools/mission-driver test` 全绿。
- [ ] 复现场景验证：等价于本次（roadmap 全 done + 仅 doc nit）时，运行在 **1 轮 DEEP_AUDIT 内收口**，总时长显著下降。

## Unresolved Questions / 待裁决

1. 严重度分档粒度：三档（blocking/material/trivial）还是二档（clean/actionable）？建议三档，交设计文档定 marker 契约。
2. R4 采用"doc-only 轻量执行"还是"trivial 全部降级 follow-up"？可并存，需定默认。
3. R3 行号检查对普通 log/plan 是否也生效？建议仅对 owner/architecture doc 硬失败，其余仅警告。
4. R6 空目标默认 `exit` 还是需 `--audit-only` 显式开启？

## Routing / 后续

- Task type: architecture change + implementation（触及 flow 契约、引擎 transition、验证链）——需 plan。
- Owner docs to update on closure: `tools/mission-driver/design/mission-driver-flow-design.md`（audit 收敛语义）、`flows/deep-audit-loop.json` + `flows/mission-driver.json`（转移边 / clean 出口）、`src/flow-loader.js`（openAudits 严重度过滤）、`docs/architecture/mission-driver-baseline.md`（引用约定）。
- 建议 roadmap 拆分：**R1+R2（收敛闸门，核心，同时治已触发的根因 A 与潜在的根因 B）**、R3（行号循环治理）、R4（成本护栏）、R5（模板 stub 护栏）、R6（启动前置）；god-file 拆分单列架构跟进。
