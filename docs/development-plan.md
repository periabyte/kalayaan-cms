# Kalayaan — Development Plan (All Phases)

> In-repo snapshot of the working development plan. The living copy is kept in the maintainer's
> planning workspace; this file is the version-controlled reference. Read the **Status** section
> first — it names what's actually built and what's next.

## Status (updated 2026-07-26)

**All five phases have landed, plus a full access-control + onboarding layer; the admin UI runs on
real shadcn/ui + react-hook-form; and the project now ships to npm.** Everything is **merged to
`main`** in the repo **`github.com/periabyte/kalayaan-cms`**. **CI is green** on `main`
(`.github/workflows/ci.yml`), the **docs site is live** at `kalayaan.periabyte.dev`
(`.github/workflows/docs.yml`), and the packages are **published to npm** — latest release
**v0.3.1** (2026-07-26), cut via changesets and published by `.github/workflows/release.yml` using
npm **OIDC trusted publishing** (no `NPM_TOKEN`). Release flow is documented in `docs/releasing.md`.
Repo root stays green: `pnpm build && pnpm typecheck && pnpm test`.

**The open backlog now lives in a single place:** the **[Roadmap](../docs-site/src/content/docs/roadmap.md)**
page in the docs site (`kalayaan.periabyte.dev/roadmap`). Treat that page as the source of truth for
what's *not* built; the per-phase notes below record what *is*.

> The dated subsections further down (2026-07-21 and earlier) are retained as a historical build log.
> Where they conflict with this header or the per-phase summary below, **this header wins** — e.g.
> "no git remote / unmerged branch / CI never run / NPM_TOKEN-gated / no docs site" are all now
> obsolete, and several items they list as gaps (single-doc `populate`, MT-review write path,
> per-locale editing, custom-field-type enforcement, the eight-item live-testing punch list) are done.

### This session (2026-07-21, cont'd): admin UI → shadcn/ui + react-hook-form, CI credential env rename

- **Admin component system replaced.** `packages/admin/src/components/ui.tsx`'s hand-rolled
  Tailwind primitives (no Radix, no `cva`, no `tailwind-merge`) are now real shadcn/ui "new-york"
  components under `packages/admin/src/components/ui/*` (button, input, textarea, label, select,
  card, badge, checkbox, skeleton, dialog, alert-dialog, popover, tabs, dropdown-menu, command,
  sonner, form) — Radix-backed, so overlays gained real focus traps/portals/ARIA they never had.
  `ui.tsx` is now a barrel re-export plus the domain-only pieces with no shadcn equivalent
  (`StatusBadge`, `ErrorBanner`, `EmptyState`, `Kbd`, `Spinner`, and the native-`<select>`-based
  `Select`). `ConfirmDialog`/`toast`/`CommandPalette`/`Popover`/`MediaPicker` were rebuilt on Radix
  `AlertDialog`/Sonner/`cmdk`/Radix `Popover`/Radix `Dialog` respectively, all preserving their
  original public APIs (`useConfirm()`, `useToast()`, controlled `open`/`onClose`) so callers needed
  no changes. Design tokens are unchanged in name/value, just re-expressed as bare HSL channel
  triplets (`--brand: 21 90% 48%`) consumed via `hsl(var(--x) / <alpha-value>)` so Tailwind opacity
  modifiers work with the new components; `--primary`/`--secondary`/`--destructive`/`--radius`
  shadcn-convention aliases were added onto the existing brand/muted/danger tokens.
- **All forms migrated to `react-hook-form` + `zod`** (`@hookform/resolvers/zod`), per the
  admin-conventions rule in `CLAUDE.md` that wasn't wired up until now: `Login`, `SetupScreen`,
  `AcceptInvite` (shared schemas in `src/lib/schemas.ts`), `Settings`' three create-forms
  (users/API-keys/webhooks) plus its tabs → Radix `Tabs`, `CollectionBrowser`'s save-filter dialog
  (replacing a bare `window.prompt`), and — the highest-risk piece — `DocumentEditor`'s fully dynamic
  per-collection document form (`Controller`/`FormField`-wrapped field registry, a
  `buildDocSchema(fields)` built per collection at runtime, `formState.dirtyFields` replacing the old
  manual `baseline`-diff dirty tracking). None of the multi-action submit paths (save draft/publish/
  schedule/translate) gate on form validity — the server stays the real validator, matching prior
  behavior; RHF/zod only add inline field-level hints.
