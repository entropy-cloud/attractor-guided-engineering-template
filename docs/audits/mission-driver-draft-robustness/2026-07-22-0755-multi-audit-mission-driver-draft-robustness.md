> Audit Status: planned
> Audit Type: multi-dimensional
> Mission: mission-driver-draft-robustness
> Remediation Plans: `docs/plans/mission-driver-draft-robustness/2026-07-22-1223-3-run-state-section-doc-anchors.md` (B1, B2 — `Plan Status: draft`). Both B1+B2 findings owned; they are shared with the sibling 0755 open-audit, which also routes to the same plan 3 (one closure surface — the `mission-driver-baseline.md` Run-State section).

# Multi-Dimensional Audit — `tools/mission-driver/` (mission-driver-draft-robustness)

- **Date**: 2026-07-22 07:55
- **Auditor**: opencode solo cold-replay (following `docs/skills/multi-dimensional-audit-prompt.md`)
- **Scope**: `tools/mission-driver/` — code (`src/main.js`, `src/engine.js`, `src/mission-check.mjs`, `src/draft-job.mjs`, `src/monitor.js`, `src/roadmap-check.mjs`), config (`missions/mission-driver-draft-robustness.json`), tests (`test/*.test.js`), prompts (`prompts/mission-brief.md`, `prompts/mission-draft.md`), public contracts (CLI `draft`/`run`/`list`/`list-steps`/`analyze`/`monitor` surface, named exports of `main.js`/`engine.js`/`mission-check.mjs`/`draft-job.mjs`/`monitor.js`, `draft-state.json` schema, `run-state.json` `subflowRuns` shape), and architecture docs.
- **Task-requested dimension**: *"Cross-reference against architecture docs for documented contract drift"* — `docs/architecture/mission-driver-baseline.md` was read in full and cross-referenced line-by-line against the live code. See Findings B1 / B2.
- **Method**: generic default multi-audit prompt (this repo has not tuned a project-specific one), applied across all seven mandated dimensions + the project-specific architecture-drift dimension. **Every** claim below was verified by reading the live source / running the real verification commands, not from the prior audit's memory — per AGENTS.md cold-replay rule.

## Verification Snapshot (replayed live during this audit)

| Command | Result |
| --- | --- |
| `npm --prefix tools/mission-driver test` | **533 pass / 0 fail** (10.7s); final line `prompt-check: OK — all prompt result-tag examples are well-formed.` |
| `git log --oneline -3` | `217af6d docs(mission-driver-draft-robustness): plan-2026-07-22-1106 architecture baseline doc sync (A1 a+b+c)` ← this commit **closed** the prior generation's headline A1 finding. |
| `git status --short` | **clean** — no uncommitted changes (the user-manual doc edits that were pending at the prior `c2a1ea9` snapshot are now committed). |

**Critical context**: the tree has advanced one remediation generation since the prior `planned`-status draft of this audit was written (then-HEAD `c2a1ea9` → now `217af6d`). Commit `217af6d` ("architecture baseline doc sync (A1 a+b+c)") landed specifically to close the prior audit's Finding A1. This audit therefore **re-verified A1 independently and confirms it is CLOSED** (evidence below), and reports only what this fresh cross-reference found.

## Prior-Generation Finding Status (re-verified live — A1 CLOSED)

| Prior finding | Live state at HEAD `217af6d` | Evidence |
| --- | --- | --- |
| **A1-a** public-exports list omitted `validateDraftDesc` + `draft-job.mjs` row | **CLOSED** | `mission-driver-baseline.md:97` now lists `validateDraftDesc`; `:98` adds a `src/draft-job.mjs` row with `startDraftJob`/`readDraftJob`/`listDraftJobs`/`validateDraftDesc`. Verified against live exports: `main.js:922` `export { cmdDraftMission, parseDraftArtifact, extractBriefGate, validateDraftDesc }`; `draft-job.mjs` exports at `:61,105,167,211`; cross-module consumer `monitor.js:33` imports them. |
| **A1-b** stale `main.js`/`engine.js`/`monitor.js` line numbers in the Public Exports section | **CLOSED** | `mission-driver-baseline.md:95` now states *"Citations are function-name-anchored (the `export` keyword is findable; line numbers rot)"* and the whole section dropped numeric citations. |
| **A1-minor** `parseRoadmapMarkdown` owner module | **CLOSED** | `mission-driver-baseline.md:100` now reads *"`parseRoadmapMarkdown` (defined in `roadmap-check.mjs`, re-exported here …)"*. Verified: `parseRoadmapMarkdown` is defined at `roadmap-check.mjs:41`. |

The full WI1–WI5 + mdr-remediate lineage (F1–F14, N1–N4, NF1–NF4) was spot-checked against the live diffs and remains closed (533/533 green). Not re-listed in full here because this generation found nothing new in those areas; the only open items are B1/B2 below.

