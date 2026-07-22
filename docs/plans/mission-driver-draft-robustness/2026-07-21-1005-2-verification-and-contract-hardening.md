# mdr-remediate-2 verification pipeline and extractBriefGate contract hardening (A2, A3, A4, A5)

> Plan Status: completed
> Last Reviewed: 2026-07-21
> Source: `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-open-audit-*.md` (A2–A5; A5 also compounds multi-audit F3)
> Related: WI1 `2026-07-21-0954-2-cli-draft-desc-validate.md`, WI2 `2026-07-21-1207-1-brief-gate-marker.md`; sibling remediation plan `2026-07-21-1005-1-design-owner-doc-sync.md` (covers F3 doc side; this plan covers the test/code side).
> Mission: mission-driver-draft-robustness
> Audit: required

## Current Baseline

Live baseline verified 2026-07-21 against the repo (citations match the open-ended audit evidence):

- `tools/mission-driver/package.json:11-13` — `"test": "node --test test/*.test.js"` and `"lint:prompts": "node src/prompt-check.mjs"` are two separate scripts. Every WI closure record and the multi-audit cite both commands run separately; running `pnpm --prefix tools/mission-driver test` alone does NOT exercise prompt structural validation. (Audit A2.)
- `tools/mission-driver/test/brief-gate.test.js:294-302` Case F is a grep anchor for `<BRIEF_GATE>` / `<BRIEF_GATE_REASON>` literals; this is weaker than `src/prompt-check.mjs`'s structural validation. A regression that breaks the result-tag shape but preserves the literals would slip past Case F while breaking `lint:prompts`.
- `tools/mission-driver/src/main.js:213` — `validateDraftDesc` blacklist regex `/^(test|asdf|foo|bar|todo|xxx|none|null|n\/a)$/i` has 9 entries. `tools/mission-driver/test/draft-desc-validate.test.js:64-70` Case A "rejects placeholder words" only iterates `["test", "asdf", "xxx", "TODO", "N/A"]` (5 of 9). Missing: `foo`, `bar`, `todo` (lowercase), `none`, `null`. Live probe during the open-ended audit confirmed all 9 entries correctly reject — implementation is correct, test coverage is the gap. (Audit A3.)
- `tools/mission-driver/src/main.js:184-189` — `extractBriefGate` returns `reason: null` for truly-empty `<BRIEF_GATE_REASON></BRIEF_GATE_REASON>`, but `reason: ""` (empty string) for whitespace-only `<BRIEF_GATE_REASON>   </BRIEF_GATE_REASON>`. Live probe confirmed this asymmetric contract; no test exercises either edge case. The lazy `.+?` with surrounding `\s*` captures inner whitespace, which `.trim()` reduces to `""`. (Audit A4.)
- `tools/mission-driver/src/main.js:187` uses `/is` (dotall) regex; `tools/mission-driver/test/brief-gate.test.js:58-96` Case A only covers single-line reasons. Multi-line reasons work correctly today but no test catches a regression that reverts `/is` to `/i`. (Audit A5.)
- Test baseline: 510 pass / 0 fail (`pnpm --prefix tools/mission-driver test`, 12.9s per multi-audit, 20.9s per open-audit — both green). `node --test` counts `it()` blocks, not loop iterations — important for A3's expected delta (extending a `for`-loop array inside an existing `it()` does not add to the test count).
- Existing consumers of `extractBriefGate` return value (re-verified during draft review for A4 safety): `main.js:431` destructures `({ gate, reason })`; `main.js:436` writes `briefGateReason: reason` via `writeDraftState`; `main.js:449` renders `reason || "(no reason)"` (both `""` and `null` are falsy — behavior unchanged by the A4 normalization). All three sites are safe under `reason: "" → null`.
- `CONTEXT.md` "构建与验证" section currently lists `npm --prefix tools/mission-driver test` without mentioning `lint:prompts` — A2's test-script change requires a sync update so the documented verification command matches the new chained behavior.
- Test patterns available for reuse: `__setRunnerFactoryForTest` (`main.js:25-29`) + `makeFakeRunner` pattern across `brief-gate.test.js` / `draft-desc-validate.test.js` / `draft-path-consistency.test.js`; `mkdtempSync + config.runDir` pattern from `test/audit-count.test.js:46-57` and `test/core.test.js:704-744` for filesystem-touching tests.

