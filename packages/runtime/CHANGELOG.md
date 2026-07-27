# @kalayaan/runtime

## 0.4.0

### Minor Changes

- 6c3cfcf: Business-logic extension seam: plugin routes, custom RBAC subjects, and a `Module` system.

  - **`Plugin.routes`** — business-specific HTTP endpoints, mounted at `/api/ext/*`, with per-route
    public/required auth, an optional declared permission gate, and a `RouteContext.db` that reuses
    the same RBAC- and lifecycle-hook-aware write pipeline (versioning, webhooks, hooks) as the
    built-in admin CRUD API.
  - **Custom RBAC subjects** — a role can now grant a plugin-declared subject (e.g.
    `"marketplace:order"`), not just collections and the fixed system areas.
  - **`Module` + `cms.modules.ts`** — a `Plugin` plus build-time `collections` (merged into the
    project's config before `resolveConfig`/`snapshotOf`, so `kalayaan migrate` builds the tables)
    and `provides.payment`, a factory building a `PaymentProvider` from the live per-request `env`.
    `PaymentProvider` mirrors the existing `AIProvider`/`EmailProvider` seam;
    `StripePaymentProvider` in `@kalayaan/runtime` is the reference implementation, re-exported
    through `kalayaan`.

  See the new [Plugins & modules](https://kalayaan.periabyte.dev/guides/plugins-and-modules) guide.

### Patch Changes

- Updated dependencies [6c3cfcf]
  - @kalayaan/core@0.4.0
  - @kalayaan/config@0.4.0
  - @kalayaan/adapter-d1@0.4.0
  - @kalayaan/adapter-mysql@0.4.0
  - @kalayaan/adapter-postgres@0.4.0
  - @kalayaan/storage-r2@0.4.0

## 0.3.2

### Patch Changes

- @kalayaan/adapter-d1@0.3.2
- @kalayaan/adapter-mysql@0.3.2
- @kalayaan/adapter-postgres@0.3.2
- @kalayaan/config@0.3.2
- @kalayaan/core@0.3.2
- @kalayaan/storage-r2@0.3.2

## 0.3.1

### Patch Changes

- edd2bb7: Redesign the API root (`/`) as a branded, headless splash.

  Browser navigations to `/` now render a single branded page (the "Dawn" theme, with the Cubao Free
  display face served locally via the Assets binding) with one call-to-action to the project site,
  instead of listing the Admin / REST / GraphQL / MCP entry points. The page no longer exposes internal
  route paths; the JSON 404 for non-HTML clients is unchanged.
  - @kalayaan/adapter-d1@0.3.1
  - @kalayaan/adapter-mysql@0.3.1
  - @kalayaan/adapter-postgres@0.3.1
  - @kalayaan/config@0.3.1
  - @kalayaan/core@0.3.1
  - @kalayaan/storage-r2@0.3.1

## 0.3.0

### Minor Changes

- 038d5b1: Related-field population, media-upload API keys, and Kalayaan-branded auth identifiers.

  - **Populate related fields on single-document reads.** `GET /api/v1/:collection/:idOrSlug?populate=author,cover`
    (and the admin single-GET) now resolve relation and media fields into nested objects — previously
    only list endpoints supported `?populate=`. Threaded via a new `populate` on `DocRef` reusing the
    adapter's existing batched hydration.
  - **GraphQL resolves relations and media as nested objects.** A `relation` field now resolves to the
    target collection's object type (`author { name }`) and a `media` field to a new `Media` type
    (`id`, `url`, `filename`, `mime`, `size`, `width`, `height`, `alt`), single or list. The resolver
    populates exactly the fields the query selects (depth 1, batched — no N+1).
    **Breaking (GraphQL):** relation/media fields used to return a raw id string; a query selecting one
    as a scalar (`{ posts { author } }`) must now select subfields (`author { id }`).
  - **API keys can be scoped to the media library.** The key-creation form adds a "Media library"
    option, so you can mint a token that uploads/manages media (`create` on the `media` subject)
    without granting full `manage` over every system area. `subjects: "*"` still matches collections
    only, so media gets its own grant.
  - **Rebranded auth identifiers.** Generated API tokens now use the `kcms_` prefix (was `ecms_`), and
    the session/CSRF cookies are `kalayaan_session` / `kalayaan_csrf` (were `edgecms_*`). Existing API
    keys keep working (validated by hash); active sessions are logged out once and sign back in.

### Patch Changes

- Updated dependencies [038d5b1]
  - @kalayaan/config@0.3.0
  - @kalayaan/core@0.3.0
  - @kalayaan/adapter-d1@0.3.0
  - @kalayaan/adapter-postgres@0.3.0
  - @kalayaan/adapter-mysql@0.3.0
  - @kalayaan/storage-r2@0.3.0

## 0.2.0

### Minor Changes

- b8f673f: Media fields, singleton collections, and a `kalayaan update` command.

  - **Media fields — multiple + typed.** `field.media()` now takes `many: true` for
    an ordered gallery/attachments field (stored in a `<collection>_<field>` join
    table referencing `media`, ordered by `sort`) and `accept: ["image" | "video" |
"file"]` to restrict what a field accepts. The admin media picker filters by kind,
    supports multi-select with reordering, and shows non-image assets; GraphQL types a
    many-media field as an ordered id list.
  - **Singleton collections.** `collection(name, { singleton: true })` models single-page
    content (About, Home, Contact): exactly one entry per locale, edited directly with no
    list or "new entry", localization and versioning still apply. Enforced at the API
    layer (a second create returns 409) with no extra DDL.
  - **`kalayaan update`.** Updates a project's Kalayaan dependencies to the latest release
    (or `--to <version>`): detects the package manager, bumps `kalayaan` + any `@kalayaan/*`
    packages, installs, and surfaces any pending schema migration so you know when a
    `migrate` + redeploy is due. Supports `--dry-run`, `--no-install`, and `--yes`.

### Patch Changes

- Updated dependencies [b8f673f]
  - @kalayaan/config@0.2.0
  - @kalayaan/adapter-d1@0.2.0
  - @kalayaan/adapter-postgres@0.2.0
  - @kalayaan/adapter-mysql@0.2.0
  - @kalayaan/core@0.2.0
  - @kalayaan/storage-r2@0.2.0

## 0.1.3

### Patch Changes

- a80346b: Add per-package READMEs and npm metadata (description, homepage, repository, bugs) — the
  published packages had no README on npm.
- Updated dependencies [a80346b]
  - @kalayaan/config@0.1.3
  - @kalayaan/core@0.1.3
  - @kalayaan/adapter-d1@0.1.3
  - @kalayaan/adapter-mysql@0.1.3
  - @kalayaan/adapter-postgres@0.1.3
  - @kalayaan/storage-r2@0.1.3

## 0.1.2

### Patch Changes

- 706e3b4: Add an MIT `LICENSE` at the repo root and `"license": "MIT"` to every package.json.
  Every published package previously showed "License: none" on its npm page.
- Updated dependencies [706e3b4]
  - @kalayaan/config@0.1.2
  - @kalayaan/core@0.1.2
  - @kalayaan/adapter-d1@0.1.2
  - @kalayaan/adapter-postgres@0.1.2
  - @kalayaan/adapter-mysql@0.1.2
  - @kalayaan/storage-r2@0.1.2

## 0.1.1

### Patch Changes

- @kalayaan/adapter-d1@0.1.1
- @kalayaan/adapter-mysql@0.1.1
- @kalayaan/adapter-postgres@0.1.1
- @kalayaan/config@0.1.1
- @kalayaan/core@0.1.1
- @kalayaan/storage-r2@0.1.1

## 0.1.0

### Minor Changes

- a709a05: Access control, email invites, public submissions, guided onboarding, and custom domains.

  - **RBAC + scoped tokens:** config-defined roles and permissions (an `Ability`
    model: `action × subject`) enforced across the REST and MCP surfaces for users
    and API tokens alike. API tokens gained granular grants, expiry, and
    revocation; an `audit_log` records management actions.
  - **Email invites:** an `EmailProvider` seam with a Cloudflare Email Sending
    provider and an `email` config block. Admins invite by email; the invitee sets
    their own password via a signed accept-link, degrading to a copyable link when
    email isn't configured.
  - **Public access:** a reserved `public` role gives anonymous requests an
    ability; the content API gates reads on it, and a moderated public submission
    endpoint (anonymous create → draft) sits behind Cloudflare Turnstile + per-IP
    rate limiting.
  - **Guided onboarding:** `edgecms login` (pre-filled token page + account
    auto-discovery, credentials stored under `~/.edgecms/`), and `edgecms init` is
    now a wizard that picks content models and services and can deploy at the end.
    Defaults enable only free Cloudflare services, with a heads-up before the one
    paid feature (semantic search → Vectorize).
  - **Custom domains:** a `domain` config option (or `deploy --domain`); deploy
    attaches a Workers Custom Domain with automatic DNS + TLS and detaches it on
    `down`. The login token now carries DNS + Workers Routes permissions.

- a709a05: Ship the redesigned admin dashboard and the Phase-2/AI backend it runs on.

  **Admin UI** — full rebuild of `@kalayaan/admin` to the new design: a CSS-variable
  token system with light/dark theming and a runtime toggle, Geist type, a command
  palette (⌘K), collapsible grouped sidebar, filter pills with saved filters,
  toggleable table columns, a schema-driven editor with a TipTap toolbar, a
  signature publish bar (unsaved-diff, scheduling, per-locale state), an AI-assist
  panel, a version-history timeline with restore, media alt-text, tabbed settings
  (users / API keys / webhooks / AI), toasts with undo, and typed-confirm dialogs.

  **Backend** — derived publish `status` (draft/published/scheduled) exposed as
  `publishStatus` alongside any user `status` field; append-only version history
  (`_versions`) with list + restore endpoints; outbound webhooks (HMAC-signed,
  fire-and-forget) with admin CRUD; per-user saved filters; Workers-AI routes
  (alt-text / improve / translate) behind an injectable `AIProvider`, with
  auto-alt-text and image-dimension sniffing on upload; and a `features` block on
  `/admin/api/schema` for capability detection.

  **Migrations** — `edgecms migrate`/`deploy` now reconcile the fixed system tables
  on **every** run (idempotent `CREATE ... IF NOT EXISTS`), so newly added system
  tables (webhooks, saved_filters) reach already-migrated projects, while the
  config-diff journal and its "nothing to migrate" fast path are unchanged.

  **CLI** — `edgecms dev` and `edgecms deploy` now serve the built admin SPA
  (`@kalayaan/admin`'s `dist/`) as Workers Assets automatically, and provision the
  Workers AI binding when `ai.enabled`.

- a709a05: Add a Strapi-style one-time admin setup flow and an `edgecms down` teardown command.

  - **Dedicated first-run screen.** The admin now auto-detects when a deployment has no
    admin yet (via a new public `GET /admin/api/auth/setup` → `{ needsSetup }`) and shows a
    one-time "Create your first administrator" screen with password confirmation, flipping
    to the sign-in screen once the account exists. The login page no longer carries a
    manual setup toggle.
  - **Deploy points you at it.** After a successful deploy, `edgecms deploy` polls the
    workers.dev route until it's actually live, then prints the `/admin` setup link instead
    of prompting for a password. `--admin-email` + `--admin-password` (or
    `EDGECMS_ADMIN_PASSWORD`) still bootstrap the admin non-interactively for CI/agents.
  - **`edgecms down`.** Tears down everything a deploy provisioned — the Worker, D1, KV
    namespaces, R2 bucket, and any Vectorize/Hyperdrive — reading `.edgecms/state.json`,
    confirming first (unless `--yes`), deleting the Worker before its bindings, and
    resetting local state so a later deploy provisions cleanly.

- a709a05: Close the Phase-2 editorial leftovers and wire plugin custom field types end-to-end.

  **Custom field types (plugin) — now a working, end-to-end flow.** A new `custom`
  field type (`field.custom("<typeName>", { control, options })`) can be authored in
  config, is stored as JSON text (like `richText`) across every dialect, and is
  validated on write by the plugin's registered `fieldTypes[typeName]` validator —
  the previously dead `PluginHost.fieldTypes()` link. `/admin/api/schema` advertises
  the registered type names via `features.customFieldTypes`, and the admin renders a
  custom field with a built-in widget chosen by its `control` hint (text / textarea /
  number / select / boolean / json). Projects register plugins via a new optional
  `cms.plugins.ts` (default-exports a `Plugin[]`); the CLI bundles it and the
  generated Worker entry passes it to `createApp`.

  _Note:_ because the admin is a prebuilt static bundle, custom fields render through
  declarative `control` hints, not injectable React components.

  **MT-review write path.** Admin writes accept `?review=mt`, which records the
  resulting `_versions` row with status `mt-review` — so the "Needs review" badge and
  filter now light with real data. The editor's Translate action persists the target
  locale with this intent.

  **True per-locale editing.** `GET /admin/api/:collection/:id?locale=` resolves a
  locale's own row (a sibling sharing `entity_id`), returning `null` when the variant
  doesn't exist yet. The editor's Locales panel is now a switcher: pick a locale to
  load/edit its document, or start a fresh draft that saves as a linked variant and
  publishes independently.

  **AI assist — Summarize + SEO.** `AIProvider` gains `summarize` and `seo`; two new
  routes (`/admin/api/ai/summarize`, `/admin/api/ai/seo`) and editor actions sit under
  the existing `editorial-assist` feature gate. _Breaking:_ `AIProvider` implementers
  must add the two methods.

- a709a05: Phases 3–5: adapters, AI, and distribution.

  - **Adapters (Phase 3):** extracted a `SqlDialect` abstraction from D1's SQLite
    specifics and added `@kalayaan/adapter-postgres` and `@kalayaan/adapter-mysql`
    (real transactions, native DDL) plus `@kalayaan/storage-s3`. The CLI provisions
    Hyperdrive for external databases and the runtime selects the adapter from
    `database.adapter`.
  - **AI (Phase 4):** semantic search — `AIProvider.embed`, a Vectorize-backed
    index, embed-on-publish, and a public `/api/v1/search` with a SQL `contains`
    fallback.
  - **Distribution (Phase 5):** plugin lifecycle hooks + custom field types; a
    config-generated GraphQL read API behind a flag; an MCP server at `/mcp` with
    scoped tools; a Cloudflare Access auth mode; the `edgecms-skill` package; and
    a `deploy` GitHub Action.

### Patch Changes

- ba39e65: `edgecms deploy` now onboards the email `from`-address's domain for Cloudflare Email Routing +
  Sending automatically via the REST API, instead of requiring a manual `wrangler email sending
enable <domain>` step. Best-effort, same posture as custom domain attach: if the domain isn't a
  Cloudflare zone yet (or the token lacks the new email permission), the deploy still succeeds and
  invites fall back to a copyable link. `edgecms login`'s token template now also requests Zone ·
  Email Routing Settings/Rules · Edit.
- a709a05: Cap PBKDF2 password hashing at 100,000 iterations (was 600,000).

  Cloudflare's deployed WebCrypto rejects PBKDF2 iteration counts above 100k with
  `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported`,
  so every first-run admin setup and login threw on a real Worker (returning a generic 500) even though it worked in local dev, whose workerd doesn't enforce the cap. 100k
  is the platform maximum; a regression test now pins the iteration count at or below it.

- Updated dependencies [a709a05]
- Updated dependencies [a709a05]
- Updated dependencies [a709a05]
- Updated dependencies [a709a05]
  - @kalayaan/config@0.1.0
  - @kalayaan/core@0.1.0
  - @kalayaan/adapter-d1@0.1.0
  - @kalayaan/adapter-postgres@0.1.0
  - @kalayaan/adapter-mysql@0.1.0
  - @kalayaan/storage-r2@0.1.0
