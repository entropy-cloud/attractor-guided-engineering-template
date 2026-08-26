---
status: active
mission: age-autonomy-implementation
work-item: M2-WI14+WI15+WI16
group: "2026-08-25-0815"
verify: [test]
---

# 2026-08-25-0815-2 M2 三硬门：审计回执绑定 + 状态转移写者身份 + 完成派生校验（age-autonomy M2-WI14+WI15+WI16）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M2 WI14/WI15/WI16；契约 owner `docs/design/age-autonomy/02-rule-law.md` §4.1/§4.2/§4.3/§4.9（model lineage 与 requireDistinctModel）
> Related: 前置 `2026-08-25-0815-1`（N=1，law 内核 seam + policy schema + gate-check CLI + 宿主适配——本 plan 在其注册表落三条规则）；同批 `2026-08-25-0815-3`（N=3，配套门禁 WI17–WI20，消费本 plan 的 enforce 姿态先例）；M1 批次 0635-2（回执语法机器面）/ 0635-3（过渡期写者裁定 Phase 1 Decision 2）

## Current Baseline

**回执与完成公式只有「语法可解析」与「事后可派生」，没有任何写入时执法：谁写 dispatch、谁写 accepted、status 谁翻、全勾过渡是否放行，全部依赖 prompt 自觉。本 plan 把 02 §4.1–§4.3 三条硬门变成 0815-1 注册表上的 enforce 规则。**（以下事实 2026-08-25 live 核实）

- **回执语法机器面（M1 已就绪，语义面空白）**：`ledger-sections.mjs` `DISPATCH_RE`（:24 `^- dispatch (review|audit) (#id) to (\S+)`，前缀锚定无 `$`——尾部追加 `models={...}` 后缀语法兼容，sessionId 捕获组不吞后缀）、accepted/pass/日期迭代结论行语法、`parseLedgerId`（tail-anchored + nonce8）、`section.pairs`/`unpairedDispatches`/`unpairedConclusions` 同 id 配对计算（:227-233）、`deriveCompleted` 五合取（:410 含 auditReceipt/dispatchRegister 合取，:455-458 派发登记 = 全部 dispatch 行 valid）。**缺失的正是 02 §4.1 的写者断言与写入时拦截**：现状没有任何代码在写入发生时校验「dispatch 写者 = 派发方、accepted 写者 = dispatch 的 auditorSessionId」。
- **model lineage 现状**：dispatch 行带 `models={exec,aud}` 是 02 §4.1（G4 机制化）新增语法；存量 corpus 0 条 dispatch 行携带（M1 批次回执均无）。解析器层面后缀 tolerated（DISPATCH_RE 无 `$`），但无显式解析、无真值表钉住——本 plan 补显式解析（可选字段，向后兼容）+ 派发方写入面（过渡期 = flow 派发步 prompt 指令，承 0635-3 过渡期写者裁定；守夜人派发 M3 接管）。
- **状态转移现状**：`validatePlanFrontmatter` 只做格校验（hold 仅 held、claim 仅 active 成对等形状规则，M1/WI2）；`draft → active` 的转移合法性（写者 == Draft Review Record dispatch 行 reviewerSessionId ∧ 同 id 结论行）无任何执法；held → active 解锁通道（守夜人 unlock / 新评审 reviewer + 同次写 failures 重置）不存在——现 repo 无 held 态 plan（plan 头行 `> Review Hold:` 全仓库 0 处，0635-3 实测承袭；散文/指令文件中的字面提及不计入）。评审租约（未闭环 dispatch review 期间他人写入 deny）无实现。
- **完成派生现状**：`deriveCompleted`/`computeBasisHash`/`awaitingClosure` 谓词已实现（M1/WI3）但只在**读取面**（plan-check/flow-loader 扫描）——写入面无全勾过渡门禁：现状任何 actor 可把 Phase checkbox 全勾（plan-status-gate.ts 只拦 legacy `> Plan Status: completed` 字面写入，frontmatter 时代全勾+派生完成的路径完全无守卫——恰好是 02 §4.3 要堵的洞）。终态冻结（completed 派生或 cancelled/superseded/deferred 后拒绝 Phase/status/机器字段写入）无实现。
- **enforce 授权**：02 §6 例外条款——P0 迁移完成后的三硬门直接 enforce（不走 observe-only 爬坡）；P0 = M1 已收口（roadmap WI1–WI11 全 tick，807 测试绿）。本 plan 三规则注册即 `mode: enforce`，直接 enforce 授权成文于 Phase 1 Decision。
- **actor 面**：DSH = pre-execute 事件 agent 身份（0815-1 Phase 1 裁定面）；CLI/CI = 结构子集（02 §4.1 明示：无 actor 时只做 dispatch/accepted 同 id 结构匹配，不声称验证写者）。两面的强度差成文，不冒充。
- **活语料（诚实口径）**：M1 三份 plan 的 Draft Review Record / Closure 区是**旧格式散文**（0635-1/2 为 legacy 格式整份；0635-3 新格式但其收口回执尚缺——Closure 区停留在 pending 注记，派生态 = awaitingClosure 而非 completed）——仓库内**新语法回执语料 = 本批 0815 三份的 dispatch review 行（未闭环）**，无任何新格式 completed plan。因此：三硬门正向完成路径的正例语料 = 构造 fixture（Phase 1/2 真值表）；corpus 回归的真实断言面 = 「存量语料不被误杀」（legacy 文件按双读通道声明跳过；0635-3 断言 awaitingClosure 合法态而非完成态）；**本 plan 自身的 Closure dispatch/accepted 回执将是仓库首个新语法完成路径生产语料**（models= 后缀的首个生产写入者也是它，而非本 plan 的 DRR dispatch 行）。
- **终态冻结归属注记**：roadmap WI21 文字含「终态冻结」，但其契约本体在 02 §4.3（硬门 3）——本 plan 实现后，WI21 后继 plan 只消费不重实现（见 Non-Goals）。
- **消费面风险**：`flow-loader.js` `_scanPlansByStatus`（activePlans/draftPlans 现役实现）与 monitor plans 列表读 frontmatter（M1 双读接线后）——本 plan 不改读取面，只加写入时执法；执法不影响存量文件（只拦 proposed 写入）。

