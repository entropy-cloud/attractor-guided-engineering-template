# DSH Host API Contract Verification (R1)

> Status: **preparatory research — verified against official host source**
> Date: 2026-08-22
> Owner: human (via opencode session)
> Source: shallow clone of `deepseek-ai/deepseek-harness` at `~/ai/dsh-src/deepseek-harness` (developer preview master). All paths below are relative to that tree. This report supersedes consumer-side inference from `DSH-better-sidebar` and community plugins wherever they disagree.
> Scope note: subagent internals (`packages/subagent/`) and SDK wire protocol (`packages/sdk/protocol/`) are located but not fully read — owned by R3 (verification harness design).

## 1. Agents Service — VERIFIED, richer than assumed

Authority: `packages/core/agent/src/index.ts`, `runtime-types.ts`.

- `AgentRegistry.create(options: CreateAgentOptions): Promise<AgentHandle>` / `.resume({ resumeSessionId, … })`.
- `CreateAgentOptions`: `sessionId`; optional `meta { cwd?, parentSession?, seedLength?, origin?: 'subagent', delegationDepth?, agentPreset? }`; `seed?: SessionEvent[]`; `agentOptions`; `signal`; **`setup?: AgentSetup`** — a scoped-context composition callback invoked before publication ("Setup composes, it never drives").
- `AgentHandle { agent; dispose(): Promise<void> }`. **`dispose()` stops the loop, awaits exit, unregisters the agent, and REMOVES ITS SESSION FROM THE STORE.** Consequence for NativeExecutor: keep one handle per mission run and dispose only at run end/abort; never dispose between steps — mid-run disposal destroys resumability that `resume()` would otherwise provide.
- `Agent` interface (`runtime-types.ts:64`): `id`, `options`, `session`, `inbox`, `status`, `ctx`, plus:
  - `AgentStatus = 'idle' | 'running'` (no third state).
  - **`whenIdle(): Promise<void>`** — resolves at whole-agent quiescence. This replaces our design's "poll/subscribe status until idle": use `whenIdle()` as the primary completion primitive.
  - `followup(message)` — queues an ordinary follow-up turn and wakes the driver (confirmed).
  - `cancel(cause, options?)` — graceful cancellation distinct from disposal; watchdog should `cancel()` first, `dispose()` only on hard timeout.
  - `send(message, target, wakeup)` — routes identified input to an inbox boundary with optional wake (distinct from `steer()`, the step-boundary steering primitive; potential future use for correction-retry without new turns).

## 2. Goals Family — VERIFIED, deeper than any consumer showed

`packages/goal/` has four sub-packages:

- `goal/` — core service. Goal fold-state machine: `phase ∈ {active, paused, blocked, complete}`, plus `id`, `objective`, `revision`, `maxGoalRounds`; fold validation rejects unknown field sets per phase (`fold.ts:97-105`). Storage follows the session-event fold pattern (durable log, not project files).
- `tool-goal/` — model tools. `update_goal` actions: `'edit' | 'pause' | 'resume' | 'complete' | 'blocked'`; phase enum `{active, paused, blocked, complete}`; prompt text actively tells the model how to respond to human continuation requests.
- `goal-round-driver/` — **a same-session continuation loop**: when an agent is idle with an armed active goal and remaining rounds, it checkpoints pending mutations, reserves round `n+1` against `(goalId, revision)`, and queues a `<goal_round>` prompt via `GoalMessageSource`, gated by an `agent/pre-step` listener that verifies the claimed record. This is DSH's own bounded agentic-loop driver — conceptually the closest native relative of our Flow DSL, but with fixed round semantics (no branching transitions, no script checks, no marker contracts). Comparison note for docs: `maxGoalRounds` ≈ our cycle budget; nothing native matches flow transitions or closure audits.
- `command-goal/` — `/goal` command + invariant.

Deny contract used by goal-quiescence is authoritative elsewhere: `packages/core/tools/src/index.ts:590` defines `| { kind: 'deny'; reason: string }` as a listener decision type (same family as approval denials at :1696-1720). Our planned `tools/pre-execute` reinforcement gate is on solid ground.

