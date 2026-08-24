# dsh-plugin-agent-workflow 调研报告（dsh-plugin-survey）

> | 项 | 值 | 依据 |
> | --- | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-plugin-agent-workflow/`（`/Users/abc/ai/dsh-plugins/dsh-plugin-agent-workflow`） | 本地目录 |
> | 来源 repo | `https://github.com/xuanyuanzhifeng/dsh-plugin-agent-workflow.git`，本地 HEAD `f706b0d`（"修改readme"，浅历史仅 1 commit） | `git remote -v` / `git log` |
> | stars | 任务给定约 102★；web 检索（2026-08-24）见 repositorystats 显示 97★、repo 创建于 2026-08-18 且处于 trending 上升期——量级一致但本地无法精确证实 | websearch |
> | 语言 | TypeScript + React 18，纯浏览器端 client 包（全仓 src 约 4.1k 行，几乎全部在 `src/client/`） | 目录结构与 `package.json:22-59` |
> | license | MIT | `LICENSE`、`package.json:11` |
> | 版本/兼容 | v0.1.0，peer 钉 DSH `0.1.0-rc.7` 全家桶（client-runtime / client-ui-* / session / llm / tools / agent / invariants / compaction）+ cordis ^4.0.1 + react；**零运行时依赖**（虚拟化等全在 devDeps，随 bundle 打包） | `package.json:68-99,100-132` |
> | 测试/CI | vitest 4 + jsdom + @testing-library/react，5 个 client spec（bundle 装载、注册、model 折叠、JSON inspector）；GitHub Actions 跑 typecheck→test→pack（`.github/workflows/ci.yml:13-25`）；本次未运行 | `package.json:65,100-132`；tests 目录 |
> | 宿主 API 面 | 宿主入口为空壳 `apply(): void {}`；client 端 inject `['slots','conversationEvents','conversationViews','sessions','locale']`：`slots.inject('conversation.view')`（order=15 新标签页）、`conversationEvents.register`（逐事件类 replay 定义）、`conversationViews.register`（target `'workflow'` 的 ViewBuilder）、`sessions.binding(id).session.loadOlder/getSnapshot`、`locale.register`；另有 invariant companion 注册空不变量 | `src/index.ts:3-4`；`src/client/index.ts:28-61`；`src/invariant.ts:5-13` |
>
> 行号约定：以 `src/**/*.ts(x)` 为准。**未读部分**：`src/client/locales.ts` 全文（仅 grep 键名）、`src/client/WorkflowJsonInspector.tsx`（170 行）、`WorkflowView.tsx` 渲染细节（271-482、558-639）、`projection/layout.ts` 230-1128 行（分组细节仅读头尾）、`message-definitions.ts`/`compaction-definition.ts` 局部、全部 `tests/*`（5 个 spec，未运行）、`scripts/clean.mjs`、CSS。文中涉及这些文件的结论均基于 grep 或转述并已标注。

## 1. 定位（含与 dsh_workflow 的关系判定）

一句话：**纯浏览器端的只读可视化插件**——在 DSH Web UI 的"对话""轨迹"之外加第三个"工作流"标签页，把 Session 事件流投影为"用户轮次 → Step N（模型请求）→ 响应 / 工具调用"的执行链路视图（README:3,11-18）。

具体能力面：左侧按轮次列表（提示词摘要、开始时间、模型/工具调用数、完成状态），右侧按时间序展示每次调用的请求卡片（真实记录的 system、provider 无关 messages[]、tools 三区 JSON 树）、响应卡片（reasoning/content/tool-call）与工具执行状态卡，顶部汇总轮次数、模型调用数、工具调用数与总耗时；token 统计细分为输入/未缓存输入/缓存读/缓存写/输出五桶以分析前缀缓存复用（README:21-29）。

名字里的 "workflow" 指 **agent 执行链路本身**，不是可编排的 workflow 产品：它不派发子 Agent、不写任何文件、不给模型加任何工具（README:33-35"只读取并展示已有记录"），宿主侧入口是空函数（src/index.ts:3-4），连 invariant 都是显式注册的空实现并自述"replay-derived、无持久关系"（src/invariant.ts:10-13）。

