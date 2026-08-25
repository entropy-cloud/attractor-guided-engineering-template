---
status: active
mission: age-autonomy-implementation
work-item: M2-WI42+WI44
group: "2026-08-25-0925"
verify: [test]
---

# 2026-08-25-0925-2 M2-WI42+WI44 校验器生产接线 + verify 空真封堵（age-autonomy M2-WI42+WI44）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M2 WI42（P1·deep-audit R1：`validatePlanFrontmatter`/`validateRoadmapFrontmatter` 零生产消费者）+ WI44（P1·deep-audit R2：`verify: []` 空真通道）；字段集契约 `docs/design/age-autonomy/01-file-ledger.md` §2/§4.1/§5.2
> Related: 同批执行顺序：`2026-08-25-0925-1`（N=1，WI41 收口路由修复——与本 plan 同文件族 `plan-check.mjs`/`flow-loader.js`/`ledger-dualread.mjs`，先落后落避免冲突）→ 本 plan（N=2）→ `2026-08-25-0925-3`（N=3，WI43 纯文档）；0815-1 Phase 2（agent 名单注入通道消费 `validatePlanFrontmatter` 的可注入形态——本 plan 不改其签名，只接生产读面）；0815-3 Phase 3（verify-keys 枚举门禁——写时执法面，本 plan 是读面）；M1 交付 `2026-08-25-0635-1`/`-2`（两校验器与派生公式的实现 plan）

## Current Baseline

**M1 交付的字段集校验器是「孤儿」：定义齐全、测试齐全、生产读面零调用——手写禁写态、伪回执、未知字段全部静默通过；`verify: []` 空数组更使机械验证合取空真，零条 pass 行即派生 completed。两处都是 deep-audit 立案的 live 缺陷。**（以下事实 2026-08-25 live 核实）

- **校验器零生产消费者**（WI42）：全仓 grep `validatePlanFrontmatter|validateRoadmapFrontmatter` 仅命中定义（`ledger-frontmatter.mjs:157/:224`）、plugin assets 副本（build-bundle 复制通道）、单测（`test/ledger-frontmatter.test.js`）与文档/plan 引用——plan-check.mjs、flow-loader.js、monitor.js、roadmap-check.mjs 四个生产读面零调用。
- **静默通道机理**：`analyzeFrontmatter`（`plan-check.mjs:81-98`）的 structuralErrors 只收 `scan.errors`（计数域/append-only 行法）与 `scan.fmError`（解析错）；字段集校验（status 枚举、必填、未知键、claim 配对、verify 元素合法性）从未进读面。live 探针（deep-audit R1）：手写 `status: completed` + 伪 basisHash 过 `plan-check --strict` exit 0——`readPlanStatus` 原样读出 fm.status，`planLedgerState:103` normalized 取 `derived.completed ? "completed" : read.status` 得 normalized="completed" 而 completed:false、terminal:false 自相矛盾；且 "completed" 不在扫描队列状态集 → 该 plan 静默退出 active/draft 双队列（第二真相通道，正是 01 §2 纪律所禁）。未知字段/键名 typo 同样静默通过。
- **空真通道机理**（WI44）：`validatePlanFrontmatter`（`ledger-frontmatter.mjs:183-194`）接受 `verify: []`（数组为空 → 元素循环零次 → 无 error）；`deriveCompleted`（`ledger-sections.mjs:428-448`）`keys = verifyField`（空数组，非 undefined）→ `missingKeys = []` → `mechanicalVerification = true`——零 pass 行即机械验证通过。live 探针（deep-audit R2）：`verify: []` + 回执齐全 → 派生 completed:true，agent 可静默豁免全部机械验证。01 §4.1 只定义「缺失（undefined）→ mission 默认」，未定义空数组语义。
- **存量语料面**：live grep `verify: \[\]` 生产语料零命中（仅 roadmap 文字与解析测试 fixture 命中）——封堵无存量破坏面；`test/ledger-frontmatter.test.js:50` 钉住的是「`verify: []` **可解析**」（解析=格式子集，校验=字段语义，两层分离）。
- **读面拓扑**：plan-check `analyzePlan:109`、flow-loader `_scanPlansByStatus`、`monitor.js:840` 全部经 `planLedgerState`（`ledger-dualread.mjs:87`）——单 seam 接线可全覆盖（01 §5.2「不得各自带正则」）；roadmap-check `parseRoadmapMarkdown:132-150` 经 `splitLedgerSections` 拿 `split.fm`（audit-rounds 可达）但同样不校验字段集。
- **写时执法分工**：0815-1 Phase 1 种子规则 `plan-structure` 对 proposedContent 做「frontmatter 合法性」写时校验（enforce 前置 = 读面可见性）；本 plan 是读面（存量文件与 CLI 消费面），两 plan 无实现重叠。
- **测试基线**：`pnpm --prefix tools/mission-driver test` 813 green（2026-08-25 评审期实测，执行时以当日实测为准且不得回退）；corpus 冒烟（ledger-corpus 生成面）断言存量语料解析/结构面——接线后 fieldErrors 若使 fixture 预期翻转，属改钉而非回退（逐个注明）。
- **flow-loader 日志面现状**：`_scanPlansByStatus`（flow-loader.js:76-94）无任何日志通道——fieldErrors 的 warn 消费需要本 plan 显式落 item（见 Phase 1），不会经读 seam「自动」产生。

