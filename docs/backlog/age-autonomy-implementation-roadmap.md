---
audit-rounds: 2
---

# AGE Autonomous Run Implementation Roadmap

> Last Updated: 2026-08-24（新建；基于 `docs/design/age-autonomy/` 设计基线（已 human 批准 2026-08-24 转 supported baseline）+ 审计记录 `docs/audits/dsh-plugin/2026-08-24-age-autonomy-design-audit.md` + 终审 `docs/audits/dsh-plugin/2026-08-24-age-autonomy-design-final-review.md`；同日 human 提议加严「自动验证」硬约束，已在每个 milestone 末位插入 Verification Gate WI）
> Source: `docs/design/age-autonomy/{00-overview,01-file-ledger,02-rule-law,03-supervisor,04-efficiency,05-usage}.md`、`docs/analysis/2026-08-24-{0003,0004}`、`docs/discussions/2026-08-24-roadmap-plan-frontmatter-reform.md`、`docs/plans/00-plan-authoring-and-execution-guide.md`、`docs/backlog/00-roadmap-authoring-guide.md`
> Owner: `docs/design/age-autonomy/`
> 关联 mission: `missions/age-autonomy-implementation.json`

## Purpose

驱动把 `docs/design/age-autonomy/` 设计基线（supported baseline，human 批准 2026-08-24）落进 mission-driver 引擎 + dsh 插件，实现 Ledger · Law · Supervisor · Efficiency 的目标形态。roadmap 决定顺序与验证门，design 决定契约，audit 决定验收，mission 决定执行上下文。

## 核心纪律

1. **零引擎 diff 为底线**（`docs/design/age-autonomy/00-overview.md` §3）：门禁与 Supervisor 全部沉淀在 `plugin/dsh/` 侧，引擎核心不被改写。受支持行为仍以 `docs/architecture/mission-driver-baseline.md` 为准。
2. **自动验证先行（Verification Gate 硬约束）**：每个 milestone 末位设 `Verification Gate` 一项（[ ]，落地后 [x]），必须为可执行的命令 + 真实断言。**Verification Gate 未勾 = milestone 未收口**——不允许 chat/口头式 close。每条 claim 必须有 grep / 命令 / 退出码与之配对。
3. **CI merge-blocking 三层**（L1 单测 → L2 双后端矩阵 → L3 真宿主 e2e 门禁），由 `.github/workflows/age-ci.yml` 与根级 `verify-age.sh` 协同保活，禁止「本地过、CI 飘」。
4. **审计回执绑定硬门**（02 §4.1）：任何状态位写回（`status` / `dispatch` / `claim` / `audit-rounds` / `failures`）必须有独立派发 + 同 id accepted 行匹配；不存在手动 close 通道。
5. **人类可读性 ≠ 验收标准**。验证命令 + 退出码 + 真实断言是唯一收口判据；plan frontmatter 字段、`> Plan Status:` 等散文格式不可作为收口条件。

## Work Item Status

> **此为唯一动态状态块。仅在此处更新状态。状态只挂在 work item，不挂在 milestone。**
> `todo` → `ready`（独立 draft review 通过）；`ready` → `done`（独立 closure audit 通过 + Verification Gate 真实绿）。

### M1 — P0 Ledger 账本改造（frontmatter 化 + 完成派生 + 审计内联）