**与 omdsh-dev/dsh_workflow 的关系判定：不同赛道的平行项目，不是前身、分支或平行实现。**证据：

1. **作者与代码零交集**：xuanyuanzhifeng vs omdsh-dev；dsh_workflow 是宿主侧 service/engine/store/catalog + QuickJS VM 的执行层，本项目是 browser-only React 投影层，二者无一行共享代码，也无 fork 痕迹（本地浅历史仅 1 commit，无法深挖谱系，但包结构、命名风格、seam 使用完全不同源）。
2. **数据方向相反**：dsh_workflow 在 write-path 编排执行（派发子 Agent、落盘 run 目录、审批门）；本插件在 read-path 观察（消费已记录的 Session 事件，重建视图）。
3. **DSH 版本线不同**：本插件钉 `0.1.0-rc.7` 客户端 API（package.json:70-80），dsh_workflow 钉 `0.0.1-rc.2` 宿主 API——相隔一代接口面，二者甚至难以在同一宿主版本共存。
4. **时间线**：repo 创建于 2026-08-18（web 检索），晚于 dsh_workflow 所属的 rc.2 时代数周。

唯一共同点是都消费 DSH Session 事实源且都叫 "workflow"；社区目录 dsh-plugin.org 将 dsh_workflow（94★）归入 Workflow & Automation 类，而本插件的实质类别是 UI/observability。"星数更高、同赛道"的任务前提经查证不成立，特此修正。

## 2. 架构与机制（源码级）

### 2.1 组件图（文字版）

```
DSH Web UI (Cordis)
 └─ client/index.ts  inject[slots, conversationEvents, conversationViews, sessions, locale]
     ├─ projection/*-definition.ts   每事件类一个 ConversationNodeDefinition（match/start/update/buildViewNode）
     │    ├─ request-header    ← request/header          （系统提示词+tools 快照及 diff）
     │    ├─ surface           ← append/replace surface  （模型可见消息面操作）
     │    ├─ message           ← user/message, agent/inbox/spliced(next-step)
     │    ├─ assistant         ← step/start|end, assistant/chunk|message, llm/retry
     │    ├─ tool              ← tool/call, tool/result, tool/code-dispatch-start|dispatch
     │    ├─ compaction        ← compaction/start|summary|end, session/end-seed
     │    └─ turn-end          ← turn/end
     ├─ snapshot-builder.ts  WorkflowSnapshotBuilder(target 'workflow')
     │     contributions(按 anchorSeq 排序) → WorkflowSnapshot{eventNodes,requests,callSchemas,partial,runningCalls}
     ├─ workflow-model.ts    deriveWorkflowLayout → deriveWorkflowModel（纯函数折叠为轮次×模型调用矩阵）
     └─ WorkflowView.tsx     左轮次列表 + 右虚拟化调用行 + JSON inspector（@tanstack/react-virtual）
```

### 2.2 投影管线（核心机制）

1. **逐事件类 replay 状态机**：每个定义用 `match` 声明关心的事件类型、`start/update` 维护不可变状态、`reader.previous<T>()` 读同类前一节点形成跨事件链（request-header-definition.ts:56-58；message-definitions.ts:57-60）。assistant 定义把 chunk 流折叠为 blocks 并累加 usage（含 cacheRead/cacheWrite/reasoning 分桶，assistant-definition.ts:120-141）；这使任意历史窗口都能从事件重放重建，与宿主内置 Chat/Trajectory 投影互不影响（jscpd 注释明言"独立拥有 replay builder，使 Trajectory 保持可选且版本无关"，snapshot-builder.ts:13）。
2. **增量快照构建器**：`apply(upserts)` 按 node key 原位替换，仅当 key 新增或 `anchorSeq` 变化才标记 structural 触发全量重建；`replace()` 整体清空重建（snapshot-builder.ts:194-220）。`snapshot()` 单遍扫描按 anchorSeq 排序的 contributions 组装四类数据（222-308），再做三个后处理：
   - `interruptCompactions`：跨 `session/end` 边界仍 running 的 compaction 推断为 error"被中断"（86-115）；
   - `applyTurnErrors`：turn-end 的错误归因到该轮最后一个 assistant 请求（117-138）；
   - `attachRequestMessages`：把 surface append/replace 记录回放到每个请求的 seq 边界为止，**逐请求重构模型当时真实看到的 messages[]**（164-182）；越窗 replace 无法定位影子区间时降级为"只保留替换结果"（152-160）。
