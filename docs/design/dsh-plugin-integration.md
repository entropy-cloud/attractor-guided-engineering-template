# DSH Plugin Integration (AGE Mission Control)

> **Status: PLANNED — not yet implemented.** This doc describes the target feature baseline. Nothing in the "Plugin form" columns or sections below is supported today; the standalone form is the only current behavior. Implementation lands in phases (see `docs/architecture/dsh-plugin-packaging.md` §Phased Delivery), and this file converts to supported-baseline status as phases close.

## Purpose

Define the app-layer feature design for packaging this repository's AGE methodology and mission-driver engine as a DeepSeek Harness (DSH) plugin, so that the AGE development loop can run inside a DSH session with **native agent dispatch** instead of per-step subprocess spawning.

This is a feature owner doc (`docs/design/` owns stable app-layer feature design). The implementation-level technical plan lives in `docs/architecture/dsh-plugin-packaging.md`.

## Background

mission-driver today drives each AI step by spawning a headless CLI subprocess (`opencode run` default; `pi -p` via `--driver pi`). That design keeps the engine harness-agnostic but pays a cost per step: process startup, CLI flag/argument coupling, session-id regex scraping from log text, and no shared runtime with the user's interactive agent.

DSH ("everything is a plugin", built on Cordis) exposes an in-process agents service: a plugin can create child agents, dispatch prompts to them, await completion, and resume their sessions programmatically — no OS subprocess per AI step. Packaging mission-driver against that service gives plugin users a lighter loop while the standalone CLI path stays untouched.

## Dual-Form Product

The repository remains single-sourced. It ships in two consumption forms:

| Form | Status | Entry point | Execution backend | Audience |
| --- | --- | --- | --- | --- |
| **Standalone** | Supported (current) | `./install-age.sh` + `./tools/mission-driver.sh --driver opencode\|pi\|cline` | Process driver (spawn headless CLI per step) | Existing consumers; any harness; CI |
| **DSH plugin** | Planned | Install repo as dsh-plugin into a DSH profile | Native agent dispatch (in-process child agents) | DSH users running AGE inside Harness |

Both forms read/write the same on-disk artifacts (`missions/*.json`, `docs/plans/`, run-state JSON). Neither form copies the engine into consumer projects; the plugin form installs from this repository as a git/npm source into the DSH profile, preserving boundary rule 5 ("engine stays single-sourced").

## Feature Name: Mission Control

The DSH-facing surface of this plugin is named **Mission Control**(任务控制台)— the console from which missions are launched, watched, and postmortemed.

Naming rationale:

- keeps mission-driver vocabulary front and center ("mission"), unlike generic names such as "auto-loop"
- evokes the operations-console role: launch (run), flight watch (monitor), debrief (analyze)
- extends naturally: Mission Control panel (UI), mission-control skills (agent-invocable), `mdcontrol.*` routes (RPC)

Rejected alternatives: "auto-loop" (generic, no mission identity), "launchpad" (collides with existing dev-tool naming), "sortie" (obscure).

### User-visible capabilities (plugin form)

1. **AGE mode (agent preset) — as-built (M4-WI14)**: an AGE session posture selectable per session as a DSH agent preset (`age`). The preset contributes one system-prompt section (`age:mode`) — repo-as-source-of-truth working conventions, owner-docs routing, the Mission Control entry points (the three skills + the `/mdcontrol/api` HTTP face), and the async-job contract essentials — beside the standard coding toolset (shell, file read/write/edit, search, todo, skills, compaction; the host AGENTS.md digest keeps flowing via `agent-instructions`). The `age:mode` section also carries one authority-discipline line: host goals / plan mode / todos are session-local scratch and UI aids, never state — mission progress is authoritative only in the ledger (roadmap/plan checkbox + frontmatter), so host todo/goal status never counts as completion evidence and never flows back into the ledger (see `docs/discussions/2026-08-24-age-autonomy-design-independent-grill.md` A5). Mission children dispatched by Mission Control join the same composition when the project selects it (`missions/base.json` `"agent": "age"`), so every execute/closure step runs with a tool catalog sufficient for the AGE loop. Installation is a directory copy (dev guide §AGE Mode); the preset deliberately carries no service of its own — Mission Control stays the single mounted service.
2. **Mission Control skills** — agent-invocable skills registered in DSH sessions:
   - `mission-control-run <mission>` — start a mission run (demo / onboarding / custom)
   - `mission-control-draft <description>` — two-stage brief→draft mission generation
   - `mission-control-analyze [run]` — Reflexion postmortem of the most recent or named run

   As-built (M3-WI12): the three skills are live as runtime rows on `ctx.skills` (pure instruction bodies — the host skill form carries no executable handler). Entry chain: the model hits a skill through the session skill catalog + `skill` tool, then the loaded instructions direct the call to the matching `mdcontrol.*` route (`run`/`draft`/`analyze`) over the Mission Control HTTP API using an HTTP-capable session tool; run and draft return job handles immediately (progress via `mdcontrol.status` / the engine `draft-state.json`), analyze returns the postmortem result synchronously. Real-model natural-language invocation quality is an env/manual verification leg outside the deterministic gate.
