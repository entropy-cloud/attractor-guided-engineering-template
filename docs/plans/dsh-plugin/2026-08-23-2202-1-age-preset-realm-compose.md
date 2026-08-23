# 2026-08-23-2202-1 AGE preset 组合与 isolate realm 冲突检查（dsh-plugin M4-WI14）

> Plan Status: completed
> Mission: dsh-plugin
> Work Item: M4-WI14
> Last Reviewed: 2026-08-23（draft review 1 轮，iteration 1 共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M4-WI14（"AGE preset 组合(mode 提示词 + 路由注入)与 isolate realm 冲突检查(参照 anchored-standard 装载器,host loader 待读)"）
> Related: `docs/architecture/dsh-plugin-packaging.md` §Phased Delivery P4 行（gate = "preset + plugin compose without realm collision"）、§Service Surface、§Behavioral differences（Permissions 行 "AGE worker preset must carry a tool catalog sufficient for execute/closure steps"）、§Packaging Layout；`docs/design/dsh-plugin-integration.md` §User Experience/Running；`docs/analysis/2026-08-22-0001-dsh-host-api-contract-verification.md` §7（preset loader 未读项——本 plan 闭合）；`docs/process/dsh-plugin-development-guide.md`（装载/验证流程）；本批执行顺序：本 plan（N=1）→ `2202-2`（WI15）
> Audit: required

## Current Baseline

**M4 之前全绿（WI1–WI13 done，P1–P3 delivered）；preset 面零存在——无 preset 工件、无 preset 组合验证面、宿主 loader 核验未记录（R1 §7 开放项）。宿主 preset 机制在本地 host clone 中可读但未经本仓库核验落档：**

- **roadmap 字面与 P4 gate**：WI14 = AGE preset 组合（mode 提示词 + 路由注入）+ isolate realm 冲突检查（参照 anchored-standard 装载器，host loader 待读）。packaging doc §Phased Delivery P4 行 gate："preset + plugin compose without realm collision"。
- **R1 §7 开放项（本 plan Phase 1 闭合）**："Preset mounting loader (`preset.yml` consumption) — anchored-standard shows the consumer side; host loader unread. Needed only for P4 (AGE preset)."。host 源码只读基座 `~/ai/dsh-src/deepseek-harness` 自 WI9 起在用；`packages/preset/`（group README + `agent-presets/` + `persona/`）现可读——但本仓库尚无核验记录，实现不得直接依赖未核验快照。
- **draft 时点只读快照（Phase 1 须逐条复核后才可作实现依据；来源 `~/ai/dsh-src/deepseek-harness/packages/preset/README.md` + `packages/preset/agent-presets/README.md`）**：
  - preset = 一个目录持有一份 `agent.cordis.yml`（组合 = plugin 行列表）+ 可选 `preset.yml`（**仅 display**：name/description/order；id = 目录名、trust = 发现 root 决定，均不可经 preset.yml 写入）。
  - roster 每**进程一次** standing mount；会话经 scope parentage 加入（agent scope key 挂到 mount 下）；**subagent 子代理经 `composeFrom()` 加入父组合，从不 `mount()`**——NativeExecutor 创建的 mission child 会继承发起会话的 preset 组合（README 语义推断；宿主树存在 `preset-inheritance.spec.ts` 佐证——D1 对 in-process driver 源码确认，draft review it1 N6）。
  - discovery：configured roots + 派生 harness-home root；unmemoized（增删即时可见）；trust `system|user`；**authoring copy-only**（`copy(from, id, name?)` 拒绝非法 id / 已占用 id / 未知源）。
  - 行解析：bare 包名从 **HOST 组合 base** 解析（preset 目录不解析 `@deepseek-ai/*`）；**相对路径从 preset 自己的目录**（preset 本地 plugin 文件随目录走）；绝对路径保留转 `file:` URL。
  - **realm 规则（冲突检查的核心）**：preset 内 service 行必须位于带 `isolate` realm 的 group 内——否则发布进 process-global root realm，`dsh-agent-presets` 挂载时拒绝。组合分裂约束：registry 与跨会话设施是进程单例、留在 host 组合；preset 只携带"单个 agent 的贡献"。（"shared label 不池化实例、同 realm symbol 下第二次 `provide()` 抛错"一条出自 anchored-standard 头注〔社区注记，非 host README——draft review it1 N1 指出来源映射〕，D1 对 host/cordis 源码核验后作实。）
  - `CreateAgentOptions.meta.agentPreset` 存在（R1 §1）；agent factory 的 `setup(agentCtx)` 钩子是 `mount()` 唯一支持调用点；composition file stamp（mtime+size）代际语义。
  - 宿主自带 roster：`apps/cli/config/agent-presets/{code,cordis,minimal,standard}`——目录清单即 roster（standard = name 标准模式/description/order 1）。
