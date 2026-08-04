/**
 * Renders public/og.png (1200×630) — the default social share card.
 *
 * Run manually with `node scripts/build-og-image.mjs` and commit the result;
 * it is NOT part of `astro build`, so the build has no image-generation step
 * and no font-resolution risk in CI. Re-run it only when the brand palette in
 * src/styles/landing.css or the logo changes.
 *
 * Colors below are the dark-theme tokens from landing.css: --surface-code
 * #14100A, --accent #EAA844 (the signal orange, matching the swapped orange
 * token in src/ec-themes/kalayaan-*.jsonc), --text-1 #F5EEE0, --text-2 #C9BCA4.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));

/* The mark from src/assets/logo.svg, re-placed at 128×128 at (96, 172). */
const MARK = `
  <g transform="translate(96 172)">
    <rect width="128" height="128" rx="32" fill="#E0902A"/>
    <g transform="scale(2)">
      <path transform="translate(15.85 14.00) scale(0.05725) scale(1 -1) translate(-26.00 -628.90)" d="M550.8 194.3C535.5 257.0 508.2 311.8 509.9 322.9C511.6 334.5 531.4 398.9 550.8 466.0C569.7 531.3 588.2 599.1 589.3 623.0V623.1C589.4 626.2 587.8 628.8 585.7 628.8H344.7C343.3 628.8 342.1 627.7 341.4 626.0C331.2 597.3 302.5 501.8 298.9 489.3C295.1 475.9 288.2 462.1 277.1 458.6C265.6 455.0 266.6 487.8 266.3 510.7C266.0 540.3 271.1 615.1 271.8 623.1C272.1 626.2 270.3 628.9 268.2 628.9H31.0C29.0 628.9 27.3 626.6 27.3 623.7C27.3 551.8 30.0 479.9 29.4 408.0V140.7C29.6 127.7 26.0 5.3 26.0 5.3C26.0 2.4 27.6 0.1 29.7 0.1H254.7C256.7 0.1 258.3 2.4 258.4 5.3C258.5 30.7 259.1 56.2 261.5 81.4C263.8 105.5 263.2 184.1 267.7 189.8C275.0 199.0 285.6 184.7 291.0 169.2C296.5 153.2 326.6 26.6 332.6 3.5C333.1 1.4 334.5 0.1 336.0 0.1H586.6C589.1 0.1 590.9 3.7 590.1 7.1C587.3 17.5 567.8 124.4 550.8 194.3Z" fill="#241B0C"/>
    </g>
  </g>`;

const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";
const MONO = "SFMono-Regular, Menlo, Consolas, monospace";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.22" cy="0.5" r="0.75">
      <stop offset="0" stop-color="#EAA844" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#EAA844" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="#14100A"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="8" fill="#EAA844"/>

  ${MARK}

  <text x="264" y="228" font-family="${SANS}" font-size="88" font-weight="700"
        letter-spacing="-2.5" fill="#F5EEE0">Kalayaan CMS</text>

  <text x="264" y="288" font-family="${MONO}" font-size="26" letter-spacing="1.5"
        fill="#9C8E74">// login → init → deploy</text>

  <text x="96" y="404" font-family="${SANS}" font-size="46" font-weight="500"
        fill="#C9BCA4">Headless CMS for Cloudflare. <tspan fill="#EAA844" font-weight="700">$0/month.</tspan></text>

  <text x="96" y="536" font-family="${MONO}" font-size="30" fill="#EAA844">$ <tspan fill="#ECE5D8">npx kalayaan init</tspan></text>
  <text x="1104" y="536" text-anchor="end" font-family="${MONO}" font-size="24"
        fill="#71654E">kalayaan.periabyte.dev</text>
</svg>`;

const out = join(here, "..", "public", "og.png");
const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(out, png);
console.log(`wrote ${out} (${(png.length / 1024).toFixed(1)} kB)`);
