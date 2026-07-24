#!/bin/bash
# install-age.sh — Install the AGE (Attractor-Guided Engineering) scaffold into a target project.
#
# Copies ONLY the files listed in install-age.manifest (one path per line). Existing
# target files are SKIPPED (never overwritten). At the end, prints what was copied
# vs skipped so you know exactly what landed.
#
# The mission-driver engine itself is NOT copied; it is referenced via
# MISSION_DRIVER_HOME (see tools/mission-driver.sh created below).
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
MANIFEST="$TEMPLATE_ROOT/install-age.manifest"
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

# Compute relative MISSION_DRIVER_HOME (target → engine) via Node, force forward slashes.
REL_MDH="$(node -e "
const p = require('path');
const rel = p.relative(p.resolve(process.argv[1]), p.resolve(process.argv[2]));
console.log(rel.split(p.sep).join('/'));
" "$TARGET" "$MDH_ABS" 2>/dev/null || echo "")"
if [ -z "$REL_MDH" ]; then
  REL_MDH="$MDH_ABS"
fi

echo "Target:              $TARGET"
echo "Project name:        $PROJECT_NAME"
echo "Mission-driver home: $REL_MDH  (relative from target)"
echo ""

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: manifest not found: $MANIFEST" >&2
  exit 1
fi
if [ ! -f "$MDH_ABS/src/main.js" ]; then
  echo "ERROR: mission-driver engine not found at: $MDH_ABS/src/main.js" >&2
  echo "       Run this script from inside the attractor-guided-engineering-template repo." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Copy files from manifest (skip existing)
# ---------------------------------------------------------------------------

echo "[1/7] Copying scaffold files from manifest..."

COPIED=()
SKIPPED=()

while IFS= read -r raw; do
  # Strip comments and trim whitespace.
  line="${raw%%#*}"
  line="$(echo "$line" | xargs)"
  [ -z "$line" ] && continue

  src="$TEMPLATE_ROOT/$line"
  dst="$TARGET/$line"

  if [ ! -f "$src" ]; then
    echo "  WARN: manifest lists '$line' but source missing — skipped." >&2
    continue
  fi

  if [ -f "$dst" ]; then
    SKIPPED+=("$line")
    continue
  fi

  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  COPIED+=("$line")
done < "$MANIFEST"

echo "      copied ${#COPIED[@]} files, skipped ${#SKIPPED[@]} existing."

# Replace <project-name> in AGENTS.md (only if it was just copied).
for f in "${COPIED[@]}"; do
  if [ "$f" = "AGENTS.md" ]; then
    tmp="$(mktemp)"
    sed "s/<project-name>/$PROJECT_NAME/g" "$TARGET/AGENTS.md" > "$tmp" && mv "$tmp" "$TARGET/AGENTS.md"
  fi
done

# ---------------------------------------------------------------------------
# 2. Create tools/mission-driver.sh (the shim)
# ---------------------------------------------------------------------------

echo "[2/7] Creating tools/mission-driver.sh..."
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
  echo "  cp .env.example .env  then set MISSION_DRIVER_HOME in .env" >&2
  exit 1
fi