- **anchored-standard 消费面先例**（clone `~/ai/dsh-plugins/dsh-anchored-standard`，roadmap 点名的参照）：`preset/agent.cordis.yml` 用相对行（`./context-gate.mjs`、`./instruction-hint.mjs` 等本地 .mjs 贡献 prompt 段/工具面）+ 头注明文 isolate realm 规则；`combo-anchored/preset.yml` display 形状 `{name, description, order}`。system-prompt 与 dsh-tools 的注册都 file 进调用 ctx 的 scope layer → standing mount 的贡献落在 preset 层，经 scope 父链覆盖每个加入的 agent。
- **插件 live 状态**：`plugin/dsh/cordis.patch.yml` 单 insert（`cordis:group` + `isolate: { missionControl: true }` entry-local realm + `dsh-mission-control` 服务行，config `assetsDir: ./assets`）——mdcontrol 服务的**唯一挂载点**。`src/service.ts` 注册：mdcontrol 服务发布 + HTTP dispatcher（`/mdcontrol/api/<method>`，webServer 缺席降级 mount-log）+ `ctx.skills` 三技能（reactive inject）+ plan-status gate。三技能指令体已内含 mdcontrol.* HTTP 调用指引（`mdcontrol-skills.ts` HTTP_NOTE）。
- **不存在的东西**：`plugin/dsh/` 与 repo 无任何 preset 目录；插件测试链（116 用例）与 `verify:e2e` / `verify:e2e:gate` 无 preset 组合面；e2e fixture（`test/fixtures/e2e.cordis.yml`）不含 preset roster 行（mdcontrol 服务行在该 fixture 中**非 isolate**挂载——e2e 驱动自有根 realm 直调，真实宿主挂载走 patch 的 isolate realm，该分工 by-design 不变）；design/packaging doc 无 AGE mode as-built。
- **红线**：零引擎 diff（`tools/mission-driver/` 不动——mode 提示词是 **preset 本地内容**，不是 flow prompt 模板；flows/prompts 冻结面零变化）；shipped `dependencies` 不动（组合域所需宿主包走 devDependencies exact 钉版，0.1.1-rc.2 cohort 纪律）；既有门禁零回归（插件链 / `./verify-age.sh` / 既有 e2e 只可扩展不可破坏）；**不重复发布 mdcontrol 服务**（唯一挂载 = bundle patch；preset 侧任何第二实例都会破坏单 guard 语义）。

## Goals

- AGE preset 落地：一个可被 DSH preset roster 发现的 AGE 模式 preset——mode 提示词（AGE 会话姿态的系统提示段）+ 路由注入（Mission Control 调用面在加入会话内可发现、可用）+ 工具目录姿态满足 packaging doc "sufficient for execute/closure steps" 约束；分发路径明确（消费者安装步骤成文于 dev guide）。
- isolate realm 冲突检查机器化：preset 与插件 bundle patch 同树组合无 realm 冲突——mount 不被拒、无 `provide()` 同 label 碰撞、mdcontrol 服务仍由 bundle patch 唯一挂载解析、preset 非 broken。
- R1 §7 闭合：host preset loader 核验事实落档（plan 内 Decision Record + R1 注记）。
- 验证 + owner docs/roadmap 回写（packaging doc P4 as-built、design doc AGE mode as-built、dev guide 安装步骤、roadmap WI14 `todo → done`）。

## Non-Goals

- 不改引擎（零引擎 diff：flows/prompts/引擎源不动；marker 契约与 prompt-check 管辖面不因 preset 扩大——mode 提示段若不含 marker 示例则不在 prompt-check 管辖面，如实记录）。
- 不做 WI15（状态面板决策——plan `2202-2`）。
- 不改既有 mdcontrol 路由 / skills / plan-status gate 的行为（preset 只做会话面组合；已全局注册的三技能与 preset 侧提示/技能行的关系是 Phase 1 显式裁定项，不允许静默双注册漂移）。
- 不修改宿主 preset 机制本身、不向上游贡献（consumption-only）。
- 不做真模型下 AGE 模式会话自然语言质量验证（env 人工腿，延续 1852-2 deferred 姿势）。

## Task Route

- Type: `app-layer design change`（新增用户可见会话面 "AGE 模式" + 插件层实现；含多项设计裁定）
- Owner Docs: `docs/design/dsh-plugin-integration.md`（§User-visible capabilities / §User Experience——AGE 模式语义 owner）、`docs/architecture/dsh-plugin-packaging.md`（§Phased Delivery P4 / §Service Surface / §Behavioral differences / §Packaging Layout）、`docs/analysis/2026-08-22-0001-dsh-host-api-contract-verification.md` §7、`docs/process/dsh-plugin-development-guide.md`
- Skill Selection Basis: `Skill: none`——`docs/skills/README.md` 无匹配可复用方法（文档核对方法沿用 `document-audit-prompt.md`，非 skill）。

