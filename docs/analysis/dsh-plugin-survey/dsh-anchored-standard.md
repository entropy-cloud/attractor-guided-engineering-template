# dsh-anchored-standard 调研报告（dsh-plugin-survey）

> 调研范围：仅本地克隆 `~/ai/dsh-plugins/dsh-anchored-standard/`（浅克隆，main @ 25f21ae）。stars 数未在线核验。

| 项 | 值 |
|---|---|
| 本地路径 | `~/ai/dsh-plugins/dsh-anchored-standard/` |
| 来源 repo | https://github.com/xiaobright/dsh-anchored-standard |
| stars | ≈3.7K（任务书口径；FAREWELL.md 自述"三千多个 star"（2026-08-17），未在线核验） |
| 语言 / 运行时 | 零依赖 ESM JavaScript（.mjs），Node ≥22.19（package.json:8-9） |
| license | MIT；Copyright xiaobright + Portions Copyright DeepSeek（LICENSE:1-3） |
| 宿主 API 面 | 事件：`session/event`、`system-prompt/assemble`、`agent/pre-step`、`agent/request`、`agent/inbox/inserted`、`tools/pre-execute`、`tools/post-execute`；服务：`ctx.tools.register/schemas/execute`、`ctx.skills.list/get`、`ctx.get('fs')`、`agent.inject`、`agent.inbox.prepend`；durable 日志 `session.events` 与 `session.header.delegationDepth/cwd`；waterfall after-next 逆注册序 + `prepend` 标志；isolate realm / `provide()` 碰撞语义 |
| 项目状态 | 维护期：2026-08-17 起 API 涨价致评测循环不可负担，仅修 bug（README.md:17-27、FAREWELL.md） |

## 1. 定位

社区版 DeepSeek Harness 实验预设合集（非官方）：**先以 Minimal 条件锚定会话模型轨迹，再按需升级为小驻留目录 + 按需解锁的 Standard 能力**。动机是实测 DeepSeek V4 Pro 强烈条件于 API 可见工具目录——Project2 上 Standard/PTC 得 91/92 而 Minimal 得 99/96（README.md:113-117）；但永久 Minimal 又放弃 Standard 的宽工具面。解法是把"首轮轨迹选择"与"后续工具能力"解耦。仓库含 7 个模式目录（preset 基础模式 + zero-anchored/whoami/prefab/eternal-minimal/wire-think/combo 五变体），每个自足可单独安装（README.md:36-50）。"trajectory"指首条推理链风格：Minimal 条件产 "We need…" 开头，Standard 条件产 "Let me…" 开头（README.md:54-59）。

## 2. 架构与机制（两阶段的组合与触发——源码级）

### 2.1 两阶段生命周期

```
request #1（bootstrap 相）: bash(PTY persistent) + str_replace_editor，无自动注入上下文
   │ 首个 durable tool/call 或 assistant/message（promoteOn: either）
   ▼ PROMOTION —— 由 durable 事件推导，resume/reload 保持
request #2+（resident 相）: bootstrap 对 + 三个发现工具 + 模型显式解锁的工具；
   注入上下文恢复（快照投影恰好补一条 fresh runtime-context 消息）
```
（README.md:79-95；`compaction/end` 边界会把会话打回受控相，即"第二次首次请求"，见 2.2。）

### 2.2 各本地行的贡献

