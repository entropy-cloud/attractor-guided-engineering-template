#!/bin/bash
# install-age.sh — Install the AGE (Attractor-Guided Engineering) scaffold into a target project.
#
# Run this script FROM the template repo. It copies the docs scaffold, creates
# the mission-driver shim, sets up .env, and prepares missions/ — all adapted
# to your project. The mission-driver engine itself is NOT copied; it is
# referenced via MISSION_DRIVER_HOME (see tools/mission-driver.sh created below).
#
# Usage (interactive):
#   ./install-age.sh
#
# Usage (non-interactive):
#   ./install-age.sh /path/to/target-project "My Project Name"
#
# Prerequisites: Node.js >= 18 in PATH (used for relative-path computation only).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd | tr -d '\r')"
TEMPLATE_ROOT="$SCRIPT_DIR"
MDH_ABS="$TEMPLATE_ROOT/tools/mission-driver"
YEAR="$(date +%Y)"

# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------

if [ $# -ge 2 ]; then
  TARGET_RAW="$1"
  PROJECT_NAME="$2"
else
  echo "=== AGE Scaffold Installer ==="
  echo ""
  read -rp "Target project path (e.g. /c/Work/my-project): " TARGET_RAW
  read -rp "Project name (for docs/AGENTS.md placeholders): " PROJECT_NAME
  echo ""
fi

if [ -z "$TARGET_RAW" ] || [ -z "$PROJECT_NAME" ]; then
  echo "ERROR: both target path and project name are required." >&2
  exit 1
fi

# Resolve target to absolute.
if ! TARGET="$(cd "$TARGET_RAW" 2>/dev/null && pwd | tr -d '\r')"; then
  echo "ERROR: target path does not exist: $TARGET_RAW" >&2
  exit 1
fi

# Compute relative MISSION_DRIVER_HOME (target → engine) via Node for robustness.
# Force forward-slash separators: the shim is bash and cd won't handle backslashes.
REL_MDH="$(node -e "
const p = require('path');
const rel = p.relative(p.resolve(process.argv[1]), p.resolve(process.argv[2]));
console.log(rel.split(p.sep).join('/'));
" "$TARGET" "$MDH_ABS" 2>/dev/null || echo "")"
if [ -z "$REL_MDH" ]; then
  # Fallback: absolute path if relative computation fails.
  REL_MDH="$MDH_ABS"
fi

echo "Target:              $TARGET"
echo "Project name:        $PROJECT_NAME"
echo "Mission-driver home: $REL_MDH  (relative from target)"
echo ""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

copy_scaffold() {
  local src="$1" dst="$2"
  if [ -d "$dst" ]; then
    cp -rn "$src/." "$dst/" 2>/dev/null || true
  else
    mkdir -p "$dst"
    cp -r "$src/." "$dst/"
  fi
}

replace_placeholders() {
  local file="$1"
  if [ -f "$file" ]; then
    # BSD sed (macOS) and GNU sed (Linux/Git Bash) both support -i '' workaround
    # via a temp file to stay portable.
    local tmp; tmp="$(mktemp)"
    sed "s/<project-name>/$PROJECT_NAME/g" "$file" > "$tmp" && mv "$tmp" "$file"
  fi
}

ensure_gitignore_entry() {
  local entry="$1"
  local gi="$TARGET/.gitignore"
  touch "$gi"
  if ! grep -qxF "$entry" "$gi" 2>/dev/null; then
    echo "$entry" >> "$gi"
  fi
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

if [ ! -f "$MDH_ABS/src/main.js" ]; then
  echo "ERROR: mission-driver engine not found at: $MDH_ABS/src/main.js" >&2
  echo "       Run this script from inside the attractor-guided-engineering-template repo." >&2
  exit 1
fi

if [ -f "$TARGET/AGENTS.md" ] || [ -d "$TARGET/docs/context" ]; then
  echo "WARNING: target already has AGENTS.md or docs/context/." >&2
  read -rp "Continue and merge (existing files won't be overwritten)? [y/N] " CONFIRM
  case "$CONFIRM" in
    y|Y|yes|YES) echo "Proceeding..." ;;
    *) echo "Aborted."; exit 0 ;;
  esac
  echo ""
fi

# ---------------------------------------------------------------------------
# 1. Copy docs/ scaffold
# ---------------------------------------------------------------------------

echo "[1/7] Copying docs/ scaffold..."

# Subdirs to copy (everything in template docs/ EXCEPT articles/ and examples/
# which are template-internal methodology/explanation).
DOCS_SUBDIRS=(
  analysis architecture archive audits backlog bugs context
  design discussions input lessons logs plans process
  references requirements retrospectives skills testing
)

for sub in "${DOCS_SUBDIRS[@]}"; do
  if [ -d "$TEMPLATE_ROOT/docs/$sub" ]; then
    copy_scaffold "$TEMPLATE_ROOT/docs/$sub" "$TARGET/docs/$sub"
  fi
done

