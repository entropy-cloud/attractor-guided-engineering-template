# mdr-remediate-1 design + architecture owner-doc sync (N4, F4/N1-arch — 6 sibling findings pre-resolved by completed 1005-1)

> Plan Status: completed
> Last Reviewed: 2026-07-22 (closed)
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-multi-audit-*.md` (F1, F4/N1-arch, F5, F8, F9, F10, F11 doc side) and `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-open-audit-*.md` (N4)
> Related: superseded by completion of `2026-07-21-1005-1-design-owner-doc-sync.md` (`Plan Status: completed` 2026-07-21) for 6 of 8 findings (see Pre-Resolved By Sibling Plan below); sibling new remediation plans `2026-07-21-1605-2-draft-pipeline-robustness-closure.md` (code-fix findings), `2026-07-21-1605-3-engine-extraction-and-verification-invariants.md` (engine + verification findings).
> Mission: mission-driver-draft-robustness
> Audit: required
> Execution Order: 1 of 3

## Current Baseline

Live baseline re-verified 2026-07-22 against `tools/mission-driver/` and `docs/architecture/`:

**Scope narrowed at draft review.** The original draft (2026-07-21) targeted 8 findings (F1, F4/N1-arch, F5, F8, F9, F10, F11-doc, N4) and assumed the prior plan `2026-07-21-1005-1-design-owner-doc-sync.md` was `Plan Status: active` but unimplemented. That assumption is now false: `2026-07-21-1005-1` is `Plan Status: completed` (closed 2026-07-21) and resolved 6 of the 8 findings under its own audit IDs. Only **N4** and **F4 / N1-arch** remain open.

Two findings still open:

- **N4 (open)** — `tools/mission-driver/design/draft-robustness-design.md:317` (§4.3.1 `resolveTemplateVars` snippet) still lists `plansRoot: resolve(resolved.projectRoot, "docs/plans"), // 新增（供 mission-draft 引用 planGuide 相对位置）` as a peer of `backlogDir`. Implementation deliberately omits it: `src/main.js:423-426` (Stage 1 brief render) and `src/main.js:487-490` (Stage 2 draft render) inject `backlogDir` but NOT `plansRoot`. WI3 closure log `docs/logs/2026/07-21.md` records the deferral as "dead code" (no prompt references `{{plansRoot}}`). Design snippet never absorbed the deferral.
- **F4 / N1-arch (open)** — `docs/architecture/` coverage gap. `docs/architecture/system-baseline.md` is template stub ("Fill In" placeholders all empty); `docs/architecture/README.md` (34 lines) describes intended content but `Initial Owner Docs` are template stubs. `grep -rn "mission-driver\|mission_driver\|draft-state\|subflowRuns\|BRIEF_GATE" docs/architecture/` returns zero hits. Mission-driver public contracts (CLI surface `draft`/`run`/`list`/`list-steps`/`analyze`; `mission.json` schema enforced by `mission-check.mjs` REQUIRED_FIELDS / REQUIRED_COMMANDS; `draft-state.json` schema; `run-state.json` shape including `subflowRuns` / `visits` / `_subflowId`; `<BRIEF_GATE>` marker contract; public exports surface vs test seams) undocumented at architecture level.

Six findings pre-resolved by completed `2026-07-21-1005-1` (cross-reference audit IDs in parentheses):

- F1 (1005-1 F1) — `draft-robustness-design.md:5` Status now reads `implemented — §4.1/§4.2/§4.3/§4.4/§4.5 landed via WI1–WI5`.
- F5 (1005-1 F2) — stale `main.js:` line numbers refreshed to live locations + function-name anchors across §1.1/§1.2/§1.4/§2.1.
- F10 (1005-1 A6) — §4.1 "Deviation note (A6)" paragraph documents `empty → placeholder → length` order.
- F11 doc side (1005-1 F3) — §4.2.2 regex now `/is` with "Regex flag (F3)" note.
- F9 (1005-1 F5) — `draft-state.json` schema table present in §1.4.
- F8 (1005-1 F4 + A7) — `mission-design.md:240` §9 now opens with two-stage brief→draft pipeline + gate marker + `{{backlogDir}}` description; Option A honored the roadmap promise.

