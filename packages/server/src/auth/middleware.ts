import { validateSharedSecret, type AuthResult } from "./shared-secret.ts";
import { validateOidcToken, initOidc } from "./oidc.ts";
import { validateSolidOidc } from "./solid-oidc.ts";

export type AuthMode = "none" | "secret" | "oidc" | "solid-oidc";

let currentMode: AuthMode = "none";

export async function initAuth(): Promise<AuthMode> {
  const mode = (Deno.env.get("FASCINATOR_AUTH_MODE") || "none") as AuthMode;
  currentMode = mode;

  if (mode === "oidc") {
    await initOidc();
  }

  console.log(`Auth mode: ${mode}`);
  return mode;
}

export async function authenticate(req: Request): Promise<AuthResult> {
  switch (currentMode) {
    case "none":
      return { authenticated: true, userId: "local", displayName: "User" };
    case "secret":
      return validateSharedSecret(req);
    case "oidc":
      return await validateOidcToken(req);
    case "solid-oidc":
      return await validateSolidOidc(req);
    default:
      return { authenticated: false, error: `Unknown auth mode: ${currentMode}` };
  }
}

export function getAuthMode(): AuthMode {
  return currentMode;
}
