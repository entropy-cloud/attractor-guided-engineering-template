# AGE 自主运行架构 — 守夜人（Supervisor）

> Status: supported baseline（human 批准，2026-08-24）
> 定义连续自主运行的监督服务：五职责、触发沿、连续模式、幂等、崩溃恢复、失败面。执行保证由机器件构成，不委托给 AI。

## 1. Purpose

守夜人是「维持推进」的最小**确定性代码服务**（绝不是 AI 判断环节）。它不定业务顺序、不裁决（那些是 AI 与法律的事）、不写业务状态；它只写三类机器登记——计量（`audit-rounds`/`failures`）、认领（claim）、派发登记（dispatch）——并负责：该推进时推进、该派发时派发、该计量时计量、崩溃后续班。

## 2. 五职责

| 职责 | 行为 | 关键机制 |
| --- | --- | --- |
| **sustain** | agent idle 且账本有活 → 续轮 | followup（带 timeout）/ 子代理派发 |
| **trigger** | 账本变迁到待审态 → 派发独立评审 | 状态变迁触发规则（声明式） |
| **meter** | 计量记账 | 审计轮次/失败计数 → 账本 frontmatter；步数/墙钟 → scratch |
| **restart** | 崩溃重启读账本续班 | 恢复扫描（见 §6） |
| **receipt** | 终态/异常 → 账本/monitor/status 可查（push 形态不立项）；回执尽力投递发起会话/人工，死会话投递失败成文接受（A8 裁定 2026-08-24） | 回执到发起会话/人工 |

## 3. 触发沿（Liveness 的三条腿，互为兜底）

1. **事件沿**：账本文件被写（plan/roadmap；run-state / events 作为观察信号）→ watcher 事件 → 评估下一步（低延迟，交互时主导）。
2. **终态回执链**：一个 run 终态 → 立即评估 → 派发下一个。
3. **心跳轮询兜底**：每 N 秒全量扫一次账本（misfire/grace 模式）——处理事件丢失、宿主重启后残留。

**trigger 规则与门禁同源**：`missions/autonomy.policy.yml` 的 `triggers:` 段声明「何种账本谓词 → 派发/回收何种动作」（示例见 02-rule-law §3）；守夜人只执行声明式规则，不内置隐式顺序。

看门循环极简：扫账本 → 纯函数判定（要不要干、干什么）→ 派发（若有）→ 休眠。99% 时间空闲；判定函数确定性可测。

## 4. 连续模式

**连续模式 = roadmap 即队列**。不建独立队列 store——持久意图就是仓库本身（roadmap 的 todo 项 + `missions/*.json`）。

- 触发沿：run 终态链式 + 心跳扫描。
- 每 root 单活跃守卫（内存态，重启即清空，无需持久化恢复）天然提供 overlap-skip：同一 mission 同时最多一个 run；一个 run 内部允许多个 plan 各有各的 claim。
- **宿主 goal 注入权互斥**：mission 子代理不设 host goal；发起会话的 goal 由用户自管——守夜人不与宿主 goal-round-driver 竞争同一 agent 的 followup 注入权（goal-round-driver 在 agent idle 时注入续轮消息，双驱动争用同一会话会互相踩踏）。
- **Queue ≠ approval**：`held` plan 与 `draft` plan 均不被执行拾取。单个 held 不阻塞其他可执行 plan；只有当**不存在任何可执行/可评审的 open plan** 且 roadmap 仍有未勾项时，才暂停循环、按终态规则收口并回执，不绕过也不无限空转。
- **opt-in**：连续模式显式开启（DSH 会话一句「连续模式开工」/ 独立形态由 cron 声明），绝不使存量用户意外获得无人值守行为。

## 5. 幂等（at-most-once dispatch per occurrence）

