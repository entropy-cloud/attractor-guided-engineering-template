# 2026-08-02-2245 mission-driver pi driver support

> Plan Status: completed
> Last Reviewed: 2026-08-02
> Source: 用户需求 —— 用 pi 替代 opencode 作为可选执行器（默认仍 opencode）
> Related: `docs/architecture/mission-driver-baseline.md`（Public CLI Surface / driver 契约）
> Audit: required

## Current Baseline

**driver 抽象基础已存在（零改动即可经 env 切换，已 dry-run 验证）：**

- `src/config.js`：`driver` / `driverArgs` / `promptMode` 三字段已从 `args` / env（`MISSION_DRIVER_EXEC` / `MISSION_DRIVER_ARGS` / `MISSION_PROMPT_MODE`）/ mission.json（经 extends 链）解析。优先级链：CLI > env > mission > 硬默认（`opencode` / `undefined` / `"arg"`）。
- `src/runner.js` `buildDriverArgs()`：模板替换 `{model}` `{agent}` `{session}`；`promptMode:"stdin"` 时 prompt 经 stdin 管道传入（规避 Windows 32k cmdline 上限，memory L004）；`extractSessionId()` 从日志正则抠 `ses_xxx`；`findLatestSessionId()` 调 `opencode session list`。
- `src/executor.js`：`spawn(cmd, args, { stdio:[stdin?pipe:ignore, fd, pipe], detached, windowsHide })`，driver 无关；60min 活动看门狗；stderr 独立管道。
- 实测 `pi -p`（headless）能力：stdin 接收 prompt ✅、`--model` ✅、`--session <uuid>` 续接 ✅、`--tools` 白名单自主执行 ✅、`--append-system-prompt @file` 加载 persona ✅、stdout 干净无 ANSI、`<AI_STEP_RESULT>` marker 正常产出 ✅。

**gap（本计划要填的）：**

1. `main.js` 的 `run` 子命令**未暴露** `--driver` CLI（config.js 读 `args.driver` 但 commander 没注册）→ 目前只能 env/mission 字段切换，不够便捷。
2. config.js **无 pi 感知默认值** → 切 pi 必须同时手填 `driverArgs`+`promptMode`，否则用 opencode 默认模板（`run -m ... --agent ... --dangerously-skip-permissions`）拼到 pi 上会报错。
3. **无 pi persona 文件** → `{agent}` 对 opencode 是名字、对 pi 需是 persona 路径，语义不一致；且引擎目录（经 `MISSION_DRIVER_HOME` 单源引用）下没有 agents 目录。
4. `runner.js` 的 opencode 专属附加项 `--pure` / `--variant` 对 pi 无意义，需在 driver=pi 时跳过。
5. owner doc `docs/architecture/mission-driver-baseline.md` line 13 写死 "spawns `opencode run`"，line 17 "Public CLI Surface" 未提 pi —— 契约文档需同步。

**已排除的路径（Non-Goal 依据）：** subagent 扩展的 `/run` 在 `-p` 模式崩溃（stale ctx，slash-bridge 假设 TUI）；RPC `spawn` 强制 async 且需 daemon 改造；in-process `AgentSession` 要重写 executor。三者都改 spawn 架构，用户已明确否决。

## Goals

- `./tools/mission-driver.sh run <mission> --driver pi` 一行切换到 pi；不带 `--driver` 时行为与现状**字节级一致**（opencode 默认零回归）。
- pi 感知默认值：`driver=="pi"` 且用户未显式设置时，自动套用 `driverArgs`（`-p --model {model} --append-system-prompt @{agentFile} --tools read,write,edit,bash,grep,find,ls`）+ `promptMode:"stdin"`；显式 CLI/env/mission 值永远优先。
- 引擎目录下提供 `agents/build.pi.md` persona，经 `{agentFile}` 占位符解析为**引擎相对绝对路径**（对消费端也成立，因 config.js 运行于引擎内）。
- opencode 专属附加项（`--pure`/`--variant`）在 driver=pi 时跳过。
- owner doc 同步 pi 为可选 driver（架构 baseline + README + CONTEXT + user-manual）。

## Non-Goals

