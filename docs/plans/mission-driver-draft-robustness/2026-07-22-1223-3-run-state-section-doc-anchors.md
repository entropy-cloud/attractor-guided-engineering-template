# 2026-07-22-1223-3 Run-State Section Doc Anchors (B1 + B2)

> Plan Status: completed
> Last Reviewed: 2026-07-22
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-mission-driver-draft-robustness.md` (findings B1, B2) AND `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-multi-audit-mission-driver-draft-robustness.md` (findings B1, B2 — same two findings, surfaced independently by both audits)
> Related: `docs/plans/mission-driver-draft-robustness/2026-07-22-1106-2-architecture-baseline-doc-sync.md` (the prior A1 doc-sync pass that anchor-ized the Public Exports section but missed the Run-State section — the precedent this plan extends)
> Audit: required

## Current Baseline

Live state at HEAD `217af6d` (audited 2026-07-22 07:55, B1+B2 evidence re-verified during plan authoring):

- **B1 — Stale `_writeWorkflow` line citation (navigational rot)**:
  - `docs/architecture/mission-driver-baseline.md:63` reads: *"Written by `src/engine.js` via atomic tmp+rename (`_writeWorkflow`, `engine.js:427-436`)."*
  - Actual: `_writeWorkflow()` is defined at **`engine.js:442-451`** (verified by read during plan authoring). Lines `427-440` are `_finalizeWorkflow` (`:428`), not `_writeWorkflow`. A maintainer following "the atomic-write function" lands in the wrong function.
  - Neighbour `:65` `_wfClose engine.js:370-411` also undershoots (body runs to `:426`).
  - **Strengthening (auditor's note)**: the closure log `docs/logs/2026/07-22.md:18` records that the `217af6d` doc-sync pass explicitly *re-verified* `_writeWorkflow engine.js:427-436` as **"accurate"** — that re-verification was wrong, which is why this citation survived the pass that was specifically supposed to close drift. The Public-Exports section was anchor-ized in `217af6d`; the Run-State section was not, so it re-rotted.
- **B2 — `subflowRuns` sort invariant mis-attributed to `_wfClose`**:
  - `docs/architecture/mission-driver-baseline.md:79` reads: *"`subflowRuns` is sorted by `forEachIndex` on close (inside `_wfClose` in `engine.js`) so monitor.js / consumers see deterministic order regardless of concurrency resolve order."*
  - Actual: the sort is at **`engine.js:1134`** (`subflowRuns.sort((a, b) => a.forEachIndex - b.forEachIndex)`), inside **`_executeSubflowStep`** (the forEach drain, after `:1129-1131`), with an owning code comment at `:1132-1133`. `_wfClose` does **not** sort — it only persists the already-sorted record. (`monitor.js:350` re-sorts defensively in `mergeSubflowChildren`.)
  - The **invariant holds** (pinned by `subflow-incremental.test.js` Case D — resolve order `[1,2,0]` yields `forEachIndex [0,1,2]`); the defect is purely the wrong enforcement-site attribution.
- **Severity**: both LOW. Non-blocking doc-only. But: B1 cannot be recovered by re-grepping (the function name is correct, the line span is wrong); B2 cannot be recovered by re-grepping the line (the function name itself is wrong). Both survived a doc-sync pass that was supposed to close them — the durable fix is the anchor-first convention the Public Exports section already adopted, applied to the Run-State section.
- **Compounding factor**: both findings were surfaced independently by the open-ended audit (adversarial pass) AND the multi-dimensional audit (structured pass) at the same 07:55 timestamp. The convergence is high-confidence evidence the defects are real, not a single audit's blind spot.

## Goals

- Apply the function-name-anchor-first convention (already adopted in the Public Exports section by `217af6d`) to the Run-State section of `mission-driver-baseline.md`, so the next engine shift does not re-rot the numeric citations (closes B1 + B2's "navigational rot" recurrence mechanism).
- Correct the specific B1 inaccuracy: the `_writeWorkflow` line-number citation (drop or de-emphasize the numeric span; the function name is the durable anchor).
- Correct the specific B2 inaccuracy: the `subflowRuns` sort-invariant attribution (re-word to name `_executeSubflowStep` as the enforcement site, with the `mergeSubflowChildren` defensive re-sort noted).
- Sweep the rest of the Run-State section for any other stale numeric citation that the same pass should clear while the editor is in the file (prevent the next re-audit from finding a third residual).

## Non-Goals

- Re-anchoring the Public Exports section (already done by `217af6d`).
- Filling the broader `docs/architecture/` template stubs (`system-baseline.md` / `module-boundaries.md` / `project-vision.md`) — adjudicated P3 backlog defer in prior audits, trigger: second cross-cutting tool lands; not in scope here.
- Touching `design/draft-robustness-design.md`, `mission-design.md`, or any other owner doc — B1+B2 are scoped to `mission-driver-baseline.md`'s Run-State section only.
- Changing any code (`engine.js`, `monitor.js`) — the invariants hold; this plan is doc-only.
- Re-running the full test suite as a closure gate (no code change → no behavioral verification needed; the closure proof is the doc-vs-code re-verification, recorded in the log).

## Task Route

- Type: `implementation-only change` (B1+B2 are doc-only corrections; no contract / API / auth / data / integration / deployment change — the invariants the doc describes already hold in code, this plan only makes the doc name them correctly).
- Owner Docs: `docs/architecture/mission-driver-baseline.md` (the file being corrected — it IS the owner doc); the code it cites (`tools/mission-driver/src/engine.js` lines `:442-451` for `_writeWorkflow`, `:370-426` for `_wfClose`, `:1132-1134` for the `_executeSubflowStep` sort; `tools/mission-driver/src/monitor.js:350` for the defensive re-sort).
- Skill Selection Basis: `Skill: none`. The work is a localized doc-sync pass extending an already-adopted convention; no reusable skill method applies beyond the standard owner-doc-alignment discipline encoded in `mission-driver-baseline.md`'s own Update Rule (`:125`) + AGENTS.md "Documentation Ownership".

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline. This plan is doc-only; no verification command beyond a doc-vs-code re-read is required.

## Execution Plan

### Phase 1 - Re-anchor the Run-State section's stale numeric citations (B1) and mis-attributions (B2)

Status: completed
Targets: `docs/architecture/mission-driver-baseline.md` (Run-State section, `:61-81`)
Skill: none

- Item Types: `Fix`
- Prereqs: none (builds on HEAD `217af6d`; the cited code lines are stable as of this commit and re-verified during plan authoring)

- [x] `Fix` — B1: reword `mission-driver-baseline.md:63` to drop the stale `engine.js:427-436` span and use the function-name-anchor-first convention the Public Exports section adopted. Concretely: *"Written by `src/engine.js` via atomic tmp+rename (`_writeWorkflow` in `src/engine.js`; the function name is the durable anchor — line numbers rot as the engine grows)."* (Or equivalent wording that makes the function name primary and the line number secondary / absent.) Re-verify against live `engine.js` that `_writeWorkflow` is still the function name (it is, at `:442-451`); if the line number is retained, correct it to the live span.
  - Skill: none
- [x] `Fix` — B1 neighbour: reword `mission-driver-baseline.md:65` `_wfClose engine.js:370-411` (which undershoots the actual `:370-426` body span) using the same anchor-first convention. Concretely: *"Each `steps[]` entry (opened by `_wfOpen` in `src/engine.js`, closed by `_wfClose` in `src/engine.js`)."* — drop the line spans, keep the function names as anchors. Also reword the `_wfOpen engine.js:331-368` citation in the same line for consistency.
  - Skill: none
- [x] `Fix` — B2: reword `mission-driver-baseline.md:79` to attribute the `subflowRuns` sort invariant to the correct enforcement site. Concretely: *"`subflowRuns` is sorted by `forEachIndex` before close (inside `_executeSubflowStep` in `src/engine.js`; `monitor.js`'s `mergeSubflowChildren` re-sorts defensively on the consumer side) so monitor.js / consumers see deterministic order regardless of concurrency resolve order."* (Mirrors the auditor's recommended rewording; preserves the invariant description that `subflow-incremental.test.js` Case D pins.)
  - Skill: none
- [x] `Fix` — Sweep: while the editor is in the Run-State section, re-verify every other function-name-and-line citation in `:61-81` against live `engine.js` / `monitor.js` (e.g. `_wfOpen`, `_wfClose`, `_executeSubflowStep`, `_wfAppendSubflowRun`, `mergeSubflowChildren`, `_subflowId` convention). For each, either (a) correct the line span to the live value, or (b) prefer the anchor-first form (function name primary, line span absent). Record any additional correction in the log entry (so the next audit can verify the sweep was not just B1+B2 cherry-picked).
  - Skill: none

Exit Criteria:

- [x] `mission-driver-baseline.md:63` no longer contains the stale `engine.js:427-436` span; the `_writeWorkflow` reference uses the anchor-first form (function name primary).
- [x] `mission-driver-baseline.md:65` `_wfOpen` / `_wfClose` citations use the anchor-first form; the `_wfClose :370-411` undershoot is gone.
- [x] `mission-driver-baseline.md:79` attributes the `subflowRuns` sort to `_executeSubflowStep` (not `_wfClose`); the `mergeSubflowChildren` defensive re-sort is noted.
- [x] Sweep complete: every function-name citation in `:61-81` re-verified against live code; additional corrections (if any) recorded in the log entry.
- [x] Re-read the edited section end-to-end and confirm the narrative still flows (the anchor-first form should not break the surrounding sentences).

### Phase 2 - Record the doc-sync log + close

Status: completed
Targets: git index (commit), `docs/logs/2026/07-22.md`, `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-*.md` + `2026-07-22-0755-multi-audit-*.md` (audit-status flip is owned by the mission-driver closure step, not this plan — see Closure)
Skill: none

- Item Types: `Proof`
- Prereqs: Phase 1 complete

- [x] `Proof` — Re-read the edited `mission-driver-baseline.md:61-81` against live `engine.js` / `monitor.js` one final time (cold-replay — fresh read of the doc, then fresh read of the code, then compare). Confirm: (a) B1 citation corrected; (b) B2 attribution corrected; (c) sweep found and fixed any additional drift (or recorded "none found"). This cold-replay is the closure proof for a doc-only plan (no test suite can assert doc-vs-code alignment).
  - Skill: none
- [x] `Proof` — Commit the batch as one verify-then-committed unit: the Phase 1 doc edits + the Phase 2 log entry from the item below. Use a commit message that names B1 and B2 and explicitly notes "doc-only, no code change, no test run required — closure proof is the cold-replay doc-vs-code re-verification recorded in the log entry". Per AGENTS.md Docs Maintenance, the doc-sync-green status appears in the log entry and the commit message.
  - Skill: none
- [x] `Proof` — Add a dated `docs/logs/2026/07-22.md` (top entry, reverse chronological) recording: B1 + B2 closed, the anchor-first convention extended into the Run-State section, the sweep result (additional corrections or "none"), and the cold-replay closure proof. Cite this plan path. Note that this plan is doc-only and therefore the standard `pnpm test` gate does not apply (no code change); the closure proof is the cold-replay re-verification, recorded explicitly so future debugging knows the basis.
  - Skill: none

Exit Criteria:

- [x] `git status --short` shows no uncommitted in-scope files from this plan (`mission-driver-baseline.md`, the log entry, this plan file).
- [x] `git log --oneline -1` shows the new commit; the commit message names B1 + B2 and notes the doc-only closure basis.
- [x] `docs/logs/2026/07-22.md` top entry records B1 + B2 closed with the cold-replay closure proof.

## Draft Review Record

- Independent draft review iteration 1: `accept` (independent fresh session `ses_077e75d2effeHpE1aMCDf379pP`, 2026-07-22) — no blocking issues. Reviewer independently verified every citation: `_writeWorkflow` at `engine.js:442-451` (NOT the doc's `:427-436`), `_wfClose` spanning `:370-426` (NOT the doc's `:370-411`), `subflowRuns.sort(...)` at `:1134` inside `_executeSubflowStep` (NOT `_wfClose`), `monitor.js:349-350` defensive re-sort inside `mergeSubflowChildren`, the prior `217af6d` doc-sync log mis-verifying `:427-436` as accurate (B1 strengthening claim corroborated). All 13 Minimum Rules satisfied; Rule 4 bundling correct (shared `:61-81` closure surface); Plan Decision Table compliant (full plan warranted — B1+B2 are doc-vs-code conflicts per the Planning Rule); cold-replay closure basis explicitly recorded for doc-only work; sweep bounded to `:61-81`; Non-Goals deferral recorded in `Deferred But Adjudicated` with named reopening trigger ("second cross-cutting tool lands"). Non-blocking notes (no change required): (a) Phase 1 "Concretely: ..." wording suggestions sit at the edge of Rule 6 but are appropriate since the wording IS the deliverable; (b) adjacent drift of the same class in `CONTEXT.md` ("关键约束" phrases the forEach-end sort via `_wfClose`) exists outside this plan's scope — watch-item for a future pass, not a block.

## Closure Gates

- [x] in-scope behavior is complete (B1 + B2 corrected; Run-State section anchor-ized; sweep complete)
- [x] relevant docs are aligned (`mission-driver-baseline.md` Run-State section matches live code; `docs/logs/2026/07-22.md` updated with B1+B2 closure + cold-replay proof)
- [x] verification has run: cold-replay doc-vs-code re-verification (Phase 2 item 1) — this plan is doc-only, so no `pnpm test` gate applies; the closure basis is recorded explicitly in the log entry. (If the mission-driver closure step requires a full `pnpm --prefix tools/mission-driver test` run anyway, it can be added at mission closure; this plan's own closure gate is the cold-replay.) — Note: `pnpm --prefix tools/mission-driver test` was run anyway as a known-good-baseline checkpoint → 551 pass / 0 fail (matches the `9bd3cbf` O7 baseline; doc-only change introduced no regressions).
- [x] no in-scope item downgraded to deferred/follow-up (the Phase 1 sweep is part of the in-scope contract, not a follow-up; if the sweep finds a third drift that requires a separate decision, it is recorded as a new finding rather than silently absorbed)
- [x] independent draft review completed and recorded (Draft Review Record above)
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent (separate subagent or fresh-session cold-replay per AGENTS.md Reviewer-Availability Fallback — this plan is non-protected and non-high-risk: source audits rated B1 + B2 LOW doc-only nits; no code / contract / API / auth / data / integration / deployment change whatsoever; this is the lowest-risk plan class under the Plan Decision Table)
- [x] closure evidence exists in files (commit + log entry + the corrected Run-State section ARE the evidence)

## Deferred But Adjudicated

### Project-wide architecture-doc template debt

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: B1 + B2 are scoped to `mission-driver-baseline.md`'s Run-State section; the broader `docs/architecture/` template stubs (`system-baseline.md` / `module-boundaries.md` / `project-vision.md`) are adjudicated P3 backlog defer in prior audits (trigger: second cross-cutting tool lands). This plan does not re-open that adjudication.
- Successor Required: `no` — owned by the existing P3 backlog trigger, not by this plan.

## Closure

Status Note: B1 + B2 corrected by extending the function-name-anchor-first convention (already adopted by the Public Exports section in `217af6d`) into the Run-State section of `mission-driver-baseline.md` — the `_writeWorkflow` stale `:427-436` span (B1), the `_wfOpen`/`_wfClose` line spans including the `_wfClose :370-411` undershoot (B1 neighbour), and the `subflowRuns` sort mis-attribution to `_wfClose` (B2, actually `_executeSubflowStep` at `engine.js:1134` with `mergeSubflowChildren`'s defensive re-sort noted) are all reworded to function-name-primary form. The Phase 1 sweep re-verified every other citation in `:61-81` (`_subflowId`, `_wfAppendSubflowRun`, `mergeSubflowChildren`, `_executeSubflowStep`) and found them already anchor-first — no additional drift. Cold-replay closure proof (fresh doc read vs fresh code read) recorded in `docs/logs/2026/07-22.md`. `pnpm --prefix tools/mission-driver test` re-run as a known-good-baseline checkpoint → 551 pass / 0 fail (doc-only, no regressions). Green baseline committed.

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay pass (no second reviewer available; non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback — source audits rated B1 + B2 LOW doc-only nits; lowest-risk plan class under the Plan Decision Table). Independent draft review completed earlier (1 iteration, recorded in Draft Review Record — reviewer independently re-verified every citation live).
- Evidence: the corrected `mission-driver-baseline.md:63`/`:65`/`:79` lines (anchor-first form); `docs/logs/2026/07-22.md` top entry recording B1+B2 closure + cold-replay proof + sweep result (none additional); the commit hash below; `pnpm --prefix tools/mission-driver test` → 551 pass / 0 fail.
