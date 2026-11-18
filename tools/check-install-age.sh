#!/bin/bash
# tools/check-install-age.sh — Persisted closure-gate test for install-age.sh.
#
# Backfills the closure-gate snippet that was previously inline in
# docs/architecture/template-vs-realproject-boundary.md:69-76 (manual snippet only,
# never persisted as a script — flagged by the 2026-07-27-0100 onboarding-mission
# plan's independent draft review).
#
# Runs ./install-age.sh into a throwaway target and verifies the install produces
# the expected scaffold. Used by:
#   - The 2026-07-27-0000 plan (template-realproject split) Phase 3 closure gate
#   - The 2026-07-27-0100 plan (onboarding mission) Phase 2 closure gate
#
# Usage (from repo root, in bash / Git Bash):
#   ./tools/check-install-age.sh                          # auto-create _tmp target
#   ./tools/check-install-age.sh /path/to/target          # use existing target dir
#
# Exit codes: 0 = all assertions PASS; 1 = at least one FAIL; 2 = bad usage.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd | tr -d '\r')"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd | tr -d '\r')"

TARGET_RAW="${1:-}"
mkdir -p "$REPO_ROOT/_tmp"
SCRATCH="$(mktemp -d "$REPO_ROOT/_tmp/age-install-check-XXXXXX")" || exit 2
# Only this invocation's generated targets/logs are removed, including on failure.
trap 'rm -rf "$SCRATCH"' EXIT
OWNED_TEMP=0
if [ -z "$TARGET_RAW" ]; then
  TARGET_RAW="$SCRATCH/default"
  mkdir -p "$TARGET_RAW"
  OWNED_TEMP=1
fi

# Resolve target to absolute.
if ! TARGET="$(cd "$TARGET_RAW" 2>/dev/null && pwd | tr -d '\r')"; then
  echo "ERROR: target path does not exist: $TARGET_RAW" >&2
  exit 2
fi

PROJECT_NAME="TestProject"

echo "Target: $TARGET"
echo "Project name: $PROJECT_NAME"
echo ""

# Run install-age.sh from repo root (pnpm sets cwd to tools/, so use absolute).
echo "--- running ./install-age.sh ---"
if ! "$REPO_ROOT/install-age.sh" "$TARGET" "$PROJECT_NAME" > "$SCRATCH/default.log" 2>&1; then
  echo "FAIL: install-age.sh errored:" >&2
  tail -20 "$SCRATCH/default.log" >&2
  [ "$OWNED_TEMP" = "1" ] && rm -rf "$TARGET"
  exit 1
fi
tail -8 "$SCRATCH/default.log"
echo ""

# Count helper. Returns single integer (grep -c output, 0 if no matches / file missing).
count_in() {
  local file="$1" pattern="$2"
  [ -f "$file" ] || { echo "0"; return; }
  grep -c "$pattern" "$file" 2>/dev/null || true  # `|| true` to avoid `|| echo "0"` double-output
}

PASS_COUNT=0
FAIL_COUNT=0
declare -a FAIL_NAMES

