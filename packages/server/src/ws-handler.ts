import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { MSG_SYNC, MSG_AWARENESS } from "@fascinator/shared/constants.ts";
import { addClient, removeClient, broadcastToRoom } from "./room-manager.ts";

export async function handleWebSocket(ws: WebSocket, roomName: string): Promise<void> {
  const room = await addClient(roomName, ws);
  const awareness = new awarenessProtocol.Awareness(room.doc);

  ws.binaryType = "arraybuffer";

  ws.addEventListener("open", () => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep1(encoder, room.doc);
    ws.send(encoding.toUint8Array(encoder));

    if (awareness.getStates().size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          awareness,
          Array.from(awareness.getStates().keys()),
        ),
      );
      ws.send(encoding.toUint8Array(awarenessEncoder));
    }
  });

  const docUpdateHandler = (update: Uint8Array, origin: unknown) => {
    if (origin === ws) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    broadcastToRoom(roomName, encoding.toUint8Array(encoder));
  };
  room.doc.on("update", docUpdateHandler);

  const awarenessChangeHandler = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    _origin: unknown,
  ) => {
    const changedClients = [...added, ...updated, ...removed];
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
    );
    broadcastToRoom(roomName, encoding.toUint8Array(encoder), ws);
  };
  awareness.on("update", awarenessChangeHandler);

  ws.addEventListener("message", (event) => {
    const data = new Uint8Array(event.data as ArrayBuffer);
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MSG_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder));
        }
        break;
      }
      case MSG_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(awareness, update, ws);
        break;
      }
    }
  });

  ws.addEventListener("close", () => {
    room.doc.off("update", docUpdateHandler);
    awareness.off("update", awarenessChangeHandler);
    awarenessProtocol.removeAwarenessStates(awareness, [room.doc.clientID], null);
    removeClient(roomName, ws);
  });

  ws.addEventListener("error", (err) => {
    console.error(`WebSocket error in room ${roomName}:`, err);
  });
}
