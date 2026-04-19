import * as Y from "yjs";
import { ROOM_GC_TIMEOUT_MS, PERSISTENCE_INTERVAL_MS } from "@fascinator/shared/constants.ts";
import { storeDoc, loadDoc } from "./persistence/deno-kv-store.ts";

interface Room {
  doc: Y.Doc;
  clients: Set<WebSocket>;
  gcTimer: number | null;
  persistTimer: number | null;
  persisted: boolean;
}

const rooms = new Map<string, Room>();

export async function getOrCreateRoom(name: string): Promise<Room> {
  let room = rooms.get(name);
  if (room) {
    if (room.gcTimer !== null) {
      clearTimeout(room.gcTimer);
      room.gcTimer = null;
    }
    return room;
  }

  const doc = new Y.Doc({ gc: true });
  room = {
    doc,
    clients: new Set(),
    gcTimer: null,
    persistTimer: null,
    persisted: false,
  };

  const loaded = await loadDoc(name, doc);
  if (loaded) {
    room.persisted = true;
  }

  room.persistTimer = setInterval(async () => {
    if (room!.clients.size > 0) {
      await storeDoc(name, doc);
      room!.persisted = true;
    }
  }, PERSISTENCE_INTERVAL_MS);

  rooms.set(name, room);
  return room;
}

export async function addClient(name: string, ws: WebSocket): Promise<Room> {
  const room = await getOrCreateRoom(name);
  room.clients.add(ws);
  return room;
}

export function removeClient(name: string, ws: WebSocket): void {
  const room = rooms.get(name);
  if (!room) return;

  room.clients.delete(ws);

  if (room.clients.size === 0) {
    room.gcTimer = setTimeout(async () => {
      await storeDoc(name, room.doc);
      room.doc.destroy();
      if (room.persistTimer !== null) clearInterval(room.persistTimer);
      rooms.delete(name);
    }, ROOM_GC_TIMEOUT_MS);
  }
}

export function broadcastToRoom(name: string, data: Uint8Array, exclude?: WebSocket): void {
  const room = rooms.get(name);
  if (!room) return;

  for (const client of room.clients) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function getRoom(name: string): Room | undefined {
  return rooms.get(name);
}

export function listRooms(): Array<{ name: string; participants: number }> {
  return Array.from(rooms.entries()).map(([name, room]) => ({
    name,
    participants: room.clients.size,
  }));
}