- **CI/non-interactive credential env vars renamed** `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`
  → **`EDGE_API_TOKEN`/`EDGE_ACCOUNT_ID`**, old names removed with no fallback, so a shell/CI runner
  that already has wrangler's own Cloudflare credentials set (for unrelated local `wrangler` use)
  doesn't get silently picked up by `kalayaan deploy`/`down`/`doctor` for the wrong account. Updated
  `packages/cli/src/cf/client.ts` (`credentialsFromEnv`), the `init`-generated `.env.example`, the
  `Kalayaan Deploy` GitHub Action's internal env (its own `cloudflare-api-token`/`cloudflare-account-id`
  *input* names are unchanged), and docs/tests.
- Verified: full monorepo `pnpm build && pnpm typecheck && pnpm test` green throughout (26 turbo
  tasks); a live browser smoke-check of the migrated `Login` screen (dev server, no backend) confirmed
  zero console errors and working inline zod validation. **Not yet verified live:** `DocumentEditor`,
  `Settings`, and the command palette/overlays all require an authenticated session behind
  `wrangler dev` — recommend a manual click-through against a real deploy before merging.

### Earlier this session (2026-07-21): access control, email, public access, onboarding, custom domains

Landed as four clean commits on the branch (`59cf733`, `9605cad`, `3c1ea08`, `dc6f1a2`):

- **RBAC + scoped API tokens.** Config-defined roles/permissions with an `Ability` model
  (`Action × Subject`) in `@kalayaan/core`; vocabulary + `defaultRoles()` in `@kalayaan/config`.
  `requirePermission()` replaces the old scope checks across every route (incl. the MCP tool map),
  and enforces per-collection/per-action for users, not just keys. API keys gained granular grants,
  expiry, and revocation; `users` gained `disabled_at`; an `audit_log` system table was added.
- **Email invites (Cloudflare Email Sending).** `EmailProvider` seam in core (mirrors `AIProvider`),
  a `CloudflareEmailProvider` over the `send_email` binding, and an `email` config block. Admin
  invites by email → signed stateless invite token → public `accept-invite` endpoint (set your own
  password). Degrades to a copyable invite link when email isn't configured. Resend is documented
  as future work (`docs/roadmap-email-plugins.md`).
- **Public/anonymous access.** A reserved `public` role → anonymous requests resolve to an
  `Ability`; the content API gates reads on it (configurable), and a moderated public **submission**
  endpoint (anonymous create → draft) sits behind Cloudflare Turnstile + per-IP KV rate limiting.
- **`kalayaan login` + free-tier defaults.** Guided sign-in: opens a Cloudflare token-template URL
  with permissions pre-filled and auto-discovers the account via `GET /accounts`; persists to
  `~/.kalayaan/credentials.json` (0600). `resolveCredentials()` = env → store, so deploy/down/doctor
  need no env vars. `init` now scaffolds only free services; a `doctor`/`deploy` guard warns when
  the one paid feature (semantic search → Vectorize) is enabled.
- **Custom domains + interactive `init` wizard.** `domain` config (or `--domain`); deploy attaches a
  Workers Custom Domain (auto DNS + TLS), best-effort with graceful fallback to `*.workers.dev`;
  `down` detaches it; the login token now carries DNS + Workers Routes edit. `kalayaan init` became a
  guided wizard (content models, services, domain) that can deploy at the end. Docs:
  `docs/custom-domains.md`. Marketing briefs (landing + About) updated in the design handoff.

**Product north star (drives prioritization):** free, one-command self-hosting for a solo dev /
aspiring builder — "you don't need a big budget, just a big enough blade." Judge features by: keeps
the free path free, and reduces setup friction for one person shipping a site.

### What's built, by phase

*(Verified against the code on `main`, 2026-07-26. Open items link to the [Roadmap](../docs-site/src/content/docs/roadmap.md).)*

- **Phase 1 (Core): ✅ complete & merged.** Config, core contracts, D1 adapter, runtime CRUD,
  auth, R2 media, admin shell, CLI (init/dev/migrate/deploy/doctor), examples/blog.
