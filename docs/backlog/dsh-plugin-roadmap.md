# DSH Plugin (AGE Mission Control) Roadmap

> Last Updated: 2026-08-23 (M1 WI1–WI5 全部 `done`；M2 WI6–WI10 全部 `done`——**P2 里程碑收口**：WI6 plugin/dsh 脚手架〔plan `2026-08-23-1447-1`〕、WI7 NativeExecutor 派发链〔plan `2026-08-23-1447-2`〕、WI8 L2 双后端矩阵〔plan `2026-08-23-1447-3`〕、WI9 L3 宿主集成骨架〔plan `2026-08-23-1621-1`〕、WI10 mdcontrol.run 异步契约 + native e2e〔plan `2026-08-23-1621-2`，e2e 证据 `docs/testing/2026/08-23.md`〕；**M3-WI11 `done`**〔plan `2026-08-23-1852-1`——onboarding 双形式对齐 + 描述符注册 + monitor step-log 修复收编，P3 首片〕；**M3-WI12 `done`**〔plan `2026-08-23-1852-2`——mdcontrol.draft/analyze 路由收编〔WI10 §Deferred 闭环〕+ Mission Control 三技能接线，e2e 证据 `docs/testing/2026/08-23.md`，P3 次片〕；**M3-WI13 `done`**〔plan `2026-08-23-1852-3`——tools/pre-execute plan-status 完成守门：matcher `PLAN_STATUS_RE` + 裁定证据规则三 allow face + `verify:e2e:gate` 真实宿主工具管线门 + 23 用例真值表（引擎生成 fixtures），零引擎 diff——**P3 里程碑收口**，剩 M4〕)
> Source: `docs/design/dsh-plugin-integration.md`, `docs/architecture/dsh-plugin-packaging.md`, `docs/analysis/2026-08-22-0001-dsh-host-api-contract-verification.md` (R1), `-0002-npm-version-surface.md` (R2), `-0003-verification-harness-design.md` (R3)

## Purpose

Drive the implementation of the AGE Mission Control DSH plugin: package mission-driver as a bundle plugin and add a native in-process agent-dispatch execution backend, per the architecture doc. This file owns the what and the order; the cited owner docs own the how.

## Work Item Status

> **This is the only dynamic status block. Update status here only.**
> Status lives on **work items**, never on milestones. AI takes the first `todo` work item in order. See `docs/backlog/00-roadmap-authoring-guide.md`.

### M1 — Engine StepExecutor Seam（零 DSH 依赖，纯本地可验证）

- WI1 抽取 StepExecutor 接口于 delegates 注入点(runAgent/runParseAgent/runTool),ProcessExecutor 包装现有 runner+executor,行为逐字节不变: `done`（plan `docs/plans/dsh-plugin/2026-08-23-1300-1-stepexecutor-seam-process-executor.md` 已执行完毕，证据见该 plan 与 `docs/logs/2026/08-23.md`）
- WI2 从 main.js 抽取程序化编排入口(run/draft/analyze 共享),EXIT_MAP 提升至引擎核心模块(由 test/exit-map.test.js 钉住): `done`（plan `docs/plans/dsh-plugin/2026-08-23-1300-2-programmatic-entry-exitmap-hoist.md` 已执行完毕，证据见该 plan 与 `docs/logs/2026/08-23.md`）
- WI3 driver 白名单校验(opencode|pi|cline|native;CLI 拒绝 native): `done`（plan `docs/plans/dsh-plugin/2026-08-23-1300-3-driver-whitelist-embed-gating-p1-doc-sync.md` 已执行完毕，证据见该 plan 与 `docs/logs/2026/08-23.md`）
- WI4 启动诊断 embed 门控(active-run 注册/sys-snapshot/reapStartupOrphans 在 native 模式关闭): `done`（plan 同 WI3）
- WI5 文档同步:module-boundaries.md "in-process: not exported" 边界修订 + baseline §Driver selection/§Public Exports 更新: `done`（切片随 plan 1/2 落地，收口在 plan 同 WI3 Phase 3；packaging doc P1 交付核对同步完成）

### M2 — 插件壳与原生派发后端

