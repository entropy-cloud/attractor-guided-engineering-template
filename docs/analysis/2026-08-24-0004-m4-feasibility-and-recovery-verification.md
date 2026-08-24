# M4 方案可行性独立核查报告

> Status: research note（独立核查）
> 方法：源码级对照，全部结论带 file:line 或方案条款引用；判断一律区分「源码证实」「方案推断」「我的推理」三类标记。
> Date: 2026-08-24
> 核查对象：`docs/analysis/2026-08-24-0003-ai-automation-interaction-essential-design.md`（M4：Ledger·Law·Supervisor 三件套，§9 数据流复核）
> 对照基线：现 M1 引擎（`tools/mission-driver/` + `plugin/dsh/`）

## 1. 核查范围与方法

- **已读**：0003 方案全文；0001 报告全文（含 §2/§4/§4.0 裁定）；frontmatter 改造讨论稿全文（含 §8 审计内联裁定）；引擎源码 `engine.js`（2211 行全读）、`orchestrator.js`、`config.js`、`main.js`、`reap-orphans.mjs`、`run-reconcile.mjs`、`active-run-registry.mjs`、`flow-loader.js`、`plan-check.mjs`、`roadmap-check.mjs`；插件 `mdcontrol-routes.ts`、`plan-status-gate.ts`、`engine-bridge.ts`（watchdog 相关段）、`native-executor.ts`（watchdog 相关段）；三个 flow JSON 与全部 prompts（execute/plan-review/closure-audit/build-verify/draft-from-roadmap/multi-audit/open-audit）；`docs/plans/00-plan-authoring-and-execution-guide.md`（规则 11/12/13、Status Flow、Review Hold）、`docs/context/ai-autonomy-policy.md`。
- **未读（诚实标注）**：`docs/context/project-context.md`、`codebase-map.md`、`source-of-truth-and-precedence.md`、`conventions.md`（本文不依赖其事实断言）；引擎测试用例 653 个的具体断言（仅引用其存在与覆盖面描述，见 0001 §3.2）；`dsh-plugin-survey/` 18 份子报告全文（0001 §8 已消化其结论）；`.opencode/skills/mission-driver/SKILL.md`。未读项若与本文结论冲突，以源码为准，并将在 §7 标注复核路径。
- **方法**：对三问逐条做「现机制语义（源码证实）→ M4 承接位（方案条款）→ 缺口」三段对照；三问之外另做一份全机制映射表（§5）与新增故障面清单（§6），防止只回答「问到的」而漏掉「必须答的」。
- **角色声明**：红队核查。目的不是盖章放行，而是定位方案会在哪里破、缺什么机制、哪些现机制无法映射到 M4。凡出现「方案没写」的表述，均指 0003 文档正文（含 §8 开放问题）未给出该机制的定义，不代表「不可实现」——本报告同时给出补全方向。
- **三条红线**（判据，均可溯源）：① 机械保证不可委托给 AI 认知（0003 §1 不变量③）；② 验收独立性是结构属性，不可由实现者自居（0003 §1 不变量②）；③ 状态权威只在 git 文件、插件零持久记忆（0001 §4.0.1/.3）。后文所有「缺口」判定都以这三条为基准。

## 2. 现状恢复与限制机制清单（源码级全表）

| # | 机制 | 位置 | 语义（源码证实） |
| --- | --- | --- | --- |
| M1 | run-state 原子写 | engine.js:555-564 `_writeWorkflow`（tmp+renameSync）；`_wfOpen` :444-481 开步、`_wfClose` :483-539 收步、`_finalizeWorkflow` :541-553 终态 | 每步结束把 `{status, currentStep, steps[], auditRound}` 原子落盘，崩溃后磁盘即真相；`_wfClose` 是「最终真相」的单一写点 |
| M2 | checkbox 收敛续跑 | execute.md:14；plan-check.mjs:31-33 `CHECKLIST_UNCHECKED_RE/CHECKED_RE` | 勾 box 是唯一工作进度持久记录；重跑读已勾 Phase 跳过（0001 裁定 3A 成文：「继续」= artifact 收敛的涌现语义） |
| M3 | --from-step / --run-dir | orchestrator.js:636-664（entryStep/fromStep 分支）；config.js:791-794（runDir 解析）；resolveTargetRun :151-178 | 定点重入同一 runDir 的指定步；0001 裁定 3B 已降级为 CLI 本机便利（依赖本机 `_tmp/` scratch + 同进程 session 恢复） |
| M4 | reconcileStaleRuns | main.js:184-197（每次 run 启动前）；run-reconcile.mjs:131-181；`isAliveAndOurs` :61-78；无 PID 90min 兜底 :32 | 把 `status:"running"` 但拥有进程已死/PID 被复用的 run 标记 aborted；幂等（只碰 running，:192） |
| M5 | 孤儿 reaper | reap-orphans.mjs:204-346 `reapStartupOrphans`；engine.js:1581-1586 每次 run 启动扫描 | 只杀带 `[MISSION_DRIVER:<runId>]` 标签且其 run 确证死亡的开 code 进程树/MCP/构建残留；无法证明死亡一律 spare（保守） |
| M6 | ActiveRunGuard | mdcontrol-routes.ts:216-236；占用点 :429-438（run）、:545-554（draft） | 单 root 单活动（run/draft 互斥），内存态 Map，终态/崩溃即清；跨 root 独立 |
| M7 | watchdog 60min idle 杀 | native-executor.ts:162-168（BASE_TIMEOUT_MS）；:581-603（whenIdle vs timeout race，cancel→grace→dispose） | 每步硬超时：超时 cancel agent + watchdogGraceMs 宽限 + last-resort dispose |
| M8 | transient 分类退避 | engine.js:197-204 `isTransientProviderError`（stderr 特征签名唯一判据）；:1862-1943 独立预算退避；quota 等重置 :168-266；onError 短失败退避 :1977-1990 | 只信 stderr 签名，不消费 onError 预算；quota 耗尽按重置时点等（quotaMaxWaitMs=0 无限等） |
| M9 | correction-retry | engine.js:970-1006 `_runCorrectionAgent`（onUnknownMaxRetries=2）；容错/模糊提取 :46-78；LLM 兜底 :913-937 | 未知 marker 结构化重试（廉价 parseModel），不消费 onError 预算；三层提取链防 tag 拼写/ANSI |
| M10 | 五类预算 | maxTotalSteps engine.js:1551/flow:3；maxCycleVisits :1557/flow:4；maxRetries `_handleRetry` :1486-1518；maxAuditRounds :1558、:1668-1674/flow:7；pingPongWindow :1560-1564、:1699-1721 | 引擎确定性收口，均 emit `limit_hit`；pingPong 检测 A↔B 交替（有 retry 过渡则豁免） |
| M11 | EXIT_MAP | orchestrator.js:671；exit-map.js | 终态→退出码冻结契约（AGENTS.md/ai-autonomy-policy 列为 AI Block Condition） |
| M12 | 结构性独立派发 | plan-execution.json:38-55（CLOSURE_AUDIT 独立 step）；closure-audit.md:1（independent closure auditor）；plan-review.md（独立 review） | 引擎每次派发独立 agent 会话做评审/审计，实现者无该入口——独立性是引擎结构事实 |
| M13 | WI13 门禁（M4 原型） | plan-status-gate.ts:374-411（evaluate）；F1/F2/F3 :404-410；证据面 :321-355 | pre-execute 拦 `> Plan Status: completed` 写入；deny 当且仅当 run-state 子流程证据存在且无面成立；内部错误 fail-open :437-443；路径域限 `.md`+已知 plans 根 :259-278 |

