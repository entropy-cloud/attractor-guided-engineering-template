# AI 与自动化代码的交互模式 — 本质设计与 DSH/AGE 契合度再审视

> Status: research note（架构北极星分析；不含立项裁定）
> Date: 2026-08-24
> 前序：`-0000`（复用/DSL）、`-0001`（§4.0 外化原则）、`-0002`（三事正交）、`docs/discussions/2026-08-24-roadmap-plan-frontmatter-reform.md`
> 方法约束（human 设定）：不受现有插件与现有实现限制，只从最自然最本质出发，再回头评估现状。

## 1. 问题重述与判据

要建的是 **AI（判断性工作）与自动化代码（机械性工作）之间的交互模式**。判据两条：

- **DSH 轴**：宿主是"一切皆插件"——原生 agent 循环免费存在；插件对会话的作用面天然分为四类：注入（prompt 段/notices）、约束（tools/pre-execute 门禁）、观察（session/subagent 事件）、服务（cordis service 直调）。一个设计若自建宿主已有的循环，就是在跟母语较劲。
- **AGE 轴**：三条不变量——①状态权威只在 git 文件（外化记忆）；②验收独立性是结构属性（第二 agent dispatch，不可由实现者自居）；③机械保证不可委托给 AI 认知。

## 2. 四种基本交互模式

| 模式 | 形状 | 复杂性放在哪 | 代表 |
| --- | --- | --- | --- |
| M1 函数调用 | 自动化持控制流，AI 是 `(prompt) → text` 纯函数 | 全部顺序/预算/解析逻辑在自动化侧 | **现设计：FlowEngine + marker** |
| M2 对等消息 | 双方平等互发事件，各自反应 | 协议与时序在通信层 | dsh-agent-relay（已裁定不引入） |
| M3 AI 自驱 | AI 持控制流，机械代码是它调的工具 | 保证缺失，靠自觉 | 裸 DSH 会话读 roadmap 执行 |
| M4 法律门禁 | **AI 自驱其原生循环；自动化不定顺序，只在边界裁决**：拒绝非法动作、验证声称、计量预算、按状态变迁触发副作用 | 规则（纯函数）在门禁层；记忆在文件；仅"维持运行"需要极薄监督者 | WI13 plan-status gate 已是首个实例 |

M1 把 AI 当函数——这正是现设计最不 DSH 原生的地方（见 §3）；M3 缺机械保证——human 已在 0001 §4.0 论证过不可裸奔。**剩下的真问题只有 M1 vs M4。**

## 3. 从 DSH 本质推导

1. **循环免费**：每个 DSH 会话自带 agent loop。"驱动 AI 逐步走"是宿主每天在做的事；FlowEngine 在宿主进程内又造了一个驱动器，用 prompt 函数调用把原生循环短路成一步一唤。
2. **拦截是母语**：`tools/pre-execute` 给了自动化"对 AI 动作说不"的一等公民位置——WI13 已经用它钉住了 completed 状态的合法性。这是 M4 的原型，且已被证明可以零引擎 diff 落地。
3. **持续会话是常态**：0000 报告的池化/prompt 缓存线程全部指向长命 session；而 M1 的每步一唤恰恰假设会话无关。M4 下 AI 在自己的会话里连续工作，上下文与缓存自然累积。
4. **结论**：DSH 母语里，自动化的正确姿态是**法律与公仆**（裁决 + 服务），不是**司机**。

## 4. 从 AGE 本质推导 —— 一个关键洞察

AGE 三不变量逐一映射后，出现一个此前所有报告都没有点破的事实：

> **`<AI_STEP_RESULT>` marker 是第二真相通道，与 `> Plan Status:` 行同病。**

