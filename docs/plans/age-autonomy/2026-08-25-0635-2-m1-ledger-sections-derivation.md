# 2026-08-25-0635-2 M1 账本区块与完成派生：计数域扫描 + 内联审计区 + 扫描谓词（age-autonomy M1-WI3+WI5+WI6）

> Plan Status: active
> Mission: age-autonomy-implementation
> Work Item: M1-WI3+WI5+WI6
> Last Reviewed: 2026-08-25
> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M1 WI3/WI5/WI6；契约 owner `docs/design/age-autonomy/01-file-ledger.md` §2.5/§3.2/§3.3/§4.2/§4.4/§5.2/§5.3
> Related: 前置 `2026-08-25-0635-1`（N=1，解析器 + 字段集——本 plan 全程消费其导出面）；后继 `2026-08-25-0635-3`（N=3，codemod + 双读接线 + guides/CI 收口）；human 裁定 `docs/discussions/2026-08-24-roadmap-plan-frontmatter-reform.md` §8（审计内联）与 §4.4（计数域取舍——倾向区块限定）
> Audit: required

## Current Baseline

**区块级机器面完全空白：无计数域扫描、无内联审计区语法解析、无完成派生实现；现状全文计数会被任何示例 checkbox 污染。**（以下事实 2026-08-25 live 核实）

- **计数现状**：plan-check.mjs:82-83 对全文做 `- [ ]`/`- [x]` 计数（Phase / Closure Gates / 模板示例一概混计）；实测对 00-guide `--strict` exit 1（15 个模板示例项）。WI11 gate 第 1 条要求同一命令 exit 0——**计数域区块化是前置条件**（本 plan 交付扫描器，0635-3 接线 plan-check）。
- **设计契约**：
  - 计数域（01 §2.5 + §5.2）：plan 的 checkbox 只允许出现在 **Phase 区块 + `## Closure Findings`**；roadmap 只允许出现在 **Work Item 块**（`### M<n> —` 里程碑节下的 WI 行）；guide 规定并配结构校验防示例污染。
  - 新格式正文结构（01 §4.2）：`## Phase <n>` 区块 + `## Draft Review Record`（append-only）+ `## Closure Findings`（可选，计数域）+ `## Verification`（append-only，`pass <key> <runId> basisHash=<sha256> exit=0` 行）+ `## Closure`（dispatch/accepted 行）。注意：新格式 Phase 为 `## Phase <n>`（h2），现行 guide 模板是 `### Phase N - <name>`（h3、挂在 `## Execution Plan` 下）——**扫描器面向新格式语法；旧→新归一是 0635-3 codemod 的职责**（本 plan 不做兼容双语法）。
  - 派发/回执语法（01 §4.4 + §3.3 + §4.2，**三种结论行形态不得混同**）：dispatch 行 `- dispatch review #review-<runId>-<plan>-<iter>-<nonce8> to <reviewerSessionId>` / `- dispatch audit #audit-<runId>-<plan>-<round>-<nonce8> to <auditorSessionId>`（roadmap 侧 `<roadmap>` 替 `<plan>`）；plan `## Closure` 的 accepted 行 `- accepted #<同id>：审计结论与证据`（**无** findings 词法——01 §4.2 示例形态）；roadmap `## Deep Audit Record` 的 accepted 行 `- accepted #<同id> findings=none|items：结论`（§3.3，WI6 roadmap 域）；`## Draft Review Record` 的评审结论行为日期迭代形态 `- <date>：iteration <n>，共识 <verdict> #<review-同id>`（§4.2 示例 :97）——与 review dispatch 配对的是它，不是 accepted 行。id 内 nonce8 防预造回执。
  - 完成派生（01 §5.2）：`completed(p) ⇔ status==active ∧ 全勾 ∧ 机械验证（verify 每个 key 有 pass 行且 basisHash == 当前 basisHash）∧ 审计回执绑定（Closure 区 dispatch + 同 id accepted）∧ 派发登记匹配`；`basisHash = sha256(frontmatter + 全部 Phase 区块 + Closure Findings 区块的规范化文本)`（门禁正确性绑定用全量 sha256，非提示词 dedup 的 hash8）。
  - 扫描谓词（01 §5.2）：`draftPlans/activePlans/awaitingClosure/heldPlans/closedPlans/openPlans` 由公式统一导出，门禁/守夜人/monitor 共用同一实现。
