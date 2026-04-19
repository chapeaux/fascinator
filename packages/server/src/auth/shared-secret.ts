export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  displayName?: string;
  error?: string;
}

export function validateSharedSecret(req: Request): AuthResult {
  const secret = Deno.env.get("FASCINATOR_AUTH_SECRET");
  if (!secret) {
    return { authenticated: true, userId: "anonymous", displayName: "User" };
  }

  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : new URL(req.url).searchParams.get("token");

  if (!token) {
    return { authenticated: false, error: "Missing authorization token" };
  }

  if (token !== secret) {
    return { authenticated: false, error: "Invalid token" };
  }

  return { authenticated: true, userId: "shared-secret-user", displayName: "User" };
}
