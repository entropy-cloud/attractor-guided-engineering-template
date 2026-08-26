# dsh-fork-to-preset 调研报告（dsh-plugins）

> | 项 | 值 | 依据 |
> | --- | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-fork-to-preset/`（`/Users/abc/ai/dsh-plugins/dsh-fork-to-preset`） | 本地目录 |
> | 来源 repo | `https://github.com/bpc-oss/dsh-fork-to-preset.git`；本地 HEAD 见 `.git/HEAD`（任务未要求核 commit，本次未深查） | `package.json:39-43`；`README.md:42` |
> | stars | 任务未给出；本次未做 web 检索核实 | — |
> | 语言 | 纯 ESM JavaScript（`"type":"module"`）；host 端 42 行、client 端 253 行（minified 装载块），无构建步骤；Node ≥ 22（`package.json:5-7,18`） | `package.json:5-7,18` |
> | license | MIT | `LICENSE`、`package.json:4` |
> | 版本/兼容 | v0.1.1；**零运行时 peer 依赖**——既不钉 `@deepseek-ai/*`，也不锁 DSH 版本；README 自身把兼容性压成"需要宿主支持 `session.fork({ agentPreset })`（DSH rc.8+）"这一句话（`README.md:17`） | `package.json:5-55`；`README.md:17` |
> | 测试/CI | **无任何测试、无 CI workflow、无 smoke script**；仓库内未发现 `tests/`、`scripts/`、`.github/workflows/`；仅 `.gitignore` 里出现 `docs/`、`backups/`、`HANDOFF.md` 等下游分发路径占位（`.gitignore:10-13`） | 目录结构 + `.gitignore` |
> | 宿主 API 面 | host 端 `apply(ctx)` 仅注册 1 个 HTTP 前缀路由 `/fork-to-preset`（`POST /fork-to-preset/presets` 经由 `ctx.webServer.register`）；声明 `inject: ['webServer']`；**插件本体不消费 `agentPresets` 服务**——它只通过 host 的 `ctx.get('agentPresets').list()` 读出 id/name/description/defaultId 四元组（`lib/index.js:3,7,15-28`）。client 端 `apply(ctx)` 在 `conversation.session.header.actions` slot 注册一个 React 组件；声明 `inject: ['slots','locale','sessions']`（`lib/client.js:221-250`）。bundle patch 仅 insert plugin id（`cordis.patch.yml:1-3`） | `lib/index.js`；`lib/client.js:221-250` |
>
> 行号约定：以 `lib/index.js`、`lib/client.js` 为准。**未读部分**：无——`lib/` 仅 4 文件（`index.js` 42 行、`index.d.ts` 3 行、`client.js` 253 行、`types/client/index.d.ts` 1 行）、`README.md`/`README.zh.md`/`package.json`/`cordis.patch.yml`/`.gitignore`/`LICENSE` 全部已读；`node_modules/` 按约束跳过；`.git/` 历史未深查。

## 1. 定位

一句话：**会话级 preset 路由 UI 插件**——在 DSH Web UI 的会话 Header 上挂一个 `↴ Fork to preset` 胶囊控件（`[branch icon | preset <select> | Fork 按钮]`，`lib/client.js:116-219`），让用户从下拉选一个 agent preset，把**当前会话**派生（fork）成一个挂在新 preset 上的全新独立子会话，**继承父会话的 completed turns**（`README.md:5-11`、`README.zh.md:5-11`）。

核心差异化点与"为什么需要它"：stock DSH 的 `session.fork`（或 stock 的 harvest/"保存为新会话"）默认子会话沿用父方 preset——若用户希望"这个对话继续推进但换个 persona/tools/model"，要么开一个空白会话重粘历史，要么忍受同一个 preset。本插件补这个缺口：在 UI 上**一次点击**完成"换 preset + fork 当前会话"复合动作（`lib/client.js:233-239`）。

**与同作者 bpc-oss 仓库其他插件的关系**：和 `dsh-routed-subagent`（已在 `docs/analysis/dsh-plugins/dsh-routed-subagent.md`）**是同一问题的两端**——
- `dsh-routed-subagent`：在**子代理派发**那一刻（subagent dispatch），让子代理挂到调用方指定的 preset（`docs/analysis/dsh-plugins/dsh-routed-subagent.md` §1）
- `dsh-fork-to-preset`：在**会话 fork** 那一刻，让 fork 出来的子会话挂到用户选定的 preset

