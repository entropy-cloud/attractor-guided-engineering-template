# Project Vision

Describe the long-term product and engineering attractor for `mission-driver`.

## What mission-driver Is

`mission-driver` is a Flow DSL engine + monitor dashboard that automates the AGE (Attractor-Guided Engineering) development loop. It reads a mission config (`missions/<name>.json`), drives a state machine through CHECK → REVIEW_PLANS → EXEC_PLANS → DRAFT_PLANS → DEEP_AUDIT, and spawns `opencode run` subprocesses for each AI step.

## Long-Term Direction

1. **Be the canonical AGE loop engine.** Stay the single source of truth for AGE-driven AI development. Other projects reference it via `MISSION_DRIVER_HOME`; they do not fork it.
2. **Keep the engine zero-npm-dependency.** The clone-and-run promise (`node src/main.js` works on a fresh checkout) is non-negotiable. New functionality that would require runtime deps goes behind feature flags or stays in `tools/mission-driver/web/` (which has its own package.json).
3. **Stay observable.** Monitor dashboard + structured events + per-step logs are first-class. If a human cannot understand why a mission stalled, that is a defect.
4. **Self-improving via Reflexion.** `--analyze-run` postmortems distil durable lessons back into mission prompts. The memory system is part of the attractor, not a side feature.

## Non-Goals

- mission-driver is NOT a general-purpose AI agent framework. It is narrowly scoped to driving the AGE plan lifecycle.
- mission-driver is NOT a build system. It runs the project's own verification commands (`missions/<name>.json` `commands.test` / `commands.build` / etc.); it does not replace pnpm/npm/cargo/etc.
- mission-driver is NOT a spec-driven code generator. Plans describe scope and closure criteria; the AI implements; mission-driver drives the loop and audits the closure.
- The monitor dashboard is NOT a project management UI. It is a run inspector.
- mission-driver does NOT auto-merge or auto-push. Humans commit; mission-driver reports.

## Engineering Attractor (What The Codebase Should Keep Returning To)

- **Small core, deep tests.** `engine.js` is allowed to be large because the state machine is irreducibly complex; everything else should stay small. Tests are the attractor's safety net — never ship an engine change that drops test coverage.
- **Explicit public contracts.** CLI surface, `mission.json` schema, `draft-state.json` schema, `run-state.json` shape, `<BRIEF_GATE>` / `<AI_STEP_RESULT>` / `<MISSION_FILE>` markers, exit-code map — all documented in `mission-driver-baseline.md` + `EXECUTION-PRINCIPLE.md` + `CONTEXT.md`. Drift between docs and code is a defect.
- **Subprocess isolation.** Each AI step is a fresh `opencode run` child. The engine parent never trusts the child's internal state; it parses markers from stdout. This isolation is the attractor's robustness mechanism.
- **File-based state.** No database, no service, no daemon. State is JSON files under `_tmp/<runDir>/`. Recovery from a crash is `git status` + re-run.
