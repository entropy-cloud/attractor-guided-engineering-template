# dsh-spec-loop 调研报告（dsh-plugin-survey）

> | 项 | 值 |
> |---|---|
> | 本地路径 | `~/ai/dsh-plugins/dsh-spec-loop/` |
> | 来源 repo | `https://github.com/tianji-qingtian/dsh-spec-loop`（本地 `.git` remote 已核对，HEAD `9b86b90`） |
> | 版本 / Stars | v0.1.2（package.json:3）；stars 未联网核实（README badge 之外无本地数据） |
> | 语言 / license | JavaScript ESM（host 半经 tsdown 出 `lib/index.js` + client 半 `lib/client.js`，产物入库）；MIT（LICENSE + package.json:36） |
> | 宿主 API 面 | host `inject: ['commands','llm','fs','shell','sessionProjections']`（src/index.js:32）+ 可选 `ctx.get('userQuestions')`（:749）+ `invocation.agent.steer`（:802）；client `slots.inject('conversation.input.dock')` + `locale` + slot props `useProjection`（src/client/index.js:16,106-107,164-167） |
> | 调研方式 | 只读本插件目录源码 + 写本报告；`test-compose.mjs`/`test-real-fs.mjs`/CI yml/lib 产物未逐行读 |

## 1. 定位

Spec-driven development 闭环插件：`/spec` 命令族驱动 **propose → approve → implement → verify → archive** 五阶段，变更目录兼容 OpenSpec 布局（`<workspace>/openspec/changes/<id>/{proposal.md,tasks.md,design.md,specs/}`），归档后 delta 合并进能力规格 `openspec/specs/<cap>/spec.md`。核心架构决策（REQUIREMENTS.md:17）：**命令只做流程编排 + 文件系统操作；提案/实现内容生成全部 `agent.steer` 给 agent 主模型**；验收用插件侧有界 judge 调用（flash 默认，`--deep` 主模型）。典型用户流（REQUIREMENTS.md:19-28）：`/spec new X` 澄清 → agent 生成提案+自动校验 → 人审 `/spec approve` → `/spec implement` 逐项勾选 → `/spec verify` 逐 Scenario 验收出 `verify.md` → `/spec archive` 合并归档。对本项目而言，它是「requirements→design→plan 链路如何在宿主内做成多阶段人审门控」的最贴近参照物——但注意：它的门控**不是**用 workflow 引擎做的（见 §3 对照点 1 的前提纠正）。

## 2. 架构与机制（源码级）

### 2.1 命令族路由与双半结构

单一 `/spec` 命令内做子命令路由（`parseSpecArgs` src/index.js:59-64；`registerCommand` :664-711），11 个子命令各自 handler（:684-694）。handler 返回 `{kind:'success'|'error', text}` 即时回显；重活交给 steer。client 半只有一个 dock 卡片组件（`SpecDock`，src/client/index.js:105-162）。

### 2.2 状态机 = 会话投影折叠标准事件（本项目最值得研究的机制）

状态 `proposed→approved→implemented→verified→archived` 由 `specLoop` 投影折叠（`projectionSchema` :245-253；`applySpecEvent` :302-341）：

- `command/run` 只把 `{sub,arg}` 挂进 `pending` 表（按 commandId 键，容量 16 截断 :259-265，:303-312）；
- `command/done` 且 `kind==='success'` 才转移状态（:320-322）——失败的 handler 永远推不动状态机；
- agent 回复里的机器标记补完异步阶段：proposing 中匹配 `SPEC_CHANGE_ID: <id>` 转 proposed（:330-334），implementing 中匹配 `SPEC_IMPLEMENTED` 转 implemented（:336-338）。

不注册自定义事件类型的原因：外置插件写入未知非 ignorable 类型会被持久化读路径拒绝（README.md:79；REQUIREMENTS.md:134 开发期决策 1）。批准门禁与面板读**同一个投影**（`cmdImplement` 读 `snapshot.values.specLoop` 判 `IMPLEMENTABLE` :934-946；client `useProjection('specLoop')` client/index.js:106），显示态与行为态不会分叉。

