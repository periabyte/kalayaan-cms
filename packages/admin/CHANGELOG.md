# @kalayaan/admin

## 0.1.3

### Patch Changes

- a80346b: Add per-package READMEs and npm metadata (description, homepage, repository, bugs) — the
  published packages had no README on npm.

## 0.1.2

### Patch Changes

- 706e3b4: Add an MIT `LICENSE` at the repo root and `"license": "MIT"` to every package.json.
  Every published package previously showed "License: none" on its npm page.
- e35d57f: Fix a plugin-contributed custom field type with `control: "select"` still rendering the
  native `<select>` (`registry.tsx`'s `CustomFieldEditor`) instead of the shadcn/Radix
  `Select` already used everywhere else in the admin UI. The built-in `field.select()` type
  was already correct — only the custom-field-type variant had the leftover.

## 0.1.1

### Patch Changes

- 3ed4a1f: Publish `@kalayaan/admin` to npm instead of keeping it `private`.

  `kalayaan`/`@kalayaan/cli` resolves `@kalayaan/admin`'s built `dist/` at runtime
  (`admin-assets.ts`'s `require.resolve("@kalayaan/admin/package.json")`) to serve the
  admin SPA in `dev`/`deploy`. Marking it `private` meant it never actually got published,
  so a real `npm install kalayaan` outside this monorepo 404'd on `@kalayaan/admin` — the
  CLI was unusable for anyone who wasn't already inside the workspace with `workspace:*`
  symlinks. Also added `"files": ["dist"]` to match every other published package's
  convention.

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

### Patch Changes

- a709a05: Migrate the admin UI's hand-written component system to shadcn/ui (Radix-backed primitives under
  `src/components/ui/*`) and all forms to react-hook-form + zod. No user-facing behavior changes;
  overlays (command palette, confirm dialogs, popovers, media picker, dropdowns, tabs) gain real focus
  traps, portals, and keyboard/ARIA handling, and every form gets typed client-side validation. Design
  tokens are unchanged in name/values, just re-expressed as HSL channel triplets so Tailwind opacity
  modifiers work with the new components.
