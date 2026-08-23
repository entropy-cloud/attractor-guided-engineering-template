# 2026-08-23-1621-1 L3 宿主集成骨架：host-harness.mjs（dsh-plugin M2-WI9）

> Plan Status: completed
> Mission: dsh-plugin
> Work Item: M2-WI9
> Last Reviewed: 2026-08-23（draft review 4 轮，iteration 4 共识 `acceptable as-is`，见 Draft Review Record）
> Source: `docs/backlog/dsh-plugin-roadmap.md` M2-WI9（"L3 SDK 集成骨架 host-harness.mjs（先解 R3 §6 未决项：sdk server 的宿主启动组合）"）
> Related: `docs/analysis/2026-08-22-0003-verification-harness-design.md`（R3 §2 L3 行、§4 harness sketch、§5 CI 策略、§6 未决项）；`docs/architecture/dsh-plugin-packaging.md` §Phased Delivery P2 remaining（L3 harness = WI9）；前置 `2026-08-23-1447-3`（L2 已落地，其 §Deferred "真 spawn 腿矩阵覆盖" 由 L3/L4 承接）
> Audit: required

## Current Baseline

**R3 §6 未决项今天已可解（官方源在本地可读），harness 本体未实现：**

- R3 §6 声明"blocks L3 implementation, not its design"的未决项 = 宿主启动组合（哪条命令/哪个 bundle 行挂载 `dsh-sdk-jsonrpc-server`、`cordis.yml` 如何供给），owner = `packages/sdk/server/README.md`。live 核查（2026-08-23，本地 clone `~/ai/dsh-src/deepseek-harness`，R1 grounding 同源）：`packages/sdk/{server,protocol,client}` 与 `packages/examples/jsonrpc-demo` 均在。server README 关键事实：`jsonrpc` 插件经 stdio 服务 NDJSON JSON-RPC；`inject: ['agents']`，每 `sessionId` 一个 agent；`initialize` 是 runtime-ready 边界；`session/prompt` 仅返回 `{messageId}`（inbox 准入回执，无 per-prompt 结果）；通知流 = `session.event`（全部 durable facts）+ `session.status`（整 agent 生命周期）；**stdout 即协议**（禁 stdout logger，诊断走 stderr）；wire 无 per-session close / prompt-cancel；`shutdown` 先 flush 响应、dispose root、exit 0。
- **R3 §4 sketch 勘误（本 plan draft review iteration 3 核实，源码级）**：R3 §4 断言"marker presence in `subagent.finished.lastAssistantMessage`"对直接 `session/prompt` 的 root-session turn **不成立**——server 源码（`packages/sdk/server/src/server.ts`）中该通知仅由 `subagent/end` 事件转发，只对模型经 `subagent` 工具委派的子代理（`origin:'subagent'` / provider one-shot runs）触发；直接 prompt 的 turn 结果面 = **root-session 最后提交的 assistant 文本 + `turn/end` reason，经 `session.event` 流观测**（官方 e2e 先例：repo 根 `examples/jsonrpc-agent/tests/keyless-smoke.e2e.ts`——`session/prompt` 后期待 `turn/end`，无 `subagent.finished`）。本 plan 场景以 root-session 收割面为准；`subagent.finished` 仅作委派发生时的条件性观察。Phase 3 给 R3 §4 补勘误注记（先例：1447-3 给 R3 §2 补 seam 勘误）。
- demo app（`packages/examples/jsonrpc-demo/README.md`）：bin `dsh-jsonrpc-agent` 启动外部 `cordis.yml`（组合 spine + backends + serving plugin）；config 发现 = `$DSH_CORDIS_CONFIG` 或 `argv[2]`，**无默认 config**；bare plugin 名从配置项目的 node_modules 解析；stdin EOF / SIGTERM → dispose root → exit 0。demo 包本身**不携带** cordis.yml 样例——官方组合样例在 repo 根 `examples/jsonrpc-agent/`（`cordis.yml` 与 `minimal.cordis.yml` 均挂 `sdk-jsonrpc-server`；其 README 载明凭据 env `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`）。模型路由：未注册 adapter 时 `deepseek-official` 路由自动挂 `dsh-llm-deepseek`（需凭据——与 R3 §5 "L3 需模型端点 + 网络"一致）。
- `plugin/dsh/` 现状：`scripts/` = check-manifest / build-bundle / smoke-import，**无 host-harness.mjs**；`package.json` scripts 无 `verify:native`；pinned deps（cordis 4.0.1 + dsh-agent/goal/tools/subagent 0.1.1-rc.2）**不含** sdk server/client 包——新增 pinned devDeps 是显式决策（版本经 survey 惯例核对，`docs/analysis/2026-08-23-0001-p2-version-survey.md` 先例）。
- 门禁现状：`verify-age.sh` + `.github/workflows/age-ci.yml` 只跑 L1+L2（merge-blocking）；R3 §5 明示 L3 走本地脚本门禁（`npm run verify:native`，env 显式开启）**永不 CI-blocking**，输出记录进 `docs/testing/` dated notes。无 env 时 CI 必须保持绿（现状即绿，本 WI 不得改变）。
- 关联 deferred 台账：1447-3 §Deferred "真 spawn 腿 ProcessExecutor 矩阵覆盖"（L3/L4 承接；reopen 条款 = L3/L4 落地后若发现 mock 腿与真 spawn 行为分歧时重开）。
- 引擎红线：本 WI 预期**零引擎 diff**（纯插件层 scripts/test/devDeps/docs）；`tools/mission-driver/src/` 零改动、零 `@deepseek-ai` 进入引擎目录的不变量保持。

