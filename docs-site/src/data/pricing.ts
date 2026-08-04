/* The cost story, shared by the landing page's #cost section and /pricing so
   the two can't drift apart. Every `limit` below is Cloudflare's own published
   free-tier allowance, read off the page linked in that row's `docs` field on
   2026-07-29 — if Cloudflare changes one, change it here and both pages
   update. Don't add a number you haven't checked against those pages: the
   honesty of the whole cost claim rests on these being right. */

export interface CostRow {
  /** Cloudflare product name. */
  service: string;
  /** What Kalayaan uses it for — the landing table's middle column. */
  does: string;
  /** Monthly cost on the free tier. */
  cost: string;
  /** The actual free-tier allowance, itemised — /pricing only. */
  limits: string[];
  /** What running out of the allowance looks like in practice — /pricing only. */
  whenYouPay: string;
  /** Cloudflare's own limits page for this product. */
  docs: string;
}

export const costRows: CostRow[] = [
  {
    service: "Workers",
    does: "runs the CMS admin and serves your API",
    cost: "$0.00",
    limits: [
      "100,000 requests per day",
      "10 ms CPU time per invocation",
      "Static asset requests are free and unlimited — they don't count against the 100,000",
    ],
    whenYouPay:
      "Only requests that actually invoke the Worker are metered — API calls, admin data fetches, and the branded root page — so 100,000/day is roughly 3 million dynamic requests a month. Past the daily limit those requests get a 429 until it resets; the paid Workers plan starts at $5/month.",
    docs: "https://developers.cloudflare.com/workers/platform/limits/",
  },
  {
    service: "D1",
    does: "your default SQL database",
    cost: "$0.00",
    limits: [
      "5 million rows read per day",
      "100,000 rows written per day",
      "5 GB of storage across your whole account",
      "500 MB per individual database",
    ],
    whenYouPay:
      "Reads are the binding limit long before storage is — 500 MB is a very large amount of text content, and your site is one database. If you outgrow either, you can move to the paid D1 tier or point config at your own Postgres/MySQL over Hyperdrive instead.",
    docs: "https://developers.cloudflare.com/d1/platform/pricing/",
  },
  {
    service: "R2",
    does: "media and file storage",
    cost: "$0.00",
    limits: [
      "10 GB-month of storage",
      "1 million Class A operations per month (writes, lists)",
      "10 million Class B operations per month (reads)",
      "Egress is always free, on every tier",
    ],
    whenYouPay:
      "Storage is what runs out first: 10 GB is thousands of images but not a video library. Past it, R2 is $0.015 per GB-month — with no bandwidth charge, which is the line item that makes media expensive elsewhere.",
    docs: "https://developers.cloudflare.com/r2/pricing/",
  },
  {
    service: "KV",
    does: "cache and edge config",
    cost: "$0.00",
    limits: [
      "100,000 reads per day",
      "1,000 writes per day, to different keys",
      "1 GB of stored data per account",
    ],
    whenYouPay:
      "Kalayaan uses KV for session and cache entries, not per-request writes, so the 1,000/day write limit is comfortable at normal editing volume. Heavy cache invalidation is the one pattern that would push you onto the paid plan.",
    docs: "https://developers.cloudflare.com/kv/platform/limits/",
  },
  {
    service: "Workers Assets",
    does: "static hosting for the admin SPA",
    cost: "$0.00",
    limits: [
      "Static asset requests are free and unlimited, on any plan",
      "20,000 files per Worker version, 25 MiB per file",
    ],
    whenYouPay:
      "You don't. Serving the admin bundle is free at any traffic level; only requests that invoke the Worker count toward the Workers request limit.",
    docs: "https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/",
  },
  {
    service: "Workers AI",
    does: "alt-text, translation, editorial assist",
    cost: "$0.00",
    limits: [
      "10,000 Neurons per day (Cloudflare's unit of inference)",
      "Resets daily at 00:00 UTC; no card on file required",
    ],
    whenYouPay:
      "Alt-text and short translations are cheap in Neurons — the daily allowance covers ordinary editorial use. Bulk-translating a large back catalogue in one sitting is the case that exhausts it, and it simply resets the next day. Beyond it, the paid plan is $0.011 per 1,000 Neurons.",
    docs: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  },
  {
    service: "Turnstile",
    does: "spam-free public submissions",
    cost: "$0.00",
    limits: [
      "Unlimited challenges — no monthly verification cap",
      "Up to 20 widgets per account, 10 hostnames per widget",
    ],
    whenYouPay:
      "Turnstile's free plan is the product for almost everyone — there is no paid tier you need for a CMS submission form.",
    docs: "https://developers.cloudflare.com/turnstile/plans/",
  },
];

/** The honest caveats — things that are not $0, said plainly. */
export const notFree = [
  {
    title: "Semantic search (Vectorize)",
    body: "The one optional feature that isn't free. Vectorize requires a paid Workers plan ($5/month), and Kalayaan flags this before you enable it — never after. Keyword search works on the free tier and is on by default.",
  },
  {
    title: "An external database (Hyperdrive)",
    body: "If you point config at your own Postgres or MySQL instead of D1, you pay whoever hosts it. Hyperdrive itself needs a paid Workers plan. D1 — the default — costs nothing.",
  },
  {
    title: "The domain name itself",
    body: "Attaching a custom domain is free; owning one is not. Registration runs roughly $10/year at Cloudflare Registrar's at-cost pricing. Until you buy one, your site is live on a free *.workers.dev URL.",
  },
];
