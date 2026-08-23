import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isAddress, parseEther } from "viem";
import { GUIDES, PRECOMPILES, ICM_ADDRESSES } from "../knowledge/guides.js";
import { searchDocs } from "../knowledge/index.js";
import { ok, fail, guard } from "../utils.js";

const LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const FEE_PRESETS = {
  low: { gasLimit: 8_000_000, targetGas: 15_000_000, minBaseFee: 25_000_000_000, baseFeeChangeDenominator: 36, minBlockGasCost: 0, maxBlockGasCost: 1_000_000, targetBlockRate: 2, blockGasCostStep: 200_000 },
  medium: { gasLimit: 15_000_000, targetGas: 15_000_000, minBaseFee: 25_000_000_000, baseFeeChangeDenominator: 36, minBlockGasCost: 0, maxBlockGasCost: 1_000_000, targetBlockRate: 2, blockGasCostStep: 200_000 },
  high: { gasLimit: 20_000_000, targetGas: 20_000_000, minBaseFee: 25_000_000_000, baseFeeChangeDenominator: 36, minBlockGasCost: 0, maxBlockGasCost: 1_000_000, targetBlockRate: 2, blockGasCostStep: 200_000 },
  gasless: { gasLimit: 15_000_000, targetGas: 15_000_000, minBaseFee: 0, baseFeeChangeDenominator: 36, minBlockGasCost: 0, maxBlockGasCost: 1_000_000, targetBlockRate: 2, blockGasCostStep: 200_000 },
};

const addr = z.string().refine(isAddress, "must be a 0x EVM address");

