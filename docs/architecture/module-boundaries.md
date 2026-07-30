# Module Boundaries

Define the main code ownership boundaries for `mission-driver`.

## Top-Level Modules

| Module | Path | Responsibility | Public Boundary |
| --- | --- | --- | --- |
| **Engine core** | `tools/mission-driver/src/{engine,executor,runner,expression,flow-loader,platform}.js` + `.mjs` siblings | Flow DSL state machine; spawns `opencode run` subprocesses; transitions; subflow composition | CLI: `node src/main.js ...`; in-process: not exported (engine runs as a process, not a library) |
| **Mission config layer** | `tools/mission-driver/src/{config,mission-check,plan-check,roadmap-check,secret-resolver,env-loader}.mjs` | Loads + validates `missions/<name>.json`, resolves `extends` chain, validates plans | CLI: `node src/mission-check.mjs <file> <root>`; schema in `tools/mission-driver/docs/user-manual.zh.md` |
| **Monitor server** | `tools/mission-driver/src/monitor.js` | HTTP + SSE server (pure Node `http`); REST endpoints under `/api/`; static host for `web/dist/` | HTTP API: see `tools/mission-driver/CONTEXT.md` "API 端点"; port 9300 default (auto-increment on conflict) |
| **Frontend (monitor dashboard)** | `tools/mission-driver/web/` | Vue 3 SPA consumed by humans via browser; reads monitor REST + SSE | Routes: `/` (RunList), `/runs/:runId` (RunDetail); built `web/dist/` is committed and statically served |
| **Memory / Reflexion** | `tools/mission-driver/memory/` + `docs/memory/<module>/` | File-based, git-versioned long-term memory; `_index.md` always-load core | File schema: `_index.md` (YAML frontmatter + Top rules), `lessons.md` (id/count/severity/fix schema), `runs.md` (episodic rows) |
| **Install flow (template)** | `install-age.sh` + `install-age.manifest` + `template/` | Single copy-flow mechanism for template consumers | CLI: `./install-age.sh <target> <name>`; manifest-driven source paths |
| **Tooling** | `tools/check-*.mjs`, `tools/audit/` | Repo-local engineering utilities (doc-ref check, oversized-files check, etc.) | CLI per tool; configured via env vars (`AGE_*`) |

## Boundary Rules

1. **Engine → Monitor**: one-way. Engine writes `run-state.json` / `events.jsonl` to `_tmp/<runDir>/`; monitor reads them. Monitor MUST NOT mutate engine state; it can only watch + serve.
2. **Engine → Memory**: engine reads `memory/_index.md` (self) + `docs/memory/<module>/_index.md` (module) into `{{selfMemoryIndex}}` / `{{moduleMemoryIndex}}` template vars at startup. Engine writes memory only via the `--analyze-run` postmortem path (separate subagent), never during normal mission execution.
3. **Monitor → Frontend**: monitor serves `web/dist/` as static files + exposes `/api/*` REST + `/api/runs/:id/events` SSE. Frontend is a passive consumer.
4. **Frontend → Engine**: forbidden at runtime. Frontend talks only to monitor HTTP/SSE.
5. **Install flow → Engine**: forbidden. `install-age.sh` does NOT copy `tools/mission-driver/` — consumers reference it via `MISSION_DRIVER_HOME`. The engine stays single-sourced in this repo.
6. **Tooling → Engine/Monitor**: read-only inspection (doc checks, code-stats). Tooling scripts MUST NOT mutate engine or monitor source.

## Test Seams (Public)

- Engine: `node --test test/*.test.js` (533+ cases as of 2026-07-22, per `docs/audits/mission-driver-draft-robustness/2026-07-22-0755-multi-audit-*.md`).
- Frontend: no automated test suite; verified via `vue-tsc --noEmit && vite build` (TypeScript + build catches structure errors).
- Install flow: Phase 3 closure-gate test (`docs/plans/2026-07-27-0000-template-realproject-split-plan.md`) — behavioral assertions on `./install-age.sh /tmp/test "Test"` output.