- **幂等键是账本派生值，不另设 store**：`occurrenceKey = <planPath>#<occurrenceType>@<相关账本内容 hash8>`（occurrenceType ∈ review/execution/audit/reclaim）。重启后重扫账本，dispatch 行、accepted 行与 claim 字段直接回答「这活是否已派/已完/被谁持有」。
- **claim 登记 + TTL**：claim 在 plan frontmatter（`claim`/`claim-expires`，见 01-file-ledger §4.4）；同 plan 同时只有一个未过期 claim；过期或无产出 → 守夜人回收重派。
- **乐观锁**：机器字段（frontmatter/登记行）的写回用 hash CAS 串行化；若宿主 edit 无 CAS，则由守夜人作为唯一机器字段写者串行落盘（见 02-rule-law §4.5）。

## 6. 崩溃恢复

| 崩溃点 | 恢复动作 |
| --- | --- |
| 宿主/守夜人崩溃 | DSH 形态下守夜人寄生于宿主进程，宿主即其看门狗；宿主不在线则不推进（成文接受）。重启后服务重挂载 → **恢复扫描**：回收过期 claim、终态化残留 running、按 trigger 规则派发下一个。 |
| 子代理挂起 | idle 超时（followup timeout）→ cancel；claim TTL 到期 → 重派 |
| run 中途崩溃 | 账本收敛：checkbox 已勾项保留，未勾项由下个执行者接续（P3 中断即暂停） |
| 评审/审计派发后崩溃 | dispatch 行在账本内、结论行缺失 → 能恢复原 reviewer/auditor session 则 resume；不能恢复则对该 occurrence 写新 dispatch 行重派，不把单次崩溃计为计划失败 |
| 计量归零 | 审计轮次/失败计数在账本 frontmatter，跨重启不丢；scratch 临时量归零成文接受 |

**独立形态**的崩溃保证不依赖常驻进程：OS 级定时器（cron/launchd/CI）周期触发一次 CLI run，进程崩溃不影响下一周期（at-least-once + 幂等防重复）。

## 7. 卡死检测（无产出守卫）

- **停滞指纹**：账本（plans/roadmap）hash 与活动信号（events/session 工具活动）连续 N 轮无有效变化 → 判定停滞 → 升级（回执/熔断/进审计）。只盯账本 hash 会把「长任务尚未落盘」误判为空转，活动信号必须参与。
- **claim 无产出**：认领超过 TTL 无进展 → 回收。
- **idle 超时**：子代理 followup 超时 → cancel。
- **失败熔断**：同 plan `failures ≥ maxFailures` → held + 回执；全部 held → 终态化 blocked/partial + 回执。
- **往返检测**：账本状态振荡（如 plan 在 active↔held 反复横跳）→ 停滞检测收口。

## 8. 终态规则集（Termination）

谓词统一来自 01-file-ledger §5.2：`openPlans() = draftPlans() ∪ activePlans() ∪ heldPlans()`；`audit-rounds` 只计 mission 级 Deep Audit 轮次（01 §3.1）；「open finding」不设独立通道，一律体现为 plan/roadmap 未勾项。规则按 R1→R4 顺序求值：

- **R1（预算硬门）** 门禁先 deny 任何新的审计派发；终态求值条件 = `audit-rounds ≥ maxAuditRounds ∧ (activePlans()==0 ∨ activePlans() 全部处于 awaitingClosure)`：
  - 若 `roadmap 全 done ∧ openPlans()==0` → `completed`；
  - 否则 → `partial/blocked` + 回执（**不得**因预算耗尽而把未完成 roadmap 静默记为 completed）。仍有执行中 claim 的 active plan 时先让其跑完/到 awaitingClosure，不提前杀活。
- **R2（干净早退）** `audit-rounds ≥ 1 ∧ roadmap 全 done ∧ openPlans()==0` → `completed`。
- **R3（显式卡住）** `audit-rounds ≥ 1 ∧ draftPlans()==0 ∧ activePlans()==0 ∧ (roadmap 有未勾 ∨ heldPlans()>0)` → `partial/blocked` + 回执；有 draft plan 时继续评审，不得提前终态。
- **R4（停滞熔断）** 连续 N 轮账本与活动信号无有效变迁 → `blocked` + 回执；N 为策略配置，默认值由产品配置决定。