3. **子代理/嵌套派发链的可视化**：`tool/code-dispatch-start|code-dispatch` 事件携带 rootCallId/parentCallId/subCallId，定义维护 children/parents 边表（tool-definition.ts:136-157）；`projectCall` 递归展开为 ToolCallBlock 树，visited 集合防环、`MAX_DEPTH = 256` 截断（11,120-134,169-185）；缺失 result 的调用在中断点合成 `isError:'Interrupted'` 结果块补全链路（186-200）。注：code-dispatch 的宿主语义（是否即 subagent 派发）未对照 DSH 宿主源码验证——本次约束只读插件目录。
4. **模型折叠纯函数**：`deriveWorkflowModel` 把 layout 中标题匹配 `/^Step (\d+)$/` 的组与 `purpose==='assistant'` 请求按 `turn:step` 键对齐，产出轮次×调用的只读矩阵；status 由启发式推导（有 error 痕迹→error、有 running 请求或缺输出的工具→running，workflow-model.ts:102-119）；轮次耗时优先用 Session 自有的 `turnTimings` 边界（64-68,139-154）。全程无副作用，单测直接覆盖（tests/workflow-model.client.spec.ts，215 行，本次未运行）。
5. **inbox 注入追踪**：`agent/inbox/spliced(target==='next-step')` 事件经 `applySplice` 维护 pending/claimed 队列状态并标记被移除的 identity 为 claimed（message-definitions.ts:20-60），publication 为 `'none'`——即只参与状态链、不产生可见节点，用于解释轮次间的隐式输入。
6. **大数据量 UI 策略**：模型调用行用 `@tanstack/react-virtual` 行虚拟化（估算行高 230、overscan 4，WorkflowView.tsx:521-526），同响应多工具卡横向滚动而非换行（README:115）；JSON 树检查器独立成组件支持逐级折叠与复制放大（WorkflowJsonInspector.tsx，未细读）。工程侧源码带 `jscpd:ignore` 标记块，说明上游用复制粘贴检测约束代码重复（assistant-definition.ts:23 等）。
7. **恢复/持久化语义：没有**。这是它最重要的"负空间"设计——零文件写、零工具注册、UI 状态仅存页面内存（README:114），汇总统计明确只覆盖已加载的历史窗口（README:113），更早的事件通过 `loadOlder` 自动分页循环补齐并以返回值判定是否有新数据防重入（WorkflowView.tsx:41-51,504-515）。invariant 包的存在只为满足宿主插件规范，注册的是空不变量（invariant.ts:10-13）——与 dsh_workflow 的 durable run graph 形成光谱两极。

### 2.3 与宿主原生 workflow/tool-workflow seam 的关系

**没有任何关系。**它不接触 `ctx.workflows`、`subagents`、`tools.register`、`jobs` 等执行面，也不消费 `tool-workflow/*` 事件（grep 全源码无此类事件名）。它与宿主的接缝全部在**客户端 UI seam**：`cordis.patch.yml` 只 insert 一个 `ui-workflow` 插槽 id；`ConversationViewSnapshotMap` 经 module augmentation 声明独立的 `'workflow'` target（contract.ts:97-102）；`dsh.client.inject` 声明 locale/runtime/ui-conversation 三个浏览器依赖（package.json:52-59）。换言之：dsh_workflow 复用了宿主"轨迹"的原生事件面做执行产品，本插件则是给宿主**对话记录**做一个更好的读视图。