## Goals

- `validatePlanFrontmatter`/`validateRoadmapFrontmatter` 接线进全部生产读面：`planLedgerState` 读 seam（frontmatter 分支）+ roadmap-check 自有 frontmatter 判定点——fieldErrors 成为读面一等公民。
- 后果矩阵落地：plan-check 对 field error exit 1；flow-loader 扫描日志 warn（kill silence，不 kill queue）；monitor plans API 暴露 fieldErrors。
- `verify: []` 双层封堵：校验器拒绝空数组（deny reason 指向「省略以用 mission 默认」）+ `deriveCompleted` 空集按 no-verify-keys 处理（防御深度——覆盖绕过校验器的输入路径）。
- live 探针反向钉住（三缺陷 fixture 全部被读面拦截）+ 存量合法语料 corpus 零误杀。

## Non-Goals

- 写时 deny 面（0815-1 `plan-structure` 规则——本 plan 只读面；两 plan 的分工边界已在双方 plan 成文）。
- 队列成员资格语义变更（fieldErrors 不改变 activePlans/draftPlans 成员判定——liveness 裁定见 Phase 1 Decision 2；「invalid plan 不得进执行队列」属执法面演进，非本 WI 字面）。
- monitor extends 合并 P2（deep-audit round 2 另案）。
- plan-check 对 stale basisHash 的 fail 语义（completionReasons 可见性随 0925-1 落地；fail 判定属完成公式/law 面，不叠加）。
- monitor 前端展示层的 fieldErrors UI 呈现（本 plan 只交付 API 数据面；前端展示属监控面演进，无回执/路由后果）。
- mission 默认 verify 键注入（0925-1 Phase 2 裁定与落地——本 plan 的 no-verify-keys 语义消费其注入结果，不重复实现）。

## Task Route

- Type: `bug investigation`（deep-audit 立案的两处 live 缺陷修复：契约漂移「校验器零消费者」+ 空真缺陷「空数组豁免机械验证」）
- Owner Docs: `docs/design/age-autonomy/01-file-ledger.md` §2（frontmatter 子集）/§4.1（字段表）/§5.2（完成公式）、`docs/plans/00-plan-authoring-and-execution-guide.md` § Plan Frontmatter Field Table（字段语义权威）、`docs/backlog/00-roadmap-authoring-guide.md`（roadmap frontmatter 形态）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（同 0815/0925-1 裁定）→ Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（纯引擎内读面改动；`ledger-frontmatter.mjs`/`ledger-dualread.mjs`/`ledger-sections.mjs` 改动后须 `node plugin/dsh/scripts/build-bundle.mjs` 重建 assets，否则 freshness check 红）

## Phase 1 — 校验器生产读面接线（WI42）