两者**都依赖 DSH `agentPresets.mount` 与 `meta.agentPreset` 这同一对机制**——一个在子代理 subagent tool 路径用（`dsh-routed-subagent.md` §2.3），一个在 `sessions.fork` host API 上用（本插件 `lib/client.js:235`）。两者也都把"preset 切换"作为一等公民 UI 暴露给用户：一个用工具参数 `preset: <id>` 选，一个用 Header 下拉选。

**核心定位关键词**：preset-based routing、fork-time routing、UI seam（不是 host-plane 路由）、session-scoped。

## 2. 架构与机制（源码级）

### 2.1 组件图（ASCII）

```
DSH Web UI (Cordis bundle: dsh-fork-to-preset)
  │
  ├── host plane ─────────────────────────────────────────────────────
  │   lib/index.js    inject: [webServer]
  │      ctx.webServer.register({ kind:"prefix", path:"/fork-to-preset" })
  │         ├─ POST /fork-to-preset/presets
  │         │    → ctx.get("agentPresets")  (host-level cordis service)
  │         │    → await presets.list()
  │         │    → 返回 [{ id, name, description, isDefault }]  (lib/index.js:14-29)
  │         └─ (404 fallback)
  │
  └── web plane (Cordis client bundle) ───────────────────────────────
      lib/client.js    inject: [slots, locale, sessions]
          │
          │  ctx.slots.inject("conversation.session.header.actions", () =>
          │      slots.register({ name, id:"fork-to-preset", order:5,
          │                       locale:NS, inject:forkActions },
          │                    ForkToPresetAction))
          │      (lib/client.js:241-247)
          │
          │  forkActions(sessionId) → {
          │    listPresets: () => fetch("POST /fork-to-preset/presets")   # UI↔host 桥
          │    toPreset:    async (sid, preset) => {
          │        const childId = await sessions.fork({
          │                            sessionId: sid,
          │                            agentPreset: preset,
          │                            increaseTitle: true })            # ★ 委托宿主
          │        if (childId) sessions.open(childId)
          │    }
          │  }
          │
          ▼
      ForkToPresetAction React 组件（lib/client.js:116-219）
          ├─ state: presets(loading→[]|list)、preset(selected id)、busy、done、err
          ├─ useEffect(load) → listPresets() (lib/client.js:150-161)
          ├─ useEffect ResizeObserver: 父容器 <250px 加 .f2p-tight (lib/client.js:128-138)
          ├─ render:
          │   <span.f2p-group>      ← ResizeObserver 锚点
          │     <.f2p-icon>  branch svg
          │     <.f2p-sep>   分隔
          │     <select.f2p-select>  ← 来自 presets.list()
          │     <button.f2p-btn>     ← 点击 runFork()
          │     <?err> <.f2p-err>
          ├─ runFork() → toPreset(sessionId, preset) (lib/client.js:163-179)
          └─ CSS: 3 段 media query (1180/900/640) + .f2p-tight ResizeObserver 渐进压缩
                    (lib/client.js:84-91,43-91)
```

### 2.2 Preset fork 流程（核心机制）

从用户点击到子会话打开只有**五步**：

1. **拉 preset 清单**（`lib/client.js:150-161`）：组件 mount 时 `load()` 调 `listPresets()` → `fetch("/fork-to-preset/presets", POST)` → host 侧 `lib/index.js:14-29` 走 `ctx.get("agentPresets").list()` 同步返回 → 客户端填进 `<select>` 的 options（`lib/client.js:188-197`）。失败时 `presets = []` + 浮出 `.f2p-err` 提示 6 秒（`lib/client.js:144-148,156-159`）。
2. **选 preset**：默认选 `list[0].id`（`lib/client.js:155`），`<select>` 变更触发 `setPreset`（`lib/client.js:191`）。
3. **点 Fork 按钮**：`runFork()`（`lib/client.js:163-179`）守卫 `!busy && !done && preset && sessionId`；进入 `setBusy(true)` + 按钮变 spinner。
4. **调 host `sessions.fork`**（`lib/client.js:233-237`）：`sessions.fork({ sessionId, agentPreset: preset, increaseTitle: true })` 直接 await；`increaseTitle: true` 让 host 自动给子会话改名（典型加 ` (fork)` 后缀，避免与父会话同名混淆）。
5. **打开子会话**：`sessions.open(childId)` 切换 UI 到新会话（`lib/client.js:237`）；按钮短暂显示 `✓` 1.6s 后回到 idle（`lib/client.js:170-171,206-207`）。