## 3. 对本项目的可用模式（Adopt/Adapt/Reject）

先回应指定映射点：

- **FlowEngine 执行器可替换性论证**：本插件是"观察面完全建立在宿主事件 seam 之上、与执行机制零接触"的极端样本——宿主入口为空函数仍交付完整产品价值。这正面印证 AGE 的三事正交假设：只要 Session/git 日志这一事实源稳定，monitor 可以永远待在 read-path，不随 Process/Native 执行器切换而改动。mission-driver 的 Vue monitor 应锁定"只消费 git + logs + mission JSON 投影"这条纪律，本插件是同构参照。
- **roadmap/plan 消费方式对比**：三者分别是——本插件消费**运行时 Session 事件流**（无文件事实源，受加载窗口限制，README:113）；dsh_workflow 消费 **catalog 文件 + 自有 run store**（双事实源，插件内治理）；mission-driver 消费 **missions/\*.json + docs/plans/\*.md git 文件**（仓库即唯一事实源，git 历史免费提供快照层）。本插件证明了"事件流投影"路线的代价：窗口外数据永久缺席、无法离线审计；反衬 AGE 选 git 文件的正确性。
- **异步契约**：`partial`（流式中）与 `runningCalls`（进行中工具）单独通道携带、不混入 finalized nodes（snapshot-builder.ts:239-240,258-279），UI 层据此渲染进行时状态；`loadOlder` 以 changed boolean 作为分页步进信号（WorkflowView.tsx:46-50）；请求详情的 JSON 树（system/messages[]/tools 三区可折叠复制，README:15-19;WorkflowJsonInspector.tsx 未细读）把"大对象检查"从视图层独立成组件——monitor 若做 plan/step 详情面板可同样拆分。

| # | 模式 | 判定 | 映射与理由 |
| --- | --- | --- | --- |
| 1 | 纯函数投影：事件/日志 → 视图模型（deriveWorkflowModel 无副作用、可直接单测） | **Adopt** | Vue monitor 的状态计算应抽成同样签名 `(facts, window) => model` 的纯函数，从 Pinia store 里剥离；测试无需 jsdom 即可覆盖聚合逻辑。 |
| 2 | 增量快照构建器（upsert 原位替换 + anchorSeq 结构检测 + 结构变化才全量重建） | **Adopt** | monitor 加载大 dev log / 长 mission 历史时的通用增量形态；anchorSeq≈git 序号或日志行号。 |
| 3 | "owned projection 不复用内置投影代码"的解耦决策（snapshot-builder.ts:13 注释：使 Trajectory 可选且版本无关） | **Adapt** | 对应"把 harness/session 形状关在 adapter 内"：mission-driver 读 DSH 会话作 CHECK 证据时，应自带一份最小 replay，不 import 插件或宿主的投影实现。 |
| 4 | 请求边界 messages[] 按 seq 回放重构（attachRequestMessages + 越窗 replace 降级） | **Adapt** | DEEP_AUDIT 若需复核"step 执行时模型实际看到了什么上下文"，按事件序号边界投影是现成算法；降级策略（宁可丢旧不可示错）值得照抄。 |
| 5 | 稀疏事件的中断推断（running 跨边界→error、缺 result→合成 Interrupted 块） | **Adapt** | monitor 展示 mission 被打断后的状态可参考；但必须标注为启发式展示，不得回写成事实源——与我们"插件零持久记忆"约束一致。 |
| 6 | 逐事件类 replay 状态机注册表（match/start/update/buildViewNode 四件套） | **Adapt-lite** | 若未来 driver 需要解析多类日志事件（CHECK 结果、audit 记录），此注册表模式比巨型 switch 更可扩展；AGE 当前事件种类少，暂不必引入框架。 |
| 7 | 其"workflow"语义（轮次执行链路） | **Reject** | 与 AGE flow（可执行 DAG/序列）同名不同物；对外文档须避免概念混淆，勿因名字把它当 workflow 引擎对标。 |

