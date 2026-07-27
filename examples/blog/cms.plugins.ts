import type { Plugin } from "kalayaan";

/**
 * Project plugins — lifecycle hooks, custom field types, and business-specific
 * routes. The generated Worker entry imports this file's default export and
 * passes it to `createApp`. The `type`-only import above is erased at build
 * time, so nothing here needs to resolve `kalayaan` at runtime.
 */
const plugins: Plugin[] = [
  {
    name: "color",
    fieldTypes: {
      // A hex-color validator wired into fields declared `field.custom("hex")`.
      // Runs in the write path; its return value is what gets stored.
      hex(value: unknown): string {
        const s = String(value ?? "").trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw new Error("expected a hex color like #1a2b3c");
        return s.toUpperCase();
      },
    },
  },
  {
    name: "author-workflows",
    routes: [
      // POST /api/ext/authors/:id/publish-all — a business-specific workflow
      // beyond plain CRUD: publish every draft by one author in a single
      // request. `ctx.db` reaches the `posts` collection with the same RBAC
      // check and write pipeline (hooks, versioning, webhooks) the admin API
      // uses, gated up front by the route's own `publish` permission.
      {
        method: "POST",
        path: "/authors/:id/publish-all",
        permission: { action: "publish", subject: "posts" },
        handler: async (ctx) => {
          const authorId = ctx.params.id;
          const drafts = await ctx.db
            .collection("posts")
            .find({ where: { author: authorId, published_at: { eq: null } } });
          const published = await Promise.all(
            drafts.docs.map((doc) => ctx.db.collection("posts").update(doc.id as string, { published_at: Date.now() })),
          );
          return { published: published.length };
        },
      },
    ],
  },
];

export default plugins;