整个流程**没有种子构造、没有事件 replay、没有 prompt 注入**——插件代码里看不到任何 `seed`、`completedTurns`、`turn/end`、`surface.append` 之类的字眼（grep 全仓无 `seed`、无 `completedTurn`、无 `event`、无 `turn/end`，仅 `getConfig/getMetadata` 等无关 token）。所有"继承父会话 completed turns"的实现位**全部在 DSH 宿主 `sessions.fork` API 内**。

### 2.3 继承机制究竟在哪？

这是本插件最值得澄清的一点，也是和 `dsh-routed-subagent` 路线分叉最大的地方。

**插件代码不做任何继承**。`lib/client.js:233-239` 全段只有：

```js
toPreset: async (sessionId, agentPreset) => {
  const childId = await sessions.fork({ sessionId, agentPreset, increaseTitle: true });
  if (!childId) return false;
  sessions.open(childId);
  return true;
},
```

**"继承父 completed turns" 完全由宿主 `sessions.fork` 内部完成**。README 自述需要平台"rc.8+ 提供 `session.fork({ agentPreset })` API"（`README.md:17`、`README.zh.md:17`）——这条 API 是宿主侧扩展，插件对它**只有黑盒依赖**。

由此推出三个关键判定：

1. **插件不感知"已完成 vs 进行中"的边界**。如果宿主 `sessions.fork` 实现的语义是"fork 整条对话流"或"fork 到某个 turn 边界"——本插件一字不差地继承宿主行为。父会话当前正在输入/streaming 的部分若被 fork，会发生什么是 host 行为，**不在插件验证范围**。
2. **插件不验证 preset 与父会话的兼容性**。`agentPreset` 参数只透传给 host；如果该 preset 的 prompt section、工具目录、persona 引用了父会话历史里不存在的能力（例如要求读某个变量），是 host 端按 preset 装载规则正常 fallback 还是报错——本插件无任何断言。
3. **挂载语义走的是 `meta.agentPreset`，不是显式 `setup`**。与 `dsh-routed-subagent`（`docs/analysis/dsh-plugins/dsh-routed-subagent.md:120`）"在 `agents.create` 上挂 `setup` 显式 mount"的路线**不同**——本插件走 `sessions.fork({ agentPreset })`，把 preset 字段传给 host，由 host 解析为 fork 出的新 session 的 header。差别详见 §3.1。

### 2.4 Picker UI 渐进压缩策略

UI 自适应是本插件值得记一笔的工程细节（`lib/client.js:43-91,128-138`）：

- **三层渐进压缩**：`@media (max-width:1180px)` 隐藏 button label（变只剩图标）；`(max-width:900px)` select 最大宽降到 112px；`(max-width:640px)` select 86px + 隐藏 icon/分隔（`lib/client.js:85-87`）。
- **ResizeObserver 兜底**（`lib/client.js:128-138`）：media query 是粗粒度的，对 split pane / 侧栏折叠 / 缩放会撒谎；额外对 `el.parentElement` 建 ResizeObserver，父容器实测 `clientWidth < 250` 时给元素加 `.f2p-tight`，触发更激进的同级压缩（隐藏 button label + select 104px，`lib/client.js:89-90`）。`disconnect` 在 unmount 时清理——这是 React + ResizeObserver 的标准收尾。
- **色板/边框用 `color-mix(in srgb, currentColor X%, transparent)`**（`lib/client.js:44-50`）：整个胶囊的颜色全部派生自父元素 `color`，不写死主题色——浅/深主题、配色变体零配置跟随。
- **错误浮层用 CSS 动画 + 6s 自动消失**（`lib/client.js:144-148,76-83`）：`.f2p-err` 是 `position:absolute; top:calc(100% + 6px); right:0`，`@keyframes f2p-in` 0.16s 淡入；timer ref 在 unmount 时清掉，避免 setState-on-unmounted。
- **i18n**：内联 `en`/`zh` 双字典（`lib/client.js:23-40`），通过 `ctx.locale.register(NS, { en, zh })`（`lib/client.js:222`）注册；用 `t("label")` 取值（`lib/client.js:184,203,212`），让宿主做语言协商——与 `dsh-routed-subagent` 等同形。

