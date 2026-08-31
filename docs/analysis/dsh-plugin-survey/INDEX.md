# dsh-plugin-survey — 插件调研索引

> Date: 2026-08-24
> 方法：每个插件由独立子代理源码级调研（README/ARCHITECTURE/核心 src，file:line 引用），报告结构统一（元信息 / 定位 / 架构机制 / Adopt-Adapt-Reject 映射本项目线程 / 风险 / 源码索引）。插件本体在 `~/ai/dsh-plugins/<同名目录>/`。
> 服务对象：`docs/analysis/2026-08-24-0000`（agent 复用/prompt DSL）、`-0001`（运行模式/控制面）、`-0002`（最小外化记忆与执行器分离）、`docs/discussions/2026-08-24-roadmap-plan-frontmatter-reform.md`。

## 报告清单（20 份）

### 核心编排 / 循环 / 队列

| 报告 | 一句话结论（对本项目最有价值的点） |
| --- | --- |
| [dsh_workflow](./dsh_workflow.md) | pause 机器维持否决；但 cache 续跑语义、快照重跑分流、catalog 原子写（tmp+link 不覆盖）、单次无工具修复、admission 共享校验五项 Adopt；capability VM 列为 prompt DSL 的隔离预案（暂缓） |
| [dsh-automation](./dsh-automation.md) | 设计文档与源码高度一致（三处偏差已标注）；Adopt 确定性键幂等认领、激活边界、skip 审计记录、fresh-agent 快照冻结、Queue≠approval 三层；Reject 其 KvTable store（撞状态外化红线）——roadmap-as-queue 只取语义不取 store |
| [dsh-background-agents](./dsh-background-agents.md) | 里程碑通知的完整参照：三种 fact kind 具体提案 + 节流水印 `-1` 哨兵 + per-parent gate；FactAppender 三态版本探测（宿主 rc 兼容坑）值得抄进任何写 session append 的代码 |
| [DSH-pipeline-kernel](./DSH-pipeline-kernel.md) | 崩溃恢复三件套（`routing:pending`+routeKey+parent 标签）、watchdog"语义静止判死+冷却回滚"；pipeline-as-config-row 与 flow JSON 同构成立但拓扑归属不同（它拓扑进配置、我们拓扑进 roadmap）；附带发现其 web.js 未定义变量 bug |
| [dsh-loop-dock](./dsh-loop-dock.md) | StepExecutor seam 与 provider-spec **不是等价物**（执行器层 vs 循环形态层，正交可叠）；strategy/driver 两 kind 分类与 LOOP_SWITCH 绑定语义可照抄——角色池异构 loop 的远期接口样本 |
| [dsh-agent-relay](./dsh-agent-relay.md) | **"不引入总线"裁定成立**：租约/TTL/幂等的靶子全是进程边界，同进程无一适用；receipts 重放映射 run 恢复可借模式；推翻裁定的三个未来场景（多 CLI 舰队 cross-review / MC 独立进程 / 跨重启待办队列）已记录 |

### Agent 组织 / 自进化

| 报告 | 一句话结论 |
| --- | --- |
| [dsh-agent-teams](./dsh-agent-teams.md) | **attemptId 代际令牌 + parked/cold-recovered 分界直接回答池化续用 vs 崩溃 resume 的判据问题**（Adopt）；两阶段 handoff 接管、mailbox 租约投递可 Adapt；全量磁盘持久化 Reject；防 anchoring 轮换需自研（它没有） |
| [ouroboros](./ouroboros.md) | 停滞/振荡/回归三件套 + findings_hash 平台期检测 → DEEP_AUDIT 停止判据增强候选；force 旁路诚实留痕 → solo-review 盖章；核心辨析：它进化产品规格（治理常数写死），我们进化方法论本身——方向相反故只借机制不借形态 |
| [dsh-plugin-agent-workflow](./dsh-plugin-agent-workflow.md) | **前提修正：不是 workflow 执行引擎**，是纯浏览器端只读可视化（session 事件投影为执行链路）；纯函数投影 + anchorSeq 增量快照构建器 Adopt（DEEP_AUDIT 回放可用）；反向印证 monitor 只读投影纪律 |

### 先例核对 / 工件恢复

| 报告 | 一句话结论 |
| --- | --- |
| [dsh-anchored-standard](./dsh-anchored-standard.md) | AGE preset（WI14）借用组合形状无关键遗漏；真增量在工程惯例层：once-per-session durable 去重、mount-time fail-fast + 运行时降级纪律、可选 skill-search 式按需加载省 token；两阶段门本体判 Reject |
| [DSH-better-sidebar](./DSH-better-sidebar.md) | 三项已借先例全部源码确证且 dual-form 比 WI15 简报所述更成熟；wire-method record + 单 prefix 派发形状核实；**WI15 reopen 可取清单 7 项**（含 client 注册面成熟度证据） |
| [dsh-turn-rewind](./dsh-turn-rewind.md) | 快照回滚 vs 工件收敛是**前提关系非优劣关系**：有权威计划工件时快照即冗余——git-commit-per-phase + checkbox 已覆盖其价值；journal 六态机+启动 reconcile+CAS 两段式写的 durability 纪律可借给 events.jsonl |

### 门控 / 验收 / 开发闭环（goal 三件套 + spec/inspect）

