import * as vscode from "vscode";
import * as Y from "yjs";
import { LOCAL_ORIGIN } from "./edit-origin";

export class YjsBinding {
  private yText: Y.Text;
  private isApplyingRemote = false;
  private suppressFileWatcher = false;
  private editQueue: Promise<void> = Promise.resolve();
  private disposables: vscode.Disposable[] = [];
  private observer: ((event: Y.YTextEvent, transaction: Y.Transaction) => void) | null = null;

  constructor(
    private yDoc: Y.Doc,
    private document: vscode.TextDocument,
  ) {
    this.yText = yDoc.getText("content");

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document !== this.document) return;
        if (this.isApplyingRemote) return;
        if (event.contentChanges.length === 0) return;

        // Detect external file changes (e.g. git checkout, terminal edits)
        // by checking if we're suppressing file watcher notifications
        if (this.suppressFileWatcher) {
          this.suppressFileWatcher = false;
          return;
        }

        this.yDoc.transact(() => {
          const sorted = [...event.contentChanges].sort(
            (a, b) => b.rangeOffset - a.rangeOffset,
          );
          for (const change of sorted) {
            if (change.rangeLength > 0) {
              this.yText.delete(change.rangeOffset, change.rangeLength);
            }
            if (change.text.length > 0) {
              this.yText.insert(change.rangeOffset, change.text);
            }
          }
        }, LOCAL_ORIGIN);
      }),
    );

    // Ensure document content matches Yjs state before saving
    this.disposables.push(
      vscode.workspace.onWillSaveTextDocument((event) => {
        if (event.document !== this.document) return;
        const yjsText = this.yText.toString();
        const currentText = this.document.getText();
        if (yjsText !== currentText) {
          const fullRange = new vscode.Range(
            this.document.positionAt(0),
            this.document.positionAt(currentText.length),
          );
          const edit = new vscode.WorkspaceEdit();
          edit.replace(this.document.uri, fullRange, yjsText);
          event.waitUntil(vscode.workspace.applyEdit(edit));
        }
      }),
    );

    // After save, suppress the file watcher reload for other code-server instances
    // since they already have the content via Yjs
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc === this.document) {
          this.suppressFileWatcher = true;
        }
      }),
    );

    this.observer = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return;
      const delta = event.delta as Array<{ retain?: number; insert?: string; delete?: number }>;
      this.queueRemoteEdit(delta);
    };
    this.yText.observe(this.observer);
  }

  async seedFromDocument(): Promise<void> {
    const text = this.document.getText();
    if (text.length > 0 && this.yText.length === 0) {
      this.yDoc.transact(() => {
        this.yText.insert(0, text);
      }, LOCAL_ORIGIN);
    }
  }

  async syncFromYjs(): Promise<void> {
    const yjsText = this.yText.toString();
    const currentText = this.document.getText();
    if (yjsText === currentText) return;

    this.isApplyingRemote = true;
    try {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        this.document.positionAt(0),
        this.document.positionAt(currentText.length),
      );
      edit.replace(this.document.uri, fullRange, yjsText);
      await vscode.workspace.applyEdit(edit);
    } finally {
      this.isApplyingRemote = false;
    }
  }

  private queueRemoteEdit(delta: Array<{ retain?: number; insert?: string; delete?: number }>): void {
    this.editQueue = this.editQueue.then(() => this.applyRemoteDelta(delta));
  }

  private async applyRemoteDelta(
    delta: Array<{ retain?: number; insert?: string; delete?: number }>,
  ): Promise<void> {
    this.isApplyingRemote = true;
    try {
      const edit = new vscode.WorkspaceEdit();
      let offset = 0;

      for (const op of delta) {
        if (op.retain !== undefined) {
          offset += op.retain;
        } else if (typeof op.insert === "string") {
          const pos = this.document.positionAt(offset);
          edit.insert(this.document.uri, pos, op.insert);
          offset += op.insert.length;
        } else if (op.delete !== undefined) {
          const start = this.document.positionAt(offset);
          const end = this.document.positionAt(offset + op.delete);
          edit.delete(this.document.uri, new vscode.Range(start, end));
        }
      }

      const success = await vscode.workspace.applyEdit(edit);
      if (!success) {
        await this.syncFromYjs();
      }
    } finally {
      this.isApplyingRemote = false;
    }
  }

  dispose(): void {
    if (this.observer) {
      this.yText.unobserve(this.observer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
