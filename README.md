<p align="center">
  <a href="https://avalanche-mcp.dev"><img src="https://raw.githubusercontent.com/Eelvanpsd/Avalanche-mcp/main/public/avalanche-mcp-logo.svg" alt="Avalanche MCP" width="420"></a>
</p>

<h1 align="center">Avalanche MCP</h1>

<p align="center">
  Avalanche, explained to your AI agent.<br>
  A Model Context Protocol server that gives Claude Code, Cursor, Claude Desktop and any MCP client the whole Avalanche stack — docs, ACPs, live chain data and L1 / ICM workflows.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/avalanche-mcp-server"><img alt="npm" src="https://img.shields.io/npm/v/avalanche-mcp-server?color=E84142&label=npm"></a>
  <a href="https://avalanche-mcp.dev"><img alt="hosted endpoint" src="https://img.shields.io/badge/hosted-avalanche--mcp.dev%2Fmcp-E84142"></a>
  <a href="https://modelcontextprotocol.io"><img alt="MCP" src="https://img.shields.io/badge/protocol-MCP-black"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-black"></a>
</p>

---

## Install

**Hosted — nothing to install.** Same shape as Ava Labs' `build.avax.network/api/mcp`: a public Streamable HTTP endpoint, no API key.

```bash
claude mcp add avalanche --transport http https://avalanche-mcp.dev/mcp
```

| Client | Configuration |
|---|---|
| **Claude Code** | Command above, or commit `.mcp.json`: `{ "mcpServers": { "avalanche": { "type": "http", "url": "https://avalanche-mcp.dev/mcp" } } }` |
| **Cursor / Windsurf** | `{ "mcpServers": { "avalanche": { "url": "https://avalanche-mcp.dev/mcp" } } }` |
| **Claude Desktop** | `{ "mcpServers": { "avalanche": { "command": "npx", "args": ["-y", "mcp-remote", "https://avalanche-mcp.dev/mcp"] } } }` |
| **Local / offline** | `claude mcp add avalanche -- npx -y avalanche-mcp-server` — runs on your machine over stdio, no rate limits |
| **Any HTTP client** | `curl -X POST https://avalanche-mcp.dev/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` |

Run `/mcp` in Claude Code to verify — you should see **avalanche · 41 tools**.

## What it does

Ask in plain language; the agent picks the tools and cites its sources.

```
› What changes in the Helicon upgrade for my C-Chain indexer?

⏺ avax_upgrade_lookup(query: "Helicon")
⏺ avax_acp_lookup(query: "ACP-194")
⏺ avax_get_doc(content/docs/primary-network/helicon-upgrade.mdx)

Helicon (AvalancheGo v1.15.0-fuji) is live on Fuji since 2026-07-28; mainnet is not
scheduled yet. ACP-194 Continuous Execution decouples consensus from execution, so a
block's state root settles after a τ delay (~5 s) — don't treat "latest" as executed
state. ACP-283 makes the minimum gas price dynamic, so never hardcode a fee floor.

Sources: build.avax.network/docs/primary-network/helicon-upgrade
         build.avax.network/docs/acps/194-continuous-execution
```

Other things to ask on day one:

- *"Plan a permissioned enterprise L1 on Fuji with five validators, then generate the genesis."*
- *"Explain the NativeMinter precompile and how to enable it after launch with upgrade.json."*
- *"Send a message from Fuji C-Chain to Dispatch with Teleporter, with relayer setup."*
- *"Which ACPs are activated, and what does ACP-176 change about gas?"*
- *"My CLI says `subnet not tracked` when I hit the RPC. What's wrong?"*

## Capabilities

**41 tools, every one read-only.** Nothing signs or broadcasts transactions.

| Area | Tools | What you get |
|---|---|---|
| **Knowledge** | 7 | Full-text search over a bundled index of build.avax.network (docs, Academy, 234 integrations, blog), Subnet-EVM precompile docs, ICM contracts, Avalanche CLI reference — 9.9k chunks, every hit with its source URL. Curated guides for architecture, L1 launch, precompiles, ICM, gas and troubleshooting. |
| **Protocol & upgrades** | 4 | All 36 ACPs with structured status / track / authors; the Banff → Helicon upgrade timeline with dates, versions and developer impact; live ACP signaling from nodes. |
| **Workflows** | 6 | Tailored L1 launch plans, valid `genesis.json` with the right precompiles, Teleporter sender/receiver recipes with real addresses, error triage, Builder Console deep links and platform-cli commands. |
| **Live EVM** | 8 | C-Chain, Fuji, known L1s or any RPC URL: balances, blocks, receipts, `eth_call`, gas estimation. |
| **P-Chain · X-Chain · node** | 8 | Validators, subnets and L1s, staking economics, tx status, UTXO balances, node and network info. |
| **Avalanche Data API** | 5 | Indexed chains, ERC-20 balances, transaction history, token metadata, L1 validators. |
| **Hosted federation** | 3 | Proxy to Ava Labs' official MCP for `build_plan` runbooks, CLI / RPC lookup and always-fresh search. |

