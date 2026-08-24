# dsh-inspect 调研报告（dsh-plugin-survey）

> | 项 | 值 |
> |---|---|
> | 本地路径 | `~/ai/dsh-plugins/dsh-inspect/` |
> | 来源 repo | `https://github.com/omdsh-dev/dsh-inspect`（本地 `.git` remote 已核对，HEAD `a99192e`，含外部 PR #5 合并） |
> | 版本 / Stars | v0.1.0，`private: true`（package.json:5-6，未发布 npm，走 git 安装）；stars 未联网核实 |
> | 语言 / license | TypeScript（erasable-only 语法，Node ≥22.19 原生类型剥离/tsx hook 加载，无独立构建链）；MIT |
> | 宿主 API 面 | host 静态注入仅 `inject: ['tools']`（src/index.ts:49）；运行时 `ctx.get('workflows')` 取官方 workflow 引擎（:586-596）；`defineTool`（@deepseek-ai/dsh-tools）、schemastery Config 校验、`WorkflowMeta` phases、`exec.agent/exec.signal` |
> | 调研方式 | 只读本插件目录源码 + 写本报告；回归测试 1109 行只读了头部与用例名清单；`lib/types/index.js` 编译产物、tsconfig 对 sibling deepseek-harness 的引用未核验 |

## 1. 定位

把 harness-fault-hunting / agent-deliver / agent-review 三个技能合并成的**对抗式闭环工具集**：`checkup`（发现问题）→ `fix`（修复交付）→ `review`(质量复查)，三工具可单用可串联，闭环 = checkup 清单喂 fix、fix 产物交 review 把关、复查不过或人的反馈重进 fix（src/index.ts:2-13）。设计哲学两条：「简单优先——直白的检查/问题/修复语言」与「技能的价值在于激活正确的行为」（:15-16）；理论内核是控制论反馈：发现是怀疑、验证是定罪、问题=数据流状态偏离预期、修复必须重跑复现证伪（README.md:15-28）。对本项目而言，它是与我们 DEEP_AUDIT→DRAFT_PLANS→EXECUTE 外环**同构度最高**的样本。

## 2. 架构与机制（源码级）

### 2.1 运行时依赖守卫：不做静态 inject

workflow 引擎是硬依赖却刻意不进静态 `inject`：cordis 对静态注入做硬门禁，组合里没有 workflows provider 时条目永久停在 `pending (waiting for service: workflows)`，挂起整棵插件树直到宿主退出（:38-48 注释，来自真实事故）。改为 apply 照常注册工具，调用时 `requireWorkflows` 经 `ctx.get('workflows')` 检查并抛带指引的错误（:586-596），apply 期也不检查以防整组 loader 条目被拖垮（:624-626）。「缺依赖 = 可启动 + 调用时清晰报错」是我们 plugin/dsh bundle 值得照抄的加载纪律。

### 2.2 编排形态：workflow 脚本是内嵌字符串

三条流水线各是一段 `String.raw` JS 脚本常量（CHECKUP_SCRIPT :164-319、FIX_SCRIPT :323-484、REVIEW_SCRIPT :488-570），经 `ctx.workflows.start({script, meta, args, parent, signal})` 提交官方引擎执行（:824）；脚本内可用 `phase()/agent()/parallel()/log()` 全局钩子。引擎按**精确标题**匹配 `phase()` 与 `meta.phases` 声明，所以 fix 的三轮循环把「实现·第1/2/3轮」「检查·第1/2/3轮」逐个具名声明（:737-745 注释）。角色级模型分层（planner/worker/checker/reviewer/merger/redteam 六键）从 Config 注入脚本 args（MODEL_KEYS :90-97、modelsFrom :599-606）。三个工具的输入输出合同：

| 工具 | 必填参数 | 可选参数 | 结构化返回 |
|---|---|---|---|
| checkup | `target` | `angles`(逗号分隔角度)、`context` | `{ok, report, issues[]}` |
| fix | `task` | `issues`(checkup 清单 JSON 文本直通)、`acceptance` | `{ok, report, rounds}` |
| review | `target` | `dimensions`、`context`、`fixed_issues`(逐条重验清单) | `{ok, report, issues[], passed}` |

