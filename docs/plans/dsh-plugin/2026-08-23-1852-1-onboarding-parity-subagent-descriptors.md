# 2026-08-23-1852-1 onboarding 双形式对齐 + subagent 描述符注册（dsh-plugin M3-WI11）

> Plan Status: completed
> Mission: dsh-plugin
> Work Item: M3-WI11
> Last Reviewed: 2026-08-23（draft review 3 轮，iteration 3 共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M3-WI11（"onboarding mission 双形式对齐(L4 冒烟 diff);subagent 描述符注册(先补读 packages/subagent 内部契约)"）
> Related: `docs/architecture/dsh-plugin-packaging.md` §Native Dispatch API Chain（描述符行）、§Phased Delivery（P3 gate）、§Implementation state and boundaries（log viewing 措辞）；`docs/design/dsh-plugin-integration.md` §User-visible capabilities 3、§Running；R3 §2 L4 行、§5；前置 `2026-08-23-1621-2`（monitor step-log bug 立案 + follow-up）；本批执行顺序：本 plan（N=1）→ `1852-2`（WI12）→ `1852-3`（WI13）
> Audit: required

## Current Baseline

**M2 已收口（WI1–WI10 `done`，P2 DELIVERED）；本 WI 是 P3 第一片，且收编一条已触发 reopen 的 deferred 残项：**

- **onboarding mission 现状**：`template/install/missions/onboarding.json`（`flowName: "mission-driver"`、`roadmapPath: docs/backlog/onboarding-roadmap.md`、`commands` 为 echo 桩）——消费者项目经 `install-age.sh` 装入后的首个使命，用途是让 AI 读代码库并回填复制来的 AGE 模板文档（P3 gate 第一句："onboarding fills copied docs identically to CLI form"）。本仓 `missions/` 无 onboarding（真实项目自身不消费它）。WI10 的 L4 e2e 只验证了 `demo` mission；onboarding 从未做过双形式验证。
- **描述符现状（gap）**：`plugin/dsh/src/native-executor.ts` 的 per-run child `agents.create(options)` 不注入任何 `subagent/descriptor` seed——消费端先例 DSH-better-sidebar `src/sidechat-routes.ts:156-174`（'corrupt' 诊断注释 :156-160："a cold child without one is deterministically rendered as a 'corrupt' diagnostic"；descriptor seed 块 :161-174）证明缺描述符的 child 在 host `subagents.list` 渲染为 corrupt 诊断行。`snapshotSubagentDescriptor` 由 `@deepseek-ai/dsh-subagent` 导出（dep 已 exact 钉 `0.1.1-rc.2` 且已安装；plugin src 目前零 import）。host 源码 `~/ai/dsh-src/deepseek-harness/packages/subagent/subagent/src/descriptor.ts` 存在但内部契约（导出面、mode 枚举、`SubagentRunEndInfo`、label 过滤词汇）未读——R1 §7 明示 "needed before P3 descriptor work"，roadmap WI11 括号要求"先补读 packages/subagent 内部契约"。
- **design 措辞 vs 实现形状张力**：design doc §User-visible capabilities 3 写 "dispatched step-agents register healthy descriptors…users see mission steps in DSH's own topology UI"（步级措辞）；WI7 落地的是**每 run 一个 child**（handle 存活期 = 整个 run，步骤间复用，R1-A2）。as-built 语义 = run 级 child 行 + 步级进度经 run-state/monitor；Phase 4 需把 design 措辞与实现对齐。
- **monitor step-log 边界（本 plan 收编的 Fix；draft review iter2 B1 增补第三站点）**：`docs/bugs/2026-08-23-monitor-native-log-naming.md`（open）立案两处——`listStepLogs`（:461,:469 `oc-` 前缀 regex）与 `handleGetLog`（:640,:646）；**iter2 live 核实发现 bug 文档枚举遗漏第三处同族站点**：`handleGetNodeDetail`（:909，路由 `/api/runs/:runId/nodes/:step` 于 :1722 注册）在 :929 以 `f.startsWith(`oc-${safeStep}-`)` 过滤 step-log 文件——native run 的 node-detail `logTail` 恒 null。本 plan 修复覆盖全部三处（修复范围超出 bug 文档枚举，收口时在 bug 文档补注记）。收编依据（双源）：① WI10 plan §Follow-up 立案；② 1447-3 §Deferred "monitor 前端对双后端 run 的渲染验证深化"（watch-only，reopen trigger = "L4 smoke 发现渲染差异时"）——WI10 L4 已发现渲染差异，**reopen 条件已命中**。本 plan 是 M3 首个允许引擎 diff 的 plan，引擎 diff 范围钉死 `monitor.js` + `test/monitor.test.js`。
- **引擎 monitor 单测基线**：`tools/mission-driver/test/monitor.test.js` :567-684 已有 stepLogs / logs-tail 用例（`oc-CHECK-` 前缀断言 :600）——加宽后需双命名形用例（含 node-detail）+ oc- 零回归。
- **e2e 基建可复用**：`plugin/dsh/scripts/e2e-demo.mjs`（双腿：真实引擎子进程 CLI 腿 + 进程内 boot() native 腿）+ `scripts/e2e-policy.mjs`（确定性剧本）+ `test/fixtures/e2e.cordis.yml`（真实 mission-control service 行）+ `matrix-harness.mjs` `normalizeRunState`；门禁 `npm --prefix plugin/dsh run verify:e2e`（显式本地、keyless stub、不接 CI——R3 §5 姿态）。
- **红线**：引擎 diff 限定 `monitor.js`（+其单测）；`plugin/dsh/package.json` `dependencies` 不动（描述符 import 走已钉的 `dsh-subagent`）；零 `@deepseek-ai` 进引擎目录；`verify-age.sh`/`age-ci.yml` 行为不变（verify:e2e 不接 CI）。

