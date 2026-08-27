# AGE 自主运行架构 — 引擎退役判定清单（Engine Retirement Decision Checklist）

> Status: living decision-gate artifact（M5-WI37 在库，2026-08-27；**非 supported baseline 契约**——本清单是 P4 判定门（00 §7）的判定面工件，随基线目录维护并被 00 §8 文档地图索引；结论变更须附新证据指针，不沿用本版结论）
> Date: 2026-08-27
> Owner: docs/design/age-autonomy/
> Source: roadmap M5-WI37 与「marker 迁移纪律」节；00-overview §3/§7 P4；03-supervisor §10；04-efficiency §6 as-built 注记。plan `docs/plans/age-autonomy/2026-08-27-1023-1-m5-wi37-engine-retirement-decision-checklist.md`。

## 1. Purpose

回答 00 §7 P4 判定门的问题：**门禁 + 守夜人是否已覆盖引擎（`tools/mission-driver/` FlowEngine）的全部无人值守职责，使引擎可退役？** 本清单给出可机械核对的判定面：

1. **覆盖矩阵**（§2）：引擎职责 → 门禁/守夜人覆盖面 → 迁移证据（模块 + 测试 + plan 指针）→ 缺口 → 判定三态（已覆盖 ∨ 缺口阻塞 ∨ 引擎留任面）。
2. **裁定记录**（§3）：累积 7 项 Deferred（D1–D7）逐项裁定（verdict / 理由 / 重开触发三要素齐备）。
3. **总判定**（§4）：引擎留任主后端 ∨ 可退役 ∨ 条件退役 + 缺口前置清单——M5 收口与后继 mission 的判定基线。

判定三态语义：

- **已覆盖**：门禁/守夜人侧存在同职责承载面，证据（模块+测试+plan）可举证；
- **缺口阻塞**：职责无承载面且无裁定过的兜底——阻塞「可退役」结论；
- **引擎留任面**：职责经裁定由引擎继续承载（run 语义内在、冻结契约、或退役执行期才处置）——不阻塞判定门，但构成退役前置清单条目。

## 2. 覆盖矩阵（12 行）

引擎职责面 as-built 清点起点见 Current Baseline（plan 1023-1）；证据指针 = 模块 / 测试 / plan 三类（能举证处齐备）。

