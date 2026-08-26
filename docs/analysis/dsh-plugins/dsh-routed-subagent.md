# dsh-routed-subagent 调研报告（dsh-plugins）

> | 项 | 值 | 依据 |
> | --- | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-routed-subagent/`（`/Users/abc/ai/dsh-plugins/dsh-routed-subagent`） | 本地目录 |
> | 来源 repo | `https://github.com/bpc-oss/dsh-routed-subagent.git`（README:42-49；非 npm 包，仅 GitHub 分发） | `README.md:42-49`；`package.json:41-46` |
> | stars | 任务未给出；本次未做 web 检索核实 | — |
> | 语言 | 纯 ESM JavaScript（`"type":"module"`，`"main":"lib/index.js"`），零构建步骤（`scripts.build` 仅 echo）；Node ≥ 22（`package.json:5-7,19-21`） | `package.json:1-26` |
> | license | MIT | `LICENSE`、`package.json:8` |
> | 版本/兼容 | v0.3.0；`peerDependencies` 钉 `@deepseek-ai/*` 全家桶到 `^0.1.0-rc.7`（agent / agent-presets / llm / session / subagent / subprocess / tools），外加可选 `@anthropic-ai/claude-agent-sdk:*`（声明 optional，`peerDependenciesMeta:37-39`）；README 自述对 rc.7 源码核实 + rc.8 运行时验证（README:51-52） | `package.json:26-40`；`README.md:51-52` |
> | 测试/CI | 无单测框架；`scripts/smoke.mjs`（136 行）通过 mock `ctx.subagents/jobs/agentPresets` 验证 apply + tool 形状 + 边界；`.github/workflows/ci.yml` 跑 `node --check` + npm install 官方 peers + smoke + 机器路径/密钥 guard（ci.yml:14-58）；本次未运行 | `scripts/smoke.mjs`；`.github/workflows/ci.yml` |
> | 宿主 API 面 | host 侧 `apply(ctx, config)`：注册 5 个 subagent provider（`routed-mount` / `routed-fork` / `routed-claude` / `routed-codex` / `routed-codebuddy`），定义 1 个工具 `subagent_routed`（含 background / foreground / fork / continuable 四形态），挂 1 个 `tools.guard` 屏蔽 `subagent` / `subagent_fork`；声明 `inject: ['subagents','agentPresets','tools']`（`lib/index.js:57`） | `lib/index.js:57,242-683`；`cordis.patch.yml:1-9` |
>
> 行号约定：以 `lib/index.js`、`lib/engines/*.js`、`scripts/*.mjs` 为准。**未读部分**：`scripts/probe-cb-engine.mjs`、`scripts/repro-codex-isolation.mjs`（仅 grep 路径，未读源码）；`.github/workflows/ci.yml` 仅读头部；`node_modules/`（按约束跳过）。文中涉及未读脚本的结论以"未读"标注。

## 1. 定位

一句话：**全局委派路由插件**——给 DSH 注册 1 个工具 `subagent_routed`，从**任何会话**派发子代理，让子代理**完整挂载到调用方指定的任意 agent preset**（含 persona、prompt sections、skill catalog、tools），同时支持**按次指定 model/provider** 和**模型可用性预检**；并把外部 CLI agent（codex / claude / codebuddy）作为可切换的"engine"挂到同一个工具入口下，提供后台 job / live progress / kill / continuable 一致语义（README:6-19,22-30）。

**核心差异化能力**：破解"stock subagent 强制子代理继承父 preset"的限制。官方 `subagent` / `subagent_fork` 在子代理 setup 窗口里 `composeFrom` 父方，导致子代理的 persona / tools 跟父跑。本插件通过自定义 subagent provider，让 setup 变 `async`，调用 `agentPresets.mount(childCtx, <targetPreset>)`——子代理的 scope chain **绑定到目标 preset 的 standing mount**，获得该 preset 的完整组装（README:8-10；`lib/index.js:7-33,291-308`）。

**与同仓库其他插件的关系**：与 `dsh-agent-relay`（递送已有产物）、`dsh-agent-teams`（多 Agent 团队）、`dsh-automation`（自动化）定位不同——本插件是**委派路由器**而非编排器，只解决"派谁、按什么 preset、跑什么模型"的路由问题，不写编排 DSL 也不做持久化运行图。`features` 表（README:13-19）几乎每一条都对应"覆盖 stock 的某一项"——这是**单点能力替代/扩展**型插件。