**判定权分布（今日，源码证实）——这是三问的总钥匙**：
- **引擎决定**：步序（flow JSON 拓扑）、预算/终态（engine.js:1641-2210 主循环）、nothing→审计 的边、reconcile 降级。AI 无法影响 mission 终态（draft-from-roadmap.md:31「the engine decides…you cannot influence that decision」）。
- **AI 决定**：nothing/created（DRAFT_PLANS 的语义判断，draft-from-roadmap.md:29）、plan-review 是否提升 active（plan-review.md:22-27）、closure audit 是否 approved（closure-audit.md:58-71）、BUILD_VERIFY 自报 pass/fail（build-verify.md:3-22）。这些是**判断性工作**，M4 下仍归 AI，门禁只能兜底不能替代。
- **脚本决定**：CLOSURE_SCRIPT_CHECK 确定性跑 plan-check.mjs（flow-loader.js:195-237）；CHECK 的 commands.check（CONTEXT.md mdr-fix-3）。这是「机械保证」的既有实例。

映射到 M4 的正确姿势（我的推理）：引擎权 → 门禁族 + meter（且预算/终态逻辑必须在纯函数里等价重建）；AI 权 → 保留 + 门禁加「声称校验」（nothing 声称、active 自升、审计自证三类）；脚本权 → 保留并扩大（BUILD_VERIFY 机械化）。方案只做了引擎权→门禁的**方向**声明，没做 AI 权三类「声称校验」的清单。

## 3. Q1 roadmap 完成性保证（结论+证据+缺口）

**结论**：M4 下「roadmap 最终完成」缺少三个承重部件——①「可起草工作」的判定仍是 AI 语义判断，方案未给机器兜底；② mission 终态（completed/failed/partial）的判定规则没有门禁化落地，且 meter 量的跨重启持久化与 §4.0 零记忆原则冲突；③ per-plan 反复失败与 Review Hold 死锁没有对应的确定性收口。方案声称的「无可起草才审计=派生规则」（0003 §4）只对一半：nothing→审计的**边**是派生的，但「nothing」这个**判断本身**是 AI 的。

### 3.1 谁判定「还有可起草的工作」？（纯函数还是 AI？）

- 现机制：DRAFT_PLANS 是 AI agent step，AI 读 roadmap 全文 + 既往 deferred 项后报 nothing/created（源码证实：flow mission-driver.json:64-67；prompt draft-from-roadmap.md:14-31）。引擎对「nothing」**不做任何二次验证**，直接转移（源码证实 engine.js:2094-2187 转移解析只查 transitions 表）。
- M4 下：Supervisor sustain 的「账本有活」只能是纯函数（如 grep roadmap 未勾项，roadmap-check.mjs:100-104 风格），但「这些未勾项是否值得/能够起草成计划」是语义判断——包括「上一批 plan 是否已覆盖某未勾项」「deferred 项的重触条件是否满足」（plan-authoring-guide:69-70 规定 deferred 必须命名重开条件，但判断条件是否满足仍要语义）。
- 我的推理：把「可起草」硬编码成纯函数，等于把 roadmap 项语义编进状态机，退化为再造 DSL 语义层——不值得，也与 M4「极薄监督者」自相矛盾。答案只能是 **AI 判定 + 机器兜底验证**，而方案只给了 AI 判定（sustain 触发续轮），没给机器兜底。
- **缺口**：需要一个「claim-nothing 门禁」：AI 声称「无可起草」时，门禁验证 `roadmap 无未勾项 ∧ draftPlans()/activePlans() 均空`（前件可纯函数化），否则 deny 并附 reason 强制重新起草。0003 §5 的 Law 清单列了「完成派生校验」但没列「nothing 声称校验」——后者才是 roadmap 完成性的第一道机器闸。

### 3.2 谁决定 mission 完成（completed/failed/partial）？

- 现机制（源码证实，三层）：① maxAuditRounds 硬门（engine.js:1668-1674，round>=max 直接 completed）；② 审计闸早退（:728-749：「至少审过 1 轮 ∧ 无 activePlans ∧ 无 openAudits」即 completed，不再等满额）；③ reconcileOnTerminal（:681-714：failed-ish 终态 + roadmap 100% + 无活动工作 → 降级 completed）。三层都是引擎确定性判定，AI 无法影响。
- M4 下：三层必须由 Supervisor 的 meter（审计轮次计数）+ 门禁（轮次上限、无工作早退）+ receipt（终态回执）承接。0003 §5.c meter「写本机 run 态」、§5.e receipt「既有能力」（mdcontrol-routes.ts:380-394 已有终态回执实现）。
- **缺口 A（持久化冲突）**：§5.c 说 meter 写「本机 run 态」= scratch；而 §4.0 裁定「插件零持久记忆、`_tmp/` 是本机 scratch 不是状态面」（0001 §4.0.3）。审计轮次若只存 scratch，宿主重启后归零——restart 续班变成「每次满额重审」。M1 的「审计预算按 run 重置」是**成文的有意语义**（0001 裁定 3A），M4 的「无状态恢复」声称（0003 §5.d「崩溃后重启续班，无状态恢复，读账本即可」）却没有解释 meter 量的跨重启去向——要么进账本（污染状态格，违反讨论稿 §4.1「一事一处」），要么接受 scratch 归零并成文。这是方案内部的自相矛盾点。
  - **✔ 已裁定（human，2026-08-24）**：跨 run 全局计量（`audit-rounds`）直接放 roadmap frontmatter。limit（`maxAuditRounds`）留配置，count 进账本，一事一处不冲突；语义变为 mission 全局预算（修正 M1「按 run 重置」怪点，行为变更须成文）；写者纪律 = 合法写者（M1 引擎 `_wfOpen` / M4 监督者 trigger）+ 乐观锁（§6-4）。见讨论稿 §4.3。
