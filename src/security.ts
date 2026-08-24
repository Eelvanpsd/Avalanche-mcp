/**
 * SSRF protection for user-supplied RPC URLs.
 *
 * The EVM tools accept a `network` that may be a raw http(s) URL, and viem
 * fetches it server-side. On a public deployment that is an open request proxy,
 * so custom URLs are gated and internal/private targets are always blocked.
 *
 * Policy:
 *  - AVAX_ALLOW_CUSTOM_RPC=false  → only built-in chains + AVAX_RPC_ALLOWLIST
 *    hosts are reachable. Set this on the hosted deployment.
 *  - default (unset/true)         → custom URLs allowed for local use, but
 *    loopback / private / link-local / cloud-metadata targets are still refused.
 */
// Read policy lazily (at call time) so it honors env set after module load —
// e.g. a hosted route that pins AVAX_ALLOW_CUSTOM_RPC before handling requests.
const allowCustomRpc = () => process.env.AVAX_ALLOW_CUSTOM_RPC !== "false";
const rpcAllowlist = () =>
  new Set(
    (process.env.AVAX_RPC_ALLOWLIST ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "metadata", "metadata.google.internal"]);

function ipToLong(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    const o = Number(part);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = n * 256 + o;
  }
  return n >>> 0;
}

/** True for loopback / private / link-local / CGNAT / metadata IP literals (v4 and common v6). */
function isPrivateIp(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  // IPv6
  if (h.includes(":")) {
    return h === "::1" || h === "::" || h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("::ffff:");
  }
  const n = ipToLong(h);
  if (n === null) return false;
  const inRange = (a: string, bits: number) => (n >>> (32 - bits)) === (ipToLong(a)! >>> (32 - bits));
  return (
    inRange("10.0.0.0", 8) ||
    inRange("172.16.0.0", 12) ||
    inRange("192.168.0.0", 16) ||
    inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) || // link-local incl. 169.254.169.254 metadata
    inRange("100.64.0.0", 10) || // CGNAT
    inRange("0.0.0.0", 8)
  );
}

/**
 * Validate a user-supplied RPC URL. Returns the normalized URL string, or
 * throws an actionable Error. Non-URL identifiers (built-in chain keys) should
 * be resolved before calling this.
 */
export function assertSafeRpcUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid RPC URL: "${raw}"`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`RPC URL must be http(s), got "${url.protocol}"`);
  }
  const host = url.hostname.toLowerCase();

  if (rpcAllowlist().has(host)) return url.toString();

  if (!allowCustomRpc()) {
    throw new Error(
      `Custom RPC URLs are disabled on this deployment. Use a built-in network (mainnet, fuji, or a known L1), or self-host the server to reach "${host}".`
    );
  }
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".internal") || host.endsWith(".local") || isPrivateIp(host)) {
    throw new Error(`Refusing to connect to internal/private host "${host}" (SSRF protection).`);
  }
  return url.toString();
}
