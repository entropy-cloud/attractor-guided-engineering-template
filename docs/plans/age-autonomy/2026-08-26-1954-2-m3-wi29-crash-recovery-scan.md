---
status: active
mission: age-autonomy-implementation
work-item: M3-WI29
group: "2026-08-26-1954"
verify: [test, verify-age]
---

# 2026-08-26-1954-2 M3 崩溃恢复扫描：过期 claim 回收 + 残留终态化 + resume-or-redispatch（age-autonomy M3-WI29）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M3 WI29（崩溃恢复扫描：回收过期 claim、终态化残留 running、按 trigger 派发下一个（dispatch 行无结论时 resume or 重派））
> Related: 前置 = `2026-08-26-1411-1`（WI25 watchdog 恢复扫描 seam + writer）、`2026-08-26-1411-2`（WI26 reclaim trigger + 幂等面 dispatchAlreadyRegistered + exec-arm「full resume-or-redispatch semantics stay with WI29」显式移交）、`2026-08-26-1954-1`（WI28 continuous opt-in——恢复后链式继续沿其门）

## Current Baseline

**恢复扫描有 seam 无执行语义：watchdog.start() 首周期标 'recovery' 但只是观察（过期 claim / 残留 awaitingClosure 落观察回执）；exec-arm reclaimClaim 无 agents face 时降级回执「re-dispatch deferred (WI29)」；dispatch 行无结论的死会话在飞无法与活跃在飞区分——幂等面重扫恒答「已登记」，恢复重派被挡；`supervisor-recovery.test.mjs` 不存在（WI31 门点名 ≥8 例）。**（live 核实 2026-08-26）

- **03 §6 设计基线（崩溃恢复表）**：宿主/守夜人崩溃 → DSH 形态守夜人寄生于宿主进程，宿主不在线不推进（成文接受）；重启后服务重挂载 → **恢复扫描**：回收过期 claim、终态化残留 running、按 trigger 规则派发下一个。评审/审计派发后崩溃 → dispatch 行在账本内、结论行缺失 → 能恢复原 reviewer/auditor session 则 **resume**；不能恢复则对该 occurrence 写**新 dispatch 行重派**，**不把单次崩溃计为计划失败**。run 中途崩溃 → 账本收敛（checkbox 已勾项保留、未勾项由下个执行者接续——P3 中断即暂停）。计量在账本 frontmatter 跨重启不丢；scratch 临时量归零成文接受。
- **恢复扫描现状（1411-1 交付面）**：`watchdog.ts` start() 首周期 `cycle('recovery')`——与普通周期同一求值路径，仅 trigger 标签不同；头注明示「Reclaim/redispatch execution = 1411-2 reclaim trigger + WI29 full semantics — this plan only observes」。reclaim trigger（`plan.status=active and claim-expired` → `action: reclaim-claim`）在 policy triggers 在场时每周期 execute 求值——过期 claim 回收**已执行化**（writer 清/换发 claim + execute 重派）；缺口 = 恢复语境专属动作（stale dispatch 判定 + resume-or-redispatch）与「终态化残留 running」的守夜人侧语义。
- **exec-arm reclaim 残项（1411-2 显式移交）**：`exec-arm.ts` 头注「full resume-or-redispatch semantics stay with WI29 (this arm re-issues only when an agents face is present)」+ 无 agents face 降级回执 `'re-dispatch deferred (WI29)'`——本 plan 收口。
- **幂等面缺口（核心裁定点）**：`dispatch-resolve.ts` `dispatchAlreadyRegistered` 重扫账本作答——review/audit = dispatch 行在场即已登记、deep-audit = DAR unpaired 在飞、draft-plans = 回执 JSONL 登记。**死会话的 dispatch 行（结论缺失 × 会话已死）与活跃在飞同形**——occurrenceKey 材料（`<planPath>#<type>@<hash8>`）不变则重扫恒答已登记 → 死在飞永远占位、恢复重派被幂等面挡住。
- **评审租约第二消费面（live 核实）**：writer-identity 评审租约把 DRR 内**任意** unpaired dispatch review 视为开放租约（law-rules.mjs:309-311，期间第三者写 deny :317-321，豁免角色仅 supervisor/engine :245）——恢复重派后旧行永 unpaired → 租约永开 → plan 写面锁死（drafter/human 均 deny）：幂等面之外的第二处「unpaired 行消费面」，恢复语义必须同构收口。
- **deep-audit 计量面（live 核实）**：exec-arm deep-audit 出口 dispatch 行与 `audit-rounds` 自增**同写**（exec-arm.ts:488-495）、预算预检先行（:477-486）；01 §3.1 字面「同一审计 occurrence 崩溃重派不重复自增」——同 occurrence 恢复重派若原样重入该出口 = 双重自增 + 预算耗尽后重派被预检 deny（永不重派死锁）。
- **残留 running 的守夜人侧语义**：DSH 形态 LiveRunRecord 内存态（进程死即消，无残留可清）；引擎侧 run-state 孤儿归 `reap-orphans.mjs`（引擎面，不动）。守夜人视角「残留 running」= 账本在飞事实：plan 带 claim（会话可能死）+ dispatch 行无结论 + awaitingClosure 停滞。claim TTL 到期自然回收（既有 trigger + 1411-2 renewClaim 需活动信号——死会话无活动不续期 → TTL 到期回收）；TTL 未到期的死会话 claim 不提前杀（提前杀需活性判定，归 WI30 停滞补强，残险成文）。
- **failures 不计面（02 §4.6）**：不计清单已含「恢复扫描的观察类记录」；03 §6 字面「不把单次崩溃计为计划失败」——恢复重派（redispatch 分支）不得进三桶计数，`recordPlanFailure` 调用点须避开恢复路径（02 §4.6 增量注记落本 plan）。
- **测试基线**：`plugin/dsh/test/` 现有 supervisor-core 23 / supervisor-trigger 43 / supervisor-dispatch 22 / supervisor-terminal 22 / supervisor-failures 9；WI31 门点名 `node plugin/dsh/test/supervisor-recovery.test.mjs` ≥8 用例（过期 claim 回收 / dispatch 无结论 resume-or-redispatch / 停滞指纹 / 往返检测 / partial/blocked 显式区分——后两类 + partial/blocked 恢复语境变体归 WI30 补齐同文件）。

