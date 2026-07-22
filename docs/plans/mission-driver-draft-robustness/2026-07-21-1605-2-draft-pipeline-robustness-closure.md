# mdr-remediate-2 draft pipeline robustness closure — N2 monitor-side pre-validation (F2/F6/F11-test/F12/F13 confirmed closed in baseline)

> Plan Status: completed
> Last Reviewed: 2026-07-22
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-open-audit-*.md` (N2). Findings F2, F6, F11-test, F12, F13 were re-verified on 2026-07-22 against the live working tree and are already closed (see "Confirmed Closed In Working Tree" below) — they are removed from scope with recorded rationale, not silently dropped.
> Related: supersedes the N2-only remainder of `2026-07-21-1005-2-verification-and-contract-hardening.md` and `2026-07-21-1005-3-stuck-running-draft-state-remediation.md` (both now implemented in the working tree — their A1→F2 and A2–A5→F6/F11-test/F12/F13 work landed, leaving only N2 uncovered). Sibling plans `2026-07-21-1605-1-design-and-architecture-doc-sync.md` (doc findings) and `2026-07-21-1605-3-engine-extraction-and-verification-invariants.md` (engine + verification findings) are unaffected.
> Mission: mission-driver-draft-robustness
> Audit: required
> Execution Order: 2 of 3

## Current Baseline

Live baseline re-verified 2026-07-22 against `tools/mission-driver/` (working tree). The originally-audited six findings split into **five already-closed** and **one still-open**.

### Confirmed Closed In Working Tree (removed from scope — see Rationale)

These were flagged as live defects in the original draft, but re-inspection shows the fixes AND tests already ship in the working tree (code comments self-attribute to `mdr-remediate-3 A1` / `mdr-remediate-4 H3`):

- **F2 (stuck-running + TDZ)** — CLOSED. `src/main.js:349-365` declares `stateFile` + `writeDraftState` ABOVE the `validateDraftDesc` call (`:367`), eliminating the TDZ `ReferenceError`. The reject branch (`:367-389`) calls `writeDraftState({ status: "failed", phase: "rejected", endedAt, error: v.reason })` (`:378-385`) guarded by `if (opts.draftJobDir)`, with merge semantics preserving `desc`. Tested by `test/draft-desc-validate.test.js:153-283` (Case B2, two tests asserting `{status:"failed", phase:"rejected", error, desc}` for both "too short" and "placeholder" rejections).
- **F12 (whitespace-only `reason: ""`)** — CLOSED. `src/main.js:188` already normalizes `reason: r ? (r[1].trim() || null) : null`. Tested by `test/brief-gate.test.js:104-109` (whitespace-only → `null`).
- **F11 test side (multi-line reason branch)** — CLOSED. `test/brief-gate.test.js:97-102` exercises `<BRIEF_GATE_REASON>line1\nline2</BRIEF_GATE_REASON>`, locking the `/is` dotall branch.
- **F13 (full 9-entry blacklist)** — CLOSED. `test/draft-desc-validate.test.js:65-71` iterates all 9 entries `["test","asdf","foo","bar","todo","xxx","none","null","n/a"]` plus case-insensitivity anchors `"TODO"` / `"N/A"`.
- **F6 (base.json integration — fake closure)** — CLOSED. `test/draft-desc-validate.test.js:329-437` (Case D) creates a real `missions/base.json` with `{draft:{minDescLength:8}}` (D1), `"garbage"` string fallback (D2), and `null` fallback (D3) — the exact F6-A/B/C matrix. WI1's previously-ticked-but-unverified exit criterion is now actually verified.

### Still Open (in-scope)

- **N2 (monitor-side pre-validation)** — OPEN. `src/monitor.js:1151-1185` `handleStartDraft` validates only `typeof desc !== "string" || !desc.trim()` (`:1156-1158`) + `Buffer.byteLength(desc,"utf8") > DRAFT_DESC_MAX_BYTES` (`:1159-1161`). It then parses `flowHint` / `targetFile` / `skipBrief` (`:1163-1187`) and calls `startDraftJob({ projectRoot, desc, flowHint, targetFile, skipBrief })` at `:1193` — the spawn point. There is **no** `validateDraftDesc` call anywhere in `monitor.js` (grep: 0 references to `validateDraftDesc` / `minDescLength`). So the dashboard's `POST /api/draft` path can reach `startDraftJob` with a placeholder/over-short `desc`, spawn a child that `cmdDraftMission` will then reject — relying entirely on the downstream F2 terminal-state write to surface failure. The cheap upstream gate (the original N2 finding) is missing on the monitor side.
- Reuse target: `src/main.js:207-220` exports a pure `validateDraftDesc(desc, minLen)`; `src/main.js:344-348` shows the canonical base.json read pattern (`JSON.parse(readFileSync(resolve(missionsDir,"base.json")))` with `catch { baseConfig = {} }`). `src/draft-job.mjs` and `src/monitor.js:47` both re-export `__setSpawnerForTest` from the shared `src/spawner.mjs` seam, already exercised for draft-launch in `test/monitor.test.js:2205` and `test/draft-job.test.js:40-..`.

Gap: N2 is the one remaining unclosed gap from the original six-finding set. Closing it completes the "defense in depth on both ends" pair (F2 downstream terminal-state write + N2 upstream monitor pre-validation) so a bad `desc` never reaches `startDraftJob` from the dashboard.

## Goals

- `handleStartDraft` rejects placeholder / over-short / empty `desc` with HTTP 400 BEFORE `startDraftJob` is called, reusing the pure `validateDraftDesc` (single source of truth for the WI1 contract) and the `base.json` `draft.minDescLength` override.
- N2 covered by integration tests (negative: rejected + no spawn; positive: valid desc still proceeds) using the existing `__setSpawnerForTest` seam.
- All existing tests still pass; test-count delta recorded at closure.

## Non-Goals

- Do NOT re-touch F2 / F6 / F11-test / F12 / F13 code or tests — they are already closed (see Confirmed Closed). Re-opening them is out of scope.
- Do NOT change `validateDraftDesc` semantics, the blacklist regex, or the `extractBriefGate` contract.
- Do NOT change the WI1 reject branch's `console.error` / `process.exitCode = 1` semantics in `cmdDraftMission` (downstream behavior unchanged).
- Do NOT extend `run-reconcile.mjs` to scan `draft-state.json` (defense-in-depth, deferred — see Deferred But Adjudicated).
- Do NOT touch architecture/design docs (Plan 1) or engine invariants (Plan 3).

## Task Route

- Type: `implementation-only change` (one defect repair — missing upstream pre-validation gate; no API/data/auth/integration/deployment contract change. The HTTP 400 response shape already exists for the emptiness/size checks; N2 reuses it).
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §4.1 (`validateDraftDesc` — reused as-is). Code: `src/monitor.js` (`handleStartDraft`), `test/monitor.test.js`. Skill Selection Basis: `Skill: none` — defect repair following the existing `__setSpawnerForTest` test pattern already used at `test/monitor.test.js:2205`.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.

## Execution Plan

### Phase 1 — Add monitor-side pre-validation (N2)

Status: completed
Targets: `tools/mission-driver/src/monitor.js`, `tools/mission-driver/test/monitor.test.js`
Skill: none

- Item Types: `Fix | Add | Proof`
- Prereqs: none

- [x] **N2 (Fix)** In `handleStartDraft` (`src/monitor.js:1151-1195`), import `validateDraftDesc` from `./main.js`. After the existing byte-size check (`:1159-1161`) and BEFORE the `startDraftJob` call (`:1193`), read `missions/base.json` using the same pattern as `src/main.js:344-348` (`resolve(projectRoot,"missions","base.json")` with `catch { cfg = {} }`) and call `validateDraftDesc(desc, cfg?.draft?.minDescLength)`. On `!v.ok`, return `{ error: v.reason, status: 400 }` BEFORE any jobDir creation / state write / spawn. Prefer extracting a tiny shared `readBaseConfig(missionsDir)` helper if the read would otherwise be duplicated verbatim between `main.js` and `monitor.js` (deduplication, not a behavior change).
      - Skill: none
- [x] **N2 (Add | Proof)** Add integration tests in `test/monitor.test.js` (mirror the `__setSpawnerForTest` setup at `:2205`):
  - Test N2-A (negative, too short): inject a fake spawner via `__setSpawnerForTest` (capture call count), call `handleStartDraft(tmpRoot, { desc: "d" })` (len 1 < default 4), assert the response is `{ status: 400 }` with `error` matching `/too short/i`, AND the fake spawner was invoked 0 times (no spawn), AND no jobDir was created under `tmpRoot/_tmp/draft-*`.
  - Test N2-B (negative, placeholder): `handleStartDraft(tmpRoot, { desc: "test" })` → `{ status: 400 }`, `error` matches `/placeholder/i`, spawner count 0.
  - Test N2-C (configured threshold): create `tmpRoot/missions/base.json` with `{ draft: { minDescLength: 8 } }`, call `handleStartDraft(tmpRoot, { desc: "add xy" })` (len 6 ≥ default 4 but < 8) → `{ status: 400 }` `/too short/i`, spawner count 0 — proves the monitor-side read honors the same `base.json` override as `cmdDraftMission`.
  - Test N2-D (positive no-regression): `handleStartDraft(tmpRoot, { desc: "add audit count to dashboard" })` proceeds (returns a `jobId`/`pid` per existing shape), spawner invoked exactly once.
  - Run: `pnpm --prefix tools/mission-driver test` (the repo's `pnpm-lock.yaml` is the package-manager source of truth; equivalent to `npm --prefix tools/mission-driver test` per `tools/mission-driver/CONTEXT.md`).
      - Skill: none

Exit Criteria:

- [x] `handleStartDraft` returns HTTP 400 with `validateDraftDesc`'s reason for empty / placeholder / too-short `desc`, before `startDraftJob` (N2-A, N2-B green).
- [x] The monitor-side `base.json` `draft.minDescLength` override takes effect (N2-C green).
- [x] Valid `desc` still reaches `startDraftJob` unchanged (N2-D green); spawner invoked exactly once.
- [x] No owner-doc update required — `validateDraftDesc` and §4.1 are reused as-is; the HTTP 400 response shape is pre-existing.
- [x] All pre-existing tests still pass; new test count delta recorded at closure.
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: needs revision (this pass, 2026-07-22). The drafted `Current Baseline` was stale against the working tree: it described F2, F6, F11-test, F12, F13 as live defects, but re-inspection of `src/main.js:188/349-389`, `test/brief-gate.test.js:97-109`, and `test/draft-desc-validate.test.js:65-437` shows all five are already fixed and tested (self-attributed in comments to `mdr-remediate-3 A1` / `mdr-remediate-4 H3`). Executing the draft as written would have re-implemented shipped code and risked regressing the carefully-commented existing tests. Only N2 (no `validateDraftDesc` reference in `monitor.js`) was genuinely open. Resolution: re-baselined to live state, narrowed scope to N2, moved the five closed findings to "Confirmed Closed In Working Tree" with citations (scope narrowing recorded per guide Rule 10), preserved the N2 test design grounded in the existing `__setSpawnerForTest` seam (`test/monitor.test.js:2205`).
- Independent draft review iteration 2: acceptable as-is (post re-baseline) — single open finding (N2), bounded to `src/monitor.js` + `test/monitor.test.js`, test approach uses an existing seam, exit criteria testable. Promoted to `active`.

## Closure Gates

- [x] in-scope behavior is complete (N2 landed: `handleStartDraft` pre-validates before spawn)
- [x] relevant docs aligned (no owner-doc update required — `validateDraftDesc` §4.1 reused; Plan 1 owns design-doc sync)
- [x] verification: `pnpm --prefix tools/mission-driver test` green; test-count delta recorded (baseline = 520, +4 N2 tests = 524 total, 0 fail)
- [x] no in-scope item downgraded to deferred/follow-up (N2 closed in-plan)
- [x] independent draft review completed and recorded
- [x] text consistency verified: Plan Status, phase status, exit criteria, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### F2 / F6 / F11-test / F12 / F13 — already closed in working tree

- Classification: `out-of-scope improvement (already shipped)`
- Why Not Blocking Closure: Re-verified 2026-07-22 — all five findings are fixed and tested in the working tree (see Confirmed Closed In Working Tree, with code + test line citations). They were removed from this plan's scope at draft review with recorded rationale, not downgraded from confirmed defects.
- Successor Required: no (reopens only if a future audit shows the cited code/tests regressed)

### Defense-in-depth — extend run-reconcile to scan draft-state.json

- Classification: `optimization candidate`
- Why Not Blocking Closure: The F2 downstream terminal-state write (already shipped) + this plan's N2 upstream monitor gate together eliminate the user-visible stuck-running failure mode at both ends. Reconcile scanning is defense-in-depth for a hypothetical future code path that writes `running` without a paired terminal write and also bypasses `handleStartDraft`.
- Successor Required: no (reopens if a future audit shows another `draft-state.json` write path that bypasses `cmdDraftMission`'s reject branch AND `handleStartDraft`)

## Closure

Status Note: Phase 1 (N2) complete. Independent closure audit passed via solo cold-replay (non-protected, non-high-risk per AGENTS.md Reviewer-Availability Fallback).

Closure Audit Evidence:

- Auditor / Agent: opencode solo cold-replay closure pass (2026-07-22)
- Evidence:
  - Code: `src/monitor.js` imports `validateDraftDesc` from `./main.js` (line 34); `handleStartDraft` (now exported) calls `validateDraftDesc(desc, baseConfig?.draft?.minDescLength)` after byte-size check, before `startDraftJob`, returning `{ error: v.reason, status: 400 }` on `!v.ok`.
  - Tests: `test/monitor.test.js` N2-A (too short → 400, 0 spawns, no jobDir), N2-B (placeholder → 400, 0 spawns), N2-C (base.json `minDescLength: 8` override → 400, 0 spawns), N2-D (valid desc → jobId/pid, 1 spawn) — all green.
  - Regression fix: 4 existing tests that used short `desc` values ("x", "a", "b") updated to valid descs so they reach the flowHint/targetFile/listing code paths they test (defense-in-depth ordering changed by N2 gate).
  - Verification: `pnpm --prefix tools/mission-driver test` → 524 pass / 0 fail (baseline 520 + 4 N2). `pnpm --prefix tools/mission-driver/web run typecheck` clean. `pnpm --prefix tools/mission-driver/web run build` success. `pnpm --prefix tools/mission-driver run lint:prompts` OK.
  - Log: `docs/logs/2026/07-22.md` updated with N2 closure entry.

Follow-up:

- None expected.
