> Audit Status: planned
> Audit Type: open-ended
> Mission: mission-driver-draft-robustness
> Remediation Plans: `docs/plans/mission-driver-draft-robustness/2026-07-22-1223-1-plan-check-cli-guard-cross-platform.md` (O6 — `Plan Status: draft`), `docs/plans/mission-driver-draft-robustness/2026-07-22-1223-2-exitcode-map-flow-error-statuses.md` (O7 — `Plan Status: draft`), `docs/plans/mission-driver-draft-robustness/2026-07-22-1223-3-run-state-section-doc-anchors.md` (B1, B2 — `Plan Status: draft`). All 4 net-new findings (O6, O7, B1, B2) owned. B1+B2 are shared with the sibling 0755 multi-audit; this open-audit's plan 3 closes them for both.

# Open-Ended Adversarial Audit — `tools/mission-driver/` (mission-driver-draft-robustness)

- **Date**: 2026-07-22 07:55
- **Auditor**: opencode solo cold-replay (`docs/skills/open-ended-audit-prompt.md` — generic default; this repo has not tuned a project-specific open-ended prompt, which the prompt's own preamble permits).
- **Scope**: full `tools/mission-driver/` surface — code (`src/main.js`, `src/engine.js` fully, `src/executor.js`, `src/runner.js`, `src/monitor.js` incl. the now-committed `mergeSubflowChildren`, `src/mission-check.mjs`, `src/plan-check.mjs`, `src/prompt-check.mjs`, `src/draft-job.mjs`, `src/secret-resolver.js`, `src/roadmap-check.mjs`), config (`missions/base.json`, `missions/mission-driver-draft-robustness.json`, `package.json`), flows (`flows/mission-driver.json`, `plan-execution.json`, `deep-audit-loop.json`), prompts, tests (`test/*.test.js` — 533 cases), the public-contract doc `docs/architecture/mission-driver-baseline.md`, design docs (`draft-robustness-design.md`, `EXECUTION-PRINCIPLE.md`, `CONTEXT.md`, `TROUBLESHOOTING.md`, `README.md`), the sibling 0755 multi-audit, recent logs (`docs/logs/2026/07-22.md`), `AGENTS.md`, and the **live committed tree**.
- **Method**: followed `docs/skills/open-ended-audit-prompt.md` precisely — read `AGENTS.md` **completely**, the active mission config, the draft-robustness design + roadmap, recent logs, and the live code; then probed BEYOND the standard categories, hunting hidden risks the structured multi-audit pass and prior open-audit generations may have missed (assumptions never written down, owner-doc gaps, fake closure / weak proof, brittle code paths, framework-specific anti-patterns, recurring failure patterns ripe for promotion). Solo cold-replay review (AGENTS.md Reviewer-Availability Fallback) — non-protected, non-high-risk mission; solo review is permitted and recorded here.

## Method note — what THIS pass did differently

The sibling 0755 multi-audit (structured, 7 dimensions) audited HEAD `217af6d` and found two LOW doc-attribution nits (B1/B2). The prior `planned`-status draft of THIS open-audit file was written against the older `c2a1ea9` tree and is now **stale** (its O4/O5 were about an *uncommitted* `mergeSubflowChildren` batch that has since been committed green in `caf741e` + `919f3aa`, and its headline A1 was closed by `217af6d`). This pass re-ran a fresh open-ended audit against the **current** tree (`217af6d`, clean, 533 green) rather than re-litigating the stale snapshot.

An open-ended audit's job is to find what the structured checklist misses. Two net-new defects surfaced precisely because they sit **outside** the multi-audit's dimension framing: (O6) a Windows CLI-guard defect in a *parallel* check tool the structured audit never scoped, and (O7) an exit-code contract that lives in `main.js` (which the multi-audit did not line-audit) and is documented — wrongly — in an operator doc the multi-audit did not cross-reference against the code. Both are the "hidden assumptions / brittle paths that passed narrow verification" class the open-ended prompt targets.

## Verification Snapshot (live-replayed during this audit)

| Command | Result |
| --- | --- |
| `pnpm --prefix tools/mission-driver test` | **533 pass / 0 fail** (10.4s); final line `prompt-check: OK — all prompt result-tag examples are well-formed.` |
| `node tools/mission-driver/src/mission-check.mjs missions/mission-driver-draft-robustness.json .` | exit 0 + `"valid": true` (WI4 cross-platform CLI green on Windows). |
| `git log --oneline -1` | `217af6d docs(mission-driver-draft-robustness): plan-2026-07-22-1106 architecture baseline doc sync (A1 a+b+c)` |
| `git status --short` | **clean** (only the sibling 0755 multi-audit `.md` shows as modified — audit authorship, not code). HEAD tree is the state a remediator inherits. |
| `node tools/mission-driver/src/plan-check.mjs /nonexistent/missing-plan.md` (Windows, live) | **exit 0 — silent no-op** (O6 proof). |
| `node tools/mission-driver/src/mission-check.mjs /nonexistent/missing-mission.json .` (Windows, live, contrast) | **exit 1 + ENOENT error** — the WI4-fixed guard runs the CLI body; plan-check's does not. |
| `grep` exitMap / `unknown_step` / `ping_pong` across `test/` | engine *status* is asserted (`core.test.js:210,355`, `transitions.test.js:389`); the `main.js` **exit-code mapping** for any non-happy-path status is **never asserted** (O7 proof). |
| Architecture-doc claim `mission-driver-baseline.md:63` | cites `_writeWorkflow, engine.js:427-427-436` — actual `_writeWorkflow()` is `engine.js:442-451`; `427-436` is inside `_finalizeWorkflow` (`:428`). B1 re-verified STILL OPEN. |
| Architecture-doc claim `mission-driver-baseline.md:79` | "sorted by `forEachIndex` on close (inside `_wfClose`)" — actual sort is `engine.js:1134` inside `_executeSubflowStep`; `_wfClose` does not sort. B2 re-verified STILL OPEN. |
| Prior open-audit O4 (uncommitted batch) | **CLOSED** — committed in `caf741e` (`mergeSubflowChildren` verify-then-commit) + `919f3aa` (child onStepUpdate routing). |
| Prior open-audit O5 (`visits`-absent prefix fragility) | **CLOSED** — `monitor.js:307-309` now falls back to a broad stepName-only prefix when `step.visits == null`; pinned by `subflow-state-isolation.test.js` O5 case. |
| Prior open-audit A1 (architecture-doc drift) | **CLOSED** — `217af6d` added `validateDraftDesc` + `draft-job.mjs` row + corrected `parseRoadmapMarkdown` owner + anchor-ized Public-Exports citations. (B1/B2 below are residual Run-State-section drift the same pass missed.) |

---

## Findings

Ordered by severity. Net-new findings are labeled `O#`. Carried-forward still-open findings keep their prior label and are summarized.

### O6 — [MEDIUM-LOW — NET-NEW] `plan-check.mjs:142` still carries the exact Windows false-positive CLI guard that WI4 fixed for `mission-check.mjs` — incomplete remediation, no test, live-proven broken

- **Hidden-risk class**: recurring failure pattern that should have been promoted into a reusable check · fake closure (a WI was marked done for one of two parallel tools) · platform-specific anti-pattern.
- **Live evidence** (this audit ran the real binaries on Windows):
  - `plan-check.mjs:142` guards its CLI body with:
    ```js
    if (import.meta.url === `file://${process.argv[1]}`) { ... }
    ```
    This is the **exact broken pattern** the draft-robustness design calls out as **缺陷 4** (`design/draft-robustness-design.md` §2.5) and fixed for `mission-check.mjs` via WI4 (§4.4, G6 "校验工具跨平台可用"). On Windows `import.meta.url` is `file:///C:/...` while `` `file://${process.argv[1]}` `` is `file://C:\...` (or a relative-path concatenation) — **never equal**, so the CLI body never executes.
  - Live run this audit: `node tools/mission-driver/src/plan-check.mjs /nonexistent/missing-plan.md` → **exit 0, no output**. A working guard would have run `inspectPlan()` → `readFileSync` → throw → exit 1. The silent exit-0 is the definitive signature of the never-firing guard. Contrast: `node tools/mission-driver/src/mission-check.mjs /nonexistent/missing-mission.json .` → **exit 1 + ENOENT** (the WI4 `pathToFileURL` guard runs the body).
  - Three check tools, **three different** entry-guard idioms — only `plan-check.mjs` is still broken:
    | File | Guard | Windows-correct? |
    |---|---|---|
    | `mission-check.mjs:107` | `pathToFileURL(process.argv[1]).href` | ✅ (WI4) |
    | `prompt-check.mjs:102` | `resolve(process.argv[1]) === fileURLToPath(import.meta.url)` | ✅ (both native paths) |
    | `plan-check.mjs:142` | `` `file://${process.argv[1]}` `` template concat | ❌ (the defect) |
  - **Test gap**: `mission-check-cli.test.js` exists specifically to pin the `pathToFileURL` normalization (Case D, "platform-agnostic anchor"). There is **no** `plan-check-cli.test.js`; `test/plan-check.test.js` only exercises the imported `inspectPlan()` function, never the CLI entry guard. So nothing catches the regression on Windows (and CI on Linux would not catch it either — the guard happens to match on POSIX, mirroring the design's §2.5 warning that this defect is "platform-related … CI 若跑在 Linux 上也测不出来").
- **Why net-new / why the structured audits missed it**: the multi-audit scoped `src/mission-check.mjs` (where WI4 landed) but never `src/plan-check.mjs` (a parallel tool). The prior open-audit generations predate the WI4 fix's completion. The mission's own design §2.5 explicitly frames this pattern as a false-positive machine that "给假阳性" — and the remediation closed one instance while leaving the sibling instance verbatim.
- **Impact**: `plan-check.mjs` is documented as a standalone diagnostic CLI (`// CLI entrypoint: node plan-check.mjs <plan.md> [--strict]`, `:141`). On Windows, `node plan-check.mjs <any-plan>` silently exits 0 without validating — exactly the false-positive the design warned undermines trust in the check tooling. It is not in the `npm test` chain (that chains `prompt-check.mjs`, not `plan-check`), and the engine consumes `inspectPlan()` as an imported function, so the production loop is unaffected — but the diagnostic surface is broken on the project's primary development platform (win32).
- **Severity**: MEDIUM-LOW. Latent diagnostic-tool defect, not a production-loop defect; but it directly contradicts a closed WI's stated goal (G6) and the mission's own §2.5 defect catalogue.
- **Recommended fix (small)**: (1) replace `plan-check.mjs:142` with `import { pathToFileURL } from "node:url";` (already imported `dirname`/etc. from `node:path`) + `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {` — mirroring `mission-check.mjs:107` verbatim; (2) add a `plan-check-cli.test.js` mirroring `mission-check-cli.test.js` (spawnSync a bad plan, assert exit 1 + stderr); (3) consider promoting the guard idiom into a tiny shared helper (`isMainModule(importMetaUrl, argv1)`) so the three check tools cannot drift apart again (AGENTS.md Rule 15 — recurrence count is now 1 corrected / 1 surviving).

### O7 — [MEDIUM-LOW — NET-NEW] `main.js` exit-code map omits flow-error statuses → `unknown_step` / `unknown_type` / `no_transition` / `invalid_transition` exit **0 (success)**, contradicting `EXECUTION-PRINCIPLE.md §11` (which documents them as exit **1**); no test pins any non-happy-path exit code

- **Hidden-risk class**: documented-contract drift that is also a latent behavioral defect · brittle code path covered by no test.
- **Live evidence**:
  - `main.js:749` exit map:
    ```js
    const exitMap = { completed: 0, single_step_done: 0, failed: 1, max_cycles: 2, max_total_steps: 2, max_retries: 2 };
    const exitCode = exitMap[result.status];
    if (exitCode !== undefined) process.exitCode = exitCode;
    ```
    The engine's terminal statuses also include `ping_pong`, `unknown_step`, `unknown_type`, `no_transition`, `invalid_transition`, `skipped` (all reachable via `_result(...)` in `engine.js`). None of these are in `exitMap` → `exitCode === undefined` → `process.exitCode` is **never set** → Node exits **0 (success)**.
  - The owner doc contradicts this. `EXECUTION-PRINCIPLE.md` §11 table:
    ```
    | 未知 step / 类型 / 非法转换 | `unknown_step` 等 | 1 | 流程定义错误 |
    | 检测到两步 ping-pong        | `ping_pong`      | — | 死循环保护   |
    ```
    I.e. flow-definition errors are **documented as exit 1** but the code makes them exit 0. (`ping_pong` is documented `—`; exiting 0 there is at least consistent with the doc's dash, though a death-loop masquerading as success is still questionable for scripted callers — flagged as a residual, not the core defect.)
  - **No test pins this.** `core.test.js:210` asserts `result.status === "unknown_step"`, `:355` asserts `"ping_pong"`, `transitions.test.js:389` asserts `"no_transition"` — these assert the **engine status**, never the `main.js` exit-code mapping (the engine does not compute exit codes; only `cmdRunMission` does, and that path is not exercised for these statuses). `single-step.test.js:6` notes `single_step_done → 0` in a comment but does not assert the mapping for the error statuses.
- **Why net-new / why the structured audits missed it**: the exit-code contract lives in `main.js` (`cmdRunMission`), which the multi-audit did not line-audit (it scoped `main.js`'s *exports*, not its terminal-status handling). The cross-reference is against the architecture doc, not `EXECUTION-PRINCIPLE.md` §11.
- **Impact**: anyone scripting the driver (`./tools/mission-driver.sh X && next-step`, or a CI gate) treats a flow-definition error or a death-loop as **success** and proceeds. These statuses are rare in production (flows are validated), but the tool is explicitly designed around a 0/1/2 exit-code contract, and the doc promises exit 1 for exactly this class.
- **Severity**: MEDIUM-LOW. Latent (validated flows rarely hit these), but a genuine code-vs-doc contract break + a behavioral defect with zero test coverage.
- **Recommended fix (small)**: extend `exitMap` to `{ ..., unknown_step: 1, unknown_type: 1, no_transition: 1, invalid_transition: 1 }` (and decide `ping_pong` deliberately — `2` aligns with the other loop guards, or keep the doc's `—` and make it explicit). Add a `cmdRunMission`-level test (or a focused exitMap unit test) asserting every documented terminal status maps to its documented exit code. Sync `EXECUTION-PRINCIPLE.md §11` to whatever is chosen.

### B1 — [LOW — carried forward from sibling 0755 multi-audit, re-verified STILL OPEN, and strengthened] Stale `_writeWorkflow` line-number citation in the Run-State section (navigational rot; the prior remediation *mis-verified* it as accurate)

- **Dimension**: owner-doc alignment · the doc's own Update Rule (`mission-driver-baseline.md:125`).
- **Live evidence**:
  - `mission-driver-baseline.md:63` — *"Written by `src/engine.js` via atomic tmp+rename (`_writeWorkflow`, `engine.js:427-436`)."*
  - Actual: `_writeWorkflow()` is defined at **`engine.js:442-451`** (verified by read). Lines `427-440` are `_finalizeWorkflow` (`:428`), not `_writeWorkflow`. A maintainer following "the atomic-write function" lands in the wrong function. Neighbour `:65` `_wfClose engine.js:370-411` also undershoots (body runs to `:426`).
  - **Strengthening**: the closure log `docs/logs/2026/07-22.md:18` records that the `217af6d` doc-sync pass explicitly *re-verified* `_writeWorkflow engine.js:427-436` as **"accurate"** ("Leave-alone citations re-verified accurate: … `_writeWorkflow engine.js:427-436`"). That re-verification was wrong — which is why this citation survived the pass that was specifically supposed to close drift. The Public-Exports section was anchor-ized; the Run-State section was not, so it re-rotted.
- **Severity**: LOW. Navigational only (function names are still greppable). Non-blocking.
- **Recommended fix (doc-only)**: apply the same function-name-anchor-first convention the Public-Exports section adopted — *"`_writeWorkflow` (atomic tmp+rename, in `src/engine.js`)"* — and drop/de-emphasize the numeric span across the Run-State section.

### B2 — [LOW — carried forward from sibling 0755 multi-audit, re-verified STILL OPEN] `subflowRuns` sort invariant mis-attributed to `_wfClose` (actually enforced in `_executeSubflowStep`)

- **Dimension**: owner-doc alignment · the doc's own Update Rule.
- **Live evidence**:
  - `mission-driver-baseline.md:79` — *"`subflowRuns` is sorted by `forEachIndex` on close (inside `_wfClose` in `engine.js`)."*
  - Actual: the sort is at **`engine.js:1134`** (`subflowRuns.sort((a, b) => a.forEachIndex - b.forEachIndex)`), inside **`_executeSubflowStep`** (the forEach drain, after `:1129-1131`), with an owning code comment at `:1132-1133`. `_wfClose` does **not** sort — it only persists the already-sorted record. (`monitor.js:350` re-sorts defensively in `mergeSubflowChildren`.)
  - The **invariant holds** (pinned by `subflow-incremental.test.js` Case D); the defect is purely the wrong enforcement-site attribution.
- **Severity**: LOW. Non-blocking, but a reader debugging ordering would be misled to the wrong function (one cannot recover by re-grepping the line, unlike B1).
- **Recommended fix (doc-only)**: reword `:79` to *"sorted by `forEachIndex` before close (inside `_executeSubflowStep` in `engine.js`; `monitor.js` re-sorts defensively in `mergeSubflowChildren`)"*.

---

## Clean Aspects (Re-Verified During This Audit)

- **533/533 tests pass** in the live committed tree; `prompt-check: OK`; `lint:prompts` structurally chained into `pnpm test`. Working tree clean (no in-flight mutation, unlike the prior `c2a1ea9` snapshot).
- **Prior O4 (uncommitted `mergeSubflowChildren` batch) and O5 (`visits`-absent prefix fragility) are genuinely CLOSED**: committed green in `caf741e` + `919f3aa`; `monitor.js:307-309` carries the `visits`-absent fallback with an owning comment block; pinned by `subflow-state-isolation.test.js` (the `:99` contract + the O5 file:null/visits-absent case).
- **Prior A1 (public-exports + `draft-job.mjs` row + `parseRoadmapMarkdown` owner) genuinely CLOSED** by `217af6d` — verified against live exports (`main.js:922`, `draft-job.mjs` exports, `monitor.js` imports).
- **WI1–WI5 implementations match design §4.1–§4.5**: WI1 `validateDraftDesc` (`draft-job.mjs:61`) wired into both gates (`main.js:325`, `monitor.js`); WI2 brief gate (`extractBriefGate` `main.js:169` with `/is` + ANSI strip, enforcement `main.js:429`); WI3 `{{backlogDir}}` in both prompts + `parseDraftArtifact` warn (`main.js:214-223`); WI4 `pathToFileURL` for **mission-check** (`mission-check.mjs:107`); WI5 incremental persistence (`_wfAppendSubflowRun` `engine.js:491`, 3 call sites incl. non-forEach placeholder `:1154`).
- **ANSI-strip discipline** (`stripAnsiControl`) applied before every marker extraction at both layers (engine + main.js three sites) — N1 closed and held.
- **Engine zero-npm-dependency invariant intact** (`commander` still the only runtime dep); **atomic-write discipline** intact (`_writeWorkflow` tmp+rename; run-reconcile Windows-aware).
- **Child-engine `onStepUpdate` routing** (`engine.js:1190-1199`) correctly routes subflow step updates to the child engine — the `919f3aa` fix, pinned by `subflow-state-isolation.test.js`.
- **`mergeSubflowChildren`** (`monitor.js:249`) is the now-correct primary live-state reader (disk = source of truth for status/steps/currentStep; `subflowRuns` seeds `forEachItem` metadata); its `visits`-absent + `file:null` edge cases are covered.
- **Transient-provider-error classification** (`isTransientProviderError`, stderr-signature-based) and the independent `transientCounts` retry budget are coherent and replace the old misdiagnosing duration/length heuristic.
- **Prompt size guard** (`boundPromptSize`, head+tail 24KB cap) folds in after appends — prevents the closure-audit feedback from blowing the model budget.
- **Empirically DISPROVEN hypotheses (not reported as findings)**: (a) the `_executeSubflowStep` sliding-window `stopRequested` closure references (`:1103`) look pre-declaration, but the closure is only invoked after `dispatch()` (`:1126`) runs post-declaration — no TDZ violation; (b) `prompt-check.mjs:102`'s entry guard initially looked like the same defect as plan-check, but it uses `resolve() === fileURLToPath()` (both native paths) and is Windows-correct — verified distinct. Reported only what is actually broken.

## Residual Unknowns Worth Watchfulness

| Unknown | Why it deserves watchfulness |
| --- | --- |
| Are there other parallel check tools that inherited the `file://` guard idiom? | O6 shows the WI4 fix landed in one of three check tools. A repo-wide grep for `` `file://${process.argv[1]}` `` (and the older `import.meta.url ===` template form) would confirm plan-check is the last survivor. |
| Is `ping_pong → exit 0` intentional? | `EXECUTION-PRINCIPLE.md §11` lists it as `—`. A death-loop protection firing looks like success to a scripted caller. O7 flags it as a residual to decide deliberately when the exitMap is extended. |
| Does `_runChildSubflow`'s `runParseAgent` (un-wrapped) drop child parse-agent log/session updates? | The wrapper (`engine.js:1190`) rewrites only `runAgent`. Parse-fallback updates route to the parent engine and are dropped (no matching stepName). Minor observability gap for the recovery path, not a correctness bug — but worth a note if subflow parse-recovery observability ever matters. |
| Should the architecture doc's Run-State section get the same anchor-ize pass the Public-Exports section got? | B1/B2 survived precisely because only one section was anchor-ized. The fix is one small pass; until then, every engine shift re-rots the numeric citations. |

## Recommendation

**needs revision**

There is no blocking defect in production-loop behavior — HEAD `217af6d` is 533/533 green, the working tree is clean, and the prior headline findings (O4/O5/A1) are genuinely closed. The revision items are two net-new defects the structured audits missed, plus two carried-forward LOW doc nits:

1. **O6 (code + test, MEDIUM-LOW)** — fix `plan-check.mjs:142` to use `pathToFileURL(process.argv[1]).href` (mirroring the WI4 fix in `mission-check.mjs:107`), add a `plan-check-cli.test.js` mirroring `mission-check-cli.test.js`, and consider a shared `isMainModule` helper to stop the three check tools drifting. Live-proven broken on Windows; directly contradicts the mission's own G6 goal and §2.5 defect catalogue.
2. **O7 (code + test + doc, MEDIUM-LOW)** — extend `main.js:749` `exitMap` to map `unknown_step`/`unknown_type`/`no_transition`/`invalid_transition` (→1, per `EXECUTION-PRINCIPLE.md §11`), decide `ping_pong` deliberately, add a test asserting every documented terminal status → exit code, and sync the doc.
3. **B1/B2 (doc-only, LOW)** — extend the function-name-anchor convention into `mission-driver-baseline.md`'s Run-State section (correct the `_writeWorkflow` citation / `_wfClose` span, and re-attribute the `subflowRuns` sort to `_executeSubflowStep`). Note B1 survived because the `217af6d` pass *mis-verified* it as accurate — the anchor-ize pass prevents the next re-rot.

Once **O6** and **O7** are adjudicated/closed, this audit flips to **passes open-ended audit** with the Residual Unknowns table as the watchlist (B1/B2 may remain as tracked lows).

## Files Touched By This Audit

- This file (overwrite of the stale `planned`-status draft): `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-mission-driver-draft-robustness.md`

No code, config, flow, prompt, plan, or test file was modified by this audit. All evidence is from live reads of the repo and live probes (`pnpm --prefix tools/mission-driver test` → 533 pass / 0 fail; `node mission-check.mjs …` → exit 1 + ENOENT; `node plan-check.mjs …` → silent exit 0; `git status`/`git log`; cross-module greps on exit statuses, exports, and the `file://` guard idiom).

<AI_STEP_RESULT>issues</AI_STEP_RESULT>
