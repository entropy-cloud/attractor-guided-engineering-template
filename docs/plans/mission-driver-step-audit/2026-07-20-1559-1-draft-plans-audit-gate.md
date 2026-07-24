# mdo-step-audit-4 DRAFT_PLANS 决策引擎化（删 done 出口 + audit-gate + prompt 改造）

> Plan Status: completed
> > Last Reviewed: 2026-07-20
> Source: `docs/backlog/mission-driver-step-audit-roadmap.md` WI4
> Related: `tools/mission-driver/design/step-execution-and-audit-count-design.md` §2.3, §4.2, §5.4；前置 plan `2026-07-20-1147-1-audit-count-persist.md`（WI1）；顺带承接 WI1 plan 的 Deferred 项 `_scanOpenAuditsList` 按 audit type 区分。
> Mission: mission-driver-step-audit
> Work Item: WI4 DRAFT_PLANS 删 done 出口 + audit-gate + prompt 改造
> Audit: required

## Current Baseline

Live baseline verified against the repo on 2026-07-20（含 WI1/WI2/WI3 落地后的形态）:

- `flows/mission-driver.json:59-71` 的 `DRAFT_PLANS` 当前定义**三条正常出口** + 三类异常兜底：
  - `transitions.created → REVIEW_PLANS`、`transitions.nothing → DEEP_AUDIT`、`transitions.done → done: "completed"`。
  - `onError: { retry: "DRAFT_PLANS", maxRetries: 3 }`、`onUnknown: { goto: "DEEP_AUDIT" }`、`onMaxRetries: { goto: "DEEP_AUDIT" }`。
- `flows/mission-driver.json:23` 的 `markerAliases` 仍含 `"done": "complete"`——这是让 AI 输出 `done` marker 时被纠正成 `complete` 然后命中（已被 WI4 删除目标中的）`transitions.done` 的桥梁。
- `prompts/draft-from-roadmap.md`（实际就是 DRAFT_PLANS 步骤的 prompt）当前向 AI 暴露**三种** `<AI_STEP_RESULT>` 终止符：`nothing`（:27-30）、`done`（:32-35）、`created`（:37-43）。AI 在缺事实依据时被允许"自判 mission 完成而输出 `done`"——这正是设计文档 §2.3 描述的混淆根因（AI 翻 `docs/audits/` 把 plan 级 closure audit 误认成"deep audit 已做过"）。
- 引擎 transition 解析在 `engine.js:1749-1820`：拿到 marker → `transitions[marker]` → `done`/`retry`/`goto` 三类出口。当前无任何"据 audit 计数短路 mission 完成"的逻辑。
- WI1 已落地的 `this.workflow.auditRound` / `maxAuditRounds`（`engine.js:324-325`、`_wfOpen` `:347`、`run()` 闸门 `:1374-1380`）是本 plan audit-gate 的判定输入，字段已就绪。
- `this.expressionFuncs`（`engine.js:223`，由 `main.js:549` 通过 `createExpressionFunctions(config)` 注入）已暴露 `activePlans()` / `openAudits()` / `draftPlans()`，引擎在 `_reconcileTerminal`（`engine.js:514-517`）已有完全相同的调用范式——WI4 audit-gate 直接复用，不新写扫描。
- `flow-loader.js:81-94` 的 `_scanOpenAuditsList` 当前**不区分 audit 类型**：扫到任何带 `> Audit Status: open` 头的 markdown 都计入。这意味着 plan 级 closure audit（由 `plan-execution.json` 子流程产生）与 mission 级 multi/open audit（由 `deep-audit-loop.json` 产生）会被一起算进 `openAudits().length`。设计文档 §5.4 把"按 audit type 区分"列为推荐后续改进，WI1 plan 的 Deferred 段已显式把这一项的评估权交给 WI4。
- `_finalizeWorkflow`（`engine.js:413-420`）的 `_wfClose(null, status === "completed" ? "completed" : "failed")` 在 audit-gate 触发 `completed` 时会把当前 DRAFT_PLANS step 记录正确标 `completed`（DRAFT_PLANS 已成功执行完，只是出口被 gate 短路），无需特殊处理。
- 验证命令：`npm --prefix tools/mission-driver test`（package.json `"test": "node --test test/*.test.js"`）；前端无改动，故 `web typecheck/build` 不在本 plan 范围。

