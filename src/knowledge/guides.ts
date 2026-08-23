/**
 * Curated, agent-oriented guides bundled with the server.
 * These complement the indexed docs with opinionated, condensed knowledge
 * and stable reference values. Keep them factual and cite the docs path.
 */
export interface Guide {
  title: string;
  summary: string;
  body: string;
}

export const PRECOMPILES = {
  ContractDeployerAllowList: { address: "0x0200000000000000000000000000000000000000", configKey: "contractDeployerAllowListConfig", doc: "content/docs/avalanche-l1s/precompiles/deployer-allowlist.mdx", purpose: "Restrict which addresses may deploy contracts (checks tx.origin)." },
  NativeMinter: { address: "0x0200000000000000000000000000000000000001", configKey: "contractNativeMinterConfig", doc: "content/docs/avalanche-l1s/precompiles/native-minter.mdx", purpose: "Mint native gas token to addresses; supports initialMint in genesis." },
  TransactionAllowList: { address: "0x0200000000000000000000000000000000000002", configKey: "txAllowListConfig", doc: "content/docs/avalanche-l1s/precompiles/transaction-allowlist.mdx", purpose: "Restrict which addresses may submit transactions (permissioned chain)." },
  FeeManager: { address: "0x0200000000000000000000000000000000000003", configKey: "feeManagerConfig", doc: "content/docs/avalanche-l1s/precompiles/fee-manager.mdx", purpose: "Change fee config (gasLimit, minBaseFee, targetGas …) at runtime without a network upgrade." },
  RewardManager: { address: "0x0200000000000000000000000000000000000004", configKey: "rewardManagerConfig", doc: "content/docs/avalanche-l1s/precompiles/reward-manager.mdx", purpose: "Decide where tx fees go: burn, fixed rewardAddress, or allowFeeRecipients (validators)." },
  WarpMessenger: { address: "0x0200000000000000000000000000000000000005", configKey: "warpConfig", doc: "content/docs/avalanche-l1s/precompiles/warp-messenger.mdx", purpose: "Avalanche Warp Messaging: send/verify BLS-aggregated cross-L1 messages. Required for ICM/Teleporter." },
} as const;

export const ICM_ADDRESSES = {
  TeleporterMessenger: { address: "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf", scope: "Same address on every chain & network (deployed via Nick's method)." },
  TeleporterRegistry: { mainnetCChain: "0x7C43605E14F391720e1b37E49C78C4b03A488d98", fujiCChain: "0xF86Cb19Ad8405AEFa7d09C778215D2Cb6eBfB228", note: "Registry address differs per chain; on your own L1 use the address Avalanche CLI prints after `avalanche blockchain deploy` (ICM enabled)." },
  deployerFundingAddress: { address: "0xE932784f56774879e03F3624fbeC6261154ec711", note: "TeleporterMessenger deployer EOA – must be pre-funded in genesis `alloc` (CLI does this automatically)." },
};

