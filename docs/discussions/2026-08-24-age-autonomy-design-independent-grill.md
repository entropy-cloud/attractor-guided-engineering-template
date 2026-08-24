# AGE Autonomy 设计独立评审（grill）记录

> Status: discussion / 独立评审意见（非审核记录；供 human 与后续审计参考）
> Date: 2026-08-24
> Scope: `docs/design/age-autonomy/{00–05}` 六文件 + `docs/backlog/age-autonomy-implementation-roadmap.md` + `missions/age-autonomy-implementation.json`
> Method: 对抗式提问（用户指定的 grill-me / grill-with-docs 技能在本机 `~/ai/superpowers` 与当前会话技能目录均不存在，已核实；改以同方法自做：不采信断言，逐条追查证据、找反例、找未答问题）。宿主能力两处「未验证」以 `~/ai/deepseek-harness` 源码核实。
> 与前审的关系：`docs/audits/dsh-plugin/2026-08-24-age-autonomy-design-audit.md`（4 P0 + 25 P1，已修订）视为已覆盖面，本记录只报告**该审查之外的新发现**与**仍未明确的问题**。

## 结论（Verdict）

**方向性认可，附三个前置条件。** 架构骨架（账本外化 + 完成派生 + 法律纯函数 + 守夜人 + 双形态零引擎 diff）是对的，比现状（引擎驱动 + 信 marker）强一档；设计文档质量高，自审已消灭 29 处问题。但在我（独立读者）看来仍有两个**信任边界级**的洞必须在 P1 立项前裁决，否则「法律强制」的实际强度低于文档声称。三个前置条件：

1. 明确执行通道信任模型（见 G2）；
2. 执法层自体不可被被执法者修改（见 G1，含 Protected Areas 补录）；
3. 双后端并发边界成文（见 G3）。

## 一、认可的部分（不重复审计报告的 P0/P1 处置）

1. **完成是派生而非写入**（01 §5.2）——这是整个设计最强的单一决策，消灭了「自证完成」这一整类 bug；`basisHash` 全量绑定与终态冻结使其可被一致验证。
2. **审计回执的诚实边界**（02 §4.1）：只声称「独立派发发生 + 回执匹配 + 防伪强度 = 身份门禁 + nonce」，不假装能机械验证「思考独立性」——这种 epistemic honesty 是同类设计中罕见的。
3. **P2 零插件记忆 + 账本进 git**：崩溃恢复与跨机器接续从口号变成结构属性；claim/dispatch 内联、不设独立 registry，一事一处纪律贯彻得彻底。
4. **fail-open + shadow-first 上线纪律**（02 §6）与 WI13 误杀教训存档——把「门禁会误杀合法路径」当作默认风险对待，工程上成熟。
5. **绞杀式迁移 + 每阶段机械验证门**（roadmap M1–M5、WI11/24/31/36/40）——「chat 式 close 不可收口」落到可执行命令，是 roadmap 里最值钱的一层。
6. **前审的处置质量**：P0-1（预算耗尽静默 completed）、P0-5（全勾死锁）、P0-6（审计拒绝死锁）等是真死锁级发现且修订闭环。

## 二、新发现的问题（超出已有审计）

### G1（信任边界·P0 级）被执法者可以改写执法者自身

- 法律 = `plugin/dsh/src/law/*` 代码 + `missions/autonomy.policy.yml` 策略数据，二者都在 **AI 可写的工作区内**。门禁族（02 §4）只把 `plansDir` 与 `roadmapPath` 列为受护路径（02 §4.7），**没有任何一条规则、一个保护区声明「法律自身文件不可被 AI 写」**。
- `docs/context/ai-autonomy-policy.md` Protected Areas 表只覆盖 engine.js、exitMap、flow JSON 等；law 代码、policy 文件、plan-check/gate-check CLI 均不在列。
- 后果：持续模式下，一个执行子代理直接 `edit plugin/dsh/src/law/completion.mjs` 或改 `autonomy.policy.yml` 把 `completion-derivation` 门禁调成恒 allow，三硬门全部形同虚设；门禁对它自己的灭活没有任何 deny 依据。CI merge-blocking 是提交边界的事后防线，挡不住无人值守循环内的**工作树直接修改**（甚至不提交也可完成一轮自欺）。
- 处置建议：① law 代码 + policy 文件 + 两份 check CLI 补进 ai-autonomy-policy 的 Protected Areas（ask-first 起步）；② 路径护栏增加 law 文件域的 `deny AI-write`（守夜人/引擎例外）；③ M2 的 Verification Gate 增加一条「AI 无法改写 law 域」的 e2e 断言。