**continuable 模式依赖平台补丁**：`continuable: true` + preset 挂载要求对官方 `@deepseek-ai/dsh-subagent` 做**纯增量补丁**（`applyChildComposition` 的 preset 字段、`materializeTracked` async setup、continuable descriptor v2→v3、`coldResume` 重建同一 preset），并通过安装级 `node_modules` junction 强制模块身份唯一；`apply()` 启动时断言补丁已生效（`assertSubagentPatchApplied`，`lib/index.js:231-240,345`），未生效只 warn——但 README 明示**失败时不降级**，只是日志输出需自检（README:136-142）。这意味着本插件在标准 DSH 安装下**只有 one-shot / fork / 外部引擎的 continuable 可用，dsh 引擎的 preset-continuable 需要补丁安装**。

## 2. 架构与机制（源码级）

### 2.1 组件图（ASCII）

```
                      DSH host plane (cordis bundle: dsh-routed-subagent)
                                   │
                                   ▼
                  ┌─────────────────────────────────────┐
                  │  apply(ctx, config)                 │
                  │  inject: [subagents, agentPresets,  │
                  │           tools]                    │
                  └────────────────┬────────────────────┘
                                   │
        ┌──────────────┬───────────┼────────────────┬──────────────────┐
        ▼              ▼           ▼                ▼                  ▼
 ┌─────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐ ┌──────────────┐
 │ routed-     │ │ routed-    │ │ routed-    │ │ routed-codex │ │ routed-      │
 │ mount       │ │ fork       │ │ claude     │ │              │ │ codebuddy    │
 │ (dsh engine)│ │ (dsh fork) │ │ (engine:   │ │ (engine:     │ │ (engine:     │
 │ preset-only │ │ parent ctx │ │  claude)   │ │  codex)      │ │  codebuddy)  │
 │ one-shot    │ │ + preset)  │ │ SDK/CLI    │ │ app-server   │ │ --print      │
 └──────┬──────┘ └──────┬─────┘ │ external   │ │ stdio wire   │ │ NDJSON       │
        │               │       └──────┬──────┘ └──────┬───────┘ └──────┬───────┘
        │               │              │              │               │
        └───────────────┴──┐           │              │               │
                           ▼           ▼              ▼               ▼
                ┌───────────────────────────────────────────────────────────┐
                │            subagent_routed 工具定义（ctx.tools.register） │
                │  - 解析 args → engine 路由                                 │
                │  - dsh: agentPresets.resolve() 校验 preset               │
                │  - per-call: model/provider → resolveChildAgentOptions   │
                │  - 预检: llm.resolveModelInfo / llm.listModels            │
                │  - 形态分发: background(Job) / foreground / continuable   │
                │      →  dsh: subagents.start / startContinuable           │
                │      →  外部: provider.start / provider.prepareContinuable│
                └─────────────┬─────────────────────────────────────────────┘
                              │
              ┌───────────────┼─────────────────────────┐
              ▼               ▼                         ▼
   ┌──────────────────┐ ┌──────────────┐    ┌──────────────────────┐
   │ ctx.jobs.start   │ │ ctx.subagents│    │ registerExternalCont.│
   │ (background)     │ │ .start (fg)  │    │ (continuable external│
   │   readOutput hook│ │   + dispose  │    │  → send_message 路由) │
   │   cancel         │ │ 2 段 settle  │    │  ⏳ 需 patched       │
   │   done           │ │  (result →   │    │     dsh-subagent      │
   └──────────────────┘ │   dispose)   │    └──────────────────────┘
                        └──────────────┘
                              │
                              ▼
                ┌──────────────────────────────────┐
                │  tools.guard                     │
                │  (exec.name === 'subagent'|'     │
                │   subagent_fork') 拒绝 + 引导    │
                └──────────────────────────────────┘
```

### 2.2 按次 override 流程（核心机制）

`subagent_routed.execute(args, exec)` 的处理流水线（`lib/index.js:435-664`）：

