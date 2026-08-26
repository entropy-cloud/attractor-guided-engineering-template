# dsh-routing-suite-dragonbaba 调研报告

> | 项 | 值 | 依据 |
> | --- | --- | --- |
> | 本地路径 | `/Users/abc/ai/dsh-plugins/dsh-routing-suite-dragonbaba/` | 本地目录 |
> | 来源 repo | `https://github.com/dragonbaba/dsh-routing-suite` | `package.json:33-36` |
> | 与同名插件关系 | **同名同名同名**：`dsh-routing-suite` 同时存在于 `github.com/yjh051108/dsh-routing-suite`（另一作者，约 102★）和 `github.com/dragonbaba/dsh-routing-suite`（本仓）。后者在前者的源码基础上做"独立化、瘦身、合规化"重构并明确划清边界：`SOURCE_PROVENANCE.md:9-12` 列出四份参考实现并声明"no source is distributed"；`ACKNOWLEDGEMENTS.md:6` 把 yjh 版本列入致谢。 | `SOURCE_PROVENANCE.md:7-13`、`ACKNOWLEDGEMENTS.md:6-9` |
> | stars | 本地 git 浅克隆，stars 数无法精确读取——同源 fork 体量与 yjh 版本量级相近但**不可直接套用 yjh 版的 star 数**，需独立核验。 | git 状态 |
> | 语言 | TypeScript（Host: Node ESM）+ React 18（Client: CJS 浏览器包）；总源码约 350 行（`src/index.ts` 60、`src/router.mjs` 75、`src/client/index.ts` 128、`src/router.d.mts` 8） | `tsconfig*.json`、`tsdown.config.ts:11-46` |
> | license | MIT（作者 `rpg_zaun <2311993475@qq.com>`，`package.json:30-32`）；**自带的 `preset/routing-suite/agent.cordis.yml` 内容来自 DeepSeek Harness 上游 Standard preset，沿其 MIT 协议再分发**（`scripts/verify-package.mjs:41-44` 钉 SHA256）。 | `LICENSE`、`package.json:30-32`、`scripts/verify-package.mjs:41-44` |
> | 版本/兼容 | v0.1.2，`engines.node >= 22.19.0`；**运行时仅一个依赖** `schemastery 3.18.0`（Config schema 校验）；无 peerDependencies、无 install/postinstall 脚本（`test/package-contract.test.mjs:14-23` 主动断言这些缺失）。 | `package.json:38-89`、`test/package-contract.test.mjs:14-23` |
> | 测试/CI | 自带 node:test 两份 spec：`router.test.mjs`（76 行，覆盖分类器/extractor/assembly 注入/幂等覆盖/中性 no-op）与 `package-contract.test.mjs`（63 行，宿主禁能力白盒）；`npm run verify` = typecheck + test + build + `scripts/verify-package.mjs`（载入构建产物、注入 mock ctx、跑 round-trip 装配、grep 禁词、对 SHA256 钉死 Standard 组合、`npm pack --dry-run` 对 tarball 白名单）。**未实际运行**。 | `package.json:71-78`、`scripts/verify-package.mjs:1-170` |
> | 宿主 seam 面 | `inject: ['systemPrompt', 'webServer']`；接缝仅两个：`ctx.on('system-prompt/assemble', ...)` 与 `ctx.webServer.register({ path: '/routing-suite/api' })`。 | `src/index.ts:5-59` |
> | 客户端 seam 面 | `dsh.client.inject = ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-ui-slots']`；`apply()` 仅做 `ctx.slots.inject('settings.section', () => ctx.slots.register({ name:'settings.section', id:'routing-suite-status', order:50 }, RoutingSuiteSection))`。 | `package.json:54-61`、`src/client/index.ts:121-128` |
> | 路由"真实身份" | **prompt-level routing，不是 provider-level**：不改模型、不挑后端、不路由 token；只是看会话头里"是否选用了 routing-suite 预设"、瞄一眼首条用户消息、按正则算分，**决定往 system prompt 末尾 push 一段中文/英文工作方式提示**。`src/router.mjs:18-21,70-75` 与 `src/index.ts:36-42` 是全部"路由"逻辑。 | 见 §2.2 |
> | 是否新增 Agent preset | 是。`package.json:62-69` 的 `dsh.desktop.presets = [{ id: 'routing-suite', path: './preset/routing-suite' }]`，`preset.yml` 取名 `智能路由模式`（`order: 5`），`agent.cordis.yml` 251 行完整复用上游 Standard 组合（persona/bash/pwsh/fs/jobs/skill/goal/plan-mode/compaction/delegation/workflow/ralph/todo/web），仅 `fetch: false`、`searchTimeoutMs: 60000` 等少数参数微调。**这是它能交付"完整 Standard 能力 + 智能路由模式菜单项"的物理基础**。 | `preset/routing-suite/preset.yml:1-3`、`preset/routing-suite/agent.cordis.yml:1-251`、`scripts/verify-package.mjs:40-44` |
>
> 行号约定：以 `src/**/*.{ts,mjs}`、`preset/**`、`scripts/**`、`test/**` 为准。
> **未读部分**：`LICENSE` / `LICENSES/*`（仅 README 与 `THIRD_PARTY_NOTICES.md` 提到）、`THIRD_PARTY_NOTICES.md`、`package-lock.json`（关注点之外）；**实际未运行** `npm run verify`、`npm pack`；构建产物 `lib/`（verify 脚本会动态载入 mock，不读本体）。文中涉及上述内容的结论均已标注。

