# Multi-Plugin DSH Architecture (nop-* Plugin Family)

> **Status: AUDITED (2026-08-28) — DELIVERED (2026-08-28, all five milestones closed)** — design doc authored 2026-08-27 as the planning anchor for the multi-plugin refactor; doc-audited 2026-08-28 against the live baseline, five deviations dispositioned (plan `docs/plans/multi-plugin-dsh/2026-08-28-0149-1-m1-wi1-wi2-design-doc-audit-consistency.md` — M1-WI1). The technical roadmap lives in `docs/backlog/multi-plugin-dsh-roadmap.md`; concrete execution plans under `docs/plans/multi-plugin-dsh/` convert each work item into one deliverable. Landed: M1 (doc audit), M2 (`plugin/dsh/` → `plugin/nop-age/` migration, plan `2026-08-28-0149-2`), M3 (`plugin-manifest.yml` + `load-plugins.sh` + dual-layer verification, plan `2026-08-28-0149-3`), M4 (nop-route bundle + e2e, plans `2026-08-28-1312-1/-2/-3`), M5 (joint-mount verification WI17 plan `2026-08-28-1540-1` + full-gate closure & owner-docs final rewrite WI18 plan `2026-08-28-1540-2`). Success Criteria reconciliation at closure: §Success Criteria → Reconciliation below.

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