Targets: `tools/mission-driver/src/ledger-dualread.mjs`（读 seam）、`tools/mission-driver/src/plan-check.mjs`、`tools/mission-driver/src/flow-loader.js`（warn 消费）、`tools/mission-driver/src/roadmap-check.mjs`、`tools/mission-driver/src/monitor.js`（API 面暴露）、`tools/mission-driver/test/`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 0925-1 落地（同文件族先后序；`completionReasons` 输出面已就位则本 plan 的读面改动不与其冲突）

- [x] `Decision` **接线 seam 裁定**：`validatePlanFrontmatter` 挂 `readPlanStatus` frontmatter 分支（fieldErrors 进返回值、随 `planLedgerState` 透传）——plan-check/flow-loader/monitor 三个引擎消费面一次改动全覆盖；`validateRoadmapFrontmatter` 挂 roadmap-check `parseRoadmapMarkdown` 的 `hasFm` 判定点（`split.fm` 已在手，monitor `handleGetRoadmap` 经同一函数获得覆盖）。备选：各消费面自行调用校验器——否决：四处重复调用 + 未来漂移面，与 01 §5.2 单实现纪律相悖（0635-3 Phase 1 Decision 5 同款推理）。
- [x] `Decision` **读面后果矩阵**：① plan-check——fieldErrors 并入 details（`field:` 前缀标来源）→ failed → exit 1（结构错误不分 strict 档，与既有 structuralErrors 同判先例）；② flow-loader——队列成员资格仍按可解析 status 判定（liveness：字段 typo 不应使 plan 静默饿死执行队列——那是 WI42 要消灭的「静默退出」病的镜像），fieldErrors 经扫描日志 warn（kill silence 而非 kill queue）；③ monitor——plans 列表条目暴露 fieldErrors 数组（API 增量字段，前端展示不强求）。残险：field-invalid 但 status 可解析的 plan 仍会被 EXECUTE 消费——写时 deny 已由 0815-1 `plan-structure` 立项，读面沉默消除即 WI42 收口判据（roadmap 文字：「校验器零生产接线」+「第二真相通道」）。手写 `status: completed` 特例：normalized 矛盾态随 fieldErrors 暴露而不再静默——该文件本就不在任何队列（现状），拦截面在 plan-check exit 1 与 monitor 标注。
- [x] `Add` 读 seam 实现：`readPlanStatus`/`planLedgerState` frontmatter 分支调用 `validatePlanFrontmatter(fm)`，返回值增 `fieldErrors`（数组）与 `fieldsValid`（布尔）；不改变 format 分类与 rejected 语义（frontmatter 收紧模式的既有行为不变）。
- [x] `Add` plan-check 消费：`analyzeFrontmatter` 把 fieldErrors 并入 structuralErrors（`field:` 前缀）；CLI 输出与 exit 语义随之（合法语料零变化）。
- [x] `Add` roadmap-check 消费：`hasFm` 时跑 `validateRoadmapFrontmatter(split.fm)`，违规进其错误输出与非零 exit（按其现有 CLI 输出约定增量）。
- [x] `Add` monitor 暴露：plans 列表条目透传 fieldErrors（`planLedgerState` 返回值已有，纯透传）。
- [x] `Add` flow-loader warn 消费（Decision ②的交付 item）：`_scanPlansByStatus` 扫描面对 `fieldErrors` 非空的 plan 输出告警——经 `console.warn`（执行时若引擎扫描面已有更贴切的日志通道则用既有通道，成文于实现），每文件每扫描至多一次，内容含文件相对路径 + fieldErrors 摘要（kill silence 的引擎面落点；队列成员资格不变）。
- [x] `Proof` live 探针反向钉住：①手写 `status: completed` fixture → `plan-check --strict` exit 1 且 details 含 derived-status 禁写字样；②未知字段 / `verfy` typo fixture → exit 1 且指名未知键；③roadmap 缺 `audit-rounds` / 负数 fixture → roadmap-check 非 0；④存量合法语料（0635-3、0815 批次三份、00-guide 示例面、全部 frontmatter 化 corpus）plan-check 全 exit 0 + corpus 回归全绿并断言 `fieldsValid === true`（fixture 预期若翻转逐个改钉并注明理由）；⑤flow-loader warn 行为断言（fieldErrors fixture 触发、合法 fixture 零告警——console 可注入 spy）。命令：`pnpm --prefix tools/mission-driver test` + fixtures 的 CLI exit 断言（测试内 spawn 或直接函数断言）。