## Goals

- WI11 roadmap 两条全部落地：**onboarding 双形式对齐**（L4 冒烟 diff，stub 域可判定语义先裁定）+ **subagent 描述符注册**（先补读 packages/subagent 内部契约再实现）。
- 收编并闭环：monitor step-log `oc-` 前缀边界的引擎侧修复（bug 立案 + 1447-3 reopen 触发）——使 native run 在 monitor step-log 面板可见，并让本 plan Phase 3 的 monitor 渲染核对有干净基线。
- 产出 P3 gate 前半句证据：onboarding 双形式一致性 + "subagents list healthy during run"。

## Non-Goals

- skills 接线与 `mdcontrol.draft`/`mdcontrol.analyze` 路由（M3-WI12，plan `1852-2`）；`tools/pre-execute` 守门（M3-WI13，plan `1852-3`）。
- M4（WI14 AGE preset / WI15 面板决策）。
- 不改 flow DSL、不改引擎状态机核心、不改 CLI 行为；引擎 diff 范围钉死 `monitor.js` + `test/monitor.test.js`，超出即停线重议。
- 不做真实模型语义级的 onboarding 文档质量验证（如需真模型腿，按 verify:native 姿态记录为 env 门禁人工项，不进确定性门禁）。
- 不做 monitor 前端（Vue 面板）改动——端点加宽后前端自然受益。

## Task Route

- Type: `implementation-only change`（插件层新功能 + 一次范围钉死的引擎修复 + 验证）
- Owner Docs: `docs/architecture/dsh-plugin-packaging.md`（§Native Dispatch API Chain 描述符行、§Implementation state and boundaries log viewing、§Phased Delivery P3 gate）；`docs/design/dsh-plugin-integration.md`（§User-visible capabilities 3、§Running）；`docs/analysis/2026-08-22-0003-verification-harness-design.md` §2 L4 行、§5；roadmap WI11。
- Skill Selection Basis: `Skill: none`——`docs/skills/README.md` 无匹配可复用方法；行为语义全部来自 owner docs 与 host 源码，非技能性知识。

## Infrastructure And Config Prereqs

