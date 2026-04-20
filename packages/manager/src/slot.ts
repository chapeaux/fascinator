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
  const slotTmpDir = `${userDataDir}/tmp`;

  try { Deno.mkdirSync(slotTmpDir, { recursive: true }); } catch { /* exists */ }

  const args = [
    "--bind-addr", `0.0.0.0:${port}`,
    "--auth", "none",
    "--user-data-dir", userDataDir,
    "--disable-telemetry",
    workspaceDir,
  ];

  if (extensionPath) {
    args.unshift("--install-extension", extensionPath);
  }

  // Minimal clean env — only what code-server needs to run
  const home = Deno.env.get("HOME") || "/home/user";
  const env: Record<string, string> = {
    HOME: home,
    USER: Deno.env.get("USER") || "user",
    PATH: `${home}/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
    SHELL: Deno.env.get("SHELL") || "/bin/bash",
    LANG: Deno.env.get("LANG") || "en_US.UTF-8",
    TMPDIR: slotTmpDir,
    XDG_RUNTIME_DIR: slotTmpDir,
    XDG_DATA_HOME: `${userDataDir}/data`,
    XDG_CONFIG_HOME: `${userDataDir}/config`,
    FASCINATOR_SLOT_ID: String(slotId),
    FASCINATOR_SERVER_URL: `ws://localhost:${DEFAULT_SERVER_PORT}`,
    FASCINATOR_USER_NAME: displayName,
  };

  const codeServerBin = findCodeServer();
  let process: Deno.ChildProcess | null = null;
  try {
    console.log(`Spawning code-server slot ${slotId} on port ${port} (${codeServerBin})`);
    console.log(`  bind: 0.0.0.0:${port}`);
    console.log(`  data: ${userDataDir}`);

    // Build env -i command string — this is proven to work in Dev Spaces
    const envPairs = Object.entries(env).map(([k, v]) => `${k}='${v}'`).join(" ");
    const csArgs = args.map((a) => `'${a}'`).join(" ");
    const shellCmd = `env -i ${envPairs} '${codeServerBin}' ${csArgs}`;

    console.log(`  cmd: ${shellCmd.slice(0, 200)}...`);

    const command = new Deno.Command("/bin/bash", {
      args: ["-c", shellCmd],
      stdin: "null",
      stdout: "inherit",
      stderr: "inherit",
      clearEnv: true,
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
