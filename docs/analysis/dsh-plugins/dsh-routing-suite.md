# dsh-routing-suite 调研报告

> | 项 | 值 | 依据 |
> | --- | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-routing-suite/`（`/Users/abc/ai/dsh-plugins/dsh-routing-suite`） | 本地目录 |
> | 来源 repo | `https://github.com/yjh051108/dsh-routing-suite.git`；本仓库已合并两份上游（`dsh-super-injector`、`dsh-router-standard`）的内容，`injector/` 与 `preset/` 是仓库内普通目录（README.md:11、README.md:46-47；AGENTS.md:20-22） | `README.md:11-12` / `AGENTS.md:20` |
> | 子组件版本 | injector=v0.3.3（`injector/package.json:3`）；preset=主线 v1.19.1/v34（`preset/router-standard/router-bootstrap.mjs:57` ROUTER_VERSION）+ 测试标 0.3.0（`preset/package.json:3`） | `injector/package.json:2-3` / `router-bootstrap.mjs:57` / `preset/package.json:2-3` |
> | 语言/形态 | injector=TypeScript（`injector/src/index.ts`，**3,319 行单文件** + `src/client/index.ts`）；preset=纯 ESM `.mjs`（`router-core` 0 依赖 + `router-bootstrap` 仅 `node:fs/path/os/url/vm` + `router-core`）；preset 通过 `cordis.patch.yml` bundle 注入器仅 6 行 | `injector/src/index.ts:1` / `router-bootstrap.mjs:20-24` / `injector/cordis.patch.yml:1-6` |
> | license | injector=BSD-3-Clause（`injector/package.json:27`）；preset=MIT（`preset/LICENSE`） | `injector/package.json:27` / `preset/LICENSE` |
> | 宿主 API 面 | injector：`peerDeps @deepseek-ai/dsh-tools/cordis/schemastery` + `dsh.bundle.patch` + `dsh.client.inject=['dsh-client-runtime','dsh-client-ui-slots']` + `platform=web`（`injector/package.json:28-44`）；preset：仅一个 `agent-presets` 目录下的子目录 + `agent.cordis.yml` + 相对 `.mjs` 引用，**不调用任何宿主包 import** | `injector/package.json:28-44` / `router-core.mjs` 全文件（无 import） |
> | 测试 | preset 单元测试 11 例 + `integration.test.mjs`（576 行）+ `selftest.mjs` 132 行 12 类断言（`router.test.mjs:1-281`、`router-bootstrap-v34.selftest.mjs:1-132`）；injector 自检 8 项（`INSTALL.md:160`）但**未在本次运行** | `router.test.mjs` 全文件 / `INSTALL.md:160` |
> | 同步/产物 | `dsh-router-standard-0.3.0.tgz`（62 KB）随仓库附带；injector `lib/` 不入库（`install.ps1:9-27` 触发 `npm install` 走 `prepare` 钩子 `scripts/prepare.mjs` 跑 `tsdown` 构建） | `install.ps1:8-27` / `injector/package.json:50-55` |
> | 依赖关系 | **suite 内**：injector 与 preset **互不依赖**（各自独立安装链路，README:22-34）；**suite 外**：preset 引用 router-standard 上游已退役的 `dsh-router-pro`（README:46 标注 planned 但未随 v0.3.0 发布；CHANGELOG 提到 v1.19.1 阶段"router-pro 线已退役删除"，`preset/README.md:28`） | `README.md:22-34,42-46` / `preset/README.md:28` |
>
> 行号约定：injector 用 `injector/src/index.ts:LINE`；preset 用 `preset/router-standard/router-bootstrap.mjs:LINE`、`router-core.mjs:LINE` 等。**未读/未深读部分**：`injector/CHANGELOG.md`、`injector/scripts/prepare.mjs` / `build.sh` / `fix-patch.mjs`、`injector/src/client/index.ts`（仅 grep 出存在）、`injector/docs/SPEC.md`（仅看 ls 9.5 KB 未读）、preset 的 `router.integration.test.mjs`（576 行，仅 grep）、`preset/router-spec/router-bootstrap.mjs`（17,580 行——文件大小说明有 17.5 KB 但 wc 显示 17,890？实际为同名 17,580 vs `router-bootstrap-v10.mjs` 17,890 的两个版本；**未逐行读**）、`preset/router-react/router-bootstrap.mjs`（仅看头几行）、`preset/probe/*`（仅 README 4 行 + cot-lexicon.md 7.4 KB；probe 数据/脚本断链，AGENTS.md:96-98）、`preset/docs/*`（paper.md / experiments.md / STANDARD-PLAN.md / blog.md / statement.md / apology.md / FEEDBACK-v34.md 等**仅 ls 列名**，未读细节）；preset 的 `scripts/sync-preset.cjs` / `build-page.mjs` 也仅 ls。本文中涉及的源码级细节均带 `file:line` 引用，未深读的文件在第 5 节用「参见」标注。

---

## 1. 定位（含与其他 routing 插件的边界）

**一句话：这是一个 suite（注入器 + 路由预设），不是单一插件——它在「运行时管理层」与「任务感知路由层」两层都落地，且明确把 DeepSeek V4 的 `persona` 轴相变实测（21 点 × n=2）当作预设的物理定律。**

### 1.1 套装 vs 单一：为什么这是「suite」

仓库根 `README.md:1-5` 自述：

> "一个仓库装齐「运行时手术台 + 思维模式路由预设」：先装注入器（免重启运行时管理层），再用它装配 router-standard 预设（任务感知思维模式路由，P1-P23 实测）。"

子目录拓扑印证：

```
dsh-routing-suite/
├── injector/             ← dsh-super-injector v0.3.3（DSH 插件）
└── preset/
    ├── router-standard/  ← 主预设（v1.19.1/v34，agent.cordis.yml + router-bootstrap.mjs + router-core.mjs）
    ├── router-spec/      ← 深度思考优先变体（v10）
    ├── router-react/     ← RL 接口还原变体（v17）
    └── probe/            ← 历史实验快照（已断链；数据/大件入 .gitignore，AGENTS.md:96-98）
```

**两层职责清晰分离**：

