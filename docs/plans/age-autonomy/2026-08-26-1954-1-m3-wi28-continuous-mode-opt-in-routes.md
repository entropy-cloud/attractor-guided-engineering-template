---
status: active
mission: age-autonomy-implementation
work-item: M3-WI28
group: "2026-08-26-1954"
verify: [test, verify-age]
---

# 2026-08-26-1954-1 M3 连续模式 opt-in：roadmap 即队列 + mdcontrol.continuous / mdcontrol.unlock 路由 + 终态回执（age-autonomy M3-WI28）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M3 WI28（连续模式 opt-in：roadmap 即队列 + `mdcontrol.continuous` route + `mdcontrol.unlock` 路由 + 终态 receipt 回执）
> Related: 前置 = `2026-08-26-1411-1`（WI25 watchdog/writer/receipt 面）、`2026-08-26-1411-2`（WI26 trigger 执行 + 派发面 + exec-arm）、`2026-08-26-1411-3`（WI27 终态规则 R1–R4 + run-terminal 回执 + 循环停派——本 plan 消费其终态机且不改其语义）

## Current Baseline

**连续模式有设计基线（03 §4）无路由面与 opt-in 开关：watchdog 在 policy `triggers:` 段在场时即 execute posture（无人值守派发），无会话级显式 opt-in、无 off 面、无队列链式沿的显式接线；`mdcontrol.continuous` / `mdcontrol.unlock` 两路由不存在（mdcontrol-routes.ts 五路由：run/status/list/draft/analyze）；held plan 的人工处置（unlock / 终态 disposition）零代码面。**（live 核实 2026-08-26）

- **03 §4 设计基线**：连续模式 = roadmap 即队列——不建独立队列 store，持久意图就是仓库本身（roadmap todo 项 + `missions/*.json`）；触发沿 = run 终态链式 + 心跳扫描；每 root 单活跃守卫（内存态，重启即清空）天然 overlap-skip；**Queue ≠ approval**——held/draft plan 不被执行拾取，单个 held 不阻塞其他可执行 plan，仅当不存在任何可执行/可评审 open plan 且 roadmap 仍有未勾项时暂停循环、按终态规则收口并回执；**opt-in**——连续模式显式开启（DSH 会话一句「连续模式开工」/ 独立形态由 cron 声明），绝不使存量用户意外获得无人值守行为。
- **现有执行链（1411-2/1411-3 交付面）**：watchdog 心跳/事件沿 + exec-arm 七出口 + terminal-rules R1–R4 + run-terminal 回执（A8 尽力投递）+ `mdcontrol.status` 透出（statusFace().terminal）+ 循环停派（terminal word 命中后该 mission run 的 execute-posture 命中抑制，mount 粘滞 + 跨重启幂等重评）。execute posture 门 = policy `triggers:` 段在场 + `supervisor.projectRoot` bundle 配置（service.ts 无 projectRoot = idle 降级）。
- **队列链式沿缺口**：03 §3 边 2（终态回执链：一个 run 终态 → 立即评估 → 派发下一个）——watchdog 头注声明 onTerminal 链 seam，消费面接线缺失；plan 级收口（completion 派生）后的「队列下一个」推进与 mission 级 terminal word 停派（03 §8）之间的分层未成文。
- **路由面**：`plugin/dsh/src/mdcontrol-routes.ts`——五路由（M2-WI10 ×3 + M3-WI12 ×2），`MdControlRoutes` 接口 + HTTP dispatcher（method 派发）+ `ActiveRunGuard`（per projectRoot，run/draft 共槽，内存态——「重启即清空，无需持久化恢复」先例）。
- **writer 面与执法面对接点**：writer `holdPlan`（WI27：held 同写 hold+failures+清 claim）在库；held→active 同写（failures 重置 + hold 移除）写函数缺失——writer-identity T6 执法面已消费该形状（law-rules.mjs:384-397「held→active: same write must reset failures to 0 and remove hold」），且 :397 注记「supervisor-unlock writer identity has no receipt syntax on this face (**mdcontrol.unlock routing is M3**)」、:407 终态 disposition 注记「supervisor routing is M3」——两条注记把路由供给指向本 WI；role=supervisor 写者经 writer-identity/claim-validity 白名单面零规则改动通过（WI25 先例）。
- **sustain duty 与执行腿缺口**：`SustainDuty` 接口声明（decision-core.ts:164）**仍是 declared-not-implemented**（头注「implementation = 1411-2」指 trigger 派发链承载推进面，接口本体未实现）；policy dispatch 映射含 `execute: executor`（autonomy.policy.yml:178）但 **triggers 段无任何谓词产 execute 派发**、谓词词汇表无 claim-missing 类谓词（law-policy.mjs TRIGGER_PREDICATES）、exec-arm 七出口无 initial-execute 出口（execute 派发仅经 reclaim 重派面）——1411-2 评审回执明记 initial execute dispatch 留引擎侧（0815-3 过渡期裁定）：plan 执行（EXECUTE 步）= 引擎 run 领地（mdcontrol.run / mission-driver），守夜人覆盖 review/verification/closure/draft-plans 派发。连续模式的执行腿归属 = 本 plan Phase 1 裁定。
- **e2e 面**：`plugin/dsh/scripts/` 有 e2e-demo/e2e-policy/e2e-preset；env 探测 + fail-fast 先例 = `scripts/e2e-demo.mjs` / `scripts/verify-native.mjs`；`verify:e2e:continuous` npm script 不存在——WI31 Verification Gate 字面点名该命令（真实宿主连续模式 e2e 三连跑，缺 env fail-fast exit ≠ 0，CI opt-in 不阻塞）。
- **宿主 goal 注入权互斥（03 §4）**：mission 子代理不设 host goal，守夜人不与宿主 goal-round-driver 竞争同一 agent 的 followup 注入权——本 plan 派发面沿 exec-arm 既有 agents face，无新增注入通道。

