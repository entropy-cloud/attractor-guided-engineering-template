# DSH Plugin Packaging — Technical Architecture

> **Status: P1 DELIVERED (2026-08-23) — StepExecutor seam, ProcessExecutor, programmatic orchestration entry + EXIT_MAP hoist, driver validation, and embed-mode gating have landed (M1-WI1..WI5). P2 PARTIALLY DELIVERED (2026-08-23, M2-WI6 + M2-WI7): the plugin shell (`plugin/dsh/` bundle manifest + isolate-realm patch + build bundling with an import-closure gate) and the NativeExecutor dispatch backend + engine-bridge backend-selection factory (fake-agents unit-tested; no real host yet) have landed; the L2 matrix (WI8), L3 harness (WI9), and `mdcontrol.*` routes (WI10) remain planned. P3–P4 remain planned.** Phase gates below define when each remaining claim becomes supported behavior.

## Purpose

Define the technical implementation plan for packaging mission-driver as a DSH plugin with a native agent-dispatch execution backend, per the feature design in `docs/design/dsh-plugin-integration.md`.

This document owns: the packaging layout, the execution-backend seam refactor inside the engine, the native dispatch API chain, contract-preservation rules, and the phased delivery plan. It cites verified external API usage rather than restating third-party internals.

## Scope and Boundary Impact

One existing architecture rule was amended by this plan (amendment landed with P1, 2026-08-23):

- `docs/architecture/module-boundaries.md` previously stated the engine core is consumed "in-process: not exported (engine runs as a process, not a library)". Since P1, the engine is importable as a library behind the injected step-executor interface; CLI operation remains the default. That boundary doc was updated in the same change that landed P1.

All other boundary rules are preserved:

- Engine stays zero-npm-dependency at its core; no `@deepseek-ai/*` import ever enters `tools/mission-driver/src/`.
- Engine single-sourcing holds: the plugin installs from this repository into a DSH profile; nothing is copied into consumer projects.
- `install-age.sh` → engine dependency remains forbidden.

## Packaging Layout

New top-level directory in this repository — **landed 2026-08-23 (M2-WI6, extended M2-WI7)**, tree below is the as-built state (files marked with their owning work item):

```
plugin/dsh/
├── package.json          # LANDED: `dsh.bundle.patch` manifest + exact-pinned @deepseek-ai/* deps
├── cordis.patch.yml      # LANDED: `- insert:` op → cordis:group with isolate realm → service row
├── tsconfig.json         # tsc --noEmit over src/*.ts (allowJs: engine bundle JS enters as inferred types)
├── scripts/
│   ├── check-manifest.mjs     # structural manifest/patch validation (plain-YAML, dev-dep `yaml`)
│   ├── build-bundle.mjs       # copy-style engine bundling + import-closure gate (+ `--check` freshness)
│   └── smoke-import.mjs       # no-host bundle import smoke (all 5 entry modules, zero npm resolution)
├── test/
│   ├── bundle-scaffold.test.mjs   # plugin local test entry (WI6) — reused by WI7/WI8
│   ├── native-executor.test.mjs   # NativeExecutor unit branches (WI7; fake agents service)
│   ├── engine-bridge.test.mjs     # selection factory + native config + orchestrateRun smoke (WI7)
│   └── helpers/fake-agents.mjs    # reusable fake in-process agents service (WI7; WI8/WI9 build on it)
├── src/
│   ├── service.ts        # SKELETON: mount-log only; mdcontrol.* routes + guard = WI10
│   ├── native-executor.ts# LANDED (WI7): DshNativeExecutor — full StepExecutor over ctx.agents
│   └── engine-bridge.ts  # LANDED (WI7): resolveExecutor factory + bootstrapNativeConfig + runNativeMission;
│                         #        mdcontrol.* route wrappers = WI10
└── assets/               # build output — COMMITTED (web/dist precedent); freshness gated
    ├── src/              # the engine pure-module closure (19 files) — relative imports preserved
    ├── flows/            # copied from tools/mission-driver/flows/
    ├── prompts/          # copied from tools/mission-driver/prompts/
    └── agents/           # copied from tools/mission-driver/agents/
```

### Build bundling (as landed)

`scripts/build-bundle.mjs` (pure Node, copy-style — rejected esbuild/rollup single-file bundling: the engine is zero-npm-dependency and small, copying keeps source auditable and path resolution identical to engine semantics; rejected symlinks: not portable in the DSH profile install form):