- Phase 3 e2e：零凭据、零网络（脚本化 stub 模型端点）；scratch 目录本地生成、跑后清理。无新 env、端口、迁移。
- host 源码只读核查：`~/ai/dsh-src/deepseek-harness`（Phase 2 Explore；与 R1 同一 grounding）。
- 无引擎 env 变更；run-state/draft-state 写入沿用既有 `_tmp/` 布局。

## Execution Plan

### Phase 1 - 引擎侧 monitor step-log 端点加宽（收编 Fix）

Status: completed
Targets: `tools/mission-driver/src/monitor.js`、`tools/mission-driver/test/monitor.test.js`
Skill: none

- Item Types: `Fix | Proof`
- Prereqs: 无（与 Phase 2 可并行）

**独立可收口性（draft review N1 采纳）**：本 Phase 是 rule-14 确诊缺陷的落地——即使 Phase 3 的 Decision 停滞，本 Phase 也必须独立完成并闭合（自有 commit 与 log 条目）；引擎 diff 停线条款永不回收已落地的修复。

- [x] `Fix` monitor 三处 `oc-` 限定站点加宽为共享 `<label>-<step>-<ts>-<rand>.log[.prompt]` 形状（label ∈ {`oc-`, `native-`}）：`listStepLogs`（:461,:469）与 `handleGetLog`（:640,:646——含 :640 `startsWith("oc-")` 文件参快路径门）按 bug 文档建议修法（regex `^(oc|native)-(.+)-(\d+)-([a-z0-9]+)\.log(\.prompt)?$` + 双 label 前缀搜索；保持 newest-first 排序与既有安全校验语义）；`handleGetNodeDetail`（:929，bug 文档枚举遗漏的第三处）同型加宽
  - Skill: none
- [x] `Proof` 引擎域机器钉住 + e2e 复跑观测（机器断言归 Phase 3——`e2e-demo.mjs` 是 Phase 3 的声明 target，本 Phase 不越界改它）：① monitor.test.js 增双命名形用例（native- 工件列出 + `/logs/:step` 可读 + node-detail `logTail` 可取 + `.prompt` 变体；oc- 既有用例零回归）——修复行为的机器证据；② 引擎全套 `pnpm --prefix tools/mission-driver test` 绿 + `./verify-age.sh` exit 0；③ `npm --prefix plugin/dsh run verify:e2e` 复跑并以 REST 观测记录（`GET /api/runs/<id>` stepLogs 非空 + `/logs/:step` 200 + `/api/runs/<id>/nodes/<step>` logTail 非空——镜像 WI10 render-check 的人工观测方法，如实记录于 log；机器断言在 Phase 3 固化进 e2e 脚本）
  - Skill: none

Exit Criteria:

- [x] native run 的 step-log 面板可见（列出 + 内容可取 + node-detail `logTail` 非空——引擎单测机器钉住 + e2e REST 观测记录；机器断言固化归 Phase 3 exit criterion），oc- 行为零回归
- [x] 引擎与插件验证链全绿（verification scope：monitor 改动属引擎全量域，非 scoped）
- [x] `docs/logs/` updated

### Phase 2 - subagent 描述符注册（Explore → Decision → Add）

Status: completed
Targets: `plugin/dsh/src/native-executor.ts`、`plugin/dsh/test/native-executor.test.mjs`、`plugin/dsh/test/helpers/fake-agents.mjs`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 无（与 Phase 1 可并行）

**Decision Record（执行时裁定，doc 对齐归 Phase 4）**：

