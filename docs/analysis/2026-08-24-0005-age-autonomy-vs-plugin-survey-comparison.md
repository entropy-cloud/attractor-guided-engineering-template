# AGE Autonomy vs dsh-plugin-survey 插件设计 — 对比评估

> Status: analysis（对比评估；不改 roadmap）
> Date: 2026-08-24
> 对比对象：`docs/design/age-autonomy/{00–05}`（候选基线）+ `docs/backlog/age-autonomy-implementation-roadmap.md`；`docs/analysis/dsh-plugin-survey/` 18 份报告（含 INDEX 交叉综合）
> 方法：逐组件对照 + 三条「本质轴」判定；判断区分「结构事实 / 我的推理」。
> 结论一句话：**架构上更本质（三条轴），但仍是纸面设计；判为「更优」前必须补五个调研已点名的缺口，且「更本质」的边界要诚实划定。**

## 1. 三条本质轴：AGE 相对于整个插件族的结构差异

调研的 18 个插件（含 R1 对照的宿主原生机制）在状态、机制、独立性三个维度上**全部落入同一范式**，而 AGE 设计在每条轴上都是范式级差异：

| 轴 | 插件族范式（survey 证据） | AGE 设计 | 判据 |
| --- | --- | --- | --- |
| **状态** | 存「执行痕迹」：会话事件（goal-acceptance/spec-loop）、KvTable（dsh-automation）、SQLite（DSH-taskboard，R1 已 Reject）、全量落盘 team.json（agent-teams）、快照树（turn-rewind） | 存「意图工件」：roadmap/plan checkbox + frontmatter；执行态全部派生 | turn-rewind 报告自己给出「前提关系」结论：**有权威计划工件时快照即冗余**；agent-teams/automation 的 store 全部撞零记忆红线被 Reject。AGE 把「一致性」从需要维护的状态变成不存在的状态——这是最本质的一条 |
| **机制** | 规则埋在插件代码/提示词里：claim 在 service.ts（automation）、门禁在 command handler（spec-loop）、协议写进 prompt（agent-teams scheduler.ts:91-102） | 规则 = 纯函数（真值表可测）+ 声明式策略数据，**同一实现跑 pre-execute / CI / CLI 三部署面**（02 §6） | survey 反复标注宿主 rc API 强绑定、零移植性；AGE 是唯一把「法律」做成与部署面正交的层——宿主耦合被降为其中一个部署面 |
| **独立性** | 全部自评：criteria 自报 pass（goal-acceptance）、flash 单模型 judge（spec-loop）、LLM 自评分（ouroboros）、inspect 五层独立性是最强先例但自限「默认同源同模型」 | 结构性独立：第二 agent 派发 + dispatch/accepted 回执绑定 + nonce（02 §4.1） | 没有插件把「验收者必须是另一个派发」做成机器结构；独立性的机械保证只有 AGE 设计 |

**结论（我的推理）**：没有任何一个调研插件同时具备三条轴中的两条以上；AGE 三轴齐备。这支持「更本质」的判断——但它是**架构性**的，不是**已验证**的。

## 2. 逐组件对照（设计已吸收 vs 仍未吸收）

### 已吸收（设计文档中有迹可循，多数经 0000/0001 增补入档）

| 插件来源 | 吸收点 | 落点 |
| --- | --- | --- |
| dsh-automation | occurrenceKey 确定性幂等键、Queue≠approval、快照冻结、activate 边界 | 03 §5 occurrenceKey、03 §4 Queue≠approval（roadmap 即队列） |
| dsh-agent-teams | attemptId 代际令牌、parked/cold 分界、retired deny-list 思想 | 04 §2.3 代际令牌、池成员 idle TTL dispose |
| ouroboros | 停滞/振荡/回归熔断 → R1–R4 + 往返检测 | 03 §7 停滞指纹（账本 hash + 活动信号）、R4 停滞熔断 |
| DSH-pipeline-kernel | 语义静止判死（updatedAt 窗 + idle）| 03 §7 与 §3 心跳轮询 |
| dsh-background-agents | 双通道纪律（ignorable fact + notice）、协作中断 | 05 收尾回执、03 receipt 职责 |
| turn-rewind | 工件收敛胜于快照（前提关系论证） | 00-overview P1/P3/P4（收敛式重跑） |
| spec-loop | 声明式验证先于 judge、PASS\|FAIL 行格式 | 02 §5 BUILD_VERIFY 机械化（先机械验证再派 Closure Audit） |
| dsh-goal-scaffold | 反例：无机械看守的 checklist | 01 §5.2 完成派生化（直接针对该反例） |

### 仍未吸收（调研已点名、设计未携带 — 判「更优」前必须补齐的五项）

