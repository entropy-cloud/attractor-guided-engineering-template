# dsh-flash-godmode 调研报告（dsh-plugin-survey）

> | 项 | 值 | 依据 |
> | --- | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-flash-godmode/`（`/Users/abc/ai/dsh-plugins/dsh-flash-godmode`） | 本地目录 |
> | 来源 repo | `https://github.com/Cavan-Ou/dsh-flash-godmode.git`；本地 `.git` 在场，浅历史未取；README 自述基于作者另一仓库 `yjh051108/dsh-router-standard`（MIT）的实测 persona 行为带，并与之衍生关系 `dsh-routing-suite`（web profile 完整套装） | `README.md:11,53,63-65`；`router-core.mjs:4-18` |
> | stars | 任务未给定，README 无徽章数；web 检索未单查（任务焦点为源码机制） | — |
> | 语言 | 纯 JavaScript ESM（`.mjs`），无 TS、无 React、无打包步骤；声明 `"type": "module"`、`main: ./lib/router-bootstrap.mjs` | `package.json:5-10` |
> | license | MIT（致谢 dsh-router-standard 同协议） | `LICENSE`、`package.json:16`、`README.md:71-73` |
> | 版本/兼容 | v0.2.0（"opencode-go 适配版"）；DSH `0.1.0-rc.6` headless profile 实测；runtime peer `cordis`（inject `systemPrompt`、`tools`）；依赖项**零运行时**（仅 `node:test` 做单测） | `package.json:3-4,24`；`router-bootstrap.mjs:24` |
> | 测试/CI | `node:test` 9 例（**README 自述 11 例，与实读不一致**——以源码为准），零依赖；无 CI 配置、无 lint/typecheck 步骤；本次未运行 | `tests/router.test.mjs:13,24,37,43,52,61,68,85,91`；`README.md:45` |
> | 宿主 API 面 | Cordis `apply(ctx, config)` + `inject: ['systemPrompt','tools']`；两钩子：`session/event`（任务文本捕获）、`system-prompt/assemble`（persona 替换、guidance 注入、工具过滤）。无 UI seam、无 client bundle | `router-bootstrap.mjs:21-26,32-47,49-98`；`cordis.patch.yml:1-6` |
>
> 行号约定：以 `lib/*.mjs` 与 `tests/*.mjs` 为准。**未读部分**：`.git` 历史（无 web 拉取 commit）、`LICENSE`（仅确认存在）、dsh-router-standard / dsh-routing-suite 上游（仅 README 转述）、DSH `system-prompt/assemble` 与 `agent/inbox/spliced` 宿主契约（仅按本插件注释/事件名推断）、`opencode-go` 通道细节。文中涉及这些文件的结论均基于本仓源码或 README 转述并已标注。

## 1. 定位

一句话：**headless 专用的"模型路由型"宿主插件**——专为 V4 Flash（`reasoning: max`）设计，把"过度思考简单任务 / 思考不足复杂任务 / 中途漂移"三个不稳定症状，通过「w7 persona + 首轮工具收窄 + 任务复杂度分派引导」三层叠加转成可复现能力（README.md:3,9-15）。

具体能力面：
- **路由表层**：作者把模型行为空间坍塌为 `spec / transition / react` 三带，外加 Flash 专用的 `weak`（内部路由）域；Flash 一律路由到 `weak`，其余模型回退到关键词分类（react=1 / spec=0 / 同分→weak）（router-core.mjs:75-92,103-117）。
- **w7 persona 锚定**：Flash 走 `WEAK_FLASH`——中性身份 + classify 指令 + 回顾/反跑题锚三段式（router-core.mjs:46-50）；此即作者实测的 Flash 最优解（P11 区分度 +5.67、P23 单任务完成率 100%），**不含深度思考句**（v0.2 从 persona 中移出，按复杂度单独分派）。
- **首轮工具锚定**：第一轮请求只见 `coreFor(mode)` + 一个平台 shell（pwsh/bash）；首次 `tool/call` 事件后放开全目录（router-bootstrap.mjs:70-97），目的是"不要在路径锁定的首轮里让模型被无关工具分心"。
- **按复杂度分派的引导**：捕获首轮任务文本后，`isComplexTask()` 判为复杂则注入 `GUIDE_DEEP`（决策闭环句），否则注入 `GUIDE_FAST`（1 步收敛句），均以独立 section（`name: 'router-guidance'`, `order: 1000`）追加（router-bootstrap.mjs:73-78）。

