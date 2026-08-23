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

> **L3 implementation note (landed 2026-08-23, M2-WI9)** — the harness is implemented at `plugin/dsh/scripts/host-harness.mjs` (hand-written `HarnessLineRpcTransport` + session driver + four-scenario runner; composition per the §6 resolved note: demo bin + `plugin/dsh/test/fixtures/harness.cordis.yml`, 16 exact-`0.1.1-rc.2` devDeps). Transport pure-logic unit tests live at `plugin/dsh/test/host-harness-transport.test.mjs` (12 cases, fake streams, inside the plugin CI chain). The live gate is env-gated per §5; recorded green run (keyless stub endpoint, official e2e precedent): `docs/testing/2026/08-23.md` — 4/4 scenarios, exit 0, no orphans, stdout pure NDJSON. Real-model credential leg: `DSH_VERIFY_NATIVE=1 DEEPSEEK_API_KEY=… npm --prefix plugin/dsh run verify:native` (fail-fast verified without a key).

> **L2 implementation note (landed 2026-08-23, M2-WI8)** — the L2 matrix is implemented at `plugin/dsh/test/backend-parity-matrix.test.mjs` (+ shared harness `plugin/dsh/test/helpers/matrix-harness.mjs`), runs inside the plugin test chain, and is wired merge-blocking through the root aggregate gate `verify-age.sh` + `.github/workflows/age-ci.yml` (L1+L2 must both be green). Divergence ledger (3 entries, all owner-doc-backed) is documented in the spec header.
>
> **Seam erratum (2026-08-23, live-verified)** — the `__setRunnerFactoryForTest` reference in the L2 row above is stale: that seam (orchestrator.js:302) is consumed only by the draft pipeline (`cmdDraftMission`), never by the mission-run path. The real mission-run injection point is `orchestrateRun({ config, executor })` (`main.js` builds the runner and injects `ProcessExecutor(runner)`), so the L2 ProcessExecutor leg correctly injects `new ProcessExecutor(duck-typed fake runner)` through the StepExecutor seam; the NativeExecutor leg uses a fake in-process agents service. Real driver spawns stay with L3/L4. Recorded by plan `2026-08-23-1447-3` (draft review B1).

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

> **§4 double note (2026-08-23, M2-WI9 / plan `2026-08-23-1621-1`)**
>
> 1. **Harvest-surface erratum** (source-level, draft review iteration 3): "marker presence in `subagent.finished.lastAssistantMessage`" does NOT hold for direct root-session `session/prompt` turns — server source (`packages/sdk/server/src/server.ts`) forwards that notification only from `subagent/end` events, i.e. only for model-delegated child agents. The correct harvest surface for direct prompts is the **root-session last committed assistant text + `turn/end` reason, observed on the `session.event` stream** (official e2e precedent: repo-root `examples/jsonrpc-agent/tests/keyless-smoke.e2e.ts` — `session/prompt` then expect `turn/end`, no `subagent.finished`). The landed harness gates on the corrected surface; `subagent.finished` is a conditional, non-gating observation when delegation actually occurs (keyless run: count=0, as predicted).
> 2. **Run-state assertion adjudicated to L4/WI10**: the fourth sketch assertion ("run-state file written under the workspace") belongs to the L4 row + roadmap WI10 — the L3 harness composition (§6: spine/backends/`sdk-jsonrpc-server` only, no mission-control service row) runs no engine inside the host, so there is no run-state to write. The dual-form run-state diff's owner stays roadmap WI10 (P2 exit / P3 boundary).

## 5. CI Strategy

- L1/L2 run in plain CI (pure Node, no network) — merge-blocking.
- L3/L4 require a configured model endpoint and network: run as a scripted local gate (`npm run verify:native`) behind an explicit env flag; never CI-blocking until a hosted runner with credentials exists. Record outputs (run-state diff + harness log) into `docs/testing/` dated notes per repo convention.

> **L3 gate landed (2026-08-23, M2-WI9)** — `npm --prefix plugin/dsh run verify:native`: `DSH_VERIFY_NATIVE` unset/≠1 → explicit skip + exit 0 (CI stays green with no env — `./verify-age.sh` does not invoke it, verified); flag set but `DEEPSEEK_API_KEY` missing → fail-fast exit 1. A credential-free companion gate `npm run verify:native:keyless` runs the same four scenarios against a local stub OpenAI-compatible endpoint (official keyless-smoke precedent) — this is the recorded green run in `docs/testing/2026/08-23.md`. L4's `verify:native` extension (run-state diff output) remains WI10 scope.

## 6. Open Item (blocks L3 implementation, not its design)

The exact command/composition that boots a runtime **serving** `dsh-sdk-jsonrpc-server` (which profile or bundle row mounts the server; how `cordis.yml` is supplied) was not pinned during R1 — `packages/sdk/server/README.md` owns it. Resolve at P2 start before writing `host-harness.mjs`. Fallback if serving proves awkward early: drive L3 through repeated `dsh --profile headless "<step prompt>"` invocations (one-shot, stdout harvest), accepting weaker observability until the SDK path lands.

> **Resolved (2026-08-23, M2-WI9 / plan `2026-08-23-1621-1` Phase 1 Decision 1).** Startup composition pinned from official sources (local clone `~/ai/dsh-src/deepseek-harness`, same grounding as R1):
>
> - **Boot command**: the demo bin — `node <plugin/dsh/node_modules/.bin/dsh-jsonrpc-agent> <fixture>` (`@deepseek-ai/dsh-sdk-jsonrpc-demo@0.1.1-rc.2`, published plain-ESM `lib/bin.js`; config via `argv[2]`, env `DSH_CORDIS_CONFIG` wins if set; stdin EOF / SIGTERM → dispose root → exit 0).
> - **Config supply**: harness-owned fixture `plugin/dsh/test/fixtures/harness.cordis.yml` — 16-row composition based on the official repo-root `examples/jsonrpc-agent/cordis.yml` (the unattended non-PTY composition whose keyless e2e boots under piped stdio). Deliberate deltas: `maxTokensAsSuccess: false` pinned (samples diverge; affects only `subagent.finished.status` mapping, not root `turn/end`), persona pinned, model catalog pinned to `DSH_MODEL` (minimal-sample precedent), sessions `compression: none`, no thinking/effort rows. The minimal sample's PTY rows (`dsh-terminal` + `dsh-tool-bash-persistent` + danger-full-access sandbox) are absent — piped-stdio spawn has no POSIX terminal.
> - **Bare plugin resolution**: config lives under `plugin/dsh/test/fixtures/` → bare names resolve by Node module walk-up to `plugin/dsh/node_modules`; the 16 composition packages are exact-pinned `0.1.1-rc.2` **devDeps** (shipped `dependencies` unchanged; survey addendum in `docs/analysis/2026-08-23-0001-p2-version-survey.md`).
> - **Credentials**: `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` via process env only (`dsh-llm-deepseek` `apiKeyEnv` default); never written to the fixture.
> - **Fallback (d) adjudicated**: the one-shot `dsh --profile headless` stdout-harvest path above stays a documented degradation fallback only — it has no notification stream, which conflicts with this design's JSON-RPC notification-form assertions (§4). The SDK path landed; the fallback was not exercised.
>
> Live boot evidence (keyless, local stub endpoint, official `keyless-smoke.e2e.ts` precedent): full frame stream — `initialize` → `deepseek-harness-sdk-runtime`, `session/prompt` → `{messageId}`, `session.event` incl. `assistant/message` + `turn/end {kind:'completed'}`, `session.status` running→idle, `shutdown` → `{}` → exit 0.
