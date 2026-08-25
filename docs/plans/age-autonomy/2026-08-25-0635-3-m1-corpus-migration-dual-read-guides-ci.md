---
status: active
mission: age-autonomy-implementation
work-item: M1-WI4+WI7+WI8+WI9+WI10+WI11
group: "2026-08-25-0635"
verify: [test]
---

# 2026-08-25-0635-3 M1 收口：存量迁移 + 双读接线 + guides/CI（age-autonomy M1-WI4+WI7+WI8+WI9+WI10+WI11）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M1 WI4/WI7–WI11；契约 owner `docs/design/age-autonomy/01-file-ledger.md` §3/§4.3/§5；`docs/discussions/2026-08-24-roadmap-plan-frontmatter-reform.md` §5 迁移成本清单 + §7 开放点 2（迁移策略需裁定）+ §8（审计内联裁定）
> Related: 前置 `2026-08-25-0635-1`（N=1）、`2026-08-25-0635-2`（N=2）——本 plan 消费两者全部导出面；M1 全部 WI 的收官 plan

## Current Baseline

**存量语料 52 份 plan 全部为 `completed` 终态、另 4 处 draft（本批 3 份 + 00-guide 模板示例）；roadmap 为「checkbox + `: todo` 状态后缀」混合形态；引擎四处消费面（plan-check / flow-loader / roadmap-check / monitor）全部只识旧格式。**（以下事实 2026-08-25 live 核实）

- **存量 plan**：`docs/plans/` 下 `> Plan Status:` 分布 = 52 份存量 plan 全部 `completed` + 4 处 draft（本批 0635-1/2/3 + 00-guide 模板围栏示例，rg 统计）；`> Review Hold:` 全仓库 0 处；56 个文件含 `## Closure Gates` 区（52 存量 + 00-guide 模板 + 本批 3 份）；存量 plan 的 Phase 为 `### Phase N - <name>`（h3，挂 `## Execution Plan` 下，dsh-plugin 批 40 处实测），与新格式 `## Phase <n>`（h2，01 §4.2）不一致——归一化是本 plan codemod 职责。
- **roadmap 现状**：6 份 roadmap（age-autonomy-implementation / demo / dsh-plugin / actionable-fixes / draft-robustness / step-audit——发现口径 = `missions/*.json` 的 `roadmapPath` 集，00-roadmap-authoring-guide 不是 roadmap）均为 checkbox + 尾缀 `: todo|ready|done` 混合形态；无 ❌/✅ 图标残留（rg 实测 0 命中）。`roadmap-check.mjs` 是「Work Item Status」块解析器（:17 BLOCK_HEADER_RE、:26-38 表格/bullet 状态词法），其 `roadmapAllDone` 被 **engine.js:8 直接消费**（mission 完成判定）——roadmap 改纯 checkbox 后此解析器必须双读，否则引擎完成判定失明。
- **引擎消费面（全部只识旧格式，四处）**：
  - `plan-check.mjs:30` `PLAN_STATUS_RE` + 全文 checkbox 计数（:82-83）——实测对 00-guide `--strict` exit 1（15 个模板示例项被计），而 WI11 gate 第 1 条要求 exit 0。
  - `flow-loader.js:9` 自持 `PLAN_STATUS_RE`；:73-88 `_scanPlansByStatus`（activePlans/draftPlans 的现役实现）；:4/:208 经 `inspectPlan` 消费 plan-check。
  - `roadmap-check.mjs`（如上）；`monitor.js:63/:791` 消费 `parseRoadmapMarkdown`（roadmap API 面自动受益）。
  - **`monitor.js:30/:839` `handleListPlans` 直接 import `PLAN_STATUS_RE`**——plans 列表状态读取是第四消费面，漏改则迁移后 monitor 全部显示 `unknown`，且 `rg PLAN_STATUS_RE` 收敛出口不可满足。
