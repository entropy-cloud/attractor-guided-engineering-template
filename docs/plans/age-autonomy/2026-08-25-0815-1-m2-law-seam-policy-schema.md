---
status: active
mission: age-autonomy-implementation
work-item: M2-WI12+WI13
group: "2026-08-25-0815"
verify: [test]
---

# 2026-08-25-0815-1 M2 法律基座：gate 纯函数 seam + autonomy.policy.yml schema + mission/CLI 接线（age-autonomy M2-WI12+WI13）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M2 WI12/WI13；契约 owner `docs/design/age-autonomy/02-rule-law.md` §2/§3/§4.9/§6；`docs/design/age-autonomy/00-overview.md` §3（零引擎 diff 底线）
> Related: 前置 M1 批次 `2026-08-25-0635-{1,2,3}`（ledger 基座：frontmatter 解析 / 计数域扫描 / 完成派生 / 双读接线）；同批执行顺序：本 plan（N=1）→ `2026-08-25-0815-2`（N=2，三硬门 WI14–WI16）→ `2026-08-25-0815-3`（N=3，配套门禁 WI17–WI20）——后两者消费本 plan 全部导出面

## Current Baseline

**门禁层从零开始：唯一现存门禁是单条硬编码规则（plan-status-gate.ts，legacy 证据面），无 proposedAction 契约、无 policy 文件、无规则注册表、无 gate CLI；mission json 已有两处悬空引用等着本 plan 兑现。**（以下事实 2026-08-25 live 核实）