# Copy docs/index.md (the docs router).
if [ -f "$TEMPLATE_ROOT/docs/index.md" ] && [ ! -f "$TARGET/docs/index.md" ]; then
  cp "$TEMPLATE_ROOT/docs/index.md" "$TARGET/docs/index.md"
fi

# Remove template-internal files that START-HERE-after-copy.md says NOT to copy.
rm -f "$TARGET/docs/retrospectives/template-design-decisions.md" 2>/dev/null || true

# Copy examples/ as format references (optional but useful).
if [ -d "$TEMPLATE_ROOT/docs/examples" ]; then
  copy_scaffold "$TEMPLATE_ROOT/docs/examples" "$TARGET/docs/examples"
fi

echo "      done."

# ---------------------------------------------------------------------------
# 2. Copy AGENTS.md (replace placeholder)
# ---------------------------------------------------------------------------

echo "[2/7] Copying AGENTS.md..."
if [ ! -f "$TARGET/AGENTS.md" ]; then
  cp "$TEMPLATE_ROOT/AGENTS.md" "$TARGET/AGENTS.md"
  replace_placeholders "$TARGET/AGENTS.md"
  echo "      done."
else
  echo "      skipped (AGENTS.md already exists)."
fi

# ---------------------------------------------------------------------------
# 3. Create tools/mission-driver.sh (the shim)
# ---------------------------------------------------------------------------

echo "[3/7] Creating tools/mission-driver.sh..."
mkdir -p "$TARGET/tools"
if [ ! -f "$TARGET/tools/mission-driver.sh" ]; then
  cat > "$TARGET/tools/mission-driver.sh" <<'SHIM_EOF'
#!/bin/bash
# tools/mission-driver.sh — Mission driver launcher (thin shim).
#
# The mission-driver ENGINE is NOT copied into this repo. It lives in the shared
# attractor-guided-engineering-template and is located via MISSION_DRIVER_HOME,
# read from (in priority order):
#   1. the process environment (export MISSION_DRIVER_HOME=...)
#   2. the repo-root .env file (copy .env.example to .env and edit)
#
# MISSION_DRIVER_HOME may be RELATIVE (resolved from this repo's root) or absolute.
#
# Project-local customization needs no engine fork:
#   missions/<name>.json       mission configs
#   missions/flows/*.json      project-specific flows / subflows (searched first)
#   missions/prompts/*.md      project-specific / overridden prompts (searched first)

DIR="$(cd "$(dirname "$0")" && pwd | tr -d '\r')"
PROJECT_ROOT="$(cd "$DIR/.." && pwd | tr -d '\r')"

# Environment wins over .env: capture any pre-set value, load .env, then restore.
_ENV_MDH="$MISSION_DRIVER_HOME"
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_ROOT/.env"
  set +a
fi
[ -n "$_ENV_MDH" ] && MISSION_DRIVER_HOME="$_ENV_MDH"

if [ -z "$MISSION_DRIVER_HOME" ]; then
  echo "ERROR: MISSION_DRIVER_HOME is not set." >&2
  echo "" >&2
  echo "Configure it once:" >&2
  echo "  cp .env.example .env" >&2
  echo "  # then set MISSION_DRIVER_HOME in .env" >&2
  exit 1
fi

