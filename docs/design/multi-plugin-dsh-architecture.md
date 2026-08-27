# Multi-Plugin DSH Architecture (nop-* Plugin Family)

> **Status: DRAFT (2026-08-27)** — design doc authored as the planning anchor for the multi-plugin refactor. The technical plan lives in `docs/backlog/multi-plugin-dsh-roadmap.md`; concrete execution plans under `docs/plans/multi-plugin-dsh/` convert each work item into one deliverable. Nothing in this doc is implemented yet; the single-plugin form (`plugin/dsh/` — AGE Mission Control) remains the supported baseline until this work lands.

## Purpose

Refactor the DSH plugin packaging from a single bundle (`plugin/dsh/`, hosting `dsh-mission-control`) to a multi-plugin family under `plugin/nop-*/` so the repository can host several cohesive DSH plugins side by side, each independently mountable, each with its own isolate realm and its own RPC namespace. The refactor introduces:

1. A directory convention: every plugin lives at `plugin/<name>/` with `<name>` carrying the `nop-` prefix.
2. A unified launch script: `plugin/load-plugins.sh` reads a manifest file and mounts every declared plugin into the configured DSH profile in the correct order, with idempotent re-mount semantics.
3. Two plugins as the inaugural delivery: `nop-age` (renamed from the existing `plugin/dsh/`) and `nop-route` (new — intelligent routing/retry/model selection for upstream AI call results).

The architectural design supports N plugins; the implementation lands the first two.

## Background

`docs/design/dsh-plugin-integration.md` and `docs/architecture/dsh-plugin-packaging.md` describe the single-plugin form. The M2-WI6 isolate-realm patch design (`cordis.patch.yml` + `isolate: { missionControl: true }`) intentionally provides the collision-freedom guarantee **across mount instances of the same bundle**, but its scope does not extend to cross-bundle namespace isolation. The current implementation assumes exactly one bundle of the `dsh-mission-control` family is mounted.

External DSH plugins surveyed in `docs/analysis/dsh-plugin-survey/` (better-sidebar, plannotator, delegate-router, routing-suite, flash-godmode) demonstrate that the DSH host supports multiple bundle plugins coexisting on one profile. The repository is positioned to use the same convention. Concretely:

- `dsh-better-sidebar` (M2-WI6 cited precedent) — `cordis.patch.yml` with `cordis:group` + isolate realm `sidechat` for its private service row.
- `dsh-plannotator` — `cordis:group` with isolate realm `plannotator`.
- `dsh-delegate-router` — shared `subagent_router` domain opened once; two bundles (`stats-service`, router) consume it.

The pattern is the same across the host: each bundle declares its own isolate realm key; services from different bundles cannot accidentally collide because they live in different realm scopes. **Namespacing is by isolate-realm key and by service-registration name.**

## Goals

- Refactor `plugin/dsh/` (single bundle hosting `dsh-mission-control`) into `plugin/nop-age/` (renamed bundle hosting the same service row under a new realm key).
- Introduce `plugin/nop-route/` — a new bundle that mounts a service called `noproute` exposing `noproute.*` routes for intelligent routing/retry/model-selection on upstream AI call responses.
- Provide `plugin/load-plugins.sh` — a POSIX shell script that, given a profile name and a manifest file, mounts every declared plugin into the profile and starts the DSH web host. Idempotent re-mount. Failure of one plugin does not abort the script unless explicitly requested.
- Provide `plugin/plugin-manifest.yml` — the source of truth listing every plugin to mount, its local path, its realm key, its service name, and any per-plugin config.
- Provide `plugin/nop-age/preset/age/` (moved from `plugin/dsh/preset/age/`) and the corresponding AGE agent preset, **with the same zero-service-row discipline** as the existing baseline.
- Update all owner docs (`docs/design/dsh-plugin-integration.md`, `docs/architecture/dsh-plugin-packaging.md`, `docs/process/dsh-plugin-development-guide.md`, `tools/mission-driver/CONTEXT.md`) to reflect the new naming and directory shape.

## Non-Goals