## Goals

- `closure-audit-binding` 规则（plan `## Closure` 面）+ `roadmap-audit-binding` 规则（roadmap `## Deep Audit Record` 面，同构）：dispatch/accepted 同 id 配对 + 写者断言（DSH 面）+ 结构配对（CLI/CI 面）+ dispatch 写者角色断言。
- `writer-identity` 规则（02 §4.2）：draft→active / held→active / 终态 disposition 的写者执法 + 评审租约 + 执行者永禁写 `status`。
- `plan-completed` 规则（02 §4.3）：全勾过渡三岔判定（回执齐 → 公式校验；无回执 → 持有效 claim 者放行入 awaitingClosure；否则 deny）+ 终态冻结。
- `models=` lineage 显式解析 + `requireDistinctModel` 静态可满足性检查（runtime 派发绑定 M3 接口注记）。
- 三规则 `mode: enforce` 注册进 `missions/autonomy.policy.yml`；`law-truth-table.test.mjs` 增补三硬门正向/反向/边界用例（向 WI24 ≥30 推进）。

## Non-Goals

- `requireDistinctModel` 运行时派发强制（守夜人派发时校验，M3/WI26；本 plan 落 policy 静态检查 + dispatch 行 lineage 语法）。
- 机械验证执行与 pass 行生成（WI19/N=3）；append-only 前缀保持 diff 检测（WI20/N=3——本 plan 只消费既有语法校验，不检测改写）；路径护栏与 P8 自护（WI21）；CI 接线（WI23）；WI24 收口门（下批 plan）。
- 终态冻结虽在 roadmap WI21 文字中出现，但其契约本体 = 02 §4.3（硬门 3）——本 plan 实现并收口该语义；WI21 后继 plan 只消费（路径护栏的「终态冻结」面引用本实现），不重实现。
- 证据面重建（run-state 子流程权威性剥离，WI22）——plan-status-gate.ts 本 plan 不动。
- prompt 派发步改造超出 models= lineage 写入指令的最小增量（BUILD_VERIFY/CLOSURE_AUDIT 过渡期写者角色不变）。

## Task Route