- Rewriting the engine. The plugin family is a packaging and naming change; engine **behavior** is zero-diff. The only permitted change under `tools/mission-driver/` is path-literal updates in the three law modules (`src/law-rules.mjs` `LAW_PROTECTED_FAMILIES` prefix + section comment, `src/law-core.mjs` header comment, `test/law-policy.test.js` gate-match assertion) — ruled 2026-08-28, see §nop-age Plugin → Migration Surface. Rejected: literal zero-diff (the P8 `law-self-protection` family and the `autonomy.policy.yml` gate match track the bundle directory — stale literals strand `plugin/nop-age/src/law/**` outside the protection set and leave the engine suite red, self-contradicting roadmap WI4's own verification face) and a dual-prefix transition (the old prefix would point at a deleted directory — a dead entry with no consumer). Residual risk: the M2 plan must pin the engine diff boundary as a grep list — the law three modules only, zero touches elsewhere under `tools/mission-driver/`.
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
│   ├── scripts/                # content tokens updated (comments/error strings — Migration Surface face (a))
│   ├── src/                    # comment/mount-log tokens only; service name 'mdcontrol' stays
│   ├── test/                   # fixture paths/assertions token-updated (Migration Surface face (a))
│   ├── assets/                 # REBUILT via build-bundle from the updated engine law modules (committed artifacts)
│   └── preset/age/             # moved from plugin/dsh/preset/age/; comment/prompt tokens per face (a)
├── nop-route/                  # NEW bundle
│   ├── package.json            # name: nop-route
│   ├── cordis.patch.yml        # isolate: { nopRoute: true }
│   ├── scripts/
│   │   ├── check-manifest.mjs  # copy/adapt from nop-age
│   │   └── e2e-noproute.mjs    # WI16 e2e entry — in-process runtime boot + four-route calls (npm run verify:e2e)
│   ├── src/
│   │   ├── service.ts          # exports apply(ctx, config); publishes `noproute` service
│   │   ├── noproute-routes.ts  # wire-method record + HTTP dispatcher registration
│   │   ├── routing-core.ts     # pure decide() function: retry? fallback? transform?
│   │   ├── model-selector.ts   # pure pickModel(request, history): ModelSelection
│   │   ├── retry-policy.ts     # pure retryDecision(error, attempt): RetryAction
│   │   └── error-classifier.ts # pure classify(error): ErrorClass
│   └── test/
│       ├── error-classifier.test.mjs  # truth table ≥10 cases (WI10)
│       ├── retry-policy.test.mjs      # truth table ≥10 cases (WI11)
│       ├── model-selector.test.mjs    # truth table ≥10 cases (WI12)
│       └── routing-core.test.mjs      # orchestration truth table (WI13)
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
- **Staging (ruled 2026-08-28)**: the manifest example above shows the **M4-onward end-state form**. M3 delivers `plugin/plugin-manifest.yml` declaring **nop-age only** — the pre-flight "asserts every plugin path exists" check is incompatible with a manifest naming a bundle that does not exist yet (`nop-route` lands at M4). The `nop-route` entry is appended when its mount face lands (M4-WI15). Pre-flight existence semantics stay exact per stage: the manifest always names only bundles that exist on disk.

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

> **As-built (M3-WI7/WI8, landed 2026-08-28, plan `docs/plans/multi-plugin-dsh/2026-08-28-0149-3`)** — deviations and verification posture:
>
> - **Host start form**: the literal `dsh web --no-open --profile "$PROFILE"` above is not a valid CLI form (the `web` subcommand is an alias of `--profile web` and rejects a parent `--profile`). As built: profile `web` → `dsh web --no-open`; any other profile → `dsh --profile "$PROFILE"`. The summary table prints before the host hands over the foreground.
> - **Dry-run** invokes zero `dsh` calls at all (not even `list`) and prints `plan: dsh plugin --profile <p> add "link:<abs>"` lines; the four-class summary (`mounted` / `already-present` / `failed` / `skipped`) prints on real mount runs, with a `removed` / `already-absent` variant for `--unmount-all`.
> - **YAML dual-channel**: python3+PyYAML probed first; on absence it degrades to `(cd plugin/nop-age && node -e 'require("yaml")…')` so `require` resolves against the bundle's pinned devDep (installed by the repo's L2 gate; `npm ci --prefix plugin/nop-age` if missing).
> - **Deterministic tests**: `plugin/test/load-plugins.test.mjs` (18 cases, PATH-injected stub `dsh` / stub python3 / stub node — e2e PATH-injection precedent; zero real-host dependency), wired into `verify-age.sh` L2 (`node --test plugin/test/load-plugins.test.mjs`, CI-isomorphic). Real-host legs are M3-WI8 evidence, deliberately outside the L2 gate.
> - **Static check**: `shellcheck plugin/load-plugins.sh` clean at 0.11.0 (`brew install shellcheck` prerequisite).
> - **Real-host verification (M3-WI8, scratch profile)**: dry-run shape ✓, real mount + `--dump-config` showing `nop-age` under `isolate: { nopAge: true }` ✓, idempotent re-run all-already-present ✓, `--unmount-all` → re-mount dump byte-identical ✓, strict fail-fast on a bad-path temp manifest ✓. Booting the host with the bundle mounted hits the known bundle-import gap (`plugin/nop-age/package.json` has no `main`/`exports`, M2-WI4 residual — successor work item; the launcher itself is unaffected: `--no-start` + dump face is the verified mount evidence).

### nop-age Plugin (Migration of plugin/dsh/)

`nop-age` is a verbatim migration of `plugin/dsh/`:

- `package.json`: `name` field changes from `dsh-mission-control` to `nop-age`; everything else (dependencies, scripts, type) unchanged.
- `cordis.patch.yml`: `isolate: { nopAge: true }` (was `missionControl`); insert row `id: mission-control` → `nop-age`; service row name changes from `dsh-mission-control` to `nop-age`; config row id changes from `mdcontrol-service` to `nop-age-service`; header comment (package name + `plugin/dsh` mount example) updates with them.
- `src/service.ts`: no functional change; the mount-log strings are updated to reference `nop-age` instead of `dsh-mission-control`. The published cordis service name `mdcontrol` stays — that is the stable API.
- `preset/age/`: same directory, same files; `preset.yml` may add a tag line referencing the new package name.
- All other source files (`src/native-executor.ts`, `src/mdcontrol-routes.ts`, `src/mdcontrol-skills.ts`, `src/law/host-adapter.ts`, `src/supervisor/*.ts`, `src/efficiency/*.ts`) remain functionally unchanged.

