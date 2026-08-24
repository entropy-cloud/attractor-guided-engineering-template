# Long-Run Autonomy: Agent Reuse, Prompt Assembly Discipline, and Rule DSL — Research Report

> Status: research note（仅调研，不改 roadmap；结论供后续立项讨论）
> Date: 2026-08-24
> Scope ruling（human 已裁定）: ① 本报告不含 roadmap 增项；② 「长时间自主运行」**包含跨 run 连续自主运行**（队列/断线续跑在界内）；③ **CLOSURE_AUDIT / DEEP_AUDIT 等结构性独立审计环节禁入池化复用**。
> Sources: `docs/design/dsh-plugin-integration.md`、`docs/architecture/dsh-plugin-packaging.md`、`docs/backlog/dsh-plugin-roadmap.md`（M1–M4 全 done）、`docs/analysis/2026-08-22-0000-dsh-goal-plan-mode-research.md`（R1）、`tools/mission-driver/src/{engine.js,runner.js,orchestrator.js,postmortem.mjs}`、`tools/mission-driver/prompts/*.md`、`plugin/dsh/src/{native-executor.ts,mdcontrol-routes.ts,plan-status-gate.ts}`、`plugin/dsh/preset/age/agent.cordis.yml`
> 方法：源码级事实核对（本仓库）+ 宿主行为引用一律标注"实现时须复核"，沿用 R1 的核验纪律。

## 1. 问题定义

目标形态：**自动化运行与智能运行无缝结合的长时自主开发循环**。具体拆成六个设计命题：

| # | 命题 | 一句话表述 |
| --- | --- | --- |
| P1 | 文档门禁化 | `docs/` 下每个文件编写前有对应 guide，写完后有独立 review——且强制力落在插件执行逻辑而非 AGENTS.md 散文 |
| P2 | reviewer 池化 | 同批计划带 group 标识，同组顺序 review 复用同一 reviewer；是否复用、如何复用要有规则 |
| P3 | drafter 长期复用 | 按 roadmap 拟计划的 agent 跨轮次复用；初始提示词只送一次，后续只送动态部分（吃模型缓存） |
| P4 | 双模式提示词组织 | 新启 agent 与延续 agent 有通用的不同 prompt 组织方式；最理想形态 = 固定前缀 + 动态后缀，最大化前缀缓存命中 |
| P5 | 必读文件预注入 | 从 AI 执行轨迹分析出必读文件，直接以 `<file path="xxx" hash="vvv">` 形式嵌入提示词，省去多轮读取；指定目录强制全文进入上下文 |
| P6 | 规则 DSL | 上述强制规则以描述式 DSL 定义，插件读取并应用；agent 交互模式抽象成规则 |

## 2. 现状基线（已核实事实）

### 2.1 已经存在、可直接借力的机制

1. **run 内 agent 复用已成立（native 模式）**：一个 run 只创建一个 child agent，handle 全 run 存活，步骤间以 `followup` 续用；冷句柄经 `agents.resume` 恢复；run 终态才 `dispose()`（packaging doc §Native Dispatch API Chain）。opencode 进程驱动同样有 run 内会话连续性（`--session {session}`，runner.js:23,44）。**但 agent 身份不跨 run**——终态即销毁，这是 P2/P3 要补的洞。
2. **批次分组键事实上已存在**：`draft-from-roadmap.md` 规定一次拟 1–3 个 plan，文件名 `{YYYY-MM-DD-HHmm}-{N}-{slug}.md` 的时间戳前缀就是隐式 batch id；`{N}` 定执行序。P2 缺的只是把这个隐式键显式化、机器可读。
3. **"强制规则进执行逻辑"有落地先例（M3-WI13）**：`plan-status-gate.ts` 在 `tools/pre-execute` 拦截 completed 状态改写，evidence-rule（F1/F2/F3 三 allow face + 无证据面 allow+观察日志的 D3 姿态）+ shadow 先行的误杀教训都已沉淀。P1/P6 是同一模式的推广，不是新发明。
4. **异步作业契约 + 终态回执**：`mdcontrol.run` 即返 `{runId,status:'started'}`，引擎 detached in-host 任务继续；可选 `agents.get→followup` 回执；每 root 单活跃守卫。跨 run 连续自主运行（§6）的地基已在。
5. **Reflexion 后见管线**：`postmortem.mjs` + `memory/_index.md` always-load 契约——轨迹分析的现成挂点。
6. **长会话压缩三件套中的二件套**：AGE preset 自带 `compaction-basic` + `tool-result-pruner`（entry-local isolate realm）——长命 agent 必然被压缩，这直接塑造 P5 的 hash 再注入需求。
7. **宿主先例**：`goal-round-driver` 证明"同一 session 内有界多轮自主推进"是宿主认可形态；Flow DSL 因分支/预算/marker 契约仍握排序权（packaging doc §Behavioral differences）。