- **Phase 2 (Editorial depth): mostly done.** Drafts/publish/versioning (`_versions` history +
  restore), webhooks (HMAC), per-user saved filters, derived `publishStatus`, searchable relation
  combobox. **Now done (were gaps):** single-doc content route `?populate=` (parity with the list
  route), the **MT-review write path** (`?review=mt` persists an `mt-review` version), and **true
  per-locale editing** (sibling-variant resolve by `entity_id`; editor loads/saves/publishes each
  locale independently). *Still open:* image transforms (`/cdn-cgi/image`); presigned R2 uploads
  (still worker-proxied); webhook delivery is still fire-and-forget `waitUntil` (no Queue/retries/
  DLQ); **Preview is a stub** (button only toasts).
- **Phase 3 (Adapters): done, external-DB is content-plane only.** `SqlDialect` abstraction extracted
  from D1's SQLite specifics; `@kalayaan/adapter-postgres`, `@kalayaan/adapter-mysql` (minimal
  `PgClient`/`MysqlClient` interfaces, lazy driver imports), `@kalayaan/storage-s3` (aws4fetch). CLI
  provisions Hyperdrive + Vectorize; `migration.ts` is dialect-aware; runtime selects the adapter per
  config via an injected factory. Golden DDL tests run offline; full conformance is **gated behind
  `EDGECMS_PG_URL`/`EDGECMS_MYSQL_URL`** (dockerized DBs — the P3 gate, still unmet in CI). *Deferred:*
  MongoDB adapter (untouched); runtime system stores (auth/media/versions) are still D1-bound, so a
  full CMS can't yet run on Postgres/MySQL.
- **Phase 4 (AI): semantic search done.** `AIProvider.embed` (bge-m3, 1024-dim),
  `SearchIndex`/`VectorizeSearchIndex`, embed-on-publish, public `/api/v1/search` with a SQL
  `contains` fallback; alt-text/improve/translate/summarize/seo routes. *Still open:* alt-text runs
  async via `waitUntil` but is **not** a Queue job with accept/reject chips (auto-applied); **no AI
  Gateway routing**; search has **no chunking and no backfill/reindex** of existing docs (embed-on-
  publish only).
- **Phase 5 (Distribution): done.** Plugin lifecycle hooks + custom field-type registry
  (`PluginHost`) — **custom field types are now enforced in both write validation AND DDL** across
  all three dialects (was a gap); config-generated **GraphQL** read API behind a flag (relation/media
  fields resolve to nested objects); **MCP** server at `/mcp` (JSON-RPC, API-key-scoped tools);
  **Cloudflare Access** auth mode (RS256 JWKS verify → user); `kalayaan-skill` package;
  `actions/deploy` GitHub Action; init templates; **docs site live**. *Still open:* GraphQL is
  read-only (no mutations); MCP is single-response (no SSE/streaming); **Access is runtime-only, not
  wired through `init`/`deploy`**; no Deploy-to-Cloudflare button.

### Admin UI redesign + this session's polish (on branch, uncommitted working tree)

A full admin redesign (CSS-var token system, light/dark, command palette, toasts, version
timeline, publish bar) plus, this session: **mobile-responsive layout** (sidebar → drawer +
hamburger top bar; editor stacks; responsive headers/padding), **`kalayaan dev --host`** for LAN
access, an **expanded TipTap editor** (H1–H3, underline/strike/inline-code/highlight, links, task
lists, code blocks, hr, text align, undo/redo, placeholder) with **insert-image-from-media-gallery**
(`MediaPicker`), and a **searchable tag-cloud multi-select combobox with inline create**
(`relation.tsx`). Verified end-to-end against the real local Cloudflare stack (`wrangler dev` +
local D1/R2) by driving the actual admin UI in a browser.

### ⚠️ Consolidation state (the real next step)

Committed on the branch: all P3/P4/P5 backend work + the two CF-runtime bug fixes (12+ commits,
`e289a60`…`174a37b`). **Uncommitted in the working tree:** the admin redesign + all of this
session's admin/auth changes (mobile, TipTap, tag cloud, `--host`, Secure-cookie fix, editor
write-body fix). Nothing is merged to `main`; **CI has never run**.

### P1 real-account gate: MET (2026-07-21); live-testing punch list: ALL FIXED (verified 2026-07-26)