**与上游 dsh-router-standard / dsh-routing-suite 的关系判定：本插件 = 完整套装在 headless 上的最小可装形式**。证据：
1. 作者为同一人（`Cavan-Ou` vs `yjh051108`），README 自述"基于 dsh-router-standard 实测的 persona 行为带"，注释引用 P8/P11/P21/P23/P24/P30 全部页码（router-core.mjs:4-18）；
2. 形态差异：dsh-routing-suite 是 web profile 的"运行时注入器 + 预设选择器"（PowerShell 安装器、每会话手选），本插件是 `dsh plugin add` 一键装的 headless 原生单插件，README 明言"套装自己的 issue 里也记录了 rc.6 上逐条引导不生效"（README.md:63-65）；
3. **核心修复点是捕获路径**：作者原 router 用 `user/message` 事件读首条消息，但 headless 上该事件落在**首次 prompt 组装之后**——对路径锁定的首轮来说太晚；本插件改监听 `agent/inbox/spliced`，该事件**先于首轮 assemble** 触发且 `inserted[0]` 携带全文（router-bootstrap.mjs:30-44, README.md:21-23）。

唯一共同点是都消费 DSH Session 事实源；与上一份 dsh-plugin-agent-workflow.md 报告中的"workflow"概念毫无关系（此处的 routing 指模型行为模式选择，不是执行链路/工作流编排）。

## 2. 架构与机制（源码级）

### 2.1 组件图（文字版）

```
DSH headless (Cordis 宿主)
 └─ cordis.patch.yml
     └─ insert plugin 'router-bootstrap'  (cordis.patch.yml:1-6)
        └─ lib/router-bootstrap.mjs  apply(ctx, config)
           ├─ inject=['systemPrompt','tools']        (router-bootstrap.mjs:24)
           │
           ├─ state 任务文本捕获
           │   ├─ overrides: Map<sessionId, mode>     (line 27, 预留)
           │   └─ taskTexts: Map<sessionId, text>     (line 28)
           │
           ├─ hook 'session/event'                   (line 32-47)
           │   ├─ 事件源 1: 'agent/inbox/spliced'    → inserted[].content[].text（首轮前可用）
           │   └─ 事件源 2: 'user/message' (兜底)    → data.content[].text
           │
           └─ hook 'system-prompt/assemble'          (line 49-98)
                ├─ mode 解析
                │   ├─ overrides.get(sessionId) ??                  (line 64)
                │   ├─ isFlashModel(modelId) → 'weak'              (line 65, 强制)
                │   └─ else → sessionMode(session)（关键词分类）    (router-core.mjs:128-132)
                ├─ persona 替换
                │   └─ applyPersona(sections, personaFor(mode,modelId))
                │       └─ 滤掉 'persona' 段，新增 'router-persona' (order=0)
                ├─ 任务文本：spliced 优先；未捕获则扫 session.events.user/message (兜底)
                ├─ firstTurn 判断: !events.some(e=>e.type==='tool/call')  (line 70)
                ├─ 首轮引导注入 (only when firstTurn && taskText)
                │   ├─ isComplexTask(text) → guide ∈ {GUIDE_DEEP, GUIDE_FAST}
                │   └─ sections.push({name:'router-guidance', order:1000})  (line 76)
                └─ 工具过滤 (only when firstTurn)
                    ├─ coreFor(mode) 基础集 ∪ {pwsh|bash}                  (line 84-90)
                    └─ tools.filter(t => core.has(t.name))                  (line 96)
                       ↑ 非首轮：原样返回 assembled.tools（line 81，promoted）

 ── 引用 lib/router-core.mjs (零依赖纯逻辑) ─────────────────────────
  ├─ 行为带: spec/transit/react/weak        (bandOf, line 76-82)
  ├─ 四套 persona: SPEC/MIXED/REACT         (line 22-34)
  ├─ 两套 weak persona: WEAK_PRO/WEAK_FLASH (line 41-50, 模型特定)
  ├─ 两段 guidance: GUIDE_FAST/GUIDE_DEEP   (line 53-57)
  ├─ 复杂度启发: length>120 || COMPLEX_RE    (isComplexTask, line 62-64)
  ├─ 关键词分类: REACT_RE / SPEC_RE         (classifyTask, line 111-117)
  ├─ 模型族检测: /flash/i                   (isFlashModel, line 67-69)
  ├─ 首轮工具集: read/write/edit(+grep/glob) (coreFor, line 95-101)
  └─ persona 段替换: 滤 + 追加              (applyPersona, line 135-140)
```

