import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDocsTools } from "./tools/docs.js";
import { registerEvmTools } from "./tools/evm.js";
import { registerPChainTools } from "./tools/pchain.js";
import { registerDataApiTools } from "./tools/data-api.js";
import { registerWorkflowTools } from "./tools/workflows.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";
import { loadKnowledge } from "./knowledge/index.js";

export const SERVER_NAME = "avalanche-mcp-server";
export const SERVER_VERSION = "0.1.0";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: `Avalanche developer guide MCP. Use it to build on Avalanche (C-Chain, Fuji, Avalanche L1s/Subnet-EVM, P-Chain, ICM/Teleporter, Avalanche CLI).

Start with:
- avax_get_guide (architecture | launch-l1 | precompiles | icm | gas-and-fees | troubleshooting) for orientation
- avax_search_docs for any factual question, then avax_get_doc to read the page
- avax_list_networks + avax_get_chain_status before touching a chain
Live data tools (avax_get_*, avax_pchain_*, avax_data_*) are read-only and hit public RPC/Data API endpoints. Workflow tools (avax_plan_l1_launch, avax_generate_genesis, avax_icm_recipe, avax_troubleshoot) compose knowledge into actionable plans. Always cite doc URLs returned by the tools.`,
    }
  );

  loadKnowledge();
  registerDocsTools(server);
  registerWorkflowTools(server);
  registerEvmTools(server);
  registerPChainTools(server);
  registerDataApiTools(server);
  registerResources(server);
  registerPrompts(server);
  return server;
}