- Rewriting the engine. The plugin family is purely a packaging and naming change; the engine (`tools/mission-driver/`) stays untouched.
- Replacing the existing host API chain. The new plugin family uses the same six host-call surface that `docs/architecture/dsh-plugin-packaging.md` §Dependency and Version Risk enumerates.
- Implementing a plugin auto-discovery mechanism that scans `plugin/*/` at startup. Discovery is explicit through `plugin-manifest.yml` — this avoids accidental activation of in-progress work and keeps the launch deterministic.
- A general-purpose plugin loader that takes plugins from arbitrary sources (npm/git). The scope is "host the multi-plugin family in-tree", not "build a plugin marketplace". External sources remain a user concern handled by `dsh plugin --profile <p> add <source>` directly.
- Multi-plugin interaction contracts (e.g. `nop-route` calling `nop-age`). The first delivery wires each plugin independently; cross-plugin composition is a future slice.

## Architecture

### Directory Layout

```
plugin/
├── load-plugins.sh             # POSIX sh launcher (NEW)
├── plugin-manifest.yml         # declared plugin list (NEW)
├── nop-age/                    # renamed from plugin/dsh/ (MIGRATE)
│   ├── package.json            # name: nop-age (was: dsh-mission-control)
│   ├── cordis.patch.yml        # isolate: { nopAge: true } (was: missionControl)
│   ├── scripts/                # unchanged content
│   ├── src/                    # unchanged content; service name 'mdcontrol' stays
│   ├── test/                   # unchanged content
│   ├── assets/                 # unchanged content
│   └── preset/age/             # moved from plugin/dsh/preset/age/
├── nop-route/                  # NEW bundle
│   ├── package.json            # name: nop-route
│   ├── cordis.patch.yml        # isolate: { nopRoute: true }
│   ├── scripts/
│   │   └── check-manifest.mjs  # copy/adapt from nop-age
│   ├── src/
│   │   ├── service.ts          # exports apply(ctx, config); publishes `noproute` service
│   │   ├── noproute-routes.ts  # wire-method record + HTTP dispatcher registration
│   │   ├── routing-core.ts     # pure decide() function: retry? fallback? transform?
│   │   ├── model-selector.ts   # pure pickModel(request, history): ModelSelection
│   │   ├── retry-policy.ts     # pure retryDecision(error, attempt): RetryAction
│   │   └── error-classifier.ts # pure classify(error): ErrorClass
│   └── test/
│       ├── routing-core.test.mjs
│       ├── model-selector.test.mjs
│       └── retry-policy.test.mjs
└── (legacy plugin/dsh/ is REMOVED after migration; preserved in git history only)
```

### Naming Convention

- Each plugin lives at `plugin/<name>/`.
- `<name>` MUST start with the `nop-` prefix. The prefix marks the plugin as belonging to this repository's family. This is a naming convention, not a host-protocol requirement — the host treats `dsh plugin add link:...` the same regardless of directory name. The convention exists so that:
  - `ls plugin/` is a human-friendly index of the family.
  - Future cross-plugin helpers (e.g. shared types, shared lint config) can scope by glob `plugin/nop-*/`.
  - The prefix avoids collision with external DSH plugins a user might mount into the same profile.
- Service registration names use the `<name>` minus the `nop-` prefix, camelCased: `nop-age` → service `mdcontrol` (unchanged); `nop-route` → service `noproute` (NEW). The service name is independent of the directory name and follows the bundle's own API surface decisions.

### Isolate Realm Convention

- Each plugin declares its own `isolate: { <realmKey>: true }` entry in `cordis.patch.yml`.
- `<realmKey>` is the camelCased form of `<name>` minus the `nop-` prefix, with the first letter lowercased: `nop-age` → `nopAge`; `nop-route` → `nopRoute`. A unique key per bundle is the only structural requirement — collision would let one bundle's services leak into another, which the AGE preset D3 decision record explicitly forbids.
- The `cordis:group` outer wrapper follows the better-sidebar precedent (single `- insert:` block → group with isolate → service row).

### Plugin Manifest

`plugin/plugin-manifest.yml` is the single source of truth for what gets mounted. Format (YAML, validated by `plugin/load-plugins.sh` pre-flight):

```yaml
schema: 1
profile: web   # default profile; overridable via --profile CLI arg
plugins:
  - name: nop-age
    path: ./nop-age
    realm: nopAge
    config:
      assetsDir: ./assets
      supervisor:
        projectRoot: ${PROJECT_ROOT}
        continuous: false
  - name: nop-route
    path: ./nop-route
    realm: nopRoute
    config:
      defaultModel: zhipuai-coding-plan/glm-5.2
      maxRetries: 3
      fallbackModels: [zhipuai-coding-plan/glm-4.6]
```