### G2（信任边界·P0 级）执行通道旁路存在，但信任模型未声明

- 门禁只拦截 `write / edit / str_replace_editor`（02 §6 部署面表）。**bash（含 sed/python 等）是完全等价的文件写入通道，不经 pre-execute。** 既有 `plan-status-gate.ts` 已把「plan rewrites through non-matching tools (bash/sed)」列为**接受了的漏杀面**；新设计对 checkbox、dispatch/accepted 行、frontmatter 机器字段的防护同样没有堵这个通道。
- 更严重的是设计**没有声明信任模型**：执行子代理是「诚实但马虎」（门禁 = 护栏，旁路只是工程瑕疵），还是「对抗」（门禁 = 安全边界，旁路 = 致命）？P6「不信任自陈」、nonce 防预造回执、写者身份门禁这些设计都朝着**对抗强度**走，但执行通道只提供护栏强度。若走护栏模型，bash 旁路可成文接受（git 历史事后可归因）；若走对抗模型，则 checkbox/机器字段必须走**受控变更通道**（如经 `mdcontrol` 路由由守夜人落盘，子代理只能提交 proposed content），这同时会改变 01 §4.4 的写者布局。**这是必须由 human 裁决的模型选择，P1 立项前就要定。**
- 附带事实（源码核实）：`tools/pre-execute` 载荷确实带 `exec.agent?.id`（Agent.id = SessionId，`~/ai/deepseek-harness/packages/core/tools/src/index.ts:152,330`、`packages/core/agent/src/runtime-types.ts:64-66`）——写者身份门禁（硬门 2）的宿主前提成立。但该字段是 optional 的：非 agent 驱动的调用路径没有身份，门禁对无身份调用只能 fail-open（02 §2 已写「actor 缺省跑结构子集」，但**结构子集 = 无身份验证 = G2 的旁路同样适用**）。

### G3（并发·P1 级）双后端共享同一账本只是断言，没有协调机制

- 03 §10 说「引擎 = 无人值守执行后端之一（初期仍主后端）」「二者共享同一账本/法律/完成定义」。但 claim 原语（01 §4.4）是**守夜人世界的新原语**：引擎执行模型（flow + marker + subflow run-state）里没有 claim 概念。同一 checkout 上 CLI 引擎 run 与 DSH 连续模式守夜人并存时（本仓库自己就同时用两种形态），两者会同时拾取同一 plan：
  - claim CAS 只串行化**机器字段**写回，挡不住两个执行者并发做同一份 AI 工作（浪费 + 正文非机器字段无 CAS 可冲突）；
  - 单活跃守卫是**进程内内存态**（03 §4），跨进程（CLI run 进程 vs 宿主插件进程）不存在。
- 处置建议：要么成文「同一 checkout 同一时刻只允许一种执行形态」（如文件级锁/账本锁），要么把 claim 语义下沉为引擎也能遵守的公共原语，要么在 M3 前把引擎退役判定提前。**目前 roadmap 没有任何 WI 覆盖这个边界。**

### G4（judgment 质量·P1 级）结构性独立 ≠ 统计独立；审计有效性无度量

- 02 §7 诚实承认「审得对不对」不是门禁能保证的，只保证「该审的审了」。问题在于：连续模式里评审者/审计者与执行者是**同一模型族、同一权重、同一套上下文构成**（DSH 宿主默认 Provider/模型），结构性独立派发挡不住**相关性错误**——同一个 bug 心智模型会以相同方式污染 drafter 与 reviewer。04 的池化让 drafter/reviewer 会话长期复用，进一步放大同源偏置；「同组顺序 review 复用同一 reviewer」是成本最优但判断多样性最差的选择。
- 设计没有：① 审计有效性度量（审计驳回率、返工率、回溯发现率——若 20 轮审计 0 驳回，审计就是合规仪式而非质量机制）；② 同模型族审计的衰减对策（抽样人工复核、审计角色换模型/换 provider、或文档化的降级声明）。
- 另外 04 §2 只禁了 CLOSURE_AUDIT / DEEP_AUDIT / multi-audit 进池，**没禁同一 session 跨角色复用**（drafter 池成员同时是另一 group 的 reviewer；同 run 内 auditor 与某 plan 执行者同 session）。独立性红线是 per-dispatch 的，池化使 per-session 的交叉污染成为可能——需要一条「角色互斥 + 跨组互斥」的显式规则。

### G5（宿主能力·P1 级）两个「未验证」现在有了答案——CAS 可用但单槽被占

审计 residual risk §2 的两个未知数，我已用 `~/ai/deepseek-harness` 源码核实：