Plus MCP **resources** (`avax://docs/{path}`, `avax://guides/{name}`, `avax://networks`) and **prompts** (`avalanche_launch_l1`, `avalanche_deploy_contract`, `avalanche_icm_bridge`, `avalanche_learn`). The full tool list is at [avalanche-mcp.dev/#tools](https://avalanche-mcp.dev/#tools) or via `tools/list`.

### Verified, not guessed

Facts that models commonly get wrong are pinned in code and checked against the docs: the C-Chain minimum base fee is **1 wei** since Fortuna (ACP-176), not 25 nAVAX; `subnet-evm` and `icm-contracts` now live in `avalanchego/graft` and `icm-services`; Helicon is Fuji-only as of August 2026. Every answer carries the build.avax.network or GitHub URL it came from.

## Knowledge sources

The index is built by `npm run build-index` from official repositories and ships inside the package, so the first search works offline:

| Source | Content |
|---|---|
| `ava-labs/builders-hub` | docs, Academy (L1 and blockchain tracks), integrations, blog |
| `avalanche-foundation/ACPs` | every ACP README, parsed into structured metadata |
| `ava-labs/avalanchego` | README, `docs/`, `RELEASES`, `graft/subnet-evm` precompile and plugin docs |
| `ava-labs/icm-services` | Teleporter / ICTT contracts, relayer, signature aggregator |
| `ava-labs/avalanche-cli`, `ava-labs/avalanche-starter-kit` | command reference, templates |

`avax_list_topics` reports the index build date so the agent knows how fresh it is; `avax_fetch_live_doc` fetches the current version of any page when that matters. Credential-shaped strings in documentation examples are redacted at build time.

## Configuration

No configuration is required. Optional environment variables (local mode):

| Variable | Purpose |
|---|---|
| `AVAX_DATA_API_KEY` | Higher rate limits for the Avalanche Data API tools. Free key at [build.avax.network](https://build.avax.network). (`GLACIER_API_KEY` is accepted as a legacy alias.) |
| `AVAX_DATA_API_URL` | Override the Data API base URL |
| `AVAX_HOSTED_MCP_URL` | Override the hosted Avalanche MCP endpoint used by `avax_hosted_*` |

## Self-hosting

Run the HTTP transport anywhere Node runs:

```bash
npx -y avalanche-mcp-server --http        # POST http://localhost:3333/mcp  (PORT to change)
```

Or mount it in any web-standard runtime — Next.js route handlers, Cloudflare Workers, Hono:

```ts
import { handleMcpRequest } from "avalanche-mcp-server";
export const POST = (req: Request) => handleMcpRequest(req);
```

This is exactly how [avalanche-mcp.dev](https://avalanche-mcp.dev) serves it ([source](https://github.com/Eelvanpsd/avalanche-mcp-web)). Responses are stateless JSON with CORS open, so browser-based clients work too.

## Works with the official Avalanche MCPs

Ava Labs' hosted MCP is always current for Builder Hub search, CLI / RPC lookup and runbooks; this server adds offline knowledge, structured ACPs and upgrades, live EVM tools and end-to-end workflows. They compose:

```bash
claude mcp add avalanche          --transport http https://avalanche-mcp.dev/mcp
claude mcp add avalanche-hosted   --transport http https://build.avax.network/api/mcp
claude mcp add avalanche-chainkit -- npx -y @avalanche-sdk/chainkit mcp-server
claude mcp add avalanche-avacloud -- npx -y @avalabs/avacloud-sdk mcp-server --apikey $AVACLOUD_API_KEY
```

`avax_hosted_call` already proxies the hosted server from inside this one, so a single registration covers most setups.

## Development

```bash
git clone https://github.com/Eelvanpsd/Avalanche-mcp.git && cd Avalanche-mcp
npm install && npm run build       # the index ships in the repo
npm run dev                        # stdio server via tsx
npm run inspect                    # MCP Inspector UI
npx tsx scripts/smoke.ts           # end-to-end tool check over stdio
REFRESH=1 npm run build-index      # re-download sources and rebuild the index
```

Extending it is one file each: curated guides in `src/knowledge/guides.ts`, the network registry in `src/config/networks.ts`, upgrade timeline in `src/knowledge/upgrades.ts`, new sources in `scripts/build-index.ts`.

## License

MIT. Avalanche MCP is an independent, community-built project and is not affiliated with or endorsed by Ava Labs or the Avalanche Foundation. Avalanche and the Avalanche mark are trademarks of their respective owners.
