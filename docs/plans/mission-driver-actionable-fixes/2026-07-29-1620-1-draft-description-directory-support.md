# mdr-fix-4 Draft description supports directory/multi-file references

> Plan Status: completed
> Last Reviewed: 2026-07-29
> Source: `docs/backlog/mission-driver-actionable-fixes-roadmap.md` work item 4; `docs/analysis/2026-07-29-0000-mission-driver-actionable-fixes.md` problem #5
> Related: none (independent — no flow JSON, no engine core, no overlap with plans 1–3)
> Audit: required

## Current Baseline

Live-state inventory (read from repo, not memory; roadmap line citations verified against actual code):

- `src/main.js:860-868` `program.command("draft")`: `<description>` is the sole required argument (`.argument("<description>", "Mission 描述")` at `:862`). `--target-file` is an **optional** `.option()` at `:867` with help text `目标文件项目相对路径（mdo-4 P2 brief 输入）`. The roadmap cites `main.js:850`, but `:850` is the `list` subcommand's `--missions-dir` option — the actual `--target-file` line is `:867`. The current help text does NOT convey that the flag is optional, nor that the description itself may reference any path.
- `src/config.js:515` `targetFile: args.targetFile || null` — correctly null when unset; plumbed into the draft pipeline only.
- `prompts/mission-brief.md:9` reads: `**Target file** (optional): {{targetFile}} (project-relative path; may be empty). When non-empty, read this file to ground the brief in the actual code/design being changed.` — frames the input as a **single file**. Nothing states the description may reference a directory, multiple files, or an abstract goal.
- `prompts/mission-draft.md` (brief-gate section, lines 5-9): reads the brief when `{{briefPath}}` is non-empty, else falls back to the user request. No note that the user request may reference directories, multiple files, or abstract goals; no statement that `--target-file` is just an optional input aid.
- User manuals frame `--target-file` as single-file only:
  - `docs/user-manual.en.md:104` "You can pass `--target-file` to point at the requirements doc"; `:259` "Flags: `--target-file <path>` (point at the requirements doc)". No directory-based example.
  - `docs/user-manual.zh.md:309` "你可以用 `--target-file` 指定目标文件"; `:464` "flag：`--target-file <path>`（指定目标需求文档）". No directory-based example.
- `src/prompt-check.mjs:59-86` only lints `<AI_STEP_RESULT>value</AI_STEP_RESULT>` tag pairs against flow-step transitions. `mission-brief.md` has NO `AI_STEP_RESULT` tags (it emits `<BRIEF_FILE>`/`<BRIEF_GATE>`/`<BRIEF_GATE_REASON>`). `mission-draft.md`'s `created` marker is NOT bound to any flow step (the `draft` command is a standalone CLI subcommand, loaded directly at `main.js:462`, not a main-flow step), so `buildPromptMarkerMap` returns no entry for it and the marker-membership check is skipped. Therefore rewording prose in either prompt cannot affect `prompt-check` — confirmed by reading the linter.
- **Additional prompt-content test constraints the reword must preserve** (verified live): `test/draft-path-consistency.test.js:324-331` asserts both `mission-brief.md` and `mission-draft.md` contain NO literal `docs/backlog/` — any path example must use the `{{backlogDir}}/` placeholder, never a literal `docs/backlog/` string. `test/brief-gate.test.js:327-335` asserts `mission-brief.md` still contains the literal `<BRIEF_GATE>` and `<BRIEF_GATE_REASON>` markers (these live at `:27,:40-41`, away from the `:9` reword, so the reword is safe — but the markers must be preserved). `test/draft-path-consistency.test.js` matches on the `--target-file` flag *name* and the `targetFile` config property, NOT the help-text wording — so rewording the help text is test-safe.
- **Protected-area check (none):** Item 4 touches no flow JSON, no engine core, no `web/dist`, no zero-dep invariant, no `memory/_index.md`, no `install-age.sh`. Analysis #5 explicitly records "无受保护区影响，纯提示词措辞和文档调整". `docs/context/project-context.md` AI Block Conditions are not triggered. This is a non-protected, non-high-risk slice.

Gap: the draft surface (prompts + CLI help + user manuals) frames the input as a single target file, contradicting the already-supported reality that `<description>` is the only required argument and may freely reference any path. Users are misled into thinking `--target-file` is required or that only single-file targets are supported.

## Goals

- Make the draft prompts explicitly state the description may reference a directory, multiple files, or an abstract goal — not limited to a single `--target-file`.
- Clarify the `--target-file` CLI help text as an optional input aid, not a required constraint.
- Keep the draft two-stage brief/draft logic and the sole-required-arg contract unchanged.

## Non-Goals

- Interactive directory picker (roadmap "Out of scope").
- New CLI flags (roadmap "Out of scope").
- Changing `<description>` being the sole required argument or the brief-gate `pass`/`blocked` semantics.
- Auto-expanding a directory path into a file list inside the engine (the agent reads directories itself; this plan is wording/alignment only).

