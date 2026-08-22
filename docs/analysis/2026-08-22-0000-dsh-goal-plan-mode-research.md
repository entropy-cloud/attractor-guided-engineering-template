# DSH Goal/Plan Modes vs AGE Mission-Driver — Research Report

> Status: **research note — conclusions feeding Mission Control design** (`docs/design/dsh-plugin-integration.md`, `docs/architecture/dsh-plugin-packaging.md`)
> Date: 2026-08-22
> Owner: human (via opencode session)
> Sources: source-level reading of community plugins cloned under `~/ai/dsh-plugins/` — `dsh-goal-quiescence/src/index.ts` (195 lines, read in full), `goal-acceptance/packages/goal-acceptance/src/*` (~870 lines), `dsh-goal-scaffold/src/index.ts` (198 lines), plus README/structure review of `dsh-plannotator`, `DSH-Plan-Graph`, `dsh-task-dag`, `DSH-taskboard`, `dashi-taskboard`, `task-passport`. External DSH host behaviors are developer-preview facts and were not source-verified against the closed-source host tree.

## 1. Questions

1. How do goal/plan workflows actually get implemented in the DSH ecosystem — natively and by community plugins?
2. Where do they differ from mission-driver's roadmap → plan → single-agent-execute → independent-agent-audit loop?
3. What should Mission Control adopt, and what must it refuse?

## 2. DSH Native Goal/Plan Mechanics

The standard preset ships Planning and Goals as host services. Source evidence from the plugins that hook them:

- **Goals service**: `ctx.goals.get(agent)` returns `{ id, phase }` with `phase: 'complete' | …`; tools `create_goal` / `get_goal` / `update_goal` (with `action: 'complete'`) and a `/goal` chat command drive the lifecycle.
- **Binding and storage**: a goal is keyed by `(rootId, goalId)` against the owning agent; state lives in the session/host domain. Nothing in the observed tool surface writes project files. The durable record is the append-only session log (Trajectory).
- **Planning**: native plan mode exists as part of Standard, same session-scoped family.

Consequence: native goals/plans are **session-scoped execution aids**, not cross-session project artifacts. They cannot serve as the state authority for work that outlives a session or must travel through git.

## 3. Community Implementation Patterns

Four distinct patterns emerged from the code:

### Pattern A — Completion gate (interception): `dsh-goal-quiescence`

The cleanest host-gate implementation, 195 lines:

- `inject: ['agents', 'goals', 'subagents', 'tools']` (cordis DI).
- Listens to `subagent/start` / `subagent/end`, keeping an in-memory `RunRecord` map per goal (`running` → `settled` → `acknowledged`).
- Hooks `tools/pre-execute`: when the agent calls `update_goal` with `action: 'complete'` while any run is unsettled or unacknowledged, returns `{ kind: 'deny', reason: 'GOAL_QUIESCENCE_PENDING: …' }`.
- Registers two bounded tools: `goal_quiescence_status` (list blockers) and `goal_quiescence_ack` (explicitly inject one settled subagent's terminal message back into the goal agent's context).

Essence: **deny-until-quiescent + explicit evidence acknowledgement**. It produces no artifact; evidence lives only in the session.

### Pattern B — Acceptance criteria lock (protocol): `goal-acceptance`

- Event-sourced store **on session events**: `session.append('goal-acceptance/set' | 'validate' | 'task-update' | 'amend' | 'task-plan')`.
- A nine-tool protocol: `set_acceptance_criteria`, `get_acceptance_criteria`, `validate_criterion`, `confirm_criterion`, `update_task_status`, `amend_acceptance_criteria`, `can_complete_goal`, and `set_task_plan` (**requires criteria locked first**) / `get_task_plan`.
- An invariant companion (`ctx.invariants.register`) validates event structure and uniqueness across sessions.

Essence: **immutable acceptance criteria + formal pass/fail protocol**, preventing premature "done". Authority is still the session event stream — richer than goals, but again not git-committed project files.

### Pattern C — Plan-first scaffold (nudge): `dsh-goal-scaffold`

Intercepts oversized one-liner requests with a question ("This looks like a long task. Plan it first?"), then guides the model to write a **workspace-root `plan.md`** — a checklist where every item carries a minimal verifiable acceptance criterion — and create a capped goal referencing it. This is the closest community analog to AGE's file-based plans: the plan lands in the project directory. But it remains a single checklist file; there is no roadmap layer, no status machine beyond checkbox ticking, no second agent, and the goal state stays host-side.

### Pattern D — Human surfaces and observability

