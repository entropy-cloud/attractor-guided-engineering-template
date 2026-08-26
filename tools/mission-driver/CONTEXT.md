# mission-driver — 项目上下文

> 让 AI 在 30 秒内了解本工具，不包含废话。


## 是什么

`tools/mission-driver/` — AI 开发循环引擎。读 `missions/<name>.json`，按 flow JSON 定义的状态机循环执行**可配置 driver 子进程**（默认 `opencode run`；`--driver pi` 切到 `pi -p`）。附监控 Dashboard（Node http + SSE + Vue 3 前端）。

**语言**: Node.js (ESM) + TypeScript (仅前端)  
**依赖**: 引擎**零 npm 依赖**（`commander` 已 vendor 内联至 `vendor/`，见 commit 0a40c5f）；前端独立 `web/package.json`，但 `web/dist/` 已提交入 git → **整体 clone 即跑，消费者零 install / 零 build**  
**位置**: 本工具位于项目仓库的 `tools/mission-driver/` 子目录，所有路径以此为基准。运行命令从仓库根目录执行。


## 目录结构

```
tools/mission-driver/
├── src/
│   ├── main.js            # CLI 壳：commander 解析 + process 生命周期（信号/monitor/reconcile）；编排逻辑在 orchestrator.js
│   ├── orchestrator.js    # 程序化编排入口：bootstrap/orchestrateRun/draft 管线/orchestrateAnalyze（CLI 与插件宿主共用，M1-WI2）
│   ├── exit-map.js        # 引擎终态 → 进程退出码表（EXECUTION-PRINCIPLE §11 逐行钉住，M1-WI2）
│   ├── step-executor.js   # StepExecutor 命名 seam + ProcessExecutor（M1-WI1）
│   ├── config.js          # 配置解析（CLI/env/mission.json → 运行参数）
│   ├── engine.js          # 状态机核心，最复杂的文件
│   ├── executor.js        # 步骤执行：spawn opencode 子进程，心跳/超时/SIGTERM
│   ├── runner.js          # opencode 进程管理 + sessionId 提取
│   ├── monitor.js         # HTTP/SSE server（纯 Node http 模块）+ REST + SSE 端点
│   ├── mission-check.mjs  # mission 校验 + extends 合并（base.json → base.local.json → mission）
│   ├── flow-loader.js     # flow JSON 加载 + plans 扫描 + 表达式函数注册
│   ├── expression.mjs     # 轻量表达式引擎（when 条件 / forEach 源）
│   └── platform.mjs       # 平台兼容层（Windows/macOS/Linux）
├── flows/                 # 流程定义 JSON
│   ├── mission-driver.json    # 主流程: CHECK → REVIEW → EXEC → DRAFT → DEEP_AUDIT
│   ├── plan-execution.json    # 子流程: EXECUTE → CLOSURE_SCRIPT → CLOSURE_AUDIT → BUILD_VERIFY
│   └── deep-audit-loop.json   # 审计子流程
├── prompts/               # AI 指令模板（{{var}} 替换）
├── web/                   # Vue 3 前端（Naive UI + TypeScript + Vite）
├── memory/                # Reflexion 自记忆（--analyze-run 生成）
├── test/                  # 后端测试（node --test）
└── design/                # 引擎设计文档
```

> Mission 配置放在项目根的 `{projectRoot}/missions/`，不在 tools/ 下。


## Mission 配置系统

**文件位置**: `{projectRoot}/missions/`（不在 tools/ 下）

**优先级**: `CLI --model/--parse-model/--driver` > `MISSION_DRIVER_EXEC`/`MISSION_DRIVER_ARGS`/`MISSION_PROMPT_MODE` env > `mission.json` 自有字段 > `base.local.json` > `base.json`

