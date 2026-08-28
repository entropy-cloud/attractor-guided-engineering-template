# DSH Plugin Online Development Guide

> **Status: operational guide** for the plugin delivered by `docs/design/dsh-plugin-integration.md` + `docs/architecture/dsh-plugin-packaging.md` (P1–P4 closed 2026-08-23; this header previously read "forward-looking" from pre-landing days and was corrected 2026-08-28). External DSH behaviors cited here reflect the developer preview and must be re-verified against the host version at dev time. 2026-08-28 increment: the bundle directory/package migrated to `plugin/nop-age/` (`nop-age`, realm `nopAge`; `mdcontrol` service, skill IDs, `/mdcontrol/api` unchanged — plan `docs/plans/multi-plugin-dsh/2026-08-28-0149-2`); all paths below are synced.

## Multi-Plugin Forward Reference (nop-* family)

The multi-plugin refactor (mission `multi-plugin-dsh`, design owner `docs/design/multi-plugin-dsh-architecture.md`) has repackaged the single DSH bundle as the `nop-*` plugin family (migration landed 2026-08-28, plan `docs/plans/multi-plugin-dsh/2026-08-28-0149-2`): this bundle is now `plugin/nop-age/` (package `nop-age`, isolate realm `nopAge`; cordis service `mdcontrol`, `mission-control-*` skill IDs, and `/mdcontrol/api` stay verbatim — token-map carve-out there), and the second bundle `nop-route` landed 2026-08-28 (M4, §nop-route Bundle (M4, landed) below). The unified launcher `plugin/load-plugins.sh` + `plugin/plugin-manifest.yml` landed 2026-08-28 (M3-WI6/WI7/WI8, plan `docs/plans/multi-plugin-dsh/2026-08-28-0149-3`) and is the live mount flow (§Unified Launcher below); the per-bundle manual `dsh plugin add` step remains as the fallback path.

## Purpose

The concise day-to-day procedure for developing this repository's DSH plugin (`plugin/nop-age/`, "AGE Mission Control"): develop **online inside a running DSH host in Creator mode**, with every core workflow customized through the mission-driver flow engine — not through imperative plugin code.

## Prerequisites

- Node.js per the DSH host requirement (`^22.19 || >=24`, official repo root); the engine itself is plain ESM Node with no engines floor; DSH host runnable via `npx @deepseek-ai/dsh web`
- This repo cloned; engine test suite green: `npm --prefix tools/mission-driver test`
- Read first: `docs/design/dsh-plugin-integration.md`, `docs/architecture/dsh-plugin-packaging.md`

## Unified Launcher: load-plugins.sh (M3-WI7, landed)

`plugin/load-plugins.sh` is the one-command mount flow: it reads `plugin/plugin-manifest.yml` (schema:1, declaring both in-repo bundles — `nop-age` since M3, `nop-route` appended at M4-WI15, plan `docs/plans/multi-plugin-dsh/2026-08-28-1312-2`), pre-flights it, and mounts every declared plugin into the profile in manifest order, idempotently. Pre-flight enforces: YAML syntax (python3+PyYAML first, degrading to `node -e` via the nop-age pinned `yaml` devDep), unknown top-level keys rejected, `${VAR}` placeholders substituted from the environment (**undefined variable = hard error**, so export `PROJECT_ROOT` first — the nop-age `supervisor.projectRoot` placeholder), and every entry path must exist with a `cordis.patch.yml`.

```bash
export PROJECT_ROOT=/path/to/this-repo   # required: manifest placeholder
./plugin/load-plugins.sh                       # mount everything + start the host
./plugin/load-plugins.sh --no-start            # mount only; start DSH later yourself
./plugin/load-plugins.sh --dry-run             # print planned commands, do nothing
./plugin/load-plugins.sh --unmount-all         # reset; then re-mount everything
./plugin/load-plugins.sh --profile myprofile   # alternate profile
./plugin/load-plugins.sh --skip nop-age        # skip a plugin (repeatable)
./plugin/load-plugins.sh --strict              # abort on first failure
```

| Flag | Effect |
| --- | --- |
| `--profile <name>` | Override the manifest `profile:` value |
| `--manifest <path>` | Override manifest path (default `plugin/plugin-manifest.yml`) |
| `--no-start` | Mount only; do not start the host |
| `--dry-run` | Print the planned `dsh plugin add` commands without executing anything (zero `dsh` calls) |
| `--strict` | Abort on the first failure (default: continue and exit non-zero) |
| `--skip <name>` | Skip a specific plugin by name (repeatable) |
| `--unmount-all` | Remove every manifest entry from the profile; idempotent baseline reset |

Exit code: `0` on full success, non-zero on any failure. Every run ends with a summary table (`mounted` / `already-present` / `failed` / `skipped`).

