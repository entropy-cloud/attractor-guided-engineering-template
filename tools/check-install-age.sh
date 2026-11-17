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

[ -f "$TARGET/.agents/skills/grillme/SKILL.md" ] && COND=1 || COND=0
assert ".agents/skills/grillme copied" "$COND"

[ -f "$TARGET/.agents/skills/git/SKILL.md" ] && COND=1 || COND=0
assert ".agents/skills/git copied" "$COND"

[ -f "$TARGET/docs/skills/common/plan-audit-prompt.md" ] && COND=1 || COND=0
assert "docs/skills/common shelf copied" "$COND"

[ ! -f "$TARGET/docs/skills/frontend/README.md" ] && COND=1 || COND=0
assert "frontend shelf NOT copied without --profile" "$COND"

[ -f "$TARGET/docs/guides/doc-organization.md" ] && COND=1 || COND=0
assert "doc-organization guide copied" "$COND"

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

TARGET2="$(mktemp -d /tmp/age-test-mdh-XXXX)"
echo ""
echo "--- running ./install-age.sh --with-mission-driver (second target) ---"
if ! "$REPO_ROOT/install-age.sh" "$TARGET2" "$PROJECT_NAME" --with-mission-driver > /tmp/age-test-output-mdh.log 2>&1; then
  echo "FAIL: install-age.sh --with-mission-driver errored:" >&2
  tail -20 /tmp/age-test-output-mdh.log >&2
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

[ -f "$TARGET2/.agents/skills/mission-driver/SKILL.md" ] && COND=1 || COND=0
assert "mdh: mission-driver skill copied" "$COND"

[ -f "$TARGET2/docs/roadmaps/demo-roadmap.md" ] && COND=1 || COND=0
assert "mdh: demo-roadmap delivered (demo mission roadmapPath resolvable)" "$COND"

rm -rf "$TARGET2"

# === Profile pass (--profile frontend into a fresh target) ===

TARGET3="$(mktemp -d /tmp/age-test-prof-XXXX)"
echo ""
echo "--- running ./install-age.sh --profile frontend (third target) ---"
if ! "$REPO_ROOT/install-age.sh" "$TARGET3" "$PROJECT_NAME" --profile frontend > /tmp/age-test-output-prof.log 2>&1; then
  echo "FAIL: install-age.sh --profile frontend errored:" >&2
  tail -20 /tmp/age-test-output-prof.log >&2
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