### 2.2 推理模式路由流（核心机制）

1. **flash-only 强制 weak 路由**：插件不暴露用户态模式选择，唯一预留入口是 `overrides` Map（router-bootstrap.mjs:27）——目前无任何外部写路径。Flash 模型经 `isFlashModel(modelId)`（regex `/flash/i`）识别后强制 `mode = 'weak'`（router-bootstrap.mjs:64-65）；非 Flash 走 `sessionMode(session)` 关键词分类（router-core.mjs:128-132）。
2. **persona 段原位替换**：`applyPersona(sections, persona)` 把所有 `name === 'persona'` 或包含 `persona` 子串的 section 过滤掉，再以 `name: 'router-persona', order: 0` 追加新段（router-core.mjs:135-140）——保留 plan-mode、rules 等其他 section，测试覆盖（tests/router.test.mjs:68-83）。这避免了与宿主内置 persona 段重复，也避免污染 plan-mode 用户态选择。
3. **首轮任务文本捕获（关键 headless 修复）**：`session/event` 钩子按 `agent/inbox/spliced` 优先、`user/message` 兜底的顺序写入 `taskTexts` Map（router-bootstrap.mjs:32-47）；注释与 README 自述：前者先于首轮 assemble 触发、后者晚于——前者是"路径锁定前唯一窗口"（router-bootstrap.mjs:30-31, README.md:21-23）。事件形状变化由 `try/catch` 静默吞下、走兜底（line 46）——这是**降级而非告警**。
4. **复杂度分派启发**：`isComplexTask(text)` = `text.length > 120 || COMPLEX_RE.test(text)`（router-core.mjs:62-64）；正则匹配中英文架构词（重构/架构/全面/详细/设计/系统/优化/分析/survey/overview/architecture/refactor/comprehensive/detailed/design/system/optimize/analyze）。README 承认 `analyze.py` 这类文件名会误判为复杂，方向是**安全的**（多给深引导而非少给，README.md:57-59, tests/router.test.mjs:56）。
5. **首轮引导注入**：`firstTurn && taskText` 双条件成立时追加 `{name:'router-guidance', text:guide, order:1000}`（router-bootstrap.mjs:73-78）；`order: 1000` 把这段推到 section 列表最末，使其**叠加而非替换** persona 与内置引导。`console.error` 打印 `[godmode] taskLen=... complex=... guide=... mode=...` 作为可观测通道（README.md:30-33 给出 `grep godmode` 验证手法）。
6. **首轮工具收窄**：`coreFor(mode)` 按行为带返回基础集——spec=`[read,edit,glob,grep]`、transition=`[read,edit,write,glob,grep]`、react/weak 默认=`[read,write,edit]`（router-core.mjs:95-101）；**始终额外 union 一个平台 shell**——`pwsh` 优先、`bash` 次之、二者皆无则抛错（router-bootstrap.mjs:84-90）。`assembled.tools.filter(...)` 只保留核心集成员（line 96）。
7. **首轮后工具解锚**：`firstTurn = !events.some(e => e.type === 'tool/call')`（line 70）——只要当前 session 已有过任一 `tool/call`，`firstTurn = false`，走 `line 81` 的 `return { ...assembled, sections, contexts: [] }` 路径，**tools 原样透传、contexts 清空**（注释 "promoted: full catalog"）。
8. **降级语义**：`spliced` 捕获失败时（事件名变更、字段形状变），`taskTexts.get(session.id) === undefined` → `firstTurn && taskText` 不成立 → 不注入 guidance，但 persona 仍由 `applyPersona` 替换为 w7（line 69）——按 P23 单任务完成率 100% 仍"安全"，任务照常跑（README.md:58-59）。

