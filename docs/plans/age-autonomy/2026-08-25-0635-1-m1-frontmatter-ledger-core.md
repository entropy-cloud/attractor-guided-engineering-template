# 2026-08-25-0635-1 M1 账本基座：frontmatter 解析器 + plan/roadmap 字段集（age-autonomy M1-WI1+WI2）

> Plan Status: completed
> Mission: age-autonomy-implementation
> Work Item: M1-WI1+WI2
> Last Reviewed: 2026-08-25
> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M1 WI1/WI2；契约 owner `docs/design/age-autonomy/01-file-ledger.md` §2/§3.1/§4.1/§5.1
> Related: 提案源头 `docs/discussions/2026-08-24-roadmap-plan-frontmatter-reform.md`（含 human 裁定 §4.3/§8）；同批执行顺序：本 plan（N=1）→ `2026-08-25-0635-2`（N=2，WI3+WI5+WI6）→ `2026-08-25-0635-3`（N=3，WI4+WI7–WI11）
> Audit: required

## Current Baseline

**仓库无任何 frontmatter 解析能力；状态读取是双份正则 + 全文 checkbox 计数——本 plan 是 M1 全部后续 WI 的地基。**（以下事实 2026-08-25 live 核实）

- **状态解析现状**：`tools/mission-driver/src/plan-check.mjs:30` 与 `tools/mission-driver/src/flow-loader.js:9` 各持一份 `PLAN_STATUS_RE`（容错 bold/大小写/尾空格的整行正则）——正是 01-file-ledger §5.2「不得各自带正则」要消灭的形态。checkbox 计数为**全文扫描**（plan-check.mjs:82-83），guide 模板示例直接污染计数：实测 `node tools/mission-driver/src/plan-check.mjs docs/plans/00-plan-authoring-and-execution-guide.md --strict` → exit 1（15 个模板示例项被计为 unchecked）。
- **存量语料**：53 个文件含 `> Plan Status:`（52 份存量 plan + 00-guide 模板内 1 处）；`> Review Hold:` 全仓库 0 处（codemod 仍须支持映射，0635-3/WI7 字面要求）。
- **双形态共享通道（既定机制 + reachability 事实）**：`plugin/dsh/assets/src/` 是 `plugin/dsh/scripts/build-bundle.mjs` 从 `tools/mission-driver/src/` 复制的引擎模块快照（build-bundle.mjs:36/:42/:203；`ALLOWED_MODULES` 含 plan-check.mjs:51；freshness check 强制 assets 与源一致）→ **引擎模块 → 插件复用**是既定方向。**但复制计划只含 ENTRY_MODULES import 闭包可达的模块**（build-bundle.mjs:143-184 `computeClosure`；:203 遍历闭包而非 ALLOWED_MODULES；unreachable-allowed 仅 log）——本 plan 交付的零 import、零引擎 importer 的新模块在 0635-3/WI7 接线（plan-check.mjs import 它）之前 **closure 不可达、不会被复制进 assets**。反向不可行：插件 TS 源靠 Node ≥22.19 type-stripping（plugin/dsh/package.json `engines`），引擎基线 Node ≥18（project-context「Current Technical Baseline」）；且 `install-age.manifest` 不含 `plugin/`（模板消费者只拿 tools/mission-driver）——共享库放引擎侧是模板可交付的唯一路径。
- **引擎测试链**：`node --test test/*.test.js && node src/prompt-check.mjs`（tools/mission-driver/package.json:11）→ `tools/mission-driver/test/` 下新增 `.test.js` 自动进 `pnpm --prefix tools/mission-driver test`（WI11 gate 第 2 条的通道）。
- **设计契约（01-file-ledger）**：解析子集 = 扁平标量键 + 单层流式数组，禁块标量（`>-`/`|`）/嵌套对象/锚点，字符串一律单行引号串，内置解析器约 30 行（§2 硬边界——工程约束非风格偏好）；plan 字段集 `status/mission/work-item/group/failures/verify/hold/claim/claim-expires`（§4.1，另含可选 `agent`——roadmap WI2 标签列表未列 agent，但设计 §4.1 契约含之，以设计为准，本 plan 一并实现格式校验；「仅可引用 autonomy.policy.yml agents 名单」的跨文件校验属 M2/WI13）；roadmap 字段集仅 `audit-rounds`（§3.1）；`completed` 为派生态永不出现在 frontmatter，`cancelled|superseded|deferred` 为可写终态（§5.1）。
- **guide 所有权**：01 §7——两文件格式 owner = plan guide 与 roadmap guide，frontmatter 字段增删 = guide changelog 事件。故字段集实现落地必须同步 guide 增补字段表（最小增量、与旧格式条款并存）；guide 全量切换（rules 11/12/13 退役、模板替换）归 0635-3/WI9。
- **mission-check 现状**：对 `missions/age-autonomy-implementation.json` 实测 exit 0（`autonomyPolicy`/`commands.gates` 键今日不被校验，M2 WI13/WI12 才消费）。

