# mdr-2 CLI 层 draft 描述校验

> Plan Status: completed
> Last Reviewed: 2026-07-21
> Source: `docs/backlog/mission-driver-draft-robustness-roadmap.md` WI1
> Related: `tools/mission-driver/design/draft-robustness-design.md` §2.1, §4.1
> Mission: mission-driver-draft-robustness
> Work Item: WI1 CLI 层 draft 描述校验
> Audit: required

## Current Baseline

Live baseline verified against the repo on 2026-07-21:

- `cmdDraftMission(desc, opts)` 入口在 `tools/mission-driver/src/main.js:244`。`desc` 来自 commander 的 `program.command("draft").argument("<description>")`（`main.js:708-710` / `.action((desc, opts) => cmdDraftMission(desc, opts))` `:719`，仅保证参数**存在**、不保证**有意义**）。
- 入口处对 `desc` 的零校验：空字符串不可能（commander `<required>` 拒绝），但 `" "`、`"d"`、`"test"`、`"asdf"`、`"xxx"` 等占位 / 过短描述全部通过。
- 事故复现路径（设计文档 §0）：以 `"d"` 调用 → brief agent 生成 `d-brief.md`、draft agent 生成 `d-roadmap.md` + `missions/d.json`，三套垃圾产物落盘。
- `--draft-job-dir` 模式（monitor draft-job UI 走的同一代码路径）同样无校验。
- 现有 brief gate（`mission-draft.md:7`）只是 prompt 文字，引擎不强制（这是 WI2 的范围，不在本 plan）。
- **`resolveConfig` 在 draft 分支 (`config.js:428-455`) 早 return**，返回对象 `mission: null` / `missionName: null`，**不**调 `loadMission`、**不**处理 `extends: "base"` 链——也就是说 `missions/base.json` 在 draft 路径上**根本没被读**。因此本 plan 不能依赖"resolveConfig 已合并 base.json 字段"。
- **`loadMission`（`mission-check.mjs:95`）也不能用来读 base.json**：它内部调 `validateMission`（`:99`），后者强制 `REQUIRED_FIELDS = ["name","roadmapPath","plansDir","commands"]`（`:12,60-62`），而 `missions/base.json` 故意只有 `commands` 等共享字段（无 name/roadmapPath/plansDir，因为它是被 extends 的 base，不是独立 mission）。`monitor.js:693-716` 的 `handleGetBaseConfig` 正是为此绕过 `loadMission`、自己 `JSON.parse` + 浅合并 base.json + base.local.json。本 plan 配置读取路径见 Phase 1 Decision。
- `cmdDraftMission` 在 `main.js:281-290` 的 `if (opts.draftJobDir)` 块**会再次写** `draft-state.json` 的 `status: "running"`（re-affirm），紧随其后是 Stage 1。这意味着校验**必须**钉在该 re-affirm **之前**，否则失败的 desc 已经把"running"状态写盘，monitor draft-job UI 会看到一个永远不会进展的 running job。
- `missions/base.json` 当前无 `draft.*` 字段；本 plan 引入 `draft.minDescLength`（默认 4），有默认兜底，base.json 不强制新增。
- main.js 已是 ESM，已有 named export `__setRunnerFactoryForTest` (`:25`) 与 `cmdDraftMission` (`:801`)，**直接 `export function validateDraftDesc`** 即可被测试 import，无 export 表面阻力。
- `tools/mission-driver/test/draft-brief.test.js` / `draft-job.test.js` 已建立 draft 命令的测试范式（`__setRunnerFactoryForTest` 注入 mock runner）；本 plan 沿用此范式。
- 验证命令（`missions/base.json`）：`pnpm --prefix tools/mission-driver test`（package.json `"test": "node --test test/*.test.js"`）。

**Gap:** `cmdDraftMission` 入口对描述零校验，明显无意义的输入（空 / 过短 / 占位）一路下到 Stage 1，污染 `docs/backlog/` 与 `missions/`。本 plan 在 CLI 层加确定性前置校验（钉在 `main.js:281` 的 running re-affirm 之前），挡住明显垃圾输入。"是否语义充分"由 WI2 的 brief gate 处理，不在本 plan。

## Goals

