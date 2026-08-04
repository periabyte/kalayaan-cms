---
title: Plugins & modules
description: "Extend Kalayaan CMS with lifecycle hooks, custom field types, business-specific routes, custom RBAC subjects, and installable modules."
# Sidebar label and page H1 stay short (title above); this overrides just
# the <title> tag, which leads with the category for search. Starlight
# merges frontmatter head last and dedupes by tag, so this replaces its
# default `<title>` rather than adding a second one.
head:
  - tag: title
    content: "Plugins, Lifecycle Hooks & Custom Field Types | Kalayaan CMS"
---

Kalayaan's config (`cms.config.ts`) covers content modeling, but a real project usually needs more:
a bulk-publish workflow, a webhook receiver, a whole marketplace/payments feature. That's what
**plugins** and **modules** are for — an optional `cms.plugins.ts` (and/or `cms.modules.ts`) file
next to your config, exporting an array the CLI bundles into the generated Worker.

## `cms.plugins.ts`: hooks, field types, and routes

```ts
import type { Plugin } from "kalayaan";

const plugins: Plugin[] = [
  {
    name: "color",
    fieldTypes: {
      hex(value: unknown): string {
        const s = String(value ?? "").trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw new Error("expected a hex color like #1a2b3c");
        return s.toUpperCase();
      },
    },
  },
];

export default plugins;
```

A `Plugin` can contribute:

- **`hooks`** — `beforeChange`/`afterChange`/`afterPublish`/`afterDelete`, run around every
  create/update/delete (see [Schema & config](/guides/schema-and-config) for the write pipeline).
- **`fieldTypes`** — validators for `field.custom("name")` fields, run in the write path; the
  return value is what gets stored.
- **`routes`** — business-specific HTTP endpoints, mounted under `/api/ext/*`.
- **`subjects`** — custom RBAC permission subjects your routes check (see below).

### Business-specific routes

A route is more than plain CRUD — it can touch several collections atomically, gate on a
permission, and reuse the exact same write pipeline (versioning, webhooks, lifecycle hooks) the
built-in admin API uses:

```ts
const plugins: Plugin[] = [
  {
    name: "author-workflows",
    routes: [
      {
        method: "POST",
        path: "/authors/:id/publish-all",
        permission: { action: "publish", subject: "posts" },
        handler: async (ctx) => {
          const drafts = await ctx.db
            .collection("posts")
            .find({ where: { author: ctx.params.id, published_at: { eq: null } } });
          const published = await Promise.all(
            drafts.docs.map((doc) =>
              ctx.db.collection("posts").update(doc.id as string, { published_at: Date.now() }),
            ),
          );
          return { published: published.length };
        },
      },
    ],
  },
];
```

That route is reachable at `POST /api/ext/authors/:id/publish-all`. A few things worth knowing:

- **Auth defaults to required** (a valid session or API key); set `public: true` on a route to
  allow anonymous requests instead.
- **`permission`** is checked before the handler runs — 403 (or 404 if `public`) when the actor
  lacks it.
- **`ctx.db`** is RBAC- and hook-aware: `ctx.db.collection("posts").create(...)` enforces
  `ctx.actor.ability` and runs the same `beforeChange`/`afterChange`/`afterPublish` hooks, versioning,
  and webhook dispatch as the admin CRUD API — a custom route can't become a permission bypass or a
  way to skip lifecycle side effects.
- **`ctx.db.tx(fn)`** wraps writes in a transaction for atomicity across collections (e.g. writing
  an order and decrementing inventory together).
- **`ctx.rawAdapter`** is the escape hatch: the underlying `DatabaseAdapter`, bypassing RBAC and
  hooks entirely, for trusted system-level work.