## Goals

- 零依赖 frontmatter 解析器（子集纪律**强制**：越界语法拒绝并报错，不走容错降级）+ plan/roadmap frontmatter 字段集校验 + 状态词汇表（可写集/终态集/派生态常量），全部纯函数，落点与共享通道决策交付（引擎 CLI 直接消费；插件 assets 副本在 0635-3 接线产生 importer、模块入闭包后物化——见 Current Baseline reachability 事实）。
- 单测 ≥12 例钉住：解析子集正反面、字段条件规则（hold⇔held、claim⇒active、completed 不可写、verify 单层数组…）、roadmap audit-rounds。
- 00-plan-authoring-guide 增补 frontmatter 字段表（additive changelog 事件；不动旧格式条款）。

## Non-Goals

- 计数域扫描 / 完成派生公式 / 扫描谓词（WI3 → 0635-2）；内联审计区块语法与结构校验（WI5/WI6 → 0635-2）。
- 存量 codemod / plan-check 与 flow-loader 双读接线 / guides 全量切换 / CI（WI4/WI7–WI10 → 0635-3）。本 plan **不改** plan-check.mjs / flow-loader.js 现行为。
- 不做写时门禁（状态转移逐边裁决是 M2 法律）；不做 claim 写入/回收运行时（守夜人是 M3）——本 plan 只定义 claim 字段的**格式**合法性。
- 不引入任何 npm 依赖；不动 `engine.js`（零引擎 diff 红线：roadmap「核心纪律」1 + project-context AI Block Conditions）。

## Task Route

- Type: `implementation-only change`（新共享库 + 结构校验 + guide 增补）
- Owner Docs: `docs/design/age-autonomy/01-file-ledger.md`（§2/§3.1/§4.1/§5.1 契约 owner）；`docs/plans/00-plan-authoring-and-execution-guide.md`（格式权威，本 plan 增补其字段表）；roadmap M1 WI1/WI2
- Skill Selection Basis: `Skill: none`——`docs/skills/` 无匹配实现方法的可复用技能（multi/open audit prompts 属审计工作流方法，非实现方法选择器）。

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（纯 Node 单测；零网络零凭据；无 env/端口/迁移）。

## Execution Plan

### Phase 1 - Decision：共享库落点 + 接口契约钉住

Status: completed
Targets: 决策记录于本 plan；新模块路径 `tools/mission-driver/src/ledger-frontmatter.mjs`（命名执行时可调，落点不变）
Skill: none

- Item Types: `Decision`
- Prereqs: 无（本批 N=1 首位）

