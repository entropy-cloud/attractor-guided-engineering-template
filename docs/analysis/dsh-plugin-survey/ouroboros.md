# ouroboros 调研报告（dsh-plugin-survey）

> | 元信息 | 值 |
> |---|---|
> | 本地路径 | `~/ai/dsh-plugins/ouroboros/`（本地 clone，HEAD `645a2f0` "chore: release v0.51.14"） |
> | 来源 repo | https://github.com/Q00/ouroboros.git |
> | stars | 约 5.6K★（任务口径 + README badge；未联网复核实时数） |
> | 语言 | Python ≥3.12（`src/` 约 31 万行，含少量 TS：opencode 插件桥、GJC bridge index.ts） |
> | license | MIT（`LICENSE`） |
> | 宿主 API 面 | MCP server（`ouroboros mcp serve`，工具名 `mcp__ouroboros__*`）+ Typer CLI（`ouroboros <cmd>`）+ 各宿主 skill 包（`ooo *`，见 `skills/*/SKILL.md`）+ 宿主插件清单（`.claude-plugin/`、`.codex-plugin/plugin.json`、`.codex/hooks.json`、`integrations/dsh-plugin/`） |
> | 本次阅读范围 | README.md 全文；evolution/convergence.py 全文；bigbang/ambiguity.py 全文；ralph_loop.py 全文；evaluation/{pipeline,models,trigger} 主体与关键段；auto/ledger.py 头部；orchestrator/runtime_factory.py 与 backends/capabilities.py 关键段；seed_generator 门控段；observability/drift.py 常量；`.ouroboros/seeds/*.yaml` 样本。**未读**：auto/pipeline.py 全文（3306 行）、evolution/loop.py 其余约 1500 行、reflect/wonder 全文、MCP server 内部、TUI/dashboard_web、tests/、docs/ 目录、13 个 runtime adapter 的逐个实现 |

## 1. 定位

- 自称 **Agent OS**："a local-first runtime layer that turns non-deterministic agent work into a replayable, observable, policy-bound execution contract"（README.md:72-76）。三层栈：kernel（本 repo：Seed/Ledger/MCP/Runtime）→ apps（Ouro-labs/ouroboros-plugins）→ shell（Ouro-labs/ourocode TUI）（README.md:80-97）。
- 核心循环五相：**Interview → Seed → Execute → Evaluate → Evolve**；口号"它自己变聪明，我们只守门"（README.md:20-22,355-371）。进化的是**产品规格（Seed/本体 schema）**而非代码架构——README.md:118-122 明确与另一个自改架构同名项目划清界限。
- 与本项目的关系定位：这是"受治理的自进化循环 + 门控 + 预算"同题里**体量最大、工程化最重**的生态样本（事件溯源持久化、13 运行时适配、反 reward-hacking 设计），其机制层可直接对标 mission-driver 的 roadmap→plan→execute→audit 循环。

## 2. 架构与机制

### 2.1 进化循环的定义与推进

- 循环载体是 **Lineage**（本体谱系）：每代生成 `GenerationRecord{generation_number, seed_id, ontology_snapshot, evaluation_summary, wonder_questions, phase, seed_json,...}` 并 append 进 EventStore（evolution/loop.py:446-477）；Gen2+ 从 EventStore 按 lineage_id 重建状态，跨会话无状态续跑（ralph_loop.py:342-343，README.md:378-386）。
- 每代 = Execute→Evaluate→Wonder("我们还不知道什么？")→Reflect(变异本体)→下一代 Seed（README.md:362-374）。`evolve_step` 是 MCP 暴露的单步原语，Ralph 只是后台 job 里反复调用它（ralph_loop.py:1-6）。
- 推进由**收敛判据矩阵**决定（evolution/convergence.py:40-68），优先级顺序很讲究：
  1. **Outcome gate 最先**（convergence.py:99-116）：评估通过即收敛，放在 min_generations 之前——"验证过的 Gen1 不应为循环而循环付费"。
  2. 硬顶 `max_generations=30` 在 outcome gate 之后判（convergence.py:118-127），最后一代的 PASS 记成功而非耗尽。
  3. 本体相似度 `sim(Oₙ,Oₙ₋₁)≥0.95` 收敛（convergence.py:53），但相似≠通过：被否决的稳定代会落入停滞检测而不是立即放行（convergence.py:138-197 注释明说旧实现曾因此烧光 30 代）。
  4. 反退化面：per-AC 未决即挡（convergence.py:160-186）、AC 覆盖率是"权威要求不可配置关闭"（convergence.py:198-227）、回归门（AC 曾过现挂即拒，convergence.py:249-264）、**"本体从未真正变异过则拒绝收敛"**（防 Reflect 保守复读骗取收敛，convergence.py:266-281）、评分平台期 ε=0.01（convergence.py:64,339-355）、振荡 A→B→A 双半周期校验（convergence.py:557-580）、wonder 问题 3 代重叠 ≥70% 判重复（convergence.py:582-603）。