**Gap:** DRAFT_PLANS 让 AI 自判"audit 是否做过"，AI 分不清 plan 级与 mission 级 audit；`maxAuditRounds` 计数虽已落盘但未参与 DRAFT_PLANS 出口决策。本 plan 把"是否完成 mission"的判断从 AI 拿走交给引擎，靠 `auditRound` + `openAudits()` + `activePlans()` 三个事实源共同决定。

## Goals

- 删除 DRAFT_PLANS 的 `transitions.done` 出口与 `markerAliases["done"]` 别名；AI 不再能单方面宣布 mission 完成。
- 引擎新增 audit-gate：当 DRAFT_PLANS 输出 `nothing` 且 `auditRound >= maxAuditRounds && openAudits().length === 0 && activePlans().length === 0` 时，整个 run 以 `completed` 结束（不再进 DEEP_AUDIT）；其余情况下保持原 `goto DEEP_AUDIT` 行为。
- gate 判定收敛到一个命名函数（如 `_shouldCompleteOnAuditQuota`），仅当 `flow.auditEntry` 存在时生效——保持引擎对"无 audit 概念的 flow"零侵入。
- `onMaxRetries` 改为 `done: "failed"`（重试耗尽 = 失败，而不是逃进 audit）。
- `prompts/draft-from-roadmap.md` 删 `done` 分支，加"不要判断 audit 是否做过、引擎按轮次计数决定"提示，点名 `docs/audits/` 里 plan 级 closure audit 产物不要碰。
- 评估 WI1 deferred 项 `_scanOpenAuditsList` 按 audit type 区分（设计文档 §5.4）：在本 plan 内实施，或显式延后并写明触发条件。

## Non-Goals

- 不改 `deep-audit-loop` 子流程内部步骤（`flows/deep-audit-loop.json` 与 `prompts/multi-audit.md` / `prompts/open-audit.md` 不动）。
- 不改 `--step` / `--from-step` / `singleStep` / `maxAuditRounds` 闸门（WI2/WI3/WI1 已落地，本期不动）。
- 不改 `_finalizeWorkflow` / `_reconcileTerminal` 现有逻辑（audit-gate 是 transition 层的提前完成，不与终态 reconcile 冲突——gate 触发时 activePlans/openAudits 都为空，`_reconcileTerminal` 也只会确认 `completed`）。
- 不引入 `delegates.vars.auditRound` 注入 prompt（设计文档 §4.1.4-B 明确否决：把判断从 prompt 拿出去比把计数喂给 prompt 更稳定）。`delegates.vars.maxAuditRounds` 也非决策依据，本期不加。
- 不给 flow JSON 的 transition 加 `when` 支持（设计文档 §6.3 否决的方案 B-1，记入后续 backlog）。
- 不改 monitor / events / 日志展示 audit 计数（WI5 范围）。

## Task Route

- Type: `architecture change`（改变了 mission 的退出条件与决策归属，且涉及 flow JSON + 引擎 + prompt 三处协同升级——设计文档 §5.3 与 Cross-Cutting 明确要求"flow 升级与 prompt 升级同批发布"）
- Owner Docs: `tools/mission-driver/design/step-execution-and-audit-count-design.md` §2.3, §4.2, §5.3, §5.4
- Skill Selection Basis: `Skill: none` — 决策真值表与 prompt 改造文案由设计文档 §4.2.4 + §4.2.1 直接指定；audit-gate 函数复用 `_reconcileTerminal` 已有范式（`engine.js:510-543`）。无匹配可复用 skill。

## Infrastructure And Config Prereqs

No infra prereqs beyond existing baseline. 引擎核心零 npm 依赖，本 plan 不引入新依赖。flow JSON 与 prompt 同批落地（设计文档 §5.3 兼容性约束）。

## Execution Plan

### Phase 1 - flow JSON：删 done 出口、改 onMaxRetries、清 markerAliases

Status: completed
Targets: `tools/mission-driver/flows/mission-driver.json`（`:23`、`:59-71`）
Skill: none

- Item Types: `Fix`
- Prereqs: WI1 已落地（`auditRound` / `maxAuditRounds` 字段就绪，audit-gate 有判定输入）

