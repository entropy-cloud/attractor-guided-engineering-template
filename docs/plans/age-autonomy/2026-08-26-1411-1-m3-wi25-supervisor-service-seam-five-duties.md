---
status: active
mission: age-autonomy-implementation
work-item: M3-WI25
group: "2026-08-26-1411"
verify: [test, verify-age]
---

# 2026-08-26-1411-1 M3 守夜人服务拆分与五职责 seam（age-autonomy M3-WI25）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M3 WI25（Supervisor 拆 cordis service（plugin/dsh）或可独立运行（CLI）+ 五职责 sustain/trigger/meter/restart/receipt）；owner doc `docs/design/age-autonomy/03-supervisor.md`（supported baseline）；0815-3 Phase 2 Deferred 残项「claim 过渡期写者供给——守夜人 M3/WI25 才存在，接管唯一机器字段写者后消除 prompt 可绕残险」由本 plan 收口
> Related: 前置 = M2 全部收口 plan（0815-{1,2,3}、0925-{1,2,3}、0950-{1,2,3}——law 内核/三硬门/配套门禁/护栏/证据面重建/CI 接线；roadmap M2 17 项全勾，WI24 gate 2026-08-26 实测绿）；同批后继 = `2026-08-26-1411-2`（WI26 trigger 执行——消费本 plan 的 decision-core 接口/meter 写者/receipt 面）、`2026-08-26-1411-3`（WI27 终态规则——消费 meter/receipt 面）

## Current Baseline

**守夜人（03-supervisor.md）有完整设计基线（五职责/三触发沿/幂等/崩溃恢复/卡死检测/终态规则）但零代码存在：plugin/dsh 无 supervisor 模块；claim 机器字段无守夜人写者（M2 过渡期 = EXECUTE prompt 指令供给，prompt 可绕残险成文）；Q4 写回路由（02 §4.5 三选一）终审遗留「P2 首片实测确定路由」未裁决。**（live 核实 2026-08-26：`plugin/dsh/src/` = engine-bridge.ts / law/host-adapter.ts / mdcontrol-{routes,skills}.ts / native-executor.ts / service.ts，无 supervisor/ 目录；测试基线 = 引擎 904/904 + 插件 223/223 + 真值表 113/113，`./verify-age.sh` L1+L2+L2.5 GREEN）

- **服务形态现状**：service.ts 发布 `mdcontrol` cordis service（routes run/status/list/draft/analyze + ActiveRunGuard + skills + law gate 单监听器，service.ts:30-36/:112-113）；Service 子类发布先例 = MdControlService（service.ts:63-72）——supervisor 作为**同 bundle 内第二个 service publication**（不新增宿主 entry、不另 isolate realm）；roadmap「Dependencies 形态聚焦」钉死新逻辑落 `plugin/dsh/src/{ledger,law,supervisor,verify,efficiency}/` 五子目录，supervisor/ 首次创建。
- **设计基线（03-supervisor.md）**：§2 五职责表（sustain/trigger/meter/restart/receipt——守夜人只写三类机器登记：计量 audit-rounds/failures、认领 claim、派发登记 dispatch，不定业务顺序不写业务状态）；§3 看门循环（扫账本 → 纯函数判定 → 派发（若有）→ 休眠，99% 空闲，判定函数确定性可测）+ 三触发沿（事件沿/终态回执链/心跳轮询兜底）；§5 幂等（账本派生 occurrenceKey，不另设 store）；§10 DSH 寄生宿主（宿主存活 = 守夜人存活，不另造 watchdog）。
- **机器字段写者现状**：claim 唯一合法写者角色 = engine/supervisor（claim-validity 白名单，law-rules.mjs）；M2 过渡期裁定 = EXECUTE prompt 指令供给（0815-3 Phase 2 Decision，承 0635-3 模式）——「M3 无需改规则只换写者」映射成文；failures 字段写者 = supervisor 失败归因（01 §4.1 字段表）；audit-rounds = mission 级 Deep Audit 计量（01 §3.1）。
- **Q4 未裁决（02 §4.5）**：宿主 CAS 单决策槽被 base bundle 的 fs-observation-policy 占据（不调 next()，02 §4.5 源码核实注记）——三选一：① 与 observation-policy 集成同槽 ② 替代其槽 ③ 守夜人作为唯一机器字段写者串行落盘（tmp+rename）。本 plan 裁定（Phase 1）。
- **actor 身份现状**：ACTOR_ROLES 已含 `supervisor`（law-core.mjs:35）；DSH 面 actor={id}（role 不可推断，0815-1 Explore 结论）——claim-validity/writer-identity 的 role-bearing deny 面随守夜人写者落地激活（规则零改动）。
- **判定核心可复用面**：ledger 谓词族 draftPlans/activePlans/heldPlans/openPlans/awaitingClosure（ledger-sections.mjs:528-554，可注入 defaultVerifyKeys）经 build-bundle assets 通道对插件可复用（law 内核先例）；verify-runner.mjs 已 ALLOWED_MODULES 预登记 unreachable-allowed（build-bundle.mjs:63-70/:221「M3 supervisor over verify-runner.mjs」注记）——消费归 1411-2，本 plan 不接线。
- **计量读面**：resolveMaxAuditRounds（law-policy.mjs:483，policy 权威/mission 回退）；audit-rounds-overflow 门禁 deny 超预算新审计轮（0815-3）——meter 写面是本 plan 交付，读面既有。
- **零引擎 diff 底线**：supervisor 全部落 plugin/dsh 侧；`tools/mission-driver/src/engine.js` 与 flows/ 零改动；零新增 npm 运行时依赖。
- **收口判据**：roadmap WI25 tick 需独立 closure audit + verify 键真实绿（本 plan verify = test + verify-age）；M3 整体验证门（WI31）归 M3 末位，本 plan 不越界执行。

