import type { SlotInfo } from "@fascinator/shared/protocol.ts";
import { DEFAULT_SERVER_PORT } from "@fascinator/shared/constants.ts";

let nextSlotId = 1;

export interface ManagedSlot extends SlotInfo {
  process: Deno.ChildProcess | null;
  password: string;
}

function generatePassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

function findCodeServer(): string {
  const home = Deno.env.get("HOME") || "/home/user";
  const candidates = [
    `${home}/.local/bin/code-server`,
    "/usr/local/bin/code-server",
    "/usr/bin/code-server",
  ];
  for (const path of candidates) {
    try {
      Deno.statSync(path);
      return path;
    } catch {
      // not found
    }
  }
  return "code-server";
}

export function createSlot(
  port: number,
  displayName: string,
  workspaceDir: string,
  dataDir: string,
  extensionPath: string | null,
): ManagedSlot {
  const slotId = nextSlotId++;
  const password = generatePassword();
  const userDataDir = `${dataDir}/code-server/slot-${slotId}`;

  const args = [
    "--port", String(port),
    "--auth", "none",
    "--user-data-dir", userDataDir,
    "--disable-telemetry",
    workspaceDir,
  ];

  if (extensionPath) {
    args.unshift("--install-extension", extensionPath);
  }

  // Inherit env but strip VSCODE_*/CHECODE_* vars that cause code-server
  // to connect to the host che-code instance instead of starting fresh
  const parentEnv = Deno.env.toObject();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parentEnv)) {
    if (key.startsWith("VSCODE_") || key.startsWith("CHECODE_")) continue;
    if (key === "BROWSER") continue;
    env[key] = value;
  }
  env.FASCINATOR_SLOT_ID = String(slotId);
  env.FASCINATOR_SERVER_URL = `ws://localhost:${DEFAULT_SERVER_PORT}`;
  env.FASCINATOR_USER_NAME = displayName;

  const codeServerBin = findCodeServer();
  let process: Deno.ChildProcess | null = null;
  try {
    console.log(`Spawning code-server slot ${slotId} on port ${port} (${codeServerBin})`);
    console.log(`  args: ${args.join(" ")}`);

    const command = new Deno.Command(codeServerBin, {
      args,
      env,
      stdin: "null",
      stdout: "inherit",
      stderr: "inherit",
    });
    process = command.spawn();
  } catch (err) {
    console.error(`Failed to spawn code-server for slot ${slotId}:`, err);
  }

  return {
    slotId,
    port,
    displayName,
    status: process ? "starting" : "stopped",
    createdAt: Date.now(),
    process,
    password,
  };
}

export async function checkSlotReady(port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(2000),
      redirect: "manual",
    });
    return resp.status < 500;
  } catch {
    return false;
  }
}

export function stopSlot(slot: ManagedSlot): void {
  if (slot.process) {
    try {
      slot.process.kill("SIGTERM");
    } catch {
      // already exited
    }
    slot.process = null;
  }
  slot.status = "stopped";
}
