# 2026-07-22-1223-1 plan-check CLI Guard Cross-Platform (O6)

> Plan Status: completed
> Last Reviewed: 2026-07-22
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-mission-driver-draft-robustness.md` (finding O6)
> Related: `docs/plans/mission-driver-draft-robustness/2026-07-21-0954-1-mission-check-cli-cross-platform.md` (WI4 — the sibling fix this plan mirrors for `mission-check.mjs`)
> Audit: required

## Current Baseline

Live state at HEAD `217af6d` (audited 2026-07-22 07:55, O6 evidence re-verified during plan authoring):

- **Three check-tool entry guards, three idioms — only `plan-check.mjs` is still broken**:
  | File | Guard idiom | Windows-correct? |
  |---|---|---|
  | `src/mission-check.mjs:107` | `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)` | ✅ (WI4) |
  | `src/prompt-check.mjs:102` | `if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))` | ✅ (both native paths) |
  | `src/plan-check.mjs:142` | `if (import.meta.url === \`file://${process.argv[1]}\`)` | ❌ (the defect) |
- **Live-proven broken on Windows** (auditor's evidence, reproducible): `node tools/mission-driver/src/plan-check.mjs /nonexistent/missing-plan.md` → **exit 0, no output**. A working guard would have run `inspectPlan()` → `readFileSync` → throw → exit 1. Contrast: the sibling `mission-check.mjs /nonexistent/missing.json .` → **exit 1 + ENOENT** (the WI4 guard runs the body).
- **Root cause**: on Windows, `import.meta.url` is `file:///C:/...` while `` `file://${process.argv[1]}` `` is `file://C:\...` (or relative-path concatenation) — never equal, so the CLI body never executes. This is the **exact pattern** the draft-robustness design §2.5 (`design/draft-robustness-design.md` "缺陷 4") calls out as the Windows false-positive machine, and that WI4 (§4.4, G6 "校验工具跨平台可用") fixed for `mission-check.mjs`. The sibling tool was missed.
- **Test gap**: `test/mission-check-cli.test.js` exists specifically to pin the `pathToFileURL` normalization (Cases A–D, including the platform-agnostic Case D anchor). `test/plan-check.test.js` only exercises the imported `inspectPlan()` function; **no `test/plan-check-cli.test.js`** exists, so nothing catches the regression on Windows or POSIX CI.
- **Production impact**: latent, not blocking. `plan-check.mjs` is a documented standalone diagnostic CLI (`// CLI entrypoint: node plan-check.mjs <plan.md> [--strict]`, `:141`), NOT in the `npm test` chain (which chains `prompt-check.mjs`, not `plan-check`). The engine consumes `inspectPlan()` as an imported function, so the production loop is unaffected. The diagnostic surface is broken on the project's primary development platform (win32) — directly contradicting the mission's G6 goal and §2.5 defect catalogue.
- **Recurrence count**: 1 corrected (mission-check via WI4) + 1 surviving (plan-check). prompt-check uses a different (also correct) idiom. AGENTS.md Operating Rule 15 promotes recurring patterns into reusable checks; this plan evaluates whether to extract a shared `isMainModule` helper.

## Goals

- Restore `plan-check.mjs`'s CLI entry guard so the standalone diagnostic CLI actually executes on Windows / macOS / Linux (closes O6's code defect).
- Pin the behavior with a `plan-check-cli.test.js` mirroring `mission-check-cli.test.js` so a future regression that reverts to the broken template-string concatenation fails the test on every platform, not just Windows.
- Adjudicate (Decision) whether to extract a shared `isMainModule` helper used by all three check tools, locking the invariant in one place per AGENTS.md Rule 15.

## Non-Goals

- Changing `inspectPlan()` / `analyzePlan()` semantics, return shape, or strict-mode behavior — those are correct and tested by `plan-check.test.js`; this plan only touches the CLI entry guard + adds a CLI-level regression test.
- Touching `mission-check.mjs` or `prompt-check.mjs` beyond what the Phase 2 Decision (shared helper) requires — and only if the Decision resolves to "extract now". If deferred, neither file changes.
- Wiring `plan-check.mjs` into the `npm test` chain (out of scope; if desired, it is a separate plan).
- Closing the O6 audit's broader "three idioms" observation beyond what the Decision adjudicates.

## Task Route

- Type: `bug investigation` (O6 is a confirmed live defect — code vs. design §2.5 defect catalogue) + `implementation-only change` (one guard replacement + one regression test + an optional small extraction).
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §2.5 (缺陷 4) + §4.4 (WI4, G6); `tools/mission-driver/CONTEXT.md` "构建与验证" (the standalone CLIs).
- Skill Selection Basis: `Skill: none`. The work is a localized guard replacement + a regression test mirroring an existing test file's structure; no reusable skill method applies beyond the standard verification discipline already encoded in AGENTS.md "Verification Baseline" + this plan's Phase 3 Proof items.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline. The full suite runs via `pnpm --prefix tools/mission-driver test` (already chained with `lint:prompts` per the F7 closure).

## Execution Plan

### Phase 1 - Replace the broken CLI entry guard in `plan-check.mjs` (O6 code fix)

Status: completed
Targets: `tools/mission-driver/src/plan-check.mjs` (around `:26` imports + `:142` guard)
Skill: none

- Item Types: `Fix`
- Prereqs: none (builds on HEAD `217af6d` which is 533/533 green; this is an additive code correction)

- [x] `Fix` — Add `pathToFileURL` to the `node:url` import (currently `plan-check.mjs` has no `node:url` import at all; it imports only `readFileSync` from `node:fs` and `relative` from `node:path`). Concretely add `import { pathToFileURL } from "node:url";` near the top of the file.
  - Skill: none
- [x] `Fix` — Replace the broken template-string guard at `plan-check.mjs:142`:
  ```js
  // OLD (broken on Windows):
  if (import.meta.url === `file://${process.argv[1]}`) { ... }
  // NEW (mirrors mission-check.mjs:107 verbatim, including the `process.argv[1] &&` short-circuit that protects REPL / `node -e` / `node -` hosts):
  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { ... }
  ```
  Add a one-line comment citing WI4 / design §2.5 so the next maintainer understands why this exact form is required (the project's Rule 12 "rare comments on local constraints easy to misread" exception — the broken form looks innocent and was already reverted-to once across the sibling tools).
  - Skill: none

Exit Criteria:

- [x] `plan-check.mjs:142` (or its replacement line) uses the `pathToFileURL(process.argv[1]).href` form with the `process.argv[1] &&` short-circuit guard, matching `mission-check.mjs:107`.
- [x] Live probe `node tools/mission-driver/src/plan-check.mjs /nonexistent/missing-plan.md` now exits **1** with an ENOENT error on stderr (the auditor's exact repro — confirmed flipped from the silent-exit-0 state).
- [x] Live probe `node tools/mission-driver/src/plan-check.mjs <real-plan.md>` still works (exits 0 with JSON stdout) — regression anchor.
- [x] No owner-doc update required in this phase (`design/draft-robustness-design.md` §2.5 already documents this defect class; the fix absorbs the design's prescription, not contradicts it).

### Phase 2 - Decide whether to extract a shared `isMainModule` helper (Rule 15 adjudication)

Status: completed
Targets: `tools/mission-driver/src/plan-check.mjs`, optionally `tools/mission-driver/src/mission-check.mjs`, `tools/mission-driver/src/prompt-check.mjs`, optionally a new `tools/mission-driver/src/main-module.mjs`
Skill: none

- Item Types: `Decision`
- Prereqs: Phase 1 complete (guard corrected; only then can the Decision evaluate "extract vs. leave three corrected call sites")

- [x] `Decision` — Adjudicate whether to extract a shared `isMainModule(importMetaUrl, argv1)` helper that all three check tools import, locking the entry-guard invariant in one place. Alternatives:
  1. **Extract now** — add `tools/mission-driver/src/main-module.mjs` exporting `isMainModule(importMetaUrl, argv1)` (one canonical `pathToFileURL(argv1).href === importMetaUrl` form with the `argv1 &&` short-circuit); rewrite the guard in all three check tools (`plan-check.mjs`, `mission-check.mjs`, `prompt-check.mjs`) to call it. Cost: 1 new file + 3 small edits + 1 unit test. Benefit: future fourth check tool cannot drift; the defect class is closed structurally, not by convention.
  2. **Defer with trigger** — leave the three corrected call sites as-is (after Phase 1 lands); promote into a helper only when a fourth check tool lands OR when one of the three idiom sites regresses. Cost: zero now. Benefit: avoids a small refactor in a plan whose primary closure surface is the O6 code defect. Residual risk: a future copy-paste of the broken form survives unnoticed until the next audit.
  
  **Chosen: alternative (2) "Defer with trigger".** Rationale: (a) after Phase 1 the *defect class* (broken template-string concatenation) is extinct — 0 surviving instances, so the recurrence is no longer "recurring", it is "corrected"; the only residual is *idiom drift* (two tools use `pathToFileURL(...).href`, one uses `resolve() === fileURLToPath()` — both correct), which is cosmetic, not a defect; (b) consolidating `prompt-check.mjs` to form A is scope creep beyond O6's "fix the broken guard" closure surface; (c) Phase 3 Case E (source-inspection regression anchor) structurally prevents the broken form from returning on **any** platform, mitigating the residual risk that the Rule-15 helper would otherwise address; (d) consistent with the codebase's established pattern for borderline Rule 15 adjudications (`2026-07-22-1106-1` `mergeSubflowChildren` Decision, `2026-07-21-1605-3` N3 Decision — both deferred-with-trigger at recurrence count 2). Alternatives considered: (1) would structurally lock the invariant but at the cost of touching a third tool (`prompt-check.mjs`) outside O6's defect surface. Residual risk: a future fourth check tool copy-pastes the broken form and it survives until audited — but the same risk exists today for any new file, and Phase 3's Case E anchor is the structural mitigation. Trigger condition recorded in `Deferred But Adjudicated` below.
  - Skill: none

Exit Criteria:

- [x] Decision recorded in the Closure section with chosen alternative, alternatives considered, and residual risk (or trigger condition if deferred).
- [x] If alternative (1) "Extract now" is chosen: the helper file exists, all three check tools call it, and `test/main-module.test.js` (or equivalent) pins its contract; full suite remains green.
- [x] If alternative (2) "Defer with trigger" is chosen: the three call sites remain correct (Phase 1's fix lands), and the trigger condition is recorded in `Deferred But Adjudicated`.

### Phase 3 - Pin the CLI guard with `plan-check-cli.test.js` (O6 regression test)

Status: completed
Targets: `tools/mission-driver/test/plan-check-cli.test.js` (new), `tools/mission-driver/test/mission-check-cli.test.js` (reference template)
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1 complete (Cases A/C/D/E directly assert the corrected guard; Case B is independent)

- [x] `Add` — Create `tools/mission-driver/test/plan-check-cli.test.js` mirroring `mission-check-cli.test.js`'s structure (`spawnSync(process.execPath, [PLAN_CHECK, ...args], { encoding: "utf8", timeout: 15000 })`). Cover these five mandatory cases:
  - **Case A** — Bad plan path (`/nonexistent/missing-plan.md`) → exit 1, stderr mentions the ENOENT / read error (this is the auditor's exact repro — flips from silent exit 0 to a real failure). **Regression-detection scope**: this case catches the broken guard ON WINDOWS ONLY. On POSIX, `` `file://${process.argv[1]}` `` happens to equal `import.meta.url` for an absolute script path (the audit's O6 line 58 acknowledges this: "CI on Linux would not catch it either — the guard happens to match on POSIX"). The cross-platform regression anchor is Case E, not Case A.
  - **Case B** — Missing CLI arg (`node plan-check.mjs` with no positional) → exit 2 + "Usage:" stderr (pins the `if (!file)` branch at `:146-149`).
  - **Case C** — Valid plan (a plan with all items checked + a Closure section with evidence) → exit 0 + stdout contains `"passed": true`.
  - **Case D** — Failing plan (a plan with unchecked items + no closure evidence) → exit 1 + stdout contains `"passed": false` (pins the `inspectPlan` verdict path through the CLI).
  - **Case E** — **Cross-platform regression anchor** (the case that actually catches a guard revert on POSIX CI, where the Windows regression otherwise hides): read `plan-check.mjs`'s own source via `readFileSync` and assert the CLI entry-guard line uses `pathToFileURL(...)`, NOT the broken template-string concatenation `` `file://${...}` ``. Concretely: `const src = readFileSync(PLAN_CHECK, "utf8"); assert.match(src, /import\.meta\.url\s*===\s*pathToFileURL\(/, "guard must use pathToFileURL form"); assert.doesNotMatch(src, /import\.meta\.url\s*===\s*`file:\/\/\$\{/, "guard must NOT use the broken template-string concatenation");`. This source-inspection anchor fires identically on Windows / macOS / Linux because it inspects the source text, not the runtime comparison. Mirror the intent of `mission-check-cli.test.js` Case D (regression-anchor) but use source-inspection rather than `pathToFileURL` unit assertion — the `pathToFileURL` unit assertion catches nothing about the guard (the independent reviewer's iteration 1 verified this).
  - Skill: none