Gap: Two findings remain. N4 is a stale code snippet in a design doc (plansRoot never shipped). F4/N1-arch is a missing-or-deferred architecture-layer owner doc for a cross-cutting tool whose public contracts are currently only described inside `tools/mission-driver/design/*.md`.

## Goals

- §4.3.1 either drops the `plansRoot` line or annotates it as deferred with log citation.
- Architecture-doc coverage gap is explicitly resolved: new `docs/architecture/mission-driver-baseline.md`, OR `docs/architecture/README.md` deferral note + `docs/backlog/` template-debt row.

## Non-Goals

- No code, test, prompt, or missions changes.
- Do not re-open WI1–WI5 contracts. The implementation is normative; only the docs are wrong.
- Do not backfill historical migration prose into `docs/architecture/` (AGENTS.md Rule 6: keep design/architecture focused on the current supported baseline).
- Do not re-do the 6 findings already closed by `2026-07-21-1005-1` (F1, F5, F8, F9, F10, F11-doc) — they are completed and re-touching them is out of scope.
- Do not address code-fix findings — F2 / N2 / F6 / F11-test / F12 / F13 tracked in `2026-07-21-1605-2`; N1 / F3 / N3 / F7 / F14 tracked in `2026-07-21-1605-3`.
- Do not duplicate `draft-state.json` schema in `CONTEXT.md` (it already cross-references the design doc).

## Task Route

- Type: `implementation-only change` (doc-only edits; no contract / API / data / auth / integration / deployment behavior change).
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §4.3.1 (N4 target), `docs/architecture/*` (F4/N1-arch decision).
- Skill Selection Basis: `Skill: none` — doc-only sync; the multi-dimensional / open-ended audit prompts were already used to surface the findings, not to fix them.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline. Doc-only edits; no test runs needed (`lint:prompts` already green per audit; this plan touches no prompt files).

## Execution Plan

### Phase 1 - draft-robustness-design.md §4.3.1 plansRoot sync (N4)

Status: completed
Targets: `tools/mission-driver/design/draft-robustness-design.md`
Skill: none

- Item Types: `Fix` (uniform — 1 of 1 item tagged Fix)
- Prereqs: none

- [x] **N4 (Fix)** In §4.3.1 (`:312-321` resolveTemplateVars snippet), either drop the `plansRoot: resolve(resolved.projectRoot, "docs/plans")` line (preferred — snippet should describe what shipped) OR annotate it with `// deferred — not implemented in WI3; no prompt currently references {{plansRoot}}; see docs/logs/2026/07-21.md WI3 entry`. Verify the snippet's remaining vars (`missionsDir`, `projectRoot`, `backlogDir`, `briefPath`, `flowHint`) match `src/main.js:423-426` / `:487-490`.
      - Skill: none
      - Applied: dropped the `plansRoot` line (preferred option — snippet now describes what shipped) + added a `> **plansRoot omitted (N4 fix, mdr-remediate-1)**` callout citing the WI3 deferral (`docs/logs/2026/07-21.md`) and confirming the remaining vars match `src/main.js:423-429` (Stage 1) / `:487-493` (Stage 2).

Exit Criteria:

- [x] §4.3.1 snippet no longer claims `plansRoot` as a landed template var.
- [x] No code, test, prompt, or missions file changed (verified by `git diff --name-only` filtered to `docs/` and `tools/mission-driver/design/`).
- [x] `docs/logs/` updated.

### Phase 2 - Architecture-doc coverage decision (F4 / N1-arch)

Status: completed
Targets: `docs/architecture/README.md`, `docs/architecture/mission-driver-baseline.md` (new, if Option A chosen), `docs/backlog/` (Options B / C)
Skill: none

- Item Types: `Decision | Fix`
- Prereqs: Phase 1 complete (so the architecture doc, if created, cross-references the now-aligned design docs).