## Goals

- supervisor cordis service 拆分落地：`plugin/dsh/src/supervisor/`（service 发布 + 看门循环 + 心跳沿/事件沿两触发沿 + 终态回执链 seam），默认姿态成文（派发类决策恒 no-op + 观察日志，存量宿主不意外获得无人值守推进）。
- 五职责 seam：decision-core 纯函数契约（snapshot → decisions，接口契约成文——1411-2/1411-3 的结构边界定义）+ meter 机器字段写函数（Q4 裁定形态：CAS + 原子落盘 + 写前 law 自检）+ receipt 最小面（A8 尽力投递 + status 透出）+ sustain/trigger 声明接口（实现归 1411-2）+ restart 挂载恢复扫描 seam（完整语义归 WI29）。
- supervisor 作为 role-bearing 机器字段写者通道接管：claim/claim-expires/failures/audit-rounds 写函数与 claim-validity/writer-identity 既有执法面零规则改动对接——0815-3 claim 残项收口。
- 文档同步（CONTEXT.md / dsh-plugin-packaging.md）+ roadmap WI25 回写。

## Non-Goals

- trigger DSL 执行语义与派发面（WI26 / 1411-2——本 plan 只交付 decision-core 接口与计量/回执/观察决策）。
- R1–R4 终态规则与 failures 归因桶（WI27 / 1411-3）。
- 崩溃恢复完整语义（过期 claim 回收执行/终态化残留 running/resume-or-redispatch——WI29；本 plan 只交付挂载恢复扫描 seam + 观察日志）。
- 卡死检测/停滞指纹/往返检测（WI30）。
- 连续模式 opt-in 与 `mdcontrol.continuous`/`mdcontrol.unlock` 路由（WI28）。
- 独立形态 CLI 常驻 runner（OS 定时器面）——Phase 1 形态裁定后仅成文档 seam（03 §6），不交付代码。
- 引擎 flow 步（REVIEW_PLANS/BUILD_VERIFY 等）与 engine.js 的任何改动（零引擎 diff）。

## Task Route

- Type: `architecture change`（新服务模块 + 机器字段写者通道——跨 service/law/ledger 三面的结构新增）
- Owner Docs: `docs/design/age-autonomy/03-supervisor.md`（§2 五职责/§3 触发沿与看门循环/§5 幂等/§6 崩溃恢复/§10 与引擎关系）、`docs/design/age-autonomy/02-rule-law.md` §4.5（claim 写者 + CAS 三选一）、`docs/design/age-autonomy/01-file-ledger.md` §3.1/§4.1（audit-rounds/failures/claim 字段）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（同 M2 批次裁定）→ Skill: none

## Infrastructure And Config Prereqs

- Prereqs: M2 全部收口（roadmap M2 17 项全勾 + WI24 gate 绿，已成立）；本批执行序 1411-1 → 1411-2 → 1411-3。
- No infra prereqs beyond existing baseline（DSH 宿主服务面已存在；零新增 npm 依赖——supervisor 为插件内 TypeScript 模块，经既有 bundle 面交付）。

## Phase 1 — 形态与写者通道裁定