- **现存唯一门禁**：`plugin/dsh/src/plan-status-gate.ts`（dsh-plugin M3-WI13 产物）——单条规则：matcher 为 legacy `> Plan Status:` 正则 over proposedContent（write/edit/str_replace_editor 经 `extractProposedContent`），证据面 = run-state 子流程扫描（`scanSubflowMatches` 读 run-state.json subflowRuns），allow faces F1 in-flight / F2 CLOSURE_AUDIT closed / F3 BUILD_VERIFY-or-completed，fail-open try/catch 包裹，经 `ctx.on('tools/pre-execute')` 挂载（service.ts:101-107）。无 actor 概念、无 policy、无 rule registry——它是 WI12 要泛化的 seam 原型，其 run-state 证据面是 WI22 要重建的对象（本 plan 不动它，两监听器并存）。
- **悬空引用（本 plan 兑现面）**：`missions/age-autonomy-implementation.json:11` 已声明 `"autonomyPolicy": "missions/autonomy.policy.yml"`（文件不存在，missions/ 下实测无该文件）；`commands.gates: "node tools/mission-driver/src/gate-check.mjs"`（engine src 下实测无该文件）。mission-check 现状不校验 autonomyPolicy（REQUIRED_FIELDS = name/roadmapPath/plansDir/commands，mission-check.mjs:13）。
- **可选路径字段 fail-fast 先例**：mission-check.mjs:75-83 对 contextDir/moduleDir/promptsDir 已是「设置即校验路径存在」家族——autonomyPolicy 加入同族即 WI13 的 mission 校验面，模式零新发明。
- **证据库就绪（M1 交付，全部纯函数）**：`tools/mission-driver/src/ledger-sections.mjs` 导出 `scanPlanLedger`/`scanRoadmapLedger`/`parseLedgerId`/`computeBasisHash`/`deriveCompleted` + 谓词族 `draftPlans`/`activePlans`/`heldPlans`/`closedPlans`/`openPlans`/`awaitingClosure`（activePlans/closedPlans/awaitingClosure 可注入 defaultVerifyKeys）；`ledger-frontmatter.mjs` 字段集校验（`PLAN_FRONTMATTER_FIELDS`）；`ledger-dualread.mjs` 双读。门禁规则的全部判定输入已可在纯函数内获得——本 plan 只需把它们组织进 gate 契约。
- **引擎→插件共享通道（既定裁定承袭）**：build-bundle.mjs `ALLOWED_MODULES`（:42）已登记 ledger 三库；引擎侧新增零 import 模块在接线前 unreachable-allowed 属预期态（0635-1 预告）。共享库必须引擎侧的裁定（0635-1 Phase 1：模板消费者只拿 tools/mission-driver——install-age.manifest 不含 plugin/；引擎基线 Node ≥18 vs 插件 TS 依赖 Node ≥22.19 type-stripping）对 law 内核同样成立。
- **actor 身份源**：plan-status-gate.ts:423 注释指明宿主 waterfall carrier `scopeTarget(this, exec.agent)`——pre-execute 事件携带 agent 维度信息；确切字段形态（session id / agent 名 / 角色可得性）需 Phase 1 Explore 核实。若不可得：DSH 面 actor=undefined 走结构子集姿态并成文残险（02 §2 允许），M3 守夜人补强。
- **设计契约（02-rule-law）**：§2 gate 签名 `(proposedAction, currentFileState) → allow | deny(reason)`，proposedAction = `{type: write|edit|str_replace_editor|claim|dispatch|terminal-claim, path, proposedContent, baseHash?, actor?: {id?, role: human|drafter|reviewer|auditor|supervisor|engine|executor}}`；actor 缺省 = 结构子集（CI/git hooks 部署面，身份断言不参与 allow 判断、不声称验证写者）。§3 DSL：`version` / `gates[] {id, match, rule}`（`{{plansDir}}`/`{{roadmapPath}}` 按 mission 上下文解析）/ `triggers[]`（守夜人 M3 消费，schema 本 plan 钉住）/ `agents` / `dispatch` 映射。§4.9 具名 agent：`mode pooled|fresh`、池化参数、`fixedPrefix` 块 schema `{kind: text|file|dir, ref, maxFileBytes?}`、`model: {provider, model, reasoningEffort?}`、`requireDistinctModel?`；plan frontmatter `agent:` 只能引用已定义名。§6 部署面三形态（DSH pre-execute / CI 结构子集 / plan-check 纯校验 CLI）+ 上线纪律：一般门禁 observe-only 先行、fail-open 默认；三硬门与 append-only 直接 enforce 的例外授权在 P0（=M1）完成后生效。
- **roadmap WI13 字面附加项**：schema 含 `version/limits/gates/triggers` 四段——`limits` 段（maxAuditRounds 等）最小键集与既有 mission config 通道（engine.js:428 `flow.maxAuditRounds`）的优先级关系需裁定（见 Phase 2 Decision）；trigger 谓词语法 = 受限 and/or/not + 谓词集（执行语义 M3/WI26）；R1–R4 归属同步（终态规则本体 M3/WI27，schema 侧只钉 trigger 出口形态 `dispatch|action|terminal`）。
- **测试通道**：engine `tools/mission-driver/test/*.test.js` 自动进 `pnpm --prefix tools/mission-driver test`（L1 链，810 现状基线，执行时以当日实测为准且不得回退）；plugin `plugin/dsh/test/*.test.mjs` 进 `npm --prefix plugin/dsh test`（133 现状基线）；WI24 gate 指名 `plugin/dsh/test/law-truth-table.test.mjs` ≥30 用例（M2 收口时点验收——本 plan 奠基，N=2/N=3 增补）。

## Goals

- 引擎侧 law 内核：proposedAction 契约解析/校验 + 规则注册表 + policy 驱动的 evaluate 入口（allow / deny(reason) / observe 记录；结构子集模式），零 npm 依赖、零 engine 核心文件改动。
- `missions/autonomy.policy.yml` 真实实例 + schema 校验器（version/limits/gates/triggers/agents/dispatch 全字段、fixedPrefix 块、agent 名交叉校验、trigger 谓词受限语法），结构测试钉住。
- mission 注入适配：mission-check 增 autonomyPolicy fail-fast 校验；config 解析 policy 路径并按 mission 上下文解析 `{{plansDir}}`/`{{roadmapPath}}`。
- `tools/mission-driver/src/gate-check.mjs` CLI 骨架（`--policy` 校验模式 + 单文件结构面评估），解除 `commands.gates` 悬空引用。
- `plugin/dsh/src/law/` 宿主适配层：policy 加载 + tools/pre-execute 注册 law 内核（observe-only + 观察日志），与 plan-status-gate 并存互不干扰。
- 种子规则 `plan-structure` 贯通三形态（DSH 观察 / CLI 结构 / 测试真值表），证明 seam 端到端可用——N=2/N=3 的全部门禁规则在本注册表上落位。

