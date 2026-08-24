# dsh-goal-scaffold 调研报告（dsh-plugin-survey）

> | 项 | 值 |
> | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-goal-scaffold/` |
> | 来源 repo | `github.com/zriyox/dsh-goal-scaffold`（单 commit `5e1a1ae`，push 2026-08-15） |
> | stars / 语言 / license | 1 star（GitHub API，2026-08-24 查）/ TypeScript / MIT |
> | 宿主 API 面 | 三插件中最轻：peer 仅 `@deepseek-ai/cordis@^4.0.1`；用 `ctx.on('agent/pre-step')` 瀑布 + `ctx.get('userQuestions')` 问询服务；dsh-agent/dsh-session/dsh-llm/dsh-user-questions 均为 type-only 导入 |
> | 与 R1 报告的关系 | R1 Pattern C 的源码级深化复核：198 行整、workspace-root plan.md、capped goal——全部核实；补充检测启发式阈值、pre-step 改写语义与 provenance 标记 |

## 1. 定位

"长任务守门员"：拦截一句话大需求（如"从零搭个管理系统"）直通执行造成的 goal-drift，在 pre-step 边界问一次用户"要不要先规划？"。选"先规划"则原始消息原样放行，同时追加一条插件来源的指令，引导模型先写 workspace-root `plan.md`（每项带最小可验证验收标准的清单）再建一个带轮数上限的 goal 逐项执行。配套作者自家的 dsh-verify-judge 管"说完成了要真验"。它是纯 nudge：不写任何文件、不强制任何行为。

## 2. 架构与机制（全源码级）

单文件 `src/index.ts` 198 行；`lib/` 为 tsc 产物未逐行比对（152 行 js + 33 行 d.ts，与 src 对应）。无测试目录。

### 2.1 配置与检测启发式

配置（resolveConfig :72-91）：enabled 默认 true；minLength 默认 80（正整数）；extraSignals 非空字符串数组。配错在加载时抛 TypeError——fail-loud。检测判定（:101-119）三段式：

1. **isHuman 过滤**：仅 `message.source?.kind === 'user'` 参与判定——goal 续跑递话、插件注入、工具产物天然排除；
2. 拼接全部真人文本后长度 ≥ minLength 才继续；
3. 命中任一信号词即拦（内置中英 15 词，大小写不敏感子串），或长度 ≥ 3×minLength（≥240 字符）单独触发：

```text
全部 / 所有 / 整个 / 重构 / 批量 / 完整 / 从零 / 搭建 / 管理系统
everything / entire / whole / refactor / rewrite / all the / from scratch
```

### 2.2 会话预算与降级路径

`sessions Map<agentId, 'asked'|'never-again'>` 在问询前先置位（:155）——无论答案如何每会话最多问一次。降级面齐全：userQuestions 服务缺失（headless）静默直通；三选项问询（id `goal-scaffold-plan-first`）为 Plan first (Recommended) / Just start / Don't ask again this session；捕获 `UserQuestionError`（用户关掉问题去打字）视为 null 原样放行——取消即放行的 fail-open 姿态。

### 2.3 关键改写语义与 provenance 标记

选 Plan first 时（:186-196）**先 `await next()`** 让下游监听者看到原始消息，且 decision.kind 必须是 'enter' 才追加；追加的是 frozen structuredClone 的 UserMessage：

```text
{ id: crypto.randomUUID(), role: 'user',
  content: [{ type: 'text', text: PLAN_FIRST_INSTRUCTION }],
  source: { kind: 'plugin', plugin: 'goal-scaffold' } }