1. **engine 路由**（`lib/index.js:443-459`）：先判定 `engine ∈ {claude, codex, codebuddy}` 三选一或默认 `dsh`；外部 engine 下 `preset` 是可选且被忽略（外部 CLI 不认 preset 概念），`dsh` engine 下 `preset` 必填且先用 `agentPresets.resolve(args.preset)` 做**前端校验**——失败抛错，错误信息透传 roster 可用 id（`lib/index.js:453-459`）。
2. **构造 agentOptions**（`lib/index.js:464-472`）：把 `provider` / `model` / `max_tokens` 三个字段按定义累加成 `agentOptions`；`max_tokens` 必须是正整数，否则工具层 throw。
3. **模型预检**（`lib/index.js:483-505`）：仅当 (a) engine 是 `dsh`（外部 engine 跳过预检——它们的模型由 CLI 自身路由），且 (b) `model` 或 `provider` 任一被显式覆盖——才走 `ctx.get('llm').resolveModelInfo(provider, model)`。失败时**fallback 拉取 `listModels(provider)`**拼出可用列表，抛错时把原始错误挂在 `Error.cause`——既给候选清单、也保留真实失败原因（README:110-111 的承诺在此兑现）。
4. **构造 request**（`lib/index.js:517-534`）：根据 engine 把 `preset` / `agentOptions` / `maxDepth` / `toolFilter` / `cwd` / `timeoutMs` 拼到统一请求形状；外部 engine 自动加 `cwd`（`request.cwd ?? parent.session.header.cwd ?? config.cwd`）和 `timeoutMs`，**不要 `maxDepth`**——外部 engine 自己管递归预算。
5. **dispatch provider 选择**（`lib/index.js:510-516`）：`claude → routed-claude`；`codex → routed-codex`；`codebuddy → routed-codebuddy`；`fork ? routed-fork : routed-mount`。
6. **三形态分支**：
   - **continuable**（`lib/index.js:536-572`）：外部 engine 走 `provider.prepareContinuable(request)` → 注册到 `registerExternalContinuation(sessionId, resume)`，返回 `kind:'continuable'` + `subagentId`；dsh engine 走 `subagents.startContinuable({provider, request, signal})`——后者依赖 patched dsh-subagent 提供 `startContinuable`。
   - **background**（`lib/index.js:574-621`）：`ctx.jobs.start({kind:'subagent', owner: parent, run: () => {...}})` 返回 `jobId`；run 内部用一个**独立 AbortController**（`lib/index.js:595`），保证**主对话 abort 不取消子代理**；暴露 `readOutput` hook 供 `job_output` 拉取实时进度（`liveProgress` 或外部 `run.readOutput`），暴露 `cancel` 供 `job_kill` 调。
   - **foreground**（`lib/index.js:623-663`）：`await ctx.subagents.start(...)` 同步返回 run；**两段 fault-tolerant 收尾**——`Promise.allSettled([run.result.then(r => ({result:r}))])` 拿 result，然后 `Promise.allSettled([run.dispose()])`——README 警告**绝不能并行**，并行会让 dispose 的 cancelled flag 抢先，导致子代理一启动就 aborted（README:118-122；`lib/index.js:624-642`）。
7. **失败语义对齐**（`lib/index.js:644-653`）：stopReason ∈ {`error`, `refusal`, `max-tokens`} → **throw**（附 partial output）；只有 `completed` 和调用方引发的 `aborted` 作为返回值。

### 2.3 自定义 provider：`routed-mount` / `routed-fork`

两者共享 `makeProvider(pname, inheritsParentContext)` 工厂（`lib/index.js:255-337`），关键差异：`inheritsParentContext` 决定是否把父对话的 completed turns 作为 seed 传入（`fork` 即 fork）。`capabilities` 只声明 `toolFilter` 和 `depthLimit`，**persona 显式 false**——child 的 persona 来自被挂载的 preset，不是按次覆盖（README / `lib/index.js:265-273`）。

`start(request)` 流水线（`lib/index.js:274-330`）：

```
1. assertSubagentMaxDepth(request.maxDepth)             # 平台递归预算校验
2. captureDelegatedPolicyOverrides(parent)               # 父 delegation 政策快照
3. seed = inheritsParentContext
   ? completedTurnPrefix(parent)                         # fork: 父已完成 turns
   : []                                                  # one-shot: 空
4. boundary = seed.length                                # 折叠边界，防 seed 污染
5. setup = async (childCtx) =>
     appendDelegatedPolicyOverrides(childCtx.session, inherited)
     await agentPresets.mount(childCtx, targetPreset)    # ★ 唯一关键行
     if toolFilter: childCtx.tools.restrict({deny})
     childCtx.systemPrompt.context({subagent:delegation, order:120, ...})
     if descriptor: attachDescriptorAppend(...)
7. return drivePresetRun(
   await parent.ctx.agents.create({
     sessionId: childId,
     meta: { ...childSessionMeta(parent, childDepth, boundary), agentPreset: targetPreset },
     ...(boundary > 0 ? { seed } : {}),
     agentOptions: resolveChildAgentOptions(parent, request.agentOptions, childDepth),
     signal, setup,
   }),
   signal, prompt, childId, boundary,
)
```