| # | 引擎职责（as-built） | 门禁+守夜人覆盖面 | 证据指针（模块 / 测试 / plan） | 缺口 | 判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | transient 分类与退避：`engine.js` 纯分类器（`TRANSIENT_PROVIDER_SIGS`/quota 细分）+ correction retry（`_runCorrectionAgent` 步内共会话）+ parse fallback；`executor.js` 心跳/超时/SIGTERM | DSH 形态子代理由宿主生命周期 + 守夜人兜底（idle followup 超时 cancel、claim TTL 重派——03 §6/§7）；transient 重试沿引擎后端（03 §9 失败面诚实表：「守夜人形态沿用/重造」——重造未立项） | `tools/mission-driver/src/{engine,executor}.js`；`test/{transitions,parse-fallback,executor-suspend}.test.js`；plan 2026-08-27-0558-2（步内续用钉住） | 守夜人无自有 transient 分类器（沿用引擎 = 裁定结果）；独立形态该职责唯一承载 = 引擎 | 判定：**引擎留任面**（run 内退避随 run 语义存续；DSH 宿主域已由守夜人兜底） |
| 2 | 循环防护：ping_pong / maxCycles / maxTotalSteps / maxRetries → `EXIT_MAP` 2（`engine.js` FAILISH 集） | plan 域振荡 = 守夜人往返检测（stagnation.ts ping-pong 腿 → 饱和注入 R4 同出口）+ 停滞指纹 R4 熔断；plan 级失败预算 = failures 三桶（见 #4） | `plugin/dsh/src/supervisor/stagnation.ts`、`src/exit-map.js`；`test/exit-map.test.js`、`plugin/dsh/test/supervisor-recovery.test.mjs`（往返腿）；plan 2026-08-26-1954-3 | run 内步数上限（maxCycles/maxTotalSteps）在守夜人面无对应——账本域无步数概念，由 R4 墙钟当量近似；run 内防护随 run 语义内在 | 判定：**引擎留任面**（run 内 max* 防护；plan 域振荡对应面已覆盖） |
| 3 | 审计预算：`engine.js` maxAuditRounds 轮门（DEEP_AUDIT 轮计数与拒新轮） | law `audit-rounds-overflow` 门禁（roadmap DAR 新 dispatch 行时预算耗尽 → deny；max 双源 policy 权威，M5-WI47 校正 3→8）+ terminal-rules R1 预算硬门（收口 partial/blocked，不得静默 completed）+ 恢复重派同 occurrence 零自增（豁免面防死锁）——「双面一个预算」（1411-3 成文）**仅在 DSH/守夜人形态成立**（M5-WI47 收窄） | `src/law-rules.mjs`、`plugin/dsh/src/supervisor/terminal-rules.ts`；`plugin/dsh/test/{law-truth-table,supervisor-terminal}.test.mjs`；plan 2026-08-25-0815-3 / 2026-08-26-1411-3 / 2026-08-26-1954-2 / 2026-08-27-2122-1 | **G7**：引擎形态无全局 audit-rounds 执法点——轮门只读 per-run 计数（`engine.js:427` 每 run 置零）从不读 roadmap frontmatter 全局计数，law 三执法面（DSH pre-execute / 守夜人 exec-arm / gate-check CLI）均不在引擎写回链（R4–R6 三轮超预算派发实证） | 判定：**部分覆盖**（DSH/守夜人面已覆盖；引擎形态缺口 = retirement-gated G7，M5-WI47） |
| 4 | 失败预算与熔断：step 级 maxRetries（transition/step 重试 → EXIT_MAP 2 `max_retries`） | plan 级 = failures.ts 三桶归因（executor-error/verification-red/claim-expired-no-output；不计清单防计数噪音）+ `applyCircuitBreaker`（≥ maxFailures → held 同写清 claim + 回执；全 held 经 R3 终态化）+ `mdcontrol.unlock` 人工处置（held→active failures 清零） | `plugin/dsh/src/supervisor/failures.ts`；`plugin/dsh/test/supervisor-failures.test.mjs`；plan 2026-08-26-1411-3 / 2026-08-26-1954-1 | step 级重试是 run 内机制（守夜人只见 plan 级归因）——随引擎留任 | 判定：**已覆盖**（plan 级熔断）；run 内 step 重试 = 引擎留任面 |
| 5 | reconcile 与孤儿回收：`run-reconcile.mjs` `reconcileStaleRuns`（stale run-state 对账）+ `reap-orphans.mjs`（startup reaper，按 run 维度判孤儿、永不误杀并行 run） | plan/claim/dispatch 域 = supervisor `recovery.ts` 恢复扫描（过期 claim 回收走既有 reclaim trigger / dispatch 无结论 resume-or-redispatch / awaitingClosure 既有 trigger 面；per-mount handled 集幂等）；DSH LiveRunRecord 内存态随进程消亡无残留 | `src/{run-reconcile,reap-orphans}.mjs`、`plugin/dsh/src/supervisor/recovery.ts`；`plugin/dsh/test/supervisor-recovery.test.mjs`（18 例）；plan 2026-08-26-1954-2 / 1954-3 | `_tmp/` run-state 孤儿文件回收仍是引擎侧职责（reap-orphans 零引擎 diff 留任） | 判定：**引擎留任面**（run-state 域）；plan/claim/dispatch 域已覆盖 |
| 6 | 子流程编排：`flows/plan-execution.json` 四步链 EXECUTE→CLOSURE_SCRIPT→CLOSURE_AUDIT→BUILD_VERIFY（`engine.js` `_executeSubflowStep`） | 机械验证+闭合链 = exec-arm mechanical-verification trigger（verify-runner 直跑 commands.* 写 `## Verification` pass 行）→ closure-audit 链式派发；**双驱动幂等**（谓词面读账本——引擎 BUILD_VERIFY 已写 pass 行则 trigger 不触发） | `plugin/dsh/src/supervisor/exec-arm.ts`、`src/verify-runner.mjs`；`plugin/dsh/test/{supervisor-trigger,supervisor-dispatch}.test.mjs`；plan 2026-08-26-1411-2 | EXECUTE 腿（plan 代码执行）= 引擎 run 领地（WI28/1411-2 裁定沿袭，execute 池化休眠）；守夜人 initial-execute 派发未接线（→ D4 裁定） | 判定：**引擎留任面**（EXECUTE 腿）；机械验证+闭合链已覆盖 |
| 7 | draft 管线：`orchestrator.js` draft 管线（draft-brief → 起草 → 结构校验） | DSH 形态 = trigger `draftPlans()` 谓词 + exec-arm `dispatchDraftPlans` + drafter 池（`agent-pool.ts` + PromptAssembler FRESH/CONTINUE 组装 + 上下文画像 top-N 取材）+ 评审独立性回流程结构（draft-from-roadmap step 4 重写 + writer-identity draft→active 需配对回执） | `plugin/dsh/src/{efficiency/{agent-pool,prompt-assembler,context-profile}.ts,supervisor/{trigger-eval,exec-arm}.ts}`；`plugin/dsh/test/{pool-lifecycle,prompt-assembly,context-profile}.test.mjs`；plan 2026-08-27-0433-2/-0433-3/2026-08-27-0558-1 | 无结构缺口（DSH 面）；CLI 独立形态 draft 仍走引擎管线（形态分工非缺口） | 判定：**已覆盖**（DSH 形态）；CLI 形态 = 引擎留任面 |
| 8 | 主流程编排与 execute 腿：`flows/mission-driver.json` 五步循环 CHECK→REVIEW_PLANS→EXECUTE_PLANS→DRAFT_PLANS→DEEP_AUDIT + deep-audit-loop | 队列/评审/审计腿 = trigger-eval 14 谓词 + 连续模式（roadmap 即队列，opt-in 门 + 终态链式沿 + 心跳兜底）+ nothing→deep-audit 派发（预算计量同写）+ R1–R4 终态收口 + run-terminal 回执 | `plugin/dsh/src/supervisor/{trigger-eval,decision-core,watchdog,terminal-rules,exec-arm}.ts`；`plugin/dsh/test/{supervisor-trigger,supervisor-continuous}.test.mjs`（43/15 例）；plan 2026-08-26-1411-2 / 1954-1 | execute 腿 = 引擎 run（→ D4）；无引擎 run 宿主的停滞由 R3/R4 捕获 blocked + 回执（诚实失败面，非缺口） | 判定：**引擎留任面**（execute 腿）；队列/评审/审计腿已覆盖 |
| 9 | 终态与退出码面：`src/exit-map.js` EXIT_MAP 现行 13 键冻结契约（M5-WI38 已增补 `partial`/`blocked` → exit 3；+ EXECUTION-PRINCIPLE §11 逐行同步纪律）；`skipped`/动态 done 词有意不映射 | DSH 形态走回执不依赖退出码（A8 尽力投递 + `mdcontrol.status` 透出 partial/blocked）；独立形态 `partial`/`blocked` 增补 = M5-WI38 独立立项**已收口**（plan 2026-08-27-1023-2：EXIT_MAP 11→13 键 + `exit-map.test.js` 13→19 例钉住 + EXECUTION-PRINCIPLE §11 同步，2026-08-27） | `src/exit-map.js`；`test/exit-map.test.js`；plan 2026-08-27-1023-2（已收口） | 无（增补经独立立项完成，终态映射纪律 03 §8 执行在案） | 判定：**引擎留任面**（冻结契约，存续期不变；增补已走 WI38 收口） |
| 10 | monitor · run-state 面：`monitor.js` HTTP/SSE + run-state.json 步产物（`_wfAppendSubflowRun` placeholder 语义）+ sysmon | DSH 形态观察 = statusFace()/`mdcontrol.status`（run/队列/terminal/continuous）+ supervisor receipt JSONL；monitor 仪表盘零改动继续使用（05 §6） | `src/monitor.js`、`plugin/dsh/src/supervisor/service.ts`；`test/monitor.test.js`、`plugin/dsh/test/mdcontrol-routes.test.mjs`；plan 2026-08-26-1411-1 | monitor 读 mission 配置未走 extends 合并（P2，roadmap Follow-up Backlog 未勾项——代码修复独立结果面，显式留后继 slice）；run-state 文件域 = 引擎 | 判定：**引擎留任面**（run-state/独立形态观察面）；DSH 观察/回执面已覆盖 |
| 11 | marker 协议：`<AI_STEP_RESULT>`/`<FLOW_VARS>` 解析（双读过渡协议；M1 后 plugin 路径仅诊断/日志面——correction-retry 反馈、postmortem 输入、monitor 可读面） | marker 不参与 status 转移与跨步传参裁决（M1-WI8 起）；`prompt-check.mjs` 结构性校验（示例值 = 合法 transition marker/markerAlias）；物理删除时机 = D7 裁定（本清单 §3） | `src/prompt-check.mjs`、`src/engine.js` marker 解析面；`test/{prompt-markers,forEach-marker-alias}.test.js`；roadmap「marker 迁移纪律」节 | 无（存续期保留是裁定结果非缺口——00 §4「marker 溶解」） | 判定：**引擎留任面**（存续期保留诊断/日志面；删除 = 退役执行期动作，→ D7） |
| 12 | L2 双后端 parity 证据：`verify-age.sh` L1（引擎套件）/L2（插件套件 + backend-parity 矩阵）/L2.5（law gates：policy schema + plan corpus + 真值表 116 例） | 证据面本身即覆盖证明——18 gates 全 enforce、真值表 116 例只增不减、corpus face（frontmatter plans 过 gate-check）在 L2.5 钉住；非运行时职责，是迁移验证基线 | `verify-age.sh`、`plugin/dsh/test/{backend-parity-matrix,law-truth-table}.test.mjs`；plan 2026-08-25-0635-1（M2-WI8）/2026-08-25-0950-3（M2-WI23） | 无（证据基础设施随仓库存续；退役执行期作为迁移验证基线复用） | 判定：**已覆盖**（证据面在库钉住） |