- 在 `cmdDraftMission` 入口（Stage 1 之前）加一段确定性校验，拒绝明显无意义的描述：空 / `trim` 后长度 < 阈值 / 命中占位黑名单。
- 校验失败时打印 reason + 正面示例 hint，`process.exitCode = 1`，不进 Stage 1、不写 brief / roadmap / mission.json。
- 阈值默认 `4`，可通过 `missions/base.json` 的 `draft.minDescLength` 覆盖；缺省时回退默认值（不强制 base.json 新增字段）。
- 不做语义校验（"是否有意义"交给 WI2 的 brief gate）。

## Non-Goals

- 不改 `run` / `list` / `analyze` / `check` 等其它子命令的参数校验。
- 不改 brief gate 引擎强制（WI2 范围）。
- 不改路径解析（WI3 范围）。
- 不引入 AI 判断描述语义（设计文档 §6.1 已否决）。
- 不改 commander `<description>` argument 本身的 required 语义（commander 已保证存在；本 plan 在 `cmdDraftMission` 内部加内容校验，与 commander 解耦）。
- 不在 monitor draft-job UI 加前端预校验（同一代码路径在后端拦下即可，UI 升级非阻塞）。

## Task Route

- Type: `implementation-only change`（owner doc 已指定方案 A 的函数骨架与黑名单）。
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §2.1, §4.1
- Skill Selection Basis: `Skill: none` — 校验规则（长度 + 黑名单正则）由设计文档 §4.1 直接给出，方法是确定性的字符串规则，无匹配的可复用 skill。

## Infrastructure And Config Prereqs

No infra prereqs beyond existing baseline. 不引入新 npm 依赖（纯正则 + 字符串处理），保持引擎核心零依赖约束。

## Execution Plan

### Phase 1 - validateDraftDesc 函数与入口校验

Status: completed
Targets: `tools/mission-driver/src/main.js`（`cmdDraftMission` 入口 `:244` 之后、`:281` 的 `if (opts.draftJobDir) writeDraftState({status:"running", ...})` 块**之前**；新增 `validateDraftDesc` 函数 + `export`；可能的小幅 base.json 读路径补丁）
Skill: none

- Item Types: `Add | Decision | Fix`
- Prereqs: none

- [x] Decision: 阈值配置读取路径——**采用方案：直接 `JSON.parse(readFileSync(base.json))` 读 base.json**（不走 `loadMission`，后者会因 `validateMission` 拒绝 base.json 缺 `name/roadmapPath/plansDir` 而抛错）。镜像 `monitor.js:693-716 handleGetBaseConfig` 的既有范式（该 handler 同样因此绕过 `loadMission`）。
      - 选择理由：`resolveConfig` draft 分支不读 base.json；`loadMission` 不能读 base.json；只剩"直接 JSON.parse"这一条路径。改动最小（5 行），不破坏 `resolveConfig` / `loadMission` 的现有职责边界，不引入新 CLI 表面。
      - base.local.json 不读：CONTEXT.md 明确 base.local.json 是"个人覆盖 - sourcePaths（依赖模块源码路径，不同同事路径不同）"，**不**承载仓库级配置。`draft.minDescLength` 是仓库级配置（base.json，进 git），不需要从 base.local.json 读。若未来 base.local.json 扩展承载其它仓库级字段，再加 extends 合并。
      - 备选 1（被否决）：扩展 `resolveConfig` draft 分支去加载 base.json 并 surface `draft: { minDescLength }`。否决理由：让 `resolveConfig` 在 draft 分支也跑 extends 链与该分支的设计意图（"draft 不依赖任何具体 mission"）冲突；改动面大且影响其它 draft 字段语义。
      - 备选 2（被否决）：用 `loadMission(base.json)` + try/catch 兜底。否决理由：try/catch 会吞掉 `validateMission` 的合法拒绝，`baseConfig` 永远是 `{}`，配置实际上**不生效**——这是 Round 2 review 抓到的 dead-code 风险。
      - 备选 3（被否决）：在 `mission-check.mjs` 加 export `loadBaseConfig(missionsDir)` helper（镜像 `handleGetBaseConfig` 的核心逻辑），monitor.js 也复用。否决理由：增加 export 表面与跨文件 refactor，超出 WI1 范围；当未来需要时再提取。
      - 备选 4（被否决）：加 `--min-desc-length` CLI flag。否决理由：阈值是仓库级配置，不应让每次调用都传。
      - 残留风险：base.json 写错类型（字符串 / NaN）→ 校验阈值失效。对策：读取时 `Number.isFinite(+v) && +v > 0 ? +v : 4` 兜底（写进 Phase 1 函数实现）。base.json 文件不存在 / 解析失败 → try/catch 兜底为 `{}`，配置回退默认 4。
      - Skill: none