## 3. Plan Mode — VERIFIED: log-only, soft guidance

`packages/plan/plan-mode/README.md` (authoritative):

- State is `plan/mode` (`{active: boolean}`) — a log-only, whole-value-replace member of the session event map; `foldPlanMode(events)` recovers it on resume/fork/compaction.
- Explicitly **soft guidance**: "sandbox mode and approval policy enforce restrictions independently and do not read or write plan state."
- Exit path: `exit_plan_mode` tool whose acceptance requires an exact user approval through `ctx.userQuestions`; UI intent `plan-review` renders it as a decision card.
- Entry: `/plan [message]` command; non-off arguments steer the message into the next step under plan guidance.

Confirms the AGE comparison: native plan mode is a per-agent conversational posture stored in the session log — no project files, no cross-session artifact, no independent reviewer. AGE's `docs/plans/` + mandatory CLOSURE_AUDIT remains categorically different.

## 4. Headless Bundle — VERIFIED: official precedent for both L1 and NativeExecutor

`packages/bundle/headless/README.md` (`dsh --profile headless "task"`):

- Runner creates one fresh persisted Agent via `ctx.agents`, submits the task as an ordinary user message, **waits for quiescence**, flushes the session, writes the last non-empty assistant text to stdout, exits 0 on final `turn/end` else 1. No listening port; single task; no interactive follow-up surface.
- Implications:
  1. **L1 driver (`--driver dsh`) is real**: spawn `dsh --profile headless <prompt>`, parse stdout, exit code maps to process-driver semantics. The earlier open question is closed.
  2. The host itself implements our NativeExecutor shape (create → submit → quiescence → harvest text). We are following an in-tree precedent, not inventing one.
  3. Limitation inherited: headless is one-shot per invocation — exactly matches ProcessExecutor's per-step spawn model.

## 5. Bundle Manifest & Profile Composition — VERIFIED

`packages/boot/app-boot/src/profile.ts:5-16,38-45`:

- Bundle manifest: `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` (`DshBundleManifest { patch: string }`).
- Composition order: each bundle's patch rows in `dsh.profile.bundles` order over an empty entry list → profile's own `cordis.patch.yml` → launcher layers (`--patch` files, flag-derived).
- Resolution is two-anchor (dsh installation first, then profile directory).
- The profile user-patch layer is documented as "hot-reloaded on long-lived surfaces" — supports the dev guide's tight-loop recommendation.

## 6. Design-Doc Corrections Required (action items)

| # | Doc | Change |
| --- | --- | --- |
| A1 | packaging §Native Dispatch table | Replace "poll/subscribe `agent.status` until idle" with `await agent.whenIdle()`; keep status only for diagnostics. |
| A2 | packaging §dispatch chain Release row | Add warning: `dispose()` deletes the session from the store — handle lifetime = whole mission run; between-step continuation MUST reuse the live handle or `resume()`. |
| A3 | packaging §watchdog row | Hard-timeout sequence: `agent.cancel(cause)` → grace → `dispose()`. |
| A4 | packaging §Behavioral differences | New row: goal-round-driver is the native analog of loop-driving; document why Flow DSL still owns sequencing (transitions/script checks/markers/budgets beyond round counting). |
| A5 | design §Concept Mapping | Headless bundle cited as official precedent for both backends; strengthens L1 feasibility claim from "article-mentioned" to "source-verified". |

## 7. Remaining Unknowns (handed off)

- `packages/subagent/`: exact `SubagentRunEndInfo` shape and `snapshotSubagentDescriptor` requirements (consumer usage verified; host source pending) — needed before P3 descriptor work.
- `packages/sdk/protocol/`: message catalog for driving a runtime over stdio JSON-RPC — the foundation of R3's automated integration harness.
- Preset mounting loader (`preset.yml` consumption) — anchored-standard shows the consumer side; host loader unread. Needed only for P4 (AGE preset).