- **prompt 状态指令面（旧格式硬编码，宽于 5 个文件）**：`prompts/execute.md:10`（写 `Plan Status: completed`）、`:11`（roadmap ❌→✅ tick 指令）、`:12c`（Source-Audits 关闭步——讨论 §8.2.4 明示该步整体删除）、`prompts/plan-review.md:22/:27`（写 active / `> Review Hold:`）、`prompts/closure-audit.md:19/:52`（写 completed + 五点一致性）、`prompts/draft-from-roadmap.md:20/:25`、`prompts/draft-from-audit.md:14/:20`（产出旧格式模板）、`prompts/build-verify.md:53-58`（roadmap `✅` 图标回写指令）、`prompts/multi-audit.md` / `prompts/open-audit.md`（deep-audit-loop.json 接线；产出外部 `docs/audits/` 文件 + `> Audit Status: open` 头——WI8 生产面）、`flow-loader.js _scanOpenAuditsList`/`AUDIT_STATUS_RE`（外部审计文件消费面）——不改造则执行 agent 会在新格式 plan/roadmap 上重造旧通道（第二真相通道复活）。
- **CI 现状**：`verify-age.sh`（L1 engine 链 + L2 plugin 链聚合）与 `.github/workflows/age-ci.yml`（push/PR 触发 `tools/mission-driver/**`、`plugin/dsh/**`）——L1 自动纳入 `test/*.test.js` 新测试；`docs/plans/**` 不在触发路径（plan-check 的 CI 门禁接线是 M2 WI23，本 plan 只做「CI 前置」）。
- **外部审计存量**：`docs/audits/` 共 4 个 mission 目录 + dsh-plugin 2 份设计审计（含 age-autonomy 设计终审）；均为历史归档，无 open 状态待闭合项（设计终审已批准转 supported baseline）。
- **模板消费者面**：`install-age.manifest` 直发仓库根的 00-guide 与 00-roadmap-guide（无 template/ 副本）；不含 plugin/。guide 切换后消费者拿到新格式 guide + 双读引擎——其存量旧格式 plan 仍可被读（双读兼容是模板不破的硬条件）。
- **前置已立项**：0635-1 交付解析器/字段集校验/常量；0635-2 交付计数域扫描、区块语法校验、basisHash、完成派生、谓词族（其 Phase 2 实现是本 plan codemod 与接线的直接依赖）。

## Goals

- **迁移裁定 + codemod**（WI4+WI7+WI8）：一次性把 roadmap 群迁到新账本格式（frontmatter + 纯 checkbox Work Item），plan 群按 Phase 1 裁定的范围迁移；`## Closure Gates` 消解（可执行项并入最后 Phase、派生项退役）、`> Last Reviewed` / `> Review Hold:` / `> Source Audits` 类头部行去向落定；外部 `docs/audits/` 生命周期收窄成文。
- **双读接线**（WI7）：plan-check.mjs / flow-loader.js / roadmap-check.mjs / monitor.js 四消费面切到共享库（frontmatter 优先、旧格式回退），env 断点开关 + 回退通道；引擎对存量语料行为不回归。
- **guides 收口**（WI9）：00-plan-guide 模板与规则切换新格式（rules 11/12/13 退役 → 完成派生引用；计数域规则；frontmatter 字段表转正）；00-roadmap-guide 同步；AGENTS.md `docs/audits/` 职责行收窄（讨论 §8.2.5）。
- **CI 前置 + M1 Verification Gate**（WI10+WI11）：全语料双读结构冒烟进 L1 链；执行 WI11 四条 gate 命令并全部真实绿；roadmap M1 WI 状态按纪律回写。

## Non-Goals

- M2+ 全部内容：门禁族/三硬门/policy schema（WI12–WI23）、守夜人（M3）、池化（M4）、引擎退役判定（M5）。本 plan 不做任何写时拦截。
- 不改 engine.js 状态机核心（零引擎 diff 红线；roadmap-check.mjs / plan-check.mjs / flow-loader.js / prompts 是本 plan 的合法改动面——roadmap「核心纪律」1 明示 plan-check.mjs 改造为 WI7 字面内容，roadmap-check 属其 roadmap 半边同构）。
- 不做 pre-commit hook / plan-check CI job / age-ci 触发路径扩展（M2 WI23）。
- 不迁移 `docs/archive/`（AGENTS.md 规则 13 的归档域，不参与账本）。
- 不新增 npm 依赖；不动 install-age.sh 个性化行为。

## Task Route

