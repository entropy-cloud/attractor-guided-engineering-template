# DSH-better-sidebar 调研报告（dsh-plugin-survey）

> | 项 | 值 |
> |---|---|
> | 本地路径 | `~/ai/dsh-plugins/DSH-better-sidebar/` |
> | 来源 repo | `https://github.com/omdsh-dev/DSH-better-sidebar`（本地 `.git` remote 已核对，HEAD `646c91c`） |
> | 版本 / Stars | v0.15.0；stars 约 2.6K★ 为任务简报口径（README 仅 badge，未联网核实） |
> | 语言 / license | TypeScript（host 半 Node ≥20 + client 半 React 18），MIT（LICENSE + package.json 双处一致） |
> | 宿主 API 面 | host 必需：`webServer`/`sessions`/`webRuntime`/`tools`；可选：`settings`/`jobs`/`agents`/`subagents`/`agentPresets`/`sessionTitle`/`sessionPersistence`。client：`slots`/`sessions`/`connection`/`workspaces`/`locale`/`modules`（均以结构化 mirror 收敛在 context-types.ts） |
> | 调研方式 | 只读本插件目录源码 + 写本报告；未回读本项目（mission-driver）源码 |

## 1. 定位

单 npm 包、host/client 双半结构的 DSH web 插件：**服务化的侧边栏框架 + 开箱即用工作台**。工作台层提供文件树/CodeMirror 编辑器/图片·MD·HTML·PDF 预览/内嵌浏览器/xterm+node-pty 终端/Git 面板/subagent 拓扑与后台任务页/sidechat 侧边对话；框架层把同一套注册 API（`ctx.betterSidebar.registerTab/registerFileViewer`）开放给第三方插件，内置 7 tab + 6 viewer 也走同一服务（自狗粮）。26+ 生态插件通过 GitHub topic 与内置推荐目录分发。对本项目而言，它是 Mission Control 多机制的官方引用先例（见 §3.4）。

两条安装通道决定其双 bundle 形态（§2.4）：官方 profile 通道 `dsh plugin --profile <name> add dsh-better-sidebar@<version>`（CLI 读包内 cordis.patch.yml 自动挂载）；插件注册表通道（dsh.plugin.json，浏览器侧 arrive() 校验）。运行期不依赖 npm/checkout，`@deepseek-ai/*` 由 web profile 提供。README 自述核心理念为"服务优先"——官方不内置、可由生态提供的功能交生态实现；这与本仓库 AGE 的"框架 + 工作台"分层同构：框架层是稳定契约面，工作台层只是契约的第一批消费者。

## 2. 架构与机制

### 2.1 服务发布形状（wire-method FULL-NAME record）

- 入口形状：`export const name = 'dsh-better-sidebar'`、`export const inject = [...]`、`apply(ctx, config?)`（src/index.ts:71-74,500）。无 default 导出，符合 DSH 插件规范。
- **wire-method record**：`buildApi()` 返回 `Record<string, ApiMethod>`（src/index.ts:218-491），键为全名方法串（`fs.read`/`git.status`/`sidechat.start`/`pty.close`…），单一 prefix 路由 `POST /sidebar/api/<method>` 按 `api[method]` 查表派发（src/index.ts:612-641）；响应统一信封 `{ok:true,value}`/`{ok:false,error:{code,message}}`，错误码闭包于 `SidebarErrorCode`（src/wire.ts:10-36）。
- **Service 发布**：client 半在 apply() 开头 `ctx.provide('betterSidebar', service)`（src/client/index.tsx:70），service 是实现 `BetterSidebarService` 接口的普通对象（src/client/service.ts:344-426），消费方 `inject: ['betterSidebar']` 声明依赖。类型面靠双 cordis scope 的 `declare module` augmentation（公共 `cordis` + vendored `@deepseek-ai/cordis`，context-types.ts:517-608）触达外部插件。
- 每条路由过同一信任围栏 `isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)`，逐请求从活服务值读取（src/index.ts:514）。
- 降级语义是显式契约：可选服务缺失时路由返回结构化错误而非崩溃——jobs 缺 registry 时 kill 降级 503、subagent runtime 缺失时 live 批量路由 503、settings 服务未挂载时 get 返回 undefined 并保留 schema 默认值、agents.create/resume 缺失时 sidechat 报 `sidechat-error` 503（src/index.ts:237-241,407-432；src/sidechat-routes.ts:191-192,238-240）。"可选服务 + 显式降级码"是我们 monitor 面对宿主版本差异时值得照抄的姿态。