## Infrastructure And Config Prereqs

- 结构域：纯 Node、零网络、零凭据（进插件测试链，CI-able）。
- 组合域：复用 in-process boot 形态（`@deepseek-ai/dsh-app-boot`，已钉 devDep）；preset roster 组合包 = `@deepseek-ai/dsh-agent-presets`（draft review it1 live 核实：npm 已发布 `0.1.1-rc.2`，`latest` tag 滞后 → 字面钉版）——落地为 **devDependencies exact 钉版**，shipped `dependencies` 零变化。
- 宿主源码只读核查：`~/ai/dsh-src/deepseek-harness`（`packages/preset/` 实现、`apps/cli` roster 配置面、agent factory setup 钩子链）。
- 无新 env / 端口 / 迁移；无回滚需求（纯新增工件，回滚 = 删目录 + 撤门禁用例）。

## Phase 1 Decision Record（2026-08-23，Explore 落档）

### D1 host preset loader 核验（闭 R1 §7）——全部逐条复核，2 项 refinement

Host 源码已读（`~/ai/dsh-src/deepseek-harness`）：`packages/preset/agent-presets/src/{preset,discovery,mount,session,metadata,index,authoring}.ts` + `tests/mount.spec.ts` + `tests/preset-inheritance.spec.ts`、`packages/preset/persona/src/index.ts`、`apps/cli/config/agent-presets/{standard,minimal}/`（roster 实物）、`packages/subagent/subagent/src/child-agent.ts`（composeFrom 唯一产品调用点）、`packages/boot/app-boot/src/index.ts`（entryListSchema 方言消费面）。

Current Baseline 的 draft 快照逐条复核结果——**全部属实**：

1. preset = 目录持 `agent.cordis.yml`（`COMPOSITION_FILE`）+ 可选 `preset.yml`（`METADATA_FILE`，display-only name/description/order；id=目录名受 `PRESET_ID=/^[a-z0-9][a-z0-9-]*$/` 约束——containment boundary 非 style rule；trust 由发现 root 决定，preset.yml 均不可写）。
2. discovery unmemoized（每次 `scanRoot` 重读盘）；缺席 root → 空集不报错；broken preset 留在 roster 带 `broken` 理由（health check 用 loader 自己的 `entryListSchema` 方言解析——`!!js` scalar 为 loader 求值的表达式节点，health 与 loader 永不分歧）；duplicate id 先 root 胜。
3. standing mount 每进程每 preset 一次（`ensureStanding` single-flight）；会话经 scope parentage 加入；composition stamp（mtime+size）代际语义——文件变更只为**之后**的会话开新代，已加入会话保持原代。
4. mount guard 拒绝规则全集：① unscoped context；② `resolveMountable` 对 broken preset 预拒（不进 loader）；③ 有 row 未激活（"N row(s) did not activate … waiting for <service>"）；④ **root-realm 服务泄漏（`leakedServices`）拒挂："row(s) published process-global service(s) […]; a preset service must sit behind an `isolate` realm or move to the host composition"**——D3 核心依据。
5. `provide()` 同 label 二次注册抛错：宿主自带 `apps/cli/config/agent-presets/standard/agent.cordis.yml` 头注原文载明（"A shared label does NOT pool instances — `provide()` throws on the second registration under the same realm symbol"）——**来源映射就此作实于 host roster 本体**（draft review it1 N1 的 anchored-standard 社区注记归属修正闭环）；entry-local realm 为每个 standing mount 私有，两 preset 复用同 realm label 互不碰撞。
6. 行解析：bare 包名从 HOST 组合 base（harness 内部，`PresetTree.import` override）解析；相对路径从 preset 自己目录；绝对路径转 `file:` URL；preset 目录自身不解析 `@deepseek-ai/*`。
7. authoring copy-only（`copy(from,id,name?)` 拒非法 id/占用 id/未知源；metadata 重写：name 替换、description 保留、order 丢弃）；preset 永不回写（`PresetTree.write()` no-op——会话 teardown 回写会把组合文件截断为 `[]`）。
8. `setup(agentCtx)` 是 `mount()` 唯一支持调用点（agent 未发布期间挂载，被拒组合整体回滚创建）；`agent/created` unjoined 告警是 advisory 非 veto（bare agent 合法：ACP/SDK/headless 入口均如此创建）。
9. `dsh-app-boot` `boot()` 已接线 loader + include builtin（lib/index.js `ctx.loader.builtins.include = …`）——in-process 组合腿无需手工补 Loader。