**driver 可选 `opencode`（默认）/ `pi`**（pi-driver 支持）：`driver=="pi"` 时 config.js 自动套用 pi 默认 `driverArgs`（`-p --model {model} --append-system-prompt @{agentFile} --tools read,write,edit,bash,grep,find,ls`）+ `promptMode:"stdin"` + 计算字段 `agentFile`（引擎相对绝对路径 `<engine>/agents/build.pi.md`，消费端经 `import.meta.url` 定位）。`runner.js` 对非 opencode driver 抑制 `--pure`/`--variant`/`--dangerously-skip-permissions`，且 `findLatestSessionId` 对 pi 跳过 `opencode session list`。详见 `README.md` §Driver selection、`docs/architecture/mission-driver-baseline.md` §Driver selection。pi 已知限制：无 session 连续性（每 step 起 fresh pi，靠 prompt 从磁盘恢复状态）。

**base.json**（进 git）— 全仓库 mission 共享默认值，任何模块可通过 `extends: "base"` 继承:
```
model, parseModel, agent, maxCycles, planGuide, auditsDir, contextDir, moduleDir, commands, commitFormat
```

**base.local.json**（不进 git，`missions/.gitignore` 已配置）— 个人覆盖:
```
sourcePaths（依赖模块源码路径，不同同事路径不同）
```

`mission-check.mjs` 中的 `resolveExtends` 实现浅合并链。`validateMission` 仅校验 `name/roadmapPath/plansDir/commands.test`——缺失 `roadmapPath` 的文件（如 base 配置）被 monitor.js 的 `GET /api/configs` 自动过滤。

**可选 mission 字段 `promptsDir`**（mdr-fix-2）：mission 可独立覆盖整套 prompt。Prompt 解析优先级链（高→低）：`mission.promptsDir` → `missions/prompts/`（全仓库共享覆盖）→ 内置 `TOOL_ROOT/prompts/`（`flow-loader.js loadPrompt` 兜底）。主流程（`createMissionDriverFlow`）与子流程（`loadSubFlow`）均读 `config.missionPromptsDir`（`config.js` 解析为绝对路径或空串），未设置时行为与旧版完全一致。`promptsDir` 为可选字段（不在 `REQUIRED_FIELDS`），但若设置则由 `mission-check.mjs` 校验路径存在（typo fail-fast，同 `moduleDir`/`contextDir`）。

**CHECK 为可配置确定性状态门**（mdr-fix-3）：主流程 entry `CHECK`（`prompts/health-check.md`）按 `commands.check`（base.json 默认 `""` = 未配置）决定行为——配置时运行 `{{checkCmd}}`，失败且可自动修复则诊断+修复+重跑并 emit `needs_fix`（engine 经 `needs_fix → {retry:"CHECK",maxRetries:2}` 重试，耗尽则 `onMaxRetries:{done:"failed"}` 终止），不可修复或 `commands.test` 类问题 emit `fail`（`fail → {done:"failed"}` 终态，无重试）；未配置时回退 git 冲突标记检测（clean/dirty → `pass`，未解决冲突标记 → `fail`）。`needs_fix` 是新增 transition key（非 markerAlias），与 OPT-4 既有契约兼容——未配置 mission 的 `fail`/`onError`/`onMaxRetries` 仍一次性终止（`check-lightweight.test.js` 守护，无 repair death-loop）。CHECK 不跑 `commands.test`（那是 BUILD_VERIFY 的职责）。`checkCmd` 经 `main.js delegates.vars` 注入，已在 `context-map.mjs` VAR_PROVENANCE/EXPECTED_VARS 登记（drift gate）。


**frontmatter 账本库**（age-autonomy M1-WI1/WI2）：`src/ledger-frontmatter.mjs`——零 import 纯函数模块（`parseFrontmatter`/`validatePlanFrontmatter`/`validateRoadmapFrontmatter` + 字段表常量，契约 `docs/design/age-autonomy/01-file-ledger.md` §2/§3.1/§4.1）；插件形态经 `plugin/dsh/scripts/build-bundle.mjs` ALLOWED_MODULES 的 engine→assets 复制通道共享（模块进入 import 闭包后副本自动物化）。校验器经 `planLedgerState` 读 seam 接线全部生产读面（fieldErrors/fieldsValid 随 frontmatter 读透传——plan-check exit 1 / flow-loader 扫描 warn / monitor API 暴露 / roadmap-check `parseRoadmapMarkdown` 判定点，M2-WI42）；`verify: []` 被校验器拒绝且派生面按 no-verify-keys 处理（fail-closed 不回落 mission 默认，M2-WI44）。