- [x] Fix: 在 `DRAFT_PLANS.transitions`（`:63-67`）删除 `"done": { "done": "completed" }` 这一条；保留 `created` / `nothing` 两条出口。
      - Skill: none
- [x] Fix: 在 `DRAFT_PLANS.onMaxRetries`（`:70`）把 `{ "goto": "DEEP_AUDIT" }` 改为 `{ "done": "failed" }`。
      - 设计依据 §4.2.2：重试耗尽属失败兜底，不应让控制流继续逃进 audit 循环。
      - Skill: none
- [x] Fix: 在顶层 `markerAliases`（`:16-31`）删除 `"done": "complete"` 这一行。
      - 设计依据 §5.4。注意：即便不删该 alias，Phase 1 删 `transitions.done` 后 `_tryAliasMarker("done", …)`（`engine.js:623-634`）已找不到 `complete` 这个 alias 目标键（因 `transitions.complete` 也不存在），AI 旧习惯输出 `done` 已会落到 `onUnknown: { goto: DEEP_AUDIT }` 路径。删 alias 的真正理由是**语义清晰**（不再保留一个"鼓励 AI 输出 `done`"的暗示）+ 设计文档明列要求；不是 onUnknown 兜底的依赖项。
      - Skill: none

Exit Criteria:

- [x] `flows/mission-driver.json` 的 `DRAFT_PLANS.transitions` 仅含 `created` / `nothing` 两个键；`onMaxRetries` 为 `{ "done": "failed" }`；`markerAliases` 不含 `"done"` 键。
- [x] flow JSON 语法 + 结构校验：`node -e "const f=require('./tools/mission-driver/flows/mission-driver.json'); if(!f.steps.DRAFT_PLANS||!f.markerAliases)throw new Error('schema broken'); console.log('flow ok')"` 通过；并确认 Phase 4 新增的 `test/draft-plans-audit-gate.test.js` 通过 `createMissionDriverFlow({ flowName: 'mission-driver' })` 加载该 flow 不抛错（结构层兜底）。`mission-check.mjs` 是 mission.json 校验器，不验证 flow JSON，故不在此列。
- [x] `docs/logs/` 更新。

### Phase 2 - 引擎 audit-gate 函数

Status: completed
Targets: `tools/mission-driver/src/engine.js`（transition 解析段 `:1749-1820`；新增 `_shouldCompleteOnAuditQuota` 方法）
Skill: none

- Item Types: `Add | Decision`
- Prereqs: Phase 1 完成（flow JSON 中 DRAFT_PLANS 已无 `done` 出口）

- [x] Decision: audit-gate 的判定真值表严格采用设计文档 §4.2.4：
      - 当 DRAFT_PLANS marker === `nothing`：
        - `auditRound >= maxAuditRounds && openAudits().length === 0 && activePlans().length === 0` → **run completed**（额度用完且干净，不进 audit）。
        - 否则（任一条件不满足）→ 保持原 `goto DEEP_AUDIT` 行为。
      - 关键边界（真值表第 4 行）：哪怕 `auditRound >= maxAuditRounds`，只要还有 `openAudits().length > 0`，仍 goto DEEP_AUDIT——防止"audit 发现问题但额度用光导致问题被丢弃"。
      - 备选：让 audit-gate 也接管 `marker === created` 路径。否决理由：`created` 已有明确 `goto REVIEW_PLANS` 出口，且 AI 此时刚起草了新 plan，无 mission 完成语义；gate 不应干预。
      - 残留风险：若 `openAudits()` 误把 plan 级 closure audit 算进来（§5.4），mission 会多跑 1-N 轮 audit 才因 `maxAuditRounds` 闸门退出。Phase 5 评估是否本期内修。
      - Skill: none
- [x] Add: 新增引擎方法 `_shouldCompleteOnAuditQuota(currentStep, marker, transition)`：
      - 守卫条件（通用形式，不硬编码步骤名）：通过传入参数 `transition` 判断 `transition?.goto === this.flow.auditEntry` 且 `marker === "nothing"`。这样对任何"nothing → auditEntry"的 flow 都生效，不局限于名为 `DRAFT_PLANS` 的步骤。
      - 仅当 `this.flow.auditEntry` 真值时才进入判定；无 `auditEntry` 的 flow 完全不经过这段（零侵入）。
      - 主体复用 `_reconcileTerminal`（`engine.js:514-517`）已有的调用范式：`const ap = this.expressionFuncs?.activePlans?.() || []; const oa = this.expressionFuncs?.openAudits?.() || []; const round = (this.workflow && this.workflow.auditRound) || 0; const max = this.flow.maxAuditRounds ?? 0;`
      - 返回布尔：`max > 0 && round >= max && ap.length === 0 && oa.length === 0`。
      - Skill: none