### 2.2 sidechat 路由的派发链

五条路由（src/sidechat-routes.ts:49-63）：`start/prompt/cancel/dispose/info`。对应"create→submit→quiescence→harvest"链：

- **create**：`sidechat.start` 用公开 `agents.create` 缝创建子会话——自定义 seed = 父会话完整事件日志经 `buildSidechatInheritance` 诚实封口 + `snapshotSubagentDescriptor` 目录行；`origin:'subagent'` 使主列表隐藏；继承父 provider/model（前缀缓存复用）与 preset 组合（src/sidechat-routes.ts:138-225）。
  - 封口规则（src/sidechat-core.ts:209-241）：日志止于回合外→整段作 seed；止于进行中回合且无悬空 tool call→补合成 `step/end` + `turn/end{reason:'interrupted'}`；有悬空 call（provider 拒绝悬挂 assistant call）→截断到回合前，改用结构化文本快照（assistant/reasoning/工具活动，2000/8000 字符预算，:255-319）。
- **submit**：首条消息 = 边界 prompt（`SIDE_BOUNDARY_PROMPT`，声明继承内容仅为参考上下文，src/sidechat-core.ts:43-49）+ 快照 + 问题，经原生 `agent.followup` 投递（src/sidechat-routes.ts:122-125）；冷线程（重启/已关闭）先 `agents.resume` 并按持久化记录重组 preset 再投递（:227-272）。
- **quiescence**：无专用词。客户端轮询 `sidechat.info`（live agent 的 `status: idle|running`）+ 以 seq 游标尾翻 `session.history` 流式渲染 transcript（SideChatView.tsx:299、sidechat-transcript.ts）。
- **harvest**：「保存为新会话」= 客户端 `ctx.sessions.fork({sessionId, increaseTitle:true})`，前置条件 `threadHasCompletedTurn`（至少一个 `turn/end`），截断点为最后 `turn/end`，尾部未应答 user message 不带入（src/sidechat-core.ts:396-425；SideChatView.tsx:428-429）。
- 全链不碰 DSH 源码，只用公开缝（agents.create/resume、sessionTitle.rename、sessionPersistence.inspect、agentPresets.resolve/mount）；因 subagent-origin 身份被通用 session RPC 围栏隔离，所有操作必须走自有路由。
- 线程身份是纯数据约定：持久标题前缀 `Side: `（48 字符截断）既是客户端行过滤键，也与姊妹插件 dsh-sidechain 共享——任一 UI 都能识别对方建的线程（src/sidechat-core.ts:22-36）。"用持久化数据约定而非运行时注册做跨插件身份"是低成本互操作范本。
- transcript 读取刻意绕开 `subagents.history`（其校验目录成员资格，自定义子线程不在册），改走通用 `session.history` 读任意持久化日志；视图侧以最后 `session/end-seed` 为界裁掉继承 seed、按 seq 合并流式 chunk（sidechat-transcript.ts）。

### 2.3 工作台功能层（要点）