- [x] `Proof` — Run `pnpm --prefix tools/mission-driver test` and confirm: (a) all five new `plan-check-cli.test.js` cases pass on this Windows host (proving the guard now fires); (b) the full suite remains green (target: 533 baseline + 5 new cases = 538); (c) the chained `prompt-check: OK` line still prints. Record the pass count + duration verbatim in the log entry.
  - Skill: none
- [x] `Proof` — **Regression-detection verification (mandatory, not optional)**: deliberately revert `plan-check.mjs:142` to the broken template-string form, re-run `plan-check-cli.test.js`, observe that Case A fails on Windows AND Case E fails on every platform (Windows + POSIX CI), then restore the fix and re-confirm all five cases pass. Record the platform-specific failure modes in the log entry. This step is the proof that the regression detection actually works as claimed — without it, the test is theater.
  - Skill: none

Exit Criteria:

- [x] `test/plan-check-cli.test.js` exists and passes on Windows; all five cases (A, B, C, D, E) green.
- [x] Regression-detection verification recorded in the log entry: Case A fails-on-Windows-only and Case E fails-on-every-platform when the guard is deliberately reverted, then both pass when the fix is restored. This is the proof that O6's recurrence is structurally prevented, not just today's bug patched.
- [x] Full suite green: `pnpm --prefix tools/mission-driver test` → `pass <baseline+5> / fail 0` + `prompt-check: OK`.
- [x] No owner-doc update required in this phase (`CONTEXT.md` "构建与验证" already lists the standalone CLIs at the command surface level; the new test file is internal verification, not a public contract).