### 2.5 关键观察：插件体量与设计哲学

**253 行 client + 42 行 host = 295 行总代码**，覆盖了"路由选择 + UI 集成 + 错误反馈 + 响应式 + i18n + 资源加载 + bundle 注入"。如此紧凑是因为它**没有把任何"preset 是什么 / 怎么挂载 / 怎么继承历史"的策略塞进插件**——所有这些都被宿主 API 收纳了。这与 `dsh-routed-subagent`（自己实现 provider、setup、dispose、pre-check）形成明显反差：

| 维度 | dsh-fork-to-preset | dsh-routed-subagent |
| --- | --- | --- |
| 触发面 | Web UI Header 按钮（client 端） | 模型调工具（host 端） |
| 路由时机 | 用户点 Fork 那一刻 | 模型调 `subagent_routed` 那一刻 |
| 挂载机制 | `sessions.fork({ agentPreset })`（host API 黑盒） | 自定义 provider 的 `setup` 显式 `agentPresets.mount` |
| 继承历史 | 由 `sessions.fork` 黑盒完成 | 自己构造 `seed = completedTurnPrefix(parent)` |
| 验证 preset | 不验证 | `agentPresets.resolve()` 前置校验 |
| 错误反馈 | UI 浮层 6s | throw + `cause` 链 |
| 副作用 | 仅打开一个新会话 | 注册 5 个 provider + 1 个工具 + tools.guard |

**哲学分野**：本插件"信任 host 把 fork + mount 都做对"，routed-subagent"自己接管 fork + mount + 校验全链"。

## 3. 对本项目 (AGE) 的可用模式（Adopt/Adapt/Reject）

> AGE = `/Users/abc/app/age-worktrees/age-autonomy/`（任务范围 = mission-driver + Vue monitor + dsh plugin 组合；事实源 = git + dev log + mission JSON）。

**先回应指定映射点**：

- **preset 怎么定义/发现**：本插件**完全不做**——它直接读宿主 `ctx.get('agentPresets').list()`（`lib/index.js:15-21`），四元组 `{id, name, description, isDefault}` 是 host 的事实源面。AGE 当前 `agentPresets` roster 已在 `plugin/dsh/preset/age/`（WI14, `docs/architecture/dsh-plugin-packaging.md:328`）落地，**这套 `<list>.list() → id+name+description` 的 contract 已是 AGE 现实基础设施**——任何 fork-picker UI 都可直接复用，无需新建。
- **picker UI 怎么呈现**：本插件用单 `<select>` + 一个 Fork 按钮（`lib/client.js:188-215`）；CSS 渐进压缩覆盖窄 Header。AGE 若做"在会话右键 / 工具面板里选 preset fork 出新会话"，是同构 UI 形态。
- **"继承 source session 的 completed turns" 在代码上是什么意思**：本插件的代码上**没有意思**——它**不存在于插件代码**，全在宿主 `sessions.fork({ sessionId, agentPreset })` API 内（`lib/client.js:233-239`）。对 AGE 来说这是个关键启示：**fork 行为与 fork-UI 是两层**。AGE 不应在 fork-picker 里重做"completed turns 怎么算、边界在哪"——而应依赖 NativeExecutor 的 `agents.create({ sessionId, meta:{ agentPreset }, seed: [...], setup })`（`docs/architecture/dsh-plugin-packaging.md:271`），其中 `seed` 是 fork 的实现位（completion 边界 = `seed.length`），`setup` 是 mount 的实现位。
- **child session 怎么挂到 chosen preset**：本插件透传 `agentPreset` 给 host（`lib/client.js:235`）。AGE 等价做法是把 `agentPreset` 写到 `meta.agentPreset`，再让 setup 调用 `agentPresets.mount(agentCtx, id)`（`plugin/dsh/src/native-executor.ts:285-295`）——已落地的现成形态。

