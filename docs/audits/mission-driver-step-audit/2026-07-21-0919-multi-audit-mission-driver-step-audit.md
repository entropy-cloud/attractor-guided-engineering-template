> Audit Status: open
> Audit Type: multi-dimensional
> Mission: mission-driver-step-audit

# Multi-Dimensional Audit — `tools/mission-driver/` (mission-driver-step-audit)

- **Date**: 2026-07-21 09:19
- **Auditor**: opencode solo cold-replay (multi-dimensional audit prompt)
- **Scope**: `tools/mission-driver/` — code (`src/`), config (`flows/`, `package.json`), tests (`test/`), prompts, public contracts (CLI flags, REST API, run-state.json schema, event schema), and design docs.
- **Cross-reference**: `tools/mission-driver/design/step-execution-and-audit-count-design.md` (proposal), `tools/mission-driver/design/mission-driver-flow-design.md`, `tools/mission-driver/CONTEXT.md`, `tools/mission-driver/README.md`, `docs/plans/mission-driver-step-audit/*`, `docs/architecture/*`, `docs/backlog/mission-driver-step-audit-roadmap.md`.
- **Method**: followed `docs/skills/multi-dimensional-audit-prompt.md` (default generic prompt; this repository has not yet tuned a project-specific multi-audit prompt, which is acceptable per the prompt's preamble).

## Verification Snapshot (live-replayed during this audit)

| Command                                                | Result                                         |
| ------------------------------------------------------ | ---------------------------------------------- |
| `pnpm --prefix tools/mission-driver test`              | **470 pass / 0 fail** (15.3s)                  |
| `pnpm --prefix tools/mission-driver run lint:prompts`  | OK                                             |
| `pnpm --prefix tools/mission-driver/web run typecheck` | clean                                          |

All WI1–WI5 closure claims re-verified green during this audit. Implementation in `src/engine.js`, `src/main.js`, `src/monitor.js`, `src/flow-loader.js`, `src/config.js`, `flows/mission-driver.json`, `prompts/draft-from-roadmap.md`, `web/src/**` matches the design doc's §4.1/§4.2/§4.3/§4.4 contracts and the five plans' closure evidence.

## Findings

Findings ordered by severity. Severities follow the audit prompt's "blocking vs residual" framing.

### F1 — [MEDIUM-HIGH] Design doc `step-execution-and-audit-count-design.md` Status field drifts from implementation reality

- **Dimension**: owner-doc alignment · architecture/boundary impact · requirement correctness.
- **File**: `tools/mission-driver/design/step-execution-and-audit-count-design.md:5`
- **Observed**:
  ```
  **Status**: proposal (analysis + recommended solution, no code change yet)
  ```
- **Reality**: All five work items authorized by this design (WI1 audit-count persist, WI2 single-step fix, WI3 `--from-step`, WI4 audit-gate + prompt rewrite, WI5 observability) are **`Plan Status: completed`**, all five roadmap rows are `done`, all closure evidence points at this design as the controlling owner doc, and the live repo shows full implementation (`engine.js` auditRound field + `_shouldCompleteOnAuditQuota` gate + `_finalizeWorkflow` mapping; `flow-loader.js` `_isMissionLevelAudit`; `flows/mission-driver.json` `DRAFT_PLANS` without `done`; `prompts/draft-from-roadmap.md` two-marker contract; `web/src/**` types + tag mappings).
- **Why this is a finding**: AGE attractor principle (AGENTS.md "Documentation Ownership" + `docs/architecture/` owns "stable technical and module-boundary truth") says design docs are durable truth. A future agent reading this design cold would correctly conclude "this is a proposal; nothing implemented yet" and could plausibly re-implement or duplicate the work. The design doc is the authoritative attractor for every closure audit of WI1–WI5 (each plan's `Related:` cites its §4.x sections as owner doc), so the staleness propagates into every consumer.
- **Source-of-truth check**: WI4 plan Phase 6 note (line 237) and WI5 plan Phase 6 note (line 208) both explicitly punted this Status sync:
  > 设计文档 `step-execution-and-audit-count-design.md` 的"Status"字段（现为 `proposal`）是否同步标注"§4.2 已落地"由 WI4/WI5 closure 时统一处理，**不**强制在本 plan 范围；若超期未同步，作为 follow-up 跟踪。
  
  Both notes promised a follow-up tracking entry "if overdue". As of this audit, both WI4 and WI5 are closed, no follow-up tracking entry exists in either plan's `Deferred But Adjudicated` section (the entries only mention Phase 5's unrelated audit-type classification as deferred), and the design doc Status is unchanged. **The promised follow-up was silently dropped** — this violates AGE's "no silent follow-up drops" expectation (Anti-Slacking Rule 11 applies in spirit even though Phase 6 annotations used a `> 注:` quote to dodge the literal "可选" ban).
- **Recommended fix**: Update the `**Status**:` line in `step-execution-and-audit-count-design.md:5` from `proposal (analysis + recommended solution, no code change yet)` to `implemented` (or `active — §4.1/§4.2/§4.3/§4.4 landed via WI1–WI5, see docs/plans/mission-driver-step-audit/`). Optionally annotate §1, §2, §4.2.2 sections as "pre-WI4 baseline (historical root-cause)" so the analysis-vs-decision distinction stays legible.
- **Severity rationale**: Medium-High, not Critical, because (a) the design doc's normative content (§4.x decisions) is still accurate; only the status field lies; (b) all consumers are internal to this repo; (c) a one-line edit closes the gap. But it is **blocking** a clean multi-dimensional pass because it is a documented-contract drift the audit prompt explicitly asks to surface.

### F2 — [MEDIUM] Design doc body still describes pre-WI4 behavior as "current" in analysis sections

- **Dimension**: owner-doc alignment · regression risk.
- **Files**:
  - `tools/mission-driver/design/step-execution-and-audit-count-design.md:41` — "AI 自行决定输出 `created` / `nothing` / `done` 三种 marker" (the `done` marker was removed by WI4).
  - Same file §1.3 / §2.3 / §4.1.4-A — describes `_shouldCompleteOnAuditQuota` / `auditRound` / `maxAuditRounds` as proposals ("建议…", "推荐…", "方案 A/B/C/D") when they are now the implemented behavior.
- **Why this is a finding**: Same root cause as F1. The doc's status field says "proposal", and the body matches that framing. Once F1 is fixed, the body needs at minimum a header annotation that §0–§2 are "problem statement as of 2026-07-20, pre-WI1–WI5 baseline" and §4 is "implemented as of 2026-07-20/21".
- **Severity**: Medium (compounding). A reader who skips the Status field and reads §2.3 would conclude plan-level vs mission-level audit confusion is an **open** problem; in fact it is closed by the WI4 audit-gate + WI4 Phase 5 `_isMissionLevelAudit` filter.

### F3 — [LOW-MEDIUM] `mission-design.md` deep-audit-loop summary uses stale `maxCycleVisits` value and omits audit-gate

- **Dimension**: owner-doc alignment.
- **File**: `tools/mission-driver/design/mission-design.md:209`
  > `DRAFT_PLANS` `nothing` -> `AUDIT` -> `DRAFT_PLANS` -> ... until `maxAuditRounds` (default 3) or `maxCycleVisits` (default 30).
- **Reality**:
  - `flows/mission-driver.json:4` declares `"maxCycleVisits": 8` (also documented in `README.md` cycle-limits table).
  - The WI4 audit-gate short-circuit (DRAFT_PLANS `nothing` + quota exhausted + no open audits/active plans → `completed` without re-entering DEEP_AUDIT) is not mentioned.
- **Why this is a finding**: Two-step drift — wrong numeric, missing decision path. The sibling owner doc `mission-driver-flow-design.md` was updated correctly in WI4 Phase 6 (its §3 mermaid + DRAFT_PLANS step description now show the audit-gate edge); `mission-design.md` was not touched in WI4 Phase 6's owner-doc sync.
- **Severity**: Low-Medium. Informational doc, but it is the doc most new readers will hit first when learning the loop shape, and the numeric (30 vs 8) could mislead tuning decisions.

### F4 — [LOW] Implicit blockquote-prefix contract on audit files is undocumented

- **Dimension**: architecture/boundary impact · public contract.
- **Files**:
  - `tools/mission-driver/src/flow-loader.js:36,40` — `AUDIT_STATUS_RE` / `AUDIT_TYPE_RE` both require a leading `>` (Markdown blockquote):
    ```js
    const AUDIT_STATUS_RE = /^>\s*\*{0,2}Audit\s+Status\*{0,2}:\s*\*{0,2}(.+?)\*{0,2}\s*$/m;
    const AUDIT_TYPE_RE  = /^>\s*\*{0,2}Audit\s+Type\*{0,2}:\s*\*{0,2}(.+?)\*{0,2}\s*$/m;
    ```
  - `prompts/multi-audit.md` / `prompts/open-audit.md` correctly emit the `>` prefix.
- **Why this is a finding**: The `openAudits()` expression function — and therefore the audit-gate's `openAudits().length === 0` truth-table row 3 — depends on this `>` prefix being present. Any external tool, human, or future prompt that writes an audit file with YAML frontmatter (`Audit Status: open` without `>`) would be **silently invisible** to the gate. This contract is enforced only by regex shape and prompt template; no architecture or owner doc states "audit status / type headers MUST be emitted as Markdown blockquote lines".
- **Severity**: Low (no current violator; both producing prompts comply). But the contract is public (any docs/audits/ writer is a consumer) and should be documented once in either `docs/audits/00-audit-execution-guide.md` or `CONTEXT.md`'s audit section.

### F5 — [LOW] Filename-pattern fallback in `_isMissionLevelAudit` is narrow

- **Dimension**: regression risk · contract correctness.
- **File**: `tools/mission-driver/src/flow-loader.js:140-143`
  ```js
  const base = basename(filePath).toLowerCase();
  if (/[ _-]closure-audit|[ _-]plan-audit/.test(base)) return false;
  if (/[ _-]multi-audit|[ _-]open-audit/.test(base)) return true;
  return true;
  ```
- **Observed**: The fallback only triggers when no `> Audit Type:` header is present. The WI4 Phase 5 Explore (recorded in plan `2026-07-20-1559-1-draft-plans-audit-gate.md:189-202`) confirmed the producing prompts all emit the header, so this fallback is dormant in the default config. But:
  - The pattern requires a separator (`[ _-]`) before the keyword. A file named `closure-audit-2026-07-21.md` matches; a file named `closureaudit.md` does not (rare but possible).
  - The default-to-`true` branch (line 143) intentionally preserves backward compat with pre-WI4 audits that never declared a type. This is the documented decision and is correct (better false-positive than silently drop an open audit).
- **Severity**: Low (intentional design, documented in helper comment). No drift; recording as residual risk for the next reviewer who tweaks the regex.

### F6 — [LOW] WI3 deferred "subflow-internal step as entry" item is well-formed but its trigger is human-subjective

- **Dimension**: backlog/autonomy-policy drift.
- **File**: `docs/plans/mission-driver-step-audit/2026-07-20-1147-3-from-step-entry.md` (Deferred section, line 156)
  > Successor Required: no — 重新开启条件：若出现明确用户请求点名子流程内部 step（如 `MULTI_AUDIT`）作为入口，则重新评估。当前无此类诉求。
- **Observed**: This deferred item satisfies the Anti-Slacking Rule (named trigger event, named successor decision). No drift. The only residual is that the trigger ("明确用户请求点名") is human-subjective and cannot be auto-detected — but that is the correct shape for a product gap that needs human escalation.
- **Severity**: Low (informational; no action).

### F7 — [CLEAN] Verification adequacy, routing, skill selection, autonomy policy

- **Verification adequacy**: 470/470 tests green; `web typecheck` clean; `lint:prompts` OK. WI1–WI5 each have dedicated test files (`audit-count.test.js`, `single-step.test.js`, `from-step.test.js`, `draft-plans-audit-gate.test.js`) plus regression coverage in `prompt-markers.test.js`, `analyze-run.test.js`, `monitor.test.js`, `audits-dir.test.js`. Coverage matches the design's truth-table §4.2.4 (all four rows + zero-intrusion + legacy `done` marker).
- **Routing correctness**: All five plans correctly self-classified as `implementation-only change` (WI1/WI2/WI3/WI5) or `architecture change` (WI4 — flow JSON + engine + prompt co-evolution). WI4's `architecture change` routing is justified because it changes mission-exit conditions.
- **Skill selection correctness**: Every plan records `Skill: none` per item, with explicit justification (design doc's §4.x specifies the method directly; no matching reusable skill in `docs/skills/`). This satisfies AGENTS.md "Skill Usage Rule" (skill selected only when it matches the work method, not the business label).
- **Closure audits**: Every plan records independent draft review (iterations + accept decision) + solo cold-replay closure pass. WI1/WI4 went through `needs revision → accept` cycles; WI2/WI3/WI5 went through `acceptable as-is → accept`. Reviewer-Availability Fallback applied per AGENTS.md (non-protected, non-high-risk).
- **Autonomy policy**: AI autonomy defaulted to `implement`; protected areas (none here — no API/DB/auth/payment/data-deletion paths) were not touched. Owner-doc sync obligations recorded per plan.
- **Daily logs**: `docs/logs/2026/07-20.md` (WI1–WI4) and `docs/logs/2026/07-21.md` (WI5) both updated with full evidence references; satisfies AGENTS.md Operating Rule 7.
- **Severity**: Clean (no action).

## Residual Risks by Dimension

| Dimension                              | Residual risk                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Requirement correctness                | None beyond F1/F2 (design doc says "proposal" for shipped behavior).                                                       |
| Owner-doc alignment                    | F1 (Status field), F2 (body §1/§2/§4 stale framing), F3 (mission-design.md numeric + missing audit-gate).                  |
| Architecture / boundary impact         | F4 (implicit `>` prefix contract); otherwise engine core zero-dep invariant preserved.                                     |
| Verification adequacy                  | Clean (470/470). `test/from-step.test.js` Case 3 has a known subprocess-timing flake under load (acknowledged in WI4 log). |
| Regression risk                        | F5 (regex narrowness); low impact due to default-include fallback.                                                         |
| Routing / skill-selection correctness  | Clean.                                                                                                                     |
| Backlog / autonomy-policy drift        | F6 (subjective trigger) — well-formed.                                                                                     |

## Recommendation

**needs revision** — F1 (and its compound F2) is a documented-contract drift between the design owner doc and the implementation. The fix is a one-line Status update plus optional section-header annotations. F3 is a one-paragraph touch-up in `mission-design.md`. F4 is a doc-only addition to `docs/audits/00-audit-execution-guide.md` or `CONTEXT.md`. F5/F6 are residual risks for future reviewers, no action required.

Once F1 is closed (design doc `Status:` updated from `proposal` to `implemented`/`active` with section annotations), this audit would flip to **passes multi-dimensional audit**.

## Files Touched By This Audit

- This file (write): `docs/audits/mission-driver-step-audit/2026-07-21-0919-multi-audit-mission-driver-step-audit.md`

No code, config, flow, prompt, or test file was modified by this audit. All evidence cited is from live reads of the repo and live test/typecheck/lint runs performed during the audit.

<AI_STEP_RESULT>issues</AI_STEP_RESULT>