#### Migration Surface (doc-audit 2026-08-28 — supersedes the earlier "mv + 4-token replace in three files" sketch)

The migration is still purely mechanical — `mv plugin/dsh plugin/nop-age` plus literal token updates, no semantic change — but the surface has three faces:

**(a) Bundle-internal token face** (inside `plugin/nop-age/` after the move):

| Where | Tokens |
| --- | --- |
| `package.json` + `package-lock.json` | `name: dsh-mission-control` → `nop-age` (lockfile name rows follow) |
| `cordis.patch.yml` | header comment; insert row `id: mission-control`; isolate key `missionControl`; config row `id: mdcontrol-service`; service row `name: dsh-mission-control` |
| `src/service.ts` | header comment (`isolate: { missionControl: true }`); mount-log strings |
| `preset/age/` | `agent.cordis.yml` comments (`dsh-mission-control`, `missionControl`); `age-mode.mjs` prompt text ("exposed by the dsh-mission-control bundle"); `preset.yml` display name unchanged — "Mission Control" is the product name, not a package token |
| `scripts/*.mjs` | comments + error/usage strings embedding `plugin/dsh` (host-harness, e2e-demo, e2e-preset, e2e-continuous, verify-native, migrate-ledger, build-bundle) |
| `test/*` + `test/fixtures/*` | fixture paths and assertions embedding `plugin/dsh` / `dsh-mission-control` (bundle-scaffold, age-preset, law-truth-table, `*.cordis.yml` fixtures) |
| `assets/src/law-*.mjs` | carries the same `plugin/dsh/src/law/` literals as the engine (`law-rules.mjs:1391`, `law-core.mjs:8`) — NOT hand-edited: `assets/` is the committed build output of `scripts/build-bundle.mjs`; rebuild after the engine law-module update (face (b) items 1–2) and commit the regenerated tree (freshness gate) |

**Token-map carve-out (mandatory).** The skill IDs `mission-control-run` / `mission-control-draft` / `mission-control-analyze`, the `/mdcontrol/api` HTTP prefix, and the cordis service registration name `mdcontrol` are NOT migration tokens — they stay verbatim after the rename (roadmap M5-WI17 requires the three skills intact; the service name is the stable API, §Naming Convention). A bare `mission-control` token replacement would corrupt the skill IDs; the M2 plan's token map must carry this carve-out explicitly.

**(b) Bundle-external functional-reference face** — live references outside the bundle that break on rename (grep-verified 2026-08-28):

1. `tools/mission-driver/src/law-rules.mjs:1391` — `LAW_PROTECTED_FAMILIES` prefix `"plugin/dsh/src/law/"` (section comment `:1367` same).
2. `tools/mission-driver/src/law-core.mjs:8` — header comment naming `plugin/dsh/src/law/`.
3. `missions/autonomy.policy.yml:124` — gate match `{{projectRoot}}/plugin/dsh/src/law/**` (rule `law-self-protection`, P8).
4. `tools/mission-driver/test/law-policy.test.js:86` — asserts that match.
5. `verify-age.sh` — comments (`:10`, `:16`), L2 install/test commands (`:42`-`:46` `npm ci --prefix plugin/dsh` / `npm --prefix plugin/dsh test`), law truth-table path (`:73`).
6. `.github/workflows/age-ci.yml:26`/`:36` — `plugin/dsh/**` trigger paths.
7. `missions/age-autonomy-implementation.json:25` — `verify-e2e` command `pnpm --prefix plugin/dsh run verify:e2e` (plus a prose mention in `description`).
8. `.githooks/pre-commit:28` — comment mentioning `plugin/dsh`.

**Engine zero-diff semantics (ruled 2026-08-28).** Roadmap WI4's "引擎零 diff" means engine **behavior** zero diff, not literal zero diff: the law-module path literals above (items 1–4) MUST update with the migration — the P8 protection family and the policy gate match track the bundle directory; stale literals mean the protection set no longer covers `plugin/nop-age/src/law/**` and the engine suite goes red. No other file under `tools/mission-driver/` may change (items 5–8 are repo-infrastructure references, not engine code). The M2 plan pins this boundary as a grep-enforced diff list.

