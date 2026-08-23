import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { glacierGet } from "../clients/glacier.js";
import { resolveEvmChain } from "../config/networks.js";
import { ok, guard } from "../utils.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const chainIdParam = z
  .string()
  .default("43113")
  .describe("EVM chain ID as string (43114 mainnet C-Chain, 43113 Fuji) or a network key like 'fuji'");

function toChainId(v: string): string {
  if (/^\d+$/.test(v)) return v;
  return String(resolveEvmChain(v).chainId);
}

export function registerDataApiTools(server: McpServer) {
  server.registerTool(
    "avax_data_list_chains",
    {
      title: "List chains indexed by Avalanche Data API",
      description:
        "List every chain (C-Chain + L1s) indexed by the Avalanche Data API (Glacier), with chain ID, name, RPC, explorer, native token and whether it's testnet. Best way to discover L1s beyond the built-in registry.",
      inputSchema: { network: z.enum(["mainnet", "testnet"]).optional().describe("Filter by environment") },
      annotations: READ_ONLY,
    },
    guard(async ({ network }) => {
      const res = await glacierGet<{ chains: Array<Record<string, unknown>> }>("/chains", { network });
      const chains = (res.chains ?? []).map((c) => ({
        chainId: c.chainId,
        name: c.chainName,
        isTestnet: c.isTestnet,
        rpcUrl: c.rpcUrl,
        explorerUrl: c.explorerUrl,
        subnetId: c.subnetId,
        vmId: c.vmId,
        nativeToken: (c.networkToken as { symbol?: string } | undefined)?.symbol,
      }));
      return ok({ total: chains.length, chains });
    })
  );

  server.registerTool(
    "avax_data_list_erc20_balances",
    {
      title: "List ERC-20 balances",
      description: "List all ERC-20 token balances held by an address on a chain (Avalanche Data API). Returns token address, symbol, decimals, and balance.",
      inputSchema: { chain_id: chainIdParam, address: z.string(), page_size: z.number().int().min(1).max(100).default(50) },
      annotations: READ_ONLY,
    },
    guard(async ({ chain_id, address, page_size }) => {
      const cid = toChainId(chain_id);
      const res = await glacierGet<{ erc20TokenBalances: Array<Record<string, unknown>>; nextPageToken?: string }>(`/chains/${cid}/addresses/${address}/balances:listErc20`, { pageSize: page_size });
      const tokens = (res.erc20TokenBalances ?? []).map((t) => ({
        address: t.address,
        name: t.name,
        symbol: t.symbol,
        decimals: t.decimals,
        balance: t.balance,
        balanceValueUsd: t.balanceValue ? (t.balanceValue as { value?: number }).value : undefined,
      }));
      return ok({ chainId: cid, address, count: tokens.length, nextPageToken: res.nextPageToken ?? null, tokens });
    })
  );

  server.registerTool(
    "avax_data_list_transactions",
    {
      title: "List address transactions",
      description: "List recent transactions of an address on a chain (native + contract interactions) via Avalanche Data API. Paginated.",
      inputSchema: {
        chain_id: chainIdParam,
        address: z.string(),
        page_size: z.number().int().min(1).max(100).default(25),
        page_token: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ chain_id, address, page_size, page_token }) => {
      const cid = toChainId(chain_id);
      const res = await glacierGet<{ transactions: Array<Record<string, unknown>>; nextPageToken?: string }>(`/chains/${cid}/addresses/${address}/transactions`, { pageSize: page_size, pageToken: page_token });
      const txs = (res.transactions ?? []).map((t) => {
        const n = t.nativeTransaction as Record<string, unknown> | undefined;
        return {
          hash: n?.txHash,
          block: n?.blockNumber,
          timestamp: n?.blockTimestamp ? new Date(Number(n.blockTimestamp) * 1000).toISOString() : null,
          from: (n?.from as { address?: string })?.address,
          to: (n?.to as { address?: string })?.address,
          value: n?.value,
          status: n?.txStatus,
          method: (n?.method as { methodName?: string })?.methodName,
          erc20Transfers: (t.erc20Transfers as unknown[] | undefined)?.length ?? 0,
        };
      });
      return ok({ chainId: cid, address, count: txs.length, nextPageToken: res.nextPageToken ?? null, transactions: txs });
    })
  );

  server.registerTool(
    "avax_data_get_token_metadata",
    {
      title: "Get contract / token metadata",
      description: "Get metadata for a contract address (ERC-20/721/1155 type, name, symbol, decimals, deployment tx) via Avalanche Data API.",
      inputSchema: { chain_id: chainIdParam, address: z.string() },
      annotations: READ_ONLY,
    },
    guard(async ({ chain_id, address }) => {
      const cid = toChainId(chain_id);
      const res = await glacierGet<Record<string, unknown>>(`/chains/${cid}/addresses/${address}`);
      return ok({ chainId: cid, ...res });
    })
  );

  server.registerTool(
    "avax_data_list_l1_validators",
    {
      title: "List L1 validators (Data API)",
      description: "List sovereign L1 validators (post-Etna ACP-77) from the Data API, optionally filtered by subnet ID or node ID. Shows weight, balance, and remaining balance owner.",
      inputSchema: {
        network: z.enum(["mainnet", "fuji"]).default("fuji"),
        subnet_id: z.string().optional(),
        node_id: z.string().optional(),
        page_size: z.number().int().min(1).max(100).default(25),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ network, subnet_id, node_id, page_size }) => {
      const res = await glacierGet<{ validators: Array<Record<string, unknown>>; nextPageToken?: string }>(`/networks/${network}/l1Validators`, { subnetId: subnet_id, nodeId: node_id, pageSize: page_size });
      return ok({ network, count: res.validators?.length ?? 0, nextPageToken: res.nextPageToken ?? null, validators: res.validators ?? [] });
    })
  );
}