## Non-Goals

- 三硬门与配套门禁规则本体（WI14–WI20 → 同批 N=2/N=3 plan）。
- triggers 的执行语义与守夜人（M3/WI25/WI26；本 plan 仅 schema 钉住语法与出口形态）。
- plan-status-gate 证据面重建/退役（WI22）、pre-commit hook 与 CI job 接线（WI23）、`MISSION_DRIVER_LEDGER=frontmatter` 收紧切换（0635-3 Deferred 裁定：切换时点归 M2 enforce 阶段后续）。
- agents 池化 / PromptAssembler / fixedPrefix 实际消费（M4；本 plan 只做 schema 校验，不解析模型绑定）。
- `requireDistinctModel` 运行时强制（派发时校验属守夜人 M3；静态可满足性检查归 N=2/WI14）。

## Task Route

- Type: `architecture change`（新增横切法律层：引擎侧内核 + 插件侧适配 + mission 配置面）
- Owner Docs: `docs/design/age-autonomy/02-rule-law.md`（契约 owner）、`docs/design/age-autonomy/00-overview.md` §3/§5、`docs/design/age-autonomy/01-file-ledger.md` §2/§5.2（结构规则与谓词的证据输入）、`docs/architecture/mission-driver-baseline.md`（引擎不变量与双形态）
- Skill Selection Basis: `docs/skills/README.md` 无匹配本任务方法的项目 skill（默认审计 prompt 面向 plan/roadmap 审计，非架构实现）→ Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（新增文件均仓库内并进 git：law 内核模块、gate-check.mjs、missions/autonomy.policy.yml、plugin/dsh/src/law/；不改 engine.js、不新增 npm 依赖、不触 CI 触发路径）

## Phase 1 — law 内核 seam 与关键裁定

Targets: `tools/mission-driver/src/`（新 law 内核模块，命名随实现定，如 `law-core.mjs`）、`plugin/dsh/scripts/build-bundle.mjs`
Skill: none

- Item Types: `Decision | Explore | Add | Proof`
- Prereqs: 无（M1 基座已在 main）

