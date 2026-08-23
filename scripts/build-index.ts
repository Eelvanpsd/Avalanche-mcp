/**
 * Builds src/knowledge/data/docs.json from official Avalanche sources.
 * Run: npm run build-index   (REFRESH=1 to re-download)
 *
 * Downloads GitHub tarballs (no API key needed), extracts Markdown/MDX,
 * chunks by heading, and writes a compact JSON the server indexes at startup.
 */
import { execSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

interface Source {
  repo: string;
  ref: string;
  include: RegExp;
  name: string;
  urlFor: (relPath: string) => string;
}

const SOURCES: Source[] = [
  {
    repo: "ava-labs/builders-hub",
    ref: "master",
    name: "docs",
    include: /^content\/(docs|academy\/(avalanche-l1|blockchain))\/.*\.mdx?$/,
    urlFor: (p) => "https://build.avax.network/" + p.replace(/^content\//, "").replace(/\.mdx?$/, "").replace(/\/index$/, ""),
  },
  {
    repo: "ava-labs/avalanchego",
    ref: "master",
    name: "avalanchego",
    include: /^(README\.md|docs\/.*\.md|graft\/subnet-evm\/(README\.md|.*\/README\.md|precompile\/.*\.md|plugin\/evm\/.*\.md)|graft\/coreth\/README\.md|RELEASES\.md)$/,
    urlFor: (p) => `https://github.com/ava-labs/avalanchego/blob/master/${p}`,
  },
  {
    repo: "ava-labs/icm-services",
    ref: "main",
    name: "icm",
    include: /^(README\.md|contracts\/.*\.md|relayer\/.*\.md|signature-aggregator\/.*\.md|docs\/.*\.md)$/,
    urlFor: (p) => `https://github.com/ava-labs/icm-services/blob/main/${p}`,
  },
  {
    repo: "ava-labs/avalanche-cli",
    ref: "main",
    name: "cli",
    include: /^(README\.md|docs\/.*\.md|cmd\/.*\.md)$/,
    urlFor: (p) => `https://github.com/ava-labs/avalanche-cli/blob/main/${p}`,
  },
  {
    repo: "ava-labs/avalanche-starter-kit",
    ref: "main",
    name: "starter-kit",
    include: /^(README\.md|.*\/README\.md)$/,
    urlFor: (p) => `https://github.com/ava-labs/avalanche-starter-kit/blob/main/${p}`,
  },
];

const ROOT = process.cwd();
const CACHE = join(ROOT, ".cache", "sources");
const OUT = join(ROOT, "src", "knowledge", "data", "docs.json");
const MAX_CHUNK = 1800;

export interface DocChunk {
  id: string;
  source: string;
  path: string;
  url: string;
  title: string;
  heading: string;
  text: string;
}

function download(src: Source): string {
  const dir = join(CACHE, src.repo.replace("/", "__"));
  if (existsSync(dir) && !process.env.REFRESH) return dir;
  mkdirSync(dir, { recursive: true });
  const url = `https://codeload.github.com/${src.repo}/tar.gz/${src.ref}`;
  console.error(`↓ ${url}`);
  execSync(`curl -sL "${url}" | tar -xz -C "${dir}" --strip-components=1`, { stdio: "inherit" });
  return dir;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = join(dir, e);
    const s = lstatSync(p);
    if (s.isSymbolicLink()) continue;
    if (s.isDirectory()) walk(p, out);
    else if (s.isFile()) out.push(p);
  }
  return out;
}

function parseFrontmatter(raw: string): { title?: string; description?: string; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { body: raw };
  const fm = m[1];
  const title = fm.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  const description = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1];
  return { title, description, body: raw.slice(m[0].length) };
}

function cleanMdx(body: string): string {
  return body
    .replace(/^import .*$/gm, "")
    .replace(/^export .*$/gm, "")
    .replace(/<\/?[A-Z][A-Za-z]*[^>]*>/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunk(text: string): Array<{ heading: string; text: string }> {
  const parts: Array<{ heading: string; text: string }> = [];
  const lines = text.split("\n");
  let heading = "";
  let buf: string[] = [];
  const flush = () => {
    const t = buf.join("\n").trim();
    if (t.length > 40) {
      if (t.length <= MAX_CHUNK) parts.push({ heading, text: t });
      else {
        let cur = "";
        for (const para of t.split(/\n\n+/)) {
          if ((cur + "\n\n" + para).length > MAX_CHUNK && cur) {
            parts.push({ heading, text: cur.trim() });
            cur = para;
          } else cur = cur ? cur + "\n\n" + para : para;
        }
        if (cur.trim()) parts.push({ heading, text: cur.trim() });
      }
    }
    buf = [];
  };
  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flush();
      heading = h[2].trim();
    }
    buf.push(line);
  }
  flush();
  return parts;
}

function main() {
  const chunks: DocChunk[] = [];
  for (const src of SOURCES) {
    const dir = download(src);
    let files = 0;
    for (const file of walk(dir)) {
      const rel = relative(dir, file).split(sep).join("/");
      if (!src.include.test(rel)) continue;
      const raw = readFileSync(file, "utf8");
      const { title, description, body } = parseFrontmatter(raw);
      const docTitle = title ?? body.match(/^#\s+(.+)$/m)?.[1] ?? rel.split("/").pop()!.replace(/\.mdx?$/, "");
      const cleaned = cleanMdx((description ? description + "\n\n" : "") + body);
      const url = src.urlFor(rel);
      chunk(cleaned).forEach((c, i) => {
        chunks.push({ id: `${src.name}:${rel}#${i}`, source: src.name, path: rel, url, title: docTitle, heading: c.heading, text: c.text });
      });
      files++;
    }
    console.error(`${src.name}: ${files} files`);
  }
  mkdirSync(join(ROOT, "src", "knowledge", "data"), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), chunks }));
  const mb = (statSync(OUT).size / 1e6).toFixed(1);
  console.error(`✔ ${chunks.length} chunks → ${relative(ROOT, OUT)} (${mb} MB)`);
}

main();