矩阵完整性断言（plan Phase 1 Proof）：`rg -c "判定"` ≥13（12 行 + 总判定）、`rg -c "重开触发"` ≥7（裁定三要素齐备）。

## 3. 裁定记录（累积 Deferred D1–D7）

清点自各收口 plan §Deferred But Adjudicated（0558-2/WI35 ①②、1411-2/WI26 ③、1954-1/WI28 ④⑥、1954-3/WI30 ⑤、roadmap「marker 迁移纪律」⑦）。三要素 = verdict / 理由 / 重开触发。

### D1 跨步 `--session` 续用二选一（承 2026-08-27-0558-2/WI35 Deferred ①）

- verdict：**维持 as-built 不交付**（守夜人接管独立形态派发 ∨ 引擎 threading 二选一，本轮均不选——跨步续用继续不在库）。
- 理由：live 证据三面——① execute 腿休眠现状：plan 执行仍是引擎 run 领地（WI28/1411-2 裁定沿袭，execute 池化声明休眠），引擎 run 语义内每 agent step 起新会话是 as-built 行为而非缺陷（0558-2 基线：`engine.js` 三 `_executeAgentStep` 调用点传 `null`、`lastSessionId` 唯一消费面 = correction）；② 零引擎 diff 底线：engine threading 直接违反 roadmap 核心纪律 1，且会话跨步累积改变 run 语义（超出效率层「不改契约」边界）；③ `PoolAgentsFace` 是 DSH 宿主独有事实：CLI 会话池在引擎 dispatch 面不可达，且跨 run 会话复用缺 attemptId 代际判据（陈旧上下文风险）。步内续用（correction/parse 共会话）已钉住，效率损失限于跨步 KV 缓存（0558-2 残险成文接受）。
- 重开触发：引擎退役进入执行期（守夜人/新执行后端接管独立形态派发时，会话续用随新派发面天然设计——彼时二选一自动消解为「新面内建」）∨ 独立形态 token 成本观测显示跨步 KV 损失成为主因（经 0558-2 残险面重开，需真实宿主长跑 env）。