- **相态机（共享底座）**：`shared/compaction-epoch.mjs:26-81` 的 epoch-aware promotion tracker。冷启动全量扫 durable 日志一次后 O(1) 增量维护（:33-48, :68-79）；`compaction/end` 重置 boundary 并 demote（:38-41）；subagent（delegationDepth>0）默认视为已晋升，`includeSubagents:true` 才跟随锚定期（:62-64）。所有相态都从 durable 事件推导 → 重启不丢相。
- **context-gate（必须第一行）**：统一拦截宿主两条注入路径。路径 a：未晋升时清空 assembly 的整个 `SystemPrompt.context()` 族（沙箱/审批快照与第三方 provider），不逐一枚举（shared/context-gate.mjs:158-171）；路径 b：pre-step 瀑布只保留 claimed 消息批 + `allowKinds` 白名单（默认仅 `['skill-invocation']` 用户手势，:94,:177-201）。第一行注册 = after-next 逆注册序下最外层 transform，后注册者无法再注回去（:56-59；preset/agent.cordis.yml:37-41）。两条路径失败均降级为"保留一切"+warnOnce（:61-63,:166-170,:196-200）。
- **tool-bootstrap**：请求 #1 目录钉死为官方 Minimal 真实对（`DEFAULT_BOOTSTRAP_TOOLS = ['bash','str_replace_editor']`，shared/tool-bootstrap.mjs:130）；晋升后收窄为驻留集 = bootstrap 对 + 发现三件套 + `unlockedFor()` 从 durable `tool/call` 参数解析出的已解锁名（:133,:208-225,:249-255）；缺工具时降级放全目录而非抛错（:228-242）。可选 `bootstrapMaxTokens` 首轮限 output budget，且晋升后必须**显式剥离**——下一请求的 seed proposal 会继承上一 header 的 maxTokens（:284-292）。
- **升级触发条件**：`promoteOn: either|tool-call|assistant-message`。默认 `either`（首个工具调用或首条 assistant 消息孰早）修复了纯文本首回复把会话永久困在 bootstrap 的陷阱（tool-bootstrap.mjs:9-15）；请求 #1 恒见 bootstrap 目录、#2 恒见驻留目录（preset/agent.cordis.yml:69-73）。
- **instruction-hint**：以一次性提示替代 `dsh-agent-instructions` 的 AGENTS.md/CLAUDE.md 全量 digest 注入。晋升后探测项目链（AGENTS.md 等 4 候选向上走到 .git 根）+ 用户全局文件，注入一条"这些文件存在，动手前先读"提示（shared/instruction-hint.mjs:57,:188-214）。去重守卫从 durable 日志扫 `source.kind==='instruction-hint'` 的 user/message（:150-163），配合确定性 id `instruction-hint-${sessionId}`（:219）→ 重启绝不二次注入（重复 id 会破坏历史回放）。其 kind 不在 gate 白名单内，故未晋升时天然被 gate 剥掉（:36-41）。
- **dev-tool-search / skill-search（按需解锁面）**：`dev_tool_search` 的描述本身是一份"驻留集做不到什么"的能力索引（web_search/subagent/workflow/ralph/goals/read_image/jobs/多代理控制/todo_write/ask_user_question，shared/dev-tool-search.mjs:48-59），按关键词搜全目录并按精确名解锁，解锁记录即 durable `tool/call` 参数故 resume-safe。`skill_search/skill_load` 取代 `dsh-tool-skill` 的 ~9KB `<available_skills>` 全量注入（该注入使锚定 0/9 复现，skill-search.mjs:5-8）：搜索返回 ≤20 条摘要，`skill_load` 经 `agent.inject` 以 `skill-invocation` kind 注入单个技能全文（恰在 gate 白名单内得以存活，shared/skill-search.mjs:54-131）。注意二者必须替换而非并存挂载（skill-search.mjs:24-26）。

### 2.3 Minimal 与 Standard 的工具目录差集

| 相 | 工具 |
|---|---|
| bootstrap（#1） | `bash`（persistent PTY，Windows 用 custom-bash 行同名额替代）、`str_replace_editor`（isolate fs 组内裸本地 fs，preset/agent.cordis.yml:169-197,:233-247） |
| resident（#2+） | bootstrap 对 + `dev_tool_search`/`skill_search`/`skill_load` + 已解锁名；read/write/edit/glob/grep/todo/ask **刻意不驻留**（bash+editor 可覆盖，tool-bootstrap.mjs:64-66） |
| compaction 窗口 | 另加核心工作集 `[read, write, edit, glob, grep, todo_write, ask_user_question]`（preset/agent.cordis.yml:91） |
| 重工具（按需解锁） | web_search、subagent/subagent_fork、workflow、ralph、goals 三件、read_image、job_*、interrupt/send/list_agents、todo_write、ask_user_question（dev-tool-search.mjs:48-59） |