### 2.2 关键缺口（本报告要补的）

- 无跨 run / 跨角色的 agent 池；无 group 标识语义；无 prompt 组装纪律（每步全量渲染模板，`draft-from-roadmap.md`:5-10 与 `plan-review.md`:5-10 **每个轮次都重新指示读同一批上下文文件**——读轮次浪费 × maxCycleVisits × 多 run 天数，乘性放大）；无轨迹→必读文件的回灌通路；强制规则散落在 AGENTS.md 散文中，靠模型自觉。

## 3. 逐命题分析

### P1 文档门禁化（guide-before-write / review-after-write）

**判断：可行且应做，但必须 shadow-first + 证据规则先行。**

- 形态：第二个 `tools/pre-execute` 监听器（"docs-gate"），matcher 锚定 `write/edit/str_replace_editor` × 路径域 `docs/{requirements,design,architecture,plans}/**/*.md`。**范围必须收窄**：`logs/`（append-only 高频）、`input/`（原材料）、`audits/`（本身就是评审产物）豁免，否则门禁噪音淹没价值。
- beforeWrite 证据面：对应 guide 存在。guide 的落点需要定一种可机检的约定（候选：front-matter `> Guide: <path>` 引用行，或 `docs/guides/<同名>.md` 约定路径）。推荐前者——显式、rename 安全、和 plan 的 `> Source Audits:` 同构。
- afterWrite 证据面：存在指向该文件的 review record 且状态 closed（复用 audits 目录词汇），或该文件处于某个 allow face（如刚由 REVIEW_PLANS 流程自身写入——F1 式"in-flight"面，防 WI13 那种误杀引擎自身编辑的事故重演）。
- **红线继承**：D3 姿态保留——无任何证据面的项目（从未跑过引擎的手写文档）allow + 观察日志，绝不 deny。上线顺序：observe-only 记录一段时间 → 用真实日志校准 matcher/证据规则 → 再切 enforce。WI13 的教训字面适用："字面规则经 3 轮 draft review 核实会误杀合法路径"。
- 与独立性红线的界面：这里的 review-after-write 是**发布前评审**，不是 closure/deep audit，允许按 P2 的池化规则走；但它必须是独立 dispatch（不能由写文件的同一个 turn 自评）——gate ≠ reviewer（R1 §5.2）。

### P2 reviewer 池化与 group 标识

**判断：同意方向（性能 + 同批一致性收益真实），但要加三条护栏。**

- **group 标识显式化**：drafter 写 plan 时落 front-matter `> Plan Group: <batchId>`（batchId 取批次时间戳即可），文件名时间戳前缀降级为 fallback。机器可读、rename 安全，且对现有格式零破坏（新增一行）。
- **池机制**：mission-control 服务内存维护 `{role}:{groupId}` → {agent, lastSentHashes, idleTimer} 的映射。首个成员 `agents.create`（reviewer charter 作固定前缀，见 P4），同组后续成员 `followup`；空闲 TTL 到期 `dispose`；崩溃后凭持久化的 sessionId `agents.resume` 冷恢复。**宿主调用面不增**——仍走六调用账本（create/resume/followup/status/dispose/get），packaging doc 的版本风险条款无需修改。池子放在既有 mission-control 服务内部，不新开 cordis 挂载面、不动 isolate realm 姿势。
- **三条护栏**：
  1. **跨组必新启**——组是复用的最大粒度，杜绝跨批次的判断污染；
  2. **轮换**——同组内超过 K 个成员或 charter 所依赖的上游文档 hash 变化时强制换新（anchoring 偏置的对冲）；
  3. **审计禁入池**（human 已裁定）——CLOSURE_AUDIT / DEEP_AUDIT / multi-audit 保持每次独立新 dispatch，这是 AGE「第二 agent 结构性独立」的承重墙，池化不得触碰。池化只适用于 plan-review、P1 的 docs-review 这类前置/过程评审。
- 收益量化直觉：REVIEW_PLANS 对每份 plan 都要求完整读 planGuide + project-context + module CONTEXT（plan-review.md:5-10）。同组 3 份 plan = 2 次冗余上下文构建；跨 cycle 反复出现。池化后这部分从"每次 dispatch 的工具轮次"变为"首成员一次性成本 + 前缀缓存摊销"。

### P3 drafter 长期复用与缓存纪律

