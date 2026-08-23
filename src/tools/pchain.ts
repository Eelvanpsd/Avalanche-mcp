import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonRpc, pChainUrl, xChainUrl, infoUrl } from "../clients/rpc.js";
import { resolvePrimaryNetwork } from "../config/networks.js";
import { ok, guard } from "../utils.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const primaryParam = z.enum(["mainnet", "fuji"]).default("fuji").describe("Primary network: mainnet or fuji");

const nAvaxToAvax = (n: string | number) => (Number(n) / 1e9).toString();

export function registerPChainTools(server: McpServer) {
  server.registerTool(
    "avax_pchain_get_validators",
    {
      title: "List current validators (P-Chain)",
      description:
        "List current validators of the Primary Network or of a specific Subnet/L1 via platform.getCurrentValidators. Returns nodeID, stake, uptime, end time, delegation fee. Use subnet_id to inspect an L1's validator set; omit for Primary Network.",
      inputSchema: {
        network: primaryParam,
        subnet_id: z.string().optional().describe("Subnet ID (CB58). Omit for Primary Network."),
        node_ids: z.array(z.string()).optional().describe("Filter to these NodeID-... values"),
        limit: z.number().int().min(1).max(500).default(50),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ network, subnet_id, node_ids, limit }) => {
      const net = resolvePrimaryNetwork(network);
      const params: Record<string, unknown> = {};
      if (subnet_id) params.subnetID = subnet_id;
      if (node_ids?.length) params.nodeIDs = node_ids;
      const res = await jsonRpc<{ validators: Array<Record<string, unknown>> }>(pChainUrl(net.apiBase), "platform.getCurrentValidators", params);
      const all = res.validators ?? [];
      const validators = all.slice(0, limit).map((v) => ({
        nodeID: v.nodeID,
        stakeAmountAVAX: v.stakeAmount !== undefined ? nAvaxToAvax(v.stakeAmount as string) : (v.weight ?? null),
        weight: v.weight ?? null,
        startTime: v.startTime ? new Date(Number(v.startTime) * 1000).toISOString() : null,
        endTime: v.endTime ? new Date(Number(v.endTime) * 1000).toISOString() : null,
        uptime: v.uptime ?? null,
        connected: v.connected ?? null,
        delegationFee: v.delegationFee ?? null,
        validationID: v.validationID ?? null,
      }));
      return ok({ network: net.name, subnetId: subnet_id ?? "primary", total: all.length, returned: validators.length, validators });
    })
  );

  server.registerTool(
    "avax_pchain_get_subnet",
    {
      title: "Get Subnet / L1 info (P-Chain)",
      description:
        "Get Subnet details via platform.getSubnet: control keys, threshold, whether it has been converted to a sovereign L1 (isPermissioned=false), manager chain/address, and blockchains in the subnet.",
      inputSchema: { network: primaryParam, subnet_id: z.string().describe("Subnet ID (CB58)") },
      annotations: READ_ONLY,
    },
    guard(async ({ network, subnet_id }) => {
      const net = resolvePrimaryNetwork(network);
      const [subnet, chains] = await Promise.all([
        jsonRpc<Record<string, unknown>>(pChainUrl(net.apiBase), "platform.getSubnet", { subnetID: subnet_id }),
        jsonRpc<{ blockchains: Array<Record<string, unknown>> }>(pChainUrl(net.apiBase), "platform.getBlockchains", {}).catch(() => ({ blockchains: [] })),
      ]);
      const blockchains = (chains.blockchains ?? []).filter((b) => b.subnetID === subnet_id);
      return ok({ network: net.name, subnetId: subnet_id, ...subnet, blockchains });
    })
  );

  server.registerTool(
    "avax_pchain_list_blockchains",
    {
      title: "List blockchains (P-Chain)",
      description: "List all blockchains registered on the P-Chain (platform.getBlockchains) with their subnet and VM IDs. Supports name filtering and pagination.",
      inputSchema: {
        network: primaryParam,
        name_contains: z.string().optional().describe("Case-insensitive substring filter on chain name"),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ network, name_contains, limit, offset }) => {
      const net = resolvePrimaryNetwork(network);
      const res = await jsonRpc<{ blockchains: Array<{ id: string; name: string; subnetID: string; vmID: string }> }>(pChainUrl(net.apiBase), "platform.getBlockchains", {});
      let list = res.blockchains ?? [];
      if (name_contains) list = list.filter((b) => b.name.toLowerCase().includes(name_contains.toLowerCase()));
      const page = list.slice(offset, offset + limit);
      return ok({ network: net.name, total: list.length, count: page.length, offset, has_more: offset + limit < list.length, blockchains: page });
    })
  );

  server.registerTool(
    "avax_pchain_get_stake_info",
    {
      title: "Get staking parameters & supply (P-Chain)",
      description:
        "Return P-Chain staking economics: min validator/delegator stake, min/max stake durations, current supply, and total stake. Use when designing validator economics or answering 'how much AVAX do I need to validate?'.",
      inputSchema: { network: primaryParam },
      annotations: READ_ONLY,
    },
    guard(async ({ network }) => {
      const net = resolvePrimaryNetwork(network);
      const [minStake, supply, totalStake] = await Promise.all([
        jsonRpc<{ minValidatorStake: string; minDelegatorStake: string }>(pChainUrl(net.apiBase), "platform.getMinStake", {}),
        jsonRpc<{ supply: string }>(pChainUrl(net.apiBase), "platform.getCurrentSupply", {}),
        jsonRpc<{ stake: string; weighted: string }>(pChainUrl(net.apiBase), "platform.getTotalStake", {}).catch(() => null),
      ]);
      return ok({
        network: net.name,
        minValidatorStakeAVAX: nAvaxToAvax(minStake.minValidatorStake),
        minDelegatorStakeAVAX: nAvaxToAvax(minStake.minDelegatorStake),
        currentSupplyAVAX: nAvaxToAvax(supply.supply),
        totalStakedAVAX: totalStake ? nAvaxToAvax(totalStake.stake) : null,
        minStakeDurationDays: 14,
        maxStakeDurationDays: 365,
        note: "Stake durations are protocol constants (2 weeks to 1 year). L1 validators pay a continuous P-Chain fee instead of staking 2000 AVAX.",
      });
    })
  );

  server.registerTool(
    "avax_pchain_get_tx_status",
    {
      title: "Get P-Chain tx status",
      description: "Check a P-Chain transaction (platform.getTxStatus): Committed, Processing, Dropped, or Unknown, with reason when dropped. Use after AddSubnetValidator/ConvertSubnetToL1/CreateChain transactions.",
      inputSchema: { network: primaryParam, tx_id: z.string().describe("P-Chain tx ID (CB58)") },
      annotations: READ_ONLY,
    },
    guard(async ({ network, tx_id }) => {
      const net = resolvePrimaryNetwork(network);
      const res = await jsonRpc<Record<string, unknown>>(pChainUrl(net.apiBase), "platform.getTxStatus", { txID: tx_id });
      return ok({ network: net.name, txId: tx_id, ...res });
    })
  );

  server.registerTool(
    "avax_pchain_get_balance",
    {
      title: "Get P-Chain balance",
      description: "Get P-Chain balance of a P-addr (e.g. P-fuji1...): unlocked, locked stakeable, locked not stakeable. Needed before creating subnets/chains or adding validators.",
      inputSchema: { network: primaryParam, address: z.string().describe("P-Chain address, e.g. P-fuji1abc... or P-avax1abc...") },
      annotations: READ_ONLY,
    },
    guard(async ({ network, address }) => {
      const net = resolvePrimaryNetwork(network);
      const res = await jsonRpc<Record<string, string>>(pChainUrl(net.apiBase), "platform.getBalance", { addresses: [address] });
      const out: Record<string, unknown> = { network: net.name, address };
      for (const k of ["balance", "unlocked", "lockedStakeable", "lockedNotStakeable"]) {
        if (res[k] !== undefined) out[`${k}AVAX`] = nAvaxToAvax(res[k]);
      }
      return ok(out);
    })
  );

  server.registerTool(
    "avax_xchain_get_balance",
    {
      title: "Get X-Chain balance",
      description: "Get X-Chain AVAX (or any asset) balance for an X-addr (avm.getBalance).",
      inputSchema: {
        network: primaryParam,
        address: z.string().describe("X-Chain address, e.g. X-fuji1abc..."),
        asset_id: z.string().default("AVAX").describe("Asset ID or 'AVAX'"),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ network, address, asset_id }) => {
      const net = resolvePrimaryNetwork(network);
      const res = await jsonRpc<{ balance: string; utxoIDs: unknown[] }>(xChainUrl(net.apiBase), "avm.getBalance", { address, assetID: asset_id });
      return ok({ network: net.name, address, assetId: asset_id, balanceAVAX: asset_id === "AVAX" ? nAvaxToAvax(res.balance) : res.balance, utxoCount: res.utxoIDs?.length ?? 0 });
    })
  );

  server.registerTool(
    "avax_node_info",
    {
      title: "Get node / network info",
      description: "Query the public API node's info.* endpoints: node version, network ID/name, blockchain IDs for X/C/P, and tx fees (info.getTxFee). Useful to confirm which network you're on and current P-Chain fees.",
      inputSchema: { network: primaryParam },
      annotations: READ_ONLY,
    },
    guard(async ({ network }) => {
      const net = resolvePrimaryNetwork(network);
      const url = infoUrl(net.apiBase);
      const [version, networkName, xId, cId, fees] = await Promise.all([
        jsonRpc<Record<string, unknown>>(url, "info.getNodeVersion", {}),
        jsonRpc<{ networkName: string }>(url, "info.getNetworkName", {}),
        jsonRpc<{ blockchainID: string }>(url, "info.getBlockchainID", { alias: "X" }),
        jsonRpc<{ blockchainID: string }>(url, "info.getBlockchainID", { alias: "C" }),
        jsonRpc<Record<string, string>>(url, "info.getTxFee", {}).catch(() => null),
      ]);
      return ok({
        network: net.name,
        networkId: net.networkId,
        networkName: networkName.networkName,
        nodeVersion: version,
        blockchainIds: { P: "11111111111111111111111111111111LpoYY", X: xId.blockchainID, C: cId.blockchainID },
        txFeesNAVAX: fees,
      });
    })
  );
}
