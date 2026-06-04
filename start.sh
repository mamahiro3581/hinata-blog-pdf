#!/usr/bin/env bash
set -euo pipefail

BUNDLED_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
BUNDLED_MODULES="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"

if [[ -x "$BUNDLED_NODE" ]]; then
  export CODEX_NODE_MODULES="$BUNDLED_MODULES"
  exec "$BUNDLED_NODE" server.cjs
fi

exec node server.cjs
