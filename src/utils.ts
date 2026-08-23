import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const CHARACTER_LIMIT = 25_000;

/** Standard success response: JSON text + structuredContent. */
export function ok<T extends Record<string, unknown>>(data: T, text?: string): CallToolResult {
  const body = text ?? JSON.stringify(data, bigintReplacer, 2);
  return {
    content: [{ type: "text", text: truncate(body) }],
    structuredContent: data,
  };
}

/** Standard error response with actionable guidance. */
export function fail(message: string, hint?: string): CallToolResult {
  const text = hint ? `Error: ${message}\n\nHint: ${hint}` : `Error: ${message}`;
  return { content: [{ type: "text", text }], isError: true };
}

export function truncate(text: string, limit = CHARACTER_LIMIT): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n\n[... truncated ${text.length - limit} chars. Narrow your query or paginate.]`;
}

export function bigintReplacer(_k: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() : v;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Wrap a tool handler so thrown errors become actionable MCP error results. */
export function guard<A>(fn: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (e) {
      return fail(errMsg(e));
    }
  };
}
