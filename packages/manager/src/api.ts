import type { CreateSlotRequest, CreateSlotResponse } from "@fascinator/shared/protocol.ts";
import type { ManagedSlot } from "./slot.ts";
import { createSlot, checkSlotReady, stopSlot } from "./slot.ts";
import { PortAllocator } from "./port-allocator.ts";

const portAllocator = new PortAllocator();
const slots = new Map<number, ManagedSlot>();

const workspaceDir = Deno.env.get("PROJECTS_ROOT") || "/projects";
const dataDir = Deno.env.get("FASCINATOR_DATA_DIR") || "/data";
const extensionPath = Deno.env.get("FASCINATOR_EXTENSION_PATH") || null;
const hostName = Deno.env.get("FASCINATOR_HOST_NAME") || "Developer";
const workspaceName = Deno.env.get("DEVWORKSPACE_NAME") || "Workspace";

export function getHostName(): string {
  return hostName;
}

export function getWorkspaceName(): string {
  return workspaceName;
}

function getBaseUrl(): string {
  return Deno.env.get("FASCINATOR_BASE_URL") || "";
}

function slotUrl(port: number): string {
  const base = getBaseUrl();
  if (base) return `${base}/${port}/`;
  return `https://localhost:${port}/`;
}

export async function handleApi(req: Request, path: string): Promise<Response> {
  if (path === "/api/slots" && req.method === "POST") {
    return handleCreateSlot(req);
  }
  if (path === "/api/slots" && req.method === "GET") {
    return handleListSlots();
  }

  const slotMatch = path.match(/^\/api\/slots\/(\d+)$/);
  if (slotMatch) {
    const slotId = parseInt(slotMatch[1]);
    if (req.method === "GET") return handleGetSlot(slotId);
    if (req.method === "DELETE") return handleDeleteSlot(slotId);
  }

  const readyMatch = path.match(/^\/api\/slots\/(\d+)\/ready$/);
  if (readyMatch && req.method === "GET") {
    const slotId = parseInt(readyMatch[1]);
    return handleCheckReady(slotId);
  }

  return new Response("Not Found", { status: 404 });
}

async function handleCreateSlot(req: Request): Promise<Response> {
  let body: CreateSlotRequest;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.displayName || typeof body.displayName !== "string") {
    return new Response("displayName is required", { status: 400 });
  }

  let port: number;
  try {
    port = portAllocator.allocate();
  } catch {
    return new Response("No available slots", { status: 503 });
  }

  const slot = createSlot(port, body.displayName.trim(), workspaceDir, dataDir, extensionPath);
  slots.set(slot.slotId, slot);

  if (slot.process) {
    monitorSlot(slot);
  }

  const resp: CreateSlotResponse = {
    slotId: slot.slotId,
    port: slot.port,
    url: slotUrl(port),
  };

  return Response.json(resp, { status: 201 });
}

function handleListSlots(): Response {
  const list = Array.from(slots.values()).map(({ process: _, password: __, ...rest }) => rest);
  return Response.json(list);
}

function handleGetSlot(slotId: number): Response {
  const slot = slots.get(slotId);
  if (!slot) return new Response("Not Found", { status: 404 });
  const { process: _, password: __, ...info } = slot;
  return Response.json(info);
}

function handleDeleteSlot(slotId: number): Response {
  const slot = slots.get(slotId);
  if (!slot) return new Response("Not Found", { status: 404 });
  stopSlot(slot);
  portAllocator.release(slot.port);
  slots.delete(slotId);
  return new Response(null, { status: 204 });
}

async function handleCheckReady(slotId: number): Promise<Response> {
  const slot = slots.get(slotId);
  if (!slot) return new Response("Not Found", { status: 404 });

  if (slot.status === "stopped") {
    return Response.json({ ready: false, status: "stopped" }, { status: 503 });
  }

  const ready = await checkSlotReady(slot.port);
  if (ready && slot.status === "starting") {
    slot.status = "running";
  }

  if (ready) {
    return Response.json({ ready: true, url: slotUrl(slot.port) });
  }
  return Response.json({ ready: false, status: slot.status }, { status: 503 });
}

async function monitorSlot(slot: ManagedSlot): Promise<void> {
  if (!slot.process) return;
  try {
    const status = await slot.process.status;
    if (!status.success && slot.status !== "stopped") {
      console.error(`code-server slot ${slot.slotId} exited with code ${status.code}`);
      slot.status = "stopped";
    }
  } catch {
    // process was killed
  }
}
