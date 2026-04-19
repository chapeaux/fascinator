import type { SlotInfo } from "@fascinator/shared/protocol.ts";
import { DEFAULT_SERVER_PORT } from "@fascinator/shared/constants.ts";

let nextSlotId = 0;

export interface ManagedSlot extends SlotInfo {
  process: Deno.ChildProcess | null;
  password: string;
}

function generatePassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
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

  const env: Record<string, string> = {
    FASCINATOR_SLOT_ID: String(slotId),
    FASCINATOR_SERVER_URL: `ws://localhost:${DEFAULT_SERVER_PORT}`,
    FASCINATOR_USER_NAME: displayName,
  };

  let process: Deno.ChildProcess | null = null;
  try {
    const command = new Deno.Command("code-server", { args, env, stdout: "piped", stderr: "piped" });
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
    const resp = await fetch(`http://localhost:${port}/healthz`, {
      signal: AbortSignal.timeout(1000),
    });
    return resp.ok;
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
