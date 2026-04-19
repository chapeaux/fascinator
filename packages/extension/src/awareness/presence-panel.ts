import * as vscode from "vscode";

export interface Collaborator {
  clientId: number;
  name: string;
  slotId: number;
  color: string;
  currentFile: string | null;
}

class CollaboratorItem extends vscode.TreeItem {
  constructor(collaborator: Collaborator, isHost: boolean) {
    const role = collaborator.slotId === 0 ? "host" : "guest";
    super(collaborator.name, vscode.TreeItemCollapsibleState.None);

    const file = collaborator.currentFile || "idle";
    this.description = `(${role}) ${file}`;
    this.tooltip = `${collaborator.name} - slot ${collaborator.slotId} - ${file}`;
    this.iconPath = new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("charts.foreground"));

    if (collaborator.currentFile) {
      this.command = {
        command: "vscode.open",
        title: "Open file",
        arguments: [vscode.Uri.file(collaborator.currentFile)],
      };
    }
  }
}

export class PresencePanel implements vscode.TreeDataProvider<CollaboratorItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<CollaboratorItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private collaborators = new Map<number, Collaborator>();

  updateCollaborator(collaborator: Collaborator): void {
    this.collaborators.set(collaborator.clientId, collaborator);
    this._onDidChangeTreeData.fire(undefined);
  }

  removeCollaborator(clientId: number): void {
    this.collaborators.delete(clientId);
    this._onDidChangeTreeData.fire(undefined);
  }

  clear(): void {
    this.collaborators.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  get count(): number {
    return this.collaborators.size;
  }

  getTreeItem(element: CollaboratorItem): vscode.TreeItem {
    return element;
  }

  getChildren(): CollaboratorItem[] {
    return Array.from(this.collaborators.values())
      .sort((a, b) => a.slotId - b.slotId)
      .map((c) => new CollaboratorItem(c, c.slotId === 0));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