**Refinement 1（baseline 修正——影响 D2）**：`composeFrom()` 产品代码仅一个调用点——`packages/subagent/subagent/src/child-agent.ts` `applyChildComposition`（**subagent 工具路径**的子代理加入父组合）。`CreateAgentOptions.meta.agentPreset` 是被动元数据：宿主无任何代码自动挂载它，由创建方自己的 `setup` 决定。**NativeExecutor 直连 `agents.create`（无 setup）不加入任何 preset**——在 agent-plane 部署（roster 组合、全局层无 model-facing row）下其 mission child 将以空工具注册面到达模型（正是 `applyChildComposition` 注释所防御的缺陷）。Baseline 的"NativeExecutor mission child 继承发起会话组合"README 推断对 direct-create 路径**不成立**（`preset-inheritance.spec.ts` 仅覆盖 subagent 工具路径）。→ executor 侧必须自己 mount（D2 路由注入第二腿）。
**Refinement 2**：会话 preset 选择是 durable session event（`agent-preset/selected`，log 最新胜于冻结的创建 header）——blank 期换挡的会话 resume/fork 重建记录的组合；对消费者中途切 AGE 模式的语义为"下一 turn 起新组合"。

残险：host 为 developer preview，preset 包语义可能随版本演进（钉版 devDep + R1 姿势不变）；`ensureStanding` 的 TODO（superseded generation 回收）为宿主侧已知项，不影响本消费面。

### D2 AGE preset 形状 / 内容清单 / home 与分发

- **home**：`plugin/dsh/preset/age/`（in-repo；发现 root = `plugin/dsh/preset/`，目录名 `age` 即 preset id，合法 `PRESET_ID`）。分发 = 目录复制安装（两条成文于 dev guide：手动复制目录到 `<DSH_HOME>/.agent-presets/age/`；或已注册 deployment 经 `agentPresets.copy()`；装载后重启宿主、会话选 AGE 模式 / `missions/base.json` `agent: "age"`）。
- **内容清单**（`agent.cordis.yml` rows + `preset.yml` + 本地行文件）：
  - `age-mode` 本地行 `./age-mode.mjs`：注册**一个** system-prompt section（`ctx.systemPrompt.section({ name: 'age:mode', order: 10, text })`）——AGE 会话姿态：repo 是唯一事实源/文件进出协作、owner docs 优先（与宿主 AGENTS.md digest **补位不重复**——`agent-instructions` row 保留，section 指向不重述）、Mission Control 入口（三技能 + `/mdcontrol/api/<method>` HTTP 面 + 异步作业契约要点：run/draft 即返句柄、status 轮询、勿阻塞等待）。**不含 marker 示例**——交互会话姿态非 step executor，按 Non-Goal 记录不在 prompt-check 管辖面（Phase 2 结构门禁以断言钉住"无 marker 示例"姿态本身）。
  - `persona` row（`@deepseek-ai/dsh-persona`，标准编码 persona，**非 complete**——AGE section 叠加共存）。
  - `agent-instructions` row（`@deepseek-ai/dsh-agent-instructions`——AGENTS.md digest 由宿主机制注入，AGE section 指向之）。
  - 工具目录（packaging doc "sufficient for execute/closure steps" 机器满足面，取 standard 形状子集）：`tool-bash` + `tool-pwsh`（平台互斥对）、`tool-fs`（read/write/edit）、`tool-fs-search`（glob/grep）、`tool-todo`、skills 双行（`skill-filesystem` + `tool-skill`——mission-control 三技能经 merged catalog 到达 AGE 会话）、`compaction` isolate group（`compaction`/`toolResultPruner` label——长 mission 必需）。**刻意缺席**：goals、plan mode、delegation/workflows、web、jobs（AGE 循环经 mdcontrol 路由驱动；native plan-mode/goal-round 语义已有 doc 对比；行面越小碰撞面越小）。
  - `preset.yml`：`{name, description, order}` display-only。
  - `age-mode.mjs`：plain ESM 插件（`export const name` + `inject: ['systemPrompt']` + `apply`），零外部 import（anchored-standard 本地行同形）。
- **路由注入两腿**：
  1. 交互会话腿：AGE section 文档化 Mission Control 面；三技能**复用不重注册**（service.ts 全局注册 → merged catalog 覆盖所有会话；preset 侧本地行重注册=双渲染/重名险，裁定排除——skills registry 按 scope 分层，单一来源保持 service.ts）。
  2. mission-child 腿（D1 Refinement 1 的直接后果）：`native-executor.ts` 的 create 调用补 `setup`——经 `agentCtx.get('agentPresets')` 在 roster 存在时 mount `meta.agentPreset`（=`config.agent`，来自 missions/base.json `agent` 字段）；roster 缺席 → no-op（e2e/L3 既有组合零影响，降级姿态同 absent-webServer）。plugin 层改动、零引擎 diff；这使 "AGE worker preset carries a tool catalog sufficient for execute/closure steps" 非空转。
- 备选与否决：自足组合（自带全部 spine 包行）被否——bare 行从 HOST base 解析本就命中宿主自带包，自足反而引入版本面；派生 host standard 全量被否——goals/plan/delegation 行与 AGE 循环语义重叠且扩大碰撞面（anchored-standard 先例也是 standard 子集 + 本地行）。
- 残险：host standard roster 的 row 集随宿主版本演进（bare 行名域受 devDep 钉版 + 结构门禁 allowlist 双钉）；AGE section 文案质量属真模型人工腿（Deferred 已立案）。

