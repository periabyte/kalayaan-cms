# @kalayaan/adapter-mysql

## 0.3.1

### Patch Changes

- @kalayaan/adapter-relational@0.3.1
- @kalayaan/config@0.3.1
- @kalayaan/core@0.3.1

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
  - @kalayaan/adapter-relational@0.3.0

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
  - @kalayaan/adapter-relational@0.2.0
  - @kalayaan/core@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [a80346b]
  - @kalayaan/config@0.1.3
  - @kalayaan/core@0.1.3
  - @kalayaan/adapter-relational@0.1.3

## 0.1.2

### Patch Changes

- 706e3b4: Add an MIT `LICENSE` at the repo root and `"license": "MIT"` to every package.json.
  Every published package previously showed "License: none" on its npm page.
- Updated dependencies [706e3b4]
  - @kalayaan/config@0.1.2
  - @kalayaan/core@0.1.2
  - @kalayaan/adapter-relational@0.1.2

## 0.1.1

### Patch Changes

- @kalayaan/adapter-relational@0.1.1
- @kalayaan/config@0.1.1
- @kalayaan/core@0.1.1

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

- Updated dependencies [a709a05]
- Updated dependencies [a709a05]
- Updated dependencies [a709a05]
- Updated dependencies [a709a05]
- Updated dependencies [a709a05]
  - @kalayaan/config@0.1.0
  - @kalayaan/core@0.1.0
  - @kalayaan/adapter-relational@0.1.0
