#!/bin/bash
# install-age.sh — Thin shim → delegates to tools/install-age.mjs (Node ESM).
#
# The real install logic lives in tools/install-age.mjs (cross-platform Node,
# zero npm deps). This shim preserves the familiar ./install-age.sh entry point
# for Unix/Git Bash users. Windows users without Git Bash can run install-age.cmd
# or `node tools/install-age.mjs` directly.
#
# Usage:
#   ./install-age.sh                                    # interactive
#   ./install-age.sh /path/to/target "My Project Name"  # non-interactive
#
# Prerequisites: Node.js >= 18 in PATH.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd | tr -d '\r')"
exec node "$SCRIPT_DIR/tools/install-age.mjs" "$@"