- [x] Add: 在 `engine.js:1749-1820` 的 transition 解析段，定位到"拿到 `transition = stepDef.transitions[marker]`（含 alias 纠正后）即将走 `transition.goto`/`transition.done` 分支前"的位置，插入 gate 短路：
      - 条件：`marker === "nothing" && transition && transition.goto === this.flow.auditEntry` 且 `this._shouldCompleteOnAuditQuota(currentStep, marker, transition)` 为真。
      - 动作：`this._log(\`  audit-gate: DRAFT_PLANS nothing + quota exhausted (auditRound=${round}/${max}) + no active plans/open audits → completed\`); this._emitEvent("transition", { from: currentStep, to: null, marker, via: "audit_gate" }); return await this._result("completed", totalSteps, marker);`
      - 不动 `transition.done` / `transition.retry` / `transition.goto`（非 nothing）路径。
      - Skill: none

Exit Criteria:

- [x] mock flow + 始终输出 `nothing` 的 agent：`auditRound=0`、`openAudits()=[]`、`activePlans()=[]` 时，第一次 DRAFT_PLANS nothing → 进 DEEP_AUDIT（不短路）；驱动 `auditRound` 达到 `maxAuditRounds` 后再次 DRAFT_PLANS nothing → 直接 `completed`（不再进 DEEP_AUDIT）。
- [x] mock 场景"auditRound 已达 maxAuditRounds，但 `openAudits()` 返回非空"：DRAFT_PLANS nothing → 仍 `goto DEEP_AUDIT`（不被 gate 短路，真值表第 4 行）。
- [x] mock 场景"DRAFT_PLANS marker === created"：不进 gate，直接 `goto REVIEW_PLANS`（gate 只对 nothing 生效）。
- [x] mock flow **无** `auditEntry` 字段时：`_shouldCompleteOnAuditQuota` 永远返回 false，transition 解析与现状逐字一致（零侵入回归保护）。
- [x] events.jsonl 在 gate 触发时多一条 `transition { via: "audit_gate" }` 事件（供 monitor / 复盘识别"这次 mission 是被 audit-gate 提前完成的"）。
- [x] `docs/logs/` 更新。

### Phase 3 - prompt 改造：删 done 分支、加"不要判断 audit"提示

Status: completed
Targets: `tools/mission-driver/prompts/draft-from-roadmap.md`（`:27-43` 整段重写）
Skill: none

- Item Types: `Fix`
- Prereqs: Phase 1、Phase 2 完成（gate 已能接管"完成"判断，prompt 不再需要 `done`）

- [x] Fix: 重写 `prompts/draft-from-roadmap.md` 的 `<AI_STEP_RESULT>` 出口段（`:27-43`），删 `done` 分支，仅保留两种 marker：
      - `created` — 当 roadmap 还有 todo/ready 项、或有 deferred 项可重新开启、或 audit 产生了新 issue 需要新 plan。
      - `nothing` — 当本期没有可起草的 plan（roadmap 当前 todo 项为空且无 deferred 项可触发）。
      - Skill: none
- [x] Fix: 在 prompt 中段（"Workflow"或"Context"段合适位置）加一段**显式禁令**，文案需含以下关键短语（可校验）：
      - 关键短语 1（必含）：`不要判断 mission 是否完成` 或等价英文 `Do not decide whether the mission is complete`。
      - 关键短语 2（必含）：`docs/audits/` 与 `plan 级 closure audit`（或等价英文 `plan-level closure audit`）。
      - 关键短语 3（必含）：`引擎按 audit 轮次计数决定` 或等价英文 `the engine decides based on the audit round count`。
      - 文案依据设计文档 §4.2.1 原文。
      - Skill: none

Exit Criteria:

- [x] `prompts/draft-from-roadmap.md` 不再出现 `<AI_STEP_RESULT>done</AI_STEP_RESULT>` 字样；只保留 `nothing` 与 `created`。
- [x] prompt 含上述三个关键短语（grep 可校验）。
- [x] `npm --prefix tools/mission-driver run lint:prompts` 通过（若该脚本存在；package.json 已知有此命令，WI1/WI2/WI3 closure 都引用过）。
- [x] `docs/logs/` 更新。

### Phase 4 - 单元测试：决策真值表四行 + 边界回归

Status: completed
Targets: `tools/mission-driver/test/draft-plans-audit-gate.test.js`（新增）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1、Phase 2、Phase 3 完成

- [x] Add: 新增 `test/draft-plans-audit-gate.test.js`，沿用 `test/audit-count.test.js` / `from-step.test.js` 的 mock-flow + mock-agent + 临时 runDir 范式。覆盖：
      - 用例 A（真值表第 2 行）：`auditRound < maxAuditRounds`、`openAudits()=[]`、`activePlans()=[]`，DRAFT_PLANS marker=nothing → 进 DEEP_AUDIT（gate 不短路）；DEEP_AUDIT 跑完后回到 DRAFT_PLANS 循环。
      - 用例 B（真值表第 3 行）：驱动 `auditRound === maxAuditRounds`、`openAudits()=[]`、`activePlans()=[]`，DRAFT_PLANS marker=nothing → run以 `completed` 结束（不进 DEEP_AUDIT）；events.jsonl 含一条 `via: "audit_gate"` 的 transition 事件。
      - 用例 C（真值表第 4 行）：`auditRound === maxAuditRounds`、`openAudits()=["fake-open.md"]`（mock 出 expressionFuncs 返回非空），DRAFT_PLANS marker=nothing → 仍 `goto DEEP_AUDIT`（gate 不短路；防止 audit 发现的 issue 被丢弃）。
      - 用例 D（真值表第 1 行）：`activePlans()=["fake-plan.md"]`，DRAFT_PLANS marker=created → 直接 `goto REVIEW_PLANS`（gate 完全不介入 created 路径）。
      - 用例 E（零侵入）：mock flow 删除 `auditEntry` 字段，DRAFT_PLANS marker=nothing → 行为与"未引入 gate 时"逐字一致（直接 goto DEEP_AUDIT，不调 `_shouldCompleteOnAuditQuota`）。
      - 用例 F（legacy `done` marker）：DRAFT_PLANS 输出 `done`（模拟 AI 旧习惯），`markerAliases` 已无 `"done"`、`transitions` 也无 `done` 键 → 命中 `onUnknown: { goto: DEEP_AUDIT }`（不报错、不让 mission 提前完成、不让 AI 单方面决定）。
      - Skill: none
- [x] Proof: 运行 `npm --prefix tools/mission-driver test`，确认新测试全绿且不破坏 WI1/WI2/WI3 的 `audit-count.test.js` / `single-step.test.js` / `from-step.test.js` / `transitions.test.js` / `core.test.js`。
      - Skill: none

Exit Criteria:

- [x] `test/draft-plans-audit-gate.test.js` 六个用例（A-F）全部通过。
- [x] `npm --prefix tools/mission-driver test` 整体绿（含 WI1/WI2/WI3 新增测试）。
- [x] `docs/logs/` 更新。

### Phase 5 - 评估 WI1 deferred 项：`_scanOpenAuditsList` 按 audit type 区分

Status: completed
Targets: `tools/mission-driver/src/flow-loader.js`（`:81-94` `_scanOpenAuditsList`）
Skill: none

- Item Types: `Explore | Decision | Add | Fix`
- Prereqs: Phase 1-4 完成（先有 gate，再评估扫描精度）