| # | 缺口 | 来源 | 建议落点 |
| --- | --- | --- | --- |
| N1 | **里程碑通知三件套**：per-run 水印哨兵（lastReportAt=-1）、活动刷新、quiet/wakeup 两档投递 | background-agents（INDEX：里程碑通知完整参照） | 03 receipt 职责细化为 fact 三 kind（started/milestone/finished）+ 水印；直接缓解 G6「人侧异常通道静默」 |
| N2 | **审计停止信号贫乏**：AGE 只有 audit-rounds 预算 + R1–R4；ouroboros 有 6 个互补停止信号（outcome 通过/代数硬顶/停滞窗/评分平台期 ε/振荡/等级回归），其中平台期检测（findings_hash 无变化）是 0000 §9 已点名的 Adopt 候选 | ouroboros convergence.py | 03 R1–R4 或 trigger DSL 增「deep-audit findings 平台期」停止判据；入 WI17/trigger 用例 |
| N3 | **失败分类词汇表**：automation 的枚举错误码（host_interrupted/persistence_error/definition_deleted/workspace_unavailable/timeout/executor_error）既是有界 retention 也是归因词汇 | dsh-automation §3 Adapt | 01 §6 failures 归因细则（G10 的直接解药）：归因从自由文本变为枚举 |
| N4 | **机器字段写入的 journal/reconcile 运维纪律**：turn-rewind 六态机 + 启动对账 + CAS 两段写、pipeline-kernel routing:pending 三件套——claim/dispatch 落账本的原子性目前只有「CAS 或守夜人串行」二选一（02 §4.5），缺对账纪律 | turn-rewind §3 Adopt 1/2、pipeline-kernel | P2 落地时（WI25/29 崩溃恢复扫描）引入「写前比对、漂移即重读重试 + 启动对账」 |
| N5 | **阶段间人工 gate 与 attempt 上限**：pipeline-kernel 明确点名为 flow JSON 真缺口（gates.after / strikeOut） | DSH-pipeline-kernel §3 | roadmap 候选 WI：plan 或 roadmap 级「阶段间人工确认点」声明字段 |

## 3. 诚实的边界：「更本质」只在意图驱动文档循环域内成立

- **域内**（意图驱动、文档产出、跨 session 跨机器交付）：三条轴是结构性的；插件族无一可及。
- **域外**：通用调度（RRULE 时区展开、dsh-automation recurrence.ts）、自由拓扑与角色集（pipeline-kernel chain）、快照恢复（turn-rewind 对无工件工作区是唯一退路）、交互式面试门控（ouroboros Socratic 入口——survey 判 Reject 合理）——这些 AGE **刻意不做**，不是做不到。声称「全面更优」是错的；「在自己的域内更本质」才是准确的表述。
- **一条共享硬限制**：inspect 报告自限「默认同源同模型」——这正是本评审 G4 指出的「结构性独立 ≠ 统计独立」。AGE 的审计回执绑定在独立性上超越全部插件族，但**模型族同源这一点与 inspect 共享同一天花板**。调研没有提供解法，反而确证了 G4 需要独立对策（抽样人工复核 / 审计换模型 / 驳回率度量）。

## 4. 判语

1. **对比结果**：在三条本质轴上，AGE 设计 > 全部 18 个调研插件（含 R1 对照的宿主原生 goals/plan/todos）；插件族的亮点全部落入「可吸收模式」而非「架构替代物」。
2. **更本质？** 是——前提是三条轴落地（账本 frontmatter、门禁纯函数、回执绑定）且补齐 N1–N5。设计是**候选基线**，插件是**运行代码**：本质性是架构主张，不是已验证事实。
3. **落地的第一性检查**：N1（通知三件套）与 N3（归因词汇表）是纯文档级增补，零机制代价，可随 M2/M3 直接并入；N2 进 trigger DSL 用例；N4 进 P2 实测；N5 作为独立 WI 候选排入 backlog。

## 5. 源码索引（本评估引用）

- survey INDEX.md（18 报告一句话结论 + 交叉综合）
- dsh-automation.md §3（occurrenceKey/Queue≠approval/KvTable Reject/错误码枚举）
- dsh-agent-teams.md §3（attemptId/parked-cold/全量落盘 Reject/无自动轮换）
- ouroboros.md §3（六停止信号/计算权威门/平台期检测/自进化方向辨析）
- dsh-turn-rewind.md §3（前提关系论证/journal 纪律）
- dsh-spec-loop.md §3（bash-before-judge/自评 judge 劣势/批准态位置）
- DSH-pipeline-kernel.md §3（恢复三件套/人工 gate/attempt 上限）
- dsh-background-agents.md §3（水印三件套/fact 三 kind）
- dsh-inspect.md（五层独立性 + 同源同模型硬局限）

