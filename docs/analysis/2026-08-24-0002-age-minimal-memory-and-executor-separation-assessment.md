# AGE 最小外化记忆与执行器可分离性 — 观念评估报告

> Status: research note（对 human 提出的八条观念逐条对照项目原理文档的评估）
> Date: 2026-08-24
> 关联：`docs/analysis/2026-08-24-0000`（agent 复用/PromptDSL）、`-0001`（§4.0 外化原则/运行模式）、`docs/discussions/2026-08-24-roadmap-plan-frontmatter-reform.md`
> 依据文档：`docs/process/application-development-workflow.md`、`docs/context/source-of-truth-and-precedence.md`、`docs/context/conventions.md`、`tools/mission-driver/design/mission-design.md`、`tools/mission-driver/EXECUTION-PRINCIPLE.md`、`docs/plans/00-plan-authoring-and-execution-guide.md`、`docs/analysis/2026-08-22-0000-dsh-goal-plan-mode-research.md`（R1）

## 总评

八条观念中六条完全正确且有项目文档直接背书；两条（§6「没有具体的格式和目录规划」、§7「完全不需要额外的 flow engine」）方向正确但表述过强，需精确化。整体上，这组观念是对本项目隐性设计的准确显式化——尤其「信息表达组织 ⊥ 执行机制」的分离命题，恰是 StepExecutor seam 与四 driver 架构已经在工程上兑现的东西。

## 逐条评估

### C1 「roadmap 和 plan 是 AI 长时间运行的最小外化记忆」— ✅ 正确

- R1 §5 状态权威对照表的结论列：AGE 的状态存储 = **git-committed files**，且这是与其他所有 DSH 模式的本质区别（"Survives session end: yes — plain files, git history"）。
- execute.md:14 直接陈述恢复语义："the plan records its own progress ([x]/[ ]), so the next run resumes from the breakpoint"；0001 报告 §2 Q3 已核实「继续」即此收敛机制。
- `_tmp/run-state.json` 是本机 scratch 不进 git——外化记忆与非外化痕迹的边界恰好划在 roadmap/plan。
- **精确化**：「最小」指恢复现场所需的最小集合。`memory/_index.md`（Reflexion）与 `docs/logs/` 属第二层——改进记忆，非恢复记忆；丢了它们任务仍可续，丢了 roadmap/plan 则不能。两层不应混同。

### C2 「plan 是 AI 全自主执行的最小闭环切片」— ✅ 正确

- `flows/plan-execution.json` 的 EXECUTE → CLOSURE_SCRIPT_CHECK → CLOSURE_AUDIT → BUILD_VERIFY 就是「切片闭环」的状态机化：做 → 机械查 → 独立审 → 构建验证，一个 plan 内自带完整验证回路。
- plan guide 要求 Exit Criteria / Closure Gates / Proof 全部落在 plan 文件内——切片自包含其完成判据，无需外部状态即可判定闭环（frontmatter 改造后进一步派生化 completed）。
- 「一个子工作对应一个可控上下文」有三重工程对应：prompt 尺寸硬上限（engine.js `boundPromptSize` 24KB）、plan scope 规则（禁止 "and also..." 式蔓延）、draft-from-roadmap 每次 1–3 个计划的限量。

### C3 「独立子agent review/audit 是摆脱人工监控所必须的最小步骤」— ✅ 正确，方法论的核心命题之一

- R1 §5.2 给出了理论表述："a gate constrains timing; a reviewer produces independent judgment as an artifact"——门禁只管时机，独立评审产出独立判断。
- conventions.md Review Rule："Self-review or self-recorded closure evidence cannot be used to mark a created plan complete."
- workflow.md Stage 11："Work tracked by a plan is not automatically closed just because the implementing agent says so."
- **最有力的佐证是 AGENTS.md Reviewer-Availability Fallback**：人审缺席时允许 solo cold-replay 但必须记录局限、且 protected areas 仍不得绕过——这条规则反证了 review/audit 的功能定位就是「监控职能」，人与 subagent 是同一职能的两个可互换执行者。C3 说它是「AI 自主监控的最小步骤」与项目设计完全同构。
- 与 0000 报告已裁定的红线一致：独立性 = 独立 dispatch，记录内联（讨论稿 §8）不影响之。