### D3 realm 冲突规则（核心裁定）

- **AGE preset 携带零服务行**：全部 row 或不 provide 任何服务（tool/persona/instructions/skills 行只注册进宿主 registry 与分层 prompt/skill layer），或位于自有 entry-local isolate realm（compaction group）。root-realm 泄漏 by construction 不可能 → `leakedServices` guard 永不触发；preset 内不存在任何 `provide()` label 碰撞面。**预设候选 A（零携带）定稿**；候选 B（自有 isolate group + label 避让）无需启用——无第二服务实例诉求，且任何第二 mdcontrol 实例都破坏单 guard 语义。
- **`dsh-mission-control` 唯一挂载保持 bundle patch**（`cordis.patch.yml` isolate realm `missionControl`）；preset 零引用该服务/包名；加入会话经 ①全局注册三技能 + ②HTTP dispatcher 两面消费 mdcontrol（均由 service mount 拥有）。
- 跨 mount label 复用安全（compaction group 与 host standard 同 label）：entry-local realm 每 standing mount 私有（D1 #5）。
- 机器断言面（Phase 2 结构域 + Phase 3 组合域）：① 结构——组合内零 `dsh-mission-control`/本包名 row、零 provide-语义 row（以"无 isolate group 内服务行 + 相对行文件在盘 + bare 名 ∈ host-spine allowlist"钉住）、preset.yml 仅 display 键；② 组合——preset 非 broken、mount 成功、`ctx.get('mdcontrol')` 仍解析且 `mdcontrol.list` 应答（P4 gate 字面主张）、无 mount 拒绝。

### D4 验证域

1. **结构域**（插件链纯 Node，CI-able）：`plugin/dsh/test/age-preset.test.mjs`——目录/文件形状；preset.yml display-only；组合行约束（D3 规则机器化）；与 bundle patch 无重复服务发布面；age-mode section 内容钉（入口指引在、marker 示例无）。
2. **组合域**（in-process boot，零 env/凭据）：新脚本 `plugin/dsh/scripts/e2e-preset.mjs`（gate `verify:e2e:preset`，`verify:e2e` 同款 explicit-local 姿势——永不 CI-blocking）boot 真实 cordis 运行时：mdcontrol 服务行（非 isolate、e2e driver 自有 root realm——既有 by-design 分工不变）+ `agent-presets` row（roots → `plugin/dsh/preset/`、`includeUserRoot: false`、default `age`）+ e2e spine rows；断言：roster 列出 `age` 非 broken；`agents.create` + `setup: mount('age')` 成功；**AGE section 出现在该 agent 首个模型请求的 system prompt**（stub 端点记录请求——model-visible 面最强断言）；`ctx.get('mdcontrol')` 仍解析 + `mdcontrol.list` 应答（无 realm 冲突）；**mission child 经 executor setup-mount 加入 AGE 组合**（scratch 项目 `missions/base.json` `agent: "age"`）且驱动 mission 端到端 marker 全合法（mission-child marker 合法性——复用 verify:e2e scripted-model driver 形状，N3 兑现）；subagent-tool composeFrom 可达性在**单测面**钉（fake agents service 断言 executor setup-mount 调用形状）而非第二 e2e 腿（宿主 composeFrom 路径是宿主自测面，本仓库义务是自身接线）。
   - 新 devDep：`@deepseek-ai/dsh-agent-presets@0.1.1-rc.2`（npm 已发布核实）——devDependencies exact 钉版，shipped `dependencies` 零变化；`@deepseek-ai/cordis-plugin-include` 已在 node_modules（app-boot 传递），仅当脚本直接 import 时增补显式 devDep。
3. **真宿主腿**：不自动化——扩 `verify:native` spawned-runtime 以载 roster 的协议面成本高于 in-process 腿的边际保障；dev guide 成文人工步（注册 roster root/复制 preset → 重启 → 选 AGE 模式 → 跑 mission 观察挂载/技能/运行）。**verification scope limited 如实标注**于 testing doc + packaging doc as-built。
   - else-branch：若 in-process preset 腿证实不可行（如 Include builtin 经 app-boot 不可接线），回落结构域 + 人工腿并如实记录，不静默缩面。（预检已排除该风险：boot() 接线 include builtin 已核实。）

## 执行期修订（Execution Addendum，2026-08-23 Phase 2/3 落地时裁定）