### 2.3 与宿主原生 persona/seam 的关系

**最小侵入**：插件不动宿主的 prompt assembly 主流程，只在 `system-prompt/assemble` 钩子的 `next()` 之后做段替换与 tools 过滤。`ctx.on('system-prompt/assemble', async (_assembly, context, next) => {...})` 是 Cordis 中间件范式而非事件订阅——插件包住 `next()` 调用，**前/后处理两段都是同步计算**（router-bootstrap.mjs:49-98）。`contexts: []` 始终清空是值得注意的副作用——未在 README 中说明，但测试与源码一致；推测是 DSH 的 "动态上下文注入" 通道与路由引导互斥。

**无客户端组件**：与 dsh-plugin-agent-workflow（纯浏览器 React 投影）相反，本插件是**纯 headless 服务端插件**，无 UI seam、无 client bundle、无 conversation.view 插槽——`cordis.patch.yml` 仅 insert 一个 Cordis plugin id（cordis.patch.yml:1-6）。

**event 流只读不写**：插件全程不 `dispatch` 任何事件、不写文件、不调外部 API——`console.error` 是唯一的"写"动作，且是诊断目的。所有事实源来自 DSH 事件流 + 宿主 assemble 中间件上下文。

## 3. 对本项目的可用模式（Adopt/Adapt/Reject）

先回应指定映射点：

- **w7 persona 锚定 ↔ system prompt routing**：插件用 `applyPersona()` 做"section 级原位替换"——把宿主的 `persona` section 滤掉、换成 `router-persona`（router-core.mjs:135-140）。这不是覆盖整个 system prompt，而是按 section 名做精准外科替换。AGE 若要给 mission-driver 注入"agent 角色指令"，同样应走**段级 section 替换**而非整段 prompt 覆盖；好处是保留 plan-mode、rules 等其他 section 不被破坏（测试覆盖这一点，tests/router.test.mjs:68-83）。
- **首轮工具锚定 ↔ first-turn tool pinning**：插件在首轮把工具集收窄为 `[read,write,edit,shell]`，首次 tool call 后放开（router-bootstrap.mjs:70-97）。**推理**：模型在路径锁定的首轮容易被无关工具分心（"看到 bash 就想 `whoami`"），收窄后第一动作更有概率是真正写/改代码。AGE mission-driver 若有类似"工具过载导致首步空转"问题，可参考此模式——但要注意 AGE 工具面是 mission JSON 的命令集而非 DSH 的 read/write/edit，迁移时需重新定义"核心集"。
- **按复杂度分派 ↔ complexity-dispatched guidance**：四步管线 `捕获(spliced) → 判(>120字|关键词) → 选(GUIDE_FAST|DEEP) → 注(order=1000 追加)`，关键修复点在**捕获阶段而非分发阶段**——用 `agent/inbox/spliced` 替代晚一拍的 `user/message`（router-bootstrap.mjs:30-47）。AGE 若想给 driver 加"按任务难度自适应引导"，需要找到 mission JSON / git log 里的"首轮前可用"信号——等价于 DSH 的 spliced 事件，即**在 driver 第一次决策之前就能读到任务文本的位置**。
- **headless 原生 vs web profile**：`dsh-routing-suite` 在 web profile 上首轮引导不生效（issue 自承），本插件明确以 headless 为目标 profile（README.md:63-65）。说明同一种 routing 思路在不同 DSH profile 上的事件时序不可移植——AGE 选 headless 路径应警惕：一旦 DSH 升级到下一个 RC，本插件注释的事件名/字段可能失效（README.md:58-59 给出降级路径）。