**判断：这是六个命题里性价比最高的一个，建议最先落地。**

- 现状的浪费结构：DRAFT_PLANS 每 cycle 重入（maxCycleVisits=8，且跨 run 数天反复），每次都全量渲染模板并指示重读三份稳定文件。稳定文件的内容变化频率 ≈ 周/月级，而 dispatch 频率 ≈ 分钟级——错配明显。
- 方案：角色池 `drafter:{projectRoot}`（或 `drafter:{missionName}`，倾向前者——roadmap 是项目级的）。首 turn = charter + 固定文件块（P5 格式）；后续 turn = 动态增量（roadmap 未完成项切片 + 上轮 deferred 引用 + marker 契约提醒）。
- **缓存语义要点**（实现时须对 provider 复核）：DeepSeek 侧 context cache 为自动前缀匹配、无显式控制 API。因此纪律比机制重要：
  - 固定字节排最前：宿主组合的 persona / `age:mode` section / AGENTS digest 本就稳定，charter 与文件块紧随其后；
  - 前缀里禁止时间戳、随机数、轮次计数等易变字节；
  - marker 指令属动态后缀（本就是 per-step 内容，现状兼容）；
  - 会话历史本身即前缀——followup 天然共享前轮 KV，这正是"延续 agent 只送动态部分"能省钱的底层原因。
- 与 compaction 的相互作用：长命 drafter 必被压缩，压缩可能剪掉早期文件块。对策不是对抗压缩，而是 **hash 化再注入**（P5）：组装器记录每 session 已发送的文件 hash 集，检测到压缩事件（token-meter/session 事件面，可得性待核验）或周期性触发时，只对"仍在 charter 清单内且 hash 变化/已被裁剪"的文件重发。

### P4 新启/延续双模式的通用 prompt 组织

**判断：应抽象为一个组装器接口，两种模式是它的两个纯函数。**

```
PromptAssembler.assemble(mode, spec, dynamicCtx) -> string
  mode=FRESH    => fixedPrefixBlocks ++ [dynamicBlock]
  mode=CONTINUE => deltaEmbedBlocks(lastSentHashes, currentHashes) ++ [dynamicBlock]
```

- `spec.fixedPrefixBlocks[]` 的块类型：`{kind:text|file|dir, ref, maxBytes?}`；`dir` 块即"强制全文嵌入"的表达形式——**嵌入强于强制读取**：与其在提示词里命令"完整读完 X"然后祈祷模型不多轮分页，不如由插件直接把全文放进上下文，一轮都不用跑。用户所述"避免每次读取一半再继续读"由此根治，而不是缓解。
- 组装器须记录 per-session 的 lastSentHashes，CONTINUE 模式的增量才有确定性依据。
- **引擎红线下的落位**：第一落位在插件层（NativeExecutor 在 dispatch 前包一层文本组装），引擎零 diff。进程后端的降级形态 = 把 fixedPrefix 折叠进每步 prompt 头部（读轮次照样省；跨步缓存收益在 opencode `--session` 连续性下部分存在，pi/cline 下不承诺）。未来若证明有价值，可下沉为引擎纯模块——但那是独立立项，不在本报告主张内。
- `promptsDir` 覆盖链（mission 级 prompt 替换）必须被尊重：policy 是叠加层，不取代既有 prompt 解析优先级。

### P5 轨迹驱动的必读文件预注入

**判断：方向正确，数据闭环要落在 git 文件里（AGE 状态权威裁决的直接推论）。**

- 数据源（全部已有）：child session events（native 模式下工具调用可见于 session log）、run-state 步骤产物、postmortem/memory Reflexion 输出。
- 回灌工件：`missions/context-profile.json`（项目所有、进 git、schema 版本化）。挖掘任务挂在 analyze 管线尾部或独立的 `mdcontrol.profile` 路由：统计 read 频次表 → 更新 profile。R1 §5.1 的裁决（状态权威必须在 git 文件而非 session/host 内存）原样约束这里——profile 是文件，挖掘结果可被人审、可被 diff。
- 注入格式采用用户提案的戳记：`<file path="..." hash="sha256-8">…</file>`。三个用途：① dedup（CONTINUE 模式跳过未变文件）；② 陈旧检测（dispatch 时 hash 不符 → 重发）；③ 可审计性（grep 即得出处）。hash 截短为 8 位十六进制足够防碰撞且省 token。
- 冷启动：首批 profile 由 AGENTS.md "Read This First" 清单 + `docs/context/codebase-map.md` 种子化，不必等轨迹积累。
- 边界注意：预注入替代的是"导航式读取"，不是理解本身——charter 中仍需一句"以下文件已全文给出，除非 hash 标记变化否则无需重读"，防止模型惯性复读。

