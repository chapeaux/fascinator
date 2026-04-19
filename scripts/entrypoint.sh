#!/bin/bash
set -e

PROJECT_DIR="${PROJECTS_ROOT:-/projects}/fascinator"
DATA_DIR="${FASCINATOR_DATA_DIR:-/data}"

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

echo "Starting host code-server on port ${FASCINATOR_HOST_PORT:-3100}..."
export FASCINATOR_SLOT_ID=0
export FASCINATOR_SERVER_URL="ws://localhost:${FASCINATOR_SERVER_PORT:-3078}"
export FASCINATOR_USER_NAME="${FASCINATOR_HOST_NAME:-Developer}"

code-server \
  --port "${FASCINATOR_HOST_PORT:-3100}" \
  --auth none \
  --user-data-dir "$DATA_DIR/code-server/slot-0" \
  --disable-telemetry \
  "${PROJECTS_ROOT:-/projects}" &
HOST_PID=$!

cleanup() {
  echo "Shutting down Fascinator..."
  kill "$HOST_PID" "$MANAGER_PID" "$SERVER_PID" 2>/dev/null || true
  wait
}
trap cleanup EXIT INT TERM

echo "Fascinator is running."
echo "  Collaboration server: localhost:${FASCINATOR_SERVER_PORT:-3078}"
echo "  IDE Manager:          localhost:${FASCINATOR_MANAGER_PORT:-3079}"
echo "  Host IDE:             localhost:${FASCINATOR_HOST_PORT:-3100}"

wait