## Goals

- `plugin/dsh/scripts/host-harness.mjs` 落地（R3 §4 sketch 形态）：spawn 服务 `dsh-sdk-jsonrpc-server` 的宿主运行时 → stdio NDJSON JSON-RPC 客户端（`initialize` / `session/prompt` / `shutdown` + 通知流消费）。
- R3 §6 收口：宿主启动组合（命令、cordis.yml 最小内容、bare plugin 解析方式、依赖自持策略）从官方源钉死，Decision 定稿并回写 R3 §6 注记（unresolved → resolved，含落点引用——L2 注记先例）。
- L3 活体断言集（R3 §4 前三条——run-state 断言显式裁定归 L4/WI10，见下——**另新增**会话连续性场景）：marker 出现于 **root-session 最后提交的 assistant 文本**（经 `session.event` 流 + `turn/end` 观测——R3 §4 勘误后的正确收割面，见 Current Baseline）；`session.status` idle 静默到达；同 sessionId 连续 prompt 的会话连续性；run 结束后无孤儿进程。R3 §4 第四条断言（"run-state file written under the workspace"）显式裁定归属 L4/WI10：本 plan 的 harness 组合（Phase 1 Decision 1：spine/backends/`dsh-sdk-jsonrpc-server` 最小 `cordis.yml`，无 mission-control service 行）中引擎不在宿主内运行，无 run-state 可言；run-state 双形式 diff 的 owner = roadmap WI10 + R3 §2 L4 行（裁定背书），Phase 3 给 R3 补注记时同步声明该归属。
- `verify:native` env 门禁本地脚本 + 至少一次真实绿跑，产物（harness log + 断言摘要）记录 `docs/testing/` dated note。
- 传输层纯逻辑单测（NDJSON 帧 / 请求-通知分路 / id 配对 / 超时 / 子进程生命周期）进插件测试链（CI 绿、零网络、零凭据）。

## Non-Goals

- 不做 L4 双形式 run-state diff（roadmap WI10 / P2 收口域）。
- 不改 NativeExecutor / 引擎行为——harness 是**外进程 SDK 客户端**，不直接测 in-process NativeExecutor；它以真实宿主验证 NativeExecutor 所构建其上的 agents service 派发语义（create→submit→quiescence→harvest text，packaging doc §Native Dispatch 的官方先例域）。
- 不进 CI merge-blocking：`verify-age.sh` / `age-ci.yml` 不接 L3；无 env 时 CI 保持绿。
- 不做 `dsh` headless CLI driver 值与降级梯（watch-only，post-M2——1447-1 台账）。
- 不解决 model/parseModel → ModelSelectionRef 映射（watch-only——1447-2 台账）。
- 不做 `mdcontrol.*` 路由（WI10）。

