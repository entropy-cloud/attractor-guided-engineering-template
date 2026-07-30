# mdr-audit-fix-1 Surface `commands.check` + CHECK semantics across mission-creation doc surfaces

> Plan Status: completed
> Last Reviewed: 2026-07-30
> Source: `docs/audits/mission-driver-actionable-fixes/2026-07-29-1620-open-audit-mission-driver-actionable-fixes.md` [P1] finding (commands.check invisible in generation template + `extends` shallow-merge drops base default)
> Related: `2026-07-29-1221-3-check-configurable-gate.md` (mdr-fix-3 shipped the feature this plan makes discoverable); `2026-07-29-1620-1-draft-description-directory-support.md` (mdr-fix-4 precedent for bundling user-manual alignment when a generation/CLI surface is restated)
> Audit: required

## Current Baseline

Live-state inventory (read from repo, not memory; every line citation verified against actual code):

**The shipped feature (mdr-fix-3, working but undiscoverable through doc surfaces):**

- `missions/base.json:10` ships `"check": ""` as the shared default — the whole point of mdr-fix-3 was to let each project configure a deterministic-state gate command (per analysis #3: "对于 Java 项目，配置 mvn build 之类的"). `extends: "base"` missions inherit this.
- `tools/mission-driver/src/main.js:700` `checkCmd: g.commands.check || ""` handles the missing key gracefully (`undefined || ""` → git-status fallback), so there is no crash when the key is absent.
- `tools/mission-driver/prompts/health-check.md:7-16` runs `{{checkCmd}}` when configured; falls back to git conflict-marker detection when empty/missing. Emits `pass` / `needs_fix` / `fail`. Explicitly says "Do NOT run `commands.test` — that is BUILD_VERIFY's job" (`:16`).
- `tools/mission-driver/src/mission-check.mjs:48` `resolveExtends` does a **shallow** merge (`{ ...resolved, ...localOverrides, ...missionRest }`); `CONTEXT.md` "关键约束" confirms nested objects like `commands` are wholly replaced, not deep-merged. So a generated mission that sets its own `commands` **drops `base.json`'s `check` key entirely** — not even the empty-string default survives.

**The drift — `commands.check` invisible in every mission-creation doc surface (all from mdr-fix-3's closure missing these surfaces):**

- `tools/mission-driver/prompts/mission-draft.md:39-44` — the `commands` JSON example shown to the `draft` agent lists only `test` / `build` / `lint` / `typecheck`. No `check`. (Full-text search: the only "check" substring in the file is inside `typecheck`.) This is the **[P1] core**: the agent that generates mission.json is never told `check` exists, so generated missions never set it, and `extends` shallow-merge then drops even the `base.json` empty default if the agent customizes `commands` (which the template tells it to do).
- `tools/mission-driver/prompts/mission-draft.md:53-58` — the Notes section documents `plansDir`, `flowName`, `moduleDir`, `prompts.multiAudit/openAudit`, `commitFormat`, but says nothing about `check` / `commands.check`.
- `tools/mission-driver/docs/user-manual.en.md`:
  - `:128-133` quickstart mission.json `commands` example — omits `check`.
  - `:301` CHECK step row: "Health check: run tests/build/lint, confirm baseline is green." + output markers `pass` / `fail` — **factually wrong post-mdr-fix-3**: CHECK runs `commands.check` (or git-status fallback), NOT tests/build/lint; and it can also emit `needs_fix`.
  - `:420-425` full mission.json reference `commands` example — omits `check`.
  - `:447` base.json example `"commands": { "test": "...", "build": "..." }` — illustrative shorthand using `...` ellipsis (implies further keys); no literal `check`, but the ellipsis already covers it, so not a real drift target.
- `tools/mission-driver/docs/user-manual.zh.md`:
  - `:123` "commands.* 改为你的 test/build/lint/typecheck 命令" — omits `check`.
  - `:215-219` CORE module `commands` example — omits `check` (test/build/lint/typecheck only).
  - `:333-337` quickstart `commands` example — omits `check`.
  - `:506` CHECK step row: "健康检查：跑测试/构建/lint，确认 baseline 是绿的" + `pass` / `fail` — same factual error as en `:301`.
  - `:625-629` full reference `commands` example — omits `check`.
  - `:652` base.json example `"commands": { "test": "...", "build": "..." }` — illustrative shorthand using `...` ellipsis (implies further keys); same as en `:447`, not a literal `check` target.

**Test/verification constraints the changes must preserve (verified live):**

- `tools/mission-driver/src/prompt-check.mjs:59-86` only lints `<AI_STEP_RESULT>value</AI_STEP_RESULT>` tag pairs against flow-step transitions. `mission-draft.md`'s `created` marker is NOT bound to any main-flow step (the `draft` CLI subcommand, registered at `main.js:860`, loads `mission-draft.md` directly via `readFileSync` at `main.js:462` — not a main-flow step), so `buildPromptMarkerMap` returns no entry and the marker-membership check is skipped. Editing prose / JSON examples in `mission-draft.md` cannot affect `prompt-check`.
- `tools/mission-driver/test/draft-path-consistency.test.js:329-332` (Case E) asserts `mission-draft.md` contains NO literal `docs/backlog/`. Any path example in the added Note MUST use the `{{backlogDir}}/` placeholder, never a literal `docs/backlog/` string. (The `check` command value is a shell command like `mvn clean compile`, not a path, so this constraint is trivially satisfiable — noted for completeness.)
- No test pins the user-manual prose content or the `commands` JSON-example shape. Manual edits are test-safe.

**Protected-area check (none):** This plan touches only prompt prose, JSON examples inside prompts/docs, and manual prose. No flow JSON, no engine core (`engine.js`/`executor.js`/`flow-loader.js`), no `web/dist`, no zero-dep invariant, no `memory/_index.md`, no `install-age.sh`, no `mission-check.mjs` merge logic. `docs/context/project-context.md` AI Block Conditions are not triggered. This is a non-protected, non-high-risk slice (mirrors mdr-fix-4's classification).

Gap: the mdr-fix-3 feature (`commands.check` + configurable CHECK) is shipped and tested in the engine, but invisible in every mission-creation/doc surface. The `draft` agent never generates `check`; humans reading the manual never learn it exists; and the manual's CHECK description actively contradicts the shipped behavior (says CHECK runs tests/build/lint — exactly what `health-check.md:16` forbids).

## Goals

- Make `commands.check` discoverable in the primary generation contract: `mission-draft.md`'s `commands` JSON example and Notes.
- Make `commands.check` discoverable in the user manuals (en + zh) so humans hand-editing missions learn it exists.
- Correct the user manuals' CHECK step description so it matches shipped mdr-fix-3 behavior (runs `commands.check` / git-status fallback; emits `pass`/`needs_fix`/`fail`).
- No engine, flow JSON, or `mission-check.mjs` code change.

## Non-Goals

- Changing `extends` shallow-merge to deep-merge (CONTEXT.md documents shallow merge as intended; the fix is to surface `check` so generated missions include it, not to change merge semantics).
- Changing `main.js` `checkCmd` plumbing or `health-check.md` behavior (both correct and tested).
- Adding new CLI flags, new prompt files, or interactive config wizards.
- Touching the `needs_fix` triple-run-cost residual (recorded as watch-only in the audit's "Residual unknowns", not a finding).

## Task Route

- Type: `implementation-only change` (prompt prose + JSON examples + manual doc alignment; no API/data/auth/flow-contract/engine code change)
- Owner Docs: `docs/audits/mission-driver-actionable-fixes/2026-07-29-1620-open-audit-mission-driver-actionable-fixes.md` [P1] finding; `tools/mission-driver/CONTEXT.md` (Mission 配置系统 — CHECK 为可配置确定性状态门); `tools/mission-driver/docs/user-manual.{en,zh}.md`; `docs/plans/00-plan-authoring-and-execution-guide.md`
- Skill Selection Basis: none — a small prompt/doc prose alignment slice; no reusable skill matches.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.

## Execution Plan

### Phase 1 - Surface `commands.check` and correct CHECK semantics across generation prompt + user manuals

Status: completed
Targets: `tools/mission-driver/prompts/mission-draft.md`, `tools/mission-driver/docs/user-manual.en.md`, `tools/mission-driver/docs/user-manual.zh.md`
Skill: none

- Item Types: `Fix | Add | Decision | Proof`
- Prereqs: none (independent; mdr-fix-3 engine work is already shipped and green)

- [x] `Fix` (P1 core): in `prompts/mission-draft.md:39-44`, add a `check` key to the `commands` JSON example so the `draft` agent surfaces it in generated missions. Value placeholder must convey optionality and the fallback, e.g. `"check": "{optional deterministic-state gate command, e.g. mvn clean compile; empty/omitted = git conflict-marker fallback}"`. Do not change any other key or the surrounding JSON shape.
  - Skill: none
- [x] `Add`: in `prompts/mission-draft.md` Notes section (`:53-58`), add a one-line `commands.check` note alongside the existing command notes explaining when to set it (deterministic-state gate for CHECK; empty/omitted falls back to git conflict-marker detection). Must use `{{backlogDir}}/` (never a literal `docs/backlog/`) if any path appears — though the note is about a shell command, not a path, so this is a no-op guard. Do not change the `<AI_STEP_RESULT>created</AI_STEP_RESULT>` / `<MISSION_FILE>` output contract.
  - Skill: none
- [x] `Decision`: whether to also align the user manuals (en + zh) in this same slice. Options:
  - (A) **Chosen** — align both manuals: add `check` to every `commands` JSON example (en `:128-133`, `:420-425`, `:447`; zh `:123`, `:215-219`, `:333-337`, `:625-629`, `:652`) AND correct the CHECK step description (en `:301`, zh `:506`) to match shipped behavior (runs `commands.check` or git-status fallback; emits `pass`/`needs_fix`/`fail`). Rationale: (1) mdr-fix-4 precedent — when a generation/CLI/config surface is restated, the manuals must be aligned in the same slice to prevent doc drift; (2) plan-authoring-guide Minimum Rule 1 requires inventorying contradicting surfaces, and the manuals are the parallel creation path for humans hand-editing missions; (3) leaving the manual's CHECK description saying "run tests/build/lint" while adding `check` to the commands example would create a NEW internal contradiction (manual lists `check` but describes CHECK as running tests). Single result surface: mdr-fix-3 feature discoverability + semantic consistency across all creation/doc surfaces. Alternatives: (B) prompt-only (defer manuals to a separate doc-only slice) — rejected because it splits one cohesive feature-visibility alignment across two plans and leaves the human creation path (manual) still unable to discover `check`, plus leaves the factual CHECK-description error live. (C) defer CHECK-description correction to a separate finding — rejected because it is the same root cause (mdr-fix-3 closure missed manuals) and bundling avoids a follow-up plan for a 2-line-per-language prose fix. Residual risk: none material — no test pins manual prose; prompt-check unaffected.
  - Skill: none
- [x] `Fix | Add` (per Decision A, en manual): in `user-manual.en.md`, add a `check` entry to the full `commands` JSON examples at `:128-133` and `:420-425` (matching the optional-gate framing used in `mission-draft.md`); the base.json shorthand one-liner at `:447` (`"commands": { "test": "...", "build": "..." }`) uses `...` ellipsis that already implies further keys, so it is left as-is; correct the CHECK step row at `:301` from "Health check: run tests/build/lint, confirm baseline is green." / `pass` / `fail` to reflect shipped behavior (deterministic-state gate: runs `commands.check` when configured, else git conflict-marker detection; output markers `pass` / `needs_fix` / `fail`).
  - Skill: none
- [x] `Fix | Add` (per Decision A, zh manual): in `user-manual.zh.md`, add a `check` entry to the full `commands` JSON examples at `:215-219`, `:333-337`, `:625-629`; add `check` to the explicit enumeration at `:123` ("...test/build/lint/typecheck 命令" → include `check`); the base.json shorthand one-liner at `:652` (`"commands": { "test": "...", "build": "..." }`) uses `...` ellipsis that already implies further keys, so it is left as-is; correct the CHECK step row at `:506` from "健康检查：跑测试/构建/lint，确认 baseline 是绿的" / `pass` / `fail` to the shipped behavior + `pass` / `needs_fix` / `fail`.
  - Skill: none
- [x] `Proof`: verification —
  - `pnpm --prefix tools/mission-driver test` green (chains `prompt-check.mjs`; expected unaffected since no new `<AI_STEP_RESULT>` tags and no literal `docs/backlog/` introduced — confirm `prompt-check: OK` and the `draft-path-consistency` Case E assertion still holds).
  - Content review (grep): `prompts/mission-draft.md` contains a `check` key in the `commands` example and a `commands.check` note; `user-manual.en.md` and `user-manual.zh.md` each contain a `check` key in their `commands` examples and the corrected CHECK description with `needs_fix`.
  - Negative grep: no literal `docs/backlog/` introduced in `mission-draft.md` (Case E guard).
  - Skill: none

Exit Criteria:

- [x] `mission-draft.md` `commands` JSON example includes a `check` key; Notes section documents `commands.check` and the empty/omitted fallback.
- [x] `user-manual.en.md` and `user-manual.zh.md` `commands` examples include `check`; CHECK step description matches shipped behavior and lists `pass` / `needs_fix` / `fail`.
- [x] No `<AI_STEP_RESULT>` marker contract changed in `mission-draft.md`; no literal `docs/backlog/` introduced.
- [x] `pnpm --prefix tools/mission-driver test` green (full suite + `prompt-check: OK`).
- [x] Owner-doc update: user-manual alignment IS the owner-doc update (Decision A). `CONTEXT.md` already documents CHECK as configurable gate (no edit required).
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: accept (general subagent `ses_04f72d75effeHwfVwESsCLGWqf`, fresh session). Every baseline citation verified against live code with zero drift (base.json:10, mission-draft.md:39-44/53-58, main.js:700/462/860, mission-check.mjs:48, health-check.md:7-16, prompt-check.mjs:59-86, draft-path-consistency Case E, user-manual.en.md:128-133/301/420-425/447, user-manual.zh.md:123/215-219/333-337/506/625-629/652, CONTEXT.md). The [P1] finding is fully covered (mission-draft.md surfacing + shallow-merge drop addressed at root via generation, not by changing intended merge semantics). Decision A validated as justified — bundling en/zh manual alignment (incl. the CHECK-row factual correction) is the same cohesive result surface mdr-fix-4 bundled and is required by Minimum Rule 1; the P1 defect is correctly `Fix`-tagged (non-degradable, Minimum Rule 14); protected-area / test-constraint / verification classifications all correct; structure follows the guide Template with internally-consistent statuses for the `draft` stage. No blocking issues.
- Consensus reached: no blocking issues after iteration 1 → promoted to active. Non-blocking fold-ins from iteration 1 applied: (1) en/zh manual items now treat the base.json shorthand one-liners (`:447`/`:652`) consistently — left as-is because the `...` ellipsis already implies further keys, and the baseline now characterizes them as illustrative shorthand rather than "omits check"; (2) en/zh manual items re-tagged `Fix | Add` (they both add the `check` key and fix the CHECK-row owner-doc drift at `:301`/`:506`, satisfying Rule 14 fidelity); (3) `main.js:462` wording made precise (subcommand registered at `main.js:860`, prompt loaded via readFileSync at `main.js:462`). Non-protected, non-high-risk slice (no flow JSON / engine core / web-dist / zero-dep / memory / install-age.sh touched); Reviewer-Availability Fallback criteria met for a solo closure if no second reviewer is available at closure time.

## Closure Gates

- [x] in-scope behavior is complete (prompt + both manuals aligned)
- [x] relevant docs are aligned (user-manual en+zh; CONTEXT.md already correct, no edit needed)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` + content/negative greps
- [x] scoped verification is not conflated with full verification (full test suite is the verification here — no scope limitation)
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

(none anticipated at draft time)

## Closure

Status Note: Completed. The mdr-fix-3 `commands.check` feature is now discoverable on every mission-creation/doc surface, and the manuals' CHECK step description no longer contradicts shipped behavior. Non-protected, non-high-risk slice; Reviewer-Availability Fallback applies (solo closure cold-replay, no second reviewer available) per AGENTS.md.

Closure Audit Evidence:

- Auditor / Agent: solo closure by executing agent (EXECUTE subflow), cold-replay against the real diff and real verification commands. Independent draft review already recorded above (iteration 1: accept).
- Evidence:
  - `tools/mission-driver/prompts/mission-draft.md`: `commands` JSON example now has a `"check"` key with optional-gate+fallback placeholder framing; Notes section has a `commands.check` note (incl. shallow-merge reminder). No `<AI_STEP_RESULT>` / `<MISSION_FILE>` contract change; no literal `docs/backlog/` (Case E guard verified by negative grep).
  - `tools/mission-driver/docs/user-manual.en.md`: `commands` examples at quickstart (`:128-133`) and full reference (`:420-425`) include `"check"`; CHECK row (`:301`) corrected to deterministic-state-gate semantics with `pass` / `needs_fix` / `fail`. base.json ellipsis one-liner (`:447`) left as-is.
  - `tools/mission-driver/docs/user-manual.zh.md`: enumeration (`:123`) + all three `commands` examples (CORE `:215-219`, quickstart `:333-337`, full ref `:625-629`) include `check`; CHECK row (`:506`) corrected to deterministic-state-gate semantics with `pass` / `needs_fix` / `fail`. base.json ellipsis one-liner (`:652`) left as-is.
  - Verification (full green): `pnpm --prefix tools/mission-driver/web run typecheck` clean; `pnpm --prefix tools/mission-driver/web run build` clean with **no `web/dist/` diff** (rebuilt byte-identical — git status shows web/dist untouched); `pnpm --prefix tools/mission-driver run lint:prompts` → `prompt-check: OK`; `pnpm --prefix tools/mission-driver test` → 597 pass / 0 fail (includes draft-path-consistency Case E and prompt-check).
  - Scope discipline: no flow JSON, engine core, mission-check.mjs, package.json dependencies, memory, or install-age.sh touched. (Out-of-scope note: en manual line 39 ASCII-diagram caption still says `CHECK (health check: do tests/build pass?)` — same drift class but NOT a plan target, so left untouched; candidate for a future doc-only sweep.)

Follow-up:

- (none blocking) Optional future doc sweep: correct the en-manual ASCII diagram caption at `:39` (and any sibling diagram) to match CHECK's configurable-gate semantics. Not in this plan's scope.
