import { Hono } from "hono";
import type { ResolvedConfig } from "@kalayaan/config";

/** The admin UI's single source of truth: fetched once, drives every screen. */
export function schemaRoute(config: ResolvedConfig, customFieldTypes: string[] = []) {
  const app = new Hono();
  app.get("/", (c) =>
    c.json({
      name: config.name,
      ui: config.ui,
      auth: { providers: config.auth.providers },
      ai: { enabled: config.ai.enabled, features: config.ai.features },
      // Capability flags so the admin renders features from the server rather
      // than hard-coding which endpoints exist.
      features: {
        versions: true,
        webhooks: true,
        savedFilters: true,
        mtReview: true,
        semanticSearch: config.ai.enabled && config.ai.features.includes("semantic-search"),
        statuses: ["draft", "published", "scheduled", "mt-review"],
        // Plugin-registered custom field types the server can validate, so the
        // admin can tell a known custom type from an unrecognized one.
        customFieldTypes,
      },
      collections: config.collections.map((c2) => ({
        name: c2.name,
        titleField: c2.titleField,
        versioning: c2.versioning,
        locales: c2.locales,
        singleton: c2.singleton,
        fields: c2.fields.map((f) => ({ name: f.name, ...f.def })),
      })),
    }),
  );
  return app;
}