- **缺口 B（partial 未定义）**：M1 终态集合 = completed/failed/max_cycles/max_retries/max_total_steps/ping_pong/aborted（源码证实 engine.js:682 FAILISH + EXIT_MAP），**无 partial**。核查问题明确问 completed/failed/partial——若 M4 要引入 partial（roadmap 部分完成即终），必须先定义：partial 的账本证据（哪些项 done、哪些 held/deferred）、谁判定（supervisor 裁决）、退出码映射（EXIT_MAP 变化，见 §5 表）。
- **缺口 C（终态门禁规则集未给出）**：M4 需要把 M1 的三层终态逻辑（engine.js:1668-1674 硬门、:728-749 早退、:681-714 降级）写成显式的纯函数规则集。我的推理，至少四规则缺一不可：R1 `round >= maxAuditRounds → completed`（上限硬门）；R2 `round >= 1 ∧ activePlans()==0 ∧ openAudits()==0 ∧ roadmap 全 done → completed`（干净早退）；R3 `round >= 1 ∧ activePlans()==0 ∧ openAudits()==0 ∧ roadmap 有未勾项 → partial/blocked`（M4 新增——M1 在此场景下静默 completed，正是 Q1-6 的红线）；R4 `连续 N 轮无账本变迁 → 熔断终态`（M4 新增）。R2/R3 的差异（roadmap 全 done 与否）正是 M1 用 reconcileOnTerminal（:681-714）在 failed 侧才做的检查——M4 应在 completed 侧就区分，而不是等终态后再降级/不降级。方案没有给出这组规则。

### 3.3 「plan 反复失败但不 draft 新的」如何终止？

- 现机制（源码证实）：per-step retry（plan-execution.json:23 EXECUTE fail→retry:3；:53 CLOSURE_AUDIT issues→retry EXECUTE:3；:65 BUILD_VERIFY onMaxRetries→failed）+ 顶层 maxCycleVisits（engine.js:1550-1659）、pingPongWindow（:1699-1721）、maxTotalSteps（:1551）三重兜底；审计闸在无活动工作时早退（:728-749）。
- M4 下：子代理自驱执行失败，**没有 per-plan retry 计数器**。meter 只有全局步数/墙钟（方案推断 §5.c），「同一 plan 连续失败 N 次 → 降级/进审计/告警」无对应门禁。
- **缺口**：需要 per-plan 失败计量 + 上限门禁。落点二选一：账本加字段（如 frontmatter `retries: N`——但「失败」由谁判定、谁写入、写入合法化都会引出一串新门禁，且违反「一事一处」）或 supervisor 本地 scratch（违反零记忆、restart 归零）。方案两个都没选，也没写这个需求。
  - **✔ 已裁定（human，2026-08-24）**：per-plan 失败计数进 plan frontmatter（`failures: N`），与 `audit-rounds` 同模式——limit（`maxFailures`）留配置、count 进账本；跨 run 累计（修正 M1 按 run 重置）；写者 = 监督者失败归因（executor 错误/测试红/claim 到期无产出），升级规则 `failures ≥ maxFailures → held + 人工回执`（M4 等价物 = M1 onMaxRetries→failed）。见讨论稿 §4.2。

### 3.4 「roadmap 剩 todo 但无 plan 推进」如何被机器发现？

- 现机制：**没有机器发现**——纯靠 DRAFT_PLANS AI 诚实性（源码证实 prompt draft-from-roadmap.md:29 明言判断交给 AI；engine.js:2094-2187 信 marker 不验证）。若 AI 误报 nothing，mission 走 DEEP_AUDIT 在 maxAuditRounds 到顶 completed，roadmap 未勾项被静默滞留（源码证实 :728-749 只看 activePlans/openAudits，不看 roadmap 未勾项）。
- M4 的机会（我的推理）：M4 有纯函数可机检的组合谓词——`roadmap 有未勾项 ∧ activePlans()==0 ∧ draftPlans()==0 ∧ openAudits()==0` → 此刻 deny AI 的 nothing 声称并强制触发起草。这个前件全可纯函数化（roadmap-check.mjs:100-104 + flow-loader.js:72-111 已有部件）。M1 因为信 marker 反而**错过了**这个机器发现点——M4 若能补上，是净强于 M1 的地方。**但方案没写**。
- **缺口**：需「nothing 声称校验门禁」，且「触发起草」的副作用（谁起草）要接 supervisor sustain/trigger + 起草子代理。注意：这条机器发现只有在「AI 还要选「起草什么」」时才有意义——若机器发现后只是重启同一 DRAFT_PLANS 类循环，仍回到 3.1 的语义判断。

### 3.5 deep audit 的进入与轮次限制归谁？

- 现机制（源码证实）：引擎专有。auditEntry（flow mission-driver.json:8）+ auditRound（engine.js:427,458-461 在 `_wfOpen` 进 auditEntry 时自增，防崩溃半途审计的 crash-safe）+ 硬门（:1668-1674）+ 早退闸（:728-749，调用点 :2154-2167）。
- M4 下：必须由 supervisor trigger（何时切审计态）+ meter（轮次）+ 门禁（上限、早退）承接。0003 §5.b 说 trigger「账本变迁到待审态→派发独立评审」，§8 开放问题 3 自认「trigger 规则声明式定义归入 DSL 哪段」未定。
- **缺口**：①「从工作态切入审计态」的触发门禁——什么账本信号代表「待审」？方案只给了名字。② 轮次上限门禁 + 早退逻辑必须重写等价物（:728-749 的逻辑：`round>=1 ∧ activePlans==0 ∧ openAudits==0 → 早退`），否则要么无限审要么永不审。③ 审计轮次持久化归属（见 3.2 缺口 A）。

### 3.6 连续失败熔断与 Review Hold 死锁（全部 held 无活可干）？

