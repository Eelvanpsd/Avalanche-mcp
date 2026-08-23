/**
 * Avalanche Primary Network upgrade timeline — structured, verified against
 * AvalancheGo RELEASES.md and build.avax.network upgrade pages (Aug 2026).
 * Each entry maps an upgrade to its ACPs, chains touched, versions and dates.
 */
export interface NetworkUpgrade {
  name: string;
  avalanchego: string;
  fuji?: string;      // ISO date or "TBD"
  mainnet: string;    // ISO date or "TBD"
  status: "Activated" | "Fuji only" | "Scheduled";
  chains: Array<"P-Chain" | "C-Chain" | "X-Chain" | "L1s">;
  acps: number[];
  summary: string;
  developerImpact: string[];
  docs: string[];
}

export const UPGRADES: NetworkUpgrade[] = [
  {
    name: "Banff",
    avalanchego: "v1.9.0",
    mainnet: "2022-10-18",
    status: "Activated",
    chains: ["P-Chain"],
    acps: [],
    summary: "Elastic (permissionless, PoS) Subnets: TransformSubnetTx, AddPermissionlessValidatorTx/DelegatorTx, custom staking tokens.",
    developerImpact: ["New P-Chain tx types for permissionless subnets", "Banff* block types on P-Chain"],
    docs: ["content/docs/rpcs/other/guides/banff-changes.mdx"],
  },
  {
    name: "Cortina",
    avalanchego: "v1.10.0",
    mainnet: "2023-04-25",
    status: "Activated",
    chains: ["X-Chain", "P-Chain", "C-Chain"],
    acps: [],
    summary: "X-Chain linearization (DAG → linear chain, Snowman consensus), P-Chain delegation batching, C-Chain block gas limit raised to 15M.",
    developerImpact: ["X-Chain now has blocks & block height (avm.getBlock)", "X-Chain tx ordering deterministic", "Higher C-Chain throughput"],
    docs: ["content/blog/cortina-x-chain-linearization.mdx"],
  },
  {
    name: "Durango",
    avalanchego: "v1.11.0",
    mainnet: "2024-03-06",
    status: "Activated",
    chains: ["C-Chain", "L1s", "P-Chain"],
    acps: [23, 24, 25, 30, 31],
    summary: "Avalanche Warp Messaging in the EVM (C-Chain + Subnet-EVM), Shanghai EIPs (PUSH0), P-Chain native transfers (BaseTx), subnet ownership transfer, VM application errors.",
    developerImpact: ["WarpMessenger precompile usable on C-Chain → ICM/Teleporter possible", "PUSH0 / Shanghai on C-Chain and Subnet-EVM", "TransferSubnetOwnershipTx"],
    docs: ["content/blog/durango-avalanche-warp-messaging.mdx", "content/docs/avalanche-l1s/precompiles/warp-messenger.mdx"],
  },
  {
    name: "Etna (Avalanche9000)",
    avalanchego: "v1.12.0",
    fuji: "2024-11-25",
    mainnet: "2024-12-16",
    status: "Activated",
    chains: ["P-Chain", "C-Chain", "L1s"],
    acps: [77, 103, 118, 125, 131, 151],
    summary: "Reinventing Subnets → sovereign L1s (ACP-77): no 2000 AVAX stake, continuous P-Chain fee (~1.33 AVAX/mo), ValidatorManager contracts; P-Chain dynamic fees; C-Chain min base fee 25 → 1 nAVAX; Cancun EIPs; Warp signature standard.",
    developerImpact: ["ConvertSubnetToL1Tx, RegisterL1ValidatorTx, SetL1ValidatorWeightTx", "ACP-99 ValidatorManager Solidity standard", "Cancun opcodes (TSTORE, MCOPY, blobhash stubs) on C-Chain/Subnet-EVM", "C-Chain fees ~25x cheaper"],
    docs: ["content/blog/etna-changes.mdx", "content/blog/etna-enhancing-sovereignty-avalanche-l1s.mdx", "content/academy/avalanche-l1/permissioned-l1s/02-proof-of-authority/05-etna-upgrade.mdx"],
  },
  {
    name: "Fortuna",
    avalanchego: "v1.13.0",
    mainnet: "2025-04-08",
    status: "Activated",
    chains: ["C-Chain"],
    acps: [176],
    summary: "Dynamic EVM gas limit and price discovery (ACP-176): min base fee → 1 wei, validators vote on gas target, no fixed upper bound.",
    developerImpact: ["Never hardcode gas price; use eth_baseFee / estimateFeesPerGas", "Gas limit can change over time (read block.gasLimit)"],
    docs: ["ACPs/176-dynamic-evm-gas-limit-and-price-discovery-updates/README.md", "content/docs/rpcs/c-chain/txn-fees.mdx"],
  },
  {
    name: "Granite",
    avalanchego: "v1.14.0",
    fuji: "2025-10-29",
    mainnet: "2025-11-19",
    status: "Activated",
    chains: ["P-Chain", "C-Chain", "L1s"],
    acps: [181, 204, 226],
    summary: "P-Chain epoched views (cheaper, more reliable ICM verification), secp256r1 precompile (passkeys/biometrics), dynamic minimum block times (sub-second blocks possible).",
    developerImpact: ["P256VERIFY precompile at 0x0000000000000000000000000000000000000100 (RIP-7212 style) on C-Chain & Subnet-EVM", "ICM relayers/validators use epoch-based validator sets", "L1s can lower min block time via ACP-226 config", "Plugin version 44 — all VMs must rebuild"],
    docs: ["content/blog/granite-upgrade.mdx", "ACPs/226-dynamic-minimum-block-times/README.md"],
  },
  {
    name: "Helicon",
    avalanchego: "v1.15.0-fuji",
    fuji: "2026-07-28",
    mainnet: "TBD",
    status: "Fuji only",
    chains: ["C-Chain", "P-Chain"],
    acps: [194, 236, 267, 273, 283, 285],
    summary: "C-Chain: Continuous / Streaming Asynchronous Execution (ACP-194, consensus decoupled from execution, state roots settle after a τ delay ≈5s) and dynamic minimum gas price (ACP-283). P-Chain: auto-renewed staking (ACP-236), uptime requirement 80% → 90% (ACP-267), min validator stake duration 2 weeks → 48h mainnet / 12h Fuji (ACP-273), MinConsumptionRate 10% → 7.5% ramped over 90 days (ACP-285).",
    developerImpact: [
      "State for a block is available only after execution settles (~τ) — don't assume eth_getBlockByNumber('latest') state is final; several C-Chain RPC namespaces deprecated (see v1.15.0-fuji notes)",
      "New P-Chain txs: AddAutoRenewedValidatorTx, SetAutoRenewedValidatorConfigTx, RewardAutoRenewedValidatorTx",
      "Validators starting after activation need ≥90% uptime for rewards (all-or-nothing, no slashing)",
      "Exchanges/custodians: quoted minimum staking period becomes 48h on mainnet at activation",
      "v1.15.0-fuji is Fuji-only and lacks C-Chain state sync post-Helicon",
    ],
    docs: ["content/docs/primary-network/helicon-upgrade.mdx", "content/blog/helicon-upgrade.mdx", "ACPs/194-continuous-execution/README.md", "ACPs/283-dynamic-minimum-gas-price/README.md", "content/docs/primary-network/validate/staking-for-finance-professionals.mdx"],
  },
];

export function findUpgrade(q: string): NetworkUpgrade | null {
  const s = q.toLowerCase();
  return UPGRADES.find((u) => u.name.toLowerCase().startsWith(s) || u.avalanchego.toLowerCase() === s) ?? UPGRADES.find((u) => u.acps.includes(Number(s.replace(/\D/g, "")))) ?? null;
}