Targets: 裁定记录进本 plan + supervisor 模块头注（Phase 2 实现约束）
Skill: none

- Item Types: `Decision | Add`
- Prereqs: 无（M3 首片）

- [x] `Decision` **服务形态裁定**：DSH 插件形态优先（roadmap「形态聚焦」先例），supervisor = plugin/dsh 内第二个 cordis service publication（Service 子类先例 MdControlService；同一 bundle/同一 isolate realm，不新增宿主 entry）；独立形态（CLI + OS 定时器，03 §6）仅成文档 seam——独立面在 M5 引擎退役判定门前无消费方，不交付 CLI runner。备选：独立 entry/独立包——否决（宿主寄生是 03 §10 看门约束的正面表达；双 entry 引入第二部署面与漂移风险）。残险：无（roadmap WI25 字面「或」分支，DSH 分支被选且裁定成文）。
- [x] `Decision` **Q4 写回路由三选一裁定**（02 §4.5，终审「P2 首片实测确定路由」= 本 plan）：选 **③ 守夜人作为唯一机器字段写者串行落盘**——写前 baseHash CAS 比对（computeBasisHash 同源）+ tmp+rename 原子替换；AI 子代理对机器字段只提交 proposed content（law 门禁 AI 工具面执法不变）。理由：① 与 fs-observation-policy 集成同槽 / ② 替代其槽均需竞用宿主单决策槽（槽被 base bundle 观察策略占据且不调 next()），引入宿主耦合与 observation-policy 回归面；③ 把机器字段写入收敛为进程内确定性代码路径，law 门禁保持 AI 面执法 + 守夜人写前自检（同一 evaluateGates 纯函数，actor role=supervisor）双面。残险：AI 经 bash 等非拦截通道直写机器字段——A1 裁定成文接受的护栏强度（与现状持平），CI 结构面 + git 归因兜底。
- [x] `Decision` **看门循环默认姿态**：mounted 即起心跳扫描（默认间隔成文于模块头注，30s 量级，config 可调），但本 plan 的 decision-core 只产出计量/回执/观察类决策——**派发类决策（dispatch）在 1411-2 接线前恒 no-op + 观察日志**；存量 DSH 宿主不因此获得任何无人值守推进行为（03 §4 opt-in 纪律的前置尊重；连续模式正式 opt-in 归 WI28）。

Exit Criteria:

- [x] 三项裁定成文（rationale + 备选 + 残险），Phase 2 实现与裁定逐项一致（模块头注随 Phase 2 落地承载三裁定指针）
- [x] `docs/logs/` 更新

## Phase 2 — supervisor 服务与五职责 seam

Targets: `plugin/dsh/src/supervisor/`（新：service 入口 + decision-core 纯函数 + 机器字段 writer + receipt；文件名执行期定，模块边界按本 Phase 各项）、`plugin/dsh/src/service.ts`（挂载）、`plugin/dsh/test/supervisor-core.test.mjs`（新）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [x] `Add` decision-core 纯函数契约 + 账本扫描面：`decide(snapshot, policy, clock) → decisions[]`——snapshot = 扫描 plansDir 全量 plan + roadmap 的账本态（谓词族经 assets 通道复用 ledger-sections，law 内核先例）；decisions 类型面 = dispatch | meter-write | receipt | no-op（03 §2 三类机器登记 + 派发）。本 plan 实现 meter-write/receipt/no-op 判定（过期 claim 观察、awaitingClosure 观察等——snapshot × clock 可判定面），dispatch 恒 no-op + 注记（1411-2 接线点）；**接口契约成文于模块头注**（含 1411-2 trigger 求值接入点与 1411-3 终态求值接入点注记——本 plan 的结构边界定义，非实现细节）。
- [x] `Add` 看门循环 + 触发沿：心跳沿（cordis 定时器）；事件沿（plansDir/roadmapPath 文件 watcher → 防抖扫描）；终态回执链 seam（onTerminal 钩子声明，消费归 1411-2/1411-3）；循环体 = 扫描 → decide → 执行决策（计量写/回执/观察日志）→ 休眠（03 §3）；单飞守卫（同一时刻至多一次扫描执行，防事件沿与心跳沿重入）。
- [x] `Add` meter 机器字段写者（writer）：audit-rounds（roadmap frontmatter）/ failures（plan frontmatter）/ claim+claim-expires（plan frontmatter）写函数——读现值 → 构造写入 → 写前 law 自检（evaluateGates，actor role=supervisor 结构面；deny 则不落盘 + 回执）→ tmp+rename 原子落盘 + baseHash CAS 受限重试（bounded，写冲突放弃并下轮重扫）；与 claim-validity（写者白名单/TTL 形状）/writer-identity（held→active 同写重置面）既有执法面**零规则改动**对接（0815-3「只换写者」映射兑现）。
- [x] `Add` receipt 最小面：终态/异常事件 → 结构化回执记录（append-only JSONL，run 维度）+ 尽力投递发起会话/人工（A8 裁定：死会话投递失败成文接受，投递失败不阻塞循环）+ `mdcontrol.status` 读面透出（既有 route 扩展，零新 route 面）。
- [x] `Add` sustain/trigger/restart seam：sustain/trigger = decision-core 声明接口（实现归 1411-2）；restart = 挂载时恢复扫描 seam（扫过期 claim/残留 awaitingClosure → 观察日志；回收/重派执行归 1411-2 reclaim trigger + WI29 完整语义）。
- [x] `Proof` supervisor 面：`node --test plugin/dsh/test/supervisor-core.test.mjs` ≥12 用例——decision-core 判定矩阵（构造 snapshot fixture × clock 注入：过期 claim 观察/awaitingClosure 观察/no-op/dispatch no-op 注记）、writer 面（CAS 写冲突拒绝 + 原子性 + law 自检 deny 不落盘）、receipt 面（记录追加 + 死投递容忍 + status 透出）、服务挂载/卸载（mount log + dispose 幂等）。命令：`node --test plugin/dsh/test/supervisor-core.test.mjs`（经 `./verify-age.sh` L2 同跑）。

