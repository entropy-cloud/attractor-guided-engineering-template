# Mission-Driver Baseline

## Purpose

Record the cross-cutting technical baseline for the `tools/mission-driver/` engine — the public contracts that the rest of the repository depends on and that an AI agent or maintainer must treat as stable.

`docs/architecture/` owns cross-cutting technical and module-boundary truth (AGENTS.md Documentation Ownership). Mission-driver is a cross-cutting tool (`mission-design.md` §10: "operationalizes the AGE loop") whose CLI surface, schemas, and marker contracts are consumed by plans, prompts, audits, the monitor dashboard, and downstream analysis. Those contracts were previously documented only inside `tools/mission-driver/design/*.md`; this file lifts the stable surface to the project architecture level and cites the design docs as the controlling detail owners.

This document does **not** re-derive implementation detail. It enumerates the contracts and points to the detailed owner doc for each.

## Scope

`tools/mission-driver/` — Node.js (ESM) engine that reads `missions/<name>.json`, walks a flow-defined state machine, spawns a configurable **driver** subprocess per step (`opencode run` by default; `pi -p` via `--driver pi`), and serves a monitor dashboard (Node `http` + SSE + Vue 3 frontend).

The engine core is **zero npm dependencies** (only CLI-layer `commander`; monitor uses only Node built-ins). This constraint is normative — see `tools/mission-driver/CONTEXT.md` "关键约束".

## Public CLI Surface

Registered by `src/main.js` via `commander`. Commands and their stable options:

| Command | Purpose | Key options | Owner doc |
| --- | --- | --- | --- |
| `run <mission>` (also the implicit main command) | Run a mission end-to-end | `--step`, `--from-step`, `--dry-run`, `--max-cycles`, `--model`, `--parse-model`, `--driver` (`opencode` default \| `pi` \| `cline`; `native` is whitelist-only and rejected by the standalone CLI — DSH plugin host only), `--no-monitor`, `--fast`, `--skip-steps`, `--dir`, `--missions-dir`, `--run-dir` | `mission-design.md` §6 |
| `draft <description>` | Two-stage brief→draft pipeline that generates `mission.json` + roadmap | `--draft-job-dir`, `--flow-hint`, `--target-file`, `--skip-brief`, `--dry-run`, `--dir`, `--missions-dir` | `draft-robustness-design.md` §1.1, `mission-design.md` §9 |
| `list` (`ls`) | List available missions (skips configs without `roadmapPath`) | `--dir`, `--missions-dir` | `mission-design.md` |
| `list-steps <mission>` | List single-step-executable steps for a mission | `--dir`, `--missions-dir` | `mission-design.md` |
| `analyze [run-dir]` | Reflexion postmortem of a run (defaults to most recent run) | `--dry-run`, `--dir`, `--missions-dir` | `mission-design.md` |
| `monitor` | Standalone monitor-only mode (browse historical runs) | `--dev`, `--monitor-port`, `--dir` | `CONTEXT.md` "故障排查" |

CLI registration lives in `src/main.js` (`commander` subcommand declarations in the `// ── Subcommands ──` / `// ── Subcommand: run ──` sections, the main `run` command, and the `program.parse()` entry call near EOF). `draft` is the AI-facing generation entry point; `run` is the execution entry point.

### Driver selection

The per-step subprocess driver is configurable, resolved in `src/config.js` with priority `CLI --driver` > `MISSION_DRIVER_EXEC` env > `mission.json`/`base.json` `driver` field > `"opencode"`. Supported values: `opencode` | `pi` | `cline` | `native` — validated at resolve time against the exported `SUPPORTED_DRIVERS` whitelist at every `resolveConfig` return point (main / draft / analyze): an unknown value from any source fails fast with the legal values listed instead of surfacing mid-run as a SPAWN ENOENT. `native` is reserved for the DSH plugin host: it is accepted only when the caller passes the internal option `allowNativeDriver: true` (never a CLI flag / mission field / env), and the standalone CLI rejects it with a host-specific error. Related embed flag: when the resolved engine config carries `embed: true` (injected by the plugin host, not the CLI), `FlowEngine.run()` skips its process-level startup diagnostics (active-run registration, START sys-snapshot, orphan reaping) so an in-host engine cannot destabilize the host process — details in `docs/architecture/dsh-plugin-packaging.md` §Execution Backend Seam. `driverArgs` (`{model}`/`{agent}`/`{session}`/`{agentFile}` tokens) and `promptMode` (`arg`|`stdin`) follow the same priority chain. When `driver=="pi"` or `driver=="cline"`, config.js applies driver-sensible defaults (pi: driverArgs + `promptMode:"stdin"` + a computed `agentFile` persona path; cline: `-m/--json/--yolo/-s` args + `promptMode:"arg"`) so the switch needs no further config; explicit values always win. The pi persona lives at `<engine>/agents/build.pi.md` (engine-relative, resolved via `import.meta.url`, so it works for consumers referencing the engine via `MISSION_DRIVER_HOME`). `runner.js` suppresses opencode-only flags (`--pure`/`--variant`/`--dangerously-skip-permissions`) for non-opencode drivers. See `tools/mission-driver/README.md` §配置项.