- 相似度公式：`0.5*name_overlap + 0.3*type_match + 0.2*exact(name+type+description)`（core/lineage.py:301-369）。

### 2.2 面试门控如何拦截

- 门在 **Seed 生成入口**而非聊天流：`SeedGenerator.generate()` 在产出不可变 Seed 前检查 `ambiguity.is_ready_for_seed`，不达标返回 ValidationError 并附分数/阈值/interview_id（bigbang/seed_generator.py:1669-1695）。
- 分数 = `1 - Σ(clarity_i × weight_i)`，LLM 打分 temperature=0.1 保证可复现（ambiguity.py:142,814-830）。greenfield 权重 Goal40/Constraint30/Success30，brownfield 加 Context15 并降权其余（ambiguity.py:48-56）。阈值 `AMBIGUITY_THRESHOLD=0.2`，另有分维度地板 goal0.75/constraint0.65/success0.70/brownfield-context0.60（ambiguity.py:37-45,296-333）——总分过线但单维瘸腿也拦。
- **force 旁路诚实化**：显式 force 可越过阈值，但真实分数仍写入 `SeedMetadata.ambiguity_score` 并打 warning 日志（seed_generator.py:1670-1676）——旁路留痕而非静默放行。
- 里程碑语义标签 INITIAL≤1.0/PROGRESS≤0.4/REFINED≤0.3/READY≤0.2 同时喂给 LLM 出题策略与 MCP meta（ambiguity.py:153-226）。

### 2.3 分阶段评估的评分面

- 三段串行（evaluation/pipeline.py:40-93）：Stage1 机械验证（$0：lint/build/test/static/coverage，models.py:54-69）→ Stage2 语义评审 → Stage3 多模型共识（仅触发时跑）。Stage1 结果可注入复用，前提不变量是机械检查必须 AC 无关（pipeline.py:99-123）。
- Stage2 评分字段：score/ac_compliance/goal_alignment/drift_score/uncertainty/**reward_hacking_risk**/**questions_used**(评审者必须展示问过的问题)/evidence（models.py:112-146）。
- 数值门常量单一来源：`SEMANTIC_APPROVAL_SCORE=0.8`、`REWARD_HACKING_VETO_THRESHOLD=0.7`（高置信作弊信号才否决真通过，models.py:26-37）。
- Stage3 触发矩阵 7 类条件：Seed 修改/本体演化/目标重释/drift>0.3/uncertainty>0.3/横向思维采纳/手动（trigger.py:14-21,92-93）。
- Drift 度量：`goal×0.5 + constraint×0.3 + ontology×0.2 ≤ 0.3` 为合格（observability/drift.py:12,51-56）。
- 共识内部是 Advocate/Devil/Judge 三角色两轮审议（models.py:40-51）。

### 2.4 预算如何记账与熔断

- **没有货币化预算账本**；预算是三类硬约束的组合：
  1. 代数上限：ConvergenceCriteria `max_generations=30`（convergence.py:56）；Ralph 默认 `max_generations=10`（ralph_loop.py:55）。
  2. 墙钟预算：Ralph `max_total_seconds` 只在迭代边界检查 + 单迭代超时默认 1800s，且区分外层超时与内层 provider 超时（ralph_loop.py:26,161-191,220-232）；auto pipeline 有顶层 `pipeline_timeout_seconds` 预算按剩余量下压各阶段超时（auto/pipeline.py:238-255,2283-2289，grep 所见）。
  3. 行为熔断：findings_hash 连续 N 代相同→oscillation_detected（ralph_loop.py:461-505,529-537）；字母等级映射数值后连续下降→grade_regressing（ralph_loop.py:30-36,540-548）。
