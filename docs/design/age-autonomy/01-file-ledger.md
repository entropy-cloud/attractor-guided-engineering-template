# AGE 自主运行架构 — 账本（File Ledger）

> Status: supported baseline（human 批准，2026-08-24）
> 定义 roadmap / plan 的持久化格式、状态格、完成派生、运行登记、审计内联与计量语义。格式由对应 guide 完全规定，机器按本文件解析。

## 1. Purpose

账本是 AGE 全部跨 session 状态的唯一载体。格式设计目标：机器可无语义解析、完成状态可 grep 获知、跨 session/checkout 完整自持、不产生第二真相通道。

## 2. 格式纪律（硬边界）

1. **零依赖解析**：引擎/插件零 npm 依赖 → 不引入 gray-matter；frontmatter 限定为**扁平标量键 + 单层流式数组**子集，内置解析器约 30 行。禁止嵌套对象、锚点、块标量（`>-`/`|`）；字符串一律写为单行引号串。
2. **一事一处**：每个事实只有一个可写位置，其余派生（进度计数永不落盘）。
3. **可写 = 决策，派生 = 计算**：`status`/计量/认领字段是决策或机器登记（可写）；**完成是事实（不可写，派生自 checkbox）**。
4. **进 frontmatter 的门槛**：机器要在无语义理解下读写它。（title 不进——H1 即是；事实发生时间戳不进——文件名/git 已有；评审事实不进——记录内联于正文。唯一例外：`claim-expires` 是机器控制的 TTL 到期值，不是事实发生时间戳。）
5. **grep 计数域**：checkbox 只允许出现在指定区块（plan 的 Phase 与 `Closure Findings`；roadmap 的 Work Item 块），guide 规定并配结构校验，防止示例性 `- [ ]` 污染计数。

## 3. roadmap 格式

### 3.1 frontmatter（极简，仅跨 run 全局计量）

```yaml
---
audit-rounds: 2          # 已消耗审计轮次（跨 run 跨 session 全局计数）
---
```

- **limit 与 count 分离**：上限（`maxAuditRounds`）属配置——留在 flow/mission 配置；计数（`audit-rounds`）属账本——进 frontmatter。
- **语义**：`audit-rounds` 只计 **mission 级 Deep Audit 轮次**（进入 `## Deep Audit Record` 的派发），跨 run 累计、重跑不重置（行为变更须在 guide/changelog 成文）；plan 级 Closure Audit 不消耗此计数。
- **边界**：一个 roadmap 只归属一个 mission（mission config 的 `roadmapPath` 唯一反向对应）；若未来共享 roadmap，`audit-rounds` 语义需升级为按 mission 分键。
- **写者**：仅合法写者（引擎进入审计态 / 守夜人 trigger）可自增，并发由乐观锁覆盖；同一审计 occurrence 崩溃重派不重复自增。

### 3.2 Work Item 状态块（纯 checkbox）

```markdown
### M5 — 里程碑标题

- [ ] WI16 描述（owner doc 链接）
- [x] WI15 描述（证据：docs/plans/...）
```

- todo/done 计数、对账、UI 渲染共用同一个 grep 通道（`grep -c "^- \[ \]"`）。
- ❌/✅ 图标语义退役，统一 checkbox。
- 身份由 `missions/*.json` 的 `roadmapPath` 持有；更新时间是 git 事实，不落字段。
- 描述性段落（Dependencies & Notes 等）自由写，不进机器面。

### 3.3 mission 级审计记录（Deep Audit 内联）

```markdown
## Deep Audit Record          # 可选；append-only
- dispatch audit #audit-<runId>-<roadmap>-<round>-<nonce8> to <auditorSessionId>（守夜人/引擎写入）
- accepted #audit-<runId>-<roadmap>-<round>-<nonce8> findings=none|items：结论（该 auditorSessionId 写入）
```

- DEEP_AUDIT / multi-audit 的结论同样内联于 roadmap，不产生外部分析文件；发现直接落为 roadmap 未勾 Work Item（或转 plan 的 Closure Findings），关闭 = 勾 checkbox。
- dispatch/结论行、session id 匹配与 append-only 规则与 plan 级审计同构（见 §4.4 / 02-rule-law §4.1/§4.8）。

