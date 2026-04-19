import { listRooms } from "./room-manager.ts";
import { getAuthMode } from "./auth/middleware.ts";

export function handleHealth(path: string): Response {
  if (path === "/healthz") {
    return new Response("ok");
  }

  if (path === "/readyz") {
    return Response.json({ status: "ok", authMode: getAuthMode() });
  }

  if (path === "/api/rooms") {
    return Response.json(listRooms());
  }

  return new Response("Not Found", { status: 404 });
}
