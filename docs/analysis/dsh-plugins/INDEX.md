# dsh-plugins — 模型路由/自动选模插件调研

> Date: 2026-08-26
> 方法：每份报告由独立子代理源码级调研（README / package.json / cordis.patch.yml / lib|src，file:line 引用），结构沿用 `docs/analysis/dsh-plugin-survey/` 同款（metadata 表 / 定位 / 架构与机制 / Adopt-Adapt-Reject 映射 AGE / 风险 / 源码索引）。插件本体在 `~/ai/dsh-plugins/<同名目录>/`。
> 服务对象：`docs/analysis/2026-08-24-0000`（agent 复用 / prompt DSL）、`-0001`（运行模式 / 控制面）、`-0002`（最小外化记忆与执行器分离）、`docs/discussions/2026-08-24-roadmap-plan-frontmatter-reform.md`。

## 报告清单（9 份）

| # | 报告 | 一句话定位 | 路由目标 | 决策信号 | 介入点 |
| --- | --- | --- | --- | --- | --- |
| 1 | [dsh-model-router](./dsh-model-router.md) | 统一 ModelID × 多 provider，按套餐三档候选链，首 token 故障转移 + 分级冷却 + 健康度重排 + 上下文窗口感知 | **Provider / 模型** | 逻辑 ModelID + tier + 健康度 + 上下文窗口 | `llm/stream` + `agent/request` 双 waterfall 中间件 |
| 2 | [dsh-delegate-router](./dsh-delegate-router.md) | 主会话 Pro / 子代理按规则集分 Flash vs Pro，AsyncLocalStorage 双层协同，持久账本 | **Provider / 模型** | 子代理任务"轻 vs 重"分类 + 用户 `/delegate` 会话模式 | 子代理派发钩子（拦截派发决定） |
| 3 | [dsh-vision-router](./dsh-vision-router.md) | 文本 Agent 一遇图片即改写到免 Key 视觉链；5 模型 OVH 兜底链 | **Provider / 模型 + 后端能力** | 输入含图片（content-type detection） | `agent/request` 改写（provider/model） |
| 4 | [dsh-routed-subagent](./dsh-routed-subagent.md) | 全局委派路由：1 工具 `subagent_routed` + 5 provider 注册 + 模型预检 + 外部 CLI engine (codex/claude/codebuddy) | **Provider / 模型 + preset + engine** | 按次 override（手动） + 预检（自动） | 子代理派发时挂载 preset / 切换 engine |
| 5 | [dsh-fork-to-preset](./dsh-fork-to-preset.md) | 会话 Header 胶囊 `↴ Fork to preset`，派生挂到指定 preset 的子会话（rc.8+ 黑盒继承） | **Preset** | 用户手动选 preset | 会话 fork 时刻（UI seam） |
| 6 | [dsh-flash-godmode](./dsh-flash-godmode.md) | headless 专用 V4 Flash 路由：w7 persona + 首轮工具收窄 + 复杂度分派引导 | **Persona + 工具面 + 引导语** | 任务复杂度（`isComplexTask`）+ 首轮检测 | `agent/inbox/spliced` order=1000 追加 |
| 7 | [dsh-model-catalog](./dsh-model-catalog.md) | OpenAI 兼容主机的模型目录自动发现 + 单位换算 + 能力探测 + 配置生成 | **配置元数据（不进入运行时）** | API host `/v1/models` 探测 + 多源补齐 | 配置生成（离线一次性） |
| 8 | [dsh-routing-suite](./dsh-routing-suite.md) | 双层套装：注入器（junction+loader 免重启热装卸/路由自愈）+ 路由预设（4 带 persona × 模型差异选 weak persona） | **Persona 带（量化） + 运行时管理层** | 任务类型 21 点实测 → persona 带索引 | preset 装配 + junction 注入（会话级） |
| 9 | [dsh-routing-suite-dragonbaba](./dsh-routing-suite-dragonbaba.md) | 纯宿主侧"提示词级路由"：单文件 ~75 行正则分类器在 system prompt 尾追加 1 句工作方式 | **Prompt 段（不改模型/工具/调用）** | 首条用户任务的正则分类 | system prompt 装配 |

