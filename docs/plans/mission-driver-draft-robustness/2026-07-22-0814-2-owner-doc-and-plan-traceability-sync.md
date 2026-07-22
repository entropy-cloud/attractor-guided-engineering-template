# mdr-remediate-6 owner-doc & plan traceability sync (O1, N4, NF2, NF3, NF4)

> Plan Status: completed
> Last Reviewed: 2026-07-22 (closed)
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-open-audit-*.md` (O1, N4) and `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-multi-audit-*.md` (NF2, NF3, NF4, N4)
> Related: supersedes the still-open residual doc-sync scope of `2026-07-21-1605-1-design-and-architecture-doc-sync.md` (that draft also covered F1/F5/F8/F9/F10/F11-doc, all now CLOSED per the 0755 multi-audit Prior-Finding table; only its N4 scope carries forward here). O1, NF2, NF3, NF4 were not covered by any prior plan.
> Mission: mission-driver-draft-robustness
> Audit: required
> Execution Order: 2 of 3

## Current Baseline

Live baseline re-verified 2026-07-22 against `tools/mission-driver/` (all uncommitted in the working tree; last commit `3414292` is WI5):

- `tools/mission-driver/EXECUTION-PRINCIPLE.md §3` state-machine mermaid is stale on **two** facts. `CONTEXT.md`'s "文档入口" table and `README.md`'s "Further reading" both cite this doc as *the* execution-mechanism reference, so it is a high-traffic operator doc.
  - **Drift A** (`EXECUTION-PRINCIPLE.md:101`): `DEEP_AUDIT --> DRAFT_PLANS: complete / failed`. The live flow (`flows/mission-driver.json:87-90`) is `complete → REVIEW_PLANS`, `failed → DRAFT_PLANS`. The mermaid sends a cold reader to the wrong next step for the success case.
  - **Drift B** (`EXECUTION-PRINCIPLE.md:116-117`): `REVIEW_PLANS --> max_cycles: visitCount > 30` / `EXEC_PLANS --> max_cycles: visitCount > 30`. The live `flows/mission-driver.json:4` is `"maxCycleVisits": 8`; `README.md §"Cycle limits"` documents the default as **8** with the explicit note that the old 30/10/15 thresholds were retired. The mermaid still teaches the retired 30 cap. (Line 118 `maxAuditRounds > 3` matches `maxAuditRounds: 3` — not flagged.)
  - **Additional stale `30` references in the SAME doc** (found during independent review of this plan; same root cause as Drift B, same wrong cap taught): `EXECUTION-PRINCIPLE.md:169` (§4 sequence diagram shows `maxCycleVisits(30)?`), `:479` (§8 body text `单个 step 累计访问超 30 次`), `:579` (§9 troubleshooting table `maxCycleVisits(30)`). These are in scope for Phase 1 alongside Drift B — a `30 → 8` sweep of the whole doc, not just `:116-117`. (O1 — net-new; the sibling 0755 multi-audit's NF1 flagged the underlying flow edge but did NOT check this operator doc.)
- `design/draft-robustness-design.md:317` (§4.3.1) still reads `plansRoot: resolve(resolved.projectRoot, "docs/plans"), // 新增（供 mission-draft 引用 planGuide 相对位置）`. The implementation (`main.js:400-406, 464-470`) deliberately omits it (WI3 log: "dead code"). The annotation says `新增` ("new"), not deferred. `grep -n "plansRoot" tools/mission-driver/design/draft-robustness-design.md` → 1 hit, unchanged. (N4 — carried forward.)
- `src/main.js` (after `const program = new Command();`) calls `program.enablePositionalOptions();` (`:813`) with a thorough code comment ("commander 15.0.0 option-stripping quirk..."). `test/from-step.test.js` (+150 lines) was rewritten with isolated `tmpdir` roots + new CLI assertions covering `run <mission> --step` / `--from-step` / `--no-monitor`. The fix is sound and well-tested at the code level. **But** `grep -rn "enablePositionalOptions" docs/ tools/mission-driver/design/` → **0 hits** outside `node_modules`. No design doc, no plan, no log entry references this user-visible CLI behavior change. It landed alongside the draft-robustness remediation batch but is unrelated to any draft-robustness finding. (NF2 — net-new.)
- **Plans-vs-reality desync** (NF3 + NF4):
  - `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-multi-audit-*.md:4` and `...-open-audit-*.md:4` both declare `Remediation Plans: 2026-07-21-1605-1/2/3`.
  - Those three `1605` plans are all `Plan Status: draft` with **every** phase item `[ ]` and Closure Gates all `[ ]`.
  - The four older plans they claim to "consolidate / supersede" (`2026-07-21-1005-1/2/3`, `2026-07-21-1523-1`) are all `Plan Status: completed`, and their implementation IS the uncommitted working-tree diff (code comments cite `mdr-remediate-3 A1` / `mdr-remediate-4 H2/H3/H9`; `docs/logs/2026/07-21.md` log entries record closure against the `1005/1523` plan names).
  - A cold reader following an 0952 audit header into `2026-07-21-1605-1.md` reads `Plan Status: draft` + 100% unchecked boxes and correctly concludes "none of F1–F14 has been started" — the opposite of reality. `design/draft-robustness-design.md` deviation notes cite the `1005/1523` plan names (`1005-2 A5`, `1005-3`, `mdr-remediate-4`), so the design docs are internally consistent with the executed set but contradict the audit headers' "controlling" set. (NF3 + NF4 — net-new.)

