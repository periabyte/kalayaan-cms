/**
 * Post-build SEO smoke check over dist/ — one <title> and one canonical per
 * page, descriptions under 155 characters, no broken internal links, and the
 * sitemap covering every built page. Run with `node scripts/check-seo.mjs`
 * after `pnpm build`.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const SKIP_DIRS = new Set(["pagefind", "_astro"]);

function htmlFiles(dir, base = "") {
  const out = [];
  for (const entry of readdirSync(join(DIST, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...htmlFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith(".html")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const decode = (s) =>
  s
    ?.replace(/&#39;/g, "'")
    .replace(/&(amp|#38);/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const problems = [];
const pages = htmlFiles(".").sort();

for (const file of pages) {
  const html = readFileSync(join(DIST, file), "utf8");
  const head = html.split("</head>")[0];
  const title = decode(head.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
  const desc = decode(head.match(/<meta name="description" content="([^"]*)"/)?.[1]);
  const canonicals = (head.match(/rel="canonical"/g) ?? []).length;
  const titles = (head.match(/<title>/g) ?? []).length;
  const ogImage = (head.match(/property="og:image"/g) ?? []).length;
  const is404 = file === "404.html";

  const flags = [];
  if (titles !== 1) flags.push(`${titles} <title>`);
  if (!is404 && canonicals !== 1) flags.push(`${canonicals} canonical`);
  if (!is404 && ogImage !== 1) flags.push(`${ogImage} og:image`);
  if (!is404 && !desc) flags.push("no description");
  if (desc && desc.length > 155) flags.push(`description ${desc.length} chars`);

  console.log(
    `${file.padEnd(36)} title=${String(title?.length ?? "—").padStart(3)}  desc=${String(desc?.length ?? "—").padStart(3)}` +
      (flags.length ? `  ✗ ${flags.join(", ")}` : "")
  );
  for (const f of flags) problems.push(`${file}: ${f}`);
}

/* Internal links must resolve to a real built file. */
const linked = new Set();
for (const file of pages) {
  for (const m of readFileSync(join(DIST, file), "utf8").matchAll(/href="(\/[^"#?]*)"/g)) {
    linked.add(m[1]);
  }
}
for (const url of [...linked].sort()) {
  if (/^\/(_astro|pagefind|fonts|assets)\//.test(url)) continue;
  const candidates = [url.slice(1), join(url.slice(1), "index.html")];
  if (!candidates.some((c) => c && existsSync(join(DIST, c)))) {
    problems.push(`broken internal link: ${url}`);
  }
}

/* Every indexable page must be in the sitemap. */
const sitemap = readFileSync(join(DIST, "sitemap-0.xml"), "utf8");
for (const file of pages) {
  if (file === "404.html") continue;
  const path = "/" + file.replace(/(^|\/)index\.html$/, "/").replace(/^\.\//, "");
  const url = `https://kalayaan.periabyte.dev${path.replace(/\/+/g, "/")}`;
  if (!sitemap.includes(`<loc>${url}</loc>`)) problems.push(`not in sitemap: ${url}`);
}

console.log(problems.length ? `\n✗ ${problems.length} problem(s):` : "\n✓ all checks passed");
for (const p of problems) console.log("  - " + p);
process.exit(problems.length ? 1 : 0);
