# Fascinator

Multi-user, multi-cursor collaborative file editing for Red Hat Dev Spaces / Eclipse Che.

## Architecture

Single workspace Pod with multiple code-server instances sharing `/projects/`. A Deno collaboration server on localhost:3078 handles Yjs CRDT sync and cursor awareness. An IDE manager on localhost:3079 serves a landing page and spawns code-server instances dynamically.

## Packages

- `packages/shared` — Shared types and constants (Deno)
- `packages/manager` — IDE slot manager + guest landing page (Deno, port 3079)
- `packages/server` — Yjs collaboration server (Deno, port 3078)
- `packages/extension` — VS Code extension for each code-server instance (Node.js/TypeScript)

## Commands

```bash
# Type-check
cd packages/server && deno check src/main.ts
cd packages/manager && deno check src/main.ts

# Run server
cd packages/server && deno task start

# Run manager
cd packages/manager && deno task start

# Full startup
./scripts/entrypoint.sh
```

## Tech Stack

- **Yjs** for CRDT document sync
- **y-protocols** for sync and awareness wire protocols
- **Deno** for server and manager
- **code-server** (coder/code-server) for per-user IDE instances
- **VS Code Extension API** for editor integration
