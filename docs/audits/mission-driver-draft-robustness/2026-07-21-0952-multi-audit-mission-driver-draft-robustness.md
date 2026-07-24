> Audit Status: planned
> Audit Type: multi-dimensional
> Mission: mission-driver-draft-robustness
> Remediation Plans: F1–F14 originally implemented by `docs/plans/mission-driver-draft-robustness/2026-07-21-1005-1-design-owner-doc-sync.md` + `2026-07-21-1005-2-verification-and-contract-hardening.md` + `2026-07-21-1005-3-stuck-running-draft-state-remediation.md` + `2026-07-21-1523-1-non-foreach-subflow-and-test-gaps.md` (all `Plan Status: completed`; work in the working tree). Narrowed residual closure via `2026-07-21-1605-1-design-and-architecture-doc-sync.md` (N4, F4/N1-arch, plus 6 findings pre-resolved by 1005-1 — `Plan Status: completed`), `2026-07-21-1605-2-draft-pipeline-robustness-closure.md` (N2, plus F2/F6/F11-test/F12/F13 confirmed closed in baseline — `Plan Status: completed`), `2026-07-21-1605-3-engine-extraction-and-verification-invariants.md` (N1, N3, plus F3/F7/F14 verify-already-landed — `Plan Status: completed`). All 14 multi-audit findings + N1 closed. Residuals from the later `2026-07-22-0755-*.md` re-audit (O1, O3, N4-carryforward, NF1–NF4) owned by `2026-07-22-0814-1-draft-pipeline-invariants-adoption.md` + `2026-07-22-0814-2-owner-doc-and-plan-traceability-sync.md` + `2026-07-22-0814-3-flow-edge-adjudication-and-architecture-debt-decision.md` (header reconciled 2026-07-22 by mdr-remediate-6 Phase 3; the 1605 set was executed as narrowed plans, not retired as superseded drafts).

# Multi-Dimensional Audit — `tools/mission-driver/` (mission-driver-draft-robustness)

