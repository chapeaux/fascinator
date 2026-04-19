import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | null = null;

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Fascinator");
  }
  return outputChannel;
}

export function log(message: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  getOutputChannel().appendLine(`[${ts}] ${message}`);
}

export function getServerUrl(): string {
  const envUrl = process.env.FASCINATOR_SERVER_URL;
  if (envUrl) return envUrl;

  const config = vscode.workspace.getConfiguration("fascinator");
  return config.get<string>("serverUrl") || "ws://localhost:3078";
}