- 现机制（源码证实）：连续失败被 maxCycleVisits/pingPong/maxTotalSteps 收口（engine.js:1550-1659,1699-1721）。Review Hold 的 plan 保持 draft 不被 activePlans() 拾取（plan-review.md:27；flow-loader.js:157 activePlans 只认 ACTIVE_STATUSES :19-30），continuous 遇 Hold 暂停并出回执（0001 裁定 5.5，mdcontrol-routes.ts:412-466 异步契约层）。
- **关键事实（源码证实）**：全 hold 时 `activePlans()==0 ∧ openAudits()==0` → `_shouldCompleteOnAuditQuota`(:748) 返回 true → mission 以 completed 收场，**但 roadmap 未完成**。reconcileOnTerminal 不阻止它——它只把 failed-ish 降级成 completed（:682-683 FAILISH 集合），绝不把 completed 升回 failed（:683 `if (!FAILISH.has(status)) return status`）。所以 M1 的既有语义是：**全 hold = mission completed（hold 视为无计划工作，roadmap 完成性让位）**。
- M4 下必须显式裁决两件事（我的推理）：① 「hold 项的存在是否阻止 completed」——若阻止，全 hold 会死锁（无活可干又不得完成），需要「hold 熔断」：全部计划 held 超 N 轮 → 终态化为人工待办（blocked/partial）并 receipt；② 「AI 连续选不出活/反复被拒」的熔断——M1 的 maxCycleVisits 是「同一 step 重复访问」，M4 的等价物是「同一账本态无进展 N 轮」。方案都没有写。

### 3.7 roadmap 未推进的静默路径机器可见性对照（小结）

| 静默路径 | M1 机器可见性 | M4 机器可见性（方案现状） |
| --- | --- | --- |
| AI 误报 nothing 而 roadmap 未勾 | 不可见（信 marker，source 证实 engine.js:2094-2187） | 不可见（方案未设计 claim-nothing 门禁） |
| 全 hold 无活可干 | 可见为「completed 但 roadmap 未完成」（source 证实 :748）——但语义未成文 | 未裁决（方案未写） |
| plan 反复失败不 draft 新 | 由 maxCycleVisits/pingPong/maxTotalSteps 收口为 failed/max_*（source 证实 :1550-1721） | 不可见（无 per-plan 失败计量） |
| 单个 plan 卡在 active 永不勾完 | 不可见（EXEC_PLANS 每轮都会重新拾取它，source 证实 flow-loader.js:157 activePlans 持续命中） | 需要「长期未推进 plan」巡逻门禁（未写） |

## 4. Q2 plan 生命周期强制（结论+证据+缺口）

**结论**：M4 的 plan 生命周期在「completed 派生化」后暴露出三个未设计的承重门禁——draft→active 的独立性裁决、审计回执的可机检性、BUILD_VERIFY 的机械性。更尖锐的是：**方案自己钦点的原型 WI13 是建在 M1 run-state 上的证据面消费者，M4 下证据面消失，它会安静地变成 no-op**。

### 4.1 状态格转移的每条边由哪个门禁裁决？

- 前置（源码证实）：frontmatter 改造后 plan 可写生命周期位只剩 `status: draft|active|held`（讨论稿 §4.2「completed 移除，纯派生」），execution 链变化为 execute.md 步骤 3b 只勾 box、4a 删除写 completed（讨论稿 §4.2）。
- 边枚举（我的推理）：
  - 改 draft 内容 / 勾 box / 改 roadmap 项：普通内容编辑。WI13 只盯 status 行（源码证实 plan-status-gate.ts:379 `proposedPlanStatus !== 'completed'` 即放行），内容编辑无门禁可拦。
  - draft→active：**最关键边**。现机制由 REVIEW_PLANS 独立 step 写（源码证实 flow mission-driver.json:73-84；plan-review.md:22「After fixing… change > Plan Status: draft to > Plan Status: active」）。
  - active→held、held→active：现机制 held 由 plan-review 写（源码证实 plan-review.md:27），谁解锁 held 未机械定义（M1 靠下一轮 review/human）。
- **缺口**：draft→active 的裁决者（谁、以什么证据）方案没写；held 的生命周期（谁可写 held、谁可解锁、解锁是否需要重新 review）方案没写。Law 清单（0003 §5）只有「状态格合法转移」六个字，没有逐边裁决者表。
- **逐边裁决者表（我的推理，M4 的 Law 必须逐边回答这张表）**：

| 边 | M1 现裁决者 | M4 需新增门禁 | 证据面 |
| --- | --- | --- | --- |
| 新建 plan 文件（status: draft） | DRAFT_PLANS agent（任意写） | 路径护栏门禁（文件须落在 plans 域内，0003 §5 Law 已列） | 路径检查 |
| 修改 draft 内容 | 任意 agent（无门禁） | 无（内容编辑不 gate） | — |
| draft→active | REVIEW_PLANS 独立 step（plan-review.md:22） | 写者身份门禁（须为已登记评审派发） | 派发登记表 + agent 身份 |
| active→（执行勾 box） | EXEC_PLANS 引擎派发（activePlans 拾取） | 认领合法性门禁（须先 claim） | claim 登记 + 状态位 |
| 全勾过渡（派生完成） | completed 写入被 WI13 拦 | 全勾过渡门禁（须已带审计回执绑定） | 审计回执 + 派发登记 |
| active→held / held→active | plan-review 写 held（plan-review.md:27） | held 门禁（谁可写、解锁须重新 review？） | 状态位 + 评审登记 |
| audit 回执写入 Closure 区 | CLOSURE_AUDIT 独立 step 写 | 回执绑定门禁（audit-id 匹配派发登记） | audit-id + 登记表 |

### 4.2 谁能合法写 status:active（如何结构化排除 drafter 自升）？

- 现机制（源码证实）：结构性排除——REVIEW_PLANS 是引擎派的独立 agent step，drafter（DRAFT_PLANS step 的 agent）没有 REVIEW 的入口；prompt 也禁止 drafter 自评（draft-from-roadmap.md:25「use an independent sub-agent (fresh session) to review repeatedly until consensus」）。
- M4 下：pre-execute 门禁要裁决「写 active 的动作来自谁」。这要求：① 门禁能拿到写入者 agent/session 身份（宿主 waterfall 有 agent-scoped 机制，源码证实 plan-status-gate.ts:424-426 注释 `scopeTarget(this, exec.agent)` 存在，但 WI13 是 non-agent-scoped 的 D1 全局监听）；② Supervisor 登记「哪个 session 是被 trigger 派发的评审子代理」。
- 我的推理：若不建「评审派发登记 + 身份匹配」门禁，drafter 可直接 `edit` 自己的 plan frontmatter 把 draft 改 active——这是 M4 相对 M1 的**净损失点**（M1 里根本不存在 drafter 改 status 的入口）。
- **缺口**：方案 §5.b 只说独立性=「派发者是非实现方」，把「派发行为可被门禁验证」当成前提，但没有设计登记表和验证规则。

### 4.3 完成派生（全勾）之后「审计记录必须存在且来自独立会话」如何机检？