要点：
- **`agentPreset: targetPreset` 覆盖**（`lib/index.js:319`）：`childSessionMeta` 默认记父方 preset；这里**显式覆盖**为目标 preset，否则 cold read 会按父组装重建（README:121-122）。
- **`activationBoundary = seed.length`**（`lib/index.js:319`）：fork seed 的事件被排除在 child 自身工作折叠之外——子代理若被取消，不会把父的最后一轮 `turn/end` 算成自己的完成。
- **`resolveChildAgentOptions(parent, request.agentOptions, childDepth)`**（`lib/index.js:321`）：**官方通道**——请求的 agentOptions 在 parent defaults 上后展开（lib/index.js:461-463 注释），所以一次调用给的 model/provider 一定胜过父方；这是按次 override 的实现位点。
- **`drivePresetRun` 两阶段收尾**（`lib/index.js:91-122`）：订阅 signal → abort 时 `child.cancel({kind:'parent'})`；`followup(createUserMessage(...))` + `await child.whenIdle()`；`readPresetResult` 用 `foldConsumedWork(own).end` 拿 stop reason；`dispose()` 仍先 removeEventListener 再 set cancelled flag——和主路径一致，避免 cancelled 抢先。

### 2.4 模型预检逻辑（细节）

唯一实现位：`lib/index.js:483-505`。**前置条件三重**：
- `engine ∉ {claude, codex, codebuddy}`（外部 CLI 跳过预检）
- `agentOptions.model !== undefined || agentOptions.provider !== undefined`（provider-only override 也走预检——父 model 在新 provider 下几乎必然无效，README:127-129）
- `ctx.get('llm') !== undefined && typeof llm.resolveModelInfo === 'function' && provider !== undefined && model !== undefined`

预检通过直接 dispatch；失败 throw 一个 Error：
- message 包含：`"model \"<shown>\" is not available under provider \"<provider>\"; available models under <provider>: <list>. Pass provider=... to use another provider."`
- `cause` 字段 = 原始 `resolveModelInfo` 抛的 error（保留 provider outage vs. 真正未知模型 的区分）

**失败时不降级到旁路**——直接抛 → 调用方拿到完整候选清单 + 原始错误（README:16-17,110-111,128-129；README 自述"fail fast"）。

### 2.5 外部 CLI engine 路由

`dispatchProvider` 选择（`lib/index.js:510-516`）后，外部 engine 走三个独立 class：`ClaudeEngineProvider` / `CodexEngineProvider` / `CodebuddyEngineProvider`，统一实现 `start(request)` 返回 `{id, localAgent, readOutput, result, dispose}`（`lib/engines/codex.js:333-339`；`claude.js:140-147`；`codebuddy.js:169-176`），让 background/foreground 通用层能统一对待；以及 `prepareContinuable(request)` 返回 `{seed, sessionId, resume}` 给 `registerExternalContinuation` 注册（`codex.js:415`；`claude.js:177`；`codebuddy.js:194`）。

#### 2.5.1 codex engine（`lib/engines/codex.js`）

- **wire 进程模型**：每次 run 启**独立的 `codex app-server --stdio` 子进程**（`_newWire`，`codex.js:203-214`），原因：codex 的 `item/agentMessage/delta` 通知**不带 turn/thread id**，shared wire 会把多个 run 的输出混到一起；独立进程 = 物理隔离（`codex.js:196-203` 注释）。
- **binary 发现**：env `CODEX_BIN` > npm 全局根 (`npm root -g`) > APPDATA/npm 漫游根；最终用 `node <bin>` 调 `.js` 入口，原生 `.exe`/`.bat` 直接 spawn（`codex.js:31-41,60-75`）。
- **turn 生命周期**：`thread/start {workspace, cwd, model, config: {approval_policy}, customInstructions, isHidden}` → `turn/start {threadId, input, silent}`（`codex.js:243-266`）；无人值守默认 `approval_policy: 'never'`（`codex.js:247`）；显式 `model` 由 thread/start 传入（`codex.js:252`）。
- **进度来源**：订阅 `item/agentMessage/delta` + `item/completed.agentMessage` 累加 delta → progress buffer（`codex.js:364-367`）；buffer 20k 字截断（`codex.js:43,227-230`）。
- **kill**：`turn/interrupt {threadId, turnId}` 之后再 SIGTERM 进程；1200ms 后 SIGKILL 强收（`codex.js:320-326,156-175`）。
- **continuable**：`thread/start` 即在 codex 端持久化 thread 到磁盘（jsonl）；sessionId 格式 `codex:<threadId>`（`codex.js:413-415`）；后续 `_resume` 用同一 threadId 再发 `turn/start`——codex 的磁盘 thread 承担持久化职责（`codex.js:422-459`）。**核心优势**：同进程模型切换不影响 continuable——codex 进程死了不影响磁盘 thread。
- **wire 死亡处理**：`onExit` hook 让等待中的 turn 立即以 `aborted` settle，不挂到 30 分钟 timeout（`codex.js:380-389`）。

