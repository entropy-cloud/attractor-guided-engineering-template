# AGE 自主运行架构 — 总纲

> Status: supported baseline（human 批准，2026-08-24；P0–P4 仍按 roadmap 立项落地，落地前的运行时受支持行为以 `docs/design/dsh-plugin-integration.md` / `docs/architecture/mission-driver-baseline.md` 为准）
> Date: 2026-08-24
> Owner: docs/design/age-autonomy/
> 本目录是一套自包含的目标形态设计文档，定义 AGE 方法论的自主运行形态。目录内结论是 supported baseline；`docs/analysis/` 中的过程性分析只作历史依据，不参与运行时裁决。

## 1. Purpose

定义 AGE 自主开发循环的**最终运行形态**：AI（判断性工作）与自动化代码（机械性工作）之间的交互模式、双形态产品、执行保证与迁移路径。这套设计回答三件事：

1. 状态放哪、以什么格式放（账本）；
2. 机器如何强制规则而不靠 AI 自觉（法律）；
3. 谁在无人值守时维持推进、谁在崩溃后续班（守夜人）。

## 2. 设计原则（权威化，不可违反）

| # | 原则 | 表述 |
| --- | --- | --- |
| P1 | 外化记忆 | 全部跨 session 可复用状态只存在于 git 文件（roadmap/plan/审计与评审记录/认领与派发登记）；`_tmp/` 是本机 scratch，不是状态面 |
| P2 | 零插件记忆 | 插件不持有任何持久记忆；内存态只允许是性能缓存或易逝锁（如单活跃守卫；丢失后最多损失缓存命中或需要重扫，正确性可从 git 文件完整重建） |
| P3 | 中断即暂停 | 没有挂起/恢复机器；暂停 = 直接中断，恢复 = 收敛式重跑（plan 计数域 checkbox 接续） |
| P4 | 跨 session 恢复 | commit → checkout 到任意机器即可接续，不依赖任何本机进程状态 |
| P5 | 三事正交 | 信息组织 ⊥ 执行机制 ⊥ 机械验证。执行器可替换；机械验证不可委托给 AI 认知 |
| P6 | 不信任自陈 | AI 的决策相关输出必须落文件（file-in/file-out）；一切可机检的声称都要被机器校验 |
| P7 | 独立审计禁入池 | CLOSURE_AUDIT / DEEP_AUDIT / multi-audit 等结构性独立审计每次独立派发，永不池化复用 |
| P8 | 执法者自护 | 法律实现与策略数据（law 代码 / `missions/autonomy.policy.yml` / 执法 CLI）对 AI 只读；变更只经人工批准的立项路径——被执法者不得改写执法者自身（A1/A2 裁定，见 02-rule-law §2/§4.7） |

## 3. 核心架构：Ledger · Law · Supervisor

交互模式从「自动化驱动 AI」（引擎调 AI 为纯函数）收敛为「**AI 自驱干活、法律在边界裁决、文件记账、守夜人值班**」：

```
┌───────────────────────────────────────────────────────────┐
│ Ledger（账本）= roadmap / plan / frontmatter / 审计记录       │
│   唯一状态。转移 = 文件写入。                                   │
├───────────────────────────────────────────────────────────┤
│ Law（法律）= 纯函数门禁族                                        │
│   f(提议动作{路径, proposedContent, actor?}, 文件当前态)          │
│   → allow | deny(reason)                                        │
│   无记忆、确定性、可穷举测试。覆盖：状态格合法转移、完成派生校验、  │
│   预算闸、并发乐观锁、路径护栏、nothing 声称校验。                │
├───────────────────────────────────────────────────────────┤
│ Supervisor（守夜人）= 极薄监督服务                               │
│   sustain（有活且 idle → 续轮）/ trigger（账本变迁 → 独立派发）    │
│   / meter（计量记账）/ restart（崩溃重启读账本续班）/ receipt      │
└───────────────────────────────────────────────────────────┘
```

**引擎定位**：现有 FlowEngine 是无人值守执行后端之一（初期仍是主后端），保留其恢复/预算机制的硬化价值。它不因本设计被删除，只被降级为可替换实现。

## 4. 交互模式判定

四种基本模式中，「法律门禁」是本设计的落点：

| 模式 | 形态 | 判定 |
| --- | --- | --- |
| 函数调用（引擎驱动） | 自动化持控制流，AI 是 `(prompt)→text` 纯函数 | 合格已验证实现；作为后端之一保留 |
| 对等消息 | 双方平等互发事件 | 不引入独立总线（单进程 cordis 直调已覆盖） |
| AI 裸自驱 | AI 持控制流，机械代码是工具 | 缺机械保证，不可无人值守 |
| **法律门禁（本设计）** | **AI 自驱原生循环；自动化只在边界裁决** | **最终形态** |

**marker 溶解**：`<AI_STEP_RESULT>` / `<FLOW_VARS>` 是第二真相通道（与 Plan Status 行同病）。frontmatter 改造 + 完成派生化后，AI 的报告 = 文件写入本身，marker 信息归零；子流程参数本就来自磁盘扫描（activePlans/draftPlans/openAudits），引擎只是文件系统搬运工。marker 在引擎存续期保留、退役后删除。