- **A1（D2 修订）compaction 三件套 → 二件套**：`dsh-command-compact`（`/compact` 命令）从 preset 裁掉。执行中实测：该 row inject 宿主面 `commands` registry，部署未组合该服务时 loader 的 inactive-row guard 直接拒挂整个 preset（"1 row(s) did not activate: command-compact … waiting for commands"——D1 核验的 guard 全集活体复现）。AGE 循环不用 `/compact`；自动压缩 + tool-result 裁剪才是价值面（compaction-basic + tool-result-pruner 保留，二者 inject 面〔llm/tokenMeter/sessions〕为 spine 常备）。相应 devDep 撤销。
- **A2（D2 补充）`bootstrapNativeConfig` base.json `agent` 默认值**：执行中发现引擎 run 路径解析 `agent = args.agent || env.OPENCODE_AGENT || "build"` 且**从不读 base.json**（仅 draft/analyze 返回点读——引擎既有行为，零 diff 红线下不动）；mission.agent 因此被前置默认值短路（run 路径死码）。修复落 plugin 层：`bootstrapNativeConfig` 在 args/env 均未显式指定时以 `baseAgentConfigOf` 读 base.json `agent` 注入（显式 args/env 优先）——与 draft/analyze 已有的 base 读取姿态一致，使 `missions/base.json` `"agent": "age"` 成为项目级 AGE 选择旋钮（run/draft/analyze 三路一致）。单测钉住（engine-bridge.test.mjs：base 默认 / args 优先 / env 优先 / 无 base 回落 "build" 四路）。
- **A3（D4 补充）stub 断言面勘误**：dsh-llm-deepseek 请求的 tools 为 OpenAI function 形（name 嵌套于 `function.name`），断言提取需 `tool?.function?.name ?? tool?.name`；交互会话腿需传 `meta: { cwd }` 否则 agent-instructions 无从探测 AGENTS.md（digest 断言面依赖 cwd）。均为 e2e 驱动侧细节，不影响裁定。

## Execution Plan

### Phase 1 - Explore + 四 Decision（loader 核验 / preset 形状与分发 / realm 规则 / 验证域）

Status: completed
Targets: 决策记录于本 plan（doc 编辑统一归 Phase 3 收口，不双记账）
Skill: none

- Item Types: `Decision`
- Prereqs: 无（与 `2202-2` 无执行依赖）

- [x] `Decision`（含 Explore）**D1 host preset loader 核验（闭 R1 §7）**：读 `packages/preset/agent-presets` 实现（装载方言与 `!!js` 处理、roster roots/defaultId 的配置面、mount guard 的拒绝规则全集、`meta.agentPreset` → `mount()` 链路、`composeFrom()` 子代理路径、stamp 代际语义）与 `packages/preset/persona`；逐条复核 Current Baseline 的 draft 时点快照；核验事实落档为本 plan Decision Record（作为 Phase 2 实现依据），R1 §7 注记归 Phase 3。
  - Skill: none
- [x] `Decision`（含 Explore）**D2 AGE preset 形状 / 内容清单 / home 与分发**：
  - mode 提示词：AGE 会话姿态系统提示段的内容清单与边界（指向 owner docs 的工作约定入口、Mission Control 入口与异步契约要点、与宿主自有 AGENTS.md digest 的关系——补位不冲突/不重复；marker 纪律是否入提示词随内容裁定）。
  - 工具目录姿态：自足组合 vs 派生自宿主 standard 基座（anchored-standard 先例形状）；必须满足 "tool catalog sufficient for execute/closure steps"（packaging doc §Behavioral differences 约束）。
  - 路由注入机制：preset 侧使 mdcontrol 调用面可发现的形态——提示段内文档化 HTTP dispatcher 面 / preset 本地技能行 / 服务直消费（受 D3 结论约束）；与全局已注册三技能（service.ts）的关系显式裁定（复用不重注册 / 本地行共存去重）。
  - home 与分发：in-repo 目录位置（候选 `plugin/dsh/preset/age/`，Phase 1 定）+ 消费者安装路径（`agentPresets.copy()` 到 user root / 手动目录复制——dev guide 成文步骤）；`preset.yml` display 内容。
  - Skill: none
- [x] `Decision` **D3 realm 冲突规则（核心裁定）**：preset 组合行的 realm 姿势。预设候选（Phase 1 验证后定稿）：AGE preset **不携带任何 process-global 服务行、不重挂 `dsh-mission-control`**（唯一挂载保持 bundle patch；加入会话经 HTTP dispatcher / 已注册全局面消费 mdcontrol）→ 冲突面 by construction 消失。若 D2 裁定 preset 需要自有服务行：必须独立 isolate realm group + label 与 `missionControl` 不碰撞 + 单实例语义（active-run guard 等）不得被第二实例破坏；`provide()` 同 label 行为经 D1 核验后写入规则。冲突检查的机器断言面（mount 不拒 / 无 label 碰撞 / 服务唯一点解析）随之定稿。
  - Skill: none