- [x] `Decision` **law 内核放置裁定**：内核（契约 + 注册表 + evaluate）落引擎侧 `.mjs` 零 import 模块，经 build-bundle ALLOWED_MODULES 通道共享给插件 assets；`plugin/dsh/src/law/` 只放宿主适配层（actor 解析、policy 文件 IO、pre-execute 注册、观察日志）。备选：plugin TS 内实现 + 引擎复制——否决，承袭 0635-1 裁定（模板可交付性 + Node ≥18 基线 + 双形态同一纯函数是 02 §6 三部署面的硬前提）。**与 roadmap「核心纪律」散文字面（「所有新增逻辑沉淀在 plugin/dsh/src/{ledger,law,...}」）的张力在此成文**：该散文与 M1 既成裁定（ledger 三库引擎侧）已不一致，本裁定按 0635-1 同一推理沿用到 law 内核（保护面不变量：`git diff` 证明 engine 核心零改动；插件侧 TS 只做宿主胶水）。残险：插件 TS 面与 assets 副本的版本一致性由既有 freshness check 守护，无新增面。**执行落点**：`tools/mission-driver/src/law-core.mjs` + `law-policy.mjs`（见 Phase 2），ALLOWED_MODULES 双侧登记（build-bundle.mjs + bundle-scaffold 镜像），closure 24/24、assets 副本已物化（config.js→law-policy→law-core import 链）。
- [x] `Decision` **proposedAction 契约精确面**：按 02 §2 落地 type 七枚举、path/proposedContent、`baseHash?`（语义 = 写者提供的 CAS 提示：present 且与 currentFileState hash 不符 → deny（stale-write）；M2 为尽力比对 + 观察日志，Q4 三选一槽位路由（02 §4.5）延至守夜人统一落盘路径立项时裁定，本 plan 只定字段语义）；`actor?` 缺省 = 结构子集模式（评估结果允许携带 `unverified-writer` 注记但不得据此 deny）。非法输入（未知 type、缺 path/proposedContent）→ deny malformed 而非 crash（fail-open 只包内部错误，02 §6 语义：输入非法是可判定事实，不是内部故障）。**执行校准**：baseHash 非法形状（非 sha256 hex）同样 deny malformed；actor.role 非法枚举 = 契约违例 → deny malformed（身份断言不参与 allow 判断，但假角色名是可判定事实）。
- [x] `Decision` **规则姿态机制**：policy 每 gate 条目携带 `mode: observe | enforce`（缺省 observe）——02 §6 上线纪律的机械化：observe 模式评估照跑、结果进观察日志、不拦截；enforce 模式 deny 生效。后续 plan 落规则时逐条切换，切换授权依据（三硬门/append-only 直接 enforce 例外）写进各 plan 的 Decision。
- [x] `Explore` → `Decision` **actor 身份可得性**：核实 pre-execute ToolExecution 事件的 agent/session 字段形态（plan-status-gate.ts:423 `exec.agent` 线索）；可得 → 定义 `actor.id` 映射与 role 推断规则；不可得 → DSH 面降级结构子集并成文残险（M3 补强），Explore 结论记录于本 plan 或引用的讨论文件。**Explore 结论（2026-08-25 live 源码核实）**：`ToolExecution.agent?: Agent`（dsh-tools lib/types/index.d.ts:206，「The agent on whose behalf the call runs (set by the agent loop)」），`Agent.id: SessionId`（branded string，dsh-agent runtime-types.d.ts:62）——**actor.id 可得**（`String(exec.agent?.id)`，宿主 agent-loop 设置；host 级无 agent 调用为 undefined）；**role 不可推断**（Agent 面无 role/name 信号，policy 的 agents 段是部署映射非运行时身份）→ 裁定：DSH 面 actor = `{ id }`（role 缺省），评估按结构子集姿态携带 `unverified-writer` 注记运行（02 §2 允许），role 推断（reviewer/auditor session 对账）留 M3 守夜人 dispatch 登记面补强——成文残险。
- [x] `Add` law 内核模块：proposedAction 解析/校验、规则注册表（rule id → 纯函数 `(proposedAction, currentFileState, ctx) → allow|deny(reason)|observe`，ctx 携带 mission 解析后的 policy 与 ledger 扫描结果）、evaluate 入口（按 policy gates 的 match 域分派）；ALLOWED_MODULES 登记 + unreachable-allowed 预期态注释。**执行落点**：`src/law-core.mjs`（`parseProposedAction`/`registerRule`/`listRuleIds`/`getRule`/`matchGate`/`evaluateGates`/`sha256Text` + 常量面）；规则内部错误 per-rule fail-open（observation `rule-error` + 不阻断其他 gate，比整面 fail-open 更强的 02 §6 姿态；整面 throw 仍由宿主 try/catch 兜底）。可达性 = config.js→law-policy→law-core（真实消费者，非人为 import），unreachable-allowed 注释随 gate-check.mjs 不入 ALLOWED 的裁定一并成文（CLI 属 main.js 家族，非 bundle 库面）。
- [x] `Add` 种子规则 `plan-structure`：对 proposedContent 跑 `scanPlanLedger` 结构校验（计数域纪律 / frontmatter 合法性 / append-only 区行语法）——即「写入后的文件仍是一份合法 plan 账本」。match 域 `{{plansDir}}/**/*.md`。**执行校准（双读域守卫）**：无 frontmatter 块的文件（legacy 语料 / 非 plan md）= 规则域外 → allow + format 注记（02 §6 WI13 误杀教训 + 0635-3 双读过渡裁定；frontmatter 收紧 deny 开关归 M2 enforce 阶段后续）；**有** frontmatter 块但语法坏（fmError，如未闭合/块标量）= 可判定违例 → deny，不走域外跳过。glob 语义：`**/` 匹配零或多层目录、`*` 不跨 `/`。
- [x] `Proof` engine 单测：契约越界反向用例（未知 type / 缺字段 / 块标量 frontmatter / 越域 checkbox / append-only 区畸形行）+ 结构子集模式注记行为 + observe 模式不拦截。命令：`pnpm --prefix tools/mission-driver test`。**执行落点**：`test/law-core.test.js` 23 例全绿（含 enforce 阻断面、CAS 尽力比对三分支、throwing-rule fail-open、legacy 域外、agentNames 注入面）。

