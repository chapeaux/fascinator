import * as vscode from "vscode";
import { SessionManager } from "./session/session-manager";
import { registerCommands } from "./commands";
import { getOutputChannel, log } from "./config";

let sessionManager: SessionManager | undefined;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(getOutputChannel());

  const slotId = process.env.FASCINATOR_SLOT_ID;
  const userName = process.env.FASCINATOR_USER_NAME || "User";
  const role = slotId === "0" ? "host" : "guest";

  log(`Activating Fascinator (slot ${slotId ?? "?"}, user "${userName}", role ${role})`);

  sessionManager = new SessionManager();
  context.subscriptions.push(sessionManager);

  registerCommands(context, sessionManager);

  const treeView = vscode.window.createTreeView("fascinator.presence", {
    treeDataProvider: sessionManager.presencePanel,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = "fascinator.shareFile";
  context.subscriptions.push(statusBarItem);

  function updateStatusBar(userCount: number): void {
    const users = userCount > 0 ? ` | ${userCount + 1} users` : "";
    const rooms = sessionManager ? ` | ${sessionManager.getRoomCount()} files` : "";
    statusBarItem.text = `$(people) Fascinator (${userName}, ${role}${users}${rooms})`;
    statusBarItem.tooltip = "Click to share the active file";
  }

  updateStatusBar(0);
  statusBarItem.show();

  sessionManager.userCountCallback = (count: number) => {
    updateStatusBar(count);
  };

  log("Fascinator activated successfully");
}

export function deactivate(): void {
  log("Deactivating Fascinator");
  sessionManager?.dispose();
}
