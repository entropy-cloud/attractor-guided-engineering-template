> Audit Status: planned
> Audit Type: open-ended
> Mission: mission-driver-actionable-fixes

# Open-Ended Adversarial Audit — mission-driver-actionable-fixes

> Auditor: solo open-ended audit pass (mission subflow `2026-07-29-162002-mission-driver`, OPEN_AUDIT step)
> Date: 2026-07-29
> Scope: probe `tools/mission-driver/` (code, config, tests, docs) for contract drift, dead code, missing error handling, framework anti-patterns, and convention violations introduced or touched by the four work items (#1 approved marker alias, #2 per-mission `promptsDir`, #3 configurable CHECK gate, #4 draft directory references).
> Method: read AGENTS.md, project-context.md, conventions.md, the analysis + roadmap + 4 plans completely; read the live changed code + flows + prompts + tests completely; reran the full verification suite.

## Verification baseline (re-run by this audit)

- `pnpm --prefix tools/mission-driver test` → **597 pass / 0 fail**, `prompt-check: OK`.
- All four fixes are present in live code and covered by dedicated tests (`forEach-marker-alias.test.js`, `prompts-dir.test.js`, `check-configurable.test.js`; #4 pinned by existing `draft-path-consistency` / `brief-gate` constraint tests).
- OPT-4 `check-lightweight.test.js` preserved unchanged and green — `fail`/`onError`/`onMaxRetries` stay terminal; `needs_fix` is purely additive.

## Verdict

**passes open-ended audit** — no P0/blocking issue found. One P1 consistency gap and two P2 nits are recorded below. Residual unknowns that deserve continued watchfulness are listed at the end.

## Findings (severity order)

### [P1] `commands.check` is not surfaced in the mission-generation template — feature is invisible to the primary `draft` creation path, and `extends` shallow-merge actively drops the base default

Justification: material contract drift between a delivered feature (mdr-fix-3) and its only generation surface; non-blocking (graceful fallback) but should be fixed.

Evidence (all verified against live code):

- `missions/base.json:10` ships `"check": ""` as the shared default — the whole point of mdr-fix-3 was to let each project configure a deterministic-state gate command (user intent, per analysis #3: "对于 Java 项目，配置 mvn build 之类的").
- `tools/mission-driver/prompts/mission-draft.md:39-44` — the `commands` JSON example shown to the `draft` agent lists only `test` / `build` / `lint` / `typecheck`. No `check`. (Confirmed by full-text search: the only "check" substring in the file is inside `typecheck`.)
- `tools/mission-driver/prompts/mission-draft.md:53-58` — the Notes section documents `plansDir`, `flowName`, `moduleDir`, `prompts.multiAudit/openAudit`, `commitFormat`, but says nothing about `check` / `commands.check`.
- `tools/mission-driver/src/mission-check.mjs:48` `resolveExtends` does a **shallow** merge (`{ ...resolved, ...localOverrides, ...missionRest }`), and `CONTEXT.md` "关键约束" explicitly states nested objects like `commands` are wholly replaced, not deep-merged. So a mission generated via `draft` that sets its own `commands` (exactly what the template tells the agent to do) **drops `base.json`'s `check` key entirely** — not even the empty-string default survives.
- `tools/mission-driver/src/main.js:700` `checkCmd: g.commands.check || ""` handles the missing key gracefully (`undefined || ""` → git-status fallback), so there is no crash. But the net effect is that the configurable-check feature is **undiscoverable** through the primary mission-creation entry point, and the base default is silently lost for any generated mission that customizes `commands`.

Why closure missed it: mdr-fix-3's closure gates checked `CONTEXT.md` (engine-facing context) as the owner-doc alignment, but `mission-draft.md` (the user/agent-facing generation contract) was never in scope of any of the four plans. The result is a feature that works only when a user hand-edits `mission.json`.

Suggested fix (small, low-risk): add `"check": "{optional deterministic-state gate command, e.g. mvn clean compile; empty/omitted = git conflict-marker fallback}"` to the `commands` example in `mission-draft.md:39-44` and a one-line Note alongside the existing command notes explaining when to set it. No code change required; `prompt-check.mjs` does not lint non-marker prose so verification stays green.

### [P2] `context-map.mjs` `EXPECTED_VARS` line-number comments are stale (including the one mdr-fix-3 added)

Justification: cosmetic comment rot; the drift gate keys off live source extraction (`extractVarsKeysFromMainJs`), not these comments, so behavior is unaffected.

Evidence:

- `src/context-map.mjs:90` `"checkCmd", // main.js:537` — actual line is `src/main.js:700` (`checkCmd: g.commands.check || "",`). This stale reference was introduced with the mdr-fix-3 registration.
- `src/context-map.mjs:91-92` both annotate `// main.js:538` (for `commitFormat` and `multiAuditPrompt`) — duplicate + inaccurate.
- The surrounding `// main.js:5NN` annotations are generally drifted relative to current `main.js` (the actionable-fixes work grew the file). The header comment at `context-map.mjs:71-74` already acknowledges these are point-in-time references, so this is low-priority hygiene, not a defect.

### [P2] `loadSubFlow` retains the dead `subflowDir` search-dir branch (pre-existing, explicitly adjudicated)

Justification: dead code, but pre-existing (not introduced by this mission) and the mdr-fix-2 plan deliberately preserved it; recorded for completeness, not actionable against this mission.

Evidence:

- `src/flow-loader.js:325-326` reads `this?.config?.subflowDir` and pushes it into `searchDirs`, but `src/config.js` never produces a `subflowDir` field, so the branch is unreachable in production. The mdr-fix-2 plan's Decision note explicitly flagged this ("`loadSubFlow` also reads `this?.config?.subflowDir`, but `config.js` never produces that field today (that branch is currently dead)") and chose to preserve it to keep the slice focused. Re-flagging only so a future engine-hardening pass can collapse it; no action required here.

## Areas probed and found clean

- **mdr-fix-1 (`approved` alias):** `flows/mission-driver.json:30` alias is correct; `_tryAliasMarker` (engine.js:727-737) resolves `approved → all_complete` only when `transitions[all_complete]` exists, so CHECK / DRAFT_PLANS / DEEP_AUDIT are inert. `flows/plan-execution.json:44` CLOSURE_AUDIT's direct `approved` transition key still wins (direct match before alias) — no regression. `forEach-marker-alias.test.js` proves zero parse/correction calls.
- **mdr-fix-2 (`promptsDir`):** resolution chain `mission.promptsDir → missions/prompts/ → TOOL_ROOT/prompts/` is uniform for main flow (`main.js:674-677`) and subflows (`flow-loader.js:318-321`), with the falsy-`missionsDir` guard preserved. `prompts-dir.test.js` covers all three levels + backward compat + mission-check reject/accept/optional. The mission itself dogfoods this (`missions/actionable-fixes-prompts/execute.md` overrides only `execute.md` with a single-plan-scope variant; its `pass`/`fail` markers are valid for plan-execution's EXECUTE step).
- **mdr-fix-3 (configurable CHECK):** `flows/mission-driver.json:38-44` shape matches Decision B exactly (`fail` terminal, `needs_fix → retry maxRetries:2`, `onMaxRetries`/`onError` terminal). `health-check.md` markers (`pass`/`needs_fix`/`fail`) are all valid CHECK transition keys. `checkCmd` is registered in both `VAR_PROVENANCE` (context-map.mjs:59) and `EXPECTED_VARS` (context-map.mjs:90), so the drift gate holds. `check-configurable.test.js` proves both the success-after-retry and the exhausted-retry terminal paths; `check-lightweight.test.js` proves the unconfigured terminal guarantee is untouched.
- **mdr-fix-4 (draft directory support):** `mission-brief.md:9` and `mission-draft.md:11` rewording is in place; `--target-file` help text at `main.js:867` clarifies optional input aid; constraint tests (`draft-path-consistency`, `brief-gate`) still pass — no literal `docs/backlog/`, `<BRIEF_GATE>`/`<BRIEF_GATE_REASON>` markers preserved.
- **Error handling / security / conventions:** optional chaining in `loadSubFlow` is safe; `g.commands.check || ""` tolerates the missing key; no new secrets or untrusted input; new explanatory comments are justified by non-obvious resolution chains and do not violate the minimal-comment policy.

## Residual unknowns (deserve watchfulness, not findings)

- **`needs_fix` marker semantics read slightly oddly.** `health-check.md:14` instructs the agent to emit `needs_fix` *after* it has already diagnosed, fixed, and re-verified the command locally. The engine then retries CHECK, so an auto-fixable failure runs `{{checkCmd}}` up to three times (initial fail → agent's verifying re-run → engine's authoritative retry). This is the documented Decision B behavior and is bounded by `maxRetries:2` + terminal `onMaxRetries`, so it is not a defect — but for an expensive gate (e.g. `mvn clean compile`) the triple-run cost on a fixable failure is worth keeping in mind if CHECK latency becomes a complaint. A future prompt tweak could let the agent emit `pass` directly once its own re-run succeeds.
- **No automated test pins the reworded `--target-file` help text or the directory-based draft examples.** This is acceptable for a P2 wording change (analysis #5 was P2), and the invariant tests cover the constraints that matter; noting only so a future regression in help text would not be silently caught.
- **Generalized forEach-agent per-item-vs-aggregate correction waste is still latent.** mdr-fix-1 patched the single known instance (REVIEW_PLANS) via alias. `REVIEW_PLANS` is currently the only `forEach: agent` step in any shipped flow, so the deferred engine-core refactor (plan 1 "Deferred But Adjudicated") is not urgent — but if a second `forEach: agent` step is ever added with a per-item marker that has no aggregate alias, the same 2N wasted correction calls will recur. Worth a glance whenever a new forEach agent step is introduced.

<AI_STEP_RESULT>issues</AI_STEP_RESULT>