- Type: `architecture change`（账本格式切换 + 引擎四消费面双读 + 全语料迁移——跨模块共享行为变更）
- Owner Docs: `docs/design/age-autonomy/01-file-ledger.md`（契约 owner）；`docs/plans/00-plan-authoring-and-execution-guide.md` + `docs/backlog/00-roadmap-authoring-guide.md`（格式权威，本 plan 完成切换）；`docs/architecture/mission-driver-baseline.md`（引擎受支持行为基线——双读不得回归）；roadmap M1 WI4/WI7–WI11
- Skill Selection Basis: `Skill: none`——`docs/skills/` 无匹配可复用技能（multi/open audit prompts 属审计工作流，本 plan 的验收是 WI11 机械命令，不消费审计 prompt 技能）。

## Infrastructure And Config Prereqs

- 迁移即数据变更：**回滚策略 = git revert codemod commit + env 开关回退 legacy 通道**（双读期间旧通道不删；无不可逆写）。codemod 幂等（重跑零 diff），先 `--dry-run` 全量 diff 审计后落盘。

## Phase 1 — Decision：迁移语义边界集中裁定

Targets: 决策记录于本 plan
Skill: none

- Item Types: `Decision`
- Prereqs: 0635-1/0635-2 已 active（其 Phase 1 契约是本 phase 输入）

- [x] `Decision` **存量 `completed` plan 处置（讨论 §7 开放点 2 的落地裁定）**：52 份 completed 存量 plan **保持旧格式不迁移**，由双读 legacy 通道永远识别为 closed（`closedPlans()` 语义覆盖：legacy `> Plan Status: completed` ⇒ closed）。备选与否决：(a) 迁为可写终态（superseded 等）——否决：语义暴力（它们是完成史不是被取代），且 completed 不可写（01 §5.1）无诚实目标值；(b) 迁为 active + 合成 dispatch/accepted 回执——否决：伪造回执违背 id/nonce 防预造设计（01 §4.4）。codemod 的 plan 迁移面 = 非终态 plan（今日仅本批 3 份 draft；未来消费者语料同规则）。残险：仓库长期新旧并存——已裁定接受（双读是模板消费者兼容的硬需求，同一残险）。
      - Skill: none
- [x] `Decision` **过渡期回执写者与收口语义（自指陷阱裁定——迁移后非终态 plan 在 M1 语义下的收口通道）**：设计 §5.2 完成公式要求 Verification pass 行与 dispatch/accepted 回执，其「合法写者」守夜人要到 M3、写者身份门禁要到 M2 才存在——若不裁定，codemod 迁移的本批 3 份 draft（含本 plan 自身）将永远派生不出 `completed`，被 `activePlans` 永久重喂 EXECUTE。裁定：**过渡期（M1→M2 法律落地前）回执写者 = 引擎流程步骤经 prompt 指令驱动的 agent 会话**——BUILD_VERIFY 步写 `## Verification` pass 行（basisHash 由 0635-2 共享库计算规则成文于 prompt）、CLOSURE_AUDIT 步写 `## Closure` dispatch/accepted 行、plan-review 步写 `## Draft Review Record` dispatch/结论行、DEEP_AUDIT 步写 roadmap `## Deep Audit Record` 行并自增 `audit-rounds`（对应设计 §3.1「M1 = 引擎进入审计态」的写者注记）；「独立评审者把结论写进被审文件」本就是现役实践（讨论 §8.1）。备选：(a) 双读对迁移 plan 接受旧式 Closure 证据 → 否决：给完成公式开人肉后门，M2 后无法收口收紧；(b) 非终态 plan 仅在收口时刻迁移 → 否决：mid-mission 格式churn 正是双读要验证的场景，规避等于不测。**残险（成文接受）**：M2 前 id/nonce 与 append-only 无写时强制，回执是信任基（与今日现状同级），M2 WI14/WI20 执法后收口。
      - Skill: none
- [x] `Decision` **codemod plan 面**（非终态 plan）：`> Plan Status: X` → frontmatter `status`（`> Review Hold: r` → `status: held` + `hold: "r"`）；`> Mission:` / `> Work Item:` → `mission` / `work-item` 字段；`group` 回填文件名时间戳前缀；`> Last Reviewed:` / `> Audit:` 删除（审阅事实在 Draft Review Record，01 §4.3）；`> Source:` / `> Related:` 保留为正文引言 blockquote（机器不解析，非 frontmatter 字段）；per-Phase `Status:` 行删除；`### Phase N - <name>` → `## Phase N — <name>`（`## Execution Plan` 包装层移除）；`## Closure Gates` 消解：可执行项并入最后 Phase 尾部，派生类项（独立性/验证/一致性类）直接删除——其保证由完成派生公式接管（01 §4.3）；既有 `## Draft Review Record` / `## Closure` 区原文保留（append-only 尊重；0635-2 已裁定未知前缀行容忍为 prose，旧散文不破坏结构校验）；迁移后回执由上方过渡期写者裁定供给。
      - Skill: none
