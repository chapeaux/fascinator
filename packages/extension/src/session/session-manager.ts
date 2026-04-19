import * as vscode from "vscode";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import { WsProvider } from "../transport/ws-provider";
import { YjsBinding } from "../sync/yjs-binding";
import { CursorManager } from "../awareness/cursor-manager";
import { PresencePanel, type Collaborator } from "../awareness/presence-panel";
import { colorsForSlot } from "../awareness/color-palette";
import { log, getServerUrl } from "../config";

interface RoomEntry {
  doc: Y.Doc;
  provider: WsProvider;
  binding: YjsBinding;
}

export class SessionManager {
  private rooms = new Map<string, RoomEntry>();
  private serverUrl: string;
  private slotId: number;
  private userName: string;
  private disposables: vscode.Disposable[] = [];

  readonly cursorManager = new CursorManager();
  readonly presencePanel = new PresencePanel();

  private cursorBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private onUserCountChange: ((count: number) => void) | null = null;

  constructor() {
    this.serverUrl = getServerUrl();
    this.slotId = parseInt(process.env.FASCINATOR_SLOT_ID || "0");
    this.userName = process.env.FASCINATOR_USER_NAME || "User";

    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((doc) => {
        const key = this.docKey(doc.uri);
        const room = this.rooms.get(key);
        if (room) {
          room.binding.dispose();
          room.provider.destroy();
          room.doc.destroy();
          this.rooms.delete(key);
        }
      }),
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        this.scheduleCursorBroadcast(event);
      }),
    );
  }

  set userCountCallback(cb: (count: number) => void) {
    this.onUserCountChange = cb;
  }

  get isHost(): boolean {
    return this.slotId === 0;
  }

  async shareFile(document: vscode.TextDocument): Promise<void> {
    const key = this.docKey(document.uri);
    if (this.rooms.has(key)) {
      vscode.window.showInformationMessage("This file is already shared.");
      return;
    }

    const doc = new Y.Doc({ gc: true });
    const roomName = `file:${this.relativePath(document.uri)}`;
    const provider = new WsProvider(this.serverUrl, roomName, doc);

    const binding = new YjsBinding(doc, document);

    const yText = doc.getText("content");
    if (yText.length === 0) {
      await binding.seedFromDocument();
    } else {
      await binding.syncFromYjs();
    }

    this.rooms.set(key, { doc, provider, binding });

    const colors = colorsForSlot(this.slotId);
    provider.awareness.setLocalStateField("user", {
      name: this.userName,
      color: colors.cursor,
      slotId: this.slotId,
    });

    this.setupAwarenessListener(provider);

    log(`Sharing file: ${this.relativePath(document.uri)} (room: ${roomName})`);
    vscode.window.showInformationMessage(`Sharing: ${this.relativePath(document.uri)}`);
  }

  private setupAwarenessListener(provider: WsProvider): void {
    provider.awareness.on(
      "update",
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
        for (const clientId of removed) {
          this.cursorManager.removeCursor(clientId);
          this.presencePanel.removeCollaborator(clientId);
        }

        for (const clientId of [...added, ...updated]) {
          if (clientId === provider.awareness.clientID) continue;

          const state = provider.awareness.getStates().get(clientId);
          if (!state) continue;

          const user = state.user as { name: string; color: string; slotId: number } | undefined;
          if (!user) continue;

          if (added.includes(clientId)) {
            this.cursorManager.createCursor(clientId, user.name, user.slotId);
          }

          const cursor = state.cursor as { file: string; anchor: { line: number; ch: number }; head: { line: number; ch: number } } | null;

          this.presencePanel.updateCollaborator({
            clientId,
            name: user.name,
            slotId: user.slotId,
            color: user.color,
            currentFile: cursor?.file ?? null,
          });

          if (cursor) {
            this.cursorManager.updateCursor(clientId, cursor.file, cursor.anchor, cursor.head);
          }
        }

        this.onUserCountChange?.(this.presencePanel.count);
      },
    );
  }

  private scheduleCursorBroadcast(event: vscode.TextEditorSelectionChangeEvent): void {
    if (this.cursorBroadcastTimer) clearTimeout(this.cursorBroadcastTimer);
    this.cursorBroadcastTimer = setTimeout(() => {
      this.cursorBroadcastTimer = null;
      this.broadcastCursor(event);
    }, 50);
  }

  private broadcastCursor(event: vscode.TextEditorSelectionChangeEvent): void {
    const document = event.textEditor.document;
    const key = this.docKey(document.uri);
    const room = this.rooms.get(key);
    if (!room) return;

    const sel = event.selections[0];
    room.provider.awareness.setLocalStateField("cursor", {
      file: this.relativePath(document.uri),
      anchor: { line: sel.anchor.line, ch: sel.anchor.character },
      head: { line: sel.active.line, ch: sel.active.character },
    });
  }

  getProvider(uri: vscode.Uri): WsProvider | undefined {
    return this.rooms.get(this.docKey(uri))?.provider;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  leaveAll(): void {
    for (const [, room] of this.rooms) {
      room.binding.dispose();
      room.provider.destroy();
      room.doc.destroy();
    }
    this.rooms.clear();
    this.cursorManager.clearAll();
    this.presencePanel.clear();
  }

  private docKey(uri: vscode.Uri): string {
    return uri.toString();
  }

  private relativePath(uri: vscode.Uri): string {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) {
      return vscode.workspace.asRelativePath(uri, false);
    }
    return uri.fsPath;
  }

  dispose(): void {
    this.leaveAll();
    this.cursorManager.dispose();
    this.presencePanel.dispose();
    if (this.cursorBroadcastTimer) clearTimeout(this.cursorBroadcastTimer);
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