- **不改 spawn 架构**：不引入 RPC daemon / in-process AgentSession / subagent 扩展运行时。
- **不实现 pi session 连续性**：pi 的 UUID session 不在 `-p` 文本模式 stdout 里，`extractSessionId` 抓不到 → 每个 step 起独立 pi（靠 prompt 从磁盘读 roadmap/plans 恢复状态，与 prompts 设计一致）。连续性留作 follow-up。
- **不做 per-step persona 路由**：整个 mission 共用一个 persona（与 opencode `--agent build` 单 agent 语义一致）。多 persona（CHECK 用 planner / AUDIT 用 reviewer）留作 follow-up。
- **不改 mission.json schema**：`agentFile` 是 config.js 计算字段（引擎内解析），不暴露为 mission.json 字段；用户换 persona 靠覆盖 driverArgs。
- **不验证非 opencode/pi 的第三方 driver**（`oc`/`op` 等保持现状不动）。

## Task Route

- Type: `implementation-only change`（在已有 driver 抽象上增加 pi 一路，无新契约）
- Owner Docs: `docs/architecture/mission-driver-baseline.md`（driver 契约）、`tools/mission-driver/README.md`、`tools/mission-driver/CONTEXT.md`、`tools/mission-driver/docs/user-manual.{zh,en}.md`
- Skill Selection Basis: `Skill: none`（标准 Node.js 配置/CLI 改动，无匹配的可复用 skill）

## Infrastructure And Config

- 切 pi 需 `pi` CLI 在 PATH（`which pi` 已验证 0.83.0）。
- pi 的模型 id 格式与 opencode 不同（pi 用 `provider/model[:thinking]`）→ 用 pi 时需经 `--model` / `OPENCODE_MODEL` / mission.model 传 pi 兼容 id；引擎只透传 `{model}`，不翻译。文档说明。
- 无新 npm 依赖（零依赖不变式保持）。

## Execution Plan

### Phase 1 - Engine: pi 感知默认值 + {agentFile} 占位符 + opencode 附加项守卫

Status: completed
Targets: `tools/mission-driver/src/config.js`, `tools/mission-driver/src/runner.js`, `tools/mission-driver/test/pi-driver-config.test.js`（新增）
Skill: none

- Item Types: `Add | Fix | Decision | Proof`
- Prereqs: 无

- [x] `Add` 在 `config.js` 顶部定义 `PI_DEFAULTS`（driverArgs / promptMode / agentFile 相对引擎路径）+ `ENGINE_DIR` 常量（引擎根目录 = config.js 所在目录的父目录；消费端经 `import.meta.url` 自动定位，不硬编码路径）。
  - Skill: none
- [x] `Fix` 主分支 `driver` 解析死代码（draft review M2）：当前 `const driver = args.driver || process.env.MISSION_DRIVER_EXEC || "opencode"`（config.js:285）已回退到 `"opencode"`，导致 `resolvedDriver = driver || mission.driver || "opencode"`（config.js:635）中 `mission.driver` 永不被咨询（死代码）→ mission.json 写 `"driver":"pi"` 不生效。改为 `|| undefined` 让 `mission.driver` 生效，与 driverArgs/promptMode 的 mission 字段优先级一致（draft/analyze 分支本就正确咨询 base.driver，仅主分支有此 bug）。当前无 mission 设 `driver` 字段，安全。
  - Skill: none
- [x] `Add` 在 `resolveConfig` 三个返回点（mission 主分支 / draftMission / analyzeRun）应用 pi 默认值，修复后优先级 `args > env > mission/base > pi-default(driver==pi) > 硬默认`。promptMode 原始默认从 `"arg"` 改为 `undefined`，但**每个返回点必须输出具体值**（driver==pi→`"stdin"`，其余→`"arg"`），绝不让 `config.promptMode` 为 undefined —— 否则 `runner.js:27` 的 `|| "stdin"` 兜底会让 opencode 静默漂移到 stdin 模式（draft review M1 回归风险）。
  - Skill: none
- [x] `Add` `config.agentFile`：driver==pi 时解析为 `resolve(ENGINE_DIR, PI_DEFAULTS.agentFile)`（绝对路径）；driver!=pi 时为 `undefined`。**非 mission.json 字段**（不进 `validateMission`，不改 schema）。
  - Skill: none
- [x] `Add` `runner.js` `buildDriverArgs()` 支持 `{agentFile}` 占位符替换（与 `{model}` `{agent}` `{session}` 同层）。driver!=pi 时 `{agentFile}` 为空 → **整体剔除 `@{agentFile}`（含前导 `@`）**，避免残留 standalone `@` arg（draft review N4 边界；默认 opencode 模板不含此 token 故不受影响，仅守护自定义非 pi 模板）。
  - Skill: none