Exit Criteria:

- [x] supervisor 服务挂载零宿主面新增；循环起搏 + 单飞 + 防抖行为有测试钉住
- [x] 机器字段写函数三面齐备（CAS + law 自检 + 原子落盘）；role=supervisor 写者经 claim-validity/writer-identity 白名单面零改动通过
- [x] `git diff --stat tools/mission-driver/src/engine.js` 为空；零新增 npm 运行时依赖
- [x] `pnpm --prefix tools/mission-driver test` + `./verify-age.sh` 全绿（基线只增不减：引擎 907 ≥904 / 插件 246 ≥223 / 真值表 113 =113）
- [x] `docs/logs/` 更新

## Phase 3 — 文档同步与回写

Targets: `tools/mission-driver/CONTEXT.md`、`docs/architecture/dsh-plugin-packaging.md`、roadmap、`docs/logs/`
Skill: none

- Item Types: `Add`
- Prereqs: Phase 2

- [x] `Add` 文档同步与回写：CONTEXT.md 增「守夜人」段（服务形态裁定/Q4 裁定/五职责 seam/decision-core 接口——1411-2/1411-3 消费注记）；dsh-plugin-packaging.md src 树条目（supervisor/ 目录 + changelog）；roadmap WI25 tick + 证据指针（服务模块 + 测试路径 + 三裁定指针 + 0815-3 claim 残项收口注记）+ 头部 Last Updated 同步；`docs/logs/` 收口条目。

Exit Criteria:

- [x] roadmap WI25 `[x]` + 证据指针；Last Updated 同步
- [x] CONTEXT.md / packaging doc 增量在位；`docs/logs/` 收口条目
- [x] `./verify-age.sh` 全绿（L2.5 corpus 自动覆盖本 plan——frontmatter 语料新增）

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-26-1411-1-m3-wi25-supervisor-service-seam-five-duties-1-a3f81c92 to ses_reviewer_2026-08-26-1411-1
- 2026-08-26：iteration 1，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-26-1411-1-m3-wi25-supervisor-service-seam-five-duties-1-a3f81c92（独立评审 ses_reviewer_2026-08-26-1411-1：baseline 全实证——plugin/dsh/src 清单无 supervisor/、service.ts:30-36/:63-72/:112-113、law-core.mjs:35 ACTOR_ROLES 含 supervisor、ledger-sections.mjs:528-554 谓词族、build-bundle.mjs:63-70/:221 verify-runner 预登记注记、law-policy.mjs:483、verify 键 ⊆ mission commands（test/verify-age）、测试基线 904/223/113 对账 WI24 回执、roadmap-write-guard 对 frontmatter-only 写 allow（audit-rounds 计量面无执法冲突）；WI25「或」分支裁定 + 五职责 seam 切片与 1411-2/-3 零缺口零重叠（dispatch 恒 no-op / 终态归 1411-3 边界钉住）；三 Decision rationale/备选/残险齐备；Prereqs 仅依赖已收口 M2 + 批内序；gate-check exit 0 allow；无阻塞项。非阻塞 4 项——① Phase 1 Item Types 声明含 Add 但无条目实携 Add（Add 义务落 Phase 2 模块头注，措辞可收紧）；② Decision 3 默认姿态无显式备选枚举（03 §4 opt-in 约束选择，guide rule 9 constrained 通道成立，可补一句 constrained 注记）；③ receipt JSONL 路径族未钉（执行期定，建议沿 _tmp/law-observations.jsonl 先例钉住防双发明）；④ Decision 1 残险「无」略强（CLI 仅文档 seam 相对 03 §6 是微小漂移面，可忽略）——均留任意后续触碰时顺带）

