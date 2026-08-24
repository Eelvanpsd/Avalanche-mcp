/**
 * SOCI4L public Avalanche data endpoints (https://soci4l.net/avalanche) — no key required.
 * SOCI4L snapshots the Ava Labs Metrics API daily and re-serves it with cleaned rollups,
 * an L1 ranking table (with concentration / automated-traffic reads) and a staking series
 * cross-checked against the P-Chain. We use it instead of metrics.avax.network directly:
 * it is a single fast call per dataset and not subject to the upstream rate limit.
 */
const SOCI4L_BASE = process.env.SOCI4L_API_URL ?? "https://soci4l.net/api/avalanche";
export const SOCI4L_PAGE = "https://soci4l.net/avalanche";

export const CHAIN_METRICS = [
  "txCount",
  "activeAddresses",
  "activeSenders",
  "feesPaid",
  "gasUsed",
  "avgTps",
  "maxTps",
  "avgGps",
  "maxGps",
  "cumulativeTxCount",
  "cumulativeAddresses",
  "cumulativeContracts",
  "cumulativeDeployers",
] as const;
export type ChainMetric = (typeof CHAIN_METRICS)[number];

export const STAKING_FIELDS = ["validatorCount", "totalStakeAvax", "selfStakeAvax", "delegatedStakeAvax", "delegatorCount"] as const;
export type StakingField = (typeof STAKING_FIELDS)[number];

export type Range = "30d" | "90d" | "1y" | "all";
export type Interval = "day" | "week" | "month";

export interface SeriesPoint {
  day: string; // YYYY-MM-DD (period start for week/month)
  value: number;
  complete: boolean;
}

export interface MetricSeries {
  chainId: string;
  metric: string;
  label: string;
  description: string;
  unit: string;
  cumulative: boolean;
  interval: Interval;
  range: Range;
  source: string;
  note?: string;
  points: number;
  lastPeriodComplete: boolean;
  fetchedAt: string;
  series: SeriesPoint[];
}

export interface L1Row {
  rank: number;
  evmChainId: string;
  chainName: string;
  tokenSymbol?: string;
  explorerUrl?: string;
  value: number;
  sharePct: number;
  changePct: number | null;
  rhythm?: string; // steady | regular | intermittent
  concentration?: string; // broad | mixed | concentrated
  txPerSender?: number | null;
  automatedSharePct?: number | null;
  observedSenders?: number;
  observedBlocks?: number;
}

export interface L1Table {
  metric: string;
  label: string;
  windowDays: number;
  chainsCovered: number;
  historyDays: number;
  latestDay: string;
  source: string;
  note?: string;
  fetchedAt: string;
  rows: L1Row[];
}

export interface StakingDay {
  date: string;
  validatorCount: number;
  totalStakeAvax: number;
  selfStakeAvax: number;
  delegatedStakeAvax: number;
  delegatorCount: number;
  crossCheck: { validatorCount: number; totalStakeAvax: number; delegatorCount: number; connectedCount: number } | null;
  disputed: boolean;
}

export interface StakingSeries {
  chain: string;
  source: string;
  crossCheckSource: string;
  note?: string;
  coverageSince: string;
  crossCheckSince: string;
  days: number;
  crossCheckedDays: number;
  disputedDayCount: number;
  latest: StakingDay;
  peakValidators: StakingDay;
  peakStake: StakingDay;
  fetchedAt: string;
  series: StakingDay[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(path: string, query: Record<string, string | number | undefined> = {}, attempt = 0): Promise<T> {
  const url = new URL(`${SOCI4L_BASE}${path}`);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "avalanche-mcp-server" } });
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await sleep(700 * 2 ** attempt);
    return getJson<T>(path, query, attempt + 1);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body?.error) {
    throw new Error(`SOCI4L API ${res.status} for ${url.pathname}: ${body?.error ?? "request failed"}`);
  }
  return body as T;
}

/** C-Chain metric series (SOCI4L re-serves the Ava Labs daily series; week/month rolled up from days). */
export function getMetricSeries(metric: ChainMetric, range: Range = "30d", interval: Interval = "day", chainId?: string): Promise<MetricSeries> {
  return getJson<MetricSeries>("/metrics", { metric, range, interval, chainId });
}

/** 30-day L1 ranking table. */
export function getL1Table(): Promise<L1Table> {
  return getJson<L1Table>("/l1s");
}

/** Primary Network staking series, daily since 2020-09-10, P-Chain cross-checked since 2026-07-25. */
export function getStakingSeries(): Promise<StakingSeries> {
  return getJson<StakingSeries>("/validators");
}

export function rangeToDays(range: Range): number | undefined {
  return { "30d": 30, "90d": 90, "1y": 365, all: undefined }[range];
}

export function summarize(values: Array<{ day: string; value: number }>) {
  if (!values.length) return { count: 0 };
  const nums = values.map((p) => p.value);
  const first = values[0], last = values[values.length - 1];
  const sum = nums.reduce((a, b) => a + b, 0);
  const change = first.value === 0 ? null : ((last.value - first.value) / first.value) * 100;
  return {
    count: values.length,
    from: first.day,
    to: last.day,
    first: first.value,
    last: last.value,
    min: Math.min(...nums),
    max: Math.max(...nums),
    sum,
    avg: sum / nums.length,
    changePct: change === null ? null : Number(change.toFixed(2)),
  };
}
