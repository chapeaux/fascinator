import { config } from "./config.ts";
import { handleWebSocket } from "./ws-handler.ts";
import { handleHealth } from "./health.ts";
import { initKv } from "./persistence/deno-kv-store.ts";
import { initAuth, authenticate } from "./auth/middleware.ts";

await initKv(config.dataDir);
console.log(`Deno KV initialized at ${config.dataDir}/kv/`);

const authMode = await initAuth();

Deno.serve({ port: config.port, hostname: "0.0.0.0" }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname.startsWith("/ws/")) {
    const roomName = decodeURIComponent(url.pathname.slice(4));
    if (!roomName) {
      return new Response("Room name required", { status: 400 });
    }

    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    const authResult = await authenticate(req);
    if (!authResult.authenticated) {
      return new Response(authResult.error || "Unauthorized", { status: 401 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    await handleWebSocket(socket, roomName);
    return response;
  }

  return handleHealth(url.pathname);
});

console.log(`Fascinator Server listening on :${config.port} (auth: ${authMode})`);