- 会话级隔离：所有请求携带 sessionId，权威 cwd 取自 session header（未 hydrate 时退回 caller summary cwd/process.cwd，src/index.ts:98-119）；fs.write 临时文件+rename 原子写。
- 验证文化：vitest 单测 ~80 个 spec 文件之外，还有 `pnpm test:mount`（npm 打包 → 真实 profile 挂载 → Playwright 无头渲染门禁，scripts/e2e-mount.sh + tests/e2e/mount.e2e.ts）与 check-consumer-types.sh（以真实消费者工程编译类型面）。"发布形态本身被 CI 挂载验证"是我们 mission-driver 发布前值得补的一道门。
- 终端：UI tab ptyManager（`${sessionId}:${tab}` 键，重连宽限）与 agent pty registry（uuid 键，agent 拥有生命周期）共用一个 WS 升级端点两种 attach 参数（src/index.ts:803-997）；node-pty 懒加载降级（缺失时终端 tab 显示修复命令而非拖垮整个 web server，issue #140）。
- 安全：媒体/HTML 路由限制在会话 cwd 内（`isWithin`，防大小写/分隔符误判）；fs.write/fs.upload 临时文件+rename 原子写；HTML 预览 CSP `sandbox` 不透明源 + nosniff/no-referrer；浏览器沙箱 iframe + 状态条实时显示；地址栏拒 `javascript:`/`data:`/`file:` 与本机地址。
- 后台任务页读模型：`jobs.output` 只回放模型已读过的事件日志切片（不碰模型 job_output 游标——"人侧面板永不偷走 agent 的字节"），任务列表骑宿主 `session/jobs` push 镜像、插件不设 list 路由（src/index.ts:232-241,386-393）。"只读镜像 + 不侵入宿主游标"对 monitor 读取 mission 状态是直接可借的约束。

### 2.4 client 面（注册表成熟度）

- package.json 三件套：`exports['./client']`（及 `./client/service`、`./client/api` 别名，同指 lib/client.js）、`dsh.client.inject`（5 个平台模块）+ `platform:'web'`、dsh.plugin.json `client.main='./lib/client-registry.js'`（package.json:15-38,42-56）。
- **dual-form bundle**（tsdown.config.ts:332-337）：同一 src/client/index.tsx 编译两份 CJS 闭包 bundle，仅注册 id 与文件名不同——官方 profile 通道 id=`dsh-better-sidebar`（client-modules compose 键），registry 通道 id=`dsh-external/dsh-better-sidebar`（浏览器 arrive() 校验要求 id===manifest id）。banner/footer 注入 `window.__ModuleLoader__.load({id, factory:(require)=>{...}})`；purity gate 构建期拒绝任何非 external 非 inline-safe 的 `@deepseek-ai/*` 值导入与 Node builtin；CSS Modules 编译为哈希类映射 + `<style data-plugin>` 注入。
- 懒 chunk：terminal/editor/mermaid 重库独立打包为 `globalThis.__dshChunks__[name]=(require)=>{...}` 工厂，故意不走模块加载器（chunk id 不是 seed word，解析版本相关），由自有 `/sidebar/bundle/<name>.js` 路由按白名单供给，ETag+304 三层缓存；HMR 再激活走 ETag HEAD 复验屏障防陈旧渲染（src/bundle-route.ts、chunk-loader.ts:242,317-351）。
- 服务成熟度标志：`SIDEBAR_SERVICE_VERSION` 与 package.json 锁步断言；单调 `features[]` 能力表供消费者门控（src/client/service.ts:473-500）；api-surface.spec 守护 client 可达声明图零 `node:*`/零 `Buffer`；manifest-consistency.spec 守护 manifest↔build↔package.json 一致性；AGENTS.md + docs/external-plugin-guide.md 两层接入文档。

### 2.5 卸载/dispose 纪律

- host：每条路由/WS 用 `ctx.effect(() => register, 'label')` 注册（disposer 由 fiber 自动调）；总 teardown effect 释放 toolsDisposers、两个 pty registry、两个 WSS（src/index.ts:849-855）。设置开关关停时即时反注册工具并 disposeAll agent 终端（:561-569）。
- client：mount effect 的 unmount() 完整回收 root/host/MutationObserver/rAF（index.tsx:132-145）；字典/拦截器/IME guard/设置导航图标全部 ctx.effect 包裹（HMR-safe）；slots.inject 等待宿主 settings.section 声明出现后再注册。
- 已知瑕疵：sidechat 的 `threadDisposers`/`pendingSnapshots` 是模块级 Map，teardown effect 不清扫它们（跨激活残留；重启后旧 disposer 泄漏但会话本身持久化，影响有限）；`settings.section` 的 slots.inject 返回值未显式包进 effect。