## 1. 定位（含与 provider-level 路由的对比）

一句话：**纯宿主侧的"提示词级路由"插件**——在 DSH 模式菜单里新增"智能路由模式"，仅当用户在该模式下，由一段**零依赖的纯正则文本分类器**在装配 system prompt 时给它追加一段 1 句的 `inspect-first` / `direct` 工作方式说明。换工具吗？不换。改模型吗？不改。多发一次 LLM 调用吗？不多发（README:21 自我声明："Makes no extra model request and performs no filesystem, process, package, or network management"）。

**对比维度一：路由层级（最重要）**。这条最容易被同名插件搞混——"routing" 在 DSH 生态里至少有三种所指：

| 路由对象 | 谁来做 | 改变什么 | 本插件是否参与 |
| --- | --- | --- | --- |
| 模型/Provider 路由（`@deepseek-ai/dsh-llm`） | 宿主 llm seam | 选 endpoint、计费、token 上报、fallback chain | ❌ 完全不碰 |
| Agent preset 选择（`agent-preset/selected` 事件） | 用户在 UI 切换 | 挂载不同的 `agent.cordis.yml`、工具集、prompt 上下文 | ⚠️ 仅**监听**这个事件（`src/index.ts:11-18`）以判断"现在该不该注入路由提示"，自身**不**新增可选 preset 之外的工具/能力 |
| **Prompt 内段路由（prompt-level routing，本插件）** | 宿主 `system-prompt/assemble` hook | 仅在装配好的 sections 数组尾部追加一段 `routing-suite-guidance` section | ✅ **是** |

换句话说，"智能路由模式"这一档**没有自带的特权**：所有 Standard 模式下的工具（fs、bash/pwsh、subagent、workflow、ralph、goal、plan、web fetch…）都自动继承（`preset/routing-suite/agent.cordis.yml:1-251`），路由只是给 system prompt 多了 1 句"先把根因摆出来再动手 / 直接给我一个可用结果"的额外文字。

**对比维度二：与 yjh051108/dsh-routing-suite 的关系**。后者是社区里 star 数较高的同名项目，含更激进的 router/injector 实现（hook 重写、动态注入、junction、self-healing、安装器），本插件 `SOURCE_PROVENANCE.md:9-12` 与 `ACKNOWLEDGEMENTS.md:6-9` **明确致谢**并列出 reviewed revisions，但显式声明"no upstream Injector code or copied Router implementation"；其 runtime 仅是一个 75 行的 `router.mjs` + 一个 60 行的 `index.ts`。**判定：本插件是 yjh 版的轻量化、合规化再发行**，去掉了所有非必要能力（自测试 grep 的反向白名单：`assert.doesNotMatch(host, /new Function|spawn|exec|junction|symlink|loader|timer|ctx\.tools|ctx\.llm/)`，见 `test/package-contract.test.mjs:36`）。

**对比维度三：与 dsh_workflow / dsh-router-standard / dsh-super-injector 的边界**。三者经 `SOURCE_PROVENANCE.md:10-12` 一并致谢，但实现细节未分发。本插件 = "只取 yjh 版"灵感 + "只取 Standard preset"事实源，且不实现执行引擎、不实现注入管理、不实现诊断——仅实现 prompt 装配钩子。

**对本项目的启示性定位**：当一个 LLM Agent 产品需要在不改模型、不改工具、不破坏已有 prompt 上下文的前提下，**根据首条任务类型施加一种工作偏好**时，这是**最轻**的实现参考——单文件 ~75 行的纯正则分类器 + 一段 hook + 一个 status endpoint + 一个只读 React 卡片，全包无运行时依赖（除 schema 校验库）。

## 2. 架构与机制（源码级）

### 2.1 组件图（ASCII）