## 4. plan 格式

### 4.1 frontmatter（最小集）

```yaml
---
status: draft            # draft | active | held | cancelled | superseded | deferred；completed 为派生态不可写
mission: dsh-plugin      # 归属 mission
work-item: M4-WI14       # roadmap 回写锚点（必须命中 roadmap 中已登记 work-item）
group: "2026-08-23-2200" # 批次标识（可选；缺失时回退文件名时间戳前缀）
failures: 0              # 自最近一次进入 active 起的失败计数；limit=maxFailures 留配置
verify: [test, build]    # 可选单层数组：本 plan 要求机械通过的 command key 集合；缺失时用 mission 默认；显式 verify: [] 为拒绝语义——校验器报错（非空数组或省略），派生面按 no-verify-keys fail-closed 不回落默认（空集不空真，M2-WI44 裁定）
agent: "auditor"         # 可选：本 plan 的派发 agent 覆盖（仅可引用 autonomy.policy.yml agents 名单，如 auditor；缺失用 dispatch 映射默认；见 02-rule-law §4.9）
hold: "缺上游裁定，等 D2" # 仅 status: held 时必填；其他状态不得出现
# claim 与 claim-expires 仅在执行认领期间存在（见 §4.4），由守夜人写入与回收：
# claim: "attempt-<runId>-<holderSessionId>-<nonce8>"
# claim-expires: "2026-08-24T16:30:00Z"
---
```

- 机器可写位 = `status` + 计量字段（`failures`）+ 认领字段（`claim`/`claim-expires`）；`completed` 永不出现在 frontmatter。
- `cancelled | superseded | deferred` 是**可写的终态**（人/评审决策），用于替代现 guide 的同名终态；现 guide 的 `replaced` 在迁移中并入 `superseded`。终态不可原地复活，重新开工 = 新建 plan。
- `hold` 只解释 `held` 的阻塞原因；终态原因写在正文 disposition 记录中，机器不解析。

### 4.2 正文结构

```markdown
# <标题>

## Current Baseline
## Goals
## Non-Goals
## Phase 1
- [ ] 实施项（含 Proof：测试命令）
- [ ] ...
## Phase 2
- [ ] ...
## Draft Review Record       # 内联评审记录（append-only）
- dispatch review #review-<runId>-<plan>-<iter>-<nonce8> to <reviewerSessionId>（守夜人/引擎写入）
- 2026-08-24：iteration 1，共识 acceptable-as-is #review-<runId>-<plan>-<iter>-<nonce8>（该 reviewerSessionId 写入）
## Closure Findings          # 可选；审计拒绝时由审计者追加 - [ ] 返工项（计数域）
## Verification              # 机器验证记录（append-only，守夜人写入）
- pass test <runId> exit=0
- pass build <runId> exit=0
## Closure                     # 内联收口审计记录（独立审计者写入）
- dispatch audit #audit-<runId>-<plan>-<round>-<nonce8> to <auditorSessionId>（守夜人/引擎写入）
- accepted #audit-<runId>-<plan>-<round>-<nonce8>：审计结论与证据（该 auditorSessionId 写入）
```

### 4.3 淘汰项

- `> Plan Status:` 行 → frontmatter `status`（可写位 = draft/active/held/cancelled/superseded/deferred；completed 派生）。
- `> Review Hold:` 行 → `status: held` + `hold:` 字段（迁移 codemod 映射）。
- `## Closure Gates` → **消解**：可执行项并入最后一个 Phase；独立性/机械验证/一致性项由 §5.2 完成公式与门禁派生，不再保留可写 checkbox（防止实现者自证独立性）。
- per-Phase `Status:` 行 → **整体删除**（phase 完成度 = 该 Phase 区块内 `[ ]` 计数）。
- `> Last Reviewed:` → 审阅事实在 Draft Review Record 内联，plan 不留副本。
- 外部 Source Audits 跨文件生命周期 → 消解：发现直接落 plan/roadmap，关闭 = 勾 checkbox。

### 4.4 运行登记（claim / dispatch，均为账本区块）

**claim（执行认领）**