User ran `kalayaan login` → `deploy` → `down` end-to-end against a real Cloudflare account — the
plan's core promise (a live site from `cms.config.ts` + a token) is now proven, not just covered by
mocked-API tests. Driving the deployed admin UI surfaced eight bugs/UX gaps; **all eight are now
fixed in the code on `main`** (verified 2026-07-26):

1. ✅ Author field defaults to the current logged-in user (`DocumentEditor.tsx`).
2. ✅ User display name is manageable (`ManagedUser.name`, users API + Settings UI).
3. ✅ The stray plain HTML `<select>` is gone — relations/selects use the shadcn `Select` (the
   legacy native one in `components/ui.tsx` is now dead code, imported nowhere).
4. ✅ Inviting a user sends a random temporary password (`randomPassword()` in `admin-users.ts`).
5. ✅ `PATCH /admin/api/media/:id` route exists and the admin calls the correct path.
6. ✅ Viewing media opens an in-page lightbox (shadcn `Dialog` in `MediaLibrary.tsx`).
7. ✅ Inline-created tags publish with the post (`published_at` set on inline create in `relation.tsx`).
8. ✅ AI actions are per-field via `aiEnrich: { action, dependency }`, replacing the ambiguous global panel.

Consistent with the standing lesson below: found only by real use, not the green test suite.

### Plan phase-gates still unmet (all need a real Cloudflare account — see §7)

- **P3:** conformance green on Postgres/MySQL in CI (dockerized DBs).
- **P4:** nightly real-account AI/Vectorize smoke.
- **P5:** scripted `kalayaan-skill` agent run empty-dir → deployed URL.

### Real bugs found ONLY by driving the live app (never by the green test suite)

Six so far. Phase-1 two: umbrella-import resolution + missing system tables. Phase 3+ four:
(1) runtime statically importing the pg/mysql adapters broke the D1 `wrangler dev` bundle — fixed
via a `createApp` adapter-factory + `kalayaan/postgres`|`/mysql` subpath exports; (2) `POST /mcp`
404/405 because `run_worker_first` used `/mcp/*` which doesn't match the bare `/mcp`; (3) auth
cookies hard-coded `secure:true` were dropped over plain-HTTP LAN so login never stuck — fixed with
`secureCookies(c)` keyed on request protocol; (4) the editor sent the whole doc back on save so the
strict write schema rejected system keys ("Request body failed validation") — fixed client-side by
sending only writable fields; plus the TipTap editor never displayed existing content (`useEditor`
reads `content` once, doc loads async) — fixed with a content-sync effect. **Lesson holds: drive
the CLI-scaffolded project under real `wrangler dev`, not just the green suite.**

**Recommended next up (as of 2026-07-26):** the release pipeline is fully live — merged to `main`,
CI green, docs site deployed, and packages published to npm at **v0.3.1** via OIDC trusted publishing
(the earlier `NPM_TOKEN` scaffolding was replaced). The remaining work is now tracked on the
**[Roadmap](../docs-site/src/content/docs/roadmap.md)** page; the highest-leverage items against the
free-self-hosting north star are: image transforms + presigned uploads (Phase 2), the external-DB
control-plane gap so a full CMS can run off D1 (Phase 3), and wiring **Cloudflare Access through
`init`/`deploy`** (Phase 5). The three remaining phase gates (P3 conformance in CI, P4 nightly AI
smoke, P5 scripted-skill deploy) each still need a dedicated CI job.

## Context

Kalayaan is a greenfield, config-driven headless CMS that deploys entirely onto Cloudflare from one `cms.config.ts` and an API token — D1 default database, R2 media, Hono Worker runtime, React/Tailwind/shadcn admin UI, pluggable adapters (Postgres/MySQL via Hyperdrive, MongoDB), optional Workers AI features, and an MCP server. The design doc (uploaded as `cloudflarecmsplan.md`) fully specifies the architecture; this plan turns it into an executable engineering sequence. Target directory `/Users/paulperia/projects/edge-cms` is empty. Decisions locked: cover all 5 roadmap phases (Phase 1 most detailed); tooling is pnpm workspaces + Turborepo, TypeScript, Vitest (+ `@cloudflare/vitest-pool-workers`), changesets.

## 1. Monorepo Layout

