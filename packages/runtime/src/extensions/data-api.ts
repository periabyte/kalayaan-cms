import { EdgeCMSError, type Action, type CollectionApi, type DataApi, type Doc, type DocRef, type Page, type PluginHost, type Query, type RouteActor } from "@kalayaan/core";
import type { ResolvedCollection, ResolvedConfig } from "@kalayaan/config";
import { createDocument, updateDocument, deleteDocument, type WriteCtx } from "../content/create-document.js";

/**
 * The RBAC- and lifecycle-hook-aware {@link DataApi} handed to plugin route
 * handlers via `RouteContext.db`. Every collection access is checked against
 * the requesting actor's {@link RouteActor.ability} — same decision the admin
 * CRUD API makes — so a custom endpoint can't become a permission bypass.
 * Writes run through the same `createDocument`/`updateDocument`/`deleteDocument`
 * pipeline as the built-in API (custom field types, plugin hooks, versioning,
 * webhooks, reindexing all apply identically).
 */
export function buildDataApi(c: WriteCtx, config: ResolvedConfig, plugins: PluginHost, actor: RouteActor): DataApi {
  return new DataApiImpl(c, config, plugins, actor);
}

class DataApiImpl implements DataApi {
  constructor(
    private readonly c: WriteCtx,
    private readonly config: ResolvedConfig,
    private readonly plugins: PluginHost,
    private readonly actor: RouteActor,
  ) {}

  collection(name: string): CollectionApi {
    const def = this.config.collections.find((col) => col.name === name);
    if (!def) throw new EdgeCMSError("not_found", `Unknown collection "${name}"`);
    return new CollectionApiImpl(this.c, this.config, this.plugins, this.actor, def);
  }

  async tx<T>(fn: (db: DataApi) => Promise<T>): Promise<T> {
    return this.c.var.adapter.transaction(async (txAdapter) => {
      // Hono's Context exposes env/executionCtx/var via accessors, so a plain
      // object spread of `this.c` silently drops them — read each explicitly.
      const txCtx: WriteCtx = {
        var: { adapter: txAdapter, ...(this.c.var.ai !== undefined && { ai: this.c.var.ai }) },
        env: this.c.env,
        executionCtx: this.c.executionCtx,
      };
      return fn(new DataApiImpl(txCtx, this.config, this.plugins, this.actor));
    });
  }
}

class CollectionApiImpl implements CollectionApi {
  constructor(
    private readonly c: WriteCtx,
    private readonly config: ResolvedConfig,
    private readonly plugins: PluginHost,
    private readonly actor: RouteActor,
    private readonly def: ResolvedCollection,
  ) {}

  async find(query: Omit<Query, "collection">): Promise<Page> {
    this.assertCan("read");
    return this.c.var.adapter.find({ ...query, collection: this.def.name });
  }

  async findOne(ref: Omit<DocRef, "collection">): Promise<Doc | null> {
    this.assertCan("read");
    return this.c.var.adapter.findOne({ ...ref, collection: this.def.name });
  }

  async create(data: Record<string, unknown>): Promise<Doc> {
    this.assertCan("create");
    if ("published_at" in data) this.assertCan("publish");
    return createDocument(this.c, { config: this.config, plugins: this.plugins }, {
      collection: this.def,
      data,
      actor: { type: this.actor.type, id: this.actor.id },
    });
  }

  async update(id: string, patch: Record<string, unknown>): Promise<Doc> {
    this.assertCan("update");
    if ("published_at" in patch) this.assertCan("publish");
    return updateDocument(this.c, { config: this.config, plugins: this.plugins }, {
      collection: this.def,
      id,
      data: patch,
      actor: { type: this.actor.type, id: this.actor.id },
    });
  }

  async delete(id: string): Promise<void> {
    this.assertCan("delete");
    await deleteDocument(this.c, { config: this.config, plugins: this.plugins }, {
      collection: this.def,
      id,
      actor: { type: this.actor.type, id: this.actor.id },
    });
  }

  private assertCan(action: Action): void {
    if (!this.actor.ability.can(action, this.def.name))
      throw new EdgeCMSError("forbidden", `Not permitted to ${action} "${this.def.name}"`);
  }
}
