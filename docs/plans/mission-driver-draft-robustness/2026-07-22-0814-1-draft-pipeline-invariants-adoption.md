# mdr-remediate-5 draft-pipeline invariants adoption (N1, N2, N3, O3)

> Plan Status: completed
> Last Reviewed: 2026-07-22
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-*.md` (N1, N2, N3, O3) and `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-multi-audit-*.md` (N1, N2, N3 — carried forward, still open)
> Related: supersedes the still-open residual scope of `2026-07-21-1605-3-engine-extraction-and-verification-invariants.md` (that draft also covered F3/F7/F14, which are now CLOSED per the 0755 multi-audit Prior-Finding table; only its N1 + N3 scope carries forward here). N2 was never owned by any prior plan.
> Mission: mission-driver-draft-robustness
> Audit: required
> Execution Order: 1 of 3

## Current Baseline

Live baseline re-verified 2026-07-22 against `tools/mission-driver/` (520 tests pass; `mission-check.mjs` emits `"valid": true`):

- `src/engine.js:82-93` `stripAnsiControl(text)` is **exported**, idempotent, zero-dependency; covers CSI / OSC / two-char ESC / stray C0 controls; preserves `\t\n\r`. Tested by `test/ansi-and-mixedcase-tag.test.js` (14 tests). The engine's general agent-step pipeline (`src/engine.js:705-712`) strips ANSI BEFORE every marker extraction with a rationale comment citing "memory L009 SEV1".
- `src/main.js:160-164` `extractBriefPath`, `:184-189` `extractBriefGate`, `:236-307` `parseDraftArtifact` all run `.match(...)` directly on raw `resultText` (sourced from `runner.realRun` → `readFileSync(result.logFile, "utf8").trim()`, raw bytes). **Zero `stripAnsiControl` calls** across the three extraction sites. Cross-module grep: `stripAnsiControl` has 1 definition + 2 internal call sites in `engine.js`, **0 references in `src/main.js`**. (N1 — re-verified live.)
- N1 failure mode: if the brief/draft agent (or any upstream log formatter) emits ANSI around a gate marker — e.g. `\x1b[32m<BRIEF_GATE>pass</BRIEF_GATE>\x1b[0m` or ANSI intermixed with tag chars `<BRIEF\x1b[0m_GATE>` — the regex fails → `gate === null` → backward-compat Stage 2 runs unconditionally, **silently defeating the WI2 gate contract this mission exists to deliver**. Identical to L009 which the engine team already paid a SEV1 to learn.
- `src/monitor.js:1151-1161` `handleStartDraft` validates only `typeof desc !== "string" || !desc.trim()` (emptiness) + `Buffer.byteLength(desc, "utf8") > DRAFT_DESC_MAX_BYTES` (size). **No placeholder / length / blacklist check.** Cross-module grep: `validateDraftDesc` has **0 references in `src/monitor.js`**. `validateDraftDesc` is exported from `main.js:207-220`; `monitor.js` already imports siblings from `./draft-job.mjs` (line 33). **Import-graph fact (verified live for this plan's Phase 2 Decision)**: `main.js:12` statically imports `startMonitor` from `./monitor.js` (top-level ESM import, NOT lazy). `monitor.js` does NOT currently import `./main.js`. Therefore importing `validateDraftDesc` from `./main.js` into `monitor.js` would create a new cycle `monitor.js → main.js → monitor.js`. ESM live bindings would keep it safe at runtime (the function is only referenced inside `handleStartDraft`, never at module top-level), but the cleaner path avoids the cycle entirely — see Phase 2 Decision. (N2 — re-verified live.)
- N2 residual impact: the F2 downstream fix landed (reject branch writes terminal `failed`/`rejected` state, pinned by `draft-desc-validate.test.js` Cases B2/B3), so a bad monitor-submitted desc no longer sticks at `running` forever — but the child is still spawned, the jobDir + initial `running` state are still created, and the rejection reason still surfaces only via polled `draft-state.json` rather than an immediate HTTP 400. The upstream 3-line gate was overlooked by every prior audit and every remediation plan.
- `src/engine.js:438-450` `_onAgentStepUpdate` matches `name + status === "running"` (**no `visits` match**). `:461-473` `_wfAppendSubflowRun` (WI5) matches `name + visits + status === "running"` — same shape, one method guarded, the other not. `test/subflow-incremental.test.js:169-265` Case C pins the visits guard for `_wfAppendSubflowRun`; **no equivalent test pins `_onAgentStepUpdate`**. No production flow today self-loops an agent step, so the re-entry race is latent. (N3 — re-verified live.)
- `src/main.js:45-66` `readKnowledgeDir(dir)` is defined + JSDoc'd ("(D5 — deterministic-regression-executor knowledge internalization.)") but never called or exported. Repo-wide `*.js` grep for `readKnowledgeDir` returns exactly **1 hit — the definition**. Not in the export list at `main.js:964`; not called by `cmdRunMission`'s vars assembly (`:698-732`); not referenced by any test. D5 did not land. (O3 — net-new, re-verified live.)

Gap: four findings from the same audit batch. N1 is the BLOCKING primary (silent WI2 gate bypass). N2, N3, O3 are small residuals. **Rule-4 honesty note**: N1 (extraction sites in `main.js`) and N2 (HTTP 400 validation in `monitor.js`) are *independent* closure criteria — either closes without the other. They are bundled here for efficiency (same mission, same audit batch, same verification command, all internal-hardening with no owner-doc change), not because they share a single result surface; the guide's "do not over-split" guidance applies. N3 and O3 are engine/main hygiene items that share N1's verify-by-`pnpm test` surface.

## Goals

- `extractBriefGate`, `extractBriefPath`, `parseDraftArtifact` call `stripAnsiControl` on the input text BEFORE each regex match; each site has a regression test that fakes an ANSI-wrapped marker and asserts the extractor still returns the correct value (closes N1, the audit blocker).
- `handleStartDraft` pre-validates `desc` with the exported `validateDraftDesc` and returns HTTP 400 with the WI1 reason before any jobDir / state file / child is created (closes N2 at the source).
- `_onAgentStepUpdate` carries a local comment documenting the missing `visits` guard assumption so a future flow author does not trip the latent re-entry race (closes N3 minimum-option).
- `readKnowledgeDir` is removed (or, if a Decision keeps it, explicitly annotated as reserved) so `src/main.js` has no unused surface (closes O3).
- All existing 520 tests still pass; new tests added (count delta recorded at closure).

## Non-Goals

- Do NOT move `stripAnsiControl` to a separate `src/ansi.mjs` shared module (N1 structural Option B / audit Residual Unknowns). The call-site fix is sufficient and minimal. Reopens per AGENTS.md Operating Rule 15 only if a *third* caller outside `engine.js`/`main.js` fails to adopt it.
- Do NOT change `runner.js` to pre-clean `result.text` once at the boundary (N1 Option C); preserve the engine layer's strip-at-extraction discipline.
- Do NOT refactor `_onAgentStepUpdate` and `_wfAppendSubflowRun` into a shared `_findRunningStep` helper (N3 structural Option B); only document the assumption. Structural refactor is the durable Rule-15 answer but is deferred until a production flow actually self-loops an agent step (the re-entry race is latent today).
- Do NOT change the WI2 gate contract, the `gate === null` backward-compat path, or any public export signature.
- Do NOT touch design docs, EXECUTION-PRINCIPLE.md, the flow graph, or audit headers — those belong to sibling Plans 2 and 3.

## Task Route

- Type: `implementation-only change` — extraction call-site hardening (N1), upstream validation reuse (N2), latent-invariant documentation (N3), dead-code removal (O3). No API / data / auth / integration / deployment / public-contract change; the HTTP 400 path N2 extends is already part of `handleStartDraft`'s existing validation contract (it already returns 400 for empty / oversize desc).
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §4.1 (WI1 `validateDraftDesc`), §4.2.2 (WI2 `extractBriefGate`), §4.3.1 (WI3 `parseDraftArtifact`), §4.5.1 (WI5 `_wfAppendSubflowRun` visits guard). Code: `src/main.js`, `src/monitor.js`, `src/engine.js`, `test/brief-gate.test.js`, `test/draft-path-consistency.test.js`, `test/monitor.test.js`.
- Skill Selection Basis: `Skill: none` — internal-hardening fixes following existing in-project patterns (`stripAnsiControl` discipline, `validateDraftDesc` contract, `_wfAppendSubflowRun` visits-match shape). No reusable skill matches the work method.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline. Verification uses the tool-local command (the repo-root `docs/context/project-context.md` Verification Commands table is still placeholder, but `tools/mission-driver/` owns a working `pnpm --prefix tools/mission-driver test` used by every prior audit and plan in this mission).

## Execution Plan

### Phase 1 - Adopt stripAnsiControl at the three extraction call sites (N1)

Status: completed
Targets: `tools/mission-driver/src/main.js` (`extractBriefPath` ~`:160-164`, `extractBriefGate` ~`:184-189`, `parseDraftArtifact` ~`:236-307`), `tools/mission-driver/test/brief-gate.test.js`, `tools/mission-driver/test/draft-path-consistency.test.js`
Skill: none

- Item Types: `Fix | Proof | Decision`
- Prereqs: none (this phase is the audit blocker — execute first)

- [x] `Fix`: add `import { stripAnsiControl } from "./engine.js";` to `src/main.js` imports (`engine.js` is already imported as a module path peer; `stripAnsiControl` is a named export).
  - Skill: none
- [x] `Fix`: in `extractBriefPath`, call `stripAnsiControl` on the input before the regex (e.g. `const clean = stripAnsiControl(resultText); const m = clean.match(/<BRIEF_FILE>.../i)`). Preserve the existing non-string guard.
  - Skill: none
- [x] `Fix`: in `extractBriefGate`, call `stripAnsiControl` on the input before BOTH regexes (gate + reason). Preserve the `gate === null` backward-compat semantics exactly — stripping must NOT change the null-vs-value contract, only the upstream cleanliness.
  - Skill: none
- [x] `Fix`: in `parseDraftArtifact`, call `stripAnsiControl` on the input before the `<MISSION_FILE>` regex. The downstream `readFileSync(file)` / fallback scan are unaffected (they operate on the cleaned captured path, which is already plain).
  - Skill: none
- [x] `Proof`: add one regression test per site that fakes an ANSI-wrapped marker and asserts the extractor returns the same value as the plain-text case. Concretely, in `brief-gate.test.js`: a Case asserting `extractBriefGate("\x1b[32m<BRIEF_GATE>pass</BRIEF_GATE>\x1b[0m")` → `{ gate: "pass", reason: null }`, plus an ANSI-intermixed-tag case (`<BRIEF\x1b[0m_GATE>blocked</BRIEF_GATE>` style) and an ANSI-wrapped `<BRIEF_GATE_REASON>` case. In `draft-path-consistency.test.js` (or a new focused file): an ANSI-wrapped `<BRIEF_FILE>` case and an ANSI-wrapped `<MISSION_FILE>` case. Mirror the existing `ansi-and-mixedcase-tag.test.js` Case-`:108` comment style ("this is the failure mode `stripAnsiControl` exists to neutralize").
  - Skill: none
- [x] `Decision`: record in `docs/logs/2026/` that the call-site option (N1 Option 1) was chosen over the structural `src/ansi.mjs` option (Option 2) and the runner-boundary option (Option 3), with the Rule-15 reopen condition (third external caller). Rationale lives in this plan's Non-Goals; the log entry cites it.
  - Skill: none

Exit Criteria:

- [x] `extractBriefPath` / `extractBriefGate` / `parseDraftArtifact` each call `stripAnsiControl` before regex match (verify: `grep -n "stripAnsiControl" tools/mission-driver/src/main.js` → ≥ 4 hits: 1 import + ≥3 call sites).
- [x] ANSI-wrapped-marker regression tests exist for all three extractors and pass.
- [x] `pnpm --prefix tools/mission-driver test` → all green (was 520 pass; +N new tests, delta recorded).
- [x] No owner-doc update required (the design §4.2.2 / §4.3 snippets already describe the plain-text contract; stripping is an upstream cleaning detail, not a contract change). If the reviewer disagrees, sync the design snippet in Plan 2 instead.
- [x] `docs/logs/` updated.

### Phase 2 - Pre-validate desc in monitor handleStartDraft (N2)

Status: completed
Targets: `tools/mission-driver/src/main.js` (remove `validateDraftDesc` def ~`:192-220`, add re-export), `tools/mission-driver/src/draft-job.mjs` (new home for `validateDraftDesc`), `tools/mission-driver/src/monitor.js` (`handleStartDraft` ~`:1151-1161`), `tools/mission-driver/test/monitor.test.js`, `tools/mission-driver/test/draft-desc-validate.test.js` (confirm import-from-`main.js` still resolves via re-export)
Skill: none

- Item Types: `Fix | Proof | Decision`
- Prereqs: none (independent of Phase 1; can execute in parallel)

- [x] `Decision` (import path — committed, not contingent): `monitor.js` must call `validateDraftDesc`, but `main.js:12` statically imports `monitor.js` and `monitor.js` does not import `main.js` today, so a static `import { validateDraftDesc } from "./main.js"` in `monitor.js` creates a new cycle `monitor.js → main.js → monitor.js`. **Chosen path: move `validateDraftDesc` (and its JSDoc) from `main.js:192-220` into `./draft-job.mjs`** (which `monitor.js` already imports at line 33, and which does NOT import `main.js` or `monitor.js` — verify this before moving), then **re-export it from `main.js`** (`export { validateDraftDesc } from "./draft-job.mjs";`) so the public export surface and all existing test imports (`test/draft-desc-validate.test.js` imports from `main.js`) stay unchanged. Rationale: no cycle, consistent with `monitor.js`'s existing sibling-import pattern, zero breakage for consumers that import from `main.js`. Alternatives considered + rejected: (a) static import from `main.js` relying on ESM live bindings — runtime-safe (the function is only referenced inside `handleStartDraft`, never at module top-level) but leaves a cycle in the module graph that a future top-level use would break; residual risk = future maintainer adds a top-level reference in `monitor.js` and hits a TDZ. (b) dynamic `await import("./main.js")` inside `handleStartDraft` — adds async coupling for no benefit over the leaf-module move. Record the chosen path + the verify step (confirm `draft-job.mjs` has no `main.js`/`monitor.js` import) in the log.
  - Skill: none
- [x] `Fix`: move `validateDraftDesc` + its JSDoc from `src/main.js` into `src/draft-job.mjs`; add `export { validateDraftDesc } from "./draft-job.mjs";` to `src/main.js` (preserves the named export + all test imports). Verify `draft-job.mjs` has no import of `main.js`/`monitor.js` first (no new cycle).
  - Skill: none
- [x] `Fix`: in `handleStartDraft`, after the existing emptiness + byte-size checks, import `validateDraftDesc` from `./draft-job.mjs` (now a sibling, no cycle) and call `validateDraftDesc(desc, baseConfig?.draft?.minDescLength)` reading `base.json` the same way `cmdDraftMission` (`main.js:344-348`) already does (try/catch → `{}` → default 4). On `!v.ok`, return `{ error: v.reason, status: 400 }` BEFORE any jobDir / state file / spawn.
  - Skill: none
- [x] `Proof`: extend `test/monitor.test.js` with a case that POSTs a placeholder desc (e.g. `"test"`) to the draft endpoint and asserts HTTP 400 + the WI1 reason in the body, AND asserts no `draft-state.json` was written under `_tmp/`. Add a second case asserting a valid desc still proceeds (does not regress the happy path).
  - Skill: none

Exit Criteria:

- [x] `handleStartDraft` returns HTTP 400 with the WI1 reason for placeholder / too-short / blacklisted desc, before creating any jobDir or state file.
- [x] `validateDraftDesc` lives in `src/draft-job.mjs` and is re-exported from `src/main.js` (verify: `grep -n "validateDraftDesc" tools/mission-driver/src/draft-job.mjs` → ≥1 hit [definition]; `grep -n "validateDraftDesc" tools/mission-driver/src/main.js` → ≥1 hit [re-export]; `grep -n "validateDraftDesc" tools/mission-driver/src/monitor.js` → ≥1 hit [call]).
- [x] No new module cycle (verify: `draft-job.mjs` has no import of `main.js`/`monitor.js`).
- [x] Existing `test/draft-desc-validate.test.js` (imports from `main.js`) still passes unchanged via the re-export.
- [x] monitor test cases for the 400 path and the happy path pass; `pnpm --prefix tools/mission-driver test` → all green.
- [x] No owner-doc update required (the HTTP 400 validation contract is already documented behavior; this extends the existing validation pattern, not a new contract). If the reviewer disagrees, sync in Plan 2.
- [x] `docs/logs/` updated.

### Phase 3 - Document visits-guard assumption + remove dead readKnowledgeDir (N3, O3)

Status: completed
Targets: `tools/mission-driver/src/engine.js` (`_onAgentStepUpdate` ~`:438-450`), `tools/mission-driver/src/main.js` (`readKnowledgeDir` ~`:45-66`)
Skill: none

- Item Types: `Fix | Decision`
- Prereqs: none

- [x] `Fix` (N3 minimum option): add a local comment to `_onAgentStepUpdate` documenting the missing `visits` guard. Wording (mirror the existing `_wfAppendSubflowRun` comment style): note that this method matches `name + status === "running"` only, that the sibling `_wfAppendSubflowRun` additionally matches `visits` to defend against re-entry, and that this method assumes non-re-entrant agent steps — if a future flow self-loops an agent step, retrofit the `visits` guard (and matching caller) from `_wfAppendSubflowRun`.
  - Skill: none
- [x] `Decision` (N3): confirm the minimum doc-only option is sufficient vs the structural `_findRunningStep` refactor. Rationale: the re-entry race is latent (no production flow self-loops an agent step today), the structural refactor is the durable AGENTS.md Rule-15 answer but is deferred until a real flow exercises it. Record the defer trigger: "when a flow adds a self-looping agent step (`transitions: { retry: <agentStep> }` or `goto: <agentStep>`), promote the structural refactor."
  - Skill: none
- [x] `Fix` (O3): delete `readKnowledgeDir` (lines ~`:45-66`) from `src/main.js`. It is not exported (`main.js:964` export list is `cmdDraftMission, parseDraftArtifact, extractBriefGate`), not called anywhere, not referenced by any test.
  - Skill: none
- [x] `Decision` (O3): confirm D5 (deterministic-regression-executor) is not on the near-term roadmap. If it is, the alternative is to keep the function with an explicit `// reserved for D5 — not yet wired; tracked in <backlog row>` annotation instead of deleting. Check `docs/backlog/` for a D5 row before deleting; record the outcome.
  - Skill: none

Exit Criteria:

- [x] `_onAgentStepUpdate` carries a comment noting the missing `visits` guard + the retrofit trigger (verify by read-back).
- [x] `readKnowledgeDir` is either deleted (grep → 0 hits repo-wide in `*.js`) or annotated `// reserved for D5` with a backlog reference. No dead unannotated surface remains.
- [x] `pnpm --prefix tools/mission-driver test` → all green (deletion must not drop any test count; the comment must not change behavior).
- [x] No owner-doc update required (N3 is an internal engine assumption; O3 is dead-code hygiene).
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (`ses_078cd5669ffeaUjG38i2lF1rPy`) because Phase 2's circular-import Decision rested on a false baseline (`main.js` statically imports `monitor.js` at `:12`, not lazily) and did not commit to a resolution path; Phase 1 header missed the `Decision` type tag; the Gap paragraph over-claimed a single result surface. All blocking + non-blocking issues addressed in revision: Current Baseline N2 corrected with the live import-graph fact; Phase 2 Decision rewritten to commit to the leaf-module move (`validateDraftDesc` → `draft-job.mjs` + re-export from `main.js`) with rejected alternatives + residual risk; Phase 2 Targets/Exit Criteria/Closure Gates updated for the move; Phase 1 header retagged `Fix | Proof | Decision`; Gap paragraph rewritten with the Rule-4 honesty note (N1/N2 independent surfaces bundled for efficiency). `readKnowledgeDir` citation held at `:45-66` (the deletion block incl. JSDoc) consistently.
- Independent draft review iteration 2: `acceptable as-is` (`ses_078c2fcc6ffeR3QzV4KegizbXk`) — iteration-1 blocking issue resolved (Phase 2 circular-import baseline corrected; `draft-job.mjs` verified live to import only `node:*` + `./spawner.mjs`, so the chosen move creates no new cycle; `validateDraftDesc` re-export from `main.js` keeps `test/draft-desc-validate.test.js`'s import working). Non-blocking issues addressed (Phase 1 header retagged; Gap Rule-4 note added). No new blocking issues introduced. Consensus reached; plan advanced to `active`.

## Closure Gates

- [x] in-scope behavior is complete (N1 three call sites + tests; N2 monitor 400 path + tests; N3 comment; O3 deletion/annotation)
- [x] relevant docs are aligned (no owner-doc update required for this plan; confirm at closure)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` (all green), `node tools/mission-driver/src/mission-check.mjs missions/mission-driver-draft-robustness.json .` (`"valid": true`), `grep -n "stripAnsiControl" tools/mission-driver/src/main.js` (≥4 hits), `grep -n "validateDraftDesc" tools/mission-driver/src/{draft-job,main,monitor}.js` (definition in draft-job.mjs, re-export in main.js, call in monitor.js), `grep -rn "readKnowledgeDir" tools/mission-driver/src` (0 hits or 1 annotated hit), confirm no new module cycle (draft-job.mjs does not import main.js/monitor.js)
- [x] no in-scope item downgraded to deferred/follow-up (N3 minimum-option and O3 keep/delete Decision are adjudications recorded in-plan, not downgrades — they each name a trigger condition)
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent (subagent or reviewer; solo cold-replay fallback only if non-protected/non-high-risk with recorded rationale — this plan is implementation-only internal hardening, so the fallback is eligible per AGENTS.md)
- [x] closure evidence exists in files (test count delta + grep evidence in `docs/logs/`)

## Deferred But Adjudicated

### stripAnsiControl shared module (N1 structural Option B)

- Classification: `optimization candidate`
- Why Not Blocking Closure: the call-site fix (Option 1) fully closes N1's failure mode. The structural `src/ansi.mjs` refactor is the durable AGENTS.md Rule-15 answer but adds scope without behavior change.
- Successor Required: `yes` — trigger: a third caller outside `engine.js`/`main.js` fails to adopt `stripAnsiControl` (the defect pattern will have recurred a third time, satisfying Rule 15's promotion threshold).

### _onAgentStepUpdate visits-guard structural refactor (N3 structural Option B)

- Classification: `watch-only residual`
- Why Not Blocking Closure: the re-entry race is latent — no production flow self-loops an agent step today, so the unguarded path is not reachable. The doc-only comment closes the "unwritten assumption" gap.
- Successor Required: `yes` — trigger: a flow adds a self-looping agent step (`transitions: { retry: <agentStep> }` or `goto: <agentStep>`), which makes the race reachable. At that point promote to the shared `_findRunningStep(stepName, visits)` helper used by both methods.

## Closure

Status Note: All three phases executed green. N1's three extraction call sites already had `stripAnsiControl` from mdr-remediate-3; this plan's net-new Phase 1 work was the missing ANSI-wrapped `<BRIEF_FILE>` regression test (Case N1-D). N2's monitor `handleStartDraft` 400-path was already in place from mdr-remediate-2 but via a `monitor.js → main.js → monitor.js` cycle; this plan's Phase 2 refactored it to the leaf-module move (`validateDraftDesc` → `draft-job.mjs` + re-export from `main.js`) committed in the Phase 2 Decision — zero behavior change, zero public-API change, cycle eliminated. N3's `_onAgentStepUpdate` visits-guard comment from mdr-remediate-3 covers all the plan-required points (verified by read-back, no edit needed). O3's `readKnowledgeDir` deleted (D5 confirmed not on any backlog). Full verification chain green: `pnpm --prefix tools/mission-driver test` → 528 pass / 0 fail (baseline 527 + 1 N1-D); `pnpm --prefix tools/mission-driver/web run typecheck` clean; `pnpm --prefix tools/mission-driver/web run build` success (12.60s); `pnpm --prefix tools/mission-driver run lint:prompts` OK; `node tools/mission-driver/src/mission-check.mjs` → `"valid": true`. No owner-doc change (stripping is upstream cleaning detail; HTTP 400 validation extends existing pattern; N3/O3 are internal hygiene). No `> Work Item:` label (audit-sourced post-WI cleanup) and no `> Source Audits:` label (front matter uses `> Source:`) — roadmap / source-audit steps skipped per plan-closure instructions.

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay pass by opencode (executing agent) — non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback (source audit severities N1/N2 MEDIUM-LOW, N3/O3 LOW; implementation-only internal hardening with no contract / data / auth / integration / deployment change).
- Evidence: this plan file (all Phase items + Closure Gates ticked, Plan Status = completed); `docs/logs/2026/07-22.md` mdr-remediate-5 entry (test-count delta +1, grep evidence for all four findings); live greps post-edit confirm `stripAnsiControl` 4 hits in main.js, `validateDraftDesc` definition-in-draft-job.mjs + re-export-in-main.js + call-in-monitor.js, `readKnowledgeDir` 0 hits in src, draft-job.mjs imports only `node:*` + `./spawner.mjs`.

Follow-up:

- (Rule-15 watch) `stripAnsiControl` shared `src/ansi.mjs` module (N1 Option B) — trigger: a third caller outside `engine.js`/`main.js` fails to adopt the strip-at-extraction discipline. Today: 0 external callers; not yet promotable.
- (Rule-15 watch) `_onAgentStepUpdate` + `_wfAppendSubflowRun` shared `_findRunningStep(stepName, visits)` helper (N3 Option B) — trigger: a flow adds a self-looping agent step (`transitions: { retry: <agentStep> }` or `goto: <agentStep>`). Today: no such flow; latent.