- [x] Add: 在 `main.js` 紧邻 `extractBriefPath`（`:160-164`）一带新增**导出**纯函数 `validateDraftDesc(desc, minLen = 4)`。函数体直接采用设计文档 `draft-robustness-design.md` §4.1 的实现（空 / 长度 / 占位黑名单三段式 + 默认值兜底），不在 plan 里重复贴代码（Minimum Rule 6）。相对设计文档 §4.1 的唯一偏离：参数 `minLen` 接受非有限数时回退 `4`（`Number.isFinite(+minLen) && +minLen > 0 ? +minLen : 4`），用于防御 base.json 写错类型。
      - Skill: none
- [x] Add | Fix: 在 `cmdDraftMission` 入口**钉位**——`resolveProjectRoot(opts)`（`:245`）之后、`resolveConfig({...opts, ...config})`（`:262`）之后、**`if (opts.draftJobDir) writeDraftState({status:"running", ...})`（`:281-290`）之前**——加：
      ```js
      let baseConfig = {};
      try {
        baseConfig = JSON.parse(readFileSync(resolve(resolved.missionsDir, "base.json"), "utf8"));
      } catch { baseConfig = {}; }
      const minLen = baseConfig?.draft?.minDescLength;
      const v = validateDraftDesc(desc, minLen);
      if (!v.ok) {
        console.error(`[DRAFT VALIDATION] ${v.reason}`);
        console.error(`Hint: draft 需要一句描述目标的话；示例：draft '为 mission-driver 增加 audit 计数'`);
        process.exitCode = 1;
        await runner.close();
        return;
      }
      ```
      - 关键：校验失败时 `runner.close()` 后立即 `return`，**不**写 `draft-state.json`——`cmdDraftMission` 永远不把 rejected desc 反映为 running 状态。
      - monitor 的 `startDraftJob`（`draft-job.mjs`）在 spawn 之前已先写一份 initial running `draft-state.json`，draft 子进程 exit 1 后 monitor 是否把它转 failed 属于 monitor 状态机问题（Deferred）。
      - Skill: none

Exit Criteria:

- [x] `draft ""`（commander 已拦） + `draft " "` + `draft "d"` + `draft "test"` + `draft "asdf"` + `draft "xxx"` 在 `cmdDraftMission` 入口被拦下：打印 reason + hint、`process.exitCode === 1`、**不**进 Stage 1、**不**写 brief / roadmap / mission.json、**`cmdDraftMission` 不调 `writeDraftState`**（即 `main.js:281-290` 的 running re-affirm 块**未被执行**——校验早于该块）。
- [x] `draft "add audit count"` 等合法描述正常进 Stage 1（行为同旧）。
- [x] `missions/base.json` 加 `draft.minDescLength: 8` 时，阈值生效（`"add x"` 被拦、`"add audit count"` 通过）；删去该字段回退默认 4；写 `"garbage"`（字符串）或 `null` 时也回退默认 4（兜底）；删除整个 base.json 文件或写入非法 JSON 时，try/catch 兜底为 `{}`，回退默认 4（不抛错）。（backed by `draft-desc-validate.test.js` Cases D1 / D2 / D3 as of mdr-remediate-4 H3 — full coverage of all 3 sub-cases enumerated above: D1 distinguishing threshold-8 case with `"add xy"` (len 6, passes default-4 but fails configured-8); D2 garbage-string fallback returning to default 4; D3 null fallback returning to default 4. The file-deleted / invalid-JSON sub-cases share the same `JSON.parse` failure path indirectly exercised by D2's garbage test via the `catch {}` block at `main.js:344-348`.)
- [x] `docs/logs/` 更新（按 AGENTS.md）。

### Phase 2 - 单元测试