### 2.4 子代理与健壮性设计（横切）

- **子代理**：默认 `includeSubagents:false` 时 delegationDepth>0 直接视为已晋升（compaction-epoch.mjs:62-64），保证委派首请求可用工具；基座模式两行都开 `true`，使"委派不能重新引入一个不受控的首请求"（preset/agent.cordis.yml:43-46，issues #38/#52）。gate 行与 bootstrap 行的该 flag 必须人工保持同步（README.md:205,:225）。
- **降级矩阵**：gate 过滤失败→保留全部注入；bootstrap 过滤失败→放全目录；缺 fs→无提示；hint 注入失败→跳过——共同哲学是"门 bug 永不吞用户上下文、永不 brick 会话"（context-gate.mjs:61-63; tool-bootstrap.mjs:82-87; instruction-hint.mjs:225-229）。
- **mount-time fail-fast**：三个插件都拒绝未知 config key 与非法枚举（apply 即 TypeError → preset mount 失败可见可修），与运行时降级形成两层分工。
- **注册序纪律**：`inject` 刻意为空数组使本行能先于一切注入者注册；pre-step/request 监听用 `prepend:true` 对抗并发 apply 下行序不决定监听序的问题（tool-bootstrap.mjs:95-103,:276-281）。
- **测试**：19 个零依赖 `node --test` 文件覆盖全部共享插件；`npm run check` = sync 一致性 + 全测（package.json:11-13；HANDOFF-2 记录 194/194 绿）。

### 2.5 变体一句话

zero-anchored（0 工具 + 合成锚定轮，anchor-turn 向 inbox prepend 固定提示，shared/anchor-turn.mjs:20-52）、whoami（"你是谁"自我介绍轮）、prefab（种子化成功轨迹；锚定质量 = Σ带工具调用消息的回传 reasoning 字符数，HANDOFF-2 §1.1/§2.1）、eternal-minimal（永不晋升，重工具经 `dshx` bash 网关走 `tools/pre-execute` deny 通道真实执行，eternal-minimal/eternal-minimal.mjs:1-50）、wire-think（wire 级 `tool_choice:none` + sibling provider，正文未读）、combo（think/execute 分离 + deliberation-gate + cot-drip 每 4 个工具结果滴一条 "We…" 节拍，shared/cot-drip.mjs:1-40）。

## 3. 对本项目的可用模式（Adopt/Adapt/Reject）

AGE preset（plugin/dsh/preset/age/agent.cordis.yml）在 M4-WI14 已借用的是**组合形状**：相对行先例（`./age-mode.mjs` :31-33 ↔ anchored 的 `./context-gate.mjs` 等）、头注 isolate realm 规则（:8-23 ↔ preset/agent.cordis.yml:12-19，含 "shared label 不池化实例、同 realm symbol 二次 provide() 抛错"）、combo 的 preset.yml display 形状 `{name,description,order}`、standard 子集 + 本地行的姿态、compaction group entry-local realm 形状含 tokenMeter 不入 realm 的论证（age:95-124 ↔ anchored:315-344）。逐项核对增量价值：