- [x] **Decision (F4 / N1-arch)**: Choose how to record the architecture-doc coverage gap that AGENTS.md declares `docs/architecture/` as the owner of "cross-cutting technical and module-boundary truth".
  - **Option A (mission-scoped)**: Create `docs/architecture/mission-driver-baseline.md` enumerating the public CLI surface (`draft` / `run` / `list` / `list-steps` / `analyze`), `mission.json` schema (REQUIRED_FIELDS, REQUIRED_COMMANDS), `draft-state.json` schema (cross-ref §1.4 table closed by 1005-1), `run-state.json` shape including `subflowRuns` / `visits` / `_subflowId`, `<BRIEF_GATE>` marker contract (cross-ref WI2 plan), and public exports surface vs test seams. Cite existing `tools/mission-driver/design/*.md` as detailed owner docs. Rationale: mission-driver is a stable cross-cutting tool (`mission-design.md` says it "operationalizes the AGE loop"); contracts deserve architecture-level documentation.
  - **Option B (defer with note)**: Add a one-line note to `docs/architecture/README.md` that mission-driver's architecture is currently owned by `tools/mission-driver/design/*.md` and is intentionally not duplicated at the project architecture level until a second tool with cross-cutting concerns lands. Also add a backlog row tracking the template-debt paydown for `docs/architecture/system-baseline.md` and `module-boundaries.md`.
  - **Option C (minimum)**: Add only the backlog row from Option B; do not touch `docs/architecture/README.md`.
  - **Alternatives considered**: Option A is the most thorough but introduces a new owner doc that must be maintained. Option B explicitly defers with rationale. Option C is minimal but leaves `docs/architecture/README.md` claiming a state that does not hold.
  - **Residual risk**: any of the three options leaves the broader template debt (`system-baseline.md`, `module-boundaries.md`) unresolved; a backlog row is added in all three cases so the debt is tracked.
  - **Chosen: Option A.** Rationale: AGENTS.md assigns `docs/architecture/` ownership of cross-cutting technical truth; mission-driver is a stable cross-cutting tool with real public contracts; Option A honors the ownership model most directly and closes the F4/N1-arch finding completely. The new doc cites (not duplicates) the detailed design docs, so maintenance burden is bounded. Option B was rejected because it leaves `docs/architecture/README.md` claiming a state that does not hold; Option C is too minimal. Residual template-debt is tracked via the backlog row added below.
  - Skill: none
- [x] **F4 / N1-arch (Fix)**: Apply the chosen option. If Option A: create `docs/architecture/mission-driver-baseline.md`. If Option B: edit `docs/architecture/README.md` + add backlog row. If Option C: add backlog row only. In all cases, add a backlog row for the project-wide template-debt paydown (separate from any mission-scoped row).
      - Skill: none
      - Applied: created `docs/architecture/mission-driver-baseline.md` (Option A) enumerating CLI surface / mission.json schema / draft-state schema (cite §1.4, no duplicate) / run-state shape / marker contracts / public exports vs test seams; updated `docs/architecture/README.md` reading order + owner-docs list; added project-wide template-debt row to `docs/backlog/mission-driver-draft-robustness-roadmap.md` Follow-up Backlog.

Exit Criteria:

- [x] Decision recorded with rationale and alternatives in this plan.
- [x] Architecture-doc gap is explicitly resolved (new doc, deferral note, or backlog row).
- [x] Project-wide template-debt backlog row exists.
- [x] `docs/logs/` updated.

## Pre-Resolved By Sibling Plan

The original draft targeted 8 findings. 6 were closed by `2026-07-21-1005-1-design-owner-doc-sync.md` (`Plan Status: completed`, closed 2026-07-21) under its own audit IDs. Recorded here so the closure trail is honest and the finding IDs in this plan's title remain traceable.

| This plan's ID | 1005-1 ID | Status | Live evidence |
| -------------- | --------- | ------ | -------------- |
| F1 | F1 | done | `draft-robustness-design.md:5` reads `implemented — …` |
| F5 | F2 | done | §1.1/§1.2/§1.4/§2.1 line numbers refreshed + anchors |
| F10 | A6 | done | §4.1 "Deviation note (A6)" paragraph |
| F11-doc | F3 | done | §4.2.2 regex `/is` + "Regex flag (F3)" note |
| F9 | F5 | done | §1.4 `draft-state.json` schema table |
| F8 | F4 + A7 | done | `mission-design.md:240` §9 two-stage pipeline description |

These 6 are Non-Goals here (see above). Re-touching them is out of scope.

## Draft Review Record