## Mission Config Schema (`mission.json`)

Enforced by `src/mission-check.mjs`. Mission configs live in `{projectRoot}/missions/<name>.json` (NOT under `tools/`).

**Required fields** (`REQUIRED_FIELDS` in `src/mission-check.mjs`):
- `name`
- `roadmapPath`
- `plansDir`
- `commands`

**Required commands** (`REQUIRED_COMMANDS` in `src/mission-check.mjs`):
- `commands.test` — every mission must declare a test command (the verification baseline).

**`extends` merge chain** (`resolveExtends` in `src/mission-check.mjs`): `base.json` → `base.local.json` (gitignored per-user overrides) → mission.json. Merge is **shallow** — nested objects (e.g. `commands`) are replaced wholesale, not deep-merged. `_`-prefixed keys are stripped at load time.

Optional path fields whose existence is checked when `projectRoot` is supplied: `roadmapPath`, `plansDir`, `contextDir`, `moduleDir`.

Detailed schema and project-specific values: `tools/mission-driver/design/mission-design.md` §8 (Fixed Contracts vs Project-Specific).

## Draft-State Schema (`draft-state.json`)

Written by `cmdDraftMission` only when `--draft-job-dir` is set; consumed by `src/monitor.js` for the draft-job UI. The full 14-field table (status / phase / startedAt / endedAt / desc / flowHint / targetFile / briefPath / briefGate / briefGateReason / missionName / roadmapPath / missionFile / error) with patch-point anchors is owned by `tools/mission-driver/design/draft-robustness-design.md` §1.4 — this file does not duplicate it.

Key invariants:

- `status ∈ {"running", "completed", "blocked", "failed"}`. Terminal states are `completed`, `blocked` (WI2 brief gate), `failed` (WI1 input rejection via `phase: "rejected"`, or runtime error).
- `phase` is a coarse progress marker; `"rejected"` (mdr-remediate-3 A1) is a terminal pre-Stage-1 phase distinct from runtime-failure phases `"brief"` / `"draft"`.
- Patches merge via `writeDraftState({ ...prev, ...patch })`, so earlier fields (e.g. `desc`) are preserved across later terminal patches.

## Run-State Shape (`run-state.json`)

Written by `src/engine.js` via atomic tmp+rename (`_writeWorkflow` in `src/engine.js`; the function name is the durable anchor — line numbers rot as the engine grows). Top-level fields: `status`, `currentStep`, `startedAt`, `endedAt`, `updatedAt`, `steps[]`, plus optional `auditRound` / `maxAuditRounds` (step-audit mission WI5).

Each `steps[]` entry (opened by `_wfOpen` in `src/engine.js`, closed by `_wfClose` in `src/engine.js`):

| Field | Meaning |
| --- | --- |
| `name` | step name from the flow |
| `status` | `"running"` placeholder → terminal `"completed"` / `"failed"` / `"continued"` / `"skipped"` |
| `visits` | re-entry counter for the same step name (the same step may be entered multiple times) |
| `startedAt` / `endedAt` / `durationMs` | timing |
| `marker` | the transition marker the step emitted |
| `produced` | plan files created during this step (diff against `plansBefore`) |
| `sessionId` | opencode session id for replay (`null` for non-agent steps) |
| `type` / `subflowRuns` | present only for `type: "subflow"` steps — see below |
| `suspended` / `suspendGapMs` | present only when the step was frozen by a system sleep (OPT-7) |