### D2 reasoningEffort 独立形态载体（承 2026-08-27-0558-2/WI35 Deferred ②）

- verdict：**维持无载体注记**（config.js 不增字段；载体归属随退役路径一并裁定）。
- 理由：config.js 增字段 = 引擎 diff——零引擎 diff 底线存续期内不动；独立形态推理力度经 driver 默认值承载（`independentChannelOf` seam 已诚实注记 documented residual，0558-2 文字核对零 seam 编辑），属效率/组合面优化非契约缺口。
- 重开触发：引擎退役执行期（config.js 面届时随新 CLI 契约重构一并裁定载体）∨ driver 侧出现 reasoning-effort CLI 旗标且真宿主观测显示分级收益可量化。

### D3 BUILD_VERIFY prompt 步物理退役时机（承 2026-08-26-1411-2/WI26 Deferred）

- verdict：**保留至引擎退役执行期一并处置**（本轮不退役 prompt 步）。
- 理由：双驱动幂等已落地（引擎 BUILD_VERIFY 已写 pass 行则 supervisor mechanical-verification trigger 不触发——1411-2 谓词面读账本防双写），prompt 步在引擎存续期冗余但无害（零行为冲突、零成本）；物理删除 = `flows/plan-execution.json` step types 变更，属 Flow JSON 契约保护面（roadmap「零引擎 diff」纪律 + flows 契约变更需独立立项评审），不应在判定门（评估面）内夹带执行面变更。
- 重开触发：引擎退役执行期（随 flow 面整体处置）∨ 双驱动幂等面出现实际冲突案例（pass 行语义分歧/竞态双写）时提前独立立项。