Gap: five findings share one closure surface — owner-doc / log / traceability text drift with no code behavior change. They are all small doc/log edits verified by read-back + grep + re-running the (already-green) test suite to confirm no behavior regression. They do not touch code, flow, prompt, or public contract.

## Goals

- `EXECUTION-PRINCIPLE.md §3` mermaid matches the live flow (`complete → REVIEW_PLANS`) and the live cycle cap (`maxCycleVisits: 8`), so the operator-facing state-machine picture stops teaching a wrong mental model (closes O1).
- `design/draft-robustness-design.md §4.3.1` no longer over-promises an unimplemented `plansRoot` template var — either dropped or annotated deferred with the WI3 log reference (closes N4).
- `enablePositionalOptions()` has a dated `docs/logs/` entry citing the AGENTS.md planning trigger it should have routed through, so the user-visible CLI change is no longer an unattributed side-edit (closes NF2).
- The plans-vs-reality desync is reconciled: a cold reader following any 0952 audit header sees that F1–F14 landed via `1005/1523` and that only N1/N2/N3/N4/F4 remain (now owned by sibling Plans 1 + 3), and the `1605` drafts are no longer a misleading "controlling" pointer (closes NF3 + NF4).

## Non-Goals

- Do NOT revert or re-adjudicate the `enablePositionalOptions()` code change itself — the implementation is sound and tested (NF2 is a routing/log gap, not a code defect).
- Do NOT change the live flow graph `DEEP_AUDIT complete → REVIEW_PLANS` — that edge is an intentional regression fix owned by the sibling `mission-driver-step-audit` mission (see open-audit O2); adjudicating NF1 is Plan 3's scope, not this plan's. This plan only fixes the *operator-doc mermaid* that lags the live flow.
- Do NOT fill the `docs/architecture/` template stubs — that decision (F4/N1-arch) is Plan 3's scope.
- Do NOT re-run or re-litigate any closed finding (F1–F14 are closed under `1005/1523`); this plan only reconciles the traceability pointers.

## Task Route

- Type: `verification or audit work` (owner-doc / log / traceability reconciliation; no code behavior change). The NF2 log entry is a process-routing remediation, not an implementation change.
- Owner Docs: `tools/mission-driver/EXECUTION-PRINCIPLE.md` §3, `tools/mission-driver/design/draft-robustness-design.md` §4.3.1, `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-*.md` headers, `docs/plans/mission-driver-draft-robustness/2026-07-21-1605-*.md` (reconcile), `docs/logs/2026/`.
- Skill Selection Basis: `Skill: none` — doc-sync and traceability reconciliation following the AGE source-of-truth rules in `docs/context/source-of-truth-and-precedence.md`. No reusable skill matches the work method.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.

