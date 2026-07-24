# mdr-remediate-1 design doc and owner-doc sync (F1, F2, F3, F4, F5, A6, A7)

> Plan Status: completed
> Last Reviewed: 2026-07-21
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-multi-audit-*.md` (F1–F5) and `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-open-audit-*.md` (A6, A7)
> Related: WI1 `2026-07-21-0954-2-cli-draft-desc-validate.md`, WI2 `2026-07-21-1207-1-brief-gate-marker.md`, WI3 `2026-07-21-0954-3-draft-path-template-var.md`, WI4 `2026-07-21-0954-1-mission-check-cli-cross-platform.md`, WI5 `2026-07-21-1207-2-subflow-runs-incremental.md` (all `Plan Status: completed`); sibling remediation plans `2026-07-21-1005-2-verification-and-contract-hardening.md` (covers A2–A5 code/test side), `2026-07-21-1005-3-stuck-running-draft-state-remediation.md` (covers A1).
> Mission: mission-driver-draft-robustness
> Audit: required

## Current Baseline

Live baseline verified 2026-07-21 against the repo (citations match `tools/mission-driver/` live state and the multi-audit / open-audit evidence):

- `tools/mission-driver/design/draft-robustness-design.md:5` still reads `**Status**: proposal (analysis + recommended solution, no code change yet)` despite all 5 WIs landed. Roadmap `docs/backlog/mission-driver-draft-robustness-roadmap.md:3` says `Last Updated: 2026-07-21 (WI5 done — mission complete)`. (Audit F1.)
- `tools/mission-driver/design/draft-robustness-design.md` body cites pre-WI1 `main.js:` line numbers throughout: §1.1 (`:33` `main.js:244-384`), §1.1 (`:37,40` `main.js:298-332` / `:334-383`), §1.2 (`:52` `main.js:340`), §1.4 (`:60-62` `main.js:270-289`), §2.1 (`:70` `main.js:244`), §2.1 (`:76` `main.js:675`). Live locations (re-verified during draft review): `cmdDraftMission` body at `main.js:317-509`, Stage 1 brief block at `:397-438`, Stage 2 draft block at `:458-509`, Commander `draft` registration at `main.js:833-844` (`:833` `program.command("draft")`, `:844` `.action(...)`). (Audit F2.)
- `tools/mission-driver/design/draft-robustness-design.md:202-219` (§4.1) shows the original validation order `empty → length → placeholder`, but `src/main.js:199-204` JSDoc documents the implementation's actual order `empty → placeholder → length` with rationale ("design's order leaves 3-char blacklist entries `xxx` / `foo` / `bar` / `n/a` unreachable — they always trip length first"). The deviation is correct but undocumented at the design side. (Audit A6.)
- `tools/mission-driver/design/draft-robustness-design.md:249` (§4.2.2) specifies `/<BRIEF_GATE_REASON>\s*(.+?)\s*<\/BRIEF_GATE_REASON>/i`, but `src/main.js:187` implements `/<BRIEF_GATE_REASON>\s*(.+?)\s*<\/BRIEF_GATE_REASON>/is` (dotall, enabling multi-line reasons). (Audit F3.)
- `tools/mission-driver/design/draft-robustness-design.md` §1.4 (`:60-62`) lists pre-WI2 field set; §4.2.3 (`:273-275`) only mentions `briefGate` / `briefGateReason` additions. The full `draft-state.json` schema (`status`, `phase`, `startedAt`, `endedAt`, `desc`, `flowHint`, `targetFile`, `briefPath`, `briefGate`, `briefGateReason`, `missionName`, `roadmapPath`, `missionFile`, `error`) is implicit in `src/main.js:362-382,417-422,432-437,451-453,495-506` and consumed by `src/monitor.js`. (Audit F5.)
- `tools/mission-driver/design/mission-design.md:238-249` (§9 Mission Draft Step) still describes the legacy single-stage flow ("`draft <description>` triggers `mission-draft.md` prompt, AI executes: 1. Read user input … 7. Generate `missions/<name>.json`"). No mention of the two-stage brief→draft pipeline, the `<BRIEF_GATE>pass|blocked</BRIEF_GATE>` marker contract, or the `{{backlogDir}}` template-variable unification. (Audits F4 + A7.)
- `docs/backlog/mission-driver-draft-robustness-roadmap.md:226` (Cross-Cutting row) carries an unfulfilled promise: "Owner-doc sync: WI3 闭合后更新 `tools/mission-driver/design/mission-design.md` 的 draft 两段式说明（路径基准统一为 projectRoot）；WI2 闭合后更新 brief marker 契约描述." WI2 plan `2026-07-21-1207-1-brief-gate-marker.md:229` and WI3 plan `2026-07-21-0954-3-draft-path-template-var.md:163` both downgraded this to "No owner-doc update required" without re-adjudicating the roadmap row. (Audit A7.)

Gap: Five multi-audit findings (F1, F2, F3, F4, F5) plus two open-audit findings (A6, A7) all describe owner-doc drift between `tools/mission-driver/design/*.md` / `docs/backlog/*.md` and the implemented baseline. The normative content of the design docs is correct; only the metadata (Status field), citations (line numbers), deviations (§4.1 order, §4.2.2 regex), schema enumeration (draft-state.json), and the higher-level overview (mission-design.md §9) are stale.

## Goals

- `draft-robustness-design.md` Status field reflects `implemented` / `active — §4.1/§4.2/§4.3/§4.4/§4.5 landed via WI1–WI5`.
- Stale `main.js:` line numbers in §1.1, §1.2, §1.4, §2.1 are either refreshed to live locations or replaced with function-name anchors (preferred for durability).
- §4.1 documents the implementation's `empty → placeholder → length` order deviation with the rationale already in `main.js:199-204` JSDoc.
- §4.2.2 specifies `/is` flag matching the implementation.
- `draft-state.json` schema is enumerated as a table in §1.4 of `draft-robustness-design.md` (single committed location; `CONTEXT.md` already cross-references the design doc and is not duplicated here).
- `mission-design.md §9` either reflects the two-stage pipeline + gate marker + `{{backlogDir}}` (honoring the roadmap promise) OR the roadmap cross-cutting row is re-adjudicated to "deferred" with explicit reason.

## Non-Goals

- Do not change any code in `src/`, `test/`, `prompts/`, or `missions/`.
- Do not re-open WI1–WI5 contracts. The implementation is normative; only the docs are wrong.
- Do not backfill historical migration prose into `docs/architecture/` (per AGENTS.md Rule 6: keep design/architecture focused on the current supported baseline, not migration history).
- Do not address A1 (stuck-running failure mode — tracked in `2026-07-21-1005-3-stuck-running-draft-state-remediation.md`) or A2–A5 (code/test fixes — tracked in `2026-07-21-1005-2-verification-and-contract-hardening.md`).

## Task Route

- Type: `implementation-only change` (doc-only edits; no contract / API / data / auth / integration / deployment behavior change).
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` (primary target), `tools/mission-driver/design/mission-design.md` (§9 update), `docs/backlog/mission-driver-draft-robustness-roadmap.md` (cross-cutting row re-adjudication if Decision B is chosen).
- Skill Selection Basis: `Skill: none` — doc-only sync; the multi-dimensional / open-ended audit prompts were already used to surface the findings, not to fix them.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline. Doc-only edits; no test runs needed (`lint:prompts` already green per audit; this plan touches no prompt files).

## Execution Plan

### Phase 1 - draft-robustness-design.md sync

Status: completed
Targets: `tools/mission-driver/design/draft-robustness-design.md`
Skill: none

- Item Types: `Fix` (uniform — 5 of 5 items tagged Fix)
- Prereqs: none

- [x] **F1 (Fix)** Change `:5` Status field from `proposal (analysis + recommended solution, no code change yet)` to `implemented — §4.1/§4.2/§4.3/§4.4/§4.5 landed via WI1–WI5; see docs/plans/mission-driver-draft-robustness/`.
      - Skill: none
- [x] **F2 (Fix)** Refresh stale `main.js:` line numbers in §1.1 (`:33,37,40`), §1.2 (`:52`), §1.4 (`:60-62`), §2.1 (`:70,76`). Use function-name anchors as the primary citation strategy (`cmdDraftMission body`, `Stage 1 brief block`, `extractBriefPath`, `parseDraftArtifact`, `program.command("draft")` registration). Where line numbers are kept as secondary aid, re-cite live locations (`main.js:317-509` for `cmdDraftMission`, `:397-438` for Stage 1, `:458-509` for Stage 2, `:833-844` for Commander `draft` registration). Single strategy: anchors primary, line numbers secondary.
      - Skill: none
- [x] **A6 (Fix)** In §4.1 (`:202-219`), add a "Deviation note" paragraph documenting the implementation's `empty → placeholder → length` order with the rationale already in `main.js:199-204` JSDoc ("design's order leaves 3-char blacklist entries `xxx` / `foo` / `bar` / `n/a` unreachable").
      - Skill: none
- [x] **F3 (Fix)** In §4.2.2 (`:249`), change the regex citation from `/<BRIEF_GATE_REASON>\s*(.+?)\s*<\/BRIEF_GATE_REASON>/i` to `/<BRIEF_GATE_REASON>\s*(.+?)\s*<\/BRIEF_GATE_REASON>/is` and add a one-line note that the `s` (dotall) flag enables multi-line reasons. (Test coverage for the multi-line branch is tracked in `2026-07-21-1005-2-verification-and-contract-hardening.md` A5.)
      - Skill: none
- [x] **F5 (Fix)** Add a `draft-state.json` schema table enumerating the full field set (`status`, `phase`, `startedAt`, `endedAt`, `desc`, `flowHint`, `targetFile`, `briefPath`, `briefGate`, `briefGateReason`, `missionName`, `roadmapPath`, `missionFile`, `error`) in §1.4 of `draft-robustness-design.md` (`:60-62` after the existing field listing). Cite the producing code locations (`src/main.js:362-382,417-422,432-437,451-453,495-506`) and the consumer (`src/monitor.js`). Do not duplicate in `CONTEXT.md` — that file already cross-references the design doc.
      - Skill: none

Exit Criteria:

- [x] `draft-robustness-design.md` Status no longer reads `proposal`; body line citations match live `main.js` locations or are replaced by function-name anchors.
- [x] §4.1 deviation note present; §4.2.2 regex matches implementation.
- [x] `draft-state.json` schema table exists in §1.4 of `draft-robustness-design.md`.
- [x] No code, test, prompt, or missions file changed (verified by `git diff --stat` — only `tools/mission-driver/design/draft-robustness-design.md` touched by this Phase; other uncommitted paths are pre-existing in-progress work, not this plan's).
- [x] `docs/logs/` updated.

### Phase 2 - mission-design.md §9 and roadmap cross-cutting row resolution

Status: completed
Targets: `tools/mission-driver/design/mission-design.md`, `docs/backlog/mission-driver-draft-robustness-roadmap.md`
Skill: none

- Item Types: `Decision | Fix`
- Prereqs: Phase 1 complete (so the cross-reference target `draft-robustness-design.md` is aligned).

- [x] **Decision (F4 + A7)**: Choose how to resolve the contradiction between the roadmap cross-cutting row (`docs/backlog/mission-driver-draft-robustness-roadmap.md:226`) and WI2/WI3 plan closures ("No owner-doc update required"). Document the chosen option, alternatives, and residual risk in this plan.
  - **Chosen: Option A** — Honor the promise by editing `mission-design.md §9` (`:238-249`) with a one-paragraph description of the two-stage brief→draft pipeline, the `<BRIEF_GATE>pass|blocked</BRIEF_GATE>` marker contract, and the `{{backlogDir}}` template-variable unification; cite `draft-robustness-design.md` as the controlling owner doc.
  - **Alternatives considered**: Option A honors the explicit commitment and keeps the higher-level doc usable for cold readers; cost is a paragraph edit and a small risk of duplicating normative content across two docs. Option B (re-adjudicate the roadmap cross-cutting row to "deferred") is honest about deferral but leaves a stale high-level overview that Section 5 ("Two-Phase Usage") points readers to.
  - **Residual risk (Option A)**: future drift if the two-stage pipeline evolves; mitigated by the same audit prompt that surfaced this finding (re-opens if a future audit flags §9 as stale vs the controlling `draft-robustness-design.md`).
  - Skill: none
- [x] **F4 + A7 (Fix)**: Applied Option A — `mission-design.md §9` (`tools/mission-driver/design/mission-design.md:238-251`) now opens with a one-paragraph brief→draft pipeline description covering (1) Stage 1 brief + Stage 2 draft split, (2) `<BRIEF_GATE>pass|blocked</BRIEF_GATE>` + `<BRIEF_GATE_REASON>` marker contract and engine enforcement via `extractBriefGate`, (3) `{{backlogDir}}` / `{{missionsDir}}` template-variable unification anchored at `projectRoot`, (4) `--skip-brief` legacy single-stage collapse. Citation to `draft-robustness-design.md` added as the controlling owner doc. Roadmap cross-cutting row at `:226` left untouched (Option A does not edit the roadmap; the row's promise is now fulfilled by the §9 edit, resolving the prior contradiction with WI2/WI3 plan closures).
      - Skill: none

Exit Criteria:

- [x] Decision recorded with rationale and alternatives in this plan.
- [x] Either `mission-design.md §9` reflects the two-stage pipeline (Option A) OR the roadmap cross-cutting row reads "deferred" with explicit reason (Option B).
- [x] No contradiction remains between roadmap promise and plan closures.
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: needs revision (subagent `ses_07c998322ffeuFD4uX44U7Cvh6`, 2026-07-21). Three blocking issues found and fixed: (1) Commander `draft` registration citation was `main.js:730-740`, actually `main.js:833-844` (would have re-introduced the exact staleness F2 fixes) — re-verified live and updated in Current Baseline + Phase 1 F2 item; (2) forbidden word `optional` in Task Route re: CONTEXT.md — removed CONTEXT.md as alternative host, committed to §1.4 of draft-robustness-design.md as single location; (3) F5 placement ambiguity (Goal/Item/Gate cited different locations) — collapsed to single committed location with consistent wording across Goal, Phase 1 item, Phase 1 Exit Criteria, and Closure Gate. Non-blocking suggestions accepted: tightened F2 to "anchors primary, line numbers secondary" single strategy; added `git diff --name-only` positive-proof guard to Closure Gates.
- Independent draft review iteration 2: accept (subagent `ses_07c928947ffeKN2JiY9btd1elS`, 2026-07-21). All three iteration-1 blocking issues re-verified fixed via live read of `tools/mission-driver/src/main.js:833-844`; no forbidden words remain in Task Route / Goals / Non-Goals / Execution Plan items (the only substring hits are the standard Rule 9 "Alternatives considered" label and the iteration 1 narrative); F5 placement is consistently §1.4 across Goal / Phase 1 item / Exit Criteria / Closure Gate. Full re-checklist passes. Non-blocking suggestions accepted: added reopening event to F2 Deferred But Adjudicated (`reopens if a future audit flags line-number citations as insufficiently durable`); added `parseDraftArtifact` to the F2 function-name anchor list. Consensus reached — plan promoted to `Plan Status: active`.

## Closure Gates

- [x] in-scope behavior is complete (all 7 findings' doc locations updated)
- [x] relevant docs are aligned (Status field, line numbers, §4.1 order, §4.2.2 regex, §1.4 schema, §9 / cross-cutting row)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` (512 pass / 0 fail — no code change; baseline preserved) and `pnpm --prefix tools/mission-driver run lint:prompts` OK (no prompt change); additionally `git diff --name-only` filtered to confirm only `docs/` and `tools/mission-driver/design/` paths changed by this plan (positive proof of the no-code-change Non-Goal — pre-existing uncommitted changes in `src/main.js`, `flows/mission-driver.json`, `test/from-step.test.js`, `design/step-execution-and-audit-count-design.md`, and `docs/logs/2026/07-21.md` are in-progress work from sibling plans / sessions, not this plan's)
- [x] no in-scope item downgraded to deferred/follow-up (F1–F5, A6, A7 all closed in-plan)
- [x] independent draft review completed and recorded
- [x] text consistency verified: Plan Status, phase statuses, exit criteria, gates, and log all agree
- [x] closure audit was independent (solo cold-replay pass — see Closure below)
- [x] closure evidence exists in files (diff + log entry)

## Deferred But Adjudicated

### F2 — Full migration from line numbers to function-name anchors

- Classification: `optimization candidate`
- Why Not Blocking Closure: Phase 1 allows either line-number refresh OR function-name anchor. Full function-name migration is a style preference; live line numbers are accurate at closure.
- Successor Required: no (reopens if a future audit flags line-number citations as insufficiently durable relative to anchor-based citations)

## Closure

Status Note: Closed. Phase 1 + Phase 2 complete; solo cold-replay closure audit performed (no second reviewer available — non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback; doc-only sync plan with no contract / API / data / auth / integration / deployment behavior change).

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay pass (executor of this plan, opencode agent on 2026-07-21).
- Evidence:
  - `tools/mission-driver/design/draft-robustness-design.md`: Status field changed from `proposal` to `implemented — §4.1/§4.2/§4.3/§4.4/§4.5 landed via WI1–WI5`; §1.1/§1.2/§1.4/§2.1 stale `main.js:` line numbers refreshed to live locations (`cmdDraftMission` body at `:317-509`, Stage 1 brief block at `:397-438`, Stage 2 draft block at `:458-509`, Commander `draft` registration at `:844-855`); §4.1 "Deviation note (A6)" paragraph documenting `empty → placeholder → length` implementation order; §4.2.2 regex updated from `/i` to `/is` with "Regex flag (F3)" note; §1.4 full `draft-state.json` schema table (14 fields with patch-point citations).
  - `tools/mission-driver/design/mission-design.md`: §9 opens with one-paragraph two-stage brief→draft pipeline description + gate marker contract + `{{backlogDir}}` template-variable unification + `--skip-brief` legacy collapse + cross-reference to `draft-robustness-design.md`.
  - `docs/backlog/mission-driver-draft-robustness-roadmap.md`: untouched (Option A leaves the cross-cutting row as-is; the prior contradiction with WI2/WI3 plan closures is resolved by fulfilling the promise via the §9 edit).
  - `docs/logs/2026/07-21.md`: dated log entry appended.
  - Verification (full green): `pnpm --prefix tools/mission-driver test` → 512 pass / 0 fail (baseline preserved, no code change); `pnpm --prefix tools/mission-driver run lint:prompts` → OK.
  - Scope proof: `git diff --stat tools/mission-driver/design/draft-robustness-design.md tools/mission-driver/design/mission-design.md` → only `+41 / -12` in those two design docs from this plan.
- Limitation: solo review (no second reviewer); per AGENTS.md Reviewer-Availability Fallback this is acceptable because the plan is non-protected (doc-only sync) and non-high-risk (no source-of-truth conflict, no contract change, no unresolved product risk).

Follow-up:

- None (all 7 findings closed in-plan). F2's "Full migration from line numbers to function-name anchors" remains a deferred optimization candidate (see Deferred But Adjudicated) — current state mixes anchors-primary + line-numbers-secondary, which is sufficient.
