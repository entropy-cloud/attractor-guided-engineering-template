# LongHorizon-Harness 对照评审：mission-driver 差异与 DSH 插件设计补充点

> Status: discussion / 外部参照对比（非审核记录；供 human 与后续立项参考）
> Date: 2026-08-24
> 参照对象: [AMAP-ML/LongHorizon-Harness](https://github.com/AMAP-ML/LongHorizon-Harness) @ a1dd930（本地克隆 `~/ai/LongHorizon-Harness`，MIT）
> Scope: 本仓库 mission-driver（`tools/mission-driver/`）与 DSH 插件设计（`docs/design/dsh-plugin-integration.md`、`docs/architecture/dsh-plugin-packaging.md`）；不修改任何受护文件
> Method: 通读 LHH 源码（`src/lh_harness/`，54 个 Python 文件）与本仓库插件实现后逐条对照；引用的 LHH 符号均已 grep 核实存在

## 一、定位差异（为何值得对照）

两者同属"循环工程"——不训练模型，给现有 coding agent 套执行环。但控制权归属相反：

| 维度 | LongHorizon-Harness | mission-driver |
| --- | --- | --- |
| 循环主导者 | LLM Manager：每轮读状态后路由（`Next: gui\|cli\|done\|blocked\|ask`），见 `src/lh_harness/manager.py` | 确定性引擎：Flow JSON 状态机驱动转移，AI 只做步骤内工作 |
| 角色结构 | Manage-Execute-Audit 三角色严格分离，每轮三个独立 fresh-context 调用；manager 300s / executor 1800s / auditor 300s，25 轮上限 | 单一 worker 角色 + 确定性 check 脚本；审计发生在 closure / deep-audit 子流程 |
| 状态载体 | 追加式自然语言台账（rounds.jsonl + task_state.txt + 审计报告），跨轮上下文靠提示词重建并按字符截断 | 结构化磁盘文件（roadmap → plans checkbox/frontmatter → run-state.json），零参数传递全走磁盘 |
| 验证模型 | LLM auditor 优先 + harness 级守卫（快照对账、工具 deny-list、格式自修复、删除声明与 diff 对账） | 确定性脚本优先（plan-check.mjs）+ closure/build verify + deep audit P0/P1/P2 分诊 |
| 失败分类 | 显式区分运行时故障 vs 任务失败（`runtime_signals.py`）：超时合成 `Next: invalid` 进下一轮而非中止 run | transient-fault backoff + marker correction retry，无系统分类法 |
| 完成权威 | auditor complete+clean+aligned 三条件同时成立才收口；非空阻断约束时强制降级 | 结构上更强：DRAFT_PLANS 的 `done` 出口已删除，完成由引擎 audit-gate 判定 |

结论：AGE 在「完成派生」「确定性引擎」两点上比 LHH 更彻底；LHH 在**审计者完整性保障、故障分类学、终态保证**三点上比 AGE 成熟。

## 二、可借鉴机制（按价值排序）

### B1 审计者完整性保障（价值最高）

LHH 做法（`adapters/claude_permissions.py::policy_for_role`、`auditor_agent.py`）：auditor 按角色禁写工具（deny Write/Edit/Bash）；适配器在 auditor episode 前后做 workspace 快照 diff，检测到「验证者改了现场」即标记 `verifier_workspace_mutation_detected` 并把报告降级为 violation/blocked。

AGE 缺口：closure-audit / deep-audit 步骤没有任何机制阻止审计者污染账本或工作区。DSH 插件 native 形态下 child agent 继承宿主工具目录，该缺口被放大（审计子代理与执行子代理能力完全同权）。

### B2 运行时故障 vs 任务失败的分类契约

LHH `runtime_signals.py` + `classify_agent_runtime_failure`：AGENT_EXIT≠0、连接错误等判为环境类可恢复故障——timeout 合成 `Next: invalid` 反馈进下一轮继续，不计为任务失败；只有非 timeout 的运行时失败才中止 run。AGE 有 backoff 与 correction retry，但没有「哪些故障属于哪类、各走什么恢复路径」的成文契约。

### B3 终态保证

LHH `manager.run()` 外层捕获 BaseException，任何崩溃路径都落终态 report.json（complete/cancelled/failed/blocked/incomplete 五态）。AGE 的 analyze skill 读「最近一次 run」，若进程被 kill -9 或宿主崩溃，run 可能永远停在中间态——analyze 读到的是没有终局的记录。

### B4 其余可选项

- **恢复感知预算**：resume 后预算 = 已完成轮数 + 新增额度（防重启刷预算）。AGE 无轮次预算概念，若未来引入 auditRound 上限需注意。
- **轨迹密钥脱敏**：LHH adapter 层统一 scrub 后才写 trajectory 文件。AGE 的 driver 子进程日志目前未脱敏。
- **并发隔离先例**：LHH 用 flock 幂等键 + uuid 化工件支持多 run 并行目录隔离。AGE 单 projectRoot 单活动 guard 是对的起步，但它是进程内内存态（见下 G3 关联）。
- **DSH 后端先例**：LHH 自带 `DeepSeekHarnessAdapter`（dsh headless + 隔离 `DSH_HOME`），是第三方把 DSH 当执行后端的现成参照。

## 三、dsh-plugin-integration.md 建议补充的四点

设计文档整体质量高（owner-doc 定位清晰、实现细节正确下放 packaging 文档、as-built 注记纪律好）。以下针对 native 后端特有风险，建议进 `docs/architecture/dsh-plugin-packaging.md` §Behavioral differences 或本设计文档 Concept Mapping 表：

### G1 native 模式下审计子代理的工具约束（对应 B1）

现状：文档 §Concept Mapping 只写了「in-process child agent dispatch」，未约束 closure-audit 类 child 的工具面。风险：审计者与执行者同权读写账本，AGE「账本外化 + 完成派生」的信任模型在最需要独立的环节失去结构独立性。建议：明确 closure-audit / deep-audit 子代理是否需要 deny-list 工具或快照对账；若宿主 preset roster 不支持 per-child 工具裁剪，记录为已知边界。

### G2 宿主崩溃时 native run 的恢复语义

现状：standalone 形态有 `reconcileStaleRuns`（PID 对账）+ 从 CHECK 重入；native 形态 detached task 随宿主进程死亡，异步 job 注册表的句柄全部失效。磁盘工件虽共享语义，但文档没有写明：宿主重启后 `mdcontrol.status` 对死 job 返回什么、run 如何被认领续跑（还是只能人工重入）。建议：补一段 native job 的陈旧句柄对账策略（至少声明「重启后 status 报 stale、恢复走 standalone 同款重入路径」）。

### G3 运行时故障分类契约（对应 B2）

现状：§Concept Mapping 只写了 watchdog 形态变化（SIGTERM→abort signal + dispose），未定义 native 下哪些算可恢复瞬态故障（agents 服务暂不可用、quiescence 超时、宿主重载插件）、哪些应终止 run 并落终态。engine-bridge 已做到「缺 agents 服务显式报错不静默降级」，但报错之后的 run 归宿没有成文。

### G4 轨迹落盘位置与脱敏（对应 B3/B4）

现状：native harvest 的文本是否写 trajectory 工件、写到哪、是否有 secret scrub，文档未提。standalone 的子进程日志同样未见脱敏。建议至少声明轨迹保留策略；终态产物保证（B3）可作为同一 WI 的一部分：任何终止路径都让 analyze 能读到带终态标记的记录。

## 四、开放问题（需 human 裁决）

1. B1 是否值得立项：若 AGE 接受「审计者是诚实但马虎」的护栏信任模型（与 age-autonomy 设计的 G2 裁决一致），则快照对账可降级为 backlog；若走向对抗模型，G1 应提前。
2. G2 的恢复语义选择：native run 崩溃后自动重入 vs 显式人工认领——前者省事但可能与「单 projectRoot 单活动 run」guard 交互出竞态。
3. 本文第二节的借鉴项均来自 MIT 许可的独立实现，直接移植机制思路无许可问题；是否需要在 docs/reference 类目录登记该参照仓库，由维护者决定。

## 来源索引

- LHH 核心：`src/lh_harness/{manager,auditor_agent,runtime_signals,agent_registry}.py`、`src/lh_harness/adapters/{base,cli_agent,claude_code,claude_permissions}.py`、`src/lh_harness/supervisor/service.py`
- 本仓库对照面：`tools/mission-driver/{design/*.md,src/engine.js}`、`plugin/dsh/src/{engine-bridge,native-executor,plan-status-gate}.ts`、`docs/design/dsh-plugin-integration.md`
- 关联既有裁决：`docs/discussions/2026-08-24-age-autonomy-design-independent-grill.md`（其 G1/G2/G3 与本文 G1–G3 同源不同面：那边管 law 层信任边界，这边管审计通道完整性）