- 现状：EXECUTE 既写 checkbox（文件真相）又吐 marker（文本真相），引擎信 marker 定转移、信文件定进度——同一事实两个表达，靠正则和 correction-retry 维护一致性。这与 guide 规则 12 治理的「Status 行 vs checkbox 不一致」是**同一种病，只是发生在文件之外**。
- frontmatter 改造让「完成 = grep 无未勾选项」成立之后，marker 的信息内容归零：**AI 的报告就是那次文件写入本身**。门禁裁决写入合法性；非法转移得到带理由的结构化 deny（比 "marker invalid" 富信息的错误反馈）；correction-retry 机器随之失去对象。
- 于是 flow JSON 步进图也溶解：CHECK/REVIEW/EXEC/DRAFT/AUDIT 的先后关系本来就是 docs 体系编码的纪律（draft 不可执行 = status 门禁；无可起草才审计 = 派生规则），引擎只是把它们**影子拷贝**了一份进自己的 JSON。真正的状态机一直写在文件里——**文档态格（document state lattice）：status ∈ {draft, active, held} × checkbox 集 × findings 开闭**。

AGE 三不变量在 M4 下的落位：①记忆=文件（ledger 已定）；②独立性=由**谁派发评审**结构性保证——实现者 AI 不能自证，必须由非实现方触发独立 dispatch（见 §5 监督者职责 b）；③机械保证=纯函数门禁 + 计量器，全部确定性可测（WI13 的 23 用例真值表即此风格）。

## 5. 本质设计：Ledger · Law · Supervisor

```
┌─────────────────────────────────────────────────────┐
│ Ledger（账本）= roadmap / plan / frontmatter / logs    │
│   唯一状态。转移 = 文件写入。                            │
├─────────────────────────────────────────────────────┤
│ Law（法律）= 纯函数门禁族                                │
│   f(提议动作, 文件当前态) → allow | deny(reason)        │
│   无记忆、确定性、可穷举测试。覆盖：状态格合法转移、        │
│   完成派生校验、预算闸、并发写乐观锁、路径域护栏。          │
├─────────────────────────────────────────────────────┤
│ Supervisor（守夜人）= 极薄监督服务                       │
│   a. sustain：agent idle 且账本有活 → followup 续轮      │
│   b. trigger：账本变迁到待审态 → 派发独立评审子代理        │
│      （独立性由此结构保证：派发者是自动化而非实现者）        │
│   c. meter：步数/墙钟/审计轮次预算记账（跨 run 全局量如审计轮次写 roadmap frontmatter〔human 裁定 2026-08-24〕；run 内临时量写本机 scratch） │
│   d. restart：崩溃后重启续班（无状态恢复，读账本即可）      │
│   e. receipt：终态回执（既有能力）                        │
└─────────────────────────────────────────────────────┘
```

- **交互模式**：AI 读账本自主选活（拓扑顺序由 roadmap 序 + guide 约定给出），动手时被 Law 裁决，被拒时拿到结构化理由自行修正——这是比 pass/fail marker **更灵活**的双向交互：谈判式而非开关式。
- **宿主 API 核算**：门禁=已有 pre-execute；触发/续轮/回执=followup/create（六调用账本内）；观察=session events（已有）。**零新增宿主依赖。**
- **可信基反而缩小**：被测对象从"引擎状态机 653 测试 + 门禁"变为"纯函数门禁族（可穷举）+ 百行级监督者"。删除的代码多于新增的。

## 6. 与现设计（M1 引擎驱动）的诚实对照

**溶解清单**（M4 下不再需要）：marker 契约与 correction-retry、flow JSON 步进图、forEach 编排（多 plan 并发=多子代理各领一份 active plan，roadmap 写回由乐观锁门禁串行化）、CHECK 重试机（health-check 变为普通可重复验证步）、EXIT_MAP 的引擎侧分支。

**保留清单**：StepExecutor seam 的*思想*（监督者派发仍需执行后端抽象，NativeExecutor 原封复用）、mdcontrol 异步契约/回执、AGE preset、monitor（读文件+SSE 不变）、全部独立评审协议语义。