- Type: `architecture change`（法律层第一批 enforce 规则：写入时执法面）
- Owner Docs: `docs/design/age-autonomy/02-rule-law.md` §4.1/§4.2/§4.3/§4.9、`docs/design/age-autonomy/01-file-ledger.md` §5.1（状态转移逐边表）/§5.2（完成公式）、`docs/plans/00-plan-authoring-and-execution-guide.md`（回执语法权威）
- Skill Selection Basis: 无项目 skill 匹配（同 0815-1 裁定）→ Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（依赖 0815-1 交付的内核/注册表/policy/适配层；不改 engine.js、不新增 npm 依赖）

## Phase 1 — 审计回执绑定双面规则与 model lineage

Targets: law 内核（新规则模块）、`tools/mission-driver/src/ledger-sections.mjs`（models= 显式解析——**改此文件后必须重建 plugin assets**：`node plugin/dsh/scripts/build-bundle.mjs`，否则 freshness check 红）、`plugin/dsh/test/law-truth-table.test.mjs`、`missions/autonomy.policy.yml`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: 0815-1 全部 Phase（注册表 / policy / actor 裁定）

- [x] `Add` dispatch 行 `models=` 后缀显式解析：`DISPATCH_RE` 尾部可选 ` models={exec:<名>,aud:<名>}` 字段（向后兼容：无后缀行行为不变；有后缀时解析进 dispatch 记录供绑定校验与驳回率统计消费）+ 语法真值表（合法/畸形后缀/半配对）钉住。**执行落点**：`ledger-sections.mjs` 尾部字段独立解析（` models=` 起头必须完整解析，否则 malformed-dispatch error——严格语法行不容忍为 prose；` models={exec:a,aud:b}` 进 dispatch 记录 `models` 字段）；引擎测试 `ledger-sections.test.js` +2 例。
- [x] `Add` `closure-audit-binding`（plan 面）：拦截目标 = 触碰 `## Closure` 区或触发全勾过渡判定的 plan 写入。校验链：① 结构面（全部署面）：proposed content 中 Closure 区 dispatch/accepted 行语法合法 ∧ 同 id 配对（复用 section.pairs）∧ accepted 无 findings 词法混同；② 写者面（DSH actor 面）：accepted 行写者 actor.id == dispatch 行 auditorSessionId ∧ dispatch 行写者为派发方角色（engine/supervisor；过渡期 = flow 派发步会话）；③ id 词法：nonce8 + tail-anchored（parseLedgerId）。deny reason 指向缺失的合法路径（02 §2 结构化 deny 纪律）。**执行落点**：`law-rules.mjs`（新规则模块，经 law-policy side-effect import 注册）；结构面 error 按 M1 扫描器行号过滤进 `## Closure` 区（区内语法违例 deny、区外不管）；accepted 无同 id dispatch = `unbound conclusion` deny；dispatch 无 accepted = 中间态永不 deny；accepted 写者错位 deny（actor.id 对 dispatch sessionId）；dispatch 写者角色白名单（role 可得时，id-only 注记不 deny）；无 actor = 结构子集 allow + 「writer face not evaluated」reason（不冒充）。
- [x] `Add` `roadmap-audit-binding`（roadmap 面，同构）：`## Deep Audit Record` 区 dispatch/accepted 同 id + accepted 必须携带 `findings=none|items` 词法（01 §3.3 域）+ 写者面同上。**执行落点**：同模块 `roadmapAuditBindingRule`（findings required 经 M1 扫描器 `required` 模式 error 进区过滤）；无 DAR 区/无 frontmatter roadmap = 域外放行。
- [x] `Add` `requireDistinctModel` 静态可满足性检查（check-policy 面）：policy 中 auditor `requireDistinctModel: true` 时，解析 dispatch 映射（execute→executor、closure-audit/deep-audit→auditor）对应 agents 的 model {provider,model} 对——相等 → 校验错误；单模型部署显式降级 = policy 显式声明 `downgrade: single-model` 类标注通道（不静默，02 §4.9）。runtime 派发绑定 = M3/WI26 接口注记（派发时实际模型对的校验由守夜人在派发点执行，接口 = dispatch 行 models= 数据 + 本检查函数复用）。**执行落点**：`law-policy.mjs` `checkDistinctModelSatisfiability`（export 供 M3 派发点复用）+ agent def 字段 `downgrade`（值域 `single-model`，无 requireDistinctModel: true 时声明 = 错误）+ 接入 `validatePolicy`；真实 policy auditor 显式 `downgrade: single-model`（本仓库单模型部署诚实口径）。
- [x] `Proof` 真值表：合法配对 / 错 id / accepted 无 dispatch / dispatch 无 accepted（派生中间态，非 deny）/ accepted 写者错位（actor 面）/ 结构面无 actor 时不声称写者验证 / roadmap 面 findings 词法缺失 / models= 畸形后缀。命令：`node --test plugin/dsh/test/law-truth-table.test.mjs` + `pnpm --prefix tools/mission-driver test`。**执行证据**：41 例全绿（+16：gate1 plan 面 10 / roadmap 面 4 / requireDistinctModel 1 / models= 语法 1；引擎侧另 +5）。