## Goals

- 恢复扫描执行化：start() recovery 周期在观察既有面之上加恢复专属动作——stale dispatch 判定（结论缺失 × agents face 报会话不可恢复）→ resume-or-redispatch；过期 claim 回收沿既有 reclaim trigger（每周期求值已覆盖，恢复周期天然包含——对齐注记非重实现）。
- resume-or-redispatch 语义：dispatch 行无结论 × 目标 session 可恢复（agents face 存活）→ resume（原会话 followup 注入续跑）；不可恢复 → 对该 occurrence 写**新 dispatch 行**（新 id）重派——旧行 append-only 保留，幂等面同 occurrence 多 dispatch 行时最新行作答（stale 行不占位）；**评审租约同构取最新行**（writer-identity 增量——stale 行不持租约，redispatch 后 plan 写面不锁死）；**deep-audit 同 occurrence 重派不重复自增 audit-rounds**（01 §3.1——预算耗尽后死会话在飞仍可重派）。
- 恢复重派不计 failures（02 §4.6 不计清单增量行成文）。
- 「终态化残留 running」守夜人侧落点成文：账本在飞事实的恢复处置表（claim/dispatch/awaitingClosure 三态各归既有面或本 plan 面）+ 引擎侧孤儿归 reap-orphans 注记（零引擎 diff）。
- `supervisor-recovery.test.mjs` 新建 ≥7 用例（本 plan 份额：过期 claim 回收 / resume / redispatch / 不计 failures / 幂等二次扫描 / redispatch 后写面（租约增量）/ deep-audit 零自增）——WI30 补停滞/往返至 ≥8。
- 文档同步（03 changelog 执行面注记 + 02 §4.6 增量）+ roadmap WI29 回写。

## Non-Goals

- 停滞指纹 / 往返检测 / TTL 未到期死会话 claim 提前回收（WI30——停滞指纹补强后死会话经活动信号缺失更快显形）。
- 引擎侧 run-state 孤儿回收改动（`reap-orphans.mjs` 既有，引擎面零 diff）。
- 连续模式 opt-in / 路由（WI28——恢复后链式继续沿其门，本 plan 只保证恢复动作自身幂等）。
- 独立形态崩溃保证（OS 定时器 at-least-once + 幂等防重复，03 §6 成文——无代码）。
- dispatch 行语法扩展（时间戳/过期字段——01 §4.2 行语法冻结，恢复语境判定不扩语法）。