## Execution Plan

### Phase 1 - Fix EXECUTION-PRINCIPLE.md §3 mermaid + whole-doc 30→8 sweep + design §4.3.1 plansRoot (O1, N4)

Status: completed
Targets: `tools/mission-driver/EXECUTION-PRINCIPLE.md` (`:101`, `:116-117`, `:169`, `:479`, `:579`), `tools/mission-driver/design/draft-robustness-design.md` (`:317`)
Skill: none

- Item Types: `Fix | Proof | Decision`
- Prereqs: none

- [x] `Fix` (O1 Drift A): in `EXECUTION-PRINCIPLE.md §3`, change line 101 from `DEEP_AUDIT --> DRAFT_PLANS: complete / failed` to two edges: `DEEP_AUDIT --> REVIEW_PLANS: complete` and `DEEP_AUDIT --> DRAFT_PLANS: failed`. This matches `flows/mission-driver.json:87-90` exactly. (Note: this is the operator-doc sync for the edge Plan 3 adjudicates; the edge itself is intentional and stays.)
  - Skill: none
  - Applied: `EXECUTION-PRINCIPLE.md:101-102` now reads `DEEP_AUDIT --> REVIEW_PLANS: complete` / `DEEP_AUDIT --> DRAFT_PLANS: failed`, matching `flows/mission-driver.json:88-89`.
- [x] `Fix` (O1 Drift B + whole-doc sweep): change every retired `30` cycle-cap reference to `8` to match `flows/mission-driver.json:4` `"maxCycleVisits": 8` and `README.md §"Cycle limits"`. Concretely: `:116-117` (`visitCount > 30` → `> 8`), `:169` (`maxCycleVisits(30)?` → `maxCycleVisits(8)?`), `:479` (`超 30 次` → `超 8 次`), `:579` (`maxCycleVisits(30)` → `maxCycleVisits(8)`). Verify completeness with `grep -n "30" tools/mission-driver/EXECUTION-PRINCIPLE.md` after the edit and adjudicate any remaining hit (some `30`s may be unrelated — e.g. examples, other thresholds — record each non-cycle-cap hit as intentionally-untouched).
  - Skill: none
  - Applied: all four sites swept `30 → 8`. `grep -n "30" tools/mission-driver/EXECUTION-PRINCIPLE.md` now returns 3 hits — **all non-cycle-cap, intentionally untouched**: `:321` `engine.js:430-512` (line-number range), `:431` `process.exit(130)` (exit code), `:532` `engine.js:130-141` (line-number range).
- [x] `Proof` (not a Decision — this is read-back verification): re-read the §3 mermaid after the edit and confirm the OTHER edges still match the live flow (CHECK→REVIEW_PLANS:pass, DRAFT_PLANS→REVIEW_PLANS:created, DRAFT_PLANS→DEEP_AUDIT:nothing, EXEC_PLANS→DRAFT_PLANS, maxAuditRounds>3). If any additional drift beyond Drift A/B is found, bring it into scope (same edit pass) rather than deferring — a partial mermaid fix teaches the same wrong model.
  - Skill: none
  - Applied: read-back of `:90-123` confirms all other edges still match `flows/mission-driver.json` — CHECK→REVIEW_PLANS:pass (✓ :38), CHECK→failed:onMaxRetries (✓ :41), REVIEW_PLANS→EXEC_PLANS (✓ :77-79), EXEC_PLANS→DRAFT_PLANS (✓ :51-53), DRAFT_PLANS→REVIEW_PLANS:created (✓ :63), DRAFT_PLANS→DEEP_AUDIT:nothing (✓ :64), maxAuditRounds>3 (✓ :7 `maxAuditRounds: 3`). No additional drift found.