工具描述即触发面：插件不注册 skill，「找茬/审计/体检/交付/复查」等触发词写在 description 里由主模型自主路由（README.md:144；description 全文 ：644-648,697-703,759-763）。

### 2.3 checkup：并行怀疑 → 红队定罪 → 汇总

① N 个角度检查员并行（默认 实现质量/边界与错误处理/安全与资源），共享 `ADVERSARIAL` 提示词：默认怀疑、不轻信注释与 README、只认当场可验证证据、宁可漏报不虚报、每条问题必须附可互相校验的验证方式（:169-175）；② **红队环节**取非「建议」级 top5 逐条攻击，推不翻才保留（:199-229）；③ 汇总员合并去重（:265-276）。红队防护是精华（:231-264 注释逐条写明）：survived/refuted 是选择性结论列表——top 项两边都未提及视为未审查全量回流；红队返回空数组或 null 视为未审查；survived 新增条目必须命中检查员实际发现集合（`flatIssues` :258-259）否则当幻觉剔除。任何一环失败都不静默归零：checker 失败计数如实标注（:196）、merger 失败则候选全量保留未去重（:278-281）。

### 2.4 fix：根因三步 + 有界收敛循环

拆解两路：checkup 的 issues 直接映射为步骤（:332-341），或 planner 拆 3-6 步带 acceptance（:343-358）。主循环 `while(pending && round<MAX_ROUNDS=3)`（:370）：每个 worker 按「找根因（沿数据流找偏离源头，不清楚先最小复现）→ 实施（数据判断直接定方案，改动最小）→ 验证（重跑原复现，失败明确报告不假装成功）」三步做（:373-398）；随后对抗式 checker 重点查三件事——是否表面修复、问题是否真消失、是否引入新问题（:400-422）。**假收敛双守卫**：worker 任一输出为 null 或 checker 为 null/结构无效 → 本轮标「未验证」，绝不进入通过分支（:423-432 注释）；被查出的全部问题进入下一轮，绝不 slice 丢弃（:449-457）；轮次耗尽如实列剩余问题明细并建议重新喂给 fix（:477-482）。跨轮上下文用 `roundExcerpt`（每轮摘录限长 1200、总量封顶 3600）附带给下轮 worker/checker（:436-438）。

### 2.5 review 与 passed 三态

reviewer 并行复查同一套 ADVERSARIAL 词根（:493-499）；`fixed_issues` 参数让审查员**逐条重跑复现确认修复真消失，没消失报严重**（:506）；`passed` 是诚实三态的布尔收口：有严重/一般、或 merger 失败、或有 reviewer 未返回，任一成立即 false（:564-569 注释「不得伪装成没问题」）。`runWorkflow` 桥接父步 abort 到 run.cancel、非 `completed` stopReason 抛错、透传 issues/rounds/passed 字段、finally 必 dispose（:814-859）。参数解析 fail-loud：issues/fixed_issues 非数组或条目缺 level/issue 直接抛错绝不静默降级（parseIssueList :872-903）。

### 2.7 配置校验的双层纪律

Config 用 schemastery schema 在 loader 装载期校验（:75-87，官方 annotation 模式），值存在但类型非法 → 加载期 fail loud；键缺省 → 静默通过，由 apply 里的 `optionalString/positiveInt` 兜底再校验（:629-636, :905-920），防止绕过 loader 的编程式调用拿到脏配置。`maxTotalAgents` 未设置时保持「缺键 = 引擎默认」而非填 fallback 值（:633-635 注释保留旧 JS 契约）。`subagentProvider` 与六个角色级模型键全部透传进 workflow args（:637-640, :685-691）。

### 2.8 回归测试策略（对我们审计方法论有直接参考价值）

测试不 mock 插件而是**求值真实脚本**：读 src/index.ts → `stripTypeScriptTypes` 剥类型 → 与引擎相同的 `vm.Script '(async()=>{body})()'` 包装 + mock 全局钩子（agent 按 label 出队列）→ 断言行为（test/regression.test.mjs:42-68）。前两轮 10 类修复固化为可重跑断言：红队五态、四类子代理 null 如实标注、passed 三态、fix 假收敛防护、问题全量重修、字段透传、参数校验、schema 编译（README.md:70-75）。

