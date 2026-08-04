---
title: Deployment
description: "How kalayaan deploy provisions Workers, D1, R2, and KV on your Cloudflare account, applies migrations, and runs in CI. Kalayaan CMS documentation."
# Sidebar label and page H1 stay short (title above); this overrides just
# the <title> tag, which leads with the category for search. Starlight
# merges frontmatter head last and dedupes by tag, so this replaces its
# default `<title>` rather than adding a second one.
head:
  - tag: title
    content: "Deploying a CMS to Cloudflare Workers, D1, R2 & KV | Kalayaan CMS"
---

## What `kalayaan deploy` does

`kalayaan deploy` is idempotent — safe to run again and again as your project evolves. Each run:

1. Provisions D1, R2, and KV (and Hyperdrive/Vectorize, if your config uses an external database or
   semantic search) — skipping anything that already exists.
2. Applies any pending, **non-destructive** schema migration to the remote database.
3. Uploads the Worker and the admin SPA (served as Workers Assets).
4. Attaches a custom domain, if configured — see the
   [custom domains guide](/guides/custom-domains/).
5. Sets up first-run secrets, and prints the live URL.

Destructive migrations (e.g. dropping a column) are never applied automatically — they need
`kalayaan migrate --allow-destructive`, run deliberately after reviewing the SQL with `--dry-run`.

## Credentials

Locally, `kalayaan deploy`/`down`/`doctor` read credentials from `~/.kalayaan/credentials.json`,
written once by `kalayaan login`. For CI or any non-interactive environment, set:

```sh
EDGE_API_TOKEN=...
EDGE_ACCOUNT_ID=...
```

These take priority over the stored credentials, so a CI runner never needs `kalayaan login`.

## Tearing down

```sh
npx kalayaan down
```

Detaches any custom domain, then deletes the Worker and every resource it provisioned — D1, R2,
KV, and Hyperdrive/Vectorize if enabled. Asks for confirmation unless you pass `--yes`.

## Deploying from GitHub Actions

The `kalayaan/deploy-action` GitHub Action wraps `kalayaan deploy`:

```yaml
name: Deploy CMS
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: cms
        uses: kalayaan/deploy-action@v1
        with:
          cloudflare-api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          cloudflare-account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          working-directory: .
      - run: echo "Deployed to ${{ steps.cms.outputs.url }}"
```

| Input | Required | Description |
|---|---|---|
| `cloudflare-api-token` | yes | Token with Workers/D1/R2/KV — plus DNS + Workers Routes for a custom domain. `kalayaan login` mints one with the right scopes. |
| `cloudflare-account-id` | yes | Your Cloudflare account ID. |
| `working-directory` | no (`.`) | Directory containing `cms.config.ts`. |
| `database-url` | no | Postgres/MySQL connection string (external-DB projects only). |
| `node-version` | no (`20`) | Node.js version. |
| `args` | no | Extra flags for `kalayaan deploy`, e.g. `--domain blog.example.com`. |

It outputs `url` — the deployed Worker URL. As with the CLI, only non-destructive migrations run
automatically; the action never passes `--allow-destructive` on its own.

## Free tier by default

`kalayaan init` only scaffolds free services by default. `doctor` and `deploy` print a heads-up the
moment your config turns on the one paid feature (semantic search, which needs Vectorize) — so you
always know before you deploy whether you're still on the free path.
