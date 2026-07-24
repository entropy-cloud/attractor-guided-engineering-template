# mdr-1 mission-check.mjs 跨平台 CLI 入口修固

> Plan Status: completed
> Last Reviewed: 2026-07-21
> Source: `docs/backlog/mission-driver-draft-robustness-roadmap.md` WI4
> Related: `tools/mission-driver/design/draft-robustness-design.md` §2.5, §4.4
> Mission: mission-driver-draft-robustness
> Work Item: WI4 修固 mission-check.mjs 跨平台 CLI 入口
> Audit: required

## Current Baseline

Live baseline verified against the repo on 2026-07-21:

- `tools/mission-driver/src/mission-check.mjs:106` 的独立 CLI 入口判断是字面量模板字符串拼接：

  ```js
  if (import.meta.url === `file://${process.argv[1]}`) { ... }
  ```

- 左侧 `import.meta.url` 由 Node 规范化为合法 `file:///` URL（Windows: `file:///C:/Work/.../mission-check.mjs`；macOS/Linux: `file:///abs/path/...`）。
- 右侧 `process.argv[1]` 是 Node 接收的原生路径字符串。Windows 下是 `C:\Work\...\mission-check.mjs`（反斜杠）或调用方传入的相对路径（如 `tools/mission-driver/src/mission-check.mjs`）；拼成 `file://C:\Work\...` 或 `file://tools/...`——既不是合法 file URL，也与左侧的规范化形式永远不相等。
- 后果（设计文档 §2.5）：在 Windows 上 CLI 主体（`:106-118` 的 `if` 块）从不执行 → 脚本不报错、不输出、走完模块顶层、exit 0 → `node mission-check.mjs <bad-file> <root>` 静默 no-op，任何 mission（哪怕 `plansDir` 不存在）都"通过"。是平台相关的假阳性机器。
- macOS / Linux 上 `process.argv[1]` 是 `/abs/path/mission-check.mjs`，拼成 `file:///abs/path/...` 与 `import.meta.url` 相等，CLI 正常执行。
- `run` / `list` 等子命令**不受影响**——它们走 `config.js:3` import + `:117` / `:506` 函数式 `loadMission(file, projectRoot)`，把 `mission-check.mjs` 当模块 import 进来调用，不走 `import.meta.url` 入口判断。
- 现有校验纯函数 `validateMission` / `loadMission`（`mission-check.mjs:57,95`）逻辑本身正确，本 plan 不改它们的实现。
- 测试目录 `tools/mission-driver/test/` 现有 CLI 触发范式：
  - `test/from-step.test.js:24,117` 用 `spawnSync(process.execPath, [MAIN_JS, ...args], ...)` —— **本 plan 镜像这个范式**（spawnSync + `process.execPath`，避免硬编码 `'node'` 导致 dev 机器 node 版本歧义）。
  - `test/cli-help.test.js:3,11` 用 `execFileSync(process.execPath, ...)` —— 同样用 `process.execPath`。
  - `test/plan-check.test.js` 直接 import `inspectPlan` 当函数调用，**不**走 spawnSync（不是本 plan 的范式参考）。
- **没有**针对 mission-check.mjs 独立 CLI 的 spawnSync/execFileSync 测试——本 plan 同时补这个缺口。
- 验证命令（`missions/base.json`）：`pnpm --prefix tools/mission-driver test`（package.json `"test": "node --test test/*.test.js"`）。

**Gap:** `mission-check.mjs` 独立 CLI 在 Windows 静默失效，给假阳性；缺一个跨平台锁住"独立 CLI 真执行校验"的回归测试。

## Goals

- 让 `mission-check.mjs` 独立 CLI 入口判断在 Windows / macOS / Linux 三平台一致触发，消除 Windows 静默 no-op。
- 用一个 `spawnSync` 测试锁住"独立 CLI 真正执行校验、对坏 mission 报错并 exit 1"的不变性，防未来回归。
- 不动 `validateMission` / `loadMission` 校验逻辑，不改 `run`/`list` 函数调用路径，不引入新 npm 依赖。

## Non-Goals