**(c) Owner-docs path sync face**: `tools/mission-driver/CONTEXT.md` (14 `plugin/dsh` hits), `docs/architecture/dsh-plugin-packaging.md` (17), `docs/process/dsh-plugin-development-guide.md` (7) — as-built statements are rewritten at M2 close, not before. `install-age.sh` / `install-age.manifest`: zero literal `plugin/dsh` references (grep-verified 2026-08-28; re-checked at M2-WI5).

No semantic change anywhere. All tests must remain green.

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
- **Pure decision functions.** `routing-core.ts`, `model-selector.ts`, `retry-policy.ts`, `error-classifier.ts` are pure functions with deterministic output for given inputs. Determinism is the verification contract — the four module-named truth-table files (`error-classifier` / `retry-policy` / `model-selector` / `routing-core`, each `.test.mjs`) run them with fake clocks and assert bit-identical decisions across runs. Test-file naming pinned 2026-08-28 (doc-audit): **module-named**, matching the nop-age in-bundle test convention (`supervisor-core.test.mjs`, `mdcontrol-routes.test.mjs`, …); a `nop-route-*.test.mjs` prefix was rejected as redundant inside a bundle directory already named `nop-route`.
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
# Once per clone, after pulling the repo (PROJECT_ROOT feeds the nop-age
# supervisor.projectRoot placeholder — undefined ${VAR} is a pre-flight error):
export PROJECT_ROOT=/path/to/this-repo
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

The user-visible behavior of nop-age is **byte-identical** to the single-plugin form — same `mdcontrol.*` routes, same skills, same HTTP dispatcher paths. The skill IDs `mission-control-run` / `mission-control-draft` / `mission-control-analyze`, the `/mdcontrol/api` prefix, and the cordis service name `mdcontrol` are explicitly outside the migration token map (§nop-age Plugin → Migration Surface). The differences are packaging-internal:

- **Bundle identity**: `nop-age` is the new package name; `dsh-mission-control` no longer exists.
- **Isolate realm key**: `nopAge` (was `missionControl`). This is observable only through cordis tree inspection in Creator mode.
- **Service row**: `nop-age` (was `dsh-mission-control`). Observable only through `--dump-config | grep -i mission-control` → `--dump-config | grep -i nop-age` substitution.
- **Manifest-driven mount**: launching is now `plugin/load-plugins.sh`, not `dsh plugin --profile web add link:.../plugin/dsh` repeated once per bundle.
- **Engine-tree posture**: engine behavior zero diff; the only engine-tree change is the path-literal update in the three law modules (`law-rules.mjs` / `law-core.mjs` / `test/law-policy.test.js`), ruled 2026-08-28 — see §nop-age Plugin → Migration Surface.

For `nop-route`:

- New service `noproute` with `noproute.*` routes. No equivalent in the single-plugin form.
- A consumer that wants to use it must explicitly call `ctx.get('noproute')` or POST to `/noproute/api/<method>`.

## Scope

In scope:

- Directory rename + literal-token migration of `plugin/dsh/` → `plugin/nop-age/` over the full three-face Migration Surface (§nop-age Plugin → Migration Surface: bundle-internal tokens + bundle-external functional references + owner-docs path sync; skill-ID/service-name carve-out enforced).
- New `plugin/nop-route/` bundle with the four pure-function modules, four routes, four truth-table/orchestration test files (`error-classifier` / `retry-policy` / `model-selector` ≥10 cases each + `routing-core` orchestration), and the e2e entry (`scripts/e2e-noproute.mjs`, `npm run verify:e2e`).
- `plugin/plugin-manifest.yml` — M3 ships the nop-age-only declaration; the nop-route entry is appended at M4-WI15 (staging ruling above).
- `plugin/load-plugins.sh` POSIX shell script with the seven flags enumerated above.
- Owner-doc updates: `dsh-plugin-integration.md`, `dsh-plugin-packaging.md`, `dsh-plugin-development-guide.md`, `tools/mission-driver/CONTEXT.md`, `README.md` (cross-link section), `install-age.sh` (no functional change; live-verified 2026-08-28 by grep to carry zero literal `plugin/dsh` references — re-check at M2-WI5).
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
3. nop-route passes its four truth-table test files — `error-classifier`, `retry-policy`, `model-selector` (≥10 cases EACH, per roadmap WI10–WI12) plus the `routing-core` orchestration table (WI13) — deterministically, and the e2e gate (`npm run verify:e2e`, in-process boot + real four-route calls + real error samples + decision replay, WI16) is green.
4. `dsh web --dump-config | grep -i nop-` shows both `nop-age` and `nop-route` registered under their respective isolate realms, no `dsh-mission-control` or `missionControl` strings remain.
5. `plugin/load-plugins.sh --unmount-all` followed by `plugin/load-plugins.sh` produces the same end state as a single run from a fresh profile.
6. The AGE preset still loads with zero service rows; AGE sessions still see `mission-control-run`/`draft`/`analyze` skills.
7. All owner docs reflect the new naming and directory shape.
8. `./verify-age.sh` L1+L2+L2.5 GREEN with the migrated plugin tests.

### Reconciliation (M5-WI18 closure, 2026-08-28 — plan `docs/plans/multi-plugin-dsh/2026-08-28-1540-2`)

| # | Criterion | Evidence |
| --- | --- | --- |
| 1 | Both bundles exist, mount cleanly under one `load-plugins.sh` invocation into a fresh profile | M5-WI17 six legs (plan `2026-08-28-1540-1`, scratch profile `nop-joint-audit`): dry-run dual plan / one-shot dual mount + single dump dual-realm / `mdcontrol` unique / idempotent already-present ×2 / unmount-remount dump diff empty / cleanup; log `docs/logs/2026/08-28.md` |
| 2 | nop-age tests pass byte-identical to pre-migration baseline | M2-WI4 (plan `2026-08-28-0149-2` Phase 2): plugin suite 423/423 = pre-migration baseline, engine 987/987 = baseline at migration time; suite has stayed green since (992 engine count at M5-WI18 reflects later age-autonomy work, only-grow) |
| 3 | nop-route four truth tables + e2e green | M4 WI10–WI13 (plan `2026-08-28-1312-1/-2`): error-classifier 20 / retry-policy 16 / model-selector 14 / routing-core 16 cases; e2e WI16 (plan `2026-08-28-1312-3`) exit 0 — re-run at M5-WI18 closure exit 0 (classify 8/8, route 10 four kinds, replay 18/18 bit-identical) |
| 4 | dump shows both bundles under their realms, zero `dsh-mission-control`/`missionControl` residue | M5-WI17 dump leg: single dump hits `isolate: { nopAge: true }` + `isolate: { nopRoute: true }`, `missionControl` zero hits; M2 migration grep closure zero hits (plan `2026-08-28-0149-2`) |
| 5 | `--unmount-all` → re-mount = single-run end state | M5-WI17 leg ⑤: dump `diff` empty after unmount-remount (also proven per-bundle at M3-WI8 / M4-WI15) |
| 6 | AGE preset zero service rows; three skills intact | M5-WI17 preset/skills face: `verify:e2e:preset` exit 0 + L2 age-preset D3 zero-service-row gate + skills three-row tests; structural pin `plugin/nop-age/test/age-preset.test.mjs` |
| 7 | Owner docs reflect new naming/directory shape | M2-WI2 forward-reference pass (plan `2026-08-28-0149-1` Phase 2) → M4-WI15 as-built increments (plan `2026-08-28-1312-2` Phase 3) → **M5-WI18 final two-bundle structural rewrite** (plan `2026-08-28-1540-2` Phase 3): `docs/architecture/dsh-plugin-packaging.md` / `docs/design/dsh-plugin-integration.md` / `docs/process/dsh-plugin-development-guide.md` §family as-built + this reconciliation |
| 8 | `./verify-age.sh` L1+L2+L2.5 GREEN | M5-WI18 fresh run: exit 0 GREEN — engine 992/992 + nop-age 423/423 + nop-route 97/97 + launcher 18/18 + policy ok + corpus 30 ok + law truth table 119/119 |

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