- **`ctx.ai`/`ctx.email`/`ctx.payment`** are the same provider instances the rest of the runtime
  uses, present only when configured (see [Modules](#cmsmodulests-full-features) for `payment`).

### Custom RBAC subjects

Roles are `{ subjects, actions }` grants, and subjects are normally collection names or the fixed
system areas (`media`, `webhooks`, `users`, `api_keys`, `settings`, `ai`). A plugin route can check
a subject of its own choosing — e.g. `"marketplace:order"` — and grant it in `cms.config.ts`'s
`roles` block once the plugin declares it, either explicitly via `Plugin.subjects` or implicitly
through any `RouteDef.permission.subject` its routes reference:

```ts
// cms.plugins.ts
const plugins: Plugin[] = [
  {
    name: "marketplace",
    subjects: ["marketplace:payout"], // not referenced by any route's `permission`, so declare it explicitly
    routes: [
      { method: "POST", path: "/orders", permission: { action: "create", subject: "marketplace:order" }, handler: /* … */ },
    ],
  },
];
```

```ts
// cms.config.ts
export default defineConfig({
  // ...
  roles: {
    manager: {
      permissions: [{ subjects: ["marketplace:order", "marketplace:payout"], actions: ["read", "create"] }],
    },
  },
});
```

Without the plugin declaring the subject (directly or via a route), `kalayaan doctor`/`migrate`/
`deploy` reject the role as granting an "unrecognized subject." A role's `subjects: "*"` grant
already matches custom subjects the same way it matches collections — scope a sensitive one (e.g.
payments) with an explicit grant if it shouldn't ride along with a broad `"*"` permission.

## `cms.modules.ts`: full features

A **module** is a `Plugin` plus two things a self-contained feature usually also needs:

- **`collections`** — merged into your config *before* `resolveConfig`/`snapshotOf` run, so
  `kalayaan migrate` creates the tables exactly like collections declared directly in
  `cms.config.ts`. This is build-time data, unlike `routes`/`hooks`.
- **`provides`** — capability providers the module supplies to every route via `RouteContext`.
  Today that's `payment`: a factory (not a constructed instance — a Worker only exposes secrets
  through the per-request `env`, never at import time) that builds a `PaymentProvider`.

```ts
// cms.modules.ts
import type { Module } from "kalayaan";
import { StripePaymentProvider } from "kalayaan";

const modules: Module[] = [
  {
    name: "marketplace",
    collections: [
      {
        name: "orders",
        fields: {
          total: { type: "number", required: true },
          status: { type: "select", options: ["pending", "paid", "refunded"] },
        },
      },
    ],
    subjects: ["marketplace:order"],
    provides: {
      payment: (env) => new StripePaymentProvider(env.STRIPE_SECRET_KEY),
    },
    routes: [
      {
        method: "POST",
        path: "/orders/:id/checkout",
        permission: { action: "update", subject: "marketplace:order" },
        handler: async (ctx) => {
          const order = await ctx.db.collection("orders").findOne({ id: ctx.params.id });
          if (!order) throw new Error("not found");
          const intent = await ctx.payment!.createIntent({
            amount: { amount: order.total as number, currency: "usd" },
            metadata: { orderId: order.id as string },
          });
          return { clientSecret: intent.clientSecret };
        },
      },
    ],
  },
];

export default modules;
```

`STRIPE_SECRET_KEY` is a Worker secret, not a `cms.config.ts` value — set it the normal wrangler
way (`wrangler secret put STRIPE_SECRET_KEY`, or `.dev.vars` locally). `StripePaymentProvider` is
the reference implementation `kalayaan` re-exports; write your own class implementing
`PaymentProvider` (`createIntent`/`retrieveIntent`/`refund`) to use a different processor.

A project can have both `cms.plugins.ts` and `cms.modules.ts` — their routes/hooks/field
types/subjects merge together, and only one module's `provides.payment` factory is used (the
first one registered).

### Note on config changes

Like everything else in `cms.config.ts`, a module's `collections` are bundled at build time —
adding or changing them requires `kalayaan migrate` and a redeploy, not a hot reload.
