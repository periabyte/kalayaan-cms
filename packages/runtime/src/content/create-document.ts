import { EdgeCMSError, PluginHost, type Doc } from "@kalayaan/core";
import type { AIProvider } from "@kalayaan/core";
import type { ResolvedCollection, ResolvedConfig } from "@kalayaan/config";
import { computeStatus } from "../status.js";
import { VersionStore, type VersionStatus } from "../versions/version-store.js";
import { dispatch, type WaitUntilCtx } from "../webhooks/dispatch.js";
import { searchServiceFrom } from "../ai/search-service.js";
import type { VectorizeBinding } from "../ai/search-index.js";
import type { ContentEnv } from "../routes/content.js";

/**
 * The single document-create pipeline, shared by the authenticated admin CRUD
 * API and the public submission endpoint: custom-field validation →
 * beforeChange → adapter.create → version snapshot → webhooks → reindex →
 * after-hooks. Callers own auth, request validation, and the publish decision.
 */

/** Minimal context shape the create pipeline reads from. */
export type WriteCtx = {
  var: { adapter: ContentEnv["Variables"]["adapter"]; ai?: AIProvider };
  env: { DB: D1Database; VECTORIZE?: VectorizeBinding };
  executionCtx: WaitUntilCtx;
};

export interface CreateDocumentDeps {
  config: ResolvedConfig;
  plugins: PluginHost;
}

export interface CreateDocumentInput {
  collection: ResolvedCollection;
  /** Already schema-parsed writable data (may include `published_at`). */
  data: Record<string, unknown>;
  actor: { type: string; id: string | null };
  /** Marks the recorded version as machine-translation review (see `?review=mt`). */
  mtReview?: boolean;
}

export async function createDocument(
  c: WriteCtx,
  deps: CreateDocumentDeps,
  input: CreateDocumentInput,
): Promise<Doc> {
  const { config, plugins } = deps;
  const { collection, actor } = input;
  await enforceSingleton(c, collection, input.data);
  const data = applyCustomFieldTypes(plugins, collection, input.data);
  const body = await plugins.beforeChange({
    collection: collection.name,
    operation: "create",
    data,
    actor,
  });
  const doc = await c.var.adapter.create(collection.name, body);
  const status: VersionStatus = input.mtReview ? "mt-review" : computeStatus(doc);
  await new VersionStore(c.env.DB).record({ collection: collection.name, doc, status, createdBy: actor.id });
  fireWriteEvents(c, collection.name, doc, body);
  reindex(config, c, collection.name, doc);
  const hookCtx = { collection: collection.name, operation: "create" as const, data: doc as Record<string, unknown>, actor };
  await plugins.afterChange(hookCtx);
  if (computeStatus(doc) === "published") await plugins.afterPublish(hookCtx);
  return doc;
}

/**
 * A singleton collection holds exactly one entry per locale (About/Home/Contact).
 * Reject a second create for a locale that already has one — the caller should
 * update the existing entry instead. Enforced here so the API is as protected as
 * the admin UI.
 */
async function enforceSingleton(
  c: WriteCtx,
  collection: ResolvedCollection,
  data: Record<string, unknown>,
): Promise<void> {
  if (!collection.singleton) return;
  const localized = collection.locales.length > 0;
  const locale = localized ? ((data.locale as string | undefined) ?? collection.locales[0]) : undefined;
  const existing = await c.var.adapter.find({
    collection: collection.name,
    limit: 1,
    ...(locale !== undefined && { locale }),
  });
  if (existing.docs.length > 0) {
    throw new EdgeCMSError(
      "conflict",
      `"${collection.name}" is a single-page collection and already has an entry${locale ? ` for locale "${locale}"` : ""}. Edit the existing entry instead of creating a new one.`,
    );
  }
}

/**
 * Run each present custom field's plugin-registered validator (the write-path
 * enforcement link for plugin field types). The validator's return value is
 * what gets stored. Mutates and returns `data`.
 */
export function applyCustomFieldTypes(
  plugins: PluginHost,
  collection: ResolvedCollection,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const types = plugins.fieldTypes();
  for (const { name, def } of collection.fields) {
    if (def.type !== "custom" || !(name in data)) continue;
    const validate = types[def.fieldType];
    if (!validate)
      throw new EdgeCMSError("validation_failed", `No validator registered for custom field type "${def.fieldType}"`, [
        { path: name, message: `unknown custom field type "${def.fieldType}"` },
      ]);
    try {
      data[name] = validate(data[name]);
    } catch (err) {
      throw new EdgeCMSError("validation_failed", err instanceof Error ? err.message : `Invalid value for "${name}"`, [
        { path: name, message: err instanceof Error ? err.message : "invalid value" },
      ]);
    }
  }
  return data;
}

/**
 * Fire webhook events for a write. `document.updated` always; additionally
 * `document.published` when the request set `published_at` and the resulting
 * doc is published. Fire-and-forget — never blocks or fails the response.
 */
export function fireWriteEvents(
  c: { env: { DB: D1Database }; executionCtx: WaitUntilCtx },
  collection: string,
  doc: Doc,
  body: Record<string, unknown>,
): void {
  const at = Date.now();
  const status = computeStatus(doc);
  dispatch(c.env.DB, c.executionCtx, "document.updated", { event: "document.updated", collection, id: doc.id, status, doc, at });
  if ("published_at" in body && status === "published") {
    dispatch(c.env.DB, c.executionCtx, "document.published", { event: "document.published", collection, id: doc.id, status, doc, at });
  }
}

/**
 * Fire-and-forget: re-embed a written document into the search index when
 * semantic search is configured (upsert if published, remove otherwise).
 */
export function reindex(config: ResolvedConfig, c: WriteCtx, collection: string, doc: Doc): void {
  if (!config.ai.enabled || !config.ai.features.includes("semantic-search")) return;
  const service = searchServiceFrom(config, c.var.adapter, c.var.ai, c.env.VECTORIZE);
  if (!service.semanticEnabled) return;
  c.executionCtx.waitUntil(service.indexDocument(collection, doc).catch(() => undefined));
}

export function deindex(config: ResolvedConfig, c: WriteCtx, id: string): void {
  if (!config.ai.enabled || !config.ai.features.includes("semantic-search")) return;
  const service = searchServiceFrom(config, c.var.adapter, c.var.ai, c.env.VECTORIZE);
  if (!service.semanticEnabled) return;
  c.executionCtx.waitUntil(service.removeDocument(id).catch(() => undefined));
}
