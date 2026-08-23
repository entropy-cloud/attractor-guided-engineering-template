#!/usr/bin/env bash
#
# verify-age.sh — L1+L2 merge-blocking aggregate gate (dsh-plugin M2-WI8,
# plan docs/plans/dsh-plugin/2026-08-23-1447-3 Phase 1 Decision 1, Option A).
#
# One command, two chains, both must be green to pass the gate:
#   L1 — engine suite: `pnpm --prefix tools/mission-driver test`
#        (zero npm dependencies; includes prompt-check.mjs)
#   L2 — plugin suite: `npm --prefix plugin/dsh test`
#        (L2 backend-parity matrix + WI6/WI7 unit chain: manifest check,
#        node --test, tsc --noEmit, bundle freshness, smoke import)
#
# The plugin chain needs its devDependencies (typescript / yaml / @types);
# they are installed on demand so a fresh clone can run this script directly.
# The ENGINE chain never depends on plugin node_modules (boundary rule), and
# the matrix imports the live engine via cross-directory relative imports —
# pure Node, zero network, zero model credentials (R3 §5 CI posture).
#
# This is a real-project script (mission-driver/dsh-plugin development); it is
# NOT part of the install-age.sh template manifest.

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

echo "== L1+L2 gate: GREEN =="