### P6 描述式规则 DSL

**判断：必要，但 DSL 只编码"机械可执行子集"，规范散文留在 AGENTS.md。两者是分工不是迁移。**

草案（三段式，YAML/JSON 均可，倾向 YAML 与 cordis.patch.yml 风格一致）：

```yaml
version: 1
sessions:                      # P2/P3/P4 —— 交互模式抽象
  drafter:
    mode: pooled               # fresh | run-child | pooled
    poolKey: "drafter:{projectRoot}"
    idleTtlMinutes: 30
    rotateEvery: 8             # 成员轮换阈值
    fixedPrefix:
      - { kind: text, ref: prompts/draft-charter.md }
      - { kind: file, ref: "{{contextDir}}/project-context.md" }
      - { kind: dir,  ref: docs/context/, maxFileBytes: 60000 }   # 强制全文
      - { kind: file, ref: "{{planGuide}}" }
assembly:                       # P4/P5
  embedStamp: '<file path="{path}" hash="{hash8}">{content}</file>'
  continueDelta: true           # 依据 lastSentHashes 只发变更
gates:                          # P1 —— 推广 WI13 模式
  - id: docs-guide-review
    match: "docs/{requirements,design,architecture,plans}/**/*.md"
    beforeWrite: require-guide          # front-matter > Guide: 引用存在
    afterWrite: require-review          # closed review record 存在或有 allow face
    reviewerPool: reviewers
    posture: observe                    # observe → enforce 两段上线
```

- 校验与钉法沿用既有纪律：mission-check.mjs 式 fail-fast（路径 typo 即拒）+ 结构测试钉住（age-preset.test.mjs 先例）。
- 放置位置：项目仓库 `missions/`（AGE 的 repo-as-source-of-truth），插件自带 schema 默认值。消费者不改插件即可按项目定制。
- 判据写死：**凡需要模型judgment 的规则（何为好计划）留散文；凡可判定的规则（文件存在/hash 相等/状态行匹配）进 DSL**。WI13 已经走过一遍这条分界线。

## 4. 统一抽象：把交互模式收进一个 seam

以上六命题收敛为三个概念件，全部居于插件层、引擎零 diff：

1. **AgentSessionPolicy**（P2/P3/P4）：`{mode: fresh|run-child|pooled, poolKey, ttl, rotateEvery, resumeOnCold}` —— StepExecutor 之上的生命周期策略层。现有 native 行为恰是 `mode: run-child` 特例，抽象是泛化不是重写。
2. **PromptAssembler**（P4/P5）：FRESH/CONTINUE 双模式纯函数 + hash 台账 + dir 全文嵌入。
3. **GateRule**（P1/P6）：tools/pre-execute 监听器的声明式配置化，WI13 是手写的第一个实例。

三者共用同一套宿主调用面（六调用账本不变），共用同一个使命控制服务挂载（realm 姿势不变）。

## 5. 跨 run 连续自主运行形态（scope 已确认含此）

现状：单 run 内自主（引擎状态机 + 异步契约），run 间靠人。补齐四件事即为无人值守长时形态：

1. **队列**：`mdcontrol.enqueue`（或在 run/list 之上加薄层），worker 循环消费，受每 root 单活跃守卫天然串行；终态回执（已有的 opt-in followup）作为下一任务的触发沿。策略上限必须显式配置：`maxConsecutiveRuns`、墙钟预算、失败熔断（连续 N 次 failed → 暂停队列 + 回执告警），**默认关闭**——连续模式是 opt-in 的 continuous posture，绝不让存量用户意外获得无人值守行为。
2. **宿主重启后的自动续跑**：启动时扫描 `_tmp/*/run-state.json` 中 status==running 且无活跃登记的孤儿 run → 按 policy 二选一：从最后完整步骤恢复（磁盘逐步恢复能力引擎已有）或标记 failed + 回执。同样 opt-in。
3. **预算与观察**：token-meter 面若宿主暴露消耗查询则接预算熔断（可得性待核验）；monitor 零改动继续当主观察面，队列状态以小 JSON 与 run-state 同目录同词汇存放。
4. **人的介入点保持**：Review Hold 的 plan 不自动激活（现语义已是 draft 不被执行拾取，天然安全）；continuous 模式遇 Blocker Hold 时暂停并回执，而不是绕过。

与 dsh-goal 的关系维持 R1 结论：交互会话内的 goal 服务不入任务权威；队列是插件层编排，不借宿主 goal。

## 6. 风险清单