export const GUIDES: Record<string, Guide> = {
  architecture: {
    title: "Avalanche architecture in 2 minutes",
    summary: "Primary Network (P/X/C), L1s, VMs, consensus – the mental model every builder needs.",
    body: `## Primary Network
- **P-Chain (Platform)**: validator registry, staking, subnet/L1 creation, L1 validator management (ACP-77). JSON-RPC \`platform.*\` at \`/ext/bc/P\`.
- **C-Chain (Contract)**: EVM (Coreth). Chain ID **43114** mainnet / **43113** Fuji. RPC \`/ext/bc/C/rpc\`. This is where most dApps live.
- **X-Chain (Exchange)**: UTXO-based asset chain (\`avm.*\` at \`/ext/bc/X\`). Rarely needed by dApp devs.

## Avalanche L1s (formerly Subnets)
- An **L1** = sovereign blockchain with its own validator set, VM, gas token and rules. Since the **Etna upgrade (ACP-77, Dec 2024)** L1 validators no longer need to validate the Primary Network or stake 2000 AVAX; they pay a small continuous P-Chain fee (~1.33 AVAX/month/validator) and are managed by a **ValidatorManager** contract on the L1.
- "Subnet" now means the *permissioned* pre-conversion state; \`ConvertSubnetToL1Tx\` makes it sovereign.
- **Subnet-EVM** (in \`avalanchego/graft/subnet-evm\`) is the standard EVM VM for L1s with stateful **precompiles** (allow-lists, native minter, fee/reward manager, warp).
- **Custom VMs** are possible (Go via AvalancheGo SDK, or HyperSDK for high-performance custom chains).

## Cross-chain
- **AWM / Warp**: protocol-level BLS-aggregated messages between L1s (\`WarpMessenger\` precompile at 0x0200…05).
- **ICM / Teleporter**: Solidity messaging layer on top of Warp. \`TeleporterMessenger\` at **0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf** on every chain. Needs an **ICM relayer** (icm-services) to deliver messages.
- **ICTT** (Interchain Token Transfer): token bridges (ERC20/native ↔ ERC20/native) built on ICM.

## Consensus
Snowman (linear chains) / Avalanche (DAG) – sub-second finality, leaderless, repeated sub-sampled voting. Validators are weighted by stake (Primary) or arbitrary weight (L1).

## Key tooling
- **Avalanche CLI** (\`avalanche blockchain create|deploy|describe|addValidator\`) – local/Fuji/mainnet L1 lifecycle.
- **platform-cli** (\`platform subnet|chain|l1|keys|stake\`) – newer scriptable P-Chain/L1 CLI; **Builder Console** – no-code flows at build.avax.network/console.
- **ACPs** (Avalanche Community Proposals) define protocol upgrades: Etna = ACP-77/103/118/125…, Fortuna = ACP-176, Granite/Helicon = ACP-181/194/226/283… (avax_acp_list).
- **Avalanche SDK (JS)**, **viem/ethers**, **Foundry/Hardhat** on C-Chain & L1s.
- **Data API (Glacier)** – indexed balances, txs, NFTs, L1 validators.
- **Core wallet**, **Snowtrace** explorer, **subnets.avax.network** L1 explorer.

Read more: content/docs/primary-network, content/docs/avalanche-l1s, content/docs/cross-chain.`,
  },

  "launch-l1": {
    title: "Launching an Avalanche L1 – end-to-end",
    summary: "From `avalanche blockchain create` to a sovereign L1 on Fuji/mainnet, with validators and ICM.",
    body: `## 0. Prerequisites
- Install CLI: \`curl -sSfL https://raw.githubusercontent.com/ava-labs/avalanche-cli/main/scripts/install.sh | sh -s\`
- Fuji AVAX on a **P-Chain** address (the CLI's \`ewoq\` key is for local only). Faucet: https://core.app/tools/testnet-faucet/ (select P-Chain → or bridge C→P in Core).
- Docker (optional) for local network; Go not required unless building custom VMs.

## 1. Create the blockchain config
\`\`\`bash
avalanche blockchain create myl1
# interactive: Subnet-EVM → chainId (unique, check chainlist) → token symbol →
# gas preset (low/medium/high/custom) → airdrop → precompiles
\`\`\`
Flags for non-interactive: \`--evm --evm-chain-id 12345 --evm-token MYT --evm-defaults --proof-of-authority|--proof-of-stake --validator-manager-owner <addr>\`
Config lands in \`~/.avalanche-cli/subnets/myl1/\` (genesis.json, sidecar.json).

## 2. Test locally
\`\`\`bash
avalanche blockchain deploy myl1 --local
avalanche blockchain describe myl1      # RPC URL, chain ID, funded keys
avalanche network stop / start / clean
\`\`\`

## 3. Deploy to Fuji (creates Subnet + Chain + converts to L1)
\`\`\`bash
avalanche key create mykey              # or import
avalanche key list --fuji               # fund the P-Chain address shown
avalanche blockchain deploy myl1 --fuji --key mykey \\
  --bootstrap-endpoints <node-rpc> ...   # or let CLI spin up nodes (--use-local-machine / cloud)
\`\`\`
What happens: CreateSubnetTx → CreateChainTx → ConvertSubnetToL1Tx (sets ValidatorManager on the chain). CLI then initializes the PoA/PoS ValidatorManager contract and (if enabled) deploys ICM (TeleporterMessenger + Registry) and starts a relayer.

## 4. Validators
- **Need AvalancheGo nodes tracking the L1**: \`--track-subnets <subnetID>\` config flag, plus the VM binary in plugins dir. CLI: \`avalanche node create\` (cloud) or \`avalanche node local start\`.
- Register: \`avalanche blockchain addValidator myl1 --fuji --node-id NodeID-… --bls-public-key … --bls-proof-of-possession … --weight 20 --balance 1\` (balance = AVAX deposited for the continuous fee).
- Remove / change weight: \`avalanche blockchain removeValidator\`, \`changeWeight\`.

## 5. Wire up the app
- Add network to wallet: RPC from \`describe\`, chain ID, symbol.
- Foundry: \`forge create --rpc-url <rpc> --private-key <pk> src/X.sol:X\`
- ICM to C-Chain: see guide \`icm\`.

## Alternatives to avalanche-cli
- **Builder Console (no-code)**: https://build.avax.network/console/create-l1 → genesis, validator manager, deploy with a connected wallet; convert-to-l1, validator-manager, ICTT and faucet flows too (avax_console_flows).
- **platform-cli (scriptable)**: \`platform subnet create\` → \`platform chain create --genesis genesis.json\` → \`platform subnet convert-to-l1 --chain-id <id> --manager <0x…> --validators <host:port>\` → \`platform l1 register-validator\`. Docs: content/docs/tooling/platform-cli. Hosted MCP \`build_plan\` (via avax_hosted_call) generates a full runbook.

## 6. Going to mainnet
Same commands with \`--mainnet\`; use a Ledger (\`--ledger\`) for the P-Chain control keys; budget ≥ 5+ validators, monitoring (\`avalanche node status\`), and the P-Chain fee balance for each validator.

Docs: content/docs/tooling/avalanche-cli/create-deploy-avalanche-l1s, content/docs/avalanche-l1s/validator-manager, content/academy/avalanche-l1.`,
  },

  precompiles: {
    title: "Subnet-EVM stateful precompiles",
    summary: "Addresses, genesis keys and when to use each of the 6 built-in precompiles.",
    body:
      `| Precompile | Address | Genesis key | Use |\n|---|---|---|---|\n` +
      Object.entries(PRECOMPILES)
        .map(([n, p]) => `| ${n} | \`${p.address}\` | \`${p.configKey}\` | ${p.purpose} |`)
        .join("\n") +
      `

## AllowList roles (shared by DeployerAllowList, TxAllowList, NativeMinter, FeeManager, RewardManager)
- **Admin** (2): can set any role. **Manager** (3): can set Enabled/None. **Enabled** (1): can use the precompile. **None** (0).
- Interface: \`setAdmin(addr)\`, \`setManager(addr)\`, \`setEnabled(addr)\`, \`setNone(addr)\`, \`readAllowList(addr) → uint256\`.
- Genesis: \`{"<configKey>": {"blockTimestamp": 0, "adminAddresses": [..], "managerAddresses": [..], "enabledAddresses": [..]}}\`

## Activation & upgrades
- In genesis: put config under \`config\` with \`blockTimestamp: 0\`.
- Later: \`upgrade.json\` with \`precompileUpgrades: [{ "<configKey>": { "blockTimestamp": <future unix>, ... } }]\` placed in each node's chain config dir; all validators must apply before the timestamp. To disable: \`{"<configKey>": {"blockTimestamp": T, "disable": true}}\`. CLI: \`avalanche blockchain upgrade generate|apply\`.

## Gotchas
- DeployerAllowList checks **tx.origin**, so factories work for allow-listed senders.
- NativeMinter \`mintNativeCoin(to, amount)\` – amount in wei; admin key = total supply control, guard it.
- FeeManager changes take effect next block; keep \`gasLimit == targetGas\` for stable base fee.
- WarpMessenger \`quorumNumerator\` default 67 (%). Required for ICM.

Docs: content/docs/avalanche-l1s/precompiles, content/docs/avalanche-l1s/upgrade/precompile-upgrades.mdx`,
  },

  icm: {
    title: "ICM / Teleporter cross-chain messaging",
    summary: "Send a message or tokens between C-Chain and an L1 (or L1↔L1) with Teleporter, with addresses and a Solidity recipe.",
    body: `## Components
- **Warp precompile** (0x0200…05) – must be enabled on both chains (C-Chain has it).
- **TeleporterMessenger**: \`${ICM_ADDRESSES.TeleporterMessenger.address}\` (identical everywhere).
- **TeleporterRegistry**: mainnet C-Chain \`${ICM_ADDRESSES.TeleporterRegistry.mainnetCChain}\`, Fuji C-Chain \`${ICM_ADDRESSES.TeleporterRegistry.fujiCChain}\`; your L1: from \`avalanche blockchain describe\`.
- **Relayer** (icm-services \`icm-relayer\`): watches source chain, aggregates BLS signatures, delivers to destination. CLI: \`avalanche interchain relayer deploy|start|stop|logs\`.
- **Blockchain IDs** are 32-byte values (hex form of the CB58 blockchainID) – get them via \`avalanche blockchain describe\` or avax_pchain_list_blockchains + conversion.

## Fuji testnet playground
Official ICM-enabled test L1s: **Dispatch** (chain 779672, rpc https://subnets.avax.network/dispatch/testnet/rpc) and **Echo** (173750). Both relay to/from Fuji C-Chain.

## Minimal sender (Solidity, Foundry)
\`\`\`solidity
// forge install ava-labs/icm-contracts  (or icm-services/contracts)
import {ITeleporterMessenger, TeleporterMessageInput, TeleporterFeeInfo} from "@teleporter/ITeleporterMessenger.sol";

contract Sender {
    ITeleporterMessenger constant T = ITeleporterMessenger(0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf);
    function send(bytes32 destBlockchainID, address destAddr, string calldata msg_) external {
        T.sendCrossChainMessage(TeleporterMessageInput({
            destinationBlockchainID: destBlockchainID,
            destinationAddress: destAddr,
            feeInfo: TeleporterFeeInfo({feeTokenAddress: address(0), amount: 0}),
            requiredGasLimit: 100000,
            allowedRelayerAddresses: new address[](0),
            message: abi.encode(msg_)
        }));
    }
}
\`\`\`
## Receiver
\`\`\`solidity
import {ITeleporterReceiver} from "@teleporter/ITeleporterReceiver.sol";
contract Receiver is ITeleporterReceiver {
    string public last;
    function receiveTeleporterMessage(bytes32, address, bytes calldata message) external {
        require(msg.sender == 0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf, "only teleporter");
        last = abi.decode(message, (string));
    }
}
\`\`\`
Production contracts should extend \`TeleporterRegistryOwnableApp\` (upgradeable-version aware) instead of hardcoding the messenger.

## Token transfer (ICTT)
Use \`TokenHome\` (source) + \`TokenRemote\` (destination) contracts from icm-services/contracts/ictt. CLI helper: \`avalanche interchain tokenTransferrer deploy\`. Fee token for relayer can be any ERC20.

## Debugging
- Message stuck → relayer not running or not configured for that source/dest pair; check \`avalanche interchain relayer logs\`.
- \`receiveCrossChainMessage\` reverts with "invalid warp message" → Warp not enabled or quorum unmet (validators offline).
- Destination needs gas: relayer pays; fund relayer address on dest chain.

Docs: content/docs/cross-chain, content/academy/avalanche-l1 (interchain messaging course), icm:contracts.`,
  },

  troubleshooting: {
    title: "Common Avalanche dev errors & fixes",
    summary: "Fast lookup of frequent failures on C-Chain, L1s, CLI, ICM and RPC.",
    body: `| Symptom | Likely cause | Fix |
|---|---|---|
| \`insufficient funds for gas * price + value\` on Fuji | No test AVAX | Faucet (core.app/tools/testnet-faucet, may need coupon from Avalanche Discord/Academy) or ask avax_get_balance first |
| \`transaction underpriced\` / \`max fee per gas less than block base fee\` | Stale/hardcoded gas price; C-Chain base fee is dynamic (min 1 wei since ACP-176) and can spike | Read current fee via avax_get_chain_status / viem \`estimateFeesPerGas\`; set maxFeePerGas ≥ 2×baseFee + priority |
| \`nonce too low\` | Wallet cached nonce / pending tx | Fetch \`getTransactionCount(addr,'pending')\`; replace with higher fee |
| \`chainId mismatch\` / MetaMask "wrong network" | RPC chain ID ≠ wallet config | avax_get_chain_status to read real chainId |
| CLI: \`subnet not tracked\` / RPC 404 | Node not tracking L1 | AvalancheGo \`--track-subnets=<subnetID>\` + VM binary in plugins dir; restart |
| CLI: \`insufficient P-Chain balance\` | Need AVAX on **P**-Chain, not C | Core wallet C→P cross-chain transfer or \`avalanche key transfer\` |
| \`ConvertSubnetToL1\` fails: "not a subnet owner" | Wrong control key | Use the key that created the subnet (\`avalanche key list\`) |
| \`addValidator\` fails: BLS key missing | Node < v1.11 or no staking key | Use \`info.getNodeID\` → includes BLS pubkey + PoP; update AvalancheGo |
| Validator shows \`connected: false\` | Port 9651 blocked / bootstrapping | Open 9651 TCP; check \`avalanche node status\`; wait for bootstrap |
| ICM message never arrives | No relayer for that route | \`avalanche interchain relayer deploy\` / check config includes both chains + funded key |
| \`execution reverted\` on precompile call | Caller lacks Admin/Manager/Enabled | \`readAllowList(addr)\` on the precompile; have admin \`setEnabled\` |
| Foundry: \`EvmError: NotActivated\` / PUSH0 | L1 built with old Subnet-EVM (pre-Durango) | \`--evm-version paris\` in foundry.toml or upgrade VM |
| Data API 429 | Rate limit | Set AVAX_DATA_API_KEY |
| \`eth_getLogs\` range too large | Public RPC caps ~2048 blocks | Chunk ranges; or use avax_data_list_transactions |

Public RPC limits: api.avax.network is rate-limited & not for production indexing – run your own node (\`avalanche node create\`) or use a provider.`,
  },

  "gas-and-fees": {
    title: "Gas, fees & feeConfig",
    summary: "How fees work on C-Chain vs L1s and how to pick feeConfig values in genesis.",
    body: `## C-Chain
EIP-1559 style dynamic base fee, **burned**. History of the minimum base fee:
- 25 nAVAX until Etna (Dec 16, 2024) → 1 nAVAX (ACP-125) → **1 wei since Fortuna, Apr 8, 2025 (ACP-176)**, no upper bound; under normal load it sits well below 1 nAVAX.
- ACP-176 also made the gas limit/target dynamic (validators vote on the target). Fuji currently reports a 32M gas limit.
- **Helicon / ACP-283** (Fuji since Jul 28, 2026; mainnet TBD): minimum gas price becomes a stake-weighted validator preference, starting at 1 wei.
Never hardcode 25 gwei: use \`eth_baseFee\` / \`eth_maxPriorityFeePerGas\` (viem \`estimateFeesPerGas\`) or avax_get_chain_status.

## L1 (Subnet-EVM) \`feeConfig\` (genesis \`config.feeConfig\`, changeable via FeeManager precompile)
| key | meaning | default (medium) |
|---|---|---|
| gasLimit | max gas per block | 15,000,000 |
| targetGas | gas the chain targets per \`targetBlockRate\` window | 15,000,000 |
| minBaseFee | floor for base fee (wei) | 25,000,000,000 (25 gwei) |
| baseFeeChangeDenominator | how fast base fee moves (bigger = slower) | 36 |
| minBlockGasCost / maxBlockGasCost | block production cost bounds | 0 / 1,000,000 |
| targetBlockRate | seconds between blocks targeted | 2 |
| blockGasCostStep | change step of block gas cost | 200,000 |

Presets in CLI: **low** (8M gas, 25 gwei), **medium** (15M), **high** (20M). Gasless chains: set \`minBaseFee: 0\` (be careful of spam; pair with TxAllowList).

## Who gets fees on an L1?
Default: burned. \`allowFeeRecipients: true\` + node \`feeRecipient\` config → validators. Or RewardManager precompile → \`rewardAddress\`.

Docs: content/docs/avalanche-l1s/evm-configuration/customize-avalanche-l1.mdx, content/docs/avalanche-l1s/precompiles/fee-manager.mdx`,
  },
};