assert() {
  local name="$1" cond="$2" detail="${3:-}"
  if [ "$cond" = "1" ] || [ "$cond" = "true" ]; then
    echo "  [PASS] $name${detail:+ — $detail}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  [FAIL] $name${detail:+ — $detail}"
    FAIL_NAMES+=("$name")
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

echo "=== Closure-gate test results ==="

# === Core assertions (from 2026-07-27-0000 plan Phase 3) ===

# Gate 1: AGENTS.md was personalized (<project-name> count = 0)
AGENTS_COUNT=$(count_in "$TARGET/AGENTS.md" '<project-name>')
[ "$AGENTS_COUNT" = "0" ] && COND=1 || COND=0
assert "AGENTS.md has no <project-name> placeholders" "$COND" "found $AGENTS_COUNT occurrence(s)"

# Gate 2: AGENTS.md contains project name
if [ -f "$TARGET/AGENTS.md" ] && grep -q "$PROJECT_NAME" "$TARGET/AGENTS.md"; then COND=1; else COND=0; fi
assert "AGENTS.md contains project name" "$COND"

# Gate 3: shared methodology copied from root
[ -f "$TARGET/docs/guides/plan-authoring-and-execution.md" ] && COND=1 || COND=0
assert "shared methodology copied (plan guide)" "$COND"

# Gate 4: fill-in file copied from template/
[ -f "$TARGET/docs/context/project-context.md" ] && COND=1 || COND=0
assert "fill-in file copied (project-context.md)" "$COND"

# === Onboarding assertions (from 2026-07-27-0100 plan Phase 2, v2: fill-ins only) ===

[ -f "$TARGET/docs/roadmaps/onboarding-roadmap.md" ] && COND=1 || COND=0
assert "onboarding roadmap copied" "$COND"

# === v2 default-shape assertions (engine add-on OFF by default) ===

[ ! -e "$TARGET/missions/onboarding.json" ] && COND=1 || COND=0
assert "missions/ NOT installed by default (engine add-on off)" "$COND"

[ ! -d "$TARGET/docs/plans/onboarding" ] && COND=1 || COND=0
assert "docs/plans/onboarding/ NOT created by default" "$COND"

[ ! -e "$TARGET/.env" ] && COND=1 || COND=0
assert ".env NOT created by default" "$COND"

[ -f "$TARGET/.agents/skills/nop-grillme/SKILL.md" ] && COND=1 || COND=0
assert ".agents/skills/grillme copied" "$COND"

[ -f "$TARGET/.agents/skills/nop-git/SKILL.md" ] && COND=1 || COND=0
assert ".agents/skills/git copied" "$COND"

[ -f "$TARGET/docs/skills/common/plan-audit-prompt.md" ] && COND=1 || COND=0
assert "docs/skills/common shelf copied" "$COND"

[ ! -f "$TARGET/docs/skills/frontend/README.md" ] && COND=1 || COND=0
assert "frontend shelf NOT copied without --profile" "$COND"

[ -f "$TARGET/docs/guides/doc-organization.md" ] && COND=1 || COND=0
assert "doc-organization guide copied" "$COND"

[ -f "$TARGET/tools/plan-status.mjs" ] && COND=1 || COND=0
assert "plan-status tool copied" "$COND"

[ -f "$TARGET/tools/vendor/js-yaml.mjs" ] && COND=1 || COND=0
assert "vendored js-yaml copied (plan-status dependency)" "$COND"

[ -f "$TARGET/.githooks/pre-commit" ] && COND=1 || COND=0
assert "consumer pre-commit hook copied" "$COND"

[ -f "$TARGET/START-HERE-after-copy.md" ] && COND=1 || COND=0
assert "START-HERE-after-copy.md installed at target root" "$COND"

[ -f "$TARGET/docs/bugs/README.md" ] && COND=1 || COND=0
assert "docs/bugs/README.md copied (default skeleton dir)" "$COND"

[ ! -d "$TARGET/docs/discussions" ] && COND=1 || COND=0
assert "on-demand dir docs/discussions NOT pre-created" "$COND"

# onboarding-roadmap.md <project-name> replaced
ROADMAP_COUNT=$(count_in "$TARGET/docs/roadmaps/onboarding-roadmap.md" '<project-name>')
[ "$ROADMAP_COUNT" = "0" ] && COND=1 || COND=0
assert "onboarding-roadmap.md <project-name> replaced" "$COND" "found $ROADMAP_COUNT occurrence(s)"

# docs/index.md <project-name> replaced
INDEX_COUNT=$(count_in "$TARGET/docs/index.md" '<project-name>')
[ "$INDEX_COUNT" = "0" ] && COND=1 || COND=0
assert "docs/index.md <project-name> replaced" "$COND" "found $INDEX_COUNT occurrence(s)"

# docs/context/project-context.md <project-name> replaced
PC_COUNT=$(count_in "$TARGET/docs/context/project-context.md" '<project-name>')
[ "$PC_COUNT" = "0" ] && COND=1 || COND=0
assert "docs/context/project-context.md <project-name> replaced" "$COND" "found $PC_COUNT occurrence(s)"

# === v2 engine add-on pass (--with-mission-driver into a fresh target) ===

TARGET2="$SCRATCH/engine"
mkdir -p "$TARGET2"
echo ""
echo "--- running ./install-age.sh --with-mission-driver (second target) ---"
if ! "$REPO_ROOT/install-age.sh" "$TARGET2" "$PROJECT_NAME" --with-mission-driver > "$SCRATCH/engine.log" 2>&1; then
  echo "FAIL: install-age.sh --with-mission-driver errored:" >&2
  tail -20 "$SCRATCH/engine.log" >&2
  rm -rf "$TARGET2"
  [ "$OWNED_TEMP" = "1" ] && rm -rf "$TARGET"
  exit 1
fi

MDH_ONBOARDING_VALID=0
if [ -f "$TARGET2/missions/onboarding.json" ]; then
  if node -e "
    const cfg = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'));
    process.exit(cfg.name === 'onboarding'
      && cfg.roadmapPath === 'docs/roadmaps/onboarding-roadmap.md'
      && cfg.plansDir === 'docs/plans/onboarding' ? 0 : 1);
  " "$TARGET2/missions/onboarding.json" 2>/dev/null; then
    MDH_ONBOARDING_VALID=1
  fi
fi
assert "mdh: missions/onboarding.json exists and valid" "$MDH_ONBOARDING_VALID"

[ -d "$TARGET2/docs/plans/onboarding" ] && COND=1 || COND=0
assert "mdh: docs/plans/onboarding/ directory exists" "$COND"

[ -f "$TARGET2/.env.example" ] && COND=1 || COND=0
assert "mdh: .env.example copied" "$COND"

[ ! -e "$TARGET2/.agents/skills/nop-mission-driver" ] && COND=1 || COND=0
assert "mdh: operator skill retired (guidance lives in engine docs)" "$COND"
[ -f "$TARGET2/tools/mission-driver/CONTEXT.md" ] && COND=1 || COND=0
assert "mdh: engine vendored with its own operator docs" "$COND"

# Exercise the installed launcher and validator, not a sibling checkout.
if (cd "$TARGET2" && unset MISSION_DRIVER_HOME && bash tools/mission-driver.sh --help > "$SCRATCH/help.log" 2>&1) && grep -q Usage "$SCRATCH/help.log"; then COND=1; else COND=0; fi
if [ "$COND" = "0" ]; then cat "$SCRATCH/help.log" >&2; fi
assert "mdh: installed launcher --help runs standalone" "$COND"
if (cd "$TARGET2" && unset MISSION_DRIVER_HOME && bash tools/mission-driver.sh list > "$SCRATCH/list.log" 2>&1) && grep -q onboarding "$SCRATCH/list.log"; then COND=1; else COND=0; fi
if [ "$COND" = "0" ]; then cat "$SCRATCH/list.log" >&2; fi
assert "mdh: installed launcher lists consumer missions" "$COND"
if (cd "$TARGET2" && node tools/mission-driver/src/mission-check.mjs missions/onboarding.json . > "$SCRATCH/mission.log" 2>&1); then COND=1; else COND=0; fi
assert "mdh: vendored mission validator runs standalone" "$COND"

rm -rf "$TARGET2"

# === Profile pass (--profile frontend into a fresh target) ===

TARGET3="$SCRATCH/frontend"
mkdir -p "$TARGET3"
echo ""
echo "--- running ./install-age.sh --profile frontend (third target) ---"
if ! "$REPO_ROOT/install-age.sh" "$TARGET3" "$PROJECT_NAME" --profile frontend > "$SCRATCH/frontend.log" 2>&1; then
  echo "FAIL: install-age.sh --profile frontend errored:" >&2
  tail -20 "$SCRATCH/frontend.log" >&2
  rm -rf "$TARGET3"
  [ "$OWNED_TEMP" = "1" ] && rm -rf "$TARGET"
  exit 1
fi

[ -f "$TARGET3/docs/skills/frontend/component-design-review-prompt.md" ] && COND=1 || COND=0
assert "profile: frontend shelf copied with --profile frontend" "$COND"

[ ! -f "$TARGET3/docs/skills/java/README.md" ] && COND=1 || COND=0
assert "profile: java shelf NOT copied with --profile frontend" "$COND"

rm -rf "$TARGET3"

# === Report ===
echo ""
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "FAIL: $FAIL_COUNT assertion(s) failed:"
  for n in "${FAIL_NAMES[@]}"; do echo "  - $n"; done
  [ "$OWNED_TEMP" = "1" ] && rm -rf "$TARGET"
  exit 1
fi

echo "PASS: all $PASS_COUNT assertions passed"
[ "$OWNED_TEMP" = "1" ] && rm -rf "$TARGET" && echo "(cleaned up $TARGET)" || echo "(kept $TARGET for inspection)"