Exit Criteria:

- [x] 双面规则对构造的正反例 fixture 判定全对（含 deny reason 文本断言）
- [x] check-policy 对 requireDistinctModel 反例（executor/auditor 同模型）报校验错误、显式降级通道可过
- [x] `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` 全绿
- [x] `docs/logs/` 更新

## Phase 2 — 状态转移写者身份规则

Targets: law 内核（writer-identity 规则）、`plugin/dsh/test/law-truth-table.test.mjs`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1（dispatch 行解析与配对面复用）

- [x] `Add` 转移边执法（01 §5.1 逐边表为契约）：① `draft → active`：写者 actor.id == Draft Review Record dispatch 行 reviewerSessionId ∧ 该区含同 id 结论行（日期迭代形态），否则 deny；② `held → active`：写者为守夜人 unlock（人工经 `mdcontrol.unlock` 路由）或新评审派发的 reviewer，且同一次写入把 `failures` 重置 0（重置缺失 → deny malformed-transition）；③ 终态 disposition（cancelled/superseded/deferred 写入）：守夜人执行人工 disposition 或已登记评审者；④ 执行者（executor role）写 `status` 一律 deny（无例外边）。CLI/结构面：status 翻转的 proposed content 须同文件携带匹配回执，或 currentFileState 已存在匹配回执（结构子集不声称验证写者，02 §4.1 同纪律）；**结构面对身份依赖边（held→active unlock 无回执语法、租约第三者写入）退化为「回执伴随校验（仅在有回执语法的边生效）+ unverified-writer 注记」，不 deny 不冒充**——02 §2 结构子集纪律，注记进观察日志。**执行落点**：`law-rules.mjs` `writer-identity` 规则——`LEGAL_TRANSITIONS` 集合钉 01 §5.1 全部合法边（非法边/终态复活 deny + 指路）；draft→active 回执 = proposed DRR 配对（dispatch review + 同 id 日期迭代结论行）；held→active = failures 重置 ∧ hold 移除同写强制 + reviewer 可证/unlock 注记；执行者 deny 双面（role=executor ∧ actor.id 命中 claim holder——`claimHolderMatches` 尾部锚定提取 holderSessionId，nonce8 剥离后 endsWith，连字符 session id 安全）。
- [x] `Add` 评审租约：Draft Review Record 存在未闭环 `dispatch review`（有 dispatch 无同 id 结论行）期间，除该 reviewerSessionId、守夜人、引擎外 actor 对该 plan 的任何写入 deny（租约结束条件 = 结论行落地）。**执行落点**：同规则内 current 态未闭环 dispatch × proposed 未闭环 → reviewer/supervisor/engine 白名单（第三者带 actor.id 即 deny——session 比对在 DSH 面可判定）；结论行同写落地 = 租约结束（reviewer 翻 active 正常路径测试钉住）。
- [x] `Proof` 真值表：转移边 × actor 角色 × 证据在文件/在 proposed/缺失 三维矩阵（draft→active 合法 reviewer / 错位 reviewer / 执行者尝试 / 无结论行；held→active 带 failures 重置 / 不带；租约期间第三者写 / reviewer 写 / 守夜人写；终态 disposition 各角色）。命令：`node --test plugin/dsh/test/law-truth-table.test.mjs`。**执行证据**：11 例全绿（合法 reviewer / 错位 / 无结论行 / 执行者 role+claim-holder 双面 / held→active 三态 / 租约五角色 / 租约结束 / 终态 disposition 三角色 / 非法边 active→draft 与 cancelled→active 复活 / 无转移与无 currentFileState 惰性）。

