---
status: active
mission: age-autonomy-implementation
work-item: M2-WI41
group: "2026-08-25-0925"
verify: [test]
---

# 2026-08-25-0925-1 M2-WI41 修复 D2 账本收口死锁：closureScriptCheck 回执感知路由（age-autonomy M2-WI41）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M2 WI41（P0·deep-audit R1）；缺陷记录 `docs/bugs/2026-08-25-ledger-plan-closure-deadlock.md`（D2 open，无既有 roadmap 项时立案，现已由 WI41 收编）；完成公式契约 `docs/design/age-autonomy/01-file-ledger.md` §5.2
> Related: `2026-08-25-0635-3`（D2 live 受害者；其 Phase 1 Decision 5 交付了本 plan 依赖的双读接线）；同批执行顺序：本 plan（N=1）→ `2026-08-25-0925-2`（N=2，WI42+WI44 读面加固——与本 plan 同文件族 `plan-check.mjs`/`flow-loader.js`/`ledger-dualread.mjs`，先后落避免同文件冲突）→ `2026-08-25-0925-3`（N=3，WI43 纯文档，可并行）；`2026-08-25-0815-2`/`-3`（WI16 完成派生门禁 / WI19 机械验证写者——法律层写时执法，本 plan 是其引擎侧路由前置）；roadmap Follow-up Backlog「引擎读面未注入 defaultVerifyKeys」P2（deep-audit round 1 裁定归 WI19/WI41 立项——本 plan 兑现引擎侧注入与默认键裁定）

## Current Baseline

**收口路由对账本格式回执盲视：全勾 frontmatter plan 永远走 `pass → BUILD_VERIFY` 直达终态，跳过 `## Closure` 回执唯一写者步（CLOSURE_AUDIT）——完成公式五合取永假，plan 永驻 activePlans 无限重喂。**（以下事实 2026-08-25 live 核实）

- **路由事实**：`flows/plan-execution.json:29-36` CLOSURE_SCRIPT_CHECK `pass → BUILD_VERIFY`、`fail → CLOSURE_AUDIT`；CLOSURE_AUDIT `approved → BUILD_VERIFY`（:44）是 `## Closure` dispatch/accepted 回执的唯一写者步；BUILD_VERIFY `pass → done`（:62）是 `## Verification` pass 行的唯一写者步。fail→CLOSURE_AUDIT 路由已存在——缺陷不在 flow JSON，在 script 判定条件对账本回执盲视。
- **判定现状**：`closureScriptCheck`（`flow-loader.js:202-244`）经 `inspectPlan`（`plan-check.mjs:142`，strict:false）只有两个 fail 条件——`totalUnchecked > 0` 与 legacy `planStatus === "completed" ∧ missing closure evidence`（:223）。frontmatter 格式全勾 plan：`analyzeFrontmatter` 返回 `planStatus = state.normalized`（active）、`totalUnchecked = 0` → 两条件均不触发 → pass → 直达 BUILD_VERIFY → done，回执永远缺失。
- **live 受害者**：0635-3 计数域全勾 43 项 / 0 未勾（live 复核 `inspectPlan` totalChecked=43/totalUnchecked=0；bug doc §1 的「60+」为发现时估算口径，以本 plan 实测为准），subflow 于 08:13:47 completed，`deriveCompleted` reasons = `missing-pass:test` + `no-audit-receipt`（bug doc D2 实测）→ 永驻 activePlans；0815 批次三份执行完成后将命中同一死锁——不修则整个 mission 的所有 ledger plan 都无法收口。
- **派生视图距离**：`analyzePlan` 已调用 `planLedgerState(content)`（`plan-check.mjs:109`），completed/conjuncts/reasons 派生视图（`ledger-dualread.mjs:87-108` → `deriveCompleted`）已在手边——`analyzeFrontmatter` 只保留了 `isCompleted`，reasons 被丢弃。修复不需要新扫描器，只缺一个 fail 条件与输出透传。
- **defaultVerifyKeys 注入缺口**：`planLedgerState(text, opts)` 支持 `opts.defaultVerifyKeys` 透传（`ledger-dualread.mjs:87`），但引擎全部调用点（flow-loader `_scanPlansByStatus`/`closureScriptCheck`、plan-check `analyzePlan`、`monitor.js:840`）都不注入——省略 `verify` 的 plan 即使回执齐全也派生不出 completed（roadmap Follow-up Backlog P2 明言裁定归 WI19/WI41 立项；与 D2 同族的 verify-省略版死锁）。
- **mission 命令面**：`missions/age-autonomy-implementation.json` commands 九键（test/build/lint/typecheck/plan-check/mission-check/gates/verify-age/verify-e2e）；`commands.test` 是 mission-check REQUIRED_FIELDS 唯一强制命令键。
- **约束面**：`engine.js` 零改动（AI Block Conditions 状态机核心路径——本 plan 有覆盖 plan，仍自我约束不触 engine.js）、`flows/plan-execution.json` 零改动（fail→CLOSURE_AUDIT 既有路由即设计意图）、零 npm 依赖不变；`ledger-sections.mjs`/`ledger-dualread.mjs` 若改动须重建 plugin assets（`node plugin/dsh/scripts/build-bundle.mjs`，否则 freshness check 红）。
- **测试基线**：`pnpm --prefix tools/mission-driver test` 813 green（2026-08-25 评审期实测；执行时以当日实测为准且不得回退）；plan-execution 路由测试目前无 frontmatter 回执语料（bug doc §5「None yet」）。

