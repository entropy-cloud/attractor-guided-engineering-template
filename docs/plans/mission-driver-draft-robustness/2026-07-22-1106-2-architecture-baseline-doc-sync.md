# 2026-07-22-1106-2 Architecture Baseline Doc Sync (A1 — all 3 facets)

> Plan Status: completed
> Last Reviewed: 2026-07-22
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-multi-audit-mission-driver-draft-robustness.md` (finding A1, facets a + b) AND `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-mission-driver-draft-robustness.md` (finding A1 carried forward, facets a + b re-verified + facet c net-new from O4's refactor)
> Related: `docs/plans/mission-driver-draft-robustness/2026-07-22-1106-1-mergesubflowchildren-commit-and-harden.md` (must land its commit first so facet c describes shipped behavior); earlier doc-sync lineage `2026-07-21-1005-1` / `2026-07-21-1605-1` (closed — these created and populated `mission-driver-baseline.md` originally)
> Audit: required

## Current Baseline

Live state at HEAD `c2a1ea9` + uncommitted working tree (re-verified 2026-07-22 11:06):

- **The contract doc exists and is largely accurate** — `docs/architecture/mission-driver-baseline.md` (124 lines) was created by `2026-07-21-1605-1` Phase 2 to lift mission-driver's public contracts to the architecture level (closing F4/N1-arch). Its CLI / mission-schema / draft-state / run-state / marker-contract sections are still correct. This is a refresh pass, not a rebuild.
- **A1 facet (a) — Public-Exports list is incomplete/wrong (live-verified)**:
  - `:97` reads `src/main.js — cmdDraftMission, parseDraftArtifact, extractBriefGate (main.js:964)`. Actual export statement `src/main.js:922`: `export { cmdDraftMission, parseDraftArtifact, extractBriefGate, validateDraftDesc };` — **`validateDraftDesc` is missing** AND `:964` does not exist (file EOF is `:927`). `validateDraftDesc` is a genuine cross-module contract: defined `src/draft-job.mjs:61`, re-exported via `src/main.js:18,922`, imported+called by `src/monitor.js:33,1219` (the N2 gate — closed in the prior remediation batch).
  - **No `src/draft-job.mjs` row at all** in the Public Exports section, despite `draft-job.mjs` exporting 4 public functions (`validateDraftDesc`, `startDraftJob`, `readDraftJob`, `listDraftJobs`) all consumed cross-module by `monitor.js`.
  - `:99` reads `src/monitor.js — parseRoadmapMarkdown`. `parseRoadmapMarkdown` is actually defined in `src/roadmap-check.mjs:41` and only re-exported by `monitor.js:64`. AND `monitor.js` exports three other public functions (`mergeSubflowChildren`, `handleStartDraft`, `startMonitor`) that the doc does not list.
- **A1 facet (b) — stale line-number citations (live-verified)**:
  - `:30` CLI registration `(main.js:853-922)` & `(:926-954)` → actual subcommands `:811-880`, main command `:884-912`, `program.parse()` at `:926`; `:926-954` overruns EOF.
  - `:87` `extractBriefGate (main.js:184-189)` → actual `:169-176`.
  - `:79` `_wfAppendSubflowRun (engine.js:461-473)` → actual `:476-488`; `_subflowId (engine.js:1032,1059,1116)` → actual `:1047,1074,1131`; "sorted by forEachIndex (`engine.js:1103-1104`)" → actual `:1119`.
  - `:81` `mergeSubflowChildren (monitor.js:267-)` → actual `:249`.
  - Pattern: a consistent +12 to +18 line positive shift localized to post-baseline code regions (N1's `main.js` +~15 edits; N3/H2's `engine.js` subflow-region edits). The `mission-check.mjs` citations (`REQUIRED_FIELDS :13`, `REQUIRED_COMMANDS :14`, `resolveExtends :24-50`) and the `_writeWorkflow`/`_wfOpen`/`_wfClose` citations (`engine.js:427-436` / `:331-368` / `:370-411`) remain accurate — confirms the drift is localized, not wholesale.
- **A1 facet (c) — stale behavioral description once O4 commits (live-pending)**: `:81` states *"Monitor's `mergeSubflowChildren` fallback ... is retained as defense-in-depth for orphan children."* Sibling plan 1's commit (O4) changes `mergeSubflowChildren` from a gated fallback into the **primary live-state reader** — it now always scans disk and merges live `status`/`steps`/`currentStep` over the `subflowRuns` seed. "Defense-in-depth fallback" mischaracterizes the new behavior. This facet is latent until plan 1's commit lands — which is why this plan executes **after** plan 1.
- **The doc's own Update Rule (`:124`)**: *"When a public contract in this file changes supported behavior, update this doc in the same change and refresh the cited detailed owner doc."* The N1/N3/H2 code edits should have triggered this; they did not. This plan honors the Update Rule retroactively.

## Goals

- Restore `docs/architecture/mission-driver-baseline.md`'s accuracy against its own Update Rule after the N1/N3/H2/O4 code edits: complete the Public-Exports list, anchor-ize the rotted line numbers, and correct the `mergeSubflowChildren` behavioral description (closes A1 facets a + b + c across both open audits).
- Adopt the **function-name-anchor-primary** citation strategy this mission already chose for the F5 design-doc fix, so the architecture doc does not re-rot on the next code edit.

## Non-Goals

- Changing any code, tests, flows, or prompts (this is a doc-only plan).
- Filling the broader `docs/architecture/` template stubs (`system-baseline.md`, `module-boundaries.md`, `project-vision.md`) — adjudicated P3 backlog defer in prior audits (trigger: second cross-cutting tool lands), not mission-driver-specific.
- Re-architecting the Public Exports section's structure — only its content (add the missing entries, correct the wrong ones).
- Touching the design-level owner docs (`draft-robustness-design.md`, `mission-design.md`) — they were aligned by the prior `1005-1` / `1605-1` batches and are not in drift.

## Task Route

- Type: `implementation-only change` (doc-only refresh of one contract file; no code/contract behavior change).
- Owner Docs: `docs/architecture/mission-driver-baseline.md` (this file IS the owner doc being fixed); its own `:110-121` "Detailed Owner Docs" table cites the design docs as detail owners (unchanged).
- Skill Selection Basis: `Skill: none`. The work is a localized doc-sync against verified live locations; no reusable skill method applies. The verification model is "re-read the live code, confirm every cited location exists".

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline. No verification commands beyond reading the live code locations (this plan does not change runtime behavior; the suite remains green from plan 1's commit).

## Execution Plan

### Phase 1 - Refresh `mission-driver-baseline.md` (A1 facets a + b + c)

Status: completed
Targets: `docs/architecture/mission-driver-baseline.md`
Skill: none

- Item Types: `Fix`
- Prereqs: sibling plan `2026-07-22-1106-1-mergesubflowchildren-commit-and-harden.md` Phase 2's commit MUST land first, so facet (c) describes shipped behavior rather than an in-flight refactor. If plan 1 is blocked or deferred, facet (c) is split out to a successor (see Deferred But Adjudicated).

- Item Types (phase-level): Fix-heavy (3 of 4 items tagged `Fix`; item 4 is `Proof` — the verification re-read) per Plan Authoring Guide Rule 7.

- [x] `Fix` (facet a) — Public Exports section (`:93-100`): (1) add `validateDraftDesc` to the `src/main.js` row and correct the citation from `main.js:964` to the actual export statement location (`main.js:922`, with `validateDraftDesc` defined in `draft-job.mjs:61`); (2) add a new `src/draft-job.mjs` row listing `startDraftJob`, `readDraftJob`, `listDraftJobs`, `validateDraftDesc` (all `export function`, consumed cross-module by `monitor.js`); (3) correct `parseRoadmapMarkdown`'s owner module to `src/roadmap-check.mjs` (re-exported by `monitor.js`); (4) add `mergeSubflowChildren`, `handleStartDraft`, `startMonitor` to the `src/monitor.js` row. Prefer function-name anchors over line numbers in the export citations (line numbers rot; the export keyword is findable).
  - Skill: none
- [x] `Fix` (facet b) — Convert rotted line-number citations to **function-name-anchor primary** across `:30` (CLI registration), `:79` (`_wfAppendSubflowRun`, `_subflowId`, sort-on-close), `:81` (`mergeSubflowChildren`), `:87` (`extractBriefGate`). Strategy (the one this mission chose for the F5 design-doc fix): each citation becomes `<function/section name> in <file>` with the line number either dropped or secondary. The `mission-check.mjs` citations (`:13`, `:14`, `:24-50`) and the `_writeWorkflow`/`_wfOpen`/`_wfClose` citations are still accurate — leave them unless they fall in the same paragraph being rewritten. Re-verify every retained line number by re-reading the live code during this edit.
  - Skill: none
- [x] `Fix` (facet c) — Rewrite `:81`'s last sentence so `mergeSubflowChildren` is described as the **primary live-state reader** (disk = source of truth for `status`/`steps`/`currentStep`; `subflowRuns` provides `forEachItem` metadata the disk file does not carry), not as a "defense-in-depth fallback for orphan children". This edit must land AFTER sibling plan 1's commit so the description matches shipped behavior. The detailed seed-vs-disk-merge rationale lives in the `monitor.js:249-270` comment block already; the architecture doc should summarize it in one or two sentences and cite the comment block, not duplicate it.
  - Skill: none
- [x] `Proof` — Re-read the entire refreshed `mission-driver-baseline.md` top-to-bottom and confirm: every Public-Exports entry names a real `export function`/`export {}` statement in the cited file; every retained line number exists (file EOF not overran); no remaining "fallback"/"defense-in-depth" wording mischaracterizes the now-primary `mergeSubflowChildren`; the Update Rule (`:124`) is honored. (Tagged `Proof`, not `Fix`, because this is verification work redundant with the Exit Criteria checkboxes; the phase is therefore Fix-heavy 3/4 per Rule 7.)
  - Skill: none

Exit Criteria:

- [x] Public Exports section lists `validateDraftDesc` + the full `draft-job.mjs` row + the correct `parseRoadmapMarkdown` owner module + the three missing `monitor.js` public functions — all verified against live `export` statements.
- [x] All previously-rotted `main.js` / `engine.js` / `monitor.js` line-number citations are either anchor-ized or re-verified accurate.
- [x] `:81` describes `mergeSubflowChildren` as primary live-state reader (matching plan 1's committed behavior), with no stale "fallback"-as-primary wording.
- [x] `docs/logs/2026/07-22.md` updated with a short entry noting the architecture-doc refresh and that it depends on plan 1's commit.

## Draft Review Record

- Independent draft review iteration 1: acceptable as-is (independent-review-1, fresh-session cold-replay `ses_07831d280ffet35ZORz5m0EKTV`, 2026-07-22) because every Current-Baseline claim was reproduced against live code (main.js EOF `:927`, export at `:922` incl. `validateDraftDesc`; `draft-job.mjs` 4 public exports at `:61`/`:105`/`:167`/`:211`; `parseRoadmapMarkdown` owner `roadmap-check.mjs:41`; all 6 rotted citations + 7 leave-alone citations verified correct; facet (c) stale-once-plan-1-commits confirmed against working-tree `mergeSubflowChildren` `:249-339` which is now primary live-state reader). Scope is exactly A1 a+b+c, doc-only, single result surface, minimal plan-1 coupling, non-degradable facets not downgraded. Non-blocking polish applied: item 4 retagged from `Fix` to `Proof` (phase declaration corrected to Fix-heavy 3/4 per Rule 7).

## Closure Gates

- [x] in-scope behavior is complete (all 3 A1 facets closed; Public Exports accurate; citations anchor-ized)
- [x] relevant docs are aligned (`mission-driver-baseline.md` now honors its own Update Rule; `docs/logs/2026/07-22.md` updated)
- [x] verification has run: re-read every cited location against live code (no test suite change — this is doc-only; the suite remains green from plan 1's commit)
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files (the refreshed doc + log entry)

## Deferred But Adjudicated

### Facet (c) if sibling plan 1 is blocked

- Classification: `watch-only residual`
- Why Not Blocking Closure: facets (a) and (b) do not depend on plan 1 and can close independently. Facet (c) is the only dependency. If plan 1's commit is blocked or deferred, this plan closes facets (a) + (b) and splits facet (c) into a successor plan that runs once plan 1 lands.
- Successor Required: `yes` — trigger condition: sibling plan `2026-07-22-1106-1` Phase 2 commit lands → re-open this plan (or a successor) to rewrite `:81`.

## Closure

Status Note: A1 is a single closure surface — `mission-driver-baseline.md` honoring its own Update Rule. All three facets touch the same file and the same closure criterion (doc accuracy against live code). Closure requires plan 1's commit to have landed first (for facet c) OR facet (c) split to a successor per the Deferred adjudication.

Closure Audit Evidence:

- Auditor / Agent: opencode solo cold-replay closure pass (AGENTS.md Reviewer-Availability Fallback — non-protected, non-high-risk doc-only mission; independent draft review already recorded in Draft Review Record iteration 1).
- Evidence: refreshed `docs/architecture/mission-driver-baseline.md` — facet (a) Public Exports now lists `validateDraftDesc` + the `draft-job.mjs` row + correct `parseRoadmapMarkdown` owner + the three missing `monitor.js` functions (all verified against live `export` statements); facet (b) all six rotted citations (`:30`/`:79`/`:81`/`:87`) converted to function-name-anchor primary, leave-alone citations re-verified accurate; facet (c) `:81` now describes `mergeSubflowChildren` as the primary live-state reader with no "fallback"/"defense-in-depth" wording. `docs/logs/2026/07-22.md` new top entry records the refresh + plan-1 dependency. Sibling plan 1's commit `caf741e` confirmed landed via `git log` (facet c describes shipped behavior). Verification: `pnpm --prefix tools/mission-driver test` → 532 pass / 0 fail (doc-only, suite unchanged from plan 1's green baseline). No `> Work Item:` label → roadmap flip N/A; front matter uses `> Source:` not `> Source Audits:` → source-audit close omitted per step-4c rule (same convention as mdr-remediate-7).
