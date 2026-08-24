import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CHAIN_METRICS,
  STAKING_FIELDS,
  SOCI4L_PAGE,
  getMetricSeries,
  getL1Table,
  getStakingSeries,
  rangeToDays,
  summarize,
} from "../clients/metrics.js";
import { ok, guard } from "../utils.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const rangeParam = z.enum(["30d", "90d", "1y", "all"]).default("30d");
const intervalParam = z.enum(["day", "week", "month"]).default("day");

type Pt = { day: string; value: number };

function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

/** Inline SVG line chart — clients that render SVG show it; the markdown table is the fallback. */
export function renderSvgChart(points: Pt[], title: string, unit: string): string {
  const W = 720, H = 260, padL = 64, padR = 16, padT = 36, padB = 34;
  if (points.length < 2) return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="16" y="24">${esc(title)}: not enough data</text></svg>`;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - padB} L${padL},${H - padB} Z`;
  const ticks = [0, 0.5, 1].map((t) => {
    const v = min + t * span;
    return `<g><line x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#888" stroke-opacity="0.25"/><text x="${padL - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#888">${fmt(v)}</text></g>`;
  }).join("");
  const xl = [0, Math.floor((points.length - 1) / 2), points.length - 1]
    .map((i) => `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#888">${points[i].day}</text>`)
    .join("");
  const last = points[points.length - 1];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,sans-serif">
<rect width="${W}" height="${H}" fill="#fff" rx="8"/>
<text x="16" y="22" font-size="14" font-weight="600" fill="#222">${esc(title)}</text>
<text x="${W - 16}" y="22" font-size="12" text-anchor="end" fill="#555">latest ${fmt(last.value)} ${esc(unit)}</text>
${ticks}
<path d="${area}" fill="#e84142" fill-opacity="0.12"/>
<path d="${path}" fill="none" stroke="#e84142" stroke-width="2" stroke-linejoin="round"/>
<circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="3.5" fill="#e84142"/>
${xl}
</svg>`;
}

function markdownTable(points: Pt[], label: string, maxRows = 40): string {
  const step = Math.max(1, Math.ceil(points.length / maxRows));
  const rows = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  return [`| date | ${label} |`, "|---|---:|", ...rows.map((p) => `| ${p.day} | ${fmt(p.value)} |`)].join("\n");
}

function sliceRange<T extends { date: string }>(series: T[], range: "30d" | "90d" | "1y" | "all"): T[] {
  const days = rangeToDays(range);
  return days ? series.slice(-days) : series;
}

export function registerMetricsTools(server: McpServer) {
  server.registerTool(
    "avax_metrics_series",
    {
      title: "C-Chain metric time series",
      description:
        `Time series for an Avalanche C-Chain network metric: ${CHAIN_METRICS.join(", ")}. ` +
        "Data comes from SOCI4L's public API (a daily snapshot of the Ava Labs Metrics API with corrected week/month rollups; no key, no rate-limit issues). " +
        "Returns oldest-first points (each flagged complete/incomplete) plus a summary (first/last/min/max/sum/avg/change%). " +
        `Use for 'transactions last 30 days', 'active addresses trend', 'fees paid', 'peak TPS'. Source page: ${SOCI4L_PAGE}`,
      inputSchema: {
        metric: z.enum(CHAIN_METRICS).default("txCount"),
        range: rangeParam,
        interval: intervalParam,
        include_incomplete: z.boolean().default(false).describe("Keep the still-running last period (its value is still growing)"),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ metric, range, interval, include_incomplete }) => {
      const res = await getMetricSeries(metric, range, interval);
      const series = include_incomplete ? res.series : res.series.filter((p) => p.complete);
      return ok({
        chainId: res.chainId,
        metric: res.metric,
        label: res.label,
        description: res.description,
        unit: res.unit,
        cumulative: res.cumulative,
        range,
        interval,
        summary: summarize(series),
        series,
        droppedIncomplete: res.series.length - series.length,
        fetchedAt: res.fetchedAt,
        source: `https://soci4l.net/api/avalanche/metrics?metric=${metric}&range=${range}&interval=${interval}`,
        upstream: res.source,
        note: res.note,
        sourceUrl: SOCI4L_PAGE,
      });
    })
  );

  server.registerTool(
    "avax_metrics_staking",
    {
      title: "Primary Network staking series",
      description:
        "Validators, delegators, self stake, delegated stake and total stake (whole AVAX) for the Avalanche Primary Network — daily since 2020-09-10 via SOCI4L, cross-checked against a P-Chain platform.getCurrentValidators read (days disagreeing >2% on stake are flagged disputed). " +
        "Returns latest snapshot, all-time peaks, per-field summaries over the range, and the series. For the live validator set use avax_pchain_get_validators.",
      inputSchema: {
        range: rangeParam,
        fields: z.array(z.enum(STAKING_FIELDS)).default([...STAKING_FIELDS]),
        include_series: z.boolean().default(true),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ range, fields, include_series }) => {
      const res = await getStakingSeries();
      const series = sliceRange(res.series, range);
      const summaries: Record<string, unknown> = {};
      for (const f of fields) summaries[f] = summarize(series.map((d) => ({ day: d.date, value: d[f] })));
      return ok({
        chain: res.chain,
        range,
        latest: res.latest,
        peakValidators: res.peakValidators,
        peakStake: res.peakStake,
        coverageSince: res.coverageSince,
        crossCheckSince: res.crossCheckSince,
        disputedDayCount: res.disputedDayCount,
        summaries,
        series: include_series ? series.map((d) => ({ date: d.date, ...Object.fromEntries(fields.map((f) => [f, d[f]])), disputed: d.disputed, connectedCount: d.crossCheck?.connectedCount ?? null })) : undefined,
        fetchedAt: res.fetchedAt,
        source: "https://soci4l.net/api/avalanche/validators",
        upstream: res.source,
        crossCheckSource: res.crossCheckSource,
        note: res.note,
        sourceUrl: `${SOCI4L_PAGE}/validators`,
      });
    })
  );

  server.registerTool(
    "avax_l1_rankings",
    {
      title: "Rank Avalanche L1s by 30-day transactions",
      description:
        "30-day transaction ranking of every Avalanche L1 the C-Chain included (34+ chains) from SOCI4L: tx count, share of tracked total, 30d change, rhythm (steady/regular/intermittent), concentration (broad/mixed/concentrated), tx-per-sender and an estimated automated-traffic share sampled from recent blocks. " +
        "Use for 'most active L1s', 'market share of Gunz/Dexalot/Henesys', 'is traffic on an L1 bot-driven'. Filter by rhythm/concentration or search by name.",
      inputSchema: {
        top: z.number().int().min(1).max(100).default(20),
        query: z.string().optional().describe("Case-insensitive substring match on chain name or EVM chain ID"),
        rhythm: z.enum(["steady", "regular", "intermittent"]).optional(),
        concentration: z.enum(["broad", "mixed", "concentrated"]).optional(),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ top, query, rhythm, concentration }) => {
      const res = await getL1Table();
      const q = query?.toLowerCase();
      const rows = res.rows.filter(
        (r) =>
          (!q || r.chainName.toLowerCase().includes(q) || String(r.evmChainId) === q) &&
          (!rhythm || r.rhythm === rhythm) &&
          (!concentration || r.concentration === concentration)
      );
      const counts = (key: "rhythm" | "concentration") =>
        res.rows.reduce<Record<string, number>>((acc, r) => { const k = r[key] ?? "unknown"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
      return ok({
        metric: res.metric,
        windowDays: res.windowDays,
        latestDay: res.latestDay,
        chainsCovered: res.chainsCovered,
        matched: rows.length,
        breakdown: { rhythm: counts("rhythm"), concentration: counts("concentration") },
        chains: rows.slice(0, top),
        fetchedAt: res.fetchedAt,
        source: "https://soci4l.net/api/avalanche/l1s",
        upstream: res.source,
        note: res.note,
        sourceUrl: `${SOCI4L_PAGE}/compare`,
      });
    })
  );

  server.registerTool(
    "avax_metrics_chart",
    {
      title: "Render a metric chart (SVG + table)",
      description:
        "Render a C-Chain metric or a staking field as an inline SVG line chart plus a markdown KPI line and table, so network stats can be shown as UI instead of raw JSON. " +
        "Returns markdown text and an embedded image/svg+xml resource; clients that render SVG show the chart, others fall back to the table. " +
        `Metrics: ${CHAIN_METRICS.join(", ")}; staking: ${STAKING_FIELDS.join(", ")}.`,
      inputSchema: {
        metric: z.enum([...CHAIN_METRICS, ...STAKING_FIELDS]).default("txCount"),
        range: rangeParam,
        interval: intervalParam.describe("C-Chain metrics only; staking is always daily"),
        title: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    guard(async ({ metric, range, interval, title }) => {
      let points: Pt[];
      let unit: string;
      let label: string;
      let source: string;
      if ((STAKING_FIELDS as readonly string[]).includes(metric)) {
        const f = metric as (typeof STAKING_FIELDS)[number];
        const res = await getStakingSeries();
        points = sliceRange(res.series, range).map((d) => ({ day: d.date, value: d[f] }));
        unit = f.endsWith("Avax") ? "AVAX" : "count";
        label = `${f} — Avalanche Primary Network (${range})`;
        source = "https://soci4l.net/api/avalanche/validators";
      } else {
        const res = await getMetricSeries(metric as (typeof CHAIN_METRICS)[number], range, interval);
        points = res.series.filter((p) => p.complete).map((p) => ({ day: p.day, value: p.value }));
        unit = res.unit === "count" ? res.label.toLowerCase() : res.unit;
        label = `${res.label} — Avalanche C-Chain (${range}, ${interval})`;
        source = `https://soci4l.net/api/avalanche/metrics?metric=${metric}&range=${range}&interval=${interval}`;
      }
      const chartTitle = title ?? label;
      const s = summarize(points);
      const svg = renderSvgChart(points, chartTitle, unit);
      const kpis = s.count
        ? `**Latest:** ${fmt(s.last!)} ${unit} · **Min:** ${fmt(s.min!)} · **Max:** ${fmt(s.max!)} · **Avg:** ${fmt(s.avg!)} · **Change:** ${s.changePct ?? "n/a"}% (${s.from} → ${s.to})`
        : "_No data for this range._";
      const md = `### ${chartTitle}\n\n${kpis}\n\n${markdownTable(points, `${metric} (${unit})`)}\n\n_Source: SOCI4L (${source}) — snapshot of the Ava Labs Metrics API_`;
      return {
        content: [
          { type: "text", text: md },
          { type: "resource", resource: { uri: `avax://chart/${metric}/${range}.svg`, mimeType: "image/svg+xml", text: svg } },
        ],
        structuredContent: { metric, unit, range, summary: s, svg, markdown: md, source },
      };
    })
  );
}