- [x] WI1 frontmatter 解析器：30 行内置解析；扁平标量 + 单层流式数组；块标量/嵌套对象禁用（依据 01 §2）（证据：`tools/mission-driver/src/ledger-frontmatter.mjs` + `tools/mission-driver/test/ledger-frontmatter.test.js`，plan `docs/plans/age-autonomy/2026-08-25-0635-1-m1-frontmatter-ledger-core.md`）
- [x] WI2 plan frontmatter 最小集实现 + guide 同步（status/mission/work-item/group/failures/verify/hold/claim/claim-expires）（证据：同上 plan；guide 增补 `docs/plans/00-plan-authoring-and-execution-guide.md` § Plan Frontmatter Field Table）
- [x] WI3 状态格 + 完成派生公式 + 计数域 grep 共享实现（Phase + Closure Findings）（证据：`tools/mission-driver/src/ledger-sections.mjs` + `tools/mission-driver/test/ledger-derivation.test.js`，plan `docs/plans/age-autonomy/2026-08-25-0635-2-m1-ledger-sections-derivation.md`）
- [x] WI4 Closure Gates 消解（codemod；可执行项并入最后 Phase；独立性/验证/一致性由公式派生）
- [x] WI5 评审/审计内联区格式 + Draft Review / Closure Findings / Verification / Closure 示例与结构校验（证据：`tools/mission-driver/src/ledger-sections.mjs` `scanPlanLedger` + `tools/mission-driver/test/ledger-sections.test.js` + 00-guide § Plan Body Sections 示例，plan 同 WI3）
- [x] WI6 Deep Audit Record 格式 + accepted findings=none|items 机器可读（证据：`scanRoadmapLedger` Deep Audit Record 解析 + 00-roadmap-guide § Roadmap Frontmatter And Audit Record 示例，plan 同 WI3）
- [x] WI7 存量 plan / roadmap codemod + 双读过渡（plan-check.mjs 同时识别旧 `> Plan Status:` / `> Review Hold:` 与新 frontmatter，env 切换）
- [x] WI8 `> Last Reviewed` / `> Source Audits` / 外部 `docs/audits/` 跨文件生命周期消解（迁移并归一）
- [x] WI9 plan-guide/roadmap-guide 同步新格式（rules 11/12/13 退役；count 域 grep；frontmatter 字段表）
- [x] WI10 CI 前置：跑通 plan-check frontmatter 版 + mission-check + 双读断点切换开关
- [x] **WI11 Verification Gate — M1**（自动验证硬门，下列命令真实绿方可勾选；任何一条红 = M1 未收口）
  - `node tools/mission-driver/src/plan-check.mjs docs/plans/00-plan-authoring-and-execution-guide.md --strict` → exit 0（frontmatter 解析器对既有 plan guide 仍兼容）
  - `pnpm --prefix tools/mission-driver test` → 0 失败
  - `node plugin/dsh/test/ledger-frontmatter.test.mjs`（或 `node tools/mission-driver/src/frontmatter.test.mjs`，择一）→ 至少 12 用例（解析器、字段集、状态格、完成派生、双读切换、append-only）全绿
  - `grep -c "^- \[ \]" docs/backlog/age-autonomy-implementation-roadmap.md` → 与 roadmap M1 WI 总数一致（无散落示例污染计数域）

### M2 — P1 法律：门禁族 + 三硬门 + 机械验证机械化