## Task Route

- Type: `architecture change`（守夜人恢复动作 + 幂等面增量——supervisor 两面结构新增）
- Owner Docs: `docs/design/age-autonomy/03-supervisor.md` §6（崩溃恢复表）/§3（触发沿）/§5（幂等）、`docs/design/age-autonomy/02-rule-law.md` §4.6（failures 不计清单增量）、`docs/design/age-autonomy/01-file-ledger.md` §4.2（dispatch 行语法——冻结面，本 plan 不扩）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（1411 批次同裁定）→ Skill: none

## Infrastructure And Config Prereqs

- Prereqs: `2026-08-26-1411-1` + `2026-08-26-1411-2` + `2026-08-26-1411-3` 收口；`2026-08-26-1954-1`（WI28）先置（恢复后链式继续的门语义已定）。
- No infra prereqs beyond existing baseline（零新增 npm 依赖；恢复扫描复用 watchdog 既有周期机制）。

## Phase 1 — 裁定：stale dispatch 判定 + 恢复动作 + 幂等面增量

Targets: `plugin/dsh/src/supervisor/`（watchdog.ts 恢复周期动作 / dispatch-resolve.ts 幂等面增量 / exec-arm.ts reclaim 残项收口 + deep-audit 同 occurrence 重派零自增）、`tools/mission-driver/src/law-rules.mjs`（writer-identity 评审租约最新行增量——窄域行为变更，真值表钉住）、`plugin/dsh/test/law-truth-table.test.mjs`（租约增量用例）、`docs/design/age-autonomy/02-rule-law.md`（§4.6 不计增量 + changelog）、`plugin/dsh/test/supervisor-recovery.test.mjs`（新）

Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 1411-1、1411-2、1411-3、1954-1