- **Date**: 2026-07-21 09:52 (live-replayed 15:52 during this audit)
- **Auditor**: opencode solo cold-replay (multi-dimensional audit prompt)
- **Scope**: `tools/mission-driver/` — code (`src/main.js`, `src/mission-check.mjs`, `src/engine.js`, `src/draft-job.mjs`, `src/run-reconcile.mjs`), config (`missions/base.json`, `tools/mission-driver/package.json`), tests (`test/brief-gate.test.js`, `test/draft-desc-validate.test.js`, `test/draft-path-consistency.test.js`, `test/mission-check-cli.test.js`, `test/subflow-incremental.test.js`), prompts (`prompts/mission-brief.md`, `prompts/mission-draft.md`), public contracts (CLI `draft`/`run`/`list`/`list-steps`/`analyze` surface, named exports of `main.js`/`engine.js`/`mission-check.mjs`/`draft-job.mjs`, `draft-state.json` schema, `run-state.json` `subflowRuns` shape), and design docs.
- **Cross-reference**: `tools/mission-driver/design/draft-robustness-design.md` (cited as owner doc by every WI plan), `tools/mission-driver/design/mission-design.md`, `tools/mission-driver/CONTEXT.md`, `tools/mission-driver/README.md`, `docs/architecture/*` (checked — see F4 / N1 below for architecture-docs status), `docs/plans/mission-driver-draft-robustness/*` (9 plans total: 5 WI plans all `Plan Status: completed` + 4 remediation plans `2026-07-21-1005-1/2/3` and `2026-07-21-1523-1` all `Plan Status: active` but NOT yet implemented), `docs/backlog/mission-driver-draft-robustness-roadmap.md` (WI1–WI5 all `done`; remediation plans not yet tracked as roadmap rows), the sibling open-ended audit (`2026-07-21-0952-open-audit-*.md`).
- **Method**: followed `docs/skills/multi-dimensional-audit-prompt.md` (default generic prompt; this repository has not yet tuned a project-specific multi-audit prompt, which is acceptable per the prompt's preamble). Tuned dimensions to this mission's risk surface: draft-pipeline contract, cross-platform CLI correctness, subflow run-state persistence, prompt-marker contract, **and a net-new architecture-doc-coverage dimension** specifically requested by the task ("Cross-reference against architecture docs for documented contract drift").

## Verification Snapshot (live-replayed during this audit)

| Command                                                | Result                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `pnpm --prefix tools/mission-driver test`              | **510 pass / 0 fail** (10.2s) — re-verified live                             |
| `pnpm --prefix tools/mission-driver run lint:prompts`  | OK (`prompt-check: OK — all prompt result-tag examples are well-formed.`)    |
| `node tools/mission-driver/src/mission-check.mjs missions/mission-driver-draft-robustness.json .` (manual probe) | exit 0 + `"valid": true` — WI4 cross-platform CLI confirmed live on Windows |
| REPL probes on `validateDraftDesc`, `extractBriefGate` (whitespace-only reason, multi-line reason, blacklist coverage) | Cited under individual findings below |

All WI1–WI5 closure claims re-verified green. The 510 pass count matches the WI5 closure evidence exactly (`docs/plans/mission-driver-draft-robustness/2026-07-21-1207-2-subflow-runs-incremental.md:185`). Implementation in `src/main.js` (`validateDraftDesc` L207-220, `cmdDraftMission` gate branch L448-456, `extractBriefGate` L184-189, `parseDraftArtifact` warn L256-265, `backlogDir` injection L400-406/464-470), `src/mission-check.mjs` (`pathToFileURL` entry guard L11,107), `src/engine.js` (`_wfAppendSubflowRun` L461-473, two forEach call sites L1036,1067), `prompts/mission-brief.md` (`<BRIEF_GATE>` / `<BRIEF_GATE_REASON>` marker contract + `{{backlogDir}}`), `prompts/mission-draft.md` (`{{backlogDir}}`) matches the design doc's §4.1 / §4.2 / §4.3 / §4.4 / §4.5 contracts and the five plans' closure evidence.

**Important**: four remediation plans exist in `docs/plans/mission-driver-draft-robustness/` covering 14 of the 15 findings enumerated below (`2026-07-21-1005-1` for F1/F2/F3/F4/F5/A6/A7; `2026-07-21-1005-2` for A2/A3/A4/A5; `2026-07-21-1005-3` for A1; `2026-07-21-1523-1` for H2/H3/H9). All four are `Plan Status: active` with completed Draft Review Records but `Plan Status: active` — **none have been implemented yet**. All findings below therefore remain live against the repo. The net-new finding (N1) is not covered by any of these remediation plans.

## Findings

Ordered by severity. Each finding cites a concrete code path, the dimension it falls under, and confirms live state. The labels `F#`, `A#`, `H#` cross-walk to the prior multi-audit (F#), open-audit (A# and H#), and this audit's findings; the nomenclature mapping per `2026-07-21-1523-1-non-forEach-subflow-and-test-gaps.md:56` is: A1=H1, A2=H4, A3=H5, A4=H6, A5=H6-multiline-also-folds-F3, A6=H8, A7=H7=F1. This audit confirms every prior finding still holds and adds **N1** (architecture-doc coverage gap).

### F1 — [MEDIUM, BLOCKING] Design doc `draft-robustness-design.md` Status field still says `proposal` after all 5 WIs landed (= prior A7 / H7)

- **Dimension**: owner-doc alignment · architecture/boundary impact · requirement correctness.
- **File** (live-read during this audit): `tools/mission-driver/design/draft-robustness-design.md:5`
  ```
  **Status**: proposal (analysis + recommended solution, no code change yet)
  ```
- **Reality**: All five work items authorized by this design (WI1 desc validation, WI2 brief gate marker, WI3 path unification, WI4 cross-platform CLI entry, WI5 subflow incremental persistence) are `Plan Status: completed`; all five roadmap rows in `docs/backlog/mission-driver-draft-robustness-roadmap.md` are `done` (roadmap header L3: `Last Updated: 2026-07-21 (WI5 done — mission complete)`); all five plans cite this design's §4.x sections as the controlling owner doc in their `Related:` header; the live repo shows full implementation:
  - `src/main.js:207-220` `validateDraftDesc` (WI1) — exported, matches §4.1 with one documented deviation (see F10 below).
  - `src/main.js:184-189` `extractBriefGate` (WI2) — exported, matches §4.2.2 with one minor deviation (see F11 below).
  - `src/main.js:448-456` Stage 1→2 gate branch (WI2) — `gate === "blocked"` short-circuits before Stage 2, matches §4.2.2.
  - `src/main.js:400-406` + `:464-470` `backlogDir` template var (WI3) + `prompts/mission-brief.md` + `prompts/mission-draft.md` literal→`{{backlogDir}}/` replacement.
  - `src/main.js:256-265` `parseDraftArtifact` warn (WI3) — uses `relative + startsWith("..")` per §4.3.3.
  - `src/mission-check.mjs:11,107` `pathToFileURL` entry guard (WI4) — with `process.argv[1] &&` short-circuit guard; `node tools/mission-driver/src/mission-check.mjs missions/mission-driver-draft-robustness.json .` emits `"valid": true` on this Windows host.
  - `src/engine.js:461-473` `_wfAppendSubflowRun` (WI5) — three-part match `name + visits + status==="running"`, plus two call sites at `:1036` (concurrency=1) and `:1067` (sliding-window).
- **Why this is a finding**: AGE attractor principle (AGENTS.md "Documentation Ownership" + `docs/architecture/` owns "stable technical and module-boundary truth" + design docs under `tools/mission-driver/design/` are the durable owner docs cited by every plan). A future agent reading this design cold would correctly conclude "this is a proposal; nothing implemented yet" and could plausibly re-implement WI1–WI5 from scratch. The design doc is the authoritative attractor for every closure audit of WI1–WI5 (each plan's `Related:` cites its §4.x sections as owner doc), so the staleness propagates into every consumer.
- **Source-of-truth check**: None of the five plans explicitly punted this Status sync to a follow-up. The WI2 and WI3 closure sections both contain "No owner-doc update required" — but that decision was about whether to update `mission-design.md` (the higher-level stable doc), not about whether to update the `draft-robustness-design.md` Status field. The remediation plan `2026-07-21-1005-1-design-owner-doc-sync.md` Phase 1 F1 owns the fix but is `Plan Status: active` — not yet executed.
- **Severity rationale**: Medium, not Critical, because (a) the design doc's normative content (§4.x decisions) is still accurate; only the status field lies; (b) all consumers are internal to this repo; (c) a one-line edit closes the gap. But it is **blocking** a clean multi-dimensional pass because it is a documented-contract drift the audit prompt explicitly asks to surface, and the sibling `mission-driver-step-audit` mission set the precedent of treating this exact pattern as blocking.
- **Recommended fix**: Update `**Status**:` from `proposal (analysis + recommended solution, no code change yet)` to `implemented — §4.1/§4.2/§4.3/§4.4/§4.5 landed via WI1–WI5; see docs/plans/mission-driver-draft-robustness/`. Optionally annotate §0–§2 as "pre-WI1–WI5 baseline (historical root-cause)" so the analysis-vs-decision distinction stays legible.

### F2 — [MEDIUM-LOW, BLOCKING] WI1 reject branch leaves `draft-state.json` stuck at `{status: "running"}` forever (= prior A1 / H1)

- **Dimension**: requirement correctness · architecture/boundary impact · regression risk · public contract (draft-state.json schema consumer).
- **Files** (live-read during this audit):
  - `tools/mission-driver/src/draft-job.mjs:74-86` — `startDraftJob` writes the **initial** `draft-state.json` with `status: "running"`, `phase: "brief"`, `desc: <raw>` BEFORE spawning the child.
  - `tools/mission-driver/src/draft-job.mjs:99-104` — spawn uses `{ shell: false, detached: true, stdio: "ignore", windowsHide: true }` + `child.unref()`. **No parent observes the child's exit code or stderr.**
  - `tools/mission-driver/src/main.js:348-355` — WI1 reject path: on `!v.ok`, `console.error("[DRAFT VALIDATION] …")` to stderr, `process.exitCode = 1`, `await runner.close()`, `return`. **No `writeDraftState` call** — by design (WI1 plan's `Deferred But Adjudicated` section, "Successor Required: yes" was never tracked).
  - `tools/mission-driver/src/main.js:362-372` — `stateFile` + `writeDraftState(patch)` closure are declared AFTER the reject branch — referencing them from the reject branch causes a TDZ `ReferenceError`. (This is the same fact the remediation plan `2026-07-21-1005-3-stuck-running-draft-state-remediation.md` Draft Review iteration 1 caught.)
  - `tools/mission-driver/src/run-reconcile.mjs:34` — `MAIN_FILE = "run-state.json"`; `reconcileStaleRuns` only reconciles dirs whose main file is `run-state.json`. **`draft-state.json` is never reconciled.**
- **Repro (concrete user-visible failure mode)**:
  1. Monitor UI submits `draft "d"` → `startDraftJob({ projectRoot, desc: "d" })`.
  2. `startDraftJob` writes `_tmp/draft-…/draft-state.json` = `{status: "running", phase: "brief", desc: "d", ...}` and spawns `node main.js draft d --draft-job-dir <jobDir>` with `stdio: "ignore"`.
  3. Child `cmdDraftMission("d", …)` runs `validateDraftDesc("d")` → `{ok: false, reason: "too short"}` (live REPL probe during this audit confirms this exact return).
  4. Child writes `[DRAFT VALIDATION] too short` to its stderr — which is `stdio: "ignore"`-discarded by the parent.
  5. Child sets `process.exitCode = 1`, calls `runner.close()`, returns. No `writeDraftState` call.
  6. `draft-state.json` remains `{status: "running", phase: "brief", desc: "d"}` **forever** — `run-reconcile` never touches draft-state.json, and the parent never observed the child's exit.
  7. Monitor UI shows the draft job as `running` indefinitely. User has **no visible signal** of failure.
- **Why blocking**: the mission's stated goal was "强化 mission-driver 的 draft 管线健壮性" (strengthen draft pipeline robustness). A permanently stuck running job after rejected input is the user-visible contradiction of that goal. The WI1 plan's promised successor (`Successor Required: yes`) was never tracked into any backlog row — a textbook fake-closure / orphan-follow-up pattern that the multi-dimensional audit prompt asks the reviewer to surface. The remediation plan `2026-07-21-1005-3-stuck-running-draft-state-remediation.md` owns the fix but is `Plan Status: active` — not yet executed.
- **Note**: the WI2 gate-blocked path (`main.js:448-456`) is NOT affected — it correctly calls `writeDraftState({ status: "blocked", endedAt })`. The gap is specifically the WI1 validation-reject path that returns before any `writeDraftState` call site is constructed.
- **Severity rationale**: Medium-Low, not Critical, because (a) the actual file-pollution goal of the mission IS achieved (no junk `d-brief.md` / `d-roadmap.md` / `d.json`); (b) the failure is recoverable by manual cleanup of `_tmp/draft-*`. But it blocks a clean multi-dimensional pass because it directly contradicts the mission's robustness goal and the deferred successor was never tracked.
- **Recommended fix** (any one of; the first is smallest):
  1. **Smallest** — In `cmdDraftMission`'s WI1 reject branch (`main.js:349-355`), move `stateFile`/`writeDraftState` definitions above the `validateDraftDesc` call, then call `writeDraftState({ status: "failed", phase: "rejected", endedAt: new Date().toISOString(), error: v.reason })` BEFORE `await runner.close(); return`. The plan's rationale for not writing ("avoid persisting rejected desc") is preserved: write `error` without overwriting `desc` (the merge semantics in `writeDraftState` preserve the initial `desc`).
  2. **Defense-in-depth** — Extend `run-reconcile.mjs` to also scan `_tmp/draft-*/draft-state.json` with the same liveness/staleness rules (no pid → 90min fallback; alive pid → skip). Mirror the existing `_abortStateFile` pattern.
  3. **Process fix** — Promote the deferred item into a tracked backlog row.

### F3 — [MEDIUM-LOW] WI5 incremental persistence is forEach-only; the production `DEEP_AUDIT` subflow is non-forEach and remains non-incremental (= prior H2)

- **Dimension**: requirement correctness · architecture/boundary impact · public contract (`run-state.json` `subflowRuns` shape) · owner-doc over-claim.
- **Files** (live-read during this audit):
  - `tools/mission-driver/src/engine.js:461-473` — `_wfAppendSubflowRun` definition (WI5 implementation).
  - `tools/mission-driver/src/engine.js:1036, 1067` — two call sites of `_wfAppendSubflowRun`, both inside the `if (stepDef.forEach)` branch of `_executeSubflowStep`.
  - `tools/mission-driver/src/engine.js:1115-1121` — the **non-forEach subflow branch does NOT call `_wfAppendSubflowRun`**. Confirmed live: it directly awaits `_runChildSubflow` at L1117 and returns an inline `subflowRuns: [{ forEachIndex: 0, ..., status: childResult.status }]` at L1120.
  - `tools/mission-driver/flows/mission-driver.json:85-86` — `DEEP_AUDIT` step: `{ "type": "subflow", "flow": "deep-audit-loop", "transitions": { … } }`. **No `forEach`** — this is a single-child subflow and the production path that exhibits the gap.
  - `tools/mission-driver/CONTEXT.md:118` — "draft-robustness WI5：subflow step 的 `subflowRuns` 在 `_executeSubflowStep` 的每项完成后立即**增量**追加到主 `run-state.json`". The wording "每项完成后" (after each item completes) implies forEach; does NOT explicitly note that the non-forEach path is NOT incrementally persisted.
  - `tools/mission-driver/design/draft-robustness-design.md:153-166` (§2.6 缺陷 5 framing) — general framing: "subflowRuns 不增量落盘（aborted run 子流程历史丢失）". §4.5 scopes the solution to forEach. The gap between general framing and forEach-scoped solution is not adjudicated.
- **Concrete failure mode**: a mission run that enters `DEEP_AUDIT` (a long-running multi-step subflow: CHECK_OPEN_AUDITS → MULTI_AUDIT → OPEN_AUDIT → SCAN_NEW_RESULTS → DRAFT_FROM_AUDITS) and whose parent process is SIGKILLed mid-subflow will leave the main `run-state.json`'s `DEEP_AUDIT` placeholder at `subflowRuns: []`, despite the child's own `run-state-DEEP_AUDIT-<visits>-0.json` file on disk having full progress. The design's stated goal — "run-state.json self-contained, not dependent on monitor fallback" (`§2.6` last paragraph) — is only achieved for forEach subflows.
- **Why this is a finding**: monitor's `mergeSubflowChildren` fallback scan (already fixed in commit 06749fa per design §2.6) covers the gap at render time — so dashboards still show child progress. The residual cost is for non-monitor consumers (`--analyze-run`, `git show` post-mortem, any tool that reads `run-state.json` directly) and for the design's stated goal of file-level self-containment. The test suite (`subflow-incremental.test.js`) covers concurrency ∈ {1, 2} but never exercises a non-forEach subflow through the abort scenario.
- **Severity**: Medium-Low. The remediation plan `2026-07-21-1523-1-non-forEach-subflow-and-test-gaps.md` Phase 1 owns the fix (chosen Option A: code fix in `engine.js:1115-1121`) but is `Plan Status: active` — not yet executed.
- **Recommended fix (one of)**:
  1. **Code** — In `_executeSubflowStep`'s non-forEach branch (`engine.js:1115-1121`), call `_wfAppendSubflowRun(stepName, visit, { forEachIndex: 0, ..., status: "running" })` BEFORE awaiting `_runChildSubflow`. The existing `_wfClose`-based replace mechanism (`engine.js:1799 → 1802 → 394 → 401`) already handles terminal-state replacement via `meta.subflowRuns` — no new patch helper needed.
  2. **Doc-only** — Add a note to `design/draft-robustness-design.md §4.5` and `CONTEXT.md:118` that WI5 scopes to forEach subflows; the non-forEach path (e.g. `DEEP_AUDIT`) still relies on monitor's `mergeSubflowChildren` fallback. Deflates the over-claim.

### F4 / N1 — [LOW-MEDIUM, NET-NEW] Architecture docs are unfilled template stubs — zero documented mission-driver contracts at the architecture level (task specifically requested this dimension)

- **Dimension**: architecture/boundary impact · owner-doc alignment · **public contract** (this is the dimension the task explicitly asked to cross-reference).
- **Files** (live-read during this audit):
  - `docs/architecture/system-baseline.md` — 27 lines total; under "## Fill In" the entire stack section is empty placeholders: `- Runtime shape:`, `- Frontend stack:`, `- Backend stack:`, `- State management approach:`, `- Data access approach:`, `- Testing stack:`, `- Build and package tools:`, `- Deployment shape:`, `- External platforms or enterprise systems this app must integrate with:`. The "## Stable Rules" section is empty placeholders: `- list the dependency directions that must remain true`, `- list the reusable UI/component layer rules`, `- list any forbidden shortcuts or known anti-patterns`.
  - `docs/architecture/module-boundaries.md` — 27 lines total; under "## Fill In" the entire module ownership section reads `For each module or package family, capture: responsibility / allowed dependencies / forbidden dependencies / owner-docs that govern it` with zero entries.
  - `docs/architecture/README.md` — 34 lines; describes what architecture docs SHOULD contain but the actual `Initial Owner Docs` (`project-vision.md`, `system-baseline.md`, `module-boundaries.md`) are all template stubs.
  - `grep -rn "mission-driver\|mission_driver\|draft-state\|subflowRuns\|BRIEF_GATE" docs/architecture/` → **(no output)** — zero mentions of any mission-driver contract anywhere under `docs/architecture/`.
- **Why net-new (this audit's contribution)**: AGENTS.md "Documentation Ownership" says `docs/architecture/` owns "cross-cutting technical and module-boundary truth". The prior multi-audit (F1–F5) and open-audit (H1–H9) found drift between design docs and code, but missed that **there is no architecture-level contract to drift from in the first place** — the architecture docs are template placeholders. Mission-driver's public contracts are entirely undocumented at the architecture level:
  - **CLI command surface** (`draft` / `run` / `list` / `list-steps` / `analyze` — `main.js:833-854` and elsewhere): no architecture doc enumerates the public CLI contract.
  - **`mission.json` schema** enforced by `mission-check.mjs` (`REQUIRED_FIELDS = ["name", "roadmapPath", "plansDir", "commands"]`, `REQUIRED_COMMANDS = ["test"]` at L13-14): no architecture doc owns this schema. (`mission-design.md` §5 touches it but that is a design doc, not an architecture doc.)
  - **`draft-state.json` schema** (multi-audit F5 flagged the schema is undocumented anywhere; this finding notes that the natural owner per AGENTS.md — `docs/architecture/` — is blank).
  - **`run-state.json` shape** including `subflowRuns` array contract, `visits` field, `_subflowId` convention: no architecture doc.
  - **`<BRIEF_GATE>pass|blocked</BRIEF_GATE>` marker contract** (WI2): no architecture doc.
  - **Public exports surface** (`main.js`: `cmdDraftMission`, `parseDraftArtifact`, `extractBriefGate`, `validateDraftDesc`, `__setRunnerFactoryForTest`; `engine.js`: `FlowEngine`, `extractTag`, `extractTagTolerant`, `extractTagFuzzy`, `stripAnsiControl`, `boundPromptSize`, `isTransientProviderError`; `mission-check.mjs`: `validateMission`, `loadMission`; `draft-job.mjs`: `startDraftJob`, `readDraftJob`, `listDraftJobs`, `__setSpawnerForTest`): no architecture doc enumerates which exports are public vs test seams.
- **Why this matters for the audit task**: the task explicitly said "Cross-reference against architecture docs for documented contract drift." The answer is **there is nothing to cross-reference against** — every contract drift finding (F1, F5, F9 below) is between design docs and code, not between architecture docs and code. The architecture-doc layer that AGENTS.md declares as the owner of "cross-cutting technical and module-boundary truth" is empty.
- **Severity rationale**: Low-Medium, not blocking, because (a) mission-driver's contracts ARE documented at the `tools/mission-driver/design/*.md` and `CONTEXT.md` level (so practical impact is bounded — every contract is documented somewhere); (b) this is project-wide template debt, not mission-driver-specific; (c) the AGE workflow does not require filling `docs/architecture/` until the project has cross-cutting technical concerns that span multiple features. But the task asked for this dimension specifically, so the gap must be recorded.
- **Recommended fix (any of)**:
  1. **Minimum** — Record in `docs/backlog/` a project-wide task to fill `docs/architecture/system-baseline.md` and `module-boundaries.md` once the project's first cross-cutting technical concern lands (this is template-debt paydown, not mission-driver work).
  2. **Mission-scoped** — If mission-driver is to be treated as a stable cross-cutting tool (which it is — `tools/mission-driver/design/mission-design.md:250` says it "operationalizes the AGE loop"), add a `docs/architecture/mission-driver-baseline.md` enumerating the public CLI / exports / schema contracts listed above. Cite the existing `tools/mission-driver/design/*.md` as detailed owner docs.
  3. **Defer explicitly** — Add a one-line note to `docs/architecture/README.md` that mission-driver's architecture is currently owned by `tools/mission-driver/design/*.md` and is intentionally not duplicated at the project architecture level until a second tool with cross-cutting concerns lands.

### F5 — [LOW-MEDIUM] Design doc body uses stale `main.js` line numbers throughout §1 / §2

- **Dimension**: owner-doc alignment · regression risk.
- **File**: `tools/mission-driver/design/draft-robustness-design.md` — 18 stale `main.js:` line citations across §1.1 / §1.2 / §1.4 / §2.1 / §4.x: confirmed live via `grep -n "main.js:" tools/mission-driver/design/draft-robustness-design.md` → 18 hits.
  - §1.1 (`:33`) cites `main.js:244-384` for `cmdDraftMission` — actual: `main.js:317-509`.
  - §1.1 (`:37,40`) cites Stage 1 `main.js:298-332` and Stage 2 `main.js:334-383` — actual: Stage 1 `:397-438`, Stage 2 `:458-509`.
  - §1.2 (`:52`) cites `main.js:340` for the `resolveTemplateVars` call — actual: `main.js:400-406` (Stage 1) and `:464-470` (Stage 2).
  - §1.4 (`:60-62`) cites `main.js:270-289` for `draft-state.json` write — actual: `main.js:362-382` (`stateFile` + `writeDraftState` closure + first call).
  - §2.1 (`:70`) cites `main.js:244` for `cmdDraftMission(desc, opts)` — actual: `main.js:317`.
  - §2.1 (`:76`) cites `main.js:675` for Commander `draft` registration — actual: `main.js:833-844` (`:833` `program.command("draft")`, `:844` `.action(...)`).
- **Reality**: `cmdDraftMission` shifted down by ~73 lines because WI1 added `validateDraftDesc` + base.json read block + JSDoc above the function, and WI2 added `extractBriefGate`. WI2's plan explicitly acknowledged this drift (`docs/plans/mission-driver-draft-robustness/2026-07-21-1207-1-brief-gate-marker.md:15`: "设计文档与 roadmap 沿用旧的 `:244-` 编号已过期，但内部相对位置仍准确"). Once F1 is fixed (Status → `implemented`), the stale line numbers become misleading rather than historical.
- **Severity**: Low-Medium (compounding with F1). Best fixed in the same edit as F1: either re-cite the live line numbers, or strip the line numbers entirely and reference function/section names (the latter is more durable). The remediation plan `2026-07-21-1005-1-design-owner-doc-sync.md` Phase 1 F2 owns the fix (preferred strategy: function-name anchors primary, line numbers secondary) but is `Plan Status: active` — not yet executed.

### F6 — [LOW-MEDIUM] WI1 plan exit criterion is fake closure — `base.json` integration path is untested (= prior H3)

- **Dimension**: verification adequacy · regression risk · fake closure / weak proof.
- **Files** (live-read during this audit):
  - `docs/plans/mission-driver-draft-robustness/2026-07-21-0954-2-cli-draft-desc-validate.md:102` (Exit Criteria, ticked): "[x] `missions/base.json` 加 `draft.minDescLength: 8` 时，阈值生效（`"add x"` 被拦、`"add audit count"` 通过）；删去该字段回退默认 4；写 `"garbage"`（字符串）或 `null` 时也回退默认 4（兜底）；删除整个 base.json 文件或写入非法 JSON 时，try/catch 兜底为 `{}`，回退默认 4（不抛错）。"
  - `tools/mission-driver/src/main.js:344-348` — integration code: `JSON.parse(readFileSync(resolve(resolved.missionsDir, "base.json"), "utf8")).draft?.minDescLength` extracted and passed to `validateDraftDesc(desc, N)`. Falls through to default `4` when missing or invalid.
  - `tools/mission-driver/test/draft-desc-validate.test.js` (full file, 217 lines) — **no test creates a real `base.json`** with `draft.minDescLength`. The pure function tests (Case A, L47-93) call `validateDraftDesc(desc, minLen)` directly, exercising the override mechanics in isolation. The integration tests (Cases B1/B2/C) call `cmdDraftMission` with no `base.json` on disk, so the integration path falls through the `catch {}` to `baseConfig = {}` and uses default 4.
  - Verified by grep during this audit: `grep -rn "writeFileSync.*base\.json" tools/mission-driver/test/` → matches only in `monitor.test.js` and `skip-steps.test.js`, neither of which exercises the WI1 wire-up.
- **The hidden regression vector**: if a future refactor breaks the integration read path — e.g. writes `baseConfig?.minDescLength` (forgetting `.draft.`), or `baseConfig?.draft?.min_desc_length` (snake_case typo), or moves the read out of `cmdDraftMission` — **all 510 tests still pass** because the pure function still works and the integration tests don't actually create a base.json. Production behavior would silently fall back to default 4 instead of the configured N. The plan's ticked exit criterion above is **claimed verified but is not actually verified** — exactly the "fake closure / weak proof" pattern the multi-dimensional prompt warns about when verification adequacy is challenged.
- **Severity**: Low-Medium. The default-4 fallback is correct today and the pure-function override is well-tested. The gap is in integration coverage that the plan's exit criteria CLAIM is closed. The remediation plan `2026-07-21-1523-1-non-foreach-subflow-and-test-gaps.md` Phase 2 owns the fix (3 new integration tests) but is `Plan Status: active` — not yet executed.
- **Recommended fix**: add three integration tests to `draft-desc-validate.test.js` that write a real `missions/base.json` with `{ draft: { minDescLength: 8 } }`, then invoke `cmdDraftMission("add xy", ...)` (len 6 ≥ 4 default but < 8 configured → distinguishing case), plus garbage-string fallback and null-value fallback cases. Three-test fix.

### F7 — [LOW-MEDIUM] `lint:prompts` is NOT part of `pnpm test` — a prompt-marker regression can pass the full unit suite while breaking the WI2 contract (= prior A2 / H4)

- **Dimension**: verification adequacy · regression risk · recurring process risk.
- **Files**:
  - `tools/mission-driver/package.json:11-13` — `"test": "node --test test/*.test.js"`, `"lint:prompts": "node src/prompt-check.mjs"`. Two separate scripts.
  - Every WI closure record and the prior audits' Verification Snapshot cite `pnpm --prefix tools/mission-driver test` + `pnpm --prefix tools/mission-driver run lint:prompts` as parallel verification. The actual `test` script does NOT include prompt linting.
  - `tools/mission-driver/test/brief-gate.test.js` Case F — grep anchor that looks for the literal `<BRIEF_GATE>` / `<BRIEF_GATE_REASON>` substrings in `mission-brief.md`. **Weaker than `prompt-check.mjs`'s structural result-tag validation**: a regression that breaks the marker shape (e.g. `<BRIEF_GATE pass>` instead of `<BRIEF_GATE>pass</BRIEF_GATE>`) but preserves the literals would slip past Case F while breaking `lint:prompts`.
- **Why this is a finding**: AGENTS.md "Verification Baseline" says "Use the real commands listed in `docs/context/project-context.md`" — when that command is `npm test`, an AI agent who runs only `npm test` would not catch a prompt-marker regression. The closure logs work because every human reviewer ran both commands manually; the test pipeline doesn't enforce it. This is the kind of recurring process risk AGENTS.md Operating Rule 15 asks to be promoted into an automated guard once it's a pattern.
- **Severity**: Low-Medium. The closure process DOES run both commands; the gap is in test-script composition, not in any individual closure. The remediation plan `2026-07-21-1005-2-verification-and-contract-hardening.md` Phase 1 A2 owns the fix (one-line edit) but is `Plan Status: active` — not yet executed.
- **Recommended fix**: change `package.json` `"test"` to `"node --test test/*.test.js && node src/prompt-check.mjs"` (or add a `"verify"` script that chains both, then update `CONTEXT.md` "构建与验证" + closure templates to cite `verify` instead of two separate commands). One-line fix; converts the recurring manual discipline into an automated guard.

### F8 — [LOW] `mission-design.md` §9 still describes single-stage draft; roadmap's promised owner-doc sync was silently downgraded (= prior F4 / A7)

- **Dimension**: owner-doc alignment · backlog/autonomy-policy drift.
- **File** (live-read during this audit): `tools/mission-driver/design/mission-design.md:238-249` (§9 Mission Draft Step).
- **Observed**: §9 only describes the legacy single-stage flow ("`draft <description>` triggers `mission-draft.md` prompt, AI executes: 1. Read user input... 7. Generate `missions/<name>.json`, output mission name."). It does not mention:
  - The two-stage brief → draft pipeline that mdo-4 introduced.
  - The `<BRIEF_GATE>pass|blocked</BRIEF_GATE>` marker contract (WI2).
  - The `{{backlogDir}}` template variable unification (WI3).
- **Source-of-truth check**: The roadmap's Cross-Cutting section (`docs/backlog/mission-driver-draft-robustness-roadmap.md:226`) explicitly promised:
  > Owner-doc sync: WI3 闭合后更新 `tools/mission-driver/design/mission-design.md` 的 draft 两段式说明（路径基准统一为 projectRoot）；WI2 闭合后更新 brief marker 契约描述.
  
  But the WI2 and WI3 closure sections both downgraded this to "No owner-doc update required" with rationale ("mission-design.md doesn't lock the backlog path baseline; gate is a prompt-internal contract not a module API"). The downgrade is documented per-plan, but the roadmap's cross-cutting promise was never re-adjudicated.
- **Why this is a finding**: The decision is defensible in isolation (mission-design.md is a higher-level stable doc; draft-robustness-design.md is the actual owner doc and IS aligned). But the contradiction between roadmap promise and plan closure is the kind of silent follow-up drop AGE warns against. A future agent reading mission-design.md §9 cold would not learn about the two-stage pipeline or gate marker contract from the doc that Section 5 ("Two-Phase Usage") points to for the draft command.
- **Severity**: Low. The actual contract owner (`draft-robustness-design.md`) is aligned; only the higher-level overview is stale. Either honor the roadmap promise (one-paragraph touch-up in `mission-design.md` §9) or explicitly re-adjudicate the cross-cutting row to "deferred — draft-robustness-design.md is the controlling owner doc, mission-design.md §9 will be updated when mdo-4 is documented as a stable baseline". The remediation plan `2026-07-21-1005-1-design-owner-doc-sync.md` Phase 2 owns the fix (Option A: paragraph touch-up in §9) but is `Plan Status: active` — not yet executed.

### F9 — [LOW] Undocumented public contract: `draft-state.json` schema has no formal owner doc (= prior F5)

- **Dimension**: architecture/boundary impact · public contract (compounds with F4/N1 above).
- **Files** (live-read during this audit): `src/main.js:362-382,417-422,432-437,451-453,495-506` writes the file; `src/draft-job.mjs:74-86` writes initial fields; `src/monitor.js` draft-job UI reads it; `src/draft-job.mjs:130-200` `readDraftJob` / `listDraftJobs` consume it.
- **Observed**: `draft-state.json` fields written across phases (`status`, `phase`, `startedAt`, `endedAt`, `desc`, `flowHint`, `targetFile`, `briefPath`, `briefGate`, `briefGateReason`, `missionName`, `roadmapPath`, `missionFile`, `error`) are not enumerated in any single owner doc. Design `draft-robustness-design.md` §1.4 (`:60-62`) lists the pre-WI2 field set; §4.2.3 (`:273-275`) mentions only the `briefGate` / `briefGateReason` additions. The full schema is implicit in the code.
- **Why this is a finding**: The `monitor.js` draft-job UI and `draft-job.mjs` consume these fields. The WI2 plan deferred the UI upgrade as out-of-scope (closure Deferred section: "monitor draft-job UI 显示 briefGate / briefGateReason 字段 — Successor Required: no"), but the schema itself was never documented as a public contract. Any future UI writer would have to grep `main.js` + `draft-job.mjs` to enumerate fields. Compounds with F2/A1: until the schema is documented, the gap between `startDraftJob`'s initial-write fields and `cmdDraftMission`'s patch fields stays implicit, and the F2 stuck-running failure mode stays invisible.
- **Severity**: Low. Internal contract between three files in the same tool; the producing code is the de-facto schema. A 10-line schema table in `draft-robustness-design.md` §1.4 would close the gap (the remediation plan `2026-07-21-1005-1-design-owner-doc-sync.md` Phase 1 F5 owns this) but is `Plan Status: active` — not yet executed.

### F10 — [LOW] `validateDraftDesc` deviation from design §4.1 order (empty→placeholder→length vs design's empty→length→placeholder) is documented in code JSDoc but NOT propagated to the design owner doc (= prior A6 / H8)

- **Dimension**: owner-doc alignment · silent code-doc divergence that invites a regression.
- **Files**:
  - `tools/mission-driver/src/main.js:199-204` — JSDoc documents the deviation: "Design's empty→length→placeholder order leaves 3-char blacklist entries (`xxx`, `foo`, `bar`, `n/a`) unreachable — they always trip length first. Swapping to empty→placeholder→length makes the blacklist actually useful."
  - `tools/mission-driver/design/draft-robustness-design.md:202-219` — design §4.1 still shows the OLD order (`empty → length → placeholder`), with no note that the implementation deviated for the documented reason.
- **Observed**: the deviation is **correct and well-justified** (under the design's order, 4 of 9 blacklist entries — `xxx`, `foo`, `bar`, `n/a` — are ≤3 chars and would always trip length first, making the blacklist unreachable for them). The problem is purely documentation hygiene: a future agent reading design §4.1 cold would conclude the implementation has a bug ("code does placeholder-before-length, design says length-before-placeholder") and might "fix" it back, silently breaking 4 blacklist entries (with no test to catch the breakage — see F13 below).
- **Severity**: Low. One-paragraph fix in design §4.1 (add a "Deviation note: implementation reorders to empty→placeholder→length; see `main.js:199-204` JSDoc" callout). Bundle with F1's Status update + F5's line-number refresh in a single doc-sync edit. The remediation plan `2026-07-21-1005-1-design-owner-doc-sync.md` Phase 1 A6 owns the fix but is `Plan Status: active` — not yet executed.

### F11 — [LOW] `extractBriefGate` reason regex uses `/is` flag (dotall) but design §4.2.2 specifies `/i` only — undocumented deviation + multi-line branch untested (= prior F3 / A5)

- **Dimension**: requirement correctness · owner-doc alignment · verification adequacy.
- **Files**:
  - `tools/mission-driver/src/main.js:187`:
    ```js
    const r = resultText.match(/<BRIEF_GATE_REASON>\s*(.+?)\s*<\/BRIEF_GATE_REASON>/is);
    ```
  - `tools/mission-driver/design/draft-robustness-design.md:249`:
    ```js
    const r = resultText.match(/<BRIEF_GATE_REASON>\s*(.+?)\s*<\/BRIEF_GATE_REASON>/i);
    ```
- **Observed**: The implementation adds the `s` (dotall) flag, which makes `.` match newline characters. This allows multi-line `<BRIEF_GATE_REASON>` text to be captured. WI2 plan Phase 1 item 1 says "直接采用设计文档 `draft-robustness-design.md` §4.2.2 的实现" (directly adopt the design's implementation) — but the implementation silently deviates.
- **Why this is a finding**: This is a positive enhancement (multi-line reasons are sensible), but the deviation is undocumented. The test suite (`test/brief-gate.test.js:58-96` Case A) only exercises single-line reasons, so the dotall behavior is unverified. If a future agent reverted `/is` back to `/i` to "match the design doc", multi-line reasons would silently start matching `null` instead of the full text.
- **Severity**: Low. Doc-only fix (update design §4.2.2 to specify `/is` and add a one-line test case for multi-line reason), or revert the implementation to `/i` (the AI is instructed to keep the reason to "one short sentence" per `mission-brief.md:41`). Sibling remediation plans own both sides: `2026-07-21-1005-1-design-owner-doc-sync.md` F3 (doc side) + `2026-07-21-1005-2-verification-and-contract-hardening.md` A5 (test side), both `Plan Status: active` — not yet executed.

### F12 — [LOW] `extractBriefGate` returns `reason: ""` (empty string) for whitespace-only `<BRIEF_GATE_REASON>`, but `reason: null` for the truly-empty tag — undocumented asymmetry (= prior A4 / H6)

- **Dimension**: requirement correctness · public contract nuance.
- **File**: `tools/mission-driver/src/main.js:184-189`.
- **Live verification (REPL probes during this audit)**:
  - `extractBriefGate("<BRIEF_GATE>pass</BRIEF_GATE><BRIEF_GATE_REASON></BRIEF_GATE_REASON>")` → `{gate: "pass", reason: null}` ✓
  - `extractBriefGate("<BRIEF_GATE>pass</BRIEF_GATE><BRIEF_GATE_REASON>   </BRIEF_GATE_REASON>")` → `{gate: "pass", reason: ""}` ⚠ (empty string, not null)
  - `extractBriefGate("<BRIEF_GATE>blocked</BRIEF_GATE><BRIEF_GATE_REASON>multi\nline\nreason</BRIEF_GATE_REASON>")` → `{gate: "blocked", reason: "multi\nline\nreason"}` ✓ (multi-line works, **no test exercises this** — compounds F11)
- **Why this is a contract drift**: the lazy `.+?` with surrounding `\s*` ends up matching the inner whitespace when the tag is whitespace-only (after the regex engine's backtracking), which `.trim()` then reduces to `""`. Consumers using `reason === null` to distinguish "no reason given" from "reason given" would treat whitespace-only as the latter; consumers using `!reason` would not. The `cmdDraftMission` consumer (`main.js:449`) uses `${reason || "(no reason)"}` which treats both the same — so production is OK today. But the contract is drift-prone.
- **Severity**: Low. One-line fix: postprocess `reason = r ? (r[1].trim() || null) : null` to normalize empty-string back to null; or tighten the regex. Add one Case A test for the whitespace-only input. The remediation plan `2026-07-21-1005-2-verification-and-contract-hardening.md` Phase 2 A4 owns the fix but is `Plan Status: active` — not yet executed.

### F13 — [LOW] `validateDraftDesc` blacklist regex has 9 entries; tests directly exercise only 5 (= prior A3 / H5)

- **Dimension**: verification adequacy · regression risk.
- **File**: `tools/mission-driver/src/main.js:213` — blacklist regex `/^(test|asdf|foo|bar|todo|xxx|none|null|n\/a)$/i`.
- **Test** (live-read during this audit): `tools/mission-driver/test/draft-desc-validate.test.js:64-70` — Case A "rejects placeholder words" iterates only `["test", "asdf", "xxx", "TODO", "N/A"]`. **Missing direct assertions for**: `foo`, `bar`, `todo` (lowercase), `none`, `null` (4 of 9 entries, plus `todo` lowercase which is in the regex but not the test array).
- **Live verification (REPL probe during this audit)**: `validateDraftDesc("foo")`, `("bar")`, `("todo")`, `("none")`, `("null")` all correctly return `{ok: false, reason: /placeholder/}`. So the implementation is correct today — but the regex is one typo away from silently dropping entries (e.g. someone refactors to a Set and forgets one; or a future "cleanup" PR collapses `none`+`null` into a single `nullish` check) with no test to catch it.
- **Why this is a finding**: the blacklist is the **core** of WI1's deterministic contract; an untested entry is a latent regression vector. Compounds with F10: if a future "fix" reverts the order back to empty→length→placeholder, 4 entries (`xxx`, `foo`, `bar`, `n/a`) become unreachable and there is no test to catch the silent breakage.
- **Severity**: Low. Trivial fix: extend the Case A array to all 9 entries (plus 2 case-insensitivity anchors). The remediation plan `2026-07-21-1005-2-verification-and-contract-hardening.md` Phase 1 A3 owns the fix but is `Plan Status: active` — not yet executed.

### F14 — [LOW] `subflow-incremental.test.js` Case B depends on microtask-scheduling timing (200ms vs 10ms waits) — fragile on slow CI (= prior H9)

- **Dimension**: verification adequacy · brittle test that may flake on slow Windows CI.
- **File** (live-read during this audit): `tools/mission-driver/test/subflow-incremental.test.js:119-167` — Case B uses `delays = [10, 10, 200]` and asserts `snapStep.subflowRuns.length === 2` after item 2's slow delay completes. The 200ms figure is arbitrary; on a saturated CI runner the 10ms delays for items 0/1 could stretch, and the assertion's correctness depends on the invariant "items 0 and 1 finish within 200ms of dispatch".
- **Why this is a finding**: the WI5 plan's Draft Review iteration 1 note (referenced at `:122-127` of the test) acknowledges a microtask race that was fixed by adding the 200ms delay — but the chosen delay is not principled. The test could be made deterministic by using a counting latch instead of timeouts. The pattern is real on this Windows host: sibling `monitor.test.js` exhibited the same family of timing flakiness ("在高并发全量套件下偶发 Windows EACCES" per WI2 log).
- **Severity**: Low. The 200ms margin is large in practice (10ms timers rarely stretch 20×). The test passes consistently today (re-verified 510/510 in this audit's Verification Snapshot). The remediation plan `2026-07-21-1523-1-non-foreach-subflow-and-test-gaps.md` Phase 3 owns the fix (deterministic latch rewrite) but is `Plan Status: active` — not yet executed.

## Clean Aspects (Re-Verified During This Audit)

- **Engine core zero-dependency invariant** preserved — only `node:url` (built-in) added across all 5 WIs. `package.json:15-17` shows `commander` as the only runtime dep.
- **All 510 tests pass** (live-replayed: 10.2s, 0 fail).
- **`lint:prompts` passes** (live-replayed).
- **WI4 cross-platform CLI** — `node tools/mission-driver/src/mission-check.mjs missions/mission-driver-draft-robustness.json .` runs cleanly on this Windows host and emits `"valid": true` (the exact regression path the old `file://${argv[1]}` concatenation silently no-op'd). The `process.argv[1] &&` short-circuit guard protects `node -e` / `node -` hosts.
- **Atomic-write discipline**: `_writeWorkflow` (`engine.js:427-436`) and `_atomicWrite` (`run-reconcile.mjs`) both use `tmp + renameSync`; the reconcile variant adds a Windows-aware `_renameWithRetry` for EPERM/EBUSY/EACCES — the project clearly knows Windows filesystem race issues and handles them.
- **Backward compatibility**: WI2's `gate === null` path preserves old single-stage behavior; WI3's `{{backlogDir}}` injection is transparent to existing `{{x}}` substitutions; WI5's `_wfAppendSubflowRun` is a no-op when no matching placeholder exists (verified by `subflow-incremental.test.js` Case E); WI4's `process.argv[1] &&` short-circuit guard protects REPL / `node -e` / `node -` hosts.
- **Routing correctness** (AGENTS.md Task Routing): every WI plan correctly self-classified as `implementation-only change`, with `Skill: none` per item and per-item justification — matches AGENTS.md Skill Usage Rule.
- **Reviewer-Availability Fallback** correctly applied per AGENTS.md: every plan records `solo cold-replay closure pass` with explicit non-protected / non-high-risk rationale (no API / DB / auth / integration / deployment contract changes).
- **Remediation tracking (NEW positive observation)**: Four remediation plans exist covering 14 of 15 findings, each with completed Draft Review Records showing real `needs revision → ... → accept` cycles (e.g. `2026-07-21-1005-3` iteration 1 caught the TDZ `ReferenceError` risk; `2026-07-21-1523-1` iteration 1 caught the test-count math errors and H3 distinguishing-desc internal contradiction). The remediation infrastructure is sound; the gap is purely that none have been implemented yet.

## Residual Risks by Dimension

| Dimension                              | Residual risk                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Requirement correctness                | F2 (stuck-running), F3 (non-forEach persistence), F11 (`/is` deviation), F12 (null vs `""`); implementation otherwise matches design §4.1–§4.5. |
| Owner-doc alignment                    | F1 (Status field), F5 (stale line numbers), F10 (order deviation), F11 (regex flag), F8 (mission-design.md §9 stale + roadmap promise silently downgraded), F9 (draft-state.json schema undocumented). |
| Architecture / boundary impact         | F4/N1 (architecture docs are blank templates — no documented mission-driver contracts at architecture level, **net-new finding**); F9 (draft-state.json contract); otherwise engine core zero-dep invariant preserved; no new npm dependencies; named test exports are additive. |
| Verification adequacy                  | F6 (fake closure on base.json integration test), F7 (lint:prompts not chained into test), F11 (multi-line branch untested), F13 (5 of 9 blacklist entries untested), F14 (timing-fragile Case B). Otherwise 510/510 green; each WI matches design §7. |
| Regression risk                        | F2 (stuck-running), F6 (base.json wire-up silently broken by refactor), F13 (blacklist entries silently dropped). Existing suite green; engine invariants preserved. |
| Routing / skill-selection correctness  | Clean. All WI plans correctly self-classified with `Skill: none`. |
| Backlog / autonomy-policy drift        | F8 (roadmap cross-cutting promise vs plan closure decision) — well-formed per-plan, but the contradiction is undocumented. Four remediation plans are `Plan Status: active` but not yet tracked as roadmap rows. |
| Project-specific (architecture-doc coverage) | F4/N1 — `docs/architecture/system-baseline.md` and `module-boundaries.md` are unfilled template stubs; AGENTS.md declares `docs/architecture/` as owner of "cross-cutting technical and module-boundary truth" but mission-driver's public contracts are entirely undocumented at that level. |

## Recommendation

**needs revision**

Primary blockers (any one closes the audit):

- **F1** — design doc `Status:` field drift. A documented-contract drift between the design owner doc and the implementation, identical in nature to the sibling `mission-driver-step-audit` multi-audit's F1 which was also flagged as blocking. The fix is a one-line Status update plus optional section-header annotations (and ideally F5 line-number refresh in the same edit). The remediation plan `2026-07-21-1005-1-design-owner-doc-sync.md` is `Plan Status: active` and ready to execute.
- **F2** — silent stuck-`running` `draft-state.json` when WI1 rejects a monitor-submitted desc. The failure mode directly contradicts the mission's "draft pipeline robustness" goal, and the WI1 plan's promised successor (`Successor Required: yes`) was never tracked — a textbook fake-closure / orphan-follow-up pattern. The minimum remediation is small (4-line `writeDraftState` patch in `cmdDraftMission`'s reject branch + TDZ-safe definition move). The remediation plan `2026-07-21-1005-3-stuck-running-draft-state-remediation.md` is `Plan Status: active` and ready to execute.

Secondary revision work, all small, that should be bundled in the same pass (each is owned by an existing `Plan Status: active` remediation plan):

- **F3** — either add a doc note scoping WI5 to forEach subflows, or extend `_executeSubflowStep`'s non-forEach branch to also call `_wfAppendSubflowRun` (`2026-07-21-1523-1` Phase 1).
- **F4 / N1 (net-new)** — record the architecture-doc coverage gap as a project-wide template-debt task in `docs/backlog/`, OR add `docs/architecture/mission-driver-baseline.md` documenting the public CLI / exports / schema contracts. Not owned by any existing remediation plan — needs a new plan or backlog row.
- **F5** — refresh stale `main.js:` line numbers in `draft-robustness-design.md` §1/§2 (`2026-07-21-1005-1` Phase 1 F2).
- **F6** — add 3 integration tests that actually create a `base.json` with `draft.minDescLength`, so the WI1 plan's ticked exit criterion stops being fake closure (`2026-07-21-1523-1` Phase 2).
- **F7** — chain `lint:prompts` into `pnpm test` so a prompt-marker regression cannot pass the suite (`2026-07-21-1005-2` Phase 1 A2).
- **F8 + F9 + F10 + F11 (doc side)** — single doc-sync edit on `draft-robustness-design.md` and `mission-design.md` (`2026-07-21-1005-1` Phases 1 + 2).
- **F11 (test side) + F12 + F13** — extractBriefGate normalization + multi-line test + blacklist coverage extension (`2026-07-21-1005-2` Phases 1 + 2).
- **F14** — replace wall-clock delay with deterministic latch (`2026-07-21-1523-1` Phase 3).

Once F1 and F2 are closed (design doc `Status:` updated AND stuck-running failure mode eliminated or successor tracked), this audit would flip to **passes multi-dimensional audit** with the Residual Risks table above as the watchlist.

## Files Touched By This Audit

- This file (write): `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-multi-audit-mission-driver-draft-robustness.md`

No code, config, flow, prompt, plan, or test file was modified by this audit. All evidence cited is from live reads of the repo and live test/lint/REPL probes performed during the audit (`pnpm --prefix tools/mission-driver test` → 510 pass / 0 fail; `pnpm --prefix tools/mission-driver run lint:prompts` → OK; `node tools/mission-driver/src/mission-check.mjs missions/mission-driver-draft-robustness.json .` → `"valid": true`; REPL probes on `validateDraftDesc` / `extractBriefGate`).

<AI_STEP_RESULT>issues</AI_STEP_RESULT>