- **前置依赖已立项**：0635-1 交付 `parseFrontmatter`/`validatePlanFrontmatter`/`validateRoadmapFrontmatter`/常量——本 plan 的区块扫描、roadmap `audit-rounds` 读取、谓词的 status 判别都建立其上。
- **消费方现状**：flow-loader.js:73-88 `_scanPlansByStatus` 是 activePlans/draftPlans 的现役实现（读旧状态行、不识派生态）——本 plan 交付共享谓词后，其切换归 0635-3/WI7（本 plan 不改 flow-loader.js）。
- **WI5 的「示例与结构校验」面**：00-guide 现无新格式区块示例；结构校验用例（prompt-check 同级的 docs 结构面）在本 plan 以单测钉住，guide 增补示例文案随 Phase 3 落。

## Goals

- 计数域扫描器：plan（Phase 区块 + Closure Findings）与 roadmap（Work Item 块）的 checkbox 计数/未勾定位，输出可 grep 对账的结构化结果——todo/done 计数、对账、UI 渲染共用同一通道（01 §3.2）。
- 内联审计区块语法：Draft Review Record / Verification / Closure Findings / Closure / roadmap Deep Audit Record 的解析与结构校验（dispatch/accepted id 语法、`findings=none|items`、pass 行语法、append-only 区块形状判定——**结构判定 only**，写时拦截是 M2 法律）。
- `computeBasisHash` + `deriveCompleted`（§5.2 公式的共享实现）+ 扫描谓词族（含 `awaitingClosure` 派生中间态）。
- 00-guide 增补区块格式示例与 append-only 规则（additive；guide 全量切换归 0635-3/WI9）。
- 单测钉住上述全部面（与 0635-1/0635-3 的用例合并满足 WI11 gate 第 3 条 ≥12 例的覆盖面）。

## Non-Goals

- 不做写时门禁/append-only **强制**（结构形状判定 ≠ 拦截写入；执法是 M2 WI14–WI21）。
- 不做 codemod、不改 plan-check.mjs/flow-loader.js 现行为、不动引擎 prompts（全部归 0635-3）。
- 不做旧格式 `### Phase`（h3）语法兼容——扫描器只认新格式（01 §4.2）；迁移归 0635-3，双读期间的旧 plan 由 0635-3 的接线层用旧通道兜底。
- 不做守夜人/claim 运行时（M3）；`verify` key 跨文件存在性、agent 名单校验（M2）。
- 零引擎 diff 红线：不动 engine.js；不新增 npm 依赖。

## Task Route

- Type: `implementation-only change`（共享扫描/派生库 + 结构校验 + guide 增补）
- Owner Docs: `docs/design/age-autonomy/01-file-ledger.md`（§2.5/§3/§4.2/§4.4/§5 为契约 owner）；`docs/plans/00-plan-authoring-and-execution-guide.md`（格式权威，本 plan 增补区块示例）；roadmap M1 WI3/WI5/WI6
- Skill Selection Basis: `Skill: none`——`docs/skills/` 无匹配实现方法的可复用技能。

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（纯 Node 单测；零网络零凭据）。

## Execution Plan

### Phase 1 - Decision：区块语法 + basisHash 规范化 + 谓词契约钉住

Status: planned
Targets: 决策记录于本 plan
Skill: none

- Item Types: `Decision`
- Prereqs: 0635-1 Phase 1（接口契约）

