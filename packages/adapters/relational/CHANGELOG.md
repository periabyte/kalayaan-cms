# @kalayaan/adapter-relational

## 0.1.3

### Patch Changes

- Updated dependencies [a80346b]
  - @kalayaan/config@0.1.3
  - @kalayaan/core@0.1.3

## 0.1.2

### Patch Changes

- 706e3b4: Add an MIT `LICENSE` at the repo root and `"license": "MIT"` to every package.json.
  Every published package previously showed "License: none" on its npm page.
- Updated dependencies [706e3b4]
  - @kalayaan/config@0.1.2
  - @kalayaan/core@0.1.2

## 0.1.1

### Patch Changes

- @kalayaan/config@0.1.1
- @kalayaan/core@0.1.1

## 0.1.0

### Minor Changes

- a709a05: Auto-generate slug fields from their source.

  Slug fields (`field.slug({ from: "title" })`) previously stored whatever the client
  sent — nothing if left blank. Now:

  - **Server (guarantee):** on create, when a slug field is empty, the relational adapter
    generates one with `slugify(source)` — so slugs always exist regardless of client
    (admin, MCP, API keys). Applies to D1/Postgres/MySQL.
  - **Admin (live preview):** while creating a new entry, the editor fills the slug from
    its source field as you type, until you edit the slug yourself; existing entries keep
    their slug stable.
  - **Auto-dedupe:** for `unique` slug fields, a colliding slug (generated or provided) is
    disambiguated with a numeric suffix — `dupe-title`, `dupe-title-2`, `dupe-title-3` —
    scoped per-locale for localized collections. Best-effort against concurrent writes;
    the DB's unique constraint remains the hard guarantee.

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
  - @kalayaan/config@0.1.0
  - @kalayaan/core@0.1.0