```
edge-cms/
├── packages/
│   ├── config/            @kalayaan/config          — source of truth (zod only, runs everywhere)
│   ├── core/              @kalayaan/core            — engine: DSL types, adapter contracts, lifecycle, errors
│   ├── adapters/
│   │   ├── relational/    @kalayaan/adapter-relational  (shared base + SQL query builder)
│   │   ├── d1/            @kalayaan/adapter-d1
│   │   ├── postgres/      @kalayaan/adapter-postgres    (Phase 3)
│   │   ├── mysql/         @kalayaan/adapter-mysql       (Phase 3)
│   │   └── mongodb/       @kalayaan/adapter-mongodb     (Phase 3)
│   ├── storage/
│   │   ├── r2/            @kalayaan/storage-r2
│   │   └── s3/            @kalayaan/storage-s3          (Phase 3)
│   ├── runtime/           @kalayaan/runtime         — createApp() Hono factory
│   ├── admin/             @kalayaan/admin           — Vite React SPA, ships dist/ as static assets
│   ├── cli/               @kalayaan/cli             — bin: kalayaan (init/dev/deploy/migrate/doctor/seed)
│   ├── kalayaan/           kalayaan                  — umbrella package users install
│   ├── conformance/       @kalayaan/adapter-conformance — published adapter test kit
│   └── skill/             kalayaan-skill            (Phase 5)
├── templates/             blog/ portfolio/ docs/ blank/   (copied by init, not workspace deps)
├── examples/blog/         dogfooding app
└── apps/docs/             docs site (Phase 5)
```

**Key responsibilities:**
- **`@kalayaan/config`** — `defineConfig`/`collection`/`field.*` builders, Zod validation, normalized `ResolvedConfig`/`CollectionSchema`/`FieldDef` types, JSON Schema export, canonical **schema snapshot** serialization + `diffSnapshots(prev, next): ChangeSet`. Depends on zod only — consumable from Node (CLI), workerd (runtime), and browser (admin).
- **`@kalayaan/core`** — query DSL types, `DatabaseAdapter`/`StorageAdapter` contracts, document lifecycle (validation, ulid IDs, slugs, timestamps, locale/status semantics, version snapshots), `EdgeCMSError` taxonomy, hook dispatch.
- **`@kalayaan/adapter-relational`** — `RelationalAdapter` abstract class, DSL→parameterized-SQL query builder, dialect interface (`quoteIdent`, type mapping, `emitDDL(ChangeSet)`), keyset cursor encoding. `adapter-d1` adds the SQLite dialect, D1 executor, copy-rename ALTER strategy, and system-table DDL (`_migrations`, `_versions`, `media`, `users`, `api_keys`).
- **`@kalayaan/runtime`** — `createApp(config, env)`: content API `/api/v1`, admin API `/admin/api`, auth middleware, media routes, KV cache, queue consumer export, MCP endpoint (Phase 5), asset fallthrough.
- **`@kalayaan/admin`** — schema-driven SPA; imports only *types* from config (schema arrives at runtime via `/admin/api/schema`); `dist/` shipped inside the npm package and copied into the deploy bundle as Workers Assets.
- **`@kalayaan/cli`** — Cloudflare REST provisioning client, config loader (esbuild-bundles user `cms.config.ts`), generated worker entry + `wrangler.json`, `.kalayaan/state.json` manager.

Dependency graph (no cycles): `config → core → adapter-relational → d1/postgres/mysql`; `core → mongodb, storage-*, runtime`; `config → admin (types), cli, conformance`; `kalayaan → config + runtime + cli`.

## 2. Phase 1 — Core (weeks 1–6) — ✅ COMPLETE (all M0–M10)

**M0 (wk 1a) — Repo scaffold.** ✅ pnpm workspace + turbo + TS project refs; Vitest twice (node pool for pure packages, workers pool for runtime/adapter-d1); changesets; ESLint/Prettier; `.github/workflows/ci.yml`. Verify: `pnpm build && pnpm test` green in CI.

**M1 (wk 1b) — ✅ DONE — Config package.** Phase-1 field types (text, slug, richText, media, relation, select, number, boolean, date), `defineConfig` + Zod with actionable errors, `resolveConfig()`, canonical snapshot serialization, JSON Schema export. Files: `packages/config/src/{define,resolve,snapshot,json-schema}.ts`, `src/fields/`. Verify: snapshot round-trip stability (same config → byte-identical snapshot) + bad-config rejection fixtures.

