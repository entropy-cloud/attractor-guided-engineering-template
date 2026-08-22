# DSH Plugin Packaging — Technical Architecture

> **Status: PLANNED — implementation design, nothing landed yet.** Phase gates below define when each claim becomes supported behavior.

## Purpose

Define the technical implementation plan for packaging mission-driver as a DSH plugin with a native agent-dispatch execution backend, per the feature design in `docs/design/dsh-plugin-integration.md`.

This document owns: the packaging layout, the execution-backend seam refactor inside the engine, the native dispatch API chain, contract-preservation rules, and the phased delivery plan. It cites verified external API usage rather than restating third-party internals.

## Scope and Boundary Impact

One existing architecture rule is amended by this plan:

- `docs/architecture/module-boundaries.md` currently states the engine core is consumed "in-process: not exported (engine runs as a process, not a library)". After Phase 1 (below), the engine becomes importable as a library behind an injected step-executor interface; CLI operation remains the default. That boundary doc must be updated in the same change that lands Phase 1.

All other boundary rules are preserved:

- Engine stays zero-npm-dependency at its core; no `@deepseek-ai/*` import ever enters `tools/mission-driver/src/`.
- Engine single-sourcing holds: the plugin installs from this repository into a DSH profile; nothing is copied into consumer projects.
- `install-age.sh` → engine dependency remains forbidden.

## Packaging Layout

New top-level directory in this repository:

```
plugin/dsh/
├── package.json          # dsh bundle manifest (dsh.bundle.patch field), pinned @deepseek-ai/* deps
├── cordis.patch.yml      # mounts the Mission Control service into an isolate realm
├── src/
│   ├── service.ts        # cordis service: registers mdcontrol.* routes + skills
│   ├── native-executor.ts# StepExecutor implementation over the host agents service
│   └── engine-bridge.ts  # programmatic entry wrapping engine orchestration
└── assets/               # bundled flows/, prompts/, agents/ copied at build time
```

Build-time bundling copies the engine's pure modules into the plugin bundle. The verified import graph dictates the list:

- Flow engine path: `engine.js` → `expression.mjs`, `platform.mjs`, `sys-snapshot.mjs`, `reap-orphans.mjs` (→ `run-reconcile.mjs`), `active-run-registry.mjs`, `roadmap-check.mjs`
- Config path: `config.js` (imports only node builtins + `mission-check.mjs`) — needed by the programmatic entry (`engine-bridge`)
- Process backend path: `runner.js` (→ `executor.js`, `platform.mjs`) — needed by ProcessExecutor
- Orchestration entry path: P1 extracts a programmatic run/draft/analyze module from `main.js` so CLI and plugin share one entry. It owns flow loading (`flow-loader.js` → `plan-check.mjs`; imported by `main.js` today, not by `engine.js`), the CLI-parity bootstrap (`env-loader.js` → `secret-resolver.mjs` before `resolveConfig`), the draft pipeline (`cmdDraftMission`, `extractBriefGate`, `parseDraftArtifact`), Reflexion analysis (`postmortem.mjs` → config/expression, backing `mdcontrol.analyze`), and the hoisted `EXIT_MAP` (pinned row-by-row by `test/exit-map.test.js`, which keeps the hoist honest).

NOT bundled: monitor server (`monitor.js`), draft-job detached-process management (`draft-job.mjs` + its `spawner.mjs` seam — both remain CLI/monitor-only), CLI commander wiring. Path resolution for bundled `flows/`/`prompts/`/`agents/` uses `import.meta.url` relative to the bundle location, matching how config.js already resolves the pi persona `agentFile`.

## Execution Backend Seam (Engine Refactor)

The engine already routes AI execution through injected delegates (`engine.js`: `delegates.runAgent` for agent steps, `delegates.runParseAgent` for no-marker parse fallback and marker-correction retries, `delegates.runTool` for tool steps; wired from `main.js`). The refactor formalizes this existing seam into one named interface so backends become pluggable:

```
StepExecutor.execute(stepCtx) → { code: 0|1, text: string, errorTail: string, sessionId?: string|null }
```

