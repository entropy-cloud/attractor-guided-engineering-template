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

**法律内核**（age-autonomy M2-WI12/WI13，plan `docs/plans/age-autonomy/2026-08-25-0815-1`）：`src/law-core.mjs`——proposedAction 契约（七 type 枚举 + baseHash CAS 尽力比对 + actor 缺省结构子集）+ 规则注册表（rule id → 纯函数）+ `evaluateGates`（policy gates 按 match 域分派，observe/enforce 姿态，per-rule fail-open）+ 种子规则 `plan-structure`（写入后仍是合法 plan 账本；legacy 格式域外放行）；`src/law-policy.mjs`——受限 YAML 子集解析 + `missions/autonomy.policy.yml` schema 校验（version/limits/gates/triggers/agents/dispatch、fixedPrefix 块、agent 名交叉校验、trigger 谓词受限语法）。落点裁定 = 引擎侧零 npm 模块（0635-1 共享库裁定沿用到 law），可达链 config.js→law-policy→law-core（autonomyPolicy fail-fast 加载），build-bundle 登记；插件宿主适配层 `plugin/dsh/src/law/host-adapter.ts`（actor 解析 + 观察 JSONL + pre-execute 注册，observe-only）；纯校验 CLI `src/gate-check.mjs`（`--policy` 校验 / 单文件结构面 / `--verify` 机械验证执行面 / `--law` 全量 policy 执法面（M3-WI31，plan `2026-08-27-0433-1`：`discoverOwningMission` → mission `autonomyPolicy`（回退 `missions/autonomy.policy.yml` 发现）→ `evaluateGates` 跑真实 policy 全量 gates，stdout JSON 附 `deriveCompleted` 派生视图 + workItem 对账 + plan 队列谓词，exit 0 iff 全部 enforce gate allow），非 bundle 面）。mission 字段 `autonomyPolicy` 可选、设置即经 mission-check 校验存在。

**三硬门规则**（age-autonomy M2-WI14/WI15/WI16，plan `docs/plans/age-autonomy/2026-08-25-0815-2`）：`src/law-rules.mjs`（经 law-policy side-effect import 注册进内核 registry——三消费面同源可达）——① `closure-audit-binding`（plan `## Closure`）+ `roadmap-audit-binding`（roadmap `## Deep Audit Record`，accepted 必带 `findings=none|items`）：回执区行语法 + dispatch/accepted 同 id 配对（accepted 无同 id dispatch = 伪造回执 deny；dispatch 无 accepted = 中间态放行）+ accepted 写者 == dispatch 行 auditorSessionId + dispatch 写者角色白名单（engine/supervisor；id-only 过渡期注记）；dispatch 行 `models={exec:…,aud:…}` lineage 后缀显式解析（畸形 deny）；② `writer-identity`：01 §5.1 逐边表执法（draft→active 需配对评审回执 + 写者 = reviewerSessionId；held→active 同写重置 failures/移除 hold；非法边/终态复活 deny）+ 执行者永禁写 status（role + claim holder 双面）+ 评审租约（未闭环 dispatch review 期间第三者 deny）；③ `plan-completed`：全勾过渡三岔（回执齐 → deriveCompleted 公式校验；无回执 → 有效 claim 持有者放行入 awaitingClosure 且同写清除 claim，无/过期/错主 deny；审计拒绝 = Closure Findings 追加未勾项自然脱离全勾）+ 终态冻结（completed 派生或可写终态后 basis 域不可变）。三规则 `mode: enforce` 注册（02 §6 例外授权：P0/M1 收口后硬门直接 enforce）；`law-policy.mjs` 另有 `checkDistinctModelSatisfiability`（requireDistinctModel 静态可满足性 + `downgrade: single-model` 显式降级通道；运行时派发校验归 M3/WI26）。真值表 `plugin/dsh/test/law-truth-table.test.mjs`。

**配套门禁 + 机械验证 runner**（age-autonomy M2-WI17/WI18/WI19/WI20，plan `docs/plans/age-autonomy/2026-08-25-0815-3`）：同模块 `law-rules.mjs` 四规则 + 零引擎 diff runner——`nothing-claim-guard`（02 §4.4 动作面：`action:terminal-claim` 记录 `kind: nothing-to-draft` 时 `draftPlans()>0 ∨ activePlans()>0` → deny；否则 allow 携带 Deep Audit 触发信号 `trigger: {dispatch, when}`——M3/WI26 守夜人消费，谓词经 `ctx.plans` 注入）；`claim-validity`（02 §4.5 五面：claim 写者角色白名单 engine/supervisor + 写入 TTL 合法形状 / 勾选 holder 匹配 ∧ 未过期（ctx.now 注入时钟）/ claim action 单活 / 全勾无回执必清 claim / active 外禁携 claim；DSH id-only actor = unverified-writer 注记，role-bearing deny 面随 M3）；`verify-keys`（02 §5 命令来源纪律：plan `verify` ⊆ mission `commands.*` 非空 key，Proof 文本永非命令源；ctx.commands 缺失 fail-open 注记）；`audit-rounds-overflow`（02 §4.6 预算闸：roadmap DAR 新 dispatch 行时 `audit-rounds ≥ maxAuditRounds` → deny，max 双源 = `law-policy.mjs` `resolveMaxAuditRounds`（policy limits 权威 / mission flow 回退 / 双缺 0=无审计概念任何新轮 deny））；`record-append-only`（02 §4.8 直接 enforce：plan `## Draft Review Record`/`## Verification`/`## Closure` + roadmap `## Deep Audit Record` 整区前缀保持——prose 亦不可删改，仅容尾部追加与行尾空白/尾部空行清理，删/改/换序/整区删除 deny 指出首个违例行）。四规则注册即 enforce（姿态裁定 = deny 面窄域可判定 + M2 无 observe 消费回路，成文于 plan Phase 1 Decision + policy 注释）。**commands runner** `src/verify-runner.mjs`（M3 守夜人消费面，build-bundle 预登记 unreachable-allowed）：`resolveVerifyPlan`（verify 缺省 → mission 默认 test/build/lint/typecheck 交集）+ `runVerifyCommands`（spawn commands.*、cwd=projectRoot、每命令 10min 超时 SIGTERM→SIGKILL、输出截尾 4000 字符）产出每 key `{exitCode, passLine}`（01 §4.2 语法，basisHash=computeBasisHash 与完成公式同源绑定）；M2 消费面 = `gate-check.mjs <plan.md> --verify`（owning mission 祖先走查 plansDir 判属 + verify-keys gate + runner，stdout JSON、不写 plan 文件——写盘归守夜人/BUILD_VERIFY）。DSH 适配层 ctx 增注 `commands`/`maxAuditRounds`（verify-keys 与预算闸的执法输入）。真值表 88 例（WI24 ≥30 已超额推进）。