## 3. 对本项目的可用模式（Adopt/Adapt/Reject + 逐点对照）

- **对照点 1「与 DEEP_AUDIT→DRAFT_PLANS→EXECUTE 循环的同构性」**：同构映射成立——checkup≈DEEP_AUDIT（多角度发现问题）、fix≈DRAFT_PLANS+EXECUTE（问题→任务→并行实现→自检）、review≈CLOSURE_AUDIT（交付后把关）；其外环「review 不过或人的反馈重新进 fix」（README.md:27-28）对应我们「audit 发现→补 plan→再执行」。**本质差异**：它是进程内一次性工具调用，问题清单活在 tool result 里，run 结束即蒸发；我们是文件进出（audit 结论落 docs/plans/docs/bugs、roadmap 状态落盘），跨 session 可恢复可审计。Adopt 结论：借它的**机制词表**（角度化检查、证据强制、红队、轮次封顶），不借它的**无持久化形态**。
- **对照点 2「复查独立性如何保证」**（任务点名）：五层机制——①上下文隔离：每个 reviewer/checker 是 workflow 引擎 spawn 的全新子代理，不带实现者对话史，只拿 artifact 文本与 fixed_issues 清单（:400-422、:502-517）；②提示词对抗化：ADVERSARIAL 词根钉死「默认怀疑/只认当场证据/漏报优于虚报」（:169-175、:493-499）；③证据强制：每条问题必附 evidence+验证方式；④二阶证伪：红队攻击最强声明，幸存才入清单（:199-229）；⑤失败诚实化：任何代理 null 都让 passed=false 或如实标注，「审计器坏了」永远不会被误读成「通过」（:423-432、:537-545、:564-569）。**局限要认清**：默认所有角色同源同模型（分层配置只是可选，README.md:139），独立性弱于我们 fresh-session subagent 冷回放 CLOSURE_AUDIT；它防的是「实现者自查自夸」，不防「同模型系统性盲区」。
- **Adopt 清单**：① 假收敛守卫三元组（checker null / worker null / merger null ⇒ 未验证而非通过）——应写进我们 closure-audit 审计提示词/skill 的检查项（AGENTS.md 规则 15 的 promotion 路径：先 prompt/checklist，复发再考虑脚本门）；② 「全部问题回流、绝不 slice 丢弃 + 轮次上限兜底」——对应我们 audit 发现必须逐条立案不得静默消失；③ 红队幸存者须命中原始发现集合的幻觉剔除（:258-263）——DEEP_AUDIT 若引入复核环节可直接借用；④ vm 求值真实脚本的回归测试法——对我们 flow JSON/prompt 模板的结构性校验（prompt-check.mjs）是升级参照。
- **落点建议（具体到我们的文件面）**：假收敛三守卫与「失败不伪装」条款适合并入 `docs/skills/multi-dimensional-audit-prompt.md` 的判定规则节（每条审计发现须带 evidence + 验证方式，直接对应 ADVERSARIAL 的硬要求）；「未收敛时如实列剩余问题明细并显式建议重进循环」（:477-482）与我们 plan §Deferred/watch-only 的写法对齐——audit 报告不允许以「大体通过」吞掉残余项。
- **Adapt**：angles/dimensions 参数化（默认三维、逗号分隔、引擎总数兜底 :651）↔ 我们 multi-dimensional-audit-prompt 的维度选择可以做成同样可传参的形状；fix 的 roundExcerpt 跨轮限长上下文 ↔ 我们 plan Execution Addendum 的跨 phase 记录（限长防膨胀的做法值得抄）。
- **Reject**：中文枚举 `严重/一般/建议` 焊死在 schema enum 里（:111、:132）——我们的分级语义已在 owner docs 定义，不应引入第二套词汇表；内嵌字符串脚本绕开类型检查，靠 vm 测试兜底的形态不适合我们（引擎侧已有 flow JSON + 表达式校验层）。

## 4. 风险与不适用面