- 位置：plan frontmatter 的 `claim` + `claim-expires`（仅 `status: active` 时可出现）；`claim` 内编码持有者 session id，门禁据此核对执行者身份。
- 写者：仅守夜人/引擎可写与回收；执行子代理不得自写 claim。TTL 到期或无产出 → 守夜人回收 claim 并按归因规则决定是否递增 `failures`；plan 离开 active（held / 终态 / 派生成完成）**或进入 `awaitingClosure` 后（机械验证/审计派发前）**，必须在同一写入清除 claim 字段（验证与审计期间不允许执行者继续勾选）。
- 语义：同 plan 同时最多一个未过期 claim；跨机器 checkout 后旧 claim 仍在文件中，但按 `claim-expires` 与当前时间比较自然失效，不阻塞新机器接续。
- 这是 P1/P2 的直接推论：认领是跨 session 并发正确性相关状态，必须进 git 账本，不能只存插件内存。代价是 plan 文件在认领/回收/完成边界产生 git 噪声——频率远低于逐项勾选写入，成文接受。

**dispatch（独立评审/审计派发登记）**

- 位置：plan 正文的 `## Draft Review Record` / `## Closure` 区，由守夜人/引擎在派发前写 `dispatch ... #id` 行；评审/审计者只能在其后追加结论行。
- id 形如 `#review-<runId>-<plan>-<iter>-<nonce8>` 或 `#audit-<runId>-<plan>-<round>-<nonce8>`；nonce 由派发方生成，防实现者预造回执。
- 不设独立 registry 文件：**登记与回执同文件**，dispatch 行内编码被派发的 reviewer/auditor session id，完成校验按「dispatch 行 + 同 id 结论行 + 结论行写者 == dispatch 行 session id」匹配；DSH 形态下写者身份门禁保证 dispatch/结论行不能被实现者伪造，独立形态由引擎结构性派发保证，CI 只做结构匹配。

## 5. 状态格与完成派生

### 5.1 状态格与逐边裁决表

可写状态：`draft | active | held | cancelled | superseded | deferred`；`completed` 为派生态。终态 = `completed`（派生）与 `cancelled | superseded | deferred`（可写、关闭后不再复活）。

| # | 转移 | 触发者 | 证据/前置 | 门禁（02-rule-law） |
| --- | --- | --- | --- | --- |
| T1 | （无）→ draft | drafter 新建文件 | 文件落在 plans 域；frontmatter 合法；`work-item` 命中 roadmap 已登记项 | 路径护栏 + 结构校验 |
| T2 | draft 内容修订 | review dispatch 前：drafter；dispatch 后：仅该 reviewer / 守夜人 | 不改变 `status`；review/audit 区只增不改；评审期间 drafter 写入被 deny（评审租约） | append-only + 评审租约 |
| T3 | draft→active | dispatch 行对应的已登记评审者 | Draft Review Record 含 dispatch 行与同 id 结论行（共识可接受） | 写者身份门禁 + review 回执匹配 |
| T4 | active 内勾 checkbox | 持有效 claim 的执行者 | claim 有效；勾选落在 Phase 或 Closure Findings 区块；**最后一次勾选**允许的条件 = 已有有效审计回执 ∨ 当前持有有效 claim | claim 合法性 + 全勾过渡门禁（见 02 §4.3） |
| T5 | draft/active→held | 评审者（Review Hold）或守夜人（`failures ≥ maxFailures`） | `hold` 必填；失败熔断有计数字段佐证 | hold 写入门禁 |
| T6 | held→active | 人工解锁（经守夜人 unlock 路由，由守夜人写入）或新评审派发通过 | 同一次写入把 `failures` 重置为 0 并移除 `hold`；解锁记录入 Draft Review Record | 解锁写者门禁 + 计量重置一致性 |
| T7 | draft/active/held→cancelled/superseded/deferred | 人工 disposition（经守夜人路由写入）或已登记评审者 | 正文 disposition 记录理由 | 写者身份门禁 + 终态写入门禁 |
| T8 | → completed（派生） | 无写者 | §5.2 公式成立 | 完成派生校验 |
| — | completed（派生）后续编辑 | 禁止 | completed 是终态；Phase checkbox / status / 机器字段不得再写，重新开工 = 新建 plan | 终态冻结门禁 |