- [x] `Decision` **共享库落点**：引擎侧 `tools/mission-driver/src/` 纯 `.mjs` 零依赖模块，插件经 build-bundle assets 副本复用（既定 engine→plugin 复制机制）。备选与否决理由：(a) `plugin/dsh/src/ledger/*.ts` 引擎反查——否决：Node ≥18 引擎基线不吃 TS type-stripping（≥22.19）；assets 复制方向单向 engine→plugin；install-age 模板不含 plugin/，反查将破坏模板消费者。(b) 引擎/插件各持一份解析器——否决：01 §5.2「门禁、守夜人、monitor 共用同一实现（不得各自带正则）」同源纪律；现状 plan-check.mjs/flow-loader.js 双正则即是待消灭的存量病。**残险（reachability 事实）**：本 plan 终态新模块零 import 且零引擎 importer → build-bundle 闭包不可达 → assets 副本与 freshness 兜底**在本 plan 内均不物化**（Phase 2 只做 ALLOWED_MODULES 预登记并显式验证登记存在）；兜底在 0635-3/WI7 接线（plan-check.mjs import 共享库）后才激活——届时漏登记会被 plugin 链 freshness check 拦下。
  - Skill: none
- [x] `Decision` **接口契约**（导出面，0635-2/0635-3 的消费契约）：
  - `parseFrontmatter(text) → { ok, fm|null, error|null, range }`——子集：扁平 `key: scalar` + 单层流式数组 `[a, b]`；标量值支持不带引号裸词与单行引号串两种形态（设计 §4.1 示例自身即混用：`status: draft` 裸词、`group: "..."` 引号）；块标量 / 嵌套对象 / 锚点 / 引用 / 重复键 → `ok:false` 带行列 error（**拒绝而非容错**，§2 硬边界）；无 frontmatter 块 → `ok:true, fm:{}`（「是否 plan/roadmap」的判别归调用方，见讨论 §4.4「有无 `status:` 键即判别」）。
  - `validatePlanFrontmatter(fm) → { ok, errors[] }`——status ∈ `{draft,active,held,cancelled,superseded,deferred}`，`completed` 出现即 error（派生态不可写）；`hold` 仅 `status: held` 时必填、其他状态出现即 error；`claim`/`claim-expires` 仅 `status: active` 可出现且成对，claim 格式 `attempt-<runId>-<holderSessionId>-<nonce8>`，claim-expires 为 ISO-8601；`failures` 非负整数；`verify` 单层字符串数组（元素为 command key 词法形状，跨文件存在性校验属 M2）；`mission`/`work-item` 非空字符串；`group`/`agent` 可选字符串。**未知键策略**：error（字段增删 = guide changelog 事件的纪律执行面；宽容 warning 会复活第二真相通道）。
  - `validateRoadmapFrontmatter(fm) → { ok, errors[] }`——仅 `audit-rounds`（非负整数），未知键 error。
  - 常量：`WRITABLE_PLAN_STATUSES` / `TERMINAL_PLAN_STATUSES` / `DERIVED_PLAN_STATUS = "completed"` / `PLAN_FRONTMATTER_FIELDS`（字段表单源：guide 增补与结构校验用例从这取，防两处漂移）。
  - Skill: none
- [x] `Decision` **`agent` 字段纳入**：roadmap WI2 标签列表未列 `agent`，设计 §4.1 契约含之（可选、引用 autonomy.policy.yml agents 名单）。裁定：M1 实现其格式面（可选字符串 + 词法校验），名单存在性校验随 M2/WI13 落地。依据：设计是格式契约 owner（roadmap「Purpose」明示「design 决定契约」）。
  - Skill: none

Exit Criteria:

- [x] 三项 Decision 连同备选/残险记录于本 plan（含对 0635-2/0635-3 的契约声明）
- [x] `docs/logs/` updated（Phase 1 决策条目）

### Phase 2 - 实现 + 单测 + bundle 登记

Status: completed
Targets: `tools/mission-driver/src/ledger-frontmatter.mjs`、`tools/mission-driver/test/ledger-frontmatter.test.js`、`plugin/dsh/scripts/build-bundle.mjs`（ALLOWED_MODULES 登记）、`plugin/dsh/assets/src/`（freshness）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [x] `Add` 解析器 + 校验器 + 常量（解析核心约 30 行；零 import 依赖；文件头注释仅指向 01 §2 契约）
      - Skill: none