Exit Criteria:

- [x] seam 模块零 npm 依赖、零 engine 核心 import、零 engine 核心文件改动（`git diff --stat tools/mission-driver/src/engine.js` 为空）；build-bundle 登记 + `node plugin/dsh/scripts/smoke-import.mjs` 绿
- [x] plan-structure 规则对真实 plan 文件（合法 fixture 与构造的反例）产生正确结构判定
- [x] `pnpm --prefix tools/mission-driver test` 全绿（新增测试进 L1 链，既有 810 基线不回退）
- [x] `docs/logs/` 更新

## Phase 2 — autonomy.policy.yml schema 与 mission 注入

Targets: `missions/autonomy.policy.yml`（新）、`tools/mission-driver/src/mission-check.mjs`、law 内核（policy 解析器）、`tools/mission-driver/src/config.js`（policy 路径解析注入）
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: Phase 1（注册表与 rule id 词汇表是 gates.rule 校验的输入）

- [x] `Decision` **policy YAML 解析策略（零依赖硬边界下的语法面裁定）**：引擎零 npm 依赖不变量 + 插件侧 `yaml` 包对引擎不可达 → policy 解析器必须手写受限子集解析（镜像 ledger-frontmatter 硬边界先例）：接受块映射 + 单行 flow 映射/数组（02 §3 示例形态：`gates[]` 条目块、`model: { provider, model }` 单行 flow、`fixedPrefix: [ { kind, ref } ]` flow 数组）；拒绝锚点/别名/块标量（`|`/`>`）/多行标量/嵌套超过 schema 深度——越界即校验错误（deny reason 指向合法形态）。备选：① 通用 mini-YAML——否决，越界宽容面大且 deny reason 质量差；② policy 改 JSON 文件——否决，02 §3 契约已定 YAML 形态且消费者可读性差。残险：受限子集限制 policy 表达力——由 schema 校验器给出明确合法形态提示缓解；语法面是 N=2/N=3 规则注册的依赖，本裁定在它们执行前钉稳。**执行落点**：`src/law-policy.mjs` `parseRestrictedYaml`（块深度上限 4 / flow 深度上限 3 / tab 禁用 / 序列项内联映射键对齐 indent+2）。
- [x] `Decision` **limits 段键集与优先级**：schema 支持 `limits: {maxAuditRounds, ...}`（WI13 字面）；与既有 mission config 通道（engine.js:428 `flow.maxAuditRounds`）的关系裁定为：policy 优先、mission config 回退（单真相原则：同一约束只允许一个权威源 + 一个回退源，成文于 policy 文件头注释与 02 引用面）；`maxFailures` 键位预留（默认值归属 mission config 的终审 P2-3 裁定在 M3/WI27 兑现，本 plan 只定 schema 形状不定默认值语义）。**执行校准**：真实实例 limits 取 `maxAuditRounds: 3` 与 `flows/mission-driver.json:7` 现值一致（消费面切换前的双通道一致，无 live 矛盾）；消费面切换（policy 权威生效）归 N=3/WI17 预算闸。
- [x] `Add` policy 加载 + schema 校验器：`version`（必填 =1）；`limits`（如上）；`gates[]`（id 唯一非空、match 字符串含 `{{plansDir}}`/`{{roadmapPath}}`/`action:` 前缀合法形态、rule 名命中内核注册表）；`triggers[]`（`when` 受限谓词语法：谓词集 + and/or/not 组合、越界语法 deny；出口 = `dispatch | action | terminal` 三选一，dispatch/action 值域为已知派发类型与动作名——执行语义 M3）；`agents{}`（name → `{mode: pooled|fresh, poolKey?, idleTtlMinutes?, rotateEvery?, fixedPrefix[], model: {provider, model, reasoningEffort?}, requireDistinctModel?}`）；`fixedPrefix` 块 `{kind: text|file|dir, ref, maxFileBytes?}`（kind 枚举 + dir 模式 maxFileBytes 必填，终审 P1-3）；`dispatch{}`（派发类型 → agent 名，值必须命中 agents 已定义名，终审 P2-6）。未知顶层键/未知 gate 字段 → 校验错误（与 frontmatter 未知键策略同纪律）。**执行落点**：`src/law-policy.mjs` `validatePolicy`/`parsePolicy`/`loadPolicyFile`/`parseTriggerWhen`（谓词集 14 项，atom/cmp/call 三形态；`roadmap.unchecked` = 设计散文「roadmap 有未勾」的机器名）。
- [x] `Add` agent 名交叉校验通道：`validatePlanFrontmatter` 支持注入 agents 名单（提供时：`agent:` 字段值未命中 → error；缺省不注入 → 跳过，保持 M1 行为）——plan frontmatter `agent:` 引用校验的机器面（02 §4.9「plan 级引用示例」）。消费面 M2 内即生效：plan-structure 规则 ctx 与 gate-check/宿主适配层加载 policy 后注入该名单（执法面 live，非 tests-only；agents 名单缺失的部署回退为跳过 + 注记）。**执行落点**：ledger-frontmatter.mjs `validatePlanFrontmatter(fm, opts)` 第二参（additive，M1 单参调用零变化）；law-core `planStructureRule` 经 `ctx.agentNames` 注入；config.js 解析 `_agentNames` 供 gate ctx。
- [x] `Add` 真实实例 `missions/autonomy.policy.yml`：初版只登记已实现规则（plan-structure，observe 模式）+ 02 §3 示例骨架适配的 agents/dispatch/triggers 段（本仓库真实 agent 名与派发映射）；policy 是活文件，N=2/N=3 落规则时增补 gate 条目属合法演化（演化 = plan 内 Add 项，不允许随手改——执法数据，P8 保护归 WI21 立项）。**执行内容**：7 条 trigger（02 §3 全示例的 and/or/not 机器语法化）+ 4 agents（drafter pooled/reviewer fresh/auditor fresh+requireDistinctModel/executor pooled）+ 6 dispatch 映射 + limits 双值。
- [x] `Add` mission-check 增 `autonomyPolicy` 可选字段 fail-fast 校验（加入 :75-83 contextDir/moduleDir/promptsDir 家族：设置即校验存在）；config.js 解析 policy 路径为运行参数（`{{plansDir}}`/`{{roadmapPath}}` 按 mission 上下文替换后供 gate ctx 消费）。**执行落点**：mission-check.mjs 存在性家族 + config.js `autonomyPolicyPath`/`autonomyPolicy`（eager load+validate fail-fast——坏 policy 在 run 启动即炸，非首 gate 才炸）。
- [x] `Proof` schema 结构测试：合法/非法 fixture 矩阵（缺 version、未知 rule 名、dispatch 引用未定义 agent、fixedPrefix 非法 kind / dir 缺 maxFileBytes、trigger 谓词越界语法、未知顶层键、gates id 重复）全绿；`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0。**执行落点**：`test/law-policy.test.js` 18 例全绿（真实实例 + 9 类非法矩阵 + YAML 硬边界 7 反例 + when 语法 13 正/10 反 + 占位符 + mission-check 面）；mission-check exit 0 已 live 验证（autonomyPolicy 悬空引用消除）。

Exit Criteria:

- [x] policy 校验器对真实实例 exit 0；全部非法 fixture deny 且 reason 指向合法路径（02 §2 结构化 deny 纪律）
- [x] `node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0（autonomyPolicy 悬空引用消除）
- [x] `pnpm --prefix tools/mission-driver test` 全绿
- [x] `docs/logs/` 更新

