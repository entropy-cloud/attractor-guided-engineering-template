#!/usr/bin/env bash
#
# verify-age.sh — L1+L2+L2.5 merge-blocking aggregate gate (dsh-plugin M2-WI8
# + age-autonomy M2-WI23 law-gates wiring, plan
# docs/plans/age-autonomy/2026-08-25-0950-3 Phase 2).
#
# One command, three chains, all must be green to pass the gate:
#   L1   — engine suite: `pnpm --prefix tools/mission-driver test`
#          (zero npm dependencies; includes prompt-check.mjs)
#   L2   — plugin suite: `npm --prefix plugin/dsh test`
#          (L2 backend-parity matrix + WI6/WI7 unit chain: manifest check,
#          node --test, tsc --noEmit, bundle freshness, smoke import)
#   L2.5 — law gates (age-autonomy M2-WI23, structural subset, no actor):
#          ① `gate-check.mjs --policy missions/autonomy.policy.yml`
#          ② gate-check.mjs on the FULL docs/plans/age-autonomy/ corpus
#          ③ `node --test plugin/dsh/test/law-truth-table.test.mjs`
#          (explicit standalone call — the same file also runs inside L2's
#          plugin suite; the standalone face is the WI24 gate alignment)
#
# The plugin chain needs its devDependencies (typescript / yaml / @types);
# they are installed on demand so a fresh clone can run this script directly.
# The ENGINE chain never depends on plugin node_modules (boundary rule), and
# the matrix imports the live engine via cross-directory relative imports —
# pure Node, zero network, zero model credentials (R3 §5 CI posture).
#
# L2.5 corpus face: frontmatter-format plans must pass gate-check (exit 0).
# Legacy-format plans (no leading `---` block) are skipped with a note — the
# legacy-plan-freeze face fails closed on the no-actor structural face by
# design (M2-WI22 corpus-not-injected posture); CI is itself a legal channel
# for the frozen legacy corpus. Policy face is fail-open with a note when
# missions/autonomy.policy.yml is absent (template-consumer posture — though
# this repo always carries it, and this script is NOT part of the
# install-age.sh template manifest).

set -euo pipefail
cd "$(dirname "$0")"

echo "== L1: engine suite (zero npm deps) =="
pnpm --prefix tools/mission-driver test

echo "== L2: plugin suite (backend-parity matrix + unit chain) =="
if [ ! -d plugin/dsh/node_modules ]; then
  echo "(installing plugin devDependencies)"
  npm ci --prefix plugin/dsh --no-audit --no-fund
fi
npm --prefix plugin/dsh test

echo "== L2.5: law gates (policy + plan corpus + truth table) =="
if [ -f missions/autonomy.policy.yml ]; then
  node tools/mission-driver/src/gate-check.mjs --policy missions/autonomy.policy.yml | grep -q '"valid": true' || {
    echo "L2.5 DENY: policy schema validation failed"; exit 1;
  }
  echo "policy face: ok (missions/autonomy.policy.yml)"
else
  echo "(note) missions/autonomy.policy.yml not found — policy face skipped (fail-open, template-consumer posture)"
fi
corpus_fail=0
for f in docs/plans/age-autonomy/*.md; do
  [ -e "$f" ] || continue
  if [ "$(head -n 1 "$f")" != "---" ]; then
    echo "(note) $f: legacy-format plan — outside structural domain (freeze face fails closed on the no-actor face by design, M2-WI22); skipped"
    continue
  fi
  if ! node tools/mission-driver/src/gate-check.mjs "$f" >/dev/null 2>&1; then
    echo "L2.5 DENY: $f"
    node tools/mission-driver/src/gate-check.mjs "$f" 2>&1 | grep '"reason"' | head -1 || true
    corpus_fail=1
  else
    echo "corpus ok: $f"
  fi
done
[ "$corpus_fail" -eq 0 ] || exit 1
node --test plugin/dsh/test/law-truth-table.test.mjs

echo "== L1+L2+L2.5 gate: GREEN =="