- 2026-08-28 — **M5 landed (closure, WI17+WI18, plans `docs/plans/multi-plugin-dsh/2026-08-28-1540-1` + `2026-08-28-1540-2`)**: WI17 joint-mount six-leg verification (dual-realm single dump / `mdcontrol` unique / idempotent / unmount-remount identity / preset+skills face; CLI-form deviation `dsh web --dump-config` → legal `dsh --profile <p> --dump-config` recorded); WI18 full-gate closure — `./verify-age.sh` GREEN (992+423+97+18+119), mission `test` key pass, e2e both legs explicitly re-run exit 0 (`2026-08-28-1312-3` Deferred residual-risk compensation collected), and the `2026-08-28-1312-2` Deferred「owner docs full two-bundle structural rewrite」collected: three owner docs rewritten to family-as-built final state + §Success Criteria Reconciliation added here. Roadmap fully ticked; all five milestones done.
- 2026-08-28 — **M4 landed (WI9–WI16, plans `docs/plans/multi-plugin-dsh/2026-08-28-1312-1` + `-2` + `-3`)**: nop-route bundle scaffold + L2/CI wiring; error-classifier / retry-policy / model-selector pure modules with module-named truth tables (20/16/14 cases) + determinism greps; routing-core 4-decision orchestration (16 cases); noproute wire record + `/noproute/api` HTTP dispatcher (17 cases); service mount `noproute` (9 cases) + manifest nop-route entry appended (dual-entry end state); e2e `scripts/e2e-noproute.mjs` + `verify:e2e` (in-process real cordis boot, four-route real calls, real-shape samples, replay 18/18 bit-identical) — env-independent local gate, ruled outside verify-age.sh L2/CI (family-symmetric Decision, re-run at M5-WI18). Plugin suite 97/97; three owner docs §nop-route as-built increments (full rewrite deferred to M5-WI18 — collected there).
- 2026-08-28 — **M3 landed** (WI6/WI7/WI8, plan `docs/plans/multi-plugin-dsh/2026-08-28-0149-3`): `plugin/plugin-manifest.yml` in-repo declaring nop-age only (staging ruling above); `plugin/load-plugins.sh` POSIX launcher (7 flags, pre-flight enforcement, idempotent mount, dual-channel YAML validation); §Load Script as-built note added (start-command CLI form, dry-run/summary shapes, test location, L2 wiring, shellcheck, real-host evidence + known boot-import residual). Design remains AUDITED; milestone notes appended as M4–M5 land.
- 2026-08-28 — **Doc-audit pass** (M1-WI1, plan `docs/plans/multi-plugin-dsh/2026-08-28-0149-1-m1-wi1-wi2-design-doc-audit-consistency.md`): five live-baseline deviations dispositioned — ① migration surface rewritten as the three-face list (bundle-internal tokens incl. insert-row id, bundle-external functional references ×8, owner-docs sync face) + mandatory skill-ID/`mdcontrol`/`/mdcontrol/api` token-map carve-out; ② "engine zero diff" ruled = behavior zero diff with law-three-module path-literal updates only (alternatives rejected, residual risk → M2 grep boundary); ③ manifest staging ruled nop-age-only at M3, example annotated M4-onward end state; ④ nop-route test face unified to four module-named truth tables (naming pinned) + e2e entry, counts aligned with roadmap WI10–WI13/WI16; ⑤ install-age zero literal reference annotated as live-verified. Status DRAFT → AUDITED.
- 2026-08-27 — Initial design. Authored as planning anchor for the multi-plugin refactor.