- [x] `Fix` (N4): in `design/draft-robustness-design.md §4.3.1` line 317, either (a) **delete** the `plansRoot:` line from the snippet (preferred — the snippet should describe what shipped; `backlogDir` is the only template var WI3 actually injects), or (b) annotate it `// deferred — not implemented in WI3; no prompt currently references {{plansRoot}}; see docs/logs/2026/07-21.md WI3 entry`. Choose (a) unless the reviewer objects.
  - Skill: none
  - Applied: already closed upstream by `mdr-remediate-1` (sibling plan `2026-07-21-1605-1`, `Plan Status: completed`). The snippet at `design/draft-robustness-design.md:312-319` no longer contains `plansRoot` (option (a) — dropped), and a `> **plansRoot omitted (N4 fix, mdr-remediate-1)**` callout at `:322` records the WI3 deferral citing `docs/logs/2026/07-21.md`. `grep -n "plansRoot" tools/mission-driver/design/draft-robustness-design.md` → 1 hit (the deferred-annotation callout), satisfying the Exit Criteria's "0 hits [deleted] OR 1 hit with a deferred annotation" branch. No re-edit needed.

Exit Criteria:

- [x] `EXECUTION-PRINCIPLE.md §3` mermaid shows `DEEP_AUDIT --> REVIEW_PLANS: complete` (verify: read-back of `:101` area) AND every cycle-cap reference reads `8` not `30` (verify: `grep -n "30" tools/mission-driver/EXECUTION-PRINCIPLE.md` returns no cycle-cap hits; remaining hits adjudicated in the log).
- [x] `design/draft-robustness-design.md:317` no longer reads `// 新增` for `plansRoot` (verify: `grep -n "plansRoot" tools/mission-driver/design/draft-robustness-design.md` → 0 hits [deleted] OR 1 hit with a deferred annotation).
- [x] `pnpm --prefix tools/mission-driver test` → still 520 pass / 0 fail (doc-only edit; no behavior change).
- [x] `docs/logs/` updated.

### Phase 2 - Attributed log entry for enablePositionalOptions (NF2)

Status: completed
Targets: `docs/logs/2026/07-22.md` (create or append; reverse-chronological per `docs/logs/00-log-writing-guide.md`)
Skill: none

- Item Types: `Add | Decision`
- Prereqs: none

- [x] `Decision`: confirm whether `enablePositionalOptions()` deserves a full back-dated plan or just an attributed log entry. Per AGENTS.md planning triggers it crossed "changes user-visible behavior" + "public contract" (CLI surface). But the change is already landed + tested + commented at the code level; the residual gap is purely attribution. Choose the attributed log entry (the smaller honest fix) over a back-dated plan, and record why: a back-dated plan cannot drive the routing decision it should have driven; the log entry + this plan's reference closes the traceability gap without fake plan theater.
  - Skill: none
  - Applied: chose **attributed log entry** over back-dated plan. A back-dated plan cannot drive the routing decision it should have driven — the residual gap is purely attribution (code is already landed + tested + commented at `src/main.js:762-771`), and an attributed log entry closes the traceability gap honestly without fake plan theater.
- [x] `Add`: write a `docs/logs/2026/07-22.md` entry (reverse-chronological top) recording: (a) the `enablePositionalOptions()` change and the commander 15.0.0 option-stripping quirk it fixes, (b) the `test/from-step.test.js` rewrite that pins it, (c) an explicit citation that this was a user-visible CLI change that should have routed through its own small plan per AGENTS.md planning triggers but landed inside the draft-robustness remediation batch, (d) a forward note that future CLI-surface changes route through a plan first. Cross-reference this remediation plan.
  - Skill: none
  - Applied: added the NF2 attribution bullet as the **first bullet** of the existing `### 2026-07-22` section in `docs/logs/2026/07-22.md` (the file already existed with prior mdr-remediate-1..5 entries — no new section header created, satisfying the "single ### 2026-07-22 section / no duplicate" Exit Criterion). The bullet covers all four required points: (a) `enablePositionalOptions()` at `src/main.js:771` + the commander 15.0.0 option-stripping quirk it fixes; (b) `test/from-step.test.js` rewrite (isolated `tmpdir` roots + new CLI assertions); (c) explicit citation that this crossed AGENTS.md "changes user-visible behavior" + "public contract behavior" triggers and should have routed through its own small plan but landed in the draft-robustness batch; (d) forward note that future CLI-surface changes route through a plan first; cross-references this plan (Phase 2).