## Phase 3 — gate-check CLI、plugin 宿主适配与真值表奠基

Targets: `tools/mission-driver/src/gate-check.mjs`（新）、`plugin/dsh/src/law/`（新）、`plugin/dsh/test/law-truth-table.test.mjs`（新）、`tools/mission-driver/CONTEXT.md`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1（内核）+ Phase 2（policy 实例与 mission 注入）

- [x] `Add` gate-check.mjs CLI：`--policy <file>` 校验模式（结构化输出 + exit 0/1）；`gate-check.mjs <plan.md>` 单文件结构面评估（无 actor 结构子集，02 §6 部署面 3；对 plan 文件跑已注册规则的 structural face）。bare 调用（无参）打印 usage 并 exit 1——`commands.gates` 的可执行性由带参形态满足。**执行落点**：`src/gate-check.mjs`（`structuralRuleIds()` 直连结构规则面，绕过 policy match；单文件 ctx.plansDir = 文件所在目录）。
- [x] `Add` `plugin/dsh/src/law/` 适配层：启动时按 mission 上下文加载 policy → 注册 tools/pre-execute 监听 → proposedContent 提取（复用 plan-status-gate 的 extract 模式）→ actor 解析（Phase 1 裁定）→ law 内核 evaluate → observe-only 记录到观察日志面。与 plan-status-gate 并存（独立监听器、独立 disposer，互不干扰、无共享可变状态）。**执行落点**：`plugin/dsh/src/law/host-adapter.ts`（`registerLawGate`/`evaluateLawCall`/`discoverLawContext` 祖先走查 + 按 ancestor 缓存 policy、观察面 = `_tmp/law-observations.jsonl` JSONL + logger 结构行；enforce-deny 返回路径在位——当前 policy 全 observe，机制就绪待 N=2/N=3 逐门授权）；service.ts 挂载 + mount summary（独立 effect disposer）。
- [x] `Add` `plugin/dsh/test/law-truth-table.test.mjs` 奠基：seam（契约/结构子集/observe 不拦截）+ policy（schema 矩阵抽样）+ plan-structure 真值表用例；文件与用例形态按 WI24 gate 命名对齐，N=2/N=3 在同文件增补至 ≥30。**执行内容**：25 例（seam 5 + policy 2 + truth table 10 + adapter 8——经 **assets 副本** import 内核与校验器，通道即证明）。
- [x] `Proof` plugin 测试：适配层挂载/卸载与 disposer、观察日志产出、fail-open 崩溃路径（内核 throw → 放行 + warn 日志，承袭 D1 裁定）；`node tools/mission-driver/src/gate-check.mjs --policy missions/autonomy.policy.yml` exit 0；`node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/2026-08-25-0635-1-m1-frontmatter-ledger-core.md` 对存量合法 plan 通过结构面。**执行证据**：fail-open 两层各自钉住（per-rule `rule-error` observation / 整面 `internal error — failing open` warn，后者经注入抛错 IO seam 真实触发）；宿主面 = **真实 cordis `Context.waterfall('tools/pre-execute')`** 事件管线 + 真实磁盘 policy 发现 + 真实观察 JSONL 落盘（非 ctx mock）；gate-check 两命令 exit 0 已 live 复核（0635-1 legacy 格式 → 域外放行 exit 0；0635-3/0815-2 frontmatter 格式 → 全结构校验通过 exit 0）。
- [x] `Add` 文档同步：`tools/mission-driver/CONTEXT.md` 增 law 内核一行（放置裁定 + 注册表 + CLI）；`docs/design/age-autonomy/02-rule-law.md` §6 部署面表「手动文件流」行补 gate-check.mjs 实名（supported baseline 的最小事实性增补，附 changelog 注记）；roadmap WI12/WI13 tick 回写（证据指针：内核模块 + policy 文件 + 测试文件路径）；`docs/logs/` 收口条目。

