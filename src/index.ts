#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  if (process.argv.includes("--http")) {
    const { startHttp } = await import("./http.js");
    await startHttp(Number(process.env.PORT ?? 3333));
    return;
  }
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[avalanche-mcp] ready on stdio");
}

main().catch((err) => {
  console.error("[avalanche-mcp] fatal:", err);
  process.exit(1);
});