**M2 (wk 2) — ✅ DONE — Schema diff + SQLite migration generator.** `diffSnapshots()` (dialect-agnostic ChangeSet: AddCollection/AddField/DropField/AlterField/AddIndex, destructive flags); SQLite DDL emitter incl. copy-rename dance; system tables. Files: `packages/config/src/diff.ts`, `packages/adapters/d1/src/{ddl,system-tables}.ts`. Verify: golden-file SQL tests; apply to miniflare D1 and assert `PRAGMA table_info`.

**M3 (wk 3) — ✅ DONE — Query builder + D1Adapter.** DSL→SQL (eq/ne/in/lt/lte/gt/gte/contains, sort, limit ≤100, keyset cursor, populate depth ≤2 via batched lookups on D1); full CRUD; `transaction` via `D1Database.batch` (documented as best-effort atomic batch); first conformance suite written against the contract. Files: `packages/adapters/relational/src/{query-builder,adapter}.ts`, `packages/adapters/d1/src/adapter.ts`, `packages/conformance/src/suite.ts`. Verify: conformance green on real miniflare D1.

**M4 (wk 3–4) — ✅ DONE — Runtime CRUD APIs.** `createApp()`; `GET /api/v1/:collection` (query-param grammar `filter[x][gte]=` → DSL), `GET /api/v1/:collection/:idOrSlug`, `/admin/api/:collection` CRUD with config-derived Zod validation, `/admin/api/schema`, unified error format, published-only public reads. Files: `packages/runtime/src/{app,routes/content,routes/admin-crud,errors,query-params}.ts`. Verify: `SELF.fetch` integration tests.