As-built notes (verified against the real host, plan `2026-08-28-0149-3` Phase 3): the host start uses `dsh web --no-open` for the `web` profile and `dsh --profile <p>` for any other profile — the `dsh web` subcommand is an alias of `--profile web` and rejects a parent `--profile`. Booting a host with the bundle mounted currently hits the known bundle-import gap (no `main`/`exports` in `plugin/nop-age/package.json`, M2-WI4 residual); the mount itself is proven via `dsh --profile <p> --dump-config | grep nop-`. Deterministic regression coverage lives at `plugin/test/load-plugins.test.mjs` (stub `dsh`, no real-host dependency), wired into `verify-age.sh` L2; `shellcheck plugin/load-plugins.sh` is clean (0.11.0).

## nop-route Bundle (M4, landed 2026-08-28)

The second bundle of the family — a pure routing/retry/model-selection decision service over upstream AI call results (plans `docs/plans/multi-plugin-dsh/2026-08-28-1312-1` + `2026-08-28-1312-2`; design owner `docs/design/multi-plugin-dsh-architecture.md` §nop-route Plugin). Dev-facing facts:

- **Location & mount**: `plugin/nop-route/` (package `nop-route`, isolate realm `nopRoute`, service row `nop-route-service`); mounted by the same `./plugin/load-plugins.sh` run (the manifest declares it since M4-WI15). Manual fallback: `dsh plugin --profile <p> add link:.../plugin/nop-route`; verify with `dsh --profile <p> --dump-config | grep nop-`.
- **Service**: `noproute` (name = bundle minus `nop-` prefix, camelCased) — four sync routes `noproute.route` / `noproute.classify` / `noproute.pick-model` / `noproute.health`, plus the `POST /noproute/api/<method>` HTTP dispatcher when a `webServer` is present (headless hosts degrade to a mount-log line; the cordis service stays published).
- **Code layout**: `src/service.ts` (mount) → `src/noproute-routes.ts` (wire record + HTTP dispatcher) → `src/routing-core.ts` (pure 4-decision orchestration) → `src/{error-classifier,retry-policy,model-selector}.ts` (pure decision modules). The health error histogram is service-layer state (route/classify accumulate, health reads, `resetHistogram()` resets).
- **Discipline**: zero host calls (no `agents` inject, no dispatch — the plugin only exposes decisions); decision modules stay pure/deterministic (fake clocks in tests; time only via the `now` parameter).
- **Verification**: `npm --prefix plugin/nop-route test` (check-manifest → six `node --test` suites → `tsc --noEmit`), part of `./verify-age.sh` L2; e2e gate is M4-WI16. No `assets/` face — no build-bundle/smoke-import legs.

## Setup: Enable Creator Mode and Mount the Plugin (manual fallback)

Creator mode (one of the four presets) adds runtime inspection, in-memory plugin experimentation, and preset-authoring guidance on top of full Standard capabilities. Its trust level equals shell access — enable it deliberately, never as a default profile.

```bash
# 1. Start the host; select Creator mode for the working session
npx @deepseek-ai/dsh web

# 2. Mount the plugin directory into the profile (bundle form, local path)
dsh plugin --profile web add link:/path/to/this-repo/plugin/nop-age
# Bundle mounts require a host restart after add:
dsh web --no-open

# 3. Verify the mount resolved (a silent no-op usually means a name mismatch)
dsh web --dump-config | grep -i mission-control
```

Online-iteration rules:

- **Bundle form needs a restart per change** — acceptable for coarse iterations.
- For tight loops, prefer the repository-plugin mechanism (Settings → Plugins → repository source), which hot-reloads without restart. Point it at `plugin/nop-age` via the `&path:` subpackage syntax.
- Use Creator mode's runtime inspection to confirm the Mission Control service is mounted in the live Cordis tree before debugging routes.
- Use in-memory plugin experiments to trial patch-line variants before writing them into `cordis.patch.yml`. Experiments are memory-only and vanish on restart — promote survivors to committed files.

## AGE Mode: Installing the AGE Preset (M4-WI14, landed)

The AGE session posture ships as a host-discoverable agent preset at `plugin/nop-age/preset/age/` (as-built owner doc: `docs/architecture/dsh-plugin-packaging.md` §AGE Preset). Consumer installation:

```bash
# 1. Copy the preset directory into the host's user preset root (create it first):
mkdir -p "${DSH_HOME:-$HOME/.dsh}/.agent-presets"
cp -R /path/to/this-repo/plugin/nop-age/preset/age "${DSH_HOME:-$HOME/.dsh}/.agent-presets/age"

# 2. Restart the host (roster discovery reads the roots per call, but the
#    session picker and any bundle-mount changes need the restart):
dsh web --no-open

# 3. Verify the roster sees it (Creator mode runtime inspection or the
#    session picker): preset "age" — "AGE Mode (Mission Control)" — NOT broken.
#    A broken row means the composition did not load; read its reason string.

# 4. Select AGE mode for a session (picker), and/or select it for a PROJECT's
#    mission children:
#      missions/base.json: { "agent": "age", ... }
#    (explicit per-run args / OPENCODE_AGENT env keep precedence — the native
#    bootstrap defaults the run config's agent from base.json.)
```

Verification in the repo (no host needed):