Exit Criteria:

- [x] `docs/logs/2026/07-22.md` contains a single `### 2026-07-22` section (per `00-log-writing-guide.md` — one section per day at the top, reverse-chronological) with the NF2 attribution entry as its first bullet, followed by the plan-closure aggregate bullets added in Phase 3. No duplicate `### 2026-07-22` sections in the same file.
- [x] The NF2 entry records: (a) the `enablePositionalOptions()` change + the commander 15.0.0 option-stripping quirk it fixes, (b) the `test/from-step.test.js` rewrite that pins it, (c) an explicit citation that this was a user-visible CLI change that should have routed through its own small plan per AGENTS.md planning triggers but landed inside the draft-robustness remediation batch, (d) a forward note that future CLI-surface changes route through a plan first (verify: read-back).
- [x] No code change required (the fix is already in place).
- [x] `docs/logs/` reverse-chronological order + format per `00-log-writing-guide.md` respected.

### Phase 3 - Reconcile plans-vs-reality desync (NF3, NF4)

Status: completed
Targets: `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-multi-audit-*.md` (header), `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-open-audit-*.md` (header), `docs/plans/mission-driver-draft-robustness/2026-07-21-1605-1.md`, `...-1605-2.md`, `...-1605-3.md`
Skill: none

- Item Types: `Decision | Fix`
- Prereqs: none (but reads cleaner after Plans 1 + 3 exist, so the residual-owner pointer is unambiguous)

- [x] `Decision`: choose the reconciliation strategy. The guide's `Plan Status Flow` sanctions `superseded | replaced | deferred | cancelled` for retiring plans that "no longer own live closure in their original form" — **deletion is NOT sanctioned** (AGENTS.md Operating Rule 13 reinforces plan-file durability; the 1605 plans were the controlling remediation pointer in both 0952 audit headers, so they did own closure). Options:
  - **(D) PREFERRED — mark `superseded` + pointer + tick closed items**: change each `1605-1/2/3` plan's `Plan Status: draft` → `Plan Status: superseded`; add a one-line pointer at the top of each — *"Superseded: F1–F14 scope executed via `2026-07-21-1005-1/2/3` + `2026-07-21-1523-1` (all `completed`); residual open items (N1/N2/N3/N4/O1/O3/NF1-O2/NF2/NF3/NF4/F4) owned by `2026-07-22-0814-1/2/3`."*; tick the F1–F14 phase items as `[x] closed-via-1005/1523` (scope-narrowing with recorded reason, per guide Rule 10). **Residual risk**: minor editorial overhead of ticking items in three plans; lowest cold-reader confusion. **Why preferred**: guide-compliant, preserves the durable supersession chain a future cold reader needs, gives the clearest pointer to the new owners.
  - **(A) Delete the 1605 drafts** + update 0952 headers. **Residual risk**: guide non-compliance (Plan Status Flow does not sanction deletion); loses the durable supersession chain; conflicts with the spirit of Operating Rule 13. Rejected unless a human explicitly approves deletion.
  - **(B) Retitle/retarget** the 1605 drafts to "tracking/coverage view — implementation landed via 1005/1523; these track residual open items only" + mark F1–F14 items closed-via-`1005/1523`. **Residual risk**: leaves stale `draft` plans in the tree (cold reader still has to open them to discover the retitle); more text churn than (D).
  - **(C) Update only the 0952 audit headers** to list `1005/1523` as executed remediation and `1605` as residual-only, leaving the `1605` drafts untouched. **Residual risk**: leaves the misleading `draft` + unchecked-boxes plans in the tree (weakest cold-reader experience); does not satisfy NF3's "a cold reader following any 0952 audit header reaches a plan set that matches reality" closure test on its own.
  Record the chosen option + rationale. Prefer (D).
  - Skill: none
  - **Applied (strategy adapted to changed reality):** between this plan's baseline snapshot (2026-07-22) and execution, the `1605-1/2/3` drafts were independently narrowed, executed, and closed — all three are now `Plan Status: completed` (verified: `grep -c "^- \[ \]" 1605-{1,2,3}.md` → 0/0/0 unchecked items; log entries in `docs/logs/2026/07-22.md` record each closure). **Option D's premise — that the 1605 plans were empty drafts needing retirement — no longer holds.** They are `completed` (executed), which is a *stronger and more accurate* state than `superseded` (retired-without-execution). Marking them `superseded` now would be wrong: it would erase the durable record that they were actually executed (1605-1 closed N4 + F4/N1-arch; 1605-2 closed N2; 1605-3 closed N1 + N3 + F3/F7/F14-verify). Per AGENTS.md Operating Rule 13 (plan-file durability) and the guide's Plan Status Flow semantics, `completed` is the correct terminal state for an executed plan. **The reconciliation therefore reduces to Option C-style header updates only** — the misleading-drafts problem (NF3's core concern) is already resolved by the 1605 executions themselves. Both 0952 audit headers' `Remediation Plans:` lines are rewritten to cite the full execution chain (`1005/1523` → `1605-*` completed → `2026-07-22-0814-*` residual owners) so a cold reader following either header reaches a plan set that matches working-tree reality. **Residual risk:** the 1605 plans retain their original "F1, F4/N1-arch, F5, F8, ..." scope lines in their `> Source:` headers even though most of those findings were pre-resolved by 1005/1523 — this is acceptable because each 1605 plan's "Pre-Resolved By Sibling Plan" / "Confirmed Closed In Working Tree" section explicitly documents the narrowing, so a cold reader who opens a 1605 plan sees the honest scope-narrowing trail rather than a false claim of fresh execution. No further edit needed.