## Verification

- pass test gate-check-20260826T100739 basisHash=54f83c56356e00b479b290f6204013d8f0b7388697f08635ac673b9f7ade4655 exit=0
- pass verify-age gate-check-20260826T100739 basisHash=54f83c56356e00b479b290f6204013d8f0b7388697f08635ac673b9f7ade4655 exit=0

## Closure

- dispatch audit #audit-2026-08-26-130203-mission-driver-2026-08-26-1411-1-m3-wi25-supervisor-service-seam-five-duties-1-3e570c03 to ses_auditor_2026-08-26-130203 models={exec:zhipuai/glm-5.2,aud:zhipuai/glm-5.2}
- accepted #audit-2026-08-26-130203-mission-driver-2026-08-26-1411-1-m3-wi25-supervisor-service-seam-five-duties-1-3e570c03：approved——独立收口审计通过（2026-08-26，ses_auditor_2026-08-26-130203 独立 session；单模型 exec/aud 同型按 policy `downgrade: single-model` 声明如实记录，承 0950-1 先例）。① 计数域 20/20 全勾（Phase 1 三裁定 + 两 Exit、Phase 2 五职责 seam 五项 + Proof + 五 Exit、Phase 3 回写项 + 三 Exit）、无 `- [ ]` 残留、Draft Review Record iteration 1 回执在册（acceptable-as-is，四非阻塞项均注记留后续顺带）；② 工件实证（live 抽查）：`plugin/dsh/src/supervisor/` 五文件在库（decision-core.ts / watchdog.ts / writer.ts / receipt.ts / service.ts）；`service.ts` 挂载 `mdsupervisor` 第二 service publication（:96 注记 + :105 `ctx.effect` dispose + :145 mount log——零宿主面新增）；测试 `plugin/dsh/test/supervisor-core.test.mjs` 23 例（判定矩阵/writer CAS·law-deny·原子性/receipt/watchdog 起搏·单飞·防抖·恢复扫描/挂载 dispose 幂等）；③ 命令复跑：`gate-check <plan> --verify`（verify-runner）机械产出双 pass 行——test 引擎 907/907 + prompt-check OK exit=0、verify-age L1+L2+L2.5 GREEN exit=0，basisHash=54f83c56…4655 与当次 plan basis 一致；④ 不变量实证：`git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff）、零新增 npm 运行时依赖（package.json 无 diff）、dispatch 决策恒 no-op 观察姿态（1411-2 接线前存量宿主零无人值守推进）；⑤ 回写实证：roadmap WI25 `[x]` 全证据指针（服务模块 + 测试 23 例 + 三裁定指针 + 0815-3 claim 残项收口注记）+ 头部 `> Last Updated` 同步、CONTEXT.md「守夜人 seam」段在位、`docs/architecture/dsh-plugin-packaging.md` supervisor/ 树条目 + changelog 增量在位、`docs/logs/2026/08-26.md` 收口条目在册；⑥ Deferred 诚实性：唯一项「claim 生产发放面」与 Non-Goals（trigger 派发归 1411-2/WI26）对应且 Successor Required: yes 已登记，无 in-scope 缺陷藏匿 Deferred。结论：20/20 计数域全勾 + 双 pass 行 basisHash 绑定 + 本回执对满足 01 §5.2 完成派生公式。

### claim 生产发放面（execute 派发时签发给执行者）

- Classification: `watch-only residual`
- Why Not Blocking Closure: WI25 交付写者通道与 role 面；claim 的生产发放（execute 派发时签发给执行者 session）归 1411-2 派发面接线，接线前过渡期供给（EXECUTE prompt 指令）维持 0815-3 裁定不变，无新增残险。
- Successor Required: yes（1411-2 / M3-WI26 派发面）