### D4 守夜人 initial-execute 派发终审（承 2026-08-26-1954-1/WI28 Deferred；M4-WI33 PromptAssembler 前置已落地）

- verdict：**本轮不接线**（execute 腿裁定 = 引擎留任；接线前置条件成文，归退役执行期/后继立项）。
- 理由：PromptAssembler 前置已备（M4-WI33 `dispatchPromptFor` 四 followup 位 + `native-executor.ts` assemblyPrefix——executor prompt 供给面不再是缺口），但接线本身 = `plugin/dsh/src/` 行为变化（trigger 谓词扩 claim-missing + exec-arm 新出口 + 连续模式 execute 腿切换），需独立立项 + 真宿主长跑证据（token 观测项同族缺 env——0558-3 观测项「机制落地即收口，收益待观测」留档先例）；引擎 run 执行腿 as-built 成熟（transient/预算/reconcile/循环防护全在——本清单矩阵 #1/#2/#4/#5）；无引擎 run 宿主的停滞由 R3/R4 捕获 blocked + 回执等人（诚实失败面，1954-1 裁定沿袭）。
- 重开触发：引擎退役执行期启动（守夜人接管 execute 派发是退役的缺口前置，见 §4 G1）∨ 真实宿主连续模式长跑证据显示引擎 run 腿成为推进阻塞或成本主因（经 DSH_E2E_CONTINUOUS 同族 env 面采集）。

### D5 TTL 未到期死会话 claim 提前回收（承 2026-08-26-1954-3/WI30 Deferred）

- verdict：**不立项**（兜底已就位——维持 watch-only residual）。
- 理由：停滞指纹 + 活动信号检测器已落地（1954-3 `stagnation.ts`）——死会话无活动信号不续期（`renewClaim` 活动信号门槛）、指纹不变 N 轮（默认 10 ≈ 5 分钟墙钟）即 R4 熔断 blocked + 回执；提前杀 claim 需会话级活性语义，收益 = 省 N 轮等待（≈5 分钟），成本 = 误杀活执行（1954-3 裁定沿袭：收益/成本倒挂）。
- 重开触发：实战出现误杀案例（活执行被判停滞——检测器参数需调）∨ 滞留案例（死会话 claim 拖延超 N 轮成为 SLA 问题——提前回收立项）。

### D6 独立形态 cron 声明面（承 2026-08-26-1954-1/WI28 Deferred）

- verdict：**文档 seam 完备，不新增声明面**（cron 样例归模板产品面，不在本 mission）。
- 理由：05-usage §3.1 已列定时推进三通道（cron / launchd / GitHub Actions 定时 run）+ §3.3 跨机器恢复（OS 定时器 = 独立形态无人值守的成文承载，03 §4 opt-in「独立形态由 cron 声明」/§6「独立形态的崩溃保证不依赖常驻进程」）；本仓库是双受众仓库——`install-age.sh`/`template/` 侧 cron 样例属模板产品面（template 维护），不在本 mission（age-autonomy 设计落地）范围。
- 重开触发：模板消费者反馈 install-age.sh 需内置 cron 样例（归 template 侧立项）∨ 引擎退役执行期守夜人独立 CLI 立项时（届时定时声明面随新 CLI 入口一并设计）。

### D7 marker 物理删除时机（roadmap「marker 迁移纪律」明文归 M5）

