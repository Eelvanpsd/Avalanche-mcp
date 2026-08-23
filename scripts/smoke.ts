import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"] }));

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.length, tools.tools.map((t) => t.name).join(", "));
const res = await client.listResources();
const tpl = await client.listResourceTemplates();
console.log("RESOURCES:", res.resources.length, "TEMPLATES:", tpl.resourceTemplates.map((t) => t.uriTemplate).join(", "));
const prompts = await client.listPrompts();
console.log("PROMPTS:", prompts.prompts.map((p) => p.name).join(", "));

async function call(name: string, args: Record<string, unknown>) {
  const t0 = Date.now();
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
  console.log(`\n=== ${name} ${JSON.stringify(args)} [${Date.now() - t0}ms] isError=${r.isError ?? false}\n${text.slice(0, 600)}`);
}

await call("avax_list_topics", {});
await call("avax_search_docs", { query: "native minter precompile genesis", limit: 3 });
await call("avax_search_docs", { query: "convert subnet to L1", limit: 3 });
await call("avax_get_chain_status", { network: "fuji" });
await call("avax_get_balance", { address: "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC", network: "fuji" });
await call("avax_pchain_get_stake_info", { network: "fuji" });
await call("avax_pchain_get_validators", { network: "fuji", limit: 2 });
await call("avax_node_info", { network: "mainnet" });
await call("avax_data_list_chains", { network: "testnet" });
await call("avax_call_contract", { network: "mainnet", address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", signature: "function symbol() view returns (string)" });
await call("avax_generate_genesis", { chain_id: 99999, admin_address: "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC", enable_native_minter: true, allocations: [{ address: "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC", amount: "1000000" }] });
await call("avax_troubleshoot", { error_text: "insufficient funds for gas * price + value" });
await call("avax_get_code", { network: "fuji", address: "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf" });

const guide = await client.readResource({ uri: "avax://guides/icm" });
console.log("\n=== resource avax://guides/icm:", (guide.contents[0] as { text: string }).text.slice(0, 200));
await client.close();