- 现机制（源码证实）：独立性=引擎派发 CLOSURE_AUDIT 独立 agent step（plan-execution.json:38-55；closure-audit.md:1「independent closure auditor」）；审计者把结论写进 plan 的 Closure 区（closure-audit.md:3「modify the plan file on disk」，讨论稿 §8.1 确认这是既有实践）。「完成」= Plan Status: completed，被 WI13 拦（无 F2/F3 证据不许写）。
- M4 下：completed 派生（全勾），「审计记录存在」可机检（源码证实 plan-check.mjs:58-79 hasClosureSection/hasClosureEvidence），但「**来自独立会话**」无法从文件内容机检——Closure 区文本无法自证写作者。
- **缺口**：需要「审计派发登记（supervisor 签发 token）+ 审计者回执（写 Closure 区时带可核对标记）+ 完成放行门禁验证绑定」三层。0003 §5 没有定义任何一层。无此绑定，实现者勾完 box 后自己写一段 Closure 证据即通过——**self-review 从「引擎无此入口」退化为「门禁拦不住文本」**，违反不变量②。

### 4.4 审计内联后防伪的机制边界在哪、与今天结构性独立比是强是弱？

- 机制边界（我的推理）：门禁只能验证「回执标记 ∧ 派发登记 ∧ 派发者唯一性」这三个可机检事实，不能验证「审计者真正独立思考过」——后者 M1 同样无法机械验证（0001 §8.3 dsh-inspect 明言独立性声明应含模型异构性，默认同源同模型是硬局限）。所以**边界本身不是缺陷，缺的是「登记+回执」这一层机械绑定**。
- 强度对比（源码证实 + 方案推断）：今天 = 引擎派发独立进程/session，drafter 无入口，结构性；M4（未补绑定）= 文件内容自证，任何 agent 都能写，**弱**；M4（补登记+回执绑定）= 门禁验证派发与回执匹配，与今天**持平**（都不验证独立思考，只验证独立派发）。方案把它描述成「独立性=谁派发」（0003 §5.b），漏了「验证派发发生且回执匹配」这一步。
- **「登记+回执」绑定的一种可行形状（我的推理，非方案内容）**：Supervisor 派发审计时生成 `audit-id`（如 `audit-<runId>-<plan>-<round>`），写入账本内或 scratch；被派发的审计子代理在写 Closure 区时把该 `audit-id` 写进审计记录块（如 `> Closure Audit: accepted #audit-xxx-3`）；完成放行门禁验证：`全勾 ∧ Closure 区存在 ∧ 记录的 audit-id 存在于派发登记 ∧ 登记者=Supervisor 自身`。防伪强度 = 派发登记的不可伪造性 + audit-id 的不可预测性。若 audit-id 只是时间戳明文，实现者可自造；若 audit-id 由 Supervisor 进程签发且登记只在内存/宿主内，重启后登记丢失 → 已完成审计的 plan 无法放行（新故障：登记丢失导致完成卡死）——这又回到 meter 持久化归属（Q1-2 缺口 A）。说明这一层机制与 meter 持久化是**同一条绳**，必须一起裁。
- **最尖锐发现（源码证实）**：WI13（M4 钦点原型）的 F1/F2/F3 证据面全建在 run-state-*.json 子流程文件上——F1 查子流程 `status:"running"`，F2 查 `steps[] {name:"CLOSURE_AUDIT", status:"completed"}`，F3 查 BUILD_VERIFY/整体 completed（plan-status-gate.ts:404-410），证据扫描是 `scanSubflowMatches`（:321-355）遍历 `_tmp/<runId>/run-state-*.json`。**M4 下引擎可选、这些文件不存在 → 证据面恒空 → 门禁走 :397-402「无证据→allow + 观察注记」分支 → WI13 变成 no-op**。结论：迁移时 WI13 不是「泛化为门禁族」，是「证据面重建」——方案的「WI13 是 M4 原型、可零引擎 diff 落地」（0003 §3.2）对**当前形态**成立，对 **M4 形态**不成立。

### 4.5 BUILD_VERIFY 在 M4 下由谁跑？监督者直跑命令严格强于今天吗？

- 现机制（源码证实）：BUILD_VERIFY 是独立 agent step（plan-execution.json:57-67），AI 自己跑 typecheck/build/lint/test 并报 pass/fail marker（build-verify.md:3-22）——引擎信 marker，AI 自报。CLOSURE_SCRIPT_CHECK 倒是确定性 script（flow-loader.js:195-237 跑 plan-check.mjs）。
- M4 §9.2/§9.3：checker 本来就是 CLI，「agent 自跑自读即可，监督者最多代跑附上，属便利非契约」（0003 §9.2 对照、§9.3 边界 1）。
- 我的推理：分两种落地——① 按 §9.3 现状表述（agent 自跑自读）：与今天**等弱**，AI 报 pass 但命令实际红仍是靠后续审计兜底，不变量③在构建验证一环仍裸奔；② 若监督者/自动化**直跑命令、exit code 进门禁**：则严格强于今天（今天 AI 自报的诚实性问题被结构性消灭）。方案没有明确选②，也没有把 BUILD_VERIFY 提升为 script 型门禁。
- **缺口**：需裁定 BUILD_VERIFY = 监督者直跑脚本 + exit code 门禁（推荐），并把「今天 AI 报告 pass/fail」的职责迁移干净。

### 4.6 顺序逆转（跳过 review 直接执行、未审计即宣布完成）如何被 deny？

- 现机制（源码证实）：flow JSON 顺序结构性阻止——EXEC_PLANS 只 forEach `activePlans()`（flow mission-driver.json:50-51；flow-loader.js:157），draft 不被拾取；completed 写入被 WI13 拦（无 F1/F2/F3 证据 deny，plan-status-gate.ts:404-410）；审计（CLOSURE_AUDIT）在 BUILD_VERIFY 前（plan-execution.json:38-57）。
- M4 下：
  - 跳过 review 直接执行 = drafter 把 draft 改 active（见 4.2，需身份门禁）或直接执行一个 draft 状态的 plan（需「执行认领门禁」：只允许认领 active 且未勾完的 plan，即 §6-5 认领合法性）。
  - 未审计即宣布完成 = completed 派生化后「全勾即完成」。控制点从「写 completed 行」（WI13 拦的是它）**移到「勾入全勾态的那次写入」**。需要一个「全勾过渡门禁」：勾到无未勾项时，要求该 plan 处于「被认领执行中」或「已带独立审计回执」；否则 deny 最后一勾（或 deny 进入待审态）。
