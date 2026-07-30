# mdr-fix-doc-1 Manuals CHECK semantics doc-drift sweep

> Plan Status: completed
> Last Reviewed: 2026-07-30 (independent draft review converged at iteration 2: accept)
> Source: deferred follow-up recorded in `docs/plans/mission-driver-actionable-fixes/2026-07-30-0902-1-surface-commands-check.md` (Closure out-of-scope note + Follow-up); same drift class as the resolved [P1] in `docs/backlog/mission-driver-actionable-fixes-roadmap.md` Follow-up Backlog.
> Related: `2026-07-30-0902-1-surface-commands-check.md` (resolved the step-table rows + commands examples; left the ASCII diagrams + prose out of scope), `2026-07-29-1221-3-check-configurable-gate.md` (shipped mdr-fix-3 that made these descriptions wrong).
> Mission: mission-driver-actionable-fixes
> Work Item: Manuals CHECK semantics doc-drift sweep (follow-up to mdr-fix-3 surfacing)
> Audit: required

## Current Baseline

mdr-fix-3 (`2026-07-29-1221-3-check-configurable-gate.md`, done) made CHECK a configurable deterministic-state gate: when `commands.check` is configured it runs `{{checkCmd}}` (diagnose + fix + rerun if auto-fixable, emit `needs_fix`); when unconfigured it falls back to git conflict-marker detection. CHECK explicitly does **NOT** run `commands.test` (that is BUILD_VERIFY's job). This is the shipped behavior and is owned in `tools/mission-driver/CONTEXT.md` ("CHECK 为可配置确定性状态门").

The [P1] follow-up plan `2026-07-30-0902-1-surface-commands-check.md` (done) corrected the **step-table rows** and **commands examples** in both user manuals to deterministic-state-gate semantics, but explicitly moved the ASCII-diagram captions and the "first loop" prose out of scope:

- Its Closure note: "en manual line 39 ASCII-diagram caption still says `CHECK (health check: do tests/build pass?)` — same drift class but NOT a plan target, so left untouched; candidate for a future doc-only sweep."
- Its Follow-up: "Optional future doc sweep: correct the en-manual ASCII diagram caption at `:39` (and any sibling diagram) to match CHECK's configurable-gate semantics. Not in this plan's scope."

Live drift inventory (verified against the repo on 2026-07-30, both manuals):

1. `tools/mission-driver/docs/user-manual.en.md:39` — ASCII loop diagram caption: `┌→ CHECK (health check: do tests/build pass?)`. **Factually wrong**: CHECK forbids tests/build; tests/build is BUILD_VERIFY (`user-manual.en.md:369`).
2. `tools/mission-driver/docs/user-manual.zh.md:39` — sibling ASCII caption: `┌→ CHECK（健康检查：测试/构建是否过）`. Same factual error.
3. `tools/mission-driver/docs/user-manual.en.md:341` — "First loop" prose bullet: `- CHECK runs the health check.` Uses the pre-mdr-fix-3 "health check" framing; inconsistent with the corrected step-table row at `en.md:302` ("Deterministic-state gate ... Does NOT run `commands.test`").
4. `tools/mission-driver/docs/user-manual.zh.md:547` — sibling prose bullet: `- CHECK 跑健康检查`. Same framing; inconsistent with corrected row at `zh.md:508`.
5. `tools/mission-driver/docs/user-manual.en.md:11` — one-sentence summary: `... the full closed loop of **health-check → review plans → execute plans → draft new plans → deep audit** ...`. "health-check" here is a stage label, not an explicit tests/build claim; borderline (see Decision item).
6. `tools/mission-driver/docs/user-manual.zh.md:11` — parallel one-sentence summary: `..."健康检查 → 评审计划 → 执行计划 → 起草新计划 → 深度审计"...`. Exact sibling of #5; same borderline stage-label drift class. Must be adjudicated together with #5 (align both or keep both) so the two manuals stay consistent.

Already-correct surfaces (out of scope, listed for boundary clarity): `en.md:138` / `zh.md:344` (commands.check prose), `en.md:302` / `zh.md:508` (step-table rows), `en.md:426` / `zh.md:632` (commands.check JSON examples), the `CHECK ────┴──── REVIEW_PLANS` ASCII diagrams at `en.md:314` / `zh.md:520` (bare step name, no semantic claim), `en.md:369` / `zh.md:575` (BUILD_VERIFY runs tests/build — correct, and the legitimate hits the proof `rg` must NOT flag).

Gap: the two highest-visibility manual surfaces (the "30-second version" ASCII loop diagram, and the "first loop" prose walkthrough) still describe CHECK with the old tests-build/health-check framing that contradicts shipped mdr-fix-3 behavior. This is confirmed owner-doc drift.

## Goals

- The user-facing manuals describe CHECK consistently with shipped mdr-fix-3 semantics everywhere CHECK is characterized: ASCII loop diagrams and the "first loop" walkthrough prose in both `user-manual.en.md` and `user-manual.zh.md`.
- No manual sentence or diagram caption claims or implies CHECK runs tests/build.
- The one-sentence summary's CHECK stage label is either aligned or explicitly adjudicated as acceptable with recorded rationale, applied identically to both manuals (`en.md:11` and `zh.md:11`).

## Non-Goals

- `src/context-map.mjs` `EXPECTED_VARS` / `VAR_PROVENANCE` line-number comment refresh (roadmap P2 #1) — its trigger ("whenever next edited for a real change") is not met; this plan edits no source under `src/`, so the piggyback does not fire.
- `src/flow-loader.js` dead `subflowDir` search-dir branch (roadmap P2 #2) — trigger (engine-hardening pass or a `config.js` `subflowDir` producer) not met.
- `engine.js` `_executeForEach` correction-skip refactor (deferred from plan 1) — protected-area (engine state-machine core), trigger (second forEach agent step exhibiting the waste, or hardening prioritized) not met.
- Goal-driven promptsDir auto-selection (deferred from plan 2) and engine config-driven transition selection (deferred from plan 3) — triggers not met.
- Rewriting the step-table rows or commands examples — already correct from the [P1] plan.
- Any change to `prompts/health-check.md`, flow JSON, engine, `web/dist`, dependencies, `install-age.sh`, or `mission-check.mjs`.

## Task Route

- Type: `implementation-only change` (user-facing manual correction aligning docs with already-shipped mdr-fix-3 behavior; no code, contract, or design change — same classification the sibling plan `2026-07-30-0902-1` used for equivalent manual-alignment work).
- Owner Docs: `tools/mission-driver/CONTEXT.md` ("CHECK 为可配置确定性状态门" / "CHECK 不跑 commands.test"); `tools/mission-driver/docs/user-manual.en.md` §5.1 step table (`:302`); `tools/mission-driver/docs/user-manual.zh.md` §5.1 step table (`:508`); `docs/backlog/mission-driver-actionable-fixes-roadmap.md` Follow-up Backlog.
- Skill Selection Basis: `Skill: none` — this is a documentation consistency sweep against already-shipped behavior; no reusable skill in `docs/skills/README.md` (the project ships default skills only) matches a doc-realignment method.

## Infrastructure And Config Prereqs

No infra prereqs beyond existing baseline. Doc-only change; no build/runtime/contract impact. Rollback = `git revert` of the two manual files.

## Execution Plan

### Phase 1 - Sweep manuals' CHECK descriptions to configurable-gate semantics

Status: completed
Targets: `tools/mission-driver/docs/user-manual.en.md`, `tools/mission-driver/docs/user-manual.zh.md`
Skill: `none`

- Item Types: `Fix | Decision | Proof`
- Prereqs: none (mdr-fix-3 already shipped; [P1] step-table rows already correct — these are the authoritative wording references).

- [x] `Fix` — `user-manual.en.md:39` ASCII loop-diagram caption: replaced `CHECK (health check: do tests/build pass?)` with `CHECK (deterministic-state gate: commands.check or git-clean check)`. Box-drawing + `↓ pass` arrow preserved.
  - Skill: `none`
- [x] `Fix` — `user-manual.zh.md:39` sibling ASCII caption: replaced `CHECK（健康检查：测试/构建是否过）` with `CHECK（确定性状态门：commands.check 或 git 冲突标记检测）`. Box-drawing + `↓ pass` preserved.
  - Skill: `none`
- [x] `Fix` — `user-manual.en.md:341` "First loop" prose bullet: replaced `- CHECK runs the health check.` with `- CHECK runs the deterministic-state gate (commands.check, else git-clean check).`
  - Skill: `none`
- [x] `Fix` — `user-manual.zh.md:547` sibling prose bullet: replaced `- CHECK 跑健康检查` with `- CHECK 跑确定性状态门（配置了 commands.check 就跑它，否则 git 冲突标记检测）`.
  - Skill: `none`
- [x] `Decision` — One-sentence summary CHECK stage label, applied identically to BOTH `user-manual.en.md:11` and `user-manual.zh.md:11`: resolved as **(A) align both**. `en.md:11` `health-check → ...` → `state-check → ...`; `zh.md:11` `健康检查 → ...` → `状态检查 → ...`. Neutral stage label, fully consistent with the corrected diagram caption + prose; removes even the colloquial tests/build implication at the most prominent surface.
  - Rationale basis: the label here is a colloquial stage name in a high-level loop summary, not an explicit tests/build claim; however it is the single most prominent surface and a reader's first mental model of CHECK.
  - Alternatives: (A) align both to a neutral label (e.g. en `state-check → ...`, zh `状态检查 → ...`) for full consistency with the corrected diagram/prose; (B) keep both (`health-check` / `健康检查`) as recognizable stage names and record why neither is a factual claim.
  - Residual risk: if kept (B), a future reader may still map the label to tests/build; mitigated by the now-correct diagram caption two sections below in each manual.
  - Resolution applied: (A). Both labels edited identically (en `state-check` / zh `状态检查`); no mixing.
  - Skill: `none`
- [x] `Proof` — Verified no remaining manual surface claims or implies CHECK runs tests/build, and no CHECK-attached "health-check"/"健康检查" framing survives. Ran the grep equivalent of the `rg` pattern (`rg` unavailable in this env; `Grep` tool used) against both manuals: exactly **2 hits** remain — `en.md:369` and `zh.md:575` — both the legitimate BUILD_VERIFY rows (`BUILD_VERIFY: run tests/build ...` / `BUILD_VERIFY：跑测试/构建 ...`). No CHECK-attached tests/build or health-check/健康检查 claim survives in either manual.
  - Skill: `none`

Exit Criteria:

- [x] Both ASCII loop-diagram captions (`en.md:39`, `zh.md:39`) describe CHECK as the deterministic-state gate; neither says tests/build.
- [x] Both "first loop" prose bullets (`en.md:341`, `zh.md:547`) are consistent with their step-table rows (`en.md:302`, `zh.md:508`).
- [x] The one-sentence summary stage label is aligned (Decision outcome A) inline in this plan, applied identically to BOTH `en.md:11` and `zh.md:11` (`state-check` / `状态检查`).
- [x] `rg` proof above shows no CHECK-attached tests/build or health-check/健康检查 claim remains in either manual (only BUILD_VERIFY row, negative-context sentences, or the adjudicated summary label may hit) — verified via Grep equivalent: only `en.md:369` + `zh.md:575` BUILD_VERIFY rows hit.
- [x] No change outside the two manual files (scope discipline): this plan's own `git diff` touches exactly `user-manual.en.md` + `user-manual.zh.md` (+ this plan + log + roadmap Follow-up Backlog). NOTE: 3 other modified files in the working tree (`.opencode/skills/mission-driver/SKILL.md`, `.opencode/skills/mission-driver/references/roadmap-template.md`, `template/docs/backlog/implementation-roadmap.md`) are pre-existing sibling-work changes, NOT touched by this plan (single-plan-scope rule observed).
- [x] No owner-doc update required beyond the two manuals themselves (CONTEXT.md already correct; `project-context.md` does not characterize CHECK).
- [x] Verification: `pnpm --prefix tools/mission-driver run lint:prompts` OK; `pnpm --prefix tools/mission-driver/web run build` produces **no `web/dist/` diff** (git status clean under `tools/mission-driver/web/dist`); `git status --short` confirms no `web/dist/`, flow JSON, engine, or dependency files touched by this plan.
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: needs-revision (task `ses_04f549312ffeJDIiltSGEoFyqp`, fresh session) because (a) blocking boundary hole: `zh.md:11` carries the parallel `健康检查 → ...` one-sentence-summary label but appeared in neither the execution items, the Already-correct list, nor Non-Goals — under Decision outcome (A) this would align `en.md:11` while leaving `zh.md:11` inconsistent, violating Goal #1; (b) the proof `rg` pattern (`tests/build|测试/构建`) would not catch `health-check`/`健康检查` prose, so it could not verify the `:341`/`:547` prose rewrites. Non-blocking notes: phase `Item Types` omitted `Proof`; Task Route `app-layer design change` was a stretch vs the sibling plan's `implementation-only change`. Reviewer confirmed the plan is legitimately `created` (not `nothing`): verified owner-doc drift, non-degradable per Rule 14, properly re-triggered from the `2026-07-30-0902-1` deferral.
- Independent draft review iteration 2: accept (task `ses_04f4f3091ffe7sAcn74e4a1I0G`, fresh session) after revisions: all 6 drift locations verified live and accurately quoted; already-correct exclusions verified; CHECK semantics (forbids tests/build) confirmed in CONTEXT.md + `health-check.md`; proof `rg` pattern verified to hit exactly the 6 drift sites + the 2 legitimate BUILD_VERIFY rows (en:369 / zh:575) with no stray hits; no protected area touched; Anti-Slacking / type-integrity / one-result-surface all clean. Iteration-1 blocking issue confirmed fully resolved. Non-blocking polish applied: named the zh BUILD_VERIFY sibling (`zh.md:575`) in the Already-correct list and Proof parenthetical for en/zh pairing parity.

## Closure Gates

- [x] in-scope behavior is complete (all 6 drift locations — en/zh ASCII captions, en/zh "first loop" prose, en/zh one-sentence-summary labels — with the Decision adjudicated identically across both manuals)
- [x] relevant docs are aligned (manuals match CONTEXT.md mdr-fix-3 semantics)
- [x] verification has run: `lint:prompts` OK; `web build` produces no `web/dist/` diff; `rg`/Grep proof clean (only BUILD_VERIFY rows hit); `git status --short` scope-disciplined
- [x] scoped verification is not conflated with full verification — full `pnpm --prefix tools/mission-driver test` WAS run (597 pass / 0 fail) since it was cheap; not skipped
- [x] no in-scope item downgraded to deferred/follow-up (the `en.md:11` Decision resolved as outcome A, not deferred)
- [x] independent draft review completed and recorded (Draft Review Record iterations 1–2)
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent (independent subagent `ses_04f4653b7ffe7ijqBE6u0o2tKo`, fresh session — AUDIT_RESULT: PASS)
- [x] closure evidence exists in files (manual diffs + log entry)
- [x] roadmap Follow-up Backlog: RESOLVED note appended pointing at this plan (see roadmap update)

## Deferred But Adjudicated

(none anticipated at draft time — all other deferred items belong to other plans/roadmap entries with their own unmet triggers, listed in Non-Goals.)

## Closure

Status Note: All 6 drift locations in both user manuals now describe CHECK as the configurable deterministic-state gate (commands.check, else git-clean / git conflict-marker check), consistent with shipped mdr-fix-3 semantics and the authoritative step-table rows (en.md:302 / zh.md:508). No manual surface claims or implies CHECK runs tests/build; the one-sentence-summary stage label was adjudicated (Decision outcome A) and aligned identically in both manuals (en `state-check` / zh `状态检查`). Docs-only change: no flow JSON, engine, prompts, web/dist, or dependency touched. Verification green (lint:prompts OK; web build produces no web/dist diff; full test suite 597/0; Grep proof clean — only the two legitimate BUILD_VERIFY rows remain).

Closure Audit Evidence:

- Auditor / Agent: independent subagent (fresh session) — task `ses_04f4653b7ffe7ijqBE6u0o2tKo`
- Evidence: AUDIT_RESULT: PASS — all 5 checks passed (6 drift locations fixed with ASCII alignment preserved; consistency with step-table rows confirmed; Grep proof returned exactly the 2 BUILD_VERIFY rows en.md:369/zh.md:575; scope discipline confirmed — only the 2 manuals changed under tools/mission-driver/docs/; no protected-area / web/dist regression). Execution agent verification: `lint:prompts` OK, `pnpm --prefix tools/mission-driver test` 597 pass / 0 fail, `pnpm --prefix tools/mission-driver/web run typecheck && build` OK with no web/dist diff.

Follow-up:

- (none blocking)