1. **写者身份：有。** `tools/pre-execute` 的 `ToolExecution.agent?: Agent`，`Agent.id: SessionId`（见 G2 附带事实）。plan-status-gate 现有实现已验证 pre-execute 边界可用（plugin/dsh/src/plan-status-gate.ts）。
2. **CAS 原子写：有，但通道是单槽瀑布，且被默认挂载的宿主插件占据。** `fs/edit-intent` / `fs/write-intent` waterfall 槽 + `FsWriteIntent = createIfAbsent | replaceIfVersion(version)`（`packages/fs/fs/src/types.ts:125`、`packages/fs/fs/src/index.ts:58,66`，edit.ts:126 走同一槽）；而 `fs-observation-policy` 是 base bundle **默认挂载**的（`packages/bundle/base/cordis.patch.yml:221-222`），它「占据单决策槽且不调 next()」（`packages/fs/fs-observation-policy/src/index.ts:116-122`）——AGE 法律层想用 CAS 必须与它争槽或协商注册顺序，不能假设「宿主 edit 具备 CAS」直接可用。**02 §4.5 的「二选一」需要重写为：路由决策（与 observation-policy 集成 / 替代其槽位 / 守夜人串行落盘）+ P2 首片实测。**

### G6（产品·P2 级）人的异常通道是静默的

- 05 §2.4 的收尾回执点若落在已关闭会话（「典型一天」里用户去开会了），回执无人接收 → 循环停在 `partial/blocked` **无限期静默**。设计没有：超时未响应升级（再回执 / 隔日提醒 / 失败面单）、回执在 GUI 的呈现方式、或「无人值守」声明中对此的成文边界。指控性的说法是：continuous 模式「不需要人」只在**一切顺利**时成立，异常路径恰恰是它最需要人的时候，而异常路径没有注意力预算。

### G7（原语·P2 级）claim TTL 无心跳机制

- `claim-expires` 是墙钟硬 TTL（01 §4.4、03 §5）。一个合法 6 小时的长任务 vs 默认 30 分钟 TTL：若执行者有产出但未勾选（不落盘），守夜人凭什么区分「活着」与「死锁」？03 §7 的停滞指纹用了活动信号（events/session 工具活动），但 **claim 续期的信号通道没有定义**——活动信号是否续期 TTL？续期写不写账本（写了 = git 噪声，不写 = 重启后无法重建）？这是 claim 语义的一个明确空白。

### G8（迁移·P2 级）零引擎 diff 与引擎侧 `> Plan Status:` 写行为之间存在过渡裂缝

- 引擎 prompts（execute.md 等）在 run 内指示 AI 更新 `> Plan Status:` 行；WI7 codemod 把该行删掉换成 frontmatter。双读过渡期（M1）内引擎继续跑旧格式 plan 没问题，但**仓库自己的 plan 迁移后**（repos 全部 plan 都要转 frontmatter），引擎再跑这些 plan 时其 prompt 指令指向不存在的行——除非同步改引擎 prompts。改 prompts 不算 engine.js diff，但它是引擎运行行为变更；M1/M2 的 Verification Gate（WI11/WI24）全是单元级/格式级检查，**没有任何一条是「引擎跑一份 frontmatter 化 plan 的端到端」**。这个过渡 e2e 应补进 M2 或 M3 的门，否则「双读过渡」会在最需要它的时候失效。

### G9（声明性·P2 级）trigger DSL 的声明性打了折扣

- `triggers:` 里的谓词是**未定义语法的字符串**（`plan.full-tick ∧ mechanical-verification-missing`）：运算符表、优先级、谓词命名空间、求值序都没有定义；更关键的是 `full-tick ∧ 缺验证` 与 `full-tick ∧ 验证过 ∧ 缺回执` 这类**互斥/顺序语义**仰赖守夜人求值顺序，且 R1–R4 终态规则、mester 归因、恢复语义全部硬编码在守夜人代码里。也就是说：「法律」被劈成 DSL 表面 + 代码实质两半，声明式承诺只在表层成立。前审 residual #5 也点了这个，我补充一个结论方向：要么 R1–R4 与争议性顺序规则全部进 policy 文件（真声明式），要么文档改口「DSL = 触发包络，终态语义 = 代码契约」。

### G10（计量·P3 级）failures 归因的误杀率未成文

- `failures` 归因（01 §6、03 §7）把「测试红」计为失败 → 熔断 held。但测试红最常来自：环境抖动、坏 plan（而非执行者错）、旧测试与迁移不同步、验证命令本身过时。归因错误会把好 plan 误杀进 held，迫使人工 unlock——频繁解锁会耗尽「人在回执点」的注意力预算（与 G6 叠加）。需要：归因规则细化（区分 executor 错误 vs 验证红 vs claim 无产出，可否决后两者计 failures？）、`maxFailures` 默认值成文、误杀观测（解锁原因的日志）。

