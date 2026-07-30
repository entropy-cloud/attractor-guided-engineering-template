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
#   ./tools/check-install-age.sh                          # auto-create /tmp target
#   ./tools/check-install-age.sh /path/to/target          # use existing target dir
#
# Exit codes: 0 = all assertions PASS; 1 = at least one FAIL; 2 = bad usage.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd | tr -d '\r')"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd | tr -d '\r')"

TARGET_RAW="${1:-}"
OWNED_TEMP=0
if [ -z "$TARGET_RAW" ]; then
  TARGET_RAW="$(mktemp -d /tmp/age-test-XXXX)"
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
if ! "$REPO_ROOT/install-age.sh" "$TARGET" "$PROJECT_NAME" > /tmp/age-test-output.log 2>&1; then
  echo "FAIL: install-age.sh errored:" >&2
  tail -20 /tmp/age-test-output.log >&2
  [ "$OWNED_TEMP" = "1" ] && rm -rf "$TARGET"
  exit 1
fi
tail -8 /tmp/age-test-output.log
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
[ -f "$TARGET/docs/plans/00-plan-authoring-and-execution-guide.md" ] && COND=1 || COND=0
assert "shared methodology copied (plan guide)" "$COND"

# Gate 4: fill-in file copied from template/
[ -f "$TARGET/docs/context/project-context.md" ] && COND=1 || COND=0
assert "fill-in file copied (project-context.md)" "$COND"

# === Onboarding assertions (from 2026-07-27-0100 plan Phase 2) ===

[ -f "$TARGET/docs/backlog/onboarding-roadmap.md" ] && COND=1 || COND=0
assert "onboarding roadmap copied" "$COND"

# missions/onboarding.json exists + valid JSON + key fields
ONBOARDING_VALID=0
if [ -f "$TARGET/missions/onboarding.json" ]; then
  # Validate JSON via node (always available per install-age.sh prerequisites).
  if node -e "
    const cfg = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'));
    process.exit(cfg.name === 'onboarding'
      && cfg.roadmapPath === 'docs/backlog/onboarding-roadmap.md'
      && cfg.plansDir === 'docs/plans/onboarding' ? 0 : 1);
  " "$TARGET/missions/onboarding.json" 2>/dev/null; then
    ONBOARDING_VALID=1
  fi
fi
assert "missions/onboarding.json exists and valid" "$ONBOARDING_VALID"

[ -d "$TARGET/docs/plans/onboarding" ] && COND=1 || COND=0
assert "docs/plans/onboarding/ directory exists" "$COND"

# onboarding-roadmap.md <project-name> replaced
ROADMAP_COUNT=$(count_in "$TARGET/docs/backlog/onboarding-roadmap.md" '<project-name>')
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