```
DSH Desktop (Cordis)
 │
 ├─ Host side ─────────────────────────────────────────────────────────
 │   patch: cordis.patch.yml   仅插入一条 dsh-routing-suite bundle
 │                             (enabled:true, strategy:auto) (7 行)
 │
 │   src/index.ts  (60 行)  inject: ['systemPrompt','webServer']
 │     ├─ Config = z.object({ enabled, strategy })  Schemastery schema (27-30)
 │     ├─ selectedPreset(session)                   倒序扫 events 找
 │     │                                            agent-preset/selected，
 │     │                                            fallback session.header (9-18)
 │     ├─ ctx.on('system-prompt/assemble', …)        中间件：
 │     │     next() → 拿到下游组装好的 assembled
 │     │     ├─ 判定 !enabled                  → 透传
 │     │     ├─ 判定 !session / preset ≠ 'routing-suite' → 透传 (36-42)
 │     │     └─ 走 applyRoutingToAssembly(
 │     │           assembled, resolveMode(strategy, session))
 │     └─ ctx.effect(webServer.register(/routing-suite/api, …))
 │           ├─ GET  /status → { ok, enabled, strategy, preset }
 │           └─ 其它 → 404  (44-59)
 │
 │   src/router.mjs  (75 行)  —— 实际"路由器"
 │     ├─ INSPECT_INTENT_PATTERNS 修复|排查|调试|...|fix|debug|review|…  (3-6)
 │     ├─ INSPECT_SYMPTOM_PATTERNS 错误|失败|损坏|error|failing|broken  (8-11)
 │     ├─ DIRECT_PATTERNS          新建|创建|开发|...|build|create|…  (13-16)
 │     ├─ GUIDANCE                  inspect-first / direct 各一句 (18-21)
 │     ├─ score(text, patterns)     regex.match().length 求和 (23-27)
 │     ├─ extractText(data)         容错：支持 string / content[] / 嵌套 message (29-37)
 │     ├─ firstUserText(session)    顺序扫 events，跳过 source.kind==='plugin' (39-51)
 │     ├─ classifyTask(text)        inspectIntent > direct > inspectSymptom > neutral (53-63)
 │     ├─ resolveMode(strategy,session)
 │     │     固定策略 → 直返；auto → 跑分类器 (65-68)
 │     └─ applyRoutingToAssembly(assembled, mode)
 │           中性 / 缺 sections / 无 GUIDANCE → 透传
 │           过滤掉旧的 routing-suite-guidance，再 append 新一段 (70-75)
 │
 │   preset/routing-suite/      —— 新增的可选 Agent preset
 │     ├─ preset.yml            name: 智能路由模式, order: 5 (3 行)
 │     └─ agent.cordis.yml      251 行 = 上游 Standard preset 完整组合
 │                                (persona/bash/pwsh/fs/search/jobs/skill/
 │                                 goal/plan/compaction/delegation/
 │                                 workflow/ralph/todo/web)
 │                                scripts/verify-package.mjs 钉 SHA256 校对 (41-44)
 │
 ├─ Client side (浏览器 CJS bundle) ──────────────────────────────────
 │   src/client/index.ts  (128 行)  inject: ['slots']
 │     ├─ copy = { 'zh-CN': {…}, en: {…} }                文案字典 (14-49)
 │     ├─ text()                                          navigator.language
 │     │                                                  → zh-cn / zh-hans* 走中文，否则英文 (51-54)
 │     ├─ RoutingSuiteSection()                           React 只读卡片：
 │     │     fetch('/routing-suite/api/status')            useEffect 拉只读状态 (75-119)
 │     │     渲染: h3 + status + 3 张策略说明卡 + safety note
 │     └─ apply(ctx)
 │           ctx.slots.inject('settings.section', factory)
 │             → ctx.slots.register(
 │                 { name:'settings.section', id:'routing-suite-status', order:50,
 │                   label: () => text().tab },
 │                 RoutingSuiteSection)                   (121-128)
 │
 └─ 打包与发布 ────────────────────────────────────────────────────────
     tsdown.config.ts            双产物：ESM host (lib/index.js) +
                                  CJS client (lib/client.js, 包 window.__ModuleLoader__)
                                  Client externals: react / @deepseek-ai/dsh-client-* (1-46)
     scripts/verify-package.mjs  170 行端到端 verify：
                                  - 读 package.json/cordis.patch.yml/preset
                                  - 钉死 Standard preset SHA256 (41-44)
                                  - 模拟 __ModuleLoader__ 装载 client.js，
                                    验证 settings.section 注册 + React markup 渲染
                                  - 模拟 host ctx，验证 assemble 钩子：
                                    · 非 routing-suite preset 不被改 (119-126)
                                    · routing-suite preset + '修复这个错误' → 加 section (108-118)
                                    · latest event 切到 routing-suite 后立即生效 (127-134)
                                  - 调用 statusHandler 断言 {ok,strategy:'auto',preset:'routing-suite'} (135-141)
                                  - npm pack --dry-run，对比白名单 file 列表 (143-167)
```

### 2.2 3 模式分类算法（核心机制）