- **Explore 事实**（host 源码 `~/ai/dsh-src/deepseek-harness` 只读核实）：`packages/subagent/subagent/src/descriptor.ts` 导出 `snapshotSubagentDescriptor`（validate-and-detach 边界）/`foldSubagentDescriptor`/`SUBAGENT_DESCRIPTOR_VERSION = 2`；mode 枚举 `'one-shot' | 'continuable'`（continuable 必带 `label: string`，可选 `agentProvider/agentModel/persona/toolFilter`）；事件 model-hidden、log-only、survives compaction。`descriptor-seed.ts` 导出 `seedDescriptorTurn(childId, seed, descriptor)`（经真 Session staging 赋 seq + lossless-JSON 强制）。`list-children.ts`：列表面 parent-scoped（`header.parentSession` 过滤）+ `origin === 'subagent'`，身份唯一权威 = `subagent` projection fold——无 descriptor 的 settled candidate 渲染 `corrupt` 诊断行。label 过滤词汇是**消费端**行为（sidebar `SubagentView.tsx` 自过滤 `'Side: '` 前缀），host 列表面本身不按 label 过滤。
- **注入点**：`agents.create(options)` 的 `seed` 数组 + `meta.seedLength`（sidebar :161-174 先例）；fresh child（无继承前缀）→ `seedDescriptorTurn(childId, undefined, descriptor)` 产出单事件 seed（seq 0）。备选（provider 侧 Task 注册路径）否决——那是 `ctx.subagents` provider 协议，插件不是注册 provider。
- **provider 值**：`'mdcontrol'`（插件自身身份词汇，与 `[mdcontrol/native]` 日志前缀同源；sidebar 先例用其插件身份 `'sidechat'` 同型）。
- **label 词汇**：`Mission: <missionName>`（config.missionName 调用期读取），缺失回退 `Mission: <runId basename>` 再回退 `Mission: mission-driver`——使命/run 识别 + `Mission: ` 前缀留作未来拓扑 UI 过滤锚。
- **mode**：`'continuable'`（handle 跨步复用 + 冷 resume 路径在位；sidebar 同选）。`agentProvider/agentModel` 镜像实际 create 的 agentOptions（model 未解析 → create 无 agentOptions → descriptor 同步省略两字段）。
- **resume 路径**：无需补写（预期成立）——descriptor 为 durable session event，随 session log 持久化且 survives compaction；`agents.resume` 重建不依赖描述符。watchdog dispose 后 fresh create = 新 lifecycle 新 childId → 新 seed（非补写）。
- **断言面**（Phase 3 native 腿取用）：首选 child session events 含 `subagent/descriptor`（确定性）；host 列表面仅 fallback——mdcontrol child 无 `parentSession`（无 DSH 父会话语义），parent-scoped `listChildren` 天然不含本 child，故列表面不可达非缺陷，记录于此。

- [x] `Decision`（含 Explore）补读 packages/subagent 内部契约并裁定注册形状：读 `packages/subagent/subagent/src/descriptor.ts`（`snapshotSubagentDescriptor` 导出面、mode 枚举〔sidebar 先例用 `'continuable'`〕、`SubagentRunEndInfo`）+ subagents.list 渲染侧对 label 的过滤词汇（sidebar `'Side: '` 前例）；裁定项 = seed-event 注入点（`agents.create` 的 `seed` 数组，sidebar :161-174 先例）、provider 值（如 `'mdcontrol'`）、label 词汇（使命/run 识别 + 拓扑 UI 噪声控制）、mode 选择、以及 resume 路径是否需要补写（预期不需要：durable seed 随 session 持久化）。备选与理由记录于本 plan（doc 编辑统一归 Phase 4，不双记账）。
  - Skill: none
- [x] `Add` NativeExecutor create 路径注入 `subagent/descriptor` seed event（每 run 一个 child → 每 run 一条 durable 描述符；import 自已钉的 `@deepseek-ai/dsh-subagent`，`dependencies` 零变化）
  - Skill: none
- [x] `Proof` fake-agents 扩展断言 seed 内描述符存在且字段合法（mode/provider/label 形状随 Decision 定）；既有 native-executor 20 用例 + L2 矩阵 22 用例零回归；插件链 `npm --prefix plugin/dsh test` 全绿
  - Skill: none

Exit Criteria:

- [x] 描述符随 child 创建落入 session seed（durable，不依赖 live handle）
- [x] 行为在单测域机器钉住（Phase 3 native 腿的描述符断言面取优序：首选 child session events 含 `subagent/descriptor`〔可确定性观测〕，host 列表面仅作 fallback 并记录理由）
- [x] `docs/logs/` updated

### Phase 3 - onboarding L4 双形式冒烟 diff

