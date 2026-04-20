#!/bin/bash
set -e

PROJECT_DIR="${PROJECTS_ROOT:-/projects}/fascinator"
DATA_DIR="${FASCINATOR_DATA_DIR:-/projects/.fascinator-data}"

mkdir -p "$DATA_DIR/code-server" "$DATA_DIR/kv"

echo "Starting Fascinator Collaboration Server..."
deno run \
  --allow-net --allow-read --allow-write --allow-env --unstable-kv \
  "$PROJECT_DIR/packages/server/src/main.ts" &
SERVER_PID=$!

echo "Starting Fascinator IDE Manager..."
deno run \
  --allow-net --allow-run --allow-read --allow-write --allow-env \
  "$PROJECT_DIR/packages/manager/src/main.ts" &
MANAGER_PID=$!

cleanup() {
  echo "Shutting down Fascinator..."
  kill "$MANAGER_PID" "$SERVER_PID" 2>/dev/null || true
  wait
}
trap cleanup EXIT INT TERM

echo "Fascinator is running."
echo "  Collaboration server: localhost:${FASCINATOR_SERVER_PORT:-3078}"
echo "  IDE Manager:          localhost:${FASCINATOR_MANAGER_PORT:-3079}"
echo "  Host IDE:             che-code (default Dev Spaces IDE)"
echo ""
echo "  Guest code-server instances are spawned on-demand by the manager."

wait
