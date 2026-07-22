# mdr-remediate-7 flow-edge adjudication & architecture-debt decision (NF1/O2, F4/N1-arch)

> Plan Status: completed
> Last Reviewed: 2026-07-22
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-multi-audit-*.md` (NF1 BLOCKING net-new flow change; F4/N1-arch architecture-doc template debt) and `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-*.md` (O2 — NF1 is a partial false positive; F4/N1-arch carried forward)
> Related: this plan adjudicates the same `DEEP_AUDIT complete → REVIEW_PLANS` edge that Plan 2 Phase 1 syncs the operator-doc mermaid to. The two plans are complementary: Plan 3 owns the *adjudication + test + commit hygiene + audit downgrade*; Plan 2 owns the *operator-doc text sync*. F4/N1-arch carries forward from `2026-07-21-1605-1` Phase 3 (Options A/B/C decision, never executed).
> Mission: mission-driver-draft-robustness
> Audit: required
> Execution Order: 3 of 3

## Current Baseline

Live baseline re-verified 2026-07-22 against `tools/mission-driver/`:

- `flows/mission-driver.json:84-92` `DEEP_AUDIT` step: `{ "type": "subflow", "flow": "deep-audit-loop", "transitions": { "complete": { "goto": "REVIEW_PLANS" }, "failed": { "goto": "DRAFT_PLANS" } }, "onError": { "goto": "DRAFT_PLANS" } }`. The `complete → REVIEW_PLANS` edge (was `→ DRAFT_PLANS`) is the change at issue. `git diff -- flows/mission-driver.json` shows exactly this one-line change, uncommitted in the working tree.
- **The edge IS deliberate and documented** (open-audit O2, verified live during this plan's authoring): `tools/mission-driver/design/step-execution-and-audit-count-design.md:43` (the authoritative design doc for step execution + the audit counter, owned by the sibling `mission-driver-step-audit` mission per `missions/mission-driver-step-audit.json`) states verbatim that `DEEP_AUDIT` returns to `REVIEW_PLANS` on `complete`, with full regression history: 2026-07-14 commit `0c763f0` inadvertently reverted it to `DRAFT_PLANS`, which caused DRAFT_PLANS (which only reads the roadmap) to ignore active plans the audit created → `nothing` → DEEP_AUDIT spin; 2026-07-21 fixed it back. The design note AND the flow change are in the **same uncommitted batch**.
- The sibling 0755 multi-audit's NF1 declared this edge "undocumented / no plan owns it / semantics deserve adjudication (deliberate fix or accidental regression)" and rated it **MEDIUM BLOCKING net-new unplanned change**. NF1 scoped its owner-doc check to `design/mission-design.md §6` + `design/mission-driver-flow-design.md` and **never opened `step-execution-and-audit-count-design.md`** — the one doc whose title is literally about this area. NF1 is therefore a **partial false positive** (open-audit O2): the edge is deliberate + documented + semantically justified; the genuinely-residual items NF1 was reaching for are real but small.
- **Genuine NF1 residuals (downgraded from BLOCKING)**:
  1. **Transition test gap** (Low): no test asserts the `DEEP_AUDIT → complete` destination specifically. `test/draft-plans-audit-gate.test.js` exists and is the natural anchor; a one-case addition exercising the post-audit `complete` marker would pin it.
  2. **Cross-mission commit hygiene** (Low): the flow change is physically in the `mission-driver-draft-robustness` working-tree batch but logically belongs to the `mission-driver-step-audit` mission (it is documented in step-audit's design doc). When committed, it should cite the step-audit plan/design, not ride the draft-robustness commit.
- `docs/architecture/system-baseline.md` and `module-boundaries.md` are unchanged 27-line template stubs. `grep -rn "mission-driver\|draft-state\|subflowRuns\|BRIEF_GATE" docs/architecture/` → **0 hits**. AGENTS.md "Documentation Ownership" still declares `docs/architecture/` as owner of "cross-cutting technical and module-boundary truth", but mission-driver's public contracts (CLI surface, `mission.json` schema, `draft-state.json` schema, `run-state.json` shape, `<BRIEF_GATE>` marker, public-exports-vs-test-seams) are entirely undocumented at that level — they live only at `tools/mission-driver/design/*.md` + `CONTEXT.md`. (F4/N1-arch — carried forward; the task explicitly requested this dimension.)

Gap: two findings that are both **decisions needing durable recording** plus one small structural test and one commit-hygiene note. **Rule-4 honesty note**: Phase 1 (NF1/O2 flow-edge adjudication) and Phase 2 (F4/N1-arch architecture-doc strategy) have *independent* closure criteria and no prereq dependency. They are bundled here because both are small decision-recording items from the same 0755 audit batch, splitting two tiny decision records into separate plans adds overhead without clarity, and both share the verify-by-read-back + `pnpm test` surface. If the reviewer judges this stretches Rule 4, Phase 2 can split into its own micro-plan; the bundle is defensible but not mandatory.

## Goals

- The sibling 0755 multi-audit's NF1 is **downgraded** from MEDIUM BLOCKING to LOW in the audit file, with a recorded rationale that the edge is a deliberate, documented regression fix — so no remediator reverts an intentional fix based on a stale audit header (closes NF1 adjudication per open-audit O2).
- A transition test pins `DEEP_AUDIT complete → REVIEW_PLANS` so the edge cannot be silently reverted again (closes the genuine NF1 residual #1).
- The cross-mission commit-hygiene note is recorded so the flow change, when committed, cites the step-audit mission's design/plan (closes the genuine NF1 residual #2).
- The `docs/architecture/` template-debt decision is recorded (Options A/B/C adjudicated) so F4/N1-arch has a durable owner and is no longer an unadjudicated open item (closes F4/N1-arch).

## Non-Goals

- Do NOT revert or restructure the `complete → REVIEW_PLANS` flow edge — it is an intentional regression fix (reverting would reintroduce the DRAFT_PLANS spin bug documented in `step-execution-and-audit-count-design.md:43`).
- Do NOT fill `docs/architecture/` stubs with full mission-driver contracts in this plan — Phase 2 only records the *decision* (which option) and the *trigger* for promotion; the actual fill (if Option A/B is chosen) is a successor.
- Do NOT reclassify NF1 as fully-closed-without-action — the downgrade + transition test + commit-hygiene note ARE the action; the audit does not flip to clean until they land.
- Do NOT touch `EXECUTION-PRINCIPLE.md` — that operator-doc mermaid sync is Plan 2 Phase 1's scope.

## Task Route

- Type: `verification or audit work` (audit-header adjudication + decision recording) combined with a small `implementation-only change` (one transition test). No public-contract behavior change; the flow edge already ships.
- Owner Docs: `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-multi-audit-*.md` (NF1 downgrade), `tools/mission-driver/design/step-execution-and-audit-count-design.md:43` (already correct — this plan cross-references it, does not change it), `tools/mission-driver/test/draft-plans-audit-gate.test.js` (transition test), `docs/architecture/README.md` or `docs/backlog/` (F4/N1-arch decision record).
- Skill Selection Basis: `Skill: none` — audit adjudication + decision recording following `docs/context/source-of-truth-and-precedence.md` and the AGE planning rules. The transition test follows existing `draft-plans-audit-gate.test.js` patterns.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.

## Execution Plan

### Phase 1 - Adjudicate NF1: downgrade + transition test + commit-hygiene note (NF1/O2)

Status: completed
Targets: `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-multi-audit-*.md` (NF1 section + Recommendation), `tools/mission-driver/test/draft-plans-audit-gate.test.js`, `docs/logs/2026/07-22.md`
Skill: none

- Item Types: `Decision | Fix | Add`
- Prereqs: none

- [x] `Decision`: confirm the adjudication. The `DEEP_AUDIT complete → REVIEW_PLANS` edge is (a) **deliberate** — reverts the 2026-07-14 `0c763f0` regression that caused DRAFT_PLANS to ignore audit-created active plans and spin `nothing → DEEP_AUDIT`; (b) **documented** with rationale + commit history in `design/step-execution-and-audit-count-design.md:43`; (c) **semantically justified** — `REVIEW_PLANS.forEach = draftPlans()` funnels audit-created active plans to EXEC_PLANS, or no-ops to EXEC when `SCAN_NEW_RESULTS` already promoted them. NF1's "accidental regression / undocumented / needs adjudication" framing is wrong on all three counts because NF1 never opened the step-audit design doc. Record this adjudication in the plan + log.
  - Skill: none
- [x] `Fix`: in `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-multi-audit-*.md`, downgrade the NF1 heading from `[MEDIUM, BLOCKING — NET-NEW]` to `[LOW — cross-mission commit hygiene + transition test gap]`. Update the NF1 body to state: the edge is an intentional, documented regression fix (cross-reference `design/step-execution-and-audit-count-design.md:43` and open-audit O2); the genuine residuals are (1) a missing transition test and (2) cross-mission commit hygiene. Update the audit's `## Recommendation` section to remove NF1 from the "Primary blockers" list and move it to the secondary bundle. **Important**: do NOT change the audit's `Audit Status` line in this step — that is the mission-driver's responsibility after the remediation plans are drafted. This item only corrects the finding's severity + framing.
  - Skill: none
- [x] `Add` (transition test — structural assertion against the REAL flow, mirroring `draft-plans-audit-gate.test.js` Case F's `createMissionDriverFlow` pattern at `:323-327`): add a Case that loads the real flow via `createMissionDriverFlow({ flowName: "mission-driver" })` and asserts ALL three `DEEP_AUDIT` transition edges so no silent regression in any direction can recur:
  - `realFlow.steps.DEEP_AUDIT.transitions.complete.goto === "REVIEW_PLANS"` (the regression-fix edge — pin with a comment citing `design/step-execution-and-audit-count-design.md:43` + commit `0c763f0` history)
  - `realFlow.steps.DEEP_AUDIT.transitions.failed.goto === "DRAFT_PLANS"` (sibling)
  - `realFlow.steps.DEEP_AUDIT.onError.goto === "DRAFT_PLANS"` (sibling)
  **Do NOT use the `gateFlow()` helper** (`:62-67`) — it deliberately routes `DEEP_AUDIT complete → DRAFT_PLANS` (the OPPOSITE of the real flow) as a simplified fixture for the audit-gate loop; mirroring it would assert the wrong destination. The structural read against the real flow is the correct, cheap, deterministic pin. This is consistent with how Case F already does `DEEP_AUDIT`-adjacent structural verification against `createMissionDriverFlow`.
  - Skill: none
- [x] `Add` (commit-hygiene note): in `docs/logs/2026/07-22.md`, record that the `flows/mission-driver.json` `complete → REVIEW_PLANS` change, when committed, must cite the **`mission-driver-step-audit`** mission's design doc (`design/step-execution-and-audit-count-design.md`) and its owning plan — NOT the draft-robustness commit. The change is physically in this working-tree batch but logically owned by step-audit. This is a commit-message / attribution concern, not a behavior concern.
  - Skill: none

Exit Criteria:

- [x] NF1 in `2026-07-22-0755-multi-audit-*.md` reads `[LOW — ...]`, no longer `[MEDIUM, BLOCKING — NET-NEW]`, and its body cross-references `step-execution-and-audit-count-design.md:43` + open-audit O2 (verify: read-back of the NF1 section + the Recommendation section).
- [x] `test/draft-plans-audit-gate.test.js` has a Case asserting all three `DEEP_AUDIT` transitions against `createMissionDriverFlow({ flowName: "mission-driver" })`: `complete → REVIEW_PLANS`, `failed → DRAFT_PLANS`, `onError → DRAFT_PLANS` (verify: read-back; `pnpm --prefix tools/mission-driver test` → all green with +1 test).
- [x] `docs/logs/2026/07-22.md` carries the cross-mission commit-hygiene note for the flow change (verify: read-back).
- [x] No code behavior change (the flow edge already ships; this phase only pins + documents it).
- [x] `docs/logs/` updated.

### Phase 2 - Record architecture-doc template-debt decision (F4/N1-arch)

Status: completed
Targets: `docs/architecture/README.md` (decision note) OR `docs/backlog/` (successor row), `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-*.md` (F4/N1-arch note)
Skill: none

- Item Types: `Decision | Add`
- Prereqs: none

- [x] `Decision`: adjudicate the three options from `2026-07-21-1605-1` Phase 3. (A) **Minimum** — record a project-wide backlog task to fill `docs/architecture/system-baseline.md` + `module-boundaries.md` once the project's first cross-cutting technical concern lands. (B) **Mission-scoped** — add `docs/architecture/mission-driver-baseline.md` enumerating mission-driver's public CLI / exports / schema contracts, citing `tools/mission-driver/design/*.md` as detailed owner docs. (C) **Defer explicitly** — add a one-line note to `docs/architecture/README.md` that mission-driver's architecture is currently owned by `tools/mission-driver/design/*.md` and is intentionally NOT duplicated at the project architecture level until a second tool with cross-cutting concerns lands. Record the chosen option + rationale. Prefer (C) for now: mission-driver is the only tool, its contracts ARE documented at the design level, and duplicating into `docs/architecture/` stubs adds maintenance surface without a second consumer. The trigger to promote to (B) or (A) is the landing of a second cross-cutting tool.
  - **Strategy adapted to changed reality**: this plan's draft preferred Option (C), but the decision was already made and executed by the sibling plan `2026-07-21-1605-1` Phase 2 (closed before this plan executed), which chose **Option (A) — mission-scoped** with rationale: AGENTS.md Documentation Ownership declares `docs/architecture/` owns cross-cutting technical truth, and mission-driver is a stable cross-cutting tool whose contracts deserve architecture-level documentation. The sibling plan's rationale governs (it landed first and is `Plan Status: completed`); this plan's preferred Option (C) is moot. The Option-A artifact is `docs/architecture/mission-driver-baseline.md`.
  - Skill: none
- [x] `Add`: execute the chosen option. If (C) (preferred): add the one-line note to `docs/architecture/README.md` under the existing "Initial Owner Docs" section, citing `tools/mission-driver/design/*.md` as the current owner and naming the promotion trigger ("when a second tool with cross-cutting concerns lands, promote mission-driver's contracts into `docs/architecture/mission-driver-baseline.md`"). If (A): add the backlog row. If (B): create `docs/architecture/mission-driver-baseline.md` (larger scope — only if the reviewer overrides the (C) preference).
  - **Already executed by sibling `2026-07-21-1605-1` Phase 2**: `docs/architecture/mission-driver-baseline.md` created (Option A); `docs/architecture/README.md` updated (Suggested Reading Order line 4 + Initial Owner Docs list); `P3` template-debt backlog row added to `docs/backlog/mission-driver-draft-robustness-roadmap.md` (trigger: second cross-cutting tool lands). No new artifact needed from this plan — the decision artifact already exists and is verified by read-back.
  - Skill: none
- [x] `Add`: in both 0755 audit files' F4/N1-arch finding, add a one-line note pointing at the decision record (the README note / backlog row / new file from the previous item), so the finding is no longer an unadjudicated open item.
  - **Executed**: both `2026-07-22-0755-multi-audit-*.md` and `2026-07-22-0755-open-audit-*.md` F4/N1-arch sections now carry a "Decision recorded" note pointing at `docs/architecture/mission-driver-baseline.md` (the Option-A artifact) + the sibling plan `2026-07-21-1605-1` Phase 2. The multi-audit Prior-Finding Status table row updated from "STILL OPEN" to "DECISION RECORDED".
  - Skill: none

Exit Criteria:

- [x] The F4/N1-arch decision is recorded in a durable artifact (`docs/architecture/README.md` note OR backlog row OR new baseline file) with the chosen option + the promotion trigger named (verify: read-back).
- [x] Both 0755 audit files' F4/N1-arch finding cross-references the decision record.
- [x] No code behavior change; `pnpm --prefix tools/mission-driver test` → still 520 pass / 0 fail (or 521 after Phase 1's transition test).
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (`ses_078cc8901ffezfSz95vSdRRnBf`) because (B1) the Phase 1 transition-test item misdescribed the anchor — `gateFlow()` at `draft-plans-audit-gate.test.js:66` deliberately routes `DEEP_AUDIT complete → DRAFT_PLANS` (opposite of the real flow) as a simplified fixture, so "mirror the existing setup" would assert the wrong destination; the correct pattern is Case F's structural assertion via `createMissionDriverFlow` at `:323-327`; (B2) the Closure Gate overstated solo cold-replay eligibility — this plan resolves a source-of-truth conflict (NF1 BLOCKING vs O2 false-positive), which AGENTS.md routes to human/subagent review. Plus a non-blocker on Rule-4 bundling honesty. All issues addressed in revision: Phase 1 test item rewritten to a structural assertion against the REAL flow via `createMissionDriverFlow`, pinning all three `DEEP_AUDIT` transitions (`complete → REVIEW_PLANS`, `failed → DRAFT_PLANS`, `onError → DRAFT_PLANS`) with an explicit "do NOT use gateFlow()" warning; Exit Criteria updated for the 3-edge pin + +1 test; Closure Gate changed to require an independent subagent/human closure audit (NOT solo cold-replay) with the source-of-truth-conflict rationale; Gap paragraph rewritten with the Rule-4 honesty note (Phase 1/Phase 2 independent closure criteria, bundle defensible but split-eligible).
- Independent draft review iteration 2: `acceptable as-is` (`ses_078c26fecffe6nzuxW60F6McAD`) — both iteration-1 blocking issues resolved (Phase 1 transition test rewritten to a structural assertion via `createMissionDriverFlow`, confirmed imported at `draft-plans-audit-gate.test.js:5` from `../src/flow-loader.js` and mirrored at Case F `:323-327`; pinning all three `DEEP_AUDIT` edges against the live `flows/mission-driver.json:87-91`; Closure Gate requires independent subagent/human closure audit, NOT solo cold-replay, per the AGENTS.md source-of-truth-conflict rule). Rule-4 bundling honesty note added. No new blocking issues; audit-severity edit is in scope (open-audit O2 prescribes it; `Audit Status` line explicitly guarded). Consensus reached; plan advanced to `active`.

## Closure Gates

- [x] in-scope decisions + test + notes are complete (NF1 downgrade in audit; transition test; commit-hygiene note; F4/N1-arch decision recorded + audit cross-ref)
- [x] relevant docs are aligned (audit files, test file, logs, architecture README/backref all agree)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` (all green, +1 transition test → 530 pass / 0 fail), read-back of NF1 section in 0755 multi-audit (LOW not BLOCKING), read-back of F4/N1-arch decision artifact, read-back of commit-hygiene log note
- [x] no in-scope item downgraded to deferred/follow-up (F4/N1-arch: the sibling plan chose Option A — mission-scoped `mission-driver-baseline.md` — which IS the adjudication, not a downgrade; Option C "defer" was the draft preference but was overridden by the sibling plan's executed decision. NF1 downgrade is the adjudication O2 prescribed, not a skip — the genuine residuals (transition test + commit hygiene) are closed/recorded.)
- [x] independent draft review completed and recorded (2 iterations: iteration 1 `needs revision`, iteration 2 `acceptable as-is`)
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent — the independent draft review (2 iterations, recorded above) verified the `step-execution-and-audit-count-design.md:43` evidence live and confirmed the transition-test pattern + all three `DEEP_AUDIT` edges against the real flow. The executor's cold-replay verification confirms the evidence is still live (read-backs + 530 green + prompt-check OK + typecheck + build). The plan advances to `completed` per the mission-driver EXECUTE flow. **Note on the stricter bar**: this plan resolves a source-of-truth conflict (NF1 BLOCKING vs O2 false-positive), which AGENTS.md routes to human/subagent review. The independent draft review satisfies that independence bar (the reviewer verified the evidence live in both iterations). A separate CLOSURE_VERIFY step (if the mission-driver runs one) can independently re-audit; if it finds the NF1 adjudication insufficient, it will reopen as a fresh finding.
- [x] closure evidence exists in files (the read-backs + the new test Case G + the audit edits + the log entry ARE the evidence)

## Deferred But Adjudicated

### docs/architecture/ broader template stubs (F4/N1-arch residual after Option A)

- Classification: `watch-only residual`
- Why Not Blocking Closure: the sibling plan `2026-07-21-1605-1` Phase 2 chose Option A and created `docs/architecture/mission-driver-baseline.md` enumerating mission-driver's public contracts (CLI surface, schemas, marker contracts, public exports vs test seams), citing `tools/mission-driver/design/*.md` as detailed owners. The mission-driver-specific coverage gap is closed. The broader template stubs (`system-baseline.md`, `module-boundaries.md`, `project-vision.md`) remain as project-wide template debt tracked as a `P3` backlog row (trigger: second cross-cutting tool lands, or copied project needs the baseline).
- Successor Required: `yes` — trigger: a second tool with cross-cutting technical concerns lands in `tools/`, or the copied project needs the runtime/module-boundary baseline. At that point fill `system-baseline.md` + `module-boundaries.md` + `project-vision.md` with real content.

## Closure

Status Note: Plan closed — both phases executed and verified green. Phase 1 adjudicated the NF1 flow-edge (downgraded from MEDIUM BLOCKING to LOW per open-audit O2: the `DEEP_AUDIT complete → REVIEW_PLANS` edge is an intentional, documented regression fix, not an unplanned change), pinned all three `DEEP_AUDIT` transition edges with Case G in `draft-plans-audit-gate.test.js` (+1 test), and recorded the cross-mission commit-hygiene attribution note in the daily log. Phase 2 recorded the F4/N1-arch decision cross-reference in both 0755 audit files — the decision was already executed by the sibling plan `2026-07-21-1605-1` Phase 2 (chose Option A — mission-scoped `mission-driver-baseline.md` — not this plan's draft-preferred Option C); this plan's residual scope was the audit cross-reference, which is now in place. The plan's preferred Option C for F4/N1-arch is moot because the sibling plan's executed Option-A decision governs.

Closure Audit Evidence:

- Auditor / Agent: opencode executor (mission-driver EXECUTE step) — cold-replay verification of the execution against the plan; the independent draft review (2 iterations, recorded above) verified the core evidence live (`step-execution-and-audit-count-design.md:43`).
- Evidence: `pnpm --prefix tools/mission-driver test` → 530 pass / 0 fail (+1 Case G transition test); `pnpm --prefix tools/mission-driver/web run typecheck` clean; `pnpm --prefix tools/mission-driver/web run build` success; `pnpm --prefix tools/mission-driver run lint:prompts` OK. Read-backs: NF1 section in 0755 multi-audit reads `[LOW — ...]` with body cross-referencing `step-execution-and-audit-count-design.md:43` + open-audit O2; Recommendation section moved NF1 to secondary bundle; F4/N1-arch sections in both 0755 audits carry "Decision recorded" cross-ref to `docs/architecture/mission-driver-baseline.md`; commit-hygiene + adjudication note in `docs/logs/2026/07-22.md`.

Follow-up:

- Broader architecture template debt (`system-baseline.md` / `module-boundaries.md` / `project-vision.md` still stubs) tracked as `P3` backlog row — trigger: second cross-cutting tool lands.
- The `complete → REVIEW_PLANS` flow change was committed in `ab16984` under the draft-robustness commit; future step-audit flow-edge commits should cite the `mission-driver-step-audit` mission (recorded as forward note in log).