**终态映射纪律**：`partial/blocked` 是 M4 新增终态。DSH 形态走回执不依赖退出码；独立形态若由引擎/守夜人 CLI 暴露这两个终态，必须先作为独立立项修改冻结的 `EXIT_MAP` 契约并同步 `EXECUTION-PRINCIPLE.md §11`，不得在引擎存续期内静默增改。

## 9. 失败面诚实表

| 故障 | DSH 形态 | 独立形态 |
| --- | --- | --- |
| 宿主/守夜人崩溃 | 暂停；重启后恢复扫描续班（Level 0 账本 + Level 2 扫描） | 不受影响（OS 定时器） |
| 子代理挂起 | idle 超时 + claim TTL 重派 | 引擎 watchdog 等同 |
| AI 拒不选活 | 停滞检测 + 熔断 + 回执 | 同上 |
| 网络/模型故障 | transient 重试（引擎后端已有；守夜人形态沿用/重造） | 同上 |
| 预算耗尽/全 held | 终态 + 回执等人 | 同上 |

## 10. 与引擎后端的关系

- 引擎 = 无人值守执行后端之一（初期主后端），提供成熟的 transient 分类、退避、watchdog、预算、对账。
- 守夜人 = 未来若门禁+守夜人覆盖引擎全部职责，引擎退役（P4 判定门）；否则引擎留任。
- **P4 判定门判定面在库（M5-WI37，2026-08-27）**：引擎职责 → 门禁+守夜人覆盖矩阵（12 行）+ 累积 Deferred D1–D7 裁定 + 总判定 = **引擎留任主后端（条件退役）**——见 [06-engine-retirement-checklist](./06-engine-retirement-checklist.md)（living decision-gate artifact；execute 腿/运行域/冻结契约 = 引擎留任面，账本域职责已覆盖，退役执行归后继 mission 按缺口前置清单立项）。
- 二者共享同一账本/法律/完成定义，切换对信息层与验证层零感知。
- **看门约束**：DSH 形态守夜人是宿主插件服务，宿主存活 = 守夜人存活，不另造 watchdog 进程；独立形态由 OS 定时器承担。

## Changelog