- [x] `Decision` **D4 验证域**：三层裁定——① 结构域（纯 Node 进插件链：目录形状、preset.yml 仅 display、组合行约束〔服务行必在 isolate group / 相对行文件在盘 / bare 包名仅引用宿主组合已知包〕）；② 组合域（in-process boot：preset roster（roots 指向 in-repo preset 目录）+ 插件服务行同树——断言 preset 非 broken、mount 成功、mdcontrol 仍可解析与调用、AGE 提示段出现在组合面、子代理 composeFrom 加入 AGE 组合的可达断言、**mission child 加入 AGE 组合下引擎 marker 合法性保持**〔若组合腿复用 `verify:e2e` driver 则免费获得——draft review it1 N3，显式入裁定面防覆盖缺口〕）；③ 真宿主腿（env-gated 扩展 `verify:native` 姿势 vs 仅文档化人工步——按 e2e 可达性裁定；不可行域如实记录 verification scope limited）。新 devDep 裁定（draft review it1 N5 预答）：roster 组合包 `@deepseek-ai/dsh-agent-presets` **已在 npm 发布 `0.1.1-rc.2`**（`latest` dist-tag 滞后——按既有纪律字面钉版，不跟 tag）→ 预期落地为 devDependencies exact 钉版、shipped 面零变化；else-branch（不可用/不适用）= 如实记录并回落到仅结构域 + 真宿主人工腿，不静默缩面。
  - Skill: none

Exit Criteria:

- [x] 四项 Decision 连同依据 / 备选 / 残险记录于 plan（Phase 1 Decision Record）
- [x] `docs/logs/` updated（Phase 1 决策条目）

### Phase 2 - preset 工件 + 结构门禁

Status: completed
Targets: `plugin/dsh/preset/`（位置随 D2 定稿）、`plugin/dsh/test/`、`plugin/dsh/scripts/check-manifest.mjs`（或新增结构检查脚本）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1 四 Decision

- [x] `Add` preset 目录落地（`agent.cordis.yml` + preset 本地行文件〔.mjs 提示段/工具面行，anchored-standard 相对行先例〕+ `preset.yml` display），内容按 D2 清单；组合行 realm 姿势按 D3（服务行零携带或独立 isolate group）。
  - Skill: none
- [x] `Add` 结构门禁（插件链纯 Node 用例）：目录/文件形状断言 + preset.yml 仅 display 断言 + 组合行约束断言（D3 规则机器化）+ 与 bundle patch 一致性（无重复服务发布面）。
  - Skill: none
- [x] `Proof` 插件链全绿零回归：`npm --prefix plugin/dsh test`（扩展后）+ `./verify-age.sh` exit 0 + 引擎目录零 diff 实测（`git status tools/mission-driver` 全净）。
  - Skill: none

Exit Criteria:

- [x] preset 工件存在且被结构门禁机器钉住（含 D3 realm 规则断言）
- [x] 插件链 / 聚合门禁零回归、零引擎 diff 实测
- [x] `docs/logs/` updated

### Phase 3 - 组合验证 + docs/roadmap 回写

