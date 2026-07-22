# Mission-Driver Baseline

## Purpose

Record the cross-cutting technical baseline for the `tools/mission-driver/` engine — the public contracts that the rest of the repository depends on and that an AI agent or maintainer must treat as stable.

`docs/architecture/` owns cross-cutting technical and module-boundary truth (AGENTS.md Documentation Ownership). Mission-driver is a cross-cutting tool (`mission-design.md` §10: "operationalizes the AGE loop") whose CLI surface, schemas, and marker contracts are consumed by plans, prompts, audits, the monitor dashboard, and downstream analysis. Those contracts were previously documented only inside `tools/mission-driver/design/*.md`; this file lifts the stable surface to the project architecture level and cites the design docs as the controlling detail owners.

This document does **not** re-derive implementation detail. It enumerates the contracts and points to the detailed owner doc for each.

## Scope

`tools/mission-driver/` — Node.js (ESM) engine that reads `missions/<name>.json`, walks a flow-defined state machine, spawns `opencode run` subprocesses per step, and serves a monitor dashboard (Node `http` + SSE + Vue 3 frontend).

The engine core is **zero npm dependencies** (only CLI-layer `commander`; monitor uses only Node built-ins). This constraint is normative — see `tools/mission-driver/CONTEXT.md` "关键约束".

## Public CLI Surface

Registered by `src/main.js` via `commander`. Commands and their stable options:

| Command | Purpose | Key options | Owner doc |
| --- | --- | --- | --- |
| `run <mission>` (also the implicit main command) | Run a mission end-to-end | `--step`, `--from-step`, `--dry-run`, `--max-cycles`, `--model`, `--parse-model`, `--no-monitor`, `--fast`, `--skip-steps`, `--dir`, `--missions-dir`, `--run-dir` | `mission-design.md` §6 |
| `draft <description>` | Two-stage brief→draft pipeline that generates `mission.json` + roadmap | `--draft-job-dir`, `--flow-hint`, `--target-file`, `--skip-brief`, `--dry-run`, `--dir`, `--missions-dir` | `draft-robustness-design.md` §1.1, `mission-design.md` §9 |
| `list` (`ls`) | List available missions (skips configs without `roadmapPath`) | `--dir`, `--missions-dir` | `mission-design.md` |
| `list-steps <mission>` | List single-step-executable steps for a mission | `--dir`, `--missions-dir` | `mission-design.md` |
| `analyze [run-dir]` | Reflexion postmortem of a run (defaults to most recent run) | `--dry-run`, `--dir`, `--missions-dir` | `mission-design.md` |
| `monitor` | Standalone monitor-only mode (browse historical runs) | `--dev`, `--monitor-port`, `--dir` | `CONTEXT.md` "故障排查" |

CLI registration lives in `src/main.js` (`commander` subcommand declarations in the `// ── Subcommands ──` / `// ── Subcommand: run ──` sections, the main `run` command, and the `program.parse()` entry call near EOF). `draft` is the AI-facing generation entry point; `run` is the execution entry point.

## Mission Config Schema (`mission.json`)

Enforced by `src/mission-check.mjs`. Mission configs live in `{projectRoot}/missions/<name>.json` (NOT under `tools/`).

**Required fields** (`REQUIRED_FIELDS`, `mission-check.mjs:13`):
- `name`
- `roadmapPath`
- `plansDir`
- `commands`

**Required commands** (`REQUIRED_COMMANDS`, `mission-check.mjs:14`):
- `commands.test` — every mission must declare a test command (the verification baseline).

**`extends` merge chain** (`resolveExtends`, `mission-check.mjs:24-50`): `base.json` → `base.local.json` (gitignored per-user overrides) → mission.json. Merge is **shallow** — nested objects (e.g. `commands`) are replaced wholesale, not deep-merged. `_`-prefixed keys are stripped at load time.

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

- **`<BRIEF_GATE>pass|blocked</BRIEF_GATE>`** + optional **`<BRIEF_GATE_REASON>...</BRIEF_GATE_REASON>`** — emitted by `prompts/mission-brief.md`, parsed by `extractBriefGate` (in `src/main.js`, case-insensitive `/is` regex after ANSI strip). `blocked` stops the draft pipeline before Stage 2 and marks `draft-state.json` `status: "blocked"`. `pass` or a missing marker advances to Stage 2 (backward compatible). Owner doc: `draft-robustness-design.md` §4.2 / WI2 plan.

- **`<AI_STEP_RESULT>pass|fail</AI_STEP_RESULT>`** — step result tag enforced structurally by `src/prompt-check.mjs` (chained into `pnpm --prefix tools/mission-driver test`). Every agent-facing prompt that produces a pass/fail outcome must ship a well-formed example; the check fails the test suite otherwise.

Step-transition markers (e.g. `<PLAN_FILE>`, `<MISSION_FILE>`, `<DRAFT>`, `<REVISED>`, `<FLOW_VARS>`) are owned by `mission-design.md` and the individual flow designs under `tools/mission-driver/design/`.

## Public Exports vs Test Seams

Public exports (the stable API surface other modules may import). Citations are function-name-anchored (the `export` keyword is findable; line numbers rot):

- `src/main.js` — `cmdDraftMission`, `parseDraftArtifact`, `extractBriefGate`, `validateDraftDesc` (single `export { … }` statement near EOF; `validateDraftDesc` is defined in `draft-job.mjs` and re-exported here so `monitor.js` can import it without forming a `monitor → main → monitor` cycle), `EXIT_MAP` (named `export const` near the top; engine terminal-status → process exit code, the `EXECUTION-PRINCIPLE.md §11` contract table; consumed by `cmdRunMission` and pinned row-by-row by `test/exit-map.test.js`).
- `src/draft-job.mjs` — `startDraftJob`, `readDraftJob`, `listDraftJobs`, `validateDraftDesc` (all `export function`, consumed cross-module by `monitor.js`).
- `src/mission-check.mjs` — `validateMission`, `loadMission`.
- `src/monitor.js` — `parseRoadmapMarkdown` (defined in `roadmap-check.mjs`, re-exported here so both the Monitor Server and the FlowEngine share one parser), `mergeSubflowChildren` (subflow live-state reader), `handleStartDraft` (async draft-job launcher), `startMonitor` (HTTP/SSE server entry).
- `src/sys-snapshot.mjs` — `snapshot`.

Test seams (NOT public API; prefixed `__` and exported only for the test suite):

- `src/main.js` — `__setRunnerFactoryForTest` (inject mock agent runner for draft tests).
- `src/draft-job.mjs` / `src/monitor.js` — `__setSpawnerForTest` (inject mock subprocess spawner).
- `src/flow-loader.js` — `_scanOpenAuditsList`, `_isMissionLevelAudit`, plus the `SCRIPT_REGISTRY` constant.

Consumers must not depend on `__`-prefixed exports outside of `test/`.

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
