import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import { ExpressiveCodeTheme } from "astro-expressive-code";
// @ts-ignore -- Vite raw-import query, not a real .jsonc export
import kalayaanDarkTheme from "./src/ec-themes/kalayaan-dark.jsonc?raw";
// @ts-ignore -- Vite raw-import query, not a real .jsonc export
import kalayaanLightTheme from "./src/ec-themes/kalayaan-light.jsonc?raw";

/** Single source of truth for the origin — also fed to `site` below. */
const SITE = "https://kalayaan.periabyte.dev";

export default defineConfig({
  site: SITE,
  integrations: [
    sitemap(),
    starlight({
      title: "Kalayaan CMS",
      tagline: "Freedom to deploy. Freedom to own. Freedom from recurring CMS costs.",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "Kalayaan CMS",
      },
      social: {
        github: "https://github.com/periabyte/kalayaan-cms",
      },
      customCss: ["./src/styles/custom.css"],
      // Without this Starlight emits its stock `<link rel="shortcut icon"
      // href="/favicon.svg">`, which 404s — nothing in public/ answers it.
      favicon: "/assets/logo.svg",
      // Starlight's bundled code-block theme (Night Owl) has its own orange
      // tokens (#F78C6C / #ECC48D) that clash with the brand's signal-orange
      // — these are the same Night Owl themes with only the orange token
      // colors swapped to match (see src/ec-themes/).
      expressiveCode: {
        themes: [
          ExpressiveCodeTheme.fromJSONString(kalayaanDarkTheme),
          ExpressiveCodeTheme.fromJSONString(kalayaanLightTheme),
        ],
      },
      // Starlight already emits <title>, description, canonical, og:title/
      // type/url/description/site_name, and twitter:card="summary_large_image"
      // (see its components/Head.astro) — only the share-card image is
      // missing, so that's all we add here. Duplicating any of the above
      // would give docs pages two canonicals.
      head: [
        {
          tag: "link",
          attrs: { rel: "icon", href: "/assets/logo.svg", type: "image/svg+xml" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image", content: `${SITE}/og.png` },
        },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: `${SITE}/og.png` },
        },
      ],
      components: {
        // Adds BreadcrumbList JSON-LD; renders Starlight's own head verbatim.
        Head: "./src/components/StarlightHead.astro",
      },
      sidebar: [
        {
          label: "Guides",
          items: [
            { label: "Quickstart", slug: "guides/quickstart" },
            { label: "Schema & config", slug: "guides/schema-and-config" },
            { label: "Custom domains", slug: "guides/custom-domains" },
            { label: "Roles & access", slug: "guides/roles-and-access" },
            { label: "Plugins & modules", slug: "guides/plugins-and-modules" },
            // Temporarily hidden — restore when the marketplace ships.
            // { label: "Marketplace modules", slug: "guides/marketplace" },
            { label: "AI features", slug: "guides/ai-features" },
            { label: "Deployment", slug: "guides/deployment" },
          ],
        },
        { label: "Roadmap", slug: "roadmap" },
      ],
    }),
  ],
});
