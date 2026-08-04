/* The feature set, shared by the landing page (/) and the expanded /features
   page so the two can't drift apart. `title` + `body` are what the landing
   grid renders; `detail` + `href` are the extra depth only /features shows. */

export interface Feature {
  /** Key into ICONS below. */
  icon: string;
  /** Stable anchor on /features — also the landing card's deep-link target. */
  id: string;
  title: string;
  /** One-line summary — the landing grid card. */
  body: string;
  /** Full paragraphs — /features only. */
  detail: string[];
  /** Where to read more. */
  href: string;
  hrefLabel: string;
}

export const features: Feature[] = [
  {
    icon: "layout-dashboard",
    id: "schema-driven-admin",
    title: "Schema-driven admin",
    body: "Define content models in cms.config.ts; the admin SPA renders itself — typed fields, relations, and validation.",
    detail: [
      "You never build an admin screen. Declare a collection in `cms.config.ts` — its fields, their types, which are required, which are unique — and the admin SPA renders the list view, the editor form, and the validation for it at build time.",
      "Field types cover the things real content needs: text, rich text, slug (auto-derived from another field), number, boolean, date, select, media, JSON, and relations to other collections. The same definition drives the database schema, the REST and GraphQL APIs, and the TypeScript types — so a field you add in config is immediately queryable, editable, and typed.",
      "Changing the schema is a migration, not a hot reload: `kalayaan migrate --dry-run` shows you the DDL before anything touches your data.",
    ],
    href: "/guides/schema-and-config/",
    hrefLabel: "Schema & config guide",
  },
  {
    icon: "database",
    id: "databases",
    title: "Databases your way",
    body: "D1 is the zero-config default. Bring Postgres or MySQL over Hyperdrive when you outgrow it.",
    detail: [
      "`kalayaan deploy` provisions a D1 database for you — Cloudflare's SQLite at the edge, on the free tier, with no connection string to manage. For the overwhelming majority of content sites that is the end of the story.",
      "If you already run Postgres or MySQL, point config at it instead and Kalayaan provisions a Hyperdrive binding so the Worker gets pooled, low-latency connections rather than a cold TCP handshake per request. The query builder and migration engine target both — your collections, API, and admin UI don't change.",
    ],
    href: "/guides/schema-and-config/",
    hrefLabel: "Schema & config guide",
  },
  {
    icon: "sparkles",
    id: "ai",
    title: "AI that helps you ship",
    body: "Alt-text, translation, and editorial assist on Workers AI's free tier — plus optional semantic search.",
    detail: [
      "Three AI features run on Workers AI with no separate API key and no third-party account: **alt-text** generation for anything you upload to the media library, **translation** into your configured locales (flagged as machine-translated until a human reviews it), and **editorial assist** for titles, summaries, and rewrites inside the editor.",
      "All three sit inside Workers AI's free daily neuron allowance, so the default AI configuration adds nothing to your bill. Semantic search is the one exception — it needs Vectorize, which requires a paid Workers plan, and Kalayaan says so before you enable it rather than after.",
    ],
    href: "/guides/ai-features/",
    hrefLabel: "AI features guide",
  },
  {
    icon: "link",
    id: "apis",
    title: "Every way to read",
    body: "A public REST API and config-generated GraphQL, plus an MCP endpoint so agents can query and edit content.",
    detail: [
      "Every collection gets a REST API — list, filter, sort, paginate, and fetch by slug or id — with drafts hidden from anonymous callers unless you grant otherwise. A GraphQL schema is generated from the same config, so relations resolve in one round trip.",
      "There's also an MCP server endpoint. Point Claude, or any MCP client, at your site and it can read and edit content under a scoped API token with exactly the permissions you grant it — the same Ability model that gates a human editor.",
    ],
    href: "/guides/roles-and-access/",
    hrefLabel: "Roles & access guide",
  },
  {
    icon: "users",
    id: "roles",
    title: "Roles & real access control",
    body: "Config-defined roles and permissions, email invites, scoped API tokens with an audit log.",
    detail: [
      "Access is an **Ability**: a set of grants of the shape `{ subjects, actions }`, where actions are `read`, `create`, `update`, `delete`, `publish`, and `manage`, and subjects are your collection names plus system subjects like `media`, `users`, and `settings`. Every request — logged-in editor, API key, or anonymous visitor — resolves to one.",
      "Roles are defined in config, so \"editors can publish posts but not touch users\" is a reviewable diff rather than a checkbox someone toggled once. Invite teammates by email, issue API tokens scoped to a subset of that role with an expiry date, revoke any of them instantly, and read the audit log of who changed what.",
    ],
    href: "/guides/roles-and-access/",
    hrefLabel: "Roles & access guide",
  },
  {
    icon: "layers",
    id: "media-versions-locales",
    title: "Media, versions, locales",
    body: "Upload to R2 or S3, roll back any change, and localize content across languages from one place.",
    detail: [
      "Media uploads land in R2 by default — free egress, free storage inside the monthly allowance — or in any S3-compatible bucket you already pay for. Images get derived sizes and, if AI is on, alt-text.",
      "Turn on `versioning` for a collection and every save writes a revision you can diff and roll back to, with draft and published states kept separate so an in-progress edit never leaks to the public API.",
      "Localization is per-field: mark which fields vary by locale, and the editor shows them side by side across your configured languages, with machine translations visibly flagged for review.",
    ],
    href: "/guides/schema-and-config/",
    hrefLabel: "Schema & config guide",
  },
  {
    icon: "shield-check",
    id: "submissions",
    title: "Moderated submissions",
    body: "Accept public contributions behind Cloudflare Turnstile, then approve or reject from the admin queue.",
    detail: [
      "Open a collection to anonymous writes and submissions arrive as pending entries rather than published content. Cloudflare Turnstile — free, no CAPTCHA puzzle for your users — sits in front of the endpoint, so you're moderating real people instead of bots.",
      "Approve, edit, or reject from a queue in the admin UI. The same permission model applies, so you can hand moderation to a role without handing over the rest of the CMS.",
    ],
    href: "/guides/roles-and-access/",
    hrefLabel: "Roles & access guide",
  },
  {
    icon: "globe",
    id: "custom-domain",
    title: "Your own domain",
    body: "Attach any custom domain with automatic DNS and TLS — the site is yours, not a subdomain.",
    detail: [
      "Put a domain in config, or pass `--domain`, and `kalayaan deploy` creates the DNS record and provisions the TLS certificate for you. The domain needs to be a zone on your Cloudflare account; everything after that is automatic.",
      "Until you attach one you're on a free `*.workers.dev` URL, so nothing blocks you from shipping today and buying the domain later.",
    ],
    href: "/guides/custom-domains/",
    hrefLabel: "Custom domains guide",
  },
];

