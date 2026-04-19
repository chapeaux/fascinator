#!/bin/bash
#
# Fascinator bootstrap script
#
# Installs Deno, code-server, builds the VS Code extension, and starts
# all Fascinator services. Safe to run multiple times — skips anything
# already installed.
#
set -e

PROJECT_DIR="${PROJECTS_ROOT:-/projects}/fascinator"
DATA_DIR="${FASCINATOR_DATA_DIR:-/data}"
DENO_INSTALL="${DENO_INSTALL:-$HOME/.deno}"
DENO_BIN="$DENO_INSTALL/bin/deno"
CODE_SERVER_BIN="$HOME/.local/bin/code-server"
EXTENSION_DIR="$PROJECT_DIR/packages/extension"

log() { echo "[fascinator] $*"; }

# ── Deno ──────────────────────────────────────────────────────────────

install_deno() {
  if command -v deno &>/dev/null; then
    log "Deno already installed: $(deno --version | head -1)"
    return
  fi

  if [ -x "$DENO_BIN" ]; then
    export PATH="$DENO_INSTALL/bin:$PATH"
    log "Deno found at $DENO_BIN: $(deno --version | head -1)"
    return
  fi

  log "Installing Deno..."
  curl -fsSL https://deno.land/install.sh | sh
  export PATH="$DENO_INSTALL/bin:$PATH"
  log "Deno installed: $(deno --version | head -1)"
}

# ── code-server ───────────────────────────────────────────────────────

install_code_server() {
  if command -v code-server &>/dev/null; then
    log "code-server already installed: $(code-server --version | head -1)"
    return
  fi

  if [ -x "$CODE_SERVER_BIN" ]; then
    export PATH="$HOME/.local/bin:$PATH"
    log "code-server found at $CODE_SERVER_BIN"
    return
  fi

  log "Installing code-server..."
  curl -fsSL https://code-server.dev/install.sh | sh -s -- --method standalone --prefix="$HOME/.local"
  export PATH="$HOME/.local/bin:$PATH"
  log "code-server installed: $(code-server --version | head -1)"
}

# ── Extension ─────────────────────────────────────────────────────────

build_extension() {
  if [ -f "$EXTENSION_DIR/dist/extension.js" ]; then
    log "Extension already built"
    return
  fi

  log "Installing extension dependencies..."
  cd "$EXTENSION_DIR"
  npm install --no-audit --no-fund

  log "Building extension..."
  npx webpack --mode production

  log "Extension built"
  cd "$PROJECT_DIR"
}

# ── Data directories ──────────────────────────────────────────────────

prepare_data() {
  mkdir -p "$DATA_DIR/code-server" "$DATA_DIR/kv"
  log "Data directory ready: $DATA_DIR"
}

# ── Cache Deno dependencies ──────────────────────────────────────────

cache_deno_deps() {
  log "Caching Deno dependencies..."
  deno cache "$PROJECT_DIR/packages/server/src/main.ts" 2>/dev/null || true
  deno cache "$PROJECT_DIR/packages/manager/src/main.ts" 2>/dev/null || true
  log "Deno dependencies cached"
}

# ── Main ──────────────────────────────────────────────────────────────

main() {
  log "Setting up Fascinator..."
  log ""

  install_deno
  install_code_server
  build_extension
  prepare_data
  cache_deno_deps

  log ""
  log "Setup complete. Starting Fascinator services..."
  log ""

  exec "$PROJECT_DIR/scripts/entrypoint.sh"
}

main "$@"