- [x] `Fix`: execute the chosen strategy. If (D) (preferred): for each of `2026-07-21-1605-1.md`, `...-1605-2.md`, `...-1605-3.md`, set `> Plan Status: superseded`, add the supersession pointer line under the header, and tick the F1–F14 phase items as `[x] closed-via-1005/1523`. Also update both 0952 audit headers' `Remediation Plans:` line to cite the executed `1005/1523` set for F1–F14 and the new `2026-07-22-0814-1/2/3` set for the residuals (N1/N2/N3/N4/O1/O3/NF1-O2/NF2/NF3/NF4/F4). If (A)/(B)/(C): apply the corresponding edits with the recorded residual risk.
  - Skill: none
  - Applied: rewrote both 0952 audit headers' `Remediation Plans:` line (multi-audit at `:4`, open-audit at `:4`). Each now cites (i) the original-executed set `1005-1/2/3` + `1523-1` for F1–F14, (ii) the narrowed-residual `1605-1/2/3` plans as `completed` with their actual closures (N4+F4/N1-arch / N2 / N1+N3+F3/F7/F14-verify), and (iii) the `2026-07-22-0814-1/2/3` residual-owner set for the later 0755 re-audit findings (O1, O3, N4-carryforward, NF1–NF4). Both headers end with a note that "the 1605 set was executed as narrowed plans, not retired as superseded drafts" so a future cold reader understands why these plans read `completed` rather than `superseded`. The 1605 plan files themselves were NOT edited (they are already `completed` with accurate scope-narrowing records).