/**
 * The `detail` strings above carry a deliberately tiny subset of markdown —
 * `code` and **strong** — so the prose stays readable in this file. Both
 * pages render them through here with `set:html`; the input is this module's
 * own literals, never user content.
 */
export function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/** Inline SVG path data for each feature icon (lucide-style, 24×24 stroke). */
export const ICONS: Record<string, string> = {
  "layout-dashboard": `<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>`,
  database: `<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>`,
  sparkles: `<path d="M11 3c.4 3 2 4.6 5 5-3 .4-4.6 2-5 5-.4-3-2-4.6-5-5 3-.4 4.6-2 5-5Z"/><path d="M18 14c.2 1.4.9 2.1 2.3 2.3-1.4.2-2.1.9-2.3 2.3-.2-1.4-.9-2.1-2.3-2.3 1.4-.2 2.1-.9 2.3-2.3Z"/>`,
  link: `<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><path d="M8 12h8"/>`,
  users: `<path d="M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 5 18.5V20"/><circle cx="9.5" cy="8.5" r="3.5"/><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.36"/><path d="M15 5.13a3.5 3.5 0 0 1 0 6.74"/>`,
  layers: `<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/>`,
  "shield-check": `<path d="M12 3 4 6v6c0 4.5 3 7.5 8 9 5-1.5 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9Z"/>`,
};
