/**
 * Optional Streamable HTTP transport (stateless) for remote deployment.
 * Run: node dist/index.js --http   (PORT env, default 3333)
 */
import { createServer as createHttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

export async function startHttp(port: number) {
  const httpServer = createHttpServer(async (req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404).end("Not found. MCP endpoint is POST /mcp");
      return;
    }
    // Stateless: new server + transport per request, no session IDs.
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  httpServer.listen(port, () => console.error(`[avalanche-mcp] Streamable HTTP on http://localhost:${port}/mcp`));
}
