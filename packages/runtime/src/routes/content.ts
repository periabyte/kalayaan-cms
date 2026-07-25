import { Hono } from "hono";
import type { DatabaseAdapter } from "@kalayaan/core";
import { EdgeCMSError } from "@kalayaan/core";
import type { ResolvedConfig } from "@kalayaan/config";
import { parseContentQuery } from "../query-params.js";
import { serializeDoc, serializePage } from "../status.js";
import { publicAuth, can, type AuthEnv } from "../auth/middleware.js";

export interface ContentEnv {
  Variables: { adapter: DatabaseAdapter };
}

/**
 * Public, cacheable content API. Only ever returns published documents, and
 * only for collections the `public` role can `read` (all, by default). Requests
 * resolve to an anonymous actor via {@link publicAuth}, so read access is the
 * same RBAC decision as everywhere else.
 */
export function contentRoutes(config: ResolvedConfig) {
  const app = new Hono<ContentEnv & AuthEnv>();
  const byName = new Map(config.collections.map((c) => [c.name, c]));

  app.use("*", publicAuth());

  app.get("/:collection", async (c) => {
    const collection = byName.get(c.req.param("collection"));
    if (!collection) throw new EdgeCMSError("not_found", `Unknown collection "${c.req.param("collection")}"`);
    if (!can(c, "read", collection.name))
      throw new EdgeCMSError("not_found", `Unknown collection "${c.req.param("collection")}"`);
    const query = parseContentQuery(new URL(c.req.url).searchParams, collection);
    query.where = { ...query.where, published_at: { ne: null, lte: Date.now() } };
    const page = await c.var.adapter.find(query);
    return c.json(serializePage(page));
  });

  app.get("/:collection/:idOrSlug", async (c) => {
    const name = c.req.param("collection");
    const collection = byName.get(name);
    if (!collection || !can(c, "read", name)) throw new EdgeCMSError("not_found", `Unknown collection "${name}"`);
    const idOrSlug = c.req.param("idOrSlug");
    const locale = c.req.query("locale");
    const populate = c.req.query("populate")?.split(",");
    const base = { collection: name, ...(locale && { locale }), ...(populate && { populate }) };
    const ref = looksLikeUlid(idOrSlug) ? { ...base, id: idOrSlug } : { ...base, slug: idOrSlug };
    const doc = await c.var.adapter.findOne(ref);
    if (!doc || doc.published_at === null || (doc.published_at as number) > Date.now())
      throw new EdgeCMSError("not_found", `${name}/${idOrSlug} not found`);
    return c.json({ doc: serializeDoc(doc) });
  });

  return app;
}

function looksLikeUlid(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}