### 2.3 提案生成与有界自动修正

`cmdNew` 先走 ≤3 个内置澄清选择题（scope/constraints/acceptance，:749-800），UI provider 缺失或子代理场景降级为跳过（:795-799）；然后 steer 提案模板（`newProposalPrompt` :462-485，末尾要求原样输出 `SPEC_CHANGE_ID:` 行 :482-484）。投影监听到标记后自动跑 `validateChange`（OpenSpec 文本级校验：proposal 非空、tasks 有 checklist、delta 每条 Requirement 至少一个 Scenario，:425-456），失败则 steer `fixPrompt` 回 agent（`apply(ctx)` 内 listener :1194-1232），按 `session:id` 计数 **≥3 次封顶**（:1209）防死循环。

### 2.4 逐条验收（与 CLOSURE_AUDIT 对照的核心）

`cmdVerify`（:962-1091）：① proposal.md 里声明的 ```` ```bash ```` 块**先经 `ctx.shell` 执行**并把退出码+尾部 15 行输出带进判定材料（`extractBashBlocks` :526-535，执行 :982-1002）；② 收集工作区文件做判定语料（`collectWorkspaceFiles` :576-617，300 文件/100KB 单文件/240KB 总量三重预算）；③ flash 模型关 thinking 跑 judge（`judgeCall` `reasoningEffort:'off'` :634-658；`--deep` 保留主模型 reasoning :1004-1017）；④ 判定格式钉死为每 Scenario 一行 `OK|FAIL <requirement>: <scenario> — <reason>`（`verifyPrompt` :537-556；`parseVerdicts` :558-574）；⑤ 产出 `verify.md` ✅/❌ 表 + **raw judge 输出原文**（:1060-1081；判不出 verdicts 时也如实写 raw 并报错 ：1036-1052，不留谎话空间）。

### 2.5 归档合并与进度镜像

archive 按 Requirement 名合并 delta（ADDED 追加 / MODIFIED 同名替换、不存在则追加 / REMOVED 删除，`mergeDelta` :162-190）再 `mv` 进 `changes/archive/YYYY-MM-DD-<id>/`（cmdArchive :1093-1135）——因 `ctx.fs` 无 move/delete 只能借 `ctx.shell`（REQUIREMENTS.md:135 开发期决策 2）。任务进度 x/y 不建私有 RPC：implement 提示词要求 agent 把 tasks.md 逐项镜像进标准 `todo_write` 工具并随做随更（implementPrompt :493），client 读内置 `todos` 投影算 done/total（client/index.js:144-146）——「进度走宿主既有投影，零 RPC」。

### 2.6 澄清问题的降级矩阵

`cmdNew` 的澄清走 `ctx.get('userQuestions')` 软依赖（不在 inject 里）：三个内置选择题——变更类型（新增/修改/重构）、关键约束（多选：接口兼容/性能敏感/保留行为）、验收方式（手动/可运行测试/两者），语言随 goal 自动判定（`hasZh` :54-56）。答案折叠成 `- 范围: …/- 约束: …/- 验收: …` 文本拼进提案提示词（:785-794）。三类异常（DELEGATED_CALLER / CALLER_NOT_LIVE / 无 UI provider）统一捕获后**跳过澄清继续流程**（:795-799 注释）——门控不因可选交互缺失而卡死，「可选服务软依赖 + 显式降级」的干净样本。

### 2.7 只读状态卡与 i18n

`cmdStatus` 明确「不改任何状态」：从投影读 change-id/阶段，从 todos 投影读 x/y，按阶段派生下一步命令（:882-906；`NEXT_COMMAND` 表 ：869-875）。中英文案两条通道：命令侧内联三元 `t(zh,en)`（语言由输入+标题的中文检测决定 ：679-680），client 侧经宿主 `locale` 服务注册 zh/en 字典并订阅切换重渲染（client/index.js:96-113）。

### 2.8 测试分层（三层递进）

`package.json test` = ① `test-host.mjs` 纯函数与投影行为断言（mock runtime：delta 校验、merge、状态机转移）；② `test-real-fs.mjs` 真实文件系统冒烟（真写真列目录；正是它暴露了 `resolve('')` 抛 FS_NOT_FOUND，REQUIREMENTS.md:136 开发期决策 3）；③ `test-compose.mjs` 真 cordis 组合集成（真实 fs/commands/session-projection/llm 服务）。mock 测不出的问题由真实组合层兜住，教训显式写进需求文档。

## 3. 对本项目的可用模式（Adopt/Adapt/Reject + 逐点对照）

- **对照点 1「如何实现多阶段门控」——前提纠正 + Adopt 原则**：它没有用官方 workflow 引擎；门控 = 命令 handler 里的守卫读会话投影。真正可 Adopt 的是**「行为态与显示态同源」**：gate 判定和 UI 渲染读同一份折叠态（:934-946 vs client/index.js:106）。我们 mission-driver 的 step 状态已由 run-state 文件统一承载，方向一致；可借鉴的是把「gate 拒绝时的下一步命令提示」做成状态派生表（`NEXT_COMMAND` :869-875）而非散落文案。
- **对照点 2「批准态存哪」——Reject 其位置，确认我们的做法**：批准态存在**会话投影**（per-session，重启存活但跨会话不共享，README.md:81），规格工件本体在文件系统。我们的 REVIEW_PLANS 批准态落在 roadmap/plan 文件（repo 即真相），天然跨会话、可审计——优于它。可 Adapt 的是「工件与状态分离」：它把可变内容放 `openspec/` 目录、易变态放投影；我们把计划内容放 `docs/plans/`、执行态放 run-state，同构。
- **对照点 3「逐条验收 vs CLOSURE_AUDIT」——Adopt 三件、Reject 一件**：① Adopt「声明式验证命令先于 judge 执行」：可执行证据放在 LLM 判定之前并注入材料（:982-1021），与我们 BUILD_VERIFY 先跑脚本门再进 CLOSURE_AUDIT 的次序同构且互证；② Adopt「机器可解析的单行判定格式 + raw 输出留痕进报告」：CLOSURE_AUDIT 的裁定证据目前是自由文本，可规定逐条 `PASS|FAIL <criterion> — reason` 行格式便于 grep 复核；③ Adopt「edit 任意阶段回退 proposed 且需重新 approve」（:1159-1173 + transition :276-282）：与我们 plan reopen 后必须重新走 REVIEW_PLANS 的语义严格一致，可作为 reopen 语义的现成参照；④ Reject 其 judge 形态：flash 单模型一次调用、无对抗复核、无独立会话，误判风险显著高于我们 fresh-session subagent 冷回放的 CLOSURE_AUDIT（对照 inspect 的红队做法，见姊妹报告）。
- **其它 Adopt**：机器标记作为异步完成的握手协议（steer 后命令即刻返回、投影等标记收尾）——与我们引擎的 marker 解析同型；有界自动修正次数封顶（:1209）——对应 AGENTS.md 操作规则 15 的「循环必须有界」。
- **方法论侧观察（dogfooding 先例）**：REQUIREMENTS.md:3 自述「新功能按 spec-loop 自身流程走 openspec/changes/ 提案」，`/spec status` 命令本身就是其流程产出的第一个变更（v0.1.1，REQUIREMENTS.md:147）——与我们「仓库用自家 AGE 流程开发 mission-driver」的 dogfooding 姿态同构，可互为佐证；其 REQUIREMENTS.md 的「开发期决策（偏离草案处）」小节（:132-140）是我们 plan Execution Addendum 的同类物，格式可对照。
- **对照点 4「提案→任务→验收三件套 vs 我们的 requirements→design→plan」——Adapt 粒度**：它的 change 目录把 Why/What（proposal.md）、执行清单（tasks.md checklist）、规格增量（specs delta，含 Scenario）钉成三个固定文件并各有机器校验。我们的对应链路是 requirements/design/plan 三类 owner doc + plan 的 closure criteria；差异在它给每份工件配了**可程序校验的形状**（checklist 可数、Scenario 必在、id 格式），而我们的 plan 校验靠 plan-status gate 与审计提示词。可 Adapt 的是「closure criteria 写成可数清单」这一步：`docs/plans/` 模板里的 closure gates 已接近 `- [ ]` 形态，与 tasks.md 的 `countTasks` 同型，天然可被脚本门 grep。

## 4. 风险与不适用面

- **per-session 批准态**：换会话即失忆（README.md:81），不适合跨 session 的工程治理场景——恰是我们必须避开的。
- **steer 异步无完成保证**：标记全凭 agent 自觉输出；agent 忘写 `SPEC_CHANGE_ID` 则状态永远卡 proposing，无超时仲裁。
- **judge 语料截断偏差**：工作区收集有三重预算上限（:581-583），大仓库下 judge 可能根本没看到相关文件就判 FAIL/PASS，且报告不标注覆盖率。
- **校验是文本级的**：Scenario 存在性 ≠ 可测性；`tasks.md` 勾选由 agent 自报，verify 不交叉核验勾选真实性。
- **approve 与 verify 的状态脱钩**：`cmdVerify` 不检查变更是否已 implemented（:962-971 只查目录存在），理论上可对 proposed 变更跑验收——阶段门只守在 implement 一处，与我们「每步都有前置状态检查」的 flow when 条件相比更松。
- **宿主耦合深**：`command/run`/`command/done` 事件形状、`todo_write`、dock CSS 变量都是 rc 期未文档化契约（REQUIREMENTS.md:138-139），随 harness 迭代脆断。

## 5. 关键源码索引

| 主题 | 位置 |
|---|---|
| 子命令路由 | `src/index.js:664-711`（registerCommand）、`:59-64`（parseSpecArgs） |
| 状态机投影 | `src/index.js:245-253`（schema）、`:302-341`（applySpecEvent）、`:46-48`（STATUSES/IMPLEMENTABLE） |
| 实现门禁 | `src/index.js:934-946`（cmdImplement 读投影拒未批准）；approve 校验门 `:908-926` |
| 自动校验+有界修正 | `src/index.js:1194-1232`（listener，`:1209` 三次封顶）；`:510-520`（fixPrompt） |
| 逐条验收 | `src/index.js:962-1091`（cmdVerify）；`:526-535` bash 提取、`:537-556` 判定提示词、`:558-574` 解析、`:634-658` judgeCall |
| 归档合并 | `src/index.js:162-190`（mergeDelta）、`:1093-1135`（cmdArchive，`:1117` shell mv） |
| 澄清降级 | `src/index.js:749-800`（userQuestions 软依赖，`:795-799` 三类异常跳过） |
| 进度镜像 | `src/index.js:487-498`（implementPrompt→todo_write）；`src/client/index.js:106-107,144-146` |
| 状态卡/下一步派生 | `src/index.js:869-906`（NEXT_COMMAND + cmdStatus） |
| dock 卡片 | `src/client/index.js:164-167`（conversation.input.dock 注册） |
| 测试分层 | `package.json:27`（三套件串联）；`test-host.mjs:14-27`（断言形状示例） |
| 设计决策记录 | `REQUIREMENTS.md:132-140`（开发期决策 1-7）、`README.md:77-81`（兼容性注记） |

> 未读部分声明：`lib/` 构建产物、`pnpm-lock.yaml`、`.github/workflows/*.yml`、`test-compose.mjs`/`test-real-fs.mjs` 正文未逐行阅读；引用行号均来自 `src/`、README 与 REQUIREMENTS。