#### 2.5.2 claude engine（`lib/engines/claude.js`）

- **SDK 加载**：懒加载 `@anthropic-ai/claude-agent-sdk`，未安装报错并指导 `npm install -g`（`claude.js:13-23`）。
- **SDK 选项**：透传 `model / maxTurns / cwd / env / permissionMode / abortController / sessionId / resume / persistSession / includePartialMessages`（`claude.js:62-82`）。
- **无人值守守卫**：`onElicitation → decline`、`onUserDialog → cancelled`、`canUseTool → deny`（`claude.js:75-77`）——外部 unattended subagent 不能弹 UI。
- **进度来源**：消费 async iterable，捕获 `stream_event.content` / `assistant.message.content` 到 `progress.text`（`claude.js:103-122`）。
- **kill**：`controller.abort()` + `q.close()`（`claude.js:134-138`）。
- **continuable**：`prepareContinuable` 启动首轮 → SDK sessionId 落盘 → `resume(sessionId, ...)` 续话（`claude.js:155-178`）。⚠️ README 警告：**continuable 仅在 Anthropic 官方 API 下可靠**，自定义 `AnthropicBaseURL` 时 `sessionId + persistSession` 可能卡死（README:45-46）。

#### 2.5.3 codebuddy engine（`lib/engines/codebuddy.js`）

- **spawn 模型**：`codebuddy --print --output-format stream-json --include-partial-messages --dangerously-skip-permissions [--model M] [--session-id U|--resume U] <prompt>`（`codebuddy.js:66-87`）。
- **进度来源**：NDJSON `stream_event → content_block_delta → text_delta`（`codebuddy.js:113-117`）。
- **kill**：SIGTERM → 1500ms 后 SIGKILL（`codebuddy.js:136-140`）。
- **continuable**：`--session-id <uuid>` 首次建会话，`--resume <uuid>` 续话；session 在 codebuddy 端磁盘持久化（`codebuddy.js:179-195,197-204`）。默认模型 `hy3`，可通过 `config.codebuddyModel` / `$CODEBUDDY_MODEL` 覆盖（`codebuddy.js:52`）。

### 2.6 kill / continuable session 语义

| 维度 | dsh engine | codex engine | claude engine | codebuddy engine |
|---|---|---|---|---|
| 主对话 abort 是否取消子代理 | ❌（独立 AbortController，README:13） | ✅（signal listener 接 abort，codex.js:329-331） | ✅（controller.signal） | ✅（killFn） |
| job_kill 通路 | `controller.abort(reason)`（index.js:605） | run.dispose = kill = turn/interrupt + disposeWire（codex.js:338） | run.dispose = abortController.abort + q.close（claude.js:134-138） | run.dispose = SIGTERM+SIGKILL（codebuddy.js:136-140） |
| continuable 持久化 | dsh-subagent 持久 session 文件（需 patched） | codex CLI 磁盘 thread（jsonl） | claude-agent-sdk 磁盘 session（官方 API only） | codebuddy 磁盘 session |
| continuable 续话通道 | `subagents.startContinuable` | `_resume(threadId, ...)` | `_resume(sessionId, ...)` | `_resume(sessionId, ...)` |
| continuable 路由到 provider | 直接 subagents | `registerExternalContinuation(sessionId, resume)` | 同左 | 同左 |

`registerExternalContinuation` 来自 patched `@deepseek-ai/dsh-subagent`，是**外部 engine continuable** 接入官方 `send_message(subagentId, ...)` 的注册位（`index.js:543-545`）。脚本 `smoke.mjs:9-17` 探测到官方包没该导出时**整体 skip 集成 smoke**——这是 CI 友好的妥协。

