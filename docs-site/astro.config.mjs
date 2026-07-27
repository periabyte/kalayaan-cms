import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { ExpressiveCodeTheme } from "astro-expressive-code";
// @ts-ignore -- Vite raw-import query, not a real .jsonc export
import kalayaanDarkTheme from "./src/ec-themes/kalayaan-dark.jsonc?raw";
// @ts-ignore -- Vite raw-import query, not a real .jsonc export
import kalayaanLightTheme from "./src/ec-themes/kalayaan-light.jsonc?raw";

export default defineConfig({
  site: "https://kalayaan.periabyte.dev",
  integrations: [
    starlight({
      title: "Kalayaan",
      tagline: "Freedom to deploy. Freedom to own. Freedom from recurring CMS costs.",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "Kalayaan",
      },
      social: {
        github: "https://github.com/periabyte/kalayaan-cms",
      },
      customCss: ["./src/styles/custom.css"],
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
      head: [
        {
          tag: "link",
          attrs: { rel: "icon", href: "/assets/logo.svg", type: "image/svg+xml" },
        },
      ],
      sidebar: [
        {
          label: "Guides",
          items: [
            { label: "Quickstart", slug: "guides/quickstart" },
            { label: "Schema & config", slug: "guides/schema-and-config" },
            { label: "Custom domains", slug: "guides/custom-domains" },
            { label: "Roles & access", slug: "guides/roles-and-access" },
            { label: "Plugins & modules", slug: "guides/plugins-and-modules" },
            { label: "AI features", slug: "guides/ai-features" },
            { label: "Deployment", slug: "guides/deployment" },
          ],
        },
        { label: "Roadmap", slug: "roadmap" },
      ],
    }),
  ],
});