2. **Native dispatch execution** — every agent step of a flow runs as an in-process child agent of the host; no `opencode run` process is created. Session continuity across steps is native (no regex scraping), restoring continuity that the `pi`/`cline` process drivers lack. As-built (M4-WI14): native mission children compose onto the project's configured agent preset (`missions/base.json` `agent` field) when the host runs a preset roster — the AGE worker posture of packaging doc §Behavioral differences.
3. **Subagents surface visibility** — each run registers one healthy run-level child descriptor (`Mission: <mission>`, continuable, provider `mdcontrol`) at child creation, so the run enumerates correctly instead of rendering as a corrupt row; step-level progress surfaces through the run-state/monitor channel (as-built: one child per run, reused across steps — M3-WI11 alignment).
4. **Monitor coexistence** — the standalone monitor dashboard remains usable against run-state files. As-adjudicated (2026-08-23, M4-WI15, plan `2026-08-23-2202-2`): a native Web UI panel is **deferred, not abandoned** — the host's static client-plugin surface is reachable from this bundle form with zero new shipped dependencies, but it is developer-preview and undocumented for external authors, and the panel's only unique value (DSH-embedded step-level status, poll-based over `mdcontrol.*`) has no recorded demand. Reopen triggers (any one): a stable, externally documented client-plugin authoring API; recorded demand for in-DSH step-level visibility where the standalone monitor is unreachable; monitor embedding ruled out while such demand exists. Until reopen, the monitor is the primary watching surface and in-chat `mdcontrol.status` the in-DSH channel.

## Concept Mapping

| AGE / mission-driver concept | Standalone form (current) | Plugin form (planned) |
| --- | --- | --- |
| AI step execution | spawn headless CLI per step | in-process child agent dispatch |
| Result contract | `<AI_STEP_RESULT>` marker parsed from subprocess log | same marker, same parsing rules — only the text source changes |
| Session continuity | regex `ses_xxx` → `--session` flag | native child session id, host-managed continuity |
| Step watchdog (60 min no-output kill) | SIGTERM on log-file idle | abort signal + agent dispose |
| Missions, flows, prompts, plans | disk files under project root | identical disk files, identical semantics |
| Monitor dashboard | bundled HTTP+SSE server (port 9300) | unchanged; reachable while a run is active |

The API-level mapping behind the right-hand column is owned by `docs/architecture/dsh-plugin-packaging.md` §Native Dispatch API Chain; this doc intentionally does not restate it. Source-verified official precedent for both backends: the host's own `@deepseek-ai/dsh-headless` bundle uses exactly this create → submit → quiescence → harvest-text shape (R1 §4).

## User Experience

### Installing (planned)

```bash
dsh plugin --profile web add "github:<this-repo>"   # exact source shape decided at implementation
```

After install and host restart, DSH sessions will gain the Mission Control skills. No per-project copy of the engine occurs.

### Running

> As-built note (2026-08-23, M2-WI10): the route layer this section's flow rides on is live — `mdcontrol.run` starts a mission with the async job contract (immediate `{runId, status: 'started'}`, engine continues as a detached in-host task, progress via `mdcontrol.status` and the unchanged monitor dashboard, one run at a time per project root). The natural-language skill entry points below are still M3-WI12; until they land, the routes are reachable programmatically (cordis service `mdcontrol` / `POST /mdcontrol/api/<method>`). Owner doc for the route semantics: `docs/architecture/dsh-plugin-packaging.md` §Service Surface.
>
> As-built note (2026-08-23, M4-WI14 — AGE mode): installing the AGE preset (dev guide §AGE Mode) puts AGE mode on the session preset picker; a session on it carries the `age:mode` posture section with the Mission Control entry points. Projects select the AGE composition for mission children with `missions/base.json` `"agent": "age"` (explicit per-run args/env keep precedence). The loop steps below are unchanged by the preset — only the session posture and the child composition differ.

Inside a DSH session opened at a project root that has AGE installed (`missions/base.json` present):

1. User asks the agent to "run the onboarding mission" or invokes `mission-control-run onboarding`.
2. The skill resolves the mission via the same config chain as the CLI (`base.json` → `base.local.json` → mission).
3. Steps execute as native child agents; progress lands in the same `run-state.json` the monitor reads.
4. Completion, failure, and audit rounds follow the same loop semantics as the CLI form — markers, correction retries, and transient-fault backoff are shared engine code. Environmental differences (permission model, watchdog style, model selection) exist and are owned by `docs/architecture/dsh-plugin-packaging.md` §Behavioral differences.

### What does not change

- Standalone CLI commands, flags, exit codes (`EXIT_MAP`), and schemas are frozen contracts.
- AGE template installation (`install-age.sh`) is independent of the plugin; projects can use either form or both.
- Plan authoring/closure workflow and all AGE owner docs apply identically in both forms.

## Scope

In scope: plugin packaging of the existing engine; one new execution backend; Mission Control skill family; descriptor registration; documentation and phased delivery plan.

Out of scope (this feature): rewriting prompts for DSH-native tool names; replacing the monitor with a client-side panel; multi-project mission orchestration; changes to flow DSL semantics.

## Non-Goals

- This feature does not make DSH a required dependency. If the plugin layer were removed, the standalone product remains complete.
- This feature does not fork the engine. There is exactly one engine codebase; backends differ behind one interface.
- This feature does not bypass AGE planning rules. Implementation still requires plans per `docs/plans/00-plan-authoring-and-execution-guide.md` when triggers apply.