### 2.7 工具守卫

`disableStockSubagent ?? true` 时，`tools.guard` 拒绝 `subagent` / `subagent_fork`，返回引导到 `subagent_routed` 的字符串消息（`lib/index.js:675-683`）。作用域为**挂载本插件行的 preset**——未挂载本行的 preset 不在 guard 范围内（README:146）。这一设计是**渐进替换**——不强制一把切，可关可开。

## 3. 对本项目 (AGE) 的可用模式（Adopt/Adapt/Reject）

> AGE = `/Users/abc/app/age-worktrees/age-autonomy/`（任务范围由调研指向 mission-driver + Vue monitor；事件源 = git + dev log + mission JSON）。

| # | 模式 | 判定 | 映射与理由 |
| --- | --- | --- | --- |
| 1 | **per-call override + 预检**（model/provider 一次指定 + `resolveModelInfo` 失败时列出候选清单 + `cause` 留底） | **Adopt** | AGE 若支持"在某个 step 临时切模型/供应商"——必须给用户**候选清单**而非只是"无效模型"。可参考 `index.js:483-505` 的双重信息：错误消息告诉用户可选，cause 字段给上层判别 provider outage vs. 真未知。本项目若已有 `resolveModelInfo` 包装层，加 5 行就能补齐。 |
| 2 | **host-plane provider 注册幂等**（多 preset 共用同一 provider，跳过同名重复注册，`lib/index.js:348-357`） | **Adopt** | AGE 若允许多个 component 同时声明同名 provider / 工具，必须用 `getProvider(name) === undefined` 守卫——避免多个 component 重复注册时第二个 throw DUPLICATE 让 preset 选择静默失败。同形态 copy-paste 到任何 host-plane 注册点。 |
| 3 | **外部 CLI engine 抽象成统一 `{id, localAgent, readOutput, result, dispose}` run 形状**（`codex.js:333-339` / `claude.js:140-147` / `codebuddy.js:169-176`），用同一 background/foreground 调度层 | **Adopt** | AGE 若集成外部 LLM CLI（anthropic / openai / 国产），统一 `readOutput` + `dispose` + `result` 三件套是关键：上层不需要分支处理不同 engine；kill / progress / continuable 三个语义就能共享一套实现。 |
| 4 | **按 engine 切换 preset 行为**（`engine` 参数决定是否需要 preset、是否需要 maxDepth、是否透传 cwd） | **Adapt-lite** | AGE 若做 step 内外部模型调用，可参考 `index.js:443-528` 的条件展开模式。但 AGE 是单进程 mission-driver，外部 engine 主要意义不大——此模式可借鉴到"内嵌 vs 外部"两路 step 实现的选择。 |
| 5 | **continuable 的 session 持久化落到外部 CLI 端**（codex disk thread / claude SDK disk / codebuddy disk session） | **Adapt** | AGE 的"可恢复任务"概念若做 CLI 代理：让 CLI 自己负责持久化（不是 plugin 端做一份 shadow state），`registerExternalContinuation(sessionId, resume)` 是干净的接缝。但 AGE 是 git-based，**复用现有 mission JSON 即可**——不要新增第二持久化层。 |
| 6 | **kill/dispose 顺序约束**（foreground 两段：result → dispose，**绝不能并行**；background 独立 AbortController 让主对话 abort 不杀子代理） | **Adopt** | AGE 任何"派异步子任务"都吃这套约束——主对话取消 ≠ 子任务取消，这是直接可抄的工程约束（`index.js:574-621,624-642`）。 |
| 7 | **自定义 provider 替换 stock subagent 的"setup async 化"破解继承父 preset** | **Reject** | AGE 是 git/mission 驱动，没有"preset 继承"概念——子任务继承父任务就是设计意图。本模式只在 DSH 这种"preset 即 agent 类型"的语义下才有用，移植价值 = 0。 |
| 8 | **patched 平台包作为启用开关**（continuable+preset 必须安装 junction fork） | **Reject** | AGE 不应引入对宿主平台的 junction 级别 patch——这破坏可复现安装。AGE 的"可恢复任务"机制应走 mission JSON 重读，不走 platform fork。 |
| 9 | **tools.guard 把 stock 工具拒绝 + 引导到新工具**（`index.js:675-683`） | **Adopt-lite** | AGE 若做"组件替换既有流程"，可参考此模式：保留旧接口的执行入口，加 guard 在 exec 期拒绝 + 引导用户到新接口。比"硬删除旧工具"对用户更友好。 |
| 10 | **`assertSubagentPatchApplied` 启动断言**（`lib/index.js:231-240`）——只 warn、不 throw | **Reject** | 文档自述"fail loud, never silently degrade"但代码只 warn——README 自相矛盾。AGE 任何"关键依赖未满足"必须 throw；只 warn 会埋雷。**反例**：`assertSubagentPatchApplied` 失败时 continuable 会静默退化为 parent composition（README:136）——这正是该插件的危险面。 |