## 路由机制分类法（按介入点 × 决策信号）

把 9 份报告的路由机制抽到一个二维网格。**行=介入点**（在哪一层做路由决策），**列=决策信号**（按什么选）。

| 介入点 ↓ \ 信号 → | 逻辑 ModelID / Tier | 任务复杂度 / 类型 | 内容类型 | 手动 override | Preset 选择 | 探测 / 健康度 |
| --- | --- | --- | --- | --- | --- | --- |
| **LLM stream 中间件**（在发出请求后、收到响应前的管线） | model-router | — | — | — | — | model-router |
| **agent/request 改写**（在请求信封被送走前改 provider/model） | model-router, vision-router | vision-router | vision-router | — | — | model-router |
| **子代理派发钩子**（拦截子代理 dispatch 决定） | delegate-router | delegate-router | — | routed-subagent | routed-subagent | routed-subagent |
| **会话 fork 时刻**（UI seam） | — | — | — | — | fork-to-preset | — |
| **system prompt 装配**（追加 persona / 引导语） | — | flash-godmode, routing-suite (yjh051108), routing-suite-dragonbaba | — | — | routing-suite (yjh051108) | — |
| **inbox spliced 注入**（在模型可见消息面前注入引导） | — | flash-godmode | — | — | — | — |
| **配置生成（离线）** | — | — | — | — | — | model-catalog |
| **运行时管理层（injector/junction）** | — | — | — | routing-suite (yjh051108) | — | — |

### 频次最高的 4 类机制

1. **逻辑 ModelID → 候选链 + 健康度重排**：model-router 是唯一正样本；delegate-router 借"轻/重"分类做粗粒度版本。结论：**宿主级"统一 ModelID"对 AGE 是 Reject（不在 DSH 内），但单 agent preset 内"按 tier 选 weak/strong"思想可迁移。**
2. **按内容类型改写路由**：vision-router 独此一家（图片 → 视觉后端）。结论：**Adapter / Tool 路由思路（"工具面与文本面分离"）比"模型路由"更适合 AGE 表达。**
3. **手动 override + 预检**：routed-subagent 提供了"按次 override + 模型可用性预检"的最强样本。结论：**AGE 若开放"换模型"能力，预检是必须借鉴项（避免运行时 503）。**
4. **persona 带 × 复杂度（prompt 层路由）**：flash-godmode、routing-suite (yjh051108) 是同一思路的两种强度——前者"分派 + 工具面"、后者"persona 带量化"。结论：**AGE mission-driver 的 stage dispatch 与此同构，借鉴点集中在"实测标定 + 量化分带"而非具体 persona 文本。**

## 与 AGE（Attractor-Guided Engineering）的关联摘要

> 全表见各报告 §3（Adopt/Adapt/Reject），此处只点最关键的几条。

### Adopt（直接借鉴模式）

