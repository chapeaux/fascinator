import * as vscode from "vscode";
import { colorsForSlot, type UserColors } from "./color-palette";

interface RemoteCursorState {
  name: string;
  slotId: number;
  colors: UserColors;
  cursorDecoration: vscode.TextEditorDecorationType;
  labelDecoration: vscode.TextEditorDecorationType;
  selectionDecoration: vscode.TextEditorDecorationType;
  labelHideTimer: ReturnType<typeof setTimeout> | null;
  labelVisible: boolean;
}

const LABEL_HIDE_MS = 3000;

export class CursorManager {
  private cursors = new Map<number, RemoteCursorState>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingUpdates = new Map<number, { file: string; anchor: { line: number; ch: number }; head: { line: number; ch: number } }>();

  createCursor(clientId: number, name: string, slotId: number): void {
    if (this.cursors.has(clientId)) return;

    const colors = colorsForSlot(slotId);

    const cursorDecoration = vscode.window.createTextEditorDecorationType({
      borderStyle: "solid",
      borderColor: colors.cursor,
      borderWidth: "2px 0 0 2px",
    });

    const labelDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: name,
        color: "#1e1e2e",
        backgroundColor: colors.label,
        margin: "0 0 0 4px",
        fontWeight: "bold",
        textDecoration: `none; font-size: 0.7em; padding: 1px 4px; border-radius: 2px; position: relative; top: -1.1em;`,
      },
    });

    const selectionDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: colors.selection,
    });

    this.cursors.set(clientId, {
      name,
      slotId,
      colors,
      cursorDecoration,
      labelDecoration,
      selectionDecoration,
      labelHideTimer: null,
      labelVisible: true,
    });
  }

  updateCursor(
    clientId: number,
    file: string,
    anchor: { line: number; ch: number },
    head: { line: number; ch: number },
  ): void {
    this.pendingUpdates.set(clientId, { file, anchor, head });
    this.scheduleRender();
  }

  removeCursor(clientId: number): void {
    const cursor = this.cursors.get(clientId);
    if (!cursor) return;

    cursor.cursorDecoration.dispose();
    cursor.labelDecoration.dispose();
    cursor.selectionDecoration.dispose();
    if (cursor.labelHideTimer) clearTimeout(cursor.labelHideTimer);
    this.cursors.delete(clientId);
    this.pendingUpdates.delete(clientId);
  }

  private scheduleRender(): void {
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.render();
    }, 16);
  }

  private render(): void {
    const editors = vscode.window.visibleTextEditors;

    for (const [clientId, update] of this.pendingUpdates) {
      const cursor = this.cursors.get(clientId);
      if (!cursor) continue;

      const editor = editors.find((e) =>
        vscode.workspace.asRelativePath(e.document.uri, false) === update.file
      );

      if (!editor) continue;

      const headPos = new vscode.Position(update.head.line, update.head.ch);
      const cursorRange = new vscode.Range(headPos, headPos);
      editor.setDecorations(cursor.cursorDecoration, [cursorRange]);

      this.showLabel(cursor, editor, cursorRange);

      const anchorPos = new vscode.Position(update.anchor.line, update.anchor.ch);
      if (!anchorPos.isEqual(headPos)) {
        const selRange = new vscode.Range(
          anchorPos.isBefore(headPos) ? anchorPos : headPos,
          anchorPos.isBefore(headPos) ? headPos : anchorPos,
        );
        editor.setDecorations(cursor.selectionDecoration, [selRange]);
      } else {
        editor.setDecorations(cursor.selectionDecoration, []);
      }
    }

    this.pendingUpdates.clear();
  }

  private showLabel(
    cursor: RemoteCursorState,
    editor: vscode.TextEditor,
    range: vscode.Range,
  ): void {
    cursor.labelVisible = true;
    editor.setDecorations(cursor.labelDecoration, [range]);

    if (cursor.labelHideTimer) clearTimeout(cursor.labelHideTimer);
    cursor.labelHideTimer = setTimeout(() => {
      cursor.labelVisible = false;
      editor.setDecorations(cursor.labelDecoration, []);
    }, LABEL_HIDE_MS);
  }

  clearAll(): void {
    for (const [id] of this.cursors) {
      this.removeCursor(id);
    }
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.clearAll();
  }
}