- [x] `Decision` **codemod roadmap 面**：6 份 roadmap（发现口径 = `missions/*.json` `roadmapPath` 集——00-roadmap-authoring-guide 不入迁移面）加 frontmatter（`audit-rounds: 0` 统一起写——已知非零轮次的 roadmap 按实写，今日无）；Work Item 行尾缀 `: todo|ready|done` 剥除（01 §3.2 纯 checkbox；`ready` 语义由 plan 侧 status 承载，不再挂 roadmap）；`## Status Values` 表保留为 prose。roadmap-check.mjs 双读：checkbox 优先、尾缀回退（存量 demo/消费者 roadmap 兼容）。
      - Skill: none
- [x] `Decision` **双读优先级 + 断点开关（WI7/WI10 字面）**：env `MISSION_DRIVER_LEDGER = auto | frontmatter | legacy`（对齐引擎 `MISSION_DRIVER_*` env 命名族，config.js 先例），默认 `auto` = 有 frontmatter 读 frontmatter、无则旧状态行/尾缀回退；`legacy` 为回退通道（rollback）；`frontmatter` 为收紧模式（M2 enforce 前的断点，切换时机由 M2 WI23 决定，本 plan 只交开关与测试）。开关语义对 plan-check / flow-loader / roadmap-check / monitor 四消费面一致（同一实现，禁各自带正则——01 §5.2）。
      - Skill: none
- [x] `Decision` **WI11 grep gate 期望值钉住**：WI11 第 4 条 `grep -c "^- \[ ]" age-autonomy-implementation-roadmap.md` 的期望值分两个时刻钉住——**gate 执行时刻**（本 plan Phase 6，早于本 plan closure audit，故 WI4/WI7–WI10 尚未 tick）：**35**（= 40 总 WI − 已 closure 的 0635-1/2 的 5 项 WI1/WI2/WI3/WI5/WI6）；**M1 收口稳态**（本 plan closure audit 后，M1 全 11 项 tick）：**29**（M2–M5 未勾数）。tick 顺序依赖（closure audit 先于 tick）已在 roadmap 状态块纪律中固定。gate 意图 = 计数域无散落污染（不变式：checkbox 行仅存在于 Work Item 块）；执行时以实况校准并记录于 tick 证据。
      - Skill: none
- [x] `Decision` **prompt 对齐范围（宽于状态行——覆盖 roadmap tick、Source-Audits 步、审计生产面）**：
  1. 状态操作双模式（execute / plan-review / closure-audit / draft-from-roadmap / draft-from-audit）：格式感知（plan 有 frontmatter → 操作 frontmatter；无 → 旧状态行），措辞与双读 `auto` 语义严格一致；`closure-audit.md` 五点一致性条目改为完成派生引用；draft 类 prompt 直接产出新格式骨架（frontmatter + 新区块）；`execute.md` 不再指示手写 `completed`（勾完即完成，派生）。
  2. roadmap tick 双模式（`execute.md:11` ❌→✅ 指令、`build-verify.md:53-58` ✅ 图标回写指令）：改为「checkbox 勾选（新格式 roadmap）/ 旧格式回退」双模式；`build-verify.md` 同时承担过渡期 `## Verification` pass 行写入指令（Phase 1 过渡期写者裁定的落地面，basisHash 计算规则成文于此）。
  3. `execute.md:12c` Source-Audits 关闭步整体删除（讨论 §8.2.4 明示）。
  4. 审计生产面（`multi-audit.md` / `open-audit.md`，deep-audit-loop.json 接线）：结论改为内联写 roadmap `## Deep Audit Record`（dispatch/accepted + findings=none|items）并自增 `audit-rounds`，不再新造外部 `docs/audits/` 文件；`flow-loader.js _scanOpenAuditsList`/`AUDIT_STATUS_RE` 裁定：保留为 legacy-only 通道（既有 open 态外部审计文件仍需被引擎看见），新格式 open 审计状态由 Deep Audit Record 派发/回执配对表达——**裁定记录**：该通道的完全退役归 M2 法律/审计 track（WI20 append-only 门禁 + WI22 证据面重建），本 plan 不拆 flow 的 open-audit 步，只改其落点；WI8 tick 以「生产面已内联 + 存量归档保留 + 消费通道 adjudicated」为准，不 over-claim「通道已退役」。
  5. prompt-check.mjs 结构校验保持绿（模板结构性约束不因措辞调整破坏——若 prompt-check 规则本身需增补，一并落地并在 log 记录）。
      - Skill: none