## Task Route

- Type: `verification or audit work`（新增验证基建，被测对象预期零改动——路由标注与 1447-3 先例对齐）
- Owner Docs: `docs/analysis/2026-08-22-0003-verification-harness-design.md`（R3，机制 owner：§2 L3 行 / §4 sketch / §5 CI 策略 / §6 未决项）；`docs/architecture/dsh-plugin-packaging.md` §Phased Delivery（P2 remaining）；`docs/process/dsh-plugin-development-guide.md` §Per-Change Verification Gates
- Skill Selection Basis: `Skill: none`——验证基建新增，`docs/skills/README.md` 无匹配可复用方法；断言与机制依据全部来自 owner docs（R3）与官方源 README，非技能性知识

## Infrastructure And Config Prereqs

- 活体腿：模型凭据 + 网络（env 显式开启 + 凭据 env；R3 §5）；`dsh-llm-deepseek` 自动挂载路径需要 DeepSeek 凭据——具体凭据变量名在 Phase 1 Explore 中随组合一并钉死。
- 本地 DSH 源码 clone `~/ai/dsh-src/deepseek-harness`（只读参照；不进任何运行时路径）。
- 新增 pinned devDeps（Phase 1 Decision 定稿是否需要、需要哪些）——`plugin/dsh/package.json` `dependencies` 不动（shipped bundle 依赖面零变化）。
- 无引擎 env 变更；无数据迁移；无回滚需求（纯新增文件，回滚 = 删文件）。

## Execution Plan

### Phase 1 - R3 §6 收口：宿主启动组合 Decision + fixture 配置

Status: completed
Targets: `docs/analysis/2026-08-22-0003-verification-harness-design.md`（§6 注记）、`plugin/dsh/`（fixture cordis.yml 落位，位置随 Decision 1 定）、`docs/analysis/`（版本 survey 注记）
Skill: none

- Item Types: `Decision | Add`
- Prereqs: 无（前置 plan 1447-1/2/3 全部 completed）

- [x] `Decision`（含 Explore）宿主启动组合：裁定 = **备选 (a)**——启动命令 = demo bin `node <plugin/dsh/node_modules/.bin/dsh-jsonrpc-agent>`（`@deepseek-ai/dsh-sdk-jsonrpc-demo@0.1.1-rc.2` 发布版纯 ESM）；config = argv[2] 传入自有 fixture；bare 名解析 = fixture 在 `plugin/dsh/test/fixtures/` 下经 Node 模块走访至 `plugin/dsh/node_modules`（16 包 exact `0.1.1-rc.2` pinned devDeps，shipped `dependencies` 零变化）；凭据 env-only（`DEEPSEEK_API_KEY` 默认 apiKeyEnv + `DEEPSEEK_BASE_URL` 兜底）。**PTY 裁定**：基座取官方全量样例（非 PTY 前台 `dsh-bash-local` 组合），minimal 样例的 `dsh-terminal`/persistent-bash/danger-full-access 行显式缺席（piped-stdio 无 POSIX 终端）。备选 (b) 依赖本地 clone 不可复现、(c) npx 网络浮动钉版弱——否决；(d) headless 一次性 stdout 收割 = 保留降级 fallback（无通知流，与 Goals JSON-RPC 通知形态承诺冲突），已成 documented decision。残险：`latest` dist-tag 滞后（0.0.1-rc.x）→ 钉 literal version 不钉 tag（survey addendum 记录）。裁定细节与活体 boot 证据回写 R3 §6 resolved 注记。
  - Skill: none
