import { DEFAULT_SERVER_PORT } from "@fascinator/shared/constants.ts";

export const config = {
  port: parseInt(Deno.env.get("FASCINATOR_SERVER_PORT") || String(DEFAULT_SERVER_PORT)),
  dataDir: Deno.env.get("FASCINATOR_DATA_DIR") || "/data",
};