### Phase 4 - Record green baseline + close

Status: completed
Targets: git index (commit), `docs/logs/2026/07-22.md`, `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-mission-driver-draft-robustness.md` (audit-status flip is owned by the mission-driver closure step, not this plan — see Closure)
Skill: none

- Item Types: `Proof`
- Prereqs: Phases 1–3 complete

- [x] `Proof` — Run the **full** verification suite against the working tree before commit: `pnpm --prefix tools/mission-driver test` must end in `pass <baseline+N> / fail 0` AND the final `prompt-check: OK` line. This is the exact discipline the O4 process lesson (`docs/logs/2026/07-22.md` "verify against full suite, not the narrow new test") prescribes for any check-tool change.
  - Skill: none
- [x] `Proof` — Commit the batch as one verify-then-committed unit: the Phase 1 guard replacement + Phase 2 helper (if chosen) + Phase 3 new test file + the Phase 4 log entry from the item below. Use a commit message that names O6 and cites the green pass count. Per AGENTS.md Docs Maintenance, the verification-green status MUST appear in the log entry and the commit message (known-good baseline for future debugging).
  - Skill: none
- [x] `Proof` — Add a dated `docs/logs/2026/07-22.md` (top entry, reverse chronological) recording: the green pass count, the O6 fix (one-line summary + the Phase 2 Decision outcome), and the regression-detection proof (the deliberate-revert verification). Cite this plan path.
  - Skill: none