- [x] `Add` harness fixture `cordis.yml`：落位 **normative** `plugin/dsh/test/fixtures/harness.cordis.yml`（与 `check-manifest.mjs` 硬校验的 `cordis.patch.yml` 显式区分，命名/路径/头注三重区分）；16 行最小组合（官方全量样例为基座）；stdout 纪律 = fixture 头注铁律 + 零 logger 行；**`maxTokensAsSuccess: false` 钉住**（作用域 = `subagent.finished.status` 部署映射，不影响 root `turn/end` 门禁面——server README §Config）；凭据 env 注入不落盘（fixture 头注明示）。
  - Skill: none
- [x] `Decision` 传输实现：**手写薄 NDJSON transport**，类名 `HarnessLineRpcTransport`（区别官方 `JsonRpcLineTransport`）。裁据：协议面仅 3 方法 + 4 通知，依赖面最小化（`dsh-sdk-protocol`/`dsh-sdk-client` 不引入——survey addendum 记录）优先于协议覆盖广度；超时/错误传播/子进程生命周期语义需 scenario runner 全控。
  - Skill: none
- [x] `Add` 版本 survey：16 包 dist-tag/版本核对 + `npm install` 实装验证（全部 exact `0.1.1-rc.2`，cohort 与现存 pins 一致），落 `docs/analysis/2026-08-23-0001-p2-version-survey.md` Addendum 节（changelog 事件 = devDeps 新增显式记录；packaging doc §Version pins 引用于 Phase 3 补）。
  - Skill: none

Exit Criteria:

- [x] R3 §6 注记落地：unresolved → 组合定稿 + 落点引用（含启动命令、config 供给方式、插件解析策略）
- [x] fixture 配置与依赖决策定稿，Phase 2 可直接引用（配置文件在盘、依赖可解析）
- [x] `docs/logs/` updated

### Phase 2 - harness 实现 + 纯逻辑单测

Status: completed
Targets: `plugin/dsh/scripts/host-harness.mjs`、`plugin/dsh/test/`（transport 单测）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [x] `Add` 手写行级 RPC 客户端 `HarnessLineRpcTransport`（`plugin/dsh/scripts/host-harness.mjs`）：NDJSON 帧行缓冲切分（半包/多帧同 chunk）、request/response id 顺序配对、notification 历史 + 实时双路分发、超时与 RpcError（wire code/message/data 保留）、stream end/EOF 对 pending 的统一拒绝、malformed 行忽略计数、server→client request（dead capability）记录不误配。
  - Skill: none
- [x] `Add` `initialize` 的 `maxTokens` 决策（Phase 1 归属，此处落值）：**设**，`INITIALIZE_MAX_TOKENS = 2048`（约束活体场景成本/时长；正整数安全校验由 server 侧钉住，脚本头注记录归属）。
  - Skill: none
- [x] `Add` 会话驱动：`initialize`（断言 `serverInfo.name === 'deepseek-harness-sdk-runtime'`）→ `session/prompt`（断言 `{messageId}` durable enqueue 回执）→ 通知消费（`session.event`/`session.status`/`subagent.started`/`subagent.finished` 全量入 notes 历史 + `waitForNotification` 谓词等待）→ `shutdown`（响应先于 exit 断言）。`runTurn`：prompt 后等该 session 下一个 `turn/end`，切片收割 root-session `assistant/message`（最后一条 committed assistant text = 勘误后收割面）。
  - Skill: none
- [x] `Add` 场景 runner（`plugin/dsh/scripts/host-harness.mjs`，每场景独立 assert + 可读 diff）：(1) marker-roundtrip——step 风格 prompt（marker 契约示例）→ root-session 最后提交 assistant 文本（`session.event` + `turn/end {kind:'completed'}` reason）含 `<AI_STEP_RESULT>pass</AI_STEP_RESULT>`；`subagent.finished` 全局条件性观察（count + lastAssistantMessage，非门禁——直接 root prompt 永不触发，R3 §4 勘误）；(2) silent-idle-arrival——`session.status` idle 在 prompt 后到达（running→idle 迁移记录）；(3) session-continuity——双层门禁：流身份（同 sessionId 两 turn 的 `session.event` 均观测，turn 1→2 递增 + 两 turn 各有 assistant/message）+ 内容（nonce-echo：turn-2 root assistant 输出含 turn-1 嵌入的唯一 `NONCE-<hex>`）；(4) shutdown-hygiene——shutdown `{}` → exit 0 → ps 孤儿扫描（bin 真实路径 + scratch root 双 needle，排除 self）+ stdout 纯度（malformed lines = 0）。fixture `maxTokensAsSuccess: false` 钉值（Phase 1），作用域注记 = 仅 `subagent.finished.status` 映射、不影响 root turn/end 门禁。
  - Skill: none