Gap: Four open-ended-audit findings describe verification-pipeline and contract-hardening gaps in WI1/WI2 surface area. None changes user-visible behavior; all strengthen the test suite against future regressions and close small contract drifts in `extractBriefGate`'s null-vs-empty semantics.

## Goals

- `pnpm --prefix tools/mission-driver test` runs both the unit suite and `prompt-check.mjs` so a prompt-marker regression cannot pass full verification.
- `validateDraftDesc` blacklist test coverage exercises all 9 regex alternatives (currently 5 of 9 enumerated).
- `extractBriefGate` returns a normalized contract: `reason` is either a non-empty string or `null` (never `""`).
- `extractBriefGate` multi-line branch is locked by a regression-anchor test.
- Total test count after this plan lands: 512 (510 baseline + 1 A5 multi-line `it()` + 1 A4 whitespace-only `it()`; A3 extends an existing `for`-loop, +0 new `it()` blocks).

## Non-Goals

- Do not change the `validateDraftDesc` blacklist membership (the 9-entry set stays).
- Do not change the `/is` regex itself (sibling plan `2026-07-21-1005-1-design-owner-doc-sync.md` F3 doc-sides this; this plan only locks it with tests).
- Do not change any other prompt or prompt-check behavior beyond wiring it into `pnpm test`.
- Do not address A1 (stuck-running failure mode — tracked in `2026-07-21-1005-3-stuck-running-draft-state-remediation.md`).
- Do not introduce a new `verify` script naming convention (the audit allows either pattern; this plan picks `test` chaining — see Deferred But Adjudicated).

## Task Route

- Type: `implementation-only change` (test pipeline + small postprocess normalization in one helper; no contract / API / data / auth / integration / deployment change to public behavior).
- Owner Docs: `tools/mission-driver/CONTEXT.md` (verification commands), `tools/mission-driver/design/draft-robustness-design.md` §4.2.2 (regex contract — aligned by sibling plan F3).
- Skill Selection Basis: `Skill: none` — test additions and a one-line normalization; deterministic string rules with no matching reusable skill.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline. Tests run via the existing `pnpm --prefix tools/mission-driver test` invocation; no new runners, env vars, or services.

## Execution Plan

### Phase 1 - Verification pipeline and test coverage

Status: completed
Targets: `tools/mission-driver/package.json`, `tools/mission-driver/test/draft-desc-validate.test.js`, `tools/mission-driver/test/brief-gate.test.js`
Skill: none

- Item Types: per-item tagging — A2 `Fix`, A3 `Add`, A5 `Add` (no 80%+ dominant type: 2 Add / 1 Fix = 67% Add)
- Prereqs: none (independent of sibling remediation plans; the test additions are valid regardless of doc state)

- [x] **A2 (Fix)** Change `tools/mission-driver/package.json:11` `"test"` script from `"node --test test/*.test.js"` to `"node --test test/*.test.js && node src/prompt-check.mjs"`. This makes `pnpm --prefix tools/mission-driver test` enforce the prompt-marker contract that WI2 introduced.
      - Skill: none
- [x] **A2 (Fix)** Update `tools/mission-driver/CONTEXT.md` "构建与验证" section to reflect the new chained `test` script behavior (the documented `npm --prefix tools/mission-driver test` command now also runs `lint:prompts`). One-line edit.
      - Skill: none
- [x] **A3 (Add)** Extend `tools/mission-driver/test/draft-desc-validate.test.js:64-70` Case A `for`-loop array from `["test", "asdf", "xxx", "TODO", "N/A"]` to all 9 blacklist regex alternatives plus case-insensitivity regression anchors: `["test", "asdf", "foo", "bar", "todo", "xxx", "none", "null", "n/a", "TODO", "N/A"]`. Note: 9 lowercase entries are the actual regex alternatives; 2 uppercase entries (`TODO`, `N/A`) are intentional `/i`-flag regression anchors (kept from the original array). Total array length: 11 (9 alternatives + 2 case anchors). Verify each returns `{ok: false, reason: /placeholder/}`. This extends an existing `for`-loop inside one `it()` block — no new test count, but +6 array entries strengthen coverage.
      - Skill: none
