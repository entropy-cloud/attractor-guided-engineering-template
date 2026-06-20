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

- `check-active-doc-code-anchors.mjs`: validate repo paths referenced in active docs
- `check-oversized-code-files.mjs`: flag tracked code files that exceed line thresholds
- `check-docs-garbled.mjs`: scan docs for suspicious Unicode and mojibake

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

It is the template's **single source of truth** for this tool. Projects reference it via a thin shell script rather than maintaining their own copy.

### Integration

Create `tools/mission-driver.sh` in your project:

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

Run `--draft-mission <description>` to have the AI generate a mission.json:
```bash
./tools/mission-driver.sh --draft-mission "Build the component library"
```

See `mission.json.example` and `design/mission-design.md` for the full schema.

## Configuration

- `check-active-doc-code-anchors.mjs`
  Uses `AGE_REPO_ROOT`, `AGE_ACTIVE_DOC_ROOTS`, and `AGE_ACTIVE_DOC_FILES`.
- `check-oversized-code-files.mjs`
  Uses `AGE_OVERSIZED_WARN_LINES`, `AGE_OVERSIZED_ERROR_LINES`, and `AGE_CODE_ROOT_PREFIXES`.
- `check-duplicates.mjs`
  Uses `AGE_DUPLICATE_SCAN_ROOTS`.
- `audit/`
  Uses `AGE_AUDIT_ROOTS`.