## 4. 风险与不适用面

1. **强版本耦合**：peer 直接 import 客户端私有类型（contract.ts:1-6），全套钉 rc.7；README 自述 DSH 每 RC 可能破坏客户端接口、升级须换装适配版（README:37-45）。借鉴其代码必须连同"跟随 RC 重写"的成本一起评估。
2. **观察窗口限制**：汇总只覆盖已加载历史（README:113）；对超长 session 的自动 `loadOlder` 循环成本未评估（tests 未读、未运行）。
3. **status 是启发式而非事实**：callStatus 用"响应缺输出字段"猜 running（workflow-model.ts:110-116），并行分支也不绘制、仅线性横滚（README:115）。任何想拿它当中断真相源的用法都不成立。
4. **形态不适用**：浏览器插件 + React + Cordis client seam 与 mission-driver 的 Node CLI 进程无代码级复用路径；价值全部在模式层（第 3 节），不在实现层。
5. **本地浅克隆**：git 历史仅 1 commit，无法核实迭代过程与作者声明；stars/创建日期来自第三方检索站，存在滞后可能。
6. **对本项目的正价值边界**：其 token 五桶统计（含 cacheRead/cacheWrite，workflow-model.ts:85-100）提示 mission-driver 的 CHECK 层若记录每 step 实测 usage，可用同口径评估 AGE 流程的前缀缓存效率；但该数据在浏览器端仅作展示、不落盘——我们若要留存须写进 dev log 或独立 run 记录（仓库外），不得新增仓库内第二状态源。

## 5. 关键源码索引

| 主题 | 位置 |
| --- | --- |
| 空宿主入口（browser-only 证据） | src/index.ts:3-4 |
| client 注册面与 conversation.view 插槽（order=15） | src/client/index.ts:28-61 |
| 空 invariant companion（零持久关系自述） | src/invariant.ts:5-13 |
| 'workflow' target 与 SnapshotMap augmentation | src/client/projection/contract.ts:79-102 |
| 独立 replay 声明（Trajectory 版本无关） | src/client/projection/snapshot-builder.ts:13-15 |
| 增量 apply/replace 与结构检测 | src/client/projection/snapshot-builder.ts:194-220 |
| snapshot 组装与三后处理（中断推断/错误归因/messages 重构） | src/client/projection/snapshot-builder.ts:222-308（86-115,117-138,145-182） |
| request/header 定义与 prompt diff | src/client/projection/request-header-definition.ts:44-66 |
| surface append/replace 事件定义 | src/client/projection/surface-definition.ts:14-38 |
| assistant chunk 流折叠与 usage 累加 | src/client/projection/assistant-definition.ts:120-141,285-320 |
| 工具树/code-dispatch 边表/环防护/MAX_DEPTH | src/client/projection/tool-definition.ts:11,120-157,169-201,218-233 |
| user/message 与 agent/inbox/spliced | src/client/projection/message-definitions.ts:20-60,68-75 |
| compaction 生命周期与 end-seed | src/client/projection/compaction-definition.ts:89-124 |
| layout 分组（TurnBucket/'Step N' 组装） | src/client/projection/layout.ts:139-230（余 230-1128 未细读） |
| 轮次×调用矩阵纯函数（status/usage/timings） | src/client/workflow-model.ts:85-137,163-240 |
| 视图层：虚拟化/loadOlder 循环/汇总条 | src/client/WorkflowView.tsx:483-557（41-51,504-515） |
| peer 钉版 rc.7 与 client.inject 声明 | package.json:52-59,68-99 |
| 安装/卸载/兼容声明 | README.md:37-96（已知限制 111-115） |

未读备查：`locales.ts` 全文、`WorkflowJsonInspector.tsx`、`layout.ts:230-1128`、`tests/*`（5 spec）、`scripts/clean.mjs`、CSS 与图片资产。本报告涉及上述文件的结论均只基于 grep/README 转述并已在文中标注。