**触发点**：每次宿主拼装 system prompt 时（`ctx.on('system-prompt/assemble')`，`src/index.ts:36`）。中间件先 `await next()` 拿到下游 assembled，再判断两件事：
1. 配置启用？`config.enabled ?? true`（`src/index.ts:33`）；
2. 当前 session 选用的 preset **就是** `routing-suite`？`selectedPreset(session) !== routingPreset`（`src/index.ts:40`，`routingPreset = 'routing-suite'`）。

`selectedPreset` 实现细节：`src/index.ts:9-18` 倒序遍历 `session.events`，找最近一条 `type === 'agent-preset/selected'` 且 `data.agentPreset` 是字符串的事件；找不到再 fallback `session.header.agentPreset`。**为何倒序**：用户可能在同一会话内多次切 preset，必须以**最新一次**的选择为准。`test/router.test.mjs:39-49` 的 "routing remains stable on the first real durable user task" 用例显式构造了一个 session：先有 `source.kind === 'plugin'` 的"build ignored"（跳过）、后有真实 user "修复这个问题"，断言 `firstUserText` 返回中文修复句、断言 `resolveMode('auto', session) === 'inspect-first'`、断言 `resolveMode('direct', session) === 'direct'`。

**首条任务抽取**：`firstUserText(session)`（`src/router.mjs:39-51`）：
- 正向遍历 `session.events`；
- 跳过非 `type === 'user/message'` 的事件；
- 取 `event.data` 后兼容 `data.message ?? data`；
- 跳过 `source.kind && source.kind !== 'user'`（即工具/插件冒充的 user 不算）；
- 调 `extractText` 把 `content: [{type:'text', text:'…'}]` 拼接为字符串（支持嵌套 `message.content`，`router.mjs:29-37`）；
- 第一条**非空**文本即返回，后续 user message 不再考虑。

**评分分类**：`classifyTask(text)`（`src/router.mjs:53-63`）——纯正则命中数求和：
- `INSPECT_INTENT_PATTERNS`（13 个中/英词：`修复|排查|调试|报错|为什么|审查|检查|迁移|重构|优化|升级|兼容|漏洞|回归` / `fix|debug|diagnose|review|audit|inspect|migrate|refactor|optimize|optimise|upgrade|compat|regression`）；
- `INSPECT_SYMPTOM_PATTERNS`（3 个症状词：`错误|失败|损坏` / `error|failing|failed|broken`）——**得分权重要低于意图**；
- `DIRECT_PATTERNS`（10 个中/英词：`新建|创建|开发|实现|生成|搭建|从零|写一个|新增|添加` / `build|create|implement|generate|scaffold|develop|write|add|new`）。

判定优先级（**注意顺序**）：
```
if inspectIntent > 0  → 'inspect-first'  (意图最强，胜)
else if direct > 0    → 'direct'        (建造意图)
else if inspectSymptom>0 → 'inspect-first' (没意图没建造，但症状像)
else                  → 'neutral'       (不追加 section)
```

**为何意图优于症状**：测试 `test/router.test.mjs:24-29` 显式断言 `'修复并创建'`（两意图并存）→ `'inspect-first'`。设计意图是**保守倾向先检查**——宁可误报检查，也不轻易跳到实现。`'neutral'` 不注入任何文字（`applyRoutingToAssembly` 直接返回原 assembled，`router.mjs:71`）。

**`resolveMode(strategy, session)`**（`router.mjs:65-68`）：固定策略 `inspect-first` / `direct` 直接返回；`auto` 才跑分类器。即"配置里写死 inspect-first 就一直接管，分类器只对 auto 生效"——这给运维一个**逃生口**。

### 2.3 Prompt 注入（"路由"二字真正发生的地方）

`applyRoutingToAssembly(assembled, mode)`（`router.mjs:70-75`）：
```js
const GUIDANCE = {
  'inspect-first': 'Routing guidance: this is a maintenance or investigation task. '
                 + 'Inspect the relevant facts first, identify the root cause, '
                 + 'then make the smallest justified change and verify it.',
  direct:          'Routing guidance: this is a creation or implementation task. '
                 + 'Move directly toward a usable result, keep the design proportional, '
                 + 'and verify the finished behavior.',
}
// 注入逻辑
if (mode === 'neutral' || !GUIDANCE[mode] || !Array.isArray(assembled?.sections)) return assembled
const sections = assembled.sections.filter(s => s?.name !== ROUTING_SECTION)
sections.push({ name: ROUTING_SECTION, text: GUIDANCE[mode], order: 10 })
return { ...assembled, sections }
```

三条**非破坏性**约束（也是它的卖点）：

