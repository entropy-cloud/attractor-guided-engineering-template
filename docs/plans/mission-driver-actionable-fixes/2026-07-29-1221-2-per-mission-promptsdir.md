# mdr-fix-2 Per-mission promptsDir config support

> Plan Status: active
> Last Reviewed: 2026-07-29
> Source: `docs/backlog/mission-driver-actionable-fixes-roadmap.md` work item 2; `docs/analysis/2026-07-29-0000-mission-driver-actionable-fixes.md` problem #2 (Step 1)
> Related: none (independent)
> Audit: required

## Current Baseline

Live-state inventory (read from repo, not memory):

- `src/flow-loader.js:241-247` `loadPrompt(promptPath, projectDirs)` already implements directory-priority lookup: tries each dir in `projectDirs`, then falls back to `TOOL_ROOT/promptPath`.
- `src/flow-loader.js:249-258` `resolveStepPrompts` recurses into nested `step.steps` (subflows embedded in the same flow file), so prompt resolution is consistent for inline steps.
- `src/flow-loader.js:275-280` `loadFlowFile` resolves prompts + scripts for one flow file.
- `src/flow-loader.js:290-304` `createMissionDriverFlow` receives `projectPromptDirs` (default `[]`) and forwards it to `loadFlowFile`.
- `src/main.js:667-671` builds the override chain as **exactly one hardcoded dir**: `projectPromptDirs: [resolve(config.missionsDir, "prompts")]`. All missions share the same `missions/prompts/` override dir.
- `src/flow-loader.js:306-321` `loadSubFlow(name)` is an exported function that reads `this?.config?.missionsDir` / `this?.config?.subflowDir` and **hardcodes** `projectPromptDirs = [resolve(missionsDir, "prompts")]` when building subflows (deep-audit-loop, plan-execution). It is passed as a delegate in `main.js:715`; when the engine calls `this.delegates.loadSubFlow(...)`, `this` is the delegates object, so `this.config` = `delegates.config` (the resolved config). So subflow prompt overrides currently also share the single `missions/prompts/` dir.
- `src/config.js:651-688` returns the resolved config including the full `mission` object (line 655 `mission,`), so `config.mission.<field>` and any newly added normalized field are both reachable.
- `src/mission-check.mjs:13` `REQUIRED_FIELDS` = name/roadmapPath/plansDir/commands; `validateMission` (58-87) only **requires** fields and checks existence for `roadmapPath/plansDir/contextDir/moduleDir`. It does NOT reject unknown fields, so adding `promptsDir` to a mission.json is already tolerated — but it is neither documented nor existence-validated.
- `missions/base.json` has no `promptsDir`.

Gap: a mission cannot override the full prompt set (e.g. data-analysis tasks needing a different `draft-from-roadmap.md` / `health-check.md` / `plan-review.md`). All missions are forced through one shared `missions/prompts/` directory.

## Goals

- Add an optional `promptsDir` mission field so a mission can override the **full** prompt set independently, with a clear resolution chain: `mission.promptsDir` → `missions/prompts/` → built-in `TOOL_ROOT/prompts/`.
- Make the chain apply uniformly to both the main flow (`createMissionDriverFlow`) and subflows (`loadSubFlow`).

## Non-Goals

- Goal-driven / auto-selection of `promptsDir` from a natural-language target (roadmap "Out of scope"; future feature, lives above mission-driver).
- Per-prompt (file-level) overrides beyond the directory-priority mechanism already shipped.
- New flow-name/flow-override capabilities (`createMissionDriverFlow` already supports `projectFlowsDir` / `flowName`; no change needed here).

## Task Route

- Type: `implementation-only change` (config plumbing across 4 files; no public API/contract change, no data model, no auth)
- Owner Docs: `tools/mission-driver/CONTEXT.md` "Mission 配置系统" (优先级 chain) and "关键约束"; `docs/backlog/mission-driver-actionable-fixes-roadmap.md` §2
- Skill Selection Basis: none — config-resolution plumbing reusing the existing `projectPromptDirs` mechanism; no reusable skill matches.

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.

## Execution Plan

### Phase 1 - Thread mission.promptsDir through the prompt resolution chain

Status: planned
Targets: `tools/mission-driver/src/config.js`, `tools/mission-driver/src/main.js`, `tools/mission-driver/src/flow-loader.js`, `tools/mission-driver/src/mission-check.mjs`
Skill: none

- Item Types: `Add | Decision | Proof`
- Prereqs: none

- [ ] Decision: how `promptsDir` is exposed to `loadSubFlow`. Two viable options:
  - (A) Add a normalized `config.missionPromptsDir` (absolute path or empty) resolved in `config.js`, read by both `main.js` (for `createMissionDriverFlow`) and `loadSubFlow` (`this.config.missionPromptsDir`). Uniform, single source of truth.
  - (B) Read `this.config.mission?.promptsDir` directly inside `loadSubFlow` and in `main.js`.
  - Chosen: (A) — mirrors the existing flat config-field pattern already produced by `config.js` (e.g. `missionsDir`, `auditsDir`, and the full `mission` object), and keeps `loadSubFlow` reading only flat config fields. Alternatives considered: (B) is less uniform and couples `loadSubFlow` to the nested mission shape. Note: `loadSubFlow` also reads `this?.config?.subflowDir`, but `config.js` never produces that field today (that branch is currently dead), so it is NOT cited as an existing pattern. Residual risk: none material.
  - Skill: none