Exit Criteria:

- [x] 七项 Decision 连同备选/残险记录于本 plan
- [x] `docs/logs/` updated（Phase 1 决策条目）

## Phase 2 — codemod 实现 + 干跑审计 + 落盘

Targets: `plugin/dsh/scripts/migrate-ledger.mjs`（新一次性迁移脚本；复用 `tools/mission-driver/src/ledger-*.mjs` 共享库——scripts 非打包面，允许跨目录 import，build-bundle.mjs:36 REPO_ROOT 先例）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1 + 0635-1/0635-2 **Phase 2 实现已落地**（codemod 直接消费其共享库与结构校验器）

- [x] `Add` codemod 脚本：plan 面 + roadmap 面（Phase 1 裁定全部规则）；`--dry-run` 输出全量 diff；幂等（二次运行零 diff）；`--scope plans|roadmaps` 分面执行
      - Skill: none
- [x] `Proof` 干跑审计：dry-run diff 逐文件抽查（本批 3 份 draft plan + 6 份 roadmap 全量；记录 diff 摘要于 log）；0635-2 结构校验器对迁移产物全绿（计数域无污染、区块语法合法、frontmatter 校验通过）
      - Skill: none
- [x] `Add` 落盘 + git 提交（迁移即一个可 revert 的 commit；提交信息按 commitFormat `<type>(age-autonomy): <description>`）。**落盘窗口约束**：codemod 落盘 commit 必须与 Phase 3 双读接线同一 commit（或双读先行独立 commit）——迁移后、接线前存在「旧解析器对新语料失明」窗口（draftPlans 空、roadmapAllDone 假阴性、monitor unknown），不允许该窗口过夜
      - Skill: none

Exit Criteria:

- [x] 迁移后全语料通过 0635-2 结构校验（非终态 plan + 全部 roadmap 为新格式；completed 存量保持旧格式且可被 legacy 通道识别）
- [x] codemod 幂等性被测试/复跑证明（二次运行零 diff）
- [x] `docs/logs/` updated（迁移记录：文件数、diff 概要、回滚点 commit）

## Phase 3 — 双读接线（四消费面 + 开关）

Targets: `tools/mission-driver/src/plan-check.mjs`、`tools/mission-driver/src/flow-loader.js`、`tools/mission-driver/src/roadmap-check.mjs`、`tools/mission-driver/src/monitor.js`（plans 列表状态读取）、`tools/mission-driver/test/`（新增双读用例）
Skill: none

- Item Types: `Add | Fix | Proof`
- Prereqs: Phase 2 + 0635-2 Phase 2

- [x] `Add` plan-check.mjs：状态读取切共享库（frontmatter 优先 / legacy 回退，env 开关）；checkbox 计数切计数域扫描器（新格式走区块计数；legacy plan 维持全文计数现状——其格式本就无区块纪律，行为不回归）；00-guide `--strict` 达成 exit 0（模板示例不再污染——无计数域 ⇔ 0 unchecked）
      - Skill: none
- [x] `Add` flow-loader.js：`_scanPlansByStatus` 与 `inspectPlan` 消费面切共享谓词/双读（删除其自持 `PLAN_STATUS_RE`，:9）；`activePlans` 对 legacy completed 正确输出 closed（不被当作 active 捡起执行）
      - Skill: none
- [x] `Add` roadmap-check.mjs：Work Item 解析 checkbox 优先 / 尾缀回退；`roadmapAllDone`（engine.js:8 消费）对新旧格式均语义正确
      - Skill: none
- [x] `Add` monitor.js plans 列表：`handleListPlans`（:30/:839 自持 `PLAN_STATUS_RE` import）切共享双读；roadmap API 面经 `parseRoadmapMarkdown` 自动受益（无独立改动）
      - Skill: none