1. **只增不改**：filter 掉旧的 `routing-suite-guidance` 同名段（防止 reapply 重复堆），再 push 一段新的；persona/contexts/tools/其它 sections 全部原样保留（`router.mjs:72-74`，对应 `router.test.mjs:51-63` 的 "preserves existing persona, contexts, tools, and other fields"）。
2. **装配幂等**：同一 session 内多次触发 `system-prompt/assemble`（典型场景：每次 compaction/plan-mode 切换），最终 routing section 只有 1 条（`router.test.mjs:71-76` 的 "reapplying routing replaces only its own section"）。
3. **no-op 安全**：`mode === 'neutral'`、`!GUIDANCE[mode]`、`!Array.isArray(assembled?.sections)` 任意一条命中即原样返回 assembled（`router.mjs:71`）。

注意：`AGENTS.md`（项目级 AGENTS.md，`AGENTS.md:1-10`）是**给贡献者**的工程约束（不要加 install lifecycle、不要破坏已有 prompt sections、UI 只读、本地化要跟主语言走等），**不是**路由提示词本身——后者只活在 `router.mjs:18-21` 的 GUIDANCE 常量里。

### 2.4 预设装载与 cordis.patch.yml

`cordis.patch.yml` 仅 7 行（`cordis.patch.yml:1-7`）：
```yaml
- insert:
    - id: dsh-routing-suite
      name: dsh-routing-suite
      config:
        enabled: true
        strategy: auto
```
含义：在宿主 patch 层插入一条名为 `dsh-routing-suite` 的 bundle 配置，**默认启用 + auto 策略**。这是 Host 插件在宿主配置树的落地物；真正的"模式菜单项"来自 `dsh.desktop.presets`（`package.json:62-69`）。

`preset/routing-suite/preset.yml`（3 行）：
```yaml
name: 智能路由模式
description: 保留标准模式的完整能力，并根据任务自动选择先检查根因或直接执行。
order: 5
```
`order: 5` 决定它在模式菜单里的相对位置。

`preset/routing-suite/agent.cordis.yml`（251 行）**完整复用** DeepSeek Harness 上游 Standard preset：persona、bash/pwsh、fs + fs-search、jobs、skill-filesystem、tool-skill、goal、plan-mode（含 `exit_plan_mode` plan_mode section）、compaction（compaction-basic + command-compact + tool-result-pruner）、delegation（subagent-control、subagent-list-agents、subagent/spawn、subagent/fork、subagent/codex/disabled、subagent/claude-code/disabled、workflow-worker-thread、tool-workflow、tool-ralph）、tool-ask-user、tool-todo（`allowParallelInProgress: true`）、tool-web（`fetch: false, searchTimeoutMs: 60000`）。**这是它能交付"完整 Standard 能力"的物理基础**——Host 插件本身只是给 system prompt 加一句话，没注册任何新工具。

**钉 SHA256 防漂移**：`scripts/verify-package.mjs:41-44` 显式断言 `presetCompositionSHA256 = 'cb98756a9ed76ca351a45a0ba138a97bf0ab7eead4fe2f1e9d1c9f9ec97937f0'`。这意味着如果上游 Standard 改了，本仓库必须同步更新 + 重新审计，不存在"默默漂移"路径。`package-contract.test.mjs:27-30` 也交叉验证 `agent.cordis.yml` 含 `dsh-tool-fs` / `dsh-tool-subagent`、`preset.yml` 含 `name: 智能路由模式` / `order: 5`。

### 2.5 客户端（React 只读卡片）

`src/client/index.ts:14-49` 的 `copy` 是中/英文案字典，包含 `tab / title / loading / unavailable / enabled / disabled / current / scope / auto / inspect / direct / autoHelp / inspectHelp / directHelp / safety` 共 15 键 × 2 语言。`text()`（`client/index.ts:51-54`）读 `navigator.languages[0] || navigator.language`，lowercase 后匹配 `zh-cn` 或 `zh-hans*` → 中文，否则英文。**关键设计**：无任何 input/button/POST/interval（`test/package-contract.test.mjs:47` 显式断言 `doesNotMatch(client, /method:\s*['"]POST|createElement\(['"](?:button|input)['"]\)|setInterval/)`）。

`RoutingSuiteSection`（`client/index.ts:75-119`）是一个标准的 React function component：useState 三态 `{loading, ready, error}`、useEffect 调 `fetch('/routing-suite/api/status')` 拉一次状态（AbortController 防卸载泄漏，91-92）、渲染 `<style>` + `<h3>` + status 卡片 + 三张策略说明卡（active 类对应当前 strategy）+ safety 注脚。CSS（`client/index.ts:58-69`）使用宿主变量 `var(--dsw-alias-*)`。

`apply(ctx)`（`client/index.ts:121-128`）：在 `settings.section` 槽位注册一个 id `routing-suite-status`、order 50 的只读面板，label 是 `text().tab`（中文"智能路由"/英文"Smart routing"）。