- 2026-08-27（M5-WI37，plan `docs/plans/age-autonomy/2026-08-27-1023-1`）：§10 事实性指针增补（非契约变更）：P4 判定门判定清单在库——`06-engine-retirement-checklist.md` 覆盖矩阵 12 行（职责→覆盖→证据→缺口→判定三态）+ D1–D7 裁定（本 § 与 04 §6/roadmap「marker 迁移纪律」累积 Deferred 归本清单裁定）+ 总判定「引擎留任主后端（条件退役）」+ 缺口前置清单 G1–G6；execute 腿接线终审（D4）= 本轮不接线、前置条件成文（独立立项 + 真宿主长跑证据）。
- 2026-08-27（M3-WI30，plan `docs/plans/age-autonomy/2026-08-26-1954-3`）：§7 卡死检测执行面落地注记（非契约变更——设计基线即本文 §7，本条只记实现面）：**停滞指纹 + 活动信号检测器** = `plugin/dsh/src/supervisor/stagnation.ts` 纯函数（`computeLedgerFingerprint` = 排序后 (planPath → basisHash) 行 + roadmap 全文 hash 聚合——computeBasisHash 完成公式同源；**指纹域 = basisHash 域**（frontmatter + Phase + Closure Findings），DRR/Verification/Closure 追加在域外、dispatch/pass 行不重置指纹（评审派发 ≠ 进展）；一轮停滞 = 指纹不变 ∧ 活动窗口（默认 = 一个心跳周期）内 noteActivity 零命中——**活动信号必须参与**：有活动轮清零重积，长任务未落盘不误判（§7 字面，测试正例钉住）；往返检测腿 = per-plan 状态连续交替翻转计数，两态间 ≥ K 完整往返（2K 翻转）无终态进展 → 饱和注入 `{rounds: threshold, threshold}` → **同一 R4 出口**（§7「停滞检测收口」单出口纪律；第三态破对重计 / 终态 disposition 重置）；承载 = watchdog 持有内存 scratch 态（§6 归零成文接受——重启重积保守向，最多多等 N 轮不误杀）。**双入口同注入（1411-3 契约保持）**：检测器输出为 watchdog 持有单点，周期末端求值与 exec-arm `forwardTerminalDecision` 声明面入口（`ExecArmOptions.stagnationFact` 回调透传）同读同一状态——零单周期分歧，跨入口时序差 ≤ 一周期由幂等重评收敛（交叉用例钉住）。**N/K 阈值策略配置（§8 R4 N 落点）**：policy limits 单键 `stagnationRounds`（law-policy `resolveStagnationRounds` 双源：policy 权威 / `flows/mission-driver.json` 顶层回退键 / 双缺默认 10——30s 心跳 × 10 ≈ 5 分钟墙钟换算成文；0 = 检测器 off）；K 派生自同键 `max(2, floor(N/5))` 完整往返，无第二配置键（02 §3 单键单义）。检测器命中首跳落 `stagnation-detected` 观察回执（fingerprint/ping-pong 双措辞），终态沿 1411-3 既有 setTerminal 回执链零终态面改动。测试 `plugin/dsh/test/supervisor-recovery.test.mjs` 18 例（1954-2 份额 9 + 本 plan 份额 9——WI31 门 ≥8 超额：停滞指纹 N-1/N 边界 / 活动信号参与 / 往返检测 unit+e2e / 重启清零重积 / 双入口交叉 / partial/blocked 区分恢复语境变体 / 双源矩阵 + schema）。

- 2026-08-26（M3-WI29，plan `docs/plans/age-autonomy/2026-08-26-1954-2`）：§6 执行面落地注记（非契约变更——设计基线即本文 §6 崩溃恢复表，本条只记实现面）：**恢复扫描执行化** = `plugin/dsh/src/supervisor/recovery.ts`（watchdog start() 首周期 trigger='recovery' 前置运行，fail-soft 隔离，mission 终态停派优先，不受 §4 continuous 门——崩溃收尾非新无人值守推进，「恢复后链式继续」仍沿其门）。**守夜人恢复处置表（「终态化残留 running」的守夜人侧落点，逐字收录）**：① plan 带 claim：TTL 未到期不动作（等自然到期回收，死会话无活动信号不续期）、TTL 已过期走既有 reclaim trigger（1411-2，每周期求值已覆盖恢复周期）；② dispatch 无结论：本 plan resume-or-redispatch；③ awaitingClosure 停滞：既有 mechanical-verification/closure-audit trigger 面（1411-2）。引擎侧 run-state 孤儿归 `reap-orphans.mjs`（引擎既有职责，零引擎 diff）；DSH 形态 LiveRunRecord 内存态随进程消亡（无残留可清，ActiveRunGuard 重启即清空先例）。**resume-or-redispatch 语义**：dispatch 行结论缺失 × agents face 会话存活查询——存活 → resume（原会话 followup 注入，不写新行）；死 → 对同 occurrence 写**新 dispatch 行**（新 nonce8 id）重派，旧行 append-only 保留（01 §4.2 不删不改）；无 agents face（headless）→ stale 判定不可判，观察回执不动作（显式降级）；per-mount handled 集保证重复恢复周期零重复动作（跨重启重评沿账本幂等面）。**幂等面/评审租约最新行作答**：同 occurrence 多 dispatch 行时最末行作答（stale 行不占位）——`dispatchAlreadyRegistered`（deep-audit 面：最末行 paired → 开放下一轮）与 writer-identity 评审租约（持有者 = 最末 unpaired dispatch review 行 sessionId，superseded 行不持约，最末行配对即租约关闭——redispatch 后 plan 写面不锁死）单一语义面。**deep-audit 同 occurrence 重派零自增**（01 §3.1）：恢复重派复用已付轮次号、不写 audit-rounds 自增、audit-rounds-overflow 门禁同轮次重派豁免（耗尽预算后死会话在飞仍可重派——否则永不重派死锁）。**不计 failures**：恢复 redispatch 不计三桶（02 §4.6 不计清单增量行——「不把单次崩溃计为计划失败」字面落点）。测试 `plugin/dsh/test/supervisor-recovery.test.mjs` 9 例（本 plan 份额 7 + 边界 2；WI30 补停滞/往返至 WI31 门 ≥8）。

