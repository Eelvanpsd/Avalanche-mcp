import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listAcps, getAcp, getDoc, searchDocs } from "../knowledge/index.js";
import { CONSOLE_FLOWS, PLATFORM_CLI } from "../knowledge/console.js";
import { UPGRADES, findUpgrade } from "../knowledge/upgrades.js";
import { hostedCallTool, hostedListTools, hostedReadResource, HOSTED_MCP_URL } from "../clients/hosted.js";
import { jsonRpc, infoUrl } from "../clients/rpc.js";
import { resolvePrimaryNetwork } from "../config/networks.js";
import { ok, fail, guard, truncate } from "../utils.js";

const LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const REMOTE = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export function registerEcosystemTools(server: McpServer) {
  // ---------- ACPs (offline, structured) ----------
  server.registerTool(
    "avax_acp_list",
    {
      title: "List Avalanche Community Proposals",
      description: "List all ACPs (Avalanche Community Proposals) with structured fields: number, title, status (Activated | Implementable | Proposed | Stale), track (Standards | Best Practices | Meta | Subnet), authors, replaces/dependencies. Offline — parsed from avalanche-foundation/ACPs. Use to answer 'which upgrades are live?', 'what changed in Etna/Fortuna?'.",
      inputSchema: {
        status: z.enum(["Activated", "Implementable", "Proposed", "Stale"]).optional(),
        track: z.string().optional().describe("Substring filter, e.g. 'Standards', 'Best Practices'"),
      },
      annotations: LOCAL,
    },
    guard(async ({ status, track }) => {
      const acps = listAcps({ status, track }).map(({ abstract, ...rest }) => rest);
      const md = acps.map((a) => `- ACP-${a.number} | ${a.status} | ${a.track} — ${a.title} (${a.url})`).join("\n");
      return ok({ count: acps.length, acps }, `Found ${acps.length} ACPs${status ? ` (status=${status})` : ""}${track ? ` (track~${track})` : ""}:\n\n${md}`);
    })
  );

  server.registerTool(
    "avax_acp_lookup",
    {
      title: "Look up an ACP",
      description: "Get one ACP by number or title keyword: preamble fields (status, track, authors, replaces, dependencies, discussion link), abstract, and the full text (truncated). Offline.",
      inputSchema: { query: z.string().describe("e.g. '77', 'ACP-176', 'reinventing subnets'"), full_text: z.boolean().default(false) },
      annotations: LOCAL,
    },
    guard(async ({ query, full_text }) => {
      const acp = getAcp(query);
      if (!acp) return fail(`No ACP matched "${query}".`, "Try the number (e.g. 77) or call avax_acp_list.");
      const doc = full_text ? getDoc(`ACPs/${acp.slug}/README.md`) : null;
      const head = `**ACP-${acp.number}: ${acp.title}**\nStatus: ${acp.status} · Track: ${acp.track}\nAuthors: ${acp.authors}${acp.replaces ? `\nReplaces: ${acp.replaces}` : ""}${acp.dependencies ? `\nDependencies: ${acp.dependencies}` : ""}${acp.discussion ? `\nDiscussion: ${acp.discussion}` : ""}\nSource: ${acp.url}\n\n## Abstract\n${acp.abstract}`;
      return ok({ ...acp, fullTextIncluded: !!doc }, truncate(doc ? `${head}\n\n---\n\n${doc.body}` : head));
    })
  );

  server.registerTool(
    "avax_acp_votes",
    {
      title: "Live ACP signaling (info.acps)",
      description: "Query a public node's info.acps for ACPs currently being signaled (supported/objected weight) on mainnet or fuji. Empty when no ACP vote is in progress.",
      inputSchema: { network: z.enum(["mainnet", "fuji"]).default("mainnet") },
      annotations: REMOTE,
    },
    guard(async ({ network }) => {
      const net = resolvePrimaryNetwork(network);
      const res = await jsonRpc<{ acps: Record<string, unknown> }>(infoUrl(net.apiBase), "info.acps", {});
      const entries = Object.entries(res.acps ?? {});
      return ok({ network: net.name, inProgress: entries.length, acps: res.acps ?? {} }, entries.length ? JSON.stringify(res.acps, null, 2) : `No ACP signaling in progress on ${net.name} (info.acps returned empty). Use avax_acp_list for statuses.`);
    })
  );

  // ---------- Network upgrade timeline ----------
  server.registerTool(
    "avax_upgrade_lookup",
    {
      title: "Network upgrade timeline (Banff → Helicon)",
      description: "Structured history of Avalanche Primary Network upgrades: name, AvalancheGo version, Fuji/mainnet activation dates, status, chains affected (P/X/C/L1s), included ACPs, developer impact and source docs. Omit `query` for the full timeline; pass an upgrade name ('Helicon', 'Etna'), version ('v1.14.0') or ACP number ('ACP-194') for one entry. Pair with avax_acp_lookup and avax_get_doc for full detail.",
      inputSchema: { query: z.string().optional() },
      annotations: LOCAL,
    },
    guard(async ({ query }) => {
      if (query) {
        const u = findUpgrade(query);
        if (!u) return fail(`No upgrade matched "${query}".`, `Known: ${UPGRADES.map((x) => x.name).join(", ")}`);
        const acps = u.acps.map((n) => getAcp(n)).filter(Boolean).map((a) => ({ number: a!.number, title: a!.title, status: a!.status, url: a!.url }));
        const md = `# ${u.name} — ${u.avalanchego}\nStatus: ${u.status} · Fuji: ${u.fuji ?? "—"} · Mainnet: ${u.mainnet} · Chains: ${u.chains.join(", ")}\n\n${u.summary}\n\n## ACPs\n${acps.map((a) => `- ACP-${a.number}: ${a.title} (${a.status}) ${a.url}`).join("\n") || "- (pre-ACP era)"}\n\n## Developer impact\n${u.developerImpact.map((d) => "- " + d).join("\n")}\n\n## Read next (avax_get_doc)\n${u.docs.map((d) => "- " + d).join("\n")}`;
        return ok({ ...u, acpDetails: acps }, md);
      }
      const md = UPGRADES.map((u) => `| ${u.name} | ${u.avalanchego} | ${u.fuji ?? "—"} | ${u.mainnet} | ${u.status} | ${u.chains.join(", ")} | ${u.acps.map((n) => "ACP-" + n).join(", ") || "—"} |`).join("\n");
      return ok({ upgrades: UPGRADES }, `| Upgrade | AvalancheGo | Fuji | Mainnet | Status | Chains | ACPs |\n|---|---|---|---|---|---|---|\n${md}\n\nCall avax_upgrade_lookup with a name for details.`);
    })
  );

  // ---------- Live doc fetch (freshness beyond index build) ----------
  server.registerTool(
    "avax_fetch_live_doc",
    {
      title: "Fetch a live build.avax.network page as markdown",
      description: "Fetch the CURRENT version of any build.avax.network page (docs, academy, integrations, blog, acps) as clean markdown via the official `.md` endpoint. Use when the local index may be stale (check builtAt in avax_list_topics) or for pages not indexed. Accepts a full URL or a site path like /docs/primary-network/overview.",
      inputSchema: { url: z.string().describe("https://build.avax.network/docs/... or /docs/..."), offset: z.number().int().min(0).default(0) },
      annotations: REMOTE,
    },
    guard(async ({ url, offset }) => {
      let u = url.trim();
      if (u.startsWith("/")) u = "https://build.avax.network" + u;
      if (!/^https:\/\/build\.avax\.network\//.test(u)) return fail("Only build.avax.network URLs are supported.", "Pass a /docs, /academy, /integrations, /blog or /docs/acps path.");
      u = u.replace(/[#?].*$/, "").replace(/\/$/, "");
      if (!u.endsWith(".md")) u += ".md";
      const res = await fetch(u, { headers: { accept: "*/*", "user-agent": "avalanche-mcp-server/0.1" } });
      if (!res.ok) return fail(`HTTP ${res.status} fetching ${u}`, "Check the path; try avax_search_docs to find the exact page URL.");
      const text = await res.text();
      const body = text.slice(offset);
      return ok({ url: u, totalChars: text.length, offset, has_more: body.length > 25_000 }, truncate(body));
    })
  );

  // ---------- Builder Console + platform-cli ----------
  server.registerTool(
    "avax_console_flows",
    {
      title: "Builder Console flows & deep links",
      description: "List Builder Console (build.avax.network/console) no-code flows with deep links: create-l1, convert-to-l1, validator-manager, ictt, faucet, multisig, unit-converter, icm-relayer. Also returns platform-cli equivalents for scriptable automation. Pass `flow` for one entry.",
      inputSchema: { flow: z.string().optional() },
      annotations: LOCAL,
    },
    guard(async ({ flow }) => {
      if (flow) {
        const f = CONSOLE_FLOWS.find((x) => x.key === flow);
        if (!f) return fail(`Unknown flow "${flow}".`, `Available: ${CONSOLE_FLOWS.map((x) => x.key).join(", ")}`);
        return ok({ ...f, platformCli: PLATFORM_CLI });
      }
      const md = CONSOLE_FLOWS.map((f) => `- **${f.key}** — ${f.title}: ${f.summary}\n  ${f.url} · ${f.signs ? "signs transactions (wallet)" : "read-only"}`).join("\n");
      return ok({ flows: CONSOLE_FLOWS, platformCli: PLATFORM_CLI }, `# Builder Console flows\n\n${md}\n\n# platform-cli (scriptable alternative)\n${PLATFORM_CLI.install}\n` + Object.entries(PLATFORM_CLI.commands).map(([k, v]) => `\n## ${k}\n${v.map((c) => "  " + c).join("\n")}`).join(""));
    })
  );

  // ---------- Hosted Avalanche MCP federation ----------
  server.registerTool(
    "avax_hosted_list_tools",
    {
      title: "List tools of the official hosted Avalanche MCP",
      description: `List the ~48 tools exposed by Ava Labs' hosted MCP (${HOSTED_MCP_URL}): docs_search (incl. blog/integrations), cli_lookup_command (avalanche-cli/platform-cli/tmpnet), rpc_lookup_method, acp_lookup, platform_get_* (incl. get_validators_at, get_utxos, get_pending_validators), info_* (info_peers, info_is_bootstrapped), onchain_*/chain_stats, build_plan (runbooks), console_flow/console_link. (GitHub code-search tools are documented but not currently exposed.) Then call avax_hosted_call. Rate limit 60/min — prefer local tools when equivalent.`,
      inputSchema: {},
      annotations: REMOTE,
    },
    guard(async () => {
      const tools = await hostedListTools();
      const md = tools.map((t) => `- ${t.name}: ${(t.description ?? "").slice(0, 140)}`).join("\n");
      return ok({ endpoint: HOSTED_MCP_URL, count: tools.length, tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) }, md);
    })
  );

  server.registerTool(
    "avax_hosted_call",
    {
      title: "Call a tool on the official hosted Avalanche MCP",
      description: `Proxy a tool call to Ava Labs' hosted Avalanche MCP (${HOSTED_MCP_URL}). Best for things the local index lacks: build_plan (platform-cli runbooks; pass chainId as a STRING), cli_lookup_command, rpc_lookup_method, docs_search (always-current), platform_get_validators_at, platform_get_pending_validators, info_peers, onchain_activity. On 429 fall back to local tools.`,
      inputSchema: {
        name: z.string().describe("Hosted tool name, e.g. github_search_code"),
        arguments: z.record(z.string(), z.unknown()).default({}).describe("Tool arguments as JSON object"),
      },
      annotations: REMOTE,
    },
    guard(async ({ name, arguments: args }) => {
      const r = await hostedCallTool(name, args);
      if (r.isError) return fail(`hosted ${name}: ${r.text.slice(0, 500)}`, "Check arguments with avax_hosted_list_tools (inputSchema).");
      return ok({ tool: name, arguments: args, structuredContent: r.structuredContent ?? null }, truncate(r.text));
    })
  );

  server.registerTool(
    "avax_hosted_read_index",
    {
      title: "Read a hosted Avalanche MCP index resource",
      description: "Read one of the hosted MCP's index resources: docs://index, academy://index, integrations://index, blog://index, rpcs://index, cli://index, acps://index — markdown link lists of every page, always current.",
      inputSchema: { uri: z.enum(["docs://index", "academy://index", "integrations://index", "blog://index", "rpcs://index", "cli://index", "acps://index"]) },
      annotations: REMOTE,
    },
    guard(async ({ uri }) => {
      const text = await hostedReadResource(uri);
      return ok({ uri, chars: text.length }, truncate(text));
    })
  );

  server.registerTool(
    "avax_search_integrations",
    {
      title: "Search ecosystem integrations",
      description: "Find Avalanche ecosystem integrations (234 entries: oracles, bridges, indexers, RPC providers, wallets, account abstraction, x402, analytics…) by keyword or category. Offline. Returns name, category, chains available, website/docs links.",
      inputSchema: { query: z.string().min(2), limit: z.number().int().min(1).max(30).default(10) },
      annotations: LOCAL,
    },
    guard(async ({ query, limit }) => {
      const hits = searchDocs(query, { source: "integrations", limit });
      if (!hits.length) return fail(`No integrations matched "${query}".`, "Try a category word: oracle, bridge, indexer, rpc, wallet, explorer, analytics, gasless, x402.");
      const results = hits.map((h) => ({ name: h.title, url: h.url, path: h.path, snippet: h.text.slice(0, 300) }));
      return ok({ query, count: results.length, results }, results.map((r) => `- **${r.name}** — ${r.url}\n  ${r.snippet}`).join("\n"));
    })
  );
}