### 2.6 编译/打包/Verify 三件套

`tsdown.config.ts:11-46` 双产物策略：
- **Host**：entry `src/index.ts` → `lib/index.js`（ESM, Node 平台, schemastery neverBundle）；
- **Client**：entry `src/client/index.ts` → `lib/client.js`（**CJS**, browser 平台, React/DSH client 三个包 externals, 用 banner+footer 包裹成 `window.__ModuleLoader__.load({ id, factory })` 注入宿主加载链）。

`scripts/verify-package.mjs:1-170` 是本插件最值得借鉴的工程纪律——**端到端白盒 verify**：
1. 读 manifest/cordis.patch/preset，做结构断言；
2. 钉 SHA256 防 Standard preset 漂移（41-44）；
3. **模拟宿主 ctx** 调 `built.apply({on, effect, webServer}, {enabled, strategy})` 取出 handler（96-104）；
4. 构造真实 session `{header:{agentPreset:'routing-suite'}, events:[{type:'user/message', data:{source:{kind:'user'}, content:[{type:'text', text:'修复这个错误'}]}}]}` 走一次 `assemble(undefined, context, next)`，断言末尾 section 是 `routing-suite-guidance` 且原 sections/contexts/tools 全部未被改（108-118）；
5. 断言 `agentPreset:'standard'` 的 session **完全透传**不注入（119-126）；
6. 断言"latest preset selection"——切到 routing-suite 后立即生效（127-134）；
7. 模拟 GET `/status` 调 statusHandler 校验响应字段（135-141）；
8. `npm pack --dry-run --ignore-scripts` 跑真实打包，对比精确 file 白名单（143-167）。

## 3. 对本项目（AGE）的可用模式（Adopt/Adapt/Reject）

AGE（Autonomy / Age-Autonomy）的核心定位是 Node 端 CLI/进程，由 missions/\*.json + docs/plans/\*.md 等 git 文件驱动，**不**依赖 DSH 这种宿主。本节筛选**模式层面**的可借鉴项，**而非代码层面**。

| # | 模式 | 判定 | 映射与理由 |
| --- | --- | --- | --- |
| 1 | **"中间件式" prompt 装配钩子**（`ctx.on('system-prompt/assemble', async (_, ctx, next) => { const r = await next(); …r })`） | **Adopt** | AGE 不直接拼 system prompt（它驱动外部 agent）；但**任何"在已有结构末尾追加一段、按幂等键去重、不破坏其它键"**的需求，都可镜像这一中间件写法。关键纪律是 await next() 拿下游、`{…spread}` 保留所有原字段、filter+push 维持 idempotent。 |
| 2 | **"session header + 倒序扫 events"双轨判定当前 preset/模式** | **Adapt** | AGE 的 `currentMode` 等价判定（用户在 mission JSON 里写明 vs 当前 git HEAD 的模式）可参考"先看显式声明、再 fallback 默认"的双轨结构。倒序扫以最新事件为准的语义适用于"用户在交互式 session 内切换上下文"。 |
| 3 | **"保守倾向"分类器**（意图 > 建造 > 症状 > 中性） | **Adopt** | 当 AGE 要根据首条任务/PLAN 自动选 workflow（plan-first vs build-first），可复用 `intent > action > symptom > neutral` 的判定层级与"宁可误报检查，也不轻易跳到实现"的设计直觉。`router.mjs:53-63` 的代码即一份完整 spec。 |
| 4 | **固定策略逃生口**（`strategy === 'inspect-first' \|\| 'direct'` 直接返回，跳过分类器，`router.mjs:65-68`） | **Adopt** | 给运维/高级用户一个**绕开自动判定**的入口。AGE 若加 workflow 自动选择，配置文件必须提供 `mode: auto | inspect-first | direct | …` 同款分流。 |
| 5 | **3 文件钉校验防漂移**（`scripts/verify-package.mjs:41-44` 钉 SHA256、断言 preset 内容 grep 关键 id） | **Adopt** | 借鉴到 AGE：`scripts/verify-package.mjs` 的 170 行端到端 verify 模板（载入构建产物 + 模拟 ctx + 跑 round-trip + 钉关键 hash）是任何"轻量发布插件"项目的标配。**本项目若外发 npm 插件必抄**。 |
| 6 | **"正向能力只来自被继承的 preset，自身零注册工具"** | **Adopt-lite** | AGE 的 mission-driver 不注册 DSH 工具，但可借鉴"插件本身的能力面 = 它所复用/继承的上游能力的子集，自身越轻越好"——保证可审计、可回滚、可降级。本插件全部 350 行源码 + 0 工具注册 + 0 文件 IO + 0 网络 IO 是极致样板。 |
| 7 | **`source.kind !== 'user'` 跳过机制**（首条任务抽取时显式排除插件/工具冒充的 user，`router.mjs:46`） | **Adapt** | AGE 的"读取用户输入"必须区分人类 vs 自动化注入；同理 commit-msg 自动追加、CI hook 写入都应被标记为非人类，避免污染自动判定。 |
| 8 | **三种本地化策略**（`zh-CN/zh-Hans*` → 中文，否则英文，`client/index.ts:51-54`） | **Adapt** | 与 AGE 国际化策略一致：用最低成本的 primary-locale 判定而非完整 i18n 库。**只读面板**场景下尤其合适。 |
| 9 | **双产物 tsdown 打包 + `__ModuleLoader__.load()` banner/footer 注入**（`tsdown.config.ts:26-46`） | **Reject（场景不匹配）** | DSH 专属客户端注入协议，AGE 不消费 DSH 客户端 seam，无需照搬；但"Node host + browser client 双产物 + externals 列表"的**形态**值得学习。 |
| 10 | **"完整复用上游 Standard preset"的合规化模式** | **Reject（不适用）** | AGE 不消费 DSH preset seam；但若未来要借鉴上游某大型 prompt 模板，**SHA256 钉 + LICENSES/ + THIRD_PARTY_NOTICES.md + ACKNOWLEDGEMENTS.md + SOURCE_PROVENANCE.md 五件套**是合规重分发的最小样板——本插件这一套做得很完整。 |
| 11 | **其"智能路由"语义本身（先检查 vs 直接做）** | **Reject（不照搬产品语义）** | AGE 已有自己的 mission/plan 语义；不要因为它叫"routing"就在 AGE 里复制 inspect-first/direct 二分——那是 prompt 偏好，不是工作流决策。 |

