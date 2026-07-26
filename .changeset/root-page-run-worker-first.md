---
"@kalayaan/cli": patch
---

Fix the deployed site's `/` rendering blank instead of the branded root page.

The runtime serves a branded splash at `GET /`, but the generated `wrangler.json` didn't list `/`
in `run_worker_first`, so Cloudflare's Assets binding served the admin SPA's `index.html` at `/`
instead — and since the SPA is scoped to `/admin`, it rendered blank. `/` is now included in
`run_worker_first` (only the exact root; `/admin` and other paths still fall through to Assets), so
the root page renders. Existing sites need a redeploy (`kalayaan update && kalayaan deploy`) to pick
up the regenerated config.