Exit Criteria:

- [x] `git status --short` shows no uncommitted in-scope files from this plan (`plan-check.mjs`, `plan-check-cli.test.js`, optionally `main-module.mjs` + the other two check tools + `main-module.test.js`, the log entry, this plan file).
- [x] `git log --oneline -1` shows the new commit; the commit message contains the green pass count and names O6.
- [x] `docs/logs/2026/07-22.md` top entry records the O6 fix with the verification-green status.

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (independent fresh session `ses_077e7fa7dffefVa35w5FHjrrGT`, 2026-07-22) — three blocking issues: (1) FALSE VERIFICATION CLAIM — Case D (pure `pathToFileURL` unit assertion) catches no guard reverts on any platform because it inspects `pathToFileURL`'s output, not the guard source; the plan's claim that it "catches a revert on POSIX CI" contradicts the source audit O6 line 58 ("CI on Linux would not catch it either — the guard happens to match on POSIX"). Traced live: on POSIX `` `file://${abs}` `` === `import.meta.url` so the broken guard fires and Case A passes; only Windows catches Case A. (2) ANTI-SLACKING — Phase 3 Case C used the forbidden word "Optionally". (3) FUZZY EXIT CRITERIA — "chosen subset" and "ideally Case D's inequality anchor" let the implementer pick which cases count. Iteration 1 also confirmed: faithful to O6 (all three sub-components addressed), Phase 2 Decision genuine (two real alternatives), Correct Baseline factual claims verified live (plan-check.mjs:142 broken form, mission-check.mjs:107 WI4 reference, prompt-check.mjs:102 third idiom, no plan-check-cli.test.js exists).
- Independent draft review iteration 2: `acceptable-as-is` (independent fresh session `ses_077e011d4ffevgG05ToAYGWgzm`, 2026-07-22) — all three iteration-1 blocking issues verified resolved; no new blocking issue introduced. Reviewer independently traced both Case E regexes against live source: `/import\.meta\.url\s*===\s*pathToFileURL\(/` matches the corrected guard and misses the broken form; `/import\.meta\.url\s*===\s*\`file:\/\/\$\{/` misses the corrected guard and matches the broken form — both fire on source text platform-independently, so Case E catches a guard revert on every platform (Windows + POSIX CI), closing the iteration-1 false-POSIX-coverage gap. Case A's "ON WINDOWS ONLY" scope acknowledged (citing O6 line 58). "Optionally" / "chosen subset" / "ideally" all gone from Case C/D and Exit Criteria. Mandatory Regression-detection Proof item properly creates a non-degradable obligation. Non-blocking notes (no change required): "optionally" survives on three routing/targets/file-list lines (NOT in-scope items — describes files conditional on the mandatory Phase 2 Decision, so not an Anti-Slacking violation); Phase 3 Prereqs parenthetical "Case B is independent" is imprecise (Case B also depends on Phase 1 on Windows since the `if (!file)` branch lives inside the guard block) but moot for execution order. Plan ready for `Plan Status: active`.