| # | 模式 | 出处 | AGE 映射 |
| --- | --- | --- | --- |
| A1 | **双 waterfall 中间件**：`llm/stream` 包裹响应 + `agent/request` 修正信封，保证"信封模型 vs 实际首候选"一致 | model-router | mission-driver 的 plan execution 若做"内联 step 路由"，同一层要做"信封声明 + 实际命中"两路对齐 |
| A2 | **分级冷却方程** `cool(t, k)`：`cool_until = max(cool_until, k)` + 全冷却死循环判定 | model-router | DEEP_AUDIT / CHECK 失败回路借鉴"最近一次失败时间戳 + 衰减斜率 + 永不归零的下限" |
| A3 | **健康度评分"5 维加权"**（基础命中 + 滑窗 TTL + 冷却叠加 + 同 budget 重排 + 优先级因子） | model-router | AGE 若做 provider 健康面板，同形可抄 |
| A4 | **per-call override + 模型预检**（provider 是否能跑该 model + 上下文窗口是否够） | routed-subagent | mission-driver 的"换模型"指令必须先跑预检 |
| A5 | **junction + loader.create 的运行时管理层**（热装卸 + loadCache 回滚 + 路由自愈） | routing-suite (yjh051108) injector | AGE 不驻 DSH 进程，但"插件装配原子化"可作为 deploy 任务的可借鉴形态 |
| A6 | **任务复杂度分派引导 + 阶段完成信号门控**（spliced 注入，order=1000） | flash-godmode | mission-driver stage dispatch 的同构实现 |
| A7 | **模型目录"探测 → 单位换算 → 能力补齐 → 配置生成"四阶段管线** | model-catalog | AGE 配置文件若含多 provider，统一归一化阶段可抄 |
| A8 | **正则分类器 + 单句引导追加**（零 LLM 调用、零工具变动） | routing-suite-dragonbaba | AGE 不需要，但"零成本偏好注入"可作为 mission 元数据可借鉴方向 |

### Adapt（借鉴形态，改造语义）

| # | 模式 | 出处 | 改造点 |
| --- | --- | --- | --- |
| B1 | **"轻 vs 重"任务分类 → 弱 vs 强模型** | delegate-router | AGE 是"per-mission"，不是"per-subagent"；应映射为"per-stage model tier"，且分级要明示用户（避免 silent 切模） |
| B2 | **路由 UI 完全委托 host API（rc.8+ `sessions.fork({ agentPreset })` 黑盒继承）** | fork-to-preset | AGE 的 mission 切换不靠 host；但"对底层 fork API 完全信任 vs 自管全链"是个工程哲学抉择，dsh 端已选前者 |
| B3 | **persona 带 × 模型差异选 weak persona**（21 点实测标定） | routing-suite (yjh051108) | AGE 可做"stage × capability profile"实测标定，但避免把"实测矩阵"硬编码进 prompt 模板 |
| B4 | **5 模型兜底链 + 单元换算**（token/$/context） | vision-router, model-catalog | AGE provider adapter 层的 fallback chain 应明示"哪一环失败 → 降级到哪一环"，避免 silent 兜底 |
| B5 | **三档 auto-by-purpose（轻/中/重 + reason effort）** | model-router | AGE mission 类型分级（如 plan / execute / audit）的 LLM 选型可参考，但分级由 mission 元数据驱动而非 LLM 自决 |

### Reject（不适用 / 反例）

| # | 模式 | 出处 | 拒绝理由 |
| --- | --- | --- | --- |
| R1 | **统一 ModelID 抽象**（一个逻辑 ID 跨 provider） | model-router | AGE 不在 DSH 内，无此需求；使命名规范已够，引入会模糊 provider 边界 |
| R2 | **模型目录作为运行时入口** | model-catalog | model-catalog 是**离线一次性配置工具**，不进入运行时；AGE mission driver 不需要动态发现 |
| R3 | **首条用户任务正则分类 → 单句工作方式注入** | routing-suite-dragonbaba | 对 LLM 风格影响微弱（其 README 自承"不换工具、不改模型、不多发调用"）；AGE 的 mission 类型已显式标注，不需要 LLM "推断偏好" |
| R4 | **Router-Core 量化 persona 带（4 带 + weak persona 替换）** | routing-suite (yjh051108) | 把"persona 文本"看作"模型差异的相变测量"是 DSH-V4 时代的特定产物；AGE 不绑定具体 LLM 版本，避免硬编码 |
| R5 | **零运行时依赖的极简插件**（fork-to-preset 完全信任 host） | fork-to-preset | AGE 的插件不强求走 host，零依赖是优势但也意味着零验证；按本项目风格需要至少一个 sanity check |

## 路由机制横向对比（决策表）