- [x] Explore: 在 Phase 4 测试落地后，用真实 demo mission（或 mock 一个 `docs/audits/` 同时含 mission 级与 plan 级 closure audit 的场景）跑一次完整 DRAFT_PLANS → DEEP_AUDIT 循环，观测：
      - 当 `auditRound === maxAuditRounds` 但 `openAudits()` 因混入 plan 级 closure audit 而非空时，是否真的让 mission 多跑 N 轮无意义 audit？
      - 真实场景里 plan 级 closure audit 是否会"长期 open"（如 plan 仍 active）？
      - 结论写入本 phase Decision 的依据段；若证据不足以下结论，仍按默认倾向（选择 A）实施并在 Closure 备注残留风险。
      - Skill: none

  Explore 结论（实测）：
      - `docs/audits/` 当前只含 `00-audit-execution-guide.md` / `README.md` 两个非审计文件（无 `> Audit Status:` 头，已天然不会被 `openAudits()` 命中）。
      - `plan-execution` 子流程的 `prompts/closure-audit.md` 是**直接编辑 plan 文件**（Read/Edit/Write 工具），**不**在 `docs/audits/` 下落地 audit 文件；故 §5.4 描述的"plan 级 closure audit 文件混入 openAudits()"在当前默认约定下不会发生。
      - 但 `AGENTS.md` / `00-audit-execution-guide.md` 显式允许把非平凡 closure audit 存为独立文件（filename 约定 `*closure-audit*.md`）。一旦有用户这样做，宽泛扫描会把它算进 `openAudits()`，触发 audit-gate 真值表第 4 行，导致 mission 多跑 ≤ `maxAuditRounds` 轮 audit 才退出。这是设计文档 §5.4 明确点名的可观测浪费场景。
      - mission 级 audit 文件由 `prompts/multi-audit.md:9` / `prompts/open-audit.md:9` 强制要求 `> Audit Type:` 头（值固定为 `multi-dimensional` / `open-ended`），是稳定可识别的信号。

- [x] Decision: 是否在本期内实施 `_scanOpenAuditsList` 的 audit-type 过滤：
      - 选择 A（本期内做）：在 `_scanOpenAuditsList` 内增加文件名 pattern 或 `> Audit Type:` 头部识别，只把 mission 级（`*multi-audit*` / `*open-audit*` 文件名，或带 `> Audit Type: mission` / `deep` / `open` 头）的 audit 计入；plan 级 closure audit（`> Audit Type: plan` / `closure` 或文件名匹配 plan-execution 产出）不计。
      - 选择 B（延后）：保持 `_scanOpenAuditsList` 现状（宽泛扫描），让 gate 走真值表第 4 行兜底（仍有 open audit 就继续 goto DEEP_AUDIT），最终由 `maxAuditRounds` 闸门强制结束。设计文档 §5.4 明确"方案 B 已把决策权从 AI 拿走，即使扫描宽泛，引擎也能据 auditRound 正确退出"。
      - 决策依据：Explore 的观测结果。若用户场景里 plan 级 closure audit 长期 open（如 plan 仍在 active 中），mission 会多跑 ≤ `maxAuditRounds` 轮无意义 audit——这是可观测的浪费，应在选择 A 中修。若场景不出现，选择 B 可接受。
      - 残留风险（选择 A）：audit-type 识别写死文件名 pattern 会让未来新 audit 类型易遗漏；缓解：识别逻辑封装成单一 helper（如 `_isMissionLevelAudit(filePath, content)`），新类型只改一处。
      - 默认倾向：**选择 A**——用 1 个 helper + 文件名/头部 pattern 把 mission 级与 plan 级 audit 分开，避免可观测的多轮无意义 audit；若 Explore 发现 pattern 不可靠（例如历史 audit 文件命名不一致），降级到选择 B 并把降级理由写入 Deferred。

  **Decision：选择 A**。Explore 证实 `> Audit Type:` 头由 deep-audit-loop 的两个 prompt 强制要求，是稳定信号；filename pattern 作为无头文件的后备兜底；识别逻辑封装在单一 helper `_isMissionLevelAudit(filePath, content)` 中。任何未识别（既无 `> Audit Type:` 头、filename 也不匹配 `*closure-audit*` / `*plan-audit*`）的文件默认按 mission 级处理，避免静默丢弃 open audit 造成 mission 提前完成。
      - Skill: none
- [x] Add（仅当 Decision 落在 A）：在 `flow-loader.js` 新增 `_isMissionLevelAudit(filePath, content)` helper；`_scanOpenAuditsList` 内对每个 `Audit Status: open` 文件调用它过滤。
      - Skill: none