- **记账形态是证据账本不是金额账本**：`SeedDraftLedger` 把每个决策按来源分类（USER_GOAL/REPO_FACT/.../ASSUMPTION/AUTO_FILL_INFERENCE/BLOCKER，auto/ledger.py:11-27）并定序 SOURCE_PRIORITY 解决同键冲突（ledger.py:64-82）；`DecisionProvenance` 正交记录"怎么来的"（user_confirmed/model_inferred/timeout_default...），model_inferred 与 timeout_default 必须过低歧义门槛才能变成可执行 Seed（ledger.py:41-61）；10 个必需 section 全绿才 is_seed_ready（ledger.py:85-96,533）。
- 防 QA 造假：`verdict` 字符串永远不能凌驾于门自身计算的 passed/score/pass_threshold；NaN 落到 fail-closed 一侧；QA 缺失键 ≠ 通过（ralph_loop.py:393-458）。
- 成本侧另有 PAL Router 三档（frugal/standard/frontier 1x/10x/30x 自动升降级，README.md:471）与 frugality 证据链（evolution/frugality.py:40-68，仅 grep 级阅读）。

### 2.5 产物落盘形态

- Seed：`.ouroboros/seeds/seed_<hash>.yaml`（本地实例观察确认），内容为 goal/task_type/brownfield_context/constraints/acceptance_criteria/ontology_schema 的声明式 YAML。
- 过程：SQLite 事件溯源（persistence/event_store.py + migrations/001_initial.sql、002_brownfield.sql），lineage/generation/evaluation 全部以事件 append，可回放重建（loop.py:463-477）。
- 机械检查配置外置：`.ouroboros/mechanical.toml`（本地实例观察确认），Stage1 的 lint/build/test 命令可按项目定制——与我们 project-context.md 维护"真实验证命令"的做法同构。
- 回溯面：rewind 是一等能力（evolution/rewind.py + TUI confirm_rewind 屏 + plugin/rewind.py），可回退谱系到指定代；checkpoint commits 与 attempted_ac_ids 随迭代透传实现断点续跑（ralph_loop.py:157-158,209-212,274-283）。
- 运行时指令产物：setup refresh 会把规则/skill/插件桥写进各宿主期望的形态（Codex rules+skills、Hermes skills、OpenCode plugin+AGENTS.md、Pi/GJC bridges，README.md:170-176）。

### 2.6 面试的并行咨询面（advisory lanes）

- 面试不是单线问答：每轮可先 fan-out 多条咨询道再提交答案——Claude Code 演示里是六条 advisory lane 并行，dsh 宿主里在轮次之间提交 fan-out 结果（README.md:60-65）。
- 代码侧对应 `mcp/tools/fanout*.py`、`interview_advisory.py`、`question_advisory.py` 与 `resilience/lateral.py` 的 5 个横向思维人格（contrarian/hacker/simplifier/researcher/architect 等"Nine Minds"按需加载，README.md:428-443）；面试响应可带 `lateral_review_required=true` 强制下一轮前过横向评审（capabilities.py:185-194）。
- 打分本身也有 fan-out 形态：`per_dimension=True` 时每个模糊度维度独立一次 LLM 调用并发执行，聚合公式与单调用路径逐字节一致（ambiguity.py:59-99,956-1022）。

### 2.7 跨运行时适配层形状

- **能力注册表单源化**：backend 名字/别名/能力集中在一个 registry（backends/capabilities.py:1-7），CLI help、config 校验、provider factory、runtime 构造全部引用同一份。`BackendCapability` 用声明式布尔+枚举刻画差异轴：是否支持 runtime/llm/interview driver、原生并行子代理与否、host_driven 子代理机制枚举、工具发现机制三态（DEFERRED_TOOL_SEARCH/NATIVE_RUNTIME_DISCOVERY/DIRECT_EXPOSURE，capabilities.py:25-117）。
- 差异被翻译成语义契约而非 if-else 散落：如 SubagentDispatchMode 四态 PLUGIN_PASSIVE/HOST_DRIVEN/HOST_DECIDES/SEQUENTIAL（capabilities.py:66-95），每个 backend 还带 per-runtime 的抽象技能执行指引（ask_user/call_mcp/run_lateral_review 等，capabilities.py:155-220）。
- 具体运行时类在 orchestrator/ 下逐个成文件（claude_worker/codex_cli/opencode/gemini_cli/copilot_cli/goose/grok/pi/zcode/hermes/gjc/antigravity…），由 `runtime_factory.py` 按 config 分发（runtime_factory.py:36-140）；13 个宿主名单见 README.md:70,178。
- dsh 集成是纯配置包：`integrations/dsh-plugin/` 无自定义代码，一行把 dsh 的 mcp-client 指向 `ouroboros mcp serve`（integrations/dsh-plugin/README.md:1-10）。