- 不把校验收进 commander 子命令形态（`mission-driver check <mission>`）。设计文档 §4.4.2 把它列为后续可选升级，不在本 WI 范围。
- 不改 `validateMission` / `loadMission` 的校验规则、错误文案、字段集合。
- 不改 monitor.js 的 `GET /api/configs` 过滤逻辑（已正确跳过无 `roadmapPath` 的 base 文件）。
- 不为本修复加 CI 矩阵（Windows / Linux 并跑）——`pathToFileURL` 方案在三平台上数学上一致，单平台测试已能锁住主要不变性。

## Task Route

- Type: `bug investigation` → `implementation-only change`（缺陷根因已在设计文档 §2.5 / §4.4 定位，落地是单文件单行替换 + 一个测试文件）。
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §2.5, §4.4
- Skill Selection Basis: `Skill: none` — 缺陷与修法在 owner doc 里已逐行写明（`pathToFileURL(process.argv[1]).href` 替换），方法直接由 Node 官方推荐"是否作为主模块运行"模式给出，无匹配的可复用 skill。

## Infrastructure And Config Prereqs

No infra prereqs beyond existing baseline. `node:url` 是 Node 内置模块，不引入新 npm 依赖；保持引擎核心零依赖约束（CONTEXT.md 关键约束）。

## Execution Plan

### Phase 1 - 入口判断改用 pathToFileURL

Status: completed
Targets: `tools/mission-driver/src/mission-check.mjs`（顶部 import + `:106` 入口判断）
Skill: none

- Item Types: `Fix`
- Prereqs: none

- [x] Fix: 在 `mission-check.mjs` 顶部 `import { resolve, dirname } from "node:path";` 之后新增 `import { pathToFileURL } from "node:url";`。
      - Skill: none
- [x] Fix: 把 `:106` 的入口判断从
      ```js
      if (import.meta.url === `file://${process.argv[1]}`) {
      ```
      改为
      ```js
      if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
      ```
      - `pathToFileURL` 把任意平台路径（Windows 反斜杠 / 相对路径 / 带 drive letter）规范成与 `import.meta.url` 同形的 `file:///` URL（Windows 产出 `file:///C:/...`，三斜杠前缀 + drive letter），两侧比较在三平台上一致。
      - `process.argv[1] && ...` 短路防护：当本模块被一个**没有 argv[1]** 的宿主 import 时（REPL、`node -e`、`node -`（stdin）、Electron 主进程等），`pathToFileURL(undefined)` 会抛 `ERR_INVALID_ARG_TYPE`。短路保证这种宿主下入口判断安全退化为 false（CLI 主体不执行，模块仍可作为函数库被 import）。
      - Skill: none

Exit Criteria:

- [x] Windows / macOS / Linux 三平台上，`node tools/mission-driver/src/mission-check.mjs <bad-mission> .` 都真正进入 CLI 主体；坏 mission（缺字段 / `plansDir` 不存在）触发 exit 1 + stderr 报错文案。
- [x] Windows 上 `node tools/mission-driver/src/mission-check.mjs missions/base.json .`（合法但无 `roadmapPath`）行为不变——`loadMission` 成功、`console.log` 输出 valid JSON、exit 0。
- [x] `import mission-check.mjs` 当模块（被 `config.js` 等 import 调用 `loadMission`）时，CLI 主体不执行（`pathToFileURL(<import 路径>).href !== import.meta.url`，行为同旧逻辑）。
- [x] `docs/logs/` 更新（按 AGENTS.md）。

### Phase 2 - 跨平台回归测试

Status: completed
Targets: `tools/mission-driver/test/mission-check-cli.test.js`（新增）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1 完成

