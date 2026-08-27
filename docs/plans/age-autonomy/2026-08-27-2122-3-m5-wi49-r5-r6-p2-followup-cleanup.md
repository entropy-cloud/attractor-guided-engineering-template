---
status: active
mission: age-autonomy-implementation
work-item: M5-WI49
group: "2026-08-27-2122"
verify: [test]
---

# 2026-08-27-2122-3 M5-WI49 R4/R5/R6 P2 Follow-up 一站式清偿：monitor/engine/CLI/prompt/doc 五族 P2 集中收口

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` Follow-up Backlog 15 项未勾 P2(R4:4 + R5:4 + R6:7;扣除已被 WI47 plan 顺手清偿的 R5「CONTEXT.md『:7 先例』事实错误」一条 = 14 项); WI47 (2122-1) 修法已含一条 R5 P2,余 14 项同族集中收口
> Related: 2026-08-27-2122-1 (WI47 同组预算面 + 06 G 机制)、2026-08-27-2122-2 (WI48 同组终态真值面 + 06 G8)、2026-08-27-1023-3 (WI39 owner-doc 清点矩阵,本 plan 是该矩阵未覆盖的散点尾盘清偿)、2026-08-27-1503-1 (WI45+WI46 同型 dead-prompts-keys / WI46 误删面守卫先例)

## Current Baseline

15 项未勾 P2 Follow-up(R4 回执 + R5 回执 + R6 回执同型残面)。`:7 先例` P2 已被 WI47 plan Phase 1 第 5 项吸收,本 plan 清偿余 14 项(12 项直接修复 + 2 项 Phase 2 备选 B 路径 watch-only residual 勾选注记);按修复族归并为 6 个 Phase(5 修复族 + Phase 6 roadmap 回写;同族同 Phase,跨族跨 Phase):

**A. monitor 健壮性(R4 三项 + R6 一项,共 4 项)**
- R4 `handleStartRun` `mkdirSync` 先于 targets 校验(`monitor.js:1186-1187`,targets 非法 → 400 但残留空 `_tmp/<ts>-mission-driver` ghost run 目录,被 `listMissionRunDirs` 收录,synthesizeFromEvents 零事件 → status unknown 永驻)
- R4 monitor.js 三处裸 `readFileSync` 无 try/catch(`handleGetLog.sliceFile` :617、`serveStaticFile` :165、`serveIndex` :173-178;同文件其余 fs 读全部有守卫,仅此三处裸读;并发 `DELETE /api/runs/:runId` 删除日志文件 → readdir/statSync 与读取之间 throw → monitor 进程整体崩溃,引擎形态下与 run 同进程殃及 mission)
- R6 `cmdListSteps` 经 `resolveConfig` 继承 mission 分支 `mkdirSync(runDir)`(`config.js:817-820`),只读 CLI 面每次 list-steps 在 `_tmp/` 落空 `<ts>-mission-driver` 目录(2026-08-27 实测复现 `_tmp/2026-08-27-211031-mission-driver`,与 R4 handleStartRun 同族不同入口)

**B. engine.js 健壮性(R6 两项)**
- R6 `_shouldCompleteOnAuditQuota`(`engine.js:728-749`,调用点 :2154)与主循环 `when` 求值(`engine.js:1755` `_evaluateCondition` → evaluateExpression)两处裸调 `_scanPlansByStatus`/`activePlans()`/`openAudits()`/`when` 求值——`_scanPlansByStatus`(`flow-loader.js:71-104`)逐文件 `readFileSync` 无 per-file 守卫,文件在 readdir 与读取之间被删即 throw;与 `_reconcileTerminal`(`engine.js:684-714`)的 try/catch 不对称
- R6 tool-step `timeout` 字段死配置:`_executeToolStep`(`engine.js:1010`)解析 `stepDef.timeout` 传 `{ timeout }` → ProcessExecutor.executeTool → `runner.runTool`(`runner.js:274-292`)签名收 opts 但函数体从不转发 `timeoutMs`(executor.execute 也只读 `opts.timeoutMs` 不读 `timeout`);tool 步骤声明超时无任何效果(60min 默认兜底;现库三份 flow 零 tool 步骤,纯 latent 契约缺口)

**C. CLI 校验器管道截断(R6 一项)**
- R6 `console.log` + `process.exit` 模式在 stdout 为管道时截断:`roadmap-check.mjs:188-189` / `plan-check.mjs:267-268` / `gate-check.mjs`(:128/:133/:154/:279/:322/:340/:353/:358/:369) / `mission-check.mjs` 同型 pattern——大 payload(本 roadmap 现产 93,987B JSON)管道投递恰 65,536B(64KB pipe buffer,`process.exit` 不待 stream flush);exit code 不受影响(pre-commit/verify-age 判定面安全),但 JSON stdout 消费面破断

**D. prompt 措辞退役(R6 两项)**
- R6 `prompts/multi-audit.md:23` + `prompts/open-audit.md:23`「still readable by the engine's legacy channel」——「engine's legacy channel」自 M2-WI22(`plan 2026-08-25-0950-2`)退役 legacy 外部审计通道后不复存在(flow-loader `openAudits` 键已删,engine 消费面 optional-chain 恒 `[]`,`docs/audits/` 纯散文史);WI22 文档同步覆盖了 flow-design/CONTEXT/packaging 但漏掉两份 live 审计 prompt 正文
- R6 `prompts/draft-from-roadmap.md:40`「Legacy `docs/audits/` files with `> Audit Status: open` (pre-migration archives) are consumed by the DRAFT_FROM_AUDIT path」——DRAFT_FROM_AUDIT 路径已随 M2-WI22 整体删除(`prompts/draft-from-audit.md` 已删、deep-audit-loop 无该步),该句断言一个不存在的消费方

**E. 文档/mission config 残面(R5 三项 + R6 一项)**
- R5 `docs/architecture/mission-driver-baseline.md:120` 仍列举 `src/flow-loader.js` 的 `_scanOpenAuditsList` / `_isMissionLevelAudit`——M2-WI22 已删,flow-loader.js 现存导出仅 `SCRIPT_REGISTRY`(:228/:329)
- R5 `docs/architecture/dsh-plugin-packaging.md:348` §Build bundling import-graph 导语自我声明登记债未清偿:「the law-kernel dependency edges added by the age-autonomy M2 `2026-08-25-0815` batch are not yet enumerated here」——0815 批次已收口,M5-WI39 42 行清点未覆盖本债注记,law 四模块(law-core/law-policy/law-rules/verify-runner)的 import 边至今未枚举(现实况由 build-bundle closure 门机械守护)
- R5 `missions/age-autonomy-implementation.json:12-16` 的 `audits` map(multi/open/closure 三键 → `docs/skills/*`)全仓零消费面——grep `tools/mission-driver/src` + `plugin/dsh/{src,scripts}` 无任何 `mission.audits` 读点,与 R3/WI46 dead prompts-map 7 键同型
- R6 `docs/architecture/module-boundaries.md:10` 写「`tools/mission-driver/src/{config,mission-check,plan-check,roadmap-check,secret-resolver,env-loader}.mjs`」——六模块中三个实为 `.js`(config.js / secret-resolver.js / env-loader.js),按文档字面拼路径将 ENOENT
- (R4 `checkRoadmapUniqueness` `mission-check.mjs:158` 按 raw JSON 扫 `roadmapPath`——经 `extends` 从 base 继承 roadmapPath 的 mission 不在自身 raw 文件携带该键,绕过 one-mission-one-roadmap 唯一性检查;与 M5-WI40 已修的 monitor extends 合并缺口同根形态;当前 base.json 无 roadmapPath 故 latent,模板消费者面可触)

**排除(已被其他 plan 覆盖)**:
- R5「CONTEXT.md `maxAuditRounds :7` 先例事实错误」——WI47 plan Phase 1 第 5 项顺手清偿,本 plan 不重做
- R4「CONTEXT.md runner.js 抑制 `--dangerously-skip-permissions`」+「checkCmd 经 `main.js delegates.vars` 注入」+「monitor.js 头注『Provides 6 REST endpoints』」——三连文档行级漂移已由 M5-WI39(plan `2026-08-27-1023-3`)§三站点 42 行清点矩阵复核准确零编辑(确认实情成立,本 plan 复核非新事实,跳过)

**验证基线(R6 复核在案)**:引擎 969/969、插件 420/0、真值表 116/0、`./verify-age.sh` L1+L2+L2.5 GREEN、mission-check/roadmap-check/gate-check exit 0。
**roadmap 计数域**:列 0 未勾本 plan 落地后归 0(WI47+WI48 同组勾选 + WI49 本 plan 勾选 = 3→0)。Follow-up 缩进行(15 项未勾)不在列 0 计数域:WI47 plan 清偿 1 项(`:7 先例`)+ 本 plan Phase 6 清偿余 14 项(勾选 + 指针注记),清偿后 `rg -c '^  - \[ \]'` → 0。
**P8 例外**:本 plan 实际触及的 P8 `law-self-protection` 字面集成员 = `tools/mission-driver/src/{plan-check,gate-check}.mjs`(Phase 3 targets);本 plan active 后对二者的写通道 = 已批准立项(WI21 先例沿袭:active plan 正文引用即合法例外,policy 头注 :4-6「changes only through a plan's Add item / approved-project」自证)。其余 targets(monitor/config/engine/runner/mission-check.mjs/roadmap-check.mjs/prompts/docs/missions json)不在 P8 字面集,常规写通道;`missions/autonomy.policy.yml` 与 `plugin/dsh/src/law/**` 本 plan 零触碰。
**双副本纪律**:`tools/mission-driver/src/law-*.mjs` 经 `pnpm --prefix plugin/dsh run build` 同步 `plugin/dsh/assets/src/`,本 plan 不涉及 law 模块故 freshness 同步非必须但保留收口判据。
**零引擎 diff 底线**:engine.js B 项两子项属 engine.js/runner.js 改动——Phase 2 第 1 子项(`_shouldCompleteOnAuditQuota`/`when` 求值 try 守卫)与第 2 子项(`timeout` 字段死参数)均破零引擎 diff 底线,需裁定。本 plan 默认走备选 B(零引擎 diff 底线优先;详见 Phase 2 Decision),Phase 2 两子项整体转 watch-only residual,其他 Phase 不受影响。

## Goals

- Phase 1:monitor 健壮性 4 项收口——`handleStartRun` 校验前置 + 三处裸 `readFileSync` 加 try/catch + `cmdListSteps` 免 mkdir 轻量配置面
- Phase 2:engine.js 健壮性 2 项按"非引擎 diff 路径"裁定收口(默认备选 B:`_reconcileTerminal` 对称 try 守卫 + `runner.runTool` 转发 `timeoutMs` 归 06 G 缺口 watch-only residual;显式选 A 则落地代码)
- Phase 3:CLI 校验器管道截断修复——`process.exit` → `process.exitCode` 赋值 + `await` flush
- Phase 4:prompt 措辞退役 2 项——multi-audit/open-audit 的「legacy channel」删去 + draft-from-roadmap 的「DRAFT_FROM_AUDIT」改为「no longer consumed」
- Phase 5:文档/mission config 残面 5 项——baseline.md:120 仅列 SCRIPT_REGISTRY + packaging.md:348 改「由 ALLOWED_MODULES + closure 门机械守护」+ mission `audits` map 删除 + module-boundaries.md:10 真实扩展名 + `checkRoadmapUniqueness` 改经 `loadMission` 合并读
- roadmap Follow-up Backlog 14 项 P2 全数清偿(`[x]` + 指针本 plan;12 修复 + 2 watch-only residual 注记)+ 列 0 未勾 grep → 0;`docs/logs/2026/` 当日 dev log updated

## Non-Goals

- 不动 WI47 (2122-1) / WI48 (2122-2) 任何工件——同组计划已独立收口
- 不处理 R4 三连文档行级漂移(已被 M5-WI39 §42 行清点矩阵复核,确认实情,本 plan 不重做)
- 不处理 R5「CONTEXT.md `:7` 先例事实错误」(已被 WI47 plan 吸收)
- 不清偿 R4/R5/R6 期间新增的 P0/P1(目前无;若 audit R7 立案新 P1,本 plan 不接收)
- 不裁定 mission 完成态
- 不引入新 npm 依赖

## Task Route

- Type: `implementation-only change`(杂项残面清扫,跨文件多面修复,共享"audit 残面收口"单一交付面)
- Owner Docs: `tools/mission-driver/src/{monitor,config,engine,runner,mission-check}.js`、`tools/mission-driver/prompts/{multi-audit,open-audit,draft-from-roadmap}.md`、`docs/architecture/{mission-driver-baseline,dsh-plugin-packaging,module-boundaries}.md`、`missions/age-autonomy-implementation.json`
- Skill Selection Basis: 无匹配 skill——跨族杂项清扫按现状机械修复,非审计/设计/审查方法;Skill: none(逐 Phase 标注)

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline
- Phase 2 两子项涉及 engine.js/runner.js 改动,执行前必须完成 Phase 2 Decision 裁定(age-autonomy 全程零引擎 diff 底线默认优先 = 备选 B;若 user/subagent 显式选 A 方可落地代码改动)

## Phase 1 — monitor 健壮性 4 项收口

Targets: `tools/mission-driver/src/monitor.js`(:165, :173, :617, :1186 附近)、`tools/mission-driver/src/config.js`(:817-820)、`tools/mission-driver/test/monitor.test.js`(扩测试)
Skill: none

- Item Types: `Fix | Add | Proof`
- Prereqs: 无

- [x] Fix: `monitor.js` `handleStartRun` 调序重排——targets 校验(`body.targets` 类型检查 + 每项 `key`/`scenario` 校验)移至 `mkdirSync(runDir)` 之前;先校验后建目录(若 400 → 无副作用残留,回归当前 ghost run 路径)
- [x] Fix: `monitor.js` 三处裸 `readFileSync` 加 try/catch → 返回 404:
   - `sliceFile` (:617) try/catch → `{notFound: true}` 透传至 `handleGetLog` 返回 404
   - `serveStaticFile` (:165) try/catch → `sendJson(res, 404, {error: "not found"})`
   - `serveIndex` (:173) try/catch → 同上
- [x] Fix: `config.js` `resolveConfig` mission 分支 `mkdirSync(runDir)` 延迟至 `cmdRunMission`(main.js 调用点)——list-steps 走免 mkdir 的轻量配置面(仅读 missions 配置,不创建 run 目录)(落点注记:mkdir 单点落在 orchestrateRun 入口 = main.js cmdRunMission 与 plugin engine-bridge 共享的 run 调用点,双路径同保 runDir 创建,list-steps/analyze/draft 只读面零残留)
- [x] Add: `test/monitor.test.js` 扩 4 例:
   - handleStartRun 非法 targets → 400 且 `_tmp/` 不增 ghost runDir(回归本族缺陷)
   - handleGetLog 并发删除日志文件 → 404 不崩 monitor
   - serveStaticFile / serveIndex 文件不存在 / 并发删 → 404
   - list-steps 命令运行后 `_tmp/` 不增空目录
- [x] Proof: `pnpm --prefix tools/mission-driver test` 0 失败(相对 969 基线 +4 例只增不减)+ `node --test tools/mission-driver/test/monitor.test.js` exit 0(实测 973→977/0,monitor.test.js 98/0 exit 0)

Exit Criteria:

- [x] monitor.js 三处 try/catch + handleStartRun 调序 + config.js mkdir 延迟三面在库;test/monitor.test.js +4 例全绿
- [x] `git diff --stat tools/mission-driver/src/engine.js` 为空(本 Phase 不碰 engine.js)+ 零新增 npm 依赖
- [x] `docs/logs/2026/` 当日 dev log updated(以实际执行日为准)(2026-08-28 `docs/logs/2026/08-28.md` WI49 收口条目在册)

## Phase 2 — engine.js 健壮性 2 项(非引擎 diff 路径裁定)

Targets: `tools/mission-driver/src/engine.js`(:728-749/:1755 守卫)、`tools/mission-driver/src/runner.js`(:274-292)
Skill: none

- Item Types: `Decision | Fix | Add | Proof`
- Prereqs: Phase 1(若 Phase 1 失败 Phase 2 不阻塞,可独立推进);Decision 裁定先于代码

- [x] Decision:engine.js/runner.js 改动走"非引擎 diff 路径"裁定——两子项均属 fail-open 健壮性修补(求值失败 = 条件不成立/不短路/不转发,语义与 `_reconcileTerminal` 对称 try/catch 同族)而非语义变更,与"零引擎 diff"底线的边界由本 Decision 项裁定:
   - 备选 A:接受 engine.js/runner.js 改动(`try` 守卫 + `runner.runTool` 转发 timeoutMs),承认 age-autonomy 路线"零语义 diff,容许 fail-open 修补"——破 R3–R6 每轮回执核验的"engine.js 零 diff"硬底线
   - 备选 B:拒绝 engine.js/runner.js 改动,两子项整体退出为 Deferred(归 06 G 缺口机制,retirement-gated,G8 同族)— roadmap Follow-up 对应两行勾选并追加 watch-only residual 注记(指针 06 G 缺口 + 本 plan `## Deferred But Adjudicated` 裁定)
   - 默认走备选 B(零引擎 diff 底线优先);若 user/subagent 在执行前显式选 A 则按 A 落地
   - **裁定记录(2026-08-28 执行期):走备选 B——执行指令未显式选 A,plan 默认生效;零引擎 diff 底线优先**
- [x] Fix:按裁定落地(两分支均完成本项)——选 A:`engine.js` `_shouldCompleteOnAuditQuota`(:733-734)与 `_evaluateCondition`(:1755)两处补 try/catch(fail-open 语义与 `_reconcileTerminal` 对齐:求值失败 = 条件不成立/不走短路)+ `runner.js` `runTool`(:285)转发 `{timeoutMs: opts.timeout}` 至 executeFn;选 B:零代码改动,roadmap Follow-up 两行(engine try 守卫 / tool timeout 死参数)尾部追加 watch-only residual 注记(B 落地:零代码改动,两行注记已入库含指针本 plan `## Deferred But Adjudicated`)
- [x] Add:按裁定落地——选 A:`tools/mission-driver/test/engine.test.js` +2 例(`_shouldCompleteOnAuditQuota` 异常注入 → 走 continue 不短路 / `runTool` 转发 timeoutMs);选 B:无新测试,确认 roadmap Follow-up 两行注记在库(含指针本 plan `## Deferred But Adjudicated` 对应条目)(B 落地:两行注记在库已核对)
- [x] Proof:按裁定落地——选 A:`pnpm --prefix tools/mission-driver test` 0 失败(相对基线 +2 例)+ `git diff --stat tools/mission-driver/src/engine.js tools/mission-driver/src/runner.js` 仅本 Phase 文件 + 零新增依赖;选 B:`git diff --stat tools/mission-driver/src/engine.js tools/mission-driver/src/runner.js` 为空 + roadmap Follow-up 两行 watch-only residual 注记在库(B 落地:实测 diff 为空 + 注记在库 + roadmap-check exit 0)

Exit Criteria:

- [x] Decision 落地(备选 A 或 B 二选一,B 路径两子项转 watch-only residual)(裁定 = B)
- [x] ~~备选 A 路径:`engine.js`+`runner.js` 改动在库 + test +2 例绿 + 零引擎行为变更(fail-open 与 `_reconcileTerminal` 对称)~~(N/A——裁定走 B,A 分支未启用;勾选 = 分支裁定的忠实记录非虚假完成)
- [x] 备选 B 路径:Phase 2 两子项对应 Follow-up 行勾选 + watch-only residual 注记在库(06 G 缺口机制),本 plan 其他 Phase 不受影响(注记已入库;两行勾选随 Phase 6 回写批量落地,Phase 6 完成即闭合)

## Phase 3 — CLI 校验器管道截断修复

Targets: `tools/mission-driver/src/{roadmap-check,plan-check,gate-check,mission-check}.mjs`
Skill: none

- Item Types: `Fix | Add | Proof`
- Prereqs: 无

- [x] Fix: 四个 CLI 校验器将 `console.log(JSON.stringify(...)); process.exit(...)` 改为 `console.log(JSON.stringify(...)); process.exitCode = ...`(让事件循环自然排空 stream);具体位置:
   - `roadmap-check.mjs:188-189`(main 出口)
   - `plan-check.mjs:267-268`(main 出口)
   - `gate-check.mjs:128-129, :132-133, :136-154, :279-280, :322-340, :353-354, :358-369`(七处)(注:同型 stdout+exit 全位点一并收口——另含 runVerifyMode 成功出口 :434 与 runLawMode 五处 :458/:474/:504/:513/:529/:627,均改 exitCode 赋值 + return;usage()/console.error stderr 面按本 plan Deferred 裁定不动)
   - `mission-check.mjs`(main 出口 + 错误分支同型)(复核:其成功出口本就无 `process.exit`(console.log 后自然排空),stdout JSON 面零截断风险,零改动即达标;错误分支均为 console.error stderr 面按 Deferred 不动)
- [x] Add: `tools/mission-driver/test/cli-pipe-truncation.test.js`(新文件,5 例):
   - 仿真 stdout 为 pipe(非 TTY),roadmap-check 对大 payload(本 roadmap 现 93,987B)→ 接收端完整读取到 JSON 末尾(`JSON.parse` 成功)
   - 同 plan-check / gate-check / mission-check 仿真三例
   - exit code 仍正确(passed/failed)
- [x] Proof: `pnpm --prefix tools/mission-driver test` 0 失败(相对基线 +5 例只增不减)+ `node tools/mission-driver/src/roadmap-check.mjs docs/backlog/age-autonomy-implementation-roadmap.md | wc -c` → 期望 ≥ 93,987(管道投递完整)+ `roadmap-check` exit code 仍正确(实测:套件 977→982/0;管道实测 97,819B(Phase 2 注记后现产)= 文件重定向字节数逐字节一致 + JSON.parse OK + exit 0;失败面 exit 1 由测试用例 5 钉住)

Exit Criteria:

- [x] 四 CLI 校验器 `process.exitCode =` 替换在库 + test/cli-pipe-truncation +5 例全绿
- [x] 管道投递完整实测 + exit code 行为不变
- [x] 零新增 npm 依赖

## Phase 4 — prompt 措辞退役 2 项

Targets: `tools/mission-driver/prompts/{multi-audit,open-audit,draft-from-roadmap}.md`
Skill: none

- Item Types: `Fix | Add | Proof`
- Prereqs: 无

- [x] Fix: `multi-audit.md:23` + `open-audit.md:23`「(still readable by the engine's legacy channel)」括号从句删去(保留主句「reserved for pre-migration legacy archives」);成文「M2-WI22 退役 legacy 外部审计通道后该位置纯散文史,无引擎消费面」改写为提示语(落地:括注改「prose-only history since the legacy audit channel was retired in M2-WI22; no engine consumer」)
- [x] Fix: `draft-from-roadmap.md:40`「are consumed by the DRAFT_FROM_AUDIT path, not by you」改为「are no longer consumed by any path」(DRAFT_FROM_AUDIT 已随 M2-WI22 删除,`docs/audits/` 现为纯散文史,WI22 已清点 6 命中/1 open/5 planned 全部机械关闭)
- [x] Proof: `pnpm --prefix tools/mission-driver run lint:prompts` OK(措辞改不破 prompt 格式)+ `grep -rn 'legacy channel\|DRAFT_FROM_AUDIT' tools/mission-driver/prompts/` 零命中(除本 plan 内文引用)(实测 OK + rg 零命中;prompts 资产副本经 `pnpm --prefix plugin/dsh run build` 同步 42 文件 freshness ok,插件套件 423/423)

Exit Criteria:

- [x] 三份 prompt 措辞改写在库 + lint:prompts OK + grep 零命中
- [x] 零代码 diff

## Phase 5 — 文档/mission config 残面 5 项

Targets: `docs/architecture/mission-driver-baseline.md:120`、`docs/architecture/dsh-plugin-packaging.md:348`、`docs/architecture/module-boundaries.md:10`、`tools/mission-driver/src/mission-check.mjs:158`、`missions/age-autonomy-implementation.json:12-16`
Skill: none

- Item Types: `Fix | Add | Proof`
- Prereqs: 无

- [x] Fix: `mission-driver-baseline.md:120`「`_scanOpenAuditsList`, `_isMissionLevelAudit`, plus the `SCRIPT_REGISTRY` constant」→「the `SCRIPT_REGISTRY` constant」(M2-WI22 已删前两者;按文档字面 import 将 ENOENT)(落地:仅列 `SCRIPT_REGISTRY` + 退役史括注不带原 token,保 grep 零命中)
- [x] Fix: `dsh-plugin-packaging.md:348`「the law-kernel dependency edges added by the age-autonomy M2 `2026-08-25-0815` batch are not yet enumerated here — that registration belongs to that batch's own doc sync」改为「law-kernel dependency edges are guarded mechanically by `ALLOWED_MODULES` (build-bundle closure gate; see `scripts/build-bundle.mjs`); no per-batch doc enumeration required」(承认由工具面守护,免除债注记)
- [x] Fix: `module-boundaries.md:10` Mission config layer 行扩展名校正:`tools/mission-driver/src/{config,mission-check,plan-check,roadmap-check,secret-resolver,env-loader}.mjs` → 标注真实扩展名:`{config.js,mission-check.mjs,plan-check.mjs,roadmap-check.mjs,secret-resolver.js,env-loader.js}`(.js 与 .mjs 混居,行内注记说明)
- [x] Fix: `mission-check.mjs:158` `checkRoadmapUniqueness` 改经 `loadMission` 合并读——对 `raw` 套 `extends` 解析(复用 `mission-check.mjs` `loadMission`(若在库;否则抽到 `config.js` 既有 `loadMission`),获取 merged `roadmapPath` 后再入 claims map;raw JSON 解析失败 → 现行 malformed 路径不变;本仓库 base.json 无 roadmapPath 故 latent,测试通过 fixture 注入 base-with-roadmapPath 模拟 extends 继承场景)(注:不传 projectRoot——存在性校验非本面职责,不可验证配置仍零 claim;插件真值表 boundary 用例 fixture 补 commands.test 使 claimant 为合法 mission,冲突检测语义保持)
- [x] Fix: `missions/age-autonomy-implementation.json:12-16` `audits` map(multi/open/closure 三键)整段删除——零消费面,与 R3/WI46 dead prompts-map 7 键同型误导性配置残面;删除后 mission-check/roadmap-check/plan-check/gate-check 全绿(无 mission 字段读点)
- [x] Add: `tools/mission-driver/test/mission-check.test.js` 扩 2 例:(落地于既有 `test/mission-check-cli.test.js`,同面沿用 CLI/unit 混排先例)
   - base.json 含 roadmapPath + 子 mission extends 不携 → checkRoadmapUniqueness 经合并后能识别该 mission 的 roadmap 路径(回归本族缺陷)
   - `missions/age-autonomy-implementation.json` 删除 audits 字段后 mission-check exit 0 + 字段 schema 校验通过(附 live prompts map 键域 = {multiAudit, openAudit} 存活钉)
- [x] Proof: `node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0(audits map 删除后 schema 校验仍绿)+ `pnpm --prefix tools/mission-driver test` 0 失败(相对基线 +2 例只增不减)+ `grep -rn '_scanOpenAuditsList\|_isMissionLevelAudit' docs/` 零命中(回归文档 row 已修)(实测:mission-check exit 0 + 套件 982→984/0 + 插件 423/423(真值表 boundary 用例随 merged 读写法同步);grep 域 = owner docs(docs/architecture/ + docs/design/)零命中——全 docs/ 的残命中均为 logs/plans/audits/requirements/backlog 历史记录引文,append-only 史料不可清洗,owner-doc 面为零即回归成立)

Exit Criteria:

- [x] 五处文档/config 修正在库 + mission-check.test.js +2 例全绿
- [x] `git diff --stat tools/mission-driver/src/engine.js` 为空(本 Phase 不碰 engine.js)+ 零新增 npm 依赖

## Phase 6 — roadmap 回写与证明

Targets: `docs/backlog/age-autonomy-implementation-roadmap.md`(WI49 行 + Follow-up 14 项 P2 清偿 + `> Last Updated` 头)、`docs/logs/2026/` 当日 dev log
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1/3/4/5 全勾 + Phase 2 Decision 及对应分支项完成(无论选 A 或 B,Phase 2 各项勾选后不阻塞)

- [x] Add: Follow-up Backlog 14 项 P2 全部清偿(15 项未勾扣除 WI47 plan 清偿的「:7 先例」一条):`[ ]`→`[x]` + 已清偿注记(指针本 plan Phase N 子项 M,沿袭 :190 已勾先例形态):
   - R4 `checkRoadmapUniqueness` raw 解析漏 extends → 本 plan Phase 5 子项 4
   - R4 monitor.js `handleStartRun` mkdir 残留 → 本 plan Phase 1 子项 1
   - R4 monitor.js 三处裸 readFileSync → 本 plan Phase 1 子项 2
   - R4 文档行级漂移三连(已由 M5-WI39 复核准确;勾选 + 指针注记指向 WI39 清点矩阵即清偿,无代码动作)
   - R5 baseline.md:120 test-seams 漂移 → 本 plan Phase 5 子项 1
   - R5 packaging.md:348 law 边登记债 → 本 plan Phase 5 子项 2
   - R5 missions json `audits` map dead keys → 本 plan Phase 5 子项 5
   - R6 ghost run 目录(list-steps) → 本 plan Phase 1 子项 3
   - R6 prompts/{multi,open}-audit.md legacy channel 措辞 → 本 plan Phase 4 子项 1
   - R6 prompts/draft-from-roadmap.md DRAFT_FROM_AUDIT 措辞 → 本 plan Phase 4 子项 2
   - R6 engine.js try 守卫 + tool timeout 死参数 → 本 plan Phase 2 裁定(默认备选 B → 勾选 + watch-only residual 注记;若显式选 A → 代码修复 + 注记 Phase 2)(裁定 = B,两行注记在库)
   - R6 module-boundaries.md:10 扩展名漂移 → 本 plan Phase 5 子项 3
   - R6 CLI 管道截断 → 本 plan Phase 3(Follow-up 行在册且已注记「已立项 WI49 plan 收口」,勾选 + 指针 Phase 3)
- [x] Add: roadmap M5 块 WI49 行(在册未勾)`[ ]`→`[x]` + 行内证据追加(Phase 1–6 全勾 + 验证结果 + 指针本 plan);`> Last Updated` 头同步本批事实
- [x] Add: `docs/logs/2026/` 当日 dev log 条目(裁定摘要 + Phase 1/3/4/5 验证结果 + Phase 2 决策记录 + Phase 6 回写证据)
- [x] Proof: 勾选后 `grep -c "^- \[ \]" docs/backlog/age-autonomy-implementation-roadmap.md` → **0** 实测(WI47+WI48+WI49 三勾后列 0 计数域复归零)+ `rg -c '^  - \[ \]' docs/backlog/age-autonomy-implementation-roadmap.md` → 0(Follow-up 缩进域:本 plan 14 项 + WI47 plan 1 项全清偿;若同组 WI47 plan 尚未回写则瞬时余 1,该项归 WI47 plan 非本 plan 阻塞面,注记即可)+ `node tools/mission-driver/src/roadmap-check.mjs docs/backlog/age-autonomy-implementation-roadmap.md` exit 0(实测:列 0 grep = 0 + 缩进域 rg = 0 + roadmap-check exit 0)

Exit Criteria:

- [x] WI49 `[x]` + 行内证据 + Follow-up Backlog 14 项 P2 清偿在册 + Last Updated 同步
- [x] `docs/logs/2026/` 当日 dev log updated
- [x] 勾选后列 0 grep → 0 + Follow-up 缩进 grep → 0 实测 + roadmap-check exit 0

## Draft Review Record

- dispatch review #review-2026-08-27-220026-mission-driver-2026-08-27-2122-3-m5-wi49-r5-r6-p2-followup-cleanup-1-3fa7c29e to ses_reviewer_2122_3
- 2026-08-28：iteration 1，共识 acceptable-after-fixes #review-2026-08-27-220026-mission-driver-2026-08-27-2122-3-m5-wi49-r5-r6-p2-followup-cleanup-1-3fa7c29e

## Verification

- pass test 2026-08-27-220026-mission-driver basisHash=a00a18aa30720c64f68876597b49992e5e050adc00ca6a288efd6f35a126bda8 exit=0

## Closure

- dispatch audit #audit-2026-08-27-220026-mission-driver-2026-08-27-2122-3-m5-wi49-r5-r6-p2-followup-cleanup-1-eb4caef9 to ses_auditor_2026-08-27-220026 models={exec:zhipuai/glm-5.2,aud:zhipuai/glm-5.2}
- accepted #audit-2026-08-27-220026-mission-driver-2026-08-27-2122-3-m5-wi49-r5-r6-p2-followup-cleanup-1-eb4caef9：独立收口审计（ses_auditor_2026-08-27-220026，单模型部署 lineage 声明 = policy 02 §4.9 downgrade: single-model）通过——42/42 计数域全勾与 live 工作区逐项对账：① Phase 1 monitor.js handleStartRun targets 校验前置 mkdirSync（:1204-1226）+ sliceFile/serveStaticFile/serveIndex 三处 TOCTOU try/catch → 404 在库（WI49 注释钉住）+ config.js mission 分支 mkdirSync 移除、创建延迟至 orchestrator.js:588 orchestrateRun 共享 run 入口（偏差 = plan 原文写 main.js 调用点，dev log 08-28 如实注记双路径理由）；② Phase 2 裁定 = 备选 B：`git diff --stat engine.js runner.js` 为空实测（零引擎 diff 底线保持）+ roadmap Follow-up 两行 watch-only residual 注记 + 本 plan `## Deferred But Adjudicated` 裁定条目在册；③ Phase 3 roadmap-check/plan-check/gate-check stdout 面 `process.exitCode` 赋值在库（余 process.exit 均为 usage/stderr 错误分支，plan Deferred 裁定内）+ 新 test/cli-pipe-truncation.test.js 5 例；④ Phase 4 multi/open-audit.md:23 + draft-from-roadmap.md:40 措辞改写在库（rg 'legacy channel|DRAFT_FROM_AUDIT' prompts/ 零命中）+ assets 副本同步（git status 两者同改）；⑤ Phase 5 五处修正对账：baseline.md:120 仅列 SCRIPT_REGISTRY + packaging.md:348 ALLOWED_MODULES closure 门句 + module-boundaries.md:10 真实扩展名混居注记 + missions json `audits` map 已删（live prompts 两键存活）+ checkRoadmapUniqueness 经 loadMission extends 合并读（mission-check.mjs:156-177）；⑥ Phase 6 回写：roadmap WI49 行 `[x]` + Last Updated 头 + 列 0 `grep -c "^- \[ \]"` = **0** + 缩进域 rg = **0** 实测 + `docs/logs/2026/08-28.md` WI49 条目在册。审计者独立复跑机械验证全绿：`pnpm --prefix tools/mission-driver test` **984/984 / 0 失败 + prompt-check OK** exit 0（973 基线 +4 monitor/+5 pipe/+2 mission-check 只增不减，pass 行 basisHash=a00a18aa…a126bda8 与当次 basis 绑定一致）+ `roadmap-check` exit 0 + `mission-check missions/age-autonomy-implementation.json .` exit 0 + `lint:prompts` OK + 零新增 npm 依赖。结论：42/42 全勾 + test pass 行 basisHash 绑定 + 本回执对满足 01 §5.2 完成派生公式。

## Deferred But Adjudicated

### engine.js fail-open 修补 vs 零引擎 diff 底线(Phase 2 决策)

- Classification: Phase 2 备选 B 落地后的 watch-only residual
- Why Not Blocking Closure: 若 Phase 2 走备选 B(默认),engine.js 两子项转 Deferred,接受当前 bug 仍存在;reopen 触发 = 06 清单退役执行期或独立形态后端替代立项(G8 同族机制,retirement-gated)
- Successor Required: no(06 G 缺口机制承载)

### monitor.js handleStartRun 已建目录清理(若 Phase 1 子项 1 选"校验后清理"备选)

- Classification: 优化候选
- Why Not Blocking Closure: 本 plan Phase 1 子项 1 默认走"校验前置 mkdir"路径(根除而非清理);备选"先建后清理"增加代码复杂度但不优于前置;若无 reviewer 异议即按默认
- Successor Required: no

### CLI 校验器 `console.error` 路径

- Classification: out-of-scope improvement
- Why Not Blocking Closure: 本 Phase 3 只修 stdout 截断;`console.error` 与 stderr 流不同,不受 64KB pipe buffer 限制;现有 stderr 用法零问题
- Successor Required: no