- [ ] `Decision` **区块识别语法**：Phase 区块 = `## Phase <n>`（h2，新格式；01 §4.2 示例形态）**可带尾名**（接受 `## Phase <n> — <name>` / `## Phase <n> - <name>`——0635-3 codemod 从存量 `### Phase N - <name>` 归一产出即带尾名，语法钉死裸数字会拒绝全部迁移产物，含本批三份 plan 自身）；区块边界至下一 h2。`## Closure Findings` / `## Draft Review Record` / `## Verification` / `## Closure` / roadmap `## Deep Audit Record` / `### M<n> —` Work Item 块均为固定标题锚点。计数域 = **列 0 checkbox 行**（`^- \[ \]` / `^- \[x\]`，与 roadmap grep 通道同构）；缩进行（含 WI11 gate 命令的 2 空格缩进子项）在计数域外。**代码围栏跳过**：围栏内行不参与计数与语法匹配（新格式 plan 的描述性段落含示例 checkbox 不污染）。计数域外（列 0）出现 `- [ ]` → 结构校验 error（计数域纪律的机器面）。未知 h2 区块：容忍（描述性段落自由写，01 §3.2）但不计数、不参与 basisHash。
      - Skill: none
- [ ] `Decision` **basisHash 规范化规则**：取 frontmatter 原文 + 全部 Phase 区块 + Closure Findings 区块，按文档序拼接；每行去尾随空白、CRLF→LF；其余逐字保留（含缩进——勾选语义不因空白重排而漂移）。备选 raw-bytes：否决——lint/空白编辑会无谓击穿旧 pass 行。内容再变则旧 pass/全勾事实自然失效（01 §5.2「无需删除记录」语义保持）。
      - Skill: none
- [ ] `Decision` **id 与行语法钉住**（正则单一实现，M2 法律复用）：id 词法 `#review-<runId>-<plan>-<iter>-<nonce8>` / `#audit-<runId>-<plan>-<round>-<nonce8>` / roadmap `#audit-<runId>-<roadmap>-<round>-<nonce8>`；`<plan>` = 文件名去 `.md`（与 flow-loader plans 扫描的文件身份同构）；`<nonce8>` = 8 hex。**解析消歧**：`<plan>` 文件名 stem 本身含连字符（本批 stem 即 8+ 个）→ id 一律**从尾部锚定解析**（末段 nonce8 → 前一段 iter/round → 再前一段为 plan/roadmap 与 runId 的合并前缀，不做贪心切分）。**三种结论行语法分别钉住**（与 Current Baseline 契约一致）：plan Closure accepted `- accepted #<id>：结论与证据`（无 findings）；roadmap Deep Audit accepted `- accepted #<id> findings=none|items：结论`；review 结论 `- <date>：iteration <n>，共识 <verdict> #<id>`；pass 行 `- pass <commandKey> <runId> basisHash=<sha256hex> exit=<code>`。结论行写者 == dispatch 行 session id 的**身份匹配**是 M2 写者门禁；本 plan 只校验同 id 配对存在的结构面。**append-only 区块形状判定策略**：严格语法只施加于命中已知前缀（`dispatch` / `accepted` / `pass` / 日期迭代形态）的行；未命中前缀的行**容忍为 prose**（0635-3 迁移会原样保留存量评审/收口区旧散文——如 `Status Note: pending` 段与旧 iteration 行；严格形状会拒绝其下游必须放行的迁移语料）；dispatch 行无同 id 结论 → 报告为**派生态事实**（喂 `awaitingClosure`/完成公式第五合取项），不是结构 error。
      - Skill: none
- [ ] `Decision` **谓词契约**：输入统一为文件记录（path + content）**+ 可注入 `defaultVerifyKeys`**（调用方供给 mission 默认 verify key 集——mission config 在文件记录域外，设计 §5.2 第三合取项「plan.verify（缺省 mission 默认）」的缺省解析**不内嵌**在谓词里，否则各消费方自造 fallback 即「各自带正则」病复发；`plan.verify` 缺省 ∧ 调用方未注入 → 机械验证合取项按不满足处理，reasons 显式标注 `no-verify-keys`），输出 `draftPlans/activePlans/status==held/heldPlans/closedPlans/openPlans/awaitingClosure`；`activePlans = status:active ∧ ¬completed(p)`（派生态不改写 status）；`awaitingClosure = status:active ∧ 全勾 ∧ 无有效审计回执`（先机械验证后审计派发，不触发完成）；旧格式文件（无 frontmatter）在谓词层的处理归 0635-3 双读接线，本 plan 谓词域 = 新格式文件。
      - Skill: none