Exit Criteria:

- [x] 全部转移边与租约用例判定正确，deny reason 指向合法路径
- [x] 结构面（无 actor）对 status 翻转的回执伴随校验正确且不冒充写者验证
- [x] `npm --prefix plugin/dsh test` + `pnpm --prefix tools/mission-driver test` 全绿
- [x] `docs/logs/` 更新

## Phase 3 — 完成派生校验规则、enforce 切换与收口

Targets: law 内核（plan-completed 规则）、`missions/autonomy.policy.yml`（三规则注册 enforce）、`plugin/dsh/test/law-truth-table.test.mjs`、roadmap tick 回写
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: Phase 1/2（回执绑定与写者身份是公式合取的输入）

- [x] `Decision` **直接 enforce 授权成文**：三硬门注册 `mode: enforce`（不走 observe 爬坡），授权依据 = 02 §6 例外条款 + P0（M1 账本迁移）已收口（roadmap WI1–WI11 全 tick + 807 测试绿）；观察日志保留（enforce 模式下 allow 决策仍记录，deny 决策天然可见）。**执行落点**：`missions/autonomy.policy.yml` 四 gate 条目 enforce（closure-audit-binding / roadmap-audit-binding / writer-identity / plan-completed；plan-structure 维持 observe——收紧开关归 WI21）+ 授权注释成文于 policy；gate 顺序 = binding 先于 formula（deny reason 优先级，评审 iteration 2 非阻塞项 3 落地）。
- [x] `Add` `plan-completed` 全勾过渡门禁（02 §4.3，整文件 proposed content 粒度）：写入后内容经 `scanPlanLedger` 计数域全勾 → 三岔：① 已有有效审计回执 ∧ 机械验证 pass 行 basisHash == 写入后内容 basisHash → 校验完成公式（`deriveCompleted`）成立才 allow；② 尚无审计回执 → 仅当前写者持有有效 claim（actor.id == holderSessionId ∧ 未过期）时 allow，plan 进入派生 `awaitingClosure`，且该放行写入必须同时清除 claim（01 §4.4「claim 在 awaitingClosure 前必清」——与 0815-3 Phase 2 ④ 同一约束的两侧声明，避免「携带残留 claim 的 awaitingClosure 写入在两 plan 间落空」）；无 claim 或 claim 不属写者 → deny + reason；③ 审计拒绝路径：`## Closure Findings` 追加未勾返工项 → plan 自然脱离全勾（不依赖额外状态位，返工项追加是合法写）。计数与 01 §5.2 同域（Phase + Closure Findings，复用 ledger-sections，无第二实现）。**执行落点**：`law-rules.mjs` `plan-completed`——①公式 deny reason 携带 `deriveCompleted` reasons（stale basisHash → 指向重验证）；②claim 门四 deny 面（无 claim / 过期（ctx.now 时钟可注入）/ 错主 / proposed 残留 claim）+ awaitingClosure 维护写（current 已全勾无回执：pass 行/dispatch 落地）放行——不造 D2/WI41 式收口死锁；③Closure Findings 追加自然脱离全勾（测试钉住）。
- [x] `Add` 终态冻结：`completed(p)` 已派生或 `status ∈ {cancelled, superseded, deferred}` → 任何 Phase checkbox / `status` / 机器字段（claim/claim-expires/failures/verify/hold）写入 deny（重新开工 = 新 plan，01 §5.1）；防「已 accepted 旧回执被新未勾项复用」。**执行落点**：current 派生 completed ∧/∨ current 终态 → `computeBasisHash` 比对（basis 域 = frontmatter + Phase + Closure Findings = 全部可变机器面）——变即 deny，append-only 区追加放行；cancelled 复活写测试钉住（与 writer-identity 非法边双重拦截）。
- [x] `Proof` 真值表与 corpus：三岔全分支（回执齐 allow / 无回执持 claim allow 入 awaitingClosure / 无回执无 claim deny / claim 过期 deny / formula 不满足 deny）+ 终态冻结矩阵 + corpus 语义按文件类钉住（legacy 文件如 0635-1/2 → gate-check 经双读通道声明跳过并陈述 vacuity；新格式 awaitingClosure 态文件 0635-3 → 断言 awaitingClosure 合法态而非完成态；正向完成路径正例 = 构造 fixture，仓库尚无新格式 completed plan——本 plan 自身收口回执成为首个生产语料）；累计真值表用例数记录（向 WI24 ≥30 推进，收口门本 plan 不勾）。**执行证据**：truth table 累计 **64 例**（本 plan 增 39：gate1 双面 16 + gate2 11 + gate3/corpus 12）；正向完成正例 = completedPlan() fixture（`deriveCompleted` true + 公式 allow）；stale basisHash 返工用例（评审 iteration 2 非阻塞项 1）+ corpus 三类（0635-3/0815-1 awaitingClosure 真实文件断言、legacy 双读跳过、真实 enforce policy 端到端越权 deny）；gate-check 命令输出见 Verification。
- [x] `Add` 文档同步与回写：`tools/mission-driver/CONTEXT.md` 三硬门行；roadmap WI14/WI15/WI16 tick + 证据指针（规则模块 + 真值表路径 + gate-check corpus 输出；**WI14 证据显式注记残项**：`requireDistinctModel` 派发时运行时强制归 M3/WI26 守夜人派发点——WI26 文字未点名，靠本注记防 roadmap over-claim）；`docs/logs/` 收口条目。**执行落点**：CONTEXT.md「三硬门规则」段；roadmap WI14（含 M3/WI26 残项注记）/WI15（含 unlock 路由 M3 注记）/WI16（含 WI21 消费注记）`[x]` + 证据；logs 三条 Phase 条目 + 收口条目；另：closure-audit/multi-audit/open-audit 三 prompt dispatch 行 ` models=` lineage 写入指令最小增量（Non-Goal 边界内的最小面，本 plan 收口回执 = 首个生产写入者）。

