import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatEther, formatGwei, isAddress, type Hex } from "viem";
import { getEvmClient } from "../clients/evm.js";
import { ALL_EVM_CHAINS } from "../config/networks.js";
import { ok, fail, guard } from "../utils.js";

const NETWORK_DESC = `Network: "mainnet" (C-Chain), "fuji" (testnet C-Chain), a known L1 key (${Object.keys(ALL_EVM_CHAINS).join(", ")}), or a full RPC URL.`;

const networkParam = z.string().default("fuji").describe(NETWORK_DESC);
const addressParam = z.string().describe("0x-prefixed 20-byte EVM address");

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export function registerEvmTools(server: McpServer) {
  server.registerTool(
    "avax_list_networks",
    {
      title: "List Avalanche networks",
      description:
        "List all networks this server knows: Avalanche Mainnet C-Chain, Fuji testnet, and well-known L1s, with chain IDs, RPC URLs, explorers and faucets. Call this first when unsure which `network` value to use.",
      inputSchema: {},
      annotations: { ...READ_ONLY, openWorldHint: false },
    },
    guard(async () => {
      const networks = Object.entries(ALL_EVM_CHAINS)
        .filter(([k]) => k !== "c-chain")
        .map(([key, c]) => ({ key, ...c }));
      return ok({ networks });
    })
  );

  server.registerTool(
    "avax_get_balance",
    {
      title: "Get native balance",
      description:
        "Get the native token balance (AVAX on C-Chain/Fuji, or the L1's native token) of an address on an Avalanche EVM chain.\n\n" +
        NETWORK_DESC +
        "\nReturns wei and a formatted value.",
      inputSchema: { address: addressParam, network: networkParam },
      outputSchema: {
        address: z.string(),
        network: z.string(),
        chainId: z.number(),
        symbol: z.string(),
        wei: z.string(),
        formatted: z.string(),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ address, network }) => {
      if (!isAddress(address)) return fail(`"${address}" is not a valid EVM address.`, "Use a 0x-prefixed 40-hex-char address.");
      const { client, chain } = getEvmClient(network);
      const wei = await client.getBalance({ address });
      return ok({
        address,
        network: chain.name,
        chainId: chain.chainId,
        symbol: chain.nativeSymbol,
        wei: wei.toString(),
        formatted: `${formatEther(wei)} ${chain.nativeSymbol}`,
      });
    })
  );

  server.registerTool(
    "avax_get_chain_status",
    {
      title: "Get chain status",
      description:
        "Get live status of an Avalanche EVM chain: reported chainId, latest block number, base fee, gas price. Useful to verify an RPC works and to pick gas settings.\n\n" + NETWORK_DESC,
      inputSchema: { network: networkParam },
      annotations: READ_ONLY,
    },
    guard(async ({ network }) => {
      const { client, chain } = getEvmClient(network);
      const [chainId, block, gasPrice] = await Promise.all([
        client.getChainId(),
        client.getBlock({ blockTag: "latest" }),
        client.getGasPrice(),
      ]);
      return ok({
        network: chain.name,
        configuredChainId: chain.chainId || null,
        reportedChainId: chainId,
        latestBlock: Number(block.number),
        blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        baseFeeGwei: block.baseFeePerGas ? formatGwei(block.baseFeePerGas) : null,
        gasPriceGwei: formatGwei(gasPrice),
        gasLimit: block.gasLimit.toString(),
        explorer: chain.explorer || null,
      });
    })
  );

  server.registerTool(
    "avax_get_block",
    {
      title: "Get block",
      description:
        "Fetch a block by number, hash, or tag ('latest'). Returns header fields and transaction hashes (set include_transactions=true for full tx objects).\n\n" + NETWORK_DESC,
      inputSchema: {
        network: networkParam,
        block: z.string().default("latest").describe("Block number (decimal), 0x-hash, or 'latest'"),
        include_transactions: z.boolean().default(false),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ network, block, include_transactions }) => {
      const { client } = getEvmClient(network);
      const b = block.startsWith("0x") && block.length === 66
        ? await client.getBlock({ blockHash: block as Hex, includeTransactions: include_transactions })
        : block === "latest"
          ? await client.getBlock({ blockTag: "latest", includeTransactions: include_transactions })
          : await client.getBlock({ blockNumber: BigInt(block), includeTransactions: include_transactions });
      return ok({
        number: Number(b.number),
        hash: b.hash,
        parentHash: b.parentHash,
        timestamp: new Date(Number(b.timestamp) * 1000).toISOString(),
        gasUsed: b.gasUsed.toString(),
        gasLimit: b.gasLimit.toString(),
        baseFeePerGas: b.baseFeePerGas?.toString() ?? null,
        txCount: b.transactions.length,
        transactions: b.transactions as unknown[],
      });
    })
  );

  server.registerTool(
    "avax_get_transaction",
    {
      title: "Get transaction",
      description: "Fetch a transaction and its receipt by hash (status, gas used, logs, contract address created).\n\n" + NETWORK_DESC,
      inputSchema: { network: networkParam, hash: z.string().describe("0x transaction hash") },
      annotations: READ_ONLY,
    },
    guard(async ({ network, hash }) => {
      const { client, chain } = getEvmClient(network);
      const tx = await client.getTransaction({ hash: hash as Hex });
      const receipt = await client.getTransactionReceipt({ hash: hash as Hex }).catch(() => null);
      return ok({
        hash,
        from: tx.from,
        to: tx.to,
        valueWei: tx.value.toString(),
        valueFormatted: formatEther(tx.value),
        nonce: tx.nonce,
        blockNumber: tx.blockNumber ? Number(tx.blockNumber) : null,
        status: receipt?.status ?? "pending",
        gasUsed: receipt?.gasUsed.toString() ?? null,
        effectiveGasPriceGwei: receipt ? formatGwei(receipt.effectiveGasPrice) : null,
        contractAddress: receipt?.contractAddress ?? null,
        logCount: receipt?.logs.length ?? 0,
        logs: receipt?.logs.slice(0, 50) ?? [],
        explorerUrl: chain.explorer ? `${chain.explorer}/tx/${hash}` : null,
      });
    })
  );

  server.registerTool(
    "avax_get_code",
    {
      title: "Get contract code / check if contract",
      description: "Return whether an address is a contract and its bytecode size (and bytecode prefix). Use to verify deployments.\n\n" + NETWORK_DESC,
      inputSchema: { network: networkParam, address: addressParam },
      annotations: READ_ONLY,
    },
    guard(async ({ network, address }) => {
      const { client } = getEvmClient(network);
      const code = await client.getCode({ address: address as Hex });
      const isContract = !!code && code !== "0x";
      return ok({ address, isContract, bytecodeBytes: isContract ? (code!.length - 2) / 2 : 0, bytecodePrefix: isContract ? code!.slice(0, 66) : null });
    })
  );

  server.registerTool(
    "avax_call_contract",
    {
      title: "Read contract (eth_call)",
      description:
        "Call a read-only (view/pure) contract function. Provide the function as a human-readable ABI signature, e.g. 'function balanceOf(address) view returns (uint256)', plus args.\n\n" + NETWORK_DESC,
      inputSchema: {
        network: networkParam,
        address: addressParam,
        signature: z.string().describe("Human-readable function ABI, e.g. 'function totalSupply() view returns (uint256)'"),
        args: z.array(z.union([z.string(), z.number(), z.boolean()])).default([]).describe("Arguments in order; big numbers as decimal strings"),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ network, address, signature, args }) => {
      const { parseAbi } = await import("viem");
      const { client } = getEvmClient(network);
      const abi = parseAbi([signature] as readonly string[]);
      const fnName = signature.replace(/^function\s+/, "").split("(")[0].trim();
      const result = await client.readContract({ address: address as Hex, abi, functionName: fnName, args });
      return ok({ address, function: fnName, result: JSON.parse(JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) });
    })
  );

  server.registerTool(
    "avax_estimate_gas",
    {
      title: "Estimate gas",
      description: "Estimate gas for a transaction (to, data, value, from). Also returns current base fee so the agent can compute a fee budget.\n\n" + NETWORK_DESC,
      inputSchema: {
        network: networkParam,
        from: addressParam.optional(),
        to: addressParam.optional(),
        data: z.string().optional().describe("0x calldata"),
        value_wei: z.string().optional().describe("Value in wei as decimal string"),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ network, from, to, data, value_wei }) => {
      const { client, chain } = getEvmClient(network);
      const [gas, gasPrice] = await Promise.all([
        client.estimateGas({
          account: (from ?? "0x0000000000000000000000000000000000000001") as Hex,
          to: to as Hex | undefined,
          data: data as Hex | undefined,
          value: value_wei ? BigInt(value_wei) : undefined,
        }),
        client.getGasPrice(),
      ]);
      const costWei = gas * gasPrice;
      return ok({ gas: gas.toString(), gasPriceGwei: formatGwei(gasPrice), estimatedCost: `${formatEther(costWei)} ${chain.nativeSymbol}` });
    })
  );
}
