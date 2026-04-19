import * as jose from "npm:jose@^5.0.0";
import type { AuthResult } from "./shared-secret.ts";

let jwks: jose.JWTVerifyGetKey | null = null;
let issuer: string | null = null;

export async function initOidc(): Promise<void> {
  const iss = Deno.env.get("FASCINATOR_OIDC_ISSUER");
  if (!iss) return;

  issuer = iss;
  const jwksUri = new URL("/.well-known/openid-configuration", iss);
  try {
    const resp = await fetch(jwksUri.toString());
    const config = await resp.json();
    jwks = jose.createRemoteJWKSet(new URL(config.jwks_uri));
  } catch (err) {
    console.error("Failed to initialize OIDC:", err);
  }
}

export async function validateOidcToken(req: Request): Promise<AuthResult> {
  if (!jwks || !issuer) {
    return { authenticated: false, error: "OIDC not configured" };
  }

  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : new URL(req.url).searchParams.get("token");

  if (!token) {
    return { authenticated: false, error: "Missing authorization token" };
  }

  try {
    const { payload } = await jose.jwtVerify(token, jwks, { issuer });
    return {
      authenticated: true,
      userId: (payload.sub as string) || (payload.email as string) || "oidc-user",
      displayName: (payload.preferred_username as string) || (payload.name as string) || "User",
    };
  } catch (err) {
    return { authenticated: false, error: `Token verification failed: ${err}` };
  }
}