- [x] `Fix` (NF4): if the chosen strategy leaves the `1605` drafts in place (B/C/D), each superseded/retargeted plan's pointer already cites `1005/1523` as the executed set, so the design-doc citations to `1005/1523` plan names (`draft-robustness-design.md` deviation notes citing `1005-2 A5`, `1005-3`, `mdr-remediate-4`) are no longer a contradiction. If strategy (A) is chosen, NF4 is closed by deletion (no contradiction remains).
  - Skill: none
  - Applied: NF4 closed. The design doc (`draft-robustness-design.md:248,424,428`) cites `2026-07-21-1005-3` / `mdr-remediate-3 A1` / `mdr-remediate-4` — these now align with the reconciled 0952 audit headers, which explicitly cite `1005-1/2/3` + `1523-1` as the original execution set. No contradiction remains between design-doc citations and the audit/plan pointer chain. (The 1605 plans, being `completed` and recording their own scope-narrowing vs `1005/1523`, reinforce rather than contradict the design-doc citations.)

Exit Criteria:

- [x] No `1605-*` plan remains `Plan Status: draft` with unchecked boxes claiming ownership of already-closed F1–F14 (verify under strategy D: each `1605-*` reads `Plan Status: superseded` + pointer + F1–F14 items `[x] closed-via-1005/1523`; read each surviving `1605` plan header + phase items).
- [x] Both 0952 audit headers' `Remediation Plans:` line points at the executed set (`1005/1523`) for F1–F14 AND the new residual-owner set (`2026-07-22-0814-1/2/3`) for open items (verify: read-back).
- [x] A cold reader following any 0952 audit header reaches a plan set that matches the working-tree reality (the closure test for NF3).
- [x] `pnpm --prefix tools/mission-driver test` → still 520 pass / 0 fail (traceability edits; no behavior change).
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (`ses_078ccede1ffe4xZwFrgtZuFMcO`) because (B1) Phase 3 Option A (delete `1605` plans) violated the guide's `Plan Status Flow` (sanctions `superseded | replaced | deferred | cancelled`, not deletion) and lacked residual risk; (B2) the NF3 Decision lacked residual risk for any option (guide Rule 9); plus non-blocking S1 (additional stale `30` refs at `EXECUTION-PRINCIPLE.md:169/:479/:579`), S2 (Phase 1 "Decision" was really a `Proof`), S3 (log-entry shape ambiguity). All issues addressed in revision: Phase 3 rewritten with Option D (supersede + pointer + tick items) as the guide-compliant preferred path, Options A/B/C each given explicit residual risk; Phase 1 expanded to a whole-doc `30→8` sweep (`:116-117/:169/:479/:579`) with a `grep` completeness check + adjudication of non-cycle-cap hits, and the "confirm other edges" item retyped `Proof`; Phase 2 Exit Criteria clarified to a single `### 2026-07-22` log section (NF2 bullet first, then Phase 3 closure bullets) per the log guide's one-section-per-day rule; Closure Gates / Exit Criteria updated for `superseded` (not deletion).
- Independent draft review iteration 2: `acceptable as-is` (`ses_078c2bf83ffeFy4cOTewEMXL4b`) — both iteration-1 blocking issues resolved (Option D `superseded` + pointer + tick items is now the guide-compliant preferred path; every option A/B/C/D carries explicit residual risk per Rule 9). All three non-blocking suggestions addressed (whole-doc `30→8` sweep confirmed against live `EXECUTION-PRINCIPLE.md:169/479/579`; Phase 1 Proof retype; single `### 2026-07-22` log section). No new blocking issues; `superseded` semantics and Rule 10 scope-narrowing-with-rationale both satisfied. Consensus reached; plan advanced to `active`.

## Closure Gates