- [x] `Add` `runner.js` opencode 附加项守卫：`--pure` / `--variant` 仅在 `config.driver !== "pi"` 时注入（pi 不识别这俩 flag）。
  - Skill: none
- [x] `Fix` `runner.js` `findLatestSessionId()`（draft review N2）：driver==pi 时跳过 `opencode session list` 调用直接返回 null —— pi 不支持该命令，且若机器上同时装了 opencode 会返回不相关 session id 污染 run-state.json 的 `step.sessionId`。pi 不依赖 session 续接（Non-Goal），返回 null 安全。
  - Skill: none
- [x] `Decision` pi 默认 driverArgs 用 `--append-system-prompt @{agentFile}`（非 `--system-prompt`），保留 pi 编码默认 prompt + 叠加 persona，降低 persona 需重写工具使用指引的风险。备选：`--system-prompt`（replace，persona 须自包含全部工具指引）。残风险：AGENTS.md 与 persona 指令潜在冲突 → Phase 3 real-run Proof 验证，冲突则切 replace。
  - Skill: none
- [x] `Proof` 新增 `test/pi-driver-config.test.js`（node:test）：
  1. `resolveConfig({mission, driver:"pi"})` → driverArgs/promptMode/agentFile 落 pi 默认；
  2. 显式 `driverArgs`/`promptMode`（args 或 env）→ 覆盖优先；
  3. **opencode 回归覆盖全部三个返回点**（draft review M1）：主分支 / draftMission / analyzeRun 在 `driver` 未设时 driverArgs=`undefined`、promptMode=`"arg"`（绝不为 undefined，防 runner.js `|| "stdin"` 兜底）；
  4. `buildDriverArgs` pi 配置 → 产出 `pi -p --model ... --append-system-prompt @<abs> --tools ...`，无 `--pure`/`--variant`/`--dangerously-skip-permissions`、无残留 standalone `@`（复用 `runner-routing.test.js` 的 `makeFakeExecute` 模式）；
  5. `findLatestSessionId` 在 driver==pi 时不调 `opencode session list`（返回 null）。
  - Skill: none

Exit Criteria:

- [x] `pnpm --prefix tools/mission-driver test` 零回归（新 pi-driver-config 10/10 绿；全量 604/607，3 fail 经 git stash baseline 验证为预存/flaky，详见日志；既有 runner-routing/check-configurable 无回归）
- [x] opencode 默认路径：`resolveConfig` 返回的 driver/driverArgs/promptMode 与改动前逐字段一致（回归断言）
- [x] `config.agentFile` 仅 driver==pi 时非空，且为绝对路径

### Phase 2 - CLI: 暴露 --driver 标志

Status: completed
Targets: `tools/mission-driver/src/main.js`, `tools/mission-driver/test/pi-driver-config.test.js`（追加 CLI 用例）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [x] `Add` `main.js` `run` 子命令注册 `.option("--driver <exe>", "执行器驱动: opencode (默认) | pi")`（line ~891 区）；`cmdRunMission` 的 `args` 对象显式加 `driver: opts.driver`（line ~580 区，与 `agent`/`model` 同列）。
  - Skill: none
- [x] `Proof` `cli-help.test.js` 模式追加：`run --help` 含 `--driver`；`pi-driver-config.test.js` 追加 dry-run 用例 —— `node src/main.js demo --step CHECK --dry-run --no-monitor --driver pi` 退出 0 且 mock step 正常（验证 args 接线贯通）。
  - Skill: none

Exit Criteria:

- [x] `run --help` 显示 `--driver` 选项
- [x] `--driver pi` dry-run 全流程退出 0（不真调模型）
- [x] 不带 `--driver` 时 `run --help` 与命令行为不变（回归）

### Phase 3 - Persona + owner docs + real-run smoke

Status: completed
Targets: `tools/mission-driver/agents/build.pi.md`（新增）、`docs/architecture/mission-driver-baseline.md`、`tools/mission-driver/README.md`、`tools/mission-driver/CONTEXT.md`、`tools/mission-driver/docs/user-manual.zh.md`、`tools/mission-driver/docs/user-manual.en.md`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 2

- [x] `Add` `agents/build.pi.md`：mission-driver 通用执行 persona（遵循 AGE 工作流 / 读 prompt 内注入的 {{contextDir}} 等 / 完成步骤工作 / 输出**恰好一个** `<AI_STEP_RESULT>marker</AI_STEP_RESULT>`）。无 YAML frontmatter（pi `--append-system-prompt @file` 原样加载正文）。
  - Skill: none
