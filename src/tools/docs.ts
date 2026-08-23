import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchDocs, getDoc, listDocs, listTopics, knowledgeStats, SOURCES } from "../knowledge/index.js";
import { ok, fail, guard, truncate } from "../utils.js";

const LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function registerDocsTools(server: McpServer) {
  server.registerTool(
    "avax_search_docs",
    {
      title: "Search Avalanche documentation",
      description: `Full-text search over the official Avalanche knowledge base (build.avax.network docs, Academy, 234 integrations, blog, all ACPs, AvalancheGo/Subnet-EVM READMEs & precompile docs, ICM/Teleporter contracts, Avalanche CLI command reference, starter kit).

Use this FIRST for any "how do I…", "what is…", "which precompile/config/command…" question about Avalanche, L1s/Subnets, Subnet-EVM, ICM/Teleporter/Warp, P-Chain staking, validators, Avalanche CLI, SDKs, RPC methods.

Args:
  - query: natural language or keywords (e.g. "native minter precompile genesis", "convert subnet to L1", "teleporter send message fuji")
  - source: optional filter: docs | academy | integrations (234 ecosystem integrations: oracles, bridges, indexers, wallets, RPC providers…) | blog | acps (Avalanche Community Proposals) | avalanchego | icm | cli | starter-kit
  - path_prefix: optional path filter, e.g. "content/docs/avalanche-l1s", "content/academy/avalanche-l1", "graft/subnet-evm"
  - limit: max hits (default 8)

Returns ranked snippets with title, heading, url and path. Call avax_get_doc with a hit's path to read the full page.`,
      inputSchema: {
        query: z.string().min(2).max(300),
        source: z.enum(SOURCES).optional(),
        path_prefix: z.string().optional(),
        limit: z.number().int().min(1).max(25).default(8),
      },
      annotations: LOCAL,
    },
    guard(async ({ query, source, path_prefix, limit }) => {
      const hits = searchDocs(query, { limit, source, pathPrefix: path_prefix });
      if (hits.length === 0) {
        return fail(`No documentation matched "${query}".`, "Try fewer/different keywords, drop the source/path filter, or call avax_list_topics to browse sections.");
      }
      const results = hits.map((h) => ({ title: h.title, heading: h.heading, source: h.source, path: h.path, url: h.url, score: Number(h.score.toFixed(2)), snippet: h.text.slice(0, 700) }));
      const md = results.map((r, i) => `### ${i + 1}. ${r.title}${r.heading ? ` › ${r.heading}` : ""}\n_${r.source}_ · ${r.url}\npath: \`${r.path}\`\n\n${r.snippet}${r.snippet.length >= 700 ? "…" : ""}`).join("\n\n---\n\n");
      return ok({ query, count: results.length, results }, truncate(md));
    })
  );

  server.registerTool(
    "avax_get_doc",
    {
      title: "Read a full documentation page",
      description: "Return the full text of a documentation page by its `path` (from avax_search_docs / avax_list_docs) or its build.avax.network URL. Long pages are truncated at 25k chars; use `offset` to continue.",
      inputSchema: {
        path: z.string().describe("e.g. content/docs/avalanche-l1s/evm-configuration/customize-avalanche-l1.mdx or https://build.avax.network/docs/..."),
        offset: z.number().int().min(0).default(0),
      },
      annotations: LOCAL,
    },
    guard(async ({ path, offset }) => {
      const d = getDoc(path);
      if (!d) return fail(`No document at "${path}".`, "Use the exact `path` value returned by avax_search_docs or avax_list_docs.");
      const body = d.body.slice(offset);
      return ok(
        { title: d.doc.title, source: d.doc.source, path: d.doc.path, url: d.doc.url, totalChars: d.body.length, offset, has_more: body.length > 25_000 },
        `# ${d.doc.title}\n${d.doc.url}\n\n${truncate(body)}`
      );
    })
  );

  server.registerTool(
    "avax_list_docs",
    {
      title: "List documentation pages",
      description: "List documentation pages under a path prefix (e.g. 'content/docs/avalanche-l1s', 'content/docs/rpcs', 'content/academy/avalanche-l1', 'graft/subnet-evm'). Use to browse a section's table of contents.",
      inputSchema: { path_prefix: z.string().default(""), limit: z.number().int().min(1).max(500).default(100) },
      annotations: LOCAL,
    },
    guard(async ({ path_prefix, limit }) => {
      const docs = listDocs(path_prefix, limit);
      return ok({ path_prefix, count: docs.length, docs });
    })
  );

  server.registerTool(
    "avax_list_topics",
    {
      title: "List knowledge-base topics",
      description: "Overview of the indexed Avalanche knowledge base: top-level sections with document counts, plus index build date. Use to orient before searching.",
      inputSchema: {},
      annotations: LOCAL,
    },
    guard(async () => {
      return ok({ ...knowledgeStats(), topics: listTopics() });
    })
  );
}