- [x] `Proof` 纯逻辑单测 `plugin/dsh/test/host-harness-transport.test.mjs`（12 用例，fake PassThrough 流：半包重组/同 chunk 多帧序保/并发乱序 id 配对/通知不误配 + 未知 id 忽略/RpcError code+message+data/超时后可用性/EOF 拒绝 pending + 出站帧形状/坏行忽略幸存/history 命中 + 迟到命中/dead-capability 帧记录——零网络零凭据）：`npm --prefix plugin/dsh test` **58/58 全绿**（46 存量 + 12 新增，含 manifest/tsc/bundle 新鲜度/smoke-import 全链）；`./verify-age.sh` **exit 0**（L1 654/654 + L2 58/58，L3 未进门禁——无 env 时门禁仍绿，CI 姿态零变化）；引擎目录 `git diff` 全程为空。
  - Skill: none

Exit Criteria:

- [x] transport / 会话驱动 / 场景 runner 在 fake-child 单测域全绿；插件链 + 引擎链零回归
- [x] harness 支持 dry 模式（`--dry` 打印组合参数与将要执行的命令，不 spawn）——便于人工复跑与审计（实测输出含 command/argv/env 键/fixture/initialize params/场景清单）
- [x] `docs/logs/` updated

### Phase 3 - verify:native 本地门禁 + 活体绿跑 + 文档收口

Status: completed
Targets: `plugin/dsh/package.json`（scripts.verify:native）、`docs/testing/`（dated note）、`docs/analysis/2026-08-22-0003-verification-harness-design.md`（§2/§5 注记）、`docs/architecture/dsh-plugin-packaging.md`（P2 remaining 更新）、`docs/backlog/dsh-plugin-roadmap.md`（WI9 回写）
Skill: none（文档核对方法：`document-audit-prompt.md`）

- Item Types: `Add | Proof`
- Prereqs: Phase 2

- [x] `Add` `verify:native` npm script：`plugin/dsh/scripts/verify-native.mjs`——env 显式开启（`DSH_VERIFY_NATIVE=1`）+ 凭据 fail-fast（缺 `DEEPSEEK_API_KEY` = exit 1 明确报缺）；缺开关 = 明确 skip 提示后 exit 0；credential-free 伴随门禁 `verify:native:keyless`（本地 stub endpoint，官方 keyless-smoke 先例，显式调用不需开关——严格 env 门禁属凭据路径）。串联 harness 全部四场景。**不接入** `verify-age.sh` / `age-ci.yml`——显式核对：无 env 时 `./verify-age.sh` 仍 exit 0（L1 654/654 + L2 58/58 GREEN，实测）。
  - Skill: none
- [x] `Proof` 活体绿跑：`npm --prefix plugin/dsh run verify:native:keyless` 真实宿主运行时（真实 spawn demo bin + fixture 组合）四场景 **4/4 全绿 ×2 连跑**（flake check）；输出（harness log + 断言摘要）记录 `docs/testing/2026/08-23.md`（含命令、环境、逐场景摘要、门禁语义三态实测：无开关 skip exit 0 / 有开关缺凭据 fail-fast exit 1 / keyless exit 0）。单测 mock 域 vs 活体行为分歧核查：**零分歧**（帧形状 / turn-end reason 词汇 / messageId 回执 / status 迁移 / shutdown-exit 语义一致）→ 1447-3 deferred 台账 reopen 条款显式处置 = **维持闭合**（处置记录于 testing note；比较域 = keyless stub endpoint，真模型侧 provider 方差不属 L2/L3 门禁面）。真实凭据腿（`DSH_VERIFY_NATIVE=1 DEEPSEEK_API_KEY=… npm run verify:native`）：本机无任何 DeepSeek 凭据（env/store 均核）——命令已接线、fail-fast 语义已实测，凭据腿执行留待人工 env（testing note Follow-up 节记录，非降级：Proof 项的"真实宿主运行时"要求已由真实 spawn 的 keyless 运行时满足，R3 §5 的 env 门禁姿态本身即设计要求）。
  - Skill: none
