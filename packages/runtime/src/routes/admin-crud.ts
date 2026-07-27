import { Hono } from "hono";
import { EdgeCMSError, PluginHost, type Doc } from "@kalayaan/core";
import type { ResolvedCollection, ResolvedConfig } from "@kalayaan/config";
import { requireAuth, requirePermission, assertPermission, type AuthEnv } from "../auth/middleware.js";
import { csrfProtection } from "../auth/csrf.js";
import { parseContentQuery } from "../query-params.js";
import { collectionWriteSchema } from "../validation.js";
import { serializeDoc, serializePage } from "../status.js";
import { VersionStore } from "../versions/version-store.js";
import { createDocument, updateDocument, deleteDocument } from "../content/create-document.js";
import type { VectorizeBinding } from "../ai/search-index.js";
import type { AIProvider } from "@kalayaan/core";
import type { ContentEnv } from "./content.js";

type AdminEnv = ContentEnv &
  AuthEnv & { Bindings: { VECTORIZE?: VectorizeBinding }; Variables: { ai?: AIProvider } };

/** Reserved/generated keys never re-applied verbatim when restoring a version. */
const RESERVED_KEYS = new Set(["id", "entity_id", "locale", "created_at", "updated_at"]);

/** Authenticated CRUD API. Sees every document regardless of publish state. */
export function adminCrudRoutes(config: ResolvedConfig, plugins: PluginHost = new PluginHost()) {
  const app = new Hono<AdminEnv>();
  app.use("*", requireAuth(), csrfProtection);
  const byName = new Map(config.collections.map((c) => [c.name, c]));

  function actor(c: { var: { actor: AuthEnv["Variables"]["actor"] } }): { type: string; id: string | null } {
    return { type: c.var.actor.type, id: c.var.actor.type === "user" ? c.var.actor.id : null };
  }

  function mustCollection(name: string) {
    const c = byName.get(name);
    if (!c) throw new EdgeCMSError("not_found", `Unknown collection "${name}"`);
    return c;
  }

  app.get("/:collection", requirePermission("read"), async (c) => {
    const collection = mustCollection(c.req.param("collection"));
    const query = parseContentQuery(new URL(c.req.url).searchParams, collection);
    const page = await c.var.adapter.find(query);
    const serialized = serializePage(page);
    // Derive the admin-only `mt` (machine-translation review) flag from the
    // latest version per entity — one indexed query for the whole page.
    const ids = serialized.docs.map((d) => (d.entity_id as string | undefined) ?? d.id);
    const latest = await new VersionStore(c.env.DB).latestStatuses(collection.name, ids);
    for (const d of serialized.docs) {
      const entityId = (d.entity_id as string | undefined) ?? d.id;
      (d as Doc).mt = latest.get(entityId) === "mt-review";
    }
    return c.json(serialized);
  });

  app.post("/:collection", requirePermission("create"), async (c) => {
    const collection = mustCollection(c.req.param("collection"));
    const parsed = collectionWriteSchema(collection, { partial: false }).parse(await c.req.json());
    // Publishing on create needs the distinct `publish` permission.
    if ("published_at" in parsed) assertPermission(c, "publish", collection.name);
    const doc = await createDocument(c, { config, plugins }, {
      collection,
      data: parsed,
      actor: actor(c),
      mtReview: c.req.query("review") === "mt",
    });
    return c.json({ doc: serializeDoc(doc) }, 201);
  });

  app.get("/:collection/:id", requirePermission("read"), async (c) => {
    const collection = mustCollection(c.req.param("collection"));
    const populate = c.req.query("populate")?.split(",");
    const base = await c.var.adapter.findOne({
      collection: collection.name,
      id: c.req.param("id"),
      ...(populate && { populate }),
    });
    if (!base) throw new EdgeCMSError("not_found", `${collection.name}/${c.req.param("id")} not found`);

    // `?locale=` loads that locale's own row (a sibling sharing entity_id).
    // When the variant doesn't exist yet, return `{ doc: null }` so the editor
    // can start a fresh draft for it. Non-localized collections ignore locale.
    const locale = c.req.query("locale");
    if (locale && collection.locales.length > 0 && !collection.locales.includes(locale))
      throw new EdgeCMSError("bad_request", `Unknown locale "${locale}" for "${collection.name}"`);
    if (locale && collection.locales.length > 0 && base.locale !== locale) {
      const entityId = (base.entity_id as string | undefined) ?? base.id;
      const page = await c.var.adapter.find({
        collection: collection.name,
        where: { entity_id: entityId },
        locale,
        limit: 1,
        ...(populate && { populate }),
      });
      const variant = page.docs[0];
      return c.json({ doc: variant ? serializeDoc(variant) : null });
    }
    return c.json({ doc: serializeDoc(base) });
  });

  app.patch("/:collection/:id", requirePermission("update"), async (c) => {
    const collection = mustCollection(c.req.param("collection"));
    const parsed = collectionWriteSchema(collection, { partial: true }).parse(await c.req.json());
    // Publishing via update needs the distinct `publish` permission.
    if ("published_at" in parsed) assertPermission(c, "publish", collection.name);
    const doc = await updateDocument(c, { config, plugins }, {
      collection,
      id: c.req.param("id"),
      data: parsed,
      actor: actor(c),
      mtReview: c.req.query("review") === "mt",
    });
    return c.json({ doc: serializeDoc(doc) });
  });

  app.delete("/:collection/:id", requirePermission("delete"), async (c) => {
    const collection = mustCollection(c.req.param("collection"));
    await deleteDocument(c, { config, plugins }, { collection, id: c.req.param("id"), actor: actor(c) });
    return c.body(null, 204);
  });

  // ---- Version history ----

  app.get("/:collection/:id/versions", requirePermission("read"), async (c) => {
    const collection = mustCollection(c.req.param("collection"));
    const doc = await c.var.adapter.findOne({ collection: collection.name, id: c.req.param("id") });
    if (!doc) throw new EdgeCMSError("not_found", `${collection.name}/${c.req.param("id")} not found`);
    const entityId = (doc.entity_id as string | undefined) ?? doc.id;
    const versions = await new VersionStore(c.env.DB).list(collection.name, entityId);
    return c.json({ versions });
  });

  app.get("/:collection/:id/versions/:versionId", requirePermission("read"), async (c) => {
    const collection = mustCollection(c.req.param("collection"));
    const version = await loadVersion(c.env.DB, collection.name, c.req.param("id"), c.req.param("versionId"), c);
    return c.json({ version: { ...version, snapshot: JSON.parse(version.snapshot) } });
  });

  app.post("/:collection/:id/versions/:versionId/restore", requirePermission("update"), async (c) => {
    const collection = mustCollection(c.req.param("collection"));
    const id = c.req.param("id");
    const version = await loadVersion(c.env.DB, collection.name, id, c.req.param("versionId"), c);
    const restoreBody = collectionWriteSchema(collection, { partial: true }).parse(
      strippedSnapshot(JSON.parse(version.snapshot), collection),
    );
    const doc = await updateDocument(c, { config, plugins }, { collection, id, data: restoreBody, actor: actor(c) });
    return c.json({ doc: serializeDoc(doc) });
  });

  return app;
}

/** Loads a version, 404ing if it doesn't belong to the given collection+entity. */
async function loadVersion(
  db: D1Database,
  collection: string,
  id: string,
  versionId: string,
  c: { var: { adapter: ContentEnv["Variables"]["adapter"] } },
) {
  const doc = await c.var.adapter.findOne({ collection, id });
  if (!doc) throw new EdgeCMSError("not_found", `${collection}/${id} not found`);
  const entityId = (doc.entity_id as string | undefined) ?? doc.id;
  const version = await new VersionStore(db).findById(versionId);
  if (!version || version.collection !== collection || version.entityId !== entityId)
    throw new EdgeCMSError("not_found", `Version ${versionId} not found for ${collection}/${id}`);
  return version;
}

/** Keeps only writable field values + published_at from a stored snapshot. */
function strippedSnapshot(snapshot: Record<string, unknown>, collection: ResolvedCollection): Record<string, unknown> {
  const allowed = new Set(collection.fields.map((f) => f.name));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(snapshot)) {
    if (RESERVED_KEYS.has(k) || k === "status" || k === "mt") continue;
    if (k === "published_at" || allowed.has(k)) out[k] = v;
  }
  return out;
}