- [ ] WI12 gate 纯函数签名 + actor + proposedContent（02 §2）+ mission 注入适配（plugin/dsh pre-execute + plan-check CLI）
- [ ] WI13 `missions/autonomy.policy.yml` schema + missionCheck + 结构测试钉住（version/limits/gates/triggers + `agents`/`dispatch` 具名派发映射与 agent 名引用校验；见 02 §3/§4.9，A7 裁定；+ mission.json 增 `autonomyPolicy` 字段与 mission-check 校验（终审 P1-5）+ fixedPrefix 块 schema `{kind: text|file|dir, ref, maxFileBytes?}`（终审 P1-3）+ trigger 谓词语法=受限 and/or/not + 谓词集，R1–R4 归属同步（终审 P2-2））
- [ ] WI14 三硬门 1：审计回执绑定（dispatch/accepted 同 id + 写者 actor 匹配；plan Closure + roadmap Deep Audit 同构；+ dispatch 行 model lineage；audit agent `requireDistinctModel` 派发时强制）
- [ ] WI15 三硬门 2：状态转移写者身份（draft→active reviewerSessionId；held→active 仅守夜人 unlock/reviewer；人工 disposition 经 `mdcontrol.unlock`/`mdcontrol.disposition`）
- [ ] WI16 三硬门 3：完成派生校验（status=active ∧ 全勾 ∧ 机械验证 ∧ 审计回执 ∧ 派发登记；整文件 proposed content；整 plan 粒度）
- [ ] WI17 nothing claim 兜底门禁：仅当 `draftPlans==0 ∧ activePlans==0` 允许 Deep Audit 触发；`audit-rounds ≥ max` 或 `findings=none ∧ roadmap 有未勾` 走终态 R1/R3
- [ ] WI18 claim 合法性门禁：plan frontmatter `claim` 内含 holderSessionId；执行者勾选需 actor.id 匹配；claim 在 active 外/awaitingClosure 前必清
- [ ] WI19 机械验证门禁：守夜人在 awaitingClosure 直跑 `commands.test/build/lint/typecheck` 写 `## Verification` pass 行（basisHash sha256）；`verify` 只能是 commands.* key
- [ ] WI20 append-only 门禁：`## Draft Review Record` / `## Verification` / `## Closure` / roadmap `## Deep Audit Record` 只追加
- [ ] WI21 路径与结构护栏（含 one-mission-one-roadmap 边界；`work-item` 命中 roadmap 已登记；终态冻结；**执法层自护 P8**：`plugin/dsh/src/law/**`、`missions/autonomy.policy.yml`、`tools/mission-driver/src/{plan-check,gate-check}.mjs` 对 AI 写 deny，人工/CI/已批准立项为合法例外）
- [ ] WI22 WI13 证据面重建（run-state 子流程不再权威；证据谓词改读 plan frontmatter/closures；plugin/dsh plan-status-gate 迁移或退役）
- [ ] WI23 CI 门禁接线：`plan-check.mjs` frontmatter 版 + pre-commit hook + CI job（结构子集 + audit track）；与现有 `verify-age.sh`/`age-ci.yml` 协同
- [ ] WI41 [P0·deep-audit R1] 修复 D2 账本收口死锁：`flows/plan-execution.json` 将 `CLOSURE_SCRIPT_CHECK.pass → BUILD_VERIFY` 且 `closureScriptCheck`（`flow-loader.js`）对账本格式回执盲视——全勾 plan 永远到不了 CLOSURE_AUDIT（`## Closure` 回执唯一写者），`deriveCompleted` 的 auditReceipt 合取永假 → plan 永驻 `activePlans()` 无限重喂（live 受害者 0635-3；`docs/bugs/2026-08-25-ledger-plan-closure-deadlock.md` D2 open 且无 roadmap 项）。修法 = closureScriptCheck 对 frontmatter plan 增加「全勾 ∧ 缺 verify pass 行 / 缺配对回执 → fail（路由 CLOSURE_AUDIT）」+ 回归测试；落点（引擎 diff vs 插件层）立项时按「零引擎 diff 底线」裁定
- [ ] WI42 [P1·deep-audit R1] 接线 `validatePlanFrontmatter`/`validateRoadmapFrontmatter` 到生产读面（M1-WI2 校验器当前零生产消费者——plan-check/flow-loader/monitor/roadmap-check/corpus 测试均不调用）：live 证实手写 `status: completed`（禁写派生态）+ 伪 basisHash 可过 `plan-check --strict` exit 0，normalized="completed" 而 completed:false/terminal:false 自相矛盾，且使 plan 静默退出 active/draft 双队列（第二真相通道，正是 01 §2 纪律所禁）；未知字段/键名 typo 同样静默通过
- [ ] WI43 [P1·deep-audit R1] 架构 owner-doc 契约同步：M1 三个公共契约模块（`ledger-frontmatter.mjs`/`ledger-sections.mjs`/`ledger-dualread.mjs`——四引擎消费面 + 插件 assets 通道 + 两 guide 声明的 machine face）未登记进 `docs/architecture/mission-driver-baseline.md` §Public Exports（该文件最后更新停在 M1 之前，违反其自身 Update Rule）；伴生漂移：`docs/architecture/dsh-plugin-packaging.md` "the 19 allowed modules"（build-bundle 实为 22）+ import-graph 枚举缺 ledger 链 + plan-status-gate 的 `PLAN_STATUS_RE` import 源已改 `assets/src/ledger-dualread.mjs`（doc 仍写 plan-check.mjs）
- [ ] WI44 [P1·deep-audit R2] 堵住 `verify: []` 空真（vacuous-pass）通道：`validatePlanFrontmatter` 接受空数组、`deriveCompleted`（ledger-sections.mjs `mechanicalVerification` 合取）对空 keys 集合 `missingKeys=[]` 直接判 true——零条 pass 行即机械验证通过，live 探针证实 `verify: []` + 回执齐全的 plan 派生 `completed:true`，agent 可静默豁免全部机械验证；设计 01 §4.1 只定义「缺失→mission 默认」未定义空数组，与 roadmap 纪律 2（Verification Gate 硬约束）意图相悖；修法 = 校验器拒绝空 `verify`（或按缺失处理走 defaultVerifyKeys/no-verify-keys）+ 空集不空真的 deriveCompleted 回归测试（现测试仅钉 `verify: []` 可解析，未钉派生语义）
- [ ] **WI24 Verification Gate — M2**（自动验证硬门，下列命令真实绿方可勾选）
  - `node plugin/dsh/src/law/check-policy.mjs missions/autonomy.policy.yml`（或 plan-check 的 `--policy` 模式）→ exit 0 且 schema 校验通过
  - `node plugin/dsh/test/law-truth-table.test.mjs` → 真值表测试至少 30 用例（覆盖三硬门全部正向/反向/边界 + actor 缺省结构子集 + 评审租约 + **law 域 deny 面** + `requireDistinctModel` 正向/反向/单模型部署显式降级 + agent 名引用校验）+ 0 失败
  - `node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/<a-plan>.md` → 实际 plan 文件三硬门全部 pass（grep 至少一个 plan 文件跑通）
  - `node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` → exit 0（policy 字段被 mission 校验通过）