```

独立来源可辨、不可变、与用户原话分开入批——下游消费者可以区分"人说的"和"插件让做的"。

### 2.4 PLAN_FIRST_INSTRUCTION 与 plan.md 模板

指令全文要点（:125-132）：写任何实现代码之前 ① 在 workspace root 生成 plan.md——清单式，**每一项都带最小可验证验收标准（有命令的给命令）**；② create_goal 且 objective 引用 plan.md、**maxGoalRounds: 5**；③ 把计划给人类过目，然后从第一项开工逐项打勾；提及若 verify-judge 在装则 goal completion 会跑工作区验证命令——"让验收标准是真的"。三条边界必须点破：

- **plan.md 模板并不存在于插件中**——格式完全活在这段英文提示串里，无结构校验、无 schema；
- **maxGoalRounds 上限也是提示词建议**而非本插件强制（宿主 goal-mode 语义）；
- 插件自身零写盘，所有产物出自被引导的模型。

README.zh 实测记录（2026-08-15 Web UI 真实驱动）：9 项带可运行验收命令的 plan.md、UI 目标卡片、9/9 打勾盖章；短消息零误报；headless 安静直通——为手工验证记录，无自动化测试背书。

## 3. 对本项目的可用模式

- **R1 结论加严后成立**："closest community analog to AGE file-based plans" 只证明"计划文件落项目根"的社区引力。单 checklist 文件、无 roadmap 层、无状态机（checkbox 即全部状态）、无第二代理、goal 态仍在宿主——AGE `docs/plans/` 全 schema 的每个缺口它都有，反向印证 AGE 不该收敛到单文件方案。
- **Adopt — 交互形态 → Mission Control / WI12 skills 面**：三选一问询 + 每会话一次预算 + headless 优雅降级 + plugin-source provenance 标记，是 mdcontrol.draft 这类"替用户起草计划"入口的直接 UX 参考：先问再动笔、答案即授权边界、产物标注来源。比 R1 泛泛的"draft-review participation"更具体。
- **Adapt — 检测启发式**：长度阈值 + 中英范围信号词 + isHuman 过滤的三元启发式可作为 Mission Control "draft-nudge" 技能触发条件的起点；但 AGE 规划方法学住在 `docs/process/application-development-workflow.md` 与 plan guide，不应像 scaffold 一样压进一段提示串常量。
- **对照 plan 验收清单**："every item carries a minimal, verifiable acceptance criterion (a command to run where one exists)" ↔ plan guide 的 Closure Gates / Exit Criteria / Rule 10 清单完整性——同一世界观（完成 = 清单勾完）的最小雏形。scaffold 缺的是勾选看守：打勾 self-declared、verify-judge 可选装。这正是 frontmatter 改造提案（completed 从勾选派生）+ CLOSURE_AUDIT（勾选被独立流程看守）要补齐的两层。
- **Reject — 政策载体**：把规划政策写成单一英文 prompt 常量、goal 上限靠模型自觉遵守提示词，与本项目"可判定规则机械化（WI13/BUILD_VERIFY）、判断规则留 owner docs"的分界线相悖。

## 4. 风险与不适用面

1. **启发式误报/漏报面**：中文信号词固定 15 个，extraSignals 可扩但每会话一次预算意味着第一条消息误判方向后整会话沉默；minLength×3 的超长直通对粘贴大段代码的短任务会误触发。
2. **语言断裂**：instruction 是英文常量，非英语会话中突然插入英文指令可能干扰弱模型跟随（README 实测仅在 Web UI 单一环境做过）。
3. **改写语义耦合宿主决策形状**：依赖 PreStepDecision 'enter' 分支结构与 userQuestions 服务签名，rc API 漂移风险与另两家相同。
4. **零自动化测试**：行为正确性靠 README 手工实测记录，无回归防线。
5. `.npmrc`/.gitignore/tsconfig/pnpm-lock 为样板/生成物未读。

## 5. 关键源码索引

| 内容 | 位置 |
| --- | --- |
| 配置校验 resolveConfig（fail-loud） | `src/index.ts:72-91` |
| 内置信号词表（中英 15 词） | `src/index.ts:62-65` |
| isHuman 过滤 | `src/index.ts:102-105` |
| 长任务启发式（minLength / ×3 直通） | `src/index.ts:114-119` |
| PLAN_FIRST_INSTRUCTION 全文 | `src/index.ts:125-132` |
| pre-step 挂载 + 会话预算 | `src/index.ts:139-155` |
| 三选项问询 + 取消放行 | `src/index.ts:157-177` |
| delegate-then-append 改写 + provenance | `src/index.ts:186-196` |
| cordis bundle patch（单行挂载） | `cordis.patch.yml:1-4` |