| 维度 | model-router | delegate-router | vision-router | routed-subagent | fork-to-preset | flash-godmode | model-catalog | routing-suite (yjh051108) | routing-suite-dragonbaba |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **路由目标** | 模型/provider | 模型/provider | 后端能力 | 模型+preset+engine | preset | persona+tool | 配置元数据 | persona 带 | prompt 段 |
| **决策方** | 宿主侧自动 | 宿主侧自动 | 宿主侧自动 | 用户/宿主 | 用户 | 宿主侧自动 | 离线工具 | 宿主侧自动 | 宿主侧自动 |
| **决策信号** | tier+health | task weight | content-type | manual+precheck | preset 选择 | complexity | API 探测 | persona 带实测 | 正则 |
| **LLM 介入决策？** | 否（纯函数） | 否（规则） | 否（detect） | 否（预检） | 否 | 否（isComplexTask） | 否（探测） | 否（实测标定） | 否（正则） |
| **持久化账本？** | 会话事件流 | 子代理账本 + 侧栏 | 会话事件流 | shadow state（README 标外置） | 无 | 无 | 无 | 无（preset 文件） | 无 |
| **运行时改模型？** | 是（首 token 前） | 是（子代理派发） | 是（image-turn） | 是（每调用） | 否（仅 preset） | 否（仅 prompt） | 否（配置阶段） | 否（仅 prompt） | 否（仅 prompt） |
| **额外模型调用？** | 否 | 否 | 否（OOV 兜底链调用） | 否 | 否 | 否 | 否（探测 OpenAI /models） | 否 | 否 |
| **冷启动状态？** | 健康度 50 起 | 全 tier 启用 | 5 模型兜底链已注册 | shadow state 冷启 | 读 host presets | persona 原位替换 | 全探测后归一化 | junction loadCache | 钉 SHA256 preset 复用 |
| **故障语义** | 分级冷却 + 健康度衰减 | 失败仍持久记账 | 兜底链失败 → 静默 | precheck fail loud（但 README 与代码有偏差） | 信任 host | persona 漂移靠 spliced 提示 | 探测失败 → 跳过 | 路由自愈 + 回滚 | 无（单句追加，无失败态） |

## 关键发现（贯穿 9 份报告）

1. **DSH 路由生态已分裂为 5 派**：provider 级（model-router/delegate-router/routed-subagent/model-catalog）、preset 级（fork-to-preset/routing-suite-routing-yjh051108）、persona/prompt 级（flash-godmode/routing-suite-dragonbaba）、content-type 级（vision-router）、CLI-engine 级（routed-subagent）。AGE 不需要全覆盖，应在 mission 元数据驱动下选 2-3 派组合。
2. **"统一 ModelID"是 DSH-V4 时代的强假设**（model-router 是它最成熟的承载）。AGE 不绑定具体 LLM 版本，**直接放弃这一抽象**，保留"per-mission provider 显式声明 + per-stage tier"足够。
3. **prompt 级路由（routing-suite-dragonbaba、flash-godmode persona 部分）边际效益低**：README 自承"不换工具、不改模型、不多发调用"——对 LLM 行为的影响是 1 句引导，可观察但不可强制。AGE mission 已自带 stage 类型，无需再叠加 prompt 级路由。
4. **runtime injector（routing-suite-yjh051108 injector 部分）是 DSH 特有产物**：junction/loader.create API 是 Cordis 框架特有的运行时管理层。AGE 不依赖 Cordis，但"插件热装卸 + 路由自愈 + loadCache 回滚"的工程模式可移植到 deploy 任务。
5. **"per-call override + precheck"是必备项**（routed-subagent）：AGE 若允许 mission 内"切模型"，必须先做预检（provider 可达 + 上下文窗口足够 + 能力匹配），否则会在运行时 503。
6. **存在两个同名 `dsh-routing-suite`**，定位不同：yjh051108 = 注入器 + 路由预设（运行时管理层）；dragonbaba = 纯 prompt 级单句工作方式注入。AGE 调研时务必区分。
7. **健康度 / 冷却 / failover 的量化方程（model-router `cool(t,k)`）** 是本次调研最有工程价值的公式，可移植为通用的"最近一次失败时间戳 + 衰减斜率 + 永不归零下限"。
8. **adapter / tool routing 比 model routing 更适合 AGE**：vision-router 展示了"按输入内容类型把任务交给专门后端"比"换模型"更接近 AGE 表达——AGE 的 mission 任务应由 tool/adapter 层做"格式路由"（读 PDF / 截图 / OCR），而非"模型路由"。