Exit Criteria:

- [x] 三规则 enforce 注册后，构造的全勾越权写入（无回执无 claim）被 deny 且 reason 正确；合法 awaitingClosure 路径放行（含 claim 同写清除）
- [x] corpus 语义按文件类钉住：`node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md` 断言 awaitingClosure 合法态（非完成态）；legacy 语料（0635-1/2）经双读通道声明跳过——无误杀
- [x] `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` + `./verify-age.sh` L1+L2 全绿
- [x] roadmap WI14/WI15/WI16 `[x]` + 证据指针；`docs/logs/` 收口条目

## Draft Review Record

- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0815-2-m2-three-hard-gates-1-85081b18 to ses_reviewer_2
- 2026-08-25：iteration 1，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0815-2-m2-three-hard-gates-1-85081b18（独立评审 ses_reviewer_2：baseline 抽查实证，但发现 corpus 口径不实——M1 plan 的回执区是旧格式散文、仓库无新格式 completed plan、0635-3 实为 awaitingClosure 态；阻塞项 = corpus 断言面重定义——已按建议重写「活语料」诚实口径 + Phase 3 Proof/Exit 按文件类钉住 corpus 语义 + 本 plan 自身收口回执为首个生产语料；非阻塞 8 项：Review Hold 措辞、WI14 残项注记、终态冻结 WI21 消费注记、assets 重建提示、Fix 括注删除、结构面身份依赖边退化语义、claim 清除对齐行、models= 首写者措辞——均已修）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0815-2-m2-three-hard-gates-2-16420c5f to ses_reviewer_2
- 2026-08-25：iteration 2，共识 acceptable-as-is #review-2026-08-25-063133-mission-driver-2026-08-25-0815-2-m2-three-hard-gates-2-16420c5f（独立复核：corpus 诚实口径重写独立验证为实（0635-1/2 legacy、0635-3 awaitingClosure、仓库无新格式 completed plan）；八项非阻塞修复全部落地；Phase 2/3 与 02 §4.2/§4.3 忠实镜像；无新引入问题。非阻塞 3 项留执行期：审计拒绝后返工重勾的 stale basisHash 真值表用例、`downgrade: single-model` 键名与 0815-1 schema 对齐、closure-audit-binding 与 plan-completed 的规则组合序）

## Verification

