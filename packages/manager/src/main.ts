import { DEFAULT_MANAGER_PORT } from "@fascinator/shared/constants.ts";
import { handleApi, getHostName, getWorkspaceName } from "./api.ts";

const port = parseInt(Deno.env.get("FASCINATOR_MANAGER_PORT") || String(DEFAULT_MANAGER_PORT));
const landingDir = new URL("./landing", import.meta.url).pathname;

async function serveLanding(path: string): Promise<Response | null> {
  const filePath = path === "/" ? `${landingDir}/index.html` : `${landingDir}${path}`;
  try {
    const file = await Deno.readFile(filePath);
    const ext = filePath.split(".").pop() || "";
    const contentType: Record<string, string> = {
      html: "text/html; charset=utf-8",
      css: "text/css; charset=utf-8",
      js: "application/javascript; charset=utf-8",
    };
    return new Response(file, {
      headers: {
        "Content-Type": contentType[ext] || "application/octet-stream",
      },
    });
  } catch {
    return null;
  }
}

function handleConfig(): Response {
  return Response.json({
    hostName: getHostName(),
    workspaceName: getWorkspaceName(),
  });
}

Deno.serve({ port, hostname: "0.0.0.0" }, async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.startsWith("/api/")) {
    return handleApi(req, path);
  }

  if (path === "/config") {
    return handleConfig();
  }

  const landing = await serveLanding(path);
  if (landing) return landing;

  return new Response("Not Found", { status: 404 });
});

console.log(`Fascinator Manager listening on :${port}`);
