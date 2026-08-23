# DSH Plugin (AGE Mission Control) Roadmap

> Last Updated: 2026-08-23 (M1 WI1–WI2 → done；WI3–WI5 → ready via draft-reviewed plans under `docs/plans/dsh-plugin/2026-08-23-1300-{1,2,3}-*.md`; M2–M4 unchanged)
> Source: `docs/design/dsh-plugin-integration.md`, `docs/architecture/dsh-plugin-packaging.md`, `docs/analysis/2026-08-22-0001-dsh-host-api-contract-verification.md` (R1), `-0002-npm-version-surface.md` (R2), `-0003-verification-harness-design.md` (R3)

## Purpose

Drive the implementation of the AGE Mission Control DSH plugin: package mission-driver as a bundle plugin and add a native in-process agent-dispatch execution backend, per the architecture doc. This file owns the what and the order; the cited owner docs own the how.

## Work Item Status

> **This is the only dynamic status block. Update status here only.**
> Status lives on **work items**, never on milestones. AI takes the first `todo` work item in order. See `docs/backlog/00-roadmap-authoring-guide.md`.

### M1 — Engine StepExecutor Seam（零 DSH 依赖，纯本地可验证）

- WI1 抽取 StepExecutor 接口于 delegates 注入点(runAgent/runParseAgent/runTool),ProcessExecutor 包装现有 runner+executor,行为逐字节不变: `done`（plan `docs/plans/dsh-plugin/2026-08-23-1300-1-stepexecutor-seam-process-executor.md` 已执行完毕，证据见该 plan 与 `docs/logs/2026/08-23.md`）
- WI2 从 main.js 抽取程序化编排入口(run/draft/analyze 共享),EXIT_MAP 提升至引擎核心模块(由 test/exit-map.test.js 钉住): `done`（plan `docs/plans/dsh-plugin/2026-08-23-1300-2-programmatic-entry-exitmap-hoist.md` 已执行完毕，证据见该 plan 与 `docs/logs/2026/08-23.md`）
- WI3 driver 白名单校验(opencode|pi|cline|native;CLI 拒绝 native): `ready`（plan `docs/plans/dsh-plugin/2026-08-23-1300-3-driver-whitelist-embed-gating-p1-doc-sync.md`）
- WI4 启动诊断 embed 门控(active-run 注册/sys-snapshot/reapStartupOrphans 在 native 模式关闭): `ready`（plan 同 WI3）
- WI5 文档同步:module-boundaries.md "in-process: not exported" 边界修订 + baseline §Driver selection/§Public Exports 更新: `ready`（切片随 plan 1/2 落地，收口在 plan 同 WI3 Phase 3）

### M2 — 插件壳与原生派发后端

- WI6 plugin/dsh 脚手架:DshBundleManifest 清单(`dsh.bundle.patch`)+ cordis.patch.yml(isolate realm 挂载)+ 构建打包(按 R1 核实的导入图捆绑引擎纯模块): `todo`
- WI7 NativeExecutor:agents.create/resume + followup + whenIdle() 等待 + cancel→dispose 序列(handle 存活期 = 整个 run,步骤间复用,R1-A2): `todo`
- WI8 L2 契约测试:双后端行为矩阵(marker 分类/修正重试预算/run-state 形状/EXIT_MAP 映射/flow 预算)——见 R3 §3: `todo`
- WI9 L3 SDK 集成骨架 host-harness.mjs(先解 R3 §6 未决项:sdk server 的宿主启动组合): `todo`
- WI10 mdcontrol.run 异步作业契约:启动即返回 {runId, status},引擎作为 detached 宿主任务继续;完成可选 followup 回执(先例 draft-job.mjs);native 形式端到端跑通 demo mission,run-state 形状与 CLI 一致: `todo`

### M3 — 对齐、技能与门禁强化

- WI11 onboarding mission 双形式对齐(L4 冒烟 diff);subagent 描述符注册(先补读 packages/subagent 内部契约): `todo`
- WI12 Mission Control skills(mission-control-run/draft/analyze)接线到路由: `todo`
- WI13 tools/pre-execute 强化门:plan-status → completed 编辑在 run-state 无已闭合 CLOSURE_AUDIT 访问时 deny(R1 §2 deny 契约): `todo`

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