## 4. 风险与不适用面

1. **平台 patch 强耦合**：`continuable: true` + dsh engine 必备 patched `@deepseek-ai/dsh-subagent`（README:104-142；`lib/index.js:231-240,345`）。补丁通过安装级 junction 强制模块身份，profile-local `link:` 即破坏——文档明示"do NOT add"。**AGE 不能接受这种破坏可复现部署的设计**。
2. **持续断言逻辑自相矛盾**：README "fail loud, never silently degrade" vs 代码 `ctx.logger?.warn?.`——日志说得很重，行为只 warn（`lib/index.js:237-239`）。continuable+preset 在未打补丁时退化为继承父 composition（README:136）——这是**静默退化**而非 fail loud。AGE 不能借这条路径。
3. **平台 RC 强绑定**：peer 全家桶钉 `^0.1.0-rc.7`；README 明示每 RC 可能破坏 API、必须跟随升级（README:51-52）。AGE 跨 RC 兼容策略与本插件正交。
4. **NODE ≥ 22 + Windows shell quirk**：spawn codex `.cmd/.ps1` shim 需 `shell:'cmd.exe'` 兜底（`codex.js:36`）；POSIX/macOS 路径不同——跨平台逻辑分叉。AGE 若做外部 CLI 集成需自行处理此面。
5. **CLI 登录态硬依赖**：codex 必须 `codex login`、codebuddy CLI 必须安装、claude SDK 走官方 API（README:42-46）。AGE 若集成外部 CLI 需文档化前置条件 + 启动时探测 + 友好错误。
6. **预检只校验目录不校验可达**：README 自述"pre-check validates against the runtime model catalog, but a reachable provider with a valid key is still required"（README:128-129）。错误恢复路径只到预检这一步——真上线还要 provider outage 处理。AGE 若借鉴需补可达性 ping。
7. **persona 仅"借由 preset 改变"，无 per-call override**：`lib/index.js:267` `persona: false`——按次 persona 不支持，persona 只能通过 preset 切换或写到 prompt 里。这是 DSH 的 seam 限制，不是 bug。
8. **未读脚本**：未读 `scripts/probe-cb-engine.mjs` 和 `scripts/repro-codex-isolation.mjs`（仅 grep 路径存在，未读源码）——报告内未对它们的结论做断言。
9. **本插件的"插件即替换"风险面**：当 `disableStockSubagent: true`（默认），guard 全局屏蔽 stock subagent——但只对**挂载本插件行的 preset**生效。未挂载本行的 preset 上 stock subagent 仍可用，可能导致 routing 不一致（README:146）。AGE 若做"插件即路由"应明示作用域。
10. **model drift 行为**：preset 文件在两次续话之间被改，下次续话会用新一代 preset（README:122-126）。这是 mount 重解析的副作用，文档化但不是 bug——AGE 若做类似"按名加载 profile"，同形问题。
11. **smoke.mjs 在 CI 是 skip 模式**：脚本 `scripts/smoke.mjs:9-17` 在 `registerExternalContinuation` 不存在时**直接 exit 0**——CI 上等于没跑集成。`codex` / `claude` / `codebuddy` 引擎的端到端 path 只在本地有 patched harness 时验证（ci.yml:32-34）。**AGE 不能用此模式**——CI 应 fail 而不是 skip。

## 5. 关键源码索引