| # | 模式 | 判定 | 映射与理由 |
| | --- | --- | --- |
| 1 | **"路由 UI 完全委托宿主 API"的极简设计**：295 行完成 picker + i18n + 响应式 + 错误反馈，因为所有 fork/mount/继承全在 host（`lib/index.js` 42 行 + `lib/client.js` 253 行） | **Adopt** | AGE 若做"在 monitor 里加一个『用 preset 重新挂载这个 mission』按钮"——Vue 组件只需 1 个 fetch + 1 个 tool call（`mdcontrol.run` / `agents.create` 之类），把 `agentPreset` 写到 meta，剩下的让 NativeExecutor 跑现成 setup。**别在 UI 插件里重做 fork/mount 策略**——这与 `docs/architecture/dsh-plugin-packaging.md:271,328` 现有契约一致。 |
| 2 | **"fetch 一个 host 暴露的 HTTP 端点拿到下拉数据 + 用户选完调另一个 host API 执行"**的两阶段 UI 模式（`lib/client.js:229-239`） | **Adopt** | AGE monitor 若想"列出当前 worker roster 让用户选 preset 派生新 mission"——照搬此模式：mdcontrol 加一个 `GET /api/agent-presets` 返回 `{id,name,description,isDefault}[]`，前端 fetch + select + 调用 `mdcontrol.run({ agent })`。**没有 host HTTP 层的话**，可走 `ctx.locale`/`ctx.skills`/`ctx.agentPresets` 暴露的等价 API——但**两阶段是稳定 UI 模式**。 |
| 3 | **`color-mix(in srgb, currentColor X%, transparent)` 派生主题色**（`lib/client.js:44-50,60-67,73-83`） | **Adopt** | AGE Vue monitor 若要"嵌入式小胶囊"挂到现有 chrome（侧栏、Header、状态条）里——用 `color-mix` + `currentColor` 全程不写死颜色，自动跟随宿主深浅主题。这与 styled-components/CSS-in-JS 是相反方向：CSS 文件越薄越好，颜色全靠派生。 |
| 4 | **ResizeObserver + media query 双轨渐进压缩**（`lib/client.js:85-87,128-138,89-90`） | **Adopt** | 同理：monitor 的侧栏嵌入小控件（status pill、quick action）经常遇到"父容器宽度撒谎"——media query 兜不住 split pane / 折叠态。ResizeObserver 父容器实测 + `.tight` class 切换是稳健范式。 |
| 5 | **错误浮层 + 6s 自动消失 + unmount 时清 timer**（`lib/client.js:144-148,140-142`） | **Adopt-lite** | 直接抄错误浮层样式 + 计时器清理即可；AGE monitor 也用得上。 |
| 6 | **bundle patch 只 insert 一个 plugin id**（`cordis.patch.yml:1-3`） | **Adopt** | AGE 新增独立 UI 插件时的最小 patch 形态——和 `dsh-routed-subagent`、`dsh-better-sidebar`、`dsh-fork-to-preset` 同形。值得在 `plugin/dsh/cordis.patch.yml` 旁积累一个"独立 UI 插件 patch 模板"。 |
| 7 | **"fork-with-preset"语义本身**——把"换 preset"和"派生新会话/任务"绑成一个动作 | **Adapt** | AGE 的 mission control 已有 `mdcontrol.run`（`docs/architecture/dsh-plugin-packaging.md` §mdcontrol），等价于"起一个新 mission + 挂 AGE preset"——若加 UI 入口，**直接调 mdcontrol.run + meta.agentPreset**，不必造新概念。 |
| 8 | **"继承 source session 的 completed turns"由宿主透明完成**——UI 不感知 turn 边界 | **Adopt** | AGE mission 的"换 preset 重启"等价于：生成新 run id + seed 历史 plan/observation（如果 mission control 设计支持 fork 模式），**不要在 monitor 里手算 completion 边界**。`plugin/dsh/src/native-executor.ts:512-526` 的 `seed` + `activationBoundary` 已经把这件事钉住——monitor UI 直接消费 `activationBoundary` 标注即可，不必自行算 turn/end。 |
| 9 | **i18n 内联字典 + `ctx.locale.register(NS, ...)`**（`lib/client.js:23-40,222`） | **Adopt** | AGE monitor 的中英标签直接照此模式——`useLocale().t("fork.label")`，不引第三方 i18n 库。 |
| 10 | **`increaseTitle: true`**（`lib/client.js:235`）——host 自动改子会话名避重 | **Adapt-lite** | AGE mission 重命名若走 git commit hook，让 mission driver 自动追加 `(fork@<ts>)` 后缀可避免 UI 上多 mission 同名——但这是 mission control 层的 UX 决策，不一定要抄。 |
| 11 | **`sessions.fork({ agentPreset })` 不验证 preset 合法性、不写 seed、不抛错** | **Reject** | 这是**反模式**：把"换 preset 派生新会话"的全套一致性风险塞给 host 黑盒。AGE 若做类似功能，**必须在 setup 里 validate**：`agentPresets.resolve(args.agentPreset)` 失败立即 throw + 透传可用 id 列表——参考 `dsh-routed-subagent.md` §2.2 step 1（`lib/index.js:453-459`）。**别像本插件这样乐观信任 host**。 |
| 12 | **零测试 / 零 CI / 零 smoke** | **Reject** | 本插件无任何测试覆盖：`fork` 失败路径仅 UI `showError`，无单元验证；preset list 失败时仅空数组回退，无验证 host 是否真的列空；任何 host API 微调都会无声破损。AGE 任何对应组件必须挂单测（即使 Vue 组件也可用 vitest + happy-dom）。 |