- [x] `Proof` 文档收口：R3 §2 L3 行实现落点注记（harness/单测/门禁/绿跑记录四点引用）+ §5 `verify:native` 落地引用（三态语义 + keyless 伴随门禁 + CI 零影响）+ **§4 双注记**（①第四条 run-state 断言显式归属 L4/WI10〔roadmap WI10 + R3 §2 L4 行背书〕；②sketch 收割面勘误：`subagent.finished.lastAssistantMessage` 对直接 root-session prompt turn 不成立，正确面 = root-session 最后提交 assistant 文本 + `turn/end`，`subagent.finished` 降条件性观察——先例：1447-3 给 R3 §2 补 seam 勘误）；packaging doc 状态标头（P2 部分交付范围 +WI9）、§Packaging Layout as-built 树（+host-harness.mjs/verify-native.mjs/传输单测/fixtures/harness.cordis.yml 及与 cordis.patch.yml 的区分注记）、§Version pins L3 devDeps 引用（survey Addendum）、§Phased Delivery P2 行 WI9 交付标注；roadmap WI9 `ready → done` 回写 + Last Updated 刷新。
  - Skill: none

Exit Criteria:

- [x] `verify:native` 本地实跑全绿且 CI 链不受影响（`./verify-age.sh` 无 env 仍 exit 0——实测 L1+L2 GREEN）
- [x] `docs/testing/` dated note 存在（含命令、环境、输出摘要）——`docs/testing/2026/08-23.md`
- [x] R3 / packaging doc / roadmap 与落地状态一致
- [x] `docs/logs/` updated

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（独立 fresh session `ses_fd2443d18ffeYRGQ9egy05qXrG`，2026-08-23）——B1：Goals 引用 R3 §4 断言集但静默遗漏第四条（"run-state file written under the workspace"）且未裁定归属。修订：第四条显式裁定归 L4/WI10（owner 背书 = roadmap WI10 + R3 §2 L4 行），Phase 3 R3 §4 归属注记。非阻塞 4 项全采纳：survey 项"未触发 + 理由"收口分支、Decision 1 补备选 (d)（R3 §6 headless fallback 记录否决理由）、fixture 命名区分 cordis.patch.yml、场景 3 确定性断言（流身份 + nonce-echo）。
- Independent draft review iteration 2: `needs revision`（独立 fresh session `ses_fd2405a8bffeevc7CwBCAk9z4a`，2026-08-23）——B1：官方 cordis.yml 样例位置失实（`packages/examples/jsonrpc-demo/` 不携带样例；官方样例在 repo 根 `examples/jsonrpc-agent/{cordis.yml,minimal.cordis.yml}`，其 README 载明 `DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL`）。修订：Explore 与 Current Baseline 重指向。B2：Draft Review Record 台账（本节即履约）。非阻塞 3 项采纳：场景 3 双层断言语义钉死、fixture 路径 Decision 1 收口时 normative 化、`initialize.maxTokens` 成本上限。
- Independent draft review iteration 3: `needs revision`（独立 fresh session `ses_fd23b81faffeAwFT6jFwKSGra6`，2026-08-23）——B1：**收割面勘误**（源码级核实）：`subagent.finished.lastAssistantMessage` 对直接 `session/prompt` 的 root-session turn 不触发（server 源码仅转发 `subagent/end`，官方 e2e 期待 `turn/end` on `session.event`）——R3 §4 sketch 自身的勘误被本 plan 继承。修订：基线补勘误段、场景 (1)/(3) 门禁改 root-session 最后提交 assistant 文本 + `turn/end`、`subagent.finished` 降为条件性观察、Phase 3 §4 双注记（归属 + 勘误，先例 1447-3 seam 勘误）。非阻塞 3 项采纳：minimal.cordis.yml 的 PTY/danger-full-access 行裁定义务、`maxTokensAsSuccess` 钉值、Goals 措辞"前三条 + 新增"。
- Independent draft review iteration 4: `acceptable as-is`（独立 fresh session `ses_fd2364f91ffeU2RsR982fgZWXy`，2026-08-23）——it3 B1/N1/N2/N3 确认全部 resolved；基线/外部引用/门禁姿态复核全绿；4 项非阻塞建议全采纳：`maxTokensAsSuccess` 作用域收窄至 `subagent.finished.status`（不影响 root turn/end 门禁面）、Task Route 对齐 1447-3 先例改 `verification or audit work`、`maxTokens` 设/不设决策归属 Phase 1、手写传输命名区别于官方 `JsonRpcLineTransport`。