export function registerWorkflowTools(server: McpServer) {
  server.registerTool(
    "avax_get_guide",
    {
      title: "Get curated Avalanche guide",
      description:
        "Return a curated, condensed guide bundled with this server. Available: " +
        Object.entries(GUIDES).map(([k, g]) => `${k} (${g.summary})`).join("; ") +
        ". Prefer this for orientation, then avax_search_docs for details.",
      inputSchema: { name: z.enum(Object.keys(GUIDES) as [string, ...string[]]) },
      annotations: LOCAL,
    },
    guard(async ({ name }) => {
      const g = GUIDES[name];
      return ok({ name, title: g.title }, `# ${g.title}\n\n${g.body}`);
    })
  );

  server.registerTool(
    "avax_explain_precompile",
    {
      title: "Explain a Subnet-EVM precompile",
      description: "Reference card for one Subnet-EVM precompile: address, genesis config key, purpose, example genesis snippet, Solidity interface notes, plus the most relevant doc hits.",
      inputSchema: { name: z.enum(Object.keys(PRECOMPILES) as [string, ...string[]]) },
      annotations: LOCAL,
    },
    guard(async ({ name }) => {
      const p = PRECOMPILES[name as keyof typeof PRECOMPILES];
      const example: Record<string, unknown> =
        name === "WarpMessenger" ? { blockTimestamp: 0, quorumNumerator: 67 }
        : name === "RewardManager" ? { blockTimestamp: 0, adminAddresses: ["0xYourAdmin"], initialRewardConfig: { allowFeeRecipients: true } }
        : name === "NativeMinter" ? { blockTimestamp: 0, adminAddresses: ["0xYourAdmin"], initialMint: { "0xYourAdmin": "1000000000000000000000" } }
        : name === "FeeManager" ? { blockTimestamp: 0, adminAddresses: ["0xYourAdmin"], initialFeeConfig: FEE_PRESETS.medium }
        : { blockTimestamp: 0, adminAddresses: ["0xYourAdmin"], enabledAddresses: [] };
      const docs = searchDocs(`${name} precompile`, { limit: 4 }).map((h) => ({ title: h.title, url: h.url, path: h.path }));
      const iface = name === "WarpMessenger"
        ? "IWarpMessenger: sendWarpMessage(bytes payload) returns (bytes32 messageID); getVerifiedWarpMessage(uint32 index); getVerifiedWarpBlockHash(uint32 index); getBlockchainID()"
        : name === "NativeMinter"
          ? "INativeMinter is IAllowList: mintNativeCoin(address addr, uint256 amount)"
          : name === "FeeManager"
            ? "IFeeManager is IAllowList: setFeeConfig(gasLimit,targetBlockRate,minBaseFee,targetGas,baseFeeChangeDenominator,minBlockGasCost,maxBlockGasCost,blockGasCostStep); getFeeConfig(); getFeeConfigLastChangedAt()"
            : name === "RewardManager"
              ? "IRewardManager is IAllowList: setRewardAddress(address); allowFeeRecipients(); disableRewards(); currentRewardAddress(); areFeeRecipientsAllowed()"
              : "IAllowList: setAdmin(address); setManager(address); setEnabled(address); setNone(address); readAllowList(address) returns (uint256 role: 0 none,1 enabled,2 admin,3 manager)";
      return ok({ name, ...p, genesisExample: { config: { [p.configKey]: example } }, solidityInterface: iface, relatedDocs: docs });
    })
  );

  server.registerTool(
    "avax_generate_genesis",
    {
      title: "Generate Subnet-EVM genesis.json",
      description:
        "Generate a valid Subnet-EVM genesis.json for a new Avalanche L1. Choose a fee preset (low|medium|high|gasless) or override feeConfig, allocate initial balances, and enable precompiles (deployer allow-list, tx allow-list, native minter, fee manager, reward manager, warp). Warp is enabled by default because ICM/Teleporter needs it. Returns the JSON plus next-step CLI commands.",
      inputSchema: {
        chain_id: z.number().int().min(1).describe("Unique EVM chain ID (check chainlist.org; avoid 43113/43114)"),
        fee_preset: z.enum(["low", "medium", "high", "gasless"]).default("medium"),
        fee_config_overrides: z.record(z.string(), z.number()).optional().describe("Partial feeConfig keys to override"),
        allocations: z.array(z.object({ address: addr, amount: z.string().describe("Amount in whole tokens, e.g. '1000000'") })).default([]),
        admin_address: addr.optional().describe("Admin for every enabled precompile"),
        enable_deployer_allowlist: z.boolean().default(false),
        enable_tx_allowlist: z.boolean().default(false),
        enable_native_minter: z.boolean().default(false),
        enable_fee_manager: z.boolean().default(false),
        enable_reward_manager: z.boolean().default(false),
        reward_mode: z.enum(["burn", "fee_recipients", "reward_address"]).default("burn"),
        reward_address: addr.optional(),
        enable_warp: z.boolean().default(true),
        fund_teleporter_deployer: z.boolean().default(true).describe("Pre-fund the TeleporterMessenger deployer (needed so the CLI/you can deploy ICM)"),
      },
      annotations: LOCAL,
    },
    guard(async (a) => {
      if (a.chain_id === 43114 || a.chain_id === 43113) return fail("chain_id collides with the C-Chain.", "Pick an unused ID and verify on chainlist.org.");
      const anyPrecompile = a.enable_deployer_allowlist || a.enable_tx_allowlist || a.enable_native_minter || a.enable_fee_manager || a.enable_reward_manager;
      if (anyPrecompile && !a.admin_address) return fail("admin_address is required when enabling allow-list style precompiles.", "Provide the EOA that will administer the precompiles.");

      const feeConfig = { ...FEE_PRESETS[a.fee_preset], ...(a.fee_config_overrides ?? {}) };
      const config: Record<string, unknown> = {
        chainId: a.chain_id,
        homesteadBlock: 0, eip150Block: 0, eip155Block: 0, eip158Block: 0,
        byzantiumBlock: 0, constantinopleBlock: 0, petersburgBlock: 0, istanbulBlock: 0, muirGlacierBlock: 0,
        berlinBlock: 0, londonBlock: 0,
        feeConfig,
        allowFeeRecipients: a.enable_reward_manager && a.reward_mode === "fee_recipients",
      };
      const admins = a.admin_address ? [a.admin_address] : [];
      if (a.enable_deployer_allowlist) config[PRECOMPILES.ContractDeployerAllowList.configKey] = { blockTimestamp: 0, adminAddresses: admins };
      if (a.enable_tx_allowlist) config[PRECOMPILES.TransactionAllowList.configKey] = { blockTimestamp: 0, adminAddresses: admins };
      if (a.enable_native_minter) config[PRECOMPILES.NativeMinter.configKey] = { blockTimestamp: 0, adminAddresses: admins };
      if (a.enable_fee_manager) config[PRECOMPILES.FeeManager.configKey] = { blockTimestamp: 0, adminAddresses: admins };
      if (a.enable_reward_manager) {
        const initialRewardConfig =
          a.reward_mode === "fee_recipients" ? { allowFeeRecipients: true }
          : a.reward_mode === "reward_address" ? { rewardAddress: a.reward_address ?? a.admin_address }
          : {};
        config[PRECOMPILES.RewardManager.configKey] = { blockTimestamp: 0, adminAddresses: admins, initialRewardConfig };
      }
      if (a.enable_warp) config[PRECOMPILES.WarpMessenger.configKey] = { blockTimestamp: 0, quorumNumerator: 67 };

      const alloc: Record<string, { balance: string }> = {};
      for (const al of a.allocations) alloc[al.address.slice(2)] = { balance: "0x" + parseEther(al.amount).toString(16) };
      if (a.fund_teleporter_deployer) {
        alloc[ICM_ADDRESSES.deployerFundingAddress.address.slice(2)] = { balance: "0x" + parseEther("600").toString(16) };
      }
      const genesis = {
        config,
        alloc,
        nonce: "0x0", timestamp: "0x0", extraData: "0x00",
        gasLimit: "0x" + feeConfig.gasLimit.toString(16),
        difficulty: "0x0",
        mixHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        coinbase: "0x0000000000000000000000000000000000000000",
        number: "0x0", gasUsed: "0x0",
        parentHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      };
      const nextSteps = [
        "Save as genesis.json",
        `avalanche blockchain create myl1 --evm --genesis ./genesis.json --proof-of-authority --validator-manager-owner ${a.admin_address ?? "<owner>"}`,
        "avalanche blockchain deploy myl1 --local   # test",
        "avalanche blockchain deploy myl1 --fuji --key <key>   # testnet",
      ];
      const warnings: string[] = [];
      if (a.fee_preset === "gasless" && !a.enable_tx_allowlist) warnings.push("Gasless chain without TxAllowList is spam-prone.");
      if (a.enable_native_minter) warnings.push("NativeMinter admin controls total supply – use a multisig.");
      return ok({ genesis, nextSteps, warnings }, JSON.stringify(genesis, null, 2) + "\n\nNext steps:\n- " + nextSteps.join("\n- ") + (warnings.length ? "\n\nWarnings:\n- " + warnings.join("\n- ") : ""));
    })
  );

  server.registerTool(
    "avax_plan_l1_launch",
    {
      title: "Plan an L1 launch",
      description:
        "Produce a tailored, step-by-step launch plan for a new Avalanche L1 given the use case: consensus mode (PoA/PoS), validator count, gas/token choices, precompile recommendations, ICM, cost estimate and exact CLI commands. Use before avax_generate_genesis.",
      inputSchema: {
        use_case: z.string().describe("e.g. 'gaming chain with gasless txs', 'permissioned enterprise ledger', 'DeFi L1 with own token'"),
        target: z.enum(["local", "fuji", "mainnet"]).default("fuji"),
        validators: z.number().int().min(1).max(100).default(5),
        permissioned: z.boolean().optional().describe("Force PoA (true) or PoS (false); inferred from use case if omitted"),
        needs_icm: z.boolean().default(true),
      },
      annotations: LOCAL,
    },
    guard(async ({ use_case, target, validators, permissioned, needs_icm }) => {
      const uc = use_case.toLowerCase();
      const poa = permissioned ?? !/pos|proof of stake|permissionless|decentrali/.test(uc);
      const gasless = /gasless|free tx|no fee|sponsored/.test(uc);
      const enterprise = /enterprise|permissioned|kyc|private|consortium/.test(uc);
      const gaming = /game|gaming|nft/.test(uc);
      const defi = /defi|dex|lending|stable/.test(uc);

      const precompiles: string[] = ["WarpMessenger (required for ICM)"];
      if (enterprise) precompiles.push("TransactionAllowList (KYC'd senders)", "ContractDeployerAllowList (only approved deployers)");
      if (gasless) precompiles.push("TransactionAllowList or ContractDeployerAllowList (spam protection for gasless)", "FeeManager (raise fees later if needed)");
      if (gaming) precompiles.push("NativeMinter (mint in-game currency / gas to players)", "ContractDeployerAllowList (only studio deploys)");
      if (defi) precompiles.push("RewardManager (route fees to validators/treasury)", "FeeManager");
      if (!gaming && !enterprise && !defi && !gasless) precompiles.push("RewardManager (decide fee destination)", "FeeManager");

      const monthlyValidatorFeeAVAX = 1.33 * validators;
      const steps = [
        `1. Design: chainId (unique), token symbol, fee preset = ${gasless ? "gasless" : gaming ? "low" : "medium"}, ${poa ? "PoA (ValidatorManager owner = your multisig)" : "PoS (native token staking via NativeTokenStakingManager)"}.`,
        `2. avax_generate_genesis with the precompiles above (admin = multisig).`,
        `3. avalanche blockchain create <name> --evm --genesis genesis.json ${poa ? "--proof-of-authority --validator-manager-owner <addr>" : "--proof-of-stake"}${needs_icm ? " (answer 'yes' to ICM/relayer)" : ""}`,
        `4. avalanche blockchain deploy <name> --local → run integration tests (Foundry) against local RPC.`,
        target === "local" ? "5. Iterate locally; 'avalanche network clean' to reset." : `5. Provision ${validators} AvalancheGo nodes (avalanche node create … or your infra) tracking the subnet; open port 9651.`,
        target === "local" ? "" : `6. avalanche blockchain deploy <name> --${target} --key <key> (P-Chain key funded; ${target === "mainnet" ? "use --ledger" : "Fuji faucet"}).`,
        target === "local" ? "" : `7. avalanche blockchain addValidator <name> --${target} --node-id … --weight … --balance <AVAX> for each node (balance covers the continuous fee).`,
        needs_icm ? `8. ICM: verify TeleporterMessenger ${ICM_ADDRESSES.TeleporterMessenger.address} on the L1, run 'avalanche interchain relayer deploy' for L1↔C-Chain.` : "",
        "9. Ops: monitoring (avalanche node status), upgrade.json process for precompile changes, explorer (subnets.avax.network listing via Avalanche team / self-hosted Blockscout).",
        target === "mainnet" ? "10. Security: audit precompile admin keys, ValidatorManager owner multisig, relayer key funding, RPC rate limits." : "",
      ].filter(Boolean);
      return ok({
        useCase: use_case, target, consensus: poa ? "PoA" : "PoS", validators,
        recommendedPrecompiles: precompiles,
        costEstimate: { pChainContinuousFeeAVAXPerMonth: Number(monthlyValidatorFeeAVAX.toFixed(2)), note: "≈1.33 AVAX/validator/month post-Etna; plus node hosting; no 2000 AVAX stake required for L1 validators." },
        steps,
        readNext: ["avax_get_guide launch-l1", "avax_get_guide precompiles", needs_icm ? "avax_get_guide icm" : ""].filter(Boolean),
      });
    })
  );

  server.registerTool(
    "avax_icm_recipe",
    {
      title: "ICM/Teleporter integration recipe",
      description: "Return the addresses, blockchain-ID lookup steps, Solidity sender/receiver skeleton and relayer commands for sending ICM messages between two Avalanche chains.",
      inputSchema: {
        source: z.string().default("fuji").describe("Source chain: fuji | mainnet | dispatch-fuji | echo-fuji | <your L1 name>"),
        destination: z.string().default("dispatch-fuji"),
        payload_kind: z.enum(["message", "erc20", "native"]).default("message"),
      },
      annotations: LOCAL,
    },
    guard(async ({ source, destination, payload_kind }) => {
      const guide = GUIDES.icm.body;
      const registry = (n: string) => (n === "mainnet" ? ICM_ADDRESSES.TeleporterRegistry.mainnetCChain : n === "fuji" ? ICM_ADDRESSES.TeleporterRegistry.fujiCChain : "<from `avalanche blockchain describe`>");
      const ictt = payload_kind !== "message"
        ? `\n\n## Token transfer (${payload_kind})\n- Deploy \`${payload_kind === "native" ? "NativeTokenHome" : "ERC20TokenHome"}\` on ${source}, \`ERC20TokenRemote\` (or NativeTokenRemote) on ${destination}.\n- CLI: avalanche interchain tokenTransferrer deploy --home-blockchain ${source} --remote-blockchain ${destination}\n- Then \`send(SendTokensInput{destinationBlockchainID, destinationTokenTransferrerAddress, recipient, primaryFeeTokenAddress, primaryFee, secondaryFee, requiredGasLimit, multiHopFallback}, amount)\`.`
        : "";
      return ok(
        {
          source, destination, payload_kind,
          teleporterMessenger: ICM_ADDRESSES.TeleporterMessenger.address,
          registry: { source: registry(source), destination: registry(destination) },
          blockchainIdLookup: "avalanche blockchain describe <name> (hex blockchainID) — or avax_pchain_list_blockchains then convert CB58→hex",
          relayer: ["avalanche interchain relayer deploy", "avalanche interchain relayer logs"],
        },
        `# ICM recipe: ${source} → ${destination} (${payload_kind})\n\n${guide}${ictt}`
      );
    })
  );

  server.registerTool(
    "avax_troubleshoot",
    {
      title: "Troubleshoot an Avalanche error",
      description: "Given an error message or symptom (RPC error, CLI output, revert reason, ICM delivery issue), return likely causes, fixes, and matching documentation.",
      inputSchema: { error_text: z.string().min(3).max(4000), context: z.string().optional().describe("What you were doing: e.g. 'deploying L1 to Fuji with avalanche-cli'") },
      annotations: LOCAL,
    },
    guard(async ({ error_text, context }) => {
      const table = GUIDES.troubleshooting.body.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Symptom") && !l.startsWith("|---"));
      const words = error_text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      const scored = table
        .map((row) => ({ row, score: words.filter((w) => row.toLowerCase().includes(w)).length }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((r) => {
          const [, symptom, cause, fix] = r.row.split("|").map((s) => s.trim());
          return { symptom, cause, fix };
        });
      const docs = searchDocs(`${error_text.slice(0, 120)} ${context ?? ""}`, { limit: 5 }).map((h) => ({ title: h.title, heading: h.heading, url: h.url, path: h.path }));
      if (scored.length === 0 && docs.length === 0) return fail("No known pattern matched.", "Share the full error and the command/RPC call; try avax_search_docs with the key phrase.");
      return ok({ error: error_text.slice(0, 300), context: context ?? null, matches: scored, relatedDocs: docs });
    })
  );
}
