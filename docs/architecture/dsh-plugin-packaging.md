# DSH Plugin Packaging — Technical Architecture

> **Status: P1 DELIVERED (2026-08-23) — StepExecutor seam, ProcessExecutor, programmatic orchestration entry + EXIT_MAP hoist, driver validation, and embed-mode gating have landed (M1-WI1..WI5). P2 DELIVERED (2026-08-23, M2-WI6 + M2-WI7 + M2-WI8 + M2-WI9 + M2-WI10): the plugin shell (`plugin/dsh/` bundle manifest + isolate-realm patch + build bundling with an import-closure gate), the NativeExecutor dispatch backend + engine-bridge backend-selection factory, the L2 dual-backend parity matrix (merge-blocking via `verify-age.sh` + `age-ci.yml`), the L3 host-integration harness (`scripts/host-harness.mjs` + env-gated `verify:native` local gate; recorded keyless green run in `docs/testing/2026/08-23.md`), and the `mdcontrol.*` route layer with the async job contract + plugin-level active-run guard + the L4 dual-leg e2e (`mdcontrol.run` immediate start → `mdcontrol.status` polling on a real in-process cordis runtime; `npm run verify:e2e` gate; identical normalized run-state shape, markers parsed, one artificial correction-retry recovered — evidence `docs/testing/2026/08-23.md`) have landed. P3 first slice delivered (2026-08-23, M3-WI11: onboarding dual-form parity + descriptor registration + the monitor step-log dual-label fix — same `verify:e2e` gate, evidence `docs/testing/2026/08-23.md`). P3 remainder (WI12–WI13) and P4 remain planned.** Phase gates below define when each remaining claim becomes supported behavior.

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

New top-level directory in this repository — **landed 2026-08-23 (M2-WI6, extended M2-WI7 + M2-WI8 + M2-WI9 + M2-WI10)**, tree below is the as-built state (files marked with their owning work item):

