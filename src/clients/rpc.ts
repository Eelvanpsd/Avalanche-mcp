/**
 * Minimal JSON-RPC helper for AvalancheGo P-Chain (platform.*), X-Chain (avm.*),
 * info.* and admin endpoints. viem covers the EVM side; this covers everything else.
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export async function jsonRpc<T = unknown>(
  url: string,
  method: string,
  params: Record<string, unknown> | unknown[] = {},
  timeoutMs = 15_000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url} for ${method}`);
    }
    const body = (await res.json()) as { result?: T; error?: JsonRpcError };
    if (body.error) {
      throw new Error(`${method} failed: ${body.error.message} (code ${body.error.code})`);
    }
    return body.result as T;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`${method} timed out after ${timeoutMs}ms contacting ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const pChainUrl = (apiBase: string) => `${apiBase}/ext/bc/P`;
export const xChainUrl = (apiBase: string) => `${apiBase}/ext/bc/X`;
export const infoUrl = (apiBase: string) => `${apiBase}/ext/info`;