**账本区块/派生库**（age-autonomy M1-WI3/WI5/WI6）：`src/ledger-sections.mjs`——计数域扫描（plan Phase/Closure Findings 区块 + roadmap Work Item 块，仅列 0 checkbox，代码围栏跳过）+ 内联审计区结构校验（dispatch/accepted/pass/评审结论行语法、尾部锚定 id 解析、`findings=none|items` 词法、append-only 已知前缀严格/未知行容忍）+ `computeBasisHash`/`deriveCompleted`（§5.2 五合取完成公式，reasons 逐项可解释）+ 扫描谓词族 `draftPlans/activePlans/heldPlans/closedPlans/openPlans/awaitingClosure`（可注入 `defaultVerifyKeys`）；契约 `docs/design/age-autonomy/01-file-ledger.md` §3.2/§3.3/§4.2/§4.4/§5.2，build-bundle 同通道登记（0635-3 接线前 unreachable-allowed 属预期）。**closureScriptCheck 回执感知路由**（age-autonomy M2-WI41）：frontmatter 全勾 plan 缺回执/缺 `## Verification` pass 行/basisHash stale（`deriveCompleted` 不成立）→ fail 路由 CLOSURE_AUDIT（derived.reasons 逐条进 `SCRIPT_CHECK_DETAILS`），引擎读面（flow-loader 谓词族 + closureScriptCheck + plan-check CLI）注入 mission 默认 verify 键 `["test"]`（`plan-check.mjs missionDefaultVerifyKeys` 单一实现；`inspectPlan` 增量输出 `derivedCompleted`/`completionReasons`/`verifyKeys`/`verifyKeysSource`）。

**法律内核**（age-autonomy M2-WI12/WI13，plan `docs/plans/age-autonomy/2026-08-25-0815-1`）：`src/law-core.mjs`——proposedAction 契约（七 type 枚举 + baseHash CAS 尽力比对 + actor 缺省结构子集）+ 规则注册表（rule id → 纯函数）+ `evaluateGates`（policy gates 按 match 域分派，observe/enforce 姿态，per-rule fail-open）+ 种子规则 `plan-structure`（写入后仍是合法 plan 账本；legacy 格式域外放行）；`src/law-policy.mjs`——受限 YAML 子集解析 + `missions/autonomy.policy.yml` schema 校验（version/limits/gates/triggers/agents/dispatch、fixedPrefix 块、agent 名交叉校验、trigger 谓词受限语法）。落点裁定 = 引擎侧零 npm 模块（0635-1 共享库裁定沿用到 law），可达链 config.js→law-policy→law-core（autonomyPolicy fail-fast 加载），build-bundle 登记；插件宿主适配层 `plugin/dsh/src/law/host-adapter.ts`（actor 解析 + 观察 JSONL + pre-execute 注册，observe-only）；纯校验 CLI `src/gate-check.mjs`（`--policy` 校验 / 单文件结构面，非 bundle 面）。mission 字段 `autonomyPolicy` 可选、设置即经 mission-check 校验存在。

