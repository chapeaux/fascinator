# Fascinator

Multi-user, multi-cursor collaborative file editing for [Red Hat OpenShift Dev Spaces](https://developers.redhat.com/products/openshift-dev-spaces) and [Eclipse Che](https://eclipse.dev/che/).

Fascinator turns a single Dev Spaces workspace into a shared editing environment. The host creates a workspace and shares a single link. Guests open the link, enter their name, and get their own VS Code instance — all backed by the same filesystem. Edits and cursor positions sync in real-time across all users via [Yjs](https://yjs.dev/) CRDTs.

## How it works

```
┌────────────────── Single Workspace Pod ──────────────────┐
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ code-server  │  │ code-server  │  │ code-server  │  │
│  │ :3100 (host) │  │ :3101 (guest)│  │ :3102 (guest)│  │
│  │ + Extension  │  │ + Extension  │  │ + Extension  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │ localhost        │ localhost        │          │
│         └─────────┐       │       ┌──────────┘          │
│                   ▼       ▼       ▼                     │
│              ┌──────────────────────┐                   │
│              │  Collaboration       │                   │
│              │  Server :3078        │                   │
│              │  Yjs sync + cursors  │                   │
│              └──────────────────────┘                   │
│              ┌──────────────────────┐                   │
│              │  IDE Manager :3079   │                   │
│              │  Landing page        │ ◄── shared link   │
│              │  Spawns code-server  │                   │
│              └──────────────────────┘                   │
│                                                          │
│  Shared filesystem: /projects/                           │
└──────────────────────────────────────────────────────────┘
```

Everything runs inside a single Kubernetes Pod. The **IDE Manager** serves a landing page as the single shared link and spawns a new code-server instance for each guest on demand. The **Collaboration Server** relays document edits and cursor awareness between all connected VS Code extensions over WebSocket on localhost. All users share the same `/projects/` filesystem.

## Features

- **Real-time collaborative editing** — Character-level sync powered by Yjs CRDTs. No merge conflicts, ever.
- **Multi-cursor awareness** — See each collaborator's cursor and selection with distinct colors and name labels.
- **Presence panel** — Sidebar showing who is online and which file they are editing.
- **Single shared link** — Host shares one URL. Guests click "Join", enter their name, and get their own IDE.
- **Shared filesystem** — All users work on the same files on disk. Saves are coordinated through Yjs.
- **Persistence** — Document state survives server restarts via Deno KV.
- **Tiered authentication** — Supports shared secret, standard OIDC, and Solid-OIDC/WebID.
- **Solid Pod integration** — Optionally stores session metadata as RDF in a Solid Pod.

## Getting started

### Prerequisites

- [Deno](https://deno.com/) (v2+)
- [Node.js](https://nodejs.org/) (v18+) and npm
- [code-server](https://github.com/coder/code-server) (v4+)

### Run locally

1. **Install extension dependencies:**

   ```bash
   cd packages/extension
   npm install
   ```

2. **Build the extension:**

   ```bash
   npm run compile
   ```

3. **Start all services:**

   ```bash
   ./scripts/entrypoint.sh
   ```

   This launches:
   - Collaboration server on `localhost:3078`
   - IDE manager on `localhost:3079`
   - Host code-server on `localhost:3100`

4. **Open the host IDE** at `http://localhost:3100`.

5. **Invite a guest** — open `http://localhost:3079` in another browser window. Enter a name and click "Join".

### Deploy on Dev Spaces

Use the devfile at `deploy/devfile.yaml` to create a workspace. It configures the container with the correct ports, volumes, and startup command.

The IDE manager endpoint (port 3079) is exposed as a public HTTPS route. Share that URL with collaborators.

```bash
# Create a workspace from the devfile
oc apply -f deploy/devfile.yaml

# Or start from the Dev Spaces dashboard using the devfile URL
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FASCINATOR_SERVER_PORT` | `3078` | Collaboration server port |
| `FASCINATOR_MANAGER_PORT` | `3079` | IDE manager port |
| `FASCINATOR_HOST_PORT` | `3100` | Host code-server port |
| `FASCINATOR_DATA_DIR` | `/data` | Persistence directory (Deno KV, code-server data) |
| `FASCINATOR_HOST_NAME` | `Developer` | Host display name shown on the landing page |
| `FASCINATOR_AUTH_MODE` | `none` | Auth mode: `none`, `secret`, `oidc`, or `solid-oidc` |
| `FASCINATOR_AUTH_SECRET` | — | Shared secret for `secret` auth mode |
| `FASCINATOR_OIDC_ISSUER` | — | OIDC issuer URL for `oidc` auth mode |
| `FASCINATOR_SOLID_POD_URL` | — | Solid Pod URL for session metadata storage |
| `FASCINATOR_EXTENSION_PATH` | — | Path to the `.vsix` file to pre-install in guest IDEs |

## Project structure

```
fascinator/
├── packages/
│   ├── shared/          Shared types and constants (Deno)
│   ├── manager/         IDE slot manager + landing page (Deno)
│   ├── server/          Yjs collaboration server (Deno)
│   └── extension/       VS Code extension (Node.js)
├── deploy/
│   └── devfile.yaml     Dev Spaces workspace configuration
├── scripts/
│   └── entrypoint.sh    Startup script for all services
├── CLAUDE.md
└── README.md
```

### Packages

**`packages/shared`** — Type definitions (`SlotInfo`, `AwarenessState`, `CursorPosition`) and constants (ports, message types, timing values) consumed by all other packages.

**`packages/manager`** — Deno HTTP server on port 3079. Serves the guest landing page and a REST API for creating, listing, and removing code-server slots. Spawns code-server processes dynamically with `Deno.Command`.

**`packages/server`** — Deno WebSocket server on port 3078. Implements the Yjs sync and awareness protocols (`y-protocols/sync`, `y-protocols/awareness`). Manages per-file rooms with a `Y.Doc` instance each. Persists document state to Deno KV and optionally writes session metadata to a Solid Pod as RDF.

**`packages/extension`** — VS Code extension bundled with webpack. The core is `yjs-binding.ts`, which bidirectionally syncs a `Y.Text` CRDT with a VS Code `TextDocument` using origin tagging and a boolean guard to prevent echo loops. Renders remote cursors as VS Code decorations with colored borders, name labels (via `::after` pseudo-elements), and selection highlights.

## Authentication

Fascinator supports four authentication modes, selected via `FASCINATOR_AUTH_MODE`:

| Mode | Use case |
|------|----------|
| `none` | Local development. All connections are trusted. |
| `secret` | Simple deployments. All users share a bearer token set in `FASCINATOR_AUTH_SECRET`. |
| `oidc` | Enterprise / Dev Spaces. Validates JWTs against the OIDC issuer's JWKS endpoint. |
| `solid-oidc` | Open web / Solid ecosystem. Validates DPoP-bound ID tokens and dereferences the user's WebID for identity and issuer trust verification. |

Auth is checked during the WebSocket upgrade handshake on the collaboration server.

## Tech stack

- [Yjs](https://yjs.dev/) — CRDT for conflict-free document synchronization
- [y-protocols](https://github.com/yjs/y-protocols) — Sync and awareness wire protocols
- [Deno](https://deno.com/) — Runtime for the collaboration server and IDE manager
- [code-server](https://github.com/coder/code-server) — Per-user VS Code instances
- [VS Code Extension API](https://code.visualstudio.com/api) — Editor integration (decorations, workspace edits, TreeView)
- [jose](https://github.com/panva/jose) — JWT/JWK validation for OIDC and Solid-OIDC

## Development

```bash
# Type-check all packages
cd packages/extension && npx tsc --noEmit
cd packages/server && deno check src/main.ts
cd packages/manager && deno check src/main.ts

# Watch mode (extension)
cd packages/extension && npm run watch

# Watch mode (server)
cd packages/server && deno task dev

# Watch mode (manager)
cd packages/manager && deno task dev

# Build the extension .vsix
cd packages/extension && npm run package
```

## Part of Chapeaux

Fascinator is part of the [Chapeaux](https://github.com/chapeaux) ecosystem of semantic web and developer tools, alongside beret (code intelligence), geoff (static site generator), millie (AI skill sharing), and porter (cross-platform automation).

## License

Apache-2.0