**Subflow steps** (`type: "subflow"`) carry `subflowRuns[]`. Each run record: `{ forEachIndex, forEachItem, file, status }`. Ordering invariant: `subflowRuns` is sorted by `forEachIndex` before close (inside `_executeSubflowStep` in `src/engine.js`; `monitor.js`'s `mergeSubflowChildren` re-sorts defensively on the consumer side) so monitor.js / consumers see deterministic order regardless of concurrency resolve order. The `_subflowId` convention (`{stepName}-{visit}-{i}`, set on child flow vars inside `_executeSubflowStep` in `engine.js`) names child run-state files as `run-state-{stepName}-{visits}-{i}.json`.

**Incremental persistence (draft-robustness WI5, extended by mdr-remediate-4)**: `_wfAppendSubflowRun` (in `engine.js`) appends each completed forEach item to the running placeholder's `subflowRuns` immediately, so an aborted parent still reflects completed items. The non-forEach single-child branch writes a `status: "running"` placeholder before the child starts (mdr-remediate-4 H2). `_wfClose` remains the final truth — it replaces the placeholder with the sorted terminal record. Monitor's `mergeSubflowChildren` (in `monitor.js`) is the **primary live-state reader** for subflow children: the on-disk child `run-state` file is the source of truth for `status` / `steps` / `currentStep`, while `subflowRuns` seeds the `forEachItem` metadata that the disk file does not carry. (The seed-vs-disk-merge rationale — covering the `file:null` placeholder case and in-flight forEach items not yet appended to `subflowRuns` — lives in the `mergeSubflowChildren` comment block.)

## Marker Contracts

AI prompts emit structured markers that the engine parses. Two are cross-cutting:

- **`<BRIEF_GATE>pass|blocked</BRIEF_GATE>`** + optional **`<BRIEF_GATE_REASON>...</BRIEF_GATE_REASON>`** — emitted by `prompts/mission-brief.md`, parsed by `extractBriefGate` (defined in `src/orchestrator.js` since dsh-plugin M1-WI2, case-insensitive `/is` regex after ANSI strip). `blocked` stops the draft pipeline before Stage 2 and marks `draft-state.json` `status: "blocked"`. `pass` or a missing marker advances to Stage 2 (backward compatible). Owner doc: `draft-robustness-design.md` §4.2 / WI2 plan.

- **`<AI_STEP_RESULT>pass|fail</AI_STEP_RESULT>`** — step result tag enforced structurally by `src/prompt-check.mjs` (chained into `pnpm --prefix tools/mission-driver test`). Every agent-facing prompt that produces a pass/fail outcome must ship a well-formed example; the check fails the test suite otherwise.

Step-transition markers (e.g. `<PLAN_FILE>`, `<MISSION_FILE>`, `<DRAFT>`, `<REVISED>`, `<FLOW_VARS>`) are owned by `mission-design.md` and the individual flow designs under `tools/mission-driver/design/`.

## Public Exports vs Test Seams

Public exports (the stable API surface other modules may import). Citations are function-name-anchored (the `export` keyword is findable; line numbers rot):

The age-autonomy M1 ledger foundation landed 2026-08-25 (plans `docs/plans/age-autonomy/2026-08-25-0635-{1,2,3}`); the shared ledger library trio registered below (`ledger-frontmatter.mjs` / `ledger-sections.mjs` / `ledger-dualread.mjs`) is its machine face.

- `src/orchestrator.js` — programmatic orchestration entry (dsh-plugin M1-WI2; the one run/draft/analyze entry the CLI shell and future in-host callers share): `bootstrap` (loadDotenv → resolveConfig), `orchestrateRun` (flow creation + `delegates.vars` assembly + singleStep/entryOverride handling + FlowEngine driving + exit-code mapping; receives the WI1 `executor` seam and returns `{ status, stepCount, elapsed, marker?, history, exitCode }`), `cmdDraftMission` (original name/signature/semantics; self-bootstraps its config and builds its runner through the `__setRunnerFactoryForTest` factory), `parseDraftArtifact`, `extractBriefGate`, `validateDraftDesc` (definition moved here from `draft-job.mjs`), `orchestrateAnalyze` (wraps `runPostmortem`; builds and closes its own runner). Internal CLI-shared helpers (`getTopSteps`, `resolveProjectRoot`, `resolveMissionsDir`) are exported for the shell but are not part of the programmatic-entry surface. Import graph is confined to the packaging allowlist (`dsh-plugin-packaging.md` §Packaging Layout: node builtins + engine pure modules + `runner.js`); never `vendor/commander`, `monitor.js`, `draft-job.mjs`/`spawner.mjs`. Process-level concerns (commander wiring, monitor start/stop, SIGTERM/SIGINT handlers, `reconcileStaleRuns`, `unregisterActiveRun`, human-readable banners) stay in the `main.js` CLI shell.
- `src/exit-map.js` — `EXIT_MAP` (dsh-plugin M1-WI2 hoist): engine terminal-status → process exit code, the `EXECUTION-PRINCIPLE.md §11` contract table. Zero dependencies so any layer can import the exit-code table alone; consumed by `orchestrateRun` and pinned row-by-row by `test/exit-map.test.js` (which imports this module directly). Increment (age-autonomy M5-WI38, 2026-08-27, plan `docs/plans/age-autonomy/2026-08-27-1023-2`): EXIT_MAP grew 11→**13 keys** — `partial`/`blocked` → exit 3, a new exit-code class ("terminal-not-complete, human disposition required") distinct from the 2-family (budget/limit protection, rerun) and 1 (unrecoverable failure); supervisor-word provenance (03-supervisor §8 R1–R4, engine `_result` does not emit the two words during the engine-retention period); `EXECUTION-PRINCIPLE.md §11` synced and the pinning tests grown 13→19. Same-change registration in this doc was deferred to the M5-WI39 doc-consistency slice (plan `2026-08-27-1023-3`) — recorded here; the M3/M4 supervisor/efficiency faces need no baseline registration (plugin-side, owned by `dsh-plugin-packaging.md` increments through M4-WI34).
- `src/config.js` — `resolveConfig` / `listMissionsString` / `resolveTargetRun` / `inferModuleName` / `resolveRunModule` / `buildRunSkeleton` / `resolveAuditsDir`, plus `SUPPORTED_DRIVERS` (dsh-plugin M1-WI3): the frozen driver whitelist `["opencode","pi","cline","native"]` consumed by resolve-time validation at every return point; re-exporting or hardcoding the list elsewhere is drift (CLI help text and this file's §Driver selection must stay in sync with it).
- `src/main.js` — thin CLI shell + compatibility re-export layer (dsh-plugin M1-WI2): the `draft`/`analyze`/`run` command bodies are bootstrap + orchestrate* calls plus process lifecycle; the module re-exports `cmdDraftMission`, `parseDraftArtifact`, `extractBriefGate`, `validateDraftDesc`, `__setRunnerFactoryForTest` from `orchestrator.js` and `EXIT_MAP` from `exit-map.js` (definitions no longer live here; `export … from` keeps the module-level mutable test-seam state identical).
- `src/draft-job.mjs` — `startDraftJob`, `readDraftJob`, `listDraftJobs`, `validateDraftDesc` (re-exported from `orchestrator.js` since M1-WI2; consumed cross-module by `monitor.js` — reference chain unchanged, no cycle: the orchestrator import graph never touches `draft-job.mjs`).
- `src/mission-check.mjs` — `validateMission`, `loadMission`.
- `src/monitor.js` — `parseRoadmapMarkdown` (defined in `roadmap-check.mjs`, re-exported here so both the Monitor Server and the FlowEngine share one parser), `mergeSubflowChildren` (subflow live-state reader), `handleStartDraft` (async draft-job launcher), `startMonitor` (HTTP/SSE server entry).
- `src/sys-snapshot.mjs` — `snapshot`.
- `src/step-executor.js` — `ProcessExecutor` (dsh-plugin M1-WI1): the named StepExecutor seam. `FlowEngine` consumes a single `delegates.executor` object (`executeAgent` / `executeParseAgent` / `executeTool`, signatures identical to the legacy `runAgent`/`runParseAgent`/`runTool` delegates trio); `ProcessExecutor` is the process backend that forwards 1:1 to a `createRunner` product. Backend replacement (M2 NativeExecutor) injects a different object with the same three methods. Contract owner: `docs/architecture/dsh-plugin-packaging.md` §Execution Backend Seam.
- `src/ledger-frontmatter.mjs` — shared ledger frontmatter library (age-autonomy M1-WI1/WI2, plan `2026-08-25-0635-1`): `parseFrontmatter` (the ~30-line built-in parser of the restricted subset — flat scalar keys + single-level flow arrays; block scalars, nested objects, and anchors rejected, per the zero-npm constraint that forbids gray-matter), `validatePlanFrontmatter` / `validateRoadmapFrontmatter` (field-set + value-legality validators), and the status-vocabulary constants `WRITABLE_PLAN_STATUSES` / `TERMINAL_PLAN_STATUSES` / `DERIVED_PLAN_STATUS` (`"completed"` is derived, never writable). Contract owner: `docs/design/age-autonomy/01-file-ledger.md` §2 (item 1 subset discipline) / §3.1 / §4.1 / §5.1. Consumers: the four engine read faces through the dual-read seam, plus direct `validateRoadmapFrontmatter` in `roadmap-check.mjs` (M2-WI42 wiring); the plugin `assets/src/` copy channel (build-bundle `ALLOWED_MODULES`); declared the machine face by `docs/plans/00-plan-authoring-and-execution-guide.md` and `docs/backlog/00-roadmap-authoring-guide.md`. Zero imports, zero npm dependencies.
- `src/ledger-sections.mjs` — shared ledger sections/derivation library (age-autonomy M1-WI3/WI5/WI6, plan `2026-08-25-0635-2`): counting-domain scanning (`splitLedgerSections` / `scanPlanLedger` / `scanRoadmapLedger` — column-0 checkboxes only in plan Phase + Closure Findings blocks and roadmap Work Item blocks, code fences skipped), inline audit-region structure validation (dispatch/accepted/pass-line/conclusion-line grammars, ledger-id parsing, `findings=none|items` lexing, append-only known-prefix policy), `computeBasisHash` + `deriveCompleted` (§5.2 five-conjunct completion formula with per-conjunct reasons), and the scan predicate family `draftPlans` / `activePlans` / `heldPlans` / `closedPlans` / `openPlans` / `awaitingClosure` (injectable `defaultVerifyKeys`). Contract owner: `01-file-ledger.md` §2 (item 5 counting domain) / §3.2 / §3.3 / §4.2 / §4.4 / §5.2. Consumers: plan-check / flow-loader (incl. `closureScriptCheck` receipt-aware routing, M2-WI41) / roadmap-check; the plugin `assets/src/` copy channel; machine face declared by both guides. Zero npm dependencies (node builtins only).
- `src/ledger-dualread.mjs` — dual-read resolver, the ONE shared implementation behind plan-check / flow-loader / roadmap-check / monitor (age-autonomy M1-WI7, plan `2026-08-25-0635-3`; `01-file-ledger.md` §5.2 single-implementation discipline — read faces must not carry their own status regexes): `ledgerReadMode` + env circuit breaker `MISSION_DRIVER_LEDGER` = `auto|legacy|frontmatter` (auto = frontmatter first with legacy fallback, default; legacy = rollback channel; frontmatter = tightening mode that rejects legacy-only files), `readPlanStatus` / `planLedgerState` (the read seam carrying `fieldErrors` / `fieldsValid` transparently since M2-WI42), `normalizeLegacyStatus`, and `PLAN_STATUS_RE` — the single legacy `> Plan Status:` line matcher, which the dsh plugin's plan-status-gate imports from the bundled `assets/src/ledger-dualread.mjs` copy. Contract owner: `01-file-ledger.md` §5.2. Consumers: the four engine read faces; the plugin `assets/src/` copy channel; machine face declared by the plan guide. Zero npm dependencies.

Test seams (NOT public API; prefixed `__` and exported only for the test suite):

- `src/orchestrator.js` — `__setRunnerFactoryForTest` (inject mock agent runner for draft tests; defined in the orchestration module since dsh-plugin M1-WI2 and re-exported by `main.js` as the same live binding — module-level mutable state must stay single-instance).
- `src/draft-job.mjs` / `src/monitor.js` — `__setSpawnerForTest` (inject mock subprocess spawner).
- `src/flow-loader.js` — the `SCRIPT_REGISTRY` constant. (The legacy audit-channel test seams formerly listed here were removed with that channel in M2-WI22; `SCRIPT_REGISTRY` is the only test-facing export left.)
- `FlowEngine` `delegates.diagnosticHooks` (dsh-plugin M1-WI4) — not a `__`-prefixed export but governed by the same test-only rule: it overrides the run()-internal `_diag` startup-diagnostics dispatch table (defaults: real `registerActiveRun` / `sysMon` / `warnOrphans`). It exists so tests can assert call/no-call without `--experimental-test-module-mocks` (the engine commits to Node ≥ 18). Consumers outside `test/` must not inject it.

Consumers must not depend on `__`-prefixed exports outside of `test/`, and must not inject `delegates.diagnosticHooks` outside of `test/`.

## Detailed Owner Docs

| Topic | Owner doc |
| --- | --- |
| Engine / state machine design | `tools/mission-driver/design/mission-design.md` |
| Draft pipeline robustness (WI1–WI5) | `tools/mission-driver/design/draft-robustness-design.md` |
| Step execution + audit count | `tools/mission-driver/design/step-execution-and-audit-count-design.md` |
| Flow definitions | `tools/mission-driver/design/mission-driver-flow-design.md` + `flows/*.json` |
| Tool context / build commands | `tools/mission-driver/CONTEXT.md` |
| Execution principles | `tools/mission-driver/EXECUTION-PRINCIPLE.md` |
| Plan authoring | `docs/plans/00-plan-authoring-and-execution-guide.md` |

## Update Rule

When a public contract in this file changes supported behavior, update this doc in the same change and refresh the cited detailed owner doc. Implementation-only refactors that preserve the contract surface do not require touching this file.