- [x] `Decision` **「在飞 vs 死在飞」判定与 redispatch 幂等放行**：判定仅在恢复语境（trigger='recovery' 周期）内做——dispatch 行结论缺失 × agents face 报目标 session 不可恢复 → 判 stale；resume 优先（agents face 存活 → 原会话 followup 注入，不写新行）；redispatch = 对同 occurrence 写新 dispatch 行（新 nonce8 id），旧行 append-only 保留（01 §4.2 不删不改）；幂等面 `dispatchAlreadyRegistered` 增量：同 occurrence 多 dispatch 行时**最新行作答**（stale 行不占位——review/audit 面按行序取末位；deep-audit DAR unpaired 面同构）。备选 A：dispatch 行带时间戳 TTL 过期——否决：01 §4.2 行语法冻结 + append-only 执法面（record-append-only）不容语法扩。备选 B：恢复时改写旧行加失效注记——否决：append-only 只容尾部追加，改行即 deny。残险①：agents face 存活性误报（报活实死）→ resume 后无进展 → claim TTL 到期回收 + WI30 停滞指纹双兜底（成文接受，03 §9 失败面诚实表「子代理挂起」行同族）。残险②：stale 判定仅恢复语境——宿主存活期评审/审计会话死亡不触发恢复周期（等宿主重启进 recovery 周期，或 WI30 停滞指纹 R4 兜底）——成文接受，重启沿 = 守夜人寄生宿主进程的既定语义（03 §6）。【落点：`plugin/dsh/src/supervisor/recovery.ts`（scanStaleDispatches 最新行判定 + sessionLivenessOf 三态 + runRecoveryScan resume/redispatch/降级三分支 + per-mount handled 集幂等）；`dispatch-resolve.ts` dispatchAlreadyRegistered 最新行增量（deep-audit 面：最末行 paired → 不占位、unpaired → 在飞）】
- [x] `Decision` **评审租约 × stale 行的第二消费面**：writer-identity 评审租约把 DRR 内**任意** unpaired dispatch review 视为开放租约（law-rules.mjs:309-311，豁免角色仅 supervisor/engine :245/:317-321）——redispatch 后旧行永 Pairless（死会话永不写结论）→ 租约永开 → plan 此后仅死会话/supervisor/engine 可写。裁定：**租约与幂等面同构取最新行**——租约持有者 = 该 plan DRR 内最末 unpaired dispatch review 行的 sessionId（更早的 superseded 行不持有租约；最末行已配对结论 = 租约关闭，即使更早行 unpaired）——与 Decision 1「最新行作答」单一语义面，非第二规则。落点 = `tools/mission-driver/src/law-rules.mjs` writer-identity 租约段增量（窄域可判定：行序取末位，与 dispatch-resolve 幂等面同源数据）+ 真值表用例（redispatch 后 drafter/human 写放行、死会话写 deny 面、最末行配对即租约关闭）。备选：接受残险不改规则——否决：redispatch 一旦发生即永久锁死 plan 写面（drafter 修订 deny、human disposition deny），可判定的行序事实没有理由留死锁。残险：无（增量与既有租约执法面同构，corpus 无多 unpaired 行语料零误伤）。【落点：writerIdentityRule 租约段重写为「最末 valid dispatch 行作答」（unpaired ∧ 本次写未落同 id 结论 → 租约开，持有者 = 该行 sessionId）；真值表 +2 例（in-flight 重派双 deny 一 allow / 最末行配对即关）+ supervisor-recovery 等价断言面】
- [x] `Decision` **「终态化残留 running」守夜人侧落点**：DSH 形态 LiveRunRecord 内存态随进程消亡（无残留可清——ActiveRunGuard 重启即清空先例）；守夜人恢复处置表 = ①plan 带 claim：TTL 未到期不动作（等自然到期回收，死会话无活动信号不续期）、TTL 已过期走既有 reclaim trigger；②dispatch 无结论：本 plan resume-or-redispatch；③awaitingClosure 停滞：既有 mechanical-verification/closure-audit trigger 面（1411-2）。引擎侧 run-state 孤儿归 `reap-orphans.mjs`（注记，零引擎 diff）。备选：守夜人接管引擎孤儿判定——否决：跨进程活性判定（`~/.mission-driver/active/` 全局登记）是引擎既有职责，复制 = 第二实现。残险：无（三态各有归属，处置表成文进 03 changelog 注记）。【落点：处置表逐字收录 `recovery.ts` 模块头注（Phase 2 同步进 03 changelog）；`git diff --stat tools/mission-driver/src/engine.js` 为空（reap-orphans.mjs 零触碰）】
- [x] `Add` 恢复动作执行化：watchdog 恢复周期（trigger='recovery'）在既有观察回执之上按处置表执行——stale 判定（agents face 会话存活查询）→ resume（followup 注入）∨ redispatch（新 dispatch 行 + exec-arm 既有派发链）；**deep-audit 面同 occurrence 重派不重复自增 audit-rounds**（01 §3.1 字面「同一审计 occurrence 崩溃重派不重复自增」——exec-arm deep-audit 出口 dispatch 行与计数同写（:488-495），崩溃尝试已付自增；恢复重派检测到同 occurrence 已有 DAR dispatch 行（unpaired）时只写新 dispatch 行、跳过 `audit-rounds` 自增与预算预检重入——否则崩溃尝试耗尽预算后重派被预检 deny（:477-486）→ 死锁「永不重派」）；exec-arm `reclaimClaim` 头注移交残项收口（无 agents face 降级回执保留——headless 语境合法降级，措辞从「deferred (WI29)」更新为已收口注记）。【落点：watchdog.ts cycle() recovery 分支（runRecoveryScan 前置于 trigger 求值，terminal 停派优先，fail-soft 隔离）+ recovery.ts redispatchOccurrence（deep-audit 重用已付轮次号 counter=paidRound、仅写行不 setFrontmatter）；law-rules.mjs audit-rounds-overflow 增同轮次重派豁免（新行 iter ∈ 现 unpaired 行轮次集 → 不耗预算不 deny——耗尽后死会话在飞仍可重派，死锁解除）；exec-arm 头注 + 降级回执措辞收口 + createDispatchAgent 导出（recovery 复用同一建会话链）】
- [x] `Add` 02 §4.6 不计清单增量行：恢复 redispatch 不计 failures（03 §6「不把单次崩溃计为计划失败」字面落点）——`recordPlanFailure` 调用点避开恢复路径成文 + owner doc changelog 行。【落点：02 §4.6 不计清单第四行在册；recovery.ts 全模块零 recordPlanFailure 调用（头注成文）；supervisor-recovery.test.mjs 断言重派后 failures 字段不在】
- [x] `Proof` `node --test plugin/dsh/test/supervisor-recovery.test.mjs` ≥7 用例——过期 claim 回收重派（fixture：active plan 带过期 claim → 恢复周期清/换发 + 派发）/ dispatch 无结论 × 会话活 → resume（无新 dispatch 行断言）/ × 会话死 → redispatch（新 dispatch 行 + 旧行保留 + 幂等面最新行作答）/ redispatch 不计 failures（failures 字段不变断言）/ 恢复扫描幂等（连续两次恢复周期零重复动作——单飞守卫 + 幂等面）/ **redispatch 后写面**（stale 行不持租约：drafter 修订放行 + 死会话写 deny，经 law 真值表或等价断言面）/ **deep-audit 同 occurrence 重派零自增**（audit-rounds 不变 + 预算耗尽后仍可重派）。【实测 7/7 绿（2026-08-26）；配套真值表 113→116（租约最新行 +2 / audit-rounds-overflow 同轮次重派豁免 +1）】

