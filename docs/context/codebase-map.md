# Codebase Map

## Purpose

This file gives AI agents a compact map of the live repository so they do not rediscover the structure by repeatedly searching imports and directories.

Keep it current enough to route common work. Do not turn it into a full architecture document.

## Entry Points

| Area         | Path     | Notes     | Last Verified  | Confidence |
| ------------ | -------- | --------- | -------------- | ---------- |
| CLI entry    | `$MISSION_DRIVER_HOME/src/main.js` | Parses CLI → loads mission → starts engine + monitor. Has `run`, `list`, `monitor`, `step`, `analyze` subcommands. | 2026-07-27 | high |
| State-machine core | `$MISSION_DRIVER_HOME/src/engine.js` | Most complex file. Step dispatch, transitions, `_result()`, `_wfClose()`, `_executeSubflowStep()`, sliding-window concurrency. | 2026-07-27 | high |
| Step executor | `$MISSION_DRIVER_HOME/src/executor.js` | Spawns `opencode run` subprocess, heartbeat/timeout/SIGTERM. | 2026-07-27 | high |
| Runner | `$MISSION_DRIVER_HOME/src/runner.js` | `opencode` process management + `sessionId` extraction. | 2026-07-27 | high |
| Monitor server | `$MISSION_DRIVER_HOME/src/monitor.js` | Pure Node `http` + SSE; REST endpoints + static `web/dist/` host. ~1800 lines. | 2026-07-27 | high |
| Mission config loader | `$MISSION_DRIVER_HOME/src/mission-check.mjs` | Validates mission.json + resolves `extends` chain (`base.json` → `base.local.json` → mission). | 2026-07-27 | high |
| Flow loader | `$MISSION_DRIVER_HOME/src/flow-loader.js` | Loads flow JSON, scans plans dir, registers expression functions. | 2026-07-27 | high |
| Frontend entry | `$MISSION_DRIVER_HOME/web/src/main.ts` | Vue 3 + Pinia + Naive UI. Routes: `/` RunList, `/runs/:runId` RunDetail. | 2026-07-27 | high |
| Install flow (template) | `tools/install-age.mjs` + `install-age.manifest` | Preflight, scaffold/provenance; optional target-local vendored engine. Shell launcher delegates here. | 2026-11-17 | high |
| Consumer workflow/delivery | `tools/consumer-ledger.mjs`, `tools/plan-status.mjs`, `tools/commit-plan.mjs` | Standalone read-only proof interpretation, inventory and accepted-plan Git delivery; usage owns the contract. | 2026-11-17 | high |

## Common Change Routes

| Task Type           | Start Here | Then Check | Verification | Last Verified  | Confidence |
| ------------------- | ---------- | ---------- | ------------ | -------------- | ---------- |
| Add flow step type  | `$MISSION_DRIVER_HOME/src/engine.js` `_executeSubflowStep` / step-dispatcher | `$MISSION_DRIVER_HOME/flows/*.json`, `design/mission-design.md` | `pnpm --prefix tools/mission-driver test` | 2026-07-27 | high |
| Add monitor REST endpoint | `$MISSION_DRIVER_HOME/src/monitor.js` | `$MISSION_DRIVER_HOME/web/src/services/api.ts` | `pnpm --prefix $MISSION_DRIVER_HOME/web run build` | 2026-07-27 | high |
| Add mission config field | `$MISSION_DRIVER_HOME/src/mission-check.mjs` (`validateMission`) + `config.js` | `missions/base.json`, `$MISSION_DRIVER_HOME/docs/user-manual.zh.md` schema section | `node $MISSION_DRIVER_HOME/src/mission-check.mjs missions/<name>.json .` | 2026-07-27 | high |
| Add prompt template | `$MISSION_DRIVER_HOME/prompts/<name>.md` + register in flow | `$MISSION_DRIVER_HOME/src/flow-loader.js` | `node $MISSION_DRIVER_HOME/src/prompt-check.mjs` | 2026-07-27 | high |
| Update frontend component | `$MISSION_DRIVER_HOME/web/src/components/...` | `$MISSION_DRIVER_HOME/CONTEXT.md` "Monitor Dashboard 前端" | `pnpm --prefix $MISSION_DRIVER_HOME/web run build && pnpm run check:dist` | 2026-07-27 | high |
| Update template fill-in file | Edit both audiences for methodology changes; preserve project-specific context | `install-age.manifest`, `docs/architecture/template-vs-realproject-boundary.md` | Consumer installer tests + shell closure gate in project-context | 2026-11-17 | high |
| Change consumer lifecycle/delivery | `docs/guides/roadmap-goal-execution.md` + standalone helpers | Root/template routers and manifest | Consumer workflow contract command in project-context | 2026-11-17 | high |

## Large Or Fragile Files

List files that agents should treat carefully because they are large, central, generated, or easy to edit incorrectly.

| Path     | Risk     | Preferred Approach |
| -------- | -------- | ------------------ |
| `$MISSION_DRIVER_HOME/src/engine.js` | Large (~2000 lines), central state machine; concurrent sliding-window dispatcher has subtle microtask ordering | Plan + subagent review for any change to `_executeSubflowStep` / `_wfClose` / `_result`. Existing tests in `test/*.test.js` cover most invariants — run them. |
| `$MISSION_DRIVER_HOME/src/monitor.js` | Large (~1800 lines), HTTP + SSE handler | Prefer adding endpoints over rewriting; test with browser + curl. |
| `$MISSION_DRIVER_HOME/src/main.js` | Central CLI router; `exitMap` is a public contract | Avoid changing exit codes without syncing `EXECUTION-PRINCIPLE.md §11` + `docs/architecture/mission-driver-baseline.md`. |
| `$MISSION_DRIVER_HOME/web/dist/` | Generated artifact (committed) | Never hand-edit. Run `pnpm --prefix $MISSION_DRIVER_HOME/web run build` then `git add web/dist`. CI `web-dist-check.yml` catches staleness. |
| `$MISSION_DRIVER_HOME/vendor/commander/` | Vendored npm package | Do not edit. If a commander update is needed, re-vendor + remove `dependencies` again. |
| `tools/install-age.mjs`, `install-age.manifest` | Consumer copy/provenance boundary | Run installer unit/integration and shell gates after membership/personalization changes. |
| `tools/consumer-ledger.mjs`, `tools/commit-plan.mjs` | Proof/finalization and scoped Git boundary | Run workflow fixtures; keep helpers independent of optional engine and task-document editing. |
| `_tmp/<runDir>/` | Per-run state, mutable | Do not edit; treat as ephemeral. The engine is the only writer. |

## Project-Specific Search Hints

- Mission state machine: `grep -n "_result\|_wfClose\|_executeSubflowStep" $MISSION_DRIVER_HOME/src/engine.js`
- Public markers (parsing contract): `grep -rn "<AI_STEP_RESULT>\|<BRIEF_GATE>\|<BRIEF_FILE>\|<MISSION_FILE>" $MISSION_DRIVER_HOME/`
- API surface: `grep -n "routes\.[A-Z]*\['/" $MISSION_DRIVER_HOME/src/monitor.js` (or look for `case '/api/`)
- Vendored deps: `ls $MISSION_DRIVER_HOME/vendor/`
- Unfinished consumer plans: `node tools/plan-status.mjs --unfinished`; inventory: `--list` shows raw status and derived delivery eligibility, not a second status ledger. Use built-in Read tools for actual plan content.