## 5. 双形态产品

同一账本、同一法律、同一完成定义；差异只在执行后端与入口。

| 维度 | DSH 插件形态 | 独立形态 |
| --- | --- | --- |
| 执行 | in-process supervisor + 原生会话 | CLI + 引擎后端 |
| 法律 | tools/pre-execute 门禁 | CI / git hooks 门禁（同函数） |
| 无人值守 | 宿主内 watch loop | cron / launchd / CI 定时 |
| 入口 | 交互会话 / skill / continuous | `mission-driver.sh run <mission>` |

## 6. 执行保证三层

1. **Level 0 — 跨 session 收敛（AGE 地基）**：一切自动化失效时，人 checkout + 手动 run 仍能从 checkbox/frontmatter 接续；
2. **Level 1 — OS 调度器（独立形态）**：cron/CI 保证周期性尝试推进，进程崩溃不影响下一周期；
3. **Level 2 — 宿主内 watch loop（DSH 形态）**：事件 + 终态回执链 + 心跳轮询三沿推进，崩溃由恢复扫描续班。

执行保证由「定时器/事件 + 纯函数判定 + 账本派生幂等键」构成，不委托给 AI。

## 7. 迁移路径（绞杀式，每步独立立项）

| 阶段 | 内容 | 关守 |
| --- | --- | --- |
| P0 | 账本改造：frontmatter 化、完成派生、审计内联 | 双读过渡 + codemod |
| P1 | 法律：门禁族 + 三硬门 + nothing 兜底 + BUILD_VERIFY 机械化 | 零引擎 diff |
| P2 | 守夜人：Supervisor seam + claim/乐观锁 + 连续队列 | 引擎存续 |
| P3 | 效率层：池化 + prompt 组装 + 上下文画像 | 插件层 |
| P4 | 引擎退役判定门（可选） | 门禁+supervisor 覆盖缺失机制后评估 → 判定面工件 = [06-engine-retirement-checklist](./06-engine-retirement-checklist.md)（M5-WI37 在库，living decision-gate artifact：覆盖矩阵 + D1–D7 裁定 + 总判定） |

**落地状态注记（2026-08-27，M5-WI39 事实性增补——表体是目标形态契约，注记不改契约语义）**：P0 账本改造已落地（M1，plans `2026-08-25-0635-{1,2,3}`）；P1 法律已落地（M2，plans `2026-08-25-0815-{1,2,3}` + `2026-08-25-0950-{1,2,3}`，18 gates 全 enforce）；P2 守夜人已落地（M3，plans `2026-08-26-1411-{1,2,3}` + `2026-08-26-1954-{1,2,3}` + `2026-08-27-0433-1`，「引擎存续」守关现值 = 引擎留任）；P3 效率层已落地（M4，plans `2026-08-27-0433-{2,3}` + `2026-08-27-0558-{1,2,3}`）；P4 判定门已评估（M5-WI37 总判定 = **引擎留任主后端（条件退役）**，缺口前置清单 G1–G6 见 [06-engine-retirement-checklist](./06-engine-retirement-checklist.md)；其 G3 项 EXIT_MAP `partial`/`blocked` 增补已由 M5-WI38 独立立项收口——现行 13 键）。

**三硬门**（防净倒退，先于 Supervisor 落地）：审计回执绑定、draft→active 写者身份、完成派生公式。**WI13 证据面注意**：现 plan-status-gate 的证据来自 `_tmp` run-state 子流程文件；frontmatter 化后该证据面失效，P1 的完成门禁是「证据面重建为账本谓词」，不是把 WI13 原样泛化（否则会安静地变成 no-op）。

## 8. 文档地图

| 文档 | 内容 |
| --- | --- |
| [01-file-ledger](./01-file-ledger.md) | 账本：roadmap/plan/frontmatter 格式、状态格、完成派生、运行登记、审计内联、计量 |
| [02-rule-law](./02-rule-law.md) | 法律：门禁族、声明式规则 DSL、三硬门、机械验证、部署面 |
| [03-supervisor](./03-supervisor.md) | 守夜人：五职责、连续模式、执行保证、幂等、崩溃恢复 |
| [04-efficiency](./04-efficiency.md) | 效率层：agent 池化、prompt 组装、上下文画像 |
| [05-usage](./05-usage.md) | 使用：DSH 形态与独立形态的入口、流程、介入点 |
| [06-engine-retirement-checklist](./06-engine-retirement-checklist.md) | 引擎退役判定清单（P4 判定门）：职责覆盖矩阵 + 累积 Deferred 裁定记录 + 总判定与缺口前置清单（living decision-gate artifact，非 supported baseline 契约） |

## 9. 术语表

- **账本（Ledger）**：git 内的 roadmap/plan/frontmatter/审计记录，唯一状态权威。
- **法律（Law）**：声明式门禁规则，纯函数，机器强制。
- **守夜人（Supervisor）**：极薄监督服务，维持推进与派发独立评审。
- **收敛式重跑**：重跑同 mission = 新 run，靠 checkbox 接续未完成工作。
- **认领（claim）**：一个子代理对某 plan 的工作登记（plan frontmatter，带 TTL），防并发重做；由守夜人写入与回收。
