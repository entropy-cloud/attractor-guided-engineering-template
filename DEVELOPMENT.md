# Development

This document describes how this repository develops itself using AGE + mission-driver. For the template-audience copy flow, see [README.md](README.md).

## What this repo is

This repo develops `tools/mission-driver/` — a Node.js Flow DSL engine that automates the AGE development loop. The engine reads `missions/<name>.json` and drives a state machine through CHECK → REVIEW_PLANS → EXEC_PLANS → DRAFT_PLANS → DEEP_AUDIT, spawning `opencode run` for each AI step. Read [`tools/mission-driver/CONTEXT.md`](tools/mission-driver/CONTEXT.md) for the 30-second overview.

## AGE workflow

Development follows [AGENTS.md](AGENTS.md) and [docs/process/application-development-workflow.md](docs/process/application-development-workflow.md). Key points:

- The repo is the source of truth. Chat is only a temporary working surface.
- Active work-in-progress is read from unfinished plans in [docs/plans/](docs/plans/), not from a field in `project-context.md`.
- Non-trivial work requires a plan (see Planning Rule in AGENTS.md) with independent draft review and closure audit.

## Verification commands

| Purpose | Command |
|---|---|
| Engine unit tests (also runs `prompt-check.mjs` structural validation) | `pnpm --prefix tools/mission-driver test` |
| Frontend build | `pnpm --prefix tools/mission-driver/web run build` |
| Frontend dist freshness check | `pnpm --prefix tools/mission-driver/web run check:dist` |
| Mission config validation | `node tools/mission-driver/src/mission-check.mjs missions/<name>.json .` |
| Doc reference check | `pnpm --prefix tools check` (run `pnpm --prefix tools install` first if `tools/node_modules` absent) |

The engine has zero npm dependencies; the frontend's `web/dist/` is committed. See [tools/mission-driver/CONTEXT.md](tools/mission-driver/CONTEXT.md) "构建与验证" for the full command surface.

## Driving a mission

From the repo root (in Git Bash on Windows):

```bash
./tools/mission-driver.sh <mission-name>
./tools/mission-driver.sh list                                    # list available missions
./tools/mission-driver.sh run <mission-name> --dry-run            # dry-run
./tools/mission-driver.sh run <mission-name> --step CHECK         # single-step debug
./tools/mission-driver.sh --analyze-run                           # postmortem the most recent run
```

Monitor dashboard: `./tools/mission-driver.sh monitor` opens on port 9300 (auto-increments on conflict).

## Key constraints (protected areas)

Treat these as ask-first — see [docs/context/ai-autonomy-policy.md](docs/context/ai-autonomy-policy.md) for the full list:

- `tools/mission-driver/src/engine.js` state-machine core
- Engine zero-npm-dependency invariant (commander is vendored)
- `tools/mission-driver/web/dist/` committed-artifact invariant (CI `web-dist-check.yml` guards freshness)
- `tools/mission-driver/memory/_index.md` always-load contract
- `install-age.sh` personalization (sed-replace `<project-name>` in all fill-in files copied to target)

## Where to read first

1. [AGENTS.md](AGENTS.md) — AI operating contract
2. [tools/mission-driver/CONTEXT.md](tools/mission-driver/CONTEXT.md) — 30-second tool overview (auto-attached when you read files under `tools/mission-driver/`)
3. [docs/context/project-context.md](docs/context/project-context.md) — project identity + verification commands
4. [docs/context/codebase-map.md](docs/context/codebase-map.md) — entry points and common change routes
5. [docs/architecture/template-vs-realproject-boundary.md](docs/architecture/template-vs-realproject-boundary.md) — why this repo has a `template/` subdirectory