Exit Criteria:

- [x] `npm --prefix plugin/dsh test` 全绿（新增测试 + 既有 133 不回归；closure/freshness/smoke-import 绿——assets 含 law 内核副本）
- [x] `pnpm --prefix tools/mission-driver test` 全绿；`./verify-age.sh` L1+L2 绿
- [x] 宿主面可演示一条真实 evaluate 观察记录（harness 测试或 e2e 面证据，非仅单测 mock）
- [x] roadmap WI12/WI13 `[x]` + 证据指针；`docs/logs/` 收口条目；02 §6 部署面 CLI 实名同步（Phase 3 Add 项）

## Draft Review Record

- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0815-1-m2-law-seam-policy-schema-1-01e95ff6 to ses_reviewer_1
- 2026-08-25：iteration 1，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0815-1-m2-law-seam-policy-schema-1-01e95ff6（独立评审 ses_reviewer_1：13 项 baseline 抽查全实证；阻塞项 = policy YAML 解析策略未记录为 Decision——已按建议补 Phase 2「policy YAML 解析策略」Decision；非阻塞 5 项：810 基线数、Explore 类型声明、agent 名单注入消费面、02 §6 CLI 实名提升为 Add 项、roadmap 散文与 0635-1 裁定张力成文——均已修）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0815-1-m2-law-seam-policy-schema-2-43557bba to ses_reviewer_1
- 2026-08-25：iteration 2，共识 acceptable-as-is #review-2026-08-25-063133-mission-driver-2026-08-25-0815-1-m2-law-seam-policy-schema-2-43557bba（独立复核：六项修复全部落地且 sound——解析策略 Decision 对 02 §3 形态钉住正确、零依赖前提实证（engine 无 dependencies、plugin yaml 为 devDependency）；baseline 抽查全实证；无新引入问题。非阻塞 4 项留执行期裁量：块序列措辞精确化、devDependency 论据增强、02 changelog 形态、roadmap 陈旧散文的后续 doc-sync）

## Verification

- 2026-08-25 执行期复核（过渡期写者裁定承袭 0635-3：`- pass` 行由引擎 BUILD_VERIFY 步骤按当次 basisHash 补写，此处记录执行面证据）：`pnpm --prefix tools/mission-driver test` 857 pass/0 fail（基线 816 + law-core 23 + law-policy 18；prompt-check OK）；`npm --prefix plugin/dsh test` 158 pass/0 fail（基线 133 + law-truth-table 25；closure 24/24、freshness 41 文件 content-equal、smoke-import ok、tsc --noEmit 干净）；`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0；`node tools/mission-driver/src/gate-check.mjs --policy missions/autonomy.policy.yml` exit 0；`node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/2026-08-25-0635-1-m1-frontmatter-ledger-core.md` exit 0（legacy 域外放行）；`./verify-age.sh` L1+L2 GREEN；web typecheck/build 绿（web/src 无 diff，worktree 环境性 dist 哈希漂移已还原 committed 世代）；`git diff --stat tools/mission-driver/src/engine.js` 为空（保护面不变量成立）。
- pass test 2026-08-25-205251-mission-driver basisHash=cc004e36a5debf8e1d9a5b000b8c0c013c512d2f6b300ab8454817746a14f953 exit=0

## Closure