1. **Import-closure gate** (machine enforcement of the NOT-bundled rule): from the five entry modules (`orchestrator.js` / `config.js` / `engine.js` / `runner.js` / `step-executor.js`) it computes the transitive static-import closure and requires closure ⊆ allowed set. Importing `monitor.js` / `draft-job.mjs` / `spawner.mjs` / `main.js`, any npm package name, or anything escaping the engine `src/` root fails the build. Comment/prose strings cannot fake imports (the scanner is string- and comment-aware). Negative self-test verified all four failure classes go red.
2. **Copy**: the 19 allowed modules land in `assets/src/` with relative imports verbatim, so `import.meta.url`-relative `TOOL_ROOT` resolution (config.js pi persona `agentFile`, flow-loader `flows/`/`prompts/`) keeps exact engine semantics with `TOOL_ROOT = assets/`; `flows/`, `prompts/`, `agents/` are copied to `assets/`.
3. **Freshness**: artifacts are committed (clone-and-run like `web/dist`); `build-bundle.mjs --check` recomputes the copy plan and content-diffs it against the committed tree — stale or extra files fail. The `assets/` name deliberately does not fall under `.gitignore`'s `dist/` rule.

The verified import graph the allowed list encodes (packaging doc baseline, now machine-checked on every build):

- Flow engine path: `engine.js` → `expression.mjs`, `platform.mjs`, `sys-snapshot.mjs`, `reap-orphans.mjs` (→ `run-reconcile.mjs`), `active-run-registry.mjs`, `roadmap-check.mjs`
- Config path: `config.js` (imports only node builtins + `mission-check.mjs`) — needed by the programmatic entry (`engine-bridge`)
- Process backend path: `runner.js` (→ `executor.js`, `platform.mjs`) — needed by ProcessExecutor
- Orchestration entry path: `orchestrator.js` and its dependencies: flow loading (`flow-loader.js` → `plan-check.mjs`), CLI-parity bootstrap (`env-loader.js` `loadDotenv` before `resolveConfig` — the designed "env-loader → secret-resolver" chain is dormant today: `secret-resolver.js` has zero imports under `src/`, so the live chain is dotenv only), the draft pipeline (`cmdDraftMission`, `extractBriefGate`, `parseDraftArtifact`), Reflexion analysis (`postmortem.mjs` → config/expression, backing `mdcontrol.analyze`), and the hoisted `EXIT_MAP` (`exit-map.js`, pinned row-by-row by `test/exit-map.test.js`).

NOT bundled: monitor server (`monitor.js`), draft-job detached-process management (`draft-job.mjs` + its `spawner.mjs` seam — both remain CLI/monitor-only), CLI commander wiring (`main.js`).

### Version pins (as landed)

`plugin/dsh/package.json` pins, exact (no ranges), per the P2-start survey re-run (2026-08-23, `docs/analysis/2026-08-23-0001-p2-version-survey.md` — dist-tags identical to R2, no cohort drift): `@deepseek-ai/cordis@4.0.1` + `dsh-agent`/`dsh-goal`/`dsh-tools`/`dsh-subagent` all at `0.1.1-rc.2` (goal/tools are pinned-but-unconsumed until P3+, per single-cohort consistency). Bumping any pin is an explicit changelog event.

## Execution Backend Seam (Engine Refactor)

The engine historically routed AI execution through injected delegates (`engine.js`: `delegates.runAgent` for agent steps, `delegates.runParseAgent` for no-marker parse fallback and marker-correction retries, `delegates.runTool` for tool steps; wired from `main.js`). The refactor formalized this existing seam into one named interface so backends become pluggable. **Landed form (M1-WI1): the three-capability method set** — a single `delegates.executor` object exposing `executeAgent` / `executeParseAgent` / `executeTool` (1:1 with the legacy delegate trio; `src/step-executor.js` `ProcessExecutor` is the process backend). The single-method sketch below is the conceptual shape, not the landed signature:

```
StepExecutor.execute(stepCtx) → { code: 0|1, text: string, errorTail: string, sessionId?: string|null }
```

- **ProcessExecutor** wraps the existing runner+executor pair unchanged; selected for every current driver value (`opencode` | `pi` | `cline`). Behavior byte-for-byte identical to today.
- **NativeExecutor** (implemented in the plugin layer — `plugin/dsh/src/native-executor.ts`, landed M2-WI7 — not in the engine core) fulfills the same interface over the DSH agents service.
- Backend selection is a plugin-layer factory (landed M2-WI7, `plugin/dsh/src/engine-bridge.ts` `resolveExecutor({ driver, ctx, config })`): `"native"` → a PER-RUN `NativeExecutor` (handle lifetime = one run); all other values → `ProcessExecutor` over the bundle-internal runner. The engine core stays backend-blind — zero engine diff, zero `@deepseek-ai/*` import under `tools/mission-driver/src/`. A missing agents service is an explicit wire error; there is no silent ProcessExecutor fallback (the degradation ladder is a separate explicit decision, see §Dependency and Version Risk).