- WI6 plugin/dsh 脚手架:DshBundleManifest 清单(`dsh.bundle.patch`)+ cordis.patch.yml(isolate realm 挂载)+ 构建打包(按 R1 核实的导入图捆绑引擎纯模块): `done`（plan `docs/plans/dsh-plugin/2026-08-23-1447-1-plugin-shell-bundle-scaffold.md` 已执行完毕——manifest/patch 结构校验 + 构建闭包断言（负例自证）+ 无宿主 import 冒烟 + 插件测试入口落地；钉版经 P2 复查无漂移（`docs/analysis/2026-08-23-0001-p2-version-survey.md`）；真实宿主挂载冒烟归 WI9/L3；证据见该 plan 与 `docs/logs/2026/08-23.md`）
- WI7 NativeExecutor:agents.create/resume + followup + whenIdle() 等待 + cancel→dispose 序列(handle 存活期 = 整个 run,步骤间复用,R1-A2): `done`（plan `docs/plans/dsh-plugin/2026-08-23-1447-2-native-executor-dispatch-factory.md` 已执行完毕——`plugin/dsh/src/native-executor.ts` 完整派发链/watchdog/exit 合成/插件层最小 tool spawn + `engine-bridge.ts` 选择工厂与 native config 接线；单测 20 用例（fake agents service + orchestrateRun 全链回调冒烟）全绿、引擎 653/653 零回归、CLI 行为零变化；实现边界（model+parseModel gap/日志内容形状/不静默回退）记 packaging doc §Implementation state and boundaries；真实宿主归 WI9、native 端到端归 WI10；证据见该 plan 与 `docs/logs/2026/08-23.md`）
- WI8 L2 契约测试:双后端行为矩阵(marker 分类/修正重试预算/run-state 形状/EXIT_MAP 映射/flow 预算)——见 R3 §3: `done`（plan `docs/plans/dsh-plugin/2026-08-23-1447-3-l2-backend-parity-matrix.md` 已执行完毕——共享参数化 spec（`plugin/dsh/test/backend-parity-matrix.test.mjs` + `helpers/matrix-harness.mjs`）对 ProcessExecutor（fake runner 注入，tool 步真 executor.js spawn）与 NativeExecutor（fake in-process agents service）各跑一遍，R3 §3 六组断言 22 用例全绿；分歧台账 3 条全部 owner-doc 背书（tool timeout 漂移〔1447-2 Decision 3 残险闭环〕/sessionId 值语义〔R3 §3〕/产物内容形状〔packaging doc〕）；fake-agents service 矩阵化扩展（rejectIdle 剧本 + 全序 trace，1447-2 单测零回归）；CI merge-blocking 接线 = 根级 `verify-age.sh` 聚合门禁（L1+L2 全绿过门）+ `.github/workflows/age-ci.yml`；R3 §2 补 seam 勘误注记（`__setRunnerFactoryForTest` 为 draft 管线 seam，mission run 真注入点 = `orchestrateRun({config, executor})`）+ 实现落点引用；packaging doc §Execution Backend Seam 三条契约保全规则标注"由 L2 矩阵钉住"；证据见该 plan 与 `docs/logs/2026/08-23.md`）
- WI9 L3 SDK 集成骨架 host-harness.mjs(先解 R3 §6 未决项:sdk server 的宿主启动组合): `done`（plan `docs/plans/dsh-plugin/2026-08-23-1621-1-l3-host-harness-sdk-server.md` 已执行完毕——R3 §6 宿主启动组合收口（Decision 1a：demo bin `dsh-jsonrpc-agent` + 自有 fixture `test/fixtures/harness.cordis.yml`〔非 PTY 官方全量组合基座〕+ 16 包 exact `0.1.1-rc.2` pinned devDeps，shipped `dependencies` 零变化，survey addendum 落档）；R3 §4 双注记（收割面勘误：root-session 最后提交 assistant 文本 + `turn/end` 为门禁面，`subagent.finished` 降条件性观察；run-state 断言归属 L4/WI10）+ §2/§5 实现落点注记；`scripts/host-harness.mjs`（手写 `HarnessLineRpcTransport` + 会话驱动 + 四场景 runner + `--dry`/`--keyless`）+ 12 用例 fake-stream 传输单测进插件 CI 链（58/58）+ `verify:native` env 门禁（缺开关 skip exit 0 / 缺凭据 fail-fast exit 1 / 永不 CI-blocking，`./verify-age.sh` 无 env 仍绿）+ keyless 双连跑 4/4 全绿记录 `docs/testing/2026/08-23.md`（1447-3 deferred 台账处置 = 无分歧维持闭合）；真实凭据腿命令已接线待人工 env；证据见该 plan 与 `docs/logs/2026/08-23.md`）
- WI10 mdcontrol.run 异步作业契约:启动即返回 {runId, status},引擎作为 detached 宿主任务继续;完成可选 followup 回执(先例 draft-job.mjs);native 形式端到端跑通 demo mission,run-state 形状与 CLI 一致: `done`（plan `docs/plans/dsh-plugin/2026-08-23-1621-2-mdcontrol-run-async-contract-e2e.md` 已执行完毕——`mdcontrol.run/status/list` 路由层 + 异步契约〔`beginNativeMission` detached in-host 任务〕+ 插件层 active-run 守卫〔1447-1 裁定收编，台账闭环〕+ opt-in 终态回执〔第六宿主调用 `agents.get`，宿主源码核实 + packaging doc 六调用清单增补〕；单测域 17 用例（fake HostContext/agents 路由直调）插件链 75/75；L4 双腿 e2e = CLI 腿（真实引擎子进程 + PATH 前置 opencode stub）+ native 腿（进程内真实 cordis 运行时 `boot()` + 路由直调）三连跑全绿——归一化 run-state 形状 diff 空、双腿每 AI 步 marker 合法、一次人为 marker 破坏 correction-retry 恢复；门禁 `npm run verify:e2e`（显式本地、scripted stub 模型、不接 CI）；monitor 渲染核对发现 step-log 端点 `oc-` 前缀边界〔`docs/bugs/2026-08-23-monitor-native-log-naming.md`，非 P2 阻塞〕；证据见该 plan 与 `docs/testing/2026/08-23.md`）