### M3 — P2 守夜人：Supervisor seam + claim/乐观锁 + 连续队列

- [ ] WI25 Supervisor 拆 cordis service（plugin/dsh）或可独立运行（CLI）+ 五职责（sustain/trigger/meter/restart/receipt）
- [ ] WI26 trigger 规则：从 `missions/autonomy.policy.yml` `triggers:` 段读取并执行（plan-review/closure-audit/deep-audit/mechanical-verification/reclaim/draft-plans/nothing→deep-audit；+ 派发时按 `dispatch` 映射解析具名 agent 并应用模型/组合：DSH 形态补 native-executor 的 ModelSelection documented gap（agentProvider/agentModel/reasoningEffort），独立形态复用 config.js model/variant/agentFile 通道；plan frontmatter `agent:` 覆盖经守夜人路由；+ claim TTL 续期信号 = 活动信号（events/session 工具活动），续期是否落账本于立项时定（终审 P2-1））
- [ ] WI27 终态规则 R1–R4（clean exit / silent-completed 修复 / hold 死锁 / 停滞熔断；`partial/blocked` 显式区分；+ failures 归因桶枚举成文（executor 错误 / 测试红 / claim 到期无产出，各桶计/不计规则）与 maxFailures 默认值进 mission config（终审 P2-3））
- [ ] WI28 连续模式 opt-in：roadmap 即队列 + `mdcontrol.continuous` route + `mdcontrol.unlock` 路由 + 终态 receipt 回执
- [ ] WI29 崩溃恢复扫描：回收过期 claim、终态化残留 running、按 trigger 派发下一个（dispatch 行无结论时 resume or 重派）
- [ ] WI30 卡死检测 + 往返检测 + 停滞指纹（账本 hash + 活动信号）
- [ ] **WI31 Verification Gate — M3**（自动验证硬门，下列命令真实绿方可勾选）
  - `node plugin/dsh/test/supervisor-trigger.test.mjs` → trigger DSL 真值表至少 20 用例（含 `terminal-claim=nothing-to-draft ∧ draftPlans==0 ∧ activePlans==0` 派 deep-audit、`full-tick ∧ mechanical-verification-pass ∧ closure-receipt-missing` 派 closure-audit 等 7 条 trigger 全部覆盖）全绿
  - `node plugin/dsh/test/supervisor-recovery.test.mjs` → 崩溃恢复模拟至少 8 用例（过期 claim 回收 / dispatch 无结论 resume-or-redispatch / 停滞指纹 / 往返检测 / `partial/blocked` 显式区分）全绿
  - `pnpm --prefix plugin/dsh run verify:e2e:continuous`（如本地无 env 则 fail-fast exit ≠ 0，CI 视为 opt-in 不阻塞）→ 真实宿主下连续模式 e2e 三连跑全绿
  - `node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/<active-plan>.md --law` → 活态 plan 走通 trigger→closure 链路