| 报告 | 一句话结论 |
| --- | --- |
| [dsh-goal-quiescence](./dsh-goal-quiescence.md) | R1 引用全部属实并精化（acknowledged 是 settled 记录上的布尔位）；"自己 ack 自己"再次坐实 gate ≠ reviewer；RunRecord 状态机与 ack 注入语义已逐行落档；**补充**：依赖内置 goal 的 complete 门禁，是 dsh-goal-domain 的强化层 |
| [goal-acceptance](./goal-acceptance.md) | 两处修正 R1：工具实为 **13 个**非 9 个；Cordis 包 `startGoal` 后续目标退化为 InMemoryStore——"session 事件流为权威"仅对默认目标成立（重要限定）；**补充**：有独立 goal 概念，不依赖 `ctx.goals`，与内置 goal 域并存 |
| [dsh-goal-scaffold](./dsh-goal-scaffold.md) | plan.md 模板与 maxGoalRounds:5 都只活在提示串里——无机械看守，与我们 frontmatter 改造（完成派生化）形成鲜明反差例证；**修正**：maxGoalRounds 实际由 dsh-goal 内部解析并持久化，scaffold 的提示只是建议值 |
| [dsh-spec-loop](./dsh-spec-loop.md) | **门控并非用官方 workflow 引擎**（前提修正）：会话投影折叠标准事件 + 命令级守卫；批准态存 per-session 投影（反证我们 plan 落盘更优）；「声明式 bash 验证先于 judge」+ `OK\|FAIL` 单行判定格式 → CLOSURE_AUDIT 增强 Adopt 候选 |
| [dsh-inspect](./dsh-inspect.md) | checkup→fix→review 与 DEEP_AUDIT→DRAFT_PLANS→EXECUTE 外环同构成立；复查独立性五层机制（fresh 上下文/对抗提示词/证据强制/红队二阶证伪/失败不伪装）值得按 AGENTS.md 规则 15 并入 audit prompt；硬局限：默认同源同模型 |
| [dsh-plannotator](./dsh-plannotator.md) | 反馈回传靠宿主 pending interaction custom 字段零新增持久化；三层锚定消歧+FNV 版本戳可脱 DOM 化为我们纯文本批注规范；作为 WI15 reopen 的轻量 client-plugin 第二例证（~700 行下界），poll-free 容忍条件反证 monitor SSE 裁定不变 |

## 未出报告的插件及理由

| 插件 | 理由 |
| --- | --- |
| DSH-taskboard / dashi-taskboard | 任务板 UI，SQLite/HTTP 权威范式与本仓状态外化原则相逆；DSH-taskboard 的"SQLite 唯一权威"立场已在 R1 §4 对照表覆盖 |
| DSH-Plan-Graph / dsh-task-dag | 轨迹 DAG 可视化，monitor 面板延期裁定（WI15）下无近期消费方；reopen 时随 better-sidebar/plannotator 两报告一并参考 |
| dsh-web-ui | 皮肤/看板合集，仅 WI15 reopen 时有消费方 |
| dsh-market / DSH-Plugins-Marketplace / dshfind | 分发渠道，属交付期议题非实现期；安装方式速查已在 `~/ai/dsh-plugins/INDEX.md` |
| dsh-goal-mode-enhance | goal 可视化 UI，无引擎侧增量 |
| mirage / modsearch / modlens / dsh-visualize / last30days-skill-cn | 能力扩展类（VFS/搜索/视觉/卡片/技能样例），与 mission loop 无交集 |
| petdex / dsh-deep-whale / dsh-TUI / vox-director / OpenBiliClaw / deepseek-harness-desktop / dsh-launcher | 桌宠/皮肤/TUI/内容类/桌面壳/启动器，不相关 |

### 深度源码调研（job / plan / goal 核心机制）

| 报告 | 一句话结论 |
| --- | --- |
| [dsh-goal-domain](./dsh-goal-domain.md) | DSH 内置同会话目标系统：四包（goal 核心服务 + tool-goal 模型工具 + goal-round-driver 续跑驱动 + command-goal /goal 命令），事件溯源持久化到 session log，armed/disarmed 激活永不持久化；Adopt 事件溯源唯一权威 + phase/activation 分离 + CAS revision + 严格重放 + blocked 统一原因码，Reject 同会话限制/单目标/无独立评估器/无调度重试 |
| [dsh-job-plan-deep-dive](./dsh-job-plan-deep-dive.md) | job 是进程内 owner-scoped 后台任务注册表（producer 插件 start → read/kill/wait），plan 是 per-session prompt 立场切换（/plan + exit_plan_mode 审查门）——两者正交；Adopt job 的 owner 隔离 + first-wins settlement + 稳定 tool schema，Reject in-memory 持久化和 plan-as-prompt-toggle 语义 |

## 交叉综合（对既有分析报告的影响）

详见各报告 §3 与下列增补：
- 0000 报告增补 §9：agent-teams 的 attemptId/parked-cold 分界补强 P2 池化判据；ouroboros 停止信号补强 DEEP_AUDIT。
- 0001 报告增补 §8：automation 幂等认领/激活边界落地为 queue 策略参数；relay 推翻场景清单入档。
- frontmatter 讨论稿增补 §9：spec-loop 的 bash-before-judge + OK|FAIL 格式 → CLOSURE_AUDIT 增强；inspect 五层独立性 → audit prompt 规则 15 提升；scaffold 反差例证强化 completed 派生化论证。
- job-plan-deep-dive 增补：job 的 owner 隔离 + first-wins settlement + producer 插件模式 → 本项目后台任务设计参照；plan 的 reviewed exit gate → CLOSURE_AUDIT 人类签收参照；plan-as-prompt-toggle 与本项目 plan 文件工作流语义不匹配，明确 Reject。
- dsh-goal-domain 增补：DSH 内置 goal 四包系统（goal 核心 + tool-goal + goal-round-driver + command-goal）→ 事件溯源/phase-activation 分离/CAS revision/严格重放/blocked 统一原因码 Adopt；同会话限制/单目标/无评估器/无调度 Reject。修正 goal-scaffold 调研中"maxGoalRounds 靠模型自觉"的说法——实际由 dsh-goal 内部解析并持久化。
