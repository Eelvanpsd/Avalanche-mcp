/**
 * Client for the official hosted Avalanche MCP (https://build.avax.network/api/mcp).
 * Stateless JSON-RPC over Streamable HTTP; responses may arrive as SSE frames.
 * Limits: 60 req/min per IP, read-only, no auth.
 */
export const HOSTED_MCP_URL = process.env.AVAX_HOSTED_MCP_URL ?? "https://build.avax.network/api/mcp";

interface RpcResult<T> {
  result?: T;
  error?: { code: number; message: string };
}

let toolCache: { at: number; tools: Array<{ name: string; description?: string; inputSchema?: unknown }> } | null = null;

/**
 * Client-side throttle so this server never blows the hosted MCP's 60 req/min
 * budget (which is shared across everyone hitting build.avax.network). Simple
 * sliding-window counter; refuses with an actionable error when saturated.
 */
const HOSTED_LIMIT = Number(process.env.AVAX_HOSTED_RATE_LIMIT ?? 40); // per minute, headroom under 60
const hostedCalls: number[] = [];
function reserveHostedSlot(now: number): void {
  const cutoff = now - 60_000;
  while (hostedCalls.length && hostedCalls[0] < cutoff) hostedCalls.shift();
  if (hostedCalls.length >= HOSTED_LIMIT) {
    throw new Error(
      `Local throttle: too many hosted Avalanche MCP calls (${HOSTED_LIMIT}/min) to protect the shared 60/min budget. Use the local tools (avax_search_docs, avax_acp_*, avax_upgrade_lookup) or retry shortly.`
    );
  }
  hostedCalls.push(now);
}

export async function hostedRpc<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<T> {
  if (method === "tools/call") reserveHostedSlot(Date.now());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(HOSTED_MCP_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (res.status === 429) {
      const retry = res.headers.get("retry-after") ?? "60";
      throw new Error(`Hosted Avalanche MCP rate limit (60 req/min). Retry after ${retry}s, or use the local tools (avax_search_docs, avax_acp_*) which have no limit.`);
    }
    if (!res.ok) throw new Error(`Hosted Avalanche MCP HTTP ${res.status}`);
    const text = await res.text();
    // SSE framing: "event: message\ndata: {...}\n\n"
    const m = text.match(/^data:\s*(\{.*\})\s*$/m);
    const body = JSON.parse(m ? m[1] : text) as RpcResult<T>;
    if (body.error) throw new Error(`Hosted MCP error ${body.error.code}: ${body.error.message}`);
    return body.result as T;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`Hosted Avalanche MCP timed out after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function hostedListTools() {
  if (toolCache && Date.now() - toolCache.at < 10 * 60_000) return toolCache.tools;
  const r = await hostedRpc<{ tools: Array<{ name: string; description?: string; inputSchema?: unknown }> }>("tools/list");
  toolCache = { at: Date.now(), tools: r.tools };
  return r.tools;
}

export async function hostedCallTool(name: string, args: Record<string, unknown>) {
  const r = await hostedRpc<{ content: Array<{ type: string; text?: string }>; isError?: boolean; structuredContent?: unknown }>("tools/call", { name, arguments: args });
  const text = (r.content ?? []).map((c) => c.text ?? "").join("\n");
  return { text, isError: !!r.isError, structuredContent: r.structuredContent };
}

export async function hostedReadResource(uri: string) {
  const r = await hostedRpc<{ contents: Array<{ uri: string; text?: string; mimeType?: string }> }>("resources/read", { uri });
  return r.contents.map((c) => c.text ?? "").join("\n");
}