## Findings

Ordered by severity. This audit found **two net-new LOW-severity findings**, both inside the same architecture contract doc the task asked to cross-reference, both non-blocking doc-accuracy nits. No code, test, flow, or runtime-contract defect was found.

### B1 — [LOW] Stale line-number citation for `_writeWorkflow` in the Run-State section (navigational rot)

- **Dimension**: owner-doc alignment · architecture/boundary impact · the task-requested "documented contract drift" dimension.
- **Live evidence**:
  - `mission-driver-baseline.md:63` — *"Written by `src/engine.js` via atomic tmp+rename (`_writeWorkflow`, `engine.js:427-436`)."*
  - Actual location: `_writeWorkflow()` is **defined at `engine.js:442-451`** (verified by read). Lines `427-440` are `_finalizeWorkflow` (`:428`), not `_writeWorkflow` — so a maintainer following the citation to "the atomic-write function" lands in the wrong function.
  - Same line's neighbour citation is also slightly long: `_wfClose` is cited at `engine.js:370-411` (`mission-driver-baseline.md:65`); the definition starts at `:370` (✓) but its body runs to `:426`, so `370-411` undershoots the end. (`_wfOpen` at `:331-368` is accurate.)
- **Why this recurs**: the A1-b remediation converted the **Public Exports** section to function-name anchors, but the **Run-State Shape** section (lines 61-81) was left on numeric citations — so the next code edit (the `mdr-remediate` engine shifts that moved `_writeWorkflow` from ~427 to 442) re-rotted it. This is the same defect class the mission already paid to close twice (design-doc F5, then architecture A1-b).
- **Impact**: navigational only — function names in the doc are still greppable, so a reader recovers. Not a contract break; runtime behavior and the atomic-write guarantee are intact (`_writeWorkflow` does tmp+rename at `:447-449`).
- **Severity**: LOW. Non-blocking.
- **Recommended fix (doc-only)**: apply the same anchor-first convention the Public Exports section already adopted — reword to *"`_writeWorkflow` (atomic tmp+rename, in `src/engine.js`)"* and drop or de-emphasize the line numbers in the Run-State section. One small pass; prevents the next re-rot cycle.

### B2 — [LOW] Mis-attribution of the `subflowRuns` sort invariant ("inside `_wfClose`" vs actual `_executeSubflowStep`)

- **Dimension**: owner-doc alignment · architecture/boundary impact · the task-requested "documented contract drift" dimension.
- **Live evidence**:
  - `mission-driver-baseline.md:79` — *"Ordering invariant: `subflowRuns` is sorted by `forEachIndex` on close (inside `_wfClose` in `engine.js`) so monitor.js / consumers see deterministic order regardless of concurrency resolve order."*
  - Actual location: the sort lives at **`engine.js:1134`** (`subflowRuns.sort((a, b) => a.forEachIndex - b.forEachIndex)`), which is inside **`_executeSubflowStep`** (the forEach drain, after `:1129-1131`), NOT inside `_wfClose` (`:370-426`). The code comment at `:1132-1133` explicitly owns the invariant: *"Results were collected in resolve order; restore forEachIndex order (contract: subflowRuns stays ordered by forEachIndex for monitor.js / consumers)."* `_wfClose` itself does not sort — it only pushes the (already-sorted) record the caller built.
  - A redundant defensive re-sort also exists on the consumer side at `monitor.js:350` inside `mergeSubflowChildren`.
- **Impact**: the **invariant holds** (the persisted record IS sorted by `forEachIndex`; pinned by `subflow-incremental.test.js` Case D — resolve order `[1,2,0]` yields `forEachIndex [0,1,2]`). The defect is purely that the doc names the wrong function as the enforcement site, which would mislead anyone debugging ordering and contradicts the doc's Update Rule (`:124`) on a live boundary.
- **Severity**: LOW. Non-blocking. (Raised separately from B1 because it is a wrong-attribution, not a stale line number — a reader cannot recover by re-grepping the line.)
- **Recommended fix (doc-only)**: reword `:79` to *"sorted by `forEachIndex` before close (inside `_executeSubflowStep` in `engine.js`; monitor.js re-sorts defensively in `mergeSubflowChildren`)"*.

## Clean Aspects (Re-Verified During This Audit)