- **injector/ 是「运行时装配层」**：用一次官方 bundle 装配后，把其余任何插件包（包内自带 `lib/`）通过 junction 链接 + `loader.create` 注入运行中的 web，全程不碰 patch/package.json、不重启（`README.md:22-24`、`injector/README.md:22-23`）。它解决的是「装什么」决定之后，「装完怎么改」的运维空间。
- **preset/* 是「会话任务感知层」**：通过 `~/.dsh/.agent-presets/<name>/agent.cordis.yml` 平铺复制（DSH agent-presets 只扫一级子目录，README.md:36、install.ps1:49-50），把同一份 `router-core.mjs`（路由决策）与 `router-bootstrap.mjs`（钩子装配）装配到每个会话的 agent scope。它解决的是「用户消息进来后，按任务类型分流到不同 persona / 工具面」。

### 1.2 与其他「routing」插件的边界

| 同题插件 | 关注点 | 与本 suite 的关键差异 |
| --- | --- | --- |
| `dsh-anchored-standard`（xiaobright，README.md:226-230 致谢） | 首轮锚定：先窄工具面、首 tool call 后恢复全部（98/99 评分） | 只解决"工具面"，不解决"persona 选择"——本 suite 的 `router-standard` 把锚定思路移植为 `phase_begin → restrict → 阶段门控`，但**核心新增**是任务分类 + 4 个 persona/工具面映射 + 模型差异（Pro vs Flash） |
| `dsh-plugin-agent-workflow`（xuanyuanzhifeng，dsh-plugin-survey 已分析） | 浏览器侧「工作流」标签页，纯只读投影 | 完全不在执行面/路由面，只消费 Session 事件做 UI；与本 suite 形态学正交 |
| `dsh_workflow`（omdsh-dev，同上） | 宿主侧 service/engine/store/catalog + QuickJS VM 的执行引擎 | 它派发子 Agent、写文件，是「写」路径；本 suite 是「会话引导」路径，不派发、不写 |
| `DSH-better-sidebar` 等 UI 类 | 改进 Web UI 体验 | 纯 client bundle，与本 suite 无重叠 |
| `goal-acceptance` / `goal-scaffold` / `dsh-goal-quiescence` | Goal/Todo 编排 | 本 suite 的 `router-bootstrap.mjs` 里**自带** goal 工具的 own-layer shim（`get_goal`/`create_goal`/`update_goal`，router-bootstrap.mjs:1123-1159），但不重写 goal 体系 |

### 1.3 关键定位事实（README 自述 + 源码印证）

- **预设的"理论依据"**：DeepSeek V4 Pro 在 persona 轴上行为**非连续**——21 点 × n=2 探针（`router-core.mjs:3-10` 注释）显示 0~0.15 是稳定 spec 区、0.2~0.45 是混相不稳定带、0.5~1.0 是 11 个等价 react 区；Flash 是阈值型（0~0.5 全部 spec 侧，0.75+ 才 react，README.md:112-115）。**预设做的是把连续轴量化到 3 个稳态带 + 1 个 weak 内路由**——「continuous 调参是错觉」。
- **P1-P23**：README.md:51-55 总结的"三行为带 + weak 内路由""近距离引导（缓存 92-94%）""单任务三锚（persona 静态）""plan-mode 保留"——实验数据来自 `preset/docs/experiments.md`（14 KB，本次**未读**）和 `docs/paper.md`（19 KB，本次**未读**）。
- **v0.3.0 修复了"装配链"而非"算法"**：核心改动是装配链路真伪——`agent/inbox/claimed` 抢先捕获首条真实用户消息（issue #13）、近距离引导改走 `agent/pre-step` 绕开 `session/event` 的 scope filter（#34/#36/#55）、缺导入修复（#11）、preset.yml YAML 引号（#53）。**纯算法层没改**，改的是"算法真正在 DSH 0.1.0-rc.7 的事件序下能不能拿到对的数据"。
- **injector 的"独立哲学"**：与 `dsh-evolve` 互补——`dsh-evolve` 是 agent 现场写单文件小工具（`~/.dsh/evolve/<name>.mjs`），本 injector 是注入**开发者预构建的完整插件包**（`README.md:90-95` 比较表）。injector 也明确"不发明协议"：注入的就是标准 DSH 插件包格式（package.json + lib/），装上即官方语义（`README.md:114-117`）。

---

## 2. 架构与机制（源码级）

### 2.1 组件图（ASCII，覆盖 injector + preset）

```
┌──────────────────────────────── DSH host (Cordis web profile) ───────────────────────────────┐
│                                                                                              │
│  ┌─── injector/  (1×官方装配 + N×运行时注入) ────────────────────────────────────────────┐   │
│  │  bundle loader:  cordis.patch.yml:1-6 → insert { id: dsh-super-injector, config:{} } │   │
│  │  apply()  injector/src/index.ts:570                                                        │   │
│  │    ├─ registry: ~/.dsh/super-injector/registry.json (atomic write, .tmp+rename)         │   │
│  │    │                        :576                                                          │   │
│  │    ├─ purgeCache(pkgDir)    :612-621  清 loadCache（realpath URL 匹配，失败 import     │   │
│  │    │                                     残缺 job 毒化重试）                              │   │
│  │    ├─ hasActiveEntry(pkg)   :602-609  权威防重（fiber.state==active）                   │   │
│  │    ├─ writePatch()          :731-762  幂等去重 + 顶层 [] 兼容（防 duplicate id 启动崩） │   │
│  │    ├─ inject(dir)           :1918-1979                                                     │   │
│  │    │   cleanupStale → purgeCache → junction (win32=symlinkSync 'junction') →           │   │
│  │    │   ctx.loader.create({name,config:{}}) → normalizeEntriesByName → refreshClient → │   │
│  │    │   writeRegistry                                                                     │   │
│  │    ├─ reloadPackage(match)  :~1100-1320 (清缓存→import→重建 fiber，失败回滚备份)        │   │
│  │    ├─ uninject(match,self)  :1982-2080 (entry.parent.remove → writePatch disabled →   │   │
│  │    │                          删 junction，allowSelf=true 保 registry 引导器自举卸)      │   │
│  │    ├─ selfReload 守护       :656-676  min 间隔 10s + self-reload.json 跨实例持久        │   │
│  │    ├─ auditLog/rotateLog    :696-713  自愈失败落盘 self-heal.log（>1MB 滚动 .1/.2）      │   │
│  │    └─ dev_* 工具 (共 17+)   :2395-3210  (injected_list/inject/uninject/reload/install/  │   │
│  │                                reload_preset/heal_links/fix_patch/clear_routes/         │   │
│  │                                stage_add/call/list/promote/demote/scaffold_plugin/       │   │
│  │                                build_plugin/release_plugin/plugin_status/self_test/      │   │
│  │                                reset_experience)                                          │   │
│  └────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
│  ┌─── preset/*  (每个 preset 一份 agent-plane composition) ─────────────────────────────┐    │
│  │  安装链：install.ps1:39-63 平铺复制 preset/<name>/* 到 ~/.dsh/.agent-presets/<name>/    │   │
│  │                                                                                        │   │
│  │  ~/.dsh/.agent-presets/router-standard/                                                 │   │
│  │    agent.cordis.yml             298 行：persona + plan-mode + compaction + 工具组        │   │
│  │      - id: persona              :33-45  模板（运行时被 router-bootstrap 改写为          │   │
│  │                                       router-persona，AGENTS.md:30-32 提到              │   │
│  │                                       we-zh-system-h2.mjs + we-persona.txt）            │   │
│  │      - id: router-bootstrap     :64-66  name: ./router-bootstrap-v34.mjs?v=88           │   │
│  │      - id: gitbash-shell        :75-89  win32 entry-local realm 私有 bash 通道         │   │
│  │      - id: tool-fs              :98     标 准 FS 工具（不进 realm）                    │   │
│  │      - id: tool-str-replace-editor :106  关键 RL-shape 工具                             │   │
│  │      - id: compaction           :182-203  组 + isolation（planMode/toolResultPruner）   │   │
│  │      - id: delegation           :216-275  workflow/subagent/ralph                      │   │
│  │      - id: planning (plan-mode) :149-169  保留——persona 只换 persona section            │   │
│  │                                                                                        │   │
│  │    router-core.mjs (213 行)   路由决策库（0 依赖）                                     │   │
│  │      classifyTask(text)        :140-146  REACT_RE vs SPEC_RE 计数 → 1/0/'weak'         │   │
│  │      sessionMode(session)      :149-155  #13 修复：跳过 plugin-origin user/message    │   │
│  │      extractText(data)         :157-165  #1 修复：嵌套 data.message 解包               │   │
│  │      bandOf(mode)              :80-86   量化到 spec/transition/weak/react              │   │
│  │      personaFor(mode,modelId)  :89-96   weak 按 isFlashModel 选 WEAK_PRO vs WEAK_FLASH│   │
│  │      coreFor(mode)             :103-110 首轮核心工具面（spec=read/edit/glob/grep 等）   │   │
│  │      applyPersona(sections)    :193-198 仅换 persona section（保 plan-mode）            │   │
│  │      parseMode(token)          :201-213 解析 dev_router_mode 的人类输入                │   │
│  │      advanceStage(stage,…,text):173-182 (router-core 内嵌备份，标准 v34 不再用)         │   │
│  │                                                                                        │   │
│  │    router-bootstrap.mjs (1,281 行)  Cordis 钩子装配 + 工具注册 + shim                  │   │
│  │      apply(ctx, config)        :587-1267                                                  │   │
│  │        ctx.on('agent/inbox/claimed') :613-619  抢先存首条 user/message 原文             │   │
│  │        ctx.on('system-prompt/assemble') :621-668                                          │   │
│  │          首轮：tools.filter(t=>t.name==='phase_begin') + router-persona (RL 句)          │   │
│  │          promoted：filterToolGuidance() + router-stage/router-decl/router-proactivity   │   │
│  │        ctx.on('agent/pre-step') :671-699  完成信号 → autoAdvance 阶段 + persist         │   │
│  │        registerTool('phase_begin'/'phase_advance'/'tools_catalog'/'tools_help'/        │   │
│  │                     'dev_router_status'/'delivery_check'/'dev_reload_preset_live')      │   │
│  │                     :718-1255                                                            │   │
│  │        installMetaShim()      :929-1211  own-layer 注册（不受 restrict 相交过滤）         │   │
│  │        applyStageRestrict()   :565-585  交付期释放；per-session disposer 防交集叠加      │   │
│  │        autoAdvance(stage,…)   :518-525  完成信号驱动：ask/todo/exit/delivery            │   │
│  │        stageText(stage,…)      :224-252  we-form 阶段声明 + task 回显 + 引导           │   │
│  │        firstUserTask(session) :208-219  任务回显（v1.19.1）                             │   │
│  │        deliveryCheck(ctx,args) :414-501  交付 gate（file-exists/nonempty/utf8/evidence）│   │
│  │        filterToolGuidance      :279-289  按可见面裁 tool:* 段（39K SDK 注意力税）       │   │
│  │        windowFor(stage)        :113     v1.20 预解锁归零（只露当前档）                  │   │
│  │        STAGES 4 阶段           :83-88   了解/对齐 → 拟合方案 → 开发 → 验证              │   │
│  │        STAGE_GUIDES 常驻引导   :119-124 每阶段"完成信号"提示                            │   │
│  │        dev_reload_preset_live  :1213-1255 own-layer + bump ?v=N + recompose              │   │
│  └────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 注入器机制（runtime patching）

**核心哲学**（`injector/README.md:22-23`、`README.md:88-95`）："装什么由官方 bundle 决定；装完怎么改由注入器负责。" 不发明协议——注入的是标准 DSH 插件包（package.json + lib/）。

#### 2.2.1 装配链（一次官方 + N 次运行时）

```
唯一官方装配：dsh plugin --profile web add ./injector
              ↓
        cordis.patch.yml:1-6 声明 dsh-super-injector 为 bundle 层入口
              ↓
        重启 DSH（bundle 装配在启动时完成）
              ↓
        inject 常驻
              ↓
   dev_inject_plugin <dir>    ←─ 运行时
        ↓
   inject(dir)  (injector/src/index.ts:1918)
        1. cleanupStaleEntries(pkgName)        :1933
        2. hasActiveEntry 权威防重              :1935
        3. purgeCache(absDir)                  :1936  清 loadCache 防残缺 job 毒化
        4. junction 链接到 profile/node_modules :1944-1957（win32 用 symlinkSync 'junction'）
        5. await ctx.loader.create({name,config:{}}) :1961
        6. normalizeEntriesByName(pkgName)      :1966  清 loader 幽灵 disabled（让 client UI 可注册）
        7. refreshClientRow(pkgName)           :1968  client-modules.processOne 联动
        8. writeRegistry 持久化                 :1970-1974
        9. 双验证 host ✓ / client ✓             :1975-1978
```

#### 2.2.2 热重载核心（确定性 + 失败回滚）

`reloadPackage` 在 `injector/src/index.ts:1100-1320`（具体起止由 grep 标记）：**先备份当前 loadCache → 清掉目标 URL → import 拿新模块 → 用 entry.options.config 重建 fiber（旧 config 防覆盖）→ 失败时 Map.prototype.set.call 回滚备份**（`:1187-1188, 1224-1233`）。关键技巧：**loadCache 是 Node 内部特殊 Map，必须用 `Map.prototype.set.call / delete.call` 直接写**（`:994-1005` 注释警告）。

#### 2.2.3 自重载保护（防自杀连环）

`injector/src/index.ts:648-688`：三重护栏——

1. **强制收敛**：`matchesSelf(match)` 短路到自重载分支，否则走普通路径会 dispose 自身 fiber 后继续执行（鸡生蛋）
2. **最小间隔 10s**：`SELF_RELOAD_MIN_INTERVAL_MS = 10_000` + `selfReloading` 窗口锁
3. **节流状态落盘**：内存变量会随 fiber 重建归零（实测三次自重载都没拦住，`:658-108`），所以状态写在 `~/.dsh/super-injector/self-reload.json`

#### 2.2.4 Profile patch 写入的"幂等去重"

`writePatch` 在 `injector/src/index.ts:731-762`：DSH 官方 patch 文件初始是顶层 `[]`，盲 append `- id:` 会产生两个 YAML 顶层值导致解析崩溃。修正路径：移除顶层 `[]` → 按 id 归组 → 同 id 保留最后一条 → 已存在则幂等跳过（`:721-754` 注释明确标注「2026-08-15 别人机器 duplicate loader entry id 教训」）。`dev_fix_patch` 工具（`:2579-2639`）按相同语义扫描修复。

#### 2.2.5 Staging（侧挂）机制

`dev_stage_add/call/list/promote/demote`（`injector/src/index.ts:1491-1604`）实现「**挂后侧不进 tools schema、缓存零污染**」的测试工具链：

- 写入 `execute` JS 字符串 → `new Function('args','ctx',`return (${src})(args,ctx)`)` 编译
- 不调 `ctx.tools.register`，只在内存 `staged: Map` 存
- 测试通过 `dev_stage_call` 直接调，确认有效
- `dev_stage_promote` 才真正 `ctx.effect(() => ctx.tools.register(...))`（拿到 disposer 供 demote 真注销）
- `staging.json` 落盘 + 自重载/重启后恢复（`:1437-1489` `restoreStaging`）

#### 2.2.6 客户端 UI 联动（注入即完整生效）

`normalizeEntry`（`:1647-1671`）解决"注入插件的 UI 不生效"的根因——loader 运行时 `create` 的 entry 不在配置树里，`include.refresh` 会把它标 disabled 防双实例，而 `client-modules.processOne` 要求 `!entry.disabled`。注入器语义是「注入 = 完整生效」，所以立即清 disabled（同步 group.data）让 client 模块可注册。

#### 2.2.7 路由自愈（dev_clear_routes）

`injector/src/index.ts:2466-2494`：直接操作 `ctx.webServer.exact/prefixes/upgrades` 三张路由表，按 path 前缀删除热重载残留路由——免重启。

### 2.3 路由预设机制

#### 2.3.1 任务分类与 4 带量化（router-core.mjs）

```
用户首条真实消息（agent/inbox/claimed 捕获）
    │
    ▼
extractText(data)         :157-165   防御性解包 data.message（注入器 startIngest 的 seed 嵌套）
    │
    ▼
classifyTask(text)        :140-146   REACT_RE vs SPEC_RE 关键词计数
    │                                       react > spec → 1
    │                                       spec > react → 0
    │                                       tie/0 → 'weak'
    ▼
bandOf(mode)              :80-86     量化到 4 带
    │                                  <0.2 → 'spec' (稳定)
    │                                  <0.5 → 'transition' (不稳定，避开)
    │                                  ≥0.5 → 'react' (稳定)
    │                                  'weak' → 'weak' (内路由)
    ▼
personaFor(mode,modelId)  :89-96     按带 + 模型选 persona 文本
                                      spec/transition → SPEC_PERSONA / MIXED_PERSONA
                                      react → REACT_PERSONA
                                      weak + pro → WEAK_PRO (spec句+classify指令, P11/P24)
                                      weak + flash → WEAK_FLASH (neutral+三锚, P11)
    ▼
coreFor(mode)             :103-110   首轮核心工具面
                                      spec → ['read','edit','glob','grep']
                                      transition → [...以上, 'write']
                                      weak → ['str_replace_editor'] (RL shape, shell+editor)
                                      react → ['read','write','edit']
```

关键词正则（`router-core.mjs:128-129`）：
- **REACT_RE**（18 个中文 + 8 个英文）：开发|创建|写一个|生成|从零|...|build|create|develop|generate|implement|make a|new project
- **SPEC_RE**（15 个中文 + 9 个英文）：修复|修一下|调试|重构|维护|...|fix|debug|refactor|maintain|repair|broken|break|...

> **诚实标注**：这套分类器是**纯关键词计数**——复杂句法/语用完全不在内。`"今天天气怎么样"` 命中 0 → `weak`（router.test.mjs:30 验证）；`"开发并修复"` 同分 → `weak`（router.test.mjs:36 验证）。这种"模糊即 weak"的回退哲学也是 P11 实验结论：让模型在内路由窗口内自分类。

#### 2.3.2 装配链（router-bootstrap）

```bash
# 启动后首次 tool/call 之前
ctx.on('agent/inbox/claimed')     :613-619    存首条真实用户消息到 firstUserText[session.id]

# system-prompt/assemble 钩子
ctx.on('system-prompt/assemble', …, next) :621-668
   assembled = await next()
   agent = context.agent
   skip if agent.session.header.parentSession  # 子代理不路由（README.md:170 #5 修复）
   
   if not promoted (no tool/call yet):
     return { ...assembled,
              sections: baseSections,    # 只有 router-persona (RL_PERSONA 句)
              tools: filter(name=='phase_begin')  # 只露 phase_begin，确认开启
            }
   
   else (promoted 后):
     stage = ensureStage()[session.id]?.stage ?? 0
     fullNames = knownToolNames(toolsSvc, agent)  # 不受 restrict 过滤
     sections = filterToolGuidance(assembled.sections, stage, fullNames)
              # 裁掉不可调用工具的 tool:* 引导（39K SDK 注意力税）
     if first time: installMetaShim(agent)  # own-layer 注册 meta 工具
     sections.push(router-stage)            # we-form 阶段声明 + Task: <首条用户消息>
     sections.push(router-decl)             # PROGRESSIVE_DECL 常驻（人设常驻）
     sections.push(router-proactivity)      # PRESSURE_GUIDE 常驻
     if available.run_code:
       buildStagedSdk()                     # 给 tools:sdk 加阶段头
     return { ...assembled, sections, contexts: [] }

# 自主路由（pre-step）
ctx.on('agent/pre-step', …, next)  :671-699
   decision = await next()
   toolCalls = session.events.filter(time>=stageAt && type in {tool/call, tool/code-dispatch})
   advanceCalls = filter by tools.view(agent).visible  # 被拒的锁定调用不算行为信号
   nextStage = autoAdvance(stage, advanceCalls, text)  # 完成信号驱动 0→1→2→3
   if nextStage > stage:
     st.stage = nextStage
     saveStageState()                       # 持久到 ~/.dsh/router-standard/stages.json
     applyStageRestrict(agent, nextStage)   # restrict 是交集——释放旧 disposer 再设新

# 工具注册（7 个主注册 + own-layer shim 副本 7 个 = 14 入口）
phase_begin                :718-784   会话开启：存状态 → restrict → native 呈现 → inbox.append 引导
phase_advance              :786-821   显式推进（autoAdvance 也可自动）
tools_catalog              :823-847   一级披露（默认不点名未解锁；query 单点白盒）
tools_help                 :849-869   二级披露（完整 schema + 解锁阶段行）
dev_router_status          :871-898   当前 phase/band/persona/callable/override/preset
delivery_check             :900-924   交付 gate（v1.23 不再自跑 headless；只验 evidence）
dev_reload_preset_live     :1213-1255 own-layer: bump ?v=N + recompose (注: 仅同预设自升级)
```

#### 2.3.3 阶段晋升（严格 workflow，v1.19）

`autoAdvance`（router-bootstrap.mjs:518-525）：**完成信号驱动**，不是工具名/文本意图：

| 当前 → 下一 | 触发条件（任一） | 测试覆盖 |
| --- | --- | --- |
| 0 → 1 | `ask_user_question` OR `todo_write` OR `exit_plan_mode` | router.test.mjs:165-167 |
| 1 → 2 | `todo_write` OR `exit_plan_mode`（计划已锁定） | router.test.mjs:168-169 |
| 2 → 3 | `delivery_check`（交付门禁通过） | router.test.mjs:170 |

**显式禁止**："`tool usage alone never skips a stage`"（router-bootstrap.mjs:81,251 双重声明）。测试 `router.test.mjs:154-162` 特别防止退化：单纯用 `str_replace_editor view` 或用 `pwsh` 不算晋级；写了文本"写一个 HTML 页面"也不算（`autoAdvance(0,[],'写一个 HTML 页面') → 0`）。

#### 2.3.4 渐进披露（零预解锁，v1.20）

`windowFor(stage) = Math.min(stage + 1, STAGES.length)`（router-bootstrap.mjs:113）——**只露当前档**，看不到后续档工具名（避免"知道后面有工具"的焦虑与大跃进入口）。`runtimeMark` 以运行时 `view(scope).visible` 为准（`:363-371`）——不再用静态阶段映射，回应 v1.9 六轮实弹中"标可调但运行时未绑定"的错位。

`META_*` 常驻（`:104-107`）：phase_advance、dev_router_status、tools_catalog、tools_help、dev_reload_preset_live、delivery_check、phase_begin、get_goal、create_goal、update_goal。这些永远可调。

`GLOBAL_SAFE` 工具全集（`:94-102`）：STAGE_SAFE + META + engram_* 全套（记忆工具默认可调，被 `memoryMuted(session)` 检测到"不用记忆"则从允许列表剔除）。

#### 2.3.5 任务回显（v1.19.1 引导工程）

`firstUserTask(session)`（`:208-219`）：扫描 events 取 `source.kind === 'user'` 的第一条非空文本（plugin-origin 跳过），截断 160 字加 `…`，注入到 `stageText` 的 `'\nTask: ...'` 行（`:227`）。模型每轮都看清"我在为哪件事工作"——避免长会话跑题。

#### 2.3.6 plan-mode 保留（路径承诺）

`applyPersona`（router-core.mjs:193-198）：只过滤 `name === 'persona' || /persona/i.test(name)` 的段，**plan-mode 段保持不动**。这样 plan 边界（如 plan→execute 的切换）不会让模型"失忆"——README.md:54 自述 "plan-mode 保留：只替换 persona section，plan 边界不失忆"。

#### 2.3.7 缓存机制（设计纪律）

`PROGRESSIVE_DECL`（router-bootstrap.mjs:66-73）整段是**静态文本**：`tools_catalog` / `tools_help` / phase 文档等。这意味着无论工具解锁如何变化，**这段 system prompt 部分永远命中缓存**（README.md:53 "缓存 92-94% 命中"）。动态内容（阶段名/解锁工具列表）走 `router-stage` 段（order=1），也常驻；阶段内容只在晋阶瞬间变化（不是每轮），缓存利用率高。

#### 2.3.8 dev_router_mode / dev_mode_subagent（AI 自优化工具）

README.md:184-192 描述（router-bootstrap.mjs 内对应实现未单独列函数，而是 `overrideMap` globalThis Symbol `router-standard.overrides` 共享 main 注册与 shim，`:564`，set/get 由 `dev_router_mode` 工具接管；本次未单独 grep 到 `dev_router_mode` 的 `safeRegister` 行，但 `dev_router_status` 中 `mode = overrideMap().get(sid) ?? sessionMode(session)` 印证 override 的存在，`:883`）。`dev_mode_subagent` 在 README.md:186-188 描述为「在独立 context 内跑不同 mode」，由 router-bootstrap.mjs 的 `tool-subagent` 组合支持（agent.cordis.yml:228-240 的 `tool-subagent`/`tool-subagent-fork` 配置）。

### 2.4 P1-P23 实验的具象化（README.md:50-55 摘要 + 源码落地）

| README 主张 | 源码落地 |
| --- | --- |
| 三行为带 + weak 内路由 | `bandOf`/`personaFor`/`coreFor` 在 router-core.mjs:80-110 |
| 按模型选 persona（Pro=spec句+few-shot，Flash=neutral+classify） | `WEAK_PRO` vs `WEAK_FLASH` 区分（router-core.mjs:53-63） |
| 近距离引导（缓存 92-94% 命中） | `agent/pre-step` 注入 + `stageText` 常驻 + `PROGRESSIVE_DECL` 静态（v0.3.0 修复点 #34/#36/#55） |
| 单任务三锚（persona 静态，开放任务完成率 0% → 100%） | WEAK_FLASH 中 `review what you have already done` / `no environment checks` / `Think deeply first` 三句（router-core.mjs:58-63） |
| plan-mode 保留 | `applyPersona`（router-core.mjs:193-198） |
| AI 自优化工具 | `dev_router_status`/`dev_router_mode`/`dev_mode_subagent`（README.md:184-192） |

> **诚实标注**：P1-P23 的具体实验数据本报告**未读取** `preset/docs/paper.md`（19 KB）与 `preset/docs/experiments.md`（14 KB），但所有机制对应都有源码或测试断言支撑（`router.test.mjs`、`router-bootstrap-v34.selftest.mjs`）。

---

## 3. Adopt / Adapt / Reject 映射本项目 (AGE)

先回应指定映射点：

- **「运行时管理层 vs 路由策略层」是两层独立产品**：injector 与 preset 在本 suite 内**互不 import**（injector/peerDeps 只声明 DSH 家族 + cordis + schemastery；preset 是 0 依赖的纯 `.mjs`）。这给我们一个干净信号——如果 AGE 要"借鉴"任何一层，可以单独拆。
- **"装配链真实 vs 算法正确"是该 suite v0.3.0 的最大教训**：README.md:58-62 列的 6 条 v0.3.0 修复几乎都是「装配链让算法拿到错的数据」。AGE 的 FlowEngine / mission-driver 若做 prompt-injection 类优化，必须先把"事件序/作用域/inbox.claim 同步语义"摸清，再写算法。
- **router-core 的"非连续量化"哲学**对 AGE 是个提示：DeepSeek V4 persona 轴是相变不是连续——**任何「让模型更听话」的连续参数都可能掉到不稳定带**。这影响我们日后是否做"模式路由"，以及怎么做。

| # | 模式 | 判定 | 映射与理由 |
| --- | --- | --- | --- |
| 1 | **junction + loader.create 注入 + loadCache 备份回滚**（`injector/src/index.ts:612-621, 987-1030, 1187-1188, 1224-1233`） | **Adopt** | AGE 的 mission-driver 若需要"加载外部 mission 包"，沿用此机制可获免重启；关键是 `Map.prototype.set.call(loadCache, u, job)` 这种 Node 内部 Map 的特殊写法和 URL realpath 匹配细节。 |
| 2 | **profile patch 幂等去重 + 顶层 `[]` 兼容**（`writePatch` :731-762） | **Adopt** | AGE 配置文件幂等写同一规律（避免重复 install 后 YAML 双顶层值崩）；与 DSH loader id 唯一性同源。 |
| 3 | **own-layer shim 不受 restrict 相交过滤**（`installMetaShim` router-bootstrap.mjs:929-1211） | **Adapt** | AGE 若做"工具面门控"，shim 模式可作为"门控后仍能调管理工具"的范式；要权衡"管理面与执行面混在同一 scope 的可审计性"。 |
| 4 | **staging 缓存零污染**（`dev_stage_add` :1491-1520 不进 tools schema） | **Adapt** | AGE 的 plan 试运行可借鉴——"先侧挂验证、通过再转正"的纪律可避免 plan-promotion 时的注意力税；不过要小心 `new Function(src)` 的安全边界（注入器限制为「仅可信代码」，:1498 description）。 |
| 5 | **agent/inbox/claimed 同步捕获首条真实消息**（router-bootstrap.mjs:613-619） | **Adopt** | AGE 的 flow 第一步若要根据首条任务做模式选择，沿用"装配前抢先捕获"是稳的；关键修复是「跳过 plugin-origin message」（router-core.mjs:149-155 的 `sessionMode` 逻辑）。 |
| 6 | **关键词计数 + 4 带量化分类器**（router-core.mjs:128-146） | **Adapt-lite** | 如果 AGE 决定做"任务类型 → flow 分支"，可以照抄"build/fix 关键词 + 不确定时 weak 兜底"哲学；但需重新评估我们的语料（中文英文比例、技术任务定义），不能直接复用 REACT_RE/SPEC_RE。 |
| 7 | **模型差异（Pro vs Flash）persona 选**（router-core.mjs:53-63, 89-96） | **Adapt** | AGE 若接多模型，可借鉴"按模型调锚定强度"的范式；但 V4 的最优解不一定适用于其他模型——必须独立 P-test 而非移植。 |
| 8 | **近场引导 + 远场衰减**（v0.3.0 #34/#36/#55 修复点；README.md:53、:198-200 实战条） | **Adopt** | 这是普适机制——任何"每轮给模型加引导"的设计都应走 `agent/pre-step` 注入同一请求，而非旧式 `session/event`（rc.6 起已收不到）或 inbox 后续 `next-step` append（会触发第二次 API 调用 = 2× 费用）。 |
| 9 | **阶段晋升的"完成信号"而非"工具名/时间"**（`autoAdvance` :518-525） | **Adopt** | AGE 的 flow stage gate 若设计阶段门控，"完成本阶段工作"是更稳的信号；不要用"调过 N 个工具""经过 M 分钟"。 |
| 10 | **delivery_check 的 evidence schema + numeric invariant 引导**（router-bootstrap.mjs:414-501） | **Adopt** | 适合做"flow 结束必须给证据清单"的纪律；v1.28 加 `numeric` kind 让模型自己算守恒量是聪明的引导（不强杀）。 |
| 11 | **plan-mode 仅换 persona section**（`applyPersona` router-core.mjs:193-198） | **Adapt** | AGE 若做"切换 plan / execute"，类似"切换时只换必要 section，保 plan 段不动"的范式可借鉴。 |
| 12 | **双验证 host ✓ / client ✓**（injector/src/index.ts:1975-1978） | **Adopt** | AGE 的插件/能力加载返回结构可借鉴——单一"成功"易漏 UI/UI-only 等隐式失败路径。 |
| 13 | **整套 persona 预设为「DSH 专属」**（router-standard/preset.yml:1-3 标 "Router Standard"、agent.cordis.yml:1 注释「the standard coding agent, presented in NATIVE mode」） | **Reject** | 与 AGE 的产品形态不对位——DSH agent persona 是「写代码+debug」轴，我们是「autonomy/git/plan」轴。 |
| 14 | **injector 的 client bundle 必走 `npm run build:client`（tsdown）**（`injector/README.md:252`、install.ps1:11-27） | **Reject（与 AGE 形态无关）** | AGE 是 Node CLI 进程，无浏览器端 bundle 概念。 |
| 15 | **staging 的 `new Function(src)` 动态编译**（injector/src/index.ts:1506） | **Reject** | 与"插件代码必须可审计可重载"的纪律冲突；除非真有必要，否则 AGE 不应引入运行时任意代码执行面。 |
| 16 | **router-pro 线（planned 但未发布）**（README.md:42 标注） | **Reject** | 仅为研究轴，不在生产级。 |
| 17 | **injector 的 `dev_scaffold_plugin` 4 形态（toolkit/daemon-loop/ui-panel/hybrid）**（injector/src/index.ts:2823-2894） | **Adapt** | AGE 若支持扩展插件，形态化骨架是合理的；但 DSH-specific（client/runtime/llm 注入）需替换为我们自己的服务接口。 |
| 18 | **probe/ 目录存历史实验数据，已断链**（AGENTS.md:96-98） | **Reject** | 风格可参考——"归档而非删除"是好习惯；但本项目无类似需求。 |

---

## 4. 风险与不适用面

1. **强 DSH 版本耦合**：injector 的 `peerDeps` 虽声明范围（`>=0.0.1-rc <2`、`>=4.0.0-rc <5`，injector/package.json:40-44），但**实际访问的内部 API**（`ctx.loader.internal?.loadCache`、`ctx.webServer.exact/prefixes/upgrades`、`toolsSvc.layers.scoped`）都是未公开 seam。DSH 任何升级都可能让这些 seam 漂移。借鉴其代码必须连同「跟随 RC 重写」的成本一起评估——README.md:71-77 自述「DSH 升级不报废」但仅指"peer 范围声明"层面。
2. **路由预设强依赖 DSH 0.1.0-rc.6+ 的事件序**：router-bootstrap.mjs:2-15 注释明确「时序（用户定稿）」，依赖 `agent/inbox/claimed` 同步触发 + `system-prompt/assemble` waterfall + `agent/pre-step` 拿 decision.messages；DSH 任何 RC 重排事件都让 router 失效（README.md:58-62 v0.3.0 修复的本质）。
3. **关键词分类的"低天花板"**：REACT_RE/SPEC_RE 共 ~50 个词，中英文对半。中文古文 / 双关 / 反问句会失效（"你说我写得不行？你自己来试试"中"试"不命中但句意是 spec）；长任务描述（>120 字）走 `isComplexTask` 复杂度启发（router-core.mjs:65-72）但与 band 分类**正交**——复杂度只决定**引导深度**，不改变 persona 选择。AGE 若沿用必须扩展词表或加 LLM 兜底。
4. **注入器的"自我保护"逻辑复杂度高**：`injector/src/index.ts:648-688` 自重载护栏（10s 间隔、self-reload.json 持久化、`matchesSelf` 短路）是踩了 6+ 个坑后才稳定；复用其代码必须保留全部护栏，否则会重蹈"连环自杀无人兜底"。
5. **injector 的"双路径"语义需谨慎**：运行时装配（`dev_inject_plugin`，免重启，开发态）vs `dev_install_package` 落 profile bundles（重启后由官方接管，生产态）——README.md:114-117 明确"注入清单只是运行时恢复缓存，不是第二安装数据库"。如果 AGE 引入类似分层，必须**也声明这个边界**，否则会陷入"两份安装数据库互相覆盖"的运维噩梦。
6. **PTC/run_code 折叠模式已退役**：v1.15 决定走 native 直调（`router-bootstrap.mjs:769` 注释 "v1.15 定案：wire = restrict 过滤后的可见工具... 且所有工具直接可调（无折叠）"）。这是 router-standard 自己的演进，AGE 不受影响但不要被旧资料误导——`STANDARD-PLAN.md`（32 KB）可能还在讨论 PTC 路线（本次未读，仅 ls 大小）。
7. **router-spec 与 router-react 的 bootstrap 文件未深读**：仅读了 `router-core.mjs`（与 standard 几乎一致，diff 仅 `sessionMode` 实现差异）和 `preset.yml`，**未读** `router-spec/router-bootstrap.mjs`（17.5 KB）与 `router-react/router-bootstrap.mjs`（14.7 KB）。这两个变体的具体机制差异（README.md:35-37 描述 standard 走 RL 句+完整 sections、spec 走深度思考、react 走 RL 接口还原）需补读才能完整对比；下文 1.1 列出的"标配/深度/RL 还原"三档定性来自 README 自述。
8. **probe/ 数据已断链不可复现**：AGENTS.md:96-98 明示 "probe 是历史实验快照（脚本已断链，不修依赖），数据/大件入 .gitignore"——P1-P23 的原始实验**不能在当前环境重跑**。这意味着"借鉴 P 数据"必须接受"经验值"而非"可复现实验"。
9. **win32 强依赖**：`install.ps1` 是 PowerShell（Windows 专属），`gitbash-shell` 组（agent.cordis.yml:75-89）是 `disabled: !!js process.platform !== 'win32'`。macOS/Linux 部署需重写安装脚本。AGE 项目当前在 macOS 调研阶段（env 提示 darwin），**复用任何 win32 假设的代码前要审视**。
10. **injector 的"prompt 注入是缓存优势"论断**（injector/README.md:194-200「系统提示词注入遵守缓存原则」）的前提是 DSH 的 LLM 客户端确实按前缀缓存命中优惠（实测便宜 10 倍，injector/README.md:194）。AGE 若接别的 LLM 客户端，这条经验**不一定成立**。
11. **manifest 持久化的"绝对路径"假设**：registry.json（`injector/src/index.ts:576`）用绝对路径；移到机器后失效——这是常识，但 AGE 若引入类似清单必须明确"跨机迁移"语义。

---

## 5. 关键源码索引

| 主题 | 位置 | 说明 |
| --- | --- | --- |
| **SUITE 入口** | `README.md:1-72` / `README.en.md:1-78` | 套装自述（中文+英文）、组件表、P1-P23 摘要、v0.3.0 修复清单 |
| | `install.ps1:1-69` | PowerShell 一键安装；injector 构建 + 平铺复制两个 preset + 自检 |
| **INJECTOR 入口** | `injector/README.md:1-261` | 哲学 + 工具全家桶 + 插件开发指南 10 铁律 + 生态定位 |
| | `injector/package.json:1-56` | peerDeps 范围声明、`dsh.bundle.patch` + `dsh.client.inject` |
| | `injector/cordis.patch.yml:1-6` | 唯一官方 bundle 层入口 insert |
| | `injector/INSTALL.md:1-210` | 三种安装方式（A/B/C）+ 故障修复 + 验证 + 卸载 |
| **INJECTOR apply** | `injector/src/index.ts:570-3210` | 主注册表 + 工具全家桶；`apply()` 入口 `:570`，含 `withOpLock` `:564` |
| | `injector/src/index.ts:584-599` | `readRegistry` / `writeRegistry`（atomic write .tmp+rename） |
| | `injector/src/index.ts:602-609` | `hasActiveEntry`（权威防重） |
| | `injector/src/index.ts:612-621` | `purgeCache`（realpath URL 匹配） |
| | `injector/src/index.ts:656-688` | 自重载保护（self-reload.json 落盘节流） |
| | `injector/src/index.ts:696-713` | `auditLog` + `rotateLog`（>1MB 滚动 .1/.2） |
| | `injector/src/index.ts:731-762` | `writePatch`（幂等去重 + 顶层 [] 兼容） |
| | `injector/src/index.ts:1100-1320` | `reloadPackage` 整包热重载（备份回滚） |
| | `injector/src/index.ts:1450-1604` | `restoreStaging` + `dev_stage_add/call/list/promote/demote` |
| | `injector/src/index.ts:1647-1671` | `normalizeEntry`（清 loader 幽灵 disabled） |
| | `injector/src/index.ts:1918-1979` | `inject(dir)` junction → loader.create → normalize → writeRegistry |
| | `injector/src/index.ts:1982-2080` | `uninject(match, allowSelf)` entry.remove → writePatch disabled → rm junction |
| | `injector/src/index.ts:2086-2126` | `clientSkeletonProblems` + `buildFreshnessProblems`（注入前校验） |
| | `injector/src/index.ts:2357-2359` | `safeRegister`（统一 ctx.effect 包装） |
| | `injector/src/index.ts:2394-2430` | `dev_inject_plugin` 工具入口 |
| | `injector/src/index.ts:2448-2464` | `dev_uninject_plugin` |
| | `injector/src/index.ts:2466-2494` | `dev_clear_routes`（路由自愈） |
| | `injector/src/index.ts:2496-2521` | `dev_reload_package` |
| | `injector/src/index.ts:2523-2560` | `dev_reload_preset`（bump ?v=N 绕 ESM 缓存） |
| | `injector/src/index.ts:2562-2577` | `dev_heal_links`（profile junction 自愈） |
| | `injector/src/index.ts:2579-2639` | `dev_fix_patch`（按 id 去重 + --check） |
| | `injector/src/index.ts:2641-2657` | `dev_plugin_status`（操作统计 + 当前插件清单） |
| | `injector/src/index.ts:2823-2894` | `dev_scaffold_plugin`（4 形态骨架） |
| **PRESET 入口** | `preset/README.md:1-246` | 路由哲学 + P1-P23 摘要 + 三带量化表 + 模型差异 + 阶段晋升语义 |
| | `preset/package.json:1-35` | 测试脚本（node --test）+ probe（已断链） |
| | `preset/AGENTS.md:1-110` | 「编辑基准无版本别名 + 同步 + bump + reload」工作流 |
| **PRESET ROUTER-STANDARD 装配** | `preset/router-standard/agent.cordis.yml:1-298` | 298 行 agent-plane composition；`:33-45` persona 模板、`:64-66` router-bootstrap 入口（`?v=88`）、`:75-89` gitbash-shell 组、`:149-169` plan-mode 段、`:182-203` compaction 组、`:216-275` delegation 组 |
| | `preset/router-standard/router-core.mjs:1-213` | 0 依赖路由决策库 |
| | `:27-30` | `MODE_SPEC/MIXED/REACT/WEAK` 常量 |
| | `:32-44` | SPEC/MIXED/REACT persona 文本 |
| | `:53-63` | WEAK_PRO / WEAK_FLASH 差异 |
| | `:65-72` | `isComplexTask`（长度>120 或架构关键词） |
| | `:75-77` | `isFlashModel`（/flash/i） |
| | `:80-86` | `bandOf`（量化到 4 带） |
| | `:89-96` | `personaFor`（按带+模型） |
| | `:103-110` | `coreFor`（首轮核心工具面） |
| | `:113-116` | `bandFor`（人类可读名 transition→mixed） |
| | `:120-126` | `testinessFor`（suppressed/normal/light） |
| | `:128-129` | REACT_RE / SPEC_RE 关键词正则 |
| | `:140-146` | `classifyTask` |
| | `:149-155` | `sessionMode`（#13 跳过 plugin-origin） |
| | `:157-165` | `extractText`（嵌套 data.message 解包） |
| | `:173-182` | `advanceStage`（备份，v34 不再用） |
| | `:193-198` | `applyPersona`（仅换 persona section，保 plan-mode） |
| | `:201-213` | `parseMode`（band 字符串/百分比/小数/auto） |
| | `preset/router-standard/router-bootstrap.mjs:1-1281` | Cordis 钩子装配 + 工具注册 + shim |
| | `:17-19` | 从 router-core-v34 导入（与 router-core 是同步副本 + 版本戳） |
| | `:20-24` | 仅 node 内置 fs/path/os/url/vm |
| | `:56-66` | RL_PERSONA + ROUTER_VERSION='v1.20.0' + DESC 描述单源 |
| | `:66-73` | `PROGRESSIVE_DECL` 静态段（缓存命中） |
| | `:74-75` | `PRESSURE_GUIDE` 主动性段 |
| | `:76-81` | `START_GUIDE` Bootstrap 一次性提示 |
| | `:83-88` | `STAGES` 4 阶段定义 |
| | `:93-102` | `STAGE_SAFE` + `GLOBAL_SAFE` 派生 |
| | `:104-107` | `META_TOOLS` / `META_LIVE` / `META_GOAL` / `META_ALL` |
| | `:113` | `windowFor(stage)` 零预解锁 |
| | `:119-124` | `STAGE_GUIDES` 常驻引导 |
| | `:128-134` | `stageSummary`（单一事实源） |
| | `:136-141` | `stageInfo`（stage/meta/host 三种 kind） |
| | `:143-150` | `preUnlockedFor`（已归零） |
| | `:152-159` | `catalogMarkExtra`（统一标注） |
| | `:161-166` | `helpUnlockLine`（统一解锁阶段提示） |
| | `:168-176` | `categorizeDomain`（域分类单源） |
| | `:178-181` | `isMemoryTool` + `muteAwareList` |
| | `:184-191` | `sessionFresh`（reason=initial 自动从 0 开始） |
| | `:195-205` | `memoryMuted`（检测"不用记忆"） |
| | `:208-219` | `firstUserTask`（任务回显，v1.19.1） |
| | `:224-252` | `stageText`（we-form 阶段声明 + Task + 引导） |
| | `:256-267` | `buildStagedSdk`（PTC 兼容路径，standard 已弃） |
| | `:279-289` | `filterToolGuidance`（裁 tool:* 段） |
| | `:305-347` | `registryFullIndex`（全量索引不受 restrict 过滤） |
| | `:352-359` | `markerFor`（静态映射） |
| | `:363-371` | `runtimeMark`（运行时真绑定） |
| | `:376-385` | `runtimeCallable`（与 SDK 100% 同源） |
| | `:388-403` | `paramHint`（参数名+类型速览） |
| | `:414-501` | `deliveryCheck`（交付 gate，5 项检查 + evidence schema） |
| | `:518-525` | `autoAdvance`（完成信号驱动 0→1→2→3） |
| | `:528-557` | 阶段状态持久化（stages.json v2 格式） |
| | `:559-585` | `applyStageRestrict`（per-session disposer） |
| | `:587-1267` | `apply(ctx, config)` 主入口 |
| | `:613-619` | `agent/inbox/claimed` 抢先捕获首条真实消息 |
| | `:621-668` | `system-prompt/assemble` 钩子（首轮 vs promoted 分支） |
| | `:671-699` | `agent/pre-step` 完成信号驱动阶段推进 |
| | `:718-784` | `phase_begin` 工具（fresh 自动 + legacy 兼容） |
| | `:786-821` | `phase_advance` |
| | `:823-847` | `tools_catalog`（query 单点白盒） |
| | `:849-869` | `tools_help` |
| | `:871-898` | `dev_router_status` |
| | `:900-924` | `delivery_check` |
| | `:929-1211` | `installMetaShim`（own-layer 注册；goal 工具转发） |
| | `:1213-1255` | `dev_reload_preset_live`（bump + recompose） |
| | `:1270-1276` | `readPresentation`（native/code 状态自检） |
| **TESTS** | `preset/router.test.mjs:1-281` | 17 个 test：classify/band/persona/plan-section survival/autoAdvance/stageText/runtimeMark/paramHint/deliveryCheck/muteAwareList |
| | `preset/router-standard/router-bootstrap-v34.selftest.mjs:1-132` | 132 个静态断言，覆盖 v1.4~v1.19.1 各阶段硬门控、不变量、引导文案 |
| | `preset/router.integration.test.mjs` (576 行) | 真实链路 replay（claim→assemble→pre-step）—— 本次**未深读** |
| **PRESET ROUTER-SPEC** | `preset/router-spec/agent.cordis.yml` (15,166 字节) | 深度思考优先变体（具体差异未逐行对比） |
| | `preset/router-spec/router-core.mjs:1-206` | 几乎与 standard 一致，diff 仅 `sessionMode`（`:148-165` 跳过 plugin-origin 实现） |
| | `preset/router-spec/router-bootstrap.mjs` (17,580 字节) | **本次未深读** |
| | `preset/router-spec/preset.yml:1-2` | "Router Spec (experimental)" 描述 |
| **PRESET ROUTER-REACT** | `preset/router-react/router-core.mjs:1-194` | 与 standard 几乎一致（已读到 60 行） |
| | `preset/router-react/router-bootstrap.mjs` (14,757 字节) | **本次未深读** |
| | `preset/router-react/preset.yml:1-2` | "Router React (experimental)" RL 接口还原描述 |
| **PRESET 实验/设计** | `preset/docs/paper.md` (19 KB) / `docs/experiments.md` (14 KB) / `docs/STANDARD-PLAN.md` (32 KB) / `docs/blog.md` (12 KB) / `docs/FEEDBACK-v34.md` (6.5 KB) / `docs/statement.md` (7 KB) / `docs/apology.md` (5.5 KB) | 全部仅 ls 列名，**未深读**（README/AGENTS 引用为权威规范） |
| | `preset/probe/README.md` / `probe/cot-lexicon.md` (7.4 KB) | 历史实验快照，已断链（AGENTS.md:96-98） |
| **CHANGELOG** | `injector/CHANGELOG.md` (16.6 KB) / `preset/CHANGELOG.md` (25.6 KB) | 仅 ls，**未读**（版本史与升级指引） |
| **SUITE 元** | `dsh-routing-suite/.git/` | 仓库 git 历史（未查 log） |
| | `dsh-routing-suite/docs/` | FLATTEN-MIGRATION.md（submodule→直接文件迁移记录）—— **未读** |
| | `dsh-routing-suite/scripts/` | 仅 ls，**未深读** |