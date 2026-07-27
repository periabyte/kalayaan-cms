import { Hono } from "hono";
import type { ResolvedConfig, SchemaSnapshot, RolesConfig } from "@kalayaan/config";
import type { AIProvider, EmailProvider, Module, PaymentProvider, Plugin } from "@kalayaan/core";
import { PluginHost } from "@kalayaan/core";
import { R2Adapter } from "@kalayaan/storage-r2";
import { d1AdapterFactory, type DatabaseAdapterFactory, type HyperdriveBinding } from "./adapter.js";
import type { AuthEnv } from "./auth/middleware.js";
import type { MediaEnv } from "./routes/media.js";
import { contentRoutes, type ContentEnv } from "./routes/content.js";
import { submissionRoutes } from "./routes/submissions.js";
import { searchRoutes } from "./routes/content-search.js";
import { graphqlRoutes } from "./routes/graphql.js";
import type { VectorizeBinding } from "./ai/search-index.js";
import { adminCrudRoutes } from "./routes/admin-crud.js";
import { adminMediaRoutes, publicMediaRoutes } from "./routes/media.js";
import { adminWebhookRoutes } from "./routes/admin-webhooks.js";
import { adminUserRoutes } from "./routes/admin-users.js";
import { adminSavedFilterRoutes } from "./routes/admin-saved-filters.js";
import { adminAiRoutes } from "./routes/admin-ai.js";
import { mcpRoutes } from "./routes/mcp.js";
import { extensionRoutes } from "./routes/extensions.js";
import { authRoutes } from "./routes/auth.js";
import { schemaRoute } from "./routes/schema.js";
import { homeRoute } from "./routes/root.js";
import { WorkersAIProvider, type AiBinding } from "./ai/workers-ai-provider.js";
import { CloudflareEmailProvider, type SendEmailBinding } from "./email/cloudflare-email-provider.js";
import { errorHandler, notFound } from "./errors.js";

export type Bindings = AuthEnv["Bindings"] & {
  MEDIA: R2Bucket;
  AI?: AiBinding;
  HYPERDRIVE?: HyperdriveBinding;
  VECTORIZE?: VectorizeBinding;
  /** Cloudflare Email Sending binding (env.EMAIL). Absent = email disabled. */
  EMAIL?: SendEmailBinding;
  /** Cloudflare Turnstile secret for verifying public submissions. */
  TURNSTILE_SECRET?: string;
};

/**
 * The single Worker entry point: content API, admin API, auth, media, and
 * schema endpoint sharing adapters constructed per request from the D1 and
 * R2 bindings. Static assets (the admin SPA) are served by Cloudflare's
 * Assets binding before a request ever reaches this app — see the CLI's
 * generated wrangler.json (`run_worker_first` scoped to /api, /admin/api,
 * /media).
 */
export interface CreateAppOptions {
  /** Runtime plugins — lifecycle hooks and custom field types (see @kalayaan/core). */
  plugins?: Plugin[];
  /**
   * Modules — a `Plugin` plus build-time collections and provider factories
   * (e.g. a marketplace's `orders`/`payouts` tables + a Stripe `PaymentProvider`).
   * The CLI merges each module's `collections` into the config before this
   * runs; here they're registered alongside `plugins` for their routes/hooks/
   * fieldTypes/subjects and scanned for a `provides.payment` factory.
   */
  modules?: Module[];
  /**
   * Selects the database adapter per request. Defaults to D1. The CLI-generated
   * entry supplies a Postgres/MySQL factory (from `kalayaan/postgres`|`/mysql`)
   * only for those engines, keeping external drivers out of D1 bundles.
   */
  databaseAdapter?: DatabaseAdapterFactory;
}

export function createApp(config: ResolvedConfig, snapshot: SchemaSnapshot, options: CreateAppOptions = {}) {
  const app = new Hono<
    {
      Bindings: Bindings;
      Variables: { ai?: AIProvider; email?: EmailProvider; payment?: PaymentProvider; roles?: RolesConfig };
    } & ContentEnv &
      MediaEnv
  >();
  const plugins = new PluginHost([...(options.plugins ?? []), ...(options.modules ?? [])]);
  const makeAdapter = options.databaseAdapter ?? d1AdapterFactory;

  app.use("*", async (c, next) => {
    const { adapter, close } = await makeAdapter(c.env, snapshot);
    c.set("adapter", adapter);
    c.set("storage", new R2Adapter(c.env.MEDIA));
    // The config's role→permission matrix, read by the auth middleware to build
    // each actor's ability. Set once here so every route group sees it.
    c.set("roles", config.roles);
    if (c.env.AI) c.set("ai", new WorkersAIProvider(c.env.AI, config.ai.models));
    // Email is optional: enabled only when a from-address is configured AND the
    // send_email binding is present. Invites degrade to a copyable link otherwise.
    if (c.env.EMAIL && config.email.from)
      c.set("email", new CloudflareEmailProvider(c.env.EMAIL, config.email as { from: string; fromName?: string | null; replyTo?: string | null }));
    const payment = plugins.payment(c.env as Record<string, unknown>);
    if (payment) c.set("payment", payment);
    try {
      await next();
    } finally {
      // External connections (Postgres/MySQL) are closed after the response;
      // D1 has no connection to release, so `close` is undefined there.
      if (close) c.executionCtx.waitUntil(close());
    }
  });

  // Config-generated GraphQL read API, behind the `graphql` flag.
  if (config.graphql) app.route("/api/graphql", graphqlRoutes(config));
  // Registered before the /:collection catch-all so "search" isn't treated
  // as a collection name.
  app.route("/api/v1/search", searchRoutes(config));
  // Public anonymous submission (POST) — registered before the read routes so
  // its POST /:collection handler is matched for submissions.
  app.route("/api/v1", submissionRoutes(config, plugins));
  app.route("/api/v1", contentRoutes(config));
  app.route("/media", publicMediaRoutes());
  // Registered before the /:collection catch-all so these literal segments
  // never get treated as collection names.
  app.route("/admin/api/auth", authRoutes());
  app.route("/admin/api/schema", schemaRoute(config, Object.keys(plugins.fieldTypes()), plugins.subjects()));
  app.route("/admin/api/media", adminMediaRoutes(config));
  app.route("/admin/api/webhooks", adminWebhookRoutes());
  app.route("/admin/api/users", adminUserRoutes(config));
  app.route("/admin/api/saved-filters", adminSavedFilterRoutes());
  app.route("/admin/api/ai", adminAiRoutes(config));
  app.route("/admin/api", adminCrudRoutes(config, plugins));
  // Agent-facing Model Context Protocol server (API-key authenticated).
  app.route("/mcp", mcpRoutes(config));
  // Business-specific endpoints registered by plugins (Plugin.routes). Mounted
  // last among API groups, before the catch-all root, so it never shadows a
  // built-in route.
  app.route("/api/ext", extensionRoutes(config, plugins));
  // Bare root — a small HTML page for browser navigations (falls through to
  // the JSON 404 for non-HTML clients), since Kalayaan is otherwise headless.
  app.get("/", homeRoute(config));

  app.onError(errorHandler);
  app.notFound(notFound);

  return app;
}