case "$MISSION_DRIVER_HOME" in
  /*|[A-Za-z]:[/\\]*) ABS_HOME="$MISSION_DRIVER_HOME" ;;
  *) ABS_HOME="$(cd "$PROJECT_ROOT/$MISSION_DRIVER_HOME" 2>/dev/null && pwd | tr -d '\r')" ;;
esac

if [ -z "$ABS_HOME" ] || [ ! -f "$ABS_HOME/src/main.js" ]; then
  echo "ERROR: MISSION_DRIVER_HOME does not point to a valid mission-driver install." >&2
  echo "  resolved to = ${ABS_HOME:-<unresolved>}" >&2
  exit 1
fi

exec node "$ABS_HOME/src/main.js" \
  --dir "$PROJECT_ROOT" \
  --missions-dir "missions" \
  "$@"
SHIM_EOF
  chmod +x "$TARGET/tools/mission-driver.sh"
  echo "      created."
else
  echo "      skipped (already exists)."
fi

# ---------------------------------------------------------------------------
# 3. Create .env.example + .env
# ---------------------------------------------------------------------------

echo "[3/7] Creating .env.example + .env..."

if [ ! -f "$TARGET/.env.example" ]; then
  cat > "$TARGET/.env.example" <<ENV_EXAMPLE
# mission-driver engine location.
# The engine is NOT copied into this repo — it lives in the shared
# attractor-guided-engineering-template. Set this to the path of the template's
# tools/mission-driver/ directory. Relative paths are resolved from repo root.
MISSION_DRIVER_HOME=$REL_MDH
ENV_EXAMPLE
else
  if ! grep -q "MISSION_DRIVER_HOME" "$TARGET/.env.example" 2>/dev/null; then
    echo "" >> "$TARGET/.env.example"
    echo "# mission-driver engine location (see tools/mission-driver.sh)." >> "$TARGET/.env.example"
    echo "MISSION_DRIVER_HOME=$REL_MDH" >> "$TARGET/.env.example"
  fi
fi

if [ ! -f "$TARGET/.env" ]; then
  echo "MISSION_DRIVER_HOME=$REL_MDH" > "$TARGET/.env"
  echo "      created."
else
  if ! grep -q "^MISSION_DRIVER_HOME=" "$TARGET/.env" 2>/dev/null; then
    echo "MISSION_DRIVER_HOME=$REL_MDH" >> "$TARGET/.env"
  fi
  echo "      .env exists (MISSION_DRIVER_HOME ensured)."
fi

# ---------------------------------------------------------------------------
# 4. Create missions/base.json
# ---------------------------------------------------------------------------

echo "[4/7] Creating missions/base.json..."
mkdir -p "$TARGET/missions"
if [ ! -f "$TARGET/missions/base.json" ]; then
  cat > "$TARGET/missions/base.json" <<BASE_EOF
{
  "_comment": "Shared defaults for all missions. Fill commands.* for YOUR stack.",
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
  echo "      created."
else
  echo "      skipped (already exists)."
fi

# ---------------------------------------------------------------------------
# 5. Create docs/logs/{year}/
# ---------------------------------------------------------------------------

echo "[5/7] Creating docs/logs/$YEAR/..."
mkdir -p "$TARGET/docs/logs/$YEAR"
echo "      done."

# ---------------------------------------------------------------------------
# 6. Update .gitignore
# ---------------------------------------------------------------------------

echo "[6/7] Updating .gitignore..."
ensure_gitignore_entry() {
  local entry="$1" gi="$TARGET/.gitignore"
  touch "$gi"
  grep -qxF "$entry" "$gi" 2>/dev/null || echo "$entry" >> "$gi"
}
ensure_gitignore_entry ".env"
ensure_gitignore_entry "_tmp/"
ensure_gitignore_entry "tmp/"
echo "      done."

# ---------------------------------------------------------------------------
# 7. Report
# ---------------------------------------------------------------------------

echo "[7/7] Report"
echo ""
echo "===== COPIED (${#COPIED[@]} files) ====="
for f in "${COPIED[@]}"; do echo "  + $f"; done

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo ""
  echo "===== SKIPPED — already exists (${#SKIPPED[@]} files) ====="
  for f in "${SKIPPED[@]}"; do echo "  = $f"; done
fi

echo ""
echo "=============================================="
echo "  AGE scaffold installed for: $PROJECT_NAME"
echo "=============================================="
echo ""
echo "Also created:"
echo "  - tools/mission-driver.sh            (shim, MISSION_DRIVER_HOME=$REL_MDH)"
echo "  - .env + .env.example                (MISSION_DRIVER_HOME configured)"
echo "  - missions/base.json                 (FILL IN commands.*)"
echo "  - docs/logs/$YEAR/                    (daily log dir)"
echo ""
echo "NEXT STEPS:"
echo "  1. Fill docs/context/project-context.md (identity + verification commands)."
echo "  2. Fill docs/context/ai-autonomy-policy.md (protected areas)."
echo "  3. Fill docs/context/codebase-map.md (entry points)."
echo "  4. Fill missions/base.json commands.* for YOUR stack."
echo "  5. Verify: ./tools/mission-driver.sh list"