### G11（证据·P3 级）效率层的核心收益依赖未验证的 provider 行为

- 04 的收益（前缀缓存命中、CONTINUE 增量）建立在「DeepSeek 侧 context cache 自动前缀匹配」假设上，0000 报告自己标注过「实现时须对 provider 复核」。M4 的 Verification Gate（WI33/36）全是自引用单测（测组装器自己的输出），**没有一条测量真实缓存命中率或 token 节省**。作为优化层不影响契约——正确；但 roadmap 把它当 milestone 收口，建议 M4 门加「真实宿主下双模式 token 对比」的观测项，或者明确定位为「机制落地 + 收益待观测」。

## 三、仍未明确的问题（需要 human 或后续立项裁决）

按「不裁决就无法安全开工」排序：

| # | 问题 | 卡住谁 |
| --- | --- | --- |
| Q1 | 执行子代理的信任模型是诚实-马虎还是对抗？（决定 bash 旁路是否可接受、受控变更通道是否必须） | P1 立项 |
| Q2 | law 代码 + policy 文件 + check CLI 是否补入 Protected Areas？路径护栏是否加 law 域 deny-write？ | P0/P1 立项 |
| Q3 | 同一 checkout 双执行形态（CLI run ∥ DSH continuous）如何互斥或协调？claim 是否下沉为公共原语？ | M3 之前 |
| Q4 | CAS 到底走哪条路：与 fs-observation-policy 集成 / 抢占 intent 槽 / 守夜人串行落盘？ | P2 首片实测 |
| Q5 | claim TTL 的心跳/续期信号定义（活动信号是否续期；续期是否落盘） | P2 |
| Q6 | 引擎侧 `> Plan Status:` 写行为与 frontmatter 化 plan 的过渡兼容（双读 e2e 入门） | M2/M3 门 |
| Q7 | 审计有效性度量与同模型族衰减对策（驳回率基线？抽样人工复核？） | P2/P3 |
| Q8 | 角色互斥规则（同一 session 不得同时为 drafter/reviewer/auditor；跨组互斥） | P3 |
| Q9 | 人侧异常通道：回执未响应升级机制、（若有）GUI 呈现；「不需要人」改为「四个介入点 + 抽检」 | P2/P3 产品面 |
| Q10 | failures 归因细则与 maxFailures 默认值；trigger DSL 语法与 R1–R4 归属（DSL 化 or 成文代码契约） | P1/P2 |
| Q11 | M4 收益观测项（真实 token/缓存对比）或明确定位为机制落地 | M4 |

## 四、给 human 的三个最小决策（其余可留到各自立项）

1. **信任模型**（Q1）：一句话裁决「护栏模型，旁路成文接受」或「对抗模型，受控变更通道立项」——这是整个法律层的强度标尺。
2. **执法层自护**（Q2）：把 law 域列为 Protected Areas + 路径护栏 deny 位，一小时内可改完，是最便宜的保险。
3. **双形态互斥**（Q3）：成文「同 checkout 单执行形态」或立项文件锁，防止无人值守期双循环互相踩踏。

> 本记录为独立评审意见，非审核记录；按 AGENTS.md Reviewer-Availability Fallback 的精神，上述发现仍建议由第二个独立 subagent 或 human 复核后并入正式审计。

---

# 增补 A：human 澄清与 DSH 内置机制源级对照（2026-08-24，同会话）

## A1. 信任模型是什么（澄清，决策仍开放）

「信任模型」= 对**被门禁监控的一方**的根本假设：它是「诚实但会犯错」（门禁 = 护栏，防马虎、防遗忘；违规 = 纪律问题，事后靠 CI + git 历史追责），还是「对抗」（门禁 = 安全边界，必须对主动规避成立）？

为什么这个假设决定一切：门禁只拦 `write / edit / str_replace_editor` 三个工具面。`bash`（含 sed/python）是**完全等价且不经门禁**的写通道。若信任模型是诚实，bash 旁路只是工程瑕疵（成文接受，与现有 plan-status-gate 的 recorded miss face 一致）；若是对抗，则 checkbox/机器字段必须走「子代理只提交 proposed content、守夜人统一落盘」的受控通道——那会重塑 01 §4.4 的写者布局与 02 §4.3 的全勾过渡。**设计目前按对抗强度买保险（nonce、写者身份、防伪造回执），却只提供护栏强度的执行通道，两者必须对齐。**