- **缺口**：方案没有给出「完成派生公式」的完整版本。我的推理：完整公式至少是 `completed ⇔ 全勾 ∧ 审计回执绑定 ∧ 派发登记匹配`（与 4.3 同一绑定）。0003 §5 只写了「完成派生校验」四个字。另需裁定门禁粒度：每次勾都查，还是只查「全勾过渡」那一次（后者性能好但需要能定位「哪一勾是全勾」，即先读文件算当前未勾数）。

### 4.7 完成派生的 grep 陷阱（讨论稿遗留问题对门禁的影响）

- 讨论稿 §4.4 自认：装饰性/示例性 `- [ ]` 会污染计数（本仓库 guide 模板就含示例 checkbox），对策二选一：区块限定计数 vs 全文 grep 接受污染（方案推断：讨论稿倾向区块限定）。
- 我的推理：这是「完成派生」门禁的**正确性前提**——若全文 grep，任何示例 checkbox 都会被计为未勾项，完成派生永远为 false，plan 永远无法「全勾」，门禁会把所有 plan 卡死（或反过来：解析器若只数某区块，又需要结构解析，退回到「复杂匹配规则」）。**缺口**：M4 的「grep 无未勾项」完成判定必须先锁定计数域，且该计数函数必须与门禁、roadmap-check、monitor 共用同一实现（M1 已经踩过 regex 漂移的坑——plan-check.mjs 与 flow-loader.js 是两份正则，roadmap-check.mjs 是第三份，roadmap-check.mjs:6 自述「no regex drift」才抽出来）。M4 若门禁族各自带一份 grep，三源状态病会以新形态复发。

### 4.8 审计内联的防膨胀护栏与门禁的关系

- 讨论稿 §8.2.6：review 内联要求 append-only + 有界（正常 2-3 行；超 ~20 行走例外升级路径移入讨论稿）——但这是**文档纪律**，无机械门禁（方案推断：讨论稿没有给护栏加机械验证）。
- 我的推理：不需要「审计区有界」门禁（git 历史即护栏），但「审计区 append-only、不得删除历史共识记录」可机检（git diff 检测对审计区文本的删除），与 4.3 的「回执绑定」是同一条防线——若允许覆盖写，实现者可以事后把「审计拒绝」的共识删掉再自写「审计通过」。**缺口**：M4 的审计区写入门禁应同时约束「只能 append、不能改写既有共识记录」，方案未提。

## 5. Q3 中断恢复与限制逐条映射表（现状机制 → M4 等价/溶解/缺失）

| 现状机制（file:line） | M4 等价物 | 判类 | 备注 |
| --- | --- | --- | --- |
| run-state 原子写（engine.js:555-564） | 账本文件转移 | ◐ 部分溶解 | 账本部分（status 位/checkbox）更持久（git 原子，跨 checkout）；meter 量（审计轮次/步数/失败计数）落 scratch（0003 §9.3 边界 2），崩溃丢；plan 文件写入原子性依赖宿主 edit 工具（str_replace 等），无引擎 tmp+rename 保证——并发/崩溃写 plan 的原子性在 M4 无显式承诺 |
| checkbox 收敛（execute.md:14） | 账本勾 box | ✅ 等价 | M1 也是靠勾 box 续班（0001 裁定 3A）；M4 restart 读账本续班 = 同一机制，无新东西 |
| --from-step/--run-dir（orchestrator.js:636-664, config.js:791） | restart 读账本推断断点 | ◐ 部分溶解 | M4 无 run-state 可读「正在执行哪个 plan / 审计第几轮」；可推断「active+部分勾+无 claim→续执行」「全勾+无回执→转审计」；进行中审计轮次丢失须成文（与 M1「预算按 run 重置」同性质，0001 裁定 3A） |
| reconcileStaleRuns（main.js:184-197, run-reconcile.mjs:131-181） | 认领租约回收（新增） | ✘ 缺失 | M4 无 run-state PID 可查（isAliveAndOurs 依赖 pid+cmdline，:61-78）；「被认领未完成」的 plan 需要 claim TTL/心跳判过期——见 §6-1 |
| 孤儿 reaper（reap-orphans.mjs:204-346） | 溶解 | ✅ 溶解 | M4 无 `[MISSION_DRIVER:<runId>]` 子进程标签体系（引擎可选）；子代理生命周期归宿主，孤儿进程=宿主 session 管理问题；宿主内子代理残留由宿主自己 dispose |
| ActiveRunGuard（mdcontrol-routes.ts:216-236） | 乐观锁门禁 | ◐ 替换 | M1 靠单 root 单活动串行化掩盖并发写（0003 §9.3 边界 3「M1 下同样存在，今天靠单 run 守卫掩盖」）；M4 多子代理并发写需文件级 CAS 乐观锁，粒度（文件 hash vs 区段）未决（0003 §8 开放问题 1）；guard 的 per-root 单活动语义与 M4 多代理并发直接冲突——要么溶解要么退化为「每计划锁」 |
| watchdog 60min（native-executor.ts:162-168,581-603） | 子代理超时/自转守卫（新增） | ✘ 部分缺失 | 宿主 per-call timeout 可复用（0003 §5 宿主 API 核算=零新增宿主依赖）；但「AI 拒不选活/长期空转不结束」是 M4 新故障面，需 sustain+无产出守卫（§6-3） |
| transient 退避（engine.js:197-204,1862-1943） | 派发层复用 或 收敛式重跑吸收 | ◐ 部分溶解 | 职责从引擎移到派发层/宿主；0003 §6 自认「短期真实损失」 |
| correction-retry（engine.js:970-1006） | 门禁 deny(reason) 后 AI 自修 | ✅ 溶解 | 0003 §4 明示 marker 溶解后机器失去对象；功能面被更富信息的结构化 deny 替代（0003 §5「谈判式而非开关式」） |
| maxTotalSteps（engine.js:1551） | meter 全局步数/墙钟门禁 | ◐ 需定义 | M4 下「步」的度量单位（agent turn？followup 次数？账本变迁次数？）未定义——meter 记账口径不先定，上限门禁无意义 |
| maxCycleVisits（engine.js:1557） | 同状态无进展上限门禁 | ✘ 缺失 | 0003 §6 损失清单未列；防「plan 反复失败不 draft 新」（Q1-3）与「hold 死锁」（Q1-6）必须 |
| maxRetries（engine.js:1486-1518） | per-plan 失败预算 | ✘ 缺失 | 见 Q1-3 |
| maxAuditRounds（engine.js:1558,1668-1674） | 审计轮次计量+上限门禁 | ◐ 需持久化 | 归属账本 vs scratch 未裁（Q1-2 缺口 A）；早退逻辑等价物（:728-749）须重写 |
| pingPongWindow（engine.js:1699-1721） | 往返检测（exec↔audit 反复） | ✘ 缺失 | 0003 §6 自认损失；「同 plan 反复被打回执行」「同 roadmap 项反复 draft↔review」的等价检测未设计 |
| EXIT_MAP（orchestrator.js:671） | 未定义 | ✘ 缺失 | 0003 §6 溶解清单与保留清单均未列；CLI 退出码冻结契约（ai-autonomy-policy 列为 protected）去向不明 |
| 结构性独立派发（plan-execution.json:38-55） | 派发登记+回执绑定门禁 | ◐ 需新机制 | 见 Q2-3/4；不建则净弱 |
| WI13 门禁（plan-status-gate.ts:404-410） | 证据面重建 | ✘ 失效 | 证据面=run-state-*.json（:321-355），M4 下恒空→no-op；见 Q2-4 |
| SIGTERM/SIGINT markAborted（main.js:199-217） | 溶解为「中断即暂停」（§4.0） | ✅ 溶解 | 0001 裁定 2：不做 paused 记账；账本勾 box 即恢复机制；M4 restart 读账本天然同构 |

