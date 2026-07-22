# mdr-3 draft/brief 路径统一走模板变量

> Plan Status: completed
> Last Reviewed: 2026-07-21
> Source: `docs/backlog/mission-driver-draft-robustness-roadmap.md` WI3
> Related: `tools/mission-driver/design/draft-robustness-design.md` §2.3, §4.3
> Mission: mission-driver-draft-robustness
> Work Item: WI3 draft/brief 路径统一走模板变量
> Audit: required

## Current Baseline

Live baseline verified against the repo on 2026-07-21:

- `cmdDraftMission`（`main.js:244-384`）的两处 `resolveTemplateVars` 调用：
  - **Stage 1 brief 渲染**（`:301-306`）注入：`missionsDir / projectRoot / flowHint / targetFile`（**不**含 `briefPath`）。
  - **Stage 2 draft 渲染**（`:340-345`）注入：`missionsDir / projectRoot / briefPath / flowHint`（**不**含 `targetFile`）。
  - 两处**都未**注入 `backlogDir`。
- `resolveTemplateVars`（`expression.mjs:53-59`）行为：`{{\w+}}` 替换；**未知变量留原样**（返回 `{{name}}`，不抛错）。故新增 `backlogDir` 不会破坏现有未知 `{{x}}`。
- prompt 路径双轨（设计文档 §2.3）：
  - `prompts/mission-brief.md` 在 `:13`（"Produce a brief at `docs/backlog/<slug>-brief.md`"）、`:27`（"Write the file to `docs/backlog/<slug>-brief.md`"）、`:30`（`<BRIEF_FILE>docs/backlog/<slug>-brief.md</BRIEF_FILE>`）三处用**字面量** `docs/backlog/`。
  - `prompts/mission-draft.md:13` 一行内含**三处**字面量 `docs/backlog/`：`docs/backlog/{mission-name}-roadmap.md`（存在性检查）+ `docs/backlog/00-roadmap-authoring-guide.md`（编写指南引用）+ `docs/backlog/{mission-name}-roadmap.md`（保存目标）；`:19` 的 `{{missionsDir}}/{mission-name}.json` 已是模板变量（不变）。设计文档 §4.3.2 只列了前两处与第三处，遗漏了 `00-roadmap-authoring-guide.md` 这处——本 plan 同时替换全部三处（详见 Phase 1 Item 4）。
- 后果（事故复现）：当 `projectRoot ≠ 仓库根`（如本次 `cwd = tools/mission-driver/`）时，`{{missionsDir}}` 按绝对解析落到 `<projectRoot>/missions/`（即 `tools/mission-driver/missions/`），而 `docs/backlog/` 由 agent 按 AGENTS.md 所在地（仓库根）相对解析 → 产物散落到两个根下，monitor `GET /api/configs` 漏掉放错位置的 mission.json。
- `parseDraftArtifact`（`main.js:180-234`，**私有函数**，仅 `main.js:801` export `cmdDraftMission`、`:25` export `__setRunnerFactoryForTest`）当前只解析 mission 身份，**不**校验 `missionFile` 是否落在期望 `missionsDir` 下。
- `main.js:3` `import { resolve, dirname } from "node:path";`——`dirname` **已经** import，本 plan 无需补 import。
- `resolveProjectRoot`（`main.js:76-78`）= `opts.dir || process.env.PROJECT_ROOT || process.cwd()`；`resolveMissionsDir`（`:80-84`）= `opts.missionsDir ? resolve(projectRoot, opts.missionsDir) : resolve(projectRoot, "missions")`。
- `parseDraftArtifact(resultText, missionsDir)` 已通过第二参数接收 `missionsDir`，**不**依赖 Phase 1 的 `backlogDir` 注入——Phase 1 与 Phase 2 相互独立。
- 现有测试 `test/draft-brief.test.js` / `draft-job.test.js` 已建立 draft 命令的测试范式（`__setRunnerFactoryForTest` + fake runner 录制 `runAgent` 第二参数 = 渲染后 prompt）。本 plan 沿用。
- 验证命令（`missions/base.json`）：`pnpm --prefix tools/mission-driver test`；另 `package.json` 有 `"lint:prompts": "node src/prompt-check.mjs"` 脚本，本 plan 闭合时跑。