- Independent draft review iteration 1 (subagent, opencode `MISSION_DRIVER` reviewer, 2026-07-22): needs revision — **Blocker**. The draft's Current Baseline claimed the prior plan `2026-07-21-1005-1` was `Plan Status: active` but unimplemented, and listed 6 findings (F1, F5, F8, F9, F10, F11-doc) as open. Live re-verification showed `2026-07-21-1005-1` is `Plan Status: completed` (closed 2026-07-21) and those 6 findings are already resolved in `tools/mission-driver/design/draft-robustness-design.md` and `mission-design.md` (verified by direct read: Status field, refreshed line numbers, §4.1 deviation note, §4.2.2 `/is` regex, §1.4 schema table, §9 two-stage description). Executing the draft as-written would have re-done completed work. Fix applied: rewrote Current Baseline to live state, narrowed Goals / Non-Goals / Task Route / Execution Plan to the 2 genuinely open findings (N4, F4/N1-arch), added a "Pre-Resolved By Sibling Plan" table preserving the audit trail for all 8 finding IDs. N4 and F4/N1-arch decision analysis (drop-vs-annotate; Option A/B/C) preserved unchanged. Verification command `pnpm --prefix tools/mission-driver test` confirmed correct against repo `pnpm-lock.yaml` (the module `CONTEXT.md` cites `npm` — a separate stale-doc issue outside this plan's scope). Plan promoted to `active`.

## Closure Gates

- [x] in-scope behavior is complete (N4 and F4/N1-arch doc locations updated)
- [x] relevant docs are aligned (§4.3.1 plansRoot, architecture coverage)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` (baseline preserved — no code change) and `pnpm --prefix tools/mission-driver run lint:prompts` (no prompt change); additionally `git diff --name-only` filtered to confirm only `docs/` and `tools/mission-driver/design/` paths changed (positive proof of the no-code-change Non-Goal)
- [x] no in-scope item downgraded to deferred/follow-up (N4, F4/N1-arch both closed in-plan)
- [x] independent draft review completed and recorded
- [x] text consistency verified: Plan Status, phase statuses, exit criteria, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### F5 — Full migration from line numbers to function-name anchors

- Classification: `optimization candidate`
- Why Not Blocking Closure: F5 itself was closed by `2026-07-21-1005-1` (line numbers refreshed). Full function-name-anchor-only migration is a style preference; the anchors-primary + line-numbers-secondary state shipped by 1005-1 is sufficient.
- Successor Required: no (reopens if a future audit flags line-number citations as insufficiently durable)

## Closure

Status Note: Both phases complete (2026-07-22). N4 closed by dropping the §4.3.1 `plansRoot` snippet line + adding a deferral callout citing the WI3 log. F4/N1-arch closed via Option A — new `docs/architecture/mission-driver-baseline.md` enumerating mission-driver's public contracts (CLI surface, mission.json / draft-state / run-state schemas, marker contracts, public exports vs test seams) with citations to the detailed design docs; `docs/architecture/README.md` reading order + owner-docs list updated; project-wide template-debt backlog row added. Verification: `pnpm --prefix tools/mission-driver test` → 520 pass / 0 fail (baseline preserved, no code change); `lint:prompts` OK. Plan-only edits — no code / test / prompt / missions files touched.

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay pass (no second reviewer available; non-protected / non-high-risk doc-only plan per AGENTS.md Reviewer-Availability Fallback; source audit severity N4 LOW / F4+N1-arch MEDIUM-LOW).
- Evidence: `docs/logs/2026/07-22.md` mdr-remediate-1 entry; `tools/mission-driver/design/draft-robustness-design.md` §4.3.1 (snippet + N4 callout); `docs/architecture/mission-driver-baseline.md` (new); `docs/architecture/README.md` (reading order + owner-docs list); `docs/backlog/mission-driver-draft-robustness-roadmap.md` (Follow-up Backlog template-debt row + Last Updated header). `grep -rn "mission-driver\|draft-state\|subflowRuns\|BRIEF_GATE" docs/architecture/` now returns hits (was zero before this plan).

Follow-up:

- None in-plan (both in-scope findings — N4, F4/N1-arch — closed). Project-wide template-debt paydown (`system-baseline.md` / `module-boundaries.md` / `project-vision.md` Fill-In stubs) tracked in `docs/backlog/mission-driver-draft-robustness-roadmap.md` Follow-up Backlog (P3, trigger = second cross-cutting tool lands OR copied project needs the baseline).