**三硬门规则**（age-autonomy M2-WI14/WI15/WI16，plan `docs/plans/age-autonomy/2026-08-25-0815-2`）：`src/law-rules.mjs`（经 law-policy side-effect import 注册进内核 registry——三消费面同源可达）——① `closure-audit-binding`（plan `## Closure`）+ `roadmap-audit-binding`（roadmap `## Deep Audit Record`，accepted 必带 `findings=none|items`）：回执区行语法 + dispatch/accepted 同 id 配对（accepted 无同 id dispatch = 伪造回执 deny；dispatch 无 accepted = 中间态放行）+ accepted 写者 == dispatch 行 auditorSessionId + dispatch 写者角色白名单（engine/supervisor；id-only 过渡期注记）；dispatch 行 `models={exec:…,aud:…}` lineage 后缀显式解析（畸形 deny）；② `writer-identity`：01 §5.1 逐边表执法（draft→active 需配对评审回执 + 写者 = reviewerSessionId；held→active 同写重置 failures/移除 hold；非法边/终态复活 deny）+ 执行者永禁写 status（role + claim holder 双面）+ 评审租约（未闭环 dispatch review 期间第三者 deny）；③ `plan-completed`：全勾过渡三岔（回执齐 → deriveCompleted 公式校验；无回执 → 有效 claim 持有者放行入 awaitingClosure 且同写清除 claim，无/过期/错主 deny；审计拒绝 = Closure Findings 追加未勾项自然脱离全勾）+ 终态冻结（completed 派生或可写终态后 basis 域不可变）。三规则 `mode: enforce` 注册（02 §6 例外授权：P0/M1 收口后硬门直接 enforce）；`law-policy.mjs` 另有 `checkDistinctModelSatisfiability`（requireDistinctModel 静态可满足性 + `downgrade: single-model` 显式降级通道；运行时派发校验归 M3/WI26）。真值表 `plugin/dsh/test/law-truth-table.test.mjs`。

**配套门禁 + 机械验证 runner**（age-autonomy M2-WI17/WI18/WI19/WI20，plan `docs/plans/age-autonomy/2026-08-25-0815-3`）：同模块 `law-rules.mjs` 四规则 + 零引擎 diff runner——`nothing-claim-guard`（02 §4.4 动作面：`action:terminal-claim` 记录 `kind: nothing-to-draft` 时 `draftPlans()>0 ∨ activePlans()>0` → deny；否则 allow 携带 Deep Audit 触发信号 `trigger: {dispatch, when}`——M3/WI26 守夜人消费，谓词经 `ctx.plans` 注入）；`claim-validity`（02 §4.5 五面：claim 写者角色白名单 engine/supervisor + 写入 TTL 合法形状 / 勾选 holder 匹配 ∧ 未过期（ctx.now 注入时钟）/ claim action 单活 / 全勾无回执必清 claim / active 外禁携 claim；DSH id-only actor = unverified-writer 注记，role-bearing deny 面随 M3）；`verify-keys`（02 §5 命令来源纪律：plan `verify` ⊆ mission `commands.*` 非空 key，Proof 文本永非命令源；ctx.commands 缺失 fail-open 注记）；`audit-rounds-overflow`（02 §4.6 预算闸：roadmap DAR 新 dispatch 行时 `audit-rounds ≥ maxAuditRounds` → deny，max 双源 = `law-policy.mjs` `resolveMaxAuditRounds`（policy limits 权威 / mission flow 回退 / 双缺 0=无审计概念任何新轮 deny））；`record-append-only`（02 §4.8 直接 enforce：plan `## Draft Review Record`/`## Verification`/`## Closure` + roadmap `## Deep Audit Record` 整区前缀保持——prose 亦不可删改，仅容尾部追加与行尾空白/尾部空行清理，删/改/换序/整区删除 deny 指出首个违例行）。四规则注册即 enforce（姿态裁定 = deny 面窄域可判定 + M2 无 observe 消费回路，成文于 plan Phase 1 Decision + policy 注释）。**commands runner** `src/verify-runner.mjs`（M3 守夜人消费面，build-bundle 预登记 unreachable-allowed）：`resolveVerifyPlan`（verify 缺省 → mission 默认 test/build/lint/typecheck 交集）+ `runVerifyCommands`（spawn commands.*、cwd=projectRoot、每命令 10min 超时 SIGTERM→SIGKILL、输出截尾 4000 字符）产出每 key `{exitCode, passLine}`（01 §4.2 语法，basisHash=computeBasisHash 与完成公式同源绑定）；M2 消费面 = `gate-check.mjs <plan.md> --verify`（owning mission 祖先走查 plansDir 判属 + verify-keys gate + runner，stdout JSON、不写 plan 文件——写盘归守夜人/BUILD_VERIFY）。DSH 适配层 ctx 增注 `commands`/`maxAuditRounds`（verify-keys 与预算闸的执法输入）。真值表 88 例（WI24 ≥30 已超额推进）。