## 3. 对本项目的可用模式

### 3.1 Adopt（直接采用）

1. wire-method FULL-NAME record + 单 prefix 派发 + `{ok,value}` 信封 + 闭包错误码表——Mission Control 服务面可直接套用。
2. dual-form bundle 构建配方：同源双编译仅换注册 id、`__ModuleLoader__.load` banner/footer、构建期 purity gate、CSS data-plugin 注入（tsdown.config.ts 整体可抄骨架）。
3. cordis.patch.yml 单 insert + `!!js` 表达式防聚合包双重挂载（见 §3.4b）。
4. manifest/version/features 三重一致性测试守护（api-surface.spec + manifest-consistency.spec 模式）。
5. dispose 纪律模板：effect 带 label、teardown 总闸、严格 no-op 的 closeTab/updateTab（未知 id 零状态扰动）。

### 3.2 Adapt（改造后用）

1. sidechat 派发链 → mission 派发：自定义 seed 子代理创建、边界 prompt 契约、诚实封口规则、冷恢复、fork 提升 harvest，全部可平移；quiescence 判定需换成我们的审计/静默判据而非 status 轮询。
2. 能力探测 `version + features[]` 单调表 → monitor 面板对外契约的向后兼容手段。
3. 懒 chunk 方案 → 若 monitor 引入 xterm/mermaid 类重库；但我们若走 bundle patch isolate realm 挂载，优先评估宿主模块表能否直接供块。
4. 结构化 mirror 层（context-types.ts 单文件收敛上游漂移）→ 我们对 DSH 宿主类型的引用策略范本。

### 3.3 Reject（明确不取）

1. 内嵌浏览器/Office 预览等重工作台功能（与 monitor 目标无关）。
2. 模块级 Map 存放线程 disposers/snapshot 的写法——我们要求 per-activation 状态随 fiber 回收。
3. `./src/*` 通配 exports 暴露源码树（扩大类型图泄漏面）。

### 3.4 已借用先例忠实度核对（以任务简报所述借用点为准；受"只读本目录"约束，未回读本项目 packaging doc/WI15 原文复核）

a) **sidechat create→submit→quiescence→harvest 原生派发链**：源码证实链条真实存在且全程走宿主公开缝（§2.2）；注意源码不用这些命名，"harvest"对应客户端 fork 提升、"quiescence"对应 info/history 轮询——我们文档若按四段命名叙述，应在 packaging doc 标注与源码词汇的映射。
b) **bundle patch isolate realm 挂载**：cordis.patch.yml:46-49 的 `- insert` 行 + `disabled: !!js` 表达式确证；表达式在 loader 条目序内求值，只能看见先行行，聚合包后置时防护失效是文档承认的已知限制（:39-45）。
c) **dual-form bundle+client**：tsdown.config.ts:332-337 + dsh.plugin.json `client.main` + exports 三别名确证；且比简报所述更成熟——有两条 spec 守护不可漂移（§2.4）。WI15 reopen 判据 T1 引用时建议补充该守护细节。

### 3.5 WI15 reopen 可取清单

1. tsdown 双通道配置 + purity gate + CSS 插件的整段可复制骨架（含 mermaid uuid browser alias 这类坑位注记）。
2. `features[]` 单调能力表 + version 锁步断言，作为面板延期期间 API 冻结承诺的实现载体。
3. client-reachable 声明图零 Node 类型守卫（api-surface.spec 的正则扫描法），若 Mission Control 有 client 半则必备。
4. sidechat 五路由作为 mission 派发链的参照系：seed 合成/封口算法（sidechat-core.ts 是纯函数、双半共享、node 测试环境直测——这个分层值得照搬）。
5. ETag+HEAD 复验 + reactivation 屏障的 HMR 缓存纪律。
6. 双重挂载 `!!js` 守卫及其顺序限制说明。
7. 挂载门禁（test:mount）：reopen 后 Mission Control 面板若走 bundle 通道，发布验证应含"打包 → 真实挂载 → 无头渲染"三段，而非仅单测绿。