## 3. 对本项目的可用模式

| 结论 | 模式 | 映射 |
|---|---|---|
| **Adopt** | 停滞/振荡/回归三件套熔断 | 我们 DEEP_AUDIT 目前主要靠 audit-round 预算熔断；`grade_regressing`（连续下降即停）与 findings_hash 振荡检测（ralph_loop.py:529-548）可直接借为 mission-driver 连续多轮 DEEP_AUDIT 发现同一问题集时的停止判据，比纯轮次计数更早止损。 |
| **Adopt** | force 旁路诚实化 | 我们的 draft-review / closure-audit 允许"跳过但记录理由"；ouroboros 的做法更进一步：旁路时把真实指标写进产物元数据并打 warning（seed_generator.py:1670-1676）。Adapt 到 plan-audit：solo review 旁路时在 plan 里盖章真实审查深度标记，而非只写一句"solo"。 |
| **Adapt** | outcome gate 先于最小轮次 | convergence.py:94-116 "已验证的第一代不再付进化 churn"对应我们的 closure-audit：若首轮 DEEP_AUDIT 已全绿且有证据，不应为了流程完整再排后续审计轮。值得写进 plan 执行指南的停止规则。 |
| **Adapt** | 分维度地板 + 总分阈值双门 | ambiguity.py:42-45 的"总分过线但单维瘸腿也拦"可 Adapt 为 multi-dimensional-audit-prompt 的量化版：各维度最低分地板，防止某维度烂掉被均分掩盖。 |
| **对比后部分 Reject** | 预算化记账形态差异 | 其 SeedDraftLedger 是**证据来源分类账**（谁说的/怎么定的），不是金额或次数账；我们 audit-round 计数是**消耗性预算**。两者正交：值得 Adopt 的是 provenance 轴（timeout_default ≠ user_confirmed，degraded 输入必须可辨识，ledger.py:41-61）——映射为我们区分"AI 推断的计划项"与"owner 文档确认的计划项"；Reject 的是把整个 ledger 搬进来，我们的 plans/backlog 结构已承担该职责。 |
| **同异辨析** | "自进化"治理形态 | ouroboros 进化的是**产品规格**（本体 schema 逐代变异），循环自身的治理是**固定常数**（阈值 0.95/0.2/0.3 写死在代码）；我们的 AGE 相反——产品走 roadmap 驱动，**方法论本身**按 log 轨迹定期挖掘更新（规则10/15 的提升阶梯：prose lesson→skill/checkbook→script/lint/CI guard）。本质差异：它是"循环内自进化 + 循环外人工改宪法"，我们是"循环外方法论自进化"。可借鉴点：其 frugality 回顾臂对循环成本做事后取证（evolution/frugality.py）与我们 retrospectives 定位一致，佐证"回顾产物必须结构化落盘"的做法。 |
| **参考** | 能力注册表单源化 | capabilities.py 的"一个 registry 喂 CLI/config/factory/runtime 四处"对我们 DSH Mission Control 的多宿主适配（以及 mission-driver 未来接多 runtime）是形状范本：先定义语义轴（子代理派发模式/工具发现机制），再做 per-backend 声明，避免散落 if-else。 |
| **Reject** | Socratic 面试作为入口 | 其价值依赖"从一句模糊想法开始"的冷启动场景；我们的工作流以 `docs/input/`→`docs/requirements/` 的文件-in/file-out 澄清替代对话式面试（AGENTS.md 操作规则 1-4），引入交互式面试会破坏 repo 为唯一事实源的协作形态。但其**里程碑标签回喂出题策略**（ambiguity.py:153-226）可借鉴为 discussion 文档里的阶段标记。 |

补充映射说明：