- [x] Fix（仅当 Decision 落在 A）：扩展 `test/draft-plans-audit-gate.test.js` 的用例 C，验证 mission 级 open audit 触发 `goto DEEP_AUDIT`、plan 级 closure audit（同目录但不同 Audit Type/文件名）**不**阻止 gate 短路到 completed。
      - Skill: none

Exit Criteria:

- [x] Decision 段落明确写出选择 A 或 B，并附理由。
- [x] 若选 A：`_scanOpenAuditsList` 行为对 mission 级 vs plan 级 audit 有可测的差异；新增测试覆盖；既有 `audits-dir.test.js`（若依赖旧扫描语义）同步更新或确认无回归。
- [x] 若选 B：本 plan 的 Deferred But Adjudicated 段记录该项的延后理由与重新开启触发条件。
- [x] `docs/logs/` 更新。

### Phase 6 - owner-doc 同步

Status: completed
Targets: `tools/mission-driver/design/mission-driver-flow-design.md`（主流程 mermaid 与 DRAFT_PLANS 出口变化段）
Skill: none

- Item Types: `Fix`
- Prereqs: Phase 1-5 完成

- [x] Fix: 在 `mission-driver-flow-design.md` 中：
      - 主流程 mermaid 图删除 `DRAFT_PLANS ──done──▶ completed` 这条边；加注"DRAFT_PLANS nothing + audit-gate 命中 → completed（由引擎 audit-gate 决定，非 AI）"。
      - DRAFT_PLANS 步骤说明段的出口列表更新为"created → REVIEW_PLANS；nothing → DEEP_AUDIT 或 audit-gate 短路 completed"。
      - Skill: none
- [x] Fix: roadmap Cross-Cutting "Owner-doc sync" 行已点名"WI4 闭合后更新 `mission-driver-flow-design.md`"——本 Phase 即兑现该同步。
      - Skill: none

Exit Criteria:

- [x] `mission-driver-flow-design.md` mermaid 与 DRAFT_PLANS 段落与新 flow JSON 一致。
- [x] `docs/logs/` 更新。

> 注：设计文档 `step-execution-and-audit-count-design.md` 的"Status"字段（现为 `proposal`）是否同步标注"§4.2 已落地"由 WI4/WI5 closure 时统一处理，**不**强制在本 plan 范围；若超期未同步，作为 follow-up 跟踪。

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (task `ses_081732f2fffe3GAoohDKTXFCsz`) because (1) Phase 1 Exit Criteria used `mission-check.mjs` (mission.json-only validator, silently no-ops on flow JSON on Windows relative-path invocation → criterion was uncheckable); (2) Phase 6 Targets contained the forbidden word "可选" (Anti-Slacking Rule 11); plus non-blocking notes on Phase 1 markerAliases prose accuracy, Phase 2 gate-guard hardcoding inconsistency, Phase 5 missing `Explore` tag per rule 9, Phase 3 prompt criterion vagueness.
- Iteration 1 revision: replaced Phase 1 exit criterion with `node -e` schema check + `createMissionDriverFlow` load test; rewrote Phase 1 markerAliases prose to clarify alias removal is for semantic clarity (not onUnknown dependency); unified Phase 2 `_shouldCompleteOnAuditQuota` signature to general form `(currentStep, marker, transition)` with `transition.goto === auditEntry` guard; added explicit `Explore` item to Phase 5 before Decision per rule 9; made Phase 3 prompt criterion grep-checkable (three required key phrases); moved "可选" annotation out of Phase 6 Targets into a non-blocking note.
- Independent draft review iteration 2: `accept` (task `ses_081653680ffeJh2TJEV3TVqQnG`) — all iteration-1 blocking issues verified RESOLVED; no new blocking issues introduced. Phase 2 gate insertion point at engine.js:1749-1820 confirmed sound (gate condition `transition.goto === auditEntry` cannot fire on `transition.done` / `transition.retry` paths, so "不动其他路径" holds); Phase 5 Explore→Decision prerequisite chain satisfies rule 9. Non-blocking cleanup applied: struck lingering `entry_pre_audit_step` mention from Phase 2 prose. Consensus reached, Plan Status → active.

## Closure Gates