reopen 判据 T1 的核对建议：以本报告 §3.4c 的三处源码锚点（tsdown.config.ts:332-337、dsh.plugin.json client.main、exports 别名）+ 两守护 spec 为准回写 packaging doc 引用，并补记 §2.4 所述 purity gate 与 id 配对约束，避免 reopen 实现时只复刻双产物而漏掉防漂移机制。

## 4. 风险与不适用面

- **宿主耦合深**：约 20 个宿主服务的结构化 mirror，peerDependencies 锚定 rc.8/rc.1；上游 rc bump 时 mirror 可能静默腐坏（漂移收敛在单文件是缓解不是消除）。
- **注册表契约的脆弱点**：`registerTab` 对重复 id 直接 throw（service.ts:530-533）——两个第三方插件撞 id 会炸掉后激活者；生态靠命名约定（`my-plugin:db` 冒号前缀）自律，无中央仲裁。我们若开放类似注册面，应考虑冲突时的降级（改名/拒绝并报错给 UI）而非 throw。
- **原生依赖摩擦**：node-pty 需要 approve-builds + rebuild；pnpm 剥预编译 spawn-helper 执行位需运行期幂等修复（ensureSpawnHelper）。monitor 若不引终端类功能可完全绕开。
- **信任模型绑定 DSH**：Host-header/loopback/trustedHosts 围栏与 `/api` 同源假设；browser.probe 是出站 fetch 面（已做协议/loopback/超时约束），移植到其他宿主需重建围栏。
- **规模**：~90 个 src 文件 + ~80 个 test 文件，整体引入不可行；只取机制与测试范式。其"每条路由一段长注释说明设计动机"的风格使源码可调研性极高——我们的 mission-driver 源码可读性可对标。
- **未读部分**：AGENTS.md 正文、多数视图组件内部（GitView/TerminalView/SubagentView/FileTree 等）、tools.ts/pty-manager/subagent-live-route/jobs-routes 实现细节、install.sh/e2e 脚本、tests 大部分断言体、pnpm-workspace/ci 配置。本报告对这些区域不作结论。

## 5. 关键源码索引

| 主题 | 文件:行 |
|---|---|
| 插件入口/inject/teardown | `src/index.ts:71-74,500,849-855` |
| wire-method record + /sidebar/api 派发 | `src/index.ts:218-491,612-641`；信封/错误码 `src/wire.ts:10-100` |
| Context augmentation（双 scope） | `src/context-types.ts:517-608`（mirror 层 :1-27 设计说明） |
| 可选服务降级语义 | `src/index.ts:237-241,407-432`；`src/sidechat-routes.ts:191-192,238-240` |
| jobs 只读镜像读模型 | `src/index.ts:232-241,386-393`；client 面 `src/client/api.ts:69-85` |
| sidechat 路由（create/prompt/cancel/dispose/info） | `src/sidechat-routes.ts:49-63,136-325` |
| seed 封口/快照/harvest 判据 | `src/sidechat-core.ts:43-49,152-174,209-241,255-319,396-425` |
| transcript 映射/quiescence 轮询 | `src/client/sidechat-transcript.ts`、`src/client/SideChatView.tsx:299,428` |
| BetterSidebarService/能力表/锁步版本 | `src/client/service.ts:344-426,473-500` |
| client 入口/provide/mount 回收 | `src/client/index.tsx:35,70,94-97,125-254` |
| dual-form 构建/purity gate/CSS/chunk 打包 | `tsdown.config.ts:118-161,183-219,247-267,332-337` |
| bundle patch 双挂载守卫 | `cordis.patch.yml:33-49` |
| 懒 chunk 路由/加载器/HMR 复验 | `src/bundle-route.ts:22,69-129`；`src/client/chunk-loader.ts:242-280,317-351` |
| 成熟度守护测试 | `tests/api-surface.spec.ts`、`tests/manifest-consistency.spec.ts`、`tests/service.spec.ts` |
| 外部插件接入指南 | `docs/external-plugin-guide.md` |
