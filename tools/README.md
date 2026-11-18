# Tools Workspace

`tools/` is a pnpm workspace for repository-local engineering utilities and the mission-driver engine.

The template root is intentionally not a Node.js project. This keeps the copied template usable for non-Node repositories while still allowing optional Node-based tooling.

The scripts in this directory inspect the parent repository.

## Workspace Layout

`tools/` is the pnpm workspace root (see `pnpm-workspace.yaml`). Members:

| Member | Path | Purpose |
| ------ | ---- | ------- |
| `age-template-tools` (root) | `tools/` | Shared devDeps (`jscpd`, `prettier`) + repo-level check/lint scripts |
| `mission-driver` | `$MISSION_DRIVER_HOME/` | The AGE dev-loop engine (zero npm deps; `commander` vendored) |
| `mission-driver-monitor-web` | `$MISSION_DRIVER_HOME/web/` | Vue 3 monitor dashboard frontend |

Single lockfile (`tools/pnpm-lock.yaml`); single `packageManager` pin (`pnpm@10.27.0`, inherited by members). The engine member stays zero-dep — workspace membership does not inject dependencies.

## Install

Run from `tools/` (installs all workspace members):

```bash
pnpm install
```

## Tool Selection Rule

Files kept in this directory should satisfy at least one of these conditions:

- generic enough to be useful across many copied projects
- representative enough to serve as a reusable example pattern

Do not keep one-off migration scripts, repo-specific cleanup scripts, or tools that mainly encode a single team's naming policy.

## Core Tools

- `check-doc-references.mjs`: validate backtick paths and markdown links referenced in active docs
- `check-oversized-code-files.mjs`: flag tracked code files that exceed line thresholds
- `check-docs-garbled.mjs`: heuristic diagnostic with `_tmp/` reports; `--blocking` fails likely-garbled candidates
- `check-install-age.sh`: closure-gate test for `install-age.sh` — runs the installer into a throwaway target and verifies scaffold correctness (used by the template-realproject-split plan + onboarding-mission plan)
- `install-age.mjs`: cross-platform manifest installer; shell/Windows launchers delegate to it. Consumer contract tests: `node --test tools/install-age.test.mjs tools/install-age.integration.test.mjs` from the repository root.
- `age-drift.mjs`: installed standalone, read-only origin inspection; run `node tools/age-drift.mjs [target]`. Exit 0 unchanged, 1 drift, 2 unknown/invalid origin or inspection error. No overwrite, upgrade, remote fetch or secret configuration storage. See `docs/architecture/template-vs-realproject-boundary.md` for installation safety and limits.

These are lightweight, generic, and reasonable to keep enabled by default.

Source packaging gate: `node tools/verify-consumer.mjs` (or `pnpm --prefix tools check:consumer`). Fixed suites cover installation, workflow delivery, guard negative controls, installed guide/hook smoke and CI triggers. This checks managed consumers, not all legacy source-doc references; run the reference checker separately for that broader diagnostic. The aggregate, tests and source CI are not installed downstream.

## Example Tools

- `check-duplicates.mjs`: wrap `jscpd` for copy-paste detection
- `code-stats.mjs`: print code and docs statistics
- `audit/`: example rule-based audit scanner plus starter rules

These are kept as representative examples of reusable tooling patterns, not as mandatory policy for every copied project.

## Common Commands

Run from `tools/`:

```bash
pnpm check                # repo-level doc/code checks
pnpm stats                # code and docs statistics
pnpm check:duplicates     # copy-paste detection via jscpd
pnpm audit:suspects       # rule-based audit scanner
pnpm md:test              # mission-driver engine tests (node --test + prompt-check)
pnpm md:web:build         # rebuild monitor frontend dist
pnpm md:web:check:dist    # verify committed dist is fresh (CI guard, local mirror)
```

## Mission Driver

`$MISSION_DRIVER_HOME/` is a **mission-driven development loop engine** — a generic opencode-based workflow that cycles through health-check → execute plans → draft plans → review plans → deep audit.

It is the template's source for the optional consumer add-on. `--with-mission-driver` vendors an independent copy into the consumer; no sibling checkout or runtime npm dependencies are required. The launcher defaults to the consumer-local path. Engine upgrades are explicit, reviewed integrations, not automatic changes inherited from a shared checkout.

### Consumer Integration

From a template checkout, install into an existing target directory:

```bash
./install-age.sh /path/to/target "Project Name" --with-mission-driver
```

For safety, installation refuses a nonempty engine with unknown/incompatible provenance before copying anything. Reinstallation does not overwrite files or reconfigure installed options. See `docs/guides/mission-driver-add-on.md` for setup, manual integration and current gate-wiring limits.

### Per-Project Setup

1. `tools/mission-driver.sh` — the installed launcher
2. `missions/<name>.json` — mission config with project paths and commands

Run `draft <description>` to have the AI generate a mission.json:
```bash
./tools/mission-driver.sh draft "Build the component library"
```

See `mission.json.example` and `design/mission-design.md` for the full schema.

## Configuration

- `check-doc-references.mjs`
  Uses `AGE_REPO_ROOT`, `AGE_ACTIVE_DOC_ROOTS`, and `AGE_ACTIVE_DOC_FILES` for explicit scoped scans. Reference classification conventions live in `docs/guides/doc-organization.md`; there is no whole-file ignore list.
- `check-oversized-code-files.mjs`
  Uses `AGE_OVERSIZED_WARN_LINES`, `AGE_OVERSIZED_ERROR_LINES`, and `AGE_CODE_ROOT_PREFIXES`.
- `check-duplicates.mjs`
  Uses `AGE_DUPLICATE_SCAN_ROOTS`.
- `audit/`
  Uses `AGE_AUDIT_ROOTS`.

## Plan / Roadmap State Tools

- `plan-status.mjs` — plan frontmatter status transitions (transition law enforced: `completed` derived-never-written, `held` requires a hold reason, terminal states never revive), whole-repo plan inventory (`--list`), and roadmap completion verdict by checkbox count (`--roadmap`). See `docs/guides/plan-authoring-and-execution.md`.

## Vendored Libraries

- `vendor/js-yaml.mjs` — js-yaml 4.1.1 (MIT), single-file ESM copy. The reusable YAML parser for all tools in this directory; do not add npm dependencies for YAML — import this file.