## 4. 风险与不适用面

1. **"继承父 completed turns" 是黑盒**——`session.fork({ agentPreset })` 是 DSH rc.8+ 扩展，插件对它的语义零断言。这意味着：(a) 若 host 的 fork 实现把"未完成 turn"也带进子会话，本插件无感知；(b) 若 host 的 fork 把某些 prompt section（如 user-injected variable）丢弃，本插件也无感知；(c) 父会话 vs 子会话的 preset 切换是否"重置 session header 的 agentPreset 字段"完全取决于 host——本插件不验证。**借这套模式做 AGE 等价功能必须把继承语义显式断言**，不能像本插件这样乐观。
2. **不验证 preset 与父会话的兼容性**：`agentPreset` 直接透传。若目标 preset 的工具目录、prompt section、persona 与父历史不兼容（例如父会话用 bash 子进程跑了某个 host-only 操作，新 preset 无此工具），结果完全交给 host——可能 model 拿到历史却无对应工具。本插件无任何 fallback。AGE 若做等价 UI 应在 mdcontrol 端做一次"preset tool catalog vs 父 run 的工具调用记录"轻量校验，参考 `dsh-routed-subagent.md:453-459` 的 resolve 模式。
3. **picker 不展示 preset 的工具目录 / persona 摘要**：`<select>` 选项只有 name/id（`lib/client.js:196`），用户在 fork 之前**看不到目标 preset 的 tool list、persona prompt 摘要、是否引用了某个 store/skill**——这是显著 UX 短板。若 preset 之间差异巨大（model 切换 + tool 切换 + persona 切换），用户是盲选。
4. **零测试 / 零 CI / 零 smoke script**：与 `dsh-routed-subagent`（`scripts/smoke.mjs` 136 行 + `.github/workflows/ci.yml` 45 行）形成反差。AGE 不能借鉴此风格——若 AGE 上对应 fork-picker 走类似极简路线，**至少要加 e2e smoke 覆盖**："host 列出 preset → 选 → fork → 子会话打开 + meta.agentPreset 正确写入"。
5. **bundle patch 极简但 install 步骤需手工链接 node_modules**：README 自述用 `mklink /J` 或 `ln -s` 把插件 `node_modules` 指向 `<harness>/resources/host/node_modules`（`README.md:23-31`）——这是开发期联调姿势，不是发布姿态。**AGE 不应给最终用户暴露这一步骤**——要么通过 `dsh.profile.bundles` 自动声明 transitive dep 解析，要么由 plugin layer 在 host boot 时探测并 install。
6. **client 端无对应 host peer 钉版**：与 `dsh-routed-subagent` 钉 rc.7 全家桶不同，本插件 `package.json` 无任何 `@deepseek-ai/*` peer（`package.json:5-55`）。这看似"兼容性更好"，实则是**把兼容性风险全部转嫁给 host `sessions.fork` API 是否真的存在**——若 host rc.<8 无该方法，插件只在用户点击时挂掉。AGE 任何对应组件必须**启动时探测 API 存在性**，缺失时注册空组件而非默默挂掉。
7. **样式表注入是 `document.head.appendChild` + 重复检测**（`lib/client.js:93-101`）：单实例 OK；多实例挂同 bundle 也会因 `STYLE_ID` 判重只注入一次，但若 hot-reload 清掉 `<style>` 元素后 React 组件不重注入会丢样式。这是 webpack HMR / Cordis bundle 动态卸载时的隐患——AGE Vue 监控组件应改用 scoped CSS / `<style module>`，不靠手动注入。
8. **`fetch` 失败仅 `catch(() => [])` 静默返回空**（`lib/client.js:232`）：host 不可达时 picker 直接显示空白 + "Loading presets..." 文本，没有任何"无法连接到 host"的诊断。AGE monitor 对应错误必须显式浮层。
9. **`dsh-fork-to-preset` 与 `dsh-routed-subagent` 同作者的潜在冲突**：两者都依赖 `agentPresets.mount` + `meta.agentPreset`。如果用户**同时**安装两者：(a) 会话 Header 上有 Fork to preset 按钮（preset A → preset B）；(b) 工具面板有 `subagent_routed`（preset X → preset Y）。**这两条路径都改写子会话的 preset，但前者覆盖 `session.header.agentPreset`（整会话），后者覆盖 `meta.agentPreset`（agent 域）**。两者在 DSH 内部如何共处是 host 责任，本插件无任何提示或校验。
10. **历史未深查**：`.git/HEAD` 仅查 `.git` 目录存在，未读 commit log。stars/创建日期来自 README 徽章（`README.md:2-3`），未交叉核验。