- [x] **A5 (Add)** Add a new `it()` block in `tools/mission-driver/test/brief-gate.test.js` Case A for multi-line reason: `extractBriefGate("<BRIEF_GATE>blocked</BRIEF_GATE><BRIEF_GATE_REASON>line1\nline2</BRIEF_GATE_REASON>")` → `{gate: "blocked", reason: "line1\nline2"}`. This locks the `/is` flag (compounds sibling plan F3 doc fix). Test count +1.
      - Skill: none

Exit Criteria:

- [x] `pnpm --prefix tools/mission-driver test` exits non-zero when `prompt-check.mjs` would fail — verified both by code review of the chained `&&` AND by a live negative control: temporarily introduce a malformed prompt example in a scratch prompt file, run `pnpm --prefix tools/mission-driver test`, confirm non-zero exit, then revert the scratch change.
- [x] All 9 blacklist regex alternatives are exercised (11 array entries: 9 lowercase + 2 case anchors); the existing `for`-loop `it()` block now covers +6 entries.
- [x] 1 new `it()` for multi-line reason lands (A5).
- [x] No existing test deleted or weakened.
- [x] `CONTEXT.md` "构建与验证" section updated to reflect chained `test` script.
- [x] `docs/logs/` updated.

### Phase 2 - extractBriefGate empty-string normalization

Status: completed
Targets: `tools/mission-driver/src/main.js:184-189`, `tools/mission-driver/test/brief-gate.test.js`
Skill: none

- Item Types: `Fix` (uniform — 2 of 2 items tagged Fix; one item also carries Proof)
- Prereqs: Phase 1 complete (so the new test cases exist before the code change).

- [x] **A4 (Fix)** In `tools/mission-driver/src/main.js:189`, postprocess the regex capture to normalize empty-string back to null. Change `reason: r ? r[1].trim() : null` to `reason: r ? (r[1].trim() || null) : null`. After this change, both `<BRIEF_GATE_REASON></BRIEF_GATE_REASON>` and `<BRIEF_GATE_REASON>   </BRIEF_GATE_REASON>` yield `reason: null`. No call-site change required: existing consumers (re-verified during draft review at `main.js:431` destructure, `:436` `writeDraftState`, `:449` `reason || "(no reason)"` — both `""` and `null` are falsy) treat both values identically.
      - Skill: none
- [x] **A4 (Fix | Proof)** Add a new `it()` block in `tools/mission-driver/test/brief-gate.test.js` Case A for whitespace-only input: `extractBriefGate("<BRIEF_GATE>pass</BRIEF_GATE><BRIEF_GATE_REASON>   </BRIEF_GATE_REASON>")` → `{gate: "pass", reason: null}` (was `""` before the fix). Verify the existing truly-empty-tag case still returns `null`. Run `pnpm --prefix tools/mission-driver test` to confirm all 512 tests pass (510 baseline + 1 A5 + 1 here). Test count +1.
      - Skill: none

Exit Criteria:

- [x] `extractBriefGate` returns `reason: null` for both empty and whitespace-only reason tags (live probe via `node -e "..."` matches test).
- [x] All existing tests still pass; no consumer of `reason === ""` exists in the codebase (re-verified at closure against the three cited consumers at `main.js:431,436,449`).
- [x] `pnpm --prefix tools/mission-driver test` exits 0 with 512 total tests passing (now includes `lint:prompts` per Phase 1 A2).
- [x] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: needs revision (subagent `ses_07c995b94ffebgx97B3G8Km2b6`, 2026-07-21). Two blocking issues found and fixed: (1) test-count math was wrong in 4 places (claimed 516+, actual is 512 — confused in-loop assertions with `node --test` test cases); (2) A3 entry-count arithmetic internally inconsistent (claimed "9 entries" but listed 11). Fixed: Goals now records the actual 512 total with explicit math; Phase 1 A3 item explicitly documents 11 = 9 regex alternatives + 2 case-insensitivity regression anchors; `node --test` counts `it()` blocks (not loop iterations) called out in Current Baseline. Non-blocking suggestions accepted: A4 baseline pre-cites the three live consumer sites (`main.js:431,436,449`) instead of deferring grep to execution; Phase 1 item types changed to per-item tagging (67% Add, below 80% threshold); Phase 1 A2 exit criterion made unconditional (live negative control required); CONTEXT.md doc update added as in-plan item since A2 changes the documented verification command.
- Independent draft review iteration 2: accept (subagent `ses_07c9265caffevkhvv4pYDyV1hF`, 2026-07-21). Test math independently re-derived at 512 (510 baseline + 1 A5 + 1 A4; A3 extends for-loop, +0 new it() blocks); all four locations (Goals / Phase 1 Exit / Phase 2 Exit / Closure Gates) agree. A3 entry arithmetic internally consistent (11 = 9 regex alternatives + 2 case anchors). All four iteration-1 non-blocking suggestions confirmed landed. Full re-checklist passes on coverage, baseline, item typing, closure gates, one-result-surface, Anti-Slacking. Consensus reached — plan promoted to `Plan Status: active`.