Two P1 hardening items the refactor included (both landed 2026-08-23, M1-WI3/WI4):

1. **Driver validation.** Resolve-time validation with supported values `opencode | pi | cline | native` (`SUPPORTED_DRIVERS` in `config.js`, enforced at every `resolveConfig` return point — an unknown value previously reached spawn time and failed mid-mission as a SPAWN ENOENT); `native` is legal only inside the plugin host (internal `allowNativeDriver: true` option) and is rejected with a clear error by the standalone CLI.
2. **Embedded-mode gating of startup diagnostics.** `FlowEngine.run()` used to perform process-level startup work unconditionally for non-subflow engines: active-run registration under `~/.mission-driver/active/`, system snapshots via execSync, and orphan reaping that kills OS processes whose command line matches `opencode run` + `[MISSION_DRIVER]` tags. These are now gated behind an embed flag (`cfg.embed === true`, off when NativeExecutor is selected); active-run registration moves to the plugin's own guard (see §Service Surface).

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
| Await completion | `await agent.whenIdle()` — whole-agent quiescence promise (host SDK `runtime-types.ts`) | replaces log-mtime heartbeat; `agent.status` (`idle`/`running`) kept for diagnostics only |
| Read result | final assistant message from `agent.session.events` | fed to marker extraction as `text` |
| Continue session | `agents.resume({ resumeSessionId })` when the handle went cold between steps | native continuity; supersedes regex session scraping |
| Release | `handle.dispose()` | deterministic cleanup after each run or abort. ⚠️ `dispose()` stops the loop AND removes the session from the store — the handle must live for the whole mission run; between steps reuse the live handle, and only `resume()` can recover a persisted session after disposal |

Step-agents register healthy descriptors via `snapshotSubagentDescriptor` (from `@deepseek-ai/dsh-subagent`) so the host subagent list renders them correctly instead of flagging corrupt rows.

Terminology glosses for reviewers unfamiliar with the DSH host: **isolate realm** — a cordis service scope that keeps a plugin's mounted instances private instead of process-global; **wire error** — a structured RPC error surfaced to the client UI; **`dsh.bundle.patch`** — the package.json manifest field declaring this package as a mountable DSH bundle plugin.

### Implementation state and boundaries (M2-WI7, landed 2026-08-23)

The dispatch chain above is implemented in `plugin/dsh/src/native-executor.ts` (`DshNativeExecutor`) and wired by `plugin/dsh/src/engine-bridge.ts` (`resolveExecutor` + `bootstrapNativeConfig` + `runNativeMission`). Verified in the fake-agents unit domain only (no real host — L3 belongs to WI9; native end-to-end belongs to WI10). Implementation boundaries, all deliberate:

- **Model selection is ignored**: both `mission.model` and `parseModel` (the cheap-parse distinction) are ignored in native mode — `executeParseAgent` and `executeAgent` collapse to the same dispatch. See §Behavioral differences below.
- **Log artifacts are written but content shape is not byte-equivalent**: `logFile`/`promptFile` land in the engine run-dir with the same naming convention (`native-<step>-<ts>-<rand>.log` + `.prompt`), preserving monitor log viewing and post-hoc audit; the log body is the harvested assistant text plus a header/round summary, NOT a subprocess stdout transcript (file existence/readability is the compatibility contract; byte-level content shape is not).
- **`executeTool` is the plugin layer's own minimal spawn**: `child_process` spawn + timeout + exit code + output tail, ZERO diagnostics — no `sysSnapshot`, no `~/.mission-driver/active/` touch. Reusing the engine `executor.js` tool path was rejected because its heartbeat pair is intentionally not embed-gated ("a native-mode embed host never selects this backend") — sharing it would run execSync snapshots and active-run registry touches inside the DSH host, the exact host-invasive behavior M1-WI4's embed gating prevents. Known residual drift (the process-path `runTool` currently drops the engine's `timeout` opt; the native path consumes it as milliseconds) is pinned by the WI8 L2 matrix's tool-step assertions.
- **No silent fallback**: missing `ctx.agents` (or a failing native create) surfaces as an explicit wire error to the caller — never an implicit ProcessExecutor downgrade.
- **Callback contract mirrors runner.js exactly**: `onStepUpdate` is resolved at call time (`opts.onStepUpdate ?? config.onStepUpdate`, both with `typeof === "function"` guards) because `orchestrateRun` assigns `config.onStepUpdate` only after executor construction; two-point callbacks fire files-first (`{stepName, logFile, promptFile}`) then session (`{stepName, sessionId}`), so subflow wrapping and the monitor live channel behave identically in native mode.
- **`stderrTail` is always null natively** (no subprocess stderr surface; `errorTail` carries the error text); exit codes are synthesized per contract-preservation rule 3.

### Behavioral differences vs ProcessExecutor (documented, accepted)

| Concern | Process behavior | Native behavior |
| --- | --- | --- |
| Permissions | `--dangerously-skip-permissions` bypass | child inherits host sandbox/approval stack; stricter by default. AGE worker preset must carry a tool catalog sufficient for execute/closure steps |
| Model selection | `mission.model` opencode-style ids passed through; `parseModel` routes no-marker parse fallback + marker-correction retries to the cheaper model | both `mission.model` AND `parseModel` are ignored (documented gap, not silently pretended): early phases dispatch every step — parse and correction retries included — on the same host-configured agent; later phases map both to DSH `ModelSelectionRef` |
| Watchdog | 60-min log-idle SIGTERM | hard per-step timeout: `agent.cancel(cause)` first, `dispose()` as last resort; no partial-output grace |
| Native loop-driver precedent | — (n/a) | host's own `goal-round-driver` drives bounded same-session rounds via a queued prompt gated by an `agent/pre-step` listener; Flow DSL still owns sequencing because it adds branching transitions, script checks, marker contracts, and per-branch budgets beyond round counting |
| Crash isolation | child crash contained by OS | runaway turn bounded by abort + dispose + model-side budget; correction-retry still applies |

Official in-tree precedent for the whole dispatch shape: `@deepseek-ai/dsh-headless` creates one persisted Agent via `ctx.agents`, submits the task, waits for quiescence, and harvests the last non-empty assistant text (`packages/bundle/headless/README.md`) — validating NativeExecutor (in-process) and a one-shot CLI driver against host-own usage. A corresponding `dsh` ProcessExecutor driver value is a post-M2 candidate and is intentionally absent from the WI3 whitelist until then.

## Service Surface (Mission Control)

The cordis service mounts once in an isolate realm (preset-style mounting precedent: `dsh-anchored-standard/preset/agent.cordis.yml`) and registers:

- Routes (namespace `mdcontrol.*`): `run`, `draft`, `analyze`, `status`, `list` — thin wrappers over engine orchestration, never reimplementing engine logic.
- **Async job contract**: `mdcontrol.run` NEVER blocks on mission completion — a mission takes tens of minutes to hours, and a synchronous wait would hang the calling agent's turn until timeout. The route validates config, starts the engine loop as a detached in-host task, and returns immediately with `{ runId, status: 'started' }`. Progress flows through `mdcontrol.status` (reads run-state files) and the monitor dashboard; on terminal state the engine optionally posts a one-line summary back to the requesting agent (`agent.followup`, opt-in flag) instead of holding anything open. Session lifetime is decoupled: closing the chat session that started a run does not stop it. Precedent in-tree: `draft-job.mjs` already uses exactly this pattern (detached job + state file + monitor polling).
- Skills: `mission-control-run`, `mission-control-draft`, `mission-control-analyze` — natural-language entry points that call the routes.
- Reinforcement gate (planned): a `tools/pre-execute` listener denying plan-status `completed` edits while run-state shows no closed CLOSURE_AUDIT visit — hardens the flow contract at the host boundary; consumes `@deepseek-ai/dsh-goal`/`dsh-tools` typings when it lands.
- One mission run at a time per project root — a NEW plugin-level guard owned by the `mdcontrol.*` routes. This is deliberately stricter than the engine (the CLI startup reaper explicitly spares concurrent active runs and supports N parallel runs, including same-root); the plugin starts conservative and may relax later. Concurrent runs across different roots remain independent engine instances.

Draft jobs: `startDraftJob` detached-node concurrency is retained in plugin form initially (engine-level background work, not an AI step); moving it in-process is deferred.

Monitor: unchanged. It reads run-state files from disk; whether the engine runs as CLI or in-host is invisible to it. A native client panel reading the same files is future scope.

### Execution Model (where the long-running loop lives)

In native mode the FlowEngine control loop runs **inside the DSH host process** as a cordis service. The coupling is inherent: native dispatch requires `ctx.agents`, which is reachable only in-process; an out-of-process engine would have to drive agents via SDK/headless — i.e., degenerate to ProcessExecutor-style spawning.

What executes where:

| Component | Location | Form |
| --- | --- | --- |
| FlowEngine state-machine loop | DSH host process | pure async JS coroutines — mostly `await agent.whenIdle()`; negligible CPU, does not block the event loop |
| Agent steps | child agents (cordis scopes, same process) | not OS processes; creation cost ≈ a function call |
| Script/tool steps (`CLOSURE_SCRIPT_CHECK`, `BUILD_VERIFY`) | short-lived OS child processes | spawned from the host (`pnpm test` etc.), exit immediately |

Accepted risks and mitigations:

| Risk | Mitigation |
| --- | --- |
| Host crash/restart mid-mission | run-state atomic per-step writes enable disk-based step resume; nothing depends on memory alone |
| Engine defect destabilizing the host | embed-mode gating removes engine startup diagnostics (incl. the orphan reaper that kills `opencode run` processes) from the host process (M1-WI4) |
| Resource pile-up | single-run-per-root guard at route level |
| Coupling proves unstable in practice | degradation ladder: detached engine + headless CLI driver behind the SAME `mdcontrol.*` surface — skills/routes unchanged, backend swaps |

Progress monitoring channels (all reading the same run-state files):

1. Monitor dashboard (existing Vue3+SSE, port 9300) — zero-change compatibility, step timeline/markers/timing.
2. DSH native subagents topology UI — each dispatched step-agent registers a healthy descriptor.
3. In-chat query — `mdcontrol.status` reads run-state without dispatching any AI.
4. Trajectory view — child-agent turns are ordinary session logs, filterable by source.
5. Completion summary returned through the skill.

Realtime leader is channel 1 (SSE pushes step-level events); an M4 RPC-direct panel would swap its data source, not its schema.

## Dependency and Version Risk

`@deepseek-ai/*` packages used by the plugin layer (`dsh-agent`, `dsh-subagent`, cordis core; `dsh-goal`/`dsh-tools` join only when the pre-execute reinforcement gate lands) are developer-preview and versioned pre-release (reference pinning practice: better-sidebar pins `@deepseek-ai/dsh-subagent@0.0.1-rc.1`). Mitigations:

- The plugin touches exactly five host calls (`create`, `resume`, `followup`, `status`, `dispose`) plus descriptor registration; breakage repair is localized to `native-executor.ts`.
- Host package versions are pinned per release; bumping is an explicit changelog event.
- Engine core remains DSH-agnostic; worst case is disabling the plugin while the CLI form continues unaffected.

## Phased Delivery

Day-to-day development procedure (host setup, Creator-mode online loop, flow-customization checklist) lives in `docs/process/dsh-plugin-development-guide.md`.

| Phase | Deliverable | Verification gate |
| --- | --- | --- |
| P1 ✅ delivered 2026-08-23 | StepExecutor seam over the delegates injection points; ProcessExecutor wrapper; programmatic orchestration entry + `EXIT_MAP` hoist; driver validation; embed-mode gating of startup diagnostics; module-boundaries.md update | full engine test suite green (incl. exit-map pinning); CLI behavior unchanged (`run demo` smoke test) |
| P2 ⏳ partially delivered 2026-08-23 (M2-WI6 + M2-WI7) | Plugin shell + NativeExecutor; `mdcontrol.run` executing `demo` mission end-to-end natively. **Delivered (WI6)**: `plugin/dsh/` scaffold, bundle manifest, isolate-realm patch, build bundling + import-closure gate, plugin test entry. **Delivered (WI7)**: `DshNativeExecutor` (full dispatch chain, handle lifecycle, watchdog, exit synthesis, plugin-layer minimal tool spawn) + engine-bridge selection factory/native config wiring, unit-tested over a fake in-process agents service incl. an `orchestrateRun` full-chain callback smoke. **Remaining (P2 boundary)**: L2 dual-backend matrix (WI8), L3 host harness (WI9), `mdcontrol.*` async job contract (WI10) | demo mission completes with identical run-state shape; markers parsed; correction-retry exercised once artificially (full P2 gate; WI7 verified in the fake-agents unit domain only — no real host) |
| P3 | `onboarding` parity + descriptor registration + skills wired | onboarding fills copied docs identically to CLI form; subagents list healthy during run |
| P4 | AGE preset integration (AGE mode) + Mission Control status panel decision | preset + plugin compose without realm collision |

Each phase lands as its own plan under `docs/plans/` with draft review and closure audit per the standard workflow.

## Update Rule

When the StepExecutor interface, native dispatch chain, or packaging layout changes supported behavior, update this doc and the affected owner docs (`docs/architecture/module-boundaries.md`, `docs/architecture/mission-driver-baseline.md` §Driver selection and §Public Exports — the latter when P1 hoists `EXIT_MAP` out of `main.js`) in the same change.