- [x] `Add` 更新 `docs/architecture/mission-driver-baseline.md`：line 13 "spawns `opencode run`" → "spawns a configurable driver subprocess (`opencode run` by default; `pi -p` via `--driver pi`)"；Public CLI Surface 段补 `--driver` 选项与 driver 抽象说明（指向 `config.js` PI_DEFAULTS）。
  - Skill: none
- [x] `Add` 更新 `tools/mission-driver/README.md` 配置表：新增 driver 选择说明（opencode 默认 / `--driver pi` / pi 模型 id 格式注意事项）。
  - Skill: none
- [x] `Add` 更新 `tools/mission-driver/CONTEXT.md` 关键约束/配置段：注明 pi 为可选 driver、零依赖不变式仍保持、pi persona 经 `{agentFile}` 加载。
  - Skill: none
- [x] `Add` 更新 `tools/mission-driver/docs/user-manual.zh.md` + `.en.md`：新增"切换 pi 执行器"小节（`--driver pi` 一行、模型 id、无 session 连续性的已知限制）。
  - Skill: none
- [x] `Proof` real-run smoke（**硬 gate，不可被 scope-limited 替代**，draft review M3）：本机 pi 已可用（`pi 0.83.0` + google provider 实测通过），故必须真跑。`node tools/mission-driver/src/main.js demo --step CHECK --driver pi --no-monitor --model google/gemini-2.5-pro`（非 dry-run）→ 真实 pi 子进程经 executor stdin 管道跑通，日志含 `<AI_STEP_RESULT>pass</AI_STEP_RESULT>` 且被引擎正确解析。**这是 append-vs-replace Decision 残风险（AGENTS.md 与 persona 指令冲突）的唯一验证手段** —— dry-run 用 mock agent 无法检测。若实跑发现冲突 → 切 `--system-prompt`（replace）并补测。覆盖面说明（draft review N3）：CHECK 为轻量审查步，persona 冲突可能在 EXECUTE 才暴露；MVP 接受 CHECK 覆盖，EXECUTE 覆盖留 follow-up。
  - Skill: none

Exit Criteria:

- [x] `agents/build.pi.md` 存在且被 pi 默认 driverArgs 引用
- [x] 四份 owner doc 均反映 pi 为可选 driver，无过时 "仅 opencode" 表述
- [x] real-run smoke 产出正确 marker（append-vs-replace Decision 残风险已验证，非 scope-limited 逃避）
- [x] `docs/logs/2026/08-02.md` 记录本次变更与验证状态

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（3 minor + 5 note）—— reviewer（独立 subagent，fresh context，run 85b8131d）。Baseline 大体诚实、goals/non-goals 清晰、未触碰保护区。3 处 minor 已修订：(M1) Proof 补全 draft/analyze 两返回点 opencode promptMode=`"arg"` 回归断言 + 强调 `runner.js:27` `|| "stdin"` 兜底风险；(M2) 新增 Fix 项修主分支 `driver` 解析死代码（`|| "opencode"` → `|| undefined`）让 `mission.driver` 生效，stated priority 修正；(M3) real-run smoke 升为硬 gate（本机 pi 可用），不可被 scope-limited 替代 append-vs-replace Decision 验证。5 处 note 已吸收：N2 `findLatestSessionId` pi 守卫入 Phase 1；N4 `@{agentFile}` 整体剔除；N3 CHECK 覆盖面限制入 Phase 3 Proof；N1 reaper 残风险入 Deferred；N5 ENGINE_DIR 伪代码改为接口级描述。
- Independent draft review iteration 2: `passes draft review`（reviewer，fresh context，run 44aea23b）。8 项 findings（M1-M3 / N1-N5）全部正确落地，无新引入 blocking 问题，规则 11/12 文字一致性完好，draft 转 active。残留 Note（低，非本轮引入）：Fix 项引用的 config.js 行号 `:285`/`:635` 与实际 `:462`/`:595` 有偏差，代码模式唯一可 grep 不影响定位，实现阶段顺带订正。

## Closure Gates

- [x] in-scope behavior is complete（`--driver pi` 一行切换 + opencode 零回归）
- [x] relevant docs are aligned（架构 baseline + README + CONTEXT + user-manual）
- [x] verification has run（`pnpm --prefix tools/mission-driver test` 零回归——全量 604/607，3 fail 经 baseline 验证为预存/flaky非本次引入；新 pi-driver-config 10/10 绿 + `--driver pi` dry-run + **real-run smoke 硬 gate**，后者验证 append-vs-replace Decision 残风险）
- [x] scoped verification is not conflated with full verification（real-run 覆盖面仅 CHECK，EXECUTE 覆盖为 follow-up —— 此局限已在 Phase 3 Proof 注明，非逃避验证）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### pi session 连续性

