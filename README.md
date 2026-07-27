# Kalayaan

A config-driven, self-deploying headless CMS for Cloudflare. Define your content in one
`cms.config.ts`, run a short guided setup (`login → init → deploy`), and get a live site on your
own domain — running free on Cloudflare's Workers, D1, R2, and KV. Pluggable database adapters,
Workers AI features, a schema-driven admin SPA, and a REST / GraphQL / MCP API are all built in.

**Mission:** free, low-friction self-hosting for solo devs and aspiring builders — you don't need a
big budget to put your work online. The core CMS runs entirely on Cloudflare's permanent free tier.

## Quickstart

```sh
npx kalayaan login          # one-time Cloudflare sign-in (guided token, auto account discovery)
npx kalayaan init my-site   # guided wizard: content models, services, domain — can deploy at the end
cd my-site
npm install
npx kalayaan dev            # runs locally under workerd, no Cloudflare account needed
```

`kalayaan init` is a guided wizard: it asks for your content models and which services to turn on
(AI features, email invites, a custom domain, public submissions), writes `cms.config.ts`, and can
run the deploy for you at the end. To deploy later:

```sh
npx kalayaan deploy                              # → https://my-site.<you>.workers.dev
npx kalayaan deploy --domain blog.example.com    # attach your own domain (DNS + TLS automatic)
```

`deploy` idempotently provisions D1, R2, and KV, applies any pending schema migration, uploads the
Worker **and the admin SPA**, attaches any custom domain, sets up first-run secrets, and prints the
live URL — safe to re-run. Credentials come from `kalayaan login` (stored at `~/.kalayaan/`), or from
`EDGE_API_TOKEN` + `EDGE_ACCOUNT_ID` for CI. On first deploy, create your admin account
at `<url>/admin` (or bootstrap it non-interactively with `--admin-email` / `--admin-password`).

Tear it all down with `npx kalayaan down`.

## Defining a schema

Everything is derived from `cms.config.ts`:

```ts
import { defineConfig, collection, field } from "kalayaan";

export default defineConfig({
  name: "my-site",
  domain: "blog.example.com",                                   // custom domain (optional)
  ai: { enabled: true, features: ["alt-text", "translate", "editorial-assist"] },
  email: { from: "hello@yourdomain.com" },                      // email invites (optional)
  collections: [
    collection("posts", {
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ from: "title", unique: true }),
        body: field.richText(),
        cover: field.media(),
        author: field.relation("authors"),
        tags: field.relation("tags", { many: true }),
        status: field.select(["draft", "published"], { default: "draft" }),
      },
      versioning: true,
      localization: ["en", "de"],
    }),
    collection("authors", {
      fields: { name: field.text({ required: true }), avatar: field.media() },
    }),
  ],
});
```

Editing this file and running `kalayaan migrate` diffs it against the last applied schema and emits
the SQL to apply the change (`--dry-run` previews; destructive changes need `--allow-destructive`).

## Features

**Content & authoring**
- Config-driven collections and fields (text, slug, rich text, media, relation, select, number,
  boolean, date, and plugin-contributed custom types)
- Draft → publish with scheduling, version history + restore, and localization
- Schema-driven admin SPA (React/Tailwind): command palette, TipTap editor, media library, a
  publish bar, saved filters, light/dark, mobile-responsive

**Delivery**
- Public REST content API (`/api/v1`, published-only, filter/sort/cursor-pagination/populate)
- Config-generated GraphQL read API (behind a flag)
- MCP server (`/mcp`) so AI agents can query and edit content with a scoped key
- Moderated public **submissions** — anonymous create → draft, behind Cloudflare Turnstile + rate
  limiting

**Data & storage**
- D1 (default), plus Postgres and MySQL via Hyperdrive (content plane); R2 or S3 for media

**Intelligence (Workers AI, free tier)**
- AI alt-text, translation, and editorial assist; optional semantic search (Vectorize — paid)

**Extensibility**
- `cms.plugins.ts`: lifecycle hooks, custom field types, and business-specific HTTP routes
  (`/api/ext/*`) with an RBAC- and hook-aware data API, plus custom RBAC subjects