### M3 — 对齐、技能与门禁强化

- WI11 onboarding mission 双形式对齐(L4 冒烟 diff);subagent 描述符注册(先补读 packages/subagent 内部契约): `done`（plan `docs/plans/dsh-plugin/2026-08-23-1852-1-onboarding-parity-subagent-descriptors.md` 执行完毕——① monitor step-log `oc-` 前缀引擎侧修复收编〔三站点双 label：listStepLogs/handleGetLog/handleGetNodeDetail——第三站点 :929 为 draft review it2 新发现，超出 bug 文档原枚举；引擎 656/656 + verify-age.sh exit 0 + e2e REST 观测〕，bug `docs/bugs/2026-08-23-monitor-native-log-naming.md` closed + 1447-3 deferred 台账 reopen 闭环；② 描述符注册〔host 源码补读 descriptor.ts/descriptor-seed.ts/list-children.ts；`agents.create` seed 注入 durable `subagent/descriptor`：mode continuable / provider `mdcontrol` / label `Mission: <mission>`；单测 15/15 + 插件链 76/76〕；③ onboarding 双形式对齐〔扩展 `verify:e2e`：install-shape fixture 复刻 + 有界 3 回合剧本 + 归一化 diff 空 + marker 对真实 flow 合法 + 描述符健康断言 + monitor 四 run 机器断言，三连跑全绿，证据 `docs/testing/2026/08-23.md` WI11 note——机制面断言，verification scope limited 显式标注〕）
- WI12 Mission Control skills(mission-control-run/draft/analyze)接线到路由: `done`（plan `docs/plans/dsh-plugin/2026-08-23-1852-2-mdcontrol-draft-analyze-routes-skills-wiring.md` 执行完毕——① **完成前置兑现**：`mdcontrol.draft`/`mdcontrol.analyze` 路由随本 plan 收编〔WI10 plan §Deferred 裁定归属闭环〕：draft = 异步作业契约（立即 `{jobId,status:'started'}` + 引擎 draft-state.json 词汇复用 + 与 run 共享 active-run 守卫槽〔draft↔run 互斥裁定〕+ 引擎自有 validateDraftDesc fail-fast + 经**红线预授权窄口** `cmdDraftMission` executor seam〔本 plan 唯一引擎 diff，orchestrator.js + 4 单测，CLI 逐字节不变〕native 两段生成；analyze = 同步单轮 postmortem（插件层直调 `runPostmortem` + 薄适配 runner，零引擎 diff；目标解析复用 list disk 扫描三态；不占守卫）；② 三技能注册 `ctx.skills` runtime 行 ×3（纯指令体 → `mdcontrol.*` 路由 HTTP 调用文档；`ctx.inject(['skills'])` 反应式挂载，headless 降级同 webServer 姿态）+ 单测 6 用例（注册形状/接线双层钉法/dispose/降级）；③ e2e 扩展三腿（skills 注册面 `ctx.skills.list()` 三名在列 + analyze 显式/最新双腿 tag 透传解析 + draft 两段终态 completed/briefGate/missionName 解析；agent-spine skills.enabled，DSH_HOME hermetic，**零新增 devDeps**——skill 包为 spine 传递依赖，钉版触发条件不成立），三连跑全绿，证据 `docs/testing/2026/08-23.md` WI12 note；引擎 660/660 + 插件 93/93 + verify-age.sh exit 0 + CLI 冒烟零回归；真模型自然语言技能调用 = env 人工腿（plan §Deferred watch-only residual 立案）
- WI13 tools/pre-execute 强化门:plan-status → completed 编辑在 run-state 无已闭合 CLOSURE_AUDIT 访问时 deny(R1 §2 deny 契约): `done`（plan `docs/plans/dsh-plugin/2026-08-23-1852-3-pre-execute-plan-status-gate.md` 执行完毕，Phase 1-3 全过 + 收口——① 四项 Decision 落定〔D1 接线面：plain 插件 ctx 收全宿主工具调用，matcher 锚定 bundle 内 `PLAN_STATUS_RE`，工具面 write/edit/str_replace_editor + 路径域已知 plans root 防误杀 + create-with-completed 纳入；D2 证据规则：F1 in-flight subflow 子文件〔init 期 forEachItem+running 持久化，不做 pid 复核——陈旧 running = 记录在案漏杀面〕∨ F2 CLOSURE_AUDIT closed visit ∨ F3 BUILD_VERIFY/子文件 completed 快速路径，deny iff 证据面存在且无 face，mission-level running 面与 deep-audit-loop 面否决；D3 无 run-state 案例 = allow + 观察 log（AGENTS.md solo fallback 合法化，零误杀 Goal）；D4 dsh-tools type-only 消费、dsh-goal 维持保留〕；② `plugin/dsh/src/plan-status-gate.ts` + `service.ts` 挂载 + `test/plan-status-gate.test.mjs` **23 用例**〔fixtures 由真实引擎 `_initWorkflow`/`_wfClose`/`_finalizeWorkflow` 生成——fixture 真实性守则兑现；含 symlink 别名双形归一化（macOS `/var` vs `/private/var` 执行中发现）〕；③ in-process e2e `verify:e2e:gate`〔真实宿主工具管线 `ctx.tools.execute`：deny write+edit / allow F1+D3，真实 agent 骑乘调用满足 fs-observation-policy 观察所有权，三连跑全绿，证据 `docs/testing/2026/08-23.md`〕；**零引擎 diff 实测**、插件链 116/116、verify-age.sh exit 0。**与 roadmap 字面规则的差异及理由**：字面 "无已闭合 CLOSURE_AUDIT 访问即 deny" 经 3 轮 draft review 核实会误杀引擎自身 in-run 编辑〔execute.md step 4a 早于一切后置证据面〕与 BUILD_VERIFY 快速路径收口——落地语义为 plan Phase 1 D2 裁定的三 allow face 证据规则（CLOSURE_AUDIT closed visit 保留为 F2，快速路径与 in-flight 面为必要扩充），owner doc §Service Surface 已回写 as-built 语义）

### M4 — AGE Preset 与面板决策

- WI14 AGE preset 组合(mode 提示词 + 路由注入)与 isolate realm 冲突检查(参照 anchored-standard 装载器,host loader 待读): `todo`
- WI15 状态面板决策:RPC 直读 vs 复用 monitor,产出实现或明确延期记录: `todo`

## Status Values

| Status | Meaning |
| --- | --- |
| `todo` | Not started |
| `ready` | Draft-reviewed, queued for implementation |
| `done` | Completed and passed closure audit |

## Dependencies & Notes

- M1 无外部依赖,可在 CI 全绿交付;M2 起 `@deepseek-ai/*` 钉 next cohort 0.1.1-rc.2(R2),升版为独立 changelog 事件。
- L3/L4 需要模型凭据与网络:本地脚本门禁(`npm run verify:native`,env 显式开启),不作 CI 阻塞(R3 §5)。
- 每 WI 触发 planning rules 时按 `docs/plans/00-plan-authoring-and-execution-guide.md` 建 plan;WI 完成即回写本文件。