Status: completed
Targets: `plugin/dsh/scripts/e2e-demo.mjs`（或姊妹脚本，随 Decision）、`plugin/dsh/scripts/e2e-policy.mjs`、`docs/testing/2026/`（dated note）
Skill: none

- Item Types: `Decision | Proof`
- Prereqs: Phase 1（monitor 干净基线）+ Phase 2（native 腿描述符在位）

**Decision Record（执行时裁定，全文见 `docs/testing/2026/08-23.md` WI11 note）**：

1. **scratch 基座**：fixture 复刻最小安装形状——`missions/base.json`+`onboarding.json` 运行时逐字复制自 `template/install/missions/`（fixture 与真实安装工件耦合）+ 空 docs 骨架 + 单 done 项 roadmap。install-age.sh 全量安装否决：其拷贝正确性属安装器自身验证域，非双形式 parity 断言面；全量拷贝体量/脆性与确定性门禁成本不成比例。
2. **剧本边界**：真实 mission-driver flow；空 plans/audits 使 REVIEW_PLANS（forEach draftPlans()）/EXEC_PLANS（forEach activePlans()）/DEEP_AUDIT（全部 when false）零 agent 步；stub 答 CHECK→pass、DRAFT_PLANS→nothing×2；第二次 nothing 命中 audit-quota 干净短路（auditRound 1/3 + 无 active plans/open audits）——恰 3 个 stub 回合、一轮循环，有界。
3. **断言面**：机制面（步序 + 每 AI 步 marker 对真实 flow transitions 合法 + 产物存在 + `normalizeRunState` 归一化形状 diff 空）。CLI 腿 opencode stub 不增强为可写文件——增强的确定性/成本风险高，裁定双腿均断言机制面，**verification scope limited 显式标注**；真模型腿（如做）= env 门禁人工项。
4. **落地载体**：扩展现有 `e2e-demo.mjs`/`verify:e2e`（默认倾向采纳）——单命令入口保持，脚本可读性尚可（demo 腿原样 + onboarding 腿对偶结构）；Phase 1 修复的机器断言（stepLogs 非空 + `/logs/:step` 200 + node-detail logTail）固化进 `assertMonitorRender`（进程内 `startMonitor`，四 run × 双 label）。

- [x] `Decision` onboarding 双形式对齐在 stub 域的可判定定义（先裁定后实现，禁止把真模型语义混入确定性门禁）：
  1. **scratch 基座**：经 `install-age.sh` 装入 scratch 目录（真实安装路径）vs 提交式 fixture 复刻最小安装形状（onboarding.json + base.json + 最小 roadmap + docs 骨架）——二选一并记录理由；
  2. **剧本边界**：mission-driver flow（CHECK → REVIEW_PLANS → EXEC_PLANS → DRAFT_PLANS → DEEP_AUDIT 循环）的确定性剧本——roadmap 预置最小化、终局路径选定、loop 轮数有界；
  3. **"fills copied docs" 的断言面**：stub 域断言机制面（步序/markers/produced/工件存在性 + 归一化 run-state 形状 diff，复用 `normalizeRunState`）；CLI 腿 `opencode` stub 是否增强至可写文件（native 腿 host 工具栈可真写）——若增强的确定性与成本风险高，裁定双腿均断言机制面并显式记录 verification scope limited；真模型语义腿（如做）= env 门禁人工记录，镜像 verify:native 姿态；
  4. **落地载体（draft review N4 收编）**：扩展现有 `e2e-demo.mjs`/`verify:e2e` vs 新增姊妹脚本（如 `e2e-onboarding.mjs` + `verify:e2e:onboarding`）——本 Decision 一并裁定并记录理由（默认倾向扩展既有脚本保持单命令入口，除非 onboarding 剧本体量使 demo 腿不可读）；Phase 1 修复的机器断言（stepLogs 非空 + `/logs/:step` 200）在本 Phase 固化进 e2e 脚本。
  - Skill: none
- [x] `Proof` 双腿跑通：归一化 run-state diff 空 + 每 AI 步 marker 合法 + monitor 渲染核对（含 step-log 面板与 node-detail 端点 `/api/runs/<id>/nodes/<step>`——即 Phase 1 三站点修复的实证）+ native 腿描述符健康行断言（可达面随 Phase 2 Explore 定：child session events 含 `subagent/descriptor`，或 host 列表面）
  - Skill: none
