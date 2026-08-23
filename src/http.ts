/**
 * Streamable HTTP transport (stateless JSON) for remote deployment.
 * Run: node dist/index.js --http   (PORT env, default 3333) → POST /mcp
 *
 * The same server can also be mounted in any web-standard runtime
 * (Next.js route handlers, Cloudflare Workers, Hono) via `handleMcpRequest`.
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./server.js";

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-session-id, mcp-protocol-version, authorization",
  "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
};

/** Web-standard entry: handle one MCP request (stateless, new server per call). */
export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(request);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

/** Node entry: standalone HTTP server. */
export async function startHttp(port: number) {
  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    if (req.url !== "/mcp" && req.url !== "/") {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found. MCP endpoint is POST /mcp");
      return;
    }
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  httpServer.listen(port, () => console.error(`[avalanche-mcp] Streamable HTTP on http://localhost:${port}/mcp`));
}
