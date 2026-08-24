# dsh-plannotator 调研报告（dsh-plugin-survey）

> | 项 | 值 |
> |---|---|
> | 本地路径 | `~/ai/dsh-plugins/dsh-plannotator/` |
> | 来源 repo | `https://github.com/titanwings/dsh-plannotator`（本地 `.git` remote 已核对，HEAD `c0fe880`） |
> | 版本 / Stars | v0.1.3（package.json:3）；stars 未联网核实 |
> | 语言 / license | TypeScript + React 18（client esbuild bundle 已入库，host 零逻辑）；MIT（含 `THIRD_PARTY_NOTICES.md` + `LICENSES/Plannotator-MIT.txt`，声明受 backnotprop/plannotator 启发） |
> | 宿主 API 面 | host 半 no-op（src/index.ts:8-10）；client `inject: ['slots','locale']`，`slots.inject('conversation.composer')` 注册 priority `-10` chain 条目 + `select` 收窄（src/client/index.ts:15-20），经 `QuestionWait.respond` RPC 应答宿主 pending interaction（contracts.ts:33-45），React portal 挂 `document.body`（PlannotatorPanel.tsx:481），UI primitives 来自 `@deepseek-ai/dsh-client-ui-primitives` |
> | 调研方式 | 只读本插件目录源码 + 写本报告；`locales.ts/styles.ts` 全文、`scripts/build.mjs`、lib 产物、docs/*.png 截图未读；ui-lifecycle.test.tsx 只读了用例名清单 |

## 1. 定位

把 DSH Plan Review 的二选一 gate（approve/decline）升级为**多意见精准批注审阅**：Web UI 里拖选计划原文逐条批注，一轮收集兼容性/安全/回滚等多处意见后整体回传，Agent 留在 Plan mode 修订后再审（README.zh-CN.md:23-58）。典型流程（:151-161）：Plan mode 生成计划 → `exit_plan_mode` 触发 Plan Review → 宽屏对话区右侧并排打开审阅栏 → 拖选批注 + 整体意见 → 发送反馈（Agent 收到结构化审阅留在 Plan mode）→ 审修订版 → 批准。关键自限：只接管「合法、单问题的 plan-review」交互，其余交还内置渲染器（:182）；无私有 Host route、无第三方服务、无平行 agent loop、反馈走 DSH 现有响应通道（:191,203-204）；卸载插件后原生 Plan Review 自动恢复（:162）。对本项目而言，它是「draft review 人机协作面」与 WI15 reopen 后内嵌面板两个问题的最小完整先例。

## 2. 架构与机制（源码级）

### 2.0 文件面速览

client 半五个职责模块各一文件：`contracts.ts`（宿主交互类型 mirror）、`plan-review.ts`（协议收窄+应答）、`selection.ts`（锚定）、`feedback.ts`(草稿+渲染)、`PlannotatorPanel.tsx`（UI 组装）+ `layout.ts/styles.ts/locales.ts` 支撑层；host 半 10 行 no-op。模块边界与测试一一对应。

### 2.1 极薄 host 面 + 单条 client chain 条目

Host 入口空函数（src/index.ts:10），一条 cordis loader row 同时携带两半（cordis.patch.yml 注释）。client 只做三件事：装样式、注册 locale、往 `conversation.composer` chain 插一个 priority -10 的条件条目——`select: selectPlanReview` 命中才渲染，否则链继续走内置渲染器（src/client/index.ts:12-21；contracts.ts:51-56）。

### 2.2 接管面收窄协议（安全性的根）

`planReviewOf` 把任意 question wait 收窄到精确的二进制 plan-review 形状：恰好 1 个问题、`intent.kind === 'plan-review'`、`detail` 存在（即计划全文）、非 multiSelect、options 1-2 个且 `intent.approve` 标签必须命中某个 option（plan-review.ts:17-39）；任一不满足返回 undefined → 插件放手。测试用真值表钉死边界（detail 缺失/multiSelect/options 3 个均不接管，tests/plan-review.test.ts:34-40）。

### 2.3 反馈回传通道（任务点名：结构化反馈如何进上下文）

三条应答路径都走同一个 `wait.respond` RPC（宿主 pending interaction 的标准 answer 信封，contracts.ts:38-45）：① 批准 = 选中 asker 的原标签（`selected:[approve.label]` :59-67）；② **要求修改 = `selected: []` + `custom: feedback`**——DSH 单选答案的 custom 文本与选项互斥，所以整份批注 Markdown 作为 custom 文本回传（:69-82 注释写明互斥约束）；③ 继续讨论 = `ok:false` + error code `'cancelled'` 关闭 gate 回普通输入框（:85-94）。因为走的是宿主原生交互通道，反馈自动落入 tool result 与 Session Log，Agent 收到后留在 Plan mode 立即修订（README.zh-CN.md:93-95）——**插件不建任何新持久化层，上下文注入是宿主行为**。

### 2.4 反馈的结构化渲染（锚定如何被 Agent 消费）

`renderPlanFeedback`（feedback.ts:32-62）把批注按**文档位置排序**（start 升序、createdAt/id 决胜 ：37-38），每条渲染为固定形状：`## N. Comment on selected plan text` + 引用块原文 + `**Requested change:** <comment>`；头部是指令句 "Revise the plan to address every item below, then present the updated plan for review"（:56）+ FNV-1a 计划版本戳 `Plan revision: fnv1a-xxxxxxxx`（:18-25, :58）。Agent 拿到的是「原文引用 ↔ 修改要求」成对、顺序稳定、带版本号的纯 Markdown——无需任何解析器即可逐条执行。

### 2.5 锚定机制（三层消歧 + 失配拒显）

`anchorFromRange`（selection.ts:7-27）：start/end 是渲染后全文 `textContent` 的字符偏移（前置 Range 求 start 前长度，再去掉选中首尾空白校正 ：12-16）；quote 上限 800 字符（:14）；另存 ±48 字符 prefix/suffix 上下文用于消歧（:23-24）。高亮回放时经 TreeWalker 把偏移映回 DOM Range（rangeForAnchor :47-73），**回放前重验 range 实际文本 === quote 才高亮**，失配静默放弃（applyAnnotationHighlights :82-85）——偏移漂移不会标错地方。

### 2.6 草稿保护与二次确认

草稿按 `${sessionId}:${wait.key}` 键存 localStorage（PlannotatorPanel.tsx:100-102,168-174）；读取 fail-closed：revision 不匹配（计划已变）或任一字段畸形即整份丢弃（parseStoredDraft feedback.ts:65-91）。存在未发送批注时点批准需要第二次明确确认，按钮变红色 approveAnyway（PlannotatorPanel.tsx:279-285,437-445）——「不悄悄丢人的工作」。

### 2.7 响应式三形态与可访问性

响应式三形态 docked(≥1480px 并排预留 clamp(440px,28vw,560px) companion column)/drawer/sheet(≤640px) 由同一运行时边界函数与 CSS media query 双侧对齐（layout.ts:3-4,8-18；tests/layout.test.ts:26 守护两者一致），收起态退为 44px 右缘 rail 按钮并保留批注计数徽标（COLLAPSED_DOCK_WIDTH layout.ts:5；PlannotatorPanel.tsx:449-462）。模式切换时清掉瞬态选区与未提交评语，防「选区悬空指向已替换的文档面」（PlannotatorPanel.tsx:186-192；tests/ui-lifecycle.test.tsx:275 专项用例）。可访问性成体系：panel aria-labelledby/aria-busy、批注跳转按钮 #N、`prefers-reduced-motion` 降级平滑滚动（focusAnnotation :287-294）、错误 role="alert" 与状态 aria-live="polite" 分离（:421-423）、批注框 Cmd/Ctrl+Enter 提交 Esc 取消（:372-375）。

### 2.8 测试覆盖形状

四套件（node:test + tsx）：`plan-review.test.ts`——协议收窄真值表、approve/feedback 的 wire 形状、反馈按文档序排序、畸形/过期草稿拒收、中英字典 lockstep（:34-92）；`ui-lifecycle.test.tsx`——jsdom 全生命周期：建批注/滚动跟随浮动按钮/收起再开保留草稿与高亮/二次批准/反馈一次性 settle 与拒绝恢复/HMR 样式所有权三条（:246-501）；`layout.test.ts`——边界常量、几何无横向溢出、运行时与 CSS 双侧一致；`package-contract.test.ts`——发布物免安装期构建脚本（对应 README.zh-CN.md:126「安装时不运行包构建脚本」的承诺被测试钉住）。

## 3. 对本项目的可用模式（Adopt/Adapt/Reject + 逐点对照）

- **对照点 1「结构化反馈进上下文的通道选择」——Adopt 原则，Adapt 实现**：它最值得抄的不是 UI 而是**借道既有交互原语**：反馈作为对 gate 问题的合法 answer（custom 字段）进入宿主事件流/tool result/session log，插件零新增持久化与传输面（§2.3）。对我们 REVIEW_PLANS/DRAFT review 人机协作面的启示：人工反馈的理想入口是「对 REVIEW_PLANS 这个 step 的结构化应答」（引擎已有 marker/answer 解析面），而不是旁路聊天或人手改文件后重启；若未来 mission-driver 加交互式 gate，answer 信封应带 `selected[]+custom` 互斥语义与「cancelled=回到自由讨论」三态（对应我们的 approve / request-changes / discuss）。
- **对照点 2「锚定机制」——Adapt 成纯文本版**：offset+quote+prefix/suffix 三层锚 + FNV 版本戳 + 回放前失配重验（§2.5），完全可脱 DOM 化：我们 plan 文件的人工批注可用「行号区间 + 原文引用 + 前后各一行上下文 + 计划哈希」写进 `docs/discussions/` 或 plan 的批注节，DRAFT_PLANS 消费时先验证引用仍命中原文再采纳——防止「计划已改、意见错位」。`renderPlanFeedback` 的固定段落格式（编号 + blockquote 原文 + Requested change）可直接成为我们批注文件的书写规范。
- **对照点 3「WI15 reopen 参考价值」**：WI15 E1 发现「静态 client-plugin 机制存在但 rc 未文档化」，better-sidebar 是重量级例证，plannotator 是**轻量级第二例证**：no-op host + 单 composer chain 条目 + select 收窄 + portal 面板 + companion column 几何预留，不改 core details grid 列定义（README.zh-CN.md:188-190）——若 T1/T2/T3 任一触发 reopen，「mission 状态内嵌卡片」可按此挂载姿势落地，工程量下界由此报告给出（约 700 行 client TS）。同时它的局限直接印证 WI15 数据面裁定：plannotator 能容忍 poll-free 因为它是单次 gate 交互（用户在场驱动）；step-level status 需要持续推送，poll-only 面板实时性严格弱于 monitor SSE 的结论不变。
- **Reject**：localStorage 草稿（浏览器本地、按 session 隔离、不云同步）——我们 repo-is-source-of-truth 要求批注落盘为文件才能进审计链；其 fail-closed 校验思路可留，存储介质不留。
- **Adopt 落点建议（具体到我们的面）**：若给 mission-driver 加「draft 人工批注」能力，最小形态 = ① 批注文件规范借 `renderPlanFeedback` 段式（编号 + blockquote 原文 + Requested change + 计划哈希头），落 `docs/discussions/<date>-<plan>-annotations.md`；② DRAFT_PLANS prompt 增加「先逐条验证批注引用命中当前 plan 原文再采纳」的守卫句（对应 selection.ts:84 的失配拒显）；③ REVIEW_PLANS 的 reopen 判据增加「存在未消解批注文件时不得 approved」——即它「未发送意见阻止批准」语义的文件版（PlannotatorPanel.tsx:279-285）。

## 4. 风险与不适用面

- **协议漂移风险**：收窄依赖 `intent.kind==='plan-review'` 等 rc 期未文档化字段（contracts.ts:17），宿主改协议时插件静默退化为不接管（fail-open 到内置渲染器，安全但不工作）。
- **锚定基于渲染后文本**：Markdown 渲染差异（列表符号、链接展开）会使 textContent offset 与磁盘 plan 原文的偏移不一致——quote 重验缓解但不消除；移植到我们的行号方案时要锚定源文件而非渲染产物。
- **companion column 依赖宿主挂载边界**：1480px 预留依赖「稳定 Web `#root` 挂载边界旁」（README.zh-CN.md:189-190），宿主改版即碎。
- **单机单浏览器**：草稿不可迁移，换设备/换浏览器丢批注进度。
- **批注语义无分级**：所有意见平铺（无 严重/建议 或 must/should 分层），Agent 自行权衡——对照我们 audit 报告的分级裁定语义，直接照搬会丢失优先级信息。
- **诚实标注未读部分**：styles.ts 的 HMR refcount 机制（tests/ui-lifecycle.test.tsx:437-501 有三条守护用例）与 build.mjs 的 bundle 合同（window.__ModuleLoader__）只从 README 与测试名推断，未读实现；`locales.ts` 字典键的完备性只从「lockstep 测试存在」间接确认。

## 5. 关键源码索引

| 主题 | 位置 |
|---|---|
| no-op host 面 | `src/index.ts:1-10` |
| composer chain 注册 | `src/client/index.ts:12-21`（priority -10 + select） |
| 接管收窄协议 | `src/client/plan-review.ts:17-39`（planReviewOf）、`:42-49`（selectPlanReview） |
| 三态应答 | `src/client/plan-review.ts:59-67`（approve）、`:73-82`（custom 反馈，互斥注释 ：70-71）、`:85-94`（dismiss/cancelled） |
| 反馈 Markdown 渲染 | `src/client/feedback.ts:32-62`（`:56` 指令头、`:58` 版本戳）；FNV-1a `:18-25` |
| 锚定机制 | `src/client/selection.ts:7-27`（偏移+±48 上下文）、`:47-73`（TreeWalker 回映）、`:76-91`（失配拒显高亮） |
| 草稿 fail-closed | `src/client/feedback.ts:65-91`；autosave/清理 `src/client/PlannotatorPanel.tsx:100-102,168-174` |
| 二次批准确认 | `src/client/PlannotatorPanel.tsx:279-285,437-445` |
| 响应式几何契约 | `src/client/layout.ts:3-18`；一致性守护 `tests/layout.test.ts:26` |
| 可访问性与交互细节 | `src/client/PlannotatorPanel.tsx:287-294`（reduced-motion）、`:372-375`（快捷键）、`:421-423`（alert/live 区） |
| 模式切换选区清理 | `src/client/PlannotatorPanel.tsx:186-192`；专项用例 `tests/ui-lifecycle.test.tsx:275` |
| 测试覆盖形状 | `tests/plan-review.test.ts:34-92`、`tests/ui-lifecycle.test.tsx:246-501`、`tests/package-contract.test.ts:7` |
| 架构自述（Cordis 遵循） | README.zh-CN.md:193-206 |

> 姊妹报告交叉：本插件的「单次 gate 交互 + 结构化 custom 反馈」与 `dsh-inspect.md` §2.3 的「对抗式问题清单」互补——前者是人→agent 的反馈通道样本，后者是 agent 自审的机制样本；两者共同覆盖 draft review 人机协作面的两侧。

> 未读部分声明：`src/client/styles.ts`、`src/client/locales.ts`、`scripts/build.mjs`、`lib/` 构建产物与 docs/*.png 截图未读；ui-lifecycle.test.tsx 断言体只读了用例名，未逐行阅读。