## Goals

- `closureScriptCheck` 对 frontmatter 格式 plan 回执感知：计数域全勾 ∧ `deriveCompleted` 不成立 → fail（路由 CLOSURE_AUDIT），derived.reasons 逐条进 fail text 与 `SCRIPT_CHECK_DETAILS`（CLOSURE_AUDIT 反馈面既有消费变量）。
- `inspectPlan`/`analyzePlan` 输出派生视图（completionReasons 等），CLI JSON 向后兼容（纯增量字段）。
- 引擎读面（flow-loader 全部 `planLedgerState` 调用点）注入 mission 默认 verify 键，实现 01 §4.1「verify 缺失 → mission 默认」的引擎路径，清偿 Follow-up P2。
- 回归测试钉住三态（缺回执 / 缺 pass 行 / stale basisHash）+ legacy 行为逐字节不变 + 0635-3 真实语料断言。
- bug doc D2 关闭（fixed + 证据指针）+ roadmap WI41 tick 回写。

## Non-Goals

- 写时执法门禁族（0815 批次 law 层——本 plan 只修引擎读面与路由判定，不改任何 deny 面）。
- BUILD_VERIFY pass 行写入的机械化（commands runner + `gate-check --verify` = 0815-3 Phase 3；M3 守夜人接管执行）。修复后 pass 行仍由 prompt 步写；本 plan 保证的是「缺 pass 行时 subflow 无法静默 done」的路由面——收敛保证见 Phase 1 Proof ④。
- monitor 显示面的 defaultVerifyKeys 注入（Deferred But Adjudicated：display-only + extends 合并 P2 前有误读风险）。
- D1（运行中引擎的 ESM 缓存陈旧）——bug doc 已裁定 restart 即愈、零代码修，不在本 plan。
- WI42/WI44（读面校验器接线与空真封堵——同批 N=2 plan，避免同文件族并行冲突而分立）。

## Task Route

- Type: `bug investigation`（根因已立案成文 bug doc §3，本 plan 是修复执行 + 回归钉住）
- Owner Docs: `docs/bugs/2026-08-25-ledger-plan-closure-deadlock.md`（缺陷权威）、`docs/design/age-autonomy/01-file-ledger.md` §5.2（完成公式——fail 条件的语义来源）、`tools/mission-driver/design/mission-driver-flow-design.md`（plan-execution 子流程设计）、`docs/plans/00-plan-authoring-and-execution-guide.md`（回执/pass 行语法权威）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（默认审计 prompt 面向 plan/roadmap 审计，非缺陷修复）→ Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（改动全部仓库内并进 git；不触 CI 触发路径、不新增 npm 依赖、不启外部服务）

