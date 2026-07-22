> Audit Status: planned
> Audit Type: open-ended
> Mission: mission-driver-draft-robustness
> Remediation Plans: `docs/plans/mission-driver-draft-robustness/2026-07-21-1605-1-design-and-architecture-doc-sync.md` (N4 — `Plan Status: completed`), `docs/plans/mission-driver-draft-robustness/2026-07-21-1605-2-draft-pipeline-robustness-closure.md` (N2 — `Plan Status: completed`), `docs/plans/mission-driver-draft-robustness/2026-07-21-1605-3-engine-extraction-and-verification-invariants.md` (N1, N3 — `Plan Status: completed`). All 4 net-new open-audit findings closed. Residuals from the later `2026-07-22-0755-*.md` re-audit (N4 carry-forward re-flag, O1, O3, NF1–NF4) owned by `docs/plans/mission-driver-draft-robustness/2026-07-22-0814-1-draft-pipeline-invariants-adoption.md` + `2026-07-22-0814-2-owner-doc-and-plan-traceability-sync.md` + `2026-07-22-0814-3-flow-edge-adjudication-and-architecture-debt-decision.md` (header reconciled 2026-07-22 by mdr-remediate-6 Phase 3; the 1605 set was executed as narrowed plans, not retired as superseded drafts).

# Open-Ended Adversarial Audit — `tools/mission-driver/` (mission-driver-draft-robustness)