## 6. 修订对照（2026-08-24 晚；A1/A2/A7/P8 落地后，对比基准 = 本报告 §1–§3）

> 首版 §1 判 AGE 三轴超越但不含下列四项机制；A1（信任模型）、A2/P8（执法层自护）、A7（具名 agents/dispatch + requireDistinctModel + model lineage）落地后，**四根轴从「架构主张」变为「独有机理」**。

| 轴 | 当前设计（修订后） | 插件族最强先例 | 判定 |
| --- | --- | --- | --- |
| **独立性机制** | audit agent `requireDistinctModel` 派发时强制（provider/model 对）；dispatch 行 model lineage；驳回率按 (exec, aud) 模型对可统计；单模型部署显式降级不静默 | inspect 五层独立性但自限「默认同源同模型」；ouroboros/spec-loop LLM 自评；agent-teams 无审计概念 | **从「共享天花板」到「机制化突破」**：多模型部署下首次把「审计者 ≠ 执行者」变成机器强制 + 可测数据；单模型部署与 inspect 同层，但降级是显式的 |
| **执法免疫** | P8 + Protected Areas（ask-first）+ 路径护栏 deny + CI merge-blocking：被执法者不得改写执法者自身（agents 段含审计者 charter/model） | agent-teams captain 中心授权（角色权威而非文件保护）；spec-loop 门禁在命令 handler（同 agent 可改）；ouroboros 治理常数硬编码（人工改） | **独有**：无任何插件封闭了「执法者文件」这个面；AGE 从结构上根除单点失效 |
| **信任模型显式化** | 分层：护栏默认 + 三处对抗级（回执/law/终态冻结）+ bash 旁路成文降级 + 重开触发 | dsh-automation fail-closed approval（单一姿态、绝不挂起等人）；其余插件未声明 | **更细**：automation 的 fail-closed 是「人永不介入」的无人值守偏好，AGE 是「防护与成本对齐 + 显式降级面 + 升级路径」——适配性更强，代价是 R3/held 确实等人（功能而非缺陷） |
| **宿主面纪律** | host goals/plan/todos authority-discipline 行（会话临时刻写、账本唯一权威、不回流）+ 守夜人与 goal-round-driver 注入权互斥 | goal-acceptance/spec-loop 状态全在宿主会话事件投影；goal-scaffold checklist 无机械看守 | **独有**：第二真相通道在 AGE 是被显式排除的纪律，插件族是默认的存储形态 |
| **具名 agent 契约/部署分离** | `agents:`（组合+池化+模型+独立性旗标）单源 policy（P8）；`dispatch:` 派发类型→agent；plan `agent:` 有界名引用；契约层零模型零配置 | agent-teams 每 member 能力 + captain 调度 + 全量落盘（零记忆红线外）；宿主 preset roster 只有组合面无模型面 | **结构差异**：agent-teams 的「成员」是运行时实体，AGE 的「agent」是部署数据——执行形态解耦（同 roadmap 换部署只改 policy agents 段）；plan 级 audit 路由（如重审计）无插件提供 |

### 6.1 仍未赶上的五项（与首版 §2 的 N1–N5 相同，纸面差距不变）

N1 里程碑通知三件套（background-agents 水印/quiet-wakeup 仍领先）、N2 ouroboros 六停止信号（findings 平台期仍未携带）、N3 automation 错误码枚举（归因仍自由文本）、N4 journal/reconcile 运维纪律（02 §4.5 三选一并未完成）、N5 阶段间人工 gate 字段（pipeline-kernel 点名缺口）。**这五项是「落地时吸收」清单，不是架构劣势。**

> **2026-08-24 晚修订（human 定位裁定，讨论记录 A8）**：产品定位 = 长时间自主运行 + 部分查看能力（pull 式，无实时通知）→ **N1 不做**（推送面与定位相斥；中间过程用 monitor 9300 + mdcontrol.status，终态走回执）；**N5 明确不做**（阶段间人工 gate 反自主；人工边缘只在收尾回执点）。N2/N3/N4 不受影响，按原归属落地（M2/M3/P2）。G6 处置：中间态静默成文为有意，终态可随时从账本/monitor/status 读到。

### 6.2 保留的诚实限制

1. 对比仍是「架构主张 vs 运行代码」——requireDistinctModel 的强度取决于部署是否真提供多模型；
2. 新增的 agents/dispatch 面本身是新的实现与测试负担（WI13/WI24 已接）；
3. 插件族的「运行时实体」经验（mailbox 租约、parked/cold、两阶段 handoff）在 AGE 单执行形态下不需要，但若未来多执行形态并存（A3 已裁定不会），它们是现成蓝本。