```
draft ──T3 评审接受──▶ active ──T4 全勾 + 机械验证 + 审计回执──▶ completed(派生)
  │                      │
  │ T5 Review Hold       │ T5 Review Hold / 失败熔断
  ▼                      ▼
  └───────▶ held ◀───────┘
              │ T6 人工解锁 / 新评审（failures 归零）
              ▼
            active

draft | active | held ──T7 人工/评审 disposition──▶ cancelled | superseded | deferred（终态）
```

- 转移 = 文件写入；每条边的合法性由法律门禁裁决（见 02-rule-law）。
- `completed` **不可写**，是派生态。

### 5.2 完成派生公式与扫描谓词

```
plan.completed(p) ⇔
    p.status == active
  ∧ 全勾（该 plan 所有计数区块无 `- [ ]`：Phase 区块 + Closure Findings 区块）
  ∧ 机械验证通过（Verification 区存在 plan.verify（缺省 mission 默认）每个 command key 的 `exit=0` pass 行）
  ∧ 审计回执绑定（Closure 区存在 dispatch 行与同 id accepted 行）
  ∧ 派发登记匹配（dispatch 行登记者 = 守夜人/引擎；DSH 形态再校验写入者身份）

历史 `basisHash=<sha256>` pass 行保持可读兼容，但被忽略；机械验证只由 command key 与 `exit=0` 证明。

```

机器扫描谓词统一由上述公式导出，门禁、守夜人、monitor 共用同一实现（不得各自带正则）：

- `draftPlans()`：`status: draft`。
- `activePlans()`：`status: active ∧ ¬completed(p)`（派生的 completed 自动排除，不改写 status）。
- `awaitingClosure(p)`：`status: active ∧ 全勾（同完成公式的计数域） ∧ 无有效审计回执`——派生中间态，不是 frontmatter 状态；先触发机械验证，通过后触发审计派发，不触发完成。
- `heldPlans()`：`status: held`。
- `closedPlans()`：`completed(p) ∨ status ∈ {cancelled, superseded, deferred}`。
- `openPlans()`：`draftPlans() ∪ activePlans() ∪ heldPlans()`。
- **open finding 不设独立通道**：审计发现落为 `Closure Findings` 未勾项，评审/深审发现落为 plan 未勾项或 roadmap 未勾 Work Item；因此「有无 open finding」由 `openPlans()` 与 roadmap 未勾项完全表达。

### 5.3 审计/review 内联规范

- Draft Review Record 与 Closure 记录**写在 plan 文件内部**，不产生额外分析文件——独立评审者（第二 agent 派发）把自己的结论写入被审文件对应区块；git 历史保证可归因，门禁保证 review/audit 区 append-only。
- 正常评审一轮 2–3 行共识记录；异常争议完整史超 ~20 行时，结论内联、过程移讨论稿（异常升级路径）。

## 6. 计量语义（一般规则）

> **跨 run 需持久化的计量归账本 frontmatter（`audit-rounds` 进 roadmap、`failures` 进 plan）；limit 归配置；run 内临时量归 scratch。**

| 计量 | 位置 | 写者 | 语义 |
| --- | --- | --- | --- |
| `audit-rounds` | roadmap frontmatter | 合法写者（引擎/守夜人进入 Deep Audit 态） | mission 级 Deep Audit 轮次全局累计；plan Closure Audit 不消耗 |
| `failures` | plan frontmatter | 守夜人失败归因（executor 错误/测试红/claim 到期无产出） | 自最近一次进入 active 起累计；`≥ maxFailures → held + 人工回执`；held→active 的同一写入必须重置为 0 |
| 步数/墙钟 | run 态 scratch | 引擎/守夜人 | run 内临时量，不跨 session。M4 的「步」= 一次被法律裁决的账本动作（文件写入/claim/dispatch/terminal-claim）或一次派发；引擎后端沿用引擎既有 step 定义 |

## 7. 与 guide 的关系

- 两文件的格式 owner = plan 编写指南与 roadmap 编写规约（guide 更新为唯一格式权威）。
- frontmatter 字段增删 = guide changelog 事件。
- prompt-check.mjs / 结构校验随本文件同步。