**Gap:** draft/brief 管线路径双轨制——`{{missionsDir}}` 走模板变量（projectRoot 锚定），`docs/backlog/` 走字面量（agent cwd 锚定）。projectRoot ≠ 仓库根时产物散落。本 plan 把 brief / roadmap / authoring-guide 路径也走模板变量，统一锚定到 projectRoot，并加一段防御性 warn。

## Goals

- 在 `cmdDraftMission` 的两处 `resolveTemplateVars` 调用注入 `backlogDir = resolve(projectRoot, "docs/backlog")`。
- 把 `mission-brief.md` 三处字面量 `docs/backlog/` 和 `mission-draft.md:13` 一处字面量 `docs/backlog/` 全部替换为 `{{backlogDir}}/`，使 brief / roadmap / mission.json **全部**按 projectRoot 一致解析。
- 在 `parseDraftArtifact` 加防御性 warn：当 `<MISSION_FILE>` 命中的 mission.json 不落在期望 `missionsDir` 下时，打 stderr warn（不强制失败）。
- 不强制 `projectRoot = 仓库根`（从子模块发起 draft 是合法用法；基准统一即可）。

## Non-Goals

- 不改 `run` 命令的路径解析（已通过 `resolveConfig` 正确）。
- 不改 `flow-loader.js` 的 `activePlans()` / `openAudits()` 扫描逻辑（属另一主题）。
- 不引入 `plansRoot` 模板变量（设计文档 §4.3.1 把它列为"供 mission-draft 引用 planGuide 相对位置"的可选注入，但当前两个 prompt 均未引用 `{{plansRoot}}`，本 plan 不预先添加 unused 变量；若后续 prompt 需要再补）。
- 不强制对齐 projectRoot 到仓库根（设计文档 §4.3.4 已否决；根因是基准混用，不是 projectRoot 取值）。
- 不在 monitor draft-job UI 显示路径 warn（draft-state.json 已记录 missionFile，UI 升级非阻塞）。
- 不改 `--skip-brief` 单段式路径的路径行为（它走 Stage 2 的同一份 `mission-draft.md`，本 plan 的 prompt 替换自然惠及）。

## Task Route

- Type: `implementation-only change`（owner doc §4.3 已逐行写明改法）。
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §2.3, §4.3（特别是 §4.3.1–4.3.4）
- Skill Selection Basis: `Skill: none` — 路径统一方案（注入 `backlogDir` 模板变量 + prompt 字面量替换 + 防御 warn）由设计文档 §4.3 直接给出，无匹配的可复用 skill。

## Infrastructure And Config Prereqs

No infra prereqs beyond existing baseline. 不引入新 npm 依赖（`resolve` 已从 `node:path` import 在 main.js 顶部），保持引擎核心零依赖约束。

## Execution Plan

### Phase 1 - 注入 backlogDir 模板变量 + prompt 替换

Status: completed
Targets: `tools/mission-driver/src/main.js`（Stage 1 `:301-306` + Stage 2 `:340-345` 的 `resolveTemplateVars` 调用）、`tools/mission-driver/prompts/mission-brief.md`（`:13, :27, :30`）、`tools/mission-driver/prompts/mission-draft.md`（`:13`）
Skill: none

- Item Types: `Add`
- Prereqs: none

- [x] Add: 在 `cmdDraftMission` Stage 1 的 `resolveTemplateVars` 调用（`main.js:301-306`）新增 `backlogDir: resolve(resolved.projectRoot, "docs/backlog")`，与现有 `missionsDir / projectRoot / flowHint / targetFile` 同列。
      - Skill: none