## Closure Gates

- [x] in-scope behavior is complete (plan-check CLI guard fires on Windows; regression test pins it; Phase 2 Decision resolved)
- [x] relevant docs are aligned (`docs/logs/2026/07-22.md` updated with green baseline + O6 fix + Decision outcome; `design/draft-robustness-design.md` §2.5 / §4.4 already accurate — no edit needed; `CONTEXT.md` "构建与验证" already lists the standalone CLIs — no edit needed)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` → `pass 538 / fail 0` + `prompt-check: OK`; deliberate-revert regression-detection proof recorded
- [x] no in-scope item downgraded to deferred/follow-up (the Phase 2 helper-extraction is a `Decision` item with explicit adjudication, not a skip; alternative (2) "Defer with trigger" chosen — trigger condition recorded in `Deferred But Adjudicated`)
- [x] independent draft review completed and recorded (Draft Review Record above)
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent (separate subagent or fresh-session cold-replay per AGENTS.md Reviewer-Availability Fallback — this plan is non-protected and non-high-risk: source audit rated O6 MEDIUM-LOW latent diagnostic-tool defect; no contract/API/auth/data change beyond a standalone diagnostic CLI that the audit explicitly notes is "not in the npm test chain" and "the production loop is unaffected")
- [x] closure evidence exists in files (commit + log entry + the new `plan-check-cli.test.js` + the corrected guard at `src/plan-check.mjs` ARE the evidence)

## Deferred But Adjudicated

### Phase 2 helper-extraction (if Decision resolves to alternative (2) "Defer with trigger")

- Classification: `optimization candidate`
- Why Not Blocking Closure: the three corrected call sites (after Phase 1) all work; the recurrence is not yet frequent enough to force structural consolidation under AGENTS.md Rule 15.
- Successor Required: `yes` — trigger condition: a fourth check tool lands OR one of the three idiom sites (`plan-check.mjs`, `mission-check.mjs`, `prompt-check.mjs`) regresses → at that point extract `isMainModule` into `src/main-module.mjs` and rewrite all three call sites.

## Closure

Status Note: O6 code defect corrected + regression-pinned + Phase 2 Decision resolved + green baseline committed. The `plan-check.mjs` standalone diagnostic CLI now actually executes its body on Windows / macOS / Linux (the broken template-string guard `` `file://${process.argv[1]}` `` is replaced with the WI4-correct `pathToFileURL(process.argv[1]).href` form, mirroring `mission-check.mjs:107`). The new `plan-check-cli.test.js` pins all five behavioral + source-inspection cases, with Case E as the cross-platform anchor that catches a guard revert on POSIX CI (where Case A's Windows-only catch hides). The deliberate-revert regression-detection proof confirms all 5 cases fail on Windows and Case E fails on every platform when the guard is reverted, then all pass when restored — the test is proven non-theater. Phase 2 Decision: "Defer with trigger" on the shared `isMainModule` helper — the defect class is extinct post-Phase-1, the residual is cosmetic idiom drift, and Case E is the structural mitigation; trigger = fourth check tool lands OR one of the three sites regresses. Plan closes as a verify-then-committed unit at 538 pass / 0 fail.

Closure Audit Evidence:

- Auditor / Agent: opencode solo cold-replay (AGENTS.md Reviewer-Availability Fallback — non-protected, non-high-risk; source audit rated O6 MEDIUM-LOW latent diagnostic-tool defect).
- Evidence:
  - Corrected guard at `src/plan-check.mjs:147` (`if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)`) + `import { pathToFileURL } from "node:url";` at `:28` + 4-line citing comment block `:143-146`.
  - New `test/plan-check-cli.test.js` (5 cases A–E; 538 pass / 0 fail on this Windows host).
  - `docs/logs/2026/07-22.md` top entry with green pass count (538), O6 fix summary, Phase 2 Decision outcome, and the deliberate-revert regression-detection proof.
  - Commit hash: `1ec8d63` (`git log --oneline -1` — commit message names O6 + cites 538 pass / 0 fail).
  - Deliberate-revert regression-detection proof: reverting the guard to the broken form → all 5 cases fail on Windows; Case E fails on every platform (source-text inspection); restoring the fix → all 5 green. Recorded in the log entry.