**§5 规律总结（我的推理）**：16+ 项中，凡「进程/run 级」机制（run-state、PID 存活、子进程标签、per-root guard）在 M4 都溶解或需换皮；凡「账本级」机制（checkbox、status 位）等价或更强；凡「AI 步骤级」机制（correction、dispatch 顺序、独立派发）要么溶解（marker 契约），要么需要「登记+回执」重造（独立性），要么升级为「脚本门禁」（BUILD_VERIFY）。缺失的 7 项集中在「预算收口」与「终止判定」——这正是 0003 §6 自认要「重新挣得」但实际没有给出挣法清单的部分。

**§5 分类统计（源码证实判定类）**：✅ 等价/溶解 4 项（checkbox、孤儿 reaper、correction-retry、SIGTERM markAborted）；◐ 部分溶解/替换 7 项（run-state、from-step/run-dir、reconcileStaleRuns、ActiveRunGuard、transient、maxTotalSteps、maxAuditRounds）；✘ 缺失或失效 7 项（maxCycleVisits、maxRetries、pingPongWindow、EXIT_MAP、结构性独立派发、WI13、以及 reconcile 的 M4 形态）。比例说明：M4 不是「机制平移」，接近一半的恢复/限制语义要在新基座上重建或重新设计。

## 6. M4 特有故障面与新增组件需求

1. **认领租约 TTL（claim lease）**。M1 靠 run-state PID + isAliveAndOurs 判孤儿（源码证实 run-reconcile.mjs:61-78）；M4 的 claim 持有者是宿主子代理 session，无 run-state 可查存活。需「认领登记 + 心跳 + 过期回收」：session 死/宿主重启后，新 supervisor 必须释放过期 claim 并把 plan 送回可认领池。这是 M4「restart 续班」能成立的前提，0003 §5.d 没有它——「读账本即可」只覆盖了「账本有 checkbox 进度」，没覆盖「claim 归属」这个必须单独持久化（或可推断）的状态。可推断方案（我的推理）：claim 只写账本（如 frontmatter `claimed-by:` + 时间戳），心跳更新时间戳；过期判定=时间戳超 TTL；这比 scratch 更符合 §4.0，但把「认领」这个瞬态写进账本会污染 git 历史——需裁定（写 scratch 接受归零 vs 写账本接受噪音）。
2. **谁 watch 守夜人**。M1 引擎崩溃由下次 run 的 reconcile+reaper+startup 诊断收尸（源码证实 main.js:184-197、engine.js:1581-1586）；M4 的 Supervisor 是唯一守夜人，它挂起=整个循环停。我的推理：若 Supervisor 是宿主插件 service（cordis context 内），宿主进程活着=它活着，宿主就是它的 watchdog——**但必须成文**；若拆独立进程则需外部看门狗。另外：方案说 Supervisor「极薄」，但没明说它是纯函数进程还是 AI 会话——若 sustain/trigger 本身是 AI 判断，Supervisor 也会「挂起」，守夜人的可靠性就被 AI 化，需裁定 Supervisor 为确定性代码而非 AI。
3. **子代理无限自转（idle 不结束）**。宿主 per-call watchdog 可兜单次调用（native-executor.ts:581-603），但 M4 子代理是「长期会话自驱」，「持续无产出」需要「无产出守卫」：N 轮 sustain followup 后账本无变迁 → 熔断/告警/换子代理。M1 无此故障面（引擎每步 dispatch 都有确定结果或错误）。
4. **多子代理并发写同一 roadmap 的竞争**。乐观锁门禁（文件级 hash CAS vs 区段锁）——0003 §8 开放问题 1 自认未决。需要补：CAS 失败的冲突解决策略（deny 后重读重试？serialize 谁先写？）、写前校验原子性（校验+写入必须原子，否则 TOCTOU——pre-execute 只有「校验」语义，写入的原子性靠宿主 edit 工具，需核实宿主是否提供 compare-and-swap 式 edit）。这个没核实宿主能力前，乐观锁门禁的地基不稳。
5. **「AI 拒不选活」与「AI 选中错误活」**。拒不选活→sustain followup 无产出守卫（见上 3）；选中错误活→「认领合法性门禁」：claim 只能发生在合法前置（仅 active 且未勾完的 plan、roadmap 项顺序约束），被拒认领要有结构化 deny(reason)。M1 下「选错活」不存在（activePlans() 磁盘扫描定死候选，源码证实 flow-loader.js:156-159）——M4 把选活自由交给 AI，门禁必须接手这一整类新动作。

**新增组件 → 宿主能力依赖清单（落地前提，我的推理，均待实证核实）**：
- pre-execute 需暴露 agent/session 身份（draft→active 门禁、审计回执验证用）——WI13 当前是 non-agent-scoped（源码证实 plan-status-gate.ts:424-426 D1 注释），需改 agent-scoped 或增加身份参数。
- edit 工具需 CAS/原子写语义（乐观锁地基，§6-4）。
- followup/create 需支持「向任意新子代理派发独立任务」（trigger 派发独立评审、sustain 续轮）——0003 §5 声称零新增宿主依赖，需对照 packaging doc 六调用账本复核 create 是否已在其中（0003 §5 列了 followup/create）。
- session events 观察（trigger 依赖「账本变迁→派发」——事件通道已有，但「账本变迁」检测是 poll 还是 event 需裁定，0003 §5 说观察=session events 已有，未说谁在 poll 文件）。

## 7. 综合判定（可行/条件可行/不可行 + 前置条件与新增机制 + 强弱面总表）