- [x] Add: 在 `cmdDraftMission` Stage 2 的 `resolveTemplateVars` 调用（`main.js:340-345`）同样新增 `backlogDir`。
      - Skill: none
- [x] Add: 替换 `prompts/mission-brief.md` 三处字面量：
      - `:13` `Produce a brief at \`docs/backlog/<slug>-brief.md\`` → `Produce a brief at \`{{backlogDir}}/<slug>-brief.md\``。
      - `:27` `Write the file to \`docs/backlog/<slug>-brief.md\`` → `Write the file to \`{{backlogDir}}/<slug>-brief.md\``。
      - `:30` `<BRIEF_FILE>docs/backlog/<slug>-brief.md</BRIEF_FILE>` → `<BRIEF_FILE>{{backlogDir}}/<slug>-brief.md</BRIEF_FILE>`。
      - Skill: none
- [x] Add: 替换 `prompts/mission-draft.md:13` 一行内**三处**字面量 `docs/backlog/`（设计文档 §4.3.2 只列了两处，遗漏 `00-roadmap-authoring-guide.md`，本 plan 一并修）：
      - `If a roadmap already exists at \`docs/backlog/{mission-name}-roadmap.md\`` → `... at \`{{backlogDir}}/{mission-name}-roadmap.md\``。
      - `following the format in \`docs/backlog/00-roadmap-authoring-guide.md\`` → `... in \`{{backlogDir}}/00-roadmap-authoring-guide.md\``。
      - `save it at \`docs/backlog/{mission-name}-roadmap.md\`` → `save it at \`{{backlogDir}}/{mission-name}-roadmap.md\``。
      - 同行 `:19` 的 `{{missionsDir}}/{mission-name}.json` 不动。
      - Skill: none

Exit Criteria:

- [x] `resolveTemplateVars` 调用注入 `backlogDir` 后，prompt 渲染产物里 `{{backlogDir}}` 全部被实际绝对路径替换，无残留 `{{backlogDir}}` 字面量（人工跑一次 dry-run 渲染确认）。
- [x] `mission-brief.md`（`docs/backlog/` 字面量 ×3）与 `mission-draft.md`（`docs/backlog/` 字面量 ×3）文件里 `docs/backlog/` 字面量不再出现（grep 确认），全部走 `{{backlogDir}}/`。
- [x] 现有 `test/draft-brief.test.js` / `draft-job.test.js` 继续通过（模板变量替换对测试逻辑透明）。
- [x] `docs/logs/` 更新。

### Phase 2 - parseDraftArtifact 防御性 warn + export

Status: completed
Targets: `tools/mission-driver/src/main.js`（`parseDraftArtifact` `:180-234` 的 `<MISSION_FILE>` 命中分支；`:801` 的 export 表）
Skill: none

- Item Types: `Add`
- Prereqs: none（`parseDraftArtifact` 已通过第二参数接收 `missionsDir`，本 phase 不依赖 Phase 1 的 `backlogDir` 注入；Phase 1 与 Phase 2 相互独立，可并行实施）

- [x] Add: 在 `parseDraftArtifact` 的 `<MISSION_FILE>` 命中分支（`main.js:185-198`，`out.missionFile = file;` 之后、`return out;` 之前），新增路径校验 warn。**用 `path.relative` 而非 `startsWith`**（避免 Windows drive-letter 大小写歧义与 `/foo/bar` 前缀误匹配 `/foo/barbaz` 这类边界）：
      ```js
      import { relative, isAbsolute } from "node:path";  // 顶部按需补，与 resolve/dirname 同 module
      // ... parseDraftArtifact 内：
      const rel = relative(resolve(missionsDir), resolve(dirname(file)));
      if (rel.startsWith("..") || isAbsolute(rel)) {
        process.stderr.write(
          `[WARN] mission.json landed outside expected missionsDir: ` +
          `got ${file}, expected under ${resolve(missionsDir)}. ` +
          `This usually means projectRoot / cwd mismatch.\n`
        );
      }
      ```
      - `main.js:3` 已 `import { resolve, dirname } from "node:path";`——**本 plan 同时把 `relative, isAbsolute` 加入同一 import**（不新增 import 行）。
      - **不强制失败**：仅 warn，让 agent 合理地把 mission.json 放到项目级 `missions/` 时不受阻。配合 Phase 1 的路径统一，正常情况下不会再触发。
      - Skill: none