- **Adopt A1 — skill-search 式按需加载省 token**：AGE 目前挂全量 `dsh-tool-skill` catalog 注入（age/agent.cordis.yml:85-87）与 `dsh-agent-instructions` maxBytes 65536（:47-51）。anchored 的量化证据：catalog ~9KB 且扰动轨迹（issue #6：在场 0/9 锚定 vs 无 ~81%）。对 AGE 这是 token 成本问题而非轨迹问题（mission-control-* 技能目前少）；若 skills/ 复用面扩大，可 Adapt 出可选行（搜索摘要上限 20、"描述即索引"写法直接可抄）。注意必须整行替换 dsh-tool-skill。
- **Adopt A2 — once-per-session 注入的 restart-safe 惯例**：durable 日志扫描去重 + 确定性消息 id（instruction-hint.mjs:150-163,:219）。对 mission-driver/mission-control 任何"每会话一次"的引擎侧注入直接适用。
- **Adopt A3 — 配置与降级纪律**：未知 config key 在 apply 时抛错（= preset mount 时可见）+ 运行时失败一律降级保原值 + warnOnce（context-gate.mjs:61-63,:126-138; tool-bootstrap.mjs:82-87）。age-mode.mjs 及后续 DSH 插件行可整套沿用。
- **Adopt A4 — self-containment 测试**：test/self-containment.test.mjs 断言各模式无 `../` 行且 materialized 副本与 shared 一致（`npm run check` 门）。AGE preset 单目录自足，可加同形断言防相对行漂移。
- **Adopt A5 — 坑位情报**：`ctx.tools.schemas()` 不传 scope 只见全局层，preset 层工具需 `schemas(exec.agent)`（dev-tool-search.mjs:100-105，issue #24）；seed proposal 继承上轮 header maxTokens 故临时 cap 必须显式回收（tool-bootstrap.mjs:284-292）；监听 UI RPC 事件的插件在 headless 驱动下需手动补发事件（HANDOFF-2 §4 教训）。三条都应沉淀进 docs/process/dsh-plugin-development-guide.md。
- **Adapt — 三杠杆知识**：tool schema 是决定性杠杆（Minimal 对 5/5 锚定 vs standard 族 schema 11/11 standard-like）、1024 首轮 cap 独立有效（26/32）、注入提醒毁灭性（catalog 在场 0/9）（README.md:97-109）。DeepSeek V4 特异，AGE 不做轨迹整形，仅作机制认知与引用素材（引用须带环境四字段，HANDOFF-2 §7）。
- **Reject — 两阶段门本体**：AGE 设计意图是让 AGENTS.md digest 与技能目录流动（age/agent.cordis.yml:44-51 明言 complement not duplicate），锚定期抑制与我们目标相反。Reject eternal-minimal/wire-think/combo 的事后矫正哲学（前缀缓存翻倍抖动、剂量未量化、FROZEN DESIGN NOTE 明示冻结配置不迁移，eternal-minimal.mjs:44-50）。
- **结论（任务②）**：M4-WI14 未遗漏关键机制——两阶段门对本项目确属不适用的正确裁剪；真正漏掉的价值在工程惯例层（A2/A3/A4）与可选 token 优化（A1）及坑位情报（A5）。

借用/遗漏对照表：

| 维度 | anchored-standard 的做法 | AGE preset 现状（age/agent.cordis.yml） | 判定 |
|---|---|---|---|
| 相对行先例 | `./context-gate.mjs` 等本地行 | `./age-mode.mjs`（:31-33） | 已借，无遗漏 |
| 头注 realm 规则 | agent.cordis.yml:12-19 | :8-23 扩写为"零服务行"姿势 | 已借并加强 |
| preset.yml display | `{name,description,order}` | 同形 | 已借，无遗漏 |
| 技能目录注入 | 移除 dsh-tool-skill，换 skill_search/skill_load | 保留全量 dsh-tool-skill（:85-87） | **增量点 A1**（可选 Adapt） |
| 指令 digest 注入 | 移除，换一次性 instruction-hint | 保留 dsh-agent-instructions maxBytes 65536（:47-51） | 有意保留（AGE 需要规则流动），仅 A2 惯例可借 |
| once-per-session 注进去重 | durable 扫描 + 确定性 id | 无对应机制 | **增量点 A2**（Adopt） |
| config fail-fast + 运行时降级 | 全插件统一纪律 | age-mode.mjs 未系统化 | **增量点 A3/A4/A5**（Adopt） |
| 两阶段相态机 / 锚定 | 核心机制 | 不适用（AGE 需要注入面） | Reject（正确裁剪） |

## 4. 风险与不适用面