```
plugin/dsh/
├── package.json          # LANDED: `dsh.bundle.patch` manifest + exact-pinned @deepseek-ai/* deps
│                         #   + WI9: 16 exact-pinned L3-composition devDeps + verify:native[:keyless] scripts
│                         #   + WI10: 17th devDep @deepseek-ai/dsh-app-boot (in-process e2e boot) + verify:e2e
├── cordis.patch.yml      # LANDED: `- insert:` op → cordis:group with isolate realm → service row
├── tsconfig.json         # tsc --noEmit over src/*.ts (allowJs: engine bundle JS enters as inferred types)
├── scripts/
│   ├── check-manifest.mjs     # structural manifest/patch validation (plain-YAML, dev-dep `yaml`)
│   ├── build-bundle.mjs       # copy-style engine bundling + import-closure gate (+ `--check` freshness)
│   ├── smoke-import.mjs       # no-host bundle import smoke (all 5 entry modules, zero npm resolution)
│   ├── host-harness.mjs       # LANDED (WI9): L3 harness — HarnessLineRpcTransport + session driver
│   │                          #   + 4-scenario runner (--dry / --keyless / --scenario); NOT bundle content
│   ├── verify-native.mjs      # LANDED (WI9): env-gated L3 local gate; never CI-blocking (R3 §5)
│   ├── e2e-policy.mjs         # LANDED (WI10): shared deterministic model policy (STEP-TOKEN pure
│   │                          #   function; artificial marker break + correction signature)
│   └── e2e-demo.mjs           # LANDED (WI10): L4 dual-leg e2e — CLI leg (real engine child + PATH-first
│                              #   `opencode` stub) + native leg (in-process boot() + route direct calls)
│                              #   + normalized diff + markers-parsed + correction-retry assertions;
│                              #   `verify:e2e` gate (explicit local, never CI-blocking)
├── test/
│   ├── bundle-scaffold.test.mjs        # plugin local test entry (WI6) — reused by WI7/WI8/WI10
│   ├── native-executor.test.mjs        # NativeExecutor unit branches (WI7; fake agents service)
│   ├── engine-bridge.test.mjs          # selection factory + native config + orchestrateRun smoke (WI7)
│   ├── backend-parity-matrix.test.mjs  # L2 dual-backend parity matrix, six assertion groups (WI8)
│   ├── host-harness-transport.test.mjs # LANDED (WI9): 12 pure-logic transport cases (fake streams)
│   ├── mdcontrol-routes.test.mjs       # LANDED (WI10): routes + async contract + guard + receipt +
│   │                                   #   HTTP dispatcher, 17 cases (fake HostContext/agents, direct calls)
│   ├── fixtures/
│   │   ├── harness.cordis.yml          # LANDED (WI9): L3 composition fixture — 16 rows, non-PTY base
│   │   └── e2e.cordis.yml              # LANDED (WI10): L4 in-process composition — L3 base minus the sdk
│   │                                   #   server plus the REAL mission-control service row (relative
│   │                                   #   specifier, non-isolated for root-realm route access)
│   └── helpers/
│       ├── fake-agents.mjs             # reusable fake in-process agents service (WI7; matrix-extended WI8)
│       └── matrix-harness.mjs          # shared L2 matrix harness: both legs + comparators (WI8; the
│                                        #   normalizeRunState vocabulary is reused by the WI10 e2e diff)
├── src/
│   ├── service.ts        # LANDED (WI10): route wiring — cordis Service publication (`mdcontrol`) +
│   │                     #   optional /mdcontrol/api HTTP dispatcher + mount log; skeleton was WI6
│   ├── native-executor.ts# LANDED (WI7): DshNativeExecutor — full StepExecutor over the agents service;
│   │                     #   WI10: agentOptions {provider,model} + resolveAgentsService (ctx.get first)
│   ├── mdcontrol-routes.ts # LANDED (WI10): mdcontrol.run/status/list wire-method record + ActiveRunGuard
│   │                     #   + opt-in terminal receipt (agents.get → followup) + HTTP dispatcher
│   └── engine-bridge.ts  # LANDED (WI7): resolveExecutor factory + bootstrapNativeConfig + runNativeMission;
│                         #   WI10: beginNativeMission detached-start primitive (async job contract)
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

L3 harness composition devDeps (added 2026-08-23, M2-WI9 — same survey doc, Addendum section): sixteen packages at exact `0.1.1-rc.2` (bin `dsh-sdk-jsonrpc-demo`, server `dsh-sdk-jsonrpc-server`, and the 14 spine/backend rows of `test/fixtures/harness.cordis.yml`) — devDependencies only, so the shipped bundle dependency surface is unchanged. The `latest` dist-tag of these packages lags at `0.0.1-rc.x`; pins are therefore literal versions, never tags. The L4 e2e boot added a 17th exact devDep, `@deepseek-ai/dsh-app-boot@0.1.1-rc.2` (M2-WI10 — same cohort; `boot()` for the in-process e2e composition), same devDependencies-only posture. The L3/L4 verification surface itself (composition, transport, gate posture) is owned by R3 (`docs/analysis/2026-08-22-0003-verification-harness-design.md` §4-§6).

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

Contract preservation rules (each machine-pinned by the L2 backend-parity matrix since M2-WI8 — `plugin/dsh/test/backend-parity-matrix.test.mjs`, merge-blocking via `verify-age.sh` + `.github/workflows/age-ci.yml`; divergence ledger in the spec header, every entry owner-doc-backed):

1. **Marker contracts unchanged.** `<AI_STEP_RESULT>pass|fail</AI_STEP_RESULT>`, `<BRIEF_GATE>…</BRIEF_GATE>`, and all step-transition markers keep their definitions (`docs/architecture/mission-driver-baseline.md` §Marker Contracts). NativeExecutor returns the child agent's final assistant message text as `text`; the engine's existing extraction, correction-retry (max 2 re-prompts), and transient-fault backoff operate on it unmodified. *(Matrix: groups 1–2 — classification, correction budget, transient classification identical across both backends.)*
2. **Run-state shape unchanged.** `_writeWorkflow` atomic writes, `steps[]` fields including `sessionId`, remain the durable surface shared with the monitor. *(Matrix: groups 3+6 — normalized run-state shape (field sets/types/status sequences; sessionId presence/type per R3 §3, timing presence/type only) and artifact file-set existence identical; the monitor's consumption surface IS the run-state file, so shape identity is monitor identity.)*
3. **Exit semantics synthesized.** Where ProcessExecutor yields real exit codes and stderr tails, NativeExecutor synthesizes compatible values (`code: 0` on completed turn with parseable outcome; `code: 1` + `errorTail` on abort/error) so the hoisted `EXIT_MAP` terminal-status mapping and retry budgets behave identically. *(Matrix: group 4 — synthesized exit → engine terminal status → `EXIT_MAP` lookup identical on both legs, 8/10 keys end-to-end; group 5 — `maxTotalSteps`/`maxCycleVisits`/`maxRetries` budgets fire identically.)*

## Native Dispatch API Chain

The implementation follows the verified in-process pattern used by DSH-better-sidebar's sidechat feature (`src/sidechat-routes.ts`; upstream: <https://github.com/omdsh-dev/DSH-better-sidebar> — an offline clone is kept at `~/ai/dsh-plugins/DSH-better-sidebar` for local reference only):

| Step | Host API | Notes |
| --- | --- | --- |
| Resolve service | `ctx.get('agents')` | degrade to wire error if absent. (M2-WI10 e2e finding: on a real cordis context a service property read without a declared `inject` THROWS — the plugin resolves the agents face via `ctx.get(name)`, `resolveAgentsService` in `native-executor.ts`.) |
| Create child agent | `agents.create(options)` → `{ agent, dispose() }` | `options.sessionId` = generated child id; `options.meta` carries `{ cwd: projectRoot, origin: 'subagent', delegationDepth, agentPreset, seedLength }`; `options.seed` = one durable `subagent/descriptor` event (WI11: `snapshotSubagentDescriptor` + `seedDescriptorTurn` from `@deepseek-ai/dsh-subagent`, staged like the sidebar precedent — cold children without a descriptor render as 'corrupt' diagnostics in host enumeration); `options.signal` = timeout; `options.agentOptions = { provider, model }` (M2-WI10 e2e finding: a real-host turn without them fails "has no provider/model" — sdk-jsonrpc-server `createSession` + dsh-headless precedents; provider defaults `deepseek-official`, model prefers engine `config.model` then `DSH_MODEL`) |
| Dispatch prompt | `agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))` | text = assembled prompt template output, prefixed by a `[MISSION_DRIVER:<runId>]` boundary line; in native mode the prefix serves log/run-dir identifiability only (the orphan reaper identifies OS processes by command line, which native child agents do not have) |
| Await completion | `await agent.whenIdle()` — whole-agent quiescence promise (host SDK `runtime-types.ts`) | replaces log-mtime heartbeat; `agent.status` (`idle`/`running`) kept for diagnostics only |
| Read result | final assistant message from `agent.session.events` | fed to marker extraction as `text` |
| Continue session | `agents.resume({ resumeSessionId })` when the handle went cold between steps | native continuity; supersedes regex session scraping |
| Release | `handle.dispose()` | deterministic cleanup after each run or abort. ⚠️ `dispose()` stops the loop AND removes the session from the store — the handle must live for the whole mission run; between steps reuse the live handle, and only `resume()` can recover a persisted session after disposal |

Each run child registers ONE durable descriptor at create (WI11, landed): mode `continuable`, provider `mdcontrol`, label `Mission: <mission>` (runId fallback), `agentProvider`/`agentModel` mirroring the create `agentOptions`. As-built shape: the handle is one child per RUN (reused across steps, R1-A2) — so the descriptor row is run-level, and step-level progress surfaces through run-state/monitor (channel 1), not through per-step descriptor rows. Enumeration health only: the host list plane is parent-scoped (`listChildren(parentSessionId)`), and an mdcontrol child carries no DSH parent session, so the row's guaranteed reach is the persisted child session log (`subagent/descriptor` event survives compaction) — exactly the e2e assertion plane; `agents.resume` needs no re-seeding (the seed is durable session state).

Terminology glosses for reviewers unfamiliar with the DSH host: **isolate realm** — a cordis service scope that keeps a plugin's mounted instances private instead of process-global; **wire error** — a structured RPC error surfaced to the client UI; **`dsh.bundle.patch`** — the package.json manifest field declaring this package as a mountable DSH bundle plugin.

### Implementation state and boundaries (M2-WI7, landed 2026-08-23)

The dispatch chain above is implemented in `plugin/dsh/src/native-executor.ts` (`DshNativeExecutor`) and wired by `plugin/dsh/src/engine-bridge.ts` (`resolveExecutor` + `bootstrapNativeConfig` + `runNativeMission`). Verified in the fake-agents unit domain only (no real host — L3 belongs to WI9; native end-to-end belongs to WI10). Implementation boundaries, all deliberate:

- **Model selection: the parse distinction is ignored, a single model now flows**: `mission.model` passes through to `agentOptions.model` on create since M2-WI10 (one model for every dispatch — agent, parse, and correction turns alike); `parseModel` (the cheap-parse distinction) remains ignored in native mode — `executeParseAgent` and `executeAgent` collapse to the same dispatch on the same child session. See §Behavioral differences below.
- **Log artifacts are written but content shape is not byte-equivalent**: `logFile`/`promptFile` land in the engine run-dir with the same naming convention (`native-<step>-<ts>-<rand>.log` + `.prompt`); the log body is the harvested assistant text plus a header/round summary, NOT a subprocess stdout transcript (file existence/readability is the compatibility contract; byte-level content shape is not). **M2-WI10 monitor-check correction, CLOSED by M3-WI11**: run-state-based rendering was never affected; the monitor's step-log endpoints (`listStepLogs` / `handleGetLog` / `handleGetNodeDetail`) matched the `oc-` prefix convention only — since WI11 they accept the shared dual-label shape (`oc-` / `native-`), machine-pinned by engine monitor unit cases + the e2e `assertMonitorRender` pass over all four runs (fix details and the third-site (:929) enumeration gap in `docs/bugs/2026-08-23-monitor-native-log-naming.md`, closed).
- **`executeTool` is the plugin layer's own minimal spawn**: `child_process` spawn + timeout + exit code + output tail, ZERO diagnostics — no `sysSnapshot`, no `~/.mission-driver/active/` touch. Reusing the engine `executor.js` tool path was rejected because its heartbeat pair is intentionally not embed-gated ("a native-mode embed host never selects this backend") — sharing it would run execSync snapshots and active-run registry touches inside the DSH host, the exact host-invasive behavior M1-WI4's embed gating prevents. Known residual drift (the process-path `runTool` currently drops the engine's `timeout` opt; the native path consumes it as milliseconds) is pinned by the WI8 L2 matrix's tool-step assertions (landed: scenario `tool-timeout-drift` in `plugin/dsh/test/backend-parity-matrix.test.mjs`, divergence ledger D1).
- **No silent fallback**: missing `ctx.agents` (or a failing native create) surfaces as an explicit wire error to the caller — never an implicit ProcessExecutor downgrade.
- **Callback contract mirrors runner.js exactly**: `onStepUpdate` is resolved at call time (`opts.onStepUpdate ?? config.onStepUpdate`, both with `typeof === "function"` guards) because `orchestrateRun` assigns `config.onStepUpdate` only after executor construction; two-point callbacks fire files-first (`{stepName, logFile, promptFile}`) then session (`{stepName, sessionId}`), so subflow wrapping and the monitor live channel behave identically in native mode.
- **`stderrTail` is always null natively** (no subprocess stderr surface; `errorTail` carries the error text); exit codes are synthesized per contract-preservation rule 3.

### Behavioral differences vs ProcessExecutor (documented, accepted)

| Concern | Process behavior | Native behavior |
| --- | --- | --- |
| Permissions | `--dangerously-skip-permissions` bypass | child inherits host sandbox/approval stack; stricter by default. AGE worker preset must carry a tool catalog sufficient for execute/closure steps |
| Model selection | `mission.model` opencode-style ids passed through; `parseModel` routes no-marker parse fallback + marker-correction retries to the cheaper model | since M2-WI10 `mission.model` flows to `agentOptions.model` (single model, one child session); `parseModel` remains ignored (documented gap, not silently pretended): every step — parse and correction retries included — dispatches on the same host-configured agent; later phases map both to DSH `ModelSelectionRef` |
| Watchdog | 60-min log-idle SIGTERM | hard per-step timeout: `agent.cancel(cause)` first, `dispose()` as last resort; no partial-output grace |
| Native loop-driver precedent | — (n/a) | host's own `goal-round-driver` drives bounded same-session rounds via a queued prompt gated by an `agent/pre-step` listener; Flow DSL still owns sequencing because it adds branching transitions, script checks, marker contracts, and per-branch budgets beyond round counting |
| Crash isolation | child crash contained by OS | runaway turn bounded by abort + dispose + model-side budget; correction-retry still applies |

Official in-tree precedent for the whole dispatch shape: `@deepseek-ai/dsh-headless` creates one persisted Agent via `ctx.agents`, submits the task, waits for quiescence, and harvests the last non-empty assistant text (`packages/bundle/headless/README.md`) — validating NativeExecutor (in-process) and a one-shot CLI driver against host-own usage. A corresponding `dsh` ProcessExecutor driver value is a post-M2 candidate and is intentionally absent from the WI3 whitelist until then.

## Service Surface (Mission Control)

The cordis service mounts once in an isolate realm (preset-style mounting precedent: `dsh-anchored-standard/preset/agent.cordis.yml`) and registers:

- Routes (namespace `mdcontrol.*`) — **as-built (M2-WI10, plan `2026-08-23-1621-2`)**: `run`, `status`, `list` are live in `plugin/dsh/src/mdcontrol-routes.ts`; `draft` and `analyze` are adjudicated to M3 (WI12 completion precondition — plan §Deferred But Adjudicated). Thin wrappers over engine orchestration, never reimplementing engine logic. Exposure surface (better-sidebar precedent, host-source verified): the wire-method FULL-NAME record is the primary surface — published as the cordis service `mdcontrol` (`ctx.get('mdcontrol').routes`, Service-subclass form like the host's own AgentRegistry) — plus the plugin's own HTTP dispatcher at `POST /mdcontrol/api/<method>` (`{ok:true,value}` / `{ok:false,error:{code,message}}` envelope, wire codes `bad-request|not-found|run-in-progress|internal`) registered through `ctx.get('webServer')` when the host provides one; headless compositions degrade to a mount-log line, never a mount failure.
- **Async job contract** — **as-built (M2-WI10)**: `mdcontrol.run` NEVER blocks on mission completion — a mission takes tens of minutes to hours, and a synchronous wait would hang the calling agent's turn until timeout. The route validates config (bootstrap + executor selection before the task exists — failures are fail-fast wire errors with the guard never occupied), starts the engine loop as a detached in-host task (`engine-bridge.ts` `beginNativeMission`: `orchestrateRun` simply not awaited — zero engine diff; the hanging promise never rejects; the single run-terminal executor dispose lives in its finally arm), and returns immediately with `{ runId, status: 'started', runDir, startedAt }`. runId = basename of the engine runDir — the same value the engine stamps into `run-state.json.runId`, so route, run-state, and monitor share one vocabulary. Progress flows through `mdcontrol.status` (thin `run-state.json` passthrough — no second state machine) and the monitor dashboard; `mdcontrol.list` enumerates runs (disk scan of `_tmp/*/run-state.json`, monitor listRuns precedent, merged with this instance's live records). On terminal state the engine optionally posts a one-line summary back to the requesting agent (`followup: { sessionId }` opt-in; `agents.get` → `agent.followup` — see §Dependency and Version Risk for the six-call ledger). Session lifetime is decoupled: closing the chat session that started a run does not stop it (a dead receipt target is a warn-only skip). Precedent in-tree: `draft-job.mjs` already uses exactly this pattern (detached job + state file + monitor polling).
- Skills: `mission-control-run`, `mission-control-draft`, `mission-control-analyze` — natural-language entry points that call the routes — **M3-WI12**.
- Reinforcement gate (planned): a `tools/pre-execute` listener denying plan-status `completed` edits while run-state shows no closed CLOSURE_AUDIT visit — hardens the flow contract at the host boundary; consumes `@deepseek-ai/dsh-goal`/`dsh-tools` typings when it lands.
- **One mission run at a time per project root — landed (M2-WI10)**: a plugin-level `ActiveRunGuard` owned by the `mdcontrol.*` routes (in-service registry keyed by resolved projectRoot; cleared on every terminal path — success, engine failure, task crash, start failure; concurrent same-root start = explicit `run-in-progress` wire error). This is deliberately stricter than the engine (the CLI startup reaper explicitly spares concurrent active runs and supports N parallel runs, including same-root); the plugin starts conservative and may relax later. Concurrent runs across different roots remain independent engine instances. (Adjudicated in plan `2026-08-23-1447-1` §Deferred But Adjudicated; collected by this plan — ledger closed there.)

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
2. DSH native subagents topology UI — one healthy run-level child descriptor per run (`Mission: <mission>`, continuable); step-level progress flows through channel 1.
3. In-chat query — `mdcontrol.status` reads run-state without dispatching any AI.
4. Trajectory view — child-agent turns are ordinary session logs, filterable by source.
5. Completion summary returned through the skill.

Realtime leader is channel 1 (SSE pushes step-level events); an M4 RPC-direct panel would swap its data source, not its schema.

## Dependency and Version Risk

`@deepseek-ai/*` packages used by the plugin layer (`dsh-agent`, `dsh-subagent`, cordis core; `dsh-goal`/`dsh-tools` join only when the pre-execute reinforcement gate lands) are developer-preview and versioned pre-release (reference pinning practice: better-sidebar pins `@deepseek-ai/dsh-subagent@0.0.1-rc.1`). Mitigations:

- The plugin touches exactly **six** host calls (`create`, `resume`, `followup`, `status`, `dispose`, plus `get` since M2-WI10 — the terminal-receipt lookup `agents.get(sessionId) → agent.followup(...)`, host-source verified at `AgentRegistry.get` in `packages/core/agent/src/index.ts` ["Look up a live agent … undefined when no live agent has that id"], live-agents-only semantics, returns the bare Agent without a handle) plus descriptor registration; breakage repair is localized to `native-executor.ts` / `mdcontrol-routes.ts`. (The original five-call pin was amended by plan `2026-08-23-1621-2` Phase 1 Decision 3, which performed the verification obligation.)
- Host package versions are pinned per release; bumping is an explicit changelog event.
- Engine core remains DSH-agnostic; worst case is disabling the plugin while the CLI form continues unaffected.

## Phased Delivery

Day-to-day development procedure (host setup, Creator-mode online loop, flow-customization checklist) lives in `docs/process/dsh-plugin-development-guide.md`.

| Phase | Deliverable | Verification gate |
| --- | --- | --- |
| P1 ✅ delivered 2026-08-23 | StepExecutor seam over the delegates injection points; ProcessExecutor wrapper; programmatic orchestration entry + `EXIT_MAP` hoist; driver validation; embed-mode gating of startup diagnostics; module-boundaries.md update | full engine test suite green (incl. exit-map pinning); CLI behavior unchanged (`run demo` smoke test) |
| P2 ✅ delivered 2026-08-23 (M2-WI6 + M2-WI7 + M2-WI8 + M2-WI9 + M2-WI10; WI10 evidence complete — prereq WI9 `done` verified at delivery time) | Plugin shell + NativeExecutor; `mdcontrol.run` executing `demo` mission end-to-end natively. **Delivered (WI6)**: `plugin/dsh/` scaffold, bundle manifest, isolate-realm patch, build bundling + import-closure gate, plugin test entry. **Delivered (WI7)**: `DshNativeExecutor` (full dispatch chain, handle lifecycle, watchdog, exit synthesis, plugin-layer minimal tool spawn) + engine-bridge selection factory/native config wiring, unit-tested over a fake in-process agents service incl. an `orchestrateRun` full-chain callback smoke. **Delivered (WI8)**: L2 dual-backend parity matrix (six R3 §3 assertion groups over ProcessExecutor-with-fake-runner vs NativeExecutor-with-fake-agents; 3 divergence-ledger entries all owner-doc-backed) wired merge-blocking through root `verify-age.sh` + `.github/workflows/age-ci.yml`. **Delivered (WI9)**: L3 host-integration harness — `scripts/host-harness.mjs` boots a real spawned DSH runtime serving `dsh-sdk-jsonrpc-server` (16-row non-PTY composition fixture + exact-pinned devDeps, R3 §6 resolved) and drives it over stdio NDJSON; four-scenario green run recorded keylessly (official e2e precedent) in `docs/testing/2026/08-23.md`; env-gated `verify:native` local gate (skip without flag / fail-fast without key / never CI-blocking, R3 §5); 12 transport unit cases inside the plugin CI chain. **Delivered (WI10, plan `2026-08-23-1621-2`)**: `mdcontrol.run/status/list` route layer + async job contract (`beginNativeMission` detached in-host task, immediate `{runId, status:'started'}`) + plugin-level active-run guard (single run per projectRoot, 1447-1 adjudication collected) + opt-in terminal receipt (`agents.get` sixth host call) + L4 dual-leg e2e (`npm run verify:e2e`: real standalone-CLI leg + real in-process cordis-runtime leg over a deterministic scripted model endpoint; three consecutive green runs recorded in `docs/testing/2026/08-23.md`) | demo mission completes with identical run-state shape (normalized dual-leg diff EMPTY, `e2e-report.json`); markers parsed (every AI step's marker valid for its transitions, both legs); correction-retry exercised once artificially (REVIEW `banana` break → exactly one correction re-prompt → recovered to `completed`). Known boundary recorded, non-blocking: monitor step-log endpoints are `oc-`-prefix-only for native-named artifacts (`docs/bugs/2026-08-23-monitor-native-log-naming.md`) |
| P3 partially delivered 2026-08-23 (M3-WI11; WI12–WI13 remain) | `onboarding` parity + descriptor registration + skills wired | WI11 landed (plan `2026-08-23-1852-1`): onboarding dual-form parity proven in the deterministic stub domain (extended `verify:e2e`: both forms complete with EMPTY normalized run-state diff, markers valid for the real mission-driver flow, bounded one-loop script — mechanism-plane assertions only, doc-quality semantics out of the deterministic gate) + descriptor registration at create (durable `subagent/descriptor` seed, machine-asserted in the e2e native legs' persisted session logs) + the WI10 monitor step-log finding fixed engine-side (dual-label `oc-`/`native-` endpoints, bug closed). **First-half gate evidence delivered**; "subagents list healthy during run" is evidenced on the child-session-events plane (the host list plane is parent-scoped and unreachable for parentless mdcontrol children — enumeration-health guarantee, not a defect). Remaining for full P3: WI12 skills/route wiring, WI13 pre-execute gate |
| P4 | AGE preset integration (AGE mode) + Mission Control status panel decision | preset + plugin compose without realm collision |

Each phase lands as its own plan under `docs/plans/` with draft review and closure audit per the standard workflow.

## Update Rule

When the StepExecutor interface, native dispatch chain, or packaging layout changes supported behavior, update this doc and the affected owner docs (`docs/architecture/module-boundaries.md`, `docs/architecture/mission-driver-baseline.md` §Driver selection and §Public Exports — the latter when P1 hoists `EXIT_MAP` out of `main.js`) in the same change.