## 4. 风险与不适用面

1. **作用面非常窄**：单文件 75 行分类器只覆盖 13+3+10=26 个中/英意图关键词，长尾任务一律 `neutral`（不注入任何东西）。`router.test.mjs:25-29` 自身断言 `'今天天气怎么样'` → `'neutral'`。**任何期待"AI 自适应分诊"的产品不要直接用**——它的本质是关键词正则，不是 ML 分类器。
2. **不接 provider 路由**：曾有读者（与同名插件混淆）期望它能根据任务自动切换 DeepSeek-V3 / R1 / 其他模型——**做不到**。它的全部"路由"在 prompt 段尾追加一句话，影响模型风格但不改变 token 上报、不改变 endpoint。
3. **完全继承 Standard 工具面 = 完全继承 Standard 风险面**：fs / bash / subagent / ralph / workflow 全开（`preset/routing-suite/agent.cordis.yml:44-251`），本插件自身不引入额外风险，但也不收敛任何 Standard 的能力。若你只要"轻量只读模式"，不能用这个 preset——直接给一个空 agent 模式更安全。
4. **preset 物料钉 SHA256 = 上游改了我必须跟着改**：`scripts/verify-package.mjs:41-44` 的 SHA256 是上游 DeepSeek Harness 某次 commit 的指纹。DSH 升级 Standard 时，本插件必须同步更新 preset 内容并重新审计。**维护成本存在，但被显式化**——这是优点（不漂移）也是缺点（不能跟最新）。
5. **CLI-only 用户要多一步手工**：`README.md:33-40` 自述："DSH's plugin command does not currently materialize package-declared user presets. CLI-only users must additionally copy this package's `preset/routing-suite` directory to `${DSH_HOME:-$HOME/.dsh}/.agent-presets/routing-suite`"——这是 host 的现状而非本插件的责任，但接入门槛客观存在。
6. **首条任务判定无法跨会话累积**：每次 `system-prompt/assemble` 都跑 `firstUserText`，会话切走再回来仍是会话内首条，不做跨会话"长期用户偏好"建模——这是它的克制，也是限制。
7. **客户端只读 = 0 配置项**：UI 只读，配置在宿主 bundle 层管理（`cordis.patch.yml`）。用户不能在 settings 面板里切换 `strategy`——这个面板只是把 status 端点的 `{enabled, strategy}` 渲染出来。`test/package-contract.test.mjs:47` 显式断言没有 button/input。
8. **本仓库与同名 yjh051108/dsh-routing-suite 命名相同**——评估/引用时务必区分；本仓库的 runtime 比 yjh 版小一个数量级，能力面不同。
9. **本项目（AGE）的真正不适用面**：AGE 是 Node 端 CLI 进程，无 Cordis 宿主、无 React 客户端、无 system-prompt/assemble 钩子——本插件的**所有 seam** 都用不上。价值全部在模式层（§3），代码层不可复用。

## 5. 关键源码索引