**路径与结构护栏 + 执法层自护 P8**（age-autonomy M2-WI21，plan `docs/plans/age-autonomy/2026-08-25-0950-1`）：`law-core.mjs` 增 work-item 复合标签语法（`M<n>-WI<a>(+WI<b>)*`，裸 token 继承首 token 里程碑、显式前缀 = 等价展开）+ 注册谓词 `workItemRegistered`（(milestone, id) 二元组对 `scanRoadmapLedger` 注册表逐 token 对账，空注册表 fail 不空过；接进 plan-structure 增项：语法面从 label 单独可判定即 deny，注册面需 `ctx.roadmapText` 注入，缺省 = 不可观测注记（02 §2））；`law-rules.mjs` 增三规则——`path-guardrail`（plan 形 .md = frontmatter 三键齐备 `status`+`mission`+`work-item`；合法域 = `ctx.plansRoots` 被动扫描并集（各祖先默认 `docs/plans` + missions/*.json plansDir，malformed 零根——承袭已退役 plan-status-gate `knownPlansRootsAt` 先例）；域外 deny 列注册根集；新建/改写同拦；根缺省 fail-open）；`roadmap-write-guard`（self-domain = `ctx.roadmapPath`：允许 = 已注册 WI 行勾选翻转（仅 `[ ]→[x]`）+ 行内尾部证据注记追加；WI 行增删/换序/改 id 与 milestone 标题增删改 deny，例外 = actor role ∈ {engine, supervisor}（deep-audit findings 落 WI 的引擎路径；id-only 面 role 例外退化为 deny reason 内 unverified-writer 注记）∨ 已批准立项（`activePlanReferencing`：active plan 正文含 roadmap 路径字符串，reason 记命中 plan 与行））；`law-self-protection`（P8 唯一无条件对抗级：保护路径集 = `plugin/dsh/src/law/**` + `missions/autonomy.policy.yml` + `src/{plan-check,gate-check}.mjs`（按 `ctx.projectRoot` 解析，`isLawProtectedPath` 导出）；例外集 = 02 §4.7 字面三支——human role / CI（部署面承载，不经 pre-execute）/ 已批准立项（`engine` 不在例外集）；plan corpus 未注入 fail-closed deny；规则的第一个合法消费者 = 它自己的宿主 plan（active 引用））。`mission-check.mjs` 增 `checkRoadmapUniqueness`（one-mission-one-roadmap：roadmapPath 跨 mission 唯一反向对应，冲突 = 加载错误结构化报错；CLI + DSH 适配层 `loadLawContextAt` 双接线，冲突祖先贡献零 law 上下文）。policy schema 增 `{{projectRoot}}` 占位符（match/resolve 双面）；`missions/autonomy.policy.yml` 注册全部门（plan-structure 切 **enforce**——0815-1 注释预留的收紧开关兑现）+ 7 新 gate 条目全 enforce（P8 observe 爬坡 = 漏洞窗口，直接 enforce 成文）。DSH 适配层 ctx 增注 `projectRoot`/`plansRoots`/`roadmapText`（每次新鲜读）/`plans`（保护路径时读 governing mission plansDir 语料）；gate-check CLI 单文件面输出 `workItem` 对账明细 + 同 ctx 注入。真值表 107 例（WI24 ≥30 超额推进）。

**证据面重建：plan-status-gate 退役 + legacy 审计通道退役 + duplicate-anchor 结构 error**（age-autonomy M2-WI22，plan `docs/plans/age-autonomy/2026-08-25-0950-2`）：① `plugin/dsh/src/plan-status-gate.ts`（M3-WI13 的 run-state 证据门禁）整体退役——保护语义收编为 law 内核规则 `legacy-plan-freeze`（`law-rules.mjs`：plan 域 .md 写入携带/改写/删除 legacy 终态行（`> Plan Status: completed|cancelled|superseded|deferred`）→ deny，matcher 复用共享 `PLAN_STATUS_RE` + `normalizeLegacyStatus` 零第二实现，例外 = P8 字面三支，roots 缺省 fail-open / 语料缺省 fail-closed；policy 第 18 条 gate enforce），run-state 证据面（F1/F2/F3）废弃——plan frontmatter/closures 是唯一完成证据面（01 §5.2），pre-execute 挂载收敛为 law 适配层单监听器；`service.ts`/`host-adapter.ts`/`dsh-plugin-packaging.md` 同步。② 引擎 legacy 外部审计通道退役：`flow-loader.js` 删 `AUDIT_STATUS_RE`/`_scanOpenAuditsList`/`_isMissionLevelAudit`/表达式注册表 `openAudits` 键（开放审计态唯一面 = roadmap `## Deep Audit Record` dispatch/accepted 配对，M1-WI8）；`flows/deep-audit-loop.json` 删 `CHECK_OPEN_AUDITS`/`SCAN_NEW_RESULTS` 两节点（entry 直连 `MULTI_AUDIT`，`OPEN_AUDIT` otherwise/transitions/onError 三处改终态 `done: completed`——when 缺省 = 步执行语义下与零开放记录行为逐分支等价），`prompts/draft-from-audit.md` 删除；engine.js 零 diff（optional-chained 消费面 null-safe 退化为 `[]`）；退役前置 = docs/audits 开放状态清点（2026-08-26 复核 6 命中/1 open/5 planned 与基线对账零漂移，唯一 open 记录机械关闭 + Disposition 注记）。③ duplicate-append-only-anchor 结构 error（deep-audit round-1 P2 清偿）：`scanPlanLedger`/`scanRoadmapLedger` 对重复 `## Closure`/`## Verification`/`## Draft Review Record`/`## Deep Audit Record` 锚点报 `duplicate-anchor` error 进 scan.errors（首锚定语义保留），deny 面（plan-structure）/读面（inspectPlan）均可见；存量 corpus 零误伤断言钉住。守护测试：`audit-convergence.test.js` 重写为通道退役守护（含无悬空引用 walk——`loadFlowFile` 无 step 引用校验，防加载绿运行期 `unknown_step`）。

**守夜人 seam**（age-autonomy M3-WI25，plan `docs/plans/age-autonomy/2026-08-26-1411-1`）：`plugin/dsh/src/supervisor/`（五文件模块）——服务形态裁定 = DSH 插件内**第二个 cordis service publication**（`SupervisorService` 名 `mdsupervisor`，同 bundle/同 isolate realm，零宿主面新增；独立 CLI 形态仅文档 seam 归 M5 前）；**Q4 写回路由裁定 = ③ 守夜人唯一机器字段写者串行落盘**（02 §4.5 三选一终审收口：写前 baseHash CAS（computeBasisHash 同源）+ tmp+rename 原子替换 + 写前 law 自检同一 `evaluateGates` 纯函数（actor role=supervisor）双面——AI 工具面执法不变；0815-3「claim 过渡期 prompt 供给可绕」残项随之收口）。五职责 seam：① decision-core（`decision-core.ts`）纯函数契约 `decide(snapshot, policy, clock) → decisions[]`（decisions = dispatch | meter-write | receipt | no-op × posture observe|execute；snapshot = 谓词族经 assets 通道复用 + 过期 claim/roadmap 计数面；**1411-2 trigger 求值与 1411-3 终态求值接入点成文于模块头注**，SustainDuty/TriggerDuty/TerminalDuty 声明接口）；② 看门循环（`watchdog.ts`）心跳沿（默认 30s；cordis 4.0.1 core 无 timer face 且零新依赖 → Node interval + ctx.effect 生命周期）+ 事件沿（fs.watch 防抖，失败降级心跳）+ onTerminal 回执链 seam + 单飞守卫 + start() 恢复扫描（restart seam，完整语义 WI29）；③ meter 写者（`writer.ts`）claim/claim-expires/failures/audit-rounds 四写函数（CAS 受限重试 + deny 不落盘+回执；claim-validity/writer-identity **零规则改动**对接——executor role deny 用例钉住 role-bearing 面激活）；④ receipt（`receipt.ts`）钉 `_tmp/supervisor-receipts.jsonl` append-only JSONL + 尽力投递（A8 死会话容忍）+ `mdcontrol.status` 透出（既有 route 扩展零新 route）；⑤ 默认姿态 = **dispatch 决策恒 no-op 观察**（1411-2 接线前存量宿主零无人值守推进；无 `supervisor.projectRoot` 配置 = idle 降级）。测试 `plugin/dsh/test/supervisor-core.test.mjs` 23 例。

**守夜人 trigger 执行 + 派发面**（age-autonomy M3-WI26，plan `docs/plans/age-autonomy/2026-08-26-1411-2`）：`plugin/dsh/src/supervisor/` 增三文件——**求值器**（`trigger-eval.ts` 纯函数：policy `triggers:` 段 × snapshot × clock → 命中决策；14 谓词全实现（per-plan 域 plan.full-tick/plan.status/mechanical-verification-missing·pass/closure-receipt-missing/review-dispatch-missing/claim-expired × mission 域 draftPlans()/activePlans()/heldPlans()/roadmap.unchecked/all-done/deep-audit.accepted-findings/terminal-claim——后者读 `_tmp/<runDir>/terminal-claim.json` 动作记录面）；fail-soft（非数比较/畸形值 = errors[] 进决策不崩溃）；命中携带 occurrenceKey 材料 `<subject>#<type>@<hash8>`（03 §5 账本派生）；terminal 出口仅产决策对象转发 1411-3）；**派发解析链**（`dispatch-resolve.ts`：dispatch 类型 → policy `dispatch:` 映射 → 具名 agent → 绑定；plan frontmatter `agent:` 覆盖路由三态（合法名 override/缺失 default/未定义名 default+注记）；DSH 形态三字段 `agentProvider/agentModel/reasoningEffort`（**native-executor ModelSelection documented gap 收口**：config `nativeModelSelection` → agentOptions + `installModelSelection` 装载）；独立形态 `independentChannelOf` 纯解析 seam（config.js model 通道，provider=driver 凭据 env、reasoningEffort 无载体注记，CLI runner 不交付）；requireDistinctModel 运行时三态强制（满足/拒绝/`downgrade: single-model` 诚实降级 + `models=` lineage）——比对共用 `law-policy.mjs` 抽出的 `sameModelPair` 纯函数（静态面同源零第二实现）；幂等面 `dispatchAlreadyRegistered` 重扫账本作答（review/audit=dispatch 行、deep-audit=DAR unpaired 在飞、draft-plans=回执 JSONL 登记））；**执行臂**（`exec-arm.ts` 一 hit 一出口：mechanical-verification = verify-runner 直跑（`resolveVerifyPlan`+`runVerifyCommands`）→ 全绿 writer 写 `## Verification` pass 行 → 链式 closure-audit 派发（**双驱动幂等**：谓词面读账本，引擎 BUILD_VERIFY 已写 pass 行则 trigger 不触发）；nothing→deep-audit = 预算预检 + DAR dispatch 行与 audit-rounds 自增同写 + terminal-claim 记录消费；reclaim-claim = writer 清/换发 claim + execute 重派（完整恢复语义归 WI29）；**P2-1 裁定 = claim TTL 续期写账本**（`renewClaim`：临近过期 + holder 活动信号（watchdog `noteActivity` 面）→ claim-expires 顺延，bounded ≤ now+60min 单次窗口；仅观察日志会使合法执行中途被判过期回收——TTL 语义需可执法；残险 = 伪造活动无限续期 → bounded + WI30 停滞指纹双兜底成文接受））。`decide()` 接线：policyFace 带 `triggers:` 段 → triggerDuty（execute posture）经 watchdog 路由执行臂（fail-soft）；无 triggers 段保持 WI25 观察姿态（存量宿主零变化）。`prompts/draft-from-roadmap.md` step 4 重写：起草者保持 draft、不自派评审不自行置 active（Follow-up P2 收口——评审独立性回到流程结构）。测试 `supervisor-trigger.test.mjs` 43 例（七 trigger 正反 + e2e 全链 echo fixture）+ `supervisor-dispatch.test.mjs` 22 例。

**守夜人终态规则 + failures 归因桶**（age-autonomy M3-WI27，plan `docs/plans/age-autonomy/2026-08-26-1411-3`）：`plugin/dsh/src/supervisor/` 增两文件——**R1–R4 终态求值核心**（`terminal-rules.ts` 纯函数 `evaluateTermination(snapshot, {maxAuditRounds, maxFailures, stagnation?}) → {decision: completed|partial|blocked|continue, rule, reasons[]}`：03 §8 字面顺序 R1→R4 序贯求值首条命中即决（顺序是成文契约）；R1 三岔（全 done ∧ open==0 → completed / 未勾 → partial——不得静默记 completed / active 带未过期 claim → continue 不提前杀活）；partial/blocked 显式区分（blocked = R3∧held>0 ∨ R4 停滞 / partial = R1 未全 done ∨ R3∧held==0；叠加取 blocked；R1∧held>0 刻意取 partial——预算耗尽主导因）；复合声明值 `partial/blocked` 归一单点在核心（policy 声明面不动，core continue 恒压声明）；R4 = stagnation {rounds, threshold} 注入接口（检测本体 WI30）；**两入口同一实现**：看门循环周期末端求值 + policy terminal trigger 声明面（exec-arm `forwardTerminalDecision` 重扫快照经同一核心，非第二实现）；终态落点 = run-terminal 回执（含理由，A8 尽力投递 + onTerminal 链）+ `mdcontrol.status` 透出（`statusFace().terminal`）+ **循环停派**（该 mission run 的 execute-posture 命中抑制——mount 内粘滞、跨重启重扫描幂等重评零新 store；非账本写入、零引擎面））；**failures 归因 + 熔断**（`failures.ts`：02 §4.6 三桶 `executor-error`/`verification-red`/`claim-expired-no-output` 各计一次（不计 = CAS 冲突/观察记录/幂等跳过——防计数噪音）；`recordPlanFailure` 经 1411-1 writer 写 plan frontmatter failures，exec-arm 三失败点接线（verify 红跑/reclaim 清除成功/派发失败）；`applyCircuitBreaker`：failures ≥ maxFailures → writer `holdPlan` 同写 status:held+hold+failures+清除 claim（claim-validity ⑤ 对接、writer-identity T5 零改动），单 held 不阻塞其他 plan，全 held 经 Phase 1 求值核心终态化 R3 blocked；watchdog 周期后置面 = 熔断 → 重扫 → R1–R4 求值）。**maxFailures 双源**（终审 P2-3 收口）：`law-policy.mjs` `resolveMaxFailures`（policy limits 权威 / `flows/mission-driver.json` 顶层 `maxFailures: 3` 回退键（镜像 maxAuditRounds :7 先例、引擎惰性）/ 双缺默认 3）；host-adapter `MissionLawContext.maxFailures` + `SupervisorPolicyFace.maxFailures` 透传；policy 头注 schema-reserved 句兑现。R1 与 audit-rounds-overflow 互补（门禁拒新审计派发 + 守夜人收口，一个预算）。测试 `supervisor-terminal.test.mjs` 22 例 + `supervisor-failures.test.mjs` 9 例。

**守夜人连续模式 opt-in**（age-autonomy M3-WI28，plan `docs/plans/age-autonomy/2026-08-26-1954-1`）：03 §4 连续模式执行面落地——**roadmap 即队列**（零新队列 store；队列 = roadmap todo + trigger 派发既有面）。① **opt-in 门（行为收紧）**：per-root 内存标志默认 **off**（`watchdog.ts` `continuous` 构造选项 / `setContinuous`/`isContinuous` face / `statusFace().continuous` 透出；重启即清——ActiveRunGuard 先例；headless 经 bundle config `supervisor.continuous: true` 预启用 = 等价显式声明）；门 = `decision-core.ts` `applyContinuousGate`——off 时 dispatch 型 execute-posture 决策降级观察回执（WI25 姿态），meter-write（claim 回收/计量）与 receipt（终态报告）决策不受门；**存量宿主（policy 带 `triggers:` 段即 execute 的 1411-2 现状）收紧为需显式开启**——mount log BEHAVIOR TIGHTENING 句钉住可发现性。② **队列链式沿**（03 §3 边 2）：`emitTerminalEvent` 末端 continuous on 时触发一次立即再评估周期（单飞守卫复用；mission 终态停派优先级保持；心跳沿兜底；exec-arm 幂等面承载双触发）。③ **第六路由 `mdcontrol.continuous`**：`{ projectRoot, enabled?, followup? }` toggle/查询 → `{ enabled, posture: observe|execute, mounted }`；未挂载 toggle = bad-request；`ContinuousControlFace` hook 由 `mountSupervisor` 返回面接线。④ **第七路由 `mdcontrol.unlock`**：held plan 人工处置——`unlock`（held→active：writer `unlockPlan` 同写 failures=0+移除 hold，writer-identity T6 形状零规则改动）与 `dispose`（held→cancelled|superseded|deferred 终态 disposition，writer `disposePlan`；01 §5.1 supervisor 合法边）；经守夜人 writer（写前 law 自检 role=supervisor + CAS + 原子落盘）执行，deny 结构化透出；plan 状态非 held / 域外参数 / 域外路径 = bad-request。⑤ **终态回执接线**：continuous 开启会话（route followup）登记为 run-terminal 回执投递目标（`watchdog.setReceiptTarget`，A8 尽力投递既有，死会话容忍）。e2e：`pnpm --prefix plugin/dsh run verify:e2e:continuous`（缺宿主 env fail-fast exit ≠ 0，CI opt-in 不阻塞——WI31 门铺垫；真实宿主下三连跑：off 观察 → on 队列推进 → 终态回执+停派）。测试 `supervisor-continuous.test.mjs` 15 例。

**守夜人崩溃恢复扫描**（age-autonomy M3-WI29，plan `docs/plans/age-autonomy/2026-08-26-1954-2`）：03 §6 恢复扫描执行化——`plugin/dsh/src/supervisor/recovery.ts`（watchdog start() 首周期 trigger='recovery' 前置运行；不受 continuous 门——崩溃收尾非新无人值守推进；mission 终态停派优先）。**恢复处置表**：plan 带 claim（TTL 未到期不动/已过期走既有 reclaim trigger——每周期求值已覆盖恢复周期，非重实现）/ dispatch 无结论（本 plan resume-or-redispatch）/ awaitingClosure（1411-2 既有 trigger 面）；引擎侧 run-state 孤儿归 `reap-orphans.mjs` 零引擎 diff。**resume-or-redispatch**：dispatch 行结论缺失 × agents face 会话存活——活 → 原会话 followup 注入（零新行）；死 → 同 occurrence 写新 dispatch 行（新 nonce8 id，旧行 append-only 保留）+ exec-arm 同一建会话链；无 agents face（headless）= stale 判定不可判 → 观察回执不动作（显式降级）；per-mount handled 集 = 重复恢复周期零重复动作。**最新行作答（幂等面 × 评审租约单一语义面）**：`dispatch-resolve.ts` `dispatchAlreadyRegistered` 同 occurrence 多行时最末行作答（deep-audit：最末行 paired → 开放下一轮，stale 行不占位）；`law-rules.mjs` writer-identity 租约持有者 = 最末 unpaired dispatch review 行 sessionId（superseded 行不持约、最末行配对即关——redispatch 后 plan 写面不锁死）。**deep-audit 同 occurrence 重派零自增**（01 §3.1）：恢复重派复用已付轮次号、跳过 audit-rounds 自增与预算预检重入；`audit-rounds-overflow` 门禁同轮次重派豁免（轮次号 ∈ 现 unpaired 在飞集 → 不耗预算不 deny——耗尽预算后死会话在飞仍可重派，防「永不重派」死锁）。**不计 failures**：恢复 redispatch 不进三桶（02 §4.6 不计清单第四行）。测试 `plugin/dsh/test/supervisor-recovery.test.mjs` 9 例 + 真值表 116（租约最新行 +2 / 门禁豁免 +1）。

**守夜人停滞指纹 + 往返检测**（age-autonomy M3-WI30，plan `docs/plans/age-autonomy/2026-08-26-1954-3`）：03 §7 卡死检测执行化——`plugin/dsh/src/supervisor/stagnation.ts` 纯函数检测器（可注入 clock 与 activity map，确定性可测）。**停滞指纹**：per-cycle 指纹 = 排序后 (planPath → basisHash) 行 + roadmap 全文 hash 聚合（computeBasisHash 完成公式同源；指纹域 = basisHash 域——DRR/Verification/Closure 追加在域外，dispatch/pass 行不重置指纹）；一轮停滞 = 指纹不变 ∧ 活动窗口（默认 = 一个心跳周期）内 noteActivity 零命中——**活动信号必须参与**（有活动轮清零重积，长任务未落盘不误判）。**往返检测**：per-plan 状态连续交替翻转计数，两态间 ≥ K 完整往返（2K 翻转）无终态进展 → 饱和注入 `{rounds: threshold, threshold}` → 同一 R4 出口（03 §7「停滞检测收口」单出口；第三态破对重计/终态 disposition 重置）。**双入口同注入**（1411-3 契约）：检测器输出为 watchdog 持有单点——周期末端求值与 exec-arm `forwardTerminalDecision` 声明面（`ExecArmOptions.stagnationFact` 回调）同读同一状态，零单周期分歧。**N/K 配置**：policy limits 单键 `stagnationRounds`（`law-policy.mjs` `resolveStagnationRounds` 双源：policy 权威 / `flows/mission-driver.json` 顶层回退键 / 双缺默认 10 = 30s 心跳 × 10 ≈ 5 分钟墙钟；0 = 检测器 off）；K = `max(2, floor(N/5))` 完整往返同键派生（无第二配置键）。承载 = 内存 scratch（03 §6 归零成文接受——重启重积保守向）；命中首跳 `stagnation-detected` 观察回执，终态沿 1411-3 既有 setTerminal 回执链。测试 `plugin/dsh/test/supervisor-recovery.test.mjs` 扩至 18 例（+9：指纹域钉住 / N-1·N 边界 e2e / 活动参与 / 往返 unit+e2e / 重启清零 / 双入口交叉 / partial/blocked 区分恢复语境变体 / 双源矩阵 + schema）。

**效率层 agent 池**（age-autonomy M4-WI32，plan `docs/plans/age-autonomy/2026-08-27-0433-2`）：04 §2 池化执行化——新目录 `plugin/dsh/src/efficiency/`（`agent-pool.ts`，效率层首件；plugin src .ts 模块无 ALLOWED_MODULES 登记面——该通道仅管 engine→assets 复制）。**角色池**：`drafter:{projectRoot}` 长期复用 + `reviewer:{groupId}` 同批复用（组 = 复用最大粒度，跨组必新启杜绝跨批次判断污染；组作用域 `groupScopeOf` = plan frontmatter `group:` → 文件名时间戳前缀回退 → 裸 stem 兜底）；成员 = continuable 子代理句柄（经 agents face），create-on-first-use + followup 续用 + 空闲 TTL dispose（可注入 timers + watchdog stop() 幂等 teardown → ctx.effect 生命周期，心跳先例）+ rotateEvery 计数轮换。**代际令牌**（04 §2.3）：每次派发持 attemptId；`attemptStale` 单一判据面供 WI29 恢复扫描消费——同代（当前成员）→ 续用/resume，跨代（轮换/TTL 摘除/显式 revoke）→ 重派 + 成员摘除（活会话陈旧 attempt 也不 resume）。**独立性红线**（04 §2.4 P7 + 终审 P2-5）：closure-audit/deep-audit（multi-audit = 其 prompt 文件面）**结构性禁入池**——无视 agent `mode` 配置池层硬拒 + 诚实注记（反向用例钉住：auditor 声明 pooled 也恒 fresh）；角色互斥 = session-role 登记表（同一 continuable 子代理不得同时为 drafter 与 reviewer/auditor，冲突派发拒绝）+ 同 run 内 auditor session ≠ 任何执行者 session（执行者集 = plans claim holders（账本 frontmatter 派生，runId 锚定剥离）∪ 池 executor 标签；审计派发时校验候选 session）。**接线**：池挂点在 `exec-arm.ts` `createDispatchAgent` 内部（recovery redispatch 直调该函数自动经池无绕过孔）；watchdog 持 mount 级池（与停滞检测器同列，stop() 幂等 dispose）+ 每周期刷新 executorSessions 透传；execute 池化声明**休眠**（WI28 裁定沿袭——plan 执行仍是引擎 run 领地，显式注记指向 M4-WI33/M5-WI37 后继，executor 标签仍登记）；`dispatch-resolve` 零改动（池在解析链下游）。live policy `reviewer` 翻 `mode: pooled`（poolKey `reviewer:{groupId}`/TTL 30/rotate 8——镜像 drafter 先例；anchoring 偏置残险由轮换阈值 + 跨组新启兜底）。内存态 = 性能缓存非状态权威（P2：丢失只损失缓存命中，重启清空成文）。测试 `plugin/dsh/test/pool-lifecycle.test.mjs` 13 例（WI36 门 ≥10 下限：生命周期/组作用域/TTL/轮换/代际/审计禁入×2/executor 休眠/角色互斥/auditor≠executor/恢复同代·跨代/池复用×评审租约/headless 降级）。
**效率层 PromptAssembler 双模式组装**（age-autonomy M4-WI33，plan `docs/plans/age-autonomy/2026-08-27-0433-3`）：04 §3 组装纪律执行化——`plugin/dsh/src/efficiency/prompt-assembler.ts` 纯函数模块（可注入 AssemblerIo 文件面，确定性可测，fail-soft 缺文件显式 note 不崩溃）。**双模式**（04 §3.1）：`assemble(mode, spec, dynamicCtx, ledger, io)`——FRESH = fixedPrefix 块（text 逐字节 persona / file 盖章嵌入 / dir 目录全文排序展开）聚合 + 动态块；CONTINUE = 经 per-agent hash 台账比对的 deltaEmbed（未变文件跳过、变更文件全量重发）+ 动态块（会话历史本身即共享前缀）。**embedStamp**（04 §3.3）：默认 `<file path="{path}" hash="{hash8}">{content}</file>`、schema 可覆写模板串；`{hash8}` = sha256 前 8 hex（算法源与 `computeBasisHash` 同源，`hash8Of` 单点）；目录嵌入 maxFileBytes 逐文件上限超限显式 `[NOT EMBEDDED: …]` 注记不静默截断；hash 三用 = dedup / dispatch 时不符重发（+ 池轮换判据）/ grep 可审计。**前缀纪律**（04 §3.2）：固定字节 → 动态块（薄指针派发 prompt 即动态后缀）→ volatile 尾缀；两次 FRESH 字节恒等。**compaction 对抗**：台账 `__sends` 派发计数 + 每 8 次 CONTINUE 全 charter 周期性重发（不对抗压缩）；台账协议 = 读（assemble）/ 写（`commitToLedger` 单一写面）分离，sentHashes 无 sentinel 污染。**schema 面**：`law-policy.mjs`（tools+assets 经 build-bundle 同步）增 `assembly:` 段（embedStamp 三渲染槽校验 + continueDelta 布尔；`DEFAULT_EMBED_STAMP` 同源导出）；live policy 增 assembly 块 + drafter `fixedPrefix` charter（AGENTS.md text + project-context.md file 嵌入，P8 例外 = plan active 自指先例）。**消费接线**：池成员 per-member 台账（随成员生灭，crash 后替补首发 FRESH——保守向裁定）；`exec-arm.ts` `dispatchPromptFor` 统一四 followup 位（dispatch/draft-plans/reclaim/recovery redispatch）——fixedPrefix 声明 ∧ assembly 材料在场才组装，未声明部署薄指针 prompt 逐字节不变（向后兼容钉住）；`continueDelta: false` 钉 FRESH；**WI32 Deferred 收编** = charter hash 变化强制换池成员（04 §2.2 第二触发腿，`charterHashesDiffer` 单一实现、池层零 fs IO）；`native-executor.ts` `assemblyPrefix` config 面（镜像 nativeModelSelection 先例）：run 子代理首步 FRESH / 后续步 CONTINUE，engine prompt（promptsDir 覆盖链已解析）原样为动态后缀——policy 叠加不取代既有解析优先级（04 §7）。测试 `plugin/dsh/test/prompt-assembly.test.mjs` 16 例（WI36 门 ≥12 下限：字节序/前缀纪律/dedup/变更重发/目录全文/超限注记/台账语义/模板覆写/compaction 重发/轮换判据/fail-soft/占位解析/池双模式 e2e/向后兼容钉/continueDelta/native 双步）。Deferred：画像 top-N 取材（WI34）、独立形态 CLI（WI35）、token 收益观测（WI36 观测项）。
**效率层上下文画像**（age-autonomy M4-WI34，plan `docs/plans/age-autonomy/2026-08-27-0558-1`）：04 §4 画像执行化——`plugin/dsh/src/efficiency/context-profile.ts` 纯函数模块（可注入 io/clock，零运行时 import——与 prompt-assembler 无环）。**工件**：`docs/references/context-profile.json`（schema v1 `{version, seededFrom, updatedAt, entries:[{path,reads,lastSeenAt}]}`，项目所有进 git；**不进 `missions/`**——该目录被 mission scanner 全量 `*.json` 扫描，非 mission JSON 污染 `--list-missions` 与 monitor 配置面）；JSON 工件非 plan 形 .md = path-guardrail 域外、非 P8 保护集、非完成证据面（效率缓存 P2），写入不经 law 门禁，写盘纪律 = 防抖 + tmp+rename 原子写（writer.ts 先例 + 父目录 mkdir）。**种子化**：首启（工件不存在）由 AGENTS.md「Read This First」清单种子化——仅直接路径行入表（整行恰一路径 token，裸或单 code span），「listed in …」间接引用行跳过（间接面经该文件自身嵌入覆盖不重复入表）。**挖掘**（run 终态后统计读频表）：watchdog `emitTerminalEvent` 链尾对 run-terminal 事件触发一次挖掘（单飞守卫；fail-soft——采集/归并/写盘异常只产回执不影响终态回执与停派；`profileMining` 挂载选项注入 io/sessionEvents 供测试）；数据源三分层各有消费面——① 子代理会话事件（池成员 `sessionEvents` 句柄透出 + `memberSessionEvents()` 池面，零池语义改动；`tool/call` 事件 × read/grep/glob 类文件参数计数，事件 schema 以 live 宿主 SessionEventMap 钉住：`{turn, step, callId, name, arguments:string}`）② run-state 步骤产物（`_tmp/<runDir>/run-state.json` steps[].promptFile 文本挖路径，存在性过滤）③ Reflexion `tools/mission-driver/memory/runs.md`（同法）；缺面 fail-soft 注记非静默。**防抖**（无进展不刷）：空 tally 不写盘 ∨ top-N 集（按生效 topN 截断的 path **集**，排序后等价判定）不变不写盘——集内 rank 波动不触发（消费面只按集取材）、集进出振荡天然抑制。**schema 版本化**：未知 version = 显式注记 + 保守重建（重新种子化），不静默沿用；序列化确定性（entries 按 path 排序、字段序固定、单尾换行）——同输入字节恒等。**消费**：`law-policy.mjs` fixedPrefix 增第四 kind `profile`（`{kind: profile, ref, topN?}`，topN 正整数且仅 profile kind 合法，缺省 5；tools+assets 双副本 build-bundle 同步）+ live policy drafter 追加 profile 块（P8 例外 = plan active 先例沿袭）；`resolveAssemblyBlocks` 钉 `profileRoot`、`filesOfBlock` 读工件按 reads 降序/path 升序取 top-N 逐文件展开——复用 embedStamp/maxFileBytes/hash 台账/CONTINUE dedup 全部 file 语义；工件缺失/未知 version/无 projectRoot = 显式 note 不崩溃；角色显式 DSL 声明优先，未声明部署薄指针 prompt 逐字节不变（向后兼容钉）。**headless 降级**：无 agents face = 显式注记保留种子表不挖掘（独立形态完整面归 WI35）。测试 `plugin/dsh/test/context-profile.test.mjs` 13 例（WI36 门 ≥8 下限：种子化直接/间接行/首启/确定性序列化/schema 往返+未知版本重建/会话事件 tally/missions 零污染反向例/mergeReads+topN 序/防抖双腿/三层源归并/headless 降级/watchdog 终态沿 e2e+fail-soft/top-N 展开与角色覆盖向后兼容钉）。Deferred：独立形态挖掘采集面（headless，归 WI35）、native-executor run 子代理默认启用画像取材（重开条件：观测显示重复读取成为成本主因时经 DSL 显式启用）。
**独立形态降级 as-built 裁定**（age-autonomy M4-WI35，plan `docs/plans/age-autonomy/2026-08-27-0558-2`）：04 §6 承载裁定——独立形态（`mission-driver.sh run <mission>` 引擎后端）效率面 = ①**步内 `--session` 续用**（correction retry 与 parse 内层 run 共会话；`lastSessionId` 唯一消费面 = correction——**跨步不在库**：`engine.js` 三 `_executeAgentStep` 调用点传 `null`，每 agent step 起新会话；测试已钉住 `runner-routing`/`prompt-cmdline-limit`/`step-executor`/`transitions`/`parse-fallback`）②**引擎 prompt 前缀纪律**（11 模板审计 2026-08-27：唯一大易变负载 `{{runSkeleton}}` 位于固定指令前导之后非前置 → 零重排；钉住测试 `test/prompt-prefix-discipline.test.js`——live 渲染路径 `resolveTemplateVars` 双渲染共享固定前缀字节断言 + PAYLOAD/VOLATILE/STABLE 注册表 drift gate）；③policy `fixedPrefix`/`assembly` 组装为 DSH 形态面（池/画像挂 continuable 子代理，headless run 不经过——薄 prompt + 步内续用即 as-built 降级）；④**跨步续用未交付**（CLI 会话池与 engine threading 双备选否决：违反零引擎 diff 底线 + 改变 run 语义；归 M5-WI37 引擎退役判定门二选一裁定，04 §6 as-built 注记）。`independentChannelOf` seam 残项复核：reasoningEffort 无 config.js 载体维持 M5 independent-form gate 裁定（文字核对一致，零 seam 编辑）。

**效率层四件套完成态（M4 收口）**（age-autonomy M4-WI36，plan `docs/plans/age-autonomy/2026-08-27-0558-3`）：M4 区块 5/5 全勾——agent 池（WI32）+ PromptAssembler 双模式组装（WI33）+ 上下文画像（WI34）+ 独立形态降级 as-built（WI35）全部落地，WI36 三门实测全绿（pool-lifecycle 13/0 · prompt-assembly 16/0 · context-profile 13/0 exit 0）；FRESH vs CONTINUE token 收益观测项缺宿主 env 按括号语义如实留档（「机制落地即收口，收益待观测」，watch-only residual 归运营自然采集）。

**引擎退役判定清单（M5-WI37）**（age-autonomy，plan `docs/plans/age-autonomy/2026-08-27-1023-1`）：P4 判定门工件 `docs/design/age-autonomy/06-engine-retirement-checklist.md`（living decision-gate artifact，00 §7/§8 登记）——引擎职责覆盖矩阵 12 行（transient/循环防护/预算/熔断/reconcile/编排/draft/终态退出码/monitor/marker/L2 parity → 门禁+守夜人覆盖+证据+缺口+判定三态）+ 累积 Deferred D1–D7 裁定（跨步续用维持不交付、reasoningEffort 无载体、BUILD_VERIFY 保留、execute 腿不接线、死会话 claim 不立项、cron seam 完备、marker 删除归退役执行期）+ 总判定 = **引擎留任主后端（条件退役）** + 缺口前置清单 G1–G6；零代码变更，引擎行为零改动。

**owner-doc 一致性收口（M5-WI39）**（age-autonomy，plan `docs/plans/age-autonomy/2026-08-27-1023-3`）：design+architecture 六文档清点矩阵 42 行（rg 33 命中零遗漏；三态 closed-by-evidence 11 / still-deferred 6 / superseded 1 / 已核无需动作 24，矩阵落 `docs/logs/2026/08-27.md`）——02 §4.7 引擎侧 law 内核三模块（`src/{law-core,law-policy,law-rules}.mjs`）放置裁定 + 不入 P8 字面集理由与替代保护面成文（收口 WI21 Deferred）；06 清单 #9/G3 随 WI38 收口刷新（EXIT_MAP 现行 13 键）；baseline §Public Exports 补 EXIT_MAP M5-WI38 增量登记；05 §2.2 unlock/continuous 落地注记（`mdcontrol.stop` 仍目标形态）；00 §7 P0–P4 落地注记；零代码变更。

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

# pre-commit hook 启用（一次性本地配置，CI 不依赖 hooks——同一校验面在 verify-age.sh L2.5）
git config core.hooksPath .githooks
```

pre-commit hook（age-autonomy M2-WI23）：对暂存区 `docs/plans/**/*.md`（gate-check 结构子集，legacy 形注记跳过）、`docs/backlog/*.md`（roadmap-check 字段集）、`missions/*.json`（mission-check，无 roadmapPath 的 base 配置跳过）逐段校验；missions/ 缺失或 node 不可用语境 fail-open + 注记（模板消费者合法面，02 §6）。CI（`.github/workflows/age-ci.yml`，M2-WI23）触发路径含账本与执法数据面（`docs/plans/**`/`docs/backlog/**`/`missions/**`/`.githooks/**`）——账本类提交不绕过 CI；单 job 跑同一 `verify-age.sh`（L1+L2+L2.5，本地=CI 同构）。


## 关键约束

- 引擎核心 **零 npm 依赖**（`commander` 已 vendor 至 `vendor/commander/`；monitor.js 仅用 Node 内置 `http`/`fs`/`path`/`url`）
- 前端 **零构建步骤**于运行时（Vite 构建产物 `web/dist/` **已提交入 git**，由 monitor 静态托管；新鲜度由 `.github/workflows/web-dist-check.yml` + `pnpm check:dist` 守卫）
- `memory/_index.md` 为 always-load 核心（`_` 前缀此处为例外，非生成文件）
- `extends` 为浅合并——嵌套对象（如 `commands`）整体替换，非深度合并
- Windows 环境：Git Bash 启动脚本
- 监控端口默认 9300，冲突时自动 +1 重试
- `EXIT_MAP` 现行 **13 键**冻结契约（M5-WI38，plan `2026-08-27-1023-2`）：`partial`/`blocked` → exit 3 = 新退出码类「终态非完成、需人工处置」——词源守夜人终态（03-supervisor §8 R1–R4），引擎 `_result` 存续期不发射，入表 = 前瞻防护独立形态暴露面落入「未映射词 → exit 0」通道（03 §8 终态映射纪律的独立立项变更，与 EXECUTION-PRINCIPLE §11 逐行同步、`test/exit-map.test.js` 钉住）；`skipped`/动态 done 词仍有意不映射（Node 默认 exit 0）
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