- `schema: 1` is the manifest version (forward-compatible).
- `profile` sets the default profile; `--profile` on the script overrides.
- `plugins[]` is the ordered list. Order matters: the script mounts them top-to-bottom (first-listed = first-mounted).
- `${VAR}` placeholders are substituted from the environment at script invocation time.
- Unknown top-level keys are a hard error (fail-fast validation in `load-plugins.sh` pre-flight).

### Load Script

`plugin/load-plugins.sh` is a POSIX shell script (no bashisms, no Node.js dependency) that:

1. Pre-flights the manifest:
   - validates YAML syntax with `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))"` (graceful fallback documented for systems without Python: `node -e "require('yaml').parse(...)"` via the bundle's own pinned devDep; the script auto-detects).
   - asserts every plugin path exists and contains a `cordis.patch.yml`.
2. Mounts each plugin in order:
   - `dsh plugin --profile "$PROFILE" add "link:$PWD/$PATH"` if not already present (idempotency check via `dsh plugin --profile "$PROFILE" list`).
   - Records the result; on failure, continues by default (fail-loud) and exits non-zero at the end.
3. Starts the host: `dsh web --no-open --profile "$PROFILE"`.
4. Prints a final mount summary table (which plugins mounted, which failed, which were already present).

Script flags:

| Flag | Effect |
| --- | --- |
| `--profile <name>` | Override manifest `profile:` value |
| `--manifest <path>` | Override manifest path (default `plugin/plugin-manifest.yml`) |
| `--no-start` | Mount only; do not start the host |
| `--dry-run` | Print the planned `dsh plugin add` commands without executing them |
| `--strict` | Abort on first mount failure (default: continue and report) |
| `--skip <name>` | Skip a specific plugin by name (repeatable) |
| `--unmount-all` | Unmount everything in the manifest first; idempotent baseline reset |

Script requirements:

- POSIX `sh` (the shebang is `#!/bin/sh`, not `#!/bin/bash`).
- No external runtime dependencies (Python or Node detection is for manifest validation only).
- Same exit semantics as `dsh`: `0` on full success, non-zero on any failure (default behavior; `--strict` makes first failure fatal during the run).

### nop-age Plugin (Migration of plugin/dsh/)

`nop-age` is a verbatim migration of `plugin/dsh/`:

- `package.json`: `name` field changes from `dsh-mission-control` to `nop-age`; everything else (dependencies, scripts, type) unchanged.
- `cordis.patch.yml`: `isolate: { nopAge: true }` (was `missionControl`); service row name changes from `dsh-mission-control` to `nop-age`; config row id changes from `mdcontrol-service` to `nop-age-service`.
- `src/service.ts`: no functional change; the mount-log strings are updated to reference `nop-age` instead of `dsh-mission-control`. The published cordis service name `mdcontrol` stays — that is the stable API.
- `preset/age/`: same directory, same files; `preset.yml` may add a tag line referencing the new package name.
- All other source files (`src/native-executor.ts`, `src/mdcontrol-routes.ts`, `src/mdcontrol-skills.ts`, `src/law/host-adapter.ts`, `src/supervisor/*.ts`, `src/efficiency/*.ts`) remain functionally unchanged.

A pure mechanical migration (`mv plugin/dsh plugin/nop-age` followed by a 4-token find-and-replace in three files). No semantic change. All tests must remain green.

### nop-route Plugin (NEW)

`nop-route` exposes a `noproute.*` RPC service that takes an upstream AI call response (success or error), classifies it, and decides:

- **Retry** — re-issue the same call with the same model after a backoff delay.
- **Fallback** — re-issue with a different model (selected from the configured `fallbackModels` list).
- **Transform** — for non-retryable errors, return a transformed error object (e.g. extract a `<AI_STEP_RESULT>` marker if the response is a partial success).
- **Give up** — return the original error unchanged.

The plugin exposes these routes:

| Route | Type | Purpose |
| --- | --- | --- |
| `noproute.route` | sync | Take a single call result, return the routing decision (Retry / Fallback / Transform / Give-up) plus the next model if applicable. |
| `noproute.classify` | sync | Pure classify-only — given an error object, return its `ErrorClass` (`transient:network` / `transient:rate-limit` / `transient:timeout` / `permanent:auth` / `permanent:invalid-input` / `permanent:budget` / `partial:marker` / `unknown`). |
| `noproute.pick-model` | sync | Pure model-selection — given a request descriptor (model history, recent error classes, fallback chain config) return a `ModelSelection` (model id, reasoningEffort override, expected token budget). |
| `noproute.health` | sync | Diagnostic — return service version + configured fallback chain + observed error histogram since last reset. |

Design invariants:

- **No engine diff.** `nop-route` does not touch `tools/mission-driver/`. It lives entirely in the plugin layer.
- **Pure decision functions.** `routing-core.ts`, `model-selector.ts`, `retry-policy.ts`, `error-classifier.ts` are pure functions with deterministic output for given inputs. Determinism is the verification contract — `test/nop-route-*.test.mjs` runs them with fake clocks and asserts bit-identical decisions across runs.
- **Headless degradation.** When the host does not provide `webServer` (no `/noproute/api` HTTP surface), the plugin logs the absent-webServer posture and continues mounting the cordis service for in-process consumers.
- **Six-call discipline.** The plugin consumes zero host calls (it does not dispatch child agents); it only exposes a decision service. This keeps the plugin within the same blast-radius envelope as `docs/architecture/dsh-plugin-packaging.md` §Dependency and Version Risk (zero host call consumption = zero call-dispatch coupling).

`noproute` is registered through `ctx.inject(['webServer'], …)` for HTTP routes and `ctx.inject(['agents'], …)` is NOT used (no dispatch).

### Interaction with Existing AGE preset

The AGE preset (`plugin/nop-age/preset/age/`) remains a zero-service-row preset. It continues to:

- Reference the bundled flows/prompts at `plugin/nop-age/assets/`.
- Consume `mdcontrol` through the globally-registered skills and `/mdcontrol/api` HTTP dispatcher.
- NOT mount a second instance of `dsh-mission-control`/`nop-age`.

`nop-route` does not register any agent preset. Its services are programmatic-only — invoked by callers that explicitly know about them.

### Cross-Plugin Composition (Future Slice, Not In This Work)

A future slice may allow `nop-route` to consume `mdcontrol` results (e.g. intercept marker parse failures, route them to a fallback model before declaring the step failed). That work is **out of scope** for this refactor. The migration gives each plugin its own isolate realm and its own RPC namespace, which is the structural prerequisite.

## User Experience

### Installing (after this work lands)

```bash
# Once per clone, after pulling the repo:
./plugin/load-plugins.sh                       # mounts everything in plugin-manifest.yml
./plugin/load-plugins.sh --profile myprofile   # alternate profile
./plugin/load-plugins.sh --no-start            # mount only; start DSH later yourself
./plugin/load-plugins.sh --dry-run             # print planned commands, do nothing
./plugin/load-plugins.sh --unmount-all         # reset; then re-mount everything
```

After `load-plugins.sh` runs successfully, DSH sessions gain:

- Mission Control skills (`mission-control-run` / `mission-control-draft` / `mission-control-analyze`) via `nop-age`.
- `noproute.*` RPC routes via `nop-route` (consumed by callers via `ctx.get('noproute').routes.route(...)` or `POST /noproute/api/route`).

### Uninstalling

```bash
./plugin/load-plugins.sh --unmount-all   # clears all entries in the manifest
```

### Adding a New Plugin Later

1. Create `plugin/nop-<name>/` with its own `package.json`, `cordis.patch.yml`, `src/service.ts`.
2. Add an entry to `plugin/plugin-manifest.yml`.
3. Run `./plugin/load-plugins.sh` to mount.

## Concept Mapping

| Old (single plugin) | New (multi plugin) |
| --- | --- |
| `plugin/dsh/` | `plugin/nop-age/` |
| `name: dsh-mission-control` in package.json | `name: nop-age` |
| `isolate: { missionControl: true }` | `isolate: { nopAge: true }` |
| `dsh plugin add link:.../plugin/dsh` | `plugin/load-plugins.sh` (iterates manifest) |
| Single bundle documented in `dsh-plugin-packaging.md` | Two bundles documented; nop-age inherits the existing doc, nop-route adds a new §nop-route Plugin |
| Single-cordis service: `mdcontrol` | Two cordis services in different isolate realms: `mdcontrol` (nop-age), `noproute` (nop-route) |

## Behavioral Differences From Single-Plugin Form

The user-visible behavior of nop-age is **byte-identical** to the single-plugin form — same `mdcontrol.*` routes, same skills, same HTTP dispatcher paths. The differences are packaging-internal:

- **Bundle identity**: `nop-age` is the new package name; `dsh-mission-control` no longer exists.
- **Isolate realm key**: `nopAge` (was `missionControl`). This is observable only through cordis tree inspection in Creator mode.
- **Service row**: `nop-age` (was `dsh-mission-control`). Observable only through `--dump-config | grep -i mission-control` → `--dump-config | grep -i nop-age` substitution.
- **Manifest-driven mount**: launching is now `plugin/load-plugins.sh`, not `dsh plugin --profile web add link:.../plugin/dsh` repeated once per bundle.

For `nop-route`:

- New service `noproute` with `noproute.*` routes. No equivalent in the single-plugin form.
- A consumer that wants to use it must explicitly call `ctx.get('noproute')` or POST to `/noproute/api/<method>`.

## Scope

In scope:

- Directory rename + 4-token find-and-replace migration of `plugin/dsh/` → `plugin/nop-age/`.
- New `plugin/nop-route/` bundle with the four pure-function modules, four routes, and three test files.
- `plugin/plugin-manifest.yml` with the two-plugin declaration.
- `plugin/load-plugins.sh` POSIX shell script with the seven flags enumerated above.
- Owner-doc updates: `dsh-plugin-integration.md`, `dsh-plugin-packaging.md`, `dsh-plugin-development-guide.md`, `tools/mission-driver/CONTEXT.md`, `README.md` (cross-link section), `install-age.sh` (no functional change, but check it does not reference `plugin/dsh/` literally).
- All affected tests pass.

Out of scope:

- Rewriting the engine.
- Cross-plugin composition (e.g. `nop-route` consuming `mdcontrol` results).
- A general-purpose external plugin loader (npm/git/etc.). External plugins remain a user concern.
- A multi-plugin interaction contract spec. The structural prerequisite (isolate realms + namespace) is what lands here; the contract is a follow-up.

## Success Criteria

The work lands when:

1. `plugin/nop-age/` and `plugin/nop-route/` both exist and both mount cleanly under a single `plugin/load-plugins.sh` invocation into a fresh DSH profile.
2. All existing nop-age tests pass byte-identical to the pre-migration baseline (`plugin/dsh/test/*` moved with the rename).
3. nop-route has ≥10 test cases across its three truth tables (routing-core, model-selector, retry-policy) and all pass deterministically.
4. `dsh web --dump-config | grep -i nop-` shows both `nop-age` and `nop-route` registered under their respective isolate realms, no `dsh-mission-control` or `missionControl` strings remain.
5. `plugin/load-plugins.sh --unmount-all` followed by `plugin/load-plugins.sh` produces the same end state as a single run from a fresh profile.
6. The AGE preset still loads with zero service rows; AGE sessions still see `mission-control-run`/`draft`/`analyze` skills.
7. All owner docs reflect the new naming and directory shape.
8. `./verify-age.sh` L1+L2+L2.5 GREEN with the migrated plugin tests.

## Deferred But Adjudicated

### Cross-Plugin Composition Contract

- Classification: watch-only residual.
- Why Not Blocking Closure: this refactor establishes the structural prerequisite (per-plugin isolate realms + per-plugin RPC namespaces) but stops short of specifying how `nop-route` should consume `mdcontrol` results. The first delivery is two independent plugins.
- Successor Required: yes, when either (a) a recorded demand for cross-plugin decision chains emerges, or (b) the marker-parse failure pattern shows real-world frequency that motivates a fallback-model route at the engine boundary.
- Reopen trigger: any one of (a) a closed issue requesting cross-plugin composition, (b) `nop-route`'s `noproute.classify` showing a sustained `partial:marker` rate above a small threshold in production traffic, (c) `nop-age`'s `mdcontrol.run` correction-retry budget hitting `maxRetries` more than N times across M missions.

### Plugin Marketplace

- Classification: out-of-scope improvement.
- Why Not Blocking Closure: the manifest loader is in-tree; an external-source loader is a different delivery shape (different security model, different install semantics).
- Successor Required: no.

### nop-route v2: Streaming Chunk Routing

- Classification: optimization candidate.
- Why Not Blocking Closure: the v1 routes take a single final response. A future v2 may stream chunks with per-chunk routing decisions. That requires a different wire shape (SSE or chunked transfer) which the L3 host harness precedent establishes.
- Successor Required: no.

## Changelog

- 2026-08-27 — Initial design. Authored as planning anchor for the multi-plugin refactor.