## 与既有 analysis 报告的关系

- 本目录是 `docs/analysis/dsh-plugin-survey/` 的**专题深入**：plugin-survey 覆盖 18 份通用插件 + 含 routing 提及但未深入；本目录 9 份均为 routing / auto-select 类，逐份源码级。
- 与 `2026-08-24-0002-age-minimal-memory-and-executor-separation-assessment.md`（执行器层最小外化）互补：plugin-survey 关注 host 侧事件 seam；本目录关注"路由决策"作为独立的逻辑层——AGE 若把它做成"独立 stage"是可选项。
- 与 `2026-08-24-0003-ai-automation-interaction-essential-design.md`（交互面设计）相关：routing-suite-dragonbaba 提供了"零成本偏好注入"的极端样本，反证 AGE 应在 mission 元数据层显式标注 stage 类型而非依赖 LLM 推断。
- 与 `2026-08-24-0004-m4-feasibility-and-recovery-verification.md`（恢复验证）相关：model-router 的"全冷却死循环判定 + 回滚"机制是 mission driver 失败回路的可借鉴形态。

## 未出独立报告的相关插件（路由相关但已并入 plugin-survey）

| 插件 | 路由相关性 | 出处报告 |
| --- | --- | --- |
| `dsh-plan-execute` | 计划/执行双模型路由（planner / executor） | 未在本目录建独立报告，因 README 未给 owner 仓库、且属"preset 拆分"派别，已在 plugin-survey 类同 dsh-anchored-standard 形态 |
| `dsh-client-ui-plan-execute` | UI 伴生，非独立路由逻辑 | 同上 |
| `dsh-llm-fallback` | 提供商 fallback chain | 同上 |
| `dsh-smart-route` | 多链管理 + composer 切换 | 同上 |
| `dsh-plugin-subagent-director` | per-subagent model 选择 | 同上 |
| `dsh4vscode` | VS Code chat windows + Flash/Pro/Pro Max 自动路由 | 同上 |
| `Cavan-Ou/dsh-flash-godmode` | 已在本目录（同名一致） | dsh-flash-godmode.md |
| `dsh-plugin-rollout-scout` | 模型探测（决定账号实际被路由到哪个模型） | 未给 owner 仓库；plugin-survey 中类比 dsh-inspect |
| `dsh-subscription-auth` | 订阅 OAuth + 自动模型发现 | 未给 owner 仓库 |

## 索引速查

- [dsh-model-router](./dsh-model-router.md) — Provider 级：统一 ModelID × 候选链 + 健康度 + 冷却
- [dsh-delegate-router](./dsh-delegate-router.md) — 子代理：轻/重分类 → Flash/Pro
- [dsh-vision-router](./dsh-vision-router.md) — Content-type：图片 → 视觉后端
- [dsh-routed-subagent](./dsh-routed-subagent.md) — 按次 override + 预检 + CLI engine
- [dsh-fork-to-preset](./dsh-fork-to-preset.md) — UI seam：会话 Header 胶囊 → fork 到 preset
- [dsh-flash-godmode](./dsh-flash-godmode.md) — Persona + 复杂度 + 工具面：V4 Flash 路由
- [dsh-model-catalog](./dsh-model-catalog.md) — 离线：OpenAI 兼容主机模型自动发现
- [dsh-routing-suite](./dsh-routing-suite.md) — 套装：注入器 + persona 带预设（yjh051108）
- [dsh-routing-suite-dragonbaba](./dsh-routing-suite-dragonbaba.md) — Prompt 级：正则分类器 + 单句引导（dragonbaba）