Status: completed
Targets: `plugin/dsh/scripts/`（组合腿脚本，随 D4 裁定）、`plugin/dsh/package.json`（新 devDeps 如有——devDependencies-only）、`docs/testing/2026/`、`docs/architecture/dsh-plugin-packaging.md`、`docs/design/dsh-plugin-integration.md`、`docs/analysis/2026-08-22-0001-dsh-host-api-contract-verification.md`、`docs/process/dsh-plugin-development-guide.md`、roadmap
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Proof`
- Prereqs: Phase 2

- [x] `Proof` 组合腿按 D4 裁定跑通并记录 `docs/testing/2026/`（命令/环境/断言/scope 声明）；固化可复跑命令；env-gated 腿（如有）三态语义镜像 `verify:native`（缺开关 skip exit 0 / 永不 CI-blocking / `./verify-age.sh` 无 env 仍绿实测）。
  - Skill: none
- [x] `Proof` owner docs + roadmap 对齐：packaging doc（§Phased Delivery P4 as-built、§Packaging Layout 树增 preset 目录、§Service Surface 或新增 §AGE preset as-built 段、§Dependency and Version Risk 新 devDep 记录如有）；design doc（§User-visible capabilities / §User Experience AGE 模式 as-built 注记）；R1 §7 闭合注记（核验落档指向本 plan）；dev guide（消费者安装/装载/验证步骤）；roadmap WI14 `todo → done`（证据摘要内联；如与字面规则有差异，差异与理由注记）。
  - Skill: none
- [x] `Proof` `docs/logs/` 聚合收口条目。
  - Skill: none

Exit Criteria:

- [x] 组合验证按裁定域跑通并固化（scope limited 域如实标注）
- [x] owner docs / roadmap 与落地状态一致（document-audit 对照）
- [x] `docs/logs/` updated

## Draft Review Record

- Independent draft review iteration 1: `acceptable as-is`（独立 fresh session `ses_fd105b652ffeJ3VAJHdB64O052`，2026-08-23）——零阻塞项。审查者独立跑通插件链（116/116）并对 baseline 做全量 live 对抗核查（cordis.patch.yml / service.ts / mdcontrol-skills.ts HTTP_NOTE / e2e fixture 16 行非 isolate 分工 / 宿主 `packages/preset` 两 README 逐条 / roster 目录 / anchored-standard 头注与 combo preset.yml 形状 / npm 上 `@deepseek-ai/dsh-agent-presets@0.1.1-rc.2` 已发布——全部匹配）。非阻塞 6 项全采纳：N1 `provide()` 同 label 抛错事实的来源映射修正（anchored-standard 头注〔社区注记〕非 host README，D1 核验后作实——已改 Baseline 标注）；N2 Phase 3 Item Types 修正为 `Proof`（Decision 全在 Phase 1）；N3 D4 组合域补 "mission child 加入 AGE 组合下引擎 marker 合法性保持" 断言（复用 `verify:e2e` driver 则免费获得）；N4 D4 预答 devDep 问题（roster 包 npm 已发布 `0.1.1-rc.2`，字面钉版——已写入 D4 与 Infra prereqs）；N5 D4 显式 else-branch（不可用时回落结构域 + 人工腿，不静默缩面——已写入）；N6 mission-child 继承链标注为 README 推断 + `preset-inheritance.spec.ts` 佐证、D1 对 driver 源码确认（已改 Baseline 标注）。共识达成，Plan Status → active。

## Closure Gates

- [x] in-scope behavior is complete
- [x] relevant docs are aligned
- [x] verification has run（结构域插件链 + 聚合门零回归 + 组合腿按 D4 裁定域；命令在各 Proof 项固化）
- [x] scoped verification is not conflated with full verification——真宿主腿（如有）按 env 门禁姿态如实标注；组合域断言面 vs 真宿主面边界显式
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### 真模型下 AGE 模式会话的自然语言体验验证

- Classification: `watch-only residual`
- Why Not Blocking Closure: 与 1852-2 "真模型自然语言技能调用" 同族——确定性门禁只能钉组合/注册/路由面；自然语言质量属 env 人工腿（本机无凭据）。
- Successor Required: `no`（reopen trigger = 真实凭据腿可用时，与既有 env 人工腿合并执行）

## Closure

Status Note: M4-WI14 完成收口（2026-08-23）。三 Phase 全过：Phase 1 四 Decision（含 host loader 核验 + 两项 refinement）落档 plan Decision Record；Phase 2 preset 工件 + executor 组合接线 + 结构门禁（11 用例）+ 单测（+5/+1）落地；Phase 3 组合腿（`verify:e2e:preset` 四连跑全绿）+ docs/roadmap 回写。执行期三项修订（A1 command-compact 裁撤 / A2 base.json agent 默认值 / A3 stub 断言面勘误）记录于 Execution Addendum。P4 gate 字面主张 "preset + plugin compose without realm collision" **MET**（零服务行 by construction + 同树组合腿机器证明）。零引擎 diff、shipped `dependencies` 零变化、红线全保持。WI15（状态面板决策）留待 plan `2202-2`。

Closure Audit Evidence:

- 独立 closure audit（fresh-session subagent `ses_fd0daadaeffew1i7Vdq5b62BYH`，冷回放，2026-08-23）：**PASS**——红线四项复核全净（零引擎 diff〔`git status tools/mission-driver` 空〕/ dependencies 恰 5 项原版本〔9 新 devDeps exact 0.1.1-rc.2、command-compact 撤销作实〕/ preset 无 marker 示例 / 零服务行 + isolate 仅 compaction group）；审计会话独立复跑插件链 **133/133** + `./verify-age.sh` exit 0（L1 660/660 + L2 133/133）+ `verify:e2e:preset` SUMMARY PASS（roster age 非 broken / session probe age:mode+digest+grep/glob / skills 3/3 / mission child marker 合法 exitCode 0 / mdcontrol 前后解析）；7 项 docs 对齐全确认；plan 一致性核对（全 [x]、三 Phase completed、唯一 deferral 为预裁定 §Deferred）。非阻塞观察 5 条：closure 回写本项（本条目即补齐）、dependencies 键序字母化（集合恒等）、他套件 plain yaml.parse 的 !!js TAG_RESOLVE_FAILED 噪音（age-preset 套件自身已 customTags 处理）、fixture 双源 tool-skill artifact（分层 shadow，头注已载）、"四连跑" 历史复数依 testing doc 记录（审计复跑单次绿）。

Follow-up:

- 无 confirmed defect。watch-only：真宿主 roster 注册人工腿（dev guide §AGE Mode 成文，reopen trigger = 真实凭据/env 腿可用时与既有人工腿合并）+ 真模型 AGE 会话自然语言质量（§Deferred 既有立案）。