- 2026-08-25 执行期复核（过渡期写者裁定承袭 0635-3/0815-1：`- pass` 行由引擎 BUILD_VERIFY 步骤按当次 basisHash 补写，此处记录执行面证据）：三 Phase 全执行完毕。`pnpm --prefix tools/mission-driver test` 863 pass/0 fail（prompt-check OK；本 plan 增 ledger-sections +2 / law-policy +3）；`npm --prefix plugin/dsh test` 197 pass/0 fail（本 plan 增 truth table 39 例至 64；closure 25/25、freshness 42 文件 content-equal、smoke-import ok、tsc --noEmit 干净）；`node --test plugin/dsh/test/law-truth-table.test.mjs` 64/0；`node tools/mission-driver/src/gate-check.mjs --policy missions/autonomy.policy.yml` exit 0（5 gates：plan-structure observe + 三硬门四条 enforce）；`node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md` exit 0 且 plan-completed observation = `awaitingClosure (legal derived middle state, 01 §5.2)`；legacy 0635-1/2 同命令 exit 0 全 gate 域外跳过（无误杀）；`./verify-age.sh` L1+L2 GREEN；`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0；web typecheck/build 绿（web/src 无 diff，worktree dist 环境漂移还原 committed 世代）；`lint:prompts` OK；`git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff 不变量）。真值表累计 64 例（WI24 ≥30 推进量记录于 Phase 3 Proof；WI24 收口门归下批不勾）。
- pass test 2026-08-25-205251-mission-driver basisHash=091bf73e0faa7ce79bfb9edf591a2f5f5d1df2c0532181f179303ad41b5decab exit=0

## Closure

- dispatch audit #audit-2026-08-26-072439-mission-driver-2026-08-25-0815-2-m2-three-hard-gates-1-e70f4866 to ses_auditor_1 models={exec:glm-5.2,aud:glm-5.2}
- accepted #audit-2026-08-26-072439-mission-driver-2026-08-25-0815-2-m2-three-hard-gates-1-e70f4866：独立冷放审计通过（2026-08-26）。round 1 唯一阻塞项 = 语料钉扎滞后：0815-1 收口回执随 8d3c92b 落地未同步本 plan 交付的真值表 §10/§16 两例 awaitingClosure 语料断言（106/108）——按 0635-3 先例修正（语料钉扎随 live 派生态移动：completed 语料类扩为 0635-3/0815-1/0815-2，live awaitingClosure corpus 类清空、语义由构造 fixture 钉住），修正后全量复跑全绿。① 工件与可达性实证：`law-rules.mjs` 四规则 live（closure/roadmap-audit-binding :228、writer-identity :414〔LEGAL_TRANSITIONS :236 钉 01 §5.1 逐边表 + 评审租约 + 执行者永禁写 status〕、plan-completed :544〔全勾三岔 + claim 同写清除 :524 + 终态冻结 basis 域比对 :447〕），经 `law-policy.mjs:30` side-effect import 注册 + `law-core.mjs` evaluateGates 分派（非死代码）；`models=` 后缀显式解析 `ledger-sections.mjs:27`（畸形 → malformed-dispatch）；`checkDistinctModelSatisfiability` `law-policy.mjs:509`（downgrade: single-model 通道，接入 validatePolicy）；policy 四 gate enforce + auditor requireDistinctModel: true + downgrade 显式声明。② 命令复跑：`pnpm --prefix tools/mission-driver test` 899/0（prompt-check OK）；truth table 修正后全绿；`npm --prefix plugin/dsh test` 全绿（closure/freshness/smoke-import/tsc）；`gate-check --policy` exit 0（17 gates）+ 本 plan 与 0635-3 corpus exit 0；`mission-check` exit 0；`git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff）。③ 文档同步：CONTEXT.md 三硬门段、roadmap WI14/15/16 `[x]` 带证据指针（WI14 M3/WI26 残项注记在）、docs/logs 三 Phase + 收口条目。④ Deferred 诚实性：Non-Goals 全部指向已登记后继（M3/WI26、0815-3 WI17–20、WI21/WI22/WI23/WI24），无 live 缺陷藏匿。⑤ 本回执 = dispatch 行 models= lineage 后缀首个生产写入者（exec/aud 同模型对 = policy 已声明 single-model 降级的诚实记录）。结论：25/25 计数域全勾 + pass 行 basisHash 绑定 + 本回执对满足 01 §5.2 完成派生公式。