**M5 (wk 4) — ✅ DONE — Auth.** Email+password via PBKDF2-SHA256/WebCrypto (bcrypt isn't workerd-native); KV sessions + HMAC-signed HttpOnly SameSite=Lax cookie; CSRF double-submit; first-run setup flow gated on zero users; hashed scoped API keys as bearer tokens; middleware ordering (session OR bearer). Files: `packages/runtime/src/auth/{password,session,csrf,api-keys,middleware}.ts`. Verify: login→cookie→CRUD; forged/expired session rejection; scope matrix.

**M6 (wk 4–5) — ✅ DONE — R2 media.** `StorageAdapter` + R2 impl; **Worker-proxied streaming PUT upload first** (presigned URLs deferred to Phase 2 — presigning needs separate R2 S3-credentials the Workers token can't mint, plus bucket CORS); `media` rows; `GET /media/:key` with cache headers. Verify: miniflare R2 tests + manual round-trip under `wrangler dev`.

**M7 (wk 4–6, parallel after M4/M5) — ✅ DONE — Admin UI shell.** Vite + Tailwind + shadcn (real
shadcn/ui + Radix as of this session, see Status above — was a hand-rolled facsimile through the
admin redesign); login; schema-driven sidebar; collection browser (TanStack Table, server
pagination); document editor rendered from `FieldDef` (minimal TipTap for richText, media picker,
relation combobox), now on `react-hook-form` + zod; TanStack Query. Design brief §15b is the input
spec; publish bar is a simple status+save/publish in Phase 1. Files:
`packages/admin/src/{main.tsx,routes/,fields/registry.tsx,components/ui/,lib/schemas.ts,api/client.ts}`;
Vite dev proxy `/admin/api` → wrangler dev. Verify: field-registry component tests; manual
walkthrough; Playwright smoke (login→create→edit→list) by end of phase.

**M8 (wk 5) — ✅ DONE — CLI `dev` + config loading.** esbuild-bundle user config; **generated worker entry** (virtual module importing bundled config + `createApp`); generated `.kalayaan/wrangler.json` with assets binding, `not_found_handling: "single-page-application"`, and `run_worker_first: ["/api/*","/admin/api/*","/media/*"]`; `kalayaan dev` shells to `wrangler dev`; `kalayaan migrate` with `--dry-run` / `--allow-destructive`. Files: `packages/cli/src/{config-loader,entry-template,wrangler-config,commands/dev,commands/migrate}.ts`. Verify: e2e temp-dir scaffold → dev → HTTP asserts; snapshot test on generated wrangler.json.

**M9 (wk 6) — ✅ DONE — CLI `deploy` + `init` + `doctor`.** Typed CF REST client with retry/backoff; idempotent provisioning (D1, R2+CORS, KV×2); `.kalayaan/state.json` (resource IDs + applied snapshot + migration journal, committed to git, no secrets); remote migrations via D1 HTTP `/query` (sequential statements, checksummed `_migrations` journal, resumable on failure); esbuild worker bundle + Workers upload API + assets manifest; auto-generated session secret; prints URL + invite link. `init` wizard (clack) with full flag equivalents. Files: `packages/cli/src/cf/{client,d1,r2,kv,workers,assets}.ts`, `src/state.ts`, `src/commands/{deploy,init,doctor}.ts`. Verify: mocked-CF-API unit tests + manual/nightly real-account smoke (deploy → publish → GET → teardown).

**M10 (wk 6) — ✅ DONE — Hardening.** `examples/blog` end-to-end; error-message pass; README quickstart. **Exit criterion: stranger goes empty-folder → published blog post in <10 min.**

## 3. Phases 2–5

### Phase 2 — Editorial depth (wks 7–10)
1. **Drafts/publish/versioning** — transitions, `_versions` snapshots, restore, publish bar with diff-count. Verify: transition-matrix worker tests + Playwright.
2. **Relations hardening** — populate in both APIs, delete integrity (restrict/cascade), searchable combobox. Verify: conformance additions + query-count (N+1) assertion.
3. **Localization** — `entity_id`+`locale`, locale-aware unique constraints, `?locale=`, editor switcher. **Do early: the `(slug, locale)` constraint change is the first real stress test of the migration generator (forces copy-rename).**
4. **Media library + Images transforms**; promote presigned uploads to default (explicit R2-credentials step in `init`).
5. **Webhooks + Queues** — producer on publish, consumer export, retries/DLQ, **inline fallback when Queue binding absent**, CLI provisions Queue.
6. **KV read cache** — tag-based invalidation on publish (`cache:{collection}`), Cache-Control/ETag.

### Phase 3 — Adapters (wks 11–14)
1. **Contract freeze** — `DatabaseAdapter` v1, extract D1-specifics from core, publish conformance kit; D1 conformance green is the regression gate.
2. **Postgres adapter** (dialect + `postgres` driver via Hyperdrive, real transactions) — conformance vs dockerized Postgres in CI.
3. **MySQL adapter** (`mysql2`; no DDL transactions).
4. **CLI Hyperdrive provisioning** + external-DB `init` flow; real-account smoke with Neon/PlanetScale.
5. **MongoDB document adapter** — native mapping, `$lookup`/batched populate, migrate = collections/indexes/JSON Schema validators. Driver over `connect()` is time-boxed; Atlas Data API is the documented fallback.
6. **S3 StorageAdapter** (aws4fetch) — tests vs MinIO.

### Phase 4 — AI layer (wks 15–17)
1. **AI plumbing** — optional bindings, AI Gateway routing, capability detection + graceful degradation, CLI provisions Vectorize/Gateway. Everything behind an injectable `AIProvider` interface (Workers AI/Vectorize have weak local simulation — mock in tests, nightly real-account job for truth).
2. **Alt-text queue job** — caption model → suggestion on media row → accept/reject chips.
3. **Semantic search** — chunk+embed on publish (bge-m3 → Vectorize), `/api/v1/search` with metadata filters, LIKE fallback.
4. **Editorial assist + translation** — TipTap inline actions; `machine_translated` flag.

### Phase 5 — Polish & distribution (wks 18+)
1. GraphQL endpoint (Yoga, config-generated schema, behind flag) — parity tests vs REST fixtures.
2. Cloudflare Access auth mode.
3. Plugin hooks (`beforeChange`, `afterPublish`, custom field types) + example plugin.
4. MCP server at `/mcp` (Agents SDK, streamable HTTP, API-key-scoped tools: `list_collections`, `query_documents`, `create_document`, `update_document`, `publish`, `upload_media_from_url`, `search`; `manage` scope for destructive tools).
5. `kalayaan-skill` package (SKILL.md + guardrails: dry-run first, never auto `--allow-destructive`). Verify: scripted agent run empty-dir → deployed URL.
6. Templates + frontend starters, Deploy-to-Cloudflare button, docs site (brief §15a feeds landing page). Template CI: init from each → build → dev smoke.
7. GitHub Action wrapper (`kalayaan/deploy-action`), dogfooded by examples.

## 4. Cross-Cutting Decisions (lock weeks 1–3)

1. **Query DSL (M3):** typed object — `{ where (AND-only + optional top-level or[]), sort, limit ≤100, cursor, populate (dot paths, depth ≤2), locale, status }`; operators eq/ne/in/lt/lte/gt/gte/contains. Cursor = opaque base64url `[sortValues..., id]` keyset — no OFFSET. REST query-param grammar and GraphQL both parse into this one object.
2. **Adapter contract (M3, frozen at 3.1):** design-doc §5 interface plus `transaction` semantics documented per family (best-effort batch on D1, real tx elsewhere); conformance tests atomicity of the batch case only.
3. **`.kalayaan/state.json`:** `{ version, resources: {d1, r2, kv:{cache,sessions}, queue, vectorize, hyperdrive, worker}, schema: {snapshotVersion, collections}, migrations: [{id, checksum, appliedAt}] }`. Committed to git; secrets never in it; snapshot format versioned independently.
4. **Auth model (M5):** PBKDF2-SHA256 600k iters; 256-bit session id in KV (7d sliding TTL) + HMAC-signed cookie; CSRF double-submit; API keys stored as SHA-256 hash with `{scopes, collections?}`.
5. **Error format (M4):** `{ error: { code, message, details?: [{path, message}] } }` with matching HTTP status; `EdgeCMSError` in core carries code+status; same shape everywhere.
6. **Releases:** changesets in fixed/lockstep mode for all `@kalayaan/*` + `kalayaan`; `0.x` until the Phase-3 contract freeze → `1.0`. Skill and templates version independently. Runtime↔CLI compatibility guaranteed by the CLI generating the worker entry from its own bundled runtime.

## 5. Testing & CI

- **Unit (node pool, every PR):** config, core, SQL/DDL golden tests, CLI vs mocked CF API.
- **Worker integration (workers pool, every PR):** runtime via `SELF.fetch`, adapter-d1 on miniflare D1, R2/KV/Queues.
- **Conformance:** one scenario matrix (CRUD, filters, sort, cursor stability, populate, unique violations, migrate idempotency) parameterized by adapter factory; Docker services matrix in CI from Phase 3.
- **E2E CLI (every PR):** temp-dir init → dev → HTTP asserts. **Real-account smoke** (deploy/publish/fetch/teardown on a dedicated test CF account): nightly + pre-release.
- **Admin UI:** component tests + Playwright smoke on PR; full suite nightly.
- **Workflows:** `ci.yml`, `nightly.yml`, `release.yml` (changesets → npm with provenance).

## 6. Risks & Sequencing Traps

1. **Runtime config import** — the Worker can't read `cms.config.ts` from disk; the CLI must esbuild-bundle it into the generated entry. This mechanism (M8) is load-bearing; keep it a plain template. Config changes always require redeploy — document it.
2. **SPA + API on one Worker** — Assets SPA not-found handling swallows API 404s unless `run_worker_first` covers every API prefix. Lock the URL namespace at M4; snapshot-test wrangler.json.
3. **Presigned R2 uploads need separate S3 credentials + CORS** — hence proxied upload in Phase 1, presigned as the 2.4 upgrade. Don't let it block Phase 1.
4. **D1 HTTP API migrations are non-transactional** — sequential statements with checksummed journal, resumable; explicitly test failure-mid-migration.
5. **Wrangler schema drift** — pin wrangler as a direct CLI dep; snapshot-test generated config; `doctor` validates it with wrangler itself.
6. **vitest-pool-workers limitations** — keep query builder/DDL emitters as pure functions tested in node pool.
7. **Localization migration (2.3) early** — surfaces migration-generator bugs before Phase 3 multiplies dialects.
8. **Bundle size** — admin ships as assets (script limit only bites the API bundle); CI size-budget check from M8; code-split TipTap.

## 7. Verification (overall)

- Per-milestone checks as listed above; every PR runs unit + worker + local-e2e + Playwright smoke.
- Phase gates: P1 = <10-min empty-folder→published-post on a real account; P2 = examples/blog exercises versioning/localization/webhooks/cache; P3 = conformance suite green on all four DB adapters in CI; P4 = nightly real-account AI smoke; P5 = scripted-agent deploy via `kalayaan-skill` succeeds.