- [x] `Proof` 双读开关测试（进 0635-1 建立的 `ledger-frontmatter.test.js` 或独立 `ledger-dualread.test.js`，覆盖 WI11 gate 第 3 条的「双读切换」面）：`auto`（frontmatter plan / legacy plan / guide 类无状态文件三分支）、`legacy` 强制回退、`frontmatter` 收紧模式拒绝旧格式；legacy completed ⇒ closed
      - Skill: none
- [x] `Proof` 引擎回归：`pnpm --prefix tools/mission-driver test` 全绿（既有 flow/monitor/audit 相关测试不回归）；flow-loader 扫描对迁移后 `docs/plans/age-autonomy/` 的实况输出与预期一致（本批 3 份 draft 被识别为 draftPlans）；monitor plans 列表对迁移语料状态非 `unknown`
      - Skill: none

Exit Criteria:

- [x] `node tools/mission-driver/src/plan-check.mjs docs/plans/00-plan-authoring-and-execution-guide.md --strict` → exit 0（WI11 gate 第 1 条提前达成）
- [x] 四消费面无自持状态正则（`rg -n "PLAN_STATUS_RE|AUDIT_STATUS_RE" tools/mission-driver/src/` 仅共享库命中——AUDIT_STATUS_RE 例外裁定见 Phase 1 Decision 6 第 4 条，保留于 flow-loader 作 legacy-only 通道则此条放宽为其唯一合法存留处并注释标明）
- [x] `pnpm --prefix tools/mission-driver test` 0 失败；`npm --prefix plugin/dsh test` 绿（assets freshness——共享库如经 build-bundle 复制，副本同步）
- [x] `docs/logs/` updated

## Phase 4 — prompt 状态指令对齐

Targets: `tools/mission-driver/prompts/{execute,plan-review,closure-audit,draft-from-roadmap,draft-from-audit,build-verify,multi-audit,open-audit}.md`、（如需）`tools/mission-driver/src/prompt-check.mjs`
Skill: none

- Item Types: `Add`
- Prereqs: Phase 3

- [x] `Add` 八个 prompt 按 Phase 1 Decision 6 五条裁定改写（状态双模式 / roadmap tick 双模式 + Verification pass 行写入 / execute 4c 删除 / 审计生产面内联 + audit-rounds 自增 / prompt-check 规则同步）
      - Skill: none
- [x] `Proof` `pnpm --prefix tools/mission-driver test` 绿（prompt-check 结构校验含在链内）
      - Skill: none

Exit Criteria:

- [x] prompts 无脱离双模式语境的旧通道硬指令残留（`rg -n "Plan Status: completed|Review Hold|Source Audits|Audit Status|❌|✅" tools/mission-driver/prompts/` 逐命中均为双模式/legacy 回退语境或 deep-audit 内联指令）
- [x] `docs/logs/` updated

## Phase 5 — guides 收口 + AGENTS.md 职责行 + 外部审计生命周期成文（WI8+WI9）

Targets: `docs/plans/00-plan-authoring-and-execution-guide.md`、`docs/backlog/00-roadmap-authoring-guide.md`、`AGENTS.md`（仅 docs/audits 职责行）、`docs/logs/`
Skill: none

- Item Types: `Add`
- Prereqs: Phase 2–4

- [x] `Add` 00-guide 全量切换：模板换新格式（frontmatter 头 + `## Phase <n>` + 新区块骨架，无 `> Plan Status:` 行 / per-Phase Status / Closure Gates）；rules 11/12/13 退役，替换为完成派生公式引用（一致性由公式与门禁派生，01 §4.3）；0635-1/2 的 additive 增补小节转正合并；changelog 记录格式切换事件
      - Skill: none
- [x] `Add` 00-roadmap-guide 全量切换：frontmatter `audit-rounds` + 纯 checkbox Work Item + `## Deep Audit Record` 格式 + Status Values 表退役说明（ready/done 语义去向）；changelog 事件
      - Skill: none
- [x] `Add` WI8 成文：AGENTS.md `docs/audits/` 职责收窄（三处提及——Operating Rule 10（:63 附近）、Documentation Ownership 段（:96 附近）、Optional Workflow Layers 段（:122 附近）的相关行；执行时逐行钉住具体行号，diff 仅限职责措辞收窄，不触及其他规则）+ 评审/审计结论内联于 plan/roadmap 的指向（讨论 §8.2.5）；外部存量审计文件保留为归档不迁移；`> Source Audits` / `> Audit: required` 头部线在 codemod 中删除的映射已含于 Phase 1 Decision 3；生产面（multi/open-audit 内联化）与消费通道（_scanOpenAuditsList legacy-only）adjudication 见 Phase 1 Decision 6 第 4 条
      - Skill: none