## 5. 关键源码索引

| 主题 | 位置 |
> | --- | --- |
> | 顶层 metadata 表 + 插件定位 | `README.md:5-11`；`README.zh.md:5-11` |
> | 安装姿势（mklink/ln -s + profile.bundles） | `README.md:23-40`；`README.zh.md:23-40` |
> | bundle patch 仅 insert plugin id | `cordis.patch.yml:1-3` |
> | package.json 声明（无 peer、bundle + client injects） | `package.json:19-26,27-38` |
> | host 入口 `apply` + HTTP 路由注册 | `lib/index.js:3-37`（presets 列表端点 14-29） |
> | host 仅注入 webServer；preset 列表经 `ctx.get('agentPresets').list()` | `lib/index.js:3,15-28` |
> | client 入口 + slot 注册 + order=5 | `lib/client.js:221-247`（slot 241-247；forkActions 工厂 228-240） |
> | **fork 调用唯一实现位（透传 agentPreset + increaseTitle）** | `lib/client.js:233-239`（sessions.fork 235；sessions.open 237） |
> | **"继承父 completed turns" 在插件内零实现**——只有黑盒 host API 调用 | `lib/client.js:233-239` 全段 |
> | ForkToPresetAction 组件（state + 守卫 + runFork） | `lib/client.js:116-219`（state 117-123；ResizeObserver 128-138；err timer 140-148；load 150-161；runFork 163-179；render 181-218） |
> | listPresets fetch 桥（POST /fork-to-preset/presets） | `lib/client.js:229-232` |
> | ResizeObserver 父容器实测 + .f2p-tight 切换 | `lib/client.js:128-138` |
> | 三段 media query 渐进压缩 | `lib/client.js:85-87` |
> | 错误浮层样式 + 6s 自动消失 + unmount 清理 | `lib/client.js:76-83,144-148,140-142` |
> | en/zh 双字典 + locale.register | `lib/client.js:23-40,222` |
> | 全部 CSS（color-mix currentColor 派生色板） | `lib/client.js:43-91` |
> | branch SVG icon（inline 字符串） | `lib/client.js:103-110` |
> | 类型声明 host / client 入口 | `lib/index.d.ts:1-3`；`lib/types/client/index.d.ts:1` |

未读备查：`.git/` commit log 未深查（`.git/HEAD` 存在但本次未 `git log`）；`node_modules/` 按约束跳过；`LICENSE` 格式性文件未细读。本报告涉及上述未读项的结论已标"未查"，不引申断言。