### M4 — P3 效率层：池化 + prompt 组装 + 上下文画像

- [ ] WI32 agent 池（drafter:{projectRoot} / reviewer:{groupId}）+ CLOSURE_AUDIT/DEEP_AUDIT/multi-audit 禁入池（P7 原则；+ 角色互斥：同一 continuable subagent 不得同时为 drafter 与 reviewer/auditor，同 run 内 auditor session ≠ 任何执行者 session（终审 P2-5））
- [ ] WI33 PromptAssembler（FRESH/CONTINUE 双模式 + `<file path hash sha256>` 嵌入 + 目录全文 + compaction 哈希台账）
- [ ] WI34 上下文画像 `docs/references/context-profile.json`（种子化 / run 终态挖掘 / 防抖 / schema 版本化）
- [ ] WI35 独立形态降级：池化 → `--session` 续用 + 前缀纪律
- [ ] **WI36 Verification Gate — M4**（自动验证硬门，下列命令真实绿方可勾选）
  - `node plugin/dsh/test/pool-lifecycle.test.mjs` → 至少 10 用例（drafter/reviewer 池生命周期 / 空闲 TTL dispose / 代际令牌 / audit 禁入池）全绿
  - `node plugin/dsh/test/prompt-assembly.test.mjs` → 至少 12 用例（FRESH vs CONTINUE 字节序 / 缓存命中 / 目录全文 / hash 台账 / 文件变则重发）全绿
  - `node plugin/dsh/test/context-profile.test.mjs` → 至少 8 用例（种子化 / run 终态挖掘 / 防抖 / schema 版本 / 不进 `missions/`）全绿
  - （观测项，不阻断；终审 P2-4）真实宿主连续模式跑 3 个 plan，对比 FRESH vs CONTINUE 的 token 差 >20% 视为达到设计目标（机制落地即收口，收益待观测）

### M5 — P4 引擎退役判定门（可选收口）

- [ ] WI37 评估门禁 + 守夜人覆盖引擎全部职责后，列出 engine 退役判定清单（transient 分类退避、pingPong、reconcile、L2 parity 等迁移证据）
- [ ] WI38 `partial/blocked` → `EXIT_MAP` 显式增补（保护契约变更走独立立项 + 测 `exit-map.test.js`）
- [ ] WI39 docs/design + architecture owner-doc 一致性收口（关闭 §Deferred But Adjudicated 立案条目）
- [ ] **WI40 Verification Gate — M5（最终关门）**（自动验证硬门，下列命令真实绿方可勾选；任何一条红 = 整 roadmap 不收口）
  - `./verify-age.sh` → L1 + L2 全绿
  - `pnpm --prefix tools/mission-driver test` → 0 失败
  - `pnpm --prefix plugin/dsh run verify:e2e` → 真宿主 e2e（缺 env → fail-fast exit ≠ 0；CI 视为 opt-in 不阻塞）
  - `node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` → exit 0
  - `grep -c "^- \[ \]" docs/backlog/age-autonomy-implementation-roadmap.md` → 0（roadmap 全 `done` 后无未勾项；与 M1 WI11 末尾 grep 协同，但语义不同：此处检查**所有** WI 完成态 + Verification Gate 完成态）
  - `docs/audits/age-autonomy/<final-closure>.md` 收口审计通过（独立 subagent 跑通 M1–M4 全部 Verification Gate + 三硬门全 allow face 验证；`pass` 才允许整 roadmap 全 `done`）