- [x] Add: 新增 `test/mission-check-cli.test.js`，**镜像 `test/from-step.test.js:24,117` 的 spawnSync 范式**：用 `child_process.spawnSync(process.execPath, [missionCheckPath, ...args], { encoding: "utf8" })` 真起子进程跑独立 CLI（不走函数 import；用 `process.execPath` 而非字面量 `'node'`，避免 dev 机器 node 版本歧义）。至少覆盖：
      - 用例 A（坏 mission 触发 exit 1）：临时目录写一个缺 `name` 的 mission.json，跑 `spawnSync(process.execPath, [missionCheckPath, "<tmp>/bad.json", "<tmp>"])` → 断言 `status !== 0`（exit 1）且 `stderr` 含 `"missing required field"`（与 `validateMission` 错误文案对齐）。
      - 用例 B（`plansDir` 不存在触发 exit 1）：临时目录写一个字段齐全但 `plansDir` 指向不存在路径的 mission.json，跑独立 CLI → 断言 exit 1 + stderr 含 `"does not exist"`。
      - 用例 C（合法 mission 触发 exit 0 + stdout JSON）：临时目录写一个字段齐全、`plansDir` 指向临时目录内真实子目录的 mission.json → 断言 exit 0 + stdout 含 `"valid": true`。
      - 用例 D（**跨平台路径规范化锚点**，非"防 Windows 回归"——见下）：用 `pathToFileURL` 直接对几条规范化输入做单元断言（不走 spawnSync），锁住 Node 在所有平台上对 Windows 风格路径产出 `file:///C:/...` 形式：
        - `pathToFileURL("C:\\Work\\foo\\mission-check.mjs").href === "file:///C:/Work/foo/mission-check.mjs"`（Windows 路径在三平台都被 `pathToFileURL` 同形规范化）。
        - POSIX 路径规范化断言（执行期发现 plan 原文"POSIX 路径在三平台同形"不准确：Windows 上 `pathToFileURL("/abs/...")` 会按当前盘符解析为 `file:///C:/abs/...`。已改为平台条件断言——POSIX 上精确等式 `file:///abs/...`，Windows 上正则匹配 `file:///X:/abs/...` 三斜杠 + 盘符前缀，并附 `file:\/\/\/` 三斜杠 invariant 兜底。仍锁住"旧 `file://C:\...` 两斜杠拼接为假"的回归核心）。
        - 反例：`pathToFileURL("C:\\Work\\foo\\mission-check.mjs").href === \`file://C:\\Work\\foo\\mission-check.mjs\`` 必须为 **false**（锁住"旧的 `file://${argv[1]}` 拼接"对 Windows 路径产生错误形式——这正是缺陷根因）。
        - 这组断言不依赖宿主平台，能在 Linux CI 上也锁住"Windows 路径被正确规范化"的不变性，防止有人把 `pathToFileURL(...)` 还原成旧的模板字符串拼接后在 Linux CI 上绿。
      - Skill: none
- [x] Proof: 运行 `pnpm --prefix tools/mission-driver test`，确认新测试全绿且不破坏现有套件（`plan-check.test.js` / `core.test.js` / `monitor.test.js` / `from-step.test.js` 等）。
      - Skill: none

Exit Criteria:

- [x] `test/mission-check-cli.test.js` 四个用例（A/B/C/D）全部通过；其中 D 在当前开发机（任意平台）上绿即视为锚点就位。
- [x] `pnpm --prefix tools/mission-driver test` 整体绿（含现有套件）。
- [x] 手动验证（仅 Windows 开发者执行；非 Windows 开发者跳过并在 closure 注明）：在 Windows 上跑 `node tools/mission-driver/src/mission-check.mjs <bad-file> .` 真的报错 exit 1（之前是静默 exit 0）。Case D 的单元锚点保证非 Windows 开发者的提交也不会让 Windows 退化。
- [x] `docs/logs/` 更新。

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (task `ses_07d976dbdffebWn66UZvD5p653`) 因为两处 baseline / 范式引用错（plan 引用的 `plan-check.test.js` / `cli-help.test.js` 实际不是 spawnSync 范式；`from-step.test.js:117` 才是 spawnSync + `process.execPath` 的范式）；Case D 标榜"防 Windows 回归核心"但在非 Windows CI 上无法触发 Windows 路径，等于空 assert。Rationale for `argv[1]` guard 误标为 `--experimental-loader`（实际是 REPL / `node -e` / Electron main）。
- Iteration 1 revision: 把 spawnSync 范式引用改为 `from-step.test.js:24,117`（并显式用 `process.execPath` 替代字面量 `'node'`）；Case D 改为平台无关的 `pathToFileURL` 规范化单元断言（锁住 `file:///C:/...` 形式 + 反例证明旧 `file://C:\...` 拼接为假）；guard rationale 改为 REPL / `node -e` / `node -` / Electron main。
- Independent draft review iteration 2: `accept` (task `ses_07d8520f8ffePFGygvhcd3HIr6`) — 两处 Round 1 blocker 均已解决（spawnSync 范式引用改为 `from-step.test.js:24,117` + `process.execPath`；Case D 改为平台无关的 `pathToFileURL` 单元断言含反例）。Guard rationale 已改为 REPL / `node -e` / `node -` / Electron main。Baseline 与 live code 一致，无新阻塞。共识达成，Plan Status → active。

