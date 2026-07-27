---
"@kalayaan/core": minor
"@kalayaan/config": minor
"@kalayaan/runtime": minor
"@kalayaan/cli": minor
"kalayaan": minor
---

Business-logic extension seam: plugin routes, custom RBAC subjects, and a `Module` system.

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
