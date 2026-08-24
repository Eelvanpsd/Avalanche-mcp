import { assertSafeRpcUrl } from "../security.js";
/**
 * Canonical Avalanche network registry.
 * Agents can reference networks by short name ("mainnet", "fuji") or pass a raw RPC URL.
 */
export interface EvmChainInfo {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorer: string;
  nativeSymbol: string;
  faucet?: string;
  kind: "primary" | "l1";
  notes?: string;
}

export interface PrimaryNetworkInfo {
  name: string;
  networkId: number;
  hrp: string; // bech32 human-readable part for P/X addresses
  apiBase: string; // base URL for /ext/bc/P, /ext/bc/X, /ext/bc/C/rpc
  glacierNetwork: "mainnet" | "fuji";
  cChain: EvmChainInfo;
}

export const PRIMARY_NETWORKS: Record<"mainnet" | "fuji", PrimaryNetworkInfo> = {
  mainnet: {
    name: "Avalanche Mainnet",
    networkId: 1,
    hrp: "avax",
    apiBase: "https://api.avax.network",
    glacierNetwork: "mainnet",
    cChain: {
      name: "Avalanche C-Chain",
      chainId: 43114,
      rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
      explorer: "https://snowtrace.io",
      nativeSymbol: "AVAX",
      kind: "primary",
    },
  },
  fuji: {
    name: "Avalanche Fuji Testnet",
    networkId: 5,
    hrp: "fuji",
    apiBase: "https://api.avax-test.network",
    glacierNetwork: "fuji",
    cChain: {
      name: "Avalanche Fuji C-Chain",
      chainId: 43113,
      rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
      explorer: "https://testnet.snowtrace.io",
      nativeSymbol: "AVAX",
      faucet: "https://core.app/tools/testnet-faucet/ (coupon code often required; see docs)",
      kind: "primary",
    },
  },
};

/** Well-known Avalanche L1s (formerly subnets). Extend freely. */
export const KNOWN_L1S: Record<string, EvmChainInfo> = {
  dexalot: {
    name: "Dexalot L1",
    chainId: 432204,
    rpcUrl: "https://subnets.avax.network/dexalot/mainnet/rpc",
    explorer: "https://subnets.avax.network/dexalot",
    nativeSymbol: "ALOT",
    kind: "l1",
  },
  beam: {
    name: "Beam L1",
    chainId: 4337,
    rpcUrl: "https://build.onbeam.com/rpc",
    explorer: "https://subnets.avax.network/beam",
    nativeSymbol: "BEAM",
    kind: "l1",
  },
  dfk: {
    name: "DFK Chain (DeFi Kingdoms) L1",
    chainId: 53935,
    rpcUrl: "https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc",
    explorer: "https://subnets.avax.network/defi-kingdoms",
    nativeSymbol: "JEWEL",
    kind: "l1",
  },
  "dispatch-fuji": {
    name: "Dispatch L1 (Fuji testnet)",
    chainId: 779672,
    rpcUrl: "https://subnets.avax.network/dispatch/testnet/rpc",
    explorer: "https://subnets-test.avax.network/dispatch",
    nativeSymbol: "DIS",
    kind: "l1",
    notes: "Official ICM/Teleporter testnet L1 used in Avalanche interchain tutorials.",
  },
  "echo-fuji": {
    name: "Echo L1 (Fuji testnet)",
    chainId: 173750,
    rpcUrl: "https://subnets.avax.network/echo/testnet/rpc",
    explorer: "https://subnets-test.avax.network/echo",
    nativeSymbol: "ECH",
    kind: "l1",
    notes: "Official ICM/Teleporter testnet L1 used in Avalanche interchain tutorials.",
  },
};

export const ALL_EVM_CHAINS: Record<string, EvmChainInfo> = {
  mainnet: PRIMARY_NETWORKS.mainnet.cChain,
  "c-chain": PRIMARY_NETWORKS.mainnet.cChain,
  fuji: PRIMARY_NETWORKS.fuji.cChain,
  ...KNOWN_L1S,
};

/**
 * Resolve a user-supplied network identifier to an EVM chain.
 * Accepts: "mainnet" | "fuji" | known L1 key | http(s) RPC URL.
 * Custom URLs pass through the SSRF guard (see src/security.ts).
 */
export function resolveEvmChain(network: string): EvmChainInfo {
  const key = network.trim().toLowerCase();
  if (ALL_EVM_CHAINS[key]) return ALL_EVM_CHAINS[key];
  if (/^https?:\/\//i.test(network)) {
    const safe = assertSafeRpcUrl(network.trim());
    return {
      name: `Custom RPC (${new URL(safe).host})`,
      chainId: 0,
      rpcUrl: safe,
      explorer: "",
      nativeSymbol: "NATIVE",
      kind: "l1",
    };
  }
  throw new Error(
    `Unknown network "${network}". Use one of: ${Object.keys(ALL_EVM_CHAINS).join(", ")} or pass a full RPC URL (https://...).`
  );
}

export function resolvePrimaryNetwork(network: string): PrimaryNetworkInfo {
  const key = network.trim().toLowerCase();
  if (key === "mainnet" || key === "c-chain") return PRIMARY_NETWORKS.mainnet;
  if (key === "fuji" || key === "testnet") return PRIMARY_NETWORKS.fuji;
  throw new Error(`Primary-network operations support only "mainnet" or "fuji" (got "${network}").`);
}