Exit Criteria:

- [x] stale 判定 + resume-or-redispatch 落地；幂等面与评审租约「最新行作答/持约」增量有正反例钉住（真值表 + recovery 测试）
- [x] deep-audit 同 occurrence 重派零自增落地（01 §3.1）；预算耗尽后死会话在飞可重派有测试钉住
- [x] 恢复处置表三态归属成文（03 changelog 注记）；02 §4.6 不计增量在册
- [x] `docs/logs/` 更新

## Phase 2 — 测试补强 + 文档同步与回写

Targets: `plugin/dsh/test/supervisor-recovery.test.mjs`（边界例）、`docs/design/age-autonomy/03-supervisor.md`（changelog 执行面注记）、`tools/mission-driver/CONTEXT.md`、`docs/architecture/dsh-plugin-packaging.md`、roadmap、`docs/logs/`

Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [x] `Add` 边界例补强（同文件）：deep-audit DAR unpaired 面恢复语境（死会话 deep-audit 在飞 → 预算预检 + 重派沿既有 1411-2 面，恢复语境仅补 stale 判定注记）+ agents face 缺席语境（headless：stale 判定不可判 → 观察回执不动作，恢复动作显式降级成文）。【落点：supervisor-recovery.test.mjs +2 例（⑧ 预算宽裕变体——重派仍零自增 + trigger 面不双派（dedup 最新行 unpaired → 在飞）+ 最末行结案后 stale unpaired 行不占位（already=false 下一轮可派）；⑨ headless 降级——recovery-observe 回执 + 账本字节不动 + 二周期安静）；文件头注 Phase-2 矩阵 + WI30 增补注记在位】
- [x] `Add` 文档同步与回写：03-supervisor.md changelog（§6 执行面落地注记——**恢复处置表逐字收录**（Phase 1 Decision 2 三态表）+ resume-or-redispatch 语义 + 幂等面/租约最新行作答 + deep-audit 零自增，非契约变更）；02 §4.6 changelog（Phase 1 已落正文互指）；CONTEXT.md 增崩溃恢复段；packaging doc（test 树 supervisor-recovery 条目 + Service Surface 增量）；roadmap WI29 tick + 证据指针 + Last Updated 同步；`docs/logs/` 收口条目。【全部落位：03 changelog M3-WI29 条（处置表三态逐字）；02 changelog M3-WI29 条（不计第四行 + 租约/门禁双窄域增量互指）；CONTEXT.md「守夜人崩溃恢复扫描」段；packaging doc（src 树 recovery.ts 条 + test 树 supervisor-recovery 条 + Service Surface Supervisor bullet CRASH RECOVERY 增量 + 状态头增量句）；roadmap WI29 `[x]` 七段证据指针 + Last Updated「M3 第五片」；本日志两条目】
- [x] `Proof` 收口面：`node --test plugin/dsh/test/supervisor-recovery.test.mjs` 全绿；`pnpm --prefix tools/mission-driver test` + `./verify-age.sh` 全绿（引擎 ≥907 / 插件 ≥342 / 真值表 ≥113 只增不减）；`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0；`git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff）+ 零新增 npm 依赖。【实测 2026-08-26：supervisor-recovery **9/9**；`pnpm --prefix tools/mission-driver test` **910/910**（prompt-check OK）；`./verify-age.sh` **L1+L2+L2.5 GREEN**（插件 367 = 357 基线 + 9 recovery + 真值表 116 = 113 + 3；closure 25/26 + freshness content-equal + smoke ok）；mission-check valid=true exit 0；engine.js diff 为空 + plugin/engine package.json 依赖零 diff】

