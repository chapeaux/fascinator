#!/bin/bash
#
# Fascinator bootstrap script
#
# Installs Deno, code-server, builds the VS Code extension, and starts
# all Fascinator services. Safe to run multiple times — skips anything
# already installed.
#
# When called with --background, forks the main work into the background
# and exits immediately (for use as a postStart hook).
#
set -e

PROJECT_DIR="${PROJECTS_ROOT:-/projects}/fascinator"
DATA_DIR="${FASCINATOR_DATA_DIR:-/projects/.fascinator-data}"
DENO_INSTALL="${DENO_INSTALL:-$HOME/.deno}"
DENO_BIN="$DENO_INSTALL/bin/deno"
CODE_SERVER_BIN="$HOME/.local/bin/code-server"
EXTENSION_DIR="$PROJECT_DIR/packages/extension"
LOG_FILE="/tmp/fascinator-setup.log"

export PATH="$DENO_INSTALL/bin:$HOME/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

log() { echo "[fascinator] $*" | tee -a "$LOG_FILE"; }

install_deno() {
  if [ -x "$DENO_BIN" ]; then
    log "Deno already installed"
    return
  fi

  log "Installing Deno..."
  curl -fsSL https://deno.land/install.sh | sh >> "$LOG_FILE" 2>&1
  log "Deno installed"
}

install_code_server() {
  if [ -x "$CODE_SERVER_BIN" ]; then
    log "code-server already installed"
    return
  fi

  log "Installing code-server..."
  curl -fsSL https://code-server.dev/install.sh | sh -s -- --method standalone --prefix="$HOME/.local" >> "$LOG_FILE" 2>&1
  log "code-server installed"
}

build_extension() {
  if [ -f "$EXTENSION_DIR/dist/extension.js" ]; then
    log "Extension already built"
    return
  fi

  log "Installing extension dependencies..."
  cd "$EXTENSION_DIR"
  npm install --no-audit --no-fund >> "$LOG_FILE" 2>&1

  log "Building extension..."
  npx webpack --mode production >> "$LOG_FILE" 2>&1

  log "Extension built"
  cd "$PROJECT_DIR"
}

prepare_data() {
  mkdir -p "$DATA_DIR/code-server" "$DATA_DIR/kv"
  log "Data directory ready: $DATA_DIR"
}

cache_deno_deps() {
  log "Caching Deno dependencies..."
  "$DENO_BIN" cache "$PROJECT_DIR/packages/server/src/main.ts" >> "$LOG_FILE" 2>&1 || true
  "$DENO_BIN" cache "$PROJECT_DIR/packages/manager/src/main.ts" >> "$LOG_FILE" 2>&1 || true
  log "Deno dependencies cached"
}

run_setup() {
  log "Setting up Fascinator..."

  install_deno
  install_code_server
  build_extension
  prepare_data
  cache_deno_deps

  log "Setup complete. Starting Fascinator services..."

  "$PROJECT_DIR/scripts/entrypoint.sh" >> "$LOG_FILE" 2>&1
}

# When called with --background, fork and exit immediately
# so the postStart hook returns without blocking
if [ "${1:-}" = "--background" ]; then
  run_setup &
  disown
  exit 0
fi

run_setup