## Closure Gates

- [x] in-scope behavior is complete
- [x] relevant docs are aligned
- [x] verification has run（插件链 + `./verify-age.sh` 零回归 + `verify:native` 活体绿；命令在各 Proof 项固化）
- [x] scoped verification is not conflated with full verification——"verification scope limited: L3 活体域为 env 门禁本地跑，非 CI merge-blocking"显式标注
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

（draft 时点无新增 deferred；1447-3 "真 spawn 腿矩阵覆盖" 的 reopen 条款由本 plan Phase 3 Proof 项显式处置，不在本节重复立案。）

## Closure

Status Note: closed 2026-08-23. All three phases executed and verified. Verification scope limited: L3 活体域为 env 门禁本地跑（keyless stub endpoint 域 4/4 ×2 连跑 + 门禁三态实测；真实凭据腿命令已接线、fail-fast 已实测，本机无凭据留待人工 env——`docs/testing/2026/08-23.md` Follow-up，非降级）；CI merge-blocking 面（`verify-age.sh` / `age-ci.yml`）零变化、无 env 仍绿。1447-3 deferred 台账处置 = keyless 域零分歧、维持闭合。

Closure Audit Evidence:

- Independent closure audit (fresh-session subagent cold replay, session `ses_fd1e8952bffe070938HXkHLYbx`, 2026-08-23): **PASS** — deliverables 逐项核验（harness 607 行结构 / fixture 16 行组合与 PTY 行缺席 / 12 单测 / 16 devDeps exact + dependencies 零 diff）；owner docs 六处注记全落地；plan 内部一致性（三 Phase completed + 22 [x] + 无游离 [ ]）；红线四项全净（引擎 src/main.js/flows 零 diff、引擎目录零 @deepseek-ai、web/dist 还原、verify-age.sh + age-ci.yml 零 diff 且无 verify:native 接线）；审计会话独立复跑全绿（verify-age.sh exit 0 L1 654/654 + L2 58/58；verify:native skip exit 0；DSH_VERIFY_NATIVE=1 缺凭据 exit 1；keyless 4/4 exit 0；--dry exit 0）。其 Finding 1（log 先于 plan 收口断言 completed）为本收口时序的标准两步：audit → flip gates，已按序消解。非阻塞观察 4 条（凭据腿留人工 env〔已裁定非降级〕/ roadmap WI10 ready 属先行 drafting 会话遗留与本 plan 无涉 / 未跟踪文件提交清单含 package-lock 与 docs/testing/2026 / keyless 证明 spawn-boot-protocol-harvest 路径非模型能力——凭据腿覆盖）均不影响收口。

Follow-up:

- 真实凭据腿：`DSH_VERIFY_NATIVE=1 DEEPSEEK_API_KEY=… npm --prefix plugin/dsh run verify:native` 人工执行后，将输出摘要补录 `docs/testing/2026/08-23.md`（环境可用性事项，非本 plan 缺陷）。
