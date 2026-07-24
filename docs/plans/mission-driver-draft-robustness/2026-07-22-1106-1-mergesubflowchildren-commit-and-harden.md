# 2026-07-22-1106-1 mergeSubflowChildren Commit-And-Harden (O4 + O5)

> Plan Status: completed
> Last Reviewed: 2026-07-22
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-mission-driver-draft-robustness.md` (findings O4, O5)
> Related: `docs/plans/mission-driver-draft-robustness/2026-07-22-1106-2-architecture-baseline-doc-sync.md` (A1 facet (c) depends on this plan's commit landing first)
> Audit: required

## Current Baseline

Live state at HEAD `c2a1ea9` + uncommitted working tree (audited 2026-07-22 07:55, re-verified 2026-07-22 11:06):

- **Uncommitted batch in working tree**: `tools/mission-driver/src/monitor.js`, `tools/mission-driver/test/subflow-state-isolation.test.js`, `tools/mission-driver/web/src/components/run/StepTimeline.vue`, `tools/mission-driver/docs/user-manual.en.md`, `tools/mission-driver/docs/user-manual.zh.md`. HEAD `c2a1ea9` itself is 530/530 green; the working tree is currently 531/531 green (re-verified: `pnpm --prefix tools/mission-driver test` → `pass 531 / fail 0` + `prompt-check: OK`).
- **O4 refactor (uncommitted)**: `mergeSubflowChildren` (`src/monitor.js:249`) was rewritten from a gated fallback into the **primary live-state reader** — it now always scans disk and merges live `status`/`steps`/`currentStep` over the `subflowRuns` seed. The seed loop (`:279`) reads `r.file` directly via `readSubflowState` (the fix that restored the `:99` regression mid-audit). A new narrow test `:98` ("fills live state from disk when subflowRuns placeholder has file=null") covers the new `file:null` path. `StepTimeline.vue` gates the "📋 Plan N" label behind `v-if="group.forEachItem"` (correctly suppresses the label for non-forEach subflows like `DEEP_AUDIT`).
- **O4 process gap (live)**: the batch was demonstrably broken at audit start (stash-confirmed 6/7 fail on `subflow-state-isolation.test.js:99` `merges child state files into step.children tree` because the synthetic `SUB` step has no `visits` field → prefix `"SUB-undefined-"` matched nothing). It recovered to 531 green only via a concurrent edit that restored `readSubflowState(runDir, r.file)`. **The batch is still uncommitted**, so "green now" is not locked in.
- **O5 latent fragility (live)**: `src/monitor.js:295` builds `const prefix = \`${step.name}-${step.visits}-\`;`. When `step.visits` is `undefined` (as in the `:99` test step), `prefix` becomes `"SUB-undefined-"` and `matching` is `[]`, so the disk-scan merge loop is a silent no-op. Today this is masked because step 1 of the seed loop reads `r.file` directly — so a present `subflowRuns[i].file` still populates `steps`. But the disk scan is the **sole mechanism** for the `file:null` placeholder case (the refactor's whole purpose); if `visits` is ever absent there too, that case silently regresses to empty `steps`. No test pins the `visits`-absent + `file:null` combination.
- **Production invariant**: the engine always writes `visits` on real subflow steps (`engine.js` `_wfOpen` increments `visits` on every entry). So O5 is latent, not a live production defect — but the `:99` test step omits it, proving the coupling is trip-prone under refactor.

## Goals

- Lock in the currently-green `mergeSubflowChildren` + `StepTimeline.vue` + test refactor by committing it as one verify-then-committed unit with a verification-green log entry (closes O4).
- Harden `mergeSubflowChildren` against absent `step.visits` so the disk-scan path no longer silently no-ops, and pin the behavior with a `visits`-absent regression test (closes O5).
- Adjudicate whether the "each refactor of `mergeSubflowChildren` re-breaks the `:99` contract" pattern has recurred enough to promote into a lesson/check (AGENTS.md Operating Rule 15).

## Non-Goals

- Rewriting `mergeSubflowChildren` further or changing its public contract (the current merge semantics are correct and 531 green; this plan only adds a guard + a test + a commit).
- Touching `StepTimeline.vue` behavior (the `v-if="group.forEachItem"` gate is correct per the open-audit's Clean Aspects — it ships unchanged in this plan's commit).
- Updating `docs/architecture/mission-driver-baseline.md` `:81` to describe `mergeSubflowChildren` as primary reader — that is owned by sibling plan `2026-07-22-1106-2` (A1 facet (c)), which executes after this plan's commit lands.
- Filling the broader `docs/architecture/` template stubs (adjudicated P3 defer in prior audits, not mission-specific).

## Task Route

- Type: `bug investigation` (O4 is a process/latent-defect closure; O5 is a defensive hardening of the same method) + `implementation-only change` (one code guard + one test + one commit).
- Owner Docs: `tools/mission-driver/CONTEXT.md` ("关键约束" WI5 paragraph; "Monitor Dashboard 前端" mergeSubflowChildren behavior); `docs/architecture/mission-driver-baseline.md:81` (the stale "defense-in-depth fallback" sentence — refreshed by sibling plan 2 after this commit).
- Skill Selection Basis: `Skill: none`. The work is a localized code guard + regression test + disciplined commit; no reusable skill method applies beyond the standard verification discipline already encoded in AGENTS.md "Verification Baseline" + this plan's Phase 2 Proof items.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline. The full suite runs via `pnpm --prefix tools/mission-driver test` (already chained with `lint:prompts` per the F7 closure).

## Execution Plan

### Phase 1 - Harden `mergeSubflowChildren` against absent `visits` (O5)

Status: completed
Targets: `tools/mission-driver/src/monitor.js` (around `:295` prefix construction), `tools/mission-driver/test/subflow-state-isolation.test.js`
Skill: none

- Item Types: `Fix | Proof`
- Prereqs: none (builds on the uncommitted working-tree refactor that is already 531 green)

- [x] `Fix` — Guard the disk-scan prefix construction in `mergeSubflowChildren` so an absent `step.visits` no longer silently produces a `"SUB-undefined-"` no-op scan. Concretely: when `step.visits == null`, skip the disk-prefix scan branch (disk scan is unavailable without a real `visits` value) and rely on the seed loop's direct `r.file` read; OR derive candidate filenames per seeded index from `r.forEachIndex` and attempt a direct `readSubflowState` before giving up. Keep the change minimal and comment the local constraint (why the prefix needs `visits`).
  - Skill: none
- [x] `Proof` — Add one regression test to `subflow-state-isolation.test.js` that constructs a `subflow` step with `visits` absent (mirroring the `:99` step shape) AND a `subflowRuns` entry with `file: null` (the placeholder case the refactor targets), plus a real `run-state-<name>-<visits>-<idx>.json` file the direct-read path should still find when a file pointer can be derived. Assert the merge does not silently drop to empty `steps` and does not crash. This pins the exact coupling (visits-absent + file:null) that O4's mid-audit break tripped.
  - Skill: none

Exit Criteria:

- [x] `mergeSubflowChildren` no longer silently no-ops the disk scan when `step.visits` is absent — the guard branch is explicit and commented.
- [x] New `visits`-absent regression test passes; full suite remains green.
- [x] No owner-doc update required in this phase (the architecture-doc `:81` rewrite is owned by sibling plan 2, which runs after this plan's commit).

**Phase 1 execution note (2026-07-22)**: chose option (b) (broader stepName-only prefix fallback) over option (a) (skip scan entirely). Rationale: option (a) leaves the `file:null` placeholder case with empty steps when visits is also absent — exactly the silent drop O5 names; option (b) lets the disk scan still locate `run-state-<stepName>-<visitsInFile>-<idx>.json` via `${step.name}-` prefix and merge live state. The idx (trailing `-N`) still disambiguates forEach items. Fix at `src/monitor.js:295-307` (prefix now `(step.visits == null) ? \`${step.name}-\` : \`${step.name}-${step.visits}-\``), test at `test/subflow-state-isolation.test.js` after the `:267` case ("falls back to broad stepName prefix when step.visits is absent"). Verification: `pnpm --prefix tools/mission-driver test` → **532 pass / 0 fail** (baseline 531 + 1 O5 test), chained `prompt-check: OK`; `pnpm --prefix tools/mission-driver/web run typecheck` clean; `pnpm --prefix tools/mission-driver/web run build` success (15.55s, pre-existing chunk-size warning only); `pnpm --prefix tools/mission-driver run lint:prompts` OK.

### Phase 2 - Verify-then-commit the batch and record the green baseline (O4)

Status: completed
Targets: git index (commit), `docs/logs/2026/07-22.md`
Skill: none

- Item Types: `Proof | Decision`
- Prereqs: Phase 1 complete

- [x] `Proof` — Run the **full** verification suite against the working tree (not just the refactor's narrow new test): `pnpm --prefix tools/mission-driver test` must end in `pass 531 / fail 0` (or higher, after Phase 1's +1 test) AND the final `prompt-check: OK` line. This is the exact discipline O4's mid-audit break violated ("the narrow new test passed while the broad `:99` regression failed"). Record the pass count + duration in the log entry verbatim.
  - Skill: none
- [x] `Proof` — Commit the entire uncommitted batch as one verify-then-committed unit: the O4 refactor (`monitor.js` `mergeSubflowChildren` + `StepTimeline.vue` `v-if` gate + the `subflow-state-isolation.test.js` narrow test at `:267` + the user-manual doc edits) AND Phase 1's hardening (the `visits` guard + the new regression test) AND the `docs/logs/2026/07-22.md` entry from the item below (so the green-baseline log record ships in the same commit, per AGENTS.md Docs Maintenance). Do not split across commits — the batch was already shown to be internally coupled (the `:99` regression was caused by removing the direct `r.file` read; O5's guard and the refactor are on the same method). Use a commit message that names both O4 and O5 and cites the green pass count.
  - Skill: none
- [x] `Decision` — Adjudicate whether the recurring pattern ("each `mergeSubflowChildren` refactor re-breaks the `:99` contract; the narrow new test passes while a broad regression fails") has cleared the promote threshold into `tools/mission-driver/memory/lessons.md` or a checklist (AGENTS.md Operating Rule 15). Record the decision + rationale in the plan's Closure section. Alternatives: (a) promote now into a lesson entry keyed to "refactor verification = full suite, not the new test"; (b) defer with trigger "recurs a third time → promote". Residual risk if deferred: the next refactor of this method may repeat the cycle.
  - Skill: none
- [x] `Proof` — Add a dated `docs/logs/2026/07-22.md` entry recording: the green pass count, that the batch was committed as one unit, the O4 process lesson (verify against full suite, not the new narrow test), and the O5 hardening. Per AGENTS.md Docs Maintenance, the verification-green status MUST appear in the log entry and the commit message (known-good baseline for future debugging).
  - Skill: none

Exit Criteria:

- [x] `git status --short` shows no uncommitted `monitor.js` / `StepTimeline.vue` / `subflow-state-isolation.test.js` / user-manual files from this batch (the audit files and sibling plan 2's doc edits are out of scope for this commit).
- [x] `git log --oneline -1` shows the new commit; the commit message contains the green pass count.
- [x] `docs/logs/2026/07-22.md` entry exists with the verification-green status recorded.

**Phase 2 execution note (2026-07-22)**:
- Full suite re-run before commit: `pnpm --prefix tools/mission-driver test` → **532 pass / 0 fail** (baseline 531 + 1 O5 test = 532; duration 10.76s), chained final line `prompt-check: OK — all prompt result-tag examples are well-formed.` Plus `pnpm --prefix tools/mission-driver/web run typecheck` clean, `pnpm --prefix tools/mission-driver/web run build` success (15.55s), `pnpm --prefix tools/mission-driver run lint:prompts` OK.
- **Decision (Rule-15 lesson promotion)**: chose alternative (b) — **defer with trigger**. Recurrence count is 2 (status-gate removal → merge refactor). AGENTS.md Rule 15 promotes "when the pattern is recurring enough to justify reuse"; two is borderline and the O5 regression test now pins the exact `visits`-absent + `file:null` coupling that each refactor tripped over, which materially lowers the chance the next refactor re-breaks silently. **Trigger to promote**: a *third* refactor of `mergeSubflowChildren` re-breaks the `:99` contract → at that point promote into `tools/mission-driver/memory/lessons.md` and add a pre-commit checklist item ("run full suite, not the new test, for any `mergeSubflowChildren` change"). Residual risk recorded in `Deferred But Adjudicated` below + the log entry.
- **Batch committed as one unit** with message naming O4 + O5 and citing the 532-green count. In-scope files: `tools/mission-driver/src/monitor.js` + `tools/mission-driver/test/subflow-state-isolation.test.js` + `tools/mission-driver/web/src/components/run/StepTimeline.vue` + `tools/mission-driver/docs/user-manual.{en,zh}.md` + `docs/logs/2026/07-22.md` (new top entry) + this plan file. Out-of-scope (left uncommitted for sibling plan 2 / separate concerns): `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-{multi,open}-audit-*.md` (audit files), `docs/logs/2026/07-21.md` (training-deck entry — unrelated), `docs/plans/mission-driver-draft-robustness/2026-07-22-1106-2-architecture-baseline-doc-sync.md` (sibling plan 2), `tools/mission-driver/docs/training-deck.zh.md` (untracked, unrelated).

## Draft Review Record

- Independent draft review iteration 1: acceptable as-is (independent cold-replay, fresh session `ses_0783216f9ffetKUG8NFAN10lyZ`, 2026-07-22) — live-replayed `git status` (O4 batch confirmed uncommitted at HEAD `c2a1ea9`), `pnpm --prefix tools/mission-driver test` → `pass 531 / fail 0` + `prompt-check: OK` (matches plan claim), `monitor.js:249/279/295` and test `:99`/`:267` verified on disk, no existing visits-absent + file:null test found. Scope fits O4+O5 exactly (no over-reach into `validateDraftDesc` / architecture-doc `:81`, which are sibling plan 2's). Single closure surface coherent (both findings concern `mergeSubflowChildren`), item typing correct, Decision item genuine (two alternatives + residual risk), no Anti-Slacking forbidden words, commit-green obligation treated as non-degradable. Non-blocking note applied: Phase 2 commit enumeration now explicitly includes `docs/logs/2026/07-22.md` so the green-baseline log entry ships in the same commit, and the narrow-test citation corrected from `:98` to `:267`.

## Closure Gates

- [x] in-scope behavior is complete (O4 batch committed green; O5 guard + test landed)
- [x] relevant docs are aligned (`docs/logs/2026/07-22.md` updated with green baseline + O4 process lesson + O5 hardening; `CONTEXT.md` WI5 paragraph still accurate — verified no edit needed: it describes `_wfAppendSubflowRun`/`_wfClose` engine-side behavior, which this plan does not change; the monitor-side `mergeSubflowChildren` is described in CONTEXT.md's "Monitor Dashboard 前端" section only at the API-endpoint level, not at `mergeSubflowChildren` internals — no owner-doc update required. The architecture-doc `:81` rewrite is owned by sibling plan 2.)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` → **532 pass / 0 fail** with `prompt-check: OK`; `pnpm --prefix tools/mission-driver/web run typecheck` clean; `pnpm --prefix tools/mission-driver/web run build` success (15.55s); `pnpm --prefix tools/mission-driver run lint:prompts` OK. Pass count recorded in commit message + log.
- [x] no in-scope item downgraded to deferred/follow-up (the Rule-15 lesson promotion is a `Decision` item with explicit adjudication — alternative (b) chosen: defer with trigger "third refactor → promote" — not a skip; the O4 commit + O5 guard + test all landed in this plan's commit.)
- [x] independent draft review completed and recorded (Draft Review Record above — iteration 1 acceptable as-is)
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent — the Draft Review Record above is an independent cold-replay from a fresh session. This plan is non-protected and non-high-risk (source audit rated O4 MEDIUM process/latent-defect closure + O5 LOW defensive hardening; no source-of-truth conflict; no contract/API/auth/data change — engine/CLI contracts unchanged). Per AGENTS.md Reviewer-Availability Fallback, solo cold-replay closure is permitted for plans of this risk class. The pre-existing Draft Review + the executor's verification-evidence read-backs (532/0 + prompt-check + typecheck + build + lint:prompts) jointly satisfy the closure-independence bar. A separate CLOSURE_VERIFY step (if the mission-driver runs one) can re-audit; if it finds the O5 guard insufficient, it will reopen as a fresh finding.
- [x] closure evidence exists in files (commit + log entry + the new O5 regression test + the guard at `src/monitor.js:295-307` ARE the evidence)

## Deferred But Adjudicated

### Promotion of the "refactor re-breaks `:99`" lesson into `memory/lessons.md`

- Classification: `watch-only residual`
- Why Not Blocking Closure: the recurrence count is at two (status-gate removal → fallback → merge refactor, per open-audit Residual Unknowns). AGENTS.md Rule 15 says promote "when the pattern is recurring enough to justify reuse" — two refactors is borderline; the Phase 2 `Decision` item adjudicates this explicitly rather than silently deferring.
- Successor Required: `yes` — trigger condition: a third refactor of `mergeSubflowChildren` re-breaks the `:99` contract → promote into `tools/mission-driver/memory/lessons.md` and add a pre-commit checklist item ("run full suite, not the new test, for any `mergeSubflowChildren` change").

## Closure

Status Note: O4 and O5 are both closed. The `mergeSubflowChildren` + `StepTimeline.vue` + test batch shipped as one verify-then-committed unit (532/0 green); the O5 visits-absent guard + regression test landed in the same commit; the Rule-15 lesson-promotion Decision resolved to defer-with-trigger.

Closure Audit Evidence:

- Auditor / Agent: executor solo cold-replay (AGENTS.md Reviewer-Availability Fallback — non-protected / non-high-risk: source audit O4 = MEDIUM process/latent-defect closure, O5 = LOW defensive hardening; no contract/API/auth/data change). The pre-execution Draft Review Record (iteration 1, independent fresh session) is recorded above and satisfies the independent-review bar.
- Evidence:
  - `src/monitor.js:295-307` — the O5 guard (`prefix = (step.visits == null) ? \`${step.name}-\` : \`${step.name}-${step.visits}-\``) with the comment block explaining the visits requirement + broad-prefix fallback rationale.
  - `test/subflow-state-isolation.test.js` — the new "falls back to broad stepName prefix when step.visits is absent" regression test pinning the visits-absent + file:null + real-disk-file coupling.
  - `docs/logs/2026/07-22.md` — top entry "O4 verify-then-commit + O5 `mergeSubflowChildren` visits-absent hardening" recording the green pass count (532/0), the O4 process lesson (full suite, not the narrow new test), the O5 fix, and the Rule-15 Decision.
  - `git log --oneline -1` (after commit) — the verify-then-commit unit; commit message names O4 + O5 and cites the 532-green count.
  - `pnpm --prefix tools/mission-driver test` → **532 pass / 0 fail** + `prompt-check: OK`; `pnpm --prefix tools/mission-driver/web run typecheck` clean; `pnpm --prefix tools/mission-driver/web run build` success; `pnpm --prefix tools/mission-driver run lint:prompts` OK.

Rule-15 Decision (recorded for the Closure Gate): alternative (b) — defer with trigger. Recurrence count = 2 (status-gate removal → merge refactor); the O5 regression test now pins the exact coupling each refactor tripped, materially lowering the chance the next refactor re-breaks silently. **Trigger**: a third refactor of `mergeSubflowChildren` re-breaks the `:99` contract → promote into `tools/mission-driver/memory/lessons.md` + add a pre-commit checklist item ("run full suite, not the new test, for any `mergeSubflowChildren` change"). See `Deferred But Adjudicated` below.

No `> Work Item:` label (audit-sourced plan — `> Source:` not `> Work Item:`; WI1-WI5 already done; this plan is post-WI audit cleanup of O4 + O5). Roadmap work-item status update: not required (audit-sourced, not roadmap-sourced).
No `> Source Audits:` label (front matter uses `> Source:` not `> Source Audits:`). Per the mission-driver EXECUTE instruction, the source-audit-closing step is omitted entirely (not the same as idempotent-skip — the step never applies to `> Source:`-fronted plans). The source audit file's own `> Audit Status: planned` will be closed by the mission-level closure (or by sibling plan 2's A1 close-out), not by this single plan.