| # | 模式 | 判定 | 映射与理由 |
| | --- | --- | --- |
| 1 | 行为带坍塌（spec/transition/react/weak 四带量化） | **Adapt** | AGE 若给 mission 加模式选择，可用同形态"按可测指标把行为空间分成离散带"；前提是 AGE 有等价 P8/P11/P23 这类作者实测表。 |
| 2 | section 级原位替换（applyPersona 滤掉 `name: 'persona'` 后追加 `router-persona`） | **Adopt** | mission-driver 给 LLM 注入"agent 角色"时应走 section 替换而非整段覆盖；保留 plan-mode、rules 等 section。 |
| 3 | 强制 weak 路由（Flash 模型一律 `mode='weak'`，不允许用户态改） | **Adapt-lite** | 适用前提是该模型有作者实测的"单一最优 persona"；AGE 目前模型族简单，暂不必钉死。 |
| 4 | 复杂度启发（`>120字` 或架构关键词正则） | **Adapt** | AGE 可做"按 mission 长度/关键词分派不同提示深度"；但要像本插件一样承认"误判方向是安全的"（README.md:57-59）——宁可深引导、不可无引导。 |
| 5 | 首轮工具收窄（firstTurn → coreSet+shell；first `tool/call` 后放开） | **Adapt** | mission-driver 若发现"首步被无关命令分心"，可同款实现；但 AGE 命令面是 mission YAML 声明而非注册中心，需改"核心集"定义来源。 |
| 6 | 捕获路径选 spliced 而非 user/message（首轮前 vs 首轮后） | **Adopt** | AGE 任何"基于任务文本的首轮决策"都应在 driver 决策之前找到任务文本的可见位置；这一原则是 headless 路由的核心。 |
| 7 | 降级 = 静默丢弃引导（catch 后无告警） | **Adapt** | 兜底方向是"安全"（无引导 ≠ 错引导），但应有**埋点/可观测**，否则"捕获失败"变成静默故障。本插件用 `console.error` 是最低成本可观测，AGE 应至少有 dev log 记录。 |
| 8 | 整段 prompt 覆盖式 routing | **Reject** | 本插件**没有**走这条路；如需"全局替换 system prompt"应警惕与 plan-mode 等段冲突。 |

## 4. 风险与不适用面

1. **强 DSH 版本耦合**：插件注释明言"rc.6 headless 实测"（router-bootstrap.mjs:30-31），README 自述"未来 DSH 版本若 `agent/inbox/spliced` 失效则回退"（README.md:58-59）；`agent/inbox/spliced` 事件名 / `inserted[0].content[0].text` 字段路径都是宿主私有契约，没有 DSH 端 schema 承诺。**借鉴此插件的捕获路径必须接受"跟随 DSH RC 重写"的成本**。
2. **首轮工具收窄是模型族特定的强假设**：插件默认"`read/write/edit` + shell"是 Flash 首轮的合理子集（router-core.mjs:95-101 + router-bootstrap.mjs:84-90），但**未跑 Pro / V3 / 非 DeepSeek 模型**——README 仅自述 opencode-go + V4 Flash 一组实测（README.md:17）。迁移到其他模型族需重测"首轮核心集"。
3. **复杂度启发误判已知**：`analyze.py` 这类文件名命中 `analyze` 关键词被误判为复杂（README.md:57-59, tests/router.test.mjs:56）；插件选择"宁滥勿缺"方向，但这对追求首轮收敛速度的场景是反向伤害——简单任务被多塞了 12% 深度引导（router-core.mjs:56-57 的 GUIDE_DEEP 句）。
4. **persona 文本是作者私有沉淀**：WEAK_FLASH/WEAK_PRO 是 yjh051108/dsh-router-standard 实测文本（router-core.mjs:36-50），不是 DSH/DeepSeek 官方提供的 system prompt；引用即视为接受"按那位作者的 P8/P11/P21/P23/P24/P30 实测"作为依据。AGE 若复制 persona 文本应同时复制其 license（MIT）与归因（README.md:71-73）。
5. **contexts 字段被无声清空**：`return { ...assembled, sections, contexts: [] }`（router-bootstrap.mjs:81, 95）——非首轮 / 首轮两条返回路径都把 `contexts` 设为空数组，README 与注释均未解释。若 DSH 的 `contexts` 字段承担"运行时动态上下文注入"语义，本插件等同于**永久关闭该通道**。这是一个**有副作用的隐式行为**，借鉴前需澄清。
6. **测试覆盖不足**：node:test 9 例（README 自述 11 例，与实读不一致——以源码为准）只覆盖 `router-core.mjs` 的纯函数，`router-bootstrap.mjs` 的中间件钩子逻辑（session/event 捕获、system-prompt/assemble 改写、tools 过滤）**零测试**。CI 也未配置（package.json 无 scripts 字段、无 .github/workflows/）。借鉴本插件的钩子写法应自行补测。
7. **形态不适用**：本插件是 DSH Cordis 服务端插件（inject `systemPrompt`/`tools`），与 mission-driver 的 Node CLI 进程无代码级复用路径；价值全部在模式层（第 3 节），不在实现层。
8. **本地浅克隆**：未读 `.git` 历史，无法核实作者声明的迭代过程（v0.2 "opencode-go 适配版" 的具体 commit 序列）。

