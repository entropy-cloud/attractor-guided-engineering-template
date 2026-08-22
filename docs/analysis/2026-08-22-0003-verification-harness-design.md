# Mission Control Verification Harness Design (R3)

> Status: **preparatory research — design for how the plugin gets proven**
> Date: 2026-08-22
> Owner: human (via opencode session)
> Grounding: SDK wire protocol read from official source (`packages/sdk/protocol/README.md`); headless bundle contract (`packages/bundle/headless/README.md`); engine test seams verified locally (`__setSpawnerForTest`, `__setRunnerFactoryForTest`, `prompt-check.mjs` chained into `npm --prefix tools/mission-driver test`). Unresolved item marked §6.

## 1. Goal

Every claim in `docs/architecture/dsh-plugin-packaging.md` must be checkable without manual clicking. This file defines the four test layers, the backend-parity matrix, and the automation skeleton.

## 2. Test Layers

| Layer | Target | Mechanism | Gate for |
| --- | --- | --- | --- |
| **L1 Unit** | Engine core refactor (StepExecutor seam, orchestration entry, EXIT_MAP hoist, driver validation, embed gating) | existing `node --test` suite (533+ cases) + `prompt-check.mjs`; new unit tests inject a fake StepExecutor via the same delegates seam (`delegates.runAgent/runParseAgent/runTool`) | P1 |
| **L2 Contract** | ProcessExecutor vs NativeExecutor behavioral equivalence | shared behavior-matrix spec run twice: once with the existing engine-path injection seam (`__setRunnerFactoryForTest` in `main.js`; note `executor.js` spawns directly with no injection point — real-spawn legs stay covered by L3/L4 rather than unit mocks), once with a fake in-process agents service implementing `{ create, resume, get, dispose }` returning scripted `Agent` doubles (`followup` → canned final text, `whenIdle()` → resolve) | P1/P2 boundary |
| **L3 Host Integration** | Real dispatch inside a live DSH runtime | SDK-driven harness (§4): boot a runtime that serves `dsh-sdk-jsonrpc-server`, drive it over stdio NDJSON JSON-RPC, assert on streamed notifications | P2 |
| **L4 Live Smoke** | End-user path | `demo` mission end-to-end: once via standalone CLI (`--driver opencode`), once via `mission-control-run` in a host session; diff run-state shapes | P2 exit / P3 |

## 3. Backend-Parity Matrix (L2 assertions)

Both executors must produce identical observable outcomes for:

1. Marker outcome classification (`pass`/`fail`/unknown → correction retry).
2. Correction-retry budget honored (`onUnknownMaxRetries`) and transient-fault backoff classification.
3. `run-state.json` shape: `steps[]` fields (`status`, `visits`, `marker`, `produced`, `sessionId`, timing) — `sessionId` value differs semantically (opencode `ses_*` vs native childId) but presence/type rules match.
4. Exit-code synthesis maps to identical `EXIT_MAP` terminal statuses.
5. Flow budget enforcement (`maxTotalSteps`, `maxCycleVisits`) fires identically.
6. Monitor renders both runs without special-casing (file-format identity).

## 4. L3 Harness Skeleton (SDK-driven)

From the verified protocol (`dsh-sdk-protocol`): newline-delimited JSON-RPC 2.0; client→server `initialize`, `session/prompt` (returns durable enqueue receipt), `shutdown`; server→client notifications `session.event` (unfiltered envelopes), `session.status` (`running`/`idle`), `subagent.started`, `subagent.finished` (**carries `lastAssistantMessage`** — the same text our marker parser consumes).

```js
// scripts/host-harness.mjs (P2 deliverable) — sketch
const proc = spawn(runtimeCmd, profileArgs)            // runtime serving the SDK server (§6)
const transport = new JsonRpcLineTransport(proc.stdin, proc.stdout)
await transport.request('initialize', params)
await transport.request('session/prompt', { /* mission step prompt */ }) // returns durable enqueue receipt (SessionPromptResult.messageId)
for await (const note of transport.notifications()) {
  if (note.method === 'subagent.finished')             // lastAssistantMessage
    assertMatchesMarker(note.params)
  if (note.method === 'session.status' && note.params.status === 'idle')
    break                                              // turn settled
}
await transport.request('shutdown', {})
```

Assertions available without any UI: marker presence in `subagent.finished.lastAssistantMessage`; quiescence arrival; absence of orphan processes after run end; run-state file written under the workspace.

## 5. CI Strategy

- L1/L2 run in plain CI (pure Node, no network) — merge-blocking.
- L3/L4 require a configured model endpoint and network: run as a scripted local gate (`npm run verify:native`) behind an explicit env flag; never CI-blocking until a hosted runner with credentials exists. Record outputs (run-state diff + harness log) into `docs/testing/` dated notes per repo convention.

## 6. Open Item (blocks L3 implementation, not its design)

The exact command/composition that boots a runtime **serving** `dsh-sdk-jsonrpc-server` (which profile or bundle row mounts the server; how `cordis.yml` is supplied) was not pinned during R1 — `packages/sdk/server/README.md` owns it. Resolve at P2 start before writing `host-harness.mjs`. Fallback if serving proves awkward early: drive L3 through repeated `dsh --profile headless "<step prompt>"` invocations (one-shot, stdout harvest), accepting weaker observability until the SDK path lands.