- **ProcessExecutor** wraps the existing runner+executor pair unchanged; selected for every current driver value (`opencode` | `pi` | `cline`). Behavior byte-for-byte identical to today.
- **NativeExecutor** (implemented in the plugin layer, not the engine core) fulfills the same interface over the DSH agents service.
- Engine selects the backend from resolved driver config: `"native"` maps to NativeExecutor; all other values map to ProcessExecutor.

Two P1 hardening items the refactor must include:

1. **Driver validation.** Today no whitelist exists (`--driver <exe>` is free-form; an unknown value reaches spawn time and fails mid-mission as a SPAWN ENOENT). P1 adds resolve-time validation with supported values `opencode | pi | cline | native`; `native` is legal only when running inside the plugin host and is rejected with a clear error by the standalone CLI.
2. **Embedded-mode gating of startup diagnostics.** `FlowEngine.run()` unconditionally performs process-level startup work for non-subflow engines: active-run registration under `~/.mission-driver/active/`, system snapshots via execSync, and orphan reaping that kills OS processes whose command line matches `opencode run` + `[MISSION_DRIVER]` tags. A plugin-hosted engine must NOT run this inside the DSH host process. P1 gates these diagnostics behind an embed flag (off when NativeExecutor is selected); active-run registration moves to the plugin's own guard (see §Service Surface).

Contract preservation rules:

1. **Marker contracts unchanged.** `<AI_STEP_RESULT>pass|fail</AI_STEP_RESULT>`, `<BRIEF_GATE>…</BRIEF_GATE>`, and all step-transition markers keep their definitions (`docs/architecture/mission-driver-baseline.md` §Marker Contracts). NativeExecutor returns the child agent's final assistant message text as `text`; the engine's existing extraction, correction-retry (max 2 re-prompts), and transient-fault backoff operate on it unmodified.
2. **Run-state shape unchanged.** `_writeWorkflow` atomic writes, `steps[]` fields including `sessionId`, remain the durable surface shared with the monitor.
3. **Exit semantics synthesized.** Where ProcessExecutor yields real exit codes and stderr tails, NativeExecutor synthesizes compatible values (`code: 0` on completed turn with parseable outcome; `code: 1` + `errorTail` on abort/error) so the hoisted `EXIT_MAP` terminal-status mapping and retry budgets behave identically.

## Native Dispatch API Chain

The implementation follows the verified in-process pattern used by DSH-better-sidebar's sidechat feature (`src/sidechat-routes.ts`; upstream: <https://github.com/omdsh-dev/DSH-better-sidebar> — an offline clone is kept at `~/ai/dsh-plugins/DSH-better-sidebar` for local reference only):

| Step | Host API | Notes |
| --- | --- | --- |
| Resolve service | `ctx.get('agents')` | degrade to wire error if absent |
| Create child agent | `agents.create(options)` → `{ agent, dispose() }` | `options.sessionId` = generated child id; `options.meta` carries `{ cwd: projectRoot, origin: 'subagent', delegationDepth, agentPreset }`; `options.signal` = timeout |
| Dispatch prompt | `agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))` | text = assembled prompt template output, prefixed by a `[MISSION_DRIVER:<runId>]` boundary line; in native mode the prefix serves log/run-dir identifiability only (the orphan reaper identifies OS processes by command line, which native child agents do not have) |
| Await completion | poll/subscribe `agent.status` until idle | replaces log-mtime heartbeat |
| Read result | final assistant message from `agent.session.events` | fed to marker extraction as `text` |
| Continue session | `agents.resume({ resumeSessionId })` when the handle went cold between steps | native continuity; supersedes regex session scraping |
| Release | `handle.dispose()` | deterministic cleanup after each run or abort |

Step-agents register healthy descriptors via `snapshotSubagentDescriptor` (from `@deepseek-ai/dsh-subagent`) so the host subagent list renders them correctly instead of flagging corrupt rows.