## Goals

- `mdcontrol.continuous` 路由：per projectRoot 连续模式显式 opt-in（enable/disable/status 查询）；默认 off；off 时 watchdog execute posture 压回 WI25 观察姿态（dispatch 决策 = 观察回执），存量宿主不意外获得无人值守行为（03 §4 opt-in 纪律执法——行为收紧成文）。
- 队列推进语义：连续模式 on 时 run/plan 收口后链式评估下一个（03 §3 边 2 接线——onTerminal/周期末端立即再评估，队列 = roadmap todo + trigger 派发既有面，零新队列 store）；mission 级 terminal word（R1–R4）语义不动——队列终态才停派 + 回执；Queue ≠ approval 断言面（held/draft 不拾取）钉住。
- `mdcontrol.unlock` 路由：held plan 人工处置面——`unlock`（held→active：守夜人 writer 同写 failures=0 + 移除 hold，T6 形状）与 `dispose`（held→cancelled|superseded|deferred 终态 disposition）；经 writer（CAS + 原子落盘 + 写前 law 自检，actor role=supervisor）执行，deny 结构化透出。
- 终态 receipt 回执接线：连续模式会话（开启者）在 mission 级终态收到 run-terminal 回执（既有 receipt 面 + A8 尽力投递，投递目标 = continuous 开启会话）。
- `verify:e2e:continuous` npm script + e2e 脚本（缺 env fail-fast exit ≠ 0；真实宿主下连续模式链式推进可证）。
- 文档同步（03 changelog / CONTEXT.md / packaging doc / policy 头注）+ roadmap WI28 回写。

## Non-Goals