- **无持久化**：issues/report/rounds 只在 tool result 中，跨 run 无状态衔接——与我们 file-in/file-out 协作模式正面冲突，只能取机制不能取形态。
- **入口声明矛盾**：README.md:51 称「包入口直指 src/index.ts 无构建步骤」，但本地 package.json main 指 `./lib/types/index.js` 编译产物（package.json:7），README.md:164 又称该产物为「官方 0810 生产入口」——两种加载形态并存且文档未对齐，照抄安装方式前需实测。
- **同源模型盲区**：对抗性靠提示词而非异源模型/独立上下文持久保证；角色分层配置无人值守时形同虚设。
- **成本无核算**：checkup 一次 = N 检查员 + 红队 + 汇总，fix 一轮 = M worker + 1 checker，MAX_TOTAL_AGENTS 兜底但无预算上报——我们 DEEP_AUDIT 的 maxAuditRounds 额度制比它更克制，不必倒退。
- **rc 期契约**：`WorkflowMeta` phases 精确标题匹配、`exec.agent` 形状均未文档化，随 harness 升级脆断风险高。
- **对抗提示词的误报面**：「默认怀疑一切」与「宁可漏报」并存是自平衡设计，但红队只攻 top5（:204），第 6 位起的严重/一般声明无二阶证伪——若借入 DEEP_AUDIT 需决定覆盖率与成本的折中。
- **fix 的并行实现无合并协调**：多 worker 并行改同一工作区，脚本层不做冲突检测，靠 checker 事后查「是否引入新问题」兜底（:400-422）——问题清单彼此独立时成立，同文件竞争时不可靠；我们 EXEC_PLANS 按 plan 串行派发反而更稳。
- **报告即交付物**：worker/checker 输出被截断进报告（artifact 每步 1200 字符 :463），完整推理链留在 workflow 事件流里，插件不落盘——审计可回放性依赖宿主的 workflow 日志而非自身工件。
- **与姊妹报告的交叉**：spec-loop 的 verify 是「单 judge 一次判定」（见 `dsh-spec-loop.md` §3 对照点 3 对其 Reject 的理由），inspect 的 checkup/review 恰好补上了它缺的对抗复核层——两者组合阅读才能拼出「逐条验收 + 独立复查」的完整形态。

## 5. 关键源码索引

| 主题 | 位置 |
|---|---|
| 加载纪律（不做静态 inject） | `src/index.ts:38-48`（事故注释）、`:586-596`（requireWorkflows）、`:624-626` |
| 工具注册与合同 | checkup `src/index.ts:642-693`；fix `:695-755`；review `:757-809`（description 即触发面 ：644-648,697-703,759-763） |
| phase 精确标题匹配 | `src/index.ts:737-745`（meta.phases 具名声明注释） |
| ADVERSARIAL 提示词 | checkup `src/index.ts:169-175`；review `:493-499` |
| 红队五态防护 | `src/index.ts:199-229`（攻击）、`:231-264`（回流/幻觉剔除，`:258-259` flatIssues） |
| fix 假收敛守卫 | `src/index.ts:423-432`（verified 判定）、`:436-438`（roundExcerpt 限长）、`:449-457`（问题全量回流）、`:477-482`（未收敛明细） |
| passed 三态 | `src/index.ts:564-569` |
| runWorkflow 桥接 | `src/index.ts:814-859`（abort 桥 `:831-832`、stopReason 检查 `:836-838`、dispose `:854-858`） |
| fail-loud 参数解析 | `src/index.ts:872-903`（parseIssueList）；配置双层校验 `:75-87,629-640,905-920` |
| 角色级模型分层 | `src/index.ts:52-64`（Config 接口）、`:90-97`（MODEL_KEYS）、`:599-606`（modelsFrom） |
| 回归测试法 | `test/regression.test.mjs:42-68`（vm 求值真实脚本）、用例清单 `:174-437`；README.md:70-75（10 类断言） |

> 未读部分声明：`lib/types/index.js` 编译产物（859 行）只读了头部 30 行、`tsconfig.json` 的 sibling deepseek-harness project references、`pnpm-lock.yaml` 未核验；回归测试只读了头部与用例名清单，断言体未逐行阅读。