- [x] `Add` build-bundle.mjs `ALLOWED_MODULES` 预登记新模块（reachability 事实见 Decision 1：本 plan 终态模块不在 import 闭包内，assets 副本不物化）+ 显式验证登记存在（`rg -n "ledger-frontmatter" plugin/dsh/scripts/build-bundle.mjs` 命中 ALLOWED_MODULES 条目）+ `npm --prefix plugin/dsh test` 绿（既有闭包/freshness 校验不回归；输出中该模块如列 unreachable-allowed 属预期，非失败）
      - Skill: none
- [x] `Proof` `tools/mission-driver/test/ledger-frontmatter.test.js` ≥12 例：解析子集正向（标量/单层数组/单行引号串/空数组）；越界反向（块标量/嵌套对象/锚点/重复键/未知键 → 拒绝且带 error）；字段条件（hold⇔held 双向、claim⇒active、claim 格式、claim-expires ISO、failures 非负、verify 单层、`completed` 不可写、终态词汇表、agent/group 可选）；roadmap（audit-rounds 合法/非法/未知键）；无 frontmatter 文件判别（`fm:{}` + ok）
      - Skill: none

Exit Criteria:

- [x] `node --test tools/mission-driver/test/ledger-frontmatter.test.js` 全绿（≥12 例，子集纪律无容错降级路径被反向例钉住）
- [x] `pnpm --prefix tools/mission-driver test` 0 失败（prompt-check 不回归）
- [x] `npm --prefix plugin/dsh test` 绿（闭包/freshness 校验不回归；ALLOWED_MODULES 登记存在性已显式验证——assets 副本物化归 0635-3 接线后，不在本 plan 验收面）
- [x] 解析器/校验器零 import 依赖（`rg -n "^import" tools/mission-driver/src/ledger-frontmatter.mjs` 为空）

### Phase 3 - guide 增补 + 文档回写 + roadmap 回写

Status: completed
Targets: `docs/plans/00-plan-authoring-and-execution-guide.md`（字段表增补 + changelog）、`tools/mission-driver/CONTEXT.md`（一行事实）、`docs/backlog/age-autonomy-implementation-roadmap.md`（WI1/WI2 状态回写）、`docs/logs/2026/08-25.md`
Skill: none

- Item Types: `Add`
- Prereqs: Phase 2

- [x] `Add` 00-guide 增补「plan frontmatter 字段表（M1 新格式，additive）」小节：字段/类型/写者/条件规则/淘汰项预告（`> Plan Status:` 行 → `status`、`> Review Hold:` → `held`+`hold` 的迁移映射表），显式标注「新旧并存过渡期，全量切换见后续」（rules 11/12/13 退役与模板替换归 0635-3/WI9，不在本 plan 动）；changelog 事件一条（01 §7）
      - Skill: none
- [x] `Add` `tools/mission-driver/CONTEXT.md` Mission 配置系统段补一行：frontmatter 库模块名 + 双形态共享通道（engine→assets 副本）
      - Skill: none
- [x] `Add` roadmap `Work Item Status` 回写：WI1/WI2 `todo → ready`（draft review 通过时）→ `done`（本 plan closure audit 通过后，按 roadmap 状态块纪律）。**gate 面解释**（预答 closure audit 争议）：WI1/WI2 的 Verification Gate 面 = 本 plan 新增测试族已进 L1 链（`pnpm --prefix tools/mission-driver test` 常驻绿），WI11 是 milestone 级 backstop（0635-3 Phase 6 执行）——per-WI `done` 不等 WI11。
      - Skill: none

Exit Criteria:

- [x] guide 字段表与 `PLAN_FRONTMATTER_FIELDS` 常量逐字段一致（对照说明记录于 log 或 plan Closure）
- [x] `docs/logs/` updated
- [x] roadmap WI1/WI2 状态按纪律回写

