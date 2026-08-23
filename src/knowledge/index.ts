import MiniSearch from "minisearch";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface DocChunk {
  id: string;
  source: string;   // docs | avalanchego | icm | cli | starter-kit
  path: string;
  url: string;
  title: string;
  heading: string;
  text: string;
}

export interface SearchHit extends DocChunk {
  score: number;
}

let index: MiniSearch<DocChunk> | null = null;
let chunks: Map<string, DocChunk> = new Map();
let builtAt = "";

function dataPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "data", "docs.json");
}

export function loadKnowledge(): void {
  if (index) return;
  let raw: { builtAt: string; chunks: DocChunk[] };
  try {
    raw = JSON.parse(readFileSync(dataPath(), "utf8"));
  } catch {
    // No index shipped (e.g. dev before `npm run build-index`). Start empty so the server still boots.
    raw = { builtAt: "", chunks: [] };
    console.error("[avalanche-mcp] docs.json not found – run `npm run build-index`. Docs search will be empty.");
  }
  builtAt = raw.builtAt;
  chunks = new Map(raw.chunks.map((c) => [c.id, c]));
  index = new MiniSearch<DocChunk>({
    fields: ["title", "heading", "text", "path"],
    storeFields: ["id"],
    searchOptions: {
      boost: { title: 3, heading: 2, path: 1.5 },
      fuzzy: 0.15,
      prefix: true,
      combineWith: "AND",
    },
    tokenize: (s) => s.toLowerCase().split(/[\s\-_/.,;:()[\]{}"'`<>=]+/).filter((t) => t.length > 1),
  });
  index.addAll(raw.chunks);
}

export function knowledgeStats() {
  loadKnowledge();
  const bySource: Record<string, number> = {};
  for (const c of chunks.values()) bySource[c.source] = (bySource[c.source] ?? 0) + 1;
  return { builtAt, totalChunks: chunks.size, bySource };
}

export function searchDocs(query: string, opts: { limit?: number; source?: string; pathPrefix?: string } = {}): SearchHit[] {
  loadKnowledge();
  const limit = opts.limit ?? 8;
  let results = index!.search(query);
  if (results.length === 0) results = index!.search(query, { combineWith: "OR" });
  const hits: SearchHit[] = [];
  const seenDoc = new Map<string, number>();
  for (const r of results) {
    const c = chunks.get(r.id as string);
    if (!c) continue;
    if (opts.source && c.source !== opts.source) continue;
    if (opts.pathPrefix && !c.path.startsWith(opts.pathPrefix)) continue;
    // cap chunks per document so results stay diverse
    const n = seenDoc.get(c.path) ?? 0;
    if (n >= 2) continue;
    seenDoc.set(c.path, n + 1);
    hits.push({ ...c, score: r.score });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Full document = all chunks sharing a path, in order. */
export function getDoc(path: string): { doc: DocChunk; body: string } | null {
  loadKnowledge();
  const parts = [...chunks.values()].filter((c) => c.path === path || c.url === path).sort((a, b) => Number(a.id.split("#").pop()) - Number(b.id.split("#").pop()));
  if (parts.length === 0) return null;
  return { doc: parts[0], body: parts.map((p) => p.text).join("\n\n") };
}

/** List docs (unique paths) under a prefix – used for resource listing / topic browsing. */
export function listDocs(pathPrefix = "", limit = 200): Array<{ path: string; title: string; url: string; source: string }> {
  loadKnowledge();
  const seen = new Map<string, DocChunk>();
  for (const c of chunks.values()) {
    if (pathPrefix && !c.path.startsWith(pathPrefix)) continue;
    if (!seen.has(c.path)) seen.set(c.path, c);
  }
  return [...seen.values()].slice(0, limit).map((c) => ({ path: c.path, title: c.title, url: c.url, source: c.source }));
}

/** Top-level topic tree for discovery. */
export function listTopics(): Array<{ topic: string; docs: number; example: string }> {
  loadKnowledge();
  const byTopic = new Map<string, Set<string>>();
  for (const c of chunks.values()) {
    const seg = c.path.split("/");
    const topic = c.source === "docs" ? seg.slice(0, 3).join("/") : `${c.source}:${seg.slice(0, 2).join("/")}`;
    if (!byTopic.has(topic)) byTopic.set(topic, new Set());
    byTopic.get(topic)!.add(c.path);
  }
  return [...byTopic.entries()]
    .map(([topic, paths]) => ({ topic, docs: paths.size, example: [...paths][0] }))
    .sort((a, b) => b.docs - a.docs);
}