## Phase 1 — 落点裁定与回执感知路由修复

Targets: `tools/mission-driver/src/plan-check.mjs`、`tools/mission-driver/src/flow-loader.js`、`tools/mission-driver/test/`（新路由回归测试文件）
Skill: none

- Item Types: `Decision | Fix | Add | Proof`
- Prereqs: 无（M1 双读基座已在 main）

- [x] `Decision` **落点裁定（引擎侧 vs 插件层，roadmap WI41 字面要求）**：修复落引擎侧——`closureScriptCheck`（flow-loader.js script step 判定）+ `inspectPlan`/`analyzePlan` 派生视图透传（plan-check.mjs）。依据：收口路由是引擎自有流程语义，插件 pre-execute 面拦截不到引擎内部 script step 的路由决策；「零引擎 diff 底线」（`docs/design/age-autonomy/00-overview.md` §7 迁移路径 P1 law 行——live 核实该短语的实落段；roadmap 核心纪律 1 引作 §3 系指针偏差）约束的是门禁/守夜人**新增逻辑**的沉淀位置，不豁免引擎自身缺陷修复。备选：插件层写时门禁绕过引擎路由——否决：不改路由则 CLOSURE_AUDIT 步仍不可达，写者步不存在的面无从执法。硬约束自我加码：`engine.js` 与 `flows/plan-execution.json` 均零改动（fail→CLOSURE_AUDIT 既有路由即设计意图，只修判定条件）。残险：无新增面——引擎行为收窄为「多一个 fail 条件」，legacy 分支逐字节不变由测试钉住。（执行注记：裁定按计划兑现——diff 落 `flow-loader.js:202-266` fail 条件 + `plan-check.mjs` 派生视图；`git diff --stat` 两保护区为空）
- [x] `Decision` **fail 条件语义**：`format === "frontmatter" ∧ 计数域全勾 ∧ deriveCompleted(text, {defaultVerifyKeys}) 不成立` → fail；fail text 与 `SCRIPT_CHECK_DETAILS` 携带 derived.reasons（`no-audit-receipt` / `missing-pass:<key>` / `basis-hash-mismatch:<key>` 等逐条，02 §2 结构化 deny 纪律同款——reason 指向缺失的合法路径）。该合取是 WI41 文字「全勾 ∧ 缺 verify pass 行 / 缺配对回执 → fail」的统一判定，并额外覆盖返工重勾后旧 pass 行 stale 的第三态（Closure Findings 返工 → 重勾 → basisHash 变 → 旧 pass 行失效）——三态归一，不另造第二套条件，复用 `planLedgerState`/`deriveCompleted` 单一实现（01 §5.2「不得各自带正则」纪律）。已知边界：`verify: []` 空真输入（空键集零 pass 行即满足合取）在本判定下仍会 pass——该洞由同批 N=2（WI44）双层封堵，批次顺序 N=1 → N=2 保证封堵先于 M2 收口；本 plan 不重复实现（防两处判定分叉）。非全勾时既有 `totalUnchecked > 0` 条件先行 fail，语义不变；legacy 与 format:none 行为逐字节不变。（执行注记：语义按计划落地——`flow-loader.js` closureScriptCheck 第三 fail 条件，reasons 逐条各成一条 issue line）
- [x] `Add` `inspectPlan`/`analyzePlan` 派生视图输出：frontmatter 分支返回值增 `completionReasons`（derived.reasons）与 `verifyKeys`（生效键集及来源——显式 frontmatter / mission 默认注入）；CLI JSON 输出纯增量字段，既有字段（passed/file/format/planStatus/totalChecked/totalUnchecked/details/allUnchecked）语义不变。（执行注记：实落为四增量字段 `derivedCompleted`/`completionReasons`/`verifyKeys`/`verifyKeysSource`，仅 frontmatter 分支输出——legacy/none 输出逐字节不变；live 验证 0635-3 CLI 输出 `completionReasons: ["missing-pass:test","no-audit-receipt"]`）
- [x] `Fix | Add` `closureScriptCheck` fail 分支：按上述 Decision 语义实现（Phase 1 先消费显式 `verify` 字段；Phase 2 默认键注入后判定自动覆盖省略 verify 的 plan——两 Phase 共用同一判定函数，无第二实现）。（执行注记：单一判定 = inspectPlan 派生视图；Phase 2 注入后同一条件自动覆盖省略 verify 面）
- [x] `Proof` 回归测试（新测试文件，node --test）：①全勾 fixture 无回执无 pass 行 → fail，reasons 含 `no-audit-receipt` 与 `missing-pass:test`；②追加合法 dispatch/accepted 对 → 仍 fail（`missing-pass:test`）；③追加 basisHash 匹配 pass 行 → pass；④返工态——③基础上 Closure Findings 增未勾返工项再全勾（basisHash 变）→ fail（`basis-hash-mismatch:test`）；⑤legacy 全勾带证据 fixture 行为不变；⑥0635-3 真实语料断言：当前态（全勾、缺 pass 行、缺回执）→ fail 且 reasons 正确（D2 死锁解除的路由面证明；0635-3 的实际收口由引擎下次 run 完成，见 Phase 3）。命令：`pnpm --prefix tools/mission-driver test`。（执行注记：`tools/mission-driver/test/closure-routing.test.js` 13 例全绿——①–⑥ + SCRIPT_CHECK_DETAILS/flowVars 面 + inspectPlan 增量字段面；⑥写成「路由决策镜像派生态」的双向断言，引擎恢复补回执后不回退）