### C4 「roadmap 把复杂任务分解为可控上下文的子工作 + 开发拓扑 + 可自我修正」— ✅ 正确

- 开发拓扑显式存在于分配规则：draft-from-roadmap.md:16 "assign them an explicit execution order... Plans that unblock others come first"——先做什么后什么是 roadmap 层的一等信息。
- 自我修正有多条在役通道：deferred items 重录（draft-from-roadmap.md:1）、DEEP_AUDIT failed → DRAFT_PLANS 补草新工作项、`reconcileOnTerminal` 终态对账、执行中修订 plan（WI13 F1 in-flight 面合法化编辑）。
- milestone/WI 两级分解 = 子工作的组织容器；每个 WI 消费一个 plan 切片（C2），层级衔接干净。

### C5 「设计信息不在 roadmap/plan 中，按规范性/过程性分离放在 docs 体系」— ✅ 正确，需一处精确化

- source-of-truth-and-precedence.md 就是这条分离的成文物：**"plans are execution contracts, not long-term owner docs"**；尾注三行是全文纲："stable behavior and structure belong in owner docs / execution belongs in plans and logs / history and diagnosis belong in bugs, audits, testing notes, retrospectives, and lessons"。
- workflow.md Stage 4："Move durable decisions into owner docs... describe the current supported baseline, not a running negotiation transcript"——规范性文档只持当前基线。
- **精确化**：plan 内确有设计性内容（Current Baseline / Goals / Decision Record）——但那是**执行时点快照与决策过程史**，属过程性；稳定结论必须在收口前回写 owner docs（execute 步骤 b "relevant docs updated" 是 closure 必选项）。二者分工恰恰构成「最小化演化阻力」：架构文档不吸收谈判史，plan 关闭后自然冻结为档案。

### C6 「没有具体的格式和目录规划，按需信息拓扑 + 索引内链 + log 定期挖掘更新 = 自进化组织」— ◐ 方向正确，两处需精确化

匹配的证据：AGENTS.md Documentation Ownership 只定义**目录职责**不定内容分类学；docs/index.md 以问题路由而非以目录导航；规则 10/15 的演化触发阶梯（复现才提升为 skill/playbook/脚本/lint）；log 指南 + Docs Maintenance 规则构成「从轨迹定期挖掘更新文档体系」的制度化形态。