Exit Criteria:

- [ ] 四项 Decision 连同备选/残险记录于本 plan
- [ ] `docs/logs/` updated（Phase 1 决策条目）

### Phase 2 - 实现 + 单测

Status: planned
Targets: `tools/mission-driver/src/ledger-sections.mjs`（或与 0635-1 模块合并为 `ledger.mjs`——执行时按体量裁定，接口契约不变）、`tools/mission-driver/test/ledger-sections.test.js`、`tools/mission-driver/test/ledger-derivation.test.js`、build-bundle ALLOWED_MODULES 登记 + assets freshness
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1 + 0635-1 Phase 2 落地

- [ ] `Add` 计数域扫描器（plan + roadmap 双面）+ 区块结构校验（计数域外 checkbox、append-only 区块形状、id 配对、findings 词法）
      - Skill: none
- [ ] `Add` `computeBasisHash` + `deriveCompleted`（§5.2 公式逐合取项实现，失败 reasons 逐项可解释）+ 扫描谓词族
      - Skill: none
- [ ] `Add` build-bundle 登记 + assets 刷新（同 0635-1 机制）
      - Skill: none
- [ ] `Proof` `ledger-sections.test.js` ≥10 例：Phase（含/不含尾名两种标题）/Closure Findings/Work Item 计数正向；列 0 vs 缩进行计数边界；代码围栏内 checkbox 不计数；计数域外（列 0）checkbox 拒绝（含「guide 模板示例不污染」同构用例）；三种结论行语法正反面（plan accepted 无 findings、roadmap accepted 带 findings=none|items、review 日期迭代行；nonce8 词法、同 id 配对缺失检测）；id 尾部锚定消歧（含连字符 plan stem 用例）；pass 行语法 + basisHash 不匹配 → 不满足机械验证合取项；append-only 区块形状判定（未知前缀行容忍为 prose、不报结构 error）
      - Skill: none
- [ ] `Proof` `ledger-derivation.test.js` ≥10 例：完成公式真值表（五合取项逐项击穿 → 不完成；全满足 → 完成）；`verify` 缺省 + `defaultVerifyKeys` 注入语义（注入集每个 key 需 pass 行；缺省且未注入 → `no-verify-keys` 不满足）；`completed` 不写回 status；谓词族互斥完备抽查（activePlans 排除派生 completed；awaitingClosure 中间态命中/不命中；closedPlans = 派生 ∨ 可写终态）；basisHash 稳定性（空白规范化用例：重排尾空白 hash 不变；内容变 hash 变）
      - Skill: none

Exit Criteria:

- [ ] `node --test tools/mission-driver/test/ledger-sections.test.js tools/mission-driver/test/ledger-derivation.test.js` 全绿
- [ ] `pnpm --prefix tools/mission-driver test` 0 失败
- [ ] `npm --prefix plugin/dsh test` 绿（bundle freshness）
- [ ] 完成公式五合取项各有至少一正一反用例（真值表覆盖可审计）

### Phase 3 - guide 增补 + roadmap 回写

Status: planned
Targets: `docs/plans/00-plan-authoring-and-execution-guide.md`（区块格式示例增补）、`docs/backlog/00-roadmap-authoring-guide.md`（audit-rounds + Deep Audit Record 增补）、`tools/mission-driver/CONTEXT.md`（一行事实）、`docs/backlog/age-autonomy-implementation-roadmap.md`（WI3/WI5/WI6 状态回写）、`docs/logs/2026/08-25.md`
Skill: none

- Item Types: `Add`
- Prereqs: Phase 2