**路径与结构护栏 + 执法层自护 P8**（age-autonomy M2-WI21，plan `docs/plans/age-autonomy/2026-08-25-0950-1`）：`law-core.mjs` 增 work-item 复合标签语法（`M<n>-WI<a>(+WI<b>)*`，裸 token 继承首 token 里程碑、显式前缀 = 等价展开）+ 注册谓词 `workItemRegistered`（(milestone, id) 二元组对 `scanRoadmapLedger` 注册表逐 token 对账，空注册表 fail 不空过；接进 plan-structure 增项：语法面从 label 单独可判定即 deny，注册面需 `ctx.roadmapText` 注入，缺省 = 不可观测注记（02 §2））；`law-rules.mjs` 增三规则——`path-guardrail`（plan 形 .md = frontmatter 三键齐备 `status`+`mission`+`work-item`；合法域 = `ctx.plansRoots` 被动扫描并集（各祖先默认 `docs/plans` + missions/*.json plansDir，malformed 零根——承袭已退役 plan-status-gate `knownPlansRootsAt` 先例）；域外 deny 列注册根集；新建/改写同拦；根缺省 fail-open）；`roadmap-write-guard`（self-domain = `ctx.roadmapPath`：允许 = 已注册 WI 行勾选翻转（仅 `[ ]→[x]`）+ 行内尾部证据注记追加；WI 行增删/换序/改 id 与 milestone 标题增删改 deny，例外 = actor role ∈ {engine, supervisor}（deep-audit findings 落 WI 的引擎路径；id-only 面 role 例外退化为 deny reason 内 unverified-writer 注记）∨ 已批准立项（`activePlanReferencing`：active plan 正文含 roadmap 路径字符串，reason 记命中 plan 与行））；`law-self-protection`（P8 唯一无条件对抗级：保护路径集 = `plugin/dsh/src/law/**` + `missions/autonomy.policy.yml` + `src/{plan-check,gate-check}.mjs`（按 `ctx.projectRoot` 解析，`isLawProtectedPath` 导出）；例外集 = 02 §4.7 字面三支——human role / CI（部署面承载，不经 pre-execute）/ 已批准立项（`engine` 不在例外集）；plan corpus 未注入 fail-closed deny；规则的第一个合法消费者 = 它自己的宿主 plan（active 引用））。`mission-check.mjs` 增 `checkRoadmapUniqueness`（one-mission-one-roadmap：roadmapPath 跨 mission 唯一反向对应，冲突 = 加载错误结构化报错；CLI + DSH 适配层 `loadLawContextAt` 双接线，冲突祖先贡献零 law 上下文）。policy schema 增 `{{projectRoot}}` 占位符（match/resolve 双面）；`missions/autonomy.policy.yml` 注册全部门（plan-structure 切 **enforce**——0815-1 注释预留的收紧开关兑现）+ 7 新 gate 条目全 enforce（P8 observe 爬坡 = 漏洞窗口，直接 enforce 成文）。DSH 适配层 ctx 增注 `projectRoot`/`plansRoots`/`roadmapText`（每次新鲜读）/`plans`（保护路径时读 governing mission plansDir 语料）；gate-check CLI 单文件面输出 `workItem` 对账明细 + 同 ctx 注入。真值表 107 例（WI24 ≥30 超额推进）。

**证据面重建：plan-status-gate 退役 + legacy 审计通道退役 + duplicate-anchor 结构 error**（age-autonomy M2-WI22，plan `docs/plans/age-autonomy/2026-08-25-0950-2`）：① `plugin/dsh/src/plan-status-gate.ts`（M3-WI13 的 run-state 证据门禁）整体退役——保护语义收编为 law 内核规则 `legacy-plan-freeze`（`law-rules.mjs`：plan 域 .md 写入携带/改写/删除 legacy 终态行（`> Plan Status: completed|cancelled|superseded|deferred`）→ deny，matcher 复用共享 `PLAN_STATUS_RE` + `normalizeLegacyStatus` 零第二实现，例外 = P8 字面三支，roots 缺省 fail-open / 语料缺省 fail-closed；policy 第 18 条 gate enforce），run-state 证据面（F1/F2/F3）废弃——plan frontmatter/closures 是唯一完成证据面（01 §5.2），pre-execute 挂载收敛为 law 适配层单监听器；`service.ts`/`host-adapter.ts`/`dsh-plugin-packaging.md` 同步。② 引擎 legacy 外部审计通道退役：`flow-loader.js` 删 `AUDIT_STATUS_RE`/`_scanOpenAuditsList`/`_isMissionLevelAudit`/表达式注册表 `openAudits` 键（开放审计态唯一面 = roadmap `## Deep Audit Record` dispatch/accepted 配对，M1-WI8）；`flows/deep-audit-loop.json` 删 `CHECK_OPEN_AUDITS`/`SCAN_NEW_RESULTS` 两节点（entry 直连 `MULTI_AUDIT`，`OPEN_AUDIT` otherwise/transitions/onError 三处改终态 `done: completed`——when 缺省 = 步执行语义下与零开放记录行为逐分支等价），`prompts/draft-from-audit.md` 删除；engine.js 零 diff（optional-chained 消费面 null-safe 退化为 `[]`）；退役前置 = docs/audits 开放状态清点（2026-08-26 复核 6 命中/1 open/5 planned 与基线对账零漂移，唯一 open 记录机械关闭 + Disposition 注记）。③ duplicate-append-only-anchor 结构 error（deep-audit round-1 P2 清偿）：`scanPlanLedger`/`scanRoadmapLedger` 对重复 `## Closure`/`## Verification`/`## Draft Review Record`/`## Deep Audit Record` 锚点报 `duplicate-anchor` error 进 scan.errors（首锚定语义保留），deny 面（plan-structure）/读面（inspectPlan）均可见；存量 corpus 零误伤断言钉住。守护测试：`audit-convergence.test.js` 重写为通道退役守护（含无悬空引用 walk——`loadFlowFile` 无 step 引用校验，防加载绿运行期 `unknown_step`）。

## Monitor Dashboard 前端

**技术栈**: Vue 3 + Naive UI 2 + TypeScript + Vite + xterm.js + Pinia（资源监控用 Naive UI 表格，ECharts 已移除）

**路由**: `/` → RunList, `/runs/:runId` → RunDetail

**API 端点**（monitor.js 提供）:
- `GET /api/runs` — 最近 run 列表
- `GET /api/runs/:id` — run 详情 + events + stepLogs
- `GET /api/runs/:id/logs/:step` — 日志 tail
- `GET /api/runs/:id/sysmon` — 系统资源快照
- `GET /api/configs` — Mission 配置列表（跳过无 roadmapPath 的 base 文件）
- `GET /api/configs/:name/roadmap` — 解析 roadmap markdown
- `GET /api/configs/:name/plans` — Plans 列表
- `GET /api/configs/base` — 合并后的 base.json + base.local.json
- `GET /api/runs/:id/events` — SSE 实时事件流

**关键 UI 交互**:
- Mission Config: n-card（可折叠，默认收起，标题右侧 ChevronDown/Up 切换）
- Log Viewer: xterm.js 终端，文件名点击 → Blob URL 新标签页打开完整日志
- Log Viewer 图标: ArrowDownOutline/PauseOutline/ChevronDownOutline/ChevronUpOutline（Ionicons 5）
- Resource View: Naive UI 表格，最近 8 条 sysmon 快照（Time / Free Mem GB / Opencode RSS GB / Opencode / Node / Pressure）+ Active Processes 表（ECharts 已移除）
- Base Config: 任意页面右上角 ⚙ 齿轮按钮 → Modal（n-code JSON 高亮）
- NFR-3: xterm 按 RunDetail 路由懒加载；naive-ui 按需导入（`unplugin-vue-components` + `NaiveUiResolver`，无全局 `app.use(naive)`，Vite tree-shake 掉 Calendar/DatePicker/Transfer 等未用组件）；ECharts 已移除。首屏 JS gzip ≈198KB（由旧单一入口 409KB 降约一半）
- WI5: `GET /api/runs/:id` 返回的 `run` 含 `auditRound` / `maxAuditRounds`（旧 run-state.json `?? 0` 兜底）；RunDetail 顶部展示 'Deep Audit: N / M'（仅当 `maxAuditRounds > 0`；额度用完 tag→success，进行中→info）。RunList 与 AppHeader 的 `statusTagType` 同步把 `single_step_done` 识别为 success（与 `main.js` exitMap 的 exit code 0 对齐）。


## 构建与验证

```bash
# 后端测试（同时跑 prompt-check.mjs 结构性校验，任一失败即整体失败）
npm --prefix tools/mission-driver test

# 前端构建
npm --prefix tools/mission-driver/web run build

# Mission 校验
node tools/mission-driver/src/mission-check.mjs missions/<name>.json .

# 启动 mission（从项目根）
./tools/mission-driver.sh <mission-name>

# dry-run
node tools/mission-driver/src/main.js <mission-name> --step CHECK --dry-run --no-monitor
```


## 关键约束

- 引擎核心 **零 npm 依赖**（`commander` 已 vendor 至 `vendor/commander/`；monitor.js 仅用 Node 内置 `http`/`fs`/`path`/`url`）
- 前端 **零构建步骤**于运行时（Vite 构建产物 `web/dist/` **已提交入 git**，由 monitor 静态托管；新鲜度由 `.github/workflows/web-dist-check.yml` + `pnpm check:dist` 守卫）
- `memory/_index.md` 为 always-load 核心（`_` 前缀此处为例外，非生成文件）
- `extends` 为浅合并——嵌套对象（如 `commands`）整体替换，非深度合并
- Windows 环境：Git Bash 启动脚本
- 监控端口默认 9300，冲突时自动 +1 重试
- draft-robustness WI5（mdr-remediate-4 后扩展到非-forEach 分支）：subflow step 的 `subflowRuns` 在 `_executeSubflowStep` 中，无论 forEach 还是单子流程，都在子流程开始前写入 `status: "running"` placeholder（`_wfAppendSubflowRun`，镜像 `_onAgentStepUpdate` 模式但额外匹配 `visits` 以避免 re-entry 串味），forEach 每项完成后增量追加、子流程结束后由 `_wfClose` 用终态覆盖 placeholder，父进程中途被杀时 run-state 仍反映"在跑"或已完成项（不依赖 monitor fallback 扫描磁盘 `run-state-<stepName>-<visits>-<i>.json` 文件）。`_wfClose` 仍是最终真相（forEach 结束时 sort + 覆盖 placeholder）。与 step-audit mission 的 WI5（auditRound / maxAuditRounds 计数，见上方 Monitor Dashboard 段）同名但分属不同 mission。


## 故障排查

- `TROUBLESHOOTING.md` — 卡住时的诊断手册
- orphan 清理: `node tools/mission-driver/src/reap-orphans.mjs --startup _tmp <PID>`
- **并行安全**: 支持 N 个 mission-driver 并行（同项目 / 跨项目）。startup reaper（`reap-orphans.mjs`）按 run 维度判孤儿——spawn 的 opencode 带 `[MISSION_DRIVER:<runId>]` 标记，reaper 查全局 active-run 登记（`~/.mission-driver/active/`）+ `isAliveAndOurs` 判活，**永不误杀活跃的并行 run**；只回收"拥有进程已确证死亡"的崩溃 run 残留。无法证明死亡时一律 spare（保守）。
- Monitor 独立模式: `node tools/mission-driver/src/main.js --monitor`


## 文档入口

| 文档 | 路径 |
|------|------|
| 引擎设计 | `tools/mission-driver/design/mission-design.md` |
| 流程设计 | `tools/mission-driver/design/mission-driver-flow-design.md` |
| 执行原则 | `tools/mission-driver/EXECUTION-PRINCIPLE.md` |
| plan 编写指南 | `docs/plans/00-plan-authoring-and-execution-guide.md` |