## Status Values

| Status | Meaning | Action |
| --- | --- | --- |
| `todo` | Not started | Candidate for the next work |
| `ready` | Draft-reviewed, queued for implementation | Waiting to be implemented |
| `done` | Completed and passed closure audit | Update owner docs and logs |

## Dependencies & Notes

### 形态聚焦：DSH 插件优先

- 本 roadmap 在落地上**优先 DSH 插件形态**（`plugin/dsh/`）——`docs/design/age-autonomy/00-overview.md` §5 双形态产品中 DSH 形态有宿主原生循环、pre-execute 拦截面、native agent dispatch 三个**独有**优势，可让门禁/守夜人/池化以最低成本落地。
- **零引擎 diff 为底线**（`tools/mission-driver/src/engine.js` 状态机核心 + 零 npm 依赖约束不破）：所有新增逻辑沉淀在 `plugin/dsh/src/{ledger,law,supervisor,verify,efficiency}/` 五个子目录。
- 独立形态（CLI + `mission-driver.sh run`）的门禁通过 `tools/mission-driver/src/gate-check.mjs` CLI 复用同一纯函数（结构子集，no actor）；pre-commit hook 与 CI job 同源。

### 阶段依赖

- M1 是后续阶段的地基；M1 WI11 Verification Gate 未绿前禁止 M2 切 enforce。
- M2 的硬门（WI14–16）+ WI22 须以**零引擎 diff** 路径落地；插件层承担。
- M3 触发 trigger DSL（WI26）需要 M2 schema（WI13）钉稳；可与 M2 并行观察但 enforce 需 M2 后。
- M4 全部为插件层增强；不影响账本/法律/完成语义，可与 M3 并行观察。
- M5 是 P4 判定门；当前不必预先启动。

### 自动验证纪律

- 每个 Verification Gate WI（WI11 / WI24 / WI31 / WI36 / WI40）由**真实命令 + 真实断言**组成；不允许「视觉上完成」「chat 上完成」式收口。
- 任何 Verification Gate 红 = 整 milestone 不收口 = 整 roadmap 不收口。
- 独立 subagent 跑最终收口审计（WI40）方可标记 `done`。

### 计划与回写

- 每个 WI 触发 planning rules 时按 `docs/plans/00-plan-authoring-and-execution-guide.md` 建 plan；plan 落地后由实施者回写本文件 `Work Item Status`。
- 计划模板改动：plan guide（rule 9/12）将与 M1 WI9 同步更新；M1 落地前旧 plan 继续按现行 guide 写。

### marker 迁移纪律

- `<AI_STEP_RESULT>` / `<FLOW_VARS>` 是第二真相通道（与 `> Plan Status:` 行同病）——M1 落地后这两类 marker 在 plugin 路径**仅作诊断/日志**（correction-retry 反馈面、Reflexion postmortem 输入、monior 人类可读面），不参与 status 转移与跨步传参的裁决。
- 引擎后端保留 marker 解析作为双读过渡协议；M5（引擎退役判定门）评估物理删除时机。详见 `docs/design/age-autonomy/00-overview.md` §4「marker 溶解」。

### 与其他 mission/roadmap 的关系

- 本 mission（`age-autonomy-implementation`）是 age-autonomy 设计在仓库内的**唯一执行 mission**；不存在姊妹 mission 复刻同一份 design。
- 旧 `docs/backlog/age-autonomy-plugin-roadmap.md`（如未来再有类似产物）应视为本 roadmap 的「插件形态视角」，不应另立 mission；本路线选择后该产物应被本 roadmap 收编或弃用。