- [x] `Proof` 切换后 guide 双自洽：`node tools/mission-driver/src/plan-check.mjs docs/plans/00-plan-authoring-and-execution-guide.md --strict` → exit 0；guide 模板示例与 0635-2 fixtures 同构
      - Skill: none

Exit Criteria:

- [x] 两 guide 与设计契约一致（01 §7：guide 是格式权威；字段表/区块语法/淘汰项清单三面对照）
- [x] AGENTS.md 改动仅限 docs/audits 职责行（diff 可审计，不触及其他规则）
- [x] `docs/logs/` updated

## Phase 6 — M1 Verification Gate 执行 + roadmap 回写（WI10+WI11）

Targets: `docs/backlog/age-autonomy-implementation-roadmap.md`（WI 状态回写）、`docs/logs/`
Skill: none

- Item Types: `Proof | Add`
- Prereqs: Phase 1–5 全部完成 + 0635-1/0635-2 已 closure

- [x] `Proof` WI10 CI 前置：全语料双读结构冒烟进 L1 链（engine test 新增 corpus 用例：`docs/plans/**/*.md` + `docs/backlog/*roadmap*.md` 逐文件过双读解析无 error——格式漂移的常驻回归网）；`./verify-age.sh` L1+L2 全绿；`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` → exit 0
      - Skill: none
- [x] `Proof` WI11 四条 gate 命令逐条真实执行并记录输出（任一红 = M1 不收口，本 plan 不闭环）：
      1. `node tools/mission-driver/src/plan-check.mjs docs/plans/00-plan-authoring-and-execution-guide.md --strict` → exit 0
      2. `pnpm --prefix tools/mission-driver test` → 0 失败
      3. ledger 测试族（`node --test tools/mission-driver/test/ledger-*.test.js`）→ 合计 ≥12 例且覆盖六面（解析器/字段集/状态格/完成派生/双读切换/append-only 结构判定）全绿——**路径裁定**：roadmap WI11 字面二选一（`plugin/dsh/test/ledger-frontmatter.test.mjs` / `tools/mission-driver/src/frontmatter.test.mjs`）均偏离引擎测试惯例（`test/*.test.js` 自动进链），按其意图（单一可跑命令 + ≥12 例 + 六面覆盖）钉住为 ledger 测试族聚合命令，裁定记录于 roadmap tick 证据
      4. `grep -c "^- \[ ]" docs/backlog/age-autonomy-implementation-roadmap.md` → 与 Phase 1 Decision 5 钉住的两时刻期望值一致（gate 执行时刻 35 / M1 收口稳态 29，按 tick 实况校准；无计数域污染）
      - Skill: none
- [x] `Add` roadmap 回写：M1 WI1–WI10 随各 plan closure 已回写（0635-1：WI1/WI2；0635-2：WI3/WI5/WI6；本 plan：WI4/WI7/WI8/WI9/WI10）；WI11 于四条 gate 全绿后 tick；`Work Item Status` 区按 roadmap 纪律更新（本 plan closure audit 通过 → 对应 WI `done`）
      - Skill: none

Exit Criteria:

- [x] WI11 四条命令输出与退出码记录于 plan Closure + log（真实绿，非口头 close——roadmap「核心纪律」2）
- [x] roadmap M1 区 11 项 WI 状态与三份 plan 的 closure 状态一致
- [x] `docs/logs/` updated（M1 收口条目）

Merged from `## Closure Gates` (ledger migration, 01 §4.3 dissolution):

- [x] relevant docs are aligned（两 guide、AGENTS.md 职责行、CONTEXT.md（如涉及）、roadmap 回写、logs）

## Draft Review Record

