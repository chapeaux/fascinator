import * as jose from "npm:jose@^5.0.0";
import type { AuthResult } from "./shared-secret.ts";

export async function validateSolidOidc(req: Request): Promise<AuthResult> {
  const auth = req.headers.get("authorization");
  const dpopHeader = req.headers.get("dpop");

  if (!auth || !dpopHeader) {
    return { authenticated: false, error: "Missing Authorization or DPoP header" };
  }

  const idToken = auth.startsWith("Bearer ") ? auth.slice(7) : auth;

  try {
    // Decode the ID token without verification first to extract WebID and issuer
    const claims = jose.decodeJwt(idToken);
    const webId = claims.webid as string;
    const iss = claims.iss as string;

    if (!webId || !iss) {
      return { authenticated: false, error: "Missing webid or iss claim" };
    }

    // Verify DPoP proof JWT
    const dpopJwt = jose.decodeProtectedHeader(dpopHeader);
    if (!dpopJwt.jwk) {
      return { authenticated: false, error: "DPoP header missing jwk" };
    }

    const dpopKey = await jose.importJWK(dpopJwt.jwk);
    const dpopPayload = await jose.jwtVerify(dpopHeader, dpopKey);

    // Verify DPoP claims
    const { htm, htu } = dpopPayload.payload as { htm?: string; htu?: string };
    if (htm !== "GET" && htm !== "POST") {
      return { authenticated: false, error: "Invalid DPoP htm claim" };
    }

    // Verify ID token cnf.jkt matches DPoP key thumbprint
    const cnf = claims.cnf as { jkt?: string } | undefined;
    if (cnf?.jkt) {
      const thumbprint = await jose.calculateJwkThumbprint(dpopJwt.jwk);
      if (cnf.jkt !== thumbprint) {
        return { authenticated: false, error: "DPoP key thumbprint mismatch" };
      }
    }

    // Fetch the JWKS from the issuer and verify the ID token
    const jwksUrl = new URL("/.well-known/openid-configuration", iss);
    const configResp = await fetch(jwksUrl.toString());
    const oidcConfig = await configResp.json();
    const jwks = jose.createRemoteJWKSet(new URL(oidcConfig.jwks_uri));

    await jose.jwtVerify(idToken, jwks, { issuer: iss });

    // Dereference WebID to verify issuer trust and get display name
    const profile = await fetchWebIdProfile(webId);
    if (!profile) {
      return { authenticated: false, error: "Failed to dereference WebID" };
    }

    // Verify issuer matches one listed in the WebID profile
    if (profile.oidcIssuers.length > 0 && !profile.oidcIssuers.includes(iss)) {
      return { authenticated: false, error: "Issuer not trusted by WebID profile" };
    }

    return {
      authenticated: true,
      userId: webId,
      displayName: profile.name || webId.split("/").pop() || "Solid User",
    };
  } catch (err) {
    return { authenticated: false, error: `Solid-OIDC verification failed: ${err}` };
  }
}

interface WebIdProfile {
  name: string | null;
  oidcIssuers: string[];
}

async function fetchWebIdProfile(webId: string): Promise<WebIdProfile | null> {
  try {
    const resp = await fetch(webId, {
      headers: { Accept: "application/ld+json, text/turtle" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;

    const contentType = resp.headers.get("content-type") || "";
    const body = await resp.text();

    // Simple extraction from JSON-LD or Turtle
    // In production, use a proper RDF parser
    let name: string | null = null;
    const oidcIssuers: string[] = [];

    if (contentType.includes("json")) {
      try {
        const json = JSON.parse(body);
        const graph = Array.isArray(json) ? json : json["@graph"] || [json];
        for (const node of graph) {
          if (node["@id"] === webId || node.id === webId) {
            name = node["http://xmlns.com/foaf/0.1/name"]?.[0]?.["@value"]
              || node["foaf:name"]
              || node.name
              || null;
            const issuers = node["http://www.w3.org/ns/solid/terms#oidcIssuer"]
              || node["solid:oidcIssuer"]
              || [];
            for (const i of (Array.isArray(issuers) ? issuers : [issuers])) {
              oidcIssuers.push(typeof i === "string" ? i : i["@id"] || i.id || "");
            }
          }
        }
      } catch {
        // parse error
      }
    } else {
      // Basic Turtle extraction via regex
      const nameMatch = body.match(/foaf:name\s+"([^"]+)"/);
      if (nameMatch) name = nameMatch[1];

      const issuerMatches = body.matchAll(/solid:oidcIssuer\s+<([^>]+)>/g);
      for (const m of issuerMatches) {
        oidcIssuers.push(m[1]);
      }
    }

    return { name, oidcIssuers };
  } catch {
    return null;
  }
}