## Deep Audit Record

- dispatch audit #audit-2026-08-25-063133-mission-driver-age-autonomy-implementation-roadmap-1-38473bf4 to ses-2026-08-25-063133-deep-audit-r1
- accepted #audit-2026-08-25-063133-mission-driver-age-autonomy-implementation-roadmap-1-38473bf4 findings=items：1×P0（D2 账本收口死锁无 roadmap 项 → WI41）+ 2×P1（frontmatter 校验器零生产接线 → WI42；架构 owner-doc 契约漂移 → WI43）+ 4×P2（Follow-up Backlog）；基线 810 tests green、corpus 0 error、mission-check exit 0
- dispatch audit #audit-2026-08-25-063133-mission-driver-age-autonomy-implementation-roadmap-2-faae192a to ses-2026-08-25-063133-deep-audit-r2
- accepted #audit-2026-08-25-063133-mission-driver-age-autonomy-implementation-roadmap-2-faae192a findings=items：1×P1（`verify: []` 空数组使 mechanicalVerification 合取空真、零 pass 行即派生 completed → WI44）+ 3×P2（Follow-up Backlog）；WI41/WI42/WI43 复核仍 open 未重复立项；基线 810 tests green + prompt-check OK + mission-check exit 0 + web typecheck green

## Follow-up Backlog

  - [ ] [P2] mission config 前向引用缺失文件：`autonomyPolicy: missions/autonomy.policy.yml` 与 `commands.gates` → `tools/mission-driver/src/gate-check.mjs` 今日均 ENOENT（WI12/WI13 落地后自愈；mission-check 不校验这两字段，期间无人报错）。source: deep-audit round 1
  - [ ] [P2] roadmap 残留已退役格式段：`## Status Values` 表与 `Work Item Status` 导语中的 `ready` 生命周期散文，按 00-roadmap-authoring-guide 2026-08-25 changelog 已退役（done=勾选、ready 语义归 plan 侧）。source: deep-audit round 1
  - [ ] [P2] `scanPlanLedger`/`scanRoadmapLedger` 对重复 append-only 锚点静默容忍（只扫首个 `## Closure`/`## Verification`/`## Draft Review Record`/`## Deep Audit Record`，重复区内的回执从派生面消失且无结构 error）——建议补 duplicate-anchor 结构 error。source: deep-audit round 1
  - [ ] [P2] 引擎读面（flow-loader/monitor 的 `planLedgerState` 调用）未注入 `defaultVerifyKeys`，01 §4.1「verify 缺失时用 mission 默认」在引擎路径未实现——省略 `verify` 的 plan 即使回执齐全也派生不出 completed（与 WI41 同族，裁定归 WI19/WI41 立项）。source: deep-audit round 1
  - [ ] [P2] roadmap 头部 `> Last Updated: 2026-08-24` 过期：2026-08-25 已落地 round-1 回执、WI41–WI43 与 Follow-up Backlog 各轮编辑，头部日期未同步更新。source: deep-audit round 2
  - [ ] [P2] monitor 读 mission 配置未走 `extends` 合并（`readMissionConfig`/`handleGetRoadmap`/`handleListConfigs` 裸 JSON.parse，引擎侧 `loadMission` 走 base→local→mission 合并）——从 base.json 继承 roadmapPath/plansDir/commands 字段的 mission 在 dashboard 显示为空/缺字段且被 `/api/configs` 过滤；本仓库无实害，模板消费者面 latent。source: deep-audit round 2
  - [ ] [P2] `prompts/draft-from-roadmap.md` step 4 指示 drafting agent 自派 sub-agent 评审后自行将 plan 置 `active`，引擎 REVIEW_PLANS 步骤对这些 plan 变成空转（`draftPlans()` 为空 → forEach all_complete 直通 EXEC）——评审独立性从流程结构保证退化为 prompt 纪律，直至 M2-WI15 写者身份门禁落地（0815 批次回执实践正常，暂无实害）。source: deep-audit round 2