- [ ] `config.js`: in the mission run branch (after `loadMission`, around line 573-578), resolve `const missionPromptsDir = mission.promptsDir ? resolve(projectRoot, mission.promptsDir) : "";` and add `missionPromptsDir` to the returned config object.
  - Skill: none
- [ ] `main.js:667-671`: build `projectPromptDirs` as `[config.missionPromptsDir, resolve(config.missionsDir, "prompts")].filter(Boolean)` so the mission-level dir precedes the shared `missions/prompts/` dir. Pass to `createMissionDriverFlow`.
  - Skill: none
- [ ] `flow-loader.js:306-321` `loadSubFlow`: read `this?.config?.missionPromptsDir` and build `projectPromptDirs = [missionPromptsDir, missionsDir ? resolve(missionsDir, "prompts") : ""].filter(Boolean)` (preserve the existing falsy-`missionsDir` guard so unconfigured missions keep current behavior — today's code yields `[]` when `missionsDir` is falsy). Keep the existing flow `searchDirs` (missions/flows → subflowDir → TOOL_FLOWS_DIR) unchanged.
  - Skill: none
- [ ] `mission-check.mjs`: do NOT add `promptsDir` to `REQUIRED_FIELDS` (optional). Decide existence-validation: add `promptsDir` to the existence-checked list in `validateMission` (lines 73-84) so a typo'd path fails fast at mission-check — matches how `moduleDir`/`contextDir` are treated. Record the chosen behavior in the plan execution log.
  - Skill: none

Exit Criteria:

- [ ] A mission with `promptsDir` set resolves prompts from that dir first, then `missions/prompts/`, then built-ins (proved by a unit test exercising `loadPrompt` / a constructed `projectPromptDirs` chain, and a `createMissionDriverFlow`+`loadSubFlow` integration test showing a mission-level prompt shadows the shared one and falls back to built-in when absent).
- [ ] A mission WITHOUT `promptsDir` behaves exactly as today (shared `missions/prompts/` → built-in); existing tests stay green.
- [ ] Subflow (deep-audit-loop, plan-execution) prompt loading honors the same chain — verify a subflow prompt is resolvable from the mission-level dir.
- [ ] `mission-check.mjs` validates/rejects a bad `promptsDir` path per the chosen Decision (or explicitly documents why existence check is skipped).
- [ ] `pnpm --prefix tools/mission-driver test` green; `node tools/mission-driver/src/mission-check.mjs missions/<name>.json .` validates an existing mission.
- [ ] Owner-doc update: `tools/mission-driver/CONTEXT.md` "Mission 配置系统" 优先级 line + 关键约束 note the new `promptsDir` field and the 3-level resolution chain.
- [ ] `docs/logs/` updated.

## Draft Review Record

- Independent draft review iteration 1: accept-after-minor-revision (general subagent ses_053e1fc36ffelMX558C4phYxnF) because all cited baseline claims (a)-(e) were verified against real code; no blocking issues. Non-blocking accuracy notes: (1) Decision rationale incorrectly cited `subflowDir` as an existing config pattern — `config.js` never produces it (dead branch), corrected to cite `missionsDir`/`auditsDir`/`mission`; (2) preserve the falsy-`missionsDir` guard in the `loadSubFlow` expression, corrected. Both folded in.
- Consensus reached: no blocking issues after iteration 1 corrections → promoted to active.

## Closure Gates

- [ ] in-scope behavior is complete (mission.promptsDir honored by main flow + subflows; fallback chain intact)
- [ ] relevant docs aligned (CONTEXT.md updated)
- [ ] verification has run: `pnpm --prefix tools/mission-driver test` + `node tools/mission-driver/src/mission-check.mjs missions/<name>.json .`
- [ ] scoped verification is not conflated with full verification (full test suite + a real mission-check run — no scope limitation)
- [ ] no in-scope item downgraded to deferred/follow-up
- [ ] independent draft review completed and recorded
- [ ] text consistency verified
- [ ] closure audit was independent
- [ ] closure evidence exists in files

## Deferred But Adjudicated

### Goal-driven promptsDir auto-selection (the "mission dispatcher" outer layer)

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: roadmap Step 3 / analysis #2 explicitly defer it; it is a new feature layer above mission-driver, not a config-plumbing change.
- Successor Required: yes — reopen when a natural-language goal → roadmap → mission → run pipeline is prioritized.

## Closure

Status Note: (filled at closure)

Closure Audit Evidence:

- Auditor / Agent: <independent auditor or independent subagent>
- Evidence: <task id / log link / walkthrough record>

Follow-up:

- (none blocking)
