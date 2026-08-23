/**
 * Avalanche Data API (formerly Glacier) client.
 * Works without a key for light usage; set AVAX_DATA_API_KEY (or legacy GLACIER_API_KEY)
 * for higher rate limits.
 */
const BASE = process.env.AVAX_DATA_API_URL ?? process.env.GLACIER_BASE_URL ?? "https://glacier-api.avax.network/v1";
const API_KEY = process.env.AVAX_DATA_API_KEY ?? process.env.GLACIER_API_KEY;

export async function glacierGet<T = unknown>(
  path: string,
  query: Record<string, string | number | undefined> = {}
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (API_KEY) headers["x-glacier-api-key"] = API_KEY;

  const res = await fetch(url, { headers });
  if (res.status === 429) {
    throw new Error(
      "Avalanche Data API rate limit hit. Set AVAX_DATA_API_KEY (free at https://build.avax.network/) or retry later."
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Data API ${res.status} for ${url.pathname}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}