Status: completed
Targets: `tools/mission-driver/test/draft-desc-validate.test.js`（新增）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1 完成

- [x] Add: 新增 `test/draft-desc-validate.test.js`，沿用 `draft-brief.test.js` 的 `__setRunnerFactoryForTest` 范式（注入 mock runner，断言"是否进 Stage 1"）。覆盖：
      - 用例 A（纯函数层）：直接 `import { validateDraftDesc } from "../src/main.js"`（Phase 1 已 export），断言：
        - `validateDraftDesc("")` → `ok: false, reason 含 "empty"`。
        - `validateDraftDesc("   ")` → `ok: false, reason 含 "empty"`。
        - `validateDraftDesc("d")` → `ok: false, reason 含 "too short"`。
        - `validateDraftDesc("test")` / `"asdf"` / `"xxx"` / `"TODO"` / `"N/A"` → `ok: false, reason 含 "placeholder"`。
        - `validateDraftDesc("add audit count")` → `ok: true`。
        - `validateDraftDesc("add", 8)` → `ok: false, reason 含 "too short"`（阈值覆盖生效）。
        - `validateDraftDesc("add audit count", "garbage")` → `ok: true`（非有限数 → 回退默认 4）。
        - `validateDraftDesc("ad", "garbage")` → `ok: false, reason 含 "too short"`（并行锁住：非有限数时回退**默认 4**，而非无限制—— `"ad"` 长度 2 < 4 被拦）。
      - 用例 B1（cmdDraftMission 集成层，**非 draftJobDir 路径**）：用 `__setRunnerFactoryForTest` 注入 mock runner，调用 `cmdDraftMission("d", { dir: tmpDir /* 不传 draftJobDir */ })`，断言：
        - mock runner 的 `runAgent` **未被调用**（Stage 1 没跑）。
        - `process.exitCode === 1`（测试里手动 reset `process.exitCode = undefined` 后再调用）。
        - stderr 含 `[DRAFT VALIDATION]` + reason + hint（捕获 `console.error`）。
      - 用例 B2（cmdDraftMission 集成层，**draftJobDir 路径**）：调用 `cmdDraftMission("d", { dir: tmpDir, draftJobDir: "sub/dj" })`，断言：
        - mock runner 的 `runAgent` **未被调用**。
        - `process.exitCode === 1`。
        - **`draft-state.json` 不含 `cmdDraftMission` 写的 `status: "running"` re-affirm**——因为校验在 re-affirm 块（`main.js:281-290`）之前 return。具体断言：读 `<tmpDir>/sub/dj/draft-state.json`，若文件存在（monitor startDraftJob 在测试里没跑，文件可能不存在），其内容**不是** `{status:"running", desc:"d", ...}`；若不存在更优（说明 cmdDraftMission 没写）。
      - 用例 C（cmdDraftMission 合法路径不回归）：调用 `cmdDraftMission("add audit count", { dir: tmpDir, skipBrief: true })`，断言 mock runner 的 `runAgent` 被调用过（Stage 2 跑了；skipBrief 绕过 Stage 1 简化测试）。
      - Skill: none
- [x] Proof: 运行 `pnpm --prefix tools/mission-driver test`，确认新测试全绿且不破坏 `draft-brief.test.js` / `draft-job.test.js` / `draft-plans-audit-gate.test.js` 等现有套件。
      - Skill: none

Exit Criteria:

- [x] `test/draft-desc-validate.test.js` 用例 A/B1/B2/C 全部通过。
- [x] `pnpm --prefix tools/mission-driver test` 整体绿（含现有套件）。
- [x] `docs/logs/` 更新。

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (task `ses_07d96f0e7ffeCmGdKgH0FLcxhf`) 因为三处阻塞性问题：(1) 配置读取路径不可行——`resolveConfig` 的 draft 分支（`config.js:428-455`）早 return、不读 base.json，`config.draft?.minDescLength` 永远 undefined；(2) 校验位置窗口（"resolveConfig 之前或之后"）包含 `main.js:281-290` 的 running re-affirm 之后的位置，会让 rejected desc 已先被写成 running 状态；(3) `export` 决策 waffle（"若 main.js 未 export，则...优选 export"）违反 Anti-Slacking。
- Iteration 1 revision: 配置路径改为方案 (a) `loadMission(base.json)`；校验位置钉死在 `main.js:281` running re-affirm 块**之前**；commit 到 `export function validateDraftDesc`，删去 waffle。用例 B 拆为 B1（无 draftJobDir）+ B2（有 draftJobDir，断言 `cmdDraftMission` 未写 running re-affirm）；用例 A 加 `("ad", "garbage")` 并行断言锁住"非有限数回退默认 4"。Phase 1 Item Types 改为 `Add | Decision | Fix`。
- Independent draft review iteration 2: `needs revision` (task `ses_07d84e085ffe1UuRHqI0bMi4ej) 发现 iteration 1 的方案 (a) `loadMission(base.json)` **不可行**——`loadMission` 内部调 `validateMission`（`mission-check.mjs:99`），后者强制 `REQUIRED_FIELDS`，而 base.json 故意只有 `commands` 等共享字段（无 `name/roadmapPath/plansDir`），所以 `loadMission(base.json)` 永远抛 `Invalid mission`；plan 的 `try/catch` 会吞错 → `baseConfig` 永远 `{}` → 配置实际上不生效（dead-code 风险）。同时确认 `monitor.js:693-716 handleGetBaseConfig` 正是为此绕过 `loadMission` 自己 JSON.parse。
- Iteration 2 revision: 配置路径改为直接 `JSON.parse(readFileSync(base.json))`（不走 `loadMission`），镜像 `monitor.js:693-716` 的既有范式。base.local.json 不读（CONTEXT.md 明确它是 sourcePaths 个人覆盖、不承载仓库级字段）。Decision 增加备选 2/3 显式否决，并在 Current Baseline 增加"`loadMission` 也不能读 base.json"的说明。Exit Criteria 增加"删除 base.json / 非法 JSON 时 try/catch 兜底回退默认 4"。
- Independent draft review iteration 3: `accept` (task `ses_07d7bf2c1ffeDtqLsvVslUmi38`) — Round 2 blocker（`loadMission` 不能读 base.json）已解决：配置路径改为直接 `JSON.parse(readFileSync(base.json))`，镜像 `monitor.js:693-716 handleGetBaseConfig`；Decision 显式否决 4 个备选（含把 Round 2 的 try/catch-swallow dead-code 风险记为 Alternative 2 否决理由）；Exit Criteria 覆盖阈值生效 / 字段缺失 / 类型错 / 文件缺失四档兜底；Round 1 Blocker 2（validation 在 `:281` re-affirm 之前）未回归。Baseline 与 live code 一致，无新阻塞。共识达成，Plan Status → active。

## Closure Gates

- [x] in-scope behavior is complete（validateDraftDesc 函数 + 入口校验 + 阈值配置 + 测试）
- [x] relevant docs are aligned（设计文档 §4.1 已是 owner doc，无需改文案；本 plan 闭合时在日志记录"已落地"，No owner-doc update required）
- [x] verification has run（`pnpm --prefix tools/mission-driver test`；手动跑 `node src/main.js draft "d"` 确认被拦下）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### monitor draft-job UI 在 draft desc 校验失败时的状态机对齐

- Classification: `watch-only residual`
- Why Not Blocking Closure: 本 plan 保证"校验失败时不写 draft-state.json"，避免把垃圾 desc 持久化。但 monitor 的 startDraftJob 在 spawn `draft` 进程之前已先写了一份 initial running draft-state.json——若 draft 子进程 exit 1，monitor 是否感知并把 draft-state 转为 failed，是 monitor 状态机问题，不属 WI1 校验本身。
- Successor Required: no — underlying gap closed by mdr-remediate-3 (`docs/plans/mission-driver-draft-robustness/2026-07-21-1005-3-stuck-running-draft-state-remediation.md`); the WI1 reject branch now writes `{status: "failed", phase: "rejected", endedAt, error}` to `draft-state.json` before exit, so the state machine no longer lies about being `running`. UI rendering of `failed` / `rejected` status (cosmetic distinction from `running` text) is a watch-only residual tracked in `docs/backlog/mission-driver-draft-robustness-roadmap.md` "Follow-up backlog" (trigger for promotion: user feedback that `failed` text is misread as `running`).

### 占位黑名单的可扩展性（`--strict` / 自定义黑名单）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: WI1 范围是固定黑名单 + 长度阈值；未来如需仓库级自定义（base.json `draft.blocklist`）或 `--strict` 模式，由后续 plan 承接。
- Successor Required: no

## Closure

Status Note: WI1 已落地——`cmdDraftMission` 入口在 Stage 1 之前 / `:281` running re-affirm 块之前钉了一段确定性 desc 校验（空 / 占位 / 过短三段式），rejected desc 走 `runner.close()` + `process.exitCode = 1` + return，绝不进 Stage 1、绝不写 `draft-state.json` running re-affirm。阈值默认 4，经 `base.json` 的 `draft.minDescLength` 可覆盖；读取路径直接 `JSON.parse(readFileSync(base.json))`（镜像 `monitor.js handleGetBaseConfig` 既有范式，绕开 `loadMission` 对 base.json 必填字段的拒绝）；非有限数 / 文件缺失 / 非法 JSON 全部兜底回退默认 4。相对设计 §4.1 的两处可控偏差：(1) 占位检查移到长度检查之前（设计 §4.1 的 `empty→length→placeholder` 顺序让 3 字符占位词 `xxx`/`foo`/`bar`/`n/a` 永远不可达——它们先撞 length<4 兜底，黑名单形同虚设；本 plan 的 Case A 测试明确要求这些占位词命中 `placeholder` reason，故调换顺序，让黑名单真正生效，且 `placeholder` 是比 `too short` 更 actionable 的拒绝原因）；(2) `minLen` 接受非有限数时回退默认 4（防御 base.json 写错类型）。Phase 2 测试覆盖纯函数层 7 例（含阈值覆盖 + 非有限数兜底）+ 集成层 3 例（B1 无 draftJobDir / B2 有 draftJobDir / C 合法路径不回归）。

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay closure pass（无第二 reviewer / subagent 可用）。本 plan 非保护区域（无 API / DB / auth / integration / deployment 契约变更；draft 命令前置校验 + 单个 base.json 配置字段），非高风险，符合 `AGENTS.md` Reviewer-Availability Fallback 条件。closure 记录使用 solo fallback。
- Cold-replay 自检：
  - 针对本 plan：所有 `[x]` Phase items 与 Closure Gates 与代码 diff 三向对齐；Plan Status / Phase Status / Exit Criteria 全部一致；Deferred 项（monitor draft-job 状态机对齐 / 黑名单可扩展性）已在 plan 内显式 adjudicated，不在 closure 范围。
  - 针对关联 docs：设计文档 §4.1（owner doc）保留 empty→length→placeholder 顺序——本 plan 的 empty→placeholder→length 偏差已在函数 JSDoc 与 closure Status Note 显式记录理由（让 3 字符占位词黑名单生效），未改动 owner doc 文案（plan 决策"No owner-doc update required"仍成立，偏差已自我记录在代码注释中）。
  - 针对真实 diff：`tools/mission-driver/src/main.js` 加 1 个 export 函数（`validateDraftDesc`）+ 1 段入口校验（5 行 + 注释）；`tools/mission-driver/test/draft-desc-validate.test.js` 新增 10 个 test；`tools/mission-driver/test/draft-brief.test.js` 1 处描述由 `"x"`（旧 placeholder）改为 `"fail draft"`（旧测试用了 WI1 现在会拦的描述，符合预期的回归调整）。
  - 针对真验证命令：`pnpm --prefix tools/mission-driver test` → 486 pass / 0 fail；`pnpm --prefix tools/mission-driver/web run typecheck` clean；`pnpm --prefix tools/mission-driver/web run build` built；`pnpm --prefix tools/mission-driver run lint:prompts` OK。手动验证：`node src/main.js draft "d"` / `"test"` / `"xxx"` → 均 exit 1 + reason + hint。
- Evidence: 本 plan（Status: completed / Phase 1+2 [x] / Closure Gates [x]）、`main.js` 函数体与入口 hook、`test/draft-desc-validate.test.js` 10 例、`docs/logs/2026/07-21.md` 新增条目、`docs/backlog/mission-driver-draft-robustness-roadmap.md` WI1 → `done`。