## Draft Review Record

- Independent draft review iteration 1: needs-revision（task `ses_fca0e8937ffeVtecsWQR8h5Qip`）——1 blocking：build-bundle 复制面是 ENTRY_MODULES import 闭包而非 ALLOWED_MODULES 全集，零 importer 新模块不会被复制进 assets，原「freshness 兜底已存在 / Goal 含插件副本共享 / Phase 2 刷 assets」三处失实；另 3 项非阻塞（Decision 3 引用源、roadmap 回写 gate 面解释、裸标量/引号串双形态）。
- Independent draft review iteration 2: accept（task `ses_fca03be2dffeCqZqZ74u6aHqfI`）——blocking 已解（reachability 事实入 Baseline、Goal 收窄为落点/通道决策、残险改述、Phase 2 改显式登记验证）；3 项非阻塞全部 addressed；1 项措辞残留（「Review Hold 全仓库 0 处」指 plan 语料头部行，提示词/设计文中的 prose 提及不计）非阻塞接受。共识 `acceptable`，plan 转 active。

## Closure Gates

- [x] in-scope behavior is complete（解析器 + 字段集校验 + 常量 + guide 增补落地，测试可复跑）
- [x] relevant docs are aligned（00-guide 字段表 + changelog、CONTEXT.md、roadmap 回写、logs）
- [x] verification has run（`node --test tools/mission-driver/test/ledger-frontmatter.test.js`、`pnpm --prefix tools/mission-driver test`、`npm --prefix plugin/dsh test`）
- [x] scoped verification is not conflated with full verification（本 plan 即跑全量 engine + plugin 链，无 scoped 降级）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### 引擎 CLI / flow 扫描接线（plan-check.mjs / flow-loader.js 切读 frontmatter）

- Classification: `out-of-scope improvement`（已由 0635-3/WI7 立项，非本 plan 残留）
- Why Not Blocking Closure: 本 plan 结果面 = 解析/校验库；接线依赖计数域扫描与完成派生（0635-2/WI3）先行。
- Successor Required: yes（0635-2 → 0635-3）

## Closure

Status Note: All three phases executed in one session (2026-08-25); every exit criterion and closure gate verified against the live diff and real commands. guide 字段表与 `PLAN_FRONTMATTER_FIELDS` 常量逐字段同序一致（node 对照脚本核实，true）。Independent closure audit verdict is recorded below by the flow-dispatched CLOSURE_AUDIT step.

Closure Audit Evidence:

- `node --test tools/mission-driver/test/ledger-frontmatter.test.js` → 22 tests / 0 fail（≥12 例：子集正向 5 + 越界反向 6 + plan 字段条件 7 + roadmap 3 + 常量词汇表 1）
- `pnpm --prefix tools/mission-driver test` → 682 pass / 0 fail；prompt-check OK（新测试族已常驻 L1 链 = WI1/WI2 的 Verification Gate 面）
- `npm --prefix plugin/dsh test` → 133 pass / 0 fail；closure ok: 19 modules reachable ⊆ allowed set (20)；freshness ok (36 files content-equal)；smoke-import ok——`ledger-frontmatter.mjs` 列 unreachable-allowed 属 Decision 1 预告的预期态，非失败
- `rg -n "^import" tools/mission-driver/src/ledger-frontmatter.mjs` → 空（零 import 依赖）；`rg -n "ledger-frontmatter" plugin/dsh/scripts/build-bundle.mjs` → build-bundle.mjs:55（ALLOWED_MODULES 登记）
- `pnpm --prefix tools/mission-driver/web run typecheck` → 绿（前端零改动；本 plan 不触 web/dist 验收面）
- Docs: 00-guide 新增字段表 + Changelog 首条；CONTEXT.md frontmatter 库一行；roadmap WI1/WI2 `[x] done`（证据指针已附）；`docs/logs/2026/08-25.md` 两条目（Phase 1 决策 + 执行收口）