- [ ] `Add` 00-guide 增补：新格式正文区块示例（Draft Review Record / Closure Findings / Verification / Closure 的 canonical 形态，与测试 fixtures 同构；三种结论行形态分别示例）+ append-only 与计数域规则（列 0 纪律、围栏跳过）+ 内联规范有界护栏（一轮 2–3 行共识记录；争议史超 ~20 行结论内联、过程移讨论稿——01 §5.3）（additive，changelog 事件）；示例置于代码围栏内且计数域扫描器不将其计为 plan（无 frontmatter 判别，0635-1 语义）
      - Skill: none
- [ ] `Add` 00-roadmap-guide 增补：frontmatter `audit-rounds` 字段 + `## Deep Audit Record` 格式 + Work Item 块纯 checkbox 纪律（additive，changelog 事件）
      - Skill: none
- [ ] `Add` roadmap WI3/WI5/WI6 状态回写（`todo → ready` 于 draft review 通过时；`ready → done` 于本 plan closure audit 通过后，按 roadmap 状态块纪律；gate 面解释同 0635-1 Phase 3——per-WI gate 面 = L1 链内新测试族，WI11 为 milestone backstop）
      - Skill: none

Exit Criteria:

- [ ] guide/roadmap-guide 示例与解析器语法一致（fixtures 同构对照）
- [ ] `docs/logs/` updated
- [ ] roadmap WI3/WI5/WI6 状态按纪律回写

## Draft Review Record

- Independent draft review iteration 1: needs-revision（task `ses_fca0e6adeffesm1qpwy1ZACw74`）——4 blocking：三种结论行形态混同（plan Closure accepted 无 findings / roadmap accepted 带 findings / review 日期迭代行）；`## Phase <n>` 裸数字语法会拒绝 0635-3 codemod 产出与自批迁移 plan；append-only 形状严格校验会拒绝迁移保留的旧散文；`deriveCompleted` 缺省 verify key 集无法从文件记录域解析（各消费方会自造 fallback）；另 5 项非阻塞。
- Independent draft review iteration 2: accept（task `ses_fca03a378ffeBQxlA9LGWEzkA`）——4 blocking 全解（三语法分钉 + 配对规则、Phase 标题收可选尾名、已知前缀严格/未知行容忍 prose/未配对 dispatch 归派生态、可注入 `defaultVerifyKeys` + `no-verify-keys` 显式失败态）；5 项非阻塞全部 addressed；2 项次要非阻塞（verdict 词表、basisHash 分隔符细节）按「同实现双侧一致性」接受。共识 `acceptable`，plan 转 active。

## Closure Gates

- [ ] in-scope behavior is complete（扫描器 + 区块校验 + basisHash + 完成派生 + 谓词族 + guide 增补，测试可复跑）
- [ ] relevant docs are aligned（00-guide、00-roadmap-guide、CONTEXT.md、roadmap 回写、logs）
- [ ] verification has run（两个新测试文件 + `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test`）
- [ ] scoped verification is not conflated with full verification（跑全量 engine + plugin 链，无 scoped 降级）
- [ ] no in-scope item downgraded to deferred/follow-up
- [ ] independent draft review completed and recorded
- [ ] text consistency verified: status, phases, gates, and log all agree
- [ ] closure audit was independent
- [ ] closure evidence exists in files

## Deferred But Adjudicated

### 写时 append-only / id 配对强制（拦截非法写入）

- Classification: `out-of-scope improvement`（M2 WI14/WI20 立项面）
- Why Not Blocking Closure: 本 plan 结果面 = 结构判定与派生公式（M1 范围）；拦截需要 actor 身份与写者门禁（法律层）。
- Successor Required: yes（M2）

### 旧格式 plan 在谓词层的兼容

- Classification: `out-of-scope improvement`（0635-3/WI7 双读接线）
- Why Not Blocking Closure: 过渡策略（codemod 范围 + 双读优先级）是 0635-3 的 Decision 面。
- Successor Required: yes（0635-3）

## Closure

Status Note: pending

Closure Audit Evidence: pending