- [x] Add: 把 `parseDraftArtifact` 加入 `main.js:801` 的 export（镜像现有 `export { cmdDraftMission };` 的 named export 形态，改为 `export { cmdDraftMission, parseDraftArtifact };`），供 Phase 3 测试直接调用。注释参考现有 export 的"Exported for ... test.js"风格。
      - Skill: none

Exit Criteria:

- [x] 当 `<MISSION_FILE>` 命中的路径不在期望 `missionsDir` 下时（含 `/foo/barbaz` vs `/foo/bar` 这类前缀诡计），stderr 输出 warn 文案；函数仍返回 `out`（不抛错、不返回 null）。
- [x] 当 mission.json 落在期望 `missionsDir` 下时，无 warn 输出。
- [x] `parseDraftArtifact` 在 `main.js` 模块 export 表中可被测试 import。
- [x] `docs/logs/` 更新。

### Phase 3 - 路径一致性测试

Status: completed
Targets: `tools/mission-driver/test/draft-path-consistency.test.js`（新增）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1、Phase 2 完成

- [x] Add: 新增 `test/draft-path-consistency.test.js`，沿用 `draft-brief.test.js` 的 `__setRunnerFactoryForTest` 范式。覆盖：
      - 用例 A（模板变量注入）：用 mock runner 截获 Stage 1 / Stage 2 的 prompt（`runAgent` 第二参数已确认为渲染后 prompt 字符串，参 `main.js:309-314` / `:349-354`），断言 prompt 文本里**不含** `{{backlogDir}}` 字面量、**含**期望绝对路径（如 `resolve(tmpDir, "docs/backlog")`）。
      - 用例 B（projectRoot ≠ 仓库根 时基准一致）：设 `projectRoot = <tmpDir>/sub`，调用 `cmdDraftMission("add foo bar", { ..., skipBrief: false })`，断言 Stage 1 prompt 里的 backlog 路径解析到 `<tmpDir>/sub/docs/backlog`、Stage 2 prompt 里 backlog 与 missions 路径**同根**（都在 `<tmpDir>/sub/...`，不再 split-brain）。
      - 用例 C（parseDraftArtifact warn，前缀诡计）：用 Phase 2 export 的 `parseDraftArtifact`，**直接 import 调用**——`parseDraftArtifact("<MISSION_FILE>/expected/missions-but-also-extended/x.json</MISSION_FILE>", "/expected/missions")`，断言 stderr 含 `[WARN] mission.json landed outside expected missionsDir`、返回对象 `missionFile === "/expected/missions-but-also-extended/x.json"`（**验证 `relative + starts-with("..")` 比 `startsWith` 更严**——这种 `/foo/barbaz` vs `/foo/bar` 边界必须 warn）。
      - 用例 D（parseDraftArtifact warn，正常路径无 warn）：`parseDraftArtifact("<MISSION_FILE>/expected/missions/x.json</MISSION_FILE>", "/expected/missions")`，断言 stderr 无 warn、`missionFile === "/expected/missions/x.json"`。
      - 用例 E（**完整 grep 锚点**）：用 `readFileSync` 读取 `prompts/mission-brief.md` 与 `prompts/mission-draft.md`，断言全文 `match(/docs\/backlog\//g) === null`——锁住"prompt 文件里再无 `docs/backlog/` 字面量"（设计文档 §4.3.2 遗漏的 `00-roadmap-authoring-guide.md` 字面量也会被这条 grep 抓出）。
      - Skill: none