- 2026-08-26（M3-WI28，plan `docs/plans/age-autonomy/2026-08-26-1954-1`）：§4 连续模式执行面落地注记（非契约变更——设计基线即本文 §4，本条只记实现面）：**opt-in 门形状** = per-root 内存标志默认 off（`watchdog.ts` 构造选项/`setContinuous` face/`statusFace().continuous`；重启即清——§4「每 root 单活跃守卫（内存态，重启即清空）」同族；headless 经 bundle config `supervisor.continuous: true` 预启用 = 等价显式声明）+ `decision-core.ts` `applyContinuousGate`（off 时 dispatch 型 execute-posture 决策降级观察回执；meter-write/receipt 决策不受门——记账非无人值守派发）；**行为收紧裁定**：1411-2 现状「policy `triggers:` 段在场即 execute」收紧为需显式开启（收紧方向符合 §4「绝不使存量用户意外获得无人值守行为」，mount log BEHAVIOR TIGHTENING 句钉住可发现性）；**链式沿分层**：plan 级收口 ≠ 队列终态——连续模式 on 时每周期末端（含引擎 run 终态链沿 `emitTerminalEvent`）重评估 trigger 面继续推进，mission 级 terminal word（§8 R1–R4）命中才停派 + run-terminal 回执（语义零改动）；连续模式执行腿 = 引擎 run 领地（下一个引擎 run 的启动保持操作者发起直至 M4-WI33 评估——plan Deferred 登记在案）；路由面 `mdcontrol.continuous`（第六路由：opt-in toggle/查询）+ `mdcontrol.unlock`（第七路由：held plan 人工处置——unlock（held→active 同写 failures=0+移除 hold）/dispose（终态 disposition），经守夜人 writer role=supervisor 执行）；连续模式开启会话（route followup）登记为 run-terminal 回执投递目标（A8 尽力投递既有，死会话容忍）。

- 2026-08-26（M3-WI27，plan `docs/plans/age-autonomy/2026-08-26-1411-3`）：§8 R1–R4 执行面落地注记（非契约变更——设计基线即本文 §8，本条只记实现面）：求值核心 `plugin/dsh/src/supervisor/terminal-rules.ts` `evaluateTermination`（R1→R4 序贯、首条命中即决；R1 三岔含「active 带未过期 claim → continue」；partial/blocked 显式区分 = blocked↔R3∧held>0 ∨ R4 / partial↔R1 未全 done ∨ R3∧held==0；复合声明值 `partial/blocked` 归一单点在核心；stagnation 注入接口钉住、检测本体归 WI30）；两入口同一实现 = 看门循环周期末端求值 + policy 末条 trigger 的 terminal 声明面（1411-2 决策对象经同一核心执行，core continue 恒压声明）；终态落点 = 回执（run-terminal receipt + A8 尽力投递 + onTerminal 链）+ `mdcontrol.status` 透出（statusFace().terminal）+ 循环停派（该 mission run 的 execute-posture 命中抑制，mount 内粘滞、跨重启重扫描幂等重评、零新 store）；§7 失败熔断执行面 = `failures.ts` 三桶归因（02 §4.6 增量互指）+ `applyCircuitBreaker`（held 同写清 claim；单 held 不阻塞；全 held 经 §8 核心终态化）；R1 与 audit-rounds-overflow deny 面互补注记（门禁拒新审计派发 + 守夜人收口双面，一个预算）。