## Closure Gates

- [x] in-scope behavior is complete（入口判断改用 `pathToFileURL` + 跨平台回归测试）
- [x] relevant docs are aligned（设计文档 §4.4 已是 owner doc；CONTEXT.md "Mission 配置系统"段落已说明 `import.meta.url` 入口判断的存在，无需改文案；本 plan 闭合时在日志记录"已修固"即可，No owner-doc update required）
- [x] verification has run（`pnpm --prefix tools/mission-driver test`；Windows 手动跑一次独立 CLI 验证不再静默 exit 0）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### `mission-driver check <mission>` commander 子命令形态（设计文档 §4.4.2）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: WI4 范围是"修复独立 CLI 入口的 Windows 静默失效"，方案 D（`pathToFileURL` 一行替换）已根治；commander 子命令形态是入口统一的可选升级，设计文档明确"若后续 `mission-check` 需要更多 CLI 能力（如 `--fix`、`--strict`），再升级"。
- Successor Required: yes — 当未来需要 `--fix` / `--strict` / 多 mission 批量校验等 CLI 能力时，由后续 plan 承接评估。

## Closure

Status Note: 已完成。Phase 1（`mission-check.mjs:107` 入口判断改用 `pathToFileURL(process.argv[1]).href` + `process.argv[1] &&` 短路防护；顶部新增 `import { pathToFileURL } from "node:url"`）落地；Phase 2（新增 `test/mission-check-cli.test.js` 四用例 A/B/C/D）落地。Windows 手动验证：`node mission-check.mjs <bad.json> <root>` 现报错 exit 1（修复前静默 exit 0）。Case D 执行期发现 plan 原文"POSIX 路径在三平台同形"不准确（Windows 上 `/abs/...` 按当前盘符解析），已改为平台条件断言并保留三斜杠 invariant 兜底，仍满足 Exit Criteria"D 在任意平台绿"且不弱化回归锚点。

Closure Audit Evidence:

- Auditor / Agent: 按 `AGENTS.md` Reviewer-Availability Fallback 走 solo cold-replay closure pass（无第二 reviewer / subagent 可用）。本 plan 非保护区域（无 API / DB / auth / integration / deployment 契约变更；单文件单行替换 + 一个测试文件），非高风险，符合 solo review 条件。本次 closure 使用 solo fallback，已针对本 plan / 关联 docs（设计文档 §2.5 / §4.4）/ 真实 diff（`mission-check.mjs:9-11,107` + 新增 `test/mission-check-cli.test.js`）/ 真验证命令（`pnpm --prefix tools/mission-driver test` 全绿 476 pass / 0 fail；`pnpm --prefix tools/mission-driver/web run typecheck` clean；`pnpm --prefix tools/mission-driver/web run build` built OK；`pnpm --prefix tools/mission-driver run lint:prompts` OK）做了 cold-replay 自检。
- Evidence:
  - `tools/mission-driver/src/mission-check.mjs:11` 新增 import；`:107` 入口判断改为 `process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href`。
  - `tools/mission-driver/test/mission-check-cli.test.js` 新增（6 tests / Cases A-D，全绿）。
  - Windows 手动 CLI 验证：`node tools/mission-driver/src/mission-check.mjs`（无参）→ exit 2 + Usage；`node tools/mission-driver/src/mission-check.mjs <bad.json> <root>` → exit 1 + stderr "missing required field: name" / "does not exist"（修复前 Windows 静默 exit 0）。
  - `docs/logs/2026/07-21.md` 已追加本 WI4 闭合条目。
  - `docs/backlog/mission-driver-draft-robustness-roadmap.md` WI4 状态 `todo` → `done`（§Work Item Status 与 §M3 表格 + Details 同步）。