| 风险 | 说明 | 对策 |
| --- | --- | --- |
| Context rot | 超长会话质量衰减；压缩剪掉关键块 | TTL + rotateEvery 轮换；hash 再注入；压缩事件检测（可得性待核验） |
| Reviewer anchoring | 同一 reviewer 连审多份关联计划产生锚定偏置 | 跨组必新启 + 组内轮换 + 输出须引用 checklist 条目（可审计） |
| 缓存失效脆弱 | 前缀混入易变字节即全miss | 组装器确定性排序；先测量命中率再谈进一步优化（provider 语义实现时复核） |
| 门禁误杀 | docs-gate 拦住合法编辑（WI13 字面规则教训） | shadow-first + 证据规则 + D3 fail-open 姿态原样继承 |
| 嵌入陈旧 | 固定前缀里的文件内容过期 | dispatch 时 hash 校验；profile 漂移纳入 deep-audit 视野 |
| 宿主 API 面膨胀 | 池化诱导新调用 | 六调用账本冻结为验收项；新调用 = 显式 changelog 事件 |
| 引擎红线 | @deepseek-ai 导入渗入引擎核心 / CLI 契约漂移 | 三件套全居插件层；进程后端降级形态单独验证；零引擎 diff 作为每切片验收标准 |
| 成本悖论 | 池化拉长单 session，压缩与长上下文定价可能抵消节省 | P3 最先落地并以实测数据决策后续；不可观测收益的切片缓行 |

## 7. 建议的落地切片顺序（仅供后续立项参考，非 roadmap 变更）

1. **S1 PromptAssembler + embed-stamp + FRESH/CONTINUE**（P4/P5 注入半边）——纯插件、确定性 e2e 可扩展、收益立现于现有流程；
2. **S2 drafter/reviewer 池 + Plan Group front-matter + group 路由**（P2/P3）——依赖 S1 的组装器；
3. **S3 context-profile 挖掘**（P5 回灌半边）——挂 analyze 尾部，反哺 S1 的 fixedPrefix；
4. **S4 docs-gate**（P1/P6）——shadow 期可与 S1–S3 并行观察；
5. **S5 continuous 模式**（§5）——最后，因它放大前面一切行为的后果。

每切片沿用 R3 验证姿势：结构域（纯 Node 进 CI 链）→ 组合域（in-process boot）→ 真宿主 env-gated 腿。

## 8. 开放问题

1. 宿主是否向插件暴露 token 消耗 / 缓存命中的可观测面？（决定成本假设能否验证）
2. provider 前缀缓存的确切语义（TTL、最小前缀长度、计费折扣）——实现前须实测复核，本报告所有缓存收益论述以此为条件。
3. guide-before-write 的 guide 由谁产出？AI 起草 + 人批准的流程需要一个轻量约定（建议并入 P1 的 front-matter 设计一起定）。
4. CONTINUE 模式是否也覆盖 correction-retry 重试轮？（与 parseModel 在 native 下的单模型缺口相互作用，值得单独裁定）
5. 队列策略的默认上限数值需要 product owner 给输入，本报告只定了"必须有且默认关"。

## 9. 增补（2026-08-24，dsh-plugin-survey 交叉发现）

> 18 份插件调研见 `docs/analysis/dsh-plugin-survey/INDEX.md`；以下修正/强化本报告结论：

1. **P2 池化判据补强**（`dsh-agent-teams.md`）：「followup 续用 vs 崩溃 resume」的判据采用其 **attemptId 代际令牌 + parked / cold-recovered 分界**——池成员每次派发持代际令牌，接管/恢复前先验代际，陈旧 attempt 显式 revoke；其两阶段 handoff 可 Adapt 为组内轮换的实现骨架。注意它**没有**防 anchoring 轮换，该策略仍需自研。
2. **P5 轨迹挖掘的边界例证**（`ouroboros.md`）：findings_hash 振荡/等级回归检测可纳入 context-profile 更新的防抖；但 ouroboros 进化的是产品规格且治理常数写死，与我们"受治理进化方法论+文件外化"方向相反——只借停止信号机制。
3. **P6 DSL 隔离预案**（`dsh_workflow.md`）：若 prompt-policy DSL 未来演化为可执行能力脚本，其 QuickJS capability VM（静态黑名单词法剥离+独立堆+严格 JSON 边界）是现成的隔离预案，暂缓采纳、立此存照。
4. **prompt 组装纪律的旁证**（`dsh-plugin-agent-workflow.md`）：纯函数投影 + anchorSeq 增量快照构建器可用于轨迹回放面，与本报告 P5 的 hash 戳记同构。
