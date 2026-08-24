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
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-session-id, mcp-protocol-version, authorization",
  "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
};

/** Human-friendly description returned to browsers / plain GETs (mirrors build.avax.network/api/mcp). */
export function serverInfo(endpoint = "https://avalanche-mcp.dev/mcp") {
  return {
    name: SERVER_NAME,
    version: SERVER_VERSION,
    description: "Avalanche, explained to your AI agent. Read-only MCP server: Builder Hub docs & Academy, all ACPs and network upgrades, live C/P/X-Chain and Data API lookups, L1 / precompile / ICM workflows.",
    transport: "streamable-http",
    endpoint,
    tools: 41,
    install: {
      claudeCode: `claude mcp add avalanche --transport http ${endpoint}`,
      claudeDesktop: { command: "npx", args: ["-y", "mcp-remote", endpoint] },
      cursor: { mcpServers: { avalanche: { url: endpoint } } },
      local: "claude mcp add avalanche -- npx -y avalanche-mcp-server",
    },
    usage: "POST JSON-RPC 2.0 with Accept: application/json, text/event-stream. Try {\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}.",
    docs: "https://avalanche-mcp.dev",
    source: "https://github.com/Eelvanpsd/Avalanche-mcp",
    npm: "https://www.npmjs.com/package/avalanche-mcp-server",
  };
}

function wantsEventStream(accept: string | null | undefined): boolean {
  return (accept ?? "").includes("text/event-stream");
}

/** Web-standard entry: handle one MCP request (stateless, new server per call). */
export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method === "GET" && !wantsEventStream(request.headers.get("accept"))) {
    const u = new URL(request.url);
    return new Response(JSON.stringify(serverInfo(`${u.origin}${u.pathname}`), null, 2), {
      status: 200,
      headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  }
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
    if (req.method === "GET" && !wantsEventStream(req.headers.accept)) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(serverInfo(`http://localhost:${port}/mcp`), null, 2));
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