**短期真实损失**：成熟的 transient 故障分类退避、ping-pong 检测、reconcileOnTerminal、L2 parity matrix 与双腿 e2e 投资——这些是 M1 十几轮 WI 打磨出的边角可靠性，M4 需要以门禁+计量形式重新挣得。

**新风险**：①顺序涌现不可预测（缓解：拓扑约束仍在 roadmap+guide+门禁，合同级可预测保留，路径级放开）；②多代理并发写共享文件的竞争（乐观锁门禁为新组件）；③prompt 约定漂移失去引擎强制函数（缓解：guide + 结构校验 + 门禁三重）。

## 7. 判定与北极星

**判定**：
1. 以「今天要交付无人值守自主运行」论，M1 引擎驱动是**合格的已验证实现**，不构成错误；
2. 以「最本质且最契合 DSH+AGE」论，**M4 法律门禁模式优于 M1**：它消解第二真相通道、复用宿主原生循环与拦截面、把可信计算基缩到纯函数，并且是现设计三个最新动向（WI13 门禁、frontmatter 派生化、§4.0 外化）的自然汇合点——**现设计正在向 M4 收敛而不自知**；
3. 因此不建议重写，建议立 M4 为**架构北极星**，绞杀式迁移：
   - 第一步 frontmatter 改造（杀死 marker 的必要性）；
   - 第二步把 plan-status gate 泛化为声明式门禁族（0000 报告 P6 DSL 的 gates 段），逐步接管状态格全部转移合法性；
   - 第三步从 mdcontrol 中析出 Supervisor seam（sustain/trigger/meter/restart 五职责），FlowEngine 降级为其背后的第一个实现——接口先立，实现后换；
   - 终态：引擎可选。交互模式成为「AI 读文件干活、门禁执法、守夜人值班」，三者互不知晓彼此内部。

## 8. 开放问题

1. 并发写竞争的乐观锁粒度（文件级 hash CAS vs 区段锁）需实验；
2. BRIEF_GATE/draft 两段管线在 M4 下的等价形态（mission 文件状态化即可）；
3. trigger 规则（何种账本变迁触发何种独立派发）的声明式定义归入 0000 P6 DSL 的哪个段；
4. 迁移触发条件：建议定为「frontmatter 改造收口 + 连续队列立项时」二者齐备再启动第三步，避免同时动两处契约。

## 9. 增补：marker 溶解论的数据流复核——「局部步骤传参」质疑的正面回答

> human 质疑（2026-08-24）：顶层步骤不需传参，但**局部步骤调用需要传参**——marker/FLOW_VARS 真的可以不要吗？本节对三个 flow 的**全部数据流**逐一清点后回答。结论先行：**「传参」与「marker 返回」是两个问题；参数在任何模型下都需要，但其正确来源是账本派生而非上一步返回值；而现有代码中 AI 返回数据的通道经查证已近乎冗余。**

### 9.1 全量数据流清单（源码级）

| # | 数据流 | 来源 | 去向 | 性质 |
| --- | --- | --- | --- | --- |
| 1 | `EXEC_PLANS → plan-execution` 的 `flowArgs.PLAN_FILE` | `activePlans()` **磁盘扫描**（flow-loader.js:157，非任何 AI 输出） | 子流程 prompt 的 `{{PLAN_FILE}}` | 引擎当文件系统搬运工 |
| 2 | `REVIEW_PLANS` / `CHECK_OPEN_AUDITS` / `SCAN_NEW_RESULTS` 的迭代对象 | `draftPlans()` / `openAudits()` **磁盘扫描** | 同上 | 同上 |
| 3 | 全部三个 flow 中唯一的 AI 返回数据块：DRAFT_PLANS `<FLOW_VARS><PLAN_FILE>` | AI 文本（prompt 明言"engine discovers the rest via scan"） | `validateFlowVars` 存在性校验 + 单计划 verify 面（flow-loader.js:197）——主循环内被子流程的扫描版 flowArgs 覆盖 | **近乎冗余通道** |
| 4 | `CLOSURE_SCRIPT_CHECK` 的脚本输出 `SCRIPT_CHECK_RESULT/DETAILS` | 引擎跑 `inspectPlan()`（确定性 CLI） | CLOSURE_AUDIT 失败时经 append 模板注入 EXECUTE 重试提示词 | 机械工具输出进提示词 |
| 5 | `CLOSURE_AUDIT` issues 时的审计发现文本 | AI 响应文本，引擎 `extract REMAINING` 抓取后拼接进 EXECUTE 重试提示词（plan-execution.json:48-51） | 同上 | **响应文本当数据通道的唯一实质案例** |