## 5. 关键源码索引

| 主题 | 位置 |
| --- | --- |
| 行为带量化（spec/transition/react/weak） | lib/router-core.mjs:76-82 |
| 四套 persona 文本（SPEC/MIXED/REACT/WEAK_PRO） | lib/router-core.mjs:22-44 |
| **WEAK_FLASH（w7 persona 锚定核心）** | lib/router-core.mjs:46-50 |
| 两段引导文本（GUIDE_FAST / GUIDE_DEEP） | lib/router-core.mjs:53-57 |
| 复杂度启发（>120字 \| 架构关键词正则） | lib/router-core.mjs:60-64 |
| 关键词任务分类（REACT_RE / SPEC_RE / weak 平局） | lib/router-core.mjs:103-117 |
| Flash 模型族检测（`/flash/i`） | lib/router-core.mjs:67-69 |
| 首轮工具集（spec/transition/react 三档） | lib/router-core.mjs:95-101 |
| **applyPersona section 级原位替换** | lib/router-core.mjs:135-140 |
| extractText 防御性解包（嵌套 `data.message`） | lib/router-core.mjs:120-125 |
| Cordis plugin 名 / inject 声明 | lib/router-bootstrap.mjs:21-26 |
| **session/event 捕获（spliced 优先 + user/message 兜底）** | lib/router-bootstrap.mjs:32-47 |
| **system-prompt/assemble 钩子（persona+guidance+tools）** | lib/router-bootstrap.mjs:49-98 |
| Flash 强制 weak 路由 | lib/router-bootstrap.mjs:64-65 |
| firstTurn 判断（无 tool/call 即首轮） | lib/router-bootstrap.mjs:70 |
| **首轮复杂度分派 + guidance 追加（order=1000）** | lib/router-bootstrap.mjs:73-78 |
| 首轮工具收窄（coreFor + pwsh/bash 探测 + 抛错） | lib/router-bootstrap.mjs:80-97 |
| 降级行为（contexts 始终清空） | lib/router-bootstrap.mjs:81, 95 |
| Cordis patch（insert 'router-bootstrap' plugin） | cordis.patch.yml:1-6 |
| 纯函数单测（bandOf/personaFor/classifyTask/isComplexTask/extractText/applyPersona/isFlashModel/GUIDE_*） | tests/router.test.mjs:13-95 |
| README 实测数据表（P8/P11/P21/P23/P30 页码引用） | README.md:48-55 |
| README 已知边界与降级承诺 | README.md:57-61 |
| 与 dsh-routing-suite 关系 + headless 适配说明 | README.md:63-65 |

未读备查：`.git` 历史、`LICENSE`（仅确认存在）、dsh-router-standard / dsh-routing-suite 上游仓（仅 README 转述）、DSH 宿主 `system-prompt/assemble` / `agent/inbox/spliced` / `user/message` / `tool/call` 契约（仅按本插件注释/事件名推断，未对照宿主源码）、opencode-go 通道细节（仅 README 转述）。