| 主题 | 位置 |
| --- | --- |
| 宿主入口：`inject: ['systemPrompt','webServer']` | `src/index.ts:5` |
| Config Schemastery schema（enabled/strategy） | `src/index.ts:27-30` |
| `selectedPreset(session)` 倒序扫 events + header fallback | `src/index.ts:9-18` |
| `ctx.on('system-prompt/assemble', …)` 中间件 + 两层守门 | `src/index.ts:36-42` |
| `webServer.register('/routing-suite/api')` 只读 status | `src/index.ts:44-59` |
| 三类关键词正则（意图/症状/建造） | `src/router.mjs:3-16` |
| GUIDANCE 常量（inspect-first/direct 各一句） | `src/router.mjs:18-21` |
| `score(text, patterns)` 命中数求和 | `src/router.mjs:23-27` |
| `extractText(data)` 容错 flat/nested/string | `src/router.mjs:29-37` |
| `firstUserText(session)` 跳过 plugin-source | `src/router.mjs:39-51` |
| `classifyTask(text)` 优先级 intent>direct>symptom>neutral | `src/router.mjs:53-63` |
| `resolveMode(strategy, session)` 固定策略逃生口 | `src/router.mjs:65-68` |
| `applyRoutingToAssembly(assembled, mode)` 幂等 filter+push | `src/router.mjs:70-75` |
| 类型声明（RoutingMode/RoutingStrategy） | `src/router.d.mts:1-8` |
| Client 文案字典 zh-CN/en | `src/client/index.ts:14-49` |
| `text()` primary-locale 判定（zh-CN/zh-Hans* vs en） | `src/client/index.ts:51-54` |
| 内联 CSS（`.drs-page`/`.drs-status`/`.drs-card.active`） | `src/client/index.ts:58-69` |
| `RoutingSuiteSection()` useState/useEffect/fetch + 三张策略卡 | `src/client/index.ts:75-119` |
| `apply(ctx)` slots.inject('settings.section', …) | `src/client/index.ts:121-128` |
| cordis.patch 7 行 insert bundle | `cordis.patch.yml:1-7` |
| Preset 元数据（name 智能路由模式 / order:5） | `preset/routing-suite/preset.yml:1-3` |
| Standard preset 完整组合（251 行 = 上游 MIT） | `preset/routing-suite/agent.cordis.yml:1-251` |
| Plan-mode section（含 exit_plan_mode 完整规则） | `preset/routing-suite/agent.cordis.yml:104-124` |
| Compaction 隔离 + tool-result-pruner 8192/4096/1024 | `preset/routing-suite/agent.cordis.yml:137-156` |
| Delegation 隔离 + ralph(64 rounds) + workflow + spawn/fork | `preset/routing-suite/agent.cordis.yml:174-234` |
| tool-web fetch:false / searchTimeoutMs:60000 | `preset/routing-suite/agent.cordis.yml:247-251` |
| package.json dsh.bundle.patch + dsh.client.inject + dsh.desktop.presets | `package.json:50-69` |
| Schemastery 单一依赖 + 零 install/postinstall | `package.json:79-89`、`test/package-contract.test.mjs:14-23` |
| 分类器 + assembly 注入 + 幂等覆盖 + 中性 no-op 测试 | `test/router.test.mjs:12-76` |
| "preserves existing persona, contexts, tools" 关键保证 | `test/router.test.mjs:51-63` |
| "routing remains stable on the first real durable user task" 跳过 plugin-source | `test/router.test.mjs:39-49` |
| 宿主禁能力反向白盒（无 fs/exec/junction/llm） | `test/package-contract.test.mjs:33-41` |
| 客户端只读白盒（无 button/input/POST/interval） | `test/package-contract.test.mjs:43-54` |
| tarball 白名单 + Standard preset SHA256 钉死 + __ModuleLoader__ 模拟装载 + 真实 round-trip 装配 | `scripts/verify-package.mjs:11-167`（重点 41-44、96-141、143-167） |
| tsdown 双产物 + __ModuleLoader__.load() banner/footer | `tsdown.config.ts:1-46` |
| 与 yjh/dsh-super-injector / dsh-router-standard 边界声明 | `SOURCE_PROVENANCE.md:9-13` |
| AGENTS.md 是工程约束而非路由提示词（路由词在 router.mjs GUIDANCE） | `AGENTS.md:1-10` vs `src/router.mjs:18-21` |
| 自我声明"不增加额外 LLM 请求" | `README.md:21`、`src/client/index.ts:30/47` |

未读备查：`LICENSE`、`LICENSES/*`（仅 README/`verify-package.mjs:13-14` 提到 `LICENSES/DeepSeek-Harness-MIT.txt`）、`THIRD_PARTY_NOTICES.md` 全文、`package-lock.json`、`test/router.test.mjs` 与 `test/package-contract.test.mjs` **未运行**（脚本本身已完整阅读）、构建产物 `lib/`（被 `verify-package.mjs` 动态 import，本地未独立打开）。本文涉及上述的结论均已标注。