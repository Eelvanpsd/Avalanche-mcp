import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ALL_EVM_CHAINS, PRIMARY_NETWORKS } from "../config/networks.js";
import { getDoc, listDocs } from "../knowledge/index.js";
import { GUIDES } from "../knowledge/guides.js";

export function registerResources(server: McpServer) {
  // avax://networks — static registry
  server.registerResource(
    "networks",
    "avax://networks",
    { title: "Avalanche network registry", description: "Chain IDs, RPC URLs, explorers, faucets for Mainnet, Fuji and known L1s.", mimeType: "application/json" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ primary: PRIMARY_NETWORKS, evm: ALL_EVM_CHAINS }, null, 2) }],
    })
  );

  // avax://guides/{name} — curated, hand-written quick guides bundled with the server
  server.registerResource(
    "guide",
    new ResourceTemplate("avax://guides/{name}", {
      list: async () => ({
        resources: Object.entries(GUIDES).map(([name, g]) => ({ uri: `avax://guides/${name}`, name, title: g.title, description: g.summary, mimeType: "text/markdown" })),
      }),
    }),
    { title: "Curated Avalanche guides", description: "Opinionated, agent-friendly quick guides (architecture, L1 launch, ICM, precompiles, troubleshooting).", mimeType: "text/markdown" },
    async (uri, { name }) => {
      const g = GUIDES[String(name)];
      if (!g) throw new Error(`Unknown guide "${name}". Available: ${Object.keys(GUIDES).join(", ")}`);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: `# ${g.title}\n\n${g.body}` }] };
    }
  );

  // avax://docs/{+path} — official docs by path
  server.registerResource(
    "doc",
    new ResourceTemplate("avax://docs/{+path}", {
      list: async () => ({
        resources: listDocs("content/docs", 400).map((d) => ({ uri: `avax://docs/${d.path}`, name: d.path, title: d.title, mimeType: "text/markdown" })),
      }),
    }),
    { title: "Official Avalanche documentation", description: "Indexed pages from build.avax.network and core repos.", mimeType: "text/markdown" },
    async (uri, { path }) => {
      const d = getDoc(String(path));
      if (!d) throw new Error(`No document at "${path}"`);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: `# ${d.doc.title}\n${d.doc.url}\n\n${d.body}` }] };
    }
  );
}