- [x] in-scope owner-doc / log / traceability edits are complete (O1 mermaid 2 drifts; N4 plansRoot; NF2 log; NF3 reconciliation strategy executed; NF4 note or deletion)
- [x] relevant docs are aligned (this plan IS the doc-alignment work; confirm EXECUTION-PRINCIPLE.md, design §4.3.1, audit headers, surviving plans, and logs all agree at closure)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` (529/0 — baseline preserved; plan's 520/0 baseline was from an earlier point, test count grew via N1/N1-D additions in sibling plans, no behavior change), `grep -n "plansRoot" tools/mission-driver/design/draft-robustness-design.md` (1 hit — the deferred-annotation callout, satisfying the "0 [deleted] OR 1 with annotation" branch), `grep -n "30" tools/mission-driver/EXECUTION-PRINCIPLE.md` (3 remaining hits all non-cycle-cap — `:321`/`:532` line-number ranges, `:431` exit code 130; adjudicated in log), read-back of `EXECUTION-PRINCIPLE.md:101-102` (Drift A two-edge split) + the swept `:117-118`/`:169`/`:479`/`:579` (all `8`), read-back of both 0952 audit headers (`Remediation Plans:` now cites full `1005/1523` → `1605` completed → `0814` chain), read-back of each `1605-*` header (`Plan Status: completed` — verified 0 unchecked items; the narrower accurate terminal state than the originally-planned `superseded`)
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent (this plan touches audit files and plan traceability, which is process-level not protected; solo cold-replay fallback is eligible with recorded rationale)
- [x] closure evidence exists in files (the read-backs above ARE the evidence)

## Deferred But Adjudicated

### enablePositionalOptions back-dated plan (NF2)

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: the code change is already landed, tested, and commented. A back-dated plan cannot drive the routing decision it should have driven; the attributed log entry closes the traceability gap honestly without fake plan theater.
- Successor Required: `no` — the forward-routing note in the log entry covers future CLI-surface changes.

## Closure

Status Note: All three phases complete (2026-07-22). Phase 1 closed O1 (EXECUTION-PRINCIPLE.md §3 mermaid Drift A two-edge split + Drift B whole-doc `30→8` sweep at 4 sites; Proof confirmed remaining 8 edges still match live flow; N4 confirmed already closed upstream by sibling mdr-remediate-1). Phase 2 closed NF2 (attributed log entry chosen over back-dated plan; added as first bullet of existing `### 2026-07-22` section). Phase 3 closed NF3+NF4 — strategy adapted to changed reality: the `1605-1/2/3` drafts were independently narrowed + executed + closed between this plan's baseline and execution, so Option D's "mark superseded" premise no longer held; `completed` is the stronger accurate terminal state, so reconciliation reduced to rewriting both 0952 audit headers' `Remediation Plans:` lines to cite the full execution chain (`1005/1523` → `1605` completed → `0814` residual owners). Doc-only / traceability edits — no code / test / prompt / missions files touched. Verification: `pnpm --prefix tools/mission-driver test` → 529 pass / 0 fail (baseline preserved; test count differs from the plan's 520/0 baseline because sibling plans N1/N1-D added tests, not because of any behavior change here).

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay pass (no second reviewer available; non-protected / non-high-risk doc-only / traceability plan per AGENTS.md Reviewer-Availability Fallback; source 0755 audit severity O1 MEDIUM doc-only / NF2 LOW process / NF3+NF4 LOW-MEDIUM traceability).
- Evidence: `docs/logs/2026/07-22.md` mdr-remediate-6 entry (NF2 attribution bullet + plan-closure aggregate bullet); `tools/mission-driver/EXECUTION-PRINCIPLE.md:101-102` (Drift A), `:117-118`/`:169`/`:479`/`:579` (Drift B + sweep); `tools/mission-driver/design/draft-robustness-design.md:322` (N4 callout, already in place from mdr-remediate-1); `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-multi-audit-*.md:4` + `2026-07-21-0952-open-audit-*.md:4` (reconciled `Remediation Plans:` lines). Grep evidence: `grep -n "30" tools/mission-driver/EXECUTION-PRINCIPLE.md` → 3 non-cycle-cap hits (adjudicated); `grep -n "plansRoot" tools/mission-driver/design/draft-robustness-design.md` → 1 hit (deferred-annotation callout); `grep -c "^- \[ \]" 1605-{1,2,3}.md` → 0/0/0 (all items ticked).

Follow-up:

- Pre-existing flaky test `test/subflow-incremental.test.js:204` Case C (timing-sensitive Promise-park latch, visit-2 item-0 incremental append race) observed 1 flaky fail during this execution but stable on re-run. Out of scope for this doc-only plan; not promoted to a follow-up plan unless it recurs on a code-touching run.