`dsh-plannotator` (select plan text in the Web UI, annotate line-by-line, return structured feedback to the agent), `DSH-Plan-Graph` / `dsh-task-dag` (trajectory/subagent topology rendering), `DSH-taskboard` ("SQLite is the sole task authority; Sessions, Goals, Workspaces remain the execution layer"), `task-passport` (cross-harness task handoff protocol).

## 4. State-Authority Comparison

| Dimension | Native Goals | Quiescence gate | Acceptance lock | AGE mission-driver |
| --- | --- | --- | --- | --- |
| State storage | host/session memory | in-memory map | session event stream | **git-committed files** (`docs/backlog/roadmap.md`, `docs/plans/*.md`, run-state JSON) |
| Who mutates state | owning agent via tools | nobody (gate only) | agent via protocol tools | agents write plan/roadmap files; engine writes run-state |
| Acceptance independence | none (self-completes) | evidence must be acknowledged — but acknowledged **by the same agent** | formal criteria pass — still self-declared | **structurally separate CLOSURE_AUDIT step = a second agent dispatch** producing an audit artifact |
| Enforcement point | tool call | `tools/pre-execute` deny | tool protocol + invariants | flow DSL transitions + deterministic script check on file contents |
| Budgets/guards | none observable | bounded tool set only | event validation | `maxRetries` / `onUnknownMaxRetries` / `maxCycleVisits` / `maxTotalSteps` per flow |
| Crash resume | session fork/replay | none | replay events | `run-state.json` atomic writes + `--from-step` |
| Survives session end | trajectory only | vanishes | trajectory only | **yes — plain files, git history** |

## 5. Core Differences from Mission-Driver

1. **Authority locus.** Every DSH pattern keeps truth inside the session/host boundary. AGE's non-negotiable is the opposite: internal execution state must be expressible as roadmap + plan files committed with git. This alone rules out adopting any of them as the state layer.
2. **Independence mechanism.** The gates enforce "not before X is acknowledged/criteria passed", but the acknowledging/passing party is always the implementing agent itself (or its parent). AGE makes acceptance a *different* agent invocation (CLOSURE_AUDIT) whose output is an audit record stored in the repo. Gate ≠ reviewer: a gate constrains timing; a reviewer produces independent judgment as an artifact.
3. **Loop orchestration.** Native mechanisms have no sequencing budget, retry classification, cycle guards, or disk-resumable state machine — that is exactly what the Flow DSL contributes (`plan-execution.json`: EXECUTE → CLOSURE_SCRIPT_CHECK → CLOSURE_AUDIT → BUILD_VERIFY). Host hooks cannot express "retry this branch at most 3 times, then degrade gracefully".
4. **Scale shape.** A goal is one objective in one session. A mission fans a roadmap out into multiple plans via forEach subflows, potentially across sessions and days, with humans reading the same files between runs.
5. **Where the DSH patterns are genuinely stronger** (fairness note): zero setup, available inside any ad-hoc session without project scaffolding, and their denial UX is immediate. AGE requires template installation and pays process overhead; that cost is the price of durable cross-session memory, and it is the point.

## 6. Implications for Mission Control Design

Adopt into `plugin/dsh/`:

- **`tools/pre-execute` deny as reinforcement, never replacement**: e.g., deny `plan-status → completed` edits unless run-state shows a closed CLOSURE_AUDIT visit. This hardens the flow contract at the host boundary; the flow engine remains the referee. (Pattern A.)
- **Evidence-return shape**: `SubagentRunEndInfo.lastAssistantMessage` mirrors our marker extraction — reuse it for native-dispatch result text instead of re-scraping. (Pattern A's ack insight.)
- **Workspace-root instinct validated**: scaffold's `plan.md`-in-project confirms community gravity toward file-based plans; Mission Control uses the full `docs/plans/` schema rather than a single checklist. (Pattern C.)
- **Human annotation entry**: plannotator-style structured feedback maps onto draft-review participation in the Web panel. (Pattern D.)

Refuse:

- Session-event or SQLite stores as the state authority for mission execution (they may mirror/read-only-project, per the earlier Flow Portability verdict: DSH provides muscle and eyes; flow engine referees; git remembers).
- Any path where goal completion can bypass the second-agent audit.

## 7. Open Items

- Host `goals`/`invariants` service APIs cited here come from plugin-side typings; pin exact host versions when P2 starts and re-verify signatures.
- `dsh-external/dsh-plan-execute` (dual-model routing) is a private repo — unverified; orthogonal to independence, tracked as a future option only.