- Classification: `optimization candidate`
- Why Not Blocking Closure: pi `-p` 文本模式 stdout 不含 session id；每 step 起独立 pi 靠 prompt 从磁盘恢复状态，与 prompts 设计（注入 {{roadmapPath}} 等、读文件）一致，功能完整，仅多耗 token 重读上下文。
- Successor Required: `yes` —— 触发条件：当多步 plan 执行因无上下文连续性出现明显质量回退或 token 成本不可接受时，再做 `extractSessionId` UUID 正则 + pi `--session-dir` 扫描或 `--mode json` 首行解析。

### per-step persona 路由（planner/worker/reviewer）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: opencode 当前也是单 `--agent build` 全流程；pi MVP 对齐该语义即可。
- Successor Required: `yes` —— 触发条件：当审计闭环想要 CHECK/DRAFT 用 planner、EXECUTE 用 worker、AUDIT 用 reviewer 分角色时，再扩 step 级 agent 覆盖。

### pi 驱动进程的孤儿收割（reaper）失效（draft review N1）

- Classification: `watch-only residual`
- Why Not Blocking Closure: `runner.js` 把 `[MISSION_DRIVER:<runId>]` 标记拼进 prompt 文本。opencode（promptMode="arg"）prompt 是 cmdline 末位参数 → `reap-orphans.mjs` 的 cmdline tag 正则能匹配；pi（promptMode="stdin"）prompt 走 stdin → **不在 cmdline** → 崩溃后遗留的 pi 进程不被 tag 匹配收割。缓解：executor 的 60min 活动看门狗 + SIGTERM/SIGKILL 在正常超时/进程退出时仍生效；启动 reaper 的 `isAliveAndOurs` 还查 active-run 登记 + PID 活性（不全靠 cmdline tag）。残风险仅限“pi 子进程自身崩溃且父引擎也崩溃”的极端叠加场景。
- Successor Required: `yes` —— 触发条件：当 24/7 长跑中观察到 pi 崩溃孤儿进程堆积时，再为 pi driver 增设替代身份标记（如经 env var 注入到 pi 进程名/env）。

## Closure

Status Note: pi driver 支持实现完成且通过独立闭包审计。`--driver pi` 一行切换（默认 opencode 零回归），real-run smoke 硬 gate 验证 append-system-prompt Decision 无冲突，零回归经 git stash baseline 对比证实。

Closure Audit Evidence:

- Auditor / Agent: 独立 subagent `reviewer`（fresh context，run 15b689da）
- Verdict: `passes closure audit`
- Evidence: 审计者**独立实跑**全部验证（不只读声称）：pi-driver-config 10/10 绿、`run --help` 含 --driver、--driver pi/opencode dry-run 均退出 0、real-run 日志（cmd 含 `pi -p ... --append-system-prompt @<abs>/agents/build.pi.md`、`<AI_STEP_RESULT>pass</AI_STEP_RESULT>`、status single_step_done）、git stash baseline 对比确认 3 fail 为预存/flaky 零回归、`git diff --stat` 保护区全空、agentFile 不在 mission-check.mjs schema。审计者输出存于 `.pi-subagents/artifacts/15b689da_reviewer_0_output.md`。
- Residual risks（审计者确认均诚实披露）: EXECUTE 步 persona 未 smoke（follow-up）；pi 无 session 连续性（每 step fresh）；pi reaper cmdline-tag 失效（看门狗兼底）；环境依赖（pi 在 PATH + driver 兼容模型 id）。
- 3 个低 note 已处理：① gate 文字“全绿”→“零回归（预存/flaky 已 baseline 验证）”；② `.pi/`+`.pi-subagents/` 加入 .gitignore；③ plan spec 文字 ENGINE_DIR vs 代码 TOOL_ROOT 为 cosmetic（代码采用 TOOL_ROOT 对齐 flow-loader.js/main.js 既有模式，正确）。

Follow-up:
- EXECUTE 步 pi real-run smoke（当多步 mission 出现 persona/AGENTS.md 冲突迹象时）
- pi session 连续性（当无上下文连续性致质量回退或 token 不可接受时）
- pi driver 孤儿收割替代身份标记（当 24/7 长跑 pi 崩溃孤儿堆积时）