Exit Criteria:

- [x] supervisor-recovery.test.mjs 本 plan 份额用例全绿（WI30 将补停滞/往返至 WI31 门 ≥8）
- [x] roadmap WI29 `[x]` + 证据指针；Last Updated 同步
- [x] CONTEXT.md / 03 changelog / 02 §4.6 / packaging doc 增量在位；`docs/logs/` 收口条目
- [x] `./verify-age.sh` + mission-check 全绿（L2.5 corpus 覆盖本 plan）

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-26-1954-2-m3-wi29-crash-recovery-scan-1-9e04d146 to ses_reviewer_2026-08-26-1954
- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-26-1954-2-m3-wi29-crash-recovery-scan-2-852dddf7 to ses_reviewer_2026-08-26-1954
- 2026-08-26：iteration 1，共识 acceptable-with-changes #review-2026-08-26-130203-mission-driver-2026-08-26-1954-2-m3-wi29-crash-recovery-scan-1-9e04d146（独立评审 ses_reviewer_2026-08-26-1954：baseline 全实证——start() recovery 观察姿态、exec-arm :29-30/:619-620「deferred (WI29)」移交注记、dispatchAlreadyRegistered 幂等面、LiveRunRecord 内存态 :319-327、02 §4.6 不计清单、supervisor-recovery.test.mjs 不存在均对账；阻塞 2 项 = ①评审租约 × stale 行第二消费面未处理——writer-identity 把任意 unpaired dispatch review 视为开放租约（law-rules.mjs:309-311，豁免仅 supervisor/engine :245/:317-321），redispatch 后旧行永 unpaired → 租约永开 → plan 写面永久锁死（drafter/human deny），plan 只裁定了幂等面未裁定租约面，须补 Decision（租约最新行语义 + law-rules.mjs 入 Targets + 测试）或带重开条件的接受残险 ②deep-audit 重派双重自增——01 §3.1「同一审计 occurrence 崩溃重派不重复自增」vs exec-arm deep-audit 出口 dispatch 行与 audit-rounds 同写（:488-495）+ 预算预检（:477-486）：崩溃尝试已付自增，原样重入 = 双计 + 预算耗尽后重派被 deny 永不重派，须裁定同 occurrence 零自增 + 测试；非阻塞 2 项 = stale 判定仅恢复语境的残险（宿主存活期会话死亡等重启或 WI30 R4）显式成文 / 恢复处置表逐字进 changelog 注记以便 WI31 审计）
- 2026-08-26：iteration 2，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-26-1954-2-m3-wi29-crash-recovery-scan-2-852dddf7（独立复核 ses_reviewer_2026-08-26-1954：两项阻塞修复落地且 sound——①租约裁定成文为 Decision 2：租约持有者 = 最末 unpaired dispatch review 行 sessionId、superseded 行不持约、最末行配对即租约关闭——与幂等面「最新行作答」同构单一语义面（非第二规则）；law-rules.mjs + 真值表入 Targets；Proof/Exit 钉 redispatch 后写面双向（drafter 放行 + 死会话 deny）；单 dispatch 流 corpus 行为不变（多 unpaired 语料仅源自 redispatch）零误伤 ②deep-audit 零自增：同 occurrence 已有 DAR dispatch 行（unpaired）时只写新行、跳过自增与预算预检重入；「audit-rounds 不变 + 预算耗尽后仍可重派」入 Proof 与 Exit；检测骑既有 DAR-unpaired 面与 Decision 1 一致；两项非阻塞落地（残险②显式 :65 / 处置表逐字收录 :89）；份额 ≥5→≥7（:34/:70）；格式干净、无新引入问题；与 P3 的 exec-arm 触碰面错开（deep-audit/reclaim vs terminal 转发）执行序 2→3 合并无歧义）

## Verification

