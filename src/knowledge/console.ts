/**
 * Builder Console (build.avax.network/console) no-code flows and deep links.
 * Mirrors the hosted MCP's console_flow data; kept static so it works offline.
 */
export interface ConsoleFlow {
  key: string;
  title: string;
  summary: string;
  url: string;
  signs: boolean;
  network?: string;
}

export const CONSOLE_FLOWS: ConsoleFlow[] = [
  { key: "create-l1", title: "Create an L1 (Quick Build)", summary: "No-code creation of a new Avalanche L1: configure genesis, choose a validator manager, and deploy.", url: "https://build.avax.network/console/create-l1", signs: true },
  { key: "convert-to-l1", title: "Convert a subnet to an L1", summary: "Convert an existing subnet into a sovereign L1 by pointing it at a validator manager contract.", url: "https://build.avax.network/console/layer-1/create", signs: true },
  { key: "validator-manager", title: "Validator manager setup", summary: "Deploy and initialize the ACP-99 ValidatorManager (PoA or PoS) that governs an L1 validator set.", url: "https://build.avax.network/console/permissioned-l1s/validator-manager-setup", signs: true },
  { key: "ictt", title: "Interchain Token Transfer (ICTT)", summary: "Bridge ERC-20 or native tokens between Avalanche chains using Teleporter/ICM.", url: "https://build.avax.network/console/ictt/setup", signs: true },
  { key: "faucet", title: "Testnet faucet", summary: "Request Fuji testnet AVAX to fund a P-Chain or C-Chain address before deploying.", url: "https://build.avax.network/console/primary-network/faucet", signs: false },
  { key: "multisig", title: "Multisig / Safe", summary: "Set up a multisig to own validator manager / precompile admin roles.", url: "https://build.avax.network/console/utilities/multisig", signs: true },
  { key: "unit-converter", title: "AVAX unit converter", summary: "Convert between AVAX, nAVAX (gwei) and wei.", url: "https://build.avax.network/console/primary-network/unit-converter", signs: false },
  { key: "icm-relayer", title: "ICM relayer", summary: "Configure and run an ICM relayer for your L1 ↔ C-Chain routes.", url: "https://build.avax.network/console/icm/relayer", signs: false },
];

/** platform-cli: the newer scriptable CLI for P-Chain / L1 operations (complements avalanche-cli). */
export const PLATFORM_CLI = {
  install: "npm i -g @avalanche-sdk/platform-cli   # binary: `platform`",
  docs: "content/docs/tooling/platform-cli",
  commands: {
    keys: ["platform keys generate --name myKey", "platform keys import", "platform keys list"],
    subnet: ["platform subnet create --key-name myKey --network fuji", "platform subnet transfer-ownership --subnet-id <id> --new-owner P-fuji1... --key-name myKey", "platform subnet convert-to-l1 --subnet-id <id> --chain-id <evmChainId> --manager <0xValidatorManager> --validators <host:port>"],
    chain: ["platform chain create --subnet-id <id> --name myl1 --genesis genesis.json"],
    l1: ["platform l1 register-validator --balance <AVAX> --pop <hex> --message <warpHex>", "platform l1 set-weight ...", "platform l1 disable-validator ..."],
    node: ["platform node info <host:port>   # NodeID + BLS PoP"],
    staking: ["platform stake add-validator ...", "platform stake add-delegator ..."],
  },
};