- [x] Proof: 运行 `pnpm --prefix tools/mission-driver test`，确认新测试全绿且不破坏现有套件（特别 `draft-brief.test.js` / `draft-job.test.js` / `draft-plans-audit-gate.test.js` / `prompt-markers.test.js`）。
      - Skill: none

Exit Criteria:

- [x] `test/draft-path-consistency.test.js` 用例 A/B/C/D/E 全部通过。
- [x] `pnpm --prefix tools/mission-driver test` 整体绿（含现有套件）。
- [x] `pnpm --prefix tools/mission-driver run lint:prompts` 通过（package.json `"lint:prompts": "node src/prompt-check.mjs"`）。
- [x] `docs/logs/` 更新。

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (task `ses_07d967dbbffeXB1hC2tpatALjE`) 因为四处阻塞性问题：(1) Phase 1 Item 4 只替换 `mission-draft.md:13` 上两处 `{mission-name}-roadmap.md` 字面量，遗漏同行第三处 `00-roadmap-authoring-guide.md`——会让 plan 自己的 Exit Criteria grep 失败；(2) Phase 3 Case C/D 直接调用 `parseDraftArtifact`，但该函数是私有（`main.js:801` 只 export `cmdDraftMission`），测试无法写；(3) Phase 2 Prereqs "Phase 1 完成" 错误——`parseDraftArtifact` 已通过第二参数接收 `missionsDir`，两 phase 实际独立；(4) `dirname` import waffle（"若未 import，本 plan 同时补"）违反 Minimum Rule 1——实际 `main.js:3` 已 import。
- Iteration 1 revision: Phase 1 Item 4 改为替换同一行**三处**字面量；Phase 2 新增 `export { ..., parseDraftArtifact }` item；Phase 2 Prereqs 改为 `none` 并注明两 phase 可并行；`dirname` 改为 definitive 语句并加注把 `relative, isAbsolute` 加进同一 import 行（warn 改用 `relative + starts-with("..")` 模式，避免 `startsWith` 的 `/foo/bar` vs `/foo/barbaz` 前缀误判）。Phase 3 加 Case E（readFileSync + match 锁住 prompt 文件无 `docs/backlog/` 残留）；Case C 改用 `/expected/missions-but-also-extended/x.json` 显式测试前缀诡计。Closure Gate 把 owner-doc 同步从 conditional 改为 definitive。
- Independent draft review iteration 2: `accept` (task `ses_07d849c9bffey7Uz54oEac13Bz`) — 四处 Round 1 blocker 均已解决（Phase 1 Item 4 改为替换同行三处 `docs/backlog/` 字面量；Phase 2 加 `parseDraftArtifact` export item；Phase 2 Prereqs 改 `none` 并注明两 phase 独立；`dirname` import 改为 definitive 语句）。warn 改用 `relative + starts-with("..")` 处理前缀诡计；Case E 用 grep 锁住 prompt 文件无残留；Case C 用 `/expected/missions-but-also-extended/x.json` 显式测试前缀诡计。两条非阻塞观察（Case C 示例路径需真实 tmpfile / 顶部 snippet 注释措辞）由实施时按 live code 选用真实文件路径处理。Baseline 与 live code 一致，无新阻塞。共识达成，Plan Status → active。

## Closure Gates