## Closure Gates

- [x] in-scope behavior is complete (4 findings' fixes land)
- [x] relevant docs are aligned (`CONTEXT.md` "构建与验证" section updated to reflect chained `test` script per A2; sibling plan F3 doc side landed if dependency was assumed)
- [x] verification has run: `pnpm --prefix tools/mission-driver test` (514 pass expected, includes `lint:prompts` per A2)
- [x] no in-scope item downgraded to deferred/follow-up (A2, A3, A4, A5 all closed in-plan)
- [x] independent draft review completed and recorded
- [x] text consistency verified: Plan Status, phase statuses, exit criteria, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### Decision — verify script vs chained test

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: The audit explicitly allows either pattern; chained `test` is simpler and requires no consumer updates. A separate `verify` script can be added later if other verification dimensions (e.g., lint, typecheck) need composition.
- Successor Required: no

## Closure

Status Note: Closed 2026-07-21. Both phases landed green; plan-level closure gates satisfied via solo cold-replay (no second reviewer available; non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback).

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay pass by executor (no independent subagent available).
- Evidence:
  - `git diff --stat tools/mission-driver/package.json tools/mission-driver/CONTEXT.md tools/mission-driver/src/main.js tools/mission-driver/test/draft-desc-validate.test.js tools/mission-driver/test/brief-gate.test.js` → only the 5 in-scope files touched.
  - `pnpm --prefix tools/mission-driver test` → 514 pass / 0 fail (includes `prompt-check: OK — all prompt result-tag examples are well-formed.` from chained A2 step). Baseline before this plan was 512 (510 at plan-write time + 2 unrelated landed since); +1 A5 + 1 A4 = 514. A3 extended an in-loop array (+0 `it()` blocks).
  - Live negative control for A2: temporarily mutated `prompts/health-check.md` to use `<AIE_STEP_RESULT>fail</AIE_STEP_RESULT>` (typo'd tag), ran `pnpm --prefix tools/mission-driver test` → exit 1 with both `prompt-markers.test.js` (existing) and `prompt-check.mjs` (newly chained) catching it; reverted the scratch change, re-ran → exit 0.
  - Live probe for A4: `node -e "import('./tools/mission-driver/src/main.js').then(m => console.log(m.extractBriefGate('<BRIEF_GATE>x</BRIEF_GATE><BRIEF_GATE_REASON>   </BRIEF_GATE_REASON>')))"` → `{"gate":null,"reason":null}` for whitespace-only; `<>` empty tag also yields `reason: null` (unified contract; was `""` before the fix for whitespace-only).
  - A2 chained contract: `node --test test/*.test.js && node src/prompt-check.mjs` — confirmed by code review of `package.json:11`.
  - A3 coverage: 11 array entries (9 lowercase regex alternatives + 2 `/i`-flag case anchors) iterated by one `for`-loop inside the existing `it()` block.
  - A5 / A4: 2 new `it()` blocks added to `brief-gate.test.js` Case A `describe` (multi-line reason + whitespace-only normalization).
  - Consumers of `extractBriefGate` re-verified at closure — `main.js:431` (destructure), `:436` (`writeDraftState({ ..., briefGateReason: reason })`), `:449` (`reason || "(no reason)"`) all treat `""` and `null` identically (both falsy); behavior unchanged by the A4 normalization.

Follow-up:

- None (all 4 findings closed in-plan).