- 崩溃恢复扫描执行化 / resume-or-redispatch（WI29——连续模式崩溃后续班归其收口）。
- 停滞指纹 / 卡死检测 / 往返检测（WI30）。
- agent 池 / PromptAssembler / 上下文画像（M4）。
- 独立形态 cron 声明面与 CLI 承载（03 §4 独立形态由 OS 定时器承担；supervisor 独立 CLI 形态归 M5 前文档 seam——本 plan 仅 DSH 形态路由）。
- 引擎面改动（engine.js / flows/*.json 零 diff；EXIT_MAP 冻结契约不动——03 §8 终态映射纪律）。
- 新持久队列 store / frontmatter 新字段（03 §4 字面不建队列 store；continuous 状态承载裁定进 Phase 1）。

## Task Route

- Type: `architecture change`（守夜人 opt-in 门 + 队列链式沿 + 两条新 mdcontrol 路由——supervisor/mdcontrol-routes 两面结构新增）
- Owner Docs: `docs/design/age-autonomy/03-supervisor.md` §4（连续模式）/§3（触发沿边 2）/§2（sustain/receipt 职责）、`docs/design/age-autonomy/01-file-ledger.md` §5.1（held→active / 终态 disposition 写者表）、`docs/design/age-autonomy/02-rule-law.md` §4.5（守夜人唯一机器字段写者）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（1411 批次同裁定）→ Skill: none

## Infrastructure And Config Prereqs

- Prereqs: `2026-08-26-1411-1` + `2026-08-26-1411-2` + `2026-08-26-1411-3` 收口（watchdog / exec-arm / writer / receipt / 终态机）。
- No infra prereqs beyond existing baseline（零新增 npm 依赖；bundle config 键 `supervisor.continuous` 预启用面为既定配置项，无环境依赖）。

## Phase 1 — opt-in 裁定 + mdcontrol.continuous 路由 + 队列推进语义

Targets: `plugin/dsh/src/mdcontrol-routes.ts`（第六路由 + continuous 状态面）、`plugin/dsh/src/supervisor/`（opt-in 门 + 链式沿接线：watchdog.ts / service.ts / decision-core.ts posture 门）、`plugin/dsh/test/supervisor-continuous.test.mjs`（新）

Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 1411-1、1411-2、1411-3

- [x] `Decision` **连续模式执行腿归属**：plan 执行（EXECUTE 步）**仍是引擎 run 领地**（0815-3 过渡期裁定沿袭 + 1411-2 评审回执注记）——连续模式 on 的推进面 = 守夜人 ledger 派发（review / mechanical-verification / closure-audit / draft-plans / deep-audit，既有 trigger 面）+ **引擎 run 终态链式**（03 §3 边 2：run 终态 → 立即再评估——onTerminal/postReceipt 钩子触发一次再评估周期，队列有 ledger 活则派发）；**下一个引擎 run 的启动保持操作者发起**（mdcontrol.run 既有面，per-root ActiveRunGuard 单活跃守卫天然串行）直至 M4-WI33（PromptAssembler——守夜人侧执行的前置）与 M5/WI37（引擎退役判定）评估。备选：本 plan 接线 initial-execute 派发（trigger 谓词扩 claim-missing + exec-arm 新出口 + executor prompt 供给）——否决：executor prompt 组装是 M4-WI33 交付面，提前接线 = 无 prompt 纪律的裸派发，且 0815-3 双驱动裁定（BUILD_VERIFY 写者过渡）未到期。残险：无引擎 run 的宿主在连续模式下推进至 active 后停滞于执行——由 R3/R4（1954-3 停滞指纹）捕获为 blocked + 回执等人（03 §9 失败面诚实表「预算耗尽/全 held → 终态 + 回执等人」同族），诚实失败非静默空转；e2e 第三腿以 fixture 驱动终态词（见 Phase 3）。〔成文于 watchdog.ts/decision-core.ts 头注 + 本 plan；执行腿零新接线，Deferred 登记在案〕
- [x] `Decision` **continuous 状态承载与门形状**：per-root 内存态标志（镜像 ActiveRunGuard 先例——内存态、重启即清、恢复扫描重评幂等；03 §4「每 root 单活跃守卫（内存态，重启即清空）」同族裁定），默认 **off**；门 = 单一开关切 watchdog execute/observe posture（off → WI25 观察姿态：dispatch 决策落观察回执不派发；on → 1411-2 execute posture 全量放行）——不做 per-trigger-type 矩阵。备选 A：continuous 仅门「队列推进类」trigger（draft-plans/deep-audit）而 review/verification 派发放行——否决：单 plan 闭环派发与队列推进共享 exec-arm 同一出口，类型矩阵制造第二语义面且 03 §4 无此分层。备选 B：bundle config `supervisor.projectRoot` 在场即视为 on（零行为变化）——否决：opt-in 字面要求会话级显式开启，「配置即永久 on」使 off 面落空。**行为收紧成文**：现状（policy triggers 在场即 execute）的存量宿主需显式开启才恢复无人值守——收紧方向符合 03 §4「绝不使存量用户意外获得无人值守行为」；headless 部署可经 bundle config 键 `supervisor.continuous: true` 预启用（等价显式声明）。残险：存量宿主静默降级为观察——mount log 一行注记 + CONTEXT.md 变更说明钉住可发现性。〔落地：`decision-core.ts` `applyContinuousGate`（dispatch 型 execute-posture 决策降级 observe，meter/receipt 不受门影响）+ `watchdog.ts` per-root 内存标志（`continuous` 选项 / `setContinuous` / `isContinuous` / statusFace.continuous）+ `supervisor/service.ts` 挂载注记（行为收紧 BEHAVIOR TIGHTENING 句）+ bundle config `supervisor.continuous` 预启用 + CONTEXT.md 增量段〕
- [x] `Decision` **plan 级收口链式 vs mission 级终态停派的分层**：plan 级收口（completion 派生 / 单 plan 回执落账）≠ 队列终态——连续模式 on 时每周期末端（含引擎 run 终态链沿 onTerminal/postReceipt）重评估 trigger 面（draft-plans / review / verification 派发既有面）继续推进；mission 级 terminal word（R1–R4，1411-3 求值核心）命中才停派 + run-terminal 回执（语义零改动，本 plan 只把「终态后立即评估下一个」的链式沿从 seam 接成执行面）。备选：plan 收口也走独立「队列事件」事件面——否决：03 §3 边 2 链式沿 = 终态后评估，心跳沿已兜底，独立事件面冗余。残险：链式沿与心跳沿双触发——exec-arm 幂等面（dispatchAlreadyRegistered / 双驱动幂等）既有承载。〔落地：`watchdog.ts` `emitTerminalEvent` 末端——continuous on 时 `void cycle('manual')` 单飞守卫复用；测试钉住链式沿 + 终态停派优先级〕
- [x] `Add` `mdcontrol.continuous` 路由：payload `{ projectRoot, enabled?: boolean }`（缺 `enabled` = 状态查询）；返回 `{ projectRoot, enabled, posture }`（posture = observe|execute + 当前 watchdog 挂载态）；`enabled: true/false` 切换 per-root 内存标志并即时生效（下一周期）；watchdog 未挂载（无 projectRoot 配置）= bad-request 结构化错误。路由注册进 `MdControlRoutes` 接口 + HTTP dispatcher（既有 method 派发零新机制）+ watchdog posture 门接线（off → dispatch 决策降级观察回执，meter/receipt 决策不受门影响）。〔`mdcontrol-routes.ts` 第六路由 + `ContinuousControlFace` hook（`mountSupervisor` 返回面结构满足）；未挂载 toggle = bad-request / 未挂载查询 = {enabled:false, posture:observe, mounted:false} 诚实闲置态；root 不匹配 = bad-request（单 mount 单 root 语义）；followup {sessionId} 启用时登记回执目标（Phase 2 消费）〕
- [x] `Add` 队列链式沿接线 + Queue ≠ approval 断言：onTerminal 链沿（1411-1 seam）在 continuous on 时触发一次立即再评估（`runCycle('manual')` 等效单飞守卫复用）；`draft`/`held` plan 不被拾取由 trigger 谓词域（plan.status=active / full-tick 域）天然保证——补守护断言（draft/held 在队列不产生 execute 派发）。〔链沿 = `emitTerminalEvent` 末端；守护断言 = supervisor-continuous.test.mjs「queue ≠ approval」用例（triggerDuty 域断言：零 execution occurrence、held 永非派发目标、held 文件零 claim 写入）〕
- [x] `Proof` `node --test plugin/dsh/test/supervisor-continuous.test.mjs` ≥8 用例——opt-in 三态（off 观察 / on 执行 / 切换即时生效）+ 默认 off + 未挂载 bad-request + 链式沿（onTerminal → 再评估派发）+ Queue ≠ approval（draft/held 不拾取）+ mission 终态停派优先于链式（terminal word 后 continuous on 也不再派发）+ 重启后标志清零重评幂等 + meter/receipt 决策不受门影响。〔**10 用例 0 失败**：opt-in 三态三例（off 观察回执含门注记 / on 账本派发链落地 / 单 watchdog off→on→off 三态切换）+ 路由面一例（未挂载 toggle bad-request + 未挂载查询诚实闲置态 + root 不匹配双拒 + followup 形状校验）+ 链式沿两例（off 零链式 / on 一链式周期 + 链式周期推进队列派发 review）+ Queue ≠ approval + 终态停派优先 + 重启清零（含 late-draft 零派发）+ 门作用域（off 下 reclaim meter 写执行 + 同周期 dispatch 面仍门控）〕

Exit Criteria:

- [x] continuous 路由 + posture 门 + 链式沿落地；off 时零无人值守行为（观察回执）有测试钉住
- [x] 行为收紧注记（存量宿主需显式开启）mount log + 文档在位
- [x] `docs/logs/` 更新

## Phase 2 — mdcontrol.unlock 路由 + writer 对接 + 终态回执接线

Targets: `plugin/dsh/src/supervisor/writer.ts`（unlockPlan / disposePlan）、`plugin/dsh/src/mdcontrol-routes.ts`（第七路由）、`tools/mission-driver/src/law-rules.mjs`（writer-identity :397/:407 过渡期注记更新——路由供给落地后的 unverified-writer 注记消解，规则行为零改动）、`plugin/dsh/test/supervisor-continuous.test.mjs`（扩）

Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [x] `Add` writer 两写函数（1411-1 writer 模式：写前 law 自检 role=supervisor + baseHash CAS + tmp+rename 原子落盘，deny 不落盘）：`unlockPlan`（held→active 同写 failures=0 + 移除 hold——writer-identity T6 执法形状零规则改动对接；claim 不携（active 外禁携 claim，01 §4.1））+ `disposePlan`（held→cancelled|superseded|deferred 终态 disposition——01 §5.1 写者表 supervisor 合法边；终态冻结后 basis 域不可变由 plan-completed 既有执法面承载）。〔`writer.ts` 增 `unlockPlan`（set {status:active, failures:0} + remove [hold, claim, claim-expires] 一原子写——残存 stale claim 对同写清除）+ `disposePlan`（set {status:<disposition>} + remove hold/claim 对——hold 仅 held 合法故必除；`PLAN_DISPOSITIONS` 域校验）〕
- [x] `Add` `mdcontrol.unlock` 路由：payload `{ projectRoot, planPath, action: unlock | dispose, disposition?: cancelled|superseded|deferred }`；plan 不在 governed plansDir / 状态非 held / disposition 参数域外 = bad-request；路由 → 守夜人 writer 执行 → 返回 `{ planPath, action, result: written|denied, reason? }`（writer law deny 结构化透出不吞）。与 writer-identity :397/:407 两注记对齐注记（路由供给落地，role=supervisor 面激活，unverified-writer 过渡注记消解）。〔第七路由：参数域校验（action ∈ unlock|dispose / dispose 必带合法 disposition / unlock 携 disposition = bad-request）→ `discoverLawContext` 定位 governed plansDir（域外/缺文件/非 frontmatter/状态非 held = bad-request）→ `unlockPlan`/`disposePlan` 经 writer 管线执行（deny 零落盘 + reason 结构化透出）；law-rules.mjs :397/:407 注记更新（「routing is M3」→「arrives via mdcontrol.unlock (M3-WI28)」——规则行为零改动，truth-table :777 断言串同步）〕
- [x] `Add` 终态回执接线：continuous 开启会话登记为 run-terminal 回执投递目标（receipt 面 A8 尽力投递既有——只加目标，不改投递机制；死会话容忍承 A8 裁定）。〔`mdcontrol.continuous` payload `followup {sessionId}` 启用时经 `ContinuousControlFace.setReceiptTarget` → `watchdog.setReceiptTarget`（投递目标可变面，`emitTerminalEvent` 消费既有 A8 管线）；死会话 = delivery-failure 回执，承 A8〕
- [x] `Proof` 路由测试扩入 supervisor-continuous.test.mjs ≥4 新用例——unlock 正例（held→active 同写重置形态：failures=0 + hold 移除）/ dispose 三值正例 + 参数域外 deny / 非 held plan deny / law deny（构造违规写）结构化透出。〔**5 新用例 0 失败**（≥4 超额）：unlock 正例（T6 同写形态 + 零 claim 携带）/ dispose 三值正例（cancelled/superseded/deferred 各落 + hold 移除）/ 参数域八面 deny（action 域外/缺失、dispose 缺 disposition、disposition 域外、unlock 携 disposition、plansDir 域外、缺文件、非 held——全部 bad-request + 零落盘）/ law deny 透出（全勾 held + closure 配对 + 零 pass 行 → plan-completed「completion formula is unsatisfied」deny + reason 结构化透出 + 文件字节不变）/ 终态回执接线（route followup 登记 → R3 blocked run-terminal 单行投递开启会话 + 持久回执并存在位）〕

Exit Criteria:

- [x] unlock/dispose 经守夜人 writer 落盘 + law 自检前置；路由面全参数域有测试
- [x] 终态回执投递目标接线；A8 语义不变
- [x] `docs/logs/` 更新

## Phase 3 — e2e + 文档同步与回写

Targets: `plugin/dsh/package.json`（scripts 增 `verify:e2e:continuous`）、`plugin/dsh/scripts/e2e-continuous.mjs`（新）、`docs/design/age-autonomy/03-supervisor.md`（changelog）、`tools/mission-driver/CONTEXT.md`、`docs/architecture/dsh-plugin-packaging.md`、roadmap、`docs/logs/`

Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 2

- [x] `Add` `verify:e2e:continuous` e2e：npm script + 脚本——缺宿主 env（DSH 会话/agents face）fail-fast exit ≠ 0（CI opt-in 不阻塞，WI31 门铺垫；env 探测 + fail-fast 形态镜像 `scripts/e2e-demo.mjs` / `scripts/verify-native.mjs` 先例）；真实宿主下三连跑断言：continuous off 观察 → on 后队列推进（ledger 派发链可证：review 派发 / draft-plans 派发至少一腿）→ mission 终态回执 + 停派（第三腿以 fixture 驱动 R3/R4 终态词求值断言回执与停派——执行腿归引擎 run，e2e 不依赖完整执行链，见 Phase 1 执行腿裁定）。〔`plugin/dsh/package.json` scripts 行（依赖零 diff）+ `scripts/e2e-continuous.mjs`（无 skip-with-0 出口：`DSH_E2E_CONTINUOUS` ≠1 → console.error + exit 1）+ fixture `test/fixtures/e2e-continuous.cordis.yml`（e2e 基座 + supervisor 配置行 projectRoot env 注入 + heartbeatMs 250 快拍）；三腿断言 = off 观察回执（门注记）+ 账本零派发 / on 后 queued draft plan-review 派发登记落账本 + 派发回执 / R3 blocked 终态词 + run-terminal 回执 + status 透出 + late-draft 停派。执行期修正一处：leg 2 派发回执判别式原写 `kind !== "observation"` 误设（receipt 词汇表无 action kind，exec-arm 派发回执本就 kind=observation——receipt.ts:23/exec-arm.ts:358），改内容面判别（runId 非空 + detail `^#review-… to <session>`——门降级观察回执 runId=null 不可冒充，断言收紧而非放松）；缺 env 实跑 exit 1 / `DSH_E2E_CONTINUOUS=1` 实跑 **SUMMARY: PASS**〕
- [x] `Add` 文档同步与回写：03-supervisor.md changelog（§4 执行面落地注记——opt-in 门形状 + 行为收紧裁定 + 链式沿分层，非契约变更）；CONTEXT.md 增连续模式段；packaging doc（路由计数 5→7 + e2e 脚本条目 + Service Surface 增量）；`missions/autonomy.policy.yml` 头注无需改（opt-in 是宿主面非 policy 面——成文于 plan 即可）；roadmap WI28 tick + 证据指针 + Last Updated 同步；`docs/logs/` 收口条目。〔03 changelog M3-WI28 段在位；CONTEXT.md 连续模式段在位（Phase 1 落地核实）；packaging doc = 状态头增量句 + Routes bullet 5→7 + scripts/src/test/fixtures 树条目 + Service Surface Supervisor bullet 增量与 Proof 串 +15；policy 头注零改动（裁定成文于本 plan Phase 1）；roadmap WI28 `[x]` 全证据指针 + Last Updated「M3 第四片」；docs/logs/2026/08-26.md Phase 3 收口条目〕
- [x] `Proof` 收口面：`node --test plugin/dsh/test/supervisor-continuous.test.mjs` 全绿；`pnpm --prefix tools/mission-driver test` + `./verify-age.sh` 全绿（引擎 ≥907 / 插件 ≥342 / 真值表 ≥113 只增不减）；`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0；`git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff）+ 双 package.json 依赖零 diff（e2e script 非依赖）。〔supervisor-continuous **15/15**；引擎 **910/910**（prompt-check OK）；`./verify-age.sh` **L1+L2+L2.5 GREEN**（插件 **357/357** / 真值表 113/113——基线 342→357 只增不减）；mission-check `"valid": true` exit 0；engine.js diff 为空 + 双 package.json 仅 plugin scripts 一行（`verify:e2e:continuous` script 行，依赖零 diff）；web typecheck + build 绿（dist 零漂移）+ lint:prompts OK〕

Exit Criteria:

- [x] `pnpm --prefix plugin/dsh run verify:e2e:continuous` 无 env fail-fast exit ≠ 0 / 有 env 三连跑断言在位
- [x] roadmap WI28 `[x]` + 证据指针；Last Updated 同步
- [x] CONTEXT.md / 03 changelog / packaging doc 增量在位；`docs/logs/` 收口条目
- [x] `./verify-age.sh` + mission-check 全绿（L2.5 corpus 覆盖本 plan）

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-26-1954-1-m3-wi28-continuous-mode-opt-in-routes-1-69fdd85c to ses_reviewer_2026-08-26-1954
- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-26-1954-1-m3-wi28-continuous-mode-opt-in-routes-2-847e2418 to ses_reviewer_2026-08-26-1954
- 2026-08-26：iteration 1，共识 acceptable-with-changes #review-2026-08-26-130203-mission-driver-2026-08-26-1954-1-m3-wi28-continuous-mode-opt-in-routes-1-69fdd85c（独立评审 ses_reviewer_2026-08-26-1954：baseline 抽查全实证——五路由/guard/HTTP dispatcher、watchdog noteActivity:542/recovery 周期/posture 门/停派粘滞、exec-arm 七出口、writer holdPlan 在库、law-rules :397/:407「mdcontrol.unlock routing is M3」注记、policy dispatch execute:178 无 trigger 产出、commands 含 verify-age 均对账；阻塞 1 项 = 队列「执行腿」未裁定——「roadmap 即队列」核心 claim 超诺：SustainDuty declared-not-implemented（decision-core.ts:164）、谓词词汇表无 claim-missing（law-policy.mjs:56-71）、exec-arm 无 initial-execute 出口、1411-2 评审回执明记 initial execute 留引擎侧（0815-3 过渡裁定）→ 连续模式推进至 active 后无执行派发、e2e 第三腿不可达，须补 Decision 钉执行领地或 Deferred 带后继；非阻塞 4 项 = law-rules.mjs 补进 Phase 2 Targets（:397/:407 注记对齐义务）/ e2e 先例指针错（e2e-demo.mjs·verify-native.mjs 非 e2e-policy.mjs）/ posture 收紧裁定本身判定 adequate（备选+残险+可发现性齐备，不与已收口 plan 冲突）/ prereqs「可选配置」措辞）
- 2026-08-26：iteration 2，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-26-1954-1-m3-wi28-continuous-mode-opt-in-routes-2-847e2418（独立复核 ses_reviewer_2026-08-26-1954：阻塞修复落地且 sound——执行腿裁定成文为 Phase 1 新 Decision（执行 = 引擎 run 领地沿袭 0815-3 + 1411-2 回执注记；备选 initial-execute 接线以 M4-WI33 prompt 供给前置否决；残险 = 无引擎宿主停滞由 R4 捕获 blocked + 回执等人；Deferred 登记 M4-WI33/M5-WI37 后继）+ baseline :23 SustainDuty 诚实化 + e2e 第三腿 fixture 驱动不依赖完整执行链；四项非阻塞全落地（law-rules.mjs notes-only 入 Targets / 先例指针修正 / 措辞 / 「可选配置」重写）；格式复核干净、无新引入问题；执行期微调建议 1 条不阻塞 = 残险句「R3/R4」中 R3 在 activePlans()>0 时不可达、实际捕获面是 R4（执行期措辞收紧）。跨 plan 注记：WI31 门第 4 条 `gate-check <active-plan>.md --law` 的 `--law` 模式不存在（gate-check.mjs 仅 --policy/--verify），无 M3 plan 交付——归 WI31 立项时裁定（补模式或修 roadmap 门文本），本批复核确认如此处置）

## Verification

- pass test 2026-08-26-130203-mission-driver basisHash=94df131dff215d1b536576b1c45a95c93786749b8a5ef644ca138071a2dccf8b exit=0
- pass verify-age 2026-08-26-130203-mission-driver basisHash=94df131dff215d1b536576b1c45a95c93786749b8a5ef644ca138071a2dccf8b exit=0

## Closure

- dispatch audit #audit-2026-08-26-130203-mission-driver-2026-08-26-1954-1-m3-wi28-continuous-mode-opt-in-routes-1-2d3ff894 to ses_auditor_2026-08-26-1954
- accepted #audit-2026-08-26-130203-mission-driver-2026-08-26-1954-1-m3-wi28-continuous-mode-opt-in-routes-1-2d3ff894：独立收口审计（ses_auditor_2026-08-26-1954）通过——23 项全勾与 live 工作区逐项对账：第六路由 `mdcontrol.continuous`（mdcontrol-routes.ts:696，未挂载 toggle bad-request / 诚实闲置查询 / followup 回执目标）+ 第七路由 `mdcontrol.unlock`（:749，参数域八面校验 → `unlockPlan`/`disposePlan` writer 管线）+ writer 两写函数（writer.ts:397/:422）+ `applyContinuousGate` opt-in 门（decision-core.ts:367，watchdog.ts:487 消费——off 时 dispatch 降级观察回执，非空壳）+ 队列链式沿（watchdog.ts:327 `void cycle('manual')`）+ BEHAVIOR TIGHTENING 挂载注记（supervisor/service.ts:127）+ e2e 三件（scripts/e2e-continuous.mjs + fixture e2e-continuous.cordis.yml + npm script 行，plugin package.json 工作区 diff 仅此一行、依赖零 diff）+ 文档同步全在位（03-supervisor.md changelog :98 / CONTEXT.md :92 / packaging doc 增量 / roadmap WI28 `[x]` :76 + Last Updated :7 / docs/logs/2026/08-26.md 三 Phase 条目）；审计者复跑机械验证：`pnpm --prefix tools/mission-driver test` 910/910 pass + prompt-check OK exit 0、`./verify-age.sh` L1+L2+L2.5 GREEN（真值表 113/113）exit 0；`git diff --stat` 核实 engine.js / 引擎 package.json / web/（含 dist）零 diff（前端零改动 → 无需重建）；Deferred 两项（守夜人 initial-execute 派发 → M4-WI33/M5-WI37；独立形态 cron 声明面 → M5 前 seam）为真实域外项且后继在册，无域内在案缺陷藏匿。

## Deferred But Adjudicated

### 守夜人侧 initial-execute 派发（执行腿）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: plan 执行保持引擎 run 领地（Phase 1 裁定：0815-3 过渡期裁定沿袭 + 1411-2 评审注记）；守夜人侧执行需 trigger 谓词扩 claim-missing + exec-arm 新出口 + executor prompt 供给（PromptAssembler = M4-WI33 交付面）；无引擎 run 宿主的执行停滞由 R3/R4 捕获 blocked + 回执等人（诚实失败面）。
- Successor Required: yes（M4-WI33 PromptAssembler 落地后评估接线；M5/WI37 引擎退役判定门终审）

### 独立形态 cron 声明面

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 03 §4 独立形态 opt-in 由 OS 定时器（cron/launchd/CI）声明；supervisor 独立 CLI 形态是 M5 前文档 seam（1411-1 裁定沿袭）。
- Successor Required: yes（M5/WI37 引擎退役判定门评估）