| 主题 | 位置 |
| --- | --- |
| 顶层 `apply()` + 5 个 provider 注册 | `lib/index.js:242-385`（mount/fork 工厂 255-337；注册 338-384；codex teardown 375） |
| 自定义 provider 模板（routed-mount/routed-fork 共享） | `lib/index.js:255-337`（capabilities 265-273；start 274-330；prepareContinuable 334-336） |
| `agentPresets.mount` 关键行（async setup） | `lib/index.js:291-308`（mount 295；toolFilter 298-300；subagent:delegation 302-306） |
| `agentPreset: targetPreset` header 覆盖 + activationBoundary | `lib/index.js:319` |
| `resolveChildAgentOptions` 通道（per-call override） | `lib/index.js:321`（构造 `agentOptions` 464-472；预检后的请求 517-534） |
| 模型预检 + 候选清单 + `cause` | `lib/index.js:483-505` |
| engine 路由（dispatch provider 选择） | `lib/index.js:443-459,510-516` |
| foreground 两段收尾（result→dispose 顺序） | `lib/index.js:623-663`（失败语义 644-653） |
| background 独立 AbortController + readOutput hook | `lib/index.js:574-621`（595, 605-608） |
| continuable 形态（外部 engine 注册到 registerExternalContinuation） | `lib/index.js:536-572`（543-545） |
| `assertSubagentPatchApplied` 启动断言 | `lib/index.js:231-240,345` |
| `tools.guard` 拒绝 stock subagent | `lib/index.js:675-683` |
| 工具描述（参数语义全表） | `lib/index.js:386-433`（description 388-390；参数 391-406；output schema 407-433） |
| `drivePresetRun` 单 turn 生命周期 | `lib/index.js:91-122` |
| `liveProgress` 实时进度快照 | `lib/index.js:168-201`（idle 判定 182-185；stuck 标志 184） |
| `validateToolFilter` DENY-only 校验 | `lib/index.js:209-224` |
| `resolveMaxDepth` 工具层早期校验 | `lib/index.js:151-160` |
| codex engine：独立 wire + JSON-RPC + turn 生命周期 + kill + continuable | `lib/engines/codex.js:48-176`（wire），`182-340`（provider start），`342-392`（_awaitTurnInternal），`394-459`（continuable + _resume） |
| codex wire death → 即时 settle（不挂 timeout） | `lib/engines/codex.js:81-87,380-389` |
| codex turn/interrupt kill + SIGTERM→SIGKILL | `lib/engines/codex.js:156-175,320-326` |
| codex binary 发现（CODEX_BIN + npm global + APPDATA） | `lib/engines/codex.js:31-41` |
| claude engine：SDK 懒加载 + 异步 iterable 消费 + kill + continuable | `lib/engines/claude.js:13-23`（懒加载）；`84-147`（start）；`155-178`（prepareContinuable）；`181-197`（_resume） |
| claude 无人值守守卫（onElicitation / onUserDialog / canUseTool） | `lib/engines/claude.js:75-77` |
| codebuddy engine：--print NDJSON 消费 + kill + continuable | `lib/engines/codebuddy.js:66-87`（spawn），`94-153`（_run），`155-176`（start），`178-204`（continuable + _resume） |
| codebuddy --session-id / --resume 续话 | `lib/engines/codebuddy.js:73-76,179-204` |
| 平台补丁要求 + junction 安装 + 校验 | `README.md:133-142`（README.zh.md 同区段） |
| pre-check 失败语义 | `README.md:128-129`；`lib/index.js:483-505` |
| capabilities 声明（mount/fork vs claude/codex/codebuddy 区别） | `lib/index.js:265-273` vs `lib/engines/codex.js:187, claud.js:57, codebuddy.js:44` |
| cordis bundle patch（仅 insert plugin id） | `cordis.patch.yml:1-9` |
| CI：node --check + smoke + 机器路径 guard | `.github/workflows/ci.yml:13-58`（smoke 在 patched harness only） |
| smoke 集成测试（apply + tool 形状 + 边界 + 5 个 provider） | `scripts/smoke.mjs:18-135`（关键断言 73-77、88-108、110-117、119-127） |
| probe scripts（codex 端到端 + kill） | `scripts/probe-codex-engine.mjs:1-72` |
| probe scripts（claude 端到端 + kill） | `scripts/probe-claude-engine.mjs:1-44` |
| probe scripts（codex continuable） | `scripts/probe-codex-cont.mjs:1-49` |

未读备查：`scripts/probe-cb-engine.mjs`、`scripts/repro-codex-isolation.mjs`（仅 ls 确认存在，未读源码）；`.github/workflows/ci.yml` 仅读头部；`node_modules/`（按约束跳过）；`LICENSE`（格式性文件，未细读）。本报告涉及上述未读文件的结论已标"未读"，不引申断言。