# Resolve relative MISSION_DRIVER_HOME against the repo root (absolute passes through).
case "$MISSION_DRIVER_HOME" in
  /*|[A-Za-z]:[/\\]*) ABS_HOME="$MISSION_DRIVER_HOME" ;;
  *) ABS_HOME="$(cd "$PROJECT_ROOT/$MISSION_DRIVER_HOME" 2>/dev/null && pwd | tr -d '\r')" ;;
esac

if [ -z "$ABS_HOME" ] || [ ! -f "$ABS_HOME/src/main.js" ]; then
  echo "ERROR: MISSION_DRIVER_HOME does not point to a valid mission-driver install." >&2
  echo "  MISSION_DRIVER_HOME = $MISSION_DRIVER_HOME" >&2
  echo "  resolved to         = ${ABS_HOME:-<unresolved>}" >&2
  echo "  expected file       = \$MISSION_DRIVER_HOME/src/main.js" >&2
  exit 1
fi

exec node "$ABS_HOME/src/main.js" \
  --dir "$PROJECT_ROOT" \
  --missions-dir "missions" \
  "$@"
SHIM_EOF
  chmod +x "$TARGET/tools/mission-driver.sh"
  echo "      done."
else
  echo "      skipped (tools/mission-driver.sh already exists)."
fi

# ---------------------------------------------------------------------------
# 4. Create .env.example + .env
# ---------------------------------------------------------------------------

echo "[4/7] Creating .env.example + .env..."

# .env.example (committed) — documents the variable with a placeholder.
if [ ! -f "$TARGET/.env.example" ]; then
  cat > "$TARGET/.env.example" <<ENV_EXAMPLE
# mission-driver engine location.
# The engine is NOT copied into this repo — it lives in the shared
# attractor-guided-engineering-template. Set this to the path of the template's
# tools/mission-driver/ directory. Use a RELATIVE path (resolved from repo root)
# so it works across machines; absolute paths also work.
#
# Example (if the template is checked out as a sibling):
#   MISSION_DRIVER_HOME=../opensource/attractor-guided-engineering-template/tools/mission-driver
MISSION_DRIVER_HOME=$REL_MDH
ENV_EXAMPLE
else
  # Append the mission-driver section if not already present.
  if ! grep -q "MISSION_DRIVER_HOME" "$TARGET/.env.example" 2>/dev/null; then
    echo "" >> "$TARGET/.env.example"
    echo "# mission-driver engine location (see tools/mission-driver.sh)." >> "$TARGET/.env.example"
    echo "MISSION_DRIVER_HOME=$REL_MDH" >> "$TARGET/.env.example"
  fi
fi

# .env (gitignored, local) — ready to use with the computed path.
if [ ! -f "$TARGET/.env" ]; then
  echo "MISSION_DRIVER_HOME=$REL_MDH" > "$TARGET/.env"
else
  # Ensure the var exists in .env; don't overwrite if already set.
  if ! grep -q "^MISSION_DRIVER_HOME=" "$TARGET/.env" 2>/dev/null; then
    echo "MISSION_DRIVER_HOME=$REL_MDH" >> "$TARGET/.env"
  fi
fi

echo "      done."

# ---------------------------------------------------------------------------
# 5. Create missions/base.json
# ---------------------------------------------------------------------------

echo "[5/7] Creating missions/base.json..."
mkdir -p "$TARGET/missions"
if [ ! -f "$TARGET/missions/base.json" ]; then
  cat > "$TARGET/missions/base.json" <<BASE_EOF
{
  "_comment": "Shared defaults for all missions in this repo. Individual missions extend \"base\" via \"extends\": \"base\" and override only the fields they need. Fill in commands.* for YOUR stack (the placeholders below are intentionally invalid — replace them before running a mission).",
  "model": "zhipuai-coding-plan/glm-5.2",
  "parseModel": "zhipuai-coding-plan/glm-4.7-flash",
  "agent": "build",
  "maxCycles": 8,
  "maxInnerCycles": 6,
  "maxTotalSteps": 500,
  "fastSkipSteps": [],
  "planGuide": "docs/plans/00-plan-authoring-and-execution-guide.md",
  "auditsDir": "docs/audits",
  "contextDir": "docs/context",
  "commands": {
    "test": "REPLACE_WITH_YOUR_TEST_COMMAND",
    "build": "REPLACE_WITH_YOUR_BUILD_COMMAND",
    "lint": "REPLACE_WITH_YOUR_LINT_COMMAND",
    "typecheck": "REPLACE_WITH_YOUR_TYPECHECK_COMMAND"
  },
  "commitFormat": "<type>(<scope>): <description>"
}
BASE_EOF
  echo "      done."
else
  echo "      skipped (missions/base.json already exists)."
fi

# ---------------------------------------------------------------------------
# 6. Create docs/logs/{year}/
# ---------------------------------------------------------------------------

echo "[6/7] Creating docs/logs/$YEAR/..."
mkdir -p "$TARGET/docs/logs/$YEAR"
echo "      done."

# ---------------------------------------------------------------------------
# 7. Update .gitignore
# ---------------------------------------------------------------------------

echo "[7/7] Updating .gitignore..."
ensure_gitignore_entry ".env"
ensure_gitignore_entry "_tmp/"
ensure_gitignore_entry "tmp/"
echo "      done."

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "=============================================="
echo "  AGE scaffold installed for: $PROJECT_NAME"
echo "=============================================="
echo ""
echo "Created:"
echo "  - AGENTS.md                          (AI operating contract — review & customize)"
echo "  - docs/                              (scaffold: context, backlog, requirements, design, ...)"
echo "  - tools/mission-driver.sh            (engine shim, MISSION_DRIVER_HOME=$REL_MDH)"
echo "  - .env + .env.example                (MISSION_DRIVER_HOME configured)"
echo "  - missions/base.json                 (shared mission defaults — FILL IN commands.*)"
echo "  - docs/logs/$YEAR/                    (daily log dir)"
echo ""
echo "NEXT STEPS (see docs/context/project-context.md for details):"
echo ""
echo "  1. Fill docs/context/project-context.md with real identity + verification commands."
echo "  2. Fill docs/context/ai-autonomy-policy.md protected areas + reviewer availability."
echo "  3. Fill docs/context/codebase-map.md with real entry points."
echo "  4. Fill missions/base.json commands.* (test/build/lint/typecheck) for YOUR stack."
echo "  5. Put the first requirement under docs/requirements/ or docs/design/."
echo "  6. Verify the shim:  ./tools/mission-driver.sh list"
echo ""
echo "Do NOT copy tools/mission-driver/ (the engine) into this repo — it is"
echo "referenced via MISSION_DRIVER_HOME and kept single-sourced in the template."
