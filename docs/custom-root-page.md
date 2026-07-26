# Serving your own page at `/`

Kalayaan is headless: there's no "root page" or homepage concept in `cms.config.ts`. By default,
hitting `/` on a deployed site shows a small **branded Kalayaan splash** — the Worker serves it
directly (`GET /` in the runtime), and `/` is listed in the generated `wrangler.json`'s
`run_worker_first` so the Worker handles it instead of the static assets. If you want `/` to show
your own content instead, that's a hand-edit to the assets directory (below), not a config option.

> **Blank `/`?** If your deployed site shows a blank page at `/` instead of the splash, your
> deploy predates the fix that adds `/` to `run_worker_first` (Kalayaan ≥ 0.3.2). Update and
> redeploy: `npx kalayaan update && npx kalayaan deploy`.

## How `/` is served

The root path `/` is in `run_worker_first`, so the Worker answers it (the splash). Every other
non-API path — `/admin`, its assets, anything you add — is served by Cloudflare's static Assets
binding, which points at the built admin SPA. That SPA's router is scoped to `/admin`; the admin
app lives there, and unmatched non-API paths fall back to its `index.html`.

## Simpler alternative: put the CMS on a subdomain

Before reaching for the workaround below, consider whether you actually need your homepage and
the CMS on the *same* domain at all. If not, deploy Kalayaan to a subdomain instead — e.g.
`cms.example.com` or `content.example.com` (`kalayaan init`/`kalayaan doctor` will nudge you toward
this) — and host your own site on the root domain (`example.com`) however you like: a separate
Cloudflare Pages/Workers project, a different host entirely, whatever fits. No asset-merging, no
rebuilding the admin SPA with a different base — each domain just serves its own thing. See
[`docs/custom-domains.md`](custom-domains.md) for attaching a domain.

The rest of this doc is for the case where you specifically want both on one domain.

## Usage — serving your own content at `/`

1. Build your own static site (plain HTML, or any static-site generator's output) that fetches
   content from Kalayaan's `/api/v1/:collection` REST endpoint or `/api/graphql`.
2. Rebuild the admin SPA with a non-root base so its own asset references resolve under
   `/admin/` instead of `/`:
   ```sh
   cd packages/admin   # or wherever @kalayaan/admin is built from
   vite build --base=/admin/
   ```
3. Create a merged assets directory: your site's files at the top level (`index.html`,
   `assets/`, etc.), and the rebuilt admin SPA under an `admin/` subfolder.
   ```
   dist-merged/
     index.html         # your homepage
     assets/            # your homepage's JS/CSS
     admin/
       index.html        # rebuilt admin SPA (base: /admin/)
       assets/
   ```
4. Point Kalayaan's deploy at that merged directory instead of the default admin build:
   ```sh
   npx kalayaan deploy --assets-dir ./dist-merged
   npx kalayaan dev --assets-dir ./dist-merged   # to preview locally first
   ```
5. Keep `not_found_handling: "single-page-application"` (the default) if your own homepage is
   itself an SPA that needs client-side routing fallback; switch it to `"404-page"` in
   `wrangler.jsonc` if you'd rather unmatched paths get a real 404.

## Using a framework for your homepage

Whether this works depends on whether the framework needs a server at request time.

**Static-output frameworks** — Next.js (`output: "export"`), Astro (static mode), Gatsby, Hugo,
or a plain Vite/React/Vue/Svelte build — all build down to plain HTML/CSS/JS, so they drop
straight into step 1 above: run the framework's build and use its output directory as the
top level of the merged assets directory, same as a hand-written static site.

**SSR frameworks** — Next.js in default (server) mode, Remix, SvelteKit with a server, etc. —
don't fit this approach. Cloudflare Workers Assets only serves static files; a framework that
renders at request time needs to run as its own Worker, which is a bigger setup than the assets
merge above:

- `kalayaan deploy` attaches your domain via Cloudflare's **Workers Custom Domains** API (see
  [`docs/custom-domains.md`](custom-domains.md)), which binds one domain to one Worker — it has
  no path-based routing between multiple Workers.
- To serve an SSR app at `/` and keep `/api/*` / `/admin/*` on the Kalayaan Worker on the same
  domain, you'd need to switch from Custom Domains to Cloudflare **Workers Routes**
  (path-pattern-based, multiple Workers per zone) and hand-configure the route precedence —
  `kalayaan deploy` doesn't set this up.
- The simpler path: deploy the SSR framework as its own Worker using its Cloudflare adapter
  (e.g. `@cloudflare/next-on-pages`, or the framework's built-in Workers/Pages adapter), have it
  fetch content from Kalayaan's `/api/v1` or `/api/graphql`, and either host it on a separate
  subdomain or take on the manual Workers Routes setup above if you need it on the same domain.

## Limitations

- This is a manual workflow, not something `kalayaan init` scaffolds — there's no built-in way
  to keep your homepage and the admin SPA in sync automatically.
- `kalayaan deploy` re-uploads whatever directory you pass with `--assets-dir` each time, so
  re-running the merge step (or scripting it) is on you.
- `/api/*`, `/admin/api/*`, `/media/*`, and `/mcp*` always route to the Worker regardless of
  what's in the assets directory — you can't shadow those paths with static files.
