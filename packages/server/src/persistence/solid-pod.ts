const podUrl = Deno.env.get("FASCINATOR_SOLID_POD_URL");

export function isSolidPodEnabled(): boolean {
  return !!podUrl;
}

export interface SessionMetadata {
  sessionId: string;
  hostName: string;
  hostWebId?: string;
  createdAt: string;
  participants: string[];
  sharedFiles: string[];
}

export async function storeSessionMetadata(metadata: SessionMetadata): Promise<boolean> {
  if (!podUrl) return false;

  const resourceUrl = `${podUrl.replace(/\/$/, "")}/fascinator/sessions/${metadata.sessionId}`;

  const turtle = `
@prefix schema: <http://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix fascinator: <https://fascinator.dev/ns#> .

<${resourceUrl}>
  a fascinator:CollaborationSession ;
  schema:name "${metadata.sessionId}" ;
  fascinator:hostName "${escapeString(metadata.hostName)}" ;
${metadata.hostWebId ? `  fascinator:hostWebId <${metadata.hostWebId}> ;\n` : ""}  schema:dateCreated "${metadata.createdAt}"^^xsd:dateTime ;
${metadata.participants.map((p) => `  fascinator:participant "${escapeString(p)}" ;`).join("\n")}
${metadata.sharedFiles.map((f) => `  fascinator:sharedFile "${escapeString(f)}" ;`).join("\n")}
  .
`;

  try {
    const resp = await fetch(resourceUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "text/turtle",
      },
      body: turtle,
    });
    return resp.ok;
  } catch (err) {
    console.error("Failed to store session metadata to Solid Pod:", err);
    return false;
  }
}

function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