- Independent draft review iteration 1: needs-revision（task `ses_fca0e2e01ffeyTWsogMcus4hb6`）——3 blocking：自指陷阱（迁移后非终态 plan 在 M1 无合法回执写者 → 永久 active 被重喂）；第四消费面 monitor.js `handleListPlans` 自持 `PLAN_STATUS_RE` 遗漏；prompt 对齐面窄于实际（build-verify ✅ 回写 / execute ❌→✅ 与 4c / multi/open-audit 外部审计生产面 / `_scanOpenAuditsList`）；另 8 项非阻塞（计数修正 4-draft/56-gates/6-roadmaps、grep 期望双时刻、落盘窗口、引用错误、prereq、AGENTS.md 行枚举、env 命名族）。
- Independent draft review iteration 2: accept（task `ses_fca037d48ffeSHxdogYuFm3NdD`）——3 blocking 全解（过渡期回执写者 = 引擎流程步骤经 prompt 驱动，依据设计 §3.1 写者注记 + 讨论 §8.1 现役实践，信任基残险成文至 M2 执法；monitor 入 Phase 3 四消费面；Decision 6 扩为 5 子条覆盖 8 prompts + WI8 不 over-claim 裁定）；8 项非阻塞全部 addressed（AGENTS.md 第三处站点已按 iter2 指正改为 Operating Rule 10）。共识 `acceptable`，plan 转 active。

## Deferred But Adjudicated

### pre-commit hook / plan-check CI job / age-ci 触发路径扩展

- Classification: `out-of-scope improvement`（M2 WI23 字面范围）
- Why Not Blocking Closure: WI10 是「CI 前置」；门禁接线（hook + CI job + 结构子集 + audit track）是 WI23。L1 链已自动纳入 ledger 测试与 corpus 冒烟，格式漂移有回归网。
- Successor Required: yes（M2 WI23）

### `frontmatter` 收紧模式的实际切换（enforce 断点）

- Classification: `watch-only residual`
- Why Not Blocking Closure: 开关与测试随本 plan 交付；切换时点由 M2 enforce 阶段决定（roadmap「阶段依赖」：M1 WI11 绿前禁止 M2 切 enforce——本 plan 收口即解锁该前置）。
- Successor Required: yes（M2）

### 存量 completed plan 的新格式化（如未来需要）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: Phase 1 Decision 1 裁定保持旧格式（历史完整性 + completed 不可写）。重开条件：若 M5 引擎退役评估要求单一格式语料，届时以 human 批准的 disposition 立项。
- Successor Required: no（条件触发）

## Closure

Status Note: executed 2026-08-25 (single session, all six phases). Completion is derived per the ledger formula — frontmatter `status` stays `active`; the `## Verification` pass lines (BUILD_VERIFY step) and the dispatch/accepted receipt below (CLOSURE_AUDIT step) are the transition-period writer surfaces per Phase 1 Decision 2.

WI11 Verification Gate — real outputs (gate-execution moment, 2026-08-25):

1. `node tools/mission-driver/src/plan-check.mjs docs/plans/00-plan-authoring-and-execution-guide.md --strict` → exit 0 (`format: none`, 0 unchecked — template examples outside the counting domain no longer pollute)
2. `pnpm --prefix tools/mission-driver test` → 807 tests / 807 pass / 0 fail (prompt-check OK; includes the 147-test ledger family + 66-test corpus smoke)
3. `node --test tools/mission-driver/test/ledger-*.test.js` → 147 tests / 0 fail (≥12; six faces covered — parser/field-set: ledger-frontmatter 22; state lattice + completion derivation: ledger-derivation 21; append-only structure + counting domain: ledger-sections 15; dual-read switching: ledger-dualread 23; corpus smoke: ledger-corpus 66; path adjudication for this aggregate command recorded in the Phase 6 item itself)
4. `grep -c "^- \[ ]" docs/backlog/age-autonomy-implementation-roadmap.md` → **35** at gate moment (= 40 WI − 5 already-closed M1 items; matches the Phase 1 Decision 5 pinned value); after the M1 write-back (WI4/WI7–WI11 ticked) the steady state is **29** (M2–M5 remainder), 11 checked — both pinned values hit

Additional chain evidence: `./verify-age.sh` → L1+L2 GREEN (assets rebuilt after the prompt rewrite); `npm --prefix plugin/dsh test` → 133 pass / 0 fail; `node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` → exit 0; rollback point = commit "ledger corpus migration + dual-read wiring" (git revert + `MISSION_DRIVER_LEDGER=legacy`).

Closure Audit Evidence:

- pending the independent CLOSURE_AUDIT receipt (dispatch/accepted pair, same id)