- **DEEP_AUDIT 轮次预算对比**：mission-driver 的 audit 预算是"轮次数 + 审计预算耗尽即停"；ouroboros 给同一问题提供了 6 个互补停止信号（outcome 通过、代数硬顶、停滞窗口、评分平台期 ε、振荡、等级回归）。其中平台期检测（convergence.py:447-463：最近 N 轮全被否决且分差 < ε → "再跑一轮期望收益为负，交给 unstuck"）与我们"审计预算烧完前识别边际收益归零"的诉求最贴。
- **其门控 vs 我们 draft-review/closure-audit**：结构同构——都在"进入下一阶段前设数值/证据门"。差异有二：(a) 它的门是**计算权威**的（QA 门自己算 passed/score，verdict 字符串不能凌驾，ralph_loop.py:444-458），我们的 review 目前靠 reviewer 判断文本结论；(b) 它区分"不可配置的权威门"（覆盖/per-AC/回归）与"可配置的策略门"（eval_min_score 等，convergence.py:58-68 注释）——这个分层值得抄进 closure-audit 设计：哪些检查项允许 plan 配置放宽、哪些永远不可关。

## 4. 风险与不适用面

- **规模与复杂度不匹配**：31 万行 Python、3300 行的 auto/pipeline.py、2081 行的 loop.py。其大量机制（事件溯源 SQLite、watchdog、SIGINT 恢复、13 运行时）服务的是"长时间无人值守跑产品代码"场景；mission-driver 是文档驱动循环，照搬会引入远超收益的基础设施。
- **哲学前提不同**：ouroboros 把"人类不清楚"当第一瓶颈，用 LLM 打分的模糊度门强制前置澄清（README.md:128-134）；AGE 假设输入侧已有 owner 文档体系，缺的是执行纪律与审计。其面试门控对我们价值主要在**旁路诚实化与分维度地板**两个局部模式。
- **LLM 评分的可复现性依赖**：模糊度/语义/drift 全是 temperature=0.1 的 LLM 自评，项目自己也只能用 retry+格式校验兜底（ambiguity.py:471-579）；我们若引入类似量化门，应优先用确定性信号（命令退出码、diff 规模）打底，LLM 分数只做辅助面。
- **治理常数不可配置的代价**：阈值大多硬编码为模块常量，调优需改码；文档里也自述"gate is a default worth arguing with, not a lock"（README.md:540）。借鉴时应把阈值放进 mission 配置。
- **未核实面**：stars 数未联网复核；PAL Router 在 src 中未见独立 routing/ 目录（README 结构图可能滞后于重构，实际散布在 orchestrator/route_*.py 与 providers/profiles.py——此点未深挖）；frugality、consensus、hitl_resume、drift-monitor 等模块仅标题级了解；tests/ 与 docs/ 目录完全未读。

## 5. 关键源码索引

| 主题 | 位置 |
|---|---|
| 收敛判据矩阵（outcome/stagnation/oscillation/regression/plateau/evolution-required） | `src/ouroboros/evolution/convergence.py:40-392`（关键：99-127,138-197,249-281,339-381,557-603） |
| 本体相似度公式 | `src/ouroboros/core/lineage.py:301-375` |
| 模糊度打分（权重/地板/里程碑/force） | `src/ouroboros/bigbang/ambiguity.py:37-56,153-226,296-333` |
| Seed 门拦截点 + force 诚实旁路 | `src/ouroboros/bigbang/seed_generator.py:1626-1695` |
| Ralph 循环（墙钟/单迭代超时/QA 权威/振荡/等级回归） | `src/ouroboros/ralph_loop.py:26-68,161-356,393-548` |
| 三阶段评估管线与常量 | `src/ouroboros/evaluation/pipeline.py:40-150`；`evaluation/models.py:26-69,112-146`；`evaluation/trigger.py:14-21,85-93` |
| Drift 权重与阈值 | `src/ouroboros/observability/drift.py:12,51-56` |
| 证据账本（来源定序/provenance/必需 section） | `src/ouroboros/auto/ledger.py:11-120,375-533` |
| 循环主体与谱系落盘 | `src/ouroboros/evolution/loop.py:363-477` |
| 运行时能力注册表（13 宿主差异轴） | `src/ouroboros/backends/capabilities.py:17-117,155-220` |
| 运行时工厂分发 | `src/ouroboros/orchestrator/runtime_factory.py:36-140` |
| 产物样本 | `.ouroboros/seeds/seed_*.yaml`（仓库自带实例） |
| dsh 挂载方式 | `integrations/dsh-plugin/README.md`（纯配置 bundle） |
| 面试咨询 fan-out / 横向人格 | `src/ouroboros/mcp/tools/fanout*.py`、`interview_advisory.py`；`resilience/lateral.py` |
| 评分维度 fan-out | `src/ouroboros/bigbang/ambiguity.py:834-1022` |