- **精确化一**：骨架是规定的，内容拓扑才是自由的。必读文件集（context/* 五件）、precedence 规则、file-in/file-out、目录职责边界都是硬约束。「完全没有格式和目录规划」过强——正确表述：**元结构规定、领域内容自适应**。
- **精确化二**：本项目的自进化是**受治理的自进化**，不是野生自进化：进 archive 需 human approval（AGENTS.md rule 13）、protected areas 不可自动降级、skill/检查提升须满足复现条件、规范变更走 owner doc 显式回写。治理门本身是最小化演化阻力的一部分——无门的自修改会让规范层失去可信度，反而增大长期阻力。

### C7 「信息表达组织 ⊥ 执行机制；dsh 自身读 roadmap 即可执行，完全不需要 flow engine」— ◐ 分离命题正确且已被工程兑现；「完全不需要引擎」需改写

**分离命题成立的证据（项目自己已兑现）：**

1. mission-design.md §1 的分层通用性表把这一点写成了设计目标：`engine.js` 全通用零项目假设、flows 是通用开发循环、prompts 半通用经 mission.json 变量消解——**引擎从第一天就被构造成信息无关的纯执行机制**。
2. 执行机制已实际可替换：StepExecutor seam 后面挂过 ProcessExecutor（opencode/pi/cline）与 NativeExecutor（DSH in-process），行为由 L2 parity matrix 钉平。
3. 方法与引擎独立分发：`install-age.sh` 安装的是方法（guides/gates/docs 骨架），引擎是可选附件。
4. 同一信息拓扑已有第二个消费者：AGE preset 交互会话（人/AI 经技能驱动）与引擎消费完全相同的 roadmap/plan/guides——「谁来执行」已经是运行时选择。
5. 生态对照（0001 报告）：dsh_workflow/automation 等异构执行器消费同类工件，无一绑定特定信息格式。

**「完全不需要 flow engine」的改写**：原则上对——引擎不是信息组织的必要伴随物；但工程上须精确为**「不绑定任何特定 flow engine」而非「无需强化 loop」**。理由即 C8 本身：裸会话读 roadmap 全自主执行，缺的都是机械保证——确定性预算（maxTotalSteps/maxCycleVisits/maxAuditRounds）、transient 故障分类与退避、marker 校正重试、崩溃断点（run-state 原子写）、forEach 有界并发、终态对账（reconcileOnTerminal）、可观测面（monitor/SSE）、EXIT_MAP 退出语义。这些没有一样能靠 AI 认知自觉补齐（R1 的 native goals self-complete 教训同源）。强化 loop 是必需品；flow engine 只是它的**第一个具体实现**，且按 C7 的分离命题它可以被替换——比如未来宿主长齐 pre-execute 门禁 + 目标预算 + 断点原语后的 hook 组合形态。到那天退役的是这个引擎的实现，不是强化 loop 的职能。

### C8 「AI 全自主执行可能无法精确应用 harness 检查，需要强化 loop 确保可自动验证的部分确实按要求执行」— ✅ 正确，且这就是引擎的存在理由

- packaging doc §Behavioral differences 原话："Flow DSL still owns sequencing because it adds branching transitions, script checks, marker contracts, and per-branch budgets **beyond round counting**"——明确区分了「会话内的自主推进」与「带机械保证的推进」。
- 项目里到处是「不信任 AI 自陈」的机械化补偿：BUILD_VERIFY/CLOSURE_SCRIPT_CHECK 机械验证步、WI13 pre-execute 门禁（防 premature completed）、plan-check.mjs 结构校验、conventions.md "Do not report verification success for commands that were not actually run"、execute.md 的防御性条款。
- 这条与 C7 组合起来得到本报告的中心结论，见下节。

## 中心结论

> **信息的表达和组织是一件事情；根据信息执行是另一件事情；而「确保执行可被机械验证」是第三件事情。**
> 第一件归 docs 体系与 roadmap/plan 格式（frontmatter 改造正在把它标准化）；第二件是可替换的执行器（今天的 FlowEngine，明天的任何东西）；第三件是不可省略的强化 loop 职能——它可以由 flow engine、harness hook 组合或未来宿主原语承担，但永远不能由 AI 认知承担。

三件事的正交性解释了本仓库全部既有架构选择为何彼此一致：StepExecutor seam（二可换）、L2 parity matrix（换而不破）、AGE preset 交互态（二的另一个实例）、WI13/BUILD_VERIFY（三的落点）、frontmatter 改造提案（一的标准化）。也解释了 0000/0001 两份报告的所有裁定为何不冲突：agent 池、prompt DSL、控制面全部住在「二」「三」层，「一」层的文件格式与它们正交。

## 对后续立项的指引（仅建议）

1. frontmatter 改造（讨论稿）应作为独立第一优先级——它是「一」的标准化的最后一块，且使「二」的任何未来替换者都有稳定的机器接口；
2. 强化 loop 的宿主原语路线（pre-execute 门禁族扩展）优先于任何引擎增强——它在「三」层工作且天然随宿主演进；
3. 若未来出现引擎替代形态，验收标准沿用 L2 parity matrix 模式：换执行器，信息层与验证层零感知。
