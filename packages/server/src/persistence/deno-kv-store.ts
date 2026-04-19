import * as Y from "yjs";

let kv: Deno.Kv | null = null;

export async function initKv(dataDir: string): Promise<void> {
  kv = await Deno.openKv(`${dataDir}/kv/fascinator.db`);
}

export async function storeDoc(roomName: string, doc: Y.Doc): Promise<void> {
  if (!kv) return;
  const state = Y.encodeStateAsUpdate(doc);
  await kv.set(["yjs", roomName], state);
}

export async function loadDoc(roomName: string, doc: Y.Doc): Promise<boolean> {
  if (!kv) return false;
  const entry = await kv.get<Uint8Array>(["yjs", roomName]);
  if (entry.value) {
    Y.applyUpdate(doc, entry.value);
    return true;
  }
  return false;
}

export async function deleteDoc(roomName: string): Promise<void> {
  if (!kv) return;
  await kv.delete(["yjs", roomName]);
}

export async function closeKv(): Promise<void> {
  kv?.close();
  kv = null;
}