Terminology glosses for reviewers unfamiliar with the DSH host: **isolate realm** — a cordis service scope that keeps a plugin's mounted instances private instead of process-global; **wire error** — a structured RPC error surfaced to the client UI; **`dsh.bundle.patch`** — the package.json manifest field declaring this package as a mountable DSH bundle plugin.

### Behavioral differences vs ProcessExecutor (documented, accepted)

| Concern | Process behavior | Native behavior |
| --- | --- | --- |
| Permissions | `--dangerously-skip-permissions` bypass | child inherits host sandbox/approval stack; stricter by default. AGE worker preset must carry a tool catalog sufficient for execute/closure steps |
| Model selection | `mission.model` opencode-style ids passed through | early phases ignore `model`; later phases map to DSH `ModelSelectionRef`. Documented gap, not silently dropped |
| Watchdog | 60-min log-idle SIGTERM | hard per-step timeout via abort signal; no partial-output grace |
| Crash isolation | child crash contained by OS | runaway turn bounded by abort + dispose + model-side budget; correction-retry still applies |

## Service Surface (Mission Control)

The cordis service mounts once in an isolate realm (preset-style mounting precedent: `dsh-anchored-standard/preset/agent.cordis.yml`) and registers:

- Routes (namespace `mdcontrol.*`): `run`, `draft`, `analyze`, `status`, `list` — thin wrappers over engine orchestration, never reimplementing engine logic.
- Skills: `mission-control-run`, `mission-control-draft`, `mission-control-analyze` — natural-language entry points that call the routes.
- One mission run at a time per project root — a NEW plugin-level guard owned by the `mdcontrol.*` routes. This is deliberately stricter than the engine (the CLI startup reaper explicitly spares concurrent active runs and supports N parallel runs, including same-root); the plugin starts conservative and may relax later. Concurrent runs across different roots remain independent engine instances.

Draft jobs: `startDraftJob` detached-node concurrency is retained in plugin form initially (engine-level background work, not an AI step); moving it in-process is deferred.

Monitor: unchanged. It reads run-state files from disk; whether the engine runs as CLI or in-host is invisible to it. A native client panel reading the same files is future scope.

## Dependency and Version Risk

`@deepseek-ai/*` packages used by the plugin layer (`dsh-agent`, `dsh-subagent`, cordis core) are developer-preview and versioned pre-release (reference pinning practice: better-sidebar pins `@deepseek-ai/dsh-subagent@0.0.1-rc.1`). Mitigations:

- The plugin touches exactly five host calls (`create`, `resume`, `followup`, `status`, `dispose`) plus descriptor registration; breakage repair is localized to `native-executor.ts`.
- Host package versions are pinned per release; bumping is an explicit changelog event.
- Engine core remains DSH-agnostic; worst case is disabling the plugin while the CLI form continues unaffected.

## Phased Delivery

| Phase | Deliverable | Verification gate |
| --- | --- | --- |
| P1 | StepExecutor seam over the delegates injection points; ProcessExecutor wrapper; programmatic orchestration entry + `EXIT_MAP` hoist; driver validation; embed-mode gating of startup diagnostics; module-boundaries.md update | full engine test suite green (incl. exit-map pinning); CLI behavior unchanged (`run demo` smoke test) |
| P2 | Plugin shell + NativeExecutor; `mdcontrol.run` executing `demo` mission end-to-end natively | demo mission completes with identical run-state shape; markers parsed; correction-retry exercised once artificially |
| P3 | `onboarding` parity + descriptor registration + skills wired | onboarding fills copied docs identically to CLI form; subagents list healthy during run |
| P4 | AGE preset integration (AGE mode) + Mission Control status panel decision | preset + plugin compose without realm collision |

Each phase lands as its own plan under `docs/plans/` with draft review and closure audit per the standard workflow.

## Update Rule

When the StepExecutor interface, native dispatch chain, or packaging layout changes supported behavior, update this doc and the affected owner docs (`docs/architecture/module-boundaries.md`, `docs/architecture/mission-driver-baseline.md` §Driver selection and §Public Exports — the latter when P1 hoists `EXIT_MAP` out of `main.js`) in the same change.