Exit Criteria:

- [x] 三类缺陷 fixture 全部被读面拦截（exit 1 / 非 0），reason 指向合法路径
- [x] flow-loader warn 消费落地（缺陷 fixture 告警、合法 fixture 零告警，测试断言钉住）
- [x] 存量合法语料零误杀（corpus + CLI 全 exit 0，`fieldsValid === true`）
- [x] `pnpm --prefix tools/mission-driver test` 全绿（813 基线 + 新增不回退）
- [x] `docs/logs/` 更新

## Phase 2 — verify 空数组空真封堵（WI44）

Targets: `tools/mission-driver/src/ledger-frontmatter.mjs`、`tools/mission-driver/src/ledger-sections.mjs`、`tools/mission-driver/test/`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1（读 seam 就位——校验器拒绝面先于派生防御落地，两端同 plan 收口）

- [x] `Add` 校验器拒绝空数组：`validatePlanFrontmatter` 对 `verify: []` 报 error（字面指向合法路径：verify 非空 command-key 数组，或省略字段以回落 mission 默认）。`parseFrontmatter` 解析面行为不变（`verify: []` 仍是合法格式子集——解析/校验两层分离，`test/ledger-frontmatter.test.js:50` 钉住的解析行为保持）。
- [x] `Add` 派生面空集防御：`deriveCompleted` 对 `keys` 为显式空数组改按 `no-verify-keys` 处理（`mechanicalVerification = false`，reasons 记 `no-verify-keys`）——第二道防线，覆盖未经校验器的输入路径（外部写入、旧文件、绕过读 seam 的调用方）。与 Phase 1 校验器构成防御深度：校验器拦新写入，派生防御兜底存量与旁路。
- [x] `Proof` 空真封堵回归：①`verify: []` + 回执齐全 fixture → `validatePlanFrontmatter` error 且 `deriveCompleted` completed:false（reasons 含 `no-verify-keys`）；②`verify: []` 直接进 `deriveCompleted`（不经校验器）→ 同样 completed:false（旁路防御钉住）；③`verify: []` 显式空数组 **优先于**注入的 `opts.defaultVerifyKeys`——fail-closed 不回落默认（显式空 = 拒绝语义，非缺失语义；与 0925-1 Phase 2 注入落地后的组合行为钉住，防两 plan 交互漂移）；④`verify: [test]` 正常路径回归（绿路径不受伤）；⑤解析面 `verify: []` 可解析钉住（既有用例不修改）。命令：`pnpm --prefix tools/mission-driver test`。
- [x] `Proof` 语料断言：`rg -n "^verify: \[\]\s*$" docs/plans docs/backlog missions` 生产语料零命中（列锚定——排除 prose 中的反引号提及；现状已核，收口时复跑钉住——封堵无存量破坏面）。

Exit Criteria:

- [x] 空真通道双层封堵钉住（校验器 error + 派生 no-verify-keys）
- [x] 解析/校验分层钉住（既有解析用例零修改）
- [x] 绿路径（verify: [test]）回归无伤
- [x] `pnpm --prefix tools/mission-driver test` 全绿
- [x] `docs/logs/` 更新

## Phase 3 — 文档同步与回写

Targets: `docs/backlog/age-autonomy-implementation-roadmap.md`、`docs/design/age-autonomy/01-file-ledger.md`（§4.1 verify 行）、`tools/mission-driver/CONTEXT.md`、`docs/logs/`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1/2 全绿