1. **维护期 + 证据强度有限**：98/99/99 三跑先于现组成（当时是 pwsh+read 首面 + 晋升到全 25 工具，issue #60 provenance caveat，README.md:159-167）；独立复现显示锚定强复现但能力差在小样本未定（#65 anchored−standard +3.3，CI [−2.6,+9.3] 跨零；#51 Ability 85–90，README.md:169-176）。任何引用不得当作已定效应量。
2. **宿主版本耦合**：针对 harness 0.1.0-rc.5 @ 47f9438 开发，官方明示允许 breaking change，预设是对 Standard 组成的全量快照（README.md:319-346）。
3. **现象模型特异**：轨迹条件化是 DeepSeek V4 后训练产物（社区归因至 MoE 路由/条件分布失配，HANDOFF-2 §6）；换 checkpoint/换模型可能失效（§1.3 即记录了 alias 切换导致 We 开头率骤降）。
4. **prefab 模板含真实推理文本**：发布前须人工审查机器标识等（HANDOFF-2 §7）；通用模板未经重基准化就被涨价冻结（README.md:164-167）。
5. **不适用于 AGE**：锚定机制解决"首轮条件决定整场轨迹"这一 V4 特异问题；本项目要的恰是被它抑制的注入面。可借的是惯用法与数据，不是代码依赖——且对方处于维护期，不宜作为运行时上游。
6. **借用时的引用纪律**：其数据全部带环境四字段（dsh 版本/OS/API 来源/模型 checkpoint）才有效力（HANDOFF-2 §7）；n=1~4 的探针结果一律标注为探索性证据——本项目若在文档中转引须保留同样的限定语，防止把 98/99 当成稳定效应量写入决策。
7. **A1 落地前提**：skill-search 模式要求整行替换 dsh-tool-skill（并存则 catalog 注入回归）；且 AGE 的 mission-control-* 技能经部署注册进入合并 catalog（age/agent.cordis.yml:77-81），Adapt 前须核验 `ctx.skills.list` 对 deployment-registered 技能的可见性是否与 dsh-tool-skill 一致——本报告未做此核验。

## 5. 关键源码索引

| 主题 | file:line |
|---|---|
| isolate realm 头注规则 | preset/agent.cordis.yml:12-19（AGE 借用源） |
| context-gate 行（第一行 + config） | preset/agent.cordis.yml:47-52 |
| tool-bootstrap 行 + compactionTools | preset/agent.cordis.yml:83-91 |
| persona complete + includeRuntimeContext:false | preset/agent.cordis.yml:99-104 |
| instruction-hint 行 | preset/agent.cordis.yml:117-121 |
| 双路径拦截实现 | shared/context-gate.mjs:158-171（runtime-context）、177-201（claimed-baseline）、56-59（行序原理） |
| epoch-aware 相态机 | shared/compaction-epoch.mjs:26-81 |
| bootstrap/resident 目录与解锁解析 | shared/tool-bootstrap.mjs:130,133,208-225,249-255,284-292 |
| 升级触发 promoteOn 语义 | shared/tool-bootstrap.mjs:9-15,106-110 |
| 一次性提示 + durable 去重 | shared/instruction-hint.mjs:150-163,211-223 |
| dev_tool_search 能力索引 + scope fix | shared/dev-tool-search.mjs:48-59,100-105 |
| skill_search/skill_load | shared/skill-search.mjs:54-131 |
| 锚定轮注入（zero/whoami 变体） | shared/anchor-turn.mjs:20-52 |
| dshx bash 网关 | eternal-minimal/eternal-minimal.mjs:1-50 |
| cot-drip 节拍 | shared/cot-drip.mjs:1-40 |
| 三杠杆量化数据 | README.md:97-109；结果与复现 caveat：159-176 |
| anchor-mass 质量模型 / 探针方法 | HANDOFF-2.md §1.1,§2.1,§2.5,§4.5 |
| self-containment 门 | test/self-containment.test.mjs:14-35 |

**未读部分（诚实标注）**：prefab/*.mjs 内部实现（种子/roll/probe 仅经 HANDOFF-2 §2 摘要与 README 了解）、wire-think.mjs 与 toolchoice-adapter.mjs 正文、think-phase/deliberation-gate/custom-bash/zero-tool-bootstrap 正文、19 个测试文件与 verify/ runner 正文、ACKNOWLEDGEMENTS.md、README.zh-CN.md 全文。上述文件的机制描述均转引自 README/HANDOFF-2/config 表，未逐行核验。