- **533/533 tests pass** live (was 530 at the prior snapshot; +3, all green); `prompt-check: OK`; `lint:prompts` structurally chained into `npm test`.
- **WI1–WI5 implementations match their design owner docs** (`draft-robustness-design.md` §4.1–§4.5), verified at the live call sites:
  - WI1 `validateDraftDesc` (`draft-job.mjs:61`) wired into both gates — `main.js:325` (CLI) and `monitor.js:1233` (monitor 400, N2). Placeholders-first ordering + `minDescLength` config fallback match design §4.1 deviation note.
  - WI2 brief gate — `extractBriefGate` (`main.js:169`, `/is` regex after ANSI strip), enforcement branch at `main.js:429`, `<BRIEF_GATE>`/`<BRIEF_GATE_REASON>` marker contract in `mission-brief.md:39-41`. Three branches (pass/blocked/null) intact.
  - WI3 path unification — `{{backlogDir}}` present in both prompts (`mission-brief.md:13,36,39`; `mission-draft.md:13`); `parseDraftArtifact` warn at `main.js:214-223` uses `relative + startsWith("..")` per design §4.3.3.
  - WI4 cross-platform CLI — `pathToFileURL` comparison at `mission-check.mjs:107` (was the Windows false-positive defect; now green).
  - WI5 incremental persistence — `_wfAppendSubflowRun` (`engine.js:491`) with the `visits` guard, 3 call sites (`:1066,:1097,:1154` covering forEach concurrency=1, sliding-window, and non-forEach single-child). The `_onAgentStepUpdate` vs `_wfAppendSubflowRun` visits-guard asymmetry is documented in a decision comment at `engine.js:453-467` (prior N3 closure, Option B doc-only).
- **Engine zero-npm-dependency invariant** intact (`commander` still the only runtime dep).
- **Atomic-write discipline** (`_writeWorkflow` tmp+rename; `run-reconcile` Windows-aware rename-retry) unchanged.
- **Subflow `onStepUpdate` routing to child engine** (`engine.js:1197`) intact — prior `919f3aa` change, pinned by `subflow-state-isolation.test.js`.
- **Mission config for this mission** (`missions/mission-driver-draft-robustness.json`) `extends: "base"`, valid; `npm test`'s mission-check path confirms it.
- **Prior A1 (public-exports + `draft-job.mjs` row + `parseRoadmapMarkdown` owner)** genuinely CLOSED in the committed tree.

## Residual Risks by Dimension

| Dimension | Residual risk |
| --- | --- |
| Requirement correctness | None. WI1–WI5 + remediation match design §4.1–§4.5 and the closure logs. |
| Owner-doc alignment | **B1, B2** — two LOW doc-attribution inaccuracies in `mission-driver-baseline.md` Run-State section. Design-level owner docs (`draft-robustness-design.md`, `CONTEXT.md`) aligned. |
| Architecture / boundary impact | **B1/B2** (the contract doc the task asked to cross-reference). Public-exports surface now accurate (A1 closed). Broader `docs/architecture/` stubs (`system-baseline.md`/`module-boundaries.md`/`project-vision.md`) remain template stubs — adjudicated P3 backlog defer (trigger: second cross-cutting tool lands), not mission-specific. |
| Verification adequacy | None. 533/533 green; `lint:prompts` chained; ANSI-wrapped-marker, monitor-400, DEEP_AUDIT transition, and subflowRuns-ordering cases all pinned. |
| Regression risk | None material. Existing suite green; no code change in this generation. |
| Routing / skill-selection correctness | None. WI plans routed as `implementation-only`, `Skill: none`; correct. |
| Backlog / autonomy-policy drift | None. All plans `completed`; roadmap WI1–WI5 `done`; prior audit headers reconciled. |
| Project-specific (architecture-doc contract drift) | **B1, B2** — task-requested dimension answered: yes, two LOW-severity drift items remain, both non-blocking doc-attribution fixes in `mission-driver-baseline.md`. The material drift (A1) is closed. |

## Recommendation

**passes multi-dimensional audit** — there is **no blocking issue**.

All code, tests, flows, runtime contracts, and the public-exports surface are correct and green (533/533). The prior generation's headline finding (A1 — missing `validateDraftDesc` / `draft-job.mjs` exports / `parseRoadmapMarkdown` owner) is independently confirmed CLOSED by commit `217af6d`. The only residual items are **B1** (one stale `_writeWorkflow` line-number citation, plus a slightly-short `_wfClose` span) and **B2** (the `subflowRuns`-sort invariant is attributed to `_wfClose` but is actually enforced in `_executeSubflowStep`) — both LOW, both doc-only, both in the architecture doc the task scoped. They are reported as `issues` (not `clean`) because they are genuine documented-contract drift, but neither blocks the mission.

A single small doc-sync pass on `docs/architecture/mission-driver-baseline.md` (extend the anchor-first convention from the Public Exports section into the Run-State section, and correct the sort-invariant attribution) would clear B1/B2 and let a future re-audit return `clean`.

**Solo-review limitation** (AGENTS.md Reviewer-Availability Fallback): no second reviewer/subagent was available; this mission is non-protected and non-high-risk, so a solo cold-replay pass is permitted and recorded here.

<AI_STEP_RESULT>issues</AI_STEP_RESULT>