Exit Criteria:

- [x] 三态 fixture（缺回执 / 缺 pass 行 / stale basisHash）全部 fail 且 reasons 断言正确；补齐后 pass
- [x] legacy 与 format:none 行为回归钉住（既有测试零修改通过；如需改钉须证明是被测行为而非测试漂移）
- [x] 0635-3 语料 fail 断言绿
- [x] `git diff --stat tools/mission-driver/src/engine.js` 与 `git diff --stat tools/mission-driver/flows/plan-execution.json` 均为空
- [x] `pnpm --prefix tools/mission-driver test` 全绿（813 基线不回退）（执行实测：863 → 876/0，+13 新测试）
- [x] `docs/logs/` 更新

## Phase 2 — defaultVerifyKeys 引擎读面注入

Targets: `tools/mission-driver/src/flow-loader.js`（closureScriptCheck 与 plans 扫描/谓词族的注入点）、`tools/mission-driver/test/`
Skill: none

- Item Types: `Decision | Fix | Add | Proof`
- Prereqs: Phase 1（判定函数就位）

- [x] `Decision` **mission 默认 verify 键裁定 = `["test"]`**：依据 = `commands.test` 是 mission-check REQUIRED_FIELDS 唯一强制命令键，全 mission 普适存在且语义即「机械验证」。备选①全部非空 commands 键——否决：gates/mission-check/verify-age/verify-e2e 非幂等机械验证面（e2e 缺 env fail-fast、gates 属门禁语义），全键默认会把 BUILD_VERIFY 变全命令矩阵；备选②mission 增显式 `defaultVerify` 配置字段——否决：无真实需求背书的配置面增长，0815-3 verify-keys 门禁落地后按需重开（裁定已在本 plan 成文，重开有据）。残险：依赖 build/typecheck 收口的 plan 必须显式写 `verify`——存量语料全部显式 `verify: [test]`，无回退面。01 §4.1「缺失→mission 默认」的引擎路径由此实现（Follow-up P2 清偿）。（执行注记：单一实现 = `plan-check.mjs` 导出 `missionDefaultVerifyKeys(mission)`——commands.test 非空字符串 → `["test"]`，否则 null 不注入；gate-check `--verify` 面的 DEFAULT_VERIFY_KEY_ORDER 四键交集属不同消费面另案裁定，不合并）
- [x] `Fix | Add` flow-loader 注入面：`createExpressionFunctions` 谓词族与 `closureScriptCheck` 的 `planLedgerState`/派生调用注入 `defaultVerifyKeys = ["test"]`（mission 无 `commands.test` 时退化为不注入，行为同现状——防御性分支，本仓库 mission 必有）。`plan-check.mjs` CLI 的 `analyzePlan` **同步注入同一默认**（CLI 显示与 closureScriptCheck 路由判定不劈叉——同一 mission 上下文同一键集）。效果：省略 `verify` 的全勾 + 回执齐全 plan 派生 completed、离开 activePlans（消灭 verify-省略版死锁）。（执行注记：CLI 面经 `discoverOwningMission` 祖先走查解析 owning mission——该函数自 gate-check.mjs 上移 `mission-check.mjs` 共享单一实现，gate-check 改 import；plugin assets 重建（flow-loader/mission-check/plan-check 三副本，freshness 43 文件 content-equal））
- [x] `Proof` 注入语义测试：省略 verify + 全勾 + 回执齐全 + basisHash 匹配 pass 行 fixture → 注入后 `completed:true`；不注入（模拟无 commands.test mission）→ reasons 含 `no-verify-keys`（现状语义钉住，防注入面扩大误伤）；谓词面（activePlans/closedPlans 归属）对两类 fixture 的队列断言。命令：`pnpm --prefix tools/mission-driver test`。（执行注记：`closure-routing.test.js` Phase 2 describe 5 例——missionDefaultVerifyKeys 矩阵 / 注入后 pass+verifyKeysSource=mission-default / 无 commands.test 退化 no-verify-keys / activePlans·draftPlans·closedPlans 归属 / CLI 端到端 mission-default 注入）