- **Date**: 2026-07-21 09:52
- **Auditor**: opencode solo cold-replay (open-ended audit prompt, default generic version — this repository has not yet tuned a project-specific open-ended prompt, which is acceptable per the prompt's preamble)
- **Scope**: full `tools/mission-driver/` surface — code (`src/main.js`, `src/engine.js`, `src/mission-check.mjs`, `src/draft-job.mjs`, `src/run-reconcile.mjs`, `src/monitor.js` `handleStartDraft`, `src/runner.js`, `src/spawner.mjs`), config (`missions/base.json`, `missions/mission-driver-draft-robustness.json`, `tools/mission-driver/package.json`), flows (`flows/mission-driver.json`), prompts (`prompts/mission-brief.md`, `prompts/mission-draft.md`), tests (`test/brief-gate.test.js`, `test/draft-desc-validate.test.js`, `test/draft-path-consistency.test.js`, `test/mission-check-cli.test.js`, `test/subflow-incremental.test.js`, `test/draft-job.test.js`, `test/ansi-and-mixedcase-tag.test.js`, `test/helpers.js`), design docs (`design/draft-robustness-design.md`, `design/mission-design.md`), `CONTEXT.md`, `TROUBLESHOOTING.md`, plans (`docs/plans/mission-driver-draft-robustness/*`), roadmap (`docs/backlog/mission-driver-draft-robustness-roadmap.md`), logs (`docs/logs/2026/07-21.md`), `docs/architecture/*` (template stubs), and both sibling audits (`2026-07-21-0952-multi-audit-*.md` and the previous draft of this open-audit at the same path).
- **Method**: followed `docs/skills/open-ended-audit-prompt.md`. Actively probed BEYOND the standard checklist categories, looking for hidden issues the default process may have missed: assumptions that were never written down, owner-doc gaps, fake closure, brittle code paths that passed narrow verification only by accident, framework-specific anti-patterns, and **failure patterns already promoted into reusable checks elsewhere in the codebase that the new code did not adopt**.

## Method note — adversarial framing of THIS pass

The sibling multi-audit (15 findings F1–F14 + N1) and the previous draft of this open-audit (9 findings H1–H9) overlap almost completely: the H# nomenclature cross-walks 1-to-1 to F# findings (per `2026-07-21-1523-1-non-forEach-subflow-and-test-gaps.md:56`: A1=H1, A2=H4, A3=H5, A4=H6, A5=F3, A6=H8, A7=H7=F1; the remaining H2/H3/H9 = F3/F6/F14). **The previous open-audit draft found zero genuinely-new adversarial risks** — it renamed and re-sorted the multi-audit's findings.

This pass takes the adversarial mandate seriously: it does NOT re-list F1–F14 / H1–H9 (all confirmed still open, all already owned by the four `Plan Status: active` remediation plans `2026-07-21-1005-1/2/3` and `2026-07-21-1523-1`). Instead it hunts for **net-new hidden risks** the structured pass and the prior open-audit draft did not challenge. Four net-new findings below (N1–N4). N1 is the primary blocker.

## Verification Snapshot (live-replayed during this audit)

| Command                                                | Result                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `pnpm --prefix tools/mission-driver test`              | **510 pass / 0 fail** — re-verified live                                     |
| `pnpm --prefix tools/mission-driver run lint:prompts`  | OK (`prompt-check: OK — all prompt result-tag examples are well-formed.`)    |
| `node tools/mission-driver/src/mission-check.mjs missions/mission-driver-draft-robustness.json .` | exit 0 + `"valid": true` |
| REPL probes during this audit | see N1 / N2 evidence below |
| Cross-module grep: `stripAnsiControl` references | 1 definition (`engine.js:82`) + 2 internal call sites (`engine.js:712,768`) + 0 references in `src/main.js` (N1) |
| Cross-module grep: `validateDraftDesc` references | 1 definition (`main.js:207`) + 1 internal call site (`main.js:348`) + 0 references in `src/monitor.js` (N2) |

All 14 prior findings (F1–F14 incl. N1-architecture) were re-verified live and remain exactly as the multi-audit describes; this audit neither downgrades nor reopens them.

## Findings — Net-New Adversarial Risks

Ordered by severity. Each finding cites a concrete code path + a hidden-risk class that neither the structured multi-audit nor the previous open-audit draft challenged.

### N1 — [MEDIUM-LOW, NEW BLOCKING] `extractBriefGate` / `extractBriefPath` / `parseDraftArtifact` regex-extract on RAW agent output without stripping ANSI control sequences — directly contradicts the engine team's documented memory L009 SEV1 lesson that lives one file away

- **Hidden-risk class**: framework-specific anti-pattern · failure pattern already promoted into a reusable check that the new code did not adopt · brittle code path that passes narrow verification only by accident.
- **Files** (live-read during this audit):
  - `tools/mission-driver/src/engine.js:705-712` — the engine's general agent-step pipeline explicitly strips ANSI BEFORE every marker extraction, with a documented rationale: *"Real CLI output is frequently log-colored (`\x1b[31m...\x1b[0m`) and those CSI bytes can sit inside a `<TAG>value</TAG>` capture, defeating the strict / tolerant `[^<]+` matchers (memory L009)."*
  - `tools/mission-driver/src/engine.js:82-93` — `stripAnsiControl(text)` is **exported** and idempotent; covers CSI / OSC / two-char ESC / stray C0 controls; preserves `\t\n\r`. Documented as the project's answer to L009 SEV1.
  - `tools/mission-driver/test/ansi-and-mixedcase-tag.test.js` — 14 tests pin `stripAnsiControl`'s contract; Case at `:108` explicitly comments: *"this is the failure mode `stripAnsiControl` exists to neutralize. CSI bytes ..."*
  - `tools/mission-driver/src/runner.js:162-172` — `realRun` returns `text = readFileSync(result.logFile, "utf8").trim()`. **Raw file bytes; no ANSI stripping at the runner layer.** Verified live.
  - `tools/mission-driver/src/main.js:184-189` — WI2 `extractBriefGate` runs `resultText.match(/<BRIEF_GATE>.../i)` and `resultText.match(/<BRIEF_GATE_REASON>.../is)` directly on raw `briefResult.text`. **No `stripAnsiControl` call.**
  - `tools/mission-driver/src/main.js:160-164` — WI2 sibling `extractBriefPath` runs `resultText.match(/<BRIEF_FILE>.../i)` on raw text. Same gap.
  - `tools/mission-driver/src/main.js:236-272` — WI3 `parseDraftArtifact` runs `resultText.match(/<MISSION_FILE>.../i)` on raw text. Same gap.
- **Concrete failure mode**: if the brief agent (or any upstream CLI / log formatter) emits ANSI-colored output around the gate marker — e.g. `\x1b[32m<BRIEF_GATE>pass</BRIEF_GATE>\x1b[0m`, or worse, ANSI codes intermixed with the tag characters `<BRIEF\x1b[0m_GATE>pass</BRIEF_GATE>` — the regex fails to match → `gate === null` → the **backward-compat path runs Stage 2 unconditionally**, silently defeating WI2's gate contract. The MISSION-FILE marker would silently fall through to the `missions/*.json` scan fallback, dropping the AI's intended `missionName`/`roadmapPath` resolution. Both failure modes are exactly L009's pattern, which the engine team already paid the SEV1 cost to learn.
- **Why the test suite does not catch this**: every test in `brief-gate.test.js` / `draft-desc-validate.test.js` / `draft-path-consistency.test.js` injects a fake runner that returns pre-cleaned plain-text markers (`"<BRIEF_GATE>pass</BRIEF_GATE>"` etc.). No test fakes an ANSI-wrapped marker. The production runner reads raw bytes from disk; whether the brief/draft agents ever color their structured markers is unverified (see Residual Unknowns).
- **Why net-new and blocking**:
  - The multi-audit's F3 / open-audit H6 flagged the `/is` regex flag and the `null`-vs-`""` asymmetry but did not challenge the **upstream data-cleaning step** that the engine layer treats as mandatory.
  - The previous open-audit draft's "Residual Unknowns" table mentioned "real-world AI stability of `<BRIEF_GATE>` marker output" but only in the context of model-variant reliability — not ANSI contamination.
  - The engine's L009 lesson is **exported, tested, and documented**; the WI2/WI3 code in the same repo simply did not adopt it. AGENTS.md Operating Rule 15 explicitly says: *"When the same error pattern keeps recurring, do not stop at prose-only lessons. First promote it into a reusable audit prompt, checklist, or review playbook when that method is still missing."* The method exists (`stripAnsiControl`); the recurrence just happened anyway.
  - Severity is Medium-Low rather than Critical because real-world AI structured-marker output is usually plain text — but the engine team's own L009 evidence shows the failure mode IS reachable in production, and the cost to prevent it is one line per call site.
- **Recommended fix (any one of)**:
  1. **Smallest** — In `extractBriefGate`, `extractBriefPath`, and `parseDraftArtifact`, call `stripAnsiControl` on the input text BEFORE the regex: `const clean = stripAnsiControl(resultText); ... clean.match(...)`. Requires importing `stripAnsiControl` from `./engine.js` into `main.js` (one new import line; no new dependency — `engine.js` is already imported). Three call sites fixed; add one Case A test for each that fakes an ANSI-wrapped marker.
  2. **Structural** — Move `stripAnsiControl` to a small `src/ansi.mjs` shared module so neither engine nor main "owns" it; import from both. Reduces the "it lives in engine.js so draft code didn't reach for it" friction that caused this gap.
  3. **Defense-in-depth** — Also have the runner pre-clean `result.text` once at `runner.js:164` so every downstream consumer (engine, main, postmortem) inherits a clean string without per-call-site discipline. This was implicitly rejected when the engine chose to strip at the extraction call sites instead of at the runner boundary, but reconsidering it would prevent the next copy of this gap.

### N2 — [LOW-MEDIUM, COMPOUNDING F2/H1] Monitor's `handleStartDraft` does NOT pre-validate `desc` with WI1's `validateDraftDesc`, so the stuck-running failure mode (F2/H1) is reachable at all — the smallest remediation option was missed by both prior audits and all four remediation plans

- **Hidden-risk class**: halfway-applied invariant · upstream-of-the-failure-mode gap not surfaced · fake-closure adjacent.
- **Files** (live-read during this audit):
  - `tools/mission-driver/src/monitor.js:1151-1161` — `handleStartDraft` validates only `typeof desc !== "string" || !desc.trim()` (emptiness) + `Buffer.byteLength(desc, "utf8") > DRAFT_DESC_MAX_BYTES` (≤2KB size cap). **No placeholder check, no length check, no blacklist check.**
  - `tools/mission-driver/src/main.js:207-220` — `validateDraftDesc` is **exported** and pure; it is the canonical WI1 check.
  - `tools/mission-driver/src/main.js:348-355` — WI1 reject branch: on `!v.ok`, the child sets `process.exitCode = 1`, writes `[DRAFT VALIDATION] <reason>` to its stderr, returns. Stderr is `stdio: "ignore"`-discarded by the parent. This is the F2/H1 stuck-running repro.
  - `docs/plans/mission-driver-draft-robustness/2026-07-21-1005-3-stuck-running-draft-state-remediation.md` — Phase 1 owns the fix; proposes (a) `writeDraftState({ status: "failed", ... })` in `cmdDraftMission`'s reject branch, (b) extend `run-reconcile.mjs` to scan `draft-state.json`. **Does NOT propose pre-validation at the monitor layer.**
  - The multi-audit F2 and the open-audit H1 enumerate three remediation options each; **none** include "pre-validate at `handleStartDraft`".
- **Why net-new**: the prior audits treated F2/H1 as a state-machine problem (how to recover after the child rejects) rather than a spawn-gate problem (don't spawn a doomed child in the first place). WI1 already exports the deterministic check; `monitor.js` already imports three siblings from `./draft-job.mjs`. Reusing `validateDraftDesc` at `handleStartDraft` is a 3-line addition that **prevents** the stuck-running failure mode at the source rather than remediating it after the fact. The two existing remediation options (write `failed` state, extend reconcile) are still valuable as defense-in-depth, but the missing third option is the cheapest and most user-friendly: a monitor-submitted bad desc would return HTTP 400 with the WI1 reason BEFORE any jobDir is created, any state file is written, or any child is spawned.
- **Concrete uplift**: this option also closes the silent-stderr gap (F2/H1's step 4: "Child writes `[DRAFT VALIDATION] too short` to its stderr — which is `stdio: "ignore"`-discarded by the parent") because the rejection reason would be in the HTTP 400 response body, visible to the UI immediately.
- **Severity rationale**: Low-Medium. The downstream fixes (F2/H1 Options 1–2) are sufficient to close the stuck-running failure mode; this is an upstream alternative that was overlooked. But it is the **cheapest** of the three options and should be considered as an additional remediation path even if the existing two land first.
- **Recommended fix**: in `handleStartDraft`, after the existing emptiness + size checks, import and call `validateDraftDesc(desc, baseConfig?.draft?.minDescLength)` (reading base.json the same way `cmdDraftMission:344-348` already does); on `!v.ok`, return `{ error: v.reason, status: 400 }`. Three-line addition; no new dependency. Optionally record this option as Phase 1 item 4 in `2026-07-21-1005-3-stuck-running-draft-state-remediation.md` for explicit adjudication.

### N3 — [LOW, PRE-EXISTING] `_onAgentStepUpdate` (engine.js:438-450) lacks the `visits` guard that WI5's `_wfAppendSubflowRun` (engine.js:461-473) added one screen below — a pre-existing latent bug for re-entered agent steps that the WI5 work explicitly chose NOT to retrofit

- **Hidden-risk class**: latent invariant inconsistency · "we fixed it in the new code but left the old code with the same shape" · recurring failure pattern that AGENTS.md Rule 15 says should be promoted into a shared check.
- **Files** (live-read during this audit):
  - `tools/mission-driver/src/engine.js:438-450` — `_onAgentStepUpdate({ stepName, logFile, promptFile, sessionId })`: finds the LAST step matching **`name + status === "running"`** (no `visits` match), patches logFile/promptFile/sessionId, `_writeWorkflow`, break.
  - `tools/mission-driver/src/engine.js:461-473` — `_wfAppendSubflowRun(stepName, visits, run)`: finds the LAST step matching **`name + visits + status === "running"`** (the `visits` guard is the explicit difference), appends to `subflowRuns`, `_writeWorkflow`, return.
  - WI5 design rationale (`design/draft-robustness-design.md:455-460` + WI5 log `docs/logs/2026/07-21.md:8`): the `visits` guard was added because *"the same stepName can be re-entered (visitCounts accumulates), and when two visits both have `status:"running"` placeholders a stepName-only match would write into the wrong entry."*
  - `test/subflow-incremental.test.js:169-265` (Case C) — pins the visits guard for `_wfAppendSubflowRun` specifically (visit 1 closed, visit 2 running). **No equivalent test pins `_onAgentStepUpdate` against the same re-entry race.**
- **Concrete latent failure mode**: consider an agent step `FOO` that is re-entered (e.g. via a `transitions: { retry: "FOO" }` or a `goto: "FOO"` self-loop). If visit 1's `_wfClose` is delayed or skipped (e.g. parent SIGKILL between visit 1's last sub-agent stream and `_wfClose`), visit 1's placeholder stays `status: "running"`. When visit 2 starts and emits a step-update event (new `logFile`/`sessionId`), `_onAgentStepUpdate` finds the LAST matching step by name+status — which is visit 2's placeholder (correct case today). But if visit 1's placeholder was pushed AFTER visit 2's (e.g. via a reconcile write), the loop would patch visit 1 instead, corrupting the closed-record-candidate with visit 2's metadata. The race window is narrow but the invariant is unenforced.
- **Why net-new**: the WI5 work explicitly identified the visits-guard need, added it to the NEW method, and **chose not to retrofit the existing `_onAgentStepUpdate`**. The WI5 plan's `Deferred But Adjudicated` does not mention this asymmetry. Neither multi-audit nor open-audit flagged it. The same "fix-it-where-you-found-it" anti-pattern that produced N1 (L009 lesson not propagated) is at play here.
- **Severity**: Low. The race window is narrow (requires re-entrant agent steps + a partial-failure window), and the production flows (`mission-driver.json` step graph) do not today have a self-looping agent step that would exercise this. But it is a latent invariant inconsistency — the same shape, two methods, one guarded and one not — that a future flow author could trip.
- **Recommended fix (any one of)**:
  1. **Smallest** — Add a `visits` parameter to `_onAgentStepUpdate` (caller at `main.js:752` already constructs the engine and could pass `engine._currentVisits(stepName)`), then mirror the `name + visits + status==="running"` triple match. One method change + one call-site change.
  2. **Structural** — Extract a shared `_findRunningStep(stepName, visits)` helper used by both `_onAgentStepUpdate` and `_wfAppendSubflowRun` so the invariant is enforced in one place. (This is what AGENTS.md Rule 15 prescribes once a pattern recurs — and it has now recurred twice: N1 and N3.)
  3. **Doc-only** — Add a comment to `_onAgentStepUpdate` explicitly noting "no visits guard — assumes non-re-entrant agent steps; if a future flow self-loops an agent step, retrofit the guard from `_wfAppendSubflowRun`". Lowest-cost option that at least documents the assumption.

### N4 — [LOW] Design §4.3.1 lists `plansRoot` as a new template var in the implementation snippet, but WI3 implementation deliberately omitted it as "dead code" — minor design-vs-implementation drift that the WI3 log explains but the design doc never absorbed

- **Hidden-risk class**: owner-doc drift · silent code-doc divergence that invites confusion.
- **Files**:
  - `tools/mission-driver/design/draft-robustness-design.md:281-292` (§4.3.1) — the `resolveTemplateVars` snippet lists **`plansRoot: resolve(resolved.projectRoot, "docs/plans"),  // 新增（供 mission-draft 引用 planGuide 相对位置）`** as a peer of `backlogDir`. The annotation says `新增` ("new addition"), not `可选` ("optional").
  - `tools/mission-driver/src/main.js:400-406, 464-470` — the actual `resolveTemplateVars` calls inject `missionsDir`, `projectRoot`, `backlogDir`, `flowHint`/`briefPath`/`targetFile`. **`plansRoot` is absent.** Verified live by grep.
  - `docs/logs/2026/07-21.md:62` (WI3 closure log) — explicitly records the deferral: *"未引入 `plansRoot` 模板变量（设计 §4.3.1 旁注列为可选，当前两份 prompt 未引用 `{{plansRoot}}`，预添加属 dead code）"*. The log characterizes the snippet as `旁注列为可选` ("listed as optional in the sidebar"), but the design snippet itself does not mark it optional.
- **Why net-new**: multi-audit F5 flagged stale `main.js:` line-number citations throughout the design doc but did not flag this content-level drift (a design-declared template var with no implementation). Multi-audit F8 flagged `mission-design.md §9` staleness but did not reach `draft-robustness-design.md §4.3.1`'s snippet. WI3's own plan closure treated this as a deferral, but the deferral never made it back into the design doc as an annotation.
- **Severity**: Low. Pure documentation hygiene. The implementation is correct (no dead template var); the design snippet over-promises. A future agent reading §4.3.1 cold would expect `{{plansRoot}}` to work and find it silently unsubstituted.
- **Recommended fix**: in `draft-robustness-design.md §4.3.1`, either (a) delete the `plansRoot` line from the snippet (preferred — the snippet should describe what shipped), or (b) annotate it with `// deferred — not implemented in WI3; no prompt currently references {{plansRoot}}; see docs/logs/2026/07-21.md WI3 entry`. Bundle with the existing remediation plan `2026-07-21-1005-1-design-owner-doc-sync.md` Phase 1 F2 (line-number refresh) in the same doc-sync edit — it is one more line in an already-scheduled pass.

## Clean Aspects (Re-Verified During This Audit)

- **All 14 prior findings (F1–F14 incl. multi-audit N1-architecture) re-confirmed still open** at the live repo, each owned by one of the four `Plan Status: active` remediation plans (`2026-07-21-1005-1/2/3`, `2026-07-21-1523-1`). The remediation infrastructure is sound; this audit's net-new findings (N1–N4) are additive, not contradictions.
- **All 510 tests pass** (live-replayed: 0 fail).
- **`lint:prompts` passes** (live-replayed).
- **`stripAnsiControl` is exported, tested, idempotent, and zero-dependency** — so N1's recommended fix is purely about call-site adoption; no new infrastructure needed.
- **`validateDraftDesc` is exported and pure** — so N2's recommended fix is purely about monitor-side adoption; no new logic needed.
- **Convention adherence (AGENTS.md Rule 12 minimal comments)**: re-confirmed the open-audit draft's prior blessing. The verbose JSDoc on `validateDraftDesc` / `extractBriefGate` / `_wfAppendSubflowRun` explains non-obvious local constraints (order deviation, regex flag choice, visits-match necessity) and falls under Rule 12's "rare comments when a local constraint is otherwise easy to misread" exception. Not reopened here.
- **Routing correctness** (AGENTS.md Task Routing): every WI plan correctly self-classified as `implementation-only change`, with `Skill: none` per item and per-item justification — matches AGENTS.md Skill Usage Rule.
- **Reviewer-Availability Fallback** correctly applied per AGENTS.md: every WI plan records `solo cold-replay closure pass` with explicit non-protected / non-high-risk rationale. The four remediation plans each record an independent subagent draft review (`ses_*` IDs in their Draft Review Records), going beyond the minimum.
- **Atomic-write discipline** (engine `_writeWorkflow`, run-reconcile `_atomicWrite` + Windows-aware `_renameWithRetry`): unchanged, still exemplary.
- **Cross-platform CLI (WI4)**: re-verified live on this Windows host.

## Residual Unknowns Worth Watchfulness

| Unknown | Why it deserves watchfulness |
| --- | --- |
| Do the real `mission-brief` / `draft-mission` agents emit ANSI-colored structured markers in production? | N1's blast radius depends on this. The engine team's L009 SEV1 evidence shows the failure mode IS reachable for general agent output; whether the brief/draft prompts specifically trigger it is unverified. If a future model variant wraps marker output in color codes, N1's silent Stage 2 fallback would activate. Cheapest mitigation is the N1 Option 1 fix (3 call sites + 3 tests). |
| Is `_onAgentStepUpdate` ever called for a re-entrant agent step in any production flow? | N3's blast radius depends on this. Today's `flows/mission-driver.json` has no self-looping agent step. A future flow that does (e.g. a `REVIEW → EXECUTE → REVIEW` agent-only loop with partial-failure retry) would expose the race. |
| Should `stripAnsiControl` live in a shared `src/ansi.mjs` rather than `engine.js`? | N1's structural fix. The current placement in `engine.js` is what made `main.js`'s draft code "not reach for it". If N1's call-site fix lands without structural refactor, the next extraction helper added outside engine will repeat the gap. AGENTS.md Rule 15 says: when a defect pattern recurs (it has now recurred as N1 + N3), promote into a shared check. |
| Should the WI1 closure log entry be updated to point at the F2/H1 deferred-successor remediation plan? | The WI1 plan's `Successor Required: yes` field was the original "orphan follow-up" red flag (per multi-audit F2 + open-audit H1). The remediation plan `2026-07-21-1005-3-stuck-running-draft-state-remediation.md` now owns it, but the WI1 plan's `Deferred But Adjudicated` section was never updated to link forward. Minor traceability gap. |
| Does the production mission-brief agent emit `<BRIEF_GATE>` reliably across model variants? | Pre-existing open-audit H-table item. WI2's `gate === null` backward-compat path masks any null-marker regression behind "Stage 2 runs anyway". N1 compounds this: ANSI contamination would also produce `gate === null`, indistinguishable from "AI omitted the marker". Until N1 is fixed, the WI2 contract is silently weaker than its design claims on two independent axes (AI reliability + ANSI contamination). |

## Recommendation

**needs revision**

Primary new blocker: **N1** — `extractBriefGate` / `extractBriefPath` / `parseDraftArtifact` extract on raw agent output without calling the project's own `stripAnsiControl`, contradicting memory L009 SEV1 that lives one file away in the same `src/` tree. The failure mode (silent `gate === null` → backward-compat Stage 2 runs unconditionally) directly defeats the WI2 gate contract that this mission exists to deliver. The fix is small (3 call sites + 3 tests; one new import line in `main.js`), the dependency is already exported and tested, and the project's own documented lesson says this exact failure mode is reachable in production. This finding is **not** covered by any of the four existing remediation plans.

Secondary revision work, all small, that should be bundled in the same pass (none owned by an existing plan):

- **N2** — record the "pre-validate at `handleStartDraft`" option as Phase 1 item 4 in `2026-07-21-1005-3-stuck-running-draft-state-remediation.md` (or open a new tiny plan). The option is upstream of F2/H1's failure mode and is cheaper than the two existing options. Even if not chosen as the primary fix, the explicit adjudication closes the "no one considered the upstream gate" gap.
- **N3** — at minimum, add the doc-only comment to `_onAgentStepUpdate` noting "no visits guard — assumes non-re-entrant agent steps". The structural refactor (shared `_findRunningStep` helper) is the durable answer per AGENTS.md Rule 15 and pairs naturally with N1's structural option.
- **N4** — bundle with `2026-07-21-1005-1-design-owner-doc-sync.md` Phase 1 F2 (line-number refresh). One more line in an already-scheduled doc-sync edit.

Once N1 is closed (three call sites call `stripAnsiControl` + three regression tests for ANSI-wrapped markers), this audit would flip to **passes open-ended audit** with the Residual Unknowns table above as the watchlist, and with all 14 prior findings (F1–F14) remaining owned by their existing remediation plans.

## Files Touched By This Audit

- This file (overwrite): `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-open-audit-mission-driver-draft-robustness.md` — replaced the previous `Audit Status: planned` draft (which only re-listed the multi-audit's F1–F14 under H1–H9 labels) with this genuinely net-new adversarial pass.

No code, config, flow, prompt, plan, or test file was modified by this audit. All evidence cited is from live reads of the repo and live test/lint/REPL/grep probes performed during the audit (`pnpm --prefix tools/mission-driver test` → 510 pass / 0 fail; `pnpm --prefix tools/mission-driver run lint:prompts` → OK; `node tools/mission-driver/src/mission-check.mjs missions/mission-driver-draft-robustness.json .` → `"valid": true`; cross-module greps on `stripAnsiControl`, `validateDraftDesc`, `_onAgentStepUpdate`, `_wfAppendSubflowRun`, `plansRoot`).

<AI_STEP_RESULT>issues</AI_STEP_RESULT>