建议（可采纳）：混合模型。默认诚实-护栏（checkbox、正文修订、普通编辑），对抗级保护只给三处高价值面：① 审计回执绑定（dispatch/accepted 行）；② law 自护（见 A2）；③ 终态冻结。这三处若需要，单独引入受控变更通道，成本集中在刀刃上。

## A2. 执法层自护是什么（澄清）

「执法层自护」= **执行强制本身的那一层（law 代码 + 策略数据）不能被它监控的 AI 修改**。具体指：

- 门禁实现：`plugin/dsh/src/law/*`（目标形态）、`plan-check.mjs` / `gate-check.mjs`；
- 策略数据：`missions/autonomy.policy.yml`（gates/triggers/limits 都在里面，改一行即可让三硬门恒 allow）；
- 保护区清单本身：`docs/context/ai-autonomy-policy.md` 的 Protected Areas（今天只覆盖 engine.js/exitMap/flow JSON，**不含 law 域**）。

这些文件都在 AI 可写的工作区内。门禁（02 §4.7）只保护 `plansDir` 与 `roadmapPath` 域；没有任何规则禁止执行子代理改写门禁自己的文件。改 policy 把 `completion-derivation` 调成恒 allow，比绕过任何门禁都便宜——这是整个「法律层」的单点失效。

最小处置（约一小时工作量）：① law 代码 + policy 文件 + 两份 check CLI 补进 Protected Areas（ask-first）；② 路径护栏增 law 域 deny-AI-write（守夜人例外）；③ M2 门加一条「AI 无法改写 law 域」断言。人类评审自己也在 law 域写代码——Ask-first 分级给出合法通路，不误杀。

## A3. 双执行形态裁决（human ruling，G3 关闭）

Human 已裁定：**同一项目目录不会同时运行两个 mission driver**。据此：

- G3 关闭，不再需要文件级互斥锁立项；claim 下沉为公共原语的需求也不复存在（守夜人世界独占执行权时，claim 不需要与引擎协调）。
- 遗留一条成文义务：此边界写进 05-usage（「同一 checkout 同一时刻只允许一种执行形态」），防止未来实现者无意破坏。roadmap 无需新增 WI；05 文档一行即可。

## A4. DSH 内置 goals / plans / todos 与 AGE roadmap / plan 的关系（源码级对照，`~/ai/deepseek-harness`）

### A4.1 三者是什么（第一方源码核实）

| 机制 | 包 | 数据模型 | 存储 | 生命周期 |
| --- | --- | --- | --- | --- |
| **goals** | `packages/goal/goal` | `{id, revision(CAS), objective, phase: active\|paused\|blocked\|complete, blockedReason{code,message}, maxGoalRounds, roundsStarted}` + 进程内 `activation: armed\|disarmed` | `goal/change` 事件进**本会话 append-only JSONL 日志**（`session-persistence-jsonl`，profile root 下按项目目录分桶）；replay-fold 出 projection | create/edit/pause/resume/complete/block/clear；**同会话有界自动续轮**（goal-round-driver：agent idle 且 armed 时注入带 round 编号的续轮消息，revision 防陈旧，quiescence 围栏）；resume/fork 从日志恢复，但 activation 进程本地、会话重开后 disarm |
| **plan mode** | `packages/plan/plan-mode` | `{active, pending}` — 协作姿态，不是文档 | `plan/mode` 事件进会话日志 | `/plan` 开关 + `exit_plan_mode` 工具把完整 plan 以用户提问呈现（Approve / Keep planning）；无 plan 工件、无状态机、无 roadmap |
| **todos** | `packages/todo/tool-todo` | `TodoItem[]{content, status: pending\|in_progress\|completed}` 全量快照 | `todo/write` 事件进会话日志，last-write-wins | 每次调用整表替换；校验（非空/唯一/单 in_progress 可配）；纯执行辅助 |
| （旁证）schedule | `packages/schedule/schedule` | after/at/every 一次性提醒 | 会话持久化 | 会话内过期提醒，session-local |

三个共同点（源码证实）：**状态权威 = 会话 JSONL 事件日志（宿主域）**；命运与**单一会话谱系**绑定（resume/fork 可恢复，跨会话/跨机器不共享）；钩子面 = 会话投影（`goal` / `plan` / `todos` projection key）供 GUI 渲染。

### A4.2 与 AGE 的对照结论