- [x] `Proof` 记录 `docs/testing/2026/`（命令/环境/逐项断言/发现，含 verification scope 声明）
  - Skill: none

Exit Criteria:

- [x] onboarding 双腿完成 + 归一化形状一致 + Decision 声明的断言面全绿
- [x] 固化为可复跑命令（扩展现有 `verify:e2e` 或新增显式本地 script；不接 `verify-age.sh`/`age-ci.yml`）
- [x] `docs/logs/` updated

### Phase 4 - owner docs + roadmap + 台账回写

Status: completed
Targets: `docs/architecture/dsh-plugin-packaging.md`、`docs/design/dsh-plugin-integration.md`、`docs/analysis/2026-08-22-0003-verification-harness-design.md`、`docs/backlog/dsh-plugin-roadmap.md`、`docs/bugs/2026-08-23-monitor-native-log-naming.md`、`docs/plans/dsh-plugin/2026-08-23-1447-3-l2-backend-parity-matrix.md`
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Proof`
- Prereqs: Phase 1–3

- [x] `Proof` owner docs 对齐：packaging doc——§Native Dispatch API Chain 描述符行 as-built（实现落点/label 词汇/mode；该行现有 "Step-agents register healthy descriptors…" 的步级措辞同步改为 run 级 child + 步级进度经 run-state 的 as-built 语义——draft review N3）、§Implementation state and boundaries log viewing 措辞闭环（bug 修复落地 + 引用）、§Phased Delivery P3 行注记（本 WI 范围内进展）；design doc §User-visible capabilities 3 措辞与 one-child-per-run 实现对齐（run 级行 + 步级进度经 run-state）；R3 §2 L4 行 onboarding 扩展注记；roadmap WI11 `todo → done`（证据摘要内联）；bug 文档状态 closed（修复落点 + 验证证据 + **第三站点 :929 超出原枚举的补注记**——iter2 发现）；1447-3 §Deferred "monitor 前端渲染深化" 台账回写（reopen trigger 命中 → 已收编闭环）
  - Skill: none
- [x] `Proof` `docs/logs/` 聚合收口条目（含双腿结果数字与 verification scope 声明）
  - Skill: none

Exit Criteria:

- [x] owner docs 与落地状态一致；两条台账（1447-3 残项、WI10 follow-up bug）闭环
- [x] `docs/logs/` updated

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd1b9496effeXL6g3Ds95D0W7p`，2026-08-23）——B1：Phase 1 Proof 越界要求 e2e 机器断言（`e2e-demo.mjs` 非 Phase 1 target，"断言"措辞过度承诺、closure audit 无法 replay）。修订：Phase 1 Proof 重述为引擎单测机器钉住 + verify:e2e REST 观测记录（镜像 WI10 render-check 方法），机器断言归 Phase 3 固化。非阻塞 5 项全采纳：N1 Phase 1 独立可收口性声明（rule-14 确诊缺陷自有闭合，停线不回收）；N2 sidechat 引用锚点修正 :156-174；N3 Phase 4 packaging doc 描述符行步级措辞同步对齐；N4 落地载体（扩展 vs 姊妹脚本）收编进 Phase 3 Decision 1.4；N5 Phase 2 断言面取优序（session events 首选，host 列表面 fallback）。fact-check 全过（onboarding.json/描述符 gap/monitor 行号/e2e 基建/1447-3 reopen 触发命中/红线与 AI Block Conditions 无冲突）。
- Independent draft review iteration 2: `needs revision`（独立 fresh session `ses_fd1b3ec13ffeEH0URUm4km2v4u`，2026-08-23）——B1（新发现）：bug 文档枚举遗漏第三处 `oc-` 站点 `handleGetNodeDetail`（monitor.js :909，路由 :1722，过滤 :929）——按原"两处"修复 native run 的 node-detail `logTail` 恒 null，exit criterion 与 bug 闭环将过度承诺（rule 1/14）。修订：Baseline 增第三站点 + "修复范围超出 bug 文档枚举"声明、Fix 项改三处、Proof 增 node-detail 用例与 REST 观测、Phase 3 渲染核对点名 node-detail 端点、Phase 4 bug 闭环补注记。非阻塞 2 项采纳：N1（同上，已并入 Phase 3 渲染核对点名）；N2 锚点修缮（monitor.test.js 用例区间 :567-684；sidebar :161-174）。iteration 1 的 B1/N1–N5 全部复核 resolved。
- Independent draft review iteration 3: `acceptable as-is`（独立 fresh session `ses_fd1afa8a4ffeVM8zYEBafsxhKG`，2026-08-23）——iteration 2 B1/N1/N2 复核全部 resolved（第三站点修复全链贯通 Baseline/Fix/Proof/Phase 3/Phase 4/Review Record，一致性扫过无矛盾；spot-check :909/:1722/:929、:600、:156-174 全过）。非阻塞 2 项采纳收紧：N1 Phase 1 exit criterion 点名 node-detail `logTail`；N2 Fix 项显式点名 :640 文件参快路径门。共识达成，Plan Status → active。