### 9.2 具体示例：一个 plan 的收口链在两种模型下的对照

以「plan P 执行完、审计发现问题、打回重做」为例：

**M1（现状）**：引擎扫盘得 P → 渲染 execute.md(P) 派发 → AI 干活+勾 box+吐 `pass` → 引擎跑 plan-check → 渲染 closure-audit.md(P) → 审计 AI 发现缺陷，吐 `issues` + 剩余问题文本 → 引擎抽取该文本拼进 execute.md 的 Feedback 段再次派发 → 循环至 approved → BUILD_VERIFY 吐 `pass` → 子流程 completed。

**M4（法律门禁）**：监督者扫盘（同一个纯函数）见 P 为 active 且有未勾项且无认领 → seed/followup 一个执行子代理指名 P → AI 干活勾 box；完成判定=门禁验证「无未勾项」（grep）；监督者见 P 进入待审态（全勾+无 Closure 记录）→ 触发派发独立审计子代理 → 审计者把发现**写进 P 文件的 Closure 区**（§8 内联裁定已定此形态）并置回退标记 → 监督者/执行子代理读 P 全文（execute.md 第 1 步本来就强制完整阅读）看到 Feedback 区 → 继续修 → 直到门禁放行。

逐项对照结论：
- **输入寻址（P 是谁）在两个模型下都存在**——M1 是 `{{PLAN_FILE}}` 进模板，M4 是 seed/followup 里的一句话。这不是 marker，是派发寻址，来源都是扫盘；
- **状态信号（pass/issues/approved）**：M1 走文本通道，M4 走文件态（勾选数、Closure 区有无、frontmatter 位），由门禁/触发器读取；
- **跨步数据（审计发现→重做指令）**：M1 靠引擎抓响应文本拼提示词；M4 下发现直接落 P 文件——数据通道从「响应文本+引擎中转」变为「账本直读」，且 execute.md「完整读 plan」的既有强制使接收方必然看到。

### 9.3 定理与边界

**定理**：在 AGE 一致的设计里，AI 步骤的一切决策相关输出都必须落在文件里（conventions.md file-in/file-out 本来就这么要求）。因此返回通道要么冗余（真相已在文件）、要么违规（真相只在文本）。marker/FLOW_VARS 作为「影子报告」，其唯一消费者是引擎自身——溶解它们不丢信息，只丢影子。

**诚实的边界（三处真残留）**：
1. **确定性工具输出进提示词**（#4 类）：M4 下不需要引擎中转——checker 本来就是 CLI（closure-audit.md 已把命令印给 agent），agent 自跑自读即可；监督者最多代跑附上，属便利非契约。
2. **机器本地临时量**（预算计数等）：写 run 态 scratch 文件，不入合同。
3. **并发认领竞争**：多子代理抢同一 plan 需要乐观认领门禁——但这在 M1 下同样存在（今天靠单 run 守卫全局串行化掩盖了它），不是 marker 能解决也不是 marker 造成的问题。

**对 §7 北极星路径的修正**：无方向修正，但第二步「门禁族」的能力清单需加一项——**认领/寻址原语**（claim gate + 扫描函数即 M4 的 flowArgs 等价物），它承接的是现引擎 flowArgs/forEach 的管道职能，而非 marker 职能。marker 与 FLOW_VARS 在清单上的定性为：可直接删除的影子通道（前置条件 = frontmatter 改造 + 审计内联两项落地）。