| 维度 | DSH goals/plans/todos | AGE roadmap/plan |
| --- | --- | --- |
| 状态存放 | 宿主 profile 下会话 JSONL（非 git） | 仓库 git 文件 |
| 跨 session/机器 | ✘（会话谱系内） | ✔（commit→checkout 任意续） |
| 完成判定 | 自报（update_goal complete 即完成；无独立审计） | 派生 + 审计回执绑定 + 机械验证 |
| 预算/熔断 | maxGoalRounds（续轮数封顶） | maxAuditRounds / maxFailures / 步数墙钟 |
| 崩溃恢复 | 会话日志 replay | git + checkbox 收敛 |
| 独立性 | 无（自完成）；plan mode 仅人审 | 结构性独立派发 + 回执匹配 |

**结论：不能作为 AGE 的状态权威被复用——它们是会话作用域的执行辅助，不是仓库作用域的项目工件**（与 R1 `2026-08-22-0000` 的结论一致；本增补用第一方源码取代了当时的插件侧推断）。用 host goals 替换 roadmap 会同时破坏：跨会话续跑、跨机器交付、CI 门禁、独立形态、git 可审性——直接违反 AGE 自己的 P1/P2 原则。

### A4.3 可以复用的四个方向（均为「账本 → 宿主面」单向投影，反向禁止）

1. **todos = 执行中的进度镜像**：执行子代理的宿主 todo 列表由守夜人/执行器**从账本派生**（当前 claim 的 plan Phase 未勾项 → todos）。免费获得 GUI 进度条，替代被 deferred 的 in-DSH 面板的一半需求。铁律：**只投影、不回流**——todo 状态永不作完成判据，否则就是设计正在消灭的「第二真相通道」的翻版。
2. **goals = 每次 run 的人侧句柄**：守夜人以服务 API（`ctx.goals`，程序可调，goal-round-driver 即先例）在发起会话为 run 建 goal：phase 映射 run 终态（active=running，blocked+reason=partial/blocked（blockedReason 的 code/message 恰好机器可读），complete=completed），GUI 免费获得 run 状态徽章 + 轮数预算。注意两个边界：① goal 的 activation 随发起会话关闭而 disarm（与 G6「回执落死会话」同一根因——受控通道解决不了注意力问题）；② 会话关闭后 goal 更新不可达（GOAL_AGENT_NOT_LIVE），需先定「run 句柄的 owner 会话」策略。
3. **plan mode 的提问 UX = 人的裁决边缘**：T6（held→active unlock）与 T7（disposition）本来就是人的边缘，直接复用 `exit_plan_mode` 式的结构化提问（unlock / supersede / defer / cancel 选项），不必自造 UI。
4. **host 会话投影 = 全局面板的替代数据源的一部分**：goal/todos 的 UI 投影是宿主原生能力，mission 无需自定义 client 插件即可获得 run 级可见性；步骤级细节仍归现有 monitor（9300）。

### A4.4 明确拒绝的复用

- 任何把 host goal/todo 当完成判据或状态权威的路径（自完成、无独立审计——R1 §6「Refuse」原样成立，且现在是源码证实而非插件侧推断）。
- 用 plan mode 充当 plan 存储（它没有工件，只是姿态）。

> 增补完。A3 为 human 裁决记录；A1/A2 仍需 human 决策；A4 为源码级事实 + 建议。

## A5. host goals/plan/todos 的契约面裁定（同会话 human 确认方向 + 本记录成文）

方向（human 认可）：**host goals / plan mode / todos 不属于当前插件的显式契约面**——AI 在会话内按需自用；插件不为其做集成、不做单向投影（A4.3 的四个复用方向全部降级为 P3 以后的产品可选项，需真实使用数据再评估）。

但「完全不必考虑」有一处例外 + 一处边缘，各需**一行式约定**（不是集成，是防第二真相通道与驱动打架）：

1. **age:mode preset 加一行权威纪律**（prompt 层，进 `docs/design/dsh-plugin-integration.md` 的 preset 描述即可）：「host goals / plan mode / todos 是会话内的临时刻写与 UI 辅助，不是状态；mission 进度唯一权威 = 账本（roadmap/plan checkbox + frontmatter）；host todo/goal 状态不得作为完成判据、不得回流账本。」
2. **03-supervisor 加一行共存纪律**：「守夜人不与 goal-round-driver 竞争同一 agent 的注入权：mission 子代理不设 goal；发起会话的 goal 由用户自管。」防止未来宿主默认开 goal 自动续轮时与 sustain 抢同一条消息注入通道。

两者都不产生 WI、不改变任何机制；**已随本轮落地**：第 1 行进 `docs/design/dsh-plugin-integration.md`（AGE mode 段），第 2 行进 `docs/design/age-autonomy/03-supervisor.md`（§4）。A4.3 的候选复用（todos 镜像 / goal run 句柄 / plan-mode 提问 UX）明确记为「暂不立项」。

