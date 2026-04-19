import * as vscode from "vscode";
import { SessionManager } from "./session/session-manager";

export function registerCommands(
  context: vscode.ExtensionContext,
  sessionManager: SessionManager,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("fascinator.shareFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file to share.");
        return;
      }
      await sessionManager.shareFile(editor.document);
    }),

    vscode.commands.registerCommand("fascinator.copyShareLink", async () => {
      if (!sessionManager.isHost) {
        vscode.window.showWarningMessage("Only the host can share the workspace link.");
        return;
      }
      const managerUrl = process.env.FASCINATOR_MANAGER_URL;
      if (managerUrl) {
        await vscode.env.clipboard.writeText(managerUrl);
        vscode.window.showInformationMessage("Share link copied to clipboard!");
      } else {
        vscode.window.showWarningMessage(
          "Manager URL not configured. Set FASCINATOR_MANAGER_URL.",
        );
      }
    }),

    vscode.commands.registerCommand("fascinator.leaveSession", () => {
      sessionManager.leaveAll();
      vscode.window.showInformationMessage("Left Fascinator session.");
    }),

    vscode.commands.registerCommand("fascinator.removeGuest", async () => {
      if (!sessionManager.isHost) {
        vscode.window.showWarningMessage("Only the host can remove guests.");
        return;
      }
      const managerPort = process.env.FASCINATOR_MANAGER_PORT || "3079";
      try {
        // Dynamic import of node fetch is available in VS Code extension host
        const resp = await fetch(`http://localhost:${managerPort}/api/slots`);
        const slots = await resp.json() as Array<{ slotId: number; displayName: string; status: string }>;
        const guests = slots.filter((s) => s.slotId !== 0 && s.status !== "stopped");
        if (guests.length === 0) {
          vscode.window.showInformationMessage("No active guests.");
          return;
        }
        const pick = await vscode.window.showQuickPick(
          guests.map((g) => ({ label: g.displayName, description: `Slot ${g.slotId}`, slotId: g.slotId })),
          { placeHolder: "Select a guest to remove" },
        );
        if (pick) {
          await fetch(`http://localhost:${managerPort}/api/slots/${pick.slotId}`, { method: "DELETE" });
          vscode.window.showInformationMessage(`Removed ${pick.label}.`);
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to list guests: ${err}`);
      }
    }),

    vscode.commands.registerCommand("fascinator.listGuests", async () => {
      const managerPort = process.env.FASCINATOR_MANAGER_PORT || "3079";
      try {
        const resp = await fetch(`http://localhost:${managerPort}/api/slots`);
        const slots = await resp.json() as Array<{ slotId: number; displayName: string; status: string }>;
        const lines = slots.map((s) => `${s.displayName} (slot ${s.slotId}) - ${s.status}`);
        vscode.window.showInformationMessage(lines.join("\n") || "No active slots.");
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to list guests: ${err}`);
      }
    }),
  );
}