- verdict：**存续期保留（诊断/日志面）；物理删除 = 引擎退役执行期动作**（与退役判定联动——本判定门给出路径，不执行删除）。
- 理由：M1 后 plugin 路径 marker 仅诊断/日志面（correction-retry 反馈、Reflexion postmortem 输入、monitor 人类可读面——roadmap「marker 迁移纪律」），不参与 status 转移与跨步传参裁决，保留零契约危害；引擎双读过渡协议依赖 marker 解析（引擎在 = marker 在——00 §4「marker 溶解」：存续期保留、退役后删除）；物理删除需 prompt 模板/`prompt-check.mjs` 校验面/engine 解析面/monitor 可读面四点协同 = 退役执行期工程，非判定门动作。
- 重开触发：引擎退役执行期启动（判定门结论为「可退役/条件退役」且后继执行立项落地时）——届时按 00 §4「退役后删除」执行，四点协同面同步处置。

## 4. 总判定（引擎留任主后端——条件退役）

**结论：引擎留任主后端（条件退役）。** 门禁 + 守夜人已覆盖**账本域职责**（其中审计预算为**部分覆盖**——law/守夜人执法面在册，引擎形态无全局 audit-rounds 执法点 → G7（M5-WI47 收窄）；失败熔断/崩溃恢复/连续队列/终态规则/评审审计派发——矩阵 #3/#4/#5/#7/#8 判定腿）；但引擎仍独占承载：run 内执行语义面（transient 退避/max* 循环防护/step 重试——#1/#2/#4 run 内腿）、execute 腿编排（#6/#8）、run-state/monitor 域（#5 引擎侧/#10）、冻结契约（#9 EXIT_MAP）与双读协议（#11 marker）。00 §3「引擎定位」成文沿袭：初期主后端、可替换实现——**「可替换」的证据面已齐（本矩阵），替换的执行面未开始（退役执行期）**。

### 缺口前置清单（退役执行期前置——每缺口一行指针：缺口描述 → 补齐路径 → 归属）

| # | 缺口描述 | 补齐路径 | 归属 |
| --- | --- | --- | --- |
| G1 | execute 腿守夜人接管（initial-execute 派发接线——D4 裁定前置） | 独立立项（`plugin/dsh/src/` 行为变化：trigger 谓词扩 claim-missing + exec-arm 新出口）+ 真宿主长跑证据 | 退役执行期 / 后继 mission |
| G2 | 独立形态执行后端替代面（transient 分类、run 内循环防护、reconcile/run-state 孤儿回收的非引擎承载——D1 联动） | 退役执行期设计立项（新后端承接 run 语义或证明账本域兜底充分） | 退役执行期 / 后继 mission |
| G3 | EXIT_MAP `partial`/`blocked` 显式增补（独立形态终态退出码——03 §8 终态映射纪律） | M5-WI38 独立立项**已收口**（plan 2026-08-27-1023-2：EXIT_MAP 13 键 + `exit-map.test.js` 19 例 + EXECUTION-PRINCIPLE §11 同步，2026-08-27） | 已闭合（1023-2 收口） |
| G4 | 跨步会话续用交付（D1 重开后随新派发面设计） | D1 重开触发满足时（退役执行期 ∨ token 观测主因）随新派发面天然内建 | 退役执行期 / 后继 mission |
| G5 | marker 物理删除（D7——prompt 模板/prompt-check/engine 解析/monitor 四点协同） | 退役执行期动作（引擎退役后按 00 §4「退役后删除」执行） | 退役执行期 |
| G6 | monitor extends 合并 P2（读 mission 配置未走 base→local→mission 合并——模板消费者面 latent） | 代码修复独立 slice（roadmap Follow-up Backlog 未勾项，与本判定门正交） | roadmap Follow-up Backlog |
| G7 | 引擎形态全局审计预算执法点缺失（轮门只读 per-run 计数、law 三执法面不在引擎写回链——R4–R6 超发实证，M5-WI47 立案；policy 预算已校正 3→8 + 双域语义成文，执法缺口本身仍在） | 引擎读全局账本归退役执行期 / 独立形态后端替代立项（G2 同族；route ① 引擎轮门播种/校验全局 audit-rounds 因零引擎 diff 底线否决——2122-1 Phase 1 Decision） | 退役执行期 / 后继 mission |

判定门结论对 M5 收口的含义：WI37 判定门交付即本清单（评估面完成）；退役本身**不在本 mission 执行**（WI39 消费本清单收口 owner-doc 条目；引擎物理退役 = 后继 mission 按缺口前置清单立项）。