## A6. A1/A2 裁决与落地（human 委托 AI 选择「按你认为最合适的方式」，2026-08-24）

### A1 信任模型 — 已选择：默认护栏 + 免费对抗级 + law 层唯一例外 + 重开触发

- 被执法者默认假设为「诚实但会犯错」；门禁 = 护栏。bash/sed 等非拦截通道的等价写入为**成文接受的漏杀面**（与 plan-status-gate 既有 D 系列裁定一致），由 CI/plan-check 结构匹配 + git blame 归因事后兜底。
- 对抗级保证只保留宿主在 pre-execute 边界零成本可得的三种：写者身份（actor）、audit-id nonce、CAS 乐观锁。
- **执法层自体（P8）是唯一无条件对抗级的面**（见 A2）。
- **重开触发**：出现伪造回执 / 篡改账本现实案例 → 立项受控变更通道（子代理只提交 proposed content、守夜人统一落盘）。理由：不引入大机制、与仓库既有错误处理哲学一致、防护与成本对齐。
- 落地文件：`02-rule-law.md` §2（信任模型段）+ §4.1（回执强度降级声明）；`00-overview.md` P8 原则行。

### A2 执法层自护 — 已实施（最小修复）

| 文件 | 变更 |
| --- | --- |
| `docs/context/ai-autonomy-policy.md` | Protected Areas 新增「AGE 执法层」行（ask-first；注明为加严与裁定来源） |
| `docs/design/age-autonomy/02-rule-law.md` §4.7 | 新增「执法层自护（P8）」段：law 实现 + policy 数据 + 执法 CLI 对 AI 写 deny，人工/CI/已批准立项为合法例外 |
| `docs/design/age-autonomy/00-overview.md` §2 | 原则表新增 P8 执法者自护 |
| `docs/backlog/age-autonomy-implementation-roadmap.md` | WI21 增执法层范围；WI24 真值表用例增 law 域 deny 面 |
| `docs/logs/2026/08-24.md` | 当日日志条目 |

- 明确不列入保护：mission-check CLI（mission 配置是 AI 正常维护面）、plan/roadmap guides（格式权威变更走既有 WI9 等立项流程）、plugin/dsh 其他代码（普通开发面走正常 plan 流程）。

## A7. 模型绑定设计（model binding）——human 提问后裁定方向（2026-08-24）

### 事实基线（源码核实）

| 形态 | 现状 |
| --- | --- |
| 独立 CLI | mission 级 `model`+`variant` 已支持（config.js:714-727 fallback 链 CLI > env > base > 硬默认）；**无 per-step/per-plan** |
| DSH 原生 | `executeAgent(stepName, prompt, system, sessionId, modelOverride, opts)` **插口已存在**（native-executor.ts:117/127/383），`agentModel/agentProvider` 可挂到创建的 child（:222）；但 flow 的 `model/parseModel` 目前**显式忽略**（documented gap，packaging doc §Behavioral differences，未映射 DSH ModelSelectionRef） |
| 宿主 DSH | `agents.create` AgentOptions 原生支持 provider+model（runtime-types.ts:24-26）；subagent/workflow 工具支持 per-dispatch provider/model 覆盖；GUI 有模型选择面 |

### 裁定方向（human 提问后修订：bindings → 具名 agents，2026-08-24）

**命名裁定**：弃用 `bindings`。理由：① 与既有「审计回执绑定」（audit-binding / closure-audit-binding，02 §3）同名异义；② 概念本体不是「模型绑定」而是「具名 agent」——模型只是其中一个面（还含先天提示词/工具面/池化生命周期），两个原生生态本就捆在一起（DSH `agents.create` 的 AgentOptions+preset+ModelSelection；独立形态 opencode agent 文件 = agentFile+model+tools 一条 driverArgs）；③ `model` 字段措辞对齐宿主 `ModelSelection`（provider/model/reasoningEffort，`core/agent/model-selection.ts`），reasoningEffort 即「思考级别」；④ 04 §5 既有的 `sessions:`（角色池 + fixedPrefix 组合）并入 `agents:`——一个词表回答「谁干活」。