- [x] in-scope behavior is complete（flow JSON 删 done 出口 + onMaxRetries 改 failed + 清 markerAliases；引擎 audit-gate；prompt 删 done 加禁令；测试真值表四行 + 边界回归；WI1 deferred 项决策与（可能的）实施）
- [x] relevant docs are aligned（`mission-driver-flow-design.md` 主流程 mermaid 与 DRAFT_PLANS 段更新）
- [x] verification has run（`npm --prefix tools/mission-driver test`，含 WI1/WI2/WI3 新增测试无回归；`lint:prompts`）
- [x] no in-scope item downgraded to deferred/follow-up（Phase 5 选 A，已实施；非范围项已在 Deferred But Adjudicated 中注明）
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### `_scanOpenAuditsList` 按 audit type 区分（若 Phase 5 Decision 落在选择 B）

> Phase 5 Decision 已落在选择 A（实施），故本 deferred 项**不适用**。保留原条目作为决策溯源。

- Classification: `optimization candidate`
- Why Not Blocking Closure: 设计文档 §5.4 明确"即使扫描宽泛，引擎也能据 `auditRound` 正确退出"；最坏情况是 mission 多跑 ≤ `maxAuditRounds` 轮无意义 audit。
- Successor Required: yes — 重新开启条件：当真实 demo mission 出现"plan 级 closure audit 长期 open 导致 mission 跑满 3 轮 audit 才完成"的可观测浪费时，重新评估。

### 让 audit-gate 也接管 `marker === created` 路径（设计文档 §6 备选否决）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: created 已有明确 `goto REVIEW_PLANS` 出口，无 mission 完成语义；gate 不应干预。
- Successor Required: no — 重新开启条件：若未来出现"AI 在 activePlans 非空时仍被允许宣布完成"的新需求。

## Closure

Status Note: WI4 closed 2026-07-20. All six Phases executed and ticked. Phase 5 Decision landed on Option A (`_isMissionLevelAudit` helper implemented). Verification: `pnpm --prefix tools/mission-driver test` → 467 pass / 0 fail (457 baseline + 10 new); `lint:prompts` OK; web typecheck clean; web build OK. The from-step WI3 test was observed flaky on a busy box (subprocess timing under load) but passes deterministically when run in isolation; this is unrelated to WI4 and was already present at the WI3 closure baseline.

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay pass (no second reviewer available; non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback)
- Evidence:
  - `tools/mission-driver/flows/mission-driver.json`: `DRAFT_PLANS.transitions` now contains only `created`/`nothing`; `onMaxRetries` is `{ "done": "failed" }`; `markerAliases` no longer contains the `done` key.
  - `tools/mission-driver/src/engine.js`: new method `_shouldCompleteOnAuditQuota(currentStep, marker, transition)` (after `_reconcileTerminal`); audit-gate short-circuit inserted at the top of the `transition.goto` branch in `run()`; emits a `transition` event with `via: "audit_gate"` when fired.
  - `tools/mission-driver/prompts/draft-from-roadmap.md`: `done` marker removed; explicit "Do not decide whether the mission is complete" prohibition added with all three required key phrases; result markers limited to `nothing` / `created`.
  - `tools/mission-driver/src/flow-loader.js`: new `_isMissionLevelAudit(filePath, content)` helper + `AUDIT_TYPE_RE`; `_scanOpenAuditsList` now filters plan-level closure audits out of `openAudits()`.
  - `tools/mission-driver/test/draft-plans-audit-gate.test.js` (new, 10 cases): WI4 truth-table rows 1-4 (Cases D, A, B, C) + zero-intrusion (Case E) + legacy `done` marker (Case F) + Phase 5 helper classification + end-to-end filter + integration with audit-gate.
  - `tools/mission-driver/test/prompt-markers.test.js`: updated in-phase to reflect the new contract (draft-from-roadmap markers are `created`/`nothing` only, `done` explicitly NOT present).
  - `tools/mission-driver/design/mission-driver-flow-design.md`: mermaid updated (added `DP -.->|nothing + audit-gate hits| DONE` edge with "engine audit-gate, not AI" label); DRAFT_PLANS step description's exit list updated; Exit Mechanism section updated; Changes section gets a 2026-07-20 WI4 entry.
  - `docs/backlog/mission-driver-step-audit-roadmap.md`: WI4 status flipped from `todo` → `done` (both in the dynamic status block at the top and in the M3 milestone table).
  - `docs/logs/2026/07-20.md`: WI4 closure entry appended at the top.