Exit Criteria:

- [x] 省略 verify 的 plan 派生语义与显式 `verify: [test]` 一致（注入后）
- [x] 无 commands.test 的退化分支行为同现状（钉住）
- [x] `pnpm --prefix tools/mission-driver test` 全绿（执行实测 876/0）
- [x] `docs/logs/` 更新

## Phase 3 — 回写、bug 关闭与恢复通路成文

Targets: `docs/bugs/2026-08-25-ledger-plan-closure-deadlock.md`、`docs/backlog/age-autonomy-implementation-roadmap.md`、`tools/mission-driver/CONTEXT.md`、`docs/logs/`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1/2 全绿

- [x] `Add` bug doc D2 状态更新：`Status: open` → `fixed`，记录修复 commit、回归测试文件指针、0635-3 恢复通路说明（修复落地后下一次引擎 run 对 0635-3 重跑 subflow：closureScriptCheck fail → CLOSURE_AUDIT 补 dispatch/accepted 回执 → BUILD_VERIFY 补 pass 行 → 派生 completed 离队；恢复是引擎运行期事件，非本 plan 可代跑，成文即可）；D1 段落维持 restart 裁定不变。（执行注记：`docs/bugs/2026-08-25-ledger-plan-closure-deadlock.md` 头部 Status → D2 fixed + commit `00aeb9c` + 测试指针；§4 Fix 段与 §5 Tests 段同步改写；D1 restart 裁定原样保留）
- [x] `Add` roadmap 回写：WI41 `[x]` + 证据指针（修复 diff 文件、回归测试路径、bug doc closed 状态）；头部 `> Last Updated` 日期同步（清偿 deep-audit round 2 P2「头部日期过期」项——回写步固有动作，0925 批次三份各自回写时同步）。WI24 不勾（M2 收口门归后续 WI21–WI24 批次）。（执行注记：WI41 证据括注含 engine.js/plan-execution.json 零 diff 与 876/0 + L1+L2 GREEN；Follow-up「引擎读面未注入 defaultVerifyKeys」P2 与「头部日期过期」P2 均勾选清偿（前者本 plan Goals 明示清偿、后者回写固有动作）——monitor 显示面残项按本 plan Deferred But Adjudicated 归后续；WI24 仍未勾 ✓）
- [x] `Add` CONTEXT.md 同步：flow-loader 相关段增一句 closureScriptCheck 回执感知语义（frontmatter 全勾 plan 缺回执/pass 行/basisHash stale → 路由 CLOSURE_AUDIT）。（执行注记：落「账本区块/派生库」段尾——回执感知 fail 条件 + defaultVerifyKeys `["test"]` 三面注入 + inspectPlan 增量派生视图字段一句成文）
- [x] `Proof` 收口链：`node tools/mission-driver/src/plan-check.mjs docs/plans/age-autonomy/2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md` 输出含 completionReasons（CLI 面可见性面）；`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0；`./verify-age.sh` L1+L2 绿。（执行实测：completionReasons = `["missing-pass:test","no-audit-receipt"]` + verifyKeys [test]/frontmatter；mission-check exit 0；L1 876/0 + L2 221/0 + freshness 43 文件 content-equal + smoke-import ok = GREEN）

Exit Criteria:

- [x] bug doc D2 标记 fixed 且证据指针可验证
- [x] roadmap WI41 `[x]` + 证据指针 + Last Updated 同步；WI24 仍未勾
- [x] CONTEXT.md 语义句落地
- [x] `pnpm --prefix tools/mission-driver test` + `./verify-age.sh` L1+L2 全绿（执行实测 876/0 + 221/0 GREEN）
- [x] `docs/logs/` 收口条目

## Draft Review Record

- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0925-1-m2-wi41-closure-routing-deadlock-1-25f186c3 to ses_reviewer_4
- 2026-08-25：iteration 1，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0925-1-m2-wi41-closure-routing-deadlock-1-25f186c3（独立评审 ses_reviewer_4：baseline 抽查全实证——路由两 fail 条件、派生视图距离、注入缺口、0635-3 死锁在 HEAD 精确复现；阻塞 2 项 = 确认 live 缺陷修复缺 Fix 类型标注、0635-3 计数「60+」实为 43——均已修；非阻塞 4 项：00-overview §7 指针修正、CLI 注入裁定成文、verify:[] 空真边界句（序贯归 N=2/WI44）、测试基线 813 刷新——均已修）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0925-1-m2-wi41-closure-routing-deadlock-2-95f3f7c5 to ses_reviewer_5
- 2026-08-25：iteration 2，共识 acceptable-as-is #review-2026-08-25-063133-mission-driver-2026-08-25-0925-1-m2-wi41-closure-routing-deadlock-2-95f3f7c5（独立复核：六项修复全部落地且 live 复验——813 实测全绿、43 计数复核、REQUIRED_COMMANDS=['test'] 前提实证；死锁解除/legacy 不变/basisHash 序/子流程有界四项 soundness 论证独立验证通过；无新引入问题。1 项微观察（零 checkbox plan 的空全勾方向安全，结构校验归 N=2 seam）留执行期裁量）

## Verification

## Closure

## Deferred But Adjudicated

### monitor 显示面 defaultVerifyKeys 注入

- Classification: `watch-only residual`
- Why Not Blocking Closure: monitor plans 列表为显示面，无重喂/路由后果；其 mission 读取未走 extends 合并（deep-audit round 2 P2 已单列立案），在裸 JSON.parse 面上注入默认键有显示误读风险
- Successor Required: yes（monitor extends 合并 P2 修复时顺带，或 WI22 证据面重建立案时收编）

### BUILD_VERIFY pass 行写入机械化

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 已由 0815-3 Phase 3（commands runner + gate-check --verify）与 M3 守夜人立案；本 plan 只保证「缺 pass 行时 subflow 无法静默 done」的路由面，收敛由本 plan 回归测试 ②→③ 与 ④ 钉住
- Successor Required: yes（0815-3 / M3-WI26）