## Closure Gates

- [x] in-scope behavior is complete
- [x] relevant docs are aligned
- [x] verification has run（引擎全套 + verify-age.sh + 插件链 + verify:e2e 含 onboarding 扩展；命令在各 Proof 项固化）
- [x] scoped verification is not conflated with full verification——onboarding e2e 为 stub 域显式本地门禁；若真模型腿未做，"verification scope limited" 显式标注
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

（draft 时点无新增；执行中无显式移出 scope 项。真模型 onboarding 文档质量腿 = 既有 posture 的 env 门禁人工项，非本 plan scope 降级——Phase 3 Decision 3 裁定原文。）

## Closure

Status Note: completed 2026-08-23 — all 4 phases executed and ticked; roadmap WI11 `done`; P3 first slice delivered. 全量验证收口数字：`./verify-age.sh` exit 0（L1 引擎 656/656 + prompt-check、L2 插件 76/76 + manifest + tsc + bundle 新鲜度 + smoke-import）；`verify:e2e` 四连跑全绿（demo + onboarding 双腿归一化 diff 空 ×2、onboarding 有界 3 回合剧本、descriptor rows 2、monitor 四 run 三端点双 label 全绿）；`web typecheck`/`lint:prompts` 绿（web/src 零改动 → dist 还原 HEAD 0 diff）。**verification scope limited: e2e 为 stub 域机制面断言（onboarding 文档质量语义与真模型腿不在确定性门禁）；monitor 渲染为 REST 渲染数据断言（无浏览器交互）**。

Closure Audit Evidence:

- Independent fresh-session subagent cold-replay closure audit, session `ses_fd18e803cffee6jzo7KOAsKRfG`, 2026-08-23。审计域：plan 一致性、交付物逐文件核验（monitor.js 三站点/双命名用例、native-executor.ts 描述符 seed、fake-agents/单测、e2e 双腿 + monitor/描述符断言、8 处文档回写）、红线四项（引擎 diff 限定 monitor.js + monitor.test.js、package.json dependencies 零变化、引擎目录零 `@deepseek-ai`、verify-age.sh/age-ci.yml 零 diff）、独立复跑三链（引擎 656/656、插件 76/76、verify:e2e PASS——与 plan/log 声称数字逐一相符）。审计结论：工程交付/红线/验证全过；唯一 FAIL 项 = 收口簿记本身（gates 未勾、Plan Status 未翻、Closure 未填——审计时序上属最后一步），按审计 remediation 于本 change-set 内补齐（即本节）；非阻塞观察 4 条（工作树未提交属 commit 时序、onboarding.json 经 JSON round-trip 非逐字节、空 forEach 的既有引擎 WARNING 噪声、rule-12 机械 grep 的头部级盲区）均不阻塞收口。

Follow-up:

- （无 confirmed defect。commit 时将全量验证状态写入 commit message，per AGENTS.md Docs Maintenance。）