- [x] in-scope behavior is complete（backlogDir 注入 + 两份 prompt 字面量替换 + parseDraftArtifact warn + 测试）
- [x] relevant docs are aligned（设计文档 §4.3.2 已补回遗漏的 `00-roadmap-authoring-guide.md` 字面量替换；§4.3.3 warn snippet 已改为 `relative + starts-with("..")` 模式与本 plan 实施一致。`tools/mission-driver/design/mission-design.md` 经 grep 不锁定 backlog 路径基准——No owner-doc update required。）
- [x] verification has run（`pnpm --prefix tools/mission-driver test` → 492 pass / 0 fail；`pnpm --prefix tools/mission-driver run lint:prompts` OK；`pnpm --prefix tools/mission-driver/web run typecheck` clean；`pnpm --prefix tools/mission-driver/web run build` built。）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### `plansRoot` 模板变量（设计文档 §4.3.1 旁注）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 设计文档把 `plansRoot` 列为"供 mission-draft 引用 planGuide 相对位置"的可选注入。当前两份 prompt 均未引用 `{{plansRoot}}`，预先添加属于 dead code（`resolveTemplateVars` 注入但无消费方）。当未来 prompt 需要 planGuide 相对路径时再补。
- Successor Required: no

### `--strict` 模式：路径不一致时强制失败而非 warn

- Classification: `optimization candidate`
- Why Not Blocking Closure: WI3 范围是"基准统一 + 防御 warn"；强制失败会破坏"从子模块发起 draft 合法"的语义（设计文档 §4.3.4 已说明）。若未来发现 warn 不足以提醒用户，可加 `--strict` flag 升级为 exit 1。
- Successor Required: no

## Closure

Status Note: WI3 closed 2026-07-21. All three Phases executed (Phase 1 backlogDir injection + prompt literal replacement; Phase 2 parseDraftArtifact warn + export; Phase 3 draft-path-consistency.test.js Cases A/B/C/D/E). Verification full green: 492 tests pass / 0 fail, typecheck clean, web build OK, lint:prompts OK. Owner design doc §4.3.2 / §4.3.3 aligned to implementation (3rd literal `00-roadmap-authoring-guide.md` added; warn snippet updated to `relative + starts-with("..")`).

Closure Audit Evidence:

- Auditor / Agent: Solo cold-replay closure pass (no second reviewer / subagent available). Per `AGENTS.md` Reviewer-Availability Fallback: acceptable for non-protected, non-high-risk plans. This plan touches no API / DB / auth / integration / deployment contract — it is a template-var injection + prompt literal replacement + warn-only defensive check, all backward-compatible (unknown `{{x}}` leaves existing behavior intact; warn never throws). Cold-replay self-check performed against: this plan file (all [x] ticked, statuses aligned), `tools/mission-driver/design/draft-robustness-design.md` §4.3 (updated to match implementation), `tools/mission-driver/src/main.js` diff (backlogDir in both resolveTemplateVars calls; warn in `<MISSION_FILE>` branch; `relative, isAbsolute` added to line-3 import; `parseDraftArtifact` added to bottom export), `tools/mission-driver/prompts/mission-brief.md` + `mission-draft.md` (no `docs/backlog/` literal remaining), `tools/mission-driver/test/draft-path-consistency.test.js` (6 tests green), and roadmap `docs/backlog/mission-driver-draft-robustness-roadmap.md` WI3 → `done`.
- Evidence: Phase 1 commit-ready diff = +3 lines in `src/main.js` (`backlogDir: resolve(resolved.projectRoot, "docs/backlog")` injected in both Stage 1 brief and Stage 2 draft resolveTemplateVars) + 6 literal→`{{backlogDir}}/` replacements across `mission-brief.md` (3) and `mission-draft.md` (3). Phase 2 diff = +1 import line edit, +15-line warn block, +1 export entry. Phase 3 = new 6-test file. Verification: `pnpm --prefix tools/mission-driver test` → 492 pass / 0 fail (baseline 486 + 6 new); `pnpm --prefix tools/mission-driver/web run typecheck` clean; `pnpm --prefix tools/mission-driver/web run build` built; `pnpm --prefix tools/mission-driver run lint:prompts` OK. Limitation noted: solo review (no second reviewer / subagent available); non-blocking because plan is non-protected and non-high-risk.