- pass test 2026-08-26-130203-mission-driver basisHash=b00df8fd817006f166cc9665fc2fe1e759d49ebb77b1777a4d4125d47b9c1450 exit=0
- pass verify-age 2026-08-26-130203-mission-driver basisHash=b00df8fd817006f166cc9665fc2fe1e759d49ebb77b1777a4d4125d47b9c1450 exit=0

## Closure

- dispatch audit #audit-2026-08-26-130203-mission-driver-2026-08-26-1954-2-m3-wi29-crash-recovery-scan-1-2d542c1c to ses_auditor_2026-08-26-1954
- accepted #audit-2026-08-26-130203-mission-driver-2026-08-26-1954-2-m3-wi29-crash-recovery-scan-1-2d542c1c：独立收口审计（ses_auditor_2026-08-26-1954）通过——17 项全勾与 live 工作区逐项对账：`plugin/dsh/src/supervisor/recovery.ts` 在库且非空壳（`scanStaleDispatches` 最新 valid dispatch 行 unpaired 判在飞 :142 / `sessionLivenessOf` live·dead·undecidable 三态 :94 / `runRecoveryScan` resume∨redispatch∨headless 降级三分支 :270 + per-mount handled 集幂等 / deep-audit paidRound 复用已付轮次号 :113-:134；全模块零 `recordPlanFailure`（头注 :42 成文 + grep 零调用点——02 §4.6 不计增量字面兑现））；`watchdog.ts` recovery 分支前置接线（:506-:508 trigger='recovery' ∧ 未终态，:601 start() 首周期）；`dispatch-resolve.ts` `dispatchAlreadyRegistered` 最新行作答增量（:336-:382——deep-audit 面最末行 paired → 开放下一轮，stale 行不占位）；`law-rules.mjs`（tools+assets 双副本）双增量——writer-identity 评审租约最末 valid dispatch 行作答（:301-:335 superseded 行不持约、最末行配对即关——redispatch 后 plan 写面不锁死）+ `audit-rounds-overflow` 同轮次重派豁免（:630- 轮次号 ∈ 现 unpaired 在飞集 → 不耗预算不 deny）；`exec-arm.ts` 残项收口（`createDispatchAgent` 导出 :222 被 recovery 复用 :328/:547/:598 + WI29 移交注记消解）；文档同步全在位（03-supervisor.md changelog M3-WI29 条含恢复处置表逐字收录 :98 / 02-rule-law.md §4.6 不计第四行 :159 + changelog :210 / CONTEXT.md 守夜人崩溃恢复扫描段 / packaging doc 状态头增量句 + src 树 recovery.ts 条 + test 树 supervisor-recovery 条 + Service Surface CRASH RECOVERY / roadmap WI29 `[x]` :77 七段证据指针 + Last Updated :7 / docs/logs/2026/08-26.md 两收口条目）；审计者复跑机械验证：`node --test plugin/dsh/test/supervisor-recovery.test.mjs` **9/9** exit 0、`pnpm --prefix tools/mission-driver test` **910/910 pass + prompt-check OK** exit 0、`./verify-age.sh` **L1+L2+L2.5 GREEN**（真值表 116/116——租约最新行 +2 / 门禁同轮次豁免 +1）exit 0、`mission-check` valid=true exit 0；`git diff --stat` 核实 engine.js 空 diff（零引擎 diff——孤儿归 reap-orphans 注记兑现）+ 双 package.json 依赖零 diff（零 npm 依赖不变量保持）+ web/ 零改动（前端面无触碰 → 无需重建 dist）；Deferred 一项（TTL 未到期死会话 claim 提前回收）为真实域外残项且后继在册（M3-WI30 停滞指纹），残险两句（stale 判定仅恢复语境 / 存活性误报双兜底）成文于 Phase 1 Decision 1，无域内在案缺陷或契约漂移藏匿。

## Deferred But Adjudicated

### TTL 未到期死会话 claim 提前回收

- Classification: `watch-only residual`
- Why Not Blocking Closure: 提前回收需会话活性判定（心跳/进度信号语义），当前仅 claim TTL + 活动信号缺失（不续期）双面兜底；死会话 claim 最长滞留 = TTL 窗口。
- Successor Required: yes（M3-WI30 停滞指纹——活动信号连续缺失判定补强后可评估提前回收）
