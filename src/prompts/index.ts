import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "avalanche_launch_l1",
    {
      title: "Launch an Avalanche L1",
      description: "Guided workflow: design, genesis, local test, Fuji/mainnet deploy, validators, ICM.",
      argsSchema: { use_case: z.string().describe("What the chain is for"), target: z.string().optional().describe("local | fuji | mainnet") },
    },
    ({ use_case, target }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are an Avalanche L1 launch engineer. Goal: launch an L1 for "${use_case}" targeting ${target ?? "fuji"}.
Steps:
1. Call avax_plan_l1_launch with the use case to get the recommended design.
2. Call avax_get_guide launch-l1 and avax_get_guide precompiles for reference.
3. Ask me for: chain ID, token symbol, admin/multisig address, allocations, validator count. Then call avax_generate_genesis.
4. Produce the exact avalanche-cli commands in order, explain each, and list what I must fund (P-Chain AVAX) using avax_pchain_get_stake_info for numbers.
5. If ICM is needed, call avax_icm_recipe for L1 ↔ C-Chain.
Cite doc URLs from avax_search_docs for every non-trivial claim.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "avalanche_deploy_contract",
    {
      title: "Deploy a Solidity contract to Avalanche",
      description: "Foundry/Hardhat deployment to C-Chain (Fuji/mainnet) or an L1, with verification and gas guidance.",
      argsSchema: { network: z.string().describe("fuji | mainnet | L1 key/RPC"), tool: z.string().optional().describe("foundry | hardhat") },
    },
    ({ network, tool }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Help me deploy a Solidity contract to Avalanche network "${network}" using ${tool ?? "foundry"}.
1. Call avax_list_networks / avax_get_chain_status for ${network} to confirm chain ID, RPC and current gas.
2. Give the ${tool ?? "foundry"} config (foundry.toml / hardhat.config) for this network, including evm_version notes for L1s.
3. Give deploy + verify commands (Snowtrace API for C-Chain; Blockscout for L1s).
4. After deploy, show how to confirm with avax_get_code and avax_get_transaction.
Use avax_search_docs for any uncertainty and cite URLs.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "avalanche_icm_bridge",
    {
      title: "Build an ICM cross-chain app",
      description: "Send messages or tokens between two Avalanche chains with Teleporter/ICTT.",
      argsSchema: { source: z.string(), destination: z.string(), kind: z.string().optional().describe("message | erc20 | native") },
    },
    ({ source, destination, kind }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Build a cross-chain ${kind ?? "message"} flow from ${source} to ${destination} on Avalanche.
1. avax_icm_recipe(source=${source}, destination=${destination}, payload_kind=${kind ?? "message"}).
2. Verify TeleporterMessenger exists on both chains with avax_get_code.
3. Write the sender & receiver contracts, Foundry deploy scripts, and the relayer setup.
4. Explain how to debug undelivered messages (avax_get_guide troubleshooting).`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "avalanche_learn",
    {
      title: "Learn an Avalanche topic",
      description: "Structured explanation of any Avalanche concept with citations.",
      argsSchema: { topic: z.string() },
    },
    ({ topic }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Explain "${topic}" on Avalanche for a developer. First call avax_get_guide architecture if the topic is foundational, then avax_search_docs("${topic}") and avax_get_doc on the best 1–2 results. Summarize with: what it is, when to use it, minimal code/config example, gotchas, and source URLs.`,
          },
        },
      ],
    })
  );
}