**判定：条件可行（Conditional）**。M4 作为**架构北极星方向**成立（与 0003 §7 判定一致），但作为**今天要交付的无人值守自主运行**方案，目前**缺六件必建机制**，其中三件是「防止方案自身净倒退」的硬门。

**必要前置条件与新增机制清单**：
1. **审计派发登记 + 回执绑定门禁**（Q2-3/4，硬门）——否则内联审计独立性比今天引擎派发弱，直接违反不变量②。
2. **draft→active 的写者身份门禁**（Q2-1/2，硬门）——否则 drafter 自升、跳过 review。依赖宿主 pre-execute 暴露 agent/session 身份。
3. **完成派生公式补全**：`completed ⇔ 全勾 ∧ 审计回执绑定 ∧ 派发登记匹配`，并定「全勾过渡」门禁粒度（Q2-6，硬门）。
4. **claim 租约 TTL + 认领合法性门禁**（§5 表、§6-1/5）——restart 回收与并发认领的根基；含「无产出守卫」（§6-3）。
5. **meter 量（审计轮次/步数/per-plan 失败）的持久化归属裁定**（Q1-2/3、§5 表）——账本 vs scratch 二选一并成文接受代价；解决「无状态恢复」声称与 meter 持久化的内部矛盾。
6. **nothing 声称的机器兜底门禁**（Q1-1/4）+ **BUILD_VERIFY 机械化**（Q2-5）+ **EXIT_MAP 等价物**（§5 表）+ **往返/无进展熔断**（§5 表 pingPong/maxCycleVisits 等价物）。

**与现引擎对比的强弱面总表**：

| 维度 | 现 M1 引擎 | M4（含补全后） | 判定 |
| --- | --- | --- | --- |
| 第二真相通道（marker/FLOW_VARS） | 存在，correction-retry 维护（engine.js:970-1006） | 溶解，AI 报告=文件写入本身 | M4 强（0003 §4 定理） |
| 可信计算基 | 653 测试的状态机 | 纯函数门禁族（可穷举）+ 百行监督者 | M4 强（0003 §5） |
| 完成声称防伪 | WI13 拦 completed 行写入 | completed 不可写（纯派生） | M4 强（讨论稿 §3.2） |
| 审计独立性 | 引擎派发独立 agent（结构性） | 需登记+回执绑定门禁 | 补全后持平，不补则 M4 弱 |
| BUILD_VERIFY | AI 自报 pass/fail | 需机械化为门禁直跑 | 补全后 M4 强，不补则持平 |
| 并发写 roadmap | 单 run 串行掩盖 | 乐观锁门禁（未设计） | 两者都不够，M4 待建 |
| 中断恢复 | run-state + reconcile + checkbox | 账本 + claim TTL + checkbox | 需补 claim 层 |
| 预算收口 | 五类引擎预算齐全（engine.js:1551-1721） | 仅 meter，等价物待建 | M4 暂弱 |
| 往返/死锁检测 | pingPong + maxCycleVisits | 缺失 | M4 暂弱 |
| 「nothing」可信性 | 信 AI marker 不验证（可滞留 roadmap 项） | 可补机检兜底（净强机会） | 补全后 M4 强 |

**风险登记表（供排序）**：

| 风险 | 等级 | 触发条件 | 缓解 |
| --- | --- | --- | --- |
| 审计自审过关（实现者自写 Closure 区） | P0 | 无登记+回执绑定即上线 | 前置条件 1/3 |
| drafter 自升 active 跳过 review | P0 | 无写者身份门禁即上线 | 前置条件 2 |
| 全 hold 死锁或静默 completed（roadmap 未完成） | P0 | hold 语义不裁定 + 无熔断 | Q1-6 裁决 |
| WI13 变 no-op（证据面消失） | P0 | 迁移第一步照抄现门禁 | §4.4 证据面重建 |
| meter 跨重启归零导致无限审计/无审计 | P1 | 持久化归属不裁定 | 前置条件 5 |
| plan 反复失败无法终止 | P1 | 无 per-plan 失败计量 | 前置条件 5/6 |
| 并发写 roadmap 互相覆盖 | P1 | 无乐观锁 | §6-4（先核宿主 CAS 能力） |
| 子代理空转/拒不选活挂死循环 | P2 | 无产出守卫 | §6-3 |
| grep 计数域未锁导致完成派生失真 | P2 | 全文 grep 撞示例 checkbox | §4.7 共用计数函数 |

**红队收尾（供 human 决策用）**：
- **第一条**：M4 钦点的原型 WI13 是 M1 run-state 的证据面消费者（plan-status-gate.ts:321-355），M4 下会安静地变成 no-op——迁移时它是「证据面重建」不是「泛化」。
- **第二条**：方案把「独立性=谁派发」当结论，漏了「验证派发发生且回执匹配」这一层机械绑定——不补，内联审计 + completed 派生化会让「自审过关」比今天更容易而不是更难（今天实现者连写 completed 的入口都没有）。
- **第三条**：0003 §6 自己承认「transient 分类退避、ping-pong、reconcileOnTerminal」是短期损失需重新挣得——本报告核实它们中多数**不只是损失而是缺失**（§5 表 ✘ 项），且其中 maxAuditRounds 的持久化还撞上 §4.0 零记忆原则，需要一次显式裁定而不是默认吸收。
- 复核路径：若 human 需要，下一步应（a）核实宿主 edit 工具是否提供 CAS 式原子写（乐观锁地基）；（b）核实宿主 pre-execute 是否可暴露 agent/session 身份（draft→active 门禁地基）；（c）读引擎测试 653 个断言，确认 §5 表 ✘ 项的语义边界；（d）对照 packaging doc 六调用账本复核 create 是否覆盖 trigger 的独立派发需求。

**迁移触发门槛（我的推理，接 0003 §8.4 的迁移触发条件）**：0003 §8.4 定的触发条件是「frontmatter 改造收口 + 连续队列立项时」二者齐备才启动第三步。本报告建议追加一条：**上述六件前置机制中至少 1/2/3 三件硬门（审计回执绑定、draft→active 身份门禁、完成派生公式）先以门禁形式落地**——因为这三件是防净倒退的，越早钉越好；而 4/5/6（claim TTL、meter 持久化、nothing 兜底）可以在第三步 Supervisor seam 落地时一并做。换句话说：门禁族可以先于 Supervisor 存在（今天 WI13 已证明零引擎 diff），但 Supervisor 不应在门禁族之前单独上线。此门槛与 0003 §7 三步绞杀式迁移兼容，只是把第二步（门禁族）的内部优先级从「状态格合法转移」调整为「先做三硬门 + nothing 声称校验」。