- [x] `Add` roadmap 回写：WI42 `[x]` + WI44 `[x]` + 各自证据指针（接线 diff、封堵 diff、测试文件、live 探针反向钉住输出）；头部 `> Last Updated` 日期同步（回写步固有动作）。WI24 不勾（M2 收口门归后续批次）。
- [x] `Add` 设计 owner-doc 同步：`docs/design/age-autonomy/01-file-ledger.md` §4.1 的 `verify` 字段行补一句空数组语义裁定（显式 `[]` = 校验器拒绝；派生面按 no-verify-keys fail-closed，不回落 mission 默认）——本 plan 把「未定义空数组语义」成文为契约，owner 字段表不得留守沉默（owner-doc drift 即本 mission 要消灭的类）。
- [x] `Add` CONTEXT.md 同步：ledger 库两段增一句「校验器经 `planLedgerState` 读 seam 接线全部生产读面；`verify: []` 被校验器拒绝且派生面按 no-verify-keys 处理」。
- [x] `Proof` 收口链：`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0；`./verify-age.sh` L1+L2 绿；`node plugin/dsh/scripts/smoke-import.mjs` 绿（assets 重建后导入面）。

Exit Criteria:

- [x] roadmap WI42/WI44 `[x]` + 证据指针 + Last Updated 同步；WI24 仍未勾
- [x] 01-file-ledger.md §4.1 `verify` 行含空数组语义裁定句
- [x] CONTEXT.md 语义句落地
- [x] `pnpm --prefix tools/mission-driver test` + `./verify-age.sh` L1+L2 + smoke-import 全绿
- [x] `docs/logs/` 收口条目

## Draft Review Record

- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0925-2-m2-wi42-wi44-validator-wiring-verify-vacuity-1-27aaadfd to ses_reviewer_6
- 2026-08-25：iteration 1，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0925-2-m2-wi42-wi44-validator-wiring-verify-vacuity-1-27aaadfd（独立评审 ses_reviewer_6：baseline 全表实证——零生产消费者、空真机理、normalized 矛盾态、读面拓扑、corpus 零命中；阻塞 1 项 = Goals/Decision 承诺 flow-loader warn 但无交付 item（_scanPlansByStatus 实测零日志通道，seam 不会自动产出）——已补 Add item + Targets + Exit + Proof⑤；非阻塞 5 项：rg 列锚定、813/语料数刷新、空数组优先于默认键的 precedence 钉住、corpus fieldsValid 断言、monitor 前端移 Non-Goals——均已修）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0925-2-m2-wi42-wi44-validator-wiring-verify-vacuity-2-96af2891 to ses_reviewer_7
- 2026-08-25：iteration 2，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0925-2-m2-wi42-wi44-validator-wiring-verify-vacuity-2-96af2891（独立复核：六项修复全部落地且 live 复验（813 全绿、锚定 rg 零命中、precedence 与现行代码一致）；剩余 1 项 = Phase 3 缺 01-file-ledger.md §4.1 verify 行的空数组语义裁定同步——owner-doc drift 正是本 mission 要消灭的类，已补 Add item + Exit 子句 + Targets）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0925-2-m2-wi42-wi44-validator-wiring-verify-vacuity-3-7e8ca4f2 to ses_reviewer_8
- 2026-08-25：iteration 3，共识 acceptable-as-is #review-2026-08-25-063133-mission-driver-2026-08-25-0925-2-m2-wi42-wi44-validator-wiring-verify-vacuity-3-7e8ca4f2（独立复核：§4.1 同步三处编辑（item/Exit/Targets）全部落地且与 Phase 2 实现语义一致；全文件格式扫描无回归——checkbox 纪律、append-only 空区、类型标注、无退役构造。可转 active）

## Verification

## Closure

## Deferred But Adjudicated

### 「invalid plan 不得进执行队列」的成员资格执法

- Classification: `watch-only residual`
- Why Not Blocking Closure: 队列成员资格按可解析 status 判定是 liveness 裁定（防静默饿死）；资格执法属写时 deny 面（0815-1 `plan-structure`）与守夜人路由（M3）的演进面，非 WI42 字面（读面接线 + 消灭静默）
- Successor Required: yes（0815-1 执行期如发现读面拦截不足再评估；重开条件 = field-invalid plan 进入执行造成实际损伤的案例出现）