## Task Route

- Type: `implementation-only change` (prompt wording + CLI help text + doc alignment; no API/data/auth/flow-contract change)
- Owner Docs: `docs/backlog/mission-driver-actionable-fixes-roadmap.md` §4; `docs/analysis/2026-07-29-0000-mission-driver-actionable-fixes.md` #5; `tools/mission-driver/docs/user-manual.{en,zh}.md` draft sections; `docs/plans/00-plan-authoring-and-execution-guide.md`
- Skill Selection Basis: none — a small prompt/help-text/doc rewording slice; no reusable skill matches.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.

## Execution Plan

### Phase 1 - Reword the draft surface to support directory/multi-file/abstract-goal descriptions

Status: completed
Targets: `tools/mission-driver/prompts/mission-brief.md`, `tools/mission-driver/prompts/mission-draft.md`, `tools/mission-driver/src/main.js`, `tools/mission-driver/docs/user-manual.en.md`, `tools/mission-driver/docs/user-manual.zh.md`
Skill: none

- Item Types: `Fix | Add | Decision | Proof`
- Prereqs: none (independent of plans 1–3)

- [x] `Fix`: reword `prompts/mission-brief.md:9` (the `- **Target file** (optional): \`{{targetFile}}\` ...` bullet) to convey "Target file or directory (optional) — the description may reference any path: a single file, a directory, multiple files, or an abstract goal. `--target-file` is an optional input aid, not a required constraint." Keep the existing `{{targetFile}}` substitution and the "when non-empty, read it" behavior intact. Preserve the `<BRIEF_GATE>`/`<BRIEF_GATE_REASON>`/`<BRIEF_FILE>` markers (they live at `:27,:40-41`). Any path example must use `{{backlogDir}}/`, never a literal `docs/backlog/` (test constraint above).
  - Skill: none
- [x] `Add`: in `prompts/mission-draft.md`, add a short note (near the brief-gate section) that the user request may reference directories, multiple files, or abstract goals — not limited to a single file — and that `--target-file` (when provided) is just one optional input aid. Do not change the `<AI_STEP_RESULT>created</AI_STEP_RESULT>` / `<MISSION_FILE>` output contract. Any path example must use `{{backlogDir}}/`, never a literal `docs/backlog/` (test constraint above).
  - Skill: none
- [x] `Fix`: reword the `--target-file` help text at `src/main.js:867` to clarify it is an optional input aid and the description may reference any path (e.g. `目标文件/目录路径（可选输入辅助，非必填约束；description 可引用任意路径）`). Keep the option name `--target-file <path>` and the `args.targetFile` plumbing unchanged.
  - Skill: none
- [x] `Decision`: whether to align the user manuals in this same slice. Options:
  - (A) **Chosen** — align `user-manual.en.md` (`:104`, `:259`) and `user-manual.zh.md` (`:309`, `:464`) so the `--target-file` framing says "target file or directory / optional input aid" and add one directory-based example (e.g. `draft "读取 docs/input/ 下所有需求文档，生成 roadmap"`). Rationale: the `--target-file` flag and `<description>` arg are a user-facing CLI surface; plan-authoring-guide Minimum Rule 1 requires inventorying contradicting surfaces and the doc-update rule requires owner-doc alignment when a CLI-surface behavior is restated; analysis #5 recommendation #2 explicitly calls for a directory-based example. Low-risk, same result surface, prevents doc drift. Alternatives: (B) defer the manual update to a separate doc-only slice — rejected because it splits one cohesive wording alignment across two plans and leaves the manuals contradicting the new prompt/help framing between slices. Residual risk: none material.
  - Skill: none
- [x] `Add` (per Decision A): apply the manual alignment described above to both `user-manual.en.md` and `user-manual.zh.md`.
  - Skill: none
- [x] `Proof`: verification —
  - `pnpm --prefix tools/mission-driver test` green (chains `prompt-check.mjs`; expected unaffected since no new `<AI_STEP_RESULT>` tags are introduced — confirm `prompt-check: OK`).
  - `node tools/mission-driver/src/main.js draft --help` shows the reworded `--target-file` help text and that `<description>` remains the only required argument.
  - Skill: none

Exit Criteria:

- [x] `mission-brief.md` and `mission-draft.md` explicitly state the description may reference directories, multiple files, or abstract goals; `--target-file` framed as optional input aid.
- [x] `--target-file` help text at `src/main.js:867` conveys optional input aid; `<description>` remains the sole required arg; option name and plumbing unchanged.
- [x] User manuals (en + zh) aligned per Decision A; at least one directory-based example added per manual.
- [x] No `<AI_STEP_RESULT>` marker contract changed in either prompt; `prompt-check: OK`.
- [x] `pnpm --prefix tools/mission-driver test` green.
- [x] Owner-doc update: user-manual alignment IS the owner-doc update (Decision A). `tools/mission-driver/CONTEXT.md` does not document the `draft` command's `--target-file` surface, so no CONTEXT.md edit is required.
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: accept-after-minor-revision (general subagent ses_052e76cfaffeKcTp4FUWv2ilEK) because all Minimum Rules (1–14) pass, scope matches roadmap item 4, Decision A (user-manual alignment) is validated as required-not-creep, one-result-surface and verification commands confirmed, and every baseline citation verified against live code (all confirmed, zero drift). No blocking issues. Non-blocking accuracy notes folded in: (1) baseline now names the two additional prompt-content tests the reword must preserve — `test/draft-path-consistency.test.js:324-331` (no literal `docs/backlog/`, use `{{backlogDir}}/`) and `test/brief-gate.test.js:327-335` (preserve `<BRIEF_GATE>`/`<BRIEF_GATE_REASON>` markers); the two prompt-rewrite items now carry explicit "use `{{backlogDir}}/`, preserve markers" guards; (2) Proof command pinned to exact `node tools/mission-driver/src/main.js draft --help` (dropped "(or equivalent)"); (3) confirmed `mission-draft.md` is loaded directly at `main.js:462` (not flow-bound). Decision A re-validated by reviewer against the doc-update rule — kept as-is.
- Consensus reached: no blocking issues after iteration 1 corrections → promoted to active. Non-protected, non-high-risk slice (no flow JSON / engine core / web-dist / zero-dep / memory / install-age.sh touched); Reviewer-Availability Fallback criteria met for a solo closure if no second reviewer is available at closure time.

## Closure Gates

- [x] in-scope behavior is complete (prompts + CLI help + manuals reworded)
- [x] relevant docs are aligned (user-manual en+zh; CONTEXT.md checked, no edit needed)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` + `draft --help` output check
- [x] scoped verification is not conflated with full verification (full test suite is the verification here — no scope limitation)
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent — **solo cold-replay** by the EXECUTE agent (no second reviewer / subagent available at closure time); permitted under the Reviewer-Availability Fallback because this slice is non-protected and non-high-risk (no flow JSON / engine core / web-dist / zero-dep / memory / install-age.sh). Limitation: no independent second reviewer; protected-area / source-of-truth-conflict triggers would require escalation, but none apply here.
- [x] closure evidence exists in files

## Deferred But Adjudicated

(none anticipated at draft time)

## Closure

Status Note: Completed. All Phase 1 items and exit criteria verified green. Cold-replay walkthrough against the live diff: `prompts/mission-brief.md:9` reworded to "Target file or directory (optional)" + optional-input-aid framing, `{{targetFile}}` substitution and read-when-non-empty behavior preserved, `<BRIEF_GATE>`/`<BRIEF_GATE_REASON>`/`<BRIEF_FILE>` markers intact at `:27,:40-41`, no literal `docs/backlog/`; `prompts/mission-draft.md` note added after the brief-gate section (output contract `<AI_STEP_RESULT>created</AI_STEP_RESULT>`/`<MISSION_FILE>` unchanged, no literal `docs/backlog/`); `src/main.js:867` help text reworded to "目标文件/目录路径（可选输入辅助，非必填约束；description 可引用任意路径）" (option name `--target-file <path>` and `args.targetFile` plumbing unchanged, `<description>` remains sole required arg); `user-manual.en.md` (`:104`, `:259`) and `user-manual.zh.md` (`:309`, `:464`) reworded + one directory-based example added each (`draft "Read all requirement docs under docs/input/..."` / `draft "读取 docs/input/ 下所有需求文档，生成 roadmap"`). Verification: `pnpm --prefix tools/mission-driver test` green (597 pass / 0 fail, `prompt-check: OK`); `node tools/mission-driver/src/main.js draft --help` shows reworded text + sole-required `<description>`; `pnpm --prefix tools/mission-driver/web run typecheck && build` clean and `web/dist/` byte-identical (git status empty — zero web impact); `pnpm --prefix tools/mission-driver run lint:prompts` OK. Roadmap work item 4 set to `done`.

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay by the EXECUTE agent (mission-driver subflow `2026-07-29-162002-mission-driver`, plan `2026-07-29-1620-1`). No second reviewer / subagent available → Reviewer-Availability Fallback (non-protected, non-high-risk slice).
- Evidence: `git status --short` shows exactly the 5 in-scope files modified (`mission-brief.md`, `mission-draft.md`, `main.js`, `user-manual.en.md`, `user-manual.zh.md`) + roadmap status flip + this plan + dev log; no out-of-scope / sibling-plan changes introduced; full test suite 597/597 green; `web/dist/` unchanged (build reproducible). Daily dev log entry recorded at `docs/logs/2026/07-29.md`.

Follow-up:

- (none blocking)