- `cms.modules.ts`: self-contained features — build-time collections + routes/hooks + a
  `PaymentProvider` seam (Stripe reference impl) — see the
  [Plugins & modules guide](https://kalayaan.periabyte.dev/guides/plugins-and-modules)

**Access control**
- Config-defined roles & permissions (an `Ability` model), email/password login, Cloudflare Access
- Scoped API tokens with granular grants, expiry, and revocation; an audit log
- Email invites (Cloudflare Email Sending) with a signed accept-link flow, degrading to a copyable
  link when email isn't configured

**Ops**
- One guided CLI: `login`, `init` (wizard), `dev`, `migrate`, `deploy`, `doctor`, `down`, `logout`
- Idempotent provisioning of D1 / R2 / KV / Hyperdrive / Vectorize; custom domains; free-tier
  defaults with a heads-up before you enable the one paid feature
- `actions/deploy` GitHub Action; `kalayaan-skill` package for agent-driven deploys

## CLI commands

| Command | What it does |
|---|---|
| `kalayaan login` / `logout` | Guided Cloudflare sign-in (pre-filled token, account auto-discovery) → `~/.kalayaan/credentials.json` |
| `kalayaan init [dir]` | Guided setup wizard → scaffolds `cms.config.ts` + `package.json`; can deploy at the end |
| `kalayaan dev [--host]` | Run locally under workerd with local D1/R2/KV (`--host` for LAN access) |
| `kalayaan migrate [--dry-run] [--allow-destructive]` | Diff the schema and apply migrations to local D1 |
| `kalayaan deploy [--domain <host>]` | Provision + deploy to Cloudflare; attach a custom domain |
| `kalayaan doctor` | Validate config, credentials, wrangler, free-tier posture, and migration state |
| `kalayaan down [--yes]` | Detach domains and delete the deployed Worker + all resources |

## Monorepo layout

pnpm workspace + Turborepo. The full development plan — phases, milestones, and cross-cutting design
decisions — lives at [`docs/development-plan.md`](docs/development-plan.md).

| Package | What it is |
|---|---|
| `packages/config` | `defineConfig`/`collection`/`field` builders, Zod validation, roles/permissions, schema snapshots + diffing |
| `packages/core` | Query DSL types, `DatabaseAdapter`/`StorageAdapter`/`AIProvider`/`EmailProvider` contracts, the `Ability` RBAC model, `EdgeCMSError`, ulid/slug helpers |
| `packages/adapters/relational` | Shared SQL query builder + `RelationalAdapter` base + dialect interface |
| `packages/adapters/d1` | SQLite dialect, D1 executor, migration DDL emitter, system tables |
| `packages/adapters/postgres` · `packages/adapters/mysql` | Postgres / MySQL dialects over Hyperdrive (content plane) |
| `packages/storage/r2` · `packages/storage/s3` | R2- and S3-backed `StorageAdapter` |
| `packages/runtime` | The Hono app: content API, admin API, auth + RBAC, media, AI, GraphQL, MCP, submissions |
| `packages/admin` | The schema-driven React/Tailwind admin SPA |
| `packages/cli` | `kalayaan` — `login`/`init`/`dev`/`migrate`/`deploy`/`doctor`/`down` |
| `packages/kalayaan` | The umbrella package users install |
| `packages/conformance` | Adapter conformance test suite |
| `packages/skill` | `kalayaan-skill` — lets an AI agent scaffold + deploy a site |
| `examples/blog` | A working example scaffolded via `kalayaan init --template blog` |

## Development

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

Every package builds and tests independently via Turborepo; adapter and runtime tests run against
real D1/R2/KV bindings under Miniflare (`@cloudflare/vitest-pool-workers`), not mocks. The
Postgres/MySQL conformance suite is gated behind `EDGECMS_PG_URL` / `EDGECMS_MYSQL_URL` (dockerized
DBs).

## Status & roadmap

All five roadmap phases plus the access-control + onboarding layer have landed — see
[`docs/development-plan.md`](docs/development-plan.md) for the current, per-phase status. `kalayaan
login → deploy → down` has been run end-to-end against a real Cloudflare account. Notable open
items:

- **Eight bugs/UX gaps found driving the real deployed admin UI**, not yet fixed: author doesn't
  default to the current user, no user display-name field, a leftover native `<select>` (should be
  the shadcn `Select`), invites don't send a random password, `PATCH /api/media` 404s after
  generating an AI caption, media view opens a new tab instead of a lightbox, an inline-created tag
  stays draft when the post referencing it is published, and the sidebar AI tools are ambiguous
  about which field they affect. See `docs/development-plan.md`'s Status section for detail.
- External databases are **content-plane only** — the auth/media/version system stores are still
  D1-bound, so a full CMS can't yet run entirely on Postgres/MySQL. MongoDB is not implemented.
- Deferred polish: image transforms, presigned R2 uploads, Queue-backed webhooks + async alt-text,
  GraphQL mutations, MCP streaming, a docs site + Deploy-to-Cloudflare button. A Resend email
  provider is planned — see [`docs/roadmap-email-plugins.md`](docs/roadmap-email-plugins.md).

## Docs

- **[kalayaan.periabyte.dev](https://kalayaan.periabyte.dev/)** — the public docs site
  (quickstart, schema/config, roles & access, AI features, custom domains, deployment)
- [`docs/development-plan.md`](docs/development-plan.md) — the full plan + current status
- [`docs/custom-domains.md`](docs/custom-domains.md) — using your own domain
- [`docs/custom-root-page.md`](docs/custom-root-page.md) — serving your own page at `/`
- [`docs/roadmap-email-plugins.md`](docs/roadmap-email-plugins.md) — the pluggable-email roadmap
- [`docs/design-handoff.md`](docs/design-handoff.md) — marketing + product design briefs
- [`docs/releasing.md`](docs/releasing.md) — how to cut an npm release (GitHub Release → CI publish)
