import { createPublicClient, http, type PublicClient } from "viem";
import { resolveEvmChain, type EvmChainInfo } from "../config/networks.js";

const cache = new Map<string, PublicClient>();

export function getEvmClient(network: string): { client: PublicClient; chain: EvmChainInfo } {
  const chain = resolveEvmChain(network);
  let client = cache.get(chain.rpcUrl);
  if (!client) {
    client = createPublicClient({ transport: http(chain.rpcUrl, { timeout: 15_000 }) });
    cache.set(chain.rpcUrl, client);
  }
  return { client, chain };
}