```bash
npm --prefix plugin/nop-age test                    # structural gate (age-preset.test.mjs) rides the CI chain
npm --prefix plugin/nop-age run verify:e2e:preset   # composition leg (in-process; roster + service same tree)
```

Manual real-host leg (env/manual — not automated): after install, open an AGE-mode session at a project with `missions/base.json` present, confirm the posture section is in effect and the mission-control skills are offered, run a small mission, and observe mount + run + monitor. Natural-language AGE-session quality is a watch-only residual (plan `2026-08-23-2202-1` §Deferred).

Notes:

- The preset carries ZERO service rows — Mission Control stays mounted exactly once (bundle patch). Never add a `nop-age` row to the preset (a second instance breaks the single active-run guard; the structural gate rejects it).
- Preset rows that wait for a service the deployment never composes make the whole preset unmountable (observed with `dsh-command-compact` needing the `commands` registry) — keep new rows within the host-spine allowlist pinned by `test/age-preset.test.mjs`.
- Editing a preset directory takes effect for NEW sessions after the composition file changes (standing-mount stamp generations); already-joined sessions keep their generation.

## Core Rule: Workflows Are Flow-Engine Customizations

Every user-facing capability of the plugin (run / draft / analyze / any future one) MUST be defined as flow JSON + prompt templates executed by the Flow DSL state machine. The cordis service layer only resolves mission config and triggers runs — it contains no step logic. To change what a capability does, you edit its flow, not its TypeScript.

### Anatomy (verified schema, from `tools/mission-driver/flows/plan-execution.json`)

```jsonc
{
  "name": "plan-execution",
  "maxTotalSteps": 30,          // hard budget for the whole run
  "maxCycleVisits": 6,          // anti-loop guard per step name
  "entry": "EXECUTE",
  "markerAliases": { "success": "pass", "done": "pass", "error": "fail" },
  "steps": {
    "EXECUTE": {
      "type": "agent",                      // agent | script | tool | group | subflow
      "promptPath": "prompts/execute.md",   // template, {{var}} substitution
      "onUnknownMaxRetries": 2,             // marker-correction budget
      "transitions": {
        "pass": { "goto": "CLOSURE_SCRIPT_CHECK" },
        "fail": { "retry": "EXECUTE", "maxRetries": 3 }
      },
      "onError": { "retry": "EXECUTE", "maxRetries": 3 }
    }
  }
}
```

Markers are the control contract: prompts emit `<AI_STEP_RESULT>pass|fail</AI_STEP_RESULT>` (plus transition-specific markers); the engine parses them from the returned text identically under both execution backends. Every agent-facing prompt MUST ship a well-formed marker example — `src/prompt-check.mjs` fails on any malformed example or invalid marker value it can see.

### Adding or Changing a Capability — Checklist

1. Define/edit the flow JSON under the plugin's bundled `flows/`; keep budgets (`maxTotalSteps`, `maxCycleVisits`) explicit.
2. Write/edit prompt templates under bundled `prompts/`; each outcome branch maps to a declared transition.
3. Register the mission in `missions/<name>.json` (`extends: "base"`, `flowName` → your flow); keep `commands.test` pointing at a real verification command.
4. Expose it via a thin `mdcontrol.*` route that passes the mission name to the orchestration entry — nothing more.
5. Verify: `--dry-run` first, then a demo-scale real run; observe at least one marker parse and one correction retry on purpose (break a marker once) before calling it done.

### Driving Plugin Development Itself Through a Mission

Phase work (P1–P4) should be planned and executed like any AGE slice — via plans under `docs/plans/`. When a phase reaches repeatable loop territory (e.g., P2 smoke iterations), encode the loop itself as a mission so cycles run through the same engine being built:

```
missions/dsh-plugin.json   → extends base, flowName: "dsh-plugin-dev"
flows/dsh-plugin-dev.json  → SCAFFOLD → WIRE_EXECUTOR → SMOKE_DEMO → AUDIT_GATE
```

This dogfoods the engine against its own plugin backend and surfaces native-dispatch issues where they matter — inside the host.

## Per-Change Verification Gates

| Change touched | Must pass |
| --- | --- |
| Engine core (`tools/mission-driver/src/`) | full `node --test` suite green; CLI `run demo` unchanged |
| Native executor / dispatch | demo mission end-to-end in-host; identical run-state shape (monitor still renders it); subagents list healthy |
| Flow JSON or prompts | `prompt-check.mjs` green; dry-run transitions traced; correction-retry exercised intentionally |
| Patch / packaging | `--dump-config` grep shows mount; restart-reload behavior matches the chosen form |

## Pitfalls

- Patch rows silently skip on `name` mismatch — always verify via `--dump-config`, never assume reload worked.
- Patch `config` replacement is whole-row, not deep-merge — restate the full value.
- In-memory Creator experiments do not persist; land everything as committed files before ending the session.
- Startup diagnostics (orphan reaper killing `opencode run` processes) will be suppressed in embed/native mode once P1 lands (see `docs/architecture/dsh-plugin-packaging.md` §Execution Backend Seam). If the host ever kills AI processes during a native run, that gate regressed — stop and fix the embed flag first.
