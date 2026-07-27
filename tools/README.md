# Tools Workspace

`tools/` is an independent pnpm subproject for repository-local engineering utilities.

The template root is intentionally not a Node.js project. This keeps the copied template usable for non-Node repositories while still allowing optional Node-based tooling.

The scripts in this directory inspect the parent repository.

## Install

Run from `tools/`:

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
- `check-docs-garbled.mjs`: scan docs for suspicious Unicode and mojibake
- `check-install-age.sh`: closure-gate test for `install-age.sh` — runs the installer into a throwaway target and verifies scaffold correctness (used by the template-realproject-split plan + onboarding-mission plan)

These are lightweight, generic, and reasonable to keep enabled by default.

## Example Tools

- `check-duplicates.mjs`: wrap `jscpd` for copy-paste detection
- `code-stats.mjs`: print code and docs statistics
- `audit/`: example rule-based audit scanner plus starter rules

These are kept as representative examples of reusable tooling patterns, not as mandatory policy for every copied project.

## Common Commands

Run from `tools/`:

```bash
pnpm check
pnpm stats
pnpm check:duplicates
pnpm audit:suspects
```

## Mission Driver

`tools/mission-driver/` is a **mission-driven development loop engine** — a generic opencode-based workflow that cycles through health-check → execute plans → draft plans → review plans → deep audit.

It is the template's **single source of truth** for this tool. **Projects must NOT copy this directory.** Instead, reference it via a thin shell script setting `MISSION_DRIVER_HOME`. This keeps the engine single-sourced: fixes and improvements go into the template, and all projects that reference it get them automatically.

### Integration (Do NOT Copy — Only Reference)

Create a thin `tools/mission-driver.sh` in your project. Do not copy `tools/mission-driver/`:

```bash
#!/bin/bash
MISSION_DRIVER_HOME="${MISSION_DRIVER_HOME:-$HOME/app/attractor-guided-engineering-template/tools/mission-driver}"
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$MISSION_DRIVER_HOME/src/main.js" --dir "$DIR/.." --missions-dir "missions" "$@"
```

Set `MISSION_DRIVER_HOME` env var if the template lives elsewhere.

### Per-Project Setup

1. `tools/mission-driver.sh` — the thin script above
2. `missions/<name>.json` — mission config with project paths and commands

Run `draft <description>` to have the AI generate a mission.json:
```bash
./tools/mission-driver.sh draft "Build the component library"
```

See `mission.json.example` and `design/mission-design.md` for the full schema.

## Configuration

- `check-doc-references.mjs`
  Uses `AGE_REPO_ROOT`, `AGE_ACTIVE_DOC_ROOTS`, `AGE_ACTIVE_DOC_FILES`, and `AGE_DOC_REFS_IGNORE_FILES`.
- `check-oversized-code-files.mjs`
  Uses `AGE_OVERSIZED_WARN_LINES`, `AGE_OVERSIZED_ERROR_LINES`, and `AGE_CODE_ROOT_PREFIXES`.
- `check-duplicates.mjs`
  Uses `AGE_DUPLICATE_SCAN_ROOTS`.
- `audit/`
  Uses `AGE_AUDIT_ROOTS`.
