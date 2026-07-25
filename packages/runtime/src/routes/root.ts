import type { Context, Handler } from "hono";
import type { ResolvedConfig } from "@kalayaan/config";
import { notFound } from "../errors.js";

/**
 * `GET /` — the page a deployed Worker serves at its bare root, per
 * docs/design-handoff.md §15d. Kalayaan is headless (every real request goes
 * to /api/v1, /api/graphql, /media, /admin/*, or /mcp), so an unmatched `/`
 * otherwise falls through to the generic JSON 404. Browser navigations get a
 * small self-contained HTML page instead; everything else keeps the existing
 * JSON 404 so tooling/health checks don't regress.
 */
export function homeRoute(config: ResolvedConfig): Handler {
  return (c: Context) => {
    const accept = c.req.header("Accept") ?? "";
    if (!accept.includes("text/html")) return notFound(c);

    return c.html(renderHome(config.name));
  };
}

function renderHome(siteName: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(siteName)} — Kalayaan CMS</title>
<style>
  /* Kalayaan "Dawn" — warm paper + dawn gold. Light-forward, dark a first-class
     equal (prefers-color-scheme). Values mirror the design system's
     tokens/colors.css; the display face (Cubao Free) is served locally at
     /fonts by the same Assets binding that serves this page, so no external
     request is required and it degrades to Georgia via font-display:swap. */
  :root {
    color-scheme: light;
    --bg:#FFFDF9; --surface:#FFFFFF; --border:#ECE2CE; --border-strong:#DDCEB6;
    --text-1:#2A2115; --text-2:#5A4F3F; --text-3:#8A7C66;
    --accent:#E0902A; --accent-hover:#C8781A; --accent-text:#8A4F0F;
    --text-on-accent:#241B0C; --accent-soft:rgba(224,144,42,0.12);
    --shadow:0 2px 8px -2px rgba(60,45,20,0.10);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --bg:#1B1710; --surface:#221D15; --border:#322A1E; --border-strong:#453A29;
      --text-1:#F5EEE0; --text-2:#C9BCA4; --text-3:#9C8E74;
      --accent:#EAA844; --accent-hover:#F3C069; --accent-text:#F3C069;
      --text-on-accent:#241B0C; --accent-soft:rgba(234,168,68,0.15);
      --shadow:0 2px 8px -2px rgba(0,0,0,0.4);
    }
  }
  @font-face {
    font-family: "Cubao Free";
    src: url("/fonts/Cubao_Free_Regular.otf") format("opentype");
    font-weight: 400 700; font-style: normal; font-display: swap;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--text-1);
    font-family: "Figtree", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 64px 24px;
  }
  main { width: 100%; max-width: 460px; display: flex; flex-direction: column; align-items: flex-start; gap: 20px; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand svg { display: block; flex-shrink: 0; }
  .brand span { font-family: "Cubao Free", Georgia, serif; font-weight: 600; font-size: 24px; letter-spacing: -0.02em; }
  h1 {
    font-family: "Cubao Free", Georgia, serif;
    font-weight: 500; font-size: 30px; line-height: 1.3; letter-spacing: -0.01em; margin: 0;
  }
  .cta {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 11px 18px; border-radius: 11px;
    background: var(--accent); color: var(--text-on-accent);
    font-size: 15px; font-weight: 600; text-decoration: none;
    box-shadow: var(--shadow); transition: filter 170ms cubic-bezier(0.2,0,0,1);
  }
  .cta:hover { filter: brightness(1.05); }
  .cta .glyph { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 14px; }
  p.tagline {
    margin: 8px 0 0; font-size: 13px; color: var(--text-3);
    font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    letter-spacing: 0.06em;
  }
</style>
</head>
<body>
<main>
  <div class="brand">
    <svg viewBox="0 0 64 64" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kalayaan"><rect width="64" height="64" rx="16" fill="var(--accent)"/><path transform="translate(15.85 14.00) scale(0.05725) scale(1 -1) translate(-26.00 -628.90)" d="M550.8 194.3C535.5 257.0 508.2 311.8 509.9 322.9C511.6 334.5 531.4 398.9 550.8 466.0C569.7 531.3 588.2 599.1 589.3 623.0V623.1C589.4 626.2 587.8 628.8 585.7 628.8H344.7C343.3 628.8 342.1 627.7 341.4 626.0C331.2 597.3 302.5 501.8 298.9 489.3C295.1 475.9 288.2 462.1 277.1 458.6C265.6 455.0 266.6 487.8 266.3 510.7C266.0 540.3 271.1 615.1 271.8 623.1C272.1 626.2 270.3 628.9 268.2 628.9H31.0C29.0 628.9 27.3 626.6 27.3 623.7C27.3 551.8 30.0 479.9 29.4 408.0V140.7C29.6 127.7 26.0 5.3 26.0 5.3C26.0 2.4 27.6 0.1 29.7 0.1H254.7C256.7 0.1 258.3 2.4 258.4 5.3C258.5 30.7 259.1 56.2 261.5 81.4C263.8 105.5 263.2 184.1 267.7 189.8C275.0 199.0 285.6 184.7 291.0 169.2C296.5 153.2 326.6 26.6 332.6 3.5C333.1 1.4 334.5 0.1 336.0 0.1H586.6C589.1 0.1 590.9 3.7 590.1 7.1C587.3 17.5 567.8 124.4 550.8 194.3Z" fill="var(--text-on-accent)"/></svg>
    <span>kalayaan</span>
  </div>
  <h1>This is a Kalayaan CMS.</h1>
  <a class="cta" href="https://kalayaan.periabyte.dev" target="_blank" rel="noopener"><span>kalayaan.periabyte.dev</span><span class="glyph">→</span></a>
  <p class="tagline">// FREE · OPEN SOURCE · SERVERLESS</p>
</main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