1. **契约层零模型零配置**：AGE 派发类型（plan-review/closure-audit/deep-audit/execute/draft-plans）、提示词、trigger 全部只提派发类型，不提 agent 名、模型、工具——双形态可移植性保持。
2. **定义层单源 `agents:` + `dispatch:`**（进 `missions/autonomy.policy.yml`，law 数据、P8 保护——执行者无法自改审计者 charter/模型）：
   ```yaml
   agents:
     drafter:
       mode: pooled                   # pooled | fresh（P7：auditor 必 fresh）
       poolKey: "drafter:{projectRoot}"
       idleTtlMinutes: 30
       rotateEvery: 8
       fixedPrefix: [ … ]             # 04 §5 组合（prompt 块/嵌入文件）
       model: { provider: …, model: …, reasoningEffort: default }
     auditor:
       mode: fresh
       fixedPrefix: [ … ]
       model: { provider: …, model: …, reasoningEffort: high }
       requireDistinctModel: true     # 独立性下限：派发时强制 审计模型 ≠ 执行模型
   dispatch:                         # 派发类型 → 具名 agent
     plan-review: reviewer
     closure-audit: auditor
     deep-audit: auditor
     execute: executor
     draft-plans: drafter
   ```
   - 独立形态：`agents` → config.js 既有 model/variant/agentFile 通道；DSH 形态：`agents` → 宿主 preset 组合（`missions/base.json` `agent`）+ `agents.create` 的 agentProvider/agentModel/reasoningEffort（补 native-executor 的 ModelSelection documented gap）。
3. **plan 级覆盖 = agent 名引用，不是裸配置**：plan frontmatter 可声明 `agent: "audit-heavy"`（仅可引用 policy 有界名单；守夜人路由时解析）。回答「每个 plan 指定 model 和 variant」——灵活性保留，完整性不丢。
4. **独立性下限（G4 机制化）**：audit agent 的 `requireDistinctModel` 派发时强制（审计绑定模型 ≠ 执行绑定模型）；单模型部署无法满足 → 拒绝新派发或显式观察标记（不静默）。dispatch/accepted 行附 **model lineage**（`models={exec:<agent>,aud:<agent>}`）——驳回率按 (执行, 审计) agent/模型对可度量。
5. **明确否决**：AI 自由选裸模型/裸配置（成本游戏 + 自审合谋）；允许的只是「从 policy 有界 agent 名单里选」。
6. **预定义 agent（human 方案 c）的定位**：DSH 形态下角色 preset 是 `agents:` 的自然实现（宿主 preset roster 挂载组合面 + ModelSelection 挂模型面）；**不是唯一表示**——policy 仍是两形态单一来源（独立形态无 preset；CI 需要同映射做结构校验：agent 名存在、audit 角色默认完整）。
7. **per-step agent**：不推荐（粒度过度）；派发类型级映射覆盖 99% 价值（执行 vs 审计分离），plan 级 agent 引用覆盖剩余 1%。

## A8. 产品定位裁决：长时间自主运行 + 部分查看能力（human 裁定，2026-08-24）

**human 定位**：mission-driver = 长时间 AI 自主运行；中间过程只提供**部分查看能力**（pull 式），不要求实时交互、不做逐 token/逐里程碑的实时通知；monitor 与 DSH 的集成为后续改造项。

据此对 N1–N5 与 G6 的处置：

| 项 | 处置 | 理由 |
| --- | --- | --- |
| N1 里程碑通知三件套 | **不做**（watermark/quiet-wakeup/fact 推送属 push 面） | 与定位相斥；中间过程 = pull 式查看（monitor 9300 + `mdcontrol.status`，05 §2.1 既有），终态仍走回执 |
| G6 人侧异常通道 | 中间态静默**成文为有意**；终态（partial/blocked/held）不依赖 push——随时可从账本/monitor/status 读到 | 自主运行定位下「回执落进死会话」的可接受替代 = 终态可查，不静默丢失 |
| monitor × DSH 集成 | **后续改造项**，沿用 `docs/design/dsh-plugin-integration.md` §「Monitor coexistence」的 WI15 reopen 触发条件（有需求/有稳定 client 插件 API 才重开） | 本仓库的 Vue monitor（9300）零改动继续使用 |
| N5 阶段间人工 gate | **明确不做**（与自主定位相斥） | 人工边缘只在收尾回执点（05 §2.4：held 解锁/熔断/预算耗尽）；flow 内插人 = 反自主 |
| N2 平台期停止信号 | 不受影响，仍随 M3 落地（trigger DSL findings 平台期判据） | 是停止判据不是通知 |
| N3 错误码词汇表 | 不受影响，仍随 M2/M3 落地（01 §6 归因从自由文本变枚举） | 是归因数据不是交互 |
| N4 journal/reconcile 纪律 | 不受影响，仍随 P2 落地（02 §4.5 三选一 + 启动对账） | 是持久化纪律不是交互 |

### 对 G4 的意义

本裁定把「同源同模型」天花板从不可解变为**可测量 + 可强制**：distinct-model 强制 + model-lineage 回执 + 驳回率按 lineage 统计。独立形态与 CI 同样记录 lineage（结构字段），不依赖宿主。